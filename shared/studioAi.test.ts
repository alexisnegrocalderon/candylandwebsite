import { describe, expect, it } from 'vitest';
import { applyAiOps, emptyAiDesign, normalizeAiDesign, slideDocument, usageCostUsd, formatUsd, type AiDesign, type AiOp } from './studioAi';

const op = (o: Partial<AiOp> & Pick<AiOp, 'op'>): AiOp => ({ index: -1, to: -1, html: '', css: '', caption: '', ...o });

function design(n: number): AiDesign {
  return { ...emptyAiDesign('carrusel'), css: '.board{}', slides: Array.from({ length: n }, (_, i) => ({ html: `<div class="board">${i}</div>` })) };
}

describe('applyAiOps', () => {
  it('reemplaza, inserta, mueve y borra láminas', () => {
    const { design: d, skipped } = applyAiOps(design(3), [
      op({ op: 'set_slide', index: 1, html: '<div class="board">nueva</div>' }),
      op({ op: 'insert_slide', index: 3, html: '<div class="board">fin</div>' }),
      op({ op: 'move_slide', index: 3, to: 0 }),
      op({ op: 'delete_slide', index: 2 }),
      op({ op: 'set_caption', caption: 'Hola #MansionPlayroom' }),
      op({ op: 'set_css', css: '.board{background:#00A3FF}' }),
    ]);
    expect(skipped).toBe(0);
    expect(d.slides.map((s) => s.html.replace(/<[^>]+>/g, ''))).toEqual(['fin', '0', '2']);
    expect(d.caption).toBe('Hola #MansionPlayroom');
    expect(d.css).toContain('#00A3FF');
  });

  it('salta las operaciones imposibles sin romper el diseño', () => {
    const base = design(1);
    const { design: d, skipped } = applyAiOps(base, [
      op({ op: 'set_slide', index: 5, html: '<div>x</div>' }),
      op({ op: 'delete_slide', index: 0 }), // no se puede dejar sin láminas
      op({ op: 'set_slide', index: 0, html: '   ' }),
      op({ op: 'set_css', css: '' }),
    ]);
    expect(skipped).toBe(4);
    expect(d.slides).toEqual(base.slides);
  });

  it('un post nunca pasa de una lámina', () => {
    const post = { ...design(1), format: 'post' as const };
    const { skipped, design: d } = applyAiOps(post, [op({ op: 'insert_slide', index: 1, html: '<div>2</div>' })]);
    expect(skipped).toBe(1);
    expect(d.slides).toHaveLength(1);
  });

  it('no modifica el diseño original', () => {
    const base = design(2);
    applyAiOps(base, [op({ op: 'delete_slide', index: 0 })]);
    expect(base.slides).toHaveLength(2);
  });
});

describe('normalizeAiDesign', () => {
  it('limpia la forma y descarta láminas vacías', () => {
    const d = normalizeAiDesign({ format: 'historia', title: '  ', slides: [{ html: '' }, { html: '<div>a</div>' }, { html: '<div>b</div>' }], eventId: 'x' });
    expect(d.format).toBe('historia');
    expect(d.title).toBe('Diseño nuevo');
    expect(d.eventId).toBeNull();
    expect(d.slides).toEqual([{ html: '<div>a</div>' }]);
  });
});

describe('slideDocument', () => {
  it('fija el tamaño del formato y envuelve HTML sin .board', () => {
    const doc = slideDocument({ css: '.x{color:red}</style><script>', format: 'historia' }, { html: '<p>hola</p>' });
    expect(doc).toContain('width:1080px !important;height:1920px !important');
    expect(doc).toContain('<div class="board"><p>hola</p></div>');
    expect(doc).toContain('/studio/fonts.css');
    expect(doc).not.toMatch(/<\/style><script>/);
  });
  it('respeta un .board que ya viene', () => {
    expect(slideDocument({ css: '', format: 'carrusel' }, { html: '<div class="board lilac">a</div>' })).toContain('<body><div class="board lilac">a</div></body>');
  });
});

describe('costos', () => {
  it('suma entrada, caché y salida con los precios del modelo', () => {
    const usage = { inputTokens: 1_000_000, outputTokens: 100_000, cacheReadTokens: 1_000_000, cacheWriteTokens: 0 };
    expect(usageCostUsd('claude-sonnet-5-5', usage)).toBeCloseTo(2 + 1 + 0.2);
    expect(usageCostUsd('claude-opus-5-5', usage)).toBeCloseTo(4 + 2 + 0.2);
    // Modelo desconocido (respaldo): se cobra como el más caro conocido.
    expect(usageCostUsd('otro', usage)).toBeCloseTo(6.2);
  });
  it('formatUsd', () => {
    expect(formatUsd(0.004)).toBe('< US$0,01');
    expect(formatUsd(0.237)).toBe('US$0,24');
  });
});
