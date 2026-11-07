import { describe, expect, it } from 'vitest';
import {
  BRAND, MOTION_ACCENTS, MOTION_BASES, MOTION_FPS, MOTION_MUSIC_BPM, MOTION_OUTRO_SECS, MOTION_STYLES, MOTION_TEMPLATES, MOTION_VOICE_LEAD, MOTION_VOICE_TAIL,
  captionWords, cleanMediaUrl, motionPalette, motionTimeline, normalizeMotionSpec, starterSpec, voiceSays,
} from './motionSpec';

describe('normalizeMotionSpec', () => {
  it('cualquier cosa rota queda en una receta válida', () => {
    for (const raw of [null, 42, 'x', {}, { scenes: 'no' }, { template: 'otro', style: 'otro', format: 'otro' }]) {
      const s = normalizeMotionSpec(raw);
      expect(MOTION_TEMPLATES).toContain(s.template);
      expect(MOTION_STYLES).toContain(s.style);
      expect(s.scenes.length).toBeGreaterThan(0);
      expect(motionTimeline(s).total).toBeGreaterThan(0);
    }
  });

  it('solo deja pasar fotos https o del sitio', () => {
    expect(cleanMediaUrl('https://x.public.blob.vercel-storage.com/a.jpg')).toBe('https://x.public.blob.vercel-storage.com/a.jpg');
    expect(cleanMediaUrl('/candyland/a.jpg')).toBe('/candyland/a.jpg');
    expect(cleanMediaUrl('http://otro.test/a.jpg')).toBe('');
    expect(cleanMediaUrl('javascript:alert(1)')).toBe('');
    expect(cleanMediaUrl('//otro.test/a.jpg')).toBe('');
    const s = normalizeMotionSpec({ scenes: [{ text: 'a', media: { url: 'https://x.test/clip.mp4' } }] });
    expect(s.scenes[0].media).toEqual({ url: 'https://x.test/clip.mp4', kind: 'video' });
  });

  it('lo destacado tiene que estar en el texto', () => {
    const s = normalizeMotionSpec({ scenes: [{ text: 'Una noche distinta', highlight: 'distinta' }, { text: 'Hola', highlight: 'chao' }] });
    expect(s.scenes.map((x) => x.highlight)).toEqual(['distinta', '']);
  });

  it('recorta escenas que pasan del tope de duración y deja una sola en la firma', () => {
    const many = normalizeMotionSpec({ scenes: Array.from({ length: 10 }, () => ({ text: 'x', secs: 8 })) });
    expect(many.scenes.reduce((n, s) => n + s.secs, 0)).toBeLessThanOrEqual(60);
    const sting = normalizeMotionSpec({ template: 'sting', scenes: [{ text: 'a' }, { text: 'b' }] });
    expect(sting.scenes).toHaveLength(1);
    expect(sting.outro).toBe(false);
  });

  it('una voz que no calza con las escenas se descarta (y con ella los subtítulos)', () => {
    const s = normalizeMotionSpec({ scenes: [{ text: 'a' }, { text: 'b' }], voice: { url: 'https://x.test/v.wav', secs: [1] }, captions: true });
    expect(s.voice).toBeNull();
    expect(s.captions).toBe(false);
  });

  it('cada estilo trae su fondo de marca por defecto', () => {
    expect(normalizeMotionSpec({ style: 'liquid' }).base).toBe('azul');
    expect(normalizeMotionSpec({ style: 'glitch' }).base).toBe('tinta');
    expect(normalizeMotionSpec({ style: 'editorial' }).base).toBe('perla');
  });
});

