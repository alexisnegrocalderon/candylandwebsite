import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { motion, AnimatePresence } from 'framer-motion';
import { useRoute, useSearch, Link } from 'wouter';
import { ArrowLeft, ArrowRight, Tag, Loader2, Check, ShieldCheck, Minus, Plus, MessageCircle } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CANDYLAND, CAMPOS_COMPRADOR, formatCLP, coversDisponibles, whatsappComunidadLink, type Acceso, type CampoForm } from '@/config/candyland';

/**
 * Checkout conversacional: una sola pregunta por pantalla, estilo "asistente"
 * que avanza casi solo (clic > texto). Popup a pantalla completa en móvil.
 * Los datos se conservan en sessionStorage al retroceder o cerrar por accidente.
 */

const STORAGE_KEY = 'candyland_checkout_draft';

/* Emoji por acceso (usado en el resumen final) */
const EMOJIS: Record<string, string> = {
  duo: '🍒', soltera: '🍭', soltero: '🔑', trio: '🍬', grupo: '🌈', cumpleaneros: '🎂',
};

type GroupSize = 1 | 2 | 3 | 4;
type DuoComposicion = 'mixta' | 'dos_mujeres' | 'dos_hombres';

const VIBE_OPTIONS: { size: GroupSize; image: string; label: string; emoji: string }[] = [
  { size: 1, image: '/candyland/checkout/vibe-solo.webp', label: 'Voy solo/a', emoji: '👤' },
  { size: 2, image: '/candyland/checkout/vibe-pareja.webp', label: 'Venimos en pareja', emoji: '💕' },
  { size: 3, image: '/candyland/checkout/vibe-triada.webp', label: 'Somos una tríada', emoji: '🎭' },
  { size: 4, image: '/candyland/checkout/vibe-grupo.webp', label: 'Venimos en grupo', emoji: '🌈' },
];

const QUIEN_OPTIONS: { slug: 'soltera' | 'soltero'; image: string; label: string; sub: string; emoji: string }[] = [
  { slug: 'soltera', image: '/candyland/checkout/quien-ella.webp', label: 'Vengo como ella', sub: 'Acceso Soltera', emoji: '🍭' },
  { slug: 'soltero', image: '/candyland/checkout/quien-el.webp', label: 'Vengo como él', sub: 'Acceso Soltero — código de comunidad', emoji: '🔑' },
];

const PAREJA_OPTIONS: { tipo: DuoComposicion; image: string; label: string; emoji: string }[] = [
  { tipo: 'mixta', image: '/candyland/checkout/pareja-mixta.webp', label: 'Hombre y Mujer', emoji: '💑' },
  { tipo: 'dos_mujeres', image: '/candyland/checkout/pareja-dos-mujeres.webp', label: 'Dos Mujeres', emoji: '👭' },
  { tipo: 'dos_hombres', image: '/candyland/checkout/pareja-dos-hombres.webp', label: 'Dos Hombres', emoji: '👬' },
];

const GROUP_TO_ACCESO: Record<3 | 4, string> = { 3: 'trio', 4: 'grupo' };

/* Accesos que se eligen fuera del flujo conversacional (link directo desde
 * un CTA específico) y por eso saltan la pregunta "¿Cómo vienes?" */
const SPECIAL_SKIP_VIBE = ['soltero', 'cumpleaneros'];

/* Campo de código de comunidad inyectado cuando el acceso lo requiere y no
 * viene ya definido en candyland.ts (ej. Dúo Dos Hombres, que no es un acceso
 * propio — sigue siendo "duo" pero con esta validación extra). */
