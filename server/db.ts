import { eq, desc, and, sql, or, gte, lte, like, inArray, isNull, ne } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertUser, users, events, ticketTypes, ticketStockHistory, stockPools, StockPool, orders, orderItems, tickets, discountCodes, communityCodes, leads, blockedCustomers, referrals, siteSettings, operators, InsertOperator, ops, registers, rateLimits, devices, customers, shifts, playcoinsLedger, mailingCampaigns, mailingRecipients, exclusiveAmbassadors, ambassadorCommissions, ambassadorClients, ambassadorProgramConfig, adminTotp, adminWebauthnCredentials, partyGifts, partyProfiles, partyConnections, partyMessages, partyBlocks, partyReports, expenses, kitchenTickets, lockerItems } from "../drizzle/schema";
import { ENV } from './_core/env';
import { nanoid } from 'nanoid';
import { isMissionActiveForEvent, missionDepositPrice, personasForAccesoSlug, personasForTicket } from '../shared/mission300';
import { MAX_TOUCHES_PER_EVENT, giftExpiresAt, isGiftExpired, canPayGift, canRespondToGift, orderedPair, type PartyGender, type PartyZone } from '../shared/party';
import { playcoinsEarnedForPurchase, clampRedeemAmount } from '../shared/playcoins';
import { isEventToday } from '../shared/eventDay';
import { monthKeyFor } from '../shared/ambassadorProgram';
import { normalizeTandaSchedule, nextPhase } from '../shared/tandaSchedule';
import { checkAndAdvanceTandaIfNeeded } from './tandaAutoAdvance';
import { deriveAmounts, computePnl, prorationWeights, cashCollectedFromOrders, type PnlExpense } from '../shared/expenses';
import { normalizeRut } from '../shared/rut';
import { generateTicketQR } from './qr';
import { generateDisplayCode, fallbackInternalCode } from './caja/displayCode';

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      // mysql2 no soporta ssl={"rejectUnauthorized":true} embebido en la URI
      // (solo perfiles con nombre tipo "Amazon RDS") — proveedores como TiDB
      // exigen TLS, así que se pasa como opción separada del pool.
      _db = drizzle({
        connection: {
          uri: process.env.DATABASE_URL,
          ssl: { minVersion: "TLSv1.2", rejectUnauthorized: true },
        },
      });
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) return;

  try {
    const values: InsertUser = { openId: user.openId };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];
    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };
    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) { values.lastSignedIn = user.lastSignedIn; updateSet.lastSignedIn = user.lastSignedIn; }
    if (user.role !== undefined) { values.role = user.role; updateSet.role = user.role; }
    else if (user.openId === ENV.ownerOpenId) { values.role = 'admin'; updateSet.role = 'admin'; }

    if (!values.lastSignedIn) values.lastSignedIn = new Date();
    if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();

    // Generate ambassador code for new users
    if (!values.ambassadorCode) {
      values.ambassadorCode = nanoid(8).toUpperCase();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

// Events
export async function getPublishedEvents() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(events).where(eq(events.status, 'published')).orderBy(events.eventDate);
}

export async function getAllEvents() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(events).orderBy(desc(events.createdAt));
}

// Publicados + pasados (para la sección "Próximos Eventos" de la home: pasados en
// blanco y negro, próximos a color). Nunca expone 'draft'/'cancelled'.
export async function getHomeEvents() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(events)
    .where(or(eq(events.status, 'published'), eq(events.status, 'past'), eq(events.status, 'soldout')))
    .orderBy(events.eventDate);
}

export async function getEventBySlug(slug: string) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(events).where(eq(events.slug, slug)).limit(1);
  return result[0] ?? null;
}

export async function getEventById(id: number) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(events).where(eq(events.id, id)).limit(1);
  return result[0] ?? null;
}

/** El "próximo evento destacado" para el mailing masivo (server/mailing.ts):
 * prioriza el marcado featured=1; si no hay ninguno, cae al próximo publicado
 * por fecha. */
export async function getFeaturedEvent() {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(events)
    .where(eq(events.status, 'published'))
    .orderBy(desc(events.featured), events.eventDate)
    .limit(1);
  return result[0];
}

export async function createEvent(data: any) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const eventDate = new Date(data.eventDate);
  const doorsOpen = data.doorsOpen ? new Date(data.doorsOpen) : undefined;
  await db.insert(events).values({
    ...data,
    eventDate,
    doorsOpen,
    status: data.status || 'draft',
  });
  return { success: true };
}

export async function updateEvent(id: number, data: any) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const updateData: any = { ...data };
  if (data.eventDate) updateData.eventDate = new Date(data.eventDate);
  if (data.doorsOpen) updateData.doorsOpen = new Date(data.doorsOpen);
  await db.update(events).set(updateData).where(eq(events.id, id));
  return { success: true };
}

export async function deleteEvent(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  // Los gastos del evento pasan a ser de la empresa en vez de quedar
  // apuntando a un evento que ya no existe: el schema no usa foreign keys, así
  // que nadie los limpiaría, y desaparecerían de todos los reportes sin
  // avisar. Conservan su periodMonth, o sea que siguen contando en el mes.
  await db.update(expenses)
    .set({ scope: 'general', eventId: null })
    .where(eq(expenses.eventId, id));
  await db.delete(events).where(eq(events.id, id));
  return { success: true };
}

/** Estacionamiento/covers por defecto: antes vivían hardcodeados en
 * client/src/config/candyland.ts y el checkout los cobraba "a mano" (sin
 * mandarlos como orderItems reales) cuando el evento no tenía sus propios
 * extras cargados -- por eso el total mostrado nunca coincidía con lo que
 * de verdad se guardaba/cobraba. Ahora cualquier evento que ya tenga accesos
 * pero cero extras se autorepara con estos dos, así el checkout siempre
 * cobra por un ticketType real (ver getOrCreateInstantInviteTicketType, que
 * usa el mismo patrón de "crear la primera vez que se necesita"). Si el
 * admin ya cargó sus propios extras para el evento, esto no toca nada.
 * Ajustar precios a futuro se hace desde Admin → Entradas, no acá. */
async function ensureDefaultExtraTicketTypes(eventId: number, existing: (typeof ticketTypes.$inferSelect)[]) {
  const hasAcceso = existing.some((tt) => tt.category === 'acceso');
  const hasExtra = existing.some((tt) => tt.category === 'extra');
  if (!hasAcceso || hasExtra) return false;

  const db = await getDb();
  if (!db) return false;

  await db.insert(ticketTypes).values([
    { eventId, name: 'Estacionamiento', category: 'extra', price: '5000', totalStock: 999999, status: 'active' },
    { eventId, name: 'Piscolón', category: 'extra', price: '5000', totalStock: 999999, status: 'active' },
  ]);
  return true;
}

// Ticket Types
export async function getTicketTypesByEventId(eventId: number) {
  const db = await getDb();
  if (!db) return [];
  const existing = await db.select().from(ticketTypes).where(eq(ticketTypes.eventId, eventId)).orderBy(ticketTypes.sortOrder);
  const created = await ensureDefaultExtraTicketTypes(eventId, existing);
  const rows = created
    ? await db.select().from(ticketTypes).where(eq(ticketTypes.eventId, eventId)).orderBy(ticketTypes.sortOrder)
    : existing;
  return attachStockPoolInfo(rows);
}

/** Le suma a cada fila con `stockPoolId` el remanente REAL del pool
 * compartido (`poolRemaining`) y su cap (`poolTotalCap`) -- así el
 * frontend (público o admin) no tiene que hacer una consulta aparte por
 * cada fila. `poolTotalCap` viaja en la respuesta para que Home.tsx pueda
 * calcular la barra de progreso (tandaPct) sin volver a pedirlo -- que
 * viaje en el JSON no es lo mismo que mostrarlo: la UI pública tiene que
 * seguir sin IMPRIMIR ese número en ningún texto (ver TandaUrgencyCard). */
async function attachStockPoolInfo<T extends { stockPoolId: number | null }>(
  rows: T[],
): Promise<(T & { poolRemaining: number | null; poolTotalCap: number | null })[]> {
  const poolIds = Array.from(new Set(rows.map((r) => r.stockPoolId).filter((id): id is number => id != null)));
  if (poolIds.length === 0) return rows.map((r) => ({ ...r, poolRemaining: null, poolTotalCap: null }));

  const poolInfoById = new Map<number, { remaining: number; totalCap: number }>();
  await Promise.all(poolIds.map(async (id) => {
    const info = await getStockPoolRemaining(id);
    if (info) poolInfoById.set(id, { remaining: info.remaining, totalCap: info.pool.totalCap });
  }));

  return rows.map((r) => {
    const info = r.stockPoolId != null ? poolInfoById.get(r.stockPoolId) : undefined;
    return { ...r, poolRemaining: info?.remaining ?? null, poolTotalCap: info?.totalCap ?? null };
  });
}

export async function createTicketType(data: any) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(ticketTypes).values({
    ...data,
    price: String(data.price),
    originalPrice: data.originalPrice ? String(data.originalPrice) : undefined,
    costPrice: data.costPrice !== undefined ? String(data.costPrice) : undefined,
  });
  return { success: true };
}

export async function updateTicketType(id: number, data: any, changedByUserId?: number, changedByOperatorId?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const updateData: any = { ...data };
  if (data.price !== undefined) updateData.price = String(data.price);
  if (data.originalPrice !== undefined) updateData.originalPrice = String(data.originalPrice);
  if (data.costPrice !== undefined) updateData.costPrice = String(data.costPrice);

  // Deja registro de auditoría cuando cambia el stock (ej. subir el cupo de
  // "soltero" al entrar más solteros aceptados, o cocina cargando porciones
  // del día) -- se compara contra el valor actual en vez de asumir, para no
  // loguear "cambios" cuando se reenvía el mismo número.
  if (data.totalStock !== undefined) {
    const [current] = await db.select({ totalStock: ticketTypes.totalStock, eventId: ticketTypes.eventId }).from(ticketTypes).where(eq(ticketTypes.id, id)).limit(1);
    if (current && current.totalStock !== data.totalStock) {
      await db.insert(ticketStockHistory).values({
        ticketTypeId: id,
        eventId: current.eventId,
        previousStock: current.totalStock,
        newStock: data.totalStock,
        changedByUserId: changedByUserId ?? null,
        changedByOperatorId: changedByOperatorId ?? null,
      });
    }
  }

  await db.update(ticketTypes).set(updateData).where(eq(ticketTypes.id, id));
  return { success: true };
}

export async function getTicketStockHistory(ticketTypeId: number) {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.select({
    id: ticketStockHistory.id,
    previousStock: ticketStockHistory.previousStock,
    newStock: ticketStockHistory.newStock,
    createdAt: ticketStockHistory.createdAt,
    changedByUserId: ticketStockHistory.changedByUserId,
    changedByName: users.name,
    changedByEmail: users.email,
    changedByOperatorId: ticketStockHistory.changedByOperatorId,
    changedByOperatorName: operators.name,
  }).from(ticketStockHistory)
    .leftJoin(users, eq(users.id, ticketStockHistory.changedByUserId))
    .leftJoin(operators, eq(operators.id, ticketStockHistory.changedByOperatorId))
    .where(eq(ticketStockHistory.ticketTypeId, ticketTypeId))
    .orderBy(desc(ticketStockHistory.createdAt));
  return rows;
}

export async function deleteTicketType(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(ticketTypes).where(eq(ticketTypes.id, id));
  return { success: true };
}

/** "Cerrar esta tanda y activar la siguiente" (flujo del admin, pedido
 * explícito del dueño: el avance de fase queda MANUAL -- nada acá se
 * dispara solo por fecha ni por cupo agotado, solo lo arma este llamado).
 * Para cada fila hoy activa: la marca `soldout` (mismo status que
 * TandaUrgencyCard en Home.tsx ya trata como "tanda terminada", no hace
 * falta un valor nuevo de status) y crea una fila NUEVA con el mismo
 * eventId/accesoSlug/category/name/originalPrice -- el precio general es el
 * techo fijo entre fases, solo cambia el precio VIGENTE -- pero con el
 * price/totalStock/stockPoolId de la fase nueva que cargó el admin, ya en
 * `status: 'active'`.
 *
 * Sin `db.transaction()` explícita -- mismo criterio que el resto de este
 * archivo (ver markMailingRecipientResult): si se corta a mitad de camino,
 * el peor caso es una tanda con algunas filas ya cerradas y otras aún por
 * abrir, visible y corregible a mano en el admin, no un dato perdido. Una
 * fila que ya no existe o es de otro evento se salta sin abortar el resto. */
export async function advanceTanda(
  eventId: number,
  rows: { oldTicketTypeId: number; newPrice: number; newTotalStock: number; newStockPoolId?: number | null }[],
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [event] = await db.select().from(events).where(eq(events.id, eventId)).limit(1);
  if (!event) throw new Error("Evento no encontrado");
  const schedule = normalizeTandaSchedule(event.tandaDiscountSchedule);
  const next = nextPhase(event.tandaPhaseIndex, schedule);

  let count = 0;
  for (const row of rows) {
    const [old] = await db.select().from(ticketTypes).where(eq(ticketTypes.id, row.oldTicketTypeId)).limit(1);
    if (!old || old.eventId !== eventId) continue;

    await db.update(ticketTypes).set({ status: 'soldout' }).where(eq(ticketTypes.id, row.oldTicketTypeId));

    await db.insert(ticketTypes).values({
      eventId,
      name: old.name,
      accesoSlug: old.accesoSlug,
      category: old.category,
      description: old.description,
      price: String(row.newPrice),
      originalPrice: old.originalPrice ?? undefined,
      totalStock: row.newTotalStock,
      maxPerOrder: old.maxPerOrder,
      sortOrder: old.sortOrder,
      status: 'active',
      stockPoolId: row.newStockPoolId ?? null,
    });
    count++;
  }

  // Avanza la fase del evento junto con las filas, en el mismo llamado --
  // así el próximo click de "Cerrar tanda" ya precarga el % correcto. Si ya
  // se llegó al final de la escala (`next` null), NO se toca el índice:
  // "Cerrar tanda" sigue funcionando como herramienta manual libre (ej. un
  // ajuste de precio ad-hoc fuera de la escala), solo deja de avanzar la
  // fase automáticamente una vez agotada.
  if (next) {
    await db.update(events).set({ tandaPhaseIndex: next.index }).where(eq(events.id, eventId));
  }

  return { success: true, count, newPhaseIndex: next ? next.index : event.tandaPhaseIndex };
}

// Cupos compartidos (stockPools) -- ver comentario en drizzle/schema.ts.
// El admin sigue viendo el número real (vendidos / cap); lo que se esconde
// es solo la vista pública (TandaUrgencyCard en Home.tsx).

/** Para el panel del admin: cada pool con su remanente REAL calculado
 * (nunca se esconde acá -- eso es solo en la vista pública). */
export async function getStockPoolsByEventId(eventId: number) {
  const db = await getDb();
  if (!db) return [];
  const pools = await db.select().from(stockPools).where(eq(stockPools.eventId, eventId)).orderBy(desc(stockPools.createdAt));
  return Promise.all(pools.map(async (pool) => {
    const info = await getStockPoolRemaining(pool.id);
    return { ...pool, sold: info?.sold ?? 0, remaining: info?.remaining ?? pool.totalCap };
  }));
}

export async function createStockPool(data: { eventId: number; name: string; totalCap: number }) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(stockPools).values(data);
  return { success: true };
}

export async function updateStockPool(id: number, data: { name?: string; totalCap?: number }) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(stockPools).set(data).where(eq(stockPools.id, id));
  return { success: true };
}

/** Solo se puede borrar un pool que ya no tiene ninguna ticketType apuntándole
 * -- si no, quedarían filas con un stockPoolId fantasma y createOrder dejaría
 * de aplicar el límite compartido sin que nadie lo haya decidido a propósito. */
export async function deleteStockPool(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [inUse] = await db.select({ id: ticketTypes.id }).from(ticketTypes).where(eq(ticketTypes.stockPoolId, id)).limit(1);
  if (inUse) throw new Error('Este cupo compartido todavía tiene accesos asignados -- desasígnalos antes de borrarlo.');
  await db.delete(stockPools).where(eq(stockPools.id, id));
  return { success: true };
}

/** Remanente real de un cupo compartido: cap total menos lo YA VENDIDO
 * (soldCount, no pending) de todas las ticketTypes que apuntan a este pool
 * -- mismo criterio que "totalStock - soldCount" por fila, solo que sumado
 * entre varias filas en vez de una. */
export async function getStockPoolRemaining(poolId: number): Promise<{ pool: StockPool; remaining: number; sold: number } | null> {
  const db = await getDb();
  if (!db) return null;
  const [pool] = await db.select().from(stockPools).where(eq(stockPools.id, poolId)).limit(1);
  if (!pool) return null;
  const [row] = await db
    .select({ sold: sql<number>`coalesce(sum(${ticketTypes.soldCount}), 0)` })
    .from(ticketTypes)
    .where(eq(ticketTypes.stockPoolId, poolId));
  const sold = Number(row?.sold ?? 0);
  return { pool, remaining: Math.max(0, pool.totalCap - sold), sold };
}

/** Parte pura de la validación de cupo compartido en createOrder(): recibe
 * el remanente YA CALCULADO de cada pool involucrado (ver
 * getStockPoolRemaining, que sí toca la base de datos) para poder testearla
 * sola. Suma lo pedido para cada pool EN ESTA MISMA orden -- alguien puede
 * pedir un Dúo + una Soltera del mismo pozo en una sola compra -- y tira si
 * el total pedido supera el remanente real de ese pool. Un pool en
 * `poolRemainingById` que no aparece (ej. se borró entre que se leyó y se
 * validó) no bloquea la compra: mejor vender de más por una carrera rarísima
 * que trabar el checkout entero por un pool fantasma. */
export function validateStockPoolCapacity(
  items: { ticketTypeId: number; quantity: number }[],
  ticketTypesForEvent: { id: number; stockPoolId: number | null }[],
  poolRemainingById: Map<number, { remaining: number; name: string }>,
): void {
  const poolRequested = new Map<number, number>();
  for (const item of items) {
    const tt = ticketTypesForEvent.find((t) => t.id === item.ticketTypeId);
    if (tt?.stockPoolId != null) {
      poolRequested.set(tt.stockPoolId, (poolRequested.get(tt.stockPoolId) ?? 0) + item.quantity);
    }
  }
  for (const [poolId, requested] of Array.from(poolRequested.entries())) {
    const poolInfo = poolRemainingById.get(poolId);
    if (!poolInfo) continue;
    if (requested > poolInfo.remaining) {
      throw new Error(`Quedan solo ${poolInfo.remaining} cupos de "${poolInfo.name}" -- no alcanza para esta compra`);
    }
  }
}

/** Datos públicos de un ticket para la página "Mi entrada" (/verificar/:ticketCode)
 * — de solo lectura, no marca nada como usado (eso queda para la futura
 * pantalla de staff). El ticketCode funciona como token portador: quien
 * tenga el link (del QR o del email) puede verlo, igual que una entrada física. */
export async function getTicketByCode(ticketCode: string) {
  const db = await getDb();
  if (!db) return null;

  const [ticket] = await db.select().from(tickets).where(eq(tickets.ticketCode, ticketCode)).limit(1);
  if (!ticket) return null;

  const [order] = await db.select().from(orders).where(eq(orders.id, ticket.orderId)).limit(1);
  const [event] = await db.select().from(events).where(eq(events.id, ticket.eventId)).limit(1);
  const [ticketType] = await db.select().from(ticketTypes).where(eq(ticketTypes.id, ticket.ticketTypeId)).limit(1);

  const attendeeNames = parseAttendeeNames(order?.attendeeData);

  // Extras de la misma orden (estacionamiento, piscolón, etc.) — cada uno ya
  // tiene su propio ticket/código generado (mismo loop que genera el acceso
  // principal), solo faltaba mostrarlo. Se agrupan por tipo con su cantidad.
  const extras = order ? await getOrderExtras(order.id) : [];

  return {
    ticketCode: ticket.ticketCode,
    status: ticket.status,
    qrImageUrl: ticket.qrImageUrl,
    holderName: ticket.holderName,
    attendeeNames: attendeeNames.length > 0 ? attendeeNames : (ticket.holderName ? [ticket.holderName] : []),
    ticketTypeName: ticketType?.name ?? 'Entrada',
    eventTitle: event?.title ?? '',
    eventDate: event?.eventDate ?? null,
    doorsOpen: event?.doorsOpen ?? null,
    eventEnd: event?.eventEnd ?? null,
    venue: event?.venue ?? '',
    address: event?.address ?? '',
    extras,
  };
}

/** Extras (category="extra") de una orden, agrupados por tipo con su cantidad
 * y los códigos de ticket individuales generados para cada unidad. */
export async function getOrderExtras(orderId: number) {
  const db = await getDb();
  if (!db) return [];

  const orderTickets = await db.select().from(tickets).where(eq(tickets.orderId, orderId));
  const grouped = new Map<number, { name: string; quantity: number; codes: string[] }>();

  for (const t of orderTickets) {
    const [tt] = await db.select().from(ticketTypes).where(eq(ticketTypes.id, t.ticketTypeId)).limit(1);
    if (tt?.category !== 'extra') continue;
    const entry = grouped.get(t.ticketTypeId) ?? { name: tt.name, quantity: 0, codes: [] };
    entry.quantity += 1;
    // displayCode legible (PIS-XXXX-XXXX) es lo que se presenta en caja para
    // canjear (docs/ARQUITECTURA-CAJA.md §9); ticketCode queda como respaldo
    // para extras generados antes de la Fase 1, que no tienen displayCode.
    entry.codes.push(t.displayCode || t.ticketCode);
    grouped.set(t.ticketTypeId, entry);
  }

  return Array.from(grouped.values());
}

// Discount Codes
export async function validateDiscountCode(code: string, eventId: number) {
  const db = await getDb();
  if (!db) return { valid: false, message: 'Service unavailable' };

  const result = await db.select().from(discountCodes).where(eq(discountCodes.code, code.trim().toUpperCase())).limit(1);
  if (result.length === 0) return { valid: false, message: 'Código no encontrado' };

  const discount = result[0];
  if (!discount.isActive) return { valid: false, message: 'Código inactivo' };
  if (discount.maxUses && discount.usedCount >= discount.maxUses) return { valid: false, message: 'Código agotado' };
  if (discount.validUntil && new Date(discount.validUntil) < new Date()) return { valid: false, message: 'Código expirado' };
  if (discount.validFrom && new Date(discount.validFrom) > new Date()) return { valid: false, message: 'Código aún no válido' };
  if (discount.eventId && discount.eventId !== eventId) return { valid: false, message: 'Código no válido para este evento' };

  return { valid: true, discount };
}

export async function getAllDiscountCodes() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(discountCodes).orderBy(desc(discountCodes.createdAt));
}

export async function createDiscountCode(data: any) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(discountCodes).values({
    ...data,
    discountValue: String(data.discountValue),
    minPurchase: data.minPurchase ? String(data.minPurchase) : undefined,
    validFrom: data.validFrom ? new Date(data.validFrom) : undefined,
    validUntil: data.validUntil ? new Date(data.validUntil) : undefined,
  });
  return { success: true };
}

export async function updateDiscountCode(id: number, data: any) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const updateData: any = { ...data };
  if (data.discountValue !== undefined) updateData.discountValue = String(data.discountValue);
  if (data.validUntil) updateData.validUntil = new Date(data.validUntil);
  await db.update(discountCodes).set(updateData).where(eq(discountCodes.id, id));
  return { success: true };
}

export async function deleteDiscountCode(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(discountCodes).where(eq(discountCodes.id, id));
  return { success: true };
}

// Community Access Codes (gate-only — Soltero / Dúo Dos Hombres)
export async function validateCommunityCode(code: string) {
  const db = await getDb();
  if (!db) return { valid: false, message: 'Service unavailable' };

  const result = await db.select().from(communityCodes).where(eq(communityCodes.code, code.trim().toUpperCase())).limit(1);
  if (result.length === 0) return { valid: false, message: 'Código no encontrado' };

  const entry = result[0];
  if (!entry.isActive) return { valid: false, message: 'Código inactivo' };
  if (entry.maxUses && entry.usedCount >= entry.maxUses) return { valid: false, message: 'Código agotado' };

  return { valid: true, communityCode: entry };
}

export async function markCommunityCodeUsed(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(communityCodes).set({ usedCount: sql`usedCount + 1` }).where(eq(communityCodes.id, id));
}

export async function getAllCommunityCodes() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(communityCodes).orderBy(desc(communityCodes.createdAt));
}

export async function createCommunityCode(data: any) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(communityCodes).values(data);
  return { success: true };
}

export async function updateCommunityCode(id: number, data: any) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(communityCodes).set(data).where(eq(communityCodes.id, id));
  return { success: true };
}

export async function deleteCommunityCode(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(communityCodes).where(eq(communityCodes.id, id));
  return { success: true };
}

// Leads (captura de contacto sin compra, ver drizzle/schema.ts)
export async function createLead(data: {
  email: string; phone?: string; instagram?: string; eventId?: number;
  source?: string; utmSource?: string; utmMedium?: string; utmCampaign?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const email = data.email.trim().toLowerCase();
  const values = { ...data, email, source: data.source ?? 'price_alert' };
  // Reenviar el mismo formulario para el mismo evento actualiza el lead
  // existente (mismo email + eventId) en vez de duplicarlo -- ver el índice
  // único en drizzle/schema.ts.
  await db.insert(leads).values(values).onDuplicateKeyUpdate({
    set: { phone: values.phone, instagram: values.instagram, source: values.source },
  });
  return { success: true };
}

export async function getAllLeads() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(leads).orderBy(desc(leads.createdAt));
}

export async function deleteLead(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(leads).where(eq(leads.id, id));
  return { success: true };
}

// Lista de bloqueo de clientes (por RUT) -- ver el chequeo en createOrder.
export async function getAllBlockedCustomers() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(blockedCustomers).orderBy(desc(blockedCustomers.createdAt));
}

export async function createBlockedCustomer(data: { rut: string; fullName?: string; reason?: string }) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(blockedCustomers).values({ ...data, rut: normalizeRut(data.rut) });
  return { success: true };
}

export async function updateBlockedCustomer(id: number, data: any) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const updateData = data.rut ? { ...data, rut: normalizeRut(data.rut) } : data;
  await db.update(blockedCustomers).set(updateData).where(eq(blockedCustomers.id, id));
  return { success: true };
}

