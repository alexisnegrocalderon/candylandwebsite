import { describe, expect, it } from 'vitest';
import {
  designFromPiece,
  emptySlide,
  fitFontSize,
  normalizeStudioDesign,
  pageLabel,
  parseSlideText,
  resolveImageSide,
  resolvePalette,
  splitHeadline,
  STUDIO_MAX_SLIDES,
  STUDIO_SIZES,
} from './contentStudio';
import type { ContentPiece } from './contentPlan';

function piece(overrides: Partial<ContentPiece> = {}): ContentPiece {
  return {
    date: '2026-10-20',
    time: '20:00',
    format: 'carrusel',
    goal: 'interaccion',
    hook: '¿Sabes jugar en Playroom?',
    caption: 'Pon a prueba lo que sabes.',
    visual: '',
    slides: [],
    interaction: 'Comenta cuántas acertaste y etiqueta a alguien.',
    hashtags: ['#MansionPlayroom'],
    keyword: '',
    ...overrides,
  };
}

describe('tamaños', () => {
  it('posts y carruseles 3:4, historias 9:16', () => {
    expect(STUDIO_SIZES.carrusel).toEqual({ width: 1080, height: 1440 });
    expect(STUDIO_SIZES.post.width / STUDIO_SIZES.post.height).toBeCloseTo(3 / 4);
    expect(STUDIO_SIZES.historia.width / STUDIO_SIZES.historia.height).toBeCloseTo(9 / 16);
  });
});

describe('parseSlideText', () => {
  it('separa número, pregunta y opciones a/b', () => {
    const r = parseSlideText('01. Sientes una mano en tu cintura sin previo aviso a) Está bien, de seguro le gustó b) No corresponde, el consentimiento es clave');
    expect(r.number).toBe('01.');
    expect(r.question).toBe('Sientes una mano en tu cintura sin previo aviso');
    expect(r.options).toEqual(['Está bien, de seguro le gustó', 'No corresponde, el consentimiento es clave']);
  });

  it('acepta "Escenario 2:" y opciones en líneas con punto', () => {
    const r = parseSlideText('Escenario 2: Se acerca alguien que te incomoda\na. Le digo que prefiero seguir por mi cuenta\nb. Sigo interactuando');
    expect(r.number).toBe('02.');
    expect(r.question).toBe('Se acerca alguien que te incomoda');
    expect(r.options).toHaveLength(2);
  });

  it('lee hasta 4 opciones en orden', () => {
    const r = parseSlideText('Tu plan ideal de viernes a) Llegar tarde b) Tomar un trago c) Aparecer y desaparecer d) Ser la primera en llegar');
    expect(r.options).toEqual(['Llegar tarde', 'Tomar un trago', 'Aparecer y desaparecer', 'Ser la primera en llegar']);
  });

  it('no corta el texto por una "a)" suelta', () => {
    const r = parseSlideText('Respeto ante todo: a) nadie te obliga a nada');
    expect(r.options).toEqual([]);
    expect(r.question).toBe('Respeto ante todo: a) nadie te obliga a nada');
  });
});

describe('splitHeadline', () => {
  it('corta en el salto de línea', () => {
    expect(splitHeadline('¿Elegiste bien?\nEn Playroom todo es respeto.')).toEqual({ title: '¿Elegiste bien?', body: 'En Playroom todo es respeto.' });
  });
  it('deja entero un texto corto', () => {
    expect(splitHeadline('¿Sabes jugar en Playroom?')).toEqual({ title: '¿Sabes jugar en Playroom?', body: '' });
  });
  it('corta un texto largo en la primera pregunta', () => {
    const r = splitHeadline('¿Sabes jugar en Playroom? Elige tu respuesta y comprueba si entiendes las reglas básicas.');
    expect(r.title).toBe('¿Sabes jugar en Playroom?');
    expect(r.body).toMatch(/^Elige tu respuesta/);
  });
});

