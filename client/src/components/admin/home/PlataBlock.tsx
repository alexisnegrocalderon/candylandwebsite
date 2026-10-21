import { Banknote } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { EXPENSE_CATEGORIES } from '@shared/expenses';
import { HomeBlock, ListRow, MiniStat, ProgressRow, Unavailable, Widget, clp } from './primitives';

const CAT = new Map<string, (typeof EXPENSE_CATEGORIES)[number]>(EXPENSE_CATEGORIES.map((c) => [c.value, c]));
const monthLabel = (k: string) => {
  const [y, m] = k.split('-').map(Number);
  const s = new Date(Date.UTC(y, m - 1, 15)).toLocaleDateString('es-CL', { month: 'long', timeZone: 'UTC' });
  return s.charAt(0).toUpperCase() + s.slice(1);
};
const shortDate = (iso: string) => { const [y, m, d] = iso.split('-'); return y ? `${d}-${m}` : iso; };

export type PlataData = ReturnType<typeof usePlata>['data'];

export function usePlata(enabled: boolean) {
  return trpc.home.plata.useQuery(undefined, { enabled, refetchInterval: 300_000, refetchIntervalInBackground: false, retry: false });
}

export function PlataBlock({ data, loading, onOpen }: { data: PlataData; loading: boolean; onOpen: (s: string) => void }) {
  if (loading && !data) return <HomeBlock id="plata" title="Plata" subtitle="Cargando…" icon={Banknote}><p className="text-sm text-muted-foreground">Cargando…</p></HomeBlock>;
  if (!data) return null;
  const { cash, payables, sii, company, spend } = data;
  const mp = cash?.balances.find((b: any) => b.source === 'mercadopago');
  const bank = cash?.balances.find((b: any) => b.source === 'banco');
  const maxCat = Math.max(1, ...(spend?.byCategory ?? []).map((c: any) => c.amount));

  return (
    <HomeBlock id="plata" title="Plata" subtitle={`${monthLabel(data.monthKey)} · caja, deudas, impuestos y resultado`} icon={Banknote}>
      <Widget title="Caja real" onMore={() => onOpen('finanzas')}>
        {!cash ? <Unavailable /> : (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <MiniStat label="Mercado Pago" value={mp ? clp(mp.balance) : '—'} />
              <MiniStat label="Banco" value={bank ? clp(bank.balance) : '—'} />
              <MiniStat label="Retiraste este mes" value={clp(cash.monthWithdrawals)} />
              <MiniStat label="Quedó en la empresa" value={clp(cash.position.leftInCompany)} tone={cash.position.leftInCompany < 0 ? 'bad' : 'good'} />
            </div>
            {cash.pendingCount > 0 && (
              <button type="button" onClick={() => onOpen('finanzas')} className="text-xs text-amber-300 hover:underline">{cash.pendingCount} movimientos por clasificar ({clp(cash.pendingAmount)})</button>
            )}
          </div>
        )}
      </Widget>

      <Widget title="Por pagar" onMore={() => onOpen('finanzas')}>
        {!payables ? <Unavailable /> : (
          <div className="space-y-1">
            <MiniStat label="Total por pagar" value={clp(payables.total)} tone={payables.total > 0 ? 'warn' : 'good'} />
            <div className="pt-2">
              <ListRow left="Comisiones de embajadores" right={clp(payables.ambassadorsPending)} onClick={() => onOpen('ambassadors')} />
              <ListRow left={`Staff sin pagar${payables.staffUnpaidCount ? ` (${payables.staffUnpaidCount})` : ''}`} right={clp(payables.staffUnpaidTotal)} onClick={() => onOpen('finanzas')} />
              <ListRow left="Retenciones al SII" right={clp(payables.retentionSiiTotal)} onClick={() => onOpen('sii')} />
              <ListRow left="Estacionamiento al local" right={clp(payables.parkingTotal)} onClick={() => onOpen('parking')} />
              <ListRow left="Saldo de clientes en tarjetas" right={clp(payables.playcardSaldoClientes)} />
            </div>
          </div>
        )}
      </Widget>

      <Widget title="Impuestos (SII)" onMore={() => onOpen('sii')}>
        {!sii ? <Unavailable /> : !sii.next ? <p className="text-sm text-muted-foreground">Sin vencimientos pendientes.</p> : (
          <div className="space-y-2">
            <MiniStat
              label={sii.next.title}
              value={sii.next.daysLeft < 0 ? `venció hace ${Math.abs(sii.next.daysLeft)} d` : sii.next.daysLeft === 0 ? 'vence hoy' : `faltan ${sii.next.daysLeft} d`}
              hint={`Vence el ${shortDate(sii.next.dueDate)}${sii.next.status ? ` · ${sii.next.status}` : ''}`}
              tone={sii.next.daysLeft <= 1 ? 'bad' : sii.next.daysLeft <= 5 ? 'warn' : undefined}
              onClick={() => onOpen('sii')}
            />
            {sii.eventsToReview > 0 && <p className="text-xs text-muted-foreground">{sii.eventsToReview} evento(s) con el emisor por revisar.</p>}
          </div>
        )}
      </Widget>

      <Widget title="Resultado del mes" onMore={() => onOpen('gastos')}>
        {!company ? <Unavailable /> : (
          <div className="grid grid-cols-2 gap-3">
            <MiniStat label="Resultado" value={clp(company.result)} tone={company.result < 0 ? 'bad' : 'good'} />
            <MiniStat label="Ganancia de eventos" value={clp(company.eventsProfit)} />
            <MiniStat label="Gastos fijos" value={clp(company.unassignedExpenses)} />
            <MiniStat label="Resultado del año" value={clp(company.yearResult)} tone={company.yearResult < 0 ? 'bad' : undefined} hint={company.bestMonth ? `mejor mes: ${monthLabel(company.bestMonth)}` : undefined} />
          </div>
        )}
      </Widget>

      <Widget title="Gastos del mes" onMore={() => onOpen('gastos-hoy')} className="md:col-span-2 xl:col-span-2">
        {!spend ? <Unavailable /> : spend.count === 0 ? <p className="text-sm text-muted-foreground">Sin gastos cargados este mes.</p> : (
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <MiniStat label={`${spend.count} gastos`} value={clp(spend.total)} />
              {spend.byCategory.map((c: any) => (
                <ProgressRow key={c.category} label={`${CAT.get(c.category)?.emoji ?? ''} ${CAT.get(c.category)?.label ?? c.category}`} right={clp(c.amount)} pct={(c.amount / maxCat) * 100} />
              ))}
            </div>
            <div>
              <p className="mb-1 text-xs text-muted-foreground">Últimos cargados</p>
              {spend.latest.map((g: any, i: number) => <ListRow key={i} left={g.description} right={clp(g.amount)} />)}
            </div>
          </div>
        )}
      </Widget>
    </HomeBlock>
  );
}