export async function deleteBlockedCustomer(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(blockedCustomers).where(eq(blockedCustomers.id, id));
  return { success: true };
}

// Site settings (fila única — Instagram followers/posts para el footer, y el
// recargo por servicio (%) que se suma a toda venta nueva)
export async function getSiteSettings() {
  const db = await getDb();
  if (!db) return { instagramFollowers: 0, instagramPosts: 0, serviceFeePercent: "0", kitchenVendorName: null, kitchenVendorEmail: null, ogImageUrl: null };
  const [row] = await db.select().from(siteSettings).limit(1);
  if (row) return row;
  return { instagramFollowers: 0, instagramPosts: 0, serviceFeePercent: "0", kitchenVendorName: null, kitchenVendorEmail: null, ogImageUrl: null };
}

export async function updateSiteSettings(data: {
  instagramFollowers?: number; instagramPosts?: number; serviceFeePercent?: number;
  kitchenVendorName?: string | null; kitchenVendorEmail?: string | null; ogImageUrl?: string | null;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const updateData: any = { ...data };
  if (data.serviceFeePercent !== undefined) updateData.serviceFeePercent = String(data.serviceFeePercent);
  const [row] = await db.select().from(siteSettings).limit(1);
  if (row) {
    await db.update(siteSettings).set(updateData).where(eq(siteSettings.id, row.id));
  } else {
    await db.insert(siteSettings).values({ instagramFollowers: 0, instagramPosts: 0, ...updateData });
  }
  return { success: true };
}

/** Extrae los nombres de todas las personas asociadas a una orden (titular +
 * acompañantes) desde el `attendeeData` guardado en el checkout — busca
 * cualquier campo cuya clave contenga "nombre" (`buyer__nombre`,
 * `acceso__acomp1_nombre`, `acceso__acomp2_nombre`, etc.), sin asumir una
 * lista fija de claves ya que cada tipo de acceso define las suyas. */
export function parseAttendeeNames(attendeeDataJson: string | null | undefined): string[] {
  if (!attendeeDataJson) return [];
  try {
    const parsed = JSON.parse(attendeeDataJson);
    const campos = parsed?.campos ?? {};
    const names: string[] = [];
    for (const [key, value] of Object.entries(campos)) {
      if (typeof value === 'string' && value.trim() && /nombre/i.test(key)) {
        names.push(value.trim());
      }
    }
    return names;
  } catch {
    return [];
  }
}

/** Mismo patrón que parseAttendeeNames pero para RUT (titular + acompañantes)
 * -- busca cualquier campo cuya clave contenga "rut" (`buyer__rut`,
 * `acceso__acomp1_rut`, etc.) y devuelve los valores normalizados, listos
 * para comparar contra `blockedCustomers.rut`. */
export function parseAttendeeRuts(attendeeDataJson: string | null | undefined): string[] {
  if (!attendeeDataJson) return [];
  try {
    const parsed = JSON.parse(attendeeDataJson);
    const campos = parsed?.campos ?? {};
    const ruts: string[] = [];
    for (const [key, value] of Object.entries(campos)) {
      if (typeof value === 'string' && value.trim() && /rut/i.test(key)) {
        ruts.push(normalizeRut(value));
      }
    }
    return ruts;
  } catch {
    return [];
  }
}

/** RUT del comprador (no de acompañantes) de una orden, para Puerta -- lee
 * específicamente la clave `buyer__rut` de attendeeData, la fuente de
 * verdad real (a diferencia de customers.rut, ver upsertCustomerFromOrder). */
export function parseBuyerRut(attendeeDataJson: string | null | undefined): string | null {
  if (!attendeeDataJson) return null;
  try {
    const parsed = JSON.parse(attendeeDataJson);
    const value = parsed?.campos?.['buyer__rut'];
    return typeof value === 'string' && value.trim() ? value.trim() : null;
  } catch {
    return null;
  }
}

// Orders
export async function createOrder(input: {
  eventSlug: string;
  buyerName: string;
  buyerEmail: string;
  buyerPhone?: string;
  items: { ticketTypeId: number; quantity: number }[];
  discountCode?: string;
  ambassadorCode?: string;
  communityCode?: string;
  attendeeData?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmContent?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const event = await getEventBySlug(input.eventSlug);
  if (!event) throw new Error("Event not found");

  // Lista de bloqueo: si el RUT del comprador o de algún acompañante
  // coincide (exacto, normalizado), la compra se rechaza acá -- antes de
  // calcular precios/stock y antes de crear cualquier fila en `orders`, así
  // nunca llega a existir una orden ni se intenta cobrar nada.
  const attendeeRuts = parseAttendeeRuts(input.attendeeData);
  if (attendeeRuts.length > 0) {
    const blocked = await db.select().from(blockedCustomers)
      .where(and(inArray(blockedCustomers.rut, attendeeRuts), eq(blockedCustomers.isActive, 1)));
    if (blocked.length > 0) {
      throw new Error('No pudimos procesar tu compra. Si crees que es un error, escríbenos.');
    }
  }

  // Misión 300: mientras la ventana esté abierta (más de 3 días antes del
  // evento), las entradas category="acceso" se cobran al precio del abono
  // ($10.000/persona), no al precio general — el resto (diferencia hasta el
  // 60% si no se junta la meta, o nada si se junta) se resuelve después, ver
  // evaluateMission300() y el webhook de Mercado Pago.
  const missionOpen = isMissionActiveForEvent(event);
  let missionDeposit = false;

  // Calculate totals — separa el subtotal de accesos (a lo que aplica el
  // descuento) del de extras (parking/covers/etc, category="extra"), que
  // siempre se cobran completos.
  const tts = await getTicketTypesByEventId(event.id);
  let subtotal = 0;
  let accesoSubtotal = 0;
  const unitPrices = new Map<number, number>();
  for (const item of input.items) {
    const tt = tts.find(t => t.id === item.ticketTypeId);
    if (!tt) throw new Error(`Ticket type ${item.ticketTypeId} not found`);
    // Una fila cerrada por "Cerrar tanda" (manual o automático, ver
    // server/tandaAutoAdvance.ts) queda `status: 'soldout'` -- sin este
    // chequeo, alguien con el id viejo guardado podría seguir comprando al
    // precio de la fase anterior indefinidamente mientras le quedara stock.
    if (tt.status !== 'active') throw new Error(`${tt.name} ya no está disponible a este precio -- actualizá la página e intentá de nuevo.`);
    const available = tt.totalStock - tt.soldCount;
    if (item.quantity > available) throw new Error(`Not enough stock for ${tt.name}`);
    const useDeposit = missionOpen && tt.category === 'acceso';
    const unitPrice = useDeposit ? missionDepositPrice(tt.accesoSlug) : Number(tt.price);
    if (useDeposit) missionDeposit = true;
    unitPrices.set(item.ticketTypeId, unitPrice);
    const lineTotal = unitPrice * item.quantity;
    subtotal += lineTotal;
    if (tt.category === 'acceso') accesoSubtotal += lineTotal;
  }

  // Cupo compartido (stockPools): además del stock por fila de arriba, si
  // algún item pertenece a un pool hay que sumar TODO lo pedido para ese
  // mismo pool EN ESTA MISMA orden (alguien puede pedir un Dúo + una Soltera
  // en una sola compra, ambos del mismo pozo de 40) y rechazar si supera el
  // remanente real. Este es el bloqueo de verdad -- la home solo lo muestra,
  // acá es donde se hace cumplir. El remanente se calcula acá (necesita DB)
  // y la validación en sí vive en validateStockPoolCapacity(), pura, para
  // poder testearla sin base de datos.
  const poolIdsInOrder = Array.from(new Set(
    input.items.map((i) => tts.find((t) => t.id === i.ticketTypeId)?.stockPoolId).filter((id): id is number => id != null),
  ));
  const poolRemainingById = new Map<number, { remaining: number; name: string }>();
  for (const poolId of poolIdsInOrder) {
    const info = await getStockPoolRemaining(poolId);
    if (info) poolRemainingById.set(poolId, { remaining: info.remaining, name: info.pool.name });
  }
  validateStockPoolCapacity(input.items, tts, poolRemainingById);

  // Apply discount — solo sobre el subtotal de accesos, nunca sobre extras.
  let discountAmount = 0;
  let discountCodeId: number | undefined;
  if (input.discountCode) {
    const validation = await validateDiscountCode(input.discountCode, event.id);
    if (validation.valid && validation.discount) {
      const disc = validation.discount;
      discountCodeId = disc.id;
      if (disc.discountType === 'percentage') {
        discountAmount = Math.round(accesoSubtotal * Number(disc.discountValue) / 100);
      } else {
        discountAmount = Math.min(Number(disc.discountValue), accesoSubtotal);
      }
      // Increment used count
      await db.update(discountCodes).set({ usedCount: sql`usedCount + 1` }).where(eq(discountCodes.id, disc.id));
    }
  }

  // Confirm community access code (Soltero / Dúo Dos Hombres) — defense in depth,
  // el checkout ya lo valida en vivo antes de dejar avanzar.
  if (input.communityCode) {
    const validation = await validateCommunityCode(input.communityCode);
    if (!validation.valid) throw new Error(validation.message || 'Código de comunidad inválido');
    if (validation.communityCode) await markCommunityCodeUsed(validation.communityCode.id);
  }

  // Recargo por servicio: % configurable en Ajustes, se calcula sobre el
  // total YA con el descuento aplicado (entradas + extras) y se suma encima
  // -- se guarda el monto ya calculado en orders.serviceFee, no el %, para
  // que quede fijo aunque el % de siteSettings cambie después.
  const preTotal = Math.max(0, subtotal - discountAmount);
  const settings = await getSiteSettings();
  const serviceFeePercent = Number(settings.serviceFeePercent ?? 0);
  const serviceFee = serviceFeePercent > 0 ? Math.round(preTotal * serviceFeePercent / 100) : 0;
  const total = preTotal + serviceFee;
  const orderNumber = `MP-${Date.now().toString(36).toUpperCase()}-${nanoid(4).toUpperCase()}`;

  // Create order
  const [orderResult] = await db.insert(orders).values({
    orderNumber,
    buyerName: input.buyerName,
    buyerEmail: input.buyerEmail,
    buyerPhone: input.buyerPhone,
    eventId: event.id,
    subtotal: String(subtotal),
    discount: String(discountAmount),
    serviceFee: String(serviceFee),
    total: String(total),
    discountCodeId,
    ambassadorCode: input.ambassadorCode,
    // Congelado para siempre, a diferencia de ambassadorCode (que
    // ensureOwnAmbassadorCode pisa más adelante) -- ver comentario en el schema.
    referredByCode: input.ambassadorCode || null,
    paymentStatus: 'pending',
    missionDeposit: missionDeposit ? 1 : 0,
    attendeeData: input.attendeeData,
    utmSource: input.utmSource,
    utmMedium: input.utmMedium,
    utmCampaign: input.utmCampaign,
    utmContent: input.utmContent,
  });

  const orderId = orderResult.insertId;

  // Create order items. soldCount (y con él, el contador de Misión 300) NO se
  // toca acá — la orden todavía está "pending", nadie pagó nada. Se
  // incrementa recién cuando el webhook de Mercado Pago confirma el pago
  // (ver processApprovedOrder en webhooks.ts) para que cancelar/abandonar el
  // pago no infle el contador.
  for (const item of input.items) {
    const unitPrice = unitPrices.get(item.ticketTypeId)!;
    const tt = tts.find(t => t.id === item.ticketTypeId);
    await db.insert(orderItems).values({
      orderId,
      ticketTypeId: item.ticketTypeId,
      quantity: item.quantity,
      unitPrice: String(unitPrice),
      totalPrice: String(unitPrice * item.quantity),
      // Copia el costo del producto al momento de la venta (docs/ARQUITECTURA-CAJA.md
      // §12) -- si el costo se edita después, la utilidad histórica no cambia.
      unitCost: tt?.costPrice != null ? String(tt.costPrice) : null,
    });
  }

  // Si el descuento cubre el 100% del total (solo pasa cuando no hay extras
  // sin descontar — ver el cálculo de discountAmount arriba), no hay nada
  // que cobrar: la orden queda confirmada al instante, sin pasar por
  // Mercado Pago. Se suma el stock acá mismo (normalmente eso lo hace el
  // pago aprobado) y el router dispara el email de bienvenida con el QR.
  const isFree = total === 0;
  if (isFree) {
    await db.update(orders).set({
      paymentStatus: 'approved',
      paymentId: `FREE-${orderNumber}`,
      // Si esta orden usaba precio de abono Misión 300, no queda diferencia
      // por cobrar después — se resuelve de una, no entra a evaluateMission300.
      ...(missionDeposit ? { missionTopupStatus: 'paid', missionTopupAmount: '0' } : {}),
    }).where(eq(orders.id, orderId));

    for (const item of input.items) {
      await db.update(ticketTypes).set({ soldCount: sql`soldCount + ${item.quantity}` }).where(eq(ticketTypes.id, item.ticketTypeId));
    }
    // Esta compra gratis puede ser justo la que agota el cupo compartido de
    // la tanda vigente -- chequea acá mismo si toca pasar de fase sola (ver
    // server/tandaAutoAdvance.ts).
    await checkAndAdvanceTandaIfNeeded(event.id);
  }

  return { orderId, orderNumber, total, isFree };
}

/** Reporte "ventas por origen" (agujero 2 del plan de ventas: con $0 de
 * pauta, saber qué reel/historia/link trae ventas de verdad es la única
 * ventaja competitiva que hay). Agrupa por utmSource/utmMedium/utmCampaign,
 * solo ventas web ya aprobadas -- pending no es venta todavía, caja/import
 * nunca traen UTM porque no pasan por un link. Las que no vinieron de un
 * link etiquetado (directo, buscador, embajador con su propio código) caen
 * en el grupo "(sin UTM)", que sigue siendo información útil: cuánto de la
 * venta total no se puede explicar por ningún link. */
export async function getSalesByUtmOrigin() {
  const db = await getDb();
  if (!db) return [];

  const rows = await db
    .select({
      utmSource: orders.utmSource,
      utmMedium: orders.utmMedium,
      utmCampaign: orders.utmCampaign,
      ordersCount: sql<number>`count(*)`,
      revenue: sql<number>`sum(${orders.total})`,
    })
    .from(orders)
    .where(and(eq(orders.paymentStatus, 'approved'), eq(orders.channel, 'web')))
    .groupBy(orders.utmSource, orders.utmMedium, orders.utmCampaign)
    .orderBy(desc(sql`sum(${orders.total})`));

  return rows.map((r) => ({
    utmSource: r.utmSource ?? '(sin UTM)',
    utmMedium: r.utmMedium ?? null,
    utmCampaign: r.utmCampaign ?? null,
    ordersCount: Number(r.ordersCount),
    revenue: Number(r.revenue ?? 0),
  }));
}

/** Parte pura de createManualOrder(): valida stock y calcula el precio de
 * cada item -- separada para poder testearla sin base de datos. Una
 * invitación sale a $0 siempre, sin importar el tipo de entrada. Un acceso
 * "ya pagado" usa por defecto el mismo criterio que el checkout real (precio
 * de abono Misión 300 si la ventana está abierta y es category='acceso', si
 * no el precio de lista), pero el admin puede escribir un monto propio por
 * item (`item.unitPrice`) -- pedido explícito del usuario: cobra montos
 * distintos según el caso (invitados con descuento, acuerdos puntuales,
 * etc.) y el precio de catálogo no siempre es el que realmente cobró. Tira
 * si falta stock o el tipo no existe en el evento. */
export function priceManualOrderItems(
  items: { ticketTypeId: number; quantity: number; unitPrice?: number }[],
  ticketTypesForEvent: { id: number; name: string; category: string; accesoSlug: string | null; price: string | number; totalStock: number; soldCount: number }[],
  kind: 'invitation' | 'paid',
  missionOpen: boolean,
): { unitPrices: Map<number, number>; subtotal: number; missionDeposit: boolean } {
  let subtotal = 0;
  let missionDeposit = false;
  const unitPrices = new Map<number, number>();

  for (const item of items) {
    const tt = ticketTypesForEvent.find(t => t.id === item.ticketTypeId);
    if (!tt) throw new Error(`Ticket type ${item.ticketTypeId} not found`);
    const available = tt.totalStock - tt.soldCount;
    if (item.quantity > available) throw new Error(`Not enough stock for ${tt.name}`);
    const useDeposit = missionOpen && tt.category === 'acceso';
    const defaultPrice = useDeposit ? missionDepositPrice(tt.accesoSlug) : Number(tt.price);
    const unitPrice = kind === 'invitation' ? 0 : (item.unitPrice != null ? Math.max(0, item.unitPrice) : defaultPrice);
    if (kind === 'paid' && useDeposit) missionDeposit = true;
    unitPrices.set(item.ticketTypeId, unitPrice);
    subtotal += unitPrice * item.quantity;
  }

  return { unitPrices, subtotal, missionDeposit };
}

/** Prefijo fijo que después usa listManualOrders() para filtrar el
 * historial, sin necesitar una columna/enum nuevo -- ningún otro flujo
 * escribe paymentMethod con este prefijo (Mercado Pago manda ids como
 * "visa"/"account_money", caja manda "efectivo"/"debito"/"credito"). */
export function buildManualPaymentMethod(kind: 'invitation' | 'paid', paymentMethod?: string): string {
  return kind === 'invitation' ? 'Manual: Invitación' : `Manual: ${paymentMethod?.trim() || 'Transferencia'}`;
}

export async function createManualOrder(input: {
  eventSlug: string;
  buyerName: string;
  buyerEmail: string;
  buyerPhone?: string;
  items: { ticketTypeId: number; quantity: number; unitPrice?: number }[];
  kind: 'invitation' | 'paid';
  paymentMethod?: string;
  attendeeData?: string;
}): Promise<{ orderId: number; orderNumber: string; total: number }> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  if (input.items.length === 0) throw new Error("Elige al menos un tipo de entrada");

  const event = await getEventBySlug(input.eventSlug);
  if (!event) throw new Error("Event not found");

  const missionOpen = isMissionActiveForEvent(event);
  const tts = await getTicketTypesByEventId(event.id);
  const { unitPrices, subtotal, missionDeposit } = priceManualOrderItems(input.items, tts, input.kind, missionOpen);

  const total = subtotal;
  const orderNumber = `MP-${Date.now().toString(36).toUpperCase()}-${nanoid(4).toUpperCase()}`;
  const paymentMethod = buildManualPaymentMethod(input.kind, input.paymentMethod);

  const [orderResult] = await db.insert(orders).values({
    orderNumber,
    buyerName: input.buyerName,
    buyerEmail: input.buyerEmail,
    buyerPhone: input.buyerPhone,
    eventId: event.id,
    subtotal: String(subtotal),
    discount: '0',
    serviceFee: '0',
    total: String(total),
    paymentStatus: 'approved',
    paymentId: `MANUAL-${orderNumber}`,
    paymentMethod,
    missionDeposit: missionDeposit ? 1 : 0,
    ...(missionDeposit ? { missionTopupStatus: 'paid' as const, missionTopupAmount: '0' } : {}),
    attendeeData: input.attendeeData,
  });

  const orderId = orderResult.insertId;

  for (const item of input.items) {
    const unitPrice = unitPrices.get(item.ticketTypeId)!;
    const tt = tts.find(t => t.id === item.ticketTypeId);
    await db.insert(orderItems).values({
      orderId,
      ticketTypeId: item.ticketTypeId,
      quantity: item.quantity,
      unitPrice: String(unitPrice),
      totalPrice: String(unitPrice * item.quantity),
      unitCost: tt?.costPrice != null ? String(tt.costPrice) : null,
    });
    // La orden ya nace 'approved' (no pasa por el webhook de Mercado Pago
    // que normalmente hace esto) -- hay que sumar el stock acá mismo, es lo
    // que hace reaccionar al contador de Misión 300 de la home.
    await db.update(ticketTypes).set({ soldCount: sql`soldCount + ${item.quantity}` }).where(eq(ticketTypes.id, item.ticketTypeId));
  }

  return { orderId, orderNumber, total };
}

/** Correo placeholder para órdenes que el admin crea sin comprador real
 * (invitación especial instantánea, consumo gratis de staff) -- nunca se usa
 * para enviar nada: estas dos funciones no pasan por processApprovedOrder
 * (server/webhooks.ts), así que no disparan el correo de confirmación ni
 * registran cliente/Playcoins. Solo existe para satisfacer el NOT NULL de
 * orders.buyerEmail. */
const ADMIN_PLACEHOLDER_EMAIL = 'invitacion@mansionplayroom.cl';

/** El ticketType fijo que usa la invitación especial instantánea: uno por
 * evento, creado la primera vez que se usa el botón. `accesoSlug: null` hace
 * que personasForAccesoSlug() devuelva 1 por defecto (shared/mission300.ts),
 * así que el conteo de personas de cada invitación vive en `tickets.groupSize`
 * y no en la tabla fija de slugs. `status: 'hidden'` lo saca de /entradas; el
 * wizard de Checkout tampoco lo alcanza porque solo reconoce los 7 slugs fijos
 * de CANDYLAND.accesos (client/src/config/candyland.ts). */
async function getOrCreateInstantInviteTicketType(eventId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [existing] = await db.select().from(ticketTypes)
    .where(and(eq(ticketTypes.eventId, eventId), eq(ticketTypes.name, 'Invitación Especial')))
    .limit(1);
  if (existing) return existing;

  const [result] = await db.insert(ticketTypes).values({
    eventId,
    name: 'Invitación Especial',
    category: 'acceso',
    accesoSlug: null,
    price: '0',
    totalStock: 999999,
    status: 'hidden',
    emoji: '🎟️',
  });
  const [created] = await db.select().from(ticketTypes).where(eq(ticketTypes.id, result.insertId)).limit(1);
  return created;
}

/** Botón "Invitación especial instantánea" de Accesos Manuales: el dueño solo
 * escribe cuántas personas son, sin ningún otro dato. Deliberadamente NO
 * reusa createManualOrder/processApprovedOrder (server/webhooks.ts) -- esa
 * ruta exige un comprador real y siempre intenta mandar el correo de
 * confirmación, que acá no tiene destinatario. Genera un solo ticket/QR para
 * las N personas (en vez de N tickets, uno por persona) porque el pedido es
 * "un solo QR, escaneado una vez, que muestre la cantidad de personas" -- ver
 * `tickets.groupSize` y su uso en getCajaDashboard/getTicketByCode/
 * getCajaSnapshot y en Puerta.tsx. */
export async function createInstantInvite({ eventSlug, personas }: { eventSlug: string; personas: number }) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const event = await getEventBySlug(eventSlug);
  if (!event) throw new Error("Event not found");

  const tt = await getOrCreateInstantInviteTicketType(event.id);

  const orderNumber = `MP-${Date.now().toString(36).toUpperCase()}-${nanoid(4).toUpperCase()}`;
  const [orderResult] = await db.insert(orders).values({
    orderNumber,
    buyerName: 'Invitación especial',
    buyerEmail: ADMIN_PLACEHOLDER_EMAIL,
    eventId: event.id,
    subtotal: '0',
    discount: '0',
    serviceFee: '0',
    total: '0',
    paymentStatus: 'approved',
    paymentId: `MANUAL-${orderNumber}`,
    paymentMethod: 'Manual: Invitación especial',
  });
  const orderId = orderResult.insertId;

  const [itemResult] = await db.insert(orderItems).values({
    orderId,
    ticketTypeId: tt.id,
    quantity: personas,
    unitPrice: '0',
    totalPrice: '0',
  });
  await db.update(ticketTypes).set({ soldCount: sql`soldCount + ${personas}` }).where(eq(ticketTypes.id, tt.id));

  const ticketCode = `MP-${nanoid(12).toUpperCase()}`;
  const { qrData, qrImageUrl } = await generateTicketQR(ticketCode, event.title);
  await db.insert(tickets).values({
    ticketCode,
    orderId,
    orderItemId: itemResult.insertId,
    eventId: event.id,
    ticketTypeId: tt.id,
    holderName: 'Invitación especial',
    qrData,
    qrImageUrl,
    status: 'valid',
    groupSize: personas,
  });

  return { ticketCode, qrImageUrl, personas };
}

/** Botón "Invitar consumo gratis a staff" de Accesos Manuales: el dueño elige
 * un producto de la Carta de la Fiesta, cuántas unidades y para quién es.
 * Tampoco pasa por createManualOrder/processApprovedOrder (mismo motivo que
 * createInstantInvite). Genera `quantity` tickets separados -- uno por
 * unidad, cada uno con su propio displayCode -- para que la cajera pueda
 * canjearlos de a uno a medida que la persona va pidiendo, igual que ya
 * funciona hoy con los extras comprados por la web. No se valida stock
 * (mismo criterio "nunca bloquear la venta" ya aplicado en la Carta de la
 * Fiesta, PR Y1). */
