/* Playmatch por dentro del bolsillo: Super Likes pagados, «Ver quién me dio ♥», la galería de disfraces, la
 * afinidad y lo que controla el administrador. Acá vive lo PURO (precios, topes, cuánto sale de cada saldo,
 * el porcentaje de afinidad); el servidor lo aplica como autorización real (server/playmatchMarket.ts) y el
 * cliente lo usa para no mostrar lo que no se puede. */

import { parseIntents, cleanRelationStyle, type RelationStyle } from './party';

/** Super Likes gratis por persona y noche: el primero no cuesta. */
export const FREE_SUPER_LIKES = 1;

/** Cuántos Super Likes comprados se pueden usar en una noche (el gratis va aparte). */
export const DEFAULT_MAX_PAID_SUPER_LIKES = 10;
export const DEFAULT_SUPER_LIKE_PRICE = 500;
export const DEFAULT_SUPER_LIKE_PACK_SIZE = 10;
export const DEFAULT_SUPER_LIKE_PACK_PRICE = 2500;
export const DEFAULT_LIKES_UNLOCK_PRICE = 300;

/** Con cuánta afinidad vale la pena un aviso («Alguien muy afín llegó») y cuántos avisos por noche. */
export const AFFINITY_ALERT_MIN = 80;
export const MAX_AFFINITY_ALERTS = 2;

/** Todo lo que el administrador prende, apaga o cambia en vivo, por fiesta. */
export interface PlaymatchConfig {
  /** Playmatch completo: apagado, nadie puede deslizar ni escribir (el perfil y la inscripción siguen). */
  enabled: boolean;
  superLikes: boolean;
  likesUnlock: boolean;
  /** La galería «Disfraces» y sus votos. */
  costumes: boolean;
  /** El podio ya se mostró a todos (hasta entonces el ranking no lo ve nadie, solo el administrador). */
  costumeRevealed: boolean;
  superLikePrice: number;
  superLikePackSize: number;
  superLikePackPrice: number;
  maxPaidSuperLikes: number;
  likesUnlockPrice: number;
  /** La meta de la noche de los anfitriones. */
  hostGoal: { profiles: number; photos: number; matches: number };
}

export const DEFAULT_PLAYMATCH_CONFIG: PlaymatchConfig = {
  enabled: true,
  superLikes: true,
  likesUnlock: true,
  costumes: true,
  costumeRevealed: false,
  superLikePrice: DEFAULT_SUPER_LIKE_PRICE,
  superLikePackSize: DEFAULT_SUPER_LIKE_PACK_SIZE,
  superLikePackPrice: DEFAULT_SUPER_LIKE_PACK_PRICE,
  maxPaidSuperLikes: DEFAULT_MAX_PAID_SUPER_LIKES,
  likesUnlockPrice: DEFAULT_LIKES_UNLOCK_PRICE,
  hostGoal: { profiles: 100, photos: 80, matches: 40 },
};

function bool(v: unknown, fallback: boolean): boolean {
  return typeof v === 'boolean' ? v : fallback;
}
function int(v: unknown, fallback: number, min: number, max: number): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : fallback;
}

