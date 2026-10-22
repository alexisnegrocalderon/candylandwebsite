import { useEffect, useMemo, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { motion } from 'framer-motion';
import { useRoute, useSearch, Link } from 'wouter';
import { ArrowLeft, ArrowRight, Tag, Loader2, Check, ShieldCheck, Minus, Plus, MessageCircle, Lock, Instagram } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { PaymentBrick } from '@/components/PaymentBrick';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CANDYLAND, EVENTO, CAMPOS_COMPRADOR, formatCLP, whatsappComunidadLink, type Acceso, type CampoForm } from '@/config/candyland';
import { isMissionActiveForEvent, missionDepositPrice, missionCutoff, missionCapPrice } from '@shared/mission300';
import { isValidRut, isValidPassport, isValidChileanPhone, formatRutLive } from '@shared/rut';
import { isTopupProduct } from '@shared/prepaid';
import { computeCodeDiscount } from '@shared/discountCode';
import { playcoinsEarnedForPurchase } from '@shared/playcoins';
import { dropSupersededTickets } from '@shared/liveTickets';
import { useSeo } from '@/hooks/useSeo';
import { getStoredUtmParams } from '@/lib/utm';
import { getStoredAmbassadorRef } from '@/lib/ambassadorRef';
import { ambassadorBuyerDiscount, bestBuyerDiscount } from '@shared/ambassadorDiscount';
import { BRAND } from '@shared/eventBrand';
import { PARTNER_EXISTING_CUSTOMER_MESSAGE } from '@shared/partnerCampaign';
import './Checkout.walletPreview.css';
import { ContestBuyerInvite } from '@/components/ContestBuyerInvite';
import { MemberEarlyGate } from '@/components/site/MemberEarlyGate';
import { useMemberSession } from '@/lib/member';
import { isMemberEarlyAccess } from '@shared/memberConfig';

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

// v2: los pasos cambiaron (datos en una pantalla, acompañantes juntos) -- un borrador viejo no sirve.
const STORAGE_KEY = 'candyland_checkout_draft_v2';
/** Datos del comprador recordados en este teléfono (solo los suyos, nunca los de acompañantes). */
const REMEMBER_KEY = 'candyland_checkout_me';

/* Emoji por acceso (usado en el resumen final) */
const EMOJIS: Record<string, string> = {
  duo: '🍒', duo_mujeres: '👭', soltera: '🍭', soltero: '🔑', trio: '🍬', grupo: '🌈', cumpleaneros: '🎂',
};

type GroupSize = 1 | 2 | 3 | 4;
type DuoComposicion = 'mixta' | 'dos_mujeres' | 'dos_hombres';


/* Paso único «¿Cómo vienes?»: antes eran dos pantallas (cuántos son y después quiénes). Ahora todas las
 * opciones en una grilla: un toque y sigue. Las que piden código de comunidad van al final. */
type AccesoOption = { key: string; slug: string; size: GroupSize; composicion?: DuoComposicion; image: string; label: string; sub: string; emoji: string };
const ACCESO_OPTIONS: AccesoOption[] = [
  { key: 'soltera', slug: 'soltera', size: 1, image: '/candyland/checkout/quien-ella.webp', label: 'Vengo sola', sub: 'Soltera', emoji: '🍭' },
  { key: 'pareja', slug: 'duo', size: 2, composicion: 'mixta', image: '/candyland/checkout/pareja-mixta.webp', label: 'Pareja', sub: 'Mujer y hombre', emoji: '💑' },
  { key: 'dos-mujeres', slug: 'duo_mujeres', size: 2, composicion: 'dos_mujeres', image: '/candyland/checkout/pareja-dos-mujeres.webp', label: 'Dos mujeres', sub: '2x1', emoji: '👭' },
  { key: 'trio', slug: 'trio', size: 3, image: '/candyland/checkout/vibe-triada.webp', label: 'Somos tres', sub: 'Grupo mixto', emoji: '🎭' },
  { key: 'grupo', slug: 'grupo', size: 4, image: '/candyland/checkout/vibe-grupo.webp', label: 'Somos cuatro', sub: 'Grupo mixto', emoji: '🌈' },
  { key: 'soltero', slug: 'soltero', size: 1, image: '/candyland/checkout/quien-el.webp', label: 'Vengo solo', sub: 'Con código', emoji: '🔑' },
  { key: 'dos-hombres', slug: 'duo', size: 2, composicion: 'dos_hombres', image: '/candyland/checkout/pareja-dos-hombres.webp', label: 'Dos hombres', sub: 'Con código', emoji: '👬' },
];

/* Etiquetas de la pantalla «Tus datos» (todos los campos juntos). */
const DATO_LABEL: Record<string, string> = { nombre: 'Nombre y apellido', email: 'Email (ahí llega tu entrada)', whatsapp: 'WhatsApp', rut: 'Documento' };

type Remembered = { nombre?: string; email?: string; whatsapp?: string; rut?: string; docTipo?: 'rut' | 'passport' };
function readRemembered(): Remembered {
  try { return JSON.parse(localStorage.getItem(REMEMBER_KEY) || '{}') ?? {}; } catch { return {}; }
}

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

/** `true` si el campo es un RUT (comprador o acompañante) -- mismo criterio
 * usado en todo el checkout para saber a qué campos aplica el selector de
 * tipo de documento (RUT/Pasaporte). */
function isRutFieldName(name: string): boolean {
  return name === 'rut' || name.endsWith('_rut');
}

/** Clave del campo hermano "tipo de documento" de un campo RUT -- mismo
 * prefijo/slot (`buyer__rut` -> `buyer__docTipo`, `acceso__acomp1_rut` ->
 * `acceso__acomp1_docTipo`), para que `parseAttendees` (server/db.ts) agrupe
 * ambos bajo la misma persona. A propósito no contiene "rut" en el nombre:
 * `parseAttendeeRuts` cruza contra la lista de bloqueados cualquier campo
 * cuya CLAVE contenga "rut", y el valor de este campo ("rut"/"passport") no
 * es un documento a bloquear. */
function docTipoKeyFor(fieldKey: string): string {
  return fieldKey.replace(/rut$/, 'docTipo');
}