export async function createStaffComp({ eventSlug, ticketTypeId, quantity, staffName }: {
  eventSlug: string; ticketTypeId: number; quantity: number; staffName: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const event = await getEventBySlug(eventSlug);
  if (!event) throw new Error("Event not found");

  const [tt] = await db.select().from(ticketTypes).where(eq(ticketTypes.id, ticketTypeId)).limit(1);
  if (!tt || tt.eventId !== event.id) throw new Error("Ese producto no existe en este evento");
  if (!['consumo', 'locker', 'merch'].includes(tt.category)) throw new Error("Elige un producto de la Carta de la Fiesta");

  const orderNumber = `MP-${Date.now().toString(36).toUpperCase()}-${nanoid(4).toUpperCase()}`;
  const [orderResult] = await db.insert(orders).values({
    orderNumber,
    buyerName: staffName,
    buyerEmail: ADMIN_PLACEHOLDER_EMAIL,
    eventId: event.id,
    subtotal: '0',
    discount: '0',
    serviceFee: '0',
    total: '0',
    paymentStatus: 'approved',
    paymentId: `MANUAL-${orderNumber}`,
    paymentMethod: 'Manual: Consumo Staff',
  });
  const orderId = orderResult.insertId;

  const [itemResult] = await db.insert(orderItems).values({
    orderId,
    ticketTypeId: tt.id,
    quantity,
    unitPrice: '0',
    totalPrice: '0',
  });
  await db.update(ticketTypes).set({ soldCount: sql`soldCount + ${quantity}` }).where(eq(ticketTypes.id, tt.id));

  const prefix = tt.internalCode || fallbackInternalCode(tt.name);
  const displayCodes: string[] = [];
  for (let i = 0; i < quantity; i++) {
    const ticketCode = `MP-${nanoid(12).toUpperCase()}`;
    const { qrData, qrImageUrl } = await generateTicketQR(ticketCode, event.title);
    const displayCode = generateDisplayCode(prefix);
    await db.insert(tickets).values({
      ticketCode,
      orderId,
      orderItemId: itemResult.insertId,
      eventId: event.id,
      ticketTypeId: tt.id,
      holderName: staffName,
      qrData,
      qrImageUrl,
      status: 'valid',
      displayCode,
    });
    displayCodes.push(displayCode);
  }

  return { displayCodes, productName: tt.name };
}

/** Consumos de staff creados desde Accesos Manuales (pendientes y canjeados),
 * para que el dueño tenga visibilidad -- misma distinción por prefijo fijo en
 * paymentMethod que ya usa listManualOrders(). */
export async function listStaffComps(eventId: number) {
  const db = await getDb();
  if (!db) return [];

  const rows = await db.select({
    ticketCode: tickets.ticketCode,
    displayCode: tickets.displayCode,
    status: tickets.status,
    staffName: tickets.holderName,
    createdAt: tickets.createdAt,
    productName: ticketTypes.name,
  })
    .from(tickets)
    .innerJoin(orders, eq(orders.id, tickets.orderId))
    .innerJoin(ticketTypes, eq(ticketTypes.id, tickets.ticketTypeId))
    .where(and(eq(orders.eventId, eventId), eq(orders.paymentMethod, 'Manual: Consumo Staff')))
    .orderBy(desc(tickets.createdAt));

  return rows;
}

/** Historial de accesos manuales para el admin (server/routers.ts
 * orders.listManual) -- se distinguen de las ventas reales por el prefijo
 * fijo "Manual: " en paymentMethod (ver createManualOrder), más recientes
 * primero. */
export async function listManualOrders() {
  const db = await getDb();
  if (!db) return [];
  return db.select({
    id: orders.id,
    orderNumber: orders.orderNumber,
    createdAt: orders.createdAt,
    eventTitle: events.title,
    buyerName: orders.buyerName,
    buyerEmail: orders.buyerEmail,
    total: orders.total,
    paymentMethod: orders.paymentMethod,
  }).from(orders)
    .leftJoin(events, eq(orders.eventId, events.id))
    .where(like(orders.paymentMethod, 'Manual: %'))
    .orderBy(desc(orders.createdAt));
}

/** `channel`: 'web' = ventas del sitio (incluye 'import', la migración de la
 * ticketera anterior -- nunca fueron ventas de caja); 'caja' = solo ventas
 * presenciales. Nunca se mezclan en pantalla (pedido explícito del usuario). */
export async function getAllOrders(page: number = 1, limit: number = 50, status?: string, channel?: 'web' | 'caja') {
  const db = await getDb();
  if (!db) return { orders: [], total: 0 };

  const offset = (page - 1) * limit;
  const conditions = [];
  if (status) conditions.push(eq(orders.paymentStatus, status as any));
  if (channel === 'caja') conditions.push(eq(orders.channel, 'caja'));
  else if (channel === 'web') conditions.push(sql`${orders.channel} != 'caja'`);
  const query = db.select().from(orders)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(orders.createdAt)).limit(limit).offset(offset);

  const allOrders = await query;

  // Resumen de extras (estacionamiento, cover, etc.) por orden, para
  // mostrarlos de un vistazo en la tabla del admin sin tener que abrir
  // "Ver tickets" -- un solo query con IN(...), no N+1.
  const orderIds = allOrders.map((o) => o.id);
  const extrasByOrderId = new Map<number, { name: string; quantity: number }[]>();
  if (orderIds.length > 0) {
    const extraItems = await db.select({
      orderId: orderItems.orderId,
      name: ticketTypes.name,
      quantity: orderItems.quantity,
    })
      .from(orderItems)
      .innerJoin(ticketTypes, eq(orderItems.ticketTypeId, ticketTypes.id))
      .where(and(inArray(orderItems.orderId, orderIds), eq(ticketTypes.category, 'extra')));

    for (const item of extraItems) {
      const list = extrasByOrderId.get(item.orderId) ?? [];
      list.push({ name: item.name, quantity: item.quantity });
      extrasByOrderId.set(item.orderId, list);
    }
  }

  const ordersWithExtras = allOrders.map((o) => ({ ...o, extras: extrasByOrderId.get(o.id) ?? [] }));
  return { orders: ordersWithExtras, total: ordersWithExtras.length };
}

/** Todos los tickets (entrada principal + extras) de una orden, para el
 * panel admin — poder ver/reenviar los códigos generados sin tener que
 * buscar en la base a mano. */
export async function getOrderTickets(orderId: number) {
  const db = await getDb();
  if (!db) return [];

  const orderTickets = await db.select().from(tickets).where(eq(tickets.orderId, orderId));
  const result = [];
  for (const t of orderTickets) {
    const [tt] = await db.select().from(ticketTypes).where(eq(ticketTypes.id, t.ticketTypeId)).limit(1);
    result.push({
      ticketCode: t.ticketCode,
      status: t.status,
      holderName: t.holderName,
      ticketTypeName: tt?.name ?? 'Entrada',
      category: tt?.category ?? 'acceso',
    });
  }
  return result;
}

/** Parte pura de deleteOrderCascade(): decide qué ajustes hacen falta al
 * borrar una orden, sin tocar la base -- separada para poder testearla sin
 * conexión (mismo patrón que priceManualOrderItems/tallyTags).
 * - `decrementSoldCount`: el stock solo se incrementó si la orden llegó a
 *   'approved' (o luego 'refunded', que hoy no revierte el contador) --
 *   fuera de esos estados, decrementar regalaría stock que nunca se descontó.
 * - `decrementCustomerTotals`: customers.totalOrders/totalSpent son una
 *   proyección de upsertCustomerFromOrder, que solo corre para ventas web
 *   aprobadas.
 * - `playcoinsReversals`: un delta por reversar por cada fila del ledger
 *   ligada a esta orden (normalmente una sola, por la idempotencia de
 *   awardPlaycoins), con el signo invertido. */
export function computeOrderDeleteEffects(
  order: { paymentStatus: string; channel: string },
  ledgerEntries: { customerId: number; delta: number }[],
): {
  decrementSoldCount: boolean;
  decrementCustomerTotals: boolean;
  playcoinsReversals: { customerId: number; delta: number }[];
} {
  return {
    decrementSoldCount: order.paymentStatus === 'approved' || order.paymentStatus === 'refunded',
    decrementCustomerTotals: order.channel === 'web' && order.paymentStatus === 'approved',
    playcoinsReversals: ledgerEntries.filter((e) => e.delta !== 0).map((e) => ({ customerId: e.customerId, delta: -e.delta })),
  };
}

/** Elimina una orden y todo lo que depende de ella (pedido explícito del
 * usuario, irreversible). No hay foreign keys en la base (ver comentarios
 * del schema), así que hay que limpiar a mano cada tabla relacionada:
 * - orderItems, tickets, referrals: dependen 1:1 de orderId, se borran.
 * - playcoinsLedger es append-only (mismo principio que `ops`, ver
 *   comentario del schema) -- en vez de borrar sus filas, se revierte el
 *   saldo con `adjustPlaycoinsManually`, que agrega una fila nueva de
 *   ajuste y mantiene la auditoría completa.
 * Qué ajustar exactamente sale de computeOrderDeleteEffects(). */
export async function deleteOrderCascade(orderId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!order) return { success: true };

  const ledgerEntries = await db.select().from(playcoinsLedger).where(eq(playcoinsLedger.orderId, orderId));
  const effects = computeOrderDeleteEffects(order, ledgerEntries);

  if (effects.decrementSoldCount) {
    const items = await db.select().from(orderItems).where(eq(orderItems.orderId, orderId));
    for (const item of items) {
      await db.update(ticketTypes).set({ soldCount: sql`GREATEST(soldCount - ${item.quantity}, 0)` }).where(eq(ticketTypes.id, item.ticketTypeId));
    }
  }

  for (const reversal of effects.playcoinsReversals) {
    await adjustPlaycoinsManually(reversal.customerId, reversal.delta, `Orden #${order.orderNumber} eliminada`);
  }

  if (effects.decrementCustomerTotals) {
    const email = order.buyerEmail.trim().toLowerCase();
    const [customer] = await db.select().from(customers).where(eq(customers.email, email)).limit(1);
    if (customer) {
      await db.update(customers).set({
        totalOrders: Math.max(0, customer.totalOrders - 1),
        totalSpent: String(Math.max(0, Number(customer.totalSpent) - Number(order.total))),
      }).where(eq(customers.id, customer.id));
    }
  }

  await db.delete(orderItems).where(eq(orderItems.orderId, orderId));
  await db.delete(tickets).where(eq(tickets.orderId, orderId));
  await db.delete(referrals).where(eq(referrals.orderId, orderId));
  // La comisión del embajador quedaba huérfana al borrar la orden y el
  // reporte seguía cobrándola. Si esa era la PRIMERA compra del cliente,
  // también se suelta la propiedad: sin esa orden, el embajador nunca lo trajo.
  await db.delete(ambassadorCommissions).where(eq(ambassadorCommissions.orderId, orderId));
  await db.delete(ambassadorClients).where(eq(ambassadorClients.firstOrderId, orderId));
  await db.delete(orders).where(eq(orders.id, orderId));

  return { success: true };
}

/** Reinicia los datos de prueba de caja/cocina/guardarropía para un evento
 * antes del estreno real (pedido explícito del usuario, pensado para
 * apretarse las veces que haga falta mientras siga probando). Reutiliza
 * deleteOrderCascade por cada venta channel='caja' -- revierte soldCount,
 * playcoins y totales igual que borrar una orden a mano -- y además limpia
 * lo que esa función no toca: kitchenTickets/lockerItems (propias de caja),
 * turnos (shifts) y las filas de `ops` de tipos de caja/cocina/guardarropía.
 *
 * A propósito NO toca: compras web (channel != 'caja'), check-ins de
 * /puerta (ops.type='checkin') ni canjes de extras comprados por la web
 * (ops.type='redeem') -- ambos podrían mezclarse con actividad real de hoy. */
export async function resetEventTestData(eventId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const cajaOrders = await db.select({ id: orders.id }).from(orders)
    .where(and(eq(orders.eventId, eventId), eq(orders.channel, 'caja')));
  const orderIds = cajaOrders.map((o) => o.id);

  // Por eventId, no por orderId: kitchenTickets/lockerItems solo se llenan
  // desde ventas de caja, así que filtrar por evento ya es el conjunto
  // correcto -- y de paso agarra filas huérfanas de una orden borrada antes
  // con el botón "Eliminar" de Ventas Caja (deleteOrderCascade no toca estas
  // dos tablas), que un filtro por orderId actual nunca podría encontrar.
  await db.delete(kitchenTickets).where(eq(kitchenTickets.eventId, eventId));
  await db.delete(lockerItems).where(eq(lockerItems.eventId, eventId));
  for (const id of orderIds) {
    await deleteOrderCascade(id);
  }

  await db.delete(ops).where(and(
    eq(ops.eventId, eventId),
    inArray(ops.type, ['sale', 'shift_open', 'shift_close', 'manual_adjust', 'locker_return', 'kitchen_update', 'void_code']),
  ));
  await db.delete(shifts).where(eq(shifts.eventId, eventId));

  // soldCount de la carta ya vuelve a 0 solo al revertir cada venta arriba
  // (son productos que solo se venden en caja) -- esto además saca
  // cualquier "agotado" (status='soldout') que haya quedado de las pruebas.
  await db.update(ticketTypes).set({ soldCount: 0, status: 'active' })
    .where(and(eq(ticketTypes.eventId, eventId), inArray(ticketTypes.category, ['consumo', 'locker', 'merch'])));

  return { ordersDeleted: orderIds.length };
}

