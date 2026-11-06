import { OPEN_SECTION_EVENT } from '@/components/admin/shell/nav';

/* Abrir el Estudio con un evento ya elegido (desde la lista de eventos). */
const KEY = 'motion-studio-event';

export function openStudioForEvent(eventId: number): void {
  try {
    window.sessionStorage.setItem(KEY, String(eventId));
  } catch { /* sin sessionStorage: abre con el próximo evento */ }
  window.dispatchEvent(new CustomEvent(OPEN_SECTION_EVENT, { detail: 'studio' }));
}

/** El evento pedido (una sola vez), o null. */
export function takeStudioEvent(): number | null {
  try {
    const raw = window.sessionStorage.getItem(KEY);
    window.sessionStorage.removeItem(KEY);
    const id = Number(raw);
    return Number.isInteger(id) && id > 0 ? id : null;
  } catch {
    return null;
  }
}
