import { Users } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { HomeBlock, ListRow, MiniStat, ProgressRow, Unavailable, Widget, clp } from './primitives';

export type GenteData = ReturnType<typeof useGente>['data'];

export function useGente(eventId: number | undefined) {
  return trpc.home.gente.useQuery({ eventId: eventId ?? null }, { refetchInterval: 300_000, refetchIntervalInBackground: false });
}

export function GenteBlock({ data, loading, badgeCounts, onOpen, onClose }: { data: GenteData; loading: boolean; badgeCounts: Record<string, number>; onOpen: (s: string) => void; onClose?: () => void }) {
  if (loading && !data) return <HomeBlock onClose={onClose} id="gente" title="Gente" subtitle="Cargando…" icon={Users}><p className="text-sm text-muted-foreground">Cargando…</p></HomeBlock>;
  if (!data) return null;
  const { clientes, embajadores, mensajes, concursos, comunidad } = data;
  const mail = mensajes?.email;
  const mailPct = mail && mail.dailyCap > 0 ? Math.round((mail.sentToday / mail.dailyCap) * 100) : 0;

  return (
    <HomeBlock onClose={onClose} id="gente" title="Gente" subtitle="Clientes, embajadores, mensajes y comunidad" icon={Users}>
      <Widget title="Clientes" onMore={() => onOpen('customers')}>
        {!clientes ? <Unavailable /> : (
          <div className="grid grid-cols-2 gap-3">
            <MiniStat label="En la base" value={clientes.total.toLocaleString('es-CL')} onClick={() => onOpen('customers')} />
            <MiniStat label="Nuevos (7 días)" value={clientes.nuevos7d} tone={clientes.nuevos7d > 0 ? 'good' : undefined} onClick={() => onOpen('customers')} />
            <MiniStat label="Recurrentes" value={clientes.recurrentes} onClick={() => onOpen('customers')} />
            <MiniStat label="Para recuperar" value={clientes.inactivos} hint="sin comprar hace +120 días" onClick={() => onOpen('winback')} />
            {clientes.birthdaysPending > 0 && <div className="col-span-2"><ListRow left="Postulaciones de cumpleaños pendientes" right={clientes.birthdaysPending} onClick={() => onOpen('birthdays')} /></div>}
          </div>
        )}
      </Widget>

      <Widget title="Embajadores" onMore={() => onOpen('ambassadors')}>
        {!embajadores ? <Unavailable /> : (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <MiniStat label="Activos" value={embajadores.activeAmbassadors} />
              <MiniStat label="Ventas del evento" value={embajadores.eventSales} hint={clp(embajadores.eventRevenue)} />
              <MiniStat label="Comisión del evento" value={clp(embajadores.eventCommission)} />
              <MiniStat label="Clientes nuevos" value={embajadores.newClients} hint={`${embajadores.existingClients} existentes`} />
            </div>
            {embajadores.topAmbassador && <p className="text-xs text-muted-foreground">Top: <strong className="text-foreground">{(embajadores.topAmbassador as any).name ?? (embajadores.topAmbassador as any).code}</strong></p>}
            {embajadores.pendingApplications > 0 && <ListRow left="Postulaciones por revisar" right={embajadores.pendingApplications} onClick={() => onOpen('ambassadors')} />}
          </div>
        )}
      </Widget>

      <Widget title="Mensajes y mailing" onMore={() => onOpen('mailing')}>
        {!mensajes ? <Unavailable /> : (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-3">
              <MiniStat label="Instagram sin leer" value={badgeCounts['instagram'] ?? 0} tone={(badgeCounts['instagram'] ?? 0) > 0 ? 'warn' : undefined} onClick={() => onOpen('instagram')} />
              <MiniStat label="WhatsApp sin leer" value={badgeCounts['whatsapp'] ?? 0} tone={(badgeCounts['whatsapp'] ?? 0) > 0 ? 'warn' : undefined} onClick={() => onOpen('whatsapp')} />
              <MiniStat label="Esperan tu respuesta" value={mensajes.handoffsPending} tone={mensajes.handoffsPending > 0 ? 'bad' : undefined} onClick={() => onOpen('instagram')} />
            </div>
            {mail && <ProgressRow label="Correos de hoy" right={`${mail.sentToday} de ${mail.dailyCap}`} pct={mailPct} tone={mailPct >= 90 ? 'bad' : mailPct >= 70 ? 'warn' : undefined} onClick={() => onOpen('mailing')} />}
            {mensajes.drip?.enabled && <p className="text-xs text-muted-foreground">Goteo de ventas: {mensajes.drip.sentToday} enviados hoy, {mensajes.drip.dueToday} por enviar ({mensajes.drip.audienceSize.toLocaleString('es-CL')} en la audiencia).</p>}
          </div>
        )}
      </Widget>

      <Widget title="Concursos" onMore={() => onOpen('contests')}>
        {!concursos ? <Unavailable /> : concursos.length === 0 ? <p className="text-sm text-muted-foreground">Sin concursos activos.</p> : (
          <div>{concursos.map((c: any) => <ListRow key={c.id} left={c.title} right={`${c.participants} participantes`} onClick={() => onOpen('contests')} />)}</div>
        )}
      </Widget>

      <Widget title="Comunidad" onMore={() => onOpen('denuncias')}>
        {!comunidad ? <Unavailable /> : (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <MiniStat label="Denuncias abiertas" value={comunidad.reportsOpen} tone={comunidad.reportsOpen > 0 ? 'bad' : 'good'} onClick={() => onOpen('denuncias')} />
              <MiniStat label="Tragos sin retirar" value={comunidad.giftsUnclaimed} tone={comunidad.giftsUnclaimed > 0 ? 'warn' : undefined} onClick={() => onOpen('party-gifts')} />
            </div>
            {comunidad.survey && (
              <ListRow
                left={`Encuesta: ${comunidad.survey.answered} de ${comunidad.survey.sent} respondieron`}
                right={comunidad.survey.avgRating != null ? `★ ${comunidad.survey.avgRating}` : undefined}
                onClick={() => onOpen('event-survey')}
              />
            )}
          </div>
        )}
      </Widget>
    </HomeBlock>
  );
}
