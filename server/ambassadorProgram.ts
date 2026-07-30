import { and, eq, inArray, sql, desc } from 'drizzle-orm';
import { getDb, computeAmbassadorCommission, computeAmbassadorCommissionBase, getActiveExclusiveAmbassadorByCode, getFeaturedEvent } from './db';
import {
  ambassadorBenefitDeliveries, ambassadorClients, ambassadorCommissions, ambassadorProgramConfig,
  ambassadorWeeklyMaterial, events, exclusiveAmbassadors, orders,
} from '../drizzle/schema';
import {
  DEFAULT_BENEFITS, DEFAULT_COMMISSION_SCALE, DEFAULT_EXISTING_CLIENT_PERCENT,
  DEFAULT_WEEKLY_EMAIL_WEEKDAY, commissionPercentForSale, monthKeyFor, nextBenefit,
  nextTierTarget, resolveAttribution, tierForSales, unlockedBenefits,
  type BenefitTier, type CommissionTier,
} from '../shared/ambassadorProgram';
import { AMBASSADOR_TASKS } from '../shared/ambassadorApplication';
import { buildAmbassadorWeeklyEmail, sendEmail } from './email';
import { invokeLLM } from './_core/llm';
import { z } from 'zod';

/* Motor del programa de Embajadores VIP: atribución de cada venta, y las
 * consultas que alimentan el panel del embajador y el admin.
 *
 * Va aparte de `db.ts` porque ese archivo ya pasa las 2.200 líneas. La
 * lógica que decide plata es pura y vive en `shared/ambassadorProgram.ts`;
 * acá está solo lo que toca la base de datos. */

export type ProgramConfig = {
  launchDate: Date;
  commissionScale: CommissionTier[];
  existingClientPercent: number;
  benefits: BenefitTier[];
  weeklyEmailEnabled: boolean;
  weeklyEmailWeekday: number;
  weeklyEmailHourChile: number;
};

/** Las columnas `json` vuelven como arreglo ya parseado o como texto según el
 * driver -- el resto del proyecto ya se defiende igual (ver parseBackupCodes
 * en adminSecurity.ts y el Array.isArray de upsertCustomerFromOrder). */
function parseJsonArray<T>(raw: unknown, fallback: T[]): T[] {
  if (Array.isArray(raw)) return raw as T[];
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed as T[]) : fallback;
    } catch {
      return fallback;
    }
  }
  return fallback;
}

/** Config del programa, creando la fila única con los valores por defecto la
 * primera vez. Sin base de datos devuelve los defaults, para que nada reviente. */
export async function getProgramConfig(): Promise<ProgramConfig> {
  const defaults: ProgramConfig = {
    launchDate: new Date(),
    commissionScale: DEFAULT_COMMISSION_SCALE,
    existingClientPercent: DEFAULT_EXISTING_CLIENT_PERCENT,
    benefits: DEFAULT_BENEFITS,
    weeklyEmailEnabled: true,
    weeklyEmailWeekday: DEFAULT_WEEKLY_EMAIL_WEEKDAY,
    weeklyEmailHourChile: 9,
  };

  const db = await getDb();
  if (!db) return defaults;

  const [row] = await db.select().from(ambassadorProgramConfig).limit(1);
  if (!row) {
    await db.insert(ambassadorProgramConfig).values({
      commissionScale: DEFAULT_COMMISSION_SCALE,
      benefits: DEFAULT_BENEFITS,
      existingClientPercent: String(DEFAULT_EXISTING_CLIENT_PERCENT),
    });
    return defaults;
  }

  return {
    launchDate: new Date(row.launchDate),
    commissionScale: parseJsonArray<CommissionTier>(row.commissionScale, DEFAULT_COMMISSION_SCALE),
    existingClientPercent: Number(row.existingClientPercent),
    benefits: parseJsonArray<BenefitTier>(row.benefits, DEFAULT_BENEFITS),
    weeklyEmailEnabled: row.weeklyEmailEnabled === 1,
    weeklyEmailWeekday: row.weeklyEmailWeekday,
    weeklyEmailHourChile: row.weeklyEmailHourChile,
  };
}

