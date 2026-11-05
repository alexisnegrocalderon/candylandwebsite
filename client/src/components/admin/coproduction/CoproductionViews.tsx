import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import {
  CalendarClock, Check, Copy, Download, Eye, Gift, KeyRound, Loader2, Plus, Receipt, RefreshCw, Rocket, Search, ShieldOff,
  Ticket, Users, Wallet, X, type LucideIcon,
} from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { fromChileInputValue } from '@/pages/admin/sections/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { EmptyState } from '@/components/admin/EmptyState';
import { ImageUploadField } from '@/components/admin/ImageUploadField';
import { formatChileDate, formatChileDateTime, formatChileShortDate } from '@shared/chileDate';
import { PLAYMORE_TANDA_ROWS, PLAYMORE_SOLTERO, exactPercents, tandaRowProblem, type PlaymoreTandaRow } from '@shared/playmoreTandas';
import { timelineFromText, timelineToText, type CoproductionLanding } from '@shared/coproduction';

/* Panel de una co-producción (Playroom × Dalmore). Lo ven el dueño y el
 * socio; el servidor decide qué co-producción le toca a cada uno
 * (`partnerProcedure`), así que acá ninguna consulta manda slug. */

const clp = (n: number) => `$${Math.round(n).toLocaleString('es-CL')}`;
const onError = (e: { message: string }) => toast.error(e.message);

function useMe() {
  return trpc.coproduction.me.useQuery(undefined, { staleTime: 30_000 });
}

function NoEvent() {
  const { data: me } = useMe();
  return (
    <EmptyState
      icon={CalendarClock}
      title="Todavía no hay evento enlazado"
      description={me?.viewer === 'playroom'
        ? 'Crea el evento en Eventos (en borrador) y enlázalo en la pestaña Configuración.'
        : 'Playroom todavía está terminando de cargar el evento. Vuelve a mirar en un rato.'}
    />
  );
}

function Kpi({ icon: Icon, label, value, hint }: { icon: LucideIcon; label: string; value: string; hint?: string }) {
  return (
    <div className="admin-clay flex min-w-0 flex-col gap-3 p-4 md:p-5">
      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-[oklch(0.6_0.2_290)]">
        <Icon className="h-5 w-5 text-white" />
      </span>
      <span className="min-w-0">
        <span className="block truncate font-heading text-xl tabular-nums md:text-3xl">{value}</span>
        <span className="mt-1 block text-xs text-muted-foreground md:text-sm">{label}</span>
        {hint && <span className="mt-1 block text-[11px] text-muted-foreground">{hint}</span>}
      </span>
    </div>
  );
}

