/* Co-producción con otra productora (ej. Playroom × Dalmore): contenido de la
 * landing, reparto de la utilidad y reglas compartidas entre el servidor y
 * el panel. Ver drizzle/schema.ts `coproductions`. */

export interface CoproductionFaq {
  q: string;
  a: string;
}

/** Marca compartida de un evento con co-producción activa: checkout, correos,
 * entrada y páginas de resultado del pago. */
export interface ColabBrand {
  slug: string; partnerName: string; partnerLogoUrl: string; eventName: string;
  /** Slug del evento enlazado (para volver a su checkout). */
  eventSlug: string;
  countdownIso: string; timeText: string; venueText: string;
}

/** Un momento de "La noche minuto a minuto" (hora "23:00"). */
export interface CoproductionMoment {
  time: string;
  title: string;
  text: string;
}

/** Textos e imágenes de la landing /playroom<slug>. Todo opcional: lo que
 * falte se completa con DEFAULT_LANDING. */
export interface CoproductionLanding {
  title: string;
  headline: string;
  subheadline: string;
  dateText: string;
  venueText: string;
  capacityText: string;
  /** Aforo en personas (la barra de avance del panel). */
  capacity: number;
  heroImageUrl: string;
  /** Video de fondo del hero (mp4 https). Vacío = terciopelo animado. */
  heroVideoUrl: string;
  partnerLogoUrl: string;
  /** Nombre propio de la noche (grande en el ticket y el hero). */
  eventName: string;
  /** Hora en el ticket ("23:00"). */
  timeText: string;
  /** Instante al que cuenta la cuenta regresiva (ISO con zona). */
  countdownIso: string;
  /** "Dos mundos, una noche": quién es cada productora. */
  playroomBlurb: string;
  partnerBlurb: string;
  /** Código de vestimenta de la noche. */
  dressCode: string;
  galleryUrls: string[];
  highlights: string[];
  rules: string[];
  faq: CoproductionFaq[];
  /** "La noche minuto a minuto": lo que pasa a cada hora. */
  timeline: CoproductionMoment[];
  /** Antes de "Activar evento": muestra la página completa con los tickets (sin habilitar la compra).
   * Para cuando la dirección todavía no la conoce nadie. */
  showTicketsEarly: boolean;
}

export const DEFAULT_LANDING: CoproductionLanding = {
  title: 'Playroom × Dalmore',
  headline: 'Las dos productoras liberales más grandes, una sola noche.',
  subheadline: 'Un salón gigante en el Hipódromo de Santiago, dos pistas de energía y la experiencia Playroom con la comunidad de Dalmore.',
  dateText: 'Viernes 4 de diciembre',
  venueText: 'Hipódromo Chile, Santiago',
  capacityText: 'Aforo para 800 personas',
  capacity: 800,
  heroImageUrl: '',
  heroVideoUrl: '',
  partnerLogoUrl: '',
  eventName: 'PLAYMORE',
  timeText: '23:00',
  // 4 de diciembre, 23:00 en Chile (verano, UTC-3).
  countdownIso: '2026-12-04T23:00:00-03:00',
  playroomBlurb: 'La productora que convirtió la noche liberal en un juego: fiestas temáticas, zonas para jugar y una comunidad que llega a pasarlo increíble, sin miedo y con respeto.',
  partnerBlurb: 'Una experiencia privada que no es para todos. Música electrónica, estética y un código propio: Dalmore no es una fiesta masiva, es un punto de encuentro cuidado en cada detalle.',
  dressCode: 'Elegante, atrevido y a tu medida: negro, terciopelo, encaje, cuero o brillo. Ven como quieras que te recuerden.',
  galleryUrls: [],
  highlights: [
    'Salón principal gigante, iluminación y sonido de festival',
    'Zonas de juego y espacios privados diseñados por Playroom',
    'Comunidad Dalmore + comunidad Playroom en un mismo lugar',
    'Equipo de anfitriones y seguridad toda la noche',
  ],
  rules: [
    'Solo mayores de 18 años con carnet.',
    'El consentimiento es la regla número uno: un no es un no.',
    'Prohibido fotografiar o grabar a otras personas.',
    'El equipo puede retirar a quien no respete las reglas, sin devolución.',
  ],
  faq: [
    { q: '¿Dónde compro las entradas?', a: 'Solo en esta página. No vendemos por transferencia ni por Instagram.' },
    { q: '¿Cuándo me llega la dirección exacta?', a: 'Te llega por correo junto con tu entrada, después de comprar.' },
    { q: '¿Puedo ir sola o solo?', a: 'Sí. Mucha gente llega así y conoce gente adentro.' },
  ],
  // Encendido por defecto mientras la dirección no es pública; se apaga desde Configuración.
  showTicketsEarly: true,
  timeline: [
    { time: '23:00', title: 'Se abren las puertas', text: 'Llegas, muestras tu QR y te recibe el equipo. El primer trago marca el comienzo.' },
    { time: '00:00', title: 'Dos pistas encendidas', text: 'Playroom y Dalmore suben la energía, cada uno con su sonido y su luz.' },
    { time: '01:30', title: 'Se abren las zonas de juego', text: 'Los espacios Playroom se encienden. Entra quien quiere, cuando quiere.' },
    { time: '03:00', title: 'La mezcla', text: 'Las dos comunidades se cruzan en un solo momento. Lo vas a entender cuando pase.' },
    { time: '05:00', title: 'Último track', text: 'Las luces bajan y la noche se queda contigo.' },
  ],
};

