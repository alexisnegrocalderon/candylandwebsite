var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// drizzle/schema.ts
import { int, mysqlEnum, mysqlTable, text, timestamp, varchar, decimal, json, index } from "drizzle-orm/mysql-core";
var users, events, ticketTypes, orders, orderItems, tickets, discountCodes, communityCodes, siteSettings, referrals, operators, registers, devices, customers, ops, rateLimits;
var init_schema = __esm({
  "drizzle/schema.ts"() {
    "use strict";
    users = mysqlTable("users", {
      id: int("id").autoincrement().primaryKey(),
      openId: varchar("openId", { length: 64 }).notNull().unique(),
      name: text("name"),
      email: varchar("email", { length: 320 }),
      phone: varchar("phone", { length: 20 }),
      loginMethod: varchar("loginMethod", { length: 64 }),
      role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
      ambassadorCode: varchar("ambassadorCode", { length: 32 }).unique(),
      referredBy: varchar("referredBy", { length: 32 }),
      totalReferrals: int("totalReferrals").default(0).notNull(),
      createdAt: timestamp("createdAt").defaultNow().notNull(),
      updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
      lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull()
    });
    events = mysqlTable("events", {
      id: int("id").autoincrement().primaryKey(),
      title: varchar("title", { length: 255 }).notNull(),
      slug: varchar("slug", { length: 255 }).notNull().unique(),
      description: text("description"),
      shortDescription: varchar("shortDescription", { length: 500 }),
      imageUrl: text("imageUrl"),
      galleryUrls: text("galleryUrls"),
      venue: varchar("venue", { length: 255 }),
      address: varchar("address", { length: 500 }),
      // Link de Google Maps (ej. https://maps.app.goo.gl/xxxx) — se muestra como
      // botón "Ver en Google Maps" en el email final, junto a la dirección.
      mapsUrl: varchar("mapsUrl", { length: 500 }),
      eventDate: timestamp("eventDate").notNull(),
      doorsOpen: timestamp("doorsOpen"),
      eventEnd: timestamp("eventEnd"),
      status: mysqlEnum("status", ["draft", "published", "soldout", "cancelled", "past"]).default("draft").notNull(),
      featured: int("featured").default(0).notNull(),
      createdAt: timestamp("createdAt").defaultNow().notNull(),
      updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull()
    });
    ticketTypes = mysqlTable("ticketTypes", {
      id: int("id").autoincrement().primaryKey(),
      eventId: int("eventId").notNull(),
      name: varchar("name", { length: 100 }).notNull(),
      // Conecta esta entrada con la pregunta "¿cómo vienes?" del checkout
      // conversacional (duo/soltera/soltero/trio/grupo/cumpleaneros) — el wizard
      // busca por este campo, no por el nombre, para no depender de que el admin
      // escriba el nombre exacto con tilde y mayúscula correcta. Solo aplica a
      // category="acceso".
      accesoSlug: varchar("accesoSlug", { length: 50 }),
      // "acceso" = una de las opciones de "¿cómo vienes?" (Dúo/Soltera/etc, una
      // por persona/grupo). "extra" = addon opcional que se ofrece después
      // (estacionamiento, cover, etc.) — el checkout los lista automáticamente
      // en el paso de extras, con su propio stock y precio.
      category: mysqlEnum("category", ["acceso", "extra"]).default("acceso").notNull(),
      description: varchar("description", { length: 500 }),
      price: decimal("price", { precision: 10, scale: 0 }).notNull(),
      originalPrice: decimal("originalPrice", { precision: 10, scale: 0 }),
      totalStock: int("totalStock").notNull(),
      soldCount: int("soldCount").default(0).notNull(),
      maxPerOrder: int("maxPerOrder").default(10).notNull(),
      sortOrder: int("sortOrder").default(0).notNull(),
      status: mysqlEnum("status", ["active", "soldout", "hidden"]).default("active").notNull(),
      salesStart: timestamp("salesStart"),
      salesEnd: timestamp("salesEnd"),
      // --- Módulo /caja (docs/ARQUITECTURA-CAJA.md §4.3) ---
      costPrice: decimal("costPrice", { precision: 10, scale: 0 }),
      // para cálculo de margen (§12)
      color: varchar("color", { length: 20 }),
      // color del botón en la grilla de caja
      internalCode: varchar("internalCode", { length: 10 }),
      // prefijo del código de canje, ej. 'PIS'
      barcode: varchar("barcode", { length: 64 }),
      // preparado para lector de código de barras futuro
      metadata: json("metadata"),
      // atributos extensibles sin migración (talla, duración, etc.)
      createdAt: timestamp("createdAt").defaultNow().notNull(),
      updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull()
    });
    orders = mysqlTable("orders", {
      id: int("id").autoincrement().primaryKey(),
      orderNumber: varchar("orderNumber", { length: 32 }).notNull().unique(),
      userId: int("userId"),
      buyerName: varchar("buyerName", { length: 255 }).notNull(),
      buyerEmail: varchar("buyerEmail", { length: 320 }).notNull(),
      buyerPhone: varchar("buyerPhone", { length: 20 }),
      eventId: int("eventId").notNull(),
      subtotal: decimal("subtotal", { precision: 10, scale: 0 }).notNull(),
      discount: decimal("discount", { precision: 10, scale: 0 }).default("0").notNull(),
      // Recargo por servicio ya calculado (monto, no %) al momento de la compra
      // -- se guarda el monto para poder mostrarlo tal cual en el admin/recibo
      // sin depender de que el % de siteSettings no haya cambiado después.
      serviceFee: decimal("serviceFee", { precision: 10, scale: 0 }).default("0").notNull(),
      total: decimal("total", { precision: 10, scale: 0 }).notNull(),
      discountCodeId: int("discountCodeId"),
      ambassadorCode: varchar("ambassadorCode", { length: 32 }),
      paymentStatus: mysqlEnum("paymentStatus", ["pending", "approved", "rejected", "refunded"]).default("pending").notNull(),
      paymentId: varchar("paymentId", { length: 255 }),
      paymentMethod: varchar("paymentMethod", { length: 64 }),
      mercadoPagoPreferenceId: varchar("mercadoPagoPreferenceId", { length: 255 }),
      emailSent: int("emailSent").default(0).notNull(),
      // Misión 300: preventa donde se paga un abono de $10.000/persona hasta 3
      // días antes del evento. Si se junta la meta, nadie paga más y se entrega
      // el ticket con el abono. Si no se junta, cada quien completa hasta el
      // 60% del valor general de su entrada (el abono ya cuenta como parte de
      // ese 60%) — recién ahí se genera el ticket/QR, nunca con solo el abono.
      missionDeposit: int("missionDeposit").default(0).notNull(),
      missionTopupStatus: mysqlEnum("missionTopupStatus", ["none", "pending", "paid"]).default("none").notNull(),
      missionTopupAmount: decimal("missionTopupAmount", { precision: 10, scale: 0 }),
      missionTopupPreferenceId: varchar("missionTopupPreferenceId", { length: 255 }),
      // Separado de emailSent (que significa "ya se mandó el ticket con QR") —
      // el mail de "te uniste a la Misión 300" se manda antes que eso, cuando
      // se aprueba el abono, y todavía no hay ticket ni QR.
      depositEmailSent: int("depositEmailSent").default(0).notNull(),
      // JSON con los datos por asistente capturados en el checkout (nombre del
      // titular + acompañantes) — antes solo se mandaba como metadata a la
      // Preferencia de Mercado Pago (que ya no se crea), nunca se guardaba acá,
      // así que se perdía. Se usa para mostrar los nombres en el ticket público
      // y en el email de confirmación.
      attendeeData: text("attendeeData"),
      // --- Módulo /caja (docs/ARQUITECTURA-CAJA.md §0.4, §4.3) ---
      // Canal de la venta: web = checkout normal, caja = venta presencial en el
      // evento, import = migración de la ticketera anterior (ya usado por
      // paymentMethod='Importado - ticketera anterior' antes de esta columna).
      channel: mysqlEnum("channel", ["web", "caja", "import"]).default("web").notNull(),
      operatorId: int("operatorId"),
      // quién registró la venta (solo canal caja)
      registerId: int("registerId"),
      // caja física donde se registró
      createdAt: timestamp("createdAt").defaultNow().notNull(),
      updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull()
    });
    orderItems = mysqlTable("orderItems", {
      id: int("id").autoincrement().primaryKey(),
      orderId: int("orderId").notNull(),
      ticketTypeId: int("ticketTypeId").notNull(),
      quantity: int("quantity").notNull(),
      unitPrice: decimal("unitPrice", { precision: 10, scale: 0 }).notNull(),
      totalPrice: decimal("totalPrice", { precision: 10, scale: 0 }).notNull(),
      // Copia de ticketTypes.costPrice al momento de la venta (docs/ARQUITECTURA-CAJA.md
      // §12) — así un cambio de costo futuro no reescribe la utilidad de eventos pasados.
      unitCost: decimal("unitCost", { precision: 10, scale: 0 }),
      createdAt: timestamp("createdAt").defaultNow().notNull()
    });
    tickets = mysqlTable("tickets", {
      id: int("id").autoincrement().primaryKey(),
      ticketCode: varchar("ticketCode", { length: 64 }).notNull().unique(),
      orderId: int("orderId").notNull(),
      orderItemId: int("orderItemId").notNull(),
      eventId: int("eventId").notNull(),
      ticketTypeId: int("ticketTypeId").notNull(),
      holderName: varchar("holderName", { length: 255 }),
      qrData: text("qrData"),
      qrImageUrl: text("qrImageUrl"),
      status: mysqlEnum("status", ["valid", "used", "cancelled"]).default("valid").notNull(),
      usedAt: timestamp("usedAt"),
      // --- Módulo /caja (docs/ARQUITECTURA-CAJA.md §9) ---
      usedByOperatorId: int("usedByOperatorId"),
      // auditoría de canje
      usedAtRegisterId: int("usedAtRegisterId"),
      displayCode: varchar("displayCode", { length: 20 }).unique(),
      // código legible PIS-XXXX-XXXX
      createdAt: timestamp("createdAt").defaultNow().notNull()
    });
    discountCodes = mysqlTable("discountCodes", {
      id: int("id").autoincrement().primaryKey(),
      code: varchar("code", { length: 50 }).notNull().unique(),
      description: varchar("description", { length: 255 }),
      discountType: mysqlEnum("discountType", ["percentage", "fixed"]).notNull(),
      discountValue: decimal("discountValue", { precision: 10, scale: 0 }).notNull(),
      minPurchase: decimal("minPurchase", { precision: 10, scale: 0 }),
      maxUses: int("maxUses"),
      usedCount: int("usedCount").default(0).notNull(),
      eventId: int("eventId"),
      validFrom: timestamp("validFrom"),
      validUntil: timestamp("validUntil"),
      isActive: int("isActive").default(1).notNull(),
      createdAt: timestamp("createdAt").defaultNow().notNull(),
      updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull()
    });
    communityCodes = mysqlTable("communityCodes", {
      id: int("id").autoincrement().primaryKey(),
      code: varchar("code", { length: 50 }).notNull().unique(),
      label: varchar("label", { length: 255 }),
      maxUses: int("maxUses"),
      usedCount: int("usedCount").default(0).notNull(),
      isActive: int("isActive").default(1).notNull(),
      createdAt: timestamp("createdAt").defaultNow().notNull(),
      updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull()
    });
    siteSettings = mysqlTable("siteSettings", {
      id: int("id").autoincrement().primaryKey(),
      instagramFollowers: int("instagramFollowers").default(0).notNull(),
      instagramPosts: int("instagramPosts").default(0).notNull(),
      serviceFeePercent: decimal("serviceFeePercent", { precision: 5, scale: 2 }).default("0").notNull(),
      updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull()
    });
    referrals = mysqlTable("referrals", {
      id: int("id").autoincrement().primaryKey(),
      // Nullable: los compradores normales nunca tienen fila en `users` (esa
      // tabla solo la usa el login OAuth/admin, que los compradores no usan) —
      // el identificador confiable de "quién es el embajador" es siempre
      // ambassadorCode, no este FK. Se deja por compatibilidad con filas viejas.
      ambassadorUserId: int("ambassadorUserId"),
      ambassadorCode: varchar("ambassadorCode", { length: 32 }).notNull(),
      orderId: int("orderId").notNull(),
      buyerEmail: varchar("buyerEmail", { length: 320 }).notNull(),
      ticketCount: int("ticketCount").notNull(),
      orderTotal: decimal("orderTotal", { precision: 10, scale: 0 }).notNull(),
      createdAt: timestamp("createdAt").defaultNow().notNull()
    });
    operators = mysqlTable("operators", {
      id: int("id").autoincrement().primaryKey(),
      name: varchar("name", { length: 255 }).notNull(),
      pinHash: varchar("pinHash", { length: 255 }).notNull(),
      role: mysqlEnum("role", ["admin", "supervisor", "caja", "barra", "acceso"]).notNull(),
      active: int("active").default(1).notNull(),
      // Rate limiting del login por PIN (docs/ARQUITECTURA-CAJA.md §13, riesgo 7)
      // -- el PIN es mucho más débil que una contraseña y la tablet es compartida.
      failedPinAttempts: int("failedPinAttempts").default(0).notNull(),
      lockedUntil: timestamp("lockedUntil"),
      createdAt: timestamp("createdAt").defaultNow().notNull(),
      updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull()
    });
    registers = mysqlTable("registers", {
      id: int("id").autoincrement().primaryKey(),
      name: varchar("name", { length: 100 }).notNull(),
      active: int("active").default(1).notNull(),
      createdAt: timestamp("createdAt").defaultNow().notNull()
    });
    devices = mysqlTable("devices", {
      id: int("id").autoincrement().primaryKey(),
      name: varchar("name", { length: 255 }).notNull(),
      enrollCode: varchar("enrollCode", { length: 16 }).unique(),
      enrollCodeExpiresAt: timestamp("enrollCodeExpiresAt"),
      deviceTokenHash: varchar("deviceTokenHash", { length: 255 }),
      enrolled: int("enrolled").default(0).notNull(),
      active: int("active").default(1).notNull(),
      createdAt: timestamp("createdAt").defaultNow().notNull(),
      lastSeenAt: timestamp("lastSeenAt")
    });
    customers = mysqlTable("customers", {
      id: int("id").autoincrement().primaryKey(),
      email: varchar("email", { length: 320 }).notNull().unique(),
      fullName: varchar("fullName", { length: 255 }),
      phone: varchar("phone", { length: 20 }),
      rut: varchar("rut", { length: 20 }),
      instagram: varchar("instagram", { length: 100 }),
      accessTypes: json("accessTypes"),
      // string[] de accesoSlug
      tags: json("tags"),
      // string[] libres
      totalOrders: int("totalOrders").default(0).notNull(),
      totalSpent: decimal("totalSpent", { precision: 10, scale: 0 }).default("0").notNull(),
      notes: text("notes"),
      firstSeenAt: timestamp("firstSeenAt").defaultNow().notNull(),
      lastSeenAt: timestamp("lastSeenAt").defaultNow().notNull(),
      createdAt: timestamp("createdAt").defaultNow().notNull(),
      updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull()
    });
    ops = mysqlTable("ops", {
      id: varchar("id", { length: 36 }).primaryKey(),
      // UUID generado en el cliente (idempotencia)
      type: mysqlEnum("type", ["redeem", "sale", "void_code", "note", "shift_open", "shift_close", "manual_adjust"]).notNull(),
      eventId: int("eventId").notNull(),
      operatorId: int("operatorId").notNull(),
      registerId: int("registerId"),
      targetType: varchar("targetType", { length: 32 }).notNull(),
      // 'ticket' | 'order' | 'customer' | ...
      targetId: varchar("targetId", { length: 64 }).notNull(),
      payload: json("payload"),
      // detalle completo de la operación
      clientAt: timestamp("clientAt").notNull(),
      // hora del dispositivo al ejecutar
      serverAt: timestamp("serverAt").defaultNow().notNull(),
      // hora del servidor al aplicar
      result: mysqlEnum("result", ["applied", "conflict", "rejected"]).notNull(),
      conflictNote: varchar("conflictNote", { length: 500 })
    }, (table) => ({
      // docs/ARQUITECTURA-CAJA.md §13 riesgo 9: el ledger crece sin límite --
      // estos son los dos patrones de consulta reales (snapshot/reportes por
      // evento+fecha, auditoría por operador).
      eventServerAtIdx: index("ops_event_server_at_idx").on(table.eventId, table.serverAt),
      operatorIdx: index("ops_operator_idx").on(table.operatorId)
    }));
    rateLimits = mysqlTable("rateLimits", {
      key: varchar("key", { length: 128 }).primaryKey(),
      attempts: int("attempts").default(0).notNull(),
      lockedUntil: timestamp("lockedUntil"),
      updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull()
    });
  }
});

// server/caja/ops.ts
var ops_exports = {};
__export(ops_exports, {
  applyOp: () => applyOp
});
import { eq } from "drizzle-orm";
async function applyOp(db, params, mutate) {
  const [existing] = await db.select().from(ops).where(eq(ops.id, params.id)).limit(1);
  if (existing) return { result: existing.result, conflictNote: existing.conflictNote ?? void 0 };
  const { result, conflictNote } = await mutate();
  await db.insert(ops).values({
    id: params.id,
    type: params.type,
    eventId: params.eventId,
    operatorId: params.operatorId,
    registerId: params.registerId ?? null,
    targetType: params.targetType,
    targetId: params.targetId,
    payload: params.payload ?? null,
    clientAt: params.clientAt,
    result,
    conflictNote: conflictNote ?? null
  });
  return { result, conflictNote };
}
var init_ops = __esm({
  "server/caja/ops.ts"() {
    "use strict";
    init_schema();
  }
});

// server/_core/app.ts
import express from "express";
import { createExpressMiddleware } from "@trpc/server/adapters/express";

// shared/const.ts
var COOKIE_NAME = "app_session_id";
var CAJA_COOKIE_NAME = "caja_session_id";
var CAJA_DEVICE_COOKIE_NAME = "caja_device_id";
var ONE_YEAR_MS = 1e3 * 60 * 60 * 24 * 365;
var CAJA_SESSION_MS = 1e3 * 60 * 60 * 12;
var AXIOS_TIMEOUT_MS = 3e4;
var UNAUTHED_ERR_MSG = "Please login (10001)";
var NOT_ADMIN_ERR_MSG = "You do not have required permission (10002)";
var OAUTH_STATE_COOKIE = "__Host-oauth_state";
var decodeOAuthState = (state) => {
  let decoded;
  try {
    decoded = atob(state);
  } catch {
    return { redirectUri: "" };
  }
  try {
    const parsed = JSON.parse(decoded);
    if (parsed && typeof parsed.redirectUri === "string") return parsed;
  } catch {
  }
  return { redirectUri: decoded };
};

// server/_core/oauth.ts
import { parse as parseCookieHeader2 } from "cookie";

// server/db.ts
init_schema();
import { eq as eq2, desc, and, sql, or, gte, lte, like, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";

// server/_core/env.ts
var ENV = {
  appId: process.env.VITE_APP_ID ?? "",
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? ""
};

// server/db.ts
import { nanoid } from "nanoid";

// shared/mission300.ts
var MISSION_300_GOAL = 300;
var MISSION_300_DEPOSIT_PER_PERSON = 1e4;
var MISSION_300_CUTOFF_DAYS = 3;
var MISSION_300_TOPUP_CAP_PCT = 0.6;
var ACCESO_PERSONAS = {
  duo: 2,
  duo_mujeres: 2,
  soltera: 1,
  soltero: 1,
  trio: 3,
  grupo: 4,
  cumpleaneros: 1
};
var ACCESO_DEPOSIT_UNITS = {
  ...ACCESO_PERSONAS,
  duo_mujeres: 1
};
function personasForAccesoSlug(accesoSlug) {
  if (!accesoSlug) return 1;
  return ACCESO_PERSONAS[accesoSlug] ?? 1;
}
function depositUnitsForAccesoSlug(accesoSlug) {
  if (!accesoSlug) return 1;
  return ACCESO_DEPOSIT_UNITS[accesoSlug] ?? personasForAccesoSlug(accesoSlug);
}
function missionCutoff(eventDate) {
  return new Date(eventDate.getTime() - MISSION_300_CUTOFF_DAYS * 24 * 60 * 60 * 1e3);
}
function isMissionWindowOpen(eventDate, now = /* @__PURE__ */ new Date()) {
  return now.getTime() < missionCutoff(eventDate).getTime();
}
function missionDepositPrice(accesoSlug) {
  return MISSION_300_DEPOSIT_PER_PERSON * depositUnitsForAccesoSlug(accesoSlug);
}
function missionCapPrice(generalPrice) {
  return Math.round(generalPrice * MISSION_300_TOPUP_CAP_PCT);
}

// server/db.ts
var _db = null;
async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle({
        connection: {
          uri: process.env.DATABASE_URL,
          ssl: { minVersion: "TLSv1.2", rejectUnauthorized: true }
        }
      });
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}
async function upsertUser(user) {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) return;
  try {
    const values = { openId: user.openId };
    const updateSet = {};
    const textFields = ["name", "email", "loginMethod"];
    const assignNullable = (field) => {
      const value = user[field];
      if (value === void 0) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };
    textFields.forEach(assignNullable);
    if (user.lastSignedIn !== void 0) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== void 0) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = "admin";
      updateSet.role = "admin";
    }
    if (!values.lastSignedIn) values.lastSignedIn = /* @__PURE__ */ new Date();
    if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = /* @__PURE__ */ new Date();
    if (!values.ambassadorCode) {
      values.ambassadorCode = nanoid(8).toUpperCase();
    }
    await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}