function SectionTitle({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 className="font-heading text-2xl">{title}</h2>
        {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

// ── Resumen ────────────────────────────────────────────────────────────────

export function CoproResumen() {
  const { data: me } = useMe();
  const { data, isLoading } = trpc.coproduction.overview.useQuery(undefined, { refetchInterval: 60_000 });
  if (isLoading) return <p className="text-sm text-muted-foreground">Cargando…</p>;
  if (!data?.event) return <NoEvent />;

  const capacity = me?.capacity ?? 800;
  const pct = Math.min(100, Math.round((data.personas / capacity) * 100));
  const chart = data.byDay.map((d) => ({ ...d, label: d.day.slice(8, 10) + '-' + d.day.slice(5, 7) }));

  return (
    <div className="space-y-5">
      <section className="admin-clay relative overflow-hidden p-5 md:p-7">
        <div className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-[oklch(0.65_0.25_340/0.35)] blur-3xl" aria-hidden="true" />
        <div className="relative flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Playroom × {me?.partnerName ?? 'Dalmore'}</p>
            <h2 className="mt-1 font-heading text-2xl md:text-3xl">{data.event.title}</h2>
            <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
              <CalendarClock className="h-4 w-4" /> {formatChileDate(data.event.eventDate)}
            </p>
          </div>
          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${me?.isLive ? 'bg-emerald-400/15 text-emerald-300' : 'bg-amber-400/15 text-amber-200'}`}>
            {me?.isLive ? 'A la venta' : 'Oculto · aún no se lanza'}
          </span>
        </div>
        <div className="relative mt-5">
          <div className="mb-1.5 flex justify-between text-sm">
            <span><strong className="tabular-nums">{data.personas.toLocaleString('es-CL')}</strong> de {capacity.toLocaleString('es-CL')} personas</span>
            <span className="tabular-nums text-muted-foreground">{pct}%</span>
          </div>
          <div className="h-3 overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full bg-gradient-to-r from-primary to-secondary transition-all" style={{ width: `${pct}%` }} />
          </div>
        </div>
      </section>

      <div className="grid grid-cols-2 gap-3 md:gap-4 lg:grid-cols-4">
        <Kpi icon={Wallet} label="Recaudado total" value={clp(data.revenueWeb + data.revenueCaja)} hint={`Web ${clp(data.revenueWeb)} · Caja ${clp(data.revenueCaja)}`} />
        <Kpi icon={Ticket} label="Compras aprobadas" value={data.ordersApproved.toLocaleString('es-CL')} />
        <Kpi icon={Users} label="Personas" value={data.personas.toLocaleString('es-CL')} />
        <Kpi icon={Check} label="Ya entraron" value={data.checkedIn.toLocaleString('es-CL')} />
      </div>

      <div className="grid gap-5 lg:grid-cols-5">
        <section className="admin-clay p-5 lg:col-span-3">
          <h3 className="mb-4 font-heading text-lg">Ventas por día</h3>
          {chart.length === 0 ? <EmptyState icon={Ticket} title="Todavía no hay ventas" /> : (
            <div className="h-60">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chart} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="coproSales" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="oklch(0.72 0.2 342)" stopOpacity={0.55} />
                      <stop offset="100%" stopColor="oklch(0.72 0.2 342)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.08)" />
                  <XAxis dataKey="label" tick={{ fill: 'rgba(255,255,255,0.6)', fontSize: 12 }} axisLine={false} tickLine={false} minTickGap={16} />
                  <YAxis tick={{ fill: 'rgba(255,255,255,0.6)', fontSize: 12 }} axisLine={false} tickLine={false} width={56}
                    tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))} />
                  <Tooltip contentStyle={{ background: 'rgba(30,19,42,0.96)', border: '1px solid rgba(255,255,255,0.14)', borderRadius: 12, color: 'white' }}
                    formatter={(v: number, name: string) => (name === 'revenue' ? [clp(v), 'Recaudado'] : [v, 'Compras'])} />
                  <Area type="monotone" dataKey="revenue" stroke="oklch(0.78 0.18 342)" strokeWidth={2.5} fill="url(#coproSales)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </section>
        <section className="admin-clay p-5 lg:col-span-2">
          <h3 className="mb-3 font-heading text-lg">Por tipo de acceso</h3>
          {data.ticketTypes.length === 0 ? <p className="text-sm text-muted-foreground">El evento todavía no tiene accesos cargados.</p> : (
            <ul className="divide-y divide-white/10">
              {data.ticketTypes.map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{t.name}</span>
                    <span className="text-xs text-muted-foreground">{clp(t.price)}{t.status !== 'active' ? ` · ${t.status === 'soldout' ? 'agotado' : 'oculto'}` : ''}</span>
                  </span>
                  <span className="shrink-0 text-right tabular-nums">
                    <span className="block font-semibold">{t.quantity}</span>
                    <span className="text-xs text-muted-foreground">{clp(t.revenue)}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

// ── Asistentes ─────────────────────────────────────────────────────────────

function downloadCsv(filename: string, rows: (string | number)[][]) {
  const csv = rows.map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
  const url = URL.createObjectURL(new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function CoproAsistentes() {
  const { data: me } = useMe();
  const { data, isLoading } = trpc.coproduction.attendees.useQuery(undefined, { refetchInterval: 60_000 });
  const [q, setQ] = useState('');
  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (data ?? []).filter((r) => !term || `${r.buyerName} ${r.buyerEmail} ${r.buyerPhone ?? ''} ${r.orderNumber}`.toLowerCase().includes(term));
  }, [data, q]);
  const personas = rows.filter((r) => r.paymentStatus === 'approved').reduce((s, r) => s + r.personas, 0);
  const invitedLabel = (by: string | null) => (by === 'partner' ? `Cortesía ${me?.partnerName ?? 'socio'}` : by === 'playroom' ? 'Cortesía Playroom' : '');

  return (
    <div className="space-y-4">
      <SectionTitle
        title="Asistentes"
        subtitle={`${rows.length} compras · ${personas} personas`}
        action={(
          <Button variant="outline" disabled={!rows.length} onClick={() => downloadCsv('asistentes-playroom-dalmore.csv', [
            ['Orden', 'Nombre', 'Correo', 'Teléfono', 'Accesos', 'Personas', 'Total', 'Estado', 'Entró', 'Cortesía', 'Fecha'],
            ...rows.map((r) => [r.orderNumber, r.buyerName, r.buyerEmail, r.buyerPhone ?? '', r.accesos.join(' + '), r.personas, r.total,
              r.paymentStatus === 'approved' ? 'Pagada' : 'Reembolsada', r.checkedIn ? 'Sí' : 'No', invitedLabel(r.invitedBy), formatChileDateTime(r.createdAt)]),
          ])}>
            <Download className="mr-1.5 h-4 w-4" /> Descargar CSV
          </Button>
        )}
      />
      <label className="flex h-11 items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3">
        <Search className="h-4 w-4 text-muted-foreground" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nombre, correo, teléfono u orden" className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground" />
      </label>
      {isLoading ? <p className="text-sm text-muted-foreground">Cargando…</p> : rows.length === 0 ? <EmptyState icon={Users} title={data?.length ? 'Nada coincide' : 'Todavía no hay asistentes'} /> : (
        <>
          {/* Celular: tarjetas. Desktop: tabla. Misma información en los dos. */}
          <div className="space-y-2 md:hidden">
            {rows.map((r) => (
              <div key={r.id} className="admin-clay-sm border border-white/10 bg-white/5 p-3 text-sm">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-semibold">{r.buyerName}</p>
                  <span className="shrink-0 tabular-nums">{clp(r.total)}</span>
                </div>
                <p className="text-muted-foreground">{r.accesos.join(' + ')} · {r.personas} persona{r.personas === 1 ? '' : 's'}</p>
                <p className="break-all text-xs text-muted-foreground">{r.buyerEmail}{r.buyerPhone ? ` · ${r.buyerPhone}` : ''}</p>
                <div className="mt-1.5 flex flex-wrap gap-1.5 text-[11px]">
                  {r.paymentStatus !== 'approved' && <span className="rounded-full bg-red-400/15 px-2 py-0.5 text-red-300">Reembolsada</span>}
                  {r.checkedIn && <span className="rounded-full bg-emerald-400/15 px-2 py-0.5 text-emerald-300">Entró</span>}
                  {r.invitedBy && <span className="rounded-full bg-white/10 px-2 py-0.5">{invitedLabel(r.invitedBy)}</span>}
                </div>
              </div>
            ))}
          </div>
          <div className="admin-clay hidden overflow-x-auto p-0 md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-3">Nombre</th><th className="px-4 py-3">Contacto</th><th className="px-4 py-3">Accesos</th>
                  <th className="px-4 py-3 text-right">Personas</th><th className="px-4 py-3 text-right">Total</th><th className="px-4 py-3">Estado</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-white/5 last:border-0">
                    <td className="px-4 py-3"><p className="font-medium">{r.buyerName}</p><p className="text-xs text-muted-foreground">{r.orderNumber}</p></td>
                    <td className="px-4 py-3"><p className="break-all">{r.buyerEmail}</p><p className="text-xs text-muted-foreground">{r.buyerPhone ?? '—'}</p></td>
                    <td className="px-4 py-3">{r.accesos.join(' + ')}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{r.personas}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{clp(r.total)}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1.5 text-[11px]">
                        <span className={`rounded-full px-2 py-0.5 ${r.paymentStatus === 'approved' ? 'bg-white/10' : 'bg-red-400/15 text-red-300'}`}>{r.paymentStatus === 'approved' ? 'Pagada' : 'Reembolsada'}</span>
                        {r.checkedIn && <span className="rounded-full bg-emerald-400/15 px-2 py-0.5 text-emerald-300">Entró</span>}
                        {r.invitedBy && <span className="rounded-full bg-white/10 px-2 py-0.5">{invitedLabel(r.invitedBy)}</span>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

// ── Cortesías ──────────────────────────────────────────────────────────────

export function CoproCortesias() {
  const utils = trpc.useUtils();
  const { data: me } = useMe();
  const { data: overview } = trpc.coproduction.overview.useQuery();
  const { data: attendees } = trpc.coproduction.attendees.useQuery();
  const [form, setForm] = useState({ buyerName: '', buyerEmail: '', buyerPhone: '', ticketTypeId: '', quantity: '1' });
  const create = trpc.coproduction.createInvite.useMutation({
    onSuccess: (r) => {
      toast.success(`Cortesía creada (${r.orderNumber}). La entrada le llega por correo.`);
      setForm((f) => ({ ...f, buyerName: '', buyerEmail: '', buyerPhone: '', quantity: '1' }));
      void utils.coproduction.attendees.invalidate();
      void utils.coproduction.overview.invalidate();
    },
    onError,
  });
  if (overview && !overview.event) return <NoEvent />;
  const invites = (attendees ?? []).filter((a) => a.invitedBy);
  const canSubmit = form.buyerName.trim() && /\S+@\S+\.\S+/.test(form.buyerEmail) && form.ticketTypeId && !create.isPending;

  return (
    <div className="space-y-5">
      <SectionTitle title="Cortesías" subtitle="Invitaciones sin costo: cuentan para el aforo y la entrada con QR le llega por correo a la persona." />
      <section className="admin-clay space-y-4 p-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <div><Label>Nombre</Label><Input className="mt-1" value={form.buyerName} onChange={(e) => setForm({ ...form, buyerName: e.target.value })} /></div>
          <div><Label>Correo</Label><Input className="mt-1" type="email" value={form.buyerEmail} onChange={(e) => setForm({ ...form, buyerEmail: e.target.value })} /></div>
          <div><Label>Teléfono (opcional)</Label><Input className="mt-1" value={form.buyerPhone} onChange={(e) => setForm({ ...form, buyerPhone: e.target.value })} /></div>
          <div className="grid grid-cols-[1fr_88px] gap-2">
            <div>
              <Label>Acceso</Label>
              <Select value={form.ticketTypeId} onValueChange={(v) => setForm({ ...form, ticketTypeId: v })}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Elige" /></SelectTrigger>
                <SelectContent>
                  {(overview?.ticketTypes ?? []).map((t) => <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div><Label>Cantidad</Label><Input className="mt-1" type="number" min={1} max={20} value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} /></div>
          </div>
        </div>
        <Button disabled={!canSubmit} onClick={() => create.mutate({
          buyerName: form.buyerName, buyerEmail: form.buyerEmail, buyerPhone: form.buyerPhone || undefined,
          ticketTypeId: Number(form.ticketTypeId), quantity: Math.max(1, Math.min(20, Number(form.quantity) || 1)),
        })}>
          {create.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Gift className="mr-1.5 h-4 w-4" />} Crear cortesía
        </Button>
      </section>

      <section className="space-y-2">
        <h3 className="font-heading text-lg">Cortesías creadas ({invites.length})</h3>
        {invites.length === 0 ? <p className="text-sm text-muted-foreground">Todavía no hay cortesías.</p> : invites.map((r) => (
          <div key={r.id} className="admin-clay-sm flex flex-wrap items-center justify-between gap-2 border border-white/10 bg-white/5 p-3 text-sm">
            <div className="min-w-0">
              <p className="font-medium">{r.buyerName} <span className="text-muted-foreground">· {r.accesos.join(' + ')} · {r.personas} pers.</span></p>
              <p className="break-all text-xs text-muted-foreground">{r.buyerEmail} · {formatChileDateTime(r.createdAt)}</p>
            </div>
            <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-xs">{r.invitedBy === 'partner' ? me?.partnerName ?? 'Socio' : 'Playroom'}</span>
          </div>
        ))}
      </section>
    </div>
  );
}

// ── Gastos ─────────────────────────────────────────────────────────────────

const CATEGORY_LABEL: Record<string, string> = {
  arriendo: 'Arriendo', barra: 'Barra', staff: 'Staff', produccion: 'Producción (DJ, sonido, luces)', decoracion: 'Decoración',
  marketing: 'Marketing', transporte: 'Transporte', otros: 'Otros', merch: 'Merch', suscripciones: 'Suscripciones', comisiones: 'Comisiones',
};
const DOC_LABEL: Record<string, string> = { boleta: 'Boleta', factura: 'Factura', boleta_honorarios: 'Boleta de honorarios', sin_documento: 'Sin documento' };
const STATUS_STYLE: Record<string, [string, string]> = {
  approved: ['Aprobado', 'bg-emerald-400/15 text-emerald-300'],
  pending: ['Por aprobar', 'bg-amber-400/15 text-amber-200'],
  rejected: ['Rechazado', 'bg-red-400/15 text-red-300'],
};

export function CoproGastos() {
  const utils = trpc.useUtils();
  const { data: me } = useMe();
  const { data, isLoading } = trpc.coproduction.expenses.useQuery();
  const isOwner = me?.viewer === 'playroom';
  const today = new Date().toISOString().slice(0, 10);
  const empty = { category: 'produccion', description: '', supplier: '', documentType: 'boleta', amountTotal: '', expenseDate: today, receiptUrl: '' };
  const [form, setForm] = useState(empty);
  const [rejecting, setRejecting] = useState<{ id: number; reason: string } | null>(null);
  const refresh = () => { void utils.coproduction.expenses.invalidate(); void utils.coproduction.split.invalidate(); };

  const create = trpc.coproduction.createExpense.useMutation({
    onSuccess: () => { toast.success(isOwner ? 'Gasto agregado' : 'Gasto enviado: queda por aprobar'); setForm(empty); refresh(); },
    onError,
  });
  const approve = trpc.coproduction.approveExpense.useMutation({ onSuccess: () => { toast.success('Gasto aprobado'); refresh(); }, onError });
  const reject = trpc.coproduction.rejectExpense.useMutation({ onSuccess: () => { toast.success('Gasto rechazado'); setRejecting(null); refresh(); }, onError });

  const amount = Number(form.amountTotal.replace(/\D/g, ''));
  const canSubmit = form.description.trim() && amount > 0 && !create.isPending;
  const rows = data ?? [];
  const total = rows.filter((r) => r.status === 'approved').reduce((s, r) => s + r.amountTotal, 0);

  return (
    <div className="space-y-5">
      <SectionTitle
        title="Gastos del evento"
        subtitle={isOwner
          ? 'Lo que cargas acá entra directo. Lo que carga el socio queda por aprobar y no cuenta en el reparto hasta que lo apruebes.'
          : 'Carga tus gastos con la foto de la boleta. Quedan por aprobar y entran al reparto cuando Playroom los apruebe.'}
      />
      <section className="admin-clay space-y-4 p-5">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div className="sm:col-span-2 lg:col-span-1"><Label>Descripción</Label><Input className="mt-1" placeholder="Ej: DJ invitado" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
          <div>
            <Label>Categoría</Label>
            <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>{['arriendo', 'barra', 'staff', 'produccion', 'decoracion', 'marketing', 'transporte', 'otros'].map((c) => <SelectItem key={c} value={c}>{CATEGORY_LABEL[c]}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label>Monto total (IVA incluido)</Label><Input className="mt-1" inputMode="numeric" placeholder="$" value={form.amountTotal ? Number(form.amountTotal.replace(/\D/g, '')).toLocaleString('es-CL') : ''} onChange={(e) => setForm({ ...form, amountTotal: e.target.value.replace(/\D/g, '') })} /></div>
          <div><Label>Proveedor (opcional)</Label><Input className="mt-1" value={form.supplier} onChange={(e) => setForm({ ...form, supplier: e.target.value })} /></div>
          <div>
            <Label>Documento</Label>
            <Select value={form.documentType} onValueChange={(v) => setForm({ ...form, documentType: v })}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>{Object.entries(DOC_LABEL).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label>Fecha</Label><Input className="mt-1" type="date" value={form.expenseDate} onChange={(e) => setForm({ ...form, expenseDate: e.target.value })} /></div>
        </div>
        <div>
          <Label>Foto de la boleta (opcional)</Label>
          <div className="mt-1">
            <ImageUploadField value={form.receiptUrl} onChange={(url) => setForm({ ...form, receiptUrl: url })} pathPrefix="coproduction/receipts" uploadUrl="/api/partner/blob/upload" />
          </div>
        </div>
        <Button disabled={!canSubmit} onClick={() => create.mutate({
          category: form.category as any, description: form.description, supplier: form.supplier || undefined, documentType: form.documentType as any,
          amountTotal: amount, expenseDate: new Date(`${form.expenseDate}T12:00:00`), receiptUrl: form.receiptUrl || undefined,
        })}>
          {create.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Plus className="mr-1.5 h-4 w-4" />} {isOwner ? 'Agregar gasto' : 'Enviar gasto'}
        </Button>
      </section>

      <section className="space-y-2">
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="font-heading text-lg">Gastos ({rows.length})</h3>
          <span className="text-sm text-muted-foreground">Aprobados: <strong className="tabular-nums text-foreground">{clp(total)}</strong></span>
        </div>
        {isLoading ? <p className="text-sm text-muted-foreground">Cargando…</p> : rows.length === 0 ? <EmptyState icon={Receipt} title="Todavía no hay gastos" /> : rows.map((r) => {
          const [statusLabel, statusCls] = STATUS_STYLE[r.status] ?? STATUS_STYLE.pending;
          return (
            <div key={r.key} className="admin-clay-sm border border-white/10 bg-white/5 p-3 text-sm">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium">{r.description}</p>
                  <p className="text-xs text-muted-foreground">
                    {CATEGORY_LABEL[r.category] ?? r.category}{r.supplier ? ` · ${r.supplier}` : ''} · {formatChileShortDate(r.expenseDate)} · cargado por {r.submittedBy === 'partner' ? me?.partnerName ?? 'socio' : 'Playroom'}
                  </p>
                  {r.rejectReason && <p className="mt-1 text-xs text-red-300">Motivo: {r.rejectReason}</p>}
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold tabular-nums">{clp(r.amountTotal)}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] ${statusCls}`}>{statusLabel}</span>
                </div>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {r.receiptUrl && <a href={r.receiptUrl} target="_blank" rel="noreferrer" className="text-xs underline">Ver boleta</a>}
                {isOwner && r.status === 'pending' && r.coproductionExpenseId != null && (
                  <>
                    <Button size="sm" disabled={approve.isPending} onClick={() => approve.mutate({ slug: me!.slug, id: r.coproductionExpenseId! })}><Check className="mr-1 h-4 w-4" /> Aprobar</Button>
                    <Button size="sm" variant="outline" onClick={() => setRejecting({ id: r.coproductionExpenseId!, reason: '' })}><X className="mr-1 h-4 w-4" /> Rechazar</Button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </section>

      <Dialog open={rejecting !== null} onOpenChange={(o) => { if (!o) setRejecting(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Rechazar gasto</DialogTitle></DialogHeader>
          <Label>Motivo (lo ve el socio)</Label>
          <Textarea rows={3} value={rejecting?.reason ?? ''} onChange={(e) => setRejecting((r) => (r ? { ...r, reason: e.target.value } : r))} />
          <Button variant="destructive" disabled={reject.isPending} onClick={() => rejecting && me && reject.mutate({ slug: me.slug, id: rejecting.id, reason: rejecting.reason })}>Rechazar</Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Reparto ────────────────────────────────────────────────────────────────

export function CoproReparto() {
  const { data, isLoading } = trpc.coproduction.split.useQuery(undefined, { refetchInterval: 60_000 });
  if (isLoading) return <p className="text-sm text-muted-foreground">Cargando…</p>;
  if (!data) return <NoEvent />;
  const { pnl, split, partnerName } = data;
  const lines: [string, number][] = [
    ['Ingresos brutos (entradas, caja, extras)', pnl.grossIncome],
    ['IVA (débito fiscal)', -(pnl.grossIncome - pnl.netIncome)],
    ['Gastos del evento', -pnl.directExpensesTotal],
    ['Staff', -pnl.staffCostsTotal],
    ['Costo de productos vendidos', -pnl.cogs],
    ['Comisión de tarjeta (Mercado Pago)', -pnl.cardFeeAmount],
    ['Comisiones de embajadores', -pnl.ambassadorCommissions],
    ['Parte del local (estacionamiento)', -pnl.extraCostsTotal],
  ];

  return (
    <div className="space-y-5">
      <SectionTitle title="Reparto" subtitle={`Utilidad del evento repartida ${100 - split.partnerPercent}/${split.partnerPercent} (Playroom/${partnerName}). No incluye gastos generales de ninguna de las dos productoras.`} />
      <div className="grid gap-3 sm:grid-cols-3">
        <Kpi icon={Wallet} label="Utilidad del evento" value={clp(split.netProfit)} />
        <Kpi icon={Users} label={`Le toca a ${partnerName} (${split.partnerPercent}%)`} value={clp(split.partnerShare)} />
        <Kpi icon={Users} label={`Le toca a Playroom (${100 - split.partnerPercent}%)`} value={clp(split.playroomShare)} />
      </div>
      {data.pendingExpenses > 0 && (
        <p className="rounded-2xl border border-amber-300/30 bg-amber-400/10 p-3 text-sm text-amber-100">
          Hay {data.pendingExpenses} gasto{data.pendingExpenses === 1 ? '' : 's'} por aprobar ({clp(data.pendingAmount)}) que todavía no cuenta{data.pendingExpenses === 1 ? '' : 'n'} en este cálculo.
        </p>
      )}
      <section className="admin-clay p-5">
        <h3 className="mb-3 font-heading text-lg">Detalle</h3>
        <ul className="divide-y divide-white/10 text-sm">
          {lines.filter(([, v], i) => i === 0 || v !== 0).map(([label, v]) => (
            <li key={label} className="flex justify-between gap-3 py-2.5">
              <span className="text-muted-foreground">{label}</span>
              <span className={`tabular-nums ${v < 0 ? 'text-red-300' : ''}`}>{v < 0 ? `−${clp(-v)}` : clp(v)}</span>
            </li>
          ))}
          <li className="flex justify-between gap-3 py-3 font-semibold">
            <span>Utilidad</span><span className="tabular-nums">{clp(pnl.netProfit)}</span>
          </li>
        </ul>
        {pnl.directByCategory.length > 0 && (
          <>
            <h4 className="mb-2 mt-4 text-sm font-semibold">Gastos por categoría</h4>
            <ul className="space-y-1 text-sm">
              {pnl.directByCategory.map((c) => (
                <li key={c.category} className="flex justify-between gap-3"><span className="text-muted-foreground">{CATEGORY_LABEL[c.category] ?? c.category}</span><span className="tabular-nums">{clp(c.amount)}</span></li>
              ))}
            </ul>
          </>
        )}
      </section>
    </div>
  );
}

// ── Configuración (solo el dueño) ──────────────────────────────────────────

const lines = (v: string) => v.split('\n').map((l) => l.trim()).filter(Boolean);

/** ISO con zona → valor de <input type="datetime-local"> en hora de Chile. */
function toLocalInput(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Santiago', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '00';
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour') === '24' ? '00' : get('hour')}:${get('minute')}`;
}

/** Las 3 tandas de PLAYMORE: precio exacto por acceso, con el % de descuento exacto de cada tanda. */
function PlaymoreTandas({ slug }: { slug: string }) {
  const utils = trpc.useUtils();
  const [rows, setRows] = useState<PlaymoreTandaRow[]>(PLAYMORE_TANDA_ROWS);
  const [solteroPrice, setSolteroPrice] = useState(PLAYMORE_SOLTERO.price);
  const [solteroStock, setSolteroStock] = useState(PLAYMORE_SOLTERO.stock);
  // Fin de cada tanda (hora de Chile): 1ª hasta el dom 8-nov, 2ª hasta el 22-nov y la 3ª (general) hasta el sáb 5-dic 06:00.
  const [until, setUntil] = useState<string[]>(['2026-11-08T23:59', '2026-11-22T23:59', '2026-12-05T06:00']);
  const apply = trpc.coproduction.applyTandas.useMutation({
    onSuccess: (r) => {
      toast.success(`Tandas aplicadas${r.missing.length ? ` (sin entrada para: ${r.missing.join(', ')})` : ''}`);
      void utils.events.invalidate(); void utils.tickets.invalidate();
    },
    onError,
  });
  const set = (i: number, k: 'general' | 't1' | 't2', v: string) => setRows(rows.map((r, j) => (j === i ? { ...r, [k]: Math.round(Number(v) || 0) } : r)));
  const problem = rows.map(tandaRowProblem).find(Boolean) ?? null;
  const run = (force: boolean) => apply.mutate({
    slug, rows, force, solteroPrice, solteroStock,
    until: until.map((u) => (u ? fromChileInputValue(u) : null)),
  }, { onError: (e) => { if (!force && /Confirma para forzarlo/.test(e.message) && confirm(`${e.message}\n\n¿Aplicar igual?`)) run(true); } });
  return (
    <section className="admin-clay space-y-3 p-5">
      <p className="font-semibold">Tandas de PLAYMORE</p>
      <p className="text-sm text-muted-foreground">Precio exacto de cada acceso en cada tanda; el % de descuento se calcula solo contra el precio general. Al aplicar queda vigente la 1ª tanda.</p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="text-left text-xs text-muted-foreground"><th className="py-1">Acceso</th><th>1ª tanda</th><th>2ª tanda</th><th>General</th><th>% 1ª</th><th>% 2ª</th></tr></thead>
          <tbody>
            {rows.map((r, i) => { const p = tandaRowProblem(r) ? null : exactPercents(r); return (
              <tr key={r.slug} className="border-t border-white/10">
                <td className="py-1.5 pr-2">{r.label}</td>
                {(['t1', 't2', 'general'] as const).map((k) => <td key={k} className="pr-2"><Input className="h-8 w-28" type="number" value={r[k]} onChange={(e) => set(i, k, e.target.value)} /></td>)}
                <td className="pr-2 tabular-nums">{p ? `${p.t1}%` : '—'}</td><td className="tabular-nums">{p ? `${p.t2}%` : '—'}</td>
              </tr>
            ); })}
            <tr className="border-t border-white/10">
              <td className="py-1.5 pr-2">{PLAYMORE_SOLTERO.label} <span className="text-xs text-muted-foreground">(sin tandas)</span></td>
              <td className="pr-2"><Input className="h-8 w-28" type="number" value={solteroPrice} onChange={(e) => setSolteroPrice(Math.round(Number(e.target.value) || 0))} /></td>
              <td colSpan={2} className="pr-2 text-xs text-muted-foreground">cupos: <Input className="ml-1 inline-block h-8 w-20" type="number" value={solteroStock} onChange={(e) => setSolteroStock(Math.round(Number(e.target.value) || 0))} /></td>
              <td colSpan={2} className="text-xs text-muted-foreground">precio único</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {['1ª tanda (precios de lanzamiento)', '2ª tanda', '3ª tanda (general, hasta el cierre)'].map((l, i) => (
          <div key={l}><Label>{l} termina</Label><Input className="mt-1" type="datetime-local" value={until[i] ?? ''} onChange={(e) => setUntil(until.map((u, j) => (j === i ? e.target.value : u)))} /></div>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">Sin fecha, la tanda avanza al cerrarla a mano (“Cerrar tanda” en Eventos) o al agotarse su cupo.</p>
      {problem && <p className="text-xs text-red-400">{problem}</p>}
      <Button disabled={!!problem || apply.isPending} onClick={() => run(false)}>{apply.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Check className="mr-1.5 h-4 w-4" />} Aplicar tandas al evento</Button>
    </section>
  );
}

export function CoproConfig() {
  const utils = trpc.useUtils();
  const slug = 'dalmore';
  const { data: setup, isLoading } = trpc.coproduction.setupGet.useQuery({ slug });
  const { data: events } = trpc.events.listAll.useQuery();
  const [draft, setDraft] = useState<null | { eventId: string; partnerName: string; split: string; landing: CoproductionLanding }>(null);
  const [newPassword, setNewPassword] = useState<string | null>(null);
  const [askPassword, setAskPassword] = useState(false);
  const [adminPassword, setAdminPassword] = useState('');
  const refresh = () => { void utils.coproduction.invalidate(); };

  const save = trpc.coproduction.setupUpdate.useMutation({ onSuccess: () => { toast.success('Guardado'); setDraft(null); refresh(); }, onError });
  const reset = trpc.coproduction.resetPartnerPassword.useMutation({
    onSuccess: (r) => { setNewPassword(r.password); setAskPassword(false); setAdminPassword(''); refresh(); },
    onError,
  });
  const revoke = trpc.coproduction.revokePartnerAccess.useMutation({ onSuccess: () => { toast.success('Acceso revocado'); refresh(); }, onError });
  const rotate = trpc.coproduction.rotatePreviewToken.useMutation({ onSuccess: () => { toast.success('Link de vista previa renovado'); refresh(); }, onError });
  const setLive = trpc.coproduction.setLive.useMutation({ onSuccess: (_, v) => { toast.success(v.live ? '¡Evento activado!' : 'Evento oculto de nuevo'); refresh(); void utils.events.invalidate(); }, onError });

  if (isLoading) return <p className="text-sm text-muted-foreground">Cargando…</p>;
  if (!setup) {
    return <EmptyState icon={ShieldOff} title="Falta aplicar la migración" description="Corre drizzle/0108_coproductions.sql en la base de datos y vuelve a abrir esta pestaña." />;
  }

  const d = draft ?? { eventId: setup.eventId ? String(setup.eventId) : '', partnerName: setup.partnerName, split: String(setup.splitPercentPartner), landing: setup.landing };
  const edit = (patch: Partial<typeof d>) => setDraft({ ...d, ...patch });
  const editLanding = (patch: Partial<CoproductionLanding>) => edit({ landing: { ...d.landing, ...patch } });
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const previewUrl = `https://dalmore.mansionplayroom.cl/?preview=${setup.previewToken}`;
  // La app (portada, Eventos y Mi cuenta) con la tarjeta PLAYMORE, antes de activar. `app=1` la muestra también en computador.
  const appPreviewUrl = `https://mansionplayroom.cl/?app=1&playmore=${setup.previewToken}`;
  const copy = (text: string) => navigator.clipboard?.writeText(text).then(() => toast.success('Copiado'), () => toast.error('No se pudo copiar'));

  return (
    <div className="space-y-5">
      <SectionTitle title="Configuración" subtitle="Evento, reparto, landing, acceso de Dalmore y lanzamiento." />

      {/* Lanzamiento */}
      <section className="admin-clay flex flex-wrap items-center justify-between gap-4 p-5">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-[oklch(0.6_0.2_290)]"><Rocket className="h-5 w-5 text-white" /></span>
          <div>
            <p className="font-semibold">{setup.isLive ? 'Evento activo: a la venta y en tu home' : 'Evento oculto'}</p>
            <p className="text-sm text-muted-foreground">{setup.isLive ? 'dalmore.mansionplayroom.cl muestra todo y se puede comprar.' : 'dalmore.mansionplayroom.cl muestra "Próximamente" y nadie puede comprar.'}</p>
          </div>
        </div>
        <Switch checked={setup.isLive} disabled={setLive.isPending} onCheckedChange={(live) => {
          const sending = !setup.landing?.launchedAt && (d.landing.launchMailing || d.landing.launchPush);
          const noReel = d.landing.launchMailing && !d.landing.reelUrl;
          if (live && !confirm(`¿Activar el evento? La página y la venta quedan abiertas al público y aparece destacado en tu home.${sending ? `\n\nAdemás sale el lanzamiento: ${[d.landing.launchMailing && 'mailing a toda la base', d.landing.launchPush && 'notificación a la app'].filter(Boolean).join(' y ')}.` : ''}${sending && noReel ? '\n\n⚠️ Todavía no cargaste el link del reel de Instagram: el correo saldrá sin ese botón.' : ''}`)) return;
          setLive.mutate({ slug, live });
        }} />
        <div className="w-full space-y-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <p className="text-sm font-semibold">Lanzamiento al activar <span className="font-normal text-muted-foreground">· sale una sola vez, la primera vez que activas</span></p>
          {setup.landing?.launchedAt && (
            <p className="rounded-xl bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200">Ya salió el {new Date(setup.landing.launchedAt).toLocaleString('es-CL', { timeZone: 'America/Santiago', dateStyle: 'medium', timeStyle: 'short' })}. El avance del mailing se ve en Mensajes → Mailing y el de la notificación en Notificaciones push.</p>
          )}
          <div className="flex items-start gap-3">
            <Switch checked={d.landing.launchMailing} disabled={!!setup.landing?.launchedAt} onCheckedChange={(v) => editLanding({ launchMailing: v })} />
            <div>
              <p className="text-sm font-semibold">Mailing a toda la base</p>
              <p className="mt-0.5 text-xs text-muted-foreground">Correo PLAYMORE (negro y dorado) a clientes y leads que todavía no tienen entrada. Ese día el tope de envío sube para que llegue a todos en unas horas.</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <Switch checked={d.landing.launchPush} disabled={!!setup.landing?.launchedAt} onCheckedChange={(v) => editLanding({ launchPush: v })} />
            <div>
              <p className="text-sm font-semibold">Notificación a la app</p>
              <p className="mt-0.5 text-xs text-muted-foreground">Sale junto con el mailing a quienes tienen la app y avisos activados. Respeta los topes y horarios de silencio de Notificaciones push.</p>
            </div>
          </div>
          <div>
            <Label>Link del primer reel de Instagram (colab con Dalmore)</Label>
            <Input className="mt-1" placeholder="https://www.instagram.com/reel/…" value={d.landing.reelUrl} disabled={!!setup.landing?.launchedAt} onChange={(e) => editLanding({ reelUrl: e.target.value.trim() })} />
            <p className="mt-1 text-xs text-muted-foreground">Súbelo a Instagram antes de activar y pega aquí el link: el correo lo lleva como botón “Míralo en Instagram”. Si lo dejas vacío, el correo sale sin ese botón. Recuerda guardar.</p>
          </div>
        </div>
      </section>

      {setup.eventId && <PlaymoreTandas slug={slug} />}

      {/* Vista previa */}
      <section className="admin-clay space-y-3 p-5">
        <p className="flex items-center gap-2 font-semibold"><Eye className="h-4 w-4" /> Vista previa de la landing</p>
        <p className="text-sm text-muted-foreground">Este link muestra la página completa aunque no esté activa. Compártelo solo con el equipo.</p>
        <div className="flex flex-wrap gap-2">
          <code className="min-w-0 flex-1 truncate rounded-xl bg-black/30 px-3 py-2 text-xs">{previewUrl}</code>
          <Button variant="outline" size="sm" onClick={() => copy(previewUrl)}><Copy className="mr-1 h-4 w-4" /> Copiar</Button>
          <Button variant="outline" size="sm" asChild><a href={previewUrl} target="_blank" rel="noreferrer">Abrir</a></Button>
          <Button variant="ghost" size="sm" disabled={rotate.isPending} onClick={() => { if (confirm('El link anterior deja de funcionar. ¿Seguir?')) rotate.mutate({ slug }); }}><RefreshCw className="mr-1 h-4 w-4" /> Renovar</Button>
        </div>
        <div className="space-y-2 border-t border-white/10 pt-3">
          <p className="text-sm font-semibold">Vista previa en la app</p>
          <p className="text-sm text-muted-foreground">Así se verá PLAYMORE dentro de la app (portada, Eventos y Mi cuenta) apenas actives el evento: la tarjeta negra y dorada, y la compra con el checkout PLAYMORE. Ábrelo en tu celular o en el computador; el pago es simulado y no cobra.</p>
          <div className="flex flex-wrap gap-2">
            <code className="min-w-0 flex-1 truncate rounded-xl bg-black/30 px-3 py-2 text-xs">{appPreviewUrl}</code>
            <Button variant="outline" size="sm" onClick={() => copy(appPreviewUrl)}><Copy className="mr-1 h-4 w-4" /> Copiar</Button>
            <Button variant="outline" size="sm" asChild><a href={appPreviewUrl} target="_blank" rel="noreferrer">Abrir</a></Button>
          </div>
        </div>
      </section>

      {/* Acceso de Dalmore */}
      <section className="admin-clay space-y-3 p-5">
        <p className="flex items-center gap-2 font-semibold"><KeyRound className="h-4 w-4" /> Acceso de {setup.partnerName} al panel</p>
        <p className="text-sm text-muted-foreground">
          {setup.hasPassword
            ? `Tiene clave${setup.partnerTotpConfigured ? ' y segundo factor configurado' : '; configura su segundo factor al primer ingreso'}. Entra en ${origin}/admin y solo ve esta co-producción.`
            : 'Todavía no tiene acceso. Genera una clave y pásasela por un canal privado.'}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => setAskPassword(true)}><KeyRound className="mr-1.5 h-4 w-4" /> {setup.hasPassword ? 'Generar clave nueva' : 'Generar clave'}</Button>
          {setup.hasPassword && (
            <Button variant="outline" disabled={revoke.isPending} onClick={() => { if (confirm(`¿Quitarle el acceso a ${setup.partnerName}? Se cierra su sesión de inmediato.`)) revoke.mutate({ slug }); }}>
              <ShieldOff className="mr-1.5 h-4 w-4" /> Revocar acceso
            </Button>
          )}
        </div>
      </section>

      {/* Evento y reparto */}
      <section className="admin-clay space-y-4 p-5">
        <p className="font-semibold">Evento y reparto</p>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="sm:col-span-2">
            <Label>Evento enlazado</Label>
            <Select value={d.eventId} onValueChange={(v) => edit({ eventId: v })}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="Elige el evento (créalo en Eventos)" /></SelectTrigger>
              <SelectContent>
                {(events ?? []).map((e: any) => <SelectItem key={e.id} value={String(e.id)}>{e.title} · {formatChileShortDate(e.eventDate)} · {e.status}</SelectItem>)}
              </SelectContent>
            </Select>
            <p className="mt-1 text-xs text-muted-foreground">Créalo en Eventos como borrador. Mientras esté oculto, nadie lo ve ni lo compra por link directo.</p>
          </div>
          <div>
            <Label>% de la utilidad para {d.partnerName}</Label>
            <Input className="mt-1" type="number" min={0} max={100} value={d.split} onChange={(e) => edit({ split: e.target.value })} />
          </div>
          <div><Label>Nombre del socio</Label><Input className="mt-1" value={d.partnerName} onChange={(e) => edit({ partnerName: e.target.value })} /></div>
          <div><Label>Aforo (personas)</Label><Input className="mt-1" type="number" min={1} value={d.landing.capacity} onChange={(e) => editLanding({ capacity: Number(e.target.value) || 0 })} /></div>
        </div>
      </section>

      {/* Landing */}
      <section className="admin-clay space-y-4 p-5">
        <p className="font-semibold">Landing dalmore.mansionplayroom.cl</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div><Label>Nombre de la noche (ticket y portada)</Label><Input className="mt-1" value={d.landing.eventName} onChange={(e) => editLanding({ eventName: e.target.value })} /></div>
          <div><Label>Título de la pestaña del navegador</Label><Input className="mt-1" value={d.landing.title} onChange={(e) => editLanding({ title: e.target.value })} /></div>
          <p className="sm:col-span-2 rounded-xl border border-border/60 bg-muted/30 p-3 text-sm text-muted-foreground">
            📅 La <strong>fecha, la hora, la cuenta regresiva y el lugar</strong> se toman solos del evento (Eventos → fecha y casilla “venue”). Si el venue está vacío se muestra “Nuevo spot especial!”.
          </p>
          <div><Label>Característica de la fusión (reemplaza el aforo)</Label><Input className="mt-1" value={d.landing.fusionText} onChange={(e) => editLanding({ fusionText: e.target.value })} /></div>
          <div className="sm:col-span-2"><Label>Frase principal</Label><Input className="mt-1" value={d.landing.headline} onChange={(e) => editLanding({ headline: e.target.value })} /></div>
          <div className="sm:col-span-2"><Label>Bajada</Label><Textarea className="mt-1" rows={2} value={d.landing.subheadline} onChange={(e) => editLanding({ subheadline: e.target.value })} /></div>
          <div>
            <Label>Imagen principal</Label>
            <div className="mt-1 space-y-2">
              <ImageUploadField value={d.landing.heroImageUrl} onChange={(url) => editLanding({ heroImageUrl: url })} pathPrefix="coproduction/landing" />
              <Input value={d.landing.heroImageUrl} placeholder="https://…" onChange={(e) => editLanding({ heroImageUrl: e.target.value })} />
            </div>
          </div>
          <div className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:col-span-2">
            <Switch checked={d.landing.usesPlaycard} onCheckedChange={(v) => editLanding({ usesPlaycard: v })} />
            <div>
              <p className="text-sm font-semibold">Usar el sistema PlayCard de Playroom en este evento</p>
              <p className="mt-1 text-xs text-muted-foreground">Apagado (lo normal en una colaboración): la PlayCard solo sirve de QR de ingreso y datos del titular. El saldo y los Playcoins se siguen viendo, pero no se pueden usar en este evento: la caja rechaza cobros a la PlayCard, la app no ofrece pagar ni recargar y por la web solo se venden entradas y estacionamiento. Prendido: funciona como en los eventos de Playroom. Solo afecta a este evento de colaboración. Recuerda guardar.</p>
            </div>
          </div>
          <div className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:col-span-2">
            <Switch checked={d.landing.showTicketsEarly} onCheckedChange={(v) => editLanding({ showTicketsEarly: v })} />
            <div>
              <p className="text-sm font-semibold">Mostrar la página completa con los tickets (sin habilitar la compra)</p>
              <p className="mt-1 text-xs text-muted-foreground">Para ver los accesos sin lanzar. Cualquiera que abra la dirección verá los tickets y cómo se compra, pero el pago sigue cerrado hasta "Activar evento". Mientras nadie conozca la dirección no hay problema. Recuerda guardar.</p>
            </div>
          </div>
          <div className="sm:col-span-2">
            <Label>Video de fondo de la portada (mp4, opcional)</Label>
            <Input className="mt-1" value={d.landing.heroVideoUrl} placeholder="https://…/video.mp4" onChange={(e) => editLanding({ heroVideoUrl: e.target.value })} />
            <p className="mt-1 text-xs text-muted-foreground">Sin video se muestra un terciopelo animado. Ideal: 10-20 s en loop, menos de 8 MB.</p>
          </div>
          <div>
            <Label>Logo de {d.partnerName}</Label>
            <div className="mt-1 space-y-2">
              <ImageUploadField value={d.landing.partnerLogoUrl} onChange={(url) => editLanding({ partnerLogoUrl: url })} pathPrefix="coproduction/landing" />
              <Input value={d.landing.partnerLogoUrl} placeholder="https://…" onChange={(e) => editLanding({ partnerLogoUrl: e.target.value })} />
            </div>
            <p className="mt-1 text-xs text-muted-foreground">Sube un <b>PNG o WebP con fondo transparente</b>. Un JPG trae su propio fondo (cielo, negro, blanco) y se ve mal sobre la página, así que se ignora y se usa el logo transparente que ya viene incluido.</p>
          </div>
          <div className="sm:col-span-2">
            <Label>Galería (fotos del salón / fiestas anteriores)</Label>
            <div className="mt-1 flex flex-wrap gap-2">
              {d.landing.galleryUrls.map((u) => (
                <span key={u} className="relative">
                  <img src={u} alt="" className="h-20 w-20 rounded-xl object-cover" />
                  <button type="button" aria-label="Quitar foto" onClick={() => editLanding({ galleryUrls: d.landing.galleryUrls.filter((x) => x !== u) })}
                    className="absolute -right-1.5 -top-1.5 rounded-full bg-black/80 p-1"><X className="h-3 w-3" /></button>
                </span>
              ))}
            </div>
            <div className="mt-2"><ImageUploadField value="" onChange={(url) => editLanding({ galleryUrls: [...d.landing.galleryUrls, url] })} pathPrefix="coproduction/landing" /></div>
          </div>
          <div className="sm:col-span-2"><Label>Dos mundos · texto de Playroom</Label><Textarea className="mt-1" rows={3} value={d.landing.playroomBlurb} onChange={(e) => editLanding({ playroomBlurb: e.target.value })} /></div>
          <div className="sm:col-span-2"><Label>Dos mundos · texto de {d.partnerName}</Label><Textarea className="mt-1" rows={3} value={d.landing.partnerBlurb} onChange={(e) => editLanding({ partnerBlurb: e.target.value })} /></div>
          <div className="sm:col-span-2"><Label>Dress code</Label><Textarea className="mt-1" rows={2} value={d.landing.dressCode} onChange={(e) => editLanding({ dressCode: e.target.value })} /></div>
          <div className="sm:col-span-2"><Label>Lo que vas a vivir (una idea por línea)</Label><Textarea className="mt-1" rows={4} value={d.landing.highlights.join('\n')} onChange={(e) => editLanding({ highlights: lines(e.target.value) })} /></div>
          <div className="sm:col-span-2">
            <Label>La noche minuto a minuto (una línea por momento: 23:00 | Título | Texto)</Label>
            <Textarea className="mt-1 font-mono text-xs" rows={6} defaultValue={timelineToText(d.landing.timeline)}
              onBlur={(e) => editLanding({ timeline: timelineFromText(e.target.value) })} />
            <p className="mt-1 text-xs text-muted-foreground">Se guarda al salir del cuadro. Vacío = la sección no se muestra.</p>
          </div>
          <div className="sm:col-span-2"><Label>Reglas (una por línea)</Label><Textarea className="mt-1" rows={4} value={d.landing.rules.join('\n')} onChange={(e) => editLanding({ rules: lines(e.target.value) })} /></div>
          <div className="sm:col-span-2">
            <Label>Preguntas frecuentes (una por línea: Pregunta | Respuesta)</Label>
            <Textarea className="mt-1" rows={4} value={d.landing.faq.map((f) => `${f.q} | ${f.a}`).join('\n')}
              onChange={(e) => editLanding({ faq: lines(e.target.value).map((l) => { const [q, ...a] = l.split('|'); return { q: q.trim(), a: a.join('|').trim() }; }) })} />
          </div>
        </div>
      </section>

      <div className="sticky bottom-24 z-10 flex gap-2 md:bottom-4">
        <Button disabled={!draft || save.isPending} onClick={() => save.mutate({
          slug, eventId: d.eventId ? Number(d.eventId) : null, partnerName: d.partnerName,
          splitPercentPartner: Math.max(0, Math.min(100, Number(d.split) || 0)), landing: d.landing as any,
        })}>
          {save.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Check className="mr-1.5 h-4 w-4" />} Guardar cambios
        </Button>
        {draft && <Button variant="outline" onClick={() => setDraft(null)}>Descartar</Button>}
      </div>

      <Dialog open={askPassword} onOpenChange={(o) => { setAskPassword(o); if (!o) setAdminPassword(''); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Generar clave para {setup.partnerName}</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Si ya tenía una, deja de servir y se cierra su sesión. Confirma con tu clave de admin.</p>
          <Input type="password" placeholder="Tu clave de admin" value={adminPassword} onChange={(e) => setAdminPassword(e.target.value)} />
          <Button disabled={!adminPassword || reset.isPending} onClick={() => reset.mutate({ slug, adminPassword })}>Generar</Button>
        </DialogContent>
      </Dialog>

      <Dialog open={newPassword !== null} onOpenChange={(o) => { if (!o) setNewPassword(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Clave de {setup.partnerName}</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Se muestra una sola vez. Pásala por un canal privado; al primer ingreso le pedirá configurar Google Authenticator.</p>
          <code className="block rounded-xl bg-black/30 p-3 text-center font-mono text-lg">{newPassword}</code>
          <Button onClick={() => newPassword && copy(`Panel Playroom × ${setup.partnerName}: ${origin}/admin\nClave: ${newPassword}`)}><Copy className="mr-1.5 h-4 w-4" /> Copiar link y clave</Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
