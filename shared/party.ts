/** Reglas de "Caramelo", la capa social que vive solo mientras dura la
 * fiesta -- compartidas entre servidor y cliente. El servidor las aplica
 * como autorización real (esconder un botón no protege nada); el cliente
 * las usa para no mostrar la puerta abierta cuando está cerrada. */

// --- Constantes de política ---

/** Tope de Caramelos (★, el «toque» de antes: la otra persona se entera) por persona y por noche.
 * Son 3, como un super like: es lo que hace que recibir uno signifique algo. Sin tope, una sola
 * persona mandando 80 convierte la función en spam la primera noche. */
export const MAX_TOUCHES_PER_EVENT = 3;

/** Deshacer el último ✕ del swipe: una vez por noche. */
export const MAX_REWINDS_PER_EVENT = 1;

/** «Visto»: la otra persona abrió el chat después de mi último mensaje. */
export function isSeenBy(myLastMessageAt: Date | string | null | undefined, otherReadAt: Date | string | null | undefined): boolean {
  const mine = toTime(myLastMessageAt);
  const read = toTime(otherReadAt);
  return mine !== null && read !== null && read >= mine;
}

/** En línea si dio señales en los últimos 2 minutos. El cliente refresca
 * la mansión cada 10s, así que tolera varias respuestas perdidas antes de
 * marcar a alguien como ausente. */
export const PRESENCE_WINDOW_MS = 2 * 60 * 1000;

export const MAX_MESSAGE_LENGTH = 500;
export const MIN_ALIAS_LENGTH = 2;
export const MAX_ALIAS_LENGTH = 16;

/** Si un evento no tiene `eventEnd` cargado, la fiesta se cierra igual a
 * las 12 horas de empezar. Sin este tope, un evento mal configurado dejaría
 * el chat abierto para siempre. */
export const DEFAULT_PARTY_DURATION_MS = 12 * 60 * 60 * 1000;

export const PARTY_ZONES = ['living', 'playground', 'piscina', 'barra'] as const;
export type PartyZone = (typeof PARTY_ZONES)[number];

export const ZONE_LABELS: Record<PartyZone, string> = {
  living: 'Living',
  playground: 'Playground',
  piscina: 'Piscina',
  barra: 'Barra',
};

export const PARTY_GENDERS = ['mujer', 'hombre', 'no_binario', 'pareja'] as const;
export type PartyGender = (typeof PARTY_GENDERS)[number];

export const GENDER_LABELS: Record<PartyGender, string> = { mujer: 'Mujer', hombre: 'Hombre', no_binario: 'No binario', pareja: 'Pareja' };

/** Una pareja dice de quiénes está formada: así una pareja de chicas no le aparece a quien busca «chica + chico». */
export const PAIR_TYPES = ['mixta', 'chicas', 'chicos'] as const;
export type PairType = (typeof PAIR_TYPES)[number];
export const PAIR_LABELS: Record<PairType, string> = { mixta: 'Chica + chico', chicas: 'Dos chicas', chicos: 'Dos chicos' };

/** Cómo se lee el «Soy» en la tarjeta: «Mujer», «Pareja · Dos chicas». */
export function identityLabel(p: { gender: string; pairType?: string | null }): string {
  if (p.gender === 'pareja') return p.pairType && p.pairType in PAIR_LABELS ? `Pareja · ${PAIR_LABELS[p.pairType as PairType]}` : 'Pareja';
  return GENDER_LABELS[p.gender as PartyGender] ?? 'Persona';
}

/** Colores de la «ficha» (avatar) de cada perfil, en client/src/components/party/Avatar.tsx. */
export const AVATARS_PER_GENDER = 6;

// --- Ventana horaria ---

export type PartyEventWindow = {
  eventDate: Date | string;
  doorsOpen?: Date | string | null;
  eventEnd?: Date | string | null;
};

function toTime(value: Date | string | null | undefined): number | null {
  if (!value) return null;
  const t = new Date(value).getTime();
  return Number.isFinite(t) ? t : null;
}