async function getUserByOpenId(openId) {
  const db = await getDb();
  if (!db) return void 0;
  const result = await db.select().from(users).where(eq2(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : void 0;
}
async function getPublishedEvents() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(events).where(eq2(events.status, "published")).orderBy(events.eventDate);
}
async function getAllEvents() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(events).orderBy(desc(events.createdAt));
}
async function getHomeEvents() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(events).where(or(eq2(events.status, "published"), eq2(events.status, "past"), eq2(events.status, "soldout"))).orderBy(events.eventDate);
}
async function getEventBySlug(slug) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(events).where(eq2(events.slug, slug)).limit(1);
  return result[0] ?? null;
}
async function createEvent(data) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const eventDate = new Date(data.eventDate);
  const doorsOpen = data.doorsOpen ? new Date(data.doorsOpen) : void 0;
  await db.insert(events).values({
    ...data,
    eventDate,
    doorsOpen,
    status: data.status || "draft"
  });
  return { success: true };
}
async function updateEvent(id, data) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const updateData = { ...data };
  if (data.eventDate) updateData.eventDate = new Date(data.eventDate);
  if (data.doorsOpen) updateData.doorsOpen = new Date(data.doorsOpen);
  await db.update(events).set(updateData).where(eq2(events.id, id));
  return { success: true };
}
async function deleteEvent(id) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(events).where(eq2(events.id, id));
  return { success: true };
}
async function getTicketTypesByEventId(eventId) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(ticketTypes).where(eq2(ticketTypes.eventId, eventId)).orderBy(ticketTypes.sortOrder);
}
async function createTicketType(data) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(ticketTypes).values({
    ...data,
    price: String(data.price),
    originalPrice: data.originalPrice ? String(data.originalPrice) : void 0,
    costPrice: data.costPrice !== void 0 ? String(data.costPrice) : void 0
  });
  return { success: true };
}
async function updateTicketType(id, data) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const updateData = { ...data };
  if (data.price !== void 0) updateData.price = String(data.price);
  if (data.originalPrice !== void 0) updateData.originalPrice = String(data.originalPrice);
  if (data.costPrice !== void 0) updateData.costPrice = String(data.costPrice);
  await db.update(ticketTypes).set(updateData).where(eq2(ticketTypes.id, id));
  return { success: true };
}
async function deleteTicketType(id) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(ticketTypes).where(eq2(ticketTypes.id, id));
  return { success: true };
}
async function getTicketByCode(ticketCode) {
  const db = await getDb();
  if (!db) return null;
  const [ticket] = await db.select().from(tickets).where(eq2(tickets.ticketCode, ticketCode)).limit(1);
  if (!ticket) return null;
  const [order] = await db.select().from(orders).where(eq2(orders.id, ticket.orderId)).limit(1);
  const [event] = await db.select().from(events).where(eq2(events.id, ticket.eventId)).limit(1);
  const [ticketType] = await db.select().from(ticketTypes).where(eq2(ticketTypes.id, ticket.ticketTypeId)).limit(1);
  const attendeeNames = parseAttendeeNames(order?.attendeeData);
  const extras = order ? await getOrderExtras(order.id) : [];
  return {
    ticketCode: ticket.ticketCode,
    status: ticket.status,
    qrImageUrl: ticket.qrImageUrl,
    holderName: ticket.holderName,
    attendeeNames: attendeeNames.length > 0 ? attendeeNames : ticket.holderName ? [ticket.holderName] : [],
    ticketTypeName: ticketType?.name ?? "Entrada",
    eventTitle: event?.title ?? "",
    eventDate: event?.eventDate ?? null,
    doorsOpen: event?.doorsOpen ?? null,
    eventEnd: event?.eventEnd ?? null,
    venue: event?.venue ?? "",
    address: event?.address ?? "",
    extras
  };
}
async function getOrderExtras(orderId) {
  const db = await getDb();
  if (!db) return [];
  const orderTickets = await db.select().from(tickets).where(eq2(tickets.orderId, orderId));
  const grouped = /* @__PURE__ */ new Map();
  for (const t2 of orderTickets) {
    const [tt] = await db.select().from(ticketTypes).where(eq2(ticketTypes.id, t2.ticketTypeId)).limit(1);
    if (tt?.category !== "extra") continue;
    const entry = grouped.get(t2.ticketTypeId) ?? { name: tt.name, quantity: 0, codes: [] };
    entry.quantity += 1;
    entry.codes.push(t2.displayCode || t2.ticketCode);
    grouped.set(t2.ticketTypeId, entry);
  }
  return Array.from(grouped.values());
}
async function validateDiscountCode(code, eventId) {
  const db = await getDb();
  if (!db) return { valid: false, message: "Service unavailable" };
  const result = await db.select().from(discountCodes).where(eq2(discountCodes.code, code)).limit(1);
  if (result.length === 0) return { valid: false, message: "C\xF3digo no encontrado" };
  const discount = result[0];
  if (!discount.isActive) return { valid: false, message: "C\xF3digo inactivo" };
  if (discount.maxUses && discount.usedCount >= discount.maxUses) return { valid: false, message: "C\xF3digo agotado" };
  if (discount.validUntil && new Date(discount.validUntil) < /* @__PURE__ */ new Date()) return { valid: false, message: "C\xF3digo expirado" };
  if (discount.validFrom && new Date(discount.validFrom) > /* @__PURE__ */ new Date()) return { valid: false, message: "C\xF3digo a\xFAn no v\xE1lido" };
  if (discount.eventId && discount.eventId !== eventId) return { valid: false, message: "C\xF3digo no v\xE1lido para este evento" };
  return { valid: true, discount };
}
async function getAllDiscountCodes() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(discountCodes).orderBy(desc(discountCodes.createdAt));
}
async function createDiscountCode(data) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(discountCodes).values({
    ...data,
    discountValue: String(data.discountValue),
    minPurchase: data.minPurchase ? String(data.minPurchase) : void 0,
    validFrom: data.validFrom ? new Date(data.validFrom) : void 0,
    validUntil: data.validUntil ? new Date(data.validUntil) : void 0
  });
  return { success: true };
}
async function updateDiscountCode(id, data) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const updateData = { ...data };
  if (data.discountValue !== void 0) updateData.discountValue = String(data.discountValue);
  if (data.validUntil) updateData.validUntil = new Date(data.validUntil);
  await db.update(discountCodes).set(updateData).where(eq2(discountCodes.id, id));
  return { success: true };
}
async function deleteDiscountCode(id) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(discountCodes).where(eq2(discountCodes.id, id));
  return { success: true };
}
async function validateCommunityCode(code) {
  const db = await getDb();
  if (!db) return { valid: false, message: "Service unavailable" };
  const result = await db.select().from(communityCodes).where(eq2(communityCodes.code, code)).limit(1);
  if (result.length === 0) return { valid: false, message: "C\xF3digo no encontrado" };
  const entry = result[0];
  if (!entry.isActive) return { valid: false, message: "C\xF3digo inactivo" };
  if (entry.maxUses && entry.usedCount >= entry.maxUses) return { valid: false, message: "C\xF3digo agotado" };
  return { valid: true, communityCode: entry };
}
async function markCommunityCodeUsed(id) {
  const db = await getDb();
  if (!db) return;
  await db.update(communityCodes).set({ usedCount: sql`usedCount + 1` }).where(eq2(communityCodes.id, id));
}
async function getAllCommunityCodes() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(communityCodes).orderBy(desc(communityCodes.createdAt));
}
async function createCommunityCode(data) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(communityCodes).values(data);
  return { success: true };
}
async function updateCommunityCode(id, data) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(communityCodes).set(data).where(eq2(communityCodes.id, id));
  return { success: true };
}
async function deleteCommunityCode(id) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(communityCodes).where(eq2(communityCodes.id, id));
  return { success: true };
}
async function getSiteSettings() {
  const db = await getDb();
  if (!db) return { instagramFollowers: 0, instagramPosts: 0, serviceFeePercent: "0" };
  const [row] = await db.select().from(siteSettings).limit(1);
  if (row) return row;
  return { instagramFollowers: 0, instagramPosts: 0, serviceFeePercent: "0" };
}
async function updateSiteSettings(data) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const updateData = { ...data };
  if (data.serviceFeePercent !== void 0) updateData.serviceFeePercent = String(data.serviceFeePercent);
  const [row] = await db.select().from(siteSettings).limit(1);
  if (row) {
    await db.update(siteSettings).set(updateData).where(eq2(siteSettings.id, row.id));
  } else {
    await db.insert(siteSettings).values({ instagramFollowers: 0, instagramPosts: 0, ...updateData });
  }
  return { success: true };
}
function parseAttendeeNames(attendeeDataJson) {
  if (!attendeeDataJson) return [];
  try {
    const parsed = JSON.parse(attendeeDataJson);
    const campos = parsed?.campos ?? {};
    const names = [];
    for (const [key, value] of Object.entries(campos)) {
      if (typeof value === "string" && value.trim() && /nombre/i.test(key)) {
        names.push(value.trim());
      }
    }
    return names;
  } catch {
    return [];
  }
}
async function createOrder(input) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const event = await getEventBySlug(input.eventSlug);
  if (!event) throw new Error("Event not found");
  const missionOpen = isMissionWindowOpen(new Date(event.eventDate));
  let missionDeposit = false;
  const tts = await getTicketTypesByEventId(event.id);
  let subtotal = 0;
  let accesoSubtotal = 0;
  const unitPrices = /* @__PURE__ */ new Map();
  for (const item of input.items) {
    const tt = tts.find((t2) => t2.id === item.ticketTypeId);
    if (!tt) throw new Error(`Ticket type ${item.ticketTypeId} not found`);
    const available = tt.totalStock - tt.soldCount;
    if (item.quantity > available) throw new Error(`Not enough stock for ${tt.name}`);
    const useDeposit = missionOpen && tt.category === "acceso";
    const unitPrice = useDeposit ? missionDepositPrice(tt.accesoSlug) : Number(tt.price);
    if (useDeposit) missionDeposit = true;
    unitPrices.set(item.ticketTypeId, unitPrice);
    const lineTotal = unitPrice * item.quantity;
    subtotal += lineTotal;
    if (tt.category === "acceso") accesoSubtotal += lineTotal;
  }
  let discountAmount = 0;
  let discountCodeId;
  if (input.discountCode) {
    const validation = await validateDiscountCode(input.discountCode, event.id);
    if (validation.valid && validation.discount) {
      const disc = validation.discount;
      discountCodeId = disc.id;
      if (disc.discountType === "percentage") {
        discountAmount = Math.round(accesoSubtotal * Number(disc.discountValue) / 100);
      } else {
        discountAmount = Math.min(Number(disc.discountValue), accesoSubtotal);
      }
      await db.update(discountCodes).set({ usedCount: sql`usedCount + 1` }).where(eq2(discountCodes.id, disc.id));
    }
  }
  if (input.communityCode) {
    const validation = await validateCommunityCode(input.communityCode);
    if (!validation.valid) throw new Error(validation.message || "C\xF3digo de comunidad inv\xE1lido");
    if (validation.communityCode) await markCommunityCodeUsed(validation.communityCode.id);
  }
  const preTotal = Math.max(0, subtotal - discountAmount);
  const settings = await getSiteSettings();
  const serviceFeePercent = Number(settings.serviceFeePercent ?? 0);
  const serviceFee = serviceFeePercent > 0 ? Math.round(preTotal * serviceFeePercent / 100) : 0;
  const total = preTotal + serviceFee;
  const orderNumber = `MP-${Date.now().toString(36).toUpperCase()}-${nanoid(4).toUpperCase()}`;
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
    paymentStatus: "pending",
    missionDeposit: missionDeposit ? 1 : 0,
    attendeeData: input.attendeeData
  });
  const orderId = orderResult.insertId;
  for (const item of input.items) {
    const unitPrice = unitPrices.get(item.ticketTypeId);
    const tt = tts.find((t2) => t2.id === item.ticketTypeId);
    await db.insert(orderItems).values({
      orderId,
      ticketTypeId: item.ticketTypeId,
      quantity: item.quantity,
      unitPrice: String(unitPrice),
      totalPrice: String(unitPrice * item.quantity),
      // Copia el costo del producto al momento de la venta (docs/ARQUITECTURA-CAJA.md
      // §12) -- si el costo se edita después, la utilidad histórica no cambia.
      unitCost: tt?.costPrice != null ? String(tt.costPrice) : null
    });
  }
  const isFree = total === 0;
  if (isFree) {
    await db.update(orders).set({
      paymentStatus: "approved",
      paymentId: `FREE-${orderNumber}`,
      // Si esta orden usaba precio de abono Misión 300, no queda diferencia
      // por cobrar después — se resuelve de una, no entra a evaluateMission300.
      ...missionDeposit ? { missionTopupStatus: "paid", missionTopupAmount: "0" } : {}
    }).where(eq2(orders.id, orderId));
    for (const item of input.items) {
      await db.update(ticketTypes).set({ soldCount: sql`soldCount + ${item.quantity}` }).where(eq2(ticketTypes.id, item.ticketTypeId));
    }
  }
  return { orderId, orderNumber, total, isFree };
}
async function getAllOrders(page = 1, limit = 50, status, channel) {
  const db = await getDb();
  if (!db) return { orders: [], total: 0 };
  const offset = (page - 1) * limit;
  const conditions = [];
  if (status) conditions.push(eq2(orders.paymentStatus, status));
  if (channel === "caja") conditions.push(eq2(orders.channel, "caja"));
  else if (channel === "web") conditions.push(sql`${orders.channel} != 'caja'`);
  const query = db.select().from(orders).where(conditions.length ? and(...conditions) : void 0).orderBy(desc(orders.createdAt)).limit(limit).offset(offset);
  const allOrders = await query;
  return { orders: allOrders, total: allOrders.length };
}
async function getOrderTickets(orderId) {
  const db = await getDb();
  if (!db) return [];
  const orderTickets = await db.select().from(tickets).where(eq2(tickets.orderId, orderId));
  const result = [];
  for (const t2 of orderTickets) {
    const [tt] = await db.select().from(ticketTypes).where(eq2(ticketTypes.id, t2.ticketTypeId)).limit(1);
    result.push({
      ticketCode: t2.ticketCode,
      status: t2.status,
      holderName: t2.holderName,
      ticketTypeName: tt?.name ?? "Entrada",
      category: tt?.category ?? "acceso"
    });
  }
  return result;
}
async function getOrdersForExport(filters) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [];
  if (filters.eventId) conditions.push(eq2(orders.eventId, filters.eventId));
  if (filters.status) conditions.push(eq2(orders.paymentStatus, filters.status));
  if (filters.dateFrom) conditions.push(gte(orders.createdAt, new Date(filters.dateFrom)));
  if (filters.dateTo) conditions.push(lte(orders.createdAt, new Date(filters.dateTo)));
  if (filters.channel === "caja") conditions.push(eq2(orders.channel, "caja"));
  else if (filters.channel === "web") conditions.push(sql`${orders.channel} != 'caja'`);
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
    ambassadorCode: orders.ambassadorCode
  }).from(orders).leftJoin(events, eq2(orders.eventId, events.id)).where(conditions.length ? and(...conditions) : void 0).orderBy(desc(orders.createdAt));
  return rows;
}
async function getOrderStats(channel) {
  const db = await getDb();
  if (!db) return { totalOrders: 0, totalRevenue: 0, approvedOrders: 0 };
  const where = channel === "caja" ? eq2(orders.channel, "caja") : channel === "web" ? sql`${orders.channel} != 'caja'` : void 0;
  const [stats] = await db.select({
    totalOrders: sql`COUNT(*)`,
    totalRevenue: sql`COALESCE(SUM(CASE WHEN paymentStatus = 'approved' THEN total ELSE 0 END), 0)`,
    approvedOrders: sql`SUM(CASE WHEN paymentStatus = 'approved' THEN 1 ELSE 0 END)`
  }).from(orders).where(where);
  return stats;
}
async function getReferralStats() {
  const db = await getDb();
  if (!db) return [];
  return db.select({
    ambassadorCode: referrals.ambassadorCode,
    ambassadorUserId: referrals.ambassadorUserId,
    totalReferrals: sql`COUNT(*)`,
    totalTickets: sql`SUM(ticketCount)`,
    totalRevenue: sql`SUM(orderTotal)`
  }).from(referrals).groupBy(referrals.ambassadorCode, referrals.ambassadorUserId);
}
async function getUserReferrals(userId) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(referrals).where(eq2(referrals.ambassadorUserId, userId)).orderBy(desc(referrals.createdAt));
}
async function getReferralLeaderboard(eventId) {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.select({
    ambassadorCode: referrals.ambassadorCode,
    totalReferrals: sql`COUNT(*)`,
    lastReferralAt: sql`MAX(${referrals.createdAt})`
  }).from(referrals).innerJoin(orders, eq2(orders.id, referrals.orderId)).where(eq2(orders.eventId, eventId)).groupBy(referrals.ambassadorCode).orderBy(desc(sql`COUNT(*)`));
  const leaderboard = [];
  for (const row of rows) {
    const [owner] = await db.select().from(orders).where(and(eq2(orders.ambassadorCode, row.ambassadorCode), eq2(orders.paymentStatus, "approved"))).limit(1);
    if (!owner) continue;
    leaderboard.push({
      ambassadorCode: row.ambassadorCode,
      firstName: owner.buyerName.trim().split(/\s+/)[0],
      totalReferrals: Number(row.totalReferrals),
      recentStreak: Date.now() - new Date(row.lastReferralAt).getTime() <= 48 * 60 * 60 * 1e3
    });
  }
  return leaderboard;
}
async function getReferralsByCode(ambassadorCode) {
  const db = await getDb();
  if (!db) return null;
  const code = ambassadorCode.trim().toUpperCase();
  if (!code) return null;
  const [owner] = await db.select().from(orders).where(and(eq2(orders.ambassadorCode, code), eq2(orders.paymentStatus, "approved"))).limit(1);
  if (!owner) return null;
  const rows = await db.select().from(referrals).where(eq2(referrals.ambassadorCode, code)).orderBy(desc(referrals.createdAt));
  return { ambassadorCode: code, buyerName: owner.buyerName, referrals: rows };
}
async function createOperator(input) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [result] = await db.insert(operators).values(input);
  return result.insertId;
}
async function getOperatorById(id) {
  const db = await getDb();
  if (!db) return void 0;
  const result = await db.select().from(operators).where(eq2(operators.id, id)).limit(1);
  return result.length > 0 ? result[0] : void 0;
}
async function listActiveOperatorsPublic() {
  const db = await getDb();
  if (!db) return [];
  return db.select({ id: operators.id, name: operators.name, role: operators.role }).from(operators).where(eq2(operators.active, 1)).orderBy(operators.name);
}
async function listAllOperators() {
  const db = await getDb();
  if (!db) return [];
  return db.select({ id: operators.id, name: operators.name, role: operators.role, active: operators.active, createdAt: operators.createdAt }).from(operators).orderBy(desc(operators.createdAt));
}
async function updateOperator(id, input) {
  const db = await getDb();
  if (!db) return;
  await db.update(operators).set(input).where(eq2(operators.id, id));
}
var PIN_MAX_ATTEMPTS = 5;
var PIN_LOCKOUT_MS = 5 * 60 * 1e3;
async function recordFailedPinAttempt(operatorId) {
  const db = await getDb();
  if (!db) return;
  const [operator] = await db.select().from(operators).where(eq2(operators.id, operatorId)).limit(1);
  if (!operator) return;
  const attempts = operator.failedPinAttempts + 1;
  await db.update(operators).set({
    failedPinAttempts: attempts,
    lockedUntil: attempts >= PIN_MAX_ATTEMPTS ? new Date(Date.now() + PIN_LOCKOUT_MS) : operator.lockedUntil
  }).where(eq2(operators.id, operatorId));
}
async function resetPinAttempts(operatorId) {
  const db = await getDb();
  if (!db) return;
  await db.update(operators).set({ failedPinAttempts: 0, lockedUntil: null }).where(eq2(operators.id, operatorId));
}
var IP_RATE_LIMIT_MAX_ATTEMPTS = 15;
var IP_RATE_LIMIT_LOCKOUT_MS = 15 * 60 * 1e3;
async function checkIpRateLimit(key) {
  const db = await getDb();
  if (!db) return true;
  const [row] = await db.select().from(rateLimits).where(eq2(rateLimits.key, key)).limit(1);
  if (!row?.lockedUntil) return true;
  return new Date(row.lockedUntil).getTime() <= Date.now();
}
async function recordIpFailedAttempt(key) {
  const db = await getDb();
  if (!db) return;
  const [row] = await db.select().from(rateLimits).where(eq2(rateLimits.key, key)).limit(1);
  const attempts = (row?.attempts ?? 0) + 1;
  const lockedUntil = attempts >= IP_RATE_LIMIT_MAX_ATTEMPTS ? new Date(Date.now() + IP_RATE_LIMIT_LOCKOUT_MS) : row?.lockedUntil ?? null;
  await db.insert(rateLimits).values({ key, attempts, lockedUntil }).onDuplicateKeyUpdate({ set: { attempts, lockedUntil } });
}
async function createDeviceEnrollment(name, enrollCode, enrollCodeExpiresAt) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [result] = await db.insert(devices).values({ name, enrollCode, enrollCodeExpiresAt });
  return result.insertId;
}
async function getDeviceByEnrollCode(code) {
  const db = await getDb();
  if (!db) return void 0;
  const [device] = await db.select().from(devices).where(eq2(devices.enrollCode, code)).limit(1);
  return device;
}
async function completeDeviceEnrollment(deviceId, deviceTokenHash) {
  const db = await getDb();
  if (!db) return;
  await db.update(devices).set({ enrolled: 1, deviceTokenHash, enrollCode: null, enrollCodeExpiresAt: null, lastSeenAt: /* @__PURE__ */ new Date() }).where(eq2(devices.id, deviceId));
}
async function getDeviceById(id) {
  const db = await getDb();
  if (!db) return void 0;
  const [device] = await db.select().from(devices).where(eq2(devices.id, id)).limit(1);
  return device;
}
async function listAllDevices() {
  const db = await getDb();
  if (!db) return [];
  return db.select({ id: devices.id, name: devices.name, enrolled: devices.enrolled, active: devices.active, createdAt: devices.createdAt, lastSeenAt: devices.lastSeenAt }).from(devices).orderBy(desc(devices.createdAt));
}
async function updateDeviceActive(id, active) {
  const db = await getDb();
  if (!db) return;
  await db.update(devices).set({ active }).where(eq2(devices.id, id));
}
async function getActiveEventForCaja() {
  const db = await getDb();
  if (!db) return void 0;
  const rows = await db.select().from(events).where(or(eq2(events.status, "published"), eq2(events.status, "soldout")));
  if (rows.length === 0) return void 0;
  const now = Date.now();
  return rows.reduce(
    (best, r) => Math.abs(new Date(r.eventDate).getTime() - now) < Math.abs(new Date(best.eventDate).getTime() - now) ? r : best,
    rows[0]
  );
}
async function searchCajaCustomers(eventId, query) {
  const db = await getDb();
  if (!db) return [];
  const q = query.trim();
  if (!q) return [];
  const qUpper = q.toUpperCase();
  const [byCode] = await db.select().from(tickets).where(and(eq2(tickets.eventId, eventId), or(eq2(tickets.ticketCode, qUpper), eq2(tickets.displayCode, qUpper)))).limit(1);
  let orderIds;
  if (byCode) {
    orderIds = [byCode.orderId];
  } else {
    const pattern = `%${q}%`;
    const rows2 = await db.select({ id: orders.id }).from(orders).where(and(
      eq2(orders.eventId, eventId),
      eq2(orders.paymentStatus, "approved"),
      or(like(orders.buyerName, pattern), like(orders.buyerEmail, pattern), like(orders.buyerPhone, pattern))
    )).limit(20);
    orderIds = rows2.map((r) => r.id);
  }
  if (orderIds.length === 0) return [];
  const rows = await db.select().from(orders).where(inArray(orders.id, orderIds));
  return rows.map((o) => ({ orderId: o.id, orderNumber: o.orderNumber, buyerName: o.buyerName, buyerEmail: o.buyerEmail, buyerPhone: o.buyerPhone }));
}
async function getCajaCustomerSheet(orderId) {
  const db = await getDb();
  if (!db) return null;
  const [order] = await db.select().from(orders).where(eq2(orders.id, orderId)).limit(1);
  if (!order) return null;
  const orderTickets = await db.select().from(tickets).where(eq2(tickets.orderId, orderId));
  const ticketTypeIds = Array.from(new Set(orderTickets.map((t2) => t2.ticketTypeId)));
  const tts = ticketTypeIds.length ? await db.select().from(ticketTypes).where(inArray(ticketTypes.id, ticketTypeIds)) : [];
  const ttById = new Map(tts.map((t2) => [t2.id, t2]));
  const access = orderTickets.filter((t2) => ttById.get(t2.ticketTypeId)?.category === "acceso").map((t2) => ({ ticketCode: t2.ticketCode, status: t2.status, typeName: ttById.get(t2.ticketTypeId)?.name }));
  const extras = orderTickets.filter((t2) => ttById.get(t2.ticketTypeId)?.category === "extra").map((t2) => ({ displayCode: t2.displayCode, status: t2.status, typeName: ttById.get(t2.ticketTypeId)?.name, usedAt: t2.usedAt }));
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
    extras
  };
}
async function getCajaSnapshot(eventId) {
  const db = await getDb();
  if (!db) return null;
  const [event] = await db.select().from(events).where(eq2(events.id, eventId)).limit(1);
  if (!event) return null;
  const approvedOrders = await db.select().from(orders).where(and(eq2(orders.eventId, eventId), eq2(orders.paymentStatus, "approved")));
  const orderIds = approvedOrders.map((o) => o.id);
  const allTickets = orderIds.length ? await db.select().from(tickets).where(inArray(tickets.orderId, orderIds)) : [];
  const allTicketTypes = await db.select().from(ticketTypes).where(eq2(ticketTypes.eventId, eventId));
  const ttById = new Map(allTicketTypes.map((t2) => [t2.id, t2]));
  const ticketsByOrder = /* @__PURE__ */ new Map();
  for (const t2 of allTickets) {
    const list = ticketsByOrder.get(t2.orderId) ?? [];
    list.push(t2);
    ticketsByOrder.set(t2.orderId, list);
  }
  const attendees = approvedOrders.map((o) => {
    const ts = ticketsByOrder.get(o.id) ?? [];
    return {
      orderId: o.id,
      orderNumber: o.orderNumber,
      buyerName: o.buyerName,
      buyerEmail: o.buyerEmail,
      buyerPhone: o.buyerPhone,
      access: ts.filter((t2) => ttById.get(t2.ticketTypeId)?.category === "acceso").map((t2) => ({ ticketCode: t2.ticketCode, status: t2.status, typeName: ttById.get(t2.ticketTypeId)?.name })),
      extras: ts.filter((t2) => ttById.get(t2.ticketTypeId)?.category === "extra").map((t2) => ({ displayCode: t2.displayCode, status: t2.status, typeName: ttById.get(t2.ticketTypeId)?.name }))
    };
  });
  const catalog = allTicketTypes.filter((t2) => t2.category === "extra" && t2.status === "active").map((t2) => ({ id: t2.id, name: t2.name, price: Number(t2.price), color: t2.color, internalCode: t2.internalCode }));
  return {
    event: { id: event.id, title: event.title, slug: event.slug },
    attendees,
    catalog,
    serverTime: (/* @__PURE__ */ new Date()).toISOString()
  };
}
async function getCajaCatalog(eventId) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(ticketTypes).where(and(eq2(ticketTypes.eventId, eventId), eq2(ticketTypes.category, "extra"), eq2(ticketTypes.status, "active")));
}
async function getCajaDashboard(eventId) {
  const db = await getDb();
  if (!db) return null;
  const cajaOrders = await db.select().from(orders).where(and(eq2(orders.eventId, eventId), eq2(orders.channel, "caja"), eq2(orders.paymentStatus, "approved")));
  const totalSales = cajaOrders.reduce((s, o) => s + Number(o.total), 0);
  const [{ count: redeemedCount }] = await db.select({ count: sql`COUNT(*)` }).from(tickets).where(and(eq2(tickets.eventId, eventId), eq2(tickets.status, "used")));
  const items = await db.select({ ticketTypeId: orderItems.ticketTypeId, quantity: orderItems.quantity }).from(orderItems).innerJoin(orders, eq2(orders.id, orderItems.orderId)).where(and(eq2(orders.eventId, eventId), eq2(orders.channel, "caja"), eq2(orders.paymentStatus, "approved")));
  const qtyByType = /* @__PURE__ */ new Map();
  for (const i of items) qtyByType.set(i.ticketTypeId, (qtyByType.get(i.ticketTypeId) || 0) + i.quantity);
  const ttIds = Array.from(qtyByType.keys());
  const tts = ttIds.length ? await db.select().from(ticketTypes).where(inArray(ticketTypes.id, ttIds)) : [];
  const topProducts = tts.map((t2) => ({ name: t2.name, quantity: qtyByType.get(t2.id) || 0 })).sort((a, b) => b.quantity - a.quantity).slice(0, 5);
  const recentSales = [...cajaOrders].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 10).map((o) => ({ orderNumber: o.orderNumber, total: Number(o.total), createdAt: o.createdAt, paymentMethod: o.paymentMethod }));
  return {
    totalSales,
    salesCount: cajaOrders.length,
    redeemedCount: Number(redeemedCount),
    topProducts,
    recentSales
  };
}
async function getConflictQueue(eventId) {
  const db = await getDb();
  if (!db) return [];
  const conflicts = await db.select().from(ops).where(and(eq2(ops.eventId, eventId), eq2(ops.type, "redeem"), eq2(ops.result, "conflict")));
  if (conflicts.length === 0) return [];
  const resolutions = await db.select().from(ops).where(and(eq2(ops.eventId, eventId), eq2(ops.type, "manual_adjust")));
  const resolvedIds = new Set(resolutions.map((r) => r.payload?.resolvedConflictOpId).filter(Boolean));
  const pending = conflicts.filter((c) => !resolvedIds.has(c.id));
  if (pending.length === 0) return [];
  const operatorIds = Array.from(new Set(pending.map((c) => c.operatorId)));
  const opRows = await db.select().from(operators).where(inArray(operators.id, operatorIds));
  const opById = new Map(opRows.map((o) => [o.id, o]));
  return pending.map((c) => ({
    opId: c.id,
    displayCode: c.payload?.displayCode ?? c.targetId,
    operatorName: opById.get(c.operatorId)?.name ?? "Operador eliminado",
    registerId: c.registerId,
    serverAt: c.serverAt,
    conflictNote: c.conflictNote
  }));
}
async function resolveConflict(rawDb, params) {
  const { applyOp: applyOp2 } = await Promise.resolve().then(() => (init_ops(), ops_exports));
  return applyOp2(
    rawDb,
    {
      id: params.opId,
      type: "manual_adjust",
      eventId: params.eventId,
      operatorId: params.operatorId,
      targetType: "op",
      targetId: params.conflictOpId,
      payload: { resolvedConflictOpId: params.conflictOpId, note: params.note ?? null },
      clientAt: params.clientAt
    },
    async () => ({ result: "applied" })
  );
}
async function getProfitReport(eventId) {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.select({
    ticketTypeId: orderItems.ticketTypeId,
    quantity: orderItems.quantity,
    unitPrice: orderItems.unitPrice,
    unitCost: orderItems.unitCost
  }).from(orderItems).innerJoin(orders, eq2(orders.id, orderItems.orderId)).where(and(eq2(orders.eventId, eventId), eq2(orders.paymentStatus, "approved")));
  const allTicketTypes = await db.select().from(ticketTypes).where(eq2(ticketTypes.eventId, eventId));
  const ttById = new Map(allTicketTypes.map((t2) => [t2.id, t2]));
  const byType = /* @__PURE__ */ new Map();
  for (const r of rows) {
    const tt = ttById.get(r.ticketTypeId);
    const entry = byType.get(r.ticketTypeId) ?? { name: tt?.name ?? `#${r.ticketTypeId}`, unitsSold: 0, revenue: 0, cost: 0, hasCost: false };
    entry.unitsSold += r.quantity;
    entry.revenue += Number(r.unitPrice) * r.quantity;
    if (r.unitCost != null) {
      entry.cost += Number(r.unitCost) * r.quantity;
      entry.hasCost = true;
    }
    byType.set(r.ticketTypeId, entry);
  }
  return Array.from(byType.values()).map((e) => ({
    name: e.name,
    unitsSold: e.unitsSold,
    revenue: e.revenue,
    cost: e.hasCost ? e.cost : null,
    profit: e.hasCost ? e.revenue - e.cost : null,
    marginPercent: e.hasCost && e.revenue > 0 ? Math.round((e.revenue - e.cost) / e.revenue * 1e3) / 10 : null
  })).sort((a, b) => b.revenue - a.revenue);
}
async function getEventComparison() {
  const db = await getDb();
  if (!db) return [];
  const allEvents = await db.select().from(events).orderBy(desc(events.eventDate));
  const rows = await db.select({
    eventId: orders.eventId,
    quantity: orderItems.quantity,
    unitPrice: orderItems.unitPrice,
    unitCost: orderItems.unitCost
  }).from(orderItems).innerJoin(orders, eq2(orders.id, orderItems.orderId)).where(eq2(orders.paymentStatus, "approved"));
  const byEvent = /* @__PURE__ */ new Map();
  for (const r of rows) {
    const entry = byEvent.get(r.eventId) ?? { revenue: 0, cost: 0, hasCost: false, unitsSold: 0 };
    entry.revenue += Number(r.unitPrice) * r.quantity;
    entry.unitsSold += r.quantity;
    if (r.unitCost != null) {
      entry.cost += Number(r.unitCost) * r.quantity;
      entry.hasCost = true;
    }
    byEvent.set(r.eventId, entry);
  }
  return allEvents.map((e) => {
    const agg = byEvent.get(e.id);
    return {
      eventId: e.id,
      title: e.title,
      eventDate: e.eventDate,
      revenue: agg?.revenue ?? 0,
      unitsSold: agg?.unitsSold ?? 0,
      profit: agg?.hasCost ? agg.revenue - agg.cost : null
    };
  });
}
async function getPeakHours(eventId) {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.select({ serverAt: ops.serverAt }).from(ops).where(eq2(ops.eventId, eventId));
  const counts = new Array(24).fill(0);
  for (const r of rows) counts[new Date(r.serverAt).getHours()]++;
  return counts.map((count, hour) => ({ hour, count }));
}
async function getLedger(eventId, filters = {}) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [eq2(ops.eventId, eventId)];
  if (filters.operatorId) conditions.push(eq2(ops.operatorId, filters.operatorId));
  if (filters.type) conditions.push(eq2(ops.type, filters.type));
  if (filters.dateFrom) conditions.push(gte(ops.serverAt, new Date(filters.dateFrom)));
  if (filters.dateTo) conditions.push(lte(ops.serverAt, new Date(filters.dateTo)));
  const rows = await db.select().from(ops).where(and(...conditions)).orderBy(desc(ops.serverAt)).limit(500);
  const operatorIds = Array.from(new Set(rows.map((r) => r.operatorId)));
  const opRows = operatorIds.length ? await db.select().from(operators).where(inArray(operators.id, operatorIds)) : [];
  const opById = new Map(opRows.map((o) => [o.id, o]));
  return rows.map((r) => ({
    id: r.id,
    type: r.type,
    operatorName: opById.get(r.operatorId)?.name ?? "Operador eliminado",
    registerId: r.registerId,
    targetType: r.targetType,
    targetId: r.targetId,
    result: r.result,
    conflictNote: r.conflictNote,
    serverAt: r.serverAt
  }));
}
async function listActiveRegisters() {
  const db = await getDb();
  if (!db) return [];
  return db.select({ id: registers.id, name: registers.name }).from(registers).where(eq2(registers.active, 1));
}
async function listAllRegisters() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(registers).orderBy(registers.name);
}
async function createRegister(name) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [result] = await db.insert(registers).values({ name });
  return result.insertId;
}
async function getShiftSummary(eventId, operatorId, registerId) {
  const db = await getDb();
  if (!db) return null;
  const openConditions = [eq2(ops.eventId, eventId), eq2(ops.operatorId, operatorId), eq2(ops.type, "shift_open")];
  if (registerId) openConditions.push(eq2(ops.registerId, registerId));
  const opens = await db.select().from(ops).where(and(...openConditions)).orderBy(desc(ops.serverAt)).limit(1);
  const since = opens[0]?.serverAt ?? /* @__PURE__ */ new Date(0);
  const activityConditions = [eq2(ops.eventId, eventId), eq2(ops.operatorId, operatorId), gte(ops.serverAt, since)];
  if (registerId) activityConditions.push(eq2(ops.registerId, registerId));
  const activity = await db.select().from(ops).where(and(...activityConditions));
  const sales = activity.filter((o) => o.type === "sale" && o.result === "applied");
  const redeems = activity.filter((o) => o.type === "redeem" && o.result === "applied");
  const salesTotal = sales.reduce((s, o) => s + Number(o.payload?.total ?? 0), 0);
  return {
    since,
    salesCount: sales.length,
    salesTotal,
    redeemsCount: redeems.length
  };
}
async function upsertCustomerFromOrder(order, accesoSlugs) {
  const db = await getDb();
  if (!db) return;
  if (!order.buyerEmail) return;
  let rut = null;
  let instagram = null;
  try {
    const parsed = order.attendeeData ? JSON.parse(order.attendeeData) : null;
    const campos = parsed?.campos ?? {};
    if (typeof campos.rut === "string" && campos.rut.trim()) rut = campos.rut.trim();
    if (typeof campos.instagram === "string" && campos.instagram.trim()) instagram = campos.instagram.trim();
  } catch {
  }
  const email = order.buyerEmail.trim().toLowerCase();
  const [existing] = await db.select().from(customers).where(eq2(customers.email, email)).limit(1);
  const existingAccessTypes = Array.isArray(existing?.accessTypes) ? existing.accessTypes : [];
  const mergedAccessTypes = Array.from(/* @__PURE__ */ new Set([...existingAccessTypes, ...accesoSlugs]));
  if (existing) {
    await db.update(customers).set({
      fullName: order.buyerName || existing.fullName,
      phone: order.buyerPhone || existing.phone,
      rut: rut ?? existing.rut,
      instagram: instagram ?? existing.instagram,
      accessTypes: mergedAccessTypes,
      totalOrders: existing.totalOrders + 1,
      totalSpent: String(Number(existing.totalSpent) + Number(order.total)),
      lastSeenAt: /* @__PURE__ */ new Date()
    }).where(eq2(customers.id, existing.id));
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
      totalSpent: String(Number(order.total))
    });
  }
}
async function listCustomers(filters = {}) {
  const db = await getDb();
  if (!db) return [];
  let rows = await db.select().from(customers).orderBy(desc(customers.lastSeenAt));
  if (filters.search) {
    const needle = filters.search.toLowerCase();
    rows = rows.filter(
      (c) => c.email.toLowerCase().includes(needle) || c.fullName && c.fullName.toLowerCase().includes(needle) || c.phone && c.phone.includes(filters.search)
    );
  }
  if (filters.accessType) {
    rows = rows.filter((c) => Array.isArray(c.accessTypes) && c.accessTypes.includes(filters.accessType));
  }
  if (filters.tag) {
    rows = rows.filter((c) => Array.isArray(c.tags) && c.tags.includes(filters.tag));
  }
  return rows;
}
async function addCustomerTag(customerId, tag) {
  const db = await getDb();
  if (!db) return;
  const [customer] = await db.select().from(customers).where(eq2(customers.id, customerId)).limit(1);
  if (!customer) return;
  const tags = Array.isArray(customer.tags) ? customer.tags : [];
  const clean = tag.trim();
  if (!clean || tags.includes(clean)) return;
  await db.update(customers).set({ tags: [...tags, clean] }).where(eq2(customers.id, customerId));
}
async function removeCustomerTag(customerId, tag) {
  const db = await getDb();
  if (!db) return;
  const [customer] = await db.select().from(customers).where(eq2(customers.id, customerId)).limit(1);
  if (!customer) return;
  const tags = Array.isArray(customer.tags) ? customer.tags : [];
  await db.update(customers).set({ tags: tags.filter((t2) => t2 !== tag) }).where(eq2(customers.id, customerId));
}
async function updateCustomerNotes(customerId, notes) {
  const db = await getDb();
  if (!db) return;
  await db.update(customers).set({ notes }).where(eq2(customers.id, customerId));
}
async function importCustomers(rows) {
  const db = await getDb();
  if (!db) return { imported: 0, updated: 0 };
  let imported = 0;
  let updated = 0;
  for (const row of rows) {
    const email = row.email.trim().toLowerCase();
    if (!email) continue;
    const [existing] = await db.select().from(customers).where(eq2(customers.email, email)).limit(1);
    if (existing) {
      const existingAccessTypes = Array.isArray(existing.accessTypes) ? existing.accessTypes : [];
      const existingTags = Array.isArray(existing.tags) ? existing.tags : [];
      const importedOrders = row.totalOrders !== void 0 && !Number.isNaN(row.totalOrders) ? row.totalOrders : void 0;
      const importedSpent = row.totalSpent !== void 0 && !Number.isNaN(row.totalSpent) ? row.totalSpent : void 0;
      await db.update(customers).set({
        fullName: row.fullName || existing.fullName,
        phone: row.phone || existing.phone,
        rut: row.rut || existing.rut,
        instagram: row.instagram || existing.instagram,
        accessTypes: Array.from(/* @__PURE__ */ new Set([...existingAccessTypes, ...row.accessTypes ?? []])),
        tags: Array.from(/* @__PURE__ */ new Set([...existingTags, ...row.tags ?? []])),
        notes: row.notes || existing.notes,
        totalOrders: importedOrders !== void 0 ? Math.max(existing.totalOrders, importedOrders) : existing.totalOrders,
        totalSpent: importedSpent !== void 0 ? String(Math.max(Number(existing.totalSpent), importedSpent)) : existing.totalSpent
      }).where(eq2(customers.id, existing.id));
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
        totalSpent: row.totalSpent !== void 0 ? String(row.totalSpent) : "0"
      });
      imported++;
    }
  }
  return { imported, updated };
}

