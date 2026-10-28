/* Secciones del hub «noche» del panel (se cargan solas al abrirlas, ver ADMIN_SECTIONS en ../Dashboard.tsx). */
import { useTonightEvent } from '@/hooks/useTonightEvent';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { WriteButton } from '@/components/admin/WriteButton';
import { OPERATOR_ROLES, OPERATOR_ROLE_LABELS, type OperatorRole } from '@shared/cajaRoles';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Calendar, DollarSign, Ticket, ShoppingBag, Store, Receipt } from 'lucide-react';
import { PnlWarnings } from '@/components/admin/PnlWarnings';
import { AlertDialog, AlertDialogTrigger, AlertDialogContent, AlertDialogHeader, AlertDialogFooter, AlertDialogTitle, AlertDialogDescription, AlertDialogAction, AlertDialogCancel } from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { ConfirmDeleteButton } from '@/components/admin/ConfirmDeleteButton';
import { OPEN_SECTION_EVENT } from '@/components/admin/studio/handoff';
import { StatTile } from '@/components/admin/StatTile';
import { BentoGrid, BentoTile } from '@/components/admin/BentoGrid';
import { EmptyState } from '@/components/admin/EmptyState';
import { categoryLabel } from '@shared/expenses';
import { formatChileDateTime, formatChileShortDate } from '@shared/chileDate';
import { onMutationError } from './shared';