/** Cuándo abre y cierra la capa social de un evento. `doorsOpen` y
 * `eventEnd` son nullable en el schema, así que ambos tienen respaldo. */
export function partyWindow(event: PartyEventWindow): { opensAt: number; closesAt: number } | null {
  const eventDate = toTime(event.eventDate);
  if (eventDate === null) return null;
  const opensAt = toTime(event.doorsOpen) ?? eventDate;
  const closesAt = toTime(event.eventEnd) ?? eventDate + DEFAULT_PARTY_DURATION_MS;
  return { opensAt, closesAt };
}

/** El corazón del "solo durante la fiesta": fuera de esta ventana no se
 * entra, no se toca y no se escribe. */
export function isPartyWindowOpen(event: PartyEventWindow, now: Date = new Date()): boolean {
  const window = partyWindow(event);
  if (!window) return false;
  const t = now.getTime();
  return t >= window.opensAt && t < window.closesAt;
}

/** La caja vende en el evento real un rato ANTES de que abra la puerta (contar el fondo, armar la barra) y
 * un rato DESPUÉS del fin (cerrar turno y cuadrar). Solo cambia desde cuándo y hasta cuándo la caja toma el
 * evento real en vez del de pruebas: lo que ve el público (puertas, Playmatch) sigue usando `partyWindow`. */
export const CAJA_LEAD_MS = 90 * 60_000;
export const CAJA_TAIL_MS = 3 * 60 * 60_000;

export function isCajaWindowOpen(event: PartyEventWindow, now: Date = new Date()): boolean {
  const window = partyWindow(event);
  if (!window) return false;
  const t = now.getTime();
  return t >= window.opensAt - CAJA_LEAD_MS && t < window.closesAt + CAJA_TAIL_MS;
}

export type PartyTicketState = { status: string; eventId: number };

export type PartyEntryDenial = 'sin_ticket' | 'no_ingreso' | 'fuera_de_horario';

/** Por qué alguien no puede entrar a la fiesta -- `null` significa que sí
 * puede. Exige `status === 'used'`: o sea que el QR fue escaneado de verdad
 * en la puerta (check-in del PR A). Tener la entrada comprada no basta. */
export function partyEntryDenial(
  ticket: PartyTicketState | null | undefined,
  event: PartyEventWindow | null | undefined,
  now: Date = new Date()
): PartyEntryDenial | null {
  if (!ticket || !event) return 'sin_ticket';
  if (ticket.status !== 'used') return 'no_ingreso';
  if (!isPartyWindowOpen(event, now)) return 'fuera_de_horario';
  return null;
}

/** Inscripción anticipada en Playmatch: con la entrada comprada (sin anular) y
 * antes de que termine la fiesta se puede crear el perfil y aceptar las
 * normas. Queda guardado pero invisible (`active=0`) hasta que escanean la
 * entrada en la puerta; ahí se activa solo. */
export function canPreRegister(
  ticket: PartyTicketState | null | undefined,
  event: PartyEventWindow | null | undefined,
  now: Date = new Date()
): boolean {
  if (!ticket || !event || ticket.status === 'cancelled') return false;
  const window = partyWindow(event);
  return !!window && now.getTime() < window.closesAt;
}

export function canEnterParty(
  ticket: PartyTicketState | null | undefined,
  event: PartyEventWindow | null | undefined,
  now: Date = new Date()
): boolean {
  return partyEntryDenial(ticket, event, now) === null;
}

// --- Presencia ---

export function isOnline(lastSeenAt: Date | string | null | undefined, now: Date = new Date()): boolean {
  const t = toTime(lastSeenAt);
  if (t === null) return false;
  return now.getTime() - t <= PRESENCE_WINDOW_MS;
}

// --- Conexiones ---

