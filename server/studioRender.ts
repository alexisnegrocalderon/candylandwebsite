import { randomUUID } from 'crypto';
import type { Express, Request, Response } from 'express';
import { generateClientTokenFromReadWriteToken } from '@vercel/blob/client';
import { ENV } from './_core/env';
import { safeCompare } from './adminSecurity';
import { readVideoRender, writeVideoRender } from './contentStudio';
import { cleanRenderProject, contentHash, summarizeRender, type RenderProject, type RenderState, type RenderSummary } from '../shared/studioRender';

/* Grabar un video del Estudio a MP4 con GitHub Actions (shared/studioRender.ts).
 *
 * 1. El panel manda el proyecto (index.html + archivos) → `requestVideoRender`
 *    lo guarda en el video y dispara .github/workflows/render-video.yml con
 *    solo el id del video, el id de la grabación y la dirección del sitio.
 * 2. El repo es público: los datos con que se dispara un workflow los ve
 *    cualquiera. Por eso ninguna clave va ahí. La máquina de GitHub pide el
 *    proyecto y el permiso de subida a estas rutas con RENDER_CALLBACK_SECRET
 *    (un secreto del repo), y el permiso sirve solo para subir ESE MP4, por
 *    30 minutos.
 * 3. Sube el MP4 directo a Vercel Blob (un video no cabe en el body de una
 *    función de Vercel) y avisa con la URL a `/done`. */

const blobToken = () => process.env.BLOB_READ_WRITE_TOKEN || process.env.NEW_BLOB_READ_WRITE_TOKEN;
const SITE = (process.env.APP_URL || 'https://mansionplayroom.cl').replace(/\/+$/, '');
const WORKFLOW = 'render-video.yml';
const MAX_VIDEO_BYTES = 300 * 1024 * 1024;

export function renderConfigured(): boolean {
  return !!(ENV.githubRenderToken && ENV.renderCallbackSecret && blobToken());
}

/** Qué falta configurar, en palabras del dueño (vacío = todo listo). */
export function renderMissingConfig(): string[] {
  const missing: string[] = [];
  if (!ENV.githubRenderToken) missing.push('GITHUB_RENDER_TOKEN (en Vercel)');
  if (!ENV.renderCallbackSecret) missing.push('RENDER_CALLBACK_SECRET (en Vercel y como secreto del repo en GitHub)');
  if (!blobToken()) missing.push('BLOB_READ_WRITE_TOKEN (Vercel Blob)');
  return missing;
}

async function dispatchWorkflow(videoId: number, jobId: string): Promise<void> {
  const res = await fetch(`https://api.github.com/repos/${ENV.githubRenderRepo}/actions/workflows/${WORKFLOW}/dispatches`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${ENV.githubRenderToken}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ ref: ENV.githubRenderRef, inputs: { video_id: String(videoId), job_id: jobId, site: SITE } }),
  });
  if (res.status !== 204) {
    const detail = (await res.text().catch(() => '')).slice(0, 200);
    console.error('[StudioRender] GitHub respondió', res.status, detail);
    throw new Error(res.status === 401 || res.status === 403
      ? 'GitHub rechazó el permiso (GITHUB_RENDER_TOKEN vencido o sin acceso a Actions).'
      : res.status === 404
        ? 'GitHub no encontró el workflow de grabación (¿está en la rama principal?).'
        : `GitHub no pudo empezar la grabación (${res.status}).`);
  }
}

/** Pide grabar un video ya guardado. */
export async function requestVideoRender(videoId: number, raw: RenderProject): Promise<RenderSummary> {
  const missing = renderMissingConfig();
  if (missing.length) throw new Error(`Falta configurar la grabación: ${missing.join(', ')}.`);
  const { exists, render } = await readVideoRender(videoId);
  if (!exists) throw new Error('Guarda el video antes de exportarlo.');
  const now = Date.now();
  if (render && summarizeRender(render, now).status === 'grabando') throw new Error('Este video ya se está grabando. Espera a que termine.');
  const job = cleanRenderProject(raw, SITE);
  const state: RenderState = {
    status: 'grabando',
    jobId: randomUUID(),
    requestedAt: now,
    finishedAt: null,
    contentHash: contentHash(job.html),
    url: render?.url ?? null,
    error: null,
    job,
  };
  await writeVideoRender(videoId, state);
  try {
    await dispatchWorkflow(videoId, state.jobId);
  } catch (err) {
    await writeVideoRender(videoId, { ...state, status: 'error', finishedAt: Date.now(), error: err instanceof Error ? err.message : 'No se pudo empezar.', job: null });
    throw err;
  }
  return summarizeRender(state, now);
}

