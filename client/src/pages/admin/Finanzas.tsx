import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { PieChart, Pie, Cell, ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, BarChart, Bar } from 'recharts';
import { Banknote, Landmark, Pencil, Download, Sparkles, Activity, AlertTriangle, Lightbulb, Loader2, Plus, Trash2, TrendingUp, Users, Wallet, Receipt, Target } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { formatChileTime, formatChileShortDate } from '@shared/chileDate';
import { honorariosBreakdown } from '@shared/honorarios';
import { useIsDemo, DEMO_TOOLTIP } from '@/lib/demoMode';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { BentoGrid, BentoTile } from '@/components/admin/BentoGrid';
import { StatTile } from '@/components/admin/StatTile';
import { EmptyState } from '@/components/admin/EmptyState';
import { CameraCaptureField } from '@/components/admin/CameraCaptureField';
import { EXPENSE_CATEGORIES } from '@shared/expenses';

const money = (n: number) => `${n < 0 ? '-' : ''}$${Math.abs(Math.round(n)).toLocaleString('es-CL')}`;
const PALETTE = ['#ec4899', '#38bdf8', '#8b5cf6', '#f59e0b', '#10b981', '#f97316', '#64748b'];
const VERDICT_TONE: Record<string, string> = {
  ok: 'bg-emerald-500/15 text-emerald-700', warning: 'bg-amber-500/20 text-amber-800',
  danger: 'bg-orange-500/20 text-orange-800', loss: 'bg-red-500/15 text-red-700',
};
const GROUP_LABEL: Record<string, string> = { entradas: 'Entradas', consumo: 'Barra y consumo', extras: 'Extras', saldo: 'Cargas PlayCard', otros: 'Otros' };

/** Vista previa del cálculo antes de agregar el turno (misma función que usa el servidor). */
const honorariosPreview = (amount: number, mode: 'liquido' | 'bruto', year?: number) =>
  honorariosBreakdown({ amount, paymentType: 'boleta_honorarios', amountMode: mode, year: year ?? new Date().getFullYear() });

const onErr = (e: unknown) => toast.error((e as { message?: string })?.message || 'No se pudo completar la acción');

/** Una fila de la cascada: barra proporcional al ingreso. */
function FlowRow({ label, value, total, color, sign = '-' }: { label: string; value: number; total: number; color: string; sign?: '-' | '+' | '=' }) {
  const pct = total > 0 ? Math.max(0, Math.min(100, (Math.abs(value) / total) * 100)) : 0;
  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="w-40 shrink-0 truncate text-[var(--admin-muted)]">{label}</span>
      <div className="flex-1 h-5 rounded-md bg-black/5 overflow-hidden">
        <div className="h-full rounded-md" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="w-28 shrink-0 text-right tabular-nums font-medium">{sign === '-' ? '−' : sign === '+' ? '+' : ''}{money(value).replace('-', '')}</span>
    </div>
  );
}

const pillBase = 'rounded-full px-4 py-1.5 text-sm font-semibold transition active:scale-95 disabled:opacity-60';
const pillOn = 'bg-pink-500 text-white shadow-sm';
const pillOff = 'bg-black/5 text-[var(--admin-muted)] hover:bg-black/10';

type PayType = 'transferencia' | 'boleta_honorarios';
type PayMode = 'liquido' | 'bruto';

/** Dos pills excluyentes (forma de pago, líquido/bruto). */
function PillChoice<T extends string>({ value, onChange, options, disabled }: { value: T; onChange: (v: T) => void; options: { v: T; l: string }[]; disabled?: boolean }) {
  return (
    <div className="inline-flex gap-1.5">
      {options.map((o) => (
        <button key={o.v} type="button" disabled={disabled} onClick={() => onChange(o.v)} className={`${pillBase} ${value === o.v ? pillOn : pillOff}`}>{o.l}</button>
      ))}
    </div>
  );
}

const PAY_TYPES = [{ v: 'transferencia' as PayType, l: 'Transferencia' }, { v: 'boleta_honorarios' as PayType, l: 'Boleta de honorarios' }];
const PAY_MODES = [{ v: 'liquido' as PayMode, l: 'El monto es líquido' }, { v: 'bruto' as PayMode, l: 'El monto es bruto' }];

/** Qué pasa con la plata de este turno: boleta, retención, lo que recibe la persona y lo que cuesta. */
function PayLine({ pay }: { pay: any }) {
  if (pay.paymentType !== 'boleta_honorarios') {
    return <p className="text-xs text-[var(--admin-muted)]">Transferencia: la persona recibe {money(pay.net)}. Costo para ti {money(pay.cost)}.</p>;
  }
  return (
    <p className="text-xs text-[var(--admin-muted)]">
      Boleta {money(pay.gross)} · retención {pay.ratePercent}% = {money(pay.retention)} al SII · la persona recibe <strong className="text-foreground">{money(pay.net)}</strong> · costo para ti <strong className="text-foreground">{money(pay.cost)}</strong>
    </p>
  );
}

function TeamEditor() {
  const isDemo = useIsDemo();
  const utils = trpc.useUtils();
  const { data: team } = trpc.finance.staffList.useQuery();
  const [editingId, setEditingId] = useState<number | 'new' | null>(null);
  const [f, setF] = useState({ name: '', role: '', rate: '', phone: '', rut: '', notes: '' });
  const save = trpc.finance.staffSave.useMutation({
    onSuccess: () => { utils.finance.staffList.invalidate(); utils.finance.shiftsList.invalidate(); setEditingId(null); toast.success('Equipo actualizado'); },
    onError: onErr,
  });
  const del = trpc.finance.staffDelete.useMutation({
    onSuccess: (r) => { utils.finance.staffList.invalidate(); utils.finance.shiftsList.invalidate(); toast.success(r.archived ? 'Tiene historial: quedó archivado' : 'Persona eliminada'); },
    onError: onErr,
  });
  const open = (m: any | null) => {
    setEditingId(m ? m.id : 'new');
    setF(m ? { name: m.name, role: m.role ?? '', rate: String(m.defaultRateClp || ''), phone: m.phone ?? '', rut: m.rut ?? '', notes: m.notes ?? '' }
      : { name: '', role: '', rate: '', phone: '', rut: '', notes: '' });
  };
  const submit = () => save.mutate({
    id: editingId === 'new' || editingId == null ? undefined : editingId,
    name: f.name.trim(), role: f.role.trim() || null, defaultRateClp: Math.max(0, Math.round(Number(f.rate) || 0)),
    phone: f.phone.trim() || null, rut: f.rut.trim() || null, notes: f.notes.trim() || null,
  });
  const form = (
    <div className="admin-clay-sm p-3 space-y-2">
      <div className="grid gap-2 sm:grid-cols-3">
        <Input placeholder="Nombre *" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        <Input placeholder="Rol (barra, puerta…)" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })} />
        <Input type="number" inputMode="numeric" placeholder="Tarifa habitual $" value={f.rate} onChange={(e) => setF({ ...f, rate: e.target.value })} />
        <Input placeholder="Teléfono" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
        <Input placeholder="RUT" value={f.rut} onChange={(e) => setF({ ...f, rut: e.target.value })} />
        <Input placeholder="Notas" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />
      </div>
      <div className="flex gap-2">
        <button type="button" disabled={!f.name.trim() || save.isPending || isDemo} onClick={submit} className={`${pillBase} bg-emerald-500 text-white`}>Guardar</button>
        <button type="button" onClick={() => setEditingId(null)} className={`${pillBase} ${pillOff}`}>Cancelar</button>
      </div>
    </div>
  );
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold">Equipo ({(team ?? []).length})</p>
        {editingId !== 'new' && <button type="button" disabled={isDemo} onClick={() => open(null)} className={`${pillBase} ${pillOn}`}>+ Nueva persona</button>}
      </div>
      {editingId === 'new' && form}
      {(team ?? []).length === 0 && editingId !== 'new' && <p className="text-sm text-[var(--admin-muted)]">Todavía no hay nadie en el equipo.</p>}
      {(team ?? []).map((m: any) => editingId === m.id ? <div key={m.id}>{form}</div> : (
        <div key={m.id} className={`admin-clay-sm p-3 flex flex-wrap items-center gap-3 ${m.active ? '' : 'opacity-60'}`}>
          <div className="flex-1 min-w-[10rem]">
            <p className="font-medium">{m.name} {!m.active && <span className="text-xs text-[var(--admin-muted)]">(archivado)</span>}</p>
            <p className="text-xs text-[var(--admin-muted)]">
              {[m.role || 'Sin rol', m.defaultRateClp ? `tarifa ${money(m.defaultRateClp)}` : null, m.phone, m.rut].filter(Boolean).join(' · ')}
            </p>
            {m.notes && <p className="text-xs text-[var(--admin-muted)]">{m.notes}</p>}
          </div>
          <button type="button" disabled={isDemo} onClick={() => open(m)} className={`${pillBase} ${pillOff}`}>Editar</button>
          <button type="button" disabled={isDemo || save.isPending} onClick={() => save.mutate({ id: m.id, name: m.name, role: m.role, defaultRateClp: m.defaultRateClp, phone: m.phone, rut: m.rut, notes: m.notes, active: !m.active })} className={`${pillBase} ${pillOff}`}>{m.active ? 'Archivar' : 'Reactivar'}</button>
          <button type="button" disabled={isDemo || del.isPending} aria-label={`Eliminar a ${m.name}`}
            onClick={() => { if (window.confirm(`¿Eliminar a ${m.name}? Si ya tiene pagos registrados quedará archivado.`)) del.mutate({ id: m.id }); }}
            className="p-2 rounded-full hover:bg-black/5"><Trash2 className="w-4 h-4" /></button>
        </div>
      ))}
    </div>
  );
}

