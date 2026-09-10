import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { motion } from 'framer-motion';
import { useRoute, useSearch, Link } from 'wouter';
import { ArrowLeft, ArrowRight, Tag, Loader2, Check, ShieldCheck, Minus, Plus, MessageCircle, Lock } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { PaymentBrick } from '@/components/PaymentBrick';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CANDYLAND, EVENTO, CAMPOS_COMPRADOR, formatCLP, whatsappComunidadLink, type Acceso, type CampoForm } from '@/config/candyland';
import { isMissionActiveForEvent, missionDepositPrice, missionCutoff, missionCapPrice } from '@shared/mission300';
import { isValidRut, isValidChileanPhone, formatRutLive } from '@shared/rut';
import { isTopupProduct } from '@shared/prepaid';
import { playcoinsEarnedForPurchase } from '@shared/playcoins';
import { useSeo } from '@/hooks/useSeo';
import { getStoredUtmParams } from '@/lib/utm';
import './Checkout.walletPreview.css';

/** Mini vista previa de la Tarjeta Playroom, mostrada justo donde se pide el
 * PIN -- para que quede claro que el PIN protege ESTA tarjeta (saldo +
 * Playcoins + el QR de la entrada), no un trámite bancario suelto. El QR va
 * bloqueado: el ticket recién se genera al confirmar el pago. */
function WalletPreviewCard({ holderName, topupAmount, playcoinsEarned, eventName }: {
  holderName: string;
  topupAmount: number;
  playcoinsEarned: number;
  eventName: string;
}) {
  return (
    <div className="wprev-scene">
      <div className="wprev-brand-row">
        <div className="wprev-wordmark">
          <span className="wprev-badge"><img src="/candyland/logo-isotipo-transparent.png" alt="" /></span>
          PLAYROOM
        </div>
        <span className="wprev-tier">Nueva</span>
      </div>
      <div className="wprev-mid">
        <div className="wprev-lock">
          <Lock />
          <span>QR al pagar</span>
        </div>
        <div className="wprev-holder">
          <p className="wprev-holder-label">Titular</p>
          <p className="wprev-holder-name">{holderName || 'Tu nombre'}</p>
          <div className="wprev-stat-row">
            <div>
              <p className="wprev-stat-label">Saldo</p>
              <p className="wprev-stat-value is-money">{formatCLP(topupAmount)}</p>
            </div>
            {playcoinsEarned > 0 && (
              <div>
                <p className="wprev-stat-label">Playcoins</p>
                <p className="wprev-stat-value is-points">+{playcoinsEarned}</p>
              </div>
            )}
          </div>
        </div>
      </div>
      <div className="wprev-foot">
        <span>Así se ve tu tarjeta</span>
        {eventName && <span>{eventName}</span>}
      </div>
    </div>
  );
}

/**
 * Checkout conversacional: una sola pregunta por pantalla, estilo "asistente"
 * que avanza casi solo (clic > texto). Popup a pantalla completa en móvil.
 * Los datos se conservan en sessionStorage al retroceder o cerrar por accidente.
 */

const STORAGE_KEY = 'candyland_checkout_draft';

/* Emoji por acceso (usado en el resumen final) */
const EMOJIS: Record<string, string> = {
  duo: '🍒', duo_mujeres: '👭', soltera: '🍭', soltero: '🔑', trio: '🍬', grupo: '🌈', cumpleaneros: '🎂',
};

type GroupSize = 1 | 2 | 3 | 4;
type DuoComposicion = 'mixta' | 'dos_mujeres' | 'dos_hombres';

const VIBE_OPTIONS: { size: GroupSize; image: string; label: string; emoji: string }[] = [
  { size: 1, image: '/candyland/checkout/vibe-solo.webp', label: 'Voy Solx', emoji: '👤' },
  { size: 2, image: '/candyland/checkout/vibe-pareja.webp', label: 'Somos Dos', emoji: '💕' },
  { size: 3, image: '/candyland/checkout/vibe-triada.webp', label: 'Somos Tres', emoji: '🎭' },
  { size: 4, image: '/candyland/checkout/vibe-grupo.webp', label: 'Somos Cuatro', emoji: '🌈' },
];

const QUIEN_OPTIONS: { slug: 'soltera' | 'soltero'; image: string; label: string; sub: string; emoji: string }[] = [
  { slug: 'soltera', image: '/candyland/checkout/quien-ella.webp', label: 'Vengo como ella', sub: 'Acceso Soltera', emoji: '🍭' },
  { slug: 'soltero', image: '/candyland/checkout/quien-el.webp', label: 'Vengo como él', sub: 'Acceso Soltero — código de comunidad', emoji: '🔑' },
];