describe('designFromPiece', () => {
  it('un carrusel quiz: portada con "Desafío", preguntas y cierre', () => {
    const d = designFromPiece(piece({
      slides: [
        '¿Sabes jugar en Playroom?\nElige tu respuesta.',
        '01. Sientes una mano sin aviso a) Está bien b) No corresponde',
        '02. Quieres sacar una foto en la pista a) La saco b) Nunca',
        '¿Elegiste bien?\nEn Playroom todo se trata de respeto.',
      ],
    }), 7);
    expect(d.format).toBe('carrusel');
    expect(d.eventId).toBe(7);
    expect(d.slides.map((s) => s.layout)).toEqual(['portada', 'pregunta', 'pregunta', 'cierre']);
    expect(d.slides[0].script).toBe('Desafío');
    expect(d.slides[1].number).toBe('01.');
    expect(d.slides[1].options).toEqual(['Está bien', 'No corresponde']);
    expect(d.slides[3].title).toBe('¿Elegiste bien?');
    expect(d.caption).toContain('#MansionPlayroom');
  });

  it('un post o una historia es una sola lámina con el gancho', () => {
    const post = designFromPiece(piece({ format: 'post', slides: [] }), null);
    expect(post.slides).toHaveLength(1);
    expect(post.slides[0].title).toBe('¿Sabes jugar en Playroom?');
    const story = designFromPiece(piece({ format: 'historia', keyword: 'MAPA' }), null);
    expect(story.format).toBe('historia');
    expect(story.slides[0].cta).toBe('Responde "MAPA"');
  });

  it('un reel se diseña como post (su portada)', () => {
    expect(designFromPiece(piece({ format: 'reel' }), null).format).toBe('post');
  });
});

describe('normalizeStudioDesign', () => {
  it('descarta lo que no es un diseño', () => {
    expect(normalizeStudioDesign(null)).toBeNull();
    expect(normalizeStudioDesign({ slides: [] })).toBeNull();
  });

  it('limpia valores raros y URLs peligrosas', () => {
    const d = normalizeStudioDesign({
      title: '  ',
      format: 'tiktok',
      theme: 'neon',
      eventId: -3,
      slides: [{ layout: 'raro', imageUrl: 'javascript:alert(1)', palette: 9, options: ['a', 2, 'b', 'c', 'd', 'e'] }],
    })!;
    expect(d.title).toBe('Sin título');
    expect(d.format).toBe('carrusel');
    expect(d.theme).toBe('azul');
    expect(d.eventId).toBeNull();
    expect(d.slides[0].layout).toBe('pregunta');
    expect(d.slides[0].imageUrl).toBe('');
    expect(d.slides[0].palette).toBe(-1);
    expect(d.slides[0].options).toEqual(['a', 'b', 'c', 'd']);
  });

  it('respeta el tope de láminas y deja una sola en posts', () => {
    const many = Array.from({ length: 30 }, () => emptySlide());
    expect(normalizeStudioDesign({ format: 'carrusel', slides: many })!.slides).toHaveLength(STUDIO_MAX_SLIDES);
    expect(normalizeStudioDesign({ format: 'post', slides: many })!.slides).toHaveLength(1);
  });

  it('acepta imágenes https y rutas propias', () => {
    const d = normalizeStudioDesign({ slides: [{ imageUrl: 'https://x.public.blob.vercel-storage.com/a.png' }, { imageUrl: '/candyland/logo.webp' }] })!;
    expect(d.slides.map((s) => s.imageUrl)).toEqual(['https://x.public.blob.vercel-storage.com/a.png', '/candyland/logo.webp']);
  });
});

describe('ayudas de diseño', () => {
  it('la foto se alterna empezando a la derecha, salvo que se fije', () => {
    expect([0, 1, 2, 3].map((i) => resolveImageSide({ imageSide: 'auto' }, i))).toEqual(['right', 'left', 'right', 'left']);
    expect(resolveImageSide({ imageSide: 'left' }, 0)).toBe('left');
  });

  it('las paletas pastel se turnan', () => {
    expect([0, 1, 2, 3].map((i) => resolvePalette({ palette: -1 }, i))).toEqual([0, 1, 2, 0]);
    expect(resolvePalette({ palette: 2 }, 0)).toBe(2);
  });

  it('pageLabel solo en carruseles', () => {
    expect(pageLabel(2, 7)).toBe('3/7');
    expect(pageLabel(0, 1)).toBe('');
  });

  it('fitFontSize achica los títulos largos y respeta min/max', () => {
    const box = { width: 540, height: 420 };
    const short = fitFontSize('Hola', box, { max: 90, min: 40 });
    const long = fitFontSize('Sientes una mano en tu cintura sin previo aviso y no sabes qué hacer', box, { max: 90, min: 40 });
    expect(short).toBe(90);
    expect(long).toBeLessThan(short);
    expect(long).toBeGreaterThanOrEqual(40);
    // Una palabra larga no puede salirse de la caja.
    expect(fitFontSize('INCONSTITUCIONALMENTE', box, { max: 200, min: 10 }) * 0.95 * 21).toBeLessThanOrEqual(541);
  });
});
