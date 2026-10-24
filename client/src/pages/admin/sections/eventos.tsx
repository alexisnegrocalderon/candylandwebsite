/* Secciones del hub «eventos» del panel (se cargan solas al abrirlas, ver ADMIN_SECTIONS en ../Dashboard.tsx). */
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { WriteButton } from '@/components/admin/WriteButton';
import { Switch } from '@/components/ui/switch';
import { trpc } from '@/lib/trpc';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Home, Plus, Edit, X, History, ChevronDown, ChevronUp, MessageCircle, Trash2, Instagram, Sparkles, Loader2, ImageOff, ArrowRight, Copy, Palette } from 'lucide-react';
import { PnlWarnings } from '@/components/admin/PnlWarnings';
import { isValidRut, formatRutLive } from '@shared/rut';
import { partnerAccessPrice, PARTNER_PRICE_OVERRIDES } from '@shared/partnerCampaign';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ConfirmDeleteButton } from '@/components/admin/ConfirmDeleteButton';
import { ImageUploadField } from '@/components/admin/ImageUploadField';
import { MailingComposer } from '@/components/admin/MailingComposer';
import { openEventPackInStudio } from '@/components/admin/studio/handoff';
import { TableSkeleton } from '@/components/admin/TableSkeleton';
import { computePhasePrice, nextPhase, normalizeTandaSchedule, type TandaPhase } from '@shared/tandaSchedule';
import { formatChileShortDate } from '@shared/chileDate';
import { ACCESO_SLUG_OPTIONS, AccesoSlug, AmbassadorRow, ProgramConfigTab, clp, fromChileInputValue, onMutationError, toChileInputValue } from './shared';

/* Toda escritura del admin pasa por acá: sin esto, un error del servidor
 * (típicamente "Database not available" si falta DATABASE_URL) fallaba en
 * silencio — el botón volvía a su estado normal sin avisar que no se guardó nada. */

export type TaxIssuer = 'mansion' | 'tercero' | 'exento' | 'por_revisar';

export const TAX_ISSUER_OPTIONS: { v: TaxIssuer; l: string; hint: string }[] = [
  { v: 'mansion', l: 'Mansion Playroom', hint: 'Sus ventas van a tu F29 (IVA 19%).' },
  { v: 'tercero', l: 'El local u otro organizador', hint: 'Otro emite las boletas; no va a tu F29. Indica quién.' },
  { v: 'exento', l: 'Exento', hint: 'Solo con respaldo legal (norma o contador). Una fiesta cobrada por tu Mercado Pago normalmente se declara con IVA; "necesito caja" no es una exención.' },
];