// Export completo (sin paginar) para CSV — filtra por evento/rango de fechas/estado.
export async function getOrdersForExport(filters: { eventId?: number; dateFrom?: string; dateTo?: string; status?: string; channel?: 'web' | 'caja' }) {
  const db = await getDb();
  if (!db) return [];

  const conditions = [];
  if (filters.eventId) conditions.push(eq(orders.eventId, filters.eventId));
  if (filters.status) conditions.push(eq(orders.paymentStatus, filters.status as any));
  if (filters.dateFrom) conditions.push(gte(orders.createdAt, new Date(filters.dateFrom)));
  if (filters.dateTo) conditions.push(lte(orders.createdAt, new Date(filters.dateTo)));
  if (filters.channel === 'caja') conditions.push(eq(orders.channel, 'caja'));
  else if (filters.channel === 'web') conditions.push(sql`${orders.channel} != 'caja'`);

  const rows = await db.select({
    orderNumber: orders.orderNumber,
    createdAt: orders.createdAt,
    eventTitle: events.title,
    buyerName: orders.buyerName,
    buyerEmail: orders.buyerEmail,
    buyerPhone: orders.buyerPhone,
    subtotal: orders.subtotal,
    discount: orders.discount,
    total: orders.total,
    paymentStatus: orders.paymentStatus,
    paymentMethod: orders.paymentMethod,
    ambassadorCode: orders.ambassadorCode,
  }).from(orders)
    .leftJoin(events, eq(orders.eventId, events.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(orders.createdAt));

  return rows;
}

export async function getOrderStats(channel?: 'web' | 'caja') {
  const db = await getDb();
  if (!db) return { totalOrders: 0, totalRevenue: 0, approvedOrders: 0 };

  const where = channel === 'caja' ? eq(orders.channel, 'caja') : channel === 'web' ? sql`${orders.channel} != 'caja'` : undefined;
  const [stats] = await db.select({
    totalOrders: sql<number>`COUNT(*)`,
    totalRevenue: sql<number>`COALESCE(SUM(CASE WHEN paymentStatus = 'approved' THEN total ELSE 0 END), 0)`,
    approvedOrders: sql<number>`SUM(CASE WHEN paymentStatus = 'approved' THEN 1 ELSE 0 END)`,
  }).from(orders).where(where);

  return stats;
}

// Referrals
export async function getReferralStats() {
  const db = await getDb();
  if (!db) return [];
  return db.select({
    ambassadorCode: referrals.ambassadorCode,
    ambassadorUserId: referrals.ambassadorUserId,
    totalReferrals: sql<number>`COUNT(*)`,
    totalTickets: sql<number>`SUM(ticketCount)`,
    totalRevenue: sql<number>`SUM(orderTotal)`,
  }).from(referrals).groupBy(referrals.ambassadorCode, referrals.ambassadorUserId);
}

export async function getUserReferrals(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(referrals).where(eq(referrals.ambassadorUserId, userId)).orderBy(desc(referrals.createdAt));
}

/** Ranking público para el Hall de la Fama -- a diferencia de getReferralStats
 * (admin, incluye montos $), esto solo expone lo necesario para una
 * competencia pública: código, primer nombre (nunca apellido) y cantidad de
 * ventas. Se escala por evento (vía referrals.orderId -> orders.eventId) a
 * propósito -- no se suma todo junto -- para que el mismo query sirva más
 * adelante para "últimas 3 fiestas" (pasando varios eventId) o el acumulado
 * anual (sin filtro), sin tener que tocar el schema. Solo incluye códigos
 * con al menos 1 venta (incluidos vía el propio GROUP BY). */
export async function getReferralLeaderboard(eventId: number) {
  const db = await getDb();
  if (!db) return [];

  const rows = await db
    .select({
      ambassadorCode: referrals.ambassadorCode,
      totalReferrals: sql<number>`COUNT(*)`,
      lastReferralAt: sql<Date>`MAX(${referrals.createdAt})`,
    })
    .from(referrals)
    .innerJoin(orders, eq(orders.id, referrals.orderId))
    .where(eq(orders.eventId, eventId))
    .groupBy(referrals.ambassadorCode)
    .orderBy(desc(sql`COUNT(*)`));

  const leaderboard = [];
  for (const row of rows) {
    const [owner] = await db.select().from(orders)
      .where(and(eq(orders.ambassadorCode, row.ambassadorCode), eq(orders.paymentStatus, 'approved')))
      .limit(1);
    if (!owner) continue;
    leaderboard.push({
      ambassadorCode: row.ambassadorCode,
      firstName: owner.buyerName.trim().split(/\s+/)[0],
      totalReferrals: Number(row.totalReferrals),
      recentStreak: Date.now() - new Date(row.lastReferralAt).getTime() <= 48 * 60 * 60 * 1000,
    });
  }
  return leaderboard;
}

/** Estadísticas + historial de un embajador buscando directo por su código
 * (sin login) — el mismo código que le llega en su email de confirmación. */
export async function getReferralsByCode(ambassadorCode: string) {
  const db = await getDb();
  if (!db) return null;

  const code = ambassadorCode.trim().toUpperCase();
  if (!code) return null;

  // Confirma que el código realmente existe (le pertenece a alguna orden
  // aprobada) antes de devolver "0 referidos" para un código inventado.
  const [owner] = await db.select().from(orders).where(and(eq(orders.ambassadorCode, code), eq(orders.paymentStatus, 'approved'))).limit(1);
  if (!owner) return null;

  const rows = await db.select().from(referrals).where(eq(referrals.ambassadorCode, code)).orderBy(desc(referrals.createdAt));
  return { ambassadorCode: code, buyerName: owner.buyerName, referrals: rows };
}

// --- Embajadores exclusivos con comisión (pedido explícito del usuario) ---
// A diferencia de un embajador orgánico (cualquier comprador, tabla
// `referrals` arriba), estos se dan de alta a mano y cobran una comisión en
// plata por venta -- su código no da descuento, solo trackea quién trajo la
// venta (ver bloque de embajadores en webhooks.ts).

/** Base sobre la que se calcula la comisión: solo el valor de las entradas
 * (accesos) de la orden, sin el recargo por servicio ni los extras (pedido
 * explícito del usuario), con el descuento ya restado -- el descuento solo
 * se aplica sobre accesos (ver createOrder). Parte pura, testeable sin base
 * de datos. */
export function computeAmbassadorCommissionBase(accesoSubtotal: number, discount: number): number {
  return Math.max(0, accesoSubtotal - discount);
}

/** Comisión exacta a pagar sobre una base ya neta de descuento. Parte pura,
 * misma convención de redondeo que el resto del proyecto (Math.round). */
export function computeAmbassadorCommission(baseAmount: number, commissionPercent: number): number {
  return Math.round(baseAmount * commissionPercent / 100);
}

/** Da de alta un embajador. `eventId` quedó opcional: el código es permanente
 * y de la persona, no del evento. `commissionPercent` en null/undefined
 * significa "usar la escala global del programa" (lo normal); con un valor
 * queda como override fijo para ese embajador. */
export async function createExclusiveAmbassador(data: {
  eventId?: number | null; name: string; code: string;
  commissionPercent?: number | null; contact?: string; email?: string; instagram?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const code = data.code.trim().toUpperCase();
  // El único de la columna ya lo impediría, pero el error de MySQL no le dice
  // nada al dueño -- este mensaje sí.
  const [existing] = await db.select({ id: exclusiveAmbassadors.id }).from(exclusiveAmbassadors)
    .where(eq(exclusiveAmbassadors.code, code)).limit(1);
  if (existing) throw new Error(`El código ${code} ya está en uso por otro embajador`);

  try {
    await db.insert(exclusiveAmbassadors).values({
      eventId: data.eventId ?? null,
      name: data.name,
      code,
      commissionPercent: data.commissionPercent === null || data.commissionPercent === undefined ? null : String(data.commissionPercent),
      contact: data.contact,
      email: data.email ? data.email.trim().toLowerCase() : null,
      instagram: data.instagram,
    });
  } catch (err) {
    // drizzle envuelve el error real de la base en `.cause` y deja en
    // `.message` solo un volcado del SQL -- sin esto, el admin ve
    // "Failed query: insert into..." y no tiene forma de saber qué pasó.
    throw new Error((err as any)?.cause?.message ?? (err as Error).message);
  }
  return { success: true };
}

export async function listExclusiveAmbassadors(eventId?: number) {
  const db = await getDb();
  if (!db) return [];
  const conditions = eventId ? [eq(exclusiveAmbassadors.eventId, eventId)] : [];
  return db.select().from(exclusiveAmbassadors)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(exclusiveAmbassadors.name);
}

export async function updateExclusiveAmbassador(id: number, data: {
  name?: string; code?: string; commissionPercent?: number | null;
  contact?: string; email?: string; instagram?: string; active?: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const updateData: any = { ...data };
  if (data.code !== undefined) {
    const code = data.code.trim().toUpperCase();
    const [clash] = await db.select({ id: exclusiveAmbassadors.id }).from(exclusiveAmbassadors)
      .where(and(eq(exclusiveAmbassadors.code, code), ne(exclusiveAmbassadors.id, id))).limit(1);
    if (clash) throw new Error(`El código ${code} ya está en uso por otro embajador`);
    updateData.code = code;
  }
  if (data.commissionPercent !== undefined) {
    updateData.commissionPercent = data.commissionPercent === null ? null : String(data.commissionPercent);
  }
  if (data.email !== undefined) updateData.email = data.email ? data.email.trim().toLowerCase() : null;
  try {
    await db.update(exclusiveAmbassadors).set(updateData).where(eq(exclusiveAmbassadors.id, id));
  } catch (err) {
    throw new Error((err as any)?.cause?.message ?? (err as Error).message);
  }
  return { success: true };
}

export async function deleteExclusiveAmbassador(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  // Se sueltan sus clientes: si el embajador ya no existe, no puede seguir
  // siendo dueño de nadie. Las comisiones ya generadas se conservan como
  // historial de plata pagada.
  await db.delete(ambassadorClients).where(eq(ambassadorClients.ambassadorId, id));
  await db.delete(exclusiveAmbassadors).where(eq(exclusiveAmbassadors.id, id));
  return { success: true };
}

/** Busca un embajador exclusivo activo por código.
 *
 * Ya NO filtra por evento: en el programa VIP el código es permanente y de la
 * persona (SOFIA, CAMILA), y el nivel se cuenta por mes cruzando todos los
 * eventos. Antes se exigía que el código estuviera dado de alta para ese
 * evento puntual, lo que obligaba a recrear cada embajador en cada fiesta. */
export async function getActiveExclusiveAmbassadorByCode(code: string) {
  const db = await getDb();
  if (!db) return null;
  const [row] = await db.select().from(exclusiveAmbassadors)
    .where(and(
      eq(exclusiveAmbassadors.code, code.trim().toUpperCase()),
      eq(exclusiveAmbassadors.active, 1),
    ))
    .limit(1);
  return row ?? null;
}

/** Foto del cliente ANTES de que la orden lo registre.
 *
 * ⚠️ Hay que llamarla antes de `upsertCustomerFromOrder` y de
 * `awardPlaycoins`: las dos crean/actualizan la fila de `customers`, así que
 * después de ellas todo cliente parece nuevo (`firstSeenAt = now()`) y se
 * pierde para siempre el dato de si venía de antes del programa. De eso
 * depende que la comisión sea 10% o 30-50%. */
export async function getCustomerForAttribution(buyerEmail: string): Promise<{ firstSeenAt: Date; totalOrders: number } | null> {
  const db = await getDb();
  if (!db || !buyerEmail) return null;
  const email = buyerEmail.trim().toLowerCase();
  const [row] = await db.select({ firstSeenAt: customers.firstSeenAt, totalOrders: customers.totalOrders })
    .from(customers).where(eq(customers.email, email)).limit(1);
  return row ?? null;
}

/** Registra la comisión de una venta con código de embajador exclusivo --
 * baseAmount/commissionPercent/commissionAmount quedan congelados al momento
 * de la venta (ver comentario del schema), así un cambio de % después no
 * reescribe comisiones ya generadas. */
export async function recordAmbassadorCommission(params: { ambassadorId: number; orderId: number; eventId: number; baseAmount: number; commissionPercent: number }) {
  const db = await getDb();
  if (!db) return;
  const commissionAmount = computeAmbassadorCommission(params.baseAmount, params.commissionPercent);
  await db.insert(ambassadorCommissions).values({
    ambassadorId: params.ambassadorId,
    orderId: params.orderId,
    eventId: params.eventId,
    baseAmount: String(params.baseAmount),
    commissionPercent: String(params.commissionPercent),
    commissionAmount: String(commissionAmount),
  });
}

/** Reporte para el tab "Embajadores VIP": ventas + comisión exacta de cada
 * embajador de ese evento, más el total del evento -- todo lo que pidió el
 * dueño para poder pagarle a cada uno. */
export async function getAmbassadorCommissionReport(eventId: number) {
  const db = await getDb();
  if (!db) return { ambassadors: [], totalBase: 0, totalCommission: 0 };

  const ambassadorRows = await db.select().from(exclusiveAmbassadors).where(eq(exclusiveAmbassadors.eventId, eventId)).orderBy(exclusiveAmbassadors.name);
  const commissionRows = await db.select().from(ambassadorCommissions).where(eq(ambassadorCommissions.eventId, eventId));

  const byAmbassador = new Map<number, { salesCount: number; totalBase: number; totalCommission: number }>();
  for (const r of commissionRows) {
    const entry = byAmbassador.get(r.ambassadorId) ?? { salesCount: 0, totalBase: 0, totalCommission: 0 };
    entry.salesCount += 1;
    entry.totalBase += Number(r.baseAmount);
    entry.totalCommission += Number(r.commissionAmount);
    byAmbassador.set(r.ambassadorId, entry);
  }

  const ambassadors = ambassadorRows.map((a: any) => {
    const stats = byAmbassador.get(a.id) ?? { salesCount: 0, totalBase: 0, totalCommission: 0 };
    return {
      id: a.id,
      name: a.name,
      code: a.code,
      commissionPercent: Number(a.commissionPercent),
      contact: a.contact,
      active: a.active,
      salesCount: stats.salesCount,
      totalBase: stats.totalBase,
      totalCommission: stats.totalCommission,
    };
  });

  return {
    ambassadors,
    totalBase: ambassadors.reduce((sum, a) => sum + a.totalBase, 0),
    totalCommission: ambassadors.reduce((sum, a) => sum + a.totalCommission, 0),
  };
}

// --- Módulo /caja: operadores (docs/ARQUITECTURA-CAJA.md §4.2, Fase 0) ---

export async function createOperator(input: InsertOperator) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [result] = await db.insert(operators).values(input);
  return (result as unknown as { insertId: number }).insertId;
}

export async function getOperatorById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(operators).where(eq(operators.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

/** Lista solo lo necesario para la pantalla de "toca tu nombre" del login por PIN (§10.2) — nunca el pinHash. */
export async function listActiveOperatorsPublic(eventId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select({ id: operators.id, name: operators.name, role: operators.role })
    .from(operators)
    .where(and(eq(operators.active, 1), eq(operators.eventId, eventId)))
    .orderBy(operators.name);
}

export async function listAllOperators(eventId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select({ id: operators.id, name: operators.name, role: operators.role, active: operators.active, email: operators.email, createdAt: operators.createdAt })
    .from(operators)
    .where(eq(operators.eventId, eventId))
    .orderBy(desc(operators.createdAt));
}

export async function updateOperator(id: number, input: Partial<InsertOperator>) {
  const db = await getDb();
  if (!db) return;
  await db.update(operators).set(input).where(eq(operators.id, id));
}

/** ¿Este operador tiene algún historial (venta, canje, turno, comanda, etc.)?
 * Si sí, borrarlo destruiría trazabilidad de datos ya cerrados -- hay que
 * desactivarlo en vez de borrarlo. Solo se puede borrar de verdad un
 * operador que nunca llegó a usarse (pedido explícito del usuario: poder
 * sacar de la lista a los que se crean de más, sin que se acumulen). */
export async function operatorHasHistory(id: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return true; // sin conexión no se puede verificar -- más seguro bloquear el borrado
  const checks = await Promise.all([
    db.select({ id: orders.id }).from(orders).where(eq(orders.operatorId, id)).limit(1),
    db.select({ id: ops.id }).from(ops).where(eq(ops.operatorId, id)).limit(1),
    db.select({ id: shifts.id }).from(shifts).where(or(eq(shifts.operatorId, id), eq(shifts.closedByOperatorId, id))).limit(1),
    db.select({ id: tickets.id }).from(tickets).where(eq(tickets.usedByOperatorId, id)).limit(1),
    db.select({ id: lockerItems.id }).from(lockerItems).where(or(eq(lockerItems.receivedByOperatorId, id), eq(lockerItems.retrievedByOperatorId, id))).limit(1),
    db.select({ id: kitchenTickets.id }).from(kitchenTickets).where(or(eq(kitchenTickets.approvedByOperatorId, id), eq(kitchenTickets.deliveredByOperatorId, id))).limit(1),
    db.select({ id: ticketStockHistory.id }).from(ticketStockHistory).where(eq(ticketStockHistory.changedByOperatorId, id)).limit(1),
  ]);
  return checks.some((rows) => rows.length > 0);
}

export async function deleteOperator(id: number) {
  if (await operatorHasHistory(id)) {
    throw new Error("Este operador ya tiene historial de ventas, turnos o canjes — desactívalo en vez de eliminarlo.");
  }
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(operators).where(eq(operators.id, id));
  return { success: true };
}

const PIN_MAX_ATTEMPTS = 5;
const PIN_LOCKOUT_MS = 5 * 60 * 1000;

/** Rate limiting del login por PIN (docs/ARQUITECTURA-CAJA.md §13, riesgo 7). */
export async function recordFailedPinAttempt(operatorId: number) {
  const db = await getDb();
  if (!db) return;
  const [operator] = await db.select().from(operators).where(eq(operators.id, operatorId)).limit(1);
  if (!operator) return;
  const attempts = operator.failedPinAttempts + 1;
  await db.update(operators).set({
    failedPinAttempts: attempts,
    lockedUntil: attempts >= PIN_MAX_ATTEMPTS ? new Date(Date.now() + PIN_LOCKOUT_MS) : operator.lockedUntil,
  }).where(eq(operators.id, operatorId));
}

export async function resetPinAttempts(operatorId: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(operators).set({ failedPinAttempts: 0, lockedUntil: null }).where(eq(operators.id, operatorId));
}

const IP_RATE_LIMIT_MAX_ATTEMPTS = 15;
const IP_RATE_LIMIT_LOCKOUT_MS = 15 * 60 * 1000;

/** Rate limiting por IP para el login por PIN (docs/ARQUITECTURA-CAJA.md §13,
 * riesgo 7) -- complementa el límite por operador: sin esto, alguien podría
 * probar pocos intentos por cada operador (listOperators es público) y
 * rotar entre todos sin nunca disparar el bloqueo individual. Límite más
 * generoso (15/15min) porque una tablet compartida legítima puede fallar
 * varias veces entre distintos operadores en un rato. */
export async function checkIpRateLimit(key: string): Promise<boolean> {
  const db = await getDb();
  if (!db) return true;
  const [row] = await db.select().from(rateLimits).where(eq(rateLimits.key, key)).limit(1);
  if (!row?.lockedUntil) return true;
  return new Date(row.lockedUntil).getTime() <= Date.now();
}

export async function recordIpFailedAttempt(key: string) {
  const db = await getDb();
  if (!db) return;
  const [row] = await db.select().from(rateLimits).where(eq(rateLimits.key, key)).limit(1);
  const attempts = (row?.attempts ?? 0) + 1;
  const lockedUntil = attempts >= IP_RATE_LIMIT_MAX_ATTEMPTS ? new Date(Date.now() + IP_RATE_LIMIT_LOCKOUT_MS) : (row?.lockedUntil ?? null);
  await db.insert(rateLimits).values({ key, attempts, lockedUntil })
    .onDuplicateKeyUpdate({ set: { attempts, lockedUntil } });
}

/** Cuenta TODOS los intentos, no solo los fallidos.
 *
 * `recordIpFailedAttempt` (arriba) existe para los logins: ahí solo interesa
 * castigar el error, y un acierto limpia el contador. Un formulario público
 * que se envía bien no tiene "fallo" que contar, así que sin esto no había
 * forma de frenar a alguien que manda cien postulaciones válidas. El límite
 * y la ventana se pasan por parámetro porque un formulario público tolera
 * mucho menos que una tablet compartida escribiendo PINs.
 *
 * El chequeo se hace con `checkIpRateLimit`, el mismo de los logins: esto
 * solo suma y bloquea. */
export async function recordIpAttempt(key: string, maxAttempts: number, lockoutMs: number) {
  const db = await getDb();
  if (!db) return;
  const [row] = await db.select().from(rateLimits).where(eq(rateLimits.key, key)).limit(1);
  // Si el bloqueo anterior ya venció, se arranca el conteo de nuevo en vez de
  // acumular para siempre y dejar la IP castigada de por vida.
  const previoVencido = row?.lockedUntil ? new Date(row.lockedUntil).getTime() <= Date.now() : false;
  const attempts = previoVencido ? 1 : (row?.attempts ?? 0) + 1;
  const lockedUntil = attempts >= maxAttempts ? new Date(Date.now() + lockoutMs) : null;
  await db.insert(rateLimits).values({ key, attempts, lockedUntil })
    .onDuplicateKeyUpdate({ set: { attempts, lockedUntil } });
}

// --- Enrolamiento de dispositivos (pedido explícito del usuario) ---

export async function createDeviceEnrollment(eventId: number, name: string, enrollCode: string, enrollCodeExpiresAt: Date) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [result] = await db.insert(devices).values({ eventId, name, enrollCode, enrollCodeExpiresAt });
  return (result as unknown as { insertId: number }).insertId;
}

export async function getDeviceByEnrollCode(code: string) {
  const db = await getDb();
  if (!db) return undefined;
  const [device] = await db.select().from(devices).where(eq(devices.enrollCode, code)).limit(1);
  return device;
}

export async function completeDeviceEnrollment(deviceId: number, deviceTokenHash: string) {
  const db = await getDb();
  if (!db) return;
  await db.update(devices).set({ enrolled: 1, deviceTokenHash, enrollCode: null, enrollCodeExpiresAt: null, lastSeenAt: new Date() }).where(eq(devices.id, deviceId));
}

export async function getDeviceById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const [device] = await db.select().from(devices).where(eq(devices.id, id)).limit(1);
  return device;
}

export async function listAllDevices(eventId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select({ id: devices.id, name: devices.name, enrolled: devices.enrolled, active: devices.active, createdAt: devices.createdAt, lastSeenAt: devices.lastSeenAt })
    .from(devices)
    .where(eq(devices.eventId, eventId))
    .orderBy(desc(devices.createdAt));
}

export async function updateDeviceActive(id: number, active: 0 | 1) {
  const db = await getDb();
  if (!db) return;
  await db.update(devices).set({ active }).where(eq(devices.id, id));
}

/** A diferencia de operadores/cajas, ningún dispositivo queda referenciado
 * desde ninguna otra tabla (no hay `deviceId` en órdenes, ops, turnos, etc.
 * -- el device solo es un portón de enrolamiento) así que borrar uno nunca
 * rompe trazabilidad histórica: siempre se puede borrar. */
export async function deleteDevice(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(devices).where(eq(devices.id, id));
  return { success: true };
}

// --- Módulo /caja: pantallas de solo lectura (docs/ARQUITECTURA-CAJA.md §10.2, Fase 2) ---

/** Evento "en curso" para la tablet de caja: el publicado/agotado con fecha
 * más cercana a ahora (antes o después) -- funciona bien el mismo día del
 * evento sin necesitar que alguien lo seleccione a mano. */
export async function getActiveEventForCaja() {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db.select().from(events).where(or(eq(events.status, 'published'), eq(events.status, 'soldout')));
  if (rows.length === 0) return undefined;
  const now = Date.now();
  return rows.reduce((best: any, r: any) =>
    Math.abs(new Date(r.eventDate).getTime() - now) < Math.abs(new Date(best.eventDate).getTime() - now) ? r : best
  , rows[0]);
}

/** Evento cuyo día (hora de Chile) es hoy -- para el correo de las 3am con
 * el total de gente que entró (server/cronRoutes.ts). `undefined` si ningún
 * evento publicado cae hoy, para que el cron no mande nada esos días. */
export async function getEventHappeningToday(now: Date = new Date()) {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db.select().from(events).where(or(eq(events.status, 'published'), eq(events.status, 'soldout')));
  return rows.find((r: any) => isEventToday(r.eventDate, now));
}

/** Búsqueda de la pantalla principal de caja: primero intenta match exacto
 * por código (QR de acceso o displayCode de un extra); si no hay, busca por
 * nombre/email/teléfono. Solo dentro del evento activo, solo órdenes aprobadas. */
export async function searchCajaCustomers(eventId: number, query: string) {
  const db = await getDb();
  if (!db) return [];
  const q = query.trim();
  if (!q) return [];
  const qUpper = q.toUpperCase();

  const [byCode] = await db.select().from(tickets).where(and(eq(tickets.eventId, eventId), or(eq(tickets.ticketCode, qUpper), eq(tickets.displayCode, qUpper)))).limit(1);
  let orderIds: number[];
  if (byCode) {
    orderIds = [byCode.orderId];
  } else {
    const pattern = `%${q}%`;
    const rows = await db.select({ id: orders.id }).from(orders).where(and(
      eq(orders.eventId, eventId),
      eq(orders.paymentStatus, 'approved'),
      or(like(orders.buyerName, pattern), like(orders.buyerEmail, pattern), like(orders.buyerPhone, pattern))
    )).limit(20);
    orderIds = rows.map((r: any) => r.id);
  }
  if (orderIds.length === 0) return [];

  const rows = await db.select().from(orders).where(inArray(orders.id, orderIds));
  return rows.map((o: any) => ({ orderId: o.id, orderNumber: o.orderNumber, buyerName: o.buyerName, buyerEmail: o.buyerEmail, buyerPhone: o.buyerPhone }));
}

/** Ficha del cliente (§10.2.3): accesos con su estado y extras con su código
 * de canje + estado, para una orden puntual. */
export async function getCajaCustomerSheet(orderId: number) {
  const db = await getDb();
  if (!db) return null;

  const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!order) return null;

  const orderTickets = await db.select().from(tickets).where(eq(tickets.orderId, orderId));
  const ticketTypeIds = Array.from(new Set(orderTickets.map((t: any) => t.ticketTypeId)));
  const tts = ticketTypeIds.length ? await db.select().from(ticketTypes).where(inArray(ticketTypes.id, ticketTypeIds)) : [];
  const ttById = new Map<number, any>(tts.map((t: any) => [t.id, t]));

  const access = orderTickets
    .filter((t: any) => ttById.get(t.ticketTypeId)?.category === 'acceso')
    .map((t: any) => ({ ticketCode: t.ticketCode, status: t.status, typeName: ttById.get(t.ticketTypeId)?.name }));

  const extras = orderTickets
    .filter((t: any) => ttById.get(t.ticketTypeId)?.category === 'extra')
    .map((t: any) => ({ displayCode: t.displayCode, status: t.status, typeName: ttById.get(t.ticketTypeId)?.name, usedAt: t.usedAt }));

  return {
    orderId: order.id,
    orderNumber: order.orderNumber,
    buyerName: order.buyerName,
    buyerEmail: order.buyerEmail,
    buyerPhone: order.buyerPhone,
    paymentStatus: order.paymentStatus,
    channel: order.channel,
    createdAt: order.createdAt,
    access,
    extras,
  };
}

/** Snapshot completo para el modo offline de /caja (§6.2): todo lo que la
 * tablet necesita para buscar/ver fichas/vender sin red, en una sola
 * descarga -- se guarda en IndexedDB (Dexie) del lado del cliente. */
export async function getCajaSnapshot(eventId: number) {
  const db = await getDb();
  if (!db) return null;

  const [event] = await db.select().from(events).where(eq(events.id, eventId)).limit(1);
  if (!event) return null;

  const approvedOrders = await db.select().from(orders).where(and(eq(orders.eventId, eventId), eq(orders.paymentStatus, 'approved')));
  const orderIds = approvedOrders.map((o: any) => o.id);
  const allTickets = orderIds.length ? await db.select().from(tickets).where(inArray(tickets.orderId, orderIds)) : [];
  const allTicketTypes = await db.select().from(ticketTypes).where(eq(ticketTypes.eventId, eventId));
  const ttById = new Map<number, any>(allTicketTypes.map((t: any) => [t.id, t]));

  const ticketsByOrder = new Map<number, any[]>();
  for (const t of allTickets) {
    const list = ticketsByOrder.get(t.orderId) ?? [];
    list.push(t);
    ticketsByOrder.set(t.orderId, list);
  }

  // RUT del comprador, para que la puerta lo compare con la cedula. Se cruza
  // por email porque `orders`/`tickets` no guardan `customerId` -- es el
  // mismo cruce que usa `upsertCustomerFromOrder`. Es el RUT de quien compro,
  // no uno por cada persona del grupo: `attendeeData` no trae un RUT por
  // asistente.
  const buyerEmails = Array.from(new Set(approvedOrders.map((o: any) => (o.buyerEmail || '').trim().toLowerCase()).filter(Boolean)));
  const rutByEmail = new Map<string, string | null>();
  if (buyerEmails.length) {
    const matchingCustomers = await db.select({ email: customers.email, rut: customers.rut }).from(customers).where(inArray(customers.email, buyerEmails));
    for (const c of matchingCustomers) rutByEmail.set(c.email, c.rut);
  }

  const attendees = approvedOrders.map((o: any) => {
    const ts = ticketsByOrder.get(o.id) ?? [];
    // Los nombres de todos los asistentes de la orden: es lo que el
    // anfitrion compara contra la cedula en la puerta. Van en el snapshot
    // para que la ficha funcione sin senal.
    const attendeeNames = parseAttendeeNames(o.attendeeData);
    return {
      orderId: o.id,
      orderNumber: o.orderNumber,
      buyerName: o.buyerName,
      buyerEmail: o.buyerEmail,
      buyerPhone: o.buyerPhone,
      rut: parseBuyerRut(o.attendeeData) ?? rutByEmail.get((o.buyerEmail || '').trim().toLowerCase()) ?? null,
      attendeeNames: attendeeNames.length > 0 ? attendeeNames : [o.buyerName],
      access: ts.filter((t: any) => ttById.get(t.ticketTypeId)?.category === 'acceso').map((t: any) => ({
        ticketCode: t.ticketCode,
        status: t.status,
        typeName: ttById.get(t.ticketTypeId)?.name,
        // Para contar personas reales en el aforo (un Duo son 2).
        accesoSlug: ttById.get(t.ticketTypeId)?.accesoSlug ?? null,
        // Personas cubiertas por ESTE ticket cuando gana sobre accesoSlug --
        // la invitación especial instantánea (ver createInstantInvite).
        groupSize: t.groupSize ?? null,
      })),
      extras: ts.filter((t: any) => ttById.get(t.ticketTypeId)?.category === 'extra').map((t: any) => ({ displayCode: t.displayCode, status: t.status, typeName: ttById.get(t.ticketTypeId)?.name })),
    };
  });

  // La carta que ve la cajera: los addons de la web ('extra') MÁS la carta de
  // la fiesta ('consumo' = tragos y comida, 'locker' = guardarropía, 'merch').
  // Los accesos quedan fuera a propósito: no se venden en la barra.
  // Viajan `totalStock`/`soldCount` para poder pintar el "sin stock" en rojo
  // sin conexión (avisa, no bloquea -- ver server/caja/sale.ts). Se incluye
  // también `'soldout'` (no solo `'active'`) para que un producto marcado
  // agotado -- por el admin o por el botón de emergencia de cocina, ver
  // toggleKitchenProductSoldOut -- siga apareciendo en la grilla, marcado
  // como agotado, en vez de desaparecer sin explicación. `'hidden'` sigue
  // excluido: es ocultar del todo, no lo mismo que agotado.
  const CATALOG_CATEGORIES = ['extra', 'consumo', 'locker', 'merch'];
  const catalog = allTicketTypes
    .filter((t: any) => CATALOG_CATEGORIES.includes(t.category) && (t.status === 'active' || t.status === 'soldout'))
    .map((t: any) => ({
      id: t.id,
      name: t.name,
      price: Number(t.price),
      color: t.color as string | null,
      internalCode: t.internalCode as string | null,
      emoji: (t.emoji as string | null) ?? null,
      groupName: (t.groupName as string | null) ?? null,
      // Ingredientes/sabores especiales, para que la cajera pueda responder
      // preguntas del cliente sin ir a buscarlo -- reusa el campo de
      // descripción que ya existe, cargado desde la Carta de la Fiesta.
      description: (t.description as string | null) ?? null,
      category: t.category as string,
      status: t.status as 'active' | 'soldout' | 'hidden',
      totalStock: Number(t.totalStock),
      soldCount: Number(t.soldCount),
      toKitchen: Number(t.toKitchen ?? 0) === 1,
      sortOrder: Number(t.sortOrder ?? 0),
    }));

  // Tragos regalados pendientes de cobrar. Van APARTE de `attendees` a
  // propósito: se arman desde las órdenes de ESTE evento, así que un regalo
  // arrastrado desde la fiesta pasada no aparecería por ninguna parte -- y
  // el dueño decidió que un trago no cobrado siga válido para la próxima.
  // Cada uno viaja autocontenido (código, trago, para quién, de quién) para
  // que la tablet pueda cobrarlo sin señal.
  const gifts = await listClaimableGifts();

  // Consumos gratis invitados al staff, pendientes de canjear. Mismo motivo
  // que `gifts`: autocontenidos, para que la búsqueda y el canje en /caja
  // funcionen sin señal (ver createStaffComp).
  const staffCompRows = await db.select({
    displayCode: tickets.displayCode,
    status: tickets.status,
    staffName: tickets.holderName,
    productName: ticketTypes.name,
  })
    .from(tickets)
    .innerJoin(orders, eq(orders.id, tickets.orderId))
    .innerJoin(ticketTypes, eq(ticketTypes.id, tickets.ticketTypeId))
    .where(and(eq(orders.eventId, eventId), eq(orders.paymentMethod, 'Manual: Consumo Staff'), eq(tickets.status, 'valid')));
  const staffComps = staffCompRows.map((r: any) => ({
    displayCode: r.displayCode as string,
    status: r.status as string,
    staffName: r.staffName as string,
    productName: r.productName as string,
  }));

  return {
    event: { id: event.id, title: event.title, slug: event.slug },
    attendees,
    catalog,
    gifts,
    staffComps,
    serverTime: new Date().toISOString(),
  };
}

/** Catálogo de "Nueva venta" (§10.2.4): solo extras activos del evento. */
export async function getCajaCatalog(eventId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(ticketTypes).where(and(eq(ticketTypes.eventId, eventId), eq(ticketTypes.category, 'extra'), eq(ticketTypes.status, 'active')));
}

/** Personas de abonos de Misión 300 ya aprobados cuyo ticket todavía no
 * existe: el pago está aprobado, pero `tickets` se genera recién al liquidar
 * la misión (evaluateMission300, server/webhooks.ts) -- y eso pasa en dos
 * pasos. `missionTopupStatus` distingue tres momentos: 'none' = todavía sin
 * liquidar; 'pending' = no se llegó a la meta, esperando que la persona
 * pague la diferencia; 'paid' = ya tiene ticket generado (ver
 * processApprovedOrder, llamado en el mismo bloque que pone 'paid'). Se
 * cuentan los dos primeros -- son personas que ya pagaron el abono pero cuya
 * entrada TODAVÍA NO está resuelta (puede depender de que el grupo junte la
 * meta, o de que paguen una diferencia pendiente). Lo usan getCajaDashboard
 * (que sí las cuenta como "personas con entrada comprada", pedido explícito
 * del dueño) y el contador público de Home (que las RESTA -- ver
 * mission300.pendingPersonas en routers.ts -- porque ahí solo debe mostrarse
 * lo que ya está resuelto, no lo que todavía puede caer). */
export async function getUnresolvedDepositPersonas(eventId: number): Promise<number> {
  const db = await getDb();
  if (!db) return 0;

  const unresolvedDeposits = await db.select().from(orders).where(and(
    eq(orders.eventId, eventId),
    eq(orders.missionDeposit, 1),
    eq(orders.paymentStatus, 'approved'),
    ne(orders.missionTopupStatus, 'paid'),
  ));

  let personas = 0;
  for (const order of unresolvedDeposits) {
    const depositItems = await db.select().from(orderItems).where(eq(orderItems.orderId, order.id));
    for (const item of depositItems) {
      const [tt] = await db.select().from(ticketTypes).where(eq(ticketTypes.id, item.ticketTypeId)).limit(1);
      if (tt?.category === 'acceso') personas += personasForAccesoSlug(tt.accesoSlug) * item.quantity;
    }
  }
  return personas;
}

/** Dashboard de caja (§10.2.5): ventas del día, top productos, últimas ventas, canjes. */
export async function getCajaDashboard(eventId: number) {
  const db = await getDb();
  if (!db) return null;

  const cajaOrders = await db.select().from(orders).where(and(eq(orders.eventId, eventId), eq(orders.channel, 'caja'), eq(orders.paymentStatus, 'approved')));
  const totalSales = cajaOrders.reduce((s: number, o: any) => s + Number(o.total), 0);

  // Accesos y extras se cuentan por separado: un acceso `used` significa
  // "esta persona entró a la fiesta", un extra `used` significa "se retiró
  // en la barra". Mezclarlos daba un número que no servía para ninguna de
  // las dos cosas.
  const ticketStats = await db.select({
    category: ticketTypes.category,
    status: tickets.status,
    count: sql<number>`COUNT(*)`,
  })
    .from(tickets)
    .innerJoin(ticketTypes, eq(ticketTypes.id, tickets.ticketTypeId))
    .where(eq(tickets.eventId, eventId))
    .groupBy(ticketTypes.category, tickets.status);

  const statOf = (category: string, status: string) =>
    Number(ticketStats.find((r: any) => r.category === category && r.status === status)?.count ?? 0);

  const redeemedCount = statOf('extra', 'used');      // extras retirados

  // Aforo en PERSONAS, no en entradas: un Duo son 2 personas y un Grupo 4.
  // Contar tickets daria un numero muy por debajo del real, y este numero
  // existe justamente para saber cuanta gente hay dentro del recinto.
  const accesoTickets = await db.select({ accesoSlug: ticketTypes.accesoSlug, status: tickets.status, groupSize: tickets.groupSize })
    .from(tickets)
    .innerJoin(ticketTypes, eq(ticketTypes.id, tickets.ticketTypeId))
    .where(and(eq(tickets.eventId, eventId), eq(ticketTypes.category, 'acceso')));

  let insideCount = 0;
  let expectedCount = 0;
  for (const t of accesoTickets) {
    if (t.status === 'cancelled') continue;
    const personas = personasForTicket(t.groupSize, t.accesoSlug);
    expectedCount += personas;
    if (t.status === 'used') insideCount += personas;
  }

  // Abonos de Misión 300 ya aprobados cuyo ticket todavía no existe -- son
  // personas que ya pagaron y cuyas entradas se van a crear igual (pedido
  // explícito del dueño). No suman a `insideCount`: sin ticket todavía no hay
  // código para marcar entrada.
  expectedCount += await getUnresolvedDepositPersonas(eventId);

  const items = await db.select({ ticketTypeId: orderItems.ticketTypeId, quantity: orderItems.quantity })
    .from(orderItems)
    .innerJoin(orders, eq(orders.id, orderItems.orderId))
    .where(and(eq(orders.eventId, eventId), eq(orders.channel, 'caja'), eq(orders.paymentStatus, 'approved')));
  const qtyByType = new Map<number, number>();
  for (const i of items) qtyByType.set(i.ticketTypeId, (qtyByType.get(i.ticketTypeId) || 0) + i.quantity);
  const ttIds = Array.from(qtyByType.keys());
  const tts = ttIds.length ? await db.select().from(ticketTypes).where(inArray(ticketTypes.id, ttIds)) : [];
  const topProducts = tts
    .map((t: any) => ({ name: t.name, quantity: qtyByType.get(t.id) || 0 }))
    .sort((a: any, b: any) => b.quantity - a.quantity)
    .slice(0, 5);

  const recentSales = [...cajaOrders]
    .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 10)
    .map((o: any) => ({ orderNumber: o.orderNumber, total: Number(o.total), createdAt: o.createdAt, paymentMethod: o.paymentMethod }));

  return {
    totalSales,
    salesCount: cajaOrders.length,
    redeemedCount,
    insideCount,
    expectedCount,
    topProducts,
    recentSales,
  };
}

