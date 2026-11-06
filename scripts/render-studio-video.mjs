/* Corre en GitHub Actions (.github/workflows/render-video.yml): baja la receta
 * de un video del Estudio Motion, lo graba a MP4 con Remotion (la misma
 * composición de motion/ que se ve en el panel) y lo sube a Vercel Blob con un
 * permiso de subida que da el sitio solo para ese archivo. Pase lo que pase,
 * al final avisa al sitio (listo con la URL, o el error). Ver server/studioRender.ts.
 *
 * Las dependencias salen de motion/node_modules (`npm ci --prefix motion`). */
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MOTION = join(ROOT, 'motion');
const requireMotion = createRequire(join(MOTION, 'package.json'));
const load = async (name) => import(pathToFileURL(requireMotion.resolve(name)).href);

const { VIDEO_ID, JOB_ID, SITE, RENDER_CALLBACK_SECRET } = process.env;

function fail(message) {
  console.error(message);
  process.exit(1);
}

if (!/^\d+$/.test(VIDEO_ID ?? '') || !/^[0-9a-f-]{36}$/.test(JOB_ID ?? '')) fail('video_id o job_id inválidos.');
if (!RENDER_CALLBACK_SECRET) fail('Falta el secreto RENDER_CALLBACK_SECRET en el repo.');
// El secreto solo se manda al sitio de Playroom (o a una vista previa de Vercel).
const site = new URL(SITE ?? '');
if (site.protocol !== 'https:' || !(/(^|\.)mansionplayroom\.cl$/.test(site.host) || /\.vercel\.app$/.test(site.host))) fail(`Sitio no permitido: ${SITE}`);
const api = `${site.origin}/api/studio-render/${VIDEO_ID}`;
const auth = { Authorization: `Bearer ${RENDER_CALLBACK_SECRET}` };

async function call(path, init = {}) {
  const request = () => fetch(`${api}${path}`, { ...init, headers: { ...auth, 'Content-Type': 'application/json', ...(init.headers ?? {}) } });
  let res;
  try {
    res = await request();
  } catch {
    // Después de grabar (un minuto sin hablar con el sitio) la conexión que
    // quedó abierta ya la cerró el otro lado: se reintenta una vez con una nueva.
    await new Promise((r) => setTimeout(r, 2000));
    res = await request();
  }
  if (!res.ok) throw new Error(`${path} respondió ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

async function done(body) {
  try {
    await call('/done', { method: 'POST', body: JSON.stringify({ jobId: JOB_ID, ...body }) });
  } catch (err) {
    console.error('No se pudo avisar al sitio:', err.message);
  }
}

try {
  // 1. La receta (ya limpia: URLs completas del sitio o de Vercel Blob).
  const { spec } = await call(`/job?jobId=${encodeURIComponent(JOB_ID)}`);
  if (!spec || typeof spec !== 'object') throw new Error('El sitio no entregó la receta del video.');
  console.log(`Receta: ${spec.template} / ${spec.style} / ${spec.format}, ${spec.scenes?.length ?? 0} escena(s).`);

  // 2. Grabar con Remotion.
  const { bundle } = await load('@remotion/bundler');
  const { ensureBrowser, renderMedia, selectComposition } = await load('@remotion/renderer');
  await ensureBrowser();
  const serveUrl = await bundle({ entryPoint: join(MOTION, 'index.ts'), publicDir: join(ROOT, 'client/public') });
  const inputProps = { spec };
  const composition = await selectComposition({ serveUrl, id: 'Motion', inputProps });
  const outDir = join(tmpdir(), `video-${VIDEO_ID}`);
  mkdirSync(outDir, { recursive: true });
  const output = join(outDir, 'video.mp4');
  let lastPct = -10;
  await renderMedia({
    composition,
    serveUrl,
    codec: 'h264',
    crf: 17,
    outputLocation: output,
    inputProps,
    onProgress: ({ progress }) => {
      const pct = Math.floor(progress * 100);
      if (pct >= lastPct + 10) { lastPct = pct; console.log(`Grabando… ${pct} %`); }
    },
  });
  const mp4 = readFileSync(output);
  console.log(`MP4: ${(mp4.length / 1024 / 1024).toFixed(1)} MB, ${composition.durationInFrames} cuadros.`);

  // 3. Subir con el permiso que da el sitio (solo para este archivo, 30 min).
  const { pathname, clientToken } = await call('/upload-token', { method: 'POST', body: JSON.stringify({ jobId: JOB_ID }) });
  const { put } = await import(pathToFileURL(join(MOTION, 'node_modules/@vercel/blob/dist/client.js')).href);
  const blob = await put(pathname, mp4, { access: 'public', token: clientToken, contentType: 'video/mp4', multipart: mp4.length > 20 * 1024 * 1024 });
  console.log(`Subido: ${blob.url}`);

  await done({ url: blob.url });
} catch (err) {
  console.error(err);
  await done({ error: String(err?.message ?? err).slice(0, 400) });
  process.exit(1);
}
