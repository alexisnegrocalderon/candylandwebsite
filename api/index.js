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
import { int, mysqlEnum, mysqlTable, text, timestamp, varchar, decimal, json, index, uniqueIndex } from "drizzle-orm/mysql-core";
var users, events, ticketTypes, orders, orderItems, tickets, discountCodes, communityCodes, siteSettings, referrals, exclusiveAmbassadors, ambassadorCommissions, ambassadorClients, ambassadorProgramConfig, ambassadorBenefitDeliveries, ambassadorWeeklyMaterial, ambassadorApplications, operators, registers, devices, customers, ops, rateLimits, shifts, playcoinsLedger, mailingCampaigns, mailingRecipients, partyProfiles, partyConnections, partyMessages, partyBlocks, partyReports, partyGifts, adminTotp;
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
    exclusiveAmbassadors = mysqlTable("exclusiveAmbassadors", {
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
      updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull()
    });
    ambassadorCommissions = mysqlTable("ambassadorCommissions", {
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
      createdAt: timestamp("createdAt").defaultNow().notNull()
    });
    ambassadorClients = mysqlTable("ambassadorClients", {
      id: int("id").autoincrement().primaryKey(),
      ambassadorId: int("ambassadorId").notNull(),
      customerEmail: varchar("customerEmail", { length: 320 }).notNull().unique(),
      firstOrderId: int("firstOrderId"),
      firstPurchaseAt: timestamp("firstPurchaseAt").defaultNow().notNull(),
      ordersCount: int("ordersCount").default(1).notNull(),
      totalSpent: decimal("totalSpent", { precision: 10, scale: 0 }).default("0").notNull(),
      createdAt: timestamp("createdAt").defaultNow().notNull(),
      updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull()
    });
    ambassadorProgramConfig = mysqlTable("ambassadorProgramConfig", {
      id: int("id").autoincrement().primaryKey(),
      // La frontera entre "cliente de la casa" y "cliente nuevo": quien ya
      // estaba antes de esta fecha nunca pasa a ser propiedad de un embajador.
      launchDate: timestamp("launchDate").defaultNow().notNull(),
      commissionScale: json("commissionScale"),
      // CommissionTier[]
      existingClientPercent: decimal("existingClientPercent", { precision: 5, scale: 2 }).default("10").notNull(),
      benefits: json("benefits"),
      // BenefitTier[]
      weeklyEmailEnabled: int("weeklyEmailEnabled").default(1).notNull(),
      // 0=domingo .. 1=lunes, igual que Date.getUTCDay().
      weeklyEmailWeekday: int("weeklyEmailWeekday").default(1).notNull(),
      // Solo informativo: Vercel Hobby dispara el cron una vez al día a la hora
      // fija de vercel.json, así que esto no puede mover el disparo real.
      weeklyEmailHourChile: int("weeklyEmailHourChile").default(9).notNull(),
      updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull()
    });
    ambassadorBenefitDeliveries = mysqlTable("ambassadorBenefitDeliveries", {
      id: int("id").autoincrement().primaryKey(),
      ambassadorId: int("ambassadorId").notNull(),
      monthKey: varchar("monthKey", { length: 7 }).notNull(),
      benefitKey: varchar("benefitKey", { length: 64 }).notNull(),
      note: text("note"),
      deliveredAt: timestamp("deliveredAt").defaultNow().notNull()
    }, (t2) => [
      uniqueIndex("ambassadorBenefitDeliveries_unique").on(t2.ambassadorId, t2.monthKey, t2.benefitKey)
    ]);
    ambassadorWeeklyMaterial = mysqlTable("ambassadorWeeklyMaterial", {
      id: int("id").autoincrement().primaryKey(),
      title: varchar("title", { length: 255 }),
      storiesText: text("storiesText"),
      reelText: text("reelText"),
      postText: text("postText"),
      countdownText: text("countdownText"),
      linkUrl: varchar("linkUrl", { length: 500 }),
      active: int("active").default(1).notNull(),
      createdAt: timestamp("createdAt").defaultNow().notNull(),
      updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull()
    });
    ambassadorApplications = mysqlTable("ambassadorApplications", {
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
      updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull()
    }, (t2) => [
      index("ambassadorApplications_email_idx").on(t2.email),
      index("ambassadorApplications_status_idx").on(t2.status)
    ]);
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
      // Playcoins (pedido explícito del usuario, reemplaza el sistema de puntos
      // que la tienda tenía en Shopify): saldo cacheado, siempre = suma de
      // `playcoinsLedger` para este cliente -- evita sumar todo el historial en
      // cada lectura de saldo.
      playcoins: int("playcoins").default(0).notNull(),
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
    shifts = mysqlTable("shifts", {
      id: int("id").autoincrement().primaryKey(),
      eventId: int("eventId").notNull(),
      operatorId: int("operatorId").notNull(),
      // quién abrió el turno
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
      topCustomers: json("topCustomers"),
      // [{ name, email, total }]
      topProducts: json("topProducts"),
      // [{ name, quantity, revenue }]
      status: mysqlEnum("status", ["open", "closed"]).default("open").notNull(),
      createdAt: timestamp("createdAt").defaultNow().notNull()
    });
    playcoinsLedger = mysqlTable("playcoinsLedger", {
      id: int("id").autoincrement().primaryKey(),
      customerId: int("customerId").notNull(),
      delta: int("delta").notNull(),
      // + gana, - canjea/ajusta
      reason: mysqlEnum("reason", ["earn_web", "earn_caja", "redeem_caja", "manual_adjust"]).notNull(),
      orderId: int("orderId"),
      // orden web o venta de caja que originó el movimiento (si aplica)
      opId: varchar("opId", { length: 36 }),
      // id del op de caja (idempotencia); null para web
      balanceAfter: int("balanceAfter").notNull(),
      note: text("note"),
      // motivo libre en ajustes manuales del admin
      createdAt: timestamp("createdAt").defaultNow().notNull()
    });
    mailingCampaigns = mysqlTable("mailingCampaigns", {
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
      updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull()
    });
    mailingRecipients = mysqlTable("mailingRecipients", {
      id: int("id").autoincrement().primaryKey(),
      campaignId: int("campaignId").notNull(),
      customerId: int("customerId").notNull(),
      status: mysqlEnum("status", ["pending", "sent", "failed"]).default("pending").notNull(),
      reason: varchar("reason", { length: 500 }),
      sentAt: timestamp("sentAt")
    }, (table) => ({
      // El cron necesita "próximos N pendientes de la campaña más vieja" -- este
      // índice cubre ese patrón exacto.
      campaignStatusIdx: index("mailing_recipients_campaign_status_idx").on(table.campaignId, table.status)
    }));
    partyProfiles = mysqlTable("partyProfiles", {
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
      createdAt: timestamp("createdAt").defaultNow().notNull()
    }, (table) => ({
      // El patrón de consulta real: "todos los perfiles activos de este evento".
      eventActiveIdx: index("party_profiles_event_active_idx").on(table.eventId, table.active)
    }));
    partyConnections = mysqlTable("partyConnections", {
      id: int("id").autoincrement().primaryKey(),
      eventId: int("eventId").notNull(),
      profileLowId: int("profileLowId").notNull(),
      profileHighId: int("profileHighId").notNull(),
      initiatedById: int("initiatedById").notNull(),
      status: mysqlEnum("status", ["pending", "accepted", "declined"]).default("pending").notNull(),
      createdAt: timestamp("createdAt").defaultNow().notNull(),
      respondedAt: timestamp("respondedAt")
    }, (table) => ({
      pairIdx: uniqueIndex("party_connections_pair_idx").on(table.profileLowId, table.profileHighId),
      // "mis conexiones" se consulta por cada lado del par.
      lowIdx: index("party_connections_low_idx").on(table.profileLowId),
      highIdx: index("party_connections_high_idx").on(table.profileHighId)
    }));
    partyMessages = mysqlTable("partyMessages", {
      id: int("id").autoincrement().primaryKey(),
      connectionId: int("connectionId").notNull(),
      fromProfileId: int("fromProfileId").notNull(),
      body: varchar("body", { length: 500 }).notNull(),
      createdAt: timestamp("createdAt").defaultNow().notNull()
    }, (table) => ({
      connectionIdx: index("party_messages_connection_idx").on(table.connectionId, table.createdAt)
    }));
    partyBlocks = mysqlTable("partyBlocks", {
      id: int("id").autoincrement().primaryKey(),
      eventId: int("eventId").notNull(),
      blockerProfileId: int("blockerProfileId").notNull(),
      blockedProfileId: int("blockedProfileId").notNull(),
      createdAt: timestamp("createdAt").defaultNow().notNull()
    }, (table) => ({
      pairIdx: uniqueIndex("party_blocks_pair_idx").on(table.blockerProfileId, table.blockedProfileId)
    }));
    partyReports = mysqlTable("partyReports", {
      id: int("id").autoincrement().primaryKey(),
      eventId: int("eventId").notNull(),
      reporterProfileId: int("reporterProfileId").notNull(),
      reportedProfileId: int("reportedProfileId").notNull(),
      reason: varchar("reason", { length: 500 }).notNull(),
      createdAt: timestamp("createdAt").defaultNow().notNull(),
      resolvedAt: timestamp("resolvedAt")
    }, (table) => ({
      eventIdx: index("party_reports_event_idx").on(table.eventId, table.resolvedAt)
    }));
    partyGifts = mysqlTable("partyGifts", {
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
      redeemedAt: timestamp("redeemedAt")
    }, (table) => ({
      // "mis regalos" (recibidos y enviados) y "los que la caja puede cobrar".
      toIdx: index("party_gifts_to_idx").on(table.toProfileId, table.status),
      fromIdx: index("party_gifts_from_idx").on(table.fromProfileId, table.status),
      // El snapshot de caja necesita los pagados-no-cobrados de TODOS los
      // eventos, no solo del actual.
      statusIdx: index("party_gifts_status_idx").on(table.status),
      orderIdx: index("party_gifts_order_idx").on(table.orderId)
    }));
    adminTotp = mysqlTable("adminTotp", {
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
import { eq as eq2, desc, and, sql, or, gte, lte, like, inArray, isNull, ne } from "drizzle-orm";
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
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
  // Fallback gratuito de LLM para despliegues fuera de la plataforma Forge
  // (ver server/_core/llm.ts, resolveProvider) -- variable propia, nunca
  // pisa BUILT_IN_FORGE_*, que siguen usando imageGeneration/voiceTranscription/
  // map/dataApi/notification/heartbeat/storage.
  geminiApiKey: process.env.GEMINI_API_KEY ?? "",
  // Autentica al cron diario de mailing (server/cronRoutes.ts) -- Vercel
  // manda `Authorization: Bearer <CRON_SECRET>` automáticamente en cada
  // invocación cuando esta variable está seteada en el proyecto. Sin ella
  // configurada en producción, el endpoint queda abierto a cualquiera.
  cronSecret: process.env.CRON_SECRET ?? ""
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

// shared/party.ts
var MAX_TOUCHES_PER_EVENT = 15;
var PRESENCE_WINDOW_MS = 2 * 60 * 1e3;
var MAX_MESSAGE_LENGTH = 500;
var MIN_ALIAS_LENGTH = 2;
var MAX_ALIAS_LENGTH = 16;
var DEFAULT_PARTY_DURATION_MS = 12 * 60 * 60 * 1e3;
var PARTY_ZONES = ["living", "playground", "piscina", "barra"];
var PARTY_GENDERS = ["hombre", "mujer", "pareja"];
var AVATARS_PER_GENDER = 4;
function toTime(value) {
  if (!value) return null;
  const t2 = new Date(value).getTime();
  return Number.isFinite(t2) ? t2 : null;
}
function partyWindow(event) {
  const eventDate = toTime(event.eventDate);
  if (eventDate === null) return null;
  const opensAt = toTime(event.doorsOpen) ?? eventDate;
  const closesAt = toTime(event.eventEnd) ?? eventDate + DEFAULT_PARTY_DURATION_MS;
  return { opensAt, closesAt };
}
function isPartyWindowOpen(event, now = /* @__PURE__ */ new Date()) {
  const window = partyWindow(event);
  if (!window) return false;
  const t2 = now.getTime();
  return t2 >= window.opensAt && t2 < window.closesAt;
}
function partyEntryDenial(ticket, event, now = /* @__PURE__ */ new Date()) {
  if (!ticket || !event) return "sin_ticket";
  if (ticket.status !== "used") return "no_ingreso";
  if (!isPartyWindowOpen(event, now)) return "fuera_de_horario";
  return null;
}
function orderedPair(a, b) {
  return a <= b ? { low: a, high: b } : { low: b, high: a };
}
var ALIAS_FORBIDDEN = [
  { re: /@\w/, reason: "Nada de arrobas ni redes sociales en el alias" },
  { re: /https?:\/\/|www\.|\.com|\.cl\b/i, reason: "Nada de links en el alias" },
  { re: /(?:\d[\s.-]*){7,}/, reason: "Nada de n\xFAmeros de tel\xE9fono en el alias" }
];
function sanitizeAlias(raw) {
  const alias = raw.replace(/\s+/g, " ").trim();
  if (alias.length < MIN_ALIAS_LENGTH) return { ok: false, reason: "Muy corto, m\xEDnimo 2 caracteres" };
  if (alias.length > MAX_ALIAS_LENGTH) return { ok: false, reason: `M\xE1ximo ${MAX_ALIAS_LENGTH} caracteres` };
  for (const { re, reason } of ALIAS_FORBIDDEN) {
    if (re.test(alias)) return { ok: false, reason };
  }
  return { ok: true, alias };
}
function sanitizeMessage(raw) {
  const body = raw.replace(/\s+/g, " ").trim();
  if (!body) return { ok: false, reason: "El mensaje est\xE1 vac\xEDo" };
  if (body.length > MAX_MESSAGE_LENGTH) return { ok: false, reason: `M\xE1ximo ${MAX_MESSAGE_LENGTH} caracteres` };
  return { ok: true, body };
}
var GIFT_INVITE_TTL_MS = 15 * 60 * 1e3;
var MAX_GIFT_MESSAGE_LENGTH = 120;
function giftExpiresAt(createdAt = /* @__PURE__ */ new Date()) {
  return new Date(createdAt.getTime() + GIFT_INVITE_TTL_MS);
}
function isGiftExpired(gift, now = /* @__PURE__ */ new Date()) {
  if (gift.status === "paid" || gift.status === "redeemed") return false;
  if (gift.status === "declined" || gift.status === "expired") return false;
  const t2 = toTime(gift.expiresAt);
  if (t2 === null) return false;
  return now.getTime() >= t2;
}
function canRespondToGift(gift, profileId, now = /* @__PURE__ */ new Date()) {
  if (gift.toProfileId !== profileId) return false;
  if (gift.status !== "invited") return false;
  return !isGiftExpired(gift, now);
}
function canPayGift(gift, profileId, now = /* @__PURE__ */ new Date()) {
  if (gift.fromProfileId !== profileId) return false;
  if (gift.status !== "accepted") return false;
  return !isGiftExpired(gift, now);
}
function sanitizeGiftMessage(raw) {
  const body = raw.replace(/\s+/g, " ").trim();
  if (body.length > MAX_GIFT_MESSAGE_LENGTH) return { ok: false, reason: `M\xE1ximo ${MAX_GIFT_MESSAGE_LENGTH} caracteres` };
  return { ok: true, body };
}

// shared/playcoins.ts
var PLAYCOINS_PER_1000_CLP = 25;
var PLAYCOINS_MIN_REDEEM_BALANCE = 5e3;
function playcoinsEarnedForPurchase(totalClp) {
  if (!Number.isFinite(totalClp) || totalClp <= 0) return 0;
  return Math.floor(totalClp / 1e3) * PLAYCOINS_PER_1000_CLP;
}
function canRedeem(balance) {
  return balance >= PLAYCOINS_MIN_REDEEM_BALANCE;
}
function clampRedeemAmount(requested, balance) {
  if (!canRedeem(balance)) return 0;
  return Math.max(0, Math.min(requested, balance));
}

// shared/eventDay.ts
var CHILE_OFFSET_HOURS = -4;
function dateKey(d, offsetHours) {
  const shifted = new Date(d.getTime() + offsetHours * 60 * 60 * 1e3);
  return shifted.toISOString().slice(0, 10);
}
function isEventToday(eventDate, now, offsetHours = CHILE_OFFSET_HOURS) {
  const d = eventDate instanceof Date ? eventDate : new Date(eventDate);
  if (Number.isNaN(d.getTime())) return false;
  return dateKey(d, offsetHours) === dateKey(now, offsetHours);
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
async function getFeaturedEvent() {
  const db = await getDb();
  if (!db) return void 0;
  const result = await db.select().from(events).where(eq2(events.status, "published")).orderBy(desc(events.featured), events.eventDate).limit(1);
  return result[0];
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
    // Congelado para siempre, a diferencia de ambassadorCode (que
    // ensureOwnAmbassadorCode pisa más adelante) -- ver comentario en el schema.
    referredByCode: input.ambassadorCode || null,
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
function priceManualOrderItems(items, ticketTypesForEvent, kind, missionOpen) {
  let subtotal = 0;
  let missionDeposit = false;
  const unitPrices = /* @__PURE__ */ new Map();
  for (const item of items) {
    const tt = ticketTypesForEvent.find((t2) => t2.id === item.ticketTypeId);
    if (!tt) throw new Error(`Ticket type ${item.ticketTypeId} not found`);
    const available = tt.totalStock - tt.soldCount;
    if (item.quantity > available) throw new Error(`Not enough stock for ${tt.name}`);
    const useDeposit = missionOpen && tt.category === "acceso";
    const defaultPrice = useDeposit ? missionDepositPrice(tt.accesoSlug) : Number(tt.price);
    const unitPrice = kind === "invitation" ? 0 : item.unitPrice != null ? Math.max(0, item.unitPrice) : defaultPrice;
    if (kind === "paid" && useDeposit) missionDeposit = true;
    unitPrices.set(item.ticketTypeId, unitPrice);
    subtotal += unitPrice * item.quantity;
  }
  return { unitPrices, subtotal, missionDeposit };
}
function buildManualPaymentMethod(kind, paymentMethod) {
  return kind === "invitation" ? "Manual: Invitaci\xF3n" : `Manual: ${paymentMethod?.trim() || "Transferencia"}`;
}
async function createManualOrder(input) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  if (input.items.length === 0) throw new Error("Elige al menos un tipo de entrada");
  const event = await getEventBySlug(input.eventSlug);
  if (!event) throw new Error("Event not found");
  const missionOpen = isMissionWindowOpen(new Date(event.eventDate));
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
    discount: "0",
    serviceFee: "0",
    total: String(total),
    paymentStatus: "approved",
    paymentId: `MANUAL-${orderNumber}`,
    paymentMethod,
    missionDeposit: missionDeposit ? 1 : 0,
    ...missionDeposit ? { missionTopupStatus: "paid", missionTopupAmount: "0" } : {},
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
      unitCost: tt?.costPrice != null ? String(tt.costPrice) : null
    });
    await db.update(ticketTypes).set({ soldCount: sql`soldCount + ${item.quantity}` }).where(eq2(ticketTypes.id, item.ticketTypeId));
  }
  return { orderId, orderNumber, total };
}
async function listManualOrders() {
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
    paymentMethod: orders.paymentMethod
  }).from(orders).leftJoin(events, eq2(orders.eventId, events.id)).where(like(orders.paymentMethod, "Manual: %")).orderBy(desc(orders.createdAt));
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
function computeOrderDeleteEffects(order, ledgerEntries) {
  return {
    decrementSoldCount: order.paymentStatus === "approved" || order.paymentStatus === "refunded",
    decrementCustomerTotals: order.channel === "web" && order.paymentStatus === "approved",
    playcoinsReversals: ledgerEntries.filter((e) => e.delta !== 0).map((e) => ({ customerId: e.customerId, delta: -e.delta }))
  };
}
async function deleteOrderCascade(orderId) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [order] = await db.select().from(orders).where(eq2(orders.id, orderId)).limit(1);
  if (!order) return { success: true };
  const ledgerEntries = await db.select().from(playcoinsLedger).where(eq2(playcoinsLedger.orderId, orderId));
  const effects = computeOrderDeleteEffects(order, ledgerEntries);
  if (effects.decrementSoldCount) {
    const items = await db.select().from(orderItems).where(eq2(orderItems.orderId, orderId));
    for (const item of items) {
      await db.update(ticketTypes).set({ soldCount: sql`GREATEST(soldCount - ${item.quantity}, 0)` }).where(eq2(ticketTypes.id, item.ticketTypeId));
    }
  }
  for (const reversal of effects.playcoinsReversals) {
    await adjustPlaycoinsManually(reversal.customerId, reversal.delta, `Orden #${order.orderNumber} eliminada`);
  }
  if (effects.decrementCustomerTotals) {
    const email = order.buyerEmail.trim().toLowerCase();
    const [customer] = await db.select().from(customers).where(eq2(customers.email, email)).limit(1);
    if (customer) {
      await db.update(customers).set({
        totalOrders: Math.max(0, customer.totalOrders - 1),
        totalSpent: String(Math.max(0, Number(customer.totalSpent) - Number(order.total)))
      }).where(eq2(customers.id, customer.id));
    }
  }
  await db.delete(orderItems).where(eq2(orderItems.orderId, orderId));
  await db.delete(tickets).where(eq2(tickets.orderId, orderId));
  await db.delete(referrals).where(eq2(referrals.orderId, orderId));
  await db.delete(ambassadorCommissions).where(eq2(ambassadorCommissions.orderId, orderId));
  await db.delete(ambassadorClients).where(eq2(ambassadorClients.firstOrderId, orderId));
  await db.delete(orders).where(eq2(orders.id, orderId));
  return { success: true };
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
function computeAmbassadorCommissionBase(accesoSubtotal, discount) {
  return Math.max(0, accesoSubtotal - discount);
}
function computeAmbassadorCommission(baseAmount, commissionPercent) {
  return Math.round(baseAmount * commissionPercent / 100);
}
async function createExclusiveAmbassador(data) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const code = data.code.trim().toUpperCase();
  const [existing] = await db.select({ id: exclusiveAmbassadors.id }).from(exclusiveAmbassadors).where(eq2(exclusiveAmbassadors.code, code)).limit(1);
  if (existing) throw new Error(`El c\xF3digo ${code} ya est\xE1 en uso por otro embajador`);
  await db.insert(exclusiveAmbassadors).values({
    eventId: data.eventId ?? null,
    name: data.name,
    code,
    commissionPercent: data.commissionPercent === null || data.commissionPercent === void 0 ? null : String(data.commissionPercent),
    contact: data.contact,
    email: data.email ? data.email.trim().toLowerCase() : null,
    instagram: data.instagram
  });
  return { success: true };
}
async function listExclusiveAmbassadors(eventId) {
  const db = await getDb();
  if (!db) return [];
  const conditions = eventId ? [eq2(exclusiveAmbassadors.eventId, eventId)] : [];
  return db.select().from(exclusiveAmbassadors).where(conditions.length ? and(...conditions) : void 0).orderBy(exclusiveAmbassadors.name);
}
async function updateExclusiveAmbassador(id, data) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const updateData = { ...data };
  if (data.code !== void 0) {
    const code = data.code.trim().toUpperCase();
    const [clash] = await db.select({ id: exclusiveAmbassadors.id }).from(exclusiveAmbassadors).where(and(eq2(exclusiveAmbassadors.code, code), ne(exclusiveAmbassadors.id, id))).limit(1);
    if (clash) throw new Error(`El c\xF3digo ${code} ya est\xE1 en uso por otro embajador`);
    updateData.code = code;
  }
  if (data.commissionPercent !== void 0) {
    updateData.commissionPercent = data.commissionPercent === null ? null : String(data.commissionPercent);
  }
  if (data.email !== void 0) updateData.email = data.email ? data.email.trim().toLowerCase() : null;
  await db.update(exclusiveAmbassadors).set(updateData).where(eq2(exclusiveAmbassadors.id, id));
  return { success: true };
}
async function deleteExclusiveAmbassador(id) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(ambassadorClients).where(eq2(ambassadorClients.ambassadorId, id));
  await db.delete(exclusiveAmbassadors).where(eq2(exclusiveAmbassadors.id, id));
  return { success: true };
}
async function getActiveExclusiveAmbassadorByCode(code) {
  const db = await getDb();
  if (!db) return null;
  const [row] = await db.select().from(exclusiveAmbassadors).where(and(
    eq2(exclusiveAmbassadors.code, code.trim().toUpperCase()),
    eq2(exclusiveAmbassadors.active, 1)
  )).limit(1);
  return row ?? null;
}
async function getCustomerForAttribution(buyerEmail) {
  const db = await getDb();
  if (!db || !buyerEmail) return null;
  const email = buyerEmail.trim().toLowerCase();
  const [row] = await db.select({ firstSeenAt: customers.firstSeenAt, totalOrders: customers.totalOrders }).from(customers).where(eq2(customers.email, email)).limit(1);
  return row ?? null;
}
async function getAmbassadorCommissionReport(eventId) {
  const db = await getDb();
  if (!db) return { ambassadors: [], totalBase: 0, totalCommission: 0 };
  const ambassadorRows = await db.select().from(exclusiveAmbassadors).where(eq2(exclusiveAmbassadors.eventId, eventId)).orderBy(exclusiveAmbassadors.name);
  const commissionRows = await db.select().from(ambassadorCommissions).where(eq2(ambassadorCommissions.eventId, eventId));
  const byAmbassador = /* @__PURE__ */ new Map();
  for (const r of commissionRows) {
    const entry = byAmbassador.get(r.ambassadorId) ?? { salesCount: 0, totalBase: 0, totalCommission: 0 };
    entry.salesCount += 1;
    entry.totalBase += Number(r.baseAmount);
    entry.totalCommission += Number(r.commissionAmount);
    byAmbassador.set(r.ambassadorId, entry);
  }
  const ambassadors = ambassadorRows.map((a) => {
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
      totalCommission: stats.totalCommission
    };
  });
  return {
    ambassadors,
    totalBase: ambassadors.reduce((sum, a) => sum + a.totalBase, 0),
    totalCommission: ambassadors.reduce((sum, a) => sum + a.totalCommission, 0)
  };
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
async function recordIpAttempt(key, maxAttempts, lockoutMs) {
  const db = await getDb();
  if (!db) return;
  const [row] = await db.select().from(rateLimits).where(eq2(rateLimits.key, key)).limit(1);
  const previoVencido = row?.lockedUntil ? new Date(row.lockedUntil).getTime() <= Date.now() : false;
  const attempts = previoVencido ? 1 : (row?.attempts ?? 0) + 1;
  const lockedUntil = attempts >= maxAttempts ? new Date(Date.now() + lockoutMs) : null;
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
async function getEventHappeningToday(now = /* @__PURE__ */ new Date()) {
  const db = await getDb();
  if (!db) return void 0;
  const rows = await db.select().from(events).where(or(eq2(events.status, "published"), eq2(events.status, "soldout")));
  return rows.find((r) => isEventToday(r.eventDate, now));
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
  const buyerEmails = Array.from(new Set(approvedOrders.map((o) => (o.buyerEmail || "").trim().toLowerCase()).filter(Boolean)));
  const rutByEmail = /* @__PURE__ */ new Map();
  if (buyerEmails.length) {
    const matchingCustomers = await db.select({ email: customers.email, rut: customers.rut }).from(customers).where(inArray(customers.email, buyerEmails));
    for (const c of matchingCustomers) rutByEmail.set(c.email, c.rut);
  }
  const attendees = approvedOrders.map((o) => {
    const ts = ticketsByOrder.get(o.id) ?? [];
    const attendeeNames = parseAttendeeNames(o.attendeeData);
    return {
      orderId: o.id,
      orderNumber: o.orderNumber,
      buyerName: o.buyerName,
      buyerEmail: o.buyerEmail,
      buyerPhone: o.buyerPhone,
      rut: rutByEmail.get((o.buyerEmail || "").trim().toLowerCase()) ?? null,
      attendeeNames: attendeeNames.length > 0 ? attendeeNames : [o.buyerName],
      access: ts.filter((t2) => ttById.get(t2.ticketTypeId)?.category === "acceso").map((t2) => ({
        ticketCode: t2.ticketCode,
        status: t2.status,
        typeName: ttById.get(t2.ticketTypeId)?.name,
        // Para contar personas reales en el aforo (un Duo son 2).
        accesoSlug: ttById.get(t2.ticketTypeId)?.accesoSlug ?? null
      })),
      extras: ts.filter((t2) => ttById.get(t2.ticketTypeId)?.category === "extra").map((t2) => ({ displayCode: t2.displayCode, status: t2.status, typeName: ttById.get(t2.ticketTypeId)?.name }))
    };
  });
  const catalog = allTicketTypes.filter((t2) => t2.category === "extra" && t2.status === "active").map((t2) => ({ id: t2.id, name: t2.name, price: Number(t2.price), color: t2.color, internalCode: t2.internalCode }));
  const gifts = await listClaimableGifts();
  return {
    event: { id: event.id, title: event.title, slug: event.slug },
    attendees,
    catalog,
    gifts,
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
  const ticketStats = await db.select({
    category: ticketTypes.category,
    status: tickets.status,
    count: sql`COUNT(*)`
  }).from(tickets).innerJoin(ticketTypes, eq2(ticketTypes.id, tickets.ticketTypeId)).where(eq2(tickets.eventId, eventId)).groupBy(ticketTypes.category, tickets.status);
  const statOf = (category, status) => Number(ticketStats.find((r) => r.category === category && r.status === status)?.count ?? 0);
  const redeemedCount = statOf("extra", "used");
  const accesoTickets = await db.select({ accesoSlug: ticketTypes.accesoSlug, status: tickets.status }).from(tickets).innerJoin(ticketTypes, eq2(ticketTypes.id, tickets.ticketTypeId)).where(and(eq2(tickets.eventId, eventId), eq2(ticketTypes.category, "acceso")));
  let insideCount = 0;
  let expectedCount = 0;
  for (const t2 of accesoTickets) {
    if (t2.status === "cancelled") continue;
    const personas = personasForAccesoSlug(t2.accesoSlug);
    expectedCount += personas;
    if (t2.status === "used") insideCount += personas;
  }
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
    redeemedCount,
    insideCount,
    expectedCount,
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
async function openShift(params) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const existing = await getOpenShift(params.eventId, params.registerId);
  if (existing) return existing.id;
  const [result] = await db.insert(shifts).values({
    eventId: params.eventId,
    operatorId: params.operatorId,
    registerId: params.registerId ?? null,
    openingCash: String(params.openingCash)
  });
  return result.insertId;
}
async function getOpenShift(eventId, registerId) {
  const db = await getDb();
  if (!db) return null;
  const conditions = [eq2(shifts.eventId, eventId), eq2(shifts.status, "open")];
  conditions.push(registerId ? eq2(shifts.registerId, registerId) : isNull(shifts.registerId));
  const [row] = await db.select().from(shifts).where(and(...conditions)).orderBy(desc(shifts.openedAt)).limit(1);
  return row ?? null;
}
async function closeShift(params) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [shift] = await db.select().from(shifts).where(eq2(shifts.id, params.shiftId)).limit(1);
  if (!shift) throw new Error("Turno no encontrado");
  if (shift.status === "closed") throw new Error("Este turno ya fue cerrado");
  const closedAt = /* @__PURE__ */ new Date();
  const shiftSalesConditions = [
    eq2(orders.eventId, shift.eventId),
    eq2(orders.channel, "caja"),
    eq2(orders.paymentStatus, "approved"),
    gte(orders.createdAt, shift.openedAt)
  ];
  if (shift.registerId) shiftSalesConditions.push(eq2(orders.registerId, shift.registerId));
  const shiftSales = await db.select({ total: orders.total, paymentMethod: orders.paymentMethod }).from(orders).where(and(...shiftSalesConditions));
  let expectedCash = 0, expectedDebit = 0, expectedCredit = 0;
  for (const s of shiftSales) {
    const amount = Number(s.total);
    if (s.paymentMethod === "efectivo") expectedCash += amount;
    else if (s.paymentMethod === "debito") expectedDebit += amount;
    else if (s.paymentMethod === "credito") expectedCredit += amount;
  }
  const redeemsCount = await db.select({ count: sql`count(*)` }).from(ops).where(and(
    eq2(ops.eventId, shift.eventId),
    eq2(ops.type, "redeem"),
    eq2(ops.result, "applied"),
    gte(ops.serverAt, shift.openedAt),
    ...shift.registerId ? [eq2(ops.registerId, shift.registerId)] : []
  ));
  const eventOrders = await db.select({ buyerName: orders.buyerName, buyerEmail: orders.buyerEmail, total: orders.total }).from(orders).where(and(eq2(orders.eventId, shift.eventId), eq2(orders.paymentStatus, "approved"), sql`${orders.channel} != 'caja'`));
  const byCustomer = /* @__PURE__ */ new Map();
  for (const o of eventOrders) {
    const entry = byCustomer.get(o.buyerEmail) ?? { name: o.buyerName, email: o.buyerEmail, total: 0 };
    entry.total += Number(o.total);
    byCustomer.set(o.buyerEmail, entry);
  }
  const topCustomers = Array.from(byCustomer.values()).sort((a, b) => b.total - a.total).slice(0, 3);
  const eventItems = await db.select({ ticketTypeId: orderItems.ticketTypeId, quantity: orderItems.quantity, totalPrice: orderItems.totalPrice }).from(orderItems).innerJoin(orders, eq2(orders.id, orderItems.orderId)).where(and(eq2(orders.eventId, shift.eventId), eq2(orders.paymentStatus, "approved")));
  const allTicketTypes = await db.select().from(ticketTypes).where(eq2(ticketTypes.eventId, shift.eventId));
  const ttById = new Map(allTicketTypes.map((t2) => [t2.id, t2]));
  const byProduct = /* @__PURE__ */ new Map();
  for (const item of eventItems) {
    const entry = byProduct.get(item.ticketTypeId) ?? { name: ttById.get(item.ticketTypeId)?.name ?? `#${item.ticketTypeId}`, quantity: 0, revenue: 0 };
    entry.quantity += item.quantity;
    entry.revenue += Number(item.totalPrice);
    byProduct.set(item.ticketTypeId, entry);
  }
  const topProducts = Array.from(byProduct.values()).sort((a, b) => b.quantity - a.quantity).slice(0, 3);
  await db.update(shifts).set({
    closedAt,
    closedByOperatorId: params.closedByOperatorId,
    countedCash: String(params.countedCash),
    countedDebit: String(params.countedDebit),
    countedCredit: String(params.countedCredit),
    expectedCash: String(expectedCash),
    expectedDebit: String(expectedDebit),
    expectedCredit: String(expectedCredit),
    salesCount: shiftSales.length,
    redeemsCount: Number(redeemsCount[0]?.count ?? 0),
    topCustomers,
    topProducts,
    status: "closed"
  }).where(eq2(shifts.id, shift.id));
  const [event] = await db.select({ title: events.title }).from(events).where(eq2(events.id, shift.eventId)).limit(1);
  const [register] = shift.registerId ? await db.select({ name: registers.name }).from(registers).where(eq2(registers.id, shift.registerId)).limit(1) : [null];
  const [operator] = await db.select({ name: operators.name }).from(operators).where(eq2(operators.id, shift.operatorId)).limit(1);
  return {
    id: shift.id,
    eventTitle: event?.title ?? `Evento #${shift.eventId}`,
    registerName: register?.name ?? "Sin caja asignada",
    operatorName: operator?.name ?? "Operador eliminado",
    openedAt: shift.openedAt,
    closedAt,
    openingCash: Number(shift.openingCash),
    countedCash: params.countedCash,
    countedDebit: params.countedDebit,
    countedCredit: params.countedCredit,
    expectedCash,
    expectedDebit,
    expectedCredit,
    cashDiff: params.countedCash - expectedCash - Number(shift.openingCash),
    debitDiff: params.countedDebit - expectedDebit,
    creditDiff: params.countedCredit - expectedCredit,
    salesCount: shiftSales.length,
    redeemsCount: Number(redeemsCount[0]?.count ?? 0),
    topCustomers,
    topProducts
  };
}
async function listShiftClosings(eventId) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [eq2(shifts.status, "closed")];
  if (eventId) conditions.push(eq2(shifts.eventId, eventId));
  const rows = await db.select().from(shifts).where(and(...conditions)).orderBy(desc(shifts.closedAt));
  const eventIds = Array.from(new Set(rows.map((r) => r.eventId)));
  const registerIds = Array.from(new Set(rows.map((r) => r.registerId).filter((id) => id != null)));
  const operatorIds = Array.from(new Set([...rows.map((r) => r.operatorId), ...rows.map((r) => r.closedByOperatorId)].filter((id) => id != null)));
  const eventRows = eventIds.length ? await db.select({ id: events.id, title: events.title }).from(events).where(inArray(events.id, eventIds)) : [];
  const registerRows = registerIds.length ? await db.select({ id: registers.id, name: registers.name }).from(registers).where(inArray(registers.id, registerIds)) : [];
  const operatorRows = operatorIds.length ? await db.select({ id: operators.id, name: operators.name }).from(operators).where(inArray(operators.id, operatorIds)) : [];
  const eventById = new Map(eventRows.map((e) => [e.id, e.title]));
  const registerById = new Map(registerRows.map((r) => [r.id, r.name]));
  const operatorById = new Map(operatorRows.map((o) => [o.id, o.name]));
  return rows.map((r) => ({
    id: r.id,
    eventId: r.eventId,
    eventTitle: eventById.get(r.eventId) ?? `Evento #${r.eventId}`,
    registerName: r.registerId ? registerById.get(r.registerId) ?? "Caja eliminada" : "Sin caja asignada",
    operatorName: operatorById.get(r.operatorId) ?? "Operador eliminado",
    closedByName: r.closedByOperatorId ? operatorById.get(r.closedByOperatorId) ?? "Operador eliminado" : null,
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
    topProducts: r.topProducts ?? []
  }));
}
async function getShiftClosingsForExport(eventId) {
  return listShiftClosings(eventId);
}
async function deleteShiftClosing(shiftId) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(shifts).where(eq2(shifts.id, shiftId));
  return { success: true };
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
async function awardPlaycoins(params) {
  const db = await getDb();
  if (!db) return;
  const email = params.email.trim().toLowerCase();
  if (!email) return;
  const points = playcoinsEarnedForPurchase(params.totalClp);
  if (points <= 0) return;
  const dupConditions = params.opId ? and(eq2(playcoinsLedger.opId, params.opId), eq2(playcoinsLedger.reason, params.reason)) : params.orderId ? and(eq2(playcoinsLedger.orderId, params.orderId), eq2(playcoinsLedger.reason, params.reason)) : void 0;
  if (dupConditions) {
    const [dup] = await db.select().from(playcoinsLedger).where(dupConditions).limit(1);
    if (dup) return;
  }
  let [customer] = await db.select().from(customers).where(eq2(customers.email, email)).limit(1);
  if (!customer) {
    const [ins] = await db.insert(customers).values({ email, accessTypes: [], tags: [] });
    const insertId = ins.insertId;
    [customer] = await db.select().from(customers).where(eq2(customers.id, insertId)).limit(1);
  }
  const balanceAfter = customer.playcoins + points;
  await db.update(customers).set({ playcoins: balanceAfter }).where(eq2(customers.id, customer.id));
  await db.insert(playcoinsLedger).values({
    customerId: customer.id,
    delta: points,
    reason: params.reason,
    orderId: params.orderId ?? null,
    opId: params.opId ?? null,
    balanceAfter
  });
}
async function redeemPlaycoinsAuthoritative(params) {
  const db = await getDb();
  if (!db) return { ok: false, conflictNote: "Base de datos no disponible" };
  const email = params.email.trim().toLowerCase();
  const [customer] = await db.select().from(customers).where(eq2(customers.email, email)).limit(1);
  if (!customer) return { ok: false, conflictNote: "Cliente no encontrado para canjear Playcoins" };
  const redeemed = clampRedeemAmount(params.requestedAmount, customer.playcoins);
  if (redeemed <= 0) {
    return { ok: false, conflictNote: `Saldo insuficiente para canjear Playcoins (saldo actual: ${customer.playcoins})` };
  }
  if (redeemed < params.requestedAmount) {
    return { ok: false, conflictNote: `Saldo insuficiente: se pidieron ${params.requestedAmount} Playcoins pero solo hay ${customer.playcoins} disponibles` };
  }
  const balanceAfter = customer.playcoins - redeemed;
  await db.update(customers).set({ playcoins: balanceAfter }).where(eq2(customers.id, customer.id));
  await db.insert(playcoinsLedger).values({
    customerId: customer.id,
    delta: -redeemed,
    reason: "redeem_caja",
    opId: params.opId,
    balanceAfter
  });
  return { ok: true, redeemed, balanceAfter };
}
async function getPlaycoinsBalance(email) {
  const db = await getDb();
  if (!db) return null;
  const [customer] = await db.select().from(customers).where(eq2(customers.email, email.trim().toLowerCase())).limit(1);
  if (!customer) return null;
  return { email: customer.email, playcoins: customer.playcoins };
}
async function adjustPlaycoinsManually(customerId, delta, note) {
  const db = await getDb();
  if (!db) return;
  const [customer] = await db.select().from(customers).where(eq2(customers.id, customerId)).limit(1);
  if (!customer) return;
  const balanceAfter = Math.max(0, customer.playcoins + delta);
  const appliedDelta = balanceAfter - customer.playcoins;
  await db.update(customers).set({ playcoins: balanceAfter }).where(eq2(customers.id, customerId));
  await db.insert(playcoinsLedger).values({ customerId, delta: appliedDelta, reason: "manual_adjust", balanceAfter, note });
}
function excludeCustomersByTags(rows, excludeTags) {
  if (!excludeTags || excludeTags.length === 0) return rows;
  const excludeSet = new Set(excludeTags);
  return rows.filter((c) => !Array.isArray(c.tags) || !c.tags.some((t2) => excludeSet.has(t2)));
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
  rows = excludeCustomersByTags(rows, filters.excludeTags);
  if (filters.eventId) {
    const approvedOrders = await db.select({ buyerEmail: orders.buyerEmail }).from(orders).where(and(
      eq2(orders.eventId, filters.eventId),
      eq2(orders.paymentStatus, "approved")
    ));
    const emails = new Set(approvedOrders.map((o) => o.buyerEmail.toLowerCase()));
    rows = rows.filter((c) => emails.has(c.email.toLowerCase()));
  }
  return rows;
}
async function listCustomerTags() {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.select({ tags: customers.tags }).from(customers);
  return tallyTags(rows.map((r) => r.tags));
}
function tallyTags(tagLists) {
  const counts = /* @__PURE__ */ new Map();
  for (const list of tagLists) {
    if (!Array.isArray(list)) continue;
    const seen = /* @__PURE__ */ new Set();
    for (const raw of list) {
      if (typeof raw !== "string") continue;
      const tag = raw.trim();
      if (!tag || seen.has(tag)) continue;
      seen.add(tag);
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }
  return Array.from(counts, ([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag, "es"));
}
async function listCustomersByIds(ids) {
  const db = await getDb();
  if (!db || ids.length === 0) return [];
  return db.select().from(customers).where(inArray(customers.id, ids));
}
async function createMailingCampaign(input) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  if (input.customerIds.length === 0) throw new Error("La campa\xF1a necesita al menos un destinatario");
  const [result] = await db.insert(mailingCampaigns).values({
    name: input.name,
    audienceDescription: input.audienceDescription,
    content: input.content,
    ctaUrl: input.ctaUrl,
    eventSections: input.eventSections,
    totalRecipients: input.customerIds.length
  });
  const campaignId = result.insertId;
  await db.insert(mailingRecipients).values(
    input.customerIds.map((customerId) => ({ campaignId, customerId }))
  );
  return { campaignId };
}
async function listMailingCampaigns() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(mailingCampaigns).orderBy(desc(mailingCampaigns.createdAt));
}
async function getMailingCampaignRecipients(campaignId) {
  const db = await getDb();
  if (!db) return [];
  return db.select({
    id: mailingRecipients.id,
    status: mailingRecipients.status,
    reason: mailingRecipients.reason,
    sentAt: mailingRecipients.sentAt,
    email: customers.email,
    fullName: customers.fullName
  }).from(mailingRecipients).innerJoin(customers, eq2(customers.id, mailingRecipients.customerId)).where(eq2(mailingRecipients.campaignId, campaignId)).orderBy(mailingRecipients.id);
}
async function getPendingMailingRecipients(limit) {
  const db = await getDb();
  if (!db) return [];
  return db.select({
    id: mailingRecipients.id,
    campaignId: mailingRecipients.campaignId,
    customerId: mailingRecipients.customerId,
    email: customers.email,
    fullName: customers.fullName,
    campaignName: mailingCampaigns.name,
    content: mailingCampaigns.content,
    ctaUrl: mailingCampaigns.ctaUrl,
    eventSections: mailingCampaigns.eventSections
  }).from(mailingRecipients).innerJoin(mailingCampaigns, eq2(mailingCampaigns.id, mailingRecipients.campaignId)).innerJoin(customers, eq2(customers.id, mailingRecipients.customerId)).where(and(eq2(mailingRecipients.status, "pending"), eq2(mailingCampaigns.status, "sending"))).orderBy(mailingCampaigns.createdAt, mailingRecipients.id).limit(limit);
}
async function markMailingRecipientResult(recipientId, campaignId, success, reason) {
  const db = await getDb();
  if (!db) return;
  await db.update(mailingRecipients).set({
    status: success ? "sent" : "failed",
    reason: success ? null : (reason ?? "Error desconocido").slice(0, 500),
    sentAt: success ? /* @__PURE__ */ new Date() : null
  }).where(eq2(mailingRecipients.id, recipientId));
  await db.update(mailingCampaigns).set({
    sentCount: sql`sentCount + ${success ? 1 : 0}`,
    failedCount: sql`failedCount + ${success ? 0 : 1}`
  }).where(eq2(mailingCampaigns.id, campaignId));
  const [remaining] = await db.select({ count: sql`COUNT(*)` }).from(mailingRecipients).where(and(eq2(mailingRecipients.campaignId, campaignId), eq2(mailingRecipients.status, "pending")));
  if (Number(remaining.count) === 0) {
    await db.update(mailingCampaigns).set({ status: "done" }).where(eq2(mailingCampaigns.id, campaignId));
  }
}
async function bulkAddTagByEmails(emails, tag) {
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
    const tags = Array.isArray(customer.tags) ? customer.tags : [];
    if (tags.includes(cleanTag)) {
      alreadyTagged++;
      continue;
    }
    await db.update(customers).set({ tags: [...tags, cleanTag] }).where(eq2(customers.id, customer.id));
    tagged++;
  }
  return { tagged, alreadyTagged, notFound };
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
async function getPartyActor(ticketCode) {
  const db = await getDb();
  if (!db) return null;
  const [ticket] = await db.select().from(tickets).where(eq2(tickets.ticketCode, ticketCode.trim())).limit(1);
  if (!ticket) return null;
  const [event] = await db.select().from(events).where(eq2(events.id, ticket.eventId)).limit(1);
  if (!event) return null;
  const [profile] = await db.select().from(partyProfiles).where(eq2(partyProfiles.ticketId, ticket.id)).limit(1);
  return { ticket, event, profile: profile ?? null };
}
async function createPartyProfile(params) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(partyProfiles).values({
    eventId: params.eventId,
    ticketId: params.ticketId,
    alias: params.alias,
    gender: params.gender,
    avatarId: params.avatarId,
    zone: params.zone,
    lastSeenAt: /* @__PURE__ */ new Date()
  });
  const [profile] = await db.select().from(partyProfiles).where(eq2(partyProfiles.ticketId, params.ticketId)).limit(1);
  return profile;
}
async function updatePartyProfile(profileId, data) {
  const db = await getDb();
  if (!db) return;
  await db.update(partyProfiles).set(data).where(eq2(partyProfiles.id, profileId));
}
async function getPartyHiddenIds(db, profileId) {
  const rows = await db.select().from(partyBlocks).where(or(eq2(partyBlocks.blockerProfileId, profileId), eq2(partyBlocks.blockedProfileId, profileId)));
  const hidden = /* @__PURE__ */ new Set();
  for (const r of rows) {
    hidden.add(r.blockerProfileId === profileId ? r.blockedProfileId : r.blockerProfileId);
  }
  return hidden;
}
async function getPartyConnectionsFor(db, profileId) {
  return db.select().from(partyConnections).where(or(eq2(partyConnections.profileLowId, profileId), eq2(partyConnections.profileHighId, profileId)));
}
async function listPartyMansion(profileId, eventId) {
  const db = await getDb();
  if (!db) return null;
  await db.update(partyProfiles).set({ lastSeenAt: /* @__PURE__ */ new Date() }).where(eq2(partyProfiles.id, profileId));
  const [hidden, connections, profiles] = await Promise.all([
    getPartyHiddenIds(db, profileId),
    getPartyConnectionsFor(db, profileId),
    db.select().from(partyProfiles).where(and(eq2(partyProfiles.eventId, eventId), eq2(partyProfiles.active, 1)))
  ]);
  const byOther = /* @__PURE__ */ new Map();
  for (const c of connections) {
    const other = c.profileLowId === profileId ? c.profileHighId : c.profileLowId;
    byOther.set(other, c);
  }
  const people = profiles.filter((p) => p.id !== profileId && !hidden.has(p.id)).map((p) => {
    const c = byOther.get(p.id);
    const pendingForMe = !!c && c.status === "pending" && c.initiatedById !== profileId;
    return {
      id: p.id,
      alias: p.alias,
      gender: p.gender,
      avatarId: p.avatarId,
      zone: p.zone,
      lastSeenAt: p.lastSeenAt,
      connectionId: c?.id ?? null,
      // `declined` se le muestra a quien tocó como si siguiera pendiente:
      // el rechazo es silencioso (decisión del dueño).
      connectionStatus: c ? c.status === "declined" && c.initiatedById === profileId ? "pending" : c.status : null,
      pendingForMe
    };
  });
  const touchesUsed = connections.filter((c) => c.initiatedById === profileId).length;
  return { people, touchesUsed, touchesLeft: Math.max(0, MAX_TOUCHES_PER_EVENT - touchesUsed) };
}
async function touchPartyProfile(profileId, targetProfileId, eventId) {
  const db = await getDb();
  if (!db) return { ok: false, reason: "Base de datos no disponible" };
  if (profileId === targetProfileId) return { ok: false, reason: "No puedes tocarte a ti mismo" };
  const [target] = await db.select().from(partyProfiles).where(eq2(partyProfiles.id, targetProfileId)).limit(1);
  if (!target || target.eventId !== eventId || target.active !== 1) {
    return { ok: false, reason: "Esa persona ya no est\xE1 en la fiesta" };
  }
  const hidden = await getPartyHiddenIds(db, profileId);
  if (hidden.has(targetProfileId)) return { ok: false, reason: "Esa persona ya no est\xE1 en la fiesta" };
  const { low, high } = orderedPair(profileId, targetProfileId);
  const [existing] = await db.select().from(partyConnections).where(and(eq2(partyConnections.profileLowId, low), eq2(partyConnections.profileHighId, high))).limit(1);
  if (existing) {
    if (existing.initiatedById === profileId) {
      return existing.status === "accepted" ? { ok: true, status: "accepted", connectionId: existing.id } : { ok: true, status: "pending", connectionId: existing.id };
    }
    if (existing.status === "pending") {
      await db.update(partyConnections).set({ status: "accepted", respondedAt: /* @__PURE__ */ new Date() }).where(eq2(partyConnections.id, existing.id));
      return { ok: true, status: "accepted", connectionId: existing.id };
    }
    if (existing.status === "accepted") return { ok: true, status: "accepted", connectionId: existing.id };
    return { ok: false, reason: "No se puede abrir esta conversaci\xF3n" };
  }
  const connections = await getPartyConnectionsFor(db, profileId);
  const touchesUsed = connections.filter((c) => c.initiatedById === profileId).length;
  if (touchesUsed >= MAX_TOUCHES_PER_EVENT) {
    return { ok: false, reason: `Llegaste al m\xE1ximo de ${MAX_TOUCHES_PER_EVENT} toques por noche` };
  }
  await db.insert(partyConnections).values({
    eventId,
    profileLowId: low,
    profileHighId: high,
    initiatedById: profileId,
    status: "pending"
  });
  const [created] = await db.select().from(partyConnections).where(and(eq2(partyConnections.profileLowId, low), eq2(partyConnections.profileHighId, high))).limit(1);
  return { ok: true, status: "pending", connectionId: created.id };
}
async function respondToPartyTouch(profileId, connectionId, accept) {
  const db = await getDb();
  if (!db) return { ok: false, reason: "Base de datos no disponible" };
  const [c] = await db.select().from(partyConnections).where(eq2(partyConnections.id, connectionId)).limit(1);
  if (!c) return { ok: false, reason: "Ese toque ya no existe" };
  if (c.profileLowId !== profileId && c.profileHighId !== profileId) return { ok: false, reason: "No es tu toque" };
  if (c.initiatedById === profileId) return { ok: false, reason: "No puedes responder tu propio toque" };
  if (c.status !== "pending") return { ok: true, status: c.status };
  const status = accept ? "accepted" : "declined";
  await db.update(partyConnections).set({ status, respondedAt: /* @__PURE__ */ new Date() }).where(eq2(partyConnections.id, connectionId));
  return { ok: true, status };
}
async function getAcceptedConnection(db, profileId, connectionId) {
  const [c] = await db.select().from(partyConnections).where(eq2(partyConnections.id, connectionId)).limit(1);
  if (!c) return null;
  if (c.profileLowId !== profileId && c.profileHighId !== profileId) return null;
  if (c.status !== "accepted") return null;
  return c;
}
async function listPartyMessages(profileId, connectionId) {
  const db = await getDb();
  if (!db) return null;
  const c = await getAcceptedConnection(db, profileId, connectionId);
  if (!c) return null;
  const otherId = c.profileLowId === profileId ? c.profileHighId : c.profileLowId;
  const hidden = await getPartyHiddenIds(db, profileId);
  if (hidden.has(otherId)) return null;
  const [other] = await db.select().from(partyProfiles).where(eq2(partyProfiles.id, otherId)).limit(1);
  const messages = await db.select().from(partyMessages).where(eq2(partyMessages.connectionId, connectionId)).orderBy(partyMessages.createdAt);
  return {
    other: other ? { id: other.id, alias: other.alias, gender: other.gender, avatarId: other.avatarId, zone: other.zone, lastSeenAt: other.lastSeenAt } : null,
    messages: messages.map((m) => ({ id: m.id, body: m.body, mine: m.fromProfileId === profileId, createdAt: m.createdAt }))
  };
}
async function sendPartyMessage(profileId, connectionId, body) {
  const db = await getDb();
  if (!db) return { ok: false, reason: "Base de datos no disponible" };
  const c = await getAcceptedConnection(db, profileId, connectionId);
  if (!c) return { ok: false, reason: "Esta conversaci\xF3n no est\xE1 abierta" };
  const otherId = c.profileLowId === profileId ? c.profileHighId : c.profileLowId;
  const hidden = await getPartyHiddenIds(db, profileId);
  if (hidden.has(otherId)) return { ok: false, reason: "Esta conversaci\xF3n no est\xE1 abierta" };
  await db.insert(partyMessages).values({ connectionId, fromProfileId: profileId, body });
  return { ok: true };
}
async function blockPartyProfile(profileId, targetProfileId, eventId) {
  const db = await getDb();
  if (!db) return;
  await db.insert(partyBlocks).values({ eventId, blockerProfileId: profileId, blockedProfileId: targetProfileId }).onDuplicateKeyUpdate({ set: { blockedProfileId: targetProfileId } });
}
async function reportPartyProfile(profileId, targetProfileId, eventId, reason) {
  const db = await getDb();
  if (!db) return;
  await db.insert(partyReports).values({ eventId, reporterProfileId: profileId, reportedProfileId: targetProfileId, reason });
}
async function listPartyReports(eventId) {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.select({
    id: partyReports.id,
    reason: partyReports.reason,
    createdAt: partyReports.createdAt,
    resolvedAt: partyReports.resolvedAt,
    reporterAlias: sql`reporter.alias`,
    reportedAlias: sql`reported.alias`,
    reportedZone: sql`reported.zone`
  }).from(partyReports).leftJoin(sql`${partyProfiles} as reporter`, sql`reporter.id = ${partyReports.reporterProfileId}`).leftJoin(sql`${partyProfiles} as reported`, sql`reported.id = ${partyReports.reportedProfileId}`).where(eq2(partyReports.eventId, eventId)).orderBy(desc(partyReports.createdAt));
  return rows;
}
async function purgeOldPartyMessages(now = /* @__PURE__ */ new Date()) {
  const db = await getDb();
  if (!db) return { deletedFor: 0 };
  const cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1e3);
  const oldEvents = await db.select({ id: events.id }).from(events).where(lte(events.eventEnd, cutoff));
  if (oldEvents.length === 0) return { deletedFor: 0 };
  const eventIds = oldEvents.map((e) => e.id);
  const conns = await db.select({ id: partyConnections.id }).from(partyConnections).where(inArray(partyConnections.eventId, eventIds));
  if (conns.length === 0) return { deletedFor: 0 };
  await db.delete(partyMessages).where(inArray(partyMessages.connectionId, conns.map((c) => c.id)));
  return { deletedFor: eventIds.length };
}
var PARTY_PROFILE_RETENTION_MS = 365 * 24 * 60 * 60 * 1e3;
async function purgeOldPartyProfiles(now = /* @__PURE__ */ new Date()) {
  const db = await getDb();
  if (!db) return { profilesDeleted: 0 };
  const cutoff = new Date(now.getTime() - PARTY_PROFILE_RETENTION_MS);
  const oldEvents = await db.select({ id: events.id }).from(events).where(lte(events.eventEnd, cutoff));
  if (oldEvents.length === 0) return { profilesDeleted: 0 };
  const eventIds = oldEvents.map((e) => e.id);
  const claimable = await db.select().from(partyGifts).where(eq2(partyGifts.status, "paid"));
  const keep = new Set(claimable.flatMap((g) => [g.fromProfileId, g.toProfileId]));
  const profiles = await db.select({ id: partyProfiles.id }).from(partyProfiles).where(inArray(partyProfiles.eventId, eventIds));
  const toDelete = profiles.map((p) => p.id).filter((id) => !keep.has(id));
  if (toDelete.length === 0) return { profilesDeleted: 0 };
  await db.delete(partyConnections).where(inArray(partyConnections.eventId, eventIds));
  await db.delete(partyBlocks).where(inArray(partyBlocks.eventId, eventIds));
  await db.delete(partyReports).where(inArray(partyReports.eventId, eventIds));
  await db.delete(partyProfiles).where(inArray(partyProfiles.id, toDelete));
  return { profilesDeleted: toDelete.length };
}
async function listPartyDrinks(eventId) {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.select().from(ticketTypes).where(and(eq2(ticketTypes.eventId, eventId), eq2(ticketTypes.category, "extra"), eq2(ticketTypes.status, "active"))).orderBy(ticketTypes.sortOrder);
  return rows.map((t2) => ({ id: t2.id, name: t2.name, price: Number(t2.price), description: t2.description }));
}
async function createGiftInvitation(params) {
  const db = await getDb();
  if (!db) return { ok: false, reason: "Base de datos no disponible" };
  if (params.fromProfileId === params.toProfileId) return { ok: false, reason: "No puedes invitarte un trago a ti mismo" };
  const [target] = await db.select().from(partyProfiles).where(eq2(partyProfiles.id, params.toProfileId)).limit(1);
  if (!target || target.eventId !== params.eventId || target.active !== 1) {
    return { ok: false, reason: "Esa persona ya no est\xE1 en la fiesta" };
  }
  const hidden = await getPartyHiddenIds(db, params.fromProfileId);
  if (hidden.has(params.toProfileId)) return { ok: false, reason: "Esa persona ya no est\xE1 en la fiesta" };
  const [tt] = await db.select().from(ticketTypes).where(eq2(ticketTypes.id, params.ticketTypeId)).limit(1);
  if (!tt || tt.eventId !== params.eventId || tt.category !== "extra" || tt.status !== "active") {
    return { ok: false, reason: "Ese trago no est\xE1 disponible" };
  }
  const existing = await db.select().from(partyGifts).where(and(
    eq2(partyGifts.fromProfileId, params.fromProfileId),
    eq2(partyGifts.toProfileId, params.toProfileId),
    inArray(partyGifts.status, ["invited", "accepted"])
  ));
  if (existing.some((g) => !isGiftExpired(g))) {
    return { ok: false, reason: "Ya tienes una invitaci\xF3n pendiente con esa persona" };
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
    status: "invited",
    expiresAt: giftExpiresAt()
  });
  const [created] = await db.select().from(partyGifts).where(and(eq2(partyGifts.fromProfileId, params.fromProfileId), eq2(partyGifts.toProfileId, params.toProfileId))).orderBy(desc(partyGifts.id)).limit(1);
  return { ok: true, giftId: created.id };
}
async function respondToGiftInvitation(profileId, giftId, accept) {
  const db = await getDb();
  if (!db) return { ok: false, reason: "Base de datos no disponible" };
  const [gift] = await db.select().from(partyGifts).where(eq2(partyGifts.id, giftId)).limit(1);
  if (!gift) return { ok: false, reason: "Esa invitaci\xF3n ya no existe" };
  if (!canRespondToGift(gift, profileId)) return { ok: false, reason: "Esa invitaci\xF3n ya no est\xE1 disponible" };
  const status = accept ? "accepted" : "declined";
  await db.update(partyGifts).set({ status, respondedAt: /* @__PURE__ */ new Date() }).where(eq2(partyGifts.id, giftId));
  return { ok: true, status };
}
async function createGiftOrder(profileId, giftId, buyer) {
  const db = await getDb();
  if (!db) return { ok: false, reason: "Base de datos no disponible" };
  const [gift] = await db.select().from(partyGifts).where(eq2(partyGifts.id, giftId)).limit(1);
  if (!gift) return { ok: false, reason: "Esa invitaci\xF3n ya no existe" };
  if (!canPayGift(gift, profileId)) return { ok: false, reason: "Esta invitaci\xF3n ya no se puede pagar" };
  if (gift.orderId) {
    const [existing] = await db.select().from(orders).where(eq2(orders.id, gift.orderId)).limit(1);
    if (existing && existing.paymentStatus === "pending") {
      return { ok: true, orderNumber: existing.orderNumber, total: Number(existing.total) };
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
    discount: "0",
    serviceFee: "0",
    // el trago se cobra al precio de la barra (decisión del dueño)
    total: String(total),
    paymentStatus: "pending",
    channel: "web"
  });
  const orderId = orderResult.insertId;
  await db.insert(orderItems).values({
    orderId,
    ticketTypeId: gift.ticketTypeId,
    quantity: 1,
    unitPrice: String(total),
    totalPrice: String(total)
  });
  await db.update(partyGifts).set({ orderId }).where(eq2(partyGifts.id, giftId));
  return { ok: true, orderNumber, total };
}
async function getPartyGiftByOrderId(orderId) {
  const db = await getDb();
  if (!db) return null;
  const [gift] = await db.select().from(partyGifts).where(eq2(partyGifts.orderId, orderId)).limit(1);
  return gift ?? null;
}
async function markGiftPaid(giftId, ticketId, displayCode) {
  const db = await getDb();
  if (!db) return;
  await db.update(partyGifts).set({ status: "paid", ticketId, displayCode, paidAt: /* @__PURE__ */ new Date() }).where(eq2(partyGifts.id, giftId));
}
async function listMyGifts(profileId) {
  const db = await getDb();
  if (!db) return { received: [], sent: [] };
  const rows = await db.select().from(partyGifts).where(or(eq2(partyGifts.toProfileId, profileId), eq2(partyGifts.fromProfileId, profileId))).orderBy(desc(partyGifts.id));
  const profileIds = Array.from(new Set(rows.flatMap((g) => [g.fromProfileId, g.toProfileId])));
  const profiles = profileIds.length ? await db.select().from(partyProfiles).where(inArray(partyProfiles.id, profileIds)) : [];
  const aliasById = new Map(profiles.map((p) => [p.id, p.alias]));
  const shape = (g) => ({
    id: g.id,
    drinkName: g.drinkName,
    priceClp: Number(g.priceClp),
    message: g.message,
    // Una invitación vencida se muestra como vencida, no como pendiente.
    status: isGiftExpired(g) ? "expired" : g.status,
    // El código solo se muestra cuando ya está pagado.
    displayCode: g.status === "paid" ? g.displayCode : null,
    fromAlias: aliasById.get(g.fromProfileId) ?? "",
    toAlias: aliasById.get(g.toProfileId) ?? "",
    createdAt: g.createdAt
  });
  return {
    received: rows.filter((g) => g.toProfileId === profileId).map(shape),
    sent: rows.filter((g) => g.fromProfileId === profileId).map(shape)
  };
}
async function listClaimableGifts() {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.select().from(partyGifts).where(eq2(partyGifts.status, "paid"));
  if (rows.length === 0) return [];
  const profileIds = Array.from(new Set(rows.flatMap((g) => [g.fromProfileId, g.toProfileId])));
  const profiles = profileIds.length ? await db.select().from(partyProfiles).where(inArray(partyProfiles.id, profileIds)) : [];
  const aliasById = new Map(profiles.map((p) => [p.id, p.alias]));
  return rows.filter((g) => g.displayCode).map((g) => ({
    displayCode: g.displayCode,
    drinkName: g.drinkName,
    toAlias: aliasById.get(g.toProfileId) ?? "",
    fromAlias: aliasById.get(g.fromProfileId) ?? "",
    eventId: g.eventId,
    paidAt: g.paidAt
  }));
}
async function expireOldGiftInvitations(now = /* @__PURE__ */ new Date()) {
  const db = await getDb();
  if (!db) return { expired: 0 };
  const pending = await db.select().from(partyGifts).where(inArray(partyGifts.status, ["invited", "accepted"]));
  const stale = pending.filter((g) => isGiftExpired(g, now));
  if (stale.length === 0) return { expired: 0 };
  await db.update(partyGifts).set({ status: "expired" }).where(inArray(partyGifts.id, stale.map((g) => g.id)));
  return { expired: stale.length };
}
async function listPartyGiftsForEvent(eventId) {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.select().from(partyGifts).where(eq2(partyGifts.eventId, eventId)).orderBy(desc(partyGifts.id));
  const profileIds = Array.from(new Set(rows.flatMap((g) => [g.fromProfileId, g.toProfileId])));
  const profiles = profileIds.length ? await db.select().from(partyProfiles).where(inArray(partyProfiles.id, profileIds)) : [];
  const aliasById = new Map(profiles.map((p) => [p.id, p.alias]));
  return rows.map((g) => ({
    id: g.id,
    drinkName: g.drinkName,
    priceClp: Number(g.priceClp),
    status: isGiftExpired(g) ? "expired" : g.status,
    fromAlias: aliasById.get(g.fromProfileId) ?? "",
    toAlias: aliasById.get(g.toProfileId) ?? "",
    displayCode: g.displayCode,
    createdAt: g.createdAt,
    paidAt: g.paidAt,
    redeemedAt: g.redeemedAt
  }));
}
async function getPartyProfileContact(profileId) {
  const db = await getDb();
  if (!db) return null;
  const [profile] = await db.select().from(partyProfiles).where(eq2(partyProfiles.id, profileId)).limit(1);
  if (!profile) return null;
  const [ticket] = await db.select().from(tickets).where(eq2(tickets.id, profile.ticketId)).limit(1);
  const [order] = ticket ? await db.select().from(orders).where(eq2(orders.id, ticket.orderId)).limit(1) : [null];
  return { alias: profile.alias, email: order?.buyerEmail ?? null };
}
async function getAdminTotp() {
  const db = await getDb();
  if (!db) return null;
  const [row] = await db.select().from(adminTotp).limit(1);
  return row ?? null;
}
async function getOrCreateUnconfirmedAdminTotp(newSecret) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const existing = await getAdminTotp();
  if (existing) {
    if (existing.confirmedAt) return existing.secret;
    return existing.secret;
  }
  await db.insert(adminTotp).values({ secret: newSecret });
  return newSecret;
}
async function confirmAdminTotp(id, hashedBackupCodes, timeStep) {
  const db = await getDb();
  if (!db) return;
  await db.update(adminTotp).set({ confirmedAt: /* @__PURE__ */ new Date(), backupCodes: hashedBackupCodes, lastUsedStep: timeStep }).where(eq2(adminTotp.id, id));
}
async function recordAdminTotpStep(id, timeStep) {
  const db = await getDb();
  if (!db) return;
  await db.update(adminTotp).set({ lastUsedStep: timeStep }).where(eq2(adminTotp.id, id));
}
async function consumeAdminBackupCodes(id, remaining) {
  const db = await getDb();
  if (!db) return;
  await db.update(adminTotp).set({ backupCodes: remaining }).where(eq2(adminTotp.id, id));
}
async function resetIpRateLimit(key) {
  const db = await getDb();
  if (!db) return;
  await db.delete(rateLimits).where(eq2(rateLimits.key, key));
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

// server/csv.ts
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
function extractEmailColumn(rows, columnNameHints) {
  if (rows.length === 0) return [];
  const [header, ...dataRows] = rows;
  const normalizedHeader = header.map((h) => h.trim().toLowerCase());
  let columnIndex = -1;
  for (const hint of columnNameHints) {
    const idx = normalizedHeader.indexOf(hint.toLowerCase());
    if (idx !== -1) {
      columnIndex = idx;
      break;
    }
  }
  if (columnIndex === -1) return [];
  const emails = /* @__PURE__ */ new Set();
  for (const row of dataRows) {
    const value = row[columnIndex]?.trim().toLowerCase();
    if (value) emails.add(value);
  }
  return Array.from(emails);
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
        { key: "playcoins", label: "Playcoins" },
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
  app.get("/api/admin/shifts/export.csv", async (req, res) => {
    if (!await requireAdmin(req, res)) return;
    const { eventId } = req.query;
    const rows = await getShiftClosingsForExport(eventId ? Number(eventId) : void 0);
    const csv = toCsv(
      rows.map((r) => ({
        ...r,
        openedAt: r.openedAt ? new Date(r.openedAt).toLocaleString("es-CL") : "",
        closedAt: r.closedAt ? new Date(r.closedAt).toLocaleString("es-CL") : "",
        topCustomers: (r.topCustomers ?? []).map((c) => `${c.name} ($${c.total})`).join(" \xB7 "),
        topProducts: (r.topProducts ?? []).map((p) => `${p.name} (${p.quantity}x)`).join(" \xB7 ")
      })),
      [
        { key: "eventTitle", label: "Evento" },
        { key: "registerName", label: "Caja" },
        { key: "operatorName", label: "Abri\xF3" },
        { key: "closedByName", label: "Cerr\xF3" },
        { key: "openedAt", label: "Apertura" },
        { key: "closedAt", label: "Cierre" },
        { key: "openingCash", label: "Efectivo inicial" },
        { key: "countedCash", label: "Efectivo contado" },
        { key: "expectedCash", label: "Efectivo esperado" },
        { key: "cashDiff", label: "Diferencia efectivo" },
        { key: "countedDebit", label: "D\xE9bito contado" },
        { key: "expectedDebit", label: "D\xE9bito esperado" },
        { key: "debitDiff", label: "Diferencia d\xE9bito" },
        { key: "countedCredit", label: "Cr\xE9dito contado" },
        { key: "expectedCredit", label: "Cr\xE9dito esperado" },
        { key: "creditDiff", label: "Diferencia cr\xE9dito" },
        { key: "salesCount", label: "N\xB0 ventas" },
        { key: "redeemsCount", label: "N\xB0 canjes" },
        { key: "topCustomers", label: "Top clientes (evento)" },
        { key: "topProducts", label: "Top productos (evento)" }
      ]
    );
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="cierres-turno-${(/* @__PURE__ */ new Date()).toISOString().slice(0, 10)}.csv"`);
    res.send("\uFEFF" + csv);
  });
}

// server/mailing.ts
import { z } from "zod";

// server/_core/llm.ts
var ensureArray = (value) => Array.isArray(value) ? value : [value];
var normalizeContentPart = (part) => {
  if (typeof part === "string") {
    return { type: "text", text: part };
  }
  if (part.type === "text") {
    return part;
  }
  if (part.type === "image_url") {
    return part;
  }
  if (part.type === "file_url") {
    return part;
  }
  throw new Error("Unsupported message content part");
};
var normalizeMessage = (message) => {
  const { role, name, tool_call_id } = message;
  if (role === "tool" || role === "function") {
    const content = ensureArray(message.content).map((part) => typeof part === "string" ? part : JSON.stringify(part)).join("\n");
    return {
      role,
      name,
      tool_call_id,
      content
    };
  }
  const contentParts = ensureArray(message.content).map(normalizeContentPart);
  if (contentParts.length === 1 && contentParts[0].type === "text") {
    return {
      role,
      name,
      content: contentParts[0].text
    };
  }
  return {
    role,
    name,
    content: contentParts
  };
};
var normalizeToolChoice = (toolChoice, tools) => {
  if (!toolChoice) return void 0;
  if (toolChoice === "none" || toolChoice === "auto") {
    return toolChoice;
  }
  if (toolChoice === "required") {
    if (!tools || tools.length === 0) {
      throw new Error(
        "tool_choice 'required' was provided but no tools were configured"
      );
    }
    if (tools.length > 1) {
      throw new Error(
        "tool_choice 'required' needs a single tool or specify the tool name explicitly"
      );
    }
    return {
      type: "function",
      function: { name: tools[0].function.name }
    };
  }
  if ("name" in toolChoice) {
    return {
      type: "function",
      function: { name: toolChoice.name }
    };
  }
  return toolChoice;
};
var resolveProvider = () => {
  if (ENV.geminiApiKey) {
    return {
      baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
      apiKey: ENV.geminiApiKey,
      defaultModel: "gemini-flash-latest"
    };
  }
  const forgeBase = ENV.forgeApiUrl && ENV.forgeApiUrl.trim().length > 0 ? ENV.forgeApiUrl.replace(/\/$/, "") : "https://forge.manus.im";
  return { baseUrl: `${forgeBase}/v1`, apiKey: ENV.forgeApiKey };
};
var assertApiKey = () => {
  if (!resolveProvider().apiKey) {
    throw new Error("No hay ninguna API key de IA configurada (GEMINI_API_KEY o BUILT_IN_FORGE_API_KEY)");
  }
};
var normalizeResponseFormat = ({
  responseFormat,
  response_format,
  outputSchema,
  output_schema
}) => {
  const explicitFormat = responseFormat || response_format;
  if (explicitFormat) {
    if (explicitFormat.type === "json_schema" && !explicitFormat.json_schema?.schema) {
      throw new Error(
        "responseFormat json_schema requires a defined schema object"
      );
    }
    return explicitFormat;
  }
  const schema = outputSchema || output_schema;
  if (!schema) return void 0;
  if (!schema.name || !schema.schema) {
    throw new Error("outputSchema requires both name and schema");
  }
  return {
    type: "json_schema",
    json_schema: {
      name: schema.name,
      schema: schema.schema,
      ...typeof schema.strict === "boolean" ? { strict: schema.strict } : {}
    }
  };
};
var RETRY_MAX_RETRIES = 4;
var RETRY_BASE_DELAY_MS = 500;
var RETRY_MAX_DELAY_MS = 3e4;
var sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
var parseRetryAfter = (value) => {
  if (!value) return void 0;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1e3);
  const at = Date.parse(value);
  return Number.isNaN(at) ? void 0 : Math.max(0, at - Date.now());
};
var computeBackoffDelay = (attempt, retryAfterMs) => {
  const cap = Math.min(RETRY_BASE_DELAY_MS * 2 ** attempt, RETRY_MAX_DELAY_MS);
  const jittered = cap / 2 + Math.random() * (cap / 2);
  return Math.min(Math.max(jittered, retryAfterMs ?? 0), RETRY_MAX_DELAY_MS);
};
var fetchWithBackoff = async (url, init) => {
  let lastError;
  for (let attempt = 0; attempt <= RETRY_MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(url, init);
      if (response.ok || attempt === RETRY_MAX_RETRIES) {
        return response;
      }
      const retryAfterMs = parseRetryAfter(
        response.headers.get("retry-after")
      );
      try {
        await response.body?.cancel();
      } catch {
      }
      console.warn(
        `LLM request retry ${attempt + 1}/${RETRY_MAX_RETRIES} after status ${response.status}`
      );
      await sleep(computeBackoffDelay(attempt, retryAfterMs));
    } catch (error) {
      lastError = error;
      if (attempt === RETRY_MAX_RETRIES) throw error;
      console.warn(
        `LLM request retry ${attempt + 1}/${RETRY_MAX_RETRIES} after network error`
      );
      await sleep(computeBackoffDelay(attempt));
    }
  }
  throw lastError instanceof Error ? lastError : new Error("LLM request failed after exhausting retries");
};
async function invokeLLM(params) {
  assertApiKey();
  const {
    messages,
    tools,
    toolChoice,
    tool_choice,
    outputSchema,
    output_schema,
    responseFormat,
    response_format,
    model,
    thinking,
    reasoning,
    maxTokens,
    max_tokens
  } = params;
  const provider = resolveProvider();
  const payload = {
    messages: messages.map(normalizeMessage)
  };
  const resolvedModel = model ?? provider.defaultModel;
  if (resolvedModel) {
    payload.model = resolvedModel;
  }
  if (tools && tools.length > 0) {
    payload.tools = tools;
  }
  const normalizedToolChoice = normalizeToolChoice(
    toolChoice || tool_choice,
    tools
  );
  if (normalizedToolChoice) {
    payload.tool_choice = normalizedToolChoice;
  }
  const resolvedMaxTokens = max_tokens ?? maxTokens;
  if (typeof resolvedMaxTokens === "number") {
    payload.max_tokens = resolvedMaxTokens;
  }
  if (thinking) {
    payload.thinking = thinking;
  }
  if (reasoning) {
    payload.reasoning = reasoning;
  }
  const normalizedResponseFormat = normalizeResponseFormat({
    responseFormat,
    response_format,
    outputSchema,
    output_schema
  });
  if (normalizedResponseFormat) {
    payload.response_format = normalizedResponseFormat;
  }
  const response = await fetchWithBackoff(`${provider.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${provider.apiKey}`
    },
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `LLM invoke failed: ${response.status} ${response.statusText} \u2013 ${errorText}`
    );
  }
  return await response.json();
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
var BRAND_NAME = "Mansion Playroom";
var DEFAULT_FROM_ADDRESS = "onboarding@resend.dev";
function resolveFromHeader() {
  const raw = process.env.RESEND_FROM_EMAIL?.trim();
  if (!raw) return `${BRAND_NAME} <${DEFAULT_FROM_ADDRESS}>`;
  const match = raw.match(/<([^>]+)>/);
  const address = (match ? match[1] : raw).trim();
  return `${BRAND_NAME} <${address}>`;
}
async function sendEmail(input) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = resolveFromHeader();
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
function buildAmbassadorApplicationEmail(data) {
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
    <h1 style="color:${INK};font-size:20px;font-weight:800;margin:0 0 4px;">\u{1F451} Nueva postulaci\xF3n a embajador</h1>
    <p style="color:${MUTED};font-size:13px;margin:0 0 20px;">${data.name}</p>

    ${card(`
      <div style="padding:6px 0;border-bottom:1px solid ${BORDER};">
        <p style="color:${FAINT};font-size:11px;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 2px;">Instagram</p>
        <p style="margin:0;"><a href="${data.instagramLink}" style="color:${ACCENT.pink.text};font-size:15px;font-weight:700;text-decoration:none;">@${data.instagram}</a>
        ${data.followers !== null ? `<span style="color:${MUTED};font-size:13px;"> \xB7 ${data.followers.toLocaleString("es-CL")} seguidores</span>` : ""}</p>
      </div>
      <div style="padding:6px 0;border-bottom:1px solid ${BORDER};">
        <p style="color:${FAINT};font-size:11px;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 2px;">WhatsApp</p>
        <p style="margin:0;"><a href="${data.whatsappLink}" style="color:${ACCENT.blue.text};font-size:15px;font-weight:700;text-decoration:none;">${data.whatsapp}</a></p>
      </div>
      <div style="padding:6px 0;">
        <p style="color:${FAINT};font-size:11px;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 2px;">Correo</p>
        <p style="color:${INK};font-size:14px;margin:0;">${data.email}</p>
      </div>
    `)}

    ${data.message ? card(`
      <p style="color:${FAINT};font-size:11px;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 6px;">Lo que escribi\xF3</p>
      <p style="color:${INK};font-size:14px;margin:0;line-height:1.6;">${data.message}</p>
    `) : ""}

    <p style="color:${MUTED};font-size:13px;margin:0;">
      Rev\xEDsala en el panel: Embajadores VIP \u2192 Postulaciones. Desde ah\xED la apruebas y se crea el embajador con su c\xF3digo.
    </p>
  </div>
</body>
</html>`;
}
function buildApplicationReceivedEmail(data) {
  const logoUrl = `${EMAIL_BASE_URL}/candyland/logo-wordmark-email.png`;
  const lista = (items) => items.map((t2) => `<p style="color:${INK};font-size:14px;margin:0 0 6px;">\u2022 ${t2}</p>`).join("");
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

    <div style="background:linear-gradient(160deg,${ACCENT.lilac.bg},${ACCENT.pink.bg});padding:40px 24px;text-align:center;border-radius:0 0 32px 32px;">
      <img src="${logoUrl}" alt="Mansion Playroom" style="height:64px;width:auto;margin-bottom:24px;" />
      <p style="font-size:44px;margin:0 0 12px;">\u{1F451}</p>
      <h1 style="color:${INK};font-size:26px;font-weight:800;margin:0 0 8px;">Recibimos tu postulaci\xF3n, ${data.name}</h1>
      <p style="color:${MUTED};font-size:15px;margin:0;">Te vamos a escribir por WhatsApp para contarte c\xF3mo sigue.</p>
    </div>

    <div style="padding:32px 24px 0;">
      ${sectionTitle("\u2705", "Lo que pedimos")}
      ${card(lista(data.requirements))}

      ${sectionTitle("\u{1F4F1}", "A lo que te comprometes")}
      ${card(lista(data.tasks), { bg: ACCENT.yellow.bg, border: false })}

      ${card(`
        <p style="color:${INK};font-size:14px;margin:0;line-height:1.6;">
          Si quedas seleccionado te llega tu <strong>c\xF3digo personal</strong> y un panel donde vas a ver, en vivo, cu\xE1ntas
          ventas hiciste y cu\xE1nto llevas ganado. No tienes que pedirle el n\xFAmero a nadie.
        </p>
      `)}

      <p style="color:${FAINT};font-size:12px;text-align:center;margin:24px 0 0;">
        Si no postulaste t\xFA, ignora este correo y no pasa nada.
      </p>
    </div>
  </div>
</body>
</html>`;
}
function buildAmbassadorWelcomeEmail(data) {
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

    <div style="background:linear-gradient(160deg,${ACCENT.yellow.bg},${ACCENT.pink.bg});padding:40px 24px;text-align:center;border-radius:0 0 32px 32px;">
      <img src="${logoUrl}" alt="Mansion Playroom" style="height:64px;width:auto;margin-bottom:24px;" />
      <p style="font-size:48px;margin:0 0 12px;">\u{1F389}</p>
      <h1 style="color:${INK};font-size:26px;font-weight:800;margin:0 0 8px;">\xA1Quedaste, ${data.name}!</h1>
      <p style="color:${MUTED};font-size:15px;margin:0;">Ya eres embajador de Mansion Playroom.</p>
    </div>

    <div style="padding:32px 24px 0;">
      ${sectionTitle("\u{1F39F}", "Tu c\xF3digo")}
      ${card(`
        <p style="color:${INK};font-size:32px;font-weight:800;font-family:monospace;margin:0 0 8px;text-align:center;">${data.code}</p>
        <p style="color:${MUTED};font-size:13px;margin:0;text-align:center;">
          Cada persona que lo ponga al comprar su entrada te genera comisi\xF3n, autom\xE1ticamente.
        </p>
      `, { bg: ACCENT.pink.bg, border: false })}

      ${sectionTitle("\u{1F4F1}", "Lo que esperamos de ti")}
      ${card(data.tasks.map((t2) => `<p style="color:${INK};font-size:14px;margin:0 0 6px;">\u2022 ${t2}</p>`).join(""))}

      ${card(`
        <p style="color:${INK};font-size:14px;margin:0;line-height:1.6;">
          Todos los lunes te mandamos un resumen con tus ventas, cu\xE1nto llevas ganado y el material para publicar
          esa semana. No tienes que preguntarle nada a nadie.
        </p>
      `)}

      <div style="text-align:center;margin-top:24px;">
        <a href="${data.panelUrl}" style="display:inline-block;background:${ACCENT.pink.solid};color:#fff;text-decoration:none;padding:14px 32px;border-radius:999px;font-weight:800;font-size:14px;">Ver mi panel</a>
      </div>
    </div>
  </div>
</body>
</html>`;
}
function buildAmbassadorWeeklyEmail(data) {
  const logoUrl = `${EMAIL_BASE_URL}/candyland/logo-wordmark-email.png`;
  const money = (n) => `$${Math.round(n).toLocaleString("es-CL")}`;
  const m = data.material;
  const tieneMaterial = !!m && !!(m.storiesText || m.reelText || m.postText || m.countdownText || m.linkUrl);
  const progreso = data.nextTarget ? Math.min(100, Math.round(data.monthlySales / data.nextTarget.target * 100)) : 100;
  const materialRow = (label, value) => value ? `<div style="padding:8px 0;border-bottom:1px solid ${BORDER};">
         <p style="color:${FAINT};font-size:11px;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 3px;">${label}</p>
         <p style="color:${INK};font-size:14px;margin:0;line-height:1.5;">${value}</p>
       </div>` : "";
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
      <p style="color:${FAINT};font-size:11px;text-transform:uppercase;letter-spacing:1px;margin:0 0 8px;">Tu semana como embajador</p>
      <h1 style="color:${INK};font-size:26px;font-weight:800;margin:0 0 8px;">Hola ${data.name}</h1>
      <p style="color:${MUTED};font-size:15px;margin:0;">
        ${data.monthlySales === 0 ? "Este mes todav\xEDa no registras ventas \u2014 cualquier venta que traigas empieza al 30%." : `Llevas ${data.monthlySales} venta${data.monthlySales === 1 ? "" : "s"} este mes y est\xE1s cobrando el ${data.currentPercent}%.`}
      </p>
    </div>

    <div style="padding:32px 24px 0;">
      ${sectionTitle("\u{1F4CA}", "Tus n\xFAmeros del mes")}
      ${card(`
        ${grid([
    `<div style="background:${ACCENT.pink.bg};border-radius:14px;padding:14px;text-align:center;">
            <p style="color:${ACCENT.pink.text};font-size:24px;font-weight:800;margin:0;">${data.monthlySales}</p>
            <p style="color:${MUTED};font-size:11px;margin:4px 0 0;">Ventas a tus clientes</p>
          </div>`,
    `<div style="background:${ACCENT.blue.bg};border-radius:14px;padding:14px;text-align:center;">
            <p style="color:${ACCENT.blue.text};font-size:24px;font-weight:800;margin:0;">${data.currentPercent}%</p>
            <p style="color:${MUTED};font-size:11px;margin:4px 0 0;">Tu comisi\xF3n actual</p>
          </div>`
  ], 2)}
        <div style="padding:10px 0 0;">
          <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid ${BORDER};">
            <span style="color:${MUTED};font-size:13px;">Comisi\xF3n de este mes</span>
            <span style="color:${INK};font-size:14px;font-weight:700;">${money(data.monthlyCommission)}</span>
          </div>
          <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid ${BORDER};">
            <span style="color:${MUTED};font-size:13px;">Comisi\xF3n acumulada (hist\xF3rica)</span>
            <span style="color:${ACCENT.pink.text};font-size:14px;font-weight:800;">${money(data.totalCommission)}</span>
          </div>
          <div style="display:flex;justify-content:space-between;padding:6px 0;">
            <span style="color:${MUTED};font-size:13px;">Tus clientes exclusivos</span>
            <span style="color:${INK};font-size:14px;font-weight:700;">${data.exclusiveClientsCount}</span>
          </div>
          ${data.monthlyExistingSales > 0 ? `
          <p style="color:${FAINT};font-size:11px;margin:10px 0 0;line-height:1.5;">
            Adem\xE1s hiciste ${data.monthlyExistingSales} venta${data.monthlyExistingSales === 1 ? "" : "s"} a clientes que ya estaban
            en la base: esas pagan 10% y no suben tu nivel.
          </p>` : ""}
        </div>
      `)}

      ${data.nextTarget ? `
      ${sectionTitle("\u{1F3AF}", "Tu pr\xF3ximo objetivo")}
      ${card(`
        <p style="color:${INK};font-size:20px;font-weight:800;margin:0 0 4px;">${data.monthlySales} / ${data.nextTarget.target} ventas</p>
        <p style="color:${MUTED};font-size:14px;margin:0 0 12px;">
          Te faltan <strong>${data.nextTarget.salesNeeded}</strong> para subir al <strong>${data.nextTarget.nextPercent}%</strong>.
        </p>
        <div style="background:${BORDER};border-radius:999px;height:10px;overflow:hidden;">
          <div style="background:${ACCENT.pink.solid};height:10px;width:${progreso}%;border-radius:999px;"></div>
        </div>
      `, { bg: ACCENT.lilac.bg, border: false })}
      ` : `
      ${sectionTitle("\u{1F3C6}", "Nivel m\xE1ximo")}
      ${card(`<p style="color:${INK};font-size:16px;font-weight:700;margin:0;">Est\xE1s en el tramo m\xE1s alto de la escala. Imposible subir m\xE1s.</p>`, { bg: ACCENT.yellow.bg, border: false })}
      `}

      ${data.benefitItems.length > 0 || data.benefitBonusClp > 0 ? `
      ${sectionTitle("\u{1F381}", "Lo que ya desbloqueaste este mes")}
      ${card(`
        ${data.benefitItems.map((b) => `<p style="color:${INK};font-size:15px;font-weight:600;margin:0 0 6px;">\u2022 ${b}</p>`).join("")}
        ${data.benefitBonusClp > 0 ? `<p style="color:${ACCENT.pink.text};font-size:17px;font-weight:800;margin:8px 0 0;">+ Bono de ${money(data.benefitBonusClp)}</p>` : ""}
        <p style="color:${MUTED};font-size:12px;margin:10px 0 0;">Escr\xEDbenos por Instagram para coordinar c\xF3mo lo recibes.</p>
      `, { bg: ACCENT.yellow.bg, border: false })}
      ` : `
      ${card(`<p style="color:${MUTED};font-size:14px;margin:0;">Con tu primera venta del mes se activan tus beneficios: entrada liberada y un acompa\xF1ante.</p>`)}
      `}

      ${tieneMaterial ? `
      ${sectionTitle("\u{1F4F1}", m?.title || "Material de la semana")}
      ${card(`
        ${materialRow("Historias", m?.storiesText)}
        ${materialRow("Reel", m?.reelText)}
        ${materialRow("Publicaci\xF3n", m?.postText)}
        ${materialRow("Cuenta regresiva", m?.countdownText)}
        ${m?.linkUrl ? `<p style="margin:12px 0 0;"><a href="${m.linkUrl}" style="color:${ACCENT.pink.text};font-size:13px;font-weight:700;">Descargar el material \u2192</a></p>` : ""}
      `)}
      ` : ""}

      <div style="text-align:center;margin-top:28px;">
        <p style="color:${FAINT};font-size:11px;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 6px;">Tu c\xF3digo</p>
        <p style="color:${INK};font-size:26px;font-weight:800;font-family:monospace;margin:0 0 20px;">${data.code}</p>
        <a href="${data.panelUrl}" style="display:inline-block;background:${ACCENT.pink.solid};color:#fff;text-decoration:none;padding:14px 32px;border-radius:999px;font-weight:800;font-size:14px;">Ver mi panel</a>
      </div>
    </div>
  </div>
</body>
</html>`;
}
function buildCheckinSummaryEmail(data) {
  const fecha = new Date(data.eventDate).toLocaleDateString("es-CL", { day: "numeric", month: "long", year: "numeric" });
  const pct = data.expectedCount > 0 ? Math.round(data.insideCount / data.expectedCount * 100) : 0;
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
    <h1 style="color:${INK};font-size:20px;font-weight:800;margin:0 0 4px;">\u{1F6AA} ${data.eventTitle}</h1>
    <p style="color:${MUTED};font-size:13px;margin:0 0 20px;">Resumen de ingresos \u2014 ${fecha}</p>

    ${card(`
      <p style="color:${FAINT};font-size:11px;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 6px;">Personas adentro</p>
      <p style="color:${INK};font-size:32px;font-weight:800;margin:0 0 2px;">${data.insideCount.toLocaleString("es-CL")} <span style="color:${MUTED};font-size:16px;font-weight:600;">/ ${data.expectedCount.toLocaleString("es-CL")}</span></p>
      <p style="color:${MUTED};font-size:13px;margin:0;">${pct}% de las entradas vendidas ya hicieron check-in en la puerta.</p>
    `)}
  </div>
</body>
</html>`;
}
function buildShiftCloseEmail(data) {
  const money = (n) => `$${Math.round(n).toLocaleString("es-CL")}`;
  const diffRow = (label, counted, expected, diff) => `
    <div style="padding:8px 0;border-bottom:1px solid ${BORDER};">
      <div style="display:flex;justify-content:space-between;">
        <span style="color:${INK};font-size:14px;">${label}</span>
        <span style="color:${INK};font-size:14px;font-weight:600;">${money(counted)} contado / ${money(expected)} esperado</span>
      </div>
      <p style="color:${Math.abs(diff) < 1 ? ACCENT.blue.text : diff > 0 ? ACCENT.yellow.text : "#D9538F"};font-size:12px;font-weight:700;margin:4px 0 0;">
        ${Math.abs(diff) < 1 ? "\u2713 Cuadra" : diff > 0 ? `\u25B2 Sobran ${money(diff)}` : `\u25BC Faltan ${money(Math.abs(diff))}`}
      </p>
    </div>
  `;
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
    <h1 style="color:${INK};font-size:20px;font-weight:800;margin:0 0 4px;">\u{1F512} Turno cerrado \u2014 ${data.eventTitle}</h1>
    <p style="color:${MUTED};font-size:13px;margin:0 0 20px;">${data.registerName} \xB7 ${data.operatorName} \xB7 ${data.closedAt.toLocaleString("es-CL", { timeZone: "America/Santiago" })}</p>

    ${card(`
      <p style="color:${FAINT};font-size:11px;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 10px;">Cuadre de caja</p>
      <p style="color:${MUTED};font-size:12px;margin:0 0 10px;">Efectivo inicial: ${money(data.openingCash)} \xB7 ${data.salesCount} ventas \xB7 ${data.redeemsCount} canjes</p>
      ${diffRow("\u{1F4B5} Efectivo", data.countedCash, data.expectedCash + data.openingCash, data.cashDiff)}
      ${diffRow("\u{1F4B3} D\xE9bito", data.countedDebit, data.expectedDebit, data.debitDiff)}
      ${diffRow("\u{1F4B3} Cr\xE9dito", data.countedCredit, data.expectedCredit, data.creditDiff)}
    `)}

    ${card(`
      <p style="color:${FAINT};font-size:11px;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 10px;">\u{1F3C6} Top 3 clientes (todo el evento)</p>
      ${data.topCustomers.length === 0 ? `<p style="color:${MUTED};font-size:13px;margin:0;">Sin ventas web registradas.</p>` : data.topCustomers.map((c, i) => `
        <div style="display:flex;justify-content:space-between;padding:6px 0;">
          <span style="color:${INK};font-size:14px;">${i + 1}. ${c.name} <span style="color:${FAINT};font-size:12px;">(${c.email})</span></span>
          <span style="color:${INK};font-size:14px;font-weight:600;">${money(c.total)}</span>
        </div>
      `).join("")}
    `)}

    ${card(`
      <p style="color:${FAINT};font-size:11px;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 10px;">\u{1F947} Top 3 productos m\xE1s vendidos</p>
      ${data.topProducts.length === 0 ? `<p style="color:${MUTED};font-size:13px;margin:0;">Sin ventas registradas.</p>` : data.topProducts.map((p, i) => `
        <div style="display:flex;justify-content:space-between;padding:6px 0;">
          <span style="color:${INK};font-size:14px;">${i + 1}. ${p.name}</span>
          <span style="color:${INK};font-size:14px;font-weight:600;">${p.quantity}x \xB7 ${money(p.revenue)}</span>
        </div>
      `).join("")}
    `)}
  </div>
</body>
</html>`;
}
function buildMailingBlastEmail(data) {
  const logoUrl = `${EMAIL_BASE_URL}/candyland/logo-wordmark-email.png`;
  const greeting = data.buyerName ? `\xA1Hola, ${data.buyerName}!` : "\xA1Hola!";
  const eventInfo = data.eventInfo;
  const showBanner = data.eventSections?.banner ?? true;
  const showDetails = data.eventSections?.details ?? true;
  const showMission300 = data.eventSections?.mission300 ?? true;
  const showVenueGrid = data.eventSections?.venueGrid ?? true;
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
  ${data.preheader ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${data.preheader}</div>` : ""}
  <div style="max-width:600px;margin:0 auto;padding:0 0 40px;background-color:#FFFFFF;">

    ${eventInfo?.imageUrl && showBanner ? `<img src="${eventInfo.imageUrl}" alt="${eventInfo.title}" style="display:block;width:100%;height:auto;" />` : ""}

    <!-- HERO -->
    <div style="background:linear-gradient(160deg,${ACCENT.pink.bg},${ACCENT.yellow.bg});padding:40px 24px;text-align:center;border-radius:0 0 32px 32px;">
      <img src="${logoUrl}" alt="Mansion Playroom" style="height:64px;width:auto;margin-bottom:24px;" />
      <p style="font-size:52px;margin:0 0 12px;">\u{1F36C}</p>
      <p style="color:${MUTED};font-size:14px;margin:0 0 4px;">${greeting}</p>
      <h1 style="color:${INK};font-size:26px;font-weight:800;margin:0;">${data.headline}</h1>
    </div>

    <div style="padding:32px 24px 0;">
      ${data.paragraphs.map((p) => `
        <p style="color:${MUTED};font-size:15px;line-height:1.6;margin:0 0 20px;">${p}</p>
      `).join("")}

      ${eventInfo && showDetails ? `
      ${sectionTitle("\u{1F4C5}", eventInfo.title)}
      ${card(`
        <p style="color:${INK};font-size:15px;margin:6px 0;">\u{1F4C5} ${eventInfo.dateText}</p>
        <p style="color:${INK};font-size:15px;margin:6px 0;">\u{1F4CD} ${eventInfo.venue}${eventInfo.address ? ` \u2014 ${eventInfo.address}` : ""}</p>
        ${eventInfo.mapsUrl ? `<a href="${eventInfo.mapsUrl}" style="display:inline-block;color:${ACCENT.pink.text};font-size:13px;font-weight:700;text-decoration:none;margin:4px 0 0;">\u{1F4CD} Ver en Google Maps \u2192</a>` : ""}
      `)}
      ` : ""}

      ${eventInfo?.mission300 && showMission300 ? card(`
        <div style="text-align:center;">
          <p style="color:${FAINT};font-size:11px;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 6px;">Misi\xF3n 300</p>
          <p style="color:${ACCENT.pink.text};font-size:28px;font-weight:800;margin:0 0 10px;">${eventInfo.mission300.confirmed}/${eventInfo.mission300.goal} ya confirmados</p>
          <p style="color:${INK};font-size:15px;font-weight:700;margin:0;">\u{1F36C} Tu entrada sigue a $${eventInfo.mission300.depositPrice.toLocaleString("es-CL")} por persona mientras dure la Misi\xF3n 300</p>
        </div>
      `, { bg: ACCENT.pink.bg, border: false }) : ""}

      ${eventInfo && showVenueGrid ? `
      ${sectionTitle("\u{1F6DD}", "\xBFQu\xE9 encontrar\xE1s?")}
      ${grid(CONTENT.encontraras.map((x) => `
        <div style="background:${ACCENT.lilac.bg};border-radius:16px;padding:14px;">
          <p style="font-size:22px;margin:0 0 4px;">${x.emoji}</p>
          <p style="color:${INK};font-size:12px;font-weight:700;margin:0;">${x.label}</p>
        </div>
      `), 2)}
      ` : ""}

      ${data.highlightLabel && data.highlightValue ? card(`
        <div style="text-align:center;">
          <p style="color:${FAINT};font-size:11px;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 6px;">${data.highlightLabel}</p>
          <p style="color:${ACCENT.pink.text};font-size:32px;font-weight:800;margin:0;">${data.highlightValue}</p>
        </div>
      `, { bg: ACCENT.pink.bg, border: false }) : ""}

      <div style="text-align:center;padding:${data.highlightLabel && data.highlightValue ? "24px" : "8px"} 0 8px;">
        <a href="${data.ctaUrl}" style="display:inline-block;background:${ACCENT.pink.solid};color:#fff;text-decoration:none;padding:14px 32px;border-radius:999px;font-weight:800;font-size:14px;box-shadow:0 8px 20px rgba(236,95,163,0.35);">${data.ctaText || "Ver m\xE1s"}</a>
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
function buildGiftEmail(data) {
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

    <div style="background:linear-gradient(160deg,${ACCENT.pink.bg},${ACCENT.lilac.bg});padding:40px 24px;text-align:center;border-radius:0 0 32px 32px;">
      <img src="${logoUrl}" alt="Mansion Playroom" style="height:64px;width:auto;margin-bottom:24px;" />
      <p style="font-size:52px;margin:0 0 12px;">\u{1F379}</p>
      <h1 style="color:${INK};font-size:26px;font-weight:800;margin:0 0 8px;">${data.fromAlias} te invit\xF3 un trago</h1>
      <p style="color:${MUTED};font-size:15px;margin:0;">${data.drinkName}</p>
    </div>

    <div style="padding:32px 24px 0;">
      ${data.message ? card(
    `<p style="color:${INK};font-size:15px;font-style:italic;margin:0;text-align:center;">"${data.message}"</p>`,
    { bg: ACCENT.yellow.bg, border: false }
  ) : ""}

      ${card(`
        <p style="color:${FAINT};font-size:12px;text-transform:uppercase;letter-spacing:1px;margin:0 0 12px;text-align:center;">Muestra este c\xF3digo en la barra</p>
        <p style="color:${INK};font-size:32px;font-weight:800;letter-spacing:3px;margin:0;text-align:center;font-family:monospace;">${data.displayCode}</p>
      `, { bg: ACCENT.pink.bg, border: false })}

      ${card(`
        <p style="color:${MUTED};font-size:14px;line-height:1.6;margin:0;">
          Es para <strong style="color:${INK};">${data.toAlias}</strong>, en ${data.eventTitle}.
          Si no alcanzas a cobrarlo esta noche, no se pierde: <strong style="color:${INK};">queda v\xE1lido para la pr\xF3xima fiesta</strong>.
        </p>
      `)}

      <p style="color:${FAINT};font-size:12px;text-align:center;margin:24px 0 0;line-height:1.6;">
        Recibiste este correo porque alguien te invit\xF3 un trago en la fiesta.<br>
        Mansion Playroom \xB7 Candyland
      </p>
    </div>
  </div>
</body>
</html>`;
}

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

// server/ambassadorProgram.ts
import { and as and2, eq as eq3, inArray as inArray2, sql as sql2, desc as desc2 } from "drizzle-orm";
init_schema();

// shared/ambassadorProgram.ts
var DEFAULT_COMMISSION_SCALE = [
  { minSales: 1, maxSales: 5, percent: 30 },
  { minSales: 6, maxSales: 10, percent: 35 },
  { minSales: 11, maxSales: 20, percent: 40 },
  { minSales: 21, maxSales: 30, percent: 45 },
  { minSales: 31, maxSales: null, percent: 50 }
];
var DEFAULT_EXISTING_CLIENT_PERCENT = 10;
var DEFAULT_BENEFITS = [
  { minSales: 1, items: ["Entrada liberada", "1 acompa\xF1ante"], bonusClp: 0 },
  { minSales: 5, items: ["1 botella de espumante"], bonusClp: 0 },
  { minSales: 10, items: ["Botella de espumante o de pisco (a elecci\xF3n)", "2 accesos liberados para regalar"], bonusClp: 0 },
  { minSales: 20, items: [], bonusClp: 5e4 }
];
var DEFAULT_WEEKLY_EMAIL_WEEKDAY = 1;
function sortedScale(scale) {
  return [...scale].sort((a, b) => a.minSales - b.minSales);
}
function percentForSaleNumber(saleNumber, scale = DEFAULT_COMMISSION_SCALE) {
  if (!Number.isFinite(saleNumber) || saleNumber < 1) return 0;
  const tiers = sortedScale(scale);
  for (const t2 of tiers) {
    if (saleNumber >= t2.minSales && (t2.maxSales === null || saleNumber <= t2.maxSales)) return t2.percent;
  }
  return tiers.length ? tiers[tiers.length - 1].percent : 0;
}
function tierForSales(count, scale = DEFAULT_COMMISSION_SCALE) {
  if (count < 1) return void 0;
  const tiers = sortedScale(scale);
  return tiers.find((t2) => count >= t2.minSales && (t2.maxSales === null || count <= t2.maxSales)) ?? tiers[tiers.length - 1];
}
function nextTierTarget(count, scale = DEFAULT_COMMISSION_SCALE) {
  const next = sortedScale(scale).find((t2) => count < t2.minSales);
  if (!next) return null;
  return { target: next.minSales, salesNeeded: next.minSales - count, nextPercent: next.percent };
}
function unlockedBenefits(monthlySales, benefits = DEFAULT_BENEFITS) {
  const tiers = [...benefits].sort((a, b) => a.minSales - b.minSales).filter((b) => monthlySales >= b.minSales);
  return {
    items: tiers.flatMap((t2) => t2.items),
    bonusClp: tiers.reduce((sum, t2) => sum + t2.bonusClp, 0),
    tiers
  };
}
function nextBenefit(monthlySales, benefits = DEFAULT_BENEFITS) {
  return [...benefits].sort((a, b) => a.minSales - b.minSales).find((b) => monthlySales < b.minSales) ?? null;
}
function toTime2(value) {
  if (value === null || value === void 0) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.getTime();
}
function resolveAttribution(params) {
  const { ownerAmbassadorId, earnerAmbassadorId } = params;
  if (ownerAmbassadorId !== null) {
    const esSuyo = ownerAmbassadorId === earnerAmbassadorId;
    return { clientType: esSuyo ? "exclusivo" : "existente", assignsOwnership: false, countsForTier: esSuyo };
  }
  const firstSeen = toTime2(params.priorCustomerFirstSeenAt);
  const launch = toTime2(params.launchDate);
  const esNuevo = firstSeen === null || launch !== null && firstSeen >= launch;
  return esNuevo ? { clientType: "exclusivo", assignsOwnership: true, countsForTier: true } : { clientType: "existente", assignsOwnership: false, countsForTier: false };
}
function commissionPercentForSale(params) {
  if (params.overridePercent !== null && params.overridePercent !== void 0) return params.overridePercent;
  if (params.clientType === "existente") return params.existingClientPercent ?? DEFAULT_EXISTING_CLIENT_PERCENT;
  return percentForSaleNumber(params.saleNumberThisMonth, params.scale ?? DEFAULT_COMMISSION_SCALE);
}
function monthKeyFor(date, offsetHours = CHILE_OFFSET_HOURS) {
  const t2 = toTime2(date);
  if (t2 === null) return "";
  return new Date(t2 + offsetHours * 60 * 60 * 1e3).toISOString().slice(0, 7);
}
function isWeeklyEmailDay(now, weekday = DEFAULT_WEEKLY_EMAIL_WEEKDAY, offsetHours = CHILE_OFFSET_HOURS) {
  const shifted = new Date(now.getTime() + offsetHours * 60 * 60 * 1e3);
  return shifted.getUTCDay() === weekday;
}

// server/ambassadorProgram.ts
function parseJsonArray(raw, fallback) {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : fallback;
    } catch {
      return fallback;
    }
  }
  return fallback;
}
async function getProgramConfig() {
  const defaults = {
    launchDate: /* @__PURE__ */ new Date(),
    commissionScale: DEFAULT_COMMISSION_SCALE,
    existingClientPercent: DEFAULT_EXISTING_CLIENT_PERCENT,
    benefits: DEFAULT_BENEFITS,
    weeklyEmailEnabled: true,
    weeklyEmailWeekday: DEFAULT_WEEKLY_EMAIL_WEEKDAY,
    weeklyEmailHourChile: 9
  };
  const db = await getDb();
  if (!db) return defaults;
  const [row] = await db.select().from(ambassadorProgramConfig).limit(1);
  if (!row) {
    await db.insert(ambassadorProgramConfig).values({
      commissionScale: DEFAULT_COMMISSION_SCALE,
      benefits: DEFAULT_BENEFITS,
      existingClientPercent: String(DEFAULT_EXISTING_CLIENT_PERCENT)
    });
    return defaults;
  }
  return {
    launchDate: new Date(row.launchDate),
    commissionScale: parseJsonArray(row.commissionScale, DEFAULT_COMMISSION_SCALE),
    existingClientPercent: Number(row.existingClientPercent),
    benefits: parseJsonArray(row.benefits, DEFAULT_BENEFITS),
    weeklyEmailEnabled: row.weeklyEmailEnabled === 1,
    weeklyEmailWeekday: row.weeklyEmailWeekday,
    weeklyEmailHourChile: row.weeklyEmailHourChile
  };
}
async function updateProgramConfig(data) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await getProgramConfig();
  const [row] = await db.select({ id: ambassadorProgramConfig.id }).from(ambassadorProgramConfig).limit(1);
  const patch = {};
  if (data.launchDate !== void 0) patch.launchDate = data.launchDate;
  if (data.commissionScale !== void 0) patch.commissionScale = data.commissionScale;
  if (data.existingClientPercent !== void 0) patch.existingClientPercent = String(data.existingClientPercent);
  if (data.benefits !== void 0) patch.benefits = data.benefits;
  if (data.weeklyEmailEnabled !== void 0) patch.weeklyEmailEnabled = data.weeklyEmailEnabled ? 1 : 0;
  if (data.weeklyEmailWeekday !== void 0) patch.weeklyEmailWeekday = data.weeklyEmailWeekday;
  if (data.weeklyEmailHourChile !== void 0) patch.weeklyEmailHourChile = data.weeklyEmailHourChile;
  if (Object.keys(patch).length > 0 && row) {
    await db.update(ambassadorProgramConfig).set(patch).where(eq3(ambassadorProgramConfig.id, row.id));
  }
  return { success: true };
}
async function countExclusiveSalesInMonth(db, ambassadorId, monthKey) {
  const [row] = await db.select({ count: sql2`COUNT(*)` }).from(ambassadorCommissions).where(and2(
    eq3(ambassadorCommissions.ambassadorId, ambassadorId),
    eq3(ambassadorCommissions.monthKey, monthKey),
    eq3(ambassadorCommissions.clientType, "exclusivo")
  ));
  return Number(row?.count ?? 0);
}
async function attributeAmbassadorSale(params) {
  const db = await getDb();
  if (!db) return { attributed: false, reason: "sin_base" };
  const { order } = params;
  const email = (order.buyerEmail ?? "").trim().toLowerCase();
  const [already] = await db.select({ id: ambassadorCommissions.id }).from(ambassadorCommissions).where(eq3(ambassadorCommissions.orderId, order.id)).limit(1);
  if (already) return { attributed: false, reason: "ya_registrada" };
  const code = (order.referredByCode || order.ambassadorCode || "").trim().toUpperCase();
  const fromCode = code ? await getActiveExclusiveAmbassadorByCode(code) : null;
  const [owner] = email ? await db.select().from(ambassadorClients).where(eq3(ambassadorClients.customerEmail, email)).limit(1) : [];
  const earner = fromCode ?? (owner ? await getAmbassadorById(db, owner.ambassadorId) : null);
  if (!earner) {
    return { attributed: false, reason: code ? "codigo_desconocido" : "sin_codigo_ni_due\xF1o" };
  }
  const config = await getProgramConfig();
  const attribution = resolveAttribution({
    priorCustomerFirstSeenAt: params.priorCustomer?.firstSeenAt ?? null,
    launchDate: config.launchDate,
    ownerAmbassadorId: owner ? owner.ambassadorId : null,
    earnerAmbassadorId: earner.id
  });
  const createdAt = order.createdAt ? new Date(order.createdAt) : /* @__PURE__ */ new Date();
  const monthKey = monthKeyFor(createdAt);
  const salesRank = attribution.countsForTier ? await countExclusiveSalesInMonth(db, earner.id, monthKey) + 1 : 0;
  const percent = commissionPercentForSale({
    clientType: attribution.clientType,
    saleNumberThisMonth: salesRank,
    scale: config.commissionScale,
    existingClientPercent: config.existingClientPercent,
    overridePercent: earner.commissionPercent === null || earner.commissionPercent === void 0 ? null : Number(earner.commissionPercent)
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
    salesRank: attribution.countsForTier ? salesRank : null
  });
  if (attribution.assignsOwnership && email) {
    try {
      await db.insert(ambassadorClients).values({
        ambassadorId: earner.id,
        customerEmail: email,
        firstOrderId: order.id,
        firstPurchaseAt: createdAt,
        ordersCount: 1,
        totalSpent: String(Number(order.total ?? 0))
      });
    } catch {
    }
  } else if (owner && owner.ambassadorId === earner.id) {
    await db.update(ambassadorClients).set({
      ordersCount: owner.ordersCount + 1,
      totalSpent: String(Number(owner.totalSpent) + Number(order.total ?? 0))
    }).where(eq3(ambassadorClients.id, owner.id));
  }
  console.log(
    `[Embajadores] Orden ${order.orderNumber}: ${earner.name} (${earner.code}) cobra $${commissionAmount.toLocaleString("es-CL")} = ${percent}% de $${baseAmount.toLocaleString("es-CL")} \xB7 cliente ${attribution.clientType}${attribution.countsForTier ? ` \xB7 venta #${salesRank} del mes ${monthKey}` : ""}${code && fromCode && owner && owner.ambassadorId !== earner.id ? " \xB7 c\xF3digo cruzado" : ""}`
  );
  return { attributed: true, ambassadorId: earner.id, clientType: attribution.clientType, percent, amount: commissionAmount };
}
async function getAmbassadorById(db, id) {
  const [row] = await db.select().from(exclusiveAmbassadors).where(eq3(exclusiveAmbassadors.id, id)).limit(1);
  return row ?? null;
}
async function getAmbassadorStats(ambassadorId, monthKey) {
  const db = await getDb();
  if (!db) return null;
  const all = await db.select().from(ambassadorCommissions).where(eq3(ambassadorCommissions.ambassadorId, ambassadorId));
  const delMes = all.filter((c) => c.monthKey === monthKey);
  const exclusivasDelMes = delMes.filter((c) => c.clientType === "exclusivo");
  const config = await getProgramConfig();
  const monthlySales = exclusivasDelMes.length;
  const clientes = await db.select({ count: sql2`COUNT(*)` }).from(ambassadorClients).where(eq3(ambassadorClients.ambassadorId, ambassadorId));
  return {
    monthKey,
    monthlySales,
    monthlyExistingSales: delMes.length - monthlySales,
    monthlyRevenue: delMes.reduce((s, c) => s + Number(c.baseAmount), 0),
    monthlyCommission: delMes.reduce((s, c) => s + Number(c.commissionAmount), 0),
    totalCommission: all.reduce((s, c) => s + Number(c.commissionAmount), 0),
    totalSales: all.length,
    exclusiveClientsCount: Number(clientes[0]?.count ?? 0),
    existingClientsCount: new Set(
      all.filter((c) => c.clientType === "existente").map((c) => c.customerEmail).filter(Boolean)
    ).size,
    currentPercent: tierForSales(monthlySales, config.commissionScale)?.percent ?? config.commissionScale[0]?.percent ?? 0,
    nextTarget: nextTierTarget(monthlySales, config.commissionScale),
    benefits: unlockedBenefits(monthlySales, config.benefits),
    nextBenefit: nextBenefit(monthlySales, config.benefits)
  };
}
async function getAmbassadorSales(ambassadorId, limit = 200) {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.select().from(ambassadorCommissions).where(eq3(ambassadorCommissions.ambassadorId, ambassadorId)).orderBy(sql2`${ambassadorCommissions.createdAt} DESC`).limit(limit);
  if (rows.length === 0) return [];
  const eventIds = Array.from(new Set(rows.map((r) => r.eventId).filter(Boolean)));
  const eventRows = eventIds.length ? await db.select({ id: events.id, title: events.title }).from(events).where(inArray2(events.id, eventIds)) : [];
  const titleById = new Map(eventRows.map((e) => [e.id, e.title]));
  const orderIds = Array.from(new Set(rows.map((r) => r.orderId).filter(Boolean)));
  const orderRows = orderIds.length ? await db.select({ id: orders.id, orderNumber: orders.orderNumber, buyerName: orders.buyerName }).from(orders).where(inArray2(orders.id, orderIds)) : [];
  const orderById = new Map(orderRows.map((o) => [o.id, o]));
  return rows.map((r) => ({
    id: r.id,
    createdAt: r.createdAt,
    eventTitle: titleById.get(r.eventId) ?? "\u2014",
    orderNumber: orderById.get(r.orderId)?.orderNumber ?? null,
    customerName: orderById.get(r.orderId)?.buyerName ?? null,
    customerEmail: r.customerEmail,
    baseAmount: Number(r.baseAmount),
    commissionPercent: Number(r.commissionPercent),
    commissionAmount: Number(r.commissionAmount),
    clientType: r.clientType,
    codeUsed: r.codeUsed,
    salesRank: r.salesRank
  }));
}
function maskEmail(email) {
  if (!email) return "\u2014";
  const [user, domain] = email.split("@");
  if (!domain) return "\u2014";
  const visible = user.slice(0, 2);
  return `${visible}${"*".repeat(Math.max(2, user.length - 2))}@${domain}`;
}
async function getAmbassadorPanel(code, now = /* @__PURE__ */ new Date()) {
  const db = await getDb();
  if (!db) return null;
  const clean = (code ?? "").trim().toUpperCase();
  if (!clean) return null;
  const [ambassador] = await db.select().from(exclusiveAmbassadors).where(eq3(exclusiveAmbassadors.code, clean)).limit(1);
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
    sales: sales.map((s) => ({ ...s, customerEmail: maskEmail(s.customerEmail), customerName: s.customerName }))
  };
}
async function getAmbassadorRanking(monthKey) {
  const db = await getDb();
  if (!db) return [];
  const ambassadors = await db.select().from(exclusiveAmbassadors).orderBy(exclusiveAmbassadors.name);
  const rows = await db.select().from(ambassadorCommissions).where(eq3(ambassadorCommissions.monthKey, monthKey));
  const allRows = await db.select().from(ambassadorCommissions);
  const ranking = ambassadors.map((a) => {
    const delMes = rows.filter((r) => r.ambassadorId === a.id);
    const exclusivas = delMes.filter((r) => r.clientType === "exclusivo");
    return {
      id: a.id,
      name: a.name,
      code: a.code,
      active: a.active === 1,
      exclusiveSales: exclusivas.length,
      existingSales: delMes.length - exclusivas.length,
      monthlyRevenue: delMes.reduce((s, r) => s + Number(r.baseAmount), 0),
      monthlyCommission: delMes.reduce((s, r) => s + Number(r.commissionAmount), 0),
      totalCommission: allRows.filter((r) => r.ambassadorId === a.id).reduce((s, r) => s + Number(r.commissionAmount), 0)
    };
  });
  return ranking.sort((a, b) => b.exclusiveSales - a.exclusiveSales || b.monthlyRevenue - a.monthlyRevenue).map((r, i) => ({ position: i + 1, ...r }));
}
async function getAmbassadorAdminSummary(monthKey) {
  const db = await getDb();
  if (!db) {
    return {
      monthKey,
      activeAmbassadors: 0,
      monthlySales: 0,
      monthlyRevenue: 0,
      monthlyCommission: 0,
      newClients: 0,
      existingClients: 0,
      topAmbassador: null
    };
  }
  const ranking = await getAmbassadorRanking(monthKey);
  const rows = await db.select().from(ambassadorCommissions).where(eq3(ambassadorCommissions.monthKey, monthKey));
  const exclusivas = rows.filter((r) => r.clientType === "exclusivo");
  const top = ranking.find((r) => r.exclusiveSales > 0) ?? null;
  const deliveries = await db.select({ count: sql2`COUNT(*)` }).from(ambassadorBenefitDeliveries).where(eq3(ambassadorBenefitDeliveries.monthKey, monthKey));
  return {
    monthKey,
    activeAmbassadors: ranking.filter((r) => r.active).length,
    monthlySales: rows.length,
    monthlyRevenue: rows.reduce((s, r) => s + Number(r.baseAmount), 0),
    monthlyCommission: rows.reduce((s, r) => s + Number(r.commissionAmount), 0),
    newClients: exclusivas.length,
    existingClients: rows.length - exclusivas.length,
    benefitsDelivered: Number(deliveries[0]?.count ?? 0),
    topAmbassador: top ? { name: top.name, code: top.code, exclusiveSales: top.exclusiveSales } : null
  };
}
async function listReferredClients() {
  const db = await getDb();
  if (!db) return [];
  const ambassadors = await db.select().from(exclusiveAmbassadors);
  const nameById = new Map(ambassadors.map((a) => [a.id, a.name]));
  const owned = await db.select().from(ambassadorClients);
  const commissions = await db.select().from(ambassadorCommissions);
  const exclusivos = owned.map((c) => ({
    customerEmail: c.customerEmail,
    ambassadorName: nameById.get(c.ambassadorId) ?? "\u2014",
    firstPurchaseAt: c.firstPurchaseAt,
    ordersCount: c.ordersCount,
    totalSpent: Number(c.totalSpent),
    clientType: "exclusivo"
  }));
  const yaListados = new Set(exclusivos.map((c) => c.customerEmail));
  const existentesPorEmail = /* @__PURE__ */ new Map();
  for (const r of commissions) {
    if (r.clientType !== "existente" || !r.customerEmail || yaListados.has(r.customerEmail)) continue;
    const prev = existentesPorEmail.get(r.customerEmail);
    const at = new Date(r.createdAt);
    if (prev) {
      prev.count += 1;
      prev.total += Number(r.baseAmount);
      if (at < prev.first) prev.first = at;
    } else {
      existentesPorEmail.set(r.customerEmail, {
        ambassadorName: nameById.get(r.ambassadorId) ?? "\u2014",
        first: at,
        count: 1,
        total: Number(r.baseAmount)
      });
    }
  }
  const existentes = Array.from(existentesPorEmail.entries()).map(([email, v]) => ({
    customerEmail: email,
    ambassadorName: v.ambassadorName,
    firstPurchaseAt: v.first,
    ordersCount: v.count,
    totalSpent: v.total,
    clientType: "existente"
  }));
  return [...exclusivos, ...existentes].sort(
    (a, b) => new Date(b.firstPurchaseAt).getTime() - new Date(a.firstPurchaseAt).getTime()
  );
}
async function listBenefitDeliveries(monthKey) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(ambassadorBenefitDeliveries).where(eq3(ambassadorBenefitDeliveries.monthKey, monthKey));
}
async function markBenefitDelivered(params) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  try {
    await db.insert(ambassadorBenefitDeliveries).values({
      ambassadorId: params.ambassadorId,
      monthKey: params.monthKey,
      benefitKey: params.benefitKey,
      note: params.note
    });
  } catch {
  }
  return { success: true };
}
async function unmarkBenefitDelivered(params) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(ambassadorBenefitDeliveries).where(and2(
    eq3(ambassadorBenefitDeliveries.ambassadorId, params.ambassadorId),
    eq3(ambassadorBenefitDeliveries.monthKey, params.monthKey),
    eq3(ambassadorBenefitDeliveries.benefitKey, params.benefitKey)
  ));
  return { success: true };
}
async function getWeeklyMaterial() {
  const db = await getDb();
  if (!db) return null;
  const [row] = await db.select().from(ambassadorWeeklyMaterial).where(eq3(ambassadorWeeklyMaterial.active, 1)).orderBy(desc2(ambassadorWeeklyMaterial.createdAt)).limit(1);
  return row ?? null;
}
async function saveWeeklyMaterial(data) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(ambassadorWeeklyMaterial).set({ active: 0 }).where(eq3(ambassadorWeeklyMaterial.active, 1));
  await db.insert(ambassadorWeeklyMaterial).values({
    title: data.title,
    storiesText: data.storiesText,
    reelText: data.reelText,
    postText: data.postText,
    countdownText: data.countdownText,
    linkUrl: data.linkUrl,
    active: 1
  });
  return { success: true };
}
var PANEL_BASE_URL = process.env.APP_URL && process.env.APP_URL !== "https://mansionplayroom.cl" ? process.env.APP_URL : "https://mansionplayroom.cl";
async function sendWeeklyAmbassadorEmails(now = /* @__PURE__ */ new Date()) {
  const db = await getDb();
  if (!db) return { sent: 0, skipped: 0, failed: 0 };
  const monthKey = monthKeyFor(now);
  const material = await getWeeklyMaterial();
  const featured = await getFeaturedEvent();
  let countdownText = material?.countdownText ?? null;
  if (!countdownText && featured?.eventDate) {
    const dias = Math.ceil((new Date(featured.eventDate).getTime() - now.getTime()) / (1e3 * 60 * 60 * 24));
    if (dias > 0) countdownText = `Faltan ${dias} d\xEDa${dias === 1 ? "" : "s"} para ${featured.title}.`;
  }
  const ambassadors = await db.select().from(exclusiveAmbassadors).where(eq3(exclusiveAmbassadors.active, 1));
  let sent = 0, skipped = 0, failed = 0;
  for (const a of ambassadors) {
    if (!a.email) {
      skipped++;
      continue;
    }
    try {
      const stats = await getAmbassadorStats(a.id, monthKey);
      if (!stats) {
        skipped++;
        continue;
      }
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
        material: material ? { ...material, countdownText } : countdownText ? { countdownText } : null
      });
      const res = await sendEmail({
        to: a.email,
        subject: stats.nextTarget && stats.monthlySales > 0 ? `\u{1F36C} ${a.name}, te faltan ${stats.nextTarget.salesNeeded} ventas para el ${stats.nextTarget.nextPercent}%` : `\u{1F36C} Tu resumen de embajador \u2014 ${a.name}`,
        html
      });
      if (res.success) sent++;
      else failed++;
    } catch (err) {
      console.error(`[Embajadores] Fall\xF3 el correo semanal de ${a.code}:`, err);
      failed++;
    }
  }
  console.log(`[Embajadores] Correo semanal: ${sent} enviados, ${skipped} sin correo, ${failed} con error.`);
  return { sent, skipped, failed };
}

// server/webhooks.ts
init_schema();
import { eq as eq4, and as and3, sql as sql3, isNotNull, ne as ne2, inArray as inArray3 } from "drizzle-orm";
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
  const [order] = await db.select().from(orders).where(eq4(orders.orderNumber, input.orderNumber)).limit(1);
  if (!order) return { ok: false, reason: "Order not found" };
  if (order.paymentId === input.paymentId && order.paymentStatus !== "pending") {
    return { ok: true, alreadyProcessed: true };
  }
  await db.update(orders).set({
    paymentStatus: input.status,
    paymentId: input.paymentId,
    paymentMethod: input.paymentMethodId || void 0
  }).where(eq4(orders.id, order.id));
  if (input.status === "approved") {
    const isTopupPayment = order.missionTopupStatus === "pending";
    const isMissionDeposit = order.missionDeposit === 1 && order.missionTopupStatus === "none";
    if (!isTopupPayment) {
      const items = await db.select().from(orderItems).where(eq4(orderItems.orderId, order.id));
      for (const item of items) {
        await db.update(ticketTypes).set({ soldCount: sql3`soldCount + ${item.quantity}` }).where(eq4(ticketTypes.id, item.ticketTypeId));
      }
    }
    if (isMissionDeposit) {
      if (!order.depositEmailSent) await sendMissionDepositEmail(order);
    } else if (isTopupPayment) {
      await db.update(orders).set({ missionTopupStatus: "paid" }).where(eq4(orders.id, order.id));
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
  const [order] = await db.select().from(orders).where(eq4(orders.orderNumber, input.orderNumber)).limit(1);
  if (!order) throw new Error("Order not found");
  if (order.paymentStatus === "approved") throw new Error("Order already paid");
  const [event] = await db.select().from(events).where(eq4(events.id, order.eventId)).limit(1);
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
  const [order] = await db.select().from(orders).where(eq4(orders.orderNumber, orderNumber)).limit(1);
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
  const [previousOrder] = await db.select().from(orders).where(and3(eq4(orders.buyerEmail, order.buyerEmail), eq4(orders.paymentStatus, "approved"), isNotNull(orders.ambassadorCode), ne2(orders.id, order.id))).orderBy(orders.createdAt).limit(1);
  const existingUsers = previousOrder ? null : await db.select().from(users).where(eq4(users.email, order.buyerEmail)).limit(1);
  const code = previousOrder?.ambassadorCode || existingUsers?.[0]?.ambassadorCode || nanoid2(8).toUpperCase();
  await db.update(orders).set({ ambassadorCode: code }).where(eq4(orders.id, order.id));
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
  const [event] = await db.select().from(events).where(eq4(events.id, order.eventId)).limit(1);
  if (!event) return { success: false };
  const items = await db.select().from(orderItems).where(eq4(orderItems.orderId, order.id));
  const emailItems = [];
  for (const item of items) {
    const [tt] = await db.select().from(ticketTypes).where(eq4(ticketTypes.id, item.ticketTypeId)).limit(1);
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
    await db.update(orders).set({ depositEmailSent: 1 }).where(eq4(orders.id, order.id));
    await sendSalesRecordCopy(order, event, emailItems, false);
  }
  return result;
}
async function sendConfirmationEmailForOrder(order, sendSalesCopy = false) {
  const db = await getDb();
  if (!db) return { success: false };
  const [event] = await db.select().from(events).where(eq4(events.id, order.eventId)).limit(1);
  if (!event) return { success: false };
  const items = await db.select().from(orderItems).where(eq4(orderItems.orderId, order.id));
  const emailItems = [];
  for (const item of items) {
    const [tt] = await db.select().from(ticketTypes).where(eq4(ticketTypes.id, item.ticketTypeId)).limit(1);
    emailItems.push({ name: tt?.name || "Entrada", quantity: item.quantity, price: Number(item.totalPrice) });
  }
  const orderTickets = await db.select().from(tickets).where(eq4(tickets.orderId, order.id));
  let mainTicket = null;
  for (const t2 of orderTickets) {
    const [tt] = await db.select().from(ticketTypes).where(eq4(ticketTypes.id, t2.ticketTypeId)).limit(1);
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
  const [order] = await db.select().from(orders).where(eq4(orders.orderNumber, orderNumber)).limit(1);
  if (!order) throw new Error("Orden no encontrada");
  if (order.paymentStatus !== "approved") throw new Error("La orden todav\xEDa no est\xE1 aprobada");
  const existingTickets = await db.select().from(tickets).where(eq4(tickets.orderId, order.id)).limit(1);
  const isUnresolvedDeposit = existingTickets.length === 0 && order.missionDeposit === 1;
  const result = isUnresolvedDeposit ? await sendMissionDepositEmail(order) : await sendConfirmationEmailForOrder(order);
  if (!result.success) throw new Error("Resend rechaz\xF3 el env\xEDo -- revisa la configuraci\xF3n de RESEND_API_KEY/RESEND_FROM_EMAIL en Vercel.");
  return { success: true };
}
async function processApprovedOrder(order) {
  const db = await getDb();
  if (!db) return;
  const items = await db.select().from(orderItems).where(eq4(orderItems.orderId, order.id));
  const [event] = await db.select().from(events).where(eq4(events.id, order.eventId)).limit(1);
  if (!event) return;
  const gift = await getPartyGiftByOrderId(order.id);
  const giftRecipient = gift ? await getPartyProfileContact(gift.toProfileId) : null;
  const giftSender = gift ? await getPartyProfileContact(gift.fromProfileId) : null;
  let giftTicketId = null;
  let giftDisplayCode = null;
  const orderTicketTypeIds = Array.from(new Set(items.map((i) => i.ticketTypeId)));
  const orderTicketTypes = orderTicketTypeIds.length ? await db.select().from(ticketTypes).where(inArray3(ticketTypes.id, orderTicketTypeIds)) : [];
  const ticketTypeById = new Map(orderTicketTypes.map((tt) => [tt.id, tt]));
  for (const item of items) {
    const tt = ticketTypeById.get(item.ticketTypeId);
    const isRedeemable = tt?.category === "extra";
    const prefix = tt ? tt.internalCode || fallbackInternalCode(tt.name) : "EXT";
    for (let i = 0; i < item.quantity; i++) {
      const ticketCode = `MP-${nanoid2(12).toUpperCase()}`;
      const { qrData, qrImageUrl } = await generateTicketQR(ticketCode, event.title);
      const displayCode = isRedeemable ? generateDisplayCode(prefix) : null;
      const [inserted] = await db.insert(tickets).values({
        ticketCode,
        orderId: order.id,
        orderItemId: item.id,
        eventId: order.eventId,
        ticketTypeId: item.ticketTypeId,
        // Un regalo va a nombre de quien lo recibe, no de quien lo pagó:
        // es el alias que el barman ve al canjearlo en la barra.
        holderName: giftRecipient?.alias ?? order.buyerName,
        qrData,
        qrImageUrl,
        status: "valid",
        displayCode
      });
      if (gift && giftTicketId === null) {
        giftTicketId = inserted.insertId;
        giftDisplayCode = displayCode;
      }
    }
  }
  const orderAccesoSlugs = Array.from(orderTicketTypes).filter((tt) => tt.category === "acceso" && tt.accesoSlug).map((tt) => tt.accesoSlug);
  const priorCustomer = await getCustomerForAttribution(order.buyerEmail);
  await upsertCustomerFromOrder(order, orderAccesoSlugs);
  await awardPlaycoins({ email: order.buyerEmail, totalClp: Number(order.total), reason: "earn_web", orderId: order.id });
  const referrerCode = order.referredByCode || order.ambassadorCode;
  const accesoSubtotal = items.reduce((sum, item) => {
    const tt = ticketTypeById.get(item.ticketTypeId);
    return tt?.category === "acceso" ? sum + Number(item.totalPrice) : sum;
  }, 0);
  const vipAttribution = await attributeAmbassadorSale({ order, accesoSubtotal, priorCustomer });
  if (referrerCode && !vipAttribution.attributed) {
    const [ambassadorOrder] = await db.select().from(orders).where(and3(eq4(orders.ambassadorCode, referrerCode), eq4(orders.paymentStatus, "approved"))).limit(1);
    if (ambassadorOrder && ambassadorOrder.id !== order.id) {
      const totalTickets = items.reduce((sum, item) => sum + item.quantity, 0);
      await db.insert(referrals).values({
        ambassadorCode: referrerCode,
        orderId: order.id,
        buyerEmail: order.buyerEmail,
        ticketCount: totalTickets,
        orderTotal: order.total
      });
      const [{ count: referralCount }] = await db.select({ count: sql3`COUNT(*)` }).from(referrals).where(eq4(referrals.ambassadorCode, referrerCode));
      const count = Number(referralCount);
      if (AMBASSADOR_TIERS.some((t2) => t2.min === count)) {
        const html = buildTierUpEmail({ buyerName: ambassadorOrder.buyerName, ambassadorCode: referrerCode, referralCount: count });
        await sendEmail({ to: ambassadorOrder.buyerEmail, subject: `${tierForCount(count).emoji} \xA1Llegaste a nivel ${tierForCount(count).name}!`, html });
      } else {
        const next = nextTierForCount(count);
        if (next && next.min - count === 1) {
          const html = buildAlmostTierEmail({ buyerName: ambassadorOrder.buyerName, ambassadorCode: referrerCode, referralCount: count });
          await sendEmail({ to: ambassadorOrder.buyerEmail, subject: `\u{1F525} \xA1Est\xE1s a 1 venta de nivel ${next.name}!`, html });
        }
      }
    }
  }
  await ensureOwnAmbassadorCode(db, order);
  const [refreshedOrder] = await db.select().from(orders).where(eq4(orders.id, order.id)).limit(1);
  if (gift && giftTicketId !== null) {
    await markGiftPaid(gift.id, giftTicketId, giftDisplayCode);
    if (giftRecipient?.email && giftDisplayCode) {
      const html = buildGiftEmail({
        toAlias: giftRecipient.alias,
        fromAlias: giftSender?.alias ?? "Alguien",
        drinkName: gift.drinkName,
        displayCode: giftDisplayCode,
        message: gift.message,
        eventTitle: event.title
      });
      await sendEmail({ to: giftRecipient.email, subject: `\u{1F379} ${giftSender?.alias ?? "Alguien"} te invit\xF3 un ${gift.drinkName}`, html });
    }
    await db.update(orders).set({ emailSent: 1 }).where(eq4(orders.id, order.id));
    return;
  }
  const result = await sendConfirmationEmailForOrder(refreshedOrder ?? order, true);
  if (result.success) {
    await db.update(orders).set({ emailSent: 1 }).where(eq4(orders.id, order.id));
  }
}
async function getMission300Status(eventId) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [event] = await db.select().from(events).where(eq4(events.id, eventId)).limit(1);
  if (!event) throw new Error("Event not found");
  const eligible = await db.select().from(orders).where(and3(
    eq4(orders.eventId, eventId),
    eq4(orders.missionDeposit, 1),
    eq4(orders.paymentStatus, "approved"),
    eq4(orders.missionTopupStatus, "none")
  ));
  let totalPersonas = 0;
  for (const order of eligible) {
    const items = await db.select().from(orderItems).where(eq4(orderItems.orderId, order.id));
    for (const item of items) {
      const [tt] = await db.select().from(ticketTypes).where(eq4(ticketTypes.id, item.ticketTypeId)).limit(1);
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
  const [event] = await db.select().from(events).where(eq4(events.id, eventId)).limit(1);
  if (!event) throw new Error("Event not found");
  const eligible = await db.select().from(orders).where(and3(
    eq4(orders.eventId, eventId),
    eq4(orders.missionDeposit, 1),
    eq4(orders.paymentStatus, "approved"),
    eq4(orders.missionTopupStatus, "none")
  ));
  const orderItemsByOrder = /* @__PURE__ */ new Map();
  let totalPersonas = 0;
  for (const order of eligible) {
    const items = await db.select().from(orderItems).where(eq4(orderItems.orderId, order.id));
    const withTt = [];
    for (const item of items) {
      const [tt] = await db.select().from(ticketTypes).where(eq4(ticketTypes.id, item.ticketTypeId)).limit(1);
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
      await db.update(orders).set({ missionTopupStatus: "paid", missionTopupAmount: "0" }).where(eq4(orders.id, order.id));
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
      await db.update(orders).set({ missionTopupStatus: "paid", missionTopupAmount: "0" }).where(eq4(orders.id, order.id));
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
    }).where(eq4(orders.id, order.id));
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

// server/mailing.ts
var CHILE_TZ2 = "America/Santiago";
function formatEventDateTime(date) {
  const dateText = date.toLocaleDateString("es-CL", { weekday: "long", day: "numeric", month: "long", timeZone: CHILE_TZ2 });
  const timeText = date.toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit", timeZone: CHILE_TZ2 });
  return `${dateText}, ${timeText} hrs`;
}
async function getMailingEventInfo() {
  const event = await getFeaturedEvent();
  if (!event) return null;
  const eventDate = new Date(event.eventDate);
  let mission300 = null;
  if (isMissionWindowOpen(eventDate)) {
    const status = await getMission300Status(event.id);
    mission300 = { confirmed: status.totalPersonas, goal: status.goal, depositPrice: MISSION_300_DEPOSIT_PER_PERSON };
  }
  return {
    title: event.title,
    imageUrl: event.imageUrl ?? void 0,
    dateText: formatEventDateTime(eventDate),
    venue: event.venue ?? "Valpara\xEDso, Chile",
    address: event.address ?? void 0,
    mapsUrl: event.mapsUrl ?? void 0,
    mission300
  };
}
var MailingContentSchema = z.object({
  subject: z.string().min(4).max(90),
  preheader: z.string().max(140).optional(),
  headline: z.string().min(4).max(80),
  paragraphs: z.array(z.string().min(4).max(500)).min(1).max(4),
  ctaText: z.string().max(40).optional(),
  highlightLabel: z.string().max(60).optional(),
  highlightValue: z.string().max(60).optional()
});
var MAILING_JSON_SCHEMA = {
  name: "mailing_template",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["subject", "headline", "paragraphs"],
    properties: {
      subject: { type: "string", description: "Asunto del email, corto y directo, sin emojis excesivos." },
      preheader: { type: "string", description: "Texto de preview que se ve junto al asunto en la bandeja de entrada (una frase corta)." },
      headline: { type: "string", description: "T\xEDtulo grande dentro del email." },
      paragraphs: {
        type: "array",
        items: { type: "string" },
        minItems: 1,
        maxItems: 4,
        description: "Uno a cuatro p\xE1rrafos cortos con el cuerpo del mensaje, tono cercano y conversacional."
      },
      ctaText: { type: "string", description: "Texto del bot\xF3n de acci\xF3n, ej. 'Comprar mi entrada'." },
      highlightLabel: { type: "string", description: "Etiqueta chica de un dato destacado, ej. 'Solo por hoy'. Opcional, solo si el objetivo tiene un dato num\xE9rico o urgente que resaltar." },
      highlightValue: { type: "string", description: "El dato destacado en s\xED, ej. '41 entradas' o '$50.000 en consumos'. Opcional, va junto a highlightLabel." }
    }
  }
};
var SYSTEM_PROMPT = `Eres quien escribe los emails de marketing de Mansion Playroom / Candyland, una productora de fiestas en Valpara\xEDso/Vi\xF1a del Mar, Chile.
Tono: cercano, conversacional, en espa\xF1ol chileno, sin ser vulgar ni gritar en may\xFAsculas. Nada de lenguaje corporativo gen\xE9rico.
La marca usa una paleta pastel (rosa/celeste/amarillo/lila) y emojis con moderaci\xF3n (\u{1F36C}\u{1F389}\u2728), pero el contenido que generas es solo texto, no HTML ni estilos.
Responde \xDANICAMENTE con el JSON pedido, sin explicaciones adicionales. Usa "highlightLabel"/"highlightValue" solo si el objetivo menciona un dato concreto que valga la pena destacar en grande (un n\xFAmero de entradas, un precio, un premio); si no aplica, om\xEDtelos.`;
function extractContent(message) {
  if (typeof message.content === "string") return message.content;
  return message.content.map((part) => part.type === "text" ? part.text ?? "" : "").join("");
}
async function generateMailingTemplate(objective, audienceDescription) {
  const result = await invokeLLM({
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: `Objetivo del mail: ${objective}

A qui\xE9n se le manda: ${audienceDescription}` }
    ],
    responseFormat: { type: "json_schema", json_schema: MAILING_JSON_SCHEMA }
  });
  const raw = extractContent(result.choices[0]?.message ?? { content: "" });
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("La IA no devolvi\xF3 un JSON v\xE1lido. Intenta de nuevo con un objetivo m\xE1s claro.");
  }
  const validated = MailingContentSchema.safeParse(parsed);
  if (!validated.success) {
    throw new Error(`La plantilla generada no tiene el formato esperado: ${validated.error.issues[0]?.message ?? "error desconocido"}.`);
  }
  return validated.data;
}
var MAILING_BATCH_MAX = 50;
var sleep2 = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
var THROTTLE_MS = Number(process.env.MAILING_THROTTLE_MS) || 250;
async function sendMailingBatch(customerIds, content, ctaUrl, campaignTag, eventInfo, eventSections) {
  const recipients = await listCustomersByIds(customerIds);
  const results = [];
  const cleanCampaignTag = campaignTag?.trim();
  for (const customer of recipients) {
    const html = buildMailingBlastEmail({
      buyerName: customer.fullName ?? "",
      preheader: content.preheader,
      headline: content.headline,
      paragraphs: content.paragraphs,
      ctaText: content.ctaText,
      ctaUrl,
      highlightLabel: content.highlightLabel,
      highlightValue: content.highlightValue,
      eventInfo,
      eventSections
    });
    const sent = await sendEmail({ to: customer.email, subject: content.subject, html });
    results.push({ customerId: customer.id, email: customer.email, success: sent.success, reason: sent.reason });
    if (sent.success && cleanCampaignTag) {
      try {
        await addCustomerTag(customer.id, cleanCampaignTag);
      } catch (err) {
        console.error("[Mailing] No se pudo taguear al cliente tras el env\xEDo:", err);
      }
    }
    await sleep2(THROTTLE_MS);
  }
  return results;
}
async function createAutoMailingCampaign(input) {
  const name = input.name.trim();
  if (!name) throw new Error("Falta el nombre de la campa\xF1a.");
  return createMailingCampaign({
    name,
    audienceDescription: input.audienceDescription,
    content: input.content,
    ctaUrl: input.ctaUrl,
    eventSections: input.eventSections ?? null,
    customerIds: input.customerIds
  });
}
var CRON_TIME_BUDGET_MS = 5e4;
var CRON_MAX_PER_RUN = Number(process.env.MAILING_CRON_DAILY_CAP) || 50;
async function processMailingCronBatch() {
  const start = Date.now();
  const pending = await getPendingMailingRecipients(CRON_MAX_PER_RUN);
  let sent = 0;
  let failed = 0;
  const campaignsTouched = /* @__PURE__ */ new Set();
  let eventInfo;
  for (const recipient of pending) {
    if (Date.now() - start > CRON_TIME_BUDGET_MS) break;
    const content = recipient.content;
    const eventSections = recipient.eventSections ?? void 0;
    if (eventSections && eventInfo === void 0) {
      eventInfo = await getMailingEventInfo();
    }
    const html = buildMailingBlastEmail({
      buyerName: recipient.fullName ?? "",
      preheader: content.preheader,
      headline: content.headline,
      paragraphs: content.paragraphs,
      ctaText: content.ctaText,
      ctaUrl: recipient.ctaUrl,
      highlightLabel: content.highlightLabel,
      highlightValue: content.highlightValue,
      eventInfo: eventSections ? eventInfo : null,
      eventSections
    });
    const result = await sendEmail({ to: recipient.email, subject: content.subject, html });
    await markMailingRecipientResult(recipient.id, recipient.campaignId, result.success, result.reason);
    campaignsTouched.add(recipient.campaignId);
    if (result.success) {
      sent++;
      try {
        await addCustomerTag(recipient.customerId, recipient.campaignName);
      } catch (err) {
        console.error("[Mailing] No se pudo taguear al cliente tras el env\xEDo autom\xE1tico:", err);
      }
    } else {
      failed++;
    }
    await sleep2(THROTTLE_MS);
  }
  return { processed: sent + failed, sent, failed, campaignsTouched: campaignsTouched.size };
}

// server/cronRoutes.ts
var CHECKIN_SUMMARY_EMAIL = "contacto@mansionplayroom.cl";
function requireCronSecret(req, res) {
  if (!ENV.cronSecret) {
    console.warn("[Cron] CRON_SECRET no configurada -- el endpoint del cron queda sin autenticar.");
    return true;
  }
  const auth = req.headers.authorization;
  if (auth !== `Bearer ${ENV.cronSecret}`) {
    res.status(401).json({ error: "Unauthorized" });
    return false;
  }
  return true;
}
function registerCronRoutes(app) {
  app.get("/api/cron/mailing-queue", async (req, res) => {
    if (!requireCronSecret(req, res)) return;
    try {
      const result = await processMailingCronBatch();
      let partyMessagesPurgedFor = 0;
      let partyProfilesPurged = 0;
      let giftInvitationsExpired = 0;
      try {
        const purge = await purgeOldPartyMessages();
        partyMessagesPurgedFor = purge.deletedFor;
        const profiles = await purgeOldPartyProfiles();
        partyProfilesPurged = profiles.profilesDeleted;
        const expired = await expireOldGiftInvitations();
        giftInvitationsExpired = expired.expired;
      } catch (err) {
        console.error("[Cron] Error limpiando datos de fiestas terminadas:", err);
      }
      let ambassadorWeekly = null;
      try {
        const config = await getProgramConfig();
        if (config.weeklyEmailEnabled && isWeeklyEmailDay(/* @__PURE__ */ new Date(), config.weeklyEmailWeekday)) {
          ambassadorWeekly = await sendWeeklyAmbassadorEmails();
        }
      } catch (err) {
        console.error("[Cron] Error mandando el correo semanal de embajadores:", err);
      }
      res.json({ success: true, ...result, partyMessagesPurgedFor, partyProfilesPurged, giftInvitationsExpired, ambassadorWeekly });
    } catch (err) {
      console.error("[Cron] Error procesando la cola de mailing:", err);
      res.status(500).json({ success: false, error: err instanceof Error ? err.message : "Error desconocido" });
    }
  });
  app.get("/api/cron/checkin-summary", async (req, res) => {
    if (!requireCronSecret(req, res)) return;
    try {
      const event = await getEventHappeningToday();
      if (!event) {
        res.json({ success: true, sent: false, reason: "no hay evento hoy" });
        return;
      }
      const dashboard = await getCajaDashboard(event.id);
      if (!dashboard) {
        res.json({ success: true, sent: false, reason: "sin datos de caja para el evento" });
        return;
      }
      await sendEmail({
        to: CHECKIN_SUMMARY_EMAIL,
        subject: `[Candyland] Ingresos del d\xEDa \u2014 ${event.title}`,
        html: buildCheckinSummaryEmail({
          eventTitle: event.title,
          eventDate: event.eventDate,
          insideCount: dashboard.insideCount,
          expectedCount: dashboard.expectedCount
        })
      });
      res.json({ success: true, sent: true, insideCount: dashboard.insideCount, expectedCount: dashboard.expectedCount });
    } catch (err) {
      console.error("[Cron] Error mandando el resumen de ingresos:", err);
      res.status(500).json({ success: false, error: err instanceof Error ? err.message : "Error desconocido" });
    }
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
import { z as z2 } from "zod";

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
var doorProcedure = t.procedure.use(
  t.middleware(async (opts) => {
    const { ctx, next } = opts;
    if (!ctx.operator) {
      throw new TRPCError2({ code: "UNAUTHORIZED", message: "Sesi\xF3n de puerta requerida" });
    }
    const role = ctx.operator.role;
    if (role !== "acceso" && role !== "supervisor" && role !== "admin") {
      throw new TRPCError2({ code: "FORBIDDEN", message: "Tu usuario no tiene acceso a la puerta" });
    }
    return next({ ctx: { ...ctx, operator: ctx.operator } });
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
    z2.object({
      timestamp: z2.number().min(0, "timestamp cannot be negative")
    })
  ).query(() => ({
    ok: true
  })),
  notifyOwner: adminProcedure.input(
    z2.object({
      title: z2.string().min(1, "title is required"),
      content: z2.string().min(1, "content is required")
    })
  ).mutation(async ({ input }) => {
    const delivered = await notifyOwner(input);
    return {
      success: delivered
    };
  })
});

// server/routers.ts
import { z as z3 } from "zod";
import { TRPCError as TRPCError3 } from "@trpc/server";

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
import { eq as eq5 } from "drizzle-orm";
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
      const [ticket] = await db.select().from(tickets).where(eq5(tickets.displayCode, code)).limit(1);
      if (!ticket) return { result: "rejected", conflictNote: "El c\xF3digo no existe" };
      const [gift] = await db.select().from(partyGifts).where(eq5(partyGifts.ticketId, ticket.id)).limit(1);
      if (!gift && ticket.eventId !== params.eventId) {
        return { result: "rejected", conflictNote: "El c\xF3digo no corresponde a este evento" };
      }
      if (ticket.status === "cancelled") return { result: "rejected", conflictNote: "El c\xF3digo fue anulado" };
      if (ticket.status === "used") {
        return { result: "conflict", conflictNote: `Ya fue canjeado el ${ticket.usedAt?.toISOString?.() ?? ticket.usedAt}` };
      }
      await db.update(tickets).set({
        status: "used",
        usedAt: /* @__PURE__ */ new Date(),
        usedByOperatorId: params.operatorId,
        usedAtRegisterId: params.registerId ?? null
      }).where(eq5(tickets.id, ticket.id));
      if (gift) {
        await db.update(partyGifts).set({ status: "redeemed", redeemedAt: /* @__PURE__ */ new Date() }).where(eq5(partyGifts.id, gift.id));
      }
      return { result: "applied" };
    }
  );
  return { result, conflictNote };
}

// server/caja/checkin.ts
init_schema();
init_ops();
import { eq as eq6 } from "drizzle-orm";
async function checkInTicket(db, params) {
  const code = params.ticketCode.trim().toUpperCase();
  const { result, conflictNote } = await applyOp(
    db,
    {
      id: params.opId,
      type: "checkin",
      eventId: params.eventId,
      operatorId: params.operatorId,
      registerId: params.registerId,
      targetType: "ticket",
      targetId: code,
      payload: { ticketCode: code },
      clientAt: params.clientAt
    },
    async () => {
      const [ticket] = await db.select().from(tickets).where(eq6(tickets.ticketCode, code)).limit(1);
      if (!ticket) return { result: "rejected", conflictNote: "El c\xF3digo no existe" };
      if (ticket.eventId !== params.eventId) return { result: "rejected", conflictNote: "El c\xF3digo no corresponde a este evento" };
      if (ticket.status === "cancelled") return { result: "rejected", conflictNote: "El acceso fue anulado" };
      if (ticket.status === "used") {
        return { result: "conflict", conflictNote: `Esta persona ya entr\xF3 el ${ticket.usedAt?.toISOString?.() ?? ticket.usedAt}` };
      }
      const [tt] = await db.select().from(ticketTypes).where(eq6(ticketTypes.id, ticket.ticketTypeId)).limit(1);
      if (tt?.category !== "acceso") {
        return { result: "rejected", conflictNote: "Ese c\xF3digo es de un extra, no de un acceso" };
      }
      await db.update(tickets).set({
        status: "used",
        usedAt: /* @__PURE__ */ new Date(),
        usedByOperatorId: params.operatorId,
        usedAtRegisterId: params.registerId ?? null
      }).where(eq6(tickets.id, ticket.id));
      return { result: "applied" };
    }
  );
  return { result, conflictNote };
}

// server/ambassadorApplications.ts
import { and as and4, desc as desc3, eq as eq7 } from "drizzle-orm";
init_schema();
async function createApplication(data) {
  const db = await getDb();
  if (!db) return { ok: false, reason: "sin_base" };
  const email = data.email.trim().toLowerCase();
  const [pendiente] = await db.select({ id: ambassadorApplications.id }).from(ambassadorApplications).where(and4(
    eq7(ambassadorApplications.email, email),
    eq7(ambassadorApplications.status, "pendiente")
  )).limit(1);
  if (pendiente) return { ok: false, reason: "ya_pendiente" };
  const inserted = await db.insert(ambassadorApplications).values({
    name: data.name,
    email,
    whatsapp: data.whatsapp,
    instagram: data.instagram,
    followers: data.followers,
    message: data.message || null,
    acceptedTerms: data.acceptedTerms ? 1 : 0
  });
  const id = inserted.insertId;
  console.log(`[Postulaciones] Nueva postulaci\xF3n de ${data.name} (@${data.instagram}, ${email})`);
  return { ok: true, id };
}
async function listApplications(status) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(ambassadorApplications).where(status ? eq7(ambassadorApplications.status, status) : void 0).orderBy(desc3(ambassadorApplications.createdAt));
}
async function getApplication(id) {
  const db = await getDb();
  if (!db) return null;
  const [row] = await db.select().from(ambassadorApplications).where(eq7(ambassadorApplications.id, id)).limit(1);
  return row ?? null;
}
async function reviewApplication(params) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(ambassadorApplications).set({
    status: params.status,
    reviewNote: params.note ?? null,
    reviewedAt: /* @__PURE__ */ new Date()
  }).where(eq7(ambassadorApplications.id, params.id));
  return { success: true };
}
async function approveApplication(params) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const application = await getApplication(params.id);
  if (!application) throw new Error("No encontramos esa postulaci\xF3n");
  if (application.status === "aprobada" && application.createdAmbassadorId) {
    throw new Error("Esa postulaci\xF3n ya fue aprobada");
  }
  await createExclusiveAmbassador({
    name: application.name,
    code: params.code,
    commissionPercent: params.commissionPercent ?? null,
    contact: application.whatsapp,
    email: application.email,
    instagram: application.instagram
  });
  const [created] = await db.select({ id: exclusiveAmbassadors.id }).from(exclusiveAmbassadors).where(eq7(exclusiveAmbassadors.code, params.code.trim().toUpperCase())).limit(1);
  await db.update(ambassadorApplications).set({
    status: "aprobada",
    reviewedAt: /* @__PURE__ */ new Date(),
    createdAmbassadorId: created?.id ?? null
  }).where(eq7(ambassadorApplications.id, params.id));
  console.log(`[Postulaciones] ${application.name} aprobado como embajador con el c\xF3digo ${params.code.trim().toUpperCase()}`);
  return {
    success: true,
    ambassadorId: created?.id ?? null,
    code: params.code.trim().toUpperCase(),
    name: application.name,
    email: application.email
  };
}
async function countPendingApplications() {
  const db = await getDb();
  if (!db) return 0;
  const rows = await db.select({ id: ambassadorApplications.id }).from(ambassadorApplications).where(eq7(ambassadorApplications.status, "pendiente"));
  return rows.length;
}

// shared/ambassadorApplication.ts
var MIN_INSTAGRAM_FOLLOWERS = 1e3;
var MIN_APPLICANT_NAME_LENGTH = 3;
var MAX_APPLICANT_NAME_LENGTH = 80;
var MAX_APPLICATION_MESSAGE_LENGTH = 500;
var AMBASSADOR_REQUIREMENTS = [
  "Ser mayor de 18 a\xF1os",
  `Tener al menos ${MIN_INSTAGRAM_FOLLOWERS.toLocaleString("es-CL")} seguidores en Instagram`,
  "Cuenta de Instagram p\xFAblica y activa"
];
var AMBASSADOR_TASKS = [
  "Publicar historias cada semana con el material que te enviamos",
  "Una publicaci\xF3n en el feed por cada evento",
  "Difundir tu c\xF3digo personal con tu c\xEDrculo"
];
function sanitizeInstagram(raw) {
  let value = (raw ?? "").trim();
  if (!value) return { ok: false, reason: "Escribe tu Instagram" };
  const urlMatch = value.match(/(?:instagram\.com|instagr\.am)\/+([^/?#\s]+)/i);
  if (urlMatch) value = urlMatch[1];
  value = value.replace(/^@+/, "").replace(/\/+$/, "").trim();
  if (!value) return { ok: false, reason: "Escribe tu Instagram" };
  if (value.length > 30) return { ok: false, reason: "Ese usuario de Instagram es demasiado largo" };
  if (!/^[A-Za-z0-9._]+$/.test(value)) {
    return { ok: false, reason: "El usuario de Instagram solo puede tener letras, n\xFAmeros, puntos y guion bajo" };
  }
  return { ok: true, value };
}
function sanitizeWhatsapp(raw) {
  const digits = (raw ?? "").replace(/\D/g, "");
  if (!digits) return { ok: false, reason: "Escribe tu WhatsApp" };
  let local = digits;
  if (local.startsWith("56")) local = local.slice(2);
  if (local.startsWith("0")) local = local.replace(/^0+/, "");
  if (local.length !== 9) {
    return { ok: false, reason: "Revisa el n\xFAmero: un m\xF3vil chileno tiene 9 d\xEDgitos y empieza con 9" };
  }
  if (!local.startsWith("9")) {
    return { ok: false, reason: "Tiene que ser un celular, que empieza con 9" };
  }
  return { ok: true, value: `+56${local}` };
}
function sanitizeApplicantName(raw) {
  const value = (raw ?? "").replace(/\s+/g, " ").trim();
  if (value.length < MIN_APPLICANT_NAME_LENGTH) return { ok: false, reason: "Escribe tu nombre completo" };
  if (value.length > MAX_APPLICANT_NAME_LENGTH) {
    return { ok: false, reason: `M\xE1ximo ${MAX_APPLICANT_NAME_LENGTH} caracteres` };
  }
  return { ok: true, value };
}
function sanitizeApplicationMessage(raw) {
  const value = (raw ?? "").replace(/\s+/g, " ").trim();
  if (value.length > MAX_APPLICATION_MESSAGE_LENGTH) {
    return { ok: false, reason: `M\xE1ximo ${MAX_APPLICATION_MESSAGE_LENGTH} caracteres` };
  }
  return { ok: true, value };
}
function sanitizeFollowers(raw) {
  if (raw === null || raw === void 0 || raw === "") return { ok: true, value: null };
  const digits = String(raw).replace(/\D/g, "");
  if (!digits) return { ok: false, reason: "Escribe solo n\xFAmeros" };
  const n = Number(digits);
  if (!Number.isFinite(n)) return { ok: false, reason: "Escribe solo n\xFAmeros" };
  if (n > 1e8) return { ok: false, reason: "Ese n\xFAmero no parece real" };
  return { ok: true, value: n };
}
function whatsappLinkFor(normalized) {
  return `https://wa.me/${normalized.replace(/\D/g, "")}`;
}
function instagramLinkFor(handle) {
  return `https://instagram.com/${handle}`;
}

// server/caja/sale.ts
init_schema();
init_ops();
import { eq as eq8, sql as sql4, inArray as inArray4 } from "drizzle-orm";
async function createCajaSale(db, params) {
  if (params.items.length === 0) throw new Error("La venta necesita al menos un producto");
  const ticketTypeIds = params.items.map((i) => i.ticketTypeId);
  const tts = await db.select().from(ticketTypes).where(inArray4(ticketTypes.id, ticketTypeIds));
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
      payload: { items: lineItems, paymentMethod: params.paymentMethod, total, buyerEmail: params.buyerEmail ?? null, redeemRequested: params.redeemPlaycoins ?? 0 },
      clientAt: params.clientAt
    },
    async () => {
      let redeemedAmount = 0;
      let redeemConflictNote;
      if (params.redeemPlaycoins && params.redeemPlaycoins > 0 && params.buyerEmail) {
        const redemption = await redeemPlaycoinsAuthoritative({
          email: params.buyerEmail,
          requestedAmount: params.redeemPlaycoins,
          opId: params.opId
        });
        if (redemption.ok) redeemedAmount = redemption.redeemed;
        else redeemConflictNote = redemption.conflictNote;
      }
      const finalTotal = total - redeemedAmount;
      const orderNumber = `CAJA-${Date.now().toString(36).toUpperCase()}`;
      const [orderResult] = await db.insert(orders).values({
        orderNumber,
        buyerName: "Venta en caja",
        buyerEmail: params.buyerEmail?.trim().toLowerCase() || "caja@mansionplayroom.cl",
        eventId: params.eventId,
        subtotal: String(total),
        discount: String(redeemedAmount),
        total: String(finalTotal),
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
        await db.update(ticketTypes).set({ soldCount: sql4`soldCount + ${item.quantity}` }).where(eq8(ticketTypes.id, item.ticketTypeId));
      }
      if (params.buyerEmail) {
        await awardPlaycoins({ email: params.buyerEmail, totalClp: finalTotal, reason: "earn_caja", opId: params.opId });
      }
      return { result: "applied", conflictNote: redeemConflictNote };
    }
  );
  return { result, conflictNote };
}

// server/caja/void.ts
init_schema();
init_ops();
import { eq as eq9 } from "drizzle-orm";
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
      const [ticket] = await db.select().from(tickets).where(eq9(tickets.displayCode, code)).limit(1);
      if (!ticket) return { result: "rejected", conflictNote: "El c\xF3digo no existe" };
      if (ticket.eventId !== params.eventId) return { result: "rejected", conflictNote: "El c\xF3digo no corresponde a este evento" };
      if (ticket.status === "cancelled") return { result: "rejected", conflictNote: "El c\xF3digo ya estaba anulado" };
      await db.update(tickets).set({ status: "cancelled" }).where(eq9(tickets.id, ticket.id));
      return { result: "applied" };
    }
  );
  return { result, conflictNote };
}

