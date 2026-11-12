import { describe, expect, it, vi } from 'vitest';
import { LAYOUTS, resolveLayouts } from '../shared/motionVariety';

vi.mock('./db', () => ({ getEventById: vi.fn(), getFeaturedEvent: vi.fn() }));
vi.mock('./winback', () => ({ buildEventFacts: vi.fn(async () => '- Evento: Prueba') }));
vi.mock('./studioAi/quickCall', () => ({ quickJson: vi.fn() }));

const { variantsFromAi, MOTION_SYSTEM } = await import('./motionAi');

const media = [
  { url: 'https://x.public.blob.vercel-storage.com/a.jpg', kind: 'image' as const },
  { url: 'https://x.public.blob.vercel-storage.com/b.mp4', kind: 'video' as const },
];

describe('variantsFromAi', () => {
  it('siempre devuelve 3 variantes con estilos distintos, en el orden de la IA y completando si manda menos', () => {
    const raw = {
      title: 'Anuncio', caption: 'Te esperamos', template: 'anuncio', countdownValue: 0, countdownUnit: '', outroLine: 'Comenta INFO',
      variants: [
        { style: 'editorial', base: 'rosa', music: 'dream', scenes: [{ text: 'Uno', mediaIndex: -1 }] },
        { style: 'liquid', base: 'azul', music: 'pulse', scenes: [{ text: 'Dos', mediaIndex: -1 }] },
      ],
    };
    const out = variantsFromAi(raw, { format: 'reel', template: null, eventId: 3, media: [] });
    expect(out.map((v) => v.style)).toEqual(['editorial', 'liquid', 'kinetic']);
    expect(out[0].scenes[0].text).toBe('Uno');
    expect(out[1].scenes[0].text).toBe('Dos');
    expect(out.every((v) => v.eventId === 3 && v.outroLine === 'Comenta INFO')).toBe(true);
  });

  it('asigna las fotos por índice y descarta índices inventados', () => {
    const raw = { template: 'anuncio', variants: [{ style: 'liquid', scenes: [{ text: 'a', mediaIndex: 1 }, { text: 'b', mediaIndex: 7 }] }] };
    const [liquid] = variantsFromAi(raw, { format: 'reel', template: null, media });
    expect(liquid.scenes[0].media).toEqual(media[1]);
    expect(liquid.scenes[1].media).toBeNull();
  });

  it('en el montaje, si la IA no asigna fotos, se reparten en orden', () => {
    const raw = { variants: [{ style: 'liquid', scenes: [{ text: 'a', mediaIndex: -1 }, { text: 'b', mediaIndex: -1 }, { text: 'c', mediaIndex: -1 }] }] };
    const [liquid] = variantsFromAi(raw, { format: 'reel', template: 'montaje', media });
    expect(liquid.scenes.map((s) => s.media?.url)).toEqual([media[0].url, media[1].url, media[0].url]);
  });

  it('la plantilla pedida por el dueño manda sobre la que eligió la IA', () => {
    const [v] = variantsFromAi({ template: 'anuncio', variants: [] }, { format: 'feed', template: 'countdown', media: [] });
    expect(v.template).toBe('countdown');
    expect(v.format).toBe('feed');
  });
});

describe('variedad en las variantes de la IA', () => {
  const raw = {
    template: 'anuncio',
    variants: [
      { style: 'kinetic', scenes: [{ text: 'a', layout: 'gigante' }, { text: 'b', layout: 'partido' }, { text: 'c', layout: 'auto' }] },
      { style: 'liquid', scenes: [{ text: 'a', layout: 'bajo' }, { text: 'b', layout: 'gigante' }, { text: 'c', layout: 'inventada' }] },
      { style: 'poster', scenes: [{ text: 'a' }, { text: 'b' }, { text: 'c' }] },
    ],
  };

  it('cada variante parte con su propia semilla (aunque compartan el mensaje)', () => {
    const rnd = vi.spyOn(Math, 'random').mockReturnValueOnce(0.11).mockReturnValueOnce(0.52).mockReturnValueOnce(0.93);
    const out = variantsFromAi(raw, { format: 'reel', template: null, media: [] });
    rnd.mockRestore();
    expect(new Set(out.map((v) => v.seed)).size).toBe(3);
  });

  it('respeta la composición que eligió la IA y nunca deja una que no sea del estilo', () => {
    const [kinetic, liquid] = variantsFromAi(raw, { format: 'reel', template: null, media: [] });
    expect(kinetic.scenes.map((x) => x.layout)).toEqual(['gigante', 'partido', 'auto']);
    // «gigante» no es de liquid: se guarda tal cual, pero al dibujar la semilla elige una del catálogo de liquid.
    const keys = LAYOUTS.liquid.map((l) => l.key);
    const resolved = resolveLayouts(liquid);
    expect(resolved[0]).toBe('bajo');
    for (const k of resolved) expect(keys).toContain(k);
    expect(liquid.scenes[2].layout).toBe('auto');
  });

  it('el catálogo de composiciones va en el system fijo (con caché) y nombra cada estilo', () => {
    for (const style of Object.keys(LAYOUTS)) expect(MOTION_SYSTEM).toContain(`${style}: `);
    expect(MOTION_SYSTEM).toContain('gigante');
  });
});

describe('MOTION_SYSTEM', () => {
  it('es estable (va en caché): no lleva fechas ni datos del evento', () => {
    expect(MOTION_SYSTEM).not.toMatch(/20\d\d-\d\d-\d\d/);
    expect(MOTION_SYSTEM).toContain('liquid');
    expect(MOTION_SYSTEM).toContain('glitch');
    expect(MOTION_SYSTEM).toContain('editorial');
  });
});
