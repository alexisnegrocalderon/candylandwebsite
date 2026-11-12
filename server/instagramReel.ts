import { ENV } from './_core/env';

/* Publicar un video como Reel en la cuenta de la marca (@mansionplayroom).
 *
 * Flujo de la Graph API de Instagram (en dos pasos más una espera):
 *   1. POST /{ig-user}/media        → crea un contenedor con la video_url pública.
 *   2. GET  /{contenedor}?fields=status_code → Meta procesa el video (puede tardar).
 *   3. POST /{ig-user}/media_publish → lo publica con el contenedor ya FINISHED.
 *
 * Solo se llama desde server/motionStudio.ts, y solo cuando el dueño aprobó el
 * video: nunca se publica algo que no pasó por «Por aprobar». */

const GRAPH_VERSION = 'v23.0';
const GRAPH_BASE = `https://graph.instagram.com/${GRAPH_VERSION}`;

/** Cuánto esperamos a que Meta procese el video antes de rendirnos. */
export const REEL_POLL_TIMEOUT_MS = 5 * 60 * 1000;
export const REEL_POLL_INTERVAL_MS = 5_000;

export class InstagramReelError extends Error {
  constructor(message: string, readonly code?: number) {
    super(message);
    this.name = 'InstagramReelError';
  }
}

/** El caption tal como va a Instagram: sin espacios sobrantes y como máximo 2200 caracteres (límite de Meta). */
export function reelCaption(raw: string): string {
  return raw.trim().slice(0, 2200);
}

/** Estados que devuelve Meta mientras procesa el contenedor. */
export type ReelContainerStatus = 'IN_PROGRESS' | 'FINISHED' | 'ERROR' | 'EXPIRED' | 'PUBLISHED' | 'UNKNOWN';

/** Decide qué hacer con el estado de un contenedor: esperar, publicar o fallar. */
export function reelStatusAction(status: string | undefined): 'wait' | 'publish' | 'fail' {
  if (status === 'FINISHED') return 'publish';
  if (status === 'ERROR' || status === 'EXPIRED') return 'fail';
  // IN_PROGRESS, desconocido o vacío: seguimos esperando hasta el tiempo límite.
  return 'wait';
}

async function graph<T>(method: 'GET' | 'POST', path: string, params: Record<string, string> = {}): Promise<T> {
  if (!ENV.igAccessToken || !ENV.igUserId) {
    throw new InstagramReelError('Faltan IG_ACCESS_TOKEN o IG_USER_ID en el servidor.');
  }
  const url = new URL(`${GRAPH_BASE}/${path}`);
  const init: RequestInit = { method, headers: { Authorization: `Bearer ${ENV.igAccessToken}` } };
  if (method === 'GET') {
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  } else {
    init.body = new URLSearchParams(params);
  }
  const response = await fetch(url, init);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = (body as { error?: { message?: string; code?: number } }).error;
    throw new InstagramReelError(error?.message ?? `Instagram respondió ${response.status}`, error?.code);
  }
  return body as T;
}

/** Espera a que el contenedor esté listo. Lanza error si Meta lo rechaza o si se acaba el tiempo. */
async function waitUntilReady(containerId: string, timeoutMs: number, intervalMs: number, sleep: (ms: number) => Promise<void>): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const { status_code, status } = await graph<{ status_code?: string; status?: string }>('GET', containerId, { fields: 'status_code,status' });
    const action = reelStatusAction(status_code);
    if (action === 'publish') return;
    if (action === 'fail') throw new InstagramReelError(`Instagram no pudo procesar el video (${status_code}${status ? `: ${status}` : ''}).`);
    if (Date.now() >= deadline) throw new InstagramReelError('Instagram tardó demasiado en procesar el video. Intenta publicarlo de nuevo.');
    await sleep(intervalMs);
  }
}

export interface PublishReelInput {
  /** URL pública del MP4 (Vercel Blob). Instagram la descarga, así que no puede requerir login. */
  videoUrl: string;
  caption: string;
}

/** Publica el video como Reel y devuelve el id del media publicado. */
export async function publishReel(input: PublishReelInput, opts: { timeoutMs?: number; intervalMs?: number; sleep?: (ms: number) => Promise<void> } = {}): Promise<{ mediaId: string }> {
  const sleep = opts.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const { id: containerId } = await graph<{ id: string }>('POST', `${ENV.igUserId}/media`, {
    media_type: 'REELS',
    video_url: input.videoUrl,
    caption: reelCaption(input.caption),
    share_to_feed: 'true',
  });
  if (!containerId) throw new InstagramReelError('Instagram no devolvió un contenedor para el video.');
  await waitUntilReady(containerId, opts.timeoutMs ?? REEL_POLL_TIMEOUT_MS, opts.intervalMs ?? REEL_POLL_INTERVAL_MS, sleep);
  const { id: mediaId } = await graph<{ id: string }>('POST', `${ENV.igUserId}/media_publish`, { creation_id: containerId });
  if (!mediaId) throw new InstagramReelError('Instagram no confirmó la publicación.');
  return { mediaId };
}
