/* Playmatch por dentro del bolsillo (shared/playmatchMarket.ts tiene las reglas puras): cobrar Super Likes y «Ver quién
 * me dio ♥» con Playcoins y, si faltan, saldo PlayCard; la galería de disfraces; lo que ve el administrador (conteo,
 * ingresos, regalos y devoluciones); lo que necesitan los anfitriones; y el aviso «Alguien muy afín llegó».
 *
 * Todo cobro va en UNA transacción (el cobro, los libros de Playcoins y saldo, el cargo de Playmatch y el crédito):
 * o pasa todo o no pasa nada, y el `opId` evita cobrar dos veces el mismo toque. */
import { and, asc, desc, eq, gte, gt, inArray, isNotNull, like, ne, or, sql } from "drizzle-orm";
import {
  appDevices, customers, orders, partyCharges, partyConnections, partyCostumeVotes, partyMessages, partyPhotos, partyProfiles, partyPushSubscriptions,
  partySwipes, playcoinsLedger, prepaidLedger, ticketTypes, tickets,
} from "../drizzle/schema";
import {
  getDb as openDb, getPartyConfig, getPartyConnectionsFor, getPartyHiddenIds, partyVibe,
} from "./db";
import { identityFromTicketCode } from "./playcardTopup";
import { ensurePartyIdentitySchema, playmatchWalletReady } from "./partySchema";
import { sendPushToProfile } from "./push";
import {
  AFFINITY_ALERT_MIN, FREE_SUPER_LIKES, MAX_AFFINITY_ALERTS, affinityPercent, describePayment, paidSuperLikesLeft, splitPayment,
  superLikeOffers, superLikesPrice, standings, type PlaymatchConfig,
} from "../shared/playmatchMarket";
import { PRESENCE_WINDOW_MS, compatibility, isMutualInterest, wants, type PartyGender, type PartyZone } from "../shared/party";

type Db = NonNullable<Awaited<ReturnType<typeof openDb>>>;

/** La base, con las columnas y tablas de Playmatch ya al día (server/partySchema.ts): casi siempre ya lo están y no cuesta nada;
 * solo el primer arranque tras publicar espera. Todo lo de este archivo pasa por acá. */
async function getDb(): Promise<Db | null> {
  const db = await openDb();
  if (db) await ensurePartyIdentitySchema(db);
  return db;
}
/** Filas que tocó un UPDATE/DELETE: mysql2 devuelve `[cabecera, campos]`, y la cabecera trae `affectedRows`. */
const affected = (res: unknown): number => {
  const head = Array.isArray(res) ? res[0] : res;
  return Number((head as { affectedRows?: number } | undefined)?.affectedRows ?? 0);
};
/** Clave repetida: drizzle envuelve el error de MySQL, el código vive en `cause`. */
const isDuplicate = (err: any): boolean =>
  err?.code === 'ER_DUP_ENTRY' || err?.errno === 1062 || /duplicate entry/i.test(String(err?.message ?? '')) || (err?.cause ? isDuplicate(err.cause) : false);

class Short extends Error { constructor(readonly missing: number) { super('saldo'); } }

// --- La billetera de quien juega --------------------------------------------------------

export interface Wallet { customerId: number | null; email: string | null; playcoins: number; prepaid: number }

/** Playcoins y saldo del dueño de esa entrada (la misma identidad con que se recarga la PlayCard desde el link de la entrada). */
export async function walletForTicketCode(ticketCode: string): Promise<Wallet> {
  const db = await getDb();
  const identity = await identityFromTicketCode(ticketCode).catch(() => null);
  if (!db || !identity) return { customerId: null, email: null, playcoins: 0, prepaid: 0 };
  const [c] = await db.select({ id: customers.id, playcoins: customers.playcoins, prepaid: customers.prepaidBalance })
    .from(customers).where(eq(customers.email, identity.email)).limit(1);
  return { customerId: c?.id ?? null, email: identity.email, playcoins: c?.playcoins ?? 0, prepaid: c?.prepaid ?? 0 };
}

// --- Estado de los Super Likes de una persona -----------------------------------------

export async function superLikeStatus(profile: { id: number; eventId: number }, ticketCode: string) {
  const db = await getDb();
  if (!db) return null;
  const cfg = await getPartyConfig(profile.eventId);
  const [me] = await db.select().from(partyProfiles).where(eq(partyProfiles.id, profile.id)).limit(1);
  if (!me) return null;
  const connections = await getPartyConnectionsFor(db, profile.id);
  const sent = connections.filter((c: any) => c.initiatedById === profile.id && !c.viaSwipe).length;
  const left = paidSuperLikesLeft(cfg, me.superLikeBought, me.superLikeCap);
  const wallet = await walletForTicketCode(ticketCode);
  return {
    sent,
    freeLeft: Math.max(0, FREE_SUPER_LIKES - sent),
    credits: me.superLikeCredits,
    available: Math.max(0, FREE_SUPER_LIKES - sent) + me.superLikeCredits,
    bought: me.superLikeBought,
    paidLeft: left,
    offers: cfg.superLikes ? superLikeOffers(cfg, left) : [],
    wallet: { playcoins: wallet.playcoins, saldo: wallet.prepaid },
    likesUnlocked: !!me.likesUnlocked,
    likesUnlockPrice: cfg.likesUnlockPrice,
  };
}

// --- Cobrar --------------------------------------------------------------------------

