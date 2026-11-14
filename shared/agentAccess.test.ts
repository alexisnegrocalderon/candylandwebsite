import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { accessKeyForSlug, AGENT_ACCESS, buildCheckoutPath, buildColabCheckoutPath, cleanQuantity, inferAccessKey, accessProblem, detectGender, replyNeedsBuyButton, safeAccessReply } from './agentAccess';

describe('agentAccess', () => {
  it('traduce el slug de la entrada a la llave del checkout', () => {
    expect(accessKeyForSlug('duo')).toBe('pareja');
    expect(accessKeyForSlug('duo_mujeres')).toBe('dos-mujeres');
    expect(accessKeyForSlug('soltero')).toBe('soltero');
    expect(accessKeyForSlug('grupo')).toBe('');
    expect(accessKeyForSlug(null)).toBe('');
  });
  it('arma la ruta express del checkout', () => {
    expect(buildCheckoutPath('aniversario', 'pareja')).toBe('/checkout/aniversario?rapida=1&op=pareja');
    expect(buildCheckoutPath('aniversario', 'pareja', 2)).toBe('/checkout/aniversario?rapida=1&op=pareja&items=duo:2');
  });
  it('arma la ruta del checkout de la colab con items y quien', () => {
    expect(buildColabCheckoutPath('playmore', 'dos-hombres')).toBe('/checkout/playmore?items=duo:1&quien=dos-hombres');
    expect(buildColabCheckoutPath('playmore', 'trio', 2)).toBe('/checkout/playmore?items=trio:2&quien=trio');
    expect(buildColabCheckoutPath('playmore', 'soltera')).toBe('/checkout/playmore?items=soltera:1&quien=soltera');
  });
  it('limpia la cantidad', () => {
    expect(cleanQuantity(0)).toBe(1);
    expect(cleanQuantity('3')).toBe(3);
    expect(cleanQuantity(99)).toBe(6);
    expect(cleanQuantity(undefined)).toBe(1);
  });
  it('deduce el acceso del texto solo si es inequívoco', () => {
    expect(inferAccessKey('somos pareja, cuánto sale?')).toBe('pareja');
    expect(inferAccessKey('Voy sola, me da nervios')).toBe('soltera');
    expect(inferAccessKey('somos dos mujeres')).toBe('dos-mujeres');
    expect(inferAccessKey('somos dos hombres')).toBe('dos-hombres');
    expect(inferAccessKey('vamos en grupo de 4 personas')).toBe('');
    expect(inferAccessKey('hola cuánto vale?')).toBe('');
    expect(inferAccessKey('pareja o voy sola, no sé')).toBe('');
  });
});

describe('sincronía con el checkout', () => {
  // Las llaves y slugs de acá tienen que ser los de ACCESO_OPTIONS en el checkout:
  // si alguien renombra uno allá, el botón directo dejaría de elegir el acceso.
  it('cada acceso del agente existe igual en ACCESO_OPTIONS', () => {
    const checkout = readFileSync(new URL('../client/src/pages/Checkout.tsx', import.meta.url), 'utf8');
    for (const a of AGENT_ACCESS) {
      expect(checkout).toContain(`key: '${a.key}', slug: '${a.slug}'`);
    }
  });
});

describe('género y acceso correcto', () => {
  it('«sola» es mujer, «solo» es hombre, y lo demás no se adivina', () => {
    expect(detectGender(['voy sola'])).toBe('f');
    expect(detectGender(['soy mujer'])).toBe('f');
    expect(detectGender(['solo'])).toBe('m');
    expect(detectGender(['Solo.'])).toBe('m');
    expect(detectGender(['voy solo'])).toBe('m');
    expect(detectGender(['soy hombre y voy con una chica'])).toBe('m');
    expect(detectGender(['hola', 'quiero ir'])).toBeNull();
    expect(detectGender(['voy yo no más', 'sin compañía'])).toBeNull();
    expect(detectGender(['quiero una sola entrada'])).toBeNull();
    expect(detectGender(['solo quiero saber el precio'])).toBeNull();
    expect(detectGender(['voy sola', 'mi amigo va solo'])).toBe('f');
    expect(detectGender(['voy sola', 'soy hombre'])).toBeNull();
  });

  it('nunca ofrece la Soltera sin que sea mujer', () => {
    const man = accessProblem('soltera', ['hola', 'solo'], { playmore: true });
    expect(man?.kind).toBe('woman_access_for_man');
    expect(man?.instruction).toContain('accessOption=pareja');
    expect(accessProblem('soltera', ['solo'], { playmore: false })?.instruction).toContain('accessOption=soltero');
    expect(accessProblem('soltera', ['voy yo no más'], { playmore: true })?.kind).toBe('gender_unknown');
    expect(accessProblem('soltera', ['voy sola'], { playmore: true })).toBeNull();
    expect(accessProblem('pareja', ['solo'], { playmore: true })).toBeNull();
    expect(accessProblem('', ['hola'], { playmore: true })).toBeNull();
  });

  it('«Voy solo» en PLAYMORE pide haber dicho que tiene el código de comunidad', () => {
    expect(accessProblem('soltero', ['voy solo'], { playmore: true })?.kind).toBe('solo_needs_code');
    expect(accessProblem('soltero', ['voy solo', 'tengo el código de comunidad'], { playmore: true })).toBeNull();
    expect(accessProblem('soltero', ['voy solo'], { playmore: false })).toBeNull();
  });

  it('el mensaje seguro de último recurso nunca nombra la Soltera ni un precio', () => {
    for (const kind of ['gender_unknown', 'woman_access_for_man', 'solo_needs_code'] as const) {
      for (const playmore of [true, false]) {
        const safe = safeAccessReply({ kind, instruction: '' }, { playmore });
        expect(safe.reply).not.toMatch(/soltera|\$\d/i);
        expect(safe.accessOption).not.toBe('soltera');
      }
    }
    expect(safeAccessReply({ kind: 'gender_unknown', instruction: '' }, { playmore: true }).accessOption).toBe('');
    expect(safeAccessReply({ kind: 'woman_access_for_man', instruction: '' }, { playmore: true }).accessOption).toBe('pareja');
  });

  it('una respuesta con precio siempre lleva el botón, salvo que ya haya comprado', () => {
    expect(replyNeedsBuyButton('La Pareja está en $25.000 esta tanda', 'cuánto sale')).toBe(true);
    expect(replyNeedsBuyButton('Qué bueno, te esperamos 💜', 'listo')).toBe(false);
    expect(replyNeedsBuyButton('Te esperamos, la entrada costó $12.500', 'ya compré!')).toBe(false);
  });

  it('la ficha «sola/o» no hace deducir la Soltera', () => {
    expect(inferAccessKey('hola', 'Viene sola/o, primera vez')).toBe('');
    expect(inferAccessKey('quiero una sola entrada')).toBe('');
    expect(inferAccessKey('voy sola')).toBe('soltera');
  });
});
