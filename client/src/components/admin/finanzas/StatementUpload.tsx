import { useState } from 'react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import { useIsDemo } from '@/lib/demoMode';

const money = (n: number) => `${n < 0 ? '-' : ''}$${Math.abs(Math.round(n)).toLocaleString('es-CL')}`;
const onErr = (e: unknown) => toast.error((e as { message?: string })?.message || 'No se pudo completar la acción');

/** Subir el estado de cuenta de Mercado Pago o la cartola del banco (CSV): se
 * detecta solo, muestra un resumen y se importa sin duplicar. Se usa en
 * Finanzas → Caja y en Finanzas → Mercado Pago. */
export function StatementUpload({ onImported, buttonClass }: { onImported: () => void; buttonClass: string }) {
  const isDemo = useIsDemo();
  const [statement, setStatement] = useState<{ text: string; preview: any } | null>(null);
  const imp = trpc.cash.importStatement.useMutation({ onError: onErr });

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > 2_500_000) { toast.error('El archivo es muy grande (máx. 2,5 MB).'); return; }
    if (/\.(xlsx?|xls)$/i.test(file.name)) { toast.error('Guarda la cartola como CSV desde Excel (Archivo → Guardar como → CSV) y súbela de nuevo.'); return; }
    const text = await file.text();
    imp.mutate({ text, preview: true }, { onSuccess: (r) => setStatement({ text, preview: r }) });
  };

  return (
    <div className="space-y-3">
      <input type="file" accept=".csv,text/csv,.txt" disabled={isDemo || imp.isPending} onChange={(e) => onFile(e.target.files?.[0])} className="block w-full text-sm" />
      {statement?.preview?.error && <p className="text-sm text-red-600">{statement.preview.error}</p>}
      {statement?.preview && !statement.preview.error && (
        <div className="space-y-2">
          <p className="text-sm">{statement.preview.format === 'mercadopago' ? 'Estado de cuenta de Mercado Pago' : 'Cartola del banco'}: <strong>{statement.preview.movements.length}</strong> movimientos{statement.preview.skipped ? ` (salté ${statement.preview.skipped} filas sin fecha o monto)` : ''}.</p>
          {statement.preview.totals && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs admin-clay-sm p-3">
              <p>Ventas liberadas <strong className="block text-sm tabular-nums">{money(statement.preview.totals.ventasBrutas)}</strong></p>
              <p>Comisiones Mercado Pago <strong className="block text-sm tabular-nums">{money(statement.preview.totals.comisiones)}</strong>{statement.preview.feePercent != null ? ` (${statement.preview.feePercent}%)` : ''}</p>
              <p>Transferencias enviadas <strong className="block text-sm tabular-nums">{money(statement.preview.totals.transferenciasEnviadas)}</strong></p>
              <p>Pagos con Mercado Pago <strong className="block text-sm tabular-nums">{money(statement.preview.totals.pagos)}</strong></p>
              <p>Retiros <strong className="block text-sm tabular-nums">{money(statement.preview.totals.retiros)}</strong></p>
              <p>Transferencias recibidas <strong className="block text-sm tabular-nums">{money(statement.preview.totals.transferenciasRecibidas)}</strong></p>
              <p>Rentabilidad <strong className="block text-sm tabular-nums">{money(statement.preview.totals.rentabilidad)}</strong></p>
              <p>Saldo final <strong className="block text-sm tabular-nums">{statement.preview.finalBalance != null ? money(statement.preview.finalBalance) : '—'}</strong></p>
            </div>
          )}
          <div className="max-h-64 overflow-y-auto space-y-1">
            {statement.preview.movements.slice(0, 30).map((m: any) => (
              <div key={m.externalId} className="flex gap-3 text-xs">
                <span className="w-20 shrink-0">{m.date}</span><span className="flex-1 truncate">{m.description}</span>
                <span className={`tabular-nums ${m.amount < 0 ? 'text-red-600' : 'text-emerald-700'}`}>{money(m.amount)}</span>
              </div>
            ))}
          </div>
          <button type="button" disabled={isDemo || imp.isPending} className={buttonClass}
            onClick={() => imp.mutate({ text: statement.text, preview: false }, { onSuccess: (r: any) => { setStatement(null); onImported(); toast.success(`Importados ${r.imported} movimientos nuevos`); } })}>
            Importar {statement.preview.movements.length} movimientos
          </button>
        </div>
      )}
    </div>
  );
}
