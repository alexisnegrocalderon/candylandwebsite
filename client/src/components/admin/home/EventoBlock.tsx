import { CarFront, Radio } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { formatChileTime } from '@shared/chileDate';
import { HomeBlock, ListRow, MiniStat, ProgressRow, Unavailable, Widget, clp } from './primitives';

export type EventoData = ReturnType<typeof useEvento>['data'];

/** Datos del bloque Evento; Inicio también los usa para armar las alertas. */
export function useEvento(eventId: number | undefined) {
  return trpc.home.evento.useQuery({ eventId: eventId! }, {
    enabled: !!eventId,
    refetchInterval: (q) => (q.state.data?.live ? 30_000 : 60_000),
    refetchIntervalInBackground: false,
  });
}

export function EventoBlock({ data, loading, onOpen, onClose }: { data: EventoData; loading: boolean; onOpen: (s: string) => void; onClose?: () => void }) {
  if (loading && !data) return <HomeBlock onClose={onClose} id="evento" title="Evento" subtitle="Cargando…" icon={Radio}><p className="text-sm text-muted-foreground">Cargando…</p></HomeBlock>;
  if (!data) return null;
  const { pulse, caja, tickets, parking, manual, shifts, cajaAlerts } = data;
  const inside = caja?.insideCount ?? 0;
  const expected = caja?.expectedCount ?? 0;
  const insidePct = expected > 0 ? Math.round((inside / expected) * 100) : 0;
  const maxHour = Math.max(1, ...(caja?.salesByHour ?? []).map((h: any) => h.total));

  return (
    <HomeBlock onClose={onClose} id="evento" title="Evento" subtitle={data.live ? 'En vivo ahora' : 'Resumen del evento'} icon={Radio}>
      <Widget title="Pulso de la noche" onMore={() => onOpen('overview')} moreLabel="En vivo">
        {!pulse && !caja ? <Unavailable /> : (
          <div className="space-y-4">
            {caja && (
              <ProgressRow label="Gente adentro" right={`${inside} de ${expected}${caja.staffInside ? ` · ${caja.staffInside} staff` : ''}`} pct={insidePct} onClick={() => onOpen('overview')} />
            )}
            {pulse && (
              <div className="grid grid-cols-3 gap-3">
                <MiniStat label="últimos 5 min" value={clp(pulse.pace.last5)} />
                <MiniStat label="últimos 15 min" value={clp(pulse.pace.last15)} />
                <MiniStat label="última hora" value={clp(pulse.pace.last60)} />
              </div>
            )}
            {pulse && (
              <p className="text-xs text-muted-foreground">
                {pulse.lastSaleAt ? `Última venta a las ${formatChileTime(pulse.lastSaleAt)}` : 'Aún sin ventas registradas'} · {pulse.totals.sales} ventas · margen {pulse.totals.marginPercent != null ? `${pulse.totals.marginPercent}%` : '—'}
              </p>
            )}
          </div>
        )}
      </Widget>

      <Widget title="Entradas y stock" onMore={() => onOpen('events')}>
        {!tickets ? <Unavailable /> : tickets.length === 0 ? <p className="text-sm text-muted-foreground">Sin entradas cargadas.</p> : (
          <div className="space-y-3">
            {tickets.map((t: any) => {
              const pct = t.total > 0 ? Math.round((t.sold / t.total) * 100) : 0;
              const tone = t.remaining <= 0 ? 'bad' : t.remaining <= 10 || pct >= 90 ? 'warn' : undefined;
              return <ProgressRow key={t.id} label={t.name} right={t.remaining <= 0 ? 'agotada' : `${t.sold}/${t.total} · quedan ${t.remaining}`} pct={pct} tone={tone} onClick={() => onOpen('events')} />;
            })}
          </div>
        )}
      </Widget>

      <Widget title="Caja y barra" onMore={() => onOpen('caja')}>
        {!caja ? <Unavailable /> : (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <MiniStat label="Vendido en caja" value={clp(caja.totalSales)} hint={`${caja.salesCount} ventas`} />
              <MiniStat label="Turnos abiertos" value={shifts?.length ?? '—'} tone={shifts && shifts.length > 0 ? 'warn' : undefined} hint={shifts && shifts.length ? shifts.map((s: any) => s.register).filter(Boolean).slice(0, 2).join(', ') : undefined} />
            </div>
            {caja.topProducts.length > 0 && (
              <div>
                <p className="mb-1 text-xs text-muted-foreground">Más vendidos</p>
                {caja.topProducts.slice(0, 4).map((p: any) => <ListRow key={p.name} left={p.name} right={`${p.quantity}`} />)}
              </div>
            )}
            {caja.salesByHour.length > 0 && (
              <div className="flex h-12 items-end gap-1" aria-label="Ventas por hora">
                {caja.salesByHour.map((h: any) => (
                  <div key={h.hour} title={`${h.hour}:00 · ${clp(h.total)}`} className="flex-1 rounded-t bg-gradient-to-t from-primary/50 to-primary" style={{ height: `${Math.max(8, (h.total / maxHour) * 100)}%` }} />
                ))}
              </div>
            )}
            {cajaAlerts && cajaAlerts.length > 0 && (
              <p className="text-xs text-amber-300">⚠ {cajaAlerts[0].title}{cajaAlerts.length > 1 ? ` (+${cajaAlerts.length - 1})` : ''}</p>
            )}
          </div>
        )}
      </Widget>

      <Widget title="Estacionamiento" onMore={() => onOpen('parking')}>
        {!parking ? <Unavailable /> : (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <MiniStat label="Autos pagados" value={parking.totalPaid} hint={`online ${parking.online} · puerta ${parking.puerta}`} />
              <MiniStat label="Debes al local" value={clp(parking.amountOwedToVenueClp)} hint={`${clp(parking.venueFeePerCarClp)} por auto`} />
            </div>
            <p className="text-xs text-muted-foreground"><CarFront className="mr-1 inline h-3.5 w-3.5" />Autos en total: {parking.totalCars} (staff gratis: {parking.staff})</p>
          </div>
        )}
      </Widget>

      <Widget title="Accesos manuales" onMore={() => onOpen('manual-access')}>
        {!manual ? <Unavailable /> : (
          <div className="grid grid-cols-3 gap-3">
            <MiniStat label="En total" value={manual.total} />
            <MiniStat label="Invitaciones" value={manual.invitations} />
            <MiniStat label="Consumo staff" value={manual.staffConsumption} />
          </div>
        )}
      </Widget>
    </HomeBlock>
  );
}

