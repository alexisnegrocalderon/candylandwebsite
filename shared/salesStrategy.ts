/* Director comercial IA (server/salesStrategist.ts): cruza el ritmo de ventas
 * del próximo evento contra el evento anterior, proyecta cuántas entradas se
 * van a vender y la IA recomienda qué hacer. Acá vive lo PURO -- las cuentas
 * del ritmo y la proyección, y la forma del reporte -- para que el servidor
 * (que arma el reporte) y el panel (que lo muestra) usen lo mismo y se pueda
 * probar sin base de datos ni IA.
 *
 * Todos los números los calcula el código, nunca el modelo: la IA recibe las
 * cifras ya hechas y solo las interpreta. Así una recomendación nunca se
 * apoya en un número inventado. */

const DAY_MS = 24 * 60 * 60 * 1000;

/** Una venta de entradas (acceso) aprobada: cuándo y cuántas. */
export interface SaleRow {
  at: Date;
  units: number;
  revenue: number;
}

/** Días que faltan para el evento (puede ser 0 el mismo día, negativo si ya
 * pasó). Redondea hacia arriba: a 2,3 días todavía "faltan 3". */
export function daysUntil(eventDate: Date, now: Date): number {
  return Math.ceil((eventDate.getTime() - now.getTime()) / DAY_MS);
}

/** Entradas vendidas con al menos `daysOut` días de anticipación al evento --
 * o sea, lo que ya estaba vendido cuando faltaban `daysOut` días. Sirve para
 * comparar dos eventos "a la misma distancia" de su fecha. */
export function unitsSoldAtDaysOut(rows: SaleRow[], eventDate: Date, daysOut: number): number {
  const limit = eventDate.getTime() - daysOut * DAY_MS;
  let units = 0;
  for (const r of rows) if (r.at.getTime() <= limit) units += r.units;
  return units;
}

export function totalUnits(rows: SaleRow[]): number {
  return rows.reduce((sum, r) => sum + r.units, 0);
}

export function totalRevenue(rows: SaleRow[]): number {
  return rows.reduce((sum, r) => sum + r.revenue, 0);
}

/** Entradas de los últimos 7 días y de los 7 anteriores -- la tendencia
 * reciente, que dice si el ritmo sube o se enfría. */
export function weeklyPace(rows: SaleRow[], now: Date): { last7: number; prev7: number } {
  const t = now.getTime();
  let last7 = 0;
  let prev7 = 0;
  for (const r of rows) {
    const age = t - r.at.getTime();
    if (age < 0) continue;
    if (age < 7 * DAY_MS) last7 += r.units;
    else if (age < 14 * DAY_MS) prev7 += r.units;
  }
  return { last7, prev7 };
}

/** Con menos de esto vendido a la misma distancia, la comparación con el
 * evento anterior es puro ruido (un evento anterior que a esa fecha llevaba 3
 * entradas multiplica cualquier cosa por un número enorme). */
const MIN_COMPARABLE_UNITS = 10;

export type ProjectionMethod = 'comparado' | 'ritmo';

export interface Projection {
  projectedFinalUnits: number;
  method: ProjectionMethod;
}

/** Cuántas entradas se van a vender en total (incluida la puerta del evento).
 *
 * - `comparado`: si el evento anterior llevaba una cantidad comparable a la
 *   misma distancia de su fecha, se escala por cómo terminó (llevamos X,
 *   ellos llevaban Y y cerraron en Z -> proyectamos X·Z/Y). Es lo más fiel
 *   porque ya incluye cómo se acelera la venta al final.
 * - `ritmo`: si no hay con qué comparar, se extiende el ritmo de los últimos
 *   7 días por los días que faltan. Es una cota conservadora (no considera
 *   la aceleración de la última semana).
 *
 * `null` si no hay base para ninguna de las dos. */
