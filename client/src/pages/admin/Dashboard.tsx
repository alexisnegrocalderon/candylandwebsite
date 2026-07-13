import { useState } from 'react';
import { motion } from 'framer-motion';
import { useAuth } from '@/_core/hooks/useAuth';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Calendar, DollarSign, Ticket, Users, Plus, Trash2, Edit } from 'lucide-react';
import { startLogin } from '@/const';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

function EventsManager() {
  const { data: eventsData, refetch } = trpc.events.listAll.useQuery();
  const createEvent = trpc.events.create.useMutation({ onSuccess: () => refetch() });
  const deleteEvent = trpc.events.delete.useMutation({ onSuccess: () => refetch() });
  const updateEvent = trpc.events.update.useMutation({ onSuccess: () => refetch() });
  const createTicketType = trpc.events.createTicketType.useMutation({ onSuccess: () => refetch() });
  const updateTicketType = trpc.events.updateTicketType.useMutation({ onSuccess: () => refetch() });
  const deleteTicketType = trpc.events.deleteTicketType.useMutation({ onSuccess: () => refetch() });

  const [newEvent, setNewEvent] = useState({
    title: '', slug: '', description: '', shortDescription: '', venue: '', address: '', eventDate: '', doorsOpen: '',
    status: 'draft' as 'draft' | 'published' | 'soldout' | 'cancelled' | 'past', imageUrl: '', featured: false,
  });
  const [newTicket, setNewTicket] = useState({ eventId: 0, name: '', price: 0, totalStock: 0, description: '' });
  const [showEventForm, setShowEventForm] = useState(false);
  const [showTicketForm, setShowTicketForm] = useState(false);
  const [editingEventId, setEditingEventId] = useState<number | null>(null);

  const events = eventsData ?? [];

  const handleCreateEvent = async () => {
    if (!newEvent.title || !newEvent.slug || !newEvent.eventDate) return;
    const payload = { ...newEvent, featured: newEvent.featured ? 1 : 0 };
    if (editingEventId) {
      await updateEvent.mutateAsync({ id: editingEventId, ...payload });
      setEditingEventId(null);
    } else {
      await createEvent.mutateAsync(payload);
    }
    setNewEvent({ title: '', slug: '', description: '', shortDescription: '', venue: '', address: '', eventDate: '', doorsOpen: '', status: 'draft', imageUrl: '', featured: false });
    setShowEventForm(false);
  };

  const handleCreateTicketType = async () => {
    if (!newTicket.eventId || !newTicket.name || !newTicket.price) return;
    await createTicketType.mutateAsync(newTicket);
    setNewTicket({ eventId: 0, name: '', price: 0, totalStock: 0, description: '' });
    setShowTicketForm(false);
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
                  <p className="text-muted-foreground text-sm">/{event.slug} | {event.status} | {new Date(event.eventDate).toLocaleDateString('es-CL')}</p>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => {
                    setEditingEventId(event.id);
                    setNewEvent({
                      title: event.title, slug: event.slug, description: event.description || '',
                      shortDescription: event.shortDescription || '', venue: event.venue || '',
                      address: event.address || '',
                      eventDate: event.eventDate ? new Date(event.eventDate).toISOString().slice(0, 16) : '',
                      doorsOpen: event.doorsOpen ? new Date(event.doorsOpen).toISOString().slice(0, 16) : '',
                      status: event.status || 'draft',
                      imageUrl: event.imageUrl || '',
                      featured: !!event.featured,
                    });
                    setShowEventForm(true);
                  }}>
                    <Edit className="w-3 h-3" />
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => { setNewTicket({ ...newTicket, eventId: event.id }); setShowTicketForm(true); }}>
                    <Plus className="w-3 h-3 mr-1" /> Entrada
                  </Button>
                  <Button variant="outline" size="sm" className="text-destructive" onClick={() => deleteEvent.mutateAsync({ id: event.id })}>
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {showTicketForm && (
        <Card>
          <CardHeader><CardTitle>Nuevo Tipo de Entrada</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div><Label>Nombre</Label><Input value={newTicket.name} onChange={(e) => setNewTicket({ ...newTicket, name: e.target.value })} className="mt-1" placeholder="VIP, General..." /></div>
              <div><Label>Precio (CLP)</Label><Input type="number" value={newTicket.price} onChange={(e) => setNewTicket({ ...newTicket, price: Number(e.target.value) })} className="mt-1" /></div>
              <div><Label>Stock Total</Label><Input type="number" value={newTicket.totalStock} onChange={(e) => setNewTicket({ ...newTicket, totalStock: Number(e.target.value) })} className="mt-1" /></div>
            </div>
            <div><Label>Descripción</Label><Input value={newTicket.description} onChange={(e) => setNewTicket({ ...newTicket, description: e.target.value })} className="mt-1" /></div>
            <div className="flex gap-2">
              <Button onClick={handleCreateTicketType}>Crear Entrada</Button>
              <Button variant="outline" onClick={() => setShowTicketForm(false)}>Cancelar</Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function DiscountsManager() {
  const { data: discountsData, refetch } = trpc.discounts.listAll.useQuery();
  const createDiscount = trpc.discounts.create.useMutation({ onSuccess: () => refetch() });
  const deleteDiscount = trpc.discounts.delete.useMutation({ onSuccess: () => refetch() });

  const [newDiscount, setNewDiscount] = useState({
    code: '', description: '', discountType: 'percentage' as 'percentage' | 'fixed', discountValue: 0, maxUses: 0, validUntil: '',
  });
  const [showForm, setShowForm] = useState(false);

  const discounts = discountsData ?? [];

  const handleCreate = async () => {
    if (!newDiscount.code || !newDiscount.discountValue) return;
    await createDiscount.mutateAsync({
      ...newDiscount,
      maxUses: newDiscount.maxUses || undefined,
      validUntil: newDiscount.validUntil || undefined,
    });
    setNewDiscount({ code: '', description: '', discountType: 'percentage', discountValue: 0, maxUses: 0, validUntil: '' });
    setShowForm(false);
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
              <Button variant="outline" size="sm" className="text-destructive" onClick={() => deleteDiscount.mutateAsync({ id: d.id })}>
                <Trash2 className="w-3 h-3" />
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function CommunityCodesManager() {
  const { data: codesData, refetch } = trpc.communityCodes.listAll.useQuery();
  const createCode = trpc.communityCodes.create.useMutation({ onSuccess: () => refetch() });
  const deleteCode = trpc.communityCodes.delete.useMutation({ onSuccess: () => refetch() });
  const updateCode = trpc.communityCodes.update.useMutation({ onSuccess: () => refetch() });

  const [newCode, setNewCode] = useState({ code: '', label: '', maxUses: 0 });
  const [showForm, setShowForm] = useState(false);

  const codes = codesData ?? [];

  const handleCreate = async () => {
    if (!newCode.code) return;
    await createCode.mutateAsync({ ...newCode, maxUses: newCode.maxUses || undefined });
    setNewCode({ code: '', label: '', maxUses: 0 });
    setShowForm(false);
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
                <Button variant="outline" size="sm" className="text-destructive" onClick={() => deleteCode.mutateAsync({ id: c.id })}>
                  <Trash2 className="w-3 h-3" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function OrdersView() {
  const { data: ordersData } = trpc.orders.listAll.useQuery({});
  const { data: stats } = trpc.orders.getStats.useQuery();

  const ordersList = ordersData?.orders ?? [];

  return (
    <div className="space-y-6">
      <h2 className="font-heading text-2xl">Ventas</h2>

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
                </tr>
              </thead>
              <tbody>
                {ordersList.map((order: any) => (
                  <tr key={order.id} className="border-b border-border/50">
                    <td className="py-2 px-3 font-mono text-xs">{order.orderNumber}</td>
                    <td className="py-2 px-3">{order.buyerName}<br/><span className="text-muted-foreground text-xs">{order.buyerEmail}</span></td>
                    <td className="py-2 px-3">${Number(order.total).toLocaleString('es-CL')}</td>
                    <td className="py-2 px-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs ${order.paymentStatus === 'approved' ? 'bg-green-500/20 text-green-400' : order.paymentStatus === 'pending' ? 'bg-yellow-500/20 text-yellow-400' : 'bg-red-500/20 text-red-400'}`}>
                        {order.paymentStatus}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-muted-foreground">{new Date(order.createdAt).toLocaleDateString('es-CL')}</td>
                  </tr>
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
    return (
      <div className="min-h-screen pt-24 flex items-center justify-center">
        <div className="text-center">
          <h2 className="font-heading text-3xl mb-4">Acceso Restringido</h2>
          <p className="text-muted-foreground mb-6">Inicia sesión para acceder al panel de administración.</p>
          <Button onClick={() => startLogin()} className="interactive">Iniciar Sesión</Button>
        </div>
      </div>
    );
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
            </TabsList>

            <TabsContent value="events"><EventsManager /></TabsContent>
            <TabsContent value="orders"><OrdersView /></TabsContent>
            <TabsContent value="discounts"><DiscountsManager /></TabsContent>
            <TabsContent value="community"><CommunityCodesManager /></TabsContent>
            <TabsContent value="referrals"><ReferralsView /></TabsContent>
          </Tabs>
        </motion.div>
      </div>
    </div>
  );
}