/** Lo guardado (o nada) → una config completa y dentro de límites razonables. */
export function normalizePlaymatchConfig(raw: unknown): PlaymatchConfig {
  // Según el motor, una columna JSON llega ya leída (objeto) o como texto.
  if (typeof raw === 'string') { try { raw = JSON.parse(raw); } catch { raw = null; } }
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const d = DEFAULT_PLAYMATCH_CONFIG;
  const goal = (r.hostGoal && typeof r.hostGoal === 'object' ? r.hostGoal : {}) as Record<string, unknown>;
  return {
    enabled: bool(r.enabled, d.enabled),
    superLikes: bool(r.superLikes, d.superLikes),
    likesUnlock: bool(r.likesUnlock, d.likesUnlock),
    costumes: bool(r.costumes, d.costumes),
    costumeRevealed: bool(r.costumeRevealed, d.costumeRevealed),
    superLikePrice: int(r.superLikePrice, d.superLikePrice, 0, 50_000),
    superLikePackSize: int(r.superLikePackSize, d.superLikePackSize, 2, 50),
    superLikePackPrice: int(r.superLikePackPrice, d.superLikePackPrice, 0, 500_000),
    maxPaidSuperLikes: int(r.maxPaidSuperLikes, d.maxPaidSuperLikes, 0, 100),
    likesUnlockPrice: int(r.likesUnlockPrice, d.likesUnlockPrice, 0, 50_000),
    hostGoal: {
      profiles: int(goal.profiles, d.hostGoal.profiles, 1, 5000),
      photos: int(goal.photos, d.hostGoal.photos, 1, 5000),
      matches: int(goal.matches, d.hostGoal.matches, 1, 5000),
    },
  };
}

/** Lo que el cliente necesita saber de la config (no incluye metas ni nada del equipo). */
export function publicPlaymatchConfig(c: PlaymatchConfig) {
  return {
    enabled: c.enabled, superLikes: c.superLikes, likesUnlock: c.likesUnlock, costumes: c.costumes, costumeRevealed: c.costumeRevealed,
    superLikePrice: c.superLikePrice, superLikePackSize: c.superLikePackSize, superLikePackPrice: c.superLikePackPrice,
    maxPaidSuperLikes: c.maxPaidSuperLikes, likesUnlockPrice: c.likesUnlockPrice,
  };
}
export type PublicPlaymatchConfig = ReturnType<typeof publicPlaymatchConfig>;

// --- Super Likes ----------------------------------------------------------------

/** Qué se descuenta al mandar un Super Like: el gratis, uno comprado (o regalado), o hay que comprar. */
export type SuperLikePlan = 'free' | 'credit' | 'needs_purchase';

export function superLikePlan(sent: number, credits: number): SuperLikePlan {
  if (sent < FREE_SUPER_LIKES) return 'free';
  return credits > 0 ? 'credit' : 'needs_purchase';
}

/** Cuántos Super Likes comprados puede sumar todavía esta persona (el administrador puede subirle o bajarle el tope). */
export function paidSuperLikesLeft(cfg: Pick<PlaymatchConfig, 'maxPaidSuperLikes'>, bought: number, personalCap: number | null | undefined): number {
  const cap = personalCap ?? cfg.maxPaidSuperLikes;
  return Math.max(0, cap - bought);
}

/** Cuánto cuesta una cantidad: los packs completos a su precio y el resto suelto. */
export function superLikesPrice(cfg: Pick<PlaymatchConfig, 'superLikePrice' | 'superLikePackSize' | 'superLikePackPrice'>, quantity: number): number {
  const q = Math.max(0, Math.floor(quantity));
  const packs = Math.floor(q / cfg.superLikePackSize);
  return packs * cfg.superLikePackPrice + (q % cfg.superLikePackSize) * cfg.superLikePrice;
}

export interface SuperLikeOffer { key: 'one' | 'pack'; quantity: number; price: number; label: string }

/** Las dos formas de comprar que se le ofrecen: uno suelto, y el pack si todavía le cabe entero. */
export function superLikeOffers(cfg: PlaymatchConfig, left: number): SuperLikeOffer[] {
  const out: SuperLikeOffer[] = [];
  if (left >= 1) out.push({ key: 'one', quantity: 1, price: cfg.superLikePrice, label: '1 Super Like' });
  if (left >= cfg.superLikePackSize) out.push({ key: 'pack', quantity: cfg.superLikePackSize, price: cfg.superLikePackPrice, label: `Pack de ${cfg.superLikePackSize}` });
  return out;
}

// --- Cobro --------------------------------------------------------------------

