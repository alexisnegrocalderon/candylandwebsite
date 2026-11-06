import { CalendarClock, CheckCircle2, CircleDashed, Clock, Loader2, Plane, PowerOff, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import { useTonightEvent } from '@/hooks/useTonightEvent';
import { EmptyState } from '@/components/admin/EmptyState';
import { formatChileDateTime } from '@shared/chileDate';
import type { PilotStepState } from '@shared/eventPilot';
import { CrossCheckCard } from './CrossCheckCard';

const STATE: Record<PilotStepState, { label: string; icon: typeof Clock; cls: string }> = {
  futuro: { label: 'Más adelante', icon: CircleDashed, cls: 'text-white/60' },
  esperando: { label: 'Esperando tu cross check', icon: Clock, cls: 'text-amber-300' },
  'en curso': { label: 'En curso', icon: Loader2, cls: 'text-sky-300' },
  reportado: { label: 'Reportado', icon: CheckCircle2, cls: 'text-emerald-300' },
  descartado: { label: 'Descartado', icon: XCircle, cls: 'text-white/60' },
  vencido: { label: 'Ya pasó', icon: XCircle, cls: 'text-white/50' },
  fallo: { label: 'Falló', icon: XCircle, cls: 'text-red-300' },
};

/** Piloto automático del evento elegido arriba: un botón para prenderlo y la línea de tiempo de sus pasos. */
export function PilotView() {
  const { eventId, events } = useTonightEvent();
  const event = ((events ?? []) as any[]).find((e) => e.id === eventId);
  const { data: pilot, isLoading } = trpc.pilot.get.useQuery({ eventId: eventId! }, { enabled: !!eventId, refetchInterval: 30_000 });
  const { data: list } = trpc.crossCheck.list.useQuery(undefined, { enabled: !!eventId });
  const utils = trpc.useUtils();
  const after = () => Promise.all([utils.pilot.invalidate(), utils.crossCheck.list.invalidate(), utils.adminBadges.invalidate()]);
  const start = trpc.pilot.start.useMutation({ onSuccess: () => { toast.success('Piloto prendido: te va a pedir cross check en cada paso.'); after(); }, onError: (e) => toast.error(e.message) });
  const stop = trpc.pilot.stop.useMutation({ onSuccess: () => { toast('Piloto apagado'); after(); }, onError: (e) => toast.error(e.message) });

  if (!eventId) return <EmptyState icon={CalendarClock} title="Elige un evento arriba para ver su piloto." />;
  const pendingById = new Map((list?.pending ?? []).map((i) => [i.id, i]));

  return (
    <div className="space-y-5">
      <section className="admin-clay relative overflow-hidden p-5 md:p-7">
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-muted-foreground">Piloto automático</p>
        <h2 className="mt-1 font-heading text-2xl md:text-3xl">{event?.title ?? 'Evento'}</h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-white/80">
          Al prenderlo, cada paso te llega como push a su hora y espera tu «Reportar». Nada sale solo. Puedes apagarlo cuando quieras.
        </p>
        <div className="mt-5">
          {pilot?.on ? (
            <button type="button" disabled={stop.isPending} onClick={() => stop.mutate({ eventId })}
              className="admin-tab flex h-14 w-full items-center justify-center gap-2 rounded-2xl text-base font-semibold md:w-auto md:px-8">
              <PowerOff className="h-5 w-5" /> Apagar piloto
            </button>
          ) : (
            <button type="button" disabled={start.isPending || isLoading} onClick={() => start.mutate({ eventId })}
              className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-fuchsia-500 to-sky-500 text-lg font-semibold text-white shadow-lg shadow-fuchsia-500/25 active:scale-[0.98] disabled:opacity-60 md:w-auto md:px-10">
              {start.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Plane className="h-5 w-5" />} Iniciar piloto
            </button>
          )}
          {pilot?.on && pilot.startedAt && <p className="mt-2 text-sm text-muted-foreground">Prendido el {formatChileDateTime(pilot.startedAt)}</p>}
        </div>
      </section>

      <section className="admin-clay p-4 md:p-5">
        <h3 className="font-heading text-lg">Pasos</h3>
        <ol className="mt-3 space-y-3">
          {(pilot?.steps ?? []).map((s) => {
            const st = STATE[s.state];
            const pending = s.crossCheckId ? pendingById.get(s.crossCheckId) : undefined;
            return (
              <li key={s.key} className="rounded-2xl bg-white/5 p-4">
                <div className="flex items-start gap-3">
                  <st.icon className={`mt-0.5 h-5 w-5 shrink-0 ${st.cls} ${s.state === 'en curso' ? 'animate-spin' : ''}`} />
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{s.title}</p>
                    <p className="text-sm text-white/75">{s.detail}</p>
                    <p className="mt-1 text-sm">
                      <span className={st.cls}>{st.label}</span>
                      <span className="text-muted-foreground"> · {s.key === 'anuncio' || s.key === 'aviso-diario' ? 'al prender el piloto' : formatChileDateTime(s.at)}</span>
                    </p>
                    {s.result && <p className="mt-1 text-sm text-white/80">{s.result}</p>}
                  </div>
                </div>
                {pending && <div className="mt-3"><CrossCheckCard item={pending} compact /></div>}
              </li>
            );
          })}
        </ol>
      </section>
    </div>
  );
}
