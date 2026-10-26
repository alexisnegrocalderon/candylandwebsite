/* El aviso urgente de la puerta a los organizadores: motivos, y el texto de la notificación push. Lo puro vive acá;
 * el envío en server/caja/doorAlert.ts y la hoja en client/src/pages/Puerta.tsx. */

export const DOOR_ALERT_REASONS = [
  { key: 'pago', label: 'Problema de pago', emoji: '💳' },
  { key: 'conflictivo', label: 'Cliente conflictivo', emoji: '⚠️' },
  { key: 'entrada', label: 'Entrada dudosa', emoji: '🎟️' },
  { key: 'emergencia', label: 'Emergencia', emoji: '🚨' },
  { key: 'otro', label: 'Otro', emoji: '💬' },
] as const;

export type DoorAlertReason = (typeof DOOR_ALERT_REASONS)[number]['key'];
export const DOOR_ALERT_KEYS = DOOR_ALERT_REASONS.map((r) => r.key) as [DoorAlertReason, ...DoorAlertReason[]];
export const DOOR_ALERT_NOTE_MAX = 140;
/** Segundos mínimos entre un aviso y otro de la misma persona (evita spam por un toque repetido). */
export const DOOR_ALERT_COOLDOWN_MS = 20_000;

export function doorAlertReason(key: string) {
  return DOOR_ALERT_REASONS.find((r) => r.key === key) ?? DOOR_ALERT_REASONS[DOOR_ALERT_REASONS.length - 1];
}

export function cleanAlertNote(note: unknown): string {
  return (typeof note === 'string' ? note : '').replace(/\s+/g, ' ').trim().slice(0, DOOR_ALERT_NOTE_MAX);
}

/** Lo que llega al celular de los organizadores. */
export function buildDoorAlertPush(p: { reason: string; note?: string | null; operatorName: string; ticketCode?: string | null; buyerName?: string | null }) {
  const r = doorAlertReason(p.reason);
  const note = cleanAlertNote(p.note);
  const who = p.buyerName?.trim() ? ` · Cliente: ${p.buyerName.trim()}` : p.ticketCode ? ` · Código: ${p.ticketCode}` : '';
  return {
    title: `${r.emoji} Puerta: ${r.label}`,
    body: `${p.operatorName} avisa desde la puerta${who}${note ? ` — ${note}` : ''}`,
    url: '/admin',
  };
}
