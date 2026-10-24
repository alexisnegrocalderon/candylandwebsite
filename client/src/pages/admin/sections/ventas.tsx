/* Secciones del hub «ventas» del panel (se cargan solas al abrirlas, ver ADMIN_SECTIONS en ../Dashboard.tsx). */
import { useTonightEvent } from '@/hooks/useTonightEvent';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { WriteButton } from '@/components/admin/WriteButton';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Ticket, ShoppingBag, Download, Gift, Martini, Instagram, QrCode, Share2, Car } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogTrigger, AlertDialogContent, AlertDialogHeader, AlertDialogFooter, AlertDialogTitle, AlertDialogDescription, AlertDialogAction, AlertDialogCancel } from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { isMissionActiveForEvent, missionDepositPrice } from '@shared/mission300';
import { PIE_COLORS, StatCard, onMutationError } from './shared';

/** Accesos manuales desde /admin (pedido explícito del usuario): invitaciones
 * gratis o accesos ya pagados por transferencia/efectivo directo, sin pasar
 * por Mercado Pago -- mismos datos que pide el checkout público y el mismo
 * mail final con QR (server/routers.ts orders.createManual reusa
 * confirmFreeOrder, igual que el checkout con descuento 100%). */
export function ManualAccessSection() {
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
      if (result.blockedReview?.length) toast.warning(`Ojo: el nombre coincide con alguien de la lista de bloqueados (${result.blockedReview.join('; ')}). Revisa que no sea la misma persona.`, { duration: 12000 });
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
export function StaffCompHistory({ eventId }: { eventId: number }) {
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
export function InstantInviteButton({ eventSlug }: { eventSlug: string }) {
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
export function StaffCompButton({ eventSlug, products }: { eventSlug: string; products: any[] }) {
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

export const UTM_SOURCE_PRESETS = [
  { value: 'instagram', label: 'Instagram' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'tiktok', label: 'TikTok' },
  { value: 'otro', label: 'Otro…' },
];

export const UTM_MEDIUM_PRESETS: Record<string, { value: string; label: string }[]> = {
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
export function slugifyUtm(text: string): string {
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
export function UtmLinkBuilder() {
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
      const trimmed = path.trim() || '/';
      // Si pegaron la URL completa (ej. copiada de la barra del navegador) en
      // vez de solo la ruta, se usa nada más su path -- así no arma un link
      // roto tipo "mansionplayroom.cl/https://mansionplayroom.cl" (404 real
      // que le pasó al dueño). El dominio siempre sale de window.location,
      // nunca del que hayan pegado, para no terminar linkeando a otro sitio
      // por error de tipeo.
      let cleanPath = trimmed;
      if (/^https?:\/\//i.test(trimmed)) {
        try { cleanPath = new URL(trimmed).pathname || '/'; } catch { cleanPath = '/'; }
      }
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
          Arma el link ANTES de compartirlo en cada lugar -- así la venta se organiza sola abajo, sin que tengas que anotar nada a mano.
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
export function SalesByOriginView() {
  // Con dos eventos publicados, mezclar las campañas de las dos fiestas hace
  // el reporte inútil: lo que se quiere saber es qué link trajo ventas de
  // ESTA campaña.
  const [eventFilter, setEventFilter] = useState<string>('all');
  const { data: eventsList } = trpc.events.listAll.useQuery();
  const { data, isLoading } = trpc.orders.salesByOrigin.useQuery({
    eventId: eventFilter === 'all' ? undefined : Number(eventFilter),
  });
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
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-heading text-2xl">Ventas por Origen</h2>
          <p className="text-muted-foreground text-sm mt-1">
            De dónde vinieron las ventas web ya aprobadas, según el link que usó cada comprador para entrar al sitio. Lo que no viene de un link etiquetado (directo, buscador, embajador con su propio código) cae en "(sin UTM)".
          </p>
        </div>
        <Select value={eventFilter} onValueChange={setEventFilter}>
          <SelectTrigger className="w-52 shrink-0"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los eventos</SelectItem>
            {(eventsList ?? []).map((e: any) => <SelectItem key={e.id} value={String(e.id)}>{e.title}</SelectItem>)}
          </SelectContent>
        </Select>
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

/** Conteo exacto de autos por origen, para cuadrar contra los autos
 * estacionados y saber cuánto pagarle al establecimiento -- ver
 * server/db.ts getParkingReport y el flujo de cobro en /puerta. */
export function ParkingReportView() {
  const { events, eventId, setSelected } = useTonightEvent();

  const { data, isError, error, isLoading, refetch } = trpc.cajaReports.parkingReport.useQuery(
    { eventId: eventId! },
    { enabled: !!eventId },
  );

  if (!eventId) {
    return <p className="text-sm text-muted-foreground">Todavía no hay eventos cargados.</p>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-heading text-2xl">Estacionamiento</h2>
        <Select value={String(eventId)} onValueChange={(v) => setSelected(Number(v))}>
          <SelectTrigger className="w-64"><SelectValue /></SelectTrigger>
          <SelectContent>
            {(events ?? []).map((e: any) => <SelectItem key={e.id} value={String(e.id)}>{e.title}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Antes, cualquier falla del servidor se tragaba en silencio y esta
       * pantalla mostraba "0 autos / $0 a pagar" -- indistinguible de que
       * de verdad no hubiera ventas. Con plata real de por medio (a pagar al
       * establecimiento), un error tiene que VERSE, no disfrazarse de cero. */}
      {isError && (
        <Card className="rounded-2xl border-0 shadow-md shadow-black/5 border-l-4 border-l-destructive">
          <CardContent className="pt-6 space-y-2">
            <p className="font-medium text-destructive">No se pudo cargar el reporte de Estacionamiento.</p>
            <p className="text-sm text-muted-foreground">{error?.message || 'Error desconocido.'}</p>
            <Button variant="outline" size="sm" onClick={() => refetch()} className="interactive">Reintentar</Button>
          </CardContent>
        </Card>
      )}

      {isLoading && <p className="text-sm text-muted-foreground">Cargando…</p>}

      {!isLoading && !isError && data === null && (
        <p className="text-sm text-muted-foreground">Base de datos no disponible -- no se pudo calcular el reporte.</p>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard icon={Ticket} colorClass="bg-violet-electric" value={data?.online ?? 0} label="Pagado online" />
        <StatCard icon={Car} colorClass="bg-primary" value={data?.puerta ?? 0} label="Pagado en puerta" />
        <StatCard icon={Gift} colorClass="bg-amber-500" value={data?.staff ?? 0} label="Gratis (staff)" />
        <StatCard icon={ShoppingBag} colorClass="bg-green-600" value={data?.totalCars ?? 0} label="Total autos" />
      </div>

      {data && data.puerta > 0 && (
        <Card className="rounded-2xl border-0 shadow-md shadow-black/5">
          <CardHeader><CardTitle>Cobrado en la puerta, por método</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4 text-sm">
              <p>Efectivo: <strong>{data.puertaByMethod.efectivo}</strong></p>
              <p>Débito: <strong>{data.puertaByMethod.debito}</strong></p>
              <p>Crédito: <strong>{data.puertaByMethod.credito}</strong></p>
            </div>
            <p className="text-xs text-muted-foreground mt-2">Para cuadrar contra el efectivo/tarjeta contado esa noche en /caja.</p>
          </CardContent>
        </Card>
      )}

      <Card className="rounded-2xl border-0 shadow-md shadow-black/5 border-l-4 border-l-amber-500">
        <CardHeader><CardTitle>A pagar al establecimiento</CardTitle></CardHeader>
        <CardContent>
          <p className="text-3xl font-bold tabular-nums">
            ${(data?.amountOwedToVenueClp ?? 0).toLocaleString('es-CL')}
          </p>
          <p className="text-sm text-muted-foreground mt-1">
            {data?.totalPaid ?? 0} autos pagados (online + puerta) × ${(data?.venueFeePerCarClp ?? 0).toLocaleString('es-CL')} — costo del arriendo del estacionamiento, no es ingreso de Mansion Playroom.
            Los autos de staff con estacionamiento gratis no cuentan acá. Ajustable en Ajustes → Estacionamiento.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
