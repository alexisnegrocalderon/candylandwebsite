import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import {
  CalendarClock, Check, Copy, Download, Eye, Gift, KeyRound, Loader2, Plus, Receipt, RefreshCw, Rocket, Search, ShieldOff,
  Ticket, Users, Wallet, X, type LucideIcon,
} from 'lucide-react';
import { trpc } from '@/lib/trpc';
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
import type { CoproductionLanding } from '@shared/coproduction';

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
  const previewUrl = `${origin}/playroomdalmore?preview=${setup.previewToken}`;
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
            <p className="text-sm text-muted-foreground">{setup.isLive ? '/playroomdalmore muestra todo y se puede comprar.' : '/playroomdalmore muestra "Próximamente" y nadie puede comprar.'}</p>
          </div>
        </div>
        <Switch checked={setup.isLive} disabled={setLive.isPending} onCheckedChange={(live) => {
          if (live && !confirm('¿Activar el evento? La página y la venta quedan abiertas al público y aparece destacado en tu home.')) return;
          setLive.mutate({ slug, live });
        }} />
      </section>

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
        <p className="font-semibold">Landing /playroomdalmore</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div><Label>Título</Label><Input className="mt-1" value={d.landing.title} onChange={(e) => editLanding({ title: e.target.value })} /></div>
          <div><Label>Fecha (texto)</Label><Input className="mt-1" value={d.landing.dateText} onChange={(e) => editLanding({ dateText: e.target.value })} /></div>
          <div><Label>Lugar</Label><Input className="mt-1" value={d.landing.venueText} onChange={(e) => editLanding({ venueText: e.target.value })} /></div>
          <div><Label>Aforo (texto)</Label><Input className="mt-1" value={d.landing.capacityText} onChange={(e) => editLanding({ capacityText: e.target.value })} /></div>
          <div className="sm:col-span-2"><Label>Frase principal</Label><Input className="mt-1" value={d.landing.headline} onChange={(e) => editLanding({ headline: e.target.value })} /></div>
          <div className="sm:col-span-2"><Label>Bajada</Label><Textarea className="mt-1" rows={2} value={d.landing.subheadline} onChange={(e) => editLanding({ subheadline: e.target.value })} /></div>
          <div>
            <Label>Imagen principal</Label>
            <div className="mt-1 space-y-2">
              <ImageUploadField value={d.landing.heroImageUrl} onChange={(url) => editLanding({ heroImageUrl: url })} pathPrefix="coproduction/landing" />
              <Input value={d.landing.heroImageUrl} placeholder="https://…" onChange={(e) => editLanding({ heroImageUrl: e.target.value })} />
            </div>
          </div>
          <div>
            <Label>Logo de {d.partnerName}</Label>
            <div className="mt-1 space-y-2">
              <ImageUploadField value={d.landing.partnerLogoUrl} onChange={(url) => editLanding({ partnerLogoUrl: url })} pathPrefix="coproduction/landing" />
              <Input value={d.landing.partnerLogoUrl} placeholder="https://…" onChange={(e) => editLanding({ partnerLogoUrl: e.target.value })} />
            </div>
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
          <div className="sm:col-span-2"><Label>Lo que vas a vivir (una idea por línea)</Label><Textarea className="mt-1" rows={4} value={d.landing.highlights.join('\n')} onChange={(e) => editLanding({ highlights: lines(e.target.value) })} /></div>
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