const COMMUNITY_CODE_FIELD: CampoForm = {
  name: 'codigo_acceso',
  label: 'Código de comunidad',
  type: 'text',
  required: true,
  placeholder: 'Tu código de validación',
  help: 'Sin código no se puede completar la compra. Consíguelo por WhatsApp.',
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

/* Copy cercano y conversacional por campo — reemplaza la etiqueta técnica
 * por una pregunta hablada. Los acompañantes se resuelven por patrón
 * (acompN_campo) para que funcione automáticamente con cualquier acceso. */
function friendlyPregunta(rawKey: string, field: CampoForm): { titulo: string; sub?: string } {
  const m = rawKey.match(/^acomp(\d)_(nombre|rut|instagram)$/);
  if (m) {
    const n = Number(m[1]);
    const quien = n === 1 && !field.required ? 'tu +1' : n === 1 ? 'tu acompañante' : `tu acompañante ${n}`;
    if (m[2] === 'nombre') return { titulo: `¿Cómo se llama ${quien}?`, sub: field.required ? 'Así aparece en su carnet de acceso.' : 'Puedes completarlo ahora o después — es opcional.' };
    if (m[2] === 'rut') return { titulo: '¿Cuál es su RUT?', sub: field.required ? 'Lo pedimos para su carnet de acceso.' : 'Opcional, puedes saltarlo.' };
    return { titulo: '¿Su Instagram?', sub: 'Opcional, para etiquetarlos en las fotos de la fiesta.' };
  }
  switch (rawKey) {
    case 'nombre': return { titulo: '¿Cómo te llamas?', sub: 'Así aparece en tu carnet de acceso.' };
    case 'email': return { titulo: '¿A qué email enviamos tu entrada?', sub: 'Ahí llega tu QR y la dirección exacta.' };
    case 'whatsapp': return { titulo: '¿Cuál es tu WhatsApp?', sub: 'Por si necesitamos contactarte antes de la fiesta.' };
    case 'rut': return { titulo: 'Tu RUT, para el carnet', sub: 'Tus datos son 100% privados.' };
    case 'instagram': return { titulo: '¿Nos compartes tu Instagram?', sub: 'Es el único dato opcional — puedes saltarlo.' };
    case 'mayorEdad': return { titulo: 'Una última confirmación', sub: 'Candyland es un evento estrictamente +18.' };
    case 'codigo_acceso': return { titulo: 'Tu código de comunidad', sub: field.help };
    case 'fecha_nacimiento': return { titulo: '¿Cuándo es tu cumpleaños?', sub: 'Lo validamos con tu carnet en la puerta.' };
    default: return { titulo: field.label.replace(' (opcional)', ''), sub: field.help };
  }
}

function loadMercadoPagoSdk(): Promise<void> {
  return new Promise((resolve, reject) => {
    if ((window as any).MercadoPago) return resolve();
    const script = document.createElement('script');
    script.src = 'https://sdk.mercadopago.com/js/v2';
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('No se pudo cargar Mercado Pago'));
    document.head.appendChild(script);
  });
}

function BigOption({
  emoji, titulo, sub, activo, onClick,
}: { emoji: string; titulo: string; sub?: string; activo?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={!!activo}
      className={`w-full flex items-center gap-3 rounded-2xl border p-4 text-left transition-all interactive ${
        activo ? 'border-primary bg-primary/10 shadow-[0_0_20px_oklch(0.68_0.16_340_/_0.2)]' : 'border-border/50 glass-candy hover:border-primary/40'
      }`}
    >
      <span className="text-2xl">{emoji}</span>
      <span>
        <span className="block font-heading font-bold text-base">{titulo}</span>
        {sub && <span className="block text-xs text-muted-foreground">{sub}</span>}
      </span>
    </button>
  );
}

function SquareImageOption({
  image, titulo, sub, activo, onClick, fallbackEmoji,
}: { image: string; titulo: string; sub?: string; activo?: boolean; onClick: () => void; fallbackEmoji?: string }) {
  const [imgOk, setImgOk] = useState(true);
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={!!activo}
      className={`relative aspect-square rounded-2xl overflow-hidden border-2 text-left interactive transition-all ${
        activo ? 'border-primary shadow-[0_0_20px_oklch(0.68_0.16_340_/_0.3)]' : 'border-border/50 hover:border-primary/40'
      }`}
    >
      {imgOk ? (
        <img src={image} alt="" aria-hidden loading="lazy" onError={() => setImgOk(false)} className="absolute inset-0 w-full h-full object-cover" />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-primary/25 via-cherry/15 to-violet-electric/20 flex items-center justify-center text-4xl">
          {fallbackEmoji ?? '🍬'}
        </div>
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-background/90 via-background/15 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 p-2.5 md:p-3.5">
        <span className="block font-heading font-bold text-xs md:text-base text-foreground leading-tight">{titulo}</span>
        {sub && <span className="block text-[9px] md:text-xs text-muted-foreground mt-0.5 leading-tight">{sub}</span>}
      </div>
      {activo && (
        <span className="absolute top-2 right-2 w-5 h-5 md:w-6 md:h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center">
          <Check className="w-3 h-3 md:w-3.5 md:h-3.5" />
        </span>
      )}
    </button>
  );
}

function SingleFieldInput({
  fieldKey, field, register, error, onEnter,
}: { fieldKey: string; field: CampoForm; register: any; error?: string; onEnter: () => void }) {
  return (
    <div>
      <Input
        id={fieldKey}
        type={field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : field.type === 'tel' ? 'tel' : field.type === 'email' ? 'email' : 'text'}
        inputMode={field.type === 'tel' ? 'tel' : field.type === 'email' ? 'email' : field.type === 'number' ? 'numeric' : undefined}
        autoComplete={autoCompleteFor(fieldKey)}
        autoFocus
        {...register(fieldKey)}
        placeholder={field.placeholder}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); onEnter(); } }}
        className="h-14 text-lg"
      />
      {field.help && <p className="text-xs text-muted-foreground mt-2">{field.help}</p>}
      {error && <p className="text-sm text-destructive mt-2" role="alert">{error}</p>}
    </div>
  );
}