function buildSchema(fields: { key: string; field: CampoForm }[]) {
  const shape: Record<string, z.ZodTypeAny> = {};
  const rutKeys: string[] = [];
  for (const { key, field } of fields) {
    if (field.type === 'checkbox') {
      shape[key] = field.required
        ? z.boolean().refine((v) => v === true, { message: 'Debes confirmar para continuar' })
        : z.boolean().optional();
    } else if (field.type === 'email') {
      shape[key] = field.required
        ? z.string().min(1, 'Este dato es necesario').email('Revisa el formato del email')
        : z.string().email('Revisa el formato del email').or(z.literal('')).optional();
    } else if (isRutFieldName(field.name)) {
      // El formato (RUT chileno vs. pasaporte) se valida más abajo, en el
      // `.superRefine()` -- depende del campo hermano `docTipo`, que todavía
      // no está armado en este punto del loop.
      shape[key] = field.required
        ? z.string().min(1, 'Este dato es necesario')
        : z.string().optional();
      shape[docTipoKeyFor(key)] = z.enum(['rut', 'passport']).default('rut');
      rutKeys.push(key);
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
  return z.object(shape).superRefine((values, ctx) => {
    for (const key of rutKeys) {
      const value = (values as Record<string, unknown>)[key];
      if (typeof value !== 'string' || !value) continue; // vacío ya lo marcó el .min(1) de arriba si era obligatorio
      const tipo = (values as Record<string, unknown>)[docTipoKeyFor(key)];
      const valido = tipo === 'passport' ? isValidPassport(value) : isValidRut(value);
      if (!valido) {
        ctx.addIssue({
          code: 'custom',
          path: [key],
          message: tipo === 'passport' ? 'Pasaporte inválido' : 'RUT inválido',
        });
      }
    }
  });
}

/* Autocomplete semántico por nombre de campo (teclado móvil correcto) */
function autoCompleteFor(name: string): string | undefined {
  if (name.includes('nombre')) return 'name';
  if (name.includes('email')) return 'email';
  if (name.includes('whatsapp')) return 'tel';
  return undefined;
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
  fieldKey, field, register, setValue, watch, error, onEnter, autoFocus = true, compact = false,
}: { fieldKey: string; field: CampoForm; register: any; setValue: any; watch: any; error?: string; onEnter: () => void; autoFocus?: boolean; compact?: boolean }) {
  // Mismo criterio que buildSchema() más arriba para saber si es un campo de
  // RUT (comprador o acompañante) -- puntos y guion se ponen solos mientras
  // se escribe, pedido explícito del dueño (antes había que tipear el guion
  // a mano). Ver formatRutLive en shared/rut.ts.
  const isRut = field.name === 'rut' || field.name.endsWith('_rut');
  // Selector RUT/Pasaporte: gente sin RUT chileno (extranjeros) también
  // necesita poder comprar -- el campo sigue siendo obligatorio, solo cambia
  // cómo se valida y se formatea según lo elegido. Ver docTipoKeyFor() y el
  // `.superRefine()` de buildSchema() más arriba.
  const tipoKey = isRut ? docTipoKeyFor(fieldKey) : undefined;
  const tipo = (tipoKey ? watch(tipoKey) : undefined) ?? 'rut';
  const esPasaporte = isRut && tipo === 'passport';

  return (
    <div>
      {isRut && tipoKey && (
        <>
          <input type="hidden" {...register(tipoKey)} defaultValue="rut" />
          <div className={`flex gap-2 ${compact ? 'mb-2' : 'mb-3'}`} role="group" aria-label="Tipo de documento">
          {(['rut', 'passport'] as const).map((opcion) => (
            <button
              key={opcion}
              type="button"
              aria-pressed={tipo === opcion}
              onClick={() => {
                setValue(tipoKey, opcion, { shouldValidate: false });
                setValue(fieldKey, '', { shouldValidate: false });
              }}
              className={`flex-1 ${compact ? 'h-9 text-xs' : 'h-10 text-sm'} rounded-full font-semibold uppercase tracking-wide border transition-colors interactive ${
                tipo === opcion ? 'border-primary bg-primary/15 text-primary' : 'border-border/50 text-muted-foreground hover:border-primary/40'
              }`}
            >
              {opcion === 'rut' ? 'RUT' : 'Pasaporte'}
            </button>
          ))}
          </div>
        </>
      )}
      <Input
        id={fieldKey}
        type={field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : field.type === 'tel' ? 'tel' : field.type === 'email' ? 'email' : 'text'}
        inputMode={field.type === 'tel' ? 'tel' : field.type === 'email' ? 'email' : field.type === 'number' ? 'numeric' : undefined}
        autoComplete={autoCompleteFor(fieldKey)}
        autoFocus={autoFocus}
        {...(isRut && !esPasaporte
          ? register(fieldKey, { onChange: (e: React.ChangeEvent<HTMLInputElement>) => setValue(fieldKey, formatRutLive(e.target.value), { shouldValidate: false }) })
          : register(fieldKey))}
        placeholder={esPasaporte ? 'Número de pasaporte' : field.placeholder}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); onEnter(); } }}
        className={compact ? 'h-12 text-base' : 'h-14 text-lg'}
      />
      {field.help && !compact && <p className="text-xs text-muted-foreground mt-2">{field.help}</p>}
      {error && <p className="text-sm text-destructive mt-2" role="alert">{error}</p>}
    </div>
  );
}

/** Pasos con varias casillas propias (no campos del formulario): el paso
 * "Bienvenid@ a Playroom" del link de una campaña aliada. */
const PARTNER_CHECKS: { key: 'sigoPlayroom' | 'aceptaValores' | 'aceptaPermanencia'; label: string }[] = [
  { key: 'sigoPlayroom', label: 'Sigo a Mansion Playroom en Instagram' },
  { key: 'aceptaValores', label: 'Acepto los valores de Playroom: respeto y consentimiento, siempre' },
  { key: 'aceptaPermanencia', label: 'Acepto el derecho de permanencia: si mi estado o mi conducta incomoda al resto, me pedirán retirarme y no podré volver a ninguna fiesta de Playroom' },
];

/** `partnerSlug`: checkout del link privado de una campaña aliada
 * (/electronica, ver shared/partnerCampaign.ts) -- mismos accesos y mismo
 * flujo, pero con el precio por persona de la campaña, sin códigos, sin
 * Soltero, y con el paso obligatorio de valores + derecho de permanencia. */
