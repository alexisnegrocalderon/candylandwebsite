import { describe, expect, it } from 'vitest';
import { finalizeCommentReply, buildCommentPrompt, COMMENT_MAX_CHARS } from './instagramComments';

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
  it('pide un DM solo cuando hay intención de compra', () => {
    expect(buildCommentPrompt(base)).toContain('Deja "dm" vacío');
    expect(buildCommentPrompt({ ...base, category: 'question', purchaseIntent: true })).toContain('sin dar precios en público');
  });
  it('no pide hablar como IA ni como equipo', () => {
    expect(buildCommentPrompt(base)).toContain('No digas que eres una IA');
  });
});
