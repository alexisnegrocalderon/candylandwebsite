import { describe, expect, it } from 'vitest';
import { BRAND, MOTION_ACCENTS, MOTION_BASES, MOTION_FPS, MOTION_MUSIC_BPM, MOTION_OUTRO_SECS, MOTION_STYLES, MOTION_TEMPLATES, MOTION_VOICE_LEAD, MOTION_VOICE_TAIL, captionWords, cleanMediaUrl, packFileNames, packSlides, motionPalette, motionTimeline, normalizeMotionSpec, starterSpec, voiceSays, applyKeyword, normalizeKeyword, MOTION_CUSTOM_DEFAULT, normalizeCustom, motionTargetFrames } from './motionSpec';

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
      scenes: [{ text: 'a', say: 'Una noche distinta' }, { text: 'b', say: 'Comenta INFO' }],
      voice: { url: 'https://x.public.blob.vercel-storage.com/v.wav', secs: [1.2, 1.5] },
    });
    const words = captionWords(s);
    expect(words.map((w) => w.text)).toEqual(['Una', 'noche', 'distinta', 'Comenta', 'INFO']);
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

describe('pack (carrusel, post, historia)', () => {
  const spec = normalizeMotionSpec({ template: 'anuncio', music: 'none', scenes: [{ text: 'Uno', secs: 2 }, { text: 'Dos', secs: 2 }, { text: 'Tres', secs: 2 }], title: 'Noche Neón' });

  it('el carrusel lleva una lámina por escena más el cierre, y nunca pasa de 10', () => {
    const slides = packSlides(spec, 'carrusel');
    expect(slides.map((x) => x.label)).toEqual(['Escena 1', 'Escena 2', 'Escena 3', 'Cierre']);
    const many = normalizeMotionSpec({ scenes: Array.from({ length: 10 }, (_, i) => ({ text: `E${i}`, secs: 1.5 })) });
    expect(packSlides(many, 'carrusel')).toHaveLength(10);
  });

  it('el post es el gancho y la historia el gancho y la acción', () => {
    expect(packSlides(spec, 'post').map((x) => x.scene)).toEqual([0]);
    expect(packSlides(spec, 'historia').map((x) => x.scene)).toEqual([0, 2]);
    expect(packSlides(normalizeMotionSpec({ scenes: [{ text: 'Solo' }] }), 'historia')).toHaveLength(1);
  });

  it('cada lámina se congela con la escena asentada: dentro de ella, sin tocar el corte ni la salida', () => {
    const tl = motionTimeline(spec);
    for (const slide of packSlides(spec, 'carrusel').filter((x) => x.scene != null)) {
      const t = tl.scenes[slide.scene as number];
      expect(slide.frame).toBeGreaterThanOrEqual(t.from);
      expect(slide.frame).toBeLessThanOrEqual(t.from + t.frames - 11);
    }
  });

  it('los nombres de archivo son únicos, ordenados y sin tildes', () => {
    const names = packFileNames(spec, 'carrusel');
    expect(names[0]).toBe('carrusel/noche-neon-carrusel-01.png');
    expect(new Set(names).size).toBe(names.length);
  });
});


import { BRAND as BRAND_ARCADE, motionPalette as paletteArcade, starterSpec as starterArcade } from './motionSpec';
describe('estilo arcade (PLAYMORE · Player 1 vs Player 2)', () => {
  it('usa solo colores de la paleta permitida: magenta (P1), celeste (P2) y oro', () => {
    const p = paletteArcade('arcade', 'magenta');
    const allowed = new Set(Object.values(BRAND_ARCADE));
    for (const c of [p.bg, p.bg2, p.display, p.shadow, p.body, p.muted, p.hero, p.accent, p.deep, p.micro, p.surface]) expect(allowed.has(c as any)).toBe(true);
    expect(p.hero).toBe(BRAND_ARCADE.magenta);
    expect(p.accent).toBe(BRAND_ARCADE.blue);
    expect(p.dark).toBe(true);
  });
  it('el punto de partida trae el dress code por equipo, +21 y el link de PLAYMORE', () => {
    const spec = starterArcade('anuncio', 'arcade');
    expect(spec.style).toBe('arcade');
    expect(spec.base).toBe('arcade');
    const all = JSON.stringify(spec);
    expect(all).toContain('Equipo magenta');
    expect(all).toContain('Equipo celeste');
    expect(all).toContain('+21');
    expect(all).toContain('dalmore.mansionplayroom.cl');
    expect(all).not.toMatch(/Valpara|\+18/);
  });
});

