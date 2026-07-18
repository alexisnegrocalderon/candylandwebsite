import { int, mysqlEnum, mysqlTable, text, timestamp, varchar, decimal, json, index } from "drizzle-orm/mysql-core";

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
  // Link de Google Maps (ej. https://maps.app.goo.gl/xxxx) — se muestra como
  // botón "Ver en Google Maps" en el email final, junto a la dirección.
  mapsUrl: varchar("mapsUrl", { length: 500 }),
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
  costPrice: decimal("costPrice", { precision: 10, scale: 0 }), // para cálculo de margen (§12)
  color: varchar("color", { length: 20 }), // color del botón en la grilla de caja
  internalCode: varchar("internalCode", { length: 10 }), // prefijo del código de canje, ej. 'PIS'
  barcode: varchar("barcode", { length: 64 }), // preparado para lector de código de barras futuro
  metadata: json("metadata"), // atributos extensibles sin migración (talla, duración, etc.)
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
  operatorId: int("operatorId"), // quién registró la venta (solo canal caja)
  registerId: int("registerId"), // caja física donde se registró
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
  // Copia de ticketTypes.costPrice al momento de la venta (docs/ARQUITECTURA-CAJA.md
  // §12) — así un cambio de costo futuro no reescribe la utilidad de eventos pasados.
  unitCost: decimal("unitCost", { precision: 10, scale: 0 }),
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
  // --- Módulo /caja (docs/ARQUITECTURA-CAJA.md §9) ---
  usedByOperatorId: int("usedByOperatorId"), // auditoría de canje
  usedAtRegisterId: int("usedAtRegisterId"),
  displayCode: varchar("displayCode", { length: 20 }).unique(), // código legible PIS-XXXX-XXXX
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

