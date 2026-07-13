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
var schema_exports = {};
__export(schema_exports, {
  communityCodes: () => communityCodes,
  discountCodes: () => discountCodes,
  events: () => events,
  orderItems: () => orderItems,
  orders: () => orders,
  referrals: () => referrals,
  siteSettings: () => siteSettings,
  ticketTypes: () => ticketTypes,
  tickets: () => tickets,
  users: () => users
});
import { int, mysqlEnum, mysqlTable, text, timestamp, varchar, decimal } from "drizzle-orm/mysql-core";
var users, events, ticketTypes, orders, orderItems, tickets, discountCodes, communityCodes, siteSettings, referrals;
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
      total: decimal("total", { precision: 10, scale: 0 }).notNull(),
      discountCodeId: int("discountCodeId"),
      ambassadorCode: varchar("ambassadorCode", { length: 32 }),
      paymentStatus: mysqlEnum("paymentStatus", ["pending", "approved", "rejected", "refunded"]).default("pending").notNull(),
      paymentId: varchar("paymentId", { length: 255 }),
      paymentMethod: varchar("paymentMethod", { length: 64 }),
      mercadoPagoPreferenceId: varchar("mercadoPagoPreferenceId", { length: 255 }),
      emailSent: int("emailSent").default(0).notNull(),
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
      updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull()
    });
    referrals = mysqlTable("referrals", {
      id: int("id").autoincrement().primaryKey(),
      ambassadorUserId: int("ambassadorUserId").notNull(),
      ambassadorCode: varchar("ambassadorCode", { length: 32 }).notNull(),
      orderId: int("orderId").notNull(),
      buyerEmail: varchar("buyerEmail", { length: 320 }).notNull(),
      ticketCount: int("ticketCount").notNull(),
      orderTotal: decimal("orderTotal", { precision: 10, scale: 0 }).notNull(),
      createdAt: timestamp("createdAt").defaultNow().notNull()
    });
  }
});

// server/_core/app.ts
import express from "express";
import { createExpressMiddleware } from "@trpc/server/adapters/express";

// shared/const.ts
var COOKIE_NAME = "app_session_id";
var ONE_YEAR_MS = 1e3 * 60 * 60 * 24 * 365;
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
import { eq, desc, and, sql, or, gte, lte } from "drizzle-orm";
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
async function createPaymentPreference(input) {
  const client = getClient();
  if (!client) {
    console.warn("[MercadoPago] Using mock checkout URL (no access token)");
    return {
      id: "mock-preference-" + input.orderNumber,
      initPoint: `/pago/exito?order=${input.orderNumber}&mock=true`
    };
  }
  const preference = new Preference(client);
  const baseUrl = process.env.APP_URL || "https://mansionplayroom.cl";
  const result = await preference.create({
    body: {
      items: input.items.map((item) => ({
        id: input.orderNumber,
        title: item.title,
        quantity: item.quantity,
        unit_price: item.unitPrice,
        currency_id: "CLP"
      })),
      payer: {
        email: input.buyerEmail,
        name: input.buyerName
      },
      back_urls: {
        success: `${baseUrl}/pago/exito?order=${input.orderNumber}`,
        failure: `${baseUrl}/pago/error?order=${input.orderNumber}`,
        pending: `${baseUrl}/pago/exito?order=${input.orderNumber}&pending=true`
      },
      auto_return: "approved",
      external_reference: input.orderNumber,
      notification_url: `${baseUrl}/api/webhooks/mercadopago`,
      statement_descriptor: "MANSION PLAYROOM",
      metadata: input.attendeeData ? { attendee_data: input.attendeeData } : void 0
    }
  });
  return {
    id: result.id,
    initPoint: result.init_point
  };
}
async function getPaymentInfo(paymentId) {
  const client = getClient();
  if (!client) return null;
  const payment = new Payment(client);
  const result = await payment.get({ id: paymentId });
  return result;
}

