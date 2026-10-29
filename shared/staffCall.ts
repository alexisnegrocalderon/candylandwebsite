/* «Llamar a los organizadores»: el botón de arriba de todas las pantallas de trabajo (Caja, Puerta, Cocina, Guardarropía y
 * Barra). Un toque, un motivo y llega una notificación al celular del administrador y de los supervisores. Lo puro vive
 * acá; el envío en server/staffCall.ts y el botón en client/src/components/terminal/CallOrganizers.tsx. */
import { STAFF_SYSTEMS, type StaffSystemKey } from './cajaRoles';

export const STAFF_CALL_REASONS = [
  { key: 'ayuda', label: 'Necesito a alguien aquí', emoji: '🙋' },
  { key: 'falta', label: 'Falta algo (producto, cambio, insumo)', emoji: '📦' },
  { key: 'cliente', label: 'Problema con un cliente', emoji: '⚠️' },
  { key: 'emergencia', label: 'Emergencia', emoji: '🚨' },
] as const;

export type StaffCallReason = (typeof STAFF_CALL_REASONS)[number]['key'];
export const STAFF_CALL_KEYS = STAFF_CALL_REASONS.map((r) => r.key) as [StaffCallReason, ...StaffCallReason[]];
export const STAFF_CALL_NOTE_MAX = 140;
/** Entre un aviso y otro de la misma persona (evita el spam por un toque repetido). */
export const STAFF_CALL_COOLDOWN_MS = 20_000;

export function staffCallReason(key: string) {
  return STAFF_CALL_REASONS.find((r) => r.key === key) ?? STAFF_CALL_REASONS[0];
}

/** Dónde está la persona, para decirlo en el aviso («Caja», «Guardarropía»…). */
export function areaLabel(area: StaffSystemKey | string | null | undefined): string {
  return STAFF_SYSTEMS.find((s) => s.key === area)?.label ?? 'La fiesta';
}

export function cleanCallNote(note: unknown): string {
  return (typeof note === 'string' ? note : '').replace(/\s+/g, ' ').trim().slice(0, STAFF_CALL_NOTE_MAX);
}

/** Lo que llega al celular: «🙋 Caja necesita al equipo» + quién llama y por qué. */
export function buildStaffCallPush(p: { area: string | null | undefined; reason: string; note?: string | null; operatorName: string }) {
  const r = staffCallReason(p.reason);
  const note = cleanCallNote(p.note);
  const emergency = r.key === 'emergencia';
  return {
    title: `${r.emoji} ${areaLabel(p.area)}: ${emergency ? 'EMERGENCIA' : 'te necesitan'}`,
    body: `${p.operatorName} — ${r.label}${note ? ` · ${note}` : ''}`,
    url: '/admin',
  };
}
