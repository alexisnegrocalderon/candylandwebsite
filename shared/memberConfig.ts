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
  /** Bono en pesos por instalar la app y entrar a «Mi cuenta» (promo de una fiesta). Arranca apagado. */
  appBonus: AppBonusConfig;
}

export interface AppBonusConfig {
  enabled: boolean;
  /** Descuento fijo en pesos para la entrada. */
  amountClp: number;
  /** Fiesta para la que vale (el cupón solo sirve en esa). */
  eventId: number | null;
  /** Hasta cuándo se puede reclamar y usar (ISO). Pasada esa hora ya no se entrega y el cupón vence. */
  validUntil: string | null;
}

export const DEFAULT_APP_BONUS: AppBonusConfig = { enabled: false, amountClp: 10000, eventId: null, validUntil: null };

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
  appBonus: DEFAULT_APP_BONUS,
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
    appBonus: normalizeAppBonus(r.appBonus),
  };
}

export function normalizeAppBonus(raw: any): AppBonusConfig {
  const until = raw?.validUntil ? new Date(raw.validUntil) : null;
  const eventId = Math.round(Number(raw?.eventId));
  return {
    enabled: raw?.enabled === true,
    amountClp: int(raw?.amountClp, 1000, 200000, DEFAULT_APP_BONUS.amountClp),
    eventId: Number.isFinite(eventId) && eventId > 0 ? eventId : null,
    validUntil: until && Number.isFinite(until.getTime()) ? until.toISOString() : null,
  };
}

/** ¿Se puede reclamar el bono ahora? Prendido, con fiesta y hora límite, y sin haber vencido. */
export function appBonusOpen(b: AppBonusConfig, now: Date = new Date()): boolean {
  return b.enabled && b.eventId !== null && !!b.validUntil && new Date(b.validUntil).getTime() > now.getTime();
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
