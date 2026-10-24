/* Secciones del hub «finanzas» del panel (se cargan solas al abrirlas, ver ADMIN_SECTIONS en ../Dashboard.tsx). */
import { useContext, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useIsDemo, DEMO_TOOLTIP } from '@/lib/demoMode';
import { WriteButton, DownloadLink } from '@/components/admin/WriteButton';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Plus, Percent, X, Download, Trash2, Sparkles, Loader2 } from 'lucide-react';
import { PnlWarnings } from '@/components/admin/PnlWarnings';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogTrigger, AlertDialogContent, AlertDialogHeader, AlertDialogFooter, AlertDialogTitle, AlertDialogDescription, AlertDialogCancel } from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { ConfirmDeleteButton } from '@/components/admin/ConfirmDeleteButton';
import { BudgetReportActions } from '@/components/admin/BudgetReportActions';
import { CameraCaptureField } from '@/components/admin/CameraCaptureField';
import { StatTile } from '@/components/admin/StatTile';
import { BentoGrid } from '@/components/admin/BentoGrid';
import { personasForAccesoSlug } from '@shared/mission300';
import { EXPENSE_CATEGORIES, EXPENSE_DOCUMENT_TYPES, EXPENSE_PAYMENT_METHODS, categoryLabel, deriveAmounts, type ExpenseCategory, type ExpenseDocumentType, type ExpensePaymentMethod } from '@shared/expenses';
import { computeBudgetResult, expenseLineAmounts, type ExtraIncomeLine, type BudgetSimulationInput, type RevenueTier, type BudgetExpenseLine, type BudgetResult, type ExpenseIvaMode } from '@shared/eventBudget';
import { formatChileDateTime, formatChileShortDate } from '@shared/chileDate';
import { AdminNavContext, ExpensesList, PIE_COLORS, fromChileInputValue, onMutationError, toChileInputValue } from './shared';

export const TICKET_CATEGORY_LABEL: Record<string, string> = {
  acceso: 'Acceso', extra: 'Extra', consumo: 'Consumo', locker: 'Guardarropía', merch: 'Merch',
};

export type ProfitSort = 'revenue' | 'units' | 'margin' | 'name';

export type ProfitGroupBy = 'none' | 'category' | 'groupName';

/** "Margen por producto": pedido explícito del usuario -- poder ordenar por
 * distintos criterios, agrupar por categoría o por grupo del menú, y ver
 * gráficos para leer de un vistazo cómo estuvo el evento en vez de tener que
 * leer la tabla entera fila por fila. */
