/* Vetar a alguien desde la puerta o el panel: se escanea su QR, se elige un motivo y quedan vetados el titular y todos
 * los acompañantes de esa compra. Lo pide un guardia o el dueño; el veto de un guardia rige al instante pero queda
 * «pendiente» hasta que el dueño lo confirma (o lo levanta). Lógica pura; el servidor está en server/veto.ts.
 *
 * Los datos del veto viajan en `blockedCustomers.notes` (JSON), así no hace falta migración: una nota de siempre es
 * texto y `parseVetoNotes` devuelve `null`. */

export const VETO_REASONS = [
  { key: 'agresion', label: 'Agresión o acoso', emoji: '🚫', text: 'Agresión o acoso' },
  { key: 'normas', label: 'Incumplir las normas de la fiesta', emoji: '📵', text: 'No cumplió las normas de la fiesta' },
  { key: 'drogas', label: 'Drogas o intoxicación extrema', emoji: '⚠️', text: 'Drogas o intoxicación extrema' },
  { key: 'otro', label: 'Otro motivo', emoji: '💬', text: 'Otro' },
] as const;

export type VetoReasonKey = (typeof VETO_REASONS)[number]['key'];
export const VETO_NOTE_MAX = 200;
export const VETO_NOTE_MIN_OTHER = 3;

export function isVetoReason(key: unknown): key is VetoReasonKey {
  return VETO_REASONS.some((r) => r.key === key);
}

/** El motivo escrito para guardar («Agresión o acoso» o «Otro: <lo que escribió>»); `null` si falta el detalle de «Otro». */
export function vetoReasonText(key: VetoReasonKey, note: string | null | undefined): string | null {
  const base = VETO_REASONS.find((r) => r.key === key)!.text;
  const detail = (note ?? '').trim().replace(/\s+/g, ' ').slice(0, VETO_NOTE_MAX);
  if (key === 'otro') return detail.length >= VETO_NOTE_MIN_OTHER ? `Otro: ${detail}` : null;
  return detail ? `${base} · ${detail}` : base;
}

export type VetoStatus = 'pendiente' | 'confirmado';

export interface VetoMeta {
  veto: 1;
  status: VetoStatus;
  /** Quién lo pidió: el guardia (`puerta`) o el dueño desde el panel (`admin`). */
  byKind: 'puerta' | 'admin';
  by: string;
  ticketCode: string;
  eventId: number;
  at: string;
  reasonKey: VetoReasonKey;
  /** Entradas anuladas por este veto (para devolverlas si se levanta). */
  tickets: string[];
  /** Perfiles de Playmatch expulsados. */
  profiles: number[];
}

export function vetoNotes(meta: Omit<VetoMeta, 'veto'>): string {
  return JSON.stringify({ veto: 1, ...meta, tickets: meta.tickets.slice(0, 12), profiles: meta.profiles.slice(0, 12) });
}

export function parseVetoNotes(notes: string | null | undefined): VetoMeta | null {
  if (!notes || notes[0] !== '{') return null;
  try {
    const v = JSON.parse(notes) as Partial<VetoMeta>;
    if (v.veto !== 1 || !v.ticketCode || (v.status !== 'pendiente' && v.status !== 'confirmado')) return null;
    return {
      veto: 1, status: v.status, byKind: v.byKind === 'admin' ? 'admin' : 'puerta', by: String(v.by ?? ''), ticketCode: v.ticketCode, eventId: Number(v.eventId) || 0,
      at: String(v.at ?? ''), reasonKey: isVetoReason(v.reasonKey) ? v.reasonKey : 'otro', tickets: Array.isArray(v.tickets) ? v.tickets.map(String) : [], profiles: Array.isArray(v.profiles) ? v.profiles.map(Number) : [],
    };
  } catch { return null; }
}

/** Un veto del dueño rige confirmado; el de un guardia queda pendiente hasta que el dueño lo confirma. */
export const initialVetoStatus = (byKind: 'puerta' | 'admin'): VetoStatus => (byKind === 'admin' ? 'confirmado' : 'pendiente');

export interface VetoPerson { name?: string | null; rut?: string | null; email?: string | null; phone?: string | null; instagram?: string | null }

/** Las personas que se vetan: el titular y cada acompañante, sin repetir y sin filas vacías. */
export function vetoPeople(people: VetoPerson[]): VetoPerson[] {
  const seen = new Set<string>();
  const out: VetoPerson[] = [];
  for (const p of people) {
    const name = (p.name ?? '').trim();
    const rut = (p.rut ?? '').replace(/[.\s-]/g, '').toUpperCase();
    const email = (p.email ?? '').trim().toLowerCase();
    if (!name && !rut && !email) continue;
    const key = rut || email || name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(p);
  }
  return out;
}
