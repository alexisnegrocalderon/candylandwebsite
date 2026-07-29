import { Fragment, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { useAuth } from '@/_core/hooks/useAuth';
import { trpc } from '@/lib/trpc';
import { useSeo } from '@/hooks/useSeo';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Calendar, DollarSign, Ticket, Users, Plus, Edit, ShoppingBag, Store, Percent, Trophy, LayoutDashboard, Settings as SettingsIcon, LogOut, Contact, X, Upload, Download, Mail, History, ChevronDown, ChevronUp, Gift, MessageCircle, Trash2, Crown, Martini } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogTrigger, AlertDialogContent, AlertDialogHeader,
  AlertDialogFooter, AlertDialogTitle, AlertDialogDescription, AlertDialogAction, AlertDialogCancel,
} from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { ConfirmDeleteButton } from '@/components/admin/ConfirmDeleteButton';
import { MailingComposer } from '@/components/admin/MailingComposer';
import { isMissionWindowOpen, missionDepositPrice } from '@shared/mission300';
import { monthKeyFor } from '@shared/ambassadorProgram';
import {
  SidebarProvider, Sidebar, SidebarContent, SidebarHeader, SidebarFooter,
  SidebarMenu, SidebarMenuItem, SidebarMenuButton, SidebarInset, SidebarTrigger,
} from '@/components/ui/sidebar';

/* Toda escritura del admin pasa por acá: sin esto, un error del servidor
 * (típicamente "Database not available" si falta DATABASE_URL) fallaba en
 * silencio — el botón volvía a su estado normal sin avisar que no se guardó nada. */
const onMutationError = (error: unknown) => {
  const message = error instanceof Error ? error.message : 'No se pudo guardar. Intenta de nuevo.';
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
            · vence {cutoff.toLocaleDateString('es-CL')}
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
            <Button size="sm" onClick={() => { evaluate.mutate({ eventId }); setConfirming(false); }} disabled={evaluate.isPending}>Confirmar</Button>
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
    status: 'draft' as 'draft' | 'published' | 'soldout' | 'cancelled' | 'past', imageUrl: '', featured: false,
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
      eventDate: fromChileInputValue(newEvent.eventDate),
      doorsOpen: fromChileInputValue(newEvent.doorsOpen),
    };
    if (editingEventId) {
      await updateEvent.mutateAsync({ id: editingEventId, ...payload });
      setEditingEventId(null);
    } else {
      await createEvent.mutateAsync(payload);
    }
    setNewEvent({ title: '', slug: '', description: '', shortDescription: '', venue: '', address: '', mapsUrl: '', eventDate: '', doorsOpen: '', status: 'draft', imageUrl: '', featured: false });
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
            </div>
            <div className="flex gap-2">
              <Button onClick={handleCreateEvent} disabled={createEvent.isPending || updateEvent.isPending}>
                {editingEventId ? 'Guardar Cambios' : 'Crear Evento'}
              </Button>
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
                    <Button onClick={handleCreateTicketType} disabled={createTicketType.isPending || updateTicketType.isPending}>
                      {editingTicketId ? 'Guardar Cambios' : 'Crear Entrada'}
                    </Button>
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
        validUntil: newDiscount.validUntil || undefined,
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
              <Button onClick={handleCreate}>Crear Código</Button>
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
              <Button onClick={handleCreate}>Crear Código</Button>
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
                <Button variant="outline" size="sm" onClick={() => updateCode.mutateAsync({ id: c.id, isActive: c.isActive ? 0 : 1 })}>
                  {c.isActive ? 'Desactivar' : 'Activar'}
                </Button>
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

  const missionOpen = selectedEvent ? isMissionWindowOpen(new Date(selectedEvent.eventDate)) : false;

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
    </div>
  );
}