export function projectFinalUnits(input: {
  unitsSoFar: number;
  daysOut: number;
  last7: number;
  previous: { atSameDaysOut: number; finalUnits: number } | null;
}): Projection | null {
  const { unitsSoFar, daysOut, last7, previous } = input;
  if (previous && previous.atSameDaysOut >= MIN_COMPARABLE_UNITS && previous.finalUnits > 0) {
    return {
      projectedFinalUnits: Math.round((unitsSoFar * previous.finalUnits) / previous.atSameDaysOut),
      method: 'comparado',
    };
  }
  if (daysOut > 0 && last7 > 0) {
    return {
      projectedFinalUnits: Math.round(unitsSoFar + (last7 / 7) * daysOut),
      method: 'ritmo',
    };
  }
  return null;
}

export type Urgency = 'alta' | 'media' | 'baja';

export interface SalesStrategyRecommendation {
  title: string;
  why: string;
  action: string;
  urgency: Urgency;
}

export interface SalesStrategyReport {
  generatedAt: string;
  eventId: number;
  eventTitle: string;
  eventDate: string;
  daysOut: number;
  numbers: {
    unitsSold: number;
    revenue: number;
    unitsLast7: number;
    unitsPrev7: number;
    previousEvent: { title: string; unitsAtSameDaysOut: number; finalUnits: number } | null;
    projectedFinalUnits: number | null;
    projectionMethod: ProjectionMethod | null;
  };
  summary: string;
  recommendations: SalesStrategyRecommendation[];
  risks: string[];
}

/** Lo que se guarda en `siteSettings.salesStrategyState`: el último reporte y
 * el interruptor del correo de los lunes. Prendido por defecto (mismo
 * criterio que el coach semanal del agente). */
export interface SalesStrategyState {
  weeklyEnabled: boolean;
  report: SalesStrategyReport | null;
}

const n = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const strings = (raw: unknown): string[] =>
  Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string' && x.trim().length > 0) : [];

function normalizeUrgency(v: unknown): Urgency {
  return v === 'alta' || v === 'baja' ? v : 'media';
}

/** `null` si no hay reporte guardado (o está roto). */
export function normalizeSalesStrategyReport(raw: unknown): SalesStrategyReport | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, any>;
  if (typeof r.generatedAt !== 'string' || typeof r.summary !== 'string' || typeof r.eventTitle !== 'string') return null;
  const nums = (r.numbers && typeof r.numbers === 'object' ? r.numbers : {}) as Record<string, any>;
  const prev = nums.previousEvent && typeof nums.previousEvent === 'object' ? nums.previousEvent : null;
  return {
    generatedAt: r.generatedAt,
    eventId: n(r.eventId),
    eventTitle: r.eventTitle,
    eventDate: typeof r.eventDate === 'string' ? r.eventDate : r.generatedAt,
    daysOut: n(r.daysOut),
    numbers: {
      unitsSold: n(nums.unitsSold),
      revenue: n(nums.revenue),
      unitsLast7: n(nums.unitsLast7),
      unitsPrev7: n(nums.unitsPrev7),
      previousEvent: prev
        ? { title: String(prev.title ?? ''), unitsAtSameDaysOut: n(prev.unitsAtSameDaysOut), finalUnits: n(prev.finalUnits) }
        : null,
      projectedFinalUnits: nums.projectedFinalUnits == null ? null : n(nums.projectedFinalUnits),
      projectionMethod: nums.projectionMethod === 'comparado' || nums.projectionMethod === 'ritmo' ? nums.projectionMethod : null,
    },
    summary: r.summary,
    recommendations: Array.isArray(r.recommendations)
      ? r.recommendations
          .filter((x: any) => x && typeof x.title === 'string' && x.title.trim().length > 0)
          .slice(0, 6)
          .map((x: any) => ({
            title: String(x.title),
            why: typeof x.why === 'string' ? x.why : '',
            action: typeof x.action === 'string' ? x.action : '',
            urgency: normalizeUrgency(x.urgency),
          }))
      : [],
    risks: strings(r.risks),
  };
}

export function normalizeSalesStrategyState(raw: unknown): SalesStrategyState {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    weeklyEnabled: r.weeklyEnabled !== false,
    report: normalizeSalesStrategyReport(r.report),
  };
}