export async function updateProgramConfig(data: {
  launchDate?: Date;
  commissionScale?: CommissionTier[];
  existingClientPercent?: number;
  benefits?: BenefitTier[];
  weeklyEmailEnabled?: boolean;
  weeklyEmailWeekday?: number;
  weeklyEmailHourChile?: number;
}) {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  await getProgramConfig(); // garantiza que la fila exista

  const [row] = await db.select({ id: ambassadorProgramConfig.id }).from(ambassadorProgramConfig).limit(1);
  const patch: any = {};
  if (data.launchDate !== undefined) patch.launchDate = data.launchDate;
  if (data.commissionScale !== undefined) patch.commissionScale = data.commissionScale;
  if (data.existingClientPercent !== undefined) patch.existingClientPercent = String(data.existingClientPercent);
  if (data.benefits !== undefined) patch.benefits = data.benefits;
  if (data.weeklyEmailEnabled !== undefined) patch.weeklyEmailEnabled = data.weeklyEmailEnabled ? 1 : 0;
  if (data.weeklyEmailWeekday !== undefined) patch.weeklyEmailWeekday = data.weeklyEmailWeekday;
  if (data.weeklyEmailHourChile !== undefined) patch.weeklyEmailHourChile = data.weeklyEmailHourChile;

  if (Object.keys(patch).length > 0 && row) {
    await db.update(ambassadorProgramConfig).set(patch).where(eq(ambassadorProgramConfig.id, row.id));
  }
  return { success: true };
}

/** Cuántas ventas EXCLUSIVAS lleva un embajador en el mes. Es lo que define su
 * nivel: las ventas a clientes existentes no cuentan (decisión del dueño). */
async function countExclusiveSalesInMonth(db: any, ambassadorId: number, monthKey: string): Promise<number> {
  const [row] = await db.select({ count: sql<number>`COUNT(*)` })
    .from(ambassadorCommissions)
    .where(and(
      eq(ambassadorCommissions.ambassadorId, ambassadorId),
      eq(ambassadorCommissions.monthKey, monthKey),
      eq(ambassadorCommissions.clientType, 'exclusivo'),
    ));
  return Number(row?.count ?? 0);
}

export type AttributionResult =
  | { attributed: false; reason: 'sin_codigo_ni_dueño' | 'codigo_desconocido' | 'ya_registrada' | 'sin_base' }
  | { attributed: true; ambassadorId: number; clientType: 'exclusivo' | 'existente'; percent: number; amount: number };

/** Atribuye UNA venta aprobada. Es el corazón del programa.
 *
 * `priorCustomer` tiene que venir capturado ANTES de que la orden registre al
 * cliente (ver getCustomerForAttribution): después de `upsertCustomerFromOrder`
 * todo cliente parece nuevo y la comisión saldría 30-50% en vez de 10%.
 *
 * Las reglas (todas testeadas en shared/ambassadorProgram.ts):
 * - Sin código y sin dueño previo -> no hay comisión, la compra sigue normal.
 * - Sin código pero con dueño -> cobra el dueño (el cliente es suyo para siempre).
 * - Con código -> cobra el del código, incluso si el cliente es de otro; pero
 *   en ese caso la venta vale como "cliente existente" (10%, sin subir nivel). */
