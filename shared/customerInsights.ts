/**
 * Ficha de cliente: reglas puras (sin base de datos) para el nivel, la
 * recencia, la "próxima mejor acción" y la validación de los datos que el
 * dueño edita a mano. Viven en `shared/` para poder testearlas sin conexión,
 * mismo criterio que shared/expenses.ts y shared/eventBudget.ts.
 */

export type CustomerLevel = 'sin_compras' | 'nuevo' | 'recurrente' | 'vip' | 'inactivo';

export const CUSTOMER_LEVEL_META: Record<CustomerLevel, { label: string; chip: string }> = {
  vip: { label: 'VIP', chip: 'bg-amber-500/15 text-amber-700' },
  recurrente: { label: 'Recurrente', chip: 'bg-emerald-500/15 text-emerald-700' },
  nuevo: { label: 'Nuevo', chip: 'bg-sky-500/15 text-sky-700' },
  inactivo: { label: 'Inactivo', chip: 'bg-zinc-500/15 text-zinc-600' },
  sin_compras: { label: 'Sin compras', chip: 'bg-zinc-500/10 text-zinc-500' },
};

export const GENDER_OPTIONS = [
  { value: 'hombre', label: 'Hombre' },
  { value: 'mujer', label: 'Mujer' },
  { value: 'pareja', label: 'Pareja' },
  { value: 'otro', label: 'Otro' },
] as const;
export type CustomerGender = (typeof GENDER_OPTIONS)[number]['value'];

export const SOURCE_OPTIONS = [
  { value: 'instagram', label: 'Instagram' },
  { value: 'embajador', label: 'Embajador' },
  { value: 'referido', label: 'Referido por un amigo' },
  { value: 'web', label: 'Sitio web' },
  { value: 'caja', label: 'Caja en el evento' },
  { value: 'evento', label: 'Conocido en un evento' },
  { value: 'otro', label: 'Otro' },
] as const;

/** Desde este gasto acumulado un cliente pasa a VIP automáticamente. */
export const VIP_SPENT_THRESHOLD_CLP = 150_000;
/** Sin actividad por más de estos días, el cliente figura como inactivo. */
export const INACTIVE_AFTER_DAYS = 90;
/** Entre esto y INACTIVE_AFTER_DAYS se considera "tibio" (se está enfriando). */
export const COOLING_AFTER_DAYS = 45;
/** Saldo prepagado mínimo para sugerir que lo use. */
export const UNUSED_BALANCE_HINT_CLP = 5_000;
/** Cuántos días antes de su cumpleaños se sugiere ofrecerle algo. */
export const BIRTHDAY_HINT_DAYS = 14;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function daysBetween(from: Date | string | number, to: Date | string | number): number {
  return Math.floor((new Date(to).getTime() - new Date(from).getTime()) / MS_PER_DAY);
}

/* ─── Nivel y recencia ─────────────────────────────────────── */

export type LevelInput = {
  totalOrders: number;
  totalSpent: number;
  /** Última vez que compró o asistió (lo más reciente de las dos). */
  lastActivityAt: Date | string | null | undefined;
  /** 'vip' | 'inactivo' fuerzan el nivel; cualquier otra cosa = automático. */
  levelOverride?: string | null;
  now?: Date;
};

export function computeCustomerLevel(input: LevelInput): CustomerLevel {
  if (input.levelOverride === 'vip') return 'vip';
  if (input.levelOverride === 'inactivo') return 'inactivo';
  if (input.totalOrders <= 0) return 'sin_compras';
  if (input.totalSpent >= VIP_SPENT_THRESHOLD_CLP) return 'vip';
  const now = input.now ?? new Date();
  if (input.lastActivityAt && daysBetween(input.lastActivityAt, now) > INACTIVE_AFTER_DAYS) return 'inactivo';
  return input.totalOrders >= 2 ? 'recurrente' : 'nuevo';
}

export type RecencyTone = 'reciente' | 'tibio' | 'frio';

export function recencyTone(days: number | null): RecencyTone | null {
  if (days == null) return null;
  if (days > INACTIVE_AFTER_DAYS) return 'frio';
  if (days > COOLING_AFTER_DAYS) return 'tibio';
  return 'reciente';
}

/* ─── Datos personales: validación y formato ──────────────── */

export function normalizeInstagram(raw: string | null | undefined): { value: string | null; error?: string } {
  const text = (raw ?? '').trim();
  if (!text) return { value: null };
  const fromUrl = text.match(/instagram\.com\/([A-Za-z0-9._]+)/i)?.[1];
  const handle = (fromUrl ?? text).replace(/^@+/, '').replace(/\/+$/, '');
  if (!/^[A-Za-z0-9._]{1,30}$/.test(handle)) return { value: null, error: 'El Instagram solo puede tener letras, números, puntos y guiones bajos.' };
  return { value: handle };
}

