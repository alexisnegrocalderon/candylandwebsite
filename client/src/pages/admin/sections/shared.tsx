/* Piezas que usan varias secciones del panel (o el panel y una sección). */
import { Fragment, createContext, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { NOT_ADMIN_ERR_MSG } from '@shared/const';
import { WriteButton, DownloadLink } from '@/components/admin/WriteButton';
import { MAX_AMBASSADOR_BUYER_DISCOUNT } from '@shared/ambassadorDiscount';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Home, DollarSign, Ticket, Users, Plus, Edit, ShoppingBag, X, Download, Mail, ChevronDown, ChevronUp, MessageCircle, Trash2, Instagram, UserPlus, Receipt, Send, Copy, ArrowUpCircle, CalendarClock, Link2, RotateCcw, Image as ImageIcon } from 'lucide-react';
import { AdminPasswordDialog } from '@/components/admin/AdminPasswordDialog';
import { whatsappLinkFor, instagramLinkFor } from '@shared/ambassadorApplication';
import { isValidRut, formatRutLive } from '@shared/rut';
import { ordersOutsideFilter } from '@shared/ordersOutsideFilter';
import { DEFAULT_REFUND_PERCENT, REFUND_DEADLINE_DAYS, isPastRefundDeadline, refundAmountForPercent, refundPercentForAmount } from '@shared/orderRefund';
import { ORDERS_PAGE_SIZE, ORDERS_REMINDERS_PAGE_SIZE, nextEventId, pageCount, pageRange } from '@shared/ordersPagination';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogTrigger, AlertDialogContent, AlertDialogHeader, AlertDialogFooter, AlertDialogTitle, AlertDialogDescription, AlertDialogAction, AlertDialogCancel } from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { ConfirmDeleteButton } from '@/components/admin/ConfirmDeleteButton';
import { StatusBadge } from '@/components/admin/StatusBadge';
import { StatTile } from '@/components/admin/StatTile';
import { BentoGrid, BentoTile } from '@/components/admin/BentoGrid';
import { RowActions, RowActionLink, RowActionButton } from '@/components/admin/RowActions';
import { SwipeToDeleteCard } from '@/components/admin/SwipeToDeleteCard';
import { SwipeToDeleteRow } from '@/components/admin/SwipeToDeleteRow';
import { EmptyState } from '@/components/admin/EmptyState';
import { TableSkeleton } from '@/components/admin/TableSkeleton';
import { useCoarsePointer } from '@/hooks/useCoarsePointer';
import { EXPENSE_CATEGORIES, categoryLabel, documentTypeLabel, paymentMethodLabel } from '@shared/expenses';
import { formatChileShortDate, formatChileTime } from '@shared/chileDate';

export const onMutationError = (error: unknown) => {
  const message = error instanceof Error ? error.message : 'No se pudo guardar. Intenta de nuevo.';
  // El invitado de demostración recibe FORBIDDEN del servidor en cualquier
  // escritura. Los botones ya salen deshabilitados, así que llegar acá
  // significa que se disparó por otro camino -- vale explicarlo en criollo
  // en vez de mostrar el mensaje técnico de permisos.
  if (message === NOT_ADMIN_ERR_MSG || message === 'Admin access required') {
    toast.error('Modo demo — solo lectura. Esta acción está deshabilitada.');
    return;
  }
  toast.error(message === 'Database not available' ? 'Base de datos no configurada — nada se guardó. Revisa DATABASE_URL en Vercel.' : message);
};

// Los inputs datetime-local no llevan zona horaria — si se manda tal cual al
// servidor (que corre en UTC), "21:00" se guarda como 21:00 UTC, que son las
// 17:00 en Chile. Chile cambia de horario (UTC-3 en horario de verano,
// ~sep-abr; UTC-4 en invierno), así que el offset se calcula para cada fecha
// puntual con la zona horaria real America/Santiago en vez de asumir uno fijo
// — mismo criterio con el que EventDetail.tsx y Ticket.tsx ya muestran la hora.

/** Offset de America/Santiago (en ms, a sumar a UTC para obtener hora Chile) para un instante dado. */
export function chileOffsetMs(date: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Santiago',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).formatToParts(date).reduce<Record<string, string>>((acc, p) => {
    if (p.type !== 'literal') acc[p.type] = p.value;
    return acc;
  }, {});
  // Instante que la wall-clock de Chile representa, interpretado como si fuera UTC.
  const asUtc = Date.UTC(
    Number(parts.year), Number(parts.month) - 1, Number(parts.day),
    Number(parts.hour) === 24 ? 0 : Number(parts.hour), Number(parts.minute), Number(parts.second)
  );
  return asUtc - date.getTime();
}

/** DB (UTC) → valor para un <input type="datetime-local"> mostrando hora de Chile. */
export function toChileInputValue(dateInput: string | Date | null | undefined): string {
  if (!dateInput) return '';
  const date = new Date(dateInput);
  const chileTime = new Date(date.getTime() + chileOffsetMs(date));
  return chileTime.toISOString().slice(0, 16);
}

/** Valor de un <input type="datetime-local"> (hora de Chile, sin zona) → ISO con offset, para mandar al servidor. */
export function fromChileInputValue(value: string): string {
  if (!value) return '';
  // Se interpreta primero la wall-clock ingresada como si fuera UTC solo para
  // ubicar la fecha/hora y así calcular el offset de Chile que le corresponde.
  const naiveUtc = new Date(`${value}:00Z`);
  const offsetMs = chileOffsetMs(naiveUtc);
  const totalMinutes = offsetMs / 60000;
  const sign = totalMinutes < 0 ? '-' : '+';
  const abs = Math.abs(totalMinutes);
  const hh = String(Math.floor(abs / 60)).padStart(2, '0');
  const mm = String(abs % 60).padStart(2, '0');
  return `${value}:00${sign}${hh}:${mm}`;
}

/* ─── Burbujas de novedades del menú ──────────────────────────────────────
 * El dueño tenía que entrar sección por sección para descubrir si había algo
 * nuevo. Ahora cada ítem del menú puede mostrar un número.
 *
 * Las secciones de acá abajo son las de "nuevo desde que lo miraste": se
 * guarda en este dispositivo cuándo se abrió cada una por última vez y el
 * servidor cuenta lo que llegó después (server/db.ts getAdminBadgeCounts).
 * Las otras que devuelve ese contador (postulaciones, denuncias, tragos sin
 * retirar, turnos abiertos) son "pendientes de acción": no se limpian por
 * mirarlas, sino al resolverlas, así que no llevan marca de visto.
 *
 * Se guarda en localStorage y no en la base a propósito: así no necesita
 * migración ni backend, y el precio es que la cuenta es por dispositivo (el
 * iPad y el computador llevan la suya). Si algún día molesta, se mueve a
 * siteSettings sin tocar el resto. */
export const BADGE_SEEN_KEY = 'mp-admin-section-seen-v1';

export const BADGE_SEEN_SECTIONS = ['orders-web', 'orders-caja', 'leads', 'customers', 'referrals'] as const;

