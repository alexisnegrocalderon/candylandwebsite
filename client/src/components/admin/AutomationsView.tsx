import { CalendarClock, CheckCircle2, Clock3, Mail, Users } from 'lucide-react';
import { toast } from 'sonner';
import { Switch } from '@/components/ui/switch';
import { trpc } from '@/lib/trpc';
import { EmptyState } from '@/components/admin/EmptyState';
import { CrossCheckCard } from '@/components/admin/crossCheck/CrossCheckCard';
import { formatChileDateTime } from '@shared/chileDate';
import type { AutomationItem, AutomationState } from '@shared/automations';
import type { CrossCheckItem } from '@shared/crossCheck';

const STATE: Record<AutomationState, { label: string; cls: string }> = {
  off: { label: 'Apagado', cls: 'bg-white/10 text-white/70' },
  'cross-check': { label: 'Pide cross check', cls: 'bg-amber-400/15 text-amber-200' },
  auto: { label: 'Sale solo', cls: 'bg-emerald-400/15 text-emerald-200' },
};

/** «Programados» de Mailing: lo que está por salir (campañas guardadas) y todo lo que se manda solo, con cuándo, a
 * quién, con qué reglas y qué pasó la última vez. Los pedidos de cross check de cada uno se reportan acá mismo. */
