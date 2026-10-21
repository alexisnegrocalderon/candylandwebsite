/** A quién le llega una campaña push a clientes (server/customerPush.ts).
 * Un segmento es una combinación: cumple TODAS las reglas de `include` y
 * ninguna de `exclude`. Lógica pura: el servidor resuelve cada regla a un
 * conjunto de correos/dispositivos y esto decide quién queda, con el tope de
 * frecuencia y los bloqueados fuera. */

export type PushRule =
  /** Compraron (aprobado) para un evento. */
  | { type: 'event'; eventId: number }
  /** Tienen entrada para el próximo evento publicado. */
  | { type: 'nextEvent' }
  /** Sin entrada para el próximo evento (incluye a los anónimos). */
  | { type: 'nextEventNoTicket' }
  /** Nunca compraron (anónimos o sin pedido aprobado). */
  | { type: 'neverBought' }
  /** Compraron en los últimos N días. */
  | { type: 'recentBuyers'; days: number }
  /** Embajadores VIP activos. */
  | { type: 'ambassadors' }
  /** Nivel de cliente (vip, recurrente, nuevo, inactivo, sin_compras). */
  | { type: 'level'; levels: string[] }
  | { type: 'birthdayMonth'; month: number }
  | { type: 'birthdayToday' }
  | { type: 'city'; city: string }
  | { type: 'gender'; gender: string }
  /** App instalada: la abrió en los últimos N días (active) o hace más de N días que no (inactive). */
  | { type: 'app'; mode: 'active' | 'inactive'; days: number }
  /** Tocaron / no tocaron un aviso anterior. */
  | { type: 'clicked'; campaignId: number }
  | { type: 'notClicked'; campaignId: number }
  /** Estuvieron en la fiesta (entrada usada). */
  | { type: 'attended'; eventId: number }
  /** Compraron alguna vez, pero no en los últimos N días. */
  | { type: 'dormant'; days: number }
  /** Tienen saldo PlayCard sin gastar. */
  | { type: 'hasBalance' };

export interface PushSegment {
  type: 'combo';
  include: PushRule[];
  exclude: PushRule[];
}

export const RULE_TYPES = [
  'event', 'nextEvent', 'nextEventNoTicket', 'neverBought', 'recentBuyers', 'ambassadors', 'level', 'birthdayMonth', 'birthdayToday',
  'city', 'gender', 'app', 'clicked', 'notClicked', 'attended', 'dormant', 'hasBalance',
] as const;

export const LEVELS = ['vip', 'recurrente', 'nuevo', 'inactivo', 'sin_compras'] as const;

/** Entre dos avisos de marketing al mismo dispositivo (campañas, nuevo
 * evento): "uno al día" sin depender de a qué hora salió el anterior. */
export const MARKETING_GAP_MS = 20 * 3_600_000;

const posInt = (v: unknown) => Number.isInteger(v) && (v as number) > 0;
const days = (v: unknown, fallback: number) => {
  const n = Math.round(Number(v));
  return n >= 1 && n <= 730 ? n : fallback;
};

/** Una regla válida o null. */
export function normalizeRule(raw: unknown): PushRule | null {
  const r = (raw && typeof raw === 'object' ? raw : {}) as any;
  switch (r.type) {
    case 'event': return posInt(r.eventId) ? { type: 'event', eventId: r.eventId } : null;
    case 'attended': return posInt(r.eventId) ? { type: 'attended', eventId: r.eventId } : null;
    case 'clicked': case 'notClicked': return posInt(r.campaignId) ? { type: r.type, campaignId: r.campaignId } : null;
    case 'recentBuyers': return { type: 'recentBuyers', days: days(r.days, 90) };
    case 'dormant': return { type: 'dormant', days: days(r.days, 60) };
    case 'app': return { type: 'app', mode: r.mode === 'inactive' ? 'inactive' : 'active', days: days(r.days, 30) };
    case 'level': {
      const levels = (Array.isArray(r.levels) ? r.levels : []).filter((l: unknown) => (LEVELS as readonly string[]).includes(l as string));
      return levels.length ? { type: 'level', levels: Array.from(new Set<string>(levels)) } : null;
    }
    case 'birthdayMonth': return Number.isInteger(r.month) && r.month >= 1 && r.month <= 12 ? { type: 'birthdayMonth', month: r.month } : null;
    case 'city': return typeof r.city === 'string' && r.city.trim() ? { type: 'city', city: r.city.trim().slice(0, 100) } : null;
    case 'gender': return typeof r.gender === 'string' && r.gender.trim() ? { type: 'gender', gender: r.gender.trim().slice(0, 20) } : null;
    case 'nextEvent': case 'nextEventNoTicket': case 'neverBought': case 'ambassadors': case 'birthdayToday': case 'hasBalance': return { type: r.type };
    default: return null;
  }
}