// server/_core/cookies.ts
function isSecureRequest(req) {
  if (req.protocol === "https") return true;
  const forwardedProto = req.headers["x-forwarded-proto"];
  if (!forwardedProto) return false;
  const protoList = Array.isArray(forwardedProto) ? forwardedProto : forwardedProto.split(",");
  return protoList.some((proto) => proto.trim().toLowerCase() === "https");
}
function getSessionCookieOptions(req) {
  return {
    httpOnly: true,
    path: "/",
    sameSite: "none",
    secure: isSecureRequest(req)
  };
}

// shared/_core/errors.ts
var HttpError = class extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
    this.name = "HttpError";
  }
};
var ForbiddenError = (msg) => new HttpError(403, msg);

// server/_core/sdk.ts
import axios from "axios";
import { parse as parseCookieHeader } from "cookie";
import { SignJWT, jwtVerify } from "jose";
var isNonEmptyString = (value) => typeof value === "string" && value.length > 0;
var EXCHANGE_TOKEN_PATH = `/webdev.v1.WebDevAuthPublicService/ExchangeToken`;
var GET_USER_INFO_PATH = `/webdev.v1.WebDevAuthPublicService/GetUserInfo`;
var GET_USER_INFO_WITH_JWT_PATH = `/webdev.v1.WebDevAuthPublicService/GetUserInfoWithJwt`;
var OAuthService = class {
  constructor(client) {
    this.client = client;
    console.log("[OAuth] Initialized with baseURL:", ENV.oAuthServerUrl);
    if (!ENV.oAuthServerUrl) {
      console.error(
        "[OAuth] ERROR: OAUTH_SERVER_URL is not configured! Set OAUTH_SERVER_URL environment variable."
      );
    }
  }
  decodeState(state) {
    return decodeOAuthState(state).redirectUri;
  }
  async getTokenByCode(code, state) {
    const payload = {
      clientId: ENV.appId,
      grantType: "authorization_code",
      code,
      redirectUri: this.decodeState(state)
    };
    const { data } = await this.client.post(
      EXCHANGE_TOKEN_PATH,
      payload
    );
    return data;
  }
  async getUserInfoByToken(token) {
    const { data } = await this.client.post(
      GET_USER_INFO_PATH,
      {
        accessToken: token.accessToken
      }
    );
    return data;
  }
};
var createOAuthHttpClient = () => axios.create({
  baseURL: ENV.oAuthServerUrl,
  timeout: AXIOS_TIMEOUT_MS
});
var SDKServer = class {
  client;
  oauthService;
  constructor(client = createOAuthHttpClient()) {
    this.client = client;
    this.oauthService = new OAuthService(this.client);
  }
  deriveLoginMethod(platforms, fallback) {
    if (fallback && fallback.length > 0) return fallback;
    if (!Array.isArray(platforms) || platforms.length === 0) return null;
    const set = new Set(
      platforms.filter((p) => typeof p === "string")
    );
    if (set.has("REGISTERED_PLATFORM_EMAIL")) return "email";
    if (set.has("REGISTERED_PLATFORM_GOOGLE")) return "google";
    if (set.has("REGISTERED_PLATFORM_APPLE")) return "apple";
    if (set.has("REGISTERED_PLATFORM_MICROSOFT") || set.has("REGISTERED_PLATFORM_AZURE"))
      return "microsoft";
    if (set.has("REGISTERED_PLATFORM_GITHUB")) return "github";
    const first = Array.from(set)[0];
    return first ? first.toLowerCase() : null;
  }
  /**
   * Exchange OAuth authorization code for access token
   * @example
   * const tokenResponse = await sdk.exchangeCodeForToken(code, state);
   */
  async exchangeCodeForToken(code, state) {
    return this.oauthService.getTokenByCode(code, state);
  }
  /**
   * Get user information using access token
   * @example
   * const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);
   */
  async getUserInfo(accessToken) {
    const data = await this.oauthService.getUserInfoByToken({
      accessToken
    });
    const loginMethod = this.deriveLoginMethod(
      data?.platforms,
      data?.platform ?? data.platform ?? null
    );
    return {
      ...data,
      platform: loginMethod,
      loginMethod
    };
  }
  parseCookies(cookieHeader) {
    if (!cookieHeader) {
      return /* @__PURE__ */ new Map();
    }
    const parsed = parseCookieHeader(cookieHeader);
    return new Map(Object.entries(parsed));
  }
  getSessionSecret() {
    const secret = ENV.cookieSecret;
    return new TextEncoder().encode(secret);
  }
  /**
   * Create a session token for a Manus user openId
   * @example
   * const sessionToken = await sdk.createSessionToken(userInfo.openId);
   */
  async createSessionToken(openId, options = {}) {
    return this.signSession(
      {
        openId,
        appId: ENV.appId,
        name: options.name || ""
      },
      options
    );
  }
  async signSession(payload, options = {}) {
    const issuedAt = Date.now();
    const expiresInMs = options.expiresInMs ?? ONE_YEAR_MS;
    const expirationSeconds = Math.floor((issuedAt + expiresInMs) / 1e3);
    const secretKey = this.getSessionSecret();
    return new SignJWT({
      openId: payload.openId,
      appId: payload.appId,
      name: payload.name
    }).setProtectedHeader({ alg: "HS256", typ: "JWT" }).setExpirationTime(expirationSeconds).sign(secretKey);
  }
  async verifySession(cookieValue) {
    if (!cookieValue) {
      console.warn("[Auth] Missing session cookie");
      return null;
    }
    try {
      const secretKey = this.getSessionSecret();
      const { payload } = await jwtVerify(cookieValue, secretKey, {
        algorithms: ["HS256"]
      });
      const { openId, appId, name } = payload;
      if (!isNonEmptyString(openId) || !isNonEmptyString(appId) || !isNonEmptyString(name)) {
        console.warn("[Auth] Session payload missing required fields");
        return null;
      }
      return {
        openId,
        appId,
        name
      };
    } catch (error) {
      console.warn("[Auth] Session verification failed", String(error));
      return null;
    }
  }
  async getUserInfoWithJwt(jwtToken) {
    const payload = {
      jwtToken,
      projectId: ENV.appId
    };
    const { data } = await this.client.post(
      GET_USER_INFO_WITH_JWT_PATH,
      payload
    );
    const loginMethod = this.deriveLoginMethod(
      data?.platforms,
      data?.platform ?? data.platform ?? null
    );
    return {
      ...data,
      platform: loginMethod,
      loginMethod
    };
  }
  async authenticateRequest(req) {
    const cookies = this.parseCookies(req.headers.cookie);
    let sessionToken = cookies.get(COOKIE_NAME);
    if (!sessionToken) {
      const authHeader = req.headers.authorization;
      if (typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
        sessionToken = authHeader.slice(7);
      }
    }
    const session = await this.verifySession(sessionToken);
    if (!session) {
      throw ForbiddenError("Invalid session cookie");
    }
    if (session.openId.startsWith(CRON_OPEN_ID_PREFIX)) {
      const userInfo = await this.getUserInfoWithJwt(sessionToken ?? "");
      const taskUid = userInfo.taskUid ?? null;
      if (!taskUid) {
        throw ForbiddenError("Cron session missing task_uid");
      }
      return buildCronUser(userInfo);
    }
    if (session.openId === ADMIN_LOCAL_OPEN_ID) {
      return buildAdminLocalUser();
    }
    const sessionUserId = session.openId;
    const signedInAt = /* @__PURE__ */ new Date();
    let user = await getUserByOpenId(sessionUserId);
    if (!user) {
      try {
        const userInfo = await this.getUserInfoWithJwt(sessionToken ?? "");
        await upsertUser({
          openId: userInfo.openId,
          name: userInfo.name || null,
          email: userInfo.email ?? null,
          loginMethod: userInfo.loginMethod ?? userInfo.platform ?? null,
          lastSignedIn: signedInAt
        });
        user = await getUserByOpenId(userInfo.openId);
      } catch (error) {
        console.error("[Auth] Failed to sync user from OAuth:", error);
        throw ForbiddenError("Failed to sync user info");
      }
    }
    if (!user) {
      throw ForbiddenError("User not found");
    }
    await upsertUser({
      openId: user.openId,
      lastSignedIn: signedInAt
    });
    return user;
  }
};
var CRON_OPEN_ID_PREFIX = "cron_";
var ADMIN_LOCAL_OPEN_ID = "admin-local";
function buildAdminLocalUser() {
  const now = /* @__PURE__ */ new Date();
  return {
    id: -1,
    openId: ADMIN_LOCAL_OPEN_ID,
    name: "Admin",
    email: null,
    loginMethod: "password",
    role: "admin",
    ambassadorCode: null,
    referredBy: null,
    totalReferrals: 0,
    createdAt: now,
    updatedAt: now,
    lastSignedIn: now
  };
}
function buildCronUser(userInfo) {
  const now = /* @__PURE__ */ new Date();
  return {
    id: -1,
    openId: userInfo.openId,
    name: userInfo.name || "Manus Scheduled Task",
    email: null,
    loginMethod: null,
    role: "user",
    createdAt: now,
    updatedAt: now,
    lastSignedIn: now,
    taskUid: userInfo.taskUid ?? void 0,
    isCron: true
  };
}
var sdk = new SDKServer();