export async function attributeAmbassadorSale(params: {
  order: any;
  /** Subtotal de los ítems de categoría 'acceso' de la orden. */
  accesoSubtotal: number;
  priorCustomer: { firstSeenAt: Date; totalOrders: number } | null;
}): Promise<AttributionResult> {
  const db = await getDb();
  if (!db) return { attributed: false, reason: 'sin_base' };

  const { order } = params;
  const email = (order.buyerEmail ?? '').trim().toLowerCase();

  // Idempotencia: la orden pudo reprocesarse (el guardado colgaba solo de
  // orders.emailSent). El único de la columna también lo frena, pero acá se
  // corta antes de tocar nada.
  const [already] = await db.select({ id: ambassadorCommissions.id }).from(ambassadorCommissions)
    .where(eq(ambassadorCommissions.orderId, order.id)).limit(1);
  if (already) return { attributed: false, reason: 'ya_registrada' };

  const code = (order.referredByCode || order.ambassadorCode || '').trim().toUpperCase();
  const fromCode = code ? await getActiveExclusiveAmbassadorByCode(code) : null;

  const [owner] = email
    ? await db.select().from(ambassadorClients).where(eq(ambassadorClients.customerEmail, email)).limit(1)
    : [];

  const earner = fromCode ?? (owner ? await getAmbassadorById(db, owner.ambassadorId) : null);
  if (!earner) {
    // Si tecleó algo que no es de ningún embajador VIP, puede ser un código de
    // referido orgánico -- esa rama la sigue manejando webhooks.ts.
    return { attributed: false, reason: code ? 'codigo_desconocido' : 'sin_codigo_ni_dueño' };
  }

  const config = await getProgramConfig();
  const attribution = resolveAttribution({
    priorCustomerFirstSeenAt: params.priorCustomer?.firstSeenAt ?? null,
    launchDate: config.launchDate,
    ownerAmbassadorId: owner ? owner.ambassadorId : null,
    earnerAmbassadorId: earner.id,
  });

  const createdAt = order.createdAt ? new Date(order.createdAt) : new Date();
  const monthKey = monthKeyFor(createdAt);

  // El número de esta venta dentro del mes fija el % y no se recalcula nunca
  // más: por eso la escala no es retroactiva.
  const salesRank = attribution.countsForTier
    ? (await countExclusiveSalesInMonth(db, earner.id, monthKey)) + 1
    : 0;

  const percent = commissionPercentForSale({
    clientType: attribution.clientType,
    saleNumberThisMonth: salesRank,
    scale: config.commissionScale,
    existingClientPercent: config.existingClientPercent,
    overridePercent: earner.commissionPercent === null || earner.commissionPercent === undefined
      ? null
      : Number(earner.commissionPercent),
  });

  const baseAmount = computeAmbassadorCommissionBase(params.accesoSubtotal, Number(order.discount ?? 0));
  const commissionAmount = computeAmbassadorCommission(baseAmount, percent);

  await db.insert(ambassadorCommissions).values({
    ambassadorId: earner.id,
    orderId: order.id,
    eventId: order.eventId,
    baseAmount: String(baseAmount),
    commissionPercent: String(percent),
    commissionAmount: String(commissionAmount),
    customerEmail: email || null,
    clientType: attribution.clientType,
    codeUsed: code || null,
    monthKey,
    salesRank: attribution.countsForTier ? salesRank : null,
  });

  if (attribution.assignsOwnership && email) {
    // El único de customerEmail garantiza que un cliente tenga un solo dueño;
    // si dos órdenes del mismo cliente entraran a la vez, la segunda choca y
    // se ignora en vez de robarle el cliente a nadie.
    try {
      await db.insert(ambassadorClients).values({
        ambassadorId: earner.id,
        customerEmail: email,
        firstOrderId: order.id,
        firstPurchaseAt: createdAt,
        ordersCount: 1,
        totalSpent: String(Number(order.total ?? 0)),
      });
    } catch {
      // Ya tenía dueño (carrera): la comisión de esta venta igual quedó registrada.
    }
  } else if (owner && owner.ambassadorId === earner.id) {
    await db.update(ambassadorClients).set({
      ordersCount: owner.ordersCount + 1,
      totalSpent: String(Number(owner.totalSpent) + Number(order.total ?? 0)),
    }).where(eq(ambassadorClients.id, owner.id));
  }

  console.log(
    `[Embajadores] Orden ${order.orderNumber}: ${earner.name} (${earner.code}) cobra ` +
    `$${commissionAmount.toLocaleString('es-CL')} = ${percent}% de $${baseAmount.toLocaleString('es-CL')} ` +
    `· cliente ${attribution.clientType}${attribution.countsForTier ? ` · venta #${salesRank} del mes ${monthKey}` : ''}` +
    `${code && fromCode && owner && owner.ambassadorId !== earner.id ? ' · código cruzado' : ''}`,
  );

  return { attributed: true, ambassadorId: earner.id, clientType: attribution.clientType, percent, amount: commissionAmount };
}

async function getAmbassadorById(db: any, id: number) {
  const [row] = await db.select().from(exclusiveAmbassadors).where(eq(exclusiveAmbassadors.id, id)).limit(1);
  return row ?? null;
}

/** Estadísticas de un embajador para un mes, reusadas por su panel público,
 * el perfil del admin, el ranking y el correo semanal. */