export type ChargeResult =
  | { ok: true; paid: { coins: number; saldo: number }; price: number; text: string; duplicate?: boolean }
  | { ok: false; code: 'paused' | 'cap' | 'wallet' | 'saldo' | 'invalid'; reason: string; missing?: number; price?: number };

interface ChargeParams {
  profile: { id: number; eventId: number };
  ticketCode: string;
  kind: 'superlike' | 'likes_unlock';
  quantity: number;
  price: number;
  opId: string;
  note: string;
  /** Lo que se otorga, dentro de la misma transacción. */
  grant: (tx: any) => Promise<void>;
}

/** Cobra `price` (Playcoins primero, el resto del saldo) y otorga lo comprado, todo o nada. */
async function charge(p: ChargeParams): Promise<ChargeResult> {
  const db = await getDb();
  if (!db) return { ok: false, code: 'invalid', reason: 'Base de datos no disponible' };
  if (!/^[A-Za-z0-9_-]{8,30}$/.test(p.opId)) return { ok: false, code: 'invalid', reason: 'Pedido inválido' };
  const opKey = `pm-${p.opId}`;

  const [dup] = await db.select().from(partyCharges).where(eq(partyCharges.opId, opKey)).limit(1);
  if (dup) return { ok: true, paid: { coins: dup.coins, saldo: dup.saldo }, price: dup.amountClp, text: describePayment(dup), duplicate: true };

  if (p.price <= 0) {
    try {
      await db.transaction(async (tx) => {
        await tx.insert(partyCharges).values({ eventId: p.profile.eventId, profileId: p.profile.id, kind: p.kind, quantity: p.quantity, amountClp: 0, opId: opKey, note: p.note });
        await p.grant(tx);
      });
    } catch (err) { if (!isDuplicate(err)) throw err; }
    return { ok: true, paid: { coins: 0, saldo: 0 }, price: 0, text: 'gratis' };
  }

  // Nunca se descuenta plata si no se puede anotar en los libros (valores nuevos del enum sin aplicar todavía).
  if (!playmatchWalletReady()) return { ok: false, code: 'wallet', reason: 'Los pagos de Playmatch se están activando. Intenta de nuevo en un minuto.' };

  const wallet = await walletForTicketCode(p.ticketCode);
  if (wallet.customerId === null) return { ok: false, code: 'saldo', reason: 'Recarga tu saldo para pagar', missing: p.price, price: p.price };
  const split = splitPayment(p.price, wallet.playcoins, wallet.prepaid);
  if (split.missing > 0) return { ok: false, code: 'saldo', reason: 'Te falta saldo', missing: split.missing, price: p.price };

  try {
    await db.transaction(async (tx) => {
      // El cargo va primero: si el mismo toque llega dos veces, el índice único de `opId` corta acá, antes de tocar plata.
      await tx.insert(partyCharges).values({
        eventId: p.profile.eventId, profileId: p.profile.id, kind: p.kind, quantity: p.quantity,
        amountClp: p.price, coins: split.coins, saldo: split.saldo, opId: opKey, note: p.note,
      });
      // Descuentos condicionales (`>=`): el motor garantiza que nunca queda en negativo, aunque el saldo haya cambiado
      // entre leerlo y cobrarlo.
      if (split.coins > 0) {
        const res = await tx.update(customers).set({ playcoins: sql`${customers.playcoins} - ${split.coins}` })
          .where(and(eq(customers.id, wallet.customerId!), gte(customers.playcoins, split.coins)));
        if (affected(res) === 0) throw new Short(p.price);
        const [c] = await tx.select({ v: customers.playcoins }).from(customers).where(eq(customers.id, wallet.customerId!)).limit(1);
        await tx.insert(playcoinsLedger).values({ customerId: wallet.customerId!, delta: -split.coins, reason: 'spend_playmatch', opId: opKey, balanceAfter: c!.v, note: p.note });
      }
      if (split.saldo > 0) {
        const res = await tx.update(customers).set({ prepaidBalance: sql`${customers.prepaidBalance} - ${split.saldo}` })
          .where(and(eq(customers.id, wallet.customerId!), gte(customers.prepaidBalance, split.saldo)));
        if (affected(res) === 0) throw new Short(split.saldo);
        const [c] = await tx.select({ v: customers.prepaidBalance }).from(customers).where(eq(customers.id, wallet.customerId!)).limit(1);
        await tx.insert(prepaidLedger).values({ customerId: wallet.customerId!, delta: -split.saldo, reason: 'spend_playmatch', opId: opKey, balanceAfter: c!.v, note: p.note });
      }
      await p.grant(tx);
    });
  } catch (err) {
    if (err instanceof Short) return { ok: false, code: 'saldo', reason: 'Te falta saldo', missing: err.missing, price: p.price };
    if (isDuplicate(err)) {
      const [again] = await db.select().from(partyCharges).where(eq(partyCharges.opId, opKey)).limit(1);
      if (again) return { ok: true, paid: { coins: again.coins, saldo: again.saldo }, price: again.amountClp, text: describePayment(again), duplicate: true };
    }
    throw err;
  }
  return { ok: true, paid: { coins: split.coins, saldo: split.saldo }, price: p.price, text: describePayment(split) };
}

