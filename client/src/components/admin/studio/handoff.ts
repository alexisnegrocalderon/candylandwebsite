import { normalizeStudioDesign, type StudioDesign } from '@shared/contentStudio';

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