describe('paleta', () => {
  it('solo usa colores de la lista (marca + neutros + PLAYMORE), con cualquier acento', () => {
    const brand = new Set<string>(Object.values(BRAND));
    for (const base of MOTION_BASES) {
      for (const accent of MOTION_ACCENTS) {
        for (const value of Object.values(motionPalette(base, accent))) {
          if (typeof value !== 'string') continue;
          // Un degradé (noche) solo puede llevar colores de la lista.
          const hexes = value.match(/#[0-9A-Fa-f]{6}/g) ?? [];
          expect(hexes.length).toBeGreaterThan(0);
          for (const h of hexes) expect(brand.has(h)).toBe(true);
        }
      }
    }
  });

  it('el acento nunca es igual al fondo', () => {
    for (const base of MOTION_BASES) {
      for (const accent of MOTION_ACCENTS) {
        const p = motionPalette(base, accent);
        expect(p.hero).not.toBe(p.bg);
      }
    }
  });
});

describe('motionTimeline', () => {
  it('suma las escenas y la firma, sin huecos', () => {
    const s = normalizeMotionSpec({ music: 'none', scenes: [{ text: 'a', secs: 2 }, { text: 'b', secs: 3 }] });
    const t = motionTimeline(s);
    expect(t.scenes).toEqual([{ index: 0, from: 0, frames: 60 }, { index: 1, from: 60, frames: 90 }]);
    expect(t.outroFrom).toBe(150);
    expect(t.total).toBe(150 + Math.round(MOTION_OUTRO_SECS * MOTION_FPS));
  });

  it('en un montaje con música los cortes caen en el pulso', () => {
    const s = normalizeMotionSpec({ template: 'montaje', music: 'pulse', outro: false, scenes: [{ text: 'a', secs: 2.2 }, { text: 'b', secs: 1.1 }] });
    const beat = (MOTION_FPS * 60) / MOTION_MUSIC_BPM.pulse;
    for (const sc of motionTimeline(s).scenes) expect(sc.frames % beat).toBe(0);
  });

  it('con voz, cada escena dura su frase más los silencios del WAV', () => {
    const s = normalizeMotionSpec({
      outro: false,
      scenes: [{ text: 'a', say: 'hola' }, { text: 'b', say: 'chao' }],
      voice: { url: 'https://x.public.blob.vercel-storage.com/v.wav', secs: [1, 2] },
    });
    const t = motionTimeline(s);
    expect(t.scenes[0].frames).toBe(Math.round((1 + MOTION_VOICE_LEAD + 0.3) * MOTION_FPS));
    expect(t.scenes[1].frames).toBe(Math.round((2 + MOTION_VOICE_TAIL) * MOTION_FPS));
  });
});

describe('subtítulos', () => {
  it('reparten las palabras dentro de cada frase, en orden y sin solaparse', () => {
    const s = normalizeMotionSpec({
      scenes: [{ text: 'a', say: 'Una noche distinta' }, { text: 'b', say: 'Entradas en la bio' }],
      voice: { url: 'https://x.public.blob.vercel-storage.com/v.wav', secs: [1.2, 1.5] },
    });
    const words = captionWords(s);
    expect(words.map((w) => w.text)).toEqual(['Una', 'noche', 'distinta', 'Entradas', 'en', 'la', 'bio']);
    expect(words[0].from).toBe(Math.round(MOTION_VOICE_LEAD * MOTION_FPS));
    for (let i = 1; i < words.length; i++) expect(words[i].from).toBeGreaterThanOrEqual(words[i - 1].to - 1);
  });

  it('sin voz no hay subtítulos; la voz lee el texto grande si la escena no trae frase', () => {
    expect(captionWords(normalizeMotionSpec({ scenes: [{ text: 'a', say: 'hola' }] }))).toEqual([]);
    expect(voiceSays(normalizeMotionSpec({ scenes: [{ text: 'Texto grande' }] }))).toEqual(['Texto grande']);
  });
});

describe('starterSpec', () => {
  it('todas las plantillas y estilos tienen un punto de partida que dura algo razonable', () => {
    for (const t of MOTION_TEMPLATES) {
      for (const st of MOTION_STYLES) {
        const total = motionTimeline(starterSpec(t, st)).total / MOTION_FPS;
        expect(total).toBeGreaterThan(2);
        expect(total).toBeLessThan(20);
      }
    }
  });
});

describe('tarjetas y fecha (softui)', () => {
  it('limpia la tarjeta, sus ítems y la fecha del evento', () => {
    const s = normalizeMotionSpec({
      style: 'softui', eventDate: '2026-11-14',
      scenes: [{ text: 'Qué llevar', card: 'checklist', items: ['Carnet', '', 'Entrada', 'a', 'b', 'c', 'd'] }, { text: 'x', card: 'otra' }],
    });
    expect(s.eventDate).toBe('2026-11-14');
    expect(s.scenes[0].card).toBe('checklist');
    expect(s.scenes[0].items).toEqual(['Carnet', 'Entrada', 'a', 'b', 'c']);
    expect(s.scenes[1].card).toBe('ninguna');
    expect(normalizeMotionSpec({ eventDate: '14/11/2026' }).eventDate).toBe('');
  });
});