/** Comprar Super Likes. `quantity` entre 1 y el pack; no se pasa del tope de la noche. */
export async function buySuperLikes(params: { profile: { id: number; eventId: number }; ticketCode: string; quantity: number; opId: string }): Promise<ChargeResult & { credits?: number }> {
  const db = await getDb();
  if (!db) return { ok: false, code: 'invalid', reason: 'Base de datos no disponible' };
  const cfg = await getPartyConfig(params.profile.eventId);
  if (!cfg.superLikes) return { ok: false, code: 'paused', reason: 'Los Super Likes están en pausa por ahora' };
  const [me] = await db.select().from(partyProfiles).where(eq(partyProfiles.id, params.profile.id)).limit(1);
  if (!me) return { ok: false, code: 'invalid', reason: 'No encontramos tu perfil' };
  const q = Math.floor(params.quantity);
  if (!Number.isFinite(q) || q < 1 || q > cfg.superLikePackSize) return { ok: false, code: 'invalid', reason: 'Cantidad inválida' };
  const left = paidSuperLikesLeft(cfg, me.superLikeBought, me.superLikeCap);
  if (q > left) return { ok: false, code: 'cap', reason: left === 0 ? `Ya compraste tus ${me.superLikeBought} Super Likes de esta noche` : `Solo puedes comprar ${left} más esta noche` };

  const res = await charge({
    profile: params.profile, ticketCode: params.ticketCode, kind: 'superlike', quantity: q,
    price: superLikesPrice(cfg, q), opId: params.opId, note: `Playmatch: ${q === 1 ? '1 Super Like' : `${q} Super Likes`}`,
    grant: async (tx) => {
      await tx.update(partyProfiles).set({ superLikeCredits: sql`${partyProfiles.superLikeCredits} + ${q}`, superLikeBought: sql`${partyProfiles.superLikeBought} + ${q}` })
        .where(eq(partyProfiles.id, params.profile.id));
    },
  });
  if (!res.ok) return res;
  const [after] = await db.select({ c: partyProfiles.superLikeCredits }).from(partyProfiles).where(eq(partyProfiles.id, params.profile.id)).limit(1);
  return { ...res, credits: after?.c ?? 0 };
}

// --- Ver quién me dio ♥ -------------------------------------------------------------

/** Cuántas fotos tiene cada perfil (para el carrusel de la tarjeta). */
async function photoCounts(db: Db, ids: number[]): Promise<Map<number, number>> {
  if (ids.length === 0) return new Map();
  const rows = await db.select({ profileId: partyPhotos.profileId, n: sql<number>`count(*)` }).from(partyPhotos)
    .where(inArray(partyPhotos.profileId, ids)).groupBy(partyPhotos.profileId);
  return new Map<number, number>(rows.map((r: any) => [r.profileId as number, Number(r.n)]));
}

/** Quiénes me dieron ♥ y todavía no veo: no los deslicé, no hay conexión, no están ocultos y yo los busco. */
async function likesForMeProfiles(db: Db, me: any) {
  const [likes, mine, connections, hidden] = await Promise.all([
    db.select({ from: partySwipes.fromProfileId }).from(partySwipes).where(and(eq(partySwipes.toProfileId, me.id), eq(partySwipes.liked, 1))),
    db.select({ to: partySwipes.toProfileId }).from(partySwipes).where(eq(partySwipes.fromProfileId, me.id)),
    getPartyConnectionsFor(db, me.id),
    getPartyHiddenIds(db, me.id),
  ]);
  const seen = new Set<number>([...mine.map((m: any) => m.to), ...Array.from(hidden)]);
  for (const c of connections) seen.add(c.profileLowId === me.id ? c.profileHighId : c.profileLowId);
  const ids = Array.from(new Set(likes.map((l: any) => l.from as number))).filter((id) => !seen.has(id));
  if (ids.length === 0) return [];
  const rows = await db.select().from(partyProfiles).where(and(
    inArray(partyProfiles.id, ids), eq(partyProfiles.eventId, me.eventId), eq(partyProfiles.active, 1), eq(partyProfiles.banned, 0), eq(partyProfiles.swipeEnabled, 1),
  ));
  return rows.filter((p: any) => isMutualInterest(me, p));
}

/** La cantidad siempre; los perfiles solo si pagó el desbloqueo de esta noche. */
export async function listLikesForMe(profile: { id: number; eventId: number }) {
  const db = await getDb();
  if (!db) return { count: 0, unlocked: false, people: [] as LikeCard[] };
  const [me] = await db.select().from(partyProfiles).where(eq(partyProfiles.id, profile.id)).limit(1);
  if (!me) return { count: 0, unlocked: false, people: [] as LikeCard[] };
  const rows = await likesForMeProfiles(db, me);
  const unlocked = !!me.likesUnlocked;
  if (!unlocked) return { count: rows.length, unlocked, people: [] as LikeCard[] };
  const photoCount = await photoCounts(db, rows.map((r: any) => r.id as number));
  const people: LikeCard[] = rows.map((p: any) => ({
    id: p.id as number, alias: p.alias as string, gender: p.gender as PartyGender, avatarId: p.avatarId as number, zone: p.zone as PartyZone,
    costume: (p.costume as string | null) ?? null, photoCount: photoCount.get(p.id) ?? 1,
    ...partyVibe(p),
    common: compatibility(me, p).common,
    affinity: affinityPercent({ ...me, zone: me.zone }, { ...p, zone: p.zone }),
  })).sort((a, b) => (b.affinity ?? 0) - (a.affinity ?? 0));
  return { count: rows.length, unlocked, people };
}