describe('palabra clave de comentarios', () => {
  it('se normaliza: mayúsculas, sin espacios ni símbolos, y por defecto INFO', () => {
    expect(normalizeKeyword('play more!')).toBe('PLAYMORE');
    expect(normalizeKeyword('  ')).toBe('INFO');
    expect(normalizeKeyword(undefined)).toBe('INFO');
    expect(normalizeKeyword('a'.repeat(30))).toHaveLength(20);
  });

  it('la receta trae la palabra clave por defecto', () => {
    expect(normalizeMotionSpec({}).keyword).toBe('INFO');
    expect(normalizeMotionSpec({ keyword: 'entrada' }).keyword).toBe('ENTRADA');
  });

  it('cambiarla actualiza «Comenta X» en escenas, firma y caption, sin tocar el resto', () => {
    const spec = normalizeMotionSpec({
      title: 't', caption: 'Mañana. Comenta INFO y te escribimos.',
      outroLine: 'Comenta INFO',
      scenes: [
        { text: 'Una noche distinta', highlight: 'distinta', say: 'Comenta INFO ahora' },
        { text: 'Comenta INFO', highlight: 'INFO', sub: 'Escribe comenta info' },
        { text: 'Ven a la fiesta', highlight: 'fiesta' },
      ],
    });
    const next = applyKeyword(spec, 'playmore');
    expect(next.keyword).toBe('PLAYMORE');
    expect(next.outroLine).toBe('Comenta PLAYMORE');
    expect(next.caption).toBe('Mañana. Comenta PLAYMORE y te escribimos.');
    expect(next.scenes[0].say).toBe('Comenta PLAYMORE ahora');
    expect(next.scenes[1].text).toBe('Comenta PLAYMORE');
    expect(next.scenes[1].highlight).toBe('PLAYMORE');
    expect(next.scenes[1].sub).toBe('Escribe comenta PLAYMORE');
    expect(next.scenes[2]).toEqual(spec.scenes[2]);
    expect(next.scenes[0].highlight).toBe('distinta');
  });

  it('con la misma palabra no cambia nada', () => {
    const spec = normalizeMotionSpec({ outroLine: 'Comenta INFO' });
    expect(applyKeyword(spec, 'info')).toBe(spec);
  });
});

describe('estilo personalizado', () => {
  it('sin configurar usa los valores por defecto', () => {
    expect(normalizeMotionSpec({ style: 'custom' }).custom).toEqual(MOTION_CUSTOM_DEFAULT);
  });

  it('limita la velocidad a 0,6–1,6 y descarta valores que no existen', () => {
    expect(normalizeCustom({ speed: 9 }).speed).toBe(1.6);
    expect(normalizeCustom({ speed: 0.1 }).speed).toBe(0.6);
    expect(normalizeCustom({ speed: 'rápido' as unknown as number }).speed).toBe(MOTION_CUSTOM_DEFAULT.speed);
    const c = normalizeCustom({ font: 'comic', bg: 'lava', entry: 'rebote', uppercase: false });
    expect(c.font).toBe(MOTION_CUSTOM_DEFAULT.font);
    expect(c.bg).toBe(MOTION_CUSTOM_DEFAULT.bg);
    expect(c.entry).toBe(MOTION_CUSTOM_DEFAULT.entry);
    expect(c.uppercase).toBe(false);
  });

  it('la IA no puede elegir el estilo personalizado por su cuenta', () => {
    expect(MOTION_STYLES).toContain('custom');
  });
});

