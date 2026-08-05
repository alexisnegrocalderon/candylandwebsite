import { int, mysqlEnum, mysqlTable, text, timestamp, varchar, decimal, json, index, uniqueIndex } from "drizzle-orm/mysql-core";

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
  //
  // Las tres últimas son la CARTA DE LA FIESTA, que solo se vende en /caja
  // (docs/ARQUITECTURA-CAJA.md §12): "consumo" = tragos y comida, "locker" =
  // guardarropía, "merch" = productos. Que sean categorías propias y no
  // "extra" es justamente lo que las mantiene fuera del sitio web: el
  // checkout lista addons filtrando `category === 'extra'`, y webhooks.ts
  // genera `displayCode` solo para 'extra' — así un trago no aparece en la
  // web, no emite ticket y no manda correo, sin necesidad de ningún filtro
  // extra en esos archivos.
  category: mysqlEnum("category", ["acceso", "extra", "consumo", "locker", "merch"]).default("acceso").notNull(),
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
  emoji: varchar("emoji", { length: 8 }), // ícono grande del botón en /caja (en vez de foto)
  // Sección de la carta dentro de la categoría ("Tragos", "Cervezas", "Sin
  // alcohol", "Comida"). Es lo que arma las pestañas de la grilla de /caja
  // sin necesitar una tabla de categorías.
  groupName: varchar("groupName", { length: 50 }),
  // "este producto lo prepara la cocina" -> genera comanda en /cocina. Es una
  // casilla explícita y no una regla adivinada por categoría o nombre: puede
  // haber un trago que sí va a cocina, o una comida envasada que se entrega
  // directo en la barra.
  toKitchen: int("toKitchen").default(0).notNull(),
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
  // Código que el comprador tecleó al pagar, congelado para siempre desde
  // createOrder -- a diferencia de `ambassadorCode`, que más tarde
  // ensureOwnAmbassadorCode() pisa con el código PROPIO del comprador (ver
  // ese comentario en webhooks.ts). Sin esta columna, la Misión 300 (donde
  // ese pisado ocurre antes de la aprobación final) perdía el rastro de quién
  // refirió la venta -- ahora tanto los referidos normales como la comisión
  // de embajadores exclusivos leen de acá.
  referredByCode: varchar("referredByCode", { length: 32 }),
  paymentStatus: mysqlEnum("paymentStatus", ["pending", "approved", "rejected", "refunded"]).default("pending").notNull(),
  paymentId: varchar("paymentId", { length: 255 }),
  paymentMethod: varchar("paymentMethod", { length: 64 }),
  mercadoPagoPreferenceId: varchar("mercadoPagoPreferenceId", { length: 255 }),
  emailSent: int("emailSent").default(0).notNull(),
  // Recordatorio a quien dejó la compra a medio camino (admin → Ventas web).
  // Se guarda para poder avisar antes de reenviar: sin esto es fácil que la
  // misma persona reciba el mismo correo cuatro veces y marque como spam.
  reminderSentAt: timestamp("reminderSentAt"),
  reminderCount: int("reminderCount").default(0).notNull(),
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
  // Personas cubiertas por ESTE ticket cuando no es 1:1 vía accesoSlug (ver
  // shared/mission300.ts personasForAccesoSlug) -- hoy solo lo usa la
  // invitación especial instantánea del admin: un solo QR/ticket que
  // representa a varias personas, en vez de generar un ticket por persona.
  groupSize: int("groupSize"),
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

