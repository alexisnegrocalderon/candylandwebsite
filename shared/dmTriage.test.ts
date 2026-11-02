import { describe, expect, it } from 'vitest';
import { asksAddress, classifyAttachments, isDmSpam, isReactionOnly } from './dmTriage';

describe('asksAddress', () => {
  it('detecta preguntas por la dirección', () => {
    for (const t of ['Cuál es la dirección?', 'donde queda', 'Dónde es la fiesta', 'como llego', 'me pasas la dirección porfa', 'ubicación?', 'en qué sector es']) expect(asksAddress(t)).toBe(true);
  });
  it('no confunde con otras consultas', () => {
    for (const t of ['cuánto cuesta la entrada', 'hola', 'quiero ir con mi pareja']) expect(asksAddress(t)).toBe(false);
  });
});

describe('isDmSpam', () => {
  it('detecta publicidad y spam', () => {
    for (const t of ['Aumenta tu cuenta con 10k seguidores reales', 'gana dinero desde casa https://bit.ly/x', 'Te ofrezco mis servicios de gestión de redes', 'invierte en crypto hoy']) expect(isDmSpam(t)).toBe(true);
  });
  it('un cliente real que habla de la fiesta no es spam', () => {
    for (const t of ['quiero entradas, mi insta es www.algo.com', 'hola cuánto vale la entrada?', 'hola']) expect(isDmSpam(t)).toBe(false);
  });
});

describe('isReactionOnly', () => {
  it('solo emojis, risas o signos', () => {
    for (const t of ['😂😂', 'jajaja', 'JSJSJS', 'xd', '.', '❤️🔥']) expect(isReactionOnly(t)).toBe(true);
  });
  it('una palabra con contenido no es reacción', () => {
    for (const t of ['precio', 'info', 'hola', 'ok', 'jajaja cuanto sale']) expect(isReactionOnly(t)).toBe(false);
  });
});

describe('classifyAttachments', () => {
  it('reels, historias y stickers compartidos son ruido', () => {
    expect(classifyAttachments([{ type: 'ig_reel' }])).toBe('share');
    expect(classifyAttachments([{ type: 'share' }, { type: 'like_heart' }])).toBe('share');
  });
  it('fotos, audios y archivos los ve una persona', () => {
    expect(classifyAttachments([{ type: 'image' }])).toBe('media');
    expect(classifyAttachments([{ type: 'audio' }])).toBe('media');
    expect(classifyAttachments(null)).toBe('other');
  });
});