/** Un valor JSON que a veces llega como texto (según el motor de la base). */
export function parseJsonValue(v: unknown): unknown {
  if (typeof v !== 'string') return v;
  try { return JSON.parse(v); } catch { return null; }
}

/** Acepta la forma combinada y las antiguas (una sola regla, o "all" = sin reglas). */
export function normalizeSegment(rawIn: unknown): PushSegment {
  const raw = parseJsonValue(rawIn);
  const r = (raw && typeof raw === 'object' ? raw : {}) as any;
  const list = (v: unknown) => (Array.isArray(v) ? v : []).map(normalizeRule).filter((x): x is PushRule => !!x).slice(0, 12);
  if (r.type === 'combo') return { type: 'combo', include: list(r.include), exclude: list(r.exclude) };
  const single = normalizeRule(r);
  return { type: 'combo', include: single ? [single] : [], exclude: [] };
}

export const ruleKey = (rule: PushRule): string => JSON.stringify(rule);

/** Lo que cumple una regla: por correo, por dispositivo, y si cuenta a los suscritos sin correo. */
export interface RuleMatch { emails?: Set<string>; subs?: Set<number>; anon?: boolean }

export interface SegmentSub {
  id: number;
  emailNorm: string | null;
  optedOutAt: Date | string | null;
  lastMarketingAt: Date | string | null;
}

export interface SegmentContext {
  rules: Record<string, RuleMatch>;
  blocked: Set<string>;
}

function matchesRule(sub: SegmentSub, rule: PushRule, ctx: SegmentContext): boolean {
  const m = ctx.rules[ruleKey(rule)];
  if (!m) return false;
  if (m.subs) return m.subs.has(sub.id);
  return sub.emailNorm ? !!m.emails?.has(sub.emailNorm) : !!m.anon;
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
    if (!seg.include.every((r) => matchesRule(s, r, ctx))) return false;
    if (seg.exclude.some((r) => matchesRule(s, r, ctx))) return false;
    if (opts.marketing && s.lastMarketingAt && now - new Date(s.lastMarketingAt).getTime() < MARKETING_GAP_MS) {
      cappedOut++;
      return false;
    }
    return true;
  });
  return { recipients, cappedOut };
}

const GENDER_LABEL: Record<string, string> = { hombre: 'hombres', mujer: 'mujeres', pareja: 'parejas', otro: 'otro género' };
const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

export function describeRule(rule: PushRule, names?: { event?: (id: number) => string | undefined; campaign?: (id: number) => string | undefined }): string {
  switch (rule.type) {
    case 'event': return `compraron ${names?.event?.(rule.eventId) ?? `el evento #${rule.eventId}`}`;
    case 'attended': return `fueron a ${names?.event?.(rule.eventId) ?? `el evento #${rule.eventId}`}`;
    case 'nextEvent': return 'con entrada para el próximo evento';
    case 'nextEventNoTicket': return 'sin entrada para el próximo evento';
    case 'neverBought': return 'nunca han comprado';
    case 'recentBuyers': return `compraron en los últimos ${rule.days} días`;
    case 'dormant': return `sin comprar hace más de ${rule.days} días`;
    case 'ambassadors': return 'embajadores VIP';
    case 'level': return `nivel ${rule.levels.join(' / ')}`;
    case 'birthdayMonth': return `cumplen en ${MONTHS[rule.month - 1]}`;
    case 'birthdayToday': return 'cumplen años hoy';
    case 'city': return `de ${rule.city}`;
    case 'gender': return GENDER_LABEL[rule.gender] ?? rule.gender;
    case 'app': return rule.mode === 'active' ? `abrieron la app en ${rule.days} días` : `sin abrir la app hace ${rule.days} días`;
    case 'clicked': return `tocaron «${names?.campaign?.(rule.campaignId) ?? `aviso #${rule.campaignId}`}»`;
    case 'notClicked': return `no tocaron «${names?.campaign?.(rule.campaignId) ?? `aviso #${rule.campaignId}`}»`;
    case 'hasBalance': return 'con saldo PlayCard';
  }
}

export function describeSegment(seg: PushSegment, names?: Parameters<typeof describeRule>[1]): string {
  if (!seg.include.length && !seg.exclude.length) return 'Todos los suscritos';
  const inc = seg.include.length ? seg.include.map((r) => describeRule(r, names)).join(' + ') : 'todos';
  const exc = seg.exclude.length ? `, excepto ${seg.exclude.map((r) => describeRule(r, names)).join(' y ')}` : '';
  return inc.charAt(0).toUpperCase() + inc.slice(1) + exc;
}