// Embajadores exclusivos (pedido explícito del usuario): a diferencia de un
// embajador "orgánico" (cualquier comprador, ver `referrals` arriba), estos
// se dan de alta a mano en el admin con un código propio y cobran una
// comisión en plata por cada venta con su código -- no dan descuento al
// comprador, solo trackean quién trajo la venta. El mismo campo de código de
// embajador del checkout sirve para ambos casos.
export const exclusiveAmbassadors = mysqlTable("exclusiveAmbassadors", {
  id: int("id").autoincrement().primaryKey(),
  // Nullable desde el programa VIP: el código ahora es PERMANENTE y global
  // (SOFIA, CAMILA), no uno por evento -- el nivel y los beneficios se
  // cuentan por mes, cruzando todos los eventos. Se conserva la columna para
  // no perder de vista a qué evento se dio de alta cada fila vieja.
  eventId: int("eventId"),
  name: varchar("name", { length: 255 }).notNull(),
  code: varchar("code", { length: 32 }).notNull().unique(),
  // Nullable desde el programa VIP: en null significa "usar la escala global"
  // (ambassadorProgramConfig.commissionScale, 30-50% según ventas del mes).
  // Con un valor, es un override fijo para ese embajador en particular.
  commissionPercent: decimal("commissionPercent", { precision: 5, scale: 2 }),
  contact: varchar("contact", { length: 255 }),
  // Destinatario del correo semanal -- `contact` es texto libre (teléfono o
  // Instagram) y no sirve para mandar nada.
  email: varchar("email", { length: 320 }),
  instagram: varchar("instagram", { length: 100 }),
  active: int("active").default(1).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ExclusiveAmbassador = typeof exclusiveAmbassadors.$inferSelect;
export type InsertExclusiveAmbassador = typeof exclusiveAmbassadors.$inferInsert;

// Comisión generada por cada venta con un código de embajador exclusivo.
// baseAmount/commissionPercent/commissionAmount quedan CONGELADOS al momento
// de la venta (misma convención que orders.serviceFee) -- si después se
// cambia el % del embajador o la escala, el historial ya pagado no se
// reescribe. Eso es justamente lo que hace que la escala NO sea retroactiva.
export const ambassadorCommissions = mysqlTable("ambassadorCommissions", {
  id: int("id").autoincrement().primaryKey(),
  ambassadorId: int("ambassadorId").notNull(),
  // Único: la idempotencia del pago colgaba solo de `orders.emailSent`, así
  // que un reproceso de la misma orden pagaba dos veces la comisión.
  orderId: int("orderId").notNull().unique(),
  eventId: int("eventId").notNull(),
  baseAmount: decimal("baseAmount", { precision: 10, scale: 0 }).notNull(),
  commissionPercent: decimal("commissionPercent", { precision: 5, scale: 2 }).notNull(),
  commissionAmount: decimal("commissionAmount", { precision: 10, scale: 0 }).notNull(),
  // Quién compró, para el historial del embajador y la vista de clientes
  // referidos. Se guarda el email porque es la llave real de `customers`.
  customerEmail: varchar("customerEmail", { length: 320 }),
  // 'exclusivo' = cliente propio (suma al nivel); 'existente' = cliente de la
  // casa o de otro embajador (10% fijo, no suma al nivel).
  clientType: mysqlEnum("clientType", ["exclusivo", "existente"]).default("exclusivo").notNull(),
  // El código realmente tecleado en el checkout -- puede no ser el del
  // embajador que cobra, cuando el cliente ya tenía dueño.
  codeUsed: varchar("codeUsed", { length: 32 }),
  // Mes calendario en hora de Chile ("2026-08"): es el corte del nivel y de
  // los beneficios. Se congela acá para que agrupar por mes no dependa de la
  // zona horaria del servidor (ver monthKeyFor en shared/ambassadorProgram.ts).
  monthKey: varchar("monthKey", { length: 7 }),
  // Qué número de venta exclusiva del mes fue esta, para poder auditar de
  // dónde salió el % aplicado.
  salesRank: int("salesRank"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type AmbassadorCommission = typeof ambassadorCommissions.$inferSelect;
export type InsertAmbassadorCommission = typeof ambassadorCommissions.$inferInsert;

// Propiedad permanente de un cliente. El único en `customerEmail` es lo que
// garantiza a nivel de base de datos la regla más importante del programa:
// un cliente pertenece a UN solo embajador, y nunca cambia de dueño.
//
// Solo guarda clientes EXCLUSIVOS (los que llegaron nuevos después del
// lanzamiento). Los clientes que ya estaban en la base no son propiedad de
// nadie, así que no tienen fila acá -- aparecen en el historial derivados de
// `ambassadorCommissions.clientType = 'existente'`.
export const ambassadorClients = mysqlTable("ambassadorClients", {
  id: int("id").autoincrement().primaryKey(),
  ambassadorId: int("ambassadorId").notNull(),
  customerEmail: varchar("customerEmail", { length: 320 }).notNull().unique(),
  firstOrderId: int("firstOrderId"),
  firstPurchaseAt: timestamp("firstPurchaseAt").defaultNow().notNull(),
  ordersCount: int("ordersCount").default(1).notNull(),
  totalSpent: decimal("totalSpent", { precision: 10, scale: 0 }).default("0").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type AmbassadorClient = typeof ambassadorClients.$inferSelect;

// Config del programa (fila única, mismo patrón que siteSettings): el dueño
// pidió explícitamente que NADA quede hardcodeado -- escalas, beneficios,
// bonos y horario del correo se editan desde el admin. Los valores por
// defecto viven en shared/ambassadorProgram.ts.
export const ambassadorProgramConfig = mysqlTable("ambassadorProgramConfig", {
  id: int("id").autoincrement().primaryKey(),
  // La frontera entre "cliente de la casa" y "cliente nuevo": quien ya
  // estaba antes de esta fecha nunca pasa a ser propiedad de un embajador.
  launchDate: timestamp("launchDate").defaultNow().notNull(),
  commissionScale: json("commissionScale"), // CommissionTier[]
  existingClientPercent: decimal("existingClientPercent", { precision: 5, scale: 2 }).default("10").notNull(),
  benefits: json("benefits"), // BenefitTier[]
  weeklyEmailEnabled: int("weeklyEmailEnabled").default(1).notNull(),
  // 0=domingo .. 1=lunes, igual que Date.getUTCDay().
  weeklyEmailWeekday: int("weeklyEmailWeekday").default(1).notNull(),
  // Solo informativo: Vercel Hobby dispara el cron una vez al día a la hora
  // fija de vercel.json, así que esto no puede mover el disparo real.
  weeklyEmailHourChile: int("weeklyEmailHourChile").default(9).notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type AmbassadorProgramConfig = typeof ambassadorProgramConfig.$inferSelect;

// Registro de beneficios ya entregados, para que el admin sepa a quién le
// falta darle su botella o su bono. El sistema CALCULA qué desbloqueó cada
// uno (según sus ventas del mes y la config); esta tabla solo anota lo que ya
// se entregó de verdad.
//
// `benefitKey` es el tramo de beneficios (`tramo-5`, `tramo-20`): se marca el
// tramo completo, no cada ítem por separado -- "le entregué lo de 5 ventas".
// El único evita marcar dos veces lo mismo.
export const ambassadorBenefitDeliveries = mysqlTable("ambassadorBenefitDeliveries", {
  id: int("id").autoincrement().primaryKey(),
  ambassadorId: int("ambassadorId").notNull(),
  monthKey: varchar("monthKey", { length: 7 }).notNull(),
  benefitKey: varchar("benefitKey", { length: 64 }).notNull(),
  note: text("note"),
  deliveredAt: timestamp("deliveredAt").defaultNow().notNull(),
}, (t) => [
  uniqueIndex("ambassadorBenefitDeliveries_unique").on(t.ambassadorId, t.monthKey, t.benefitKey),
]);

export type AmbassadorBenefitDelivery = typeof ambassadorBenefitDeliveries.$inferSelect;

// Material que los embajadores reciben en el correo semanal (historias, reel,
// publicación, cuenta regresiva). Lo carga el admin cada semana; el correo
// toma la última fila con `active = 1`. Se guardan las anteriores como
// historial en vez de sobreescribir.
export const ambassadorWeeklyMaterial = mysqlTable("ambassadorWeeklyMaterial", {
  id: int("id").autoincrement().primaryKey(),
  title: varchar("title", { length: 255 }),
  storiesText: text("storiesText"),
  reelText: text("reelText"),
  postText: text("postText"),
  countdownText: text("countdownText"),
  linkUrl: varchar("linkUrl", { length: 500 }),
  active: int("active").default(1).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type AmbassadorWeeklyMaterial = typeof ambassadorWeeklyMaterial.$inferSelect;

// Postulaciones para ser embajador, desde la página pública /embajadores.
// Es la PRIMERA escritura pública del sitio destinada a revisión humana (el
// resto de las mutaciones públicas son compras o la capa social de la
// fiesta), así que el handler la protege con límite por IP y validación
// estricta de WhatsApp/Instagram -- ver shared/ambassadorApplication.ts.
//
// SIN único en `email` a propósito: alguien rechazado debe poder volver a
// postular más adelante. Lo que se impide es tener dos pendientes a la vez
// del mismo correo, con un chequeo en createApplication que responde amable.
export const ambassadorApplications = mysqlTable("ambassadorApplications", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  email: varchar("email", { length: 320 }).notNull(),
  // Normalizado a +569XXXXXXXX por sanitizeWhatsapp, para que todos queden
  // guardados igual y el link de wa.me funcione siempre.
  whatsapp: varchar("whatsapp", { length: 20 }).notNull(),
  // Handle pelado, sin arroba ni URL.
  instagram: varchar("instagram", { length: 100 }).notNull(),
  followers: int("followers"),
  message: text("message"),
  // Queda registro de que marcó los requisitos y las tareas antes de enviar.
  acceptedTerms: int("acceptedTerms").default(0).notNull(),
  status: mysqlEnum("status", ["pendiente", "aprobada", "rechazada"]).default("pendiente").notNull(),
  reviewNote: text("reviewNote"),
  reviewedAt: timestamp("reviewedAt"),
  // A qué embajador dio origen, si se aprobó -- así se puede ir de la
  // postulación a la persona ya trabajando.
  createdAmbassadorId: int("createdAmbassadorId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => [
  index("ambassadorApplications_email_idx").on(t.email),
  index("ambassadorApplications_status_idx").on(t.status),
]);

export type AmbassadorApplication = typeof ambassadorApplications.$inferSelect;

// --- Módulo /caja (docs/ARQUITECTURA-CAJA.md §4.2) ---

// Operadores de caja: cajera, supervisor, admin (más barra/acceso a futuro).
// Login por PIN, independiente del login admin por password (users.role).
export const operators = mysqlTable("operators", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  pinHash: varchar("pinHash", { length: 255 }).notNull(),
  role: mysqlEnum("role", ["admin", "supervisor", "caja", "barra", "acceso", "cocina"]).notNull(),
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
  // Playcoins (pedido explícito del usuario, reemplaza el sistema de puntos
  // que la tienda tenía en Shopify): saldo cacheado, siempre = suma de
  // `playcoinsLedger` para este cliente -- evita sumar todo el historial en
  // cada lectura de saldo.
  playcoins: int("playcoins").default(0).notNull(),
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
  countedQr: decimal("countedQr", { precision: 10, scale: 0 }),
  expectedCash: decimal("expectedCash", { precision: 10, scale: 0 }),
  expectedDebit: decimal("expectedDebit", { precision: 10, scale: 0 }),
  expectedCredit: decimal("expectedCredit", { precision: 10, scale: 0 }),
  // Transferencia / QR de Mercado Pago. Va aparte de débito y crédito porque
  // no pasa por la máquina: el voucher no existe y hay que cuadrarlo contra
  // la app del banco. Sin esta columna, la plata cobrada por QR simplemente
  // desaparecería del arqueo del turno.
  expectedQr: decimal("expectedQr", { precision: 10, scale: 0 }),
  salesCount: int("salesCount"),
  redeemsCount: int("redeemsCount"),
  topCustomers: json("topCustomers"), // [{ name, email, total }]
  topProducts: json("topProducts"), // [{ name, quantity, revenue }]
  status: mysqlEnum("status", ["open", "closed"]).default("open").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Shift = typeof shifts.$inferSelect;
export type InsertShift = typeof shifts.$inferInsert;

// Guardarropía: una fila por prenda dejada. `tagNumber` es el número de la
// PERCHA FÍSICA, tecleado por la cajera al cobrar -- no lo genera el sistema.
// Es a propósito: un correlativo asignado por el servidor no puede funcionar
// sin señal (dos tablets desconectadas asignarían las dos el #42), y además
// el número impreso en la ficha es justamente el que la persona lleva en la
// mano. El único de abajo es la red de seguridad: si alguien teclea un
// número ya usado esta noche, la caja avisa en vez de dejar dos abrigos con
// el mismo número.
export const lockerItems = mysqlTable("lockerItems", {
  id: int("id").autoincrement().primaryKey(),
  eventId: int("eventId").notNull(),
  orderId: int("orderId").notNull(),
  opId: varchar("opId", { length: 64 }).notNull(),
  tagNumber: varchar("tagNumber", { length: 16 }).notNull(),
  status: mysqlEnum("status", ["guardado", "retirado"]).default("guardado").notNull(),
  chargedAt: timestamp("chargedAt").defaultNow().notNull(),
  retrievedAt: timestamp("retrievedAt"),
  retrievedByOperatorId: int("retrievedByOperatorId"),
}, (t) => [
  uniqueIndex("lockerItems_event_tag_unique").on(t.eventId, t.tagNumber),
]);

export type LockerItem = typeof lockerItems.$inferSelect;
export type InsertLockerItem = typeof lockerItems.$inferInsert;

// Comanda de cocina. Se crea sola al vender cualquier producto con
// `ticketTypes.toKitchen`, dentro del mismo applyOp de la venta -- así la
// idempotencia por `opId` que ya existe cubre también la comanda: una venta
// reenviada por la cola offline no genera dos pedidos en cocina.
//
// `ticketNumber` es `<nº de caja>-<correlativo local>` (ej. "1-042"): el
// correlativo lo lleva la propia tablet en su base local, y el prefijo de
// caja (registers.id) es lo que garantiza que dos cajas sin señal NUNCA
// asignen el mismo número. `items` va congelado (nombre + cantidad) porque
// si mañana se renombra o borra el producto, la comanda vieja tiene que
// seguir diciendo qué era.
export const kitchenTickets = mysqlTable("kitchenTickets", {
  id: int("id").autoincrement().primaryKey(),
  eventId: int("eventId").notNull(),
  orderId: int("orderId").notNull(),
  opId: varchar("opId", { length: 64 }).notNull(),
  registerId: int("registerId"),
  ticketNumber: varchar("ticketNumber", { length: 12 }).notNull(),
  status: mysqlEnum("status", ["pendiente", "aprobado", "entregado"]).default("pendiente").notNull(),
  items: json("items").notNull(), // [{ name, quantity }]
  note: varchar("note", { length: 200 }),
  // Nombre que la cajera le pide al cliente al cobrar un producto toKitchen
  // (pedido explícito del dueño): un número de comanda es difícil de
  // memorizar para ir a buscarlo, un nombre no. Se exige en la aplicación
  // (client/src/pages/caja/index.tsx), no acá -- mismo criterio que el resto
  // de la tabla.
  customerName: varchar("customerName", { length: 60 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  approvedAt: timestamp("approvedAt"),
  approvedByOperatorId: int("approvedByOperatorId"),
  deliveredAt: timestamp("deliveredAt"),
  deliveredByOperatorId: int("deliveredByOperatorId"),
}, (t) => [
  uniqueIndex("kitchenTickets_event_number_unique").on(t.eventId, t.ticketNumber),
]);

export type KitchenTicket = typeof kitchenTickets.$inferSelect;
export type InsertKitchenTicket = typeof kitchenTickets.$inferInsert;

// Ledger append-only de Playcoins (pedido explícito del usuario), mismo
// patrón que `ops`: nunca se actualiza ni se borra una fila -- toda
// ganancia/canje/ajuste manual es una fila nueva. `customers.playcoins` es
// una proyección cacheada de la suma de este ledger, mantenida en la misma
// transacción que cada inserción.
export const playcoinsLedger = mysqlTable("playcoinsLedger", {
  id: int("id").autoincrement().primaryKey(),
  customerId: int("customerId").notNull(),
  delta: int("delta").notNull(), // + gana, - canjea/ajusta
  reason: mysqlEnum("reason", ["earn_web", "earn_caja", "redeem_caja", "manual_adjust"]).notNull(),
  orderId: int("orderId"), // orden web o venta de caja que originó el movimiento (si aplica)
  opId: varchar("opId", { length: 36 }), // id del op de caja (idempotencia); null para web
  balanceAfter: int("balanceAfter").notNull(),
  note: text("note"), // motivo libre en ajustes manuales del admin
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type PlaycoinsLedgerEntry = typeof playcoinsLedger.$inferSelect;
export type InsertPlaycoinsLedgerEntry = typeof playcoinsLedger.$inferInsert;

// Cola de envío automática del mailing masivo (pedido explícito del usuario):
// a diferencia del envío inmediato desde el navegador (que sigue igual, sin
// pasar por acá), una campaña acá se guarda una vez con su contenido ya
// definido y el cron diario (server/cron.ts) va drenando destinatarios
// pendientes día a día hasta terminar -- así no hace falta que el dueño
// vuelva a entrar cada día a retomar con el filtro de "excluir etiqueta".
export const mailingCampaigns = mysqlTable("mailingCampaigns", {
  id: int("id").autoincrement().primaryKey(),
  // Mismo valor que se usa como etiqueta para taguear a cada destinatario
  // exitoso (igual que en el envío manual) y que se muestra en el historial.
  name: varchar("name", { length: 255 }).notNull(),
  audienceDescription: text("audienceDescription"),
  // MailingContent completo (subject/preheader/headline/paragraphs/ctaText/
  // highlightLabel/highlightValue) tal como lo dejó el admin en la revisión
  // -- fijo desde la creación, no se vuelve a generar con IA.
  content: json("content").notNull(),
  ctaUrl: varchar("ctaUrl", { length: 500 }).notNull(),
  // MailingEventSections | null (null = sin tarjeta de evento). El evento
  // destacado en sí NO se congela acá -- se resuelve de nuevo en cada tanda
  // del cron (server/mailing.ts getMailingEventInfo), así el contador de
  // Misión 300 sale siempre actualizado aunque la campaña tarde días en
  // terminar de mandarse.
  eventSections: json("eventSections"),
  status: mysqlEnum("status", ["sending", "done"]).default("sending").notNull(),
  totalRecipients: int("totalRecipients").notNull(),
  sentCount: int("sentCount").default(0).notNull(),
  failedCount: int("failedCount").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type MailingCampaign = typeof mailingCampaigns.$inferSelect;
export type InsertMailingCampaign = typeof mailingCampaigns.$inferInsert;

export const mailingRecipients = mysqlTable("mailingRecipients", {
  id: int("id").autoincrement().primaryKey(),
  campaignId: int("campaignId").notNull(),
  customerId: int("customerId").notNull(),
  status: mysqlEnum("status", ["pending", "sent", "failed"]).default("pending").notNull(),
  reason: varchar("reason", { length: 500 }),
  sentAt: timestamp("sentAt"),
}, (table) => ({
  // El cron necesita "próximos N pendientes de la campaña más vieja" -- este
  // índice cubre ese patrón exacto.
  campaignStatusIdx: index("mailing_recipients_campaign_status_idx").on(table.campaignId, table.status),
}));

export type MailingRecipient = typeof mailingRecipients.$inferSelect;
export type InsertMailingRecipient = typeof mailingRecipients.$inferInsert;

// --- Caramelo: la capa social que vive solo mientras dura la fiesta ---
// Las reglas (ventana horaria, tope de toques, alias permitidos) están en
// shared/party.ts, compartidas con el cliente. Acá solo viven los datos.

// Un perfil por acceso que efectivamente entró (tickets.status='used').
// Sin foto y sin nombre real: alias + uno de los avatares dibujados.
export const partyProfiles = mysqlTable("partyProfiles", {
  id: int("id").autoincrement().primaryKey(),
  eventId: int("eventId").notNull(),
  // Un acceso, un perfil. El ticketCode es además el token de sesión de la
  // fiesta, igual que en la página pública de la entrada.
  ticketId: int("ticketId").notNull().unique(),
  alias: varchar("alias", { length: 32 }).notNull(),
  gender: mysqlEnum("gender", ["hombre", "mujer", "pareja"]).notNull(),
  avatarId: int("avatarId").notNull(),
  zone: mysqlEnum("zone", ["living", "playground", "piscina", "barra"]).default("living").notNull(),
  // Se refresca solo, cada vez que la persona mira la mansión.
  lastSeenAt: timestamp("lastSeenAt").defaultNow().notNull(),
  active: int("active").default(1).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  // El patrón de consulta real: "todos los perfiles activos de este evento".
  eventActiveIdx: index("party_profiles_event_active_idx").on(table.eventId, table.active),
}));

export type PartyProfile = typeof partyProfiles.$inferSelect;
export type InsertPartyProfile = typeof partyProfiles.$inferInsert;

// Un toque 👋 y su respuesta. El par se guarda SIEMPRE normalizado
// (profileLowId < profileHighId, ver orderedPair en shared/party.ts): con
// eso el índice único de abajo impide duplicados en los dos sentidos, y
// "no puede volver a tocar a quien ya lo rechazó" queda garantizado por la
// base de datos en vez de por una validación que se puede olvidar.
export const partyConnections = mysqlTable("partyConnections", {
  id: int("id").autoincrement().primaryKey(),
  eventId: int("eventId").notNull(),
  profileLowId: int("profileLowId").notNull(),
  profileHighId: int("profileHighId").notNull(),
  initiatedById: int("initiatedById").notNull(),
  status: mysqlEnum("status", ["pending", "accepted", "declined"]).default("pending").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  respondedAt: timestamp("respondedAt"),
}, (table) => ({
  pairIdx: uniqueIndex("party_connections_pair_idx").on(table.profileLowId, table.profileHighId),
  // "mis conexiones" se consulta por cada lado del par.
  lowIdx: index("party_connections_low_idx").on(table.profileLowId),
  highIdx: index("party_connections_high_idx").on(table.profileHighId),
}));

export type PartyConnection = typeof partyConnections.$inferSelect;
export type InsertPartyConnection = typeof partyConnections.$inferInsert;

// Los mensajes se borran a las 24h de terminado el evento (cron diario).
// Los perfiles y conexiones se conservan; lo que la gente escribió, no.
export const partyMessages = mysqlTable("partyMessages", {
  id: int("id").autoincrement().primaryKey(),
  connectionId: int("connectionId").notNull(),
  fromProfileId: int("fromProfileId").notNull(),
  body: varchar("body", { length: 500 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  connectionIdx: index("party_messages_connection_idx").on(table.connectionId, table.createdAt),
}));

export type PartyMessage = typeof partyMessages.$inferSelect;
export type InsertPartyMessage = typeof partyMessages.$inferInsert;

// Bloqueo: la invisibilidad es MUTUA. Quien bloquea deja de ver al
// bloqueado y también desaparece de su mansión -- si solo desapareciera de
// un lado, el bloqueado notaría el bloqueo y podría buscar a la persona en
// la fiesta real, que es exactamente lo que hay que evitar.
export const partyBlocks = mysqlTable("partyBlocks", {
  id: int("id").autoincrement().primaryKey(),
  eventId: int("eventId").notNull(),
  blockerProfileId: int("blockerProfileId").notNull(),
  blockedProfileId: int("blockedProfileId").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  pairIdx: uniqueIndex("party_blocks_pair_idx").on(table.blockerProfileId, table.blockedProfileId),
}));

export type PartyBlock = typeof partyBlocks.$inferSelect;
export type InsertPartyBlock = typeof partyBlocks.$inferInsert;

// Denuncias, para que el equipo del local pueda actuar durante la fiesta.
export const partyReports = mysqlTable("partyReports", {
  id: int("id").autoincrement().primaryKey(),
  eventId: int("eventId").notNull(),
  reporterProfileId: int("reporterProfileId").notNull(),
  reportedProfileId: int("reportedProfileId").notNull(),
  reason: varchar("reason", { length: 500 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  resolvedAt: timestamp("resolvedAt"),
}, (table) => ({
  eventIdx: index("party_reports_event_idx").on(table.eventId, table.resolvedAt),
}));

export type PartyReport = typeof partyReports.$inferSelect;
export type InsertPartyReport = typeof partyReports.$inferInsert;

// Invitar un trago: se le puede invitar a cualquiera, pero la otra persona
// puede rechazarlo, y por eso el cobro va DESPUÉS de la respuesta (ver la
// máquina de estados en shared/party.ts). Nadie paga por un trago que la
// otra persona no quiso.
export const partyGifts = mysqlTable("partyGifts", {
  id: int("id").autoincrement().primaryKey(),
  eventId: int("eventId").notNull(),
  fromProfileId: int("fromProfileId").notNull(),
  toProfileId: int("toProfileId").notNull(),
  ticketTypeId: int("ticketTypeId").notNull(),
  // Nombre y precio CONGELADOS al invitar (misma convención que
  // orders.serviceFee y ambassadorCommissions): los precios cambian entre
  // eventos y un regalo puede cobrarse meses después, así que el barman
  // tiene que ver lo que realmente se compró, no lo que vale hoy.
  drinkName: varchar("drinkName", { length: 100 }).notNull(),
  priceClp: decimal("priceClp", { precision: 10, scale: 0 }).notNull(),
  message: varchar("message", { length: 120 }),
  status: mysqlEnum("status", ["invited", "accepted", "declined", "paid", "redeemed", "expired"]).default("invited").notNull(),
  // Se llenan al pagar. La orden es una orden web normal, así que se cobra
  // con el mismo processCardPaymentForOrder que las entradas.
  orderId: int("orderId"),
  ticketId: int("ticketId"),
  displayCode: varchar("displayCode", { length: 20 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  // Vence la INVITACIÓN sin pagar, nunca el regalo ya pagado.
  expiresAt: timestamp("expiresAt"),
  respondedAt: timestamp("respondedAt"),
  paidAt: timestamp("paidAt"),
  redeemedAt: timestamp("redeemedAt"),
}, (table) => ({
  // "mis regalos" (recibidos y enviados) y "los que la caja puede cobrar".
  toIdx: index("party_gifts_to_idx").on(table.toProfileId, table.status),
  fromIdx: index("party_gifts_from_idx").on(table.fromProfileId, table.status),
  // El snapshot de caja necesita los pagados-no-cobrados de TODOS los
  // eventos, no solo del actual.
  statusIdx: index("party_gifts_status_idx").on(table.status),
  orderIdx: index("party_gifts_order_idx").on(table.orderId),
}));

export type PartyGift = typeof partyGifts.$inferSelect;
export type InsertPartyGift = typeof partyGifts.$inferInsert;

// Segundo factor del panel de administración. Una sola fila: el panel
// tiene un solo dueño y una sola contraseña (ADMIN_PASSWORD).
export const adminTotp = mysqlTable("adminTotp", {
  id: int("id").autoincrement().primaryKey(),
  secret: varchar("secret", { length: 64 }).notNull(),
  // Nulo hasta que el dueño confirma con un código real de su app. Sin esta
  // confirmación no se activa nada: si se guardara al generar el secreto,
  // un QR mal escaneado lo dejaría afuera de su propio panel para siempre.
  confirmedAt: timestamp("confirmedAt"),
  // Códigos de respaldo HASHEADOS. Los legibles se muestran una sola vez.
  backupCodes: json("backupCodes"),
  // Último paso TOTP aceptado: impide reusar un código dentro de sus 30
  // segundos de vida (ver verifyTotp en server/adminSecurity.ts).
  lastUsedStep: int("lastUsedStep"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type AdminTotp = typeof adminTotp.$inferSelect;