export interface PaymentSplit {
  /** Playcoins que se descuentan (1 Playcoin = $1). */
  coins: number;
  /** Pesos que salen del saldo PlayCard. */
  saldo: number;
  /** Lo que falta (si es > 0, hay que recargar el saldo y no se cobra nada). */
  missing: number;
}

/** Primero Playcoins; lo que falte, del saldo. Si no alcanza entre los dos, no se descuenta nada y se dice cuánto falta. */
export function splitPayment(amount: number, playcoins: number, prepaid: number): PaymentSplit {
  const price = Math.max(0, Math.floor(amount));
  const coins = Math.min(Math.max(0, Math.floor(playcoins)), price);
  const rest = price - coins;
  const saldo = Math.min(Math.max(0, Math.floor(prepaid)), rest);
  const missing = rest - saldo;
  return missing > 0 ? { coins: 0, saldo: 0, missing } : { coins, saldo, missing: 0 };
}

export function describePayment(split: Pick<PaymentSplit, 'coins' | 'saldo'>): string {
  const parts: string[] = [];
  if (split.coins > 0) parts.push(`${split.coins.toLocaleString('es-CL')} Playcoins`);
  if (split.saldo > 0) parts.push(`$${split.saldo.toLocaleString('es-CL')} de saldo`);
  return parts.join(' + ') || 'gratis';
}

// --- Afinidad --------------------------------------------------------------------

type Match = { intents?: string | readonly string[] | null; relationStyle?: string | null; zone?: string | null };

const OPEN: RelationStyle[] = ['abierta', 'no_monogamia', 'poliamor'];

/** Qué tan afines son dos personas, de 30 a 99. `null` si ninguna contó nada con qué comparar (mejor no mostrar un
 * número inventado). Cuenta lo que buscan esta noche (lo que más pesa), cómo se relacionan y si están en la misma zona. */
export function affinityPercent(a: Match, b: Match): number | null {
  const ia = parseIntents(a.intents as string);
  const ib = parseIntents(b.intents as string);
  const ra = cleanRelationStyle(a.relationStyle);
  const rb = cleanRelationStyle(b.relationStyle);
  let weight = 0;
  let got = 0;
  if (ia.length > 0 && ib.length > 0) {
    const shared = ia.filter((i) => ib.includes(i)).length;
    const onlyFriends = (x: string[]) => x.length === 1 && x[0] === 'amistad';
    const mismatch = (onlyFriends(ia) && !ib.includes('amistad')) || (onlyFriends(ib) && !ia.includes('amistad'));
    weight += 60;
    got += mismatch ? 0 : 60 * (shared / Math.min(ia.length, ib.length));
  }
  if (ra && rb) {
    weight += 25;
    if (ra === rb && ra !== 'explorando') got += 25;
    else if (OPEN.includes(ra) && OPEN.includes(rb)) got += 22;
    else if (ra === 'explorando' || rb === 'explorando') got += 12;
  }
  if (weight === 0) return null;
  if (a.zone && b.zone) { weight += 15; if (a.zone === b.zone) got += 15; }
  return Math.round(30 + 69 * (got / weight));
}

// --- El cargo de los anfitriones ---------------------------------------------------

export const PLAYMATCH_HOST_CARGO = 'anfitrion_playmatch';

// --- Disfraces -----------------------------------------------------------------------

export interface CostumeStanding { profileId: number; votes: number; place: number }

/** Posiciones con empates (1, 2, 2, 4): quien tiene los mismos votos comparte el lugar. Orden por votos y, a igualdad, por id. */
export function standings(rows: { profileId: number; votes: number }[]): CostumeStanding[] {
  const sorted = [...rows].sort((a, b) => b.votes - a.votes || a.profileId - b.profileId);
  let place = 0;
  return sorted.map((r, i) => {
    if (i === 0 || r.votes !== sorted[i - 1].votes) place = i + 1;
    return { profileId: r.profileId, votes: r.votes, place };
  });
}
