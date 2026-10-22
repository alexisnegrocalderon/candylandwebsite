/* Del texto que escribe la IA a lo que dibujan las plantillas y HyperFrames.
 * La IA nunca entrega HTML ni imágenes: solo escenas y textos, que acá se
 * limpian igual que lo que viene del panel (largos, tiempos, enlaces). */

import { normalizeStudioDesign } from './contentStudio';
import { normalizeStudioVideo, type StudioVideo, type VideoFormat } from './studioVideo';
import type { PhotoBrief } from './studioVariants';

/** Lo que devuelve la IA para un video. */
export interface QuickVideoData {
  title: string;
  caption: string;
  /** true = las escenas son pasos o puntos (llevan número); false = una historia corrida. */
  numbered: boolean;
  scenes: Array<{ title: string; body: string; secs: number }>;
  ctaLine: string;
  cta: string;
}

export function videoFromQuickData(data: QuickVideoData, opts: { format: VideoFormat; eventId: number | null; mediaUrl?: string }): StudioVideo | null {
  const scenes = (Array.isArray(data?.scenes) ? data.scenes : [])
    .filter((s) => s && typeof s.title === 'string' && s.title.trim() !== '')
    // La primera escena es el gancho: se lee en 3 segundos aunque la IA ponga menos.
    .map((s, i) => ({ title: s.title.trim(), body: typeof s.body === 'string' ? s.body.trim() : '', secs: i === 0 ? Math.max(Number(s.secs) || 0, 3) : Number(s.secs) || 2.5 }));
  if (scenes.length === 0) return null;
  return normalizeStudioVideo({
    title: data.title,
    template: data.numbered ? 'puntos' : 'guion',
    format: opts.format,
    theme: 'bubble',
    eventId: opts.eventId,
    caption: data.caption,
    mediaUrl: opts.mediaUrl ?? '',
    scenes,
    cta: data.cta,
    ctaLine: data.ctaLine,
  }, normalizeStudioDesign);
}

/** Lo que devuelve la IA para los textos de una foto. */
export interface QuickPhotoData {
  title: string;
  body: string;
  cta: string;
  footnote: string;
  caption: string;
}

const clip = (value: unknown, max: number) => (typeof value === 'string' ? value.replace(/[ \t]+/g, ' ').trim().slice(0, max) : '');

/** Pone los textos de la IA en el pedido de la foto, sin tocar la foto ni el evento. */
export function photoBriefFromQuickData(data: QuickPhotoData, current: PhotoBrief): PhotoBrief {
  return {
    ...current,
    title: clip(data.title, 120) || current.title,
    body: clip(data.body, 60) || current.body,
    cta: clip(data.cta, 40) || current.cta,
    footnote: clip(data.footnote, 60) || current.footnote,
    caption: clip(data.caption, 3000) || current.caption,
  };
}
