/** Reglas de "Caramelo", la capa social que vive solo mientras dura la
 * fiesta -- compartidas entre servidor y cliente. El servidor las aplica
 * como autorización real (esconder un botón no protege nada); el cliente
 * las usa para no mostrar la puerta abierta cuando está cerrada. */

// --- Constantes de política ---

/** Tope de toques por persona y por noche (decisión del dueño). Es lo que
 * hace que recibir un toque signifique algo: sin tope, una sola persona
 * mandando 80 convierte la función en spam la primera noche. */
export const MAX_TOUCHES_PER_EVENT = 15;

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

export const PARTY_GENDERS = ['hombre', 'mujer', 'pareja'] as const;
export type PartyGender = (typeof PARTY_GENDERS)[number];

/** 4 avatares por género, dibujados en SVG (client/src/components/party). */
export const AVATARS_PER_GENDER = 4;

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

export function sanitizeMessage(raw: string): { ok: true; body: string } | { ok: false; reason: string } {
  const body = raw.replace(/\s+/g, ' ').trim();
  if (!body) return { ok: false, reason: 'El mensaje está vacío' };
  if (body.length > MAX_MESSAGE_LENGTH) return { ok: false, reason: `Máximo ${MAX_MESSAGE_LENGTH} caracteres` };
  return { ok: true, body };
}
