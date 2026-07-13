import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { motion, AnimatePresence } from 'framer-motion';
import { useRoute, useSearch, Link } from 'wouter';
import { ArrowLeft, ArrowRight, Tag, Loader2, CheckCircle2, ShieldCheck, Minus, Plus } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { CANDYLAND, CAMPOS_COMPRADOR, formatCLP, coversDisponibles, type Acceso, type CampoForm } from '@/config/candyland';

/**
 * Checkout progresivo: un grupo pequeño de datos por paso ("Paso X de Y"),
 * pensado como popup a pantalla completa en móvil. Los datos se conservan en
 * sessionStorage al retroceder o cerrar por accidente.
 */

const STORAGE_KEY = 'candyland_checkout_draft';

/* Emoji por acceso para el selector (coincide con CandyPass) */
const EMOJIS: Record<string, string> = {
  duo: '🍒', soltera: '🍭', soltero: '🔑', trio: '🍬', cumpleaneros: '🎂',
};

function buildSchema(fields: { key: string; field: CampoForm }[]) {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const { key, field } of fields) {
    if (field.type === 'checkbox') {
      shape[key] = field.required
        ? z.boolean().refine((v) => v === true, { message: 'Debes confirmar para continuar' })
        : z.boolean().optional();
    } else if (field.type === 'email') {
      shape[key] = field.required
        ? z.string().min(1, 'Este dato es necesario').email('Revisa el formato del email')
        : z.string().email('Revisa el formato del email').or(z.literal('')).optional();
    } else if (field.required) {
      shape[key] = z.string().min(1, 'Este dato es necesario');
    } else {
      shape[key] = z.string().optional();
    }
  }
  return z.object(shape);
}

/* Autocomplete semántico por nombre de campo (teclado móvil correcto) */
function autoCompleteFor(name: string): string | undefined {
  if (name.includes('nombre')) return 'name';
  if (name.includes('email')) return 'email';
  if (name.includes('whatsapp')) return 'tel';
  return undefined;
}