// server/_core/oauth.ts
function getQueryParam(req, key) {
  const value = req.query[key];
  return typeof value === "string" ? value : void 0;
}
function registerOAuthRoutes(app) {
  app.get("/api/oauth/callback", async (req, res) => {
    const code = getQueryParam(req, "code");
    const state = getQueryParam(req, "state");
    if (!code || !state) {
      res.status(400).json({ error: "code and state are required" });
      return;
    }
    const { nonce } = decodeOAuthState(state);
    const expectedNonce = parseCookieHeader2(req.headers.cookie ?? "")[OAUTH_STATE_COOKIE];
    if (!nonce || nonce !== expectedNonce) {
      res.status(403).json({ error: "invalid oauth state" });
      return;
    }
    res.clearCookie(OAUTH_STATE_COOKIE, { path: "/", secure: true, sameSite: "none" });
    try {
      const tokenResponse = await sdk.exchangeCodeForToken(code, state);
      const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);
      if (!userInfo.openId) {
        res.status(400).json({ error: "openId missing from user info" });
        return;
      }
      await upsertUser({
        openId: userInfo.openId,
        name: userInfo.name || null,
        email: userInfo.email ?? null,
        loginMethod: userInfo.loginMethod ?? userInfo.platform ?? null,
        lastSignedIn: /* @__PURE__ */ new Date()
      });
      const sessionToken = await sdk.createSessionToken(userInfo.openId, {
        name: userInfo.name || "",
        expiresInMs: ONE_YEAR_MS
      });
      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });
      res.redirect(302, "/");
    } catch (error) {
      console.error("[OAuth] Callback failed", error);
      res.status(500).json({ error: "OAuth callback failed" });
    }
  });
}

// server/adminRoutes.ts
async function requireAdmin(req, res) {
  try {
    const user = await sdk.authenticateRequest(req);
    if (user.role !== "admin") {
      res.status(403).json({ error: "Admin access required" });
      return false;
    }
    return true;
  } catch {
    res.status(401).json({ error: "Unauthorized" });
    return false;
  }
}
function csvEscape(value) {
  const s = value === null || value === void 0 ? "" : String(value);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}
function toCsv(rows, columns) {
  const header = columns.map((c) => csvEscape(c.label)).join(",");
  const lines = rows.map((row) => columns.map((c) => csvEscape(row[c.key])).join(","));
  return [header, ...lines].join("\r\n");
}
function parseCsv(text2) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text2.length; i++) {
    const c = text2[i];
    if (inQuotes) {
      if (c === '"') {
        if (text2[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\r") {
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += c;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((f) => f.trim() !== ""));
}
function registerAdminRoutes(app) {
  app.get("/api/admin/orders/export.csv", async (req, res) => {
    if (!await requireAdmin(req, res)) return;
    const { eventId, dateFrom, dateTo, status, channel } = req.query;
    const rows = await getOrdersForExport({
      eventId: eventId ? Number(eventId) : void 0,
      dateFrom,
      dateTo,
      status,
      channel: channel === "web" || channel === "caja" ? channel : void 0
    });
    const csv = toCsv(
      rows.map((r) => ({
        ...r,
        createdAt: r.createdAt ? new Date(r.createdAt).toLocaleString("es-CL") : ""
      })),
      [
        { key: "orderNumber", label: "N\xB0 Orden" },
        { key: "createdAt", label: "Fecha" },
        { key: "eventTitle", label: "Evento" },
        { key: "buyerName", label: "Comprador" },
        { key: "buyerEmail", label: "Email" },
        { key: "buyerPhone", label: "WhatsApp" },
        { key: "subtotal", label: "Subtotal" },
        { key: "discount", label: "Descuento" },
        { key: "total", label: "Total" },
        { key: "paymentStatus", label: "Estado de pago" },
        { key: "paymentMethod", label: "M\xE9todo de pago" },
        { key: "ambassadorCode", label: "C\xF3digo embajador" }
      ]
    );
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="ordenes-${(/* @__PURE__ */ new Date()).toISOString().slice(0, 10)}.csv"`);
    res.send("\uFEFF" + csv);
  });
  app.get("/api/admin/customers/export.csv", async (req, res) => {
    if (!await requireAdmin(req, res)) return;
    const { search, accessType, tag } = req.query;
    const rows = await listCustomers({ search, accessType, tag });
    const csv = toCsv(
      rows.map((c) => ({
        ...c,
        accessTypes: Array.isArray(c.accessTypes) ? c.accessTypes.join(";") : "",
        tags: Array.isArray(c.tags) ? c.tags.join(";") : "",
        firstSeenAt: c.firstSeenAt ? new Date(c.firstSeenAt).toLocaleString("es-CL") : "",
        lastSeenAt: c.lastSeenAt ? new Date(c.lastSeenAt).toLocaleString("es-CL") : ""
      })),
      [
        { key: "email", label: "Email" },
        { key: "fullName", label: "Nombre" },
        { key: "phone", label: "Tel\xE9fono" },
        { key: "rut", label: "RUT" },
        { key: "instagram", label: "Instagram" },
        { key: "accessTypes", label: "Tipos de acceso" },
        { key: "tags", label: "Etiquetas" },
        { key: "totalOrders", label: "Compras" },
        { key: "totalSpent", label: "Total gastado" },
        { key: "notes", label: "Notas" },
        { key: "firstSeenAt", label: "Primera compra" },
        { key: "lastSeenAt", label: "\xDAltima compra" }
      ]
    );
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="clientes-${(/* @__PURE__ */ new Date()).toISOString().slice(0, 10)}.csv"`);
    res.send("\uFEFF" + csv);
  });
  app.post("/api/admin/customers/import.csv", async (req, res) => {
    if (!await requireAdmin(req, res)) return;
    const csvText = typeof req.body?.csv === "string" ? req.body.csv : "";
    if (!csvText.trim()) {
      res.status(400).json({ error: "CSV vac\xEDo" });
      return;
    }
    const parsedRows = parseCsv(csvText);
    if (parsedRows.length < 2) {
      res.status(400).json({ error: "El CSV no tiene filas de datos" });
      return;
    }
    const header = parsedRows[0].map((h) => h.trim().toLowerCase());
    const col = (...names) => names.map((n) => header.indexOf(n)).find((idx) => idx !== -1) ?? -1;
    const idxEmail = col("email");
    if (idxEmail === -1) {
      res.status(400).json({ error: 'Falta la columna "Email"' });
      return;
    }
    const idxFirstName = col("first name");
    const idxLastName = col("last name");
    const isShopifyExport = idxFirstName !== -1 || idxLastName !== -1 || col("customer id") !== -1;
    const idxName = isShopifyExport ? -1 : col("nombre", "fullname");
    const idxPhone = col("tel\xE9fono", "telefono", "phone");
    const idxDefaultPhone = col("default address phone");
    const idxRut = col("rut");
    const idxInstagram = col("instagram");
    const idxAccessTypes = col("tipos de acceso", "accesstypes");
    const idxTags = isShopifyExport ? -1 : col("etiquetas", "tags");
    const idxNotes = col("notas", "notes");
    const idxTotalOrders = col("total orders");
    const idxTotalSpent = col("total spent");
    const splitList = (value) => value ? value.split(";").map((s) => s.trim()).filter(Boolean) : void 0;
    const rows = parsedRows.slice(1).map((r) => {
      const fullName = isShopifyExport ? [idxFirstName !== -1 ? r[idxFirstName]?.trim() : "", idxLastName !== -1 ? r[idxLastName]?.trim() : ""].filter(Boolean).join(" ") || void 0 : idxName !== -1 ? r[idxName]?.trim() || void 0 : void 0;
      const phone = idxPhone !== -1 && r[idxPhone]?.trim() || idxDefaultPhone !== -1 && r[idxDefaultPhone]?.trim() || void 0;
      const totalOrders = idxTotalOrders !== -1 ? Number(r[idxTotalOrders]) : void 0;
      const totalSpent = idxTotalSpent !== -1 ? Number(r[idxTotalSpent]) : void 0;
      return {
        email: r[idxEmail]?.trim() ?? "",
        fullName,
        phone,
        rut: idxRut !== -1 ? r[idxRut]?.trim() || void 0 : void 0,
        instagram: idxInstagram !== -1 ? r[idxInstagram]?.trim() || void 0 : void 0,
        accessTypes: idxAccessTypes !== -1 ? splitList(r[idxAccessTypes]) : void 0,
        tags: idxTags !== -1 ? splitList(r[idxTags]) : void 0,
        notes: idxNotes !== -1 ? r[idxNotes]?.trim() || void 0 : void 0,
        totalOrders: Number.isFinite(totalOrders) ? totalOrders : void 0,
        totalSpent: Number.isFinite(totalSpent) ? totalSpent : void 0
      };
    }).filter((r) => r.email);
    const result = await importCustomers(rows);
    res.json(result);
  });
}

// server/calendar.ts
function toIcsDate(date) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}
function icsEscape(text2) {
  return text2.replace(/\\/g, "\\\\").replace(/,/g, "\\,").replace(/;/g, "\\;").replace(/\n/g, "\\n");
}
function registerTicketAssetRoutes(app) {
  app.get("/api/qr/:ticketCode.png", async (req, res) => {
    const { ticketCode } = req.params;
    const ticket = await getTicketByCode(ticketCode);
    if (!ticket?.qrImageUrl?.startsWith("data:image/png;base64,")) {
      res.status(404).send("QR not found");
      return;
    }
    const base64 = ticket.qrImageUrl.slice("data:image/png;base64,".length);
    const buffer = Buffer.from(base64, "base64");
    res.setHeader("Content-Type", "image/png");
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    res.send(buffer);
  });
  app.get("/api/calendar/:ticketCode.ics", async (req, res) => {
    const { ticketCode } = req.params;
    const ticket = await getTicketByCode(ticketCode);
    if (!ticket || !ticket.eventDate) {
      res.status(404).send("Ticket not found");
      return;
    }
    const start = ticket.doorsOpen ? new Date(ticket.doorsOpen) : new Date(ticket.eventDate);
    const end = ticket.eventEnd ? new Date(ticket.eventEnd) : new Date(start.getTime() + 7 * 60 * 60 * 1e3);
    const location = [ticket.venue, ticket.address].filter(Boolean).join(", ");
    const ics = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Mansion Playroom//Candyland//ES",
      "CALSCALE:GREGORIAN",
      "BEGIN:VEVENT",
      `UID:${ticket.ticketCode}@mansionplayroom.cl`,
      `DTSTAMP:${toIcsDate(/* @__PURE__ */ new Date())}`,
      `DTSTART:${toIcsDate(start)}`,
      `DTEND:${toIcsDate(end)}`,
      `SUMMARY:${icsEscape(ticket.eventTitle)}`,
      `LOCATION:${icsEscape(location)}`,
      `DESCRIPTION:${icsEscape(`Tu acceso: ${ticket.ticketTypeName}. C\xF3digo: ${ticket.ticketCode}`)}`,
      "END:VEVENT",
      "END:VCALENDAR"
    ].join("\r\n");
    res.setHeader("Content-Type", "text/calendar; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${ticket.eventTitle.replace(/[^a-z0-9]/gi, "-")}.ics"`);
    res.send(ics);
  });
}

// server/_core/systemRouter.ts
import { z } from "zod";

// server/_core/notification.ts
import { TRPCError } from "@trpc/server";
var TITLE_MAX_LENGTH = 1200;
var CONTENT_MAX_LENGTH = 2e4;
var trimValue = (value) => value.trim();
var isNonEmptyString2 = (value) => typeof value === "string" && value.trim().length > 0;
var buildEndpointUrl = (baseUrl) => {
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return new URL(
    "webdevtoken.v1.WebDevService/SendNotification",
    normalizedBase
  ).toString();
};
var validatePayload = (input) => {
  if (!isNonEmptyString2(input.title)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Notification title is required."
    });
  }
  if (!isNonEmptyString2(input.content)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Notification content is required."
    });
  }
  const title = trimValue(input.title);
  const content = trimValue(input.content);
  if (title.length > TITLE_MAX_LENGTH) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Notification title must be at most ${TITLE_MAX_LENGTH} characters.`
    });
  }
  if (content.length > CONTENT_MAX_LENGTH) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Notification content must be at most ${CONTENT_MAX_LENGTH} characters.`
    });
  }
  return { title, content };
};
async function notifyOwner(payload) {
  const { title, content } = validatePayload(payload);
  if (!ENV.forgeApiUrl) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Notification service URL is not configured."
    });
  }
  if (!ENV.forgeApiKey) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Notification service API key is not configured."
    });
  }
  const endpoint = buildEndpointUrl(ENV.forgeApiUrl);
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${ENV.forgeApiKey}`,
        "content-type": "application/json",
        "connect-protocol-version": "1"
      },
      body: JSON.stringify({ title, content })
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.warn(
        `[Notification] Failed to notify owner (${response.status} ${response.statusText})${detail ? `: ${detail}` : ""}`
      );
      return false;
    }
    return true;
  } catch (error) {
    console.warn("[Notification] Error calling notification service:", error);
    return false;
  }
}

