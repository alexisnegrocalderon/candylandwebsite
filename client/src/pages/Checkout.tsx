import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { motion } from 'framer-motion';
import { useRoute, useSearch, Link } from 'wouter';
import { ArrowLeft, Tag, Loader2, CheckCircle2, ShieldCheck, Minus, Plus } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { CANDYLAND, CAMPOS_COMPRADOR, formatCLP, coversDisponibles, type CampoForm } from '@/config/candyland';

/* ── Tipos unificados de carrito ──────────────────────────── */
type CartLine = {
  key: string;        // id string (config) o numérico (DB) como string
  ticketTypeId?: number; // solo si viene de la DB
  accesoId?: string;  // solo si viene de la config
  nombre: string;
  precio: number;
  quantity: number;
  campos: CampoForm[];
};

/* ── Construir schema zod dinámico desde los campos activos ── */
function buildSchema(fields: { key: string; field: CampoForm }[]) {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const { key, field } of fields) {
    if (field.type === 'checkbox') {
      shape[key] = field.required
        ? z.boolean().refine((v) => v === true, { message: 'Debes confirmar' })
        : z.boolean().optional();
    } else if (field.type === 'email') {
      shape[key] = field.required
        ? z.string().min(1, 'Requerido').email('Email inválido')
        : z.string().email('Email inválido').or(z.literal('')).optional();
    } else if (field.required) {
      shape[key] = z.string().min(1, 'Requerido');
    } else {
      shape[key] = z.string().optional();
    }
  }
  return z.object(shape);
}

