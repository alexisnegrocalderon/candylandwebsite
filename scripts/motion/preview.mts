/* Revisión visual del Estudio Motion (paso 5 de la skill: grabar, sacar
 * cuadros y MIRARLOS). Graba cuadros sueltos, o un MP4 entero, de las
 * plantillas de partida o de una receta en JSON.
 *
 *   pnpm tsx scripts/motion/preview.mts stills [salida]        # todas las plantillas × estilos
 *   pnpm tsx scripts/motion/preview.mts video receta.json out.mp4
 *
 * Usa el Chromium de la máquina si existe (CHROME_PATH o el de Playwright). */
import { existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { bundle } from '@remotion/bundler';
import { renderMedia, renderStill, selectComposition } from '@remotion/renderer';
import { MOTION_STYLES, MOTION_TEMPLATES, motionTimeline, normalizeMotionSpec, starterSpec, type MotionSpec } from '../../shared/motionSpec';

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

async function still(spec: MotionSpec, frame: number, output: string) {
  const inputProps = { spec };
  const composition = await selectComposition({ serveUrl, id: 'Motion', inputProps, browserExecutable });
  await renderStill({ composition, serveUrl, output, frame: Math.min(frame, composition.durationInFrames - 1), inputProps, browserExecutable });
}

if (mode === 'video') {
  const spec = normalizeMotionSpec(JSON.parse(readFileSync(a, 'utf8')));
  const inputProps = { spec };
  const composition = await selectComposition({ serveUrl, id: 'Motion', inputProps, browserExecutable });
  await renderMedia({ composition, serveUrl, codec: 'h264', crf: 17, outputLocation: b ?? 'out.mp4', inputProps, browserExecutable });
  console.log('Listo:', b ?? 'out.mp4');
} else {
  const out = a ?? 'motion-stills';
  mkdirSync(out, { recursive: true });
  const only = process.env.ONLY?.split(',');
  for (const template of MOTION_TEMPLATES) {
    for (const style of MOTION_STYLES) {
      const key = `${template}-${style}`;
      if (only && !only.some((o) => key.includes(o))) continue;
      const spec = starterSpec(template, style);
      const tl = motionTimeline(spec);
      // Inicio de cada escena + ya asentada, y la firma.
      const frames = [...tl.scenes.map((s) => s.from + Math.min(s.frames - 10, 40)), ...(tl.outroFrom != null ? [tl.outroFrom + 50] : [])];
      for (const f of frames) {
        await still(spec, f, join(out, `${key}-${String(f).padStart(4, '0')}.png`));
      }
      console.log(key, frames.join(', '));
    }
  }
}