// server/routers.ts
import QRCode2 from "qrcode";

// server/adminSecurity.ts
import crypto from "crypto";
import { generateSecret, generateSync, verifySync, generateURI } from "otplib";
var TOTP_TOLERANCE_SECONDS = 30;
var BACKUP_CODE_COUNT = 8;
var BACKUP_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function safeCompare(a, b) {
  const ha = crypto.createHash("sha256").update(a ?? "").digest();
  const hb = crypto.createHash("sha256").update(b ?? "").digest();
  return crypto.timingSafeEqual(ha, hb);
}
function createTotpSecret() {
  return generateSecret();
}
function totpUri(secret, label = "admin") {
  return generateURI({ secret, issuer: "Candyland", label });
}
function verifyTotp(params) {
  const token = (params.token ?? "").replace(/\s/g, "");
  if (!/^\d{6}$/.test(token)) return { ok: false, reason: "invalido" };
  const epoch = Math.floor((params.now?.getTime() ?? Date.now()) / 1e3);
  const res = verifySync({
    secret: params.secret,
    token,
    epoch,
    epochTolerance: TOTP_TOLERANCE_SECONDS,
    ...params.lastUsedStep != null ? { afterTimeStep: params.lastUsedStep } : {}
  });
  if (!res.valid) {
    if (params.lastUsedStep != null) {
      const sinReplay = verifySync({ secret: params.secret, token, epoch, epochTolerance: TOTP_TOLERANCE_SECONDS });
      if (sinReplay.valid) return { ok: false, reason: "reusado" };
    }
    return { ok: false, reason: "invalido" };
  }
  const timeStep = res.timeStep;
  if (typeof timeStep !== "number") return { ok: false, reason: "invalido" };
  return { ok: true, timeStep };
}
function hashBackupCode(code) {
  return crypto.createHash("sha256").update(normalizeBackupCode(code)).digest("hex");
}
function normalizeBackupCode(code) {
  return (code ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}
function generateBackupCodes(count = BACKUP_CODE_COUNT) {
  const plain = [];
  for (let i = 0; i < count; i++) {
    const chars = [];
    const bytes = crypto.randomBytes(8);
    for (let j = 0; j < 8; j++) chars.push(BACKUP_ALPHABET[bytes[j] % BACKUP_ALPHABET.length]);
    plain.push(`${chars.slice(0, 4).join("")}-${chars.slice(4).join("")}`);
  }
  return { plain, hashed: plain.map(hashBackupCode) };
}
function consumeBackupCode(hashed, code) {
  const target = hashBackupCode(code);
  const idx = hashed.findIndex((h) => safeCompare(h, target));
  if (idx === -1) return { ok: false, remaining: hashed };
  return { ok: true, remaining: hashed.filter((_, i) => i !== idx) };
}
function parseBackupCodes(raw) {
  if (Array.isArray(raw)) return raw.filter((x) => typeof x === "string");
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.filter((x) => typeof x === "string") : [];
    } catch {
      return [];
    }
  }
  return [];
}