export function ProfitReport({ eventId }: { eventId: number }) {
  const { data } = trpc.cajaReports.profit.useQuery({ eventId });
  const rows = data ?? [];
  const [sortBy, setSortBy] = useState<ProfitSort>('revenue');
  const [groupBy, setGroupBy] = useState<ProfitGroupBy>('none');
  const totalRevenue = rows.reduce((s, r) => s + r.revenue, 0);
  const totalProfit = rows.reduce((s, r) => s + (r.profit ?? 0), 0);

  const groupKey = (r: (typeof rows)[number]) =>
    groupBy === 'category' ? (TICKET_CATEGORY_LABEL[r.category] ?? r.category)
    : groupBy === 'groupName' ? (r.groupName ?? 'Sin grupo')
    : null;

  const sortRows = (list: typeof rows) => [...list].sort((a, b) => {
    if (sortBy === 'units') return b.unitsSold - a.unitsSold;
    if (sortBy === 'margin') return (b.marginPercent ?? -Infinity) - (a.marginPercent ?? -Infinity);
    if (sortBy === 'name') return a.name.localeCompare(b.name);
    return b.revenue - a.revenue;
  });

  const groups = groupBy === 'none'
    ? [{ key: null as string | null, rows: sortRows(rows) }]
    : Array.from(
        rows.reduce((map, r) => {
          const key = groupKey(r)!;
          (map.get(key) ?? map.set(key, []).get(key)!).push(r);
          return map;
        }, new Map<string, typeof rows>()),
      )
        .map(([key, list]) => ({ key, rows: sortRows(list) }))
        .sort((a, b) => b.rows.reduce((s, r) => s + r.revenue, 0) - a.rows.reduce((s, r) => s + r.revenue, 0));

  const chartByGroup = Array.from(
    rows.reduce((map, r) => {
      const key = TICKET_CATEGORY_LABEL[r.category] ?? r.category;
      map.set(key, (map.get(key) ?? 0) + r.revenue);
      return map;
    }, new Map<string, number>()),
  ).map(([name, revenue]) => ({ name, revenue }));

  const topByUnits = [...rows].sort((a, b) => b.unitsSold - a.unitsSold).slice(0, 10);

  return (
    <Card className="rounded-2xl border-0 shadow-md shadow-black/5">
      <CardHeader><CardTitle>Margen por producto (antes de descuentos)</CardTitle></CardHeader>
      <CardContent className="space-y-6">
        <div>
          <p className="text-sm text-muted-foreground mb-1">Ingresos totales: ${totalRevenue.toLocaleString('es-CL')} · Utilidad total: ${totalProfit.toLocaleString('es-CL')} <span className="text-xs">(solo productos con costo cargado)</span></p>
          <p className="text-xs text-muted-foreground">Mide qué tan rentable es cada producto sobre su precio de lista. Para la utilidad REAL de la fiesta (con descuentos, gastos, IVA y comisiones) anda a <strong>Gastos y P&amp;L</strong>.</p>
        </div>

        {rows.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Ingresos por categoría</p>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartByGroup}>
                    <CartesianGrid stroke="hsl(var(--border))" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${Number(v).toLocaleString('es-CL')}`} />
                    <Tooltip formatter={(v: number) => `$${v.toLocaleString('es-CL')}`} />
                    <Bar dataKey="revenue" fill="#111827" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Participación por categoría</p>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={chartByGroup} dataKey="revenue" nameKey="name" innerRadius={45} outerRadius={80}>
                      {chartByGroup.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                    </Pie>
                    <Tooltip formatter={(v: number) => `$${v.toLocaleString('es-CL')}`} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className="md:col-span-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Top 10 productos por unidades vendidas</p>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={topByUnits} layout="vertical" margin={{ left: 24 }}>
                    <CartesianGrid stroke="hsl(var(--border))" />
                    <XAxis type="number" tick={{ fontSize: 11 }} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={140} />
                    <Tooltip />
                    <Bar dataKey="unitsSold" fill="#6366f1" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-3 items-center">
          <div>
            <Label className="text-xs">Ordenar por</Label>
            <Select value={sortBy} onValueChange={(v) => setSortBy(v as ProfitSort)}>
              <SelectTrigger className="mt-1 w-44 h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="revenue">Ingresos</SelectItem>
                <SelectItem value="units">Unidades</SelectItem>
                <SelectItem value="margin">Margen</SelectItem>
                <SelectItem value="name">Nombre (A-Z)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Agrupar por</Label>
            <Select value={groupBy} onValueChange={(v) => setGroupBy(v as ProfitGroupBy)}>
              <SelectTrigger className="mt-1 w-44 h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sin agrupar</SelectItem>
                <SelectItem value="category">Por categoría</SelectItem>
                <SelectItem value="groupName">Por grupo del menú</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="overflow-x-auto space-y-4">
          {groups.map((g) => (
            <div key={g.key ?? 'all'}>
              {g.key != null && (
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">
                  {g.key} · ${g.rows.reduce((s, r) => s + r.revenue, 0).toLocaleString('es-CL')}
                </p>
              )}
              <table className="w-full text-sm">
                <thead><tr className="text-left text-muted-foreground border-b border-border/50">
                  <th className="py-2">Producto</th><th>Unidades</th><th>Ingresos</th><th>Costo</th><th>Utilidad</th><th>Margen</th>
                </tr></thead>
                <tbody>
                  {g.rows.map((r, i) => (
                    <tr key={i} className="border-b border-border/30">
                      <td className="py-2">{r.name}</td>
                      <td>{r.unitsSold}</td>
                      <td>${r.revenue.toLocaleString('es-CL')}</td>
                      <td>{r.cost != null ? `$${r.cost.toLocaleString('es-CL')}` : '—'}</td>
                      <td>{r.profit != null ? `$${r.profit.toLocaleString('es-CL')}` : '—'}</td>
                      <td>{r.marginPercent != null ? `${r.marginPercent}%` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
          {rows.length === 0 && <p className="py-4 text-center text-sm text-muted-foreground">Sin ventas todavía.</p>}
        </div>
      </CardContent>
    </Card>
  );
}

/** Descarga CSV/PDF + envío por email consolidado de un sub-tab entero
 * (Ventas o Gastos), pedido explícito del usuario: un solo botón por
 * sub-tab en vez de uno por cada tabla individual. El admin siempre recibe
 * el correo; el diálogo deja elegir además a qué operadores con email
 * cargado del evento mandárselo (el "staff que le corresponde al área"). */
/** Los cuatro reportes descargables del evento, juntos.
 *
 * El de resultado y el de movimientos no existían, y los otros dos vivían
 * escondidos dentro de sus pestañas, así que había que acordarse de dónde
 * estaba cada uno. Son PDF de verdad armados en el servidor (pdfkit), no una
 * página que el navegador imprime: se descargan, se adjuntan a un correo y se
 * ven igual en cualquier aparato. */
export function EventReportDownloads({ eventId }: { eventId: number }) {
  const isDemo = useIsDemo();

  const REPORTS = [
    { file: 'ventas', label: 'Ventas del evento', hint: 'De dónde salió la plata (web y caja, por medio de pago) y qué producto dejó margen.' },
    { file: 'gastos', label: 'Gastos del evento', hint: 'Cada compra con su fecha, proveedor, documento y forma de pago.' },
    { file: 'resultado', label: 'Resultado (P&L)', hint: 'Qué entró, qué se fue restando y cuánto quedó. Con el IVA del período si el evento se declara.' },
    { file: 'movimientos', label: 'Movimientos detallados', hint: 'El registro completo de los terminales, operación por operación. No se puede editar ni borrar.' },
  ];

  return (
    <Card className="rounded-2xl border-0 shadow-md shadow-black/5">
      <CardHeader>
        <CardTitle>Descargar reportes de este evento</CardTitle>
        <p className="text-sm text-muted-foreground">
          Todos en hora de Chile y con la fecha de emisión impresa, para que sirvan como respaldo.
        </p>
      </CardHeader>
      <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {REPORTS.map((r) => (
          <div key={r.file} className="rounded-xl border border-border/50 p-4 flex flex-col gap-2">
            <div>
              <p className="font-semibold text-sm">{r.label}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{r.hint}</p>
            </div>
            {isDemo ? (
              <Button variant="outline" size="sm" disabled title={DEMO_TOOLTIP} className="self-start">Descargar PDF</Button>
            ) : (
              <a href={`/api/admin/gastos/${r.file}.pdf?eventId=${eventId}`} target="_blank" rel="noopener noreferrer" className="self-start">
                <Button variant="outline" size="sm" className="interactive">
                  <Download className="w-4 h-4 mr-2" /> Descargar PDF
                </Button>
              </a>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export function ReportToolbar({ eventId, kind }: { eventId: number; kind: 'ventas' | 'gastos' }) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const { data: operators } = trpc.operators.listAll.useQuery({ eventId });
  const onReportEmailResult = (res: { emailSent: boolean }) => {
    setOpen(false);
    if (res.emailSent) toast.success('Reporte enviado');
    else toast.warning('No se pudo enviar el correo');
  };
  const emailVentas = trpc.cajaReports.emailVentasReport.useMutation({ onSuccess: onReportEmailResult, onError: onMutationError });
  const emailGastos = trpc.cajaReports.emailGastosReport.useMutation({ onSuccess: onReportEmailResult, onError: onMutationError });
  const sending = emailVentas.isPending || emailGastos.isPending;
  const withEmail = (operators ?? []).filter((o: any) => o.email);

  const send = () => {
    const mutate = kind === 'ventas' ? emailVentas.mutate : emailGastos.mutate;
    mutate({ eventId, recipientEmails: selected });
  };

  // Las descargas se sirven por rutas Express que exigen rol admin, así que
  // para el invitado de demostración devolverían un 403 crudo: mejor
  // mostrarlas deshabilitadas y no dejar que abra una pestaña con el error.
  const isDemo = useIsDemo();
  const download = (ext: 'csv' | 'pdf') =>
    isDemo ? (
      <Button variant="outline" size="sm" disabled title={DEMO_TOOLTIP}>Descargar {ext.toUpperCase()}</Button>
    ) : (
      <a href={`/api/admin/gastos/${kind}.${ext}?eventId=${eventId}`} target="_blank" rel="noopener noreferrer">
        <Button variant="outline" size="sm">Descargar {ext.toUpperCase()}</Button>
      </a>
    );

  return (
    <div className="flex flex-wrap items-center gap-2">
      {download('csv')}
      {download('pdf')}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button variant="outline" size="sm" disabled={isDemo} title={isDemo ? DEMO_TOOLTIP : undefined}>Enviar por email</Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader><DialogTitle>Enviar reporte de {kind === 'ventas' ? 'ventas' : 'gastos'}</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Siempre te llega a ti. Elige además a quién del staff (con email cargado en su ficha de operador) se lo mandamos.</p>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {withEmail.map((o: any) => (
              <label key={o.id} className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={selected.includes(o.email)}
                  onCheckedChange={(v) => setSelected(v ? [...selected, o.email] : selected.filter((e) => e !== o.email))}
                />
                {o.name} <span className="text-xs text-muted-foreground capitalize">({o.role})</span>
              </label>
            ))}
            {withEmail.length === 0 && <p className="text-sm text-muted-foreground">Ningún operador de este evento tiene email cargado todavía.</p>}
          </div>
          <WriteButton onClick={send} disabled={sending} className="interactive">{sending ? 'Enviando…' : 'Enviar'}</WriteButton>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Rendición con el proveedor de cocina (pedido explícito del usuario): de
 * lo vendido en productos `toKitchen` del evento, cuánto le corresponde a
 * él y cuánto queda para la productora. El email/nombre del proveedor se
 * carga una sola vez en Ajustes. */
export function KitchenVendorReportCard({ eventId }: { eventId: number }) {
  const { data } = trpc.cajaReports.kitchenVendorReport.useQuery({ eventId });
  const { data: settings } = trpc.settings.get.useQuery();
  const send = trpc.cajaReports.sendKitchenVendorReport.useMutation({
    onSuccess: (res) => {
      if (res.emailSent) toast.success('Rendición enviada al proveedor');
      else toast.warning('No se pudo enviar el correo -- revisa RESEND_API_KEY');
    },
    onError: onMutationError,
  });
  const vendorEmail = (settings as any)?.kitchenVendorEmail;
  const rows = data?.products ?? [];

  return (
    <Card className="rounded-2xl border-0 shadow-md shadow-black/5">
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle>Reporte de cocina</CardTitle>
        <WriteButton size="sm" disabled={!vendorEmail || send.isPending} onClick={() => send.mutate({ eventId })}>
          {send.isPending ? 'Enviando…' : 'Enviar al proveedor'}
        </WriteButton>
      </CardHeader>
      <CardContent className="space-y-3">
        {!vendorEmail && <p className="text-xs text-muted-foreground">No hay email de proveedor cargado -- anda a Ajustes → Proveedor de cocina.</p>}
        {data && (
          <p className="text-sm text-muted-foreground">
            Ingresos: ${data.totalRevenue.toLocaleString('es-CL')} · Proveedor: ${data.vendorShare.toLocaleString('es-CL')} · Productora: ${data.venueShare.toLocaleString('es-CL')}
          </p>
        )}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-muted-foreground border-b border-border/50">
              <th className="py-2">Producto</th><th>Unidades</th><th>Ingresos</th><th>Proveedor</th><th>Productora</th>
            </tr></thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-b border-border/30">
                  <td className="py-2">{r.name}</td>
                  <td>{r.quantity}</td>
                  <td>${r.revenue.toLocaleString('es-CL')}</td>
                  <td>${r.vendorShare.toLocaleString('es-CL')}</td>
                  <td>${r.venueShare.toLocaleString('es-CL')}</td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={5} className="py-4 text-center text-muted-foreground">Sin ventas de cocina todavía.</td></tr>}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

/** Selector de eventos para comparativas (pedido explícito del usuario):
 * chips que se togglean individualmente. Sin ninguno seleccionado = "todos
 * los eventos" (mismo significado que `eventIds` vacío/undefined en el
 * backend), así que no hace falta un botón "Todos" aparte. */
export function EventMultiSelect({
  events, selected, onChange,
}: { events: any[]; selected: number[]; onChange: (ids: number[]) => void }) {
  const toggle = (id: number) => {
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  };
  return (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        onClick={() => onChange([])}
        className={`text-xs px-3 py-1 rounded-full border transition-colors ${selected.length === 0 ? 'bg-primary text-primary-foreground border-primary' : 'bg-muted/30 border-border/50 text-muted-foreground'}`}
      >
        Todos los eventos
      </button>
      {events.map((e: any) => (
        <button
          key={e.id}
          type="button"
          onClick={() => toggle(e.id)}
          className={`text-xs px-3 py-1 rounded-full border transition-colors ${selected.includes(e.id) ? 'bg-primary text-primary-foreground border-primary' : 'bg-muted/30 border-border/50 text-muted-foreground'}`}
        >
          {e.title}
        </button>
      ))}
    </div>
  );
}

export function EventComparisonReport({ events }: { events: any[] }) {
  const [selectedEventIds, setSelectedEventIds] = useState<number[]>([]);
  const { data } = trpc.cajaReports.eventComparison.useQuery({ eventIds: selectedEventIds.length ? selectedEventIds : undefined });
  const rows = data ?? [];

  return (
    <Card className="rounded-2xl border-0 shadow-md shadow-black/5">
      <CardHeader><CardTitle>Comparativa entre eventos (solo productos)</CardTitle></CardHeader>
      <CardContent className="overflow-x-auto space-y-3">
        <p className="text-xs text-muted-foreground">Ingresos a precio de lista y utilidad sobre el costo de los productos. La comparativa con la utilidad neta real está en <strong>Gastos y P&amp;L</strong>.</p>
        <EventMultiSelect events={events} selected={selectedEventIds} onChange={setSelectedEventIds} />
        <table className="w-full text-sm">
          <thead><tr className="text-left text-muted-foreground border-b border-border/50">
            <th className="py-2">Evento</th><th>Fecha</th><th>Entradas vendidas</th><th>Ingresos</th><th>Utilidad</th><th>Operadores activos</th><th>Cajas activas</th>
          </tr></thead>
          <tbody>
            {rows.map((r: any) => (
              <tr key={r.eventId} className="border-b border-border/30">
                <td className="py-2">{r.title}</td>
                <td>{new Date(r.eventDate).toLocaleDateString('es-CL', { timeZone: 'America/Santiago' })}</td>
                <td>{r.unitsSold}</td>
                <td>${r.revenue.toLocaleString('es-CL')}</td>
                <td>{r.profit != null ? `$${r.profit.toLocaleString('es-CL')}` : '—'}</td>
                <td>{r.activeOperators}</td>
                <td>{r.activeRegisters}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={7} className="py-4 text-center text-muted-foreground">Sin datos para los eventos seleccionados.</td></tr>}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

/* ─── Gastos y resultado (P&L) ──────────────────────────────── */

export const emptyExpenseForm = {
  scope: 'evento' as 'evento' | 'general',
  eventId: null as number | null,
  expenseDate: '',
  category: 'produccion' as ExpenseCategory,
  description: '',
  supplier: '',
  supplierRut: '',
  documentNumber: '',
  documentType: 'boleta' as ExpenseDocumentType,
  ivaExempt: false,
  amountTotal: 0,
  paymentMethod: 'transferencia' as ExpensePaymentMethod,
  recurrence: 'none' as 'none' | 'mensual' | 'por_evento',
  excludeFromPnl: false,
  prorate: true,
  notes: '',
  receiptUrl: '',
  // Turno de cuyo cajón salió el efectivo, cuando se pagó en efectivo durante
  // el evento. `null` = no salió de ninguna caja (plata de la productora).
  paidFromShiftId: null as number | null,
};

export function ExpenseForm({ events, onSaved }: { events: any[]; onSaved: () => void }) {
  const [show, setShow] = useState(false);
  const [form, setForm] = useState(emptyExpenseForm);
  // Solo tiene sentido preguntar por el cajón si el gasto es en efectivo y de
  // un evento puntual, así que la consulta se hace recién ahí.
  const cashFromDrawerApplies = form.paymentMethod === 'efectivo' && form.scope === 'evento' && !!form.eventId;
  const { data: openShifts } = trpc.cajaReports.openShifts.useQuery(
    { eventId: form.eventId ?? undefined },
    { enabled: cashFromDrawerApplies },
  );
  const create = trpc.expenses.create.useMutation({
    onSuccess: () => { onSaved(); toast.success('Gasto registrado'); setForm(emptyExpenseForm); setShow(false); },
    onError: onMutationError,
  });
  const scanReceipt = trpc.expenses.scanReceipt.useMutation({
    onSuccess: (result) => {
      if (!result.isReceipt) {
        toast.error('No pudimos leer la foto como boleta o factura -- completa el formulario a mano.');
        return;
      }
      setForm((f) => ({
        ...f,
        amountTotal: result.amountTotal || f.amountTotal,
        documentType: result.documentType || f.documentType,
        documentNumber: result.documentNumber || f.documentNumber,
        expenseDate: result.expenseDate ? toChileInputValue(result.expenseDate) : f.expenseDate,
        supplier: result.supplier || f.supplier,
        supplierRut: result.supplierRut || f.supplierRut,
        category: result.category || f.category,
        description: result.description || f.description,
        ivaExempt: result.ivaExempt || f.ivaExempt,
      }));
      if (result.confidence !== 'alta' || result.notes) {
        toast.warning(result.notes || 'Revisa los datos leídos antes de guardar -- algunos no se ven del todo claros.');
      } else {
        toast.success('Boleta leída -- revisa los datos y guarda.');
      }
    },
    onError: onMutationError,
  });
  const handleScan = (imageUrl: string) => {
    const hasData = form.amountTotal > 0 || form.description.trim().length > 0 || form.documentNumber.trim().length > 0;
    if (hasData && !window.confirm('Ya hay datos cargados en el formulario -- esto los va a reemplazar con lo que lea la foto. ¿Continuar?')) {
      return;
    }
    setForm((f) => ({ ...f, receiptUrl: imageUrl }));
    scanReceipt.mutate({ imageUrl });
  };

  // Vista previa del desglose: solo la factura no exenta separa IVA.
  const preview = deriveAmounts({ amountTotal: form.amountTotal, documentType: form.documentType, ivaExempt: form.ivaExempt });

  const canSave = form.amountTotal > 0 && form.description.trim().length > 0
    && (form.scope === 'general' || form.recurrence === 'por_evento' || !!form.eventId);

  const handleSave = () => {
    create.mutate({
      ...form,
      supplier: form.supplier || undefined,
      supplierRut: form.supplierRut || undefined,
      documentNumber: form.documentNumber || undefined,
      notes: form.notes || undefined,
      receiptUrl: form.receiptUrl || undefined,
      eventId: form.scope === 'evento' ? form.eventId : null,
      // Si el gasto dejó de ser en efectivo (o de un evento) después de
      // haber elegido caja, la marca se limpia: si no, el cierre de ese
      // turno restaría plata que nunca salió del cajón.
      paidFromShiftId: cashFromDrawerApplies ? form.paidFromShiftId : null,
      expenseDate: form.expenseDate ? fromChileInputValue(form.expenseDate) : new Date().toISOString(),
    } as any);
  };

  return (
    <Card className="rounded-2xl border-0 shadow-md shadow-black/5">
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold">Registrar un gasto</h3>
            <p className="text-xs text-muted-foreground mt-0.5">Cada compra de la productora: quién, cuánto, con qué documento y cómo se pagó.</p>
          </div>
          <Button onClick={() => setShow(!show)} className="interactive"><Plus className="w-4 h-4 mr-2" /> Nuevo gasto</Button>
        </div>

        {show && (
          <div className="mt-5 space-y-4 border-t border-border/50 pt-4">
            <div className="rounded-xl bg-muted/40 px-4 py-3">
              <div className="flex flex-wrap items-center gap-3">
                <CameraCaptureField
                  label="Escanear boleta o factura"
                  pathPrefix="expenses"
                  onScanned={handleScan}
                  analyzing={scanReceipt.isPending}
                />
                {form.receiptUrl && (
                  <a href={form.receiptUrl} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline">
                    Ver foto completa
                  </a>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Opcional: sácale una foto y la IA precarga monto, documento, proveedor y categoría -- siempre revisa antes de guardar.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label>¿A qué se imputa?</Label>
                <Select
                  value={form.scope}
                  disabled={form.recurrence !== 'none'}
                  onValueChange={(v) => setForm({ ...form, scope: v as 'evento' | 'general' })}
                >
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="evento">Un evento puntual</SelectItem>
                    <SelectItem value="general">La productora (se reparte entre los eventos del mes)</SelectItem>
                  </SelectContent>
                </Select>
                {form.recurrence === 'mensual' && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Las suscripciones van siempre a la productora y se reparten entre los eventos del mes.
                  </p>
                )}
                {form.recurrence === 'por_evento' && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Se copia solo a cada evento que hagas, completo. No elijas un evento acá: va a todos.
                  </p>
                )}
              </div>
              {form.scope === 'evento' && form.recurrence !== 'por_evento' && (
                <div>
                  <Label>Evento</Label>
                  <Select value={form.eventId ? String(form.eventId) : ''} onValueChange={(v) => setForm({ ...form, eventId: Number(v) })}>
                    <SelectTrigger className="mt-1"><SelectValue placeholder="Elegir evento" /></SelectTrigger>
                    <SelectContent>
                      {events.map((e: any) => <SelectItem key={e.id} value={String(e.id)}>{e.title}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div>
                <Label>Categoría</Label>
                <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v as ExpenseCategory })}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {EXPENSE_CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.emoji} {c.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-2">
                <Label>¿Qué se compró?</Label>
                <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="mt-1" placeholder="Hielo, DJ, arriendo de luces…" />
              </div>
              <div>
                <Label>Monto total pagado</Label>
                <Input type="number" value={form.amountTotal || ''} onChange={(e) => setForm({ ...form, amountTotal: Number(e.target.value) })} className="mt-1" placeholder="45000" />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <Label>Documento</Label>
                <Select value={form.documentType} onValueChange={(v) => setForm({ ...form, documentType: v as ExpenseDocumentType })}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {EXPENSE_DOCUMENT_TYPES.map((d) => <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>N° de documento</Label>
                <Input value={form.documentNumber} onChange={(e) => setForm({ ...form, documentNumber: e.target.value })} className="mt-1" placeholder="Folio" />
              </div>
              <div>
                <Label>Forma de pago</Label>
                <Select value={form.paymentMethod} onValueChange={(v) => setForm({ ...form, paymentMethod: v as ExpensePaymentMethod })}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {EXPENSE_PAYMENT_METHODS.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Fecha del gasto</Label>
                <Input type="datetime-local" value={form.expenseDate} onChange={(e) => setForm({ ...form, expenseDate: e.target.value })} className="mt-1" />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label>Proveedor</Label>
                <Input value={form.supplier} onChange={(e) => setForm({ ...form, supplier: e.target.value })} className="mt-1" placeholder="Opcional" />
              </div>
              <div>
                <Label>RUT del proveedor</Label>
                <Input value={form.supplierRut} onChange={(e) => setForm({ ...form, supplierRut: e.target.value })} className="mt-1" placeholder="Opcional" />
              </div>
              <div>
                <Label>Notas</Label>
                <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="mt-1" placeholder="Opcional" />
              </div>
            </div>

            {/* Efectivo sacado del cajón durante la fiesta (hielo de última
                hora, propina al proveedor). Marcarlo acá es lo que hace que
                el cierre de ESA caja no lo lea como plata faltante. */}
            {cashFromDrawerApplies && (
              <div>
                <Label>¿Salió del cajón de alguna caja?</Label>
                <Select
                  value={form.paidFromShiftId ? String(form.paidFromShiftId) : 'none'}
                  onValueChange={(v) => setForm({ ...form, paidFromShiftId: v === 'none' ? null : Number(v) })}
                >
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No — se pagó con plata de la productora</SelectItem>
                    {(openShifts ?? []).map((s: any) => (
                      <SelectItem key={s.id} value={String(s.id)}>
                        {s.registerName} · abrió {s.operatorName} ({formatChileDateTime(s.openedAt)})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1">
                  {(openShifts ?? []).length === 0
                    ? 'No hay turnos abiertos en este evento ahora mismo. Se marca solo mientras la caja está abierta: al cerrarla, el monto se descuenta del efectivo esperado.'
                    : 'Al cerrar esa caja, este monto se descuenta del efectivo esperado -- si no lo marcas, aparece como faltante.'}
                </p>
              </div>
            )}

            {form.documentType === 'factura' && (
              <div className="rounded-xl bg-muted/40 px-4 py-3 text-sm">
                {form.ivaExempt
                  ? <>Factura <strong>exenta</strong>: no da crédito fiscal, entra completa como costo.</>
                  : <>Neto <strong>${preview.netAmount.toLocaleString('es-CL')}</strong> · IVA <strong>${preview.ivaAmount.toLocaleString('es-CL')}</strong> <span className="text-muted-foreground">(crédito fiscal)</span></>}
              </div>
            )}

            <div className="flex flex-wrap gap-x-6 gap-y-2">
              {form.documentType === 'factura' && (
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input type="checkbox" checked={form.ivaExempt} onChange={(e) => setForm({ ...form, ivaExempt: e.target.checked })} className="w-4 h-4 accent-primary" />
                  <span className="text-sm">Factura exenta (sin IVA)</span>
                </label>
              )}
              {/* Dos formas de repetirse, porque los eventos de esta
                  productora NO son mensuales: hay meses con dos fiestas y
                  meses sin ninguna. Una suscripción sigue el calendario y es
                  de la productora; un costo fijo de fiesta (el DJ, la
                  seguridad) sigue a los eventos y se carga completo a cada
                  uno. Atar el segundo al calendario cobraba de más los meses
                  con dos fiestas y de menos los meses sin ninguna. */}
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={form.recurrence === 'mensual'}
                  onChange={(e) => setForm({
                    ...form,
                    recurrence: e.target.checked ? 'mensual' : 'none',
                    ...(e.target.checked ? { scope: 'general' as const, eventId: null } : {}),
                  })}
                  className="w-4 h-4 accent-primary"
                />
                <span className="text-sm">Se repite todos los meses (suscripción de la productora)</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={form.recurrence === 'por_evento'}
                  onChange={(e) => setForm({
                    ...form,
                    recurrence: e.target.checked ? 'por_evento' : 'none',
                    ...(e.target.checked ? { scope: 'evento' as const, eventId: null } : {}),
                  })}
                  className="w-4 h-4 accent-primary"
                />
                <span className="text-sm">Se repite en cada evento (DJ, seguridad, arriendo…)</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input type="checkbox" checked={form.excludeFromPnl} onChange={(e) => setForm({ ...form, excludeFromPnl: e.target.checked })} className="w-4 h-4 accent-primary" />
                <span className="text-sm">Ya contado en el costo del producto (no restar de nuevo)</span>
              </label>
              {form.scope === 'general' && (
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input type="checkbox" checked={!form.prorate} onChange={(e) => setForm({ ...form, prorate: !e.target.checked })} className="w-4 h-4 accent-primary" />
                  <span className="text-sm">No repartir entre los eventos</span>
                </label>
              )}
            </div>

            <div className="flex gap-2">
              <WriteButton onClick={handleSave} disabled={!canSave || create.isPending}>Guardar gasto</WriteButton>
              <Button variant="outline" onClick={() => setShow(false)}>Cancelar</Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** Una línea de la cascada del resultado. `negative` la muestra restando. */
export function PnlRow({ label, amount, negative, hint, strong }: { label: string; amount: number; negative?: boolean; hint?: string; strong?: boolean }) {
  return (
    <div className={`flex items-baseline justify-between gap-4 py-2 ${strong ? 'border-t border-border/60 mt-1 pt-3' : ''}`}>
      <div className="min-w-0">
        <span className={strong ? 'font-semibold' : ''}>{label}</span>
        {hint && <p className="text-xs text-muted-foreground mt-0.5">{hint}</p>}
      </div>
      <span className={`tabular-nums shrink-0 ${strong ? 'font-bold text-lg' : ''} ${negative ? 'text-muted-foreground' : ''} ${!negative && amount < 0 ? 'text-destructive' : ''}`}>
        {negative || amount < 0 ? '−' : ''}${Math.abs(amount).toLocaleString('es-CL')}
      </span>
    </div>
  );
}

export function EventPnlReport({ eventId, refreshKey }: { eventId: number; refreshKey: number }) {
  const { data, refetch } = trpc.cajaReports.eventPnl.useQuery({ eventId });
  // Simulación de presupuesto vinculada a este evento (si el admin la ligó
  // desde la pestaña "Presupuesto") -- comparación liviana, no toca la
  // lógica del P&L real de acá abajo.
  const { data: linkedSims } = trpc.budgetSimulations.listAll.useQuery({ eventId });
  useEffect(() => { refetch(); }, [refreshKey, refetch]);

  if (!data) return null;
  const positive = data.netProfit >= 0;
  const budgetedSim = linkedSims?.[0];
  const budgetedResult = budgetedSim ? computeBudgetResult(simFormFromRow(budgetedSim)) : null;

  return (
    <Card className="admin-clay border-0">
      <CardHeader><CardTitle>Resultado real de {data.title}</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        {budgetedResult && (
          <div className="admin-clay-sm p-4 space-y-2">
            <p className="text-xs uppercase tracking-wide text-muted-foreground font-semibold">
              Presupuestado ("{budgetedSim!.name}") → Real
            </p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
              <div><p className="text-muted-foreground text-xs">Ingreso</p><p className="tabular-nums">${budgetedResult.grossIncome.toLocaleString('es-CL')} → ${data.grossIncome.toLocaleString('es-CL')}</p></div>
              <div><p className="text-muted-foreground text-xs">Gastos fijos</p><p className="tabular-nums">${budgetedResult.pnl.directExpensesTotal.toLocaleString('es-CL')} → ${data.directExpensesTotal.toLocaleString('es-CL')}</p></div>
              <div><p className="text-muted-foreground text-xs">Margen</p><p className="tabular-nums">{budgetedResult.pnl.marginPercent ?? '—'}% → {data.marginPercent ?? '—'}%</p></div>
              <div><p className="text-muted-foreground text-xs">Utilidad</p><p className="tabular-nums">${budgetedResult.pnl.netProfit.toLocaleString('es-CL')} → ${data.netProfit.toLocaleString('es-CL')}</p></div>
            </div>
          </div>
        )}

        <PnlWarnings warnings={data.warnings} merchCheck={data.merchCheck} />

        <div className="text-sm">
          <PnlRow label="Plata que entró" amount={data.grossIncome} hint="Órdenes aprobadas, con descuentos ya aplicados y los copagos de Misión 300 incluidos." />
          {data.ivaApplies && (
            <PnlRow label="IVA débito (19%)" amount={data.iva.debitoFiscal} negative hint="Los precios son IVA incluido: esta parte nunca fue tuya." />
          )}
          <PnlRow label="Ingreso neto" amount={data.netIncome} />

          {data.cogs > 0 && (
            <PnlRow label="Costo de productos vendidos" amount={data.cogs} negative
              hint={`Desde el costo cargado en la carta. Cubre el ${data.cogsCoverage}% de las unidades vendidas.`} />
          )}
          <PnlRow label="Gastos directos del evento" amount={data.directExpensesTotal} negative />
          {data.generalExpensesMonthTotal > 0 && (
            <PnlRow label="Parte de los gastos de la productora" amount={data.generalExpensesAssigned} negative
              hint={`${Math.round(data.prorationWeight * 100)}% de $${data.generalExpensesMonthTotal.toLocaleString('es-CL')} del mes ${data.monthKey}, según cuánto ingreso hizo esta fiesta.`} />
          )}
          {data.ambassadorCommissions > 0 && (
            <PnlRow label="Comisiones de embajadores" amount={data.ambassadorCommissions} negative />
          )}
          {data.cardFeeAmount > 0 && (
            <PnlRow label={`Comisión de tarjeta (${data.cardFeePercent}%)`} amount={data.cardFeeAmount} negative
              hint="Sobre las ventas web (completo) y las de caja pagadas con débito, crédito o QR -- el efectivo no paga comisión." />
          )}

          <PnlRow label="Utilidad neta" amount={data.netProfit} strong />
        </div>

        <BentoGrid className="md:grid-cols-2">
          <StatTile
            icon={Percent}
            tone={positive ? 'success' : 'danger'}
            value={data.marginPercent != null ? `${data.marginPercent}%` : '—'}
            label="Margen"
          />
          {data.ivaApplies && (
            <div className="admin-clay p-5">
              <p className="text-sm font-semibold text-[var(--admin-muted)]">IVA a pagar al SII</p>
              <p className="font-heading text-3xl leading-none tabular-nums mt-2">${data.iva.ivaAPagar.toLocaleString('es-CL')}</p>
              <p className="text-sm text-[var(--admin-muted)] mt-1.5">
                Débito ${data.iva.debitoFiscal.toLocaleString('es-CL')} − crédito ${data.iva.creditoFiscal.toLocaleString('es-CL')}
                {data.iva.remanenteCredito > 0 && ` · remanente a favor $${data.iva.remanenteCredito.toLocaleString('es-CL')}`}
              </p>
            </div>
          )}
        </BentoGrid>

        {data.directByCategory.length > 0 && (
          <div>
            <p className="text-sm font-semibold mb-2">¿En qué se fue la plata?</p>
            <div className="space-y-1.5">
              {data.directByCategory.map((c: any) => {
                const pct = data.directExpensesTotal > 0 ? (c.amount / data.directExpensesTotal) * 100 : 0;
                return (
                  <div key={c.category} className="flex items-center gap-3 text-sm">
                    <span className="w-40 shrink-0">{categoryLabel(c.category)}</span>
                    <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                      <div className="h-full bg-primary/70 rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="w-28 text-right tabular-nums">${c.amount.toLocaleString('es-CL')}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <p className="text-xs text-muted-foreground border-t border-border/40 pt-3">
          El cálculo de IVA es una referencia para ver el margen, no reemplaza el F29 que presenta tu contador.
          {!data.ivaApplies && ' Este evento está marcado como que NO se declara al SII, así que todo va bruto.'}
        </p>
      </CardContent>
    </Card>
  );
}

export function PnlComparison({ refreshKey, events }: { refreshKey: number; events: any[] }) {
  const [selectedEventIds, setSelectedEventIds] = useState<number[]>([]);
  const { data, refetch } = trpc.cajaReports.pnlComparison.useQuery({ eventIds: selectedEventIds.length ? selectedEventIds : undefined });
  useEffect(() => { refetch(); }, [refreshKey, refetch]);
  const rows = data ?? [];

  return (
    <Card className="rounded-2xl border-0 shadow-md shadow-black/5">
      <CardHeader><CardTitle>Utilidad neta por evento</CardTitle></CardHeader>
      <CardContent className="overflow-x-auto space-y-3">
        <EventMultiSelect events={events} selected={selectedEventIds} onChange={setSelectedEventIds} />
        <table className="w-full text-sm">
          <thead><tr className="text-left text-muted-foreground border-b border-border/50">
            <th className="py-2">Evento</th><th>Fecha</th><th className="text-right">Entró</th><th className="text-right">Gastos</th><th className="text-right">Utilidad neta</th><th className="text-right">Margen</th>
          </tr></thead>
          <tbody>
            {rows.map((r: any) => (
              <tr key={r.eventId} className="border-b border-border/30">
                <td className="py-2">{r.title}{!r.ivaApplies && <span className="ml-2 text-xs text-muted-foreground">sin IVA</span>}</td>
                <td>{formatChileShortDate(r.eventDate)}</td>
                <td className="text-right tabular-nums">${r.grossIncome.toLocaleString('es-CL')}</td>
                <td className="text-right tabular-nums text-muted-foreground">${r.totalExpenses.toLocaleString('es-CL')}</td>
                <td className={`text-right tabular-nums font-semibold ${r.netProfit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive'}`}>
                  {r.netProfit < 0 ? '−' : ''}${Math.abs(r.netProfit).toLocaleString('es-CL')}
                </td>
                <td className="text-right tabular-nums">{r.marginPercent != null ? `${r.marginPercent}%` : '—'}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={6} className="py-4 text-center text-muted-foreground">Todavía no hay eventos.</td></tr>}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

/** Panel de preguntas simples sobre ventas/movimientos con IA (pedido
 * explícito del dueño, 02/09) -- responde solo con datos YA agregados del
 * sistema (server/adminQa.ts: getOrderStats, getSalesByUtmOrigin, el P&L del
 * evento seleccionado), nunca inventa un número que no tenga. Sin historial
 * persistido en base: las últimas preguntas/respuestas quedan solo en estado
 * local de esta sesión (se pierden al recargar) -- cada pregunta es
 * independiente, esto no es una conversación multi-turno. */
export function AdminAiQaPanel({ eventId }: { eventId: number | null }) {
  const [question, setQuestion] = useState('');
  const [history, setHistory] = useState<{ question: string; answer: string }[]>([]);
  const ask = trpc.cajaReports.askAi.useMutation({
    onSuccess: (data, variables) => {
      setHistory((h) => [{ question: variables.question, answer: data.answer }, ...h].slice(0, 5));
      setQuestion('');
    },
    onError: onMutationError,
  });

  const handleAsk = () => {
    if (question.trim().length < 3 || ask.isPending) return;
    ask.mutate({ question: question.trim(), eventId: eventId ?? undefined });
  };

  return (
    <Card className="rounded-2xl border-0 shadow-md shadow-black/5">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base"><Sparkles className="w-4 h-4 text-primary" /> Preguntale a la IA</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">Preguntas simples sobre ventas, origen y plata del evento seleccionado arriba -- si no tiene el dato, lo dice en vez de inventarlo.</p>
        <div className="flex flex-col sm:flex-row gap-2">
          <Input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Ej: ¿Cuánto llevamos vendido? ¿De dónde vienen más ventas?"
            onKeyDown={(e) => { if (e.key === 'Enter') handleAsk(); }}
          />
          <WriteButton onClick={handleAsk} disabled={ask.isPending || question.trim().length < 3}>
            {ask.isPending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Preguntando…</> : <><Sparkles className="w-4 h-4 mr-2" /> Preguntar</>}
          </WriteButton>
        </div>
        {history.length > 0 && (
          <div className="space-y-3 pt-2 border-t border-border/50">
            {history.map((h, i) => (
              <div key={i} className="text-sm">
                <p className="font-semibold">{h.question}</p>
                <p className="text-muted-foreground whitespace-pre-wrap mt-0.5">{h.answer}</p>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function GastosView() {
  const { openSection } = useContext(AdminNavContext);
  const { data: eventsData } = trpc.events.listAll.useQuery();
  const events = eventsData ?? [];
  const [eventId, setEventId] = useState<number | null>(null);
  const activeEventId = eventId ?? events[0]?.id ?? null;
  // Los reportes se recalculan del lado del servidor, así que después de
  // crear/borrar un gasto hay que pedirlos de nuevo.
  const [refreshKey, setRefreshKey] = useState(0);
  const refresh = () => setRefreshKey((k) => k + 1);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-heading text-2xl">Gastos y P&amp;L</h2>
          <p className="text-sm text-muted-foreground mt-0.5">Cuánto entró, cuánto salió y cuánto quedó en cada fiesta.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* Atajo al terminal de carga rápida (hub "Gastos"), dentro del
             mismo panel. /gastos sigue existiendo como app instalable. */}
          <Button size="sm" className="interactive rounded-full" onClick={() => openSection('cargar-gasto')}>
            <Plus className="w-4 h-4 mr-2" /> Cargar gasto
          </Button>
          {events.length > 0 && (
            <Select value={String(activeEventId)} onValueChange={(v) => setEventId(Number(v))}>
              <SelectTrigger className="w-64"><SelectValue /></SelectTrigger>
              <SelectContent>
                {events.map((e: any) => <SelectItem key={e.id} value={String(e.id)}>{e.title}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
        </div>
      </div>

      <AdminAiQaPanel eventId={activeEventId} />

      {activeEventId && <EventPnlReport eventId={activeEventId} refreshKey={refreshKey} />}
      {activeEventId && <EventReportDownloads eventId={activeEventId} />}
      <PnlComparison refreshKey={refreshKey} events={events} />

      <Tabs defaultValue="ventas">
        <TabsList>
          <TabsTrigger value="ventas">Ventas</TabsTrigger>
          <TabsTrigger value="gastos">Gastos</TabsTrigger>
        </TabsList>
        <TabsContent value="ventas" className="space-y-6 mt-4">
          {activeEventId && <ReportToolbar eventId={activeEventId} kind="ventas" />}
          {activeEventId && <ProfitReport eventId={activeEventId} />}
          {activeEventId && <KitchenVendorReportCard eventId={activeEventId} />}
          <EventComparisonReport events={events} />
          {activeEventId && <PeakHoursReport eventId={activeEventId} />}
          <ShiftClosingsReport events={events} />
        </TabsContent>
        <TabsContent value="gastos" className="space-y-6 mt-4">
          {activeEventId && <ReportToolbar eventId={activeEventId} kind="gastos" />}
          <ExpenseForm events={events} onSaved={refresh} />
          <ExpensesList events={events} refreshKey={refreshKey} onChanged={refresh} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/** Ítem propio del menú (grupo Negocio) -- antes vivía como pestaña dentro
 * de Gastos y P&L, se separó para que se pueda armar/comparar simulaciones
 * sin tener que entrar a esa sección. Misma función `BudgetSimulatorTab` de
 * siempre, todo se mantiene igual (guardar, comparar, vincular a evento). */
export function EventBudgetSimulatorView() {
  const { data: eventsData } = trpc.events.listAll.useQuery();
  const events = eventsData ?? [];
  return <BudgetSimulatorTab events={events} />;
}

/* ─── Simulador de presupuesto pre-evento ──────────────────── */

export const emptyRevenueTier = (): RevenueTier => ({ label: '', price: 0, expectedQty: 0, personasPorEntrada: 1 });

export const emptyExpenseLine = (): BudgetExpenseLine => ({ category: 'produccion', label: '', amount: 0, ivaMode: 'incluido' });

export type SimForm = Omit<BudgetSimulationInput, 'extraIncomes'> & { name: string; extraIncomes: ExtraIncomeLine[] };

export function emptySimForm(cardFeeDefault: number): SimForm {
  return {
    name: '',
    ivaApplies: false,
    onlineSalesNoIva: false,
    marginTargetPercent: 30,
    cardFeePercent: cardFeeDefault,
    commissionPercent: 0,
    variableCostPerPerson: 0,
    otherRevenuePerPerson: 0,
    venueBarSharePercent: 0,
    extraIncomes: [],
    revenueTiers: [emptyRevenueTier()],
    expenseLines: [emptyExpenseLine()],
  };
}

export function simFormFromRow(row: any): SimForm {
  return {
    name: row.name,
    ivaApplies: !!row.ivaApplies,
    onlineSalesNoIva: !!row.onlineSalesNoIva,
    marginTargetPercent: Number(row.marginTargetPercent),
    cardFeePercent: Number(row.cardFeePercent),
    commissionPercent: Number(row.commissionPercent),
    variableCostPerPerson: Number(row.variableCostPerPerson),
    otherRevenuePerPerson: Number(row.otherRevenuePerPerson),
    venueBarSharePercent: Number(row.venueBarSharePercent ?? 0),
    extraIncomes: Array.isArray(row.extraIncomes) ? row.extraIncomes : [],
    revenueTiers: Array.isArray(row.revenueTiers) ? row.revenueTiers : [],
    expenseLines: Array.isArray(row.expenseLines) ? row.expenseLines : [],
  };
}

export function BudgetStatusBadge({ status }: { status: BudgetResult['status'] }) {
  const map = {
    ok: { label: 'Dentro del margen', className: 'bg-emerald-500/15 text-emerald-600' },
    warning: { label: 'Al límite', className: 'bg-amber-500/15 text-amber-600' },
    danger: { label: 'Fuera del margen', className: 'bg-destructive/15 text-destructive' },
  } as const;
  const s = map[status];
  return <span className={`px-2 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap ${s.className}`}>{s.label}</span>;
}

export function BudgetSimulatorTab({ events }: { events: any[] }) {
  const { data: simsData, refetch } = trpc.budgetSimulations.listAll.useQuery();
  const sims = simsData ?? [];
  const { data: settings } = trpc.settings.get.useQuery();
  const cardFeeDefault = Number(settings?.cardFeePercent ?? 0);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const [compareIds, setCompareIds] = useState<number[]>([]);

  const deleteSim = trpc.budgetSimulations.delete.useMutation({
    onSuccess: () => { refetch(); toast.success('Simulación eliminada'); setCompareIds((ids) => ids.filter((id) => id !== editingId)); },
    onError: onMutationError,
  });

  const editingRow = editingId ? sims.find((s: any) => s.id === editingId) : null;

  const toggleCompare = (id: number) => {
    setCompareIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-heading text-2xl">Simulador de Evento</h2>
          <p className="text-sm text-muted-foreground mt-0.5 max-w-2xl">
            Calcula ANTES de crear el evento cuánto puedes gastar sin perder tu margen mínimo, y cuántas entradas
            necesitas vender para no perder plata. No toca ningún gasto ni venta real.
          </p>
        </div>
        {!creating && !editingId && (
          <Button onClick={() => setCreating(true)} className="interactive"><Plus className="w-4 h-4 mr-2" /> Nueva simulación</Button>
        )}
      </div>

      {(creating || editingRow) && (
        <BudgetSimulatorForm
          key={editingId ?? 'new'}
          initial={editingRow ? simFormFromRow(editingRow) : emptySimForm(cardFeeDefault)}
          simId={editingId}
          events={events}
          linkedEventId={editingRow?.eventId ?? null}
          onSaved={() => { refetch(); setCreating(false); setEditingId(null); }}
          onCancel={() => { setCreating(false); setEditingId(null); }}
        />
      )}

      {compareIds.length >= 2 && (
        <BudgetCompareTable sims={sims.filter((s: any) => compareIds.includes(s.id))} />
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {sims.map((s: any) => {
          const result = computeBudgetResult(simFormFromRow(s));
          const eventTitle = events.find((e: any) => e.id === s.eventId)?.title;
          return (
            <Card key={s.id} className="admin-clay border-0">
              <CardContent className="pt-5 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold truncate">{s.name}</p>
                    {eventTitle ? (
                      <p className="text-xs text-primary mt-0.5 truncate">Vinculada a {eventTitle}</p>
                    ) : (
                      <p className="text-xs text-muted-foreground mt-0.5">Sin vincular</p>
                    )}
                  </div>
                  <BudgetStatusBadge status={result.status} />
                </div>
                <div className="text-sm space-y-1">
                  <p>Ingreso proyectado: <span className="font-semibold tabular-nums">${result.grossIncome.toLocaleString('es-CL')}</span></p>
                  <p>Margen resultante: <span className="font-semibold tabular-nums">{result.pnl.marginPercent != null ? `${result.pnl.marginPercent}%` : '—'}</span></p>
                  <p>Techo de gasto: <span className="font-semibold tabular-nums">${result.maxDirectExpenses.toLocaleString('es-CL')}</span></p>
                </div>
                <div className="flex items-center gap-2 pt-1">
                  <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
                    <Checkbox checked={compareIds.includes(s.id)} onCheckedChange={() => toggleCompare(s.id)} /> Comparar
                  </label>
                  <div className="ml-auto flex flex-wrap justify-end gap-2">
                    <BudgetReportActions ids={[s.id]} />
                    <Button size="sm" variant="outline" onClick={() => { setCreating(false); setEditingId(s.id); }}>Editar</Button>
                    <ConfirmDeleteButton description={`Vas a eliminar la simulación "${s.name}".`} onConfirm={(adminPassword) => deleteSim.mutateAsync({ id: s.id, adminPassword })} />
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
        {sims.length === 0 && !creating && (
          <p className="text-sm text-muted-foreground md:col-span-2 py-8 text-center">
            Todavía no hay simulaciones. Crea la primera con el botón de arriba.
          </p>
        )}
      </div>
    </div>
  );
}

export function BudgetCompareTable({ sims }: { sims: any[] }) {
  const rows = sims.map((s: any) => ({ ...s, result: computeBudgetResult(simFormFromRow(s)) }));
  return (
    <Card className="admin-clay border-0">
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle>Comparar simulaciones</CardTitle>
        <BudgetReportActions ids={sims.slice(0, 4).map((s: any) => s.id)} />
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left py-2 px-3">—</th>
              {rows.map((r) => <th key={r.id} className="text-left py-2 px-3">{r.name}</th>)}
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-border/50">
              <td className="py-2 px-3 text-muted-foreground">Aforo estimado</td>
              {rows.map((r) => <td key={r.id} className="py-2 px-3 tabular-nums">{r.result.attendance}</td>)}
            </tr>
            <tr className="border-b border-border/50">
              <td className="py-2 px-3 text-muted-foreground">Ingreso proyectado</td>
              {rows.map((r) => <td key={r.id} className="py-2 px-3 tabular-nums">${r.result.grossIncome.toLocaleString('es-CL')}</td>)}
            </tr>
            <tr className="border-b border-border/50">
              <td className="py-2 px-3 text-muted-foreground">Otros ingresos (estacionamiento…)</td>
              {rows.map((r) => <td key={r.id} className="py-2 px-3 tabular-nums">${r.result.extraIncomeTotal.toLocaleString('es-CL')}</td>)}
            </tr>
            <tr className="border-b border-border/50">
              <td className="py-2 px-3 text-muted-foreground">Parte del local (barra)</td>
              {rows.map((r) => <td key={r.id} className="py-2 px-3 tabular-nums">${r.result.venueBarShare.toLocaleString('es-CL')}</td>)}
            </tr>
            <tr className="border-b border-border/50">
              <td className="py-2 px-3 text-muted-foreground">Gastos fijos</td>
              {rows.map((r) => <td key={r.id} className="py-2 px-3 tabular-nums">${r.result.pnl.directExpensesTotal.toLocaleString('es-CL')}</td>)}
            </tr>
            <tr className="border-b border-border/50">
              <td className="py-2 px-3 text-muted-foreground">Techo de gasto</td>
              {rows.map((r) => <td key={r.id} className="py-2 px-3 tabular-nums">${r.result.maxDirectExpenses.toLocaleString('es-CL')}</td>)}
            </tr>
            <tr className="border-b border-border/50">
              <td className="py-2 px-3 text-muted-foreground">Margen resultante</td>
              {rows.map((r) => <td key={r.id} className="py-2 px-3 tabular-nums">{r.result.pnl.marginPercent != null ? `${r.result.pnl.marginPercent}%` : '—'}</td>)}
            </tr>
            <tr>
              <td className="py-2 px-3 text-muted-foreground">Punto de equilibrio</td>
              {rows.map((r) => <td key={r.id} className="py-2 px-3 tabular-nums">{r.result.breakevenTickets != null ? `${r.result.breakevenTickets} entradas` : '—'}</td>)}
            </tr>
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

export function BudgetSimulatorForm({ initial, simId, events, linkedEventId, onSaved, onCancel }: {
  initial: SimForm;
  simId: number | null;
  events: any[];
  linkedEventId: number | null;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<SimForm>(initial);
  const [eventToLink, setEventToLink] = useState<string>(linkedEventId ? String(linkedEventId) : '');
  const [filling, setFilling] = useState(false);
  const utils = trpc.useUtils();
  // Valor por auto que ya se le paga al local según Ajustes (se usa para prellenar).
  const { data: siteSettings } = trpc.settings.get.useQuery();
  const parkingFeeFromSettings = Number((siteSettings as any)?.parkingVenueFeeClp ?? 3000);

  const result = computeBudgetResult(form);

  const linkToEvent = trpc.budgetSimulations.linkToEvent.useMutation({ onError: onMutationError });

  /** Trae las tandas de acceso YA cargadas para el evento elegido, con su
   * precio real y cuántas se han vendido hasta ahora (ticketTypes.soldCount)
   * -- reemplaza las filas de tanda del formulario UNA vez; desde ahí sigue
   * 100% editable, no se vuelve a sincronizar solo. */
  const handleFillFromReal = async () => {
    if (!eventToLink) return;
    const hasData = form.revenueTiers.some((t) => t.label.trim() || t.price > 0 || t.expectedQty > 0);
    if (hasData && !window.confirm('Esto va a reemplazar las tandas que ya cargaste en el formulario por las ventas reales de este evento. ¿Continuar?')) {
      return;
    }
    setFilling(true);
    try {
      const rows = await utils.events.listTicketTypes.fetch({ eventId: Number(eventToLink) });
      const accesoRows = (rows ?? []).filter((r: any) => r.category === 'acceso');
      if (accesoRows.length === 0) {
        toast.error('Ese evento todavía no tiene tandas de acceso cargadas en Eventos.');
        return;
      }
      const tiers: RevenueTier[] = accesoRows.map((r: any) => ({
        label: r.name,
        price: Number(r.price),
        expectedQty: r.soldCount,
        personasPorEntrada: personasForAccesoSlug(r.accesoSlug),
      }));
      setForm((f) => ({ ...f, revenueTiers: tiers }));
      toast.success('Tandas rellenadas con las ventas reales -- edítalas libremente desde acá.');
    } catch (err) {
      onMutationError(err);
    } finally {
      setFilling(false);
    }
  };

  const create = trpc.budgetSimulations.create.useMutation({
    onSuccess: (res) => {
      if (eventToLink) linkToEvent.mutate({ id: res.id, eventId: Number(eventToLink) });
      toast.success('Simulación guardada');
      onSaved();
    },
    onError: onMutationError,
  });
  const update = trpc.budgetSimulations.update.useMutation({
    onSuccess: () => { toast.success('Simulación actualizada'); onSaved(); },
    onError: onMutationError,
  });

  const handleSave = () => {
    if (!form.name.trim()) { toast.error('Ponle un nombre a la simulación'); return; }
    // Las filas de "otros ingresos" totalmente vacías se descartan; las que
    // tienen datos necesitan nombre (el servidor lo exige).
    const extraIncomes = form.extraIncomes.filter((l) => l.label.trim() || l.unitPrice > 0 || l.quantity > 0);
    if (extraIncomes.some((l) => !l.label.trim())) { toast.error('Ponle un nombre a cada fila de "Otros ingresos"'); return; }
    const payload = { ...form, extraIncomes };
    if (simId) update.mutate({ id: simId, ...payload });
    else create.mutate(payload);
  };

  const handleLinkNow = () => {
    if (!simId || !eventToLink) return;
    linkToEvent.mutate({ id: simId, eventId: Number(eventToLink) }, {
      onSuccess: () => { toast.success('Vinculada al evento'); onSaved(); },
    });
  };

  const updateTier = (i: number, patch: Partial<RevenueTier>) => {
    setForm((f) => ({ ...f, revenueTiers: f.revenueTiers.map((t, idx) => (idx === i ? { ...t, ...patch } : t)) }));
  };
  const addTier = () => setForm((f) => ({ ...f, revenueTiers: [...f.revenueTiers, emptyRevenueTier()] }));
  const removeTier = (i: number) => setForm((f) => ({ ...f, revenueTiers: f.revenueTiers.filter((_, idx) => idx !== i) }));

  const updateExtra = (i: number, patch: Partial<ExtraIncomeLine>) => {
    setForm((f) => ({ ...f, extraIncomes: f.extraIncomes.map((l, idx) => (idx === i ? { ...l, ...patch } : l)) }));
  };
  const addExtra = (line: ExtraIncomeLine) => setForm((f) => ({ ...f, extraIncomes: [...f.extraIncomes, line] }));
  const removeExtra = (i: number) => setForm((f) => ({ ...f, extraIncomes: f.extraIncomes.filter((_, idx) => idx !== i) }));

  const updateLine = (i: number, patch: Partial<BudgetExpenseLine>) => {
    setForm((f) => ({ ...f, expenseLines: f.expenseLines.map((l, idx) => (idx === i ? { ...l, ...patch } : l)) }));
  };
  const addLine = () => setForm((f) => ({ ...f, expenseLines: [...f.expenseLines, emptyExpenseLine()] }));
  const removeLine = (i: number) => setForm((f) => ({ ...f, expenseLines: f.expenseLines.filter((_, idx) => idx !== i) }));

  const statusBarColor = result.status === 'ok' ? 'bg-emerald-500' : result.status === 'warning' ? 'bg-amber-500' : 'bg-destructive';
  const fillPct = result.maxDirectExpenses > 0
    ? Math.min(100, (result.pnl.directExpensesTotal / result.maxDirectExpenses) * 100)
    : (result.pnl.directExpensesTotal > 0 ? 100 : 0);

  return (
    <Card className="admin-clay border-0">
      <CardContent className="pt-6 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-2">
            <Label>Nombre de la simulación</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="mt-1" placeholder='Ej: "Opción A: entrada barata"' />
          </div>
          <div className="flex items-end gap-2 pb-2">
            <Checkbox id="sim-iva" checked={form.ivaApplies} onCheckedChange={(v) => setForm({ ...form, ivaApplies: v === true })} />
            <label htmlFor="sim-iva" className="text-sm cursor-pointer">Este evento aplica IVA</label>
          </div>
          {form.ivaApplies && (
            <div className="md:col-span-3 flex items-start gap-2 rounded-lg border border-border/60 bg-muted/30 px-3 py-2">
              <Checkbox id="sim-online-noiva" className="mt-0.5" checked={!!form.onlineSalesNoIva} onCheckedChange={(v) => setForm({ ...form, onlineSalesNoIva: v === true })} />
              <label htmlFor="sim-online-noiva" className="text-sm cursor-pointer">
                Entradas y compras online (estacionamiento) no declaran IVA
                <span className="block text-xs text-muted-foreground">Solo se les descuenta la comisión de la pasarela de pago. La barra sigue declarando IVA y los gastos con factura siguen recuperando su crédito.</span>
              </label>
            </div>
          )}
        </div>

        <div>
          <Label>Ingresos esperados, por tanda</Label>
          <p className="text-xs text-muted-foreground mt-1">
            Una fila por cada tramo de precio que va a tener la venta (ej. Founders, General, Última tanda).
          </p>
          <div className="hidden sm:grid sm:grid-cols-[1fr_110px_110px_130px_36px] gap-2 mt-3 mb-1 px-0.5">
            <span className="text-xs font-semibold text-muted-foreground">Nombre de la tanda</span>
            <span className="text-xs font-semibold text-muted-foreground">Precio ($)</span>
            <span className="text-xs font-semibold text-muted-foreground">Entradas esperadas</span>
            <span className="text-xs font-semibold text-muted-foreground">Personas/entrada</span>
            <span />
          </div>
          <div className="space-y-2">
            {form.revenueTiers.map((t, i) => (
              <div key={i} className="grid grid-cols-2 sm:grid-cols-[1fr_110px_110px_130px_36px] gap-2 items-center">
                <Input value={t.label} onChange={(e) => updateTier(i, { label: e.target.value })} placeholder="Ej: Founders" className="col-span-2 sm:col-span-1" />
                <div className="sm:hidden text-xs text-muted-foreground -mb-1">Precio ($)</div>
                <Input type="number" value={t.price} onChange={(e) => updateTier(i, { price: Number(e.target.value) })} placeholder="Precio" />
                <div className="sm:hidden text-xs text-muted-foreground -mb-1">Entradas esperadas</div>
                <Input type="number" value={t.expectedQty} onChange={(e) => updateTier(i, { expectedQty: Number(e.target.value) })} placeholder="Entradas" />
                <div className="sm:hidden text-xs text-muted-foreground -mb-1">Personas por entrada (1 = individual, 2 = Dúo...)</div>
                <Input type="number" value={t.personasPorEntrada} onChange={(e) => updateTier(i, { personasPorEntrada: Number(e.target.value) || 1 })} placeholder="Personas/entrada" />
                <Button variant="outline" size="sm" onClick={() => removeTier(i)} className="justify-self-start sm:justify-self-auto"><X className="w-3.5 h-3.5" /></Button>
              </div>
            ))}
          </div>
          <Button variant="outline" size="sm" className="mt-2" onClick={addTier}><Plus className="w-3.5 h-3.5 mr-1" /> Agregar tanda</Button>
        </div>

        <div>
          <Label>Otros ingresos (sin personas)</Label>
          <p className="text-xs text-muted-foreground mt-1">
            Ingresos que no son entradas ni barra, como el estacionamiento. <strong>No suman personas al aforo</strong>. Precio con IVA incluido; a la comisión de tarjeta se les aplica, a la de embajadores no.
          </p>
          {form.extraIncomes.length > 0 && (
            <div className="hidden sm:grid sm:grid-cols-[1fr_110px_110px_150px_36px] gap-2 mt-3 mb-1 px-0.5">
              <span className="text-xs font-semibold text-muted-foreground">Nombre</span>
              <span className="text-xs font-semibold text-muted-foreground">Precio ($)</span>
              <span className="text-xs font-semibold text-muted-foreground">Cantidad</span>
              <span className="text-xs font-semibold text-muted-foreground">Pago al local por unidad ($)</span>
              <span />
            </div>
          )}
          <div className="space-y-2 mt-2">
            {form.extraIncomes.map((l, i) => (
              <div key={i}>
                <div className="grid grid-cols-2 sm:grid-cols-[1fr_110px_110px_150px_36px] gap-2 items-center">
                  <Input value={l.label} onChange={(e) => updateExtra(i, { label: e.target.value })} placeholder="Ej: Estacionamiento" className="col-span-2 sm:col-span-1" />
                  <div className="sm:hidden text-xs text-muted-foreground -mb-1">Precio ($)</div>
                  <Input type="number" min={0} value={l.unitPrice} onChange={(e) => updateExtra(i, { unitPrice: Number(e.target.value) })} placeholder="Precio" />
                  <div className="sm:hidden text-xs text-muted-foreground -mb-1">Cantidad (ej. autos)</div>
                  <Input type="number" min={0} value={l.quantity} onChange={(e) => updateExtra(i, { quantity: Math.max(0, Math.round(Number(e.target.value))) })} placeholder="Cantidad" />
                  <div className="sm:hidden text-xs text-muted-foreground -mb-1">Pago al local por unidad ($)</div>
                  <Input type="number" min={0} value={l.venueCostPerUnit ?? 0} onChange={(e) => updateExtra(i, { venueCostPerUnit: Number(e.target.value) })} placeholder="Pago al local" />
                  <Button variant="outline" size="sm" onClick={() => removeExtra(i)} className="justify-self-start sm:justify-self-auto"><X className="w-3.5 h-3.5" /></Button>
                </div>
                {l.unitPrice * l.quantity > 0 && (
                  <p className="text-xs text-muted-foreground mt-1">
                    = ${(l.unitPrice * l.quantity).toLocaleString('es-CL')} de ingreso
                    {(l.venueCostPerUnit ?? 0) > 0 ? ` · $${((l.venueCostPerUnit ?? 0) * l.quantity).toLocaleString('es-CL')} para el local` : ''}
                  </p>
                )}
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-2 mt-2">
            <Button variant="outline" size="sm" onClick={() => addExtra({ label: 'Estacionamiento', unitPrice: 0, quantity: 0, venueCostPerUnit: parkingFeeFromSettings })}>
              <Plus className="w-3.5 h-3.5 mr-1" /> Agregar estacionamiento
            </Button>
            <Button variant="outline" size="sm" onClick={() => addExtra({ label: '', unitPrice: 0, quantity: 0, venueCostPerUnit: 0 })}>
              <Plus className="w-3.5 h-3.5 mr-1" /> Agregar otro ingreso
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label>Meta de margen neto mínimo (%)</Label>
            <Input type="number" value={form.marginTargetPercent} onChange={(e) => setForm({ ...form, marginTargetPercent: Number(e.target.value) })} className="mt-1" />
          </div>
          <div>
            <Label>Costo variable por persona ($)</Label>
            <Input type="number" value={form.variableCostPerPerson} onChange={(e) => setForm({ ...form, variableCostPerPerson: Number(e.target.value) })} className="mt-1" />
            <p className="text-xs text-muted-foreground mt-1">Bebida de bienvenida, pulsera, seguridad escalada, etc. -- se multiplica por el aforo estimado.</p>
          </div>
          <div>
            <Label>% comisión de embajadores (estimado)</Label>
            <Input type="number" value={form.commissionPercent} onChange={(e) => setForm({ ...form, commissionPercent: Number(e.target.value) })} className="mt-1" />
          </div>
          <div>
            <Label>% comisión de tarjeta</Label>
            <Input type="number" value={form.cardFeePercent} onChange={(e) => setForm({ ...form, cardFeePercent: Number(e.target.value) })} className="mt-1" />
          </div>
          <div>
            <Label>Venta de barra estimada por persona (opcional, $)</Label>
            <Input type="number" value={form.otherRevenuePerPerson} onChange={(e) => setForm({ ...form, otherRevenuePerPerson: Number(e.target.value) })} className="mt-1" />
          </div>
          <div>
            <Label>% de la barra que se lleva el local</Label>
            <Input
              type="number" min={0} max={100} step="0.5"
              value={form.venueBarSharePercent ?? 0}
              onChange={(e) => setForm({ ...form, venueBarSharePercent: Math.min(100, Math.max(0, Number(e.target.value) || 0)) })}
              className="mt-1"
              disabled={form.otherRevenuePerPerson <= 0}
            />
            <p className="text-xs text-muted-foreground mt-1">
              {form.otherRevenuePerPerson <= 0
                ? 'Primero carga la venta de barra estimada por persona.'
                : `Se calcula sobre la venta bruta de barra y se suma al arriendo fijo: = $${result.venueBarShare.toLocaleString('es-CL')} de $${result.otherRevenue.toLocaleString('es-CL')} de barra.`}
            </p>
          </div>
        </div>

        <div>
          <Label>Gastos fijos estimados</Label>
          <p className="text-xs text-muted-foreground mt-1">
            Todo lo que vas a pagar sí o sí para hacer la fiesta (arriendo, DJ, seguridad, sonido, staff, etc.).
          </p>
          <div className="hidden sm:grid sm:grid-cols-[160px_1fr_130px_130px_36px] gap-2 mt-3 mb-1 px-0.5">
            <span className="text-xs font-semibold text-muted-foreground">Categoría</span>
            <span className="text-xs font-semibold text-muted-foreground">Descripción</span>
            <span className="text-xs font-semibold text-muted-foreground">Monto ($)</span>
            <span className="text-xs font-semibold text-muted-foreground">IVA</span>
            <span />
          </div>
          <div className="space-y-2">
            {form.expenseLines.map((l, i) => {
              const amounts = expenseLineAmounts(l);
              return (
                <div key={i}>
                  <div className="grid grid-cols-1 sm:grid-cols-[160px_1fr_130px_130px_36px] gap-2 items-center">
                    <Select value={l.category} onValueChange={(v) => updateLine(i, { category: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {EXPENSE_CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.emoji} {c.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Input value={l.label} onChange={(e) => updateLine(i, { label: e.target.value })} placeholder="Ej: Arriendo del local" />
                    <Input type="number" value={l.amount} onChange={(e) => updateLine(i, { amount: Number(e.target.value) })} placeholder="Monto" />
                    <Select value={l.ivaMode ?? 'incluido'} onValueChange={(v) => updateLine(i, { ivaMode: v as ExpenseIvaMode })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="incluido">IVA incluido</SelectItem>
                        <SelectItem value="mas_iva">+ IVA (factura)</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button variant="outline" size="sm" onClick={() => removeLine(i)}><X className="w-3.5 h-3.5" /></Button>
                  </div>
                  {l.ivaMode === 'mas_iva' && l.amount > 0 && (
                    <p className="text-xs text-muted-foreground mt-1 sm:pl-[168px]">
                      Neto ${amounts.net.toLocaleString('es-CL')} + IVA ${amounts.iva.toLocaleString('es-CL')} = ${amounts.total.toLocaleString('es-CL')} con IVA
                      {form.ivaApplies ? ' · el IVA se recupera como crédito fiscal.' : ' · el evento no aplica IVA, así que todo es costo.'}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
          <Button variant="outline" size="sm" className="mt-2" onClick={addLine}><Plus className="w-3.5 h-3.5 mr-1" /> Agregar gasto</Button>
        </div>

        <div className="admin-clay-sm p-4 space-y-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <p className="text-sm font-semibold">Techo de gasto: ${result.maxDirectExpenses.toLocaleString('es-CL')}</p>
            <BudgetStatusBadge status={result.status} />
          </div>
          <div className="h-2.5 bg-muted rounded-full overflow-hidden">
            <div className={`h-full rounded-full transition-all ${statusBarColor}`} style={{ width: `${fillPct}%` }} />
          </div>
          <p className="text-xs text-muted-foreground">
            Gastos fijos cargados: ${result.pnl.directExpensesTotal.toLocaleString('es-CL')} de ${result.maxDirectExpenses.toLocaleString('es-CL')} disponibles para cumplir la meta de margen.
          </p>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm pt-1">
            <div><p className="text-muted-foreground text-xs">Aforo estimado</p><p className="font-semibold tabular-nums">{result.attendance}</p></div>
            <div><p className="text-muted-foreground text-xs">Ingreso proyectado</p><p className="font-semibold tabular-nums">${result.grossIncome.toLocaleString('es-CL')}</p></div>
            <div><p className="text-muted-foreground text-xs">Otros ingresos</p><p className="font-semibold tabular-nums">${result.extraIncomeTotal.toLocaleString('es-CL')}</p></div>
            <div><p className="text-muted-foreground text-xs">Pago al local (autos, etc.)</p><p className="font-semibold tabular-nums">${result.extraVenueCost.toLocaleString('es-CL')}</p></div>
            <div><p className="text-muted-foreground text-xs">Parte del local (barra)</p><p className="font-semibold tabular-nums">${result.venueBarShare.toLocaleString('es-CL')}</p></div>
            <div><p className="text-muted-foreground text-xs">Gastos fijos con IVA</p><p className="font-semibold tabular-nums">${result.fixedExpensesGross.toLocaleString('es-CL')}</p></div>
            <div><p className="text-muted-foreground text-xs">Margen resultante</p><p className="font-semibold tabular-nums">{result.pnl.marginPercent != null ? `${result.pnl.marginPercent}%` : '—'}</p></div>
            <div><p className="text-muted-foreground text-xs">Punto de equilibrio</p><p className="font-semibold tabular-nums">{result.breakevenTickets != null ? `${result.breakevenTickets} entradas` : '—'}</p></div>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Select value={eventToLink} onValueChange={setEventToLink}>
            <SelectTrigger className="w-64"><SelectValue placeholder="Elegir un evento real" /></SelectTrigger>
            <SelectContent>
              {events.map((e: any) => <SelectItem key={e.id} value={String(e.id)}>{e.title}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button
            variant="outline" size="sm"
            disabled={!eventToLink || filling}
            onClick={handleFillFromReal}
          >
            {filling ? 'Trayendo ventas…' : 'Rellenar con ventas reales'}
          </Button>
          {simId && (
            <Button
              variant="outline" size="sm"
              disabled={!eventToLink || Number(eventToLink) === linkedEventId || linkToEvent.isPending}
              onClick={handleLinkNow}
            >
              Vincular a este evento
            </Button>
          )}
          <div className="ml-auto flex gap-2">
            {simId != null && <BudgetReportActions ids={[simId]} size="default" />}
            <Button variant="outline" onClick={onCancel}>Cancelar</Button>
            <WriteButton onClick={handleSave} disabled={create.isPending || update.isPending}>Guardar simulación</WriteButton>
          </div>
        </div>
        <p className="text-xs text-muted-foreground -mt-4">
          "Rellenar con ventas reales" trae las tandas de acceso YA cargadas en ese evento con su precio y cuántas
          entradas se han vendido hasta ahora -- reemplaza las tandas de arriba una vez, después las editas libre.
          "Vincular a este evento" además guarda la conexión para comparar presupuestado vs. real en su P&L.
          {simId != null && ' El informe usa lo último que guardaste: guarda antes de descargarlo si cambiaste algo.'}
        </p>
      </CardContent>
    </Card>
  );
}

export function PeakHoursReport({ eventId }: { eventId: number }) {
  const { data } = trpc.cajaReports.peakHours.useQuery({ eventId });
  const rows = data ?? [];
  const max = Math.max(1, ...rows.map((r) => r.count));

  return (
    <Card className="rounded-2xl border-0 shadow-md shadow-black/5">
      <CardHeader><CardTitle>Horas punta</CardTitle></CardHeader>
      <CardContent>
        <div className="flex items-end gap-1 h-32">
          {rows.map((r) => (
            <div key={r.hour} className="flex-1 flex flex-col items-center justify-end gap-1">
              <div className="w-full bg-primary/60 rounded-t" style={{ height: `${(r.count / max) * 100}%`, minHeight: r.count > 0 ? 4 : 0 }} />
              <span className="text-[10px] text-muted-foreground">{r.hour}</span>
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground mt-2">Operaciones de caja (canjes + ventas) por hora del día.</p>
      </CardContent>
    </Card>
  );
}

/** Cuadres de caja guardados por turno (pedido explícito del usuario) --
 * comparables entre eventos porque quedan persistidos, no reconstruidos del
 * ledger. "Todos los eventos" por defecto para poder comparar fiestas. */
export function ShiftClosingsReport({ events }: { events: { id: number; title: string }[] }) {
  const [filterEventId, setFilterEventId] = useState<string>('all');
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const eventIdFilter = filterEventId === 'all' ? undefined : Number(filterEventId);
  const { data, refetch } = trpc.cajaReports.shiftClosings.useQuery({ eventId: eventIdFilter });
  const rows = data ?? [];

  const filterParams = () => {
    const params = new URLSearchParams();
    if (eventIdFilter) params.set('eventId', String(eventIdFilter));
    return params;
  };
  const exportUrl = () => `/api/admin/shifts/export.csv?${filterParams().toString()}`;
  const printUrl = () => `/admin/print/shifts?${filterParams().toString()}`;

  const diffLabel = (diff: number) => {
    if (Math.abs(diff) < 1) return <span className="text-green-500 font-semibold">✓ Cuadra</span>;
    if (diff > 0) return <span className="text-amber-500 font-semibold">▲ Sobran ${diff.toLocaleString('es-CL')}</span>;
    return <span className="text-red-500 font-semibold">▼ Faltan ${Math.abs(diff).toLocaleString('es-CL')}</span>;
  };

  return (
    <Card className="rounded-2xl border-0 shadow-md shadow-black/5">
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle>Cierres de turno (cuadre de caja)</CardTitle>
        <div className="flex items-center gap-2">
          <Select value={filterEventId} onValueChange={setFilterEventId}>
            <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los eventos</SelectItem>
              {events.map((e) => <SelectItem key={e.id} value={String(e.id)}>{e.title}</SelectItem>)}
            </SelectContent>
          </Select>
          <DownloadLink href={exportUrl()}>
            <Button variant="outline" size="sm" className="interactive">Exportar CSV</Button>
          </DownloadLink>
          <a href={printUrl()} target="_blank" rel="noopener noreferrer">
            <Button variant="outline" size="sm" className="interactive">Ver para imprimir</Button>
          </a>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {rows.length === 0 && <p className="text-sm text-muted-foreground">Sin turnos cerrados todavía.</p>}
        {rows.map((r: any) => (
          <div key={r.id} className="rounded-xl border border-border/50 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-semibold">{r.eventTitle} · {r.registerName}</p>
                <p className="text-xs text-muted-foreground">
                  {r.operatorName}{r.closedByName && r.closedByName !== r.operatorName ? ` (cerró ${r.closedByName})` : ''} ·{' '}
                  {formatChileDateTime(r.openedAt)} → {r.closedAt ? formatChileDateTime(r.closedAt) : '—'}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={() => setExpandedId(expandedId === r.id ? null : r.id)}>
                  {expandedId === r.id ? 'Ocultar detalle' : 'Ver detalle'}
                </Button>
                <DeleteShiftClosingButton shiftId={r.id} label={`${r.eventTitle} · ${r.registerName} (${formatChileDateTime(r.openedAt)})`} onDeleted={refetch} />
              </div>
            </div>

            {/* Cuatro medios de pago, no tres: el QR/transferencia se cobra
                en caja y se guarda desde siempre, pero este panel no lo
                mostraba -- esa plata quedaba fuera del cuadre a la vista. */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3 text-sm">
              <div className="rounded-lg bg-muted/50 p-3">
                <p className="text-xs text-muted-foreground mb-1">💵 Efectivo</p>
                <p>${r.countedCash.toLocaleString('es-CL')} contado</p>
                <p className="text-xs text-muted-foreground">${(r.expectedCash + r.openingCash).toLocaleString('es-CL')} esperado</p>
                {diffLabel(r.cashDiff)}
              </div>
              <div className="rounded-lg bg-muted/50 p-3">
                <p className="text-xs text-muted-foreground mb-1">💳 Débito</p>
                <p>${r.countedDebit.toLocaleString('es-CL')} contado</p>
                <p className="text-xs text-muted-foreground">${r.expectedDebit.toLocaleString('es-CL')} esperado</p>
                {diffLabel(r.debitDiff)}
              </div>
              <div className="rounded-lg bg-muted/50 p-3">
                <p className="text-xs text-muted-foreground mb-1">💳 Crédito</p>
                <p>${r.countedCredit.toLocaleString('es-CL')} contado</p>
                <p className="text-xs text-muted-foreground">${r.expectedCredit.toLocaleString('es-CL')} esperado</p>
                {diffLabel(r.creditDiff)}
              </div>
              <div className="rounded-lg bg-muted/50 p-3">
                <p className="text-xs text-muted-foreground mb-1">📱 QR/transferencia</p>
                <p>${(r.countedQr ?? 0).toLocaleString('es-CL')} contado</p>
                <p className="text-xs text-muted-foreground">${(r.expectedQr ?? 0).toLocaleString('es-CL')} esperado</p>
                {diffLabel(r.qrDiff ?? 0)}
              </div>
            </div>

            {/* Débito + crédito juntos. El desglose depende de que la
                cajera haya elegido bien el tipo de tarjeta, y la noche de
                Candyland demostró que no se puede dar por hecho: cerró con
                $0 esperados en crédito y $200.500 en el voucher, así que por
                separado se leía "faltan $977.000 y sobran $200.500" cuando el
                hueco real era $776.500. Este total es el que manda. */}
            {(() => {
              const counted = r.countedDebit + r.countedCredit;
              const expected = r.expectedDebit + r.expectedCredit;
              const splitDudoso = (r.expectedCredit === 0 && r.countedCredit > 0) || (r.expectedDebit === 0 && r.countedDebit > 0);
              return (
                <div className="mt-3 rounded-lg bg-muted/50 p-3 text-sm">
                  <p className="text-xs text-muted-foreground mb-1">💳 Tarjetas (débito + crédito)</p>
                  <p>${counted.toLocaleString('es-CL')} contado · <span className="text-muted-foreground">${expected.toLocaleString('es-CL')} esperado</span></p>
                  {diffLabel(counted - expected)}
                  {splitDudoso && (
                    <p className="text-xs text-amber-500 mt-1">
                      El desglose de arriba no es confiable en este turno: el sistema no registró ninguna venta de un tipo de tarjeta
                      que sí aparece en el voucher, o sea que el selector de la tablet quedó fijo toda la noche. Mira este total, no las dos tarjetas por separado.
                    </p>
                  )}
                </div>
              );
            })()}

            {/* Cómo se arma el "esperado" del efectivo, en una línea: sin
                esto la resta del fondo y de los gastos pagados del cajón
                parecían un descuadre sin explicación. */}
            <p className="mt-2 text-xs text-muted-foreground">
              Esperado en efectivo = ${r.openingCash.toLocaleString('es-CL')} de fondo
              {' + '}${(r.expectedCash + (r.cashPaidOut ?? 0)).toLocaleString('es-CL')} de ventas
              {(r.cashPaidOut ?? 0) > 0 && <> {' − '}${(r.cashPaidOut ?? 0).toLocaleString('es-CL')} de gastos pagados del cajón</>}
              {' = '}<strong>${(r.expectedCash + r.openingCash).toLocaleString('es-CL')}</strong>
            </p>

            {expandedId === r.id && <ShiftSalesDetail shiftId={r.id} />}

            {expandedId === r.id && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4 pt-4 border-t border-border/50">
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Efectivo inicial: ${r.openingCash.toLocaleString('es-CL')} · {r.salesCount} ventas · {r.redeemsCount} canjes</p>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2">🏆 Top clientes (evento completo)</p>
                  {r.topCustomers.length === 0 && <p className="text-xs text-muted-foreground">Sin ventas web.</p>}
                  {r.topCustomers.map((c: any, i: number) => (
                    <p key={i} className="text-sm">{i + 1}. {c.name} — ${c.total.toLocaleString('es-CL')}</p>
                  ))}
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2">🥇 Top productos (evento completo)</p>
                  {r.topProducts.length === 0 && <p className="text-xs text-muted-foreground">Sin ventas.</p>}
                  {r.topProducts.map((p: any, i: number) => (
                    <p key={i} className="text-sm">{i + 1}. {p.name} — {p.quantity}x (${p.revenue.toLocaleString('es-CL')})</p>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

/** Eliminar un cierre de turno con doble verificación (pedido explícito del
 * usuario, para sacar sus cierres de práctica de los reportes reales) -- a
 * diferencia de ConfirmDeleteButton, acá además hay que escribir la clave de
 * admin, así que el diálogo queda controlado a mano en vez de usar el
 * genérico. */
/** Detalle venta por venta de un turno, dentro de "Ver detalle".
 *
 * Con una diferencia grande al cerrar, los totales por medio de pago no
 * alcanzan para explicarla: hay que poder comparar línea por línea contra el
 * voucher de la máquina. Arriba de todo van las repeticiones sospechosas,
 * que es donde suele estar la plata que no calza: el POS de tarjetas es una
 * máquina aparte, así que una venta registrada dos veces en la tablet infla
 * el esperado sin que haya entrado un peso más. */
export function ShiftSalesDetail({ shiftId }: { shiftId: number }) {
  const { data, isLoading } = trpc.cajaReports.shiftSales.useQuery({ shiftId });

  if (isLoading) return <p className="mt-4 pt-4 border-t border-border/50 text-sm text-muted-foreground">Cargando las ventas del turno…</p>;
  if (!data) return null;

  const byMethod = new Map<string, { count: number; total: number }>();
  for (const s of data.sales) {
    const key = s.paymentMethod ?? 'sin medio';
    const entry = byMethod.get(key) ?? { count: 0, total: 0 };
    entry.count += 1;
    entry.total += s.total;
    byMethod.set(key, entry);
  }

  const duplicateMoney = data.possibleDuplicates.reduce((sum, d) => sum + d.total * (d.count - 1), 0);

  return (
    <div className="mt-4 pt-4 border-t border-border/50 space-y-4">
      <div>
        <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Ventas de este turno ({data.sales.length})</p>
        <div className="flex flex-wrap gap-2">
          {Array.from(byMethod.entries()).map(([method, v]) => (
            <span key={method} className="rounded-lg bg-muted/50 px-3 py-1.5 text-sm">
              {method}: <strong>${v.total.toLocaleString('es-CL')}</strong> <span className="text-muted-foreground">({v.count})</span>
            </span>
          ))}
          {data.sales.length === 0 && <span className="text-sm text-muted-foreground">Sin ventas registradas en la ventana de este turno.</span>}
        </div>
      </div>

      {data.possibleDuplicates.length > 0 && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4">
          <p className="text-sm font-semibold">
            ⚠️ {data.possibleDuplicates.length} venta(s) repetida(s) sospechosa(s) — hasta ${duplicateMoney.toLocaleString('es-CL')} de más en el esperado
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Mismo monto y mismo medio de pago con menos de 90 segundos de diferencia. Es una sospecha, no una certeza:
            dos clientes distintos pueden pagar lo mismo casi al mismo tiempo. Compara contra el voucher de la máquina antes de dar nada por hecho.
          </p>
          <div className="mt-3 space-y-1">
            {data.possibleDuplicates.map((d, i) => (
              <p key={i} className="text-sm">
                {d.count}× ${d.total.toLocaleString('es-CL')} en {d.paymentMethod ?? 'sin medio'} — {formatChileDateTime(d.firstAt)} → {formatChileDateTime(d.lastAt)}
              </p>
            ))}
          </div>
        </div>
      )}

      {data.sales.length > 0 && (
        <details>
          <summary className="text-sm cursor-pointer text-muted-foreground hover:text-foreground">Ver las {data.sales.length} ventas una por una</summary>
          <div className="mt-2 max-h-72 overflow-y-auto rounded-lg border border-border/50">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-muted/80 backdrop-blur">
                <tr>
                  <th className="text-left px-3 py-2 font-medium">Hora</th>
                  <th className="text-left px-3 py-2 font-medium">Medio</th>
                  <th className="text-right px-3 py-2 font-medium">Monto</th>
                  <th className="text-left px-3 py-2 font-medium">Cajera</th>
                </tr>
              </thead>
              <tbody>
                {data.sales.map((s) => (
                  <tr key={s.id} className="border-t border-border/40">
                    <td className="px-3 py-1.5 whitespace-nowrap">{formatChileDateTime(s.createdAt)}</td>
                    <td className="px-3 py-1.5">{s.paymentMethod ?? '—'}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">${s.total.toLocaleString('es-CL')}</td>
                    <td className="px-3 py-1.5 text-muted-foreground">{s.operatorName ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </div>
  );
}

export function DeleteShiftClosingButton({ shiftId, label, onDeleted }: { shiftId: number; label: string; onDeleted: () => void }) {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const deleteShift = trpc.cajaReports.deleteShiftClosing.useMutation({
    onSuccess: () => {
      toast.success('Cierre de turno eliminado');
      setOpen(false);
      setPassword('');
      onDeleted();
    },
    onError: onMutationError,
  });

  return (
    <AlertDialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setPassword(''); }}>
      <AlertDialogTrigger asChild>
        <Button variant="outline" size="sm" className="text-destructive">
          <Trash2 className="w-3 h-3" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>¿Eliminar este cierre de turno?</AlertDialogTitle>
          <AlertDialogDescription>
            Vas a eliminar el cierre de {label}. Esta acción no se puede deshacer. Para confirmar, escribe la clave de admin.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <Input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Clave de admin"
          autoFocus
        />
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <WriteButton
            variant="destructive"
            disabled={!password || deleteShift.isPending}
            onClick={() => deleteShift.mutate({ shiftId, adminPassword: password })}
          >
            {deleteShift.isPending ? 'Eliminando…' : 'Eliminar'}
          </WriteButton>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