/** "¿Quién factura este evento?": define si sus ventas van al F29 (Dinero → SII). */
export function TaxIssuerField({ issuer, note, onChange }: { issuer: TaxIssuer; note: string; onChange: (issuer: TaxIssuer, note: string) => void }) {
  const needsNote = issuer === 'tercero' || issuer === 'exento';
  return (
    <div className="mt-2 space-y-2 rounded-xl border border-border/60 p-3">
      <p className="text-sm font-medium">¿Quién factura este evento? <span className="text-xs text-muted-foreground font-normal">(SII)</span></p>
      {issuer === 'por_revisar' && <p className="text-xs text-amber-700">Por revisar: elige una opción para que el F29 del mes quede correcto.</p>}
      <div className="flex flex-wrap gap-1.5">
        {TAX_ISSUER_OPTIONS.map((o) => (
          <button key={o.v} type="button" onClick={() => onChange(o.v, o.v === 'mansion' ? '' : note)}
            className={`rounded-full px-4 py-1.5 text-sm font-semibold transition ${issuer === o.v ? 'bg-pink-500 text-white' : 'bg-black/5 text-muted-foreground hover:bg-black/10'}`}>
            {o.l}
          </button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">{TAX_ISSUER_OPTIONS.find((o) => o.v === issuer)?.hint ?? ''}</p>
      {needsNote && (
        <Input value={note} maxLength={255} onChange={(e) => onChange(issuer, e.target.value)}
          placeholder={issuer === 'tercero' ? 'Ej: factura el local (Club X, RUT ...)' : 'Ej: art. 12 E N°1 DL 825, confirmado por contador Juan Pérez'} />
      )}
    </div>
  );
}

export function StockHistoryDialog({ ticketTypeId, ticketName }: { ticketTypeId: number; ticketName: string }) {
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

/** Arma el form-state de edición a partir de la fila que ya vino del server
 * -- mismo shape que `emptyTicketForm` de EventsManager (sin `eventId`, ese
 * ya lo fija la fila / la lista). */
export function ticketFormFromTt(tt: any) {
  return {
    name: tt.name as string,
    category: (tt.category || 'acceso') as 'acceso' | 'extra',
    accesoSlug: (tt.accesoSlug || '') as '' | AccesoSlug,
    price: Number(tt.price),
    originalPrice: tt.originalPrice ? Number(tt.originalPrice) : 0,
    totalStock: tt.totalStock as number,
    description: (tt.description || '') as string,
    costPrice: tt.costPrice ? Number(tt.costPrice) : 0,
    color: (tt.color || '') as string,
    internalCode: (tt.internalCode || '') as string,
    stockPoolId: (tt.stockPoolId ?? null) as number | null,
    // Carga de saldo prepagado (pedido explícito del dueño): con valor,
    // este extra acredita saldo en la tarjeta en vez de dar un derecho
    // canjeable. 0 = producto normal.
    topupAmount: tt.topupAmount ? Number(tt.topupAmount) : 0,
  };
}

/** Fila de un tipo de entrada: edita en el lugar (estado local `editing`),
 * mismo criterio que AmbassadorRow/StockPoolRow. Antes el formulario de
 * editar (~15 campos) se renderizaba UNA sola vez, después de toda la lista
 * de entradas + Cupos compartidos + Misión 300, al fondo de la card del
 * evento -- editar la primera entrada de diez obligaba a bajar toda la
 * pantalla para encontrar el formulario. Acá se expande pegado a ESTA fila,
 * dentro de su propia sublista (Accesos o Extras). */
export function TicketTypeRow({ tt, eventId }: { tt: any; eventId: number }) {
  const utils = trpc.useUtils();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(() => ticketFormFromTt(tt));
  const deleteTicketType = trpc.events.deleteTicketType.useMutation({
    onSuccess: () => utils.events.listTicketTypes.invalidate(),
    onError: onMutationError,
  });
  const updateTicketType = trpc.events.updateTicketType.useMutation({
    onSuccess: () => {
      utils.events.listTicketTypes.invalidate();
      utils.events.listStockPools.invalidate();
      toast.success('Entrada actualizada');
      setEditing(false);
    },
    onError: onMutationError,
  });

  const handleSave = () => {
    if (!form.name || !form.price) return;
    updateTicketType.mutate({
      id: tt.id,
      name: form.name,
      category: form.category,
      accesoSlug: form.category === 'extra' ? undefined : (form.accesoSlug || undefined),
      stockPoolId: form.category === 'extra' ? null : form.stockPoolId,
      price: form.price,
      originalPrice: form.originalPrice || undefined,
      totalStock: form.totalStock,
      description: form.description,
      costPrice: form.costPrice || undefined,
      color: form.category === 'extra' ? (form.color || undefined) : undefined,
      internalCode: form.category === 'extra' ? (form.internalCode || undefined) : undefined,
      topupAmount: form.category === 'extra' ? (form.topupAmount || null) : null,
    });
  };

  if (editing) {
    return (
      <div className="bg-muted/30 rounded-lg px-3 py-3 space-y-4">
        <h4 className="font-semibold text-sm">Editar Tipo de Entrada</h4>
        <div>
          <Label>Categoría</Label>
          <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v as 'acceso' | 'extra', accesoSlug: v === 'extra' ? '' : form.accesoSlug })}>
            <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="acceso">Acceso principal (Dúo, Soltera, Trío…)</SelectItem>
              <SelectItem value="extra">Extra (estacionamiento, cover, etc.)</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground mt-1">Los extras aparecen solos en el paso de extras del checkout, para cualquier evento — no hace falta tocar código.</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div><Label>Nombre</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="mt-1" placeholder="VIP, General..." /></div>
          <div><Label>Precio (CLP)</Label><Input type="number" value={form.price} onChange={(e) => setForm({ ...form, price: Number(e.target.value) })} className="mt-1" /></div>
          <div>
            <Label>Precio general (opcional, se muestra tachado)</Label>
            <Input type="number" value={form.originalPrice} onChange={(e) => setForm({ ...form, originalPrice: Number(e.target.value) })} className="mt-1" placeholder="Ej: 20000" />
          </div>
          <div><Label>Stock Total</Label><Input type="number" value={form.totalStock} onChange={(e) => setForm({ ...form, totalStock: Number(e.target.value) })} className="mt-1" /></div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <Label>Costo (CLP)</Label>
            <Input type="number" value={form.costPrice} onChange={(e) => setForm({ ...form, costPrice: Number(e.target.value) })} className="mt-1" placeholder="Opcional, para márgenes" />
          </div>
          {form.category === 'extra' && (
            <>
              <div>
                <Label>Código interno (canje)</Label>
                <Input value={form.internalCode} onChange={(e) => setForm({ ...form, internalCode: e.target.value.toUpperCase() })} className="mt-1" placeholder="PIS, LOC..." maxLength={6} />
              </div>
              <div>
                <Label>Color (grilla de caja)</Label>
                <Input type="color" value={form.color || '#f472b6'} onChange={(e) => setForm({ ...form, color: e.target.value })} className="mt-1 h-10" />
              </div>
            </>
          )}
        </div>
        {form.category === 'extra' && (
          <p className="text-xs text-muted-foreground -mt-2">El código interno es el prefijo del código de canje que recibe el comprador (ej. PIS-8F3K-29LX). Si se deja vacío, se genera uno automático a partir del nombre.</p>
        )}
        {form.category === 'extra' && (
          <div>
            <Label>Carga de saldo (CLP, opcional)</Label>
            <Input type="number" value={form.topupAmount || ''} onChange={(e) => setForm({ ...form, topupAmount: Number(e.target.value) })} className="mt-1" placeholder="Ej: 10000 -- convierte este extra en 'Cargar saldo'" />
            <p className="text-xs text-muted-foreground mt-1">Con un valor acá, este extra no paga recargo por servicio, no genera ticket ni QR, y acredita saldo prepagado en la tarjeta de membresía en vez de un derecho canjeable.</p>
          </div>
        )}
        {form.category === 'acceso' && (
          <div>
            <Label>Tipo de acceso (conecta con la pregunta del checkout)</Label>
            <Select value={form.accesoSlug} onValueChange={(v) => setForm({ ...form, accesoSlug: v as AccesoSlug })}>
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
        {form.category === 'acceso' && (
          <TicketPoolSelect eventId={eventId} value={form.stockPoolId} onChange={(v) => setForm({ ...form, stockPoolId: v })} />
        )}
        <div><Label>Descripción</Label><Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="mt-1" /></div>
        <div className="flex gap-2">
          <WriteButton onClick={handleSave} disabled={updateTicketType.isPending}>Guardar Cambios</WriteButton>
          <Button variant="outline" onClick={() => { setForm(ticketFormFromTt(tt)); setEditing(false); }}>Cancelar</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between text-sm bg-muted/30 rounded-lg px-3 py-2">
      <div>
        <span className="font-semibold">{tt.name}</span>
        <span className="text-muted-foreground ml-2">
          ${Number(tt.price).toLocaleString('es-CL')}
          {tt.originalPrice && Number(tt.originalPrice) > Number(tt.price) && (
            <span className="line-through ml-1">${Number(tt.originalPrice).toLocaleString('es-CL')}</span>
          )}
          {' '}· stock {tt.totalStock} · vendidas {tt.soldCount ?? 0} · {tt.status}
        </span>
        {tt.stockPoolId != null && (
          <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-candy-blue/15 text-candy-blue" title="Esta entrada gasta de un cupo compartido con otras -- ver panel Cupos compartidos">
            Cupo compartido: quedan {tt.poolRemaining} de {tt.poolTotalCap}
          </span>
        )}
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
        <Button variant="outline" size="sm" onClick={() => setEditing(true)}><Edit className="w-3 h-3" /></Button>
        <ConfirmDeleteButton description={`Vas a eliminar el tipo de entrada "${tt.name}".`} onConfirm={(adminPassword) => deleteTicketType.mutateAsync({ id: tt.id, adminPassword })} />
      </div>
    </div>
  );
}

export function TicketTypesList({ eventId }: { eventId: number }) {
  const { data: ticketTypesData } = trpc.events.listTicketTypes.useQuery({ eventId });
  const ticketTypes = ticketTypesData ?? [];

  if (ticketTypes.length === 0) {
    return <p className="text-muted-foreground text-xs mt-3">Todavía no hay entradas para este evento.</p>;
  }

  const accesos = ticketTypes.filter((tt: any) => tt.category !== 'extra');
  const extras = ticketTypes.filter((tt: any) => tt.category === 'extra');

  return (
    <div className="mt-3 space-y-4 border-t border-border/50 pt-3">
      {accesos.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Accesos</p>
          {accesos.map((tt: any) => <TicketTypeRow key={tt.id} tt={tt} eventId={eventId} />)}
        </div>
      )}
      {extras.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Extras</p>
          {extras.map((tt: any) => <TicketTypeRow key={tt.id} tt={tt} eventId={eventId} />)}
        </div>
      )}
    </div>
  );
}

/** "Cerrar tanda y activar la siguiente" -- pedido explícito del dueño:
 * cuando se agotan los cupos de la tanda vigente (ej. Founders), en vez de
 * editar cada acceso a mano (cerrar el viejo, crear el nuevo, repetir por
 * cada tipo de entrada), un solo diálogo lista TODOS los accesos hoy
 * activos con su precio actual, pide el precio/stock de la fase nueva por
 * fila (precargados con los valores actuales como punto de partida), y en
 * un click cierra las filas viejas (quedan `soldout`, dejan de venderse) y
 * crea las nuevas ya `active`. Sigue siendo 100% manual -- nada de esto se
 * dispara solo por fecha ni por cupo agotado, el dueño decide cuándo.
 *
 * Reusa TicketPoolSelect para asignar opcionalmente un cupo compartido
 * nuevo a alguna fila, sin forzarlo -- por defecto cada fila nueva usa su
 * propio stock independiente, no un pool compartido cada vez.
 *
 * El precio nuevo se precarga con el que corresponde a la SIGUIENTE fase de
 * la escala del evento (ver TandaScheduleEditor / shared/tandaSchedule.ts),
 * pero sigue siendo un input editable como siempre -- pedido explícito del
 * dueño: precargado, no bloqueado. */
export function AdvanceTandaDialog({ event }: { event: any }) {
  const eventId = event.id;
  const utils = trpc.useUtils();
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const { data: ticketTypesData } = trpc.events.listTicketTypes.useQuery({ eventId }, { enabled: open });
  const activos = (ticketTypesData ?? []).filter((tt: any) => tt.category === 'acceso' && tt.status === 'active');

  const schedule: TandaPhase[] = normalizeTandaSchedule(event.tandaDiscountSchedule);
  const next = nextPhase(event.tandaPhaseIndex ?? 0, schedule);

  type RowDraft = { newPrice: number; newTotalStock: number; newStockPoolId: number | null };
  const [rows, setRows] = useState<Record<number, RowDraft>>({});

  // Al abrir, precarga cada fila activa con el precio de la siguiente fase
  // de la escala (si hay una y la fila tiene originalPrice cargado) --
  // si no, cae al precio actual como punto de partida, igual que antes.
  useEffect(() => {
    if (open && activos.length > 0 && Object.keys(rows).length === 0) {
      setRows(Object.fromEntries(activos.map((tt: any) => {
        const seedPrice = next && tt.originalPrice
          ? computePhasePrice(Number(tt.originalPrice), next.phase.percent)
          : Number(tt.price);
        return [tt.id, { newPrice: seedPrice, newTotalStock: tt.totalStock, newStockPoolId: null }];
      })));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, ticketTypesData]);

  const advanceTanda = trpc.events.advanceTanda.useMutation({
    onSuccess: () => {
      utils.events.listTicketTypes.invalidate();
      utils.events.listStockPools.invalidate();
      utils.events.listAll.invalidate();
      toast.success('Tanda cerrada y nueva tanda activada');
      setOpen(false);
      setConfirming(false);
      setRows({});
    },
    onError: onMutationError,
  });

  const handleSubmit = () => {
    const payload = activos.map((tt: any) => {
      const r = rows[tt.id] ?? { newPrice: Number(tt.price), newTotalStock: tt.totalStock, newStockPoolId: null };
      return { oldTicketTypeId: tt.id, newPrice: r.newPrice, newTotalStock: r.newTotalStock, newStockPoolId: r.newStockPoolId };
    });
    advanceTanda.mutate({ eventId, rows: payload });
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setConfirming(false); setRows({}); } }}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm"><ArrowRight className="w-3 h-3 mr-1" /> Cerrar tanda y activar la siguiente</Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Cerrar tanda actual y activar la siguiente</DialogTitle>
        </DialogHeader>
        {!next ? (
          <p className="text-sm text-muted-foreground">Este evento ya está en la última fase de la escala (precio general). No queda ninguna fase siguiente para activar.</p>
        ) : activos.length === 0 ? (
          <p className="text-sm text-muted-foreground">No hay ningún acceso activo en este evento todavía.</p>
        ) : (
          <>
            <p className="text-xs font-medium">
              Vas a pasar a la Fase {next.index + 1} — {next.phase.percent}% de descuento sobre el precio general.
            </p>
            <p className="text-xs text-muted-foreground">
              Esto cierra para siempre cada acceso activo de abajo (deja de venderse) y crea uno nuevo con el precio y stock que definas acá, ya activo. No se puede deshacer -- si te equivocás, después hay que corregirlo a mano.
            </p>
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {activos.map((tt: any) => {
                const r = rows[tt.id] ?? { newPrice: Number(tt.price), newTotalStock: tt.totalStock, newStockPoolId: null };
                const pct = tt.originalPrice && Number(tt.originalPrice) > 0
                  ? Math.round((1 - r.newPrice / Number(tt.originalPrice)) * 100)
                  : null;
                return (
                  <div key={tt.id} className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end bg-muted/30 rounded-lg px-3 py-3">
                    <div className="md:col-span-3 text-sm font-semibold">
                      {tt.name} <span className="text-muted-foreground font-normal">— hoy ${Number(tt.price).toLocaleString('es-CL')}</span>
                    </div>
                    <div>
                      <Label>Precio nuevo (CLP)</Label>
                      <Input type="number" value={r.newPrice} onChange={(e) => setRows({ ...rows, [tt.id]: { ...r, newPrice: Number(e.target.value) } })} className="mt-1" />
                      {pct !== null && (
                        <p className="text-xs text-muted-foreground mt-1">
                          {pct > 0 ? `${pct}% de descuento vs. precio general (${Number(tt.originalPrice).toLocaleString('es-CL')})` : 'Igual o sobre el precio general'}
                        </p>
                      )}
                      {!tt.originalPrice && (
                        <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">Sin precio general cargado -- no se pudo calcular el precio de fase automáticamente, se precargó el precio actual.</p>
                      )}
                    </div>
                    <div>
                      <Label>Stock nuevo</Label>
                      <Input type="number" value={r.newTotalStock} onChange={(e) => setRows({ ...rows, [tt.id]: { ...r, newTotalStock: Number(e.target.value) } })} className="mt-1" />
                    </div>
                    <TicketPoolSelect eventId={eventId} value={r.newStockPoolId} onChange={(v) => setRows({ ...rows, [tt.id]: { ...r, newStockPoolId: v } })} />
                  </div>
                );
              })}
            </div>
            {!confirming ? (
              <Button variant="outline" onClick={() => setConfirming(true)}>Continuar</Button>
            ) : (
              <div className="space-y-2">
                <p className="text-xs text-destructive font-medium">¿Confirmás? Las {activos.length} entradas activas de arriba dejan de venderse ahora mismo y quedan reemplazadas por las nuevas.</p>
                <div className="flex gap-2">
                  <WriteButton onClick={handleSubmit} disabled={advanceTanda.isPending} className={buttonVariants({ variant: 'destructive' })}>
                    Cerrar tanda y activar la siguiente
                  </WriteButton>
                  <Button variant="outline" onClick={() => setConfirming(false)}>Cancelar</Button>
                </div>
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Escala de descuentos por fase de ESTE evento (Fase 1 = 60%, Fase 2 =
 * 50%...) -- editable acá, pedido explícito del dueño: un evento futuro
 * puede querer una escala distinta. Mismo patrón fila-con-agregar/quitar que
 * ProgramConfigTab, simplificado (sin min/max porque acá la fase ES la
 * posición en el arreglo). Guarda con su propia mutación (mismo criterio
 * que StockPoolRow/TicketTypeRow: cada pieza es dueña de su propio
 * guardado, no todo pasa por el form grande de EventCard). Se muestra como
 * sibling de AdvanceTandaDialog, no adentro: la escala se define una vez
 * por evento y rara vez se toca, mientras "Cerrar tanda" se usa seguido
 * durante la campaña -- meterla en el diálogo agregaría fricción cada vez
 * que se abre para algo que casi nunca cambia.
 *
 * Cada fase acepta una fecha límite opcional -- pasada esa fecha (o si el
 * cupo compartido de la fase se agota antes, lo que ocurra primero), el
 * sistema pasa solo a la fase siguiente (ver server/tandaAutoAdvance.ts).
 * Sin fecha, esa fase solo avanza con "Cerrar tanda" a mano, en cualquier
 * momento -- mismo comportamiento que antes de esta ronda. */
export function TandaScheduleEditor({ event }: { event: any }) {
  const utils = trpc.useUtils();
  const [open, setOpen] = useState(false);
  const [schedule, setSchedule] = useState<TandaPhase[]>(normalizeTandaSchedule(event.tandaDiscountSchedule));

  const update = trpc.events.update.useMutation({
    onSuccess: () => {
      utils.events.listAll.invalidate();
      toast.success('Escala de tandas guardada');
      setOpen(false);
    },
    onError: onMutationError,
  });

  return (
    <Dialog open={open} onOpenChange={(v) => {
      setOpen(v);
      if (v) setSchedule(normalizeTandaSchedule(event.tandaDiscountSchedule));
    }}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">Escala de tandas</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Escala de descuentos por fase</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground">
          % de descuento sobre el precio general de cada fase, en orden. Fase actual de este evento: {(event.tandaPhaseIndex ?? 0) + 1}.
          Si le ponés fecha a una fase, pasa sola a la siguiente cuando llegue esa fecha. Si además esa fase vende con cupo
          compartido y se agota antes, también pasa sola -- lo que ocurra primero. Dejalo vacío para que esa fase solo avance
          con el botón manual, en cualquier momento.
        </p>
        <div className="space-y-2">
          {schedule.map((phase, i) => (
            <div key={i} className="flex items-end gap-3">
              <div className="text-xs text-muted-foreground w-16">Fase {i + 1}</div>
              <div>
                <Label className="text-xs">% descuento</Label>
                <Input type="number" value={phase.percent} onChange={(e) => setSchedule(schedule.map((x, j) => j === i ? { ...x, percent: Number(e.target.value) || 0 } : x))} className="w-24 mt-1" />
              </div>
              <div>
                <Label className="text-xs">Fecha límite (opcional)</Label>
                <Input type="datetime-local" value={toChileInputValue(phase.untilDate)} onChange={(e) => setSchedule(schedule.map((x, j) => j === i ? { ...x, untilDate: e.target.value ? fromChileInputValue(e.target.value) : null } : x))} className="mt-1" />
              </div>
              <Button variant="outline" size="sm" className="text-destructive" onClick={() => setSchedule(schedule.filter((_, j) => j !== i))}><Trash2 className="w-3 h-3" /></Button>
            </div>
          ))}
        </div>
        <Button variant="outline" size="sm" onClick={() => setSchedule([...schedule, { percent: 0 }])}><Plus className="w-3 h-3 mr-1" /> Agregar fase</Button>
        <WriteButton onClick={() => update.mutate({ id: event.id, tandaDiscountSchedule: schedule })} disabled={update.isPending}>
          {update.isPending ? 'Guardando…' : 'Guardar escala'}
        </WriteButton>
      </DialogContent>
    </Dialog>
  );
}

/** Cupos compartidos (stockPools) de un evento: varias entradas (ej. Dúo,
 * Soltera, Trío de la Tanda "Founders") pueden gastar del mismo pozo en vez
 * de tener cada una su propio totalStock independiente -- ver comentario en
 * drizzle/schema.ts. Acá el admin ve el número REAL (vendidos / cap); lo
 * que se esconde en la vista pública es solo TandaUrgencyCard en Home.tsx.
 * Asignar un pool a una entrada se hace desde el formulario de esa entrada
 * (el Select "Cupo compartido" más abajo), no desde acá -- este panel solo
 * crea/edita/borra los pools en sí. */
/** Fila de un cupo compartido: edita en el lugar (estado local `editing`),
 * mismo criterio que AmbassadorRow más abajo -- sin esto, editar el cupo #1
 * de 3 abría un formulario compartido DESPUÉS de toda la lista, obligando a
 * bajar para encontrarlo. Acá el formulario reemplaza directamente esta
 * fila, no se mueve nada más en la pantalla. */
export function StockPoolRow({ p, onSaved, onDelete }: { p: any; onSaved: () => void; onDelete: (id: number, adminPassword: string) => Promise<void> }) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ name: p.name, totalCap: p.totalCap });
  const updatePool = trpc.events.updateStockPool.useMutation({
    onSuccess: () => { onSaved(); toast.success('Cupo actualizado'); setEditing(false); },
    onError: onMutationError,
  });

  if (editing) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end bg-muted/30 rounded-lg px-3 py-2">
        <div className="md:col-span-2"><Label>Nombre</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="mt-1" /></div>
        <div><Label>Cupo total</Label><Input type="number" value={form.totalCap} onChange={(e) => setForm({ ...form, totalCap: Number(e.target.value) })} className="mt-1" /></div>
        <div className="md:col-span-3 flex gap-2">
          <WriteButton
            onClick={() => { if (form.name.trim() && form.totalCap > 0) updatePool.mutate({ id: p.id, name: form.name.trim(), totalCap: form.totalCap }); }}
            disabled={updatePool.isPending}
          >
            Guardar
          </WriteButton>
          <Button variant="outline" onClick={() => { setForm({ name: p.name, totalCap: p.totalCap }); setEditing(false); }}>Cancelar</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between text-sm bg-muted/30 rounded-lg px-3 py-2">
      <span>
        <span className="font-semibold">{p.name}</span>
        <span className="text-muted-foreground ml-2">vendidas {p.sold} / {p.totalCap} · quedan {p.remaining}</span>
      </span>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={() => setEditing(true)}><Edit className="w-3 h-3" /></Button>
        <ConfirmDeleteButton description={`Vas a eliminar el cupo compartido "${p.name}". Solo se puede si ninguna entrada lo está usando.`} onConfirm={(adminPassword) => onDelete(p.id, adminPassword)} />
      </div>
    </div>
  );
}

export function StockPoolsPanel({ eventId }: { eventId: number }) {
  const { data: poolsData, refetch, error: poolsError } = trpc.events.listStockPools.useQuery({ eventId });
  const createPool = trpc.events.createStockPool.useMutation({ onSuccess: () => { refetch(); toast.success('Cupo compartido creado'); setShowForm(false); setForm({ name: '', totalCap: 40 }); }, onError: onMutationError });
  const deletePool = trpc.events.deleteStockPool.useMutation({ onSuccess: () => refetch(), onError: onMutationError });
  const utils = trpc.useUtils();

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: 'Founders', totalCap: 40 });

  const pools = poolsData ?? [];

  // Las entradas que usan un pool muestran su remanente en la misma consulta
  // (events.listTicketTypes) -- invalidar acá para que se refresque tanto
  // después de crear como después de editar/borrar una fila.
  const onSaved = () => { refetch(); utils.events.listTicketTypes.invalidate(); };

  const handleCreate = async () => {
    if (!form.name.trim() || form.totalCap <= 0) return;
    await createPool.mutateAsync({ eventId, name: form.name.trim(), totalCap: form.totalCap });
    onSaved();
  };

  const handleDelete = async (id: number) => {
    await deletePool.mutateAsync({ id });
    onSaved();
  };

  return (
    <div className="mt-3 border-t border-border/50 pt-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Cupos compartidos</span>
        <Button variant="outline" size="sm" onClick={() => { setForm({ name: 'Founders', totalCap: 40 }); setShowForm(!showForm); }}>
          <Plus className="w-3 h-3 mr-1" /> Cupo compartido
        </Button>
      </div>
      {poolsError && (
        <p className="text-xs text-destructive mt-1">No se pudo cargar la lista de cupos: {poolsError.message}</p>
      )}
      {!poolsError && pools.length === 0 && !showForm && (
        <p className="text-xs text-muted-foreground mt-1">Ninguno todavía. Un cupo compartido hace que varias entradas (ej. Dúo + Soltera + Trío) gasten de un mismo pozo total, en vez de cada una tener su propio stock independiente.</p>
      )}
      {pools.length > 0 && (
        <div className="space-y-2 mt-2">
          {pools.map((p: any) => (
            <StockPoolRow key={p.id} p={p} onSaved={onSaved} onDelete={handleDelete} />
          ))}
        </div>
      )}
      {showForm && (
        <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
          <div className="md:col-span-2"><Label>Nombre</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="mt-1" placeholder="Founders" /></div>
          <div><Label>Cupo total</Label><Input type="number" value={form.totalCap} onChange={(e) => setForm({ ...form, totalCap: Number(e.target.value) })} className="mt-1" /></div>
          <div className="md:col-span-3 flex gap-2">
            <WriteButton onClick={handleCreate} disabled={createPool.isPending}>Crear</WriteButton>
            <Button variant="outline" onClick={() => setShowForm(false)}>Cancelar</Button>
          </div>
        </div>
      )}
    </div>
  );
}

