import { useMemo } from 'react';
import {
  Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import {
  ArrowRight, ArrowUpRight, ArrowDownRight, CalendarClock, CheckCircle2, DollarSign, Gift, Instagram, Mail,
  MessageCircle, Plus, ShieldAlert, ShoppingBag, Store, Ticket, Trophy, UserPlus, Crown, Zap, Martini, Compass,
  type LucideIcon,
} from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { formatChileDate } from '@shared/chileDate';
import { EmptyState } from '@/components/admin/EmptyState';
import { useIsDemo } from '@/lib/demoMode';
import { buildHomeAlerts } from '@shared/homeAlerts';
import { pickCurrentEvent } from '@shared/currentEvent';
import { AlertsStrip } from '@/components/admin/home/AlertsStrip';
import { useEvento } from '@/components/admin/home/EventoBlock';
import { usePlata } from '@/components/admin/home/PlataBlock';
import { useGente } from '@/components/admin/home/GenteBlock';
import { SummaryTabs } from '@/components/admin/home/SummaryTabs';

/** Pantalla de entrada del panel: cómo va el próximo evento, qué está
 * esperando una respuesta y atajos a lo que más se usa. Solo lee -- toda
 * acción manda a la sección que ya existe para eso. */

const clp = (n: number) => `$${Math.round(n).toLocaleString('es-CL')}`;

/** Pendientes que se muestran como chips, en orden de urgencia. */
const PENDING: { id: string; label: (n: number) => string; icon: LucideIcon }[] = [
  { id: 'denuncias', label: (n) => `${n} denuncia${n === 1 ? '' : 's'} sin resolver`, icon: ShieldAlert },
  { id: 'instagram', label: (n) => `${n} chat${n === 1 ? '' : 's'} de Instagram sin leer`, icon: Instagram },
  { id: 'whatsapp', label: (n) => `${n} chat${n === 1 ? '' : 's'} de WhatsApp sin leer`, icon: MessageCircle },
  { id: 'caja', label: (n) => `${n} turno${n === 1 ? '' : 's'} de caja abierto${n === 1 ? '' : 's'}`, icon: Store },
  { id: 'party-gifts', label: (n) => `${n} trago${n === 1 ? '' : 's'} pagado${n === 1 ? '' : 's'} sin retirar`, icon: Martini },
  { id: 'ambassadors', label: (n) => `${n} postulación${n === 1 ? '' : 'es'} a embajador`, icon: Crown },
  { id: 'orders-web', label: (n) => `${n} venta${n === 1 ? '' : 's'} web nueva${n === 1 ? '' : 's'}`, icon: Ticket },
  { id: 'orders-caja', label: (n) => `${n} venta${n === 1 ? '' : 's'} de caja nueva${n === 1 ? '' : 's'}`, icon: ShoppingBag },
  { id: 'leads', label: (n) => `${n} lead${n === 1 ? '' : 's'} nuevo${n === 1 ? '' : 's'}`, icon: UserPlus },
  { id: 'customers', label: (n) => `${n} cliente${n === 1 ? '' : 's'} nuevo${n === 1 ? '' : 's'}`, icon: UserPlus },
  { id: 'referrals', label: (n) => `${n} referido${n === 1 ? '' : 's'} nuevo${n === 1 ? '' : 's'}`, icon: Trophy },
];

const QUICK_ACTIONS: { label: string; icon: LucideIcon; section?: string; href?: string }[] = [
  { label: 'Crear evento', icon: Plus, section: 'events' },
  { label: 'Acceso manual', icon: Gift, section: 'manual-access' },
  { label: 'Promo Flash', icon: Zap, section: 'flash-promo' },
  { label: 'Abrir caja', icon: Store, href: '/caja' },
  { label: 'Nuevo mailing', icon: Mail, section: 'mailing' },
];

export function HomeView({ badgeCounts, onOpen }: { badgeCounts: Record<string, number>; onOpen: (sectionId: string) => void }) {
  const { data: events } = trpc.events.listAll.useQuery();

  // El «próximo» es el que está pasando o el siguiente que viene (no el más cercano en el tiempo, que tras una
  // fiesta sigue siendo la que ya pasó); si ya no hay ninguno por venir, el último que pasó.
  const { current, previous, currentIsPast } = useMemo(() => {
    const { event: cur, past } = pickCurrentEvent((events ?? []) as any[]);
    const list = [...((events ?? []) as any[])]
      .filter((e) => e.status !== 'draft' && e.status !== 'cancelled')
      .sort((a, b) => new Date(a.eventDate).getTime() - new Date(b.eventDate).getTime());
    const prev = cur ? [...list].reverse().find((e) => new Date(e.eventDate).getTime() < new Date(cur.eventDate).getTime()) ?? null : null;
    return { current: cur as any, previous: prev, currentIsPast: past };
  }, [events]);

  const eventId: number | undefined = current?.id;
  const opts = { enabled: !!eventId, refetchInterval: 60_000 };
  const { data: web } = trpc.orders.getStats.useQuery({ channel: 'web', eventId: eventId! }, opts);
  const { data: caja } = trpc.orders.getStats.useQuery({ channel: 'caja', eventId: eventId! }, opts);
  const { data: prevWeb } = trpc.orders.getStats.useQuery({ channel: 'web', eventId: previous?.id }, { enabled: !!previous?.id });
  const { data: pnl } = trpc.cajaReports.eventPnl.useQuery({ eventId: eventId! }, opts);
  const { data: byDay } = trpc.orders.salesByDay.useQuery({ eventId }, opts);
  const { data: byOrigin } = trpc.orders.salesByOrigin.useQuery({ eventId }, opts);

  // Bloques de resumen (Evento, Plata, Gente) y la franja de alertas. La
  // plata real es solo del administrador: al invitado de demostración no se
  // le pide ni se le muestra.
  const isDemo = useIsDemo();
  const evento = useEvento(eventId);
  const plata = usePlata(!isDemo);
  const gente = useGente(eventId);
  const alerts = useMemo(() => buildHomeAlerts({
    liveAlerts: evento.data?.pulse?.alerts ?? null,
    siiNext: plata.data?.sii?.next ?? null,
    siiEventsToReview: plata.data?.sii?.eventsToReview ?? 0,
    cashPending: plata.data?.cash?.pendingCount ?? 0,
    tickets: evento.data?.tickets?.map((t) => ({ name: t.name, remaining: t.remaining, total: t.total, status: t.status })) ?? null,
    badges: badgeCounts,
    handoffsPending: gente.data?.mensajes?.handoffsPending ?? 0,
    emailDaily: gente.data?.mensajes?.email ? { remaining: gente.data.mensajes.email.remaining, cap: gente.data.mensajes.email.dailyCap } : null,
    cajaAlerts: evento.data?.cajaAlerts ?? null,
  }), [evento.data, plata.data, gente.data, badgeCounts]);

  const webRevenue = Number(web?.totalRevenue ?? 0);
  const webOrders = Number(web?.approvedOrders ?? 0);
  const cajaRevenue = Number(caja?.totalRevenue ?? 0);
  const prevRevenue = previous ? Number(prevWeb?.totalRevenue ?? 0) : null;
  const delta = prevRevenue && prevRevenue > 0 ? Math.round(((webRevenue - prevRevenue) / prevRevenue) * 100) : null;
  const daysLeft = current ? Math.ceil((new Date(current.eventDate).getTime() - Date.now()) / 86_400_000) : null;
  const profit = pnl?.netProfit ?? null;

  const pending = PENDING.filter((p) => (badgeCounts[p.id] ?? 0) > 0);
  const chart = (byDay ?? []).map((d) => ({ ...d, label: formatShortDay(d.day) }));
  const origins = (byOrigin ?? []).slice(0, 5);
  const originMax = Math.max(1, ...origins.map((o) => o.revenue));

  return (
    <div className="space-y-5">
      {/* Héroe: el próximo evento */}
      <section className="admin-clay relative overflow-hidden p-5 md:p-7">
        <div className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full bg-[oklch(0.65_0.25_340/0.35)] blur-3xl" aria-hidden="true" />
        <div className="relative flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">{currentIsPast ? 'Último evento' : 'Próximo evento'}</p>
            <h2 className="mt-1 truncate font-heading text-2xl md:text-3xl">{current?.title ?? 'Sin eventos todavía'}</h2>
            {current && (
              <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
                <CalendarClock className="h-4 w-4" />
                {formatChileDate(current.eventDate)}
                {daysLeft != null && daysLeft > 0 && <> · faltan <strong className="text-foreground">{daysLeft} día{daysLeft === 1 ? '' : 's'}</strong></>}
                {daysLeft != null && daysLeft <= 0 && daysLeft > -1 && <> · <strong className="text-foreground">¡es hoy!</strong></>}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={() => onOpen(current ? 'overview' : 'events')}
            className="admin-tab flex h-11 shrink-0 items-center justify-center gap-2 self-start rounded-full px-5 text-sm font-semibold md:self-auto"
          >
            {current ? 'Ver la noche en vivo' : 'Crear el primer evento'} <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </section>

      <AlertsStrip alerts={alerts} onOpen={onOpen} />

      {/* Resumen de todas las secciones: tarjetas cerradas, se abre una a la vez */}
      <SummaryTabs
        evento={evento.data} eventoLoading={evento.isLoading} plata={plata.data} plataLoading={plata.isLoading} gente={gente.data} genteLoading={gente.isLoading}
        hasEvent={!!eventId} isDemo={isDemo} badgeCounts={badgeCounts} onOpen={onOpen}
      />

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 md:gap-4">
        <Kpi icon={DollarSign} tone="from-[oklch(0.70_0.19_340)] to-[oklch(0.74_0.16_360)]" label="Recaudado web" value={clp(webRevenue)}
          delta={delta} deltaHint={previous ? `vs ${previous.title}` : undefined} onClick={() => onOpen('orders-web')} />
        <Kpi icon={Ticket} tone="from-[oklch(0.74_0.13_220)] to-[oklch(0.70_0.14_240)]" label="Compras aprobadas" value={webOrders.toLocaleString('es-CL')} onClick={() => onOpen('orders-web')} />
        <Kpi icon={ShoppingBag} tone="from-[oklch(0.70_0.15_290)] to-[oklch(0.66_0.17_310)]" label="Ventas en caja" value={clp(cajaRevenue)} onClick={() => onOpen('orders-caja')} />
        <Kpi
          icon={profit != null && profit < 0 ? ArrowDownRight : ArrowUpRight}
          tone={profit != null && profit < 0 ? 'from-[oklch(0.65_0.20_25)] to-[oklch(0.60_0.21_15)]' : 'from-[oklch(0.75_0.15_150)] to-[oklch(0.72_0.14_170)]'}
          label={profit != null && profit < 0 ? 'Pérdida del evento' : 'Ganancia del evento'}
          value={profit != null ? clp(profit) : '—'}
          onClick={() => onOpen('gastos')}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        {/* Gráfico de ventas */}
        <section className="admin-clay p-5 lg:col-span-2">
          <div className="mb-4 flex items-baseline justify-between gap-3">
            <h3 className="font-heading text-lg">Ventas web por día</h3>
            <button type="button" onClick={() => onOpen('orders-web')} className="text-sm text-muted-foreground hover:text-foreground">Ver ventas →</button>
          </div>
          {chart.length === 0 ? (
            <EmptyState icon={Ticket} title="Todavía no hay ventas web para este evento" />
          ) : (
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chart} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="homeSales" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="oklch(0.72 0.2 342)" stopOpacity={0.55} />
                      <stop offset="100%" stopColor="oklch(0.72 0.2 342)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.08)" />
                  <XAxis dataKey="label" tick={{ fill: 'rgba(255,255,255,0.6)', fontSize: 12 }} axisLine={false} tickLine={false} minTickGap={16} />
                  <YAxis tick={{ fill: 'rgba(255,255,255,0.6)', fontSize: 12 }} axisLine={false} tickLine={false} width={56}
                    tickFormatter={(v: number) => (v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M` : v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))} />
                  <Tooltip
                    contentStyle={{ background: 'rgba(30,19,42,0.96)', border: '1px solid rgba(255,255,255,0.14)', borderRadius: 12, color: 'white' }}
                    formatter={(v: number, name: string) => (name === 'revenue' ? [clp(v), 'Recaudado'] : [v, 'Compras'])}
                    labelStyle={{ color: 'rgba(255,255,255,0.7)' }}
                  />
                  <Area type="monotone" dataKey="revenue" stroke="oklch(0.78 0.18 342)" strokeWidth={2.5} fill="url(#homeSales)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </section>

        {/* Pendientes */}
        <section className="admin-clay p-5">
          <h3 className="mb-3 font-heading text-lg">Pendientes</h3>
          {pending.length === 0 ? (
            <div className="flex items-center gap-3 rounded-2xl bg-white/5 p-4 text-sm text-muted-foreground">
              <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-300" />
              Todo al día: nada esperando respuesta.
            </div>
          ) : (
            <ul className="space-y-2">
              {pending.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => onOpen(p.id)}
                    className="admin-tab flex w-full items-center gap-3 rounded-2xl px-3.5 py-3 text-left text-sm"
                  >
                    <p.icon className="h-4 w-4 shrink-0 text-primary" />
                    <span className="flex-1">{p.label(badgeCounts[p.id])}</span>
                    <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        {/* Accesos rápidos */}
        <section className="admin-clay p-5 lg:col-span-2">
          <h3 className="mb-3 font-heading text-lg">Accesos rápidos</h3>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
            {QUICK_ACTIONS.map((a) => {
              const inner = (
                <>
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-[oklch(0.6_0.2_290)] text-white">
                    <a.icon className="h-5 w-5" />
                  </span>
                  <span className="text-sm font-medium">{a.label}</span>
                </>
              );
              const cls = 'admin-tile flex flex-col items-center gap-2 rounded-2xl px-2 py-4 text-center';
              return a.href
                ? <a key={a.label} href={a.href} className={cls}>{inner}</a>
                : <button key={a.label} type="button" onClick={() => onOpen(a.section!)} className={cls}>{inner}</button>;
            })}
          </div>
        </section>

        {/* Ventas por origen */}
        <section className="admin-clay p-5">
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <h3 className="font-heading text-lg">De dónde vienen</h3>
            <button type="button" onClick={() => onOpen('sales-origin')} className="text-sm text-muted-foreground hover:text-foreground">Detalle →</button>
          </div>
          {origins.length === 0 ? (
            <EmptyState icon={Compass} title="Sin ventas con origen todavía" />
          ) : (
            <ul className="space-y-3">
              {origins.map((o) => (
                <li key={`${o.utmSource}-${o.utmMedium}-${o.utmCampaign}`} className="text-sm">
                  <div className="mb-1 flex justify-between gap-2">
                    <span className="truncate">{o.utmSource}{o.utmCampaign ? ` · ${o.utmCampaign}` : ''}</span>
                    <span className="shrink-0 tabular-nums text-muted-foreground">{clp(o.revenue)}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-white/8">
                    <div className="h-full rounded-full bg-gradient-to-r from-primary to-secondary" style={{ width: `${(o.revenue / originMax) * 100}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

    </div>
  );
}

function Kpi({ icon: Icon, tone, label, value, delta, deltaHint, onClick }: {
  icon: LucideIcon;
  tone: string;
  label: string;
  value: string;
  delta?: number | null;
  deltaHint?: string;
  onClick: () => void;
}) {
  return (
    <button type="button" onClick={onClick} className="admin-clay flex min-w-0 flex-col items-start gap-3 p-4 text-left transition-transform hover:-translate-y-0.5 md:p-5">
      <span className={`flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br ${tone} md:h-11 md:w-11`}>
        <Icon className="h-5 w-5 text-white" />
      </span>
      <span className="w-full min-w-0">
        <span className="block truncate font-heading text-xl tabular-nums leading-tight md:text-3xl">{value}</span>
        <span className="mt-1 block text-xs text-muted-foreground md:text-sm">{label}</span>
        {delta != null && (
          <span className={`mt-1.5 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${delta >= 0 ? 'bg-emerald-400/15 text-emerald-300' : 'bg-red-400/15 text-red-300'}`} title={deltaHint}>
            {delta >= 0 ? '+' : ''}{delta}%{deltaHint ? <span className="hidden font-normal opacity-80 sm:inline"> {deltaHint}</span> : null}
          </span>
        )}
      </span>
    </button>
  );
}

/** "2026-08-08" → "8 ago". */
function formatShortDay(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  const months = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  return `${d} ${months[m - 1] ?? ''}`.trim() || String(y);
}