export async function getAmbassadorStats(ambassadorId: number, monthKey: string) {
  const db = await getDb();
  if (!db) return null;

  const all = await db.select().from(ambassadorCommissions)
    .where(eq(ambassadorCommissions.ambassadorId, ambassadorId));

  const delMes = all.filter((c: any) => c.monthKey === monthKey);
  const exclusivasDelMes = delMes.filter((c: any) => c.clientType === 'exclusivo');

  const config = await getProgramConfig();
  const monthlySales = exclusivasDelMes.length;

  const clientes = await db.select({ count: sql<number>`COUNT(*)` }).from(ambassadorClients)
    .where(eq(ambassadorClients.ambassadorId, ambassadorId));

  return {
    monthKey,
    monthlySales,
    monthlyExistingSales: delMes.length - monthlySales,
    monthlyRevenue: delMes.reduce((s: number, c: any) => s + Number(c.baseAmount), 0),
    monthlyCommission: delMes.reduce((s: number, c: any) => s + Number(c.commissionAmount), 0),
    totalCommission: all.reduce((s: number, c: any) => s + Number(c.commissionAmount), 0),
    totalSales: all.length,
    exclusiveClientsCount: Number(clientes[0]?.count ?? 0),
    existingClientsCount: new Set(
      all.filter((c: any) => c.clientType === 'existente').map((c: any) => c.customerEmail).filter(Boolean),
    ).size,
    currentPercent: tierForSales(monthlySales, config.commissionScale)?.percent ?? config.commissionScale[0]?.percent ?? 0,
    nextTarget: nextTierTarget(monthlySales, config.commissionScale),
    benefits: unlockedBenefits(monthlySales, config.benefits),
    nextBenefit: nextBenefit(monthlySales, config.benefits),
  };
}

/** Historial de ventas de un embajador, con el nombre del evento resuelto. */
export async function getAmbassadorSales(ambassadorId: number, limit = 200) {
  const db = await getDb();
  if (!db) return [];

  const rows = await db.select().from(ambassadorCommissions)
    .where(eq(ambassadorCommissions.ambassadorId, ambassadorId))
    .orderBy(sql`${ambassadorCommissions.createdAt} DESC`)
    .limit(limit);
  if (rows.length === 0) return [];

  const eventIds = Array.from(new Set(rows.map((r: any) => r.eventId).filter(Boolean)));
  const eventRows = eventIds.length
    ? await db.select({ id: events.id, title: events.title }).from(events).where(inArray(events.id, eventIds))
    : [];
  const titleById = new Map(eventRows.map((e: any) => [e.id, e.title]));

  const orderIds = Array.from(new Set(rows.map((r: any) => r.orderId).filter(Boolean)));
  const orderRows = orderIds.length
    ? await db.select({ id: orders.id, orderNumber: orders.orderNumber, buyerName: orders.buyerName }).from(orders).where(inArray(orders.id, orderIds))
    : [];
  const orderById = new Map(orderRows.map((o: any) => [o.id, o]));

  return rows.map((r: any) => ({
    id: r.id,
    createdAt: r.createdAt,
    eventTitle: titleById.get(r.eventId) ?? '—',
    orderNumber: orderById.get(r.orderId)?.orderNumber ?? null,
    customerName: orderById.get(r.orderId)?.buyerName ?? null,
    customerEmail: r.customerEmail,
    baseAmount: Number(r.baseAmount),
    commissionPercent: Number(r.commissionPercent),
    commissionAmount: Number(r.commissionAmount),
    clientType: r.clientType as 'exclusivo' | 'existente',
    codeUsed: r.codeUsed,
    salesRank: r.salesRank,
  }));
}

/** Oculta el correo del cliente en el panel público del embajador: le sirve
 * para reconocer a quién le vendió, sin publicar la base de datos. */
export function maskEmail(email: string | null): string {
  if (!email) return '—';
  const [user, domain] = email.split('@');
  if (!domain) return '—';
  const visible = user.slice(0, 2);
  return `${visible}${'*'.repeat(Math.max(2, user.length - 2))}@${domain}`;
}

/** Panel público en /embajador/<CODIGO>. El código hace de llave: no hay
 * login de embajadores (mismo criterio que /mis-referidos). */
export async function getAmbassadorPanel(code: string, now: Date = new Date()) {
  const db = await getDb();
  if (!db) return null;

  const clean = (code ?? '').trim().toUpperCase();
  if (!clean) return null;

  const [ambassador] = await db.select().from(exclusiveAmbassadors)
    .where(eq(exclusiveAmbassadors.code, clean)).limit(1);
  if (!ambassador) return null;

  const monthKey = monthKeyFor(now);
  const stats = await getAmbassadorStats(ambassador.id, monthKey);
  const sales = await getAmbassadorSales(ambassador.id, 50);

  return {
    name: ambassador.name,
    code: ambassador.code,
    active: ambassador.active === 1,
    instagram: ambassador.instagram,
    stats,
    sales: sales.map((s) => ({ ...s, customerEmail: maskEmail(s.customerEmail), customerName: s.customerName })),
  };
}

