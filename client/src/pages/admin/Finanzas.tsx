import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { PieChart, Pie, Cell, ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, BarChart, Bar } from 'recharts';
import { Banknote, Download, Sparkles, Activity, AlertTriangle, Lightbulb, Loader2, Plus, Trash2, TrendingUp, Users, Wallet, Receipt, Target } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { formatChileTime } from '@shared/chileDate';
import { useIsDemo, DEMO_TOOLTIP } from '@/lib/demoMode';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { BentoGrid, BentoTile } from '@/components/admin/BentoGrid';
import { StatTile } from '@/components/admin/StatTile';
import { EmptyState } from '@/components/admin/EmptyState';

const money = (n: number) => `${n < 0 ? '-' : ''}$${Math.abs(Math.round(n)).toLocaleString('es-CL')}`;
const PALETTE = ['#ec4899', '#38bdf8', '#8b5cf6', '#f59e0b', '#10b981', '#f97316', '#64748b'];
const VERDICT_TONE: Record<string, string> = {
  ok: 'bg-emerald-500/15 text-emerald-700', warning: 'bg-amber-500/20 text-amber-800',
  danger: 'bg-orange-500/20 text-orange-800', loss: 'bg-red-500/15 text-red-700',
};
const GROUP_LABEL: Record<string, string> = { entradas: 'Entradas', consumo: 'Barra y consumo', extras: 'Extras', saldo: 'Cargas PlayCard', otros: 'Otros' };

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

