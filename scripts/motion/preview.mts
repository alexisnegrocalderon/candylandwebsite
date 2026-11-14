/* Revisión visual del Estudio Motion (paso 5 de la skill: grabar, sacar
 * cuadros y MIRARLOS). Graba cuadros sueltos, o un MP4 entero, de las
 * plantillas de partida o de una receta en JSON.
 *
 *   pnpm tsx scripts/motion/preview.mts stills [salida]        # todas las plantillas × estilos
 *   pnpm tsx scripts/motion/preview.mts pack [salida]          # láminas del carrusel, post e historia (ONLY=estilo, BASE=fondo)
 *   pnpm tsx scripts/motion/preview.mts layouts [salida]       # una lámina por composición de cada estilo (ONLY=estilo, FORMAT=reel|feed, BASE=fondo)
 *   pnpm tsx scripts/motion/preview.mts looks [salida]         # el look: cada adorno, trama, etiqueta, entrada y transición (ONLY=estilo, FORMAT, SEEDS=3 para ver semillas al azar)
 *   pnpm tsx scripts/motion/preview.mts captions [salida]      # los 3 estilos de subtítulos sobre cada estilo (ONLY=estilo, BASE=fondo)
 *   pnpm tsx scripts/motion/preview.mts video receta.json out.mp4
 *
 * Usa el Chromium de la máquina si existe (CHROME_PATH o el de Playwright). */
import { existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { bundle } from '@remotion/bundler';
import { renderMedia, renderStill, selectComposition } from '@remotion/renderer';
import { LAYOUTS, LOOK_ALL_AUTO, LOOK_CLASSIC, LOOK_CUTS, LOOK_DECOS, LOOK_ENTRIES, LOOK_KICKERS, LOOK_TEXTURES, lookSignature, type MotionLook } from '../../shared/motionVariety';
import { MOTION_STYLES, MOTION_TEMPLATES, PACK_KINDS, captionWords, motionTimeline, normalizeMotionSpec, packSlides, starterSpec, type MotionSpec } from '../../shared/motionSpec';

const ROOT = resolve(import.meta.dirname, '..', '..');

function chrome(): string | undefined {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const base = '/opt/pw-browsers';
  if (!existsSync(base)) return undefined;
  const shell = readdirSync(base).find((d) => d.startsWith('chromium_headless_shell'));
  if (shell) {
    for (const sub of ['chrome-linux/headless_shell', 'chrome-headless-shell-linux64/chrome-headless-shell']) {
      const p = join(base, shell, sub);
      if (existsSync(p)) return p;
    }
  }
  return undefined;
}

const [mode = 'stills', a, b] = process.argv.slice(2);
const serveUrl = await bundle({ entryPoint: join(ROOT, 'motion/index.ts'), publicDir: join(ROOT, 'client/public') });
const browserExecutable = chrome();
// WebGL por software (SwiftShader): el estilo póster dibuja en 3D y la máquina no tiene GPU.
const chromiumOptions = { gl: 'swangle' as const };

async function still(spec: MotionSpec, frame: number, output: string) {
  const inputProps = { spec };
  const composition = await selectComposition({ serveUrl, id: 'Motion', inputProps, browserExecutable, chromiumOptions });
  await renderStill({ composition, serveUrl, output, frame: Math.min(frame, composition.durationInFrames - 1), inputProps, browserExecutable, chromiumOptions });
}

if (mode === 'video') {
  const spec = normalizeMotionSpec(JSON.parse(readFileSync(a, 'utf8')));
  const inputProps = { spec };
  const composition = await selectComposition({ serveUrl, id: 'Motion', inputProps, browserExecutable, chromiumOptions });
  await renderMedia({ composition, serveUrl, codec: 'h264', crf: 17, outputLocation: b ?? 'out.mp4', inputProps, browserExecutable, chromiumOptions });
  console.log('Listo:', b ?? 'out.mp4');
} else if (mode === 'layouts') {
  const out = a ?? 'motion-layouts';
  mkdirSync(out, { recursive: true });
  const only = process.env.ONLY?.split(',');
  const samples = [
    { kicker: 'SE VIENE', text: 'No es solo una fiesta', highlight: 'fiesta', sub: 'Dirección al comprar' },
    { text: 'Es el lugar donde por fin puedes ser tú', highlight: 'tú' },
    { kicker: 'SÁBADO', text: 'Con respeto y consentimiento', highlight: 'consentimiento' },
    { text: 'Una noche distinta', highlight: 'distinta' },
    { kicker: 'EN LA BIO', text: 'Entradas disponibles', highlight: 'Entradas', sub: 'Cupos limitados' },
    { text: 'Te esperamos', highlight: 'esperamos' },
  ];
  for (const style of MOTION_STYLES) {
    if (only && !only.includes(style)) continue;
    const keys = LAYOUTS[style].map((l) => l.key);
    const scenes = samples.slice(0, keys.length).map((sc, i) => ({ ...sc, secs: 3, layout: keys[i], card: style === 'softui' ? (['evento', 'calendario', 'checklist', 'chat', 'entrada'][i] ?? 'ninguna') : 'ninguna', items: ['Tu entrada', 'Carnet +18', 'Ganas de pasarlo bien'] }));
    const spec = normalizeMotionSpec({ ...starterSpec('anuncio', style), scenes, outro: false, format: process.env.FORMAT ?? 'feed', seed: Number(process.env.SEED ?? 11), ...(process.env.BASE ? { base: process.env.BASE } : {}) });
    const tl = motionTimeline(spec);
    for (let i = 0; i < tl.scenes.length; i++) {
      const t = tl.scenes[i];
      const inputProps = { spec, slide: { index: i, total: tl.scenes.length, swipe: false, thread: false } };
      const composition = await selectComposition({ serveUrl, id: 'Motion', inputProps, browserExecutable, chromiumOptions });
      await renderStill({ composition, serveUrl, output: join(out, `${style}-${String(i + 1).padStart(2, '0')}-${keys[i]}.png`), frame: t.from + t.frames - 12, inputProps, browserExecutable, chromiumOptions });
    }
    console.log(style, keys.length, 'composiciones');
  }
} else if (mode === 'captions') {
  const out = a ?? 'motion-captions';
  mkdirSync(out, { recursive: true });
  const only = process.env.ONLY?.split(',') ?? ['liquid', 'editorial', 'glitch'];
  for (const style of MOTION_STYLES) {
    if (!only.includes(style)) continue;
    for (const captionStyle of ['clasico', 'karaoke', 'palabra'] as const) {
      const base = starterSpec('anuncio', style);
      // Una voz de relleno solo para que haya subtítulos: la duración de cada escena sale de `secs`.
      const says = ['Una noche distinta, sin juicios y con respeto total', 'El sábado en Valparaíso te esperamos', 'Comenta INFO y te enviamos todo'];
      const spec = normalizeMotionSpec({ ...base, format: process.env.FORMAT ?? 'reel', ...(process.env.BASE ? { base: process.env.BASE } : {}), captionStyle, captions: true, look: LOOK_CLASSIC,
        scenes: base.scenes.slice(0, 3).map((sc, i) => ({ ...sc, say: says[i] })), voice: { url: '/motion/sfx/pop.wav', hash: 'x', voice: 'catalina', rate: 0, pitch: 0, secs: [3.4, 2.8, 2.6] } });
      const tl = motionTimeline(spec);
      const words = captionWords(spec);
      // Una palabra a mitad de la primera frase y una de la última (con la caja ya puesta).
      for (const w of [words[Math.floor(words.length * 0.18)], words[Math.floor(words.length * 0.8)]]) await still(spec, w.from + 4, join(out, `${style}-${captionStyle}-${w.from}.png`));
      void tl;
    }
    console.log(style, 'subtítulos listos');
  }
} else if (mode === 'looks') {
  const out = a ?? 'motion-looks';
  mkdirSync(out, { recursive: true });
  const only = process.env.ONLY?.split(',') ?? ['liquid'];
  const format = process.env.FORMAT ?? 'reel';
  for (const style of MOTION_STYLES) {
    if (!only.includes(style)) continue;
    const base = { ...starterSpec('anuncio', style), format, outro: false, seed: Number(process.env.SEED ?? 11), ...(process.env.BASE ? { base: process.env.BASE } : {}) } as MotionSpec;
    const shot = async (name: string, look: Partial<MotionLook>, pick: (tl: ReturnType<typeof motionTimeline>) => number, seed = base.seed) => {
      const spec = normalizeMotionSpec({ ...base, seed, look: { ...LOOK_CLASSIC, ...look } });
      await still(spec, pick(motionTimeline(spec)), join(out, `${style}-${name}.png`));
    };
    const settled = (i: number) => (tl: ReturnType<typeof motionTimeline>) => { const t = tl.scenes[Math.min(i, tl.scenes.length - 1)]; return t.from + Math.min(t.frames - 10, 40); };
    if (process.env.SEEDS) {
      // Semillas al azar, todo en automático: lo que ve el dueño al tocar «Sorpréndeme».
      for (let k = 0; k < Number(process.env.SEEDS); k++) {
        const seed = 1000 + k * 7919;
        const spec = normalizeMotionSpec({ ...base, seed, look: LOOK_ALL_AUTO });
        for (const i of [0, 1]) await still(spec, settled(i)(motionTimeline(spec)), join(out, `${style}-seed${k}-${i + 1}.png`));
        console.log(style, seed, lookSignature(spec));
      }
      continue;
    }
    const part = process.env.PART; // PART=corte|deco|trama|etiqueta|entrada: solo esa parte
    for (const deco of LOOK_DECOS) if (deco !== 'ninguno' && (!part || part === 'deco')) for (const i of [0, 1]) await shot(`deco-${deco}-${i + 1}`, { deco }, settled(i));
    for (const texture of LOOK_TEXTURES) if (texture !== 'ninguna' && (!part || part === 'trama')) await shot(`trama-${texture}`, { texture }, settled(0));
    for (const kicker of LOOK_KICKERS) if (!part || part === 'etiqueta') await shot(`etiqueta-${kicker}`, { kicker }, settled(0));
    for (const entry of LOOK_ENTRIES) if (entry !== 'estilo' && (!part || part === 'entrada')) await shot(`entrada-${entry}`, { entry }, (tl) => tl.scenes[0].from + 12);
    // Transiciones: un cuadro antes del medio (tapando) y uno después (destapando).
    for (const cut of LOOK_CUTS) if (cut !== 'estilo' && (!part || part === 'corte')) for (const d of [-5, 4]) await shot(`corte-${cut}-${d < 0 ? 'a' : 'b'}`, { cut }, (tl) => tl.scenes[1].from + d);
    console.log(style, 'look listo');
  }
} else if (mode === 'pack') {
  const out = a ?? 'motion-pack';
  mkdirSync(out, { recursive: true });
  const only = process.env.ONLY?.split(',');
  for (const style of MOTION_STYLES) {
    if (only && !only.includes(style)) continue;
    for (const kind of PACK_KINDS) {
      const base = starterSpec('anuncio', style);
      const spec = { ...base, format: kind === 'historia' ? 'reel' : 'feed', ...(process.env.SEED ? { seed: Number(process.env.SEED) } : {}), ...(process.env.BASE ? { base: process.env.BASE } : {}), ...(process.env.CLOSING ? { closing: process.env.CLOSING } : {}) } as MotionSpec;
      const slides = packSlides(spec, kind);
      for (let i = 0; i < slides.length; i++) {
        const slide = { index: i, total: slides.length, swipe: kind === 'carrusel' && i < slides.length - 1, thread: kind === 'carrusel' };
        const inputProps = { spec, slide };
        const composition = await selectComposition({ serveUrl, id: 'Motion', inputProps, browserExecutable, chromiumOptions });
        await renderStill({ composition, serveUrl, output: join(out, `${style}-${kind}-${String(i + 1).padStart(2, '0')}.png`), frame: slides[i].frame, inputProps, browserExecutable, chromiumOptions });
      }
      console.log(style, kind, slides.length, 'láminas');
    }
  }
} else {
  const out = a ?? 'motion-stills';
  mkdirSync(out, { recursive: true });
  const only = process.env.ONLY?.split(',');
  for (const template of MOTION_TEMPLATES) {
    for (const style of MOTION_STYLES) {
      const key = `${template}-${style}${process.env.BASE ? `-${process.env.BASE}` : ''}`;
      if (only && !only.some((o) => key.includes(o))) continue;
      // BASE=perla,noche prueba otros fondos; CLOSING=handle la tarjeta del @.
      const base0 = { ...starterSpec(template, style), ...(process.env.BASE ? { base: process.env.BASE } : {}), ...(process.env.CLOSING ? { closing: process.env.CLOSING } : {}) } as MotionSpec;
      // MEDIA_TEST=/motion/archivo.png: imagen de prueba enmarcada en la escena 2 (no es fondo).
      const testUrl = process.env.MEDIA_TEST ? (process.env.MEDIA_TEST.startsWith('/') ? 'data:image/png;base64,' + readFileSync(join(ROOT, 'client/public', process.env.MEDIA_TEST)).toString('base64') : process.env.MEDIA_TEST) : null;
      const spec = testUrl && base0.scenes[1] ? { ...base0, scenes: base0.scenes.map((sc, k) => (k === 1 ? { ...sc, media: { url: testUrl, kind: 'image' as const } } : sc)) } : base0;
      const tl = motionTimeline(spec);
      // Inicio de cada escena + ya asentada, y la firma.
      const at = Number(process.env.AT ?? 0); // AT=0.75 muestrea cada escena a ese punto
      const frames = [...tl.scenes.map((s) => s.from + (at ? Math.round(s.frames * at) : Math.min(s.frames - 10, 40))), ...(tl.outroFrom != null ? [tl.outroFrom + 50] : [])];
      for (const f of frames) {
        await still(spec, f, join(out, `${key}-${String(f).padStart(4, '0')}.png`));
      }
      console.log(key, frames.join(', '));
    }
  }
}