/** Ranking: se ordena por CANTIDAD de ventas a clientes exclusivos, nunca por
 * dinero (pedido explícito del dueño). */
export async function getAmbassadorRanking(monthKey: string) {
  const db = await getDb();
  if (!db) return [];

  const ambassadors = await db.select().from(exclusiveAmbassadors).orderBy(exclusiveAmbassadors.name);
  const rows = await db.select().from(ambassadorCommissions).where(eq(ambassadorCommissions.monthKey, monthKey));
  const allRows = await db.select().from(ambassadorCommissions);

  const ranking = ambassadors.map((a: any) => {
    const delMes = rows.filter((r: any) => r.ambassadorId === a.id);
    const exclusivas = delMes.filter((r: any) => r.clientType === 'exclusivo');
    return {
      id: a.id,
      name: a.name,
      code: a.code,
      active: a.active === 1,
      exclusiveSales: exclusivas.length,
      existingSales: delMes.length - exclusivas.length,
      monthlyRevenue: delMes.reduce((s: number, r: any) => s + Number(r.baseAmount), 0),
      monthlyCommission: delMes.reduce((s: number, r: any) => s + Number(r.commissionAmount), 0),
      totalCommission: allRows.filter((r: any) => r.ambassadorId === a.id).reduce((s: number, r: any) => s + Number(r.commissionAmount), 0),
    };
  });

  return ranking
    .sort((a, b) => b.exclusiveSales - a.exclusiveSales || b.monthlyRevenue - a.monthlyRevenue)
    .map((r, i) => ({ position: i + 1, ...r }));
}

/** Resumen general del módulo en el admin. */
export async function getAmbassadorAdminSummary(monthKey: string) {
  const db = await getDb();
  if (!db) {
    return {
      monthKey, activeAmbassadors: 0, monthlySales: 0, monthlyRevenue: 0,
      monthlyCommission: 0, newClients: 0, existingClients: 0, topAmbassador: null,
    };
  }

  const ranking = await getAmbassadorRanking(monthKey);
  const rows = await db.select().from(ambassadorCommissions).where(eq(ambassadorCommissions.monthKey, monthKey));
  const exclusivas = rows.filter((r: any) => r.clientType === 'exclusivo');
  const top = ranking.find((r) => r.exclusiveSales > 0) ?? null;
  const deliveries = await db.select({ count: sql<number>`COUNT(*)` }).from(ambassadorBenefitDeliveries)
    .where(eq(ambassadorBenefitDeliveries.monthKey, monthKey));

  return {
    monthKey,
    activeAmbassadors: ranking.filter((r) => r.active).length,
    monthlySales: rows.length,
    monthlyRevenue: rows.reduce((s: number, r: any) => s + Number(r.baseAmount), 0),
    monthlyCommission: rows.reduce((s: number, r: any) => s + Number(r.commissionAmount), 0),
    newClients: exclusivas.length,
    existingClients: rows.length - exclusivas.length,
    benefitsDelivered: Number(deliveries[0]?.count ?? 0),
    topAmbassador: top ? { name: top.name, code: top.code, exclusiveSales: top.exclusiveSales } : null,
  };
}

/** Vista "Clientes referidos": los exclusivos salen de la tabla de propiedad,
 * los existentes se derivan de las comisiones (no son propiedad de nadie). */
