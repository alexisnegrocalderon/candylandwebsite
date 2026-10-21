import { useState } from 'react';
import { toast } from 'sonner';
import { AlertTriangle, Check, ImageIcon, X } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { useDemoProps } from '@/lib/demoMode';
import { formatChileShortDate } from '@shared/chileDate';
import { categoryLabel } from '@shared/expenses';
import { AdminPasswordDialog } from './AdminPasswordDialog';

/* Avisos de "este número puede estar mal" arriba del P&L de un evento. El
 * de doble conteo de mercadería ya no es solo un texto: muestra QUÉ gasto de
 * barra/merch y QUÉ productos con costo lo disparan, lado a lado, y deja
 * decidir gasto por gasto si es la misma mercadería (deja de restar) o es
 * otra cosa (sigue restando, no avisa más). */

type MerchCheck = {
  expenses: { id: number; description: string; supplier: string | null; category: string; amountTotal: number; expenseDate: Date | string; receiptUrl: string | null }[];
  products: { name: string; quantity: number; unitCost: number; total: number; channels: string[] }[];
  cogs: number;
};

const clp = (n: number) => `$${Math.round(n).toLocaleString('es-CL')}`;
const isMerchWarning = (w: string) => w.includes('barra/merch');

export function PnlWarnings({ warnings, merchCheck }: { warnings?: string[]; merchCheck?: MerchCheck | null }) {
  const others = (warnings ?? []).filter((w) => !(merchCheck && isMerchWarning(w)));
  if (others.length === 0 && !merchCheck) return null;
  return (
    <div className="space-y-3">
      {others.length > 0 && (
        <div className="rounded-2xl border border-amber-400/30 bg-[var(--admin-warning-bg)] p-4 space-y-1">
          <p className="text-sm font-semibold text-[var(--admin-warning-text)]">Ojo con estos números</p>
          {others.map((w, i) => <p key={i} className="text-sm text-[var(--admin-warning-text)]">{w}</p>)}
        </div>
      )}
      {merchCheck && <MerchDoubleCount check={merchCheck} />}
    </div>
  );
}

function MerchDoubleCount({ check }: { check: MerchCheck }) {
  const utils = trpc.useUtils();
  const demoProps = useDemoProps();
  const [pending, setPending] = useState<{ id: number; decision: 'same' | 'different'; label: string; amount: number } | null>(null);
  const review = trpc.expenses.reviewCogs.useMutation({
    onSuccess: (_r, v) => {
      toast.success(v.decision === 'same' ? 'Listo: ese gasto ya no resta del resultado.' : 'Listo: ese gasto sigue restando y no avisa más.');
      utils.cajaReports.eventPnl.invalidate();
      utils.expenses.listAll.invalidate();
      utils.finance.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <section className="rounded-2xl border border-amber-400/30 bg-[var(--admin-warning-bg)] p-4">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-[var(--admin-warning-text)]" />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-[var(--admin-warning-text)]">¿Estás contando la mercadería dos veces?</p>
          <p className="mt-1 text-sm text-[var(--admin-warning-text)]/90">
            Este evento tiene {check.expenses.length === 1 ? 'un gasto' : `${check.expenses.length} gastos`} de barra/merch y además productos vendidos con costo
            cargado ({clp(check.cogs)} en total). Si el gasto es la compra de lo mismo que ya tiene costo, se está restando dos veces.
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--admin-muted)]">Gastos de barra / merch</p>
          <div className="space-y-2">
            {check.expenses.map((e) => (
              <div key={e.id} className="admin-clay admin-clay-sm p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold">{e.description}</p>
                    <p className="text-xs text-[var(--admin-muted)]">
                      {categoryLabel(e.category as any)} · {formatChileShortDate(e.expenseDate)}{e.supplier ? ` · ${e.supplier}` : ''}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="font-bold tabular-nums">{clp(e.amountTotal)}</span>
                    {e.receiptUrl && (
                      <a href={e.receiptUrl} target="_blank" rel="noreferrer" aria-label="Ver boleta" className="text-[var(--admin-muted)] hover:text-white">
                        <ImageIcon className="h-4 w-4" />
                      </a>
                    )}
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <Button size="sm" className="h-auto min-h-9 whitespace-normal rounded-xl py-1.5" {...demoProps}
                    onClick={() => setPending({ id: e.id, decision: 'same', label: e.description, amount: e.amountTotal })}>
                    <Check className="mr-1.5 h-4 w-4 shrink-0" /> Sí, es lo mismo
                  </Button>
                  <Button size="sm" variant="outline" className="h-auto min-h-9 whitespace-normal rounded-xl py-1.5" {...demoProps}
                    onClick={() => setPending({ id: e.id, decision: 'different', label: e.description, amount: e.amountTotal })}>
                    <X className="mr-1.5 h-4 w-4 shrink-0" /> No, es otra cosa
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--admin-muted)]">Productos vendidos con costo cargado</p>
          <div className="admin-clay admin-clay-sm divide-y divide-white/10 p-0">
            {check.products.length === 0 ? (
              <p className="p-3 text-sm text-[var(--admin-muted)]">Sin detalle de productos.</p>
            ) : check.products.map((p) => (
              <div key={p.name} className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm">
                <div className="min-w-0">
                  <p className="truncate font-medium">{p.name}</p>
                  <p className="text-xs text-[var(--admin-muted)]">
                    {p.quantity} × {clp(p.unitCost)} · vendido en {p.channels.map((c) => (c === 'caja' ? 'caja' : 'web')).join(' y ')}
                  </p>
                </div>
                <span className="shrink-0 font-semibold tabular-nums">{clp(p.total)}</span>
              </div>
            ))}
            <div className="flex justify-between px-3 py-2.5 text-sm font-bold">
              <span>Costo total de producto</span>
              <span className="tabular-nums">{clp(check.cogs)}</span>
            </div>
          </div>
          <p className="mt-2 text-xs text-[var(--admin-muted)]">
            Ejemplo: si compraste ron como gasto y cada trago ya tiene el costo del ron, es lo mismo. Si el gasto es hielo, vasos o algo
            que no está en el costo de los productos, es otra cosa.
          </p>
        </div>
      </div>

      <AdminPasswordDialog
        open={!!pending}
        title={pending?.decision === 'same' ? '¿Es la misma mercadería?' : '¿Es otra cosa?'}
        description={pending?.decision === 'same'
          ? `"${pending.label}" (${clp(pending.amount)}) va a dejar de restar del resultado del evento, porque ya está dentro del costo de los productos. Sigue en el libro de compras y para el SII.`
          : `"${pending?.label ?? ''}" sigue restando del resultado y este aviso no se vuelve a mostrar por ese gasto.`}
        actionLabel={pending?.decision === 'same' ? 'Sí, no restar de nuevo' : 'Sí, es otra cosa'}
        onConfirm={(adminPassword) => review.mutateAsync({ id: pending!.id, decision: pending!.decision, adminPassword })}
        onClose={() => setPending(null)}
      />
    </section>
  );
}
