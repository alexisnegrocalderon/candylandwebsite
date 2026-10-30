import { int, mysqlEnum, mysqlTable, text, timestamp, varchar, decimal, json, index, uniqueIndex, customType } from "drizzle-orm/mysql-core";
import { sql } from "drizzle-orm";

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
  // Preventa anticipada para socios (quienes tienen cuenta): hasta esta fecha
  // las entradas solo las compra quien entró a «Mi cuenta» con el mismo correo
  // de la compra. null = sin preventa de socios (comportamiento de siempre).
  memberEarlyUntil: timestamp("memberEarlyUntil"),
  status: mysqlEnum("status", ["draft", "published", "soldout", "cancelled", "past"]).default("draft").notNull(),
  featured: int("featured").default(0).notNull(),
  // Interruptor manual del admin: fuerza el cobro a "valor general" aunque
  // la fecha todavía esté dentro de la ventana de Misión 300 (ver
  // shared/mission300.ts isMissionActiveForEvent). Gana siempre sobre la
  // fecha -- se usa cuando la preventa se cierra antes de los 3 días de
  // corte automático.
  missionForceClosed: int("missionForceClosed").default(0).notNull(),
  // ¿Este evento se declara al SII? Los que van "sin movimiento" no generan
  // débito fiscal ni permiten usar el crédito de las facturas de sus gastos
  // (ahí el IVA pagado al proveedor es costo puro, no algo recuperable), así
  // que su resultado se calcula 100% bruto. Es una decisión por FIESTA, no
  // global -- mismo patrón int-como-booleano que `featured`.
  ivaApplies: int("ivaApplies").default(0).notNull(),
  // ¿Quién factura este evento? Decide si sus ventas van al F29 de Mansion
  // Playroom: 'mansion' (sí), 'tercero' (el local u otro organizador), 'exento'
  // (confirmado por contador) o 'por_revisar' (aún no se decide). `ivaApplies`
  // se mantiene sincronizado (= 'mansion') para que el P&L no cambie.
  taxIssuer: mysqlEnum("taxIssuer", ["mansion", "tercero", "exento", "por_revisar"]).default("por_revisar").notNull(),
  // Por qué no va en el F29 (quién factura, o la razón de la exención).
  taxNote: varchar("taxNote", { length: 255 }),
  // Escala de descuentos de las tandas de este evento, en % sobre
  // originalPrice (ej. [60, 50, 40, 30, 0] -- Founders 60%, luego 50%...).
  // La posición en el arreglo ES la fase, no hace falta un número de fase
  // aparte por tramo (a diferencia de ambassadorProgramConfig.commissionScale,
  // donde cada tramo necesita min/max Y percent correlacionados). `null` =
  // evento sin escala propia todavía -- se usa DEFAULT_TANDA_SCHEDULE.
  tandaDiscountSchedule: json("tandaDiscountSchedule"), // number[]
  // Índice (0-based) de la fase HOY vigente. Arranca en 0 porque la tanda
  // "Founders" ya en producción para el evento real de hoy ES la fase 1/60%
  // -- el default de columna cubre ese caso sin backfill.
  tandaPhaseIndex: int("tandaPhaseIndex").default(0).notNull(),
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
  // Si esta fila pertenece a un cupo REALMENTE compartido con otras filas
  // (ej. Tanda "Founders": Dúo, Soltera, Trío... todas gastan del mismo pozo
  // de 40, no de un totalStock independiente cada una) -- ver `stockPools`
  // más abajo. `null` = esta fila sigue funcionando exactamente como hoy,
  // con su propio totalStock/soldCount. No es un reemplazo de esos dos
  // campos: siguen sumando por fila (para el historial y el admin), el pool
  // es una validación ADICIONAL que se suma encima al crear la orden.
  stockPoolId: int("stockPoolId"),
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
  // Monto en CLP que este producto acredita como saldo prepagado por unidad.
  // NULL = producto normal. Con valor = es un producto de CARGA DE SALDO:
  // aparece en el checkout como un extra más ("Cargar saldo $10.000") porque
  // Checkout.tsx lista los `category='extra'`, pero se comporta distinto en
  // cuatro puntos: (a) NO paga el recargo por servicio -- el monto cargado
  // entra completo, decisión explícita del dueño; (b) no genera ticket ni QR
  // ni displayCode (no es un derecho canjeable); (c) no otorga Playcoins --
  // si no, cargar saldo regalaría puntos y volvería a darlos al gastarlo;
  // (d) anular la orden tiene que devolver el saldo.
  // Es columna real y no `metadata` justamente porque necesita validación
  // fuerte: es plata (docs/ARQUITECTURA-CAJA.md §12). Y va aparte de `price`
  // para poder hacer promos de bonificación (pagar $10.000 y acreditar
  // $11.000) sin volver a tocar el schema.
  topupAmount: int("topupAmount"),
  metadata: json("metadata"), // atributos extensibles sin migración (talla, duración, etc.)
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type TicketType = typeof ticketTypes.$inferSelect;
export type InsertTicketType = typeof ticketTypes.$inferInsert;

// Cupo compartido entre varias filas de ticketTypes (ej. Tanda "Founders"
// del 2º aniversario: Dúo + Soltera + Soltero + Trío + Grupo comparten un
// único pozo de 40 entradas -- comprar cualquiera de ellas gasta del mismo
// contador, no de uno independiente por acceso). El cap vive en UN solo
// lugar para que editarlo una vez alcance y no se desincronice entre filas.
// El remanente real se calcula en server/db.ts (getStockPoolRemaining):
// totalCap - SUM(soldCount) de todas las ticketTypes con este stockPoolId.
export const stockPools = mysqlTable("stockPools", {
  id: int("id").autoincrement().primaryKey(),
  eventId: int("eventId").notNull(),
  name: varchar("name", { length: 100 }).notNull(),
  totalCap: int("totalCap").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  eventIdx: index("stockPools_event_idx").on(table.eventId),
}));

export type StockPool = typeof stockPools.$inferSelect;
export type InsertStockPool = typeof stockPools.$inferInsert;

// Historial de cambios de stock por tipo de entrada (ej. subir el cupo de
// "soltero" cuando entran más solteros aceptados) -- registro de auditoría,
// no participa en el cálculo de stock disponible (eso sigue siendo
// totalStock - soldCount en ticketTypes).
export const ticketStockHistory = mysqlTable("ticketStockHistory", {
  id: int("id").autoincrement().primaryKey(),
  ticketTypeId: int("ticketTypeId").notNull(),
  eventId: int("eventId").notNull(),
  previousStock: int("previousStock").notNull(),
  newStock: int("newStock").notNull(),
  changedByUserId: int("changedByUserId"),
  // Cambio hecho por staff de cocina (ej. cargar porciones disponibles del
  // día) en vez de por un admin -- mutuamente excluyente con
  // changedByUserId, distinguen quién hizo el cambio porque operators y
  // users son tablas separadas (un id de operador podría coincidir con un
  // id de usuario sin tener relación).
  changedByOperatorId: int("changedByOperatorId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  ticketTypeIdx: index("ticketStockHistory_ticketTypeId_idx").on(table.ticketTypeId),
}));