export default function Checkout() {
  const [, params] = useRoute('/checkout/:eventSlug');
  const eventSlug = params?.eventSlug ?? CANDYLAND.slug;
  const search = useSearch();
  const itemsParam = new URLSearchParams(search).get('items') || '';
  const initialFromUrl = itemsParam.split(',')[0]?.split(':')[0] || '';
  const initialQtyFromUrl = Math.max(1, Number(itemsParam.split(',')[0]?.split(':')[1]) || 1);
  const skipVibe = SPECIAL_SKIP_VIBE.includes(initialFromUrl);

  const { data: event } = trpc.events.getBySlug.useQuery({ slug: eventSlug }, { retry: false });
  const { data: liveTicketsData } = trpc.events.getTicketTypes.useQuery({ slug: eventSlug }, { retry: false });
  const liveTickets = liveTicketsData ?? [];
  const useConfig = liveTickets.length === 0; // sin DB → modo demo con config

  const validateDiscount = trpc.orders.validateDiscount.useMutation();
  const validateCommunityCode = trpc.communityCodes.validate.useMutation();
  const createOrder = trpc.orders.create.useMutation();

  /* ── "¿Cómo vienes?" (Paso 1) + acceso resuelto a partir de la respuesta ── */
  const [groupSize, setGroupSize] = useState<GroupSize | null>(() => {
    if (initialFromUrl === 'soltera' || initialFromUrl === 'soltero') return 1;
    if (initialFromUrl === 'duo') return 2;
    if (initialFromUrl === 'trio') return 3;
    if (initialFromUrl === 'grupo') return 4;
    return null;
  });
  const [accesoSlug, setAccesoSlug] = useState<string>(initialFromUrl);
  const [duoComposicion, setDuoComposicion] = useState<DuoComposicion | null>(null);
  const [qty, setQty] = useState(initialQtyFromUrl);

  const accesoId = useMemo(() => {
    if (!accesoSlug) return '';
    if (useConfig) return accesoSlug;
    const cfg = CANDYLAND.accesos.find((a) => a.id === accesoSlug);
    const match = liveTickets.find((t: any) => cfg && t.name.toLowerCase() === cfg.nombre.toLowerCase());
    return match ? String(match.id) : accesoSlug;
  }, [accesoSlug, useConfig, liveTickets]);

  const acceso: Acceso | undefined = useMemo(() => {
    if (!accesoId) return undefined;
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

  const chooseVibe = (size: GroupSize) => {
    setGroupSize(size);
    // Solo/a → resuelve en el paso "quien". Pareja → resuelve en "pareja-composicion".
    if (size === 3 || size === 4) setAccesoSlug(GROUP_TO_ACCESO[size]);
    continuar();
  };
  const chooseQuien = (slug: 'soltera' | 'soltero') => {
    setAccesoSlug(slug);
    continuar();
  };
  const choosePareja = (tipo: DuoComposicion) => {
    setDuoComposicion(tipo);
    setAccesoSlug('duo');
    continuar();
  };

  /* Dúo Dos Hombres necesita el mismo código de comunidad que Soltero. */
  const requiresCommunityCode = accesoSlug === 'soltero' || (accesoSlug === 'duo' && duoComposicion === 'dos_hombres');

  /* ── Extras / códigos ────────────────────────────────────── */
  const [estacionamiento, setEstacionamiento] = useState(false);
  const [coverQty, setCoverQty] = useState<Record<string, number>>({});
  const [discountCode, setDiscountCode] = useState('');
  const [ambassadorCode, setAmbassadorCode] = useState('');
  const [discountApplied, setDiscountApplied] = useState<any>(null);
  const [discountError, setDiscountError] = useState('');
  const [communityCodeInput, setCommunityCodeInput] = useState('');
  const [communityCodeStatus, setCommunityCodeStatus] = useState<'idle' | 'valid' | 'invalid'>('idle');
  const [communityCodeError, setCommunityCodeError] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const addonEstac = CANDYLAND.addons.estacionamiento;
  const covers = CANDYLAND.addons.covers;
  const coversOn = coversDisponibles();

  /* ── Pasos: una sola pregunta por pantalla ───────────────── */
  const camposAcceso = useMemo(() => {
    const base = acceso?.campos ?? [];
    if (requiresCommunityCode && !base.some((f) => f.name === 'codigo_acceso')) {
      return [...base, COMMUNITY_CODE_FIELD];
    }
    return base;
  }, [acceso, requiresCommunityCode]);

  type Paso = { id: string; titulo: string; sub?: string; keys: string[] };
  const pasos: Paso[] = useMemo(() => {
    const p: Paso[] = [];
    if (!skipVibe) {
      p.push({ id: 'vibe', titulo: '✨ ¿Cómo vienes a vivir Candyland?', sub: 'Selecciona la opción que mejor los representa.', keys: [] });
      if (groupSize === 1) {
        p.push({ id: 'quien', titulo: 'Perfecto.', sub: 'Cuéntanos cómo vienes.', keys: [] });
      }
      if (groupSize === 2) {
        p.push({ id: 'pareja-composicion', titulo: '¿Cómo es la pareja?', sub: 'Cuéntanos quiénes vienen.', keys: [] });
      }
    }
    for (const f of CAMPOS_COMPRADOR) {
      const key = `buyer__${f.name}`;
      const { titulo, sub } = friendlyPregunta(f.name, f);
      p.push({ id: key, titulo, sub, keys: [key] });
    }
    for (const f of camposAcceso) {
      if (f.name === 'codigo_acceso') continue; // paso especial más abajo, con validación en vivo
      const key = `acceso__${f.name}`;
      const { titulo, sub } = friendlyPregunta(f.name, f);
      p.push({ id: key, titulo, sub, keys: [key] });
    }
    if (requiresCommunityCode) {
      p.push({ id: 'codigo-comunidad', titulo: 'Tu código de comunidad', sub: 'Lo necesitas para completar esta compra.', keys: ['acceso__codigo_acceso'] });
    }
    p.push({ id: 'extras-estacionamiento', titulo: '🚗 ¿Aseguramos tu estacionamiento?', sub: addonEstac.descripcion, keys: [] });
    if (coversOn && covers.productos.length > 0) {
      p.push({ id: 'extras-covers', titulo: '🍹 ¿Compras tus covers anticipados?', sub: covers.descripcion, keys: [] });
    }
    p.push({ id: 'codigos', titulo: '🎟️ ¿Tienes un código?', sub: 'De descuento o de quien te invitó — o sáltalo no más.', keys: [] });
    p.push({ id: 'resumen', titulo: '✨ Tu experiencia', sub: 'Revisa todo antes de continuar.', keys: [] });
    return p;
  }, [camposAcceso, skipVibe, groupSize, requiresCommunityCode, coversOn, covers.productos.length, addonEstac.descripcion, covers.descripcion]);

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

  const { register, handleSubmit, trigger, setValue, watch, formState: { errors } } = useForm({
    resolver: zodResolver(schema),
    mode: 'onBlur',
    defaultValues: draft.values ?? {},
  });

  useEffect(() => {
    if (draft.accesoSlug) setAccesoSlug(draft.accesoSlug);
    if (draft.groupSize) setGroupSize(draft.groupSize);
    if (draft.qty) setQty(draft.qty);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const sub = watch((values) => {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ values, accesoSlug, groupSize, qty }));
    });
    return () => sub.unsubscribe();
  }, [watch, accesoSlug, groupSize, qty]);

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

  const handleValidateCommunityCode = async () => {
    if (!communityCodeInput.trim()) return;
    setCommunityCodeError('');
    try {
      const result = await validateCommunityCode.mutateAsync({ code: communityCodeInput });
      if (result.valid) {
        setCommunityCodeStatus('valid');
        setValue('acceso__codigo_acceso' as any, communityCodeInput, { shouldValidate: true });
      } else {
        setCommunityCodeStatus('invalid');
        setCommunityCodeError(result.message || 'Código inválido');
      }
    } catch {
      setCommunityCodeStatus('invalid');
      setCommunityCodeError('No pudimos validar el código');
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

  const chooseCheckbox = async (key: string) => {
    setValue(key as any, true, { shouldValidate: true });
    const ok = await trigger(key as any, { shouldFocus: true });
    if (!ok) return;
    setPaso((p) => Math.min(p + 1, total_pasos - 1));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const onSubmit = async (values: Record<string, any>) => {
    const attendeeData = JSON.stringify({
      acceso: acceso?.nombre, cantidad: qty, grupoTipo: accesoSlug,
      extras: { estacionamiento, covers: covers.productos.filter((p) => (coverQty[p.id] || 0) > 0).map((p) => ({ nombre: p.nombre, cantidad: coverQty[p.id] })) },
      campos: values,
    });

    if (useConfig) {
      alert('Este evento todavía no está cargado en la base de datos — no se puede procesar el pago. Contáctanos para completar tu compra.');
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
        communityCode: requiresCommunityCode ? values['acceso__codigo_acceso'] : undefined,
        attendeeData,
      });
      sessionStorage.removeItem(STORAGE_KEY);

      const publicKey = import.meta.env.VITE_MERCADOPAGO_PUBLIC_KEY as string | undefined;
      const isMock = String(result.preferenceId ?? '').startsWith('mock-preference');

      if (publicKey && result.preferenceId && !isMock) {
        // Checkout Pro embebido: se abre como modal sobre el sitio, sin redirigir la pestaña.
        await loadMercadoPagoSdk();
        const mp = new (window as any).MercadoPago(publicKey, { locale: 'es-CL' });
        mp.checkout({ preference: { id: result.preferenceId }, autoOpen: true });
        setIsProcessing(false);
      } else if (result.checkoutUrl) {
        window.location.href = result.checkoutUrl;
      }
    } catch (err: any) {
      setIsProcessing(false);
      alert(err.message || 'Error al procesar la orden');
    }
  };


  const err = (key: string) => (errors as any)[key]?.message as string | undefined;

  /* Pasos que avanzan solos con un clic (sin botón "Continuar" fijo) */
  const soloFieldKey = pasoActual.keys[0];
  const soloField = soloFieldKey ? allFields.find((x) => x.key === soloFieldKey)?.field : undefined;
  const isAutoAdvance = pasoActual.id === 'vibe' || pasoActual.id === 'quien' || pasoActual.id === 'pareja-composicion' || pasoActual.id === 'extras-estacionamiento' || soloField?.type === 'checkbox';

  return (
    <div className="min-h-dvh pt-20 pb-32 md:pb-16 flex flex-col">
      <div className="container max-w-lg flex-1">
        {/* Encabezado + progreso */}
        <div className="flex items-center justify-between mb-2 pt-4">
          <Link href="/" className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground text-sm interactive" aria-label="Volver al inicio">
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

              {/* Paso: ¿Cómo vienes? */}
              {pasoActual.id === 'vibe' && (
                <div className="grid grid-cols-2 gap-3">
                  {VIBE_OPTIONS.map((op) => (
                    <SquareImageOption
                      key={op.size}
                      image={op.image}
                      titulo={op.label}
                      fallbackEmoji={op.emoji}
                      activo={groupSize === op.size}
                      onClick={() => chooseVibe(op.size)}
                    />
                  ))}
                </div>
              )}

              {/* Paso: solo/a → ¿ella o él? */}
              {pasoActual.id === 'quien' && (
                <div className="grid grid-cols-2 gap-3">
                  {QUIEN_OPTIONS.map((op) => (
                    <SquareImageOption
                      key={op.slug}
                      image={op.image}
                      titulo={op.label}
                      sub={op.sub}
                      fallbackEmoji={op.emoji}
                      activo={accesoSlug === op.slug}
                      onClick={() => chooseQuien(op.slug)}
                    />
                  ))}
                </div>
              )}

              {/* Paso: pareja → ¿cómo es la pareja? */}
              {pasoActual.id === 'pareja-composicion' && (
                <div className="grid grid-cols-3 gap-2 md:gap-3">
                  {PAREJA_OPTIONS.map((op) => (
                    <SquareImageOption
                      key={op.tipo}
                      image={op.image}
                      titulo={op.label}
                      fallbackEmoji={op.emoji}
                      activo={duoComposicion === op.tipo}
                      onClick={() => choosePareja(op.tipo)}
                    />
                  ))}
                </div>
              )}

              {/* Paso: código de comunidad (Soltero / Dúo Dos Hombres) — validación en vivo */}
              {pasoActual.id === 'codigo-comunidad' && (
                <div className="space-y-4">
                  <div>
                    <Input
                      value={communityCodeInput}
                      onChange={(e) => { setCommunityCodeInput(e.target.value.toUpperCase()); setCommunityCodeStatus('idle'); }}
                      placeholder="Tu código de validación"
                      autoFocus
                      className="h-14 text-lg"
                    />
                    {communityCodeStatus === 'invalid' && (
                      <p className="text-sm text-destructive mt-2" role="alert">{communityCodeError}</p>
                    )}
                    {communityCodeStatus === 'valid' && (
                      <p className="text-sm text-green-600 mt-2 inline-flex items-center gap-1.5"><Check className="w-4 h-4" /> Código válido, ¡ya puedes continuar!</p>
                    )}
                    {err('acceso__codigo_acceso') && communityCodeStatus !== 'valid' && (
                      <p className="text-xs text-muted-foreground mt-2">Valida tu código para poder continuar.</p>
                    )}
                  </div>
                  {communityCodeStatus !== 'valid' && (
                    <>
                      <Button
                        type="button"
                        onClick={handleValidateCommunityCode}
                        disabled={!communityCodeInput.trim() || validateCommunityCode.isPending}
                        className="w-full h-12 interactive"
                      >
                        {validateCommunityCode.isPending ? 'Validando…' : 'Validar código'}
                      </Button>
                      <a
                        href={whatsappComunidadLink(accesoSlug === 'soltero' ? 'Soltero' : 'Dúo (Dos Hombres)')}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn-jelly w-full inline-flex items-center justify-center gap-2 px-6 py-3.5 bg-primary text-primary-foreground rounded-full text-sm font-bold uppercase tracking-wide interactive"
                      >
                        <MessageCircle className="w-4 h-4" /> Conseguir mi código por WhatsApp
                      </a>
                    </>
                  )}
                </div>
              )}

              {/* Pasos de un solo campo (datos / contacto / extra del acceso) */}
              {pasoActual.id !== 'codigo-comunidad' && pasoActual.keys.length > 0 && soloFieldKey && soloField && soloField.type !== 'checkbox' && (
                <SingleFieldInput fieldKey={soloFieldKey} field={soloField} register={register} error={err(soloFieldKey)} onEnter={continuar} />
              )}

              {/* Paso de confirmación (checkbox) como botón grande */}
              {pasoActual.keys.length > 0 && soloFieldKey && soloField?.type === 'checkbox' && (
                <div className="space-y-3">
                  <BigOption emoji="✅" titulo="Sí, confirmo" activo={!!watch(soloFieldKey)} onClick={() => chooseCheckbox(soloFieldKey)} />
                  {err(soloFieldKey) && <p className="text-sm text-destructive" role="alert">{err(soloFieldKey)}</p>}
                  <p className="text-xs text-muted-foreground">Si no cumples con la edad mínima, no puedes ingresar a este evento.</p>
                </div>
              )}

              {/* Paso: estacionamiento */}
              {pasoActual.id === 'extras-estacionamiento' && (
                <div className="space-y-3">
                  <BigOption emoji="✅" titulo={`Sí, la aseguro · +${formatCLP(addonEstac.precio)}`} activo={estacionamiento === true} onClick={() => { setEstacionamiento(true); continuar(); }} />
                  <BigOption emoji="🙅" titulo="No, gracias" activo={estacionamiento === false} onClick={() => { setEstacionamiento(false); continuar(); }} />
                </div>
              )}

              {/* Paso: covers anticipados */}
              {pasoActual.id === 'extras-covers' && (
                <div className="space-y-3">
                  {covers.productos.map((p) => {
                    const q = coverQty[p.id] || 0;
                    const set = (d: number) => setCoverQty((prev) => ({ ...prev, [p.id]: Math.max(0, Math.min(20, (prev[p.id] || 0) + d)) }));
                    return (
                      <div key={p.id} className="flex items-center justify-between glass-candy rounded-2xl p-4">
                        <span className="text-sm font-semibold">{p.nombre} <span className="text-muted-foreground font-normal">· {formatCLP(p.precio)}</span></span>
                        <div className="flex items-center gap-4">
                          <button type="button" onClick={() => set(-1)} aria-label={`Quitar ${p.nombre}`} className="w-11 h-11 rounded-full border border-primary/40 flex items-center justify-center hover:bg-primary/10 interactive"><Minus className="w-4 h-4" /></button>
                          <span className="w-6 text-center font-bold text-lg tabular-nums">{q}</span>
                          <button type="button" onClick={() => set(1)} aria-label={`Agregar ${p.nombre}`} className="w-11 h-11 rounded-full bg-primary text-primary-foreground flex items-center justify-center hover:scale-105 transition-transform interactive"><Plus className="w-4 h-4" /></button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Paso: códigos */}
              {pasoActual.id === 'codigos' && (
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="discount" className="text-sm">Código de descuento</Label>
                    <div className="flex gap-2 mt-1.5">
                      <Input id="discount" value={discountCode} onChange={(e) => setDiscountCode(e.target.value.toUpperCase())} placeholder="CANDY2026" disabled={!!discountApplied} className="h-12" />
                      <Button type="button" variant="outline" onClick={handleApplyDiscount} disabled={!!discountApplied || !discountCode} className="interactive h-12" aria-label="Aplicar código">
                        <Tag className="w-4 h-4" />
                      </Button>
                    </div>
                    {discountApplied && <p className="text-sm text-green-400 mt-1">Descuento aplicado ✓</p>}
                    {discountError && <p className="text-sm text-destructive mt-1" role="alert">{discountError}</p>}
                  </div>
                  <div>
                    <Label htmlFor="ambassador" className="text-sm">Código de embajador</Label>
                    <Input id="ambassador" value={ambassadorCode} onChange={(e) => setAmbassadorCode(e.target.value.toUpperCase())} className="mt-1.5 h-12" placeholder="Código de quien te invitó" />
                  </div>
                </div>
              )}

              {/* Paso final: resumen */}
              {pasoActual.id === 'resumen' && (
                <div className="space-y-4">
                  <div className="glass-candy rounded-2xl p-5">
                    <div className="flex justify-between text-sm mb-2">
                      <span>{EMOJIS[accesoSlug] ?? '🍬'} {qty}× {acceso?.nombre}</span>
                      <span>{formatCLP(subtotal)}</span>
                    </div>
                    {discountAmount > 0 && (
                      <div className="flex justify-between text-sm text-green-400 mb-2"><span>Descuento</span><span>-{formatCLP(discountAmount)}</span></div>
                    )}
                    {(estacionamiento || covers.productos.some((p) => (coverQty[p.id] || 0) > 0)) && (
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mt-3 mb-1.5">Extras</p>
                    )}
                    {estacionamiento && (
                      <div className="flex justify-between text-sm mb-2"><span className="text-muted-foreground">✓ {addonEstac.nombre}</span><span>+{formatCLP(addonEstac.precio)}</span></div>
                    )}
                    {covers.productos.map((p) => {
                      const q = coverQty[p.id] || 0;
                      if (q <= 0) return null;
                      return <div key={p.id} className="flex justify-between text-sm mb-2"><span className="text-muted-foreground">✓ {q}× {p.nombre}</span><span>+{formatCLP(q * p.precio)}</span></div>;
                    })}
                    <div className="flex justify-between font-heading text-2xl pt-3 border-t border-border/40">
                      <span>Total</span>
                      <span className="text-gradient-candy">{formatCLP(total)}</span>
                    </div>
                  </div>

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
          {pasoActual.id === 'resumen' ? (
            <button
              type="submit"
              form="checkout-form"
              disabled={isProcessing}
              className="btn-jelly flex-1 h-13 py-3.5 rounded-full bg-primary text-primary-foreground font-bold uppercase tracking-wide text-sm inline-flex items-center justify-center gap-2 interactive"
            >
              {isProcessing ? (<><Loader2 className="w-5 h-5 animate-spin" /> Procesando…</>) : (<>💳 Continuar al pago</>)}
            </button>
          ) : !isAutoAdvance ? (
            <button
              type="button"
              onClick={continuar}
              className="btn-jelly flex-1 h-13 py-3.5 rounded-full bg-primary text-primary-foreground font-bold uppercase tracking-wide text-sm inline-flex items-center justify-center gap-2 interactive"
            >
              Continuar <ArrowRight className="w-4 h-4" />
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