export function normalizePhone(raw: string | null | undefined): { value: string | null; error?: string } {
  const text = (raw ?? '').trim();
  if (!text) return { value: null };
  const plus = text.startsWith('+') ? '+' : '';
  const digits = text.replace(/\D/g, '');
  if (digits.length < 8 || digits.length > 15) return { value: null, error: 'El teléfono debe tener entre 8 y 15 dígitos.' };
  return { value: `${plus}${digits}` };
}

/** Link de WhatsApp: un celular chileno de 9 dígitos que empieza en 9 recibe el 56. */
export function whatsappUrl(phone: string | null | undefined): string | null {
  const digits = (phone ?? '').replace(/\D/g, '');
  if (digits.length < 8) return null;
  const full = digits.length === 9 && digits.startsWith('9') ? `56${digits}` : digits;
  return `https://wa.me/${full}`;
}

/** Acepta "DD/MM/AAAA", "DD-MM-AAAA" o "DD/MM" (sin año). Devuelve el formato
 * guardado: "YYYY-MM-DD" o "MM-DD". */
export function parseBirthDateInput(raw: string | null | undefined, now: Date = new Date()): { value: string | null; error?: string } {
  const text = (raw ?? '').trim();
  if (!text) return { value: null };
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const dmy = text.match(/^(\d{1,2})[/-](\d{1,2})(?:[/-](\d{4}))?$/);
  const md = text.match(/^(\d{2})-(\d{2})$/);
  let year: number | null = null;
  let month: number;
  let day: number;
  if (iso) { year = Number(iso[1]); month = Number(iso[2]); day = Number(iso[3]); }
  else if (dmy) { day = Number(dmy[1]); month = Number(dmy[2]); year = dmy[3] ? Number(dmy[3]) : null; }
  else if (md) { month = Number(md[1]); day = Number(md[2]); }
  else return { value: null, error: 'Escribe la fecha como DD/MM/AAAA (o DD/MM si no sabes el año).' };

  if (month < 1 || month > 12 || day < 1) return { value: null, error: 'Esa fecha no existe.' };
  // Año bisiesto de referencia para aceptar el 29 de febrero cuando no hay año.
  const probeYear = year ?? 2000;
  const daysInMonth = new Date(Date.UTC(probeYear, month, 0)).getUTCDate();
  if (day > daysInMonth) return { value: null, error: 'Esa fecha no existe.' };
  if (year != null) {
    if (year < 1900 || year > now.getUTCFullYear()) return { value: null, error: 'Revisa el año de nacimiento.' };
    return { value: `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}` };
  }
  return { value: `${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}` };
}

/** Lo contrario: de "YYYY-MM-DD"/"MM-DD" a "DD/MM/AAAA" o "DD/MM". */
export function formatBirthDate(stored: string | null | undefined): string {
  if (!stored) return '';
  const full = stored.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (full) return `${full[3]}/${full[2]}/${full[1]}`;
  const md = stored.match(/^(\d{2})-(\d{2})$/);
  return md ? `${md[2]}/${md[1]}` : stored;
}

function monthDayOf(stored: string | null | undefined): { month: number; day: number } | null {
  if (!stored) return null;
  const full = stored.match(/^\d{4}-(\d{2})-(\d{2})$/);
  const md = stored.match(/^(\d{2})-(\d{2})$/);
  const m = full ?? md;
  return m ? { month: Number(m[1]), day: Number(m[2]) } : null;
}

/** Días que faltan para el próximo cumpleaños (0 = hoy), o null si no hay fecha.
 * El 29 de febrero en años no bisiestos se celebra el 28. */
export function daysUntilBirthday(stored: string | null | undefined, now: Date = new Date()): number | null {
  const md = monthDayOf(stored);
  if (!md) return null;
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const occurrence = (year: number) => {
    const lastDay = new Date(Date.UTC(year, md.month, 0)).getUTCDate();
    return Date.UTC(year, md.month - 1, Math.min(md.day, lastDay));
  };
  let next = occurrence(now.getUTCFullYear());
  if (next < today) next = occurrence(now.getUTCFullYear() + 1);
  return Math.round((next - today) / MS_PER_DAY);
}

export function hasBirthdayInMonth(stored: string | null | undefined, month: number): boolean {
  return monthDayOf(stored)?.month === month;
}

/** Edad si se conoce el año de nacimiento. */
export function ageFromBirthDate(stored: string | null | undefined, now: Date = new Date()): number | null {
  const full = stored?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!full) return null;
  const y = Number(full[1]), m = Number(full[2]), d = Number(full[3]);
  let age = now.getUTCFullYear() - y;
  if (now.getUTCMonth() + 1 < m || (now.getUTCMonth() + 1 === m && now.getUTCDate() < d)) age -= 1;
  return age;
}

/* ─── Campos protegidos de las compras nuevas ─────────────── */

/** Campos de la ficha que una compra posterior NO debe pisar si el dueño los
 * editó a mano. */
