import { chileDateKey } from './chileDate';

export interface SalesDay {
  /** Día calendario de Chile, "YYYY-MM-DD". */
  day: string;
  orders: number;
  revenue: number;
}

/** Suma de "YYYY-MM-DD" + n días (aritmética de calendario, sin zona). */
function addDays(day: string, n: number): string {
  const [y, m, d] = day.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + n));
  return date.toISOString().slice(0, 10);
}

/** Agrupa ventas por día de Chile y rellena con ceros los días sin ventas
 * entre la primera y la última, para que el gráfico de Inicio no "salte"
 * días y la curva cuente la verdad. */
export function groupSalesByChileDay(rows: { createdAt: Date | string; total: number | string }[]): SalesDay[] {
  if (rows.length === 0) return [];
  const byDay = new Map<string, SalesDay>();
  for (const r of rows) {
    const day = chileDateKey(r.createdAt);
    const entry = byDay.get(day) ?? { day, orders: 0, revenue: 0 };
    entry.orders += 1;
    entry.revenue += Number(r.total) || 0;
    byDay.set(day, entry);
  }
  const days = Array.from(byDay.keys()).sort();
  const out: SalesDay[] = [];
  for (let day = days[0]; day <= days[days.length - 1]; day = addDays(day, 1)) {
    out.push(byDay.get(day) ?? { day, orders: 0, revenue: 0 });
  }
  return out;
}