// --- Módulo /caja: supervisor (docs/ARQUITECTURA-CAJA.md §8, Fase 4) ---

/** Canjes dobles todavía sin revisar por un supervisor (§8). "Resuelto" =
 * existe un op `manual_adjust` posterior cuyo payload lo referencia --
 * evita una columna nueva de "revisado" en `ops` (que es append-only). */
export async function getConflictQueue(eventId: number) {
  const db = await getDb();
  if (!db) return [];

  const conflicts = await db.select().from(ops).where(and(eq(ops.eventId, eventId), eq(ops.type, 'redeem'), eq(ops.result, 'conflict')));
  if (conflicts.length === 0) return [];

  const resolutions = await db.select().from(ops).where(and(eq(ops.eventId, eventId), eq(ops.type, 'manual_adjust')));
  const resolvedIds = new Set(resolutions.map((r: any) => (r.payload as any)?.resolvedConflictOpId).filter(Boolean));
  const pending = conflicts.filter((c: any) => !resolvedIds.has(c.id));
  if (pending.length === 0) return [];

  const operatorIds = Array.from(new Set(pending.map((c: any) => c.operatorId)));
  const opRows = await db.select().from(operators).where(inArray(operators.id, operatorIds));
  const opById = new Map<number, any>(opRows.map((o: any) => [o.id, o]));

  return pending.map((c: any) => ({
    opId: c.id,
    displayCode: (c.payload as any)?.displayCode ?? c.targetId,
    operatorName: opById.get(c.operatorId)?.name ?? 'Operador eliminado',
    registerId: c.registerId,
    serverAt: c.serverAt,
    conflictNote: c.conflictNote,
  }));
}

export async function resolveConflict(rawDb: any, params: { opId: string; eventId: number; operatorId: number; conflictOpId: string; note?: string; clientAt: Date }) {
  const { applyOp } = await import('./caja/ops');
  return applyOp(
    rawDb,
    {
      id: params.opId,
      type: 'manual_adjust',
      eventId: params.eventId,
      operatorId: params.operatorId,
      targetType: 'op',
      targetId: params.conflictOpId,
      payload: { resolvedConflictOpId: params.conflictOpId, note: params.note ?? null },
      clientAt: params.clientAt,
    },
    async () => ({ result: 'applied' as const })
  );
}

// --- Módulo /caja: reportes de utilidad/margen/comparativas/horas punta (§12, Fase 4) ---

/** Utilidad/margen por producto de un evento -- unitCost queda congelado al
 * momento de la venta (§12), así que si el costo cambia después esto sigue
 * reflejando la utilidad real de ESE evento, no la de hoy. */
export async function getProfitReport(eventId: number) {
  const db = await getDb();
  if (!db) return [];

  const rows = await db.select({
    ticketTypeId: orderItems.ticketTypeId,
    quantity: orderItems.quantity,
    unitPrice: orderItems.unitPrice,
    unitCost: orderItems.unitCost,
  }).from(orderItems)
    .innerJoin(orders, eq(orders.id, orderItems.orderId))
    .where(and(eq(orders.eventId, eventId), eq(orders.paymentStatus, 'approved')));

  const allTicketTypes = await db.select().from(ticketTypes).where(eq(ticketTypes.eventId, eventId));
  const ttById = new Map<number, any>(allTicketTypes.map((t: any) => [t.id, t]));

  const byType = new Map<number, { name: string; category: string; groupName: string | null; unitsSold: number; revenue: number; cost: number; hasCost: boolean }>();
  for (const r of rows) {
    const tt = ttById.get(r.ticketTypeId);
    const entry = byType.get(r.ticketTypeId) ?? {
      name: tt?.name ?? `#${r.ticketTypeId}`,
      category: tt?.category ?? 'extra',
      groupName: tt?.groupName ?? null,
      unitsSold: 0, revenue: 0, cost: 0, hasCost: false,
    };
    entry.unitsSold += r.quantity;
    entry.revenue += Number(r.unitPrice) * r.quantity;
    if (r.unitCost != null) { entry.cost += Number(r.unitCost) * r.quantity; entry.hasCost = true; }
    byType.set(r.ticketTypeId, entry);
  }

  return Array.from(byType.values())
    .map((e) => ({
      name: e.name,
      category: e.category,
      groupName: e.groupName,
      unitsSold: e.unitsSold,
      revenue: e.revenue,
      cost: e.hasCost ? e.cost : null,
      profit: e.hasCost ? e.revenue - e.cost : null,
      marginPercent: e.hasCost && e.revenue > 0 ? Math.round(((e.revenue - e.cost) / e.revenue) * 1000) / 10 : null,
    }))
    .sort((a, b) => b.revenue - a.revenue);
}

/** Reparto con el proveedor de cocina (pedido explícito del usuario): de
 * todo lo vendido en productos `toKitchen=1` de un evento, cuánto le
 * corresponde al proveedor (su costo cargado × cantidad, `costPrice`
 * congelado al momento de la venta como `unitCost`) y cuánto queda para la
 * productora (precio − costo, × cantidad). Mismo criterio de "costo
 * congelado" que `getProfitReport`. */
export async function getKitchenVendorReport(eventId: number) {
  const db = await getDb();
  if (!db) return { products: [], totalRevenue: 0, vendorShare: 0, venueShare: 0 };

  const rows = await db.select({
    ticketTypeId: orderItems.ticketTypeId,
    quantity: orderItems.quantity,
    unitPrice: orderItems.unitPrice,
    unitCost: orderItems.unitCost,
  }).from(orderItems)
    .innerJoin(orders, eq(orders.id, orderItems.orderId))
    .where(and(eq(orders.eventId, eventId), eq(orders.paymentStatus, 'approved')));

  const kitchenTicketTypes = await db.select().from(ticketTypes)
    .where(and(eq(ticketTypes.eventId, eventId), eq(ticketTypes.toKitchen, 1)));
  const kitchenIds = new Set(kitchenTicketTypes.map((t: any) => t.id));
  const ttById = new Map<number, any>(kitchenTicketTypes.map((t: any) => [t.id, t]));

  const byType = new Map<number, { name: string; quantity: number; revenue: number; vendorShare: number }>();
  for (const r of rows) {
    if (!kitchenIds.has(r.ticketTypeId)) continue;
    const entry = byType.get(r.ticketTypeId) ?? { name: ttById.get(r.ticketTypeId)?.name ?? `#${r.ticketTypeId}`, quantity: 0, revenue: 0, vendorShare: 0 };
    entry.quantity += r.quantity;
    entry.revenue += Number(r.unitPrice) * r.quantity;
    entry.vendorShare += Number(r.unitCost ?? 0) * r.quantity;
    byType.set(r.ticketTypeId, entry);
  }

  const products = Array.from(byType.values())
    .map((e) => ({ name: e.name, quantity: e.quantity, revenue: e.revenue, vendorShare: e.vendorShare, venueShare: e.revenue - e.vendorShare }))
    .sort((a, b) => b.revenue - a.revenue);

  return {
    products,
    totalRevenue: products.reduce((s, p) => s + p.revenue, 0),
    vendorShare: products.reduce((s, p) => s + p.vendorShare, 0),
    venueShare: products.reduce((s, p) => s + p.venueShare, 0),
  };
}

/** Comparativa simple entre eventos: ingresos, utilidad (donde haya costo
 * cargado) y entradas vendidas por evento, más reciente primero. */
/** Comparativa entre eventos (Dashboard → Caja → Comparar). `eventIds` es
 * opcional -- sin filtro compara TODOS los eventos, igual que antes; con
 * filtro solo compara los seleccionados (selector de eventos del admin,
 * pedido explícito del usuario). Mismo criterio "opcional" que ya usa
 * `listShiftClosings`. */
export async function getEventComparison(eventIds?: number[]) {
  const db = await getDb();
  if (!db) return [];

  const eventFilter = eventIds?.length ? inArray(events.id, eventIds) : undefined;
  const allEvents = eventFilter
    ? await db.select().from(events).where(eventFilter).orderBy(desc(events.eventDate))
    : await db.select().from(events).orderBy(desc(events.eventDate));

  const orderFilter = eventIds?.length
    ? and(eq(orders.paymentStatus, 'approved'), inArray(orders.eventId, eventIds))
    : eq(orders.paymentStatus, 'approved');
  const rows = await db.select({
    eventId: orders.eventId,
    quantity: orderItems.quantity,
    unitPrice: orderItems.unitPrice,
    unitCost: orderItems.unitCost,
  }).from(orderItems)
    .innerJoin(orders, eq(orders.id, orderItems.orderId))
    .where(orderFilter);

  const byEvent = new Map<number, { revenue: number; cost: number; hasCost: boolean; unitsSold: number }>();
  for (const r of rows) {
    const entry = byEvent.get(r.eventId) ?? { revenue: 0, cost: 0, hasCost: false, unitsSold: 0 };
    entry.revenue += Number(r.unitPrice) * r.quantity;
    entry.unitsSold += r.quantity;
    if (r.unitCost != null) { entry.cost += Number(r.unitCost) * r.quantity; entry.hasCost = true; }
    byEvent.set(r.eventId, entry);
  }

  // Actividad de operadores/cajas por evento -- se lee del ledger `ops`
  // (ya indexado por eventId) en vez de operators/registers directamente,
  // porque lo que importa acá es "quién trabajó de verdad en este evento",
  // no cuántas filas quedaron creadas.
  const opsFilter = eventIds?.length ? inArray(ops.eventId, eventIds) : undefined;
  const activityRows = opsFilter
    ? await db.select({ eventId: ops.eventId, operatorId: ops.operatorId, registerId: ops.registerId }).from(ops).where(opsFilter)
    : await db.select({ eventId: ops.eventId, operatorId: ops.operatorId, registerId: ops.registerId }).from(ops);

  const activityByEvent = new Map<number, { operators: Set<number>; registers: Set<number> }>();
  for (const r of activityRows) {
    const entry = activityByEvent.get(r.eventId) ?? { operators: new Set<number>(), registers: new Set<number>() };
    entry.operators.add(r.operatorId);
    if (r.registerId != null) entry.registers.add(r.registerId);
    activityByEvent.set(r.eventId, entry);
  }

  return allEvents.map((e: any) => {
    const agg = byEvent.get(e.id);
    const activity = activityByEvent.get(e.id);
    return {
      eventId: e.id,
      title: e.title,
      eventDate: e.eventDate,
      revenue: agg?.revenue ?? 0,
      unitsSold: agg?.unitsSold ?? 0,
      profit: agg?.hasCost ? agg.revenue - agg.cost : null,
      activeOperators: activity?.operators.size ?? 0,
      activeRegisters: activity?.registers.size ?? 0,
    };
  });
}

// --- Módulo /gastos: egresos de la productora y resultado por evento ---

const CASH_COLLECTED_COLUMNS = {
  eventId: orders.eventId,
  total: orders.total,
  missionTopupStatus: orders.missionTopupStatus,
  missionTopupAmount: orders.missionTopupAmount,
};

/** Materializa las copias del mes de los gastos recurrentes (suscripciones).
 *
 * La fila con `recurrence='mensual'` es la plantilla; acá se crea, si falta, la
 * copia de ese mes. Es idempotente por el único (recurringParentId,
 * periodMonth), así que dos pestañas pidiendo el reporte al mismo tiempo no
 * duplican nada -- por eso no hace falta un cron. */
export async function materializeRecurringExpenses(monthKey: string) {
  const db = await getDb();
  if (!db) return;

  const [year, month] = monthKey.split('-').map(Number);
  if (!year || !month) return;
  // Primer y último instante del mes, en la misma convención de hora de Chile
  // que usa monthKeyFor (UTC-4 fijo).
  const monthStart = new Date(Date.UTC(year, month - 1, 1, 4, 0, 0));
  const monthEnd = new Date(Date.UTC(year, month, 1, 4, 0, 0) - 1);

  const templates = await db.select().from(expenses).where(and(
    eq(expenses.recurrence, 'mensual'),
    lte(expenses.expenseDate, monthEnd),
  ));

  for (const t of templates as any[]) {
    if (t.recurrenceEndsAt && new Date(t.recurrenceEndsAt) < monthStart) continue;
    // El propio mes de la plantilla ya está representado por la plantilla.
    if (t.periodMonth === monthKey) continue;

    await db.insert(expenses).values({
      scope: t.scope,
      eventId: t.eventId,
      periodMonth: monthKey,
      expenseDate: monthStart,
      category: t.category,
      description: t.description,
      supplier: t.supplier,
      supplierRut: t.supplierRut,
      documentType: t.documentType,
      documentNumber: t.documentNumber,
      ivaExempt: t.ivaExempt,
      amountTotal: t.amountTotal,
      netAmount: t.netAmount,
      ivaAmount: t.ivaAmount,
      paymentMethod: t.paymentMethod,
      recurrence: 'none',
      recurringParentId: t.id,
      excludeFromPnl: t.excludeFromPnl,
      prorate: t.prorate,
      notes: t.notes,
      createdByUserId: t.createdByUserId,
    }).onDuplicateKeyUpdate({ set: { id: sql`id` } });
  }
}

export async function listExpenses(filters: {
  eventId?: number;
  monthKey?: string;
  scope?: 'evento' | 'general';
  category?: string;
} = {}) {
  const db = await getDb();
  if (!db) return [];

  const conditions = [];
  if (filters.eventId) conditions.push(eq(expenses.eventId, filters.eventId));
  if (filters.monthKey) conditions.push(eq(expenses.periodMonth, filters.monthKey));
  if (filters.scope) conditions.push(eq(expenses.scope, filters.scope));
  if (filters.category) conditions.push(eq(expenses.category, filters.category as any));

  const rows = await db.select().from(expenses)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(expenses.expenseDate))
    .limit(500);

  const eventIds = Array.from(new Set(rows.map((r: any) => r.eventId).filter(Boolean))) as number[];
  const evRows = eventIds.length ? await db.select().from(events).where(inArray(events.id, eventIds)) : [];
  const evById = new Map<number, any>(evRows.map((e: any) => [e.id, e]));

  return rows.map((r: any) => ({
    ...r,
    amountTotal: Number(r.amountTotal),
    netAmount: Number(r.netAmount),
    ivaAmount: Number(r.ivaAmount),
    eventTitle: r.eventId ? (evById.get(r.eventId)?.title ?? 'Evento eliminado') : null,
  }));
}

/** El neto, el IVA y el mes contable los calcula SIEMPRE el servidor -- nunca
 * llegan del cliente, para que no se pueda inventar crédito fiscal desde el
 * navegador. `ivaAmount` sí se puede sobreescribir a mano (facturas donde el
 * proveedor redondeó distinto), pero solo si el documento da crédito. */
function buildExpenseValues(input: any) {
  const amountTotal = Math.round(Number(input.amountTotal));
  const expenseDate = input.expenseDate ? new Date(input.expenseDate) : new Date();
  const derived = deriveAmounts({
    amountTotal,
    documentType: input.documentType,
    ivaExempt: input.ivaExempt,
  });
  const ivaAmount = input.ivaAmountOverride != null && derived.ivaAmount > 0
    ? Math.round(Number(input.ivaAmountOverride))
    : derived.ivaAmount;

  return {
    scope: input.scope,
    eventId: input.scope === 'evento' ? input.eventId : null,
    periodMonth: monthKeyFor(expenseDate),
    expenseDate,
    category: input.category,
    description: input.description,
    supplier: input.supplier || null,
    supplierRut: input.supplierRut ? normalizeRut(input.supplierRut) : null,
    documentType: input.documentType,
    documentNumber: input.documentNumber || null,
    ivaExempt: input.ivaExempt ? 1 : 0,
    amountTotal: String(amountTotal),
    netAmount: String(amountTotal - ivaAmount),
    ivaAmount: String(ivaAmount),
    paymentMethod: input.paymentMethod,
    paidFromShiftId: input.paidFromShiftId ?? null,
    recurrence: input.recurrence ?? 'none',
    recurrenceEndsAt: input.recurrenceEndsAt ? new Date(input.recurrenceEndsAt) : null,
    excludeFromPnl: input.excludeFromPnl ? 1 : 0,
    prorate: input.prorate === false || input.prorate === 0 ? 0 : 1,
    receiptUrl: input.receiptUrl || null,
    notes: input.notes || null,
  };
}

export async function createExpense(input: any) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(expenses).values({
    ...buildExpenseValues(input),
    createdByUserId: input.createdByUserId ?? null,
  });
  return { success: true };
}

export async function updateExpense(id: number, input: any) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [current] = await db.select().from(expenses).where(eq(expenses.id, id)).limit(1);
  if (!current) throw new Error("Gasto no encontrado");
  // Se reconstruye sobre la fila actual para que un update parcial no borre
  // los campos que no vinieron en el formulario.
  const merged = { ...current, ...input, amountTotal: input.amountTotal ?? Number(current.amountTotal) };
  await db.update(expenses).set(buildExpenseValues(merged)).where(eq(expenses.id, id));
  return { success: true };
}

export async function deleteExpense(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(expenses).where(eq(expenses.id, id));
  return { success: true };
}

/** Convierte una fila de la base al shape que espera computePnl. */
function toPnlExpense(r: any): PnlExpense {
  return {
    amountTotal: Number(r.amountTotal),
    netAmount: Number(r.netAmount),
    ivaAmount: Number(r.ivaAmount),
    documentType: r.documentType,
    ivaExempt: r.ivaExempt,
    category: r.category,
  };
}

/** Resultado completo de un evento: de la plata que entró a la utilidad neta,
 * pasando por IVA, costo de mercadería, gastos directos, la parte que le toca
 * de los gastos fijos del mes, y las comisiones de embajadores. */
export async function getEventPnl(eventId: number) {
  const db = await getDb();
  if (!db) return null;

  const [event] = await db.select().from(events).where(eq(events.id, eventId)).limit(1);
  if (!event) return null;

  const monthKey = monthKeyFor(event.eventDate);
  await materializeRecurringExpenses(monthKey);

  // Ingreso del evento y de todos los eventos del mismo mes (para el peso del
  // prorrateo). Se traen las órdenes aprobadas una sola vez y se agrupa acá:
  // el mes se resuelve con monthKeyFor y no en SQL, porque TiDB corre en UTC.
  const monthEvents = (await db.select().from(events))
    .filter((e: any) => monthKeyFor(e.eventDate) === monthKey);
  const monthEventIds = monthEvents.map((e: any) => e.id);

  const incomeRows = monthEventIds.length
    ? await db.select(CASH_COLLECTED_COLUMNS).from(orders)
      .where(and(inArray(orders.eventId, monthEventIds), eq(orders.paymentStatus, 'approved')))
    : [];
  const incomeByEvent = new Map<number, typeof incomeRows>();
  for (const r of incomeRows as any[]) {
    const list = incomeByEvent.get(r.eventId) ?? [];
    list.push(r);
    incomeByEvent.set(r.eventId, list);
  }
  const monthIncomes = monthEvents.map((e: any) => ({
    eventId: e.id,
    grossIncome: cashCollectedFromOrders((incomeByEvent.get(e.id) ?? []) as any),
  }));
  const grossIncome = monthIncomes.find((i) => i.eventId === eventId)?.grossIncome ?? 0;
  const prorationWeight = prorationWeights(monthIncomes).get(eventId) ?? 0;

  // Costo de mercadería vendida. `cogsCoverage` dice qué porcentaje de las
  // unidades tenía costo cargado: sin ese dato el margen mentiría en silencio.
  const itemRows = await db.select({
    quantity: orderItems.quantity,
    unitCost: orderItems.unitCost,
  }).from(orderItems)
    .innerJoin(orders, eq(orders.id, orderItems.orderId))
    .where(and(eq(orders.eventId, eventId), eq(orders.paymentStatus, 'approved')));
  let cogs = 0, unitsWithCost = 0, unitsTotal = 0;
  for (const r of itemRows as any[]) {
    unitsTotal += r.quantity;
    if (r.unitCost != null) { cogs += Number(r.unitCost) * r.quantity; unitsWithCost += r.quantity; }
  }
  const cogsCoverage = unitsTotal > 0 ? Math.round((unitsWithCost / unitsTotal) * 100) : 0;

  // Comisiones de embajadores: un costo real que hasta ahora no se restaba en
  // ningún reporte.
  const commissionRows = await db.select({ amount: ambassadorCommissions.commissionAmount })
    .from(ambassadorCommissions).where(eq(ambassadorCommissions.eventId, eventId));
  const commissionsTotal = (commissionRows as any[]).reduce((s, c) => s + Number(c.amount), 0);

  const directRows = await db.select().from(expenses).where(and(
    eq(expenses.scope, 'evento'),
    eq(expenses.eventId, eventId),
    eq(expenses.excludeFromPnl, 0),
    ne(expenses.recurrence, 'mensual'),
  ));
  const generalRows = await db.select().from(expenses).where(and(
    eq(expenses.scope, 'general'),
    eq(expenses.periodMonth, monthKey),
    eq(expenses.excludeFromPnl, 0),
    eq(expenses.prorate, 1),
    ne(expenses.recurrence, 'mensual'),
  ));

  const pnl = computePnl({
    ivaApplies: event.ivaApplies === 1,
    grossIncome,
    cogs,
    ambassadorCommissions: commissionsTotal,
    directExpenses: (directRows as any[]).map(toPnlExpense),
    generalExpenses: (generalRows as any[]).map(toPnlExpense),
    prorationWeight,
  });

  return {
    eventId,
    title: event.title,
    eventDate: event.eventDate,
    monthKey,
    ivaApplies: event.ivaApplies === 1,
    cogsCoverage,
    ...pnl,
    warnings: await buildPnlWarnings({ eventId, cogs, directRows: directRows as any[], monthKey, grossIncome }),
  };
}

/** Avisos de "este número puede estar mal" que se muestran arriba del reporte.
 * Es parte del entregable, no un extra: casi todos los errores de este módulo
 * son silenciosos. */
async function buildPnlWarnings(params: {
  eventId: number; cogs: number; directRows: any[]; monthKey: string; grossIncome: number;
}): Promise<string[]> {
  const db = await getDb();
  const warnings: string[] = [];

  // Doble conteo: la mercadería ya está costeada en unitCost Y además se cargó
  // la compra al proveedor como gasto.
  const merchandiseExpenses = params.directRows.filter((e) => e.category === 'barra' || e.category === 'merch');
  if (params.cogs > 0 && merchandiseExpenses.length > 0) {
    warnings.push(
      `Hay ${merchandiseExpenses.length} gasto(s) de barra/merch y además costo de producto cargado en la carta. ` +
      `Si es la misma mercadería la estás contando dos veces: marcá esos gastos como "ya contado en el costo del producto".`,
    );
  }

  if (db) {
    // Órdenes devueltas con comisión de embajador: la comisión no se revierte
    // en ningún lado, así que queda restando plata de una venta que no existió.
    const refunded = await db.select({ id: orders.id }).from(orders)
      .where(and(eq(orders.eventId, params.eventId), eq(orders.paymentStatus, 'refunded')));
    if ((refunded as any[]).length > 0) {
      const refundedIds = (refunded as any[]).map((r) => r.id);
      const withCommission = await db.select({ id: ambassadorCommissions.id })
        .from(ambassadorCommissions).where(inArray(ambassadorCommissions.orderId, refundedIds));
      if ((withCommission as any[]).length > 0) {
        warnings.push(
          `Hay ${(withCommission as any[]).length} comisión(es) de embajador sobre órdenes reembolsadas. ` +
          `El sistema no las revierte solo: revisalas a mano.`,
        );
      }
    }

    // Comisiones de Mercado Pago: no se pueden calcular solas, hay que cargar
    // la liquidación. Si el mes tuvo ventas web y no hay ningún gasto de
    // comisiones, la utilidad está inflada.
    if (params.grossIncome > 0) {
      const commissionExpenses = await db.select({ id: expenses.id }).from(expenses)
        .where(and(eq(expenses.periodMonth, params.monthKey), eq(expenses.category, 'comisiones')));
      if ((commissionExpenses as any[]).length === 0) {
        warnings.push(
          `No hay ningún gasto de categoría "Comisiones" en ${params.monthKey}. ` +
          `Las comisiones de Mercado Pago (~3,5%) no se calculan solas: cargalas desde la liquidación o la utilidad queda inflada.`,
        );
      }
    }
  }

  return warnings;
}

/** Comparativa de resultado entre todos los eventos. Se resuelve en consultas
 * agregadas y el prorrateo se arma en memoria: llamar getEventPnl en un loop
 * sería N+1 contra TiDB, y la función de Vercel corta a los 60 segundos. */
/** `eventIds` opcional filtra qué eventos se DEVUELVEN, pero el prorrateo de
 * gastos generales (`weightByEvent`) siempre se calcula con TODOS los
 * eventos del mismo mes -- si se filtrara antes, el peso de cada evento
 * seleccionado quedaría mal calculado (el prorrateo asume que ve a todos los
 * eventos con los que comparte el gasto general de ese mes). */