function StaffPanel({ eventId, report }: { eventId: number; report: any }) {
  const utils = trpc.useUtils();
  const isDemo = useIsDemo();
  const { data: catalog } = trpc.finance.staffList.useQuery();
  const { data: sh } = trpc.finance.shiftsList.useQuery({ eventId });
  const [staffId, setStaffId] = useState<string>('');
  const [amount, setAmount] = useState('');
  const [payType, setPayType] = useState<PayType>('transferencia');
  const [payMode, setPayMode] = useState<PayMode>('liquido');

  const refresh = () => { utils.finance.shiftsList.invalidate(); utils.finance.eventReport.invalidate(); utils.finance.payables.invalidate(); utils.cajaReports.eventPnl.invalidate(); };
  const addShift = trpc.finance.shiftAdd.useMutation({ onSuccess: () => { refresh(); setStaffId(''); setAmount(''); }, onError: onErr });
  const updShift = trpc.finance.shiftUpdate.useMutation({ onSuccess: refresh, onError: onErr });
  const delShift = trpc.finance.shiftRemove.useMutation({ onSuccess: refresh, onError: onErr });

  const shifts: any[] = sh?.shifts ?? [];
  const totals = sh?.totals ?? { gross: 0, retention: 0, net: 0, cost: 0 };
  const active = (catalog ?? []).filter((s: any) => s.active);
  const assigned = new Set(shifts.map((s) => s.staffId));
  const unpaid = shifts.filter((x) => !x.paid).reduce((s, x) => s + x.pay.net, 0);
  const boletaGross = shifts.filter((x) => x.paymentType === 'boleta_honorarios').reduce((s, x) => s + x.pay.gross, 0);

  return (
    <Card className="admin-clay border-0">
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Users className="w-5 h-5" /> Staff de la noche</CardTitle>
        <p className="text-sm text-[var(--admin-muted)]">
          Lo que cuesta el equipo entra solo al resultado del evento. Retención de honorarios {sh?.ratePercent ?? '—'}% (año {sh?.year ?? '—'}).
          {report?.pnl?.warnings?.some((w: string) => w.includes('Staff')) && ' Ojo: revisa el aviso de doble conteo de arriba.'}
        </p>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            ['A transferir a las personas', totals.net, `Por pagar ahora: ${money(unpaid)}`],
            ['Boletas de honorarios (bruto)', boletaGross, 'Lo que dicen las boletas'],
            ['Retención al SII', totals.retention, 'Se declara y paga en el F29'],
            ['Costo total del staff', totals.cost, 'Lo que entra al resultado'],
          ].map(([label, value, hint]) => (
            <div key={label as string} className="admin-clay-sm p-3">
              <p className="text-xs text-[var(--admin-muted)]">{label}</p>
              <p className="font-heading text-xl tabular-nums">{money(value as number)}</p>
              <p className="text-[11px] text-[var(--admin-muted)]">{hint}</p>
            </div>
          ))}
        </div>

        <div className="space-y-2">
          {shifts.length === 0 && <EmptyState icon={Users} title="Nadie asignado todavía" description="Agrega al equipo de esta noche y cuánto se le paga." />}
          {shifts.map((s) => (
            <div key={s.id} className="admin-clay-sm p-3 space-y-2">
              <div className="flex flex-wrap items-center gap-3">
                <div className="min-w-[8rem] flex-1">
                  <p className="font-medium">{s.name}</p>
                  <p className="text-xs text-[var(--admin-muted)]">{s.role || 'Sin rol'}</p>
                </div>
                <Input
                  key={`${s.id}-${s.amountClp}`} type="number" inputMode="numeric" className="w-28" defaultValue={s.amountClp} disabled={isDemo}
                  aria-label={`Monto pactado con ${s.name}`}
                  onBlur={(e) => { const v = Math.max(0, Math.round(Number(e.target.value) || 0)); if (v !== s.amountClp) updShift.mutate({ id: s.id, amountClp: v }); }}
                />
                <button type="button" disabled={isDemo}
                  className={`rounded-full px-5 py-2 text-sm font-semibold text-white shadow-sm transition active:scale-95 disabled:opacity-60 ${s.paid ? 'bg-emerald-500 hover:bg-emerald-600' : 'bg-pink-500 hover:bg-pink-600'}`}
                  onClick={() => updShift.mutate({ id: s.id, paid: !s.paid })}>
                  {s.paid ? '✓ Pagado' : 'Marcar pagado'}
                </button>
                <button type="button" disabled={isDemo} aria-label={`Quitar a ${s.name}`} className="p-2 rounded-full hover:bg-black/5"
                  onClick={() => { if (window.confirm(`¿Quitar a ${s.name} de este evento?`)) delShift.mutate({ id: s.id }); }}>
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <PillChoice value={s.paymentType as PayType} options={PAY_TYPES} disabled={isDemo} onChange={(v) => updShift.mutate({ id: s.id, paymentType: v })} />
                {s.paymentType === 'boleta_honorarios' && (
                  <PillChoice value={s.amountMode as PayMode} options={PAY_MODES} disabled={isDemo} onChange={(v) => updShift.mutate({ id: s.id, amountMode: v })} />
                )}
              </div>
              <PayLine pay={s.pay} />
            </div>
          ))}
        </div>

        <div className="pt-3 border-t border-black/5 space-y-2">
          <p className="text-xs text-[var(--admin-muted)]">Agregar al evento</p>
          <div className="flex flex-wrap items-center gap-2">
            <div className="min-w-[12rem] flex-1">
              <Select value={staffId} onValueChange={(v) => { setStaffId(v); const m = active.find((x: any) => String(x.id) === v); if (m && !amount) setAmount(String(m.defaultRateClp || '')); }}>
                <SelectTrigger><SelectValue placeholder="Elige una persona" /></SelectTrigger>
                <SelectContent>
                  {active.filter((m: any) => !assigned.has(m.id)).map((m: any) => (
                    <SelectItem key={m.id} value={String(m.id)}>{m.name}{m.role ? ` · ${m.role}` : ''}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Input type="number" inputMode="numeric" placeholder="Monto $" className="w-28" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <PillChoice value={payType} options={PAY_TYPES} onChange={setPayType} />
            {payType === 'boleta_honorarios' && <PillChoice value={payMode} options={PAY_MODES} onChange={setPayMode} />}
            <button type="button" disabled={isDemo || !staffId || addShift.isPending} title={isDemo ? DEMO_TOOLTIP : undefined}
              className={`${pillBase} ${pillOn} px-6 py-2`}
              onClick={() => addShift.mutate({ eventId, staffId: Number(staffId), amountClp: Math.round(Number(amount) || 0), paymentType: payType, amountMode: payMode })}>
              <Plus className="w-4 h-4 inline mr-1" /> Agregar
            </button>
          </div>
          {payType === 'boleta_honorarios' && Number(amount) > 0 && (
            <PayLine pay={honorariosPreview(Number(amount), payMode, sh?.year)} />
          )}
        </div>

        <TeamEditor />
      </CardContent>
    </Card>
  );
}

/** Cuánto de lo cobrado NO es tuyo (IVA neto, PPM, retención) y cuánta plata queda libre. */
function TaxReserveCard({ tax }: { tax: any }) {
  if (!tax) return null;
  if (!tax.applies) {
    return (
      <Card className="admin-clay border-0">
        <CardContent className="pt-6 text-sm text-[var(--admin-muted)]">
          Este evento no va en tu F29 ({tax.issuer === 'tercero' ? 'lo factura otro' : tax.issuer === 'exento' ? 'exento' : 'por revisar'}{tax.note ? `: ${tax.note}` : ''}), así que no hay IVA que apartar aquí.
          {tax.issuer === 'por_revisar' && ' Define quién lo factura en Eventos para calcularlo.'}
        </CardContent>
      </Card>
    );
  }
  const rows: [string, number | null, string, boolean?][] = [
    ['IVA cobrado en las ventas', tax.debito, `${tax.ivaPercentOfGross}% de lo cobrado: es del SII, no tuyo`],
    ['− IVA de tus facturas (lo recuperas)', tax.credito, 'Solo facturas cargadas en Gastos con tipo Factura'],
    ['= IVA neto a apartar', tax.ivaNeto, tax.remanente > 0 ? `Te sobra crédito: ${money(tax.remanente)} pasa al mes siguiente` : 'Para el F29', true],
    ['PPM estimado', tax.ppm, tax.ppmConfigured ? 'Sobre las ventas sin IVA' : 'Configura tu tasa en Dinero → SII → Ajustes'],
    ['Retención de honorarios', tax.retencion, 'De las boletas del staff, al SII'],
  ];
  return (
    <Card className="admin-clay border-0">
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Landmark className="w-5 h-5" /> Plata que no es tuya (impuestos)</CardTitle>
        <p className="text-sm text-[var(--admin-muted)]">De lo cobrado, esto va al SII. Apártalo para que el F29 no te tome por sorpresa.</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl bg-pink-500/10 p-4">
            <p className="text-xs text-[var(--admin-muted)]">Total a apartar</p>
            <p className="font-heading text-3xl tabular-nums text-pink-700">{money(tax.totalApartar)}</p>
            <p className="text-xs text-[var(--admin-muted)]">IVA neto + PPM + retención</p>
          </div>
          <div className="rounded-2xl bg-emerald-500/10 p-4">
            <p className="text-xs text-[var(--admin-muted)]">Plata libre de impuestos</p>
            <p className="font-heading text-3xl tabular-nums text-emerald-700">{money(tax.platLibre)}</p>
            <p className="text-xs text-[var(--admin-muted)]">Lo cobrado menos lo que va al SII (aún sin descontar tus costos)</p>
          </div>
        </div>
        {tax.channels && (
          <div className="grid gap-3 sm:grid-cols-2">
            {([['Ventas web', tax.channels.web], ['Barra y caja', tax.channels.caja]] as const).map(([label, c]) => (
              <div key={label} className="admin-clay-sm p-3 text-sm">
                <p className="text-xs text-[var(--admin-muted)]">{label}</p>
                <p className="font-heading text-lg tabular-nums">{money(c.gross)} <span className="text-xs font-normal text-[var(--admin-muted)]">con IVA</span></p>
                <p className="text-xs text-[var(--admin-muted)]">Neto sin IVA <strong>{money(c.net)}</strong> · IVA <strong>{money(c.iva)}</strong></p>
              </div>
            ))}
          </div>
        )}
        <div className="space-y-1.5">
          {rows.map(([label, value, hint, strong]) => (
            <div key={label} className={`flex items-start justify-between gap-3 text-sm ${strong ? 'font-semibold border-t border-black/5 pt-1.5' : ''}`}>
              <div><p>{label}</p><p className="text-xs font-normal text-[var(--admin-muted)]">{hint}</p></div>
              <span className="tabular-nums shrink-0">{value === null ? '—' : money(value)}</span>
            </div>
          ))}
        </div>
        {tax.credito > 0 && <p className="text-xs text-emerald-700">Tus facturas te están ahorrando {money(tax.credito)} de IVA en este evento.</p>}
      </CardContent>
    </Card>
  );
}

const DOC_TYPES = [
  { v: 'factura', l: 'Factura' }, { v: 'boleta', l: 'Boleta' }, { v: 'boleta_honorarios', l: 'Honorarios' }, { v: 'sin_documento', l: 'Sin doc.' },
] as const;
type DocType = typeof DOC_TYPES[number]['v'];
const DOC_LABEL: Record<string, string> = { factura: 'Factura', boleta: 'Boleta', boleta_honorarios: 'Honorarios', sin_documento: 'Sin documento' };

function DocPills({ value, onChange }: { value: DocType; onChange: (v: DocType) => void }) {
  return <PillChoice value={value} onChange={onChange} options={DOC_TYPES.map((d) => ({ v: d.v, l: d.l }))} />;
}

/** Una fila del checklist que todavía no tiene gasto: se carga en el momento. */
function SlotRow({ slot, eventId, eventDate, onSaved }: { slot: any; eventId: number; eventDate: string; onSaved: () => void }) {
  const isDemo = useIsDemo();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [doc, setDoc] = useState<DocType>('factura');
  const [supplier, setSupplier] = useState('');
  const create = trpc.expenses.create.useMutation({ onSuccess: () => { setOpen(false); setAmount(''); setSupplier(''); onSaved(); toast.success(`${slot.label} cargado`); }, onError: onErr });
  return (
    <div className="admin-clay-sm p-3 space-y-2">
      <div className="flex flex-wrap items-center gap-3">
        <span className={`w-2.5 h-2.5 rounded-full ${slot.loaded ? 'bg-emerald-500' : 'bg-pink-400'}`} />
        <div className="flex-1 min-w-[10rem]">
          <p className="font-medium text-sm">{slot.label}</p>
          <p className="text-xs text-[var(--admin-muted)]">{slot.loaded ? `Cargado: ${money(slot.total)}` : slot.hint}</p>
        </div>
        <button type="button" disabled={isDemo} onClick={() => setOpen(!open)}
          className={`${pillBase} ${slot.loaded ? pillOff : pillOn}`}>{slot.loaded ? '+ Agregar otro' : 'Cargar'}</button>
      </div>
      {open && (
        <div className="flex flex-wrap items-center gap-2 pl-5">
          <Input type="number" inputMode="numeric" className="w-32" placeholder="Monto total $" value={amount} onChange={(e) => setAmount(e.target.value)} />
          <Input className="w-44" placeholder="Proveedor (opcional)" value={supplier} onChange={(e) => setSupplier(e.target.value)} />
          <DocPills value={doc} onChange={setDoc} />
          <button type="button" disabled={isDemo || create.isPending || !(Number(amount) > 0)} className={`${pillBase} bg-emerald-500 text-white`}
            onClick={() => create.mutate({
              scope: 'evento', eventId, expenseDate: eventDate, category: slot.category as any, description: slot.label,
              supplier: supplier.trim() || undefined, documentType: doc, amountTotal: Math.round(Number(amount)),
              paymentMethod: 'transferencia', slotKey: slot.key,
            })}>Guardar</button>
          {doc === 'factura' && Number(amount) > 0 && <span className="text-xs text-emerald-700">Recuperas {money(Math.round(Number(amount) * 19 / 119))} de IVA</span>}
          {(doc === 'boleta' || doc === 'sin_documento') && Number(amount) > 0 && <span className="text-xs text-amber-700">Sin factura: pierdes {money(Math.round(Number(amount) * 19 / 119))} de IVA</span>}
        </div>
      )}
    </div>
  );
}

/** Gasto suelto con foto: la foto se lee sola (mismo escáner que /gastos). */
function QuickExpense({ eventId, eventDate, onSaved }: { eventId: number; eventDate: string; onSaved: () => void }) {
  const isDemo = useIsDemo();
  const [f, setF] = useState({ description: '', category: 'otros', amount: '', supplier: '', rut: '', doc: 'factura' as DocType, receiptUrl: '' });
  const scan = trpc.expenses.scanReceipt.useMutation({
    onSuccess: (r: any) => {
      if (!r.isReceipt) { toast.error('No pudimos leer la foto como boleta o factura: completa a mano.'); return; }
      setF((x) => ({
        ...x,
        amount: r.amountTotal ? String(r.amountTotal) : x.amount,
        category: r.category || x.category,
        doc: (r.documentType as DocType) || x.doc,
        description: r.description || x.description,
        supplier: r.supplier || x.supplier,
        rut: r.supplierRut || x.rut,
      }));
      if (r.confidence !== 'alta' || r.notes) toast.warning(r.notes || 'Revisa los datos leídos antes de guardar.');
      else toast.success('Leída: revisa y guarda.');
    },
    onError: onErr,
  });
  const create = trpc.expenses.create.useMutation({
    onSuccess: () => { setF({ description: '', category: 'otros', amount: '', supplier: '', rut: '', doc: 'factura', receiptUrl: '' }); onSaved(); toast.success('Gasto agregado'); },
    onError: onErr,
  });
  return (
    <div className="admin-clay-sm p-3 space-y-2">
      <p className="text-sm font-semibold">Agregar otra compra o gasto</p>
      <CameraCaptureField label="Sacar foto a la boleta o factura" pathPrefix="expenses" analyzing={scan.isPending}
        onScanned={(url) => { setF((x) => ({ ...x, receiptUrl: url })); scan.mutate({ imageUrl: url }); }} />
      <div className="grid gap-2 sm:grid-cols-3">
        <Input placeholder="Descripción *" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
        <Select value={f.category} onValueChange={(v) => setF({ ...f, category: v })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>{EXPENSE_CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.emoji} {c.label}</SelectItem>)}</SelectContent>
        </Select>
        <Input type="number" inputMode="numeric" placeholder="Monto total $ *" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} />
        <Input placeholder="Proveedor" value={f.supplier} onChange={(e) => setF({ ...f, supplier: e.target.value })} />
        <Input placeholder="RUT proveedor (para factura)" value={f.rut} onChange={(e) => setF({ ...f, rut: e.target.value })} />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <DocPills value={f.doc} onChange={(doc) => setF({ ...f, doc })} />
        <button type="button" disabled={isDemo || create.isPending || !f.description.trim() || !(Number(f.amount) > 0)} className={`${pillBase} bg-emerald-500 text-white`}
          onClick={() => create.mutate({
            scope: 'evento', eventId, expenseDate: eventDate, category: f.category as any, description: f.description.trim(),
            supplier: f.supplier.trim() || undefined, supplierRut: f.rut.trim() || undefined, documentType: f.doc,
            amountTotal: Math.round(Number(f.amount)), paymentMethod: 'transferencia', receiptUrl: f.receiptUrl || undefined,
          })}>Guardar gasto</button>
        {f.doc === 'factura' && !f.rut.trim() && Number(f.amount) > 0 && <span className="text-xs text-amber-700">Agrega el RUT del proveedor para cuadrar con el SII</span>}
      </div>
    </div>
  );
}

