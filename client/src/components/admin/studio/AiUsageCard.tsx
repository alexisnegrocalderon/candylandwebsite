import { useState } from 'react';
import { Loader2, Wallet } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatUsd } from '@shared/studioAi';

/* Cuánto se va en créditos de IA, por función y por día (tabla aiUsage). */

const RANGES = [{ days: 7, label: '7 días' }, { days: 30, label: '30 días' }] as const;

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