export function readSeenMap(): Record<string, string> {
  try {
    const raw = localStorage.getItem(BADGE_SEEN_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    // Safari en modo privado puede tirar excepción al leer localStorage.
    return {};
  }
}

export function writeSeenMap(map: Record<string, string>) {
  try { localStorage.setItem(BADGE_SEEN_KEY, JSON.stringify(map)); } catch { /* no pasa nada, se pierde la marca */ }
}

/** `enabled` en false para el socio de una co-producción: las burbujas son
 * de Playroom y el servidor igual le respondería FORBIDDEN. */
export function useAdminBadges(enabled = true) {
  const [seenAt, setSeenAt] = useState<Record<string, string>>(() => {
    const stored = readSeenMap();
    // Primera vez en este dispositivo: se marca todo como visto AHORA. Si no,
    // la primera carga mostraría el historial entero como "nuevo", que es
    // ruido y no información.
    if (Object.keys(stored).length === 0) {
      const now = new Date().toISOString();
      const initial = Object.fromEntries(BADGE_SEEN_SECTIONS.map((s) => [s, now]));
      writeSeenMap(initial);
      return initial;
    }
    return stored;
  });

  const { data } = trpc.adminBadges.counts.useQuery({ seenAt }, {
    enabled,
    refetchInterval: 60_000,
    // Sin esto, el panel abierto de fondo en el iPad le pega al servidor toda
    // la noche sin que nadie lo esté mirando (mismo criterio que Home.tsx).
    refetchIntervalInBackground: false,
    // Al marcar una sección como vista cambia el input y con él la clave de
    // caché: sin esto las burbujas parpadearían a vacío en cada click.
    placeholderData: (prev) => prev,
  });

  const markSeen = (section: string) => {
    if (!(BADGE_SEEN_SECTIONS as readonly string[]).includes(section)) return;
    setSeenAt((prev) => {
      const next = { ...prev, [section]: new Date().toISOString() };
      writeSeenMap(next);
      return next;
    });
  };

  return { counts: (data ?? {}) as Record<string, number>, markSeen };
}

/* Debe coincidir con los ids de CANDYLAND.accesos (client/src/config/candyland.ts)
 * y con el enum accesoSlug del router — es lo que conecta cada entrada con la
 * pregunta correspondiente del checkout conversacional. */
export type AccesoSlug = 'duo' | 'duo_mujeres' | 'soltera' | 'soltero' | 'trio' | 'grupo' | 'cumpleaneros';

export const ACCESO_SLUG_OPTIONS: { value: AccesoSlug; label: string }[] = [
  { value: 'soltera', label: 'Soltera (ella sola)' },
  { value: 'soltero', label: 'Soltero (él solo)' },
  { value: 'duo', label: 'Dúo (pareja)' },
  { value: 'duo_mujeres', label: 'Dúo Mujeres (2x1, mismo valor que Soltera)' },
  { value: 'trio', label: 'Trío' },
  { value: 'grupo', label: 'Grupo' },
  { value: 'cumpleaneros', label: 'Cumpleañeros' },
];

/** Lista de bloqueo por RUT: si el RUT del comprador o de algún acompañante
 * coincide (exacto, normalizado), el checkout rechaza la compra antes de
 * crear la orden (ver createOrder, server/db.ts). El nombre acá es solo
 * referencia para reconocer a quién corresponde cada RUT -- el bloqueo
 * nunca matchea por nombre, para no bloquear a un homónimo por error. */

/** Tarjeta de estadística con ícono en badge circular de color (estilo de
 * las referencias mandadas: número grande + badge de color, sin borde duro). */
export function StatCard({ icon: Icon, colorClass, value, label }: { icon: typeof DollarSign; colorClass: string; value: string | number; label: string }) {
  return (
    <Card className="rounded-2xl border-0 shadow-md shadow-black/5">
      <CardContent className="pt-6 flex items-center gap-4">
        <div className={`w-12 h-12 rounded-2xl ${colorClass} flex items-center justify-center shrink-0`}>
          <Icon className="w-6 h-6 text-white" />
        </div>
        <div>
          <p className="font-heading text-3xl leading-none">{value}</p>
          <p className="text-muted-foreground text-sm mt-1">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}

/** Párrafos que manda el correo si no se escribe nada -- copia literal de
 * `parrafosPorDefecto` en server/email.ts, solo para mostrarlos acá. El correo
 * real los toma del servidor: esto es una vista previa, no la fuente. */
export const RECORDATORIO_POR_DEFECTO = [
  'Vimos que empezaste a sacar tu acceso para [evento] y quedó a medio camino. Puede pasar 🍬',
  'Tu lugar todavía no está confirmado, pero retomar toma menos de un minuto: el formulario te espera con todo lo que ya habías llenado.',
];

/** Recordatorio a las órdenes que quedaron sin pagar.
 *
 * La plantilla por defecto funciona sola; la IA es opcional y solo reescribe
 * el cuerpo. Antes de confirmar avisa a cuántos ya se les mandó uno, porque
 * insistirle cuatro veces a la misma persona es la forma más rápida de que
 * marque el correo como spam. */
export function ReminderDialog({ orders, open, onOpenChange, onSent }: {
  orders: any[];
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSent: () => void;
}) {
  const [idea, setIdea] = useState('');
  const [cuerpo, setCuerpo] = useState('');

  const yaAvisados = orders.filter((o) => (o.reminderCount ?? 0) > 0);

  const generar = trpc.orders.generateReminderCopy.useMutation({
    onSuccess: (data) => {
      setCuerpo(data.paragraphs.join('\n'));
      toast.success('Texto generado — revísalo antes de enviar');
    },
    onError: onMutationError,
  });

  const enviar = trpc.orders.sendReminders.useMutation({
    onSuccess: (r) => {
      const partes = [`${r.sent} recordatorio${r.sent === 1 ? '' : 's'} enviado${r.sent === 1 ? '' : 's'}`];
      if (r.skipped.length) partes.push(`${r.skipped.length} omitido${r.skipped.length === 1 ? '' : 's'} (${r.skipped.map((s) => `${s.orderNumber}: ${s.motivo}`).join(', ')})`);
      if (r.failed.length) partes.push(`${r.failed.length} con error`);
      toast.success(partes.join(' · '));
      setIdea('');
      setCuerpo('');
      onOpenChange(false);
      onSent();
    },
    onError: onMutationError,
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Enviar recordatorio a {orders.length} orden{orders.length === 1 ? '' : 'es'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {yaAvisados.length > 0 && (
            <div className="rounded-xl bg-yellow-500/10 border border-yellow-500/30 p-3 text-sm">
              <p className="font-medium text-yellow-600">
                ⚠️ A {yaAvisados.length} de {orders.length} ya se le mandó un recordatorio antes.
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {yaAvisados.map((o) => `${o.buyerName} (${o.reminderCount})`).join(' · ')}
              </p>
            </div>
          )}

          <div>
            <Label className="text-sm">Cuerpo del correo</Label>
            <p className="text-xs text-muted-foreground mb-2">
              Déjalo vacío para usar la plantilla por defecto. El saludo, el botón "Completar mi compra" y el pie los pone el sistema.
            </p>
            <Textarea
              rows={6}
              value={cuerpo}
              onChange={(e) => setCuerpo(e.target.value)}
              placeholder={RECORDATORIO_POR_DEFECTO.join('\n\n')}
            />
            <p className="text-xs text-muted-foreground mt-1">Un párrafo por línea.</p>
          </div>

          <div className="rounded-xl border border-border p-3 space-y-2">
            <Label className="text-sm">¿Quieres otro ángulo? Escríbelo y la IA lo redacta</Label>
            <div className="flex gap-2">
              <Input
                value={idea}
                onChange={(e) => setIdea(e.target.value)}
                placeholder="Ej: recordarles que el line-up ya está confirmado"
              />
              <WriteButton
                type="button"
                variant="outline"
                className="interactive shrink-0"
                disabled={idea.trim().length < 5 || generar.isPending}
                onClick={() => generar.mutate({ idea: idea.trim() })}
              >
                {generar.isPending ? 'Generando...' : 'Generar con IA'}
              </WriteButton>
            </div>
            <p className="text-xs text-muted-foreground">
              El tono siempre es de recordatorio, no de venta agresiva. Revisa el texto antes de enviar.
            </p>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" className="interactive" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <WriteButton
              className="interactive"
              disabled={enviar.isPending || orders.length === 0}
              onClick={() => enviar.mutate({
                orderIds: orders.map((o) => o.id),
                customBody: cuerpo.trim() || undefined,
              })}
            >
              {enviar.isPending ? 'Enviando...' : `Enviar a ${orders.length}`}
            </WriteButton>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export type AttendeeSlotRow = { slot: string; fullName: string; rut: string };

/** Ventana "Editar nombres" de Ventas Web: la gente escribe mal su nombre (o
 * sin apellido) y debe calzar con el carnet para entrar, así que el dueño les
 * escribe por WhatsApp y corrige acá el nombre -- y el RUT, si vino mal -- del
 * titular y de cada acompañante. */
export function EditAttendeesDialog({ order, onClose, onSaved }: { order: any | null; onClose: () => void; onSaved: () => void }) {
  const [people, setPeople] = useState<AttendeeSlotRow[]>([]);
  // Se arma solo al abrir otra orden: un refetch de la lista mientras se
  // escribe no debe pisar lo que ya se tipeó.
  useEffect(() => {
    setPeople(order ? (order.attendeeSlots ?? []).map((p: AttendeeSlotRow) => ({ ...p })) : []);
  }, [order?.id]);

  const save = trpc.orders.updateAttendees.useMutation({
    onSuccess: () => { toast.success('Nombres actualizados'); onSaved(); onClose(); },
    onError: onMutationError,
  });

  const patch = (index: number, changes: Partial<AttendeeSlotRow>) =>
    setPeople((prev) => prev.map((p, i) => (i === index ? { ...p, ...changes } : p)));

  const nameTooShort = (p: AttendeeSlotRow) => p.fullName.trim().length < 3;
  const rutInvalid = (p: AttendeeSlotRow) => p.rut.trim() !== '' && !isValidRut(p.rut);
  const canSave = people.length > 0 && !people.some((p) => nameTooShort(p) || rutInvalid(p));

  const firstName = (order?.buyerName ?? '').trim().split(/\s+/)[0] || '';
  const whatsappText = `Hola${firstName ? ` ${firstName}` : ''}! Para que puedas ingresar al evento necesitamos tu nombre completo (nombre y apellido) tal como aparece en tu carnet de identidad. Si vienes con acompañantes, envíanos también el nombre completo y el RUT de cada uno. ¡Gracias!`;
  const phoneDigits = String(order?.buyerPhone ?? '').replace(/[^0-9]/g, '');

  let companionNumber = 0;
  return (
    <Dialog open={order !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar nombres · {order?.orderNumber}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            El nombre debe coincidir con el carnet de identidad de cada persona. Los cambios quedan en el historial.
          </p>

          {phoneDigits && (
            <Button asChild variant="outline" size="sm" className="interactive">
              <a href={`https://wa.me/${phoneDigits}?text=${encodeURIComponent(whatsappText)}`} target="_blank" rel="noopener noreferrer">
                <MessageCircle className="w-4 h-4 mr-1" /> Pedir nombre completo por WhatsApp
              </a>
            </Button>
          )}

          <div className="space-y-3">
            {people.map((p, i) => {
              const isBuyer = p.slot === 'buyer_';
              if (!isBuyer) companionNumber += 1;
              const oneWord = p.fullName.trim() !== '' && p.fullName.trim().split(/\s+/).length < 2;
              return (
                <div key={p.slot} className="rounded-xl border border-border p-3 space-y-2">
                  <p className="text-sm font-medium">{isBuyer ? 'Comprador' : `Acompañante ${companionNumber}`}</p>
                  <div className="grid gap-2 sm:grid-cols-[1fr_11rem]">
                    <div>
                      <Label className="text-xs">Nombre completo</Label>
                      <Input
                        value={p.fullName}
                        onChange={(e) => patch(i, { fullName: e.target.value })}
                        placeholder="Nombre y apellido"
                        autoComplete="off"
                      />
                      {oneWord && <p className="text-xs text-[var(--admin-warning-text)] mt-1">¿Falta el apellido?</p>}
                    </div>
                    <div>
                      <Label className="text-xs">RUT</Label>
                      <Input
                        value={p.rut}
                        onChange={(e) => patch(i, { rut: formatRutLive(e.target.value) })}
                        placeholder="12.345.678-9"
                        inputMode="text"
                        autoComplete="off"
                      />
                      {rutInvalid(p) && <p className="text-xs text-destructive mt-1">RUT no válido</p>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <p className="text-xs text-muted-foreground">
            En Puerta el nombre nuevo se ve al sincronizar (sin internet, Puerta usa la lista descargada).
          </p>

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" className="interactive" onClick={onClose}>Cancelar</Button>
            <WriteButton
              className="interactive"
              disabled={!canSave || save.isPending}
              onClick={() => order && save.mutate({
                orderId: order.id,
                people: people.map((p) => ({ slot: p.slot, fullName: p.fullName, rut: p.rut.trim() || undefined })),
              })}
            >
              {save.isPending ? 'Guardando...' : 'Guardar'}
            </WriteButton>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export const clp = (n: number) => `$${Number(n).toLocaleString('es-CL')}`;

/** Ventana "Dejar para otra fecha" de Ventas Web: la persona no puede ir y el
 * dueño le deja el MISMO tipo de acceso vigente para un evento futuro. Crea un
 * código de crédito (1 acceso, sin vencimiento), cancela las entradas del acceso
 * en este evento, devuelve el cupo y le avisa por correo. El Piscolón u otros
 * extras de la compra no se tocan. Pide la clave de admin: cancela entradas. */
export function CreditDialog({ order, onClose, onDone }: { order: any | null; onClose: () => void; onDone: () => void }) {
  const [adminPassword, setAdminPassword] = useState('');
  const issue = trpc.accessCredit.createFromOrder.useMutation({
    onSuccess: (r) => {
      toast.success(`Listo: ${r.codes.map((c) => c.code).join(', ')}${r.emailSent ? ' — le llegó el correo' : ' — el correo no se pudo enviar, avísale tú'}`);
      setAdminPassword('');
      onDone();
      onClose();
    },
    onError: onMutationError,
  });
  useEffect(() => { setAdminPassword(''); }, [order?.id]);
  const accesoName = order?.accesoName ?? 'el acceso';
  return (
    <AlertDialog open={!!order} onOpenChange={(v) => { if (!v) onClose(); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Dejar {accesoName} para otra fecha</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2 text-sm">
              <p><strong>{order?.buyerName}</strong> ({order?.buyerEmail}) no podrá ir. Al confirmar:</p>
              <ul className="list-disc pl-5 space-y-1">
                <li>Se crea un <strong>código de crédito</strong> por el mismo acceso ({accesoName}), de 1 solo uso y sin fecha de vencimiento, válido para cualquier evento futuro.</li>
                <li>Las entradas de ese acceso en este evento <strong>se cancelan</strong> (ya no sirven en la puerta) y el cupo vuelve a la venta.</li>
                <li>Los extras de la compra (ej. Piscolón) <strong>no se tocan</strong>.</li>
                <li>Le llega un correo con el código y el aviso de usarlo en la preventa.</li>
              </ul>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <Input
          type="password"
          autoFocus
          value={adminPassword}
          onChange={(e) => setAdminPassword(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && adminPassword && !issue.isPending) { e.preventDefault(); issue.mutate({ orderId: order.id, adminPassword }); } }}
          placeholder="Tu clave de admin"
        />
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => { e.preventDefault(); if (adminPassword && order) issue.mutate({ orderId: order.id, adminPassword }); }}
            disabled={!adminPassword || issue.isPending}
          >
            {issue.isPending ? 'Guardando…' : 'Dejar para otra fecha'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** Ventana "Devolver" de Ventas Web: registra la devolución de una compra web
 * según la política (50% del valor pagado hasta 5 días antes del evento). NO
 * mueve plata: la devolución se hace a mano por Mercado Pago. Al confirmar, la
 * compra pasa a "Devuelta", las entradas se anulan (el cupo vuelve a la venta),
 * se quita la comisión del embajador y le llega un correo al cliente. En los
 * ingresos solo cuenta lo que se retiene. Pide la clave de admin. */
export function RefundDialog({ order, eventDate, onClose, onDone }: { order: any | null; eventDate: Date | string | null; onClose: () => void; onDone: () => void }) {
  const paid = order
    ? Number(order.total) + (order.missionTopupStatus === 'paid' ? Number(order.missionTopupAmount ?? 0) : 0)
    : 0;
  const [percent, setPercent] = useState(String(DEFAULT_REFUND_PERCENT));
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [overrideDeadline, setOverrideDeadline] = useState(false);
  const [adminPassword, setAdminPassword] = useState('');
  useEffect(() => {
    setPercent(String(DEFAULT_REFUND_PERCENT));
    setAmount(String(refundAmountForPercent(paid, DEFAULT_REFUND_PERCENT)));
    setReason('');
    setOverrideDeadline(false);
    setAdminPassword('');
  }, [order?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const refund = trpc.orderRefund.refund.useMutation({
    onSuccess: (r) => {
      toast.success(`Devolución registrada: ${clp(r.refundAmount)} (${r.refundPercent}%)${r.emailSent ? ' — le llegó el correo' : ' — el correo no se pudo enviar, avísale tú'}`);
      setAdminPassword('');
      onDone();
      onClose();
    },
    onError: onMutationError,
  });

  const amountNum = Math.round(Number(amount) || 0);
  const pastDeadline = eventDate ? isPastRefundDeadline(eventDate) : false;
  const valid = amountNum > 0 && amountNum <= paid;
  const blocked = !adminPassword || !valid || (pastDeadline && !overrideDeadline) || refund.isPending;
  const submit = () => {
    if (!order || blocked) return;
    refund.mutate({ orderId: order.id, amount: amountNum, reason: reason.trim() || undefined, overrideDeadline, adminPassword });
  };

  return (
    <AlertDialog open={!!order} onOpenChange={(v) => { if (!v) onClose(); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Devolver compra {order?.orderNumber}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2 text-sm">
              <p><strong>{order?.buyerName}</strong> ({order?.buyerEmail}) pagó <strong>{clp(paid)}</strong>. Al confirmar:</p>
              <ul className="list-disc pl-5 space-y-1">
                <li>La compra queda como <strong>Devuelta</strong> y sus entradas se <strong>anulan</strong> (ya no sirven en la puerta); el cupo vuelve a la venta.</li>
                <li>Se quita la comisión del embajador, si la había, y los códigos de descuento usados quedan disponibles.</li>
                <li>Le llega un correo con el monto y el plazo (3 días hábiles después del evento).</li>
                <li>Esto <strong>solo registra</strong> la devolución: la plata la devuelves tú por Mercado Pago.</li>
              </ul>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>% de devolución</Label>
            <Input
              type="number" min={0} max={100} value={percent} className="mt-1"
              onChange={(e) => { setPercent(e.target.value); setAmount(String(refundAmountForPercent(paid, Number(e.target.value) || 0))); }}
            />
          </div>
          <div>
            <Label>Monto a devolver ($)</Label>
            <Input
              type="number" min={0} max={paid} value={amount} className="mt-1"
              onChange={(e) => { setAmount(e.target.value); setPercent(String(refundPercentForAmount(paid, Number(e.target.value) || 0))); }}
            />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          {valid
            ? <>Te quedas con <strong>{clp(paid - amountNum)}</strong> (eso es lo que cuenta como ingreso). Puedes corregir el monto a mano.</>
            : <>El monto debe ser mayor a $0 y no más de {clp(paid)}.</>}
        </p>
        <div>
          <Label>Motivo (opcional)</Label>
          <Input value={reason} onChange={(e) => setReason(e.target.value)} className="mt-1" maxLength={500} placeholder="Ej. no puede asistir, pidió devolución por correo" />
        </div>
        {pastDeadline && (
          <label className="flex items-start gap-2 text-sm rounded-lg border border-amber-500/40 bg-amber-500/10 p-3">
            <Checkbox checked={overrideDeadline} onCheckedChange={(v) => setOverrideDeadline(v === true)} className="mt-0.5" />
            <span>Faltan menos de {REFUND_DEADLINE_DAYS} días para el evento (o ya pasó): fuera del plazo de la política. Marca para devolver igual.</span>
          </label>
        )}
        <Input
          type="password"
          value={adminPassword}
          onChange={(e) => setAdminPassword(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } }}
          placeholder="Tu clave de admin"
        />
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction onClick={(e) => { e.preventDefault(); submit(); }} disabled={blocked}>
            {refund.isPending ? 'Guardando…' : `Devolver ${clp(amountNum)}`}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** Créditos de acceso aún disponibles (Ventas Web): quién los tiene y un botón
 * para recordarles por correo que los usen, idealmente en la preventa. */
export function PendingCreditsCard() {
  const { data: credits } = trpc.accessCredit.list.useQuery();
  const remind = trpc.accessCredit.remind.useMutation({
    onSuccess: (r) => (r.sent ? toast.success('Recordatorio enviado') : toast.error('No se pudo enviar el correo')),
    onError: onMutationError,
  });
  const available = (credits ?? []).filter((c) => c.availability === 'available');
  if (available.length === 0) return null;
  return (
    <div className="rounded-xl border border-border bg-muted/20 p-3 space-y-2">
      <p className="text-sm font-medium">Créditos de acceso pendientes ({available.length})</p>
      {available.map((c) => (
        <div key={c.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <span>
            <span className="font-mono">{c.code}</span> · {c.accesoName} · {c.buyerName ?? c.buyerEmail}
            {c.originEventTitle && <span className="text-[var(--admin-muted)]"> · de {c.originEventTitle}</span>}
          </span>
          <Button size="sm" variant="outline" disabled={remind.isPending} onClick={() => remind.mutate({ creditId: c.id })}>Recordar por correo</Button>
        </div>
      ))}
    </div>
  );
}

/** Ventana "Subir de acceso" de Ventas Web: un comprador quiere pasar su acceso
 * a otro más caro (Soltera→Dúo, Dúo→Trío, Dúo→Grupo...). El admin elige el
 * acceso nuevo -- solo aparecen los que esa orden realmente puede tener --,
 * fija el monto (viene sugerido: precio de hoy − lo que pagó), carga los datos
 * que faltan de las personas nuevas (opcional) y genera el link de Mercado
 * Pago. Cuando se paga -- o el admin marca "pagado" por transferencia o
 * efectivo -- el acceso cambia con el MISMO QR. */
export type UpgradeDraft = { name: string; rut: string; instagram: string };

export function UpgradeDialog({ order, onClose, onChanged }: { order: any | null; onClose: () => void; onChanged: () => void }) {
  const orderId: number | undefined = order?.id;
  const { data: preview, isLoading, refetch } = trpc.orders.previewUpgrade.useQuery(
    { orderId: orderId ?? 0 },
    { enabled: orderId !== undefined },
  );
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [amount, setAmount] = useState('');
  const [drafts, setDrafts] = useState<Record<number, UpgradeDraft>>({});

  type Option = NonNullable<typeof preview>['options'][number];
  const pick = (o: Option) => { setSelectedId(o.ticketTypeId); setAmount(String(o.suggestedAmount)); setDrafts({}); };

  useEffect(() => { setSelectedId(null); setAmount(''); setDrafts({}); }, [orderId]);
  // Con una sola opción posible no hay nada que elegir.
  useEffect(() => {
    if (preview && !preview.pending && selectedId === null && preview.options.length === 1) pick(preview.options[0]);
  }, [preview?.orderId, preview?.options.length, preview?.pending?.id]);

  const changed = () => { refetch(); onChanged(); };
  const request = trpc.orders.requestUpgrade.useMutation({
    onSuccess: (r) => { toast.success(r.paymentUrl ? 'Link de pago creado' : 'Solicitud creada'); changed(); },
    onError: onMutationError,
  });
  const sendEmail = trpc.orders.sendUpgradeEmail.useMutation({
    onSuccess: (r) => (r.success ? toast.success('Correo enviado') : toast.error('No se pudo enviar el correo')),
    onError: onMutationError,
  });
  const markPaid = trpc.orders.markUpgradePaid.useMutation({
    onSuccess: (r) => {
      toast.success(r.applied ? 'Listo: el acceso fue actualizado' : 'Esta solicitud ya estaba pagada');
      onChanged();
      onClose();
    },
    onError: onMutationError,
  });
  const cancel = trpc.orders.cancelUpgrade.useMutation({
    onSuccess: () => { toast.success('Solicitud cancelada'); changed(); },
    onError: onMutationError,
  });

  const selected = preview?.options.find((o) => o.ticketTypeId === selectedId) ?? null;
  const draftOf = (n: number): UpgradeDraft => drafts[n] ?? { name: '', rut: '', instagram: '' };
  const patchDraft = (n: number, changes: Partial<UpgradeDraft>) =>
    setDrafts((prev) => ({ ...prev, [n]: { ...draftOf(n), ...changes } }));
  const rutInvalid = (n: number) => draftOf(n).rut.trim() !== '' && !isValidRut(draftOf(n).rut);
  const anyRutInvalid = !!selected && selected.missing.some((m) => m.needsRut && rutInvalid(m.n));

  const amountNumber = Number(amount.replace(/[^0-9]/g, ''));
  const pending = preview?.pending ?? null;
  const firstName = (order?.buyerName ?? '').trim().split(/\s+/)[0] || '';
  const phoneDigits = String(order?.buyerPhone ?? '').replace(/[^0-9]/g, '');
  const whatsappText = pending?.paymentUrl
    ? `Hola${firstName ? ` ${firstName}` : ''}! Para subir tu acceso${pending.fromName && pending.toName ? ` de ${pending.fromName} a ${pending.toName}` : ''} solo falta pagar la diferencia de ${clp(pending.amount)}. Puedes pagar aquí: ${pending.paymentUrl} . Cuando se acredite el pago, tu acceso queda actualizado con el mismo código QR. ${pending.stillMissing.length > 0 ? 'Para dejar todo listo, envíanos el nombre completo y el RUT de las personas nuevas, tal como aparecen en su carnet de identidad.' : 'Recuerda que el nombre de cada persona debe coincidir con su carnet de identidad.'} ¡Gracias!`
    : '';

  const copyLink = async () => {
    if (!pending?.paymentUrl) return;
    try {
      await navigator.clipboard.writeText(pending.paymentUrl);
      toast.success('Link copiado');
    } catch {
      toast.error('No se pudo copiar; selecciónalo y cópialo a mano');
    }
  };

  const submit = () => {
    if (!order || !selected) return;
    request.mutate({
      orderId: order.id,
      toTicketTypeId: selected.ticketTypeId,
      amount: amountNumber,
      people: selected.missing.map((m) => ({
        n: m.n,
        name: draftOf(m.n).name.trim() || undefined,
        rut: draftOf(m.n).rut.trim() || undefined,
        instagram: draftOf(m.n).instagram.trim() || undefined,
      })),
    });
  };

  return (
    <Dialog open={order !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Subir de acceso · {order?.orderNumber}</DialogTitle>
        </DialogHeader>

        {isLoading || !preview ? (
          <p className="text-sm text-muted-foreground">Cargando…</p>
        ) : (
          <div className="space-y-4">
            {preview.tableMissing && (
              <div role="alert" className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                Esta función todavía no está lista en la base de datos (falta aplicar una migración). Avísale a quien administra el sistema.
              </div>
            )}
            {preview.blockedReason && (
              <div className="rounded-xl bg-yellow-500/10 border border-yellow-500/30 p-3 text-sm text-yellow-700">
                {preview.blockedReason}
              </div>
            )}

            {preview.from && (
              <div className="rounded-xl border border-border p-3 text-sm">
                <span className="text-muted-foreground">Acceso actual:</span> {preview.from.name} · {preview.from.personas} persona{preview.from.personas === 1 ? '' : 's'} · pagó {clp(preview.from.paidUnitPrice)}
              </div>
            )}

            {!pending && !preview.tableMissing && preview.options.length > 0 && (
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label className="text-sm">Subir a</Label>
                  {preview.options.map((o) => (
                    <button
                      key={o.ticketTypeId}
                      type="button"
                      onClick={() => pick(o)}
                      className={`w-full rounded-xl border p-3 text-left text-sm transition-colors ${selectedId === o.ticketTypeId ? 'border-primary bg-primary/10' : 'border-border hover:bg-muted/50'}`}
                    >
                      <span className="font-medium">{o.name}</span>
                      <span className="text-muted-foreground"> · {o.personas} persona{o.personas === 1 ? '' : 's'} · hoy {clp(o.price)}</span>
                      <span className="block text-xs text-muted-foreground">
                        Diferencia sugerida {clp(o.suggestedAmount)}
                        {o.missing.length > 0 ? ` · faltan datos de ${o.missing.length} persona${o.missing.length === 1 ? '' : 's'}` : ' · no faltan datos'}
                      </span>
                    </button>
                  ))}
                </div>

                {selected && (
                  <>
                    <div>
                      <Label className="text-sm">Diferencia a cobrar (CLP)</Label>
                      <Input
                        value={amount}
                        onChange={(e) => setAmount(e.target.value.replace(/[^0-9]/g, ''))}
                        inputMode="numeric"
                        className="max-w-[12rem]"
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        Sugerido: {clp(selected.suggestedAmount)} ({selected.name} de hoy − lo que pagó). Puedes cambiarlo.
                      </p>
                      {amountNumber < preview.minPayment && (
                        <p className="text-xs text-[var(--admin-warning-text)] mt-1">
                          Con menos de {clp(preview.minPayment)} no se puede crear un link de pago: solo quedará la solicitud para marcarla como pagada.
                        </p>
                      )}
                    </div>

                    {selected.missing.length > 0 && (
                      <div className="rounded-xl border border-border p-3 space-y-3">
                        <div>
                          <p className="text-sm font-medium">Datos de las personas nuevas (opcional)</p>
                          <p className="text-xs text-muted-foreground">
                            Si todavía no los tienes, déjalos vacíos: el mensaje al cliente ya los pide y después se completan con "Editar nombres".
                          </p>
                        </div>
                        {selected.missing.map((m) => (
                          <div key={m.n} className="space-y-2">
                            <p className="text-xs font-medium text-muted-foreground">Persona {m.n + 1}</p>
                            <div className="grid gap-2 sm:grid-cols-2">
                              {m.needsName && (
                                <div>
                                  <Label className="text-xs">Nombre completo</Label>
                                  <Input value={draftOf(m.n).name} onChange={(e) => patchDraft(m.n, { name: e.target.value })} placeholder="Nombre y apellido" autoComplete="off" />
                                </div>
                              )}
                              {m.needsRut && (
                                <div>
                                  <Label className="text-xs">RUT</Label>
                                  <Input value={draftOf(m.n).rut} onChange={(e) => patchDraft(m.n, { rut: formatRutLive(e.target.value) })} placeholder="12.345.678-9" autoComplete="off" />
                                  {rutInvalid(m.n) && <p className="text-xs text-destructive mt-1">RUT no válido</p>}
                                </div>
                              )}
                              <div>
                                <Label className="text-xs">Instagram (opcional)</Label>
                                <Input value={draftOf(m.n).instagram} onChange={(e) => patchDraft(m.n, { instagram: e.target.value })} placeholder="@usuario" autoComplete="off" />
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}

                <div className="flex justify-end gap-2">
                  <Button variant="outline" className="interactive" onClick={onClose}>Cerrar</Button>
                  <WriteButton
                    className="interactive"
                    disabled={!selected || request.isPending || anyRutInvalid || !Number.isFinite(amountNumber)}
                    onClick={submit}
                  >
                    {request.isPending ? 'Creando…' : amountNumber >= preview.minPayment ? 'Crear link de pago' : 'Crear solicitud'}
                  </WriteButton>
                </div>
              </div>
            )}

            {pending && (
              <div className="space-y-3">
                <div className="rounded-xl bg-primary/10 border border-primary/30 p-3 text-sm space-y-1">
                  <p className="font-medium">
                    {pending.fromName && pending.toName ? `${pending.fromName} → ${pending.toName} · ` : ''}Pendiente de pago: {clp(pending.amount)}
                  </p>
                  {pending.people.map((p) => (
                    <p key={p.n} className="text-xs text-muted-foreground">
                      Persona {p.n + 1}: {[p.name, p.rut, p.instagram ? `@${p.instagram}` : ''].filter(Boolean).join(' · ')}
                    </p>
                  ))}
                  {pending.stillMissing.length > 0 && (
                    <p className="text-xs text-[var(--admin-warning-text)]">
                      Faltan datos de {pending.stillMissing.length} persona{pending.stillMissing.length === 1 ? '' : 's'}: pídelos al cliente y complétalos después con "Editar nombres".
                    </p>
                  )}
                </div>

                {pending.paymentUrl ? (
                  <div className="space-y-2">
                    <Label className="text-xs">Link de pago (Mercado Pago)</Label>
                    <div className="flex gap-2">
                      <Input readOnly value={pending.paymentUrl} onFocus={(e) => e.currentTarget.select()} />
                      <Button type="button" variant="outline" className="interactive shrink-0" onClick={copyLink}>
                        <Copy className="w-4 h-4 mr-1" /> Copiar
                      </Button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {phoneDigits && (
                        <Button asChild variant="outline" size="sm" className="interactive">
                          <a href={`https://wa.me/${phoneDigits}?text=${encodeURIComponent(whatsappText)}`} target="_blank" rel="noopener noreferrer">
                            <MessageCircle className="w-4 h-4 mr-1" /> Enviar por WhatsApp
                          </a>
                        </Button>
                      )}
                      <WriteButton
                        variant="outline"
                        size="sm"
                        className="interactive"
                        disabled={sendEmail.isPending}
                        onClick={() => sendEmail.mutate({ upgradeId: pending.id })}
                      >
                        <Mail className="w-4 h-4 mr-1" /> {sendEmail.isPending ? 'Enviando…' : 'Enviar por correo'}
                      </WriteButton>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Esta solicitud no tiene link de pago (el monto es menor al mínimo). Cuando te paguen, márcala como pagada.
                  </p>
                )}

                <div className="flex flex-wrap justify-end gap-2 pt-1">
                  <WriteButton variant="outline" className="interactive" disabled={cancel.isPending} onClick={() => cancel.mutate({ upgradeId: pending.id })}>
                    {cancel.isPending ? 'Cancelando…' : 'Cancelar solicitud'}
                  </WriteButton>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <WriteButton className="interactive" disabled={markPaid.isPending}>Marcar como pagado</WriteButton>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>¿Marcar como pagado y subir de acceso?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Úsalo solo si ya recibiste los {clp(pending.amount)} por transferencia o efectivo. El acceso de {order?.buyerName} pasa a {pending.toName ?? 'el acceso nuevo'} ahora mismo (mismo QR), la diferencia se suma a la orden y se le reenvía la confirmación.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Volver</AlertDialogCancel>
                        <AlertDialogAction onClick={() => markPaid.mutate({ upgradeId: pending.id })}>Sí, ya pagó</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Ventana "Agregar extra" de Ventas Web: un comprador quiere sumar un extra
 * (estacionamiento, piscolas...) a una compra ya hecha. El admin elige el extra y
 * la cantidad -- el precio sale de la base de datos, no se escribe a mano --,
 * genera el link de Mercado Pago y se lo manda. Cuando se paga -- o el admin marca
 * "pagado" por transferencia o efectivo -- el extra queda en la misma orden con su
 * QR y su código para canjearlo. */
export function AddonDialog({ order, onClose, onChanged }: { order: any | null; onClose: () => void; onChanged: () => void }) {
  const orderId: number | undefined = order?.id;
  const { data: preview, isLoading, refetch } = trpc.orders.previewAddons.useQuery(
    { orderId: orderId ?? 0 },
    { enabled: orderId !== undefined },
  );
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [quantity, setQuantity] = useState(1);
  useEffect(() => { setSelectedId(null); setQuantity(1); }, [orderId]);

  const changed = () => { refetch(); onChanged(); };
  const request = trpc.orders.requestAddon.useMutation({
    onSuccess: (r) => {
      toast.success(r.paymentUrl ? 'Link de pago creado' : 'Solicitud creada');
      setSelectedId(null);
      setQuantity(1);
      changed();
    },
    onError: onMutationError,
  });
  const sendEmail = trpc.orders.sendAddonEmail.useMutation({
    onSuccess: (r) => (r.success ? toast.success('Correo enviado') : toast.error('No se pudo enviar el correo')),
    onError: onMutationError,
  });
  const markPaid = trpc.orders.markAddonPaid.useMutation({
    onSuccess: (r) => {
      toast.success(r.applied ? 'Listo: el extra quedó en la compra' : 'Esta solicitud ya estaba pagada');
      changed();
    },
    onError: onMutationError,
  });
  const cancel = trpc.orders.cancelAddon.useMutation({
    onSuccess: () => { toast.success('Solicitud cancelada'); changed(); },
    onError: onMutationError,
  });

  const selected = preview?.options.find((o) => o.ticketTypeId === selectedId) ?? null;
  const total = selected ? selected.price * quantity : 0;
  const firstName = (order?.buyerName ?? '').trim().split(/\s+/)[0] || '';
  const phoneDigits = String(order?.buyerPhone ?? '').replace(/[^0-9]/g, '');

  const copyLink = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Link copiado');
    } catch {
      toast.error('No se pudo copiar; selecciónalo y cópialo a mano');
    }
  };
  const whatsappFor = (a: { name: string; quantity: number; amount: number; paymentUrl: string }) =>
    `Hola${firstName ? ` ${firstName}` : ''}! Para agregar ${a.name}${a.quantity > 1 ? ` x${a.quantity}` : ''} a tu compra solo falta pagar ${clp(a.amount)}. Puedes pagar aquí: ${a.paymentUrl} . Cuando se acredite el pago te enviamos la confirmación con tu código para canjearlo. ¡Gracias!`;

  return (
    <Dialog open={order !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Agregar extra · {order?.orderNumber}</DialogTitle>
        </DialogHeader>

        {isLoading || !preview ? (
          <p className="text-sm text-muted-foreground">Cargando…</p>
        ) : (
          <div className="space-y-4">
            {preview.tableMissing && (
              <div role="alert" className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                Esta función todavía no está lista en la base de datos (falta aplicar una migración). Avísale a quien administra el sistema.
              </div>
            )}
            {preview.blockedReason && (
              <div className="rounded-xl bg-yellow-500/10 border border-yellow-500/30 p-3 text-sm text-yellow-700">
                {preview.blockedReason}
              </div>
            )}

            {preview.pending.length > 0 && (
              <div className="space-y-3">
                <p className="text-sm font-medium">Pendientes de pago</p>
                {preview.pending.map((a) => (
                  <div key={a.id} className="rounded-xl bg-primary/10 border border-primary/30 p-3 space-y-2">
                    <p className="text-sm font-medium">
                      {a.name}{a.quantity > 1 ? ` x${a.quantity}` : ''} · {clp(a.amount)}
                    </p>
                    {a.paymentUrl ? (
                      <div className="space-y-2">
                        <div className="flex gap-2">
                          <Input readOnly value={a.paymentUrl} onFocus={(e) => e.currentTarget.select()} />
                          <Button type="button" variant="outline" className="interactive shrink-0" onClick={() => copyLink(a.paymentUrl!)}>
                            <Copy className="w-4 h-4 mr-1" /> Copiar
                          </Button>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {phoneDigits && (
                            <Button asChild variant="outline" size="sm" className="interactive">
                              <a href={`https://wa.me/${phoneDigits}?text=${encodeURIComponent(whatsappFor({ name: a.name, quantity: a.quantity, amount: a.amount, paymentUrl: a.paymentUrl }))}`} target="_blank" rel="noopener noreferrer">
                                <MessageCircle className="w-4 h-4 mr-1" /> Enviar por WhatsApp
                              </a>
                            </Button>
                          )}
                          <WriteButton variant="outline" size="sm" className="interactive" disabled={sendEmail.isPending} onClick={() => sendEmail.mutate({ addonId: a.id })}>
                            <Mail className="w-4 h-4 mr-1" /> {sendEmail.isPending ? 'Enviando…' : 'Enviar por correo'}
                          </WriteButton>
                        </div>
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">Sin link de pago (monto menor al mínimo). Cuando te paguen, márcala como pagada.</p>
                    )}
                    <div className="flex flex-wrap justify-end gap-2">
                      <WriteButton variant="outline" size="sm" className="interactive" disabled={cancel.isPending} onClick={() => cancel.mutate({ addonId: a.id })}>
                        Cancelar solicitud
                      </WriteButton>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <WriteButton size="sm" className="interactive" disabled={markPaid.isPending}>Marcar como pagado</WriteButton>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>¿Marcar como pagado y agregar el extra?</AlertDialogTitle>
                            <AlertDialogDescription>
                              Úsalo solo si ya recibiste los {clp(a.amount)} por transferencia o efectivo. {a.name}{a.quantity > 1 ? ` x${a.quantity}` : ''} se agrega ahora mismo a la compra de {order?.buyerName} con su código para canjearlo, el total de la orden sube y se le reenvía la confirmación.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Volver</AlertDialogCancel>
                            <AlertDialogAction onClick={() => markPaid.mutate({ addonId: a.id })}>Sí, ya pagó</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {!preview.tableMissing && preview.options.length > 0 && (
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label className="text-sm">Agregar</Label>
                  {preview.options.map((o) => (
                    <button
                      key={o.ticketTypeId}
                      type="button"
                      disabled={!!o.disabledReason}
                      onClick={() => { setSelectedId(o.ticketTypeId); setQuantity(1); }}
                      className={`w-full rounded-xl border p-3 text-left text-sm transition-colors ${o.disabledReason ? 'opacity-50' : selectedId === o.ticketTypeId ? 'border-primary bg-primary/10' : 'border-border hover:bg-muted/50'}`}
                    >
                      <span className="font-medium">{o.name}</span>
                      <span className="text-muted-foreground"> · {clp(o.price)}</span>
                      <span className="block text-xs text-muted-foreground">
                        {o.disabledReason ?? `Quedan ${o.remaining}`}
                      </span>
                    </button>
                  ))}
                </div>

                {selected && (
                  <div className="space-y-2">
                    {selected.maxQuantity > 1 && (
                      <div>
                        <Label className="text-sm">Cantidad</Label>
                        <Input
                          type="number"
                          min={1}
                          max={selected.maxQuantity}
                          value={quantity}
                          onChange={(e) => setQuantity(Math.min(selected.maxQuantity, Math.max(1, Math.floor(Number(e.target.value)) || 1)))}
                          className="max-w-[8rem]"
                        />
                      </div>
                    )}
                    <p className="text-sm">
                      Total a cobrar: <span className="font-semibold">{clp(total)}</span>
                      <span className="text-xs text-muted-foreground"> (precio del extra × cantidad)</span>
                    </p>
                    {total < preview.minPayment && (
                      <p className="text-xs text-[var(--admin-warning-text)]">
                        Con menos de {clp(preview.minPayment)} no se puede crear un link de pago: solo quedará la solicitud para marcarla como pagada.
                      </p>
                    )}
                  </div>
                )}

                <div className="flex justify-end gap-2">
                  <Button variant="outline" className="interactive" onClick={onClose}>Cerrar</Button>
                  <WriteButton
                    className="interactive"
                    disabled={!selected || request.isPending}
                    onClick={() => order && selected && request.mutate({ orderId: order.id, ticketTypeId: selected.ticketTypeId, quantity })}
                  >
                    {request.isPending ? 'Creando…' : total >= preview.minPayment ? 'Crear link de pago' : 'Crear solicitud'}
                  </WriteButton>
                </div>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function OrdersView({ channel }: { channel: 'web' | 'caja' }) {
  // Antes la tabla completa (con Estado/Fecha/Contacto/Acciones) se elegía
  // por ancho de pantalla (`md:`), así que un iPad -- angosto en vertical y
  // sin espacio para 9 columnas incluso apaisado -- quedaba con columnas
  // fuera de la pantalla e IMPOSIBLES de alcanzar: el swipe-to-delete de
  // SwipeToDeleteRow bloquea el scroll horizontal nativo de la tabla
  // (`touch-pan-y`) a propósito, para que arrastrar el dedo no se confunda
  // con "hacer scroll". `useCoarsePointer` (mismo criterio que en
  // ExpensesList más abajo) elige por tipo de puntero, no por ancho: mouse
  // real ve la tabla siempre, y cualquier pantalla táctil -- iPhone Y
  // iPad, en cualquier orientación -- ve las tarjetas, que sí muestran todo
  // sin necesitar scroll horizontal.
  const coarse = useCoarsePointer();
  // Abre en "Aprobadas" (las ventas reales): los carritos abandonados quedan a
  // un toque en "Sin pagar", con su contador, en vez de mezclarse en la lista.
  const [statusFilter, setStatusFilter] = useState<string>('approved');
  const [page, setPage] = useState(1);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  // `searchInput` es lo que se teclea; `search` es lo que se manda al servidor,
  // 300 ms después de la última tecla (la búsqueda revisa nombres, email,
  // N° de orden y acompañantes en TODA la base, no solo en lo ya cargado).
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(t);
  }, [searchInput]);
  const [expandedOrderId, setExpandedOrderId] = useState<number | null>(null);
  const [editingOrderId, setEditingOrderId] = useState<number | null>(null);
  const [upgradeOrderId, setUpgradeOrderId] = useState<number | null>(null);
  const [addonOrderId, setAddonOrderId] = useState<number | null>(null);
  const [creditOrderId, setCreditOrderId] = useState<number | null>(null);
  const [refundOrderId, setRefundOrderId] = useState<number | null>(null);
  // Antes esta vista no tenía filtro de evento: la lista y los totales
  // mezclaban TODAS las fiestas de la historia y se leían como si fueran de
  // una sola. Con dos eventos publicados a la vez eso deja de ser un detalle.
  // Arranca en el próximo evento (o en la última elección de esta pantalla) para
  // no mezclar fiestas; "Todos los eventos" sigue disponible.
  const eventStorageKey = `admin-orders-event-${channel}`;
  const [eventFilter, setEventFilterState] = useState<string>(() => {
    try { return window.localStorage.getItem(eventStorageKey) ?? 'auto'; } catch { return 'auto'; }
  });
  const setEventFilter = (v: string) => {
    setEventFilterState(v);
    try { window.localStorage.setItem(eventStorageKey, v); } catch { /* sin almacenamiento, no pasa nada */ }
  };
  const { data: eventsList } = trpc.events.listAll.useQuery();
  useEffect(() => {
    if (eventFilter !== 'auto' || !eventsList) return;
    const next = nextEventId(eventsList as any[]);
    setEventFilterState(next ? String(next) : 'all');
  }, [eventFilter, eventsList]);
  const eventReady = eventFilter !== 'auto';
  const eventId = eventFilter === 'all' || eventFilter === 'auto' ? undefined : Number(eventFilter);
  // Con una búsqueda se mira TODO (cualquier evento y estado): una venta nunca
  // se pierde por un filtro olvidado.
  const searching = search.length >= 2;
  const listEventId = searching ? undefined : eventId;
  const listStatus = searching || statusFilter === 'all' ? undefined : statusFilter;
  const pageSize = !searching && statusFilter === 'pending' ? ORDERS_REMINDERS_PAGE_SIZE : ORDERS_PAGE_SIZE;
  // Sello 🎧 de la campaña aliada (/electronica): contador + filtro "solo comunidad".
  const { data: partnerCampaign } = trpc.partner.adminGet.useQuery(undefined, { enabled: channel === 'web', retry: false });
  const [partnerOnly, setPartnerOnly] = useState(false);
  const partnerFilterId = channel === 'web' && partnerOnly && partnerCampaign ? partnerCampaign.id : undefined;

  const { data: ordersData, isLoading: ordersLoading, refetch: refetchOrders } = trpc.orders.listAll.useQuery(
    { status: listStatus, channel, eventId: listEventId, search: search || undefined, page, limit: pageSize, partnerCampaignId: partnerFilterId },
    // Mantiene la lista anterior en pantalla mientras llega la nueva, para que
    // la tabla no parpadee con cada búsqueda.
    { placeholderData: (prev) => prev, enabled: eventReady },
  );
  const { data: statusCounts } = trpc.orders.statusCounts.useQuery({ channel, eventId }, { enabled: eventReady });
  // Coincidencias de la búsqueda en TODOS los eventos/canales/estados: si los
  // filtros de arriba esconden alguna, se avisa en vez de dejar creer que no existe.
  const { data: matchingOrders } = trpc.orders.findMatching.useQuery({ search }, { enabled: search.length >= 2 });
  const hiddenMatches = search.length >= 2
    ? ordersOutsideFilter(matchingOrders ?? [], { channel, eventId: listEventId, status: listStatus })
    : [];
  const { data: stats, refetch: refetchStats } = trpc.orders.getStats.useQuery({ channel, eventId }, { enabled: eventReady });
  const { data: orderTickets, isFetching: loadingTickets } = trpc.orders.getTickets.useQuery(
    { orderId: expandedOrderId ?? 0 },
    { enabled: expandedOrderId !== null }
  );
  const resendConfirmation = trpc.orders.resendConfirmation.useMutation({
    onSuccess: () => toast.success('Email reenviado'),
    onError: onMutationError,
  });
  const approveMissionTopup = trpc.orders.approveMissionTopup.useMutation({
    onSuccess: () => { toast.success('Aprobada sin pago — ya se generó el ticket y se mandó el correo'); refetchOrders(); },
    onError: onMutationError,
  });
  const deleteOrder = trpc.orders.delete.useMutation({
    onSuccess: (_data, variables) => {
      toast.success('Compra eliminada');
      if (expandedOrderId === variables.id) setExpandedOrderId(null);
      refetchOrders();
      refetchStats();
    },
    onError: onMutationError,
  });

  const ordersList = ordersData?.orders ?? [];
  const visibleOrders = ordersList;
  const totalMatching = ordersData?.total ?? ordersList.length;
  const editingOrder = ordersList.find((o: any) => o.id === editingOrderId) ?? null;
  const upgradeOrder = ordersList.find((o: any) => o.id === upgradeOrderId) ?? null;
  const addonOrder = ordersList.find((o: any) => o.id === addonOrderId) ?? null;
  const creditOrder = ordersList.find((o: any) => o.id === creditOrderId) ?? null;
  const refundOrder = ordersList.find((o: any) => o.id === refundOrderId) ?? null;
  const refundEventDate = refundOrder ? ((eventsList as any[] | undefined)?.find((e: any) => e.id === refundOrder.eventId)?.eventDate ?? null) : null;
  // Sin pagar de este evento (del contador, no solo de la página que se ve).
  const pendingCount = statusCounts?.pending ?? 0;
  // Si la página actual quedó vacía (ej. se borró una orden), volver a la última.
  useEffect(() => {
    const last = pageCount(totalMatching, pageSize);
    if (ordersData && page > last) setPage(last);
  }, [ordersData, totalMatching, pageSize, page]);

  // Recordatorios: solo con el filtro "Sin pagar" puesto. La selección es
  // manual a propósito -- no hay "mandar a todos", para no escribirle a quien
  // abandonó hace cinco minutos o ya está hablando por WhatsApp.
  const remindersMode = statusFilter === 'pending' && !searching;
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [reminderOpen, setReminderOpen] = useState(false);

  const toggleSelected = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const allSelected = visibleOrders.length > 0 && visibleOrders.every((o: any) => selectedIds.has(o.id));
  const selectedOrders = ordersList.filter((o: any) => selectedIds.has(o.id));

  // Al cambiar de filtro la selección deja de tener sentido (y podría arrastrar
  // ids de órdenes que ya no están en pantalla).
  useEffect(() => { setSelectedIds(new Set()); }, [statusFilter, channel, search, eventFilter, page, partnerOnly]);
  // Cambiar evento, estado o búsqueda vuelve a la primera página.
  useEffect(() => { setPage(1); }, [statusFilter, channel, search, eventFilter, partnerOnly]);

  const filterParams = () => {
    const params = new URLSearchParams();
    if (statusFilter !== 'all') params.set('status', statusFilter);
    if (dateFrom) params.set('dateFrom', dateFrom);
    if (dateTo) params.set('dateTo', dateTo);
    params.set('channel', channel);
    // El backend ya soportaba filtrar el export por evento; simplemente nadie
    // se lo mandaba, así que el CSV y el PDF traían todas las fiestas aunque
    // en pantalla estuvieras viendo una sola.
    if (eventId) params.set('eventId', String(eventId));
    return params;
  };
  const exportUrl = () => `/api/admin/orders/export.csv?${filterParams().toString()}`;
  const printUrl = () => `/admin/print/orders?${filterParams().toString()}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-heading text-2xl">{channel === 'caja' ? 'Ventas en Caja' : 'Ventas Web'}</h2>
        <div className="flex flex-wrap items-center gap-2">
          {/* El placeholder largo se cortaba ("…email o N"): versión corta
              visible, la descripción completa va en el aria-label. */}
          <Input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Buscar nombre, RUT, email u orden…"
            aria-label="Buscar por nombre o RUT (comprador o acompañante), email o N° de orden"
            className="min-w-56 flex-1"
          />
          <Select value={eventFilter === 'auto' ? 'all' : eventFilter} onValueChange={setEventFilter}>
            <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los eventos</SelectItem>
              {(eventsList ?? []).map((e: any) => <SelectItem key={e.id} value={String(e.id)}>{e.title}</SelectItem>)}
            </SelectContent>
          </Select>
          {/* En Safari/iPad un <input type="date"> vacío se pinta como una
              caja en blanco sin pista de qué es: se le pone etiqueta visible. */}
          <label className="flex items-center gap-1.5 text-xs text-[var(--admin-muted)]">
            Desde
            <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-36 text-[var(--admin-text)]" />
          </label>
          <label className="flex items-center gap-1.5 text-xs text-[var(--admin-muted)]">
            Hasta
            <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-36 text-[var(--admin-text)]" />
          </label>
          <DownloadLink href={exportUrl()}>
            <Button variant="outline" className="interactive">Descargar CSV</Button>
          </DownloadLink>
          <a href={printUrl()} target="_blank" rel="noopener noreferrer">
            {/* Abre una página lista para imprimir, no descarga un archivo:
                decía "Descargar PDF" y no descargaba nada. */}
            <Button variant="outline" className="interactive">Ver para imprimir</Button>
          </a>
        </div>
      </div>

      {channel === 'web' && <PendingCreditsCard />}

      {channel === 'web' && partnerCampaign && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-cyan-500/30 bg-cyan-500/5 p-3">
          <span className="text-sm">
            <span className="font-semibold">{partnerCampaign.emoji} {partnerCampaign.label}:</span>{' '}
            {partnerCampaign.stats.personas.toLocaleString('es-CL')} personas
            {partnerCampaign.maxPersons != null && ` de ${partnerCampaign.maxPersons.toLocaleString('es-CL')}`}
            {' '}· {partnerCampaign.stats.orders.toLocaleString('es-CL')} compras · {clp(partnerCampaign.stats.revenue)}
            {!partnerCampaign.isActive && <span className="text-[var(--admin-muted)]"> · link cerrado</span>}
          </span>
          <Button
            size="sm"
            variant={partnerOnly ? 'default' : 'outline'}
            className="rounded-full ml-auto"
            aria-pressed={partnerOnly}
            onClick={() => setPartnerOnly((v) => !v)}
          >
            {partnerOnly ? 'Ver todas las ventas' : `Solo ${partnerCampaign.label}`}
          </Button>
        </div>
      )}

      {searching ? (
        <p className="text-sm text-[var(--admin-muted)]">Buscando en todos los eventos y estados.</p>
      ) : (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2" role="tablist" aria-label="Estado de las órdenes">
            {([
              ['approved', 'Aprobadas', statusCounts?.approved],
              ['pending', 'Sin pagar', statusCounts?.pending],
              ['rejected', 'Rechazadas', statusCounts?.rejected],
              ['refunded', 'Reembolsadas', statusCounts?.refunded],
              ['all', 'Todas', statusCounts?.total],
            ] as const).map(([value, label, count]) => (
              <Button
                key={value}
                role="tab"
                aria-selected={statusFilter === value}
                size="sm"
                variant={statusFilter === value ? 'default' : 'outline'}
                className="rounded-full"
                onClick={() => setStatusFilter(value)}
              >
                {label}{count !== undefined ? ` · ${count.toLocaleString('es-CL')}` : ''}
              </Button>
            ))}
          </div>
          {statusCounts && (
            <p className="text-xs text-[var(--admin-muted)]">
              {eventId ? 'Este evento' : 'Todos los eventos'}: {statusCounts.approved.toLocaleString('es-CL')} aprobadas · {statusCounts.pending.toLocaleString('es-CL')} sin pagar · {statusCounts.rejected.toLocaleString('es-CL')} rechazadas · {statusCounts.refunded.toLocaleString('es-CL')} reembolsadas · {statusCounts.total.toLocaleString('es-CL')} en total
            </p>
          )}
        </div>
      )}

      {pendingCount > 0 && !remindersMode && !searching && (
        <p className="text-sm text-yellow-500">
          ⚠️ {pendingCount} orden{pendingCount > 1 ? 'es' : ''} sin pagar — usa el filtro "Sin pagar" para seleccionarlas y mandarles un recordatorio ya mismo.
          {' '}
          <span className="text-muted-foreground">
            (Además, un cron diario ya les manda un recordatorio solo cada 3 días, hasta 3 veces por orden — esto es para mandar uno extra ya, ej. antes de que suba el precio.)
          </span>
        </p>
      )}

      {remindersMode && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-muted/20 p-3">
          <span className="text-sm text-muted-foreground">
            {selectedIds.size === 0
              ? 'Marca las órdenes a las que quieras mandarles un recordatorio.'
              : `${selectedIds.size} seleccionada${selectedIds.size === 1 ? '' : 's'}`}
          </span>
          <Button
            size="sm"
            className="interactive ml-auto"
            disabled={selectedIds.size === 0}
            onClick={() => setReminderOpen(true)}
          >
            <Mail className="w-4 h-4 mr-1" /> Enviar recordatorio ({selectedIds.size})
          </Button>
        </div>
      )}

      <AddonDialog
        order={addonOrder}
        onClose={() => setAddonOrderId(null)}
        onChanged={() => { refetchOrders(); refetchStats(); }}
      />

      <CreditDialog order={creditOrder} onClose={() => setCreditOrderId(null)} onDone={() => { refetchOrders(); refetchStats(); }} />

      <RefundDialog order={refundOrder} eventDate={refundEventDate} onClose={() => setRefundOrderId(null)} onDone={() => { refetchOrders(); refetchStats(); }} />

      <UpgradeDialog
        order={upgradeOrder}
        onClose={() => setUpgradeOrderId(null)}
        onChanged={() => { refetchOrders(); refetchStats(); }}
      />

      <EditAttendeesDialog
        order={editingOrder}
        onClose={() => setEditingOrderId(null)}
        onSaved={() => refetchOrders()}
      />

      <ReminderDialog
        orders={selectedOrders}
        open={reminderOpen}
        onOpenChange={setReminderOpen}
        onSent={() => { setSelectedIds(new Set()); refetchOrders(); }}
      />

      <BentoGrid>
        <BentoTile span={2}>
          <StatTile size="lg" icon={DollarSign} tone="revenue" value={`$${Number(stats?.totalRevenue ?? 0).toLocaleString('es-CL')}`} label="Ingresos Totales" />
        </BentoTile>
        <BentoTile>
          <StatTile icon={Ticket} tone="count" value={stats?.totalOrders ?? 0} label="Órdenes Totales" />
        </BentoTile>
        <BentoTile>
          <StatTile icon={Users} tone="success" value={stats?.approvedOrders ?? 0} label="Pagos Aprobados" />
        </BentoTile>
      </BentoGrid>

      {!ordersLoading && ordersList.length > 0 && (
        <OrdersPager page={page} pageSize={pageSize} total={totalMatching} onPage={setPage} extra={search ? `que coinciden con "${search}"` : undefined} />
      )}

      {hiddenMatches.length > 0 && (
        <div role="status" className="rounded-xl border border-amber-400/50 bg-amber-500/10 p-3 text-sm space-y-2">
          <p className="font-medium">
            {hiddenMatches.length === 1 ? 'Hay 1 compra' : `Hay ${hiddenMatches.length} compras`} con esa búsqueda que los filtros de arriba no muestran:
          </p>
          {hiddenMatches.slice(0, 6).map((m) => {
            const sameView = channel === 'caja' ? m.channel === 'caja' : m.channel !== 'caja';
            return (
              <div key={m.id} className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  <span className="font-mono">{m.orderNumber}</span> · {m.buyerName} · {m.eventTitle ?? `Evento #${m.eventId}`} · ${m.total.toLocaleString('es-CL')} · {m.paymentStatus === 'approved' ? 'aprobada' : m.paymentStatus === 'pending' ? 'sin pagar' : m.paymentStatus}
                  {!sameView && <> · <strong>está en {m.channel === 'caja' ? 'Ventas en Caja' : 'Ventas Web'}</strong></>}
                </span>
                {sameView && (
                  <Button size="sm" variant="outline" onClick={() => { setEventFilter(String(m.eventId)); setStatusFilter('all'); }}>Ver</Button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {ordersLoading || !eventReady ? (
        <div className="admin-clay p-6">
          <TableSkeleton rows={6} />
        </div>
      ) : visibleOrders.length === 0 ? (
        <EmptyState
          icon={Ticket}
          title={search ? 'Sin resultados para esa búsqueda' : 'Todavía no hay ventas acá'}
          description={search ? 'Prueba con otro nombre, acompañante, email o N° de orden.' : 'Cuando entren ventas para este filtro, van a aparecer en esta lista.'}
        />
      ) : (
        <>
          {/* Tabla completa -- solo mouse/trackpad real (ver `coarse` arriba).
              SwipeToDeleteRow ya no tiene nada que activar acá (siempre cae
              en su rama sin gesto), pero se deja igual por si algún puntero
              raro se cuela como fino. */}
          {!coarse && (
          <Card className="admin-clay border-0">
            <CardContent className="pt-6">
              <div className="overflow-x-auto">
                <table className="w-full text-[16px]">
                  <thead>
                    <tr className="border-b border-[var(--admin-glass-border)]">
                      {remindersMode && (
                        <th className="text-left py-2.5 px-3 w-10">
                          <Checkbox
                            checked={allSelected}
                            onCheckedChange={(v) => setSelectedIds(v ? new Set(ordersList.map((o: any) => o.id)) : new Set())}
                            aria-label="Seleccionar todas"
                          />
                        </th>
                      )}
                      <th className="text-left py-2.5 px-3">Orden</th>
                      <th className="text-left py-2.5 px-3">Comprador</th>
                      <th className="text-left py-2.5 px-3">Total</th>
                      <th className="text-left py-2.5 px-3">Extras</th>
                      <th className="text-left py-2.5 px-3">Estado</th>
                      <th className="text-left py-2.5 px-3">Fecha y hora</th>
                      {remindersMode && <th className="text-left py-2.5 px-3">Recordatorio</th>}
                      <th className="text-left py-2.5 px-3">Contacto</th>
                      <th className="text-left py-2.5 px-3">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleOrders.map((order: any) => (
                      <Fragment key={order.id}>
                        <SwipeToDeleteRow
                          className="border-b border-[var(--admin-glass-border)] hover:bg-white/40 transition-colors"
                          deleteDescription={`Vas a eliminar la compra "${order.orderNumber}" de ${order.buyerName}.`}
                          onDelete={(adminPassword) => deleteOrder.mutateAsync({ id: order.id, adminPassword })}
                          deleteDisabled={deleteOrder.isPending}
                        >
                          {remindersMode && (
                            <td className="py-2.5 px-3">
                              <Checkbox
                                checked={selectedIds.has(order.id)}
                                onCheckedChange={() => toggleSelected(order.id)}
                                aria-label={`Seleccionar ${order.orderNumber}`}
                              />
                            </td>
                          )}
                          <td className="py-2.5 px-3 font-mono text-sm">{order.orderNumber}</td>
                          <td className="py-2.5 px-3">
                            {order.buyerName}<br/><span className="text-[var(--admin-muted)] text-sm">{order.buyerEmail}</span>
                            <MatchedAttendeeTag match={order.matchedAttendee} />
                            {order.partnerBadge && (
                              <span className="mt-1 block w-fit rounded-full bg-cyan-500/15 px-2 py-0.5 text-xs font-semibold text-cyan-700">
                                {order.partnerBadge.emoji} {order.partnerBadge.label}{order.partnerBadge.refLabel ? ` · ${order.partnerBadge.refLabel.split(' · ')[0]}` : ''}
                              </span>
                            )}
                            {order.pendingAddons && (
                              <button
                                type="button"
                                onClick={() => setAddonOrderId(order.id)}
                                className="mt-1 block rounded-full bg-yellow-500/15 px-2 py-0.5 text-xs font-semibold text-yellow-700 hover:bg-yellow-500/25"
                              >
                                Extra pendiente: {order.pendingAddons.names.join(', ') || 'extra'} · {clp(order.pendingAddons.amount)}
                              </button>
                            )}
                            {order.pendingUpgrade && (
                              <button
                                type="button"
                                onClick={() => setUpgradeOrderId(order.id)}
                                className="mt-1 block rounded-full bg-yellow-500/15 px-2 py-0.5 text-xs font-semibold text-yellow-700 hover:bg-yellow-500/25"
                              >
                                {order.pendingUpgrade.toName ? `Subir a ${order.pendingUpgrade.toName}` : 'Cambio de acceso'} pendiente · {clp(order.pendingUpgrade.amount)}
                              </button>
                            )}
                            {(order.credits ?? []).map((c: any) => (
                              <span key={c.id} className="mt-1 block w-fit rounded-full bg-purple-500/15 px-2 py-0.5 text-xs font-semibold text-purple-700">
                                Crédito {c.code} · {c.availability === 'available' ? 'disponible' : c.availability === 'used' ? 'usado' : c.availability === 'expired' ? 'vencido' : 'cancelado'}
                              </span>
                            ))}
                          </td>
                          <td className="py-2.5 px-3 tabular-nums">${Number(order.total).toLocaleString('es-CL')}</td>
                          <td className="py-2.5 px-3">
                            {order.extras && order.extras.length > 0 ? (
                              <div className="flex flex-wrap gap-1">
                                {order.extras.map((ex: { name: string; quantity: number }, i: number) => (
                                  <span key={i} className="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-sm whitespace-nowrap">
                                    {ex.name}{ex.quantity > 1 ? ` ×${ex.quantity}` : ''}
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <span className="text-[var(--admin-muted)] text-sm">—</span>
                            )}
                          </td>
                          <td className="py-2.5 px-3">
                            <StatusBadge status={order.paymentStatus} />
                            {order.refundAmount != null && (
                              <p className="text-xs text-[var(--admin-muted)] mt-1">
                                Devuelto {Number(order.refundPercent)}% · {clp(Number(order.refundAmount))}
                              </p>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-[var(--admin-muted)]">
                            {formatChileShortDate(order.createdAt)}
                            <br /><span className="text-xs">{formatChileTime(order.createdAt)}</span>
                          </td>
                          {remindersMode && (
                            <td className="py-2.5 px-3 text-sm">
                              {order.reminderCount > 0 ? (
                                <span className="text-[var(--admin-warning-text)]">
                                  {order.reminderCount}× · {order.reminderSentAt ? formatChileShortDate(order.reminderSentAt) : ''}
                                </span>
                              ) : (
                                <span className="text-[var(--admin-muted)]">—</span>
                              )}
                            </td>
                          )}
                          <td className="py-2.5 px-3">
                            <RowActions>
                              <RowActionLink icon={Mail} label="Enviar email" tone="mail" href={`mailto:${order.buyerEmail}`} />
                              {order.buyerPhone && (
                                <RowActionLink
                                  icon={MessageCircle}
                                  label="Escribir por WhatsApp"
                                  tone="wa"
                                  href={`https://wa.me/${String(order.buyerPhone).replace(/[^0-9]/g, '')}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                />
                              )}
                            </RowActions>
                          </td>
                          <td className="py-2.5 px-3">
                            <RowActions>
                              <RowActionButton
                                icon={Edit}
                                label="Editar nombres"
                                tone="success"
                                onClick={() => setEditingOrderId(order.id)}
                              />
                              {order.paymentStatus === 'approved' && (
                                <>
                                  {order.accesoSlug && order.accesoSlug !== 'cumpleaneros' && (
                                    <RowActionButton
                                      icon={ArrowUpCircle}
                                      label="Subir de acceso"
                                      tone="send"
                                      onClick={() => setUpgradeOrderId(order.id)}
                                    />
                                  )}
                                  {channel === 'web' && order.accesoSlug && order.accesoSlug !== 'cumpleaneros' && (order.credits?.length ?? 0) === 0 && (
                                    <RowActionButton
                                      icon={CalendarClock}
                                      label="Dejar para otra fecha"
                                      tone="send"
                                      onClick={() => setCreditOrderId(order.id)}
                                    />
                                  )}
                                  {channel === 'web' && (order.credits?.length ?? 0) === 0 && (
                                    <RowActionButton
                                      icon={RotateCcw}
                                      label="Devolver (50%)"
                                      tone="send"
                                      onClick={() => setRefundOrderId(order.id)}
                                    />
                                  )}
                                  {channel === 'web' && (
                                    <RowActionButton
                                      icon={ShoppingBag}
                                      label="Agregar extra (estacionamiento, etc.)"
                                      tone="send"
                                      onClick={() => setAddonOrderId(order.id)}
                                    />
                                  )}
                                  <RowActionButton
                                    icon={Ticket}
                                    label={expandedOrderId === order.id ? 'Ocultar tickets' : 'Ver tickets'}
                                    tone="ticket"
                                    onClick={() => setExpandedOrderId(expandedOrderId === order.id ? null : order.id)}
                                  />
                                  <RowActionButton
                                    icon={Send}
                                    label="Reenviar email"
                                    tone="send"
                                    disabled={resendConfirmation.isPending}
                                    onClick={() => resendConfirmation.mutate({ orderNumber: order.orderNumber })}
                                  />
                                  {order.missionTopupStatus === 'pending' && (
                                    <AlertDialog>
                                      <AlertDialogTrigger asChild>
                                        <button className="text-[var(--admin-success-text)] text-xs underline disabled:opacity-50" disabled={approveMissionTopup.isPending}>
                                          Aprobar sin pagar
                                        </button>
                                      </AlertDialogTrigger>
                                      <AlertDialogContent>
                                        <AlertDialogHeader>
                                          <AlertDialogTitle>¿Aprobar la diferencia de Misión 300 sin pago?</AlertDialogTitle>
                                          <AlertDialogDescription>
                                            La orden "{order.orderNumber}" de {order.buyerName} queda como si hubiera pagado la diferencia — se genera su ticket con QR y se le manda el correo de confirmación ahora mismo, sin cobrar nada.
                                          </AlertDialogDescription>
                                        </AlertDialogHeader>
                                        <AlertDialogFooter>
                                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                          <AlertDialogAction onClick={() => approveMissionTopup.mutate({ orderId: order.id })}>
                                            Aprobar sin pagar
                                          </AlertDialogAction>
                                        </AlertDialogFooter>
                                      </AlertDialogContent>
                                    </AlertDialog>
                                  )}
                                </>
                              )}
                            </RowActions>
                          </td>
                        </SwipeToDeleteRow>
                        {expandedOrderId === order.id && (
                          <tr className="border-b border-[var(--admin-glass-border)] bg-white/30">
                            <td colSpan={remindersMode ? 10 : 8} className="py-3 px-3">
                              {loadingTickets ? (
                                <p className="text-sm text-[var(--admin-muted)]">Cargando tickets...</p>
                              ) : orderTickets && orderTickets.length > 0 ? (
                                <div className="space-y-2">
                                  {['acceso', 'extra'].map((cat) => {
                                    const items = orderTickets.filter((t: any) => t.category === cat);
                                    if (items.length === 0) return null;
                                    return (
                                      <div key={cat}>
                                        <p className="text-sm font-medium text-[var(--admin-muted)] mb-1">{cat === 'acceso' ? 'Entradas' : 'Extras'}</p>
                                        <div className="flex flex-wrap gap-2">
                                          {items.map((t: any) => (
                                            <span key={t.ticketCode} className="px-2 py-1 rounded-lg bg-white border border-[var(--admin-glass-border)] text-sm font-mono">
                                              {t.ticketTypeName} · {t.ticketCode} · <span className="text-[var(--admin-muted)]">{t.status}</span>
                                            </span>
                                          ))}
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              ) : (
                                <p className="text-sm text-[var(--admin-muted)]">Sin tickets generados.</p>
                              )}
                              {/* Solo si hay más de 1 -- con 1 es nada más el
                                  titular, ya visible en la fila de la orden. */}
                              {order.attendees && order.attendees.length > 1 && (
                                <div className="mt-3">
                                  <p className="text-sm font-medium text-[var(--admin-muted)] mb-1">Acompañantes</p>
                                  <div className="flex flex-wrap gap-2">
                                    {order.attendees.map((a: { name: string; rut: string | null }, i: number) => (
                                      <span key={i} className="px-2 py-1 rounded-lg bg-white border border-[var(--admin-glass-border)] text-sm">
                                        {a.name}{a.rut && <span className="text-[var(--admin-muted)]"> · {a.rut}</span>}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
          )}

          {/* Tarjetas -- cualquier pantalla táctil (iPhone Y iPad, en
              cualquier orientación). Cada una con swipe-to-delete (deslizar
              revela "Eliminar", hay que tocarlo -- mismo diálogo con clave
              de admin de siempre). */}
          {coarse && (
          <div className="space-y-3">
            {visibleOrders.map((order: any) => (
              <SwipeToDeleteCard
                key={order.id}
                deleteDescription={`Vas a eliminar la compra "${order.orderNumber}" de ${order.buyerName}.`}
                onDelete={(adminPassword) => deleteOrder.mutateAsync({ id: order.id, adminPassword })}
                deleteDisabled={deleteOrder.isPending}
              >
                <div className="p-4 space-y-2.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-mono text-sm text-[var(--admin-muted)]">{order.orderNumber}</p>
                      <p className="font-medium truncate">{order.buyerName}</p>
                      <p className="text-sm text-[var(--admin-muted)] truncate">{order.buyerEmail}</p>
                      <MatchedAttendeeTag match={order.matchedAttendee} />
                      {order.partnerBadge && (
                        <span className="mt-1 block w-fit rounded-full bg-cyan-500/15 px-2 py-0.5 text-xs font-semibold text-cyan-700">
                          {order.partnerBadge.emoji} {order.partnerBadge.label}{order.partnerBadge.refLabel ? ` · ${order.partnerBadge.refLabel.split(' · ')[0]}` : ''}
                        </span>
                      )}
                      {order.pendingAddons && (
                        <button
                          type="button"
                          onClick={() => setAddonOrderId(order.id)}
                          className="mt-1 rounded-full bg-yellow-500/15 px-2 py-0.5 text-xs font-semibold text-yellow-700"
                        >
                          Extra pendiente: {order.pendingAddons.names.join(', ') || 'extra'} · {clp(order.pendingAddons.amount)}
                        </button>
                      )}
                      {order.pendingUpgrade && (
                        <button
                          type="button"
                          onClick={() => setUpgradeOrderId(order.id)}
                          className="mt-1 rounded-full bg-yellow-500/15 px-2 py-0.5 text-xs font-semibold text-yellow-700"
                        >
                          {order.pendingUpgrade.toName ? `Subir a ${order.pendingUpgrade.toName}` : 'Cambio de acceso'} pendiente · {clp(order.pendingUpgrade.amount)}
                        </button>
                      )}
                      {(order.credits ?? []).map((c: any) => (
                        <span key={c.id} className="mt-1 block w-fit rounded-full bg-purple-500/15 px-2 py-0.5 text-xs font-semibold text-purple-700">
                          Crédito {c.code} · {c.availability === 'available' ? 'disponible' : c.availability === 'used' ? 'usado' : c.availability === 'expired' ? 'vencido' : 'cancelado'}
                        </span>
                      ))}
                    </div>
                    <StatusBadge status={order.paymentStatus} />
                            {order.refundAmount != null && (
                              <p className="text-xs text-[var(--admin-muted)] mt-1">
                                Devuelto {Number(order.refundPercent)}% · {clp(Number(order.refundAmount))}
                              </p>
                            )}
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="tabular-nums font-medium">${Number(order.total).toLocaleString('es-CL')}</span>
                    <span className="text-[var(--admin-muted)]">
                      {formatChileShortDate(order.createdAt)}
                      <br /><span className="text-xs">{formatChileTime(order.createdAt)}</span>
                    </span>
                  </div>
                  {order.extras && order.extras.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {order.extras.map((ex: { name: string; quantity: number }, i: number) => (
                        <span key={i} className="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs whitespace-nowrap">
                          {ex.name}{ex.quantity > 1 ? ` ×${ex.quantity}` : ''}
                        </span>
                      ))}
                    </div>
                  )}
                  <RowActions>
                    <RowActionLink icon={Mail} label="Enviar email" tone="mail" href={`mailto:${order.buyerEmail}`} />
                    {order.buyerPhone && (
                      <RowActionLink
                        icon={MessageCircle}
                        label="Escribir por WhatsApp"
                        tone="wa"
                        href={`https://wa.me/${String(order.buyerPhone).replace(/[^0-9]/g, '')}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      />
                    )}
                    <RowActionButton
                      icon={Edit}
                      label="Editar nombres"
                      tone="success"
                      onClick={() => setEditingOrderId(order.id)}
                    />
                    {order.paymentStatus === 'approved' && (
                      <>
                        {order.accesoSlug && order.accesoSlug !== 'cumpleaneros' && (
                          <RowActionButton
                            icon={ArrowUpCircle}
                            label="Subir de acceso"
                            tone="send"
                            onClick={() => setUpgradeOrderId(order.id)}
                          />
                        )}
                        {channel === 'web' && order.accesoSlug && order.accesoSlug !== 'cumpleaneros' && (order.credits?.length ?? 0) === 0 && (
                          <RowActionButton
                            icon={CalendarClock}
                            label="Dejar para otra fecha"
                            tone="send"
                            onClick={() => setCreditOrderId(order.id)}
                          />
                        )}
                        {channel === 'web' && (order.credits?.length ?? 0) === 0 && (
                          <RowActionButton
                            icon={RotateCcw}
                            label="Devolver (50%)"
                            tone="send"
                            onClick={() => setRefundOrderId(order.id)}
                          />
                        )}
                        {channel === 'web' && (
                          <RowActionButton
                            icon={ShoppingBag}
                            label="Agregar extra (estacionamiento, etc.)"
                            tone="send"
                            onClick={() => setAddonOrderId(order.id)}
                          />
                        )}
                        <RowActionButton
                          icon={Ticket}
                          label={expandedOrderId === order.id ? 'Ocultar tickets' : 'Ver tickets'}
                          tone="ticket"
                          onClick={() => setExpandedOrderId(expandedOrderId === order.id ? null : order.id)}
                        />
                        <RowActionButton
                          icon={Send}
                          label="Reenviar email"
                          tone="send"
                          disabled={resendConfirmation.isPending}
                          onClick={() => resendConfirmation.mutate({ orderNumber: order.orderNumber })}
                        />
                      </>
                    )}
                  </RowActions>
                  {expandedOrderId === order.id && (
                    loadingTickets ? (
                      <p className="text-sm text-[var(--admin-muted)]">Cargando tickets...</p>
                    ) : orderTickets && orderTickets.length > 0 ? (
                      <div className="flex flex-wrap gap-2 pt-1">
                        {orderTickets.map((t: any) => (
                          <span key={t.ticketCode} className="px-2 py-1 rounded-lg bg-white border border-[var(--admin-glass-border)] text-xs font-mono">
                            {t.ticketTypeName} · {t.ticketCode} · <span className="text-[var(--admin-muted)]">{t.status}</span>
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-[var(--admin-muted)]">Sin tickets generados.</p>
                    )
                  )}
                  {/* Mismo criterio que la tabla de escritorio: solo si hay
                      más de 1 -- con 1 es nada más el titular. */}
                  {expandedOrderId === order.id && order.attendees && order.attendees.length > 1 && (
                    <div className="pt-2">
                      <p className="text-xs font-medium text-[var(--admin-muted)] mb-1">Acompañantes</p>
                      <div className="flex flex-wrap gap-2">
                        {order.attendees.map((a: { name: string; rut: string | null }, i: number) => (
                          <span key={i} className="px-2 py-1 rounded-lg bg-white border border-[var(--admin-glass-border)] text-xs">
                            {a.name}{a.rut && <span className="text-[var(--admin-muted)]"> · {a.rut}</span>}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </SwipeToDeleteCard>
            ))}
          </div>
          )}
          <OrdersPager page={page} pageSize={pageSize} total={totalMatching} onPage={(p) => { setPage(p); window.scrollTo({ top: 0, behavior: 'smooth' }); }} />
        </>
      )}
    </div>
  );
}

/** "Mostrando 26–50 de 143" + Anterior / Página 2 de 6 / Siguiente. */
export function OrdersPager({ page, pageSize, total, onPage, extra }: { page: number; pageSize: number; total: number; onPage: (p: number) => void; extra?: string }) {
  const pages = pageCount(total, pageSize);
  const { from, to } = pageRange(page, pageSize, total);
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-[var(--admin-muted)]">
      <span>Mostrando {from.toLocaleString('es-CL')}–{to.toLocaleString('es-CL')} de {total.toLocaleString('es-CL')} órdenes{extra ? ` ${extra}` : ''}</span>
      {pages > 1 && (
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => onPage(page - 1)}>Anterior</Button>
          <span className="tabular-nums">Página {page} de {pages}</span>
          <Button size="sm" variant="outline" disabled={page >= pages} onClick={() => onPage(page + 1)}>Siguiente</Button>
        </div>
      )}
    </div>
  );
}

/** Dice quién de la orden coincidió con la búsqueda cuando no es el titular
 * (un acompañante), para que no parezca que la orden apareció por error. */
export function MatchedAttendeeTag({ match }: { match?: { name: string; rut: string | null; isBuyer: boolean } | null }) {
  if (!match || match.isBuyer) return null;
  return (
    <span className="mt-1 block w-fit max-w-full truncate rounded-full bg-sky-500/15 px-2 py-0.5 text-xs font-semibold text-sky-300">
      Acompañante: {match.name}{match.rut ? ` · ${match.rut}` : ''}
    </span>
  );
}

/** Fila editable de la lista de embajadores -- nombre/código/%/contacto se
 * editan en el lugar (pedido explícito del usuario: "todo valor debe ser
 * personalizable"), sin un diálogo aparte.
 *
 * `commissionPercent` en null significa "usar la escala del programa": es lo
 * normal ahora, y el campo se deja vacío para dejarlo así. */
export function AmbassadorRow({ ambassador, stats, expanded, onToggleExpand, onUpdate, onDelete, updating, deleting }: {
  ambassador: any;
  stats: { exclusiveSales: number; existingSales: number; eventRevenue: number; eventCommission: number; totalCommission: number } | undefined;
  expanded: boolean;
  onToggleExpand: () => void;
  onUpdate: (data: { name?: string; code?: string; commissionPercent?: number | null; buyerDiscountPercent?: number | null; contact?: string; email?: string; instagram?: string; active?: number }) => Promise<unknown>;
  onDelete: (adminPassword: string) => Promise<unknown>;
  updating: boolean;
  deleting: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(ambassador.name);
  const [code, setCode] = useState(ambassador.code);
  const [commissionPercent, setCommissionPercent] = useState(
    ambassador.commissionPercent === null || ambassador.commissionPercent === undefined ? '' : String(ambassador.commissionPercent),
  );
  const [buyerDiscount, setBuyerDiscount] = useState(
    Number(ambassador.buyerDiscountPercent) > 0 ? String(Number(ambassador.buyerDiscountPercent)) : '',
  );
  const [contact, setContact] = useState(ambassador.contact ?? '');
  const [email, setEmail] = useState(ambassador.email ?? '');

  const s = stats ?? { exclusiveSales: 0, existingSales: 0, eventRevenue: 0, eventCommission: 0, totalCommission: 0 };

  const handleSave = async () => {
    await onUpdate({
      name,
      code: code.toUpperCase(),
      // Vacío = null = usar la escala global, no 0%.
      commissionPercent: commissionPercent.trim() === '' ? null : Number(commissionPercent) || 0,
      // Vacío o 0 = sin descuento para quien compra con su código.
      buyerDiscountPercent: Number(buyerDiscount) > 0 ? Number(buyerDiscount) : null,
      contact: contact || undefined,
      email: email || undefined,
    });
    setEditing(false);
  };

  if (editing) {
    return (
      <tr className="border-b border-border/50 bg-muted/20">
        <td className="py-2 px-3"><Input value={name} onChange={(e) => setName(e.target.value)} className="h-8" /></td>
        <td className="py-2 px-3"><Input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} className="h-8 font-mono" /></td>
        <td className="py-2 px-3"><Input type="number" value={commissionPercent} onChange={(e) => setCommissionPercent(e.target.value)} placeholder="Escala" className="h-8 w-20" /></td>
        <td className="py-2 px-3"><Input type="number" min={0} max={MAX_AMBASSADOR_BUYER_DISCOUNT} value={buyerDiscount} onChange={(e) => setBuyerDiscount(e.target.value)} placeholder="Sin desc." className="h-8 w-20" /></td>
        <td className="py-2 px-3 text-muted-foreground">{s.exclusiveSales}</td>
        <td className="py-2 px-3 text-muted-foreground">${s.eventRevenue.toLocaleString('es-CL')}</td>
        <td className="py-2 px-3 text-muted-foreground">${s.eventCommission.toLocaleString('es-CL')}</td>
        <td className="py-2 px-3"><Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Correo" className="h-8" /></td>
        <td className="py-2 px-3"><Input value={contact} onChange={(e) => setContact(e.target.value)} placeholder="Contacto" className="h-8" /></td>
        <td className="py-2 px-3">
          <div className="flex gap-2">
            <WriteButton size="sm" onClick={handleSave} disabled={updating || !name || !code}>Guardar</WriteButton>
            <Button size="sm" variant="outline" onClick={() => setEditing(false)}>Cancelar</Button>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <tr className="border-b border-border/50">
      <td className="py-2 px-3">
        <button className="text-left hover:text-primary transition-colors" onClick={onToggleExpand}>
          {ambassador.name}
        </button>
      </td>
      <td className="py-2 px-3 font-mono font-bold text-primary">{ambassador.code}</td>
      <td className="py-2 px-3">
        {ambassador.commissionPercent === null || ambassador.commissionPercent === undefined
          ? <span className="text-muted-foreground text-xs">Escala</span>
          : `${ambassador.commissionPercent}%`}
      </td>
      <td className="py-2 px-3">
        {Number(ambassador.buyerDiscountPercent) > 0
          ? <span className="rounded-full bg-pink-500/15 px-2 py-0.5 text-xs font-semibold text-pink-500">{Number(ambassador.buyerDiscountPercent)}%</span>
          : <span className="text-muted-foreground text-xs">Sin desc. propio</span>}
      </td>
      <td className="py-2 px-3">
        {s.exclusiveSales}
        {s.existingSales > 0 && <span className="text-muted-foreground text-xs"> +{s.existingSales} exist.</span>}
      </td>
      <td className="py-2 px-3">${s.eventRevenue.toLocaleString('es-CL')}</td>
      <td className="py-2 px-3 font-semibold text-primary">${s.eventCommission.toLocaleString('es-CL')}</td>
      <td className="py-2 px-3 text-muted-foreground text-xs">{ambassador.email || '—'}</td>
      <td className="py-2 px-3 text-muted-foreground text-xs">{ambassador.contact || '—'}</td>
      <td className="py-2 px-3">
        <div className="flex gap-2">
          <span className={`px-2 py-0.5 rounded-full text-xs ${ambassador.active ? 'bg-green-500/20 text-green-400' : 'bg-muted text-muted-foreground'}`}>{ambassador.active ? 'Activo' : 'Inactivo'}</span>
          <Button variant="outline" size="sm" onClick={onToggleExpand} title="Ver perfil">{expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}</Button>
          <Button
            variant="outline"
            size="sm"
            disabled={!ambassador.referralUrl}
            title={ambassador.referralUrl ? 'Copiar su link personal (las compras quedan con su código solas)' : 'No hay evento destacado al que apuntar el link'}
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(ambassador.referralUrl);
                toast.success(`Link de ${ambassador.name} copiado`);
              } catch {
                toast.error('No se pudo copiar el link');
              }
            }}
          >
            <Link2 className="w-3 h-3 mr-1" /> Link
          </Button>
          <Button variant="outline" size="sm" onClick={() => setEditing(true)}><Edit className="w-3 h-3" /></Button>
          <Button variant="outline" size="sm" disabled={updating} onClick={() => onUpdate({ active: ambassador.active ? 0 : 1 })}>
            {ambassador.active ? 'Desactivar' : 'Activar'}
          </Button>
          <ConfirmDeleteButton description={`Vas a eliminar al embajador "${ambassador.name}" (${ambassador.code}). Sus clientes exclusivos quedan libres; las comisiones ya generadas se conservan.`} onConfirm={(adminPassword) => onDelete(adminPassword)} disabled={deleting} />
        </div>
      </td>
    </tr>
  );
}

export const APPLICATION_STATUS_LABEL: Record<string, string> = { pendiente: 'Pendiente', aprobada: 'Aprobada', rechazada: 'Rechazada' };

/** Postulaciones públicas de /embajadores. Aprobar crea al embajador ahí
 * mismo con el código que escribe el admin (reusa createExclusiveAmbassador
 * en el servidor); rechazar deja una nota opcional y no borra la fila, para
 * que esa persona pueda volver a postular más adelante. */
export function AmbassadorApplicationsTab() {
  const { data, refetch } = trpc.ambassadorApplications.listAll.useQuery();
  const applications = data ?? [];
  const [estado, setEstado] = useState<'pendiente' | 'aprobada' | 'rechazada' | 'all'>('pendiente');
  const [approvingId, setApprovingId] = useState<number | null>(null);
  const [code, setCode] = useState('');
  const [rejectingId, setRejectingId] = useState<number | null>(null);
  const [rejectNote, setRejectNote] = useState('');

  const review = trpc.ambassadorApplications.review.useMutation({
    onSuccess: () => { refetch(); toast.success('Postulación rechazada'); setRejectingId(null); setRejectNote(''); },
    onError: onMutationError,
  });
  const approve = trpc.ambassadorApplications.approve.useMutation({
    onSuccess: () => { refetch(); toast.success('Embajador creado y correo de bienvenida enviado'); setApprovingId(null); setCode(''); },
    onError: onMutationError,
  });

  const visibles = applications.filter((a: any) => estado === 'all' || a.status === estado);

  return (
    <div className="space-y-4">
      <Select value={estado} onValueChange={(v) => setEstado(v as typeof estado)}>
        <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="pendiente">Pendientes</SelectItem>
          <SelectItem value="aprobada">Aprobadas</SelectItem>
          <SelectItem value="rechazada">Rechazadas</SelectItem>
          <SelectItem value="all">Todas</SelectItem>
        </SelectContent>
      </Select>

      <Card className="rounded-2xl border-0 shadow-md shadow-black/5">
        <CardContent className="pt-6">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 px-3">Nombre</th>
                  <th className="text-left py-2 px-3">Contacto</th>
                  <th className="text-left py-2 px-3">Seguidores</th>
                  <th className="text-left py-2 px-3">Mensaje</th>
                  <th className="text-left py-2 px-3">Fecha</th>
                  <th className="text-left py-2 px-3">Estado</th>
                  <th className="text-left py-2 px-3">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {visibles.map((a: any) => (
                  <tr key={a.id} className="border-b border-border/50 align-top">
                    <td className="py-2 px-3">
                      <p className="font-medium">{a.name}</p>
                      <p className="text-xs text-muted-foreground">{a.email}</p>
                    </td>
                    <td className="py-2 px-3">
                      <a href={whatsappLinkFor(a.whatsapp)} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-primary hover:underline">
                        <MessageCircle className="w-3.5 h-3.5" /> {a.whatsapp}
                      </a>
                      <a href={instagramLinkFor(a.instagram)} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-primary hover:underline mt-1">
                        <Instagram className="w-3.5 h-3.5" /> @{a.instagram}
                      </a>
                    </td>
                    <td className="py-2 px-3">{a.followers ?? '—'}</td>
                    <td className="py-2 px-3 max-w-xs text-muted-foreground">{a.message || '—'}</td>
                    <td className="py-2 px-3 text-muted-foreground whitespace-nowrap">{formatChileShortDate(a.createdAt)}</td>
                    <td className="py-2 px-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs whitespace-nowrap ${
                        a.status === 'pendiente' ? 'bg-amber-500/15 text-amber-600' :
                        a.status === 'aprobada' ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground'
                      }`}>
                        {APPLICATION_STATUS_LABEL[a.status]}
                      </span>
                      {a.reviewNote && <p className="text-xs text-muted-foreground mt-1 max-w-[10rem]">{a.reviewNote}</p>}
                    </td>
                    <td className="py-2 px-3">
                      {a.status === 'pendiente' && (
                        approvingId === a.id ? (
                          <div className="flex items-center gap-1">
                            <Input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="CODIGO" className="h-8 w-28 font-mono" />
                            <WriteButton size="sm" className="h-8" disabled={!code.trim() || approve.isPending} onClick={() => approve.mutate({ id: a.id, code: code.trim() })}>
                              {approve.isPending ? '...' : 'OK'}
                            </WriteButton>
                            <Button size="sm" variant="outline" className="h-8" onClick={() => { setApprovingId(null); setCode(''); }}><X className="w-3 h-3" /></Button>
                          </div>
                        ) : rejectingId === a.id ? (
                          <div className="flex items-center gap-1">
                            <Input value={rejectNote} onChange={(e) => setRejectNote(e.target.value)} placeholder="Nota (opcional)" className="h-8 w-36" />
                            <WriteButton size="sm" variant="destructive" className="h-8" disabled={review.isPending} onClick={() => review.mutate({ id: a.id, status: 'rechazada', note: rejectNote.trim() || undefined })}>
                              {review.isPending ? '...' : 'OK'}
                            </WriteButton>
                            <Button size="sm" variant="outline" className="h-8" onClick={() => { setRejectingId(null); setRejectNote(''); }}><X className="w-3 h-3" /></Button>
                          </div>
                        ) : (
                          <div className="flex gap-2">
                            <Button size="sm" className="h-8" onClick={() => setApprovingId(a.id)}><UserPlus className="w-3.5 h-3.5 mr-1" /> Aprobar</Button>
                            <Button size="sm" variant="outline" className="h-8 text-destructive" onClick={() => setRejectingId(a.id)}>Rechazar</Button>
                          </div>
                        )
                      )}
                      {a.status === 'aprobada' && a.createdAmbassadorId && (
                        <span className="text-xs text-muted-foreground font-mono">Ya es embajador</span>
                      )}
                    </td>
                  </tr>
                ))}
                {visibles.length === 0 && (
                  <tr><td colSpan={7} className="py-8 text-center text-muted-foreground">
                    {estado === 'all' ? 'Sin postulaciones todavía.' : `Sin postulaciones en estado "${APPLICATION_STATUS_LABEL[estado] ?? estado}".`}
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/** Toda la configuración del programa. El dueño pidió explícitamente que
 * nada quede fijo en el código. */
export function ProgramConfigTab() {
  const { data, refetch } = trpc.ambassadors.getConfig.useQuery();
  const update = trpc.ambassadors.updateConfig.useMutation({
    onSuccess: () => { refetch(); toast.success('Configuración guardada'); },
    onError: onMutationError,
  });

  const [scale, setScale] = useState<{ minSales: number; maxSales: number | null; percent: number }[]>([]);
  const [benefits, setBenefits] = useState<{ minSales: number; items: string[]; bonusClp: number }[]>([]);
  const [existingPercent, setExistingPercent] = useState('');
  const [launchDate, setLaunchDate] = useState('');
  const [weeklyEnabled, setWeeklyEnabled] = useState(true);
  const [weekday, setWeekday] = useState('1');
  const [hour, setHour] = useState('9');
  const [generalEnabled, setGeneralEnabled] = useState(false);
  const [generalPercent, setGeneralPercent] = useState('');
  const [generalEnds, setGeneralEnds] = useState('');

  useEffect(() => {
    if (!data) return;
    setGeneralEnabled(data.generalBuyerDiscountEnabled);
    setGeneralPercent(data.generalBuyerDiscountPercent > 0 ? String(data.generalBuyerDiscountPercent) : '');
    setGeneralEnds(data.generalBuyerDiscountEndsAt
      ? new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(data.generalBuyerDiscountEndsAt))
      : '');
    setScale(data.commissionScale);
    setBenefits(data.benefits);
    setExistingPercent(String(data.existingClientPercent));
    setLaunchDate(new Date(data.launchDate).toISOString().slice(0, 10));
    setWeeklyEnabled(data.weeklyEmailEnabled);
    setWeekday(String(data.weeklyEmailWeekday));
    setHour(String(data.weeklyEmailHourChile));
  }, [data]);

  const DIAS = [
    { value: '1', label: 'Lunes' }, { value: '2', label: 'Martes' }, { value: '3', label: 'Miércoles' },
    { value: '4', label: 'Jueves' }, { value: '5', label: 'Viernes' }, { value: '6', label: 'Sábado' },
    { value: '0', label: 'Domingo' },
  ];
  const HORAS = Array.from({ length: 24 }, (_, h) => ({ value: String(h), label: `${String(h).padStart(2, '0')}:00` }));

  return (
    <div className="space-y-6">
      <Card className="rounded-2xl border-0 shadow-md shadow-black/5">
        <CardHeader><CardTitle>Descuento general para compradores</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground text-sm">
            Un % de descuento en la entrada para quien compre con el código o link de <strong>cualquier</strong> embajador,
            sin ir uno por uno. No cambia a los embajadores que ya tienen su propio % (esos siguen igual): solo se agrega a
            los que no tienen. Descuenta solo el acceso, nunca los extras. Máximo {MAX_AMBASSADOR_BUYER_DISCOUNT}%.
          </p>
          <div className="flex items-center gap-3">
            <Checkbox id="general-discount" checked={generalEnabled} onCheckedChange={(v) => setGeneralEnabled(!!v)} />
            <Label htmlFor="general-discount">Descuento general activo</Label>
          </div>
          <div className="flex flex-wrap gap-4">
            <div className="max-w-xs">
              <Label>Descuento %</Label>
              <Input type="number" min={0} max={MAX_AMBASSADOR_BUYER_DISCOUNT} value={generalPercent} onChange={(e) => setGeneralPercent(e.target.value)} placeholder="Ej: 5" className="mt-1" />
            </div>
            <div className="max-w-xs">
              <Label>Se apaga solo el (opcional)</Label>
              <Input type="date" value={generalEnds} onChange={(e) => setGeneralEnds(e.target.value)} className="mt-1" />
              <p className="text-xs text-muted-foreground mt-1">Vale hasta el final de ese día (hora de Chile). Vacío = hasta que lo apagues.</p>
            </div>
          </div>
          <WriteButton
            onClick={() => update.mutate({
              generalBuyerDiscountEnabled: generalEnabled,
              generalBuyerDiscountPercent: Math.min(MAX_AMBASSADOR_BUYER_DISCOUNT, Math.max(0, Number(generalPercent) || 0)),
              generalBuyerDiscountEndsAt: generalEnds ? new Date(`${generalEnds}T23:59:59-03:00`).toISOString() : null,
            })}
            disabled={update.isPending}
            className="interactive"
          >
            {update.isPending ? 'Guardando…' : 'Guardar descuento general'}
          </WriteButton>
        </CardContent>
      </Card>

      <Card className="rounded-2xl border-0 shadow-md shadow-black/5">
        <CardHeader><CardTitle>Escala de comisión</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground text-sm">
            El % se fija por cada venta según cuántas ventas a clientes exclusivos lleve el embajador ese mes, y queda
            congelado: subir de tramo no recalcula las ventas anteriores. Deja "hasta" vacío en el último tramo para
            que sea abierto.
          </p>
          {scale.map((t, i) => (
            <div key={i} className="flex flex-wrap items-end gap-3">
              <div><Label className="text-xs">Desde</Label><Input type="number" value={t.minSales} onChange={(e) => setScale(scale.map((x, j) => j === i ? { ...x, minSales: Number(e.target.value) || 1 } : x))} className="mt-1 w-24 h-9" /></div>
              <div><Label className="text-xs">Hasta</Label><Input type="number" value={t.maxSales ?? ''} placeholder="∞" onChange={(e) => setScale(scale.map((x, j) => j === i ? { ...x, maxSales: e.target.value === '' ? null : Number(e.target.value) } : x))} className="mt-1 w-24 h-9" /></div>
              <div><Label className="text-xs">Comisión %</Label><Input type="number" value={t.percent} onChange={(e) => setScale(scale.map((x, j) => j === i ? { ...x, percent: Number(e.target.value) || 0 } : x))} className="mt-1 w-24 h-9" /></div>
              <Button variant="outline" size="sm" className="text-destructive h-9" onClick={() => setScale(scale.filter((_, j) => j !== i))}><Trash2 className="w-3 h-3" /></Button>
            </div>
          ))}
          <Button variant="outline" size="sm" onClick={() => setScale([...scale, { minSales: 1, maxSales: null, percent: 30 }])}>
            <Plus className="w-3 h-3 mr-1" /> Agregar tramo
          </Button>
          <div className="pt-2 max-w-xs">
            <Label>% para clientes existentes</Label>
            <Input type="number" step="0.01" value={existingPercent} onChange={(e) => setExistingPercent(e.target.value)} className="mt-1" />
            <p className="text-xs text-muted-foreground mt-1">Se paga por vender a alguien que ya estaba en la base, o al cliente de otro embajador.</p>
          </div>
          <WriteButton
            onClick={() => update.mutate({ commissionScale: scale, existingClientPercent: Number(existingPercent) || 0 })}
            disabled={update.isPending}
            className="interactive"
          >
            {update.isPending ? 'Guardando…' : 'Guardar escala'}
          </WriteButton>
        </CardContent>
      </Card>

      <Card className="rounded-2xl border-0 shadow-md shadow-black/5">
        <CardHeader><CardTitle>Beneficios por ventas del evento</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground text-sm">
            Son acumulativos: quien llega a 10 ventas también tiene lo de 5 y lo de 1. Con 0 ventas no hay beneficios.
            Separa varios beneficios del mismo tramo con punto y coma.
          </p>
          {benefits.map((b, i) => (
            <div key={i} className="flex flex-wrap items-end gap-3">
              <div><Label className="text-xs">Desde ventas</Label><Input type="number" value={b.minSales} onChange={(e) => setBenefits(benefits.map((x, j) => j === i ? { ...x, minSales: Number(e.target.value) || 1 } : x))} className="mt-1 w-28 h-9" /></div>
              <div className="flex-1 min-w-[240px]">
                <Label className="text-xs">Beneficios</Label>
                <Input value={b.items.join('; ')} onChange={(e) => setBenefits(benefits.map((x, j) => j === i ? { ...x, items: e.target.value.split(';').map((s) => s.trim()).filter(Boolean) } : x))} className="mt-1 h-9" />
              </div>
              <div><Label className="text-xs">Bono $</Label><Input type="number" value={b.bonusClp} onChange={(e) => setBenefits(benefits.map((x, j) => j === i ? { ...x, bonusClp: Number(e.target.value) || 0 } : x))} className="mt-1 w-28 h-9" /></div>
              <Button variant="outline" size="sm" className="text-destructive h-9" onClick={() => setBenefits(benefits.filter((_, j) => j !== i))}><Trash2 className="w-3 h-3" /></Button>
            </div>
          ))}
          <Button variant="outline" size="sm" onClick={() => setBenefits([...benefits, { minSales: 1, items: [], bonusClp: 0 }])}>
            <Plus className="w-3 h-3 mr-1" /> Agregar tramo de beneficios
          </Button>
          <WriteButton onClick={() => update.mutate({ benefits })} disabled={update.isPending} className="interactive">
            {update.isPending ? 'Guardando…' : 'Guardar beneficios'}
          </WriteButton>
        </CardContent>
      </Card>

      <Card className="rounded-2xl border-0 shadow-md shadow-black/5">
        <CardHeader><CardTitle>Fecha de lanzamiento del programa</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground text-sm">
            Es la frontera del programa: quien ya estaba en la base <strong>antes</strong> de esta fecha se considera
            cliente de la casa para siempre (paga 10% y no sube el nivel de nadie). Quien aparezca después puede
            volverse cliente exclusivo del embajador que lo trajo. Cambiarla afecta solo a las ventas futuras.
          </p>
          <div className="max-w-xs">
            <Label>Fecha</Label>
            <Input type="date" value={launchDate} onChange={(e) => setLaunchDate(e.target.value)} className="mt-1" />
          </div>
          <WriteButton
            onClick={() => update.mutate({ launchDate: new Date(`${launchDate}T00:00:00`).toISOString() })}
            disabled={update.isPending || !launchDate}
            className="interactive"
          >
            {update.isPending ? 'Guardando…' : 'Guardar fecha'}
          </WriteButton>
        </CardContent>
      </Card>

      <Card className="rounded-2xl border-0 shadow-md shadow-black/5">
        <CardHeader><CardTitle>Correo semanal</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            <Checkbox id="weekly" checked={weeklyEnabled} onCheckedChange={(v) => setWeeklyEnabled(!!v)} />
            <Label htmlFor="weekly">Mandar el resumen semanal a los embajadores</Label>
          </div>
          <div className="flex flex-wrap gap-4">
            <div className="max-w-xs">
              <Label>Día de la semana</Label>
              <Select value={weekday} onValueChange={setWeekday}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>{DIAS.map((d) => <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="max-w-xs">
              <Label>Hora (Chile)</Label>
              <Select value={hour} onValueChange={setHour}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>{HORAS.map((h) => <SelectItem key={h.value} value={h.value}>{h.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            El envío sale a esta hora en punto, en hora de Chile de verdad (ajustada sola al horario de
            verano/invierno) -- el cron chequea cada hora, así que puede demorar hasta unos minutos después de la
            hora exacta en dispararse. Para mandarlo ya mismo sin esperar -- por ejemplo, para probarlo o para
            reenviarlo si algo falló -- usa "Enviar el correo ahora" en la pestaña Material.
          </p>
          <WriteButton
            onClick={() => update.mutate({ weeklyEmailEnabled: weeklyEnabled, weeklyEmailWeekday: Number(weekday), weeklyEmailHourChile: Number(hour) })}
            disabled={update.isPending}
            className="interactive"
          >
            {update.isPending ? 'Guardando…' : 'Guardar correo semanal'}
          </WriteButton>
        </CardContent>
      </Card>
    </div>
  );
}

export const PIE_COLORS = ['#111827', '#6366f1', '#ec4899', '#f59e0b', '#10b981', '#3b82f6', '#ef4444', '#8b5cf6'];

export function ExpensesList({ events, refreshKey, onChanged }: { events: any[]; refreshKey: number; onChanged: () => void }) {
  const [filterEvent, setFilterEvent] = useState<string>('all');
  const [filterCategory, setFilterCategory] = useState<string>('all');

  const { data, refetch } = trpc.expenses.listAll.useQuery({
    ...(filterEvent === 'all' ? {} : filterEvent === 'general' ? { scope: 'general' as const } : { eventId: Number(filterEvent) }),
    ...(filterCategory === 'all' ? {} : { category: filterCategory }),
  });
  const remove = trpc.expenses.delete.useMutation({
    onSuccess: () => { refetch(); onChanged(); toast.success('Gasto eliminado'); },
    onError: onMutationError,
  });
  // Cambiar "ya contado en el costo del producto" en un gasto existente (antes
  // solo se podía al crearlo: había que borrarlo y cargarlo de nuevo).
  const [costToggle, setCostToggle] = useState<{ id: number; description: string; toExcluded: boolean } | null>(null);
  const reviewCogs = trpc.expenses.reviewCogs.useMutation({
    onSuccess: (_r, v) => { refetch(); onChanged(); toast.success(v.decision === 'same' ? 'Marcado: ya no resta del resultado' : 'Listo: vuelve a restar del resultado'); },
    onError: onMutationError,
  });

  useEffect(() => { refetch(); }, [refreshKey, refetch]);

  const rows = data ?? [];
  const total = rows.reduce((s: number, r: any) => s + r.amountTotal, 0);

  const exportCsv = () => {
    const header = ['Fecha', 'Ámbito', 'Evento', 'Categoría', 'Descripción', 'Proveedor', 'Documento', 'N°', 'Total', 'Neto', 'IVA', 'Pago'];
    const lines = rows.map((r: any) => [
      formatChileShortDate(r.expenseDate), r.scope, r.eventTitle ?? '', categoryLabel(r.category),
      r.description, r.supplier ?? '', documentTypeLabel(r.documentType), r.documentNumber ?? '',
      r.amountTotal, r.netAmount, r.ivaAmount, paymentMethodLabel(r.paymentMethod),
    ].map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','));
    const blob = new Blob([[header.join(','), ...lines].join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `gastos-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const coarse = useCoarsePointer();

  return (
    <Card className="admin-clay border-0">
      <CardHeader><CardTitle>Gastos registrados</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-3 items-end">
          <div className="min-w-52">
            <Label>Filtrar por</Label>
            <Select value={filterEvent} onValueChange={setFilterEvent}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="general">Solo gastos de la productora</SelectItem>
                {events.map((e: any) => <SelectItem key={e.id} value={String(e.id)}>{e.title}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="min-w-44">
            <Label>Categoría</Label>
            <Select value={filterCategory} onValueChange={setFilterCategory}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                {EXPENSE_CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <Button variant="outline" onClick={exportCsv} disabled={rows.length === 0}>
            <Download className="w-4 h-4 mr-2" /> Exportar CSV
          </Button>
          <span className="text-sm text-[var(--admin-muted)] ml-auto">
            {rows.length} gasto(s) · <strong className="text-foreground tabular-nums">${total.toLocaleString('es-CL')}</strong>
          </span>
        </div>

        {rows.length === 0 ? (
          <EmptyState icon={Receipt} title="Sin gastos registrados con estos filtros" />
        ) : (
          <div className="space-y-2">
            {rows.map((r: any) => {
              const rowBody = (
                <div className={`flex items-center justify-between gap-3 text-sm ${coarse ? 'p-3' : 'admin-clay-sm p-3'}`}>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold">{r.description}</span>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-primary/15 text-primary">{categoryLabel(r.category)}</span>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-black/5 text-[var(--admin-muted)]">{documentTypeLabel(r.documentType)}</span>
                      {r.excludeFromPnl === 1 && <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--admin-warning-bg)] text-[var(--admin-warning-text)]">No resta del resultado</span>}
                      {r.recurrence === 'mensual' && <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--admin-send-bg)] text-[var(--admin-send-text)]">Mensual</span>}
                    </div>
                    <p className="text-sm text-[var(--admin-muted)] mt-0.5">
                      {formatChileShortDate(r.expenseDate)} · {r.eventTitle ?? 'Productora'} · {paymentMethodLabel(r.paymentMethod)}
                      {r.supplier ? ` · ${r.supplier}` : ''}
                      {r.ivaAmount > 0 ? ` · IVA $${r.ivaAmount.toLocaleString('es-CL')}` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="font-semibold tabular-nums">${r.amountTotal.toLocaleString('es-CL')}</span>
                    {(r.excludeFromPnl === 1 || r.category === 'barra' || r.category === 'merch') && !coarse && (
                      <button type="button" onClick={() => setCostToggle({ id: r.id, description: r.description, toExcluded: r.excludeFromPnl !== 1 })}
                        className="rounded-lg px-2 py-1 text-xs text-[var(--admin-muted)] hover:bg-white/5 hover:text-white"
                        title={r.excludeFromPnl === 1 ? 'Volver a restar del resultado' : 'Marcar como ya contado en el costo del producto'}>
                        {r.excludeFromPnl === 1 ? 'Volver a restar' : 'Ya contado en costo'}
                      </button>
                    )}
                    {r.receiptUrl && (
                      <a href={r.receiptUrl} target="_blank" rel="noreferrer" aria-label={`Ver boleta de ${r.description}`} title="Ver boleta"
                        className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--admin-muted)] hover:bg-white/5 hover:text-white">
                        <ImageIcon className="h-4 w-4" />
                      </a>
                    )}
                    {!coarse && (
                      <ConfirmDeleteButton description={`Vas a eliminar el gasto "${r.description}".`} onConfirm={(adminPassword) => remove.mutateAsync({ id: r.id, adminPassword })} />
                    )}
                  </div>
                </div>
              );
              return coarse ? (
                <SwipeToDeleteCard
                  key={r.id}
                  deleteDescription={`Vas a eliminar el gasto "${r.description}".`}
                  onDelete={(adminPassword) => remove.mutateAsync({ id: r.id, adminPassword })}
                >
                  {rowBody}
                </SwipeToDeleteCard>
              ) : (
                <div key={r.id}>{rowBody}</div>
              );
            })}
          </div>
        )}
      </CardContent>
      <AdminPasswordDialog
        open={!!costToggle}
        title={costToggle?.toExcluded ? '¿Ya está contado en el costo del producto?' : '¿Volver a restar este gasto?'}
        description={costToggle?.toExcluded
          ? `"${costToggle.description}" va a dejar de restar del resultado del evento (sigue en el libro de compras y para el SII).`
          : `"${costToggle?.description ?? ''}" vuelve a restar del resultado del evento.`}
        actionLabel={costToggle?.toExcluded ? 'Sí, ya está contado' : 'Sí, volver a restar'}
        onConfirm={(adminPassword) => reviewCogs.mutateAsync({ id: costToggle!.id, decision: costToggle!.toExcluded ? 'same' : 'reset', adminPassword })}
        onClose={() => setCostToggle(null)}
      />
    </Card>
  );
}

// Las secciones de siempre (mismos `id`: deep links push, burbujas de
// useAdminBadges y `localStorage` siguen igual), ahora colgadas de un "hub"
// (components/admin/shell/nav.ts): el menú muestra los hubs y cada sección
// es una pestaña dentro de su hub. El orden de acá es el orden de las
// pestañas. "Evento" se llama "Resumen de la noche": es la pantalla en vivo
// de la fiesta, distinta de "Eventos" (el CRUD de la ficha del evento).
/** Lo que la pantalla Inicio necesita del panel (burbujas y navegación) --
 * va por contexto porque `render` de cada sección no recibe argumentos. */
export const AdminNavContext = createContext<{ badgeCounts: Record<string, number>; openSection: (id: string) => void }>({
  badgeCounts: {},
  openSection: () => {},
});