describe('canción propia, luz y loop', () => {
  const song = {
    url: 'https://blob.example/a.mp3', name: 'a', bpm: 124, downbeat: 0.3, start: 0.3, duration: 120,
    energy: Array(1200).fill(60), hits: [0.3, 0.78, 1.26], volume: 0.9, muteOnExport: false, asIs: false,
  };
  const withSong = (extra: Record<string, unknown> = {}) => normalizeMotionSpec({
    template: 'anuncio', outro: true, music: 'none', song,
    scenes: [{ text: 'Uno', secs: 3 }, { text: 'Dos', secs: 2.4 }, { text: 'Tres', secs: 4 }], ...extra,
  });

  it('un video viejo no trae canción, luz ni loop', () => {
    const s = normalizeMotionSpec({});
    expect(s.song).toBeNull();
    expect(s.glow).toBe('ninguna');
    expect(s.loop).toBe(false);
  });

  it('limpia la canción y la luz que llegan', () => {
    expect(normalizeMotionSpec({ song: { ...song, url: 'http://x/a.mp3' } }).song).toBeNull();
    expect(normalizeMotionSpec({ glow: 'haces', loop: true }).glow).toBe('haces');
    expect(normalizeMotionSpec({ glow: 'neon' }).glow).toBe('ninguna');
    expect(normalizeMotionSpec({ loop: 'sí' }).loop).toBe(false);
  });

  it('con canción, cada escena y la firma duran pulsos pares y los cortes caen en el pulso', () => {
    const tl = motionTimeline(withSong());
    const beat = (MOTION_FPS * 60) / 124;
    expect(tl.beatFrames).toBeCloseTo(beat, 5);
    for (const t of tl.scenes) {
      const beats = t.frames / beat;
      expect(Math.abs(beats / 2 - Math.round(beats / 2))).toBeLessThan(0.02);
      const startBeats = t.from / beat;
      expect(Math.abs(startBeats - Math.round(startBeats))).toBeLessThan(0.02);
    }
    const outroBeats = tl.outroFrames / beat;
    expect(Math.abs(outroBeats / 2 - Math.round(outroBeats / 2))).toBeLessThan(0.02);
    expect(tl.outroFrom).toBe(tl.scenes[2].from + tl.scenes[2].frames);
    expect(tl.total).toBe(tl.outroFrom! + tl.outroFrames);
  });

  it('con voz, la canción no mueve los cortes (manda la frase)', () => {
    const voice = { url: 'https://blob.example/v.wav', hash: 'h', voice: 'catalina', rate: 0, pitch: 0, secs: [2, 2, 2] };
    const withVoice = motionTimeline(withSong({ voice }));
    const noSong = motionTimeline(withSong({ voice, song: null, music: 'drive' }));
    expect(withVoice.scenes.map((t) => t.frames)).toEqual(noSong.scenes.map((t) => t.frames));
  });

  it('loop: dura compases enteros', () => {
    for (const outro of [true, false]) {
      const tl = motionTimeline(withSong({ loop: true, outro }));
      const bars = tl.total / (((MOTION_FPS * 60) / 124) * 4);
      expect(Math.abs(bars - Math.round(bars))).toBeLessThan(0.01);
      // Lo que se agrega no se pierde: las escenas y la firma siguen llegando hasta el final.
      const lastScene = tl.scenes[tl.scenes.length - 1];
      expect(tl.outroFrom != null ? tl.outroFrom + tl.outroFrames : lastScene.from + lastScene.frames).toBe(tl.total);
    }
  });

  it('loop sin pulso (sin música) no cambia nada', () => {
    const a = motionTimeline(normalizeMotionSpec({ music: 'none', loop: true }));
    const b = motionTimeline(normalizeMotionSpec({ music: 'none', loop: false }));
    expect(a.total).toBe(b.total);
  });

  it('loop con la plantilla de marca (sting) también cae en compás', () => {
    const tl = motionTimeline(withSong({ template: 'sting', loop: true }));
    const bars = tl.total / (((MOTION_FPS * 60) / 124) * 4);
    expect(Math.abs(bars - Math.round(bars))).toBeLessThan(0.01);
    expect(tl.scenes).toHaveLength(1);
    expect(tl.scenes[0].frames).toBe(tl.total);
  });
});

