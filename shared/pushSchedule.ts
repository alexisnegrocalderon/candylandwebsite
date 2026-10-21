/** Cuándo sale cada aviso de marketing: horas silenciosas y "mejor hora por
 * persona". Lógica pura (hora de Chile con Intl, sin dependencias). */

/** No se mandan avisos de promoción entre las 23:00 y las 09:00 (Chile). */
export const QUIET_FROM = 23;
export const QUIET_TO = 9;
/** Hora estándar mientras no hay aperturas suficientes de esa persona. */
export const DEFAULT_HOUR = 19;
/** Aperturas mínimas para fiarse de la hora de una persona. */
export const MIN_OPENS_FOR_BEST_HOUR = 3;

const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' });

/** Fecha (YYYY-MM-DD) y hora (0-23) en Chile. */
export function chileParts(d: Date): { day: string; hour: number } {
  const p = Object.fromEntries(fmt.formatToParts(d).map((x) => [x.type, x.value]));
  return { day: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour) };
}

export function isQuietHour(hour: number): boolean {
  return hour >= QUIET_FROM || hour < QUIET_TO;
}

function safeParse(v: string): unknown {
  try { return JSON.parse(v); } catch { return null; }
}

/** Suma una apertura a las 24 casillas (hora de Chile) de una persona. */
export function recordOpenHour(histIn: unknown, hour: number): number[] {
  const hist = typeof histIn === 'string' ? safeParse(histIn) : histIn;
  const out = Array.isArray(hist) && hist.length === 24 ? hist.map((n) => Math.max(0, Number(n) || 0)) : new Array<number>(24).fill(0);
  if (Number.isInteger(hour) && hour >= 0 && hour < 24) out[hour] += 1;
  return out;
}

/** La hora (9-22) en que esa persona abre más la app; la estándar si hay pocas aperturas. */
export function bestHour(histIn: unknown): number {
  const hist = typeof histIn === 'string' ? safeParse(histIn) : histIn;
  if (!Array.isArray(hist) || hist.length !== 24) return DEFAULT_HOUR;
  const counts = hist.map((n) => Math.max(0, Number(n) || 0));
  if (counts.reduce((a, b) => a + b, 0) < MIN_OPENS_FOR_BEST_HOUR) return DEFAULT_HOUR;
  let best = DEFAULT_HOUR;
  let max = -1;
  for (let h = QUIET_TO; h < QUIET_FROM; h++) {
    if (counts[h] > max) { max = counts[h]; best = h; }
  }
  return max > 0 ? best : DEFAULT_HOUR;
}

/** Primer instante desde `from` en que en Chile son las `hour`:00 (ahora mismo si ya es esa hora). */
export function nextAtChileHour(from: Date, hour: number): Date {
  if (chileParts(from).hour === hour) return from;
  const start = new Date(Math.floor(from.getTime() / 3_600_000) * 3_600_000);
  for (let i = 1; i <= 49; i++) {
    const c = new Date(start.getTime() + i * 3_600_000);
    if (chileParts(c).hour === hour) return c;
  }
  return from;
}

/** Cuándo sale el aviso a una suscripción: a su mejor hora si `smart`, y nunca en horas silenciosas. */
export function computeSendAt(now: Date, hist: unknown, opts: { smart: boolean; respectQuiet?: boolean }): Date {
  let at = opts.smart ? nextAtChileHour(now, bestHour(hist)) : now;
  if (opts.respectQuiet !== false && isQuietHour(chileParts(at).hour)) at = nextAtChileHour(at, QUIET_TO);
  return at;
}
