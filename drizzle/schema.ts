import { int, mysqlEnum, mysqlTable, text, timestamp, varchar, decimal } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 */
export const users = mysqlTable("users", {
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
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// Events table
export const events = mysqlTable("events", {
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
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Event = typeof events.$inferSelect;
export type InsertEvent = typeof events.$inferInsert;

// Ticket types for each event
export const ticketTypes = mysqlTable("ticketTypes", {
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
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type TicketType = typeof ticketTypes.$inferSelect;
export type InsertTicketType = typeof ticketTypes.$inferInsert;

// Orders
export const orders = mysqlTable("orders", {
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
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Order = typeof orders.$inferSelect;
export type InsertOrder = typeof orders.$inferInsert;

// Order items
export const orderItems = mysqlTable("orderItems", {
  id: int("id").autoincrement().primaryKey(),
  orderId: int("orderId").notNull(),
  ticketTypeId: int("ticketTypeId").notNull(),
  quantity: int("quantity").notNull(),
  unitPrice: decimal("unitPrice", { precision: 10, scale: 0 }).notNull(),
  totalPrice: decimal("totalPrice", { precision: 10, scale: 0 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type OrderItem = typeof orderItems.$inferSelect;
export type InsertOrderItem = typeof orderItems.$inferInsert;

// Individual tickets (one per attendee, has QR)
export const tickets = mysqlTable("tickets", {
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
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Ticket = typeof tickets.$inferSelect;
export type InsertTicket = typeof tickets.$inferInsert;

// Discount codes
export const discountCodes = mysqlTable("discountCodes", {
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
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type DiscountCode = typeof discountCodes.$inferSelect;
export type InsertDiscountCode = typeof discountCodes.$inferInsert;

// Community access codes (gate-only, no discount — e.g. Soltero / Dúo Dos Hombres)
export const communityCodes = mysqlTable("communityCodes", {
  id: int("id").autoincrement().primaryKey(),
  code: varchar("code", { length: 50 }).notNull().unique(),
  label: varchar("label", { length: 255 }),
  maxUses: int("maxUses"),
  usedCount: int("usedCount").default(0).notNull(),
  isActive: int("isActive").default(1).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type CommunityCode = typeof communityCodes.$inferSelect;
export type InsertCommunityCode = typeof communityCodes.$inferInsert;

// Ambassador referrals tracking
export const referrals = mysqlTable("referrals", {
  id: int("id").autoincrement().primaryKey(),
  ambassadorUserId: int("ambassadorUserId").notNull(),
  ambassadorCode: varchar("ambassadorCode", { length: 32 }).notNull(),
  orderId: int("orderId").notNull(),
  buyerEmail: varchar("buyerEmail", { length: 320 }).notNull(),
  ticketCount: int("ticketCount").notNull(),
  orderTotal: decimal("orderTotal", { precision: 10, scale: 0 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Referral = typeof referrals.$inferSelect;
export type InsertReferral = typeof referrals.$inferInsert;