// server/routers.ts
async function requirePartyActor(ticketCode) {
  const actor = await getPartyActor(ticketCode);
  const denial = partyEntryDenial(actor?.ticket, actor?.event, /* @__PURE__ */ new Date());
  if (denial || !actor) {
    const message = denial === "no_ingreso" ? "Tu entrada todav\xEDa no fue escaneada en la puerta" : denial === "fuera_de_horario" ? "La fiesta no est\xE1 abierta en este momento" : "No encontramos tu entrada";
    throw new TRPCError3({ code: "FORBIDDEN", message });
  }
  return actor;
}
async function requirePartyProfile(ticketCode) {
  const actor = await requirePartyActor(ticketCode);
  if (!actor.profile) throw new TRPCError3({ code: "FORBIDDEN", message: "Todav\xEDa no creaste tu perfil" });
  return { ...actor, profile: actor.profile };
}
var SHIFT_CLOSE_REPORT_EMAIL = "contacto@mansionplayroom.cl";
var APPLICATIONS_EMAIL = "contacto@mansionplayroom.cl";
var APPLICATION_MAX_PER_HOUR = 5;
var adminProcedure2 = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== "admin") throw new TRPCError3({ code: "FORBIDDEN", message: "Admin access required" });
  return next({ ctx });
});
var mailingEventSectionsSchema = z3.object({
  banner: z3.boolean(),
  details: z3.boolean(),
  mission300: z3.boolean(),
  venueGrid: z3.boolean()
});
async function verifyOperatorPinOrThrow(ctx, operatorId, pin) {
  const forwardedFor = ctx.req.headers["x-forwarded-for"];
  const clientIp2 = (typeof forwardedFor === "string" ? forwardedFor.split(",")[0].trim() : forwardedFor?.[0]) || ctx.req.socket.remoteAddress || "unknown";
  const ipKey = `pin-login:${clientIp2}`;
  if (!await checkIpRateLimit(ipKey)) {
    throw new TRPCError3({ code: "TOO_MANY_REQUESTS", message: "Demasiados intentos desde este dispositivo. Intenta de nuevo m\xE1s tarde." });
  }
  const operator = await getOperatorById(operatorId);
  if (!operator || !operator.active) {
    await recordIpFailedAttempt(ipKey);
    throw new TRPCError3({ code: "UNAUTHORIZED", message: "PIN incorrecto" });
  }
  if (operator.lockedUntil && new Date(operator.lockedUntil).getTime() > Date.now()) {
    const minutesLeft = Math.ceil((new Date(operator.lockedUntil).getTime() - Date.now()) / 6e4);
    throw new TRPCError3({ code: "TOO_MANY_REQUESTS", message: `Demasiados intentos. Intenta de nuevo en ${minutesLeft} min.` });
  }
  if (!verifyPin(pin, operator.pinHash)) {
    await recordFailedPinAttempt(operator.id);
    await recordIpFailedAttempt(ipKey);
    throw new TRPCError3({ code: "UNAUTHORIZED", message: "PIN incorrecto" });
  }
  await resetPinAttempts(operator.id);
  return operator;
}
async function verifyDoorPinOrThrow(ctx, operatorId, pin) {
  const operator = await verifyOperatorPinOrThrow(ctx, operatorId, pin);
  if (operator.role !== "acceso" && operator.role !== "supervisor" && operator.role !== "admin") {
    throw new TRPCError3({ code: "FORBIDDEN", message: "Tu usuario no trabaja en la puerta" });
  }
  return operator;
}
function adminIpKey(ctx) {
  const forwardedFor = ctx.req.headers["x-forwarded-for"];
  const ip = (typeof forwardedFor === "string" ? forwardedFor.split(",")[0].trim() : forwardedFor?.[0]) || ctx.req.socket.remoteAddress || "unknown";
  return `admin-login:${ip}`;
}
function clientIp(ctx) {
  const forwardedFor = ctx.req.headers["x-forwarded-for"];
  return (typeof forwardedFor === "string" ? forwardedFor.split(",")[0].trim() : forwardedFor?.[0]) || ctx.req.socket.remoteAddress || "unknown";
}
async function signAdminStepTicket() {
  return sdk.signSession({ openId: `${ADMIN_LOCAL_OPEN_ID}:step1`, appId: "candyland-admin-2fa", name: "step1" }, { expiresInMs: 5 * 60 * 1e3 });
}
async function requireAdminStepTicket(ticket) {
  try {
    const payload = await sdk.verifySession(ticket);
    if (payload?.openId !== `${ADMIN_LOCAL_OPEN_ID}:step1`) throw new Error("bad ticket");
  } catch {
    throw new TRPCError3({ code: "UNAUTHORIZED", message: "Vuelve a ingresar tu contrase\xF1a" });
  }
}
var ADMIN_SESSION_MS = 7 * 24 * 60 * 60 * 1e3;
async function issueAdminSession(ctx) {
  await upsertUser({ openId: ADMIN_LOCAL_OPEN_ID, name: "Admin", role: "admin", lastSignedIn: /* @__PURE__ */ new Date() });
  const sessionToken = await sdk.signSession({ openId: ADMIN_LOCAL_OPEN_ID, appId: "candyland-admin", name: "Admin" }, { expiresInMs: ADMIN_SESSION_MS });
  const cookieOptions = getSessionCookieOptions(ctx.req);
  ctx.res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ADMIN_SESSION_MS });
}
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
    // Paso 1 de 2: la contraseña NO entrega sesión por sí sola. Antes
    // este endpoint firmaba la cookie de una, sin ningún límite de
    // intentos -- un script podía probar miles de contraseñas por minuto
    // contra el panel que puede borrar compras y exportar la base entera.
    adminLogin: publicProcedure.input(z3.object({ password: z3.string() })).mutation(async ({ input, ctx }) => {
      const ipKey = adminIpKey(ctx);
      if (!await checkIpRateLimit(ipKey)) {
        throw new TRPCError3({ code: "TOO_MANY_REQUESTS", message: "Demasiados intentos. Espera unos minutos." });
      }
      const adminPassword = process.env.ADMIN_PASSWORD;
      if (!adminPassword || !safeCompare(input.password, adminPassword)) {
        await recordIpFailedAttempt(ipKey);
        throw new TRPCError3({ code: "UNAUTHORIZED", message: "Contrase\xF1a incorrecta" });
      }
      await resetIpRateLimit(ipKey);
      if (process.env.ADMIN_2FA_DISABLED === "1") {
        await issueAdminSession(ctx);
        return { ticket: "", needsSetup: false, skipped2fa: true };
      }
      const ticket = await signAdminStepTicket();
      const totp = await getAdminTotp();
      return { ticket, needsSetup: !totp?.confirmedAt };
    }),
    // Genera el secreto y el QR para configurar la app de autenticación.
    // No activa nada todavía: recién se activa cuando el dueño confirma
    // con un código real (adminConfirmTotp).
    adminSetupTotp: publicProcedure.input(z3.object({ ticket: z3.string() })).mutation(async ({ input }) => {
      await requireAdminStepTicket(input.ticket);
      const existing = await getAdminTotp();
      if (existing?.confirmedAt) {
        throw new TRPCError3({ code: "FORBIDDEN", message: "El segundo factor ya est\xE1 configurado" });
      }
      const secret = await getOrCreateUnconfirmedAdminTotp(createTotpSecret());
      const qrImageUrl = await QRCode2.toDataURL(totpUri(secret), { width: 320, margin: 2 });
      return { secret, qrImageUrl };
    }),
    // Confirma la configuración y devuelve los códigos de respaldo. Es la
    // ÚNICA vez que se muestran legibles: después solo queda su hash.
    adminConfirmTotp: publicProcedure.input(z3.object({ ticket: z3.string(), code: z3.string() })).mutation(async ({ input, ctx }) => {
      await requireAdminStepTicket(input.ticket);
      const totp = await getAdminTotp();
      if (!totp) throw new TRPCError3({ code: "BAD_REQUEST", message: "Primero escanea el c\xF3digo QR" });
      if (totp.confirmedAt) throw new TRPCError3({ code: "FORBIDDEN", message: "Ya est\xE1 configurado" });
      const res = verifyTotp({ secret: totp.secret, token: input.code });
      if (!res.ok) {
        await recordIpFailedAttempt(adminIpKey(ctx));
        throw new TRPCError3({ code: "UNAUTHORIZED", message: "Ese c\xF3digo no coincide. Revisa que el reloj de tu tel\xE9fono est\xE9 en hora." });
      }
      const { plain, hashed } = generateBackupCodes();
      await confirmAdminTotp(totp.id, hashed, res.timeStep);
      await issueAdminSession(ctx);
      return { backupCodes: plain };
    }),
    // Paso 2 de 2: el código de la app (o uno de respaldo). Recién acá se
    // firma la sesión.
    adminVerifyCode: publicProcedure.input(z3.object({ ticket: z3.string(), code: z3.string() })).mutation(async ({ input, ctx }) => {
      const ipKey = adminIpKey(ctx);
      if (!await checkIpRateLimit(ipKey)) {
        throw new TRPCError3({ code: "TOO_MANY_REQUESTS", message: "Demasiados intentos. Espera unos minutos." });
      }
      await requireAdminStepTicket(input.ticket);
      const totp = await getAdminTotp();
      if (!totp?.confirmedAt) throw new TRPCError3({ code: "BAD_REQUEST", message: "El segundo factor no est\xE1 configurado" });
      const res = verifyTotp({ secret: totp.secret, token: input.code, lastUsedStep: totp.lastUsedStep });
      if (res.ok) {
        await recordAdminTotpStep(totp.id, res.timeStep);
        await resetIpRateLimit(ipKey);
        await issueAdminSession(ctx);
        return { success: true };
      }
      const backup = consumeBackupCode(parseBackupCodes(totp.backupCodes), input.code);
      if (backup.ok) {
        await consumeAdminBackupCodes(totp.id, backup.remaining);
        await resetIpRateLimit(ipKey);
        await issueAdminSession(ctx);
        return { success: true, backupCodeUsed: true, backupCodesLeft: backup.remaining.length };
      }
      await recordIpFailedAttempt(ipKey);
      throw new TRPCError3({
        code: "UNAUTHORIZED",
        message: res.reason === "reusado" ? "Ese c\xF3digo ya se us\xF3. Espera al siguiente." : "C\xF3digo incorrecto"
      });
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
    getBySlug: publicProcedure.input(z3.object({ slug: z3.string() })).query(async ({ input }) => {
      return getEventBySlug(input.slug);
    }),
    getTicketTypes: publicProcedure.input(z3.object({ slug: z3.string() })).query(async ({ input }) => {
      const event = await getEventBySlug(input.slug);
      if (!event) return [];
      return getTicketTypesByEventId(event.id);
    }),
    // Admin
    listAll: adminProcedure2.query(async () => {
      return getAllEvents();
    }),
    create: adminProcedure2.input(z3.object({
      title: z3.string(),
      slug: z3.string(),
      description: z3.string().optional(),
      shortDescription: z3.string().optional(),
      imageUrl: z3.string().optional(),
      venue: z3.string().optional(),
      address: z3.string().optional(),
      mapsUrl: z3.string().optional(),
      eventDate: z3.string(),
      doorsOpen: z3.string().optional(),
      status: z3.enum(["draft", "published", "soldout", "cancelled", "past"]).optional(),
      featured: z3.number().optional()
    })).mutation(async ({ input }) => {
      return createEvent(input);
    }),
    update: adminProcedure2.input(z3.object({
      id: z3.number(),
      title: z3.string().optional(),
      slug: z3.string().optional(),
      description: z3.string().optional(),
      shortDescription: z3.string().optional(),
      imageUrl: z3.string().optional(),
      venue: z3.string().optional(),
      address: z3.string().optional(),
      mapsUrl: z3.string().optional(),
      eventDate: z3.string().optional(),
      doorsOpen: z3.string().optional(),
      status: z3.enum(["draft", "published", "soldout", "cancelled", "past"]).optional(),
      featured: z3.number().optional()
    })).mutation(async ({ input }) => {
      const { id, ...data } = input;
      return updateEvent(id, data);
    }),
    delete: adminProcedure2.input(z3.object({ id: z3.number() })).mutation(async ({ input }) => {
      return deleteEvent(input.id);
    }),
    // Ticket types management
    listTicketTypes: adminProcedure2.input(z3.object({ eventId: z3.number() })).query(async ({ input }) => {
      return getTicketTypesByEventId(input.eventId);
    }),
    createTicketType: adminProcedure2.input(z3.object({
      eventId: z3.number(),
      name: z3.string(),
      accesoSlug: z3.enum(["duo", "duo_mujeres", "soltera", "soltero", "trio", "grupo", "cumpleaneros"]).optional(),
      category: z3.enum(["acceso", "extra"]).optional(),
      description: z3.string().optional(),
      price: z3.number(),
      originalPrice: z3.number().optional(),
      totalStock: z3.number(),
      maxPerOrder: z3.number().optional(),
      sortOrder: z3.number().optional(),
      status: z3.enum(["active", "soldout", "hidden"]).optional(),
      costPrice: z3.number().optional(),
      color: z3.string().optional(),
      internalCode: z3.string().optional()
    })).mutation(async ({ input }) => {
      return createTicketType(input);
    }),
    updateTicketType: adminProcedure2.input(z3.object({
      id: z3.number(),
      name: z3.string().optional(),
      accesoSlug: z3.enum(["duo", "duo_mujeres", "soltera", "soltero", "trio", "grupo", "cumpleaneros"]).optional(),
      category: z3.enum(["acceso", "extra"]).optional(),
      description: z3.string().optional(),
      price: z3.number().optional(),
      originalPrice: z3.number().optional(),
      totalStock: z3.number().optional(),
      maxPerOrder: z3.number().optional(),
      sortOrder: z3.number().optional(),
      status: z3.enum(["active", "soldout", "hidden"]).optional(),
      costPrice: z3.number().optional(),
      color: z3.string().optional(),
      internalCode: z3.string().optional()
    })).mutation(async ({ input }) => {
      const { id, ...data } = input;
      return updateTicketType(id, data);
    }),
    deleteTicketType: adminProcedure2.input(z3.object({ id: z3.number() })).mutation(async ({ input }) => {
      return deleteTicketType(input.id);
    })
  }),
  orders: router({
    validateDiscount: publicProcedure.input(z3.object({
      code: z3.string(),
      eventId: z3.number()
    })).mutation(async ({ input }) => {
      return validateDiscountCode(input.code, input.eventId);
    }),
    create: publicProcedure.input(z3.object({
      eventSlug: z3.string(),
      buyerName: z3.string(),
      buyerEmail: z3.string().email(),
      buyerPhone: z3.string().optional(),
      items: z3.array(z3.object({
        ticketTypeId: z3.number(),
        quantity: z3.number().min(1)
      })),
      discountCode: z3.string().optional(),
      ambassadorCode: z3.string().optional(),
      communityCode: z3.string().optional(),
      // Datos por asistente/tipo de acceso (JSON serializado). Se adjunta a la
      // preferencia de Mercado Pago como metadata; no requiere migración de schema.
      attendeeData: z3.string().optional()
    })).mutation(async ({ input }) => {
      const result = await createOrder(input);
      if (result.isFree) await confirmFreeOrder(result.orderNumber);
      return result;
    }),
    // Cobra una orden ya creada con el Payment Brick (tarjeta embebida, sin
    // modal/redirect de Mercado Pago). El monto se calcula server-side a
    // partir de la orden guardada, nunca del cliente.
    processCardPayment: publicProcedure.input(z3.object({
      orderNumber: z3.string(),
      token: z3.string(),
      paymentMethodId: z3.string(),
      issuerId: z3.union([z3.string(), z3.number()]).optional(),
      installments: z3.number().optional(),
      identificationType: z3.string().optional(),
      identificationNumber: z3.string().optional()
    })).mutation(async ({ input }) => {
      return processCardPaymentForOrder(input);
    }),
    // Admin
    listAll: adminProcedure2.input(z3.object({
      page: z3.number().optional(),
      limit: z3.number().optional(),
      status: z3.string().optional(),
      channel: z3.enum(["web", "caja"]).optional()
    }).optional()).query(async ({ input }) => {
      return getAllOrders(input?.page ?? 1, input?.limit ?? 50, input?.status, input?.channel);
    }),
    getStats: adminProcedure2.input(z3.object({ channel: z3.enum(["web", "caja"]).optional() }).optional()).query(async ({ input }) => {
      return getOrderStats(input?.channel);
    }),
    // Mismos filtros y mismas columnas que el CSV (server/adminRoutes.ts) --
    // alimenta la vista de impresión/PDF, para que ambos formatos muestren
    // exactamente lo mismo.
    forPrint: adminProcedure2.input(z3.object({
      eventId: z3.number().optional(),
      dateFrom: z3.string().optional(),
      dateTo: z3.string().optional(),
      status: z3.string().optional(),
      channel: z3.enum(["web", "caja"]).optional()
    }).optional()).query(async ({ input }) => {
      return getOrdersForExport(input ?? {});
    }),
    getTickets: adminProcedure2.input(z3.object({ orderId: z3.number() })).query(async ({ input }) => {
      return getOrderTickets(input.orderId);
    }),
    resendConfirmation: adminProcedure2.input(z3.object({ orderNumber: z3.string() })).mutation(async ({ input }) => {
      return resendConfirmationEmail(input.orderNumber);
    }),
    // Accesos manuales desde /admin (pedido explícito del usuario):
    // invitaciones gratis o accesos ya pagados por transferencia/efectivo
    // directo, sin pasar por Mercado Pago -- misma info del comprador que el
    // checkout público, y el mismo mail final con QR (confirmFreeOrder ya lo
    // usa el checkout público para el caso de descuento 100%).
    createManual: adminProcedure2.input(z3.object({
      eventSlug: z3.string(),
      buyerName: z3.string().min(1),
      buyerEmail: z3.string().email(),
      buyerPhone: z3.string().optional(),
      items: z3.array(z3.object({
        ticketTypeId: z3.number(),
        quantity: z3.number().min(1),
        // Monto que el admin escribió a mano para este tipo de entrada
        // (pedido explícito del usuario) -- si no viene, se usa el precio de
        // catálogo/abono Misión 300 por defecto (ver priceManualOrderItems).
        unitPrice: z3.number().min(0).optional()
      })).min(1),
      kind: z3.enum(["invitation", "paid"]),
      paymentMethod: z3.string().optional(),
      attendeeData: z3.string().optional()
    })).mutation(async ({ input }) => {
      try {
        const result = await createManualOrder(input);
        await confirmFreeOrder(result.orderNumber);
        return result;
      } catch (err) {
        throw new TRPCError3({ code: "BAD_REQUEST", message: err instanceof Error ? err.message : "No se pudo crear el acceso manual." });
      }
    }),
    listManual: adminProcedure2.query(async () => {
      return listManualOrders();
    }),
    // Eliminar una compra (pedido explícito del usuario): irreversible, la
    // confirmación con ventana de diálogo vive en el admin, acá solo se
    // ejecuta el borrado en cascada.
    delete: adminProcedure2.input(z3.object({ id: z3.number() })).mutation(async ({ input }) => {
      return deleteOrderCascade(input.id);
    })
  }),
  mission300: router({
    status: adminProcedure2.input(z3.object({ eventId: z3.number() })).query(async ({ input }) => {
      return getMission300Status(input.eventId);
    }),
    evaluate: adminProcedure2.input(z3.object({ eventId: z3.number() })).mutation(async ({ input }) => {
      return evaluateMission300(input.eventId);
    })
  }),
  tickets: router({
    // Página pública "Mi entrada" (/verificar/:ticketCode) — de solo lectura,
    // el ticketCode ya funciona como token portador (viene del QR/email).
    getByCode: publicProcedure.input(z3.object({ ticketCode: z3.string() })).query(async ({ input }) => {
      return getTicketByCode(input.ticketCode);
    })
  }),
  // --- Puerta: el anfitrión en la entrada del estacionamiento ---
  // Pantalla aparte de /caja a propósito: el anfitrión no es cajero, no
  // debería ver el menú de venta, y escanea con su propio teléfono. Lo
  // único que puede hacer con esta sesión es marcar entradas.
  puerta: router({
    // Público como el de caja: solo devuelve nombres y roles, nunca PINs.
    listOperators: publicProcedure.query(async () => {
      const all = await listActiveOperatorsPublic();
      return all.filter((o) => o.role === "acceso" || o.role === "supervisor" || o.role === "admin");
    }),
    login: publicProcedure.input(z3.object({ operatorId: z3.number(), pin: z3.string().min(4).max(8) })).mutation(async ({ input, ctx }) => {
      const operator = await verifyDoorPinOrThrow(ctx, input.operatorId, input.pin);
      const sessionToken = await signOperatorSession({ operatorId: operator.id, role: operator.role, name: operator.name });
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.cookie(CAJA_COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: CAJA_SESSION_MS });
      return { id: operator.id, name: operator.name, role: operator.role };
    }),
    me: publicProcedure.query(({ ctx }) => ctx.operator),
    activeEvent: doorProcedure.query(async () => {
      return getActiveEventForCaja();
    }),
    // Mismo snapshot que la caja: la puerta lo guarda en el mismo IndexedDB
    // y por eso funciona sin señal.
    snapshot: doorProcedure.input(z3.object({ eventId: z3.number() })).query(async ({ input }) => {
      return getCajaSnapshot(input.eventId);
    }),
    checkin: doorProcedure.input(z3.object({
      opId: z3.string(),
      eventId: z3.number(),
      ticketCode: z3.string().min(1),
      clientAt: z3.string()
    })).mutation(async ({ input, ctx }) => {
      const rawDb = await getDb();
      if (!rawDb) throw new TRPCError3({ code: "INTERNAL_SERVER_ERROR", message: "Base de datos no disponible" });
      return checkInTicket(rawDb, {
        opId: input.opId,
        ticketCode: input.ticketCode,
        eventId: input.eventId,
        operatorId: ctx.operator.operatorId,
        clientAt: new Date(input.clientAt)
      });
    }),
    // Vaciado de la cola offline. Solo acepta operaciones de check-in: la
    // puerta no vende ni canjea, aunque comparta la cola con la caja.
    sync: doorProcedure.input(z3.object({
      eventId: z3.number(),
      ops: z3.array(z3.object({
        type: z3.literal("checkin"),
        opId: z3.string(),
        ticketCode: z3.string(),
        clientAt: z3.string()
      })).max(50)
    })).mutation(async ({ input, ctx }) => {
      const rawDb = await getDb();
      if (!rawDb) throw new TRPCError3({ code: "INTERNAL_SERVER_ERROR", message: "Base de datos no disponible" });
      const results = {};
      for (const op of input.ops) {
        try {
          results[op.opId] = await checkInTicket(rawDb, {
            opId: op.opId,
            ticketCode: op.ticketCode,
            eventId: input.eventId,
            operatorId: ctx.operator.operatorId,
            clientAt: new Date(op.clientAt)
          });
        } catch (err) {
          results[op.opId] = { result: "rejected", conflictNote: err instanceof Error ? err.message : "Error al sincronizar" };
        }
      }
      return results;
    })
  }),
  // --- Caramelo: la fiesta dentro del celular ---
  // Todo público porque el `ticketCode` ES el token (igual que la página de
  // la entrada): no hay cuentas ni contraseñas. Cada llamada revalida las
  // tres condiciones desde cero contra la base -- esconder un botón en el
  // cliente no protege nada.
  party: router({
    getSession: publicProcedure.input(z3.object({ ticketCode: z3.string() })).query(async ({ input }) => {
      const actor = await getPartyActor(input.ticketCode);
      if (!actor) return { denial: "sin_ticket", event: null, profile: null };
      const denial = partyEntryDenial(actor.ticket, actor.event, /* @__PURE__ */ new Date());
      return {
        denial,
        event: {
          id: actor.event.id,
          title: actor.event.title,
          eventDate: actor.event.eventDate,
          doorsOpen: actor.event.doorsOpen,
          eventEnd: actor.event.eventEnd
        },
        profile: actor.profile ? { id: actor.profile.id, alias: actor.profile.alias, gender: actor.profile.gender, avatarId: actor.profile.avatarId, zone: actor.profile.zone } : null
      };
    }),
    createProfile: publicProcedure.input(z3.object({
      ticketCode: z3.string(),
      alias: z3.string(),
      gender: z3.enum(PARTY_GENDERS),
      avatarId: z3.number().int().min(1).max(AVATARS_PER_GENDER),
      zone: z3.enum(PARTY_ZONES)
    })).mutation(async ({ input }) => {
      const actor = await requirePartyActor(input.ticketCode);
      if (actor.profile) return { id: actor.profile.id };
      const check = sanitizeAlias(input.alias);
      if (!check.ok) throw new TRPCError3({ code: "BAD_REQUEST", message: check.reason });
      const profile = await createPartyProfile({
        eventId: actor.event.id,
        ticketId: actor.ticket.id,
        alias: check.alias,
        gender: input.gender,
        avatarId: input.avatarId,
        zone: input.zone
      });
      return { id: profile.id };
    }),
    listMansion: publicProcedure.input(z3.object({ ticketCode: z3.string() })).query(async ({ input }) => {
      const actor = await requirePartyProfile(input.ticketCode);
      return listPartyMansion(actor.profile.id, actor.event.id);
    }),
    setZone: publicProcedure.input(z3.object({ ticketCode: z3.string(), zone: z3.enum(PARTY_ZONES) })).mutation(async ({ input }) => {
      const actor = await requirePartyProfile(input.ticketCode);
      await updatePartyProfile(actor.profile.id, { zone: input.zone });
      return { ok: true };
    }),
    touch: publicProcedure.input(z3.object({ ticketCode: z3.string(), targetProfileId: z3.number() })).mutation(async ({ input }) => {
      const actor = await requirePartyProfile(input.ticketCode);
      const res = await touchPartyProfile(actor.profile.id, input.targetProfileId, actor.event.id);
      if (!res.ok) throw new TRPCError3({ code: "BAD_REQUEST", message: res.reason });
      return res;
    }),
    respondTouch: publicProcedure.input(z3.object({ ticketCode: z3.string(), connectionId: z3.number(), accept: z3.boolean() })).mutation(async ({ input }) => {
      const actor = await requirePartyProfile(input.ticketCode);
      const res = await respondToPartyTouch(actor.profile.id, input.connectionId, input.accept);
      if (!res.ok) throw new TRPCError3({ code: "BAD_REQUEST", message: res.reason });
      return res;
    }),
    getMessages: publicProcedure.input(z3.object({ ticketCode: z3.string(), connectionId: z3.number() })).query(async ({ input }) => {
      const actor = await requirePartyProfile(input.ticketCode);
      const res = await listPartyMessages(actor.profile.id, input.connectionId);
      if (!res) throw new TRPCError3({ code: "FORBIDDEN", message: "Esta conversaci\xF3n no est\xE1 abierta" });
      return res;
    }),
    sendMessage: publicProcedure.input(z3.object({ ticketCode: z3.string(), connectionId: z3.number(), body: z3.string() })).mutation(async ({ input }) => {
      const actor = await requirePartyProfile(input.ticketCode);
      const check = sanitizeMessage(input.body);
      if (!check.ok) throw new TRPCError3({ code: "BAD_REQUEST", message: check.reason });
      const res = await sendPartyMessage(actor.profile.id, input.connectionId, check.body);
      if (!res.ok) throw new TRPCError3({ code: "FORBIDDEN", message: res.reason });
      return { ok: true };
    }),
    block: publicProcedure.input(z3.object({ ticketCode: z3.string(), targetProfileId: z3.number() })).mutation(async ({ input }) => {
      const actor = await requirePartyProfile(input.ticketCode);
      await blockPartyProfile(actor.profile.id, input.targetProfileId, actor.event.id);
      return { ok: true };
    }),
    report: publicProcedure.input(z3.object({ ticketCode: z3.string(), targetProfileId: z3.number(), reason: z3.string().min(3).max(500) })).mutation(async ({ input }) => {
      const actor = await requirePartyProfile(input.ticketCode);
      await reportPartyProfile(actor.profile.id, input.targetProfileId, actor.event.id, input.reason.trim());
      await blockPartyProfile(actor.profile.id, input.targetProfileId, actor.event.id);
      return { ok: true };
    }),
    // --- Invitar un trago ---
    // Tres pasos porque el destinatario puede rechazar y nadie paga por un
    // trago rechazado: invitar (gratis) -> responder -> pagar.
    listDrinks: publicProcedure.input(z3.object({ ticketCode: z3.string() })).query(async ({ input }) => {
      const actor = await requirePartyProfile(input.ticketCode);
      return listPartyDrinks(actor.event.id);
    }),
    sendGift: publicProcedure.input(z3.object({
      ticketCode: z3.string(),
      targetProfileId: z3.number(),
      ticketTypeId: z3.number(),
      message: z3.string().optional()
    })).mutation(async ({ input }) => {
      const actor = await requirePartyProfile(input.ticketCode);
      const check = sanitizeGiftMessage(input.message ?? "");
      if (!check.ok) throw new TRPCError3({ code: "BAD_REQUEST", message: check.reason });
      const res = await createGiftInvitation({
        eventId: actor.event.id,
        fromProfileId: actor.profile.id,
        toProfileId: input.targetProfileId,
        ticketTypeId: input.ticketTypeId,
        message: check.body
      });
      if (!res.ok) throw new TRPCError3({ code: "BAD_REQUEST", message: res.reason });
      return res;
    }),
    respondGift: publicProcedure.input(z3.object({ ticketCode: z3.string(), giftId: z3.number(), accept: z3.boolean() })).mutation(async ({ input }) => {
      const actor = await requirePartyProfile(input.ticketCode);
      const res = await respondToGiftInvitation(actor.profile.id, input.giftId, input.accept);
      if (!res.ok) throw new TRPCError3({ code: "BAD_REQUEST", message: res.reason });
      return res;
    }),
    // Crea la orden del regalo y devuelve su número. El cobro después va
    // por `orders.processCardPayment`, el mismo endpoint que las entradas.
    payGift: publicProcedure.input(z3.object({ ticketCode: z3.string(), giftId: z3.number() })).mutation(async ({ input }) => {
      const actor = await requirePartyProfile(input.ticketCode);
      const contact = await getPartyProfileContact(actor.profile.id);
      if (!contact?.email) throw new TRPCError3({ code: "BAD_REQUEST", message: "No pudimos identificar tu correo" });
      const res = await createGiftOrder(actor.profile.id, input.giftId, { name: contact.alias, email: contact.email });
      if (!res.ok) throw new TRPCError3({ code: "BAD_REQUEST", message: res.reason });
      return res;
    }),
    myGifts: publicProcedure.input(z3.object({ ticketCode: z3.string() })).query(async ({ input }) => {
      const actor = await requirePartyProfile(input.ticketCode);
      return listMyGifts(actor.profile.id);
    }),
    // Para el equipo del local, durante la fiesta.
    listReports: adminProcedure2.input(z3.object({ eventId: z3.number() })).query(async ({ input }) => {
      return listPartyReports(input.eventId);
    }),
    listGifts: adminProcedure2.input(z3.object({ eventId: z3.number() })).query(async ({ input }) => {
      return listPartyGiftsForEvent(input.eventId);
    })
  }),
  discounts: router({
    listAll: adminProcedure2.query(async () => {
      return getAllDiscountCodes();
    }),
    create: adminProcedure2.input(z3.object({
      code: z3.string(),
      description: z3.string().optional(),
      discountType: z3.enum(["percentage", "fixed"]),
      discountValue: z3.number(),
      minPurchase: z3.number().optional(),
      maxUses: z3.number().optional(),
      eventId: z3.number().optional(),
      validFrom: z3.string().optional(),
      validUntil: z3.string().optional()
    })).mutation(async ({ input }) => {
      return createDiscountCode(input);
    }),
    update: adminProcedure2.input(z3.object({
      id: z3.number(),
      code: z3.string().optional(),
      description: z3.string().optional(),
      discountType: z3.enum(["percentage", "fixed"]).optional(),
      discountValue: z3.number().optional(),
      maxUses: z3.number().optional(),
      isActive: z3.number().optional(),
      validUntil: z3.string().optional()
    })).mutation(async ({ input }) => {
      const { id, ...data } = input;
      return updateDiscountCode(id, data);
    }),
    delete: adminProcedure2.input(z3.object({ id: z3.number() })).mutation(async ({ input }) => {
      return deleteDiscountCode(input.id);
    })
  }),
  settings: router({
    get: publicProcedure.query(async () => {
      return getSiteSettings();
    }),
    update: adminProcedure2.input(z3.object({
      instagramFollowers: z3.number().optional(),
      instagramPosts: z3.number().optional(),
      serviceFeePercent: z3.number().min(0).max(100).optional()
    })).mutation(async ({ input }) => {
      return updateSiteSettings(input);
    }),
    // Mismo número que llega en el correo de las 3am (server/cronRoutes.ts),
    // pero en vivo para revisarlo manual desde Ajustes.
    checkinCount: adminProcedure2.query(async () => {
      const event = await getActiveEventForCaja();
      if (!event) return null;
      const dashboard = await getCajaDashboard(event.id);
      if (!dashboard) return null;
      return { eventTitle: event.title, insideCount: dashboard.insideCount, expectedCount: dashboard.expectedCount };
    })
  }),
  communityCodes: router({
    validate: publicProcedure.input(z3.object({
      code: z3.string()
    })).mutation(async ({ input }) => {
      return validateCommunityCode(input.code);
    }),
    // Admin
    listAll: adminProcedure2.query(async () => {
      return getAllCommunityCodes();
    }),
    create: adminProcedure2.input(z3.object({
      code: z3.string(),
      label: z3.string().optional(),
      maxUses: z3.number().optional()
    })).mutation(async ({ input }) => {
      return createCommunityCode(input);
    }),
    update: adminProcedure2.input(z3.object({
      id: z3.number(),
      code: z3.string().optional(),
      label: z3.string().optional(),
      maxUses: z3.number().optional(),
      isActive: z3.number().optional()
    })).mutation(async ({ input }) => {
      const { id, ...data } = input;
      return updateCommunityCode(id, data);
    }),
    delete: adminProcedure2.input(z3.object({ id: z3.number() })).mutation(async ({ input }) => {
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
    getByCode: publicProcedure.input(z3.object({ code: z3.string() })).query(async ({ input }) => {
      return getReferralsByCode(input.code);
    }),
    // Público, para el Hall de la Fama -- solo primer nombre + código +
    // cantidad de ventas, nunca montos ni apellido (ver db.getReferralLeaderboard).
    getLeaderboard: publicProcedure.input(z3.object({ eventId: z3.number() })).query(async ({ input }) => {
      return getReferralLeaderboard(input.eventId);
    })
  }),
  // Embajadores exclusivos con comisión (pedido explícito del usuario) --
  // tab aparte de "Referidos" (arriba), para embajadores dados de alta a
  // mano que cobran una comisión en plata por venta, no descuento.
  ambassadors: router({
    listAll: adminProcedure2.input(z3.object({ eventId: z3.number().optional() }).optional()).query(async ({ input }) => {
      return listExclusiveAmbassadors(input?.eventId);
    }),
    create: adminProcedure2.input(z3.object({
      // Opcional: el código es permanente y de la persona, no del evento.
      eventId: z3.number().optional(),
      name: z3.string().min(1),
      code: z3.string().min(1),
      // `null` = usar la escala global del programa (lo normal).
      commissionPercent: z3.number().min(0).max(100).nullable().optional(),
      contact: z3.string().optional(),
      email: z3.string().email().optional(),
      instagram: z3.string().optional()
    })).mutation(async ({ input }) => {
      return createExclusiveAmbassador(input);
    }),
    update: adminProcedure2.input(z3.object({
      id: z3.number(),
      name: z3.string().optional(),
      code: z3.string().optional(),
      commissionPercent: z3.number().min(0).max(100).nullable().optional(),
      contact: z3.string().optional(),
      email: z3.string().email().optional(),
      instagram: z3.string().optional(),
      active: z3.number().optional()
    })).mutation(async ({ input }) => {
      const { id, ...data } = input;
      return updateExclusiveAmbassador(id, data);
    }),
    delete: adminProcedure2.input(z3.object({ id: z3.number() })).mutation(async ({ input }) => {
      return deleteExclusiveAmbassador(input.id);
    }),
    // Reporte histórico por evento (el del PR original). Se conserva porque
    // sigue siendo la forma de saber cuánto se pagó en una fiesta puntual.
    getReport: adminProcedure2.input(z3.object({ eventId: z3.number() })).query(async ({ input }) => {
      return getAmbassadorCommissionReport(input.eventId);
    }),
    // --- Programa VIP automatizado ---
    /** Valida el código en el checkout. Público, igual que
     * communityCodes.validate: hasta ahora el campo se mandaba sin verificar
     * nada, así que un código mal tecleado se perdía en silencio. */
    validate: publicProcedure.input(z3.object({ code: z3.string() })).mutation(async ({ input }) => {
      const clean = input.code.trim().toUpperCase();
      if (!clean) return { valid: false, message: "Escribe un c\xF3digo" };
      const ambassador = await getActiveExclusiveAmbassadorByCode(clean);
      if (!ambassador) return { valid: false, message: "No encontramos ese c\xF3digo" };
      return { valid: true, name: ambassador.name, code: ambassador.code };
    }),
    /** Panel público del embajador (/embajador/<CODIGO>). El código hace de
     * llave -- no hay login de embajadores, mismo criterio que /mis-referidos. */
    getPanelByCode: publicProcedure.input(z3.object({ code: z3.string() })).query(async ({ input }) => {
      return getAmbassadorPanel(input.code);
    }),
    getConfig: adminProcedure2.query(async () => {
      return getProgramConfig();
    }),
    updateConfig: adminProcedure2.input(z3.object({
      launchDate: z3.string().optional(),
      commissionScale: z3.array(z3.object({
        minSales: z3.number().int().min(1),
        maxSales: z3.number().int().min(1).nullable(),
        percent: z3.number().min(0).max(100)
      })).optional(),
      existingClientPercent: z3.number().min(0).max(100).optional(),
      benefits: z3.array(z3.object({
        minSales: z3.number().int().min(1),
        items: z3.array(z3.string()),
        bonusClp: z3.number().min(0)
      })).optional(),
      weeklyEmailEnabled: z3.boolean().optional(),
      weeklyEmailWeekday: z3.number().int().min(0).max(6).optional(),
      weeklyEmailHourChile: z3.number().int().min(0).max(23).optional()
    })).mutation(async ({ input }) => {
      const { launchDate, ...rest } = input;
      return updateProgramConfig({
        ...rest,
        ...launchDate ? { launchDate: new Date(launchDate) } : {}
      });
    }),
    /** `monthKey` en formato "2026-08"; si no viene, el mes actual de Chile. */
    getSummary: adminProcedure2.input(z3.object({ monthKey: z3.string().optional() }).optional()).query(async ({ input }) => {
      return getAmbassadorAdminSummary(input?.monthKey || monthKeyFor(/* @__PURE__ */ new Date()));
    }),
    getRanking: adminProcedure2.input(z3.object({ monthKey: z3.string().optional() }).optional()).query(async ({ input }) => {
      return getAmbassadorRanking(input?.monthKey || monthKeyFor(/* @__PURE__ */ new Date()));
    }),
    getProfile: adminProcedure2.input(z3.object({ id: z3.number(), monthKey: z3.string().optional() })).query(async ({ input }) => {
      const monthKey = input.monthKey || monthKeyFor(/* @__PURE__ */ new Date());
      return {
        stats: await getAmbassadorStats(input.id, monthKey),
        sales: await getAmbassadorSales(input.id)
      };
    }),
    listReferredClients: adminProcedure2.query(async () => {
      return listReferredClients();
    }),
    // --- Beneficios entregados ---
    listBenefitDeliveries: adminProcedure2.input(z3.object({ monthKey: z3.string().optional() }).optional()).query(async ({ input }) => {
      return listBenefitDeliveries(input?.monthKey || monthKeyFor(/* @__PURE__ */ new Date()));
    }),
    markBenefitDelivered: adminProcedure2.input(z3.object({
      ambassadorId: z3.number(),
      monthKey: z3.string(),
      benefitKey: z3.string(),
      note: z3.string().optional()
    })).mutation(async ({ input }) => {
      return markBenefitDelivered(input);
    }),
    unmarkBenefitDelivered: adminProcedure2.input(z3.object({
      ambassadorId: z3.number(),
      monthKey: z3.string(),
      benefitKey: z3.string()
    })).mutation(async ({ input }) => {
      return unmarkBenefitDelivered(input);
    }),
    // --- Material de la semana ---
    getWeeklyMaterial: adminProcedure2.query(async () => {
      return getWeeklyMaterial();
    }),
    saveWeeklyMaterial: adminProcedure2.input(z3.object({
      title: z3.string().optional(),
      storiesText: z3.string().optional(),
      reelText: z3.string().optional(),
      postText: z3.string().optional(),
      countdownText: z3.string().optional(),
      linkUrl: z3.string().optional()
    })).mutation(async ({ input }) => {
      return saveWeeklyMaterial(input);
    }),
    /** Manda el resumen semanal ahora mismo, sin esperar al día configurado --
     * para poder probarlo y para reenviarlo si un lunes falló. */
    sendWeeklyNow: adminProcedure2.mutation(async () => {
      return sendWeeklyAmbassadorEmails();
    })
  }),
  // Postulaciones públicas para ser embajador (página /embajadores).
  ambassadorApplications: router({
    /** Único formulario público del sitio que escribe en la base para que
     * alguien lo revise después, así que es la primera superficie de spam:
     * va con límite por IP y con la validación pura de
     * shared/ambassadorApplication.ts, que el cliente también corre pero en
     * la que no se confía. */
    submit: publicProcedure.input(z3.object({
      name: z3.string(),
      email: z3.string().email("Revisa tu correo"),
      whatsapp: z3.string(),
      instagram: z3.string(),
      followers: z3.string().optional(),
      message: z3.string().optional(),
      acceptedTerms: z3.boolean()
    })).mutation(async ({ input, ctx }) => {
      const ipKey = `postulacion:${clientIp(ctx)}`;
      if (!await checkIpRateLimit(ipKey)) {
        throw new TRPCError3({ code: "TOO_MANY_REQUESTS", message: "Ya mandaste varias postulaciones. Espera un rato antes de intentar de nuevo." });
      }
      await recordIpAttempt(ipKey, APPLICATION_MAX_PER_HOUR, 60 * 60 * 1e3);
      if (!input.acceptedTerms) {
        throw new TRPCError3({ code: "BAD_REQUEST", message: "Tienes que confirmar que cumples los requisitos" });
      }
      const nombre = sanitizeApplicantName(input.name);
      if (!nombre.ok) throw new TRPCError3({ code: "BAD_REQUEST", message: nombre.reason });
      const wsp = sanitizeWhatsapp(input.whatsapp);
      if (!wsp.ok) throw new TRPCError3({ code: "BAD_REQUEST", message: wsp.reason });
      const ig = sanitizeInstagram(input.instagram);
      if (!ig.ok) throw new TRPCError3({ code: "BAD_REQUEST", message: ig.reason });
      const seguidores = sanitizeFollowers(input.followers ?? null);
      if (!seguidores.ok) throw new TRPCError3({ code: "BAD_REQUEST", message: seguidores.reason });
      const mensaje = sanitizeApplicationMessage(input.message ?? "");
      if (!mensaje.ok) throw new TRPCError3({ code: "BAD_REQUEST", message: mensaje.reason });
      const created = await createApplication({
        name: nombre.value,
        email: input.email,
        whatsapp: wsp.value,
        instagram: ig.value,
        followers: seguidores.value,
        message: mensaje.value,
        acceptedTerms: true
      });
      if (!created.ok) {
        if (created.reason === "ya_pendiente") {
          return { ok: true, alreadyPending: true };
        }
        throw new TRPCError3({ code: "INTERNAL_SERVER_ERROR", message: "No pudimos guardar tu postulaci\xF3n. Intenta de nuevo." });
      }
      try {
        await sendEmail({
          to: APPLICATIONS_EMAIL,
          subject: `[Postulaciones] ${nombre.value} \u2014 @${ig.value}`,
          html: buildAmbassadorApplicationEmail({
            name: nombre.value,
            email: input.email.trim().toLowerCase(),
            whatsapp: wsp.value,
            instagram: ig.value,
            followers: seguidores.value,
            message: mensaje.value,
            whatsappLink: whatsappLinkFor(wsp.value),
            instagramLink: instagramLinkFor(ig.value)
          })
        });
        await sendEmail({
          to: input.email.trim().toLowerCase(),
          subject: "\u{1F451} Recibimos tu postulaci\xF3n \u2014 Mansion Playroom",
          html: buildApplicationReceivedEmail({
            name: nombre.value,
            requirements: [...AMBASSADOR_REQUIREMENTS],
            tasks: [...AMBASSADOR_TASKS]
          })
        });
      } catch (err) {
        console.error("[Postulaciones] Fall\xF3 el env\xEDo de correos:", err);
      }
      return { ok: true, alreadyPending: false };
    }),
    listAll: adminProcedure2.input(z3.object({
      status: z3.enum(["pendiente", "aprobada", "rechazada"]).optional()
    }).optional()).query(async ({ input }) => {
      return listApplications(input?.status);
    }),
    countPending: adminProcedure2.query(async () => {
      return countPendingApplications();
    }),
    review: adminProcedure2.input(z3.object({
      id: z3.number(),
      status: z3.enum(["pendiente", "aprobada", "rechazada"]),
      note: z3.string().optional()
    })).mutation(async ({ input }) => {
      return reviewApplication(input);
    }),
    /** Aprueba y crea al embajador en un solo paso, con el código que escribe
     * el admin, y le manda su código por correo. */
    approve: adminProcedure2.input(z3.object({
      id: z3.number(),
      code: z3.string().min(1),
      commissionPercent: z3.number().min(0).max(100).nullable().optional()
    })).mutation(async ({ input }) => {
      const result = await approveApplication(input);
      try {
        await sendEmail({
          to: result.email,
          subject: `\u{1F389} \xA1Quedaste! Tu c\xF3digo es ${result.code}`,
          html: buildAmbassadorWelcomeEmail({
            name: result.name,
            code: result.code,
            panelUrl: `${PANEL_BASE_URL}/embajador/${result.code}`,
            tasks: [...AMBASSADOR_TASKS]
          })
        });
      } catch (err) {
        console.error("[Postulaciones] Fall\xF3 el correo de bienvenida:", err);
      }
      return result;
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
    enrollDevice: publicProcedure.input(z3.object({ code: z3.string().min(1) })).mutation(async ({ input, ctx }) => {
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
    login: deviceProcedure.input(z3.object({ operatorId: z3.number(), pin: z3.string().min(4).max(8) })).mutation(async ({ input, ctx }) => {
      const operator = await verifyOperatorPinOrThrow(ctx, input.operatorId, input.pin);
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
    search: operatorProcedure.input(z3.object({ eventId: z3.number(), query: z3.string() })).query(async ({ input }) => {
      return searchCajaCustomers(input.eventId, input.query);
    }),
    customerSheet: operatorProcedure.input(z3.object({ orderId: z3.number() })).query(async ({ input }) => {
      return getCajaCustomerSheet(input.orderId);
    }),
    catalog: operatorProcedure.input(z3.object({ eventId: z3.number() })).query(async ({ input }) => {
      return getCajaCatalog(input.eventId);
    }),
    dashboard: operatorProcedure.input(z3.object({ eventId: z3.number() })).query(async ({ input }) => {
      return getCajaDashboard(input.eventId);
    }),
    // Descarga completa para el modo offline (docs/ARQUITECTURA-CAJA.md
    // §6.2) -- la tablet la guarda en IndexedDB al abrir turno y la
    // refresca cada 60s cuando hay conexión.
    snapshot: operatorProcedure.input(z3.object({ eventId: z3.number() })).query(async ({ input }) => {
      return getCajaSnapshot(input.eventId);
    }),
    // Procesa un lote de operaciones encoladas offline (§7) -- reutiliza
    // exactamente la misma lógica idempotente (applyOp) que los endpoints
    // online `redeem`/`sale`, así que reenviar el mismo opId nunca duplica nada.
    sync: operatorProcedure.input(z3.object({
      eventId: z3.number(),
      registerId: z3.number().optional(),
      ops: z3.array(z3.discriminatedUnion("type", [
        z3.object({ type: z3.literal("redeem"), opId: z3.string(), displayCode: z3.string(), clientAt: z3.string() }),
        z3.object({ type: z3.literal("checkin"), opId: z3.string(), ticketCode: z3.string(), clientAt: z3.string() }),
        z3.object({
          type: z3.literal("sale"),
          opId: z3.string(),
          items: z3.array(z3.object({ ticketTypeId: z3.number(), quantity: z3.number().min(1) })).min(1),
          paymentMethod: z3.enum(["efectivo", "debito", "credito"]),
          buyerEmail: z3.string().email().optional(),
          redeemPlaycoins: z3.number().int().min(0).optional(),
          clientAt: z3.string()
        })
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
          } else if (op.type === "checkin") {
            results[op.opId] = await checkInTicket(rawDb, {
              opId: op.opId,
              ticketCode: op.ticketCode,
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
              clientAt: new Date(op.clientAt),
              buyerEmail: op.buyerEmail,
              redeemPlaycoins: op.redeemPlaycoins
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
    // Apertura de turno con cuadre de caja (pedido explícito del usuario):
    // pide el efectivo inicial declarado por la cajera. Idempotente por
    // evento+caja (un refresh de página no duplica el turno abierto).
    shiftOpen: operatorProcedure.input(z3.object({
      opId: z3.string(),
      eventId: z3.number(),
      registerId: z3.number().optional(),
      openingCash: z3.number().min(0),
      clientAt: z3.string()
    })).mutation(async ({ input, ctx }) => {
      const rawDb = await getDb();
      if (!rawDb) throw new TRPCError3({ code: "INTERNAL_SERVER_ERROR", message: "Base de datos no disponible" });
      if (!ctx.operator) throw new TRPCError3({ code: "UNAUTHORIZED" });
      const shiftId = await openShift({
        eventId: input.eventId,
        operatorId: ctx.operator.operatorId,
        registerId: input.registerId,
        openingCash: input.openingCash
      });
      const { applyOp: applyOp2 } = await Promise.resolve().then(() => (init_ops(), ops_exports));
      await applyOp2(rawDb, {
        id: input.opId,
        type: "shift_open",
        eventId: input.eventId,
        operatorId: ctx.operator.operatorId,
        registerId: input.registerId,
        targetType: "operator",
        targetId: String(ctx.operator.operatorId),
        payload: { openingCash: input.openingCash, shiftId },
        clientAt: new Date(input.clientAt)
      }, async () => ({ result: "applied" }));
      return { shiftId };
    }),
    // Protocolo de pendientes (§13, riesgo 2): el cliente NO debe llamar esto
    // con ops sin sincronizar -- se bloquea en la UI, no acá, porque cerrar
    // el turno es una decisión operativa, no algo que el servidor pueda ver.
    // Pide efectivo TOTAL contado (no la diferencia) + totales de débito y
    // crédito de las máquinas, hace el cuadre contra las ventas registradas
    // (solo canal caja, nunca web) y manda el informe final por correo.
    shiftClose: operatorProcedure.input(z3.object({
      opId: z3.string(),
      eventId: z3.number(),
      registerId: z3.number().optional(),
      countedCash: z3.number().min(0),
      countedDebit: z3.number().min(0),
      countedCredit: z3.number().min(0),
      clientAt: z3.string()
    })).mutation(async ({ input, ctx }) => {
      const rawDb = await getDb();
      if (!rawDb) throw new TRPCError3({ code: "INTERNAL_SERVER_ERROR", message: "Base de datos no disponible" });
      if (!ctx.operator) throw new TRPCError3({ code: "UNAUTHORIZED" });
      const openShift2 = await getOpenShift(input.eventId, input.registerId);
      if (!openShift2) throw new TRPCError3({ code: "BAD_REQUEST", message: "No hay un turno abierto para cerrar" });
      const report = await closeShift({
        shiftId: openShift2.id,
        closedByOperatorId: ctx.operator.operatorId,
        countedCash: input.countedCash,
        countedDebit: input.countedDebit,
        countedCredit: input.countedCredit
      });
      const { applyOp: applyOp2 } = await Promise.resolve().then(() => (init_ops(), ops_exports));
      await applyOp2(rawDb, {
        id: input.opId,
        type: "shift_close",
        eventId: input.eventId,
        operatorId: ctx.operator.operatorId,
        registerId: input.registerId,
        targetType: "operator",
        targetId: String(ctx.operator.operatorId),
        payload: report,
        clientAt: new Date(input.clientAt)
      }, async () => ({ result: "applied" }));
      try {
        await sendEmail({
          to: SHIFT_CLOSE_REPORT_EMAIL,
          subject: `[Cierre de turno] ${report.eventTitle} \u2014 ${report.registerName}`,
          html: buildShiftCloseEmail(report)
        });
      } catch (err) {
        console.error("[shiftClose] Error al enviar el correo de cierre:", err);
      }
      return report;
    }),
    // Anulación con motivo -- solo supervisor/admin (docs/ARQUITECTURA-CAJA.md §3.2).
    voidCode: supervisorProcedure.input(z3.object({
      opId: z3.string(),
      eventId: z3.number(),
      displayCode: z3.string().min(1),
      reason: z3.string().min(3, "El motivo es obligatorio"),
      registerId: z3.number().optional(),
      clientAt: z3.string()
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
    conflictQueue: supervisorProcedure.input(z3.object({ eventId: z3.number() })).query(async ({ input }) => {
      return getConflictQueue(input.eventId);
    }),
    resolveConflict: supervisorProcedure.input(z3.object({
      opId: z3.string(),
      eventId: z3.number(),
      conflictOpId: z3.string(),
      note: z3.string().optional(),
      clientAt: z3.string()
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
    redeem: operatorProcedure.input(z3.object({
      opId: z3.string(),
      eventId: z3.number(),
      displayCode: z3.string().min(1),
      registerId: z3.number().optional(),
      clientAt: z3.string()
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
    // Marca la entrada de un acceso en la puerta (mismo ledger idempotente
    // que `redeem`, pero por ticketCode y solo para category='acceso').
    checkin: operatorProcedure.input(z3.object({
      opId: z3.string(),
      eventId: z3.number(),
      ticketCode: z3.string().min(1),
      registerId: z3.number().optional(),
      clientAt: z3.string()
    })).mutation(async ({ input, ctx }) => {
      const rawDb = await getDb();
      if (!rawDb) throw new TRPCError3({ code: "INTERNAL_SERVER_ERROR", message: "Base de datos no disponible" });
      return checkInTicket(rawDb, {
        opId: input.opId,
        ticketCode: input.ticketCode,
        eventId: input.eventId,
        operatorId: ctx.operator.operatorId,
        registerId: input.registerId,
        clientAt: new Date(input.clientAt)
      });
    }),
    sale: operatorProcedure.input(z3.object({
      opId: z3.string(),
      eventId: z3.number(),
      items: z3.array(z3.object({ ticketTypeId: z3.number(), quantity: z3.number().min(1) })).min(1),
      paymentMethod: z3.enum(["efectivo", "debito", "credito"]),
      registerId: z3.number().optional(),
      clientAt: z3.string()
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
    create: adminProcedure2.input(z3.object({
      name: z3.string().min(1),
      pin: z3.string().min(4).max(8),
      role: z3.enum(["admin", "supervisor", "caja", "barra", "acceso"])
    })).mutation(async ({ input }) => {
      const id = await createOperator({ name: input.name, pinHash: hashPin(input.pin), role: input.role });
      return { id };
    }),
    update: adminProcedure2.input(z3.object({
      id: z3.number(),
      name: z3.string().min(1).optional(),
      pin: z3.string().min(4).max(8).optional(),
      role: z3.enum(["admin", "supervisor", "caja", "barra", "acceso"]).optional(),
      active: z3.number().min(0).max(1).optional()
    })).mutation(async ({ input }) => {
      const { id, pin, ...rest } = input;
      await updateOperator(id, { ...rest, ...pin ? { pinHash: hashPin(pin) } : {} });
      return { success: true };
    })
  }),
  // Base de datos de clientes desde /admin (pedido explícito del usuario).
  customers: router({
    listAll: adminProcedure2.input(z3.object({
      search: z3.string().optional(),
      accessType: z3.string().optional(),
      tag: z3.string().optional(),
      excludeTags: z3.array(z3.string()).optional(),
      eventId: z3.number().optional()
    }).optional()).query(async ({ input }) => {
      return listCustomers(input ?? {});
    }),
    // Etiquetas existentes con su conteo -- alimenta los selectores de
    // "incluir/excluir etiqueta" al armar una campaña de mailing, para no
    // tener que escribir el nombre exacto de memoria.
    listTags: adminProcedure2.query(async () => {
      return listCustomerTags();
    }),
    addTag: adminProcedure2.input(z3.object({ customerId: z3.number(), tag: z3.string().min(1) })).mutation(async ({ input }) => {
      await addCustomerTag(input.customerId, input.tag);
      return { success: true };
    }),
    // Marcar como "ya enviado" en masa desde un CSV externo (pedido
    // explícito del usuario, ej. el reporte de entregados de Resend, que
    // trae la columna "to") -- no crea clientes nuevos, solo taguea los que
    // ya existen; los que no matchean se devuelven en notFound.
    bulkTagFromCsv: adminProcedure2.input(z3.object({
      csv: z3.string().min(1),
      tag: z3.string().min(1)
    })).mutation(async ({ input }) => {
      const rows = parseCsv(input.csv);
      const emails = extractEmailColumn(rows, ["to", "email", "correo"]);
      if (emails.length === 0) {
        throw new TRPCError3({ code: "BAD_REQUEST", message: 'No se encontr\xF3 una columna "to"/"email" en el CSV.' });
      }
      return bulkAddTagByEmails(emails, input.tag);
    }),
    removeTag: adminProcedure2.input(z3.object({ customerId: z3.number(), tag: z3.string() })).mutation(async ({ input }) => {
      await removeCustomerTag(input.customerId, input.tag);
      return { success: true };
    }),
    updateNotes: adminProcedure2.input(z3.object({ customerId: z3.number(), notes: z3.string() })).mutation(async ({ input }) => {
      await updateCustomerNotes(input.customerId, input.notes);
      return { success: true };
    }),
    // Ajuste manual de Playcoins (pedido explícito del usuario) -- para
    // migrar saldos de Shopify a mano o corregir.
    adjustPlaycoins: adminProcedure2.input(z3.object({ customerId: z3.number(), delta: z3.number().int(), note: z3.string().optional() })).mutation(async ({ input }) => {
      await adjustPlaycoinsManually(input.customerId, input.delta, input.note ?? "");
      return { success: true };
    })
  }),
  // Mailing masivo desde /admin → Clientes (pedido explícito del usuario):
  // la IA solo genera texto estructurado (server/mailing.ts), el HTML de
  // marca se arma siempre acá con buildMailingBlastEmail.
  mailing: router({
    generateTemplate: adminProcedure2.input(z3.object({
      objective: z3.string().min(5).max(1e3),
      audienceDescription: z3.string()
    })).mutation(async ({ input }) => {
      try {
        return await generateMailingTemplate(input.objective, input.audienceDescription);
      } catch (err) {
        throw new TRPCError3({ code: "INTERNAL_SERVER_ERROR", message: err instanceof Error ? err.message : "No se pudo generar la plantilla." });
      }
    }),
    renderPreview: adminProcedure2.input(z3.object({
      content: MailingContentSchema,
      ctaUrl: z3.string(),
      sampleName: z3.string().optional(),
      eventSections: mailingEventSectionsSchema
    })).mutation(async ({ input }) => {
      const eventInfo = Object.values(input.eventSections).some(Boolean) ? await getMailingEventInfo() : null;
      return {
        html: buildMailingBlastEmail({ ...input.content, buyerName: input.sampleName || "Camila", ctaUrl: input.ctaUrl, eventInfo, eventSections: input.eventSections })
      };
    }),
    sendBatch: adminProcedure2.input(z3.object({
      customerIds: z3.array(z3.number()).min(1).max(MAILING_BATCH_MAX),
      content: MailingContentSchema,
      ctaUrl: z3.string(),
      campaignTag: z3.string().optional(),
      eventSections: mailingEventSectionsSchema
    })).mutation(async ({ input }) => {
      const eventInfo = Object.values(input.eventSections).some(Boolean) ? await getMailingEventInfo() : null;
      return {
        results: await sendMailingBatch(input.customerIds, input.content, input.ctaUrl, input.campaignTag, eventInfo, input.eventSections)
      };
    }),
    // Cola de envío automática (pedido explícito del usuario): a diferencia
    // de sendBatch (manda ya mismo desde el navegador), esto solo guarda la
    // campaña -- el cron diario (server/cronRoutes.ts) la va drenando.
    createAutoCampaign: adminProcedure2.input(z3.object({
      name: z3.string().min(1),
      audienceDescription: z3.string(),
      customerIds: z3.array(z3.number()).min(1),
      content: MailingContentSchema,
      ctaUrl: z3.string(),
      eventSections: mailingEventSectionsSchema
    })).mutation(async ({ input }) => {
      try {
        return await createAutoMailingCampaign(input);
      } catch (err) {
        throw new TRPCError3({ code: "BAD_REQUEST", message: err instanceof Error ? err.message : "No se pudo crear la campa\xF1a." });
      }
    }),
    listCampaigns: adminProcedure2.query(async () => {
      return listMailingCampaigns();
    }),
    getCampaignRecipients: adminProcedure2.input(z3.object({ campaignId: z3.number() })).query(async ({ input }) => {
      return getMailingCampaignRecipients(input.campaignId);
    })
  }),
  // Consulta pública de saldo de Playcoins (pedido explícito del usuario) --
  // sin login, igual que referrals.getByCode: el sitio no tiene cuentas de
  // comprador, el email es lo único necesario.
  playcoins: router({
    getBalanceByEmail: publicProcedure.input(z3.object({ email: z3.string().email() })).query(async ({ input }) => {
      return getPlaycoinsBalance(input.email);
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
    create: adminProcedure2.input(z3.object({ name: z3.string().min(1) })).mutation(async ({ input }) => {
      const code = generateEnrollCode();
      const id = await createDeviceEnrollment(input.name, code, enrollCodeExpiry());
      return { id, enrollCode: code };
    }),
    setActive: adminProcedure2.input(z3.object({ id: z3.number(), active: z3.number().min(0).max(1) })).mutation(async ({ input }) => {
      await updateDeviceActive(input.id, input.active);
      return { success: true };
    })
  }),
  // Cajas físicas ("Caja 1", "Caja 2"...) desde /admin.
  registers: router({
    listAll: adminProcedure2.query(async () => {
      return listAllRegisters();
    }),
    create: adminProcedure2.input(z3.object({ name: z3.string().min(1) })).mutation(async ({ input }) => {
      const id = await createRegister(input.name);
      return { id };
    })
  }),
  // Reportes y auditoría de /caja desde /admin (docs/ARQUITECTURA-CAJA.md §11, Fase 4).
  cajaReports: router({
    profit: adminProcedure2.input(z3.object({ eventId: z3.number() })).query(async ({ input }) => {
      return getProfitReport(input.eventId);
    }),
    eventComparison: adminProcedure2.query(async () => {
      return getEventComparison();
    }),
    peakHours: adminProcedure2.input(z3.object({ eventId: z3.number() })).query(async ({ input }) => {
      return getPeakHours(input.eventId);
    }),
    ledger: adminProcedure2.input(z3.object({
      eventId: z3.number(),
      operatorId: z3.number().optional(),
      type: z3.string().optional(),
      dateFrom: z3.string().optional(),
      dateTo: z3.string().optional()
    })).query(async ({ input }) => {
      const { eventId, ...filters } = input;
      return getLedger(eventId, filters);
    }),
    // Cuadres de caja guardados (pedido explícito del usuario) -- sin
    // eventId trae los de todos los eventos, para comparar entre fiestas.
    shiftClosings: adminProcedure2.input(z3.object({ eventId: z3.number().optional() }).optional()).query(async ({ input }) => {
      return listShiftClosings(input?.eventId);
    }),
    // Eliminar un cierre de turno (pedido explícito del usuario, para sacar
    // pruebas/cierres de práctica de los reportes reales) -- doble
    // verificación: además del diálogo de confirmación en el admin, pide la
    // misma clave que auth.adminLogin.
    deleteShiftClosing: adminProcedure2.input(z3.object({
      shiftId: z3.number(),
      password: z3.string()
    })).mutation(async ({ input }) => {
      const adminPassword = process.env.ADMIN_PASSWORD;
      if (!adminPassword || input.password !== adminPassword) {
        throw new TRPCError3({ code: "UNAUTHORIZED", message: "Contrase\xF1a incorrecta" });
      }
      return deleteShiftClosing(input.shiftId);
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
  registerCronRoutes(app);
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
