import { chileHourOf } from './chileDate';

export interface HourBucket { hour: number; total: number; count: number }

/** Ventas agrupadas por hora de Chile, en el orden en que pasó la noche
 * (22, 23, 0, 1 ... y no 0, 1, 22, 23): se ordena por la primera venta de
 * cada hora, no por el número de la hora. */
export function salesByChileHour(sales: { createdAt: Date | string; total: number }[]): HourBucket[] {
  const sorted = [...sales].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  const buckets = new Map<number, HourBucket>();
  for (const s of sorted) {
    const hour = chileHourOf(s.createdAt);
    const b = buckets.get(hour) ?? { hour, total: 0, count: 0 };
    b.total += Number(s.total);
    b.count += 1;
    buckets.set(hour, b);
  }
  return Array.from(buckets.values());
}