/** Gastos del evento: checklist de costos fijos, gasto rápido con foto y lo ya cargado. */
function EventCostsCard({ eventId, eventDate, costs }: { eventId: number; eventDate: string; costs: any }) {
  const isDemo = useIsDemo();
  const utils = trpc.useUtils();
  const refresh = () => { utils.finance.eventReport.invalidate(); utils.finance.live.invalidate(); utils.cajaReports.eventPnl.invalidate(); };
  const update = trpc.expenses.update.useMutation({ onSuccess: () => { refresh(); toast.success('Gasto actualizado'); }, onError: onErr });
  const del = trpc.expenses.delete.useMutation({ onSuccess: () => { refresh(); toast.success('Gasto borrado'); }, onError: onErr });
  if (!costs) return null;
  const askPassword = () => window.prompt('Por seguridad, ingresa tu clave de admin') || '';
  return (
    <Card className="admin-clay border-0">
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Receipt className="w-5 h-5" /> Gastos del evento</CardTitle>
        <p className="text-sm text-[var(--admin-muted)]">Carga aquí el arriendo y todos los costos: los gráficos, el margen, el IVA a apartar y el F29 se ajustan solos.</p>
      </CardHeader>
      <CardContent className="space-y-4">
        {(!costs.hasVenueRent || costs.total === 0) && (
          <div className="rounded-xl px-4 py-3 text-sm bg-amber-500/15 text-amber-800 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            {costs.total === 0 ? 'Este evento no tiene gastos cargados: el margen y los consejos están inflados.' : 'Falta el arriendo del venue: el margen se ve más alto de lo real.'}
          </div>
        )}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            ['Gastos cargados', costs.total, `${costs.expenses.length} gasto(s)`],
            ['Con factura', costs.conFacturaTotal, `Recuperas ${money(costs.ivaRecuperado)} de IVA`],
            ['Con boleta o sin documento', costs.sinFacturaTotal, costs.ivaPerdido > 0 ? `Pierdes ${money(costs.ivaPerdido)} de IVA` : 'Nada perdido'],
            ['Costos fijos pendientes', costs.pendingSlots.length, 'del checklist'],
          ].map(([label, value, hint], i) => (
            <div key={label as string} className="admin-clay-sm p-3">
              <p className="text-xs text-[var(--admin-muted)]">{label}</p>
              <p className="font-heading text-xl tabular-nums">{i === 3 ? value : money(value as number)}</p>
              <p className={`text-[11px] ${i === 2 && costs.ivaPerdido > 0 ? 'text-amber-700' : 'text-[var(--admin-muted)]'}`}>{hint}</p>
            </div>
          ))}
        </div>

        <div className="space-y-2">
          <p className="text-sm font-semibold">Checklist de costos fijos</p>
          {costs.slots.map((slot: any) => <SlotRow key={slot.key} slot={slot} eventId={eventId} eventDate={eventDate} onSaved={refresh} />)}
        </div>

        <QuickExpense eventId={eventId} eventDate={eventDate} onSaved={refresh} />

        {costs.expenses.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-semibold">Lo que ya cargaste</p>
            {costs.expenses.map((e: any) => (
              <div key={e.id} className="admin-clay-sm p-3 flex flex-wrap items-center gap-3 text-sm">
                <div className="flex-1 min-w-[10rem]">
                  <p className="font-medium">{e.description}{e.excludeFromPnl ? ' (excluido del P&L)' : ''}</p>
                  <p className="text-xs text-[var(--admin-muted)]">{e.supplier ?? 'Sin proveedor'}{e.supplierRut ? ` · ${e.supplierRut}` : ''}{e.receiptUrl ? '' : ' · sin foto'}</p>
                </div>
                <select disabled={isDemo} value={e.documentType} aria-label="Tipo de documento"
                  className={`rounded-full px-3 py-1.5 text-xs font-semibold border-0 ${e.documentType === 'factura' ? 'bg-emerald-500/15 text-emerald-800' : 'bg-amber-500/15 text-amber-800'}`}
                  onChange={(ev) => { const pw = askPassword(); if (pw) update.mutate({ id: e.id, documentType: ev.target.value as any, adminPassword: pw } as any); }}>
                  {DOC_TYPES.map((d) => <option key={d.v} value={d.v}>{DOC_LABEL[d.v]}</option>)}
                </select>
                <strong className="tabular-nums">{money(e.amountTotal)}</strong>
                {e.receiptUrl && <a href={e.receiptUrl} target="_blank" rel="noopener noreferrer" className="text-xs underline">foto</a>}
                <button type="button" disabled={isDemo} className="p-2 rounded-full hover:bg-black/5" aria-label={`Editar monto de ${e.description}`}
                  onClick={() => { const v = window.prompt('Nuevo monto total', String(e.amountTotal)); if (!v) return; const pw = askPassword(); if (pw) update.mutate({ id: e.id, amountTotal: Math.max(1, Math.round(Number(v) || 0)), adminPassword: pw } as any); }}>
                  <Pencil className="w-4 h-4" />
                </button>
                <button type="button" disabled={isDemo} className="p-2 rounded-full hover:bg-black/5" aria-label={`Borrar ${e.description}`}
                  onClick={() => { if (!window.confirm(`¿Borrar "${e.description}"?`)) return; const pw = askPassword(); if (pw) del.mutate({ id: e.id, adminPassword: pw } as any); }}>
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

const MOVEMENT_LABEL: Record<string, string> = { retiro_dueno: 'retiro mío', gasto_empresa: 'gasto de la empresa', gasto_evento: 'gasto de un evento', traspaso: 'traspaso', comision: 'comisión' };
const ACCOUNT_LABEL: Record<string, string> = { mercadopago: 'Mercado Pago', banco: 'Banco', efectivo: 'Efectivo' };
const chileMonthNow = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago', year: 'numeric', month: '2-digit' }).format(new Date()).slice(0, 7);
const todayIso = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

/** Un movimiento por clasificar: se decide qué fue con un toque. */
function PendingMovement({ m, events, onDone }: { m: any; events: any[]; onDone: () => void }) {
  const isDemo = useIsDemo();
  const [mode, setMode] = useState<'gasto_evento' | 'gasto_empresa' | null>(null);
  const [eventId, setEventId] = useState('');
  const [category, setCategory] = useState('otros');
  const [doc, setDoc] = useState<DocType>('sin_documento');
  const classify = trpc.cash.classify.useMutation({ onSuccess: () => { onDone(); toast.success('Clasificado'); }, onError: onErr });
  const go = (classification: any, extra: any = {}) => classify.mutate({ id: m.id, classification, ...extra });
  const out = m.amount < 0;
  const sug = typeof m.kind === 'string' && m.kind.startsWith('sug:') ? m.kind.slice(4) : null;
  const tone = (c: string) => (sug === c ? pillOn : pillOff);
  return (
    <div className="admin-clay-sm p-3 space-y-2">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span className="text-xs rounded-full bg-black/5 px-2 py-0.5">{ACCOUNT_LABEL[m.source]}</span>
        <span className="text-[var(--admin-muted)] w-24">{formatChileShortDate(m.date)}</span>
        <span className="flex-1 min-w-[10rem] truncate">{m.description}{sug ? <span className="text-xs text-pink-600"> · sugerido: {MOVEMENT_LABEL[sug] ?? sug}</span> : null}</span>
        <strong className={`tabular-nums ${out ? 'text-red-600' : 'text-emerald-700'}`}>{money(m.amount)}</strong>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {out && <button type="button" disabled={isDemo || classify.isPending} className={`${pillBase} ${tone('retiro_dueno')}`} onClick={() => go('retiro_dueno')}>Retiro mío</button>}
        <button type="button" disabled={isDemo || classify.isPending} className={`${pillBase} ${pillOff}`} onClick={() => go('traspaso')}>Traspaso entre mis cuentas</button>
        {out && <button type="button" disabled={isDemo} className={`${pillBase} ${mode === 'gasto_evento' ? pillOn : pillOff}`} onClick={() => setMode(mode === 'gasto_evento' ? null : 'gasto_evento')}>Gasto de un evento</button>}
        {out && <button type="button" disabled={isDemo} className={`${pillBase} ${mode === 'gasto_empresa' || (!mode && sug === 'gasto_empresa') ? pillOn : pillOff}`} onClick={() => setMode(mode === 'gasto_empresa' ? null : 'gasto_empresa')}>Gasto de la empresa</button>}
        {out && <button type="button" disabled={isDemo || classify.isPending} className={`${pillBase} ${pillOff}`} onClick={() => go('comision')}>Comisión</button>}
        {!out && <button type="button" disabled={isDemo || classify.isPending} className={`${pillBase} ${pillOff}`} onClick={() => go('venta')}>Venta / ingreso</button>}
        <button type="button" disabled={isDemo || classify.isPending} className={`${pillBase} ${pillOff}`} onClick={() => go('otro')}>Otro</button>
      </div>
      {mode && (
        <div className="flex flex-wrap items-center gap-2">
          {mode === 'gasto_evento' && (
            <div className="min-w-[12rem]">
              <Select value={eventId} onValueChange={setEventId}>
                <SelectTrigger><SelectValue placeholder="¿De qué evento?" /></SelectTrigger>
                <SelectContent>{events.map((e: any) => <SelectItem key={e.id} value={String(e.id)}>{e.title}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          )}
          <div className="min-w-[10rem]">
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{EXPENSE_CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.emoji} {c.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <DocPills value={doc} onChange={setDoc} />
          <button type="button" disabled={isDemo || classify.isPending || (mode === 'gasto_evento' && !eventId)} className={`${pillBase} bg-emerald-500 text-white`}
            onClick={() => go(mode, { eventId: mode === 'gasto_evento' ? Number(eventId) : null, category, documentType: doc })}>Guardar como gasto</button>
        </div>
      )}
    </div>
  );
}

/** Caja real: saldos, lo que se ganó vs. lo que retiraste, movimientos por clasificar y cartola. */
function CashTab() {
  const isDemo = useIsDemo();
  const utils = trpc.useUtils();
  const [monthKey, setMonthKey] = useState(chileMonthNow());
  const { data, isLoading, isError, error } = trpc.cash.summary.useQuery({ monthKey });
  const { data: rec } = trpc.cash.reconcileMercadoPago.useQuery();
  const { data: events } = trpc.events.listAll.useQuery();
  const refresh = () => { utils.cash.invalidate(); };
  const sync = trpc.cash.syncMercadoPago.useMutation({
    onSuccess: (r: any) => { refresh(); r.errors?.length ? toast.warning(`Mercado Pago: ${r.errors.join(' · ')}`) : toast.success(`Mercado Pago: ${r.payments} cobros y ${r.movements} movimientos. Reporte: ${r.reportStatus}`); },
    onError: onErr,
  });
  const [w, setW] = useState({ date: todayIso(), amount: '', account: 'mercadopago' as 'mercadopago' | 'banco' | 'efectivo', note: '' });
  const addW = trpc.cash.addWithdrawal.useMutation({ onSuccess: () => { refresh(); setW({ ...w, amount: '', note: '' }); toast.success('Retiro registrado'); }, onError: onErr });
  const delW = trpc.cash.deleteWithdrawal.useMutation({ onSuccess: refresh, onError: onErr });
  const setBal = trpc.cash.setBalance.useMutation({ onSuccess: () => { refresh(); toast.success('Saldo actualizado'); }, onError: onErr });
  const [statement, setStatement] = useState<{ text: string; preview: any } | null>(null);
  const imp = trpc.cash.importStatement.useMutation({ onError: onErr });

  const months = useMemo(() => { const out: string[] = []; let m = chileMonthNow(); for (let i = 0; i < 12; i++) { out.push(m); const [y, mm] = m.split('-').map(Number); m = mm === 1 ? `${y - 1}-12` : `${y}-${String(mm - 1).padStart(2, '0')}`; } return out; }, []);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > 2_500_000) { toast.error('El archivo es muy grande (máx. 2,5 MB).'); return; }
    if (/\.(xlsx?|xls)$/i.test(file.name)) { toast.error('Guarda la cartola como CSV desde Excel (Archivo → Guardar como → CSV) y súbela de nuevo.'); return; }
    const text = await file.text();
    imp.mutate({ text, preview: true }, { onSuccess: (r) => setStatement({ text, preview: r }) });
  };

  if (isLoading) return <div className="py-10 flex justify-center"><Loader2 className="w-6 h-6 animate-spin" /></div>;
  if (isError || !data) return <p className="text-sm text-destructive">No se pudo cargar: {error?.message}</p>;
  const pos = data.position;
  const bal = (src: 'mercadopago' | 'banco') => data.balances.find((b: any) => b.source === src);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Select value={monthKey} onValueChange={setMonthKey}>
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent>{months.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
        </Select>
        <button type="button" disabled={isDemo || sync.isPending} onClick={() => sync.mutate()} className={`${pillBase} ${pillOn} px-5 py-2`}>
          {sync.isPending ? <Loader2 className="w-4 h-4 inline animate-spin mr-1" /> : null} Actualizar Mercado Pago
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {(['mercadopago', 'banco'] as const).map((src) => {
          const b = bal(src);
          return (
            <div key={src} className="admin-clay-sm p-4 space-y-1">
              <p className="text-xs text-[var(--admin-muted)]">Saldo {ACCOUNT_LABEL[src]}</p>
              <p className="font-heading text-2xl tabular-nums">{b ? money(b.balance) : '—'}</p>
              <p className="text-[11px] text-[var(--admin-muted)]">{b ? `${formatChileShortDate(b.asOf)} · ${b.origin === 'api' ? 'automático' : b.origin === 'cartola' ? 'de la cartola' : 'anotado a mano'}` : 'Sin dato todavía'}</p>
              <button type="button" disabled={isDemo} className="text-xs underline" onClick={() => { const v = window.prompt(`Saldo actual en ${ACCOUNT_LABEL[src]}`); if (v) setBal.mutate({ source: src, balance: Math.round(Number(v.replace(/[^0-9-]/g, '')) || 0) }); }}>Anotar a mano</button>
            </div>
          );
        })}
        <div className="admin-clay-sm p-4">
          <p className="text-xs text-[var(--admin-muted)]">Ganancia de los eventos del mes</p>
          <p className="font-heading text-2xl tabular-nums">{money(pos.monthProfit)}</p>
          <p className="text-[11px] text-[var(--admin-muted)]">Retiraste {money(pos.monthWithdrawals)}</p>
        </div>
        <div className={`rounded-2xl p-4 ${pos.leftInCompany < 0 ? 'bg-red-500/10' : 'bg-emerald-500/10'}`}>
          <p className="text-xs text-[var(--admin-muted)]">Quedó en la empresa este mes</p>
          <p className={`font-heading text-2xl tabular-nums ${pos.leftInCompany < 0 ? 'text-red-700' : 'text-emerald-700'}`}>{money(pos.leftInCompany)}</p>
          <p className="text-[11px] text-[var(--admin-muted)]">{pos.withdrawalsOverProfit ? 'Retiraste más de lo que ganaste: estás usando plata de otros meses (o el IVA).' : 'Ganancia menos tus retiros'}</p>
        </div>
      </div>

      <Card className="admin-clay border-0">
        <CardHeader><CardTitle>Mis retiros (plata para vivir)</CardTitle><p className="text-sm text-[var(--admin-muted)]">No son gastos de ningún evento: no bajan la ganancia, pero sí salen de la caja.</p></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Input type="date" className="w-40" value={w.date} onChange={(e) => setW({ ...w, date: e.target.value })} />
            <Input type="number" inputMode="numeric" className="w-32" placeholder="Monto $" value={w.amount} onChange={(e) => setW({ ...w, amount: e.target.value })} />
            <PillChoice value={w.account} onChange={(account) => setW({ ...w, account })} options={[{ v: 'mercadopago', l: 'Mercado Pago' }, { v: 'banco', l: 'Banco' }, { v: 'efectivo', l: 'Efectivo' }]} />
            <Input className="w-48" placeholder="Nota (opcional)" value={w.note} onChange={(e) => setW({ ...w, note: e.target.value })} />
            <button type="button" disabled={isDemo || addW.isPending || !(Number(w.amount) > 0)} className={`${pillBase} bg-emerald-500 text-white`}
              onClick={() => addW.mutate({ date: `${w.date}T12:00:00-03:00`, amount: Math.round(Number(w.amount)), account: w.account, note: w.note || null })}>Registrar retiro</button>
          </div>
          {data.withdrawals.length === 0 && <p className="text-sm text-[var(--admin-muted)]">Todavía no registras retiros.</p>}
          {data.withdrawals.map((x: any) => (
            <div key={x.id} className="admin-clay-sm px-3 py-2 flex flex-wrap items-center gap-3 text-sm">
              <span className="w-24 text-[var(--admin-muted)]">{formatChileShortDate(x.date)}</span>
              <span className="text-xs rounded-full bg-black/5 px-2 py-0.5">{ACCOUNT_LABEL[x.account]}</span>
              <span className="flex-1 min-w-[8rem] truncate">{x.note ?? ''}</span>
              <strong className="tabular-nums">{money(x.amount)}</strong>
              <button type="button" disabled={isDemo} className="p-2 rounded-full hover:bg-black/5" aria-label="Borrar retiro" onClick={() => { if (window.confirm('¿Borrar este retiro?')) delW.mutate({ id: x.id }); }}><Trash2 className="w-4 h-4" /></button>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="admin-clay border-0">
        <CardHeader><CardTitle>Movimientos por clasificar ({data.pending.length})</CardTitle><p className="text-sm text-[var(--admin-muted)]">De Mercado Pago y de tu cartola: dime qué fue cada uno y queda contabilizado.</p></CardHeader>
        <CardContent className="space-y-2">
          {data.pending.length === 0 && <p className="text-sm text-[var(--admin-muted)]">Nada pendiente ✓</p>}
          {data.pending.map((m: any) => <PendingMovement key={m.id} m={m} events={events ?? []} onDone={() => { refresh(); utils.finance.eventReport.invalidate(); }} />)}
        </CardContent>
      </Card>

      <Card className="admin-clay border-0">
        <CardHeader><CardTitle>Subir estado de cuenta (Mercado Pago o banco)</CardTitle><p className="text-sm text-[var(--admin-muted)]">Sube el CSV del estado de cuenta de Mercado Pago o la cartola del banco: se detecta solo, se leen los movimientos y el saldo. Volver a subir el mismo archivo no duplica nada.</p></CardHeader>
        <CardContent className="space-y-3">
          <input type="file" accept=".csv,text/csv,.txt" disabled={isDemo || imp.isPending} onChange={(e) => onFile(e.target.files?.[0])} className="text-sm" />
          {statement?.preview?.error && <p className="text-sm text-red-600">{statement.preview.error}</p>}
          {statement?.preview && !statement.preview.error && (
            <div className="space-y-2">
              <p className="text-sm">{statement.preview.format === 'mercadopago' ? 'Estado de cuenta de Mercado Pago' : 'Cartola del banco'}: <strong>{statement.preview.movements.length}</strong> movimientos{statement.preview.skipped ? ` (salté ${statement.preview.skipped} filas sin fecha o monto)` : ''}.</p>
              {statement.preview.totals && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs admin-clay-sm p-3">
                  <p>Ventas liberadas <strong className="block text-sm tabular-nums">{money(statement.preview.totals.ventasBrutas)}</strong></p>
                  <p>Comisiones Mercado Pago <strong className="block text-sm tabular-nums">{money(statement.preview.totals.comisiones)}</strong>{statement.preview.feePercent != null ? ` (${statement.preview.feePercent}%)` : ''}</p>
                  <p>Transferencias enviadas <strong className="block text-sm tabular-nums">{money(statement.preview.totals.transferenciasEnviadas)}</strong></p>
                  <p>Pagos con Mercado Pago <strong className="block text-sm tabular-nums">{money(statement.preview.totals.pagos)}</strong></p>
                  <p>Retiros <strong className="block text-sm tabular-nums">{money(statement.preview.totals.retiros)}</strong></p>
                  <p>Transferencias recibidas <strong className="block text-sm tabular-nums">{money(statement.preview.totals.transferenciasRecibidas)}</strong></p>
                  <p>Rentabilidad <strong className="block text-sm tabular-nums">{money(statement.preview.totals.rentabilidad)}</strong></p>
                  <p>Saldo final <strong className="block text-sm tabular-nums">{statement.preview.finalBalance != null ? money(statement.preview.finalBalance) : '—'}</strong></p>
                </div>
              )}
              <div className="max-h-64 overflow-y-auto space-y-1">
                {statement.preview.movements.slice(0, 30).map((m: any) => (
                  <div key={m.externalId} className="flex gap-3 text-xs">
                    <span className="w-20">{m.date}</span><span className="flex-1 truncate">{m.description}</span>
                    <span className={`tabular-nums ${m.amount < 0 ? 'text-red-600' : 'text-emerald-700'}`}>{money(m.amount)}</span>
                  </div>
                ))}
              </div>
              <button type="button" disabled={isDemo || imp.isPending} className={`${pillBase} bg-emerald-500 text-white`}
                onClick={() => imp.mutate({ text: statement.text, preview: false }, { onSuccess: (r: any) => { setStatement(null); refresh(); toast.success(`Importados ${r.imported} movimientos nuevos`); } })}>
                Importar {statement.preview.movements.length} movimientos
              </button>
            </div>
          )}
        </CardContent>
      </Card>

      {rec && (
        <Card className="admin-clay border-0">
          <CardHeader><CardTitle>Cuadratura con Mercado Pago (últimos {rec.days} días)</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            {rec.count === 0 ? <p className="text-[var(--admin-muted)]">Aún no hay cobros sincronizados. Toca "Actualizar Mercado Pago".</p> : (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <p>Cobros <strong className="block tabular-nums">{rec.count}</strong></p>
                  <p>Bruto <strong className="block tabular-nums">{money(rec.gross)}</strong></p>
                  <p>Comisiones reales <strong className="block tabular-nums">{money(rec.fees)}</strong></p>
                  <p>Neto recibido <strong className="block tabular-nums">{money(rec.net)}</strong></p>
                </div>
                {rec.notInSystemCount > 0 ? (
                  <div className="rounded-xl px-4 py-3 bg-amber-500/15 text-amber-800">
                    {rec.notInSystemCount} cobro(s) en Mercado Pago que no calzan con ninguna venta del sistema (por ejemplo, cobros hechos con link de pago o en otra plataforma).
                    <ul className="mt-1 text-xs">{rec.notInSystem.map((p: any) => <li key={p.id}>{formatChileShortDate(p.date)} · {money(p.amount)} · {p.description}</li>)}</ul>
                  </div>
                ) : <p className="text-emerald-700">Todos los cobros calzan con ventas del sistema ✓</p>}
              </>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

const RANGES = [{ v: 30, l: '30 min' }, { v: 60, l: '1 hora' }, { v: 120, l: '2 horas' }, { v: 240, l: '4 horas' }];
const ALERT_TONE: Record<string, string> = { danger: 'bg-red-500/10 text-red-700', warning: 'bg-amber-500/15 text-amber-800', info: 'bg-sky-500/10 text-sky-800' };

/** Movimiento de plata minuto a minuto. Se refresca cada 15 s mientras la pestaña está abierta. */
function LiveTab({ eventId }: { eventId: number }) {
  const [win, setWin] = useState(60);
  const { data, isLoading, isError, error, dataUpdatedAt } = trpc.finance.live.useQuery(
    { eventId, windowMinutes: win }, { refetchInterval: 15_000, refetchIntervalInBackground: false },
  );
  if (isLoading) return <div className="py-10 flex justify-center"><Loader2 className="w-6 h-6 animate-spin" /></div>;
  if (isError || !data) return <p className="text-sm text-destructive">No se pudo cargar el en vivo: {error?.message}</p>;
  const minuteData = data.perMinute.map((m: any) => ({ t: formatChileTime(m.at), monto: m.amount, ventas: m.count }));
  const hourData = data.perHour.map((h: any) => ({ t: formatChileTime(h.at), monto: h.amount }));
  const tickEvery = Math.max(1, Math.floor(minuteData.length / 6));
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className="inline-flex items-center gap-2">
          <span className={`w-2.5 h-2.5 rounded-full ${data.isLive ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`} />
          {data.isLive ? 'Evento en curso' : 'Fuera del horario del evento'} · actualizado {formatChileTime(new Date(dataUpdatedAt))}
        </span>
        <div className="flex gap-1">
          {RANGES.map((r) => (
            <Button key={r.v} size="sm" variant={win === r.v ? 'default' : 'outline'} onClick={() => setWin(r.v)}>{r.l}</Button>
          ))}
        </div>
      </div>

      {data.alerts.length > 0 && (
        <div className="space-y-2">
          {data.alerts.map((a: any, i: number) => (
            <div key={i} className={`rounded-xl px-4 py-2.5 text-sm flex items-start gap-2 ${ALERT_TONE[a.level]}`}>
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" /> {a.text}
            </div>
          ))}
        </div>
      )}

      <BentoGrid>
        <BentoTile><StatTile icon={Banknote} tone="revenue" value={money(data.totals.gross)} label={`Entró en total (${data.totals.sales} ventas)`} /></BentoTile>
        <BentoTile><StatTile icon={Activity} tone="count" value={money(data.pace.last5)} label="Últimos 5 minutos" /></BentoTile>
        <BentoTile><StatTile icon={TrendingUp} tone="count" value={money(data.pace.last60)} label="Última hora (ritmo por hora)" /></BentoTile>
        <BentoTile><StatTile icon={Wallet} tone={data.totals.netProfit < 0 ? 'danger' : 'success'} value={money(data.totals.netProfit)} label={data.totals.netProfit < 0 ? 'Pérdida del momento' : 'Ganancia del momento'} /></BentoTile>
      </BentoGrid>

      <TaxReserveCard tax={data.tax} />

      <Card className="admin-clay border-0">
        <CardHeader><CardTitle>Minuto a minuto</CardTitle><p className="text-sm text-[var(--admin-muted)]">Plata que entra en cada minuto (hora de Chile).</p></CardHeader>
        <CardContent>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={minuteData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.08)" />
                <XAxis dataKey="t" fontSize={11} interval={tickEvery - 1} /><YAxis fontSize={11} width={48} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
                <Tooltip formatter={(v: number, n) => (n === 'monto' ? money(v) : v)} />
                <Bar dataKey="monto" fill="#ec4899" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="admin-clay border-0">
          <CardHeader><CardTitle>Hora por hora de la noche</CardTitle></CardHeader>
          <CardContent>
            {hourData.length === 0 ? <EmptyState icon={Wallet} title="Todavía no hay ventas" /> : (
              <div className="h-52">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={hourData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.08)" />
                    <XAxis dataKey="t" fontSize={11} /><YAxis fontSize={11} width={48} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
                    <Tooltip formatter={(v: number) => money(v)} />
                    <Bar dataKey="monto" fill="#38bdf8" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="admin-clay border-0">
          <CardHeader><CardTitle>Últimos movimientos</CardTitle></CardHeader>
          <CardContent>
            {data.feed.length === 0 ? <EmptyState icon={Wallet} title="Sin movimientos todavía" /> : (
              <ul className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
                {data.feed.map((f: any) => (
                  <li key={f.id} className="flex items-center gap-3 text-sm admin-clay-sm px-3 py-2">
                    <span className="tabular-nums text-[var(--admin-muted)] w-12 shrink-0">{formatChileTime(f.at)}</span>
                    <span className="flex-1 min-w-0 truncate">{f.summary || `Orden #${f.id}`} <span className="text-[var(--admin-muted)]">· {f.method}</span></span>
                    <span className="tabular-nums font-semibold shrink-0">{money(f.amount)}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

const MONTHS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

/** Resultado de la empresa mes a mes, incluidos los meses sin evento. */
function CompanyTab() {
  const [year, setYear] = useState(() => new Date().getFullYear());
  const { data, isLoading, isError, error } = trpc.finance.companyYear.useQuery({ year });
  if (isLoading) return <div className="py-10 flex justify-center"><Loader2 className="w-6 h-6 animate-spin" /></div>;
  if (isError || !data) return <p className="text-sm text-destructive">No se pudo cargar: {error?.message}</p>;
  const chart = data.months.map((m: any, i: number) => ({ mes: MONTHS[i], resultado: m.result }));
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Button size="sm" variant="outline" onClick={() => setYear(year - 1)}>←</Button>
        <span className="font-heading text-xl w-16 text-center">{year}</span>
        <Button size="sm" variant="outline" onClick={() => setYear(year + 1)}>→</Button>
      </div>
      <BentoGrid>
        <BentoTile><StatTile icon={Banknote} tone="revenue" value={money(data.totals.grossIncome)} label={`Ingreso del año (${data.totals.events} eventos)`} /></BentoTile>
        <BentoTile><StatTile icon={TrendingUp} tone="count" value={money(data.totals.eventsProfit)} label="Ganancia de los eventos" /></BentoTile>
        <BentoTile><StatTile icon={Receipt} tone="alert" value={money(data.totals.unassignedExpenses)} label="Gastos fijos sin evento" /></BentoTile>
        <BentoTile><StatTile icon={Wallet} tone={data.totals.result < 0 ? 'danger' : 'success'} value={money(data.totals.result)} label="Resultado del año" /></BentoTile>
      </BentoGrid>
      <Card className="admin-clay border-0">
        <CardHeader><CardTitle>Resultado mes a mes</CardTitle><p className="text-sm text-[var(--admin-muted)]">Ganancia de los eventos menos los gastos fijos que ningún evento absorbió.</p></CardHeader>
        <CardContent>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chart}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.08)" />
                <XAxis dataKey="mes" fontSize={12} /><YAxis fontSize={11} width={52} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
                <Tooltip formatter={(v: number) => money(v)} />
                <Bar dataKey="resultado" radius={[3, 3, 0, 0]}>
                  {chart.map((c: any, i: number) => <Cell key={i} fill={c.resultado < 0 ? '#ef4444' : '#10b981'} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
      <Card className="admin-clay border-0">
        <CardHeader><CardTitle>Detalle por mes</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-[var(--admin-muted)]"><th className="py-1.5">Mes</th><th>Eventos</th><th className="text-right">Ingreso</th><th className="text-right">Ganancia eventos</th><th className="text-right">Gastos sin evento</th><th className="text-right">Resultado</th></tr></thead>
            <tbody>
              {data.months.map((m: any, i: number) => (
                <tr key={m.monthKey} className={`border-t border-black/5 ${m.monthKey === data.bestMonth ? 'bg-emerald-500/5' : m.monthKey === data.worstMonth ? 'bg-red-500/5' : ''}`}>
                  <td className="py-1.5 pr-2 font-medium">{MONTHS[i]}</td>
                  <td className="pr-2 text-[var(--admin-muted)]">{m.events.length ? m.events.map((e: any) => e.title).join(', ') : '—'}</td>
                  <td className="text-right tabular-nums">{money(m.grossIncome)}</td>
                  <td className="text-right tabular-nums">{money(m.eventsProfit)}</td>
                  <td className="text-right tabular-nums">{money(m.unassignedExpenses)}</td>
                  <td className={`text-right tabular-nums font-semibold ${m.result < 0 ? 'text-red-600' : ''}`}>{money(m.result)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

/** Todo lo que hay que pagar a terceros. */
function PayablesTab() {
  const isDemo = useIsDemo();
  const utils = trpc.useUtils();
  const { data, isLoading, isError, error } = trpc.finance.payables.useQuery();
  const refresh = () => { utils.finance.payables.invalidate(); utils.finance.eventReport.invalidate(); };
  const mark = trpc.finance.markCommissionsPaid.useMutation({ onSuccess: refresh, onError: onErr });
  const reset = trpc.finance.resetCommissionPayments.useMutation({
    onSuccess: (r) => { refresh(); toast.success(`${r.reset} comisión(es) volvieron a pendiente`); },
    onError: onErr,
  });
  if (isLoading) return <div className="py-10 flex justify-center"><Loader2 className="w-6 h-6 animate-spin" /></div>;
  if (isError || !data) return <p className="text-sm text-destructive">No se pudo cargar: {error?.message}</p>;
  // "Por pagar ahora" solo cuenta eventos que ya ocurrieron.
  const total = data.ambassadorsPending + data.staffUnpaidTotal + data.parkingTotal + data.retentionSiiTotal;
  const paidTotal = data.ambassadorEvents.reduce((sum: number, e: any) => sum + e.paid, 0);
  return (
    <div className="space-y-6">
      <BentoGrid>
        <BentoTile span={2}><StatTile size="lg" icon={Wallet} tone="alert" value={money(total)} label="Por pagar (embajadores + staff + estacionamiento + retención SII)" /></BentoTile>
        <BentoTile><StatTile icon={Users} tone="count" value={money(data.ambassadorsPending)} label={`Comisiones por pagar ahora${data.ambassadorsPendingFuture > 0 ? ` (+${money(data.ambassadorsPendingFuture)} de eventos que aún no ocurren)` : ''}`} /></BentoTile>
        <BentoTile><StatTile icon={Banknote} tone="count" value={money(data.playcardSaldoClientes)} label="Saldo PlayCard de clientes" /></BentoTile>
      </BentoGrid>

      <Card className="admin-clay border-0">
        <CardHeader>
          <CardTitle>Comisiones de embajadores, evento por evento</CardTitle>
          <p className="text-sm text-[var(--admin-muted)]">
            Cada evento es una campaña aparte y se paga por separado. Los eventos que todavía no ocurren se muestran, pero no se cuentan como deuda.
          </p>
        </CardHeader>
        <CardContent className="space-y-5">
          {data.ambassadorEvents.length === 0 && <EmptyState icon={Users} title="Sin comisiones registradas" />}
          {data.ambassadorEvents.map((ev: any) => (
            <div key={ev.eventId} className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-semibold">{ev.eventTitle}</p>
                {ev.eventDate && <span className="text-xs text-[var(--admin-muted)]">{formatChileShortDate(ev.eventDate)}</span>}
                <span className={`text-xs px-2 py-0.5 rounded-full ${ev.isFuture ? 'bg-sky-500/15 text-sky-800' : 'bg-emerald-500/15 text-emerald-800'}`}>
                  {ev.isFuture ? 'Aún no ocurre: todavía no se paga' : 'Ya ocurrió'}
                </span>
                <span className="ml-auto text-sm tabular-nums">Pendiente <strong>{money(ev.pending)}</strong> · Pagado {money(ev.paid)}</span>
              </div>
              {ev.ambassadors.map((a: any) => (
                <div key={a.ambassadorId} className="admin-clay-sm p-3 flex flex-wrap items-center gap-3">
                  <div className="flex-1 min-w-[8rem]">
                    <p className="font-medium">{a.name}</p>
                    <p className="text-xs text-[var(--admin-muted)]">{a.salesCount} venta{a.salesCount === 1 ? '' : 's'} · pagado {money(a.paid)}</p>
                  </div>
                  <p className="tabular-nums font-semibold">{money(a.pending > 0 ? a.pending : a.paid)}</p>
                  {a.pending > 0 ? (
                    // Rosado = pendiente de pago (también en eventos futuros; ahí pide confirmación).
                    <button type="button" disabled={isDemo || mark.isPending}
                      className="rounded-full px-5 py-2 text-sm font-semibold text-white bg-pink-500 hover:bg-pink-600 active:scale-95 shadow-sm transition disabled:opacity-60"
                      onClick={() => {
                        const msg = ev.isFuture
                          ? `«${ev.eventTitle}» todavía no ocurre. ¿Seguro que quieres marcar ${money(a.pending)} de ${a.name} como pagado?`
                          : `¿Marcar ${money(a.pending)} de ${a.name} (${ev.eventTitle}) como pagado?`;
                        if (window.confirm(msg)) mark.mutate({ ambassadorId: a.ambassadorId, eventId: ev.eventId, paid: true, confirmFuture: ev.isFuture });
                      }}>
                      Marcar pagado
                    </button>
                  ) : a.paid > 0 ? (
                    // Verde = ya pagado (tocar de nuevo lo devuelve a pendiente, con confirmación).
                    <button type="button" disabled={isDemo || mark.isPending}
                      title="Tócalo para deshacer"
                      className="rounded-full px-5 py-2 text-sm font-semibold text-white bg-emerald-500 hover:bg-emerald-600 active:scale-95 shadow-sm transition disabled:opacity-60"
                      onClick={() => { if (window.confirm(`¿Volver a pendiente lo de ${a.name} en ${ev.eventTitle}?`)) mark.mutate({ ambassadorId: a.ambassadorId, eventId: ev.eventId, paid: false }); }}>
                      ✓ Pagado
                    </button>
                  ) : (
                    <span className="rounded-full px-5 py-2 text-sm font-medium bg-black/5 text-[var(--admin-muted)]">Sin comisión</span>
                  )}
                </div>
              ))}
            </div>
          ))}
          {paidTotal > 0 && (
            <div className="pt-3 border-t border-black/5 text-sm flex flex-wrap items-center justify-between gap-2">
              <span className="text-[var(--admin-muted)]">Marcado como pagado en total: {money(paidTotal)}. Si lo marcaste sin separar por evento, puedes empezar de cero.</span>
              <Button size="sm" variant="outline" disabled={isDemo || reset.isPending}
                onClick={() => { if (window.confirm('Esto vuelve TODAS las comisiones a "pendiente" para que las marques de nuevo, evento por evento. No se pierde ningún monto. ¿Continuar?')) reset.mutate(); }}>
                Reiniciar pagos marcados
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="admin-clay border-0">
        <CardHeader>
          <CardTitle>Retención de honorarios al SII</CardTitle>
          <p className="text-sm text-[var(--admin-muted)]">
            Lo que retuviste en las boletas de honorarios del staff. Se declara y paga en el F29 hasta el día 12 del mes siguiente al evento.
            Se muestran los eventos de los últimos 75 días (el sistema no registra el pago del F29).
          </p>
        </CardHeader>
        <CardContent className="space-y-2">
          {data.retentionSii.length === 0 && <p className="text-sm text-[var(--admin-muted)]">No hay retenciones recientes por declarar.</p>}
          {data.retentionSii.map((r: any) => (
            <div key={r.eventId} className="admin-clay-sm p-3 flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-medium">{r.eventTitle}</p>
                <p className="text-xs text-[var(--admin-muted)]">{r.boletas} boleta{r.boletas === 1 ? '' : 's'} · vence el {r.dueDate ? r.dueDate.split('-').reverse().join('-') : '—'}</p>
              </div>
              <strong className="tabular-nums">{money(r.retention)}</strong>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="admin-clay border-0">
          <CardHeader><CardTitle>Staff sin pagar</CardTitle><p className="text-sm text-[var(--admin-muted)]">Lo que hay que transferirles (líquido). Se marca como pagado dentro de cada evento (pestaña Evento completo).</p></CardHeader>
          <CardContent className="space-y-2">
            {data.staffUnpaid.length === 0 && <p className="text-sm text-[var(--admin-muted)]">Todo el staff está al día ✓</p>}
            {data.staffUnpaid.map((r: any, i: number) => (
              <div key={i} className="flex justify-between gap-3 text-sm admin-clay-sm px-3 py-2">
                <span>{r.name} <span className="text-[var(--admin-muted)]">· {r.eventTitle}</span></span>
                <strong className="tabular-nums">{money(r.amountClp)}</strong>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card className="admin-clay border-0">
          <CardHeader><CardTitle>Estacionamiento al local</CardTitle><p className="text-sm text-[var(--admin-muted)]">Autos pagados × tarifa del local, de los últimos eventos.</p></CardHeader>
          <CardContent className="space-y-2">
            {data.parking.length === 0 && <p className="text-sm text-[var(--admin-muted)]">Sin estacionamiento por pagar.</p>}
            {data.parking.map((r: any) => (
              <div key={r.eventId} className="flex justify-between gap-3 text-sm admin-clay-sm px-3 py-2">
                <span>{r.eventTitle}</span><strong className="tabular-nums">{money(r.amount)}</strong>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

const SUGGESTIONS = ['¿Cuánto gané este año?', '¿Cómo va el evento de ahora?', '¿Cuánto tengo por pagar?', '¿Qué me conviene mejorar para ganar más?'];

/** Pregúntale a tus finanzas: la IA responde solo con los números del sistema. */
function AskCard() {
  const isDemo = useIsDemo();
  const [q, setQ] = useState('');
  const [answer, setAnswer] = useState<{ q: string; a: string } | null>(null);
  const ask = trpc.finance.ask.useMutation({ onSuccess: (r, v) => setAnswer({ q: v.question, a: r.answer }), onError: onErr });
  const go = (text: string) => { const t = text.trim(); if (t.length >= 3 && !isDemo) ask.mutate({ question: t }); };
  return (
    <Card className="admin-clay border-0">
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Sparkles className="w-5 h-5" /> Pregúntale a tus finanzas</CardTitle>
        <p className="text-sm text-[var(--admin-muted)]">Responde solo con los números reales del sistema.</p>
      </CardHeader>
      <CardContent className="space-y-3">
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); go(q); }}>
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ej: ¿cuánto gané en octubre?" maxLength={500} />
          <Button type="submit" disabled={ask.isPending || q.trim().length < 3}>{ask.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Preguntar'}</Button>
        </form>
        <div className="flex flex-wrap gap-2">
          {SUGGESTIONS.map((s) => <Button key={s} size="sm" variant="outline" disabled={ask.isPending} onClick={() => { setQ(s); go(s); }}>{s}</Button>)}
        </div>
        {answer && (
          <div className="admin-clay-sm p-4 space-y-1">
            <p className="text-xs text-[var(--admin-muted)]">{answer.q}</p>
            <p className="text-sm whitespace-pre-wrap">{answer.a}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** Meta de margen neto: el veredicto, los consejos y las alertas se miden contra este número. */
function MarginGoal() {
  const isDemo = useIsDemo();
  const utils = trpc.useUtils();
  const { data } = trpc.finance.marginTarget.useQuery();
  const [value, setValue] = useState<string | null>(null);
  const save = trpc.finance.setMarginTarget.useMutation({
    onSuccess: (r) => {
      setValue(null);
      utils.finance.marginTarget.invalidate(); utils.finance.eventReport.invalidate(); utils.finance.live.invalidate();
      toast.success(`Meta de margen: ${r.percent}%`);
    },
    onError: onErr,
  });
  const shown = value ?? String(data?.percent ?? 30);
  const n = Number(shown);
  const valid = Number.isFinite(n) && n >= 1 && n <= 90;
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <Target className="w-4 h-4 text-[var(--admin-muted)]" />
      <label htmlFor="margin-goal" className="text-[var(--admin-muted)]">Meta de margen</label>
      <Input id="margin-goal" type="number" inputMode="decimal" min={1} max={90} step={1} className="w-20" value={shown}
        disabled={isDemo} onChange={(e) => setValue(e.target.value)} />
      <span>%</span>
      {value !== null && value !== String(data?.percent) && (
        <Button size="sm" disabled={!valid || save.isPending} onClick={() => save.mutate({ percent: n })}>Guardar</Button>
      )}
    </div>
  );
}

export default function FinanzasView() {
  const [tab, setTab] = useState<'live' | 'evento' | 'mes' | 'pagar' | 'caja'>('live');
  const isDemo = useIsDemo();
  const { data: events } = trpc.events.listAll.useQuery();
  const { data: defaultEvent } = trpc.events.getActiveForCaja.useQuery();
  const [selected, setSelected] = useState<number | null>(null);
  const eventId = selected ?? defaultEvent?.id ?? events?.[0]?.id ?? null;

  const { data: rep, isLoading, isError, error } = trpc.finance.eventReport.useQuery(
    { eventId: eventId! }, { enabled: !!eventId && !isDemo && tab === 'evento', refetchInterval: 30_000 },
  );

  const donut = useMemo(() => {
    const groups = new Map<string, number>();
    for (const l of rep?.incomeLines ?? []) groups.set(l.label, (groups.get(l.label) ?? 0) + l.amount);
    const rows = Array.from(groups.entries()).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
    const top = rows.slice(0, 6);
    const rest = rows.slice(6).reduce((s, r) => s + r.value, 0);
    return rest > 0 ? [...top, { name: 'Otros', value: rest }] : top;
  }, [rep]);

  if (isDemo) return <EmptyState icon={Banknote} title="Finanzas es solo para el administrador" description="Esta sección muestra la plata real del negocio." />;
  if (!eventId) return <EmptyState icon={Banknote} title="Todavía no hay eventos cargados" />;

  const p = rep?.pnl;
  const gross = p?.grossIncome ?? 0;
  const margin = p?.marginPercent;
  const target = rep?.input.marginTargetPercent ?? 30;
  const flow = p ? [
    { label: 'IVA (débito)', value: p.iva.debitoFiscal, color: '#94a3b8' },
    { label: 'Costo de productos', value: p.cogs, color: '#38bdf8' },
    { label: 'Gastos del evento', value: p.directExpensesTotal, color: '#f97316' },
    { label: 'Gastos fijos del mes', value: p.generalExpensesAssigned, color: '#fb923c' },
    { label: 'Comisiones embajadores', value: p.ambassadorCommissions, color: '#8b5cf6' },
    { label: 'Comisión de tarjeta', value: p.cardFeeAmount, color: '#a78bfa' },
    { label: 'Parte del local', value: p.extraCostsTotal, color: '#f59e0b' },
    { label: 'Staff', value: p.staffCostsTotal, color: '#ec4899' },
  ].filter((r) => r.value > 0) : [];
  const per100 = (v: number) => (gross > 0 ? Math.round((v / gross) * 100) : 0);
  const recs = [...(rep?.recommendations.recommended ?? []), ...(rep?.recommendations.withCare ?? [])].slice(0, 6);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-heading text-2xl">Finanzas</h2>
          <p className="text-sm text-[var(--admin-muted)]">Todo el dinero del evento, con datos reales y en tiempo real.</p>
        </div>
        {(tab === 'live' || tab === 'evento') && (
        <div className="flex flex-wrap items-center gap-2">
          <Select value={String(eventId)} onValueChange={(v) => setSelected(Number(v))}>
            <SelectTrigger className="w-64"><SelectValue /></SelectTrigger>
            <SelectContent>{(events ?? []).map((e: any) => <SelectItem key={e.id} value={String(e.id)}>{e.title}</SelectItem>)}</SelectContent>
          </Select>
          <Button asChild variant="outline">
            <a href={`/api/admin/finanzas/informe.pdf?eventId=${eventId}`}><Download className="w-4 h-4 mr-1" /> Informe real (PDF)</a>
          </Button>
        </div>
        )}
      </div>

      <div className="flex gap-2" role="tablist">
        {([['live', 'En vivo'], ['evento', 'Evento completo'], ['mes', 'Mes / Empresa'], ['pagar', 'Por pagar'], ['caja', 'Caja']] as const).map(([k, l]) => (
          <Button key={k} role="tab" aria-selected={tab === k} variant={tab === k ? 'default' : 'outline'} onClick={() => setTab(k)}>{l}</Button>
        ))}
      </div>

      {(tab === 'live' || tab === 'evento') && <MarginGoal />}

      <AskCard />

      {tab === 'live' && <LiveTab eventId={eventId} />}
      {tab === 'mes' && <CompanyTab />}
      {tab === 'pagar' && <PayablesTab />}
      {tab === 'caja' && <CashTab />}

      {tab === 'evento' && isLoading && <div className="py-10 flex justify-center"><Loader2 className="w-6 h-6 animate-spin" /></div>}
      {tab === 'evento' && isError && <p className="text-sm text-destructive">No se pudo cargar: {error?.message}</p>}

      {tab === 'evento' && rep && p && (
        <>
          <div className={`rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3 ${VERDICT_TONE[rep.verdict.key]}`}>
            <p className="font-semibold">{rep.verdict.label}</p>
            <p className="text-sm">Margen {margin != null ? `${margin}%` : '—'} · meta {target}%</p>
          </div>

          <BentoGrid>
            <BentoTile><StatTile icon={Banknote} tone="revenue" value={money(gross)} label="Ingreso real" /></BentoTile>
            <BentoTile><StatTile icon={Receipt} tone="alert" value={money(gross - p.netProfit)} label="Costos, comisiones e IVA" /></BentoTile>
            <BentoTile><StatTile icon={TrendingUp} tone={p.netProfit < 0 ? 'danger' : 'success'} value={money(p.netProfit)} label={p.netProfit < 0 ? 'Pérdida' : 'Ganancia'} /></BentoTile>
            <BentoTile><StatTile icon={Target} tone="count" value={rep.result.breakevenTickets != null ? rep.result.breakevenTickets.toLocaleString('es-CL') : '—'} label={`Entradas para no perder (vendidas: ${rep.ticketsSold})`} /></BentoTile>
          </BentoGrid>

          {(p.warnings?.length ?? 0) > 0 && (
            <div className="admin-clay-sm bg-[var(--admin-warning-bg)] p-4 space-y-1">
              <p className="text-sm font-semibold text-[var(--admin-warning-text)]">Ojo con estos números</p>
              {p.warnings.map((w: string, i: number) => <p key={i} className="text-sm text-[var(--admin-warning-text)]">{w}</p>)}
            </div>
          )}

          <EventCostsCard eventId={eventId} eventDate={new Date(rep.pnl.eventDate as any).toISOString()} costs={rep.costs} />

          <TaxReserveCard tax={rep.tax} />

          <div className="grid gap-6 lg:grid-cols-2">
            <Card className="admin-clay border-0">
              <CardHeader>
                <CardTitle>Del ingreso a lo que te queda</CardTitle>
                <p className="text-sm text-[var(--admin-muted)]">Cada barra es algo que se resta de lo que entró.</p>
              </CardHeader>
              <CardContent className="space-y-2">
                <FlowRow label="Ingreso real" value={gross} total={gross} color="#ec4899" sign="+" />
                {flow.map((r) => <FlowRow key={r.label} {...r} total={gross} />)}
                <div className="pt-2 border-t border-black/5">
                  <FlowRow label={p.netProfit < 0 ? 'Pérdida' : 'Ganancia'} value={p.netProfit} total={gross} color={p.netProfit < 0 ? '#ef4444' : '#10b981'} sign="=" />
                </div>
                {gross > 0 && (
                  <p className="text-sm pt-2">
                    Por cada <strong>$100</strong> que entran: {flow.map((r) => `$${per100(r.value)} ${r.label.toLowerCase()}`).join(', ')}{flow.length ? ' y ' : ''}
                    <strong>{p.netProfit < 0 ? ` pierdes $${Math.abs(per100(p.netProfit))}` : ` te quedan $${per100(p.netProfit)}`}</strong>.
                  </p>
                )}
              </CardContent>
            </Card>

            <Card className="admin-clay border-0">
              <CardHeader><CardTitle>De dónde viene la plata</CardTitle></CardHeader>
              <CardContent>
                {donut.length === 0 ? <EmptyState icon={Wallet} title="Todavía no hay ventas" /> : (
                  <div className="grid sm:grid-cols-2 gap-4 items-center">
                    <div className="h-48">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={donut} dataKey="value" nameKey="name" innerRadius="55%" outerRadius="90%" paddingAngle={2} stroke="none">
                            {donut.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
                          </Pie>
                          <Tooltip formatter={(v: number) => money(v)} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <ul className="space-y-1.5 text-sm">
                      {donut.map((d, i) => (
                        <li key={d.name} className="flex items-center gap-2">
                          <span className="w-3 h-3 rounded-full shrink-0" style={{ background: PALETTE[i % PALETTE.length] }} />
                          <span className="truncate flex-1">{d.name}</span>
                          <span className="tabular-nums">{money(d.value)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-4 text-sm">
                  <p>Web <strong className="block tabular-nums">{money(rep.byChannel.web)}</strong></p>
                  <p>Caja <strong className="block tabular-nums">{money(rep.byChannel.caja)}</strong></p>
                  <p>Importado <strong className="block tabular-nums">{money(rep.byChannel.import)}</strong></p>
                  <p title="Ya se contó cuando el cliente cargó su PlayCard">Gastado con saldo <strong className="block tabular-nums">{money(rep.byChannel.saldoGastado)}</strong></p>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card className="admin-clay border-0">
            <CardHeader>
              <CardTitle>Detalle de ingresos</CardTitle>
              <p className="text-sm text-[var(--admin-muted)]">Producto por producto, lo que de verdad entró (sin contar lo pagado con saldo PlayCard).</p>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="text-left text-[var(--admin-muted)]"><th className="py-1.5">Producto</th><th>Tipo</th><th className="text-right">Cant.</th><th className="text-right">Monto</th></tr></thead>
                  <tbody>
                    {rep.incomeLines.map((l: any) => (
                      <tr key={`${l.group}-${l.label}`} className="border-t border-black/5">
                        <td className="py-1.5 pr-2">{l.label}</td>
                        <td className="pr-2 text-[var(--admin-muted)]">{GROUP_LABEL[l.group]}</td>
                        <td className="text-right tabular-nums">{l.qty.toLocaleString('es-CL')}</td>
                        <td className="text-right tabular-nums font-medium">{money(l.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card className="admin-clay border-0">
              <CardHeader><CardTitle>¿Y si va menos (o más) gente?</CardTitle><p className="text-sm text-[var(--admin-muted)]">Utilidad según el porcentaje de asistencia, con tus costos reales.</p></CardHeader>
              <CardContent>
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={rep.scenarios.map((s: any) => ({ x: `${Math.round(s.occupancy * 100)}%`, utilidad: s.netProfit }))}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.08)" />
                      <XAxis dataKey="x" fontSize={12} /><YAxis fontSize={12} tickFormatter={(v) => `${Math.round(v / 1000)}k`} width={48} />
                      <Tooltip formatter={(v: number) => money(v)} />
                      <Line type="monotone" dataKey="utilidad" stroke="#ec4899" strokeWidth={3} dot />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card className="admin-clay border-0">
              <CardHeader><CardTitle>Por pagar y por cobrar</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-sm">
                {[
                  ['Estacionamiento al local', rep.payables.parkingVenue, 'Lo que le debes al local por los autos'],
                  ['Staff sin pagar', rep.payables.staffUnpaid, 'Turnos de este evento no marcados como pagados'],
                  ['Comisiones de embajadores', rep.payables.ambassadorCommissions, `Solo de «${rep.eventTitle}» (el pago se marca en Por pagar)`],
                  ['IVA a pagar al SII', rep.payables.ivaAPagar, 'Débito menos crédito fiscal (si el evento declara)'],
                  ['Saldo PlayCard de clientes', rep.payables.playcardSaldoClientes, 'Plata de clientes que todavía no gastan (todos los eventos)'],
                ].map(([label, value, hint]) => (
                  <div key={label as string} className="flex items-start justify-between gap-3 admin-clay-sm p-3">
                    <div><p className="font-medium">{label}</p><p className="text-xs text-[var(--admin-muted)]">{hint}</p></div>
                    <p className="tabular-nums font-semibold shrink-0">{money(value as number)}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          <Card className="admin-clay border-0">
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Lightbulb className="w-5 h-5" /> Cómo subir el margen</CardTitle>
              <p className="text-sm text-[var(--admin-muted)]">Calculado con tus números reales de este evento.</p>
            </CardHeader>
            <CardContent className="space-y-3">
              {recs.length === 0 ? <p className="text-sm text-[var(--admin-muted)]">Con los datos actuales no hay ideas con ganancia clara.</p> : recs.map((r: any) => (
                <div key={r.id} className="admin-clay-sm p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-medium">{r.title}</p>
                    <span className="text-sm font-semibold text-emerald-700">+{money(r.gainClp)}</span>
                  </div>
                  <p className="text-sm text-[var(--admin-muted)] mt-1">{r.how}</p>
                </div>
              ))}
              {rep.recommendations.topThree && (
                <p className="text-sm font-medium">Si aplicas las 3 mejores: +{money(rep.recommendations.topThree.profitGain)} de utilidad.</p>
              )}
            </CardContent>
          </Card>

          <StaffPanel eventId={eventId} report={rep} />
        </>
      )}
    </div>
  );
}