function CampoInput({
  fieldKey, field, register, error,
}: {
  fieldKey: string;
  field: CampoForm;
  register: any;
  error?: string;
}) {
  if (field.type === 'checkbox') {
    return (
      <label className="flex items-start gap-3 cursor-pointer select-none py-1">
        <input type="checkbox" {...register(fieldKey)} className="mt-1 w-6 h-6 rounded accent-[oklch(0.7_0.25_330)]" />
        <span className="text-sm leading-snug">
          {field.label}
          {error && <span className="block text-destructive text-xs mt-0.5">{error}</span>}
        </span>
      </label>
    );
  }
  return (
    <div>
      <Label htmlFor={fieldKey} className="text-sm">
        {field.label} {field.required && <span className="text-primary">*</span>}
      </Label>
      {field.type === 'textarea' ? (
        <Textarea id={fieldKey} {...register(fieldKey)} placeholder={field.placeholder} className="mt-1.5" rows={3} />
      ) : field.type === 'select' ? (
        <select id={fieldKey} {...register(fieldKey)} className="mt-1.5 w-full h-12 rounded-md border border-input bg-transparent px-3 text-base">
          <option value="">Selecciona…</option>
          {(field.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      ) : (
        <Input
          id={fieldKey}
          type={field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : field.type === 'tel' ? 'tel' : field.type === 'email' ? 'email' : 'text'}
          inputMode={field.type === 'tel' ? 'tel' : field.type === 'email' ? 'email' : field.type === 'number' ? 'numeric' : undefined}
          autoComplete={autoCompleteFor(fieldKey)}
          {...register(fieldKey)}
          placeholder={field.placeholder}
          className="mt-1.5 h-12 text-base"
        />
      )}
      {field.help && <p className="text-xs text-muted-foreground mt-1">{field.help}</p>}
      {error && <p className="text-xs text-destructive mt-1">{error}</p>}
    </div>
  );
}

export default function Checkout() {
  const [, params] = useRoute('/checkout/:eventSlug');
  const eventSlug = params?.eventSlug ?? CANDYLAND.slug;
  const search = useSearch();
  const itemsParam = new URLSearchParams(search).get('items') || '';

  const { data: event } = trpc.events.getBySlug.useQuery({ slug: eventSlug }, { retry: false });
  const { data: liveTicketsData } = trpc.events.getTicketTypes.useQuery({ slug: eventSlug }, { retry: false });
  const liveTickets = liveTicketsData ?? [];
  const useConfig = liveTickets.length === 0; // sin DB → modo demo con config

  const validateDiscount = trpc.orders.validateDiscount.useMutation();
  const createOrder = trpc.orders.create.useMutation();

  /* ── Selección de acceso + cantidad (Paso 1) ─────────────── */
  const initialId = itemsParam.split(',')[0]?.split(':')[0] || CANDYLAND.accesos[0].id;
  const initialQty = Math.max(1, Number(itemsParam.split(',')[0]?.split(':')[1]) || 1);

  const [accesoId, setAccesoId] = useState(initialId);
  const [qty, setQty] = useState(initialQty);

  const acceso: Acceso | undefined = useMemo(() => {
    if (useConfig) return CANDYLAND.accesos.find((a) => a.id === accesoId);
    const tt = liveTickets.find((t: any) => String(t.id) === accesoId);
    if (!tt) return undefined;
    const cfg = CANDYLAND.accesos.find((a) => a.nombre.toLowerCase() === (tt as any).name.toLowerCase());
    return {
      id: accesoId,
      nombre: (tt as any).name,
      precio: Number((tt as any).price),
      personas: cfg?.personas ?? 1,
      descripcion: cfg?.descripcion ?? '',
      beneficios: cfg?.beneficios ?? [],
      estado: 'available',
      exclusivoComunidad: cfg?.exclusivoComunidad ?? false,
      campos: cfg?.campos,
    };
  }, [accesoId, useConfig, liveTickets]);

  const opciones: Acceso[] = useConfig
    ? [...CANDYLAND.accesos]
    : liveTickets.filter((t: any) => t.status !== 'hidden').map((t: any) => {
        const cfg = CANDYLAND.accesos.find((a) => a.nombre.toLowerCase() === t.name.toLowerCase());
        return { ...(cfg ?? CANDYLAND.accesos[0]), id: String(t.id), nombre: t.name, precio: Number(t.price) };
      });

  /* ── Extras / códigos (en Resumen) ───────────────────────── */
  const [estacionamiento, setEstacionamiento] = useState(false);
  const [coverQty, setCoverQty] = useState<Record<string, number>>({});
  const [discountCode, setDiscountCode] = useState('');
  const [ambassadorCode, setAmbassadorCode] = useState('');
  const [discountApplied, setDiscountApplied] = useState<any>(null);
  const [discountError, setDiscountError] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const addonEstac = CANDYLAND.addons.estacionamiento;
  const covers = CANDYLAND.addons.covers;
  const coversOn = coversDisponibles();

  /* ── Pasos dinámicos ─────────────────────────────────────── */
  const camposAcceso = acceso?.campos ?? [];
  type Paso = { id: string; titulo: string; sub?: string; keys: string[] };
  const pasos: Paso[] = useMemo(() => {
    const p: Paso[] = [
      { id: 'acceso', titulo: 'Tu acceso', sub: 'Elige tu llave a Candyland', keys: [] },
      { id: 'datos', titulo: 'Tus datos', sub: 'Como aparecen en tu carnet', keys: ['buyer__nombre', 'buyer__rut', 'buyer__mayorEdad'] },
      { id: 'contacto', titulo: 'Contacto', sub: 'Aquí llega tu entrada', keys: ['buyer__email', 'buyer__whatsapp', 'buyer__instagram'] },
    ];
    if (camposAcceso.length > 0) {
      p.push({ id: 'extra', titulo: `Datos ${acceso?.nombre ?? ''}`, sub: 'Lo que pide este acceso', keys: camposAcceso.map((f) => `acceso__${f.name}`) });
    }
    p.push({ id: 'resumen', titulo: 'Resumen', sub: 'Revisa y paga', keys: [] });
    return p;
  }, [camposAcceso, acceso?.nombre]);

  const [paso, setPaso] = useState(0);
  const total_pasos = pasos.length;
  const pasoActual = pasos[Math.min(paso, total_pasos - 1)];

  /* ── Formulario (todos los campos, validación por paso) ──── */
  const allFields = useMemo(() => {
    const buyer = CAMPOS_COMPRADOR.map((f) => ({ key: `buyer__${f.name}`, field: f }));
    const extra = camposAcceso.map((f) => ({ key: `acceso__${f.name}`, field: f }));
    return [...buyer, ...extra];
  }, [camposAcceso]);

  const schema = useMemo(() => buildSchema(allFields), [allFields]);

  /* Restaurar borrador (persistencia ante cierres accidentales) */
  const draft = useMemo(() => {
    try { return JSON.parse(sessionStorage.getItem(STORAGE_KEY) || '{}'); } catch { return {}; }
  }, []);

  const { register, handleSubmit, trigger, watch, formState: { errors } } = useForm({
    resolver: zodResolver(schema),
    mode: 'onBlur',
    defaultValues: draft.values ?? {},
  });

  useEffect(() => {
    if (draft.accesoId && CANDYLAND.accesos.some((a) => a.id === draft.accesoId)) setAccesoId(draft.accesoId);
    if (draft.qty) setQty(draft.qty);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const sub = watch((values) => {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ values, accesoId, qty }));
    });
    return () => sub.unsubscribe();
  }, [watch, accesoId, qty]);

  /* ── Totales ─────────────────────────────────────────────── */
  const subtotal = (acceso?.precio ?? 0) * qty;
  const discountAmount = discountApplied
    ? discountApplied.discountType === 'percentage'
      ? Math.round(subtotal * Number(discountApplied.discountValue) / 100)
      : Number(discountApplied.discountValue)
    : 0;
  const coversTotal = covers.productos.reduce((s, p) => s + (coverQty[p.id] || 0) * p.precio, 0);
  const total = Math.max(0, subtotal - discountAmount) + (estacionamiento ? addonEstac.precio : 0) + coversTotal;

  const handleApplyDiscount = async () => {
    if (!discountCode.trim() || !event?.id) return;
    setDiscountError('');
    try {
      const result = await validateDiscount.mutateAsync({ code: discountCode, eventId: event.id });
      if (result.valid) setDiscountApplied(result.discount);
      else setDiscountError(result.message || 'Código inválido');
    } catch {
      setDiscountError('No pudimos validar el código');
    }
  };

  /* ── Navegación entre pasos ──────────────────────────────── */
  const continuar = async () => {
    if (pasoActual.keys.length > 0) {
      const ok = await trigger(pasoActual.keys as any, { shouldFocus: true });
      if (!ok) return;
    }
    setPaso((p) => Math.min(p + 1, total_pasos - 1));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const volver = () => {
    setPaso((p) => Math.max(p - 1, 0));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const onSubmit = async (values: Record<string, any>) => {
    const attendeeData = JSON.stringify({
      acceso: acceso?.nombre, cantidad: qty,
      extras: { estacionamiento, covers: covers.productos.filter((p) => (coverQty[p.id] || 0) > 0).map((p) => ({ nombre: p.nombre, cantidad: coverQty[p.id] })) },
      campos: values,
    });

    if (useConfig) {
      sessionStorage.removeItem(STORAGE_KEY);
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
        items: [{ ticketTypeId: Number(accesoId), quantity: qty }],
        discountCode: discountCode || undefined,
        ambassadorCode: ambassadorCode || undefined,
        attendeeData,
      });
      sessionStorage.removeItem(STORAGE_KEY);
      if (result.checkoutUrl) window.location.href = result.checkoutUrl;
    } catch (err: any) {
      setIsProcessing(false);
      alert(err.message || 'Error al procesar la orden');
    }
  };

  /* ── Confirmación (modo demo sin DB) ─────────────────────── */
  if (submitted) {
    return (
      <div className="min-h-dvh pt-28 pb-16">
        <div className="container max-w-lg text-center">
          <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.5 }}>
            <div className="w-20 h-20 rounded-full bg-primary/15 flex items-center justify-center mx-auto mb-6">
              <CheckCircle2 className="w-10 h-10 text-primary" />
            </div>
            <h1 className="font-heading font-bold text-3xl md:text-4xl mb-3">¡Datos recibidos! 🍭</h1>
            <p className="text-muted-foreground mb-6">
              Tu reserva de <strong className="text-foreground">{qty}× {acceso?.nombre}</strong> quedó registrada.
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

  const err = (key: string) => (errors as any)[key]?.message as string | undefined;

  return (
    <div className="min-h-dvh pt-20 pb-32 md:pb-16 flex flex-col">
      <div className="container max-w-lg flex-1">
        {/* Encabezado + progreso */}
        <div className="flex items-center justify-between mb-2 pt-4">
          <Link href="/#entradas" className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground text-sm interactive" aria-label="Volver a los accesos">
            <ArrowLeft className="w-4 h-4" /> Salir
          </Link>
          <span className="text-xs uppercase tracking-[0.2em] text-muted-foreground" aria-live="polite">
            Paso {paso + 1} de {total_pasos}
          </span>
        </div>
        <div className="h-1.5 rounded-full bg-muted overflow-hidden mb-6" role="progressbar" aria-valuenow={paso + 1} aria-valuemin={1} aria-valuemax={total_pasos}>
          <motion.div
            animate={{ width: `${((paso + 1) / total_pasos) * 100}%` }}
            transition={{ duration: 0.35, ease: [0.23, 1, 0.32, 1] }}
            className="h-full rounded-full bg-gradient-to-r from-primary via-cherry to-violet-electric"
          />
        </div>

        <form onSubmit={handleSubmit(onSubmit)} id="checkout-form">
          <AnimatePresence mode="wait">
            <motion.div
              key={pasoActual.id}
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -18 }}
              transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
            >
              <h1 className="font-heading font-extrabold text-2xl md:text-3xl tracking-tight mb-1">{pasoActual.titulo}</h1>
              {pasoActual.sub && <p className="text-muted-foreground text-sm mb-5">{pasoActual.sub}</p>}

              {/* Paso 1: acceso + cantidad */}
              {pasoActual.id === 'acceso' && (
                <div className="space-y-3">
                  {opciones.map((op) => {
                    const activo = op.id === accesoId;
                    return (
                      <button
                        key={op.id}
                        type="button"
                        onClick={() => setAccesoId(op.id)}
                        aria-pressed={activo}
                        className={`w-full flex items-center justify-between gap-3 rounded-2xl border p-4 text-left transition-all interactive ${
                          activo ? 'border-primary bg-primary/10 shadow-[0_0_25px_rgba(255,79,195,0.25)]' : 'border-border/50 glass-candy hover:border-primary/40'
                        }`}
                      >
                        <span className="flex items-center gap-3">
                          <span className="text-2xl">{EMOJIS[CANDYLAND.accesos.find((a) => a.nombre.toLowerCase() === op.nombre.toLowerCase())?.id ?? op.id] ?? '🍬'}</span>
                          <span>
                            <span className="block font-heading font-bold text-base">{op.nombre}</span>
                            <span className="block text-xs text-muted-foreground">{op.personas} persona{op.personas > 1 ? 's' : ''}</span>
                          </span>
                        </span>
                        <span className="font-heading font-bold text-gradient-candy">{formatCLP(op.precio)}</span>
                      </button>
                    );
                  })}

                  <div className="flex items-center justify-between glass-candy rounded-2xl p-4 mt-2">
                    <span className="text-sm font-semibold">Cantidad</span>
                    <div className="flex items-center gap-4">
                      <button type="button" onClick={() => setQty((q) => Math.max(1, q - 1))} aria-label="Quitar uno" className="w-11 h-11 rounded-full border border-primary/40 flex items-center justify-center hover:bg-primary/10 interactive">
                        <Minus className="w-4 h-4" />
                      </button>
                      <span className="w-6 text-center font-bold text-lg tabular-nums">{qty}</span>
                      <button type="button" onClick={() => setQty((q) => Math.min(10, q + 1))} aria-label="Agregar uno" className="w-11 h-11 rounded-full bg-primary text-primary-foreground flex items-center justify-center hover:scale-105 transition-transform interactive">
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {acceso?.nota && (
                    <p className="text-xs leading-relaxed text-foreground/85 bg-primary/10 border border-primary/20 rounded-xl p-3">{acceso.nota}</p>
                  )}
                </div>
              )}

              {/* Pasos de campos (datos / contacto / extra) */}
              {pasoActual.keys.length > 0 && (
                <div className="space-y-4">
                  {pasoActual.keys.map((key) => {
                    const f = allFields.find((x) => x.key === key);
                    if (!f) return null;
                    return <CampoInput key={key} fieldKey={key} field={f.field} register={register} error={err(key)} />;
                  })}
                </div>
              )}

              {/* Paso final: resumen */}
              {pasoActual.id === 'resumen' && (
                <div className="space-y-4">
                  <div className="glass-candy rounded-2xl p-5">
                    <div className="flex justify-between text-sm mb-2">
                      <span>{qty}× {acceso?.nombre}</span>
                      <span>{formatCLP(subtotal)}</span>
                    </div>
                    {discountAmount > 0 && (
                      <div className="flex justify-between text-sm text-green-400 mb-2"><span>Descuento</span><span>-{formatCLP(discountAmount)}</span></div>
                    )}
                    {estacionamiento && (
                      <div className="flex justify-between text-sm mb-2"><span className="text-muted-foreground">{addonEstac.nombre}</span><span>+{formatCLP(addonEstac.precio)}</span></div>
                    )}
                    {covers.productos.map((p) => {
                      const q = coverQty[p.id] || 0;
                      if (q <= 0) return null;
                      return <div key={p.id} className="flex justify-between text-sm mb-2"><span className="text-muted-foreground">{q}× {p.nombre}</span><span>+{formatCLP(q * p.precio)}</span></div>;
                    })}
                    <div className="flex justify-between font-heading text-2xl pt-3 border-t border-border/40">
                      <span>Total</span>
                      <span className="text-gradient-candy">{formatCLP(total)}</span>
                    </div>
                  </div>

                  {/* Extras */}
                  <details className="glass-candy rounded-2xl group">
                    <summary className="flex items-center justify-between cursor-pointer select-none list-none p-4 [&::-webkit-details-marker]:hidden">
                      <span className="font-heading font-bold text-sm">🍹 ¿Quieres extras?</span>
                      <span className="text-primary text-lg transition-transform group-open:rotate-45">+</span>
                    </summary>
                    <div className="px-4 pb-4 space-y-3">
                      <label className="flex items-start gap-3 cursor-pointer select-none">
                        <input type="checkbox" checked={estacionamiento} onChange={(e) => setEstacionamiento(e.target.checked)} className="mt-1 w-5 h-5 rounded accent-[oklch(0.7_0.25_330)]" />
                        <span className="text-sm leading-snug">
                          <span className="font-semibold">{addonEstac.nombre} · +{formatCLP(addonEstac.precio)}</span>
                          <span className="block text-muted-foreground text-xs mt-0.5">{addonEstac.descripcion}</span>
                        </span>
                      </label>
                      {coversOn && covers.productos.map((p) => {
                        const q = coverQty[p.id] || 0;
                        const set = (d: number) => setCoverQty((prev) => ({ ...prev, [p.id]: Math.max(0, Math.min(20, (prev[p.id] || 0) + d)) }));
                        return (
                          <div key={p.id} className="flex items-center justify-between">
                            <span className="text-sm">{p.nombre} <span className="text-muted-foreground">· {formatCLP(p.precio)}</span></span>
                            <div className="flex items-center gap-3">
                              <button type="button" onClick={() => set(-1)} aria-label={`Quitar ${p.nombre}`} className="w-9 h-9 rounded-full border border-primary/40 flex items-center justify-center hover:bg-primary/10 interactive"><Minus className="w-4 h-4" /></button>
                              <span className="w-5 text-center font-bold tabular-nums text-sm">{q}</span>
                              <button type="button" onClick={() => set(1)} aria-label={`Agregar ${p.nombre}`} className="w-9 h-9 rounded-full bg-primary text-primary-foreground flex items-center justify-center interactive"><Plus className="w-4 h-4" /></button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </details>

                  {/* Códigos */}
                  <details className="glass-candy rounded-2xl group">
                    <summary className="flex items-center justify-between cursor-pointer select-none list-none p-4 [&::-webkit-details-marker]:hidden">
                      <span className="font-heading font-bold text-sm">🎟️ ¿Tienes un código?</span>
                      <span className="text-primary text-lg transition-transform group-open:rotate-45">+</span>
                    </summary>
                    <div className="px-4 pb-4 space-y-3">
                      <div>
                        <Label htmlFor="discount" className="text-sm">Código de descuento</Label>
                        <div className="flex gap-2 mt-1">
                          <Input id="discount" value={discountCode} onChange={(e) => setDiscountCode(e.target.value.toUpperCase())} placeholder="CANDY2026" disabled={!!discountApplied} className="h-11" />
                          <Button type="button" variant="outline" onClick={handleApplyDiscount} disabled={!!discountApplied || !discountCode} className="interactive h-11" aria-label="Aplicar código">
                            <Tag className="w-4 h-4" />
                          </Button>
                        </div>
                        {discountApplied && <p className="text-sm text-green-400 mt-1">Descuento aplicado ✓</p>}
                        {discountError && <p className="text-sm text-destructive mt-1" role="alert">{discountError}</p>}
                      </div>
                      <div>
                        <Label htmlFor="ambassador" className="text-sm">Código de embajador</Label>
                        <Input id="ambassador" value={ambassadorCode} onChange={(e) => setAmbassadorCode(e.target.value.toUpperCase())} className="mt-1 h-11" placeholder="Código de quien te invitó" />
                      </div>
                    </div>
                  </details>

                  <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
                    <ShieldCheck className="w-3.5 h-3.5" /> Pago seguro con Mercado Pago · Evento +{CANDYLAND.edadMinima}
                  </p>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </form>
      </div>

      {/* Barra de acciones fija (thumb-reach en móvil) */}
      <div className="fixed bottom-0 inset-x-0 z-40 p-3 bg-gradient-to-t from-background via-background/95 to-transparent pt-6">
        <div className="container max-w-lg flex items-center gap-3">
          {paso > 0 && (
            <button type="button" onClick={volver} className="px-6 h-13 py-3.5 rounded-full border border-border text-sm font-semibold hover:border-primary/50 interactive shrink-0">
              Volver
            </button>
          )}
          {pasoActual.id !== 'resumen' ? (
            <button
              type="button"
              onClick={continuar}
              className="btn-jelly flex-1 h-13 py-3.5 rounded-full bg-primary text-primary-foreground font-bold uppercase tracking-wide text-sm inline-flex items-center justify-center gap-2 interactive"
            >
              Continuar <ArrowRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              type="submit"
              form="checkout-form"
              disabled={isProcessing}
              className="btn-jelly flex-1 h-13 py-3.5 rounded-full bg-primary text-primary-foreground font-bold uppercase tracking-wide text-sm inline-flex items-center justify-center gap-2 interactive"
            >
              {isProcessing ? (<><Loader2 className="w-5 h-5 animate-spin" /> Procesando…</>) : useConfig ? 'Reservar mi acceso' : `Pagar ${formatCLP(total)}`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
