import { normalizeStudioDesign, type StudioDesign } from '@shared/contentStudio';
import { normalizeStudioVideo, type StudioVideo } from '@shared/studioVideo';

/* "Abrir en Estudio" desde el Plan de contenido: el diseño armado con la pieza
 * se deja en sessionStorage y se le pide al panel que cambie de sección
 * (Dashboard escucha `admin:open-section`). El Estudio lo toma al montarse. */

const KEY = 'admin-studio-pending';
export const OPEN_SECTION_EVENT = 'admin:open-section';

export function openInStudio(design: StudioDesign) {
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify(design));
  } catch { /* sin sessionStorage: el Estudio abre igual, sin el diseño */ }
  window.dispatchEvent(new CustomEvent(OPEN_SECTION_EVENT, { detail: 'studio' }));
}

export function takeQueuedDesign(): StudioDesign | null {
  try {
    const raw = window.sessionStorage.getItem(KEY);
    if (!raw) return null;
    window.sessionStorage.removeItem(KEY);
    return normalizeStudioDesign(JSON.parse(raw));
  } catch {
    return null;
  }
}

/* Lo mismo para un video (p. ej. «Hacer video» desde un guion de Reel). */
const VIDEO_KEY = 'admin-studio-pending-video';

export function openVideoInStudio(video: StudioVideo) {
  try {
    window.sessionStorage.setItem(VIDEO_KEY, JSON.stringify(video));
  } catch { /* sin sessionStorage: el Estudio abre igual, sin el video */ }
  window.dispatchEvent(new CustomEvent(OPEN_SECTION_EVENT, { detail: 'studio' }));
}

export function takeQueuedVideo(): StudioVideo | null {
  try {
    const raw = window.sessionStorage.getItem(VIDEO_KEY);
    if (!raw) return null;
    window.sessionStorage.removeItem(VIDEO_KEY);
    return normalizeStudioVideo(JSON.parse(raw), normalizeStudioDesign);
  } catch {
    return null;
  }
}

/* «Contenido» de un evento (botón en la lista de eventos): deja el id del
 * evento para que el Estudio abra su paquete ya con ese evento elegido. */
const PACK_KEY = 'admin-studio-pending-pack';

export function openEventPackInStudio(eventId: number) {
  try {
    window.sessionStorage.setItem(PACK_KEY, String(eventId));
  } catch { /* sin sessionStorage: el Estudio abre igual, sin el evento */ }
  window.dispatchEvent(new CustomEvent(OPEN_SECTION_EVENT, { detail: 'studio' }));
}

export function takeQueuedEventPack(): number | null {
  try {
    const raw = window.sessionStorage.getItem(PACK_KEY);
    if (!raw) return null;
    window.sessionStorage.removeItem(PACK_KEY);
    const id = Number(raw);
    return Number.isInteger(id) && id > 0 ? id : null;
  } catch {
    return null;
  }
}
