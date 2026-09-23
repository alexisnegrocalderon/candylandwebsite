import { describe, expect, it } from 'vitest';
import { buildAutomationReplyText, matchesKeyword, splitAutomationLink } from './instagramAutomations';

describe('matchesKeyword', () => {
  it('calza sin importar mayúsculas ni tildes', () => {
    expect(matchesKeyword('me encanta el Disfraz!', 'disfraz')).toBe(true);
    expect(matchesKeyword('DISFRAZ ya llego', 'disfraz')).toBe(true);
    expect(matchesKeyword('vengo con disfraz', 'DISFRAZ')).toBe(true);
    expect(matchesKeyword('vengo con disfrás', 'disfraz')).toBe(false);
  });

  it('es "contiene", no palabra exacta', () => {
    expect(matchesKeyword('quiero el descuento20 porfa', 'descuento20')).toBe(true);
  });

  it('no calza si la palabra no está', () => {
    expect(matchesKeyword('hola, cuánto vale la entrada?', 'disfraz')).toBe(false);
  });
});

describe('buildAutomationReplyText', () => {
  it('manda el mensaje tal cual cuando no hay código de descuento', () => {
    const text = buildAutomationReplyText({ replyMessage: 'Acá tienes el link: mansionplayroom.cl/blog', discountCode: null });
    expect(text).toBe('Acá tienes el link: mansionplayroom.cl/blog');
  });

  it('reemplaza {{codigo}} por el código real cuando la automatización tiene uno', () => {
    const text = buildAutomationReplyText({ replyMessage: 'Tu código es {{codigo}}, úsalo al comprar 💜', discountCode: 'AUTOAB12' });
    expect(text).toBe('Tu código es AUTOAB12, úsalo al comprar 💜');
  });

  it('reemplaza todas las apariciones del placeholder', () => {
    const text = buildAutomationReplyText({ replyMessage: '{{codigo}} - repite: {{codigo}}', discountCode: 'X1' });
    expect(text).toBe('X1 - repite: X1');
  });

  it('reemplaza {{producto}} cuando la automatización regala un producto', () => {
    const text = buildAutomationReplyText(
      { replyMessage: 'Tu código {{codigo}} te regala {{producto}} 🍹', discountCode: 'AUTOAB12' },
      { productName: '1 Piscola' },
    );
    expect(text).toBe('Tu código AUTOAB12 te regala 1 Piscola 🍹');
  });

  it('reemplaza {{link}} con el link ya resuelto', () => {
    const text = buildAutomationReplyText(
      { replyMessage: 'Cómpralo acá: {{link}}', discountCode: null },
      { link: 'https://mansionplayroom.cl/eventos/aniversario' },
    );
    expect(text).toBe('Cómpralo acá: https://mansionplayroom.cl/eventos/aniversario');
  });

  it('ignora los placeholders que no vienen resueltos', () => {
    const text = buildAutomationReplyText({ replyMessage: 'Hola {{producto}} {{link}}', discountCode: null });
    expect(text).toBe('Hola {{producto}} {{link}}');
  });
});

describe('splitAutomationLink', () => {
  it('saca {{link}} del texto y lo devuelve como buttonUrl cuando hay un link resuelto', () => {
    const result = splitAutomationLink(
      { replyMessage: 'Tu código {{codigo}} te regala {{producto}} 🍹 Cómpralo acá: {{link}}', discountCode: 'AUTOXY99' },
      { productName: '1 Piscola', link: 'https://mansionplayroom.cl/eventos/aniversario?code=AUTOXY99' },
    );
    expect(result.text).toBe('Tu código AUTOXY99 te regala 1 Piscola 🍹 Cómpralo acá:');
    expect(result.buttonUrl).toBe('https://mansionplayroom.cl/eventos/aniversario?code=AUTOXY99');
  });

  it('deja buttonUrl null y el texto igual cuando el mensaje no usa {{link}}', () => {
    const result = splitAutomationLink(
      { replyMessage: 'Solo un mensaje de texto, sin link.', discountCode: null },
      { link: 'https://mansionplayroom.cl/eventos/aniversario' },
    );
    expect(result.text).toBe('Solo un mensaje de texto, sin link.');
    expect(result.buttonUrl).toBeNull();
  });

  it('deja buttonUrl null si {{link}} está en el mensaje pero no hay ningún link resuelto', () => {
    const result = splitAutomationLink({ replyMessage: 'Cómpralo acá: {{link}}', discountCode: null });
    expect(result.text).toBe('Cómpralo acá: ');
    expect(result.buttonUrl).toBeNull();
  });

  it('limpia los saltos de línea que quedan sueltos alrededor del {{link}} sacado', () => {
    const result = splitAutomationLink(
      { replyMessage: 'Hola!\n\n{{link}}\n\nNos vemos 🎉', discountCode: null },
      { link: 'https://mansionplayroom.cl/eventos/aniversario' },
    );
    expect(result.text).toBe('Hola!\n\nNos vemos 🎉');
    expect(result.buttonUrl).toBe('https://mansionplayroom.cl/eventos/aniversario');
  });
});