export function Mission300Panel({ eventId }: { eventId: number }) {
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

/** Selector "Cupo compartido" dentro del form de una entrada (solo
 * category="acceso"): ninguno, o uno de los pools ya creados para este
 * evento (ver StockPoolsPanel, más arriba en la misma pantalla). */
export function TicketPoolSelect({ eventId, value, onChange }: { eventId: number; value: number | null; onChange: (v: number | null) => void }) {
  const { data: poolsData } = trpc.events.listStockPools.useQuery({ eventId }, { enabled: !!eventId });
  const pools = poolsData ?? [];

  return (
    <div>
      <Label>Cupo compartido (opcional)</Label>
      <Select value={value != null ? String(value) : 'none'} onValueChange={(v) => onChange(v === 'none' ? null : Number(v))}>
        <SelectTrigger className="mt-1"><SelectValue placeholder="Ninguno" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="none">Ninguno — stock propio de esta entrada</SelectItem>
          {pools.map((p: any) => (
            <SelectItem key={p.id} value={String(p.id)}>{p.name} (quedan {p.remaining} de {p.totalCap})</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="text-xs text-muted-foreground mt-1">
        Si eliges uno, esta entrada gasta del mismo pozo que las demás entradas que también lo usen (ej. Dúo + Soltera de la Tanda Founders comparten un único cupo de 40). Deja el "Stock Total" de arriba en un número igual o mayor al cupo del pool -- si no, esa entrada se agotaría sola antes de llegar al límite compartido. Créalo primero en "Cupos compartidos", debajo de la lista de entradas.
      </p>
    </div>
  );
}

/** Arma el form-state de edición de un evento a partir de la fila del
 * server -- mismo shape que `newEvent` de EventsManager. */
export function eventFormFromEvent(event: any) {
  return {
    title: event.title as string, slug: event.slug as string, description: (event.description || '') as string,
    shortDescription: (event.shortDescription || '') as string, venue: (event.venue || '') as string,
    address: (event.address || '') as string, mapsUrl: (event.mapsUrl || '') as string,
    eventDate: toChileInputValue(event.eventDate), doorsOpen: toChileInputValue(event.doorsOpen),
    eventEnd: toChileInputValue(event.eventEnd), memberEarlyUntil: toChileInputValue(event.memberEarlyUntil),
    status: (event.status || 'draft') as 'draft' | 'published' | 'soldout' | 'cancelled' | 'past',
    imageUrl: (event.imageUrl || '') as string, featured: !!event.featured,
    missionForceClosed: !!event.missionForceClosed, ivaApplies: !!event.ivaApplies,
    taxIssuer: (event.taxIssuer ?? (event.ivaApplies ? 'mansion' : 'por_revisar')) as TaxIssuer, taxNote: event.taxNote ?? '',
  };
}

/** Miniatura en vivo de la URL del flyer/imagen mientras se escribe/pega
 * (pedido implícito -- se detectó que el admin cargó un evento con una URL
 * que no carga como imagen, ej. un link "compartir" de Instagram/Drive/
 * iCloud en vez del archivo directo, y el flyer quedó en blanco en el sitio
 * público sin ningún aviso). `key={url}` fuerza que el <img> se remonte en
 * cada cambio, así reintenta cargar desde cero sin necesidad de debounce ni
 * useEffect. Mismo criterio que ya usa Checkout.tsx (SquareImageOption):
 * useState + onError, y la misma caja de advertencia ámbar ya usada más
 * abajo en este archivo (ver PnlWarnings). */
export function FlyerUrlPreview({ url }: { url: string }) {
  const [status, setStatus] = useState<'idle' | 'ok' | 'error'>('idle');
  if (!url.trim()) return null;
  return (
    <div className="mt-2 flex items-start gap-3">
      <div className="w-16 aspect-[3/4] rounded-lg overflow-hidden glass-candy shrink-0 flex items-center justify-center">
        {status === 'error' ? (
          <ImageOff className="w-5 h-5 text-muted-foreground" />
        ) : (
          <img
            key={url}
            src={url}
            alt=""
            className="w-full h-full object-cover"
            onLoad={() => setStatus('ok')}
            onError={() => setStatus('error')}
          />
        )}
      </div>
      {status === 'ok' && (
        <p className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">✓ Se ve bien, así se va a ver en la home.</p>
      )}
      {status === 'error' && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400 space-y-1">
          <p className="font-medium">⚠️ Esa URL no carga como imagen.</p>
          <p>Los links para "compartir" de Instagram, Google Drive o iCloud casi nunca sirven -- son una página, no la foto directa. Pega el link directo al archivo (que termine en .jpg, .png, etc.), o sube la imagen a Imgur, Cloudinary, o algún bucket/CDN y usa ese link.</p>
        </div>
      )}
    </div>
  );
}

/** Botón "Generar con IA" para descripción corta + completa de un evento
 * (pedido explícito del dueño, 02/09) -- mismo molde que el objetivo de
 * MailingComposer.tsx: un campo de idea/tema TRANSITORIO (no se guarda en la
 * base, no existe columna para eso hoy, ver drizzle/schema.ts) y un click
 * llena ambos campos, que el dueño puede seguir editando a mano después. Se
 * usa tanto en el form de crear evento como en el de editar (EventCard). */
export function EventDescriptionAiFields({
  title, venue, address, eventDateInputValue, onGenerated,
}: {
  title: string;
  venue?: string;
  address?: string;
  eventDateInputValue?: string;
  onGenerated: (result: { shortDescription: string; description: string }) => void;
}) {
  const [idea, setIdea] = useState('');
  const generate = trpc.events.generateDescription.useMutation({
    onSuccess: (data) => { onGenerated(data); toast.success('Descripción generada -- revísala antes de guardar'); },
    onError: onMutationError,
  });

  const handleGenerate = () => {
    if (!title.trim()) { toast.error('Ponle un título al evento primero'); return; }
    generate.mutate({
      title: title.trim(),
      venue: venue?.trim() || undefined,
      address: address?.trim() || undefined,
      eventDateISO: eventDateInputValue ? fromChileInputValue(eventDateInputValue) : undefined,
      idea: idea.trim() || undefined,
    });
  };

  return (
    <div className="bg-muted/30 rounded-lg p-3 space-y-2">
      <Label>Idea/tema para la IA (opcional -- no se guarda)</Label>
      <Input value={idea} onChange={(e) => setIdea(e.target.value)} placeholder="Ej: Halloween, disfraz obligatorio" className="mt-1" />
      <WriteButton type="button" variant="outline" size="sm" onClick={handleGenerate} disabled={generate.isPending}>
        {generate.isPending ? <><Loader2 className="w-3 h-3 mr-2 animate-spin" /> Generando…</> : <><Sparkles className="w-3 h-3 mr-2" /> Generar descripciones con IA</>}
      </WriteButton>
    </div>
  );
}

/** Card de un evento: edita en el lugar (estado local `editing`), mismo
 * criterio que AmbassadorRow/StockPoolRow/TicketTypeRow. Antes el formulario
 * de editar vivía en una card fija ANTES de toda la lista de eventos --
 * editar el evento #5 de 10 mandaba arriba de todo. Acá el formulario
 * reemplaza directamente la cabecera de la card de ESE evento. También es
 * dueña del formulario de "Nueva Entrada" para este evento (antes vivía en
 * EventsManager, gateado por comparar `newTicket.eventId === event.id` --
 * más simple tenerlo local ahora que cada evento ya es su propio componente). */
export function EventCard({ event, onDeleted, expanded, onToggleExpand }: { event: any; onDeleted: (id: number, adminPassword: string) => Promise<void>; expanded: boolean; onToggleExpand: () => void }) {
  const utils = trpc.useUtils();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(() => eventFormFromEvent(event));
  const updateEvent = trpc.events.update.useMutation({
    onSuccess: () => { utils.events.listAll.invalidate(); toast.success('Evento actualizado'); setEditing(false); },
    onError: onMutationError,
  });

  const emptyTicketForm = { name: '', category: 'acceso' as 'acceso' | 'extra', accesoSlug: '' as '' | AccesoSlug, price: 0, originalPrice: 0, totalStock: 0, description: '', costPrice: 0, color: '', internalCode: '', stockPoolId: null as number | null, topupAmount: 0 };
  const [newTicket, setNewTicket] = useState(emptyTicketForm);
  const [showTicketForm, setShowTicketForm] = useState(false);
  const createTicketType = trpc.events.createTicketType.useMutation({
    onSuccess: () => { utils.events.listTicketTypes.invalidate(); toast.success('Entrada creada'); },
    onError: onMutationError,
  });

  const handleSaveEvent = () => {
    if (!form.title || !form.slug || !form.eventDate) return;
    updateEvent.mutate({
      id: event.id,
      ...form,
      featured: form.featured ? 1 : 0,
      missionForceClosed: form.missionForceClosed ? 1 : 0,
      ivaApplies: form.taxIssuer === 'mansion' ? 1 : 0,
      taxIssuer: form.taxIssuer, taxNote: form.taxNote || null,
      eventDate: fromChileInputValue(form.eventDate),
      doorsOpen: fromChileInputValue(form.doorsOpen),
      eventEnd: fromChileInputValue(form.eventEnd),
      memberEarlyUntil: fromChileInputValue(form.memberEarlyUntil),
    });
  };

  const handleCreateTicketType = async () => {
    if (!newTicket.name || !newTicket.price) return;
    await createTicketType.mutateAsync({
      eventId: event.id,
      ...newTicket,
      accesoSlug: newTicket.category === 'extra' ? undefined : (newTicket.accesoSlug || undefined),
      stockPoolId: newTicket.category === 'extra' ? null : newTicket.stockPoolId,
      originalPrice: newTicket.originalPrice || undefined,
      costPrice: newTicket.costPrice || undefined,
      color: newTicket.category === 'extra' ? (newTicket.color || undefined) : undefined,
      internalCode: newTicket.category === 'extra' ? (newTicket.internalCode || undefined) : undefined,
      topupAmount: newTicket.category === 'extra' ? (newTicket.topupAmount || undefined) : undefined,
    });
    setNewTicket(emptyTicketForm);
    setShowTicketForm(false);
  };

  return (
    <Card>
      <CardContent className="pt-6">
        {/* Cabecera siempre visible -- el resto de la card (formulario/resumen,
         * entradas, tanda, stock, Misión 300) solo se monta si `expanded` es
         * true, para no disparar todas esas queries de golpe con decenas de
         * eventos en la lista. */}
        <div className="w-full flex justify-between items-center gap-3">
          <button type="button" onClick={onToggleExpand} className="min-w-0 flex-1 text-left">
            <h3 className="font-semibold text-lg truncate">{event.title}</h3>
            <p className="text-muted-foreground text-sm truncate">/{event.slug} | {event.status} | {new Date(event.eventDate).toLocaleDateString('es-CL', { timeZone: 'America/Santiago' })}</p>
          </button>
          <div className="flex items-center gap-2 shrink-0">
            <Button variant="outline" size="sm" onClick={() => openEventPackInStudio(event.id)} title="Imágenes y videos de este evento (Estudio)" aria-label="Contenido del evento">
              <Palette className="w-3 h-3 md:mr-1" /><span className="hidden md:inline">Contenido</span>
            </Button>
            {!expanded && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => { onToggleExpand(); setEditing(true); }}
              >
                <Edit className="w-3 h-3" />
              </Button>
            )}
            <button type="button" onClick={onToggleExpand} className="p-1">
              {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
            </button>
          </div>
        </div>

        {expanded && (
        <div className="mt-4 border-t border-border/50 pt-4">
        {editing ? (
          <div className="space-y-4">
            <h4 className="font-semibold text-sm">Editar Evento</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div><Label>Título</Label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="mt-1" /></div>
              <div><Label>Slug (URL)</Label><Input value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} className="mt-1" /></div>
              <div><Label>Venue</Label><Input value={form.venue} onChange={(e) => setForm({ ...form, venue: e.target.value })} className="mt-1" /></div>
              <div><Label>Dirección</Label><Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className="mt-1" /></div>
              <div><Label>Link de Google Maps</Label><Input value={form.mapsUrl} onChange={(e) => setForm({ ...form, mapsUrl: e.target.value })} className="mt-1" placeholder="https://maps.app.goo.gl/..." /></div>
              <div><Label>Fecha del evento</Label><Input type="datetime-local" value={form.eventDate} onChange={(e) => setForm({ ...form, eventDate: e.target.value })} className="mt-1" /></div>
              <div><Label>Apertura de puertas</Label><Input type="datetime-local" value={form.doorsOpen} onChange={(e) => setForm({ ...form, doorsOpen: e.target.value })} className="mt-1" /></div>
              <div>
                <Label>Fin del evento</Label>
                <Input type="datetime-local" value={form.eventEnd} onChange={(e) => setForm({ ...form, eventEnd: e.target.value })} className="mt-1" />
                <p className="text-xs text-muted-foreground mt-1">Si lo dejas vacío, se asume 12 horas después de la fecha del evento.</p>
              </div>
              <div className="md:col-span-2">
                <Label>Preventa anticipada para socios hasta</Label>
                <Input type="datetime-local" value={form.memberEarlyUntil} onChange={(e) => setForm({ ...form, memberEarlyUntil: e.target.value })} className="mt-1" />
                <p className="text-xs text-muted-foreground mt-1">Hasta esa fecha solo compran quienes entraron a «Mi cuenta» con el correo de su compra; después se abre para todos. Vacío = sin preventa de socios.</p>
              </div>
            </div>
            <EventDescriptionAiFields
              title={form.title}
              venue={form.venue}
              address={form.address}
              eventDateInputValue={form.eventDate}
              onGenerated={(r) => setForm({ ...form, shortDescription: r.shortDescription, description: r.description })}
            />
            <div><Label>Descripción corta</Label><Input value={form.shortDescription} onChange={(e) => setForm({ ...form, shortDescription: e.target.value })} className="mt-1" /></div>
            <div><Label>Descripción completa</Label><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="mt-1 h-24" /></div>
            <div>
              <Label>URL del flyer/imagen</Label>
              <div className="mt-1"><ImageUploadField value={form.imageUrl} onChange={(url) => setForm({ ...form, imageUrl: url })} pathPrefix="events" /></div>
              <Input value={form.imageUrl} onChange={(e) => setForm({ ...form, imageUrl: e.target.value })} className="mt-2" placeholder="https://..." />
              <FlyerUrlPreview url={form.imageUrl} />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
              <div>
                <Label>Estado</Label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as any })}>
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
                <input type="checkbox" checked={form.featured} onChange={(e) => setForm({ ...form, featured: e.target.checked })} className="w-4 h-4 accent-primary" />
                <span className="text-sm">Destacar como próximo evento</span>
              </label>
              <label className="flex items-center gap-2 mb-1 cursor-pointer select-none">
                <input type="checkbox" checked={form.missionForceClosed} onChange={(e) => setForm({ ...form, missionForceClosed: e.target.checked })} className="w-4 h-4 accent-primary" />
                <span className="text-sm">Cerrar Misión 300 (cobrar valor general ya)</span>
              </label>
              <TaxIssuerField issuer={form.taxIssuer} note={form.taxNote} onChange={(taxIssuer, taxNote) => setForm({ ...form, taxIssuer, taxNote })} />
            </div>
            <div className="flex gap-2">
              <WriteButton onClick={handleSaveEvent} disabled={updateEvent.isPending}>Guardar Cambios</WriteButton>
              <Button variant="outline" onClick={() => { setForm(eventFormFromEvent(event)); setEditing(false); }}>Cancelar</Button>
            </div>
          </div>
        ) : (
          <div className="flex justify-end items-start">
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
                <Edit className="w-3 h-3" />
              </Button>
              <Button variant="outline" size="sm" onClick={() => { setNewTicket(emptyTicketForm); setShowTicketForm(true); }}>
                <Plus className="w-3 h-3 mr-1" /> Entrada
              </Button>
              <ConfirmDeleteButton description={`Vas a eliminar el evento "${event.title}" completo, con todas sus entradas.`} onConfirm={(adminPassword) => onDeleted(event.id, adminPassword)} />
            </div>
          </div>
        )}
        <TicketTypesList eventId={event.id} />
        <div className="mt-3 flex flex-wrap items-start gap-3">
          <AdvanceTandaDialog event={event} />
          <TandaScheduleEditor event={event} />
        </div>
        <StockPoolsPanel eventId={event.id} />
        <Mission300Panel eventId={event.id} />
        {showTicketForm && (
          <div className="mt-4 border-t border-border/50 pt-4 space-y-4">
            <h4 className="font-semibold text-sm">Nuevo Tipo de Entrada</h4>
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
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div><Label>Nombre</Label><Input value={newTicket.name} onChange={(e) => setNewTicket({ ...newTicket, name: e.target.value })} className="mt-1" placeholder="VIP, General..." /></div>
              <div><Label>Precio (CLP)</Label><Input type="number" value={newTicket.price} onChange={(e) => setNewTicket({ ...newTicket, price: Number(e.target.value) })} className="mt-1" /></div>
              <div>
                <Label>Precio general (opcional, se muestra tachado)</Label>
                <Input type="number" value={newTicket.originalPrice} onChange={(e) => setNewTicket({ ...newTicket, originalPrice: Number(e.target.value) })} className="mt-1" placeholder="Ej: 20000" />
              </div>
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
            {newTicket.category === 'extra' && (
              <div>
                <Label>Carga de saldo (CLP, opcional)</Label>
                <Input type="number" value={newTicket.topupAmount || ''} onChange={(e) => setNewTicket({ ...newTicket, topupAmount: Number(e.target.value) })} className="mt-1" placeholder="Ej: 10000 -- convierte este extra en 'Cargar saldo'" />
                <p className="text-xs text-muted-foreground mt-1">Con un valor acá, este extra no paga recargo por servicio, no genera ticket ni QR, y acredita saldo prepagado en la tarjeta de membresía en vez de un derecho canjeable.</p>
              </div>
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
            {newTicket.category === 'acceso' && (
              <TicketPoolSelect eventId={event.id} value={newTicket.stockPoolId} onChange={(v) => setNewTicket({ ...newTicket, stockPoolId: v })} />
            )}
            <div><Label>Descripción</Label><Input value={newTicket.description} onChange={(e) => setNewTicket({ ...newTicket, description: e.target.value })} className="mt-1" /></div>
            <div className="flex gap-2">
              <WriteButton onClick={handleCreateTicketType} disabled={createTicketType.isPending}>Crear Entrada</WriteButton>
              <Button variant="outline" onClick={() => { setShowTicketForm(false); setNewTicket(emptyTicketForm); }}>Cancelar</Button>
            </div>
          </div>
        )}
        </div>
        )}
      </CardContent>
    </Card>
  );
}