// server/db.ts
var _db = null;
async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
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
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : void 0;
}
async function getPublishedEvents() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(events).where(eq(events.status, "published")).orderBy(events.eventDate);
}
async function getAllEvents() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(events).orderBy(desc(events.createdAt));
}
async function getHomeEvents() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(events).where(or(eq(events.status, "published"), eq(events.status, "past"), eq(events.status, "soldout"))).orderBy(events.eventDate);
}
async function getEventBySlug(slug) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(events).where(eq(events.slug, slug)).limit(1);
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
  await db.update(events).set(updateData).where(eq(events.id, id));
  return { success: true };
}
async function deleteEvent(id) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(events).where(eq(events.id, id));
  return { success: true };
}
async function getTicketTypesByEventId(eventId) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(ticketTypes).where(eq(ticketTypes.eventId, eventId)).orderBy(ticketTypes.sortOrder);
}
async function createTicketType(data) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(ticketTypes).values({
    ...data,
    price: String(data.price),
    originalPrice: data.originalPrice ? String(data.originalPrice) : void 0
  });
  return { success: true };
}
async function updateTicketType(id, data) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const updateData = { ...data };
  if (data.price !== void 0) updateData.price = String(data.price);
  if (data.originalPrice !== void 0) updateData.originalPrice = String(data.originalPrice);
  await db.update(ticketTypes).set(updateData).where(eq(ticketTypes.id, id));
  return { success: true };
}
async function deleteTicketType(id) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(ticketTypes).where(eq(ticketTypes.id, id));
  return { success: true };
}
async function validateDiscountCode(code, eventId) {
  const db = await getDb();
  if (!db) return { valid: false, message: "Service unavailable" };
  const result = await db.select().from(discountCodes).where(eq(discountCodes.code, code)).limit(1);
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
  await db.update(discountCodes).set(updateData).where(eq(discountCodes.id, id));
  return { success: true };
}
async function deleteDiscountCode(id) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(discountCodes).where(eq(discountCodes.id, id));
  return { success: true };
}
async function validateCommunityCode(code) {
  const db = await getDb();
  if (!db) return { valid: false, message: "Service unavailable" };
  const result = await db.select().from(communityCodes).where(eq(communityCodes.code, code)).limit(1);
  if (result.length === 0) return { valid: false, message: "C\xF3digo no encontrado" };
  const entry = result[0];
  if (!entry.isActive) return { valid: false, message: "C\xF3digo inactivo" };
  if (entry.maxUses && entry.usedCount >= entry.maxUses) return { valid: false, message: "C\xF3digo agotado" };
  return { valid: true, communityCode: entry };
}
async function markCommunityCodeUsed(id) {
  const db = await getDb();
  if (!db) return;
  await db.update(communityCodes).set({ usedCount: sql`usedCount + 1` }).where(eq(communityCodes.id, id));
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
  await db.update(communityCodes).set(data).where(eq(communityCodes.id, id));
  return { success: true };
}
async function deleteCommunityCode(id) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(communityCodes).where(eq(communityCodes.id, id));
  return { success: true };
}
async function getSiteSettings() {
  const db = await getDb();
  if (!db) return { instagramFollowers: 0, instagramPosts: 0 };
  const [row] = await db.select().from(siteSettings).limit(1);
  if (row) return row;
  return { instagramFollowers: 0, instagramPosts: 0 };
}
async function updateSiteSettings(data) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [row] = await db.select().from(siteSettings).limit(1);
  if (row) {
    await db.update(siteSettings).set(data).where(eq(siteSettings.id, row.id));
  } else {
    await db.insert(siteSettings).values({ instagramFollowers: 0, instagramPosts: 0, ...data });
  }
  return { success: true };
}
async function createOrder(input) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const event = await getEventBySlug(input.eventSlug);
  if (!event) throw new Error("Event not found");
  const tts = await getTicketTypesByEventId(event.id);
  let subtotal = 0;
  for (const item of input.items) {
    const tt = tts.find((t2) => t2.id === item.ticketTypeId);
    if (!tt) throw new Error(`Ticket type ${item.ticketTypeId} not found`);
    const available = tt.totalStock - tt.soldCount;
    if (item.quantity > available) throw new Error(`Not enough stock for ${tt.name}`);
    subtotal += Number(tt.price) * item.quantity;
  }
  let discountAmount = 0;
  let discountCodeId;
  if (input.discountCode) {
    const validation = await validateDiscountCode(input.discountCode, event.id);
    if (validation.valid && validation.discount) {
      const disc = validation.discount;
      discountCodeId = disc.id;
      if (disc.discountType === "percentage") {
        discountAmount = Math.round(subtotal * Number(disc.discountValue) / 100);
      } else {
        discountAmount = Number(disc.discountValue);
      }
      await db.update(discountCodes).set({ usedCount: sql`usedCount + 1` }).where(eq(discountCodes.id, disc.id));
    }
  }
  if (input.communityCode) {
    const validation = await validateCommunityCode(input.communityCode);
    if (!validation.valid) throw new Error(validation.message || "C\xF3digo de comunidad inv\xE1lido");
    if (validation.communityCode) await markCommunityCodeUsed(validation.communityCode.id);
  }
  const total = Math.max(0, subtotal - discountAmount);
  const orderNumber = `MP-${Date.now().toString(36).toUpperCase()}-${nanoid(4).toUpperCase()}`;
  const [orderResult] = await db.insert(orders).values({
    orderNumber,
    buyerName: input.buyerName,
    buyerEmail: input.buyerEmail,
    buyerPhone: input.buyerPhone,
    eventId: event.id,
    subtotal: String(subtotal),
    discount: String(discountAmount),
    total: String(total),
    discountCodeId,
    ambassadorCode: input.ambassadorCode,
    paymentStatus: "pending"
  });
  const orderId = orderResult.insertId;
  for (const item of input.items) {
    const tt = tts.find((t2) => t2.id === item.ticketTypeId);
    await db.insert(orderItems).values({
      orderId,
      ticketTypeId: item.ticketTypeId,
      quantity: item.quantity,
      unitPrice: tt.price,
      totalPrice: String(Number(tt.price) * item.quantity)
    });
    await db.update(ticketTypes).set({ soldCount: sql`soldCount + ${item.quantity}` }).where(eq(ticketTypes.id, item.ticketTypeId));
  }
  const mpItems = [];
  for (const item of input.items) {
    const tt = tts.find((t2) => t2.id === item.ticketTypeId);
    mpItems.push({
      title: `${tt.name} - ${event.title}`,
      quantity: item.quantity,
      unitPrice: Number(tt.price)
    });
  }
  const preference = await createPaymentPreference({
    orderNumber,
    items: mpItems,
    buyerEmail: input.buyerEmail,
    buyerName: input.buyerName,
    total,
    attendeeData: input.attendeeData
  });
  if (preference.id) {
    await db.update(orders).set({ mercadoPagoPreferenceId: preference.id }).where(eq(orders.orderNumber, orderNumber));
  }
  const checkoutUrl = preference.initPoint || `/pago/exito?order=${orderNumber}`;
  return { orderId, orderNumber, checkoutUrl, total, preferenceId: preference.id };
}
async function getAllOrders(page = 1, limit = 50, status) {
  const db = await getDb();
  if (!db) return { orders: [], total: 0 };
  const offset = (page - 1) * limit;
  const conditions = status ? [eq(orders.paymentStatus, status)] : [];
  const query = db.select().from(orders).where(conditions.length ? and(...conditions) : void 0).orderBy(desc(orders.createdAt)).limit(limit).offset(offset);
  const allOrders = await query;
  return { orders: allOrders, total: allOrders.length };
}
async function getOrdersForExport(filters) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [];
  if (filters.eventId) conditions.push(eq(orders.eventId, filters.eventId));
  if (filters.status) conditions.push(eq(orders.paymentStatus, filters.status));
  if (filters.dateFrom) conditions.push(gte(orders.createdAt, new Date(filters.dateFrom)));
  if (filters.dateTo) conditions.push(lte(orders.createdAt, new Date(filters.dateTo)));
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
  }).from(orders).leftJoin(events, eq(orders.eventId, events.id)).where(conditions.length ? and(...conditions) : void 0).orderBy(desc(orders.createdAt));
  return rows;
}
async function getOrderStats() {
  const db = await getDb();
  if (!db) return { totalOrders: 0, totalRevenue: 0, approvedOrders: 0 };
  const [stats] = await db.select({
    totalOrders: sql`COUNT(*)`,
    totalRevenue: sql`COALESCE(SUM(CASE WHEN paymentStatus = 'approved' THEN total ELSE 0 END), 0)`,
    approvedOrders: sql`SUM(CASE WHEN paymentStatus = 'approved' THEN 1 ELSE 0 END)`
  }).from(orders);
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
  return db.select().from(referrals).where(eq(referrals.ambassadorUserId, userId)).orderBy(desc(referrals.createdAt));
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
function registerAdminRoutes(app) {
  app.get("/api/admin/orders/export.csv", async (req, res) => {
    if (!await requireAdmin(req, res)) return;
    const { eventId, dateFrom, dateTo, status } = req.query;
    const rows = await getOrdersForExport({
      eventId: eventId ? Number(eventId) : void 0,
      dateFrom,
      dateTo,
      status
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
var adminProcedure2 = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== "admin") throw new TRPCError3({ code: "FORBIDDEN", message: "Admin access required" });
  return next({ ctx });
});
var ADMIN_LOCAL_OPEN_ID = "admin-local";
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
      const sessionToken = await sdk.createSessionToken(ADMIN_LOCAL_OPEN_ID, { name: "Admin" });
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
    createTicketType: adminProcedure2.input(z2.object({
      eventId: z2.number(),
      name: z2.string(),
      description: z2.string().optional(),
      price: z2.number(),
      originalPrice: z2.number().optional(),
      totalStock: z2.number(),
      maxPerOrder: z2.number().optional(),
      sortOrder: z2.number().optional(),
      status: z2.enum(["active", "soldout", "hidden"]).optional()
    })).mutation(async ({ input }) => {
      return createTicketType(input);
    }),
    updateTicketType: adminProcedure2.input(z2.object({
      id: z2.number(),
      name: z2.string().optional(),
      description: z2.string().optional(),
      price: z2.number().optional(),
      originalPrice: z2.number().optional(),
      totalStock: z2.number().optional(),
      maxPerOrder: z2.number().optional(),
      sortOrder: z2.number().optional(),
      status: z2.enum(["active", "soldout", "hidden"]).optional()
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
      return createOrder(input);
    }),
    // Admin
    listAll: adminProcedure2.input(z2.object({
      page: z2.number().optional(),
      limit: z2.number().optional(),
      status: z2.string().optional()
    }).optional()).query(async ({ input }) => {
      return getAllOrders(input?.page ?? 1, input?.limit ?? 50, input?.status);
    }),
    getStats: adminProcedure2.query(async () => {
      return getOrderStats();
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
      instagramPosts: z2.number().optional()
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
    })
  })
});