const str = (v: unknown, max: number, fallback: string) =>
  typeof v === 'string' ? v.trim().slice(0, max) : fallback;

const strList = (v: unknown, max: number, maxItems: number, fallback: string[]) =>
  Array.isArray(v)
    ? v.filter((x): x is string => typeof x === 'string').map((x) => x.trim().slice(0, max)).filter(Boolean).slice(0, maxItems)
    : fallback;

/** Logo en JPG/JPEG: formato sin transparencia (siempre trae fondo). */
export const isOpaqueLogo = (u: string) => /\.jpe?g$/i.test(u.split(/[?#]/)[0]);

/** Solo https (o rutas del propio sitio) para las imágenes de la landing. */
const isSafeImageUrl = (u: string) => u === '' || /^https:\/\//.test(u) || /^\/[^/]/.test(u);

/** Completa y limpia el JSON guardado: nunca deja un campo en undefined. */
export function normalizeLanding(raw: unknown): CoproductionLanding {
  const p = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const d = DEFAULT_LANDING;
  const heroImageUrl = str(p.heroImageUrl, 500, d.heroImageUrl);
  const partnerLogoUrl = str(p.partnerLogoUrl, 500, d.partnerLogoUrl);
  return {
    title: str(p.title, 120, d.title) || d.title,
    headline: str(p.headline, 200, d.headline) || d.headline,
    subheadline: str(p.subheadline, 400, d.subheadline),
    dateText: str(p.dateText, 80, d.dateText),
    venueText: str(p.venueText, 120, d.venueText),
    capacityText: str(p.capacityText, 80, d.capacityText),
    capacity: Number.isInteger(Number(p.capacity)) && Number(p.capacity) > 0 ? Math.min(Number(p.capacity), 100000) : d.capacity,
    heroImageUrl: isSafeImageUrl(heroImageUrl) ? heroImageUrl : '',
    heroVideoUrl: /^https:\/\/\S+$/.test(str(p.heroVideoUrl, 500, '')) ? str(p.heroVideoUrl, 500, '') : '',
    // Un JPG no puede ser transparente: se vería con su fondo (cielo, negro, blanco).
    // Se ignora y la landing usa el logo transparente que ya trae la página.
    partnerLogoUrl: isSafeImageUrl(partnerLogoUrl) && !isOpaqueLogo(partnerLogoUrl) ? partnerLogoUrl : '',
    eventName: str(p.eventName, 40, d.eventName) || d.eventName,
    timeText: str(p.timeText, 20, d.timeText),
    countdownIso: typeof p.countdownIso === 'string' && !Number.isNaN(Date.parse(p.countdownIso)) ? p.countdownIso.slice(0, 40) : d.countdownIso,
    playroomBlurb: str(p.playroomBlurb, 500, d.playroomBlurb),
    partnerBlurb: str(p.partnerBlurb, 500, d.partnerBlurb),
    dressCode: str(p.dressCode, 300, d.dressCode),
    galleryUrls: strList(p.galleryUrls, 500, 12, d.galleryUrls).filter(isSafeImageUrl),
    highlights: strList(p.highlights, 160, 8, d.highlights),
    rules: strList(p.rules, 200, 10, d.rules),
    faq: Array.isArray(p.faq)
      ? p.faq
        .filter((f): f is CoproductionFaq => !!f && typeof (f as any).q === 'string' && typeof (f as any).a === 'string')
        .map((f) => ({ q: f.q.trim().slice(0, 160), a: f.a.trim().slice(0, 600) }))
        .filter((f) => f.q && f.a)
        .slice(0, 12)
      : d.faq,
    showTicketsEarly: typeof p.showTicketsEarly === 'boolean' ? p.showTicketsEarly : d.showTicketsEarly,
    timeline: Array.isArray(p.timeline)
      ? p.timeline
        .filter((m): m is CoproductionMoment => !!m && typeof (m as any).time === 'string' && typeof (m as any).title === 'string')
        .map((m) => ({ time: m.time.trim().slice(0, 8), title: m.title.trim().slice(0, 80), text: typeof m.text === 'string' ? m.text.trim().slice(0, 240) : '' }))
        .filter((m) => m.time && m.title)
        .slice(0, 10)
      : d.timeline,
  };
}

/** Panel: una línea por momento, "23:00 | Título | Texto". */
export function timelineToText(t: CoproductionMoment[]): string {
  return t.map((m) => [m.time, m.title, m.text].filter((x, i) => i < 2 || x).join(' | ')).join('\n');
}
export function timelineFromText(text: string): CoproductionMoment[] {
  return text.split('\n').map((l) => l.split('|').map((x) => x.trim()))
    .filter((parts) => parts[0] && parts[1])
    .map(([time, title, ...rest]) => ({ time, title, text: rest.join(' | ') }));
}

export interface SplitResult {
  netProfit: number;
  partnerPercent: number;
  partnerShare: number;
  playroomShare: number;
}

/** Reparto de la utilidad: la parte del socio se redondea al peso y Playroom
 * se queda con el resto, así las dos partes siempre suman la utilidad exacta.
 * Con pérdida se reparte igual (cada uno absorbe su parte). */
export function splitProfit(netProfit: number, partnerPercent: number): SplitResult {
  const pct = Math.min(100, Math.max(0, Math.round(partnerPercent)));
  const partnerShare = Math.round((netProfit * pct) / 100);
  return { netProfit, partnerPercent: pct, partnerShare, playroomShare: netProfit - partnerShare };
}

/** Clave para el socio: 4 palabras + número, fácil de dictar por teléfono y
 * con ~50 bits (el login además tiene 2FA y límite de intentos). */
const WORDS = [
  'neon', 'luna', 'fuego', 'seda', 'noche', 'brillo', 'cereza', 'terciopelo', 'jazz', 'pulso', 'aurora', 'mango',
  'cobalto', 'rubi', 'coral', 'eclipse', 'fresa', 'nectar', 'oasis', 'pluma', 'ritmo', 'safiro', 'tango', 'vino',
  'ambar', 'bruma', 'canela', 'delta', 'esmeralda', 'faro', 'galaxia', 'humo', 'indigo', 'jade', 'karma', 'lirio',
  'menta', 'nube', 'opalo', 'perla', 'quasar', 'rosa', 'salsa', 'trueno', 'umbral', 'velvet', 'whisky', 'zafiro',
];

export function generatePartnerPassword(randomInt: (max: number) => number): string {
  const words = Array.from({ length: 4 }, () => WORDS[randomInt(WORDS.length)]);
  return `${words.join('-')}-${10 + randomInt(90)}`;
}

/** openId sintético de la sesión del socio: incluye la versión para que
 * cambiar o revocar la clave cierre las sesiones abiertas. */
export function partnerOpenId(slug: string, sessionVersion: number): string {
  return `partner:${slug}:${sessionVersion}`;
}

export function parsePartnerOpenId(openId: string): { slug: string; sessionVersion: number } | null {
  const m = /^partner:([a-z0-9-]{1,50}):(\d{1,9})$/.exec(openId);
  return m ? { slug: m[1], sessionVersion: Number(m[2]) } : null;
}
