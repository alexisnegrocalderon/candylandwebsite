/** Beneficios de la cuenta de socios («Mi cuenta»): los cupones que se regalan
 * y cuánto duran. Los edita el dueño en el panel (Clientes → Socios) y se
 * guardan como JSON en siteSettings.memberConfig.
 *
 * Arrancan APAGADOS: desplegar esto no debe regalar cupones solo (mismo
 * criterio que adminAlertsConfig y customerPushConfig). */

export interface CouponRule {
  enabled: boolean;
  /** % de descuento de cada cupón. */
  percent: number;
  /** Días de vigencia desde que se entrega. */
  days: number;
}

export interface MemberConfig {
  /** La primera vez que entra a su cuenta. */
  welcome: CouponRule;
  /** Alrededor de su cumpleaños (desde 7 días antes). Uno por año. */
  birthday: CouponRule;
  /** Uno al mes mientras sea de ese nivel. */
  recurrente: CouponRule;
  vip: CouponRule;
  /** Avisarles por notificación cuando reciben un cupón (si activaron los avisos). */
  pushOnGrant: boolean;
  /** Pagos desde «Mi cuenta» (Etapa A). Todo arranca apagado: se prende pieza por pieza. */
  payments: MemberPaymentsConfig;
}

export interface MemberPaymentsConfig {
  /** Guardar tarjetas (Mercado Pago, Clientes y Tarjetas) y pagar con ellas en el checkout y la recarga. */
  savedCards: boolean;
  /** Recargar la PlayCard desde «Mi cuenta». */
  accountTopup: boolean;
  /** «Pagar en caja» con el QR de la app (saldo y Playcoins, sin PIN). */
  cajaPay: boolean;
}

export const DEFAULT_MEMBER_CONFIG: MemberConfig = {
  welcome: { enabled: false, percent: 10, days: 30 },
  birthday: { enabled: false, percent: 15, days: 30 },
  recurrente: { enabled: false, percent: 10, days: 30 },
  vip: { enabled: false, percent: 15, days: 30 },
  pushOnGrant: true,
  payments: { savedCards: false, accountTopup: false, cajaPay: false },
};

const int = (v: unknown, min: number, max: number, fallback: number) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n >= min && n <= max ? n : fallback;
};

function rule(raw: any, d: CouponRule): CouponRule {
  return { enabled: raw?.enabled === true, percent: int(raw?.percent, 1, 60, d.percent), days: int(raw?.days, 3, 365, d.days) };
}

export function normalizeMemberConfig(raw: unknown): MemberConfig {
  const r = (raw && typeof raw === 'object' ? raw : {}) as any;
  const d = DEFAULT_MEMBER_CONFIG;
  return {
    welcome: rule(r.welcome, d.welcome),
    birthday: rule(r.birthday, d.birthday),
    recurrente: rule(r.recurrente, d.recurrente),
    vip: rule(r.vip, d.vip),
    pushOnGrant: r.pushOnGrant !== false,
    payments: {
      savedCards: r.payments?.savedCards === true,
      accountTopup: r.payments?.accountTopup === true,
      cajaPay: r.payments?.cajaPay === true,
    },
  };
}

/** ¿Está activa la preventa anticipada de socios de este evento? */
export function isMemberEarlyAccess(event: { memberEarlyUntil?: Date | string | null }, now: Date = new Date()): boolean {
  return !!event.memberEarlyUntil && new Date(event.memberEarlyUntil).getTime() > now.getTime();
}

export type CouponStatus = 'disponible' | 'usado' | 'vencido';

/** Estado de un cupón a partir de su código de descuento. */
export function couponStatus(c: { usedCount: number; maxUses: number | null; validUntil: Date | string | null; isActive: number }, now: Date = new Date()): CouponStatus {
  if (c.maxUses && c.usedCount >= c.maxUses) return 'usado';
  if (!c.isActive || (c.validUntil && new Date(c.validUntil).getTime() < now.getTime())) return 'vencido';
  return 'disponible';
}
