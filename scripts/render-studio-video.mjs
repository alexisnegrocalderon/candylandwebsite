/* Corre en GitHub Actions (.github/workflows/render-video.yml): baja el
 * proyecto de HyperFrames de un video del Estudio, lo graba a MP4 y lo sube a
 * Vercel Blob con un permiso de subida que da el sitio solo para ese archivo.
 * Pase lo que pase, al final avisa al sitio (listo con la URL, o el error).
 * Ver server/studioRender.ts. */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';

const HYPERFRAMES = 'hyperframes@0.8.185';
const BLOB = '@vercel/blob@2.8.0';

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

const run = (args, cwd) => execFileSync('npx', ['--yes', ...args], { cwd, stdio: 'inherit', env: process.env });

try {
  // 1. El proyecto: index.html y cada archivo en assets/.
  const project = await call(`/job?jobId=${encodeURIComponent(JOB_ID)}`);
  const dir = join(tmpdir(), `video-${VIDEO_ID}`);
  mkdirSync(join(dir, 'assets'), { recursive: true });
  writeFileSync(join(dir, 'index.html'), project.html);
  for (const [local, url] of project.assets) {
    const target = resolve(dir, local);
    if (!target.startsWith(join(dir, 'assets') + sep)) throw new Error(`Ruta inválida: ${local}`);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`No se pudo bajar ${url} (${res.status})`);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, Buffer.from(await res.arrayBuffer()));
  }
  console.log(`Proyecto listo: ${project.assets.length} archivo(s).`);

  // 2. Grabar.
  run([HYPERFRAMES, 'browser', 'ensure'], dir);
  run([HYPERFRAMES, 'render', '-o', 'video.mp4'], dir);
  const mp4 = readFileSync(join(dir, 'video.mp4'));
  console.log(`MP4: ${(mp4.length / 1024 / 1024).toFixed(1)} MB`);

  // 3. Subir con el permiso que da el sitio (solo para este archivo, 30 min).
  const { pathname, clientToken } = await call('/upload-token', { method: 'POST', body: JSON.stringify({ jobId: JOB_ID }) });
  const blobDir = join(tmpdir(), 'blob-client');
  execFileSync('npm', ['install', '--no-save', '--no-audit', '--no-fund', '--prefix', blobDir, BLOB], { stdio: 'inherit' });
  const { put } = await import(pathToFileURL(join(blobDir, 'node_modules/@vercel/blob/dist/client.js')).href);
  const blob = await put(pathname, mp4, { access: 'public', token: clientToken, contentType: 'video/mp4', multipart: mp4.length > 20 * 1024 * 1024 });
  console.log(`Subido: ${blob.url}`);

  await done({ url: blob.url });
} catch (err) {
  console.error(err);
  await done({ error: String(err?.message ?? err).slice(0, 400) });
  process.exit(1);
}
