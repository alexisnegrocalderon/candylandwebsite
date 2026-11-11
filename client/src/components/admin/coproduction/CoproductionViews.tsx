import { useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import {
  CalendarClock, Check, Copy, Download, Eye, Gift, Mail, KeyRound, Loader2, Plus, Receipt, RefreshCw, Rocket, Search, ShieldOff,
  Ticket, Upload, UserPlus, Users, Wallet, X, type LucideIcon,
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
import { CameraCaptureField } from '@/components/admin/CameraCaptureField';
import { formatChileDate, formatChileDateTime, formatChileShortDate } from '@shared/chileDate';
import { PLAYMORE_TANDA_ROWS, PLAYMORE_SOLTERO, exactPercents, tandaRowProblem, type PlaymoreTandaRow } from '@shared/playmoreTandas';
import { parseColabContacts, COLAB_CONTACTS_MAX } from '@shared/colabContacts';
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

      <div className="grid gap-5">
        <section className="admin-clay p-5">
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

type Attendee = {
  id: number; orderNumber: string; buyerName: string; buyerEmail: string; buyerPhone: string | null; total: number; paymentStatus: string;
  channel: string; createdAt: string | Date; accesos: string[]; personas: number; checkedIn: boolean; invitedBy: string | null;
  buyerRut: string | null; buyerInstagram: string | null; inClients: boolean;
  companions: { name: string; rut: string | null; docType: string }[];
  tickets: { type: string; code: string | null; holderName: string | null; status: string; people: number }[];
};

function Field({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="break-all text-sm">{value || '—'}</p>
    </div>
  );
}

function AttendeeCard({ r, isOwner, adding, onAdd, invitedLabel }: { r: Attendee; isOwner: boolean; adding: boolean; onAdd: () => void; invitedLabel: (by: string | null) => string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="admin-clay-sm border border-white/10 bg-white/5 text-sm">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="flex w-full items-start justify-between gap-3 p-3 text-left">
        <span className="min-w-0">
          <span className="block font-semibold">{r.buyerName}</span>
          <span className="block text-muted-foreground">{r.accesos.join(' + ')} · {r.personas} persona{r.personas === 1 ? '' : 's'}{r.companions.length > 0 ? ` · ${r.companions.length} acompañante${r.companions.length === 1 ? '' : 's'}` : ''}</span>
          <span className="mt-1.5 flex flex-wrap gap-1.5 text-[11px]">
            {r.paymentStatus !== 'approved' && <span className="rounded-full bg-red-400/15 px-2 py-0.5 text-red-300">Reembolsada</span>}
            {r.checkedIn && <span className="rounded-full bg-emerald-400/15 px-2 py-0.5 text-emerald-300">Entró</span>}
            {r.invitedBy && <span className="rounded-full bg-white/10 px-2 py-0.5">{invitedLabel(r.invitedBy)}</span>}
            {isOwner && r.inClients && <span className="rounded-full bg-sky-400/15 px-2 py-0.5 text-sky-200">Ya es cliente</span>}
          </span>
        </span>
        <span className="shrink-0 text-right tabular-nums">
          <span className="block font-semibold">{clp(r.total)}</span>
          <span className="text-xs text-muted-foreground">{open ? 'Ocultar' : 'Ver todo'}</span>
        </span>
      </button>
      {open && (
        <div className="space-y-4 border-t border-white/10 p-3">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Correo" value={r.buyerEmail} />
            <Field label="Teléfono" value={r.buyerPhone} />
            <Field label="RUT / pasaporte" value={r.buyerRut} />
            <Field label="Instagram" value={r.buyerInstagram} />
            <Field label="Orden" value={r.orderNumber} />
            <Field label="Comprada" value={formatChileDateTime(r.createdAt)} />
            <Field label="Canal" value={r.channel === 'caja' ? 'Caja' : 'Web'} />
          </div>
          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Entradas ({r.tickets.length})</p>
            {r.tickets.length === 0 ? <p className="text-xs text-muted-foreground">Sin entradas generadas.</p> : (
              <ul className="space-y-1">
                {r.tickets.map((t, i) => (
                  <li key={i} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white/5 px-2.5 py-1.5">
                    <span>{t.type}{t.holderName ? ` · ${t.holderName}` : ''}{t.people > 1 ? ` · ${t.people} pers.` : ''}</span>
                    <span className="text-xs text-muted-foreground">{t.code ?? ''} {t.status === 'used' ? '· Entró' : ''}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Acompañantes ({r.companions.length})</p>
            {r.companions.length === 0 ? <p className="text-xs text-muted-foreground">Sin acompañantes cargados.</p> : (
              <ul className="space-y-1">
                {r.companions.map((c, i) => (
                  <li key={i} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white/5 px-2.5 py-1.5">
                    <span>{c.name}</span>
                    <span className="text-xs text-muted-foreground">{c.rut ? `${c.docType === 'passport' ? 'Pasaporte' : 'RUT'} ${c.rut}` : 'Sin RUT'}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          {isOwner && r.paymentStatus === 'approved' && (
            <Button size="sm" variant="outline" disabled={adding} onClick={onAdd}>
              {adding ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <UserPlus className="mr-1.5 h-4 w-4" />} Agregar a mis clientes
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

export function CoproAsistentes() {
  const utils = trpc.useUtils();
  const { data: me } = useMe();
  const { data, isLoading } = trpc.coproduction.attendees.useQuery(undefined, { refetchInterval: 60_000 });
  const [q, setQ] = useState('');
  const isOwner = me?.viewer === 'playroom';
  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (data ?? []).filter((r) => !term || `${r.buyerName} ${r.buyerEmail} ${r.buyerPhone ?? ''} ${r.orderNumber} ${r.buyerRut ?? ''} ${r.companions.map((c) => `${c.name} ${c.rut ?? ''}`).join(' ')}`.toLowerCase().includes(term));
  }, [data, q]);
  const personas = rows.filter((r) => r.paymentStatus === 'approved').reduce((s, r) => s + r.personas, 0);
  const invitedLabel = (by: string | null) => (by === 'partner' ? `Cortesía ${me?.partnerName ?? 'socio'}` : by === 'playroom' ? 'Cortesía Playroom' : '');
  const [addingId, setAddingId] = useState<number | 'all' | null>(null);
  const addToClients = trpc.coproduction.addToClients.useMutation({
    onSuccess: (r) => {
      toast.success(`Listo: ${r.buyersAdded} cliente${r.buyersAdded === 1 ? '' : 's'} nuevo${r.buyersAdded === 1 ? '' : 's'}, ${r.buyersTagged} ya existían (etiquetados) y ${r.companions} acompañante${r.companions === 1 ? '' : 's'}.`);
      void utils.coproduction.attendees.invalidate();
    },
    onError,
    onSettled: () => setAddingId(null),
  });
  const add = (orderIds?: number[], key: number | 'all' = 'all') => { if (!me) return; setAddingId(key); addToClients.mutate({ slug: me.slug, orderIds }); };

  return (
    <div className="space-y-4">
      <SectionTitle
        title="Asistentes"
        subtitle={`${rows.length} compras · ${personas} personas`}
        action={(
          <div className="flex flex-wrap gap-2">
            {isOwner && (
              <Button variant="outline" disabled={!rows.length || addToClients.isPending} onClick={() => { if (confirm('¿Pasar a tu base de Clientes a todos los compradores y acompañantes de este evento? Los acompañantes quedan sin correo (nunca reciben mailing).')) add(); }}>
                {addingId === 'all' ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <UserPlus className="mr-1.5 h-4 w-4" />} Agregar todos a Clientes
              </Button>
            )}
            <Button variant="outline" disabled={!rows.length} onClick={() => downloadCsv('asistentes-playroom-dalmore.csv', [
              ['Orden', 'Nombre', 'Correo', 'Teléfono', 'RUT', 'Instagram', 'Accesos', 'Personas', 'Acompañantes', 'Total', 'Estado', 'Entró', 'Cortesía', 'Fecha'],
              ...rows.map((r) => [r.orderNumber, r.buyerName, r.buyerEmail, r.buyerPhone ?? '', r.buyerRut ?? '', r.buyerInstagram ?? '', r.accesos.join(' + '), r.personas,
                r.companions.map((c) => `${c.name}${c.rut ? ` (${c.rut})` : ''}`).join(' | '), r.total,
                r.paymentStatus === 'approved' ? 'Pagada' : 'Reembolsada', r.checkedIn ? 'Sí' : 'No', invitedLabel(r.invitedBy), formatChileDateTime(r.createdAt)]),
            ])}>
              <Download className="mr-1.5 h-4 w-4" /> Descargar CSV
            </Button>
          </div>
        )}
      />
      <label className="flex h-11 items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3">
        <Search className="h-4 w-4 text-muted-foreground" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nombre, correo, teléfono, RUT, acompañante u orden" className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground" />
      </label>
      {isLoading ? <p className="text-sm text-muted-foreground">Cargando…</p> : rows.length === 0 ? <EmptyState icon={Users} title={data?.length ? 'Nada coincide' : 'Todavía no hay asistentes'} /> : (
        <div className="space-y-2">
          {rows.map((r) => (
            <AttendeeCard key={r.id} r={r} isOwner={isOwner} invitedLabel={invitedLabel}
              adding={addingId === r.id && addToClients.isPending} onAdd={() => add([r.id], r.id)} />
          ))}
        </div>
      )}
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

const CALC_CATEGORIES: { value: string; label: string; emoji: string }[] = [
  { value: 'produccion', label: 'Producción', emoji: '🎛️' },
  { value: 'barra', label: 'Barra', emoji: '🍸' },
  { value: 'staff', label: 'Staff', emoji: '🧑‍🤝‍🧑' },
  { value: 'decoracion', label: 'Decoración', emoji: '🎈' },
  { value: 'arriendo', label: 'Arriendo', emoji: '🏠' },
  { value: 'marketing', label: 'Marketing', emoji: '📣' },
  { value: 'transporte', label: 'Transporte', emoji: '🚚' },
  { value: 'otros', label: 'Otros', emoji: '📦' },
];
const CALC_DOCS: { value: string; label: string }[] = [
  { value: 'boleta', label: 'Boleta' }, { value: 'factura', label: 'Factura' }, { value: 'boleta_honorarios', label: 'Honorarios' }, { value: 'sin_documento', label: 'Sin doc.' },
];

/** Gastos del evento, armados como la calculadora de gastos de Playroom: monto grande, foto de la boleta que se lee sola,
 * categoría de un toque. Lo del dueño entra directo; lo del socio queda por aprobar. */
export function CoproGastos() {
  const utils = trpc.useUtils();
  const { data: me } = useMe();
  const { data, isLoading } = trpc.coproduction.expenses.useQuery();
  const isOwner = me?.viewer === 'playroom';
  const today = new Date().toISOString().slice(0, 10);
  const empty = { category: 'produccion', description: '', supplier: '', documentType: 'boleta', amountTotal: '', expenseDate: today, receiptUrl: '' };
  const [form, setForm] = useState(empty);
  const [showMore, setShowMore] = useState(false);
  const [rejecting, setRejecting] = useState<{ id: number; reason: string } | null>(null);
  const refresh = () => { void utils.coproduction.expenses.invalidate(); void utils.coproduction.split.invalidate(); };

  const create = trpc.coproduction.createExpense.useMutation({
    onSuccess: () => { toast.success(isOwner ? 'Gasto agregado' : 'Gasto enviado: queda por aprobar'); setForm(empty); setShowMore(false); refresh(); },
    onError,
  });
  const scan = trpc.coproduction.scanReceipt.useMutation({
    onSuccess: (r) => {
      if (!r.isReceipt) { toast.error('No pudimos leer la foto como boleta o factura. Completa a mano: la foto queda guardada.'); return; }
      setForm((f) => ({
        ...f,
        amountTotal: r.amountTotal ? String(r.amountTotal) : f.amountTotal,
        category: r.category && CALC_CATEGORIES.some((c) => c.value === r.category) ? r.category : r.category ? 'otros' : f.category,
        documentType: r.documentType ?? f.documentType,
        description: r.description || f.description,
        supplier: r.supplier || f.supplier,
      }));
      if (r.description || r.supplier) setShowMore(true);
      if (r.confidence !== 'alta' || r.notes) toast.warning(r.notes || 'Revisa los datos leídos antes de guardar.');
      else toast.success('Boleta leída: revisa y guarda.');
    },
    onError: (e) => toast.error(`${e.message} La foto queda guardada.`),
  });
  const approve = trpc.coproduction.approveExpense.useMutation({ onSuccess: () => { toast.success('Gasto aprobado'); refresh(); }, onError });
  const reject = trpc.coproduction.rejectExpense.useMutation({ onSuccess: () => { toast.success('Gasto rechazado'); setRejecting(null); refresh(); }, onError });

  const amount = Number(form.amountTotal.replace(/\D/g, ''));
  const canSubmit = amount > 0 && !create.isPending;
  const rows = data ?? [];
  const total = rows.filter((r) => r.status === 'approved').reduce((s, r) => s + r.amountTotal, 0);
  const catLabel = (v: string) => CALC_CATEGORIES.find((c) => c.value === v)?.label ?? 'Gasto';

  return (
    <div className="space-y-5">
      <SectionTitle
        title="Gastos del evento"
        subtitle={isOwner
          ? 'Lo que cargas acá entra directo. Lo que carga el socio queda por aprobar y no cuenta en el cierre hasta que lo apruebes.'
          : 'Anota el monto o saca la foto de la boleta: se lee sola. Queda por aprobar y entra al cierre cuando Playroom lo apruebe.'}
      />
      <div className="mx-auto max-w-lg space-y-4">
        <section className="admin-clay p-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Monto pagado</p>
          <label className="mt-3 flex cursor-text items-baseline justify-center gap-1" htmlFor="copro-expense-amount">
            <span className={`text-3xl font-bold ${amount > 0 ? 'text-white/70' : 'text-white/30'}`}>$</span>
            <input
              id="copro-expense-amount"
              value={amount > 0 ? amount.toLocaleString('es-CL') : ''}
              onChange={(e) => setForm({ ...form, amountTotal: e.target.value.replace(/\D/g, '') })}
              inputMode="numeric" enterKeyHint="done" placeholder="0" aria-label="Monto total pagado"
              style={{ width: `${Math.max(1, (amount > 0 ? amount.toLocaleString('es-CL').length : 1)) + 0.4}ch` }}
              className="min-w-[1.5ch] max-w-full bg-transparent text-center text-5xl font-bold tracking-tight tabular-nums text-white outline-none placeholder:text-white/25"
            />
          </label>
          <div className="mx-auto mt-2 h-px w-2/3 bg-gradient-to-r from-transparent via-[oklch(0.72_0.2_342)] to-transparent opacity-70" />
          <div className="mt-4 flex items-center justify-center gap-3">
            <CameraCaptureField
              label={form.receiptUrl ? 'Cambiar foto' : 'Escanear boleta o factura'}
              pathPrefix="coproduction/receipts"
              uploadUrl="/api/partner/blob/upload"
              maxSide={1800}
              hidePreview
              analyzing={scan.isPending}
              buttonClassName="admin-tab h-10 rounded-full border-0 px-4 text-sm"
              onScanned={(url) => { setForm((f) => ({ ...f, receiptUrl: url })); scan.mutate({ slug: me?.slug, imageUrl: url }); }}
            />
            {form.receiptUrl && (
              <span className="relative">
                <a href={form.receiptUrl} target="_blank" rel="noreferrer" aria-label="Ver la foto de la boleta"><img src={form.receiptUrl} alt="" className="h-12 w-12 rounded-xl border border-white/15 object-cover" /></a>
                <button type="button" onClick={() => setForm({ ...form, receiptUrl: '' })} aria-label="Quitar la foto" className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full border border-white/20 bg-[#1c1c1f] text-white/80"><X className="h-3.5 w-3.5" /></button>
              </span>
            )}
          </div>
        </section>

        <section className="admin-clay p-4">
          <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Categoría</p>
          <div className="grid grid-cols-4 gap-2">
            {CALC_CATEGORIES.map((c) => (
              <button key={c.value} type="button" onClick={() => setForm({ ...form, category: c.value })} aria-pressed={form.category === c.value}
                className={`admin-tile flex min-h-[4.5rem] flex-col items-center justify-center gap-1 rounded-2xl px-1 py-2.5 text-xs font-semibold leading-tight ${form.category === c.value ? 'admin-tab-active' : ''}`}>
                <span className="text-xl leading-none" aria-hidden="true">{c.emoji}</span>{c.label}
              </button>
            ))}
          </div>
        </section>

        <section className="admin-clay p-4">
          <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Documento</p>
          <div className="flex gap-1.5" role="radiogroup" aria-label="Documento">
            {CALC_DOCS.map((d) => (
              <button key={d.value} type="button" role="radio" aria-checked={form.documentType === d.value} onClick={() => setForm({ ...form, documentType: d.value })}
                className={`admin-tab min-h-11 flex-1 rounded-full px-2 py-2.5 text-xs font-semibold leading-tight ${form.documentType === d.value ? 'admin-tab-active' : ''}`}>{d.label}</button>
            ))}
          </div>
        </section>

        <section className="admin-clay p-4">
          <button type="button" onClick={() => setShowMore(!showMore)} aria-expanded={showMore} className="flex w-full items-center justify-between text-sm text-muted-foreground hover:text-white">
            <span>{showMore ? 'Detalle, proveedor y fecha' : 'Agregar detalle, proveedor o fecha'}</span>
            <span aria-hidden="true">{showMore ? '−' : '+'}</span>
          </button>
          {showMore && (
            <div className="mt-3 space-y-3">
              <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="¿Qué compraste?" className="h-12 rounded-xl" />
              <Input value={form.supplier} onChange={(e) => setForm({ ...form, supplier: e.target.value })} placeholder="Proveedor" className="h-12 rounded-xl" />
              <Input type="date" value={form.expenseDate} onChange={(e) => setForm({ ...form, expenseDate: e.target.value })} className="h-12 rounded-xl" />
            </div>
          )}
        </section>

        <Button className="h-14 w-full rounded-[20px] text-base font-bold" disabled={!canSubmit} onClick={() => create.mutate({
          category: form.category as any, description: form.description.trim() || catLabel(form.category), supplier: form.supplier || undefined, documentType: form.documentType as any,
          amountTotal: amount, expenseDate: new Date(`${form.expenseDate || today}T12:00:00`), receiptUrl: form.receiptUrl || undefined,
        })}>
          {create.isPending ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <Check className="mr-2 h-5 w-5" />}
          {amount > 0 ? `${isOwner ? 'Guardar' : 'Enviar'} ${clp(amount)}` : isOwner ? 'Guardar gasto' : 'Enviar gasto'}
        </Button>
      </div>

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

/** Cierre del evento: todo lo vendido y lo ingresado, los gastos y cómo se reparte la utilidad entre las dos productoras. */
export function CoproReparto() {
  const { data, isLoading } = trpc.coproduction.split.useQuery(undefined, { refetchInterval: 60_000 });
  const { data: sales } = trpc.coproduction.overview.useQuery(undefined, { refetchInterval: 60_000 });
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
  const ev = sales && sales.event ? sales : null;
  const days = ev ? [...ev.byDay].reverse() : [];

  return (
    <div className="space-y-5">
      <SectionTitle title="Cierre" subtitle={`Todo lo que entró y salió del evento, y la utilidad repartida ${100 - split.partnerPercent}/${split.partnerPercent} (Playroom/${partnerName}). No incluye gastos generales de ninguna de las dos productoras.`} />

      {ev && (
        <>
          <div className="grid grid-cols-2 gap-3 md:gap-4 lg:grid-cols-4">
            <Kpi icon={Wallet} label="Ingresado al evento" value={clp(ev.revenueWeb + ev.revenueCaja)} hint={`Web ${clp(ev.revenueWeb)} · Caja ${clp(ev.revenueCaja)}`} />
            <Kpi icon={Ticket} label="Compras aprobadas" value={ev.ordersApproved.toLocaleString('es-CL')} />
            <Kpi icon={Users} label="Personas" value={ev.personas.toLocaleString('es-CL')} />
            <Kpi icon={Check} label="Ya entraron" value={ev.checkedIn.toLocaleString('es-CL')} />
          </div>
          <div className="grid gap-5 lg:grid-cols-2">
            <section className="admin-clay p-5">
              <h3 className="mb-3 font-heading text-lg">Ventas por tipo de acceso</h3>
              {ev.ticketTypes.length === 0 ? <p className="text-sm text-muted-foreground">El evento todavía no tiene accesos cargados.</p> : (
                <ul className="divide-y divide-white/10">
                  {ev.ticketTypes.filter((t) => t.quantity > 0 || t.status === 'active').map((t) => (
                    <li key={t.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{t.name}</span>
                        <span className="text-xs text-muted-foreground">{clp(t.price)}{t.status !== 'active' ? ` · ${t.status === 'soldout' ? 'agotado' : 'oculto'}` : ''}</span>
                      </span>
                      <span className="shrink-0 text-right tabular-nums"><span className="block font-semibold">{t.quantity}</span><span className="text-xs text-muted-foreground">{clp(t.revenue)}</span></span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <section className="admin-clay p-5">
              <h3 className="mb-3 font-heading text-lg">Ingresos por día</h3>
              {days.length === 0 ? <p className="text-sm text-muted-foreground">Todavía no hay ventas.</p> : (
                <ul className="max-h-80 divide-y divide-white/10 overflow-y-auto">
                  {days.map((d) => (
                    <li key={d.day} className="flex items-center justify-between gap-3 py-2 text-sm">
                      <span>{d.day.slice(8, 10)}-{d.day.slice(5, 7)}</span>
                      <span className="tabular-nums text-muted-foreground">{d.orders} compra{d.orders === 1 ? '' : 's'}</span>
                      <span className="w-24 text-right tabular-nums font-medium">{clp(d.revenue)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </>
      )}

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

// ── Códigos de descuento ───────────────────────────────────────────────────

export function CoproDescuentos() {
  const utils = trpc.useUtils();
  const { data: me } = useMe();
  const { data: overview } = trpc.coproduction.overview.useQuery();
  const { data, isLoading } = trpc.coproduction.discounts.useQuery();
  const empty = { code: '', description: '', discountType: 'percentage' as 'percentage' | 'fixed', discountValue: '', maxUses: '', validUntil: '' };
  const [form, setForm] = useState(empty);
  const refresh = () => { void utils.coproduction.discounts.invalidate(); };
  const create = trpc.coproduction.createDiscount.useMutation({
    onSuccess: (r) => { toast.success(`Código ${r.code} creado`); setForm(empty); refresh(); },
    onError,
  });
  const toggle = trpc.coproduction.setDiscountActive.useMutation({ onSuccess: refresh, onError });
  if (overview && !overview.event) return <NoEvent />;

  const value = Number(form.discountValue.replace(/\D/g, ''));
  const maxUses = Number(form.maxUses.replace(/\D/g, ''));
  const canSubmit = form.code.trim().length >= 3 && value > 0 && (form.discountType === 'fixed' || value <= 100) && !create.isPending;
  const rows = data ?? [];
  const label = (r: { discountType: string; discountValue: number }) => (r.discountType === 'percentage' ? `${r.discountValue}%` : clp(r.discountValue));
  const copy = (code: string) => navigator.clipboard?.writeText(code).then(() => toast.success('Código copiado'), () => toast.error('No se pudo copiar'));

  return (
    <div className="space-y-5">
      <SectionTitle title="Códigos de descuento" subtitle="Crea códigos con el nombre que quieras (ej. DALMORE20). Valen solo para este evento y se usan en el checkout." />
      <section className="admin-clay space-y-4 p-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <div><Label>Código</Label><Input className="mt-1 uppercase" placeholder="DALMORE20" maxLength={40} value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, '') })} /></div>
          <div><Label>Nota (opcional)</Label><Input className="mt-1" placeholder="Para quién es" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
          <div>
            <Label>Tipo</Label>
            <Select value={form.discountType} onValueChange={(v) => setForm({ ...form, discountType: v as 'percentage' | 'fixed' })}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="percentage">Porcentaje (%)</SelectItem><SelectItem value="fixed">Monto fijo ($)</SelectItem></SelectContent>
            </Select>
          </div>
          <div><Label>{form.discountType === 'percentage' ? 'Descuento (%)' : 'Descuento ($)'}</Label><Input className="mt-1" inputMode="numeric" value={form.discountValue} onChange={(e) => setForm({ ...form, discountValue: e.target.value.replace(/\D/g, '') })} /></div>
          <div><Label>Usos máximos (opcional)</Label><Input className="mt-1" inputMode="numeric" placeholder="Sin límite" value={form.maxUses} onChange={(e) => setForm({ ...form, maxUses: e.target.value.replace(/\D/g, '') })} /></div>
          <div><Label>Vence (opcional)</Label><Input className="mt-1" type="date" value={form.validUntil} onChange={(e) => setForm({ ...form, validUntil: e.target.value })} /></div>
        </div>
        <Button disabled={!canSubmit} onClick={() => create.mutate({
          slug: me?.slug, code: form.code, description: form.description || undefined, discountType: form.discountType, discountValue: value,
          maxUses: maxUses > 0 ? maxUses : undefined, validUntil: form.validUntil ? new Date(`${form.validUntil}T23:59:59`).toISOString() : undefined,
        })}>
          {create.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Plus className="mr-1.5 h-4 w-4" />} Crear código
        </Button>
      </section>

      <section className="space-y-2">
        <h3 className="font-heading text-lg">Códigos del evento ({rows.length})</h3>
        {isLoading ? <p className="text-sm text-muted-foreground">Cargando…</p> : rows.length === 0 ? <EmptyState icon={Ticket} title="Todavía no hay códigos" /> : rows.map((r) => (
          <div key={r.id} className="admin-clay-sm flex flex-wrap items-center justify-between gap-3 border border-white/10 bg-white/5 p-3 text-sm">
            <div className="min-w-0">
              <p className="font-semibold tracking-wide">{r.code} <span className="font-normal text-muted-foreground">· {label(r)} de descuento</span></p>
              <p className="text-xs text-muted-foreground">
                {r.usedCount} uso{r.usedCount === 1 ? '' : 's'}{r.maxUses ? ` de ${r.maxUses}` : ''}{r.validUntil ? ` · vence ${formatChileShortDate(r.validUntil)}` : ''}{r.description ? ` · ${r.description}` : ''}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={() => copy(r.code)}><Copy className="mr-1 h-3.5 w-3.5" /> Copiar</Button>
              <span className="text-xs text-muted-foreground">{r.isActive ? 'Activo' : 'Pausado'}</span>
              <Switch checked={r.isActive} disabled={toggle.isPending} onCheckedChange={(active) => toggle.mutate({ slug: me?.slug, id: r.id, active })} />
            </div>
          </div>
        ))}
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
      toast.success(`Listo: tanda ${r.phaseIndex + 1} vigente.${r.created.length ? ` Accesos creados: ${r.created.join(', ')}.` : ''}${r.updated.length ? ` Actualizados: ${r.updated.join(', ')}.` : ''}`);
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
      <Button disabled={!!problem || apply.isPending} onClick={() => run(false)}>{apply.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Check className="mr-1.5 h-4 w-4" />} Aplicar tandas al evento (y crear los accesos que falten)</Button>
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

      {/* Player 1 vs Player 2: pulseras al azar en la puerta y juegos en vivo con premio de un copete */}
      <section className="admin-clay space-y-3 p-5">
        <p className="font-semibold">Player 1 vs Player 2 · pulseras y juegos en vivo</p>
        <p className="text-sm text-muted-foreground">
          En la puerta el sistema sortea la pulsera de cada persona (magenta o azul; una pareja sale con una de cada una) y la ficha del anfitrión dice cuál entregar. En la app aparece como «Tu equipo» cuando ya entró.
          Para los juegos, el anfitrión abre <strong>/ronda</strong> en su celular (o la proyecta): elige el juego, pide «2 azules y 2 magenta», marca a quienes van llegando, y al terminar toca al equipo ganador, que se lleva un copete.
          Todo es opcional y siempre se puede pasar.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <code className="min-w-0 flex-1 truncate rounded-xl bg-black/30 px-3 py-2 text-xs">{origin}/ronda</code>
          <Button variant="outline" size="sm" onClick={() => copy(`${origin}/ronda`)}><Copy className="mr-1 h-4 w-4" /> Copiar</Button>
          <Button variant="outline" size="sm" asChild><a href={`${origin}/ronda`} target="_blank" rel="noreferrer">Abrir</a></Button>
        </div>
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

// ── Movimientos (transparencia) ────────────────────────────────────────────

const MOVEMENT_STYLE: Record<string, [string, string]> = {
  sale: ['Venta', 'bg-emerald-400/15 text-emerald-300'],
  courtesy: ['Cortesía', 'bg-sky-400/15 text-sky-300'],
  refund: ['Reembolso', 'bg-red-400/15 text-red-300'],
  expense: ['Gasto', 'bg-amber-400/15 text-amber-200'],
  change: ['Cambio', 'bg-fuchsia-400/15 text-fuchsia-300'],
};

/** Bitácora única: ventas, cortesías, reembolsos, gastos y cambios de Playroom a la venta, con fecha y quién. */
export function CoproMovimientos() {
  const { data, isLoading } = trpc.coproduction.movements.useQuery(undefined, { refetchInterval: 60_000 });
  const [kind, setKind] = useState('all');
  const rows = useMemo(() => (data ?? []).filter((m) => kind === 'all' || m.kind === kind), [data, kind]);

  return (
    <div className="space-y-4">
      <SectionTitle
        title="Movimientos"
        subtitle="Todo lo que pasa con el evento, en orden: ventas, cortesías, reembolsos, gastos y cambios en precios o reparto."
        action={(
          <Button variant="outline" disabled={!rows.length} onClick={() => downloadCsv('movimientos-playroom-dalmore.csv', [
            ['Fecha', 'Tipo', 'Movimiento', 'Detalle', 'Monto', 'Quién'],
            ...rows.map((m) => [formatChileDateTime(m.at), MOVEMENT_STYLE[m.kind][0], m.title, m.detail, m.amount ?? '', m.by]),
          ])}>
            <Download className="mr-1.5 h-4 w-4" /> Descargar CSV
          </Button>
        )}
      />
      <div className="flex flex-wrap gap-1.5">
        {[['all', 'Todo'], ...Object.entries(MOVEMENT_STYLE).map(([k, v]) => [k, v[0]])].map(([k, label]) => (
          <button key={k} type="button" onClick={() => setKind(k)}
            className={`rounded-full px-3 py-1 text-xs ${kind === k ? 'bg-primary text-primary-foreground' : 'bg-white/10 text-muted-foreground'}`}>{label}</button>
        ))}
      </div>
      {isLoading ? <p className="text-sm text-muted-foreground">Cargando…</p> : rows.length === 0 ? <EmptyState icon={Receipt} title="Todavía no hay movimientos" /> : (
        <ul className="space-y-2">
          {rows.map((m) => (
            <li key={m.key} className="admin-clay-sm flex items-start justify-between gap-3 border border-white/10 bg-white/5 p-3 text-sm">
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-[11px] ${MOVEMENT_STYLE[m.kind][1]}`}>{MOVEMENT_STYLE[m.kind][0]}</span>
                  <span className="font-medium">{m.title}</span>
                </p>
                {m.detail && <p className="mt-0.5 text-xs text-muted-foreground">{m.detail}</p>}
                <p className="mt-0.5 text-xs text-muted-foreground">{formatChileDateTime(m.at)} · {m.by}</p>
              </div>
              {m.amount != null && <span className={`shrink-0 font-semibold tabular-nums ${m.kind === 'refund' ? 'text-red-300' : ''}`}>{m.kind === 'refund' ? '−' : ''}{clp(m.amount)}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── Base de contactos (planilla del socio) ─────────────────────────────────

/** El socio sube su planilla (CSV o pegada desde Excel / Google Sheets). Queda en una lista de ESTA colab:
 * no se mezcla con los Clientes de Playroom ni entra a sus mailings. */
export function CoproContactos() {
  const utils = trpc.useUtils();
  const { data: me } = useMe();
  const { data, isLoading } = trpc.coproduction.contacts.useQuery();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [q, setQ] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const preview = useMemo(() => parseColabContacts(text), [text]);

  const importer = trpc.coproduction.importContacts.useMutation({
    onSuccess: (r) => {
      toast.success(`${r.added} contacto${r.added === 1 ? '' : 's'} agregado${r.added === 1 ? '' : 's'}${r.alreadyThere ? ` · ${r.alreadyThere} ya estaban` : ''}${r.invalid ? ` · ${r.invalid} sin correo válido` : ''}`);
      setOpen(false); setText('');
      void utils.coproduction.contacts.invalidate();
    },
    onError,
  });
  const { data: overview } = trpc.coproduction.overview.useQuery();
  const { data: attendees } = trpc.coproduction.attendees.useQuery();
  const [ticketTypeId, setTicketTypeId] = useState('');
  const [sendingEmail, setSendingEmail] = useState<string | null>(null);
  const invited = useMemo(() => new Set((attendees ?? []).filter((a) => a.invitedBy).map((a) => a.buyerEmail.toLowerCase())), [attendees]);
  const sendCourtesy = trpc.coproduction.createInvite.useMutation({
    onSuccess: (r) => {
      toast.success(`Cortesía enviada (${r.orderNumber}). La entrada le llega por correo.`);
      void utils.coproduction.attendees.invalidate(); void utils.coproduction.overview.invalidate(); void utils.coproduction.movements.invalidate();
    },
    onError,
    onSettled: () => setSendingEmail(null),
  });
  const { data: defaults } = trpc.coproduction.mailingDefaults.useQuery();
  const [mailOpen, setMailOpen] = useState(false);
  const [mail, setMail] = useState<{ subject: string; message: string } | null>(null);
  const [testTo, setTestTo] = useState('');
  const form = mail ?? defaults ?? { subject: '', message: '' };
  const ticketEmails = useMemo(() => new Set((attendees ?? []).map((a) => a.buyerEmail.toLowerCase())), [attendees]);
  const recipients = (data ?? []).filter((c) => !ticketEmails.has(c.email)).length;
  const sendMail = trpc.coproduction.sendMailing.useMutation({
    onSuccess: (r) => {
      if (r.test) { toast.success('Prueba enviada. Revisa tu bandeja (y spam).'); return; }
      toast.success(`Aviso enviado a ${r.sent} contactos${r.skippedWithTicket ? ` · ${r.skippedWithTicket} omitidos (ya tienen entrada)` : ''}${r.optedOut ? ` · ${r.optedOut} pidieron no recibir correos` : ''}${r.failed ? ` · ${r.failed} fallaron` : ''}`);
      setMailOpen(false);
      void utils.coproduction.movements.invalidate();
    },
    onError,
  });
  const remove = trpc.coproduction.deleteContact.useMutation({ onSuccess: () => void utils.coproduction.contacts.invalidate(), onError });

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (data ?? []).filter((c) => !term || `${c.fullName ?? ''} ${c.email} ${c.phone ?? ''}`.toLowerCase().includes(term));
  }, [data, q]);
  const owner = me?.partnerName ?? 'socio';

  return (
    <div className="space-y-4">
      <SectionTitle
        title="Base de contactos"
        subtitle={`${(data ?? []).length} contactos de ${owner}. Esta lista es solo de esta colab: no se mezcla con los Clientes de Playroom.`}
        action={(
          <div className="flex gap-2">
            <Button variant="outline" disabled={!rows.length} onClick={() => downloadCsv('contactos-colab.csv', [['Nombre', 'Correo', 'Teléfono'], ...rows.map((c) => [c.fullName ?? '', c.email, c.phone ?? ''])])}>
              <Download className="mr-1.5 h-4 w-4" /> CSV
            </Button>
            <Button variant="outline" disabled={!(data ?? []).length} onClick={() => setMailOpen(true)}><Mail className="mr-1.5 h-4 w-4" /> Enviar aviso</Button>
            <Button onClick={() => setOpen(true)}><Upload className="mr-1.5 h-4 w-4" /> Importar planilla</Button>
          </div>
        )}
      />
      <div className="admin-clay-sm flex flex-wrap items-center gap-3 border border-white/10 bg-white/5 p-3 text-sm">
        <Gift className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="text-muted-foreground">Cortesía en un clic, con este acceso:</span>
        <Select value={ticketTypeId} onValueChange={setTicketTypeId}>
          <SelectTrigger className="h-9 w-full sm:w-56"><SelectValue placeholder="Elige el acceso" /></SelectTrigger>
          <SelectContent>{(overview?.ticketTypes ?? []).map((t) => <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <label className="flex h-11 items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3">
        <Search className="h-4 w-4 text-muted-foreground" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nombre, correo o teléfono" className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground" />
      </label>
      {isLoading ? <p className="text-sm text-muted-foreground">Cargando…</p> : rows.length === 0 ? (
        <EmptyState icon={Users} title={data?.length ? 'Nada coincide' : 'Todavía no hay contactos'} />
      ) : (
        <ul className="space-y-2">
          {rows.slice(0, 300).map((c) => (
            <li key={c.id} className="admin-clay-sm flex items-center justify-between gap-3 border border-white/10 bg-white/5 p-3 text-sm">
              <div className="min-w-0">
                <p className="truncate font-medium">{c.fullName || '—'}</p>
                <p className="break-all text-xs text-muted-foreground">{c.email}{c.phone ? ` · ${c.phone}` : ''}</p>
              </div>
              {invited.has(c.email) ? (
                <span className="shrink-0 rounded-full bg-sky-400/15 px-2.5 py-1 text-xs text-sky-300">Cortesía enviada</span>
              ) : (
                <Button size="sm" variant="outline" className="shrink-0"
                  disabled={!ticketTypeId || sendCourtesy.isPending}
                  title={ticketTypeId ? undefined : 'Elige primero el acceso'}
                  onClick={() => {
                    if (!confirm(`¿Enviar una cortesía a ${c.fullName || c.email}? Le llega la entrada por correo.`)) return;
                    setSendingEmail(c.email);
                    sendCourtesy.mutate({ buyerName: c.fullName || c.email.split('@')[0], buyerEmail: c.email, buyerPhone: c.phone?.slice(0, 20) || undefined, ticketTypeId: Number(ticketTypeId), quantity: 1 });
                  }}>
                  {sendingEmail === c.email ? <Loader2 className="h-4 w-4 animate-spin" /> : <Gift className="mr-1 h-4 w-4" />} Cortesía
                </Button>
              )}
              <button type="button" aria-label="Quitar contacto" className="shrink-0 rounded-full p-1.5 text-muted-foreground hover:bg-white/10"
                onClick={() => { if (confirm(`¿Quitar a ${c.fullName || c.email} de la lista?`)) remove.mutate({ id: c.id }); }}>
                <X className="h-4 w-4" />
              </button>
            </li>
          ))}
          {rows.length > 300 && <li className="text-center text-xs text-muted-foreground">Mostrando 300 de {rows.length}. Usa el buscador o descarga el CSV.</li>}
        </ul>
      )}

      <Dialog open={mailOpen} onOpenChange={setMailOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Avisar del evento por correo</DialogTitle></DialogHeader>
          <div className="space-y-3 text-sm">
            <p className="text-muted-foreground">Le llega a <strong className="text-foreground">{recipients}</strong> de tus contactos (sin quienes ya tienen entrada ni quienes pidieron no recibir correos), con el botón para comprar. Se puede mandar <strong>un aviso por día</strong>.</p>
            <div><Label>Asunto</Label><Input className="mt-1" value={form.subject} maxLength={150} onChange={(e) => setMail({ ...form, subject: e.target.value })} /></div>
            <div><Label>Mensaje</Label><Textarea className="mt-1" rows={7} value={form.message} maxLength={3000} onChange={(e) => setMail({ ...form, message: e.target.value })} /><p className="mt-1 text-xs text-muted-foreground">Deja una línea en blanco para separar párrafos.</p></div>
            <div className="flex gap-2">
              <Input type="email" placeholder="Tu correo para una prueba" value={testTo} onChange={(e) => setTestTo(e.target.value)} />
              <Button variant="outline" disabled={!/\S+@\S+\.\S+/.test(testTo) || sendMail.isPending} onClick={() => sendMail.mutate({ ...form, testTo })}>Enviar prueba</Button>
            </div>
            <p className="text-xs text-muted-foreground">Cada correo lleva el link para darse de baja. Mándate una prueba antes del envío real.</p>
          </div>
          <Button disabled={sendMail.isPending || recipients === 0 || form.subject.trim().length < 3 || form.message.trim().length < 10}
            onClick={() => { if (confirm(`¿Enviar este aviso a ${recipients} contactos? No se puede deshacer y solo puedes mandar uno por día.`)) sendMail.mutate(form); }}>
            {sendMail.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Mail className="mr-1.5 h-4 w-4" />} Enviar a {recipients} contactos
          </Button>
        </DialogContent>
      </Dialog>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Importar planilla de contactos</DialogTitle></DialogHeader>
          <div className="space-y-3 text-sm">
            <p className="text-muted-foreground">Sube un CSV o pega las filas desde Excel / Google Sheets. Columnas: <strong>Nombre, Correo, Teléfono</strong> (solo el correo es obligatorio). Los correos repetidos se saltan.</p>
            <input ref={fileRef} type="file" accept=".csv,.txt,text/csv" className="hidden"
              onChange={async (e) => { const f = e.target.files?.[0]; if (f) setText(await f.text()); e.target.value = ''; }} />
            <Button variant="outline" onClick={() => fileRef.current?.click()}><Upload className="mr-1.5 h-4 w-4" /> Elegir archivo CSV</Button>
            <Textarea rows={7} value={text} onChange={(e) => setText(e.target.value)} placeholder={'Nombre\tCorreo\tTeléfono\nAna Pérez\tana@correo.cl\t+56911112222'} />
            {text.trim() && (
              <p className="text-xs text-muted-foreground">
                Listos para agregar: <strong className="text-foreground">{preview.rows.length}</strong>
                {preview.invalid > 0 && ` · ${preview.invalid} sin correo válido (se omiten)`}
                {preview.duplicates > 0 && ` · ${preview.duplicates} repetidos`}
                {preview.tooMany && ` · máximo ${COLAB_CONTACTS_MAX} por planilla`}
              </p>
            )}
            <p className="text-xs text-muted-foreground">Al importar confirmas que tienes permiso de estas personas para contactarlas por el evento.</p>
          </div>
          <Button disabled={preview.rows.length === 0 || importer.isPending} onClick={() => importer.mutate({ text })}>
            {importer.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Check className="mr-1.5 h-4 w-4" />} Agregar {preview.rows.length || ''} contactos
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