// server/_core/trpc.ts
import { initTRPC, TRPCError as TRPCError2 } from "@trpc/server";
import superjson from "superjson";
var t = initTRPC.context().create({
  transformer: superjson
});
var router = t.router;
var publicProcedure = t.procedure;
var requireUser = t.middleware(async (opts) => {
  const { ctx, next } = opts;
  if (!ctx.user) {
    throw new TRPCError2({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }
  return next({
    ctx: {
      ...ctx,
      user: ctx.user
    }
  });
});
var protectedProcedure = t.procedure.use(requireUser);
var adminProcedure = t.procedure.use(
  t.middleware(async (opts) => {
    const { ctx, next } = opts;
    if (!ctx.user || ctx.user.role !== "admin") {
      throw new TRPCError2({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }
    return next({
      ctx: {
        ...ctx,
        user: ctx.user
      }
    });
  })
);
var deviceProcedure = t.procedure.use(
  t.middleware(async (opts) => {
    const { ctx, next } = opts;
    if (!ctx.device) {
      throw new TRPCError2({ code: "FORBIDDEN", message: "Este dispositivo no est\xE1 enrolado" });
    }
    return next({
      ctx: {
        ...ctx,
        device: ctx.device
      }
    });
  })
);
var operatorProcedure = deviceProcedure.use(
  t.middleware(async (opts) => {
    const { ctx, next } = opts;
    if (!ctx.operator) {
      throw new TRPCError2({ code: "UNAUTHORIZED", message: "Sesi\xF3n de caja requerida" });
    }
    return next({
      ctx: {
        ...ctx,
        operator: ctx.operator
      }
    });
  })
);
var supervisorProcedure = operatorProcedure.use(
  t.middleware(async (opts) => {
    const { ctx, next } = opts;
    if (!ctx.operator || ctx.operator.role !== "supervisor" && ctx.operator.role !== "admin") {
      throw new TRPCError2({ code: "FORBIDDEN", message: "Se requiere rol de supervisor" });
    }
    return next({
      ctx: {
        ...ctx,
        operator: ctx.operator
      }
    });
  })
);

// server/_core/systemRouter.ts
var systemRouter = router({
  health: publicProcedure.input(
    z.object({
      timestamp: z.number().min(0, "timestamp cannot be negative")
    })
  ).query(() => ({
    ok: true
  })),
  notifyOwner: adminProcedure.input(
    z.object({
      title: z.string().min(1, "title is required"),
      content: z.string().min(1, "content is required")
    })
  ).mutation(async ({ input }) => {
    const delivered = await notifyOwner(input);
    return {
      success: delivered
    };
  })
});

// server/routers.ts
import { z as z2 } from "zod";
import { TRPCError as TRPCError3 } from "@trpc/server";

// server/webhooks.ts
import { Router } from "express";

// server/mercadopago.ts
import { MercadoPagoConfig, Preference, Payment } from "mercadopago";
var mpClient = null;
function getClient() {
  if (!mpClient) {
    const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN;
    if (!accessToken) {
      console.warn("[MercadoPago] No access token configured");
      return null;
    }
    mpClient = new MercadoPagoConfig({ accessToken });
  }
  return mpClient;
}
async function createTopupPreference(input) {
  const client = getClient();
  if (!client) {
    console.warn("[MercadoPago] Using mock topup URL (no access token)");
    return { id: "mock-preference-topup-" + input.orderNumber, initPoint: `/pago/exito?order=${input.orderNumber}&mock=true` };
  }
  const preference = new Preference(client);
  const baseUrl = process.env.APP_URL || "https://mansionplayroom.cl";
  const result = await preference.create({
    body: {
      items: [{
        id: input.orderNumber,
        title: `Diferencia Misi\xF3n 300 - ${input.eventTitle}`,
        quantity: 1,
        unit_price: input.amount,
        currency_id: "CLP"
      }],
      payer: { email: input.buyerEmail, name: input.buyerName },
      back_urls: {
        success: `${baseUrl}/pago/exito?order=${input.orderNumber}`,
        failure: `${baseUrl}/pago/error?order=${input.orderNumber}`,
        pending: `${baseUrl}/pago/exito?order=${input.orderNumber}&pending=true`
      },
      auto_return: "approved",
      external_reference: input.orderNumber,
      notification_url: `${baseUrl}/api/webhooks/mercadopago`,
      statement_descriptor: "MANSION PLAYROOM"
    }
  });
  return { id: result.id, initPoint: result.init_point };
}
async function createCardPayment(input) {
  const client = getClient();
  if (!client) {
    console.warn("[MercadoPago] No hay access token \u2014 no se puede cobrar");
    return { status: "rejected", statusDetail: "no_access_token", paymentId: "mock-" + input.orderNumber, paymentMethodId: input.paymentMethodId };
  }
  const baseUrl = process.env.APP_URL || "https://mansionplayroom.cl";
  const payment = new Payment(client);
  const result = await payment.create({
    body: {
      transaction_amount: input.amount,
      token: input.token,
      description: input.description,
      installments: input.installments ?? 1,
      payment_method_id: input.paymentMethodId,
      issuer_id: input.issuerId ? Number(input.issuerId) : void 0,
      external_reference: input.orderNumber,
      notification_url: `${baseUrl}/api/webhooks/mercadopago`,
      statement_descriptor: "MANSION PLAYROOM",
      payer: {
        email: input.payerEmail,
        identification: input.identificationType && input.identificationNumber ? { type: input.identificationType, number: input.identificationNumber } : void 0
      }
    },
    requestOptions: { idempotencyKey: `${input.orderNumber}-${Date.now()}` }
  });
  return {
    status: result.status ?? "pending",
    statusDetail: result.status_detail ?? void 0,
    paymentId: String(result.id ?? ""),
    paymentMethodId: result.payment_method_id ?? input.paymentMethodId
  };
}
async function getPaymentInfo(paymentId) {
  const client = getClient();
  if (!client) return null;
  const payment = new Payment(client);
  const result = await payment.get({ id: paymentId });
  return result;
}

// server/webhooks.ts
init_schema();
import { eq as eq3, and as and2, sql as sql2, isNotNull, ne, inArray as inArray2 } from "drizzle-orm";
import { nanoid as nanoid2 } from "nanoid";

// server/qr.ts
import QRCode from "qrcode";
async function generateTicketQR(ticketCode, eventTitle) {
  const baseUrl = process.env.APP_URL || "https://mansionplayroom.cl";
  const qrData = `${baseUrl}/verificar/${ticketCode}`;
  const qrImageUrl = await QRCode.toDataURL(qrData, {
    type: "image/png",
    width: 400,
    margin: 2,
    color: {
      dark: "#000000",
      light: "#FFFFFF"
    },
    errorCorrectionLevel: "H"
  });
  return { qrData, qrImageUrl };
}

// shared/ambassadorTiers.ts
var AMBASSADOR_TIERS = [
  { name: "Bronce", min: 3, emoji: "\u{1F949}", reward: "1 consumo" },
  { name: "Plata", min: 5, emoji: "\u{1F948}", reward: "2 consumos + acceso al pr\xF3ximo evento" },
  { name: "Oro", min: 10, emoji: "\u{1F947}", reward: "Mesa VIP + 2 botellas de espumante (o 1 de pisco) + acceso al pr\xF3ximo evento" }
];
function tierForCount(count) {
  return AMBASSADOR_TIERS.filter((t2) => count >= t2.min).pop();
}
function nextTierForCount(count) {
  return AMBASSADOR_TIERS.find((t2) => count < t2.min);
}

// server/email.ts
var DEFAULT_FROM = "Candyland <onboarding@resend.dev>";
async function sendEmail(input) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL || DEFAULT_FROM;
  if (!apiKey) {
    console.warn("[Email] RESEND_API_KEY no configurada, no se env\xEDa el correo");
    return { success: false, reason: "No API configured" };
  }
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        from,
        to: input.to,
        subject: input.subject,
        html: input.html
      })
    });
    if (!response.ok) {
      console.error("[Email] Resend error:", await response.text());
      return { success: false, reason: "API error" };
    }
    return { success: true };
  } catch (error) {
    console.error("[Email] Error:", error);
    return { success: false, reason: "Network error" };
  }
}
var EMAIL_BASE_URL = process.env.APP_URL && process.env.APP_URL !== "https://mansionplayroom.cl" ? process.env.APP_URL : "https://candylandwebsite.vercel.app";
var ACCENT = {
  pink: { bg: "#FCEEF4", text: "#D9538F", solid: "#EC5FA3" },
  blue: { bg: "#EAF6FA", text: "#3AA0BE", solid: "#5FC2DE" },
  yellow: { bg: "#FEF8E4", text: "#C89A2E", solid: "#F0C24B" },
  lilac: { bg: "#F3EDFB", text: "#8B6FC9", solid: "#A98CE0" }
};
var INK = "#3D2A35";
var MUTED = "#7A6670";
var FAINT = "#9A8A92";
var BORDER = "#F2D9E4";
function card(inner, opts) {
  return `<div style="background:${opts?.bg ?? "#FFFFFF"};border-radius:20px;padding:${opts?.padding ?? "24px"};${opts?.border === false ? "" : `border:1px solid ${BORDER};`}margin-bottom:20px;">${inner}</div>`;
}
function sectionTitle(emoji, text2) {
  return `<h3 style="color:${INK};font-size:19px;font-weight:800;margin:0 0 14px;">${emoji} ${text2}</h3>`;
}
function grid(cells, cols) {
  const rows = [];
  for (let i = 0; i < cells.length; i += cols) rows.push(cells.slice(i, i + cols));
  const width = Math.floor(100 / cols);
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:separate;border-spacing:8px 8px;margin:0 -8px 8px;">
    ${rows.map((row) => `<tr>${row.map((c) => `<td width="${width}%" valign="top" style="padding:0;">${c}</td>`).join("")}${row.length < cols ? `<td width="${(cols - row.length) * width}%"></td>` : ""}</tr>`).join("")}
  </table>`;
}
var CONTENT = {
  valores: ["\u2764\uFE0F Respeto", "\u{1F91D} Consentimiento", "\u{1F54A}\uFE0F Libertad"],
  edadMinima: 18,
  quienesSomos: [
    { emoji: "\u2728", label: "Conocer gente" },
    { emoji: "\u{1F3B6}", label: "Bailar" },
    { emoji: "\u{1F378}", label: "Disfrutar del ambiente" },
    { emoji: "\u{1F4AC}", label: "Conectar" },
    { emoji: "\u{1F6DD}", label: "Explorar si as\xED lo deseas" }
  ],
  encontraras: [
    { emoji: "\u{1F697}", label: "Estacionamiento privado" },
    { emoji: "\u{1F9E5}", label: "Guardarrop\xEDa" },
    { emoji: "\u{1F378}", label: "Terraza Bar Lounge" },
    { emoji: "\u{1F354}", label: "PlayBites para recargar energ\xEDa" },
    { emoji: "\u{1F3A7}", label: "Dos pistas de baile (Tech + Reggaet\xF3n)" },
    { emoji: "\u{1F6DD}", label: "Playground XXL" },
    { emoji: "\u26D3\uFE0F", label: "Kink Room" },
    { emoji: "\u{1F6AC}", label: "Zona de fumadores" }
  ],
  antesDeVenir: [
    { emoji: "\u{1FAAA}", titulo: "Documento", texto: "Carnet o pasaporte vigente. Evento exclusivo para mayores de 18 a\xF1os." },
    { emoji: "\u{1F457}", titulo: "Dress Code", texto: "Candy Sensual: brillos, colores pastel, rosa, accesorios, lencer\xEDa, vinilo o lo que te haga sentir incre\xEDble. Deja la ropa deportiva para otro d\xEDa. \u{1F36D}\u2728" },
    { emoji: "\u{1F697}", titulo: "Estacionamiento", texto: "Contamos con estacionamiento privado dentro del recinto." },
    { emoji: "\u{1F695}", titulo: "C\xF3mo llegar", texto: "En tu veh\xEDculo, o f\xE1cil en Uber, Didi o taxi." }
  ],
  faq: [
    { q: "\xBFPuedo llegar m\xE1s tarde?", a: "S\xED." },
    { q: "\xBFPuedo ir solo/a?", a: "Claro. Muchas personas vienen solas y nuestro ambiente est\xE1 pensado para conocer gente." },
    { q: "\xBFPuedo salir y volver a entrar?", a: "No. Una vez validado el ingreso, las salidas son definitivas." },
    { q: "\xBFTengo que entrar al Playground o al Kink Room?", a: "No. Todos los espacios son completamente opcionales." }
  ]
};
function attendeeNamesList(names) {
  if (names.length === 0) return "";
  return names.map((n) => `<p style="color:${INK};font-size:15px;font-weight:600;margin:2px 0;">\u{1F464} ${n}</p>`).join("");
}
function buildOrderEmail(data) {
  const ticketNames = data.items.map((i) => i.name).join(", ");
  const logoUrl = `${EMAIL_BASE_URL}/candyland/logo-wordmark-email.png`;
  const ticketUrl = data.ticketCode ? `${EMAIL_BASE_URL}/verificar/${data.ticketCode}` : "";
  const calendarUrl = data.ticketCode ? `${EMAIL_BASE_URL}/api/calendar/${data.ticketCode}.ics` : "";
  const qrUrl = data.ticketCode ? `${EMAIL_BASE_URL}/api/qr/${data.ticketCode}.png` : data.qrImageUrl;
  const whatsappShareUrl = `https://wa.me/?text=${encodeURIComponent(`Usa mi c\xF3digo ${data.ambassadorCode} para comprar tu entrada a Candyland en Mansion Playroom \u{1F36D} ${EMAIL_BASE_URL}`)}`;
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <!-- Le dice a los clientes de correo compatibles (Apple Mail, Outlook) que
       este email est\xE1 dise\xF1ado para verse en claro y que NO lo reprocesen en
       modo oscuro autom\xE1tico \u2014 sin esto, algunos clientes invierten fondos
       pero no ajustan bien el texto, dejando texto oscuro sobre fondo oscuro. -->
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
</head>
<body style="margin:0;padding:0;background-color:#FFFFFF;font-family:'Helvetica Neue',Arial,sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:0 0 40px;background-color:#FFFFFF;">

    <!-- HERO -->
    <div style="background:linear-gradient(160deg,${ACCENT.pink.bg},${ACCENT.lilac.bg});padding:40px 24px;text-align:center;border-radius:0 0 32px 32px;">
      <img src="${logoUrl}" alt="Mansion Playroom" style="height:64px;width:auto;margin-bottom:24px;" />
      <p style="font-size:52px;margin:0 0 12px;">\u{1F36D}</p>
      <h1 style="color:${INK};font-size:26px;font-weight:800;margin:0 0 8px;">\xA1Tu compra fue confirmada!</h1>
      <p style="color:${MUTED};font-size:15px;margin:0 0 24px;">La cuenta regresiva para Candyland ya comenz\xF3.</p>
      <a href="${EMAIL_BASE_URL}" style="display:inline-block;background:${ACCENT.pink.solid};color:#fff;text-decoration:none;padding:14px 32px;border-radius:999px;font-weight:800;font-size:14px;letter-spacing:0.3px;box-shadow:0 8px 20px rgba(236,95,163,0.35);">Ver Candyland</a>
    </div>

    <div style="padding:32px 24px 0;">

      <!-- SALUDO -->
      <h2 style="color:${INK};font-size:22px;font-weight:800;margin:0 0 6px;">\u{1F44B} Hola ${data.buyerName}</h2>
      <p style="color:${MUTED};font-size:15px;margin:0 0 28px;">
        Tu <strong style="color:${INK};">${ticketNames}</strong> ya est\xE1 reservado para Candyland en Mansion Playroom. \u{1F389}
        Prep\xE1rate para vivir una noche llena de m\xFAsica, conexi\xF3n y una experiencia completamente distinta.
      </p>

      <!-- TU EVENTO -->
      ${sectionTitle("\u{1F4C5}", "Tu evento")}
      ${card(`
        <h3 style="color:${ACCENT.pink.text};font-size:20px;font-weight:800;margin:0 0 14px;">${data.eventTitle}</h3>
        <p style="color:${INK};font-size:15px;margin:6px 0;">\u{1F4C5} ${data.eventDate}</p>
        ${data.doorsOpenText ? `<p style="color:${INK};font-size:15px;margin:6px 0;">\u{1F558} ${data.doorsOpenText} hrs</p>` : ""}
        <p style="color:${INK};font-size:15px;margin:6px 0;">\u{1F4CD} ${data.venue}${data.address ? ` \u2014 ${data.address}` : ""}</p>
        ${data.ticketReady && data.mapsUrl ? `<a href="${data.mapsUrl}" style="display:inline-block;color:${ACCENT.pink.text};font-size:13px;font-weight:700;text-decoration:none;margin:4px 0 0;">\u{1F4CD} Ver en Google Maps \u2192</a>` : ""}
        <div style="margin-top:16px;padding-top:16px;border-top:1px solid ${BORDER};">
          <p style="color:${FAINT};font-size:11px;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 4px;">C\xF3digo de reserva</p>
          <p style="color:${INK};font-size:15px;font-weight:700;font-family:monospace;margin:0;">${data.orderNumber}</p>
        </div>
        ${!data.ticketReady ? `<p style="color:${FAINT};font-size:12px;margin:14px 0 0;">La direcci\xF3n exacta ser\xE1 enviada unos d\xEDas antes del evento.</p>` : ""}
      `)}

      <!-- MISI\xD3N 300 -->
      ${data.isMissionDeposit ? `
      ${sectionTitle("\u{1F36C}", "Misi\xF3n 300")}
      ${card(`
        <p style="color:${INK};font-size:16px;font-weight:800;margin:0 0 10px;">\xA1Eres parte de la Misi\xF3n 300!</p>
        <p style="color:${INK};font-size:14px;line-height:1.6;margin:0 0 10px;">
          Compraste tu acceso antes de que se agotaran los primeros 300 asistentes, por lo que obtuviste el valor
          especial de lanzamiento.
        </p>
        <p style="color:${INK};font-size:14px;line-height:1.6;margin:0;">
          Cuando la misi\xF3n finalice, recibir\xE1s autom\xE1ticamente un nuevo correo con tu c\xF3digo QR definitivo.
        </p>
      `, { bg: ACCENT.pink.bg, border: false })}
      ` : ""}

      <!-- RESUMEN DE COMPRA -->
      ${sectionTitle("\u{1F9FE}", "Tu compra")}
      ${card(`
        ${data.items.map((item) => `
          <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid ${BORDER};">
            <span style="color:${INK};font-size:14px;">${item.quantity}x ${item.name}</span>
            <span style="color:${INK};font-size:14px;font-weight:600;">$${item.price.toLocaleString("es-CL")}</span>
          </div>
        `).join("")}
        ${data.serviceFee && data.serviceFee > 0 ? `
        <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid ${BORDER};">
          <span style="color:${MUTED};font-size:14px;">Cargo por servicio</span>
          <span style="color:${INK};font-size:14px;font-weight:600;">$${data.serviceFee.toLocaleString("es-CL")}</span>
        </div>
        ` : ""}
        <div style="display:flex;justify-content:space-between;padding-top:14px;margin-top:6px;">
          <span style="color:${INK};font-size:16px;font-weight:800;">Total pagado</span>
          <span style="color:${ACCENT.pink.text};font-size:18px;font-weight:800;">$${data.total.toLocaleString("es-CL")}</span>
        </div>
      `)}

      <!-- TU ENTRADA -->
      ${sectionTitle("\u{1F39F}", "Tu entrada")}
      ${!data.ticketReady ? card(`
        <p style="color:${INK};font-size:15px;font-weight:700;margin:0 0 8px;">Mientras la Misi\xF3n 300 siga activa...</p>
        <p style="color:${MUTED};font-size:14px;line-height:1.6;margin:0 0 10px;">Tu QR a\xFAn no ha sido emitido.</p>
        <p style="color:${INK};font-size:14px;line-height:1.6;margin:0;">\u{1F4E9} Apenas finalice la misi\xF3n, lo recibir\xE1s autom\xE1ticamente por este mismo medio. No necesitas hacer nada m\xE1s.</p>
      `, { bg: ACCENT.yellow.bg, border: false }) : card(`
        <div style="text-align:center;">
          <!-- Marco tem\xE1tico: borde grueso color marca + etiqueta arriba del QR --
               sin degrad\xE9 CSS (Outlook desktop no lo soporta), un borde s\xF3lido
               grueso es el tratamiento m\xE1s seguro entre clientes de correo. -->
          <div style="display:inline-block;background:${ACCENT.pink.bg};border:3px solid ${ACCENT.pink.solid};border-radius:20px;padding:16px;">
            <p style="color:${ACCENT.pink.text};font-size:11px;font-weight:800;letter-spacing:2px;margin:0 0 10px;">\u{1F36D} CANDYLAND</p>
            <img src="${qrUrl}" alt="C\xF3digo QR de tu entrada" style="width:200px;height:200px;border-radius:12px;background:#fff;padding:8px;display:block;" />
          </div>
          <p style="color:${MUTED};font-size:12px;margin:14px 0 20px;">Presenta este c\xF3digo QR y tu carnet en la entrada</p>
        </div>
        <div style="margin-bottom:18px;">
          <p style="color:${FAINT};font-size:11px;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 6px;">Asistentes</p>
          ${attendeeNamesList(data.attendeeNames ?? [])}
        </div>
        ${data.extras && data.extras.length > 0 ? `
        <div style="margin-bottom:18px;padding-top:14px;border-top:1px solid ${BORDER};">
          <p style="color:${FAINT};font-size:11px;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 6px;">Incluye</p>
          ${data.extras.map((e) => `
            <p style="color:${ACCENT.pink.text};font-size:14px;font-weight:700;margin:2px 0;">\u2705 ${e.quantity > 1 ? `${e.quantity}\xD7 ` : ""}${e.name}</p>
            ${e.codes.map((code) => `<p style="color:${MUTED};font-size:12px;font-family:monospace;letter-spacing:0.5px;margin:0 0 4px 20px;">${code}</p>`).join("")}
          `).join("")}
          <p style="color:${FAINT};font-size:11px;margin:8px 0 0;">Presenta estos c\xF3digos en caja el d\xEDa del evento para canjearlos.</p>
        </div>
        ` : ""}
        <div style="text-align:center;">
          <a href="${ticketUrl}" style="display:inline-block;background:${ACCENT.pink.solid};color:#fff;text-decoration:none;padding:14px 30px;border-radius:999px;font-weight:800;font-size:14px;margin:0 6px 10px;">Ver mi entrada</a>
          <a href="${calendarUrl}" style="display:inline-block;background:#fff;color:${INK};text-decoration:none;padding:14px 30px;border-radius:999px;font-weight:700;font-size:14px;border:1px solid ${BORDER};margin:0 6px 10px;">\u{1F4C5} Agregar al calendario</a>
        </div>
      `)}

      <!-- QU\xC9 ES MANSION PLAYROOM -->
      ${sectionTitle("\u2728", "\xBFQu\xE9 es Mansion Playroom?")}
      <p style="color:${MUTED};font-size:14px;line-height:1.6;margin:0 0 16px;">
        M\xE1s que una fiesta, somos un venue y una comunidad para adultos donde cada persona vive la experiencia a su manera.
      </p>
      ${grid(CONTENT.quienesSomos.map((x) => `
        <div style="background:${ACCENT.blue.bg};border-radius:16px;padding:16px;text-align:center;">
          <p style="font-size:26px;margin:0 0 6px;">${x.emoji}</p>
          <p style="color:${INK};font-size:12px;font-weight:700;margin:0;">${x.label}</p>
        </div>
      `), 3)}
      <p style="color:${MUTED};font-size:13px;margin:6px 0 24px;">Todo ocurre siempre bajo nuestros tres pilares: ${CONTENT.valores.join(" \xB7 ")}</p>

      <!-- QU\xC9 ENCONTRAR\xC1S -->
      ${sectionTitle("\u{1F6DD}", "\xBFQu\xE9 encontrar\xE1s?")}
      ${grid(CONTENT.encontraras.map((x) => `
        <div style="background:${ACCENT.lilac.bg};border-radius:16px;padding:14px;">
          <p style="font-size:22px;margin:0 0 4px;">${x.emoji}</p>
          <p style="color:${INK};font-size:12px;font-weight:700;margin:0;">${x.label}</p>
        </div>
      `), 2)}
      <div style="margin-bottom:8px;"></div>

      <!-- ANTES DE VENIR -->
      ${sectionTitle("\u{1F392}", "Antes de venir")}
      ${grid(CONTENT.antesDeVenir.map((x) => `
        <div style="background:${ACCENT.yellow.bg};border-radius:16px;padding:16px;">
          <p style="font-size:24px;margin:0 0 6px;">${x.emoji}</p>
          <p style="color:${INK};font-size:13px;font-weight:800;margin:0 0 4px;">${x.titulo}</p>
          <p style="color:${MUTED};font-size:12px;line-height:1.5;margin:0;">${x.texto}</p>
        </div>
      `), 2)}

      <!-- NUESTROS VALORES -->
      ${sectionTitle("\u2764\uFE0F", "Nuestros valores")}
      ${card(`
        <p style="color:${INK};font-size:16px;font-weight:700;margin:0;">${CONTENT.valores.join("&nbsp;&nbsp;\xB7&nbsp;&nbsp;")}</p>
      `, { bg: ACCENT.pink.bg, border: false })}

      <!-- EMBAJADOR -->
      ${sectionTitle("\u{1F3C6}", "Tu C\xF3digo de Embajador")}
      ${card(`
        <div style="text-align:center;margin-bottom:16px;">
          <p style="color:${INK};font-size:30px;font-weight:800;font-family:monospace;margin:0;">${data.ambassadorCode}</p>
          <p style="color:${MUTED};font-size:13px;margin:8px 0 0;">Comp\xE1rtelo con tus amigos \u2014 cada compra realizada con tu c\xF3digo suma recompensas.</p>
        </div>
        ${AMBASSADOR_TIERS.map((t2) => `
          <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid ${BORDER};">
            <span style="color:${INK};font-size:13px;font-weight:700;">${t2.emoji} ${t2.min} compras</span>
            <span style="color:${MUTED};font-size:13px;text-align:right;">${t2.reward}</span>
          </div>
        `).join("")}
        <div style="text-align:center;margin-top:18px;">
          <a href="${whatsappShareUrl}" style="display:inline-block;background:${ACCENT.pink.solid};color:#fff;text-decoration:none;padding:12px 28px;border-radius:999px;font-weight:800;font-size:13px;">Compartir por WhatsApp</a>
        </div>
      `)}

      <!-- FAQ -->
      ${sectionTitle("\u2753", "Preguntas r\xE1pidas")}
      ${card(CONTENT.faq.map((f, i) => `
        <div style="${i > 0 ? `border-top:1px solid ${BORDER};padding-top:12px;margin-top:12px;` : ""}">
          <p style="color:${INK};font-size:14px;font-weight:700;margin:0 0 4px;">${f.q}</p>
          <p style="color:${MUTED};font-size:13px;margin:0;">${f.a}</p>
        </div>
      `).join(""))}

      <!-- INFO IMPORTANTE -->
      <p style="color:${FAINT};font-size:12px;line-height:1.6;margin:0 0 24px;">
        \u{1F4CC} Consulta nuestra
        <a href="${EMAIL_BASE_URL}/politica-de-reembolso" style="color:${ACCENT.pink.text};">pol\xEDtica de reembolso y condiciones de compra</a>.
        Si no puedes asistir, puedes transferir tu acceso a otra persona escribi\xE9ndonos por Instagram antes del evento.
      </p>

      <!-- DESPEDIDA -->
      <div style="text-align:center;padding:24px 0;">
        <p style="font-size:32px;margin:0 0 8px;">\u{1F36D}</p>
        <p style="color:${INK};font-size:16px;font-weight:800;margin:0 0 6px;">Nos vemos en Candyland</p>
        <p style="color:${MUTED};font-size:13px;line-height:1.6;margin:0;">
          Ya eres parte de esta edici\xF3n. Nosotros ponemos la m\xFAsica, el ambiente y la experiencia.<br/>
          T\xFA solo preoc\xFApate de llegar con ganas de disfrutar.<br/>
          <strong>Equipo Mansion Playroom</strong>
        </p>
      </div>
    </div>

    <!-- FOOTER -->
    <div style="text-align:center;padding:24px;border-top:1px solid ${BORDER};margin-top:8px;">
      <img src="${logoUrl}" alt="Mansion Playroom" style="height:24px;width:auto;margin-bottom:12px;opacity:0.7;" />
      <p style="margin:0 0 8px;">
        <a href="https://instagram.com/mansionplayroom.cl" style="color:${FAINT};font-size:12px;text-decoration:none;margin:0 8px;">Instagram</a>
        <a href="https://www.mansionplayroom.cl" style="color:${FAINT};font-size:12px;text-decoration:none;margin:0 8px;">Web</a>
      </p>
      <p style="color:${FAINT};font-size:11px;margin:0;">\xA9 ${(/* @__PURE__ */ new Date()).getFullYear()} Mansion Playroom \xB7 Valpara\xEDso, Chile</p>
    </div>
  </div>
</body>
</html>`;
}
function buildMissionTopupEmail(data) {
  const logoUrl = `${EMAIL_BASE_URL}/candyland/logo-wordmark-email.png`;
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
</head>
<body style="margin:0;padding:0;background-color:#FFFFFF;font-family:'Helvetica Neue',Arial,sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:0 0 40px;background-color:#FFFFFF;">

    <!-- HERO -->
    <div style="background:linear-gradient(160deg,${ACCENT.yellow.bg},${ACCENT.pink.bg});padding:40px 24px;text-align:center;border-radius:0 0 32px 32px;">
      <img src="${logoUrl}" alt="Mansion Playroom" style="height:64px;width:auto;margin-bottom:24px;" />
      <p style="font-size:52px;margin:0 0 12px;">\u{1F36D}</p>
      <h1 style="color:${INK};font-size:26px;font-weight:800;margin:0 0 8px;">\xA1Casi, ${data.buyerName}!</h1>
      <p style="color:${MUTED};font-size:15px;margin:0;">No juntamos las 300 personas para ${data.eventTitle} \u2014 falta completar tu diferencia.</p>
    </div>

    <div style="padding:32px 24px 0;">
      <p style="color:${MUTED};font-size:15px;line-height:1.6;margin:0 0 24px;">
        Para <strong style="color:${INK};">${data.eventTitle}</strong> (${data.eventDate}) no llegamos a las 300 personas de la Misi\xF3n,
        as\xED que para asegurar tu entrada falta completar la diferencia \u2014 igual pagaste como m\xE1ximo el 60% del valor
        general gracias a tu abono.
      </p>

      ${sectionTitle("\u{1F9FE}", "Diferencia a pagar")}
      ${card(`
        <div style="text-align:center;">
          <p style="color:${FAINT};font-size:11px;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 6px;">Orden ${data.orderNumber}</p>
          <p style="color:${ACCENT.pink.text};font-size:32px;font-weight:800;margin:0 0 6px;">$${data.topupAmount.toLocaleString("es-CL")}</p>
          <p style="color:${MUTED};font-size:13px;margin:0 0 20px;">M\xE1ximo el 60% del valor general \u2014 tu abono ya cuenta como parte de este monto.</p>
          <a href="${data.paymentUrl}" style="display:inline-block;background:${ACCENT.pink.solid};color:#fff;text-decoration:none;padding:14px 32px;border-radius:999px;font-weight:800;font-size:14px;box-shadow:0 8px 20px rgba(236,95,163,0.35);">Pagar diferencia</a>
          <p style="color:${FAINT};font-size:12px;margin:16px 0 0;">Tu entrada con c\xF3digo QR llega autom\xE1ticamente apenas se confirme este pago.</p>
        </div>
      `)}
    </div>

    <!-- FOOTER -->
    <div style="text-align:center;padding:24px;border-top:1px solid ${BORDER};margin-top:8px;">
      <img src="${logoUrl}" alt="Mansion Playroom" style="height:24px;width:auto;margin-bottom:12px;opacity:0.7;" />
      <p style="margin:0 0 8px;">
        <a href="https://instagram.com/mansionplayroom.cl" style="color:${FAINT};font-size:12px;text-decoration:none;margin:0 8px;">Instagram</a>
        <a href="https://www.mansionplayroom.cl" style="color:${FAINT};font-size:12px;text-decoration:none;margin:0 8px;">Web</a>
      </p>
      <p style="color:${FAINT};font-size:11px;margin:0;">\xA9 ${(/* @__PURE__ */ new Date()).getFullYear()} Mansion Playroom \xB7 Valpara\xEDso, Chile</p>
    </div>
  </div>
</body>
</html>`;
}
function buildTierUpEmail(data) {
  const logoUrl = `${EMAIL_BASE_URL}/candyland/logo-wordmark-email.png`;
  const tier = tierForCount(data.referralCount);
  const next = nextTierForCount(data.referralCount);
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
</head>
<body style="margin:0;padding:0;background-color:#FFFFFF;font-family:'Helvetica Neue',Arial,sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:0 0 40px;background-color:#FFFFFF;">

    <!-- HERO -->
    <div style="background:linear-gradient(160deg,${ACCENT.yellow.bg},${ACCENT.pink.bg});padding:40px 24px;text-align:center;border-radius:0 0 32px 32px;">
      <img src="${logoUrl}" alt="Mansion Playroom" style="height:64px;width:auto;margin-bottom:24px;" />
      <p style="font-size:52px;margin:0 0 12px;">${tier.emoji}</p>
      <h1 style="color:${INK};font-size:26px;font-weight:800;margin:0 0 8px;">\xA1Llegaste a nivel ${tier.name}, ${data.buyerName}!</h1>
      <p style="color:${MUTED};font-size:15px;margin:0;">Ya vendiste ${data.referralCount} entradas con tu c\xF3digo \u2014 te lo ganaste.</p>
    </div>

    <div style="padding:32px 24px 0;">
      ${sectionTitle("\u{1F381}", "Tu premio")}
      ${card(`
        <p style="color:${INK};font-size:18px;font-weight:800;margin:0 0 6px;">${tier.reward}</p>
        <p style="color:${MUTED};font-size:13px;margin:0;">Escr\xEDbenos por Instagram para coordinar c\xF3mo lo recibes.</p>
      `, { bg: ACCENT.yellow.bg, border: false })}

      ${next ? `
      ${sectionTitle("\u{1F680}", "Sigue subiendo")}
      ${card(`
        <p style="color:${INK};font-size:14px;line-height:1.6;margin:0 0 10px;">
          Te faltan <strong style="color:${ACCENT.pink.text};">${next.min - data.referralCount}</strong> ventas m\xE1s para nivel
          <strong style="color:${INK};">${next.emoji} ${next.name}</strong>:
        </p>
        <p style="color:${INK};font-size:15px;font-weight:700;margin:0;">${next.reward}</p>
      `)}
      ` : `
      ${sectionTitle("\u{1F451}", "Llegaste al tope")}
      ${card(`<p style="color:${INK};font-size:14px;line-height:1.6;margin:0;">Eres nivel Oro, el m\xE1s alto del programa. Sigue vendiendo para mantenerte arriba en el Hall de la Fama.</p>`)}
      `}

      <div style="text-align:center;margin-top:24px;">
        <p style="color:${FAINT};font-size:11px;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 6px;">Tu c\xF3digo</p>
        <p style="color:${INK};font-size:26px;font-weight:800;font-family:monospace;margin:0 0 20px;">${data.ambassadorCode}</p>
        <a href="${EMAIL_BASE_URL}/mis-referidos" style="display:inline-block;background:${ACCENT.pink.solid};color:#fff;text-decoration:none;padding:14px 32px;border-radius:999px;font-weight:800;font-size:14px;">Ver Hall de la Fama</a>
      </div>
    </div>

    <!-- FOOTER -->
    <div style="text-align:center;padding:24px;border-top:1px solid ${BORDER};margin-top:24px;">
      <img src="${logoUrl}" alt="Mansion Playroom" style="height:24px;width:auto;margin-bottom:12px;opacity:0.7;" />
      <p style="margin:0 0 8px;">
        <a href="https://instagram.com/mansionplayroom.cl" style="color:${FAINT};font-size:12px;text-decoration:none;margin:0 8px;">Instagram</a>
        <a href="https://www.mansionplayroom.cl" style="color:${FAINT};font-size:12px;text-decoration:none;margin:0 8px;">Web</a>
      </p>
      <p style="color:${FAINT};font-size:11px;margin:0;">\xA9 ${(/* @__PURE__ */ new Date()).getFullYear()} Mansion Playroom \xB7 Valpara\xEDso, Chile</p>
    </div>
  </div>
</body>
</html>`;
}
function buildAlmostTierEmail(data) {
  const logoUrl = `${EMAIL_BASE_URL}/candyland/logo-wordmark-email.png`;
  const next = nextTierForCount(data.referralCount);
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
</head>
<body style="margin:0;padding:0;background-color:#FFFFFF;font-family:'Helvetica Neue',Arial,sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:0 0 40px;background-color:#FFFFFF;">

    <!-- HERO -->
    <div style="background:linear-gradient(160deg,${ACCENT.lilac.bg},${ACCENT.pink.bg});padding:40px 24px;text-align:center;border-radius:0 0 32px 32px;">
      <img src="${logoUrl}" alt="Mansion Playroom" style="height:64px;width:auto;margin-bottom:24px;" />
      <p style="font-size:52px;margin:0 0 12px;">\u{1F525}</p>
      <h1 style="color:${INK};font-size:26px;font-weight:800;margin:0 0 8px;">\xA1Est\xE1s a 1 venta, ${data.buyerName}!</h1>
      <p style="color:${MUTED};font-size:15px;margin:0;">Una entrada m\xE1s y desbloqueas nivel ${next.name}.</p>
    </div>

    <div style="padding:32px 24px 0;">
      ${sectionTitle(next.emoji, `Te espera nivel ${next.name}`)}
      ${card(`
        <p style="color:${INK};font-size:18px;font-weight:800;margin:0 0 10px;">${next.reward}</p>
        <p style="color:${MUTED};font-size:14px;line-height:1.6;margin:0;">
          Ya vendiste ${data.referralCount} entradas con tu c\xF3digo \u2014 comparte tu c\xF3digo una vez m\xE1s y lo tienes asegurado.
        </p>
      `, { bg: ACCENT.pink.bg, border: false })}

      <div style="text-align:center;margin-top:24px;">
        <p style="color:${FAINT};font-size:11px;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 6px;">Tu c\xF3digo</p>
        <p style="color:${INK};font-size:26px;font-weight:800;font-family:monospace;margin:0 0 20px;">${data.ambassadorCode}</p>
        <a href="https://wa.me/?text=${encodeURIComponent(`Usa mi c\xF3digo ${data.ambassadorCode} para comprar tu entrada a Candyland en Mansion Playroom \u{1F36D} ${EMAIL_BASE_URL}`)}" style="display:inline-block;background:${ACCENT.pink.solid};color:#fff;text-decoration:none;padding:14px 32px;border-radius:999px;font-weight:800;font-size:14px;">Compartir por WhatsApp</a>
      </div>
    </div>

    <!-- FOOTER -->
    <div style="text-align:center;padding:24px;border-top:1px solid ${BORDER};margin-top:24px;">
      <img src="${logoUrl}" alt="Mansion Playroom" style="height:24px;width:auto;margin-bottom:12px;opacity:0.7;" />
      <p style="margin:0 0 8px;">
        <a href="https://instagram.com/mansionplayroom.cl" style="color:${FAINT};font-size:12px;text-decoration:none;margin:0 8px;">Instagram</a>
        <a href="https://www.mansionplayroom.cl" style="color:${FAINT};font-size:12px;text-decoration:none;margin:0 8px;">Web</a>
      </p>
      <p style="color:${FAINT};font-size:11px;margin:0;">\xA9 ${(/* @__PURE__ */ new Date()).getFullYear()} Mansion Playroom \xB7 Valpara\xEDso, Chile</p>
    </div>
  </div>
</body>
</html>`;
}
function buildSalesRecordEmail(data) {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
</head>
<body style="margin:0;padding:0;background-color:#FFFFFF;font-family:'Helvetica Neue',Arial,sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:24px;background-color:#FFFFFF;">
    <h1 style="color:${INK};font-size:20px;font-weight:800;margin:0 0 4px;">${data.isFinal ? "\u{1F39F}" : "\u{1F36C}"} ${data.eventTitle} \u2014 Orden ${data.orderNumber}</h1>
    <p style="color:${MUTED};font-size:13px;margin:0 0 20px;">${data.isFinal ? "Ticket final generado" : "Abono Misi\xF3n 300 aprobado -- todav\xEDa sin c\xF3digos de extras"}</p>

    ${card(`
      <p style="color:${FAINT};font-size:11px;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 4px;">Comprador</p>
      <p style="color:${INK};font-size:15px;font-weight:700;margin:0 0 2px;">${data.buyerName}</p>
      <p style="color:${MUTED};font-size:13px;margin:0 0 2px;">${data.buyerEmail}</p>
      ${data.buyerPhone ? `<p style="color:${MUTED};font-size:13px;margin:0;">${data.buyerPhone}</p>` : ""}
    `)}

    ${card(`
      <p style="color:${FAINT};font-size:11px;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 10px;">\xCDtems</p>
      ${data.items.map((item) => `
        <div style="padding:8px 0;border-bottom:1px solid ${BORDER};">
          <div style="display:flex;justify-content:space-between;">
            <span style="color:${INK};font-size:14px;">${item.quantity}x ${item.name}</span>
            <span style="color:${INK};font-size:14px;font-weight:600;">$${item.price.toLocaleString("es-CL")}</span>
          </div>
          ${item.codes && item.codes.length > 0 ? `<p style="color:${ACCENT.pink.text};font-size:12px;font-family:monospace;margin:4px 0 0;">${item.codes.join(" \xB7 ")}</p>` : ""}
        </div>
      `).join("")}
      <div style="display:flex;justify-content:space-between;padding-top:12px;margin-top:4px;">
        <span style="color:${INK};font-size:15px;font-weight:800;">Total</span>
        <span style="color:${ACCENT.pink.text};font-size:16px;font-weight:800;">$${data.total.toLocaleString("es-CL")}</span>
      </div>
    `)}
  </div>
</body>
</html>`;
}

// server/caja/displayCode.ts
import { randomInt } from "crypto";
var ALPHABET = "23456789ABCDEFGHJKMNPQRSTVWXYZ";
function randomGroup(length) {
  let out = "";
  for (let i = 0; i < length; i++) out += ALPHABET[randomInt(ALPHABET.length)];
  return out;
}
function fallbackInternalCode(name) {
  const letters = name.replace(/[^a-zA-Z]/g, "").toUpperCase();
  return (letters.slice(0, 3) || "EXT").padEnd(3, "X");
}
function generateDisplayCode(prefix) {
  const cleanPrefix = prefix.trim().toUpperCase().slice(0, 6) || "EXT";
  return `${cleanPrefix}-${randomGroup(4)}-${randomGroup(4)}`;
}

// server/webhooks.ts
var webhooksRouter = Router();
var CHILE_TZ = "America/Santiago";
function formatEventDate(date) {
  return date.toLocaleDateString("es-CL", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: CHILE_TZ });
}
function formatEventTime(date) {
  return date.toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit", timeZone: CHILE_TZ });
}
function mapPaymentStatus(mpStatus) {
  if (mpStatus === "approved") return "approved";
  if (mpStatus === "rejected" || mpStatus === "cancelled") return "rejected";
  return "pending";
}
async function applyPaymentResult(input) {
  const db = await getDb();
  if (!db) return { ok: false, reason: "Database not available" };
  const [order] = await db.select().from(orders).where(eq3(orders.orderNumber, input.orderNumber)).limit(1);
  if (!order) return { ok: false, reason: "Order not found" };
  if (order.paymentId === input.paymentId && order.paymentStatus !== "pending") {
    return { ok: true, alreadyProcessed: true };
  }
  await db.update(orders).set({
    paymentStatus: input.status,
    paymentId: input.paymentId,
    paymentMethod: input.paymentMethodId || void 0
  }).where(eq3(orders.id, order.id));
  if (input.status === "approved") {
    const isTopupPayment = order.missionTopupStatus === "pending";
    const isMissionDeposit = order.missionDeposit === 1 && order.missionTopupStatus === "none";
    if (!isTopupPayment) {
      const items = await db.select().from(orderItems).where(eq3(orderItems.orderId, order.id));
      for (const item of items) {
        await db.update(ticketTypes).set({ soldCount: sql2`soldCount + ${item.quantity}` }).where(eq3(ticketTypes.id, item.ticketTypeId));
      }
    }
    if (isMissionDeposit) {
      if (!order.depositEmailSent) await sendMissionDepositEmail(order);
    } else if (isTopupPayment) {
      await db.update(orders).set({ missionTopupStatus: "paid" }).where(eq3(orders.id, order.id));
      if (!order.emailSent) await processApprovedOrder(order);
    } else if (!order.emailSent) {
      await processApprovedOrder(order);
    }
  }
  return { ok: true };
}
async function processCardPaymentForOrder(input) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [order] = await db.select().from(orders).where(eq3(orders.orderNumber, input.orderNumber)).limit(1);
  if (!order) throw new Error("Order not found");
  if (order.paymentStatus === "approved") throw new Error("Order already paid");
  const [event] = await db.select().from(events).where(eq3(events.id, order.eventId)).limit(1);
  const result = await createCardPayment({
    orderNumber: order.orderNumber,
    amount: Number(order.total),
    description: `Candyland - ${event?.title ?? "Mansion Playroom"}`,
    token: input.token,
    paymentMethodId: input.paymentMethodId,
    issuerId: input.issuerId,
    installments: input.installments,
    payerEmail: order.buyerEmail,
    identificationType: input.identificationType,
    identificationNumber: input.identificationNumber
  });
  await applyPaymentResult({
    orderNumber: order.orderNumber,
    paymentId: result.paymentId,
    status: result.status === "in_process" ? "pending" : result.status,
    paymentMethodId: result.paymentMethodId
  });
  return { status: result.status, statusDetail: result.statusDetail };
}
async function confirmFreeOrder(orderNumber) {
  const db = await getDb();
  if (!db) return;
  const [order] = await db.select().from(orders).where(eq3(orders.orderNumber, orderNumber)).limit(1);
  if (!order || order.paymentStatus !== "approved" || order.emailSent) return;
  await processApprovedOrder(order);
}
webhooksRouter.post("/api/webhooks/mercadopago", async (req, res) => {
  try {
    const { type, data } = req.body;
    if (type === "payment") {
      const paymentId = data?.id;
      if (!paymentId) {
        res.status(400).json({ error: "No payment ID" });
        return;
      }
      const paymentInfo = await getPaymentInfo(String(paymentId));
      if (!paymentInfo) {
        res.status(200).json({ ok: true });
        return;
      }
      const orderNumber = paymentInfo.external_reference;
      if (!orderNumber) {
        res.status(200).json({ ok: true });
        return;
      }
      await applyPaymentResult({
        orderNumber,
        paymentId: String(paymentId),
        status: mapPaymentStatus(paymentInfo.status),
        paymentMethodId: paymentInfo.payment_method_id
      });
    }
    res.status(200).json({ ok: true });
  } catch (error) {
    console.error("[Webhook] Error:", error);
    res.status(200).json({ ok: true });
  }
});
async function ensureOwnAmbassadorCode(db, order) {
  const [previousOrder] = await db.select().from(orders).where(and2(eq3(orders.buyerEmail, order.buyerEmail), eq3(orders.paymentStatus, "approved"), isNotNull(orders.ambassadorCode), ne(orders.id, order.id))).orderBy(orders.createdAt).limit(1);
  const existingUsers = previousOrder ? null : await db.select().from(users).where(eq3(users.email, order.buyerEmail)).limit(1);
  const code = previousOrder?.ambassadorCode || existingUsers?.[0]?.ambassadorCode || nanoid2(8).toUpperCase();
  await db.update(orders).set({ ambassadorCode: code }).where(eq3(orders.id, order.id));
  return code;
}
var SALES_RECORD_EMAIL = "contacto@mansionplayroom.cl";
async function sendSalesRecordCopy(order, event, salesItems, isFinal) {
  const html = buildSalesRecordEmail({
    eventTitle: event.title,
    orderNumber: order.orderNumber,
    buyerName: order.buyerName,
    buyerEmail: order.buyerEmail,
    buyerPhone: order.buyerPhone || void 0,
    items: salesItems,
    total: Number(order.total),
    isFinal
  });
  await sendEmail({
    to: SALES_RECORD_EMAIL,
    subject: `[Ventas Candyland] Orden ${order.orderNumber} \u2014 ${order.buyerName}`,
    html
  });
}
async function sendMissionDepositEmail(order) {
  const db = await getDb();
  if (!db) return { success: false };
  const [event] = await db.select().from(events).where(eq3(events.id, order.eventId)).limit(1);
  if (!event) return { success: false };
  const items = await db.select().from(orderItems).where(eq3(orderItems.orderId, order.id));
  const emailItems = [];
  for (const item of items) {
    const [tt] = await db.select().from(ticketTypes).where(eq3(ticketTypes.id, item.ticketTypeId)).limit(1);
    emailItems.push({ name: tt?.name || "Entrada", quantity: item.quantity, price: Number(item.totalPrice) });
  }
  const ambassadorCode = await ensureOwnAmbassadorCode(db, order);
  const html = buildOrderEmail({
    buyerName: order.buyerName,
    eventTitle: event.title,
    eventDate: formatEventDate(new Date(event.eventDate)),
    doorsOpenText: event.doorsOpen ? formatEventTime(new Date(event.doorsOpen)) : void 0,
    venue: event.venue || "",
    address: event.address || void 0,
    orderNumber: order.orderNumber,
    items: emailItems,
    total: Number(order.total),
    serviceFee: Number(order.serviceFee ?? 0),
    ambassadorCode,
    isMissionDeposit: true,
    ticketReady: false
  });
  const result = await sendEmail({
    to: order.buyerEmail,
    subject: `\u{1F36C} Ya est\xE1s en la Misi\xF3n 300 - ${event.title}`,
    html
  });
  if (result.success) {
    await db.update(orders).set({ depositEmailSent: 1 }).where(eq3(orders.id, order.id));
    await sendSalesRecordCopy(order, event, emailItems, false);
  }
  return result;
}
async function sendConfirmationEmailForOrder(order, sendSalesCopy = false) {
  const db = await getDb();
  if (!db) return { success: false };
  const [event] = await db.select().from(events).where(eq3(events.id, order.eventId)).limit(1);
  if (!event) return { success: false };
  const items = await db.select().from(orderItems).where(eq3(orderItems.orderId, order.id));
  const emailItems = [];
  for (const item of items) {
    const [tt] = await db.select().from(ticketTypes).where(eq3(ticketTypes.id, item.ticketTypeId)).limit(1);
    emailItems.push({ name: tt?.name || "Entrada", quantity: item.quantity, price: Number(item.totalPrice) });
  }
  const orderTickets = await db.select().from(tickets).where(eq3(tickets.orderId, order.id));
  let mainTicket = null;
  for (const t2 of orderTickets) {
    const [tt] = await db.select().from(ticketTypes).where(eq3(ticketTypes.id, t2.ticketTypeId)).limit(1);
    if (tt?.category === "acceso") {
      mainTicket = t2;
      break;
    }
  }
  if (!mainTicket) mainTicket = orderTickets[0];
  const extras = await getOrderExtras(order.id);
  const codesByTicketTypeId = /* @__PURE__ */ new Map();
  for (const t2 of orderTickets) {
    const list = codesByTicketTypeId.get(t2.ticketTypeId) ?? [];
    list.push(t2.ticketCode);
    codesByTicketTypeId.set(t2.ticketTypeId, list);
  }
  const salesItems = items.map((item, i) => ({ ...emailItems[i], codes: codesByTicketTypeId.get(item.ticketTypeId) }));
  const html = buildOrderEmail({
    buyerName: order.buyerName,
    eventTitle: event.title,
    eventDate: formatEventDate(new Date(event.eventDate)),
    doorsOpenText: event.doorsOpen ? formatEventTime(new Date(event.doorsOpen)) : void 0,
    venue: event.venue || "",
    address: event.address || void 0,
    mapsUrl: event.mapsUrl || void 0,
    orderNumber: order.orderNumber,
    items: emailItems,
    total: Number(order.total),
    serviceFee: Number(order.serviceFee ?? 0),
    ambassadorCode: order.ambassadorCode || "",
    isMissionDeposit: order.missionDeposit === 1,
    ticketReady: true,
    ticketCode: mainTicket?.ticketCode,
    attendeeNames: parseAttendeeNames(order.attendeeData),
    extras
  });
  const result = await sendEmail({
    to: order.buyerEmail,
    subject: `\u{1F389} Tu entrada para ${event.title} - Mansion Playroom`,
    html
  });
  if (result.success && sendSalesCopy) {
    await sendSalesRecordCopy(order, event, salesItems, true);
  }
  return result;
}
async function resendConfirmationEmail(orderNumber) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [order] = await db.select().from(orders).where(eq3(orders.orderNumber, orderNumber)).limit(1);
  if (!order) throw new Error("Orden no encontrada");
  if (order.paymentStatus !== "approved") throw new Error("La orden todav\xEDa no est\xE1 aprobada");
  const existingTickets = await db.select().from(tickets).where(eq3(tickets.orderId, order.id)).limit(1);
  const isUnresolvedDeposit = existingTickets.length === 0 && order.missionDeposit === 1;
  const result = isUnresolvedDeposit ? await sendMissionDepositEmail(order) : await sendConfirmationEmailForOrder(order);
  if (!result.success) throw new Error("Resend rechaz\xF3 el env\xEDo -- revisa la configuraci\xF3n de RESEND_API_KEY/RESEND_FROM_EMAIL en Vercel.");
  return { success: true };
}
async function processApprovedOrder(order) {
  const db = await getDb();
  if (!db) return;
  const items = await db.select().from(orderItems).where(eq3(orderItems.orderId, order.id));
  const [event] = await db.select().from(events).where(eq3(events.id, order.eventId)).limit(1);
  if (!event) return;
  const orderTicketTypeIds = Array.from(new Set(items.map((i) => i.ticketTypeId)));
  const orderTicketTypes = orderTicketTypeIds.length ? await db.select().from(ticketTypes).where(inArray2(ticketTypes.id, orderTicketTypeIds)) : [];
  const ticketTypeById = new Map(orderTicketTypes.map((tt) => [tt.id, tt]));
  for (const item of items) {
    const tt = ticketTypeById.get(item.ticketTypeId);
    const isRedeemable = tt?.category === "extra";
    const prefix = tt ? tt.internalCode || fallbackInternalCode(tt.name) : "EXT";
    for (let i = 0; i < item.quantity; i++) {
      const ticketCode = `MP-${nanoid2(12).toUpperCase()}`;
      const { qrData, qrImageUrl } = await generateTicketQR(ticketCode, event.title);
      await db.insert(tickets).values({
        ticketCode,
        orderId: order.id,
        orderItemId: item.id,
        eventId: order.eventId,
        ticketTypeId: item.ticketTypeId,
        holderName: order.buyerName,
        qrData,
        qrImageUrl,
        status: "valid",
        displayCode: isRedeemable ? generateDisplayCode(prefix) : null
      });
    }
  }
  const orderAccesoSlugs = Array.from(orderTicketTypes).filter((tt) => tt.category === "acceso" && tt.accesoSlug).map((tt) => tt.accesoSlug);
  await upsertCustomerFromOrder(order, orderAccesoSlugs);
  if (order.ambassadorCode) {
    const [ambassadorOrder] = await db.select().from(orders).where(and2(eq3(orders.ambassadorCode, order.ambassadorCode), eq3(orders.paymentStatus, "approved"))).limit(1);
    if (ambassadorOrder && ambassadorOrder.id !== order.id) {
      const totalTickets = items.reduce((sum, item) => sum + item.quantity, 0);
      await db.insert(referrals).values({
        ambassadorCode: order.ambassadorCode,
        orderId: order.id,
        buyerEmail: order.buyerEmail,
        ticketCount: totalTickets,
        orderTotal: order.total
      });
      const [{ count: referralCount }] = await db.select({ count: sql2`COUNT(*)` }).from(referrals).where(eq3(referrals.ambassadorCode, order.ambassadorCode));
      const count = Number(referralCount);
      if (AMBASSADOR_TIERS.some((t2) => t2.min === count)) {
        const html = buildTierUpEmail({ buyerName: ambassadorOrder.buyerName, ambassadorCode: order.ambassadorCode, referralCount: count });
        await sendEmail({ to: ambassadorOrder.buyerEmail, subject: `${tierForCount(count).emoji} \xA1Llegaste a nivel ${tierForCount(count).name}!`, html });
      } else {
        const next = nextTierForCount(count);
        if (next && next.min - count === 1) {
          const html = buildAlmostTierEmail({ buyerName: ambassadorOrder.buyerName, ambassadorCode: order.ambassadorCode, referralCount: count });
          await sendEmail({ to: ambassadorOrder.buyerEmail, subject: `\u{1F525} \xA1Est\xE1s a 1 venta de nivel ${next.name}!`, html });
        }
      }
    }
  }
  await ensureOwnAmbassadorCode(db, order);
  const [refreshedOrder] = await db.select().from(orders).where(eq3(orders.id, order.id)).limit(1);
  const result = await sendConfirmationEmailForOrder(refreshedOrder ?? order, true);
  if (result.success) {
    await db.update(orders).set({ emailSent: 1 }).where(eq3(orders.id, order.id));
  }
}
async function getMission300Status(eventId) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [event] = await db.select().from(events).where(eq3(events.id, eventId)).limit(1);
  if (!event) throw new Error("Event not found");
  const eligible = await db.select().from(orders).where(and2(
    eq3(orders.eventId, eventId),
    eq3(orders.missionDeposit, 1),
    eq3(orders.paymentStatus, "approved"),
    eq3(orders.missionTopupStatus, "none")
  ));
  let totalPersonas = 0;
  for (const order of eligible) {
    const items = await db.select().from(orderItems).where(eq3(orderItems.orderId, order.id));
    for (const item of items) {
      const [tt] = await db.select().from(ticketTypes).where(eq3(ticketTypes.id, item.ticketTypeId)).limit(1);
      if (tt?.category === "acceso") totalPersonas += personasForAccesoSlug(tt.accesoSlug) * item.quantity;
    }
  }
  return {
    totalPersonas,
    goal: MISSION_300_GOAL,
    ordersCount: eligible.length,
    cutoffDate: missionCutoff(new Date(event.eventDate)),
    wouldSucceed: totalPersonas >= MISSION_300_GOAL
  };
}
async function evaluateMission300(eventId) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [event] = await db.select().from(events).where(eq3(events.id, eventId)).limit(1);
  if (!event) throw new Error("Event not found");
  const eligible = await db.select().from(orders).where(and2(
    eq3(orders.eventId, eventId),
    eq3(orders.missionDeposit, 1),
    eq3(orders.paymentStatus, "approved"),
    eq3(orders.missionTopupStatus, "none")
  ));
  const orderItemsByOrder = /* @__PURE__ */ new Map();
  let totalPersonas = 0;
  for (const order of eligible) {
    const items = await db.select().from(orderItems).where(eq3(orderItems.orderId, order.id));
    const withTt = [];
    for (const item of items) {
      const [tt] = await db.select().from(ticketTypes).where(eq3(ticketTypes.id, item.ticketTypeId)).limit(1);
      withTt.push({ ...item, ticketType: tt });
      if (tt?.category === "acceso") totalPersonas += personasForAccesoSlug(tt.accesoSlug) * item.quantity;
    }
    orderItemsByOrder.set(order.id, withTt);
  }
  const success = totalPersonas >= MISSION_300_GOAL;
  let resolved = 0;
  let topupRequested = 0;
  for (const order of eligible) {
    if (success) {
      await db.update(orders).set({ missionTopupStatus: "paid", missionTopupAmount: "0" }).where(eq3(orders.id, order.id));
      if (!order.emailSent) await processApprovedOrder(order);
      resolved++;
      continue;
    }
    const items = orderItemsByOrder.get(order.id) ?? [];
    let topupAmount = 0;
    for (const item of items) {
      if (item.ticketType?.category !== "acceso") continue;
      const cap = missionCapPrice(Number(item.ticketType.price));
      const alreadyPaidUnit = Number(item.unitPrice);
      topupAmount += Math.max(0, cap - alreadyPaidUnit) * item.quantity;
    }
    if (topupAmount <= 0) {
      await db.update(orders).set({ missionTopupStatus: "paid", missionTopupAmount: "0" }).where(eq3(orders.id, order.id));
      if (!order.emailSent) await processApprovedOrder(order);
      resolved++;
      continue;
    }
    const pref = await createTopupPreference({
      orderNumber: order.orderNumber,
      eventTitle: event.title,
      amount: topupAmount,
      buyerEmail: order.buyerEmail,
      buyerName: order.buyerName
    });
    await db.update(orders).set({
      missionTopupStatus: "pending",
      missionTopupAmount: String(topupAmount),
      missionTopupPreferenceId: pref.id
    }).where(eq3(orders.id, order.id));
    const html = buildMissionTopupEmail({
      buyerName: order.buyerName,
      eventTitle: event.title,
      eventDate: formatEventDate(new Date(event.eventDate)),
      orderNumber: order.orderNumber,
      topupAmount,
      paymentUrl: pref.initPoint || ""
    });
    await sendEmail({
      to: order.buyerEmail,
      subject: `Completa tu entrada \u2014 Misi\xF3n 300 no alcanz\xF3 la meta - ${event.title}`,
      html
    });
    topupRequested++;
  }
  return { totalPersonas, goal: MISSION_300_GOAL, success, ordersEvaluated: eligible.length, resolved, topupRequested };
}

// server/caja/auth.ts
import { randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { SignJWT as SignJWT2, jwtVerify as jwtVerify2 } from "jose";
function hashPin(pin) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(pin, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}
function verifyPin(pin, storedHash) {
  const [salt, hash] = storedHash.split(":");
  if (!salt || !hash) return false;
  const candidate = scryptSync(pin, salt, 64);
  const expected = Buffer.from(hash, "hex");
  if (candidate.length !== expected.length) return false;
  return timingSafeEqual(candidate, expected);
}
function getSecret() {
  return new TextEncoder().encode(ENV.cookieSecret);
}
async function signOperatorSession(payload) {
  const expirationSeconds = Math.floor((Date.now() + CAJA_SESSION_MS) / 1e3);
  return new SignJWT2({ operatorId: payload.operatorId, role: payload.role, name: payload.name }).setProtectedHeader({ alg: "HS256", typ: "JWT" }).setExpirationTime(expirationSeconds).sign(getSecret());
}
async function verifyOperatorSession(cookieValue) {
  if (!cookieValue) return null;
  try {
    const { payload } = await jwtVerify2(cookieValue, getSecret(), { algorithms: ["HS256"] });
    const { operatorId, role, name } = payload;
    if (typeof operatorId !== "number" || typeof role !== "string" || typeof name !== "string") return null;
    return { operatorId, role, name };
  } catch {
    return null;
  }
}

// server/caja/deviceAuth.ts
import { createHash, randomBytes as randomBytes2 } from "crypto";
import { SignJWT as SignJWT3, jwtVerify as jwtVerify3 } from "jose";
var ENROLL_CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTVWXYZ";
var ENROLL_CODE_TTL_MS = 24 * 60 * 60 * 1e3;
var DEVICE_SESSION_MS = 400 * 24 * 60 * 60 * 1e3;
function generateEnrollCode() {
  let out = "";
  for (let i = 0; i < 8; i++) out += ENROLL_CODE_ALPHABET[randomBytes2(1)[0] % ENROLL_CODE_ALPHABET.length];
  return `${out.slice(0, 4)}-${out.slice(4)}`;
}
function enrollCodeExpiry() {
  return new Date(Date.now() + ENROLL_CODE_TTL_MS);
}
function generateDeviceToken() {
  return randomBytes2(32).toString("hex");
}
function hashDeviceToken(token) {
  return createHash("sha256").update(token).digest("hex");
}
function getSecret2() {
  return new TextEncoder().encode(ENV.cookieSecret);
}
async function signDeviceSession(deviceId) {
  const expirationSeconds = Math.floor((Date.now() + DEVICE_SESSION_MS) / 1e3);
  return new SignJWT3({ deviceId }).setProtectedHeader({ alg: "HS256", typ: "JWT" }).setExpirationTime(expirationSeconds).sign(getSecret2());
}
async function verifyDeviceSession(cookieValue) {
  if (!cookieValue) return null;
  try {
    const { payload } = await jwtVerify3(cookieValue, getSecret2(), { algorithms: ["HS256"] });
    const { deviceId } = payload;
    if (typeof deviceId !== "number") return null;
    return { deviceId };
  } catch {
    return null;
  }
}

// server/caja/redeem.ts
init_schema();
init_ops();
import { eq as eq4 } from "drizzle-orm";
async function redeemDisplayCode(db, params) {
  const code = params.displayCode.trim().toUpperCase();
  const { result, conflictNote } = await applyOp(
    db,
    {
      id: params.opId,
      type: "redeem",
      eventId: params.eventId,
      operatorId: params.operatorId,
      registerId: params.registerId,
      targetType: "ticket",
      targetId: code,
      payload: { displayCode: code },
      clientAt: params.clientAt
    },
    async () => {
      const [ticket] = await db.select().from(tickets).where(eq4(tickets.displayCode, code)).limit(1);
      if (!ticket) return { result: "rejected", conflictNote: "El c\xF3digo no existe" };
      if (ticket.eventId !== params.eventId) return { result: "rejected", conflictNote: "El c\xF3digo no corresponde a este evento" };
      if (ticket.status === "cancelled") return { result: "rejected", conflictNote: "El c\xF3digo fue anulado" };
      if (ticket.status === "used") {
        return { result: "conflict", conflictNote: `Ya fue canjeado el ${ticket.usedAt?.toISOString?.() ?? ticket.usedAt}` };
      }
      await db.update(tickets).set({
        status: "used",
        usedAt: /* @__PURE__ */ new Date(),
        usedByOperatorId: params.operatorId,
        usedAtRegisterId: params.registerId ?? null
      }).where(eq4(tickets.id, ticket.id));
      return { result: "applied" };
    }
  );
  return { result, conflictNote };
}

// server/caja/sale.ts
init_schema();
init_ops();
import { eq as eq5, sql as sql3, inArray as inArray3 } from "drizzle-orm";
async function createCajaSale(db, params) {
  if (params.items.length === 0) throw new Error("La venta necesita al menos un producto");
  const ticketTypeIds = params.items.map((i) => i.ticketTypeId);
  const tts = await db.select().from(ticketTypes).where(inArray3(ticketTypes.id, ticketTypeIds));
  const ttById = new Map(tts.map((t2) => [t2.id, t2]));
  let total = 0;
  const lineItems = [];
  for (const item of params.items) {
    const tt = ttById.get(item.ticketTypeId);
    if (!tt) throw new Error(`Producto ${item.ticketTypeId} no encontrado`);
    const available = tt.totalStock - tt.soldCount;
    if (item.quantity > available) throw new Error(`Sin stock suficiente de ${tt.name}`);
    const unitPrice = Number(tt.price);
    total += unitPrice * item.quantity;
    lineItems.push({ ticketTypeId: tt.id, quantity: item.quantity, unitPrice, unitCost: tt.costPrice != null ? Number(tt.costPrice) : null, name: tt.name });
  }
  const { result, conflictNote } = await applyOp(
    db,
    {
      id: params.opId,
      type: "sale",
      eventId: params.eventId,
      operatorId: params.operatorId,
      registerId: params.registerId,
      targetType: "order",
      targetId: params.opId,
      // la orden todavía no existe al momento de armar el op -- se referencia por el mismo opId
      payload: { items: lineItems, paymentMethod: params.paymentMethod, total },
      clientAt: params.clientAt
    },
    async () => {
      const orderNumber = `CAJA-${Date.now().toString(36).toUpperCase()}`;
      const [orderResult] = await db.insert(orders).values({
        orderNumber,
        buyerName: "Venta en caja",
        buyerEmail: "caja@mansionplayroom.cl",
        eventId: params.eventId,
        subtotal: String(total),
        total: String(total),
        paymentStatus: "approved",
        paymentId: `CAJA-${params.opId}`,
        paymentMethod: params.paymentMethod,
        channel: "caja",
        operatorId: params.operatorId,
        registerId: params.registerId ?? null,
        emailSent: 1
        // no corresponde email al cliente en una venta presencial
      });
      const orderId = orderResult.insertId;
      for (const item of lineItems) {
        await db.insert(orderItems).values({
          orderId,
          ticketTypeId: item.ticketTypeId,
          quantity: item.quantity,
          unitPrice: String(item.unitPrice),
          totalPrice: String(item.unitPrice * item.quantity),
          unitCost: item.unitCost != null ? String(item.unitCost) : null
        });
        await db.update(ticketTypes).set({ soldCount: sql3`soldCount + ${item.quantity}` }).where(eq5(ticketTypes.id, item.ticketTypeId));
      }
      return { result: "applied" };
    }
  );
  return { result, conflictNote };
}

// server/caja/void.ts
init_schema();
init_ops();
import { eq as eq6 } from "drizzle-orm";
async function voidTicketCode(db, params) {
  const code = params.displayCode.trim().toUpperCase();
  const { result, conflictNote } = await applyOp(
    db,
    {
      id: params.opId,
      type: "void_code",
      eventId: params.eventId,
      operatorId: params.operatorId,
      registerId: params.registerId,
      targetType: "ticket",
      targetId: code,
      payload: { displayCode: code, reason: params.reason },
      clientAt: params.clientAt
    },
    async () => {
      const [ticket] = await db.select().from(tickets).where(eq6(tickets.displayCode, code)).limit(1);
      if (!ticket) return { result: "rejected", conflictNote: "El c\xF3digo no existe" };
      if (ticket.eventId !== params.eventId) return { result: "rejected", conflictNote: "El c\xF3digo no corresponde a este evento" };
      if (ticket.status === "cancelled") return { result: "rejected", conflictNote: "El c\xF3digo ya estaba anulado" };
      await db.update(tickets).set({ status: "cancelled" }).where(eq6(tickets.id, ticket.id));
      return { result: "applied" };
    }
  );
  return { result, conflictNote };
}

// server/routers.ts
var adminProcedure2 = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== "admin") throw new TRPCError3({ code: "FORBIDDEN", message: "Admin access required" });
  return next({ ctx });
});
var appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true };
    }),
    // Login simple por contraseña para el panel admin — no depende de ningún
    // OAuth externo, solo de la variable de entorno ADMIN_PASSWORD.
    adminLogin: publicProcedure.input(z2.object({ password: z2.string() })).mutation(async ({ input, ctx }) => {
      const adminPassword = process.env.ADMIN_PASSWORD;
      if (!adminPassword || input.password !== adminPassword) {
        throw new TRPCError3({ code: "UNAUTHORIZED", message: "Contrase\xF1a incorrecta" });
      }
      await upsertUser({ openId: ADMIN_LOCAL_OPEN_ID, name: "Admin", role: "admin", lastSignedIn: /* @__PURE__ */ new Date() });
      const sessionToken = await sdk.signSession({ openId: ADMIN_LOCAL_OPEN_ID, appId: "candyland-admin", name: "Admin" }, { expiresInMs: ONE_YEAR_MS });
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });
      return { success: true };
    })
  }),
  events: router({
    listPublished: publicProcedure.query(async () => {
      return getPublishedEvents();
    }),
    // Para la sección "Próximos Eventos" de la home: incluye publicados y pasados
    // (para mostrar el historial en blanco y negro junto a los próximos a color).
    listForHome: publicProcedure.query(async () => {
      return getHomeEvents();
    }),
    getBySlug: publicProcedure.input(z2.object({ slug: z2.string() })).query(async ({ input }) => {
      return getEventBySlug(input.slug);
    }),
    getTicketTypes: publicProcedure.input(z2.object({ slug: z2.string() })).query(async ({ input }) => {
      const event = await getEventBySlug(input.slug);
      if (!event) return [];
      return getTicketTypesByEventId(event.id);
    }),
    // Admin
    listAll: adminProcedure2.query(async () => {
      return getAllEvents();
    }),
    create: adminProcedure2.input(z2.object({
      title: z2.string(),
      slug: z2.string(),
      description: z2.string().optional(),
      shortDescription: z2.string().optional(),
      imageUrl: z2.string().optional(),
      venue: z2.string().optional(),
      address: z2.string().optional(),
      mapsUrl: z2.string().optional(),
      eventDate: z2.string(),
      doorsOpen: z2.string().optional(),
      status: z2.enum(["draft", "published", "soldout", "cancelled", "past"]).optional(),
      featured: z2.number().optional()
    })).mutation(async ({ input }) => {
      return createEvent(input);
    }),
    update: adminProcedure2.input(z2.object({
      id: z2.number(),
      title: z2.string().optional(),
      slug: z2.string().optional(),
      description: z2.string().optional(),
      shortDescription: z2.string().optional(),
      imageUrl: z2.string().optional(),
      venue: z2.string().optional(),
      address: z2.string().optional(),
      mapsUrl: z2.string().optional(),
      eventDate: z2.string().optional(),
      doorsOpen: z2.string().optional(),
      status: z2.enum(["draft", "published", "soldout", "cancelled", "past"]).optional(),
      featured: z2.number().optional()
    })).mutation(async ({ input }) => {
      const { id, ...data } = input;
      return updateEvent(id, data);
    }),
    delete: adminProcedure2.input(z2.object({ id: z2.number() })).mutation(async ({ input }) => {
      return deleteEvent(input.id);
    }),
    // Ticket types management
    listTicketTypes: adminProcedure2.input(z2.object({ eventId: z2.number() })).query(async ({ input }) => {
      return getTicketTypesByEventId(input.eventId);
    }),
    createTicketType: adminProcedure2.input(z2.object({
      eventId: z2.number(),
      name: z2.string(),
      accesoSlug: z2.enum(["duo", "duo_mujeres", "soltera", "soltero", "trio", "grupo", "cumpleaneros"]).optional(),
      category: z2.enum(["acceso", "extra"]).optional(),
      description: z2.string().optional(),
      price: z2.number(),
      originalPrice: z2.number().optional(),
      totalStock: z2.number(),
      maxPerOrder: z2.number().optional(),
      sortOrder: z2.number().optional(),
      status: z2.enum(["active", "soldout", "hidden"]).optional(),
      costPrice: z2.number().optional(),
      color: z2.string().optional(),
      internalCode: z2.string().optional()
    })).mutation(async ({ input }) => {
      return createTicketType(input);
    }),
    updateTicketType: adminProcedure2.input(z2.object({
      id: z2.number(),
      name: z2.string().optional(),
      accesoSlug: z2.enum(["duo", "duo_mujeres", "soltera", "soltero", "trio", "grupo", "cumpleaneros"]).optional(),
      category: z2.enum(["acceso", "extra"]).optional(),
      description: z2.string().optional(),
      price: z2.number().optional(),
      originalPrice: z2.number().optional(),
      totalStock: z2.number().optional(),
      maxPerOrder: z2.number().optional(),
      sortOrder: z2.number().optional(),
      status: z2.enum(["active", "soldout", "hidden"]).optional(),
      costPrice: z2.number().optional(),
      color: z2.string().optional(),
      internalCode: z2.string().optional()
    })).mutation(async ({ input }) => {
      const { id, ...data } = input;
      return updateTicketType(id, data);
    }),
    deleteTicketType: adminProcedure2.input(z2.object({ id: z2.number() })).mutation(async ({ input }) => {
      return deleteTicketType(input.id);
    })
  }),
  orders: router({
    validateDiscount: publicProcedure.input(z2.object({
      code: z2.string(),
      eventId: z2.number()
    })).mutation(async ({ input }) => {
      return validateDiscountCode(input.code, input.eventId);
    }),
    create: publicProcedure.input(z2.object({
      eventSlug: z2.string(),
      buyerName: z2.string(),
      buyerEmail: z2.string().email(),
      buyerPhone: z2.string().optional(),
      items: z2.array(z2.object({
        ticketTypeId: z2.number(),
        quantity: z2.number().min(1)
      })),
      discountCode: z2.string().optional(),
      ambassadorCode: z2.string().optional(),
      communityCode: z2.string().optional(),
      // Datos por asistente/tipo de acceso (JSON serializado). Se adjunta a la
      // preferencia de Mercado Pago como metadata; no requiere migración de schema.
      attendeeData: z2.string().optional()
    })).mutation(async ({ input }) => {
      const result = await createOrder(input);
      if (result.isFree) await confirmFreeOrder(result.orderNumber);
      return result;
    }),
    // Cobra una orden ya creada con el Payment Brick (tarjeta embebida, sin
    // modal/redirect de Mercado Pago). El monto se calcula server-side a
    // partir de la orden guardada, nunca del cliente.
    processCardPayment: publicProcedure.input(z2.object({
      orderNumber: z2.string(),
      token: z2.string(),
      paymentMethodId: z2.string(),
      issuerId: z2.union([z2.string(), z2.number()]).optional(),
      installments: z2.number().optional(),
      identificationType: z2.string().optional(),
      identificationNumber: z2.string().optional()
    })).mutation(async ({ input }) => {
      return processCardPaymentForOrder(input);
    }),
    // Admin
    listAll: adminProcedure2.input(z2.object({
      page: z2.number().optional(),
      limit: z2.number().optional(),
      status: z2.string().optional(),
      channel: z2.enum(["web", "caja"]).optional()
    }).optional()).query(async ({ input }) => {
      return getAllOrders(input?.page ?? 1, input?.limit ?? 50, input?.status, input?.channel);
    }),
    getStats: adminProcedure2.input(z2.object({ channel: z2.enum(["web", "caja"]).optional() }).optional()).query(async ({ input }) => {
      return getOrderStats(input?.channel);
    }),
    getTickets: adminProcedure2.input(z2.object({ orderId: z2.number() })).query(async ({ input }) => {
      return getOrderTickets(input.orderId);
    }),
    resendConfirmation: adminProcedure2.input(z2.object({ orderNumber: z2.string() })).mutation(async ({ input }) => {
      return resendConfirmationEmail(input.orderNumber);
    })
  }),
  mission300: router({
    status: adminProcedure2.input(z2.object({ eventId: z2.number() })).query(async ({ input }) => {
      return getMission300Status(input.eventId);
    }),
    evaluate: adminProcedure2.input(z2.object({ eventId: z2.number() })).mutation(async ({ input }) => {
      return evaluateMission300(input.eventId);
    })
  }),
  tickets: router({
    // Página pública "Mi entrada" (/verificar/:ticketCode) — de solo lectura,
    // el ticketCode ya funciona como token portador (viene del QR/email).
    getByCode: publicProcedure.input(z2.object({ ticketCode: z2.string() })).query(async ({ input }) => {
      return getTicketByCode(input.ticketCode);
    })
  }),
  discounts: router({
    listAll: adminProcedure2.query(async () => {
      return getAllDiscountCodes();
    }),
    create: adminProcedure2.input(z2.object({
      code: z2.string(),
      description: z2.string().optional(),
      discountType: z2.enum(["percentage", "fixed"]),
      discountValue: z2.number(),
      minPurchase: z2.number().optional(),
      maxUses: z2.number().optional(),
      eventId: z2.number().optional(),
      validFrom: z2.string().optional(),
      validUntil: z2.string().optional()
    })).mutation(async ({ input }) => {
      return createDiscountCode(input);
    }),
    update: adminProcedure2.input(z2.object({
      id: z2.number(),
      code: z2.string().optional(),
      description: z2.string().optional(),
      discountType: z2.enum(["percentage", "fixed"]).optional(),
      discountValue: z2.number().optional(),
      maxUses: z2.number().optional(),
      isActive: z2.number().optional(),
      validUntil: z2.string().optional()
    })).mutation(async ({ input }) => {
      const { id, ...data } = input;
      return updateDiscountCode(id, data);
    }),
    delete: adminProcedure2.input(z2.object({ id: z2.number() })).mutation(async ({ input }) => {
      return deleteDiscountCode(input.id);
    })
  }),
  settings: router({
    get: publicProcedure.query(async () => {
      return getSiteSettings();
    }),
    update: adminProcedure2.input(z2.object({
      instagramFollowers: z2.number().optional(),
      instagramPosts: z2.number().optional(),
      serviceFeePercent: z2.number().min(0).max(100).optional()
    })).mutation(async ({ input }) => {
      return updateSiteSettings(input);
    })
  }),
  communityCodes: router({
    validate: publicProcedure.input(z2.object({
      code: z2.string()
    })).mutation(async ({ input }) => {
      return validateCommunityCode(input.code);
    }),
    // Admin
    listAll: adminProcedure2.query(async () => {
      return getAllCommunityCodes();
    }),
    create: adminProcedure2.input(z2.object({
      code: z2.string(),
      label: z2.string().optional(),
      maxUses: z2.number().optional()
    })).mutation(async ({ input }) => {
      return createCommunityCode(input);
    }),
    update: adminProcedure2.input(z2.object({
      id: z2.number(),
      code: z2.string().optional(),
      label: z2.string().optional(),
      maxUses: z2.number().optional(),
      isActive: z2.number().optional()
    })).mutation(async ({ input }) => {
      const { id, ...data } = input;
      return updateCommunityCode(id, data);
    }),
    delete: adminProcedure2.input(z2.object({ id: z2.number() })).mutation(async ({ input }) => {
      return deleteCommunityCode(input.id);
    })
  }),
  referrals: router({
    getStats: adminProcedure2.query(async () => {
      return getReferralStats();
    }),
    getByUser: protectedProcedure.query(async ({ ctx }) => {
      return getUserReferrals(ctx.user.id);
    }),
    // Público, sin login: el mismo código de embajador que llega por email
    // es lo que valida el acceso a las propias estadísticas.
    getByCode: publicProcedure.input(z2.object({ code: z2.string() })).query(async ({ input }) => {
      return getReferralsByCode(input.code);
    }),
    // Público, para el Hall de la Fama -- solo primer nombre + código +
    // cantidad de ventas, nunca montos ni apellido (ver db.getReferralLeaderboard).
    getLeaderboard: publicProcedure.input(z2.object({ eventId: z2.number() })).query(async ({ input }) => {
      return getReferralLeaderboard(input.eventId);
    })
  }),
  // Módulo /caja — login por PIN de operadores (docs/ARQUITECTURA-CAJA.md
  // Fase 0). Sesión separada de auth.adminLogin: no toca `users` ni COOKIE_NAME.
  caja: router({
    // Enrolamiento de dispositivo (pedido explícito del usuario) -- sin
    // esto, ni siquiera se llega a la pantalla de PIN. publicProcedure a
    // propósito: todavía no hay ni operador ni dispositivo.
    deviceStatus: publicProcedure.query(({ ctx }) => {
      return ctx.device ? { enrolled: true, deviceName: ctx.device.name } : { enrolled: false };
    }),
    enrollDevice: publicProcedure.input(z2.object({ code: z2.string().min(1) })).mutation(async ({ input, ctx }) => {
      const code = input.code.trim().toUpperCase();
      const device = await getDeviceByEnrollCode(code);
      if (!device || device.enrolled || !device.enrollCodeExpiresAt || new Date(device.enrollCodeExpiresAt).getTime() < Date.now()) {
        throw new TRPCError3({ code: "UNAUTHORIZED", message: "C\xF3digo de enrolamiento inv\xE1lido o vencido" });
      }
      const token = generateDeviceToken();
      await completeDeviceEnrollment(device.id, hashDeviceToken(token));
      const sessionToken = await signDeviceSession(device.id);
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.cookie(CAJA_DEVICE_COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: DEVICE_SESSION_MS });
      return { success: true, deviceName: device.name };
    }),
    // Pantalla "toca tu nombre" (§10.2) — nunca expone pinHash. Requiere
    // dispositivo enrolado (deviceProcedure).
    listOperators: deviceProcedure.query(async () => {
      return listActiveOperatorsPublic();
    }),
    login: deviceProcedure.input(z2.object({ operatorId: z2.number(), pin: z2.string().min(4).max(8) })).mutation(async ({ input, ctx }) => {
      const forwardedFor = ctx.req.headers["x-forwarded-for"];
      const clientIp = (typeof forwardedFor === "string" ? forwardedFor.split(",")[0].trim() : forwardedFor?.[0]) || ctx.req.socket.remoteAddress || "unknown";
      const ipKey = `pin-login:${clientIp}`;
      if (!await checkIpRateLimit(ipKey)) {
        throw new TRPCError3({ code: "TOO_MANY_REQUESTS", message: "Demasiados intentos desde este dispositivo. Intenta de nuevo m\xE1s tarde." });
      }
      const operator = await getOperatorById(input.operatorId);
      if (!operator || !operator.active) {
        await recordIpFailedAttempt(ipKey);
        throw new TRPCError3({ code: "UNAUTHORIZED", message: "PIN incorrecto" });
      }
      if (operator.lockedUntil && new Date(operator.lockedUntil).getTime() > Date.now()) {
        const minutesLeft = Math.ceil((new Date(operator.lockedUntil).getTime() - Date.now()) / 6e4);
        throw new TRPCError3({ code: "TOO_MANY_REQUESTS", message: `Demasiados intentos. Intenta de nuevo en ${minutesLeft} min.` });
      }
      if (!verifyPin(input.pin, operator.pinHash)) {
        await recordFailedPinAttempt(operator.id);
        await recordIpFailedAttempt(ipKey);
        throw new TRPCError3({ code: "UNAUTHORIZED", message: "PIN incorrecto" });
      }
      await resetPinAttempts(operator.id);
      const sessionToken = await signOperatorSession({ operatorId: operator.id, role: operator.role, name: operator.name });
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.cookie(CAJA_COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: CAJA_SESSION_MS });
      return { id: operator.id, name: operator.name, role: operator.role };
    }),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(CAJA_COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true };
    }),
    me: publicProcedure.query(({ ctx }) => ctx.operator),
    // Pantallas de /caja (docs/ARQUITECTURA-CAJA.md Fase 2) — todas requieren
    // sesión de operador vigente.
    activeEvent: operatorProcedure.query(async () => {
      return getActiveEventForCaja();
    }),
    search: operatorProcedure.input(z2.object({ eventId: z2.number(), query: z2.string() })).query(async ({ input }) => {
      return searchCajaCustomers(input.eventId, input.query);
    }),
    customerSheet: operatorProcedure.input(z2.object({ orderId: z2.number() })).query(async ({ input }) => {
      return getCajaCustomerSheet(input.orderId);
    }),
    catalog: operatorProcedure.input(z2.object({ eventId: z2.number() })).query(async ({ input }) => {
      return getCajaCatalog(input.eventId);
    }),
    dashboard: operatorProcedure.input(z2.object({ eventId: z2.number() })).query(async ({ input }) => {
      return getCajaDashboard(input.eventId);
    }),
    // Descarga completa para el modo offline (docs/ARQUITECTURA-CAJA.md
    // §6.2) -- la tablet la guarda en IndexedDB al abrir turno y la
    // refresca cada 60s cuando hay conexión.
    snapshot: operatorProcedure.input(z2.object({ eventId: z2.number() })).query(async ({ input }) => {
      return getCajaSnapshot(input.eventId);
    }),
    // Procesa un lote de operaciones encoladas offline (§7) -- reutiliza
    // exactamente la misma lógica idempotente (applyOp) que los endpoints
    // online `redeem`/`sale`, así que reenviar el mismo opId nunca duplica nada.
    sync: operatorProcedure.input(z2.object({
      eventId: z2.number(),
      registerId: z2.number().optional(),
      ops: z2.array(z2.discriminatedUnion("type", [
        z2.object({ type: z2.literal("redeem"), opId: z2.string(), displayCode: z2.string(), clientAt: z2.string() }),
        z2.object({ type: z2.literal("sale"), opId: z2.string(), items: z2.array(z2.object({ ticketTypeId: z2.number(), quantity: z2.number().min(1) })).min(1), paymentMethod: z2.enum(["efectivo", "debito", "credito"]), clientAt: z2.string() })
      ])).max(50)
    })).mutation(async ({ input, ctx }) => {
      const rawDb = await getDb();
      if (!rawDb) throw new TRPCError3({ code: "INTERNAL_SERVER_ERROR", message: "Base de datos no disponible" });
      const results = {};
      for (const op of input.ops) {
        try {
          if (op.type === "redeem") {
            results[op.opId] = await redeemDisplayCode(rawDb, {
              opId: op.opId,
              displayCode: op.displayCode,
              eventId: input.eventId,
              operatorId: ctx.operator.operatorId,
              registerId: input.registerId,
              clientAt: new Date(op.clientAt)
            });
          } else {
            results[op.opId] = await createCajaSale(rawDb, {
              opId: op.opId,
              eventId: input.eventId,
              operatorId: ctx.operator.operatorId,
              registerId: input.registerId,
              items: op.items,
              paymentMethod: op.paymentMethod,
              clientAt: new Date(op.clientAt)
            });
          }
        } catch (err) {
          results[op.opId] = { result: "rejected", conflictNote: err instanceof Error ? err.message : "Error al sincronizar" };
        }
      }
      return results;
    }),
    // Selección de caja física al abrir turno (§10.2.1).
    listRegisters: operatorProcedure.query(async () => {
      return listActiveRegisters();
    }),
    shiftOpen: operatorProcedure.input(z2.object({ opId: z2.string(), eventId: z2.number(), registerId: z2.number().optional(), clientAt: z2.string() })).mutation(async ({ input, ctx }) => {
      const rawDb = await getDb();
      if (!rawDb) throw new TRPCError3({ code: "INTERNAL_SERVER_ERROR", message: "Base de datos no disponible" });
      if (!ctx.operator) throw new TRPCError3({ code: "UNAUTHORIZED" });
      const { applyOp: applyOp2 } = await Promise.resolve().then(() => (init_ops(), ops_exports));
      return applyOp2(rawDb, {
        id: input.opId,
        type: "shift_open",
        eventId: input.eventId,
        operatorId: ctx.operator.operatorId,
        registerId: input.registerId,
        targetType: "operator",
        targetId: String(ctx.operator.operatorId),
        payload: null,
        clientAt: new Date(input.clientAt)
      }, async () => ({ result: "applied" }));
    }),
    // Protocolo de pendientes (§13, riesgo 2): el cliente NO debe llamar esto
    // con ops sin sincronizar -- se bloquea en la UI, no acá, porque cerrar
    // el turno es una decisión operativa, no algo que el servidor pueda ver.
    shiftClose: operatorProcedure.input(z2.object({ opId: z2.string(), eventId: z2.number(), registerId: z2.number().optional(), clientAt: z2.string() })).mutation(async ({ input, ctx }) => {
      const rawDb = await getDb();
      if (!rawDb) throw new TRPCError3({ code: "INTERNAL_SERVER_ERROR", message: "Base de datos no disponible" });
      if (!ctx.operator) throw new TRPCError3({ code: "UNAUTHORIZED" });
      const summary = await getShiftSummary(input.eventId, ctx.operator.operatorId, input.registerId);
      const { applyOp: applyOp2 } = await Promise.resolve().then(() => (init_ops(), ops_exports));
      await applyOp2(rawDb, {
        id: input.opId,
        type: "shift_close",
        eventId: input.eventId,
        operatorId: ctx.operator.operatorId,
        registerId: input.registerId,
        targetType: "operator",
        targetId: String(ctx.operator.operatorId),
        payload: summary,
        clientAt: new Date(input.clientAt)
      }, async () => ({ result: "applied" }));
      return summary;
    }),
    // Anulación con motivo -- solo supervisor/admin (docs/ARQUITECTURA-CAJA.md §3.2).
    voidCode: supervisorProcedure.input(z2.object({
      opId: z2.string(),
      eventId: z2.number(),
      displayCode: z2.string().min(1),
      reason: z2.string().min(3, "El motivo es obligatorio"),
      registerId: z2.number().optional(),
      clientAt: z2.string()
    })).mutation(async ({ input, ctx }) => {
      const rawDb = await getDb();
      if (!rawDb) throw new TRPCError3({ code: "INTERNAL_SERVER_ERROR", message: "Base de datos no disponible" });
      if (!ctx.operator) throw new TRPCError3({ code: "UNAUTHORIZED" });
      return voidTicketCode(rawDb, {
        opId: input.opId,
        displayCode: input.displayCode,
        eventId: input.eventId,
        operatorId: ctx.operator.operatorId,
        registerId: input.registerId,
        reason: input.reason,
        clientAt: new Date(input.clientAt)
      });
    }),
    // Cola de conflictos para el supervisor (§8): canjes dobles todavía sin
    // revisar. "Resuelto" = existe un op manual_adjust posterior que lo referencia.
    conflictQueue: supervisorProcedure.input(z2.object({ eventId: z2.number() })).query(async ({ input }) => {
      return getConflictQueue(input.eventId);
    }),
    resolveConflict: supervisorProcedure.input(z2.object({
      opId: z2.string(),
      eventId: z2.number(),
      conflictOpId: z2.string(),
      note: z2.string().optional(),
      clientAt: z2.string()
    })).mutation(async ({ input, ctx }) => {
      const rawDb = await getDb();
      if (!rawDb) throw new TRPCError3({ code: "INTERNAL_SERVER_ERROR", message: "Base de datos no disponible" });
      if (!ctx.operator) throw new TRPCError3({ code: "UNAUTHORIZED" });
      return resolveConflict(rawDb, {
        opId: input.opId,
        eventId: input.eventId,
        operatorId: ctx.operator.operatorId,
        conflictOpId: input.conflictOpId,
        note: input.note,
        clientAt: new Date(input.clientAt)
      });
    }),
    redeem: operatorProcedure.input(z2.object({
      opId: z2.string(),
      eventId: z2.number(),
      displayCode: z2.string().min(1),
      registerId: z2.number().optional(),
      clientAt: z2.string()
    })).mutation(async ({ input, ctx }) => {
      const rawDb = await getDb();
      if (!rawDb) throw new TRPCError3({ code: "INTERNAL_SERVER_ERROR", message: "Base de datos no disponible" });
      return redeemDisplayCode(rawDb, {
        opId: input.opId,
        displayCode: input.displayCode,
        eventId: input.eventId,
        operatorId: ctx.operator.operatorId,
        registerId: input.registerId,
        clientAt: new Date(input.clientAt)
      });
    }),
    sale: operatorProcedure.input(z2.object({
      opId: z2.string(),
      eventId: z2.number(),
      items: z2.array(z2.object({ ticketTypeId: z2.number(), quantity: z2.number().min(1) })).min(1),
      paymentMethod: z2.enum(["efectivo", "debito", "credito"]),
      registerId: z2.number().optional(),
      clientAt: z2.string()
    })).mutation(async ({ input, ctx }) => {
      const rawDb = await getDb();
      if (!rawDb) throw new TRPCError3({ code: "INTERNAL_SERVER_ERROR", message: "Base de datos no disponible" });
      try {
        return await createCajaSale(rawDb, {
          opId: input.opId,
          eventId: input.eventId,
          operatorId: ctx.operator.operatorId,
          registerId: input.registerId,
          items: input.items,
          paymentMethod: input.paymentMethod,
          clientAt: new Date(input.clientAt)
        });
      } catch (err) {
        throw new TRPCError3({ code: "BAD_REQUEST", message: err instanceof Error ? err.message : "No se pudo registrar la venta" });
      }
    })
  }),
  // Gestión de operadores desde /admin (docs/ARQUITECTURA-CAJA.md §11).
  operators: router({
    listAll: adminProcedure2.query(async () => {
      return listAllOperators();
    }),
    create: adminProcedure2.input(z2.object({
      name: z2.string().min(1),
      pin: z2.string().min(4).max(8),
      role: z2.enum(["admin", "supervisor", "caja", "barra", "acceso"])
    })).mutation(async ({ input }) => {
      const id = await createOperator({ name: input.name, pinHash: hashPin(input.pin), role: input.role });
      return { id };
    }),
    update: adminProcedure2.input(z2.object({
      id: z2.number(),
      name: z2.string().min(1).optional(),
      pin: z2.string().min(4).max(8).optional(),
      role: z2.enum(["admin", "supervisor", "caja", "barra", "acceso"]).optional(),
      active: z2.number().min(0).max(1).optional()
    })).mutation(async ({ input }) => {
      const { id, pin, ...rest } = input;
      await updateOperator(id, { ...rest, ...pin ? { pinHash: hashPin(pin) } : {} });
      return { success: true };
    })
  }),
  // Base de datos de clientes desde /admin (pedido explícito del usuario).
  customers: router({
    listAll: adminProcedure2.input(z2.object({
      search: z2.string().optional(),
      accessType: z2.string().optional(),
      tag: z2.string().optional()
    }).optional()).query(async ({ input }) => {
      return listCustomers(input ?? {});
    }),
    addTag: adminProcedure2.input(z2.object({ customerId: z2.number(), tag: z2.string().min(1) })).mutation(async ({ input }) => {
      await addCustomerTag(input.customerId, input.tag);
      return { success: true };
    }),
    removeTag: adminProcedure2.input(z2.object({ customerId: z2.number(), tag: z2.string() })).mutation(async ({ input }) => {
      await removeCustomerTag(input.customerId, input.tag);
      return { success: true };
    }),
    updateNotes: adminProcedure2.input(z2.object({ customerId: z2.number(), notes: z2.string() })).mutation(async ({ input }) => {
      await updateCustomerNotes(input.customerId, input.notes);
      return { success: true };
    })
  }),
  // Enrolamiento de dispositivos desde /admin (pedido explícito del usuario).
  devices: router({
    listAll: adminProcedure2.query(async () => {
      return listAllDevices();
    }),
    // Genera un código de un solo uso (vence a las 24h) para enrolar una
    // tablet nueva -- se muestra una sola vez en el admin, no se puede
    // recuperar después (mismo criterio que un PIN).
    create: adminProcedure2.input(z2.object({ name: z2.string().min(1) })).mutation(async ({ input }) => {
      const code = generateEnrollCode();
      const id = await createDeviceEnrollment(input.name, code, enrollCodeExpiry());
      return { id, enrollCode: code };
    }),
    setActive: adminProcedure2.input(z2.object({ id: z2.number(), active: z2.number().min(0).max(1) })).mutation(async ({ input }) => {
      await updateDeviceActive(input.id, input.active);
      return { success: true };
    })
  }),
  // Cajas físicas ("Caja 1", "Caja 2"...) desde /admin.
  registers: router({
    listAll: adminProcedure2.query(async () => {
      return listAllRegisters();
    }),
    create: adminProcedure2.input(z2.object({ name: z2.string().min(1) })).mutation(async ({ input }) => {
      const id = await createRegister(input.name);
      return { id };
    })
  }),
  // Reportes y auditoría de /caja desde /admin (docs/ARQUITECTURA-CAJA.md §11, Fase 4).
  cajaReports: router({
    profit: adminProcedure2.input(z2.object({ eventId: z2.number() })).query(async ({ input }) => {
      return getProfitReport(input.eventId);
    }),
    eventComparison: adminProcedure2.query(async () => {
      return getEventComparison();
    }),
    peakHours: adminProcedure2.input(z2.object({ eventId: z2.number() })).query(async ({ input }) => {
      return getPeakHours(input.eventId);
    }),
    ledger: adminProcedure2.input(z2.object({
      eventId: z2.number(),
      operatorId: z2.number().optional(),
      type: z2.string().optional(),
      dateFrom: z2.string().optional(),
      dateTo: z2.string().optional()
    })).query(async ({ input }) => {
      const { eventId, ...filters } = input;
      return getLedger(eventId, filters);
    })
  })
});

// server/_core/context.ts
import { parse as parseCookieHeader3 } from "cookie";
async function createContext(opts) {
  let user = null;
  try {
    user = await sdk.authenticateRequest(opts.req);
  } catch (error) {
    user = null;
  }
  const cookies = parseCookieHeader3(opts.req.headers.cookie ?? "");
  const sessionPayload = await verifyOperatorSession(cookies[CAJA_COOKIE_NAME]);
  let operator = null;
  if (sessionPayload) {
    const dbOperator = await getOperatorById(sessionPayload.operatorId);
    if (dbOperator && dbOperator.active) {
      operator = { operatorId: dbOperator.id, role: dbOperator.role, name: dbOperator.name };
    }
  }
  const deviceSessionPayload = await verifyDeviceSession(cookies[CAJA_DEVICE_COOKIE_NAME]);
  let device = null;
  if (deviceSessionPayload) {
    const dbDevice = await getDeviceById(deviceSessionPayload.deviceId);
    if (dbDevice && dbDevice.enrolled && dbDevice.active) {
      device = { deviceId: dbDevice.id, name: dbDevice.name };
    }
  }
  return {
    req: opts.req,
    res: opts.res,
    user,
    operator,
    device
  };
}

// server/_core/app.ts
function createApp() {
  const app = express();
  app.use(express.json({ limit: "10mb" }));
  app.use(express.urlencoded({ limit: "10mb", extended: true }));
  registerOAuthRoutes(app);
  registerAdminRoutes(app);
  registerTicketAssetRoutes(app);
  app.use(webhooksRouter);
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext
    })
  );
  return app;
}

// server/vercel-entry.ts
var vercel_entry_default = createApp();
export {
  vercel_entry_default as default
};
