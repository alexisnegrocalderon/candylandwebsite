import { ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { Switch } from '@/components/ui/switch';
import { trpc } from '@/lib/trpc';
import { EmptyState } from '@/components/admin/EmptyState';
import { formatChileDateTime } from '@shared/chileDate';
import { CROSS_CHECK_AUTOMATIONS, CROSS_CHECK_LABELS, type CrossCheckItem } from '@shared/crossCheck';
import { CrossCheckCard } from './CrossCheckCard';

const STATUS: Record<CrossCheckItem['status'], { label: string; cls: string }> = {
  pending: { label: 'Esperando', cls: 'bg-amber-400/15 text-amber-200' },
  running: { label: 'En curso', cls: 'bg-sky-400/15 text-sky-200' },
  done: { label: 'Reportado', cls: 'bg-emerald-400/15 text-emerald-200' },
  failed: { label: 'Falló', cls: 'bg-red-400/15 text-red-200' },
  discarded: { label: 'Descartado', cls: 'bg-white/10 text-white/70' },
  expired: { label: 'Venció', cls: 'bg-white/10 text-white/60' },
};

/** Pantalla «Cross check»: lo que espera tu visto bueno, lo que ya pasó y qué automatizaciones salen solas. */
export function CrossCheckView() {
  const { data, isLoading } = trpc.crossCheck.list.useQuery(undefined, { refetchInterval: 30_000 });
  const { data: config } = trpc.crossCheck.config.useQuery();
  const utils = trpc.useUtils();
  const setAuto = trpc.crossCheck.setAuto.useMutation({ onSuccess: () => utils.crossCheck.config.invalidate(), onError: (e) => toast.error(e.message) });

  return (
    <div className="space-y-5">
      <section className="admin-clay p-4 md:p-5">
        <h2 className="font-heading text-xl">Esperando tu cross check</h2>
        <p className="mt-1 text-sm text-muted-foreground">Nada de esto sale hasta que toques «Reportar». Te llega un push cuando aparece algo nuevo.</p>
        <div className="mt-4 space-y-3">
          {isLoading ? null : (data?.pending.length ?? 0) === 0
            ? <EmptyState icon={ShieldCheck} title="Todo revisado: no hay nada esperando." />
            : data!.pending.map((item) => <CrossCheckCard key={item.id} item={item} />)}
        </div>
      </section>

      <section className="admin-clay p-4 md:p-5">
        <h3 className="font-heading text-lg">¿Qué pide cross check?</h3>
        <p className="mt-1 text-sm text-muted-foreground">Prendido = antes de salir te pide el visto bueno. Apagado = sale solo, como antes. El piloto del evento siempre pide.</p>
        <ul className="mt-3 space-y-2">
          {CROSS_CHECK_AUTOMATIONS.map((kind) => {
            const asks = !(config?.[kind]?.auto ?? false);
            return (
              <li key={kind} className="flex min-h-14 items-center gap-3 rounded-2xl bg-white/5 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{CROSS_CHECK_LABELS[kind].title}</p>
                  <p className="text-sm text-muted-foreground">{CROSS_CHECK_LABELS[kind].detail}</p>
                </div>
                <Switch checked={asks} disabled={!config || setAuto.isPending} onCheckedChange={(v) => setAuto.mutate({ kind, auto: !v })} aria-label={`Pedir cross check: ${CROSS_CHECK_LABELS[kind].title}`} />
              </li>
            );
          })}
        </ul>
      </section>

      {(data?.recent.length ?? 0) > 0 && (
        <section className="admin-clay p-4 md:p-5">
          <h3 className="font-heading text-lg">Historial</h3>
          <ul className="mt-3 space-y-2">
            {data!.recent.map((item) => (
              <li key={item.id} className="rounded-2xl bg-white/5 px-4 py-3">
                <div className="flex items-start gap-2">
                  <p className="min-w-0 flex-1 font-medium">{item.title}</p>
                  <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS[item.status].cls}`}>{STATUS[item.status].label}</span>
                </div>
                {item.result && <p className="mt-1 text-sm text-white/80">{item.result}</p>}
                <p className="mt-1 text-xs text-muted-foreground">{formatChileDateTime(item.decidedAt ?? item.createdAt)}</p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
