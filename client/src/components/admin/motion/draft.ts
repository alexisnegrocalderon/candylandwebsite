import { normalizeMotionSpec, type MotionFormat, type MotionMedia, type MotionSpec, type MotionTemplate } from '@shared/motionSpec';
import type { AiModel } from '@shared/studioAi';

/* Borrador del Estudio, guardado en el teléfono.
 *
 * Un celular puede recargar el panel solo (iOS cierra la página cuando se queda sin memoria con la vista previa, y después
 * de cada publicación el panel se recarga para bajar la versión nueva). Antes eso devolvía a Inicio con todo perdido: la
 * idea escrita, las 3 variantes ya pagadas a la IA y el video a medio editar. Ahora cada cambio queda acá y el Estudio
 * abre donde quedó. No toca el servidor: «Guardar» sigue siendo lo único que guarda el video de verdad. */

const KEY = 'motion-studio.draft.v1';
const MAX_AGE_MS = 14 * 86_400_000;

export interface StudioForm {
  brief: string;
  template: MotionTemplate | 'auto';
  format: MotionFormat;
  media: MotionMedia[];
  keyword: string;
  model: AiModel;
}

export interface StudioDraft {
  at: number;
  form?: StudioForm;
  variants?: { variants: MotionSpec[]; costUsd: number } | null;
  edit?: { id: number | null; spec: MotionSpec; dirty: boolean } | null;
}

export function loadDraft(): StudioDraft | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const d = JSON.parse(raw) as StudioDraft;
    if (!d || typeof d !== 'object' || !(Date.now() - Number(d.at) < MAX_AGE_MS)) return null;
    // Lo guardado puede ser de una versión anterior del panel: todo pasa por el normalizador antes de usarse.
    if (d.edit) d.edit = d.edit.spec ? { id: Number.isInteger(d.edit.id) ? d.edit.id : null, spec: normalizeMotionSpec(d.edit.spec), dirty: !!d.edit.dirty } : null;
    if (d.variants) {
      const list = Array.isArray(d.variants.variants) ? d.variants.variants.map(normalizeMotionSpec) : [];
      d.variants = list.length ? { variants: list, costUsd: Number(d.variants.costUsd) || 0 } : null;
    }
    return d;
  } catch {
    return null;
  }
}

/** Mezcla `patch` en el borrador. Nunca lanza: sin almacenamiento (o lleno) el Estudio funciona igual, solo sin borrador. */
export function patchDraft(patch: Partial<Omit<StudioDraft, 'at'>>): void {
  try {
    let current: StudioDraft | null = null;
    try { current = JSON.parse(window.localStorage.getItem(KEY) ?? 'null'); } catch { /* borrador ilegible: se pisa */ }
    window.localStorage.setItem(KEY, JSON.stringify({ ...(current ?? {}), ...patch, at: Date.now() }));
  } catch { /* sin localStorage */ }
}
