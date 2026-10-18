/* Co-producción con otra productora (ej. Playroom × Dalmore): contenido de la
 * landing, reparto de la utilidad y reglas compartidas entre el servidor y
 * el panel. Ver drizzle/schema.ts `coproductions`. */

export interface CoproductionFaq {
  q: string;
  a: string;
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
  partnerLogoUrl: string;
  galleryUrls: string[];
  highlights: string[];
  rules: string[];
  faq: CoproductionFaq[];
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
  partnerLogoUrl: '',
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
};

const str = (v: unknown, max: number, fallback: string) =>
  typeof v === 'string' ? v.trim().slice(0, max) : fallback;

const strList = (v: unknown, max: number, maxItems: number, fallback: string[]) =>
  Array.isArray(v)
    ? v.filter((x): x is string => typeof x === 'string').map((x) => x.trim().slice(0, max)).filter(Boolean).slice(0, maxItems)
    : fallback;

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
    partnerLogoUrl: isSafeImageUrl(partnerLogoUrl) ? partnerLogoUrl : '',
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
  };
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