export function EventsManager() {
  const { data: eventsData, refetch, isLoading: eventsLoading } = trpc.events.listAll.useQuery();
  const createEvent = trpc.events.create.useMutation({ onSuccess: () => { refetch(); toast.success('Evento creado'); }, onError: onMutationError });
  const deleteEvent = trpc.events.delete.useMutation({ onSuccess: () => refetch(), onError: onMutationError });

  const [newEvent, setNewEvent] = useState({
    title: '', slug: '', description: '', shortDescription: '', venue: '', address: '', mapsUrl: '', eventDate: '', doorsOpen: '', eventEnd: '',
    status: 'draft' as 'draft' | 'published' | 'soldout' | 'cancelled' | 'past', imageUrl: '', featured: false, missionForceClosed: false, ivaApplies: false, taxIssuer: 'mansion' as TaxIssuer, taxNote: '',
  });
  const [showEventForm, setShowEventForm] = useState(false);
  // Cada card arranca colapsada -- con decenas de eventos (incluyendo
  // ediciones antiguas que ahora se cargan como historial) mostrar todo
  // siempre hacía la lista eterna. Solo uno abierto a la vez, tipo acordeón.
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const events = eventsData ?? [];

  const handleCreateEvent = async () => {
    if (!newEvent.title || !newEvent.slug || !newEvent.eventDate) return;
    const payload = {
      ...newEvent,
      featured: newEvent.featured ? 1 : 0,
      missionForceClosed: newEvent.missionForceClosed ? 1 : 0,
      ivaApplies: newEvent.taxIssuer === 'mansion' ? 1 : 0,
      taxIssuer: newEvent.taxIssuer, taxNote: newEvent.taxNote || null,
      eventDate: fromChileInputValue(newEvent.eventDate),
      doorsOpen: fromChileInputValue(newEvent.doorsOpen),
      eventEnd: fromChileInputValue(newEvent.eventEnd),
    };
    await createEvent.mutateAsync(payload);
    setNewEvent({ title: '', slug: '', description: '', shortDescription: '', venue: '', address: '', mapsUrl: '', eventDate: '', doorsOpen: '', eventEnd: '', status: 'draft', imageUrl: '', featured: false, missionForceClosed: false, ivaApplies: false, taxIssuer: 'mansion', taxNote: '' });
    setShowEventForm(false);
  };

  const handleDeleteEvent = async (id: number, adminPassword: string) => {
    await deleteEvent.mutateAsync({ id, adminPassword });
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
              <div>
                <Label>Fin del evento</Label>
                <Input type="datetime-local" value={newEvent.eventEnd} onChange={(e) => setNewEvent({ ...newEvent, eventEnd: e.target.value })} className="mt-1" />
                <p className="text-xs text-muted-foreground mt-1">Si lo dejas vacío, se asume 12 horas después de la fecha del evento.</p>
              </div>
            </div>
            <EventDescriptionAiFields
              title={newEvent.title}
              venue={newEvent.venue}
              address={newEvent.address}
              eventDateInputValue={newEvent.eventDate}
              onGenerated={(r) => setNewEvent({ ...newEvent, shortDescription: r.shortDescription, description: r.description })}
            />
            <div><Label>Descripción corta</Label><Input value={newEvent.shortDescription} onChange={(e) => setNewEvent({ ...newEvent, shortDescription: e.target.value })} className="mt-1" /></div>
            <div><Label>Descripción completa</Label><Textarea value={newEvent.description} onChange={(e) => setNewEvent({ ...newEvent, description: e.target.value })} className="mt-1 h-24" /></div>
            <div>
              <Label>URL del flyer/imagen</Label>
              <div className="mt-1"><ImageUploadField value={newEvent.imageUrl} onChange={(url) => setNewEvent({ ...newEvent, imageUrl: url })} pathPrefix="events" /></div>
              <Input value={newEvent.imageUrl} onChange={(e) => setNewEvent({ ...newEvent, imageUrl: e.target.value })} className="mt-2" placeholder="https://..." />
              <FlyerUrlPreview url={newEvent.imageUrl} />
            </div>
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
              <TaxIssuerField issuer={newEvent.taxIssuer} note={newEvent.taxNote} onChange={(taxIssuer, taxNote) => setNewEvent({ ...newEvent, taxIssuer, taxNote })} />
            </div>
            <div className="flex gap-2">
              <WriteButton onClick={handleCreateEvent} disabled={createEvent.isPending}>Crear Evento</WriteButton>
              <Button variant="outline" onClick={() => setShowEventForm(false)}>Cancelar</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="space-y-4">
        {eventsLoading && <TableSkeleton rows={4} />}
        {!eventsLoading && events.length === 0 && <p className="text-sm text-muted-foreground">Todavía no hay eventos: crea el primero con «Nuevo Evento».</p>}
        {events.map((event: any) => (
          <EventCard
            key={event.id}
            event={event}
            onDeleted={handleDeleteEvent}
            expanded={expandedId === event.id}
            onToggleExpand={() => setExpandedId(expandedId === event.id ? null : event.id)}
          />
        ))}
      </div>
    </div>
  );
}