export function CajaAdminView() {
  const { data: eventsData } = trpc.events.listAll.useQuery();
  const events = eventsData ?? [];
  // El mismo evento que /caja/cocina/guardarropía usan de verdad (el
  // publicado más cercano a hoy) -- antes este panel arrancaba en
  // events[0] (el creado más reciente), que podía ser un evento distinto
  // del que la tablet estaba usando y hacía que "Reiniciar datos de
  // prueba" apuntara al evento equivocado sin que se notara.
  const { data: activeCajaEvent } = trpc.events.getActiveForCaja.useQuery();
  const [eventId, setEventId] = useState<number | null>(null);
  const activeEventId = eventId ?? activeCajaEvent?.id ?? events[0]?.id ?? null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="font-heading text-2xl">Caja</h2>
        {events.length > 0 && (
          <Select value={String(activeEventId)} onValueChange={(v) => setEventId(Number(v))}>
            <SelectTrigger className="w-64"><SelectValue /></SelectTrigger>
            <SelectContent>
              {events.map((e: any) => <SelectItem key={e.id} value={String(e.id)}>{e.title}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
      </div>

      {activeEventId && <ResetTestDataCard eventId={activeEventId} eventTitle={events.find((e: any) => e.id === activeEventId)?.title ?? ''} />}
      <RecurringExpensesPanel />
      <AdminAuditPanel />
      {activeEventId && <OperatorsManager eventId={activeEventId} />}
      {activeEventId && <RegistersManager eventId={activeEventId} />}
      {activeEventId && <DevicesManager eventId={activeEventId} />}
      {activeEventId && <LedgerView eventId={activeEventId} />}
    </div>
  );
}

/** Botón para el período de pruebas antes del estreno real: limpia ventas,
 * turnos y comandas de prueba de /caja, /cocina y /guardarropía para el
 * evento elegido, y repone el stock/"agotado" de la carta -- pensado para
 * apretarse las veces que haga falta mientras se sigue probando. Nunca toca
 * compras web, check-ins de /puerta ni canjes de extras (ver
 * db.resetEventTestData). */
export function ResetTestDataCard({ eventId, eventTitle }: { eventId: number; eventTitle: string }) {
  // Es el borrado más destructivo del panel, así que también pide la clave.
  const [resetPassword, setResetPassword] = useState('');
  const reset = trpc.caja.resetTestData.useMutation({
    onSuccess: (data) => toast.success(`Listo -- se borraron ${data.ordersDeleted} venta(s) de prueba y se repuso la carta.`),
    onError: onMutationError,
  });

  return (
    <Card className="rounded-2xl border-0 shadow-md shadow-black/5 border-l-4 border-l-amber-500">
      <CardHeader><CardTitle>Reiniciar datos de prueba</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Borra las ventas, turnos y comandas de prueba de /caja, /cocina y /guardarropía de "{eventTitle}", y repone el stock y el estado "agotado" de la carta de la fiesta. No toca compras web, check-ins de /puerta ni canjes de estacionamiento/piscolón.
        </p>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="outline" disabled={reset.isPending} className="text-amber-700 border-amber-300">
              {reset.isPending ? 'Reiniciando…' : 'Reiniciar datos de prueba'}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>¿Reiniciar caja/cocina/guardarropía de "{eventTitle}"?</AlertDialogTitle>
              <AlertDialogDescription>
                Se van a borrar todas las ventas hechas directo en caja, los turnos y las comandas de cocina/guardarropía de este evento, y se va a reponer el stock y quitar el "agotado" de la carta. Esta acción no se puede deshacer. Las compras web, los check-ins de puerta y los canjes de estacionamiento/piscolón NO se tocan.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <Input
              type="password"
              autoFocus
              value={resetPassword}
              onChange={(e) => setResetPassword(e.target.value)}
              placeholder="Tu clave de admin"
            />
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setResetPassword('')}>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                disabled={!resetPassword || reset.isPending}
                onClick={(e) => { e.preventDefault(); reset.mutate({ eventId, adminPassword: resetPassword }); }}
              >
                Sí, reiniciar
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}

/** Email opcional de la cajera, editable en línea: se guarda solo al perder
 * el foco y solo si cambió (pedido explícito del usuario -- alimenta el PDF
 * de cierre de turno, que se le manda a esta casilla si está cargada). */
export function OperatorEmailInput({ operatorId, email, onSave }: { operatorId: number; email: string | null; onSave: (email: string) => void }) {
  const [value, setValue] = useState(email ?? '');
  return (
    <Input
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => { if (value !== (email ?? '')) onSave(value); }}
      placeholder="Email (opcional)"
      className="h-8 text-xs w-48"
      type="email"
    />
  );
}

export function OperatorsManager({ eventId }: { eventId: number }) {
  const { data: operators, refetch } = trpc.operators.listAll.useQuery({ eventId });
  const create = trpc.operators.create.useMutation({ onSuccess: () => { refetch(); toast.success('Operador creado'); setForm({ name: '', pin: '', role: 'caja', email: '' }); }, onError: onMutationError });
  const update = trpc.operators.update.useMutation({ onSuccess: () => { refetch(); toast.success('Actualizado'); }, onError: onMutationError });
  const deleteOperator = trpc.operators.delete.useMutation({ onSuccess: () => { refetch(); toast.success('Operador eliminado'); }, onError: onMutationError });
  const [form, setForm] = useState({ name: '', pin: '', role: 'caja' as OperatorRole, email: '' });
  const openStaff = () => window.dispatchEvent(new CustomEvent(OPEN_SECTION_EVENT, { detail: 'staff' }));

  return (
    <Card className="rounded-2xl border-0 shadow-md shadow-black/5">
      <CardHeader className="space-y-1">
        <CardTitle>Accesos de este evento</CardTitle>
        <p className="text-sm text-muted-foreground">
          Quién puede entrar a caja, puerta, cocina y guardarropía. Cada persona del staff entra con el PIN que creó en su app.
          {' '}<button type="button" onClick={openStaff} className="font-semibold text-primary underline-offset-2 hover:underline">Agregar o editar staff →</button>
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          {(operators ?? []).map((op: any) => (
            <div key={op.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border/50">
              <div>
                <p className="font-medium">{op.name} {op.staffId ? <span className="ml-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">Staff</span> : <span className="ml-1 rounded-full bg-black/5 px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">Suelto</span>}</p>
                <p className="text-xs text-muted-foreground">{OPERATOR_ROLE_LABELS[op.role] ?? op.role} · {op.active ? 'activo' : 'inactivo'}</p>
              </div>
              <div className="flex items-center gap-2">
                <OperatorEmailInput operatorId={op.id} email={op.email ?? null} onSave={(email) => update.mutate({ id: op.id, email: email || null })} />
                <WriteButton variant="outline" size="sm" onClick={() => update.mutate({ id: op.id, active: op.active ? 0 : 1 })}>
                  {op.active ? 'Desactivar' : 'Activar'}
                </WriteButton>
                <ConfirmDeleteButton
                  description={`Vas a eliminar al operador "${op.name}". Si ya tiene ventas, turnos o canjes registrados, no se va a poder -- desactívalo en ese caso.`}
                  onConfirm={(adminPassword) => deleteOperator.mutateAsync({ id: op.id, adminPassword })}
                />
              </div>
            </div>
          ))}
          {operators && operators.length === 0 && <p className="text-sm text-muted-foreground">Nadie tiene acceso todavía a este evento.</p>}
        </div>
        <details className="rounded-lg border border-border/50 p-3">
          <summary className="cursor-pointer text-sm font-medium">Crear acceso suelto (pruebas o alguien sin ficha)</summary>
          <div className="pt-3">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
          <div><Label>Nombre</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="mt-1" /></div>
          <div><Label>PIN (4-8 dígitos)</Label><Input value={form.pin} onChange={(e) => setForm({ ...form, pin: e.target.value })} className="mt-1" maxLength={8} /></div>
          <div>
            <Label>Rol</Label>
            <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v as any })}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                {OPERATOR_ROLES.map((r) => <SelectItem key={r} value={r}>{OPERATOR_ROLE_LABELS[r]}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div><Label>Email (opcional)</Label><Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="mt-1" type="email" placeholder="Para el PDF de cierre" /></div>
          <WriteButton disabled={!form.name || form.pin.length < 4 || create.isPending} onClick={() => create.mutate({ ...form, eventId, email: form.email || undefined })}>Crear operador</WriteButton>
        </div>
          </div>
        </details>
      </CardContent>
    </Card>
  );
}

export function RegistersManager({ eventId }: { eventId: number }) {
  const { data: registersList, refetch } = trpc.registers.listAll.useQuery({ eventId });
  const create = trpc.registers.create.useMutation({ onSuccess: () => { refetch(); toast.success('Caja creada'); setName(''); }, onError: onMutationError });
  const deleteRegister = trpc.registers.delete.useMutation({ onSuccess: () => { refetch(); toast.success('Caja eliminada'); }, onError: onMutationError });
  const [name, setName] = useState('');

  return (
    <Card className="rounded-2xl border-0 shadow-md shadow-black/5">
      <CardHeader><CardTitle>Cajas físicas</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Caja 1" className="max-w-xs" />
          <WriteButton disabled={!name.trim() || create.isPending} onClick={() => create.mutate({ eventId, name: name.trim() })}>Crear caja</WriteButton>
        </div>
        <div className="flex flex-wrap gap-2">
          {(registersList ?? []).map((r: any) => (
            <span key={r.id} className="text-sm pl-3 pr-1 py-1 rounded-full bg-muted/30 border border-border/50 inline-flex items-center gap-1">
              {r.name}{!r.active ? ' (inactiva)' : ''}
              <ConfirmDeleteButton
                description={`Vas a eliminar la caja "${r.name}". Si ya tiene ventas o turnos registrados, no se va a poder -- desactívala en ese caso.`}
                onConfirm={(adminPassword) => deleteRegister.mutateAsync({ id: r.id, adminPassword })}
              />
            </span>
          ))}
          {registersList && registersList.length === 0 && <p className="text-sm text-muted-foreground">Sin cajas creadas todavía -- los operadores podrán entrar "sin caja asignada".</p>}
        </div>
      </CardContent>
    </Card>
  );
}

export function DevicesManager({ eventId }: { eventId: number }) {
  const { data: devicesList, refetch } = trpc.devices.listAll.useQuery({ eventId });
  const create = trpc.devices.create.useMutation({ onSuccess: (res) => { refetch(); setName(''); setLastCode(res.enrollCode); }, onError: onMutationError });
  const setActive = trpc.devices.setActive.useMutation({ onSuccess: () => { refetch(); toast.success('Actualizado'); }, onError: onMutationError });
  const deleteDevice = trpc.devices.delete.useMutation({ onSuccess: () => { refetch(); toast.success('Dispositivo eliminado'); }, onError: onMutationError });
  const [name, setName] = useState('');
  const [lastCode, setLastCode] = useState<string | null>(null);

  return (
    <Card className="rounded-2xl border-0 shadow-md shadow-black/5">
      <CardHeader><CardTitle>Dispositivos enrolados</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">Solo las tablets/navegadores enrolados acá pueden llegar a la pantalla de PIN de /caja. Genera un código, dáselo a quien configura el dispositivo -- lo canjea una sola vez y vence a las 24h.</p>
        <div className="flex gap-2">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Tablet Caja 1" className="max-w-xs" />
          <WriteButton disabled={!name.trim() || create.isPending} onClick={() => create.mutate({ eventId, name: name.trim() })}>Generar código</WriteButton>
        </div>
        {lastCode && (
          <div className="p-4 rounded-lg bg-primary/10 border border-primary/30">
            <p className="text-xs text-muted-foreground mb-1">Código de enrolamiento (cópialo ahora, no se vuelve a mostrar):</p>
            <p className="text-2xl font-mono font-bold tracking-wider">{lastCode}</p>
          </div>
        )}
        <div className="space-y-2">
          {(devicesList ?? []).map((d: any) => (
            <div key={d.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border/50">
              <div>
                <p className="font-medium">{d.name}</p>
                <p className="text-xs text-muted-foreground">{d.enrolled ? 'Enrolado' : 'Código sin canjear'} · {d.active ? 'activo' : 'revocado'}</p>
              </div>
              <div className="flex gap-2">
                <WriteButton variant="outline" size="sm" onClick={() => setActive.mutate({ id: d.id, active: d.active ? 0 : 1 })}>
                  {d.active ? 'Revocar' : 'Reactivar'}
                </WriteButton>
                <ConfirmDeleteButton
                  description={`Vas a eliminar el dispositivo "${d.name}".`}
                  onConfirm={(adminPassword) => deleteDevice.mutateAsync({ id: d.id, adminPassword })}
                />
              </div>
            </div>
          ))}
          {devicesList && devicesList.length === 0 && <p className="text-sm text-muted-foreground">Sin dispositivos enrolados todavía para este evento.</p>}
        </div>
      </CardContent>
    </Card>
  );
}

export function LedgerView({ eventId }: { eventId: number }) {
  const { data } = trpc.cajaReports.ledger.useQuery({ eventId });
  const rows = data ?? [];

  return (
    <Card className="rounded-2xl border-0 shadow-md shadow-black/5">
      <CardHeader><CardTitle>Auditoría (ledger)</CardTitle></CardHeader>
      <CardContent className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="text-left text-muted-foreground border-b border-border/50">
            <th className="py-2">Fecha</th><th>Tipo</th><th>Operador</th><th>Objetivo</th><th>Resultado</th>
          </tr></thead>
          <tbody>
            {rows.slice(0, 100).map((r: any) => (
              <tr key={r.id} className="border-b border-border/30">
                <td className="py-2">{formatChileDateTime(r.serverAt)}</td>
                <td className="capitalize">{r.type}</td>
                <td>{r.operatorName}</td>
                <td className="font-mono text-xs">{r.targetId}</td>
                <td className={r.result === 'applied' ? 'text-green-500' : r.result === 'conflict' ? 'text-yellow-500' : 'text-red-500'}>{r.result}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={5} className="py-4 text-center text-muted-foreground">Sin operaciones todavía.</td></tr>}
          </tbody>
        </table>
        {rows.length >= 500 && <p className="text-xs text-muted-foreground mt-2">Mostrando las 500 más recientes.</p>}
      </CardContent>
    </Card>
  );
}

/** Bitácora de acciones destructivas del panel.
 *
 * Todo lo que pasa por los terminales ya quedaba auditado en el ledger
 * `ops`. El lado admin no dejaba nada: borrar una compra, editar un gasto o
 * eliminar un evento no se podía reconstruir después. */
/** Las suscripciones activas (gastos marcados "se repite todos los meses").
 *
 * Hasta ahora no se veían en ninguna parte: se marcaban al crear el gasto y
 * después generaban una copia cada mes sin que nadie pudiera revisarlas. Si
 * alguna quedó cargada a un evento puntual, acá se ve marcada -- esa es la
 * combinación que le seguía restando a esa fiesta todos los meses. */
export function RecurringExpensesPanel() {
  const { data } = trpc.cajaReports.recurringExpenses.useQuery();
  const rows = data ?? [];
  if (rows.length === 0) return null;

  return (
    <Card className="rounded-2xl border-0 shadow-md shadow-black/5">
      <CardHeader>
        <CardTitle>Gastos que se repiten solos</CardTitle>
        <p className="text-sm text-muted-foreground">
          De cada uno sale una copia automática, y esa copia es la que entra al resultado. Para darlo de baja, ponle fecha de término o elimínalo.
        </p>
      </CardHeader>
      <CardContent className="space-y-2">
        {rows.map((r: any) => (
          <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/50 p-3">
            <div>
              <p className="font-semibold">{r.description}</p>
              <p className="text-xs text-muted-foreground">
                {categoryLabel(r.category)}{r.supplier ? ` · ${r.supplier}` : ''} · desde {formatChileShortDate(r.expenseDate)}
                {r.recurrenceEndsAt ? ` · termina ${formatChileShortDate(r.recurrenceEndsAt)}` : ' · sin fecha de término'}
              </p>
              <p className="text-xs mt-1">
                {r.recurrence === 'por_evento'
                  ? <span className="text-primary">Se copia a cada evento que hagas, completo.</span>
                  : <span className="text-muted-foreground">Suscripción de la productora: se reparte entre los eventos del mes.</span>}
              </p>
              {r.recurrence === 'mensual' && r.eventId && (
                <p className="text-xs text-amber-600 mt-1">
                  ⚠️ Está cargado a "{r.eventTitle}": se le resta a ese evento todos los meses, aunque la fiesta ya haya pasado.
                  Si es un costo fijo de cada fiesta, debería ser "se repite en cada evento".
                </p>
              )}
            </div>
            <span className="font-semibold tabular-nums shrink-0">
              ${r.amountTotal.toLocaleString('es-CL')}{r.recurrence === 'por_evento' ? '/evento' : '/mes'}
            </span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export function AdminAuditPanel() {
  const { data } = trpc.cajaReports.adminAudit.useQuery({ limit: 200 });
  const rows = data ?? [];

  const LABELS: Record<string, string> = {
    'orders.delete': 'Eliminó una compra',
    'orders.updateAttendees': 'Corrigió los nombres de una compra',
    'orders.upgradeToTrio': 'Pasó una compra de Dúo a Trío',
    'orders.upgradeAccess': 'Subió una compra a un acceso mayor',
    'orders.addAddon': 'Agregó un extra a una compra',
    'events.delete': 'Eliminó un evento',
    'events.deleteTicketType': 'Eliminó un tipo de entrada',
    'expenses.delete': 'Eliminó un gasto',
    'expenses.update': 'Editó un gasto',
    'expenses.reviewCogs': 'Revisó doble conteo de un gasto',
    'expenses.undo': 'Deshizo un gasto recién cargado',
    'blockedCustomers.delete': 'Sacó un RUT de la lista de bloqueo',
    'discounts.update': 'Editó un código de descuento',
    'discounts.delete': 'Eliminó un código de descuento',
    'communityCodes.delete': 'Eliminó un código de comunidad',
    'leads.delete': 'Eliminó un lead',
    'ambassadors.delete': 'Eliminó un embajador',
    'operators.delete': 'Eliminó un operador',
    'devices.delete': 'Eliminó un dispositivo',
    'registers.delete': 'Eliminó una caja',
    'caja.resetTestData': 'Reinició los datos de prueba de un evento',
    'cajaReports.deleteShiftClosing': 'Eliminó un cierre de turno',
  };

  return (
    <Card className="rounded-2xl border-0 shadow-md shadow-black/5">
      <CardHeader>
        <CardTitle>Qué se borró o se editó</CardTitle>
        <p className="text-sm text-muted-foreground">
          Cada acción destructiva del panel queda registrada acá con su fecha. Lo que pasa en los terminales
          (ventas, canjes, anulaciones) tiene su propio registro en el ledger de caja, que no se borra nunca.
        </p>
      </CardHeader>
      <CardContent>
        {rows.length === 0 && <p className="text-sm text-muted-foreground">Todavía no se ha borrado ni editado nada desde el panel.</p>}
        {rows.length > 0 && (
          <div className="max-h-96 overflow-y-auto rounded-lg border border-border/50">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-muted/80 backdrop-blur">
                <tr>
                  <th className="text-left px-3 py-2 font-medium">Cuándo</th>
                  <th className="text-left px-3 py-2 font-medium">Qué pasó</th>
                  <th className="text-left px-3 py-2 font-medium">Sobre</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r: any) => (
                  <tr key={r.id} className="border-t border-border/40">
                    <td className="px-3 py-1.5 whitespace-nowrap text-muted-foreground">{formatChileDateTime(r.createdAt)}</td>
                    <td className="px-3 py-1.5">{LABELS[r.action] ?? r.action}</td>
                    <td className="px-3 py-1.5 text-muted-foreground">{r.targetType ? `${r.targetType} #${r.targetId}` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** Promo relámpago: crea un código de descuento con vencimiento (mismo
 * `discountCodes` de siempre -- lo valida el checkout web Y la venta de
 * Caja, así que el código sirve tanto para pagar en línea como para decirlo
 * en caja, siempre que sea DENTRO del tiempo) y avisa por push a todos los
 * invitados de la fiesta activa que tengan notificaciones prendidas. */
export function FlashPromoCard() {
  const [message, setMessage] = useState('');
  const [discountPercent, setDiscountPercent] = useState(50);
  const [minutes, setMinutes] = useState(15);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [result, setResult] = useState<{ code: string; expiresAt: Date; sent: number; products: string[] } | null>(null);

  const { data: activeEvent } = trpc.events.getActiveForCaja.useQuery();
  const { data: ticketTypes } = trpc.events.listTicketTypes.useQuery(
    { eventId: activeEvent?.id! },
    { enabled: !!activeEvent?.id },
  );
  // Solo lo que se vende en Caja -- la promo relámpago es para eso, y son
  // los mismos productos que "Sin stock"/"Agotado" ya pintan en /caja.
  const cajaProducts = useMemo(
    () => (ticketTypes ?? []).filter((t: any) => ['consumo', 'locker', 'merch'].includes(t.category) && t.status === 'active'),
    [ticketTypes],
  );

  const toggleId = (id: number) => {
    setSelectedIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  };

  const send = trpc.flashPromo.send.useMutation({
    onSuccess: (r) => {
      const products = cajaProducts.filter((p: any) => selectedIds.includes(p.id)).map((p: any) => p.name);
      setResult({ ...r, products });
      setMessage('');
      setSelectedIds([]);
    },
    onError: onMutationError,
  });

  // Plantillas pregrabadas: tocar una solo rellena el formulario de arriba
  // -- el envío real sigue siendo el botón "Enviar ahora", nunca un
  // toque solo.
  const { data: presets, refetch: refetchPresets } = trpc.flashPromo.listPresets.useQuery();
  const savePreset = trpc.flashPromo.savePreset.useMutation({ onSuccess: () => { refetchPresets(); setSavingPresetName(''); }, onError: onMutationError });
  const deletePreset = trpc.flashPromo.deletePreset.useMutation({ onSuccess: () => refetchPresets(), onError: onMutationError });
  const [savingPresetName, setSavingPresetName] = useState<string | null>(null);

  const applyPreset = (p: NonNullable<typeof presets>[number]) => {
    setMessage(p.message);
    setDiscountPercent(p.discountPercent);
    setMinutes(p.minutes);
    setSelectedIds(p.ticketTypeIds);
  };

  return (
    <Card className="rounded-2xl border-0 shadow-md shadow-black/5">
      <CardHeader><CardTitle>🎉 Promo relámpago</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <p className="text-muted-foreground text-sm">
          Manda un push en vivo a todos los invitados de la fiesta que estén ahora mismo en Playmatch con notificaciones
          activas, con un descuento que solo aplica a los productos que elijas abajo -- en Caja les aparece la insignia
          "🔥 Promo Flash" y el descuento se aplica solo, sin código; para quien compra online, el código va en el push.
        </p>

        {presets && presets.length > 0 && (
          <div className="space-y-1.5">
            <Label>Plantillas guardadas</Label>
            <div className="flex flex-wrap gap-2">
              {presets.map((p) => (
                <span key={p.id} className="inline-flex items-center gap-1 rounded-full border border-border/50 pl-3 pr-1 py-1 text-sm">
                  <button type="button" onClick={() => applyPreset(p)} className="hover:underline">⚡ {p.label}</button>
                  <button type="button" aria-label="Eliminar plantilla" onClick={() => deletePreset.mutate({ id: p.id })}
                    className="w-5 h-5 grid place-items-center rounded-full text-muted-foreground hover:bg-muted">×</button>
                </span>
              ))}
            </div>
          </div>
        )}

        <div>
          <Label>Mensaje</Label>
          <Input
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Ej: Piscolas 50% OFF por los próximos 15 minutos"
            maxLength={200}
            className="mt-1"
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>% de descuento</Label>
            <Input type="number" min={1} max={100} value={discountPercent}
              onChange={(e) => setDiscountPercent(Number(e.target.value))} className="mt-1" />
          </div>
          <div>
            <Label>Dura (minutos)</Label>
            <Input type="number" min={1} max={180} value={minutes}
              onChange={(e) => setMinutes(Number(e.target.value))} className="mt-1" />
          </div>
        </div>
        <div>
          <Label>Productos en promo</Label>
          {!activeEvent && <p className="text-xs text-muted-foreground mt-1">No hay una fiesta activa ahora mismo.</p>}
          {activeEvent && cajaProducts.length === 0 && (
            <p className="text-xs text-muted-foreground mt-1">La Carta de la Fiesta de este evento no tiene productos activos.</p>
          )}
          {cajaProducts.length > 0 && (
            <div className="mt-1 max-h-48 overflow-y-auto space-y-1 rounded-xl border border-border/50 p-2">
              {cajaProducts.map((p: any) => (
                <label key={p.id} className="flex items-center gap-2 text-sm py-1 px-1 rounded-lg hover:bg-muted/50 cursor-pointer">
                  <Checkbox checked={selectedIds.includes(p.id)} onCheckedChange={() => toggleId(p.id)} />
                  <span>{p.emoji} {p.name}</span>
                  <span className="text-xs text-muted-foreground ml-auto">${Number(p.price).toLocaleString('es-CL')}</span>
                </label>
              ))}
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <WriteButton
            onClick={() => send.mutate({ message: message.trim(), discountPercent, minutes, ticketTypeIds: selectedIds })}
            disabled={send.isPending || message.trim().length < 3 || selectedIds.length === 0}
            className="interactive"
          >
            {send.isPending ? 'Enviando…' : 'Enviar ahora'}
          </WriteButton>
          {savingPresetName === null ? (
            <Button variant="outline" size="sm" disabled={message.trim().length < 3 || selectedIds.length === 0}
              onClick={() => setSavingPresetName('')}>
              Guardar como plantilla
            </Button>
          ) : (
            <div className="flex items-center gap-2">
              <Input value={savingPresetName} onChange={(e) => setSavingPresetName(e.target.value)}
                placeholder="Nombre corto, ej: Piscolas 50%" maxLength={60} className="h-9 w-56" autoFocus />
              <Button size="sm" disabled={!savingPresetName.trim() || savePreset.isPending}
                onClick={() => savePreset.mutate({ label: savingPresetName.trim(), message: message.trim(), discountPercent, minutes, ticketTypeIds: selectedIds })}>
                Guardar
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setSavingPresetName(null)}>Cancelar</Button>
            </div>
          )}
        </div>

        {result && (
          <div className="p-3.5 rounded-xl border border-border/50 text-sm space-y-1">
            <p>✅ Enviado a {result.sent} {result.sent === 1 ? 'dispositivo' : 'dispositivos'}.</p>
            <p>Código: <span className="font-mono font-bold">{result.code}</span> -- vale hasta las{' '}
              {new Date(result.expiresAt).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}.</p>
            {result.products.length > 0 && <p>Productos: {result.products.join(', ')}.</p>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** Vista "Evento": la noche completa en una sola pantalla.
 *
 * El dueño marcó los cuatro dolores del admin -- tener que saltar entre
 * secciones, cuánto vendió, qué pasó en la caja, si dio ganancia -- y dijo
 * que lo usa tanto en vivo como después. Hasta ahora eso vivía repartido
 * entre Ventas Web, Ventas Caja, Caja y Gastos y P&L, cada una con su propio
 * selector de evento (o sin ninguno).
 *
 * Esta vista NO reemplaza a esas secciones: el trabajo de detalle (editar una
 * orden, cargar un gasto) se sigue haciendo ahí. Acá se ve la noche entera de
 * un vistazo, con un solo selector que manda para toda la pantalla. */
export function EventOverview() {
  // Arranca en el evento de esta noche (ver useTonightEvent).
  const { events, eventId, setSelected } = useTonightEvent();

  const { data: webStats } = trpc.orders.getStats.useQuery({ channel: 'web', eventId: eventId! }, { enabled: !!eventId, refetchInterval: 30_000 });
  const { data: cajaStats } = trpc.orders.getStats.useQuery({ channel: 'caja', eventId: eventId! }, { enabled: !!eventId, refetchInterval: 30_000 });
  const { data: pnl } = trpc.cajaReports.eventPnl.useQuery({ eventId: eventId! }, { enabled: !!eventId, refetchInterval: 30_000 });
  const { data: closings } = trpc.cajaReports.shiftClosings.useQuery({ eventId: eventId! }, { enabled: !!eventId, refetchInterval: 30_000 });
  const { data: peak } = trpc.cajaReports.peakHours.useQuery({ eventId: eventId! }, { enabled: !!eventId, refetchInterval: 30_000 });

  if (!eventId) {
    return <EmptyState icon={Calendar} title="Todavía no hay eventos cargados" description="Crea un evento en la sección Eventos para ver su resumen acá." />;
  }

  const webRevenue = Number(webStats?.totalRevenue ?? 0);
  const cajaRevenue = Number(cajaStats?.totalRevenue ?? 0);
  // Todo lo que se descuenta entre lo que entró y la ganancia (IVA, productos,
  // gastos, comisiones, tarjeta, local): así los 4 números siempre cuadran.
  const gastos = pnl ? pnl.grossIncome - pnl.netProfit : 0;
  const resultado = pnl?.netProfit ?? null;

  // Solo las horas con movimiento: una fiesta ocupa 8 de las 24 horas del
  // día, así que pintar las 24 deja el gráfico casi vacío (que es como se
  // veía hasta ahora).
  const peakRows = (peak ?? []).filter((h: any) => h.count > 0);
  const peakMax = Math.max(1, ...peakRows.map((h: any) => h.count));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-heading text-2xl">La noche completa</h2>
        <Select value={String(eventId)} onValueChange={(v) => setSelected(Number(v))}>
          <SelectTrigger className="w-64"><SelectValue /></SelectTrigger>
          <SelectContent>
            {(events ?? []).map((e: any) => <SelectItem key={e.id} value={String(e.id)}>{e.title}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <BentoGrid>
        <BentoTile><StatTile icon={Ticket} tone="revenue" value={`$${webRevenue.toLocaleString('es-CL')}`} label="Ventas web" /></BentoTile>
        <BentoTile><StatTile icon={ShoppingBag} tone="revenue" value={`$${cajaRevenue.toLocaleString('es-CL')}`} label="Ventas en caja" /></BentoTile>
        <BentoTile><StatTile icon={Receipt} tone="alert" value={`$${gastos.toLocaleString('es-CL')}`} label="Costos, comisiones e IVA" /></BentoTile>
        <BentoTile>
          <StatTile
            icon={DollarSign}
            tone={resultado != null && resultado < 0 ? 'danger' : 'success'}
            value={resultado != null ? `$${resultado.toLocaleString('es-CL')}` : '—'}
            label={resultado != null && resultado < 0 ? 'Pérdida' : 'Ganancia'}
          />
        </BentoTile>
      </BentoGrid>

      <PnlWarnings warnings={pnl?.warnings} merchCheck={pnl?.merchCheck} />

      <Card className="admin-clay border-0">
        <CardHeader><CardTitle>La caja de esa noche</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {(closings ?? []).length === 0 ? (
            <EmptyState icon={Store} title="Todavía no hay turnos cerrados en este evento" />
          ) : (
            <>
              {(closings ?? []).map((r: any) => {
                const cardCounted = r.countedCard ?? (r.countedDebit + r.countedCredit);
                const cardExpected = r.expectedCard ?? (r.expectedDebit + r.expectedCredit);
                return (
                  <div key={r.id} className="admin-clay-sm p-3">
                    <p className="font-semibold">{r.registerName} · {r.operatorName}</p>
                    <p className="text-sm text-[var(--admin-muted)]">
                      {formatChileDateTime(r.openedAt)} → {r.closedAt ? formatChileDateTime(r.closedAt) : '—'} · {r.salesCount} ventas
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-2 text-sm">
                      <p>Efectivo: <strong className="tabular-nums">${r.countedCash.toLocaleString('es-CL')}</strong> <span className="text-[var(--admin-muted)]">de ${(r.expectedCash + r.openingCash).toLocaleString('es-CL')}</span></p>
                      <p>Tarjetas: <strong className="tabular-nums">${cardCounted.toLocaleString('es-CL')}</strong> <span className="text-[var(--admin-muted)]">de ${cardExpected.toLocaleString('es-CL')}</span></p>
                      <p>QR: <strong className="tabular-nums">${(r.countedQr ?? 0).toLocaleString('es-CL')}</strong> <span className="text-[var(--admin-muted)]">de ${(r.expectedQr ?? 0).toLocaleString('es-CL')}</span></p>
                    </div>
                  </div>
                );
              })}
              <p className="text-sm text-[var(--admin-muted)]">El detalle venta por venta está en Gastos y P&amp;L → Cierres de turno.</p>
            </>
          )}
        </CardContent>
      </Card>

      <Card className="admin-clay border-0">
        <CardHeader>
          <CardTitle>A qué hora se movió la caja</CardTitle>
          <p className="text-sm text-[var(--admin-muted)]">Operaciones por hora, en hora de Chile.</p>
        </CardHeader>
        <CardContent>
          {peakRows.length === 0 ? (
            <EmptyState icon={Store} title="Todavía no hay movimientos de caja en este evento" />
          ) : (
            <div className="space-y-1.5">
              {peakRows.map((h: any) => (
                <div key={h.hour} className="flex items-center gap-3 text-sm">
                  <span className="w-12 shrink-0 tabular-nums text-[var(--admin-muted)]">{String(h.hour).padStart(2, '0')}:00</span>
                  <div className="flex-1 h-5 rounded-md bg-black/5 overflow-hidden">
                    <div className="h-full rounded-md bg-gradient-to-r from-primary to-secondary" style={{ width: `${(h.count / peakMax) * 100}%` }} />
                  </div>
                  <span className="w-10 shrink-0 tabular-nums text-right">{h.count}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/** Denuncias que la gente hace desde Playmatch durante la fiesta.
 *
 * Hasta ahora estas denuncias se guardaban en la base y NO había ninguna
 * pantalla donde verlas -- eran invisibles para el local. Las sin resolver
 * van primero y son las que cuenta la burbuja del menú: una denuncia que
 * miraste pero no resolviste tiene que seguir contando. */
export function DenunciasView() {
  const { data: reports, isLoading, refetch } = trpc.party.listAllReports.useQuery(undefined, { refetchInterval: 60_000 });
  const setResolved = trpc.party.setReportResolved.useMutation({
    onSuccess: () => { refetch(); },
    onError: onMutationError,
  });

  const setBanned = trpc.party.setProfileBanned.useMutation({
    onSuccess: () => { refetch(); },
    onError: onMutationError,
  });

  const pendientes = reports?.filter((r) => !r.resolvedAt) ?? [];
  const resueltas = reports?.filter((r) => r.resolvedAt) ?? [];

  const Row = ({ r }: { r: any }) => (
    <div className={`p-4 rounded-2xl border ${r.resolvedAt ? 'border-border/50 bg-card/50' : 'border-destructive/30 bg-destructive/5'}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm">
            <span className="font-semibold">{r.reportedAlias ?? 'Perfil eliminado'}</span>
            <span className="text-muted-foreground"> denunciado/a por </span>
            <span className="font-semibold">{r.reporterAlias ?? 'perfil eliminado'}</span>
          </p>
          <p className="text-sm mt-1.5 break-words">{r.reason}</p>
          <p className="text-xs text-muted-foreground mt-2">
            {r.eventTitle ?? 'Evento eliminado'}
            {r.reportedZone ? ` · zona ${r.reportedZone}` : ''}
            {' · '}{formatChileDateTime(r.createdAt)}
          </p>
        </div>
        <div className="flex flex-col gap-2 shrink-0">
        {r.reportedProfileId && (
          <WriteButton
            variant={r.reportedBanned ? 'outline' : 'destructive'}
            size="sm"
            className="interactive"
            disabled={setBanned.isPending}
            onClick={() => setBanned.mutate({ profileId: r.reportedProfileId, banned: !r.reportedBanned })}
          >
            {r.reportedBanned ? 'Reincorporar' : 'Expulsar de Playmatch'}
          </WriteButton>
        )}
        <WriteButton
          variant={r.resolvedAt ? 'outline' : 'default'}
          size="sm"
          className="interactive"
          disabled={setResolved.isPending}
          onClick={() => setResolved.mutate({ id: r.id, resolved: !r.resolvedAt })}
        >
          {r.resolvedAt ? 'Reabrir' : 'Marcar resuelta'}
        </WriteButton>
        </div>
      </div>
    </div>
  );

  return (
    <div className="space-y-5">
      <h2 className="font-heading text-2xl">Denuncias</h2>
      <p className="text-muted-foreground text-sm">
        Reportes que las personas hacen entre ellas desde Playmatch durante la fiesta. Las pendientes cuentan en la
        burbuja del menú hasta que las marques como resueltas.
      </p>

      {isLoading && <p className="text-sm text-muted-foreground">Cargando…</p>}

      {!isLoading && pendientes.length === 0 && resueltas.length === 0 && (
        <p className="text-sm text-muted-foreground">No hay denuncias registradas.</p>
      )}

      {pendientes.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Pendientes ({pendientes.length})
          </h3>
          {pendientes.map((r) => <Row key={r.id} r={r} />)}
        </div>
      )}

      {resueltas.length > 0 && (
        <div className="space-y-3 pt-2">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Resueltas ({resueltas.length})
          </h3>
          {resueltas.map((r) => <Row key={r.id} r={r} />)}
        </div>
      )}
    </div>
  );
}

/** «Mejor disfraz» (aniversario Halloween): los disfraces más votados en Playmatch, para premiar en
 * vivo. Los votos los ve solo el staff: los invitados saben únicamente a quién votaron ellos. Con el
 * alias, el disfraz y la zona se encuentra a la persona en la fiesta, y con el nombre de su entrada
 * se la puede llamar por el micrófono. Se actualiza solo cada 15 segundos. */
export function MejorDisfrazView() {
  const { data: events } = trpc.events.listAll.useQuery();
  const [eventId, setEventId] = useState<number | null>(null);
  const activeId = eventId ?? events?.[0]?.id ?? null;
  const { data: ranking, isLoading } = trpc.party.costumeRanking.useQuery({ eventId: activeId! }, { enabled: !!activeId, refetchInterval: 15_000 });
  const medal = (i: number) => (['🥇', '🥈', '🥉'][i] ?? `${i + 1}.`);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-heading text-2xl">Mejor disfraz</h2>
        <select
          value={activeId ?? ''}
          onChange={(e) => setEventId(Number(e.target.value))}
          className="h-10 rounded-lg border border-border bg-card px-3 text-sm"
          aria-label="Evento"
        >
          {events?.map((e) => <option key={e.id} value={e.id}>{e.title}</option>)}
        </select>
      </div>
      <p className="text-sm text-muted-foreground">Cada invitado vota por hasta 3 disfraces desde Playmatch (solo con el Modo Halloween prendido en Ajustes). Esto lo ves solo tú.</p>

      {isLoading && <p className="text-sm text-muted-foreground">Cargando…</p>}
      {!isLoading && (ranking?.length ?? 0) === 0 && (
        <p className="rounded-2xl border border-border/60 bg-card/50 p-6 text-center text-sm text-muted-foreground">Todavía no hay votos para este evento.</p>
      )}
      <div className="space-y-2.5">
        {ranking?.map((r, i) => (
          <div key={r.profileId} className={`flex items-center gap-4 rounded-2xl border p-4 ${i === 0 ? 'border-amber-400/50 bg-amber-400/10' : 'border-border/60 bg-card/50'} ${r.banned ? 'opacity-50' : ''}`}>
            <span className="w-9 shrink-0 text-center text-2xl">{medal(i)}</span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-base font-semibold">{r.costume ?? 'Sin disfraz escrito'}</p>
              <p className="truncate text-sm text-muted-foreground">
                {r.alias}{r.zone ? ` · en ${r.zone}` : ''}{r.holderName ? ` · entrada de ${r.holderName}` : ''}{r.banned ? ' · expulsado/a' : ''}
              </p>
            </div>
            <div className="shrink-0 text-right">
              <p className="font-heading text-3xl leading-none">{r.votes}</p>
              <p className="text-xs text-muted-foreground">{r.votes === 1 ? 'voto' : 'votos'}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Cuenta de prueba de la App (server/demoAccount.ts): una cuenta con todo lo que la App puede
 * mostrar, en eventos ocultos. Se entra a la App con el correo que se escribe acá (llega el código).
 * «Borrar todo» deja la base como estaba. */
export function CuentaDemoView() {
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.demoAccount.status.useQuery(undefined, { refetchInterval: 10_000 });
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const refresh = () => utils.demoAccount.status.invalidate();
  const create = trpc.demoAccount.create.useMutation({
    onSuccess: () => { refresh(); toast.success('Cuenta de prueba lista: entra a la App con ese correo'); },
    onError: onMutationError,
  });
  const phase = trpc.demoAccount.setPhase.useMutation({
    onSuccess: (r) => {
      refresh();
      toast.success(r.phase === 'durante'
        ? (r.interactions ? 'Fiesta en curso: entrada escaneada, Playmatch abierto, con Super Like, likes y un match' : 'Fiesta en curso. Inscríbete en Playmatch desde la App y vuelve a apretar para ver Super Like, likes y match')
        : 'Volvió a «antes de la fiesta»');
    },
    onError: onMutationError,
  });
  const del = trpc.demoAccount.delete.useMutation({
    onSuccess: () => { refresh(); toast.success('Cuenta de prueba borrada'); },
    onError: onMutationError,
  });
  const durante = data?.exists && data.phase === 'durante';

  return (
    <div className="space-y-5">
      <h2 className="font-heading text-2xl">Cuenta de prueba</h2>
      <p className="text-muted-foreground text-sm">
        Arma una cuenta de la App con todo lo que puede mostrar: entrada «Acceso Trío» con 2 acompañantes y los 5 extras
        (estacionamiento, guardarropía, consumo, merch y extra), nivel VIP, saldo, Playcoins y movimientos, cupones (vigente,
        usado y vencido), sellos, panel de embajador e invitados de Playmatch con foto y disfraz. Todo en eventos ocultos y
        a $0: no aparece en el sitio ni en la caja, no suma plata en las ventas, y los códigos de prueba no sirven en compras reales. El cliente de prueba sí aparece en Clientes mientras exista.
      </p>

      <div className="space-y-3 rounded-2xl border border-border/50 bg-card/50 p-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-sm">
            <span className="mb-1 block text-muted-foreground">Correo para entrar</span>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="tu.otro.correo@gmail.com"
              className="h-10 w-72 max-w-full rounded-lg border border-border bg-background px-3" />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-muted-foreground">Nombre</span>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Camila Prueba"
              className="h-10 w-48 rounded-lg border border-border bg-background px-3" />
          </label>
          <WriteButton disabled={create.isPending || !email.includes('@')}
            onClick={() => { if (!data?.exists || confirm('Esto borra la cuenta de prueba anterior y crea una nueva. ¿Seguir?')) create.mutate({ email, name }); }}>
            {create.isPending ? 'Creando…' : data?.exists ? 'Recrear cuenta' : 'Crear cuenta de prueba'}
          </WriteButton>
        </div>
        <p className="text-xs text-muted-foreground">Usa un correo que nunca haya comprado (uno secundario tuyo): al borrar se borra ese cliente completo.</p>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Cargando…</p>}
      {!isLoading && !data?.exists && <p className="text-sm text-muted-foreground">Todavía no hay cuenta de prueba.</p>}

      {data?.exists && (
        <div className="space-y-4 rounded-2xl border border-border/50 bg-card/50 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="font-semibold">{data.email}</p>
              <p className="text-sm text-muted-foreground">
                {durante ? 'Fiesta en curso (entrada escaneada, Playmatch abierto)' : 'Antes de la fiesta (cuenta regresiva y QR)'}
                {' · '}{data.playmatchEnrolled ? 'inscrita en Playmatch' : 'todavía no se inscribe en Playmatch'}
                {data.ambassadorCode ? ` · embajador ${data.ambassadorCode}` : ''}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <WriteButton variant="outline" disabled={phase.isPending} onClick={() => phase.mutate({ phase: durante ? 'antes' : 'durante' })}>
                {durante ? 'Volver a «antes»' : 'Empezar la fiesta'}
              </WriteButton>
              <WriteButton variant="outline" disabled={del.isPending}
                onClick={() => { if (confirm('¿Borrar la cuenta de prueba completa (cliente, entradas, cupones, embajador y Playmatch)?')) del.mutate(); }}>
                Borrar todo
              </WriteButton>
            </div>
          </div>
          <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
            <li>Entra a la App (Mi cuenta) con ese correo: te llega el código.</li>
            <li>En la pestaña Playmatch inscríbete y sube tus fotos.</li>
            <li>Aprieta «Empezar la fiesta»: tu entrada queda escaneada, Playmatch abre y los invitados de prueba te mandan un Super Like, te dan ♥ y uno ya es match con mensajes. Puedes apretarlo de nuevo para repetir.</li>
            <li>Para ver la sección «Staff»: en Noche → Staff agrega a alguien con este mismo correo y un cargo; ahí crea su PIN.</li>
          </ol>
        </div>
      )}
    </div>
  );
}

/** Invitados de prueba para ensayar Playmatch antes de la fiesta.
 *
 * Crea un evento OCULTO ("draft": no sale en el sitio, ni en la caja, ni en
 * la puerta, ni en el correo de las 3am) con N invitados. Cada uno trae su
 * link directo y un QR en pantalla para probar el lector de /playmatch con
 * otro celular. "Borrar todo" deja la base como estaba. */
export function PlaymatchTestView() {
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.party.testStatus.useQuery(undefined, { refetchInterval: 5000 });
  const [count, setCount] = useState(4);
  const [inside, setInside] = useState(true);
  const origin = typeof window !== 'undefined' ? window.location.origin : '';

  const refresh = () => utils.party.testStatus.invalidate();
  const create = trpc.party.testCreate.useMutation({
    onSuccess: () => { refresh(); toast.success('Invitados de prueba listos'); },
    onError: onMutationError,
  });
  const enter = trpc.party.testEnter.useMutation({ onSuccess: refresh, onError: onMutationError });
  const del = trpc.party.testDelete.useMutation({
    onSuccess: () => { refresh(); toast.success('Datos de prueba borrados'); },
    onError: onMutationError,
  });

  const copy = (text: string) => {
    navigator.clipboard?.writeText(text).then(() => toast.success('Link copiado'), () => toast.error('No se pudo copiar'));
  };

  return (
    <div className="space-y-5">
      <h2 className="font-heading text-2xl">Probar Playmatch</h2>
      <p className="text-muted-foreground text-sm">
        Crea invitados de prueba en un evento oculto (no aparece en el sitio, ni en la caja, ni en la puerta, ni en
        los correos). Abre el link de cada uno en un celular o navegador distinto para probar perfil, foto, swipe,
        match y chat. "Borrar todo" deja la base como estaba.
      </p>

      <div className="p-4 rounded-2xl border border-border/50 bg-card/50 space-y-3">
        <div className="flex flex-wrap items-end gap-4">
          <label className="text-sm">
            <span className="block text-muted-foreground mb-1">Invitados</span>
            <input
              type="number" min={2} max={10} value={count}
              onChange={(e) => setCount(Math.max(2, Math.min(10, Number(e.target.value) || 2)))}
              className="h-10 w-24 px-3 rounded-lg border border-border bg-background"
            />
          </label>
          <label className="flex items-center gap-2 text-sm pb-2">
            <input type="checkbox" checked={inside} onChange={(e) => setInside(e.target.checked)} />
            Ya pasaron la puerta
          </label>
          <WriteButton disabled={create.isPending} onClick={() => create.mutate({ count, inside })}>
            {data?.exists ? 'Recrear invitados' : 'Crear invitados de prueba'}
          </WriteButton>
          {data?.exists && (
            <WriteButton
              variant="outline"
              disabled={del.isPending}
              onClick={() => { if (confirm('¿Borrar el evento de prueba y todo lo que hicieron los invitados?')) del.mutate(); }}
            >
              Borrar todo
            </WriteButton>
          )}
        </div>
        {!inside && (
          <p className="text-xs text-muted-foreground">
            Sin marcar entrada: abre /verificar/&lt;código&gt; en un celular y toca "Marcar entrada" acá; en unos
            5 segundos le aparece "¡Ya estás adentro!" (prueba del aviso al entrar).
          </p>
        )}
        <p className="text-xs text-muted-foreground">Recrear borra primero lo anterior (perfiles, fotos, swipes y chats de la prueba).</p>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Cargando…</p>}
      {!isLoading && !data?.exists && <p className="text-sm text-muted-foreground">Todavía no hay invitados de prueba.</p>}

      {data?.exists && (
        <div className="grid gap-3 sm:grid-cols-2">
          {data.guests.map((g) => {
            const link = `${origin}/fiesta/${g.ticketCode}`;
            return (
              <div key={g.ticketCode} className="p-4 rounded-2xl border border-border/50 bg-card/50 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-mono text-sm font-semibold">{g.ticketCode}</p>
                    <p className="text-xs text-muted-foreground">
                      {g.alias ? `Alias: ${g.alias}` : 'Aún sin perfil'}
                      {g.hasPhoto ? ' · con foto' : ''}
                      {g.banned ? ' · expulsado' : ''}
                    </p>
                  </div>
                  <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${g.status === 'used' ? 'bg-green-500/15 text-green-600' : 'bg-muted text-muted-foreground'}`}>
                    {g.status === 'used' ? 'Adentro' : 'Afuera'}
                  </span>
                </div>
                <TestGuestQr value={`${origin}/verificar/${g.ticketCode}`} />
                <div className="flex flex-wrap gap-2">
                  <a href={link} target="_blank" rel="noreferrer" className="text-sm underline">Abrir Playmatch</a>
                  <button className="text-sm underline" onClick={() => copy(link)}>Copiar link</button>
                  {g.status !== 'used' && (
                    <WriteButton size="sm" disabled={enter.isPending} onClick={() => enter.mutate({ ticketCode: g.ticketCode })}>
                      Marcar entrada
                    </WriteButton>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** QR de la entrada de prueba (mismo contenido que el de una entrada real:
 * /verificar/<código>) para probar el lector de /playmatch desde otro celular. */
export function TestGuestQr({ value }: { value: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    import('qrcode').then((m) => m.default.toDataURL(value, { width: 220, margin: 1 }))
      .then((url) => { if (!cancelled) setSrc(url); })
      .catch(() => { if (!cancelled) setSrc(null); });
    return () => { cancelled = true; };
  }, [value]);
  return src ? <img src={src} alt="QR de la entrada de prueba" className="w-28 h-28 rounded-lg bg-white p-1" /> : <div className="w-28 h-28" />;
}

/** Tragos que se invitaron durante una fiesta. Lo importante para el local
 * es la última columna: los "pagado" que nadie retiró son plata cobrada
 * que todavía se debe en la barra, y siguen válidos para la próxima
 * fiesta (decisión del dueño). */
export function PartyGiftsView() {
  const { data: events } = trpc.events.listAll.useQuery();
  const [eventId, setEventId] = useState<number | null>(null);
  const activeId = eventId ?? events?.[0]?.id ?? null;
  const { data: gifts, isLoading } = trpc.party.listGifts.useQuery({ eventId: activeId! }, { enabled: !!activeId });

  const LABELS: Record<string, { text: string; cls: string }> = {
    invited: { text: 'Invitado', cls: 'bg-muted text-muted-foreground' },
    accepted: { text: 'Aceptado, sin pagar', cls: 'bg-amber-500/15 text-amber-600' },
    declined: { text: 'Rechazado', cls: 'bg-muted text-muted-foreground' },
    expired: { text: 'Vencido', cls: 'bg-muted text-muted-foreground' },
    paid: { text: 'Pagado — por retirar', cls: 'bg-primary/15 text-primary' },
    redeemed: { text: 'Retirado', cls: 'bg-emerald-500/15 text-emerald-600' },
  };

  const paid = gifts?.filter((g) => g.status === 'paid') ?? [];
  const totalPorRetirar = paid.reduce((s, g) => s + g.priceClp, 0);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-heading text-2xl">Tragos de la Fiesta</h2>
        <select
          value={activeId ?? ''}
          onChange={(e) => setEventId(Number(e.target.value))}
          className="h-10 px-3 rounded-lg border border-border bg-background text-sm"
        >
          {events?.map((ev: any) => <option key={ev.id} value={ev.id}>{ev.title}</option>)}
        </select>
      </div>

      {paid.length > 0 && (
        <div className="p-4 rounded-2xl bg-primary/10 border border-primary/25">
          <p className="text-sm font-semibold">{paid.length} trago{paid.length === 1 ? '' : 's'} pagado{paid.length === 1 ? '' : 's'} sin retirar</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            ${totalPorRetirar.toLocaleString('es-CL')} ya cobrados que la barra todavía debe. Siguen válidos para la próxima fiesta.
          </p>
        </div>
      )}

      {isLoading && <p className="text-sm text-muted-foreground">Cargando…</p>}
      {gifts?.length === 0 && <p className="text-sm text-muted-foreground">Nadie invitó tragos en esta fiesta todavía.</p>}

      {(gifts?.length ?? 0) > 0 && (
        <div className="overflow-x-auto rounded-2xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left">
              <tr>
                <th className="p-3 font-semibold">Trago</th>
                <th className="p-3 font-semibold">De</th>
                <th className="p-3 font-semibold">Para</th>
                <th className="p-3 font-semibold">Precio</th>
                <th className="p-3 font-semibold">Código</th>
                <th className="p-3 font-semibold">Estado</th>
              </tr>
            </thead>
            <tbody>
              {gifts!.map((g) => (
                <tr key={g.id} className="border-t border-border/60">
                  <td className="p-3">{g.drinkName}</td>
                  <td className="p-3 text-muted-foreground">{g.fromAlias}</td>
                  <td className="p-3 text-muted-foreground">{g.toAlias}</td>
                  <td className="p-3">${g.priceClp.toLocaleString('es-CL')}</td>
                  <td className="p-3 font-mono text-xs">{g.displayCode ?? '—'}</td>
                  <td className="p-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${LABELS[g.status]?.cls ?? ''}`}>
                      {LABELS[g.status]?.text ?? g.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