// server/webhooks.ts
import { Router } from "express";
init_schema();
import { eq as eq2, sql as sql2 } from "drizzle-orm";
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
function buildConfirmationEmail(data) {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background-color:#FBF0F3;font-family:'Helvetica Neue',Arial,sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:40px 20px;">
    <!-- Header -->
    <div style="text-align:center;margin-bottom:32px;">
      <h1 style="color:#D9538F;font-size:28px;margin:0;letter-spacing:1px;">CANDYLAND</h1>
      <p style="color:#8A7580;font-size:14px;margin-top:8px;">Confirmaci\xF3n de Compra</p>
    </div>

    <!-- Main Card -->
    <div style="background-color:#FFFFFF;border-radius:20px;padding:32px;border:1px solid #F2D9E4;">
      <h2 style="color:#3D2A35;font-size:22px;margin:0 0 8px;">\xA1Hola ${data.buyerName}! \u{1F36D}</h2>
      <p style="color:#7A6670;font-size:15px;margin:0 0 24px;">Tu compra ha sido confirmada exitosamente.</p>

      <!-- Event Info -->
      <div style="background-color:#FBF0F3;border-radius:14px;padding:20px;margin-bottom:24px;">
        <h3 style="color:#D9538F;font-size:18px;margin:0 0 12px;">${data.eventTitle}</h3>
        <p style="color:#5C4A54;font-size:14px;margin:4px 0;">\u{1F4C5} ${data.eventDate}</p>
        <p style="color:#5C4A54;font-size:14px;margin:4px 0;">\u{1F4CD} ${data.venue}</p>
        <p style="color:#9A8A92;font-size:12px;margin:8px 0 0;">Orden: ${data.orderNumber}</p>
      </div>

      <!-- Items -->
      <div style="margin-bottom:24px;">
        <h4 style="color:#3D2A35;font-size:14px;text-transform:uppercase;letter-spacing:1px;margin:0 0 12px;">Detalle de compra</h4>
        ${data.items.map((item) => `
          <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #F2D9E4;">
            <span style="color:#5C4A54;font-size:14px;">${item.quantity}x ${item.name}</span>
            <span style="color:#3D2A35;font-size:14px;">$${item.price.toLocaleString("es-CL")}</span>
          </div>
        `).join("")}
        <div style="display:flex;justify-content:space-between;padding:12px 0;margin-top:8px;">
          <span style="color:#3D2A35;font-size:16px;font-weight:bold;">Total</span>
          <span style="color:#D9538F;font-size:18px;font-weight:bold;">$${data.total.toLocaleString("es-CL")}</span>
        </div>
      </div>

      <!-- QR Code -->
      <div style="text-align:center;margin-bottom:24px;background-color:#FBF0F3;border-radius:14px;padding:24px;">
        <h4 style="color:#3D2A35;font-size:14px;text-transform:uppercase;letter-spacing:1px;margin:0 0 16px;">Tu Entrada</h4>
        <img src="${data.qrImageUrl}" alt="QR Code" style="width:200px;height:200px;border-radius:8px;background:#fff;padding:8px;" />
        <p style="color:#8A7580;font-size:12px;margin-top:12px;">Presenta este c\xF3digo QR en la entrada del evento</p>
        ${data.ticketCodes.map((code) => `<p style="color:#9A8A92;font-size:11px;font-family:monospace;margin:4px 0;">${code}</p>`).join("")}
      </div>

      <!-- Ambassador Code -->
      <div style="background:linear-gradient(135deg,#E8A0C4,#C4A8E0);border-radius:14px;padding:20px;text-align:center;">
        <h4 style="color:#fff;font-size:14px;text-transform:uppercase;letter-spacing:1px;margin:0 0 8px;">Tu C\xF3digo de Embajador</h4>
        <p style="color:#fff;font-size:28px;font-weight:bold;font-family:monospace;margin:0;">${data.ambassadorCode}</p>
        <p style="color:rgba(255,255,255,0.85);font-size:12px;margin-top:8px;">Comparte este c\xF3digo con tus amigos. Por cada compra con tu c\xF3digo, acumulas premios.</p>
      </div>
    </div>

    <!-- Footer -->
    <div style="text-align:center;margin-top:32px;">
      <p style="color:#9A8A92;font-size:12px;">\xA9 ${(/* @__PURE__ */ new Date()).getFullYear()} Mansion Playroom. Todos los derechos reservados.</p>
      <p style="color:#9A8A92;font-size:12px;">Valpara\xEDso, Chile</p>
    </div>
  </div>
</body>
</html>`;
}

// server/webhooks.ts
var webhooksRouter = Router();
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
      const db = await getDb();
      if (!db) {
        res.status(500).json({ error: "DB unavailable" });
        return;
      }
      const orderNumber = paymentInfo.external_reference;
      if (!orderNumber) {
        res.status(200).json({ ok: true });
        return;
      }
      const [order] = await db.select().from(orders).where(eq2(orders.orderNumber, orderNumber)).limit(1);
      if (!order) {
        res.status(200).json({ ok: true });
        return;
      }
      if (order.paymentId === String(paymentId) && order.paymentStatus !== "pending") {
        res.status(200).json({ ok: true, message: "Already processed" });
        return;
      }
      let status = "pending";
      if (paymentInfo.status === "approved") status = "approved";
      else if (paymentInfo.status === "rejected" || paymentInfo.status === "cancelled") status = "rejected";
      await db.update(orders).set({
        paymentStatus: status,
        paymentId: String(paymentId),
        paymentMethod: paymentInfo.payment_method_id || void 0
      }).where(eq2(orders.id, order.id));
      if (status === "approved" && !order.emailSent) {
        await processApprovedOrder(order);
      }
      if (status === "rejected") {
        const items = await db.select().from(orderItems).where(eq2(orderItems.orderId, order.id));
        for (const item of items) {
          await db.update(ticketTypes).set({ soldCount: sql2`GREATEST(0, soldCount - ${item.quantity})` }).where(eq2(ticketTypes.id, item.ticketTypeId));
        }
      }
    }
    res.status(200).json({ ok: true });
  } catch (error) {
    console.error("[Webhook] Error:", error);
    res.status(200).json({ ok: true });
  }
});
async function processApprovedOrder(order) {
  const db = await getDb();
  if (!db) return;
  const items = await db.select().from(orderItems).where(eq2(orderItems.orderId, order.id));
  const { events: events2 } = await Promise.resolve().then(() => (init_schema(), schema_exports));
  const [event] = await db.select().from(events2).where(eq2(events2.id, order.eventId)).limit(1);
  if (!event) return;
  const ticketCodes = [];
  let firstQrUrl = "";
  for (const item of items) {
    const [tt] = await db.select().from(ticketTypes).where(eq2(ticketTypes.id, item.ticketTypeId)).limit(1);
    for (let i = 0; i < item.quantity; i++) {
      const ticketCode = `MP-${nanoid2(12).toUpperCase()}`;
      ticketCodes.push(ticketCode);
      const { qrData, qrImageUrl } = await generateTicketQR(ticketCode, event.title);
      if (!firstQrUrl) firstQrUrl = qrImageUrl;
      await db.insert(tickets).values({
        ticketCode,
        orderId: order.id,
        orderItemId: item.id,
        eventId: order.eventId,
        ticketTypeId: item.ticketTypeId,
        holderName: order.buyerName,
        qrData,
        qrImageUrl,
        status: "valid"
      });
    }
  }
  let ambassadorCode = "";
  if (order.ambassadorCode) {
    const [ambassador] = await db.select().from(users).where(eq2(users.ambassadorCode, order.ambassadorCode)).limit(1);
    if (ambassador) {
      const totalTickets = items.reduce((sum, item) => sum + item.quantity, 0);
      await db.insert(referrals).values({
        ambassadorUserId: ambassador.id,
        ambassadorCode: order.ambassadorCode,
        orderId: order.id,
        buyerEmail: order.buyerEmail,
        ticketCount: totalTickets,
        orderTotal: order.total
      });
      await db.update(users).set({ totalReferrals: sql2`totalReferrals + 1` }).where(eq2(users.id, ambassador.id));
    }
  }
  ambassadorCode = nanoid2(8).toUpperCase();
  const existingUsers = await db.select().from(users).where(eq2(users.email, order.buyerEmail)).limit(1);
  if (existingUsers.length > 0 && existingUsers[0].ambassadorCode) {
    ambassadorCode = existingUsers[0].ambassadorCode;
  }
  await db.update(orders).set({ ambassadorCode }).where(eq2(orders.id, order.id));
  const emailItems = [];
  for (const item of items) {
    const [tt] = await db.select().from(ticketTypes).where(eq2(ticketTypes.id, item.ticketTypeId)).limit(1);
    emailItems.push({
      name: tt?.name || "Entrada",
      quantity: item.quantity,
      price: Number(item.totalPrice)
    });
  }
  const emailHtml = buildConfirmationEmail({
    buyerName: order.buyerName,
    eventTitle: event.title,
    eventDate: new Date(event.eventDate).toLocaleDateString("es-CL", { weekday: "long", day: "numeric", month: "long", year: "numeric" }),
    venue: event.venue || "",
    orderNumber: order.orderNumber,
    items: emailItems,
    total: Number(order.total),
    qrImageUrl: firstQrUrl,
    ambassadorCode,
    ticketCodes
  });
  await sendEmail({
    to: order.buyerEmail,
    subject: `\u{1F389} Tu entrada para ${event.title} - Mansion Playroom`,
    html: emailHtml
  });
  await db.update(orders).set({ emailSent: 1 }).where(eq2(orders.id, order.id));
}

// server/_core/context.ts
async function createContext(opts) {
  let user = null;
  try {
    user = await sdk.authenticateRequest(opts.req);
  } catch (error) {
    user = null;
  }
  return {
    req: opts.req,
    res: opts.res,
    user
  };
}

// server/_core/app.ts
function createApp() {
  const app = express();
  app.use(express.json({ limit: "10mb" }));
  app.use(express.urlencoded({ limit: "10mb", extended: true }));
  registerOAuthRoutes(app);
  registerAdminRoutes(app);
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
