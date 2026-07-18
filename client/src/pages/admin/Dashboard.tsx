import { Fragment, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { useAuth } from '@/_core/hooks/useAuth';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Calendar, DollarSign, Ticket, Users, Plus, Edit, ShoppingBag, Store, Percent, Trophy, LayoutDashboard, Settings as SettingsIcon, LogOut } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ConfirmDeleteButton } from '@/components/admin/ConfirmDeleteButton';
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

  return (
    <div className="mt-3 space-y-2 border-t border-border/50 pt-3">
      {ticketTypes.map((tt: any) => (
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
      ))}
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
              <ConfirmDeleteButton description={`Vas a eliminar el código de descuento "${d.code}".`} onConfirm={() => deleteDiscount.mutateAsync({ id: d.id })} />
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

function OrdersView({ channel }: { channel: 'web' | 'caja' }) {
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [expandedOrderId, setExpandedOrderId] = useState<number | null>(null);

  const { data: ordersData } = trpc.orders.listAll.useQuery({ status: statusFilter === 'all' ? undefined : statusFilter, channel });
  const { data: stats } = trpc.orders.getStats.useQuery({ channel });
  const { data: orderTickets, isFetching: loadingTickets } = trpc.orders.getTickets.useQuery(
    { orderId: expandedOrderId ?? 0 },
    { enabled: expandedOrderId !== null }
  );
  const resendConfirmation = trpc.orders.resendConfirmation.useMutation({
    onSuccess: () => toast.success('Email reenviado'),
    onError: onMutationError,
  });

  const ordersList = ordersData?.orders ?? [];
  const pendingCount = ordersList.filter((o: any) => o.paymentStatus === 'pending').length;

  const exportUrl = () => {
    const params = new URLSearchParams();
    if (statusFilter !== 'all') params.set('status', statusFilter);
    if (dateFrom) params.set('dateFrom', dateFrom);
    if (dateTo) params.set('dateTo', dateTo);
    params.set('channel', channel);
    return `/api/admin/orders/export.csv?${params.toString()}`;
  };

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
                        {order.paymentStatus === 'approved' && (
                          <div className="flex gap-2">
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
                          </div>
                        )}
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

function SettingsManager() {
  const { data: settings, refetch } = trpc.settings.get.useQuery();
  const updateSettings = trpc.settings.update.useMutation({ onSuccess: () => { refetch(); toast.success('Ajustes guardados'); }, onError: onMutationError });
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

function AdminLoginForm() {
  const utils = trpc.useUtils();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const adminLogin = trpc.auth.adminLogin.useMutation({
    onSuccess: async () => {
      setError('');
      await utils.auth.me.invalidate();
    },
    onError: () => setError('Contraseña incorrecta'),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) return;
    adminLogin.mutate({ password });
  };

  return (
    <div className="min-h-screen pt-24 flex items-center justify-center">
      <form onSubmit={handleSubmit} className="text-center w-full max-w-xs">
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
        <Button type="submit" disabled={adminLogin.isPending || !password} className="interactive w-full">
          {adminLogin.isPending ? 'Entrando…' : 'Entrar'}
        </Button>
      </form>
    </div>
  );
}

const ADMIN_SECTIONS = [
  { id: 'events', label: 'Eventos', icon: Calendar, render: () => <EventsManager /> },
  { id: 'orders-web', label: 'Ventas Web', icon: Ticket, render: () => <OrdersView channel="web" /> },
  { id: 'orders-caja', label: 'Ventas Caja', icon: ShoppingBag, render: () => <OrdersView channel="caja" /> },
  { id: 'discounts', label: 'Descuentos', icon: Percent, render: () => <DiscountsManager /> },
  { id: 'community', label: 'Códigos Comunidad', icon: Users, render: () => <CommunityCodesManager /> },
  { id: 'referrals', label: 'Referidos', icon: Trophy, render: () => <ReferralsView /> },
  { id: 'caja', label: 'Caja', icon: Store, render: () => <CajaAdminView /> },
  { id: 'settings', label: 'Ajustes', icon: SettingsIcon, render: () => <SettingsManager /> },
] as const;

export default function AdminDashboard() {
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
