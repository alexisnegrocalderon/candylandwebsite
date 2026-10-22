/* Grabar un video del Estudio a MP4 (fase 3): el panel arma el proyecto de
 * HyperFrames (index.html + qué archivo va en cada `assets/...`), el servidor
 * lo guarda en el video y le pide a GitHub Actions que lo grabe
 * (.github/workflows/render-video.yml). La máquina de GitHub pide el proyecto,
 * graba, sube el MP4 a Vercel Blob y avisa. Acá vive lo puro: qué proyecto se
 * acepta y en qué estado queda cada grabación. */

/** Lo que manda el panel. */
export interface RenderProject {
  html: string;
  /** [ruta local en el proyecto, de dónde bajarlo]. El panel manda rutas del
   * sitio ("/studio/fonts/x.woff2") o URLs completas; el servidor deja todo
   * como URL completa contra la dirección oficial del sitio. */
  assets: Array<[string, string]>;
}

export const RENDER_MAX_HTML = 3_000_000;
export const RENDER_MAX_ASSETS = 80;
/** Más que esto sin respuesta es que la grabación murió en el camino. */
export const RENDER_TIMEOUT_MS = 25 * 60_000;

export type RenderStatus = 'grabando' | 'listo' | 'error';

/** Lo que se guarda en el video (`data.render`). El proyecto (`job`) se
 * guarda solo mientras se graba: después ya no hace falta. */
export interface RenderState {
  status: RenderStatus;
  jobId: string;
  requestedAt: number;
  finishedAt: number | null;
  /** Huella del contenido grabado: si el video cambió después, el MP4 quedó viejo. */
  contentHash: string;
  url: string | null;
  error: string | null;
  job: RenderProject | null;
}

/** Hosts desde donde la máquina de GitHub puede bajar archivos: el sitio y
 * el almacenamiento de fotos (Vercel Blob). Nada más. */
export function isAllowedAssetUrl(url: string, siteOrigin: string): boolean {
  let u: URL;
  try { u = new URL(url); } catch { return false; }
  if (u.protocol !== 'https:') return false;
  const site = new URL(siteOrigin).host;
  return u.host === site || u.host === `www.${site}` || /\.public\.blob\.vercel-storage\.com$/.test(u.host);
}

/** Valida y limpia el proyecto que manda el panel. Lanza con un mensaje para el dueño. */
export function cleanRenderProject(raw: RenderProject, siteOrigin: string): RenderProject {
  if (typeof raw.html !== 'string' || !raw.html.includes('window.__timelines')) throw new Error('El proyecto del video está incompleto.');
  if (raw.html.length > RENDER_MAX_HTML) throw new Error('El video es demasiado grande para grabarlo.');
  if (!Array.isArray(raw.assets) || raw.assets.length > RENDER_MAX_ASSETS) throw new Error('El video usa demasiados archivos.');
  const seen = new Set<string>();
  const assets: Array<[string, string]> = [];
  for (const pair of raw.assets) {
    const [local, url] = Array.isArray(pair) ? pair : [];
    if (typeof local !== 'string' || !/^assets\/[A-Za-z0-9._-]{1,120}$/.test(local) || local.includes('..')) throw new Error('Un archivo del video tiene un nombre inválido.');
    const full = typeof url === 'string' && /^\/(?!\/)/.test(url) ? `${siteOrigin.replace(/\/+$/, '')}${url}` : url;
    if (typeof full !== 'string' || !isAllowedAssetUrl(full, siteOrigin)) throw new Error(`Un archivo del video no viene del sitio ni del almacenamiento de fotos: ${String(url).slice(0, 80)}`);
    if (seen.has(local)) continue;
    seen.add(local);
    assets.push([local, full]);
  }
  return { html: raw.html, assets };
}

/** Huella corta y estable del contenido (FNV-1a de 32 bits); solo compara versiones. */
export function contentHash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

export function normalizeRenderState(raw: unknown): RenderState | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const status = r.status === 'grabando' || r.status === 'listo' || r.status === 'error' ? r.status : null;
  if (!status || typeof r.jobId !== 'string') return null;
  const job = r.job && typeof r.job === 'object' ? (r.job as RenderProject) : null;
  return {
    status,
    jobId: r.jobId,
    requestedAt: Number(r.requestedAt) || 0,
    finishedAt: r.finishedAt == null ? null : Number(r.finishedAt) || null,
    contentHash: typeof r.contentHash === 'string' ? r.contentHash : '',
    url: typeof r.url === 'string' ? r.url : null,
    error: typeof r.error === 'string' ? r.error : null,
    job: job && typeof job.html === 'string' && Array.isArray(job.assets) ? job : null,
  };
}

/** Lo que ve el panel: sin el proyecto, y con «grabando» vencido convertido en error. */
export interface RenderSummary {
  status: RenderStatus | 'nunca';
  url: string | null;
  error: string | null;
  requestedAt: number | null;
  finishedAt: number | null;
  contentHash: string | null;
}

export function summarizeRender(state: RenderState | null, now: number): RenderSummary {
  if (!state) return { status: 'nunca', url: null, error: null, requestedAt: null, finishedAt: null, contentHash: null };
  const expired = state.status === 'grabando' && now - state.requestedAt > RENDER_TIMEOUT_MS;
  return {
    status: expired ? 'error' : state.status,
    url: state.url,
    error: expired ? 'La grabación no respondió a tiempo. Vuelve a intentarlo.' : state.error,
    requestedAt: state.requestedAt,
    finishedAt: state.finishedAt,
    contentHash: state.contentHash,
  };
}
