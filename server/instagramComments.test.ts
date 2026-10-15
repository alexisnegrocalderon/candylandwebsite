import { describe, expect, it } from 'vitest';
import { finalizeCommentReply, finalizeCommentDm, buildCommentPrompt, buildOwnCommentPrompt, normalizeDmButton, COMMENT_MAX_CHARS } from './instagramComments';

describe('finalizeCommentReply', () => {
  it('saca links, rayas largas y exclamaciones en cadena', () => {
    const out = finalizeCommentReply('¡¡Gracias!! — mira https://mansionplayroom.cl/entradas 😍');
    expect(out).not.toMatch(/https?:|mansionplayroom|—|!!/);
    expect(out).toContain('😍');
  });
  it('recorta a un largo de comentario sin cortar palabras', () => {
    const out = finalizeCommentReply('palabra '.repeat(100));
    expect(out.length).toBeLessThanOrEqual(COMMENT_MAX_CHARS);
    expect(out.endsWith('palabra')).toBe(true);
  });
  it('queda en una sola línea', () => {
    expect(finalizeCommentReply('hola\n\nque tal')).toBe('hola que tal');
  });
});

describe('buildCommentPrompt', () => {
  const base = { brandNotes: 'NOTAS', styleExamples: '', recentReplies: [], category: 'praise' as const, purchaseIntent: false };
  it('incluye las respuestas recientes como ejemplo y pide no copiarlas', () => {
    const p = buildCommentPrompt({ ...base, recentReplies: ['Gracias linda 💜'] });
    expect(p).toContain('Gracias linda 💜');
    expect(p).toContain('NO las copies');
  });
  it('pide el DM con botón para toda pregunta, y no para elogios', () => {
    expect(buildCommentPrompt(base)).toContain('Deja "dm" vacío');
    const q = buildCommentPrompt({ ...base, category: 'question', purchaseIntent: false });
    expect(q).toContain('MENSAJE PRIVADO');
    expect(q).toContain('"buy"');
  });
  it('estilo Playroom con emojis y sin precios en público', () => {
    const p = buildCommentPrompt(base);
    expect(p).toContain('coqueto');
    expect(p).toContain('emojis');
    expect(p).toContain('sin precios');
  });
  it('no pide hablar como IA ni como equipo', () => {
    expect(buildCommentPrompt(base)).toContain('No digas que eres una IA');
  });
});

describe('botón y DM del comentario', () => {
  it('solo acepta botones conocidos', () => {
    expect(normalizeDmButton('buy')).toBe('buy');
    expect(normalizeDmButton('page:/faq', ['/faq'])).toBe('page:/faq');
    expect(normalizeDmButton('page:/inventada', ['/faq'])).toBe('none');
    expect(normalizeDmButton('https://evil.com')).toBe('none');
  });
  it('el DM nunca lleva links escritos', () => {
    expect(finalizeCommentDm('Las entradas están en https://mansionplayroom.cl/eventos/x 🔥')).not.toMatch(/https?:|mansionplayroom/);
  });
});

describe('enganches y comentarios propios', () => {
  it('el DM de una pregunta cierra con el enganche', () => {
    const p = buildCommentPrompt({ brandNotes: '', styleExamples: '', recentReplies: [], category: 'question', purchaseIntent: false, hook: '¿Vendrías en pareja? 👀' });
    expect(p).toContain('¿Vendrías en pareja? 👀');
  });
  it('comentario propio: corto, sin links y sin repetir', () => {
    const p = buildOwnCommentPrompt({ brandNotes: 'X', caption: 'Fiesta de disfraces', mediaType: 'VIDEO', recent: ['¿Quién se anima? 👀'] });
    expect(p).toContain('Sin links');
    expect(p).toContain('¿Quién se anima? 👀');
  });
});