export async function listReferredClients() {
  const db = await getDb();
  if (!db) return [];

  const ambassadors = await db.select().from(exclusiveAmbassadors);
  const nameById = new Map(ambassadors.map((a: any) => [a.id, a.name]));

  const owned = await db.select().from(ambassadorClients);
  const commissions = await db.select().from(ambassadorCommissions);

  const exclusivos = owned.map((c: any) => ({
    customerEmail: c.customerEmail,
    ambassadorName: nameById.get(c.ambassadorId) ?? '—',
    firstPurchaseAt: c.firstPurchaseAt,
    ordersCount: c.ordersCount,
    totalSpent: Number(c.totalSpent),
    clientType: 'exclusivo' as const,
  }));

  const yaListados = new Set(exclusivos.map((c) => c.customerEmail));
  const existentesPorEmail = new Map<string, { ambassadorName: string; first: Date; count: number; total: number }>();
  for (const r of commissions) {
    if (r.clientType !== 'existente' || !r.customerEmail || yaListados.has(r.customerEmail)) continue;
    const prev = existentesPorEmail.get(r.customerEmail);
    const at = new Date(r.createdAt);
    if (prev) {
      prev.count += 1;
      prev.total += Number(r.baseAmount);
      if (at < prev.first) prev.first = at;
    } else {
      existentesPorEmail.set(r.customerEmail, {
        ambassadorName: nameById.get(r.ambassadorId) ?? '—',
        first: at, count: 1, total: Number(r.baseAmount),
      });
    }
  }

  const existentes = Array.from(existentesPorEmail.entries()).map(([email, v]) => ({
    customerEmail: email,
    ambassadorName: v.ambassadorName,
    firstPurchaseAt: v.first,
    ordersCount: v.count,
    totalSpent: v.total,
    clientType: 'existente' as const,
  }));

  return [...exclusivos, ...existentes].sort(
    (a, b) => new Date(b.firstPurchaseAt).getTime() - new Date(a.firstPurchaseAt).getTime(),
  );
}

// --- Beneficios entregados ---

/** Clave estable de un tramo de beneficios. Se marca el tramo completo ("le
 * entregué lo de 5 ventas"), no cada ítem por separado -- los ítems son texto
 * editable y cambiarlos no debería borrar el registro de lo ya entregado. */
export function benefitKeyForTier(minSales: number): string {
  return `tramo-${minSales}`;
}

export async function listBenefitDeliveries(monthKey: string) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(ambassadorBenefitDeliveries).where(eq(ambassadorBenefitDeliveries.monthKey, monthKey));
}

export async function markBenefitDelivered(params: { ambassadorId: number; monthKey: string; benefitKey: string; note?: string }) {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  try {
    await db.insert(ambassadorBenefitDeliveries).values({
      ambassadorId: params.ambassadorId,
      monthKey: params.monthKey,
      benefitKey: params.benefitKey,
      note: params.note,
    });
  } catch {
    // Ya estaba marcado (choca el único): la intención del admin ya se cumplió.
  }
  return { success: true };
}

export async function unmarkBenefitDelivered(params: { ambassadorId: number; monthKey: string; benefitKey: string }) {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  await db.delete(ambassadorBenefitDeliveries).where(and(
    eq(ambassadorBenefitDeliveries.ambassadorId, params.ambassadorId),
    eq(ambassadorBenefitDeliveries.monthKey, params.monthKey),
    eq(ambassadorBenefitDeliveries.benefitKey, params.benefitKey),
  ));
  return { success: true };
}

// --- Material de la semana ---

/** El material vigente: la última fila activa. Se guardan las anteriores como
 * historial en vez de sobreescribir. */
export async function getWeeklyMaterial() {
  const db = await getDb();
  if (!db) return null;
  const [row] = await db.select().from(ambassadorWeeklyMaterial)
    .where(eq(ambassadorWeeklyMaterial.active, 1))
    .orderBy(desc(ambassadorWeeklyMaterial.createdAt))
    .limit(1);
  return row ?? null;
}