/** Normaliza el par de una conexión: A↔B se guarda siempre como
 * (menor, mayor). Con eso, el índice único de `partyConnections` impide
 * duplicados en los dos sentidos y "no puede volver a tocar a quien ya lo
 * rechazó" sale gratis de la propia tabla, sin lógica extra. */
export function orderedPair(a: number, b: number): { low: number; high: number } {
  return a <= b ? { low: a, high: b } : { low: b, high: a };
}

export function hasTouchesLeft(touchesUsed: number): boolean {
  return touchesUsed < MAX_TOUCHES_PER_EVENT;
}

// --- Posición en la mansión ---

/** Posición determinística dentro de una zona, en porcentaje. Determinística
 * a propósito: la mansión se refresca cada 10 segundos y, con posiciones al
 * azar, los avatares saltarían de lugar en cada refresco y sería imposible
 * seguir a nadie con la vista. */
export function placeInZone(profileId: number, salt = 0): { xPct: number; yPct: number } {
  // Hash entero simple y estable (no necesita ser criptográfico). El
  // `>>> 0` después de cada XOR no es decorativo: `^=` devuelve un entero
  // con signo, y sin eso el hash se vuelve negativo y los avatares quedan
  // fuera de su zona.
  let h = (profileId * 2654435761 + salt * 40503) >>> 0;
  h = (h ^ (h >>> 13)) >>> 0;
  h = (h * 1274126177) >>> 0;
  h = (h ^ (h >>> 16)) >>> 0;

  // Márgenes para que ningún avatar quede pegado al borde de su zona.
  const xPct = 12 + ((h % 1000) / 1000) * 76;
  const yPct = 18 + (((h >>> 10) % 1000) / 1000) * 64;
  return { xPct: Math.round(xPct * 10) / 10, yPct: Math.round(yPct * 10) / 10 };
}

// --- Alias ---

export type AliasCheck = { ok: true; alias: string } | { ok: false; reason: string };

// El alias lo ve toda la fiesta. Sin este filtro se convierte en un tablón
// de "IG: @loquesea" y se cae el "sin datos de contacto" que es la base de
// la función: acá la gente se conoce adentro, no se intercambia redes.
const ALIAS_FORBIDDEN = [
  { re: /@\w/, reason: 'Nada de arrobas ni redes sociales en el alias' },
  { re: /https?:\/\/|www\.|\.com|\.cl\b/i, reason: 'Nada de links en el alias' },
  { re: /(?:\d[\s.-]*){7,}/, reason: 'Nada de números de teléfono en el alias' },
];

export function sanitizeAlias(raw: string): AliasCheck {
  const alias = raw.replace(/\s+/g, ' ').trim();

  if (alias.length < MIN_ALIAS_LENGTH) return { ok: false, reason: 'Muy corto, mínimo 2 caracteres' };
  if (alias.length > MAX_ALIAS_LENGTH) return { ok: false, reason: `Máximo ${MAX_ALIAS_LENGTH} caracteres` };

  for (const { re, reason } of ALIAS_FORBIDDEN) {
    if (re.test(alias)) return { ok: false, reason };
  }

  return { ok: true, alias };
}

// Mismo criterio que el alias, aplicado al chat: acá la gente se conoce
// adentro, no se intercambian redes ni teléfonos. Esto es una barrera
// razonable, no infalible (siempre habrá quien escriba "uno dos tres...").
const MESSAGE_FORBIDDEN = [
  ...ALIAS_FORBIDDEN,
  { re: /\b(?:insta(?:gram)?|ig|whats?app|wsp|wasap|wapp|telegram|snap(?:chat)?|tiktok|fono|tel[eé]fono|n[uú]mero)\b/i, reason: 'Nada de redes sociales ni teléfonos: aquí se conversa dentro de la fiesta' },
];

