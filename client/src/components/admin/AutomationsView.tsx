import { useState } from 'react';
import { CalendarClock, CheckCircle2, Clock3, Mail, Users } from 'lucide-react';
import { toast } from 'sonner';
import { Switch } from '@/components/ui/switch';
import { trpc } from '@/lib/trpc';
import { EmptyState } from '@/components/admin/EmptyState';
import { CrossCheckCard } from '@/components/admin/crossCheck/CrossCheckCard';
import { formatChileDateTime } from '@shared/chileDate';
import { SALES_SEND_LABELS, type AutomationItem, type AutomationState, type SalesSendKey } from '@shared/automations';
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

  // Interruptor de cada aviso de venta. Son excluyentes: el servidor apaga los otros al prender uno.
  const enableSend = trpc.settings.update.useMutation({
    onSuccess: (_r, vars) => {
      utils.mailing.automations.invalidate();
      utils.settings.get.invalidate();
      const key = (Object.keys(vars) as SalesSendKey[]).find((k) => k in SALES_SEND_LABELS);
      if (key) toast.success((vars as any)[key] ? `${SALES_SEND_LABELS[key]} encendido (los otros dos avisos de venta se apagan).` : `${SALES_SEND_LABELS[key]} apagado.`);
    },
    onError: (e) => toast.error(e.message),
  });
  // Recomendado: dejar solo el aviso diario de venta, encendido y sin pedir cross check. Cubre todas las tandas solo.
  const [confirmingRecommended, setConfirmingRecommended] = useState(false);
  const leaveAutomatic = async () => {
    try {
      await enableSend.mutateAsync({ salesDripEnabled: true });
      await setAuto.mutateAsync({ kind: 'sales-drip', auto: true });
      setConfirmingRecommended(false);
    } catch { /* cada paso ya avisó su error */ }
  };
  const drip = data?.items.find((i) => i.key === 'sales-drip');

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
        {drip && !(drip.state === 'auto') && (
          <div className="admin-clay border-2 border-primary/40 p-4 md:p-5">
            <p className="font-heading text-lg">Para que salga todo solo</p>
            <p className="mt-1 text-sm leading-relaxed text-white/85">
              Los tres avisos de venta (primeros cupos, 2ª tanda y aviso diario) <strong>no pueden estar encendidos a la vez</strong>: al prender uno se apagan los otros.
              El <strong>aviso diario de venta</strong> los reemplaza y sigue solo por todas las tandas hasta la fiesta, siempre con el precio vigente, a quienes no han comprado.
            </p>
            {!confirmingRecommended ? (
              <button type="button" onClick={() => setConfirmingRecommended(true)}
                className="mt-3 flex h-12 w-full items-center justify-center rounded-2xl bg-gradient-to-r from-fuchsia-500 to-sky-500 text-base font-semibold text-white active:scale-[0.98]">
                Dejar el aviso diario encendido y automático
              </button>
            ) : (
              <div className="mt-3 space-y-2 rounded-2xl bg-white/5 p-3 text-sm">
                <p>Desde la próxima hora, cada día saldrán correos <strong>sin pedirte «Reportar»</strong>: {drip.how}</p>
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" disabled={enableSend.isPending || setAuto.isPending} onClick={() => void leaveAutomatic()}
                    className="flex h-12 items-center justify-center rounded-2xl bg-emerald-500 text-base font-semibold text-white disabled:opacity-60">Sí, dejarlo</button>
                  <button type="button" onClick={() => setConfirmingRecommended(false)} className="admin-tab flex h-12 items-center justify-center rounded-2xl text-base font-medium">No</button>
                </div>
              </div>
            )}
          </div>
        )}
        {isLoading && <p className="px-1 text-sm text-muted-foreground">Cargando…</p>}
        {data?.items.map((a) => <AutomationCard key={a.key} a={a} pending={pendingFor(a.crossCheckKind)} onEnable={(key, on) => enableSend.mutate({ [key]: on })} enabling={enableSend.isPending} onToggle={(kind, askCrossCheck) => setAuto.mutate({ kind: kind as any, auto: !askCrossCheck })} onOpenSection={onOpenSection} toggling={setAuto.isPending} />)}
        {data && data.items.length === 0 && <EmptyState icon={CalendarClock} title="No hay envíos automáticos." />}
      </section>
    </div>
  );
}

function AutomationCard({ a, pending, onToggle, onOpenSection, toggling, onEnable, enabling }: {
  a: AutomationItem;
  onEnable: (key: SalesSendKey, on: boolean) => void;
  enabling: boolean;
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
        {a.enableKey && (
          <label className="flex min-h-11 w-full items-center gap-2 text-base font-semibold">
            <Switch checked={a.enabled} disabled={enabling} onCheckedChange={(v) => onEnable(a.enableKey!, v)} aria-label={`Encender: ${a.title}`} />
            {a.enabled ? 'Encendido' : 'Apagado: toca para encender'}
          </label>
        )}
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