export async function saveWeeklyMaterial(data: {
  title?: string; storiesText?: string; reelText?: string;
  postText?: string; countdownText?: string; linkUrl?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  // Se desactiva lo anterior y se inserta la semana nueva: así el correo
  // siempre toma una sola versión y queda el historial de lo que se mandó.
  await db.update(ambassadorWeeklyMaterial).set({ active: 0 }).where(eq(ambassadorWeeklyMaterial.active, 1));
  await db.insert(ambassadorWeeklyMaterial).values({
    title: data.title,
    storiesText: data.storiesText,
    reelText: data.reelText,
    postText: data.postText,
    countdownText: data.countdownText,
    linkUrl: data.linkUrl,
    active: 1,
  });
  return { success: true };
}

// --- Correo semanal ---

export const PANEL_BASE_URL = process.env.APP_URL && process.env.APP_URL !== 'https://mansionplayroom.cl'
  ? process.env.APP_URL
  : 'https://mansionplayroom.cl';

/** Manda el resumen semanal a cada embajador activo que tenga correo.
 *
 * Lo llama el cron diario (server/cronRoutes.ts), que ya decidió que hoy es el
 * día configurado. Devuelve el conteo para que el cron lo reporte. Un fallo de
 * envío a una persona no corta el resto: se registra y se sigue. */
export async function sendWeeklyAmbassadorEmails(now: Date = new Date()) {
  const db = await getDb();
  if (!db) return { sent: 0, skipped: 0, failed: 0 };

  const monthKey = monthKeyFor(now);
  const material = await getWeeklyMaterial();
  const featured = await getFeaturedEvent();

  // Si el material no trae cuenta regresiva escrita a mano, se arma con los
  // días que faltan para el próximo evento destacado.
  let countdownText = material?.countdownText ?? null;
  if (!countdownText && featured?.eventDate) {
    const dias = Math.ceil((new Date(featured.eventDate).getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    if (dias > 0) countdownText = `Faltan ${dias} día${dias === 1 ? '' : 's'} para ${featured.title}.`;
  }

  const ambassadors = await db.select().from(exclusiveAmbassadors).where(eq(exclusiveAmbassadors.active, 1));

  let sent = 0, skipped = 0, failed = 0;
  for (const a of ambassadors) {
    if (!a.email) { skipped++; continue; }
    try {
      const stats = await getAmbassadorStats(a.id, monthKey);
      if (!stats) { skipped++; continue; }

      const html = buildAmbassadorWeeklyEmail({
        name: a.name,
        code: a.code,
        monthlySales: stats.monthlySales,
        monthlyExistingSales: stats.monthlyExistingSales,
        monthlyCommission: stats.monthlyCommission,
        totalCommission: stats.totalCommission,
        currentPercent: stats.currentPercent,
        nextTarget: stats.nextTarget,
        benefitItems: stats.benefits.items,
        benefitBonusClp: stats.benefits.bonusClp,
        exclusiveClientsCount: stats.exclusiveClientsCount,
        panelUrl: `${PANEL_BASE_URL}/embajador/${a.code}`,
        material: material ? { ...material, countdownText } : (countdownText ? { countdownText } : null),
      });

      const res = await sendEmail({
        to: a.email,
        subject: stats.nextTarget && stats.monthlySales > 0
          ? `🍬 ${a.name}, te faltan ${stats.nextTarget.salesNeeded} ventas para el ${stats.nextTarget.nextPercent}%`
          : `🍬 Tu resumen de embajador — ${a.name}`,
        html,
      });
      if (res.success) sent++; else failed++;
    } catch (err) {
      console.error(`[Embajadores] Falló el correo semanal de ${a.code}:`, err);
      failed++;
    }
  }

  console.log(`[Embajadores] Correo semanal: ${sent} enviados, ${skipped} sin correo, ${failed} con error.`);
  return { sent, skipped, failed };
}

/* ── Material de la semana generado con IA ────────────────────
 *
 * Mismo molde que `generateMailingTemplate` (server/mailing.ts): prompt de
 * sistema + json_schema + validación con zod. La diferencia clave está en
 * PARA QUIÉN se escribe: esto no lo lee el público, lo lee un embajador que
 * necesita saber qué contenido crear esta semana. Por eso cada campo tiene un
 * trabajo distinto y el prompt lo explica. */

export const WeeklyMaterialContentSchema = z.object({
  title: z.string().min(4).max(80),
  storiesText: z.string().min(20).max(600),
  reelText: z.string().min(20).max(600),
  postText: z.string().min(20).max(800),
  countdownText: z.string().min(4).max(200),
});
export type WeeklyMaterialContent = z.infer<typeof WeeklyMaterialContentSchema>;

const WEEKLY_MATERIAL_JSON_SCHEMA = {
  name: 'weekly_material',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['title', 'storiesText', 'reelText', 'postText', 'countdownText'],
    properties: {
      title: { type: 'string', description: 'Cómo se llama la semana. Corto y con energía, ej: "Semana 2 — cuenta regresiva".' },
      storiesText: { type: 'string', description: 'Qué subir en historias esta semana. Accionable y concreto: qué mostrar, qué decir, qué stickers usar.' },
      reelText: { type: 'string', description: 'La idea del reel: el gancho de los primeros 3 segundos, qué se ve y cómo cierra.' },
      postText: { type: 'string', description: 'Texto sugerido para la publicación del feed, listo para copiar y pegar. Incluye hashtags si aportan.' },
      countdownText: { type: 'string', description: 'Frase de cuenta regresiva al evento, corta y con urgencia genuina.' },
    },
  },
} as const;

const WEEKLY_MATERIAL_SYSTEM_PROMPT = `Preparas el material semanal que Mansion Playroom (productora de fiestas en Viña del Mar y Valparaíso, Chile) le envía a sus embajadores.

QUIÉN LO LEE: no es el público. Lo lee un embajador o embajadora que tiene que crear contenido esta semana para promocionar el evento con su código personal. Tu trabajo es que abra el correo y sepa exactamente qué hacer, sin tener que pensarlo.

Por eso el material es una INSTRUCCIÓN CLARA, no un texto bonito. Nada de "comparte con entusiasmo": di qué grabar, qué mostrar y qué decir.

Cada campo cumple una función distinta y NO se repiten entre sí:
- "title": cómo se llama la semana. Corto, da el tema.
- "storiesText": qué subir en historias. Concreto y accionable — qué mostrar, qué texto poner, qué sticker usar. Es lo que más se usa, hazlo fácil.
- "reelText": la idea del reel. Parte por el gancho de los primeros 3 segundos, después qué se ve, y cómo cierra con llamado a la acción.
- "postText": el texto de la publicación del feed, LISTO PARA COPIAR Y PEGAR. Escríbelo en primera persona como si lo publicara el embajador, no en tercera. Puedes cerrar con hashtags si aportan.
- "countdownText": una frase de cuenta regresiva, corta.

Tono: chileno neutro, tuteo, cercano y con energía de fiesta. Emojis con moderación (🍬✨🔥), nunca más de dos por campo.

REGLAS DURAS:
- El evento es estrictamente +18, pero el contenido que se publica en redes debe ser apto para las normas de Instagram y TikTok: sugerente está bien, explícito NO. Si el material hace que le bajen el post al embajador, no sirve.
- No inventes datos que no te dieron: nada de precios, direcciones, artistas ni horarios que no aparezcan en el contexto.
- Recuérdale usar su código personal, pero sin repetirlo en los cinco campos.

Responde ÚNICAMENTE con el JSON pedido, sin explicaciones.`;

function extractWeeklyContent(message: { content: string | Array<{ type: string; text?: string }> }): string {
  if (typeof message.content === 'string') return message.content;
  return message.content.map((p) => (p.type === 'text' ? p.text ?? '' : '')).join('');
}

/** Rellena los 5 campos del material semanal a partir de una idea.
 *
 * El contexto (evento, fecha, días que faltan, tareas del programa) se arma
 * acá desde datos reales para que la IA no invente y para que el material
 * siempre pida lo que el embajador se comprometió a hacer. */
export async function generateWeeklyMaterial(idea: string): Promise<WeeklyMaterialContent> {
  const evento = await getFeaturedEvent();

  const partesContexto: string[] = [];
  if (evento) {
    partesContexto.push(`Evento: ${evento.title}`);
    if (evento.eventDate) {
      const fecha = new Date(evento.eventDate);
      partesContexto.push(`Fecha: ${fecha.toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' })}`);
      const dias = Math.ceil((fecha.getTime() - Date.now()) / 86_400_000);
      if (dias > 0) partesContexto.push(`Faltan ${dias} días`);
    }
    if (evento.shortDescription) partesContexto.push(`Sobre el evento: ${evento.shortDescription}`);
  }
  partesContexto.push(`Tareas a las que se comprometieron los embajadores: ${AMBASSADOR_TASKS.join('; ')}`);

  const result = await invokeLLM({
    messages: [
      { role: 'system', content: WEEKLY_MATERIAL_SYSTEM_PROMPT },
      { role: 'user', content: `Idea para el material de esta semana: ${idea}\n\nContexto:\n${partesContexto.join('\n')}` },
    ],
    responseFormat: { type: 'json_schema', json_schema: WEEKLY_MATERIAL_JSON_SCHEMA },
  });

  const raw = extractWeeklyContent(result.choices[0]?.message ?? { content: '' });
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('La IA no devolvió un JSON válido. Intenta de nuevo con una idea más clara.');
  }

  const validated = WeeklyMaterialContentSchema.safeParse(parsed);
  if (!validated.success) {
    throw new Error(`El material generado no tiene el formato esperado: ${validated.error.issues[0]?.message ?? 'error desconocido'}.`);
  }
  return validated.data;
}
