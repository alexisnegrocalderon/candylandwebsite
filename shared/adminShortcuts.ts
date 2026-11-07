/* Atajos del panel para la app Atajos de iPhone/iPad: cada uno es un link que abre el panel directo en una pantalla.
 * La lista la edita el dueño en Ajustes → Atajos y se guarda en siteSettings.adminAlertsConfig.shortcuts. */

export interface AdminShortcut { label: string; section: string }

export const ADMIN_SHORTCUTS_MAX = 30;

export const DEFAULT_ADMIN_SHORTCUTS: AdminShortcut[] = [
  { label: 'Cargar gasto', section: 'cargar-gasto' },
  { label: 'Resumen de la noche', section: 'overview' },
  { label: 'Promo Flash', section: 'flash-promo' },
  { label: 'Ventas web', section: 'orders-web' },
  { label: 'Acceso manual (regalar entrada)', section: 'manual-access' },
  { label: 'Mensajes de Instagram', section: 'instagram' },
  { label: 'Nuevo mailing', section: 'mailing' },
  { label: 'Playmatch en vivo', section: 'playmatch-control' },
];

const SAFE_SECTION = /^[a-z0-9-]{1,40}$/;

/** Limpia una lista de atajos venida de afuera. `null` = nunca se editó: se usa la lista de siempre. */
export function normalizeShortcuts(raw: unknown): AdminShortcut[] | null {
  if (!Array.isArray(raw)) return null;
  const out: AdminShortcut[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const label = typeof (item as any).label === 'string' ? (item as any).label.trim().slice(0, 60) : '';
    const section = typeof (item as any).section === 'string' ? (item as any).section.trim() : '';
    if (!label || !SAFE_SECTION.test(section)) continue;
    out.push({ label, section });
    if (out.length >= ADMIN_SHORTCUTS_MAX) break;
  }
  return out;
}