export function DiscountsManager() {
  const { data: discountsData, refetch, isLoading: discountsLoading } = trpc.discounts.listAll.useQuery();
  const createDiscount = trpc.discounts.create.useMutation({ onSuccess: () => { refetch(); toast.success('Código de descuento creado'); }, onError: onMutationError });
  const updateDiscount = trpc.discounts.update.useMutation({ onSuccess: () => { refetch(); toast.success('Código actualizado'); }, onError: onMutationError });
  const deleteDiscount = trpc.discounts.delete.useMutation({ onSuccess: () => refetch(), onError: onMutationError });
  const { data: eventsData } = trpc.events.listAll.useQuery();
  // id del código que se está editando (null = el formulario crea uno nuevo).
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editActive, setEditActive] = useState(true);

  const [newDiscount, setNewDiscount] = useState({
    code: '', description: '', discountType: 'percentage' as 'percentage' | 'fixed', discountValue: 0, maxUses: 0, validUntil: '',
  });
  const [showForm, setShowForm] = useState(false);
  // Evento y producto de regalo opcionales ('' = sin evento / sin regalo).
  const [newEventId, setNewEventId] = useState('');
  const [newGiftId, setNewGiftId] = useState('');
  const { data: formTicketTypes } = trpc.events.listTicketTypes.useQuery(
    { eventId: Number(newEventId) },
    { enabled: !!newEventId },
  );
  const giftOptions = ((formTicketTypes as any[]) ?? []).filter((t) => t.status === 'active' && t.category !== 'acceso');

  const discounts = discountsData ?? [];

  // Evento al que corresponde el código: el suyo si tiene uno; si vale para
  // cualquier evento, el destacado (o el primero publicado) para que el mensaje
  // nunca quede sin evento.
  const eventFor = (d: any): any => {
    const events: any[] = (eventsData as any[]) ?? [];
    if (d.eventId) return events.find((e) => e.id === d.eventId);
    const live = events.filter((e) => e.status === 'published');
    return live.find((e) => e.featured) ?? live[0];
  };
  const eventTitleFor = (d: any): string => eventFor(d)?.title ?? 'Candyland';
  // Link directo al evento con el código puesto: se aplica solo al entrar.
  const shareText = (d: any) => {
    const ev = eventFor(d);
    const link = ev?.slug ? `${window.location.origin}/eventos/${ev.slug}?code=${encodeURIComponent(d.code)}` : window.location.origin;
    return `Usa tu código ${d.code} para comprar tu entrada a ${eventTitleFor(d)} en Mansion Playroom 🍭 ${link}`;
  };
  const copyShareText = async (d: any) => {
    try {
      await navigator.clipboard.writeText(shareText(d));
      toast.success('Mensaje copiado');
    } catch {
      toast.error('No se pudo copiar. Copia el mensaje manualmente.');
    }
  };

  const resetForm = () => {
    setNewDiscount({ code: '', description: '', discountType: 'percentage', discountValue: 0, maxUses: 0, validUntil: '' });
    setNewEventId('');
    setNewGiftId('');
    setEditingId(null);
    setEditActive(true);
    setShowForm(false);
  };

  const startEdit = (d: any) => {
    setEditingId(d.id);
    setNewDiscount({
      code: d.code,
      description: d.description ?? '',
      discountType: d.discountType,
      discountValue: Number(d.discountValue),
      maxUses: d.maxUses ?? 0,
      validUntil: toChileInputValue(d.validUntil),
    });
    setNewEventId(d.eventId ? String(d.eventId) : '');
    setNewGiftId(d.giftTicketTypeId ? String(d.giftTicketTypeId) : '');
    setEditActive(!!d.isActive);
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSave = async () => {
    if (editingId == null) return handleCreate();
    if (!newGiftId && !newDiscount.discountValue) return;
    try {
      await updateDiscount.mutateAsync({
        id: editingId,
        description: newDiscount.description || null,
        discountType: newDiscount.discountType,
        discountValue: newDiscount.discountValue,
        maxUses: newDiscount.maxUses || null,
        eventId: newEventId ? Number(newEventId) : null,
        giftTicketTypeId: newGiftId ? Number(newGiftId) : null,
        validUntil: newDiscount.validUntil ? fromChileInputValue(newDiscount.validUntil) : null,
        isActive: editActive,
      });
      resetForm();
    } catch {
      // el toast de error ya lo muestra onMutationError
    }
  };

  const handleCreate = async () => {
    if (!newDiscount.code || (!newGiftId && !newDiscount.discountValue)) return;
    try {
      await createDiscount.mutateAsync({
        ...newDiscount,
        eventId: newEventId ? Number(newEventId) : undefined,
        giftTicketTypeId: newGiftId ? Number(newGiftId) : undefined,
        maxUses: newDiscount.maxUses || undefined,
        validUntil: newDiscount.validUntil ? fromChileInputValue(newDiscount.validUntil) : undefined,
      });
      resetForm();
    } catch {
      // el toast de error ya lo muestra onMutationError; dejamos el formulario abierto para reintentar
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="font-heading text-2xl">Códigos de Descuento</h2>
        <Button onClick={() => { if (showForm) resetForm(); else setShowForm(true); }} className="interactive"><Plus className="w-4 h-4 mr-2" /> Nuevo Código</Button>
      </div>

      {showForm && (
        <Card className="rounded-2xl border-0 shadow-md shadow-black/5">
          <CardContent className="pt-6 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div><Label>Código</Label><Input value={newDiscount.code} disabled={editingId != null} onChange={(e) => setNewDiscount({ ...newDiscount, code: e.target.value.toUpperCase() })} className="mt-1" />{editingId != null && <p className="text-xs text-muted-foreground mt-1">El código no se puede cambiar (ya está repartido).</p>}</div>
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
              <div><Label>Valor</Label><Input type="number" value={newDiscount.discountValue} disabled={!!newGiftId} onChange={(e) => setNewDiscount({ ...newDiscount, discountValue: Number(e.target.value) })} className="mt-1" /></div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>Evento (opcional)</Label>
                <Select value={newEventId || 'none'} onValueChange={(v) => { setNewEventId(v === 'none' ? '' : v); setNewGiftId(''); }}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Todos los eventos</SelectItem>
                    {((eventsData as any[]) ?? []).filter((e) => e.status !== 'past' && e.status !== 'cancelled').map((e) => (
                      <SelectItem key={e.id} value={String(e.id)}>{e.title}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Producto de regalo (opcional)</Label>
                <Select value={newGiftId || 'none'} onValueChange={(v) => setNewGiftId(v === 'none' ? '' : v)} disabled={!newEventId}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sin regalo</SelectItem>
                    {giftOptions.map((t) => (<SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>))}
                  </SelectContent>
                </Select>
                {!newEventId && <p className="text-xs text-muted-foreground mt-1">Elige un evento para regalar un producto.</p>}
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div><Label>Usos máximos</Label><Input type="number" value={newDiscount.maxUses} onChange={(e) => setNewDiscount({ ...newDiscount, maxUses: Number(e.target.value) })} className="mt-1" /></div>
              <div><Label>Válido hasta</Label><Input type="datetime-local" value={newDiscount.validUntil} onChange={(e) => setNewDiscount({ ...newDiscount, validUntil: e.target.value })} className="mt-1" /></div>
            </div>
            {editingId != null && (
              <label className="flex items-center gap-2 text-sm"><Switch checked={editActive} onCheckedChange={setEditActive} /> Código activo</label>
            )}
            <div className="flex gap-2">
              <WriteButton onClick={handleSave}>{editingId != null ? 'Guardar cambios' : 'Crear Código'}</WriteButton>
              <Button variant="outline" onClick={resetForm}>Cancelar</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        {discountsLoading && <TableSkeleton rows={3} />}
        {!discountsLoading && discounts.length === 0 && <p className="text-sm text-muted-foreground">Todavía no hay códigos de descuento.</p>}
        {discounts.map((d: any) => (
          <Card key={d.id}>
            <CardContent className="pt-4 flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center">
              <div className="min-w-0">
                <span className="font-mono font-bold text-primary">{d.code}</span>
                {!d.isActive && <span className="text-xs ml-2 px-1.5 py-0.5 rounded bg-muted text-muted-foreground">Inactivo</span>}
                <span className="text-muted-foreground text-sm ml-3">
                  {d.giftTicketTypeId ? '🎁 Regalo' : d.discountType === 'percentage' ? `${d.discountValue}%` : `$${Number(d.discountValue).toLocaleString('es-CL')}`}
                </span>
                <span className="text-muted-foreground text-sm ml-3">Usos: {d.usedCount}/{d.maxUses || '∞'}</span>
                <span className="text-muted-foreground text-sm ml-3">{d.eventId ? `Evento: ${eventTitleFor(d)}` : 'Todos los eventos'}</span>
              </div>
              <div className="flex flex-wrap gap-2 sm:shrink-0">
                <Button variant="outline" size="sm" title="Editar" aria-label="Editar" onClick={() => startEdit(d)}>
                  <Edit className="w-3 h-3" />
                </Button>
                <Button variant="outline" size="sm" className="text-primary" title="Copiar mensaje" aria-label="Copiar mensaje" onClick={() => copyShareText(d)}>
                  <Copy className="w-3 h-3" />
                </Button>
                <a
                  href={`https://wa.me/?text=${encodeURIComponent(shareText(d))}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Button variant="outline" size="sm" className="text-primary" title="Enviar por WhatsApp" aria-label="Enviar por WhatsApp">
                    <MessageCircle className="w-3 h-3" />
                  </Button>
                </a>
                <ConfirmDeleteButton description={`Vas a eliminar el código de descuento "${d.code}".`} onConfirm={(adminPassword) => deleteDiscount.mutateAsync({ id: d.id, adminPassword })} />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

/** Nombre de cada acceso para el desglose de la campaña aliada. */
export const PARTNER_ACCESO_LABEL: Record<string, string> = {
  soltera: 'Soltera', duo_mujeres: 'Soltera doble (Dúo Mujeres)', duo: 'Dúo', trio: 'Trío', grupo: 'Grupo 4',
};

/** Campaña aliada «Comunidad Electrónica» (link privado /electronica, ver
 * shared/partnerCampaign.ts): abrir/cerrar el link, precio, tope y textos,
 * con el conteo de personas que trajo la comunidad. */
export function PartnerCampaignView() {
  const { data: campaign, refetch, error } = trpc.partner.adminGet.useQuery(undefined, { refetchInterval: 60_000 });
  const update = trpc.partner.adminUpdate.useMutation({
    onSuccess: () => { refetch(); toast.success('Guardado'); },
    onError: onMutationError,
  });
  const sendReminder = trpc.partner.sendReminder.useMutation({
    onSuccess: (r) => {
      refetch();
      toast.success(`Recordatorio enviado a ${r.sent} compras${r.failed ? ` · ${r.failed} fallaron` : ''}${r.remaining ? ` · faltan ${r.remaining}, vuelve a apretar` : ''}`);
    },
    onError: onMutationError,
  });
  const sendThanks = trpc.partner.sendThanks.useMutation({
    onSuccess: (r) => {
      refetch();
      toast.success(`Agradecimiento enviado a ${r.sent}${r.failed ? ` · ${r.failed} fallaron` : ''}${r.remaining ? ` · faltan ${r.remaining}, vuelve a apretar` : ''}${r.notAttended ? ` · ${r.notAttended} compras sin ingreso registrado (no se les manda)` : ''}`);
    },
    onError: onMutationError,
  });
  const [form, setForm] = useState<{ pricePerPerson: string; maxPersons: string; headline: string; rulesText: string; setTimeText: string } | null>(null);
  const [thanks, setThanks] = useState({ discountCode: '', benefitText: '20% de descuento en tu próxima entrada a Mansion Playroom.' });
  useEffect(() => {
    if (campaign && !form) {
      setForm({
        pricePerPerson: String(campaign.pricePerPerson),
        maxPersons: campaign.maxPersons != null ? String(campaign.maxPersons) : '',
        headline: campaign.headlineEffective,
        rulesText: campaign.rulesEffective,
        setTimeText: campaign.setTimeText ?? '',
      });
    }
  }, [campaign, form]);

  if (error) {
    return (
      <div className="space-y-2">
        <h2 className="font-heading text-2xl">Comunidad Electrónica</h2>
        <p className="text-sm text-destructive">No se pudo cargar la campaña: {error.message}. Si recién se publicó, falta aplicar la migración 0107 en la base.</p>
      </div>
    );
  }
  if (!campaign || !form) return <div className="py-12 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;

  const link = `${window.location.origin}/${campaign.slug}`;
  const copyLink = async (value: string = link) => {
    try { await navigator.clipboard.writeText(value); toast.success('Link copiado'); }
    catch { toast.error('No se pudo copiar. Copia el link manualmente.'); }
  };
  const save = () => {
    const price = Number(form.pricePerPerson);
    if (!Number.isInteger(price) || price < 0) { toast.error('Revisa el precio por persona'); return; }
    const max = form.maxPersons.trim() ? Number(form.maxPersons) : null;
    if (max !== null && (!Number.isInteger(max) || max < 1)) { toast.error('El tope tiene que ser un número entero, o vacío para sin tope'); return; }
    update.mutate({ pricePerPerson: price, maxPersons: max, headline: form.headline, rulesText: form.rulesText, setTimeText: form.setTimeText });
  };
  const s = campaign.stats;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-heading text-2xl">{campaign.emoji} {campaign.label}</h2>
        <p className="text-muted-foreground text-sm mt-1">
          Link privado para la comunidad de Aldo Medel (Love Carpet) y German Courtin (Casa Nostra). La web normal no muestra este precio.
          {campaign.eventName && <> Evento: <span className="font-semibold">{campaign.eventName}</span>.</>}
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Personas (pagadas)</p><p className="font-heading text-3xl tabular-nums">{s.personas}{campaign.maxPersons != null && <span className="text-base text-muted-foreground"> / {campaign.maxPersons}</span>}</p></CardContent></Card>
        <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Compras aprobadas</p><p className="font-heading text-3xl tabular-nums">{s.orders}</p></CardContent></Card>
        <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Recaudado</p><p className="font-heading text-3xl tabular-nums">{clp(s.revenue)}</p></CardContent></Card>
        <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Sin pagar</p><p className="font-heading text-3xl tabular-nums">{s.pendingOrders}</p></CardContent></Card>
      </div>
      {Object.keys(s.byAcceso).length > 0 && (
        <p className="text-sm text-muted-foreground">
          {Object.entries(s.byAcceso).map(([slug, n]) => `${PARTNER_ACCESO_LABEL[slug] ?? slug}: ${n}`).join(' · ')} personas
        </p>
      )}

      {/* Un link por DJ: mismo precio, solo cambia a quién se le cuenta la venta. */}
      <Card className="rounded-2xl border-0 shadow-md shadow-black/5">
        <CardContent className="pt-6 space-y-3">
          <p className="font-semibold">Links por DJ</p>
          {[...campaign.refs, { key: '', label: 'Link sin firma' }].map((r: { key: string; label: string }) => {
            const refLink = r.key ? `${link}?dj=${r.key}` : link;
            const st = s.byRef[r.key];
            return (
              <div key={r.key || 'none'} className="flex flex-col sm:flex-row sm:items-center gap-2">
                <div className="sm:w-56 shrink-0">
                  <p className="text-sm font-medium">{r.label}</p>
                  <p className="text-xs text-muted-foreground">{st ? `${st.personas} personas · ${st.orders} compras` : 'Sin ventas aún'}</p>
                </div>
                <Input readOnly value={refLink} className="font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
                <Button variant="outline" size="sm" className="interactive shrink-0" onClick={() => copyLink(refLink)}><Copy className="w-3 h-3 mr-1" /> Copiar</Button>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card className="rounded-2xl border-0 shadow-md shadow-black/5">
        <CardContent className="pt-6 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-semibold">Link {campaign.isActive ? 'abierto' : 'cerrado'}</p>
              <p className="text-sm text-muted-foreground">Cerrado, el link muestra «el acceso especial ya cerró» y manda a la compra normal.</p>
            </div>
            <Switch checked={!!campaign.isActive} onCheckedChange={(v) => update.mutate({ isActive: v })} aria-label="Abrir o cerrar el link" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Precio por persona</Label>
              <Input type="number" inputMode="numeric" value={form.pricePerPerson} onChange={(e) => setForm({ ...form, pricePerPerson: e.target.value })} className="mt-1" />
              <p className="text-xs text-muted-foreground mt-1">
                {campaign.allowedAccesoSlugs.map((slug: string) => `${PARTNER_ACCESO_LABEL[slug] ?? slug} ${clp(partnerAccessPrice(Number(form.pricePerPerson || 0), slug, campaign.slug) ?? 0)}${PARTNER_PRICE_OVERRIDES[campaign.slug]?.[slug] ? ' (fijo)' : ''}`).join(' · ')}. Más el cargo por servicio. Sin Soltero.
              </p>
            </div>
            <div>
              <Label>Tope de personas (vacío = sin tope)</Label>
              <Input type="number" inputMode="numeric" value={form.maxPersons} onChange={(e) => setForm({ ...form, maxPersons: e.target.value })} className="mt-1" placeholder="Sin tope" />
              <p className="text-xs text-muted-foreground mt-1">Al llegar al tope, el link muestra «cupos agotados» y manda a la compra normal.</p>
            </div>
          </div>
          <div>
            <Label>Texto de cabecera del link</Label>
            <Input value={form.headline} onChange={(e) => setForm({ ...form, headline: e.target.value })} className="mt-1" maxLength={255} />
          </div>
          <div>
            <Label>Valores y derecho de permanencia (una regla por línea)</Label>
            <Textarea value={form.rulesText} onChange={(e) => setForm({ ...form, rulesText: e.target.value })} className="mt-1 min-h-48" />
            <p className="text-xs text-muted-foreground mt-1">Se muestra en el paso obligatorio antes de pagar y se repite en el email con el QR.</p>
          </div>
          <div>
            <Label>Horario del set (para el recordatorio)</Label>
            <Input value={form.setTimeText} onChange={(e) => setForm({ ...form, setTimeText: e.target.value })} className="mt-1" maxLength={120} placeholder="Ej: B2B desde la 01:00 hasta el cierre" />
          </div>
          <WriteButton onClick={save} disabled={update.isPending}>Guardar cambios</WriteButton>
        </CardContent>
      </Card>

      <Card className="rounded-2xl border-0 shadow-md shadow-black/5">
        <CardContent className="pt-6 space-y-6">
          <div className="space-y-2">
            <p className="font-semibold">📩 Recordatorio antes de la fiesta</p>
            <p className="text-sm text-muted-foreground">
              Solo a la comunidad: horario del set, disfraz obligatorio, estacionamiento y las reglas. Se manda una vez por compra
              {s.reminderPending > 0 ? ` · ${s.reminderPending} pendientes` : ' · todas las compras ya lo recibieron'}. Guarda el horario del set antes de enviarlo.
            </p>
            <WriteButton
              disabled={sendReminder.isPending || s.reminderPending === 0}
              onClick={() => { if (window.confirm(`¿Enviar el recordatorio a ${s.reminderPending} compras de la comunidad?`)) sendReminder.mutate(); }}
            >
              {sendReminder.isPending ? 'Enviando…' : `Enviar recordatorio (${s.reminderPending})`}
            </WriteButton>
          </div>
          <div className="space-y-2 border-t border-border/40 pt-5">
            <p className="font-semibold">💜 Agradecimiento después de la fiesta</p>
            <p className="text-sm text-muted-foreground">
              Solo a quienes entraron (QR escaneado en la puerta), con un beneficio para que vuelvan. Primero crea el código en Descuentos (ej. 20% para el próximo evento) y escríbelo acá.
              {s.thanksSent > 0 && ` Ya enviado a ${s.thanksSent}.`}
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <Label>Código de descuento</Label>
                <Input value={thanks.discountCode} onChange={(e) => setThanks({ ...thanks, discountCode: e.target.value.toUpperCase() })} className="mt-1 font-mono" placeholder="VUELVE20" />
              </div>
              <div className="md:col-span-2">
                <Label>Texto del beneficio</Label>
                <Input value={thanks.benefitText} onChange={(e) => setThanks({ ...thanks, benefitText: e.target.value })} className="mt-1" maxLength={300} />
              </div>
            </div>
            <WriteButton
              disabled={sendThanks.isPending || !thanks.discountCode.trim() || !thanks.benefitText.trim()}
              onClick={() => { if (window.confirm('¿Enviar el agradecimiento a quienes asistieron?')) sendThanks.mutate(thanks); }}
            >
              {sendThanks.isPending ? 'Enviando…' : 'Enviar agradecimiento'}
            </WriteButton>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export function CommunityCodesManager() {
  const { data: codesData, refetch } = trpc.communityCodes.listAll.useQuery();
  const createCode = trpc.communityCodes.create.useMutation({ onSuccess: () => { refetch(); toast.success('Código creado'); }, onError: onMutationError });
  const deleteCode = trpc.communityCodes.delete.useMutation({ onSuccess: () => refetch(), onError: onMutationError });
  const updateCode = trpc.communityCodes.update.useMutation({ onSuccess: () => refetch(), onError: onMutationError });

  const [newCode, setNewCode] = useState({ code: '', label: '', maxUses: 0, ownerRut: '' });
  const [showForm, setShowForm] = useState(false);

  const codes = codesData ?? [];

  // Mensaje para compartir: no nombra el evento a propósito (antes decía
  // "Candyland", una fiesta ya pasada) -- el código vale para el evento vigente.
  const shareText = (code: string) =>
    `Usa tu código ${code} para comprar tu entrada en Mansion Playroom 🍭 ${window.location.origin}`;
  const copyShareText = async (code: string) => {
    try {
      await navigator.clipboard.writeText(shareText(code));
      toast.success('Mensaje copiado');
    } catch {
      toast.error('No se pudo copiar. Copia el mensaje manualmente.');
    }
  };

  const handleCreate = async () => {
    if (!newCode.code) return;
    if (newCode.ownerRut.trim() && !isValidRut(newCode.ownerRut)) { toast.error('RUT inválido — revisa el formato (12.345.678-9)'); return; }
    try {
      await createCode.mutateAsync({ ...newCode, maxUses: newCode.maxUses || undefined, ownerRut: newCode.ownerRut.trim() || undefined });
      setNewCode({ code: '', label: '', maxUses: 0, ownerRut: '' });
      setShowForm(false);
    } catch {
      // el toast de error ya lo muestra onMutationError; dejamos el formulario abierto para reintentar
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center">
        <div>
          <h2 className="font-heading text-2xl">Códigos Comunidad</h2>
          <p className="text-muted-foreground text-sm mt-1">Desbloquean el acceso Soltero y Dúo Dos Hombres en el checkout — no aplican descuento, solo validan pertenencia a la comunidad.</p>
        </div>
        <Button onClick={() => setShowForm(!showForm)} className="interactive w-full sm:w-auto sm:shrink-0"><Plus className="w-4 h-4 mr-2" /> Nuevo Código</Button>
      </div>

      {showForm && (
        <Card className="rounded-2xl border-0 shadow-md shadow-black/5">
          <CardContent className="pt-6 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div><Label>Código</Label><Input value={newCode.code} onChange={(e) => setNewCode({ ...newCode, code: e.target.value.toUpperCase() })} className="mt-1" /></div>
              <div><Label>Etiqueta (opcional)</Label><Input value={newCode.label} onChange={(e) => setNewCode({ ...newCode, label: e.target.value })} className="mt-1" placeholder="Ej: Grupo WhatsApp Playroom" /></div>
              <div><Label>Usos máximos por evento (0 = sin límite)</Label><Input type="number" value={newCode.maxUses} onChange={(e) => setNewCode({ ...newCode, maxUses: Number(e.target.value) })} className="mt-1" /></div>
            </div>
            <div>
              <Label>RUT del titular (opcional)</Label>
              <Input value={newCode.ownerRut} onChange={(e) => setNewCode({ ...newCode, ownerRut: formatRutLive(e.target.value) })} className="mt-1" placeholder="12.345.678-9" />
              <p className="text-xs text-muted-foreground mt-1">Déjalo vacío para un código compartido (como hoy). Si pones un RUT, el código queda personal y permanente -- solo esa persona puede usarlo, en cualquier evento, para siempre.</p>
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
            <CardContent className="pt-4 flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center">
              <div className="min-w-0">
                <span className="font-mono font-bold text-primary">{c.code}</span>
                {c.label && <span className="text-muted-foreground text-sm ml-3">{c.label}</span>}
                <span className="text-muted-foreground text-sm ml-3">Usos totales: {c.usedCount} · máx. por evento: {c.maxUses || '∞'}</span>
                <span className={`text-xs ml-3 px-2 py-0.5 rounded-full ${c.ownerRut ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground'}`}>{c.ownerRut ? `Personal — ${c.ownerRut}` : 'Compartido'}</span>
                <span className={`text-xs ml-3 px-2 py-0.5 rounded-full ${c.isActive ? 'bg-green-500/20 text-green-400' : 'bg-muted text-muted-foreground'}`}>{c.isActive ? 'Activo' : 'Inactivo'}</span>
              </div>
              <div className="flex flex-wrap gap-2 sm:shrink-0">
                <WriteButton variant="outline" size="sm" onClick={() => updateCode.mutateAsync({ id: c.id, isActive: c.isActive ? 0 : 1 })}>
                  {c.isActive ? 'Desactivar' : 'Activar'}
                </WriteButton>
                <Button variant="outline" size="sm" className="text-primary" title="Copiar mensaje" aria-label="Copiar mensaje" onClick={() => copyShareText(c.code)}>
                  <Copy className="w-3 h-3" />
                </Button>
                <a
                  href={`https://wa.me/?text=${encodeURIComponent(shareText(c.code))}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Button variant="outline" size="sm" className="text-primary" title="Enviar por WhatsApp" aria-label="Enviar por WhatsApp">
                    <MessageCircle className="w-3 h-3" />
                  </Button>
                </a>
                <ConfirmDeleteButton description={`Vas a eliminar el código de comunidad "${c.code}".`} onConfirm={(adminPassword) => deleteCode.mutateAsync({ id: c.id, adminPassword })} />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
