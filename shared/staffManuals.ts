/* El manual del staff: un reglamento general para todos y un manual por cargo. Cada uno son secciones de texto o de
 * checklist, con versiones: al publicar un cambio nace una versión nueva y cada persona vuelve a aceptar. Lo puro (reglas,
 * saneado, estado de aceptación) vive acá; la base en server/staffManuals.ts; la pantalla en StaffAccount y StaffManager. */
import { isStaffCargo, type StaffCargo } from './staffCargos';

export const MANUAL_GENERAL = 'general';
export type ManualKey = typeof MANUAL_GENERAL | StaffCargo;

export interface ManualSection {
  title: string;
  kind: 'text' | 'checklist';
  /** Párrafos (kind = 'text'). */
  text: string;
  /** Tareas, una por línea (kind = 'checklist'). */
  items: string[];
}

export const MANUAL_LIMITS = { sections: 30, title: 80, text: 6000, items: 40, item: 200, docTitle: 120, changeNote: 255 } as const;

export function isManualKey(value: unknown): value is ManualKey {
  return value === MANUAL_GENERAL || isStaffCargo(value);
}

/** Qué manuales le tocan a un cargo: el general y el suyo (quien no tiene cargo, el de «otro»). */
export function manualKeysFor(cargo: string | null | undefined): ManualKey[] {
  return [MANUAL_GENERAL, isStaffCargo(cargo) ? cargo : 'otro'];
}

const clip = (s: unknown, max: number) => (typeof s === 'string' ? s : '').replace(/\r\n/g, '\n').trim().slice(0, max);

/** Deja las secciones limpias y dentro de los límites; las que quedan vacías se descartan. */
export function normalizeSections(raw: unknown): ManualSection[] {
  if (!Array.isArray(raw)) return [];
  const out: ManualSection[] = [];
  for (const r of raw) {
    if (!r || typeof r !== 'object') continue;
    const o = r as Record<string, unknown>;
    const kind = o.kind === 'checklist' ? 'checklist' : 'text';
    const title = clip(o.title, MANUAL_LIMITS.title);
    const items = (Array.isArray(o.items) ? o.items : []).map((i) => clip(i, MANUAL_LIMITS.item)).filter(Boolean).slice(0, MANUAL_LIMITS.items);
    const text = clip(o.text, MANUAL_LIMITS.text);
    if (kind === 'checklist' ? items.length === 0 : !text) continue;
    out.push({ title: title || (kind === 'checklist' ? 'Tareas' : 'Sección'), kind, text: kind === 'text' ? text : '', items: kind === 'checklist' ? items : [] });
    if (out.length >= MANUAL_LIMITS.sections) break;
  }
  return out;
}

export type AcceptStatus = 'sin_manual' | 'pendiente' | 'desactualizado' | 'al_dia';

/** ¿Aceptó lo vigente? `published`: versión actual de cada manual publicado; `accepted`: la última que aceptó la persona. */
export function acceptanceStatus(keys: string[], published: Map<string, number>, accepted: Map<string, number>): AcceptStatus {
  const required = keys.filter((k) => published.has(k));
  if (required.length === 0) return 'sin_manual';
  let outdated = false;
  for (const k of required) {
    const v = accepted.get(k);
    if (v == null) return 'pendiente';
    if (v < published.get(k)!) outdated = true;
  }
  return outdated ? 'desactualizado' : 'al_dia';
}

export const ACCEPT_STATUS_LABEL: Record<AcceptStatus, string> = {
  sin_manual: 'Sin manual publicado',
  pendiente: 'Falta aceptar',
  desactualizado: 'Hay cambios por aceptar',
  al_dia: 'Manual aceptado',
};