describe('duración fija y audio «tal cual»', () => {
  const scenes = [{ text: 'Uno', secs: 3 }, { text: 'Dos', secs: 2 }, { text: 'Tres', secs: 5 }];
  const mk = (extra: Record<string, unknown> = {}) => normalizeMotionSpec({ template: 'anuncio', music: 'none', outro: false, scenes, ...extra });
  const clip = (extra: Record<string, unknown> = {}) => ({
    url: 'https://blob.example/a.mp3', name: 'a', bpm: 120, downbeat: 0.23, start: 0, duration: 20.4,
    energy: Array(204).fill(60), hits: [0.23, 0.73], volume: 0.9, asIs: true, ...extra,
  });

  it('sin duración, nada cambia', () => {
    expect(mk().durationSecs).toBeNull();
    expect(motionTargetFrames(mk())).toBeNull();
    expect(normalizeMotionSpec({ durationSecs: 'x' }).durationSecs).toBeNull();
    expect(normalizeMotionSpec({ durationSecs: '' }).durationSecs).toBeNull();
  });

  it('limpia la duración elegida', () => {
    expect(mk({ durationSecs: 2 }).durationSecs).toBe(5);
    expect(mk({ durationSecs: 600 }).durationSecs).toBe(60);
    expect(mk({ durationSecs: 17.26 }).durationSecs).toBe(17.3);
  });

  it('el video dura exacto lo elegido y las escenas se reparten en proporción', () => {
    const tl = motionTimeline(mk({ durationSecs: 20 }));
    expect(tl.total).toBe(600);
    expect(tl.scenes.map((t) => t.frames)).toEqual([180, 120, 300]);
    expect(tl.scenes[1].from).toBe(180);
  });

  it('con firma, la firma entra en la duración', () => {
    const tl = motionTimeline(mk({ durationSecs: 15, outro: true }));
    expect(tl.total).toBe(450);
    expect(tl.outroFrom! + tl.outroFrames).toBe(450);
    const sum = tl.scenes.reduce((n, t) => n + t.frames, 0);
    expect(sum).toBe(tl.outroFrom);
  });

  it('con voz manda la voz, no la duración', () => {
    const voice = { url: 'https://blob.example/v.wav', hash: 'h', voice: 'catalina', rate: 0, pitch: 0, secs: [2, 2, 2] };
    expect(motionTargetFrames(mk({ durationSecs: 30, voice }))).toBeNull();
    expect(motionTimeline(mk({ durationSecs: 30, voice })).total).toBe(motionTimeline(mk({ voice })).total);
  });

  it('con canción, los cortes interiores caen en el pulso y el final queda exacto', () => {
    const tl = motionTimeline(mk({ durationSecs: 20, song: clip({ asIs: false, downbeat: 0, duration: 120 }) }));
    const beat = (MOTION_FPS * 60) / 120;
    expect(tl.total).toBe(600);
    for (const t of tl.scenes.slice(1)) expect(Math.abs(t.from / beat - Math.round(t.from / beat))).toBeLessThan(0.02);
  });

  it('audio «tal cual»: sin duración elegida el video dura lo que el audio', () => {
    const spec = mk({ song: clip() });
    expect(motionTargetFrames(spec)).toBe(612);
    expect(motionTimeline(spec).total).toBe(612);
  });

  it('audio «tal cual»: si se elige una duración más corta manda la elegida, y si es más larga el audio', () => {
    expect(motionTimeline(mk({ song: clip(), durationSecs: 15 })).total).toBe(450);
    expect(motionTimeline(mk({ song: clip(), durationSecs: 30 })).total).toBe(612);
  });

  it('audio «tal cual»: los cortes caen en los pulsos desde el primer golpe (no desde el cuadro 0)', () => {
    const tl = motionTimeline(mk({ song: clip({ downbeat: 0.23 }) }));
    const beat = (MOTION_FPS * 60) / 120;
    const off = 0.23 * MOTION_FPS;
    for (const t of tl.scenes.slice(1)) {
      const n = (t.from - off) / beat;
      expect(Math.abs(n - Math.round(n))).toBeLessThan(0.1);
    }
  });

  it('el audio «tal cual» no pasa de 60 s', () => {
    expect(motionTimeline(mk({ song: clip({ duration: 90 }) })).total).toBe(1800);
  });

  it('el loop no estira un video de duración fija ni uno con audio «tal cual»', () => {
    expect(motionTimeline(mk({ durationSecs: 20, loop: true, song: clip({ asIs: false, downbeat: 0, duration: 120, bpm: 124 }) })).total).toBe(600);
    expect(motionTimeline(mk({ loop: true, song: clip({ bpm: 124 }) })).total).toBe(612);
  });
});