// Config general del sitio (fila única) — números de Instagram del footer y
// el recargo por servicio (%) que se suma a toda venta nueva (entradas +
// extras), editables desde el admin.
export const siteSettings = mysqlTable("siteSettings", {
  id: int("id").autoincrement().primaryKey(),
  instagramFollowers: int("instagramFollowers").default(0).notNull(),
  instagramPosts: int("instagramPosts").default(0).notNull(),
  serviceFeePercent: decimal("serviceFeePercent", { precision: 5, scale: 2 }).default("0").notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type SiteSettings = typeof siteSettings.$inferSelect;

// Ambassador referrals tracking
export const referrals = mysqlTable("referrals", {
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
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Referral = typeof referrals.$inferSelect;
export type InsertReferral = typeof referrals.$inferInsert;

// --- Módulo /caja (docs/ARQUITECTURA-CAJA.md §4.2) ---

// Operadores de caja: cajera, supervisor, admin (más barra/acceso a futuro).
// Login por PIN, independiente del login admin por password (users.role).
export const operators = mysqlTable("operators", {
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
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Operator = typeof operators.$inferSelect;
export type InsertOperator = typeof operators.$inferInsert;

// Cajas físicas (ej. "Caja 1", "Caja 2") usadas en el evento.
export const registers = mysqlTable("registers", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  active: int("active").default(1).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Register = typeof registers.$inferSelect;
export type InsertRegister = typeof registers.$inferInsert;

// Enrolamiento de dispositivos: solo tablets/navegadores enrolados por un
// admin pueden siquiera intentar el login por PIN de /caja (docs pedido
// explícito del usuario, más estricto que el blueprint original). Un
// `enrollCode` de un solo uso (generado en /admin, expira a las 24h) se
// canjea una vez por un `deviceTokenHash` de larga duración -- el mismo
// patrón que operators.pinHash, pero para el dispositivo en vez del humano.
export const devices = mysqlTable("devices", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  enrollCode: varchar("enrollCode", { length: 16 }).unique(),
  enrollCodeExpiresAt: timestamp("enrollCodeExpiresAt"),
  deviceTokenHash: varchar("deviceTokenHash", { length: 255 }),
  enrolled: int("enrolled").default(0).notNull(),
  active: int("active").default(1).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  lastSeenAt: timestamp("lastSeenAt"),
});

export type Device = typeof devices.$inferSelect;
export type InsertDevice = typeof devices.$inferInsert;

// Base de datos de clientes (pedido explícito del usuario): proyección
// materializada mantenida automáticamente en cada orden WEB aprobada (nunca
// las ventas de caja, que no tienen identidad real de comprador) -- la
// fuente de verdad sigue siendo `orders`, esto solo evita tener que
// recalcular desde cero cada vez que se quiere ver/filtrar/etiquetar
// clientes. `accessTypes` acumula todos los accesoSlug distintos que esa
// persona compró alguna vez (para segmentar mailing por tipo de acceso);
// `tags` son etiquetas libres del admin (cumpleaños, VIP, etc.).
export const customers = mysqlTable("customers", {
  id: int("id").autoincrement().primaryKey(),
  email: varchar("email", { length: 320 }).notNull().unique(),
  fullName: varchar("fullName", { length: 255 }),
  phone: varchar("phone", { length: 20 }),
  rut: varchar("rut", { length: 20 }),
  instagram: varchar("instagram", { length: 100 }),
  accessTypes: json("accessTypes"), // string[] de accesoSlug
  tags: json("tags"), // string[] libres
  totalOrders: int("totalOrders").default(0).notNull(),
  totalSpent: decimal("totalSpent", { precision: 10, scale: 0 }).default("0").notNull(),
  notes: text("notes"),
  firstSeenAt: timestamp("firstSeenAt").defaultNow().notNull(),
  lastSeenAt: timestamp("lastSeenAt").defaultNow().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Customer = typeof customers.$inferSelect;
export type InsertCustomer = typeof customers.$inferInsert;

// Ledger append-only de todas las operaciones de caja (§0.3). Nunca se
// actualiza ni se borra una fila — las correcciones son operaciones nuevas.
export const ops = mysqlTable("ops", {
  id: varchar("id", { length: 36 }).primaryKey(), // UUID generado en el cliente (idempotencia)
  type: mysqlEnum("type", ["redeem", "sale", "void_code", "note", "shift_open", "shift_close", "manual_adjust"]).notNull(),
  eventId: int("eventId").notNull(),
  operatorId: int("operatorId").notNull(),
  registerId: int("registerId"),
  targetType: varchar("targetType", { length: 32 }).notNull(), // 'ticket' | 'order' | 'customer' | ...
  targetId: varchar("targetId", { length: 64 }).notNull(),
  payload: json("payload"), // detalle completo de la operación
  clientAt: timestamp("clientAt").notNull(), // hora del dispositivo al ejecutar
  serverAt: timestamp("serverAt").defaultNow().notNull(), // hora del servidor al aplicar
  result: mysqlEnum("result", ["applied", "conflict", "rejected"]).notNull(),
  conflictNote: varchar("conflictNote", { length: 500 }),
}, (table) => ({
  // docs/ARQUITECTURA-CAJA.md §13 riesgo 9: el ledger crece sin límite --
  // estos son los dos patrones de consulta reales (snapshot/reportes por
  // evento+fecha, auditoría por operador).
  eventServerAtIdx: index("ops_event_server_at_idx").on(table.eventId, table.serverAt),
  operatorIdx: index("ops_operator_idx").on(table.operatorId),
}));

// Rate limiting genérico por clave arbitraria (hoy: login por PIN, keyed por
// IP -- docs/ARQUITECTURA-CAJA.md §13 riesgo 7). El límite por operador ya
// vive en operators.failedPinAttempts/lockedUntil; esto cubre el caso de un
// atacante que prueba pocos intentos por operador pero rota entre muchos
// operadores (listOperators es público, necesario para la pantalla de PIN).
export const rateLimits = mysqlTable("rateLimits", {
  key: varchar("key", { length: 128 }).primaryKey(),
  attempts: int("attempts").default(0).notNull(),
  lockedUntil: timestamp("lockedUntil"),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type RateLimit = typeof rateLimits.$inferSelect;

export type Op = typeof ops.$inferSelect;
export type InsertOp = typeof ops.$inferInsert;

// Cuadre de caja (pedido explícito del usuario): entidad persistida del
// turno, separada del ledger `ops` (que es solo auditoría append-only, sin
// ID estable para comparar entre eventos). `openingCash` se pide al abrir;
// al cerrar se pide el efectivo TOTAL contado (no la diferencia -- se resta
// `openingCash` automáticamente) más los totales de débito/crédito de los
// vouchers de las máquinas. `expected*` se calcula solo de las ventas de
// canal 'caja' dentro de la ventana del turno (nunca ventas web). `top*` es
// un snapshot (no un cálculo en vivo) para que el reporte de un evento
// pasado no cambie si se generan más ventas después.
export const shifts = mysqlTable("shifts", {
  id: int("id").autoincrement().primaryKey(),
  eventId: int("eventId").notNull(),
  operatorId: int("operatorId").notNull(), // quién abrió el turno
  registerId: int("registerId"),
  openingCash: decimal("openingCash", { precision: 10, scale: 0 }).notNull(),
  openedAt: timestamp("openedAt").defaultNow().notNull(),
  closedAt: timestamp("closedAt"),
  closedByOperatorId: int("closedByOperatorId"),
  countedCash: decimal("countedCash", { precision: 10, scale: 0 }),
  countedDebit: decimal("countedDebit", { precision: 10, scale: 0 }),
  countedCredit: decimal("countedCredit", { precision: 10, scale: 0 }),
  expectedCash: decimal("expectedCash", { precision: 10, scale: 0 }),
  expectedDebit: decimal("expectedDebit", { precision: 10, scale: 0 }),
  expectedCredit: decimal("expectedCredit", { precision: 10, scale: 0 }),
  salesCount: int("salesCount"),
  redeemsCount: int("redeemsCount"),
  topCustomers: json("topCustomers"), // [{ name, email, total }]
  topProducts: json("topProducts"), // [{ name, quantity, revenue }]
  status: mysqlEnum("status", ["open", "closed"]).default("open").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Shift = typeof shifts.$inferSelect;
export type InsertShift = typeof shifts.$inferInsert;