export async function getPnlComparison(eventIds?: number[]) {
  const db = await getDb();
  if (!db) return [];

  const allEvents = await db.select().from(events).orderBy(desc(events.eventDate));
  if (allEvents.length === 0) return [];

  const monthsNeeded = Array.from(new Set(allEvents.map((e: any) => monthKeyFor(e.eventDate))));
  for (const m of monthsNeeded) await materializeRecurringExpenses(m);

  const incomeRows = await db.select(CASH_COLLECTED_COLUMNS).from(orders)
    .where(eq(orders.paymentStatus, 'approved'));
  const incomeByEvent = new Map<number, any[]>();
  for (const r of incomeRows as any[]) {
    const list = incomeByEvent.get(r.eventId) ?? [];
    list.push(r);
    incomeByEvent.set(r.eventId, list);
  }

  const itemRows = await db.select({
    eventId: orders.eventId, quantity: orderItems.quantity, unitCost: orderItems.unitCost,
  }).from(orderItems)
    .innerJoin(orders, eq(orders.id, orderItems.orderId))
    .where(eq(orders.paymentStatus, 'approved'));
  const cogsByEvent = new Map<number, number>();
  for (const r of itemRows as any[]) {
    if (r.unitCost == null) continue;
    cogsByEvent.set(r.eventId, (cogsByEvent.get(r.eventId) ?? 0) + Number(r.unitCost) * r.quantity);
  }

  const commissionRows = await db.select({
    eventId: ambassadorCommissions.eventId, amount: ambassadorCommissions.commissionAmount,
  }).from(ambassadorCommissions);
  const commissionsByEvent = new Map<number, number>();
  for (const r of commissionRows as any[]) {
    commissionsByEvent.set(r.eventId, (commissionsByEvent.get(r.eventId) ?? 0) + Number(r.amount));
  }

  const allExpenses = await db.select().from(expenses).where(and(
    eq(expenses.excludeFromPnl, 0),
    ne(expenses.recurrence, 'mensual'),
  ));
  const directByEvent = new Map<number, any[]>();
  const generalByMonth = new Map<string, any[]>();
  for (const e of allExpenses as any[]) {
    if (e.scope === 'evento' && e.eventId) {
      const list = directByEvent.get(e.eventId) ?? [];
      list.push(e);
      directByEvent.set(e.eventId, list);
    } else if (e.scope === 'general' && e.prorate === 1) {
      const list = generalByMonth.get(e.periodMonth) ?? [];
      list.push(e);
      generalByMonth.set(e.periodMonth, list);
    }
  }

  // Peso del prorrateo por mes, con los ingresos ya calculados.
  const incomeOf = (id: number) => cashCollectedFromOrders((incomeByEvent.get(id) ?? []) as any);
  const eventsByMonth = new Map<string, any[]>();
  for (const e of allEvents as any[]) {
    const m = monthKeyFor(e.eventDate);
    const list = eventsByMonth.get(m) ?? [];
    list.push(e);
    eventsByMonth.set(m, list);
  }
  const weightByEvent = new Map<number, number>();
  for (const evs of Array.from(eventsByMonth.values())) {
    const weights = prorationWeights(evs.map((e: any) => ({ eventId: e.id, grossIncome: incomeOf(e.id) })));
    for (const [id, w] of Array.from(weights.entries())) weightByEvent.set(id, w);
  }

  const eventIdSet = eventIds?.length ? new Set(eventIds) : null;
  return (allEvents as any[])
    .filter((e) => !eventIdSet || eventIdSet.has(e.id))
    .map((e) => {
      const monthKey = monthKeyFor(e.eventDate);
      const pnl = computePnl({
        ivaApplies: e.ivaApplies === 1,
        grossIncome: incomeOf(e.id),
        cogs: cogsByEvent.get(e.id) ?? 0,
        ambassadorCommissions: commissionsByEvent.get(e.id) ?? 0,
        directExpenses: (directByEvent.get(e.id) ?? []).map(toPnlExpense),
        generalExpenses: (generalByMonth.get(monthKey) ?? []).map(toPnlExpense),
        prorationWeight: weightByEvent.get(e.id) ?? 0,
      });
      return {
        eventId: e.id,
        title: e.title,
        eventDate: e.eventDate,
        monthKey,
        ivaApplies: e.ivaApplies === 1,
        grossIncome: pnl.grossIncome,
        totalExpenses: pnl.cogs + pnl.directExpensesTotal + pnl.generalExpensesAssigned + pnl.ambassadorCommissions,
        netProfit: pnl.netProfit,
        marginPercent: pnl.marginPercent,
      };
    });
}

/** Resumen del mes: totales por categoría y por medio de pago, IVA acumulado,
 * y el balde `sinAsignar` con los gastos generales de meses que no tienen
 * ningún evento -- esa plata no puede desaparecer del reporte. */
export async function getMonthlyExpenseSummary(monthKey: string) {
  const db = await getDb();
  if (!db) return null;

  await materializeRecurringExpenses(monthKey);

  const rows = await db.select().from(expenses).where(and(
    eq(expenses.periodMonth, monthKey),
    ne(expenses.recurrence, 'mensual'),
  ));

  const byCategory = new Map<string, number>();
  const byPaymentMethod = new Map<string, number>();
  let total = 0, ivaCreditoTotal = 0;
  for (const r of rows as any[]) {
    const amount = Number(r.amountTotal);
    total += amount;
    byCategory.set(r.category, (byCategory.get(r.category) ?? 0) + amount);
    byPaymentMethod.set(r.paymentMethod, (byPaymentMethod.get(r.paymentMethod) ?? 0) + amount);
    if (r.documentType === 'factura' && !r.ivaExempt) ivaCreditoTotal += Number(r.ivaAmount);
  }

  const monthHasEvents = (await db.select().from(events))
    .some((e: any) => monthKeyFor(e.eventDate) === monthKey);
  const sinAsignar = monthHasEvents ? 0 : (rows as any[])
    .filter((r) => r.scope === 'general' && r.prorate === 1 && !r.excludeFromPnl)
    .reduce((s, r) => s + Number(r.amountTotal), 0);

  return {
    monthKey,
    total,
    ivaCreditoTotal,
    sinAsignar,
    expenseCount: rows.length,
    byCategory: Array.from(byCategory.entries()).map(([category, amount]) => ({ category, amount })).sort((a, b) => b.amount - a.amount),
    byPaymentMethod: Array.from(byPaymentMethod.entries()).map(([method, amount]) => ({ method, amount })).sort((a, b) => b.amount - a.amount),
  };
}

/** Histograma de operaciones por hora del día (0-23), del ledger completo
 * del evento -- "horas punta" sale gratis de `ops`, sin tabla nueva. */
export async function getPeakHours(eventId: number) {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.select({ serverAt: ops.serverAt }).from(ops).where(eq(ops.eventId, eventId));
  const counts = new Array(24).fill(0);
  for (const r of rows) counts[new Date(r.serverAt).getHours()]++;
  return counts.map((count, hour) => ({ hour, count }));
}

/** Auditoría: el ledger completo de un evento, filtrable, con nombre de
 * operador ya resuelto (§11). */
export async function getLedger(eventId: number, filters: { operatorId?: number; type?: string; dateFrom?: string; dateTo?: string } = {}) {
  const db = await getDb();
  if (!db) return [];

  const conditions = [eq(ops.eventId, eventId)];
  if (filters.operatorId) conditions.push(eq(ops.operatorId, filters.operatorId));
  if (filters.type) conditions.push(eq(ops.type, filters.type as any));
  if (filters.dateFrom) conditions.push(gte(ops.serverAt, new Date(filters.dateFrom)));
  if (filters.dateTo) conditions.push(lte(ops.serverAt, new Date(filters.dateTo)));

  const rows = await db.select().from(ops).where(and(...conditions)).orderBy(desc(ops.serverAt)).limit(500);
  const operatorIds = Array.from(new Set(rows.map((r: any) => r.operatorId)));
  const opRows = operatorIds.length ? await db.select().from(operators).where(inArray(operators.id, operatorIds)) : [];
  const opById = new Map<number, any>(opRows.map((o: any) => [o.id, o]));

  return rows.map((r: any) => ({
    id: r.id,
    type: r.type,
    operatorName: opById.get(r.operatorId)?.name ?? 'Operador eliminado',
    registerId: r.registerId,
    targetType: r.targetType,
    targetId: r.targetId,
    result: r.result,
    conflictNote: r.conflictNote,
    serverAt: r.serverAt,
  }));
}

// --- Módulo /caja: cajas físicas + apertura/cierre de turno (§13, Fase 5) ---

export async function listActiveRegisters(eventId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select({ id: registers.id, name: registers.name })
    .from(registers)
    .where(and(eq(registers.active, 1), eq(registers.eventId, eventId)));
}

export async function listAllRegisters(eventId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(registers).where(eq(registers.eventId, eventId)).orderBy(registers.name);
}

export async function createRegister(eventId: number, name: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [result] = await db.insert(registers).values({ eventId, name });
  return (result as unknown as { insertId: number }).insertId;
}

/** ¿Esta caja física tiene historial (venta, turno, comanda, canje)?
 * Mismo criterio que operatorHasHistory. */
export async function registerHasHistory(id: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return true;
  const checks = await Promise.all([
    db.select({ id: orders.id }).from(orders).where(eq(orders.registerId, id)).limit(1),
    db.select({ id: ops.id }).from(ops).where(eq(ops.registerId, id)).limit(1),
    db.select({ id: shifts.id }).from(shifts).where(eq(shifts.registerId, id)).limit(1),
    db.select({ id: tickets.id }).from(tickets).where(eq(tickets.usedAtRegisterId, id)).limit(1),
    db.select({ id: kitchenTickets.id }).from(kitchenTickets).where(eq(kitchenTickets.registerId, id)).limit(1),
  ]);
  return checks.some((rows) => rows.length > 0);
}

export async function deleteRegister(id: number) {
  if (await registerHasHistory(id)) {
    throw new Error("Esta caja ya tiene historial de ventas o turnos — desactívala en vez de eliminarla.");
  }
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(registers).where(eq(registers.id, id));
  return { success: true };
}

/** Cuadre de caja (pedido explícito del usuario): abre un turno persistido
 * con el efectivo inicial declarado por la cajera. Si ya hay un turno
 * abierto para el mismo evento+caja (p. ej. refresh de página), se reusa en
 * vez de crear uno nuevo -- así "abrir turno" es idempotente por sesión. */
export async function openShift(params: { eventId: number; operatorId: number; registerId?: number; openingCash: number }) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const existing = await getOpenShift(params.eventId, params.registerId);
  if (existing) return existing.id;

  const [result] = await db.insert(shifts).values({
    eventId: params.eventId,
    operatorId: params.operatorId,
    registerId: params.registerId ?? null,
    openingCash: String(params.openingCash),
  });
  return (result as unknown as { insertId: number }).insertId;
}

/** Turno abierto para un evento+caja (o "sin caja asignada" si registerId es
 * undefined) -- es lo que le da identidad estable a un turno en vez de tener
 * que reconstruirlo cada vez a partir del ledger `ops`. */
export async function getOpenShift(eventId: number, registerId?: number) {
  const db = await getDb();
  if (!db) return null;
  const conditions = [eq(shifts.eventId, eventId), eq(shifts.status, 'open')];
  conditions.push(registerId ? eq(shifts.registerId, registerId) : isNull(shifts.registerId));
  const [row] = await db.select().from(shifts).where(and(...conditions)).orderBy(desc(shifts.openedAt)).limit(1);
  return row ?? null;
}

/** Cierre de turno con cuadre de caja (pedido explícito del usuario):
 * - `countedCash` es el efectivo TOTAL contado en el cajón (no la diferencia
 *   -- se resta `openingCash` automáticamente vía `expectedCash`).
 * - `expected*` sale solo de ventas canal='caja' dentro de la ventana del
 *   turno (openedAt → ahora), nunca de ventas web.
 * - `topCustomers`/`topProducts` son del EVENTO completo (todas las
 *   ventas aprobadas, cualquier canal) -- es "cómo terminó la fiesta", no
 *   solo este turno -- y quedan grabados como snapshot para que el reporte
 *   de un evento pasado no cambie si se generan más ventas después. */
export async function closeShift(params: {
  shiftId: number;
  closedByOperatorId: number;
  countedCash: number;
  countedDebit: number;
  countedCredit: number;
  // Transferencia / QR de Mercado Pago -- no pasa por la máquina de tarjetas,
  // así que se cuadra aparte contra la app del banco.
  countedQr?: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [shift] = await db.select().from(shifts).where(eq(shifts.id, params.shiftId)).limit(1);
  if (!shift) throw new Error("Turno no encontrado");
  if (shift.status === 'closed') throw new Error("Este turno ya fue cerrado");

  const closedAt = new Date();

  const shiftSalesConditions = [
    eq(orders.eventId, shift.eventId),
    eq(orders.channel, 'caja'),
    eq(orders.paymentStatus, 'approved'),
    gte(orders.createdAt, shift.openedAt),
  ];
  if (shift.registerId) shiftSalesConditions.push(eq(orders.registerId, shift.registerId));
  const shiftSales = await db.select({ total: orders.total, paymentMethod: orders.paymentMethod })
    .from(orders).where(and(...shiftSalesConditions));

  let expectedCash = 0, expectedDebit = 0, expectedCredit = 0, expectedQr = 0;
  for (const s of shiftSales) {
    const amount = Number(s.total);
    if (s.paymentMethod === 'efectivo') expectedCash += amount;
    else if (s.paymentMethod === 'debito') expectedDebit += amount;
    else if (s.paymentMethod === 'credito') expectedCredit += amount;
    else if (s.paymentMethod === 'qr') expectedQr += amount;
  }

  const redeemsCount = await db.select({ count: sql<number>`count(*)` }).from(ops).where(and(
    eq(ops.eventId, shift.eventId), eq(ops.type, 'redeem'), eq(ops.result, 'applied'), gte(ops.serverAt, shift.openedAt),
    ...(shift.registerId ? [eq(ops.registerId, shift.registerId)] : []),
  ));

  // "Cómo terminó la fiesta": top 3 clientes/productos del evento completo,
  // excluyendo el comprador placeholder de caja (no es un cliente real).
  const eventOrders = await db.select({ buyerName: orders.buyerName, buyerEmail: orders.buyerEmail, total: orders.total })
    .from(orders).where(and(eq(orders.eventId, shift.eventId), eq(orders.paymentStatus, 'approved'), sql`${orders.channel} != 'caja'`));
  const byCustomer = new Map<string, { name: string; email: string; total: number }>();
  for (const o of eventOrders) {
    const entry = byCustomer.get(o.buyerEmail) ?? { name: o.buyerName, email: o.buyerEmail, total: 0 };
    entry.total += Number(o.total);
    byCustomer.set(o.buyerEmail, entry);
  }
  const topCustomers = Array.from(byCustomer.values()).sort((a, b) => b.total - a.total).slice(0, 3);

  const eventItems = await db.select({ ticketTypeId: orderItems.ticketTypeId, quantity: orderItems.quantity, totalPrice: orderItems.totalPrice })
    .from(orderItems).innerJoin(orders, eq(orders.id, orderItems.orderId))
    .where(and(eq(orders.eventId, shift.eventId), eq(orders.paymentStatus, 'approved')));
  const allTicketTypes = await db.select().from(ticketTypes).where(eq(ticketTypes.eventId, shift.eventId));
  const ttById = new Map<number, any>(allTicketTypes.map((t: any) => [t.id, t]));
  const byProduct = new Map<number, { name: string; quantity: number; revenue: number }>();
  for (const item of eventItems) {
    const entry = byProduct.get(item.ticketTypeId) ?? { name: ttById.get(item.ticketTypeId)?.name ?? `#${item.ticketTypeId}`, quantity: 0, revenue: 0 };
    entry.quantity += item.quantity;
    entry.revenue += Number(item.totalPrice);
    byProduct.set(item.ticketTypeId, entry);
  }
  const topProducts = Array.from(byProduct.values()).sort((a, b) => b.quantity - a.quantity).slice(0, 3);

  // A diferencia de topProducts (evento completo, top 3, para el snapshot
  // histórico), esto es el detalle COMPLETO de lo vendido en ESTE turno --
  // lo que la cajera necesita para cuadrar en el momento con el PDF (pedido
  // explícito del usuario). Reusa el mismo filtro shift-scoped que ya arma
  // los totales por medio de pago arriba.
  const shiftItems = await db.select({ ticketTypeId: orderItems.ticketTypeId, quantity: orderItems.quantity, totalPrice: orderItems.totalPrice })
    .from(orderItems).innerJoin(orders, eq(orders.id, orderItems.orderId))
    .where(and(...shiftSalesConditions));
  const byShiftProduct = new Map<number, { name: string; quantity: number; revenue: number }>();
  for (const item of shiftItems) {
    const entry = byShiftProduct.get(item.ticketTypeId) ?? { name: ttById.get(item.ticketTypeId)?.name ?? `#${item.ticketTypeId}`, quantity: 0, revenue: 0 };
    entry.quantity += item.quantity;
    entry.revenue += Number(item.totalPrice);
    byShiftProduct.set(item.ticketTypeId, entry);
  }
  const shiftProducts = Array.from(byShiftProduct.values()).sort((a, b) => b.revenue - a.revenue);

  await db.update(shifts).set({
    closedAt,
    closedByOperatorId: params.closedByOperatorId,
    countedCash: String(params.countedCash),
    countedDebit: String(params.countedDebit),
    countedCredit: String(params.countedCredit),
    countedQr: params.countedQr != null ? String(params.countedQr) : null,
    expectedCash: String(expectedCash),
    expectedDebit: String(expectedDebit),
    expectedCredit: String(expectedCredit),
    expectedQr: String(expectedQr),
    salesCount: shiftSales.length,
    redeemsCount: Number(redeemsCount[0]?.count ?? 0),
    topCustomers,
    topProducts,
    status: 'closed',
  }).where(eq(shifts.id, shift.id));

  const [event] = await db.select({ title: events.title }).from(events).where(eq(events.id, shift.eventId)).limit(1);
  const [register] = shift.registerId ? await db.select({ name: registers.name }).from(registers).where(eq(registers.id, shift.registerId)).limit(1) : [null];
  const [operator] = await db.select({ name: operators.name, email: operators.email }).from(operators).where(eq(operators.id, shift.operatorId)).limit(1);

  return {
    id: shift.id,
    eventTitle: event?.title ?? `Evento #${shift.eventId}`,
    registerName: register?.name ?? 'Sin caja asignada',
    operatorName: operator?.name ?? 'Operador eliminado',
    operatorEmail: operator?.email ?? null,
    openedAt: shift.openedAt,
    closedAt,
    openingCash: Number(shift.openingCash),
    countedCash: params.countedCash,
    countedDebit: params.countedDebit,
    countedCredit: params.countedCredit,
    countedQr: params.countedQr ?? 0,
    expectedCash,
    expectedDebit,
    expectedCredit,
    expectedQr,
    cashDiff: params.countedCash - expectedCash - Number(shift.openingCash),
    debitDiff: params.countedDebit - expectedDebit,
    creditDiff: params.countedCredit - expectedCredit,
    qrDiff: (params.countedQr ?? 0) - expectedQr,
    salesCount: shiftSales.length,
    redeemsCount: Number(redeemsCount[0]?.count ?? 0),
    topCustomers,
    topProducts,
    shiftProducts,
  };
}

/** Cierres de turno guardados, para comparar entre eventos y exportar a CSV
 * (pedido explícito del usuario). */
export async function listShiftClosings(eventId?: number) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [eq(shifts.status, 'closed')];
  if (eventId) conditions.push(eq(shifts.eventId, eventId));
  const rows = await db.select().from(shifts).where(and(...conditions)).orderBy(desc(shifts.closedAt));

  const eventIds = Array.from(new Set(rows.map((r: any) => r.eventId)));
  const registerIds = Array.from(new Set(rows.map((r: any) => r.registerId).filter((id: any) => id != null)));
  const operatorIds = Array.from(new Set([...rows.map((r: any) => r.operatorId), ...rows.map((r: any) => r.closedByOperatorId)].filter((id: any) => id != null)));

  const eventRows = eventIds.length ? await db.select({ id: events.id, title: events.title }).from(events).where(inArray(events.id, eventIds)) : [];
  const registerRows = registerIds.length ? await db.select({ id: registers.id, name: registers.name }).from(registers).where(inArray(registers.id, registerIds)) : [];
  const operatorRows = operatorIds.length ? await db.select({ id: operators.id, name: operators.name }).from(operators).where(inArray(operators.id, operatorIds)) : [];
  const eventById = new Map(eventRows.map((e: any) => [e.id, e.title]));
  const registerById = new Map(registerRows.map((r: any) => [r.id, r.name]));
  const operatorById = new Map(operatorRows.map((o: any) => [o.id, o.name]));

  return rows.map((r: any) => ({
    id: r.id,
    eventId: r.eventId,
    eventTitle: eventById.get(r.eventId) ?? `Evento #${r.eventId}`,
    registerName: r.registerId ? (registerById.get(r.registerId) ?? 'Caja eliminada') : 'Sin caja asignada',
    operatorName: operatorById.get(r.operatorId) ?? 'Operador eliminado',
    closedByName: r.closedByOperatorId ? (operatorById.get(r.closedByOperatorId) ?? 'Operador eliminado') : null,
    openedAt: r.openedAt,
    closedAt: r.closedAt,
    openingCash: Number(r.openingCash),
    countedCash: Number(r.countedCash ?? 0),
    countedDebit: Number(r.countedDebit ?? 0),
    countedCredit: Number(r.countedCredit ?? 0),
    expectedCash: Number(r.expectedCash ?? 0),
    expectedDebit: Number(r.expectedDebit ?? 0),
    expectedCredit: Number(r.expectedCredit ?? 0),
    cashDiff: Number(r.countedCash ?? 0) - Number(r.expectedCash ?? 0) - Number(r.openingCash),
    debitDiff: Number(r.countedDebit ?? 0) - Number(r.expectedDebit ?? 0),
    creditDiff: Number(r.countedCredit ?? 0) - Number(r.expectedCredit ?? 0),
    salesCount: r.salesCount ?? 0,
    redeemsCount: r.redeemsCount ?? 0,
    topCustomers: r.topCustomers ?? [],
    topProducts: r.topProducts ?? [],
  }));
}

export async function getShiftClosingsForExport(eventId?: number) {
  return listShiftClosings(eventId);
}

/** Elimina un cierre de turno (pedido explícito del usuario: hace pruebas de
 * cierre y no quiere que queden mezcladas con datos reales). La verificación
 * con clave de admin vive en el router (cajaReports.deleteShiftClosing), acá
 * solo se borra la fila de `shifts` -- el ledger `ops` es append-only y no se
 * toca, así que la auditoría de operaciones queda intacta aunque el cierre
 * desaparezca del listado. */
export async function deleteShiftClosing(shiftId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(shifts).where(eq(shifts.id, shiftId));
  return { success: true };
}

// --- Base de datos de clientes (pedido explícito del usuario) ---

/** Se llama una sola vez por orden, desde processApprovedOrder (solo ventas
 * web -- las de caja no tienen identidad real de comprador). Acumula
 * accessTypes en vez de sobreescribir, para poder segmentar mailing por
 * "alguna vez compró Dúo" aunque la compra más reciente haya sido Soltera. */
export async function upsertCustomerFromOrder(order: any, accesoSlugs: string[]) {
  const db = await getDb();
  if (!db) return;
  if (!order.buyerEmail) return;

  let rut: string | null = null;
  let instagram: string | null = null;
  try {
    const parsed = order.attendeeData ? JSON.parse(order.attendeeData) : null;
    const campos = parsed?.campos ?? {};
    if (typeof campos['buyer__rut'] === 'string' && campos['buyer__rut'].trim()) rut = campos['buyer__rut'].trim();
    if (typeof campos['buyer__instagram'] === 'string' && campos['buyer__instagram'].trim()) instagram = campos['buyer__instagram'].trim();
  } catch {
    // attendeeData mal formado -- no bloquea el registro del cliente.
  }

  const email = order.buyerEmail.trim().toLowerCase();
  const [existing] = await db.select().from(customers).where(eq(customers.email, email)).limit(1);
  const existingAccessTypes: string[] = Array.isArray(existing?.accessTypes) ? existing!.accessTypes as string[] : [];
  const mergedAccessTypes = Array.from(new Set([...existingAccessTypes, ...accesoSlugs]));

  if (existing) {
    await db.update(customers).set({
      fullName: order.buyerName || existing.fullName,
      phone: order.buyerPhone || existing.phone,
      rut: rut ?? existing.rut,
      instagram: instagram ?? existing.instagram,
      accessTypes: mergedAccessTypes,
      totalOrders: existing.totalOrders + 1,
      totalSpent: String(Number(existing.totalSpent) + Number(order.total)),
      lastSeenAt: new Date(),
    }).where(eq(customers.id, existing.id));
  } else {
    await db.insert(customers).values({
      email,
      fullName: order.buyerName,
      phone: order.buyerPhone,
      rut,
      instagram,
      accessTypes: mergedAccessTypes,
      tags: [],
      totalOrders: 1,
      totalSpent: String(Number(order.total)),
    });
  }
}

// --- Playcoins (pedido explícito del usuario, reemplaza el sistema de
// puntos de Shopify): 25 Playcoins por cada $1.000 CLP gastados, 1 Playcoin
// = $1 CLP al canjear, mínimo 5.000 de saldo para poder canjear (parcial
// permitido). Se gana en compras web Y en caja (ver shared/playcoins.ts). ---

/** Otorga Playcoins por una compra -- crea el cliente si no existe (una
 * venta de caja con email puede ser la primera vez que se ve ese comprador).
 * Idempotente por (reason, orderId) u (reason, opId): un reintento de
 * webhook o de `caja.sync` nunca duplica el otorgamiento. */
export async function awardPlaycoins(params: {
  email: string;
  totalClp: number;
  reason: 'earn_web' | 'earn_caja';
  orderId?: number;
  opId?: string;
}) {
  const db = await getDb();
  if (!db) return;
  const email = params.email.trim().toLowerCase();
  if (!email) return;

  const points = playcoinsEarnedForPurchase(params.totalClp);
  if (points <= 0) return;

  const dupConditions = params.opId
    ? and(eq(playcoinsLedger.opId, params.opId), eq(playcoinsLedger.reason, params.reason))
    : params.orderId
    ? and(eq(playcoinsLedger.orderId, params.orderId), eq(playcoinsLedger.reason, params.reason))
    : undefined;
  if (dupConditions) {
    const [dup] = await db.select().from(playcoinsLedger).where(dupConditions).limit(1);
    if (dup) return;
  }

  let [customer] = await db.select().from(customers).where(eq(customers.email, email)).limit(1);
  if (!customer) {
    const [ins] = await db.insert(customers).values({ email, accessTypes: [], tags: [] });
    const insertId = (ins as unknown as { insertId: number }).insertId;
    [customer] = await db.select().from(customers).where(eq(customers.id, insertId)).limit(1);
  }

  const balanceAfter = customer.playcoins + points;
  await db.update(customers).set({ playcoins: balanceAfter }).where(eq(customers.id, customer.id));
  await db.insert(playcoinsLedger).values({
    customerId: customer.id, delta: points, reason: params.reason,
    orderId: params.orderId ?? null, opId: params.opId ?? null, balanceAfter,
  });
}

/** Canje SERVER-AUTHORITATIVE: relee el saldo real en la BD en el instante
 * en que esta operación finalmente se aplica (no confía en lo que el
 * dispositivo offline mostraba al encolarla) -- mismo principio que
 * `redeemDisplayCode` usa para códigos de ticket. Si el saldo no alcanza
 * para el monto exacto pedido, devuelve un conflicto en vez de canjear un
 * monto distinto en silencio. */