export interface LikeCard {
  id: number; alias: string; gender: PartyGender; avatarId: number; zone: PartyZone; costume: string | null; photoCount: number;
  pairType: string | null; orientation: string | null; relationStyle: string | null; intents: string[]; common: string[]; affinity: number | null;
}

export async function unlockLikes(params: { profile: { id: number; eventId: number }; ticketCode: string; opId: string }): Promise<ChargeResult> {
  const db = await getDb();
  if (!db) return { ok: false, code: 'invalid', reason: 'Base de datos no disponible' };
  const cfg = await getPartyConfig(params.profile.eventId);
  if (!cfg.likesUnlock) return { ok: false, code: 'paused', reason: 'Esta opción está en pausa por ahora' };
  const [me] = await db.select({ u: partyProfiles.likesUnlocked }).from(partyProfiles).where(eq(partyProfiles.id, params.profile.id)).limit(1);
  if (me?.u) return { ok: true, paid: { coins: 0, saldo: 0 }, price: 0, text: 'ya desbloqueado', duplicate: true };
  return charge({
    profile: params.profile, ticketCode: params.ticketCode, kind: 'likes_unlock', quantity: 1, price: cfg.likesUnlockPrice, opId: params.opId,
    note: 'Playmatch: ver quién me dio ♥',
    grant: async (tx) => { await tx.update(partyProfiles).set({ likesUnlocked: 1 }).where(eq(partyProfiles.id, params.profile.id)); },
  });
}

// --- Galería de disfraces -----------------------------------------------------------------

export interface CostumeEntry { id: number; alias: string; costume: string; zone: PartyZone; gender: PartyGender; pairType: string | null; avatarId: number; photoCount: number }

/** Los disfraces de la fiesta para votar: personas adentro, con foto y con disfraz escrito, que yo puedo ver. */
export async function costumeGallery(viewer: { id: number; eventId: number }) {
  const db = await getDb();
  if (!db) return null;
  const cfg = await getPartyConfig(viewer.eventId);
  const hidden = await getPartyHiddenIds(db, viewer.id);
  const rows = await db.select().from(partyProfiles).where(and(
    eq(partyProfiles.eventId, viewer.eventId), eq(partyProfiles.active, 1), eq(partyProfiles.banned, 0), eq(partyProfiles.swipeEnabled, 1), isNotNull(partyProfiles.costume),
  ));
  const visible = rows.filter((p: any) => p.id !== viewer.id && !hidden.has(p.id) && String(p.costume ?? '').trim() !== '');
  const photoCount = await photoCounts(db, visible.map((r: any) => r.id as number));
  const people: CostumeEntry[] = visible.map((p: any) => ({
    id: p.id, alias: p.alias, costume: String(p.costume), zone: p.zone, gender: p.gender, pairType: p.pairType ?? null, avatarId: p.avatarId, photoCount: photoCount.get(p.id) ?? 1,
  })).sort((a, b) => a.costume.localeCompare(b.costume, 'es'));

  // El podio solo cuando el administrador lo revela: antes nadie lo ve (no se vota por quien va ganando).
  let podium: { place: number; votes: number; entry: CostumeEntry | null; mine: boolean }[] = [];
  if (cfg.costumeRevealed) {
    const votes = await db.select({ profileId: partyCostumeVotes.toProfileId, votes: sql<number>`count(*)` }).from(partyCostumeVotes)
      .where(eq(partyCostumeVotes.eventId, viewer.eventId)).groupBy(partyCostumeVotes.toProfileId);
    const top = standings(votes.map((v: any) => ({ profileId: v.profileId as number, votes: Number(v.votes) }))).filter((s) => s.place <= 3);
    const ids = top.map((t) => t.profileId);
    const prof = ids.length ? await db.select().from(partyProfiles).where(inArray(partyProfiles.id, ids)) : [];
    const byId = new Map<number, any>(prof.map((p: any) => [p.id, p]));
    podium = top.map((t) => {
      const p = byId.get(t.profileId);
      return {
        place: t.place, votes: t.votes, mine: t.profileId === viewer.id,
        entry: p ? { id: p.id, alias: p.alias, costume: String(p.costume ?? ''), zone: p.zone, gender: p.gender, pairType: p.pairType ?? null, avatarId: p.avatarId, photoCount: 1 } : null,
      };
    });
  }
  return { enabled: cfg.costumes, revealed: cfg.costumeRevealed, people, podium };
}

// --- Control del administrador ------------------------------------------------------------------