export const LOCKABLE_FIELDS = ['fullName', 'phone', 'rut', 'instagram'] as const;
export type LockableField = (typeof LOCKABLE_FIELDS)[number];

export function parseLockedFields(raw: unknown): LockableField[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((f): f is LockableField => LOCKABLE_FIELDS.includes(f as LockableField));
}

/** Valor final de un campo cuando entra una compra: lo editado a mano gana
 * siempre; si no, la compra nueva reemplaza, y si la compra no trae el dato se
 * conserva el que ya había. */
export function mergeFromOrder<T>(field: LockableField, locked: LockableField[], existing: T | null | undefined, incoming: T | null | undefined): T | null {
  if (locked.includes(field)) return existing ?? null;
  return (incoming || existing) ?? null;
}

/* ─── Próxima mejor acción ─────────────────────────────────── */

export type NextActionInput = {
  level: CustomerLevel;
  fullName?: string | null;
  totalOrders: number;
  daysSinceLastActivity: number | null;
  birthDate?: string | null;
  phone?: string | null;
  instagram?: string | null;
  emailOptOut: boolean;
  whatsappOptOut: boolean;
  prepaidBalance: number;
  /** Compró la última fiesta pero su entrada nunca se escaneó (true), la usó (false), o no aplica (null). */
  boughtLastEventButMissed?: boolean | null;
  now?: Date;
};

export type NextAction = { kind: string; title: string; reason: string };

const clp = (n: number) => `$${Math.round(n).toLocaleString('es-CL')}`;

/** Una sola sugerencia, con la regla que la dispara a la vista ("reason"),
 * para que el dueño entienda por qué y no sea una caja negra. El orden es la
 * prioridad: lo más urgente o de mayor retorno primero. */
export function suggestNextAction(i: NextActionInput): NextAction | null {
  const canEmail = !i.emailOptOut;
  const canWhatsapp = !i.whatsappOptOut && !!i.phone;
  const canReach = canEmail || canWhatsapp;
  const channel = canWhatsapp ? 'por WhatsApp' : canEmail ? 'por correo' : '';

  const birthday = daysUntilBirthday(i.birthDate, i.now);
  if (birthday != null && birthday <= BIRTHDAY_HINT_DAYS && canReach) {
    return {
      kind: 'birthday',
      title: birthday === 0 ? 'Hoy cumple años: ofrécele el programa Cumpleañeros' : `Cumple en ${birthday} día${birthday === 1 ? '' : 's'}: ofrécele el programa Cumpleañeros`,
      reason: `Su cumpleaños es en ${birthday} día${birthday === 1 ? '' : 's'} y puedes escribirle ${channel}.`,
    };
  }

  if (i.prepaidBalance >= UNUSED_BALANCE_HINT_CLP && canReach) {
    return {
      kind: 'unused_balance',
      title: `Tiene ${clp(i.prepaidBalance)} de saldo sin usar`,
      reason: `Recuérdale ${channel} que puede gastarlo en la próxima fiesta.`,
    };
  }

  if (i.boughtLastEventButMissed && canReach) {
    return {
      kind: 'no_show',
      title: 'Compró la última fiesta y no vino',
      reason: `Su entrada nunca se escaneó en la puerta. Escríbele ${channel} para saber qué pasó y ofrecerle la próxima.`,
    };
  }

  const cold = i.totalOrders > 0 && (i.level === 'inactivo' || (i.daysSinceLastActivity ?? 0) > INACTIVE_AFTER_DAYS);
  if (cold) {
    if (!canReach) {
      return { kind: 'unreachable', title: 'Cliente inactivo y sin canal de contacto permitido', reason: 'Pidió no recibir correos y no tiene un WhatsApp habilitado.' };
    }
    return {
      kind: 'win_back',
      title: `No viene hace ${i.daysSinceLastActivity ?? '+' + INACTIVE_AFTER_DAYS} días: mándale un código de regreso`,
      reason: `Está inactivo (más de ${INACTIVE_AFTER_DAYS} días sin actividad). Escríbele ${channel}.`,
    };
  }

  if (i.level === 'vip' && canReach) {
    return {
      kind: 'vip',
      title: 'Cliente VIP: avísale primero cuando abra la próxima preventa',
      reason: `Gasto alto o marcado como VIP. Cuídalo con acceso anticipado ${channel}.`,
    };
  }

  if (!i.phone && !i.instagram) {
    return { kind: 'missing_contact', title: 'Sin teléfono ni Instagram', reason: 'Pídele un dato de contacto en su próxima compra para poder escribirle fuera del correo.' };
  }

  if (i.level === 'nuevo' && !i.birthDate && canReach) {
    return { kind: 'ask_birthday', title: 'Cliente nuevo: pídele su cumpleaños', reason: 'Con la fecha puedes ofrecerle el programa Cumpleañeros y escribirle justo cuando le sirve.' };
  }

  return null;
}
