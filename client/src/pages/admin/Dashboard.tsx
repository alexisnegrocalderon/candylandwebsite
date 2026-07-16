import { Fragment, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { useAuth } from '@/_core/hooks/useAuth';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Calendar, DollarSign, Ticket, Users, Plus, Edit } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ConfirmDeleteButton } from '@/components/admin/ConfirmDeleteButton';

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
type AccesoSlug = 'duo' | 'soltera' | 'soltero' | 'trio' | 'grupo' | 'cumpleaneros';
const ACCESO_SLUG_OPTIONS: { value: AccesoSlug; label: string }[] = [
  { value: 'soltera', label: 'Soltera (ella sola)' },
  { value: 'soltero', label: 'Soltero (él solo)' },
  { value: 'duo', label: 'Dúo (pareja)' },
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
  const [newTicket, setNewTicket] = useState({ eventId: 0, name: '', category: 'acceso' as 'acceso' | 'extra', accesoSlug: '' as '' | AccesoSlug, price: 0, totalStock: 0, description: '' });
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
    const payload = { ...newTicket, accesoSlug: newTicket.category === 'extra' ? undefined : (newTicket.accesoSlug || undefined) };
    if (editingTicketId) {
      const { eventId, ...data } = payload;
      await updateTicketType.mutateAsync({ id: editingTicketId, ...data });
      setEditingTicketId(null);
    } else {
      await createTicketType.mutateAsync(payload);
    }
    setNewTicket({ eventId: 0, name: '', category: 'acceso', accesoSlug: '', price: 0, totalStock: 0, description: '' });
    setShowTicketForm(false);
  };

  const handleEditTicketType = (tt: any) => {
    setEditingTicketId(tt.id);
    setNewTicket({ eventId: tt.eventId, name: tt.name, category: tt.category || 'acceso', accesoSlug: tt.accesoSlug || '', price: Number(tt.price), totalStock: tt.totalStock, description: tt.description || '' });
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
        <Card>
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
                  <Button variant="outline" size="sm" onClick={() => { setEditingTicketId(null); setNewTicket({ eventId: event.id, name: '', category: 'acceso', accesoSlug: '', price: 0, totalStock: 0, description: '' }); setShowTicketForm(true); }}>
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
                    <Button variant="outline" onClick={() => { setShowTicketForm(false); setEditingTicketId(null); setNewTicket({ eventId: 0, name: '', category: 'acceso', accesoSlug: '', price: 0, totalStock: 0, description: '' }); }}>Cancelar</Button>
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
        <Card>
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
        <Card>
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

function OrdersView() {
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [expandedOrderId, setExpandedOrderId] = useState<number | null>(null);

  const { data: ordersData } = trpc.orders.listAll.useQuery({ status: statusFilter === 'all' ? undefined : statusFilter });
  const { data: stats } = trpc.orders.getStats.useQuery();
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
    return `/api/admin/orders/export.csv?${params.toString()}`;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-heading text-2xl">Ventas</h2>
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
        <Card>
          <CardContent className="pt-6 text-center">
            <DollarSign className="w-8 h-8 text-primary mx-auto mb-2" />
            <p className="font-heading text-3xl">${Number(stats?.totalRevenue ?? 0).toLocaleString('es-CL')}</p>
            <p className="text-muted-foreground text-sm">Ingresos Totales</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <Ticket className="w-8 h-8 text-primary mx-auto mb-2" />
            <p className="font-heading text-3xl">{stats?.totalOrders ?? 0}</p>
            <p className="text-muted-foreground text-sm">Órdenes Totales</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <Users className="w-8 h-8 text-primary mx-auto mb-2" />
            <p className="font-heading text-3xl">{stats?.approvedOrders ?? 0}</p>
            <p className="text-muted-foreground text-sm">Pagos Aprobados</p>
          </CardContent>
        </Card>
      </div>

      <Card>
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
      <Card>
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
      <Card>
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
      <Card>
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

export default function AdminDashboard() {
  const { user, loading, isAuthenticated } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen pt-24 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <AdminLoginForm />;
  }

  if (user?.role !== 'admin') {
    return (
      <div className="min-h-screen pt-24 flex items-center justify-center">
        <div className="text-center">
          <h2 className="font-heading text-3xl mb-4">Sin Permisos</h2>
          <p className="text-muted-foreground">No tienes permisos de administrador.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pt-24 pb-16">
      <div className="container">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <h1 className="font-heading text-4xl md:text-5xl mb-8">Panel de <span className="text-gradient">Administración</span></h1>

          <Tabs defaultValue="events" className="space-y-6">
            <TabsList className="bg-card border border-border/50">
              <TabsTrigger value="events">Eventos</TabsTrigger>
              <TabsTrigger value="orders">Ventas</TabsTrigger>
              <TabsTrigger value="discounts">Descuentos</TabsTrigger>
              <TabsTrigger value="community">Códigos Comunidad</TabsTrigger>
              <TabsTrigger value="referrals">Referidos</TabsTrigger>
              <TabsTrigger value="settings">Ajustes</TabsTrigger>
            </TabsList>

            <TabsContent value="events"><EventsManager /></TabsContent>
            <TabsContent value="orders"><OrdersView /></TabsContent>
            <TabsContent value="discounts"><DiscountsManager /></TabsContent>
            <TabsContent value="community"><CommunityCodesManager /></TabsContent>
            <TabsContent value="referrals"><ReferralsView /></TabsContent>
            <TabsContent value="settings"><SettingsManager /></TabsContent>
          </Tabs>
        </motion.div>
      </div>
    </div>
  );
}