export async function adminStats(eventId: number) {
  const db = await getDb();
  if (!db) return null;
  const recent = new Date(Date.now() - PRESENCE_WINDOW_MS);
  const n = async (q: Promise<any[]>) => Number((await q)[0]?.n ?? 0);
  const [
    total, activeNow, withPhoto, swipers, likes, nopes, superLikes, matches, accepted, messages, votes, banned,
    chargesAgg, byKind, creditsGifted, returned, hourly,
  ] = await Promise.all([
    n(db.select({ n: sql<number>`count(*)` }).from(partyProfiles).where(eq(partyProfiles.eventId, eventId))),
    n(db.select({ n: sql<number>`count(*)` }).from(partyProfiles).where(and(eq(partyProfiles.eventId, eventId), eq(partyProfiles.active, 1), gte(partyProfiles.lastSeenAt, recent)))),
    n(db.select({ n: sql<number>`count(distinct ${partyPhotos.profileId})` }).from(partyPhotos).where(eq(partyPhotos.eventId, eventId))),
    n(db.select({ n: sql<number>`count(*)` }).from(partyProfiles).where(and(eq(partyProfiles.eventId, eventId), eq(partyProfiles.swipeEnabled, 1)))),
    n(db.select({ n: sql<number>`count(*)` }).from(partySwipes).where(and(eq(partySwipes.eventId, eventId), eq(partySwipes.liked, 1)))),
    n(db.select({ n: sql<number>`count(*)` }).from(partySwipes).where(and(eq(partySwipes.eventId, eventId), eq(partySwipes.liked, 0)))),
    n(db.select({ n: sql<number>`count(*)` }).from(partyConnections).where(and(eq(partyConnections.eventId, eventId), eq(partyConnections.viaSwipe, 0)))),
    n(db.select({ n: sql<number>`count(*)` }).from(partyConnections).where(and(eq(partyConnections.eventId, eventId), eq(partyConnections.status, 'accepted')))),
    n(db.select({ n: sql<number>`count(*)` }).from(partyConnections).where(and(eq(partyConnections.eventId, eventId), eq(partyConnections.status, 'accepted'), sql`EXISTS (SELECT 1 FROM partyMessages m WHERE m.connectionId = partyConnections.id)`))),
    n(db.select({ n: sql<number>`count(*)` }).from(partyMessages).innerJoin(partyConnections, eq(partyConnections.id, partyMessages.connectionId)).where(eq(partyConnections.eventId, eventId))),
    n(db.select({ n: sql<number>`count(*)` }).from(partyCostumeVotes).where(eq(partyCostumeVotes.eventId, eventId))),
    n(db.select({ n: sql<number>`count(*)` }).from(partyProfiles).where(and(eq(partyProfiles.eventId, eventId), eq(partyProfiles.banned, 1)))),
    db.select({ amount: sql<number>`coalesce(sum(amountClp),0)`, coins: sql<number>`coalesce(sum(coins),0)`, saldo: sql<number>`coalesce(sum(saldo),0)`, buyers: sql<number>`count(distinct profileId)` })
      .from(partyCharges).where(and(eq(partyCharges.eventId, eventId), inArray(partyCharges.kind, ['superlike', 'likes_unlock']))),
    db.select({ kind: partyCharges.kind, qty: sql<number>`coalesce(sum(quantity),0)`, amount: sql<number>`coalesce(sum(amountClp),0)`, count: sql<number>`count(*)` })
      .from(partyCharges).where(eq(partyCharges.eventId, eventId)).groupBy(partyCharges.kind),
    n(db.select({ n: sql<number>`coalesce(sum(quantity),0)` }).from(partyCharges).where(and(eq(partyCharges.eventId, eventId), eq(partyCharges.kind, 'gift')))),
    n(db.select({ n: sql<number>`coalesce(sum(quantity),0)` }).from(partyCharges).where(and(eq(partyCharges.eventId, eventId), eq(partyCharges.kind, 'return')))),
    // Hora de Chile (UTC−3 en la temporada de fiestas).
    db.select({ h: sql<number>`hour(convert_tz(${partyCharges.createdAt}, '+00:00', '-03:00'))`, kind: partyCharges.kind, n: sql<number>`count(*)` })
      .from(partyCharges).where(and(eq(partyCharges.eventId, eventId), inArray(partyCharges.kind, ['superlike', 'likes_unlock']))).groupBy(sql`1`, partyCharges.kind),
  ]);
  const agg = chargesAgg[0] ?? { amount: 0, coins: 0, saldo: 0, buyers: 0 };
  const kinds: Record<string, { qty: number; amount: number; count: number }> = {};
  for (const r of byKind as any[]) kinds[r.kind] = { qty: Number(r.qty), amount: Number(r.amount), count: Number(r.count) };
  return {
    profiles: { total, activeNow, withPhoto, swipers, banned },
    swipes: { likes, nopes },
    superLikes: {
      sent: superLikes, sold: kinds.superlike?.qty ?? 0, gifted: creditsGifted, returned,
    },
    matches: { total: matches, accepted, chats: accepted, messages },
    costumeVotes: votes,
    revenue: {
      totalClp: Number(agg.amount), coins: Number(agg.coins), saldo: Number(agg.saldo), buyers: Number(agg.buyers),
      superLikes: kinds.superlike?.amount ?? 0, likesUnlock: kinds.likes_unlock?.amount ?? 0, likesUnlocks: kinds.likes_unlock?.count ?? 0,
    },
    byHour: (hourly as any[]).map((r) => ({ hour: Number(r.h), kind: String(r.kind), n: Number(r.n) })),
  };
}

export async function adminCharges(eventId: number, opts: { limit?: number; offset?: number; profileId?: number } = {}) {
  const db = await getDb();
  if (!db) return [];
  const where = opts.profileId ? and(eq(partyCharges.eventId, eventId), eq(partyCharges.profileId, opts.profileId)) : eq(partyCharges.eventId, eventId);
  const rows = await db.select({
    id: partyCharges.id, createdAt: partyCharges.createdAt, kind: partyCharges.kind, quantity: partyCharges.quantity, amountClp: partyCharges.amountClp,
    coins: partyCharges.coins, saldo: partyCharges.saldo, note: partyCharges.note, actor: partyCharges.actor, profileId: partyCharges.profileId,
    alias: partyProfiles.alias, holderName: tickets.holderName,
  }).from(partyCharges)
    .leftJoin(partyProfiles, eq(partyProfiles.id, partyCharges.profileId))
    .leftJoin(tickets, eq(tickets.id, partyProfiles.ticketId))
    .where(where).orderBy(desc(partyCharges.createdAt), desc(partyCharges.id)).limit(Math.min(opts.limit ?? 200, 2000)).offset(opts.offset ?? 0);
  return rows;
}

