import '@/admin.css';
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { startRegistration } from '@simplewebauthn/browser';
import { useAuth } from '@/_core/hooks/useAuth';
import { NOT_ADMIN_ERR_MSG } from '@shared/const';
import { canOpenAdmin, useIsDemo, useDemoProps, DEMO_TOOLTIP } from '@/lib/demoMode';
import { WriteButton, DownloadLink } from '@/components/admin/WriteButton';
import { trpc } from '@/lib/trpc';
import { useSeo } from '@/hooks/useSeo';
import { useInstallableApp } from '@/hooks/useInstallableApp';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Calendar, DollarSign, Ticket, Users, Plus, Edit, ShoppingBag, Store, Percent, Trophy, LayoutDashboard, Settings as SettingsIcon, LogOut, Contact, X, Upload, Download, Mail, History, ChevronDown, ChevronUp, Gift, MessageCircle, Trash2, Crown, Martini, Instagram, UserPlus, QrCode, Share2, Ban, Receipt, Eye, Fingerprint, Compass } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import { whatsappLinkFor, instagramLinkFor } from '@shared/ambassadorApplication';
import { isValidRut } from '@shared/rut';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogTrigger, AlertDialogContent, AlertDialogHeader,
  AlertDialogFooter, AlertDialogTitle, AlertDialogDescription, AlertDialogAction, AlertDialogCancel,
} from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { ConfirmDeleteButton } from '@/components/admin/ConfirmDeleteButton';
import { AdminLoginForm } from '@/components/admin/AdminLoginForm';
import { MailingComposer } from '@/components/admin/MailingComposer';
import { isMissionActiveForEvent, missionDepositPrice } from '@shared/mission300';
import {
  EXPENSE_CATEGORIES, EXPENSE_DOCUMENT_TYPES, EXPENSE_PAYMENT_METHODS,
  categoryLabel, documentTypeLabel, paymentMethodLabel, deriveAmounts,
  type ExpenseCategory, type ExpenseDocumentType, type ExpensePaymentMethod,
} from '@shared/expenses';
import { monthKeyFor } from '@shared/ambassadorProgram';
import { formatChileDateTime, formatChileShortDate } from '@shared/chileDate';
import {
  SidebarProvider, Sidebar, SidebarContent, SidebarHeader, SidebarFooter,
  SidebarMenu, SidebarMenuItem, SidebarMenuButton, SidebarInset, SidebarTrigger,
} from '@/components/ui/sidebar';

/* Toda escritura del admin pasa por acá: sin esto, un error del servidor
 * (típicamente "Database not available" si falta DATABASE_URL) fallaba en
 * silencio — el botón volvía a su estado normal sin avisar que no se guardó nada. */