export function sanitizeMessage(raw: string): { ok: true; body: string } | { ok: false; reason: string } {
  const body = raw.replace(/\s+/g, ' ').trim();
  if (!body) return { ok: false, reason: 'El mensaje está vacío' };
  if (body.length > MAX_MESSAGE_LENGTH) return { ok: false, reason: `Máximo ${MAX_MESSAGE_LENGTH} caracteres` };
  for (const { re, reason } of MESSAGE_FORBIDDEN) {
    if (re.test(body)) return { ok: false, reason };
  }
  return { ok: true, body };
}

// --- Invitar un trago ---------------------------------------------------
//
// Se le puede invitar un trago a cualquiera, sin necesidad de tener el chat
// abierto: invitar un trago es justamente la forma clásica de acercarse a
// alguien que todavía no conoces (decisión del dueño). Pero la otra persona
// puede rechazarlo, y por eso el cobro va DESPUÉS de la respuesta: nadie
// paga por un trago que la otra persona no quiso.

export type GiftStatus = 'invited' | 'accepted' | 'declined' | 'paid' | 'redeemed' | 'expired';

/** Una invitación sin pagar vence a los 15 minutos. Los dos están en la
 * misma fiesta con el teléfono en la mano, así que el ida y vuelta normal
 * es de segundos; el plazo existe para que nadie quede esperando un trago
 * que el que invitó ya no va a pagar. */
export const GIFT_INVITE_TTL_MS = 15 * 60 * 1000;

export const MAX_GIFT_MESSAGE_LENGTH = 120;

export function giftExpiresAt(createdAt: Date = new Date()): Date {
  return new Date(createdAt.getTime() + GIFT_INVITE_TTL_MS);
}

export function isGiftExpired(gift: { status: GiftStatus; expiresAt?: Date | string | null }, now: Date = new Date()): boolean {
  // Una vez pagado ya no vence: el trago queda válido incluso para el
  // próximo evento (decisión del dueño).
  if (gift.status === 'paid' || gift.status === 'redeemed') return false;
  if (gift.status === 'declined' || gift.status === 'expired') return false;
  const t = toTime(gift.expiresAt);
  if (t === null) return false;
  return now.getTime() >= t;
}

/** Solo el destinatario responde, y solo mientras la invitación siga viva. */
export function canRespondToGift(
  gift: { status: GiftStatus; toProfileId: number; expiresAt?: Date | string | null },
  profileId: number,
  now: Date = new Date()
): boolean {
  if (gift.toProfileId !== profileId) return false;
  if (gift.status !== 'invited') return false;
  return !isGiftExpired(gift, now);
}

/** Solo paga quien invitó, y solo después de que le dijeron que sí. */
export function canPayGift(
  gift: { status: GiftStatus; fromProfileId: number; expiresAt?: Date | string | null },
  profileId: number,
  now: Date = new Date()
): boolean {
  if (gift.fromProfileId !== profileId) return false;
  if (gift.status !== 'accepted') return false;
  return !isGiftExpired(gift, now);
}

/** Un regalo pagado y todavía no cobrado en la barra. Es lo que la caja
 * tiene que poder canjear, sea de esta fiesta o de una anterior. */
export function isGiftClaimable(gift: { status: GiftStatus }): boolean {
  return gift.status === 'paid';
}

/** Qué le mostramos al destinatario de un regalo que sigue `invited` pero
 * ya venció: nada. La invitación simplemente desaparece. */
export function visibleGiftStatus(gift: { status: GiftStatus; expiresAt?: Date | string | null }, now: Date = new Date()): GiftStatus {
  return isGiftExpired(gift, now) ? 'expired' : gift.status;
}

export function sanitizeGiftMessage(raw: string): { ok: true; body: string } | { ok: false; reason: string } {
  const body = raw.replace(/\s+/g, ' ').trim();
  if (body.length > MAX_GIFT_MESSAGE_LENGTH) return { ok: false, reason: `Máximo ${MAX_GIFT_MESSAGE_LENGTH} caracteres` };
  return { ok: true, body };
}

// --- Foto de perfil (swipe) ----------------------------------------------
//
// La foto se toma con la cámara dentro de la fiesta, se recorta cuadrada y se
// comprime en el celular. El servidor igual la valida: el cliente no es una
// frontera de confianza.