function OrdersView({ channel }: { channel: 'web' | 'caja' }) {
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
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
  const pendingCount = ordersList.filter((o: any) => o.paymentStatus === 'pending').length;

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
          <a href={exportUrl()} target="_blank" rel="noopener noreferrer">
            <Button variant="outline" className="interactive">Descargar CSV</Button>
          </a>
          <a href={printUrl()} target="_blank" rel="noopener noreferrer">
            <Button variant="outline" className="interactive">Descargar PDF</Button>
          </a>
        </div>
      </div>

      {pendingCount > 0 && (
        <p className="text-sm text-yellow-500">⚠️ {pendingCount} orden{pendingCount > 1 ? 'es' : ''} sin pagar — usa el filtro "Sin pagar" para exportar sus emails y contactarlos.</p>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard icon={DollarSign} colorClass="bg-[oklch(0.68_0.16_340)]" value={`$${Number(stats?.totalRevenue ?? 0).toLocaleString('es-CL')}`} label="Ingresos Totales" />
        <StatCard icon={Ticket} colorClass="bg-[oklch(0.72_0.1_300)]" value={stats?.totalOrders ?? 0} label="Órdenes Totales" />
        <StatCard icon={Users} colorClass="bg-[oklch(0.75_0.15_230)]" value={stats?.approvedOrders ?? 0} label="Pagos Aprobados" />
      </div>

      <Card className="rounded-2xl border-0 shadow-md shadow-black/5">
        <CardContent className="pt-6">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 px-3">Orden</th>
                  <th className="text-left py-2 px-3">Comprador</th>
                  <th className="text-left py-2 px-3">Total</th>
                  <th className="text-left py-2 px-3">Estado</th>
                  <th className="text-left py-2 px-3">Fecha</th>
                  <th className="text-left py-2 px-3">Contacto</th>
                  <th className="text-left py-2 px-3">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {ordersList.map((order: any) => (
                  <Fragment key={order.id}>
                    <tr className="border-b border-border/50">
                      <td className="py-2 px-3 font-mono text-xs">{order.orderNumber}</td>
                      <td className="py-2 px-3">{order.buyerName}<br/><span className="text-muted-foreground text-xs">{order.buyerEmail}</span></td>
                      <td className="py-2 px-3">${Number(order.total).toLocaleString('es-CL')}</td>
                      <td className="py-2 px-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs ${order.paymentStatus === 'approved' ? 'bg-green-500/20 text-green-400' : order.paymentStatus === 'pending' ? 'bg-yellow-500/20 text-yellow-400' : 'bg-red-500/20 text-red-400'}`}>
                          {order.paymentStatus}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-muted-foreground">{new Date(order.createdAt).toLocaleDateString('es-CL')}</td>
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
                        <td colSpan={7} className="py-3 px-3">
                          {loadingTickets ? (
                            <p className="text-xs text-muted-foreground">Cargando tickets...</p>
                          ) : orderTickets && orderTickets.length > 0 ? (
                            <div className="flex flex-wrap gap-2">
                              {orderTickets.map((t: any) => (
                                <span key={t.ticketCode} className="px-2 py-1 rounded-lg bg-background border border-border text-xs font-mono">
                                  {t.ticketTypeName} · {t.ticketCode} · <span className="text-muted-foreground">{t.status}</span>
                                </span>
                              ))}
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
          <a href={exportUrl()} target="_blank" rel="noopener noreferrer">
            <Button variant="outline" className="interactive">
              <Download className="w-4 h-4 mr-2" />
              Exportar CSV
            </Button>
          </a>
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
                          <Button
                            size="sm" variant="outline" className="h-7 text-xs px-2"
                            onClick={() => {
                              const delta = Number(adjustByCustomer[c.id]);
                              if (!Number.isFinite(delta) || delta === 0) return;
                              adjustPlaycoins.mutate({ customerId: c.id, delta, note: 'Ajuste manual desde admin' });
                              setAdjustByCustomer((prev) => ({ ...prev, [c.id]: '' }));
                            }}
                          >
                            OK
                          </Button>
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
        toast.error(`Ningún email del CSV matcheó con la base de clientes -- mirá el detalle abajo.`);
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
        <p className="text-sm text-muted-foreground">Armá una audiencia, generá el mail con IA, y mandalo -- cada envío exitoso queda tageado con el nombre de campaña para no repetir destinatarios.</p>
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
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${c.status === 'done' ? 'bg-primary/10 text-primary' : 'bg-amber-500/10 text-amber-600'}`}>
                    {c.status === 'done' ? 'Terminada' : 'Enviando…'}
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
            <Button size="sm" onClick={handleSave} disabled={updating || !name || !code}>Guardar</Button>
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
                    <td className="py-1.5 px-2">{new Date(s.createdAt).toLocaleDateString('es-CL')}</td>
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
  { id: 'ranking', label: 'Ranking' },
  { id: 'clientes', label: 'Clientes referidos' },
  { id: 'material', label: 'Material de la semana' },
  { id: 'config', label: 'Configuración' },
] as const;

function AmbassadorsView() {
  const [tab, setTab] = useState<typeof AMBASSADOR_TABS[number]['id']>('resumen');
  const meses = monthOptions();
  const [monthKey, setMonthKey] = useState(meses[0].value);

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
        {tab !== 'config' && tab !== 'clientes' && tab !== 'material' && (
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
            className={`px-4 py-2 rounded-full text-sm font-medium transition-colors interactive ${
              tab === t.id ? 'bg-primary text-primary-foreground' : 'bg-muted/40 text-muted-foreground hover:text-foreground'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'resumen' && <AmbassadorSummaryTab monthKey={monthKey} />}
      {tab === 'embajadores' && <AmbassadorsListTab monthKey={monthKey} />}
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
        <StatCard icon={Crown} colorClass="bg-[oklch(0.68_0.16_340)]" value={data?.activeAmbassadors ?? 0} label="Embajadores activos" />
        <StatCard icon={Ticket} colorClass="bg-[oklch(0.72_0.1_300)]" value={data?.monthlySales ?? 0} label="Ventas del mes" />
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
              <Button onClick={handleCreate} disabled={!newAmbassador.name || !newAmbassador.code || createAmbassador.isPending}>Crear Embajador</Button>
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
                    <td className="py-2 px-3">{new Date(c.firstPurchaseAt).toLocaleDateString('es-CL')}</td>
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
          <div><Label>Título (opcional)</Label><Input value={form.title} onChange={set('title')} className="mt-1" placeholder="Ej: Semana 1 — lanzamiento de Candyland" /></div>
          <div><Label>Historias</Label><Textarea value={form.storiesText} onChange={set('storiesText')} className="mt-1" rows={2} placeholder="Qué subir en historias esta semana" /></div>
          <div><Label>Reel</Label><Textarea value={form.reelText} onChange={set('reelText')} className="mt-1" rows={2} placeholder="Idea del reel" /></div>
          <div><Label>Publicación</Label><Textarea value={form.postText} onChange={set('postText')} className="mt-1" rows={2} placeholder="Texto sugerido para el post" /></div>
          <div><Label>Cuenta regresiva</Label><Input value={form.countdownText} onChange={set('countdownText')} className="mt-1" placeholder="Se arma sola si lo dejas vacío" /></div>
          <div><Label>Link del material (opcional)</Label><Input value={form.linkUrl} onChange={set('linkUrl')} className="mt-1" placeholder="Carpeta de Drive con las fotos y videos" /></div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => save.mutate(form)} disabled={save.isPending} className="interactive">
              {save.isPending ? 'Guardando…' : 'Guardar material'}
            </Button>
            <Button variant="outline" onClick={() => sendNow.mutate()} disabled={sendNow.isPending}>
              {sendNow.isPending ? 'Enviando…' : 'Enviar el correo ahora'}
            </Button>
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
          <Button
            onClick={() => update.mutate({ commissionScale: scale, existingClientPercent: Number(existingPercent) || 0 })}
            disabled={update.isPending}
            className="interactive"
          >
            {update.isPending ? 'Guardando…' : 'Guardar escala'}
          </Button>
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
          <Button onClick={() => update.mutate({ benefits })} disabled={update.isPending} className="interactive">
            {update.isPending ? 'Guardando…' : 'Guardar beneficios'}
          </Button>
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
          <Button
            onClick={() => update.mutate({ launchDate: new Date(`${launchDate}T00:00:00`).toISOString() })}
            disabled={update.isPending || !launchDate}
            className="interactive"
          >
            {update.isPending ? 'Guardando…' : 'Guardar fecha'}
          </Button>
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
          <Button
            onClick={() => update.mutate({ weeklyEmailEnabled: weeklyEnabled, weeklyEmailWeekday: Number(weekday) })}
            disabled={update.isPending}
            className="interactive"
          >
            {update.isPending ? 'Guardando…' : 'Guardar correo semanal'}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function CajaAdminView() {
  const { data: eventsData } = trpc.events.listAll.useQuery();
  const events = eventsData ?? [];
  const [eventId, setEventId] = useState<number | null>(null);
  const activeEventId = eventId ?? events[0]?.id ?? null;

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

      <OperatorsManager />
      <RegistersManager />
      <DevicesManager />
      {activeEventId && <ProfitReport eventId={activeEventId} />}
      <EventComparisonReport />
      {activeEventId && <PeakHoursReport eventId={activeEventId} />}
      <ShiftClosingsReport events={events} />
      {activeEventId && <LedgerView eventId={activeEventId} />}
    </div>
  );
}

function OperatorsManager() {
  const { data: operators, refetch } = trpc.operators.listAll.useQuery();
  const create = trpc.operators.create.useMutation({ onSuccess: () => { refetch(); toast.success('Operador creado'); setForm({ name: '', pin: '', role: 'caja' }); }, onError: onMutationError });
  const update = trpc.operators.update.useMutation({ onSuccess: () => { refetch(); toast.success('Actualizado'); }, onError: onMutationError });
  const [form, setForm] = useState({ name: '', pin: '', role: 'caja' as 'admin' | 'supervisor' | 'caja' | 'barra' | 'acceso' });

  return (
    <Card className="rounded-2xl border-0 shadow-md shadow-black/5">
      <CardHeader><CardTitle>Operadores</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
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
              </SelectContent>
            </Select>
          </div>
          <Button disabled={!form.name || form.pin.length < 4 || create.isPending} onClick={() => create.mutate(form)}>Crear operador</Button>
        </div>
        <div className="space-y-2">
          {(operators ?? []).map((op: any) => (
            <div key={op.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border/50">
              <div>
                <p className="font-medium">{op.name}</p>
                <p className="text-xs text-muted-foreground capitalize">{op.role} · {op.active ? 'activo' : 'inactivo'}</p>
              </div>
              <Button variant="outline" size="sm" onClick={() => update.mutate({ id: op.id, active: op.active ? 0 : 1 })}>
                {op.active ? 'Desactivar' : 'Activar'}
              </Button>
            </div>
          ))}
          {operators && operators.length === 0 && <p className="text-sm text-muted-foreground">Sin operadores todavía.</p>}
        </div>
      </CardContent>
    </Card>
  );
}

function RegistersManager() {
  const { data: registersList, refetch } = trpc.registers.listAll.useQuery();
  const create = trpc.registers.create.useMutation({ onSuccess: () => { refetch(); toast.success('Caja creada'); setName(''); }, onError: onMutationError });
  const [name, setName] = useState('');

  return (
    <Card className="rounded-2xl border-0 shadow-md shadow-black/5">
      <CardHeader><CardTitle>Cajas físicas</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Caja 1" className="max-w-xs" />
          <Button disabled={!name.trim() || create.isPending} onClick={() => create.mutate({ name: name.trim() })}>Crear caja</Button>
        </div>
        <div className="flex flex-wrap gap-2">
          {(registersList ?? []).map((r: any) => (
            <span key={r.id} className="text-sm px-3 py-1 rounded-full bg-muted/30 border border-border/50">{r.name}{!r.active ? ' (inactiva)' : ''}</span>
          ))}
          {registersList && registersList.length === 0 && <p className="text-sm text-muted-foreground">Sin cajas creadas todavía -- los operadores podrán entrar "sin caja asignada".</p>}
        </div>
      </CardContent>
    </Card>
  );
}

function DevicesManager() {
  const { data: devicesList, refetch } = trpc.devices.listAll.useQuery();
  const create = trpc.devices.create.useMutation({ onSuccess: (res) => { refetch(); setName(''); setLastCode(res.enrollCode); }, onError: onMutationError });
  const setActive = trpc.devices.setActive.useMutation({ onSuccess: () => { refetch(); toast.success('Actualizado'); }, onError: onMutationError });
  const [name, setName] = useState('');
  const [lastCode, setLastCode] = useState<string | null>(null);

  return (
    <Card className="rounded-2xl border-0 shadow-md shadow-black/5">
      <CardHeader><CardTitle>Dispositivos enrolados</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">Solo las tablets/navegadores enrolados acá pueden llegar a la pantalla de PIN de /caja. Genera un código, dáselo a quien configura el dispositivo -- lo canjea una sola vez y vence a las 24h.</p>
        <div className="flex gap-2">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Tablet Caja 1" className="max-w-xs" />
          <Button disabled={!name.trim() || create.isPending} onClick={() => create.mutate({ name: name.trim() })}>Generar código</Button>
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
              <Button variant="outline" size="sm" onClick={() => setActive.mutate({ id: d.id, active: d.active ? 0 : 1 })}>
                {d.active ? 'Revocar' : 'Reactivar'}
              </Button>
            </div>
          ))}
          {devicesList && devicesList.length === 0 && <p className="text-sm text-muted-foreground">Sin dispositivos enrolados todavía.</p>}
        </div>
      </CardContent>
    </Card>
  );
}

function ProfitReport({ eventId }: { eventId: number }) {
  const { data } = trpc.cajaReports.profit.useQuery({ eventId });
  const rows = data ?? [];
  const totalRevenue = rows.reduce((s, r) => s + r.revenue, 0);
  const totalProfit = rows.reduce((s, r) => s + (r.profit ?? 0), 0);

  return (
    <Card className="rounded-2xl border-0 shadow-md shadow-black/5">
      <CardHeader><CardTitle>Utilidad y margen por producto</CardTitle></CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground mb-3">Ingresos totales: ${totalRevenue.toLocaleString('es-CL')} · Utilidad total: ${totalProfit.toLocaleString('es-CL')} <span className="text-xs">(solo productos con costo cargado)</span></p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-muted-foreground border-b border-border/50">
              <th className="py-2">Producto</th><th>Unidades</th><th>Ingresos</th><th>Costo</th><th>Utilidad</th><th>Margen</th>
            </tr></thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-b border-border/30">
                  <td className="py-2">{r.name}</td>
                  <td>{r.unitsSold}</td>
                  <td>${r.revenue.toLocaleString('es-CL')}</td>
                  <td>{r.cost != null ? `$${r.cost.toLocaleString('es-CL')}` : '—'}</td>
                  <td>{r.profit != null ? `$${r.profit.toLocaleString('es-CL')}` : '—'}</td>
                  <td>{r.marginPercent != null ? `${r.marginPercent}%` : '—'}</td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={6} className="py-4 text-center text-muted-foreground">Sin ventas todavía.</td></tr>}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function EventComparisonReport() {
  const { data } = trpc.cajaReports.eventComparison.useQuery();
  const rows = data ?? [];

  return (
    <Card className="rounded-2xl border-0 shadow-md shadow-black/5">
      <CardHeader><CardTitle>Comparativa entre eventos</CardTitle></CardHeader>
      <CardContent className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="text-left text-muted-foreground border-b border-border/50">
            <th className="py-2">Evento</th><th>Fecha</th><th>Entradas vendidas</th><th>Ingresos</th><th>Utilidad</th>
          </tr></thead>
          <tbody>
            {rows.map((r: any) => (
              <tr key={r.eventId} className="border-b border-border/30">
                <td className="py-2">{r.title}</td>
                <td>{new Date(r.eventDate).toLocaleDateString('es-CL', { timeZone: 'America/Santiago' })}</td>
                <td>{r.unitsSold}</td>
                <td>${r.revenue.toLocaleString('es-CL')}</td>
                <td>{r.profit != null ? `$${r.profit.toLocaleString('es-CL')}` : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
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
                <td className="py-2">{new Date(r.serverAt).toLocaleString('es-CL')}</td>
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
          <a href={exportUrl()} target="_blank" rel="noopener noreferrer">
            <Button variant="outline" size="sm" className="interactive">Exportar CSV</Button>
          </a>
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
                  {new Date(r.openedAt).toLocaleString('es-CL')} → {r.closedAt ? new Date(r.closedAt).toLocaleString('es-CL') : '—'}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={() => setExpandedId(expandedId === r.id ? null : r.id)}>
                  {expandedId === r.id ? 'Ocultar detalle' : 'Ver detalle'}
                </Button>
                <DeleteShiftClosingButton shiftId={r.id} label={`${r.eventTitle} · ${r.registerName} (${new Date(r.openedAt).toLocaleString('es-CL')})`} onDeleted={refetch} />
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
          <Button
            variant="destructive"
            disabled={!password || deleteShift.isPending}
            onClick={() => deleteShift.mutate({ shiftId, password })}
          >
            {deleteShift.isPending ? 'Eliminando…' : 'Eliminar'}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
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

  useEffect(() => {
    if (settings) {
      setFollowers(String(settings.instagramFollowers ?? 0));
      setPosts(String(settings.instagramPosts ?? 0));
      setFeePercent(String(settings.serviceFeePercent ?? 0));
    }
  }, [settings]);

  const handleSave = () => {
    updateSettings.mutate({ instagramFollowers: Number(followers) || 0, instagramPosts: Number(posts) || 0 });
  };

  const handleSaveFee = () => {
    updateSettings.mutate({ serviceFeePercent: Number(feePercent) || 0 });
  };

  return (
    <div className="space-y-6">
      <h2 className="font-heading text-2xl">Ajustes</h2>
      <Card className="rounded-2xl border-0 shadow-md shadow-black/5">
        <CardHeader><CardTitle>Personas adentro</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {checkin ? (
            <>
              <p className="text-muted-foreground text-sm">{checkin.eventTitle}</p>
              <p className="text-4xl font-heading font-extrabold">
                {checkin.insideCount.toLocaleString('es-CL')}
                <span className="text-muted-foreground text-lg font-semibold"> / {checkin.expectedCount.toLocaleString('es-CL')}</span>
              </p>
              <p className="text-xs text-muted-foreground">Se actualiza solo cada 30 segundos.</p>
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
          <Button onClick={handleSave} disabled={updateSettings.isPending} className="interactive">
            {updateSettings.isPending ? 'Guardando…' : 'Guardar'}
          </Button>
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
          <Button onClick={handleSaveFee} disabled={updateSettings.isPending} className="interactive">
            {updateSettings.isPending ? 'Guardando…' : 'Guardar'}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

/** Login del panel en dos pasos: contraseña y luego el código de la app de
 * autenticación. La contraseña sola ya no entrega sesión. */
function AdminLoginForm() {
  const utils = trpc.useUtils();
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [ticket, setTicket] = useState<string | null>(null);
  const [setup, setSetup] = useState<{ secret: string; qrImageUrl: string } | null>(null);
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);

  const entrar = async () => { setError(''); await utils.auth.me.invalidate(); };

  const setupTotp = trpc.auth.adminSetupTotp.useMutation({
    onSuccess: (r) => setSetup(r),
    onError: (e) => setError(e.message),
  });

  const login = trpc.auth.adminLogin.useMutation({
    onSuccess: (r) => {
      setError('');
      if (r.skipped2fa) { entrar(); return; }
      setTicket(r.ticket);
      if (r.needsSetup) setupTotp.mutate({ ticket: r.ticket });
    },
    onError: (e) => setError(e.message),
  });

  const confirmTotp = trpc.auth.adminConfirmTotp.useMutation({
    onSuccess: (r) => { setError(''); setBackupCodes(r.backupCodes); },
    onError: (e) => { setError(e.message); setCode(''); },
  });

  const verify = trpc.auth.adminVerifyCode.useMutation({
    onSuccess: (r) => {
      if (r.backupCodeUsed) {
        alert(`Entraste con un código de respaldo. Te quedan ${r.backupCodesLeft}.`);
      }
      entrar();
    },
    onError: (e) => { setError(e.message); setCode(''); },
  });

  // Los códigos de respaldo se muestran UNA sola vez: después solo queda
  // su hash guardado, y ni el sistema puede recuperarlos.
  if (backupCodes) {
    return (
      <div className="min-h-screen pt-24 flex items-center justify-center px-4">
        <div className="w-full max-w-md text-center">
          <h2 className="font-heading text-2xl mb-2">Guarda estos códigos</h2>
          <p className="text-muted-foreground text-sm mb-5">
            Son tu única forma de entrar si pierdes el teléfono. Se muestran una sola vez —
            anótalos en un papel o guárdalos en tu gestor de contraseñas. Cada uno sirve una vez.
          </p>
          <div className="grid grid-cols-2 gap-2 mb-6">
            {backupCodes.map((c) => (
              <code key={c} className="p-3 rounded-lg bg-muted font-mono text-sm tracking-wider">{c}</code>
            ))}
          </div>
          <Button onClick={entrar} className="interactive w-full h-12">Ya los guardé, entrar</Button>
        </div>
      </div>
    );
  }

  // Configuración inicial del segundo factor.
  if (setup) {
    return (
      <div className="min-h-screen pt-24 flex items-center justify-center px-4">
        <div className="w-full max-w-sm text-center">
          <h2 className="font-heading text-2xl mb-2">Configura tu segundo factor</h2>
          <p className="text-muted-foreground text-sm mb-5">
            Escanea este código con Google Authenticator (o la app que uses) y escribe el número que aparece.
          </p>
          <img src={setup.qrImageUrl} alt="Código QR para la app de autenticación" className="w-56 h-56 mx-auto rounded-xl mb-3" />
          <p className="text-xs text-amber-600 mb-4">
            Escribe el código sin recargar la página ni volver atrás. Si algo sale mal,
            vuelve a empezar desde la contraseña: el mismo QR sigue sirviendo.
          </p>
          <details className="mb-5 text-xs text-muted-foreground">
            <summary className="cursor-pointer">¿No puedes escanear?</summary>
            <code className="block mt-2 p-2 rounded bg-muted font-mono break-all">{setup.secret}</code>
          </details>
          <Input
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="000000"
            inputMode="numeric"
            autoFocus
            className="mb-3 h-14 text-center text-2xl tracking-[0.4em] font-mono"
          />
          {error && <p className="text-sm text-destructive mb-3" role="alert">{error}</p>}
          <Button
            onClick={() => ticket && confirmTotp.mutate({ ticket, code })}
            disabled={code.length !== 6 || confirmTotp.isPending}
            className="interactive w-full h-12"
          >
            {confirmTotp.isPending ? 'Verificando…' : 'Confirmar'}
          </Button>
        </div>
      </div>
    );
  }

  // Paso 2: el código.
  if (ticket) {
    return (
      <div className="min-h-screen pt-24 flex items-center justify-center px-4">
        <div className="w-full max-w-xs text-center">
          <h2 className="font-heading text-2xl mb-2">Código de verificación</h2>
          <p className="text-muted-foreground text-sm mb-5">
            Abre tu app de autenticación y escribe el número. También sirve uno de tus códigos de respaldo.
          </p>
          <Input
            value={code}
            onChange={(e) => setCode(e.target.value.slice(0, 9))}
            placeholder="000000"
            autoFocus
            className="mb-3 h-14 text-center text-2xl tracking-[0.3em] font-mono"
          />
          {error && <p className="text-sm text-destructive mb-3" role="alert">{error}</p>}
          <Button
            onClick={() => verify.mutate({ ticket, code })}
            disabled={code.length < 6 || verify.isPending}
            className="interactive w-full h-12"
          >
            {verify.isPending ? 'Verificando…' : 'Entrar'}
          </Button>
          <button
            onClick={() => { setTicket(null); setCode(''); setPassword(''); setError(''); }}
            className="text-xs text-muted-foreground mt-4 underline"
          >
            Volver
          </button>
        </div>
      </div>
    );
  }

  // Paso 1: la contraseña.
  return (
    <div className="min-h-screen pt-24 flex items-center justify-center px-4">
      <form
        onSubmit={(e) => { e.preventDefault(); if (password) login.mutate({ password }); }}
        className="text-center w-full max-w-xs"
      >
        <h2 className="font-heading text-3xl mb-4">Acceso Restringido</h2>
        <p className="text-muted-foreground mb-6">Ingresa la contraseña de administrador.</p>
        <Input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Contraseña"
          autoFocus
          className="mb-3 h-12 text-center"
        />
        {error && <p className="text-sm text-destructive mb-3" role="alert">{error}</p>}
        <Button type="submit" disabled={login.isPending || setupTotp.isPending || !password} className="interactive w-full">
          {login.isPending || setupTotp.isPending ? 'Entrando…' : 'Continuar'}
        </Button>
      </form>
    </div>
  );
}

const ADMIN_SECTIONS = [
  { id: 'events', label: 'Eventos', icon: Calendar, render: () => <EventsManager /> },
  { id: 'orders-web', label: 'Ventas Web', icon: Ticket, render: () => <OrdersView channel="web" /> },
  { id: 'orders-caja', label: 'Ventas Caja', icon: ShoppingBag, render: () => <OrdersView channel="caja" /> },
  { id: 'manual-access', label: 'Accesos Manuales', icon: Gift, render: () => <ManualAccessSection /> },
  { id: 'discounts', label: 'Descuentos', icon: Percent, render: () => <DiscountsManager /> },
  { id: 'community', label: 'Códigos Comunidad', icon: Users, render: () => <CommunityCodesManager /> },
  { id: 'customers', label: 'Clientes', icon: Contact, render: () => <CustomersView /> },
  { id: 'mailing', label: 'Mailing', icon: Mail, render: () => <MailingSection /> },
  { id: 'mailing-history', label: 'Historial de Mailing', icon: History, render: () => <MailingHistoryView /> },
  { id: 'referrals', label: 'Referidos', icon: Trophy, render: () => <ReferralsView /> },
  { id: 'ambassadors', label: 'Embajadores VIP', icon: Crown, render: () => <AmbassadorsView /> },
  { id: 'party-gifts', label: 'Tragos de la Fiesta', icon: Martini, render: () => <PartyGiftsView /> },
  { id: 'caja', label: 'Caja', icon: Store, render: () => <CajaAdminView /> },
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

  if (user?.role !== 'admin') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-secondary/10 to-background">
        <div className="text-center">
          <h2 className="font-heading text-3xl mb-4">Sin Permisos</h2>
          <p className="text-muted-foreground">No tienes permisos de administrador.</p>
        </div>
      </div>
    );
  }

  const active = ADMIN_SECTIONS.find((s) => s.id === activeSection) ?? ADMIN_SECTIONS[0];

  return (
    <SidebarProvider>
      <Sidebar collapsible="icon" className="border-r-0">
        <SidebarHeader className="h-16 justify-center px-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-primary to-secondary flex items-center justify-center shrink-0">
              <LayoutDashboard className="w-4 h-4 text-primary-foreground" />
            </div>
            <span className="font-heading text-lg tracking-tight group-data-[collapsible=icon]:hidden">Mansion Playroom</span>
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
