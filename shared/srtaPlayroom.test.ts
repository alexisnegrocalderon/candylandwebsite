import { describe, expect, it } from 'vitest';
import { DEFAULT_SRTA_PERSONALITY, SRTA_EXAMPLES, chileanize, findNonChilean, srtaPromptBlock } from './srtaPlayroom';
import { DEFAULT_INSTAGRAM_AGENT_CONFIG, normalizeInstagramAgentConfig } from './instagramAgentConfig';
import { DEFAULT_WHATSAPP_AGENT_CONFIG, normalizeWhatsAppAgentConfig } from './whatsappAgentConfig';
import { DEFAULT_HOOKS, FOLLOW_INVITE, LEGACY_DEFAULT_HOOKS } from './igEngagement';

describe('el filtro chileno', () => {
  it('pilla el voseo, los argentinismos y los mexicanismos', () => {
    expect(findNonChilean('¿Vos tenés ganas de venir?')).toEqual(expect.arrayContaining(['vos', 'tenés']));
    expect(findNonChilean('Che, es re lindo')).toEqual(expect.arrayContaining(['che', 're (como «muy»)']));
    for (const t of ['¡Dale!', 'Genial', 'Es copado', 'Bárbaro', 'Joya', 'Contame', 'Decime', 'Te late?', 'ahorita', 'Está chido']) {
      expect(findNonChilean(t), t).not.toEqual([]);
    }
  });

  it('no toca el español de Chile', () => {
    for (const t of [
      '¿Te tinca venir? Es bacán, regio, al tiro y harto entretenido',
      'Dale una mirada a la guía 💜',
      '¿Vienes en pareja, en grupo o por tu cuenta?',
      'La chica rebuena, la regla, el recinto, cerca de Providencia',
      'Te dejo acá abajo el botón ✨',
    ]) {
      expect(findNonChilean(t), t).toEqual([]);
      expect(chileanize(t)).toBe(t);
    }
  });

  it('corrige respetando las mayúsculas', () => {
    expect(chileanize('¡Dale! Toca el botón de abajo')).toBe('¡Perfecto! Toca el botón de abajo');
    expect(chileanize('Che, ¿vos tenés ganas de venir? Es re lindo')).toBe('¿Tú tienes ganas de venir? Es muy lindo');
    expect(chileanize('¡Genial! Contame si venís')).toBe('¡Bacán! Cuéntame si vienes');
    expect(chileanize('¿Te late venir ahorita?')).toBe('¿Te tinca venir al tiro?');
  });
});

describe('la voz de la Srta. Playroom', () => {
  it('el bloque del prompt trae la personalidad, las reglas de chileno y (si se pide) los ejemplos', () => {
    const block = srtaPromptBlock('', { examples: true });
    expect(block).toContain('Srta. Playroom');
    expect(block).toContain('Tutea con "tú"');
    expect(block).toContain('EJEMPLOS DE LA SRTA. PLAYROOM');
    expect(srtaPromptBlock('Personalidad propia')).toContain('Personalidad propia');
  });

  it('es honesta si le preguntan si es una IA, sin decir que es una persona', () => {
    expect(DEFAULT_SRTA_PERSONALITY).toContain('host virtual');
    expect(DEFAULT_SRTA_PERSONALITY).toContain('Nunca digas que eres una persona');
  });

  it('sus ejemplos y todos los textos fijos están en chileno', () => {
    const lines = SRTA_EXAMPLES.split('\n').filter((l) => l.startsWith('Srta.:'));
    expect(lines.length).toBeGreaterThanOrEqual(8);
    const fixed = [
      ...lines,
      DEFAULT_INSTAGRAM_AGENT_CONFIG.handoffMessage, DEFAULT_INSTAGRAM_AGENT_CONFIG.thanksMessage, DEFAULT_INSTAGRAM_AGENT_CONFIG.followUpMessage,
      DEFAULT_WHATSAPP_AGENT_CONFIG.welcomeMessage, DEFAULT_WHATSAPP_AGENT_CONFIG.followUpMessage,
      ...DEFAULT_HOOKS, FOLLOW_INVITE,
    ];
    for (const t of fixed) expect(findNonChilean(t), t).toEqual([]);
  });

  it('no asume el género en las preguntas por defecto', () => {
    for (const t of [...DEFAULT_HOOKS, ...SRTA_EXAMPLES.split('\n')]) expect(t, t).not.toMatch(/solo\/a|sola\/o|vienes sola/i);
  });
});

describe('los textos guardados de antes', () => {
  it('los mensajes fijos por defecto de antes pasan a los nuevos; los escritos a mano se respetan', () => {
    const old = normalizeInstagramAgentConfig({
      thanksMessage: 'Un gusto y cualquier otra cosa que necesites estamos aquí para poder ayudar',
      handoffMessage: 'Mensaje propio del dueño',
      hooks: LEGACY_DEFAULT_HOOKS,
    });
    expect(old.thanksMessage).toBe(DEFAULT_INSTAGRAM_AGENT_CONFIG.thanksMessage);
    expect(old.handoffMessage).toBe('Mensaje propio del dueño');
    expect(old.hooks).toEqual(DEFAULT_HOOKS);
    expect(old.personality).toBe(DEFAULT_SRTA_PERSONALITY);
    expect(normalizeInstagramAgentConfig({ hooks: ['Mi enganche'] }).hooks).toEqual(['Mi enganche']);
    expect(normalizeWhatsAppAgentConfig({ followUpMessage: 'Cuando quieras retomamos 💜 mientras tanto puedes ver fechas y entradas acá abajo 👇' }).followUpMessage)
      .toBe(DEFAULT_WHATSAPP_AGENT_CONFIG.followUpMessage);
  });
});