export const PHOTO_MAX_BYTES = 200 * 1024;
/** Fotos 3:4 (vertical), como la tarjeta del swipe. */
export const PHOTO_WIDTH_PX = 480;
export const PHOTO_HEIGHT_PX = 640;
/** Hasta 3 fotos por perfil (carrusel de la tarjeta). La primera es la principal. */
export const MAX_PARTY_PHOTOS = 3;

/** Dónde va una foto nueva: reemplaza la de esa posición, o se agrega al final (nunca deja huecos). */
export function photoSlotFor(requested: number | undefined, count: number): number | null {
  if (requested === undefined) return count < MAX_PARTY_PHOTOS ? count : null;
  if (!Number.isInteger(requested) || requested < 0 || requested >= MAX_PARTY_PHOTOS) return null;
  return Math.min(requested, count);
}

/** Solo JPEG: es lo que `canvas.toBlob('image/jpeg')` entrega en todos los
 * navegadores (WebP falla en Safari viejo). Se revisa la firma real del
 * archivo, no el tipo declarado por el cliente. */
export function isJpeg(bytes: Uint8Array): boolean {
  return bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}

export function validatePhotoBytes(bytes: Uint8Array): { ok: true } | { ok: false; reason: string } {
  if (bytes.length === 0) return { ok: false, reason: 'La foto está vacía' };
  if (bytes.length > PHOTO_MAX_BYTES) return { ok: false, reason: 'La foto pesa demasiado, toma otra' };
  if (!isJpeg(bytes)) return { ok: false, reason: 'Formato de foto no válido' };
  return { ok: true };
}

/** Para ver fotos de otros hay que poner la propia: sin esto el swipe sería
 * un lugar donde mirar sin exponerse. */
export function canSeePhotos(viewer: { swipeEnabled: number | boolean; banned?: number | boolean }, viewerHasPhoto: boolean): boolean {
  return !!viewer.swipeEnabled && !viewer.banned && viewerHasPhoto;
}

// --- Swipe ----------------------------------------------------------------

/** Cuántas tarjetas se piden por vez. */
export const SWIPE_DECK_SIZE = 12;

export const SWIPE_REPORT_REASONS = [
  'Datos personales en la foto o el alias',
  'Foto inapropiada',
  'Me hizo sentir incómodo/a',
] as const;

// --- Busco (filtro mutuo del swipe) ----------------------------------------
//
// Cada perfil dice a quién quiere conocer. En el swipe solo aparece alguien si
// los dos se buscan: yo busco lo que la otra persona es, y ella busca lo que soy
// yo (como en las apps de citas). Se guarda como texto «mujer,hombre,pareja_mixta».

export const LOOKING_FOR_KEYS = ['mujer', 'hombre', 'no_binario', 'pareja_mixta', 'pareja_chicas', 'pareja_chicos'] as const;
export type LookingKey = (typeof LOOKING_FOR_KEYS)[number];
export const LOOKING_LABELS: Record<LookingKey, string> = {
  mujer: 'Mujeres', hombre: 'Hombres', no_binario: 'Personas no binarias',
  pareja_mixta: 'Parejas chica + chico', pareja_chicas: 'Parejas de chicas', pareja_chicos: 'Parejas de chicos',
};
const PAREJAS: LookingKey[] = ['pareja_mixta', 'pareja_chicas', 'pareja_chicos'];

export const DEFAULT_LOOKING_FOR: LookingKey[] = [...LOOKING_FOR_KEYS];

/** Lo guardado → la lista. Lo de antes sigue valiendo: «pareja» = las tres parejas, y la lista completa vieja
 * («hombre,mujer,pareja», el valor por defecto) era «todos», así que también incluye a las personas no binarias. */