export function AutomationsView({ onOpenSection }: { onOpenSection: (id: string) => void }) {
  const { data, isLoading } = trpc.mailing.automations.useQuery(undefined, { refetchInterval: 60_000 });
  const { data: campaigns } = trpc.mailing.listCampaigns.useQuery(undefined, { refetchInterval: 60_000 });
  const { data: checks } = trpc.crossCheck.list.useQuery(undefined, { refetchInterval: 30_000 });
  const utils = trpc.useUtils();
  const setAuto = trpc.crossCheck.setAuto.useMutation({
    onSuccess: () => { utils.mailing.automations.invalidate(); utils.crossCheck.config.invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  const upcoming = ((campaigns ?? []) as any[]).filter((c) => c.status === 'scheduled' || c.status === 'sending');
  const pendingFor = (kind: string | null) => (kind ? (checks?.pending ?? []).filter((c) => c.kind === kind) : []);

  return (
    <div className="space-y-5">
      {data && (
        <section className="admin-clay p-4 md:p-5">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-sky-400 to-violet-500 text-white"><Mail className="h-5 w-5" /></span>
            <div className="min-w-0 flex-1">
              <p className="text-sm text-muted-foreground">Correos automáticos de hoy</p>
              <p className="font-heading text-2xl tabular-nums leading-tight">{data.dailyCap.sent} <span className="text-base text-muted-foreground">de {data.dailyCap.cap}</span></p>
            </div>
          </div>
          <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full bg-gradient-to-r from-sky-400 to-violet-500" style={{ width: `${Math.min(100, Math.round((data.dailyCap.sent / Math.max(1, data.dailyCap.cap)) * 100))}%` }} />
          </div>
        </section>
      )}

      <section className="admin-clay p-4 md:p-5">
        <h3 className="font-heading text-lg">Campañas por salir</h3>
        <p className="mt-1 text-sm text-muted-foreground">Las que guardaste para envío programado o que se están mandando de a poco.</p>
        {upcoming.length === 0 ? (
          <p className="mt-3 rounded-2xl bg-white/5 px-4 py-3 text-sm text-muted-foreground">No hay campañas programadas ni en curso.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {upcoming.map((c) => {
              const done = (c.sentCount ?? 0) + (c.failedCount ?? 0) + (c.skippedCount ?? 0);
              return (
                <li key={c.id} className="rounded-2xl bg-white/5 px-4 py-3">
                  <div className="flex items-start gap-2">
                    <p className="min-w-0 flex-1 font-semibold">{c.name}</p>
                    <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${c.status === 'scheduled' ? 'bg-sky-400/15 text-sky-200' : 'bg-amber-400/15 text-amber-200'}`}>
                      {c.status === 'scheduled' ? 'Programada' : 'Enviando'}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-white/80">
                    {c.status === 'scheduled' && c.scheduledAt ? `Sale el ${formatChileDateTime(c.scheduledAt)}` : `${done} de ${c.totalRecipients} enviados`}
                    {c.audienceDescription ? ` · ${c.audienceDescription}` : ''}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <h3 className="px-1 font-heading text-lg">Envíos automáticos</h3>
        {isLoading && <p className="px-1 text-sm text-muted-foreground">Cargando…</p>}
        {data?.items.map((a) => <AutomationCard key={a.key} a={a} pending={pendingFor(a.crossCheckKind)} onToggle={(kind, askCrossCheck) => setAuto.mutate({ kind: kind as any, auto: !askCrossCheck })} onOpenSection={onOpenSection} toggling={setAuto.isPending} />)}
        {data && data.items.length === 0 && <EmptyState icon={CalendarClock} title="No hay envíos automáticos." />}
      </section>
    </div>
  );
}

function AutomationCard({ a, pending, onToggle, onOpenSection, toggling }: {
  a: AutomationItem;
  pending: CrossCheckItem[];
  onToggle: (kind: string, askCrossCheck: boolean) => void;
  onOpenSection: (id: string) => void;
  toggling: boolean;
}) {
  const st = STATE[a.state];
  return (
    <article className="admin-clay p-4 md:p-5">
      <div className="flex items-start gap-2">
        <h4 className="min-w-0 flex-1 font-heading text-lg leading-snug">{a.title}</h4>
        <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${st.cls}`}>{st.label}</span>
      </div>
      <p className="mt-2 text-base leading-relaxed">{a.what}</p>

      <dl className="mt-3 space-y-2 text-sm">
        <div className="flex gap-2"><Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" /><dd className="text-white/85"><span className="font-semibold">Cuándo: </span>{a.when}</dd></div>
        <div className="flex gap-2"><Users className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" /><dd className="text-white/85"><span className="font-semibold">Cómo: </span>{a.how}</dd></div>
        {(a.audience != null || a.sentToday != null) && (
          <div className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <dd className="text-white/85">
              {a.audience != null && <><span className="font-semibold">Les tocaría hoy: </span>{a.audience}. </>}
              {a.sentToday != null && <><span className="font-semibold">Enviados hoy: </span>{a.sentToday}.</>}
            </dd>
          </div>
        )}
      </dl>

      <p className="mt-3 rounded-2xl bg-white/5 px-3 py-2.5 text-sm">
        <span className="font-semibold">Última vez: </span>
        {a.lastRun ? <>{a.lastRun.result} <span className="text-muted-foreground">· {formatChileDateTime(a.lastRun.at)}</span></> : <span className="text-muted-foreground">todavía no ha salido</span>}
      </p>

      {a.upcoming.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {a.upcoming.map((u) => <li key={u} className="rounded-xl bg-white/5 px-3 py-2 text-sm">{u}</li>)}
        </ul>
      )}

      {pending.length > 0 && (
        <div className="mt-3 space-y-2">{pending.map((item) => <CrossCheckCard key={item.id} item={item} compact />)}</div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-3">
        {a.crossCheckKind && a.enabled && (
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <Switch checked={a.state === 'cross-check'} disabled={toggling} onCheckedChange={(v) => onToggle(a.crossCheckKind!, v)} aria-label={`Pedir cross check: ${a.title}`} />
            Pedir mi cross check antes de enviar
          </label>
        )}
        {a.section && (
          <button type="button" onClick={() => onOpenSection(a.section!)} className="admin-tab ml-auto flex h-11 items-center rounded-full px-4 text-sm font-medium">
            {a.enabled ? 'Configurar' : 'Prender'}
          </button>
        )}
      </div>
    </article>
  );
}
