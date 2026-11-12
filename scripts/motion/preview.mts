/* Revisión visual del Estudio Motion (paso 5 de la skill: grabar, sacar
 * cuadros y MIRARLOS). Graba cuadros sueltos, o un MP4 entero, de las
 * plantillas de partida o de una receta en JSON.
 *
 *   pnpm tsx scripts/motion/preview.mts stills [salida]        # todas las plantillas × estilos
 *   pnpm tsx scripts/motion/preview.mts pack [salida]          # láminas del carrusel, post e historia (ONLY=estilo, BASE=fondo)
 *   pnpm tsx scripts/motion/preview.mts layouts [salida]       # una lámina por composición de cada estilo (ONLY=estilo, FORMAT=reel|feed, BASE=fondo)
 *   pnpm tsx scripts/motion/preview.mts video receta.json out.mp4
 *
 * Usa el Chromium de la máquina si existe (CHROME_PATH o el de Playwright). */
import { existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { bundle } from '@remotion/bundler';
import { renderMedia, renderStill, selectComposition } from '@remotion/renderer';
import { LAYOUTS } from '../../shared/motionVariety';
import { MOTION_STYLES, MOTION_TEMPLATES, PACK_KINDS, motionTimeline, normalizeMotionSpec, packSlides, starterSpec, type MotionSpec } from '../../shared/motionSpec';

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
} else if (mode === 'recipe') {
  // pnpm tsx scripts/motion/preview.mts recipe receta.json [salida]  → un cuadro asentado por escena (+ cierre), con ACCENT=, BASE=, SEED= opcionales
  const out = b ?? 'motion-recipe';
  mkdirSync(out, { recursive: true });
  const raw = JSON.parse(readFileSync(a, 'utf8'));
  const spec = normalizeMotionSpec({ ...raw, ...(process.env.ACCENT ? { accent: process.env.ACCENT } : {}), ...(process.env.BASE ? { base: process.env.BASE } : {}), ...(process.env.SEED ? { seed: Number(process.env.SEED) } : {}) });
  const tl = motionTimeline(spec);
  const frames = [...tl.scenes.map((t) => t.from + t.frames - 12), ...(tl.outroFrom != null ? [tl.outroFrom + 50] : [])];
  const tag = process.env.TAG ?? 'r';
  for (let i = 0; i < frames.length; i++) {
    const inputProps = { spec };
    const composition = await selectComposition({ serveUrl, id: 'Motion', inputProps, browserExecutable, chromiumOptions });
    await renderStill({ composition, serveUrl, output: join(out, `${tag}-${String(i + 1).padStart(2, '0')}.png`), frame: frames[i], inputProps, browserExecutable, chromiumOptions });
  }
  console.log(tag, frames.length, 'cuadros');
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
      const spec = { ...starterSpec(template, style), ...(process.env.BASE ? { base: process.env.BASE } : {}), ...(process.env.CLOSING ? { closing: process.env.CLOSING } : {}) } as MotionSpec;
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