/** Las personas con su estado de Super Likes, para regalar, devolver y ajustar. `q` busca por alias o nombre de la entrada. */
export async function adminPeople(eventId: number, q: string) {
  const db = await getDb();
  if (!db) return [];
  const term = q.trim();
  const where = term
    ? and(eq(partyProfiles.eventId, eventId), or(like(partyProfiles.alias, `%${term}%`), like(tickets.holderName, `%${term}%`)))
    : eq(partyProfiles.eventId, eventId);
  const rows = await db.select({
    id: partyProfiles.id, alias: partyProfiles.alias, holderName: tickets.holderName, credits: partyProfiles.superLikeCredits, bought: partyProfiles.superLikeBought,
    cap: partyProfiles.superLikeCap, likesUnlocked: partyProfiles.likesUnlocked, banned: partyProfiles.banned, active: partyProfiles.active,
  }).from(partyProfiles).leftJoin(tickets, eq(tickets.id, partyProfiles.ticketId)).where(where).orderBy(asc(partyProfiles.alias)).limit(60);
  if (rows.length === 0) return [];
  const sentRows = await db.select({ by: partyConnections.initiatedById, n: sql<number>`count(*)` }).from(partyConnections)
    .where(and(eq(partyConnections.eventId, eventId), eq(partyConnections.viaSwipe, 0), inArray(partyConnections.initiatedById, rows.map((r: any) => r.id)))).groupBy(partyConnections.initiatedById);
  const sent = new Map<number, number>((sentRows as any[]).map((r) => [r.by, Number(r.n)]));
  return rows.map((r: any) => ({ ...r, sent: sent.get(r.id) ?? 0 }));
}

/** Super Likes pendientes que se pueden devolver (todavía sin respuesta): el administrador elige uno y vuelve a su dueño. */
export async function adminPendingSuperLikes(eventId: number, profileId: number) {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.select({
    id: partyConnections.id, createdAt: partyConnections.createdAt, targetLow: partyConnections.profileLowId, targetHigh: partyConnections.profileHighId,
  }).from(partyConnections).where(and(
    eq(partyConnections.eventId, eventId), eq(partyConnections.initiatedById, profileId), eq(partyConnections.viaSwipe, 0), ne(partyConnections.status, 'accepted'),
  )).orderBy(desc(partyConnections.createdAt));
  if (rows.length === 0) return [];
  const targetIds = rows.map((r: any) => (r.targetLow === profileId ? r.targetHigh : r.targetLow));
  const targets = await db.select({ id: partyProfiles.id, alias: partyProfiles.alias }).from(partyProfiles).where(inArray(partyProfiles.id, targetIds));
  const alias = new Map<number, string>((targets as any[]).map((t) => [t.id, t.alias]));
  return rows.map((r: any, i: number) => ({ connectionId: r.id as number, createdAt: r.createdAt as Date, toAlias: alias.get(targetIds[i]) ?? 'Perfil eliminado' }));
}

export async function adminGiftSuperLikes(params: { eventId: number; profileId: number; quantity: number; note?: string; actor: string }) {
  const db = await getDb();
  if (!db) throw new Error('Base de datos no disponible');
  const q = Math.floor(params.quantity);
  if (!Number.isFinite(q) || q < 1 || q > 50) throw new Error('Regala entre 1 y 50');
  const [p] = await db.select({ id: partyProfiles.id, eventId: partyProfiles.eventId }).from(partyProfiles).where(eq(partyProfiles.id, params.profileId)).limit(1);
  if (!p || p.eventId !== params.eventId) throw new Error('Esa persona no está en esta fiesta');
  await db.transaction(async (tx) => {
    await tx.update(partyProfiles).set({ superLikeCredits: sql`${partyProfiles.superLikeCredits} + ${q}` }).where(eq(partyProfiles.id, params.profileId));
    await tx.insert(partyCharges).values({ eventId: params.eventId, profileId: params.profileId, kind: 'gift', quantity: q, note: (params.note ?? '').slice(0, 200) || 'Regalo del equipo', actor: params.actor.slice(0, 100) });
  });
  return { ok: true as const };
}

/** Devuelve un Super Like mal usado: se borra el pendiente (la otra persona ya no lo ve) y el crédito vuelve a su dueño. */
export async function adminReturnSuperLike(params: { eventId: number; connectionId: number; actor: string; note?: string }) {
  const db = await getDb();
  if (!db) throw new Error('Base de datos no disponible');
  const [c] = await db.select().from(partyConnections).where(eq(partyConnections.id, params.connectionId)).limit(1);
  if (!c || c.eventId !== params.eventId || c.viaSwipe) throw new Error('Ese Super Like no existe');
  if (c.status === 'accepted') throw new Error('Ya es un match: no se puede devolver');
  await db.transaction(async (tx) => {
    const res = await tx.delete(partyConnections).where(and(eq(partyConnections.id, c.id), ne(partyConnections.status, 'accepted')));
    if (affected(res) === 0) throw new Error('Ya cambió de estado');
    await tx.update(partyProfiles).set({ superLikeCredits: sql`${partyProfiles.superLikeCredits} + 1` }).where(eq(partyProfiles.id, c.initiatedById));
    await tx.insert(partyCharges).values({ eventId: params.eventId, profileId: c.initiatedById, kind: 'return', quantity: 1, note: (params.note ?? '').slice(0, 200) || 'Devuelto por el equipo', actor: params.actor.slice(0, 100) });
  });
  return { ok: true as const };
}

