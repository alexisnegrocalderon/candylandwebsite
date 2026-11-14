import { upload } from '@vercel/blob/client';
import { BACKDROP_HZ, BACKDROP_MAX_SECS, BACKDROP_MIN_SECS, analyzeFrame, backdropSamples, buildBackdropAnalysis, type FrameStat, type MotionBackdrop } from '@shared/motionBackdrop';

/* Subir y analizar el video de fondo, todo en el navegador: se lee con un <video> escondido (sin sonido), se miden unos
 * cuadros chicos cada medio segundo (luz y detalle de arriba, centro y abajo, y los cortes de plano) y el archivo va directo a
 * Vercel Blob. Nada pasa por el servidor ni gasta IA.
 *
 * Pensado para el iPhone y el iPad: un solo <video>, cuadros de 54×96 px, un cuadro a la vez, se puede cancelar y se
 * suelta todo al terminar (la memoria del celular es lo primero que se acaba). */

export const BACKDROP_ACCEPT = 'video/mp4,video/quicktime,video/webm,.mp4,.mov,.webm,.m4v';
export const BACKDROP_MAX_BYTES = 150 * 1024 * 1024;
/** El cuadro de análisis: vertical 9:16, el recorte que se ve en un reel. */
const W = 54;
const H = 96;
const SEEK_TIMEOUT_MS = 12000;

export class AnalysisCancelled extends Error {
  constructor() {
    super('Análisis cancelado.');
  }
}

export interface VideoAnalysis {
  duration: number;
  width: number;
  height: number;
  luma: number[];
  busy: number[];
  cuts: number[];
}

function once(el: HTMLVideoElement, ok: string, ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const done = (fn: () => void) => { cleanup(); fn(); };
    const onOk = () => done(resolve);
    const onErr = () => done(() => reject(new Error('decode')));
    const onAbort = () => done(() => reject(new AnalysisCancelled()));
    const timer = window.setTimeout(() => done(() => reject(new Error('timeout'))), ms);
    const cleanup = () => {
      window.clearTimeout(timer);
      el.removeEventListener(ok, onOk);
      el.removeEventListener('error', onErr);
      signal?.removeEventListener('abort', onAbort);
    };
    el.addEventListener(ok, onOk);
    el.addEventListener('error', onErr);
    signal?.addEventListener('abort', onAbort);
    if (signal?.aborted) onAbort();
  });
}

const UNREADABLE = 'Este navegador no puede leer ese video (pasa con los videos HEVC del iPhone en Chrome). Expórtalo como MP4 (H.264) o ábrelo desde Safari.';

/** Lee el video y mide luz, detalle y cortes. Lanza un error en español si no sirve. No lo sube. */
export async function analyzeVideoFile(file: File, onProgress: (fraction: number) => void, signal?: AbortSignal): Promise<VideoAnalysis> {
  if (file.size > BACKDROP_MAX_BYTES) throw new Error(`El video pesa más de ${Math.round(BACKDROP_MAX_BYTES / 1024 / 1024)} MB. Usa uno más liviano o recórtalo.`);
  const url = URL.createObjectURL(file);
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  video.setAttribute('playsinline', '');
  video.src = url;
  try {
    try {
      await once(video, 'loadeddata', SEEK_TIMEOUT_MS, signal);
    } catch (err) {
      if (err instanceof AnalysisCancelled) throw err;
      throw new Error(UNREADABLE);
    }
    const duration = video.duration;
    if (!Number.isFinite(duration) || video.videoWidth === 0) throw new Error(UNREADABLE);
    if (duration < BACKDROP_MIN_SECS) throw new Error('El video dura menos de 1 s.');
    if (duration > BACKDROP_MAX_SECS) throw new Error(`El video dura ${Math.round(duration)} s: usa uno de hasta ${BACKDROP_MAX_SECS / 60} minutos o recórtalo antes.`);
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('Este navegador no puede analizar video.');
    // Se recorta al centro en 9:16, igual que lo que se verá en el reel.
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    const want = W / H;
    const sw = vw / vh > want ? vh * want : vw;
    const sh = vw / vh > want ? vh : vw / want;
    const sx = (vw - sw) / 2;
    const sy = (vh - sh) / 2;
    // iOS a veces no pinta el primer cuadro en el canvas hasta que el video «arrancó» una vez (mudo, se permite sin tocar nada).
    try { await video.play(); video.pause(); } catch { /* si no deja, se sigue igual */ }

    const samples = backdropSamples(duration);
    const frames: FrameStat[] = [];
    for (let i = 0; i < samples; i++) {
      if (signal?.aborted) throw new AnalysisCancelled();
      const t = Math.min(duration - 0.05, i / BACKDROP_HZ);
      video.currentTime = t;
      try {
        await once(video, 'seeked', SEEK_TIMEOUT_MS, signal);
      } catch (err) {
        if (err instanceof AnalysisCancelled) throw err;
        throw new Error(err instanceof Error && err.message === 'timeout' ? 'El video tardó demasiado en leerse. Prueba con uno más corto o en MP4.' : UNREADABLE);
      }
      ctx.drawImage(video, sx, sy, sw, sh, 0, 0, W, H);
      frames.push(analyzeFrame(ctx.getImageData(0, 0, W, H).data, W, H));
      onProgress((i + 1) / samples);
      // Cede el hilo para que el panel pinte el avance (y el celular no se congele).
      if (i % 4 === 3) await new Promise((r) => setTimeout(r, 0));
    }
    // Un video completamente negro en todos los cuadros: casi seguro un códec que el navegador no pinta.
    if (frames.every((f) => f.luma.every((v) => v === 0) && f.grid.every((v) => v === 0))) throw new Error(UNREADABLE);
    const built = buildBackdropAnalysis(frames);
    return { duration: Math.round(duration * 100) / 100, width: vw, height: vh, ...built };
  } finally {
    video.pause();
    video.removeAttribute('src');
    video.load();
    URL.revokeObjectURL(url);
  }
}

/** Sube el video a Vercel Blob y arma el fondo listo para la receta. */
export async function uploadAndBuildBackdrop(file: File, analysis: VideoAnalysis, onProgress: (fraction: number) => void): Promise<MotionBackdrop> {
  const safe = file.name.replace(/[^\w.\-]+/g, '_').slice(-80);
  const blob = await upload(`studio-backdrops/${Date.now()}-${safe}`, file, {
    access: 'public',
    handleUploadUrl: '/api/admin/blob/upload',
    multipart: file.size > 20 * 1024 * 1024,
    onUploadProgress: ({ percentage }) => onProgress(percentage / 100),
  });
  return {
    url: blob.url,
    name: file.name.replace(/\.[a-z0-9]+$/i, '').slice(0, 80) || 'Video',
    duration: analysis.duration,
    start: 0,
    loop: 'repetir',
    mix: 0,
    audio: 'silencio',
    adapt: 'auto',
    luma: analysis.luma,
    busy: analysis.busy,
    cuts: analysis.cuts,
  };
}