export function parseLookingFor(raw: string | null | undefined): LookingKey[] {
  const tokens = (raw ?? '').split(',').map((x) => x.trim()).filter(Boolean);
  const legacyAll = ['hombre', 'mujer', 'pareja'].every((t) => tokens.includes(t));
  const out = new Set<LookingKey>(legacyAll ? LOOKING_FOR_KEYS : []);
  for (const t of tokens) {
    if (t === 'pareja') PAREJAS.forEach((k) => out.add(k));
    else if ((LOOKING_FOR_KEYS as readonly string[]).includes(t)) out.add(t as LookingKey);
  }
  return out.size > 0 ? LOOKING_FOR_KEYS.filter((k) => out.has(k)) : [...DEFAULT_LOOKING_FOR];
}

export function serializeLookingFor(list: readonly string[]): string {
  return parseLookingFor(list.join(',')).join(',');
}

/** Lo que alguien «es» para el filtro. Una pareja de antes (sin tipo) cuenta como cualquier pareja. */
export function identitiesOf(p: { gender: string; pairType?: string | null }): LookingKey[] {
  if (p.gender === 'pareja') return p.pairType && (PAIR_TYPES as readonly string[]).includes(p.pairType) ? [`pareja_${p.pairType}` as LookingKey] : PAREJAS;
  return (LOOKING_FOR_KEYS as readonly string[]).includes(p.gender) ? [p.gender as LookingKey] : [];
}

type Seeker = { gender: string; pairType?: string | null; lookingFor: string | null | undefined };

/** ¿`viewer` busca a alguien como `target`? */
export function wants(viewer: { lookingFor: string | null | undefined }, target: { gender: string; pairType?: string | null }): boolean {
  const mine = parseLookingFor(viewer.lookingFor);
  return identitiesOf(target).some((k) => mine.includes(k));
}

export function isMutualInterest(viewer: Seeker, target: Seeker): boolean {
  return wants(viewer, target) && wants(target, viewer);
}

// --- Orientación, cómo me relaciono y qué busco esta noche -------------------
//
// Todo opcional («Prefiero no decir» = no se guarda y no se muestra). Lo ven solo quienes ya entraron a la
// fiesta, igual que las fotos, y se borra con el perfil al cerrar la fiesta.

export const ORIENTATIONS = ['hetero', 'bi', 'gay', 'lesbiana', 'pan', 'curioso'] as const;
export type Orientation = (typeof ORIENTATIONS)[number];
export const ORIENTATION_LABELS: Record<Orientation, string> = { hetero: 'Hetero', bi: 'Bi', gay: 'Gay', lesbiana: 'Lesbiana', pan: 'Pansexual', curioso: 'Curiosidad' };

export const RELATION_STYLES = ['monogamia', 'abierta', 'no_monogamia', 'poliamor', 'explorando'] as const;
export type RelationStyle = (typeof RELATION_STYLES)[number];
export const RELATION_LABELS: Record<RelationStyle, string> = {
  monogamia: 'Monogamia', abierta: 'Pareja abierta', no_monogamia: 'No monogamia', poliamor: 'Poliamor', explorando: 'Explorando',
};

export const INTENTS = ['amistad', 'conversar', 'bailar', 'coquetear', 'cita', 'casual', 'fantasia', 'explorar'] as const;
export type Intent = (typeof INTENTS)[number];
export const INTENT_LABELS: Record<Intent, string> = {
  amistad: 'Amistad', conversar: 'Conversar', bailar: 'Bailar', coquetear: 'Coquetear',
  cita: 'Una cita', casual: 'Algo casual', fantasia: 'Cumplir una fantasía', explorar: 'Explorar algo nuevo',
};
export const INTENT_EMOJI: Record<Intent, string> = {
  amistad: '🤝', conversar: '💬', bailar: '💃', coquetear: '😏', cita: '🌙', casual: '🔥', fantasia: '✨', explorar: '🧭',
};
export const MAX_INTENTS = 4;