export async function adminSetCap(params: { eventId: number; profileId: number; cap: number | null; actor: string }) {
  const db = await getDb();
  if (!db) throw new Error('Base de datos no disponible');
  const cap = params.cap === null ? null : Math.max(0, Math.min(100, Math.floor(params.cap)));
  const [p] = await db.select({ id: partyProfiles.id, eventId: partyProfiles.eventId }).from(partyProfiles).where(eq(partyProfiles.id, params.profileId)).limit(1);
  if (!p || p.eventId !== params.eventId) throw new Error('Esa persona no está en esta fiesta');
  await db.transaction(async (tx) => {
    await tx.update(partyProfiles).set({ superLikeCap: cap }).where(eq(partyProfiles.id, params.profileId));
    await tx.insert(partyCharges).values({ eventId: params.eventId, profileId: params.profileId, kind: 'cap', quantity: cap ?? 0, note: cap === null ? 'Tope de la fiesta' : `Tope propio: ${cap}`, actor: params.actor.slice(0, 100) });
  });
  return { ok: true as const };
}

// --- Anfitriones de Playmatch ---------------------------------------------------------------------

/** Cuántos hay en cada paso del camino «instala la App → entra → arma su perfil → juega». */
export async function hostOverview(eventId: number, cfg: PlaymatchConfig) {
  const db = await getDb();
  if (!db) return null;
  const n = async (q: Promise<any[]>) => Number((await q)[0]?.n ?? 0);
  const accessIds = db.select({ id: ticketTypes.id }).from(ticketTypes).where(and(eq(ticketTypes.eventId, eventId), eq(ticketTypes.category, 'acceso')));
  const [tickets_, entered, profiles, withPhoto, matches, installed] = await Promise.all([
    n(db.select({ n: sql<number>`count(*)` }).from(tickets).where(and(eq(tickets.eventId, eventId), ne(tickets.status, 'cancelled'), inArray(tickets.ticketTypeId, accessIds)))),
    n(db.select({ n: sql<number>`count(*)` }).from(tickets).where(and(eq(tickets.eventId, eventId), eq(tickets.status, 'used'), inArray(tickets.ticketTypeId, accessIds)))),
    n(db.select({ n: sql<number>`count(*)` }).from(partyProfiles).where(and(eq(partyProfiles.eventId, eventId), eq(partyProfiles.active, 1)))),
    n(db.select({ n: sql<number>`count(*)` }).from(partyProfiles).where(and(eq(partyProfiles.eventId, eventId), eq(partyProfiles.active, 1), eq(partyProfiles.swipeEnabled, 1)))),
    n(db.select({ n: sql<number>`count(*)` }).from(partyConnections).where(and(eq(partyConnections.eventId, eventId), eq(partyConnections.status, 'accepted')))),
    // Quienes ya abrieron la App: su correo (el de la compra) aparece en un dispositivo.
    n(db.select({ n: sql<number>`count(distinct ${appDevices.emailNorm})` }).from(appDevices).innerJoin(orders, sql`lower(${orders.buyerEmail}) = ${appDevices.emailNorm}`).where(and(eq(orders.eventId, eventId), eq(orders.paymentStatus, 'approved')))),
  ]);
  return {
    goal: cfg.hostGoal,
    funnel: { tickets: tickets_, installed, entered, profiles, withPhoto, matches },
    pending: { withoutProfile: Math.max(0, entered - profiles), withoutPhoto: Math.max(0, profiles - withPhoto) },
  };
}

export interface HostPerson {
  /** Para avisar (solo quien ya tiene perfil). */
  profileId: number | null;
  ticketId: number;
  /** Alias si ya creó su perfil; si no, el primer nombre y la inicial del apellido. */
  name: string;
  entered: boolean;
  hasProfile: boolean;
  hasPhoto: boolean;
  hasTastes: boolean;
}

/** Buscar a alguien de la fiesta para ayudarle con su perfil. No se muestra nada privado: alias, o nombre y apellido
 * abreviado, y qué le falta. `q` vacío trae a quienes están adentro y les falta algo. */