export async function redeemPlaycoinsAuthoritative(params: { email: string; requestedAmount: number; opId: string }): Promise<
  { ok: true; redeemed: number; balanceAfter: number } | { ok: false; conflictNote: string }
> {
  const db = await getDb();
  if (!db) return { ok: false, conflictNote: "Base de datos no disponible" };
  const email = params.email.trim().toLowerCase();
  const [customer] = await db.select().from(customers).where(eq(customers.email, email)).limit(1);
  if (!customer) return { ok: false, conflictNote: "Cliente no encontrado para canjear Playcoins" };

  const redeemed = clampRedeemAmount(params.requestedAmount, customer.playcoins);
  if (redeemed <= 0) {
    return { ok: false, conflictNote: `Saldo insuficiente para canjear Playcoins (saldo actual: ${customer.playcoins})` };
  }
  if (redeemed < params.requestedAmount) {
    return { ok: false, conflictNote: `Saldo insuficiente: se pidieron ${params.requestedAmount} Playcoins pero solo hay ${customer.playcoins} disponibles` };
  }

  const balanceAfter = customer.playcoins - redeemed;
  await db.update(customers).set({ playcoins: balanceAfter }).where(eq(customers.id, customer.id));
  await db.insert(playcoinsLedger).values({
    customerId: customer.id, delta: -redeemed, reason: 'redeem_caja', opId: params.opId, balanceAfter,
  });
  return { ok: true, redeemed, balanceAfter };
}

export async function getPlaycoinsBalance(email: string) {
  const db = await getDb();
  if (!db) return null;
  const [customer] = await db.select().from(customers).where(eq(customers.email, email.trim().toLowerCase())).limit(1);
  if (!customer) return null;
  return { email: customer.email, playcoins: customer.playcoins };
}

/** Ajuste manual desde /admin (migrar saldo de Shopify a mano, corregir). */
export async function adjustPlaycoinsManually(customerId: number, delta: number, note: string) {
  const db = await getDb();
  if (!db) return;
  const [customer] = await db.select().from(customers).where(eq(customers.id, customerId)).limit(1);
  if (!customer) return;
  const balanceAfter = Math.max(0, customer.playcoins + delta);
  const appliedDelta = balanceAfter - customer.playcoins;
  await db.update(customers).set({ playcoins: balanceAfter }).where(eq(customers.id, customerId));
  await db.insert(playcoinsLedger).values({ customerId, delta: appliedDelta, reason: 'manual_adjust', balanceAfter, note });
}

/** Parte pura del filtro "excluir etiquetas" de listCustomers -- separada
 * para poder testearla sin base de datos (mismo patrón que tallyTags).
 * Excluye al cliente si tiene CUALQUIERA de las etiquetas de `excludeTags`. */
export function excludeCustomersByTags<T extends { tags: unknown }>(rows: T[], excludeTags?: string[]): T[] {
  if (!excludeTags || excludeTags.length === 0) return rows;
  const excludeSet = new Set(excludeTags);
  return rows.filter((c) => !Array.isArray(c.tags) || !c.tags.some((t: string) => excludeSet.has(t)));
}

export async function listCustomers(filters: { search?: string; accessType?: string; tag?: string; excludeTags?: string[]; eventId?: number } = {}) {
  const db = await getDb();
  if (!db) return [];
  let rows = await db.select().from(customers).orderBy(desc(customers.lastSeenAt));

  if (filters.search) {
    const needle = filters.search.toLowerCase();
    rows = rows.filter((c: any) =>
      c.email.toLowerCase().includes(needle) ||
      (c.fullName && c.fullName.toLowerCase().includes(needle)) ||
      (c.phone && c.phone.includes(filters.search!))
    );
  }
  if (filters.accessType) {
    rows = rows.filter((c: any) => Array.isArray(c.accessTypes) && c.accessTypes.includes(filters.accessType));
  }
  if (filters.tag) {
    rows = rows.filter((c: any) => Array.isArray(c.tags) && c.tags.includes(filters.tag));
  }
  // Excluir por etiqueta (pedido explícito del usuario): armar audiencias de
  // mailing tipo "todos menos los que ya recibieron la campaña X" sin tener
  // que mantener una lista aparte -- reusa las mismas tags libres de siempre.
  rows = excludeCustomersByTags(rows, filters.excludeTags);
  // "Clientes de este evento" no vive en `customers` (no tiene FK a events) --
  // se resuelve cruzando por email contra las órdenes aprobadas de ese evento
  // (mismo criterio que el resto del sistema: la fuente de verdad es `orders`,
  // `customers` es una proyección materializada, ver comentario en el schema).
  if (filters.eventId) {
    const approvedOrders = await db.select({ buyerEmail: orders.buyerEmail }).from(orders).where(and(
      eq(orders.eventId, filters.eventId),
      eq(orders.paymentStatus, 'approved'),
    ));
    const emails = new Set(approvedOrders.map((o) => o.buyerEmail.toLowerCase()));
    rows = rows.filter((c: any) => emails.has(c.email.toLowerCase()));
  }
  return rows;
}

/** Todas las etiquetas que existen hoy en la base, con cuántos clientes tiene
 * cada una (pedido explícito del usuario: al armar una campaña hay que poder
 * elegir la etiqueta de una lista en vez de escribirla de memoria). Se cuenta
 * en memoria porque `tags` es un campo JSON, no una tabla relacional -- no hay
 * GROUP BY posible sin cambiar el schema, y listCustomers() ya trae la tabla
 * entera igual para armar audiencias. */
export async function listCustomerTags(): Promise<{ tag: string; count: number }[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.select({ tags: customers.tags }).from(customers);
  return tallyTags(rows.map((r) => r.tags));
}

/** Parte pura de listCustomerTags(): cuenta etiquetas sobre las listas crudas
 * del campo JSON `tags`. Separada para poder testearla sin base de datos, y
 * defensiva a propósito -- es un campo JSON sin validar a nivel de schema, así
 * que puede traer null, no-arrays o strings vacíos de importaciones viejas. */
export function tallyTags(tagLists: unknown[]): { tag: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const list of tagLists) {
    if (!Array.isArray(list)) continue;
    // Un mismo cliente cuenta una sola vez por etiqueta aunque venga repetida.
    const seen = new Set<string>();
    for (const raw of list) {
      if (typeof raw !== 'string') continue;
      const tag = raw.trim();
      if (!tag || seen.has(tag)) continue;
      seen.add(tag);
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }
  return Array.from(counts, ([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag, 'es'));
}

/** Resuelve destinatarios de un lote de mailing masivo por id (server/mailing.ts). */
export async function listCustomersByIds(ids: number[]) {
  const db = await getDb();
  if (!db || ids.length === 0) return [];
  return db.select().from(customers).where(inArray(customers.id, ids));
}

/** Crea una campaña de envío automático (pedido explícito del usuario: cola
 * que el cron va drenando día a día, ver server/mailing.ts) junto con una
 * fila `pending` por destinatario. El contenido ya viene armado -- este
 * insert no arma nada, solo persiste lo que el admin dejó en la revisión. */
export async function createMailingCampaign(input: {
  name: string;
  audienceDescription: string;
  content: unknown;
  ctaUrl: string;
  eventSections: unknown;
  customerIds: number[];
}): Promise<{ campaignId: number }> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  if (input.customerIds.length === 0) throw new Error("La campaña necesita al menos un destinatario");

  const [result] = await db.insert(mailingCampaigns).values({
    name: input.name,
    audienceDescription: input.audienceDescription,
    content: input.content,
    ctaUrl: input.ctaUrl,
    eventSections: input.eventSections,
    totalRecipients: input.customerIds.length,
  });
  const campaignId = result.insertId;

  await db.insert(mailingRecipients).values(
    input.customerIds.map((customerId) => ({ campaignId, customerId }))
  );

  return { campaignId };
}

/** Historial de campañas automáticas para el admin (server/routers.ts
 * mailing.listCampaigns), más recientes primero. */
export async function listMailingCampaigns() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(mailingCampaigns).orderBy(desc(mailingCampaigns.createdAt));
}

/** Frena una campaña a mitad de envío (pedido explícito del usuario: no
 * había forma de cancelar una campaña programada). Solo tiene sentido para
 * campañas todavía 'sending' -- una 'done' ya terminó, y una 'cancelled'
 * ya está cancelada. Las filas `mailingRecipients` que sigan `pending`
 * quedan tal cual, sin tocar: el cron ya no las va a ver porque filtra por
 * `mailingCampaigns.status = 'sending'` (getPendingMailingRecipients). */
export async function cancelMailingCampaign(campaignId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [campaign] = await db.select().from(mailingCampaigns).where(eq(mailingCampaigns.id, campaignId)).limit(1);
  if (!campaign) throw new Error("Esa campaña no existe");
  if (campaign.status !== 'sending') throw new Error("Esa campaña ya terminó o ya está cancelada");
  await db.update(mailingCampaigns).set({ status: 'cancelled' }).where(eq(mailingCampaigns.id, campaignId));
  return { success: true };
}

/** Detalle de una campaña -- se usa para mostrar quiénes fallaron (pedido
 * explícito del usuario en el historial). Trae el email desde `customers`
 * porque `mailingRecipients` no lo duplica. */
export async function getMailingCampaignRecipients(campaignId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select({
    id: mailingRecipients.id,
    status: mailingRecipients.status,
    reason: mailingRecipients.reason,
    sentAt: mailingRecipients.sentAt,
    email: customers.email,
    fullName: customers.fullName,
  }).from(mailingRecipients)
    .innerJoin(customers, eq(customers.id, mailingRecipients.customerId))
    .where(eq(mailingRecipients.campaignId, campaignId))
    .orderBy(mailingRecipients.id);
}

/** Próximos destinatarios pendientes de campañas 'sending', de la más vieja a
 * la más nueva (cola justa: una campaña no se "salta" a otra que llegó
 * después) -- usado por el cron diario (server/mailing.ts). `limit` acota
 * cuántas filas trae de una, el cron corta antes por presupuesto de tiempo. */
export async function getPendingMailingRecipients(limit: number) {
  const db = await getDb();
  if (!db) return [];
  // Trae ya unidos los datos de la campaña (nombre/contenido/ctaUrl/secciones)
  // -- evita una consulta aparte por campaña dentro del loop del cron.
  return db.select({
    id: mailingRecipients.id,
    campaignId: mailingRecipients.campaignId,
    customerId: mailingRecipients.customerId,
    email: customers.email,
    fullName: customers.fullName,
    campaignName: mailingCampaigns.name,
    content: mailingCampaigns.content,
    ctaUrl: mailingCampaigns.ctaUrl,
    eventSections: mailingCampaigns.eventSections,
  }).from(mailingRecipients)
    .innerJoin(mailingCampaigns, eq(mailingCampaigns.id, mailingRecipients.campaignId))
    .innerJoin(customers, eq(customers.id, mailingRecipients.customerId))
    .where(and(eq(mailingRecipients.status, 'pending'), eq(mailingCampaigns.status, 'sending')))
    .orderBy(mailingCampaigns.createdAt, mailingRecipients.id)
    .limit(limit);
}

/** Marca el resultado de un destinatario y actualiza los contadores de la
 * campaña -- si ya no quedan pendientes, la campaña pasa a 'done'. Se hace
 * en dos pasos (no una transacción) porque mysql2/drizzle en este proyecto no
 * usa transacciones explícitas en ningún otro lado tampoco; el peor caso ante
 * un corte a mitad es un contador desalineado en 1, no un dato perdido -- el
 * estado real sigue viviendo en `mailingRecipients.status` por fila. */
export async function markMailingRecipientResult(recipientId: number, campaignId: number, success: boolean, reason?: string) {
  const db = await getDb();
  if (!db) return;

  await db.update(mailingRecipients).set({
    status: success ? 'sent' : 'failed',
    reason: success ? null : (reason ?? 'Error desconocido').slice(0, 500),
    sentAt: success ? new Date() : null,
  }).where(eq(mailingRecipients.id, recipientId));

  await db.update(mailingCampaigns).set({
    sentCount: sql`sentCount + ${success ? 1 : 0}`,
    failedCount: sql`failedCount + ${success ? 0 : 1}`,
  }).where(eq(mailingCampaigns.id, campaignId));

  const [remaining] = await db.select({ count: sql<number>`COUNT(*)` })
    .from(mailingRecipients)
    .where(and(eq(mailingRecipients.campaignId, campaignId), eq(mailingRecipients.status, 'pending')));
  if (Number(remaining.count) === 0) {
    await db.update(mailingCampaigns).set({ status: 'done' }).where(eq(mailingCampaigns.id, campaignId));
  }
}

/** Taguea en masa clientes existentes por email (pedido explícito del
 * usuario: marcar como "ya enviado" a partir de un CSV externo, ej. el
 * reporte de entregados de Resend). No crea clientes nuevos -- si un email
 * del CSV no está en la base, se reporta en `notFound` para que quede claro
 * (no falla silenciosamente). */
export async function bulkAddTagByEmails(emails: string[], tag: string): Promise<{ tagged: number; alreadyTagged: number; notFound: string[] }> {
  const db = await getDb();
  const cleanTag = tag.trim();
  const normalizedEmails = Array.from(new Set(emails.map((e) => e.trim().toLowerCase()).filter(Boolean)));
  if (!db || !cleanTag || normalizedEmails.length === 0) {
    return { tagged: 0, alreadyTagged: 0, notFound: normalizedEmails };
  }

  const matches = await db.select().from(customers).where(inArray(customers.email, normalizedEmails));
  const matchedEmails = new Set(matches.map((c) => c.email.toLowerCase()));
  const notFound = normalizedEmails.filter((e) => !matchedEmails.has(e));

  let tagged = 0;
  let alreadyTagged = 0;
  for (const customer of matches) {
    const tags: string[] = Array.isArray(customer.tags) ? customer.tags as string[] : [];
    if (tags.includes(cleanTag)) {
      alreadyTagged++;
      continue;
    }
    await db.update(customers).set({ tags: [...tags, cleanTag] }).where(eq(customers.id, customer.id));
    tagged++;
  }

  return { tagged, alreadyTagged, notFound };
}

export async function addCustomerTag(customerId: number, tag: string) {
  const db = await getDb();
  if (!db) return;
  const [customer] = await db.select().from(customers).where(eq(customers.id, customerId)).limit(1);
  if (!customer) return;
  const tags: string[] = Array.isArray(customer.tags) ? customer.tags as string[] : [];
  const clean = tag.trim();
  if (!clean || tags.includes(clean)) return;
  await db.update(customers).set({ tags: [...tags, clean] }).where(eq(customers.id, customerId));
}

export async function removeCustomerTag(customerId: number, tag: string) {
  const db = await getDb();
  if (!db) return;
  const [customer] = await db.select().from(customers).where(eq(customers.id, customerId)).limit(1);
  if (!customer) return;
  const tags: string[] = Array.isArray(customer.tags) ? customer.tags as string[] : [];
  await db.update(customers).set({ tags: tags.filter((t) => t !== tag) }).where(eq(customers.id, customerId));
}

export async function updateCustomerNotes(customerId: number, notes: string) {
  const db = await getDb();
  if (!db) return;
  await db.update(customers).set({ notes }).where(eq(customers.id, customerId));
}

/** Importación manual desde CSV (server/adminRoutes.ts): mismo criterio de
 * merge que upsertCustomerFromOrder -- por email, acumulando accessTypes/tags
 * en vez de sobreescribir, para no perder segmentación ya hecha a mano. */
export async function importCustomers(rows: {
  email: string;
  fullName?: string;
  phone?: string;
  rut?: string;
  instagram?: string;
  accessTypes?: string[];
  tags?: string[];
  notes?: string;
  totalOrders?: number;
  totalSpent?: number;
}[]) {
  const db = await getDb();
  if (!db) return { imported: 0, updated: 0 };
  let imported = 0;
  let updated = 0;

  for (const row of rows) {
    const email = row.email.trim().toLowerCase();
    if (!email) continue;

    const [existing] = await db.select().from(customers).where(eq(customers.email, email)).limit(1);
    if (existing) {
      const existingAccessTypes: string[] = Array.isArray(existing.accessTypes) ? existing.accessTypes as string[] : [];
      const existingTags: string[] = Array.isArray(existing.tags) ? existing.tags as string[] : [];
      // totalOrders/totalSpent importados son un baseline histórico (ej. export de
      // Shopify) -- se toma el máximo contra lo ya acumulado por compras web reales
      // en vez de sobreescribir, para no perder conteo si el cliente ya compró acá.
      const importedOrders = row.totalOrders !== undefined && !Number.isNaN(row.totalOrders) ? row.totalOrders : undefined;
      const importedSpent = row.totalSpent !== undefined && !Number.isNaN(row.totalSpent) ? row.totalSpent : undefined;
      await db.update(customers).set({
        fullName: row.fullName || existing.fullName,
        phone: row.phone || existing.phone,
        rut: row.rut || existing.rut,
        instagram: row.instagram || existing.instagram,
        accessTypes: Array.from(new Set([...existingAccessTypes, ...(row.accessTypes ?? [])])),
        tags: Array.from(new Set([...existingTags, ...(row.tags ?? [])])),
        notes: row.notes || existing.notes,
        totalOrders: importedOrders !== undefined ? Math.max(existing.totalOrders, importedOrders) : existing.totalOrders,
        totalSpent: importedSpent !== undefined ? String(Math.max(Number(existing.totalSpent), importedSpent)) : existing.totalSpent,
      }).where(eq(customers.id, existing.id));
      updated++;
    } else {
      await db.insert(customers).values({
        email,
        fullName: row.fullName || null,
        phone: row.phone || null,
        rut: row.rut || null,
        instagram: row.instagram || null,
        accessTypes: row.accessTypes ?? [],
        tags: row.tags ?? [],
        notes: row.notes || null,
        totalOrders: row.totalOrders ?? 0,
        totalSpent: row.totalSpent !== undefined ? String(row.totalSpent) : "0",
      });
      imported++;
    }
  }

  return { imported, updated };
}

// --- Caramelo: la fiesta dentro del celular ---
// Las reglas de autorización (ventana horaria, check-in, tope de toques)
// viven en shared/party.ts y las aplica el router en cada llamada. Acá solo
// están las consultas.

/** Resuelve quién es el que llama a partir de su `ticketCode` -- el mismo
 * token que ya usa la página pública de la entrada. Devuelve también el
 * evento y el perfil (si ya lo creó), que es lo que el router necesita para
 * decidir si lo deja entrar. */
export async function getPartyActor(ticketCode: string) {
  const db = await getDb();
  if (!db) return null;

  const [ticket] = await db.select().from(tickets).where(eq(tickets.ticketCode, ticketCode.trim())).limit(1);
  if (!ticket) return null;

  const [event] = await db.select().from(events).where(eq(events.id, ticket.eventId)).limit(1);
  if (!event) return null;

  const [profile] = await db.select().from(partyProfiles).where(eq(partyProfiles.ticketId, ticket.id)).limit(1);

  return { ticket, event, profile: profile ?? null };
}

/** Resuelve un código pegado a mano en /playmatch: primero intenta como
 * ticketCode exacto; si no hay match, intenta como orders.orderNumber (el
 * "Código de reserva" del email, que la gente confunde con el ticketCode
 * porque ambos empiezan con MP-) y devuelve el ticket principal de esa
 * orden -- mismo criterio que el QR del email (server/webhooks.ts, mainTicket):
 * el primer ticket con category="acceso". */
export async function resolvePartyEntryCode(rawCode: string): Promise<string | null> {
  const db = await getDb();
  if (!db) return null;
  const code = rawCode.trim().toUpperCase();
  if (!code) return null;

  const [byTicket] = await db.select().from(tickets).where(eq(tickets.ticketCode, code)).limit(1);
  if (byTicket) return byTicket.ticketCode;

  const [order] = await db.select().from(orders).where(eq(orders.orderNumber, code)).limit(1);
  if (!order) return null;

  const orderTickets = await db.select().from(tickets).where(eq(tickets.orderId, order.id));
  for (const t of orderTickets) {
    const [tt] = await db.select().from(ticketTypes).where(eq(ticketTypes.id, t.ticketTypeId)).limit(1);
    if (tt?.category === 'acceso') return t.ticketCode;
  }
  return orderTickets[0]?.ticketCode ?? null;
}

