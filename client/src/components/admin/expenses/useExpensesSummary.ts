import { trpc } from '@/lib/trpc';
import { chileDateKey } from '@shared/chileDate';

export const clp = (n: number) => `$${Math.round(n).toLocaleString('es-CL')}`;

/** Lo cargado hoy y en el mes (días de Chile) + el último gasto, para el
 * terminal y la pestaña "Hoy". `expenseDate` llega como Date (superjson):
 * se compara por el día calendario de Chile, no por texto en UTC. */
export function useExpensesSummary() {
  // Viene ordenada por fecha descendente (server/db.ts): el primer elemento
  // es siempre el último gasto cargado, sin importar el día.
  const { data, refetch, isLoading } = trpc.expenses.listAll.useQuery({});
  const all = data ?? [];
  const todayKey = chileDateKey(new Date());
  const monthKey = todayKey.slice(0, 7);
  const today = all.filter((e: any) => chileDateKey(e.expenseDate) === todayKey);
  const todayTotal = today.reduce((s: number, e: any) => s + Number(e.amountTotal), 0);
  const monthTotal = all
    .filter((e: any) => chileDateKey(e.expenseDate).slice(0, 7) === monthKey)
    .reduce((s: number, e: any) => s + Number(e.amountTotal), 0);
  return { today, todayTotal, monthTotal, lastExpense: all[0] as any, refetch, isLoading };
}