const PAREJA_OPTIONS: { tipo: DuoComposicion; image: string; label: string; sub: string; emoji: string }[] = [
  { tipo: 'mixta', image: '/candyland/checkout/pareja-mixta.webp', label: 'Mujer y Hombre', sub: 'Acceso Dúo', emoji: '💑' },
  { tipo: 'dos_mujeres', image: '/candyland/checkout/pareja-dos-mujeres.webp', label: 'Mujer y Mujer', sub: '2x1 — mismo valor que Soltera', emoji: '👭' },
  { tipo: 'dos_hombres', image: '/candyland/checkout/pareja-dos-hombres.webp', label: 'Hombre y Hombre', sub: 'Exclusivo — necesitas código de comunidad', emoji: '👬' },
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
    } else if (field.name === 'rut' || field.name.endsWith('_rut')) {
      shape[key] = field.required
        ? z.string().min(1, 'Este dato es necesario').refine(isValidRut, 'RUT inválido')
        : z.string().refine((v) => !v || isValidRut(v), 'RUT inválido').or(z.literal('')).optional();
    } else if (field.type === 'tel') {
      shape[key] = field.required
        ? z.string().min(1, 'Este dato es necesario').refine(isValidChileanPhone, 'Revisa el formato del teléfono (+56 9 XXXXXXXX)')
        : z.string().refine((v) => !v || isValidChileanPhone(v), 'Revisa el formato del teléfono').or(z.literal('')).optional();
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
    if (m[2] === 'rut') return { titulo: '¿Cuál es su RUT?', sub: field.required ? 'Escríbelo con puntos y guion, igual que el ejemplo: 12.345.678-9' : 'Opcional. Si lo pones, escríbelo igual que el ejemplo: 12.345.678-9' };
    return { titulo: '¿Su Instagram?', sub: 'Opcional, para etiquetarlos en las fotos de la fiesta.' };
  }
  switch (rawKey) {
    case 'nombre': return { titulo: '¿Cómo te llamas?', sub: 'Nombre y apellido, tal como aparece en tu carnet de identidad o el documento que vas a presentar en la entrada.' };
    case 'email': return { titulo: '¿A qué email enviamos tu entrada?', sub: 'Ahí llega tu QR y la dirección exacta.' };
    case 'whatsapp': return { titulo: '¿Cuál es tu WhatsApp?', sub: 'Por si necesitamos contactarte antes de la fiesta.' };
    case 'rut': return { titulo: 'Tu RUT, para el carnet', sub: 'Escríbelo con puntos y guion, igual que el ejemplo: 12.345.678-9. Tus datos son 100% privados.' };
    case 'instagram': return { titulo: '¿Nos compartes tu Instagram?', sub: 'Es el único dato opcional — puedes saltarlo.' };
    case 'mayorEdad': return { titulo: 'Una última confirmación', sub: `${EVENTO.nombre} es un evento estrictamente +18.` };
    case 'codigo_acceso': return { titulo: 'Tu código de comunidad', sub: field.help };
    case 'fecha_nacimiento': return { titulo: '¿Cuándo es tu cumpleaños?', sub: 'Lo validamos con tu carnet en la puerta.' };
    default: return { titulo: field.label.replace(' (opcional)', ''), sub: field.help };
  }
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
        activo ? 'border-primary shadow-[0_0_20px_oklch(0.70_0.19_340_/_0.3)]' : 'border-border/50 hover:border-primary/40'
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
  fieldKey, field, register, setValue, error, onEnter,
}: { fieldKey: string; field: CampoForm; register: any; setValue: any; error?: string; onEnter: () => void }) {
  // Mismo criterio que buildSchema() más arriba para saber si es un campo de
  // RUT (comprador o acompañante) -- puntos y guion se ponen solos mientras
  // se escribe, pedido explícito del dueño (antes había que tipear el guion
  // a mano). Ver formatRutLive en shared/rut.ts.
  const isRut = field.name === 'rut' || field.name.endsWith('_rut');
  return (
    <div>
      <Input
        id={fieldKey}
        type={field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : field.type === 'tel' ? 'tel' : field.type === 'email' ? 'email' : 'text'}
        inputMode={field.type === 'tel' ? 'tel' : field.type === 'email' ? 'email' : field.type === 'number' ? 'numeric' : undefined}
        autoComplete={autoCompleteFor(fieldKey)}
        autoFocus
        {...(isRut
          ? register(fieldKey, { onChange: (e: React.ChangeEvent<HTMLInputElement>) => setValue(fieldKey, formatRutLive(e.target.value), { shouldValidate: false }) })
          : register(fieldKey))}
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
  useSeo({
    title: 'Completa tu compra — Mansion Playroom',
    description: 'Checkout de entradas para eventos de Mansion Playroom.',
    path: `/checkout/${eventSlug}`,
    noindex: true,
  });
  const search = useSearch();
  const itemsParam = new URLSearchParams(search).get('items') || '';
  const initialFromUrl = itemsParam.split(',')[0]?.split(':')[0] || '';
  const initialQtyFromUrl = Math.max(1, Number(itemsParam.split(',')[0]?.split(':')[1]) || 1);
  const skipVibe = SPECIAL_SKIP_VIBE.includes(initialFromUrl);

  const { data: event } = trpc.events.getBySlug.useQuery({ slug: eventSlug }, { retry: false });
  const { data: liveTicketsData } = trpc.events.getTicketTypes.useQuery({ slug: eventSlug }, { retry: false });
  const { data: siteSettings } = trpc.settings.get.useQuery();
  const serviceFeePercent = Number(siteSettings?.serviceFeePercent ?? 0);
  const liveTickets = liveTicketsData ?? [];
  const useConfig = liveTickets.length === 0; // sin DB → modo demo con config
  // Los "extras" (category='extra': estacionamiento, covers, lo que sea que
  // el admin agregue) se ofrecen solos en el paso de extras — no hace falta
  // tocar código para agregar uno nuevo a futuro.
  const accesoTickets = useMemo(() => liveTickets.filter((t: any) => t.category !== 'extra'), [liveTickets]);
  const extraTickets = useMemo(() => liveTickets.filter((t: any) => t.category === 'extra'), [liveTickets]);
  const useDbExtras = !useConfig && extraTickets.length > 0;
  // Dentro de "extra" hay dos mecánicas bien distintas (ver isTopupProduct en
  // shared/prepaid.ts): un prepago da un DERECHO CANJEABLE (estacionamiento,
  // un trago -- se paga acá, en caja solo se retira, sin volver a cobrar) vs
  // una carga de saldo que sí mete plata gastable en la Tarjeta Playroom. Se
  // muestran en dos bloques con lenguaje visual distinto para que no se
  // confundan (pedido explícito del dueño).
  const prepagoTickets = useMemo(() => extraTickets.filter((t: any) => !isTopupProduct(t)), [extraTickets]);
  // Ordenados por precio: son "montos" de un mismo gesto ("cargar saldo"),
  // no productos distintos -- se muestran como un único selector de monto en
  // vez de una fila por cada ficha de la Carta.
  const topupTiers = useMemo(
    () => [...extraTickets]
      .filter((t: any) => isTopupProduct(t) && t.totalStock - (t.soldCount ?? 0) > 0)
      .sort((a: any, b: any) => Number(a.price) - Number(b.price)),
    [extraTickets],
  );
  // Agrupa el prepago por `groupName` (mismo campo ya usado en /caja para
  // pestañas de categoría, con "Extras" de respaldo para lo que no tenga
  // grupo asignado) -- así un evento nuevo sin grupos cargados sigue
  // mostrando todo, solo que en un único bloque sin subtítulos.
  const prepagoGroups = useMemo(() => {
    const order: string[] = [];
    const byLabel = new Map<string, any[]>();
    for (const t of prepagoTickets) {
      // Respeta groupName si el admin ya lo cargó -- si no, se auto-clasifica
      // con lo que YA existe en la ficha (nombre + stock), para que la
      // categorización se vea desde el primer minuto sin depender de que
      // alguien cargue un campo nuevo a mano en cada producto.
      const label = t.groupName || (
        /estacionamiento/i.test(t.name) ? 'Estacionamiento'
        : t.totalStock <= 10 ? 'Exclusivos · solo preventa'
        : 'Tragos de preventa'
      );
      if (!byLabel.has(label)) { byLabel.set(label, []); order.push(label); }
      byLabel.get(label)!.push(t);
    }
    return order.map((label) => ({ label, items: byLabel.get(label)! }));
  }, [prepagoTickets]);

  const validateCode = trpc.orders.validateCode.useMutation();
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

  // Busca la entrada real (DB) para un slug fijo (soltera/soltero/duo/trio/
  // grupo/cumpleaneros): primero por accesoSlug (lo que setea el admin en el
  // formulario de la entrada), y si no está seteado en tickets viejos, cae a
  // comparar por nombre — pero nunca deja pasar un id inventado tipo
  // Number("soltera") que rompía la orden en silencio.
  const findLiveTicket = (slug: string) => {
    const cfg = CANDYLAND.accesos.find((a) => a.id === slug);
    return accesoTickets.find((t: any) => t.accesoSlug === slug || (cfg && t.name.toLowerCase() === cfg.nombre.toLowerCase()));
  };

  const accesoId = useMemo(() => {
    if (!accesoSlug) return '';
    if (useConfig) return accesoSlug;
    const match = findLiveTicket(accesoSlug);
    return match ? String(match.id) : '';
  }, [accesoSlug, useConfig, liveTickets]);

  // Misión 300: mientras falten más de 3 días para el evento, los accesos
  // principales se cobran al precio del abono ($10.000/persona) en vez del
  // valor general — igual que hace createOrder en el servidor. Se calcula acá
  // también para que el checkout MUESTRE el precio real que se va a cobrar,
  // en vez del valor general que confundiría a la hora de pagar.
  const missionOpen = !useConfig && !!event?.eventDate && isMissionActiveForEvent(event);

  const acceso: Acceso | undefined = useMemo(() => {
    if (!accesoId) return undefined;
    if (useConfig) return CANDYLAND.accesos.find((a) => a.id === accesoId);
    const tt = accesoTickets.find((t: any) => String(t.id) === accesoId);
    if (!tt) return undefined;
    const cfg = CANDYLAND.accesos.find((a) => a.id === (tt as any).accesoSlug) ?? CANDYLAND.accesos.find((a) => a.nombre.toLowerCase() === (tt as any).name.toLowerCase());
    const generalPrice = Number((tt as any).price);
    const precio = missionOpen ? missionDepositPrice((tt as any).accesoSlug) : generalPrice;
    return {
      id: accesoId,
      nombre: (tt as any).name,
      precio,
      personas: cfg?.personas ?? 1,
      descripcion: cfg?.descripcion ?? '',
      beneficios: cfg?.beneficios ?? [],
      estado: 'available',
      exclusivoComunidad: cfg?.exclusivoComunidad ?? false,
      campos: cfg?.campos,
    };
  }, [accesoId, useConfig, liveTickets, missionOpen]);

  const missionGeneralPrice = useMemo(() => {
    if (!missionOpen || !accesoId || useConfig) return null;
    const tt = accesoTickets.find((t: any) => String(t.id) === accesoId);
    return tt ? Number((tt as any).price) : null;
  }, [missionOpen, accesoId, useConfig, liveTickets]);

  const missionCutoffDate = useMemo(() => (event?.eventDate ? missionCutoff(new Date(event.eventDate)) : null), [event?.eventDate]);

  // Si ya hay entradas reales cargadas para el evento pero ninguna está
  // conectada a este slug (el admin no le asignó el "tipo de acceso" a esa
  // entrada), avisa en vez de dejar avanzar un wizard que después no puede
  // completar la compra.
  const avisarSiNoHayEntrada = (slug: string) => {
    if (useConfig) return true;
    if (findLiveTicket(slug)) return true;
    alert('Este tipo de acceso todavía no está configurado para este evento. Contáctanos para completar tu compra.');
    return false;
  };

  const chooseVibe = (size: GroupSize) => {
    // Solo/a → resuelve en el paso "quien". Pareja → resuelve en "pareja-composicion".
    if (size === 3 || size === 4) {
      const slug = GROUP_TO_ACCESO[size];
      if (!avisarSiNoHayEntrada(slug)) return;
      setAccesoSlug(slug);
    }
    setGroupSize(size);
    continuar();
  };
  const chooseQuien = (slug: 'soltera' | 'soltero') => {
    if (!avisarSiNoHayEntrada(slug)) return;
    setAccesoSlug(slug);
    continuar();
  };
  const choosePareja = (tipo: DuoComposicion) => {
    // Mujer y Mujer es su propio acceso ("duo_mujeres" -- 2x1, mismo valor
    // que Soltera pero cuenta 2 personas hacia Misión 300, ver
    // shared/mission300.ts). Las otras dos composiciones siguen siendo "duo".
    const slug = tipo === 'dos_mujeres' ? 'duo_mujeres' : 'duo';
    if (!avisarSiNoHayEntrada(slug)) return;
    setDuoComposicion(tipo);
    setAccesoSlug(slug);
    continuar();
  };

  /* Dúo Dos Hombres necesita el mismo código de comunidad que Soltero. */
  const requiresCommunityCode = accesoSlug === 'soltero' || (accesoSlug === 'duo' && duoComposicion === 'dos_hombres');

  /* ── Extras / códigos ────────────────────────────────────── */
  const [dbExtraQty, setDbExtraQty] = useState<Record<number, number>>({});
  // Selector de monto de la carga de saldo: las 5 fichas de la Carta son
  // "montos" de un mismo gesto, no productos que se puedan combinar -- acá
  // se fuerza que a lo más UNA tenga cantidad > 0 a la vez (index -1 = nada
  // seleccionado, empieza así a propósito: es 100% opcional).
  const selectedTopupIndex = topupTiers.findIndex((t: any) => (dbExtraQty[t.id] || 0) > 0);
  const setTopupTierIndex = (idx: number) => {
    setDbExtraQty((prev) => {
      const next = { ...prev };
      for (const t of topupTiers) next[t.id] = 0;
      if (idx >= 0 && idx < topupTiers.length) next[topupTiers[idx].id] = 1;
      return next;
    });
  };
  // Un solo campo para código de descuento o de embajador -- la persona no
  // sabe (ni le importa) cuál de los dos tiene; el servidor decide
  // (`orders.validateCode`) y acá solo se guarda el resultado ya tipado.
  const [code, setCode] = useState('');
  const [codeResult, setCodeResult] = useState<
    | { type: 'discount'; discount: any }
    | { type: 'ambassador'; name: string; code: string }
    | null
  >(null);
  const [codeError, setCodeError] = useState('');
  const [communityCodeInput, setCommunityCodeInput] = useState('');
  const [communityCodeStatus, setCommunityCodeStatus] = useState<'idle' | 'valid' | 'invalid'>('idle');
  const [communityCodeError, setCommunityCodeError] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  // Formulario de tarjeta integrado (Payment Brick de Mercado Pago): la orden
  // se crea al llegar acá, y el pago se cobra directo con el token de
  // tarjeta — sin modal ni redirect a Mercado Pago.
  const [ordenPago, setOrdenPago] = useState<{ orderNumber: string; total: number } | null>(null);
  const [pagoResultado, setPagoResultado] = useState<'approved' | 'rejected' | 'pending' | null>(null);
  const [pagoErrorMsg, setPagoErrorMsg] = useState('');
  // Pantalla de "revisa tu compra" entre crear la orden y montar el Payment
  // Brick — antes se saltaba directo del resumen a la pasarela sin mostrar
  // de nuevo el detalle (tipo de entrada, extras, descuento, total).
  const [showResumenFinal, setShowResumenFinal] = useState(false);
  const [resumenCountdown, setResumenCountdown] = useState(5);
  // PIN de la tarjeta de membresía (pedido explícito del dueño): se define
  // acá, al comprar una carga de saldo -- pagar de verdad con Mercado Pago
  // ES la prueba de identidad, nunca antes. Solo se pide si el carrito tiene
  // alguna línea "Cargar saldo" (ver hasTopupInCart más abajo).
  const [cardPin, setCardPin] = useState('');
  const [cardPinConfirm, setCardPinConfirm] = useState('');
  const [cardPinError, setCardPinError] = useState('');
  const setCardPinMutation = trpc.prepaid.setCardPinAfterTopup.useMutation();
  // Se calcula acá (no más abajo, junto al resto de los totales) porque el
  // auto-avance de la pantalla "Revisa tu compra" lo necesita: con una carga
  // de saldo en el carrito, NO puede avanzar solo a los 5 segundos -- tiene
  // que esperar a que la persona defina su PIN.
  const topupCharge = extraTickets.reduce((s: number, t: any) => (isTopupProduct(t) ? s + (dbExtraQty[t.id] || 0) * Number(t.price) : s), 0);
  const hasTopupInCart = useDbExtras && topupCharge > 0;
  useEffect(() => {
    if (!showResumenFinal || hasTopupInCart) return;
    setResumenCountdown(5);
    const interval = window.setInterval(() => setResumenCountdown((c) => Math.max(0, c - 1)), 1000);
    const advance = window.setTimeout(() => setShowResumenFinal(false), 5000);
    return () => { window.clearInterval(interval); window.clearTimeout(advance); };
  }, [showResumenFinal, hasTopupInCart]);

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
      p.push({ id: 'vibe', titulo: `✨ ¿Cómo vienes a vivir ${EVENTO.nombre}?`, sub: 'Selecciona la opción que mejor los representa.', keys: [] });
      if (groupSize === 1) {
        p.push({ id: 'quien', titulo: 'Perfecto.', sub: 'Cuéntanos cómo vienes.', keys: [] });
      }
      if (groupSize === 2) {
        p.push({ id: 'pareja-composicion', titulo: 'Elige tu tipo de acceso', sub: 'Cuéntanos quiénes vienen.', keys: [] });
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
    if (useDbExtras) {
      p.push({ id: 'extras-db', titulo: '✨ ¿Agregamos algo más?', sub: 'Estacionamiento, covers y otros extras — todo opcional.', keys: [] });
    }
    p.push({ id: 'codigos', titulo: '🎟️ ¿Tienes un código?', sub: 'De descuento o de quien te invitó — o sáltalo no más.', keys: [] });
    p.push({ id: 'resumen', titulo: '✨ Tu experiencia', sub: 'Revisa todo antes de continuar.', keys: [] });
    return p;
  }, [camposAcceso, skipVibe, groupSize, requiresCommunityCode, useDbExtras]);

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
  const discountAmount = codeResult?.type === 'discount'
    ? codeResult.discount.discountType === 'percentage'
      ? Math.round(subtotal * Number(codeResult.discount.discountValue) / 100)
      : Number(codeResult.discount.discountValue)
    : 0;
  const dbExtrasTotal = extraTickets.reduce((s: number, t: any) => s + (dbExtraQty[t.id] || 0) * Number(t.price), 0);
  // Carga de saldo (ticketTypes.topupAmount, pedido explícito del dueño): NO
  // paga el recargo por servicio -- el monto cargado entra completo. Mismo
  // cálculo, mismo orden de operaciones, que server/db.ts createOrder: si
  // los dos no quedan sincronizados, el total que se muestra acá no coincide
  // con lo que cobra el servidor. `topupCharge`/`hasTopupInCart` se calculan
  // más arriba, junto al efecto de auto-avance que los necesita.
  const preServiceFeeTotal = Math.max(0, subtotal - discountAmount) + (useDbExtras ? dbExtrasTotal : 0);
  const feeBase = Math.max(0, preServiceFeeTotal - (useDbExtras ? topupCharge : 0));
  const serviceFee = serviceFeePercent > 0 ? Math.round(feeBase * serviceFeePercent / 100) : 0;
  const total = preServiceFeeTotal + serviceFee;

  /** Un solo botón "Aplicar" para el único campo de código: el servidor
   * (`orders.validateCode`) prueba primero si es un código de embajador y
   * después si es un código de descuento, y acá solo se pinta lo que
   * corresponda según lo que haya contestado. A propósito NO bloquea la
   * compra: un código mal escrito no puede impedir una venta, solo se avisa
   * para que la persona lo corrija. */
  const handleApplyCode = async () => {
    if (!code.trim() || !event?.id) return;
    setCodeError('');
    try {
      const result = await validateCode.mutateAsync({ code: code.trim(), eventId: event.id });
      if (result.type === 'discount') {
        setCodeResult({ type: 'discount', discount: result.discount });
      } else if (result.type === 'ambassador') {
        setCodeResult({ type: 'ambassador', name: result.name, code: result.code });
      } else {
        setCodeResult(null);
        setCodeError(result.message || 'No encontramos ese código');
      }
    } catch {
      setCodeError('No pudimos validar el código');
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
    const extrasElegidos = useDbExtras
      ? extraTickets.filter((t: any) => (dbExtraQty[t.id] || 0) > 0).map((t: any) => ({ nombre: t.name, cantidad: dbExtraQty[t.id] }))
      : [];
    const attendeeData = JSON.stringify({
      acceso: acceso?.nombre, cantidad: qty, grupoTipo: accesoSlug,
      extras: extrasElegidos,
      campos: values,
    });

    if (useConfig) {
      alert('Este evento todavía no está cargado en la base de datos — no se puede procesar el pago. Contáctanos para completar tu compra.');
      return;
    }

    const extraItems = useDbExtras
      ? extraTickets.filter((t: any) => (dbExtraQty[t.id] || 0) > 0).map((t: any) => ({ ticketTypeId: t.id, quantity: dbExtraQty[t.id] }))
      : [];

    setIsProcessing(true);
    try {
      const result = await createOrder.mutateAsync({
        eventSlug,
        buyerName: values['buyer__nombre'],
        buyerEmail: values['buyer__email'],
        buyerPhone: values['buyer__whatsapp'],
        items: [{ ticketTypeId: Number(accesoId), quantity: qty }, ...extraItems],
        // Se manda el mismo código en los dos campos: el servidor ya prueba
        // cada uno contra su propia tabla e ignora en silencio el que no
        // matchea (createOrder para descuento, referredByCode/atribución
        // para embajador) -- así funciona aunque la persona nunca haya
        // apretado "Aplicar".
        discountCode: code.trim() || undefined,
        ambassadorCode: code.trim() || undefined,
        communityCode: requiresCommunityCode ? values['acceso__codigo_acceso'] : undefined,
        attendeeData,
        // Atribución UTM (ver client/src/lib/utm.ts) -- vacío si nunca entró
        // por un link etiquetado, y el server lo trata como "sin UTM".
        ...getStoredUtmParams(),
      });
      sessionStorage.removeItem(STORAGE_KEY);
      setIsProcessing(false);
      setOrdenPago({ orderNumber: result.orderNumber, total: result.total });
      if (result.isFree) {
        // Descuento del 100%: el servidor ya aprobó la orden y mandó el
        // email de bienvenida con el QR — no hay nada que cobrar, así que
        // saltamos directo a la pantalla de éxito sin montar el Payment Brick.
        setPagoResultado('approved');
      } else {
        // Antes de la pasarela: pantalla de "revisa tu compra" con el
        // detalle completo (avanza sola en unos segundos o con el botón).
        setShowResumenFinal(true);
      }
      // Si no es gratis, el formulario de tarjeta (Payment Brick) se monta
      // en el próximo render, con este orderNumber/total ya guardados.
    } catch (err: any) {
      setIsProcessing(false);
      alert(err.message || 'Error al procesar la orden');
    }
  };


  const err = (key: string) => (errors as any)[key]?.message as string | undefined;

  /* Pasos que avanzan solos con un clic (sin botón "Continuar" fijo) */
  const soloFieldKey = pasoActual.keys[0];
  const soloField = soloFieldKey ? allFields.find((x) => x.key === soloFieldKey)?.field : undefined;
  const isAutoAdvance = pasoActual.id === 'vibe' || pasoActual.id === 'quien' || pasoActual.id === 'pareja-composicion' || soloField?.type === 'checkbox';

  if (ordenPago && pagoResultado === 'approved') {
    return (
      <div className="min-h-dvh pt-24 pb-16 flex items-center justify-center">
        <div className="container max-w-md text-center">
          <div className="w-16 h-16 rounded-full glass-candy flex items-center justify-center mx-auto mb-5 text-3xl">🍭</div>
          <h1 className="font-heading font-extrabold text-2xl md:text-3xl tracking-tight mb-2">¡Bienvenidx a {EVENTO.nombre}!</h1>
          <p className="text-muted-foreground text-sm mb-3">Tu pago se confirmó y tu acceso ya fue enviado a tu correo. Revisa tu bandeja de entrada.</p>
          <p className="text-muted-foreground text-sm mb-8">
            Si no lo encuentras, revisa tu carpeta de <span className="font-semibold text-foreground">spam o correo no deseado</span> — dependiendo del filtro de tu correo, puede haberse ido para allá.
          </p>
          <Link href="/" className="btn-jelly inline-flex h-13 items-center justify-center px-8 rounded-full bg-primary text-primary-foreground font-bold uppercase tracking-wide text-sm interactive">
            Volver al inicio
          </Link>
        </div>
      </div>
    );
  }

  if (ordenPago && pagoResultado === 'pending') {
    return (
      <div className="min-h-dvh pt-24 pb-16 flex items-center justify-center">
        <div className="container max-w-md text-center">
          <div className="w-16 h-16 rounded-full glass-candy flex items-center justify-center mx-auto mb-5 text-3xl">⏳</div>
          <h1 className="font-heading font-extrabold text-2xl md:text-3xl tracking-tight mb-2">Tu pago está en revisión</h1>
          <p className="text-muted-foreground text-sm mb-8">Algunos medios de pago tardan unos minutos en confirmarse. Te avisamos por email apenas se apruebe.</p>
          <Link href="/" className="inline-flex h-13 items-center justify-center px-8 rounded-full border border-border text-sm font-semibold hover:border-primary/50 interactive">
            Volver al inicio
          </Link>
        </div>
      </div>
    );
  }

  if (ordenPago && showResumenFinal) {
    return (
      <div className="min-h-dvh pt-20 pb-16">
        <div className="container max-w-lg">
          <div className="flex items-center justify-between mb-4 pt-4">
            <span className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Revisa tu compra</span>
          </div>
          <h1 className="font-heading font-extrabold text-2xl tracking-tight mb-1">Esto es lo que vas a pagar</h1>
          <p className="text-muted-foreground text-sm mb-5">Confirma el detalle antes de ir a la pasarela de pago segura.</p>
          <div className="glass-candy rounded-2xl p-5 mb-5">
            <div className="flex justify-between text-sm mb-2">
              <span>{EMOJIS[accesoSlug] ?? '🍬'} {qty}× {acceso?.nombre}</span>
              <span>{formatCLP(subtotal)}</span>
            </div>
            {discountAmount > 0 && (
              <div className="flex justify-between text-sm text-green-400 mb-2"><span>Descuento</span><span>-{formatCLP(discountAmount)}</span></div>
            )}
            {useDbExtras && (
              <>
                {extraTickets.some((t: any) => (dbExtraQty[t.id] || 0) > 0) && (
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mt-3 mb-1.5">Extras</p>
                )}
                {extraTickets.map((t: any) => {
                  const q = dbExtraQty[t.id] || 0;
                  if (q <= 0) return null;
                  return (
                    <div key={t.id} className="mb-2">
                      <div className="flex justify-between text-sm"><span className="text-muted-foreground">✓ {q}× {t.name}</span><span>+{formatCLP(q * Number(t.price))}</span></div>
                      {isTopupProduct(t) && (
                        <p className="text-xs text-muted-foreground/70 mt-0.5">Se guarda en tu Tarjeta Playroom para gastar en caja -- no es un producto que retiras.</p>
                      )}
                    </div>
                  );
                })}
              </>
            )}
            {serviceFee > 0 && (
              <div className="flex justify-between text-sm text-muted-foreground mb-2"><span>Cargo por servicio</span><span>+{formatCLP(serviceFee)}</span></div>
            )}
            <div className="flex justify-between font-heading text-2xl pt-3 border-t border-border/40">
              <span>Total</span>
              <span className="text-gradient-candy">{formatCLP(ordenPago.total)}</span>
            </div>
          </div>
          {hasTopupInCart && (
            <div className="glass-candy rounded-2xl p-5 mb-5">
              <WalletPreviewCard
                holderName={watch('buyer__nombre') || ''}
                topupAmount={topupCharge}
                playcoinsEarned={playcoinsEarnedForPurchase(ordenPago.total - topupCharge)}
                eventName={EVENTO.nombre}
              />
              <p className="text-sm font-semibold mb-1">💳 Define el PIN de tu tarjeta</p>
              <p className="text-xs text-muted-foreground mb-4">
                4 dígitos para poder gastar tu saldo en caja. Pagar de verdad acá es lo que confirma que eres tú -- después de esto, para cambiarlo vas a necesitar el PIN actual.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="cardPin">PIN (4 dígitos)</Label>
                  <Input
                    id="cardPin" type="tel" inputMode="numeric" maxLength={4} autoComplete="off"
                    value={cardPin}
                    onChange={(e) => { setCardPin(e.target.value.replace(/\D/g, '').slice(0, 4)); setCardPinError(''); }}
                    className="mt-1 tracking-[0.3em] text-center"
                  />
                </div>
                <div>
                  <Label htmlFor="cardPinConfirm">Confirma el PIN</Label>
                  <Input
                    id="cardPinConfirm" type="tel" inputMode="numeric" maxLength={4} autoComplete="off"
                    value={cardPinConfirm}
                    onChange={(e) => { setCardPinConfirm(e.target.value.replace(/\D/g, '').slice(0, 4)); setCardPinError(''); }}
                    className="mt-1 tracking-[0.3em] text-center"
                  />
                </div>
              </div>
              {cardPinError && <p className="text-xs text-destructive mt-2">{cardPinError}</p>}
            </div>
          )}
          <button
            type="button"
            onClick={() => {
              if (hasTopupInCart) {
                if (!/^\d{4}$/.test(cardPin)) { setCardPinError('El PIN tiene que tener 4 dígitos'); return; }
                if (cardPin !== cardPinConfirm) { setCardPinError('Los dos PIN no coinciden'); return; }
              }
              setShowResumenFinal(false);
            }}
            className="btn-jelly w-full h-13 rounded-full bg-primary text-primary-foreground font-bold uppercase tracking-wide text-sm inline-flex items-center justify-center gap-2 interactive"
          >
            Continuar a pago seguro {!hasTopupInCart && resumenCountdown > 0 && `(${resumenCountdown})`}
          </button>
        </div>
      </div>
    );
  }

  if (ordenPago) {
    return (
      <div className="min-h-dvh pt-20 pb-16">
        <div className="container max-w-lg">
          <div className="flex items-center justify-between mb-4 pt-4">
            <span className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Pago seguro</span>
            <span className="font-heading text-xl text-gradient-candy">{formatCLP(ordenPago.total)}</span>
          </div>
          <h1 className="font-heading font-extrabold text-2xl tracking-tight mb-1">Completa el pago</h1>
          <p className="text-muted-foreground text-sm mb-5">Ingresa los datos de tu tarjeta — el pago se procesa acá mismo, sin salir de la página.</p>
          {pagoErrorMsg && (
            <div className="mb-4 p-3.5 rounded-xl bg-destructive/10 border border-destructive/30 text-sm text-destructive" role="alert">
              {pagoErrorMsg}
            </div>
          )}
          {ordenPago && !showResumenFinal && (
            <PaymentBrick
              orderNumber={ordenPago.orderNumber}
              amount={ordenPago.total}
              onResult={(status) => {
                setPagoResultado(status === 'in_process' ? 'pending' : status as any);
                // El PIN se define justo acá, apenas se confirma el pago:
                // pagar de verdad con Mercado Pago ES la prueba de identidad
                // (decisión explícita del dueño). Fire-and-forget: la compra
                // ya está aprobada, un fallo acá no puede revertir esa UX de
                // éxito -- si el pago queda 'pending' en vez de 'approved'
                // (raro con tarjeta), el PIN tecleado se pierde y se define
                // después (límite conocido y aceptado de esta etapa).
                if (status === 'approved' && hasTopupInCart && ordenPago) {
                  setCardPinMutation.mutate(
                    { orderNumber: ordenPago.orderNumber, pin: cardPin },
                    { onError: (err) => console.error('No se pudo definir el PIN de la tarjeta:', err) },
                  );
                }
              }}
              onError={setPagoErrorMsg}
            />
          )}
          <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground mt-5">
            <ShieldCheck className="w-3.5 h-3.5" /> Pago procesado de forma segura por Mercado Pago
          </p>
        </div>
      </div>
    );
  }

  /* pb-40 fijo en todos los tamaños (antes se achicaba a md:pb-16): la barra
   * de acciones de abajo es `fixed bottom-0` en cualquier ancho, así que el
   * espacio reservado para que no la tape tiene que ser el mismo siempre --
   * reducirlo en tablet/desktop dejaba contenido tapado detrás de la barra
   * (reportado con el paso de extras, que es más alto que el resto). */
  return (
    <div className="min-h-dvh pt-20 pb-40 flex flex-col">
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

        <form onSubmit={handleSubmit(onSubmit)} id="checkout-form" className="relative">
          {/* Antes esto usaba AnimatePresence con mode="popLayout" para animar
           * también la salida del paso anterior — pero eso es un bug
           * reproducible de Framer Motion en páginas/pasos sin `layout`: a
           * veces quedan DOS instancias del paso nuevo montadas a la vez
           * (una visible, otra congelada invisible ocupando espacio real),
           * lo que se veía como el cuestionario duplicado al hacer scroll.
           * Sin AnimatePresence, React desmonta el paso viejo al instante y
           * solo el nuevo anima su entrada — se pierde el slide de salida
           * pero es imposible que queden dos pasos mostrándose a la vez. */}
          <motion.div
            key={pasoActual.id}
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
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
                      sub={op.sub}
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
                      onChange={(e) => { setCommunityCodeInput(e.target.value.replace(/^\s+/, '').toUpperCase()); setCommunityCodeStatus('idle'); }}
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
                <SingleFieldInput fieldKey={soloFieldKey} field={soloField} register={register} setValue={setValue} error={err(soloFieldKey)} onEnter={continuar} />
              )}

              {/* Paso de confirmación (checkbox): antes era una card sutil
               * (mismo estilo que las opciones de elección) y en pruebas con
               * gente real nadie la identificaba como un botón que había que
               * tocar — ahora usa el mismo estilo sólido que el CTA principal
               * ("Continuar al pago") para que se lea como una acción, no
               * como una tarjeta informativa. */}
              {pasoActual.keys.length > 0 && soloFieldKey && soloField?.type === 'checkbox' && (
                <div className="space-y-3">
                  <button
                    type="button"
                    onClick={() => chooseCheckbox(soloFieldKey)}
                    aria-pressed={!!watch(soloFieldKey)}
                    className="btn-jelly w-full h-14 rounded-full bg-primary text-primary-foreground font-bold uppercase tracking-wide text-sm inline-flex items-center justify-center gap-2 interactive"
                  >
                    ✅ Sí, confirmo
                  </button>
                  {err(soloFieldKey) && <p className="text-sm text-destructive" role="alert">{err(soloFieldKey)}</p>}
                  <p className="text-xs text-center text-muted-foreground">Toca el botón para continuar · si no cumples con la edad mínima, no puedes ingresar a este evento.</p>
                </div>
              )}

              {/* Paso: extras reales del evento (category="extra" en el admin).
                  Dos bloques con lenguaje visual distinto a propósito -- ver
                  el comentario de prepagoTickets/topupTiers más arriba. */}
              {pasoActual.id === 'extras-db' && (
                <div className="space-y-6">
                  {prepagoGroups.length > 0 && (
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wide bg-muted text-foreground px-2 py-0.5 rounded-full inline-block mb-1.5">🎟️ Prepago para la fiesta</span>
                      <p className="text-xs text-muted-foreground mb-3 leading-relaxed">
                        Los compras ahora más barato que en la puerta -- quedan en tu Tarjeta Playroom y tu código QR, en caja solo los retiras sin pagar de nuevo.
                      </p>
                      <div className="space-y-4">
                        {prepagoGroups.map((group) => (
                          <div key={group.label}>
                            {/* Rótulo de categoría solo si de verdad hay más de un grupo
                                (el admin cargó groupName por producto) -- con todo cayendo
                                al mismo grupo de respaldo ("Extras"), mostrar ese único
                                rótulo es ruido, no información. */}
                            {prepagoGroups.length > 1 && (
                              <p className="text-[11px] font-bold uppercase tracking-wide text-primary mb-1.5">{group.label}</p>
                            )}
                            <div className="glass-candy rounded-2xl overflow-hidden divide-y divide-border/40">
                              {group.items.map((t: any) => {
                                const q = dbExtraQty[t.id] || 0;
                                const remaining = t.totalStock - (t.soldCount ?? 0);
                                const max = Math.min(t.maxPerOrder ?? 10, remaining);
                                const set = (d: number) => setDbExtraQty((prev) => ({ ...prev, [t.id]: Math.max(0, Math.min(max, (prev[t.id] || 0) + d)) }));
                                const hasDiscount = t.originalPrice && Number(t.originalPrice) > Number(t.price);
                                const savePct = hasDiscount ? Math.round((1 - Number(t.price) / Number(t.originalPrice)) * 100) : 0;
                                return (
                                  <div key={t.id} className={`flex items-center gap-2.5 px-3.5 py-2.5 ${q > 0 ? 'bg-primary/5' : ''}`}>
                                    <span className="text-base w-5 text-center shrink-0" aria-hidden>{t.emoji || '🎫'}</span>
                                    <div className="flex-1 min-w-0">
                                      <p className="text-sm font-semibold leading-tight">{t.name}</p>
                                      {/* Aviso de escasez SOLO para cupos de verdad limitados (ej. una
                                          mesa VIP de 6) -- pedido explícito del dueño: nada de
                                          tragos, aunque su stock configurado también sea chico. */}
                                      {t.totalStock <= 10 && (
                                        <p className="text-[10.5px] font-semibold text-amber-600 mt-0.5">Quedan {Math.max(0, remaining)} cupos</p>
                                      )}
                                    </div>
                                    <div className="flex items-baseline gap-1.5 shrink-0">
                                      <span className="text-[13px] font-bold tabular-nums">{formatCLP(Number(t.price))}</span>
                                      {hasDiscount && (
                                        <>
                                          <span className="text-[11px] text-muted-foreground line-through tabular-nums">{formatCLP(Number(t.originalPrice))}</span>
                                          <span className="text-[10px] font-bold text-green-600 bg-green-500/10 px-1.5 py-0.5 rounded-full whitespace-nowrap">AHORRAS {savePct}%</span>
                                        </>
                                      )}
                                    </div>
                                    {q > 0 ? (
                                      <div className="flex items-center gap-2 shrink-0 ml-1">
                                        <button type="button" onClick={() => set(-1)} aria-label={`Quitar ${t.name}`} className="w-7 h-7 rounded-full border border-border flex items-center justify-center interactive"><Minus className="w-3.5 h-3.5" /></button>
                                        <span className="w-4 text-center font-bold text-sm tabular-nums">{q}</span>
                                        <button type="button" onClick={() => set(1)} disabled={q >= max} aria-label={`Agregar ${t.name}`} className="w-7 h-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center interactive disabled:opacity-40"><Plus className="w-3.5 h-3.5" /></button>
                                      </div>
                                    ) : (
                                      <button type="button" onClick={() => set(1)} disabled={max <= 0} aria-label={`Agregar ${t.name}`} className="w-7 h-7 rounded-full border border-primary text-primary flex items-center justify-center interactive shrink-0 ml-1 disabled:opacity-30"><Plus className="w-3.5 h-3.5" /></button>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {topupTiers.length > 0 && (
                    <div className="xtra-topup-section">
                      <span className="text-[10px] font-bold uppercase tracking-wide text-white px-2 py-0.5 rounded-full inline-block" style={{ background: 'linear-gradient(100deg, #ff3f8e, #8c7bff)' }}>💳 Carga saldo en tu Tarjeta Playroom</span>
                      <p className="xtra-topup-intro">Esto sí es plata de verdad en tu tarjeta -- con eso compras lo que quieras en caja, al precio de fiesta.</p>
                      <div className="xtra-topup-row">
                        <div className="main">
                          <div className="icon" aria-hidden>💳</div>
                          <div className="flex-1 min-w-0">
                            <p className="name">Carga de saldo</p>
                            <p className="sub">
                              {selectedTopupIndex < 0 ? 'Opcional -- tú eliges cuánto' : `Vas a pagar ${formatCLP(Number(topupTiers[selectedTopupIndex].price))}`}
                            </p>
                          </div>
                          {selectedTopupIndex < 0 ? (
                            <button type="button" onClick={() => setTopupTierIndex(0)} aria-label="Elegir monto a cargar" className="xtra-topup-add">+</button>
                          ) : (
                            <div className="xtra-topup-stepper">
                              <button type="button" onClick={() => setTopupTierIndex(selectedTopupIndex - 1)} aria-label="Bajar monto">−</button>
                              <span className="amount tabular-nums">{formatCLP(Number(topupTiers[selectedTopupIndex].price))}</span>
                              <button type="button" onClick={() => setTopupTierIndex(selectedTopupIndex + 1)} disabled={selectedTopupIndex >= topupTiers.length - 1} className="plus" aria-label="Subir monto">+</button>
                            </div>
                          )}
                        </div>
                        {selectedTopupIndex >= 0 && (() => {
                          const tier = topupTiers[selectedTopupIndex];
                          const credit = Number(tier.topupAmount ?? tier.price);
                          const bonus = credit - Number(tier.price);
                          return (
                            <div className="xtra-credit-line">
                              <span className="chip" aria-hidden>{bonus > 0 ? '🎁' : '💳'}</span>
                              {bonus > 0
                                ? `Te quedan ${formatCLP(credit)} en tu tarjeta -- ${formatCLP(bonus)} de regalo`
                                : `Carga ${formatCLP(credit)} a tu tarjeta`}
                            </div>
                          );
                        })()}
                      </div>
                      {selectedTopupIndex < 0 && (
                        <p className="xtra-topup-hint">
                          Toca "+" para elegir cuánto cargar, de {formatCLP(Number(topupTiers[0].price))} a {formatCLP(Number(topupTiers[topupTiers.length - 1].price))}.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Paso: códigos */}
              {pasoActual.id === 'codigos' && (
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="promo-code" className="text-sm">¿Tienes un código?</Label>
                    <div className="flex flex-col sm:flex-row gap-2 mt-1.5">
                      <Input
                        id="promo-code"
                        value={code}
                        onChange={(e) => {
                          // Un espacio al inicio nunca es parte de un código real -- solo
                          // pasa cuando alguien copia y pega y arrastra un espacio de más.
                          // Se saca en vivo para que ni siquiera se vea, en vez de solo
                          // recortarlo recién al aplicar (donde ya se hacía .trim()).
                          setCode(e.target.value.replace(/^\s+/, '').toUpperCase());
                          setCodeResult(null);
                          setCodeError('');
                        }}
                        placeholder="Ingresa tu código"
                        disabled={!!codeResult}
                        className="h-12 flex-1"
                      />
                      <Button
                        type="button"
                        onClick={handleApplyCode}
                        disabled={!!codeResult || !code.trim() || validateCode.isPending}
                        className="interactive h-12 px-6 rounded-full font-bold whitespace-nowrap"
                      >
                        {validateCode.isPending
                          ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Aplicando…</>
                          : codeResult
                            ? <><Check className="w-4 h-4 mr-2" /> Aplicado</>
                            : <><Tag className="w-4 h-4 mr-2" /> Aplicar</>}
                      </Button>
                    </div>
                    {codeResult?.type === 'discount' && <p className="text-sm text-green-400 mt-1">Descuento aplicado ✓</p>}
                    {codeResult?.type === 'ambassador' && (
                      <p className="text-sm text-green-400 mt-1">Le vamos a acreditar la venta a {codeResult.name} ✓</p>
                    )}
                    {codeError && <p className="text-sm text-destructive mt-1" role="alert">{codeError}</p>}
                    <p className="text-xs text-muted-foreground mt-2">Si no tienes ningún código, solo aprieta Continuar.</p>
                  </div>
                </div>
              )}

              {/* Paso final: resumen */}
              {pasoActual.id === 'resumen' && (
                <div className="space-y-4">
                  {missionOpen && missionGeneralPrice && (
                    <div className="rounded-2xl p-4 bg-gradient-to-br from-primary/15 via-cherry/10 to-violet-electric/15 border border-primary/20">
                      <p className="text-sm font-bold mb-1">🍬 Estás pagando el abono de Misión 300</p>
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        Hoy pagas {formatCLP(missionDepositPrice(accesoSlug))} para asegurar tu lugar (valor general {formatCLP(missionGeneralPrice)}).
                        {missionCutoffDate && <> Si juntamos 300 personas antes del {missionCutoffDate.toLocaleDateString('es-CL', { day: 'numeric', month: 'long', timeZone: 'America/Santiago' })}, no pagas más.</>} Si no se junta, completas
                        {' '}hasta el 60% del valor general (máximo {formatCLP(missionCapPrice(missionGeneralPrice))}) — te avisamos por email.
                      </p>
                    </div>
                  )}
                  <div className="glass-candy rounded-2xl p-5">
                    <div className="flex justify-between text-sm mb-2">
                      <span>{EMOJIS[accesoSlug] ?? '🍬'} {qty}× {acceso?.nombre}</span>
                      <span>{formatCLP(subtotal)}</span>
                    </div>
                    {discountAmount > 0 && (
                      <div className="flex justify-between text-sm text-green-400 mb-2"><span>Descuento</span><span>-{formatCLP(discountAmount)}</span></div>
                    )}
                    {useDbExtras && (
                      <>
                        {extraTickets.some((t: any) => (dbExtraQty[t.id] || 0) > 0) && (
                          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mt-3 mb-1.5">Extras</p>
                        )}
                        {extraTickets.map((t: any) => {
                          const q = dbExtraQty[t.id] || 0;
                          if (q <= 0) return null;
                          return <div key={t.id} className="flex justify-between text-sm mb-2"><span className="text-muted-foreground">✓ {q}× {t.name}</span><span>+{formatCLP(q * Number(t.price))}</span></div>;
                        })}
                      </>
                    )}
                    {serviceFee > 0 && (
                      <div className="flex justify-between text-sm text-muted-foreground mb-2"><span>Cargo por servicio</span><span>+{formatCLP(serviceFee)}</span></div>
                    )}
                    <div className="flex justify-between font-heading text-2xl pt-3 border-t border-border/40">
                      <span>Total</span>
                      <span className="text-gradient-candy">{formatCLP(total)}</span>
                    </div>
                  </div>

                  <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
                    <ShieldCheck className="w-3.5 h-3.5" /> Pago seguro con Mercado Pago · Evento +{CANDYLAND.edadMinima}
                  </p>
                  <p className="text-center text-[11px] text-muted-foreground">
                    Al comprar aceptas nuestra <Link href="/politica-de-reembolso" className="underline hover:text-foreground">política de reembolso</Link>.
                  </p>
                </div>
              )}
          </motion.div>
        </form>
      </div>

      {/* Barra de acciones fija (thumb-reach en móvil). padding-bottom suma el
       * safe-area del celular (home indicator/gesture bar) para que el botón
       * nunca quede tapado por la barra del sistema. */}
      <div
        className="fixed bottom-0 inset-x-0 z-40 p-3 bg-gradient-to-t from-background via-background/95 to-transparent pt-6"
        style={{ paddingBottom: 'max(0.75rem, calc(0.75rem + env(safe-area-inset-bottom)))' }}
      >

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