function StaffPanel({ eventId, report }: { eventId: number; report: any }) {
  const utils = trpc.useUtils();
  const isDemo = useIsDemo();
  const { data: catalog } = trpc.finance.staffList.useQuery();
  const { data: shifts } = trpc.finance.shiftsList.useQuery({ eventId });
  const [staffId, setStaffId] = useState<string>('');
  const [amount, setAmount] = useState('');
  const [newName, setNewName] = useState('');
  const [newRole, setNewRole] = useState('');
  const [newRate, setNewRate] = useState('');

  const refresh = () => { utils.finance.shiftsList.invalidate(); utils.finance.eventReport.invalidate(); utils.cajaReports.eventPnl.invalidate(); };
  const saveStaff = trpc.finance.staffSave.useMutation({
    onSuccess: () => { utils.finance.staffList.invalidate(); setNewName(''); setNewRole(''); setNewRate(''); toast.success('Persona agregada'); },
    onError: onErr,
  });
  const addShift = trpc.finance.shiftAdd.useMutation({ onSuccess: () => { refresh(); setStaffId(''); setAmount(''); }, onError: onErr });
  const updShift = trpc.finance.shiftUpdate.useMutation({ onSuccess: refresh, onError: onErr });
  const delShift = trpc.finance.shiftRemove.useMutation({ onSuccess: refresh, onError: onErr });

  const active = (catalog ?? []).filter((s: any) => s.active);
  const assigned = new Set((shifts ?? []).map((s: any) => s.staffId));
  const total = (shifts ?? []).reduce((s: number, x: any) => s + x.amountClp, 0);
  const unpaid = (shifts ?? []).filter((x: any) => !x.paid).reduce((s: number, x: any) => s + x.amountClp, 0);

  return (
    <Card className="admin-clay border-0">
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Users className="w-5 h-5" /> Staff de la noche</CardTitle>
        <p className="text-sm text-[var(--admin-muted)]">
          Lo que pagas al equipo entra solo al resultado del evento. Total {money(total)} · por pagar {money(unpaid)}.
          {report?.pnl?.warnings?.some((w: string) => w.includes('Staff')) && ' Ojo: revisa el aviso de doble conteo de arriba.'}
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          {(shifts ?? []).length === 0 && <EmptyState icon={Users} title="Nadie asignado todavía" description="Agrega al equipo de esta noche y cuánto se le paga." />}
          {(shifts ?? []).map((s: any) => (
            <div key={s.id} className="admin-clay-sm p-3 flex flex-wrap items-center gap-3">
              <div className="min-w-[8rem] flex-1">
                <p className="font-medium">{s.name}</p>
                <p className="text-xs text-[var(--admin-muted)]">{s.role || 'Sin rol'}</p>
              </div>
              <Input
                type="number" inputMode="numeric" className="w-28" defaultValue={s.amountClp} disabled={isDemo}
                onBlur={(e) => { const v = Math.max(0, Math.round(Number(e.target.value) || 0)); if (v !== s.amountClp) updShift.mutate({ id: s.id, amountClp: v }); }}
              />
              <Button
                size="sm" variant={s.paid ? 'default' : 'outline'} disabled={isDemo}
                onClick={() => updShift.mutate({ id: s.id, paid: !s.paid })}
              >{s.paid ? 'Pagado ✓' : 'Marcar pagado'}</Button>
              <Button size="icon" variant="ghost" disabled={isDemo} aria-label={`Quitar a ${s.name}`}
                onClick={() => { if (window.confirm(`¿Quitar a ${s.name} de este evento?`)) delShift.mutate({ id: s.id }); }}>
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap items-end gap-2 pt-2 border-t border-black/5">
          <div className="min-w-[10rem] flex-1">
            <p className="text-xs text-[var(--admin-muted)] mb-1">Agregar al evento</p>
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
          <Button disabled={isDemo || !staffId || addShift.isPending} title={isDemo ? DEMO_TOOLTIP : undefined}
            onClick={() => addShift.mutate({ eventId, staffId: Number(staffId), amountClp: Math.round(Number(amount) || 0) })}>
            <Plus className="w-4 h-4 mr-1" /> Agregar
          </Button>
        </div>

        <details className="text-sm">
          <summary className="cursor-pointer text-[var(--admin-muted)]">Equipo (personas que ya registraste: {(catalog ?? []).length})</summary>
          <div className="flex flex-wrap items-end gap-2 mt-3">
            <Input placeholder="Nombre" className="w-40" value={newName} onChange={(e) => setNewName(e.target.value)} />
            <Input placeholder="Rol (barra, puerta…)" className="w-40" value={newRole} onChange={(e) => setNewRole(e.target.value)} />
            <Input type="number" inputMode="numeric" placeholder="Tarifa por noche $" className="w-40" value={newRate} onChange={(e) => setNewRate(e.target.value)} />
            <Button variant="outline" disabled={isDemo || !newName.trim() || saveStaff.isPending}
              onClick={() => saveStaff.mutate({ name: newName, role: newRole || null, defaultRateClp: Math.round(Number(newRate) || 0) })}>
              Crear persona
            </Button>
          </div>
        </details>
      </CardContent>
    </Card>
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
  const mark = trpc.finance.markCommissionsPaid.useMutation({ onSuccess: () => { utils.finance.payables.invalidate(); utils.finance.eventReport.invalidate(); }, onError: onErr });
  if (isLoading) return <div className="py-10 flex justify-center"><Loader2 className="w-6 h-6 animate-spin" /></div>;
  if (isError || !data) return <p className="text-sm text-destructive">No se pudo cargar: {error?.message}</p>;
  const total = data.ambassadorsPending + data.staffUnpaidTotal + data.parkingTotal;
  return (
    <div className="space-y-6">
      <BentoGrid>
        <BentoTile span={2}><StatTile size="lg" icon={Wallet} tone="alert" value={money(total)} label="Por pagar (embajadores + staff + estacionamiento)" /></BentoTile>
        <BentoTile><StatTile icon={Users} tone="count" value={money(data.ambassadorsPending)} label="Comisiones pendientes" /></BentoTile>
        <BentoTile><StatTile icon={Banknote} tone="count" value={money(data.playcardSaldoClientes)} label="Saldo PlayCard de clientes" /></BentoTile>
      </BentoGrid>

      <Card className="admin-clay border-0">
        <CardHeader><CardTitle>Comisiones de embajadores</CardTitle><p className="text-sm text-[var(--admin-muted)]">Marca como pagado cuando les transfieras. "Pagado" se guarda con la fecha.</p></CardHeader>
        <CardContent className="space-y-2">
          {data.ambassadors.length === 0 && <EmptyState icon={Users} title="Sin comisiones registradas" />}
          {data.ambassadors.map((a: any) => (
            <div key={a.ambassadorId} className="admin-clay-sm p-3 flex flex-wrap items-center gap-3">
              <div className="flex-1 min-w-[8rem]">
                <p className="font-medium">{a.name}</p>
                <p className="text-xs text-[var(--admin-muted)]">Pagado hasta ahora {money(a.paid)}</p>
              </div>
              <p className="tabular-nums font-semibold">{money(a.pending)}</p>
              {a.pending > 0 ? (
                <Button size="sm" disabled={isDemo || mark.isPending}
                  onClick={() => { if (window.confirm(`¿Marcar ${money(a.pending)} de ${a.name} como pagado?`)) mark.mutate({ ambassadorId: a.ambassadorId, paid: true }); }}>
                  Marcar pagado
                </Button>
              ) : <span className="text-sm text-emerald-700">Al día ✓</span>}
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="admin-clay border-0">
          <CardHeader><CardTitle>Staff sin pagar</CardTitle><p className="text-sm text-[var(--admin-muted)]">Se marca como pagado dentro de cada evento (pestaña Evento completo).</p></CardHeader>
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
  const [tab, setTab] = useState<'live' | 'evento' | 'mes' | 'pagar'>('live');
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
        {([['live', 'En vivo'], ['evento', 'Evento completo'], ['mes', 'Mes / Empresa'], ['pagar', 'Por pagar']] as const).map(([k, l]) => (
          <Button key={k} role="tab" aria-selected={tab === k} variant={tab === k ? 'default' : 'outline'} onClick={() => setTab(k)}>{l}</Button>
        ))}
      </div>

      {(tab === 'live' || tab === 'evento') && <MarginGoal />}

      <AskCard />

      {tab === 'live' && <LiveTab eventId={eventId} />}
      {tab === 'mes' && <CompanyTab />}
      {tab === 'pagar' && <PayablesTab />}

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
                  ['Comisiones de embajadores', rep.payables.ambassadorCommissions, 'Total del evento'],
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