function CheckoutInner({ partnerSlug }: { partnerSlug?: string } = {}) {
  const [, params] = useRoute('/checkout/:eventSlug');
  const isPartner = !!partnerSlug;
  const { data: partner, isLoading: partnerLoading } = trpc.partner.get.useQuery(
    { slug: partnerSlug ?? '' },
    { enabled: isPartner, retry: false },
  );
  const eventSlug = (isPartner ? partner?.eventSlug : params?.eventSlug) ?? CANDYLAND.slug;
  // Borrador aparte: un borrador de la compra normal no puede arrastrarse al
  // link de la comunidad (ni al revés).
  const storageKey = isPartner ? `${STORAGE_KEY}_${partnerSlug}` : STORAGE_KEY;
  // Firma del DJ que compartió el link (`?dj=aldo`): se recuerda en el
  // navegador por si la persona vuelve después sin el parámetro. El servidor
  // la valida contra las firmas conocidas (PARTNER_REFS).
  const [partnerRef] = useState<string | undefined>(() => {
    if (!isPartner) return undefined;
    const refKey = `playroom_partner_ref_${partnerSlug}`;
    const fromUrl = new URLSearchParams(window.location.search).get('dj')?.trim().toLowerCase() || '';
    try {
      if (fromUrl) { window.localStorage.setItem(refKey, fromUrl); return fromUrl; }
      return window.localStorage.getItem(refKey) || undefined;
    } catch {
      return fromUrl || undefined;
    }
  });
  useSeo({
    title: 'Completa tu compra — Mansion Playroom',
    description: 'Checkout de entradas para eventos de Mansion Playroom.',
    path: isPartner ? `/${partnerSlug}` : `/checkout/${eventSlug}`,
    noindex: true,
  });
  const search = useSearch();
  // El link de la comunidad no acepta preselección por URL (?items=soltero
  // saltaría la regla de no vender Soltero).
  const itemsParam = isPartner ? '' : new URLSearchParams(search).get('items') || '';
  const initialFromUrl = itemsParam.split(',')[0]?.split(':')[0] || '';
  const initialQtyFromUrl = Math.max(1, Number(itemsParam.split(',')[0]?.split(':')[1]) || 1);
  const skipVibe = SPECIAL_SKIP_VIBE.includes(initialFromUrl);

  const { data: event } = trpc.events.getBySlug.useQuery({ slug: eventSlug }, { retry: false });
  const { data: liveTicketsData } = trpc.events.getTicketTypes.useQuery({ slug: eventSlug }, { retry: false });
  const { data: siteSettings } = trpc.settings.get.useQuery();
  const serviceFeePercent = Number(siteSettings?.serviceFeePercent ?? 0);
  // Sin las filas de tandas ya cerradas (ver shared/liveTickets.ts).
  const liveTickets = useMemo(() => dropSupersededTickets(liveTicketsData ?? []), [liveTicketsData]);
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
  const checkPartnerEligibility = trpc.partner.checkEligibility.useMutation();
  // Ya es cliente de Playroom: el link de la comunidad no es para esta
  // persona -- se le muestra la salida a la compra normal.
  const [yaCliente, setYaCliente] = useState(false);
  const [partnerChecks, setPartnerChecks] = useState({ sigoPlayroom: false, aceptaValores: false, aceptaPermanencia: false });
  const [partnerChecksError, setPartnerChecksError] = useState('');
  // Precio de la campaña: el servidor lo entrega recién al validar email +
  // RUT (partner.checkEligibility). Antes de eso el link no muestra ningún
  // valor -- si alguien de Playroom lo abre, no ve el precio especial.
  const [partnerPricing, setPartnerPricing] = useState<{ pricePerPerson: number; prices: Record<string, number> } | null>(null);
  const [partnerCheckError, setPartnerCheckError] = useState('');
  const partnerAllows = (slug: string) => !isPartner || !!partner?.allowedAccesos.includes(slug);

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
  const missionOpen = !isPartner && !useConfig && !!event?.eventDate && isMissionActiveForEvent(event);

  const acceso: Acceso | undefined = useMemo(() => {
    if (!accesoId) return undefined;
    if (useConfig) return CANDYLAND.accesos.find((a) => a.id === accesoId);
    const tt = accesoTickets.find((t: any) => String(t.id) === accesoId);
    if (!tt) return undefined;
    const cfg = CANDYLAND.accesos.find((a) => a.id === (tt as any).accesoSlug) ?? CANDYLAND.accesos.find((a) => a.nombre.toLowerCase() === (tt as any).name.toLowerCase());
    const generalPrice = Number((tt as any).price);
    const partnerPrice = isPartner ? partnerPricing?.prices[(tt as any).accesoSlug] : undefined;
    const precio = partnerPrice != null ? partnerPrice : missionOpen ? missionDepositPrice((tt as any).accesoSlug) : generalPrice;
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
  }, [accesoId, useConfig, liveTickets, missionOpen, partnerPricing]);

  // Precio normal del acceso elegido, para mostrarlo tachado junto al de la
  // campaña aliada.
  const partnerRegularPrice = useMemo(() => {
    if (!isPartner || !accesoId || useConfig) return null;
    const tt = accesoTickets.find((t: any) => String(t.id) === accesoId);
    return tt ? Number((tt as any).price) : null;
  }, [isPartner, accesoId, useConfig, liveTickets]);

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

  const chooseAcceso = (op: AccesoOption) => {
    if (!avisarSiNoHayEntrada(op.slug)) return;
    setGroupSize(op.size);
    setDuoComposicion(op.composicion ?? null);
    setAccesoSlug(op.slug);
    continuar();
  };

  /* Dúo Dos Hombres necesita el mismo código de comunidad que Soltero. */
  const requiresCommunityCode = !isPartner && (accesoSlug === 'soltero' || (accesoSlug === 'duo' && duoComposicion === 'dos_hombres'));

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
    | { type: 'ambassador'; name: string; code: string; buyerDiscountPercent?: number }
    | { type: 'credit'; code: string; accesoSlug: string; accesoName: string }
    | null
  >(null);
  // Embajador del link/código: se guarda aparte de `codeResult` para que su
  // descuento (si tiene) siga contando aunque la persona escriba además un
  // código de descuento -- no se suman, se aplica el mayor.
  const [refAmbassador, setRefAmbassador] = useState<{ name: string; code: string; buyerDiscountPercent: number } | null>(null);
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
  // PIN de la tarjeta de membresía (pedido explícito del dueño): se define
  // acá, al comprar una carga de saldo -- pagar de verdad con Mercado Pago
  // ES la prueba de identidad, nunca antes. Solo se pide si el carrito tiene
  // alguna línea "Cargar saldo" (ver hasTopupInCart más abajo).
  const [cardPin, setCardPin] = useState('');
  const [cardPinConfirm, setCardPinConfirm] = useState('');
  const [cardPinError, setCardPinError] = useState('');
  const setCardPinMutation = trpc.prepaid.setCardPinAfterTopup.useMutation();
  // Con una carga de saldo en el carrito, el resumen pide el PIN antes de crear la orden.
  const topupCharge = extraTickets.reduce((s: number, t: any) => (isTopupProduct(t) ? s + (dbExtraQty[t.id] || 0) * Number(t.price) : s), 0);
  const hasTopupInCart = useDbExtras && topupCharge > 0;

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
    if (isPartner) {
      p.push({ id: 'intro-comunidad', titulo: '🎧 Bienvenid@, comunidad electrónica', sub: partner?.headline, keys: [] });
    }
    if (!skipVibe) {
      p.push({ id: 'acceso', titulo: `✨ ¿Cómo vienes a ${EVENTO.nombre}?`, sub: 'Toca tu opción.', keys: [] });
    }
    // Todos los datos del comprador en UNA pantalla (antes era una pantalla por dato).
    p.push({ id: 'datos', titulo: 'Tus datos', sub: 'Para enviarte la entrada y validarla en la puerta. Son 100% privados.', keys: CAMPOS_COMPRADOR.map((f) => `buyer__${f.name}`) });
    // Todos los acompañantes en UNA pantalla.
    const acompKeys = camposAcceso.filter((f) => f.name !== 'codigo_acceso').map((f) => `acceso__${f.name}`);
    if (acompKeys.length > 0) {
      const varios = acompKeys.filter((k) => k.endsWith('_nombre')).length > 1;
      p.push({ id: 'acompanantes', titulo: varios ? '¿Quiénes vienen contigo?' : '¿Quién viene contigo?', sub: 'Nombre y documento tal como aparecen en su carnet.', keys: acompKeys });
    }
    if (requiresCommunityCode) {
      p.push({ id: 'codigo-comunidad', titulo: 'Tu código de comunidad', sub: 'Lo necesitas para completar esta compra.', keys: ['acceso__codigo_acceso'] });
    }
    if (isPartner) {
      p.push({ id: 'bienvenida-playroom', titulo: '💜 Bienvenid@ a Playroom', sub: 'Es tu primera vez con nosotros: así cuidamos la fiesta entre todos. Léelo y confirma para continuar.', keys: [] });
    }
    // Pantalla final: extras, código, total y pagar (antes eran tres pantallas + una espera de 5 s).
    p.push({ id: 'resumen', titulo: '✨ Último paso', sub: 'Agrega lo que quieras, revisa el total y paga.', keys: [] });
    return p;
  }, [camposAcceso, skipVibe, groupSize, requiresCommunityCode, useDbExtras, isPartner, partner?.headline]);

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
    try { return JSON.parse(sessionStorage.getItem(storageKey) || '{}'); } catch { return {}; }
  }, []);

  const { register, handleSubmit, trigger, setValue, watch, formState: { errors } } = useForm({
    resolver: zodResolver(schema),
    mode: 'onBlur',
    defaultValues: draft.values ?? {},
  });

  // «Tus datos» viene lleno cuando se puede: borrador de esta visita (defaultValues) → «Mi cuenta» →
  // datos recordados en este teléfono. Solo se llenan campos vacíos, una sola vez.
  const prefill = trpc.member.checkoutPrefill.useQuery(undefined, { retry: false, staleTime: 60_000 });
  const prefilled = useRef(false);
  const [remember, setRemember] = useState(true);
  useEffect(() => {
    if (prefilled.current || prefill.isLoading) return;
    prefilled.current = true;
    const mine = readRemembered();
    const m = prefill.data;
    const src: Remembered = m
      ? { nombre: m.fullName ?? mine.nombre, email: m.email, whatsapp: m.phone ?? mine.whatsapp, rut: m.rut ?? mine.rut, docTipo: m.rut ? m.docType : mine.docTipo }
      : mine;
    const fill = (key: string, value?: string | null) => { if (value && !watch(key as any)) setValue(key as any, value, { shouldValidate: false }); };
    if (src.docTipo && !watch('buyer__rut' as any)) setValue('buyer__docTipo' as any, src.docTipo, { shouldValidate: false });
    fill('buyer__nombre', src.nombre);
    fill('buyer__email', src.email);
    fill('buyer__whatsapp', src.whatsapp);
    fill('buyer__rut', src.rut);
  }, [prefill.isLoading, prefill.data, setValue, watch]);

  useEffect(() => {
    if (draft.accesoSlug) setAccesoSlug(draft.accesoSlug);
    if (draft.groupSize) setGroupSize(draft.groupSize);
    if (draft.qty) setQty(draft.qty);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const sub = watch((values) => {
      sessionStorage.setItem(storageKey, JSON.stringify({ values, accesoSlug, groupSize, qty }));
    });
    return () => sub.unsubscribe();
  }, [watch, accesoSlug, groupSize, qty]);

  /* ── Totales ─────────────────────────────────────────────── */
  const subtotal = (acceso?.precio ?? 0) * qty;
  // Crédito de acceso: vale UNA unidad del mismo acceso (mismo cálculo que
  // `creditDiscount` en shared/accessCredit.ts, que es el que cobra el servidor).
  const creditApplies = codeResult?.type === 'credit' && codeResult.accesoSlug === accesoSlug && qty > 0;
  // Descuento por código: misma función que usa el servidor al cobrar
  // (shared/discountCode.ts) -- solo sobre el acceso, nunca sobre extras, y el
  // monto fijo nunca pasa del precio del acceso.
  const accesoTicketType = useConfig ? undefined : accesoTickets.find((t: any) => String(t.id) === accesoId);
  const codeDiscountAmount = codeResult?.type === 'discount'
    ? computeCodeDiscount(
      codeResult.discount,
      [{
        ticketTypeId: Number(accesoId),
        category: 'acceso',
        unitPrice: acceso?.precio ?? 0,
        originalPrice: accesoTicketType ? Number((accesoTicketType as any).originalPrice ?? (accesoTicketType as any).price) : null,
        quantity: qty,
      }],
      'web',
    )
    : creditApplies ? (acceso?.precio ?? 0) : 0;
  // Descuento del embajador (shared/ambassadorDiscount.ts, la misma regla que
  // cobra el servidor): solo sobre el acceso, no va con crédito ni con precio
  // de campaña aliada, y gana el mayor frente al código de descuento.
  const ambassadorDiscountAmount = !creditApplies && !isPartner && refAmbassador
    ? ambassadorBuyerDiscount(refAmbassador.buyerDiscountPercent, [{ ticketTypeId: Number(accesoId), category: 'acceso', unitPrice: acceso?.precio ?? 0, quantity: qty }])
    : 0;
  const discountAmount = bestBuyerDiscount(codeDiscountAmount, ambassadorDiscountAmount).amount;
  const ambassadorDiscountWins = ambassadorDiscountAmount > codeDiscountAmount;
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
        setCodeResult({ type: 'ambassador', name: result.name, code: result.code, buyerDiscountPercent: result.buyerDiscountPercent });
        setRefAmbassador({ name: result.name, code: result.code, buyerDiscountPercent: result.buyerDiscountPercent });
      } else if (result.type === 'credit') {
        setCodeResult({ type: 'credit', code: result.code, accesoSlug: result.accesoSlug, accesoName: result.accesoName });
      } else {
        setCodeResult(null);
        setCodeError(result.message || 'No encontramos ese código');
      }
    } catch {
      setCodeError('No pudimos validar el código');
    }
  };

  // Precarga y aplica un código SOLO, sin que la persona tenga que escribir
  // ni tocar nada -- dos fuentes posibles, se usa la primera que haya (el
  // link de embajador manda si hay las dos, por ser la que ya vivía acá):
  // 1. Link personal de embajador (client/src/lib/ambassadorRef.ts): el
  //    código queda guardado desde antes de aterrizar acá.
  // 2. `?code=` en la URL: lo arma la automatización de Instagram por
  //    palabra clave (server/instagramAutomations.ts, placeholder
  //    {{link}}) para que el código que ya le llegó por DM se aplique
  //    solo apenas entra a comprar.
  // Nunca pisa un código que la persona ya haya escrito a mano (`code`
  // vacío es la condición), y corre una sola vez por carga de Checkout (una
  // vez aplicado, tocar "Aplicar" de nuevo no vuelve a dispararse por el
  // guard de `codeResult` en el botón).
  useEffect(() => {
    if (isPartner || !event?.id || code.trim()) return;
    const stored = getStoredAmbassadorRef() || new URLSearchParams(search).get('code') || '';
    if (!stored) return;
    setCode(stored);
    validateCode.mutateAsync({ code: stored, eventId: event.id }).then((result) => {
      if (result.type === 'discount') setCodeResult({ type: 'discount', discount: result.discount });
      else if (result.type === 'ambassador') {
        setCodeResult({ type: 'ambassador', name: result.name, code: result.code, buyerDiscountPercent: result.buyerDiscountPercent });
        setRefAmbassador({ name: result.name, code: result.code, buyerDiscountPercent: result.buyerDiscountPercent });
      }
      else if (result.type === 'credit') setCodeResult({ type: 'credit', code: result.code, accesoSlug: result.accesoSlug, accesoName: result.accesoName });
      // Si el código precargado ya no es válido (embajador dado de baja,
      // promo vencida, etc.) se deja el campo cargado en silencio -- no
      // tiene sentido mostrar un error por algo que la persona no escribió
      // ella misma.
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event?.id]);

  const handleValidateCommunityCode = async () => {
    if (!communityCodeInput.trim()) return;
    setCommunityCodeError('');
    try {
      const result = await validateCommunityCode.mutateAsync({ code: communityCodeInput, buyerRut: watch('buyer__rut') || undefined, eventId: event?.id });
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
    if (isPartner && pasoActual.id === 'bienvenida-playroom') {
      if (!PARTNER_CHECKS.every((c) => partnerChecks[c.key])) {
        setPartnerChecksError('Marca las tres casillas para continuar.');
        return;
      }
    }
    // Link de la comunidad: apenas hay email + RUT, se revisa que no sea ya
    // cliente de Playroom (el servidor lo vuelve a exigir al crear la orden).
    // Si puede comprar, esa misma respuesta trae los precios; sin respuesta
    // no se avanza, porque sin precio no hay resumen que mostrar.
    if (isPartner && partnerSlug && pasoActual.id === 'datos') {
      setPartnerCheckError('');
      try {
        const res = await checkPartnerEligibility.mutateAsync({ slug: partnerSlug, email: watch('buyer__email'), rut: watch('buyer__rut') || undefined });
        if (!res.eligible) { setYaCliente(true); return; }
        setPartnerPricing(res.pricing);
      } catch (e: any) {
        setPartnerCheckError(e?.message || 'No pudimos validar tus datos. Revisa tu conexión e intenta de nuevo.');
        return;
      }
    }
    setPaso((p) => Math.min(p + 1, total_pasos - 1));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const volver = () => {
    setPaso((p) => Math.max(p - 1, 0));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const onSubmit = async (values: Record<string, any>) => {
    // Con carga de saldo, el PIN se define en esta misma pantalla (antes había una pantalla aparte después de crear la orden).
    if (hasTopupInCart) {
      if (!/^\d{4}$/.test(cardPin)) { setCardPinError('El PIN tiene que tener 4 dígitos'); return; }
      if (cardPin !== cardPinConfirm) { setCardPinError('Los dos PIN no coinciden'); return; }
    }
    const extrasElegidos = useDbExtras
      ? extraTickets.filter((t: any) => (dbExtraQty[t.id] || 0) > 0).map((t: any) => ({ nombre: t.name, cantidad: dbExtraQty[t.id] }))
      : [];
    const attendeeData = JSON.stringify({
      acceso: acceso?.nombre, cantidad: qty, grupoTipo: accesoSlug,
      extras: extrasElegidos,
      campos: values,
      // +18 con fecha y hora: queda registrado en la orden (el servidor exige que venga confirmado).
      ...(values['buyer__mayorEdad'] === true ? { mayorEdadEn: new Date().toISOString() } : {}),
      // Aceptaciones del paso "Bienvenid@ a Playroom", con fecha: quedan
      // guardadas en la orden (ver hasPartnerAcceptance en el servidor).
      ...(isPartner ? { partner: { slug: partnerSlug, ...partnerChecks, aceptadoEn: new Date().toISOString() } } : {}),
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
        discountCode: isPartner ? undefined : code.trim() || undefined,
        // Si ya hay un embajador identificado (link o código) se manda su
        // código aunque la persona haya escrito después un descuento: así la
        // venta se le acredita y el servidor aplica el mayor de los dos.
        ambassadorCode: isPartner ? undefined : (codeResult?.type !== 'credit' && refAmbassador?.code) || code.trim() || undefined,
        partnerSlug,
        partnerRef,
        communityCode: requiresCommunityCode ? values['acceso__codigo_acceso'] : undefined,
        attendeeData,
        // Atribución UTM (ver client/src/lib/utm.ts) -- vacío si nunca entró
        // por un link etiquetado, y el server lo trata como "sin UTM".
        ...getStoredUtmParams(),
      });
      sessionStorage.removeItem(storageKey);
      try {
        if (remember) {
          localStorage.setItem(REMEMBER_KEY, JSON.stringify({
            nombre: values['buyer__nombre'], email: values['buyer__email'], whatsapp: values['buyer__whatsapp'],
            rut: values['buyer__rut'], docTipo: values['buyer__docTipo'] ?? 'rut',
          } satisfies Remembered));
        } else {
          localStorage.removeItem(REMEMBER_KEY);
        }
      } catch { /* sin storage: no se recuerda, no pasa nada */ }
      setIsProcessing(false);
      setOrdenPago({ orderNumber: result.orderNumber, total: result.total });
      if (result.isFree) {
        // Descuento del 100%: el servidor ya aprobó la orden y mandó el
        // email de bienvenida con el QR — no hay nada que cobrar, así que
        // saltamos directo a la pantalla de éxito sin montar el Payment Brick.
        setPagoResultado('approved');
      }
      // Si no es gratis, el formulario de tarjeta (Payment Brick) se monta
      // en el próximo render, con este orderNumber/total ya guardados.
    } catch (err: any) {
      setIsProcessing(false);
      if (isPartner && err?.message === PARTNER_EXISTING_CUSTOMER_MESSAGE) { setYaCliente(true); return; }
      alert(err.message || 'Error al procesar la orden');
    }
  };


  const err = (key: string) => (errors as any)[key]?.message as string | undefined;

  /* Paso que avanza solo con un clic (sin botón "Continuar" fijo) */
  const isAutoAdvance = pasoActual.id === 'acceso';

  // Link de la comunidad cerrado, lleno, inexistente o comprador que ya es
  // cliente: en vez del wizard, una salida clara a la compra normal.
  const partnerBlock: { emoji: string; titulo: string; texto: string } | null = !isPartner || ordenPago ? null
    : partnerLoading ? null
    : !partner ? { emoji: '🔒', titulo: 'Este link no está disponible', texto: 'Puede que haya cambiado. Puedes comprar tu entrada en la web de Mansion Playroom.' }
    : partner.status === 'closed' ? { emoji: '🔒', titulo: 'El acceso especial de la comunidad ya cerró', texto: 'Igual te esperamos: puedes comprar tu entrada en la web de Mansion Playroom.' }
    : partner.status === 'full' ? { emoji: '🎧', titulo: 'Se agotaron los cupos de la comunidad', texto: 'Fue un éxito. Todavía puedes comprar tu entrada en la web de Mansion Playroom.' }
    : yaCliente ? { emoji: '💜', titulo: 'Ya eres parte de Playroom', texto: 'Este link es solo para quienes vienen por primera vez con la comunidad. Tu entrada la compras en la web normal, como siempre.' }
    : null;

  if (isPartner && partnerLoading) {
    return (
      <div className="min-h-dvh pt-24 pb-16 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" aria-label="Cargando" />
      </div>
    );
  }

  if (partnerBlock) {
    return (
      <div className="min-h-dvh pt-24 pb-16 flex items-center justify-center">
        <div className="container max-w-md text-center">
          <div className="w-16 h-16 rounded-full glass-candy flex items-center justify-center mx-auto mb-5 text-3xl">{partnerBlock.emoji}</div>
          <h1 className="font-heading font-extrabold text-2xl md:text-3xl tracking-tight mb-2">{partnerBlock.titulo}</h1>
          <p className="text-muted-foreground text-sm mb-8">{partnerBlock.texto}</p>
          <Link href={`/checkout/${eventSlug}`} className="btn-jelly inline-flex h-13 items-center justify-center px-8 rounded-full bg-primary text-primary-foreground font-bold uppercase tracking-wide text-sm interactive">
            Comprar en la web
          </Link>
        </div>
      </div>
    );
  }

  // Opciones de la grilla «¿Cómo vienes?»: el link de la comunidad no ofrece las que piden código.
  const accesoOptions = ACCESO_OPTIONS.filter((op) => !isPartner || (partnerAllows(op.slug) && op.key !== 'soltero' && op.key !== 'dos-hombres'));
  // Acompañantes agrupados por persona (acomp1_nombre + acomp1_rut → Acompañante 1).
  const acompGroups = (() => {
    const map = new Map<number, { key: string; field: CampoForm }[]>();
    for (const f of camposAcceso) {
      const m = f.name.match(/^acomp(\d+)_/);
      if (!m) continue;
      const n = Number(m[1]);
      if (!map.has(n)) map.set(n, []);
      map.get(n)!.push({ key: `acceso__${f.name}`, field: f });
    }
    return Array.from(map.entries()).sort((a, b) => a[0] - b[0]).map(([n, fields]) => ({ n, fields }));
  })();

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
          {!isPartner && <ContestBuyerInvite eventSlug={event?.slug} />}
          {isPartner && partner && (
            <div className="glass-candy rounded-2xl p-5 mb-6 text-left space-y-3">
              <p className="text-sm font-bold">{partner.emoji} Nos vemos en la Pista Tech</p>
              <p className="text-xs text-muted-foreground leading-relaxed">¿Tu gente de la escena todavía no tiene entrada? Pásales este mismo link para que vengan con el acceso de la comunidad.</p>
              <a
                href={`https://wa.me/?text=${encodeURIComponent(`Yo ya voy al ${partner.headline.split('·')[0].trim()} en Playroom 🎧 Compra tu entrada con el acceso de la comunidad: ${window.location.origin}/${partnerSlug}${partnerRef ? `?dj=${encodeURIComponent(partnerRef)}` : ''}`)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full inline-flex items-center justify-center gap-2 h-12 rounded-full border border-primary text-primary text-sm font-bold uppercase tracking-wide interactive"
              >
                <MessageCircle className="w-4 h-4" /> Compartir por WhatsApp
              </a>
              <a
                href={BRAND.instagram}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full inline-flex items-center justify-center gap-2 h-12 rounded-full border border-border text-sm font-semibold interactive"
              >
                <Instagram className="w-4 h-4" /> Sigue a Mansion Playroom
              </a>
            </div>
          )}
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
          {ordenPago && (
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

        {/* Sello discreto de la comunidad (sin precio: el valor recién se ve
            en el resumen, después de validar los datos). */}
        {isPartner && partner && pasoActual.id !== 'intro-comunidad' && (
          <p className="mb-4 text-[11px] font-bold uppercase tracking-[0.15em] text-primary">{partner.emoji} Acceso {partner.label}</p>
        )}

        <form
          id="checkout-form" className="relative"
          // Solo el resumen paga; un Enter en cualquier otro paso avanza.
          onSubmit={(e) => { if (pasoActual.id !== 'resumen') { e.preventDefault(); void continuar(); return; } void handleSubmit(onSubmit)(e); }}
        >
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

              {/* Paso: bienvenida a la comunidad (link aliado). Sin precios. */}
              {pasoActual.id === 'intro-comunidad' && partner && (
                <div className="space-y-4">
                  <div className="glass-candy rounded-2xl p-5 space-y-3">
                    <p className="text-sm leading-relaxed">
                      Esta invitación es para ti, que vienes de la escena electrónica y quizás nunca has estado en una fiesta de Playroom. Te contamos lo importante:
                    </p>
                    <ul className="space-y-2.5 text-sm leading-relaxed text-muted-foreground">
                      <li className="flex gap-2"><span aria-hidden>🎧</span><span><span className="text-foreground font-semibold">Pista 1 · Tech:</span> el B2B de Aldo Medel y German Courtin, toda la noche.</span></li>
                      <li className="flex gap-2"><span aria-hidden>🔥</span><span><span className="text-foreground font-semibold">Pista 2:</span> el mejor perreo y bailable para no parar en toda la noche.</span></li>
                      <li className="flex gap-2"><span aria-hidden>🚗</span><span><span className="text-foreground font-semibold">Estacionamiento privado</span> dentro del recinto, con cupos limitados: lo puedes reservar al final de la compra.</span></li>
                      <li className="flex gap-2"><span aria-hidden>🍔</span><span>Stand de comida, tiendas y barra completa para toda la noche.</span></li>
                      <li className="flex gap-2"><span aria-hidden>🛡️</span><span><span className="text-foreground font-semibold">Un espacio seguro:</span> respeto y consentimiento son la regla. Nadie te va a incomodar y nada es obligatorio.</span></li>
                      <li className="flex gap-2"><span aria-hidden>🎭</span><span>Es Halloween y nuestro aniversario: <span className="text-foreground font-semibold">el disfraz es obligatorio</span>.</span></li>
                      <li className="flex gap-2"><span aria-hidden>🪪</span><span>Evento +{CANDYLAND.edadMinima}: trae tu carnet o pasaporte.</span></li>
                    </ul>
                  </div>
                  <p className="text-xs text-center text-muted-foreground">Tu acceso especial de comunidad se aplica al final de la compra.</p>
                </div>
              )}

              {/* Paso: ¿Cómo vienes? — todas las opciones en una grilla, un toque y sigue. */}
              {pasoActual.id === 'acceso' && (
                <>
                  <div className="grid grid-cols-3 gap-2 md:gap-3">
                    {accesoOptions.map((op) => (
                      <SquareImageOption
                        key={op.key}
                        image={op.image}
                        titulo={op.label}
                        sub={op.sub}
                        fallbackEmoji={op.emoji}
                        activo={accesoSlug === op.slug && (op.composicion ? duoComposicion === op.composicion : true)}
                        onClick={() => chooseAcceso(op)}
                      />
                    ))}
                  </div>
                  {isPartner && <p className="text-xs text-center text-muted-foreground mt-4">En Playroom no hay acceso para hombres solos ni grupos solo de hombres.</p>}
                </>
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

              {partnerCheckError && pasoActual.id === 'datos' && (
                <p className="text-sm text-destructive mb-3" role="alert">{partnerCheckError}</p>
              )}

              {/* Paso: tus datos — todo en una pantalla, con el +18 como check. */}
              {pasoActual.id === 'datos' && (
                <div className="space-y-4">
                  {CAMPOS_COMPRADOR.filter((f) => f.type !== 'checkbox').map((f, i) => (
                    <div key={f.name}>
                      <Label htmlFor={`buyer__${f.name}`} className="mb-1.5 block text-sm font-semibold">{DATO_LABEL[f.name] ?? f.label}</Label>
                      <SingleFieldInput fieldKey={`buyer__${f.name}`} field={f} register={register} setValue={setValue} watch={watch} error={err(`buyer__${f.name}`)} onEnter={continuar} autoFocus={i === 0 && !watch('buyer__nombre')} compact />
                    </div>
                  ))}
                  <label className={`flex items-start gap-3 rounded-2xl border p-4 cursor-pointer transition-colors ${watch('buyer__mayorEdad') ? 'border-primary bg-primary/10' : 'border-border/60'}`}>
                    <input type="checkbox" {...register('buyer__mayorEdad' as any)} className="mt-0.5 w-5 h-5 shrink-0 accent-[oklch(0.70_0.19_340)]" />
                    <span className="text-sm leading-snug"><span className="font-semibold">Confirmo que soy mayor de {CANDYLAND.edadMinima} años</span> y llevaré mi carnet o pasaporte a la entrada.</span>
                  </label>
                  {err('buyer__mayorEdad') && <p className="text-sm text-destructive -mt-2" role="alert">{err('buyer__mayorEdad')}</p>}
                  <label className="flex items-center gap-2.5 text-sm text-muted-foreground cursor-pointer">
                    <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="w-4 h-4 accent-[oklch(0.70_0.19_340)]" />
                    Recordar mis datos en este teléfono para la próxima compra
                  </label>
                </div>
              )}

              {/* Paso: acompañantes — todos juntos, nombre y documento de cada uno. */}
              {pasoActual.id === 'acompanantes' && (
                <div className="space-y-4">
                  {acompGroups.map((g) => (
                    <div key={g.n} className="glass-candy rounded-2xl p-4 space-y-3">
                      <p className="text-xs font-bold uppercase tracking-[0.15em] text-primary">{acompGroups.length > 1 ? `Acompañante ${g.n}` : 'Tu acompañante'}</p>
                      {g.fields.map(({ key, field }, i) => (
                        <div key={key}>
                          <Label htmlFor={key} className="mb-1.5 block text-sm font-semibold">{/_nombre$/.test(key) ? 'Nombre y apellido' : 'Documento'}</Label>
                          <SingleFieldInput fieldKey={key} field={field} register={register} setValue={setValue} watch={watch} error={err(key)} onEnter={continuar} autoFocus={g.n === 1 && i === 0} compact />
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              )}

              {/* Paso: extras reales del evento (category="extra" en el admin).
                  Dos bloques con lenguaje visual distinto a propósito -- ver
                  el comentario de prepagoTickets/topupTiers más arriba. */}
              {pasoActual.id === 'resumen' && useDbExtras && (
                <details className="group mb-4 glass-candy rounded-2xl" open={dbExtrasTotal > 0 || isPartner}>
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3.5 text-sm font-semibold">
                    <span>{isPartner ? '🚗 Asegura tu estacionamiento y extras' : '✨ ¿Agregamos algo más?'} <span className="font-normal text-muted-foreground">· opcional</span></span>
                    <span className="text-muted-foreground transition-transform group-open:rotate-180" aria-hidden>▾</span>
                  </summary>
                <div className="space-y-6 px-4 pb-4">
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
                                      {/* En el link de la comunidad también el estacionamiento:
                                          es gente que no conoce el lugar y el cupo es real. */}
                                      {(t.totalStock <= 10 || (isPartner && /estacionamiento/i.test(t.name))) && (
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
                </details>
              )}

              {/* Paso: valores + derecho de permanencia (link de la comunidad) */}
              {pasoActual.id === 'bienvenida-playroom' && partner && (
                <div className="space-y-4">
                  <div className="glass-candy rounded-2xl p-5">
                    <p className="text-xs font-bold uppercase tracking-[0.15em] text-primary mb-2">Nuestros pilares</p>
                    <p className="text-sm font-semibold mb-4">{BRAND.valores.join(' · ')}</p>
                    <ul className="space-y-2.5">
                      {partner.rules.map((r, i) => (
                        <li key={i} className="text-sm leading-relaxed text-muted-foreground flex gap-2"><span aria-hidden className="text-primary">•</span><span>{r}</span></li>
                      ))}
                    </ul>
                  </div>
                  <a
                    href={BRAND.instagram}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full inline-flex items-center justify-center gap-2 h-12 rounded-full border border-primary text-primary text-sm font-bold uppercase tracking-wide interactive"
                  >
                    <Instagram className="w-4 h-4" /> Seguir a Mansion Playroom
                  </a>
                  <div className="space-y-2">
                    {PARTNER_CHECKS.map((c) => (
                      <label key={c.key} className={`flex items-start gap-3 rounded-xl border p-3.5 cursor-pointer transition-colors ${partnerChecks[c.key] ? 'border-primary bg-primary/10' : 'border-border/50'}`}>
                        <input
                          type="checkbox"
                          checked={partnerChecks[c.key]}
                          onChange={(e) => { setPartnerChecks((prev) => ({ ...prev, [c.key]: e.target.checked })); setPartnerChecksError(''); }}
                          className="mt-0.5 w-5 h-5 accent-[oklch(0.70_0.19_340)] shrink-0"
                        />
                        <span className="text-sm leading-snug">{c.label}</span>
                      </label>
                    ))}
                  </div>
                  {partnerChecksError && <p className="text-sm text-destructive" role="alert">{partnerChecksError}</p>}
                </div>
              )}

              {/* Paso: códigos */}
              {pasoActual.id === 'resumen' && !isPartner && (
                <details className="group mb-4 glass-candy rounded-2xl" open={!!code.trim() || !!codeResult}>
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3.5 text-sm font-semibold">
                    <span>🎟️ ¿Tienes un código? <span className="font-normal text-muted-foreground">· descuento o de quien te invitó</span></span>
                    <span className="text-muted-foreground transition-transform group-open:rotate-180" aria-hidden>▾</span>
                  </summary>
                <div className="space-y-4 px-4 pb-4">
                  <div>
                    <Label htmlFor="promo-code" className="sr-only">Código</Label>
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
                    {codeResult?.type === 'credit' && (
                      <p className={`text-sm mt-1 ${creditApplies ? 'text-green-400' : 'text-yellow-400'}`}>
                        {creditApplies
                          ? `Crédito aplicado: tu ${codeResult.accesoName} va sin costo ✓`
                          : `Este crédito es para un ${codeResult.accesoName}. Elige ese acceso para usarlo.`}
                      </p>
                    )}
                    {codeResult?.type === 'discount' && <p className="text-sm text-green-400 mt-1">{codeResult.discount.giftTicketTypeId ? '¡Regalo incluido en tu compra! 🎁' : 'Descuento aplicado ✓'}</p>}
                    {codeResult?.type === 'ambassador' && (
                      <p className="text-sm text-green-400 mt-1">
                        {(codeResult.buyerDiscountPercent ?? 0) > 0
                          ? `Tienes ${codeResult.buyerDiscountPercent}% de descuento en tu entrada por la invitación de ${codeResult.name} ✓`
                          : `Le vamos a acreditar la venta a ${codeResult.name} ✓`}
                      </p>
                    )}
                    {codeResult?.type === 'discount' && ambassadorDiscountWins && refAmbassador && (
                      <p className="text-sm text-green-400 mt-1">Se aplica el descuento de {refAmbassador.name} ({refAmbassador.buyerDiscountPercent}%) porque es mayor ✓</p>
                    )}
                    {codeError && <p className="text-sm text-destructive mt-1" role="alert">{codeError}</p>}
                  </div>
                </div>
                </details>
              )}

              {/* Paso final: resumen */}
              {pasoActual.id === 'resumen' && (
                <div className="space-y-4">
                  {isPartner && partner && partnerPricing && (
                    <div className="rounded-2xl p-4 bg-gradient-to-br from-primary/15 via-cherry/10 to-violet-electric/15 border border-primary/20">
                      <p className="text-sm font-bold mb-1">{partner.emoji} Precio especial {partner.label}</p>
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        {formatCLP(partnerPricing.pricePerPerson)} por persona
                        {partnerRegularPrice && acceso && partnerRegularPrice > acceso.precio && <> · valor normal <span className="line-through">{formatCLP(partnerRegularPrice)}</span></>}
                      </p>
                    </div>
                  )}
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

                  {hasTopupInCart && (
                    <div className="glass-candy rounded-2xl p-5">
                      <WalletPreviewCard holderName={watch('buyer__nombre') || ''} topupAmount={topupCharge} playcoinsEarned={playcoinsEarnedForPurchase(total - topupCharge)} eventName={EVENTO.nombre} />
                      <p className="text-sm font-semibold mb-1">💳 Define el PIN de tu tarjeta</p>
                      <p className="text-xs text-muted-foreground mb-4">4 dígitos para gastar tu saldo en caja. Se activa cuando se apruebe el pago.</p>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <Label htmlFor="cardPin">PIN (4 dígitos)</Label>
                          <Input id="cardPin" type="tel" inputMode="numeric" maxLength={4} autoComplete="off" value={cardPin}
                            onChange={(e) => { setCardPin(e.target.value.replace(/\D/g, '').slice(0, 4)); setCardPinError(''); }}
                            className="mt-1 tracking-[0.3em] text-center" />
                        </div>
                        <div>
                          <Label htmlFor="cardPinConfirm">Confirma el PIN</Label>
                          <Input id="cardPinConfirm" type="tel" inputMode="numeric" maxLength={4} autoComplete="off" value={cardPinConfirm}
                            onChange={(e) => { setCardPinConfirm(e.target.value.replace(/\D/g, '').slice(0, 4)); setCardPinError(''); }}
                            className="mt-1 tracking-[0.3em] text-center" />
                        </div>
                      </div>
                      {cardPinError && <p className="text-xs text-destructive mt-2" role="alert">{cardPinError}</p>}
                    </div>
                  )}
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
              key="pagar"
              type="submit"
              form="checkout-form"
              disabled={isProcessing}
              className="btn-jelly flex-1 h-13 py-3.5 rounded-full bg-primary text-primary-foreground font-bold uppercase tracking-wide text-sm inline-flex items-center justify-center gap-2 interactive"
            >
              {isProcessing ? (<><Loader2 className="w-5 h-5 animate-spin" /> Procesando…</>) : (<>💳 Continuar al pago</>)}
            </button>
          ) : !isAutoAdvance ? (
            <button
              key="continuar"
              type="button"
              onClick={continuar}
              disabled={checkPartnerEligibility.isPending}
              className="btn-jelly flex-1 h-13 py-3.5 rounded-full bg-primary text-primary-foreground font-bold uppercase tracking-wide text-sm inline-flex items-center justify-center gap-2 interactive"
            >
              {checkPartnerEligibility.isPending
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Validando…</>
                : pasoActual.id === 'intro-comunidad'
                  ? <>¡Quiero ir! <ArrowRight className="w-4 h-4" /></>
                  : <>Continuar <ArrowRight className="w-4 h-4" /></>}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/** Puerta de la preventa de socios: si el evento la tiene activa y no hay sesión de «Mi cuenta», se pide entrar antes de comprar. */
export default function Checkout(props: { partnerSlug?: string } = {}) {
  const [, params] = useRoute('/checkout/:eventSlug');
  const slug = props.partnerSlug ? '' : params?.eventSlug ?? CANDYLAND.slug;
  const { data: event } = trpc.events.getBySlug.useQuery({ slug }, { enabled: !!slug, retry: false });
  const { data: session, isLoading } = useMemberSession();
  if (slug && event && isMemberEarlyAccess(event as any)) {
    if (isLoading) return <div className="min-h-dvh" />;
    if (!(session?.loggedIn && session.isMember)) return <MemberEarlyGate event={event as any} />;
  }
  return <CheckoutInner {...props} />;
}