export type TicketStockHistory = typeof ticketStockHistory.$inferSelect;
export type InsertTicketStockHistory = typeof ticketStockHistory.$inferInsert;

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
  // Código de comunidad usado en esta compra: permite contar los usos POR
  // EVENTO (maxUses de communityCodes es por evento, ver validateCommunityCode).
  communityCodeId: int("communityCodeId"),
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
  // Atribución UTM (pedido explícito del dueño): con $0 de pauta, es la
  // única forma de saber qué reel/historia/link realmente trae ventas, no
  // solo leads. Se capturan de la URL al aterrizar (client/src/lib/utm.ts),
  // se guardan en localStorage, y Checkout.tsx los manda acá al crear la
  // orden -- "último toque gana" (ver comentario en utm.ts). Quedan null en
  // ventas que no vinieron de un link etiquetado (directo, buscador,
  // embajador vía su propio código, caja).
  utmSource: varchar("utmSource", { length: 100 }),
  utmMedium: varchar("utmMedium", { length: 100 }),
  utmCampaign: varchar("utmCampaign", { length: 100 }),
  utmContent: varchar("utmContent", { length: 100 }),
  // PIN de la PlayCard elegido al recargar desde la web (/recargar). Va YA
  // hasheado (scrypt, mismo formato que customers.cardPinHash) y se aplica
  // recién cuando el pago se aprueba, solo si el cliente todavía no tenía PIN
  // -- así un pago pendiente no pierde el PIN que la persona escribió.
  pendingCardPinHash: varchar("pendingCardPinHash", { length: 255 }),
  // --- Módulo /caja (docs/ARQUITECTURA-CAJA.md §0.4, §4.3) ---
  // Canal de la venta: web = checkout normal, caja = venta presencial en el
  // evento, import = migración de la ticketera anterior (ya usado por
  // paymentMethod='Importado - ticketera anterior' antes de esta columna).
  channel: mysqlEnum("channel", ["web", "caja", "import"]).default("web").notNull(),
  operatorId: int("operatorId"), // quién registró la venta (solo canal caja)
  registerId: int("registerId"), // caja física donde se registró
  // Identidad permanente del comprador (`customers.id`), resuelta por email en
  // upsertCustomerFromOrder. Redundante con `buyerEmail` a propósito: el email
  // es editable y sensible a mayúsculas, y la tarjeta de membresía necesita un
  // enlace estable para leer saldo e historial sin rehacer el match por string
  // en cada consulta. Nullable porque las órdenes con email placeholder
  // (createInstantInvite, createStaffComp, ventas de caja sin email capturado)
  // no tienen identidad real de cliente detrás.
  customerId: int("customerId"),
  // Devolución desde Ventas Web (server/orderRefund.ts): la orden queda
  // `refunded`, pero a diferencia de una anulación de caja (que no deja nada
  // de estos campos) el negocio se queda con `total - refundAmount`, y esa
  // parte retenida SÍ cuenta como ingreso (ver cashCollectedFromOrders).
  refundAmount: decimal("refundAmount", { precision: 10, scale: 0 }),
  refundPercent: decimal("refundPercent", { precision: 5, scale: 2 }),
  refundReason: varchar("refundReason", { length: 500 }),
  refundedAt: timestamp("refundedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => [
  // La tabla no tenía ningún índice secundario pese a consultarse
  // constantemente por estas tres columnas (snapshot de caja, reportes por
  // evento, búsqueda de cliente, y ahora la tarjeta de membresía).
  index("orders_event_idx").on(t.eventId),
  index("orders_buyer_email_idx").on(t.buyerEmail),
  index("orders_customer_idx").on(t.customerId),
]);

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
  // Un extra comprado en la web y no usado no se pierde al terminar la fiesta:
  // queda pendiente y se puede canjear en un evento posterior que venda ese
  // mismo producto. Guarda el evento en el que se compró originalmente, para
  // poder mostrar "pendiente desde <fiesta>" en la tarjeta sin perder el dato
  // cuando `eventId` pase a apuntar al evento donde se canjeó. Se setea al
  // arrastrarlo, no al comprarlo. Es la misma excepción a "el código tiene que
  // ser de este evento" que ya existe para partyGifts en server/caja/redeem.ts.
  carriedFromEventId: int("carriedFromEventId"),
}, (t) => [
  // "Todo lo pendiente de este cliente" (la cara trasera de la tarjeta) se
  // consulta por las órdenes del cliente filtrando status='valid'.
  index("tickets_order_status_idx").on(t.orderId, t.status),
]);

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
  // Solo la promo relámpago la usa: lista de `ticketTypes.id` a los que se
  // les aplica el descuento. `null` (todos los códigos manuales de
  // Ajustes → Descuentos) = comportamiento de siempre, sobre el carrito
  // completo -- no rompe nada existente.
  applicableTicketTypeIds: json("applicableTicketTypeIds").$type<number[]>(),
  // Cuando está seteado, este código además REGALA una unidad de este
  // producto (cualquier categoría de la Carta -- no solo 'extra') al
  // comprar una entrada con él -- ver server/webhooks.ts, donde se genera
  // el orderItem sintético de precio $0 que hace que el regalo aparezca
  // junto al QR/PlayCard del comprador, listo para canjear en caja igual
  // que cualquier extra. `null` = comportamiento de siempre (solo
  // descuento en dinero, si lo tiene).
  giftTicketTypeId: int("giftTicketTypeId"),
  // `1` = el % de descuento se calcula sobre ticketTypes.originalPrice (el
  // precio general tachado), no sobre el precio vigente de la tanda actual
  // -- así el % no cambia según qué tan avanzada esté la venta. Hoy solo lo
  // usa el programa Cumpleañeros (ver server/birthdayApplications.ts
  // approveApplication); `0`/default = comportamiento de siempre (% sobre
  // el precio vigente), para no romper ningún código manual ni de
  // embajadores/promos ya existente.
  basedOnOriginalPrice: int("basedOnOriginalPrice").default(0).notNull(),
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
  // RUT de la persona dueña del código, normalizado -- null = código
  // compartido (comportamiento de siempre, cualquiera que lo escriba
  // puede usarlo). Con RUT asignado, el código pasa a ser personal y
  // permanente para esa persona (ver validateCommunityCode en db.ts):
  // solo sirve si el RUT que escribe en el checkout calza con este.
  ownerRut: varchar("ownerRut", { length: 20 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type CommunityCode = typeof communityCodes.$inferSelect;

// Aprobación de solteros (accesos «Soltero» y «Dúo dos hombres») por persona,
// en vez de un código: la persona la pide desde su app («Mi cuenta») y el admin
// aprueba o rechaza. Aprobada, compra esos accesos sin código con su sesión
// (server/solteros.ts). Es permanente hasta que el admin la revoque. Tabla
// aparte a propósito: no toca `customers`, que leen todas las pantallas.
export const solteroApprovals = mysqlTable("solteroApprovals", {
  id: int("id").autoincrement().primaryKey(),
  // Correo de «Mi cuenta», normalizado (minúsculas, sin espacios).
  email: varchar("email", { length: 320 }).notNull(),
  status: mysqlEnum("status", ["pendiente", "aprobado", "rechazado", "revocado"]).default("pendiente").notNull(),
  fullName: varchar("fullName", { length: 255 }),
  rut: varchar("rut", { length: 20 }),
  instagram: varchar("instagram", { length: 100 }),
  phone: varchar("phone", { length: 40 }),
  // Quién lo recomienda (nombre o Instagram de un cliente o embajador).
  referredBy: varchar("referredBy", { length: 160 }),
  message: varchar("message", { length: 500 }),
  // Nota del admin al decidir (no se le muestra a la persona si es un rechazo).
  adminNote: varchar("adminNote", { length: 500 }),
  requestedAt: timestamp("requestedAt").defaultNow().notNull(),
  reviewedAt: timestamp("reviewedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => [
  uniqueIndex("soltero_approvals_email_idx").on(t.email),
  index("soltero_approvals_status_idx").on(t.status),
]);

export type SolteroApproval = typeof solteroApprovals.$inferSelect;

export type InsertCommunityCode = typeof communityCodes.$inferInsert;

// Campañas aliadas (ver shared/partnerCampaign.ts): un link privado que vende
// los accesos de siempre a un precio por persona especial, para traer a la
// comunidad de un aliado. El precio solo existe acá y en el servidor -- la
// web normal no lo ve.
export const partnerCampaigns = mysqlTable("partnerCampaigns", {
  id: int("id").autoincrement().primaryKey(),
  slug: varchar("slug", { length: 50 }).notNull().unique(),
  eventId: int("eventId").notNull(),
  label: varchar("label", { length: 100 }).notNull(),
  emoji: varchar("emoji", { length: 16 }).default("🎧").notNull(),
  // Línea de cabecera del link (el B2B, la pista). null = texto por defecto.
  headline: varchar("headline", { length: 255 }),
  pricePerPerson: int("pricePerPerson").notNull(),
  // string[] de accesoSlug vendibles; null = todos menos Soltero.
  allowedAccesoSlugs: json("allowedAccesoSlugs"),
  // Tope de PERSONAS (no órdenes) con pago aprobado; null = sin tope.
  maxPersons: int("maxPersons"),
  isActive: int("isActive").default(1).notNull(),
  // Valores + derecho de permanencia, una regla por línea. null = borrador
  // por defecto (PARTNER_DEFAULT_RULES).
  rulesText: text("rulesText"),
  // Horario del set para el recordatorio previo a la fiesta (ej. "B2B desde
  // la 01:00"). Texto libre; null = el recordatorio no lo menciona.
  setTimeText: varchar("setTimeText", { length: 120 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type PartnerCampaign = typeof partnerCampaigns.$inferSelect;

// Qué órdenes entraron por una campaña aliada (el sello 🎧 en Ventas Web y el
// conteo de personas de esa comunidad). Tabla aparte y no una columna en
// `orders` a propósito: `orders` se lee con select() completo en todo el
// sitio, y una columna nueva sin migrar botaría todas las ventas -- así, si
// la migración se atrasa, solo falla el link de la campaña.
export const partnerOrders = mysqlTable("partnerOrders", {
  id: int("id").autoincrement().primaryKey(),
  orderId: int("orderId").notNull().unique(),
  campaignId: int("campaignId").notNull(),
  // Qué DJ trajo la venta (`?dj=aldo` en el link, ver PARTNER_REFS). null =
  // link sin firma.
  ref: varchar("ref", { length: 32 }),
  // Correos propios de la campaña, uno por orden como mucho.
  reminderSentAt: timestamp("reminderSentAt"),
  thanksSentAt: timestamp("thanksSentAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (t) => [
  index("partner_orders_campaign_idx").on(t.campaignId),
]);

// Leads: alguien que dejó su contacto sin comprar todavía (hoy el único
// gancho es "avisame antes de que suba el precio" en UrgencySection, ver
// LeadCaptureInline en Home.tsx). Sin esto, cualquiera que visite el sitio
// y no compre en el momento se pierde para siempre -- con $0 de pauta y
// 8 semanas de campaña, es la principal defensa contra esa fuga (ver plan
// de ventas del aniversario).
export const leads = mysqlTable("leads", {
  id: int("id").autoincrement().primaryKey(),
  email: varchar("email", { length: 320 }).notNull(),
  phone: varchar("phone", { length: 20 }),
  instagram: varchar("instagram", { length: 100 }),
  eventId: int("eventId"),
  // De dónde vino el gancho -- hoy solo existe 'price_alert' ("avisame antes
  // de que suba el precio"), se deja como texto libre por si se agrega un
  // gancho de lista de espera antes de abrir venta ("avisame cuando abra").
  source: varchar("source", { length: 50 }).default('price_alert').notNull(),
  utmSource: varchar("utmSource", { length: 100 }),
  utmMedium: varchar("utmMedium", { length: 100 }),
  utmCampaign: varchar("utmCampaign", { length: 100 }),
  // Si este lead terminó comprando, qué orden generó -- se completa a mano
  // desde el admin (todavía no hay matcheo automático por email).
  convertedOrderId: int("convertedOrderId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  // Mismo email puede volver a dejar su contacto para OTRO evento más
  // adelante sin chocar -- pero reenviar el mismo formulario para el mismo
  // evento actualiza el lead existente en vez de duplicarlo (ver
  // db.createLead, onDuplicateKeyUpdate).
  emailEventIdx: uniqueIndex("leads_email_event_idx").on(table.email, table.eventId),
}));

export type Lead = typeof leads.$inferSelect;
export type InsertLead = typeof leads.$inferInsert;

// Lista de bloqueo de clientes (shared/blockedMatch.ts): si el RUT, teléfono,
// Instagram o correo del comprador o de algún acompañante coincide (normalizado),
// createOrder rechaza la compra antes de crear la orden y de cobrar, los
// accesos manuales no se crean y la puerta avisa "no permitir ingreso".
// El nombre completo NO bloquea: solo avisa ("posible bloqueado"), por los
// homónimos.
//
// Cada ficha puede tener datos incompletos (basta con uno) y se va completando
// a medida que llega información: las columnas `*Norm` y `nameFold` son las
// versiones normalizadas que se comparan; `rut`, `email`, `phone` e
// `instagram` guardan lo que escribió la fuente. `sourceVenue` es el local o
// la productora donde lo bloquearon (ej. "Sinners").
export const blockedCustomers = mysqlTable("blockedCustomers", {
  id: int("id").autoincrement().primaryKey(),
  rut: varchar("rut", { length: 20 }),
  fullName: varchar("fullName", { length: 255 }),
  email: varchar("email", { length: 320 }),
  phone: varchar("phone", { length: 40 }),
  instagram: varchar("instagram", { length: 100 }),
  rutNorm: varchar("rutNorm", { length: 20 }),
  emailNorm: varchar("emailNorm", { length: 320 }),
  phoneNorm: varchar("phoneNorm", { length: 20 }),
  igNorm: varchar("igNorm", { length: 40 }),
  nameFold: varchar("nameFold", { length: 255 }),
  reason: varchar("reason", { length: 500 }),
  sourceVenue: varchar("sourceVenue", { length: 120 }),
  sourceProducer: varchar("sourceProducer", { length: 120 }),
  // "YYYY-MM-DD" del bloqueo original, si se sabe.
  blockedOn: varchar("blockedOn", { length: 10 }),
  // Quién pasó el dato (persona o productora amiga).
  sourceBy: varchar("sourceBy", { length: 120 }),
  notes: text("notes"),
  isActive: int("isActive").default(1).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => [
  index("blocked_rut_norm_idx").on(t.rutNorm),
  index("blocked_email_norm_idx").on(t.emailNorm),
  index("blocked_phone_norm_idx").on(t.phoneNorm),
  index("blocked_ig_norm_idx").on(t.igNorm),
  index("blocked_name_fold_idx").on(t.nameFold),
]);

export type BlockedCustomer = typeof blockedCustomers.$inferSelect;
export type InsertBlockedCustomer = typeof blockedCustomers.$inferInsert;

// Config general del sitio (fila única) — números de Instagram del footer y
// el recargo por servicio (%) que se suma a toda venta nueva (entradas +
// extras), editables desde el admin.
export const siteSettings = mysqlTable("siteSettings", {
  id: int("id").autoincrement().primaryKey(),
  instagramFollowers: int("instagramFollowers").default(0).notNull(),
  instagramPosts: int("instagramPosts").default(0).notNull(),
  serviceFeePercent: decimal("serviceFeePercent", { precision: 5, scale: 2 }).default("0").notNull(),
  // Comisión de Mercado Pago (~3,5% por defecto, editable): se resta sola en
  // el P&L de cada evento en vez de depender de que alguien cargue un gasto
  // manual de categoría "comisiones" -- ver getEventPnl/computePnl.
  cardFeePercent: decimal("cardFeePercent", { precision: 5, scale: 2 }).default("3.50").notNull(),
  // Monto que se le paga al establecimiento por CADA auto que pagó
  // estacionamiento (online o en la puerta) -- no por los de staff gratis.
  // Editable porque es un precio negociado con el dueño del estacionamiento,
  // no algo que dependa del código -- ver getParkingReport.
  parkingVenueFeeClp: int("parkingVenueFeeClp").default(3000).notNull(),
  // Proveedor único de cocina (pedido explícito del usuario): a quién
  // rendirle cuentas de lo vendido en productos `toKitchen`. Config global,
  // no por evento -- si cambia de proveedor, se actualiza acá.
  kitchenVendorName: varchar("kitchenVendorName", { length: 255 }),
  kitchenVendorEmail: varchar("kitchenVendorEmail", { length: 320 }),
  // Imagen por defecto al compartir el sitio en redes (Open Graph/Twitter)
  // cuando la página no es de un evento puntual -- cada evento sigue usando
  // su propio `imageUrl` en su página de detalle. null = usa el flyer
  // estático de siempre (og-candyland.jpg). Se sirve inyectada del lado del
  // servidor, ver server/ssrMeta.ts -- un campo editable acá solo no
  // alcanzaría para cambiar el preview de WhatsApp/Facebook (SPA sin SSR).
  ogImageUrl: varchar("ogImageUrl", { length: 1024 }),
  // Aviso automático diario de "primeros cupos" (pedido explícito del
  // dueño): cuando está prendido, un cron manda ~50 correos/día a clientes
  // que todavía no compraron el evento destacado, con el cupo REAL del pool
  // compartido resuelto al momento de mandar cada tanda (nunca la palabra
  // "Founders" -- ver server/foundersPromo.ts). Arranca apagado a propósito
  // -- desplegar el código no debe empezar a mandar correos solo, el dueño
  // lo prende desde el admin cuando esté listo.
  foundersPromoEnabled: int("foundersPromoEnabled").default(0).notNull(),
  // Aviso automático diario de la 2ª tanda (nuevo precio) -- mismo criterio
  // que foundersPromoEnabled: arranca apagado y el dueño lo prende a mano
  // (ver server/tanda2Promo.ts). Excluyente con foundersPromoEnabled para no
  // sumar 100 correos/día contra el límite de Resend.
  tanda2PromoEnabled: int("tanda2PromoEnabled").default(0).notNull(),
  // Aviso diario CONTINUO de venta de entradas (server/salesDrip.ts): reemplaza
  // a los dos avisos por tanda. Sigue al evento destacado hasta el día de la
  // fiesta y, al terminar una vuelta, espera `salesDripIntervalDays` días y
  // vuelve a escribirle a quien todavía no compró. Se lee aparte de
  // getSiteSettings (ver getSalesDripSettings) para que el sitio no dependa de
  // que esta migración ya esté aplicada.
  salesDripEnabled: int("salesDripEnabled").default(1).notNull(),
  salesDripIntervalDays: int("salesDripIntervalDays").default(4).notNull(),
  // Modo Halloween (pedido explícito del dueño): con esto en 1, la portada
  // "/" se muestra con la paleta Halloween (clase `.halloween` en <html>,
  // ver client/src/pages/HalloweenHome.tsx). Se prende y apaga a mano
  // desde Admin -> Ajustes; /halloween siempre muestra la vista previa.
  halloweenModeEnabled: int("halloweenModeEnabled").default(0).notNull(),
  // Textos editables + interruptores por sección del correo de compra
  // (server/email.ts buildOrderEmail) -- forma en shared/emailTemplateConfig.ts.
  // null = usar todos los valores por defecto (todas las secciones prendidas).
  emailTemplateConfig: json("emailTemplateConfig"),
  // Interruptores de las alertas del admin (push + correo resumen) -- forma
  // en shared/adminAlertsConfig.ts. null = todas apagadas (desplegar esto no
  // debe empezar a mandar nada solo, mismo criterio que foundersPromoEnabled).
  adminAlertsConfig: json("adminAlertsConfig"),
  // Ajustes tributarios (shared/sii.ts SiiConfig): plazo del F29, tasa de
  // PPM, RUT de la empresa, fechas del calendario y avisos.
  siiConfig: json("siiConfig"),
  // Plantillas de Promo Flash guardadas para activar con un toque durante
  // la fiesta -- forma en shared/flashPromoPresets.ts. null = ninguna
  // guardada todavía.
  flashPromoPresets: json("flashPromoPresets"),
  // Config del agente de IA que contesta el Instagram -- forma en
  // shared/instagramAgentConfig.ts. null = agente APAGADO y con los textos
  // por defecto: desplegar este código no debe empezar a contestarle a
  // nadie solo (mismo criterio que foundersPromoEnabled y adminAlertsConfig).
  instagramAgentConfig: json("instagramAgentConfig"),
  // Config del agente de WhatsApp -- forma en shared/whatsappAgentConfig.ts.
  // Solo lo propio del canal (interruptor, menú, tope, recordatorio): lo que
  // el agente SABE (notas de marca, tono, mensaje de derivación) se comparte
  // con el de Instagram. null = APAGADO, mismo criterio que arriba.
  whatsappAgentConfig: json("whatsappAgentConfig"),
  // Avisos push automáticos a clientes (recordatorio del evento, nuevo evento,
  // carrito abandonado) -- forma en shared/customerPushConfig.ts. null = todo
  // APAGADO, mismo criterio que arriba.
  customerPushConfig: json("customerPushConfig"),
  // Beneficios de la cuenta de socios (cupón de bienvenida, por nivel y de
  // cumpleaños) -- forma en shared/memberConfig.ts. null = todo APAGADO.
  memberConfig: json("memberConfig"),
  // Último reporte del coach semanal del agente (server/agentCoach.ts): qué
  // preguntan más, dónde se enfría la gente y qué agregarle al conocimiento.
  agentCoachReport: json("agentCoachReport"),
  // Estado del Director comercial IA (server/salesStrategist.ts): el último
  // reporte de estrategia de ventas y el interruptor del correo de los lunes.
  salesStrategyState: json("salesStrategyState"),
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
// comisión en plata por cada venta con su código -- por defecto no dan
// descuento al comprador (solo trackean quién trajo la venta); si el dueño le
// configura `buyerDiscountPercent`, el comprador recibe ese % sobre el acceso. El mismo campo de código de
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
  // Descuento (%) que reciben quienes compran con el código/link de este
  // embajador, solo sobre el valor del acceso (nunca extras). null o 0 = sin
  // descuento (lo normal). Tope en shared/ambassadorDiscount.ts.
  buyerDiscountPercent: decimal("buyerDiscountPercent", { precision: 5, scale: 2 }),
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
  // Cuándo se le pagó esta comisión al embajador (null = pendiente de pago).
  paidAt: timestamp("paidAt"),
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
  // Hora del día (0-23) en que sale el correo semanal, en hora de Chile --
  // el cron corre cada hora y se autolimita a esta (server/cronRoutes.ts
  // /api/cron/ambassador-weekly, vía shouldSendWeeklyAmbassadorEmailNow).
  weeklyEmailHourChile: int("weeklyEmailHourChile").default(9).notNull(),
  // Descuento general para quienes compran con el código/link de CUALQUIER
  // embajador, solo sobre el acceso. No modifica a los embajadores que ya
  // tienen un % propio (`exclusiveAmbassadors.buyerDiscountPercent`): solo se
  // agrega a los que no tienen. `...EndsAt` (opcional) lo apaga solo.
  generalBuyerDiscountEnabled: int("generalBuyerDiscountEnabled").default(0).notNull(),
  generalBuyerDiscountPercent: decimal("generalBuyerDiscountPercent", { precision: 5, scale: 2 }).default("0").notNull(),
  generalBuyerDiscountEndsAt: timestamp("generalBuyerDiscountEndsAt"),
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
  // Los beneficios se ganan POR EVENTO. Las filas anteriores a ese cambio
  // quedan con eventId null (se marcaron por mes).
  eventId: int("eventId"),
  monthKey: varchar("monthKey", { length: 7 }).notNull(),
  benefitKey: varchar("benefitKey", { length: 64 }).notNull(),
  note: text("note"),
  deliveredAt: timestamp("deliveredAt").defaultNow().notNull(),
}, (t) => [
  uniqueIndex("ambassadorBenefitDeliveries_event_unique").on(t.ambassadorId, t.eventId, t.benefitKey),
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
  // Legacy: un único link ("Descargar el material"), reemplazado por
  // `links` de abajo (pedido explícito del dueño, 14/09: puede necesitar
  // más de uno -- carpeta de Drive, un doc de instrucciones, etc). Se deja
  // la columna sin borrar para no perder el valor de filas ya guardadas
  // antes de este cambio; el correo ya no la usa si `links` trae algo.
  linkUrl: varchar("linkUrl", { length: 500 }),
  // { label: string; url: string }[] -- cuantos links haga falta cada
  // semana, cada uno con su propio texto (ej. "📂 Carpeta de Drive").
  links: json("links"),
  // Carpeta de Google Drive con las fotos/videos de la semana y las que se
  // eligieron para el correo ({ id, name, mimeType }[]) -- ver
  // server/googleDrive.ts.
  driveFolderUrl: varchar("driveFolderUrl", { length: 500 }),
  images: json("images"),
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

// --- Programa Cumpleañeros ---
//
// Postulación para ser reconocido como cumpleañero de UN evento puntual (su
// cumpleaños debe caer dentro de ±5 días de esa fecha -- ver
// shared/birthdayApplication.ts isBirthdayEligible). Igual que
// ambassadorApplications, sin único en email: deben poder repostular en
// otro evento futuro.
export const birthdayApplications = mysqlTable("birthdayApplications", {
  id: int("id").autoincrement().primaryKey(),
  eventId: int("eventId").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  email: varchar("email", { length: 320 }).notNull(),
  whatsapp: varchar("whatsapp", { length: 20 }).notNull(),
  instagram: varchar("instagram", { length: 100 }),
  // Fecha de nacimiento declarada -- solo se usa el día/mes para calcular la
  // ventana ±5 días respecto a events.eventDate, no se pide ni valida el año.
  birthDate: varchar("birthDate", { length: 10 }).notNull(),
  message: text("message"),
  acceptedTerms: int("acceptedTerms").default(0).notNull(),
  status: mysqlEnum("status", ["pendiente", "aprobada", "rechazada"]).default("pendiente").notNull(),
  reviewNote: text("reviewNote"),
  reviewedAt: timestamp("reviewedAt"),
  createdBirthdayPersonId: int("createdBirthdayPersonId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => [
  index("birthdayApplications_email_idx").on(t.email),
  index("birthdayApplications_event_idx").on(t.eventId),
  index("birthdayApplications_status_idx").on(t.status),
]);

export type BirthdayApplication = typeof birthdayApplications.$inferSelect;

// Cumpleañero ya aprobado para un evento puntual. `discountCodeId` apunta a
// una fila normal de discountCodes (percentage, eventId fijado a este
// evento) -- el checkout no necesita saber que existe este programa, valida
// el código igual que cualquier otro. `currentTier`/`rewardOrderId` llevan
// el estado de qué tramo de premios tiene activo hoy (ver
// shared/birthdayTiers.ts) -- los tramos NO se acumulan, cada uno
// reemplaza al anterior dentro de la misma orden $0.
export const birthdayPeople = mysqlTable("birthdayPeople", {
  id: int("id").autoincrement().primaryKey(),
  applicationId: int("applicationId").notNull(),
  eventId: int("eventId").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  email: varchar("email", { length: 320 }).notNull(),
  whatsapp: varchar("whatsapp", { length: 20 }).notNull(),
  birthDate: varchar("birthDate", { length: 10 }).notNull(),
  discountCodeId: int("discountCodeId").notNull(),
  // Último tramo alcanzado (0 = ninguno todavía), ver BIRTHDAY_TIERS.
  currentTier: int("currentTier").default(0).notNull(),
  // true cuando el tramo alcanzado incluye "entrada gratis para el próximo
  // evento" y todavía no se le asignó un evento destino.
  pendingNextEventCredit: int("pendingNextEventCredit").default(0).notNull(),
  pendingCreditRedeemedEventId: int("pendingCreditRedeemedEventId"),
  // Orden $0 (paymentStatus='approved') donde viven los orderItems/tickets
  // sintéticos de su premio vigente -- se crea la primera vez que alcanza
  // el tramo 1, y se reutiliza (reemplazando ítems) en tramos siguientes.
  rewardOrderId: int("rewardOrderId"),
  active: int("active").default(1).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => [
  uniqueIndex("birthdayPeople_application_idx").on(t.applicationId),
  uniqueIndex("birthdayPeople_discountCode_idx").on(t.discountCodeId),
  index("birthdayPeople_event_idx").on(t.eventId),
]);

export type BirthdayPerson = typeof birthdayPeople.$inferSelect;
export type InsertBirthdayPerson = typeof birthdayPeople.$inferInsert;

// --- Módulo /caja (docs/ARQUITECTURA-CAJA.md §4.2) ---

// Operadores de caja: cajera, supervisor, admin (más barra/acceso a futuro).
// Login por PIN, independiente del login admin por password (users.role).
export const operators = mysqlTable("operators", {
  id: int("id").autoincrement().primaryKey(),
  eventId: int("eventId").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  pinHash: varchar("pinHash", { length: 255 }).notNull(),
  role: mysqlEnum("role", ["admin", "supervisor", "caja", "barra", "acceso", "cocina", "guardarropia"]).notNull(),
  // Opcional (pedido explícito del usuario): si está cargado, el cierre de
  // turno le manda a esta cajera el PDF de cuadre con copia adjunta, además
  // de mandárselo siempre al admin.
  email: varchar("email", { length: 320 }),
  active: int("active").default(1).notNull(),
  // Rate limiting del login por PIN (docs/ARQUITECTURA-CAJA.md §13, riesgo 7)
  // -- el PIN es mucho más débil que una contraseña y la tablet es compartida.
  failedPinAttempts: int("failedPinAttempts").default(0).notNull(),
  lockedUntil: timestamp("lockedUntil"),
  // La persona del staff (`staffMembers`) de la que sale este acceso: su PIN
  // y su cargo mandan. Nulo = operador suelto creado a mano.
  staffId: int("staffId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => [
  index("operators_event_idx").on(t.eventId),
  index("operators_staff_idx").on(t.staffId),
]);

export type Operator = typeof operators.$inferSelect;
export type InsertOperator = typeof operators.$inferInsert;

// Cajas físicas (ej. "Caja 1", "Caja 2") usadas en el evento.
export const registers = mysqlTable("registers", {
  id: int("id").autoincrement().primaryKey(),
  eventId: int("eventId").notNull(),
  name: varchar("name", { length: 100 }).notNull(),
  active: int("active").default(1).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (t) => [
  index("registers_event_idx").on(t.eventId),
]);

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
  eventId: int("eventId").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  enrollCode: varchar("enrollCode", { length: 16 }).unique(),
  enrollCodeExpiresAt: timestamp("enrollCodeExpiresAt"),
  deviceTokenHash: varchar("deviceTokenHash", { length: 255 }),
  enrolled: int("enrolled").default(0).notNull(),
  active: int("active").default(1).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  lastSeenAt: timestamp("lastSeenAt"),
}, (t) => [
  index("devices_event_idx").on(t.eventId),
]);

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
  // Saldo prepagado en PLATA (1 CLP = 1 CLP), distinto e independiente de
  // `playcoins`: esto es dinero que el cliente cargó, no puntos que ganó. Los
  // dos conviven en la misma tarjeta sin mezclarse. Igual que `playcoins`, es
  // una proyección cacheada de la suma de `prepaidLedger` para este cliente.
  prepaidBalance: int("prepaidBalance").default(0).notNull(),
  // Primera vez que entró a «Mi cuenta» (código por correo): desde ahí es
  // «socio» y le llegan los cupones y la preventa anticipada (server/members.ts).
  memberSince: timestamp("memberSince"),
  // PIN de 4 dígitos que el cliente define en su propia tarjeta para poder
  // GASTAR el saldo. La tarjeta se VE con solo tener el ticketCode (token
  // portador, igual que hoy), pero descontar plata exige además esto -- así una
  // foto del QR ajeno no alcanza para gastarle el saldo a nadie. Formato
  // "salt:hash" de server/caja/auth.ts hashPin() (scrypt); no bcrypt, que no
  // está en las dependencias del proyecto. Los intentos fallidos NO llevan
  // columnas propias acá: se cuentan en la tabla `rateLimits` con la clave
  // `cardpin:<customerId>`.
  cardPinHash: varchar("cardPinHash", { length: 255 }),
  cardPinSetAt: timestamp("cardPinSetAt"),
  /** Cliente en Mercado Pago (Clientes y Tarjetas): sus tarjetas guardadas viven allá, acá solo el id. */
  mpCustomerId: varchar("mpCustomerId", { length: 64 }),
  notes: text("notes"),
  // --- Ficha completa del cliente (Admin → Clientes) ---
  // Fecha de nacimiento: "YYYY-MM-DD", o "MM-DD" cuando solo se sabe el
  // día/mes (el año no se pide en Cumpleañeros, ver birthdayApplications).
  birthDate: varchar("birthDate", { length: 10 }),
  gender: mysqlEnum("gender", ["hombre", "mujer", "pareja", "otro"]),
  city: varchar("city", { length: 100 }), // ciudad o comuna
  // Permisos de contacto: la baja de correo se respeta en TODAS las audiencias
  // de mailing/promos/encuestas (listCustomers({ forMailing: true })).
  emailOptOut: int("emailOptOut").default(0).notNull(),
  whatsappOptOut: int("whatsappOptOut").default(0).notNull(),
  optOutAt: timestamp("optOutAt"),
  optOutReason: varchar("optOutReason", { length: 200 }),
  // De dónde llegó (instagram, embajador, referido, web, caja, evento, otro) y
  // el código del embajador que lo trajo (exclusiveAmbassadors.code).
  source: varchar("source", { length: 40 }),
  ambassadorCode: varchar("ambassadorCode", { length: 32 }),
  // null = nivel automático; 'vip' o 'inactivo' fuerzan el nivel a mano.
  levelOverride: varchar("levelOverride", { length: 20 }),
  // Campos editados a mano ("fullName", "phone", ...): las compras nuevas
  // (upsertCustomerFromOrder) no los pisan.
  lockedFields: json("lockedFields"),
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
  // Debe coincidir siempre con `OpType` en server/caja/ops.ts -- se
  // desincronizó DOS veces ya, y las dos con el mismo síntoma: un tipo nuevo
  // agregado al tipo de TS pero nunca migrado acá, así que el INSERT de esa
  // operación fallaba en producción sin que nada lo avisara antes.
  //   1ª vez: faltaban 'checkin', 'locker_return' y 'kitchen_update' -- rompía
  //           el check-in de /puerta y Aprobar/Entregado en /cocina.
  //   2ª vez: faltaba 'parking_paid' -- rompía TODO cobro de estacionamiento en
  //           la puerta (server/caja/parkingPaid.ts).
  // Si agregas un valor a OpType, agrégalo acá EN EL MISMO commit.
  type: mysqlEnum("type", ["redeem", "checkin", "sale", "void_code", "note", "shift_open", "shift_close", "manual_adjust", "locker_return", "kitchen_update", "parking_paid", "void_sale"]).notNull(),
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

// Alertas del vigilante de caja (server/caja/alerts.ts): historial de todo lo
// que se le avisó al dueño durante el evento, y a la vez la deduplicación --
// `dedupeKey` único hace que el cron de cada 5 min no repita la misma alerta
// (ej. "stock bajo de Piscola") en cada pasada.
export const cajaAlerts = mysqlTable("cajaAlerts", {
  id: int("id").autoincrement().primaryKey(),
  eventId: int("eventId").notNull(),
  kind: varchar("kind", { length: 40 }).notNull(),
  severity: mysqlEnum("severity", ["info", "warning", "critical"]).default("warning").notNull(),
  title: varchar("title", { length: 200 }).notNull(),
  body: text("body").notNull(),
  dedupeKey: varchar("dedupeKey", { length: 191 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (t) => [
  uniqueIndex("cajaAlerts_dedupe_unique").on(t.dedupeKey),
  index("cajaAlerts_event_created_idx").on(t.eventId, t.createdAt),
]);

export type CajaAlert = typeof cajaAlerts.$inferSelect;

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
/** Rastro de las acciones destructivas del panel de admin.
 *
 * Todo lo que pasa por los terminales queda auditado en el ledger `ops`
 * (append-only, idempotente por opId). El lado admin no tenía nada
 * equivalente: borrar una compra, editar un gasto, eliminar un evento o
 * cambiar un precio no dejaba ningún rastro, así que después no había forma
 * de reconstruir por qué un número había cambiado.
 *
 * Se guarda aparte de `ops` a propósito: `ops` es la bitácora de la
 * operación de la fiesta (una cajera, un dispositivo, un evento), y mezclarle
 * acciones de admin ensuciaría los conteos que ya salen de esa tabla. */
export const adminAuditLog = mysqlTable("adminAuditLog", {
  id: int("id").autoincrement().primaryKey(),
  // Ruta tRPC que se ejecutó, ej. "orders.delete" -- es lo que hace el
  // registro legible sin tener que adivinar a qué botón corresponde.
  action: varchar("action", { length: 100 }).notNull(),
  targetType: varchar("targetType", { length: 50 }),
  targetId: varchar("targetId", { length: 64 }),
  eventId: int("eventId"),
  // Foto de lo que se borró o de cómo estaba antes de editarse. Sin esto el
  // registro dice QUE pasó pero no QUÉ se perdió, que es justo lo que se
  // necesita para reconstruir.
  payload: json("payload"),
  ip: varchar("ip", { length: 64 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (t) => [
  index("adminAuditLog_created_idx").on(t.createdAt),
  index("adminAuditLog_action_idx").on(t.action),
]);

export type AdminAuditLogRow = typeof adminAuditLog.$inferSelect;

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
  // Efectivo que SALIÓ del cajón durante el turno para pagar gastos
  // (`expenses.paidFromShiftId`). Se congela al cerrar, igual que `expected*`:
  // si un gasto se edita después, el arqueo de esa noche no cambia. Sin esta
  // resta, la plata usada para pagar un proveedor se leía como faltante.
  cashPaidOut: decimal("cashPaidOut", { precision: 10, scale: 0 }),
  salesCount: int("salesCount"),
  redeemsCount: int("redeemsCount"),
  topCustomers: json("topCustomers"), // [{ name, email, total }]
  topProducts: json("topProducts"), // [{ name, quantity, revenue }]
  status: mysqlEnum("status", ["open", "closed"]).default("open").notNull(),
  // Llave de unicidad del turno ABIERTO de una caja. `openShift` hace
  // SELECT-y-después-INSERT sin transacción, así que dos tablets que abren a
  // la vez podían crear dos turnos abiertos en la misma caja -- y ahí el
  // arqueo de cada uno solo cubre parte de la noche mientras el cajón tiene
  // todo (la diferencia gigante del evento pasado). Al ser NULL cuando el
  // turno está cerrado, el índice único no estorba al historial: MySQL no
  // compara filas con NULL entre sí, así que se pueden cerrar todos los
  // turnos que se quiera sobre la misma caja.
  openKey: varchar("openKey", { length: 64 }).generatedAlwaysAs(
    sql`(case when \`status\` = 'open' then concat(\`eventId\`, '-', ifnull(\`registerId\`, 'x')) else null end)`,
    // VIRTUAL y no STORED a propósito: TiDB (la base de producción) no
    // permite agregar una columna generada STORED a una tabla que ya existe,
    // pero sí una VIRTUAL, y sí acepta índices sobre ella.
    { mode: 'virtual' },
  ),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (t) => [
  uniqueIndex("shifts_open_unique").on(t.openKey),
]);

export type Shift = typeof shifts.$inferSelect;
export type InsertShift = typeof shifts.$inferInsert;

// Guardarropía: una fila por prenda dejada. `tagNumber` ya NO lo teclea la
// cajera: lo genera la propia tablet como correlativo `<nº de caja>-<n>`
// (client/src/pages/caja/db.ts nextLockerTagNumber), mismo patrón y mismo
// motivo que el número de comanda de cocina (ver shared/kitchen.ts) -- el
// prefijo de caja es lo que garantiza que dos tablets sin señal nunca
// asignen el mismo número entre sí, sin necesitar coordinarse. El único de
// abajo sigue siendo la red de seguridad, ahora casi imposible de disparar.
export const lockerItems = mysqlTable("lockerItems", {
  id: int("id").autoincrement().primaryKey(),
  eventId: int("eventId").notNull(),
  orderId: int("orderId").notNull(),
  opId: varchar("opId", { length: 64 }).notNull(),
  tagNumber: varchar("tagNumber", { length: 16 }).notNull(),
  // Nombre que la cajera le pide al cliente al cobrar -- mismo criterio que
  // kitchenTickets.customerName: un número correlativo es difícil de
  // recordar para retirar la prenda, un nombre no.
  customerName: varchar("customerName", { length: 120 }),
  // 'pendiente' = recién cobrada en caja, todavía sin confirmar en
  // /guardarropia que la prenda está físicamente en el mostrador -- la
  // plata se cobra en caja, pero "guardado" solo lo marca el staff de
  // guardarropía al tenerla en la mano. De ahí en adelante alterna entre
  // 'guardado'/'retirado' las veces que la misma persona entre y saque
  // -- el número (`tagNumber`) es siempre el mismo, nunca se genera uno
  // nuevo para un reingreso.
  // 'anulado' = la venta de caja que la cobró se anuló con clave admin
  // (server/caja/voidSale.ts) -- la fila nunca se borra.
  // 'parcial' = retiraron algo pero no todo (queda anotado qué en `partialNote`): amarillo en /guardarropia.
  status: mysqlEnum("status", ["pendiente", "guardado", "parcial", "retirado", "anulado"]).default("pendiente").notNull(),
  // Qué sacaron en un retiro parcial («chaqueta; bolso»). Se vacía al volver a guardarse todo o al retirarse todo.
  partialNote: varchar("partialNote", { length: 255 }),
  chargedAt: timestamp("chargedAt").defaultNow().notNull(),
  // Se pisan en cada ciclo -- siempre reflejan el último "Recibido"/
  // "Entregado", no un historial completo (igual que kitchenTickets con
  // approvedAt/deliveredAt).
  receivedAt: timestamp("receivedAt"),
  receivedByOperatorId: int("receivedByOperatorId"),
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
  // 'anulado' = la venta se anuló con clave admin (server/caja/voidSale.ts):
  // sale de la cola de cocina sin borrar la comanda.
  status: mysqlEnum("status", ["pendiente", "aprobado", "entregado", "anulado"]).default("pendiente").notNull(),
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
  reason: mysqlEnum("reason", ["earn_web", "earn_caja", "redeem_caja", "manual_adjust", "spend_playmatch"]).notNull(),
  orderId: int("orderId"), // orden web o venta de caja que originó el movimiento (si aplica)
  opId: varchar("opId", { length: 36 }), // id del op de caja (idempotencia); null para web
  balanceAfter: int("balanceAfter").notNull(),
  note: text("note"), // motivo libre en ajustes manuales del admin
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (t) => [
  // La tabla no tenía ningún índice pese a que awardPlaycoins consulta por
  // (opId, reason) y (orderId, reason) en cada compra, y deleteOrderCascade
  // por orderId. Son índices, no restricciones únicas: acá la idempotencia
  // sigue siendo el SELECT previo de awardPlaycoins (ver prepaidLedger, que
  // por ser plata sí la apoya en el motor).
  index("playcoins_ledger_customer_idx").on(t.customerId, t.createdAt),
  index("playcoins_ledger_order_idx").on(t.orderId),
  index("playcoins_ledger_op_idx").on(t.opId),
]);

export type PlaycoinsLedgerEntry = typeof playcoinsLedger.$inferSelect;
export type InsertPlaycoinsLedgerEntry = typeof playcoinsLedger.$inferInsert;

// Ledger append-only del SALDO PREPAGADO en plata, espejo de
// `playcoinsLedger`: nunca se actualiza ni se borra una fila, toda carga/gasto/
// devolución/ajuste es una fila nueva, y `customers.prepaidBalance` es la
// proyección cacheada de la suma. La diferencia con Playcoins es que acá es
// dinero real, y eso cambia dos cosas:
//
//  1. El descuento NO se hace leyendo el saldo y después restando (dos pasos, y
//     este proyecto no usa transacciones en ningún lado -- ver el comentario en
//     server/db.ts:429). Se hace con una sola sentencia condicional, que TiDB
//     aplica atómicamente:
//        UPDATE customers SET prepaidBalance = prepaidBalance - ?
//        WHERE id = ? AND prepaidBalance >= ?
//     Si affectedRows es 0, no había saldo y no se tocó nada. El saldo no puede
//     quedar en negativo ni siquiera con dos terminales compitiendo.
//  2. La idempotencia se apoya en restricciones únicas de verdad (abajo), no en
//     un SELECT previo como hace awardPlaycoins.
export const prepaidLedger = mysqlTable("prepaidLedger", {
  id: int("id").autoincrement().primaryKey(),
  customerId: int("customerId").notNull(),
  delta: int("delta").notNull(), // + carga, - gasto/ajuste
  reason: mysqlEnum("reason", [
    "topup_web",     // compró el extra "Cargar saldo" en el checkout web
    "spend_caja",    // pagó una venta presencial con saldo
    "spend_puerta",  // pagó el estacionamiento en la puerta con saldo
    "refund",        // devolución por una orden anulada
    "manual_adjust", // corrección del admin (nunca lleva orderId, ver abajo)
    "spend_playmatch", // Super Like o «Ver quién me dio ♥» en Playmatch
  ]).notNull(),
  orderId: int("orderId"), // orden que originó el movimiento (si aplica)
  opId: varchar("opId", { length: 36 }), // op de caja/puerta; null para web
  balanceAfter: int("balanceAfter").notNull(),
  note: text("note"), // motivo libre en ajustes manuales del admin
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (t) => [
  // En MySQL/TiDB varias filas con NULL no chocan entre sí en un índice único,
  // así que estas dos restricciones solo aplican donde hay clave real: las
  // cargas web (orderId, sin opId) y los gastos de terminal (opId, sin orderId).
  // Reenviar la misma op encolada offline, o reprocesar el mismo webhook de
  // Mercado Pago, choca contra el motor en vez de depender de un chequeo previo
  // no atómico.
  // Ojo al escribir `manual_adjust`: no debe llevar orderId (igual que
  // adjustPlaycoinsManually, que tampoco lo setea), o dos correcciones sobre la
  // misma orden chocarían contra prepaid_ledger_order_reason_unique.
  uniqueIndex("prepaid_ledger_op_reason_unique").on(t.opId, t.reason),
  uniqueIndex("prepaid_ledger_order_reason_unique").on(t.orderId, t.reason),
  index("prepaid_ledger_customer_idx").on(t.customerId, t.createdAt),
]);

export type PrepaidLedgerEntry = typeof prepaidLedger.$inferSelect;
export type InsertPrepaidLedgerEntry = typeof prepaidLedger.$inferInsert;

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
  // 'cancelled' = el admin la frenó a mano antes de que el cron terminara
  // de drenar todos los destinatarios `pending` -- esas filas de
  // `mailingRecipients` quedan huérfanas sin más acción (el cron ya
  // filtra por `status = 'sending'`, ver getPendingMailingRecipients).
  // 'scheduled' = programada: todavía no tiene destinatarios, se arman al llegar `scheduledAt` (ver
  // `audienceFilters` y materializeDueCampaigns en server/mailing.ts).
  status: mysqlEnum("status", ["sending", "done", "cancelled", "scheduled"]).default("sending").notNull(),
  // Cuándo sale (null = en cuanto el cron la ve) y a quién: los filtros se resuelven RECIÉN a esa hora,
  // así quien compró entremedio ya no recibe el recordatorio.
  scheduledAt: timestamp("scheduledAt"),
  audienceFilters: json("audienceFilters"),
  // Evento al que se refiere esta campaña (pedido explícito del dueño,
  // 14/09): nullable porque no toda campaña habla de un evento puntual (ej.
  // un newsletter general) -- cuando SÍ está seteado, el cron lo usa para
  // saltarse a quien compró ese evento MIENTRAS estaba pendiente en la cola
  // (ver getPendingMailingRecipients / processMailingCronBatch). Se completa
  // solo con el evento que estaba elegido en el filtro de audiencia al armar
  // la campaña -- no es un campo nuevo que el admin tenga que llenar aparte.
  eventId: int("eventId"),
  totalRecipients: int("totalRecipients").notNull(),
  sentCount: int("sentCount").default(0).notNull(),
  failedCount: int("failedCount").default(0).notNull(),
  // Pendientes que NUNCA se llegaron a mandar porque, cuando les tocó el
  // turno en la cola, ya habían comprado la entrada de `eventId` -- no
  // cuentan como enviado ni como fallado, son un tercer resultado.
  skippedCount: int("skippedCount").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type MailingCampaign = typeof mailingCampaigns.$inferSelect;
export type InsertMailingCampaign = typeof mailingCampaigns.$inferInsert;

export const mailingRecipients = mysqlTable("mailingRecipients", {
  id: int("id").autoincrement().primaryKey(),
  campaignId: int("campaignId").notNull(),
  customerId: int("customerId").notNull(),
  // 'skipped' = seguía pendiente cuando le tocó el turno, pero para
  // entonces ya había comprado la entrada del evento de la campaña (ver
  // `eventId` en mailingCampaigns) -- no se le manda un correo ofreciéndole
  // algo que ya tiene.
  status: mysqlEnum("status", ["pending", "sent", "failed", "skipped"]).default("pending").notNull(),
  reason: varchar("reason", { length: 500 }),
  sentAt: timestamp("sentAt"),
}, (table) => ({
  // El cron necesita "próximos N pendientes de la campaña más vieja" -- este
  // índice cubre ese patrón exacto.
  campaignStatusIdx: index("mailing_recipients_campaign_status_idx").on(table.campaignId, table.status),
}));

/** Log de solo lectura de los envíos INMEDIATOS (los que no pasan por
 * `mailingCampaigns`/`mailingRecipients`): el aviso automático de primeros
 * cupos (`server/foundersPromo.ts`) y el botón manual "Enviar a N clientes"
 * (`mailing.sendBatch`). A propósito NO es la misma tabla que
 * `mailingRecipients` -- esa cuenta para el presupuesto diario compartido
 * `AUTOMATED_EMAIL_DAILY_CAP` (protege los recordatorios de carrito
 * abandonado), y el aviso de cupos tiene su propio presupuesto,
 * deliberadamente aparte (ver comentario en `server/foundersPromo.ts`). Esta
 * tabla es puramente informativa para el historial del admin -- nada la lee
 * para decidir cuota ni la procesa un cron. */
export const mailingSendLog = mysqlTable("mailingSendLog", {
  id: int("id").autoincrement().primaryKey(),
  // nanoid: agrupa las filas de una misma corrida de sendMailingBatch().
  batchId: varchar("batchId", { length: 30 }).notNull(),
  source: mysqlEnum("source", ["founders-promo", "tanda2-promo", "sales-drip", "manual"]).notNull(),
  // Evento al que se refería el envío (solo lo llena sales-drip): permite
  // saber cuándo fue el último aviso de ESTE evento a cada persona.
  eventId: int("eventId"),
  // content.subject de esa tanda -- para mostrar de qué se trató sin tener
  // que ir a buscar contenido a otro lado.
  label: varchar("label", { length: 255 }).notNull(),
  customerId: int("customerId").notNull(),
  // Denormalizado a propósito: es un log histórico, no hace falta join.
  email: varchar("email", { length: 255 }).notNull(),
  success: int("success").notNull(),
  reason: varchar("reason", { length: 500 }),
  sentAt: timestamp("sentAt").defaultNow().notNull(),
}, (table) => ({
  batchIdx: index("mailing_send_log_batch_idx").on(table.batchId),
  sentAtIdx: index("mailing_send_log_sent_at_idx").on(table.sentAt),
  eventCustomerIdx: index("mailing_send_log_event_customer_idx").on(table.eventId, table.customerId),
}));

export type MailingSendLogRow = typeof mailingSendLog.$inferSelect;
export type InsertMailingSendLogRow = typeof mailingSendLog.$inferInsert;

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
  gender: mysqlEnum("gender", ["hombre", "mujer", "pareja", "no_binario"]).notNull(),
  // Si es pareja: de quiénes (chica + chico, dos chicas, dos chicos). Las parejas de antes quedan en null (= cualquier pareja).
  pairType: mysqlEnum("pairType", ["mixta", "chicas", "chicos"]),
  // El color de su «ficha» (avatar de la marca), 1..AVATARS_PER_GENDER.
  avatarId: int("avatarId").notNull(),
  zone: mysqlEnum("zone", ["living", "playground", "piscina", "barra"]).default("living").notNull(),
  // Se refresca solo, cada vez que la persona mira la mansión.
  lastSeenAt: timestamp("lastSeenAt").defaultNow().notNull(),
  active: int("active").default(1).notNull(),
  // Cuándo aceptó las reglas de la casa (sin datos personales, sin capturas).
  rulesAcceptedAt: timestamp("rulesAcceptedAt"),
  // Expulsado por el equipo del local. Distinto de `active`: nada lo revierte
  // por su cuenta.
  banned: int("banned").default(0).notNull(),
  // Participa del swipe: exige tener foto (ver partyPhotos). Se apaga solo al
  // borrar la foto o al expulsar al perfil.
  swipeEnabled: int("swipeEnabled").default(0).notNull(),
  // A quién quiere conocer («hombre,mujer,pareja»): el swipe solo junta a quienes se buscan
  // los dos (isMutualInterest en shared/party.ts).
  lookingFor: varchar("lookingFor", { length: 128 }).default("hombre,mujer,pareja").notNull(),
  // Opcionales («Prefiero no decir» = null), shared/party.ts: orientación, cómo se relaciona y qué busca esta noche
  // («amistad,fantasia»). Ordenan el mazo por compatibilidad; los ve solo quien ya entró a la fiesta.
  orientation: varchar("orientation", { length: 16 }),
  relationStyle: varchar("relationStyle", { length: 16 }),
  intents: varchar("intents", { length: 160 }),
  // «Mi disfraz» (aniversario Halloween): lo ve toda la fiesta, mismas reglas que el alias.
  costume: varchar("costume", { length: 40 }),
  // Cuántas veces deshizo un ✕ esta noche (MAX_REWINDS_PER_EVENT).
  rewindsUsed: int("rewindsUsed").default(0).notNull(),
  // Super Likes comprados o regalados que todavía no usó; cuántos compró en la noche (cuenta para el tope) y un tope
  // propio que el administrador puede poner (null = el de la fiesta). El gratis (FREE_SUPER_LIKES) no pasa por acá.
  superLikeCredits: int("superLikeCredits").default(0).notNull(),
  superLikeBought: int("superLikeBought").default(0).notNull(),
  superLikeCap: int("superLikeCap"),
  // Pagó «Ver quién me dio ♥» esta noche.
  likesUnlocked: int("likesUnlocked").default(0).notNull(),
  // Cuántos avisos «Alguien muy afín llegó» ya recibió (MAX_AFFINITY_ALERTS por noche).
  affinityAlerts: int("affinityAlerts").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  // El patrón de consulta real: "todos los perfiles activos de este evento".
  eventActiveIdx: index("party_profiles_event_active_idx").on(table.eventId, table.active),
}));

export type PartyProfile = typeof partyProfiles.$inferSelect;
export type InsertPartyProfile = typeof partyProfiles.$inferInsert;

// Cada cobro, regalo o ajuste de Playmatch (Super Likes, «Ver quién me dio ♥»): lo que alimenta el control del administrador.
// `coins` + `saldo` = `amountClp` (1 Playcoin = $1); los regalos y ajustes del equipo valen 0. `opId` evita cobrar dos veces el mismo toque.
export const partyCharges = mysqlTable("partyCharges", {
  id: int("id").autoincrement().primaryKey(),
  eventId: int("eventId").notNull(),
  profileId: int("profileId").notNull(),
  kind: mysqlEnum("kind", ["superlike", "likes_unlock", "gift", "return", "cap"]).notNull(),
  quantity: int("quantity").default(1).notNull(),
  amountClp: int("amountClp").default(0).notNull(),
  coins: int("coins").default(0).notNull(),
  saldo: int("saldo").default(0).notNull(),
  opId: varchar("opId", { length: 40 }),
  note: varchar("note", { length: 200 }),
  // Quién lo hizo cuando no fue la propia persona (administrador).
  actor: varchar("actor", { length: 100 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  opIdx: uniqueIndex("party_charges_op_idx").on(table.opId),
  eventIdx: index("party_charges_event_idx").on(table.eventId, table.createdAt),
  profileIdx: index("party_charges_profile_idx").on(table.profileId),
}));
export type PartyCharge = typeof partyCharges.$inferSelect;

// Lo que el administrador controla en vivo de Playmatch en cada fiesta (shared/playmatchMarket.ts: PlaymatchConfig).
// Va en su propia tabla y no en `siteSettings`: esa fila la lee todo el sitio y una columna sin migrar la tumbaría.
export const partyEventConfig = mysqlTable("partyEventConfig", {
  eventId: int("eventId").primaryKey(),
  config: json("config").notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

// MEDIUMBLOB (hasta 16MB) para la foto ya comprimida: la foto NO va a Vercel
// Blob porque esas URLs son públicas, y esta tiene que verse solo adentro de
// la fiesta (se sirve por /api/party/photo, que revalida la entrada).
const mediumblob = customType<{ data: Buffer }>({
  dataType() { return "mediumblob"; },
});

// Hasta 3 fotos por perfil (MAX_PARTY_PHOTOS): `position` 0 es la principal. Se pueden subir
// desde que compra la entrada (cámara o galería), pero nadie más las ve hasta que escanean su
// entrada. Se borran al cerrar la ventana del evento, al borrarlas la persona o al expulsarla.
export const partyPhotos = mysqlTable("partyPhotos", {
  id: int("id").autoincrement().primaryKey(),
  profileId: int("profileId").notNull(),
  eventId: int("eventId").notNull(),
  position: int("position").default(0).notNull(),
  data: mediumblob("data").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  eventIdx: index("party_photos_event_idx").on(table.eventId),
  profilePositionIdx: uniqueIndex("party_photos_profile_position_idx").on(table.profileId, table.position),
}));

export type PartyPhoto = typeof partyPhotos.$inferSelect;

// Cada ❤️ / ✖️ del swipe. Son ciegos: quien recibe un ❤️ no se entera salvo que
// haya match (el otro también dio ❤️). Se borran al cerrar la fiesta.
export const partySwipes = mysqlTable("partySwipes", {
  id: int("id").autoincrement().primaryKey(),
  eventId: int("eventId").notNull(),
  fromProfileId: int("fromProfileId").notNull(),
  toProfileId: int("toProfileId").notNull(),
  liked: int("liked").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  pairIdx: uniqueIndex("party_swipes_pair_idx").on(table.fromProfileId, table.toProfileId),
  eventIdx: index("party_swipes_event_idx").on(table.eventId),
  // «Quién me dio like»: sin esto cada consulta recorría la tabla entera.
  toIdx: index("party_swipes_to_idx").on(table.toProfileId, table.liked),
}));

export type PartySwipe = typeof partySwipes.$inferSelect;

// Votos de «Mejor disfraz» (aniversario Halloween): un voto por par (quien vota, a quién). Los ve
// solo el staff en el admin (ranking), nunca los invitados: no cambia lo ciego del swipe. Se borran
// a las 24 h de terminada la fiesta, junto con los mensajes.
export const partyCostumeVotes = mysqlTable("partyCostumeVotes", {
  id: int("id").autoincrement().primaryKey(),
  eventId: int("eventId").notNull(),
  fromProfileId: int("fromProfileId").notNull(),
  toProfileId: int("toProfileId").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  pairIdx: uniqueIndex("party_costume_votes_pair_idx").on(table.fromProfileId, table.toProfileId),
  eventTargetIdx: index("party_costume_votes_event_idx").on(table.eventId, table.toProfileId),
}));

export type PartyCostumeVote = typeof partyCostumeVotes.$inferSelect;

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
  // Nació de un match del swipe: no gasta uno de los Caramelos de la noche.
  viaSwipe: int("viaSwipe").default(0).notNull(),
  // Hasta cuándo leyó el chat cada lado (no leídos y «Visto»).
  lowReadAt: timestamp("lowReadAt"),
  highReadAt: timestamp("highReadAt"),
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

// Passkeys (Face ID / Touch ID / Windows Hello) del panel de administración.
// A diferencia de adminTotp, acá SÍ puede haber varias filas: un solo dueño,
// pero varios dispositivos (iPhone, iPad, notebook), cada uno con su propia
// credencial WebAuthn y su propio contador anti-clonado.
export const adminWebauthnCredentials = mysqlTable("adminWebauthnCredentials", {
  id: int("id").autoincrement().primaryKey(),
  // Identificador de la credencial que devuelve el autenticador, en
  // base64url. Único: es lo primero que se busca al verificar un login.
  credentialId: varchar("credentialId", { length: 255 }).notNull().unique(),
  publicKey: text("publicKey").notNull(),
  // Sube en cada uso; si el valor que manda el dispositivo es menor o igual
  // al guardado, la credencial fue clonada -- ver verifyAuthenticationResponse.
  counter: int("counter").notNull().default(0),
  transports: json("transports"),
  // Nombre que el dueño le pone al registrar ("iPhone de Alexis"), para
  // poder distinguir y revocar dispositivos desde Ajustes.
  deviceLabel: varchar("deviceLabel", { length: 100 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  lastUsedAt: timestamp("lastUsedAt"),
});

export type AdminWebauthnCredential = typeof adminWebauthnCredentials.$inferSelect;

// Egresos de la productora (módulo /gastos). Una fila = una compra real, con
// el monto TAL COMO SE PAGÓ (IVA incluido, que es como vienen los precios en
// Chile). El neto y el IVA se derivan al guardar y quedan congelados: si
// mañana cambia la tasa, el historial no se reescribe -- misma convención que
// orderItems.unitCost.
//
// Sin foreign keys, igual que el resto del schema: acá no se usa references()
// en ninguna tabla.
export const expenses = mysqlTable("expenses", {
  id: int("id").autoincrement().primaryKey(),

  // 'evento' = gasto atribuible a UNA fiesta (decoración, DJ, hielo).
  // 'general' = gasto de la empresa (apps, contador, bodega) que se PRORRATEA
  // entre los eventos del mes según cuánto ingreso hizo cada uno.
  scope: mysqlEnum("scope", ["evento", "general"]).notNull(),
  eventId: int("eventId"), // solo cuando scope='evento'
  // Mes calendario en hora de Chile ("2026-08"), congelado con monthKeyFor()
  // en el servidor al guardar. Se llena SIEMPRE (también en gastos de evento)
  // para que agrupar por mes no dependa de la zona horaria del runtime: TiDB
  // corre en UTC, y una compra de las 22:00 del 31 en Chile ya es día 1 allá.
  periodMonth: varchar("periodMonth", { length: 7 }).notNull(),
  // Fecha real del gasto/documento, que no es la fecha de carga: la boleta del
  // sábado se sube el lunes.
  expenseDate: timestamp("expenseDate").notNull(),

  category: mysqlEnum("category", [
    "decoracion", "barra", "merch", "staff", "produccion", "arriendo",
    "marketing", "transporte", "suscripciones", "comisiones", "otros",
  ]).notNull(),
  description: varchar("description", { length: 255 }).notNull(),
  supplier: varchar("supplier", { length: 160 }),
  supplierRut: varchar("supplierRut", { length: 16 }),

  // Regla del SII: SOLO la factura da crédito fiscal. La boleta no, y la
  // boleta de honorarios tampoco (no lleva IVA, lleva retención). Por eso son
  // valores distintos y no un booleano "¿tiene documento?".
  documentType: mysqlEnum("documentType", ["boleta", "factura", "boleta_honorarios", "sin_documento"]).notNull(),
  documentNumber: varchar("documentNumber", { length: 32 }),
  // Factura EXENTA (pasajes, servicios exentos): no da crédito aunque sea
  // factura. Sin esta marca se inventaría un crédito que el SII rechaza.
  ivaExempt: int("ivaExempt").default(0).notNull(),

  // Lo que efectivamente salió de la caja o de la cuenta, IVA incluido.
  amountTotal: decimal("amountTotal", { precision: 10, scale: 0 }).notNull(),
  // Derivados y congelados al guardar (ver shared/expenses.ts deriveAmounts).
  // Quedan editables porque hay facturas donde el proveedor redondea distinto.
  netAmount: decimal("netAmount", { precision: 10, scale: 0 }).notNull(),
  ivaAmount: decimal("ivaAmount", { precision: 10, scale: 0 }).default("0").notNull(),

  paymentMethod: mysqlEnum("paymentMethod", ["efectivo", "tarjeta", "transferencia", "otro"]).notNull(),
  // Efectivo sacado de la caja registradora DURANTE el evento (pagarle al DJ,
  // mandar por hielo). Sin esto, closeShift lo lee como plata faltante.
  paidFromShiftId: int("paidFromShiftId"),

  // Gastos que se repiten. La fila con `recurrence` distinta de 'none' es la
  // PLANTILLA (nunca entra a ningún resultado por sí misma); las copias
  // apuntan a ella con `recurringParentId` y se materializan solas al pedir
  // el reporte, sin cron.
  //
  // - 'mensual': una suscripción de la productora (un software, una bodega).
  //   Se copia una vez por mes y se reparte entre los eventos de ese mes.
  // - 'por_evento': un costo fijo de CADA fiesta (el DJ, la seguridad, el
  //   arriendo del local). Se copia una vez por evento y se carga completo a
  //   esa fiesta. Existe porque los eventos de esta productora no son
  //   mensuales: atarlos al calendario cobraba de más los meses con dos
  //   fiestas y de menos los meses sin ninguna.
  //
  // Una plantilla 'por_evento' lleva `scope='evento'` con `eventId` en NULL
  // -- es el catálogo, no un gasto de una fiesta puntual.
  recurrence: mysqlEnum("recurrence", ["none", "mensual", "por_evento"]).default("none").notNull(),
  recurrenceEndsAt: timestamp("recurrenceEndsAt"),
  recurringParentId: int("recurringParentId"),

  // Escotilla contra el DOBLE CONTEO: si la mercadería ya está costeada en
  // orderItems.unitCost (la carta de la fiesta), la compra al proveedor no
  // debe volver a restarse del resultado. Se registra igual -- hace falta para
  // el libro de compras y el crédito fiscal -- pero marcada con esto en 1.
  excludeFromPnl: int("excludeFromPnl").default(0).notNull(),
  // El dueño revisó el aviso de doble conteo y confirmó que este gasto de
  // barra/merch NO es la misma mercadería costeada en la carta: deja de
  // avisar por él (sin cambiar cuánto resta).
  cogsReviewed: int("cogsReviewed").default(0).notNull(),
  // Gasto general que NO se reparte entre eventos (una multa, un gasto
  // personal del socio): entra al resumen del mes pero no ensucia el margen
  // de ninguna fiesta.
  prorate: int("prorate").default(1).notNull(),

  receiptUrl: text("receiptUrl"),
  // Fila del checklist de costos fijos del evento a la que corresponde este
  // gasto (shared/eventCostSlots.ts: 'arriendo', 'dj', ...). null = gasto suelto.
  slotKey: varchar("slotKey", { length: 32 }),
  notes: varchar("notes", { length: 500 }),
  createdByUserId: int("createdByUserId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  eventIdx: index("expenses_event_idx").on(table.eventId),
  periodIdx: index("expenses_period_idx").on(table.periodMonth, table.scope),
  shiftIdx: index("expenses_shift_idx").on(table.paidFromShiftId),
  // Hace idempotente la materialización de los gastos recurrentes: una sola
  // copia por plantilla y por mes, aunque dos pestañas pidan el reporte al
  // mismo tiempo.
  recurringMonthUnique: uniqueIndex("expenses_recurring_month_unique").on(table.recurringParentId, table.periodMonth),
  // Lo mismo para las plantillas 'por_evento': una sola copia por plantilla y
  // por evento. MySQL trata los NULL como distintos entre sí, así que los
  // gastos normales (sin `recurringParentId`) no chocan nunca con este único.
  recurringEventUnique: uniqueIndex("expenses_recurring_event_unique").on(table.recurringParentId, table.eventId),
}));

export type Expense = typeof expenses.$inferSelect;
export type InsertExpense = typeof expenses.$inferInsert;

// Simulaciones de presupuesto pre-evento ("¿conviene hacer esta fiesta?"):
// se cargan a mano ANTES de que el evento exista en el sistema, para
// calcular cuánto se puede gastar sin perder el margen mínimo y cuántas
// entradas hay que vender para llegar a punto de equilibrio -- ver
// shared/eventBudget.ts (computeBudgetResult, que reusa shared/expenses.ts
// computePnl para la cascada real). Nunca se cruza con `expenses`: son
// números hipotéticos, no gastos reales. `revenueTiers`/`expenseLines` van
// como JSON porque son listas cortas que siempre se editan juntas, nunca se
// consultan sueltas -- no ameritan una tabla hija.
export const budgetSimulations = mysqlTable("budgetSimulations", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  // Se setea con "Vincular a este evento" una vez que el evento ya existe de
  // verdad -- desde ahí el admin puede comparar presupuestado vs. real en
  // Gastos y P&L. Nace siempre NULL (la simulación corre antes de crear el
  // evento).
  eventId: int("eventId"),
  ivaApplies: int("ivaApplies").default(0).notNull(),
  // Con ivaApplies: las entradas y los ingresos adicionales se venden online y no se
  // declaran al SII (solo la barra genera IVA). Solo se descuenta la comisión de la pasarela.
  onlineSalesNoIva: int("onlineSalesNoIva").default(0).notNull(),
  // % de margen neto mínimo que el dueño quiere cuidar -- de acá sale el
  // techo de gasto (maxDirectExpenses) que pinta la barra verde/amarilla/roja.
  marginTargetPercent: decimal("marginTargetPercent", { precision: 5, scale: 2 }).notNull(),
  // Default siteSettings.cardFeePercent, editable por simulación.
  cardFeePercent: decimal("cardFeePercent", { precision: 5, scale: 2 }).default("0").notNull(),
  // % simple de comisión de embajadores sobre el ingreso -- estimación, no
  // replica la escala real por tramos de ventas del mes.
  commissionPercent: decimal("commissionPercent", { precision: 5, scale: 2 }).default("0").notNull(),
  // $/persona: bebida de bienvenida, pulsera, seguridad que escala con el
  // aforo -- se multiplica por el aforo estimado (suma de las filas de
  // revenueTiers), no es un monto fijo.
  variableCostPerPerson: decimal("variableCostPerPerson", { precision: 10, scale: 0 }).default("0").notNull(),
  // Opcional: venta de barra/consumo estimada por persona, para no dejar
  // afuera ese ingreso si el dueño quiere incluirlo en la proyección.
  otherRevenuePerPerson: decimal("otherRevenuePerPerson", { precision: 10, scale: 0 }).default("0").notNull(),
  // % de la venta BRUTA de barra que se lleva el local (ej. Hipódromo): costo
  // aparte, sin IVA encima, que se suma al arriendo fijo.
  venueBarSharePercent: decimal("venueBarSharePercent", { precision: 5, scale: 2 }).default("0").notNull(),
  // [{ label, unitPrice, quantity, venueCostPerUnit }] -- ingresos adicionales
  // que no son entradas ni barra (estacionamiento: autos × precio) y NO suman
  // personas al aforo. Nullable: MySQL no admite un default literal en JSON;
  // null se lee como lista vacía.
  extraIncomes: json("extraIncomes"),
  // [{ label, price, expectedQty, personasPorEntrada }] -- una fila por tanda
  // (Founders/General/etc), igual que se arman los precios reales en Eventos.
  revenueTiers: json("revenueTiers").notNull(),
  // [{ category, label, amount }] -- category es un ExpenseCategory de
  // shared/expenses.ts, mismo catálogo que ya usa el gasto real.
  expenseLines: json("expenseLines").notNull(),
  notes: text("notes"),
  createdByUserId: int("createdByUserId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  eventIdx: index("budgetSimulations_event_idx").on(table.eventId),
}));

export type BudgetSimulation = typeof budgetSimulations.$inferSelect;
export type InsertBudgetSimulation = typeof budgetSimulations.$inferInsert;

// Suscripciones a notificaciones push del admin (Web Push estándar, sin
// terceros) -- una fila por dispositivo/navegador que activó "Notificarme"
// en Ajustes. `endpoint` identifica al dispositivo ante el navegador que lo
// generó (FCM/APNs por debajo, pero el server nunca habla con esos
// proveedores directo, solo con el endpoint vía la librería `web-push`).
export const pushSubscriptions = mysqlTable("pushSubscriptions", {
  id: int("id").autoincrement().primaryKey(),
  // 512 y no más: con utf8mb4 (4 bytes/char) un UNIQUE de varchar(1024)
  // supera los 3072 bytes que MySQL/TiDB permiten indexar (1024*4=4096) y la
  // migración falla con "Specified key too long". Los endpoints reales de
  // push (FCM/APNs/Mozilla) miden bastante menos que 512 caracteres.
  endpoint: varchar("endpoint", { length: 512 }).notNull().unique(),
  p256dh: varchar("p256dh", { length: 255 }).notNull(),
  auth: varchar("auth", { length: 255 }).notNull(),
  // Quién lo activó, solo informativo para poder listarlas en Ajustes
  // ("iPad de recepción", etc.) -- no se usa para filtrar envíos, todas las
  // suscripciones activas reciben todas las alertas prendidas.
  label: varchar("label", { length: 100 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type PushSubscriptionRow = typeof pushSubscriptions.$inferSelect;
export type InsertPushSubscription = typeof pushSubscriptions.$inferInsert;

// Suscripciones push de INVITADOS (Playmatch) -- separadas de
// `pushSubscriptions` (que es solo del admin) porque acá cada fila
// pertenece a un `partyProfiles.id` puntual (mensaje nuevo = 1
// destinatario) y también hay que poder mandarle a TODOS los de un evento
// a la vez (promo relámpago) sin joins pesados -- de ahí el `eventId`
// denormalizado. No hay sesión de invitado: se resuelve desde el
// `ticketCode` en el momento de suscribirse, igual que el resto de
// Playmatch (ver `requirePartyProfile` en server/routers.ts).
export const partyPushSubscriptions = mysqlTable("partyPushSubscriptions", {
  id: int("id").autoincrement().primaryKey(),
  profileId: int("profileId").notNull(),
  eventId: int("eventId").notNull(),
  endpoint: varchar("endpoint", { length: 512 }).notNull().unique(),
  p256dh: varchar("p256dh", { length: 255 }).notNull(),
  auth: varchar("auth", { length: 255 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  eventIdx: index("party_push_subscriptions_event_idx").on(table.eventId),
  profileIdx: index("party_push_subscriptions_profile_idx").on(table.profileId),
}));

export type PartyPushSubscriptionRow = typeof partyPushSubscriptions.$inferSelect;
export type InsertPartyPushSubscription = typeof partyPushSubscriptions.$inferInsert;

// Suscripciones push de CLIENTES del sitio público (instalado como app o, en
// Android/computador, desde el navegador) -- server/customerPush.ts. El email
// sale de la entrada o el pedido desde donde se activó; desde la home queda
// anónima (null) hasta que el mismo dispositivo abre su entrada.
export const customerPushSubscriptions = mysqlTable("customerPushSubscriptions", {
  id: int("id").autoincrement().primaryKey(),
  endpoint: varchar("endpoint", { length: 512 }).notNull().unique(),
  p256dh: varchar("p256dh", { length: 255 }).notNull(),
  auth: varchar("auth", { length: 255 }).notNull(),
  email: varchar("email", { length: 320 }),
  emailNorm: varchar("emailNorm", { length: 320 }),
  orderId: int("orderId"),
  // Dónde lo activó: ticket | pago | home | concurso | puntos | app.
  source: varchar("source", { length: 20 }).notNull(),
  // ios | android | desktop.
  platform: varchar("platform", { length: 10 }).notNull(),
  standalone: int("standalone").default(0).notNull(),
  // Se dio de baja (desde el sitio o /baja): la fila queda para no volver a
  // preguntarle, pero nunca recibe nada.
  optedOutAt: timestamp("optedOutAt"),
  // Último aviso de marketing (campañas, nuevo evento): tope de uno al día.
  lastMarketingAt: timestamp("lastMarketingAt"),
  lastSentAt: timestamp("lastSentAt"),
  // Aperturas de la app por hora de Chile (24 casillas): "mejor hora por
  // persona" (shared/pushSchedule.ts). null = sin datos todavía.
  hourHist: json("hourHist"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  emailIdx: index("customer_push_email_idx").on(table.emailNorm),
}));

export type CustomerPushSubscription = typeof customerPushSubscriptions.$inferSelect;

// Campañas push a clientes: las manuales del compositor del admin y las que
// arman los automáticos (recordatorio del evento, nuevo evento/preventa),
// que quedan en el mismo historial con sus números.
export const pushCampaigns = mysqlTable("pushCampaigns", {
  id: int("id").autoincrement().primaryKey(),
  title: varchar("title", { length: 80 }).notNull(),
  body: varchar("body", { length: 255 }).notNull(),
  url: varchar("url", { length: 500 }).notNull(),
  imageUrl: varchar("imageUrl", { length: 500 }),
  // Forma en shared/pushSegments.ts (PushSegment).
  segment: json("segment").notNull(),
  // manual | recordatorio | evento | preventa
  kind: varchar("kind", { length: 20 }).default("manual").notNull(),
  // draft | scheduled | sending | sent | cancelled
  status: varchar("status", { length: 20 }).default("draft").notNull(),
  eventId: int("eventId"),
  scheduledAt: timestamp("scheduledAt"),
  sentAt: timestamp("sentAt"),
  targeted: int("targeted").default(0).notNull(),
  sent: int("sent").default(0).notNull(),
  failed: int("failed").default(0).notNull(),
  clicks: int("clicks").default(0).notNull(),
  // Prueba A/B: segundo título/texto, % de la audiencia que hace de prueba
  // (0 = sin prueba), minutos de espera antes de mandar el ganador al resto.
  titleB: varchar("titleB", { length: 80 }),
  bodyB: varchar("bodyB", { length: 255 }),
  abPercent: int("abPercent").default(0).notNull(),
  abWaitMin: int("abWaitMin").default(180).notNull(),
  abWinner: varchar("abWinner", { length: 1 }),
  abTestAt: timestamp("abTestAt"),
  // 1 = cada persona recibe el aviso a su mejor hora (dentro de las próximas 24 h).
  smartHour: int("smartHour").default(0).notNull(),
  // Botones del aviso [{label, url}] (máx. 2; Android y computador).
  actions: json("actions"),
  createdBy: varchar("createdBy", { length: 120 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  statusIdx: index("push_campaigns_status_idx").on(table.status, table.scheduledAt),
}));

export type PushCampaign = typeof pushCampaigns.$inferSelect;

// Cada aviso a cada dispositivo: cola de envío (queued → sent/failed), base de
// "según avisos anteriores", de la prueba A/B y del conteo de toques.
export const pushDeliveries = mysqlTable("pushDeliveries", {
  id: int("id").autoincrement().primaryKey(),
  campaignId: int("campaignId").notNull(),
  subscriptionId: int("subscriptionId").notNull(),
  variant: varchar("variant", { length: 1 }).default("A").notNull(),
  // queued | sent | failed
  status: varchar("status", { length: 10 }).default("queued").notNull(),
  sendAt: timestamp("sendAt").notNull(),
  sentAt: timestamp("sentAt"),
  clickedAt: timestamp("clickedAt"),
  // Link propio de esta persona (ej. su encuesta); null = el de la campaña.
  urlOverride: varchar("urlOverride", { length: 500 }),
}, (table) => ({
  campaignIdx: index("push_deliveries_campaign_idx").on(table.campaignId, table.status),
  dueIdx: index("push_deliveries_due_idx").on(table.status, table.sendAt),
  subIdx: index("push_deliveries_sub_idx").on(table.subscriptionId),
}));

// Plantillas de aviso y audiencias guardadas del panel de push.
export const pushPresets = mysqlTable("pushPresets", {
  id: int("id").autoincrement().primaryKey(),
  // template | audience
  kind: varchar("kind", { length: 12 }).notNull(),
  name: varchar("name", { length: 80 }).notNull(),
  data: json("data").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// Qué avisos automáticos ya se mandaron a quién (no repetir): `subjectKey` es
// "<tipo>:<evento o -->:<correo>", se consulta por ventana de días.
export const pushAutoLog = mysqlTable("pushAutoLog", {
  id: int("id").autoincrement().primaryKey(),
  kind: varchar("kind", { length: 24 }).notNull(),
  subjectKey: varchar("subjectKey", { length: 200 }).notNull(),
  sentAt: timestamp("sentAt").defaultNow().notNull(),
}, (table) => ({
  keyIdx: index("push_auto_log_key_idx").on(table.kind, table.subjectKey),
}));

// Teléfonos/computadores que abren el sitio como app instalada (desde el ícono
// de inicio) -- server/appDevices.ts. El navegador no avisa cuando alguien
// instala o borra la app: se registra cada apertura, así que "tiene la app"
// se lee como "la abrió en los últimos N días". `deviceId` es un id al azar
// que la app guarda en su almacenamiento; el email sale de la última entrada
// abierta en ese teléfono (si hay).
export const appDevices = mysqlTable("appDevices", {
  id: int("id").autoincrement().primaryKey(),
  deviceId: varchar("deviceId", { length: 64 }).notNull().unique(),
  platform: varchar("platform", { length: 10 }).notNull(),
  email: varchar("email", { length: 320 }),
  emailNorm: varchar("emailNorm", { length: 320 }),
  orderId: int("orderId"),
  opens: int("opens").default(1).notNull(),
  firstSeenAt: timestamp("firstSeenAt").defaultNow().notNull(),
  lastSeenAt: timestamp("lastSeenAt").defaultNow().notNull(),
}, (table) => ({
  emailIdx: index("app_devices_email_idx").on(table.emailNorm),
  lastSeenIdx: index("app_devices_last_seen_idx").on(table.lastSeenAt),
}));

// ---------------------------------------------------------------------------
// Agente de IA del Instagram de la productora (server/instagram.ts).
// ---------------------------------------------------------------------------

// Un hilo por persona que escribe al DM de @mansionplayroom. La identidad es
// el IGSID (Instagram-Scoped ID): un id opaco que Meta genera POR APP, así
// que no sirve para identificar a la persona fuera de acá ni se puede cruzar
// con `customers` -- de ahí que este hilo viva en su propia tabla y no
// cuelgue de un cliente. `username` viaja solo como ayuda visual del admin:
// Meta lo entrega en el perfil del remitente y puede cambiar o venir vacío.
export const igThreads = mysqlTable("igThreads", {
  id: int("id").autoincrement().primaryKey(),
  igUserId: varchar("igUserId", { length: 64 }).notNull().unique(),
  username: varchar("username", { length: 120 }),
  name: varchar("name", { length: 255 }),
  // Interruptor POR CONVERSACIÓN: cuando está en 1 el bot deja de contestar
  // este hilo y las respuestas las escribe una persona desde el admin. Lo
  // prende el propio agente cuando detecta que no puede resolver (ver
  // `handoff` en server/instagramAgent.ts) y también el admin a mano. Es lo
  // que evita el peor escenario de estos bots: seguir respondiendo encima de
  // una conversación que ya tomó un humano.
  botPaused: int("botPaused").default(0).notNull(),
  handoffReason: varchar("handoffReason", { length: 500 }),
  // Cuándo se pausó (o cuándo el dueño volvió a escribir a mano): el cron
  // de instagram-followup reactiva el hilo pasadas
  // `instagramAgentConfig.autoResumeHours` desde acá, salvo los personales.
  botPausedAt: timestamp("botPausedAt"),
  // Ficha que el agente va armando de la persona (nombre, con quién viene,
  // primera vez, dudas...) y que vuelve al prompt en cada turno -- así
  // recuerda a la persona aunque el historial que se le pasa se corte.
  customerNotes: text("customerNotes"),
  // Último mensaje ENTRANTE: con esto se calcula la ventana de 24 horas de
  // Meta, fuera de la cual la API rechaza cualquier envío que no lleve una
  // etiqueta especial (ver canReplyWithinWindow en server/instagramSend.ts).
  lastInboundAt: timestamp("lastInboundAt"),
  lastMessageAt: timestamp("lastMessageAt"),
  // Vista previa del último mensaje, para listar la bandeja sin traerse los
  // mensajes de todos los hilos.
  lastMessagePreview: varchar("lastMessagePreview", { length: 300 }),
  // Mensajes entrantes que el admin todavía no abrió en la bandeja. No
  // depende de quién respondió: un hilo contestado por el bot igual queda
  // marcado para que el dueño pueda revisar qué se dijo en su nombre.
  unreadCount: int("unreadCount").default(0).notNull(),
  // Cuándo se mandó el mensaje de cierre por silencio (pedido explícito del
  // dueño, 17/09): si la persona no vuelve a escribir pasados los minutos
  // configurados (instagramAgentConfig.followUpMinutes) después de la
  // última respuesta del bot, se le manda un único recordatorio con el link
  // del sitio -- ver runInstagramFollowUps en server/instagramFollowUp.ts.
  // `null` = todavía no se mandó ninguno para la ronda de silencio actual.
  // Vuelve a quedar habilitado solo cuando `lastMessageAt` avanza más allá
  // de este valor (la persona escribió de nuevo y el bot le contestó otra
  // vez) -- no hace falta limpiarlo a mano en ningún lado.
  closingMessageSentAt: timestamp("closingMessageSentAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  lastMessageIdx: index("ig_threads_last_message_idx").on(table.lastMessageAt),
}));

export type IgThread = typeof igThreads.$inferSelect;
export type InsertIgThread = typeof igThreads.$inferInsert;

export const igMessages = mysqlTable("igMessages", {
  id: int("id").autoincrement().primaryKey(),
  threadId: int("threadId").notNull(),
  // `mid` de Meta. UNIQUE porque el webhook REINTENTA cualquier entrega que
  // no haya respondido 200 a tiempo: sin esta restricción, un reintento
  // guardaría el mensaje dos veces y el agente contestaría dos veces lo
  // mismo. Nullable porque los mensajes que escribimos nosotros se insertan
  // antes de tener el mid que devuelve la API de envío.
  mid: varchar("mid", { length: 191 }).unique(),
  direction: mysqlEnum("direction", ["in", "out"]).notNull(),
  // Quién lo escribió: la persona, el agente, o el admin desde la bandeja.
  // Sirve para auditar (¿esto lo dijo la IA o lo dije yo?) y para armar el
  // historial que se le pasa al modelo con los roles correctos.
  source: mysqlEnum("source", ["user", "bot", "admin"]).notNull(),
  text: text("text"),
  // Adjuntos tal cual los manda Meta (fotos, audios, stickers, respuestas a
  // historias). Se guardan crudos porque el agente hoy solo contesta texto:
  // tener el JSON permite mostrarlos en el admin sin otra migración.
  attachments: json("attachments"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  threadIdx: index("ig_messages_thread_idx").on(table.threadId, table.createdAt),
}));

export type IgMessage = typeof igMessages.$inferSelect;
export type InsertIgMessage = typeof igMessages.$inferInsert;

// ---------------------------------------------------------------------------
// WhatsApp: hilos y mensajes del agente (server/whatsapp.ts). Espejo de
// igThreads/igMessages -- tablas aparte y no una columna `channel` en las de
// Instagram para no tocar nada de lo que ya funciona allá; el cerebro (el
// agente) sí es el mismo, ver server/instagramAgent.ts.
// ---------------------------------------------------------------------------

export const waThreads = mysqlTable("waThreads", {
  id: int("id").autoincrement().primaryKey(),
  // Número de WhatsApp de la persona tal cual lo manda Meta (`wa_id`: solo
  // dígitos, con código de país, sin "+").
  waId: varchar("waId", { length: 32 }).notNull().unique(),
  // Nombre que la persona tiene puesto en su perfil de WhatsApp.
  profileName: varchar("profileName", { length: 255 }),
  // Mismo interruptor por conversación que igThreads.botPaused.
  botPaused: int("botPaused").default(0).notNull(),
  handoffReason: varchar("handoffReason", { length: 500 }),
  // Mismo criterio que igThreads.botPausedAt / customerNotes.
  botPausedAt: timestamp("botPausedAt"),
  customerNotes: text("customerNotes"),
  // Ventana de 24 horas de Meta: fuera de ella solo se puede escribir con
  // una plantilla aprobada (y pagada).
  lastInboundAt: timestamp("lastInboundAt"),
  lastMessageAt: timestamp("lastMessageAt"),
  lastMessagePreview: varchar("lastMessagePreview", { length: 300 }),
  unreadCount: int("unreadCount").default(0).notNull(),
  // Recordatorio de cierre por silencio -- mismo mecanismo que
  // igThreads.closingMessageSentAt.
  closingMessageSentAt: timestamp("closingMessageSentAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  lastMessageIdx: index("wa_threads_last_message_idx").on(table.lastMessageAt),
}));

export type WaThread = typeof waThreads.$inferSelect;
export type InsertWaThread = typeof waThreads.$inferInsert;

export const waMessages = mysqlTable("waMessages", {
  id: int("id").autoincrement().primaryKey(),
  threadId: int("threadId").notNull(),
  // `wamid` de Meta. UNIQUE por lo mismo que igMessages.mid: el webhook
  // reintenta, y sin esto el agente contestaría dos veces.
  wamid: varchar("wamid", { length: 191 }).unique(),
  direction: mysqlEnum("direction", ["in", "out"]).notNull(),
  // `owner_app`: lo escribió el dueño directo desde la app WhatsApp Business
  // del teléfono (coexistencia), sin pasar por el panel.
  source: mysqlEnum("source", ["user", "bot", "admin", "owner_app"]).notNull(),
  text: text("text"),
  // Botones/lista que se mandaron, o el botón/fila que tocó la persona --
  // para que la bandeja muestre la conversación como se vio en el teléfono.
  interactive: json("interactive"),
  attachments: json("attachments"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  threadIdx: index("wa_messages_thread_idx").on(table.threadId, table.createdAt),
}));

export type WaMessage = typeof waMessages.$inferSelect;
export type InsertWaMessage = typeof waMessages.$inferInsert;

// ---------------------------------------------------------------------------
// Registro permanente de derivaciones del agente (pedido del dueño, 23/09):
// a diferencia de igThreads.handoffReason / waThreads.handoffReason -- que se
// borran apenas se reactiva el hilo -- esta tabla queda como historial fijo
// de "esto preguntaron y el agente no lo supo resolver solo", para que el
// dueño la revise de vez en cuando en el admin y decida qué agregar a
// instagramAgentConfig.brandNotes (el cerebro compartido de Instagram y
// WhatsApp). Ver server/instagramFollowUp.ts para el criterio de qué SÍ
// cuenta como una derivación nueva (no cada aviso repetido de un hilo que ya
// estaba pausado, ni una falla de envío que no tiene que ver con lo que sabe
// el agente).
// ---------------------------------------------------------------------------

export const agentHandoffLog = mysqlTable("agentHandoffLog", {
  id: int("id").autoincrement().primaryKey(),
  channel: mysqlEnum("channel", ["instagram", "whatsapp"]).notNull(),
  // Apunta a igThreads.id o waThreads.id según `channel` -- dos tablas
  // distintas, así que no lleva FK cruzada (mismo criterio ya usado en el
  // resto de este schema para este tipo de referencia).
  threadId: int("threadId").notNull(),
  who: varchar("who", { length: 255 }).notNull(),
  incomingText: varchar("incomingText", { length: 2000 }).notNull(),
  reason: varchar("reason", { length: 500 }).notNull(),
  // `null` = todavía pendiente de revisar. Se setea cuando el dueño toca "Ya
  // lo agregué" en el admin -- no borra la fila, solo la saca de la lista.
  resolvedAt: timestamp("resolvedAt"),
  // Cómo se resolvió: `ensenado` (el dueño le explicó al agente), `respondida`
  // (el dueño contestó a mano y no había un dato general que aprender),
  // `descartado` (adjunto sin texto, mensaje personal o solo emojis: se
  // descarta solo) o `manual` (el dueño la marcó resuelta). null = pendiente.
  outcome: varchar("outcome", { length: 16 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  pendingIdx: index("agent_handoff_log_pending_idx").on(table.resolvedAt, table.createdAt),
}));

export type AgentHandoffLog = typeof agentHandoffLog.$inferSelect;
export type InsertAgentHandoffLog = typeof agentHandoffLog.$inferInsert;

// ---------------------------------------------------------------------------
// Automatizaciones de Instagram por palabra clave (server/instagramAutomations.ts):
// alguien comenta o responde a una historia con la palabra justa y le llega
// un DM automático -- link, código de descuento, o lo que el dueño configure.
// ---------------------------------------------------------------------------

export const igKeywordAutomations = mysqlTable("igKeywordAutomations", {
  id: int("id").autoincrement().primaryKey(),
  keyword: varchar("keyword", { length: 120 }).notNull(),
  // Dónde puede dispararla: comentario en post/reel, respuesta a historia, o
  // ambas. "comment" no hace nada todavía -- Meta exige un permiso aparte
  // (instagram_business_manage_comments, Advanced Access) que hoy no está
  // aprobado; ver docs/INSTAGRAM-AGENT.md.
  triggerSource: mysqlEnum("triggerSource", ["comment", "story_reply", "both"]).notNull().default("both"),
  // Texto libre que se le manda por DM -- puede ser un link, un artículo, un
  // mensaje de puro texto, o incluir el placeholder {{codigo}} si además
  // regala un código de descuento (discountCode, abajo).
  replyMessage: text("replyMessage").notNull(),
  // Opcional a propósito: no toda automatización regala plata, algunas solo
  // mandan un link o un mensaje. Cuando existe, ya viaja creado en
  // discountCodes (mismo mecanismo que Promo Flash) -- este campo es solo la
  // referencia para poder armar el mensaje y mostrarlo en el panel.
  discountCode: varchar("discountCode", { length: 40 }),
  active: int("active").default(1).notNull(),
  // Botón de compra/link que viaja debajo del mensaje (shared/automationButton.ts):
  // 'none' | 'event' (entrada del evento destacado, con el código pegado) |
  // 'page' (página del sitio, `buttonTarget` = su ruta) | 'custom' (URL propia
  // del sitio). `buttonTitle` = texto del botón (máx. 20, límite de Meta).
  buttonKind: varchar("buttonKind", { length: 12 }).default("none").notNull(),
  buttonTarget: varchar("buttonTarget", { length: 300 }),
  buttonTitle: varchar("buttonTitle", { length: 20 }),
  // Solo para regalos de producto: 1 = se regala UNA unidad por persona que
  // entra (Dúo = 2, Trío = 3, Grupo = 4), 0 = una sola por compra. Vive acá y
  // no en discountCodes a propósito: el checkout lee discountCodes en cada
  // compra y no debe depender de una columna nueva.
  giftPerPerson: int("giftPerPerson").default(0).notNull(),
  // 1 = solo para quienes siguen la cuenta (los demás reciben una invitación
  // a seguir y volver a escribir la palabra).
  followersOnly: int("followersOnly").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  keywordIdx: index("ig_keyword_automations_keyword_idx").on(table.keyword),
}));

export type IgKeywordAutomation = typeof igKeywordAutomations.$inferSelect;
export type InsertIgKeywordAutomation = typeof igKeywordAutomations.$inferInsert;

export const igKeywordRedemptions = mysqlTable("igKeywordRedemptions", {
  id: int("id").autoincrement().primaryKey(),
  automationId: int("automationId").notNull(),
  igUserId: varchar("igUserId", { length: 64 }).notNull(),
  source: mysqlEnum("source", ["comment", "story_reply"]).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  // Una persona no recibe el regalo dos veces por la misma automatización,
  // ni aunque comente/responda la palabra varias veces.
  uniquePerPerson: uniqueIndex("ig_keyword_redemptions_unique_idx").on(table.automationId, table.igUserId),
}));

export type IgKeywordRedemption = typeof igKeywordRedemptions.$inferSelect;
export type InsertIgKeywordRedemption = typeof igKeywordRedemptions.$inferInsert;

// ---------------------------------------------------------------------------
// Contador diario de TODOS los correos enviados (server/email.ts sendEmail).
// ---------------------------------------------------------------------------

/** Una fila por cada llamada a `sendEmail()`, sin importar el motivo --
 * confirmación de compra, ticket, recordatorio, mailing masivo, resumen del
 * admin, lo que sea. Es la ÚNICA fuente de verdad del contador diario que
 * cuida el cupo real del plan de Resend (~100/día): las tablas existentes
 * (`mailingRecipients`, `mailingSendLog`) solo cubren el mailing masivo, y
 * el cupo de Resend se gasta con CUALQUIER correo, no solo esos.
 *
 * Se inserta desde el único cuello de botella por el que pasa todo envío
 * (`sendEmail` en server/email.ts) -- así ningún llamador nuevo puede
 * olvidarse de loguear: basta con que use `sendEmail`, que ya usan todos. */
export const emailLog = mysqlTable("emailLog", {
  id: int("id").autoincrement().primaryKey(),
  to: varchar("to", { length: 320 }).notNull(),
  subject: varchar("subject", { length: 255 }),
  success: int("success").notNull(),
  sentAt: timestamp("sentAt").defaultNow().notNull(),
}, (table) => ({
  sentAtIdx: index("email_log_sent_at_idx").on(table.sentAt),
}));

export type EmailLogRow = typeof emailLog.$inferSelect;

/** Eventos que Resend avisa por webhook (server/resendWebhook.ts): entregado, rebotó, lo marcaron como spam, abrió,
 * hizo clic. `svixId` evita guardar dos veces el mismo aviso si Resend reintenta. `campaign` y `variant` vienen
 * de las etiquetas con que se envió cada correo. */
export const emailEvents = mysqlTable("emailEvents", {
  id: int("id").autoincrement().primaryKey(),
  svixId: varchar("svixId", { length: 100 }).notNull(),
  resendId: varchar("resendId", { length: 64 }),
  type: varchar("type", { length: 40 }).notNull(),
  email: varchar("email", { length: 320 }).notNull(),
  campaign: varchar("campaign", { length: 255 }),
  variant: varchar("variant", { length: 4 }),
  url: varchar("url", { length: 500 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  svixIdx: uniqueIndex("email_events_svix_idx").on(table.svixId),
  campaignIdx: index("email_events_campaign_idx").on(table.campaign, table.type),
  emailIdx: index("email_events_email_idx").on(table.email),
}));

// Encuesta post-fiesta (server/eventSurvey.ts): una invitación por comprador
// que asistió (entrada escaneada en la puerta), con el token secreto que va
// en el link del correo. La fila nace al preparar los envíos (`sentAt` null =
// pendiente) y se completa cuando la persona responde. La respuesta se ve en
// el admin SIN nombre ni correo -- se pide feedback honesto, no identificar.
export const eventSurveys = mysqlTable("eventSurveys", {
  id: int("id").autoincrement().primaryKey(),
  eventId: int("eventId").notNull(),
  token: varchar("token", { length: 64 }).notNull().unique(),
  buyerEmail: varchar("buyerEmail", { length: 320 }).notNull(),
  buyerName: varchar("buyerName", { length: 255 }),
  sentAt: timestamp("sentAt"),
  // Intentos de envío fallidos: pasados 3, se deja de reintentar esa dirección
  // en cada corrida del cron.
  sendAttempts: int("sendAttempts").default(0).notNull(),
  respondedAt: timestamp("respondedAt"),
  rating: int("rating"), // 1 a 5
  liked: text("liked"),
  improve: text("improve"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (t) => [
  // Una sola invitación por persona y fiesta, aunque haya comprado varias veces.
  uniqueIndex("eventSurveys_event_email_idx").on(t.eventId, t.buyerEmail),
]);

export type EventSurvey = typeof eventSurveys.$inferSelect;

// Ajustes y análisis de la encuesta de UNA fiesta: si el envío automático
// está prendido (apagado por defecto -- son correos a clientes reales, se
// prende a conciencia) y el último análisis de la IA.
export const eventSurveySettings = mysqlTable("eventSurveySettings", {
  eventId: int("eventId").primaryKey(),
  autoSend: int("autoSend").default(0).notNull(),
  report: json("report"),
  reportAt: timestamp("reportAt"),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

/** Pasar un acceso Dúo a Trío cobrando la diferencia (Ventas Web). Una fila
 * por solicitud. Tabla aparte a propósito, sin columnas nuevas en `orders`:
 * casi todo el código hace `select()` de TODAS las columnas de `orders`, así
 * que una columna que aún no existe en producción tumba las compras -- una
 * tabla nueva solo afecta a esta función.
 *
 * El pago usa `external_reference = "UPG-<id>"` (shared/upgrade.ts) para que
 * el webhook de Mercado Pago lo distinga del pago de la compra original. */
export const orderUpgrades = mysqlTable("orderUpgrades", {
  id: int("id").autoincrement().primaryKey(),
  orderId: int("orderId").notNull(),
  fromTicketTypeId: int("fromTicketTypeId").notNull(),
  toTicketTypeId: int("toTicketTypeId").notNull(),
  // Diferencia a cobrar, en CLP.
  amount: decimal("amount", { precision: 10, scale: 0 }).notNull(),
  status: mysqlEnum("status", ["pending", "paid", "cancelled"]).default("pending").notNull(),
  // Cómo se pagó: link de Mercado Pago o "Marcar como pagado" del admin
  // (transferencia/efectivo). Queda en NULL mientras está pendiente.
  method: mysqlEnum("method", ["mercadopago", "manual"]),
  preferenceId: varchar("preferenceId", { length: 255 }),
  // Link de Mercado Pago, para volver a mostrarlo/enviarlo sin crear otro.
  paymentUrl: text("paymentUrl"),
  paymentId: varchar("paymentId", { length: 255 }),
  // Solicitudes viejas de Dúo→Trío: la tercera persona. Las nuevas guardan
  // todas las personas en `extraData`; estas dos columnas quedan solo para
  // poder aplicar las solicitudes que ya estaban pendientes.
  thirdName: varchar("thirdName", { length: 255 }),
  thirdRut: varchar("thirdRut", { length: 20 }),
  // Personas nuevas del acceso al que se sube: `{ people: [{ n, name, rut,
  // instagram }] }` (ver shared/upgrade.ts).
  extraData: json("extraData"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  paidAt: timestamp("paidAt"),
}, (t) => [
  index("orderUpgrades_order_idx").on(t.orderId),
]);

export type OrderUpgrade = typeof orderUpgrades.$inferSelect;

/** Un extra (estacionamiento, piscolas...) agregado a una compra YA hecha, con
 * su propio link de pago (Ventas Web). Una fila por solicitud. Tabla aparte, sin
 * columnas nuevas en `orders`, por el mismo motivo que `orderUpgrades`: casi todo
 * el código hace `select()` de TODAS las columnas de `orders`.
 *
 * El pago usa `external_reference = "ADD-<id>"` (shared/addon.ts). El monto
 * (`amount`) se calcula SIEMPRE en el servidor con el precio de la base de datos
 * por la cantidad: nunca viene del cliente. */
export const orderAddons = mysqlTable("orderAddons", {
  id: int("id").autoincrement().primaryKey(),
  orderId: int("orderId").notNull(),
  ticketTypeId: int("ticketTypeId").notNull(),
  quantity: int("quantity").default(1).notNull(),
  // Total a cobrar (precio por cantidad), en CLP.
  amount: decimal("amount", { precision: 10, scale: 0 }).notNull(),
  status: mysqlEnum("status", ["pending", "paid", "cancelled"]).default("pending").notNull(),
  // Cómo se pagó: link de Mercado Pago o "Marcar como pagado" del admin. Queda
  // en NULL mientras está pendiente.
  method: mysqlEnum("method", ["mercadopago", "manual"]),
  // Quién la pidió: el admin desde Ventas Web o el propio cliente desde su ticket.
  source: mysqlEnum("source", ["admin", "customer"]).default("admin").notNull(),
  preferenceId: varchar("preferenceId", { length: 255 }),
  // Link de Mercado Pago, para volver a mostrarlo/enviarlo sin crear otro.
  paymentUrl: text("paymentUrl"),
  paymentId: varchar("paymentId", { length: 255 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  paidAt: timestamp("paidAt"),
}, (t) => [
  index("orderAddons_order_idx").on(t.orderId),
]);

export type OrderAddon = typeof orderAddons.$inferSelect;

// Crédito de acceso: una persona no puede ir a la fiesta que compró y el dueño
// le deja ese MISMO tipo de acceso (ej. Acceso Dúo) vigente para un evento
// futuro. A diferencia de un código de descuento (por monto/%, sobre todo el
// carrito), esto vale "1 unidad de este acceso" -- se reconoce por
// `ticketTypes.accesoSlug`, que se repite en todos los eventos --, así que da
// igual cuánto cueste en la tanda en que lo use. Un registro por unidad.
//
// `status` guarda lo último que se escribió; el estado REAL se deriva con
// shared/accessCredit.ts (creditAvailability), mirando la orden que lo
// reservó: pagada = usado, rechazada o abandonada = vuelve a estar disponible.
export const accessCredits = mysqlTable("accessCredits", {
  id: int("id").autoincrement().primaryKey(),
  code: varchar("code", { length: 40 }).notNull().unique(),
  accesoSlug: varchar("accesoSlug", { length: 50 }).notNull(),
  accesoName: varchar("accesoName", { length: 100 }).notNull(),
  buyerEmail: varchar("buyerEmail", { length: 320 }).notNull(),
  buyerName: varchar("buyerName", { length: 255 }),
  originOrderId: int("originOrderId").notNull(),
  originEventId: int("originEventId").notNull(),
  status: mysqlEnum("status", ["available", "reserved", "used", "cancelled"]).default("available").notNull(),
  // La orden que lo canjeó (o lo tiene reservado) y desde cuándo.
  usedOrderId: int("usedOrderId"),
  reservedAt: timestamp("reservedAt"),
  note: varchar("note", { length: 500 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (t) => [
  index("access_credits_origin_order_idx").on(t.originOrderId),
  index("access_credits_email_idx").on(t.buyerEmail),
]);

export type AccessCredit = typeof accessCredits.$inferSelect;
export type InsertAccessCredit = typeof accessCredits.$inferInsert;

// Estudio de contenido (admin → Marketing → Estudio): los carruseles, posts e
// historias armados con las plantillas de marca. `data` guarda las láminas y
// el texto de la publicación tal como los limpia
// shared/contentStudio.ts (normalizeStudioDesign); las fotos viven en Vercel
// Blob y acá solo queda su URL. El PNG final se exporta en el navegador: no
// se guarda.
export const contentDesigns = mysqlTable("contentDesigns", {
  id: int("id").autoincrement().primaryKey(),
  eventId: int("eventId"),
  title: varchar("title", { length: 200 }).notNull(),
  format: mysqlEnum("format", ["carrusel", "post", "historia"]).notNull(),
  theme: varchar("theme", { length: 30 }).notNull(),
  // "plantilla" = láminas con las plantillas fijas (shared/contentStudio.ts);
  // "ia" = diseñadas libremente por el Diseñador IA (shared/studioAi.ts).
  kind: varchar("kind", { length: 20 }).default("plantilla").notNull(),
  data: json("data").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => [
  index("content_designs_event_idx").on(t.eventId),
]);

export type ContentDesign = typeof contentDesigns.$inferSelect;

// Conversación del Diseñador IA del Estudio con cada diseño: lo que pidió el
// dueño (texto + fotos adjuntas) y lo que respondió la IA. Cada respuesta
// guarda el diseño COMPLETO como quedó (`snapshot`) para poder volver a esa
// versión, y lo que costó (tokens y US$ estimados) para que el gasto se vea.
export const contentDesignMessages = mysqlTable("contentDesignMessages", {
  id: int("id").autoincrement().primaryKey(),
  designId: int("designId").notNull(),
  role: mysqlEnum("role", ["user", "assistant"]).notNull(),
  text: text("text").notNull(),
  // URLs (Blob) de las fotos o referencias que el dueño adjuntó.
  images: json("images"),
  model: varchar("model", { length: 60 }),
  usage: json("usage"),
  costUsd: decimal("costUsd", { precision: 10, scale: 4 }),
  snapshot: json("snapshot"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (t) => [
  index("content_design_messages_design_idx").on(t.designId),
]);

export type ContentDesignMessage = typeof contentDesignMessages.$inferSelect;

// Personal de las fiestas (barra, seguridad, puerta, DJ...). Es el catálogo de
// personas con su tarifa habitual; lo que se les paga en cada evento vive en
// `staffShifts`.
export const staffMembers = mysqlTable("staffMembers", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 120 }).notNull(),
  role: varchar("role", { length: 80 }),
  // Tarifa habitual por noche (CLP); se propone al asignarlo a un evento.
  defaultRateClp: int("defaultRateClp").default(0).notNull(),
  phone: varchar("phone", { length: 40 }),
  rut: varchar("rut", { length: 20 }),
  active: int("active").default(1).notNull(),
  notes: text("notes"),
  // Correo con que entra a su app («Mi cuenta»). Antes vivía en el JSON de
  // `contentDesigns` (kind='staff'); server/staff.ts lo copia acá.
  email: varchar("email", { length: 320 }),
  // Qué hace (shared/staffCargos.ts): define a qué pantalla entra. `role`
  // queda como el título que se muestra (texto libre).
  cargo: mysqlEnum("cargo", ["caja", "barra", "puerta", "cocina", "guardarropia", "supervisor", "dj", "rrpp", "produccion", "otro", "anfitrion_playmatch", "animador"]),
  // PIN que la persona eligió en su app; se copia a sus `operators`.
  pinHash: varchar("pinHash", { length: 255 }),
  pinSetAt: timestamp("pinSetAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => [
  uniqueIndex("staff_members_email_idx").on(t.email),
]);

export type StaffMember = typeof staffMembers.$inferSelect;

// Un turno = una persona trabajó en un evento por un monto. `paid` dice si ya
// se le pagó (si no, aparece como "por pagar"). El monto entra al resultado
// del evento como costo de staff.
export const staffShifts = mysqlTable("staffShifts", {
  id: int("id").autoincrement().primaryKey(),
  eventId: int("eventId").notNull(),
  staffId: int("staffId").notNull(),
  // Lo PACTADO. Si es boleta de honorarios, `amountMode` dice si es el líquido
  // (la persona recibe exacto) o el bruto (el de la boleta); el bruto y la
  // retención se calculan (shared/honorarios.ts), no se guardan.
  amountClp: int("amountClp").notNull(),
  paymentType: mysqlEnum("paymentType", ["transferencia", "boleta_honorarios"]).default("transferencia").notNull(),
  amountMode: mysqlEnum("amountMode", ["liquido", "bruto"]).default("liquido").notNull(),
  hours: decimal("hours", { precision: 5, scale: 1 }),
  paid: int("paid").default(0).notNull(),
  paidAt: timestamp("paidAt"),
  note: varchar("note", { length: 255 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => [
  index("staff_shifts_event_idx").on(t.eventId),
  index("staff_shifts_staff_idx").on(t.staffId),
]);

export type StaffShift = typeof staffShifts.$inferSelect;

// Manual del staff (shared/staffManuals.ts): un reglamento general y uno por cargo, con versiones. Publicar un cambio
// crea una versión nueva (nunca se edita una publicada); cada aceptación guarda qué versión leyó la persona.
export const staffManuals = mysqlTable("staffManuals", {
  id: int("id").autoincrement().primaryKey(),
  manualKey: varchar("manualKey", { length: 24 }).notNull(),
  version: int("version").notNull(),
  title: varchar("title", { length: 120 }).notNull(),
  sections: json("sections").notNull(),
  changeNote: varchar("changeNote", { length: 255 }),
  publishedAt: timestamp("publishedAt").defaultNow().notNull(),
}, (t) => [
  uniqueIndex("staff_manuals_key_version_idx").on(t.manualKey, t.version),
]);

export type StaffManual = typeof staffManuals.$inferSelect;

export const staffManualAcceptances = mysqlTable("staffManualAcceptances", {
  id: int("id").autoincrement().primaryKey(),
  staffId: int("staffId").notNull(),
  manualKey: varchar("manualKey", { length: 24 }).notNull(),
  version: int("version").notNull(),
  // Lo que dice la ficha al aceptar (por si después cambia).
  fullName: varchar("fullName", { length: 120 }).notNull(),
  rut: varchar("rut", { length: 20 }),
  userAgent: varchar("userAgent", { length: 255 }),
  ip: varchar("ip", { length: 64 }),
  acceptedAt: timestamp("acceptedAt").defaultNow().notNull(),
}, (t) => [
  uniqueIndex("staff_manual_accept_idx").on(t.staffId, t.manualKey, t.version),
  index("staff_manual_accept_staff_idx").on(t.staffId),
]);

export type StaffManualAcceptance = typeof staffManualAcceptances.$inferSelect;



// Un registro por mes tributario (F29): si ya se declaró y pagó, con qué
// folio y cuánto. `remanente` es el crédito fiscal que pasa al mes siguiente
// (casilla 77); `snapshot` guarda los valores tal como se declararon.
export const taxPeriods = mysqlTable("taxPeriods", {
  id: int("id").autoincrement().primaryKey(),
  monthKey: varchar("monthKey", { length: 7 }).notNull().unique(),
  status: mysqlEnum("status", ["pendiente", "declarado", "pagado"]).default("pendiente").notNull(),
  declaredAt: timestamp("declaredAt"),
  paidAt: timestamp("paidAt"),
  folio: varchar("folio", { length: 40 }),
  amountPaid: int("amountPaid"),
  remanente: int("remanente").default(0).notNull(),
  snapshot: json("snapshot"),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type TaxPeriod = typeof taxPeriods.$inferSelect;


// Retiros del dueño: plata que se saca de la cuenta para vivir. NO es gasto
// de ningún evento (no baja la ganancia del evento) pero sí sale de la caja.
export const ownerWithdrawals = mysqlTable("ownerWithdrawals", {
  id: int("id").autoincrement().primaryKey(),
  withdrawnAt: timestamp("withdrawnAt").notNull(),
  amountClp: int("amountClp").notNull(),
  account: mysqlEnum("account", ["mercadopago", "banco", "efectivo"]).default("mercadopago").notNull(),
  note: varchar("note", { length: 255 }),
  movementId: int("movementId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type OwnerWithdrawal = typeof ownerWithdrawals.$inferSelect;

// Movimientos importados de la cuenta de Mercado Pago (API) o del banco
// (cartola). `amountClp` con signo: + entra, − sale. `classification` la
// confirma el dueño (los que no son ventas quedan 'por_clasificar').
export const accountMovements = mysqlTable("accountMovements", {
  id: int("id").autoincrement().primaryKey(),
  source: mysqlEnum("source", ["mercadopago", "banco"]).notNull(),
  externalId: varchar("externalId", { length: 120 }).notNull(),
  occurredAt: timestamp("occurredAt").notNull(),
  amountClp: int("amountClp").notNull(),
  description: varchar("description", { length: 255 }),
  kind: varchar("kind", { length: 40 }),
  classification: mysqlEnum("classification", ["venta", "comision", "gasto_evento", "gasto_empresa", "retiro_dueno", "traspaso", "otro", "por_clasificar"]).default("por_clasificar").notNull(),
  eventId: int("eventId"),
  expenseId: int("expenseId"),
  withdrawalId: int("withdrawalId"),
  balanceAfter: int("balanceAfter"),
  raw: json("raw"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (t) => [
  uniqueIndex("account_movements_source_ext_unique").on(t.source, t.externalId),
  index("account_movements_occurred_idx").on(t.occurredAt),
]);

export type AccountMovement = typeof accountMovements.$inferSelect;

// Saldo conocido de cada cuenta en un momento (de la API, de la cartola o
// anotado a mano). Se usa el más reciente de cada cuenta para la "caja real".
export const accountBalances = mysqlTable("accountBalances", {
  id: int("id").autoincrement().primaryKey(),
  source: mysqlEnum("source", ["mercadopago", "banco"]).notNull(),
  balanceClp: int("balanceClp").notNull(),
  asOf: timestamp("asOf").notNull(),
  origin: mysqlEnum("origin", ["api", "cartola", "manual"]).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (t) => [
  index("account_balances_source_idx").on(t.source, t.asOf),
]);


// Seguimiento de la regularización de meses con ventas web que no se
// declararon en su momento: qué mes se rectificó, si quedó en convenio de
// pago con Tesorería y con cuántas cuotas.
export const taxRegularizations = mysqlTable("taxRegularizations", {
  id: int("id").autoincrement().primaryKey(),
  monthKey: varchar("monthKey", { length: 7 }).notNull().unique(),
  status: mysqlEnum("status", ["pendiente", "rectificado", "en_convenio", "regularizado"]).default("pendiente").notNull(),
  folio: varchar("folio", { length: 40 }),
  installments: int("installments"),
  note: varchar("note", { length: 500 }),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type TaxRegularization = typeof taxRegularizations.$inferSelect;

// ---------------------------------------------------------------------------
// Comentarios públicos de Instagram (server/instagramComments.ts): la IA deja
// un borrador de respuesta y el dueño lo aprueba antes de que salga nada.
// ---------------------------------------------------------------------------

export const igComments = mysqlTable("igComments", {
  id: int("id").autoincrement().primaryKey(),
  commentId: varchar("commentId", { length: 64 }).notNull(),
  mediaId: varchar("mediaId", { length: 64 }),
  igUserId: varchar("igUserId", { length: 64 }).notNull(),
  username: varchar("username", { length: 120 }),
  text: text("text").notNull(),
  // spam | emoji | praise | question | sensitive | other (shared/commentTriage.ts)
  category: varchar("category", { length: 12 }).notNull(),
  draftReply: text("draftReply"),
  // DM de seguimiento (solo preguntas de compra/precio), con botón al evento.
  draftDm: text("draftDm"),
  // Botón del DM: 'buy' (entradas) | 'page:/ruta' | 'none'.
  dmButton: varchar("dmButton", { length: 200 }),
  finalReply: text("finalReply"),
  status: mysqlEnum("status", ["pending", "sent", "discarded", "hidden", "failed"]).default("pending").notNull(),
  error: varchar("error", { length: 300 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  decidedAt: timestamp("decidedAt"),
}, (table) => ({
  commentIdx: uniqueIndex("ig_comments_comment_idx").on(table.commentId),
  statusIdx: index("ig_comments_status_idx").on(table.status),
}));

export type IgComment = typeof igComments.$inferSelect;

// ---------------------------------------------------------------------------
// De dónde llegó cada chat de Instagram (webhook `messaging_referral`):
// anuncio o link ig.me con `?ref=código`. Tabla aparte y no columnas en
// igThreads a propósito: si la migración no se corrió, la bandeja y el agente
// siguen funcionando igual.
// ---------------------------------------------------------------------------

export const igReferrals = mysqlTable("igReferrals", {
  id: int("id").autoincrement().primaryKey(),
  igUserId: varchar("igUserId", { length: 64 }).notNull(),
  // ad | link | other (shared/igReferral.ts)
  source: varchar("source", { length: 12 }).notNull(),
  ref: varchar("ref", { length: 120 }),
  adTitle: varchar("adTitle", { length: 200 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  userIdx: index("ig_referrals_user_idx").on(table.igUserId),
  createdIdx: index("ig_referrals_created_idx").on(table.createdAt),
}));

export type IgReferralRow = typeof igReferrals.$inferSelect;

// ---------------------------------------------------------------------------
// Clics en los botones que manda Instagram (agente, comentarios,
// automatizaciones): pasan por /api/go (server/linkTracker.ts), que los
// cuenta y redirige. `origin` = utm_content (o utm_campaign si no hay).
// ---------------------------------------------------------------------------

export const igLinkClicks = mysqlTable("igLinkClicks", {
  id: int("id").autoincrement().primaryKey(),
  origin: varchar("origin", { length: 100 }).notNull(),
  path: varchar("path", { length: 300 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  originIdx: index("ig_link_clicks_origin_idx").on(table.origin),
  createdIdx: index("ig_link_clicks_created_idx").on(table.createdAt),
}));

// ---------------------------------------------------------------------------
// Gasto de IA: una fila por llamada a Claude (server/_core/llm.ts, Estudio).
// `feature` = qué función la pidió; el costo va en micro-dólares (US$ × 1e6).
// ---------------------------------------------------------------------------

export const aiUsage = mysqlTable("aiUsage", {
  id: int("id").autoincrement().primaryKey(),
  feature: varchar("feature", { length: 60 }).notNull(),
  model: varchar("model", { length: 60 }).notNull(),
  inputTokens: int("inputTokens").notNull().default(0),
  outputTokens: int("outputTokens").notNull().default(0),
  cacheReadTokens: int("cacheReadTokens").notNull().default(0),
  cacheWriteTokens: int("cacheWriteTokens").notNull().default(0),
  costMicroUsd: int("costMicroUsd").notNull().default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  createdIdx: index("ai_usage_created_idx").on(table.createdAt),
  featureIdx: index("ai_usage_feature_idx").on(table.feature),
}));

export type AiUsageRow = typeof aiUsage.$inferSelect;

// Co-producción con otra productora (ej. "Playroom × Dalmore"): un evento que
// se organiza a medias. La otra productora entra al /admin con SU clave (rol
// sintético `partner`, ver server/_core/sdk.ts) y ve solo lo de este evento.
// La landing pública (/playroom<slug>) queda en "Próximamente" hasta `isLive`.
export const coproductions = mysqlTable("coproductions", {
  id: int("id").autoincrement().primaryKey(),
  slug: varchar("slug", { length: 50 }).notNull().unique(),
  partnerName: varchar("partnerName", { length: 100 }).notNull(),
  // null hasta que el dueño enlaza el evento (que crea en Eventos como siempre).
  eventId: int("eventId"),
  // Porcentaje de la utilidad que le toca a la otra productora (50 = 50/50).
  splitPercentPartner: int("splitPercentPartner").default(50).notNull(),
  isLive: int("isLive").default(0).notNull(),
  // Link de vista previa de la landing antes de activarla (?preview=...).
  previewToken: varchar("previewToken", { length: 64 }).notNull(),
  // Clave del socio (scrypt, ver server/caja/auth.ts hashPin). null = sin acceso.
  passwordHash: varchar("passwordHash", { length: 200 }),
  // Segundo factor del socio: mismo esquema que adminTotp.
  totpSecret: varchar("totpSecret", { length: 64 }),
  totpConfirmedAt: timestamp("totpConfirmedAt"),
  totpBackupCodes: json("totpBackupCodes"),
  totpLastUsedStep: int("totpLastUsedStep"),
  // Sube al cambiar o revocar la clave: invalida las sesiones abiertas.
  sessionVersion: int("sessionVersion").default(1).notNull(),
  // Textos e imágenes de la landing (shared/coproduction.ts CoproductionLanding).
  landing: json("landing"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Coproduction = typeof coproductions.$inferSelect;

// Cortesías creadas para una co-producción y quién las creó (el reparto y la
// lista de asistentes las muestran aparte de las compras).
export const coproductionInvites = mysqlTable("coproductionInvites", {
  id: int("id").autoincrement().primaryKey(),
  coproductionId: int("coproductionId").notNull(),
  orderId: int("orderId").notNull().unique(),
  createdBy: mysqlEnum("createdBy", ["playroom", "partner"]).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  coproductionIdx: index("coproduction_invites_coproduction_idx").on(table.coproductionId),
}));

// Gastos que carga la otra productora. Viven acá (y NO en `expenses`) hasta
// que el dueño los aprueba: así un gasto sin revisar nunca toca los reportes
// de Playroom. Al aprobar se crea el gasto real en `expenses` (scope evento)
// y se guarda su id.
export const coproductionExpenses = mysqlTable("coproductionExpenses", {
  id: int("id").autoincrement().primaryKey(),
  coproductionId: int("coproductionId").notNull(),
  submittedBy: mysqlEnum("submittedBy", ["playroom", "partner"]).notNull(),
  status: mysqlEnum("status", ["pending", "approved", "rejected"]).default("pending").notNull(),
  category: varchar("category", { length: 20 }).notNull(),
  description: varchar("description", { length: 255 }).notNull(),
  supplier: varchar("supplier", { length: 160 }),
  documentType: varchar("documentType", { length: 20 }).notNull(),
  amountTotal: int("amountTotal").notNull(),
  expenseDate: timestamp("expenseDate").notNull(),
  receiptUrl: text("receiptUrl"),
  rejectReason: varchar("rejectReason", { length: 255 }),
  // Gasto real creado al aprobar (expenses.id).
  expenseId: int("expenseId"),
  reviewedAt: timestamp("reviewedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  coproductionIdx: index("coproduction_expenses_coproduction_idx").on(table.coproductionId),
}));

export type CoproductionExpense = typeof coproductionExpenses.$inferSelect;

// ---------------------------------------------------------------------------
// Concursos de Instagram (admin → Comunidad → Concursos). Reglas puras en
// shared/contest.ts; el motor (webhook, compras, sorteo) en server/contests.ts.
// Tablas aparte a propósito: si la migración 0109 no se corrió, el webhook,
// la compra y el resto del panel siguen igual (todo lo del concurso atrapa
// el error y no hace nada).
// ---------------------------------------------------------------------------

export const contests = mysqlTable("contests", {
  id: int("id").autoincrement().primaryKey(),
  title: varchar("title", { length: 160 }).notNull(),
  eventId: int("eventId").notNull(),
  // draft = armándose; active = recibe participantes (desde config.startsAt);
  // paused = detenido a mano; finished = cerrado (pasó la fiesta o a mano).
  status: mysqlEnum("status", ["draft", "active", "paused", "finished"]).default("draft").notNull(),
  // Publicación de Instagram del concurso: cualquier comentario ahí participa.
  mediaId: varchar("mediaId", { length: 64 }),
  mediaPermalink: varchar("mediaPermalink", { length: 300 }),
  mediaImage: text("mediaImage"),
  // Plantilla (mecánica) del concurso: ranking | draw (shared/contestTemplates.ts).
  template: varchar("template", { length: 30 }).default("ranking").notNull(),
  // shared/contest.ts (normalizeContestConfig): fechas, chances, premios y mensajes.
  config: json("config"),
  // Resumen del sorteo (boletos totales por sorteo) para mostrarlo/auditarlo.
  drawLog: json("drawLog"),
  drawnAt: timestamp("drawnAt"),
  lastSyncAt: timestamp("lastSyncAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Contest = typeof contests.$inferSelect;

export const contestParticipants = mysqlTable("contestParticipants", {
  id: int("id").autoincrement().primaryKey(),
  contestId: int("contestId").notNull(),
  igUserId: varchar("igUserId", { length: 64 }).notNull(),
  username: varchar("username", { length: 120 }),
  // purchase = se inscribió solo al comprar con su @ (sin comentar todavía);
  // su igUserId queda como `ig:<handle>` hasta que comente o escriba.
  source: mysqlEnum("source", ["comment", "story", "dm", "purchase"]).notNull(),
  // Primer comentario (ya usado para el DM privado) y el último sin usar:
  // Meta deja un solo DM privado por comentario, y el que sobra sirve para
  // avisarle si gana.
  firstCommentId: varchar("firstCommentId", { length: 64 }),
  spareCommentId: varchar("spareCommentId", { length: 64 }),
  spareCommentAt: timestamp("spareCommentAt"),
  mentions: json("mentions").$type<string[]>(),
  storyMentioned: int("storyMentioned").default(0).notNull(),
  invitedPurchases: int("invitedPurchases").default(0).notNull(),
  hasTicket: int("hasTicket").default(0).notNull(),
  boughtDuringContest: int("boughtDuringContest").default(0).notNull(),
  // % de descuento de la tanda vigente al participar: su cupón le congela
  // ese precio (shared/contest.ts priceLockCodePercent).
  lockedPhasePercent: int("lockedPhasePercent"),
  email: varchar("email", { length: 320 }),
  // Orden aprobada del evento (para cargarle los regalos de asistente).
  orderId: int("orderId"),
  couponCode: varchar("couponCode", { length: 50 }),
  friendCode: varchar("friendCode", { length: 50 }),
  inviteCode: varchar("inviteCode", { length: 16 }).notNull(),
  // Regalos de asistente ya entregados (una sola vez).
  holderPrizesAt: timestamp("holderPrizesAt"),
  awaitingEmail: int("awaitingEmail").default(0).notNull(),
  disqualified: int("disqualified").default(0).notNull(),
  disqualifyReason: varchar("disqualifyReason", { length: 200 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => ({
  contestUserIdx: uniqueIndex("contest_participants_user_idx").on(t.contestId, t.igUserId),
  inviteIdx: uniqueIndex("contest_participants_invite_idx").on(t.inviteCode),
  usernameIdx: index("contest_participants_username_idx").on(t.username),
}));

export type ContestParticipant = typeof contestParticipants.$inferSelect;

export const contestWinners = mysqlTable("contestWinners", {
  id: int("id").autoincrement().primaryKey(),
  contestId: int("contestId").notNull(),
  participantId: int("participantId").notNull(),
  // double = entradas dobles (sin entrada); vip = premio de asistentes.
  pool: mysqlEnum("pool", ["double", "vip"]).notNull(),
  // Orden de salida en la tómbola: los primeros N ganan, el resto es suplente.
  position: int("position").notNull(),
  chances: int("chances").notNull(),
  // alternate = suplente en espera; notified = ganó y no lo pudimos contactar
  // por DM (espera que escriba); delivered = premio entregado; expired = no
  // reclamó a tiempo (pasa el siguiente suplente); skipped = suplente que ya
  // no hizo falta.
  // choosing = ganó habiendo comprado y está eligiendo devolución o regalo.
  // verifying = ganó y debe mandar RUT, fecha de nacimiento y ACEPTO; review =
  // mandó los datos y el admin debe aprobar; rejected = no cumple los requisitos.
  status: mysqlEnum("status", ["alternate", "verifying", "review", "notified", "choosing", "delivered", "expired", "skipped", "rejected"]).notNull(),
  // Datos que manda el ganador para verificar que puede asistir (+18, sin bloqueo).
  verifyRut: varchar("verifyRut", { length: 20 }),
  verifyBirthDate: varchar("verifyBirthDate", { length: 10 }),
  verifyAcceptedAt: timestamp("verifyAcceptedAt"),
  verifyNote: varchar("verifyNote", { length: 500 }),
  verifiedAt: timestamp("verifiedAt"),
  prizeCode: varchar("prizeCode", { length: 50 }),
  // Ganador que ya había comprado: elige devolución (con tope = valor del
  // premio) o una entrada doble extra para regalar. La devolución se hace a
  // mano en Mercado Pago y se marca en el panel (la entrada sigue válida).
  orderId: int("orderId"),
  choice: mysqlEnum("choice", ["refund", "gift"]),
  choiceToken: varchar("choiceToken", { length: 32 }),
  choiceDeadline: timestamp("choiceDeadline"),
  refundAmount: int("refundAmount"),
  refundStatus: mysqlEnum("refundStatus", ["pending", "done"]),
  refundedAt: timestamp("refundedAt"),
  claimDeadline: timestamp("claimDeadline"),
  notifiedAt: timestamp("notifiedAt"),
  deliveredAt: timestamp("deliveredAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (t) => ({
  contestIdx: index("contest_winners_contest_idx").on(t.contestId),
  choiceTokenIdx: uniqueIndex("contest_winners_choice_token_idx").on(t.choiceToken),
}));

export type ContestWinner = typeof contestWinners.$inferSelect;

// Idempotencia: cada comentario, mención en historia y compra se procesa una
// sola vez aunque llegue por el webhook y por la sincronización a la vez.
export const contestLog = mysqlTable("contestLog", {
  id: int("id").autoincrement().primaryKey(),
  contestId: int("contestId").notNull(),
  kind: mysqlEnum("kind", ["comment", "story", "order"]).notNull(),
  refId: varchar("refId", { length: 100 }).notNull(),
  participantId: int("participantId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (t) => ({
  refIdx: uniqueIndex("contest_log_ref_idx").on(t.contestId, t.kind, t.refId),
}));

// Fotos del concurso de fotos/disfraz: llegan por mención en historia o por DM
// y quedan en una galería para que el jurado (el admin) elija a los ganadores.
export const contestEntries = mysqlTable("contestEntries", {
  id: int("id").autoincrement().primaryKey(),
  contestId: int("contestId").notNull(),
  participantId: int("participantId").notNull(),
  kind: mysqlEnum("kind", ["story", "dm"]).notNull(),
  imageUrl: text("imageUrl").notNull(),
  mid: varchar("mid", { length: 100 }).notNull(),
  hidden: int("hidden").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (t) => ({
  midIdx: uniqueIndex("contest_entries_mid_idx").on(t.contestId, t.mid),
  personIdx: index("contest_entries_person_idx").on(t.contestId, t.participantId),
}));

export type ContestEntry = typeof contestEntries.$inferSelect;

// Acompañantes de órdenes web aprobadas (nombre + RUT que el comprador cargó
// en el checkout). No tienen correo, así que NO viven en `customers` (email
// obligatorio y único, y todo el mailing sale de ahí): esta tabla los deja
// visibles en Clientes y buscables sin que nunca reciban correos.
export const attendeeContacts = mysqlTable("attendee_contacts", {
  id: int("id").autoincrement().primaryKey(),
  // RUT/pasaporte normalizado (sin puntos, mayúsculas). Vacío si no lo dieron.
  rut: varchar("rut", { length: 20 }),
  // Clave de unión: el RUT, o el nombre sin tildes si no hay RUT.
  matchKey: varchar("matchKey", { length: 320 }).notNull(),
  fullName: varchar("fullName", { length: 255 }).notNull(),
  docType: varchar("docType", { length: 16 }).default("rut").notNull(),
  buyerEmail: varchar("buyerEmail", { length: 320 }),
  buyerName: varchar("buyerName", { length: 255 }),
  firstOrderId: int("firstOrderId"),
  lastOrderId: int("lastOrderId"),
  orderIds: json("orderIds"), // number[] de órdenes donde apareció
  eventIds: json("eventIds"), // number[] de eventos
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => ({
  matchKeyIdx: uniqueIndex("attendee_contacts_match_key_idx").on(t.matchKey),
}));

// Cupones personales de los socios (cuenta de «Mi cuenta»): cada uno es un
// `discountCodes` de un solo uso, ligado a un correo. `grantKey` hace
// idempotente el regalo (ej. "bienvenida:ana@x.cl", "nivel:vip:2026-10:ana@x.cl",
// "cumple:2026:ana@x.cl"): dos corridas o dos toques nunca regalan dos veces.
export const memberCoupons = mysqlTable("memberCoupons", {
  id: int("id").autoincrement().primaryKey(),
  email: varchar("email", { length: 320 }).notNull(),
  discountCodeId: int("discountCodeId").notNull(),
  // bienvenida | nivel | cumpleanos | manual
  kind: varchar("kind", { length: 16 }).notNull(),
  title: varchar("title", { length: 120 }).notNull(),
  grantKey: varchar("grantKey", { length: 160 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  keyIdx: uniqueIndex("member_coupons_key_idx").on(table.grantKey),
  emailIdx: index("member_coupons_email_idx").on(table.email),
}));

export type MemberCoupon = typeof memberCoupons.$inferSelect;

// Conocimiento que el agente aprendió (server/agentLearning.ts): datos sueltos,
// no mensajes grabados. Se le pasan al modelo como parte de lo que sabe y nunca
// reemplazan las reglas duras. `revisar` = aprendido solo sobre precios o
// reglas, no se usa hasta que el dueño lo aprueba; `pausado` = no se usa.
export const agentKnowledge = mysqlTable("agentKnowledge", {
  id: int("id").autoincrement().primaryKey(),
  text: varchar("text", { length: 1000 }).notNull(),
  // general | precios | reglas
  topic: varchar("topic", { length: 16 }).notNull().default("general"),
  // dueno (lo escribió el dueño) | respuesta (lo sacó de una respuesta a mano del dueño)
  source: varchar("source", { length: 12 }).notNull(),
  // activo | revisar | pausado
  status: varchar("status", { length: 10 }).notNull().default("activo"),
  // La derivación de la que salió (agentHandoffLog.id), si hay.
  handoffId: int("handoffId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  statusIdx: index("agent_knowledge_status_idx").on(table.status, table.updatedAt),
}));

export type AgentKnowledgeRow = typeof agentKnowledge.$inferSelect;

/** QR de «Pagar en caja» desde la app de socios: vence en 2 minutos y sirve una sola vez
 * (`usedAt` se marca con un UPDATE condicional al cobrar). Ver server/memberPay.ts. */
export const memberPayTokens = mysqlTable("memberPayTokens", {
  nonce: varchar("nonce", { length: 32 }).primaryKey(),
  email: varchar("email", { length: 320 }).notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  usedAt: timestamp("usedAt"),
  usedOpId: varchar("usedOpId", { length: 64 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  emailIdx: index("member_pay_tokens_email_idx").on(table.email, table.createdAt),
}));
export type MemberPayToken = typeof memberPayTokens.$inferSelect;

// Passkeys de «Mi cuenta» (Face ID / Touch ID / huella): entrar sin pedir el
// código al correo. Una fila por dispositivo (o por llavero de iCloud/Google),
// ligada al correo del socio. Independiente de adminWebauthnCredentials: una
// llave de socio nunca abre el panel ni al revés.
export const memberPasskeys = mysqlTable("memberPasskeys", {
  id: int("id").autoincrement().primaryKey(),
  email: varchar("email", { length: 320 }).notNull(),
  credentialId: varchar("credentialId", { length: 255 }).notNull().unique(),
  publicKey: text("publicKey").notNull(),
  // Anti-clonado: ver verifyAuthenticationResponse.
  counter: int("counter").notNull().default(0),
  transports: json("transports"),
  // «iPhone», «Android», «Mac»…: para reconocerla en la lista y poder quitarla.
  deviceLabel: varchar("deviceLabel", { length: 100 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  lastUsedAt: timestamp("lastUsedAt"),
}, (table) => ({
  emailIdx: index("member_passkeys_email_idx").on(table.email),
}));
export type MemberPasskey = typeof memberPasskeys.$inferSelect;

// --- Stock de la barra por insumos (shared/insumos.ts, server/insumos.ts) ---
// Un insumo (ron, vodka, jugo, hielo…) es GLOBAL, no de un evento: las
// botellas que sobran pasan a la fiesta siguiente. Su stock no es una columna
// sino la suma de `insumoMovimientos`, así nunca se pisa un número y siempre
// se puede reconstruir por qué cambió.
export const insumos = mysqlTable("insumos", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  unit: mysqlEnum("unit", ["ml", "g", "un"]).default("ml").notNull(),
  // Cuánto trae un envase (750 ml, 2000 g, 24 un): es lo que cuenta la barra.
  containerSize: int("containerSize").default(750).notNull(),
  containerLabel: varchar("containerLabel", { length: 30 }).default("botella").notNull(),
  // Tamaños de envase con que llega (botellas de 750, 1000 y 1500 ml): [750, 1000, 1500].
  // `containerSize` es el de compra y siempre cuenta como uno de ellos.
  sizes: json("sizes"),
  costPerContainer: decimal("costPerContainer", { precision: 10, scale: 0 }),
  // Avisa cuando alcance para menos de esta cantidad de tragos (0 = no avisa).
  alertDrinks: int("alertDrinks").default(15).notNull(),
  active: int("active").default(1).notNull(),
  sortOrder: int("sortOrder").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type InsumoRow = typeof insumos.$inferSelect;

// Nombres con que un insumo aparece en las boletas de compra («RON BACARDI BCO 750CC» → Ron blanco): se aprenden
// cuando alguien corrige un emparejamiento y hacen que la próxima boleta se reconozca sola.
export const insumoAlias = mysqlTable("insumoAlias", {
  id: int("id").autoincrement().primaryKey(),
  insumoId: int("insumoId").notNull(),
  alias: varchar("alias", { length: 160 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (t) => [uniqueIndex("insumo_alias_alias_idx").on(t.alias)]);

// Receta de un trago de la carta: cuánto gasta de cada insumo (en su unidad).
// Va por ticketTypeId porque cada fiesta tiene su carta; al copiar la carta
// de la fiesta anterior se copian también las recetas (por nombre).
export const insumoRecetas = mysqlTable("insumoRecetas", {
  id: int("id").autoincrement().primaryKey(),
  ticketTypeId: int("ticketTypeId").notNull(),
  insumoId: int("insumoId").notNull(),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  // En qué vaso se sirve (vaso 500 ml, copa 400 ml, shot): un trago puede tener una receta por vaso.
  glass: varchar("glass", { length: 10 }).default("vaso").notNull(),
}, (t) => [
  uniqueIndex("insumo_recetas_tt_insumo_glass_idx").on(t.ticketTypeId, t.insumoId, t.glass),
  index("insumo_recetas_insumo_idx").on(t.insumoId),
]);

// Libro append-only del stock de insumos. Las ventas y anulaciones de /caja
// llevan su opId: el índice único (opId, insumoId, kind) hace que un
// reintento de la cola offline nunca descuente dos veces.
export const insumoMovimientos = mysqlTable("insumoMovimientos", {
  id: int("id").autoincrement().primaryKey(),
  insumoId: int("insumoId").notNull(),
  eventId: int("eventId"),
  kind: mysqlEnum("kind", ["carga", "compra", "venta", "anulacion", "conteo_ajuste", "merma", "ajuste"]).notNull(),
  delta: decimal("delta", { precision: 12, scale: 2 }).notNull(),
  opId: varchar("opId", { length: 64 }),
  conteoId: int("conteoId"),
  operatorId: int("operatorId"),
  note: varchar("note", { length: 255 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (t) => [
  uniqueIndex("insumo_mov_op_idx").on(t.opId, t.insumoId, t.kind),
  index("insumo_mov_insumo_idx").on(t.insumoId),
  index("insumo_mov_event_idx").on(t.eventId, t.createdAt),
]);

// Conteo físico de la barra al abrir y al cerrar turno (/caja).
export const insumoConteos = mysqlTable("insumoConteos", {
  id: int("id").autoincrement().primaryKey(),
  eventId: int("eventId").notNull(),
  registerId: int("registerId"),
  shiftId: int("shiftId"),
  kind: mysqlEnum("kind", ["apertura", "cierre"]).notNull(),
  operatorId: int("operatorId"),
  operatorName: varchar("operatorName", { length: 100 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (t) => [
  index("insumo_conteos_event_idx").on(t.eventId, t.createdAt),
]);

export const insumoConteoLineas = mysqlTable("insumoConteoLineas", {
  id: int("id").autoincrement().primaryKey(),
  conteoId: int("conteoId").notNull(),
  insumoId: int("insumoId").notNull(),
  closedContainers: int("closedContainers").default(0).notNull(),
  openFraction: decimal("openFraction", { precision: 4, scale: 2 }).default("0").notNull(),
  // Qué se contó: { closed: [{ size, count }], open: [{ size, portions }] } (porciones de 10).
  detail: json("detail"),
  countedTotal: decimal("countedTotal", { precision: 12, scale: 2 }).notNull(),
  expectedTotal: decimal("expectedTotal", { precision: 12, scale: 2 }).notNull(),
}, (t) => [
  index("insumo_conteo_lineas_conteo_idx").on(t.conteoId),
]);

// Supervisoras con acceso propio al panel de admin (Belén, etc.): clave y
// segundo factor por persona, mismo esquema que el socio de co-producción.
// `sessionVersion` sube al cambiar o revocar la clave y cierra sus sesiones.
export const panelSupervisors = mysqlTable("panel_supervisors", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 120 }).notNull(),
  passwordHash: varchar("passwordHash", { length: 200 }),
  totpSecret: varchar("totpSecret", { length: 64 }),
  totpConfirmedAt: timestamp("totpConfirmedAt"),
  totpBackupCodes: json("totpBackupCodes"),
  totpLastUsedStep: int("totpLastUsedStep"),
  sessionVersion: int("sessionVersion").default(1).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
