import { describe, expect, it, vi } from 'vitest';

vi.mock('./db', () => ({ getEventById: vi.fn(), getFeaturedEvent: vi.fn() }));
vi.mock('./winback', () => ({ buildEventFacts: vi.fn(async () => '- Evento: Prueba') }));
vi.mock('./studioAi/quickCall', () => ({ quickJson: vi.fn() }));

const { variantsFromAi, MOTION_SYSTEM } = await import('./motionAi');

const media = [
  { url: 'https://x.public.blob.vercel-storage.com/a.jpg', kind: 'image' as const },
  { url: 'https://x.public.blob.vercel-storage.com/b.mp4', kind: 'video' as const },
];

describe('variantsFromAi', () => {
  it('siempre devuelve 3 variantes, una por estilo, aunque la IA mande otro orden o menos', () => {
    const raw = {
      title: 'Anuncio', caption: 'Te esperamos', template: 'anuncio', countdownValue: 0, countdownUnit: '', outroLine: 'Entradas en la bio',
      variants: [
        { style: 'editorial', base: 'rosa', music: 'dream', scenes: [{ text: 'Uno', mediaIndex: -1 }] },
        { style: 'liquid', base: 'azul', music: 'pulse', scenes: [{ text: 'Dos', mediaIndex: -1 }] },
      ],
    };
    const out = variantsFromAi(raw, { format: 'reel', template: null, eventId: 3, media: [] });
    expect(out.map((v) => v.style)).toEqual(['liquid', 'glitch', 'editorial']);
    expect(out[0].scenes[0].text).toBe('Dos');
    expect(out[2].scenes[0].text).toBe('Uno');
    expect(out.every((v) => v.eventId === 3 && v.outroLine === 'Entradas en la bio')).toBe(true);
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

describe('MOTION_SYSTEM', () => {
  it('es estable (va en caché): no lleva fechas ni datos del evento', () => {
    expect(MOTION_SYSTEM).not.toMatch(/20\d\d-\d\d-\d\d/);
    expect(MOTION_SYSTEM).toContain('liquid');
    expect(MOTION_SYSTEM).toContain('glitch');
    expect(MOTION_SYSTEM).toContain('editorial');
  });
});
