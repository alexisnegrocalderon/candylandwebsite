/** A quién le llega una campaña push a clientes (server/customerPush.ts).
 * Lógica pura: el servidor arma los conjuntos de emails y esto decide qué
 * suscripciones quedan, con el tope de frecuencia y los bloqueados fuera. */

export type PushSegment =
  | { type: 'all' }
  /** Compraron (aprobado) para un evento. */
  | { type: 'event'; eventId: number }
  /** Tienen entrada para el próximo evento publicado. */
  | { type: 'nextEvent' }
  /** Para el próximo evento pero SIN entrada todavía (incluye anónimos). */
  | { type: 'nextEventNoTicket' }
  /** Nunca compraron (anónimos o sin pedido aprobado). */
  | { type: 'neverBought' }
  /** Compraron en los últimos N días. */
  | { type: 'recentBuyers'; days: number }
  /** Embajadores VIP activos. */
  | { type: 'ambassadors' };

export const SEGMENT_TYPES = ['all', 'event', 'nextEvent', 'nextEventNoTicket', 'neverBought', 'recentBuyers', 'ambassadors'] as const;

/** Entre dos avisos de marketing al mismo dispositivo (campañas, nuevo
 * evento): "uno al día" sin depender de a qué hora salió el anterior. */
export const MARKETING_GAP_MS = 20 * 3_600_000;

export interface SegmentSub {
  id: number;
  emailNorm: string | null;
  optedOutAt: Date | string | null;
  lastMarketingAt: Date | string | null;
}

export interface SegmentContext {
  /** Emails con algún pedido aprobado. */
  buyers: Set<string>;
  /** Emails con entrada aprobada para el evento del segmento (event / nextEvent*). */
  eventBuyers: Set<string>;
  /** Emails que compraron en la ventana de recentBuyers. */
  recentBuyers: Set<string>;
  ambassadors: Set<string>;
  blocked: Set<string>;
}

export function normalizeSegment(raw: unknown): PushSegment {
  const r = (raw && typeof raw === 'object' ? raw : {}) as any;
  switch (r.type) {
    case 'event': return Number.isInteger(r.eventId) && r.eventId > 0 ? { type: 'event', eventId: r.eventId } : { type: 'all' };
    case 'recentBuyers': {
      const days = Math.round(Number(r.days));
      return { type: 'recentBuyers', days: days >= 1 && days <= 730 ? days : 90 };
    }
    case 'nextEvent': case 'nextEventNoTicket': case 'neverBought': case 'ambassadors': return { type: r.type };
    default: return { type: 'all' };
  }
}

/** ¿El segmento necesita el conjunto de compradores de un evento? */
export function segmentEventScope(seg: PushSegment): 'event' | 'next' | null {
  if (seg.type === 'event') return 'event';
  if (seg.type === 'nextEvent' || seg.type === 'nextEventNoTicket') return 'next';
  return null;
}

function inSegment(sub: SegmentSub, seg: PushSegment, ctx: SegmentContext): boolean {
  const e = sub.emailNorm || '';
  switch (seg.type) {
    case 'all': return true;
    case 'event': case 'nextEvent': return !!e && ctx.eventBuyers.has(e);
    case 'nextEventNoTicket': return !e || !ctx.eventBuyers.has(e);
    case 'neverBought': return !e || !ctx.buyers.has(e);
    case 'recentBuyers': return !!e && ctx.recentBuyers.has(e);
    case 'ambassadors': return !!e && ctx.ambassadors.has(e);
  }
}

/** Suscripciones que reciben el aviso. `marketing` aplica el tope de uno al
 * día por dispositivo (los transaccionales -- recordatorio con entrada,
 * carrito -- no lo usan ni lo consumen). */
export function selectRecipients<T extends SegmentSub>(
  subs: T[], seg: PushSegment, ctx: SegmentContext, opts: { marketing: boolean; now?: Date },
): { recipients: T[]; cappedOut: number } {
  const now = (opts.now ?? new Date()).getTime();
  let cappedOut = 0;
  const recipients = subs.filter((s) => {
    if (s.optedOutAt) return false;
    if (s.emailNorm && ctx.blocked.has(s.emailNorm)) return false;
    if (!inSegment(s, seg, ctx)) return false;
    if (opts.marketing && s.lastMarketingAt && now - new Date(s.lastMarketingAt).getTime() < MARKETING_GAP_MS) {
      cappedOut++;
      return false;
    }
    return true;
  });
  return { recipients, cappedOut };
}

export function describeSegment(seg: PushSegment, eventName?: (id: number) => string | undefined): string {
  switch (seg.type) {
    case 'all': return 'Todos los suscritos';
    case 'event': return `Compraron para ${eventName?.(seg.eventId) ?? `el evento #${seg.eventId}`}`;
    case 'nextEvent': return 'Con entrada para el próximo evento';
    case 'nextEventNoTicket': return 'Sin entrada para el próximo evento';
    case 'neverBought': return 'Nunca han comprado';
    case 'recentBuyers': return `Compraron en los últimos ${seg.days} días`;
    case 'ambassadors': return 'Embajadores VIP';
  }
}