/* --- Rutas para la máquina de GitHub -------------------------------------- */

function authorized(req: Request, res: Response): boolean {
  const auth = req.headers.authorization ?? '';
  if (!ENV.renderCallbackSecret || !safeCompare(auth, `Bearer ${ENV.renderCallbackSecret}`)) {
    res.status(401).json({ error: 'No autorizado' });
    return false;
  }
  return true;
}

/** La grabación en curso de ese video, si el id de grabación calza. */
async function activeJob(req: Request, res: Response): Promise<{ id: number; render: RenderState; title: string } | null> {
  const id = Number(req.params.id);
  const jobId = String((req.method === 'GET' ? req.query.jobId : req.body?.jobId) ?? '');
  if (!Number.isInteger(id) || id <= 0 || !jobId) {
    res.status(400).json({ error: 'Faltan datos' });
    return null;
  }
  const { render, title } = await readVideoRender(id);
  if (!render || !safeCompare(render.jobId, jobId) || render.status !== 'grabando') {
    res.status(409).json({ error: 'Esa grabación ya no está activa' });
    return null;
  }
  return { id, render, title };
}

function slug(text: string) {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50) || 'video';
}

export function registerStudioRenderRoutes(app: Express) {
  app.get('/api/studio-render/:id/job', async (req: Request, res: Response) => {
    if (!authorized(req, res)) return;
    try {
      const job = await activeJob(req, res);
      if (!job) return;
      if (!job.render.job) { res.status(410).json({ error: 'El proyecto ya no está' }); return; }
      res.json(job.render.job);
    } catch (err) {
      console.error('[StudioRender] job', err);
      res.status(500).json({ error: 'Error interno' });
    }
  });

  app.post('/api/studio-render/:id/upload-token', async (req: Request, res: Response) => {
    if (!authorized(req, res)) return;
    try {
      const job = await activeJob(req, res);
      if (!job) return;
      const token = blobToken();
      if (!token) { res.status(503).json({ error: 'Sin almacenamiento configurado' }); return; }
      const pathname = `studio-videos/${job.id}-${slug(job.title)}.mp4`;
      const clientToken = await generateClientTokenFromReadWriteToken({
        token,
        pathname,
        allowedContentTypes: ['video/mp4'],
        maximumSizeInBytes: MAX_VIDEO_BYTES,
        validUntil: Date.now() + 30 * 60_000,
        addRandomSuffix: true,
      });
      res.json({ pathname, clientToken });
    } catch (err) {
      console.error('[StudioRender] upload-token', err);
      res.status(500).json({ error: 'Error interno' });
    }
  });

  app.post('/api/studio-render/:id/done', async (req: Request, res: Response) => {
    if (!authorized(req, res)) return;
    try {
      const job = await activeJob(req, res);
      if (!job) return;
      const url = typeof req.body?.url === 'string' ? req.body.url : '';
      const error = typeof req.body?.error === 'string' ? req.body.error.slice(0, 500) : '';
      let okUrl = false;
      try { okUrl = /\.public\.blob\.vercel-storage\.com$/.test(new URL(url).host); } catch { okUrl = false; }
      const finished: RenderState = okUrl
        ? { ...job.render, status: 'listo', url, error: null, finishedAt: Date.now(), job: null }
        : { ...job.render, status: 'error', error: error || 'La grabación terminó sin video.', finishedAt: Date.now(), job: null };
      await writeVideoRender(job.id, finished);
      res.json({ ok: true });
    } catch (err) {
      console.error('[StudioRender] done', err);
      res.status(500).json({ error: 'Error interno' });
    }
  });
}