const onMutationError = (error: unknown) => {
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
// 17:00 en Chile. Mismo criterio de hora fija (UTC-4, continental sin cambio
// de horario) ya usado en CANDYLAND.eventDate (client/src/config/candyland.ts).
const CHILE_OFFSET_MS = 4 * 60 * 60 * 1000;

/** DB (UTC) → valor para un <input type="datetime-local"> mostrando hora de Chile. */
function toChileInputValue(dateInput: string | Date | null | undefined): string {
  if (!dateInput) return '';
  const chileTime = new Date(new Date(dateInput).getTime() - CHILE_OFFSET_MS);
  return chileTime.toISOString().slice(0, 16);
}

/** Valor de un <input type="datetime-local"> (hora de Chile, sin zona) → ISO con offset, para mandar al servidor. */
function fromChileInputValue(value: string): string {
  if (!value) return '';
  return `${value}:00-04:00`;
}

/* Debe coincidir con los ids de CANDYLAND.accesos (client/src/config/candyland.ts)
 * y con el enum accesoSlug del router — es lo que conecta cada entrada con la
 * pregunta correspondiente del checkout conversacional. */
type AccesoSlug = 'duo' | 'duo_mujeres' | 'soltera' | 'soltero' | 'trio' | 'grupo' | 'cumpleaneros';
const ACCESO_SLUG_OPTIONS: { value: AccesoSlug; label: string }[] = [
  { value: 'soltera', label: 'Soltera (ella sola)' },
  { value: 'soltero', label: 'Soltero (él solo)' },
  { value: 'duo', label: 'Dúo (pareja)' },
  { value: 'duo_mujeres', label: 'Dúo Mujeres (2x1, mismo valor que Soltera)' },
  { value: 'trio', label: 'Trío' },
  { value: 'grupo', label: 'Grupo' },
  { value: 'cumpleaneros', label: 'Cumpleañeros' },
];

function StockHistoryDialog({ ticketTypeId, ticketName }: { ticketTypeId: number; ticketName: string }) {
  const [open, setOpen] = useState(false);
  const { data: history } = trpc.events.ticketStockHistory.useQuery({ ticketTypeId }, { enabled: open });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" title="Ver historial de cambios de stock"><History className="w-3 h-3" /></Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Historial de stock — {ticketName}</DialogTitle>
        </DialogHeader>
        {!history || history.length === 0 ? (
          <p className="text-sm text-muted-foreground">Todavía no hay cambios de stock registrados para esta entrada.</p>
        ) : (
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {history.map((h: any) => (
              <div key={h.id} className="text-sm bg-muted/30 rounded-lg px-3 py-2 flex items-center justify-between">
                <span>
                  <strong>{h.previousStock}</strong> → <strong>{h.newStock}</strong>
                  <span className="text-muted-foreground ml-2">{h.changedByName || h.changedByEmail || (h.changedByOperatorName ? `${h.changedByOperatorName} (cocina)` : 'Admin')}</span>
                </span>
                <span className="text-xs text-muted-foreground">{new Date(h.createdAt).toLocaleString('es-CL', { timeZone: 'America/Santiago' })}</span>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function TicketTypesList({
  eventId, onEdit,
}: { eventId: number; onEdit: (tt: any) => void }) {
  const { data: ticketTypesData, refetch } = trpc.events.listTicketTypes.useQuery({ eventId });
  const deleteTicketType = trpc.events.deleteTicketType.useMutation({ onSuccess: () => refetch(), onError: onMutationError });
  const ticketTypes = ticketTypesData ?? [];

  if (ticketTypes.length === 0) {
    return <p className="text-muted-foreground text-xs mt-3">Todavía no hay entradas para este evento.</p>;
  }

  const accesos = ticketTypes.filter((tt: any) => tt.category !== 'extra');
  const extras = ticketTypes.filter((tt: any) => tt.category === 'extra');

  const row = (tt: any) => (
    <div key={tt.id} className="flex items-center justify-between text-sm bg-muted/30 rounded-lg px-3 py-2">
      <div>
        <span className="font-semibold">{tt.name}</span>
        <span className="text-muted-foreground ml-2">${Number(tt.price).toLocaleString('es-CL')} · stock {tt.totalStock} · vendidas {tt.soldCount ?? 0} · {tt.status}</span>
        {tt.category === 'extra' ? (
          <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-violet-electric/15 text-violet-electric">Extra — aparece en el paso de extras del checkout</span>
        ) : tt.accesoSlug ? (
          <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-primary/15 text-primary">{ACCESO_SLUG_OPTIONS.find((o) => o.value === tt.accesoSlug)?.label ?? tt.accesoSlug}</span>
        ) : (
          <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-destructive/15 text-destructive">Sin tipo de acceso — no se puede comprar</span>
        )}
      </div>
      <div className="flex gap-2">
        <StockHistoryDialog ticketTypeId={tt.id} ticketName={tt.name} />
        <Button variant="outline" size="sm" onClick={() => onEdit(tt)}><Edit className="w-3 h-3" /></Button>
        <ConfirmDeleteButton description={`Vas a eliminar el tipo de entrada "${tt.name}".`} onConfirm={() => deleteTicketType.mutateAsync({ id: tt.id })} />
      </div>
    </div>
  );

  return (
    <div className="mt-3 space-y-4 border-t border-border/50 pt-3">
      {accesos.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Accesos</p>
          {accesos.map(row)}
        </div>
      )}
      {extras.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Extras</p>
          {extras.map(row)}
        </div>
      )}
    </div>
  );
}

function Mission300Panel({ eventId }: { eventId: number }) {
  const { data: status, refetch } = trpc.mission300.status.useQuery({ eventId });
  const evaluate = trpc.mission300.evaluate.useMutation({
    onSuccess: (r) => { refetch(); toast.success(r.success ? `Meta cumplida: se generaron tickets para ${r.resolved} orden(es)` : `No se cumplió la meta: se pidió la diferencia a ${r.topupRequested} orden(es)`); },
    onError: onMutationError,
  });
  const [confirming, setConfirming] = useState(false);

  if (!status) return null;

  const cutoff = new Date(status.cutoffDate);
  const cutoffPassed = Date.now() > cutoff.getTime();
  const canEvaluate = cutoffPassed && status.ordersCount > 0;

  return (
    <div className="mt-3 border-t border-border/50 pt-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Misión 300</span>
          <p className="text-sm mt-0.5">
            <strong>{status.totalPersonas}</strong> / {status.goal} personas · {status.ordersCount} orden(es) con abono pendiente de resolver
            · vence {formatChileShortDate(cutoff)}
          </p>
        </div>
        {!confirming ? (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setConfirming(true)}
            disabled={!canEvaluate}
            title={!cutoffPassed ? 'Se habilita al pasar la fecha límite' : status.ordersCount === 0 ? 'Todavía no hay órdenes con abono aprobado' : undefined}
          >
            Evaluar Misión 300
          </Button>
        ) : (
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              {status.wouldSucceed ? `Se cumple la meta: se van a generar tickets con QR para las ${status.ordersCount} órdenes.` : `No se cumple: se va a pedir la diferencia por email a las ${status.ordersCount} órdenes.`}
            </span>
            <WriteButton size="sm" onClick={() => { evaluate.mutate({ eventId }); setConfirming(false); }} disabled={evaluate.isPending}>Confirmar</WriteButton>
            <Button variant="outline" size="sm" onClick={() => setConfirming(false)}>Cancelar</Button>
          </div>
        )}
      </div>
      {!cutoffPassed && (
        <p className="text-xs text-muted-foreground mt-1">Todavía no llega la fecha límite — evaluar antes de tiempo cobraría de más a quien compró recién.</p>
      )}
    </div>
  );
}

function EventsManager() {
  const { data: eventsData, refetch } = trpc.events.listAll.useQuery();
  const createEvent = trpc.events.create.useMutation({ onSuccess: () => { refetch(); toast.success('Evento creado'); }, onError: onMutationError });
  const deleteEvent = trpc.events.delete.useMutation({ onSuccess: () => refetch(), onError: onMutationError });
  const updateEvent = trpc.events.update.useMutation({ onSuccess: () => { refetch(); toast.success('Evento actualizado'); }, onError: onMutationError });
  const utils = trpc.useUtils();
  const createTicketType = trpc.events.createTicketType.useMutation({ onSuccess: () => { utils.events.listTicketTypes.invalidate(); toast.success('Entrada creada'); }, onError: onMutationError });
  const updateTicketType = trpc.events.updateTicketType.useMutation({ onSuccess: () => { utils.events.listTicketTypes.invalidate(); toast.success('Entrada actualizada'); }, onError: onMutationError });

  const [newEvent, setNewEvent] = useState({
    title: '', slug: '', description: '', shortDescription: '', venue: '', address: '', mapsUrl: '', eventDate: '', doorsOpen: '',
    status: 'draft' as 'draft' | 'published' | 'soldout' | 'cancelled' | 'past', imageUrl: '', featured: false, missionForceClosed: false, ivaApplies: false,
  });
  const emptyTicketForm = { eventId: 0, name: '', category: 'acceso' as 'acceso' | 'extra', accesoSlug: '' as '' | AccesoSlug, price: 0, totalStock: 0, description: '', costPrice: 0, color: '', internalCode: '' };
  const [newTicket, setNewTicket] = useState(emptyTicketForm);
  const [showEventForm, setShowEventForm] = useState(false);
  const [showTicketForm, setShowTicketForm] = useState(false);
  const [editingEventId, setEditingEventId] = useState<number | null>(null);
  const [editingTicketId, setEditingTicketId] = useState<number | null>(null);

  const events = eventsData ?? [];

  const handleCreateEvent = async () => {
    if (!newEvent.title || !newEvent.slug || !newEvent.eventDate) return;
    const payload = {
      ...newEvent,
      featured: newEvent.featured ? 1 : 0,
      missionForceClosed: newEvent.missionForceClosed ? 1 : 0,
      ivaApplies: newEvent.ivaApplies ? 1 : 0,
      eventDate: fromChileInputValue(newEvent.eventDate),
      doorsOpen: fromChileInputValue(newEvent.doorsOpen),
    };
    if (editingEventId) {
      await updateEvent.mutateAsync({ id: editingEventId, ...payload });
      setEditingEventId(null);
    } else {
      await createEvent.mutateAsync(payload);
    }
    setNewEvent({ title: '', slug: '', description: '', shortDescription: '', venue: '', address: '', mapsUrl: '', eventDate: '', doorsOpen: '', status: 'draft', imageUrl: '', featured: false, missionForceClosed: false, ivaApplies: false });
    setShowEventForm(false);
  };

  const handleCreateTicketType = async () => {
    if (!newTicket.eventId || !newTicket.name || !newTicket.price) return;
    const payload = {
      ...newTicket,
      accesoSlug: newTicket.category === 'extra' ? undefined : (newTicket.accesoSlug || undefined),
      costPrice: newTicket.costPrice || undefined,
      color: newTicket.category === 'extra' ? (newTicket.color || undefined) : undefined,
      internalCode: newTicket.category === 'extra' ? (newTicket.internalCode || undefined) : undefined,
    };
    if (editingTicketId) {
      const { eventId, ...data } = payload;
      await updateTicketType.mutateAsync({ id: editingTicketId, ...data });
      setEditingTicketId(null);
    } else {
      await createTicketType.mutateAsync(payload);
    }
    setNewTicket(emptyTicketForm);
    setShowTicketForm(false);
  };

  const handleEditTicketType = (tt: any) => {
    setEditingTicketId(tt.id);
    setNewTicket({
      eventId: tt.eventId, name: tt.name, category: tt.category || 'acceso', accesoSlug: tt.accesoSlug || '',
      price: Number(tt.price), totalStock: tt.totalStock, description: tt.description || '',
      costPrice: tt.costPrice ? Number(tt.costPrice) : 0, color: tt.color || '', internalCode: tt.internalCode || '',
    });
    setShowTicketForm(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="font-heading text-2xl">Eventos</h2>
        <Button onClick={() => setShowEventForm(!showEventForm)} className="interactive">
          <Plus className="w-4 h-4 mr-2" /> Nuevo Evento
        </Button>
      </div>

      {showEventForm && (
        <Card className="rounded-2xl border-0 shadow-md shadow-black/5">
          <CardContent className="pt-6 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div><Label>Título</Label><Input value={newEvent.title} onChange={(e) => setNewEvent({ ...newEvent, title: e.target.value })} className="mt-1" /></div>
              <div><Label>Slug (URL)</Label><Input value={newEvent.slug} onChange={(e) => setNewEvent({ ...newEvent, slug: e.target.value })} className="mt-1" /></div>
              <div><Label>Venue</Label><Input value={newEvent.venue} onChange={(e) => setNewEvent({ ...newEvent, venue: e.target.value })} className="mt-1" /></div>
              <div><Label>Dirección</Label><Input value={newEvent.address} onChange={(e) => setNewEvent({ ...newEvent, address: e.target.value })} className="mt-1" /></div>
              <div><Label>Link de Google Maps</Label><Input value={newEvent.mapsUrl} onChange={(e) => setNewEvent({ ...newEvent, mapsUrl: e.target.value })} className="mt-1" placeholder="https://maps.app.goo.gl/..." /></div>
              <div><Label>Fecha del evento</Label><Input type="datetime-local" value={newEvent.eventDate} onChange={(e) => setNewEvent({ ...newEvent, eventDate: e.target.value })} className="mt-1" /></div>
              <div><Label>Apertura de puertas</Label><Input type="datetime-local" value={newEvent.doorsOpen} onChange={(e) => setNewEvent({ ...newEvent, doorsOpen: e.target.value })} className="mt-1" /></div>
            </div>
            <div><Label>Descripción corta</Label><Input value={newEvent.shortDescription} onChange={(e) => setNewEvent({ ...newEvent, shortDescription: e.target.value })} className="mt-1" /></div>
            <div><Label>Descripción completa</Label><textarea value={newEvent.description} onChange={(e) => setNewEvent({ ...newEvent, description: e.target.value })} className="mt-1 w-full h-24 bg-input border border-border rounded-md p-2 text-foreground" /></div>
            <div><Label>URL del flyer/imagen</Label><Input value={newEvent.imageUrl} onChange={(e) => setNewEvent({ ...newEvent, imageUrl: e.target.value })} className="mt-1" placeholder="https://..." /></div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
              <div>
                <Label>Estado</Label>
                <Select value={newEvent.status} onValueChange={(v) => setNewEvent({ ...newEvent, status: v as any })}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">Borrador (oculto)</SelectItem>
                    <SelectItem value="published">Publicado (próximo)</SelectItem>
                    <SelectItem value="soldout">Agotado</SelectItem>
                    <SelectItem value="past">Pasado (aparece en blanco y negro)</SelectItem>
                    <SelectItem value="cancelled">Cancelado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <label className="flex items-center gap-2 mb-1 cursor-pointer select-none">
                <input type="checkbox" checked={newEvent.featured} onChange={(e) => setNewEvent({ ...newEvent, featured: e.target.checked })} className="w-4 h-4 accent-primary" />
                <span className="text-sm">Destacar como próximo evento</span>
              </label>
              <label className="flex items-center gap-2 mb-1 cursor-pointer select-none">
                <input type="checkbox" checked={newEvent.missionForceClosed} onChange={(e) => setNewEvent({ ...newEvent, missionForceClosed: e.target.checked })} className="w-4 h-4 accent-primary" />
                <span className="text-sm">Cerrar Misión 300 (cobrar valor general ya)</span>
              </label>
              <label className="flex items-center gap-2 mb-1 cursor-pointer select-none">
                <input type="checkbox" checked={newEvent.ivaApplies} onChange={(e) => setNewEvent({ ...newEvent, ivaApplies: e.target.checked })} className="w-4 h-4 accent-primary" />
                <span className="text-sm">Este evento se declara al SII (IVA 19%)</span>
              </label>
            </div>
            <div className="flex gap-2">
              <WriteButton onClick={handleCreateEvent} disabled={createEvent.isPending || updateEvent.isPending}>
                {editingEventId ? 'Guardar Cambios' : 'Crear Evento'}
              </WriteButton>
              <Button variant="outline" onClick={() => setShowEventForm(false)}>Cancelar</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="space-y-4">
        {events.map((event: any) => (
          <Card key={event.id}>
            <CardContent className="pt-6">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="font-semibold text-lg">{event.title}</h3>
                  <p className="text-muted-foreground text-sm">/{event.slug} | {event.status} | {new Date(event.eventDate).toLocaleDateString('es-CL', { timeZone: 'America/Santiago' })}</p>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => {
                    setEditingEventId(event.id);
                    setNewEvent({
                      title: event.title, slug: event.slug, description: event.description || '',
                      shortDescription: event.shortDescription || '', venue: event.venue || '',
                      address: event.address || '',
                      mapsUrl: event.mapsUrl || '',
                      eventDate: toChileInputValue(event.eventDate),
                      doorsOpen: toChileInputValue(event.doorsOpen),
                      status: event.status || 'draft',
                      imageUrl: event.imageUrl || '',
                      featured: !!event.featured,
                      missionForceClosed: !!event.missionForceClosed,
                      ivaApplies: !!event.ivaApplies,
                    });
                    setShowEventForm(true);
                  }}>
                    <Edit className="w-3 h-3" />
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => { setEditingTicketId(null); setNewTicket({ ...emptyTicketForm, eventId: event.id }); setShowTicketForm(true); }}>
                    <Plus className="w-3 h-3 mr-1" /> Entrada
                  </Button>
                  <ConfirmDeleteButton description={`Vas a eliminar el evento "${event.title}" completo, con todas sus entradas.`} onConfirm={() => deleteEvent.mutateAsync({ id: event.id })} />
                </div>
              </div>
              <TicketTypesList eventId={event.id} onEdit={handleEditTicketType} />
              <Mission300Panel eventId={event.id} />
              {showTicketForm && newTicket.eventId === event.id && (
                <div className="mt-4 border-t border-border/50 pt-4 space-y-4">
                  <h4 className="font-semibold text-sm">{editingTicketId ? 'Editar Tipo de Entrada' : 'Nuevo Tipo de Entrada'}</h4>
                  <div>
                    <Label>Categoría</Label>
                    <Select value={newTicket.category} onValueChange={(v) => setNewTicket({ ...newTicket, category: v as 'acceso' | 'extra', accesoSlug: v === 'extra' ? '' : newTicket.accesoSlug })}>
                      <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="acceso">Acceso principal (Dúo, Soltera, Trío…)</SelectItem>
                        <SelectItem value="extra">Extra (estacionamiento, cover, etc.)</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground mt-1">Los extras aparecen solos en el paso de extras del checkout, para cualquier evento — no hace falta tocar código.</p>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div><Label>Nombre</Label><Input value={newTicket.name} onChange={(e) => setNewTicket({ ...newTicket, name: e.target.value })} className="mt-1" placeholder="VIP, General..." /></div>
                    <div><Label>Precio (CLP)</Label><Input type="number" value={newTicket.price} onChange={(e) => setNewTicket({ ...newTicket, price: Number(e.target.value) })} className="mt-1" /></div>
                    <div><Label>Stock Total</Label><Input type="number" value={newTicket.totalStock} onChange={(e) => setNewTicket({ ...newTicket, totalStock: Number(e.target.value) })} className="mt-1" /></div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <Label>Costo (CLP)</Label>
                      <Input type="number" value={newTicket.costPrice} onChange={(e) => setNewTicket({ ...newTicket, costPrice: Number(e.target.value) })} className="mt-1" placeholder="Opcional, para márgenes" />
                    </div>
                    {newTicket.category === 'extra' && (
                      <>
                        <div>
                          <Label>Código interno (canje)</Label>
                          <Input value={newTicket.internalCode} onChange={(e) => setNewTicket({ ...newTicket, internalCode: e.target.value.toUpperCase() })} className="mt-1" placeholder="PIS, LOC..." maxLength={6} />
                        </div>
                        <div>
                          <Label>Color (grilla de caja)</Label>
                          <Input type="color" value={newTicket.color || '#f472b6'} onChange={(e) => setNewTicket({ ...newTicket, color: e.target.value })} className="mt-1 h-10" />
                        </div>
                      </>
                    )}
                  </div>
                  {newTicket.category === 'extra' && (
                    <p className="text-xs text-muted-foreground -mt-2">El código interno es el prefijo del código de canje que recibe el comprador (ej. PIS-8F3K-29LX). Si se deja vacío, se genera uno automático a partir del nombre.</p>
                  )}
                  {newTicket.category === 'acceso' && (
                    <div>
                      <Label>Tipo de acceso (conecta con la pregunta del checkout)</Label>
                      <Select value={newTicket.accesoSlug} onValueChange={(v) => setNewTicket({ ...newTicket, accesoSlug: v as AccesoSlug })}>
                        <SelectTrigger className="mt-1"><SelectValue placeholder="Elegir…" /></SelectTrigger>
                        <SelectContent>
                          {ACCESO_SLUG_OPTIONS.map((o) => (
                            <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground mt-1">Sin esto, la gente no va a poder comprar esta entrada desde el checkout.</p>
                    </div>
                  )}
                  <div><Label>Descripción</Label><Input value={newTicket.description} onChange={(e) => setNewTicket({ ...newTicket, description: e.target.value })} className="mt-1" /></div>
                  <div className="flex gap-2">
                    <WriteButton onClick={handleCreateTicketType} disabled={createTicketType.isPending || updateTicketType.isPending}>
                      {editingTicketId ? 'Guardar Cambios' : 'Crear Entrada'}
                    </WriteButton>
                    <Button variant="outline" onClick={() => { setShowTicketForm(false); setEditingTicketId(null); setNewTicket(emptyTicketForm); }}>Cancelar</Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function DiscountsManager() {
  const { data: discountsData, refetch } = trpc.discounts.listAll.useQuery();
  const createDiscount = trpc.discounts.create.useMutation({ onSuccess: () => { refetch(); toast.success('Código de descuento creado'); }, onError: onMutationError });
  const deleteDiscount = trpc.discounts.delete.useMutation({ onSuccess: () => refetch(), onError: onMutationError });

  const [newDiscount, setNewDiscount] = useState({
    code: '', description: '', discountType: 'percentage' as 'percentage' | 'fixed', discountValue: 0, maxUses: 0, validUntil: '',
  });
  const [showForm, setShowForm] = useState(false);

  const discounts = discountsData ?? [];

  const handleCreate = async () => {
    if (!newDiscount.code || !newDiscount.discountValue) return;
    try {
      await createDiscount.mutateAsync({
        ...newDiscount,
        maxUses: newDiscount.maxUses || undefined,
        validUntil: newDiscount.validUntil ? fromChileInputValue(newDiscount.validUntil) : undefined,
      });
      setNewDiscount({ code: '', description: '', discountType: 'percentage', discountValue: 0, maxUses: 0, validUntil: '' });
      setShowForm(false);
    } catch {
      // el toast de error ya lo muestra onMutationError; dejamos el formulario abierto para reintentar
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="font-heading text-2xl">Códigos de Descuento</h2>
        <Button onClick={() => setShowForm(!showForm)} className="interactive"><Plus className="w-4 h-4 mr-2" /> Nuevo Código</Button>
      </div>

      {showForm && (
        <Card className="rounded-2xl border-0 shadow-md shadow-black/5">
          <CardContent className="pt-6 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div><Label>Código</Label><Input value={newDiscount.code} onChange={(e) => setNewDiscount({ ...newDiscount, code: e.target.value.toUpperCase() })} className="mt-1" /></div>
              <div>
                <Label>Tipo</Label>
                <Select value={newDiscount.discountType} onValueChange={(v) => setNewDiscount({ ...newDiscount, discountType: v as any })}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="percentage">Porcentaje</SelectItem>
                    <SelectItem value="fixed">Monto Fijo</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Valor</Label><Input type="number" value={newDiscount.discountValue} onChange={(e) => setNewDiscount({ ...newDiscount, discountValue: Number(e.target.value) })} className="mt-1" /></div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div><Label>Usos máximos</Label><Input type="number" value={newDiscount.maxUses} onChange={(e) => setNewDiscount({ ...newDiscount, maxUses: Number(e.target.value) })} className="mt-1" /></div>
              <div><Label>Válido hasta</Label><Input type="datetime-local" value={newDiscount.validUntil} onChange={(e) => setNewDiscount({ ...newDiscount, validUntil: e.target.value })} className="mt-1" /></div>
            </div>
            <div className="flex gap-2">
              <WriteButton onClick={handleCreate}>Crear Código</WriteButton>
              <Button variant="outline" onClick={() => setShowForm(false)}>Cancelar</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        {discounts.map((d: any) => (
          <Card key={d.id}>
            <CardContent className="pt-4 flex justify-between items-center">
              <div>
                <span className="font-mono font-bold text-primary">{d.code}</span>
                <span className="text-muted-foreground text-sm ml-3">
                  {d.discountType === 'percentage' ? `${d.discountValue}%` : `$${Number(d.discountValue).toLocaleString('es-CL')}`}
                </span>
                <span className="text-muted-foreground text-sm ml-3">Usos: {d.usedCount}/{d.maxUses || '∞'}</span>
              </div>
              <div className="flex gap-2">
                <a
                  href={`https://wa.me/?text=${encodeURIComponent(`Usa mi código ${d.code} para comprar tu entrada a Candyland en Mansion Playroom 🍭 ${window.location.origin}`)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Button variant="outline" size="sm" className="text-primary">
                    <MessageCircle className="w-3 h-3" />
                  </Button>
                </a>
                <ConfirmDeleteButton description={`Vas a eliminar el código de descuento "${d.code}".`} onConfirm={() => deleteDiscount.mutateAsync({ id: d.id })} />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function CommunityCodesManager() {
  const { data: codesData, refetch } = trpc.communityCodes.listAll.useQuery();
  const createCode = trpc.communityCodes.create.useMutation({ onSuccess: () => { refetch(); toast.success('Código creado'); }, onError: onMutationError });
  const deleteCode = trpc.communityCodes.delete.useMutation({ onSuccess: () => refetch(), onError: onMutationError });
  const updateCode = trpc.communityCodes.update.useMutation({ onSuccess: () => refetch(), onError: onMutationError });

  const [newCode, setNewCode] = useState({ code: '', label: '', maxUses: 0 });
  const [showForm, setShowForm] = useState(false);

  const codes = codesData ?? [];

  const handleCreate = async () => {
    if (!newCode.code) return;
    try {
      await createCode.mutateAsync({ ...newCode, maxUses: newCode.maxUses || undefined });
      setNewCode({ code: '', label: '', maxUses: 0 });
      setShowForm(false);
    } catch {
      // el toast de error ya lo muestra onMutationError; dejamos el formulario abierto para reintentar
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="font-heading text-2xl">Códigos Comunidad</h2>
          <p className="text-muted-foreground text-sm mt-1">Desbloquean el acceso Soltero y Dúo Dos Hombres en el checkout — no aplican descuento, solo validan pertenencia a la comunidad.</p>
        </div>
        <Button onClick={() => setShowForm(!showForm)} className="interactive"><Plus className="w-4 h-4 mr-2" /> Nuevo Código</Button>
      </div>

      {showForm && (
        <Card className="rounded-2xl border-0 shadow-md shadow-black/5">
          <CardContent className="pt-6 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div><Label>Código</Label><Input value={newCode.code} onChange={(e) => setNewCode({ ...newCode, code: e.target.value.toUpperCase() })} className="mt-1" /></div>
              <div><Label>Etiqueta (opcional)</Label><Input value={newCode.label} onChange={(e) => setNewCode({ ...newCode, label: e.target.value })} className="mt-1" placeholder="Ej: Grupo WhatsApp Playroom" /></div>
              <div><Label>Usos máximos</Label><Input type="number" value={newCode.maxUses} onChange={(e) => setNewCode({ ...newCode, maxUses: Number(e.target.value) })} className="mt-1" /></div>
            </div>
            <div className="flex gap-2">
              <WriteButton onClick={handleCreate}>Crear Código</WriteButton>
              <Button variant="outline" onClick={() => setShowForm(false)}>Cancelar</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        {codes.map((c: any) => (
          <Card key={c.id}>
            <CardContent className="pt-4 flex justify-between items-center">
              <div>
                <span className="font-mono font-bold text-primary">{c.code}</span>
                {c.label && <span className="text-muted-foreground text-sm ml-3">{c.label}</span>}
                <span className="text-muted-foreground text-sm ml-3">Usos: {c.usedCount}/{c.maxUses || '∞'}</span>
                <span className={`text-xs ml-3 px-2 py-0.5 rounded-full ${c.isActive ? 'bg-green-500/20 text-green-400' : 'bg-muted text-muted-foreground'}`}>{c.isActive ? 'Activo' : 'Inactivo'}</span>
              </div>
              <div className="flex gap-2">
                <WriteButton variant="outline" size="sm" onClick={() => updateCode.mutateAsync({ id: c.id, isActive: c.isActive ? 0 : 1 })}>
                  {c.isActive ? 'Desactivar' : 'Activar'}
                </WriteButton>
                <a
                  href={`https://wa.me/?text=${encodeURIComponent(`Usa mi código ${c.code} para comprar tu entrada a Candyland en Mansion Playroom 🍭 ${window.location.origin}`)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Button variant="outline" size="sm" className="text-primary">
                    <MessageCircle className="w-3 h-3" />
                  </Button>
                </a>
                <ConfirmDeleteButton description={`Vas a eliminar el código de comunidad "${c.code}".`} onConfirm={() => deleteCode.mutateAsync({ id: c.id })} />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

/** Lista de bloqueo por RUT: si el RUT del comprador o de algún acompañante
 * coincide (exacto, normalizado), el checkout rechaza la compra antes de
 * crear la orden (ver createOrder, server/db.ts). El nombre acá es solo
 * referencia para reconocer a quién corresponde cada RUT -- el bloqueo
 * nunca matchea por nombre, para no bloquear a un homónimo por error. */
function BlockedCustomersManager() {
  const { data: blockedData, refetch } = trpc.blockedCustomers.listAll.useQuery();
  const createBlocked = trpc.blockedCustomers.create.useMutation({ onSuccess: () => { refetch(); toast.success('Cliente bloqueado'); }, onError: onMutationError });
  const deleteBlocked = trpc.blockedCustomers.delete.useMutation({ onSuccess: () => refetch(), onError: onMutationError });
  const updateBlocked = trpc.blockedCustomers.update.useMutation({ onSuccess: () => refetch(), onError: onMutationError });

  const [newBlocked, setNewBlocked] = useState({ rut: '', fullName: '', reason: '' });
  const [showForm, setShowForm] = useState(false);

  const blocked = blockedData ?? [];

  const handleCreate = async () => {
    if (!newBlocked.rut.trim()) return;
    if (!isValidRut(newBlocked.rut)) { toast.error('RUT inválido — revisa el formato (12.345.678-9)'); return; }
    try {
      await createBlocked.mutateAsync({
        rut: newBlocked.rut,
        fullName: newBlocked.fullName || undefined,
        reason: newBlocked.reason || undefined,
      });
      setNewBlocked({ rut: '', fullName: '', reason: '' });
      setShowForm(false);
    } catch {
      // el toast de error ya lo muestra onMutationError; dejamos el formulario abierto para reintentar
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="font-heading text-2xl">Bloqueo de Clientes</h2>
          <p className="text-muted-foreground text-sm mt-1">Impide comprar entradas por RUT — se revisa el comprador y cada acompañante. El nombre es solo referencia, el bloqueo no matchea por nombre para evitar bloquear a un homónimo.</p>
        </div>
        <Button onClick={() => setShowForm(!showForm)} className="interactive"><Plus className="w-4 h-4 mr-2" /> Bloquear RUT</Button>
      </div>

      {showForm && (
        <Card className="rounded-2xl border-0 shadow-md shadow-black/5">
          <CardContent className="pt-6 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div><Label>RUT</Label><Input value={newBlocked.rut} onChange={(e) => setNewBlocked({ ...newBlocked, rut: e.target.value })} className="mt-1" placeholder="12.345.678-9" /></div>
              <div><Label>Nombre (opcional, solo referencia)</Label><Input value={newBlocked.fullName} onChange={(e) => setNewBlocked({ ...newBlocked, fullName: e.target.value })} className="mt-1" /></div>
              <div><Label>Motivo (opcional)</Label><Input value={newBlocked.reason} onChange={(e) => setNewBlocked({ ...newBlocked, reason: e.target.value })} className="mt-1" /></div>
            </div>
            <div className="flex gap-2">
              <WriteButton onClick={handleCreate}>Bloquear</WriteButton>
              <Button variant="outline" onClick={() => setShowForm(false)}>Cancelar</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        {blocked.length === 0 && <p className="text-muted-foreground text-sm">No hay clientes bloqueados.</p>}
        {blocked.map((b: any) => (
          <Card key={b.id}>
            <CardContent className="pt-4 flex justify-between items-center">
              <div>
                <span className="font-mono font-bold text-destructive">{b.rut}</span>
                {b.fullName && <span className="text-muted-foreground text-sm ml-3">{b.fullName}</span>}
                {b.reason && <span className="text-muted-foreground text-sm ml-3">— {b.reason}</span>}
                <span className={`text-xs ml-3 px-2 py-0.5 rounded-full ${b.isActive ? 'bg-red-500/20 text-red-400' : 'bg-muted text-muted-foreground'}`}>{b.isActive ? 'Bloqueado' : 'Inactivo'}</span>
              </div>
              <div className="flex gap-2">
                <WriteButton variant="outline" size="sm" onClick={() => updateBlocked.mutateAsync({ id: b.id, isActive: b.isActive ? 0 : 1 })}>
                  {b.isActive ? 'Desactivar' : 'Reactivar'}
                </WriteButton>
                <ConfirmDeleteButton description={`Vas a eliminar el bloqueo del RUT "${b.rut}".`} onConfirm={() => deleteBlocked.mutateAsync({ id: b.id })} />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

/** Tarjeta de estadística con ícono en badge circular de color (estilo de
 * las referencias mandadas: número grande + badge de color, sin borde duro). */
function StatCard({ icon: Icon, colorClass, value, label }: { icon: typeof DollarSign; colorClass: string; value: string | number; label: string }) {
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

/** Accesos manuales desde /admin (pedido explícito del usuario): invitaciones
 * gratis o accesos ya pagados por transferencia/efectivo directo, sin pasar
 * por Mercado Pago -- mismos datos que pide el checkout público y el mismo
 * mail final con QR (server/routers.ts orders.createManual reusa
 * confirmFreeOrder, igual que el checkout con descuento 100%). */
function ManualAccessSection() {
  const { data: eventsData } = trpc.events.listAll.useQuery();
  const events = eventsData ?? [];
  const [eventSlug, setEventSlug] = useState('');
  const selectedEvent = events.find((e: any) => e.slug === eventSlug);

  const { data: ticketTypesData } = trpc.events.listTicketTypes.useQuery(
    { eventId: selectedEvent?.id ?? 0 },
    { enabled: !!selectedEvent }
  );
  const ticketTypesList = ticketTypesData ?? [];
  const accesoTypes = ticketTypesList.filter((t: any) => t.category === 'acceso');
  const extraTypes = ticketTypesList.filter((t: any) => t.category === 'extra');

  const [quantities, setQuantities] = useState<Record<number, number>>({});
  // Precio propio por tipo de entrada cuando kind==='paid' (pedido explícito
  // del usuario: cobra montos distintos según el caso y el precio de
  // catálogo no siempre es el que realmente recibió) -- si no se edita, se
  // usa el precio de catálogo/abono Misión 300 por defecto.
  const [prices, setPrices] = useState<Record<number, number>>({});
  const [buyerName, setBuyerName] = useState('');
  const [buyerEmail, setBuyerEmail] = useState('');
  const [buyerPhone, setBuyerPhone] = useState('');
  const [buyerRut, setBuyerRut] = useState('');
  const [buyerInstagram, setBuyerInstagram] = useState('');
  const [companionNamesText, setCompanionNamesText] = useState('');
  const [kind, setKind] = useState<'invitation' | 'paid'>('invitation');
  const [paymentMethod, setPaymentMethod] = useState('Transferencia');

  const createManual = trpc.orders.createManual.useMutation();
  const { data: historyData, refetch: refetchHistory } = trpc.orders.listManual.useQuery();
  const history = historyData ?? [];

  const missionOpen = selectedEvent ? isMissionActiveForEvent(selectedEvent) : false;

  // Precio de catálogo por defecto (abono Misión 300 si corresponde, si no
  // el precio de lista) -- lo que se usa mientras el admin no lo edite.
  const defaultUnitPrice = (tt: any) => {
    const useDeposit = missionOpen && tt.category === 'acceso';
    return useDeposit ? missionDepositPrice(tt.accesoSlug) : Number(tt.price);
  };

  const items = Object.entries(quantities)
    .filter(([, qty]) => qty > 0)
    .map(([id, qty]) => {
      const ticketTypeId = Number(id);
      const tt = ticketTypesList.find((t: any) => t.id === ticketTypeId);
      return {
        ticketTypeId,
        quantity: qty,
        unitPrice: kind === 'paid' ? (prices[ticketTypeId] ?? (tt ? defaultUnitPrice(tt) : 0)) : undefined,
      };
    });

  const total = kind === 'invitation' ? 0 : items.reduce((sum, item) => sum + (item.unitPrice ?? 0) * item.quantity, 0);

  const resetForm = () => {
    setQuantities({});
    setPrices({});
    setBuyerName(''); setBuyerEmail(''); setBuyerPhone(''); setBuyerRut(''); setBuyerInstagram('');
    setCompanionNamesText('');
    setKind('invitation');
    setPaymentMethod('Transferencia');
  };

  const canSubmit = !!selectedEvent && items.length > 0 && buyerName.trim().length > 0 && /\S+@\S+\.\S+/.test(buyerEmail) && (kind === 'invitation' || paymentMethod.trim().length > 0);

  const handleSubmit = async () => {
    // Mismas claves que arma el checkout público en attendeeData.campos --
    // "rut"/"instagram" es lo que lee upsertCustomerFromOrder para completar
    // la ficha del cliente, y cualquier clave que contenga "nombre" es lo que
    // parseAttendeeNames muestra como acompañantes en el mail.
    const campos: Record<string, string> = { nombre: buyerName };
    if (buyerRut.trim()) campos.rut = buyerRut.trim();
    if (buyerInstagram.trim()) campos.instagram = buyerInstagram.trim();
    companionNamesText.split('\n').map((s) => s.trim()).filter(Boolean).forEach((name, i) => {
      campos[`acomp${i + 1}_nombre`] = name;
    });

    try {
      const result = await createManual.mutateAsync({
        eventSlug,
        buyerName: buyerName.trim(),
        buyerEmail: buyerEmail.trim(),
        buyerPhone: buyerPhone.trim() || undefined,
        items,
        kind,
        paymentMethod: kind === 'paid' ? paymentMethod.trim() : undefined,
        attendeeData: JSON.stringify({ campos }),
      });
      toast.success(`Acceso creado y mail enviado -- orden ${result.orderNumber}.`);
      resetForm();
      refetchHistory();
    } catch (err) {
      onMutationError(err);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-heading text-2xl">Accesos Manuales</h2>
        <p className="text-sm text-muted-foreground">Invitaciones gratis o accesos ya pagados por transferencia/efectivo, sin pasar por Mercado Pago -- se manda el mismo mail con el ticket y QR.</p>
      </div>

      {selectedEvent && (
        <div className="flex flex-col sm:flex-row gap-3">
          <InstantInviteButton eventSlug={eventSlug} />
          <StaffCompButton eventSlug={eventSlug} products={ticketTypesList.filter((t: any) => ['consumo', 'locker', 'merch'].includes(t.category))} />
        </div>
      )}

      <Card className="rounded-2xl border-0 shadow-md shadow-black/5">
        <CardContent className="pt-6 space-y-4">
          <div className="space-y-2 max-w-md">
            <Label>Evento</Label>
            <Select value={eventSlug} onValueChange={(v) => { setEventSlug(v); setQuantities({}); }}>
              <SelectTrigger><SelectValue placeholder="Elige un evento" /></SelectTrigger>
              <SelectContent>
                {events.map((e: any) => <SelectItem key={e.id} value={e.slug}>{e.title}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {selectedEvent && (
            <div className="space-y-3">
              <Label>Tipos de entrada</Label>
              {accesoTypes.length === 0 && extraTypes.length === 0 && (
                <p className="text-sm text-muted-foreground">Este evento todavía no tiene tipos de entrada cargados.</p>
              )}
              {[{ label: 'Accesos', list: accesoTypes }, { label: 'Extras', list: extraTypes }].map(({ label, list }) => list.length > 0 && (
                <div key={label} className="space-y-1.5">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</p>
                  {list.map((tt: any) => {
                    const available = tt.totalStock - tt.soldCount;
                    const useDeposit = missionOpen && tt.category === 'acceso';
                    return (
                      <div key={tt.id} className="flex items-center gap-3 rounded-lg border border-border/50 px-3 py-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">
                            {tt.name}
                            {tt.status !== 'active' && <span className="ml-2 text-xs px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">{tt.status === 'soldout' ? 'Agotado' : 'Oculto'}</span>}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {kind === 'invitation' ? 'Gratis (invitación)' : `Catálogo: $${defaultUnitPrice(tt).toLocaleString('es-CL')}${useDeposit ? ' (abono Misión 300)' : ''}`} · {available} disponibles
                          </p>
                        </div>
                        {kind === 'paid' && (
                          <div className="space-y-1">
                            <Label className="text-[10px] text-muted-foreground">Precio a cobrar</Label>
                            <Input
                              type="number" min={0}
                              value={prices[tt.id] ?? defaultUnitPrice(tt)}
                              onChange={(e) => setPrices((prev) => ({ ...prev, [tt.id]: Math.max(0, Number(e.target.value) || 0) }))}
                              className="w-28 text-center"
                            />
                          </div>
                        )}
                        <div className="space-y-1">
                          <Label className="text-[10px] text-muted-foreground">Cantidad</Label>
                          <Input
                            type="number" min={0} max={Math.max(0, available)}
                            value={quantities[tt.id] ?? ''}
                            onChange={(e) => setQuantities((prev) => ({ ...prev, [tt.id]: Math.max(0, Number(e.target.value) || 0) }))}
                            className="w-20 text-center"
                            placeholder="0"
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Nombre completo</Label>
              <Input value={buyerName} onChange={(e) => setBuyerName(e.target.value)} placeholder="Nombre de quien recibe el acceso" />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input type="email" value={buyerEmail} onChange={(e) => setBuyerEmail(e.target.value)} placeholder="A donde llega el ticket" />
            </div>
            <div className="space-y-2">
              <Label>WhatsApp (opcional)</Label>
              <Input value={buyerPhone} onChange={(e) => setBuyerPhone(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>RUT (opcional)</Label>
              <Input value={buyerRut} onChange={(e) => setBuyerRut(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Instagram (opcional)</Label>
              <Input value={buyerInstagram} onChange={(e) => setBuyerInstagram(e.target.value)} />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Nombres de acompañantes (opcional, uno por línea)</Label>
            <Textarea value={companionNamesText} onChange={(e) => setCompanionNamesText(e.target.value)} className="min-h-16" placeholder={'Juan Pérez\nMaría González'} />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Tipo de acceso</Label>
              <Select value={kind} onValueChange={(v) => setKind(v as 'invitation' | 'paid')}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="invitation">Invitación gratis</SelectItem>
                  <SelectItem value="paid">Ya pagado (transferencia/efectivo)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {kind === 'paid' && (
              <div className="space-y-2">
                <Label>Método de pago</Label>
                <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Transferencia">Transferencia</SelectItem>
                    <SelectItem value="Efectivo">Efectivo</SelectItem>
                    <SelectItem value="Otro">Otro</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between rounded-xl border border-border/50 px-4 py-3">
            <span className="text-sm text-muted-foreground">Total a registrar</span>
            <span className="font-heading text-xl">{kind === 'invitation' ? 'Gratis' : `$${total.toLocaleString('es-CL')}`}</span>
          </div>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button type="button" disabled={!canSubmit || createManual.isPending} className="w-full interactive">
                <Gift className="w-4 h-4 mr-2" /> {createManual.isPending ? 'Creando…' : 'Crear acceso y mandar mail'}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>¿Crear este acceso?</AlertDialogTitle>
                <AlertDialogDescription>
                  Se va a mandar un mail real a {buyerEmail} con el ticket y el QR de {selectedEvent?.title}. Esta acción no se puede deshacer.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={handleSubmit}>Sí, crear y mandar</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardContent>
      </Card>

      <div>
        <h3 className="font-heading text-lg mb-3">Historial</h3>
        <div className="rounded-lg border border-border/50 divide-y">
          {history.map((o: any) => (
            <div key={o.id} className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm">
              <div className="min-w-0">
                <p className="font-medium truncate">{o.buyerName} · {o.eventTitle}</p>
                <p className="text-xs text-muted-foreground truncate">{o.buyerEmail} · {o.paymentMethod?.replace('Manual: ', '')} · {new Date(o.createdAt).toLocaleDateString('es-CL', { timeZone: 'America/Santiago' })}</p>
              </div>
              <span className="text-sm font-medium whitespace-nowrap">{Number(o.total) === 0 ? 'Gratis' : `$${Number(o.total).toLocaleString('es-CL')}`}</span>
            </div>
          ))}
          {history.length === 0 && <p className="text-sm text-muted-foreground px-3 py-4">Todavía no se creó ningún acceso manual.</p>}
        </div>
      </div>

      {selectedEvent && <StaffCompHistory eventId={selectedEvent.id} />}
    </div>
  );
}

/** Historial de "Invitar consumo gratis a staff" -- visibilidad para el
 * dueño de qué se invitó y si ya se canjeó (ver createStaffComp). */
function StaffCompHistory({ eventId }: { eventId: number }) {
  const { data } = trpc.orders.listStaffComps.useQuery({ eventId });
  const comps = data ?? [];
  if (comps.length === 0) return null;

  return (
    <div>
      <h3 className="font-heading text-lg mb-3">Consumos gratis de staff</h3>
      <div className="rounded-lg border border-border/50 divide-y">
        {comps.map((c: any) => (
          <div key={c.ticketCode} className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm">
            <div className="min-w-0">
              <p className="font-medium truncate">{c.productName} · para {c.staffName}</p>
              <p className="text-xs text-muted-foreground truncate font-mono">{c.displayCode}</p>
            </div>
            <span className={`text-xs px-2 py-1 rounded-full whitespace-nowrap ${c.status === 'used' ? 'bg-muted text-muted-foreground' : 'bg-emerald-500/10 text-emerald-600'}`}>
              {c.status === 'used' ? 'Canjeado' : 'Pendiente'}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Botón "Invitación especial instantánea" (pedido explícito del usuario):
 * cero datos salvo la cantidad de personas -- para un invitado que llega a
 * la puerta sin QR. El QR queda listo al instante para mandar por WhatsApp. */
function InstantInviteButton({ eventSlug }: { eventSlug: string }) {
  const [open, setOpen] = useState(false);
  const [personas, setPersonas] = useState(1);
  const [result, setResult] = useState<{ ticketCode: string; qrImageUrl: string; personas: number } | null>(null);

  const create = trpc.orders.createInstantInvite.useMutation({
    onSuccess: (data) => setResult(data),
    onError: onMutationError,
  });

  const reset = () => { setPersonas(1); setResult(null); };

  const shareUrl = result ? `${result.qrImageUrl}` : '';

  const compartir = async () => {
    if (!result) return;
    try {
      const res = await fetch(result.qrImageUrl);
      const blob = await res.blob();
      const file = new File([blob], `invitacion-${result.ticketCode}.png`, { type: 'image/png' });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: 'Invitación especial', text: `Invitación especial para ${result.personas} persona${result.personas === 1 ? '' : 's'}` });
        return;
      }
    } catch {
      // Sin soporte de compartir archivos -- se usa el botón de descarga.
    }
    toast.info('Tu navegador no soporta compartir la imagen directo -- descárgala y compártela desde tus fotos.');
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" className="flex-1 interactive">
          <QrCode className="w-4 h-4 mr-2" /> Invitación especial instantánea
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invitación especial instantánea</DialogTitle>
        </DialogHeader>
        {!result ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Sin ningún dato más -- solo cuántas personas van a entrar con este QR. Al anfitrión en la puerta le va a aparecer "Invitación Especial" con esta cantidad.</p>
            <div className="space-y-2">
              <Label>¿Cuántas personas son?</Label>
              <Input type="number" min={1} max={20} value={personas} onChange={(e) => setPersonas(Math.min(20, Math.max(1, Number(e.target.value) || 1)))} className="w-24" />
            </div>
            <WriteButton className="w-full interactive" disabled={create.isPending} onClick={() => create.mutate({ eventSlug, personas })}>
              {create.isPending ? 'Generando…' : 'Generar QR'}
            </WriteButton>
          </div>
        ) : (
          <div className="space-y-4 text-center">
            <p className="text-sm text-muted-foreground">Acceso para {result.personas} {result.personas === 1 ? 'persona' : 'personas'}. Envíalo por WhatsApp -- se ocupa igual que cualquier otra entrada.</p>
            <img src={result.qrImageUrl} alt="QR de invitación especial" className="mx-auto w-56 h-56 rounded-xl border border-border/50" />
            <div className="flex gap-2">
              <Button type="button" className="flex-1 interactive" onClick={compartir}>
                <Share2 className="w-4 h-4 mr-2" /> Compartir por WhatsApp
              </Button>
              <a href={shareUrl} download={`invitacion-${result.ticketCode}.png`} className="flex-1">
                <Button type="button" variant="outline" className="w-full interactive">
                  <Download className="w-4 h-4 mr-2" /> Descargar
                </Button>
              </a>
            </div>
            <Button type="button" variant="ghost" className="w-full" onClick={reset}>Crear otra</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Botón "Invitar consumo gratis a staff" (pedido explícito del usuario):
 * elige un producto de la Carta de la Fiesta, cuántas unidades y para quién
 * es -- queda visible/canjeable para la cajera en /caja (ver createStaffComp). */
function StaffCompButton({ eventSlug, products }: { eventSlug: string; products: any[] }) {
  const [open, setOpen] = useState(false);
  const [ticketTypeId, setTicketTypeId] = useState<number | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [staffName, setStaffName] = useState('');

  const create = trpc.orders.createStaffComp.useMutation({
    onSuccess: (data) => {
      toast.success(`${data.displayCodes.length} código${data.displayCodes.length === 1 ? '' : 's'} de "${data.productName}" listo${data.displayCodes.length === 1 ? '' : 's'} en /caja para ${staffName}.`);
      setTicketTypeId(null); setQuantity(1); setStaffName('');
      setOpen(false);
    },
    onError: onMutationError,
  });

  const canSubmit = !!ticketTypeId && quantity > 0 && staffName.trim().length > 0;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" className="flex-1 interactive" disabled={products.length === 0}>
          <Martini className="w-4 h-4 mr-2" /> Invitar consumo gratis a staff
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invitar consumo gratis a staff</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Producto de la carta</Label>
            <Select value={ticketTypeId ? String(ticketTypeId) : ''} onValueChange={(v) => setTicketTypeId(Number(v))}>
              <SelectTrigger><SelectValue placeholder="Elige un producto" /></SelectTrigger>
              <SelectContent>
                {products.map((p: any) => <SelectItem key={p.id} value={String(p.id)}>{p.emoji ? `${p.emoji} ` : ''}{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Cantidad</Label>
            <Input type="number" min={1} max={20} value={quantity} onChange={(e) => setQuantity(Math.min(20, Math.max(1, Number(e.target.value) || 1)))} className="w-24" />
          </div>
          <div className="space-y-2">
            <Label>¿Para quién es?</Label>
            <Input value={staffName} onChange={(e) => setStaffName(e.target.value)} placeholder="Nombre de la persona del staff" />
          </div>
          <WriteButton className="w-full interactive" disabled={!canSubmit || create.isPending} onClick={() => ticketTypeId && create.mutate({ eventSlug, ticketTypeId, quantity, staffName: staffName.trim() })}>
            {create.isPending ? 'Creando…' : 'Crear invitación'}
          </WriteButton>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Párrafos que manda el correo si no se escribe nada -- copia literal de
 * `parrafosPorDefecto` en server/email.ts, solo para mostrarlos acá. El correo
 * real los toma del servidor: esto es una vista previa, no la fuente. */
const RECORDATORIO_POR_DEFECTO = [
  'Vimos que empezaste a sacar tu acceso para [evento] y quedó a medio camino. Puede pasar 🍬',
  'Tu lugar todavía no está confirmado, pero retomar toma menos de un minuto: el formulario te espera con todo lo que ya habías llenado.',
];

/** Recordatorio a las órdenes que quedaron sin pagar.
 *
 * La plantilla por defecto funciona sola; la IA es opcional y solo reescribe
 * el cuerpo. Antes de confirmar avisa a cuántos ya se les mandó uno, porque
 * insistirle cuatro veces a la misma persona es la forma más rápida de que
 * marque el correo como spam. */
function ReminderDialog({ orders, open, onOpenChange, onSent }: {
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

function OrdersView({ channel }: { channel: 'web' | 'caja' }) {
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [search, setSearch] = useState('');
  const [expandedOrderId, setExpandedOrderId] = useState<number | null>(null);

  const { data: ordersData, refetch: refetchOrders } = trpc.orders.listAll.useQuery({ status: statusFilter === 'all' ? undefined : statusFilter, channel });
  const { data: stats, refetch: refetchStats } = trpc.orders.getStats.useQuery({ channel });
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
  const visibleOrders = ordersList.filter((o: any) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (o.buyerName ?? '').toLowerCase().includes(q)
      || (o.buyerEmail ?? '').toLowerCase().includes(q)
      || (o.orderNumber ?? '').toLowerCase().includes(q);
  });
  const pendingCount = ordersList.filter((o: any) => o.paymentStatus === 'pending').length;

  // Recordatorios: solo con el filtro "Sin pagar" puesto. La selección es
  // manual a propósito -- no hay "mandar a todos", para no escribirle a quien
  // abandonó hace cinco minutos o ya está hablando por WhatsApp.
  const remindersMode = statusFilter === 'pending';
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
  useEffect(() => { setSelectedIds(new Set()); }, [statusFilter, channel, search]);

  const filterParams = () => {
    const params = new URLSearchParams();
    if (statusFilter !== 'all') params.set('status', statusFilter);
    if (dateFrom) params.set('dateFrom', dateFrom);
    if (dateTo) params.set('dateTo', dateTo);
    params.set('channel', channel);
    return params;
  };
  const exportUrl = () => `/api/admin/orders/export.csv?${filterParams().toString()}`;
  const printUrl = () => `/admin/print/orders?${filterParams().toString()}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-heading text-2xl">{channel === 'caja' ? 'Ventas en Caja' : 'Ventas Web'}</h2>
        <div className="flex flex-wrap items-center gap-2">
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por nombre, email o N° de orden…" className="max-w-xs" />
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los estados</SelectItem>
              <SelectItem value="approved">Aprobados</SelectItem>
              <SelectItem value="pending">Sin pagar (pendientes)</SelectItem>
              <SelectItem value="rejected">Rechazados</SelectItem>
              <SelectItem value="refunded">Reembolsados</SelectItem>
            </SelectContent>
          </Select>
          <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-36" aria-label="Desde" />
          <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-36" aria-label="Hasta" />
          <DownloadLink href={exportUrl()}>
            <Button variant="outline" className="interactive">Descargar CSV</Button>
          </DownloadLink>
          <a href={printUrl()} target="_blank" rel="noopener noreferrer">
            <Button variant="outline" className="interactive">Descargar PDF</Button>
          </a>
        </div>
      </div>

      {pendingCount > 0 && !remindersMode && (
        <p className="text-sm text-yellow-500">
          ⚠️ {pendingCount} orden{pendingCount > 1 ? 'es' : ''} sin pagar — usa el filtro "Sin pagar" para seleccionarlas y mandarles un recordatorio ya mismo.
          {' '}
          <span className="text-muted-foreground">
            (Además, un cron automático ya revisa esto cada 6 horas y manda un recordatorio solo cada 3 días por orden, hasta 3 veces — esto es para mandar uno extra ya, ej. antes de que suba el precio.)
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

      <ReminderDialog
        orders={selectedOrders}
        open={reminderOpen}
        onOpenChange={setReminderOpen}
        onSent={() => { setSelectedIds(new Set()); refetchOrders(); }}
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard icon={DollarSign} colorClass="bg-[oklch(0.70_0.19_340)]" value={`$${Number(stats?.totalRevenue ?? 0).toLocaleString('es-CL')}`} label="Ingresos Totales" />
        <StatCard icon={Ticket} colorClass="bg-[oklch(0.74_0.13_220)]" value={stats?.totalOrders ?? 0} label="Órdenes Totales" />
        <StatCard icon={Users} colorClass="bg-[oklch(0.75_0.15_230)]" value={stats?.approvedOrders ?? 0} label="Pagos Aprobados" />
      </div>

      <Card className="rounded-2xl border-0 shadow-md shadow-black/5">
        <CardContent className="pt-6">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  {remindersMode && (
                    <th className="text-left py-2 px-3 w-10">
                      <Checkbox
                        checked={allSelected}
                        onCheckedChange={(v) => setSelectedIds(v ? new Set(ordersList.map((o: any) => o.id)) : new Set())}
                        aria-label="Seleccionar todas"
                      />
                    </th>
                  )}
                  <th className="text-left py-2 px-3">Orden</th>
                  <th className="text-left py-2 px-3">Comprador</th>
                  <th className="text-left py-2 px-3">Total</th>
                  <th className="text-left py-2 px-3">Extras</th>
                  <th className="text-left py-2 px-3">Estado</th>
                  <th className="text-left py-2 px-3">Fecha</th>
                  {remindersMode && <th className="text-left py-2 px-3">Recordatorio</th>}
                  <th className="text-left py-2 px-3">Contacto</th>
                  <th className="text-left py-2 px-3">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {visibleOrders.map((order: any) => (
                  <Fragment key={order.id}>
                    <tr className="border-b border-border/50">
                      {remindersMode && (
                        <td className="py-2 px-3">
                          <Checkbox
                            checked={selectedIds.has(order.id)}
                            onCheckedChange={() => toggleSelected(order.id)}
                            aria-label={`Seleccionar ${order.orderNumber}`}
                          />
                        </td>
                      )}
                      <td className="py-2 px-3 font-mono text-xs">{order.orderNumber}</td>
                      <td className="py-2 px-3">{order.buyerName}<br/><span className="text-muted-foreground text-xs">{order.buyerEmail}</span></td>
                      <td className="py-2 px-3">${Number(order.total).toLocaleString('es-CL')}</td>
                      <td className="py-2 px-3">
                        {order.extras && order.extras.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {order.extras.map((ex: { name: string; quantity: number }, i: number) => (
                              <span key={i} className="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs whitespace-nowrap">
                                {ex.name}{ex.quantity > 1 ? ` ×${ex.quantity}` : ''}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </td>
                      <td className="py-2 px-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs ${order.paymentStatus === 'approved' ? 'bg-green-500/20 text-green-400' : order.paymentStatus === 'pending' ? 'bg-yellow-500/20 text-yellow-400' : 'bg-red-500/20 text-red-400'}`}>
                          {order.paymentStatus}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-muted-foreground">{formatChileShortDate(order.createdAt)}</td>
                      {remindersMode && (
                        <td className="py-2 px-3 text-xs">
                          {order.reminderCount > 0 ? (
                            <span className="text-yellow-500">
                              {order.reminderCount}× · {order.reminderSentAt ? formatChileShortDate(order.reminderSentAt) : ''}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                      )}
                      <td className="py-2 px-3">
                        <div className="flex gap-2">
                          <a href={`mailto:${order.buyerEmail}`} className="text-primary text-xs underline">Email</a>
                          {order.buyerPhone && (
                            <a href={`https://wa.me/${String(order.buyerPhone).replace(/[^0-9]/g, '')}`} target="_blank" rel="noopener noreferrer" className="text-primary text-xs underline">WhatsApp</a>
                          )}
                        </div>
                      </td>
                      <td className="py-2 px-3">
                        <div className="flex items-center gap-2">
                          {order.paymentStatus === 'approved' && (
                            <>
                              <button
                                className="text-primary text-xs underline"
                                onClick={() => setExpandedOrderId(expandedOrderId === order.id ? null : order.id)}
                              >
                                {expandedOrderId === order.id ? 'Ocultar' : 'Ver tickets'}
                              </button>
                              <button
                                className="text-primary text-xs underline disabled:opacity-50"
                                disabled={resendConfirmation.isPending}
                                onClick={() => resendConfirmation.mutate({ orderNumber: order.orderNumber })}
                              >
                                Reenviar email
                              </button>
                              {order.missionTopupStatus === 'pending' && (
                                <AlertDialog>
                                  <AlertDialogTrigger asChild>
                                    <button className="text-green-500 text-xs underline disabled:opacity-50" disabled={approveMissionTopup.isPending}>
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
                          <ConfirmDeleteButton
                            description={`Vas a eliminar la compra "${order.orderNumber}" de ${order.buyerName}.`}
                            onConfirm={() => deleteOrder.mutateAsync({ id: order.id })}
                            disabled={deleteOrder.isPending}
                          />
                        </div>
                      </td>
                    </tr>
                    {expandedOrderId === order.id && (
                      <tr className="border-b border-border/50 bg-muted/10">
                        <td colSpan={remindersMode ? 10 : 8} className="py-3 px-3">
                          {loadingTickets ? (
                            <p className="text-xs text-muted-foreground">Cargando tickets...</p>
                          ) : orderTickets && orderTickets.length > 0 ? (
                            <div className="space-y-2">
                              {['acceso', 'extra'].map((cat) => {
                                const items = orderTickets.filter((t: any) => t.category === cat);
                                if (items.length === 0) return null;
                                return (
                                  <div key={cat}>
                                    <p className="text-xs font-medium text-muted-foreground mb-1">{cat === 'acceso' ? 'Entradas' : 'Extras'}</p>
                                    <div className="flex flex-wrap gap-2">
                                      {items.map((t: any) => (
                                        <span key={t.ticketCode} className="px-2 py-1 rounded-lg bg-background border border-border text-xs font-mono">
                                          {t.ticketTypeName} · {t.ticketCode} · <span className="text-muted-foreground">{t.status}</span>
                                        </span>
                                      ))}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          ) : (
                            <p className="text-xs text-muted-foreground">Sin tickets generados.</p>
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
    </div>
  );
}

const CUSTOMERS_PAGE_SIZE = 25;

/** Valor centinela de los selectores de etiqueta del Mailing: Select de shadcn
 * no admite un SelectItem con value="", así que "sin filtro" necesita un valor
 * propio que se traduce a '' al leerlo. */
const NO_TAG_FILTER = '__all__';

function CustomersView() {
  const [search, setSearch] = useState('');
  const [accessType, setAccessType] = useState<string>('all');
  const [tagFilter, setTagFilter] = useState('');
  const [eventFilter, setEventFilter] = useState<string>('all');
  const [newTagByCustomer, setNewTagByCustomer] = useState<Record<number, string>>({});
  const [adjustByCustomer, setAdjustByCustomer] = useState<Record<number, string>>({});
  const [importing, setImporting] = useState(false);
  const [page, setPage] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: eventsData } = trpc.events.listAll.useQuery();
  const events = eventsData ?? [];

  const { data: customersData, refetch } = trpc.customers.listAll.useQuery({
    search: search || undefined,
    accessType: accessType === 'all' ? undefined : accessType,
    tag: tagFilter || undefined,
    eventId: eventFilter === 'all' ? undefined : Number(eventFilter),
  });
  const addTag = trpc.customers.addTag.useMutation({ onSuccess: () => refetch(), onError: onMutationError });
  const removeTag = trpc.customers.removeTag.useMutation({ onSuccess: () => refetch(), onError: onMutationError });
  const adjustPlaycoins = trpc.customers.adjustPlaycoins.useMutation({ onSuccess: () => refetch(), onError: onMutationError });

  const customersList = customersData ?? [];
  // La lista completa filtrada ya viene sin paginar del server (se necesita
  // entera para armar audiencias de mailing en otra vista) -- acá se pagina
  // solo en el cliente, para que la tabla no se haga eterna de scrollear.
  const totalPages = Math.max(1, Math.ceil(customersList.length / CUSTOMERS_PAGE_SIZE));
  const currentPage = Math.min(page, totalPages - 1);
  const pageItems = customersList.slice(currentPage * CUSTOMERS_PAGE_SIZE, currentPage * CUSTOMERS_PAGE_SIZE + CUSTOMERS_PAGE_SIZE);

  useEffect(() => { setPage(0); }, [search, accessType, tagFilter, eventFilter]);

  const filterParams = () => {
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (accessType !== 'all') params.set('accessType', accessType);
    if (tagFilter) params.set('tag', tagFilter);
    return params;
  };
  const exportUrl = () => `/api/admin/customers/export.csv?${filterParams().toString()}`;
  const printUrl = () => `/admin/print/customers?${filterParams().toString()}`;

  const handleImportFile = async (file: File) => {
    setImporting(true);
    try {
      const csv = await file.text();
      const res = await fetch('/api/admin/customers/import.csv', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ csv }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Error al importar el CSV');
      toast.success(`Importación lista: ${data.imported} cliente${data.imported !== 1 ? 's' : ''} nuevo${data.imported !== 1 ? 's' : ''}, ${data.updated} actualizado${data.updated !== 1 ? 's' : ''}`);
      refetch();
    } catch (err) {
      onMutationError(err);
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="font-heading text-2xl">Clientes</h2>
        <p className="text-sm text-muted-foreground">{customersList.length} cliente{customersList.length !== 1 ? 's' : ''}</p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por nombre, email o teléfono…" className="max-w-xs" />
        <Select value={accessType} onValueChange={setAccessType}>
          <SelectTrigger className="w-56"><SelectValue placeholder="Tipo de acceso" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los tipos de acceso</SelectItem>
            {ACCESO_SLUG_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input value={tagFilter} onChange={(e) => setTagFilter(e.target.value)} placeholder="Filtrar por etiqueta…" className="max-w-xs" />
        <Select value={eventFilter} onValueChange={setEventFilter}>
          <SelectTrigger className="w-56"><SelectValue placeholder="Evento" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los eventos</SelectItem>
            {events.map((e: any) => <SelectItem key={e.id} value={String(e.id)}>{e.title}</SelectItem>)}
          </SelectContent>
        </Select>

        <div className="ml-auto flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleImportFile(file);
              e.target.value = '';
            }}
          />
          <Button variant="outline" className="interactive" disabled={importing} onClick={() => fileInputRef.current?.click()}>
            <Upload className="w-4 h-4 mr-2" />
            {importing ? 'Importando…' : 'Importar CSV'}
          </Button>
          <DownloadLink href={exportUrl()}>
            <Button variant="outline" className="interactive">
              <Download className="w-4 h-4 mr-2" />
              Exportar CSV
            </Button>
          </DownloadLink>
          <a href={printUrl()} target="_blank" rel="noopener noreferrer">
            <Button variant="outline" className="interactive">
              <Download className="w-4 h-4 mr-2" />
              Descargar PDF
            </Button>
          </a>
        </div>
      </div>

      <Card className="rounded-2xl border-0 shadow-md shadow-black/5">
        <CardContent className="pt-6">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 px-3">Cliente</th>
                  <th className="text-left py-2 px-3">Accesos</th>
                  <th className="text-left py-2 px-3">Etiquetas</th>
                  <th className="text-left py-2 px-3">Compras</th>
                  <th className="text-left py-2 px-3">Playcoins</th>
                </tr>
              </thead>
              <tbody>
                {pageItems.map((c: any) => {
                  const accessTypes: string[] = Array.isArray(c.accessTypes) ? c.accessTypes : [];
                  const tags: string[] = Array.isArray(c.tags) ? c.tags : [];
                  return (
                    <tr key={c.id} className="border-b border-border/50 align-top">
                      <td className="py-2 px-3">
                        <p className="font-semibold">{c.fullName || '(sin nombre)'}</p>
                        <p className="text-muted-foreground text-xs">{c.email}{c.phone ? ` · ${c.phone}` : ''}{c.rut ? ` · ${c.rut}` : ''}</p>
                      </td>
                      <td className="py-2 px-3">
                        <div className="flex flex-wrap gap-1">
                          {accessTypes.map((slug) => (
                            <span key={slug} className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                              {ACCESO_SLUG_OPTIONS.find((o) => o.value === slug)?.label ?? slug}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="py-2 px-3 min-w-48">
                        <div className="flex flex-wrap items-center gap-1">
                          {tags.map((tag) => (
                            <span key={tag} className="text-xs pl-2 pr-1 py-0.5 rounded-full bg-secondary/20 text-secondary-foreground flex items-center gap-1">
                              {tag}
                              <button onClick={() => removeTag.mutate({ customerId: c.id, tag })} className="hover:text-destructive">
                                <X className="w-3 h-3" />
                              </button>
                            </span>
                          ))}
                          <Input
                            value={newTagByCustomer[c.id] ?? ''}
                            onChange={(e) => setNewTagByCustomer((prev) => ({ ...prev, [c.id]: e.target.value }))}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && newTagByCustomer[c.id]?.trim()) {
                                addTag.mutate({ customerId: c.id, tag: newTagByCustomer[c.id].trim() });
                                setNewTagByCustomer((prev) => ({ ...prev, [c.id]: '' }));
                              }
                            }}
                            placeholder="+ etiqueta"
                            className="h-7 w-28 text-xs"
                          />
                        </div>
                      </td>
                      <td className="py-2 px-3 text-muted-foreground text-xs whitespace-nowrap">
                        {c.totalOrders} compra{c.totalOrders !== 1 ? 's' : ''} · ${Number(c.totalSpent).toLocaleString('es-CL')}
                        <br />Última: {new Date(c.lastSeenAt).toLocaleDateString('es-CL', { timeZone: 'America/Santiago' })}
                      </td>
                      <td className="py-2 px-3">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 font-medium whitespace-nowrap">
                            🪙 {c.playcoins ?? 0}
                          </span>
                          <Input
                            type="number"
                            value={adjustByCustomer[c.id] ?? ''}
                            onChange={(e) => setAdjustByCustomer((prev) => ({ ...prev, [c.id]: e.target.value }))}
                            placeholder="+/-"
                            className="h-7 w-16 text-xs"
                          />
                          <WriteButton
                            size="sm" variant="outline" className="h-7 text-xs px-2"
                            onClick={() => {
                              const delta = Number(adjustByCustomer[c.id]);
                              if (!Number.isFinite(delta) || delta === 0) return;
                              adjustPlaycoins.mutate({ customerId: c.id, delta, note: 'Ajuste manual desde admin' });
                              setAdjustByCustomer((prev) => ({ ...prev, [c.id]: '' }));
                            }}
                          >
                            OK
                          </WriteButton>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {customersList.length === 0 && <p className="text-sm text-muted-foreground py-4">Sin clientes todavía -- se registran solos con cada compra web aprobada.</p>}
          </div>

          {customersList.length > CUSTOMERS_PAGE_SIZE && (
            <div className="flex items-center justify-between pt-4">
              <p className="text-xs text-muted-foreground">Página {currentPage + 1} de {totalPages}</p>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" disabled={currentPage === 0} onClick={() => setPage((p) => p - 1)}>Anterior</Button>
                <Button size="sm" variant="outline" disabled={currentPage >= totalPages - 1} onClick={() => setPage((p) => p + 1)}>Siguiente</Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/** Contactos que dejaron su correo sin comprar todavía (hoy el único gancho
 * es "avisame antes de que suba el precio", ver LeadCaptureInline en
 * Home.tsx) -- con $0 de pauta y 8 semanas de campaña, esta lista es la
 * principal defensa contra la gente que visita el sitio y se pierde para
 * siempre por no comprar en el momento. */
function LeadsView() {
  const { data, refetch, isLoading } = trpc.leads.listAll.useQuery();
  const deleteLead = trpc.leads.delete.useMutation({ onSuccess: () => refetch(), onError: onMutationError });
  const leads = data ?? [];

  const exportCsv = () => {
    const header = ['Fecha', 'Email', 'Teléfono', 'Instagram', 'Origen', 'UTM Source', 'UTM Medium', 'UTM Campaign'];
    const lines = leads.map((l: any) => [
      formatChileShortDate(new Date(l.createdAt)), l.email, l.phone ?? '', l.instagram ?? '',
      l.source, l.utmSource ?? '', l.utmMedium ?? '', l.utmCampaign ?? '',
    ].map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','));
    const blob = new Blob([[header.join(','), ...lines].join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `leads-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center flex-wrap gap-3">
        <div>
          <h2 className="font-heading text-2xl">Leads</h2>
          <p className="text-muted-foreground text-sm mt-1">Contactos que dejaron su correo sin comprar todavía -- desde el gancho "avisame antes de que suba el precio" en la home.</p>
        </div>
        <Button variant="outline" onClick={exportCsv} disabled={leads.length === 0}><Download className="w-4 h-4 mr-2" /> Exportar CSV</Button>
      </div>

      {isLoading ? (
        <p className="text-muted-foreground text-sm">Cargando…</p>
      ) : leads.length === 0 ? (
        <p className="text-muted-foreground text-sm">Todavía no hay leads.</p>
      ) : (
        <div className="space-y-2">
          {leads.map((l: any) => (
            <Card key={l.id}>
              <CardContent className="pt-4 flex justify-between items-center flex-wrap gap-2">
                <div>
                  <span className="font-semibold">{l.email}</span>
                  {l.phone && <span className="text-muted-foreground text-sm ml-3">{l.phone}</span>}
                  {l.instagram && <span className="text-muted-foreground text-sm ml-3">@{l.instagram.replace(/^@/, '')}</span>}
                  <span className="text-xs ml-3 px-2 py-0.5 rounded-full bg-primary/15 text-primary">{l.source}</span>
                  {l.utmSource && (
                    <span className="text-xs ml-2 px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                      {l.utmSource}{l.utmMedium ? ` · ${l.utmMedium}` : ''}
                    </span>
                  )}
                  <span className="text-muted-foreground text-xs ml-3">{formatChileShortDate(new Date(l.createdAt))}</span>
                </div>
                <ConfirmDeleteButton description={`Vas a eliminar el lead "${l.email}".`} onConfirm={() => deleteLead.mutateAsync({ id: l.id })} />
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

const UTM_SOURCE_PRESETS = [
  { value: 'instagram', label: 'Instagram' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'tiktok', label: 'TikTok' },
  { value: 'otro', label: 'Otro…' },
];

const UTM_MEDIUM_PRESETS: Record<string, { value: string; label: string }[]> = {
  instagram: [
    { value: 'historia', label: 'Historia' },
    { value: 'bio', label: 'Bio / link en la biografía' },
    { value: 'reel', label: 'Reel' },
    { value: 'post', label: 'Post' },
    { value: 'dm', label: 'Mensaje directo' },
  ],
  whatsapp: [
    { value: 'grupo', label: 'Grupo' },
    { value: 'estado', label: 'Estado' },
    { value: 'mensaje-directo', label: 'Mensaje directo' },
  ],
  tiktok: [
    { value: 'video', label: 'Video' },
    { value: 'bio', label: 'Bio' },
  ],
  otro: [],
};

/** Deja el texto listo para un parámetro UTM: minúsculas, sin tildes,
 * espacios como guiones -- para que "Founders" y "founders" no terminen
 * como dos filas distintas en el reporte de abajo. */
function slugifyUtm(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Arma el link etiquetado ANTES de compartirlo -- así la venta se organiza
 * sola en "Ventas por Origen" de abajo, sin depender de que nadie anote a
 * mano de dónde vino cada comprador ni de acordarse la sintaxis UTM. */
function UtmLinkBuilder() {
  const [source, setSource] = useState('instagram');
  const [customSource, setCustomSource] = useState('');
  const [medium, setMedium] = useState('historia');
  const [customMedium, setCustomMedium] = useState('');
  const [campaign, setCampaign] = useState('');
  const [content, setContent] = useState('');
  const [path, setPath] = useState('/');
  const [copied, setCopied] = useState(false);

  const mediumOptions = UTM_MEDIUM_PRESETS[source] ?? [];
  const effectiveSource = slugifyUtm(source === 'otro' ? customSource : source);
  const effectiveMedium = slugifyUtm(medium === 'otro' ? customMedium : medium);

  const link = useMemo(() => {
    try {
      const cleanPath = path.trim() || '/';
      const url = new URL(cleanPath.startsWith('/') ? cleanPath : `/${cleanPath}`, window.location.origin);
      if (effectiveSource) url.searchParams.set('utm_source', effectiveSource);
      if (effectiveMedium) url.searchParams.set('utm_medium', effectiveMedium);
      if (campaign.trim()) url.searchParams.set('utm_campaign', slugifyUtm(campaign));
      if (content.trim()) url.searchParams.set('utm_content', slugifyUtm(content));
      return url.toString();
    } catch {
      return '';
    }
  }, [effectiveSource, effectiveMedium, campaign, content, path]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard puede fallar (permiso denegado, contexto no seguro) -- el
      // link ya queda visible y seleccionable a mano, no es bloqueante.
    }
  };

  return (
    <Card className="rounded-2xl border-0 shadow-md shadow-black/5">
      <CardHeader><CardTitle>Generador de links</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Armá el link ANTES de compartirlo en cada lugar -- así la venta se organiza sola abajo, sin que tengas que anotar nada a mano.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label>Dónde lo vas a compartir</Label>
            <Select
              value={source}
              onValueChange={(v) => { setSource(v); setMedium((UTM_MEDIUM_PRESETS[v] ?? [])[0]?.value ?? 'otro'); }}
            >
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                {UTM_SOURCE_PRESETS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
              </SelectContent>
            </Select>
            {source === 'otro' && (
              <Input className="mt-2" placeholder="ej: tiktok, email, flyer físico" value={customSource} onChange={(e) => setCustomSource(e.target.value)} />
            )}
          </div>
          <div>
            <Label>Formato</Label>
            <Select value={medium} onValueChange={setMedium}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                {mediumOptions.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                <SelectItem value="otro">Otro…</SelectItem>
              </SelectContent>
            </Select>
            {medium === 'otro' && (
              <Input className="mt-2" placeholder="ej: carrusel, historia destacada" value={customMedium} onChange={(e) => setCustomMedium(e.target.value)} />
            )}
          </div>
          <div>
            <Label>Campaña (opcional)</Label>
            <Input className="mt-1" placeholder="ej: founders, disfraz" value={campaign} onChange={(e) => setCampaign(e.target.value)} />
          </div>
          <div>
            <Label>Variante (opcional)</Label>
            <Input className="mt-1" placeholder="ej: v1, v2 -- para probar dos versiones" value={content} onChange={(e) => setContent(e.target.value)} />
          </div>
          <div className="md:col-span-2">
            <Label>Página de destino</Label>
            <Input className="mt-1 font-mono text-xs" value={path} onChange={(e) => setPath(e.target.value)} placeholder="/ (home) o /eventos/tu-slug" />
          </div>
        </div>
        <div>
          <Label>Link listo para compartir</Label>
          <div className="flex items-center gap-2 mt-1">
            <Input readOnly value={link} className="font-mono text-xs" onFocus={(e) => e.target.select()} />
            <Button type="button" onClick={copy} className="interactive shrink-0">{copied ? '✓ Copiado' : 'Copiar'}</Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/** "Ventas por origen" (atribución UTM, agujero 2 del plan de ventas): con
 * $0 de pauta, saber qué reel/historia/link trae ventas de verdad es la
 * única ventaja competitiva que hay. Agrupa ventas web ya aprobadas por
 * utm_source/medium/campaign (client/src/lib/utm.ts captura, Checkout.tsx
 * las manda). Lo que no vino de un link etiquetado (directo, buscador,
 * embajador con su propio código) cae en "(sin UTM)" -- también es
 * información útil: cuánto de la venta no se explica por ningún link. */
function SalesByOriginView() {
  const { data, isLoading } = trpc.orders.salesByOrigin.useQuery();
  const rows = data ?? [];

  const totalRevenue = rows.reduce((s, r) => s + r.revenue, 0);
  const totalOrders = rows.reduce((s, r) => s + r.ordersCount, 0);

  // El chart agrupa solo por utmSource -- medium/campaña quedan en la tabla
  // de abajo. Con pocas fuentes activas (instagram, whatsapp, directo) un
  // chart por cada combinación se vería como ruido.
  const bySource = useMemo(() => {
    const map = new Map<string, { name: string; revenue: number; ordersCount: number }>();
    for (const r of rows) {
      const acc = map.get(r.utmSource) ?? { name: r.utmSource, revenue: 0, ordersCount: 0 };
      acc.revenue += r.revenue;
      acc.ordersCount += r.ordersCount;
      map.set(r.utmSource, acc);
    }
    return Array.from(map.values()).sort((a, b) => b.revenue - a.revenue);
  }, [rows]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-heading text-2xl">Ventas por Origen</h2>
        <p className="text-muted-foreground text-sm mt-1">
          De dónde vinieron las ventas web ya aprobadas, según el link que usó cada comprador para entrar al sitio. Lo que no viene de un link etiquetado (directo, buscador, embajador con su propio código) cae en "(sin UTM)".
        </p>
      </div>

      <UtmLinkBuilder />

      {isLoading ? (
        <p className="text-muted-foreground text-sm">Cargando…</p>
      ) : rows.length === 0 ? (
        <p className="text-muted-foreground text-sm">Todavía no hay ventas aprobadas para reportar.</p>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            {totalOrders} orden{totalOrders === 1 ? '' : 'es'} · ${totalRevenue.toLocaleString('es-CL')} en total
          </p>

          {bySource.length > 1 && (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={bySource} layout="vertical" margin={{ left: 24 }}>
                  <CartesianGrid stroke="hsl(var(--border))" />
                  <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => `$${Number(v).toLocaleString('es-CL')}`} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={100} />
                  <Tooltip formatter={(v: number) => `$${v.toLocaleString('es-CL')}`} />
                  <Bar dataKey="revenue" radius={[0, 4, 4, 0]}>
                    {bySource.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted-foreground border-b border-border">
                  <th className="py-2 pr-4">Origen</th>
                  <th className="py-2 pr-4">Medio</th>
                  <th className="py-2 pr-4">Campaña</th>
                  <th className="py-2 pr-4 text-right">Órdenes</th>
                  <th className="py-2 text-right">Ingresos</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} className="border-b border-border/50">
                    <td className="py-2 pr-4 font-medium">{r.utmSource}</td>
                    <td className="py-2 pr-4 text-muted-foreground">{r.utmMedium ?? '—'}</td>
                    <td className="py-2 pr-4 text-muted-foreground">{r.utmCampaign ?? '—'}</td>
                    <td className="py-2 pr-4 text-right">{r.ordersCount}</td>
                    <td className="py-2 text-right font-medium">${r.revenue.toLocaleString('es-CL')}</td>
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

function MailingSection() {
  const [search, setSearch] = useState('');
  const [accessType, setAccessType] = useState<string>('all');
  const [tagFilter, setTagFilter] = useState('');
  const [excludeTagFilters, setExcludeTagFilters] = useState<string[]>([]);
  const [eventFilter, setEventFilter] = useState<string>('all');
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [campaignTag, setCampaignTag] = useState('');
  const [importingCsv, setImportingCsv] = useState(false);
  const [csvImportResult, setCsvImportResult] = useState<{ tag: string; tagged: number; alreadyTagged: number; notFound: string[] } | null>(null);
  const csvInputRef = useRef<HTMLInputElement>(null);

  const { data: eventsData } = trpc.events.listAll.useQuery();
  const events = eventsData ?? [];

  const { data: customersData } = trpc.customers.listAll.useQuery({
    search: search || undefined,
    accessType: accessType === 'all' ? undefined : accessType,
    tag: tagFilter || undefined,
    excludeTags: excludeTagFilters.length > 0 ? excludeTagFilters : undefined,
    eventId: eventFilter === 'all' ? undefined : Number(eventFilter),
  });
  const customersList = customersData ?? [];

  // Etiquetas reales de la base para los selectores de incluir/excluir --
  // se refetchea al importar un CSV porque ese import crea etiquetas nuevas.
  const { data: tagsData, refetch: refetchTags } = trpc.customers.listTags.useQuery();
  const availableTags = tagsData ?? [];

  const bulkTagFromCsv = trpc.customers.bulkTagFromCsv.useMutation();

  const toggleSelected = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const allFilteredSelected = customersList.length > 0 && customersList.every((c: any) => selectedIds.has(c.id));
  const toggleSelectAllFiltered = () => {
    setSelectedIds((prev) => {
      if (allFilteredSelected) return new Set();
      const next = new Set(prev);
      customersList.forEach((c: any) => next.add(c.id));
      return next;
    });
  };

  // Qué etiquetas hay entre los seleccionados -- para confirmar de un vistazo
  // a quiénes se les va a mandar antes de apretar enviar.
  const selectedTagSummary = (() => {
    const counts = new Map<string, number>();
    for (const c of customersList as any[]) {
      if (!selectedIds.has(c.id) || !Array.isArray(c.tags)) continue;
      for (const tag of c.tags as string[]) counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
    return Array.from(counts, ([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count);
  })();

  const audienceDescription = (() => {
    const parts: string[] = [];
    if (eventFilter !== 'all') {
      const ev = events.find((e: any) => String(e.id) === eventFilter);
      parts.push(`compraron para ${ev?.title ?? 'el evento seleccionado'}`);
    }
    if (accessType !== 'all') parts.push(`tipo de acceso "${ACCESO_SLUG_OPTIONS.find((o) => o.value === accessType)?.label ?? accessType}"`);
    if (tagFilter) parts.push(`etiqueta "${tagFilter}"`);
    if (excludeTagFilters.length > 0) parts.push(`sin las etiquetas ${excludeTagFilters.map((t) => `"${t}"`).join(', ')}`);
    if (search) parts.push(`búsqueda "${search}"`);
    return parts.length > 0 ? parts.join(', ') : 'toda la base de clientes';
  })();

  const mailingCtaUrl = (() => {
    const origin = window.location.origin;
    if (eventFilter !== 'all') {
      const ev = events.find((e: any) => String(e.id) === eventFilter);
      if (ev?.slug) return `${origin}/eventos/${ev.slug}`;
    }
    return origin;
  })();

  const handleImportCsv = async (file: File) => {
    if (!campaignTag.trim()) {
      toast.error('Ponle un nombre a la campaña arriba antes de importar el CSV -- es la etiqueta que se les va a aplicar.');
      return;
    }
    setImportingCsv(true);
    setCsvImportResult(null);
    try {
      const csv = await file.text();
      const tag = campaignTag.trim();
      const result = await bulkTagFromCsv.mutateAsync({ csv, tag });
      setCsvImportResult({ tag, ...result });
      refetchTags();
      if (result.tagged === 0 && result.alreadyTagged === 0) {
        toast.error(`Ningún email del CSV coincidió con la base de clientes -- mira el detalle abajo.`);
      } else {
        toast.success(`${result.tagged} marcados con "${tag}"${result.alreadyTagged ? `, ${result.alreadyTagged} ya la tenían` : ''}${result.notFound.length ? `, ${result.notFound.length} no encontrados` : ''}.`);
      }
    } catch (err) {
      onMutationError(err);
    } finally {
      setImportingCsv(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-heading text-2xl">Mailing</h2>
        <p className="text-sm text-muted-foreground">Arma una audiencia, genera el mail con IA, y mándalo -- cada envío exitoso queda etiquetado con el nombre de campaña para no repetir destinatarios.</p>
      </div>

      <Card className="rounded-2xl border-0 shadow-md shadow-black/5">
        <CardContent className="pt-6 space-y-4">
          <div className="space-y-2 max-w-md">
            <Label>Nombre de campaña (etiqueta)</Label>
            <Input value={campaignTag} onChange={(e) => setCampaignTag(e.target.value)} placeholder="ej. masivocandyland2" />
            <p className="text-xs text-muted-foreground">Se aplica automáticamente a cada cliente que reciba el mail con éxito, y es la etiqueta que se usa si importás un CSV de entregados.</p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar…" className="max-w-xs" />
            <Select value={accessType} onValueChange={setAccessType}>
              <SelectTrigger className="w-52"><SelectValue placeholder="Tipo de acceso" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los tipos de acceso</SelectItem>
                {ACCESO_SLUG_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={tagFilter || NO_TAG_FILTER} onValueChange={(v) => setTagFilter(v === NO_TAG_FILTER ? '' : v)}>
              <SelectTrigger className="w-52"><SelectValue placeholder="Incluir etiqueta" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_TAG_FILTER}>Cualquier etiqueta</SelectItem>
                {availableTags.map((t) => (
                  <SelectItem key={t.tag} value={t.tag}>Con "{t.tag}" ({t.count})</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={NO_TAG_FILTER}
              onValueChange={(v) => {
                if (v === NO_TAG_FILTER) return;
                setExcludeTagFilters((prev) => (prev.includes(v) ? prev : [...prev, v]));
              }}
            >
              <SelectTrigger className="w-52"><SelectValue placeholder="Excluir etiqueta" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_TAG_FILTER}>Agregar etiqueta a excluir…</SelectItem>
                {availableTags.filter((t) => !excludeTagFilters.includes(t.tag)).map((t) => (
                  <SelectItem key={t.tag} value={t.tag}>Sin "{t.tag}" ({t.count})</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={eventFilter} onValueChange={setEventFilter}>
              <SelectTrigger className="w-52"><SelectValue placeholder="Evento" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los eventos</SelectItem>
                {events.map((e: any) => <SelectItem key={e.id} value={String(e.id)}>{e.title}</SelectItem>)}
              </SelectContent>
            </Select>

            <div className="ml-auto flex flex-col items-end gap-1">
              <input
                ref={csvInputRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleImportCsv(file);
                  e.target.value = '';
                }}
              />
              <Button variant="outline" className="interactive" disabled={importingCsv || !campaignTag.trim()} onClick={() => csvInputRef.current?.click()}>
                <Upload className="w-4 h-4 mr-2" />
                {importingCsv ? 'Marcando…' : `Marcar como enviados (CSV)`}
              </Button>
              {!campaignTag.trim() && <p className="text-xs text-destructive">Pon el nombre de campaña arriba primero</p>}
            </div>
          </div>

          {excludeTagFilters.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted-foreground">Excluyendo:</span>
              {excludeTagFilters.map((tag) => (
                <span key={tag} className="inline-flex items-center gap-1 rounded-full bg-destructive/10 text-destructive text-xs font-medium pl-3 pr-2 py-1">
                  {tag}
                  <button
                    type="button"
                    onClick={() => setExcludeTagFilters((prev) => prev.filter((t) => t !== tag))}
                    className="interactive rounded-full hover:bg-destructive/20 p-0.5"
                    aria-label={`Sacar "${tag}" de la exclusión`}
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
          )}

          {csvImportResult && (
            <div className="rounded-xl border border-border/50 px-4 py-3 text-sm space-y-2">
              <p>
                Import de CSV con etiqueta <span className="font-semibold">"{csvImportResult.tag}"</span>:{' '}
                <span className="text-primary font-medium">{csvImportResult.tagged} marcados ahora</span>
                {csvImportResult.alreadyTagged > 0 && <span className="text-muted-foreground">, {csvImportResult.alreadyTagged} ya la tenían</span>}
                {csvImportResult.notFound.length > 0 && <span className="text-destructive">, {csvImportResult.notFound.length} sin match en la base</span>}
              </p>
              {csvImportResult.notFound.length > 0 && (
                <details className="text-xs text-muted-foreground">
                  <summary className="cursor-pointer text-primary">Ver los que no matchearon</summary>
                  <div className="mt-1 max-h-32 overflow-y-auto font-mono space-y-0.5">
                    {csvImportResult.notFound.map((email) => <div key={email}>{email}</div>)}
                  </div>
                </details>
              )}
            </div>
          )}

          <div className="space-y-2 rounded-xl border border-border/50 px-4 py-2.5">
            <div className="flex items-center gap-3">
              <Checkbox checked={allFilteredSelected} onCheckedChange={toggleSelectAllFiltered} />
              <span className="text-sm text-muted-foreground">
                {selectedIds.size > 0 ? `${selectedIds.size} seleccionado${selectedIds.size !== 1 ? 's' : ''}` : `Seleccionar los ${customersList.length} filtrados`}
              </span>
            </div>
            {selectedTagSummary.length > 0 && (
              <div className="flex flex-wrap items-center gap-1">
                <span className="text-xs text-muted-foreground mr-1">Etiquetas entre los seleccionados:</span>
                {selectedTagSummary.map(({ tag, count }) => (
                  <span key={tag} className="text-xs px-2 py-0.5 rounded-full bg-secondary/20 text-secondary-foreground">
                    {tag} ({count})
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="max-h-[28rem] overflow-y-auto rounded-lg border border-border/50 divide-y">
            {customersList.map((c: any) => {
              const tags: string[] = Array.isArray(c.tags) ? c.tags : [];
              const accessTypes: string[] = Array.isArray(c.accessTypes) ? c.accessTypes : [];
              return (
                <label key={c.id} className="flex items-start gap-3 px-3 py-2.5 text-sm cursor-pointer hover:bg-muted/30">
                  <Checkbox className="mt-1 shrink-0" checked={selectedIds.has(c.id)} onCheckedChange={() => toggleSelected(c.id)} />
                  <div className="flex-1 min-w-0 space-y-1">
                    <p className="font-medium truncate">{c.fullName || '(sin nombre)'}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {c.email}
                      {c.phone ? ` · ${c.phone}` : ''}
                      {c.instagram ? ` · @${String(c.instagram).replace(/^@/, '')}` : ''}
                    </p>
                    {(accessTypes.length > 0 || tags.length > 0) && (
                      <div className="flex flex-wrap gap-1">
                        {accessTypes.map((slug) => (
                          <span key={slug} className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                            {ACCESO_SLUG_OPTIONS.find((o) => o.value === slug)?.label ?? slug}
                          </span>
                        ))}
                        {tags.map((tag) => (
                          <span key={tag} className="text-xs px-2 py-0.5 rounded-full bg-secondary/20 text-secondary-foreground">
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                    <p className="text-xs text-muted-foreground">
                      {c.totalOrders} compra{c.totalOrders !== 1 ? 's' : ''} · ${Number(c.totalSpent).toLocaleString('es-CL')} · 🪙 {c.playcoins ?? 0}
                      {c.lastSeenAt ? ` · última: ${new Date(c.lastSeenAt).toLocaleDateString('es-CL', { timeZone: 'America/Santiago' })}` : ''}
                    </p>
                  </div>
                </label>
              );
            })}
            {customersList.length === 0 && <p className="text-sm text-muted-foreground px-3 py-4">Nadie matchea estos filtros.</p>}
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-2xl border-0 shadow-md shadow-black/5">
        <CardContent className="pt-6">
          <MailingComposer
            audience={{ ids: Array.from(selectedIds), count: selectedIds.size, description: audienceDescription }}
            ctaUrl={mailingCtaUrl}
            campaignTag={campaignTag}
            onDone={() => setSelectedIds(new Set())}
          />
        </CardContent>
      </Card>
    </div>
  );
}

/** Historial de campañas de envío automático (pedido explícito del usuario):
 * las que se mandan con "Guardar para envío automático" en MailingComposer
 * quedan acá con su progreso, drenadas de a poco por el cron diario -- los
 * envíos inmediatos ("Enviar a N clientes") no pasan por acá, se quedan
 * igual que siempre en el resultado de la propia pantalla de Mailing. */
function MailingHistoryView() {
  const { data: campaignsData, refetch } = trpc.mailing.listCampaigns.useQuery(undefined, {
    refetchInterval: 30_000,
  });
  const campaigns = campaignsData ?? [];
  const [expandedId, setExpandedId] = useState<number | null>(null);
  // Confirmación en dos pasos antes de cancelar (mismo patrón que
  // "Evaluar Misión 300") -- frenar una campaña a mitad de envío no se
  // deshace, así que un tap solo no alcanza.
  const [confirmingCancelId, setConfirmingCancelId] = useState<number | null>(null);
  const cancelCampaign = trpc.mailing.cancelCampaign.useMutation({
    onSuccess: () => { toast.success('Campaña cancelada -- no se manda el resto.'); refetch(); },
    onError: onMutationError,
  });

  const { data: recipientsData } = trpc.mailing.getCampaignRecipients.useQuery(
    { campaignId: expandedId ?? 0 },
    { enabled: expandedId !== null }
  );
  const failedRecipients = (recipientsData ?? []).filter((r: any) => r.status === 'failed');

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-heading text-2xl">Historial de Mailing</h2>
          <p className="text-sm text-muted-foreground">Campañas de envío automático -- el cron diario las va mandando de a poco hasta terminar.</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} className="interactive">Actualizar</Button>
      </div>

      {campaigns.length === 0 && (
        <p className="text-sm text-muted-foreground">Todavía no hay ninguna campaña guardada para envío automático. Se arman desde la pestaña Mailing con "Guardar para envío automático".</p>
      )}

      <div className="space-y-3">
        {campaigns.map((c: any) => {
          const progress = c.totalRecipients > 0 ? Math.round(((c.sentCount + c.failedCount) / c.totalRecipients) * 100) : 0;
          const isExpanded = expandedId === c.id;
          return (
            <Card key={c.id} className="rounded-2xl border-0 shadow-md shadow-black/5">
              <CardContent className="pt-6 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">{c.name}</p>
                    <p className="text-xs text-muted-foreground">{c.audienceDescription} · creada el {new Date(c.createdAt).toLocaleDateString('es-CL', { timeZone: 'America/Santiago' })}</p>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${
                    c.status === 'done' ? 'bg-primary/10 text-primary' : c.status === 'cancelled' ? 'bg-muted text-muted-foreground' : 'bg-amber-500/10 text-amber-600'
                  }`}>
                    {c.status === 'done' ? 'Terminada' : c.status === 'cancelled' ? 'Cancelada' : 'Enviando…'}
                  </span>
                </div>

                <div className="w-full h-2 bg-secondary/20 rounded-full overflow-hidden">
                  <div className="h-full bg-primary transition-all" style={{ width: `${progress}%` }} />
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="text-primary font-medium">{c.sentCount} enviados</span>
                  {c.failedCount > 0 && <span className="text-destructive font-medium">{c.failedCount} fallidos</span>}
                  <span>{c.totalRecipients} en total</span>
                  {c.status === 'sending' && <span>· sigue mañana con lo que falte</span>}
                </div>

                {c.status === 'sending' && (
                  confirmingCancelId === c.id ? (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">¿Cancelar? No se manda el resto de los destinatarios.</span>
                      <WriteButton
                        type="button" variant="destructive" size="sm" className="h-7 px-2 text-xs"
                        onClick={() => { cancelCampaign.mutate({ campaignId: c.id }); setConfirmingCancelId(null); }}
                        disabled={cancelCampaign.isPending}
                      >
                        Confirmar
                      </WriteButton>
                      <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setConfirmingCancelId(null)}>
                        Volver
                      </Button>
                    </div>
                  ) : (
                    <Button
                      type="button" variant="outline" size="sm" className="h-7 px-2 text-xs text-destructive"
                      onClick={() => setConfirmingCancelId(c.id)}
                    >
                      Cancelar campaña
                    </Button>
                  )
                )}

                {c.failedCount > 0 && (
                  <Button
                    type="button" variant="ghost" size="sm" className="text-xs h-7 px-2 -ml-2"
                    onClick={() => setExpandedId(isExpanded ? null : c.id)}
                  >
                    {isExpanded ? <ChevronUp className="w-3.5 h-3.5 mr-1" /> : <ChevronDown className="w-3.5 h-3.5 mr-1" />}
                    Ver fallidos
                  </Button>
                )}
                {isExpanded && (
                  <div className="max-h-40 overflow-y-auto rounded-lg border border-border/50 divide-y">
                    {failedRecipients.map((r: any) => (
                      <div key={r.id} className="px-3 py-2 text-xs flex justify-between gap-2">
                        <span>{r.email}</span>
                        <span className="text-destructive text-right">{r.reason || 'Error desconocido'}</span>
                      </div>
                    ))}
                    {failedRecipients.length === 0 && <p className="text-xs text-muted-foreground px-3 py-2">Cargando…</p>}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function ReferralsView() {
  const { data: referralStats } = trpc.referrals.getStats.useQuery();
  const stats = referralStats ?? [];

  return (
    <div className="space-y-6">
      <h2 className="font-heading text-2xl">Embajadores y Referidos</h2>
      <Card className="rounded-2xl border-0 shadow-md shadow-black/5">
        <CardContent className="pt-6">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 px-3">Código</th>
                  <th className="text-left py-2 px-3">Referidos</th>
                  <th className="text-left py-2 px-3">Tickets Vendidos</th>
                  <th className="text-left py-2 px-3">Ingresos Generados</th>
                </tr>
              </thead>
              <tbody>
                {stats.map((stat: any) => (
                  <tr key={stat.ambassadorCode} className="border-b border-border/50">
                    <td className="py-2 px-3 font-mono font-bold text-primary">{stat.ambassadorCode}</td>
                    <td className="py-2 px-3">{stat.totalReferrals}</td>
                    <td className="py-2 px-3">{stat.totalTickets}</td>
                    <td className="py-2 px-3">${Number(stat.totalRevenue).toLocaleString('es-CL')}</td>
                  </tr>
                ))}
                {stats.length === 0 && (
                  <tr><td colSpan={4} className="py-8 text-center text-muted-foreground">No hay referidos aún</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/** Fila editable de la lista de embajadores -- nombre/código/%/contacto se
 * editan en el lugar (pedido explícito del usuario: "todo valor debe ser
 * personalizable"), sin un diálogo aparte.
 *
 * `commissionPercent` en null significa "usar la escala del programa": es lo
 * normal ahora, y el campo se deja vacío para dejarlo así. */
function AmbassadorRow({ ambassador, stats, expanded, onToggleExpand, onUpdate, onDelete, updating, deleting }: {
  ambassador: any;
  stats: { exclusiveSales: number; existingSales: number; monthlyRevenue: number; monthlyCommission: number; totalCommission: number } | undefined;
  expanded: boolean;
  onToggleExpand: () => void;
  onUpdate: (data: { name?: string; code?: string; commissionPercent?: number | null; contact?: string; email?: string; instagram?: string; active?: number }) => Promise<unknown>;
  onDelete: () => Promise<unknown>;
  updating: boolean;
  deleting: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(ambassador.name);
  const [code, setCode] = useState(ambassador.code);
  const [commissionPercent, setCommissionPercent] = useState(
    ambassador.commissionPercent === null || ambassador.commissionPercent === undefined ? '' : String(ambassador.commissionPercent),
  );
  const [contact, setContact] = useState(ambassador.contact ?? '');
  const [email, setEmail] = useState(ambassador.email ?? '');

  const s = stats ?? { exclusiveSales: 0, existingSales: 0, monthlyRevenue: 0, monthlyCommission: 0, totalCommission: 0 };

  const handleSave = async () => {
    await onUpdate({
      name,
      code: code.toUpperCase(),
      // Vacío = null = usar la escala global, no 0%.
      commissionPercent: commissionPercent.trim() === '' ? null : Number(commissionPercent) || 0,
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
        <td className="py-2 px-3 text-muted-foreground">{s.exclusiveSales}</td>
        <td className="py-2 px-3 text-muted-foreground">${s.monthlyRevenue.toLocaleString('es-CL')}</td>
        <td className="py-2 px-3 text-muted-foreground">${s.monthlyCommission.toLocaleString('es-CL')}</td>
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
        {s.exclusiveSales}
        {s.existingSales > 0 && <span className="text-muted-foreground text-xs"> +{s.existingSales} exist.</span>}
      </td>
      <td className="py-2 px-3">${s.monthlyRevenue.toLocaleString('es-CL')}</td>
      <td className="py-2 px-3 font-semibold text-primary">${s.monthlyCommission.toLocaleString('es-CL')}</td>
      <td className="py-2 px-3 text-muted-foreground text-xs">{ambassador.email || '—'}</td>
      <td className="py-2 px-3 text-muted-foreground text-xs">{ambassador.contact || '—'}</td>
      <td className="py-2 px-3">
        <div className="flex gap-2">
          <span className={`px-2 py-0.5 rounded-full text-xs ${ambassador.active ? 'bg-green-500/20 text-green-400' : 'bg-muted text-muted-foreground'}`}>{ambassador.active ? 'Activo' : 'Inactivo'}</span>
          <Button variant="outline" size="sm" onClick={onToggleExpand} title="Ver perfil">{expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}</Button>
          <Button variant="outline" size="sm" onClick={() => setEditing(true)}><Edit className="w-3 h-3" /></Button>
          <Button variant="outline" size="sm" disabled={updating} onClick={() => onUpdate({ active: ambassador.active ? 0 : 1 })}>
            {ambassador.active ? 'Desactivar' : 'Activar'}
          </Button>
          <ConfirmDeleteButton description={`Vas a eliminar al embajador "${ambassador.name}" (${ambassador.code}). Sus clientes exclusivos quedan libres; las comisiones ya generadas se conservan.`} onConfirm={onDelete} disabled={deleting} />
        </div>
      </td>
    </tr>
  );
}

/** Ficha completa que se abre al tocar un embajador: nivel, progreso,
 * beneficios e historial de ventas. Usa el patrón de fila expandible de
 * OrdersView, que es el que ya usa el panel. */
function AmbassadorProfileRow({ ambassadorId, monthKey, deliveredKeys, onMarkBenefit, onUnmarkBenefit, marking, unmarking }: {
  ambassadorId: number;
  monthKey: string;
  deliveredKeys: Set<string>;
  onMarkBenefit: (benefitKey: string) => void;
  onUnmarkBenefit: (benefitKey: string) => void;
  marking: boolean;
  unmarking: boolean;
}) {
  const { data } = trpc.ambassadors.getProfile.useQuery({ id: ambassadorId, monthKey });
  const stats = data?.stats;
  const sales = data?.sales ?? [];

  if (!data) {
    return <tr className="border-b border-border/50 bg-muted/10"><td colSpan={9} className="py-3 px-3 text-xs text-muted-foreground">Cargando ficha…</td></tr>;
  }

  const progreso = stats?.nextTarget
    ? Math.min(100, Math.round((stats.monthlySales / stats.nextTarget.target) * 100))
    : 100;

  return (
    <tr className="border-b border-border/50 bg-muted/10">
      <td colSpan={9} className="py-4 px-3">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
          <div className="p-3 rounded-xl bg-background border border-border">
            <p className="text-xs text-muted-foreground">Comisión actual</p>
            <p className="font-heading text-2xl">{stats?.currentPercent ?? 0}%</p>
            <p className="text-xs text-muted-foreground mt-1">
              {stats?.monthlySales ?? 0} venta{(stats?.monthlySales ?? 0) === 1 ? '' : 's'} a clientes exclusivos este mes
            </p>
          </div>
          <div className="p-3 rounded-xl bg-background border border-border">
            <p className="text-xs text-muted-foreground">Próximo objetivo</p>
            {stats?.nextTarget ? (
              <>
                <p className="font-heading text-2xl">{stats.monthlySales} / {stats.nextTarget.target}</p>
                <div className="w-full h-2 bg-muted rounded-full overflow-hidden mt-2">
                  <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${progreso}%` }} />
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Faltan {stats.nextTarget.salesNeeded} para subir al {stats.nextTarget.nextPercent}%
                </p>
              </>
            ) : (
              <p className="font-heading text-2xl">Nivel máximo 🏆</p>
            )}
          </div>
          <div className="p-3 rounded-xl bg-background border border-border">
            <p className="text-xs text-muted-foreground">Comisión acumulada (histórica)</p>
            <p className="font-heading text-2xl text-primary">${(stats?.totalCommission ?? 0).toLocaleString('es-CL')}</p>
            <p className="text-xs text-muted-foreground mt-1">
              {stats?.exclusiveClientsCount ?? 0} clientes exclusivos · {stats?.existingClientsCount ?? 0} existentes
            </p>
          </div>
        </div>

        {stats && stats.benefits.tiers.length > 0 && (
          <div className="mb-4">
            <p className="text-xs text-muted-foreground mb-1.5">Beneficios desbloqueados este mes — marca los que ya le entregaste</p>
            <div className="space-y-2">
              {stats.benefits.tiers.map((t: any) => {
                const key = `tramo-${t.minSales}`;
                const entregado = deliveredKeys.has(key);
                return (
                  <div key={key} className={`flex flex-wrap items-center gap-2 p-2 rounded-xl border ${entregado ? 'bg-green-500/10 border-green-500/30' : 'bg-background border-border'}`}>
                    <span className="text-xs text-muted-foreground w-24 shrink-0">Desde {t.minSales} venta{t.minSales === 1 ? '' : 's'}</span>
                    <div className="flex flex-wrap gap-1.5 flex-1">
                      {t.items.map((b: string, i: number) => (
                        <span key={i} className="px-2 py-1 rounded-lg bg-primary/10 border border-primary/30 text-xs">{b}</span>
                      ))}
                      {t.bonusClp > 0 && (
                        <span className="px-2 py-1 rounded-lg bg-green-500/15 border border-green-500/30 text-xs font-semibold text-green-400">
                          Bono ${t.bonusClp.toLocaleString('es-CL')}
                        </span>
                      )}
                    </div>
                    <Button
                      size="sm"
                      variant={entregado ? 'outline' : 'default'}
                      disabled={marking || unmarking}
                      onClick={() => entregado
                        ? onUnmarkBenefit(key)
                        : onMarkBenefit(key)}
                    >
                      {entregado ? '✓ Entregado' : 'Marcar entregado'}
                    </Button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <p className="text-xs text-muted-foreground mb-1.5">Historial de ventas</p>
        {sales.length === 0 ? (
          <p className="text-xs text-muted-foreground">Todavía no tiene ventas registradas.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-1.5 px-2">Fecha</th>
                  <th className="text-left py-1.5 px-2">Evento</th>
                  <th className="text-left py-1.5 px-2">Cliente</th>
                  <th className="text-left py-1.5 px-2">Tipo</th>
                  <th className="text-left py-1.5 px-2">Código</th>
                  <th className="text-left py-1.5 px-2">Monto</th>
                  <th className="text-left py-1.5 px-2">%</th>
                  <th className="text-left py-1.5 px-2">Comisión</th>
                </tr>
              </thead>
              <tbody>
                {sales.map((s: any) => (
                  <tr key={s.id} className="border-b border-border/40">
                    <td className="py-1.5 px-2">{formatChileShortDate(s.createdAt)}</td>
                    <td className="py-1.5 px-2">{s.eventTitle}</td>
                    <td className="py-1.5 px-2">{s.customerName || s.customerEmail || '—'}</td>
                    <td className="py-1.5 px-2">
                      <span className={`px-1.5 py-0.5 rounded-full ${s.clientType === 'exclusivo' ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground'}`}>
                        {s.clientType === 'exclusivo' ? 'Exclusivo' : 'Existente'}
                      </span>
                    </td>
                    <td className="py-1.5 px-2 font-mono">{s.codeUsed || '—'}</td>
                    <td className="py-1.5 px-2">${s.baseAmount.toLocaleString('es-CL')}</td>
                    <td className="py-1.5 px-2">{s.commissionPercent}%</td>
                    <td className="py-1.5 px-2 font-semibold text-primary">${s.commissionAmount.toLocaleString('es-CL')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </td>
    </tr>
  );
}

/** Últimos 12 meses como opciones "2026-08", en hora de Chile. */
function monthOptions(): { value: string; label: string }[] {
  const out: { value: string; label: string }[] = [];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 15, 12));
    out.push({
      value: monthKeyFor(d),
      label: d.toLocaleDateString('es-CL', { month: 'long', year: 'numeric' }),
    });
  }
  return out;
}

const AMBASSADOR_TABS = [
  { id: 'resumen', label: 'Resumen' },
  { id: 'embajadores', label: 'Embajadores' },
  { id: 'postulaciones', label: 'Postulaciones' },
  { id: 'ranking', label: 'Ranking' },
  { id: 'clientes', label: 'Clientes referidos' },
  { id: 'material', label: 'Material de la semana' },
  { id: 'config', label: 'Configuración' },
] as const;

function AmbassadorsView() {
  const [tab, setTab] = useState<typeof AMBASSADOR_TABS[number]['id']>('resumen');
  const meses = monthOptions();
  const [monthKey, setMonthKey] = useState(meses[0].value);
  const { data: pendingApplications } = trpc.ambassadorApplications.countPending.useQuery(undefined, { refetchInterval: 60_000 });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-heading text-2xl">Embajadores VIP</h2>
          <p className="text-muted-foreground text-sm mt-1 max-w-3xl">
            Cada embajador tiene un código permanente. Las ventas a clientes que él trae (exclusivos) suben su comisión
            del 30% al 50% según cuántas haga en el mes; las ventas a clientes que ya estaban en la base pagan un 10%
            fijo y no suben el nivel. Todo se calcula solo al aprobarse cada compra.
          </p>
        </div>
        {tab !== 'config' && tab !== 'clientes' && tab !== 'material' && tab !== 'postulaciones' && (
          <Select value={monthKey} onValueChange={setMonthKey}>
            <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              {meses.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
      </div>

      <div className="flex flex-wrap gap-2 border-b border-border pb-3">
        {AMBASSADOR_TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-colors interactive flex items-center gap-2 ${
              tab === t.id ? 'bg-primary text-primary-foreground' : 'bg-muted/40 text-muted-foreground hover:text-foreground'
            }`}
          >
            {t.label}
            {t.id === 'postulaciones' && !!pendingApplications && (
              <span className={`px-1.5 py-0.5 rounded-full text-xs font-bold ${tab === t.id ? 'bg-primary-foreground/20' : 'bg-primary/15 text-primary'}`}>
                {pendingApplications}
              </span>
            )}
          </button>
        ))}
      </div>

      {tab === 'resumen' && <AmbassadorSummaryTab monthKey={monthKey} />}
      {tab === 'embajadores' && <AmbassadorsListTab monthKey={monthKey} />}
      {tab === 'postulaciones' && <AmbassadorApplicationsTab />}
      {tab === 'ranking' && <AmbassadorRankingTab monthKey={monthKey} />}
      {tab === 'clientes' && <ReferredClientsTab />}
      {tab === 'material' && <WeeklyMaterialTab />}
      {tab === 'config' && <ProgramConfigTab />}
    </div>
  );
}

function AmbassadorSummaryTab({ monthKey }: { monthKey: string }) {
  const { data } = trpc.ambassadors.getSummary.useQuery({ monthKey }, { refetchInterval: 60_000 });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={Crown} colorClass="bg-[oklch(0.70_0.19_340)]" value={data?.activeAmbassadors ?? 0} label="Embajadores activos" />
        <StatCard icon={Ticket} colorClass="bg-[oklch(0.74_0.13_220)]" value={data?.monthlySales ?? 0} label="Ventas del mes" />
        <StatCard icon={DollarSign} colorClass="bg-[oklch(0.75_0.15_230)]" value={`$${(data?.monthlyRevenue ?? 0).toLocaleString('es-CL')}`} label="Monto vendido" />
        <StatCard icon={Percent} colorClass="bg-[oklch(0.7_0.16_20)]" value={`$${(data?.monthlyCommission ?? 0).toLocaleString('es-CL')}`} label="Comisiones del mes" />
        <StatCard icon={Users} colorClass="bg-[oklch(0.72_0.14_150)]" value={data?.newClients ?? 0} label="Ventas a clientes nuevos" />
        <StatCard icon={Contact} colorClass="bg-[oklch(0.7_0.08_260)]" value={data?.existingClients ?? 0} label="Ventas a clientes existentes" />
        <StatCard icon={Gift} colorClass="bg-[oklch(0.74_0.13_90)]" value={data?.benefitsDelivered ?? 0} label="Beneficios entregados" />
      </div>

      <Card className="rounded-2xl border-0 shadow-md shadow-black/5">
        <CardHeader><CardTitle>Top embajador del mes</CardTitle></CardHeader>
        <CardContent>
          {data?.topAmbassador ? (
            <div className="flex items-baseline gap-3">
              <p className="font-heading text-3xl">{data.topAmbassador.name}</p>
              <p className="font-mono text-primary font-bold">{data.topAmbassador.code}</p>
              <p className="text-muted-foreground text-sm">
                {data.topAmbassador.exclusiveSales} venta{data.topAmbassador.exclusiveSales === 1 ? '' : 's'} a clientes propios
              </p>
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">Todavía nadie hizo ventas este mes.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function AmbassadorsListTab({ monthKey }: { monthKey: string }) {
  const { data: listData, refetch } = trpc.ambassadors.listAll.useQuery();
  const { data: rankingData, refetch: refetchRanking } = trpc.ambassadors.getRanking.useQuery({ monthKey });
  const ambassadors = listData ?? [];
  const statsById = new Map((rankingData ?? []).map((r: any) => [r.id, r]));

  const refreshAll = () => { refetch(); refetchRanking(); };

  const createAmbassador = trpc.ambassadors.create.useMutation({
    onSuccess: () => { refreshAll(); toast.success('Embajador creado'); setShowForm(false); setNewAmbassador({ name: '', code: '', commissionPercent: '', contact: '', email: '' }); },
    onError: onMutationError,
  });
  const updateAmbassador = trpc.ambassadors.update.useMutation({ onSuccess: refreshAll, onError: onMutationError });
  const deleteAmbassador = trpc.ambassadors.delete.useMutation({ onSuccess: () => { refreshAll(); toast.success('Embajador eliminado'); }, onError: onMutationError });

  // Beneficios entregados del mes: se consultan una vez para toda la tabla y
  // se reparten por embajador, en vez de una consulta por ficha abierta.
  const { data: deliveriesData, refetch: refetchDeliveries } = trpc.ambassadors.listBenefitDeliveries.useQuery({ monthKey });
  const deliveredByAmbassador = new Map<number, Set<string>>();
  for (const d of deliveriesData ?? []) {
    const set = deliveredByAmbassador.get(d.ambassadorId) ?? new Set<string>();
    set.add(d.benefitKey);
    deliveredByAmbassador.set(d.ambassadorId, set);
  }
  const markBenefit = trpc.ambassadors.markBenefitDelivered.useMutation({
    onSuccess: () => { refetchDeliveries(); toast.success('Beneficio marcado como entregado'); },
    onError: onMutationError,
  });
  const unmarkBenefit = trpc.ambassadors.unmarkBenefitDelivered.useMutation({
    onSuccess: () => { refetchDeliveries(); toast.success('Se deshizo la entrega'); },
    onError: onMutationError,
  });

  const [showForm, setShowForm] = useState(false);
  const [newAmbassador, setNewAmbassador] = useState({ name: '', code: '', commissionPercent: '', contact: '', email: '' });
  const [search, setSearch] = useState('');
  const [estado, setEstado] = useState<'all' | 'active' | 'inactive'>('all');
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const visibles = ambassadors.filter((a: any) => {
    if (estado === 'active' && !a.active) return false;
    if (estado === 'inactive' && a.active) return false;
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return a.name.toLowerCase().includes(q) || a.code.toLowerCase().includes(q) || (a.email ?? '').toLowerCase().includes(q);
  });

  const handleCreate = async () => {
    if (!newAmbassador.name || !newAmbassador.code) return;
    try {
      await createAmbassador.mutateAsync({
        name: newAmbassador.name,
        code: newAmbassador.code.toUpperCase(),
        commissionPercent: newAmbassador.commissionPercent.trim() === '' ? null : Number(newAmbassador.commissionPercent) || 0,
        contact: newAmbassador.contact || undefined,
        email: newAmbassador.email || undefined,
      });
    } catch {
      // onMutationError ya avisó; el formulario queda abierto para reintentar.
    }
  };

  const totalComision = visibles.reduce((sum: number, a: any) => sum + (statsById.get(a.id)?.monthlyCommission ?? 0), 0);
  const totalVendido = visibles.reduce((sum: number, a: any) => sum + (statsById.get(a.id)?.monthlyRevenue ?? 0), 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por nombre, código o correo…" className="max-w-xs" />
        <Select value={estado} onValueChange={(v) => setEstado(v as typeof estado)}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="active">Solo activos</SelectItem>
            <SelectItem value="inactive">Solo inactivos</SelectItem>
          </SelectContent>
        </Select>
        <Button onClick={() => setShowForm(!showForm)} className="interactive ml-auto"><Plus className="w-4 h-4 mr-2" /> Nuevo Embajador</Button>
      </div>

      {showForm && (
        <Card className="rounded-2xl border-0 shadow-md shadow-black/5">
          <CardContent className="pt-6 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
              <div><Label>Nombre</Label><Input value={newAmbassador.name} onChange={(e) => setNewAmbassador({ ...newAmbassador, name: e.target.value })} className="mt-1" /></div>
              <div><Label>Código</Label><Input value={newAmbassador.code} onChange={(e) => setNewAmbassador({ ...newAmbassador, code: e.target.value.toUpperCase() })} className="mt-1 font-mono" placeholder="SOFIA" /></div>
              <div>
                <Label>% fijo (opcional)</Label>
                <Input type="number" value={newAmbassador.commissionPercent} onChange={(e) => setNewAmbassador({ ...newAmbassador, commissionPercent: e.target.value })} className="mt-1" placeholder="Escala" />
              </div>
              <div><Label>Correo</Label><Input value={newAmbassador.email} onChange={(e) => setNewAmbassador({ ...newAmbassador, email: e.target.value })} className="mt-1" placeholder="Para el correo semanal" /></div>
              <div><Label>Contacto (opcional)</Label><Input value={newAmbassador.contact} onChange={(e) => setNewAmbassador({ ...newAmbassador, contact: e.target.value })} className="mt-1" placeholder="Teléfono o Instagram" /></div>
            </div>
            <p className="text-xs text-muted-foreground">
              Deja el "% fijo" vacío para que use la escala del programa (30% a 50% según sus ventas del mes). Solo
              ponle un número si ese embajador tiene un trato distinto al resto.
            </p>
            <div className="flex gap-2">
              <WriteButton onClick={handleCreate} disabled={!newAmbassador.name || !newAmbassador.code || createAmbassador.isPending}>Crear Embajador</WriteButton>
              <Button variant="outline" onClick={() => setShowForm(false)}>Cancelar</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="rounded-2xl border-0 shadow-md shadow-black/5">
        <CardContent className="pt-6">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 px-3">Embajador</th>
                  <th className="text-left py-2 px-3">Código</th>
                  <th className="text-left py-2 px-3">% Comisión</th>
                  <th className="text-left py-2 px-3">Ventas del mes</th>
                  <th className="text-left py-2 px-3">Monto vendido</th>
                  <th className="text-left py-2 px-3">Comisión del mes</th>
                  <th className="text-left py-2 px-3">Correo</th>
                  <th className="text-left py-2 px-3">Contacto</th>
                  <th className="text-left py-2 px-3">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {visibles.map((a: any) => (
                  <Fragment key={a.id}>
                    <AmbassadorRow
                      ambassador={a}
                      stats={statsById.get(a.id)}
                      expanded={expandedId === a.id}
                      onToggleExpand={() => setExpandedId(expandedId === a.id ? null : a.id)}
                      updating={updateAmbassador.isPending}
                      deleting={deleteAmbassador.isPending}
                      onUpdate={(data) => updateAmbassador.mutateAsync({ id: a.id, ...data })}
                      onDelete={() => deleteAmbassador.mutateAsync({ id: a.id })}
                    />
                    {expandedId === a.id && (
                      <AmbassadorProfileRow
                        ambassadorId={a.id}
                        monthKey={monthKey}
                        deliveredKeys={deliveredByAmbassador.get(a.id) ?? new Set()}
                        onMarkBenefit={(benefitKey) => markBenefit.mutate({ ambassadorId: a.id, monthKey, benefitKey })}
                        onUnmarkBenefit={(benefitKey) => unmarkBenefit.mutate({ ambassadorId: a.id, monthKey, benefitKey })}
                        marking={markBenefit.isPending}
                        unmarking={unmarkBenefit.isPending}
                      />
                    )}
                  </Fragment>
                ))}
                {visibles.length === 0 && (
                  <tr><td colSpan={9} className="py-8 text-center text-muted-foreground">
                    {ambassadors.length === 0 ? 'Sin embajadores todavía. Crea el primero con el botón de arriba.' : 'Ningún embajador coincide con el filtro.'}
                  </td></tr>
                )}
              </tbody>
              {visibles.length > 0 && (
                <tfoot>
                  <tr className="border-t border-border font-semibold">
                    <td colSpan={4} className="py-2 px-3 text-right">Total del mes</td>
                    <td className="py-2 px-3">${totalVendido.toLocaleString('es-CL')}</td>
                    <td className="py-2 px-3 text-primary">${totalComision.toLocaleString('es-CL')}</td>
                    <td colSpan={3}></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

const APPLICATION_STATUS_LABEL: Record<string, string> = { pendiente: 'Pendiente', aprobada: 'Aprobada', rechazada: 'Rechazada' };

/** Postulaciones públicas de /embajadores. Aprobar crea al embajador ahí
 * mismo con el código que escribe el admin (reusa createExclusiveAmbassador
 * en el servidor); rechazar deja una nota opcional y no borra la fila, para
 * que esa persona pueda volver a postular más adelante. */
function AmbassadorApplicationsTab() {
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

function AmbassadorRankingTab({ monthKey }: { monthKey: string }) {
  const { data } = trpc.ambassadors.getRanking.useQuery({ monthKey });
  const ranking = (data ?? []).filter((r: any) => r.exclusiveSales > 0 || r.existingSales > 0);
  const MEDALLAS = ['🥇', '🥈', '🥉'];

  return (
    <Card className="rounded-2xl border-0 shadow-md shadow-black/5">
      <CardContent className="pt-6">
        <p className="text-muted-foreground text-sm mb-4">
          Ordenado por cantidad de ventas a clientes exclusivos, no por dinero.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-2 px-3">#</th>
                <th className="text-left py-2 px-3">Embajador</th>
                <th className="text-left py-2 px-3">Ventas exclusivas</th>
                <th className="text-left py-2 px-3">Monto vendido</th>
                <th className="text-left py-2 px-3">Comisión del mes</th>
                <th className="text-left py-2 px-3">Comisión acumulada</th>
              </tr>
            </thead>
            <tbody>
              {ranking.map((r: any, i: number) => (
                <tr key={r.id} className={`border-b border-border/50 ${i < 3 ? 'bg-primary/5' : ''}`}>
                  <td className="py-2 px-3 font-bold">{MEDALLAS[i] ?? r.position}</td>
                  <td className="py-2 px-3">
                    {r.name} <span className="font-mono text-primary text-xs">{r.code}</span>
                  </td>
                  <td className="py-2 px-3 font-semibold">{r.exclusiveSales}</td>
                  <td className="py-2 px-3">${r.monthlyRevenue.toLocaleString('es-CL')}</td>
                  <td className="py-2 px-3 text-primary font-semibold">${r.monthlyCommission.toLocaleString('es-CL')}</td>
                  <td className="py-2 px-3 text-muted-foreground">${r.totalCommission.toLocaleString('es-CL')}</td>
                </tr>
              ))}
              {ranking.length === 0 && (
                <tr><td colSpan={6} className="py-8 text-center text-muted-foreground">Sin ventas de embajadores este mes.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function ReferredClientsTab() {
  const { data } = trpc.ambassadors.listReferredClients.useQuery();
  const clientes = data ?? [];
  const [search, setSearch] = useState('');

  const visibles = clientes.filter((c: any) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return c.customerEmail.toLowerCase().includes(q) || c.ambassadorName.toLowerCase().includes(q);
  });

  return (
    <div className="space-y-4">
      <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por cliente o embajador…" className="max-w-xs" />
      <Card className="rounded-2xl border-0 shadow-md shadow-black/5">
        <CardContent className="pt-6">
          <p className="text-muted-foreground text-sm mb-4">
            Los <strong>exclusivos</strong> son propiedad permanente de su embajador: todas sus compras futuras le pagan.
            Los <strong>existentes</strong> ya estaban en la base antes del programa y nunca cambian de dueño.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 px-3">Cliente</th>
                  <th className="text-left py-2 px-3">Embajador</th>
                  <th className="text-left py-2 px-3">Primera compra</th>
                  <th className="text-left py-2 px-3">Compras</th>
                  <th className="text-left py-2 px-3">Monto total</th>
                  <th className="text-left py-2 px-3">Estado</th>
                </tr>
              </thead>
              <tbody>
                {visibles.map((c: any, i: number) => (
                  <tr key={`${c.customerEmail}-${i}`} className="border-b border-border/50">
                    <td className="py-2 px-3">{c.customerEmail}</td>
                    <td className="py-2 px-3">{c.ambassadorName}</td>
                    <td className="py-2 px-3">{formatChileShortDate(c.firstPurchaseAt)}</td>
                    <td className="py-2 px-3">{c.ordersCount}</td>
                    <td className="py-2 px-3">${c.totalSpent.toLocaleString('es-CL')}</td>
                    <td className="py-2 px-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs ${c.clientType === 'exclusivo' ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground'}`}>
                        {c.clientType === 'exclusivo' ? 'Cliente Exclusivo' : 'Cliente Existente'}
                      </span>
                    </td>
                  </tr>
                ))}
                {visibles.length === 0 && (
                  <tr><td colSpan={6} className="py-8 text-center text-muted-foreground">Sin clientes referidos todavía.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/** Material que va en el correo semanal de los embajadores. Si no hay nada
 * cargado, el correo omite esa sección en vez de mandar un bloque vacío. */
function WeeklyMaterialTab() {
  const { data, refetch } = trpc.ambassadors.getWeeklyMaterial.useQuery();
  const save = trpc.ambassadors.saveWeeklyMaterial.useMutation({
    onSuccess: () => { refetch(); toast.success('Material de la semana guardado'); },
    onError: onMutationError,
  });
  const sendNow = trpc.ambassadors.sendWeeklyNow.useMutation({
    onSuccess: (r: any) => toast.success(`Correos enviados: ${r.sent}. Sin correo cargado: ${r.skipped}. Con error: ${r.failed}.`),
    onError: onMutationError,
  });

  const [form, setForm] = useState({ title: '', storiesText: '', reelText: '', postText: '', countdownText: '', linkUrl: '' });
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!data || loaded) return;
    setForm({
      title: data.title ?? '',
      storiesText: data.storiesText ?? '',
      reelText: data.reelText ?? '',
      postText: data.postText ?? '',
      countdownText: data.countdownText ?? '',
      linkUrl: data.linkUrl ?? '',
    });
    setLoaded(true);
  }, [data, loaded]);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm({ ...form, [k]: e.target.value });

  // Generación con IA: rellena los campos pero NO guarda -- el dueño revisa y
  // edita antes de apretar "Guardar", igual que en el compositor de mailing.
  const [idea, setIdea] = useState('');
  const generar = trpc.ambassadors.generateWeeklyMaterial.useMutation({
    onSuccess: (c) => {
      setForm((prev) => ({
        ...prev,
        title: c.title,
        storiesText: c.storiesText,
        reelText: c.reelText,
        postText: c.postText,
        countdownText: c.countdownText,
      }));
      setLoaded(true); // que la carga del material guardado no pise lo generado
      toast.success('Material generado — revísalo y edita lo que quieras antes de guardar');
    },
    onError: onMutationError,
  });

  return (
    <div className="space-y-6">
      <Card className="rounded-2xl border-0 shadow-md shadow-black/5">
        <CardHeader><CardTitle>Material de esta semana</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground text-sm">
            Lo que escribas acá va en el correo semanal de todos los embajadores. Deja en blanco lo que no quieras
            incluir. Si dejas la cuenta regresiva vacía, el correo la arma solo con los días que faltan para el próximo
            evento destacado.
          </p>

          <div className="rounded-xl border border-border bg-muted/20 p-3 space-y-2">
            <Label>¿De qué va la semana?</Label>
            <div className="flex flex-col sm:flex-row gap-2">
              <Input
                value={idea}
                onChange={(e) => setIdea(e.target.value)}
                placeholder="Ej: se confirmó el line-up y quedan pocas entradas de preventa"
              />
              <WriteButton
                type="button"
                variant="outline"
                className="interactive shrink-0"
                disabled={idea.trim().length < 5 || generar.isPending}
                onClick={() => generar.mutate({ idea: idea.trim() })}
              >
                {generar.isPending ? 'Generando…' : 'Generar con IA'}
              </WriteButton>
            </div>
            <p className="text-xs text-muted-foreground">
              Rellena los campos de abajo con la fecha del evento y las tareas del programa. No guarda nada:
              revisa el texto y aprieta "Guardar material".
            </p>
          </div>
          <div><Label>Título (opcional)</Label><Input value={form.title} onChange={set('title')} className="mt-1" placeholder="Ej: Semana 1 — lanzamiento de Candyland" /></div>
          <div><Label>Historias</Label><Textarea value={form.storiesText} onChange={set('storiesText')} className="mt-1" rows={2} placeholder="Qué subir en historias esta semana" /></div>
          <div><Label>Reel</Label><Textarea value={form.reelText} onChange={set('reelText')} className="mt-1" rows={2} placeholder="Idea del reel" /></div>
          <div><Label>Publicación</Label><Textarea value={form.postText} onChange={set('postText')} className="mt-1" rows={2} placeholder="Texto sugerido para el post" /></div>
          <div><Label>Cuenta regresiva</Label><Input value={form.countdownText} onChange={set('countdownText')} className="mt-1" placeholder="Se arma sola si lo dejas vacío" /></div>
          <div><Label>Link del material (opcional)</Label><Input value={form.linkUrl} onChange={set('linkUrl')} className="mt-1" placeholder="Carpeta de Drive con las fotos y videos" /></div>
          <div className="flex flex-wrap gap-2">
            <WriteButton onClick={() => save.mutate(form)} disabled={save.isPending} className="interactive">
              {save.isPending ? 'Guardando…' : 'Guardar material'}
            </WriteButton>
            <WriteButton variant="outline" onClick={() => sendNow.mutate()} disabled={sendNow.isPending}>
              {sendNow.isPending ? 'Enviando…' : 'Enviar el correo ahora'}
            </WriteButton>
          </div>
          <p className="text-xs text-muted-foreground">
            "Enviar ahora" manda el resumen a todos los embajadores activos que tengan correo cargado, sin esperar al
            día configurado. Sirve para probarlo o para reenviarlo si un envío falló.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

/** Toda la configuración del programa. El dueño pidió explícitamente que
 * nada quede fijo en el código. */
function ProgramConfigTab() {
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

  useEffect(() => {
    if (!data) return;
    setScale(data.commissionScale);
    setBenefits(data.benefits);
    setExistingPercent(String(data.existingClientPercent));
    setLaunchDate(new Date(data.launchDate).toISOString().slice(0, 10));
    setWeeklyEnabled(data.weeklyEmailEnabled);
    setWeekday(String(data.weeklyEmailWeekday));
  }, [data]);

  const DIAS = [
    { value: '1', label: 'Lunes' }, { value: '2', label: 'Martes' }, { value: '3', label: 'Miércoles' },
    { value: '4', label: 'Jueves' }, { value: '5', label: 'Viernes' }, { value: '6', label: 'Sábado' },
    { value: '0', label: 'Domingo' },
  ];

  return (
    <div className="space-y-6">
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
        <CardHeader><CardTitle>Beneficios por ventas del mes</CardTitle></CardHeader>
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
          <div className="max-w-xs">
            <Label>Día de la semana</Label>
            <Select value={weekday} onValueChange={setWeekday}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>{DIAS.map((d) => <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <p className="text-xs text-muted-foreground">
            El envío sale con la corrida diaria del sistema, cerca de las 9 de la mañana en Chile. La hora exacta no se
            puede mover desde acá (la fija el plan de Vercel); este día es el que decide si ese envío se hace o no.
          </p>
          <WriteButton
            onClick={() => update.mutate({ weeklyEmailEnabled: weeklyEnabled, weeklyEmailWeekday: Number(weekday) })}
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

function CajaAdminView() {
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
function ResetTestDataCard({ eventId, eventTitle }: { eventId: number; eventTitle: string }) {
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
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={() => reset.mutate({ eventId })}>Sí, reiniciar</AlertDialogAction>
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
function OperatorEmailInput({ operatorId, email, onSave }: { operatorId: number; email: string | null; onSave: (email: string) => void }) {
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

function OperatorsManager({ eventId }: { eventId: number }) {
  const { data: operators, refetch } = trpc.operators.listAll.useQuery({ eventId });
  const create = trpc.operators.create.useMutation({ onSuccess: () => { refetch(); toast.success('Operador creado'); setForm({ name: '', pin: '', role: 'caja', email: '' }); }, onError: onMutationError });
  const update = trpc.operators.update.useMutation({ onSuccess: () => { refetch(); toast.success('Actualizado'); }, onError: onMutationError });
  const deleteOperator = trpc.operators.delete.useMutation({ onSuccess: () => { refetch(); toast.success('Operador eliminado'); }, onError: onMutationError });
  const [form, setForm] = useState({ name: '', pin: '', role: 'caja' as 'admin' | 'supervisor' | 'caja' | 'barra' | 'acceso' | 'cocina' | 'guardarropia', email: '' });

  return (
    <Card className="rounded-2xl border-0 shadow-md shadow-black/5">
      <CardHeader><CardTitle>Operadores</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
          <div><Label>Nombre</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="mt-1" /></div>
          <div><Label>PIN (4-8 dígitos)</Label><Input value={form.pin} onChange={(e) => setForm({ ...form, pin: e.target.value })} className="mt-1" maxLength={8} /></div>
          <div>
            <Label>Rol</Label>
            <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v as any })}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="caja">Caja</SelectItem>
                <SelectItem value="supervisor">Supervisor</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
                <SelectItem value="barra">Barra</SelectItem>
                <SelectItem value="acceso">Control acceso</SelectItem>
                <SelectItem value="cocina">Cocina</SelectItem>
                <SelectItem value="guardarropia">Guardarropía</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div><Label>Email (opcional)</Label><Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="mt-1" type="email" placeholder="Para el PDF de cierre" /></div>
          <WriteButton disabled={!form.name || form.pin.length < 4 || create.isPending} onClick={() => create.mutate({ ...form, eventId, email: form.email || undefined })}>Crear operador</WriteButton>
        </div>
        <div className="space-y-2">
          {(operators ?? []).map((op: any) => (
            <div key={op.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border/50">
              <div>
                <p className="font-medium">{op.name}</p>
                <p className="text-xs text-muted-foreground capitalize">{op.role} · {op.active ? 'activo' : 'inactivo'}</p>
              </div>
              <div className="flex items-center gap-2">
                <OperatorEmailInput operatorId={op.id} email={op.email ?? null} onSave={(email) => update.mutate({ id: op.id, email: email || null })} />
                <WriteButton variant="outline" size="sm" onClick={() => update.mutate({ id: op.id, active: op.active ? 0 : 1 })}>
                  {op.active ? 'Desactivar' : 'Activar'}
                </WriteButton>
                <ConfirmDeleteButton
                  description={`Vas a eliminar al operador "${op.name}". Si ya tiene ventas, turnos o canjes registrados, no se va a poder -- desactívalo en ese caso.`}
                  onConfirm={() => deleteOperator.mutateAsync({ id: op.id })}
                />
              </div>
            </div>
          ))}
          {operators && operators.length === 0 && <p className="text-sm text-muted-foreground">Sin operadores todavía para este evento.</p>}
        </div>
      </CardContent>
    </Card>
  );
}

function RegistersManager({ eventId }: { eventId: number }) {
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
                onConfirm={() => deleteRegister.mutateAsync({ id: r.id })}
              />
            </span>
          ))}
          {registersList && registersList.length === 0 && <p className="text-sm text-muted-foreground">Sin cajas creadas todavía -- los operadores podrán entrar "sin caja asignada".</p>}
        </div>
      </CardContent>
    </Card>
  );
}

function DevicesManager({ eventId }: { eventId: number }) {
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
                  onConfirm={() => deleteDevice.mutateAsync({ id: d.id })}
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

const TICKET_CATEGORY_LABEL: Record<string, string> = {
  acceso: 'Acceso', extra: 'Extra', consumo: 'Consumo', locker: 'Guardarropía', merch: 'Merch',
};

const PIE_COLORS = ['#111827', '#6366f1', '#ec4899', '#f59e0b', '#10b981', '#3b82f6', '#ef4444', '#8b5cf6'];

type ProfitSort = 'revenue' | 'units' | 'margin' | 'name';
type ProfitGroupBy = 'none' | 'category' | 'groupName';

/** "Margen por producto": pedido explícito del usuario -- poder ordenar por
 * distintos criterios, agrupar por categoría o por grupo del menú, y ver
 * gráficos para leer de un vistazo cómo estuvo el evento en vez de tener que
 * leer la tabla entera fila por fila. */
function ProfitReport({ eventId }: { eventId: number }) {
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
function ReportToolbar({ eventId, kind }: { eventId: number; kind: 'ventas' | 'gastos' }) {
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
function KitchenVendorReportCard({ eventId }: { eventId: number }) {
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
function EventMultiSelect({
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

function EventComparisonReport({ events }: { events: any[] }) {
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

const emptyExpenseForm = {
  scope: 'evento' as 'evento' | 'general',
  eventId: null as number | null,
  expenseDate: '',
  category: 'produccion' as ExpenseCategory,
  description: '',
  supplier: '',
  documentNumber: '',
  documentType: 'boleta' as ExpenseDocumentType,
  ivaExempt: false,
  amountTotal: 0,
  paymentMethod: 'transferencia' as ExpensePaymentMethod,
  recurrence: 'none' as 'none' | 'mensual',
  excludeFromPnl: false,
  prorate: true,
  notes: '',
};

function ExpenseForm({ events, onSaved }: { events: any[]; onSaved: () => void }) {
  const [show, setShow] = useState(false);
  const [form, setForm] = useState(emptyExpenseForm);
  const create = trpc.expenses.create.useMutation({
    onSuccess: () => { onSaved(); toast.success('Gasto registrado'); setForm(emptyExpenseForm); setShow(false); },
    onError: onMutationError,
  });

  // Vista previa del desglose: solo la factura no exenta separa IVA.
  const preview = deriveAmounts({ amountTotal: form.amountTotal, documentType: form.documentType, ivaExempt: form.ivaExempt });

  const canSave = form.amountTotal > 0 && form.description.trim().length > 0
    && (form.scope === 'general' || !!form.eventId);

  const handleSave = () => {
    create.mutate({
      ...form,
      supplier: form.supplier || undefined,
      documentNumber: form.documentNumber || undefined,
      notes: form.notes || undefined,
      eventId: form.scope === 'evento' ? form.eventId : null,
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
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label>¿A qué se imputa?</Label>
                <Select value={form.scope} onValueChange={(v) => setForm({ ...form, scope: v as 'evento' | 'general' })}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="evento">Un evento puntual</SelectItem>
                    <SelectItem value="general">La productora (se reparte entre los eventos del mes)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {form.scope === 'evento' && (
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

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>Proveedor</Label>
                <Input value={form.supplier} onChange={(e) => setForm({ ...form, supplier: e.target.value })} className="mt-1" placeholder="Opcional" />
              </div>
              <div>
                <Label>Notas</Label>
                <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="mt-1" placeholder="Opcional" />
              </div>
            </div>

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
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input type="checkbox" checked={form.recurrence === 'mensual'} onChange={(e) => setForm({ ...form, recurrence: e.target.checked ? 'mensual' : 'none' })} className="w-4 h-4 accent-primary" />
                <span className="text-sm">Se repite todos los meses (suscripción)</span>
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

function ExpensesList({ events, refreshKey, onChanged }: { events: any[]; refreshKey: number; onChanged: () => void }) {
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

  return (
    <Card className="rounded-2xl border-0 shadow-md shadow-black/5">
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
          <span className="text-sm text-muted-foreground ml-auto">
            {rows.length} gasto(s) · <strong className="text-foreground">${total.toLocaleString('es-CL')}</strong>
          </span>
        </div>

        <div className="space-y-2">
          {rows.map((r: any) => (
            <div key={r.id} className="flex items-center justify-between gap-3 text-sm bg-muted/30 rounded-lg px-3 py-2">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold">{r.description}</span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-primary/15 text-primary">{categoryLabel(r.category)}</span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">{documentTypeLabel(r.documentType)}</span>
                  {r.excludeFromPnl === 1 && <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-600">No resta del resultado</span>}
                  {r.recurrence === 'mensual' && <span className="text-xs px-2 py-0.5 rounded-full bg-violet-electric/15 text-violet-electric">Mensual</span>}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {formatChileShortDate(r.expenseDate)} · {r.eventTitle ?? 'Productora'} · {paymentMethodLabel(r.paymentMethod)}
                  {r.supplier ? ` · ${r.supplier}` : ''}
                  {r.ivaAmount > 0 ? ` · IVA $${r.ivaAmount.toLocaleString('es-CL')}` : ''}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="font-semibold tabular-nums">${r.amountTotal.toLocaleString('es-CL')}</span>
                <ConfirmDeleteButton description={`Vas a eliminar el gasto "${r.description}".`} onConfirm={() => remove.mutateAsync({ id: r.id })} />
              </div>
            </div>
          ))}
          {rows.length === 0 && <p className="text-sm text-muted-foreground py-4 text-center">Sin gastos registrados con estos filtros.</p>}
        </div>
      </CardContent>
    </Card>
  );
}

/** Una línea de la cascada del resultado. `negative` la muestra restando. */
function PnlRow({ label, amount, negative, hint, strong }: { label: string; amount: number; negative?: boolean; hint?: string; strong?: boolean }) {
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

function EventPnlReport({ eventId, refreshKey }: { eventId: number; refreshKey: number }) {
  const { data, refetch } = trpc.cajaReports.eventPnl.useQuery({ eventId });
  useEffect(() => { refetch(); }, [refreshKey, refetch]);

  if (!data) return null;
  const positive = data.netProfit >= 0;

  return (
    <Card className="rounded-2xl border-0 shadow-md shadow-black/5">
      <CardHeader><CardTitle>Resultado real de {data.title}</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        {data.warnings.length > 0 && (
          <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 space-y-1.5">
            {data.warnings.map((w: string, i: number) => (
              <p key={i} className="text-xs text-amber-700 dark:text-amber-400">⚠️ {w}</p>
            ))}
          </div>
        )}

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

          <PnlRow label="Utilidad neta" amount={data.netProfit} strong />
        </div>

        <div className="flex flex-wrap gap-3">
          <div className={`rounded-xl px-4 py-3 ${positive ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400' : 'bg-destructive/10 text-destructive'}`}>
            <p className="text-xs uppercase tracking-wide font-semibold opacity-80">Margen</p>
            <p className="text-2xl font-bold tabular-nums">{data.marginPercent != null ? `${data.marginPercent}%` : '—'}</p>
          </div>
          {data.ivaApplies && (
            <div className="rounded-xl px-4 py-3 bg-muted/50">
              <p className="text-xs uppercase tracking-wide font-semibold text-muted-foreground">IVA a pagar al SII</p>
              <p className="text-2xl font-bold tabular-nums">${data.iva.ivaAPagar.toLocaleString('es-CL')}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Débito ${data.iva.debitoFiscal.toLocaleString('es-CL')} − crédito ${data.iva.creditoFiscal.toLocaleString('es-CL')}
                {data.iva.remanenteCredito > 0 && ` · remanente a favor $${data.iva.remanenteCredito.toLocaleString('es-CL')}`}
              </p>
            </div>
          )}
        </div>

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

function PnlComparison({ refreshKey, events }: { refreshKey: number; events: any[] }) {
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

function GastosView() {
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
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="font-heading text-2xl">Gastos y P&amp;L</h2>
          <p className="text-sm text-muted-foreground mt-0.5">Cuánto entró, cuánto salió y cuánto quedó en cada fiesta.</p>
        </div>
        {events.length > 0 && (
          <Select value={String(activeEventId)} onValueChange={(v) => setEventId(Number(v))}>
            <SelectTrigger className="w-64"><SelectValue /></SelectTrigger>
            <SelectContent>
              {events.map((e: any) => <SelectItem key={e.id} value={String(e.id)}>{e.title}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
      </div>

      {activeEventId && <EventPnlReport eventId={activeEventId} refreshKey={refreshKey} />}
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

function PeakHoursReport({ eventId }: { eventId: number }) {
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

function LedgerView({ eventId }: { eventId: number }) {
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

/** Cuadres de caja guardados por turno (pedido explícito del usuario) --
 * comparables entre eventos porque quedan persistidos, no reconstruidos del
 * ledger. "Todos los eventos" por defecto para poder comparar fiestas. */
function ShiftClosingsReport({ events }: { events: { id: number; title: string }[] }) {
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
            <Button variant="outline" size="sm" className="interactive">Descargar PDF</Button>
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

            <div className="grid grid-cols-3 gap-3 mt-3 text-sm">
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
            </div>

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
function DeleteShiftClosingButton({ shiftId, label, onDeleted }: { shiftId: number; label: string; onDeleted: () => void }) {
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
            onClick={() => deleteShift.mutate({ shiftId, password })}
          >
            {deleteShift.isPending ? 'Eliminando…' : 'Eliminar'}
          </WriteButton>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** Tarjeta de "Ajustes" para administrar passkeys (Face ID/Touch ID) -- camino
 * adicional al login con contraseña+TOTP, no lo reemplaza. Registrar un
 * dispositivo nuevo requiere ya estar adentro (adminProcedure), por eso vive
 * acá y no en AdminLoginForm. */
function WebauthnSecurityCard() {
  const { data: credentials, refetch } = trpc.auth.webauthnCredentialsList.useQuery();
  const [registering, setRegistering] = useState(false);
  const [addingDevice, setAddingDevice] = useState(false);
  const [deviceLabel, setDeviceLabel] = useState('');

  const registrationOptions = trpc.auth.webauthnRegistrationOptions.useMutation();
  const registrationVerify = trpc.auth.webauthnRegistrationVerify.useMutation({
    onSuccess: () => { refetch(); toast.success('Dispositivo registrado'); },
    onError: onMutationError,
  });
  const deleteCredential = trpc.auth.webauthnCredentialDelete.useMutation({
    onSuccess: () => { refetch(); toast.success('Dispositivo eliminado'); },
    onError: onMutationError,
  });

  // El nombre se pide ANTES en un campo propio (no window.prompt): un diálogo
  // nativo bloqueante en medio del flujo le puede hacer perder al navegador
  // el "gesto del usuario" que WebAuthn exige justo al llamar a
  // startRegistration -- en iOS/iPadOS eso se traduce en un NotAllowedError
  // silencioso y ningún dispositivo guardado.
  const registrarDispositivo = async () => {
    const label = deviceLabel.trim();
    if (!label) return;
    setRegistering(true);
    try {
      const { options, ticket } = await registrationOptions.mutateAsync();
      const response = await startRegistration({ optionsJSON: options });
      await registrationVerify.mutateAsync({ ticket, deviceLabel: label, response });
      setDeviceLabel('');
      setAddingDevice(false);
    } catch (e: any) {
      toast.error(
        e?.name === 'NotAllowedError'
          ? 'No se pudo completar el registro con Face ID/Touch ID. Intenta de nuevo sin cambiar de pestaña.'
          : e?.message || 'No se pudo registrar el dispositivo.'
      );
    } finally {
      setRegistering(false);
    }
  };

  return (
    <Card className="rounded-2xl border-0 shadow-md shadow-black/5">
      <CardHeader><CardTitle>Seguridad — Face ID / Touch ID</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <p className="text-muted-foreground text-sm">
          Registra este iPhone o iPad Pro para entrar al panel con Face ID/Touch ID, sin escribir
          la contraseña ni el código de la app de autenticación. Es un camino adicional -- el login
          de siempre sigue funcionando igual.
        </p>
        {credentials && credentials.length > 0 && (
          <div className="space-y-2">
            {credentials.map((c) => (
              <div key={c.id} className="flex items-center justify-between gap-3 p-3 rounded-xl bg-muted/50">
                <div>
                  <p className="text-sm font-medium">{c.deviceLabel}</p>
                  <p className="text-xs text-muted-foreground">
                    Registrado {new Date(c.createdAt).toLocaleDateString('es-CL')}
                    {c.lastUsedAt ? ` · Último uso ${new Date(c.lastUsedAt).toLocaleDateString('es-CL')}` : ' · Sin usar todavía'}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => { if (window.confirm(`¿Quitar "${c.deviceLabel}"?`)) deleteCredential.mutate({ id: c.id }); }}
                  disabled={deleteCredential.isPending}
                  className="interactive text-destructive"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
        {addingDevice ? (
          <div className="flex flex-col sm:flex-row gap-2">
            <Input
              value={deviceLabel}
              onChange={(e) => setDeviceLabel(e.target.value)}
              placeholder='Nombre del dispositivo (ej. "iPhone de Alexis")'
              autoFocus
              onKeyDown={(e) => { if (e.key === 'Enter' && deviceLabel.trim()) registrarDispositivo(); }}
              className="flex-1"
            />
            <div className="flex gap-2">
              <WriteButton onClick={registrarDispositivo} disabled={registering || !deviceLabel.trim()} className="interactive gap-2">
                <Fingerprint className="w-4 h-4" />
                {registering ? 'Registrando…' : 'Continuar'}
              </WriteButton>
              <Button variant="ghost" onClick={() => { setAddingDevice(false); setDeviceLabel(''); }} disabled={registering} className="interactive">
                Cancelar
              </Button>
            </div>
          </div>
        ) : (
          <WriteButton onClick={() => setAddingDevice(true)} className="interactive gap-2">
            <Fingerprint className="w-4 h-4" />
            Registrar este dispositivo
          </WriteButton>
        )}
      </CardContent>
    </Card>
  );
}

function SettingsManager() {
  const { data: settings, refetch } = trpc.settings.get.useQuery();
  const updateSettings = trpc.settings.update.useMutation({ onSuccess: () => { refetch(); toast.success('Ajustes guardados'); }, onError: onMutationError });
  // Mismo número que llega en el correo de las 3am -- acá se puede revisar
  // manual en cualquier momento, sin esperar el correo.
  const { data: checkin } = trpc.settings.checkinCount.useQuery(undefined, { refetchInterval: 30_000 });
  const [followers, setFollowers] = useState('');
  const [posts, setPosts] = useState('');
  const [feePercent, setFeePercent] = useState('');
  const [vendorName, setVendorName] = useState('');
  const [vendorEmail, setVendorEmail] = useState('');

  useEffect(() => {
    if (settings) {
      setFollowers(String(settings.instagramFollowers ?? 0));
      setPosts(String(settings.instagramPosts ?? 0));
      setFeePercent(String(settings.serviceFeePercent ?? 0));
      setVendorName((settings as any).kitchenVendorName ?? '');
      setVendorEmail((settings as any).kitchenVendorEmail ?? '');
    }
  }, [settings]);

  const handleSave = () => {
    updateSettings.mutate({ instagramFollowers: Number(followers) || 0, instagramPosts: Number(posts) || 0 });
  };

  const handleSaveFee = () => {
    updateSettings.mutate({ serviceFeePercent: Number(feePercent) || 0 });
  };

  const handleSaveVendor = () => {
    updateSettings.mutate({ kitchenVendorName: vendorName || null, kitchenVendorEmail: vendorEmail || null });
  };

  return (
    <div className="space-y-6">
      <h2 className="font-heading text-2xl">Ajustes</h2>
      <Card className="rounded-2xl border-0 shadow-md shadow-black/5">
        <CardHeader><CardTitle>Personas y entradas</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {checkin ? (
            <>
              <p className="text-muted-foreground text-sm">{checkin.eventTitle}</p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-4xl font-heading font-extrabold">{checkin.expectedCount.toLocaleString('es-CL')}</p>
                  <p className="text-muted-foreground text-sm">Personas con entrada comprada</p>
                </div>
                <div>
                  <p className="text-4xl font-heading font-extrabold">{checkin.insideCount.toLocaleString('es-CL')}</p>
                  <p className="text-muted-foreground text-sm">Ya ingresaron a la fiesta</p>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">Se actualiza solo cada 30 segundos. "Entrada comprada" cuenta personas, no órdenes -- un Dúo suma 2, un Grupo suma 4 -- e incluye abonos de Misión 300 ya pagados aunque su ticket todavía no se haya generado.</p>
            </>
          ) : (
            <p className="text-muted-foreground text-sm">No hay un evento activo con datos de puerta todavía.</p>
          )}
        </CardContent>
      </Card>
      <Card className="rounded-2xl border-0 shadow-md shadow-black/5">
        <CardHeader><CardTitle>Instagram</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground text-sm">Números que se muestran junto al ícono de Instagram en el footer. Actualízalos cuando quieras — no se auto-sincronizan.</p>
          <div className="grid grid-cols-2 gap-4">
            <div><Label>Seguidores</Label><Input type="number" value={followers} onChange={(e) => setFollowers(e.target.value)} className="mt-1" /></div>
            <div><Label>Publicaciones</Label><Input type="number" value={posts} onChange={(e) => setPosts(e.target.value)} className="mt-1" /></div>
          </div>
          <WriteButton onClick={handleSave} disabled={updateSettings.isPending} className="interactive">
            {updateSettings.isPending ? 'Guardando…' : 'Guardar'}
          </WriteButton>
        </CardContent>
      </Card>
      <Card className="rounded-2xl border-0 shadow-md shadow-black/5">
        <CardHeader><CardTitle>Recargo por servicio</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground text-sm">
            Porcentaje que se suma al total de cada venta nueva (entradas + extras), calculado sobre el monto ya con
            descuento aplicado. Aparece en el checkout y en el correo como "Cargo por servicio" con el monto — sin
            mostrar el porcentaje. No afecta órdenes ya creadas.
          </p>
          <div className="max-w-xs">
            <Label>Recargo (%)</Label>
            <Input type="number" step="0.01" min="0" max="100" value={feePercent} onChange={(e) => setFeePercent(e.target.value)} className="mt-1" />
          </div>
          <WriteButton onClick={handleSaveFee} disabled={updateSettings.isPending} className="interactive">
            {updateSettings.isPending ? 'Guardando…' : 'Guardar'}
          </WriteButton>
        </CardContent>
      </Card>
      <Card className="rounded-2xl border-0 shadow-md shadow-black/5">
        <CardHeader><CardTitle>Proveedor de cocina</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground text-sm">
            A quién rendirle cuentas de lo vendido en productos de cocina. Se usa en Gastos y P&amp;L → Ventas → Reporte de cocina para mandarle el detalle por email.
          </p>
          <div className="grid grid-cols-2 gap-4">
            <div><Label>Nombre</Label><Input value={vendorName} onChange={(e) => setVendorName(e.target.value)} className="mt-1" /></div>
            <div><Label>Email</Label><Input type="email" value={vendorEmail} onChange={(e) => setVendorEmail(e.target.value)} className="mt-1" /></div>
          </div>
          <WriteButton onClick={handleSaveVendor} disabled={updateSettings.isPending} className="interactive">
            {updateSettings.isPending ? 'Guardando…' : 'Guardar'}
          </WriteButton>
        </CardContent>
      </Card>
      <WebauthnSecurityCard />
    </div>
  );
}


/* ─── Carta de la fiesta ──────────────────────────────────────────────────
 * Los tragos, la comida, la guardarropía y el merch son `ticketTypes` con
 * categoría propia (consumo/locker/merch) del evento -- no una tabla nueva
 * (docs/ARQUITECTURA-CAJA.md §12). La ventaja concreta de reusar esa tabla:
 * la venta queda como `orders` con channel='caja', así que el reporte, el
 * CSV y el PDF del admin ya las ven sin tocar nada.
 *
 * Y la ventaja de que sean categorías propias en vez de 'extra': el checkout
 * de la web lista addons filtrando `category === 'extra'`, así que un trago
 * NO aparece en el sitio, no emite ticket y no manda correo. Se vende solo
 * en la barra, que es lo que corresponde. */

const CARTA_CATEGORIES = [
  { id: 'consumo', label: 'Tragos y comida', emoji: '🍹', color: '#f472b6', help: 'Todo lo que se consume en la fiesta: tragos, cervezas, bebidas, comida.' },
  { id: 'locker', label: 'Guardarropía', emoji: '🧥', color: '#818cf8', help: 'Se cobra igual que un producto; al confirmar, la caja pide el número de la percha.' },
  { id: 'merch', label: 'Merch', emoji: '🎁', color: '#fbbf24', help: 'Poleras, stickers, lo que se venda de recuerdo.' },
  { id: 'extra', label: 'Extras de la web', emoji: '🎫', color: '#34d399', help: 'Estacionamiento, covers y demás addons que TAMBIÉN se ofrecen en el checkout del sitio.' },
] as const;

type CartaCategory = typeof CARTA_CATEGORIES[number]['id'];

// Emojis sugeridos para no tener que ir a buscarlos a otro lado. El dueño
// eligió emoji + color en vez de fotos: se lee mejor que una miniatura en una
// tablet a oscuras, y no obliga a construir subida de imágenes (que hoy no
// existe en el proyecto).
const EMOJI_SUGGESTIONS: Record<CartaCategory, string[]> = {
  consumo: ['🍹', '🍺', '🍷', '🥃', '🍸', '🥤', '💧', '⚡', '🍔', '🌭', '🍕', '🌮', '🍟', '🍫'],
  locker: ['🧥', '🎒', '👜', '🧣', '☂️'],
  merch: ['👕', '🧢', '🩲', '🏷️', '💿', '✨'],
  extra: ['🅿️', '⭐', '🎫', '🎟️', '🛋️'],
};

const COLOR_PALETTE = ['#f472b6', '#fb7185', '#f59e0b', '#fbbf24', '#34d399', '#22d3ee', '#60a5fa', '#818cf8', '#a78bfa', '#e879f9'];

const emptyProduct = (category: CartaCategory) => ({
  name: '',
  category,
  groupName: '',
  emoji: EMOJI_SUGGESTIONS[category][0],
  color: CARTA_CATEGORIES.find((c) => c.id === category)!.color as string,
  price: 0,
  costPrice: 0,
  totalStock: 100,
  sortOrder: 0,
  toKitchen: category === 'consumo' ? 0 : 0,
  // Ingredientes/sabores especiales -- se muestra en /caja al mantener
  // presionada la tarjeta, para que la cajera pueda responder preguntas del
  // cliente sin ir a buscarlo.
  description: '',
});

function CartaManager() {
  const { data: events } = trpc.events.listAll.useQuery();
  const [eventId, setEventId] = useState<number | null>(null);
  const activeId = eventId ?? events?.[0]?.id ?? null;

  const utils = trpc.useUtils();
  const { data: allTypes, refetch } = trpc.events.listTicketTypes.useQuery({ eventId: activeId! }, { enabled: !!activeId });

  const [tab, setTab] = useState<CartaCategory>('consumo');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState(emptyProduct('consumo'));

  const onSaved = (msg: string) => {
    utils.events.listTicketTypes.invalidate();
    refetch();
    toast.success(msg);
    setShowForm(false);
    setEditingId(null);
  };
  const createType = trpc.events.createTicketType.useMutation({ onSuccess: () => onSaved('Producto creado'), onError: onMutationError });
  const updateType = trpc.events.updateTicketType.useMutation({ onSuccess: () => onSaved('Producto actualizado'), onError: onMutationError });
  const deleteType = trpc.events.deleteTicketType.useMutation({ onSuccess: () => refetch(), onError: onMutationError });
  // Mismo endpoint que edita el producto (events.updateTicketType ya acepta
  // `status`) -- así el admin puede agotar/reponer sin depender de /cocina.
  const toggleSoldOut = trpc.events.updateTicketType.useMutation({
    onSuccess: () => { utils.events.listTicketTypes.invalidate(); refetch(); },
    onError: onMutationError,
  });

  const products = (allTypes ?? []).filter((t: any) => t.category === tab);
  const meta = CARTA_CATEGORIES.find((c) => c.id === tab)!;

  const openNew = () => { setForm(emptyProduct(tab)); setEditingId(null); setShowForm(true); };
  const openEdit = (p: any) => {
    setForm({
      name: p.name,
      category: p.category,
      groupName: p.groupName ?? '',
      emoji: p.emoji ?? EMOJI_SUGGESTIONS[tab][0],
      color: p.color ?? meta.color,
      price: Number(p.price),
      costPrice: p.costPrice != null ? Number(p.costPrice) : 0,
      totalStock: Number(p.totalStock),
      sortOrder: Number(p.sortOrder ?? 0),
      toKitchen: Number(p.toKitchen ?? 0),
      description: p.description ?? '',
    });
    setEditingId(p.id);
    setShowForm(true);
  };

  const save = async () => {
    if (!activeId) return;
    if (!form.name.trim()) { toast.error('Ponle un nombre al producto'); return; }
    if (form.price <= 0) { toast.error('El precio tiene que ser mayor a 0'); return; }
    const payload = {
      name: form.name.trim(),
      category: form.category,
      groupName: form.groupName.trim() || undefined,
      emoji: form.emoji || undefined,
      color: form.color,
      price: form.price,
      costPrice: form.costPrice || undefined,
      totalStock: form.totalStock,
      sortOrder: form.sortOrder,
      toKitchen: form.toKitchen,
      description: form.description.trim() || undefined,
    };
    try {
      if (editingId) await updateType.mutateAsync({ id: editingId, ...payload });
      else await createType.mutateAsync({ eventId: activeId, ...payload });
    } catch {
      // onMutationError ya avisó; se deja el formulario abierto para reintentar
    }
  };

  // Agrupadas por sección para que la lista se lea como la carta de verdad.
  const groups = products.reduce((acc: Record<string, any[]>, p: any) => {
    const key = p.groupName || 'Sin sección';
    (acc[key] ||= []).push(p);
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap justify-between items-start gap-3">
        <div>
          <h2 className="font-heading text-2xl">Carta de la fiesta</h2>
          <p className="text-muted-foreground text-sm mt-1">
            Lo que se vende en la barra: tragos, comida, guardarropía y merch. Aparece como botón en /caja y <strong>no</strong> se muestra en el sitio web.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={activeId ? String(activeId) : ''} onValueChange={(v) => setEventId(Number(v))}>
            <SelectTrigger className="w-[220px]"><SelectValue placeholder="Evento" /></SelectTrigger>
            <SelectContent>
              {(events ?? []).map((e: any) => <SelectItem key={e.id} value={String(e.id)}>{e.title}</SelectItem>)}
            </SelectContent>
          </Select>
          <WriteButton onClick={openNew} className="interactive"><Plus className="w-4 h-4 mr-2" /> Nuevo producto</WriteButton>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {CARTA_CATEGORIES.map((c) => (
          <button
            key={c.id}
            onClick={() => { setTab(c.id); setShowForm(false); }}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-colors interactive ${tab === c.id ? 'bg-primary text-white' : 'bg-muted text-muted-foreground hover:bg-muted/70'}`}
          >
            {c.emoji} {c.label}
          </button>
        ))}
      </div>
      <p className="text-muted-foreground text-xs -mt-3">{meta.help}</p>

      {showForm && (
        <Card className="rounded-2xl border-0 shadow-md shadow-black/5">
          <CardContent className="pt-6 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-2">
                <Label>Nombre</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="mt-1" placeholder="Ej: Piscola" />
              </div>
              <div>
                <Label>Sección</Label>
                <Input value={form.groupName} onChange={(e) => setForm({ ...form, groupName: e.target.value })} className="mt-1" placeholder="Ej: Tragos" />
                <p className="text-muted-foreground text-xs mt-1">Arma las pestañas de la grilla en /caja.</p>
              </div>
            </div>

            <div>
              <Label>Ingredientes / sabores especiales</Label>
              <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="mt-1" placeholder="Ej: Pisco, jugo de maracuyá natural, un toque de menta" rows={2} />
              <p className="text-muted-foreground text-xs mt-1">Opcional. Aparece en /caja al mantener presionada la tarjeta del producto, para que la cajera pueda responder preguntas del cliente.</p>
            </div>

            <div>
              <Label>Ícono</Label>
              <div className="flex flex-wrap gap-2 mt-1">
                {EMOJI_SUGGESTIONS[form.category].map((em) => (
                  <button
                    key={em}
                    onClick={() => setForm({ ...form, emoji: em })}
                    className={`w-11 h-11 rounded-xl text-2xl leading-none flex items-center justify-center border transition-colors interactive ${form.emoji === em ? 'border-primary bg-primary/10' : 'border-border hover:bg-muted'}`}
                  >
                    {em}
                  </button>
                ))}
                <Input
                  value={form.emoji}
                  onChange={(e) => setForm({ ...form, emoji: e.target.value.slice(0, 4) })}
                  className="w-20 h-11 text-center text-xl"
                  aria-label="Otro emoji"
                />
              </div>
            </div>

            <div>
              <Label>Color del botón</Label>
              <div className="flex flex-wrap gap-2 mt-1">
                {COLOR_PALETTE.map((c) => (
                  <button
                    key={c}
                    onClick={() => setForm({ ...form, color: c })}
                    style={{ backgroundColor: c }}
                    className={`w-9 h-9 rounded-full transition-transform interactive ${form.color === c ? 'ring-2 ring-offset-2 ring-foreground scale-110' : ''}`}
                    aria-label={`Color ${c}`}
                  />
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div><Label>Precio</Label><Input type="number" value={form.price} onChange={(e) => setForm({ ...form, price: Number(e.target.value) })} className="mt-1" /></div>
              <div>
                <Label>Costo</Label>
                <Input type="number" value={form.costPrice} onChange={(e) => setForm({ ...form, costPrice: Number(e.target.value) })} className="mt-1" />
                <p className="text-muted-foreground text-xs mt-1">Para ver el margen. Si no se carga, ese dato se pierde para siempre.</p>
              </div>
              <div>
                <Label>Stock</Label>
                <Input type="number" value={form.totalStock} onChange={(e) => setForm({ ...form, totalStock: Number(e.target.value) })} className="mt-1" />
                <p className="text-muted-foreground text-xs mt-1">Solo avisa: nunca impide vender.</p>
              </div>
              <div>
                <Label>Orden</Label>
                <Input type="number" value={form.sortOrder} onChange={(e) => setForm({ ...form, sortOrder: Number(e.target.value) })} className="mt-1" />
                <p className="text-muted-foreground text-xs mt-1">Menor = más arriba. Pon los más vendidos primero.</p>
              </div>
            </div>

            <label className="flex items-start gap-3 cursor-pointer">
              <Checkbox checked={form.toKitchen === 1} onCheckedChange={(v) => setForm({ ...form, toKitchen: v ? 1 : 0 })} className="mt-0.5" />
              <span className="text-sm">
                Lo prepara la cocina
                <span className="block text-muted-foreground text-xs">Al venderse genera una comanda en la pantalla de cocina con el número de pedido.</span>
              </span>
            </label>

            <div className="flex gap-2">
              <WriteButton onClick={save} disabled={createType.isPending || updateType.isPending}>
                {editingId ? 'Guardar cambios' : 'Crear producto'}
              </WriteButton>
              <Button variant="outline" onClick={() => { setShowForm(false); setEditingId(null); }}>Cancelar</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {products.length === 0 && !showForm && (
        <Card className="rounded-2xl border-0 shadow-md shadow-black/5">
          <CardContent className="pt-6 text-center text-muted-foreground text-sm">
            Todavía no hay nada cargado en «{meta.label}». Apreta «Nuevo producto» para empezar la carta.
          </CardContent>
        </Card>
      )}

      {Object.entries(groups).map(([groupName, items]) => (
        <div key={groupName} className="space-y-2">
          <h3 className="font-heading text-lg">{groupName}</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {(items as any[]).map((p) => {
              const left = Number(p.totalStock) - Number(p.soldCount);
              return (
                <Card key={p.id} className="rounded-2xl border-0 shadow-md shadow-black/5">
                  <CardContent className="pt-4 flex items-center gap-3">
                    <div
                      className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl shrink-0"
                      style={{ backgroundColor: (p.color || meta.color) + '22' }}
                    >
                      {p.emoji || meta.emoji}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold truncate flex items-center gap-2">
                        {p.name}
                        {p.status === 'soldout' && (
                          <span className="text-[10px] font-bold uppercase tracking-wide text-red-600 bg-red-100 px-1.5 py-0.5 rounded">Agotado</span>
                        )}
                      </p>
                      <p className="text-muted-foreground text-sm">
                        ${Number(p.price).toLocaleString('es-CL')}
                        {p.costPrice != null && <span className="ml-2 text-xs">margen ${(Number(p.price) - Number(p.costPrice)).toLocaleString('es-CL')}</span>}
                      </p>
                      <p className={`text-xs mt-0.5 ${left <= 0 ? 'text-red-500 font-medium' : 'text-muted-foreground'}`}>
                        {left <= 0 ? 'Sin stock (igual se puede vender)' : `Quedan ${left}`}
                        {Number(p.toKitchen) === 1 && <span className="ml-2">· va a cocina</span>}
                      </p>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <WriteButton
                        variant="outline"
                        size="sm"
                        disabled={toggleSoldOut.isPending}
                        onClick={() => toggleSoldOut.mutate({ id: p.id, status: p.status === 'soldout' ? 'active' : 'soldout' })}
                        className={p.status === 'soldout' ? 'text-green-600 border-green-300' : 'text-red-600 border-red-300'}
                      >
                        {p.status === 'soldout' ? 'Reponer' : <><Ban className="w-3 h-3 mr-1" /> Agotar</>}
                      </WriteButton>
                      <Button variant="outline" size="sm" onClick={() => openEdit(p)}><Edit className="w-3 h-3" /></Button>
                      <ConfirmDeleteButton description={`Vas a eliminar "${p.name}" de la carta.`} onConfirm={() => deleteType.mutateAsync({ id: p.id })} />
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

const ADMIN_SECTIONS = [
  { id: 'events', label: 'Eventos', icon: Calendar, render: () => <EventsManager /> },
  { id: 'carta', label: 'Carta de la Fiesta', icon: Martini, render: () => <CartaManager /> },
  { id: 'orders-web', label: 'Ventas Web', icon: Ticket, render: () => <OrdersView channel="web" /> },
  { id: 'sales-origin', label: 'Ventas por Origen', icon: Compass, render: () => <SalesByOriginView /> },
  { id: 'orders-caja', label: 'Ventas Caja', icon: ShoppingBag, render: () => <OrdersView channel="caja" /> },
  { id: 'manual-access', label: 'Accesos Manuales', icon: Gift, render: () => <ManualAccessSection /> },
  { id: 'discounts', label: 'Descuentos', icon: Percent, render: () => <DiscountsManager /> },
  { id: 'community', label: 'Códigos Comunidad', icon: Users, render: () => <CommunityCodesManager /> },
  { id: 'blocked-customers', label: 'Bloqueo de Clientes', icon: Ban, render: () => <BlockedCustomersManager /> },
  { id: 'customers', label: 'Clientes', icon: Contact, render: () => <CustomersView /> },
  { id: 'leads', label: 'Leads', icon: UserPlus, render: () => <LeadsView /> },
  { id: 'mailing', label: 'Mailing', icon: Mail, render: () => <MailingSection /> },
  { id: 'mailing-history', label: 'Historial de Mailing', icon: History, render: () => <MailingHistoryView /> },
  { id: 'referrals', label: 'Referidos', icon: Trophy, render: () => <ReferralsView /> },
  { id: 'ambassadors', label: 'Embajadores VIP', icon: Crown, render: () => <AmbassadorsView /> },
  { id: 'party-gifts', label: 'Tragos de la Fiesta', icon: Martini, render: () => <PartyGiftsView /> },
  { id: 'caja', label: 'Caja', icon: Store, render: () => <CajaAdminView /> },
  { id: 'gastos', label: 'Gastos y P&L', icon: Receipt, render: () => <GastosView /> },
  { id: 'settings', label: 'Ajustes', icon: SettingsIcon, render: () => <SettingsManager /> },
] as const;

/** Tragos que se invitaron durante una fiesta. Lo importante para el local
 * es la última columna: los "pagado" que nadie retiró son plata cobrada
 * que todavía se debe en la barra, y siguen válidos para la próxima
 * fiesta (decisión del dueño). */
function PartyGiftsView() {
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

export default function AdminDashboard() {
  // El panel nunca debe aparecer en Google. robots.txt no basta -- ademas
  // publica la ruta a quien lo lea; la etiqueta noindex es lo que de verdad
  // lo mantiene fuera del indice.
  useSeo({ title: 'Panel — Mansion Playroom', description: '', path: '/admin', noindex: true });
  // Instalable en la pantalla de inicio, sin la barra del navegador.
  useInstallableApp('/admin.webmanifest', '/admin/sw.js', '/admin/', 'Admin');

  const { user, loading, isAuthenticated, logout } = useAuth();
  const [activeSection, setActiveSection] = useState<typeof ADMIN_SECTIONS[number]['id']>('events');

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-secondary/10 to-background">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <AdminLoginForm />;
  }

  if (!canOpenAdmin(user?.role)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-secondary/10 to-background">
        <div className="text-center">
          <h2 className="font-heading text-3xl mb-4">Sin Permisos</h2>
          <p className="text-muted-foreground">No tienes permisos de administrador.</p>
        </div>
      </div>
    );
  }

  const isDemo = user?.role === 'viewer';

  const active = ADMIN_SECTIONS.find((s) => s.id === activeSection) ?? ADMIN_SECTIONS[0];

  return (
    <SidebarProvider>
      <Sidebar collapsible="icon" className="border-r-0">
        <SidebarHeader className="h-16 justify-center px-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-primary to-secondary flex items-center justify-center shrink-0">
              <LayoutDashboard className="w-4 h-4 text-primary-foreground" />
            </div>
            <span className="font-heading text-lg tracking-tight group-data-[collapsible=icon]:hidden">
              {isDemo ? 'Invitado (demo)' : 'Mansion Playroom'}
            </span>
          </div>
        </SidebarHeader>
        <SidebarContent className="px-2 py-2">
          <SidebarMenu>
            {ADMIN_SECTIONS.map((section) => (
              <SidebarMenuItem key={section.id}>
                <SidebarMenuButton
                  isActive={activeSection === section.id}
                  onClick={() => setActiveSection(section.id)}
                  tooltip={section.label}
                  className="h-10 rounded-xl data-[active=true]:bg-gradient-to-r data-[active=true]:from-primary/15 data-[active=true]:to-secondary/15 data-[active=true]:text-primary data-[active=true]:font-semibold"
                >
                  <section.icon className="h-4 w-4" />
                  <span>{section.label}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarContent>
        <SidebarFooter className="p-3">
          <button
            onClick={() => logout()}
            className="flex items-center gap-2 rounded-xl px-2 py-2 hover:bg-destructive/10 hover:text-destructive transition-colors w-full text-left text-sm text-muted-foreground"
          >
            <LogOut className="h-4 w-4 shrink-0" />
            <span className="group-data-[collapsible=icon]:hidden">Cerrar sesión</span>
          </button>
        </SidebarFooter>
      </Sidebar>

      <SidebarInset className="bg-gradient-to-br from-background via-secondary/5 to-background">
        <header className="flex items-center gap-3 h-16 px-6 border-b border-border/40">
          <SidebarTrigger className="rounded-lg" />
          <h1 className="font-heading text-2xl">{active.label}</h1>
          {isDemo && (
            <span className="ml-auto flex items-center gap-1.5 rounded-full bg-amber-500/15 px-3 py-1 text-xs font-semibold text-amber-600 dark:text-amber-400">
              <Eye className="h-3.5 w-3.5" />
              Modo demo — solo lectura
            </span>
          )}
        </header>
        <main className="p-6">
          <motion.div
            key={activeSection}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35 }}
          >
            {active.render()}
          </motion.div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
