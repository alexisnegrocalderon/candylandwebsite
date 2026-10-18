import { useState } from 'react';
import { toast } from 'sonner';
import { ImageIcon, Plus, Trash2 } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { EXPENSE_CATEGORIES } from '@shared/expenses';
import { formatChileTime } from '@shared/chileDate';
import { clp, useExpensesSummary } from './useExpensesSummary';

/* Lo cargado hoy, para confirmar que quedó guardado. Borrar pide la clave de
 * admin, igual que en /admin (pedido explícito del dueño: nada se borra solo
 * con la sesión abierta; este teléfono anda de pie en una ferretería y la
 * sesión dura una semana). */
export function ExpensesToday({ onAdd }: { onAdd?: () => void }) {
  const utils = trpc.useUtils();
  const { today, todayTotal, monthTotal, refetch, isLoading } = useExpensesSummary();
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [deletePassword, setDeletePassword] = useState('');
  const remove = trpc.expenses.delete.useMutation({
    onSuccess: () => {
      refetch();
      utils.cajaReports.eventPnl.invalidate();
      toast.success('Gasto eliminado');
      setDeletingId(null);
      setDeletePassword('');
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <section className="admin-clay grid grid-cols-2 divide-x divide-white/10 p-0">
        <div className="p-4 text-center">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Hoy</p>
          <p className="mt-1 whitespace-nowrap text-2xl font-bold tracking-tight tabular-nums sm:text-3xl">{clp(todayTotal)}</p>
        </div>
        <div className="p-4 text-center">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Este mes</p>
          <p className="mt-1 whitespace-nowrap text-2xl font-bold tracking-tight tabular-nums sm:text-3xl">{clp(monthTotal)}</p>
        </div>
      </section>

      {isLoading ? (
        <div className="flex justify-center py-10"><div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" /></div>
      ) : today.length === 0 ? (
        <section className="admin-clay p-8 text-center">
          <p className="text-sm text-muted-foreground">Todavía no hay gastos cargados hoy.</p>
          {onAdd && (
            <Button onClick={onAdd} className="mt-4 rounded-full"><Plus className="mr-2 h-4 w-4" /> Cargar gasto</Button>
          )}
        </section>
      ) : (
        <section className="admin-clay divide-y divide-white/10 p-0">
          {today.map((e: any) => {
            const cat = EXPENSE_CATEGORIES.find((c) => c.value === e.category);
            return (
              <div key={e.id} className="px-4 py-3">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/5 text-lg" aria-hidden="true">{cat?.emoji ?? '📦'}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{e.description}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {cat?.label}{e.supplier ? ` · ${e.supplier}` : ''} · {formatChileTime(e.createdAt ?? e.expenseDate)}
                    </p>
                  </div>
                  <span className="shrink-0 font-semibold tabular-nums">{clp(Number(e.amountTotal))}</span>
                  {e.receiptUrl && (
                    <a href={e.receiptUrl} target="_blank" rel="noreferrer" aria-label={`Ver boleta de ${e.description}`}
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-white/5 hover:text-white">
                      <ImageIcon className="h-4 w-4" />
                    </a>
                  )}
                  <button type="button" onClick={() => { setDeletingId(deletingId === e.id ? null : e.id); setDeletePassword(''); }}
                    aria-label={`Eliminar ${e.description}`}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-white/5 hover:text-destructive">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                {deletingId === e.id && (
                  <div className="mt-3 space-y-2">
                    <p className="text-xs text-muted-foreground">Escribe tu clave de admin para eliminar este gasto.</p>
                    <Input type="password" autoFocus value={deletePassword} onChange={(ev) => setDeletePassword(ev.target.value)}
                      placeholder="Clave de admin" className="h-11 rounded-xl" />
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" className="flex-1" onClick={() => { setDeletingId(null); setDeletePassword(''); }}>
                        Cancelar
                      </Button>
                      <Button variant="destructive" size="sm" className="flex-1" disabled={!deletePassword || remove.isPending}
                        onClick={() => remove.mutate({ id: e.id, adminPassword: deletePassword })}>
                        {remove.isPending ? 'Eliminando…' : 'Eliminar'}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </section>
      )}
    </div>
  );
}
