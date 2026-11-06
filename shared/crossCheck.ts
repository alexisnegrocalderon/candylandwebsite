/* Cross check: lo que el sistema quiere hacer solo y espera el visto bueno del dueño («Reportar»). Lo comparten el
 * servidor (server/crossCheck.ts) y el panel (client/src/components/admin/crossCheck/). */

/** Automatizaciones que pueden pedir cross check (el dueño elige cuáles salen solas). */
export const CROSS_CHECK_AUTOMATIONS = ['founders-promo', 'tanda2-promo', 'sales-drip', 'abandoned-cart'] as const;
export type CrossCheckAutomation = (typeof CROSS_CHECK_AUTOMATIONS)[number];

export const CROSS_CHECK_LABELS: Record<CrossCheckAutomation, { title: string; detail: string }> = {
  'founders-promo': { title: 'Aviso de primeros cupos', detail: 'Correo diario a quienes no han comprado mientras quedan cupos de la primera tanda.' },
  'tanda2-promo': { title: 'Aviso de la 2ª tanda', detail: 'Correo diario a quienes no han comprado con el precio de la 2ª tanda.' },
  'sales-drip': { title: 'Aviso diario de venta', detail: 'Correo diario a quienes no han comprado el próximo evento, con días de espera entre correos.' },
  'abandoned-cart': { title: 'Carritos abandonados', detail: 'Recordatorio (correo y push) a quien empezó a comprar y no pagó.' },
};

export type CrossCheckStatus = 'pending' | 'running' | 'done' | 'failed' | 'discarded' | 'expired';

export interface CrossCheckItem {
  id: number;
  kind: string;
  eventId: number | null;
  title: string;
  summary: string;
  status: CrossCheckStatus;
  createdAt: string;
  expiresAt: string | null;
  decidedAt: string | null;
  result: string | null;
}

/** Texto corto del resultado de una automatización para el historial («12 correos enviados»). */
export function describeRunResult(result: unknown): string {
  if (!result || typeof result !== 'object') return 'Listo';
  const r = result as Record<string, unknown>;
  if (r.ran === false) return `No salió nada (${String(r.reason ?? 'sin motivo')})`;
  if (typeof r.sent === 'number') {
    const failed = typeof r.failed === 'number' ? r.failed : Array.isArray(r.failed) ? r.failed.length : 0;
    return `${r.sent} enviado${r.sent === 1 ? '' : 's'}${failed ? `, ${failed} con error` : ''}`;
  }
  if (typeof r.message === 'string') return r.message;
  return 'Listo';
}