export async function createPartyProfile(params: {
  eventId: number; ticketId: number; alias: string; gender: PartyGender; avatarId: number; zone: PartyZone;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.insert(partyProfiles).values({
    eventId: params.eventId,
    ticketId: params.ticketId,
    alias: params.alias,
    gender: params.gender,
    avatarId: params.avatarId,
    zone: params.zone,
    lastSeenAt: new Date(),
  });

  const [profile] = await db.select().from(partyProfiles).where(eq(partyProfiles.ticketId, params.ticketId)).limit(1);
  return profile;
}

export async function updatePartyProfile(profileId: number, data: { zone?: PartyZone; avatarId?: number; active?: number }) {
  const db = await getDb();
  if (!db) return;
  await db.update(partyProfiles).set(data).where(eq(partyProfiles.id, profileId));
}

/** Ids que este perfil no debe ver ni poder tocar. El bloqueo es MUTUO: se
 * juntan los que bloqueé con los que me bloquearon, así el bloqueado nunca
 * nota que lo bloquearon (si solo desapareciera de un lado, lo notaría y
 * podría ir a buscar a la persona en la fiesta real). */
async function getPartyHiddenIds(db: any, profileId: number): Promise<Set<number>> {
  const rows = await db.select().from(partyBlocks)
    .where(or(eq(partyBlocks.blockerProfileId, profileId), eq(partyBlocks.blockedProfileId, profileId)));
  const hidden = new Set<number>();
  for (const r of rows) {
    hidden.add(r.blockerProfileId === profileId ? r.blockedProfileId : r.blockerProfileId);
  }
  return hidden;
}

/** Todas las conexiones en las que participa este perfil, en cualquier estado. */
async function getPartyConnectionsFor(db: any, profileId: number) {
  return db.select().from(partyConnections)
    .where(or(eq(partyConnections.profileLowId, profileId), eq(partyConnections.profileHighId, profileId)));
}

/** La mansión: todos los perfiles activos del evento, con el estado de mi
 * relación con cada uno. De paso refresca mi `lastSeenAt`, así la presencia
 * no necesita un endpoint de heartbeat aparte. */
export async function listPartyMansion(profileId: number, eventId: number) {
  const db = await getDb();
  if (!db) return null;

  await db.update(partyProfiles).set({ lastSeenAt: new Date() }).where(eq(partyProfiles.id, profileId));

  const [hidden, connections, profiles] = await Promise.all([
    getPartyHiddenIds(db, profileId),
    getPartyConnectionsFor(db, profileId),
    db.select().from(partyProfiles).where(and(eq(partyProfiles.eventId, eventId), eq(partyProfiles.active, 1))),
  ]);

  const byOther = new Map<number, any>();
  for (const c of connections) {
    const other = c.profileLowId === profileId ? c.profileHighId : c.profileLowId;
    byOther.set(other, c);
  }

  const people = profiles
    .filter((p: any) => p.id !== profileId && !hidden.has(p.id))
    .map((p: any) => {
      const c = byOther.get(p.id);
      // Un toque que me mandaron y todavía no respondo: es lo único que
      // exige acción de mi parte, por eso se distingue del resto.
      const pendingForMe = !!c && c.status === 'pending' && c.initiatedById !== profileId;
      return {
        id: p.id,
        alias: p.alias,
        gender: p.gender as PartyGender,
        avatarId: p.avatarId,
        zone: p.zone as PartyZone,
        lastSeenAt: p.lastSeenAt,
        connectionId: c?.id ?? null,
        // `declined` se le muestra a quien tocó como si siguiera pendiente:
        // el rechazo es silencioso (decisión del dueño).
        connectionStatus: c ? (c.status === 'declined' && c.initiatedById === profileId ? 'pending' : c.status) : null,
        pendingForMe,
      };
    });

  const touchesUsed = connections.filter((c: any) => c.initiatedById === profileId).length;

  return { people, touchesUsed, touchesLeft: Math.max(0, MAX_TOUCHES_PER_EVENT - touchesUsed) };
}

export type PartyTouchResult =
  | { ok: true; status: 'pending' | 'accepted'; connectionId: number }
  | { ok: false; reason: string };

/** Mandar un toque 👋. Si la otra persona ya me había tocado, la conexión
 * pasa sola a `accepted`: toque recíproco = match. */
export async function touchPartyProfile(profileId: number, targetProfileId: number, eventId: number): Promise<PartyTouchResult> {
  const db = await getDb();
  if (!db) return { ok: false, reason: 'Base de datos no disponible' };
  if (profileId === targetProfileId) return { ok: false, reason: 'No puedes tocarte a ti mismo' };

  const [target] = await db.select().from(partyProfiles).where(eq(partyProfiles.id, targetProfileId)).limit(1);
  if (!target || target.eventId !== eventId || target.active !== 1) {
    return { ok: false, reason: 'Esa persona ya no está en la fiesta' };
  }

  const hidden = await getPartyHiddenIds(db, profileId);
  if (hidden.has(targetProfileId)) return { ok: false, reason: 'Esa persona ya no está en la fiesta' };

  const { low, high } = orderedPair(profileId, targetProfileId);
  const [existing] = await db.select().from(partyConnections)
    .where(and(eq(partyConnections.profileLowId, low), eq(partyConnections.profileHighId, high))).limit(1);

  if (existing) {
    if (existing.initiatedById === profileId) {
      // Ya lo toqué antes. Si me rechazó no se lo digo (rechazo silencioso).
      return existing.status === 'accepted'
        ? { ok: true, status: 'accepted', connectionId: existing.id }
        : { ok: true, status: 'pending', connectionId: existing.id };
    }
    if (existing.status === 'pending') {
      // Me habían tocado y ahora yo toco de vuelta: match automático.
      await db.update(partyConnections).set({ status: 'accepted', respondedAt: new Date() })
        .where(eq(partyConnections.id, existing.id));
      return { ok: true, status: 'accepted', connectionId: existing.id };
    }
    if (existing.status === 'accepted') return { ok: true, status: 'accepted', connectionId: existing.id };
    // Yo lo rechacé antes: no se reabre desde acá.
    return { ok: false, reason: 'No se puede abrir esta conversación' };
  }

  const connections = await getPartyConnectionsFor(db, profileId);
  const touchesUsed = connections.filter((c: any) => c.initiatedById === profileId).length;
  if (touchesUsed >= MAX_TOUCHES_PER_EVENT) {
    return { ok: false, reason: `Llegaste al máximo de ${MAX_TOUCHES_PER_EVENT} toques por noche` };
  }

  await db.insert(partyConnections).values({
    eventId, profileLowId: low, profileHighId: high, initiatedById: profileId, status: 'pending',
  });
  const [created] = await db.select().from(partyConnections)
    .where(and(eq(partyConnections.profileLowId, low), eq(partyConnections.profileHighId, high))).limit(1);

  return { ok: true, status: 'pending', connectionId: created.id };
}

/** Aceptar o rechazar un toque. Solo puede responder quien NO lo inició. */
export async function respondToPartyTouch(profileId: number, connectionId: number, accept: boolean) {
  const db = await getDb();
  if (!db) return { ok: false as const, reason: 'Base de datos no disponible' };

  const [c] = await db.select().from(partyConnections).where(eq(partyConnections.id, connectionId)).limit(1);
  if (!c) return { ok: false as const, reason: 'Ese toque ya no existe' };
  if (c.profileLowId !== profileId && c.profileHighId !== profileId) return { ok: false as const, reason: 'No es tu toque' };
  if (c.initiatedById === profileId) return { ok: false as const, reason: 'No puedes responder tu propio toque' };
  if (c.status !== 'pending') return { ok: true as const, status: c.status };

  const status = accept ? 'accepted' : 'declined';
  await db.update(partyConnections).set({ status, respondedAt: new Date() }).where(eq(partyConnections.id, connectionId));
  return { ok: true as const, status };
}

/** Devuelve la conexión solo si este perfil es parte de ella y está
 * aceptada -- el chat no existe antes del consentimiento. */
async function getAcceptedConnection(db: any, profileId: number, connectionId: number) {
  const [c] = await db.select().from(partyConnections).where(eq(partyConnections.id, connectionId)).limit(1);
  if (!c) return null;
  if (c.profileLowId !== profileId && c.profileHighId !== profileId) return null;
  if (c.status !== 'accepted') return null;
  return c;
}

export async function listPartyMessages(profileId: number, connectionId: number) {
  const db = await getDb();
  if (!db) return null;

  const c = await getAcceptedConnection(db, profileId, connectionId);
  if (!c) return null;

  const otherId = c.profileLowId === profileId ? c.profileHighId : c.profileLowId;
  const hidden = await getPartyHiddenIds(db, profileId);
  if (hidden.has(otherId)) return null;

  const [other] = await db.select().from(partyProfiles).where(eq(partyProfiles.id, otherId)).limit(1);
  const messages = await db.select().from(partyMessages)
    .where(eq(partyMessages.connectionId, connectionId))
    .orderBy(partyMessages.createdAt);

  return {
    other: other ? { id: other.id, alias: other.alias, gender: other.gender, avatarId: other.avatarId, zone: other.zone, lastSeenAt: other.lastSeenAt } : null,
    messages: messages.map((m: any) => ({ id: m.id, body: m.body, mine: m.fromProfileId === profileId, createdAt: m.createdAt })),
  };
}

export async function sendPartyMessage(profileId: number, connectionId: number, body: string) {
  const db = await getDb();
  if (!db) return { ok: false as const, reason: 'Base de datos no disponible' };

  const c = await getAcceptedConnection(db, profileId, connectionId);
  if (!c) return { ok: false as const, reason: 'Esta conversación no está abierta' };

  const otherId = c.profileLowId === profileId ? c.profileHighId : c.profileLowId;
  const hidden = await getPartyHiddenIds(db, profileId);
  if (hidden.has(otherId)) return { ok: false as const, reason: 'Esta conversación no está abierta' };

  await db.insert(partyMessages).values({ connectionId, fromProfileId: profileId, body });
  return { ok: true as const };
}

export async function blockPartyProfile(profileId: number, targetProfileId: number, eventId: number) {
  const db = await getDb();
  if (!db) return;
  await db.insert(partyBlocks).values({ eventId, blockerProfileId: profileId, blockedProfileId: targetProfileId })
    .onDuplicateKeyUpdate({ set: { blockedProfileId: targetProfileId } });
}

export async function reportPartyProfile(profileId: number, targetProfileId: number, eventId: number, reason: string) {
  const db = await getDb();
  if (!db) return;
  await db.insert(partyReports).values({ eventId, reporterProfileId: profileId, reportedProfileId: targetProfileId, reason });
}

/** Denuncias sin resolver de un evento, para el equipo del local. */
export async function listPartyReports(eventId: number) {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.select({
    id: partyReports.id,
    reason: partyReports.reason,
    createdAt: partyReports.createdAt,
    resolvedAt: partyReports.resolvedAt,
    reporterAlias: sql<string>`reporter.alias`,
    reportedAlias: sql<string>`reported.alias`,
    reportedZone: sql<string>`reported.zone`,
  })
    .from(partyReports)
    .leftJoin(sql`${partyProfiles} as reporter`, sql`reporter.id = ${partyReports.reporterProfileId}`)
    .leftJoin(sql`${partyProfiles} as reported`, sql`reported.id = ${partyReports.reportedProfileId}`)
    .where(eq(partyReports.eventId, eventId))
    .orderBy(desc(partyReports.createdAt));
  return rows;
}

/** Borra lo que la gente escribió, 24h después de terminada la fiesta. Los
 * perfiles y las conexiones sobreviven un año más (ver
 * purgeOldPartyProfiles); los mensajes no. Lo corre el cron diario. */
export async function purgeOldPartyMessages(now: Date = new Date()) {
  const db = await getDb();
  if (!db) return { deletedFor: 0 };

  const cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const oldEvents = await db.select({ id: events.id }).from(events).where(lte(events.eventEnd, cutoff));
  if (oldEvents.length === 0) return { deletedFor: 0 };

  const eventIds = oldEvents.map((e: any) => e.id);
  const conns = await db.select({ id: partyConnections.id }).from(partyConnections)
    .where(inArray(partyConnections.eventId, eventIds));
  if (conns.length === 0) return { deletedFor: 0 };

  await db.delete(partyMessages).where(inArray(partyMessages.connectionId, conns.map((c: any) => c.id)));
  return { deletedFor: eventIds.length };
}

/** Plazo de conservación de los perfiles de la fiesta, prometido en la
 * política de privacidad (client/src/pages/PrivacyPolicy.tsx). Si se cambia
 * acá, hay que cambiarlo también allá: una política que promete un borrado
 * que el código no hace es una declaración falsa, no un detalle. */
export const PARTY_PROFILE_RETENTION_MS = 365 * 24 * 60 * 60 * 1000;

/** Borra los perfiles, toques, bloqueos y denuncias de fiestas de hace más
 * de un año.
 *
 * Con una excepción: los perfiles referenciados por un trago pagado y NO
 * retirado se conservan. Ese trago sigue válido para la próxima fiesta, y
 * sin el perfil el barman perdería el "para La Reina, de El Rey" que le
 * permite entregarlo. */
export async function purgeOldPartyProfiles(now: Date = new Date()) {
  const db = await getDb();
  if (!db) return { profilesDeleted: 0 };

  const cutoff = new Date(now.getTime() - PARTY_PROFILE_RETENTION_MS);
  const oldEvents = await db.select({ id: events.id }).from(events).where(lte(events.eventEnd, cutoff));
  if (oldEvents.length === 0) return { profilesDeleted: 0 };
  const eventIds = oldEvents.map((e: any) => e.id);

  // Perfiles que hay que preservar aunque el evento sea viejo.
  const claimable = await db.select().from(partyGifts).where(eq(partyGifts.status, 'paid'));
  const keep = new Set<number>(claimable.flatMap((g: any) => [g.fromProfileId, g.toProfileId]));

  const profiles = await db.select({ id: partyProfiles.id }).from(partyProfiles)
    .where(inArray(partyProfiles.eventId, eventIds));
  const toDelete = profiles.map((p: any) => p.id).filter((id: number) => !keep.has(id));
  if (toDelete.length === 0) return { profilesDeleted: 0 };

  // Los mensajes de estos eventos ya no existen (se borran a las 24h), así
  // que basta con las conexiones y lo que cuelga de los perfiles.
  await db.delete(partyConnections).where(inArray(partyConnections.eventId, eventIds));
  await db.delete(partyBlocks).where(inArray(partyBlocks.eventId, eventIds));
  await db.delete(partyReports).where(inArray(partyReports.eventId, eventIds));
  await db.delete(partyProfiles).where(inArray(partyProfiles.id, toDelete));

  return { profilesDeleted: toDelete.length };
}

// --- Invitar un trago ---
// El flujo tiene tres pasos porque el dueño decidió que el destinatario
// pueda rechazar y que nadie pague por un trago rechazado: invitar (gratis)
// -> responder -> recién ahí pagar. Ver la máquina de estados en
// shared/party.ts.

/** Tragos que se pueden regalar: los mismos extras activos que la caja ya
 * vende en la barra. No hay catálogo aparte que mantener. */
export async function listPartyDrinks(eventId: number) {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.select().from(ticketTypes)
    .where(and(eq(ticketTypes.eventId, eventId), eq(ticketTypes.category, 'extra'), eq(ticketTypes.status, 'active')))
    .orderBy(ticketTypes.sortOrder);
  return rows.map((t: any) => ({ id: t.id, name: t.name, price: Number(t.price), description: t.description as string | null }));
}

export async function createGiftInvitation(params: {
  eventId: number; fromProfileId: number; toProfileId: number; ticketTypeId: number; message: string;
}) {
  const db = await getDb();
  if (!db) return { ok: false as const, reason: 'Base de datos no disponible' };
  if (params.fromProfileId === params.toProfileId) return { ok: false as const, reason: 'No puedes invitarte un trago a ti mismo' };

  const [target] = await db.select().from(partyProfiles).where(eq(partyProfiles.id, params.toProfileId)).limit(1);
  if (!target || target.eventId !== params.eventId || target.active !== 1) {
    return { ok: false as const, reason: 'Esa persona ya no está en la fiesta' };
  }

  // El bloqueo también corta los regalos: si no, sería una vía para
  // seguir apareciéndole a alguien que te bloqueó.
  const hidden = await getPartyHiddenIds(db, params.fromProfileId);
  if (hidden.has(params.toProfileId)) return { ok: false as const, reason: 'Esa persona ya no está en la fiesta' };

  const [tt] = await db.select().from(ticketTypes).where(eq(ticketTypes.id, params.ticketTypeId)).limit(1);
  if (!tt || tt.eventId !== params.eventId || tt.category !== 'extra' || tt.status !== 'active') {
    return { ok: false as const, reason: 'Ese trago no está disponible' };
  }

  // Una invitación viva a la vez por par y por trago -- si no, se puede
  // spamear a alguien con invitaciones aunque el tope de toques ya se haya
  // agotado.
  const existing = await db.select().from(partyGifts).where(and(
    eq(partyGifts.fromProfileId, params.fromProfileId),
    eq(partyGifts.toProfileId, params.toProfileId),
    inArray(partyGifts.status, ['invited', 'accepted']),
  ));
  if (existing.some((g: any) => !isGiftExpired(g))) {
    return { ok: false as const, reason: 'Ya tienes una invitación pendiente con esa persona' };
  }

  await db.insert(partyGifts).values({
    eventId: params.eventId,
    fromProfileId: params.fromProfileId,
    toProfileId: params.toProfileId,
    ticketTypeId: tt.id,
    // Congelados: un regalo se puede cobrar meses después y el precio del
    // trago va a haber cambiado.
    drinkName: tt.name,
    priceClp: String(Number(tt.price)),
    message: params.message || null,
    status: 'invited',
    expiresAt: giftExpiresAt(),
  });

  const [created] = await db.select().from(partyGifts)
    .where(and(eq(partyGifts.fromProfileId, params.fromProfileId), eq(partyGifts.toProfileId, params.toProfileId)))
    .orderBy(desc(partyGifts.id)).limit(1);

  return { ok: true as const, giftId: created.id };
}

export async function respondToGiftInvitation(profileId: number, giftId: number, accept: boolean) {
  const db = await getDb();
  if (!db) return { ok: false as const, reason: 'Base de datos no disponible' };

  const [gift] = await db.select().from(partyGifts).where(eq(partyGifts.id, giftId)).limit(1);
  if (!gift) return { ok: false as const, reason: 'Esa invitación ya no existe' };
  if (!canRespondToGift(gift as any, profileId)) return { ok: false as const, reason: 'Esa invitación ya no está disponible' };

  const status = accept ? 'accepted' : 'declined';
  await db.update(partyGifts).set({ status, respondedAt: new Date() }).where(eq(partyGifts.id, giftId));
  return { ok: true as const, status };
}

/** Crea la orden que cobra el regalo. Es una orden web mínima a propósito:
 * no pasa por `createOrder`, que arrastra Misión 300, códigos de descuento,
 * recargo por servicio y datos de asistentes -- nada de eso aplica a un
 * trago, y el dueño pidió cobrarlo al precio de la barra, sin recargo.
 * El cobro después lo hace `processCardPaymentForOrder`, sin cambios. */
export async function createGiftOrder(profileId: number, giftId: number, buyer: { name: string; email: string }) {
  const db = await getDb();
  if (!db) return { ok: false as const, reason: 'Base de datos no disponible' };

  const [gift] = await db.select().from(partyGifts).where(eq(partyGifts.id, giftId)).limit(1);
  if (!gift) return { ok: false as const, reason: 'Esa invitación ya no existe' };
  if (!canPayGift(gift as any, profileId)) return { ok: false as const, reason: 'Esta invitación ya no se puede pagar' };

  // Si ya se había creado una orden pendiente para este regalo, se reusa en
  // vez de crear otra (el que invita puede recargar la pantalla de pago).
  if (gift.orderId) {
    const [existing] = await db.select().from(orders).where(eq(orders.id, gift.orderId)).limit(1);
    if (existing && existing.paymentStatus === 'pending') {
      return { ok: true as const, orderNumber: existing.orderNumber, total: Number(existing.total) };
    }
  }

  const total = Number(gift.priceClp);
  const orderNumber = `GIFT-${Date.now().toString(36).toUpperCase()}`;

  const [orderResult] = await db.insert(orders).values({
    orderNumber,
    buyerName: buyer.name,
    buyerEmail: buyer.email,
    eventId: gift.eventId,
    subtotal: String(total),
    discount: '0',
    serviceFee: '0', // el trago se cobra al precio de la barra (decisión del dueño)
    total: String(total),
    paymentStatus: 'pending',
    channel: 'web',
  });
  const orderId = (orderResult as unknown as { insertId: number }).insertId;

  await db.insert(orderItems).values({
    orderId,
    ticketTypeId: gift.ticketTypeId,
    quantity: 1,
    unitPrice: String(total),
    totalPrice: String(total),
  });

  await db.update(partyGifts).set({ orderId }).where(eq(partyGifts.id, giftId));

  return { ok: true as const, orderNumber, total };
}

/** El regalo asociado a una orden, si la orden es un regalo. Lo usa
 * processApprovedOrder para decidir a nombre de quién queda el ticket y
 * qué email mandar. */
export async function getPartyGiftByOrderId(orderId: number) {
  const db = await getDb();
  if (!db) return null;
  const [gift] = await db.select().from(partyGifts).where(eq(partyGifts.orderId, orderId)).limit(1);
  return gift ?? null;
}

/** Alias del destinatario de un regalo -- es el `holderName` del ticket. */
export async function getPartyProfileById(profileId: number) {
  const db = await getDb();
  if (!db) return null;
  const [p] = await db.select().from(partyProfiles).where(eq(partyProfiles.id, profileId)).limit(1);
  return p ?? null;
}

export async function markGiftPaid(giftId: number, ticketId: number, displayCode: string | null) {
  const db = await getDb();
  if (!db) return;
  await db.update(partyGifts)
    .set({ status: 'paid', ticketId, displayCode, paidAt: new Date() })
    .where(eq(partyGifts.id, giftId));
}

/** Marca el regalo como cobrado en la barra. Lo llama el canje de caja
 * cuando el ticket resulta ser un regalo. */
export async function markGiftRedeemedByTicketId(ticketId: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(partyGifts).set({ status: 'redeemed', redeemedAt: new Date() }).where(eq(partyGifts.ticketId, ticketId));
}

/** ¿Este ticket es un regalo? Lo pregunta el canje de caja para saber si
 * puede aceptarlo aunque venga de un evento anterior. */
export async function getPartyGiftByTicketId(ticketId: number) {
  const db = await getDb();
  if (!db) return null;
  const [gift] = await db.select().from(partyGifts).where(eq(partyGifts.ticketId, ticketId)).limit(1);
  return gift ?? null;
}

/** Mis regalos: los que recibí y los que mandé. */
export async function listMyGifts(profileId: number) {
  const db = await getDb();
  if (!db) return { received: [], sent: [] };

  const rows = await db.select().from(partyGifts)
    .where(or(eq(partyGifts.toProfileId, profileId), eq(partyGifts.fromProfileId, profileId)))
    .orderBy(desc(partyGifts.id));

  const profileIds = Array.from(new Set(rows.flatMap((g: any) => [g.fromProfileId, g.toProfileId])));
  const profiles = profileIds.length
    ? await db.select().from(partyProfiles).where(inArray(partyProfiles.id, profileIds))
    : [];
  const aliasById = new Map<number, string>(profiles.map((p: any) => [p.id, p.alias]));

  const shape = (g: any) => ({
    id: g.id,
    drinkName: g.drinkName,
    priceClp: Number(g.priceClp),
    message: g.message as string | null,
    // Una invitación vencida se muestra como vencida, no como pendiente.
    status: isGiftExpired(g) ? 'expired' : g.status,
    // El código solo se muestra cuando ya está pagado.
    displayCode: g.status === 'paid' ? g.displayCode : null,
    fromAlias: aliasById.get(g.fromProfileId) ?? '',
    toAlias: aliasById.get(g.toProfileId) ?? '',
    createdAt: g.createdAt,
  });

  return {
    received: rows.filter((g: any) => g.toProfileId === profileId).map(shape),
    sent: rows.filter((g: any) => g.fromProfileId === profileId).map(shape),
  };
}

/** Regalos pagados y todavía no cobrados, para el snapshot de caja. Van
 * los de este evento Y los de eventos anteriores: el dueño decidió que un
 * trago no cobrado siga válido para la próxima fiesta, y sin esto el
 * barman no podría encontrarlo con la tablet sin señal. */
export async function listClaimableGifts() {
  const db = await getDb();
  if (!db) return [];

  const rows = await db.select().from(partyGifts).where(eq(partyGifts.status, 'paid'));
  if (rows.length === 0) return [];

  const profileIds = Array.from(new Set(rows.flatMap((g: any) => [g.fromProfileId, g.toProfileId])));
  const profiles = profileIds.length
    ? await db.select().from(partyProfiles).where(inArray(partyProfiles.id, profileIds))
    : [];
  const aliasById = new Map<number, string>(profiles.map((p: any) => [p.id, p.alias]));

  return rows
    .filter((g: any) => g.displayCode)
    .map((g: any) => ({
      displayCode: g.displayCode as string,
      drinkName: g.drinkName as string,
      toAlias: aliasById.get(g.toProfileId) ?? '',
      fromAlias: aliasById.get(g.fromProfileId) ?? '',
      eventId: g.eventId as number,
      paidAt: g.paidAt,
    }));
}

/** Vence las invitaciones que nadie pagó. Corre en el cron diario, junto
 * con el borrado de los chats. Nunca toca un regalo ya pagado. */
export async function expireOldGiftInvitations(now: Date = new Date()) {
  const db = await getDb();
  if (!db) return { expired: 0 };

  const pending = await db.select().from(partyGifts).where(inArray(partyGifts.status, ['invited', 'accepted']));
  const stale = pending.filter((g: any) => isGiftExpired(g, now));
  if (stale.length === 0) return { expired: 0 };

  await db.update(partyGifts).set({ status: 'expired' }).where(inArray(partyGifts.id, stale.map((g: any) => g.id)));
  return { expired: stale.length };
}

/** Todos los regalos de un evento, para el admin. */
export async function listPartyGiftsForEvent(eventId: number) {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.select().from(partyGifts).where(eq(partyGifts.eventId, eventId)).orderBy(desc(partyGifts.id));

  const profileIds = Array.from(new Set(rows.flatMap((g: any) => [g.fromProfileId, g.toProfileId])));
  const profiles = profileIds.length
    ? await db.select().from(partyProfiles).where(inArray(partyProfiles.id, profileIds))
    : [];
  const aliasById = new Map<number, string>(profiles.map((p: any) => [p.id, p.alias]));

  return rows.map((g: any) => ({
    id: g.id,
    drinkName: g.drinkName,
    priceClp: Number(g.priceClp),
    status: isGiftExpired(g) ? 'expired' : g.status,
    fromAlias: aliasById.get(g.fromProfileId) ?? '',
    toAlias: aliasById.get(g.toProfileId) ?? '',
    displayCode: g.displayCode as string | null,
    createdAt: g.createdAt,
    paidAt: g.paidAt,
    redeemedAt: g.redeemedAt,
  }));
}

/** Alias + email del dueño de un perfil de la fiesta. El email sale de la
 * orden de su acceso: el perfil no guarda datos de contacto (a propósito),
 * pero el sistema sí necesita poder mandarle el código de un regalo. */
export async function getPartyProfileContact(profileId: number) {
  const db = await getDb();
  if (!db) return null;

  const [profile] = await db.select().from(partyProfiles).where(eq(partyProfiles.id, profileId)).limit(1);
  if (!profile) return null;

  const [ticket] = await db.select().from(tickets).where(eq(tickets.id, profile.ticketId)).limit(1);
  const [order] = ticket ? await db.select().from(orders).where(eq(orders.id, ticket.orderId)).limit(1) : [null];

  return { alias: profile.alias as string, email: (order?.buyerEmail as string | undefined) ?? null };
}

// --- Segundo factor del panel de administración ---

export async function getAdminTotp() {
  const db = await getDb();
  if (!db) return null;
  const [row] = await db.select().from(adminTotp).limit(1);
  return row ?? null;
}

/** Guarda un secreto nuevo SIN confirmar. Reemplaza cualquiera anterior no
 * confirmado: si el dueño abandonó la configuración a medias, el intento
 * viejo no debe quedar dando vueltas. */
/** Devuelve el secreto a configurar. Si ya hay uno sin confirmar, DEVUELVE
 * ESE en vez de generar otro.
 *
 * Esto no es una optimización: la versión anterior generaba un secreto
 * nuevo cada vez que se abría la pantalla de configuración, y como el
 * cliente la abre sola cada vez que se ingresa la contraseña mientras no
 * esté confirmado, bastaba con que el primer intento fallara para que el
 * QR ya escaneado quedara invalidado. El resultado era un círculo cerrado:
 * la app mostraba códigos de un secreto que la base ya había reemplazado, y
 * nunca se podía confirmar. Dejó al dueño fuera de su propio panel. */
export async function getOrCreateUnconfirmedAdminTotp(newSecret: string): Promise<string> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const existing = await getAdminTotp();
  if (existing) {
    // Ya confirmado: no se toca. Lo protege además el router.
    if (existing.confirmedAt) return existing.secret;
    // Sin confirmar: se reusa, para que el QR escaneado siga sirviendo.
    return existing.secret;
  }

  await db.insert(adminTotp).values({ secret: newSecret });
  return newSecret;
}

/** Descarta la configuración a medias y empieza de cero. Solo se llama
 * cuando el dueño lo pide explícitamente ("volver a escanear"). */
export async function resetUnconfirmedAdminTotp(secret: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const existing = await getAdminTotp();
  if (existing?.confirmedAt) return;
  if (existing) {
    await db.update(adminTotp).set({ secret, backupCodes: null, lastUsedStep: null }).where(eq(adminTotp.id, existing.id));
    return;
  }
  await db.insert(adminTotp).values({ secret });
}

export async function confirmAdminTotp(id: number, hashedBackupCodes: string[], timeStep: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(adminTotp)
    .set({ confirmedAt: new Date(), backupCodes: hashedBackupCodes, lastUsedStep: timeStep })
    .where(eq(adminTotp.id, id));
}

export async function recordAdminTotpStep(id: number, timeStep: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(adminTotp).set({ lastUsedStep: timeStep }).where(eq(adminTotp.id, id));
}

export async function consumeAdminBackupCodes(id: number, remaining: string[]) {
  const db = await getDb();
  if (!db) return;
  await db.update(adminTotp).set({ backupCodes: remaining }).where(eq(adminTotp.id, id));
}

// --- Passkeys (Face ID / Touch ID) del panel de administración ---

export async function getAdminWebauthnCredentials() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(adminWebauthnCredentials).orderBy(desc(adminWebauthnCredentials.createdAt));
}

export async function getAdminWebauthnCredentialById(credentialId: string) {
  const db = await getDb();
  if (!db) return null;
  const [row] = await db.select().from(adminWebauthnCredentials).where(eq(adminWebauthnCredentials.credentialId, credentialId)).limit(1);
  return row ?? null;
}

export async function saveAdminWebauthnCredential(params: {
  credentialId: string;
  publicKey: string;
  counter: number;
  transports?: string[];
  deviceLabel: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(adminWebauthnCredentials).values({
    credentialId: params.credentialId,
    publicKey: params.publicKey,
    counter: params.counter,
    transports: params.transports ?? null,
    deviceLabel: params.deviceLabel,
  });
}

/** Sube el contador tras un login exitoso -- si el próximo intento llega con
 * un contador menor o igual, `verifyAuthenticationResponse` lo va a rechazar
 * por clonación. */
export async function touchAdminWebauthnCredential(id: number, counter: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(adminWebauthnCredentials).set({ counter, lastUsedAt: new Date() }).where(eq(adminWebauthnCredentials.id, id));
}

export async function deleteAdminWebauthnCredential(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(adminWebauthnCredentials).where(eq(adminWebauthnCredentials.id, id));
}


/** Limpia el contador de intentos fallidos de una clave. Sin esto los
 * fallos se acumulan de por vida y, pasado el umbral, cualquier error
 * posterior vuelve a bloquear la IP aunque el dueño ya haya entrado bien. */
export async function resetIpRateLimit(key: string) {
  const db = await getDb();
  if (!db) return;
  await db.delete(rateLimits).where(eq(rateLimits.key, key));
}
