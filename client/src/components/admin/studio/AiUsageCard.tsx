import { useState } from 'react';
import { Loader2, Pencil, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatUsd } from '@shared/studioAi';

/* Cuánto se va en créditos de IA, por función y por día (tabla aiUsage). */

const RANGES = [{ days: 7, label: '7 días' }, { days: 30, label: '30 días' }] as const;

const LEVEL_COLOR = { 'sin-tope': 'bg-muted-foreground/40', ok: 'bg-emerald-500', warn: 'bg-amber-500', danger: 'bg-orange-600', blocked: 'bg-red-600' } as const;

/** Barra de saldo: tope mensual y saldo que anotas a mano (Anthropic no entrega el saldo por API). */
function BudgetBar() {
  const utils = trpc.useUtils();
  const { data } = trpc.aiUsage.budget.useQuery(undefined, { staleTime: 30_000 });
  const [editing, setEditing] = useState(false);
  const [cap, setCap] = useState('');
  const [balance, setBalance] = useState('');
  const [spent, setSpent] = useState('');
  const save = trpc.aiUsage.setBudget.useMutation({
    onSuccess: () => { utils.aiUsage.budget.invalidate(); setEditing(false); toast.success('Guardado.'); },
    onError: (e) => toast.error(e.message),
  });
  if (!data) return null;
  const num = (v: string) => Number(v.replace(',', '.'));
  const startEdit = () => { setCap(String(data.capUsd || '')); setBalance(String(data.balanceUsd || '')); setSpent(data.spentMonthUsd ? data.spentMonthUsd.toFixed(2) : ''); setEditing(true); };
  const money = (n: number | null) => (n == null ? '–' : `US$${n.toFixed(2).replace('.', ',')}`);

  return (
    <div className="space-y-2 rounded-xl bg-muted/40 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">Saldo y tope del mes</p>
        <Button size="sm" variant="ghost" onClick={startEdit}><Pencil className="h-3.5 w-3.5 mr-1" /> Actualizar</Button>
      </div>
      {data.level === 'sin-tope' && !editing && (
        <p className="text-sm text-muted-foreground">Anota tu tope mensual y tu saldo (los ves en platform.claude.com) y te aviso antes de que se acabe.</p>
      )}
      {data.level !== 'sin-tope' && (
        <>
          {data.capUsd > 0 && (
            <div>
              <div className="h-3 w-full overflow-hidden rounded-full bg-muted">
                <div className={`h-full ${LEVEL_COLOR[data.level]}`} style={{ width: `${Math.max(2, data.percent)}%` }} />
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {money(data.spentMonthUsd)} de {money(data.capUsd)} del tope ({Math.round(data.percent)}%) · quedan {money(data.capLeftUsd)}
              </p>
            </div>
          )}
          <p className="text-sm">
            Puedes gastar ≈ <strong>{money(data.spendableUsd)}</strong>
            {data.balanceLeftUsd != null && <span className="text-muted-foreground"> · saldo estimado {money(data.balanceLeftUsd)}</span>}
          </p>
          {data.level === 'blocked' && <p className="text-sm text-red-600">Llegaste al límite: la IA no responde. Sube el tope o agrega fondos en platform.claude.com.</p>}
        </>
      )}
      {editing && (
        <div className="flex flex-wrap items-end gap-3 pt-1">
          <div className="space-y-1"><Label>Tope mensual (US$)</Label><Input inputMode="decimal" className="w-28" value={cap} onChange={(e) => setCap(e.target.value)} /></div>
          <div className="space-y-1"><Label>Saldo hoy (US$)</Label><Input inputMode="decimal" className="w-28" value={balance} onChange={(e) => setBalance(e.target.value)} /></div>
          <div className="space-y-1"><Label>Gasto del mes (US$)</Label><Input inputMode="decimal" className="w-28" value={spent} onChange={(e) => setSpent(e.target.value)} /></div>
          <Button size="sm" disabled={save.isPending} onClick={() => save.mutate({ capUsd: num(cap) || 0, balanceUsd: num(balance) || 0, spentMonthUsd: spent.trim() ? num(spent) || 0 : undefined })}>
            {save.isPending && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />} Guardar
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancelar</Button>
        </div>
      )}
    </div>
  );
}

export function AiUsageCard() {
  const [days, setDays] = useState<number>(7);
  const { data, isLoading } = trpc.aiUsage.summary.useQuery({ days }, { staleTime: 60_000 });
  const maxDay = Math.max(0.0001, ...(data?.byDay.map((d) => d.usd) ?? [0]));

  return (
    <Card className="rounded-2xl border-0 shadow-md shadow-black/5">
      <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
        <CardTitle className="text-base flex items-center gap-2"><Wallet className="h-4 w-4" /> Gasto de IA</CardTitle>
        <div className="flex gap-1">
          {RANGES.map((r) => (
            <Button key={r.days} size="sm" variant={days === r.days ? 'default' : 'outline'} onClick={() => setDays(r.days)}>{r.label}</Button>
          ))}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <BudgetBar />
        {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
        {data && data.calls === 0 && (
          <p className="text-sm text-muted-foreground">Todavía no hay gasto registrado. Aparece apenas la IA se use (si recién lo activaste, falta correr la migración).</p>
        )}
        {data && data.calls > 0 && (
          <>
            <p className="text-sm">
              <span className="text-2xl font-heading">{formatUsd(data.totalUsd)}</span>{' '}
              <span className="text-muted-foreground">en {data.calls} llamadas (últimos {days} días, estimado)</span>
            </p>
            <div className="space-y-1.5">
              {data.byFeature.map((f) => (
                <div key={f.feature} className="flex items-center justify-between gap-3 text-sm">
                  <span className="truncate">{f.label}</span>
                  <span className="shrink-0 text-muted-foreground">{f.calls} · {formatUsd(f.usd)}</span>
                </div>
              ))}
            </div>
            <div className="flex items-end gap-1 h-16" aria-label="Gasto por día">
              {data.byDay.map((d) => (
                <div key={d.day} title={`${d.day}: ${formatUsd(d.usd)}`} className="flex-1 min-w-[3px] rounded-t bg-primary/70" style={{ height: `${Math.max(4, (d.usd / maxDay) * 100)}%` }} />
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