export async function hostSearch(eventId: number, q: string): Promise<HostPerson[]> {
  const db = await getDb();
  if (!db) return [];
  const term = q.trim();
  const accessIds = db.select({ id: ticketTypes.id }).from(ticketTypes).where(and(eq(ticketTypes.eventId, eventId), eq(ticketTypes.category, 'acceso')));
  const where = and(
    eq(tickets.eventId, eventId), ne(tickets.status, 'cancelled'), inArray(tickets.ticketTypeId, accessIds),
    term ? or(like(tickets.holderName, `%${term}%`), like(partyProfiles.alias, `%${term}%`)) : eq(tickets.status, 'used'),
  );
  const rows = await db.select({
    ticketId: tickets.id, holderName: tickets.holderName, status: tickets.status,
    profileId: partyProfiles.id, alias: partyProfiles.alias, swipe: partyProfiles.swipeEnabled, intents: partyProfiles.intents, relation: partyProfiles.relationStyle, active: partyProfiles.active,
  }).from(tickets).leftJoin(partyProfiles, eq(partyProfiles.ticketId, tickets.id)).where(where).orderBy(asc(tickets.holderName)).limit(term ? 40 : 200);
  const people = rows.map((r: any): HostPerson => ({
    profileId: r.profileId ?? null,
    ticketId: r.ticketId,
    name: r.alias ?? shortName(r.holderName),
    entered: r.status === 'used',
    hasProfile: !!r.profileId,
    hasPhoto: !!r.swipe,
    hasTastes: !!(r.intents || r.relation),
  }));
  return term ? people : people.filter((p) => !p.hasProfile || !p.hasPhoto);
}

/** «María Pérez González» → «María P.» */
export function shortName(full: string | null | undefined): string {
  const parts = String(full ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'Invitado';
  return parts.length === 1 ? parts[0] : `${parts[0]} ${parts[1][0].toUpperCase()}.`;
}

const nudged = new Map<number, number>();
const NUDGE_COOLDOWN_MS = 10 * 60 * 1000;

/** Un aviso a alguien que ya tiene perfil para que termine de armarlo. Cada persona recibe uno cada 10 minutos como mucho. */
export async function hostNudge(eventId: number, profileId: number, what: 'photo' | 'tastes'): Promise<{ ok: true } | { ok: false; reason: string }> {
  const db = await getDb();
  if (!db) return { ok: false, reason: 'Base de datos no disponible' };
  const [p] = await db.select({ id: partyProfiles.id, eventId: partyProfiles.eventId }).from(partyProfiles).where(eq(partyProfiles.id, profileId)).limit(1);
  if (!p || p.eventId !== eventId) return { ok: false, reason: 'Esa persona no está en esta fiesta' };
  const last = nudged.get(profileId) ?? 0;
  if (Date.now() - last < NUDGE_COOLDOWN_MS) return { ok: false, reason: 'Ya le avisaron hace poco. Espera unos minutos.' };
  nudged.set(profileId, Date.now());
  await sendPushToProfile(profileId, what === 'photo'
    ? { title: '📸 Falta tu foto', body: 'Ponla y entras al juego de Playmatch', url: '/cuenta?tab=playmatch' }
    : { title: '✨ Cuéntanos qué buscas', body: 'Completa tus gustos y te mostramos primero a quien más va contigo', url: '/cuenta?tab=playmatch' });
  return { ok: true };
}

// --- «Alguien muy afín llegó» ------------------------------------------------------------------------

/** Cuando alguien entra al juego (ya tiene foto y está adentro), les avisa a quienes tienen alta afinidad con esa persona
 * y todavía no recibieron dos avisos esta noche. No dice quién es. Nunca lanza. */
export async function notifyAffinityArrival(profileId: number): Promise<number> {
  try {
    const db = await getDb();
    if (!db) return 0;
    const [arrived] = await db.select().from(partyProfiles).where(eq(partyProfiles.id, profileId)).limit(1);
    if (!arrived || !arrived.active || arrived.banned || !arrived.swipeEnabled) return 0;
    const recent = new Date(Date.now() - 30 * 60 * 1000);
    const others = await db.select().from(partyProfiles).where(and(
      eq(partyProfiles.eventId, arrived.eventId), eq(partyProfiles.active, 1), eq(partyProfiles.banned, 0), eq(partyProfiles.swipeEnabled, 1),
      ne(partyProfiles.id, profileId), gt(partyProfiles.lastSeenAt, recent), sql`${partyProfiles.affinityAlerts} < ${MAX_AFFINITY_ALERTS}`,
    ));
    const hidden = await getPartyHiddenIds(db, profileId);
    const candidates = others
      .filter((o: any) => !hidden.has(o.id) && isMutualInterest(arrived, o) && wants(o, arrived))
      .map((o: any) => ({ o, pct: affinityPercent(arrived, o) }))
      .filter((x) => x.pct !== null && x.pct >= AFFINITY_ALERT_MIN)
      .sort((a, b) => (b.pct ?? 0) - (a.pct ?? 0))
      .slice(0, 5);
    if (candidates.length === 0) return 0;
    const subs = await db.select({ profileId: partyPushSubscriptions.profileId }).from(partyPushSubscriptions).where(inArray(partyPushSubscriptions.profileId, candidates.map((c) => c.o.id)));
    const subscribed = new Set<number>((subs as any[]).map((s) => s.profileId));
    let sent = 0;
    for (const { o, pct } of candidates) {
      if (!subscribed.has(o.id)) continue;
      await db.update(partyProfiles).set({ affinityAlerts: sql`${partyProfiles.affinityAlerts} + 1` }).where(eq(partyProfiles.id, o.id));
      await sendPushToProfile(o.id, { title: '🔥 Alguien muy afín llegó', body: `Entró alguien con ${pct}% de afinidad contigo. Mira tu mazo en Playmatch.`, url: '/cuenta?tab=playmatch' });
      sent += 1;
    }
    return sent;
  } catch (err) {
    console.error('[Playmatch] Error avisando afinidad:', err);
    return 0;
  }
}
