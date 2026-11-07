/* Grabar un video del Estudio Motion a MP4: el servidor guarda la receta del
 * video (shared/motionSpec.ts) y le pide a GitHub Actions que la grabe con
 * Remotion (.github/workflows/render-video.yml). La máquina de GitHub pide la
 * receta, graba, sube el MP4 a Vercel Blob y avisa. Acá vive lo puro: qué
 * receta se acepta y en qué estado queda cada grabación. */
import { cleanMediaUrl, normalizeMotionSpec, type MotionSpec } from './motionSpec';

/** Lo que recibe la máquina de GitHub. */
export interface RenderProject {
  spec: MotionSpec;
}

/** Más que esto sin respuesta es que la grabación murió en el camino. */
export const RENDER_TIMEOUT_MS = 25 * 60_000;

export type RenderStatus = 'grabando' | 'listo' | 'error';

/** Lo que se guarda en el video (`data.render`). La receta (`job`) se guarda
 * solo mientras se graba: después ya no hace falta. */
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

/** Deja la receta lista para grabar: limpia, con las rutas del sitio como URL
 * completa y solo con fotos/voz del sitio o de Vercel Blob. Lanza con un
 * mensaje para el dueño. */
export function cleanRenderProject(raw: unknown, siteOrigin: string): RenderProject {
  const spec = normalizeMotionSpec(raw);
  const site = siteOrigin.replace(/\/+$/, '');
  const absolute = (url: string) => {
    const clean = cleanMediaUrl(url);
    const full = clean.startsWith('/') ? `${site}${clean}` : clean;
    if (!isAllowedAssetUrl(full, site)) throw new Error(`Un archivo del video no viene del sitio ni del almacenamiento de fotos: ${url.slice(0, 80)}`);
    return full;
  };
  return {
    spec: {
      ...spec,
      scenes: spec.scenes.map((s) => (s.media ? { ...s, media: { ...s.media, url: absolute(s.media.url) } } : s)),
      voice: spec.voice ? { ...spec.voice, url: absolute(spec.voice.url) } : null,
    },
  };
}

/** Huella de una receta (para saber si el MP4 quedó viejo). */
export function specHash(spec: MotionSpec): string {
  const { title: _t, caption: _c, ...visual } = spec;
  return contentHash(JSON.stringify(visual));
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
  const job = r.job && typeof r.job === 'object' && (r.job as Record<string, unknown>).spec ? (r.job as RenderProject) : null;
  return {
    status,
    jobId: r.jobId,
    requestedAt: Number(r.requestedAt) || 0,
    finishedAt: r.finishedAt == null ? null : Number(r.finishedAt) || null,
    contentHash: typeof r.contentHash === 'string' ? r.contentHash : '',
    url: typeof r.url === 'string' ? r.url : null,
    error: typeof r.error === 'string' ? r.error : null,
    job,
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