export function cleanOrientation(v: unknown): Orientation | null {
  return typeof v === 'string' && (ORIENTATIONS as readonly string[]).includes(v) ? (v as Orientation) : null;
}
export function cleanRelationStyle(v: unknown): RelationStyle | null {
  return typeof v === 'string' && (RELATION_STYLES as readonly string[]).includes(v) ? (v as RelationStyle) : null;
}
export function cleanPairType(v: unknown): PairType | null {
  return typeof v === 'string' && (PAIR_TYPES as readonly string[]).includes(v) ? (v as PairType) : null;
}
/** Texto guardado o lista → intenciones válidas, sin repetir, en el orden de la lista y hasta 4. */
export function parseIntents(raw: string | readonly string[] | null | undefined): Intent[] {
  const list = typeof raw === 'string' ? raw.split(',') : (raw ?? []);
  const set = new Set(list.map((x) => x.trim()));
  return INTENTS.filter((i) => set.has(i)).slice(0, MAX_INTENTS);
}
export function serializeIntents(list: readonly string[]): string | null {
  const clean = parseIntents(list);
  return clean.length ? clean.join(',') : null;
}

const OPEN_STYLES: RelationStyle[] = ['abierta', 'no_monogamia', 'poliamor'];

type Vibe = { relationStyle?: string | null; intents?: string | null };

/** Qué tan compatibles son dos perfiles y qué tienen «en común» (lo que se destaca en la tarjeta). Ordena el mazo:
 * nunca saca a nadie (eso lo hace «Busco conocer»). */
export function compatibility(a: Vibe, b: Vibe): { score: number; common: string[] } {
  const ia = parseIntents(a.intents);
  const ib = parseIntents(b.intents);
  const common: string[] = [];
  let score = 0;
  for (const i of ia) if (ib.includes(i)) { score += 2; common.push(INTENT_LABELS[i]); }

  const ra = cleanRelationStyle(a.relationStyle);
  const rb = cleanRelationStyle(b.relationStyle);
  if (ra && rb) {
    if (ra === rb && ra !== 'explorando') { score += 2; common.push(RELATION_LABELS[ra]); }
    else if (OPEN_STYLES.includes(ra) && OPEN_STYLES.includes(rb)) { score += 2; common.push('Relaciones abiertas'); }
    else if (ra === 'explorando' || rb === 'explorando') score += 1;
    else score -= 2; // monogamia frente a una relación abierta
  }

  // Quien solo busca amistad, mejor con quien también la busca.
  const onlyFriends = (x: Intent[]) => x.length === 1 && x[0] === 'amistad';
  if ((onlyFriends(ia) && !ib.includes('amistad')) || (onlyFriends(ib) && !ia.includes('amistad'))) score -= 3;

  return { score, common };
}

// --- Mi disfraz -------------------------------------------------------------

export const MAX_COSTUME_LENGTH = 40;

/** El disfraz lo ve toda la fiesta: mismas reglas que el alias (sin arrobas, links ni teléfonos).
 * Vacío = sin disfraz (`null`). */
export function sanitizeCostume(raw: string | null | undefined): { ok: true; costume: string | null } | { ok: false; reason: string } {
  const costume = (raw ?? '').replace(/\s+/g, ' ').trim();
  if (!costume) return { ok: true, costume: null };
  if (costume.length > MAX_COSTUME_LENGTH) return { ok: false, reason: `Máximo ${MAX_COSTUME_LENGTH} caracteres` };
  for (const { re, reason } of ALIAS_FORBIDDEN) {
    if (re.test(costume)) return { ok: false, reason: reason.replace('en el alias', 'en el disfraz') };
  }
  return { ok: true, costume };
}

// --- Votar «Mejor disfraz» (aniversario Halloween) --------------------------------------

/** Votos por persona y por noche. Pocos a propósito: el voto vale porque hay que elegir. */
export const MAX_COSTUME_VOTES_PER_EVENT = 3;

export function costumeVotesLeft(used: number): number {
  return Math.max(0, MAX_COSTUME_VOTES_PER_EVENT - used);
}
