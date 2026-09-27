import { describe, expect, it } from 'vitest';
import { AGENT_PAGE_KEYS, resolvePageLink, splitIntoBubbles, stripUrlsFromReply, withAgentUtm } from './agentLinks';

describe('withAgentUtm', () => {
  it('marca el link con canal, medio y campaña del agente', () => {
    const url = withAgentUtm('https://mansionplayroom.cl/eventos/aniversario', 'instagram');
    expect(url).toBe('https://mansionplayroom.cl/eventos/aniversario?utm_source=instagram&utm_medium=dm&utm_campaign=agente');
  });

  it('respeta una campaña distinta (recordatorio)', () => {
    expect(withAgentUtm('https://mansionplayroom.cl/eventos/x', 'whatsapp', 'agente-recordatorio')).toContain('utm_campaign=agente-recordatorio');
  });
});

describe('resolvePageLink', () => {
  it('arma el botón de una página de la lista, con UTM', () => {
    const link = resolvePageLink('/disfraces', 'instagram');
    expect(link?.title).toBe('Ideas de disfraz');
    expect(link?.url).toMatch(/\/disfraces\?utm_source=instagram/);
  });

  it('nunca arma un link con una ruta que no está en la lista', () => {
    expect(resolvePageLink('/admin', 'instagram')).toBeNull();
    expect(resolvePageLink('', 'instagram')).toBeNull();
  });

  it('todos los títulos de botón caben en los 20 caracteres de Meta', () => {
    for (const key of AGENT_PAGE_KEYS) {
      expect(resolvePageLink(key, 'whatsapp')!.title.length).toBeLessThanOrEqual(20);
    }
  });
});

// Regla del dueño (27/09): nunca una URL a la vista en un mensaje.
describe('stripUrlsFromReply', () => {
  it('saca un link de compra y avisa que era del evento', () => {
    const r = stripUrlsFromReply('¡Dale! Compra acá: https://mansionplayroom.cl/eventos/aniversario');
    expect(r.text).toBe('¡Dale! Compra acá');
    expect(r.eventLink).toBe(true);
  });

  it('saca el dominio sin https (el recordatorio viejo)', () => {
    const r = stripUrlsFromReply('Cuando quieras retomamos 💜 mientras tanto puedes ver fechas y entradas directo en mansionplayroom.cl/entradas');
    expect(r.text).not.toContain('mansionplayroom');
    expect(r.eventLink).toBe(true);
  });

  it('reconoce una página del sitio para convertirla en botón', () => {
    const r = stripUrlsFromReply('Mira las ideas en https://mansionplayroom.cl/disfraces.');
    expect(r.text).not.toContain('http');
    expect(r.pageKey).toBe('/disfraces');
  });

  it('no toca un texto sin links', () => {
    const r = stripUrlsFromReply('La Dúo está en $45.000 💜');
    expect(r).toEqual({ text: 'La Dúo está en $45.000 💜', eventLink: false, pageKey: null });
  });
});

describe('splitIntoBubbles', () => {
  it('parte por líneas en blanco', () => {
    expect(splitIntoBubbles('¡Buenísimo! 💜\n\nLa Dúo está en $45.000\n\n¿se animan?')).toEqual(['¡Buenísimo! 💜', 'La Dúo está en $45.000', '¿se animan?']);
  });

  it('nunca manda más de 3 burbujas: el resto va en la última', () => {
    const bubbles = splitIntoBubbles('a\n\nb\n\nc\n\nd');
    expect(bubbles).toEqual(['a', 'b', 'c\n\nd']);
  });

  it('un texto de un solo bloque queda como una sola burbuja', () => {
    expect(splitIntoBubbles('hola, ¿cómo estás?')).toEqual(['hola, ¿cómo estás?']);
  });
});