export default function Checkout() {
  const [, params] = useRoute('/checkout/:eventSlug');
  const eventSlug = params?.eventSlug ?? CANDYLAND.slug;
  const search = useSearch();
  const itemsParam = new URLSearchParams(search).get('items') || '';

  const { data: event } = trpc.events.getBySlug.useQuery({ slug: eventSlug });
  const { data: liveTicketsData } = trpc.events.getTicketTypes.useQuery({ slug: eventSlug }, { retry: false });
  const liveTickets = liveTicketsData ?? [];
  const useConfig = liveTickets.length === 0; // sin DB → usamos la config

  const validateDiscount = trpc.orders.validateDiscount.useMutation();
  const createOrder = trpc.orders.create.useMutation();

  const [discountCode, setDiscountCode] = useState('');
  const [ambassadorCode, setAmbassadorCode] = useState('');
  const [discountApplied, setDiscountApplied] = useState<any>(null);
  const [discountError, setDiscountError] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [estacionamiento, setEstacionamiento] = useState(false);
  const [coverQty, setCoverQty] = useState<Record<string, number>>({});
  const addonEstac = CANDYLAND.addons.estacionamiento;
  const covers = CANDYLAND.addons.covers;
  const coversOn = coversDisponibles();

  /* Resolver items del URL contra DB o config */
  const cart: CartLine[] = useMemo(() => {
    return itemsParam
      .split(',')
      .filter(Boolean)
      .map((pair) => {
        const [id, qty] = pair.split(':');
        const quantity = Math.max(1, Number(qty) || 1);
        if (useConfig) {
          const acc = CANDYLAND.accesos.find((a) => a.id === id);
          if (!acc) return null;
          return { key: id, accesoId: id, nombre: acc.nombre, precio: acc.precio, quantity, campos: acc.campos ?? [] };
        }
        const tt = liveTickets.find((t: any) => String(t.id) === id);
        if (!tt) return null;
        // Match de campos por nombre de acceso (si coincide con la config)
        const acc = CANDYLAND.accesos.find((a) => a.nombre.toLowerCase() === (tt as any).name.toLowerCase());
        return {
          key: id,
          ticketTypeId: Number(id),
          nombre: (tt as any).name,
          precio: Number((tt as any).price),
          quantity,
          campos: acc?.campos ?? [],
        };
      })
      .filter(Boolean) as CartLine[];
  }, [itemsParam, useConfig, liveTickets]);

  /* Campos activos: comprador + campos por acceso en el carrito */
  const activeFields = useMemo(() => {
    const buyer = CAMPOS_COMPRADOR.map((f) => ({ key: `buyer__${f.name}`, field: f, grupo: 'Tus datos' }));
    const perAcceso = cart.flatMap((line) =>
      line.campos.map((f) => ({ key: `${line.key}__${f.name}`, field: f, grupo: line.nombre })),
    );
    return [...buyer, ...perAcceso];
  }, [cart]);

  const schema = useMemo(() => buildSchema(activeFields), [activeFields]);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({ resolver: zodResolver(schema), mode: 'onBlur' });

  /* Totales */
  const subtotal = cart.reduce((s, l) => s + l.precio * l.quantity, 0);
  const discountAmount = discountApplied
    ? discountApplied.discountType === 'percentage'
      ? Math.round(subtotal * Number(discountApplied.discountValue) / 100)
      : Number(discountApplied.discountValue)
    : 0;
  const coversTotal = covers.productos.reduce((s, p) => s + (coverQty[p.id] || 0) * p.precio, 0);
  const addonsTotal = (estacionamiento ? addonEstac.precio : 0) + coversTotal;
  const total = Math.max(0, subtotal - discountAmount) + addonsTotal;

  const handleApplyDiscount = async () => {
    if (!discountCode.trim() || !event?.id) return;
    setDiscountError('');
    try {
      const result = await validateDiscount.mutateAsync({ code: discountCode, eventId: event.id });
      if (result.valid) setDiscountApplied(result.discount);
      else setDiscountError(result.message || 'Código inválido');
    } catch {
      setDiscountError('Error al validar el código');
    }
  };

  const onSubmit = async (values: Record<string, any>) => {
    // Agrupar datos por sección para la metadata / WhatsApp / MP
    const coversElegidos = covers.productos
      .filter((p) => (coverQty[p.id] || 0) > 0)
      .map((p) => ({ nombre: p.nombre, cantidad: coverQty[p.id] }));
    const attendeeData = JSON.stringify({
      carrito: cart.map((c) => ({ acceso: c.nombre, cantidad: c.quantity })),
      extras: { estacionamiento, covers: coversElegidos },
      campos: values,
    });

    // Sin DB no se puede crear la orden real → mostramos confirmación
    if (useConfig) {
      setSubmitted(true);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    setIsProcessing(true);
    try {
      const result = await createOrder.mutateAsync({
        eventSlug,
        buyerName: values['buyer__nombre'],
        buyerEmail: values['buyer__email'],
        buyerPhone: values['buyer__whatsapp'],
        items: cart.map((c) => ({ ticketTypeId: c.ticketTypeId!, quantity: c.quantity })),
        discountCode: discountCode || undefined,
        ambassadorCode: ambassadorCode || undefined,
        attendeeData,
      });
      if (result.checkoutUrl) window.location.href = result.checkoutUrl;
    } catch (err: any) {
      setIsProcessing(false);
      setDiscountError('');
      alert(err.message || 'Error al procesar la orden');
    }
  };

  /* ── Pantalla de confirmación (modo sin DB) ─────────────── */
  if (submitted) {
    return (
      <div className="min-h-screen pt-28 pb-16">
        <div className="container max-w-lg text-center">
          <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.5 }}>
            <div className="w-20 h-20 rounded-full bg-primary/15 flex items-center justify-center mx-auto mb-6">
              <CheckCircle2 className="w-10 h-10 text-primary" />
            </div>
            <h1 className="font-heading font-bold text-3xl md:text-4xl mb-3">¡Datos recibidos! 🍭</h1>
            <p className="text-muted-foreground mb-6">
              Tu reserva de <strong className="text-foreground">{cart.map((c) => `${c.quantity}× ${c.nombre}`).join(', ')}</strong> quedó registrada.
              El pago con Mercado Pago se activa muy pronto — te escribiremos por WhatsApp para confirmarla.
            </p>
            <div className="glass-candy rounded-2xl p-5 text-left mb-6">
              <div className="flex justify-between font-heading text-xl">
                <span>Total</span>
                <span className="text-gradient-candy">{formatCLP(total)}</span>
              </div>
            </div>
            <Link href="/" className="btn-jelly inline-flex items-center gap-2 px-8 py-4 bg-primary text-primary-foreground rounded-full font-bold uppercase tracking-wide text-sm">
              Volver al inicio
            </Link>
          </motion.div>
        </div>
      </div>
    );
  }

  if (cart.length === 0) {
    return (
      <div className="min-h-screen pt-28 pb-16">
        <div className="container max-w-lg text-center">
          <h1 className="font-heading font-bold text-3xl mb-4">Tu carrito está vacío</h1>
          <Link href="/#entradas" className="text-primary">Elegir un acceso</Link>
        </div>
      </div>
    );
  }

  /* Agrupar campos por sección para render */
  const grupos = Array.from(new Set(activeFields.map((f) => f.grupo)));

  return (
    <div className="min-h-screen pt-24 pb-28 md:pb-16">
      <div className="container max-w-4xl">
        <Link href="/#entradas" className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground mb-6 interactive">
          <ArrowLeft className="w-4 h-4" /> Volver a los accesos
        </Link>

        <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
          <h1 className="font-heading font-bold text-3xl md:text-5xl tracking-tight mb-1">Completa tu compra</h1>
          <p className="text-muted-foreground text-lg mb-8">{event?.title ?? `${CANDYLAND.nombre} · ${CANDYLAND.fechaTexto}`}</p>
        </motion.div>

        <form onSubmit={handleSubmit(onSubmit)} className="grid grid-cols-1 lg:grid-cols-5 gap-6 lg:gap-8">
          <div className="lg:col-span-3 space-y-5">
            {grupos.map((grupo) => (
              <div key={grupo} className="glass-candy rounded-2xl p-5 md:p-6">
                <h3 className="font-heading font-bold text-lg mb-4">{grupo}</h3>
                <div className="space-y-4">
                  {activeFields
                    .filter((f) => f.grupo === grupo)
                    .map(({ key, field }) => {
                      const err = (errors as any)[key]?.message as string | undefined;
                      if (field.type === 'checkbox') {
                        return (
                          <label key={key} className="flex items-start gap-3 cursor-pointer select-none">
                            <input
                              type="checkbox"
                              {...register(key)}
                              className="mt-1 w-5 h-5 rounded accent-[oklch(0.7_0.25_330)]"
                            />
                            <span className="text-sm leading-snug">
                              {field.label}
                              {err && <span className="block text-destructive text-xs mt-0.5">{err}</span>}
                            </span>
                          </label>
                        );
                      }
                      return (
                        <div key={key}>
                          <Label htmlFor={key}>
                            {field.label} {field.required && <span className="text-primary">*</span>}
                          </Label>
                          {field.type === 'textarea' ? (
                            <Textarea id={key} {...register(key)} placeholder={field.placeholder} className="mt-1" rows={3} />
                          ) : field.type === 'select' ? (
                            <select
                              id={key}
                              {...register(key)}
                              className="mt-1 w-full h-10 rounded-md border border-input bg-transparent px-3 text-sm"
                            >
                              <option value="">Selecciona…</option>
                              {(field.options ?? []).map((o) => (
                                <option key={o} value={o}>{o}</option>
                              ))}
                            </select>
                          ) : (
                            <Input
                              id={key}
                              type={field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : field.type === 'tel' ? 'tel' : field.type === 'email' ? 'email' : 'text'}
                              {...register(key)}
                              placeholder={field.placeholder}
                              className="mt-1"
                            />
                          )}
                          {field.help && <p className="text-xs text-muted-foreground mt-1">{field.help}</p>}
                          {err && <p className="text-xs text-destructive mt-1">{err}</p>}
                        </div>
                      );
                    })}
                </div>
              </div>
            ))}

            {/* Extras (colapsado: no estorba el camino al pago) */}
            <details className="glass-candy rounded-2xl group">
              <summary className="flex items-center justify-between cursor-pointer select-none list-none p-5 md:p-6 [&::-webkit-details-marker]:hidden">
                <span className="font-heading font-bold text-base">🍹 ¿Quieres extras? <span className="text-muted-foreground font-sans font-normal text-xs">(estacionamiento, covers)</span></span>
                <span className="text-primary text-lg transition-transform group-open:rotate-45">+</span>
              </summary>
              <div className="px-5 md:px-6 pb-5 md:pb-6">
              <label className="flex items-start gap-3 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={estacionamiento}
                  onChange={(e) => setEstacionamiento(e.target.checked)}
                  className="mt-1 w-5 h-5 rounded accent-[oklch(0.7_0.25_330)]"
                />
                <span className="text-sm leading-snug">
                  <span className="font-semibold">{addonEstac.nombre} · +{formatCLP(addonEstac.precio)}</span>
                  <span className="block text-muted-foreground text-xs mt-0.5">{addonEstac.descripcion}</span>
                </span>
              </label>

              {coversOn && (
                <div className="mt-5 pt-5 border-t border-border/40">
                  <p className="font-semibold text-sm">{covers.titulo}</p>
                  <p className="text-muted-foreground text-xs mb-3">{covers.descripcion}</p>
                  {covers.productos.map((p) => {
                    const q = coverQty[p.id] || 0;
                    const set = (delta: number) =>
                      setCoverQty((prev) => ({ ...prev, [p.id]: Math.max(0, Math.min(20, (prev[p.id] || 0) + delta)) }));
                    return (
                      <div key={p.id} className="flex items-center justify-between py-2">
                        <span className="text-sm">{p.nombre} <span className="text-muted-foreground">· {formatCLP(p.precio)}</span></span>
                        <div className="flex items-center gap-3">
                          <button type="button" onClick={() => set(-1)} className="w-8 h-8 rounded-full border border-primary/40 flex items-center justify-center hover:bg-primary/10 interactive" aria-label={`Quitar ${p.nombre}`}>
                            <Minus className="w-4 h-4" />
                          </button>
                          <span className="w-5 text-center font-bold tabular-nums text-sm">{q}</span>
                          <button type="button" onClick={() => set(1)} className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center hover:scale-105 transition-transform interactive" aria-label={`Agregar ${p.nombre}`}>
                            <Plus className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              </div>
            </details>

            {/* Códigos (colapsado) */}
            <details className="glass-candy rounded-2xl group">
              <summary className="flex items-center justify-between cursor-pointer select-none list-none p-5 md:p-6 [&::-webkit-details-marker]:hidden">
                <span className="font-heading font-bold text-base">🎟️ ¿Tienes un código? <span className="text-muted-foreground font-sans font-normal text-xs">(descuento o embajador)</span></span>
                <span className="text-primary text-lg transition-transform group-open:rotate-45">+</span>
              </summary>
              <div className="px-5 md:px-6 pb-5 md:pb-6 space-y-4">
                <div>
                  <Label htmlFor="discount">Código de descuento</Label>
                  <div className="flex gap-2 mt-1">
                    <Input id="discount" value={discountCode} onChange={(e) => setDiscountCode(e.target.value.toUpperCase())} placeholder="CANDY2026" disabled={!!discountApplied} />
                    <Button type="button" variant="outline" onClick={handleApplyDiscount} disabled={!!discountApplied || !discountCode} className="interactive">
                      <Tag className="w-4 h-4" />
                    </Button>
                  </div>
                  {discountApplied && <p className="text-sm text-green-400 mt-1">Descuento aplicado</p>}
                  {discountError && <p className="text-sm text-destructive mt-1">{discountError}</p>}
                </div>
                <div>
                  <Label htmlFor="ambassador">Código de embajador</Label>
                  <Input id="ambassador" value={ambassadorCode} onChange={(e) => setAmbassadorCode(e.target.value.toUpperCase())} className="mt-1" placeholder="Código de quien te invitó" />
                </div>
              </div>
            </details>
          </div>

          {/* Resumen */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.2 }} className="lg:col-span-2">
            <div className="sticky top-24 glass-candy rounded-2xl p-6">
              <h3 className="font-heading font-bold text-lg mb-4">Resumen</h3>
              <div className="space-y-3 mb-4">
                {cart.map((l) => (
                  <div key={l.key} className="flex justify-between text-sm">
                    <span>{l.quantity}× {l.nombre}</span>
                    <span>{formatCLP(l.precio * l.quantity)}</span>
                  </div>
                ))}
              </div>
              <div className="border-t border-border/40 pt-3 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span>{formatCLP(subtotal)}</span>
                </div>
                {discountAmount > 0 && (
                  <div className="flex justify-between text-sm text-green-400">
                    <span>Descuento</span>
                    <span>-{formatCLP(discountAmount)}</span>
                  </div>
                )}
                {estacionamiento && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{addonEstac.nombre}</span>
                    <span>+{formatCLP(addonEstac.precio)}</span>
                  </div>
                )}
                {covers.productos.map((p) => {
                  const q = coverQty[p.id] || 0;
                  if (q <= 0) return null;
                  return (
                    <div key={p.id} className="flex justify-between text-sm">
                      <span className="text-muted-foreground">{q}× {p.nombre}</span>
                      <span>+{formatCLP(q * p.precio)}</span>
                    </div>
                  );
                })}
                <div className="flex justify-between font-heading text-xl pt-2 border-t border-border/40">
                  <span>Total</span>
                  <span className="text-gradient-candy">{formatCLP(total)}</span>
                </div>
              </div>

              <Button type="submit" disabled={isProcessing} className="btn-jelly w-full h-12 rounded-full text-base font-bold uppercase tracking-wide mt-6 bg-primary text-primary-foreground">
                {isProcessing ? (
                  <><Loader2 className="w-5 h-5 animate-spin mr-2" /> Procesando…</>
                ) : useConfig ? 'Reservar mi acceso' : 'Pagar con Mercado Pago'}
              </Button>
              <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground text-center mt-3">
                <ShieldCheck className="w-3.5 h-3.5" /> Pago seguro · Evento +{CANDYLAND.edadMinima}
              </p>
            </div>
          </motion.div>
        </form>
      </div>
    </div>
  );
}
