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
import { sql } from "drizzle-orm";
var users, events, ticketTypes, stockPools, ticketStockHistory, orders, orderItems, tickets, discountCodes, communityCodes, leads, blockedCustomers, siteSettings, referrals, exclusiveAmbassadors, ambassadorCommissions, ambassadorClients, ambassadorProgramConfig, ambassadorBenefitDeliveries, ambassadorWeeklyMaterial, ambassadorApplications, operators, registers, devices, customers, ops, rateLimits, adminAuditLog, shifts, lockerItems, kitchenTickets, playcoinsLedger, prepaidLedger, mailingCampaigns, mailingRecipients, mailingSendLog, partyProfiles, partyConnections, partyMessages, partyBlocks, partyReports, partyGifts, adminTotp, adminWebauthnCredentials, expenses, pushSubscriptions, partyPushSubscriptions;
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
      // Escala de descuentos de las tandas de este evento, en % sobre
      // originalPrice (ej. [60, 50, 40, 30, 0] -- Founders 60%, luego 50%...).
      // La posición en el arreglo ES la fase, no hace falta un número de fase
      // aparte por tramo (a diferencia de ambassadorProgramConfig.commissionScale,
      // donde cada tramo necesita min/max Y percent correlacionados). `null` =
      // evento sin escala propia todavía -- se usa DEFAULT_TANDA_SCHEDULE.
      tandaDiscountSchedule: json("tandaDiscountSchedule"),
      // number[]
      // Índice (0-based) de la fase HOY vigente. Arranca en 0 porque la tanda
      // "Founders" ya en producción para el evento real de hoy ES la fase 1/60%
      // -- el default de columna cubre ese caso sin backfill.
      tandaPhaseIndex: int("tandaPhaseIndex").default(0).notNull(),
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
      costPrice: decimal("costPrice", { precision: 10, scale: 0 }),
      // para cálculo de margen (§12)
      color: varchar("color", { length: 20 }),
      // color del botón en la grilla de caja
      emoji: varchar("emoji", { length: 8 }),
      // ícono grande del botón en /caja (en vez de foto)
      // Sección de la carta dentro de la categoría ("Tragos", "Cervezas", "Sin
      // alcohol", "Comida"). Es lo que arma las pestañas de la grilla de /caja
      // sin necesitar una tabla de categorías.
      groupName: varchar("groupName", { length: 50 }),
      // "este producto lo prepara la cocina" -> genera comanda en /cocina. Es una
      // casilla explícita y no una regla adivinada por categoría o nombre: puede
      // haber un trago que sí va a cocina, o una comida envasada que se entrega
      // directo en la barra.
      toKitchen: int("toKitchen").default(0).notNull(),
      internalCode: varchar("internalCode", { length: 10 }),
      // prefijo del código de canje, ej. 'PIS'
      barcode: varchar("barcode", { length: 64 }),
      // preparado para lector de código de barras futuro
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
      metadata: json("metadata"),
      // atributos extensibles sin migración (talla, duración, etc.)
      createdAt: timestamp("createdAt").defaultNow().notNull(),
      updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull()
    });
    stockPools = mysqlTable("stockPools", {
      id: int("id").autoincrement().primaryKey(),
      eventId: int("eventId").notNull(),
      name: varchar("name", { length: 100 }).notNull(),
      totalCap: int("totalCap").notNull(),
      createdAt: timestamp("createdAt").defaultNow().notNull(),
      updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull()
    }, (table) => ({
      eventIdx: index("stockPools_event_idx").on(table.eventId)
    }));
    ticketStockHistory = mysqlTable("ticketStockHistory", {
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
      createdAt: timestamp("createdAt").defaultNow().notNull()
    }, (table) => ({
      ticketTypeIdx: index("ticketStockHistory_ticketTypeId_idx").on(table.ticketTypeId)
    }));
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
      // --- Módulo /caja (docs/ARQUITECTURA-CAJA.md §0.4, §4.3) ---
      // Canal de la venta: web = checkout normal, caja = venta presencial en el
      // evento, import = migración de la ticketera anterior (ya usado por
      // paymentMethod='Importado - ticketera anterior' antes de esta columna).
      channel: mysqlEnum("channel", ["web", "caja", "import"]).default("web").notNull(),
      operatorId: int("operatorId"),
      // quién registró la venta (solo canal caja)
      registerId: int("registerId"),
      // caja física donde se registró
      // Identidad permanente del comprador (`customers.id`), resuelta por email en
      // upsertCustomerFromOrder. Redundante con `buyerEmail` a propósito: el email
      // es editable y sensible a mayúsculas, y la tarjeta de membresía necesita un
      // enlace estable para leer saldo e historial sin rehacer el match por string
      // en cada consulta. Nullable porque las órdenes con email placeholder
      // (createInstantInvite, createStaffComp, ventas de caja sin email capturado)
      // no tienen identidad real de cliente detrás.
      customerId: int("customerId"),
      createdAt: timestamp("createdAt").defaultNow().notNull(),
      updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull()
    }, (t2) => [
      // La tabla no tenía ningún índice secundario pese a consultarse
      // constantemente por estas tres columnas (snapshot de caja, reportes por
      // evento, búsqueda de cliente, y ahora la tarjeta de membresía).
      index("orders_event_idx").on(t2.eventId),
      index("orders_buyer_email_idx").on(t2.buyerEmail),
      index("orders_customer_idx").on(t2.customerId)
    ]);
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
      carriedFromEventId: int("carriedFromEventId")
    }, (t2) => [
      // "Todo lo pendiente de este cliente" (la cara trasera de la tarjeta) se
      // consulta por las órdenes del cliente filtrando status='valid'.
      index("tickets_order_status_idx").on(t2.orderId, t2.status)
    ]);
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
      // Solo la promo relámpago la usa: lista de `ticketTypes.id` a los que se
      // les aplica el descuento. `null` (todos los códigos manuales de
      // Ajustes → Descuentos) = comportamiento de siempre, sobre el carrito
      // completo -- no rompe nada existente.
      applicableTicketTypeIds: json("applicableTicketTypeIds").$type(),
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
    leads = mysqlTable("leads", {
      id: int("id").autoincrement().primaryKey(),
      email: varchar("email", { length: 320 }).notNull(),
      phone: varchar("phone", { length: 20 }),
      instagram: varchar("instagram", { length: 100 }),
      eventId: int("eventId"),
      // De dónde vino el gancho -- hoy solo existe 'price_alert' ("avisame antes
      // de que suba el precio"), se deja como texto libre por si se agrega un
      // gancho de lista de espera antes de abrir venta ("avisame cuando abra").
      source: varchar("source", { length: 50 }).default("price_alert").notNull(),
      utmSource: varchar("utmSource", { length: 100 }),
      utmMedium: varchar("utmMedium", { length: 100 }),
      utmCampaign: varchar("utmCampaign", { length: 100 }),
      // Si este lead terminó comprando, qué orden generó -- se completa a mano
      // desde el admin (todavía no hay matcheo automático por email).
      convertedOrderId: int("convertedOrderId"),
      createdAt: timestamp("createdAt").defaultNow().notNull()
    }, (table) => ({
      // Mismo email puede volver a dejar su contacto para OTRO evento más
      // adelante sin chocar -- pero reenviar el mismo formulario para el mismo
      // evento actualiza el lead existente en vez de duplicarlo (ver
      // db.createLead, onDuplicateKeyUpdate).
      emailEventIdx: uniqueIndex("leads_email_event_idx").on(table.email, table.eventId)
    }));
    blockedCustomers = mysqlTable("blockedCustomers", {
      id: int("id").autoincrement().primaryKey(),
      rut: varchar("rut", { length: 20 }).notNull().unique(),
      fullName: varchar("fullName", { length: 255 }),
      reason: varchar("reason", { length: 500 }),
      isActive: int("isActive").default(1).notNull(),
      createdAt: timestamp("createdAt").defaultNow().notNull(),
      updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull()
    });
    siteSettings = mysqlTable("siteSettings", {
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
      parkingVenueFeeClp: int("parkingVenueFeeClp").default(3e3).notNull(),
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
      // Textos editables + interruptores por sección del correo de compra
      // (server/email.ts buildOrderEmail) -- forma en shared/emailTemplateConfig.ts.
      // null = usar todos los valores por defecto (todas las secciones prendidas).
      emailTemplateConfig: json("emailTemplateConfig"),
      // Interruptores de las alertas del admin (push + correo resumen) -- forma
      // en shared/adminAlertsConfig.ts. null = todas apagadas (desplegar esto no
      // debe empezar a mandar nada solo, mismo criterio que foundersPromoEnabled).
      adminAlertsConfig: json("adminAlertsConfig"),
      // Plantillas de Promo Flash guardadas para activar con un toque durante
      // la fiesta -- forma en shared/flashPromoPresets.ts. null = ninguna
      // guardada todavía.
      flashPromoPresets: json("flashPromoPresets"),
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
      createdAt: timestamp("createdAt").defaultNow().notNull(),
      updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull()
    }, (t2) => [
      index("operators_event_idx").on(t2.eventId)
    ]);
    registers = mysqlTable("registers", {
      id: int("id").autoincrement().primaryKey(),
      eventId: int("eventId").notNull(),
      name: varchar("name", { length: 100 }).notNull(),
      active: int("active").default(1).notNull(),
      createdAt: timestamp("createdAt").defaultNow().notNull()
    }, (t2) => [
      index("registers_event_idx").on(t2.eventId)
    ]);
    devices = mysqlTable("devices", {
      id: int("id").autoincrement().primaryKey(),
      eventId: int("eventId").notNull(),
      name: varchar("name", { length: 255 }).notNull(),
      enrollCode: varchar("enrollCode", { length: 16 }).unique(),
      enrollCodeExpiresAt: timestamp("enrollCodeExpiresAt"),
      deviceTokenHash: varchar("deviceTokenHash", { length: 255 }),
      enrolled: int("enrolled").default(0).notNull(),
      active: int("active").default(1).notNull(),
      createdAt: timestamp("createdAt").defaultNow().notNull(),
      lastSeenAt: timestamp("lastSeenAt")
    }, (t2) => [
      index("devices_event_idx").on(t2.eventId)
    ]);
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
      // Saldo prepagado en PLATA (1 CLP = 1 CLP), distinto e independiente de
      // `playcoins`: esto es dinero que el cliente cargó, no puntos que ganó. Los
      // dos conviven en la misma tarjeta sin mezclarse. Igual que `playcoins`, es
      // una proyección cacheada de la suma de `prepaidLedger` para este cliente.
      prepaidBalance: int("prepaidBalance").default(0).notNull(),
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
      notes: text("notes"),
      firstSeenAt: timestamp("firstSeenAt").defaultNow().notNull(),
      lastSeenAt: timestamp("lastSeenAt").defaultNow().notNull(),
      createdAt: timestamp("createdAt").defaultNow().notNull(),
      updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull()
    });
    ops = mysqlTable("ops", {
      id: varchar("id", { length: 36 }).primaryKey(),
      // UUID generado en el cliente (idempotencia)
      // Debe coincidir siempre con `OpType` en server/caja/ops.ts -- se
      // desincronizó DOS veces ya, y las dos con el mismo síntoma: un tipo nuevo
      // agregado al tipo de TS pero nunca migrado acá, así que el INSERT de esa
      // operación fallaba en producción sin que nada lo avisara antes.
      //   1ª vez: faltaban 'checkin', 'locker_return' y 'kitchen_update' -- rompía
      //           el check-in de /puerta y Aprobar/Entregado en /cocina.
      //   2ª vez: faltaba 'parking_paid' -- rompía TODO cobro de estacionamiento en
      //           la puerta (server/caja/parkingPaid.ts).
      // Si agregas un valor a OpType, agrégalo acá EN EL MISMO commit.
      type: mysqlEnum("type", ["redeem", "checkin", "sale", "void_code", "note", "shift_open", "shift_close", "manual_adjust", "locker_return", "kitchen_update", "parking_paid"]).notNull(),
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
    adminAuditLog = mysqlTable("adminAuditLog", {
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
      createdAt: timestamp("createdAt").defaultNow().notNull()
    }, (t2) => [
      index("adminAuditLog_created_idx").on(t2.createdAt),
      index("adminAuditLog_action_idx").on(t2.action)
    ]);
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
      topCustomers: json("topCustomers"),
      // [{ name, email, total }]
      topProducts: json("topProducts"),
      // [{ name, quantity, revenue }]
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
        { mode: "virtual" }
      ),
      createdAt: timestamp("createdAt").defaultNow().notNull()
    }, (t2) => [
      uniqueIndex("shifts_open_unique").on(t2.openKey)
    ]);
    lockerItems = mysqlTable("lockerItems", {
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
      status: mysqlEnum("status", ["pendiente", "guardado", "retirado"]).default("pendiente").notNull(),
      chargedAt: timestamp("chargedAt").defaultNow().notNull(),
      // Se pisan en cada ciclo -- siempre reflejan el último "Recibido"/
      // "Entregado", no un historial completo (igual que kitchenTickets con
      // approvedAt/deliveredAt).
      receivedAt: timestamp("receivedAt"),
      receivedByOperatorId: int("receivedByOperatorId"),
      retrievedAt: timestamp("retrievedAt"),
      retrievedByOperatorId: int("retrievedByOperatorId")
    }, (t2) => [
      uniqueIndex("lockerItems_event_tag_unique").on(t2.eventId, t2.tagNumber)
    ]);
    kitchenTickets = mysqlTable("kitchenTickets", {
      id: int("id").autoincrement().primaryKey(),
      eventId: int("eventId").notNull(),
      orderId: int("orderId").notNull(),
      opId: varchar("opId", { length: 64 }).notNull(),
      registerId: int("registerId"),
      ticketNumber: varchar("ticketNumber", { length: 12 }).notNull(),
      status: mysqlEnum("status", ["pendiente", "aprobado", "entregado"]).default("pendiente").notNull(),
      items: json("items").notNull(),
      // [{ name, quantity }]
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
      deliveredByOperatorId: int("deliveredByOperatorId")
    }, (t2) => [
      uniqueIndex("kitchenTickets_event_number_unique").on(t2.eventId, t2.ticketNumber)
    ]);
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
    }, (t2) => [
      // La tabla no tenía ningún índice pese a que awardPlaycoins consulta por
      // (opId, reason) y (orderId, reason) en cada compra, y deleteOrderCascade
      // por orderId. Son índices, no restricciones únicas: acá la idempotencia
      // sigue siendo el SELECT previo de awardPlaycoins (ver prepaidLedger, que
      // por ser plata sí la apoya en el motor).
      index("playcoins_ledger_customer_idx").on(t2.customerId, t2.createdAt),
      index("playcoins_ledger_order_idx").on(t2.orderId),
      index("playcoins_ledger_op_idx").on(t2.opId)
    ]);
    prepaidLedger = mysqlTable("prepaidLedger", {
      id: int("id").autoincrement().primaryKey(),
      customerId: int("customerId").notNull(),
      delta: int("delta").notNull(),
      // + carga, - gasto/ajuste
      reason: mysqlEnum("reason", [
        "topup_web",
        // compró el extra "Cargar saldo" en el checkout web
        "spend_caja",
        // pagó una venta presencial con saldo
        "spend_puerta",
        // pagó el estacionamiento en la puerta con saldo
        "refund",
        // devolución por una orden anulada
        "manual_adjust"
        // corrección del admin (nunca lleva orderId, ver abajo)
      ]).notNull(),
      orderId: int("orderId"),
      // orden que originó el movimiento (si aplica)
      opId: varchar("opId", { length: 36 }),
      // op de caja/puerta; null para web
      balanceAfter: int("balanceAfter").notNull(),
      note: text("note"),
      // motivo libre en ajustes manuales del admin
      createdAt: timestamp("createdAt").defaultNow().notNull()
    }, (t2) => [
      // En MySQL/TiDB varias filas con NULL no chocan entre sí en un índice único,
      // así que estas dos restricciones solo aplican donde hay clave real: las
      // cargas web (orderId, sin opId) y los gastos de terminal (opId, sin orderId).
      // Reenviar la misma op encolada offline, o reprocesar el mismo webhook de
      // Mercado Pago, choca contra el motor en vez de depender de un chequeo previo
      // no atómico.
      // Ojo al escribir `manual_adjust`: no debe llevar orderId (igual que
      // adjustPlaycoinsManually, que tampoco lo setea), o dos correcciones sobre la
      // misma orden chocarían contra prepaid_ledger_order_reason_unique.
      uniqueIndex("prepaid_ledger_op_reason_unique").on(t2.opId, t2.reason),
      uniqueIndex("prepaid_ledger_order_reason_unique").on(t2.orderId, t2.reason),
      index("prepaid_ledger_customer_idx").on(t2.customerId, t2.createdAt)
    ]);
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
      // 'cancelled' = el admin la frenó a mano antes de que el cron terminara
      // de drenar todos los destinatarios `pending` -- esas filas de
      // `mailingRecipients` quedan huérfanas sin más acción (el cron ya
      // filtra por `status = 'sending'`, ver getPendingMailingRecipients).
      status: mysqlEnum("status", ["sending", "done", "cancelled"]).default("sending").notNull(),
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
    mailingSendLog = mysqlTable("mailingSendLog", {
      id: int("id").autoincrement().primaryKey(),
      // nanoid: agrupa las filas de una misma corrida de sendMailingBatch().
      batchId: varchar("batchId", { length: 30 }).notNull(),
      source: mysqlEnum("source", ["founders-promo", "manual"]).notNull(),
      // content.subject de esa tanda -- para mostrar de qué se trató sin tener
      // que ir a buscar contenido a otro lado.
      label: varchar("label", { length: 255 }).notNull(),
      customerId: int("customerId").notNull(),
      // Denormalizado a propósito: es un log histórico, no hace falta join.
      email: varchar("email", { length: 255 }).notNull(),
      success: int("success").notNull(),
      reason: varchar("reason", { length: 500 }),
      sentAt: timestamp("sentAt").defaultNow().notNull()
    }, (table) => ({
      batchIdx: index("mailing_send_log_batch_idx").on(table.batchId),
      sentAtIdx: index("mailing_send_log_sent_at_idx").on(table.sentAt)
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
    adminWebauthnCredentials = mysqlTable("adminWebauthnCredentials", {
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
      lastUsedAt: timestamp("lastUsedAt")
    });
    expenses = mysqlTable("expenses", {
      id: int("id").autoincrement().primaryKey(),
      // 'evento' = gasto atribuible a UNA fiesta (decoración, DJ, hielo).
      // 'general' = gasto de la empresa (apps, contador, bodega) que se PRORRATEA
      // entre los eventos del mes según cuánto ingreso hizo cada uno.
      scope: mysqlEnum("scope", ["evento", "general"]).notNull(),
      eventId: int("eventId"),
      // solo cuando scope='evento'
      // Mes calendario en hora de Chile ("2026-08"), congelado con monthKeyFor()
      // en el servidor al guardar. Se llena SIEMPRE (también en gastos de evento)
      // para que agrupar por mes no dependa de la zona horaria del runtime: TiDB
      // corre en UTC, y una compra de las 22:00 del 31 en Chile ya es día 1 allá.
      periodMonth: varchar("periodMonth", { length: 7 }).notNull(),
      // Fecha real del gasto/documento, que no es la fecha de carga: la boleta del
      // sábado se sube el lunes.
      expenseDate: timestamp("expenseDate").notNull(),
      category: mysqlEnum("category", [
        "decoracion",
        "barra",
        "merch",
        "staff",
        "produccion",
        "arriendo",
        "marketing",
        "transporte",
        "suscripciones",
        "comisiones",
        "otros"
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
      // Gasto general que NO se reparte entre eventos (una multa, un gasto
      // personal del socio): entra al resumen del mes pero no ensucia el margen
      // de ninguna fiesta.
      prorate: int("prorate").default(1).notNull(),
      receiptUrl: text("receiptUrl"),
      notes: varchar("notes", { length: 500 }),
      createdByUserId: int("createdByUserId"),
      createdAt: timestamp("createdAt").defaultNow().notNull(),
      updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull()
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
      recurringEventUnique: uniqueIndex("expenses_recurring_event_unique").on(table.recurringParentId, table.eventId)
    }));
    pushSubscriptions = mysqlTable("pushSubscriptions", {
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
      createdAt: timestamp("createdAt").defaultNow().notNull()
    });
    partyPushSubscriptions = mysqlTable("partyPushSubscriptions", {
      id: int("id").autoincrement().primaryKey(),
      profileId: int("profileId").notNull(),
      eventId: int("eventId").notNull(),
      endpoint: varchar("endpoint", { length: 512 }).notNull().unique(),
      p256dh: varchar("p256dh", { length: 255 }).notNull(),
      auth: varchar("auth", { length: 255 }).notNull(),
      createdAt: timestamp("createdAt").defaultNow().notNull()
    }, (table) => ({
      eventIdx: index("party_push_subscriptions_event_idx").on(table.eventId),
      profileIdx: index("party_push_subscriptions_profile_idx").on(table.profileId)
    }));
  }
});

// server/caja/ops.ts
var ops_exports = {};
__export(ops_exports, {
  applyOp: () => applyOp,
  friendlySyncErrorMessage: () => friendlySyncErrorMessage
});
import { eq as eq3 } from "drizzle-orm";
async function applyOp(db, params, mutate) {
  const [existing] = await db.select().from(ops).where(eq3(ops.id, params.id)).limit(1);
  if (existing) return { result: existing.result, conflictNote: existing.conflictNote ?? void 0 };
  const { result, conflictNote } = await mutate();
  try {
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
  } catch (err) {
    const [raceWinner] = await db.select().from(ops).where(eq3(ops.id, params.id)).limit(1);
    if (raceWinner) return { result: raceWinner.result, conflictNote: raceWinner.conflictNote ?? void 0 };
    throw err;
  }
  return { result, conflictNote };
}
function friendlySyncErrorMessage(err, opId) {
  const message = err instanceof Error ? err.message : String(err);
  if (message.startsWith("Failed query")) {
    console.error(`[sync] op ${opId} rechazado por un error inesperado:`, err);
    return "No se pudo procesar en el servidor";
  }
  return message || "Error al sincronizar";
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
var ADMIN_NOTIFICATION_EMAIL = "contacto@mansionplayroom.cl";
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
import { eq as eq4, desc, and as and3, sql as sql2, or, gt, gte, lte, like, inArray as inArray2, isNull as isNull2, ne } from "drizzle-orm";
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
  // pisa BUILT_IN_FORGE_*, que siguen usando llm/notification.
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
function personasForTicket(groupSize, accesoSlug) {
  return groupSize ?? personasForAccesoSlug(accesoSlug);
}
function depositUnitsForAccesoSlug(accesoSlug) {
  if (!accesoSlug) return 1;
  return ACCESO_DEPOSIT_UNITS[accesoSlug] ?? personasForAccesoSlug(accesoSlug);
}
var CHILE_FIXED_OFFSET_MS = 4 * 60 * 60 * 1e3;
function missionCutoff(eventDate) {
  const chileWallClock = new Date(eventDate.getTime() - CHILE_FIXED_OFFSET_MS);
  const cutoffDayUTC = Date.UTC(
    chileWallClock.getUTCFullYear(),
    chileWallClock.getUTCMonth(),
    chileWallClock.getUTCDate() - (MISSION_300_CUTOFF_DAYS - 1),
    23,
    59,
    59,
    999
  );
  return new Date(cutoffDayUTC + CHILE_FIXED_OFFSET_MS);
}
function isMissionWindowOpen(eventDate, now = /* @__PURE__ */ new Date()) {
  return now.getTime() < missionCutoff(eventDate).getTime();
}
function isMissionActiveForEvent(event, now = /* @__PURE__ */ new Date()) {
  if (event.missionForceClosed) return false;
  return isMissionWindowOpen(new Date(event.eventDate), now);
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

// shared/chileDate.ts
var CHILE_TZ = "America/Santiago";
function formatChileDate(date, opts = {}) {
  const d = date instanceof Date ? date : new Date(date);
  return d.toLocaleDateString("es-CL", {
    ...opts.withWeekday === false ? {} : { weekday: "long" },
    day: "numeric",
    month: "long",
    ...opts.withYear ? { year: "numeric" } : {},
    timeZone: CHILE_TZ
  });
}
function formatChileTime(date) {
  const d = date instanceof Date ? date : new Date(date);
  return d.toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: CHILE_TZ });
}
function formatChileDateTime(date) {
  const d = date instanceof Date ? date : new Date(date);
  return d.toLocaleString("es-CL", { timeZone: CHILE_TZ });
}
function chileHourOf(date) {
  const d = typeof date === "string" ? new Date(date) : date;
  const hour = new Intl.DateTimeFormat("en-US", {
    timeZone: CHILE_TZ,
    hour: "numeric",
    hour12: false
  }).format(d);
  return Number(hour) % 24;
}
function startOfChileDay(now = /* @__PURE__ */ new Date()) {
  const dayFmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: CHILE_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
  const [y, m, d] = dayFmt.format(now).split("-").map(Number);
  for (const offsetHours of [4, 3]) {
    const candidate = new Date(Date.UTC(y, m - 1, d, offsetHours, 0, 0));
    if (chileHourOf(candidate) === 0 && dayFmt.format(candidate) === dayFmt.format(now)) {
      return candidate;
    }
  }
  return new Date(Date.UTC(y, m - 1, d, 3, 0, 0));
}

// server/leadsMailing.ts
init_schema();
import { eq, and, isNull, inArray } from "drizzle-orm";
var LEADS_MAILING_TAG = "leads";
async function addTag(db, customerId, tag) {
  const [customer] = await db.select().from(customers).where(eq(customers.id, customerId)).limit(1);
  if (!customer) return;
  const tags = Array.isArray(customer.tags) ? customer.tags : [];
  if (tags.includes(tag)) return;
  await db.update(customers).set({ tags: [...tags, tag] }).where(eq(customers.id, customerId));
}
async function removeTag(db, customerId, tag) {
  const [customer] = await db.select().from(customers).where(eq(customers.id, customerId)).limit(1);
  if (!customer) return;
  const tags = Array.isArray(customer.tags) ? customer.tags : [];
  await db.update(customers).set({ tags: tags.filter((t2) => t2 !== tag) }).where(eq(customers.id, customerId));
}
async function matchLeadForOrder(db, order) {
  if (!order.buyerEmail) return;
  const email = order.buyerEmail.trim().toLowerCase();
  const openLeads = await db.select({ id: leads.id }).from(leads).where(and(eq(leads.email, email), isNull(leads.convertedOrderId)));
  if (openLeads.length === 0) return;
  for (const l of openLeads) {
    await db.update(leads).set({ convertedOrderId: order.id }).where(eq(leads.id, l.id));
  }
  const [customer] = await db.select({ id: customers.id }).from(customers).where(eq(customers.email, email)).limit(1);
  if (customer) await removeTag(db, customer.id, LEADS_MAILING_TAG);
}
async function syncLeadsAsMailingAudience(db, filter = {}) {
  const conditions = [isNull(leads.convertedOrderId)];
  if (filter.eventId) conditions.push(eq(leads.eventId, filter.eventId));
  const openLeads = await db.select().from(leads).where(and(...conditions));
  const customerIds = [];
  for (const l of openLeads) {
    const [existing] = await db.select().from(customers).where(eq(customers.email, l.email)).limit(1);
    let customerId;
    if (existing) {
      customerId = existing.id;
    } else {
      const [result] = await db.insert(customers).values({
        email: l.email,
        phone: l.phone ?? null,
        instagram: l.instagram ?? null,
        tags: []
      });
      customerId = result.insertId;
    }
    await addTag(db, customerId, LEADS_MAILING_TAG);
    customerIds.push(customerId);
  }
  if (customerIds.length === 0) return [];
  return db.select().from(customers).where(inArray(customers.id, customerIds));
}

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

// shared/tandaSchedule.ts
var DEFAULT_TANDA_SCHEDULE = [
  { percent: 60 },
  { percent: 50 },
  { percent: 40 },
  { percent: 30 },
  { percent: 0 }
];
function computePhasePrice(originalPrice, discountPercent) {
  if (!Number.isFinite(originalPrice) || originalPrice <= 0) return 0;
  const raw = originalPrice * (1 - discountPercent / 100);
  return Math.round(raw / 1e3) * 1e3;
}
function normalizeTandaSchedule(raw) {
  if (!Array.isArray(raw) || raw.length === 0) return DEFAULT_TANDA_SCHEDULE;
  return raw.map(
    (x) => typeof x === "number" ? { percent: x } : { percent: Number(x?.percent ?? 0), untilDate: x?.untilDate ?? null }
  );
}
function nextPhase(currentPhaseIndex, schedule = DEFAULT_TANDA_SCHEDULE) {
  const nextIndex = currentPhaseIndex + 1;
  if (nextIndex >= schedule.length) return null;
  return { index: nextIndex, phase: schedule[nextIndex] };
}

// server/tandaAutoAdvance.ts
import { eq as eq2, and as and2 } from "drizzle-orm";
init_schema();
async function checkAndAdvanceTandaIfNeeded(eventId) {
  try {
    const db = await getDb();
    if (!db) return { advanced: false };
    const [event] = await db.select().from(events).where(eq2(events.id, eventId)).limit(1);
    if (!event) return { advanced: false };
    const schedule = normalizeTandaSchedule(event.tandaDiscountSchedule);
    const currentPhase = schedule[event.tandaPhaseIndex];
    const next = nextPhase(event.tandaPhaseIndex, schedule);
    if (!currentPhase || !next) return { advanced: false };
    const activos = await db.select().from(ticketTypes).where(and2(
      eq2(ticketTypes.eventId, eventId),
      eq2(ticketTypes.category, "acceso"),
      eq2(ticketTypes.status, "active")
    ));
    if (activos.length === 0) return { advanced: false };
    let reason = null;
    if (currentPhase.untilDate && new Date(currentPhase.untilDate).getTime() <= Date.now()) {
      reason = "date";
    }
    if (!reason) {
      const poolIds = Array.from(new Set(activos.map((a) => a.stockPoolId).filter((id) => id != null)));
      if (poolIds.length === 1) {
        const info = await getStockPoolRemaining(poolIds[0]);
        if (info && info.remaining <= 0) reason = "stock";
      }
    }
    if (!reason) return { advanced: false };
    const rows = activos.map((tt) => ({
      oldTicketTypeId: tt.id,
      newPrice: tt.originalPrice ? computePhasePrice(Number(tt.originalPrice), next.phase.percent) : Number(tt.price),
      newTotalStock: 999999,
      newStockPoolId: null
    }));
    await advanceTanda(eventId, rows);
    return { advanced: true, reason };
  } catch (err) {
    console.error("[tandaAutoAdvance] checkAndAdvanceTandaIfNeeded fall\xF3", err);
    return { advanced: false };
  }
}

// shared/expenses.ts
var EXPENSE_CATEGORIES = [
  { value: "produccion", label: "Producci\xF3n", emoji: "\u{1F39B}\uFE0F" },
  { value: "barra", label: "Barra", emoji: "\u{1F378}" },
  { value: "staff", label: "Staff", emoji: "\u{1F9D1}\u200D\u{1F91D}\u200D\u{1F9D1}" },
  { value: "decoracion", label: "Decoraci\xF3n", emoji: "\u{1F388}" },
  { value: "arriendo", label: "Arriendo", emoji: "\u{1F3E0}" },
  { value: "marketing", label: "Marketing", emoji: "\u{1F4E3}" },
  { value: "transporte", label: "Transporte", emoji: "\u{1F69A}" },
  { value: "merch", label: "Merch", emoji: "\u{1F455}" },
  { value: "suscripciones", label: "Apps y suscripciones", emoji: "\u{1F501}" },
  { value: "comisiones", label: "Comisiones", emoji: "\u{1F3E6}" },
  { value: "otros", label: "Otros", emoji: "\u{1F4E6}" }
];
function categoryLabel(value) {
  return EXPENSE_CATEGORIES.find((c) => c.value === value)?.label ?? value;
}
function ivaFromGross(gross) {
  return Math.round(gross * 19 / 119);
}
function givesCreditoFiscal(e) {
  return e.documentType === "factura" && !e.ivaExempt;
}
function deriveAmounts(input) {
  if (!givesCreditoFiscal(input)) {
    return { netAmount: input.amountTotal, ivaAmount: 0 };
  }
  const ivaAmount = ivaFromGross(input.amountTotal);
  return { netAmount: input.amountTotal - ivaAmount, ivaAmount };
}
function expenseCostForPnl(expense, ivaApplies) {
  if (ivaApplies && givesCreditoFiscal(expense)) return expense.netAmount;
  return expense.amountTotal;
}
function debitoFiscalFromIncome(grossIncome) {
  return ivaFromGross(grossIncome);
}
function cashCollectedFromOrders(rows) {
  let sum = 0;
  for (const o of rows) {
    sum += Number(o.total);
    if (o.missionTopupStatus === "paid") sum += Number(o.missionTopupAmount ?? 0);
  }
  return sum;
}
function prorationWeights(incomes) {
  const weights = /* @__PURE__ */ new Map();
  if (incomes.length === 0) return weights;
  const total = incomes.reduce((s, e) => s + e.grossIncome, 0);
  if (total <= 0) {
    for (const e of incomes) weights.set(e.eventId, 1 / incomes.length);
    return weights;
  }
  for (const e of incomes) weights.set(e.eventId, e.grossIncome / total);
  return weights;
}
function computePnl(input) {
  const { ivaApplies, grossIncome, cogs, ambassadorCommissions: ambassadorCommissions2, prorationWeight } = input;
  const cardFeeBase = input.cardFeeBase ?? 0;
  const cardFeePercent = input.cardFeePercent ?? 0;
  const cardFeeAmount = Math.round(cardFeeBase * cardFeePercent / 100);
  let directExpensesTotal = 0;
  const byCategory = /* @__PURE__ */ new Map();
  for (const e of input.directExpenses) {
    const cost = expenseCostForPnl(e, ivaApplies);
    directExpensesTotal += cost;
    byCategory.set(e.category, (byCategory.get(e.category) ?? 0) + cost);
  }
  let generalMonthTotal = 0;
  for (const e of input.generalExpenses) {
    generalMonthTotal += expenseCostForPnl(e, ivaApplies);
  }
  const generalAssigned = Math.round(generalMonthTotal * prorationWeight);
  let debitoFiscal = 0;
  let creditoFiscal = 0;
  if (ivaApplies) {
    debitoFiscal = debitoFiscalFromIncome(grossIncome);
    const creditoDirecto = input.directExpenses.filter((e) => givesCreditoFiscal(e)).reduce((s, e) => s + e.ivaAmount, 0);
    const creditoGeneralMes = input.generalExpenses.filter((e) => givesCreditoFiscal(e)).reduce((s, e) => s + e.ivaAmount, 0);
    creditoFiscal = creditoDirecto + Math.round(creditoGeneralMes * prorationWeight);
  }
  const ivaAPagar = Math.max(0, debitoFiscal - creditoFiscal);
  const remanenteCredito = Math.max(0, creditoFiscal - debitoFiscal);
  const netIncome = ivaApplies ? grossIncome - debitoFiscal : grossIncome;
  const netProfit = netIncome - cogs - directExpensesTotal - generalAssigned - ambassadorCommissions2 - cardFeeAmount;
  return {
    grossIncome,
    cogs,
    directExpensesTotal,
    directByCategory: Array.from(byCategory.entries()).map(([category, amount]) => ({ category, amount })).sort((a, b) => b.amount - a.amount),
    generalExpensesMonthTotal: generalMonthTotal,
    generalExpensesAssigned: generalAssigned,
    prorationWeight,
    ambassadorCommissions: ambassadorCommissions2,
    cardFeeBase,
    cardFeePercent,
    cardFeeAmount,
    iva: { debitoFiscal, creditoFiscal, ivaAPagar, remanenteCredito },
    netIncome,
    netProfit,
    marginPercent: netIncome > 0 ? Math.round(netProfit / netIncome * 1e3) / 10 : null
  };
}

// shared/parking.ts
function isParkingTicketType(name) {
  return /estacionamiento|parking/i.test(name) && !/vip/i.test(name);
}
var PLACEHOLDER_BUYER_EMAILS = /* @__PURE__ */ new Set(["invitacion@mansionplayroom.cl", "caja@mansionplayroom.cl"]);
function classifyParkingOrigin(row) {
  if (row.orderPaymentId?.startsWith("PUERTA-PARKING-")) return "puerta";
  if (row.orderPaymentMethod === "Manual: Invitaci\xF3n") return "staff";
  return "online";
}
function summarizeParkingCounts(origins) {
  let online = 0, puerta = 0, staff = 0;
  for (const o of origins) {
    if (o === "online") online++;
    else if (o === "puerta") puerta++;
    else staff++;
  }
  return { online, puerta, staff, totalPaid: online + puerta, totalCars: online + puerta + staff };
}

// shared/rut.ts
function normalizeRut(rutInput) {
  return rutInput.trim().replace(/[.\s]/g, "").toUpperCase();
}

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

// server/caja/shiftMath.ts
function filterShiftSales(sales, shift) {
  const from = shift.openedAt.getTime();
  const to = shift.closedAt.getTime();
  return sales.filter((s) => {
    const at = s.createdAt.getTime();
    if (at < from || at > to) return false;
    return shift.registerId ? s.registerId === shift.registerId : s.registerId == null;
  });
}
function computeExpectedTotals(sales, cashPaidOut = 0) {
  const totals = { expectedCash: 0, expectedDebit: 0, expectedCredit: 0, expectedQr: 0 };
  for (const s of sales) {
    const amount = Number(s.total);
    if (!Number.isFinite(amount)) continue;
    if (s.paymentMethod === "efectivo") totals.expectedCash += amount;
    else if (s.paymentMethod === "debito") totals.expectedDebit += amount;
    else if (s.paymentMethod === "credito") totals.expectedCredit += amount;
    else if (s.paymentMethod === "qr") totals.expectedQr += amount;
  }
  totals.expectedCash -= cashPaidOut;
  return totals;
}
function shiftCashDiff(countedCash, expectedCash, openingCash) {
  return countedCash - expectedCash - openingCash;
}
function expectedCashWithOpening(expectedCash, openingCash) {
  return expectedCash + openingCash;
}
function findPossibleDuplicateSales(sales, windowSeconds = 90) {
  const groups = /* @__PURE__ */ new Map();
  for (const s of sales) {
    const key = `${Number(s.total)}|${s.paymentMethod ?? ""}`;
    const list = groups.get(key) ?? [];
    list.push(s);
    groups.set(key, list);
  }
  const out = [];
  for (const list of Array.from(groups.values())) {
    const ordered = [...list].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    let run = [];
    const flush = () => {
      if (run.length > 1) {
        out.push({
          total: Number(run[0].total),
          paymentMethod: run[0].paymentMethod,
          count: run.length,
          firstAt: run[0].createdAt,
          lastAt: run[run.length - 1].createdAt
        });
      }
      run = [];
    };
    for (const s of ordered) {
      if (run.length === 0) {
        run = [s];
        continue;
      }
      const gap = (s.createdAt.getTime() - run[run.length - 1].createdAt.getTime()) / 1e3;
      if (gap <= windowSeconds) run.push(s);
      else {
        flush();
        run = [s];
      }
    }
    flush();
  }
  return out.sort((a, b) => b.total * (b.count - 1) - a.total * (a.count - 1));
}
function cardTotals(r) {
  const counted = r.countedDebit + r.countedCredit;
  const expected = r.expectedDebit + r.expectedCredit;
  return { counted, expected, diff: counted - expected };
}
function cardSplitLooksUnreliable(r) {
  return r.expectedCredit === 0 && r.countedCredit > 0 || r.expectedDebit === 0 && r.countedDebit > 0;
}

// server/caja/auth.ts
import { randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { SignJWT, jwtVerify } from "jose";
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
  return new SignJWT({ operatorId: payload.operatorId, role: payload.role, name: payload.name }).setProtectedHeader({ alg: "HS256", typ: "JWT" }).setExpirationTime(expirationSeconds).sign(getSecret());
}
async function verifyOperatorSession(cookieValue) {
  if (!cookieValue) return null;
  try {
    const { payload } = await jwtVerify(cookieValue, getSecret(), { algorithms: ["HS256"] });
    const { operatorId, role, name } = payload;
    if (typeof operatorId !== "number" || typeof role !== "string" || typeof name !== "string") return null;
    return { operatorId, role, name };
  } catch {
    return null;
  }
}

// shared/prepaid.ts
function isTopupProduct(product) {
  const amount = product.topupAmount;
  return typeof amount === "number" && Number.isFinite(amount) && amount > 0;
}
function topupChargeForLines(lines) {
  return lines.reduce(
    (sum, line) => isTopupProduct(line) ? sum + line.unitPrice * line.quantity : sum,
    0
  );
}
function topupCreditForLines(lines) {
  return lines.reduce(
    (sum, line) => isTopupProduct(line) ? sum + line.topupAmount * line.quantity : sum,
    0
  );
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
function resetDb() {
  const stale = _db;
  _db = null;
  if (stale) {
    try {
      stale.$client.end?.(() => {
      });
    } catch {
    }
  }
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
  const result = await db.select().from(users).where(eq4(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : void 0;
}
async function getPublishedEvents() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(events).where(or(eq4(events.status, "published"), eq4(events.status, "past"), eq4(events.status, "soldout"))).orderBy(desc(events.eventDate));
}
async function getAllEvents() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(events).orderBy(desc(events.eventDate));
}
async function getHomeEvents() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(events).where(or(eq4(events.status, "published"), eq4(events.status, "past"), eq4(events.status, "soldout"))).orderBy(events.eventDate);
}
async function getEventBySlug(slug) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(events).where(eq4(events.slug, slug)).limit(1);
  return result[0] ?? null;
}
async function getEventById(id) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(events).where(eq4(events.id, id)).limit(1);
  return result[0] ?? null;
}
async function getFeaturedEvent() {
  const db = await getDb();
  if (!db) return void 0;
  const result = await db.select().from(events).where(eq4(events.status, "published")).orderBy(desc(events.featured), events.eventDate).limit(1);
  return result[0];
}
async function getOrCreateCajaTestEvent() {
  const db = await getDb();
  if (!db) return null;
  const existing = await getEventBySlug("pruebas-caja");
  if (existing) return existing;
  await db.insert(events).values({
    title: "\u{1F9EA} Pruebas de Caja (no borrar)",
    slug: "pruebas-caja",
    status: "draft",
    eventDate: /* @__PURE__ */ new Date()
  });
  const created = await getEventBySlug("pruebas-caja");
  if (created) {
    const closest = (await getAllEvents()).find((e) => e.id !== created.id);
    if (closest) await copyCartaBetweenEvents(closest.id, created.id);
  }
  return created;
}
async function createEvent(data) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const eventDate = new Date(data.eventDate);
  const doorsOpen = data.doorsOpen ? new Date(data.doorsOpen) : void 0;
  const eventEnd = data.eventEnd ? new Date(data.eventEnd) : void 0;
  await db.insert(events).values({
    ...data,
    eventDate,
    doorsOpen,
    eventEnd,
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
  if (data.eventEnd) updateData.eventEnd = new Date(data.eventEnd);
  await db.update(events).set(updateData).where(eq4(events.id, id));
  return { success: true };
}
async function deleteEvent(id) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(expenses).set({ scope: "general", eventId: null }).where(eq4(expenses.eventId, id));
  await db.delete(events).where(eq4(events.id, id));
  return { success: true };
}
async function ensureDefaultExtraTicketTypes(eventId, existing) {
  const hasAcceso = existing.some((tt) => tt.category === "acceso");
  const hasExtra = existing.some((tt) => tt.category === "extra");
  if (!hasAcceso || hasExtra) return false;
  const db = await getDb();
  if (!db) return false;
  await db.insert(ticketTypes).values([
    { eventId, name: "Estacionamiento", category: "extra", price: "5000", totalStock: 999999, status: "active" },
    { eventId, name: "Piscol\xF3n", category: "extra", price: "5000", totalStock: 999999, status: "active" }
  ]);
  return true;
}
async function getTicketTypesByEventId(eventId) {
  const db = await getDb();
  if (!db) return [];
  const existing = await db.select().from(ticketTypes).where(eq4(ticketTypes.eventId, eventId)).orderBy(ticketTypes.sortOrder);
  const created = await ensureDefaultExtraTicketTypes(eventId, existing);
  const rows = created ? await db.select().from(ticketTypes).where(eq4(ticketTypes.eventId, eventId)).orderBy(ticketTypes.sortOrder) : existing;
  return attachStockPoolInfo(rows);
}
async function attachStockPoolInfo(rows) {
  const poolIds = Array.from(new Set(rows.map((r) => r.stockPoolId).filter((id) => id != null)));
  if (poolIds.length === 0) return rows.map((r) => ({ ...r, poolRemaining: null, poolTotalCap: null }));
  const poolInfoById = /* @__PURE__ */ new Map();
  await Promise.all(poolIds.map(async (id) => {
    const info = await getStockPoolRemaining(id);
    if (info) poolInfoById.set(id, { remaining: info.remaining, totalCap: info.pool.totalCap });
  }));
  return rows.map((r) => {
    const info = r.stockPoolId != null ? poolInfoById.get(r.stockPoolId) : void 0;
    return { ...r, poolRemaining: info?.remaining ?? null, poolTotalCap: info?.totalCap ?? null };
  });
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
async function copyCartaBetweenEvents(fromEventId, toEventId) {
  const source = await getTicketTypesByEventId(fromEventId);
  const toCopy = source.filter((t2) => ["consumo", "locker", "merch"].includes(t2.category));
  for (const t2 of toCopy) {
    await createTicketType({
      eventId: toEventId,
      name: t2.name,
      category: t2.category,
      description: t2.description ?? void 0,
      price: Number(t2.price),
      originalPrice: t2.originalPrice != null ? Number(t2.originalPrice) : void 0,
      totalStock: t2.totalStock,
      costPrice: t2.costPrice != null ? Number(t2.costPrice) : void 0,
      color: t2.color ?? void 0,
      internalCode: t2.internalCode ?? void 0,
      emoji: t2.emoji ?? void 0,
      groupName: t2.groupName ?? void 0,
      toKitchen: t2.toKitchen ?? void 0,
      sortOrder: t2.sortOrder ?? void 0,
      status: "active",
      stockPoolId: null
    });
  }
  return toCopy.length;
}
async function updateTicketType(id, data, changedByUserId, changedByOperatorId) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const updateData = { ...data };
  if (data.price !== void 0) updateData.price = String(data.price);
  if (data.originalPrice !== void 0) updateData.originalPrice = String(data.originalPrice);
  if (data.costPrice !== void 0) updateData.costPrice = String(data.costPrice);
  if (data.totalStock !== void 0) {
    const [current] = await db.select({ totalStock: ticketTypes.totalStock, eventId: ticketTypes.eventId }).from(ticketTypes).where(eq4(ticketTypes.id, id)).limit(1);
    if (current && current.totalStock !== data.totalStock) {
      await db.insert(ticketStockHistory).values({
        ticketTypeId: id,
        eventId: current.eventId,
        previousStock: current.totalStock,
        newStock: data.totalStock,
        changedByUserId: changedByUserId ?? null,
        changedByOperatorId: changedByOperatorId ?? null
      });
    }
  }
  await db.update(ticketTypes).set(updateData).where(eq4(ticketTypes.id, id));
  return { success: true };
}
async function getTicketStockHistory(ticketTypeId) {
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
    changedByOperatorName: operators.name
  }).from(ticketStockHistory).leftJoin(users, eq4(users.id, ticketStockHistory.changedByUserId)).leftJoin(operators, eq4(operators.id, ticketStockHistory.changedByOperatorId)).where(eq4(ticketStockHistory.ticketTypeId, ticketTypeId)).orderBy(desc(ticketStockHistory.createdAt));
  return rows;
}
async function deleteTicketType(id) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(ticketTypes).where(eq4(ticketTypes.id, id));
  return { success: true };
}
async function advanceTanda(eventId, rows) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [event] = await db.select().from(events).where(eq4(events.id, eventId)).limit(1);
  if (!event) throw new Error("Evento no encontrado");
  const schedule = normalizeTandaSchedule(event.tandaDiscountSchedule);
  const next = nextPhase(event.tandaPhaseIndex, schedule);
  let count = 0;
  for (const row of rows) {
    const [old] = await db.select().from(ticketTypes).where(eq4(ticketTypes.id, row.oldTicketTypeId)).limit(1);
    if (!old || old.eventId !== eventId) continue;
    await db.update(ticketTypes).set({ status: "soldout" }).where(eq4(ticketTypes.id, row.oldTicketTypeId));
    await db.insert(ticketTypes).values({
      eventId,
      name: old.name,
      accesoSlug: old.accesoSlug,
      category: old.category,
      description: old.description,
      price: String(row.newPrice),
      originalPrice: old.originalPrice ?? void 0,
      totalStock: row.newTotalStock,
      maxPerOrder: old.maxPerOrder,
      sortOrder: old.sortOrder,
      status: "active",
      stockPoolId: row.newStockPoolId ?? null
    });
    count++;
  }
  if (next) {
    await db.update(events).set({ tandaPhaseIndex: next.index }).where(eq4(events.id, eventId));
  }
  return { success: true, count, newPhaseIndex: next ? next.index : event.tandaPhaseIndex };
}
async function getStockPoolsByEventId(eventId) {
  const db = await getDb();
  if (!db) return [];
  const pools = await db.select().from(stockPools).where(eq4(stockPools.eventId, eventId)).orderBy(desc(stockPools.createdAt));
  return Promise.all(pools.map(async (pool) => {
    const info = await getStockPoolRemaining(pool.id);
    return { ...pool, sold: info?.sold ?? 0, remaining: info?.remaining ?? pool.totalCap };
  }));
}
async function createStockPool(data) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(stockPools).values(data);
  return { success: true };
}
async function updateStockPool(id, data) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(stockPools).set(data).where(eq4(stockPools.id, id));
  return { success: true };
}
async function deleteStockPool(id) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [inUse] = await db.select({ id: ticketTypes.id }).from(ticketTypes).where(eq4(ticketTypes.stockPoolId, id)).limit(1);
  if (inUse) throw new Error("Este cupo compartido todav\xEDa tiene accesos asignados -- desas\xEDgnalos antes de borrarlo.");
  await db.delete(stockPools).where(eq4(stockPools.id, id));
  return { success: true };
}
async function getStockPoolRemaining(poolId) {
  const db = await getDb();
  if (!db) return null;
  const [pool] = await db.select().from(stockPools).where(eq4(stockPools.id, poolId)).limit(1);
  if (!pool) return null;
  const [row] = await db.select({ sold: sql2`coalesce(sum(${ticketTypes.soldCount}), 0)` }).from(ticketTypes).where(eq4(ticketTypes.stockPoolId, poolId));
  const sold = Number(row?.sold ?? 0);
  return { pool, remaining: Math.max(0, pool.totalCap - sold), sold };
}
function validateStockPoolCapacity(items, ticketTypesForEvent, poolRemainingById) {
  const poolRequested = /* @__PURE__ */ new Map();
  for (const item of items) {
    const tt = ticketTypesForEvent.find((t2) => t2.id === item.ticketTypeId);
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
async function getTicketByCode(ticketCode) {
  const db = await getDb();
  if (!db) return null;
  const [ticket] = await db.select().from(tickets).where(eq4(tickets.ticketCode, ticketCode)).limit(1);
  if (!ticket) return null;
  const [order] = await db.select().from(orders).where(eq4(orders.id, ticket.orderId)).limit(1);
  const [event] = await db.select().from(events).where(eq4(events.id, ticket.eventId)).limit(1);
  const [ticketType] = await db.select().from(ticketTypes).where(eq4(ticketTypes.id, ticket.ticketTypeId)).limit(1);
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
  const orderTickets = await db.select().from(tickets).where(eq4(tickets.orderId, orderId));
  const grouped = /* @__PURE__ */ new Map();
  for (const t2 of orderTickets) {
    const [tt] = await db.select().from(ticketTypes).where(eq4(ticketTypes.id, t2.ticketTypeId)).limit(1);
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
  const result = await db.select().from(discountCodes).where(eq4(discountCodes.code, code.trim().toUpperCase())).limit(1);
  if (result.length === 0) return { valid: false, message: "C\xF3digo no encontrado" };
  const discount = result[0];
  if (!discount.isActive) return { valid: false, message: "C\xF3digo inactivo" };
  if (discount.maxUses && discount.usedCount >= discount.maxUses) return { valid: false, message: "C\xF3digo agotado" };
  if (discount.validUntil && new Date(discount.validUntil) < /* @__PURE__ */ new Date()) return { valid: false, message: "C\xF3digo expirado" };
  if (discount.validFrom && new Date(discount.validFrom) > /* @__PURE__ */ new Date()) return { valid: false, message: "C\xF3digo a\xFAn no v\xE1lido" };
  if (discount.eventId && discount.eventId !== eventId) return { valid: false, message: "C\xF3digo no v\xE1lido para este evento" };
  return { valid: true, discount };
}
async function getActiveFlashPromo(eventId) {
  const db = await getDb();
  if (!db) return null;
  const now = /* @__PURE__ */ new Date();
  const rows = await db.select().from(discountCodes).where(and3(
    eq4(discountCodes.eventId, eventId),
    eq4(discountCodes.isActive, 1),
    sql2`${discountCodes.applicableTicketTypeIds} is not null`,
    gt(discountCodes.validUntil, now)
  )).orderBy(desc(discountCodes.validUntil)).limit(1);
  const promo = rows[0];
  if (!promo) return null;
  return {
    code: promo.code,
    ticketTypeIds: promo.applicableTicketTypeIds ?? [],
    discountType: promo.discountType,
    discountValue: Number(promo.discountValue),
    expiresAt: promo.validUntil,
    message: promo.description ?? ""
  };
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
async function deleteDiscountCode(id) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(discountCodes).where(eq4(discountCodes.id, id));
  return { success: true };
}
async function validateCommunityCode(code) {
  const db = await getDb();
  if (!db) return { valid: false, message: "Service unavailable" };
  const result = await db.select().from(communityCodes).where(eq4(communityCodes.code, code.trim().toUpperCase())).limit(1);
  if (result.length === 0) return { valid: false, message: "C\xF3digo no encontrado" };
  const entry = result[0];
  if (!entry.isActive) return { valid: false, message: "C\xF3digo inactivo" };
  if (entry.maxUses && entry.usedCount >= entry.maxUses) return { valid: false, message: "C\xF3digo agotado" };
  return { valid: true, communityCode: entry };
}
async function markCommunityCodeUsed(id) {
  const db = await getDb();
  if (!db) return;
  await db.update(communityCodes).set({ usedCount: sql2`usedCount + 1` }).where(eq4(communityCodes.id, id));
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
  await db.update(communityCodes).set(data).where(eq4(communityCodes.id, id));
  return { success: true };
}
async function deleteCommunityCode(id) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(communityCodes).where(eq4(communityCodes.id, id));
  return { success: true };
}
async function createLead(data) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const email = data.email.trim().toLowerCase();
  const values = { ...data, email, source: data.source ?? "price_alert" };
  await db.insert(leads).values(values).onDuplicateKeyUpdate({
    set: { phone: values.phone, instagram: values.instagram, source: values.source }
  });
  return { success: true };
}
async function getAllLeads() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(leads).orderBy(desc(leads.createdAt));
}
async function deleteLead(id) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(leads).where(eq4(leads.id, id));
  return { success: true };
}
async function matchLeadForOrder2(order) {
  try {
    const db = await getDb();
    if (!db) return;
    await matchLeadForOrder(db, order);
  } catch (err) {
    console.warn("[leads] no se pudo marcar como convertido", order.id, err);
  }
}
async function syncLeadsAsMailingAudience2(filter = {}) {
  const db = await getDb();
  if (!db) return [];
  return syncLeadsAsMailingAudience(db, filter);
}
async function getAllBlockedCustomers() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(blockedCustomers).orderBy(desc(blockedCustomers.createdAt));
}
async function createBlockedCustomer(data) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(blockedCustomers).values({ ...data, rut: normalizeRut(data.rut) });
  return { success: true };
}
async function updateBlockedCustomer(id, data) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const updateData = data.rut ? { ...data, rut: normalizeRut(data.rut) } : data;
  await db.update(blockedCustomers).set(updateData).where(eq4(blockedCustomers.id, id));
  return { success: true };
}
async function deleteBlockedCustomer(id) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(blockedCustomers).where(eq4(blockedCustomers.id, id));
  return { success: true };
}
var SITE_SETTINGS_DEFAULTS = { instagramFollowers: 0, instagramPosts: 0, serviceFeePercent: "0", cardFeePercent: "3.50", parkingVenueFeeClp: 3e3, kitchenVendorName: null, kitchenVendorEmail: null, ogImageUrl: null, foundersPromoEnabled: 0, emailTemplateConfig: null };
async function getSiteSettings() {
  const db = await getDb();
  if (!db) return SITE_SETTINGS_DEFAULTS;
  const [row] = await db.select().from(siteSettings).limit(1);
  if (row) return row;
  return SITE_SETTINGS_DEFAULTS;
}
async function updateSiteSettings(data) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const updateData = { ...data };
  if (data.serviceFeePercent !== void 0) updateData.serviceFeePercent = String(data.serviceFeePercent);
  if (data.cardFeePercent !== void 0) updateData.cardFeePercent = String(data.cardFeePercent);
  if (data.foundersPromoEnabled !== void 0) updateData.foundersPromoEnabled = data.foundersPromoEnabled ? 1 : 0;
  const [row] = await db.select().from(siteSettings).limit(1);
  if (row) {
    await db.update(siteSettings).set(updateData).where(eq4(siteSettings.id, row.id));
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
function parseAttendeeRuts(attendeeDataJson) {
  if (!attendeeDataJson) return [];
  try {
    const parsed = JSON.parse(attendeeDataJson);
    const campos = parsed?.campos ?? {};
    const ruts = [];
    for (const [key, value] of Object.entries(campos)) {
      if (typeof value === "string" && value.trim() && /rut/i.test(key)) {
        ruts.push(normalizeRut(value));
      }
    }
    return ruts;
  } catch {
    return [];
  }
}
function parseAttendees(attendeeDataJson) {
  if (!attendeeDataJson) return [];
  try {
    const parsed = JSON.parse(attendeeDataJson);
    const campos = parsed?.campos ?? {};
    const bySlot = /* @__PURE__ */ new Map();
    const order = [];
    for (const [key, value] of Object.entries(campos)) {
      if (typeof value !== "string" || !value.trim()) continue;
      const m = key.match(/^(.*)_(nombre|rut)$/i);
      if (!m) continue;
      const [, slot, field] = m;
      if (!bySlot.has(slot)) {
        bySlot.set(slot, {});
        order.push(slot);
      }
      const entry = bySlot.get(slot);
      if (field.toLowerCase() === "nombre") entry.name = value.trim();
      else entry.rut = normalizeRut(value);
    }
    return order.map((slot) => bySlot.get(slot)).filter((e) => !!e.name).map((e) => ({ name: e.name, rut: e.rut ?? null }));
  } catch {
    return [];
  }
}
function parseBuyerRut(attendeeDataJson) {
  if (!attendeeDataJson) return null;
  try {
    const parsed = JSON.parse(attendeeDataJson);
    const value = parsed?.campos?.["buyer__rut"];
    return typeof value === "string" && value.trim() ? value.trim() : null;
  } catch {
    return null;
  }
}
async function createOrder(input) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const event = await getEventBySlug(input.eventSlug);
  if (!event) throw new Error("Event not found");
  const attendeeRuts = parseAttendeeRuts(input.attendeeData);
  if (attendeeRuts.length > 0) {
    const blocked = await db.select().from(blockedCustomers).where(and3(inArray2(blockedCustomers.rut, attendeeRuts), eq4(blockedCustomers.isActive, 1)));
    if (blocked.length > 0) {
      throw new Error("No pudimos procesar tu compra. Si crees que es un error, escr\xEDbenos.");
    }
  }
  const missionOpen = isMissionActiveForEvent(event);
  let missionDeposit = false;
  const tts = await getTicketTypesByEventId(event.id);
  let subtotal = 0;
  let accesoSubtotal = 0;
  const unitPrices = /* @__PURE__ */ new Map();
  for (const item of input.items) {
    const tt = tts.find((t2) => t2.id === item.ticketTypeId);
    if (!tt) throw new Error(`Ticket type ${item.ticketTypeId} not found`);
    if (tt.status !== "active") throw new Error(`${tt.name} ya no est\xE1 disponible a este precio -- actualiz\xE1 la p\xE1gina e intent\xE1 de nuevo.`);
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
  const poolIdsInOrder = Array.from(new Set(
    input.items.map((i) => tts.find((t2) => t2.id === i.ticketTypeId)?.stockPoolId).filter((id) => id != null)
  ));
  const poolRemainingById = /* @__PURE__ */ new Map();
  for (const poolId of poolIdsInOrder) {
    const info = await getStockPoolRemaining(poolId);
    if (info) poolRemainingById.set(poolId, { remaining: info.remaining, name: info.pool.name });
  }
  validateStockPoolCapacity(input.items, tts, poolRemainingById);
  let discountAmount = 0;
  let discountCodeId;
  if (input.discountCode) {
    const validation = await validateDiscountCode(input.discountCode, event.id);
    if (validation.valid && validation.discount) {
      const disc = validation.discount;
      discountCodeId = disc.id;
      const scopeIds = disc.applicableTicketTypeIds;
      const eligibleSubtotal = scopeIds && scopeIds.length > 0 ? input.items.filter((item) => tts.find((t2) => t2.id === item.ticketTypeId)?.category === "acceso" && scopeIds.includes(item.ticketTypeId)).reduce((sum, item) => sum + (unitPrices.get(item.ticketTypeId) ?? 0) * item.quantity, 0) : accesoSubtotal;
      if (disc.discountType === "percentage") {
        discountAmount = Math.round(eligibleSubtotal * Number(disc.discountValue) / 100);
      } else {
        discountAmount = Math.min(Number(disc.discountValue), eligibleSubtotal);
      }
      await db.update(discountCodes).set({ usedCount: sql2`usedCount + 1` }).where(eq4(discountCodes.id, disc.id));
    }
  }
  if (input.communityCode) {
    const validation = await validateCommunityCode(input.communityCode);
    if (!validation.valid) throw new Error(validation.message || "C\xF3digo de comunidad inv\xE1lido");
    if (validation.communityCode) await markCommunityCodeUsed(validation.communityCode.id);
  }
  const topupCharge = topupChargeForLines(input.items.map((i) => ({
    unitPrice: unitPrices.get(i.ticketTypeId),
    quantity: i.quantity,
    topupAmount: tts.find((t2) => t2.id === i.ticketTypeId)?.topupAmount
  })));
  const preTotal = Math.max(0, subtotal - discountAmount);
  const feeBase = Math.max(0, preTotal - topupCharge);
  const settings = await getSiteSettings();
  const serviceFeePercent = Number(settings.serviceFeePercent ?? 0);
  const serviceFee = serviceFeePercent > 0 ? Math.round(feeBase * serviceFeePercent / 100) : 0;
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
    attendeeData: input.attendeeData,
    utmSource: input.utmSource,
    utmMedium: input.utmMedium,
    utmCampaign: input.utmCampaign,
    utmContent: input.utmContent
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
    }).where(eq4(orders.id, orderId));
    for (const item of input.items) {
      await db.update(ticketTypes).set({ soldCount: sql2`soldCount + ${item.quantity}` }).where(eq4(ticketTypes.id, item.ticketTypeId));
    }
    await checkAndAdvanceTandaIfNeeded(event.id);
  }
  return { orderId, orderNumber, total, isFree };
}
async function getSalesByUtmOrigin(eventId) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [eq4(orders.paymentStatus, "approved"), eq4(orders.channel, "web")];
  if (eventId) conditions.push(eq4(orders.eventId, eventId));
  const rows = await db.select({
    utmSource: orders.utmSource,
    utmMedium: orders.utmMedium,
    utmCampaign: orders.utmCampaign,
    ordersCount: sql2`count(*)`,
    revenue: sql2`sum(${orders.total})`
  }).from(orders).where(and3(...conditions)).groupBy(orders.utmSource, orders.utmMedium, orders.utmCampaign).orderBy(desc(sql2`sum(${orders.total})`));
  return rows.map((r) => ({
    utmSource: r.utmSource ?? "(sin UTM)",
    utmMedium: r.utmMedium ?? null,
    utmCampaign: r.utmCampaign ?? null,
    ordersCount: Number(r.ordersCount),
    revenue: Number(r.revenue ?? 0)
  }));
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
    await db.update(ticketTypes).set({ soldCount: sql2`soldCount + ${item.quantity}` }).where(eq4(ticketTypes.id, item.ticketTypeId));
  }
  return { orderId, orderNumber, total };
}
var ADMIN_PLACEHOLDER_EMAIL = "invitacion@mansionplayroom.cl";
async function getOrCreateInstantInviteTicketType(eventId) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [existing] = await db.select().from(ticketTypes).where(and3(eq4(ticketTypes.eventId, eventId), eq4(ticketTypes.name, "Invitaci\xF3n Especial"))).limit(1);
  if (existing) return existing;
  const [result] = await db.insert(ticketTypes).values({
    eventId,
    name: "Invitaci\xF3n Especial",
    category: "acceso",
    accesoSlug: null,
    price: "0",
    totalStock: 999999,
    status: "hidden",
    emoji: "\u{1F39F}\uFE0F"
  });
  const [created] = await db.select().from(ticketTypes).where(eq4(ticketTypes.id, result.insertId)).limit(1);
  return created;
}
async function createInstantInvite({ eventSlug, personas }) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const event = await getEventBySlug(eventSlug);
  if (!event) throw new Error("Event not found");
  const tt = await getOrCreateInstantInviteTicketType(event.id);
  const orderNumber = `MP-${Date.now().toString(36).toUpperCase()}-${nanoid(4).toUpperCase()}`;
  const [orderResult] = await db.insert(orders).values({
    orderNumber,
    buyerName: "Invitaci\xF3n especial",
    buyerEmail: ADMIN_PLACEHOLDER_EMAIL,
    eventId: event.id,
    subtotal: "0",
    discount: "0",
    serviceFee: "0",
    total: "0",
    paymentStatus: "approved",
    paymentId: `MANUAL-${orderNumber}`,
    paymentMethod: "Manual: Invitaci\xF3n especial"
  });
  const orderId = orderResult.insertId;
  const [itemResult] = await db.insert(orderItems).values({
    orderId,
    ticketTypeId: tt.id,
    quantity: personas,
    unitPrice: "0",
    totalPrice: "0"
  });
  await db.update(ticketTypes).set({ soldCount: sql2`soldCount + ${personas}` }).where(eq4(ticketTypes.id, tt.id));
  const ticketCode = `MP-${nanoid(12).toUpperCase()}`;
  const { qrData, qrImageUrl } = await generateTicketQR(ticketCode, event.title);
  await db.insert(tickets).values({
    ticketCode,
    orderId,
    orderItemId: itemResult.insertId,
    eventId: event.id,
    ticketTypeId: tt.id,
    holderName: "Invitaci\xF3n especial",
    qrData,
    qrImageUrl,
    status: "valid",
    groupSize: personas
  });
  return { ticketCode, qrImageUrl, personas };
}
async function createStaffComp({ eventSlug, ticketTypeId, quantity, staffName }) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const event = await getEventBySlug(eventSlug);
  if (!event) throw new Error("Event not found");
  const [tt] = await db.select().from(ticketTypes).where(eq4(ticketTypes.id, ticketTypeId)).limit(1);
  if (!tt || tt.eventId !== event.id) throw new Error("Ese producto no existe en este evento");
  if (!["consumo", "locker", "merch"].includes(tt.category)) throw new Error("Elige un producto de la Carta de la Fiesta");
  const orderNumber = `MP-${Date.now().toString(36).toUpperCase()}-${nanoid(4).toUpperCase()}`;
  const [orderResult] = await db.insert(orders).values({
    orderNumber,
    buyerName: staffName,
    buyerEmail: ADMIN_PLACEHOLDER_EMAIL,
    eventId: event.id,
    subtotal: "0",
    discount: "0",
    serviceFee: "0",
    total: "0",
    paymentStatus: "approved",
    paymentId: `MANUAL-${orderNumber}`,
    paymentMethod: "Manual: Consumo Staff"
  });
  const orderId = orderResult.insertId;
  const [itemResult] = await db.insert(orderItems).values({
    orderId,
    ticketTypeId: tt.id,
    quantity,
    unitPrice: "0",
    totalPrice: "0"
  });
  await db.update(ticketTypes).set({ soldCount: sql2`soldCount + ${quantity}` }).where(eq4(ticketTypes.id, tt.id));
  const prefix = tt.internalCode || fallbackInternalCode(tt.name);
  const displayCodes = [];
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
      status: "valid",
      displayCode
    });
    displayCodes.push(displayCode);
  }
  return { displayCodes, productName: tt.name };
}
async function listStaffComps(eventId) {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.select({
    ticketCode: tickets.ticketCode,
    displayCode: tickets.displayCode,
    status: tickets.status,
    staffName: tickets.holderName,
    createdAt: tickets.createdAt,
    productName: ticketTypes.name
  }).from(tickets).innerJoin(orders, eq4(orders.id, tickets.orderId)).innerJoin(ticketTypes, eq4(ticketTypes.id, tickets.ticketTypeId)).where(and3(eq4(orders.eventId, eventId), eq4(orders.paymentMethod, "Manual: Consumo Staff"))).orderBy(desc(tickets.createdAt));
  return rows;
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
  }).from(orders).leftJoin(events, eq4(orders.eventId, events.id)).where(like(orders.paymentMethod, "Manual: %")).orderBy(desc(orders.createdAt));
}
async function getAllOrders(page = 1, limit = 50, status, channel, eventId) {
  const db = await getDb();
  if (!db) return { orders: [], total: 0 };
  const offset = (page - 1) * limit;
  const conditions = [];
  if (status) conditions.push(eq4(orders.paymentStatus, status));
  if (channel === "caja") conditions.push(eq4(orders.channel, "caja"));
  else if (channel === "web") conditions.push(sql2`${orders.channel} != 'caja'`);
  if (eventId) conditions.push(eq4(orders.eventId, eventId));
  const query = db.select().from(orders).where(conditions.length ? and3(...conditions) : void 0).orderBy(desc(orders.createdAt)).limit(limit).offset(offset);
  const allOrders = await query;
  const orderIds = allOrders.map((o) => o.id);
  const extrasByOrderId = /* @__PURE__ */ new Map();
  if (orderIds.length > 0) {
    const extraItems = await db.select({
      orderId: orderItems.orderId,
      name: ticketTypes.name,
      quantity: orderItems.quantity
    }).from(orderItems).innerJoin(ticketTypes, eq4(orderItems.ticketTypeId, ticketTypes.id)).where(and3(inArray2(orderItems.orderId, orderIds), eq4(ticketTypes.category, "extra")));
    for (const item of extraItems) {
      const list = extrasByOrderId.get(item.orderId) ?? [];
      list.push({ name: item.name, quantity: item.quantity });
      extrasByOrderId.set(item.orderId, list);
    }
  }
  const ordersWithExtras = allOrders.map((o) => ({ ...o, extras: extrasByOrderId.get(o.id) ?? [] }));
  return { orders: ordersWithExtras, total: ordersWithExtras.length };
}
async function getOrderTickets(orderId) {
  const db = await getDb();
  if (!db) return [];
  const orderTickets = await db.select().from(tickets).where(eq4(tickets.orderId, orderId));
  const result = [];
  for (const t2 of orderTickets) {
    const [tt] = await db.select().from(ticketTypes).where(eq4(ticketTypes.id, t2.ticketTypeId)).limit(1);
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
function computeOrderDeleteEffects(order, ledgerEntries, prepaidLedgerEntries = []) {
  return {
    decrementSoldCount: order.paymentStatus === "approved" || order.paymentStatus === "refunded",
    decrementCustomerTotals: order.channel === "web" && order.paymentStatus === "approved",
    playcoinsReversals: ledgerEntries.filter((e) => e.delta !== 0).map((e) => ({ customerId: e.customerId, delta: -e.delta })),
    prepaidReversals: prepaidLedgerEntries.filter((e) => e.delta !== 0).map((e) => ({ customerId: e.customerId, delta: -e.delta }))
  };
}
async function getOrderById(orderId) {
  const db = await getDb();
  if (!db) return null;
  const [order] = await db.select().from(orders).where(eq4(orders.id, orderId)).limit(1);
  return order ?? null;
}
async function deleteOrderCascade(orderId) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [order] = await db.select().from(orders).where(eq4(orders.id, orderId)).limit(1);
  if (!order) return { success: true };
  const ledgerEntries = await db.select().from(playcoinsLedger).where(eq4(playcoinsLedger.orderId, orderId));
  const prepaidEntries = await db.select().from(prepaidLedger).where(eq4(prepaidLedger.orderId, orderId));
  const effects = computeOrderDeleteEffects(order, ledgerEntries, prepaidEntries);
  if (effects.decrementSoldCount) {
    const items = await db.select().from(orderItems).where(eq4(orderItems.orderId, orderId));
    for (const item of items) {
      await db.update(ticketTypes).set({ soldCount: sql2`GREATEST(soldCount - ${item.quantity}, 0)` }).where(eq4(ticketTypes.id, item.ticketTypeId));
    }
  }
  for (const reversal of effects.playcoinsReversals) {
    await adjustPlaycoinsManually(reversal.customerId, reversal.delta, `Orden #${order.orderNumber} eliminada`);
  }
  for (const reversal of effects.prepaidReversals) {
    await reversePrepaidForDeletedOrder(reversal.customerId, reversal.delta, order.id, order.orderNumber);
  }
  if (effects.decrementCustomerTotals) {
    const email = order.buyerEmail.trim().toLowerCase();
    const [customer] = await db.select().from(customers).where(eq4(customers.email, email)).limit(1);
    if (customer) {
      await db.update(customers).set({
        totalOrders: Math.max(0, customer.totalOrders - 1),
        totalSpent: String(Math.max(0, Number(customer.totalSpent) - Number(order.total)))
      }).where(eq4(customers.id, customer.id));
    }
  }
  await db.delete(orderItems).where(eq4(orderItems.orderId, orderId));
  await db.delete(tickets).where(eq4(tickets.orderId, orderId));
  await db.delete(referrals).where(eq4(referrals.orderId, orderId));
  await db.delete(ambassadorCommissions).where(eq4(ambassadorCommissions.orderId, orderId));
  await db.delete(ambassadorClients).where(eq4(ambassadorClients.firstOrderId, orderId));
  await db.delete(orders).where(eq4(orders.id, orderId));
  return { success: true };
}
async function resetEventTestData(eventId) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [closedShift] = await db.select({ id: shifts.id }).from(shifts).where(and3(eq4(shifts.eventId, eventId), eq4(shifts.status, "closed"))).limit(1);
  if (closedShift) {
    throw new Error(
      "Este evento ya tiene un cierre de caja guardado, as\xED que sus ventas no son de prueba. Si de verdad quieres reiniciarlo, elimina primero el cierre de turno desde Gastos y P&L."
    );
  }
  const cajaOrders = await db.select({ id: orders.id }).from(orders).where(and3(eq4(orders.eventId, eventId), eq4(orders.channel, "caja")));
  const orderIds = cajaOrders.map((o) => o.id);
  await db.delete(kitchenTickets).where(eq4(kitchenTickets.eventId, eventId));
  await db.delete(lockerItems).where(eq4(lockerItems.eventId, eventId));
  for (const id of orderIds) {
    await deleteOrderCascade(id);
  }
  await db.delete(shifts).where(eq4(shifts.eventId, eventId));
  await db.update(ticketTypes).set({ soldCount: 0, status: "active" }).where(and3(eq4(ticketTypes.eventId, eventId), inArray2(ticketTypes.category, ["consumo", "locker", "merch"])));
  return { ordersDeleted: orderIds.length, opsPreserved: true };
}
async function getOrdersForExport(filters) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [];
  if (filters.eventId) conditions.push(eq4(orders.eventId, filters.eventId));
  if (filters.status) conditions.push(eq4(orders.paymentStatus, filters.status));
  if (filters.dateFrom) conditions.push(gte(orders.createdAt, new Date(filters.dateFrom)));
  if (filters.dateTo) conditions.push(lte(orders.createdAt, new Date(filters.dateTo)));
  if (filters.channel === "caja") conditions.push(eq4(orders.channel, "caja"));
  else if (filters.channel === "web") conditions.push(sql2`${orders.channel} != 'caja'`);
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
  }).from(orders).leftJoin(events, eq4(orders.eventId, events.id)).where(conditions.length ? and3(...conditions) : void 0).orderBy(desc(orders.createdAt));
  return rows;
}
async function getOrderStats(channel, eventId) {
  const db = await getDb();
  if (!db) return { totalOrders: 0, totalRevenue: 0, approvedOrders: 0 };
  const conditions = [];
  if (channel === "caja") conditions.push(eq4(orders.channel, "caja"));
  else if (channel === "web") conditions.push(sql2`${orders.channel} != 'caja'`);
  if (eventId) conditions.push(eq4(orders.eventId, eventId));
  const where = conditions.length > 0 ? and3(...conditions) : void 0;
  const [stats] = await db.select({
    totalOrders: sql2`COUNT(*)`,
    totalRevenue: sql2`COALESCE(SUM(CASE WHEN paymentStatus = 'approved' THEN total ELSE 0 END), 0)`,
    approvedOrders: sql2`SUM(CASE WHEN paymentStatus = 'approved' THEN 1 ELSE 0 END)`
  }).from(orders).where(where);
  return stats;
}
async function getAdminBadgeCounts(seenAt) {
  const empty = {
    "orders-web": 0,
    "orders-caja": 0,
    "leads": 0,
    "customers": 0,
    "referrals": 0,
    "ambassadors": 0,
    "denuncias": 0,
    "party-gifts": 0,
    "caja": 0
  };
  const db = await getDb();
  if (!db) return empty;
  const countRows = async (rows) => {
    const [row] = await rows;
    return Number(row?.n ?? 0);
  };
  const since = (s) => seenAt[s];
  const [ordersWeb, ordersCaja, newLeads, newCustomers, newReferrals, pendingApplications, openReports, unclaimedGifts, openShifts] = await Promise.all([
    // Mismo criterio de canal que `getOrderStats`: "web" es todo lo que no es
    // caja (incluye las importadas). Solo aprobadas -- una orden pendiente o
    // rechazada no es una venta que valga la pena avisar.
    since("orders-web") ? countRows(db.select({ n: sql2`COUNT(*)` }).from(orders).where(and3(sql2`${orders.channel} != 'caja'`, eq4(orders.paymentStatus, "approved"), gt(orders.createdAt, since("orders-web"))))) : 0,
    since("orders-caja") ? countRows(db.select({ n: sql2`COUNT(*)` }).from(orders).where(and3(eq4(orders.channel, "caja"), gt(orders.createdAt, since("orders-caja"))))) : 0,
    since("leads") ? countRows(db.select({ n: sql2`COUNT(*)` }).from(leads).where(gt(leads.createdAt, since("leads")))) : 0,
    since("customers") ? countRows(db.select({ n: sql2`COUNT(*)` }).from(customers).where(gt(customers.createdAt, since("customers")))) : 0,
    since("referrals") ? countRows(db.select({ n: sql2`COUNT(*)` }).from(referrals).where(gt(referrals.createdAt, since("referrals")))) : 0,
    // Pendientes de acción, sin `seenAt`:
    countRows(db.select({ n: sql2`COUNT(*)` }).from(ambassadorApplications).where(eq4(ambassadorApplications.status, "pendiente"))),
    countRows(db.select({ n: sql2`COUNT(*)` }).from(partyReports).where(isNull2(partyReports.resolvedAt))),
    // Tragos ya cobrados que nadie retiró: plata que se debe en la barra.
    countRows(db.select({ n: sql2`COUNT(*)` }).from(partyGifts).where(eq4(partyGifts.status, "paid"))),
    countRows(db.select({ n: sql2`COUNT(*)` }).from(shifts).where(eq4(shifts.status, "open")))
  ]);
  return {
    "orders-web": ordersWeb,
    "orders-caja": ordersCaja,
    "leads": newLeads,
    "customers": newCustomers,
    "referrals": newReferrals,
    "ambassadors": pendingApplications,
    "denuncias": openReports,
    "party-gifts": unclaimedGifts,
    "caja": openShifts
  };
}
async function getNewWebRevenue(since) {
  const db = await getDb();
  if (!db) return 0;
  const [row] = await db.select({ total: sql2`COALESCE(SUM(total), 0)` }).from(orders).where(and3(sql2`${orders.channel} != 'caja'`, eq4(orders.paymentStatus, "approved"), gt(orders.createdAt, since)));
  return Number(row?.total ?? 0);
}
async function savePushSubscription(data) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(pushSubscriptions).values(data).onDuplicateKeyUpdate({
    set: { p256dh: data.p256dh, auth: data.auth, label: data.label }
  });
  return { success: true };
}
async function deletePushSubscription(endpoint) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(pushSubscriptions).where(eq4(pushSubscriptions.endpoint, endpoint));
  return { success: true };
}
async function listPushSubscriptions() {
  const db = await getDb();
  if (!db) return [];
  return db.select({
    id: pushSubscriptions.id,
    label: pushSubscriptions.label,
    createdAt: pushSubscriptions.createdAt
  }).from(pushSubscriptions).orderBy(desc(pushSubscriptions.createdAt));
}
async function deletePushSubscriptionById(id) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(pushSubscriptions).where(eq4(pushSubscriptions.id, id));
  return { success: true };
}
async function getReferralStats() {
  const db = await getDb();
  if (!db) return [];
  return db.select({
    ambassadorCode: referrals.ambassadorCode,
    ambassadorUserId: referrals.ambassadorUserId,
    totalReferrals: sql2`COUNT(*)`,
    totalTickets: sql2`SUM(ticketCount)`,
    totalRevenue: sql2`SUM(orderTotal)`
  }).from(referrals).groupBy(referrals.ambassadorCode, referrals.ambassadorUserId);
}
async function getReferralLeaderboard(eventId) {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.select({
    ambassadorCode: referrals.ambassadorCode,
    totalReferrals: sql2`COUNT(*)`,
    lastReferralAt: sql2`MAX(${referrals.createdAt})`
  }).from(referrals).innerJoin(orders, eq4(orders.id, referrals.orderId)).where(eq4(orders.eventId, eventId)).groupBy(referrals.ambassadorCode).orderBy(desc(sql2`COUNT(*)`));
  const leaderboard = [];
  for (const row of rows) {
    const [owner] = await db.select().from(orders).where(and3(eq4(orders.ambassadorCode, row.ambassadorCode), eq4(orders.paymentStatus, "approved"))).limit(1);
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
  const [owner] = await db.select().from(orders).where(and3(eq4(orders.ambassadorCode, code), eq4(orders.paymentStatus, "approved"))).limit(1);
  if (!owner) return null;
  const rows = await db.select().from(referrals).where(eq4(referrals.ambassadorCode, code)).orderBy(desc(referrals.createdAt));
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
  const [existing] = await db.select({ id: exclusiveAmbassadors.id }).from(exclusiveAmbassadors).where(eq4(exclusiveAmbassadors.code, code)).limit(1);
  if (existing) throw new Error(`El c\xF3digo ${code} ya est\xE1 en uso por otro embajador`);
  try {
    await db.insert(exclusiveAmbassadors).values({
      eventId: data.eventId ?? null,
      name: data.name,
      code,
      commissionPercent: data.commissionPercent === null || data.commissionPercent === void 0 ? null : String(data.commissionPercent),
      contact: data.contact,
      email: data.email ? data.email.trim().toLowerCase() : null,
      instagram: data.instagram
    });
  } catch (err) {
    throw new Error(err?.cause?.message ?? err.message);
  }
  return { success: true };
}
async function listExclusiveAmbassadors(eventId) {
  const db = await getDb();
  if (!db) return [];
  const conditions = eventId ? [eq4(exclusiveAmbassadors.eventId, eventId)] : [];
  return db.select().from(exclusiveAmbassadors).where(conditions.length ? and3(...conditions) : void 0).orderBy(exclusiveAmbassadors.name);
}
async function updateExclusiveAmbassador(id, data) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const updateData = { ...data };
  if (data.code !== void 0) {
    const code = data.code.trim().toUpperCase();
    const [clash] = await db.select({ id: exclusiveAmbassadors.id }).from(exclusiveAmbassadors).where(and3(eq4(exclusiveAmbassadors.code, code), ne(exclusiveAmbassadors.id, id))).limit(1);
    if (clash) throw new Error(`El c\xF3digo ${code} ya est\xE1 en uso por otro embajador`);
    updateData.code = code;
  }
  if (data.commissionPercent !== void 0) {
    updateData.commissionPercent = data.commissionPercent === null ? null : String(data.commissionPercent);
  }
  if (data.email !== void 0) updateData.email = data.email ? data.email.trim().toLowerCase() : null;
  try {
    await db.update(exclusiveAmbassadors).set(updateData).where(eq4(exclusiveAmbassadors.id, id));
  } catch (err) {
    throw new Error(err?.cause?.message ?? err.message);
  }
  return { success: true };
}
async function deleteExclusiveAmbassador(id) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(ambassadorClients).where(eq4(ambassadorClients.ambassadorId, id));
  await db.delete(exclusiveAmbassadors).where(eq4(exclusiveAmbassadors.id, id));
  return { success: true };
}
async function getActiveExclusiveAmbassadorByCode(code) {
  const db = await getDb();
  if (!db) return null;
  const [row] = await db.select().from(exclusiveAmbassadors).where(and3(
    eq4(exclusiveAmbassadors.code, code.trim().toUpperCase()),
    eq4(exclusiveAmbassadors.active, 1)
  )).limit(1);
  return row ?? null;
}
async function getCustomerForAttribution(buyerEmail) {
  const db = await getDb();
  if (!db || !buyerEmail) return null;
  const email = buyerEmail.trim().toLowerCase();
  const [row] = await db.select({ firstSeenAt: customers.firstSeenAt, totalOrders: customers.totalOrders }).from(customers).where(eq4(customers.email, email)).limit(1);
  return row ?? null;
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
  const result = await db.select().from(operators).where(eq4(operators.id, id)).limit(1);
  return result.length > 0 ? result[0] : void 0;
}
async function listActiveOperatorsPublic(eventId) {
  const db = await getDb();
  if (!db) return [];
  return db.select({ id: operators.id, name: operators.name, role: operators.role }).from(operators).where(and3(eq4(operators.active, 1), eq4(operators.eventId, eventId))).orderBy(operators.name);
}
async function listAllOperators(eventId) {
  const db = await getDb();
  if (!db) return [];
  return db.select({ id: operators.id, name: operators.name, role: operators.role, active: operators.active, email: operators.email, createdAt: operators.createdAt }).from(operators).where(eq4(operators.eventId, eventId)).orderBy(desc(operators.createdAt));
}
async function updateOperator(id, input) {
  const db = await getDb();
  if (!db) return;
  await db.update(operators).set(input).where(eq4(operators.id, id));
}
async function operatorHasHistory(id) {
  const db = await getDb();
  if (!db) return true;
  const checks = await Promise.all([
    db.select({ id: orders.id }).from(orders).where(eq4(orders.operatorId, id)).limit(1),
    db.select({ id: ops.id }).from(ops).where(eq4(ops.operatorId, id)).limit(1),
    db.select({ id: shifts.id }).from(shifts).where(or(eq4(shifts.operatorId, id), eq4(shifts.closedByOperatorId, id))).limit(1),
    db.select({ id: tickets.id }).from(tickets).where(eq4(tickets.usedByOperatorId, id)).limit(1),
    db.select({ id: lockerItems.id }).from(lockerItems).where(or(eq4(lockerItems.receivedByOperatorId, id), eq4(lockerItems.retrievedByOperatorId, id))).limit(1),
    db.select({ id: kitchenTickets.id }).from(kitchenTickets).where(or(eq4(kitchenTickets.approvedByOperatorId, id), eq4(kitchenTickets.deliveredByOperatorId, id))).limit(1),
    db.select({ id: ticketStockHistory.id }).from(ticketStockHistory).where(eq4(ticketStockHistory.changedByOperatorId, id)).limit(1)
  ]);
  return checks.some((rows) => rows.length > 0);
}
async function deleteOperator(id) {
  if (await operatorHasHistory(id)) {
    throw new Error("Este operador ya tiene historial de ventas, turnos o canjes \u2014 desact\xEDvalo en vez de eliminarlo.");
  }
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(operators).where(eq4(operators.id, id));
  return { success: true };
}
var PIN_MAX_ATTEMPTS = 5;
var PIN_LOCKOUT_MS = 5 * 60 * 1e3;
async function recordFailedPinAttempt(operatorId) {
  const db = await getDb();
  if (!db) return;
  const [operator] = await db.select().from(operators).where(eq4(operators.id, operatorId)).limit(1);
  if (!operator) return;
  const attempts = operator.failedPinAttempts + 1;
  await db.update(operators).set({
    failedPinAttempts: attempts,
    lockedUntil: attempts >= PIN_MAX_ATTEMPTS ? new Date(Date.now() + PIN_LOCKOUT_MS) : operator.lockedUntil
  }).where(eq4(operators.id, operatorId));
}
async function resetPinAttempts(operatorId) {
  const db = await getDb();
  if (!db) return;
  await db.update(operators).set({ failedPinAttempts: 0, lockedUntil: null }).where(eq4(operators.id, operatorId));
}
var IP_RATE_LIMIT_MAX_ATTEMPTS = 15;
var IP_RATE_LIMIT_LOCKOUT_MS = 15 * 60 * 1e3;
async function checkIpRateLimit(key) {
  const db = await getDb();
  if (!db) return true;
  const [row] = await db.select().from(rateLimits).where(eq4(rateLimits.key, key)).limit(1);
  if (!row?.lockedUntil) return true;
  return new Date(row.lockedUntil).getTime() <= Date.now();
}
async function recordIpFailedAttempt(key) {
  const db = await getDb();
  if (!db) return;
  const [row] = await db.select().from(rateLimits).where(eq4(rateLimits.key, key)).limit(1);
  const attempts = (row?.attempts ?? 0) + 1;
  const lockedUntil = attempts >= IP_RATE_LIMIT_MAX_ATTEMPTS ? new Date(Date.now() + IP_RATE_LIMIT_LOCKOUT_MS) : row?.lockedUntil ?? null;
  await db.insert(rateLimits).values({ key, attempts, lockedUntil }).onDuplicateKeyUpdate({ set: { attempts, lockedUntil } });
}
async function recordIpAttempt(key, maxAttempts, lockoutMs) {
  const db = await getDb();
  if (!db) return;
  const [row] = await db.select().from(rateLimits).where(eq4(rateLimits.key, key)).limit(1);
  const previoVencido = row?.lockedUntil ? new Date(row.lockedUntil).getTime() <= Date.now() : false;
  const attempts = previoVencido ? 1 : (row?.attempts ?? 0) + 1;
  const lockedUntil = attempts >= maxAttempts ? new Date(Date.now() + lockoutMs) : null;
  await db.insert(rateLimits).values({ key, attempts, lockedUntil }).onDuplicateKeyUpdate({ set: { attempts, lockedUntil } });
}
async function createDeviceEnrollment(eventId, name, enrollCode, enrollCodeExpiresAt) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [result] = await db.insert(devices).values({ eventId, name, enrollCode, enrollCodeExpiresAt });
  return result.insertId;
}
async function getDeviceByEnrollCode(code) {
  const db = await getDb();
  if (!db) return void 0;
  const [device] = await db.select().from(devices).where(eq4(devices.enrollCode, code)).limit(1);
  return device;
}
async function completeDeviceEnrollment(deviceId, deviceTokenHash) {
  const db = await getDb();
  if (!db) return;
  await db.update(devices).set({ enrolled: 1, deviceTokenHash, enrollCode: null, enrollCodeExpiresAt: null, lastSeenAt: /* @__PURE__ */ new Date() }).where(eq4(devices.id, deviceId));
}
async function getDeviceById(id) {
  const db = await getDb();
  if (!db) return void 0;
  const [device] = await db.select().from(devices).where(eq4(devices.id, id)).limit(1);
  return device;
}
async function listAllDevices(eventId) {
  const db = await getDb();
  if (!db) return [];
  return db.select({ id: devices.id, name: devices.name, enrolled: devices.enrolled, active: devices.active, createdAt: devices.createdAt, lastSeenAt: devices.lastSeenAt }).from(devices).where(eq4(devices.eventId, eventId)).orderBy(desc(devices.createdAt));
}
async function updateDeviceActive(id, active) {
  const db = await getDb();
  if (!db) return;
  await db.update(devices).set({ active }).where(eq4(devices.id, id));
}
async function deleteDevice(id) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(devices).where(eq4(devices.id, id));
  return { success: true };
}
async function getActiveEventForCaja() {
  const db = await getDb();
  if (!db) return void 0;
  const rows = await db.select().from(events).where(or(eq4(events.status, "published"), eq4(events.status, "soldout")));
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
  const rows = await db.select().from(events).where(or(eq4(events.status, "published"), eq4(events.status, "soldout")));
  return rows.find((r) => isEventToday(r.eventDate, now));
}
async function getCajaSnapshot(eventId) {
  const db = await getDb();
  if (!db) return null;
  const [event] = await db.select().from(events).where(eq4(events.id, eventId)).limit(1);
  if (!event) return null;
  const approvedOrders = await db.select().from(orders).where(and3(eq4(orders.eventId, eventId), eq4(orders.paymentStatus, "approved")));
  const orderIds = approvedOrders.map((o) => o.id);
  const allTickets = orderIds.length ? await db.select().from(tickets).where(inArray2(tickets.orderId, orderIds)) : [];
  const allTicketTypes = await db.select().from(ticketTypes).where(eq4(ticketTypes.eventId, eventId));
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
    const matchingCustomers = await db.select({ email: customers.email, rut: customers.rut }).from(customers).where(inArray2(customers.email, buyerEmails));
    for (const c of matchingCustomers) rutByEmail.set(c.email, c.rut);
  }
  const attendees = approvedOrders.map((o) => {
    const ts = ticketsByOrder.get(o.id) ?? [];
    const parsedAttendees = parseAttendees(o.attendeeData);
    return {
      orderId: o.id,
      orderNumber: o.orderNumber,
      buyerName: o.buyerName,
      buyerEmail: o.buyerEmail,
      buyerPhone: o.buyerPhone,
      attendees: parsedAttendees.length > 0 ? parsedAttendees : [{ name: o.buyerName, rut: parseBuyerRut(o.attendeeData) ?? rutByEmail.get((o.buyerEmail || "").trim().toLowerCase()) ?? null }],
      access: ts.filter((t2) => ttById.get(t2.ticketTypeId)?.category === "acceso").map((t2) => ({
        ticketCode: t2.ticketCode,
        status: t2.status,
        typeName: ttById.get(t2.ticketTypeId)?.name,
        // Para contar personas reales en el aforo (un Duo son 2).
        accesoSlug: ttById.get(t2.ticketTypeId)?.accesoSlug ?? null,
        // Personas cubiertas por ESTE ticket cuando gana sobre accesoSlug --
        // la invitación especial instantánea (ver createInstantInvite).
        groupSize: t2.groupSize ?? null
      })),
      extras: ts.filter((t2) => ttById.get(t2.ticketTypeId)?.category === "extra").map((t2) => ({ displayCode: t2.displayCode, status: t2.status, typeName: ttById.get(t2.ticketTypeId)?.name }))
    };
  });
  const byBuyerEmail = /* @__PURE__ */ new Map();
  for (const a of attendees) {
    const email = (a.buyerEmail || "").trim().toLowerCase();
    if (!email || PLACEHOLDER_BUYER_EMAILS.has(email)) continue;
    const list = byBuyerEmail.get(email) ?? [];
    list.push(a);
    byBuyerEmail.set(email, list);
  }
  const mergedAway = /* @__PURE__ */ new Set();
  for (const group of Array.from(byBuyerEmail.values())) {
    if (group.length < 2) continue;
    const primary = group.find((a) => a.access.length > 0) ?? group[0];
    for (const other of group) {
      if (other === primary) continue;
      primary.extras = [...primary.extras, ...other.extras];
      if (other.access.length === 0) mergedAway.add(other.orderId);
    }
  }
  const mergedAttendees = attendees.filter((a) => !mergedAway.has(a.orderId));
  const CATALOG_CATEGORIES = ["extra", "consumo", "locker", "merch"];
  const catalog = allTicketTypes.filter((t2) => CATALOG_CATEGORIES.includes(t2.category) && t2.topupAmount == null && (t2.status === "active" || t2.status === "soldout")).map((t2) => ({
    id: t2.id,
    name: t2.name,
    price: Number(t2.price),
    color: t2.color,
    internalCode: t2.internalCode,
    emoji: t2.emoji ?? null,
    groupName: t2.groupName ?? null,
    // Ingredientes/sabores especiales, para que la cajera pueda responder
    // preguntas del cliente sin ir a buscarlo -- reusa el campo de
    // descripción que ya existe, cargado desde la Carta de la Fiesta.
    description: t2.description ?? null,
    category: t2.category,
    status: t2.status,
    totalStock: Number(t2.totalStock),
    soldCount: Number(t2.soldCount),
    toKitchen: Number(t2.toKitchen ?? 0) === 1,
    sortOrder: Number(t2.sortOrder ?? 0)
  }));
  const gifts = await listClaimableGifts();
  const staffCompRows = await db.select({
    displayCode: tickets.displayCode,
    status: tickets.status,
    staffName: tickets.holderName,
    productName: ticketTypes.name
  }).from(tickets).innerJoin(orders, eq4(orders.id, tickets.orderId)).innerJoin(ticketTypes, eq4(ticketTypes.id, tickets.ticketTypeId)).where(and3(eq4(orders.eventId, eventId), eq4(orders.paymentMethod, "Manual: Consumo Staff"), eq4(tickets.status, "valid")));
  const staffComps = staffCompRows.map((r) => ({
    displayCode: r.displayCode,
    status: r.status,
    staffName: r.staffName,
    productName: r.productName
  }));
  return {
    event: { id: event.id, title: event.title, slug: event.slug },
    attendees: mergedAttendees,
    catalog,
    gifts,
    staffComps,
    serverTime: (/* @__PURE__ */ new Date()).toISOString()
  };
}
async function getUnresolvedDepositPersonas(eventId) {
  const db = await getDb();
  if (!db) return 0;
  const unresolvedDeposits = await db.select().from(orders).where(and3(
    eq4(orders.eventId, eventId),
    eq4(orders.missionDeposit, 1),
    eq4(orders.paymentStatus, "approved"),
    ne(orders.missionTopupStatus, "paid")
  ));
  let personas = 0;
  for (const order of unresolvedDeposits) {
    const depositItems = await db.select().from(orderItems).where(eq4(orderItems.orderId, order.id));
    for (const item of depositItems) {
      const [tt] = await db.select().from(ticketTypes).where(eq4(ticketTypes.id, item.ticketTypeId)).limit(1);
      if (tt?.category === "acceso") personas += personasForAccesoSlug(tt.accesoSlug) * item.quantity;
    }
  }
  return personas;
}
async function getCajaDashboard(eventId) {
  const db = await getDb();
  if (!db) return null;
  const cajaOrders = await db.select().from(orders).where(and3(eq4(orders.eventId, eventId), eq4(orders.channel, "caja"), eq4(orders.paymentStatus, "approved")));
  const totalSales = cajaOrders.reduce((s, o) => s + Number(o.total), 0);
  const ticketStats = await db.select({
    category: ticketTypes.category,
    status: tickets.status,
    count: sql2`COUNT(*)`
  }).from(tickets).innerJoin(ticketTypes, eq4(ticketTypes.id, tickets.ticketTypeId)).where(eq4(tickets.eventId, eventId)).groupBy(ticketTypes.category, tickets.status);
  const statOf = (category, status) => Number(ticketStats.find((r) => r.category === category && r.status === status)?.count ?? 0);
  const redeemedCount = statOf("extra", "used");
  const accesoTickets = await db.select({ accesoSlug: ticketTypes.accesoSlug, status: tickets.status, groupSize: tickets.groupSize }).from(tickets).innerJoin(ticketTypes, eq4(ticketTypes.id, tickets.ticketTypeId)).where(and3(eq4(tickets.eventId, eventId), eq4(ticketTypes.category, "acceso")));
  let insideCount = 0;
  let expectedCount = 0;
  for (const t2 of accesoTickets) {
    if (t2.status === "cancelled") continue;
    const personas = personasForTicket(t2.groupSize, t2.accesoSlug);
    expectedCount += personas;
    if (t2.status === "used") insideCount += personas;
  }
  expectedCount += await getUnresolvedDepositPersonas(eventId);
  const items = await db.select({ ticketTypeId: orderItems.ticketTypeId, quantity: orderItems.quantity }).from(orderItems).innerJoin(orders, eq4(orders.id, orderItems.orderId)).where(and3(eq4(orders.eventId, eventId), eq4(orders.channel, "caja"), eq4(orders.paymentStatus, "approved")));
  const qtyByType = /* @__PURE__ */ new Map();
  for (const i of items) qtyByType.set(i.ticketTypeId, (qtyByType.get(i.ticketTypeId) || 0) + i.quantity);
  const ttIds = Array.from(qtyByType.keys());
  const tts = ttIds.length ? await db.select().from(ticketTypes).where(inArray2(ticketTypes.id, ttIds)) : [];
  const topProducts = tts.map((t2) => ({ name: t2.name, quantity: qtyByType.get(t2.id) || 0 })).sort((a, b) => b.quantity - a.quantity).slice(0, 5);
  const recentSales = [...cajaOrders].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 10).map((o) => ({ orderNumber: o.orderNumber, buyerName: o.buyerName, total: Number(o.total), createdAt: o.createdAt, paymentMethod: o.paymentMethod }));
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
  const conflicts = await db.select().from(ops).where(and3(eq4(ops.eventId, eventId), eq4(ops.type, "redeem"), eq4(ops.result, "conflict")));
  if (conflicts.length === 0) return [];
  const resolutions = await db.select().from(ops).where(and3(eq4(ops.eventId, eventId), eq4(ops.type, "manual_adjust")));
  const resolvedIds = new Set(resolutions.map((r) => r.payload?.resolvedConflictOpId).filter(Boolean));
  const pending = conflicts.filter((c) => !resolvedIds.has(c.id));
  if (pending.length === 0) return [];
  const operatorIds = Array.from(new Set(pending.map((c) => c.operatorId)));
  const opRows = await db.select().from(operators).where(inArray2(operators.id, operatorIds));
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
async function getEventSalesBreakdown(eventId) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select({
    channel: orders.channel,
    paymentMethod: orders.paymentMethod,
    total: orders.total
  }).from(orders).where(and3(eq4(orders.eventId, eventId), eq4(orders.paymentStatus, "approved")));
  let webTotal = 0, webCount = 0, cajaTotal = 0, cajaCount = 0;
  const cajaByMethod = /* @__PURE__ */ new Map();
  const webByMethod = /* @__PURE__ */ new Map();
  for (const r of rows) {
    const amount = Number(r.total);
    const key = r.paymentMethod ?? "sin medio";
    if (r.channel === "caja") {
      cajaTotal += amount;
      cajaCount += 1;
      const e = cajaByMethod.get(key) ?? { count: 0, total: 0 };
      e.count += 1;
      e.total += amount;
      cajaByMethod.set(key, e);
    } else {
      webTotal += amount;
      webCount += 1;
      const e = webByMethod.get(key) ?? { count: 0, total: 0 };
      e.count += 1;
      e.total += amount;
      webByMethod.set(key, e);
    }
  }
  const toList = (m) => Array.from(m.entries()).map(([method, v]) => ({ method, ...v })).sort((a, b) => b.total - a.total);
  return {
    web: { total: webTotal, count: webCount, byMethod: toList(webByMethod) },
    caja: { total: cajaTotal, count: cajaCount, byMethod: toList(cajaByMethod) },
    total: webTotal + cajaTotal
  };
}
async function getProfitReport(eventId) {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.select({
    ticketTypeId: orderItems.ticketTypeId,
    quantity: orderItems.quantity,
    unitPrice: orderItems.unitPrice,
    unitCost: orderItems.unitCost
  }).from(orderItems).innerJoin(orders, eq4(orders.id, orderItems.orderId)).where(and3(eq4(orders.eventId, eventId), eq4(orders.paymentStatus, "approved")));
  const allTicketTypes = await db.select().from(ticketTypes).where(eq4(ticketTypes.eventId, eventId));
  const ttById = new Map(allTicketTypes.map((t2) => [t2.id, t2]));
  const byType = /* @__PURE__ */ new Map();
  for (const r of rows) {
    const tt = ttById.get(r.ticketTypeId);
    const entry = byType.get(r.ticketTypeId) ?? {
      name: tt?.name ?? `#${r.ticketTypeId}`,
      category: tt?.category ?? "extra",
      groupName: tt?.groupName ?? null,
      unitsSold: 0,
      revenue: 0,
      cost: 0,
      hasCost: false
    };
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
    category: e.category,
    groupName: e.groupName,
    unitsSold: e.unitsSold,
    revenue: e.revenue,
    cost: e.hasCost ? e.cost : null,
    profit: e.hasCost ? e.revenue - e.cost : null,
    marginPercent: e.hasCost && e.revenue > 0 ? Math.round((e.revenue - e.cost) / e.revenue * 1e3) / 10 : null
  })).sort((a, b) => b.revenue - a.revenue);
}
async function getKitchenVendorReport(eventId) {
  const db = await getDb();
  if (!db) return { products: [], totalRevenue: 0, vendorShare: 0, venueShare: 0 };
  const rows = await db.select({
    ticketTypeId: orderItems.ticketTypeId,
    quantity: orderItems.quantity,
    unitPrice: orderItems.unitPrice,
    unitCost: orderItems.unitCost
  }).from(orderItems).innerJoin(orders, eq4(orders.id, orderItems.orderId)).where(and3(eq4(orders.eventId, eventId), eq4(orders.paymentStatus, "approved")));
  const kitchenTicketTypes = await db.select().from(ticketTypes).where(and3(eq4(ticketTypes.eventId, eventId), eq4(ticketTypes.toKitchen, 1)));
  const kitchenIds = new Set(kitchenTicketTypes.map((t2) => t2.id));
  const ttById = new Map(kitchenTicketTypes.map((t2) => [t2.id, t2]));
  const byType = /* @__PURE__ */ new Map();
  for (const r of rows) {
    if (!kitchenIds.has(r.ticketTypeId)) continue;
    const entry = byType.get(r.ticketTypeId) ?? { name: ttById.get(r.ticketTypeId)?.name ?? `#${r.ticketTypeId}`, quantity: 0, revenue: 0, vendorShare: 0 };
    entry.quantity += r.quantity;
    entry.revenue += Number(r.unitPrice) * r.quantity;
    entry.vendorShare += Number(r.unitCost ?? 0) * r.quantity;
    byType.set(r.ticketTypeId, entry);
  }
  const products = Array.from(byType.values()).map((e) => ({ name: e.name, quantity: e.quantity, revenue: e.revenue, vendorShare: e.vendorShare, venueShare: e.revenue - e.vendorShare })).sort((a, b) => b.revenue - a.revenue);
  return {
    products,
    totalRevenue: products.reduce((s, p) => s + p.revenue, 0),
    vendorShare: products.reduce((s, p) => s + p.vendorShare, 0),
    venueShare: products.reduce((s, p) => s + p.venueShare, 0)
  };
}
async function getEventComparison(eventIds) {
  const db = await getDb();
  if (!db) return [];
  const eventFilter = eventIds?.length ? inArray2(events.id, eventIds) : void 0;
  const allEvents = eventFilter ? await db.select().from(events).where(eventFilter).orderBy(desc(events.eventDate)) : await db.select().from(events).orderBy(desc(events.eventDate));
  const orderFilter = eventIds?.length ? and3(eq4(orders.paymentStatus, "approved"), inArray2(orders.eventId, eventIds)) : eq4(orders.paymentStatus, "approved");
  const rows = await db.select({
    eventId: orders.eventId,
    quantity: orderItems.quantity,
    unitPrice: orderItems.unitPrice,
    unitCost: orderItems.unitCost
  }).from(orderItems).innerJoin(orders, eq4(orders.id, orderItems.orderId)).where(orderFilter);
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
  const opsFilter = eventIds?.length ? inArray2(ops.eventId, eventIds) : void 0;
  const activityRows = opsFilter ? await db.select({ eventId: ops.eventId, operatorId: ops.operatorId, registerId: ops.registerId }).from(ops).where(opsFilter) : await db.select({ eventId: ops.eventId, operatorId: ops.operatorId, registerId: ops.registerId }).from(ops);
  const activityByEvent = /* @__PURE__ */ new Map();
  for (const r of activityRows) {
    const entry = activityByEvent.get(r.eventId) ?? { operators: /* @__PURE__ */ new Set(), registers: /* @__PURE__ */ new Set() };
    entry.operators.add(r.operatorId);
    if (r.registerId != null) entry.registers.add(r.registerId);
    activityByEvent.set(r.eventId, entry);
  }
  return allEvents.map((e) => {
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
      activeRegisters: activity?.registers.size ?? 0
    };
  });
}
var CASH_COLLECTED_COLUMNS = {
  eventId: orders.eventId,
  total: orders.total,
  missionTopupStatus: orders.missionTopupStatus,
  missionTopupAmount: orders.missionTopupAmount,
  channel: orders.channel,
  paymentMethod: orders.paymentMethod
};
var CARD_LIKE_CAJA_METHODS = /* @__PURE__ */ new Set(["debito", "credito", "qr"]);
function cardFeeBaseFromOrders(rows) {
  return rows.reduce((sum, r) => {
    const isWeb = r.channel === "web";
    const isCajaCard = r.channel === "caja" && r.paymentMethod != null && CARD_LIKE_CAJA_METHODS.has(r.paymentMethod);
    return isWeb || isCajaCard ? sum + Number(r.total) : sum;
  }, 0);
}
async function materializeRecurringExpenses(monthKey) {
  const db = await getDb();
  if (!db) return;
  const [year, month] = monthKey.split("-").map(Number);
  if (!year || !month) return;
  const monthStart = new Date(Date.UTC(year, month - 1, 1, 4, 0, 0));
  const monthEnd = new Date(Date.UTC(year, month, 1, 4, 0, 0) - 1);
  const templates = await db.select().from(expenses).where(and3(
    eq4(expenses.recurrence, "mensual"),
    lte(expenses.expenseDate, monthEnd)
  ));
  for (const t2 of templates) {
    if (t2.recurrenceEndsAt && new Date(t2.recurrenceEndsAt) < monthStart) continue;
    if (t2.periodMonth === monthKey) continue;
    await db.insert(expenses).values({
      scope: t2.scope,
      eventId: t2.eventId,
      periodMonth: monthKey,
      expenseDate: monthStart,
      category: t2.category,
      description: t2.description,
      supplier: t2.supplier,
      supplierRut: t2.supplierRut,
      documentType: t2.documentType,
      documentNumber: t2.documentNumber,
      ivaExempt: t2.ivaExempt,
      amountTotal: t2.amountTotal,
      netAmount: t2.netAmount,
      ivaAmount: t2.ivaAmount,
      paymentMethod: t2.paymentMethod,
      recurrence: "none",
      recurringParentId: t2.id,
      excludeFromPnl: t2.excludeFromPnl,
      prorate: t2.prorate,
      notes: t2.notes,
      createdByUserId: t2.createdByUserId
    }).onDuplicateKeyUpdate({ set: { id: sql2`id` } });
  }
}
async function materializeEventRecurringExpenses(eventId) {
  const db = await getDb();
  if (!db) return;
  const [event] = await db.select().from(events).where(eq4(events.id, eventId)).limit(1);
  if (!event) return;
  const eventDate = new Date(event.eventDate);
  const templates = await db.select().from(expenses).where(eq4(expenses.recurrence, "por_evento"));
  for (const t2 of templates) {
    if (new Date(t2.expenseDate) > eventDate) continue;
    if (t2.recurrenceEndsAt && new Date(t2.recurrenceEndsAt) < eventDate) continue;
    await db.insert(expenses).values({
      scope: "evento",
      eventId,
      periodMonth: monthKeyFor(event.eventDate),
      // La fecha de la copia es la de la fiesta, no la de la plantilla: así
      // cae en el mes correcto y se ordena junto al resto de esa noche.
      expenseDate: eventDate,
      category: t2.category,
      description: t2.description,
      supplier: t2.supplier,
      supplierRut: t2.supplierRut,
      documentType: t2.documentType,
      documentNumber: t2.documentNumber,
      ivaExempt: t2.ivaExempt,
      amountTotal: t2.amountTotal,
      netAmount: t2.netAmount,
      ivaAmount: t2.ivaAmount,
      paymentMethod: t2.paymentMethod,
      recurrence: "none",
      recurringParentId: t2.id,
      excludeFromPnl: t2.excludeFromPnl,
      prorate: t2.prorate,
      notes: t2.notes,
      createdByUserId: t2.createdByUserId
    }).onDuplicateKeyUpdate({ set: { id: sql2`id` } });
  }
}
async function listRecurringExpenses() {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.select().from(expenses).where(ne(expenses.recurrence, "none")).orderBy(desc(expenses.expenseDate));
  const eventIds = Array.from(new Set(rows.map((r) => r.eventId).filter((id) => id != null)));
  const eventRows = eventIds.length ? await db.select({ id: events.id, title: events.title }).from(events).where(inArray2(events.id, eventIds)) : [];
  const titleById = new Map(eventRows.map((e) => [e.id, e.title]));
  return rows.map((r) => ({
    id: r.id,
    description: r.description,
    supplier: r.supplier,
    category: r.category,
    amountTotal: Number(r.amountTotal),
    scope: r.scope,
    recurrence: r.recurrence,
    eventId: r.eventId,
    eventTitle: r.eventId ? titleById.get(r.eventId) ?? `Evento #${r.eventId}` : null,
    expenseDate: r.expenseDate,
    recurrenceEndsAt: r.recurrenceEndsAt
  }));
}
async function listExpenses(filters = {}) {
  const db = await getDb();
  if (!db) return [];
  if (filters.eventId) await materializeEventRecurringExpenses(filters.eventId);
  if (filters.monthKey) await materializeRecurringExpenses(filters.monthKey);
  const conditions = [];
  if (filters.eventId) conditions.push(eq4(expenses.eventId, filters.eventId));
  if (filters.monthKey) conditions.push(eq4(expenses.periodMonth, filters.monthKey));
  if (filters.scope) conditions.push(eq4(expenses.scope, filters.scope));
  if (filters.category) conditions.push(eq4(expenses.category, filters.category));
  conditions.push(eq4(expenses.recurrence, "none"));
  const rows = await db.select().from(expenses).where(and3(...conditions)).orderBy(desc(expenses.expenseDate)).limit(500);
  const eventIds = Array.from(new Set(rows.map((r) => r.eventId).filter(Boolean)));
  const evRows = eventIds.length ? await db.select().from(events).where(inArray2(events.id, eventIds)) : [];
  const evById = new Map(evRows.map((e) => [e.id, e]));
  return rows.map((r) => ({
    ...r,
    amountTotal: Number(r.amountTotal),
    netAmount: Number(r.netAmount),
    ivaAmount: Number(r.ivaAmount),
    eventTitle: r.eventId ? evById.get(r.eventId)?.title ?? "Evento eliminado" : null
  }));
}
function buildExpenseValues(input) {
  const amountTotal = Math.round(Number(input.amountTotal));
  const expenseDate = input.expenseDate ? new Date(input.expenseDate) : /* @__PURE__ */ new Date();
  const derived = deriveAmounts({
    amountTotal,
    documentType: input.documentType,
    ivaExempt: input.ivaExempt
  });
  const ivaAmount = input.ivaAmountOverride != null && derived.ivaAmount > 0 ? Math.round(Number(input.ivaAmountOverride)) : derived.ivaAmount;
  return {
    scope: input.scope,
    eventId: input.scope === "evento" ? input.eventId : null,
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
    recurrence: input.recurrence ?? "none",
    recurrenceEndsAt: input.recurrenceEndsAt ? new Date(input.recurrenceEndsAt) : null,
    excludeFromPnl: input.excludeFromPnl ? 1 : 0,
    prorate: input.prorate === false || input.prorate === 0 ? 0 : 1,
    receiptUrl: input.receiptUrl || null,
    notes: input.notes || null
  };
}
async function createExpense(input) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(expenses).values({
    ...buildExpenseValues(input),
    createdByUserId: input.createdByUserId ?? null
  });
  return { success: true };
}
async function updateExpense(id, input) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [current] = await db.select().from(expenses).where(eq4(expenses.id, id)).limit(1);
  if (!current) throw new Error("Gasto no encontrado");
  const merged = { ...current, ...input, amountTotal: input.amountTotal ?? Number(current.amountTotal) };
  await db.update(expenses).set(buildExpenseValues(merged)).where(eq4(expenses.id, id));
  return { success: true };
}
async function deleteExpense(id) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(expenses).where(eq4(expenses.id, id));
  return { success: true };
}
function toPnlExpense(r) {
  return {
    amountTotal: Number(r.amountTotal),
    netAmount: Number(r.netAmount),
    ivaAmount: Number(r.ivaAmount),
    documentType: r.documentType,
    ivaExempt: r.ivaExempt,
    category: r.category
  };
}
async function getEventPnl(eventId) {
  const db = await getDb();
  if (!db) return null;
  const [event] = await db.select().from(events).where(eq4(events.id, eventId)).limit(1);
  if (!event) return null;
  const monthKey = monthKeyFor(event.eventDate);
  await materializeRecurringExpenses(monthKey);
  await materializeEventRecurringExpenses(eventId);
  const monthEvents = (await db.select().from(events)).filter((e) => monthKeyFor(e.eventDate) === monthKey);
  const monthEventIds = monthEvents.map((e) => e.id);
  const incomeRows = monthEventIds.length ? await db.select(CASH_COLLECTED_COLUMNS).from(orders).where(and3(inArray2(orders.eventId, monthEventIds), eq4(orders.paymentStatus, "approved"))) : [];
  const incomeByEvent = /* @__PURE__ */ new Map();
  for (const r of incomeRows) {
    const list = incomeByEvent.get(r.eventId) ?? [];
    list.push(r);
    incomeByEvent.set(r.eventId, list);
  }
  const monthIncomes = monthEvents.map((e) => ({
    eventId: e.id,
    grossIncome: cashCollectedFromOrders(incomeByEvent.get(e.id) ?? [])
  }));
  const grossIncome = monthIncomes.find((i) => i.eventId === eventId)?.grossIncome ?? 0;
  const prorationWeight = prorationWeights(monthIncomes).get(eventId) ?? 0;
  const cardFeeBase = cardFeeBaseFromOrders(incomeByEvent.get(eventId) ?? []);
  const cardFeePercent = Number((await getSiteSettings()).cardFeePercent ?? 3.5);
  const itemRows = await db.select({
    quantity: orderItems.quantity,
    unitCost: orderItems.unitCost
  }).from(orderItems).innerJoin(orders, eq4(orders.id, orderItems.orderId)).where(and3(eq4(orders.eventId, eventId), eq4(orders.paymentStatus, "approved")));
  let cogs = 0, unitsWithCost = 0, unitsTotal = 0;
  for (const r of itemRows) {
    unitsTotal += r.quantity;
    if (r.unitCost != null) {
      cogs += Number(r.unitCost) * r.quantity;
      unitsWithCost += r.quantity;
    }
  }
  const cogsCoverage = unitsTotal > 0 ? Math.round(unitsWithCost / unitsTotal * 100) : 0;
  const commissionRows = await db.select({ amount: ambassadorCommissions.commissionAmount }).from(ambassadorCommissions).where(eq4(ambassadorCommissions.eventId, eventId));
  const commissionsTotal = commissionRows.reduce((s, c) => s + Number(c.amount), 0);
  const directRows = await db.select().from(expenses).where(and3(
    eq4(expenses.scope, "evento"),
    eq4(expenses.eventId, eventId),
    eq4(expenses.excludeFromPnl, 0),
    eq4(expenses.recurrence, "none")
  ));
  const generalRows = await db.select().from(expenses).where(and3(
    eq4(expenses.scope, "general"),
    eq4(expenses.periodMonth, monthKey),
    eq4(expenses.excludeFromPnl, 0),
    eq4(expenses.prorate, 1),
    eq4(expenses.recurrence, "none")
  ));
  const pnl = computePnl({
    ivaApplies: event.ivaApplies === 1,
    grossIncome,
    cogs,
    ambassadorCommissions: commissionsTotal,
    cardFeeBase,
    cardFeePercent,
    directExpenses: directRows.map(toPnlExpense),
    generalExpenses: generalRows.map(toPnlExpense),
    prorationWeight
  });
  return {
    eventId,
    title: event.title,
    eventDate: event.eventDate,
    monthKey,
    ivaApplies: event.ivaApplies === 1,
    cogsCoverage,
    ...pnl,
    warnings: await buildPnlWarnings({ eventId, cogs, directRows, monthKey, grossIncome })
  };
}
async function buildPnlWarnings(params) {
  const db = await getDb();
  const warnings = [];
  const merchandiseExpenses = params.directRows.filter((e) => e.category === "barra" || e.category === "merch");
  if (params.cogs > 0 && merchandiseExpenses.length > 0) {
    warnings.push(
      `Hay ${merchandiseExpenses.length} gasto(s) de barra/merch y adem\xE1s costo de producto cargado en la carta. Si es la misma mercader\xEDa la est\xE1s contando dos veces: marc\xE1 esos gastos como "ya contado en el costo del producto".`
    );
  }
  if (db) {
    const refunded = await db.select({ id: orders.id }).from(orders).where(and3(eq4(orders.eventId, params.eventId), eq4(orders.paymentStatus, "refunded")));
    if (refunded.length > 0) {
      const refundedIds = refunded.map((r) => r.id);
      const withCommission = await db.select({ id: ambassadorCommissions.id }).from(ambassadorCommissions).where(inArray2(ambassadorCommissions.orderId, refundedIds));
      if (withCommission.length > 0) {
        warnings.push(
          `Hay ${withCommission.length} comisi\xF3n(es) de embajador sobre \xF3rdenes reembolsadas. El sistema no las revierte solo: revisalas a mano.`
        );
      }
    }
    const manualCommissionExpenses = params.directRows.filter((e) => e.category === "comisiones");
    if (manualCommissionExpenses.length > 0) {
      warnings.push(
        `Hay ${manualCommissionExpenses.length} gasto(s) manual(es) de categor\xEDa "Comisiones" cargado(s) a este evento. La comisi\xF3n de tarjeta ya se descuenta sola: borr\xE1 esos gastos o marcalos como excluidos del P&L para no restarla dos veces.`
      );
    }
  }
  return warnings;
}
async function getPnlComparison(eventIds) {
  const db = await getDb();
  if (!db) return [];
  const allEvents = await db.select().from(events).orderBy(desc(events.eventDate));
  if (allEvents.length === 0) return [];
  const monthsNeeded = Array.from(new Set(allEvents.map((e) => monthKeyFor(e.eventDate))));
  for (const m of monthsNeeded) await materializeRecurringExpenses(m);
  const incomeRows = await db.select(CASH_COLLECTED_COLUMNS).from(orders).where(eq4(orders.paymentStatus, "approved"));
  const incomeByEvent = /* @__PURE__ */ new Map();
  for (const r of incomeRows) {
    const list = incomeByEvent.get(r.eventId) ?? [];
    list.push(r);
    incomeByEvent.set(r.eventId, list);
  }
  const itemRows = await db.select({
    eventId: orders.eventId,
    quantity: orderItems.quantity,
    unitCost: orderItems.unitCost
  }).from(orderItems).innerJoin(orders, eq4(orders.id, orderItems.orderId)).where(eq4(orders.paymentStatus, "approved"));
  const cogsByEvent = /* @__PURE__ */ new Map();
  for (const r of itemRows) {
    if (r.unitCost == null) continue;
    cogsByEvent.set(r.eventId, (cogsByEvent.get(r.eventId) ?? 0) + Number(r.unitCost) * r.quantity);
  }
  const commissionRows = await db.select({
    eventId: ambassadorCommissions.eventId,
    amount: ambassadorCommissions.commissionAmount
  }).from(ambassadorCommissions);
  const commissionsByEvent = /* @__PURE__ */ new Map();
  for (const r of commissionRows) {
    commissionsByEvent.set(r.eventId, (commissionsByEvent.get(r.eventId) ?? 0) + Number(r.amount));
  }
  const allExpenses = await db.select().from(expenses).where(and3(
    eq4(expenses.excludeFromPnl, 0),
    eq4(expenses.recurrence, "none")
  ));
  const directByEvent = /* @__PURE__ */ new Map();
  const generalByMonth = /* @__PURE__ */ new Map();
  for (const e of allExpenses) {
    if (e.scope === "evento" && e.eventId) {
      const list = directByEvent.get(e.eventId) ?? [];
      list.push(e);
      directByEvent.set(e.eventId, list);
    } else if (e.scope === "general" && e.prorate === 1) {
      const list = generalByMonth.get(e.periodMonth) ?? [];
      list.push(e);
      generalByMonth.set(e.periodMonth, list);
    }
  }
  const incomeOf = (id) => cashCollectedFromOrders(incomeByEvent.get(id) ?? []);
  const eventsByMonth = /* @__PURE__ */ new Map();
  for (const e of allEvents) {
    const m = monthKeyFor(e.eventDate);
    const list = eventsByMonth.get(m) ?? [];
    list.push(e);
    eventsByMonth.set(m, list);
  }
  const weightByEvent = /* @__PURE__ */ new Map();
  for (const evs of Array.from(eventsByMonth.values())) {
    const weights = prorationWeights(evs.map((e) => ({ eventId: e.id, grossIncome: incomeOf(e.id) })));
    for (const [id, w] of Array.from(weights.entries())) weightByEvent.set(id, w);
  }
  const cardFeePercent = Number((await getSiteSettings()).cardFeePercent ?? 3.5);
  const eventIdSet = eventIds?.length ? new Set(eventIds) : null;
  return allEvents.filter((e) => !eventIdSet || eventIdSet.has(e.id)).map((e) => {
    const monthKey = monthKeyFor(e.eventDate);
    const pnl = computePnl({
      ivaApplies: e.ivaApplies === 1,
      grossIncome: incomeOf(e.id),
      cogs: cogsByEvent.get(e.id) ?? 0,
      ambassadorCommissions: commissionsByEvent.get(e.id) ?? 0,
      cardFeeBase: cardFeeBaseFromOrders(incomeByEvent.get(e.id) ?? []),
      cardFeePercent,
      directExpenses: (directByEvent.get(e.id) ?? []).map(toPnlExpense),
      generalExpenses: (generalByMonth.get(monthKey) ?? []).map(toPnlExpense),
      prorationWeight: weightByEvent.get(e.id) ?? 0
    });
    return {
      eventId: e.id,
      title: e.title,
      eventDate: e.eventDate,
      monthKey,
      ivaApplies: e.ivaApplies === 1,
      grossIncome: pnl.grossIncome,
      totalExpenses: pnl.cogs + pnl.directExpensesTotal + pnl.generalExpensesAssigned + pnl.ambassadorCommissions + pnl.cardFeeAmount,
      netProfit: pnl.netProfit,
      marginPercent: pnl.marginPercent
    };
  });
}
async function getParkingReport(eventId) {
  const db = await getDb();
  if (!db) return null;
  const allTicketTypes = await db.select().from(ticketTypes).where(eq4(ticketTypes.eventId, eventId));
  const parkingTypeIds = new Set(
    allTicketTypes.filter((tt) => tt.category === "extra" && isParkingTicketType(tt.name)).map((tt) => tt.id)
  );
  if (parkingTypeIds.size === 0) {
    return { online: 0, puerta: 0, staff: 0, totalPaid: 0, totalCars: 0, venueFeePerCarClp: 0, amountOwedToVenueClp: 0, puertaByMethod: { efectivo: 0, debito: 0, credito: 0 } };
  }
  const parkingTickets = await db.select().from(tickets).where(and3(
    eq4(tickets.eventId, eventId),
    inArray2(tickets.ticketTypeId, Array.from(parkingTypeIds)),
    ne(tickets.status, "cancelled")
  ));
  const orderIds = Array.from(new Set(parkingTickets.map((t2) => t2.orderId)));
  const relatedOrders = orderIds.length ? await db.select({ id: orders.id, paymentMethod: orders.paymentMethod, paymentId: orders.paymentId }).from(orders).where(inArray2(orders.id, orderIds)) : [];
  const orderById = new Map(relatedOrders.map((o) => [o.id, o]));
  const origins = parkingTickets.map((t2) => {
    const o = orderById.get(t2.orderId);
    return classifyParkingOrigin({ orderPaymentMethod: o?.paymentMethod ?? "", orderPaymentId: o?.paymentId ?? null });
  });
  const counts = summarizeParkingCounts(origins);
  const puertaByMethod = { efectivo: 0, debito: 0, credito: 0 };
  for (const t2 of parkingTickets) {
    const o = orderById.get(t2.orderId);
    if (o?.paymentId?.startsWith("PUERTA-PARKING-") && o.paymentMethod in puertaByMethod) {
      puertaByMethod[o.paymentMethod] += 1;
    }
  }
  const venueFeePerCarClp = Number((await getSiteSettings()).parkingVenueFeeClp ?? 3e3);
  return {
    ...counts,
    venueFeePerCarClp,
    amountOwedToVenueClp: counts.totalPaid * venueFeePerCarClp,
    puertaByMethod
  };
}
async function getPeakHours(eventId) {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.select({ serverAt: ops.serverAt }).from(ops).where(eq4(ops.eventId, eventId));
  const counts = new Array(24).fill(0);
  for (const r of rows) counts[chileHourOf(r.serverAt)]++;
  return counts.map((count, hour) => ({ hour, count }));
}
async function getLedger(eventId, filters = {}) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [eq4(ops.eventId, eventId)];
  if (filters.operatorId) conditions.push(eq4(ops.operatorId, filters.operatorId));
  if (filters.type) conditions.push(eq4(ops.type, filters.type));
  if (filters.dateFrom) conditions.push(gte(ops.serverAt, new Date(filters.dateFrom)));
  if (filters.dateTo) conditions.push(lte(ops.serverAt, new Date(filters.dateTo)));
  const rows = await db.select().from(ops).where(and3(...conditions)).orderBy(desc(ops.serverAt)).limit(500);
  const operatorIds = Array.from(new Set(rows.map((r) => r.operatorId)));
  const opRows = operatorIds.length ? await db.select().from(operators).where(inArray2(operators.id, operatorIds)) : [];
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
async function listActiveRegisters(eventId) {
  const db = await getDb();
  if (!db) return [];
  return db.select({ id: registers.id, name: registers.name }).from(registers).where(and3(eq4(registers.active, 1), eq4(registers.eventId, eventId)));
}
async function listAllRegisters(eventId) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(registers).where(eq4(registers.eventId, eventId)).orderBy(registers.name);
}
async function createRegister(eventId, name) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [result] = await db.insert(registers).values({ eventId, name });
  return result.insertId;
}
async function registerHasHistory(id) {
  const db = await getDb();
  if (!db) return true;
  const checks = await Promise.all([
    db.select({ id: orders.id }).from(orders).where(eq4(orders.registerId, id)).limit(1),
    db.select({ id: ops.id }).from(ops).where(eq4(ops.registerId, id)).limit(1),
    db.select({ id: shifts.id }).from(shifts).where(eq4(shifts.registerId, id)).limit(1),
    db.select({ id: tickets.id }).from(tickets).where(eq4(tickets.usedAtRegisterId, id)).limit(1),
    db.select({ id: kitchenTickets.id }).from(kitchenTickets).where(eq4(kitchenTickets.registerId, id)).limit(1)
  ]);
  return checks.some((rows) => rows.length > 0);
}
async function deleteRegister(id) {
  if (await registerHasHistory(id)) {
    throw new Error("Esta caja ya tiene historial de ventas o turnos \u2014 desact\xEDvala en vez de eliminarla.");
  }
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(registers).where(eq4(registers.id, id));
  return { success: true };
}
async function openShift(params) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const existing = await getOpenShift(params.eventId, params.registerId);
  if (existing) {
    return {
      shiftId: existing.id,
      alreadyOpen: true,
      openingCash: Number(existing.openingCash),
      openedAt: existing.openedAt
    };
  }
  try {
    const [result] = await db.insert(shifts).values({
      eventId: params.eventId,
      operatorId: params.operatorId,
      registerId: params.registerId ?? null,
      openingCash: String(params.openingCash)
    });
    return {
      shiftId: result.insertId,
      alreadyOpen: false,
      openingCash: params.openingCash,
      openedAt: /* @__PURE__ */ new Date()
    };
  } catch (err) {
    const isDuplicate = err?.code === "ER_DUP_ENTRY" || /duplicate entry/i.test(String(err?.message ?? ""));
    if (!isDuplicate) throw err;
    const raced = await getOpenShift(params.eventId, params.registerId);
    if (!raced) throw err;
    return {
      shiftId: raced.id,
      alreadyOpen: true,
      openingCash: Number(raced.openingCash),
      openedAt: raced.openedAt
    };
  }
}
async function getOpenShift(eventId, registerId) {
  const db = await getDb();
  if (!db) return null;
  const conditions = [eq4(shifts.eventId, eventId), eq4(shifts.status, "open")];
  conditions.push(registerId ? eq4(shifts.registerId, registerId) : isNull2(shifts.registerId));
  const [row] = await db.select().from(shifts).where(and3(...conditions)).orderBy(desc(shifts.openedAt)).limit(1);
  return row ?? null;
}
async function closeShift(params) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [shift] = await db.select().from(shifts).where(eq4(shifts.id, params.shiftId)).limit(1);
  if (!shift) throw new Error("Turno no encontrado");
  if (shift.status === "closed") throw new Error("Este turno ya fue cerrado");
  const closedAt = /* @__PURE__ */ new Date();
  const shiftSalesConditions = [
    eq4(orders.eventId, shift.eventId),
    eq4(orders.channel, "caja"),
    eq4(orders.paymentStatus, "approved"),
    gte(orders.createdAt, shift.openedAt),
    lte(orders.createdAt, closedAt)
  ];
  shiftSalesConditions.push(
    shift.registerId ? eq4(orders.registerId, shift.registerId) : isNull2(orders.registerId)
  );
  const fetchedSales = await db.select({
    total: orders.total,
    paymentMethod: orders.paymentMethod,
    createdAt: orders.createdAt,
    registerId: orders.registerId
  }).from(orders).where(and3(...shiftSalesConditions));
  const shiftSales = filterShiftSales(fetchedSales, {
    openedAt: shift.openedAt,
    closedAt,
    registerId: shift.registerId
  });
  const drawerExpenses = await db.select({ amountTotal: expenses.amountTotal }).from(expenses).where(eq4(expenses.paidFromShiftId, shift.id));
  const cashPaidOut = drawerExpenses.reduce((sum, e) => sum + Number(e.amountTotal ?? 0), 0);
  const { expectedCash, expectedDebit, expectedCredit, expectedQr } = computeExpectedTotals(shiftSales, cashPaidOut);
  const redeemsCount = await db.select({ count: sql2`count(*)` }).from(ops).where(and3(
    eq4(ops.eventId, shift.eventId),
    eq4(ops.type, "redeem"),
    eq4(ops.result, "applied"),
    gte(ops.serverAt, shift.openedAt),
    lte(ops.serverAt, closedAt),
    // Mismo criterio que las ventas de arriba: sin caja asignada cuenta
    // solo lo suyo, no los canjes de las otras cajas.
    shift.registerId ? eq4(ops.registerId, shift.registerId) : isNull2(ops.registerId)
  ));
  const eventOrders = await db.select({ buyerName: orders.buyerName, buyerEmail: orders.buyerEmail, total: orders.total }).from(orders).where(and3(eq4(orders.eventId, shift.eventId), eq4(orders.paymentStatus, "approved"), sql2`${orders.channel} != 'caja'`));
  const byCustomer = /* @__PURE__ */ new Map();
  for (const o of eventOrders) {
    const entry = byCustomer.get(o.buyerEmail) ?? { name: o.buyerName, email: o.buyerEmail, total: 0 };
    entry.total += Number(o.total);
    byCustomer.set(o.buyerEmail, entry);
  }
  const topCustomers = Array.from(byCustomer.values()).sort((a, b) => b.total - a.total).slice(0, 3);
  const eventItems = await db.select({ ticketTypeId: orderItems.ticketTypeId, quantity: orderItems.quantity, totalPrice: orderItems.totalPrice }).from(orderItems).innerJoin(orders, eq4(orders.id, orderItems.orderId)).where(and3(eq4(orders.eventId, shift.eventId), eq4(orders.paymentStatus, "approved")));
  const allTicketTypes = await db.select().from(ticketTypes).where(eq4(ticketTypes.eventId, shift.eventId));
  const ttById = new Map(allTicketTypes.map((t2) => [t2.id, t2]));
  const byProduct = /* @__PURE__ */ new Map();
  for (const item of eventItems) {
    const entry = byProduct.get(item.ticketTypeId) ?? { name: ttById.get(item.ticketTypeId)?.name ?? `#${item.ticketTypeId}`, quantity: 0, revenue: 0 };
    entry.quantity += item.quantity;
    entry.revenue += Number(item.totalPrice);
    byProduct.set(item.ticketTypeId, entry);
  }
  const topProducts = Array.from(byProduct.values()).sort((a, b) => b.quantity - a.quantity).slice(0, 3);
  const shiftItems = await db.select({ ticketTypeId: orderItems.ticketTypeId, quantity: orderItems.quantity, totalPrice: orderItems.totalPrice }).from(orderItems).innerJoin(orders, eq4(orders.id, orderItems.orderId)).where(and3(...shiftSalesConditions));
  const byShiftProduct = /* @__PURE__ */ new Map();
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
    cashPaidOut: String(cashPaidOut),
    salesCount: shiftSales.length,
    redeemsCount: Number(redeemsCount[0]?.count ?? 0),
    topCustomers,
    topProducts,
    status: "closed"
  }).where(eq4(shifts.id, shift.id));
  const [event] = await db.select({ title: events.title }).from(events).where(eq4(events.id, shift.eventId)).limit(1);
  const [register] = shift.registerId ? await db.select({ name: registers.name }).from(registers).where(eq4(registers.id, shift.registerId)).limit(1) : [null];
  const [operator] = await db.select({ name: operators.name, email: operators.email }).from(operators).where(eq4(operators.id, shift.operatorId)).limit(1);
  return {
    id: shift.id,
    eventTitle: event?.title ?? `Evento #${shift.eventId}`,
    registerName: register?.name ?? "Sin caja asignada",
    operatorName: operator?.name ?? "Operador eliminado",
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
    // Efectivo sacado del cajón durante el turno (ya restado de expectedCash)
    // -- se expone aparte para que el PDF y el correo lo muestren como línea
    // propia en vez de que aparezca como un descuadre sin explicación.
    cashPaidOut,
    cashDiff: shiftCashDiff(params.countedCash, expectedCash, Number(shift.openingCash)),
    debitDiff: params.countedDebit - expectedDebit,
    creditDiff: params.countedCredit - expectedCredit,
    qrDiff: (params.countedQr ?? 0) - expectedQr,
    salesCount: shiftSales.length,
    redeemsCount: Number(redeemsCount[0]?.count ?? 0),
    topCustomers,
    topProducts,
    shiftProducts
  };
}
async function recordAdminAudit(entry) {
  try {
    const db = await getDb();
    if (!db) return;
    await db.insert(adminAuditLog).values({
      action: entry.action,
      targetType: entry.targetType ?? null,
      targetId: entry.targetId != null ? String(entry.targetId) : null,
      eventId: entry.eventId ?? null,
      payload: entry.payload ?? null,
      ip: entry.ip ?? null
    });
  } catch (err) {
    console.warn("[adminAudit] no se pudo registrar la acci\xF3n", entry.action, err);
  }
}
async function listAdminAudit(limit = 200) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(adminAuditLog).orderBy(desc(adminAuditLog.createdAt)).limit(limit);
}
async function getShiftSales(shiftId) {
  const db = await getDb();
  if (!db) return null;
  const [shift] = await db.select().from(shifts).where(eq4(shifts.id, shiftId)).limit(1);
  if (!shift) return null;
  const closedAt = shift.closedAt ?? /* @__PURE__ */ new Date();
  const conditions = [
    eq4(orders.eventId, shift.eventId),
    eq4(orders.channel, "caja"),
    eq4(orders.paymentStatus, "approved"),
    gte(orders.createdAt, shift.openedAt),
    lte(orders.createdAt, closedAt)
  ];
  conditions.push(shift.registerId ? eq4(orders.registerId, shift.registerId) : isNull2(orders.registerId));
  const rows = await db.select({
    id: orders.id,
    orderNumber: orders.orderNumber,
    total: orders.total,
    subtotal: orders.subtotal,
    discount: orders.discount,
    paymentMethod: orders.paymentMethod,
    createdAt: orders.createdAt,
    registerId: orders.registerId,
    operatorId: orders.operatorId
  }).from(orders).where(and3(...conditions)).orderBy(desc(orders.createdAt));
  const sales = filterShiftSales(rows, {
    openedAt: shift.openedAt,
    closedAt,
    registerId: shift.registerId
  });
  const operatorIds = Array.from(new Set(sales.map((r) => r.operatorId).filter((id) => id != null)));
  const operatorRows = operatorIds.length ? await db.select({ id: operators.id, name: operators.name }).from(operators).where(inArray2(operators.id, operatorIds)) : [];
  const operatorById = new Map(operatorRows.map((o) => [o.id, o.name]));
  return {
    shiftId: shift.id,
    sales: sales.map((r) => ({
      id: r.id,
      orderNumber: r.orderNumber,
      total: Number(r.total),
      discount: Number(r.discount ?? 0),
      paymentMethod: r.paymentMethod,
      createdAt: r.createdAt,
      operatorName: operatorById.get(r.operatorId) ?? null
    })),
    possibleDuplicates: findPossibleDuplicateSales(sales)
  };
}
async function listOpenShifts(eventId) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [eq4(shifts.status, "open")];
  if (eventId) conditions.push(eq4(shifts.eventId, eventId));
  const rows = await db.select().from(shifts).where(and3(...conditions)).orderBy(desc(shifts.openedAt));
  if (rows.length === 0) return [];
  const registerIds = Array.from(new Set(rows.map((r) => r.registerId).filter((id) => id != null)));
  const operatorIds = Array.from(new Set(rows.map((r) => r.operatorId).filter((id) => id != null)));
  const registerRows = registerIds.length ? await db.select({ id: registers.id, name: registers.name }).from(registers).where(inArray2(registers.id, registerIds)) : [];
  const operatorRows = operatorIds.length ? await db.select({ id: operators.id, name: operators.name }).from(operators).where(inArray2(operators.id, operatorIds)) : [];
  const registerById = new Map(registerRows.map((r) => [r.id, r.name]));
  const operatorById = new Map(operatorRows.map((o) => [o.id, o.name]));
  return rows.map((r) => ({
    id: r.id,
    eventId: r.eventId,
    registerName: r.registerId ? registerById.get(r.registerId) ?? "Caja eliminada" : "Sin caja asignada",
    operatorName: operatorById.get(r.operatorId) ?? "Operador eliminado",
    openedAt: r.openedAt,
    openingCash: Number(r.openingCash)
  }));
}
async function listShiftClosings(eventId) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [eq4(shifts.status, "closed")];
  if (eventId) conditions.push(eq4(shifts.eventId, eventId));
  const rows = await db.select().from(shifts).where(and3(...conditions)).orderBy(desc(shifts.closedAt));
  const eventIds = Array.from(new Set(rows.map((r) => r.eventId)));
  const registerIds = Array.from(new Set(rows.map((r) => r.registerId).filter((id) => id != null)));
  const operatorIds = Array.from(new Set([...rows.map((r) => r.operatorId), ...rows.map((r) => r.closedByOperatorId)].filter((id) => id != null)));
  const eventRows = eventIds.length ? await db.select({ id: events.id, title: events.title }).from(events).where(inArray2(events.id, eventIds)) : [];
  const registerRows = registerIds.length ? await db.select({ id: registers.id, name: registers.name }).from(registers).where(inArray2(registers.id, registerIds)) : [];
  const operatorRows = operatorIds.length ? await db.select({ id: operators.id, name: operators.name }).from(operators).where(inArray2(operators.id, operatorIds)) : [];
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
    // QR/transferencia: closeShift ya lo calculaba y lo guardaba, pero ni
    // este listado ni el panel ni el CSV lo devolvían -- al cuadrar desde
    // /admin esa plata aparecía evaporada.
    countedQr: Number(r.countedQr ?? 0),
    expectedQr: Number(r.expectedQr ?? 0),
    // Efectivo que salió del cajón para pagar gastos durante el turno -- ya
    // viene restado de `expectedCash`, se muestra aparte para que el arqueo
    // se pueda leer sin adivinar de dónde salió la resta.
    cashPaidOut: Number(r.cashPaidOut ?? 0),
    // "Esperado total" = ventas en efectivo del turno + el fondo inicial.
    // Es contra ESTE número que se compara lo contado; exportarlo evita la
    // resta a mano (y el descuadre falso) al reconciliar desde el CSV.
    expectedCashWithOpening: expectedCashWithOpening(Number(r.expectedCash ?? 0), Number(r.openingCash)),
    cashDiff: shiftCashDiff(Number(r.countedCash ?? 0), Number(r.expectedCash ?? 0), Number(r.openingCash)),
    // Tarjetas sumadas: ver `cardTotals`. Cuando el tipo de tarjeta se eligió
    // mal en la tablet, débito y crédito se descuadran en direcciones
    // opuestas y sólo el total dice cuánta plata falta realmente.
    countedCard: Number(r.countedDebit ?? 0) + Number(r.countedCredit ?? 0),
    expectedCard: Number(r.expectedDebit ?? 0) + Number(r.expectedCredit ?? 0),
    cardDiff: cardTotals({
      countedDebit: Number(r.countedDebit ?? 0),
      countedCredit: Number(r.countedCredit ?? 0),
      expectedDebit: Number(r.expectedDebit ?? 0),
      expectedCredit: Number(r.expectedCredit ?? 0)
    }).diff,
    debitDiff: Number(r.countedDebit ?? 0) - Number(r.expectedDebit ?? 0),
    creditDiff: Number(r.countedCredit ?? 0) - Number(r.expectedCredit ?? 0),
    qrDiff: Number(r.countedQr ?? 0) - Number(r.expectedQr ?? 0),
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
  await db.delete(shifts).where(eq4(shifts.id, shiftId));
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
    if (typeof campos["buyer__rut"] === "string" && campos["buyer__rut"].trim()) rut = campos["buyer__rut"].trim();
    if (typeof campos["buyer__instagram"] === "string" && campos["buyer__instagram"].trim()) instagram = campos["buyer__instagram"].trim();
  } catch {
  }
  const email = order.buyerEmail.trim().toLowerCase();
  const [existing] = await db.select().from(customers).where(eq4(customers.email, email)).limit(1);
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
    }).where(eq4(customers.id, existing.id));
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
  const dupConditions = params.opId ? and3(eq4(playcoinsLedger.opId, params.opId), eq4(playcoinsLedger.reason, params.reason)) : params.orderId ? and3(eq4(playcoinsLedger.orderId, params.orderId), eq4(playcoinsLedger.reason, params.reason)) : void 0;
  if (dupConditions) {
    const [dup] = await db.select().from(playcoinsLedger).where(dupConditions).limit(1);
    if (dup) return;
  }
  let [customer] = await db.select().from(customers).where(eq4(customers.email, email)).limit(1);
  if (!customer) {
    const [ins] = await db.insert(customers).values({ email, accessTypes: [], tags: [] });
    const insertId = ins.insertId;
    [customer] = await db.select().from(customers).where(eq4(customers.id, insertId)).limit(1);
  }
  const balanceAfter = customer.playcoins + points;
  await db.update(customers).set({ playcoins: balanceAfter }).where(eq4(customers.id, customer.id));
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
  const [customer] = await db.select().from(customers).where(eq4(customers.email, email)).limit(1);
  if (!customer) return { ok: false, conflictNote: "Cliente no encontrado para canjear Playcoins" };
  const redeemed = clampRedeemAmount(params.requestedAmount, customer.playcoins);
  if (redeemed <= 0) {
    return { ok: false, conflictNote: `Saldo insuficiente para canjear Playcoins (saldo actual: ${customer.playcoins})` };
  }
  if (redeemed < params.requestedAmount) {
    return { ok: false, conflictNote: `Saldo insuficiente: se pidieron ${params.requestedAmount} Playcoins pero solo hay ${customer.playcoins} disponibles` };
  }
  const balanceAfter = customer.playcoins - redeemed;
  await db.update(customers).set({ playcoins: balanceAfter }).where(eq4(customers.id, customer.id));
  await db.insert(playcoinsLedger).values({
    customerId: customer.id,
    delta: -redeemed,
    reason: "redeem_caja",
    opId: params.opId,
    balanceAfter
  });
  return { ok: true, redeemed, balanceAfter };
}
var CARD_PIN_MAX_ATTEMPTS = 5;
var CARD_PIN_LOCKOUT_MS = 15 * 60 * 1e3;
async function creditPrepaid(params) {
  const db = await getDb();
  if (!db) return;
  const email = params.email.trim().toLowerCase();
  if (!email || params.amountClp <= 0) return;
  let [customer] = await db.select().from(customers).where(eq4(customers.email, email)).limit(1);
  if (!customer) {
    const [ins] = await db.insert(customers).values({ email, accessTypes: [], tags: [] });
    const insertId = ins.insertId;
    [customer] = await db.select().from(customers).where(eq4(customers.id, insertId)).limit(1);
  }
  const balanceAfter = customer.prepaidBalance + params.amountClp;
  try {
    await db.insert(prepaidLedger).values({
      customerId: customer.id,
      delta: params.amountClp,
      reason: params.reason,
      orderId: params.orderId,
      balanceAfter
    });
  } catch (err) {
    const isDuplicate = err?.code === "ER_DUP_ENTRY" || /duplicate entry/i.test(String(err?.message ?? ""));
    if (!isDuplicate) throw err;
    return;
  }
  await db.update(customers).set({ prepaidBalance: balanceAfter }).where(eq4(customers.id, customer.id));
}
async function spendPrepaidAuthoritative(params) {
  const db = await getDb();
  if (!db) return { ok: false, conflictNote: "Base de datos no disponible" };
  if (!Number.isFinite(params.amountClp) || params.amountClp <= 0) return { ok: false, conflictNote: "Monto inv\xE1lido" };
  const [dup] = await db.select().from(prepaidLedger).where(and3(eq4(prepaidLedger.opId, params.opId), eq4(prepaidLedger.reason, params.reason))).limit(1);
  if (dup) return { ok: true, balanceAfter: dup.balanceAfter };
  const [result] = await db.update(customers).set({ prepaidBalance: sql2`prepaidBalance - ${params.amountClp}` }).where(and3(eq4(customers.id, params.customerId), sql2`prepaidBalance >= ${params.amountClp}`));
  const affectedRows = result.affectedRows;
  if (affectedRows === 0) {
    return { ok: false, conflictNote: "Saldo insuficiente para cubrir el 100% de esta venta" };
  }
  const [customer] = await db.select({ prepaidBalance: customers.prepaidBalance }).from(customers).where(eq4(customers.id, params.customerId)).limit(1);
  const balanceAfter = customer.prepaidBalance;
  await db.insert(prepaidLedger).values({
    customerId: params.customerId,
    delta: -params.amountClp,
    reason: params.reason,
    opId: params.opId,
    balanceAfter
  });
  return { ok: true, balanceAfter };
}
async function setCardPinAfterTopup(params) {
  const db = await getDb();
  if (!db) throw new Error("Base de datos no disponible");
  if (!/^\d{4}$/.test(params.pin)) throw new Error("El PIN debe tener 4 d\xEDgitos");
  const [order] = await db.select().from(orders).where(eq4(orders.orderNumber, params.orderNumber)).limit(1);
  if (!order) throw new Error("Orden no encontrada");
  if (order.paymentStatus !== "approved") throw new Error("Esta orden todav\xEDa no est\xE1 aprobada");
  const items = await db.select().from(orderItems).where(eq4(orderItems.orderId, order.id));
  const ttIds = items.map((i) => i.ticketTypeId);
  const tts = ttIds.length ? await db.select().from(ticketTypes).where(inArray2(ticketTypes.id, ttIds)) : [];
  if (!tts.some((tt) => isTopupProduct(tt))) throw new Error("Esta orden no incluye una carga de saldo");
  const email = order.buyerEmail.trim().toLowerCase();
  const [customer] = await db.select().from(customers).where(eq4(customers.email, email)).limit(1);
  if (!customer) throw new Error("No se encontr\xF3 la tarjeta de este comprador");
  if (customer.cardPinHash) {
    if (!params.currentPin) throw new Error("Ingresa tu PIN actual para cambiarlo");
    const rateLimitKey = `cardpin:${customer.id}`;
    if (!await checkIpRateLimit(rateLimitKey)) throw new Error("Demasiados intentos -- espera unos minutos");
    if (!verifyPin(params.currentPin, customer.cardPinHash)) {
      await recordIpAttempt(rateLimitKey, CARD_PIN_MAX_ATTEMPTS, CARD_PIN_LOCKOUT_MS);
      throw new Error("PIN actual incorrecto");
    }
  }
  await db.update(customers).set({ cardPinHash: hashPin(params.pin), cardPinSetAt: /* @__PURE__ */ new Date() }).where(eq4(customers.id, customer.id));
  return { success: true };
}
async function verifyCardPin(params) {
  const db = await getDb();
  if (!db) return { ok: false, reason: "Base de datos no disponible" };
  const email = params.email.trim().toLowerCase();
  const [customer] = await db.select().from(customers).where(eq4(customers.email, email)).limit(1);
  if (!customer || !customer.cardPinHash) return { ok: false, reason: "Esta tarjeta todav\xEDa no tiene PIN definido" };
  const rateLimitKey = `cardpin:${customer.id}`;
  if (!await checkIpRateLimit(rateLimitKey)) return { ok: false, reason: "Demasiados intentos -- espera unos minutos" };
  if (!verifyPin(params.pin, customer.cardPinHash)) {
    await recordIpAttempt(rateLimitKey, CARD_PIN_MAX_ATTEMPTS, CARD_PIN_LOCKOUT_MS);
    return { ok: false, reason: "PIN incorrecto" };
  }
  return { ok: true, customerId: customer.id };
}
async function reversePrepaidForDeletedOrder(customerId, delta, orderId, orderNumber) {
  const db = await getDb();
  if (!db) return;
  const [customer] = await db.select().from(customers).where(eq4(customers.id, customerId)).limit(1);
  if (!customer) return;
  const balanceAfter = Math.max(0, customer.prepaidBalance + delta);
  const appliedDelta = balanceAfter - customer.prepaidBalance;
  if (appliedDelta === 0) return;
  try {
    await db.insert(prepaidLedger).values({
      customerId,
      delta: appliedDelta,
      reason: "refund",
      orderId,
      balanceAfter,
      note: `Orden #${orderNumber} eliminada`
    });
  } catch (err) {
    const isDuplicate = err?.code === "ER_DUP_ENTRY" || /duplicate entry/i.test(String(err?.message ?? ""));
    if (!isDuplicate) throw err;
    return;
  }
  await db.update(customers).set({ prepaidBalance: balanceAfter }).where(eq4(customers.id, customerId));
}
async function getPlaycoinsBalance(email) {
  const db = await getDb();
  if (!db) return null;
  const [customer] = await db.select().from(customers).where(eq4(customers.email, email.trim().toLowerCase())).limit(1);
  if (!customer) return null;
  return { email: customer.email, playcoins: customer.playcoins };
}
var PREPAID_REASON_LABEL = {
  topup_web: "Recarga de saldo",
  spend_caja: "Compra en caja",
  spend_puerta: "Estacionamiento en puerta",
  refund: "Devoluci\xF3n",
  manual_adjust: "Ajuste"
};
var PLAYCOINS_REASON_LABEL = {
  earn_web: "Ganados por tu compra",
  earn_caja: "Ganados en caja",
  redeem_caja: "Canje en caja",
  manual_adjust: "Ajuste"
};
async function getWalletForTicket(ticketCode) {
  const db = await getDb();
  if (!db) return null;
  const [ticket] = await db.select().from(tickets).where(eq4(tickets.ticketCode, ticketCode)).limit(1);
  if (!ticket) return null;
  const [order] = await db.select().from(orders).where(eq4(orders.id, ticket.orderId)).limit(1);
  const email = order?.buyerEmail?.trim().toLowerCase();
  if (!email) return null;
  const [customer] = await db.select().from(customers).where(eq4(customers.email, email)).limit(1);
  if (!customer) return null;
  const [prepaidRows, playcoinsRows] = await Promise.all([
    db.select().from(prepaidLedger).where(eq4(prepaidLedger.customerId, customer.id)).orderBy(desc(prepaidLedger.createdAt)).limit(6),
    db.select().from(playcoinsLedger).where(eq4(playcoinsLedger.customerId, customer.id)).orderBy(desc(playcoinsLedger.createdAt)).limit(6)
  ]);
  const movements = [
    ...prepaidRows.map((r) => ({
      type: "money",
      label: PREPAID_REASON_LABEL[r.reason] ?? r.reason,
      delta: r.delta,
      createdAt: r.createdAt
    })),
    ...playcoinsRows.map((r) => ({
      type: "points",
      label: PLAYCOINS_REASON_LABEL[r.reason] ?? r.reason,
      delta: r.delta,
      createdAt: r.createdAt
    }))
  ].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, 6);
  return {
    prepaidBalance: customer.prepaidBalance,
    playcoins: customer.playcoins,
    cardPinSet: !!customer.cardPinHash,
    movements
  };
}
async function adjustPlaycoinsManually(customerId, delta, note) {
  const db = await getDb();
  if (!db) return;
  const [customer] = await db.select().from(customers).where(eq4(customers.id, customerId)).limit(1);
  if (!customer) return;
  const balanceAfter = Math.max(0, customer.playcoins + delta);
  const appliedDelta = balanceAfter - customer.playcoins;
  await db.update(customers).set({ playcoins: balanceAfter }).where(eq4(customers.id, customerId));
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
    const approvedOrders = await db.select({ buyerEmail: orders.buyerEmail }).from(orders).where(and3(
      eq4(orders.eventId, filters.eventId),
      eq4(orders.paymentStatus, "approved")
    ));
    const emails = new Set(approvedOrders.map((o) => o.buyerEmail.toLowerCase()));
    rows = rows.filter((c) => emails.has(c.email.toLowerCase()));
  }
  if (filters.notPurchasedEventId) {
    const approvedOrders = await db.select({ buyerEmail: orders.buyerEmail }).from(orders).where(and3(
      eq4(orders.eventId, filters.notPurchasedEventId),
      eq4(orders.paymentStatus, "approved")
    ));
    const emails = new Set(approvedOrders.map((o) => o.buyerEmail.toLowerCase()));
    rows = rows.filter((c) => !emails.has(c.email.toLowerCase()));
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
  return db.select().from(customers).where(inArray2(customers.id, ids));
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
async function cancelMailingCampaign(campaignId) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [campaign] = await db.select().from(mailingCampaigns).where(eq4(mailingCampaigns.id, campaignId)).limit(1);
  if (!campaign) throw new Error("Esa campa\xF1a no existe");
  if (campaign.status !== "sending") throw new Error("Esa campa\xF1a ya termin\xF3 o ya est\xE1 cancelada");
  await db.update(mailingCampaigns).set({ status: "cancelled" }).where(eq4(mailingCampaigns.id, campaignId));
  return { success: true };
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
  }).from(mailingRecipients).innerJoin(customers, eq4(customers.id, mailingRecipients.customerId)).where(eq4(mailingRecipients.campaignId, campaignId)).orderBy(mailingRecipients.id);
}
async function logMailingSend(input) {
  const db = await getDb();
  if (!db) return;
  await db.insert(mailingSendLog).values({
    batchId: input.batchId,
    source: input.source,
    label: input.label,
    customerId: input.customerId,
    email: input.email,
    success: input.success ? 1 : 0,
    reason: input.reason ?? null
  });
}
async function listRecentMailingSendBatches(limit = 10) {
  const db = await getDb();
  if (!db) return [];
  return db.select({
    batchId: mailingSendLog.batchId,
    source: sql2`MIN(${mailingSendLog.source})`,
    label: sql2`MIN(${mailingSendLog.label})`,
    startedAt: sql2`MIN(${mailingSendLog.sentAt})`,
    total: sql2`COUNT(*)`,
    sentCount: sql2`SUM(${mailingSendLog.success})`
  }).from(mailingSendLog).groupBy(mailingSendLog.batchId).orderBy(desc(sql2`MIN(${mailingSendLog.sentAt})`)).limit(limit);
}
async function getMailingSendLogForBatch(batchId) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(mailingSendLog).where(eq4(mailingSendLog.batchId, batchId)).orderBy(mailingSendLog.sentAt);
}
async function countAutomatedEmailsSentToday(now = /* @__PURE__ */ new Date()) {
  const db = await getDb();
  if (!db) return 0;
  const dayStart = startOfChileDay(now);
  const [mailing] = await db.select({ count: sql2`count(*)` }).from(mailingRecipients).where(and3(eq4(mailingRecipients.status, "sent"), gte(mailingRecipients.sentAt, dayStart)));
  const [reminders] = await db.select({ count: sql2`count(*)` }).from(orders).where(gte(orders.reminderSentAt, dayStart));
  return Number(mailing?.count ?? 0) + Number(reminders?.count ?? 0);
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
  }).from(mailingRecipients).innerJoin(mailingCampaigns, eq4(mailingCampaigns.id, mailingRecipients.campaignId)).innerJoin(customers, eq4(customers.id, mailingRecipients.customerId)).where(and3(eq4(mailingRecipients.status, "pending"), eq4(mailingCampaigns.status, "sending"))).orderBy(mailingCampaigns.createdAt, mailingRecipients.id).limit(limit);
}
async function markMailingRecipientResult(recipientId, campaignId, success, reason) {
  const db = await getDb();
  if (!db) return;
  await db.update(mailingRecipients).set({
    status: success ? "sent" : "failed",
    reason: success ? null : (reason ?? "Error desconocido").slice(0, 500),
    sentAt: success ? /* @__PURE__ */ new Date() : null
  }).where(eq4(mailingRecipients.id, recipientId));
  await db.update(mailingCampaigns).set({
    sentCount: sql2`sentCount + ${success ? 1 : 0}`,
    failedCount: sql2`failedCount + ${success ? 0 : 1}`
  }).where(eq4(mailingCampaigns.id, campaignId));
  const [remaining] = await db.select({ count: sql2`COUNT(*)` }).from(mailingRecipients).where(and3(eq4(mailingRecipients.campaignId, campaignId), eq4(mailingRecipients.status, "pending")));
  if (Number(remaining.count) === 0) {
    await db.update(mailingCampaigns).set({ status: "done" }).where(eq4(mailingCampaigns.id, campaignId));
  }
}
async function bulkAddTagByEmails(emails, tag) {
  const db = await getDb();
  const cleanTag = tag.trim();
  const normalizedEmails = Array.from(new Set(emails.map((e) => e.trim().toLowerCase()).filter(Boolean)));
  if (!db || !cleanTag || normalizedEmails.length === 0) {
    return { tagged: 0, alreadyTagged: 0, notFound: normalizedEmails };
  }
  const matches = await db.select().from(customers).where(inArray2(customers.email, normalizedEmails));
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
    await db.update(customers).set({ tags: [...tags, cleanTag] }).where(eq4(customers.id, customer.id));
    tagged++;
  }
  return { tagged, alreadyTagged, notFound };
}
async function addCustomerTag(customerId, tag) {
  const db = await getDb();
  if (!db) return;
  const [customer] = await db.select().from(customers).where(eq4(customers.id, customerId)).limit(1);
  if (!customer) return;
  const tags = Array.isArray(customer.tags) ? customer.tags : [];
  const clean = tag.trim();
  if (!clean || tags.includes(clean)) return;
  await db.update(customers).set({ tags: [...tags, clean] }).where(eq4(customers.id, customerId));
}
async function removeCustomerTag(customerId, tag) {
  const db = await getDb();
  if (!db) return;
  const [customer] = await db.select().from(customers).where(eq4(customers.id, customerId)).limit(1);
  if (!customer) return;
  const tags = Array.isArray(customer.tags) ? customer.tags : [];
  await db.update(customers).set({ tags: tags.filter((t2) => t2 !== tag) }).where(eq4(customers.id, customerId));
}
async function importCustomers(rows) {
  const db = await getDb();
  if (!db) return { imported: 0, updated: 0 };
  let imported = 0;
  let updated = 0;
  for (const row of rows) {
    const email = row.email.trim().toLowerCase();
    if (!email) continue;
    const [existing] = await db.select().from(customers).where(eq4(customers.email, email)).limit(1);
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
      }).where(eq4(customers.id, existing.id));
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
  const [ticket] = await db.select().from(tickets).where(eq4(tickets.ticketCode, ticketCode.trim())).limit(1);
  if (!ticket) return null;
  const [event] = await db.select().from(events).where(eq4(events.id, ticket.eventId)).limit(1);
  if (!event) return null;
  const [profile] = await db.select().from(partyProfiles).where(eq4(partyProfiles.ticketId, ticket.id)).limit(1);
  return { ticket, event, profile: profile ?? null };
}
async function resolvePartyEntryCode(rawCode) {
  const db = await getDb();
  if (!db) return null;
  const code = rawCode.trim().toUpperCase();
  if (!code) return null;
  const [byTicket] = await db.select().from(tickets).where(eq4(tickets.ticketCode, code)).limit(1);
  if (byTicket) return byTicket.ticketCode;
  const [order] = await db.select().from(orders).where(eq4(orders.orderNumber, code)).limit(1);
  if (!order) return null;
  const orderTickets = await db.select().from(tickets).where(eq4(tickets.orderId, order.id));
  for (const t2 of orderTickets) {
    const [tt] = await db.select().from(ticketTypes).where(eq4(ticketTypes.id, t2.ticketTypeId)).limit(1);
    if (tt?.category === "acceso") return t2.ticketCode;
  }
  return orderTickets[0]?.ticketCode ?? null;
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
  const [profile] = await db.select().from(partyProfiles).where(eq4(partyProfiles.ticketId, params.ticketId)).limit(1);
  return profile;
}
async function updatePartyProfile(profileId, data) {
  const db = await getDb();
  if (!db) return;
  await db.update(partyProfiles).set(data).where(eq4(partyProfiles.id, profileId));
}
async function getPartyHiddenIds(db, profileId) {
  const rows = await db.select().from(partyBlocks).where(or(eq4(partyBlocks.blockerProfileId, profileId), eq4(partyBlocks.blockedProfileId, profileId)));
  const hidden = /* @__PURE__ */ new Set();
  for (const r of rows) {
    hidden.add(r.blockerProfileId === profileId ? r.blockedProfileId : r.blockerProfileId);
  }
  return hidden;
}
async function getPartyConnectionsFor(db, profileId) {
  return db.select().from(partyConnections).where(or(eq4(partyConnections.profileLowId, profileId), eq4(partyConnections.profileHighId, profileId)));
}
async function listPartyMansion(profileId, eventId) {
  const db = await getDb();
  if (!db) return null;
  await db.update(partyProfiles).set({ lastSeenAt: /* @__PURE__ */ new Date() }).where(eq4(partyProfiles.id, profileId));
  const [hidden, connections, profiles] = await Promise.all([
    getPartyHiddenIds(db, profileId),
    getPartyConnectionsFor(db, profileId),
    db.select().from(partyProfiles).where(and3(eq4(partyProfiles.eventId, eventId), eq4(partyProfiles.active, 1)))
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
  const [target] = await db.select().from(partyProfiles).where(eq4(partyProfiles.id, targetProfileId)).limit(1);
  if (!target || target.eventId !== eventId || target.active !== 1) {
    return { ok: false, reason: "Esa persona ya no est\xE1 en la fiesta" };
  }
  const hidden = await getPartyHiddenIds(db, profileId);
  if (hidden.has(targetProfileId)) return { ok: false, reason: "Esa persona ya no est\xE1 en la fiesta" };
  const { low, high } = orderedPair(profileId, targetProfileId);
  const [existing] = await db.select().from(partyConnections).where(and3(eq4(partyConnections.profileLowId, low), eq4(partyConnections.profileHighId, high))).limit(1);
  if (existing) {
    if (existing.initiatedById === profileId) {
      return existing.status === "accepted" ? { ok: true, status: "accepted", connectionId: existing.id } : { ok: true, status: "pending", connectionId: existing.id };
    }
    if (existing.status === "pending") {
      await db.update(partyConnections).set({ status: "accepted", respondedAt: /* @__PURE__ */ new Date() }).where(eq4(partyConnections.id, existing.id));
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
  const [created] = await db.select().from(partyConnections).where(and3(eq4(partyConnections.profileLowId, low), eq4(partyConnections.profileHighId, high))).limit(1);
  return { ok: true, status: "pending", connectionId: created.id };
}
async function respondToPartyTouch(profileId, connectionId, accept) {
  const db = await getDb();
  if (!db) return { ok: false, reason: "Base de datos no disponible" };
  const [c] = await db.select().from(partyConnections).where(eq4(partyConnections.id, connectionId)).limit(1);
  if (!c) return { ok: false, reason: "Ese toque ya no existe" };
  if (c.profileLowId !== profileId && c.profileHighId !== profileId) return { ok: false, reason: "No es tu toque" };
  if (c.initiatedById === profileId) return { ok: false, reason: "No puedes responder tu propio toque" };
  if (c.status !== "pending") return { ok: true, status: c.status };
  const status = accept ? "accepted" : "declined";
  await db.update(partyConnections).set({ status, respondedAt: /* @__PURE__ */ new Date() }).where(eq4(partyConnections.id, connectionId));
  return { ok: true, status };
}
async function getAcceptedConnection(db, profileId, connectionId) {
  const [c] = await db.select().from(partyConnections).where(eq4(partyConnections.id, connectionId)).limit(1);
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
  const [other] = await db.select().from(partyProfiles).where(eq4(partyProfiles.id, otherId)).limit(1);
  const messages = await db.select().from(partyMessages).where(eq4(partyMessages.connectionId, connectionId)).orderBy(partyMessages.createdAt);
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
  return { ok: true, otherId };
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
async function listAllPartyReports(limit = 200) {
  const db = await getDb();
  if (!db) return [];
  return db.select({
    id: partyReports.id,
    reason: partyReports.reason,
    createdAt: partyReports.createdAt,
    resolvedAt: partyReports.resolvedAt,
    eventTitle: events.title,
    reporterAlias: sql2`reporter.alias`,
    reportedAlias: sql2`reported.alias`,
    reportedZone: sql2`reported.zone`
  }).from(partyReports).leftJoin(events, eq4(events.id, partyReports.eventId)).leftJoin(sql2`${partyProfiles} as reporter`, sql2`reporter.id = ${partyReports.reporterProfileId}`).leftJoin(sql2`${partyProfiles} as reported`, sql2`reported.id = ${partyReports.reportedProfileId}`).orderBy(sql2`${partyReports.resolvedAt} is not null`, desc(partyReports.createdAt)).limit(limit);
}
async function setPartyReportResolved(id, resolved) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(partyReports).set({ resolvedAt: resolved ? /* @__PURE__ */ new Date() : null }).where(eq4(partyReports.id, id));
  return { success: true };
}
async function purgeOldPartyMessages(now = /* @__PURE__ */ new Date()) {
  const db = await getDb();
  if (!db) return { deletedFor: 0 };
  const cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1e3);
  const oldEvents = await db.select({ id: events.id }).from(events).where(lte(events.eventEnd, cutoff));
  if (oldEvents.length === 0) return { deletedFor: 0 };
  const eventIds = oldEvents.map((e) => e.id);
  const conns = await db.select({ id: partyConnections.id }).from(partyConnections).where(inArray2(partyConnections.eventId, eventIds));
  if (conns.length === 0) return { deletedFor: 0 };
  await db.delete(partyMessages).where(inArray2(partyMessages.connectionId, conns.map((c) => c.id)));
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
  const claimable = await db.select().from(partyGifts).where(eq4(partyGifts.status, "paid"));
  const keep = new Set(claimable.flatMap((g) => [g.fromProfileId, g.toProfileId]));
  const profiles = await db.select({ id: partyProfiles.id }).from(partyProfiles).where(inArray2(partyProfiles.eventId, eventIds));
  const toDelete = profiles.map((p) => p.id).filter((id) => !keep.has(id));
  if (toDelete.length === 0) return { profilesDeleted: 0 };
  await db.delete(partyConnections).where(inArray2(partyConnections.eventId, eventIds));
  await db.delete(partyBlocks).where(inArray2(partyBlocks.eventId, eventIds));
  await db.delete(partyReports).where(inArray2(partyReports.eventId, eventIds));
  await db.delete(partyProfiles).where(inArray2(partyProfiles.id, toDelete));
  return { profilesDeleted: toDelete.length };
}
async function listPartyDrinks(eventId) {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.select().from(ticketTypes).where(and3(eq4(ticketTypes.eventId, eventId), eq4(ticketTypes.category, "extra"), eq4(ticketTypes.status, "active"))).orderBy(ticketTypes.sortOrder);
  return rows.map((t2) => ({ id: t2.id, name: t2.name, price: Number(t2.price), description: t2.description }));
}
async function createGiftInvitation(params) {
  const db = await getDb();
  if (!db) return { ok: false, reason: "Base de datos no disponible" };
  if (params.fromProfileId === params.toProfileId) return { ok: false, reason: "No puedes invitarte un trago a ti mismo" };
  const [target] = await db.select().from(partyProfiles).where(eq4(partyProfiles.id, params.toProfileId)).limit(1);
  if (!target || target.eventId !== params.eventId || target.active !== 1) {
    return { ok: false, reason: "Esa persona ya no est\xE1 en la fiesta" };
  }
  const hidden = await getPartyHiddenIds(db, params.fromProfileId);
  if (hidden.has(params.toProfileId)) return { ok: false, reason: "Esa persona ya no est\xE1 en la fiesta" };
  const [tt] = await db.select().from(ticketTypes).where(eq4(ticketTypes.id, params.ticketTypeId)).limit(1);
  if (!tt || tt.eventId !== params.eventId || tt.category !== "extra" || tt.status !== "active") {
    return { ok: false, reason: "Ese trago no est\xE1 disponible" };
  }
  const existing = await db.select().from(partyGifts).where(and3(
    eq4(partyGifts.fromProfileId, params.fromProfileId),
    eq4(partyGifts.toProfileId, params.toProfileId),
    inArray2(partyGifts.status, ["invited", "accepted"])
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
  const [created] = await db.select().from(partyGifts).where(and3(eq4(partyGifts.fromProfileId, params.fromProfileId), eq4(partyGifts.toProfileId, params.toProfileId))).orderBy(desc(partyGifts.id)).limit(1);
  return { ok: true, giftId: created.id };
}
async function respondToGiftInvitation(profileId, giftId, accept) {
  const db = await getDb();
  if (!db) return { ok: false, reason: "Base de datos no disponible" };
  const [gift] = await db.select().from(partyGifts).where(eq4(partyGifts.id, giftId)).limit(1);
  if (!gift) return { ok: false, reason: "Esa invitaci\xF3n ya no existe" };
  if (!canRespondToGift(gift, profileId)) return { ok: false, reason: "Esa invitaci\xF3n ya no est\xE1 disponible" };
  const status = accept ? "accepted" : "declined";
  await db.update(partyGifts).set({ status, respondedAt: /* @__PURE__ */ new Date() }).where(eq4(partyGifts.id, giftId));
  return { ok: true, status };
}
async function createGiftOrder(profileId, giftId, buyer) {
  const db = await getDb();
  if (!db) return { ok: false, reason: "Base de datos no disponible" };
  const [gift] = await db.select().from(partyGifts).where(eq4(partyGifts.id, giftId)).limit(1);
  if (!gift) return { ok: false, reason: "Esa invitaci\xF3n ya no existe" };
  if (!canPayGift(gift, profileId)) return { ok: false, reason: "Esta invitaci\xF3n ya no se puede pagar" };
  if (gift.orderId) {
    const [existing] = await db.select().from(orders).where(eq4(orders.id, gift.orderId)).limit(1);
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
  await db.update(partyGifts).set({ orderId }).where(eq4(partyGifts.id, giftId));
  return { ok: true, orderNumber, total };
}
async function getPartyGiftByOrderId(orderId) {
  const db = await getDb();
  if (!db) return null;
  const [gift] = await db.select().from(partyGifts).where(eq4(partyGifts.orderId, orderId)).limit(1);
  return gift ?? null;
}
async function markGiftPaid(giftId, ticketId, displayCode) {
  const db = await getDb();
  if (!db) return;
  await db.update(partyGifts).set({ status: "paid", ticketId, displayCode, paidAt: /* @__PURE__ */ new Date() }).where(eq4(partyGifts.id, giftId));
}
async function listMyGifts(profileId) {
  const db = await getDb();
  if (!db) return { received: [], sent: [] };
  const rows = await db.select().from(partyGifts).where(or(eq4(partyGifts.toProfileId, profileId), eq4(partyGifts.fromProfileId, profileId))).orderBy(desc(partyGifts.id));
  const profileIds = Array.from(new Set(rows.flatMap((g) => [g.fromProfileId, g.toProfileId])));
  const profiles = profileIds.length ? await db.select().from(partyProfiles).where(inArray2(partyProfiles.id, profileIds)) : [];
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
  const rows = await db.select().from(partyGifts).where(eq4(partyGifts.status, "paid"));
  if (rows.length === 0) return [];
  const profileIds = Array.from(new Set(rows.flatMap((g) => [g.fromProfileId, g.toProfileId])));
  const profiles = profileIds.length ? await db.select().from(partyProfiles).where(inArray2(partyProfiles.id, profileIds)) : [];
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
  const pending = await db.select().from(partyGifts).where(inArray2(partyGifts.status, ["invited", "accepted"]));
  const stale = pending.filter((g) => isGiftExpired(g, now));
  if (stale.length === 0) return { expired: 0 };
  await db.update(partyGifts).set({ status: "expired" }).where(inArray2(partyGifts.id, stale.map((g) => g.id)));
  return { expired: stale.length };
}
async function listPartyGiftsForEvent(eventId) {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.select().from(partyGifts).where(eq4(partyGifts.eventId, eventId)).orderBy(desc(partyGifts.id));
  const profileIds = Array.from(new Set(rows.flatMap((g) => [g.fromProfileId, g.toProfileId])));
  const profiles = profileIds.length ? await db.select().from(partyProfiles).where(inArray2(partyProfiles.id, profileIds)) : [];
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
  const [profile] = await db.select().from(partyProfiles).where(eq4(partyProfiles.id, profileId)).limit(1);
  if (!profile) return null;
  const [ticket] = await db.select().from(tickets).where(eq4(tickets.id, profile.ticketId)).limit(1);
  const [order] = ticket ? await db.select().from(orders).where(eq4(orders.id, ticket.orderId)).limit(1) : [null];
  return { alias: profile.alias, email: order?.buyerEmail ?? null };
}
async function getPartyProfileTicketCode(profileId) {
  const db = await getDb();
  if (!db) return null;
  const [profile] = await db.select().from(partyProfiles).where(eq4(partyProfiles.id, profileId)).limit(1);
  if (!profile) return null;
  const [ticket] = await db.select().from(tickets).where(eq4(tickets.id, profile.ticketId)).limit(1);
  return ticket?.ticketCode ?? null;
}
async function savePartyPushSubscription(data) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(partyPushSubscriptions).values(data).onDuplicateKeyUpdate({
    set: { profileId: data.profileId, eventId: data.eventId, p256dh: data.p256dh, auth: data.auth }
  });
  return { success: true };
}
async function deletePartyPushSubscription(endpoint) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(partyPushSubscriptions).where(eq4(partyPushSubscriptions.endpoint, endpoint));
  return { success: true };
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
  await db.update(adminTotp).set({ confirmedAt: /* @__PURE__ */ new Date(), backupCodes: hashedBackupCodes, lastUsedStep: timeStep }).where(eq4(adminTotp.id, id));
}
async function recordAdminTotpStep(id, timeStep) {
  const db = await getDb();
  if (!db) return;
  await db.update(adminTotp).set({ lastUsedStep: timeStep }).where(eq4(adminTotp.id, id));
}
async function consumeAdminBackupCodes(id, remaining) {
  const db = await getDb();
  if (!db) return;
  await db.update(adminTotp).set({ backupCodes: remaining }).where(eq4(adminTotp.id, id));
}
async function getAdminWebauthnCredentials() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(adminWebauthnCredentials).orderBy(desc(adminWebauthnCredentials.createdAt));
}
async function getAdminWebauthnCredentialById(credentialId) {
  const db = await getDb();
  if (!db) return null;
  const [row] = await db.select().from(adminWebauthnCredentials).where(eq4(adminWebauthnCredentials.credentialId, credentialId)).limit(1);
  return row ?? null;
}
async function saveAdminWebauthnCredential(params) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(adminWebauthnCredentials).values({
    credentialId: params.credentialId,
    publicKey: params.publicKey,
    counter: params.counter,
    transports: params.transports ?? null,
    deviceLabel: params.deviceLabel
  });
}
async function touchAdminWebauthnCredential(id, counter) {
  const db = await getDb();
  if (!db) return;
  await db.update(adminWebauthnCredentials).set({ counter, lastUsedAt: /* @__PURE__ */ new Date() }).where(eq4(adminWebauthnCredentials.id, id));
}
async function deleteAdminWebauthnCredential(id) {
  const db = await getDb();
  if (!db) return;
  await db.delete(adminWebauthnCredentials).where(eq4(adminWebauthnCredentials.id, id));
}
async function resetIpRateLimit(key) {
  const db = await getDb();
  if (!db) return;
  await db.delete(rateLimits).where(eq4(rateLimits.key, key));
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
import { SignJWT as SignJWT2, jwtVerify as jwtVerify2 } from "jose";
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
    return new SignJWT2({
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
      const { payload } = await jwtVerify2(cookieValue, secretKey, {
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
      return buildLocalUser(ADMIN_LOCAL_OPEN_ID, "Admin", "admin");
    }
    if (session.openId === VIEWER_LOCAL_OPEN_ID) {
      return buildLocalUser(VIEWER_LOCAL_OPEN_ID, "Invitado (demo)", "viewer");
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
var VIEWER_LOCAL_OPEN_ID = "admin-viewer";
function buildLocalUser(openId, name, role) {
  const now = /* @__PURE__ */ new Date();
  return {
    id: -1,
    openId,
    name,
    email: null,
    loginMethod: "password",
    role,
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
function registerOAuthRoutes(app2) {
  app2.get("/api/oauth/callback", async (req, res) => {
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

// server/caja/reportsPdf.ts
import PDFDocument from "pdfkit";

// server/caja/pdfHelpers.ts
var money = (n) => `$${Math.round(n).toLocaleString("es-CL")}`;
function drawReportHeader(doc, opts) {
  doc.fontSize(18).fillColor(INK).text(opts.title);
  doc.fontSize(12).fillColor(INK).text(opts.eventTitle);
  doc.moveDown(0.3);
  const emitido = new Intl.DateTimeFormat("es-CL", {
    timeZone: "America/Santiago",
    dateStyle: "long",
    timeStyle: "short"
  }).format(/* @__PURE__ */ new Date());
  doc.fontSize(9).fillColor(MUTED).text(`Mansion Playroom \xB7 emitido el ${emitido} (hora de Chile)`);
  if (opts.subtitle) doc.fontSize(10).fillColor(MUTED).text(opts.subtitle);
  if (opts.note) {
    doc.moveDown(0.2);
    doc.fontSize(8).fillColor(MUTED).text(opts.note);
  }
  doc.moveDown(0.6);
  const y = doc.y;
  doc.moveTo(doc.page.margins.left, y).lineTo(doc.page.width - doc.page.margins.right, y).strokeColor(BORDER).stroke();
  doc.y = y + 12;
  return doc.y;
}
function drawAmountRow(doc, label, amount, opts = {}) {
  const left = doc.page.margins.left;
  const right = doc.page.width - doc.page.margins.right;
  const y = doc.y;
  doc.fontSize(opts.strong ? 11 : 10).fillColor(opts.strong ? INK : MUTED);
  doc.text(label, left, y, { width: right - left - 110 });
  const labelBottom = doc.y;
  doc.fontSize(opts.strong ? 11 : 10).fillColor(opts.negative ? RED : opts.strong ? INK : MUTED).text(`${opts.negative ? "-" : ""}${money(Math.abs(amount))}`, right - 110, y, { width: 110, align: "right" });
  doc.y = Math.max(labelBottom, doc.y);
  if (opts.hint) {
    doc.fontSize(8).fillColor(MUTED).text(opts.hint, left + 12, doc.y, { width: right - left - 120 });
  }
  doc.moveDown(0.35);
}
var INK = "#1a1a1a";
var MUTED = "#666666";
var BORDER = "#dddddd";
var GREEN = "#1f9d55";
var RED = "#d9538f";
function drawTable(doc, columns, rows, startY) {
  const x = doc.page.margins.left;
  let y = startY;
  const totalWidth = columns.reduce((a, c) => a + c.width, 0);
  const drawHeader = () => {
    doc.fontSize(10).fillColor(INK);
    columns.forEach((c, i) => {
      doc.text(c.label, x + columns.slice(0, i).reduce((a, cc) => a + cc.width, 0), y, { width: c.width });
    });
    y += 16;
    doc.moveTo(x, y).lineTo(x + totalWidth, y).strokeColor(BORDER).stroke();
    y += 6;
  };
  drawHeader();
  for (const row of rows) {
    if (y > doc.page.height - doc.page.margins.bottom - 20) {
      doc.addPage();
      y = doc.page.margins.top;
      drawHeader();
    }
    doc.fontSize(10);
    row.forEach((cell, i) => {
      const text2 = typeof cell === "string" ? cell : cell.text;
      const color = typeof cell === "string" ? INK : cell.color ?? INK;
      doc.fillColor(color).text(text2, x + columns.slice(0, i).reduce((a, cc) => a + cc.width, 0), y, { width: columns[i].width });
    });
    y += 18;
  }
  return y;
}
function drawBarChart(doc, series, rows, x, y, width, height) {
  const maxValue = Math.max(1, ...rows.flatMap((r) => r.values));
  const groupWidth = width / rows.length;
  const barWidth = Math.min(36, groupWidth / (series.length + 1));
  const gap = 6;
  rows.forEach((row, i) => {
    const groupX = x + i * groupWidth + (groupWidth - barWidth * series.length - gap * (series.length - 1)) / 2;
    row.values.forEach((value, s) => {
      const h = value / maxValue * height;
      doc.rect(groupX + s * (barWidth + gap), y + height - h, barWidth, h).fill(series[s].color);
    });
    doc.fontSize(8).fillColor(MUTED).text(row.label, x + i * groupWidth, y + height + 6, { width: groupWidth, align: "center" });
  });
  const legendY = y + height + 22;
  let legendX = x;
  series.forEach((s) => {
    doc.fontSize(8).fillColor(s.color).text("\u25A0 ", legendX, legendY, { continued: true }).fillColor(MUTED).text(`${s.name}   `, { continued: true });
    legendX += 14 + s.name.length * 4.2 + 24;
  });
  doc.text("", { continued: false });
  return legendY + 14;
}

// server/caja/reportsPdf.ts
var METHOD_LABELS = {
  efectivo: "Efectivo",
  debito: "D\xE9bito",
  credito: "Cr\xE9dito",
  qr: "QR / transferencia",
  "sin medio": "Sin medio registrado"
};
function buildVentasReportPdf(eventTitle, rows, breakdown) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 40 });
    const chunks = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    const totalRevenue = rows.reduce((s, r) => s + r.revenue, 0);
    const totalProfit = rows.reduce((s, r) => s + (r.profit ?? 0), 0);
    drawReportHeader(doc, {
      title: "Ventas del evento",
      eventTitle,
      subtitle: breakdown ? `Recaudado: ${money(breakdown.total)} \xB7 ${breakdown.web.count + breakdown.caja.count} venta(s) aprobadas` : void 0,
      note: "Lo recaudado es la plata que entr\xF3 de verdad. La tabla de productos usa precios de lista, as\xED que sus totales pueden no coincidir: son dos preguntas distintas."
    });
    if (breakdown) {
      doc.fontSize(13).fillColor(INK).text("De d\xF3nde sali\xF3 la plata");
      doc.moveDown(0.5);
      const chartBottom = drawBarChart(
        doc,
        [{ name: "Recaudado", color: INK }],
        [
          { label: "Web", values: [breakdown.web.total] },
          { label: "Caja", values: [breakdown.caja.total] }
        ],
        doc.x,
        doc.y + 12,
        doc.page.width - doc.page.margins.left - doc.page.margins.right,
        90
      );
      doc.y = chartBottom + 14;
      const filas = [];
      filas.push([{ text: "Ventas web" }, String(breakdown.web.count), money(breakdown.web.total)]);
      for (const m of breakdown.web.byMethod) {
        filas.push([`    ${METHOD_LABELS[m.method] ?? m.method}`, String(m.count), money(m.total)]);
      }
      filas.push([{ text: "Ventas en caja" }, String(breakdown.caja.count), money(breakdown.caja.total)]);
      for (const m of breakdown.caja.byMethod) {
        filas.push([`    ${METHOD_LABELS[m.method] ?? m.method}`, String(m.count), money(m.total)]);
      }
      filas.push([{ text: "Total recaudado" }, String(breakdown.web.count + breakdown.caja.count), money(breakdown.total)]);
      const after = drawTable(
        doc,
        [{ label: "Origen", width: 240 }, { label: "Ventas", width: 80 }, { label: "Monto", width: 120 }],
        filas,
        doc.y
      );
      doc.y = after + 20;
    }
    doc.fontSize(13).fillColor(INK).text("Margen por producto");
    doc.moveDown(0.3);
    doc.fontSize(10).fillColor(MUTED).text(`A precio de lista: ${money(totalRevenue)} \xB7 utilidad ${money(totalProfit)}`);
    doc.moveDown(0.6);
    if (rows.length === 0) {
      doc.fontSize(10).fillColor(MUTED).text("Sin ventas registradas en este evento.");
    } else {
      drawTable(
        doc,
        [
          { label: "Producto", width: 170 },
          { label: "Unidades", width: 70 },
          { label: "Ingresos", width: 90 },
          { label: "Costo", width: 80 },
          { label: "Utilidad", width: 80 },
          { label: "Margen", width: 60 }
        ],
        rows.map((r) => [
          r.name,
          String(r.unitsSold),
          money(r.revenue),
          r.cost != null ? money(r.cost) : "\u2014",
          r.profit != null ? money(r.profit) : "\u2014",
          r.marginPercent != null ? `${r.marginPercent}%` : "\u2014"
        ]),
        doc.y
      );
    }
    doc.end();
  });
}
function buildGastosReportPdf(eventTitle, rows) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 40 });
    const chunks = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    doc.fontSize(18).fillColor(INK).text(`Reporte de gastos \u2014 ${eventTitle}`);
    doc.moveDown(1);
    const total = rows.reduce((s, r) => s + r.amountTotal, 0);
    doc.fontSize(11).fillColor(MUTED).text(`Total gastado: ${money(total)} (${rows.length} gastos)`);
    doc.moveDown(1);
    if (rows.length === 0) {
      doc.fontSize(10).fillColor(MUTED).text("Sin gastos registrados para este evento.");
    } else {
      drawTable(
        doc,
        [
          { label: "Fecha", width: 70 },
          { label: "Categor\xEDa", width: 90 },
          { label: "Descripci\xF3n", width: 160 },
          { label: "Proveedor", width: 90 },
          { label: "Monto", width: 70 }
        ],
        rows.map((r) => [
          new Date(r.expenseDate).toLocaleDateString("es-CL"),
          r.category,
          r.description,
          r.supplier ?? "\u2014",
          money(r.amountTotal)
        ]),
        doc.y
      );
    }
    doc.end();
  });
}

// server/caja/pnlPdf.ts
import PDFDocument2 from "pdfkit";
function buildPnlReportPdf(r) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument2({ size: "A4", margin: 40 });
    const chunks = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    drawReportHeader(doc, {
      title: "Resultado del evento",
      eventTitle: r.title,
      subtitle: `Fiesta del ${formatChileDate(r.eventDate, { withYear: true })} \xB7 mes contable ${r.monthKey}`,
      // Conviven dos definiciones de "ingreso" en el sistema y ninguna se
      // aclaraba en el PDF, así que dos reportes del mismo evento podían
      // mostrar cifras distintas sin explicar por qué.
      note: "El ingreso es la plata efectivamente recaudada (ventas web aprobadas + ventas de caja), no los precios de lista."
    });
    if (r.warnings.length > 0) {
      doc.fontSize(11).fillColor(RED).text("Ojo con estos n\xFAmeros");
      doc.moveDown(0.3);
      for (const w of r.warnings) {
        doc.fontSize(9).fillColor(MUTED).text(`\u2022 ${w}`, { width: doc.page.width - doc.page.margins.left - doc.page.margins.right });
      }
      doc.moveDown(0.8);
    }
    doc.fontSize(13).fillColor(INK).text("C\xF3mo se llega al resultado");
    doc.moveDown(0.5);
    drawAmountRow(doc, "Ingreso recaudado", r.grossIncome, { strong: true });
    if (r.ivaApplies) {
      drawAmountRow(doc, "IVA d\xE9bito fiscal", r.iva.debitoFiscal, {
        negative: true,
        hint: "Este evento se declara, as\xED que el IVA de las ventas no es ingreso propio."
      });
      drawAmountRow(doc, "Ingreso neto (sin IVA)", r.netIncome, { strong: true });
    }
    doc.moveDown(0.4);
    drawAmountRow(doc, "Costo de lo vendido en la barra", r.cogs, {
      negative: true,
      hint: r.cogsCoverage < 100 ? `Solo el ${r.cogsCoverage}% de las unidades vendidas tiene costo cargado, as\xED que este n\xFAmero est\xE1 incompleto.` : void 0
    });
    drawAmountRow(doc, "Gastos del evento", r.directExpensesTotal, { negative: true });
    for (const c of r.directByCategory) {
      doc.fontSize(9).fillColor(MUTED);
      const left2 = doc.page.margins.left + 12;
      const right2 = doc.page.width - doc.page.margins.right;
      const y2 = doc.y;
      doc.text(categoryLabel(c.category), left2, y2, { width: right2 - left2 - 110 });
      doc.text(money(c.amount), right2 - 110, y2, { width: 110, align: "right" });
      doc.moveDown(0.2);
    }
    doc.moveDown(0.2);
    drawAmountRow(doc, "Parte de los gastos de la productora", r.generalExpensesAssigned, {
      negative: true,
      hint: `Del total de ${money(r.generalExpensesMonthTotal)} del mes, a esta fiesta le toca el ${Math.round(r.prorationWeight * 100)}% seg\xFAn lo que vendi\xF3.`
    });
    if (r.ambassadorCommissions > 0) {
      drawAmountRow(doc, "Comisiones de embajadores", r.ambassadorCommissions, { negative: true });
    }
    if (r.cardFeeAmount > 0) {
      drawAmountRow(doc, `Comisi\xF3n de tarjeta (${r.cardFeePercent}%)`, r.cardFeeAmount, {
        negative: true,
        hint: "Sobre ventas web (completo) y caja con d\xE9bito/cr\xE9dito/QR -- el efectivo no paga comisi\xF3n."
      });
    }
    doc.moveDown(0.5);
    const y = doc.y;
    doc.moveTo(doc.page.margins.left, y).lineTo(doc.page.width - doc.page.margins.right, y).strokeColor(INK).stroke();
    doc.y = y + 10;
    const gano = r.netProfit >= 0;
    doc.fontSize(14).fillColor(gano ? GREEN : RED);
    const left = doc.page.margins.left;
    const right = doc.page.width - doc.page.margins.right;
    const ry = doc.y;
    doc.text(gano ? "Ganancia" : "P\xE9rdida", left, ry, { width: right - left - 140 });
    doc.text(money(Math.abs(r.netProfit)), right - 140, ry, { width: 140, align: "right" });
    doc.moveDown(0.4);
    if (r.marginPercent != null) {
      doc.fontSize(10).fillColor(MUTED).text(`Margen sobre el ingreso: ${r.marginPercent}%`, left);
    }
    if (r.ivaApplies) {
      doc.moveDown(1.2);
      doc.fontSize(13).fillColor(INK).text("IVA del per\xEDodo");
      doc.moveDown(0.5);
      drawTable(
        doc,
        [{ label: "Concepto", width: 220 }, { label: "Monto", width: 120 }],
        [
          ["D\xE9bito fiscal (ventas)", money(r.iva.debitoFiscal)],
          ["Cr\xE9dito fiscal (compras con factura)", money(r.iva.creditoFiscal)],
          r.iva.ivaAPagar > 0 ? [{ text: "IVA a pagar", color: RED }, { text: money(r.iva.ivaAPagar), color: RED }] : [{ text: "Remanente de cr\xE9dito a favor", color: GREEN }, { text: money(r.iva.remanenteCredito), color: GREEN }]
        ],
        doc.y
      );
    }
    doc.end();
  });
}

// server/caja/movementsPdf.ts
import PDFDocument3 from "pdfkit";
var TYPE_LABELS = {
  sale: "Venta",
  redeem: "Canje de entrada",
  checkin: "Ingreso en la puerta",
  shift_open: "Apertura de turno",
  shift_close: "Cierre de turno",
  manual_adjust: "Ajuste manual de supervisor",
  void_code: "Anulaci\xF3n",
  locker_return: "Entrega de guardarrop\xEDa",
  kitchen_update: "Cambio en un pedido de cocina"
};
function buildMovementsPdf(eventTitle, rows) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument3({ size: "A4", margin: 40, layout: "landscape" });
    const chunks = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    const byType = /* @__PURE__ */ new Map();
    for (const r of rows) byType.set(r.type, (byType.get(r.type) ?? 0) + 1);
    const resumen = Array.from(byType.entries()).sort((a, b) => b[1] - a[1]).map(([t2, n]) => `${TYPE_LABELS[t2] ?? t2}: ${n}`).join(" \xB7 ");
    drawReportHeader(doc, {
      title: "Movimientos detallados",
      eventTitle,
      subtitle: `${rows.length} operaci\xF3n(es) registradas${resumen ? ` \u2014 ${resumen}` : ""}`,
      note: "Registro append-only de los terminales: no se puede editar ni borrar desde el panel. Es la fuente de verdad de qu\xE9 pas\xF3 esa noche."
    });
    if (rows.length === 0) {
      doc.fontSize(10).fillColor(MUTED).text("Este evento todav\xEDa no tiene movimientos registrados.");
      doc.end();
      return;
    }
    drawTable(
      doc,
      [
        { label: "Fecha y hora", width: 130 },
        { label: "Operaci\xF3n", width: 150 },
        { label: "Qui\xE9n", width: 110 },
        { label: "Caja", width: 50 },
        { label: "Sobre", width: 120 },
        { label: "Resultado", width: 190 }
      ],
      rows.map((r) => {
        const problema = r.result !== "applied";
        const resultado = problema ? `${r.result}${r.conflictNote ? ` \u2014 ${r.conflictNote}` : ""}` : "OK";
        const anulacion = r.type === "void_code" || r.type === "manual_adjust";
        const color = problema || anulacion ? RED : void 0;
        return [
          formatChileDateTime(r.serverAt),
          { text: TYPE_LABELS[r.type] ?? r.type, color },
          r.operatorName,
          r.registerId != null ? `#${r.registerId}` : "\u2014",
          r.targetId ? `${r.targetType ?? ""} ${r.targetId}`.trim() : "\u2014",
          { text: resultado, color }
        ];
      }),
      doc.y
    );
    doc.moveDown(1);
    doc.fontSize(8).fillColor(MUTED).text(
      "Las anulaciones y los ajustes de supervisor van en rojo. Si un movimiento aparece con un resultado distinto de OK, ah\xED est\xE1 la explicaci\xF3n de por qu\xE9 no se aplic\xF3."
    );
    doc.end();
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
function registerAdminRoutes(app2) {
  app2.get("/api/admin/orders/export.csv", async (req, res) => {
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
        createdAt: r.createdAt ? formatChileDateTime(r.createdAt) : ""
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
  app2.get("/api/admin/customers/export.csv", async (req, res) => {
    if (!await requireAdmin(req, res)) return;
    const { search, accessType, tag } = req.query;
    const rows = await listCustomers({ search, accessType, tag });
    const csv = toCsv(
      rows.map((c) => ({
        ...c,
        accessTypes: Array.isArray(c.accessTypes) ? c.accessTypes.join(";") : "",
        tags: Array.isArray(c.tags) ? c.tags.join(";") : "",
        firstSeenAt: c.firstSeenAt ? formatChileDateTime(c.firstSeenAt) : "",
        lastSeenAt: c.lastSeenAt ? formatChileDateTime(c.lastSeenAt) : ""
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
  app2.post("/api/admin/customers/import.csv", async (req, res) => {
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
  app2.get("/api/admin/shifts/export.csv", async (req, res) => {
    if (!await requireAdmin(req, res)) return;
    const { eventId } = req.query;
    const rows = await getShiftClosingsForExport(eventId ? Number(eventId) : void 0);
    const csv = toCsv(
      rows.map((r) => ({
        ...r,
        openedAt: r.openedAt ? formatChileDateTime(r.openedAt) : "",
        closedAt: r.closedAt ? formatChileDateTime(r.closedAt) : "",
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
        { key: "openingCash", label: "Efectivo inicial (fondo)" },
        { key: "expectedCash", label: "Ventas en efectivo del turno" },
        { key: "cashPaidOut", label: "Gastos pagados del caj\xF3n" },
        // Sin esta columna, en Excel "Contado - Esperado" no daba nunca la
        // "Diferencia efectivo" de la columna siguiente: la brecha era
        // exactamente el fondo inicial, que el esperado exportado no incluía
        // pero la diferencia sí restaba. Ésta es la cifra contra la que se
        // compara de verdad lo que hay en el cajón.
        { key: "expectedCashWithOpening", label: "Esperado total (con fondo)" },
        { key: "countedCash", label: "Efectivo contado" },
        { key: "cashDiff", label: "Diferencia efectivo" },
        { key: "countedDebit", label: "D\xE9bito contado" },
        { key: "expectedDebit", label: "D\xE9bito esperado" },
        { key: "debitDiff", label: "Diferencia d\xE9bito" },
        { key: "countedCredit", label: "Cr\xE9dito contado" },
        { key: "expectedCredit", label: "Cr\xE9dito esperado" },
        { key: "creditDiff", label: "Diferencia cr\xE9dito" },
        // Débito + crédito juntos: cuando el tipo de tarjeta se eligió mal en
        // la tablet, las dos columnas de arriba se descuadran en direcciones
        // opuestas y ninguna dice cuánta plata falta de verdad. Ésta sí.
        { key: "countedCard", label: "Tarjetas contado (total)" },
        { key: "expectedCard", label: "Tarjetas esperado (total)" },
        { key: "cardDiff", label: "Diferencia tarjetas (total)" },
        // QR / transferencia: se cobraba y se guardaba, pero no salía en
        // ningún export -- al cuadrar desde el admin esa plata parecía
        // haberse evaporado.
        { key: "countedQr", label: "QR/transferencia contado" },
        { key: "expectedQr", label: "QR/transferencia esperado" },
        { key: "qrDiff", label: "Diferencia QR/transferencia" },
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
  app2.get("/api/admin/gastos/ventas.csv", async (req, res) => {
    if (!await requireAdmin(req, res)) return;
    const eventId = Number(req.query.eventId);
    if (!eventId) {
      res.status(400).json({ error: "eventId requerido" });
      return;
    }
    const rows = await getProfitReport(eventId);
    const csv = toCsv(rows, [
      { key: "name", label: "Producto" },
      { key: "category", label: "Categor\xEDa" },
      { key: "groupName", label: "Grupo" },
      { key: "unitsSold", label: "Unidades" },
      { key: "revenue", label: "Ingresos" },
      { key: "cost", label: "Costo" },
      { key: "profit", label: "Utilidad" },
      { key: "marginPercent", label: "Margen %" }
    ]);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="ventas-${(/* @__PURE__ */ new Date()).toISOString().slice(0, 10)}.csv"`);
    res.send("\uFEFF" + csv);
  });
  app2.get("/api/admin/gastos/ventas.pdf", async (req, res) => {
    if (!await requireAdmin(req, res)) return;
    const eventId = Number(req.query.eventId);
    if (!eventId) {
      res.status(400).json({ error: "eventId requerido" });
      return;
    }
    const [event, rows, breakdown] = await Promise.all([
      getEventById(eventId),
      getProfitReport(eventId),
      getEventSalesBreakdown(eventId)
    ]);
    const pdf = await buildVentasReportPdf(event?.title ?? `Evento #${eventId}`, rows, breakdown);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="ventas-${(/* @__PURE__ */ new Date()).toISOString().slice(0, 10)}.pdf"`);
    res.send(pdf);
  });
  app2.get("/api/admin/gastos/gastos.csv", async (req, res) => {
    if (!await requireAdmin(req, res)) return;
    const eventId = Number(req.query.eventId);
    if (!eventId) {
      res.status(400).json({ error: "eventId requerido" });
      return;
    }
    const rows = await listExpenses({ eventId });
    const csv = toCsv(
      rows.map((r) => ({ ...r, expenseDate: r.expenseDate ? formatChileDateTime(r.expenseDate) : "" })),
      [
        { key: "expenseDate", label: "Fecha" },
        { key: "category", label: "Categor\xEDa" },
        { key: "description", label: "Descripci\xF3n" },
        { key: "supplier", label: "Proveedor" },
        { key: "amountTotal", label: "Monto" },
        { key: "paymentMethod", label: "Medio de pago" }
      ]
    );
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="gastos-${(/* @__PURE__ */ new Date()).toISOString().slice(0, 10)}.csv"`);
    res.send("\uFEFF" + csv);
  });
  app2.get("/api/admin/gastos/gastos.pdf", async (req, res) => {
    if (!await requireAdmin(req, res)) return;
    const eventId = Number(req.query.eventId);
    if (!eventId) {
      res.status(400).json({ error: "eventId requerido" });
      return;
    }
    const [event, rows] = await Promise.all([getEventById(eventId), listExpenses({ eventId })]);
    const pdf = await buildGastosReportPdf(event?.title ?? `Evento #${eventId}`, rows);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="gastos-${(/* @__PURE__ */ new Date()).toISOString().slice(0, 10)}.pdf"`);
    res.send(pdf);
  });
  app2.get("/api/admin/gastos/resultado.pdf", async (req, res) => {
    if (!await requireAdmin(req, res)) return;
    const eventId = Number(req.query.eventId);
    if (!eventId) {
      res.status(400).json({ error: "eventId requerido" });
      return;
    }
    const pnl = await getEventPnl(eventId);
    if (!pnl) {
      res.status(404).json({ error: "Evento no encontrado" });
      return;
    }
    const pdf = await buildPnlReportPdf(pnl);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="resultado-${(/* @__PURE__ */ new Date()).toISOString().slice(0, 10)}.pdf"`);
    res.send(pdf);
  });
  app2.get("/api/admin/gastos/movimientos.pdf", async (req, res) => {
    if (!await requireAdmin(req, res)) return;
    const eventId = Number(req.query.eventId);
    if (!eventId) {
      res.status(400).json({ error: "eventId requerido" });
      return;
    }
    const [event, rows] = await Promise.all([getEventById(eventId), getLedger(eventId)]);
    const pdf = await buildMovementsPdf(event?.title ?? `Evento #${eventId}`, rows);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="movimientos-${(/* @__PURE__ */ new Date()).toISOString().slice(0, 10)}.pdf"`);
    res.send(pdf);
  });
}

// server/mailing.ts
import { z as z2 } from "zod";
import { nanoid as nanoid3 } from "nanoid";

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
function extractContent(message) {
  if (typeof message.content === "string") return message.content;
  return message.content.map((part) => part.type === "text" ? part.text ?? "" : "").join("");
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

// shared/eventBrand.ts
var BRAND = {
  nombre: "Mansion Playroom",
  ciudad: "Valpara\xEDso, Chile",
  lugar: "La Mansi\xF3n \u2014 direcci\xF3n exacta al comprar",
  valores: ["Respeto", "Consentimiento", "Libertad"],
  edadMinima: 18,
  instagram: "https://instagram.com/mansionplayroom.cl",
  web: "https://www.mansionplayroom.cl"
};
var EVENT_BRAND = {
  /** Nombre corto del evento (título grande del Hero y asuntos de correo). */
  nombre: "ANIVERSARIO",
  fechaTexto: "Viernes 30 de octubre",
  /** ⚠️ Reemplazar por la hora real apenas se defina (ver EVENTO en candyland.ts). */
  horarioTexto: "Hora por confirmar",
  dressCode: "Disfraz obligatorio: es nuestro 2\xBA aniversario y lo celebramos en grande. Adem\xE1s de tu disfraz, que te haga sentir irresistible -- nada de tenida deportiva.",
  // ── Solo correo ────────────────────────────────────────────
  /** Banda de aniversario del encabezado. Mayúsculas espaciadas, va en dorado. */
  kicker: "2 A\xD1OS \xB7 VIERNES 30 DE OCTUBRE",
  /** Chip corto del guiño de disfraz. Se usa donde aporta (compra,
   * recordatorio, campaña), no en todos los correos. */
  costumeBadge: "\u{1F3AD} Disfraz obligatorio",
  /** Rótulo arriba del QR, en el marco del ticket. Antes decía "🍭 CANDYLAND"
   * hardcodeado, o sea el nombre de la fiesta ANTERIOR. */
  ticketLabel: "\u{1F3AD} 2\xBA ANIVERSARIO"
};

// shared/emailTemplateConfig.ts
var DEFAULT_ORDER_EMAIL_CONFIG = {
  sections: {
    quienesSomos: true,
    encontraras: true,
    antesDeVenir: true,
    valores: true,
    embajador: true,
    faq: true
  },
  greetingText: "Tu {{items}} ya est\xE1 reservado para {{evento}} en Mansion Playroom. \u{1F389} Prep\xE1rate para vivir una noche llena de m\xFAsica, conexi\xF3n y una experiencia completamente distinta.",
  farewellText: "Ya eres parte de esta edici\xF3n. Nosotros ponemos la m\xFAsica, el ambiente y la experiencia.<br/>T\xFA solo preoc\xFApate de llegar con ganas de disfrutar.<br/><strong>Equipo Mansion Playroom</strong>"
};
function normalizeOrderEmailConfig(partial) {
  return {
    sections: { ...DEFAULT_ORDER_EMAIL_CONFIG.sections, ...partial?.sections ?? {} },
    greetingText: partial?.greetingText || DEFAULT_ORDER_EMAIL_CONFIG.greetingText,
    farewellText: partial?.farewellText || DEFAULT_ORDER_EMAIL_CONFIG.farewellText
  };
}
function fillPlaceholders(text2, vars) {
  return text2.replace(/\{\{(\w+)\}\}/g, (match, key) => vars[key] ?? match);
}

// server/emailLayout.ts
var EMAIL_BASE_URL = process.env.APP_URL && process.env.APP_URL !== "https://mansionplayroom.cl" ? process.env.APP_URL : "https://candylandwebsite.vercel.app";
var LOGO_URL = `${EMAIL_BASE_URL}/candyland/logo-wordmark-email.png`;
var ACCENT = {
  pink: { bg: "#3A1F2E", text: "#F395C2", solid: "#EC5FA3", glowRgb: "255,90,180", pastel: "#FFCBE3", pastelText: "#3A1330" },
  blue: { bg: "#1B2E36", text: "#7FD3EC", solid: "#5FC2DE", glowRgb: "95,194,222", pastel: "#C7F3FF", pastelText: "#0F2A33" },
  yellow: { bg: "#332A18", text: "#F0C24B", solid: "#F0C24B", glowRgb: "212,165,55", pastel: "#FBE7A8", pastelText: "#3A2C10" },
  lilac: { bg: "#2A2138", text: "#C4AEF0", solid: "#A98CE0", glowRgb: "150,110,255", pastel: "#DCCCFF", pastelText: "#241A3D" },
  gold: { bg: "#332A14", text: "#E0BE6B", solid: "#D4A537", glowRgb: "212,165,55", pastel: "#FBE7A8", pastelText: "#3A2C10" }
};
var PLUM = "#2E1327";
var PAGE_BG = "#150d13";
var CARD_BG = "#221520";
var DISCO_BG = "#0A0A0C";
var DISCO_HERO_BG = "#120e0a";
var INK3 = "#F7EEF3";
var MUTED2 = "#B79AAB";
var FAINT = "#8C7186";
var BORDER2 = "#3A2436";
var REPORT_INK = "#1A1A1A";
var REPORT_MUTED = "#6B7280";
var REPORT_FAINT = "#9CA3AF";
var REPORT_BORDER = "#E5E7EB";
function card(inner, opts) {
  if (opts?.glow) {
    const a = ACCENT[opts.glow];
    return `<div style="background:rgba(255,255,255,0.045);border-radius:22px;padding:${opts?.padding ?? "24px"};border:1px solid rgba(255,255,255,0.10);margin-bottom:20px;box-shadow:0 0 0 1px rgba(${a.glowRgb},0.20),0 18px 50px -10px rgba(${a.glowRgb},0.30),0 0 60px -15px rgba(${a.glowRgb},0.20);">${inner}</div>`;
  }
  return `<div style="background:${opts?.bg ?? CARD_BG};border-radius:20px;padding:${opts?.padding ?? "24px"};${opts?.border === false ? "" : `border:1px solid ${opts?.borderColor ?? BORDER2};`}margin-bottom:20px;">${inner}</div>`;
}
function sectionTitle(emoji, text2) {
  return `<h3 style="color:${INK3};font-size:19px;font-weight:800;margin:0 0 14px;">${emoji} ${text2}</h3>`;
}
function grid(cells, cols) {
  const rows = [];
  for (let i = 0; i < cells.length; i += cols) rows.push(cells.slice(i, i + cols));
  const width = Math.floor(100 / cols);
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:separate;border-spacing:8px 8px;margin:0 -8px 8px;">
    ${rows.map((row) => `<tr>${row.map((c) => `<td width="${width}%" valign="top" style="padding:0;">${c}</td>`).join("")}${row.length < cols ? `<td width="${(cols - row.length) * width}%"></td>` : ""}</tr>`).join("")}
  </table>`;
}
function pastelButton(href, label, accent = "pink") {
  const a = ACCENT[accent];
  return `<a href="${href}" style="display:inline-block;background:${a.pastel};color:${a.pastelText};text-decoration:none;padding:14px 32px;border-radius:999px;font-weight:800;font-size:14px;letter-spacing:0.3px;box-shadow:0 0 0 1px rgba(${a.glowRgb},0.4),0 8px 24px -4px rgba(${a.glowRgb},0.35);">${label}</a>`;
}
function glassButton(href, label) {
  return `<a href="${href}" style="display:inline-block;background:rgba(255,255,255,0.05);color:${INK3};text-decoration:none;padding:13px 26px;border-radius:999px;font-weight:700;font-size:13px;border:1px solid rgba(255,255,255,0.16);margin:0 4px 8px;">${label}</a>`;
}
function costumeBadge() {
  return `<span style="display:inline-block;background:${PLUM};color:${ACCENT.gold.solid};font-size:12px;font-weight:800;letter-spacing:0.6px;padding:7px 16px;border-radius:999px;">${EVENT_BRAND.costumeBadge}</span>`;
}
function anniversaryBand() {
  return `<div style="background-color:${PLUM};padding:11px 20px;text-align:center;">
      <p style="color:${ACCENT.gold.solid};font-size:11px;font-weight:800;letter-spacing:3px;margin:0;">${EVENT_BRAND.kicker}</p>
    </div>`;
}
function emailHero(o) {
  const a = ACCENT[o.accent ?? "pink"];
  const ctaHtml = o.cta ? o.ctaStyle === "pastel" ? pastelButton(o.cta.href, o.cta.label, o.accent ?? "pink") : `<a href="${o.cta.href}" style="display:inline-block;background:${a.solid};color:#fff;text-decoration:none;padding:14px 32px;border-radius:999px;font-weight:800;font-size:14px;letter-spacing:0.3px;">${o.cta.label}</a>` : "";
  return `${o.anniversary ? anniversaryBand() : ""}
    <div style="background-color:${o.heroBg ?? a.bg};padding:40px 24px;text-align:center;border-radius:0 0 32px 32px;">
      <img src="${LOGO_URL}" alt="${BRAND.nombre}" style="height:64px;width:auto;margin-bottom:24px;" />
      <p style="font-size:52px;margin:0 0 12px;">${o.emoji}</p>
      <h1 style="color:${INK3};font-size:26px;font-weight:800;margin:0 0 8px;">${o.title}</h1>
      ${o.subtitle ? `<p style="color:${MUTED2};font-size:15px;margin:0 0 ${o.cta || o.costume ? "24px" : "0"};">${o.subtitle}</p>` : ""}
      ${o.costume ? `<p style="margin:0 0 ${o.cta ? "20px" : "0"};">${costumeBadge()}</p>` : ""}
      ${ctaHtml}
    </div>`;
}
function emailFooter() {
  return `<div style="text-align:center;padding:24px;border-top:1px solid ${BORDER2};margin-top:8px;">
      <img src="${LOGO_URL}" alt="${BRAND.nombre}" style="height:24px;width:auto;margin-bottom:12px;opacity:0.7;" />
      <p style="margin:0 0 8px;">
        <a href="${BRAND.instagram}" style="color:${FAINT};font-size:12px;text-decoration:none;margin:0 8px;">Instagram</a>
        <a href="${BRAND.web}" style="color:${FAINT};font-size:12px;text-decoration:none;margin:0 8px;">Web</a>
      </p>
      <p style="color:${FAINT};font-size:11px;margin:0;">\xA9 ${(/* @__PURE__ */ new Date()).getFullYear()} ${BRAND.nombre} \xB7 ${BRAND.ciudad}</p>
    </div>`;
}
function emailShell(o) {
  const body = o.rawBody ? o.body : `<div style="padding:32px 24px 0;">${o.body}</div>`;
  const pageBg = o.pageBg ?? PAGE_BG;
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="dark">
  <meta name="supported-color-schemes" content="dark">
  <style>
    /* El @import va PRIMERO: el CSS lo exige, si no el navegador/cliente lo
       descarta entero. Syne es la tipograf\xEDa de t\xEDtulos del sitio; Gmail
       descarta el @import y cae a Helvetica/Arial sin romperse, mientras que
       Apple Mail (la mayor parte del tr\xE1fico m\xF3vil en Chile) s\xED la carga y
       ah\xED el correo pasa a hablar el mismo idioma tipogr\xE1fico que
       mansionplayroom.cl. Degradaci\xF3n limpia: si no carga, no se nota. */
    @import url('https://fonts.googleapis.com/css2?family=Syne:wght@700;800&display=swap');
    :root { color-scheme: dark; }
    h1, h2, h3 { font-family: 'Syne', 'Helvetica Neue', Arial, sans-serif; }
  </style>
</head>
<body style="margin:0;padding:0;background-color:${pageBg};font-family:'Helvetica Neue',Arial,sans-serif;">
  ${o.preheader ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${o.preheader}</div>` : ""}
  <div style="max-width:600px;margin:0 auto;padding:0 0 40px;background-color:${pageBg};">
    ${o.beforeContainer ?? ""}
    ${o.hero ?? ""}
    ${body}
    ${o.footer === false ? "" : emailFooter()}
  </div>
</body>
</html>`;
}

// server/email.ts
var BRAND_NAME = BRAND.nombre;
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
        html: input.html,
        ...input.cc ? { cc: input.cc } : {},
        ...input.attachments?.length ? {
          attachments: input.attachments.map((a) => ({
            filename: a.filename,
            content: Buffer.isBuffer(a.content) ? a.content.toString("base64") : a.content
          }))
        } : {}
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
    { emoji: "\u{1F3AD}", titulo: "Dress Code", texto: EVENT_BRAND.dressCode },
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
  return names.map((n) => `<p style="color:${INK3};font-size:15px;font-weight:600;margin:2px 0;">\u{1F464} ${n}</p>`).join("");
}
function buildOrderEmail(data) {
  const cfg = data.templateConfig ?? DEFAULT_ORDER_EMAIL_CONFIG;
  const ticketNames = data.items.map((i) => i.name).join(", ");
  const ticketUrl = data.ticketCode ? `${EMAIL_BASE_URL}/verificar/${data.ticketCode}` : "";
  const calendarUrl = data.ticketCode ? `${EMAIL_BASE_URL}/api/calendar/${data.ticketCode}.ics` : "";
  const partyUrl = data.ticketCode ? `${EMAIL_BASE_URL}/fiesta/${data.ticketCode}` : "";
  const qrUrl = data.ticketCode ? `${EMAIL_BASE_URL}/api/qr/${data.ticketCode}.png` : data.qrImageUrl;
  const whatsappShareUrl = `https://wa.me/?text=${encodeURIComponent(`Usa mi c\xF3digo ${data.ambassadorCode} para comprar tu entrada en Mansion Playroom \u{1F36D} ${EMAIL_BASE_URL}`)}`;
  return emailShell({
    preheader: `Tu ${ticketNames} ya est\xE1 reservado para ${data.eventTitle}.`,
    pageBg: DISCO_BG,
    hero: emailHero({
      accent: "pink",
      heroBg: DISCO_HERO_BG,
      emoji: "\u{1F36D}\u{1FAA9}",
      title: "\xA1Tu compra fue confirmada!",
      subtitle: `La cuenta regresiva para ${data.eventTitle} ya comenz\xF3.`,
      cta: { href: EMAIL_BASE_URL, label: `Ver ${data.eventTitle}` },
      anniversary: true,
      costume: true,
      ctaStyle: "pastel"
    }),
    body: `
      <!-- SALUDO -->
      <h2 style="color:${INK3};font-size:22px;font-weight:800;margin:0 0 6px;">\u{1F44B} Hola ${data.buyerName}</h2>
      <p style="color:${MUTED2};font-size:15px;margin:0 0 28px;">
        ${fillPlaceholders(cfg.greetingText, { items: `<strong style="color:${INK3};">${ticketNames}</strong>`, evento: data.eventTitle })}
      </p>

      <!-- TU ENTRADA (primero, pedido expl\xEDcito del due\xF1o) -->
      ${sectionTitle("\u{1F39F}", "Tu entrada")}
      ${!data.ticketReady ? card(`
        <p style="color:${INK3};font-size:15px;font-weight:700;margin:0 0 8px;">Mientras la Misi\xF3n 300 siga activa...</p>
        <p style="color:${MUTED2};font-size:14px;line-height:1.6;margin:0 0 10px;">Tu QR a\xFAn no ha sido emitido.</p>
        <p style="color:${INK3};font-size:14px;line-height:1.6;margin:0;">\u{1F4E9} Apenas finalice la misi\xF3n, lo recibir\xE1s autom\xE1ticamente por este mismo medio. No necesitas hacer nada m\xE1s.</p>
      `, { glow: "yellow" }) : card(`
        <div style="text-align:center;">
          <!-- Marco tem\xE1tico con halo ne\xF3n -- sin degrad\xE9 CSS (Outlook desktop
               no lo soporta), un borde s\xF3lido grueso + box-shadow es el
               tratamiento m\xE1s seguro entre clientes de correo. -->
          <div style="display:inline-block;background:rgba(255,111,184,0.08);border:2px solid rgba(255,111,184,0.55);border-radius:20px;padding:16px;box-shadow:0 0 40px -8px rgba(${ACCENT.pink.glowRgb},0.5);">
            <p style="color:${ACCENT.pink.text};font-size:11px;font-weight:800;letter-spacing:2px;margin:0 0 10px;">${EVENT_BRAND.ticketLabel}</p>
            <img src="${qrUrl}" alt="C\xF3digo QR de tu entrada" style="width:200px;height:200px;border-radius:12px;background:#fff;padding:8px;display:block;" />
          </div>
          <p style="color:${MUTED2};font-size:12px;margin:14px 0 20px;">Presenta este c\xF3digo QR y tu carnet en la entrada</p>
        </div>
        <div style="margin-bottom:18px;">
          <p style="color:${FAINT};font-size:11px;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 6px;">Asistentes</p>
          ${attendeeNamesList(data.attendeeNames ?? [])}
        </div>
        ${data.extras && data.extras.length > 0 ? `
        <div style="margin-bottom:18px;padding-top:14px;border-top:1px solid rgba(255,255,255,0.08);">
          <p style="color:${FAINT};font-size:11px;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 6px;">Incluye</p>
          ${data.extras.map((e) => `
            <p style="color:${ACCENT.pink.text};font-size:14px;font-weight:700;margin:2px 0;">\u2705 ${e.quantity > 1 ? `${e.quantity}\xD7 ` : ""}${e.name}</p>
            ${e.codes.map((code) => `<p style="color:${MUTED2};font-size:12px;font-family:monospace;letter-spacing:0.5px;margin:0 0 4px 20px;">${code}</p>`).join("")}
          `).join("")}
          <p style="color:${FAINT};font-size:11px;margin:8px 0 0;">Presenta estos c\xF3digos en caja el d\xEDa del evento para canjearlos.</p>
        </div>
        ` : ""}
        <div style="text-align:center;">
          ${pastelButton(ticketUrl, "Ver mi tarjeta", "pink")}
          ${glassButton(partyUrl, "\u{1F36C} Playmatch")}
          ${glassButton(calendarUrl, "\u{1F4C5} Agendar")}
        </div>
      `, { glow: "pink" })}

      <!-- TU EVENTO -->
      ${sectionTitle("\u{1F4C5}", "Tu evento")}
      ${card(`
        <h3 style="color:${ACCENT.blue.text};font-size:20px;font-weight:800;margin:0 0 14px;">${data.eventTitle}</h3>
        <p style="color:${INK3};font-size:15px;margin:6px 0;">\u{1F4C5} ${data.eventDate}</p>
        ${data.doorsOpenText ? `<p style="color:${INK3};font-size:15px;margin:6px 0;">\u{1F558} ${data.doorsOpenText} hrs</p>` : ""}
        <p style="color:${INK3};font-size:15px;margin:6px 0;">\u{1F4CD} ${data.venue}${data.address ? ` \u2014 ${data.address}` : ""}</p>
        ${data.ticketReady && data.mapsUrl ? `<a href="${data.mapsUrl}" style="display:inline-block;color:${ACCENT.blue.text};font-size:13px;font-weight:700;text-decoration:none;margin:4px 0 0;">\u{1F4CD} Ver en Google Maps \u2192</a>` : ""}
        <div style="margin-top:16px;padding-top:16px;border-top:1px solid rgba(255,255,255,0.08);">
          <p style="color:${FAINT};font-size:11px;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 4px;">C\xF3digo de reserva</p>
          <p style="color:${INK3};font-size:15px;font-weight:700;font-family:monospace;margin:0;">${data.orderNumber}</p>
        </div>
        ${!data.ticketReady ? `<p style="color:${FAINT};font-size:12px;margin:14px 0 0;">La direcci\xF3n exacta ser\xE1 enviada unos d\xEDas antes del evento.</p>` : ""}
      `, { glow: "blue" })}

      <!-- MISI\xD3N 300 -->
      ${data.isMissionDeposit ? `
      ${sectionTitle("\u{1F36C}", "Misi\xF3n 300")}
      ${card(`
        <p style="color:${INK3};font-size:16px;font-weight:800;margin:0 0 10px;">\xA1Eres parte de la Misi\xF3n 300!</p>
        <p style="color:${INK3};font-size:14px;line-height:1.6;margin:0 0 10px;">
          Compraste tu acceso antes de que se agotaran los primeros 300 asistentes, por lo que obtuviste el valor
          especial de lanzamiento.
        </p>
        <p style="color:${INK3};font-size:14px;line-height:1.6;margin:0;">
          Cuando la misi\xF3n finalice, recibir\xE1s autom\xE1ticamente un nuevo correo con tu c\xF3digo QR definitivo.
        </p>
      `, { glow: "pink" })}
      ` : ""}

      <!-- RESUMEN DE COMPRA -->
      ${sectionTitle("\u{1F9FE}", "Tu compra")}
      ${card(`
        ${data.items.map((item) => `
          <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.08);">
            <span style="color:${INK3};font-size:14px;">${item.quantity}x ${item.name}</span>
            <span style="color:${INK3};font-size:14px;font-weight:600;">$${item.price.toLocaleString("es-CL")}</span>
          </div>
        `).join("")}
        ${data.discount && data.discount > 0 ? `
        <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.08);">
          <span style="color:${MUTED2};font-size:14px;">Descuento</span>
          <span style="color:${ACCENT.pink.text};font-size:14px;font-weight:600;">-$${data.discount.toLocaleString("es-CL")}</span>
        </div>
        ` : ""}
        ${data.serviceFee && data.serviceFee > 0 ? `
        <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.08);">
          <span style="color:${MUTED2};font-size:14px;">Cargo por servicio</span>
          <span style="color:${INK3};font-size:14px;font-weight:600;">$${data.serviceFee.toLocaleString("es-CL")}</span>
        </div>
        ` : ""}
        <div style="display:flex;justify-content:space-between;padding-top:14px;margin-top:6px;">
          <span style="color:${INK3};font-size:16px;font-weight:800;">Total pagado</span>
          <span style="color:${ACCENT.gold.text};font-size:18px;font-weight:800;text-shadow:0 0 20px rgba(${ACCENT.gold.glowRgb},0.4);">$${data.total.toLocaleString("es-CL")}</span>
        </div>
      `, { glow: "gold" })}

      <!-- QU\xC9 ES MANSION PLAYROOM -->
      ${cfg.sections.quienesSomos ? `
      ${sectionTitle("\u2728", "\xBFQu\xE9 es Mansion Playroom?")}
      <p style="color:${MUTED2};font-size:14px;line-height:1.6;margin:0 0 16px;">
        M\xE1s que una fiesta, somos un venue y una comunidad para adultos donde cada persona vive la experiencia a su manera.
      </p>
      ${grid(CONTENT.quienesSomos.map((x) => `
        <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(95,194,222,0.18);border-radius:16px;padding:16px;text-align:center;">
          <p style="font-size:26px;margin:0 0 6px;">${x.emoji}</p>
          <p style="color:${INK3};font-size:12px;font-weight:700;margin:0;">${x.label}</p>
        </div>
      `), 3)}
      <p style="color:${MUTED2};font-size:13px;margin:6px 0 24px;">Todo ocurre siempre bajo nuestros tres pilares: ${CONTENT.valores.join(" \xB7 ")}</p>
      ` : ""}

      <!-- QU\xC9 ENCONTRAR\xC1S -->
      ${cfg.sections.encontraras ? `
      ${sectionTitle("\u{1F6DD}", "\xBFQu\xE9 encontrar\xE1s?")}
      ${grid(CONTENT.encontraras.map((x) => `
        <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(150,110,255,0.18);border-radius:16px;padding:14px;">
          <p style="font-size:22px;margin:0 0 4px;">${x.emoji}</p>
          <p style="color:${INK3};font-size:12px;font-weight:700;margin:0;">${x.label}</p>
        </div>
      `), 2)}
      <div style="margin-bottom:8px;"></div>
      ` : ""}

      <!-- ANTES DE VENIR -->
      ${cfg.sections.antesDeVenir ? `
      ${sectionTitle("\u{1F392}", "Antes de venir")}
      ${grid(CONTENT.antesDeVenir.map((x) => `
        <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(212,165,55,0.18);border-radius:16px;padding:16px;">
          <p style="font-size:24px;margin:0 0 6px;">${x.emoji}</p>
          <p style="color:${INK3};font-size:13px;font-weight:800;margin:0 0 4px;">${x.titulo}</p>
          <p style="color:${MUTED2};font-size:12px;line-height:1.5;margin:0;">${x.texto}</p>
        </div>
      `), 2)}
      ` : ""}

      <!-- NUESTROS VALORES -->
      ${cfg.sections.valores ? `
      ${sectionTitle("\u2764\uFE0F", "Nuestros valores")}
      ${card(`
        <p style="color:${INK3};font-size:16px;font-weight:700;margin:0;">${CONTENT.valores.join("&nbsp;&nbsp;\xB7&nbsp;&nbsp;")}</p>
      `, { glow: "pink" })}
      ` : ""}

      <!-- EMBAJADOR -->
      ${cfg.sections.embajador ? `
      ${sectionTitle("\u{1F3C6}", "Tu C\xF3digo de Embajador")}
      ${card(`
        <div style="text-align:center;margin-bottom:16px;">
          <p style="color:${ACCENT.gold.text};font-size:30px;font-weight:800;font-family:monospace;margin:0;text-shadow:0 0 24px rgba(${ACCENT.gold.glowRgb},0.5);">${data.ambassadorCode}</p>
          <p style="color:${MUTED2};font-size:13px;margin:8px 0 0;">Comp\xE1rtelo con tus amigos \u2014 cada compra realizada con tu c\xF3digo suma recompensas.</p>
        </div>
        ${AMBASSADOR_TIERS.map((t2) => `
          <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.08);">
            <span style="color:${INK3};font-size:13px;font-weight:700;">${t2.emoji} ${t2.min} compras</span>
            <span style="color:${MUTED2};font-size:13px;text-align:right;">${t2.reward}</span>
          </div>
        `).join("")}
        <div style="text-align:center;margin-top:18px;">
          ${pastelButton(whatsappShareUrl, "Compartir por WhatsApp", "gold")}
        </div>
      `, { glow: "pink" })}
      ` : ""}

      <!-- FAQ -->
      ${cfg.sections.faq ? `
      ${sectionTitle("\u2753", "Preguntas r\xE1pidas")}
      ${card(CONTENT.faq.map((f, i) => `
        <div style="${i > 0 ? `border-top:1px solid rgba(255,255,255,0.08);padding-top:12px;margin-top:12px;` : ""}">
          <p style="color:${INK3};font-size:14px;font-weight:700;margin:0 0 4px;">${f.q}</p>
          <p style="color:${MUTED2};font-size:13px;margin:0;">${f.a}</p>
        </div>
      `).join(""))}
      ` : ""}

      <!-- INFO IMPORTANTE -->
      <p style="color:${FAINT};font-size:12px;line-height:1.6;margin:0 0 24px;">
        \u{1F4CC} Consulta nuestra
        <a href="${EMAIL_BASE_URL}/politica-de-reembolso" style="color:${ACCENT.pink.text};">pol\xEDtica de reembolso y condiciones de compra</a>.
        Si no puedes asistir, puedes transferir tu acceso a otra persona escribi\xE9ndonos por Instagram antes del evento.
      </p>

      <!-- DESPEDIDA -->
      <div style="text-align:center;padding:24px 0;">
        <p style="font-size:32px;margin:0 0 8px;">\u{1F36D}</p>
        <p style="color:${INK3};font-size:16px;font-weight:800;margin:0 0 6px;">Nos vemos en ${data.eventTitle}</p>
        <p style="color:${MUTED2};font-size:13px;line-height:1.6;margin:0;">
          ${fillPlaceholders(cfg.farewellText, { evento: data.eventTitle })}
        </p>
      </div>
    `
  });
}
function buildMissionTopupEmail(data) {
  return emailShell({
    preheader: `Falta completar tu diferencia para ${data.eventTitle}.`,
    pageBg: DISCO_BG,
    hero: emailHero({
      accent: "yellow",
      heroBg: DISCO_HERO_BG,
      emoji: "\u{1F36D}\u{1FAA9}",
      title: `\xA1Casi, ${data.buyerName}!`,
      subtitle: `No juntamos las 300 personas para ${data.eventTitle} \u2014 falta completar tu diferencia.`
    }),
    body: `
      <p style="color:${MUTED2};font-size:15px;line-height:1.6;margin:0 0 24px;">
        Para <strong style="color:${INK3};">${data.eventTitle}</strong> (${data.eventDate}) no llegamos a las 300 personas de la Misi\xF3n,
        as\xED que para asegurar tu entrada falta completar la diferencia \u2014 igual pagaste como m\xE1ximo el 60% del valor
        general gracias a tu abono.
      </p>

      ${sectionTitle("\u{1F9FE}", "Diferencia a pagar")}
      ${card(`
        <div style="text-align:center;">
          <p style="color:${FAINT};font-size:11px;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 6px;">Orden ${data.orderNumber}</p>
          <p style="color:${ACCENT.gold.text};font-size:32px;font-weight:800;margin:0 0 6px;text-shadow:0 0 24px rgba(${ACCENT.gold.glowRgb},0.5);">$${data.topupAmount.toLocaleString("es-CL")}</p>
          <p style="color:${MUTED2};font-size:13px;margin:0 0 20px;">M\xE1ximo el 60% del valor general \u2014 tu abono ya cuenta como parte de este monto.</p>
          ${pastelButton(data.paymentUrl, "Pagar diferencia", "gold")}
          <p style="color:${FAINT};font-size:12px;margin:16px 0 0;">Tu entrada con c\xF3digo QR llega autom\xE1ticamente apenas se confirme este pago.</p>
        </div>
      `, { glow: "gold" })}
    `
  });
}
function buildTierUpEmail(data) {
  const tier = tierForCount(data.referralCount);
  const next = nextTierForCount(data.referralCount);
  return emailShell({
    preheader: `Llegaste a nivel ${tier.name} con ${data.referralCount} ventas.`,
    hero: emailHero({
      accent: "yellow",
      emoji: tier.emoji,
      title: `\xA1Llegaste a nivel ${tier.name}, ${data.buyerName}!`,
      subtitle: `Ya vendiste ${data.referralCount} entradas con tu c\xF3digo \u2014 te lo ganaste.`
    }),
    body: `
      ${sectionTitle("\u{1F381}", "Tu premio")}
      ${card(`
        <p style="color:${INK3};font-size:18px;font-weight:800;margin:0 0 6px;">${tier.reward}</p>
        <p style="color:${MUTED2};font-size:13px;margin:0;">Escr\xEDbenos por Instagram para coordinar c\xF3mo lo recibes.</p>
      `, { bg: ACCENT.yellow.bg, border: false })}

      ${next ? `
      ${sectionTitle("\u{1F680}", "Sigue subiendo")}
      ${card(`
        <p style="color:${INK3};font-size:14px;line-height:1.6;margin:0 0 10px;">
          Te faltan <strong style="color:${ACCENT.pink.text};">${next.min - data.referralCount}</strong> ventas m\xE1s para nivel
          <strong style="color:${INK3};">${next.emoji} ${next.name}</strong>:
        </p>
        <p style="color:${INK3};font-size:15px;font-weight:700;margin:0;">${next.reward}</p>
      `)}
      ` : `
      ${sectionTitle("\u{1F451}", "Llegaste al tope")}
      ${card(`<p style="color:${INK3};font-size:14px;line-height:1.6;margin:0;">Eres nivel Oro, el m\xE1s alto del programa. Sigue vendiendo para mantenerte arriba en el Hall de la Fama.</p>`)}
      `}

      <div style="text-align:center;margin-top:24px;">
        <p style="color:${FAINT};font-size:11px;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 6px;">Tu c\xF3digo</p>
        <p style="color:${INK3};font-size:26px;font-weight:800;font-family:monospace;margin:0 0 20px;">${data.ambassadorCode}</p>
        <a href="${EMAIL_BASE_URL}/mis-referidos" style="display:inline-block;background:${ACCENT.pink.solid};color:#fff;text-decoration:none;padding:14px 32px;border-radius:999px;font-weight:800;font-size:14px;">Ver Hall de la Fama</a>
      </div>
    `
  });
}
function buildAlmostTierEmail(data) {
  const next = nextTierForCount(data.referralCount);
  return emailShell({
    preheader: `Una entrada m\xE1s y desbloqueas nivel ${next.name}.`,
    hero: emailHero({
      accent: "lilac",
      emoji: "\u{1F525}",
      title: `\xA1Est\xE1s a 1 venta, ${data.buyerName}!`,
      subtitle: `Una entrada m\xE1s y desbloqueas nivel ${next.name}.`
    }),
    body: `
      ${sectionTitle(next.emoji, `Te espera nivel ${next.name}`)}
      ${card(`
        <p style="color:${INK3};font-size:18px;font-weight:800;margin:0 0 10px;">${next.reward}</p>
        <p style="color:${MUTED2};font-size:14px;line-height:1.6;margin:0;">
          Ya vendiste ${data.referralCount} entradas con tu c\xF3digo \u2014 comparte tu c\xF3digo una vez m\xE1s y lo tienes asegurado.
        </p>
      `, { bg: ACCENT.pink.bg, border: false })}

      <div style="text-align:center;margin-top:24px;">
        <p style="color:${FAINT};font-size:11px;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 6px;">Tu c\xF3digo</p>
        <p style="color:${INK3};font-size:26px;font-weight:800;font-family:monospace;margin:0 0 20px;">${data.ambassadorCode}</p>
        <a href="https://wa.me/?text=${encodeURIComponent(`Usa mi c\xF3digo ${data.ambassadorCode} para comprar tu entrada en Mansion Playroom \u{1F36D} ${EMAIL_BASE_URL}`)}" style="display:inline-block;background:${ACCENT.pink.solid};color:#fff;text-decoration:none;padding:14px 32px;border-radius:999px;font-weight:800;font-size:14px;">Compartir por WhatsApp</a>
      </div>
    `
  });
}
function buildAmbassadorApplicationEmail(data) {
  return emailShell({
    footer: false,
    rawBody: true,
    body: `
  <div style="max-width:600px;margin:0 auto;padding:24px;background-color:#FFFFFF;">
    <h1 style="color:${REPORT_INK};font-size:20px;font-weight:800;margin:0 0 4px;">\u{1F451} Nueva postulaci\xF3n a embajador</h1>
    <p style="color:${REPORT_MUTED};font-size:13px;margin:0 0 20px;">${data.name}</p>

    ${card(`
      <div style="padding:6px 0;border-bottom:1px solid ${REPORT_BORDER};">
        <p style="color:${REPORT_FAINT};font-size:11px;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 2px;">Instagram</p>
        <p style="margin:0;"><a href="${data.instagramLink}" style="color:${ACCENT.pink.solid};font-size:15px;font-weight:700;text-decoration:none;">@${data.instagram}</a>
        ${data.followers !== null ? `<span style="color:${REPORT_MUTED};font-size:13px;"> \xB7 ${data.followers.toLocaleString("es-CL")} seguidores</span>` : ""}</p>
      </div>
      <div style="padding:6px 0;border-bottom:1px solid ${REPORT_BORDER};">
        <p style="color:${REPORT_FAINT};font-size:11px;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 2px;">WhatsApp</p>
        <p style="margin:0;"><a href="${data.whatsappLink}" style="color:${ACCENT.blue.solid};font-size:15px;font-weight:700;text-decoration:none;">${data.whatsapp}</a></p>
      </div>
      <div style="padding:6px 0;">
        <p style="color:${REPORT_FAINT};font-size:11px;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 2px;">Correo</p>
        <p style="color:${REPORT_INK};font-size:14px;margin:0;">${data.email}</p>
      </div>
    `, { bg: "#F9FAFB", borderColor: REPORT_BORDER })}

    ${data.message ? card(`
      <p style="color:${REPORT_FAINT};font-size:11px;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 6px;">Lo que escribi\xF3</p>
      <p style="color:${REPORT_INK};font-size:14px;margin:0;line-height:1.6;">${data.message}</p>
    `, { bg: "#F9FAFB", borderColor: REPORT_BORDER }) : ""}

    <p style="color:${REPORT_MUTED};font-size:13px;margin:0;">
      Rev\xEDsala en el panel: Embajadores VIP \u2192 Postulaciones. Desde ah\xED la apruebas y se crea el embajador con su c\xF3digo.
    </p>
  </div>
    `
  });
}
function buildApplicationReceivedEmail(data) {
  const lista = (items) => items.map((t2) => `<p style="color:${INK3};font-size:14px;margin:0 0 6px;">\u2022 ${t2}</p>`).join("");
  return emailShell({
    preheader: `Recibimos tu postulaci\xF3n a embajador, ${data.name}.`,
    footer: false,
    hero: emailHero({
      accent: "lilac",
      emoji: "\u{1F451}",
      title: `Recibimos tu postulaci\xF3n, ${data.name}`,
      subtitle: "Te vamos a escribir por WhatsApp para contarte c\xF3mo sigue."
    }),
    body: `
      ${sectionTitle("\u2705", "Lo que pedimos")}
      ${card(lista(data.requirements))}

      ${sectionTitle("\u{1F4F1}", "A lo que te comprometes")}
      ${card(lista(data.tasks), { bg: ACCENT.yellow.bg, border: false })}

      ${card(`
        <p style="color:${INK3};font-size:14px;margin:0;line-height:1.6;">
          Si quedas seleccionado te llega tu <strong>c\xF3digo personal</strong> y un panel donde vas a ver, en vivo, cu\xE1ntas
          ventas hiciste y cu\xE1nto llevas ganado. No tienes que pedirle el n\xFAmero a nadie.
        </p>
      `)}

      <p style="color:${FAINT};font-size:12px;text-align:center;margin:24px 0 0;">
        Si no postulaste t\xFA, ignora este correo y no pasa nada.
      </p>
    `
  });
}
function buildAmbassadorWelcomeEmail(data) {
  return emailShell({
    preheader: `Ya eres embajador de Mansion Playroom, ${data.name}.`,
    footer: false,
    hero: emailHero({
      accent: "yellow",
      emoji: "\u{1F389}",
      title: `\xA1Quedaste, ${data.name}!`,
      subtitle: "Ya eres embajador de Mansion Playroom."
    }),
    body: `
      ${sectionTitle("\u{1F39F}", "Tu c\xF3digo")}
      ${card(`
        <p style="color:${INK3};font-size:32px;font-weight:800;font-family:monospace;margin:0 0 8px;text-align:center;">${data.code}</p>
        <p style="color:${MUTED2};font-size:13px;margin:0;text-align:center;">
          Cada persona que lo ponga al comprar su entrada te genera comisi\xF3n, autom\xE1ticamente.
        </p>
      `, { bg: ACCENT.pink.bg, border: false })}

      ${sectionTitle("\u{1F4F1}", "Lo que esperamos de ti")}
      ${card(data.tasks.map((t2) => `<p style="color:${INK3};font-size:14px;margin:0 0 6px;">\u2022 ${t2}</p>`).join(""))}

      ${card(`
        <p style="color:${INK3};font-size:14px;margin:0;line-height:1.6;">
          Todos los lunes te mandamos un resumen con tus ventas, cu\xE1nto llevas ganado y el material para publicar
          esa semana. No tienes que preguntarle nada a nadie.
        </p>
      `)}

      <div style="text-align:center;margin-top:24px;">
        <a href="${data.panelUrl}" style="display:inline-block;background:${ACCENT.pink.solid};color:#fff;text-decoration:none;padding:14px 32px;border-radius:999px;font-weight:800;font-size:14px;">Ver mi panel</a>
      </div>
    `
  });
}
function buildAmbassadorWeeklyEmail(data) {
  const money2 = (n) => `$${Math.round(n).toLocaleString("es-CL")}`;
  const m = data.material;
  const tieneMaterial = !!m && !!(m.storiesText || m.reelText || m.postText || m.countdownText || m.linkUrl);
  const progreso = data.nextTarget ? Math.min(100, Math.round(data.monthlySales / data.nextTarget.target * 100)) : 100;
  const materialRow = (label, value) => value ? `<div style="padding:8px 0;border-bottom:1px solid ${BORDER2};">
         <p style="color:${FAINT};font-size:11px;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 3px;">${label}</p>
         <p style="color:${INK3};font-size:14px;margin:0;line-height:1.5;">${value}</p>
       </div>` : "";
  return emailShell({
    preheader: `Tu semana como embajador, ${data.name}.`,
    footer: false,
    rawBody: true,
    body: `
    <div style="background-color:${ACCENT.lilac.bg};padding:40px 24px;text-align:center;border-radius:0 0 32px 32px;">
      <img src="${LOGO_URL}" alt="${BRAND.nombre}" style="height:64px;width:auto;margin-bottom:24px;" />
      <p style="color:${FAINT};font-size:11px;text-transform:uppercase;letter-spacing:1px;margin:0 0 8px;">Tu semana como embajador</p>
      <h1 style="color:${INK3};font-size:26px;font-weight:800;margin:0 0 8px;">Hola ${data.name}</h1>
      <p style="color:${MUTED2};font-size:15px;margin:0;">
        ${data.monthlySales === 0 ? "Este mes todav\xEDa no registras ventas \u2014 cualquier venta que traigas empieza al 30%." : `Llevas ${data.monthlySales} venta${data.monthlySales === 1 ? "" : "s"} este mes y est\xE1s cobrando el ${data.currentPercent}%.`}
      </p>
    </div>

    <div style="padding:32px 24px 0;">
      ${sectionTitle("\u{1F4CA}", "Tus n\xFAmeros del mes")}
      ${card(`
        ${grid([
      `<div style="background:${ACCENT.pink.bg};border-radius:14px;padding:14px;text-align:center;">
            <p style="color:${ACCENT.pink.text};font-size:24px;font-weight:800;margin:0;">${data.monthlySales}</p>
            <p style="color:${MUTED2};font-size:11px;margin:4px 0 0;">Ventas a tus clientes</p>
          </div>`,
      `<div style="background:${ACCENT.blue.bg};border-radius:14px;padding:14px;text-align:center;">
            <p style="color:${ACCENT.blue.text};font-size:24px;font-weight:800;margin:0;">${data.currentPercent}%</p>
            <p style="color:${MUTED2};font-size:11px;margin:4px 0 0;">Tu comisi\xF3n actual</p>
          </div>`
    ], 2)}
        <div style="padding:10px 0 0;">
          <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid ${BORDER2};">
            <span style="color:${MUTED2};font-size:13px;">Comisi\xF3n de este mes</span>
            <span style="color:${INK3};font-size:14px;font-weight:700;">${money2(data.monthlyCommission)}</span>
          </div>
          <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid ${BORDER2};">
            <span style="color:${MUTED2};font-size:13px;">Comisi\xF3n acumulada (hist\xF3rica)</span>
            <span style="color:${ACCENT.pink.text};font-size:14px;font-weight:800;">${money2(data.totalCommission)}</span>
          </div>
          <div style="display:flex;justify-content:space-between;padding:6px 0;">
            <span style="color:${MUTED2};font-size:13px;">Tus clientes exclusivos</span>
            <span style="color:${INK3};font-size:14px;font-weight:700;">${data.exclusiveClientsCount}</span>
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
        <p style="color:${INK3};font-size:20px;font-weight:800;margin:0 0 4px;">${data.monthlySales} / ${data.nextTarget.target} ventas</p>
        <p style="color:${MUTED2};font-size:14px;margin:0 0 12px;">
          Te faltan <strong>${data.nextTarget.salesNeeded}</strong> para subir al <strong>${data.nextTarget.nextPercent}%</strong>.
        </p>
        <div style="background:${BORDER2};border-radius:999px;height:10px;overflow:hidden;">
          <div style="background:${ACCENT.pink.solid};height:10px;width:${progreso}%;border-radius:999px;"></div>
        </div>
      `, { bg: ACCENT.lilac.bg, border: false })}
      ` : `
      ${sectionTitle("\u{1F3C6}", "Nivel m\xE1ximo")}
      ${card(`<p style="color:${INK3};font-size:16px;font-weight:700;margin:0;">Est\xE1s en el tramo m\xE1s alto de la escala. Imposible subir m\xE1s.</p>`, { bg: ACCENT.yellow.bg, border: false })}
      `}

      ${data.benefitItems.length > 0 || data.benefitBonusClp > 0 ? `
      ${sectionTitle("\u{1F381}", "Lo que ya desbloqueaste este mes")}
      ${card(`
        ${data.benefitItems.map((b) => `<p style="color:${INK3};font-size:15px;font-weight:600;margin:0 0 6px;">\u2022 ${b}</p>`).join("")}
        ${data.benefitBonusClp > 0 ? `<p style="color:${ACCENT.pink.text};font-size:17px;font-weight:800;margin:8px 0 0;">+ Bono de ${money2(data.benefitBonusClp)}</p>` : ""}
        <p style="color:${MUTED2};font-size:12px;margin:10px 0 0;">Escr\xEDbenos por Instagram para coordinar c\xF3mo lo recibes.</p>
      `, { bg: ACCENT.yellow.bg, border: false })}
      ` : `
      ${card(`<p style="color:${MUTED2};font-size:14px;margin:0;">Con tu primera venta del mes se activan tus beneficios: entrada liberada y un acompa\xF1ante.</p>`)}
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
        <p style="color:${INK3};font-size:26px;font-weight:800;font-family:monospace;margin:0 0 20px;">${data.code}</p>
        <a href="${data.panelUrl}" style="display:inline-block;background:${ACCENT.pink.solid};color:#fff;text-decoration:none;padding:14px 32px;border-radius:999px;font-weight:800;font-size:14px;">Ver mi panel</a>
      </div>
    </div>
    `
  });
}
function buildAdminDigestEmail(data) {
  const row = (label, value, opts) => {
    if (value === 0) return "";
    const shown = opts?.money ? `$${value.toLocaleString("es-CL")}` : value.toLocaleString("es-CL");
    return `
      <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid ${REPORT_BORDER};">
        <span style="color:${REPORT_MUTED};font-size:14px;">${label}</span>
        <span style="color:${opts?.warn ? "#C0392B" : REPORT_INK};font-size:14px;font-weight:700;">${shown}</span>
      </div>
    `;
  };
  const nuevo = [
    row("Ventas web nuevas", data.newOrdersWeb),
    row("Plata de ventas web nuevas", data.newWebRevenue, { money: true }),
    row("Ventas en caja nuevas", data.newOrdersCaja),
    row("Leads nuevos", data.newLeads),
    row("Clientes nuevos", data.newCustomers),
    row("Referidos nuevos", data.newReferrals)
  ].join("");
  const pendiente = [
    row("Postulaciones de embajador sin responder", data.pendingApplications, { warn: true }),
    row("Denuncias sin resolver", data.openReports, { warn: true }),
    row("Tragos pagados sin retirar", data.unclaimedGifts),
    row("Turnos de caja sin cerrar", data.openShifts, { warn: true })
  ].join("");
  const nada = !nuevo && !pendiente;
  return emailShell({
    footer: false,
    rawBody: true,
    body: `
  <div style="max-width:600px;margin:0 auto;padding:24px;background-color:#FFFFFF;">
    <h1 style="color:${REPORT_INK};font-size:20px;font-weight:800;margin:0 0 4px;">\u{1F4CB} Resumen de novedades</h1>
    <p style="color:${REPORT_MUTED};font-size:13px;margin:0 0 20px;">\xDAltimas 24 horas + lo que sigue pendiente</p>

    ${nada ? `${card(`<p style="color:${REPORT_MUTED};font-size:14px;margin:0;">Sin novedades ni pendientes. Todo tranquilo. \u{1F36D}</p>`, { bg: "#F9FAFB", borderColor: REPORT_BORDER })}` : ""}
    ${nuevo ? `${card(`<p style="color:${REPORT_FAINT};font-size:11px;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 4px;">Nuevo</p>${nuevo}`, { bg: "#F9FAFB", borderColor: REPORT_BORDER })}` : ""}
    ${pendiente ? `${card(`<p style="color:${REPORT_FAINT};font-size:11px;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 4px;">Pendiente de resolver</p>${pendiente}`, { bg: "#F9FAFB", borderColor: REPORT_BORDER })}` : ""}
  </div>
    `
  });
}
function buildCheckinSummaryEmail(data) {
  const fecha = formatChileDate(data.eventDate, { withYear: true, withWeekday: false });
  const pct = data.expectedCount > 0 ? Math.round(data.insideCount / data.expectedCount * 100) : 0;
  return emailShell({
    footer: false,
    rawBody: true,
    body: `
  <div style="max-width:600px;margin:0 auto;padding:24px;background-color:#FFFFFF;">
    <h1 style="color:${REPORT_INK};font-size:20px;font-weight:800;margin:0 0 4px;">\u{1F6AA} ${data.eventTitle}</h1>
    <p style="color:${REPORT_MUTED};font-size:13px;margin:0 0 20px;">Resumen de ingresos \u2014 ${fecha}</p>

    ${card(`
      <p style="color:${REPORT_FAINT};font-size:11px;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 6px;">Personas adentro</p>
      <p style="color:${REPORT_INK};font-size:32px;font-weight:800;margin:0 0 2px;">${data.insideCount.toLocaleString("es-CL")} <span style="color:${REPORT_MUTED};font-size:16px;font-weight:600;">/ ${data.expectedCount.toLocaleString("es-CL")}</span></p>
      <p style="color:${REPORT_MUTED};font-size:13px;margin:0;">${pct}% de las entradas vendidas ya hicieron check-in en la puerta.</p>
    `, { bg: "#F9FAFB", borderColor: REPORT_BORDER })}
  </div>
    `
  });
}
function buildShiftCloseEmail(data) {
  const money2 = (n) => `$${Math.round(n).toLocaleString("es-CL")}`;
  const diffRow = (label, counted, expected, diff) => `
    <div style="padding:8px 0;border-bottom:1px solid ${REPORT_BORDER};">
      <div style="display:flex;justify-content:space-between;">
        <span style="color:${REPORT_INK};font-size:14px;">${label}</span>
        <span style="color:${REPORT_INK};font-size:14px;font-weight:600;">${money2(counted)} contado / ${money2(expected)} esperado</span>
      </div>
      <p style="color:${Math.abs(diff) < 1 ? ACCENT.blue.solid : diff > 0 ? ACCENT.yellow.solid : "#D9538F"};font-size:12px;font-weight:700;margin:4px 0 0;">
        ${Math.abs(diff) < 1 ? "\u2713 Cuadra" : diff > 0 ? `\u25B2 Sobran ${money2(diff)}` : `\u25BC Faltan ${money2(Math.abs(diff))}`}
      </p>
    </div>
  `;
  return emailShell({
    footer: false,
    rawBody: true,
    body: `
  <div style="max-width:600px;margin:0 auto;padding:24px;background-color:#FFFFFF;">
    <h1 style="color:${REPORT_INK};font-size:20px;font-weight:800;margin:0 0 4px;">\u{1F512} Turno cerrado \u2014 ${data.eventTitle}</h1>
    <p style="color:${REPORT_MUTED};font-size:13px;margin:0 0 20px;">${data.registerName} \xB7 ${data.operatorName} \xB7 ${formatChileDateTime(data.closedAt)}</p>

    ${card(`
      <p style="color:${REPORT_FAINT};font-size:11px;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 10px;">Cuadre de caja</p>
      <p style="color:${REPORT_MUTED};font-size:12px;margin:0 0 10px;">Efectivo inicial: ${money2(data.openingCash)} \xB7 ${data.salesCount} ventas \xB7 ${data.redeemsCount} canjes</p>
      ${diffRow("\u{1F4B5} Efectivo", data.countedCash, data.expectedCash + data.openingCash, data.cashDiff)}
      ${diffRow("\u{1F4B3} D\xE9bito", data.countedDebit, data.expectedDebit, data.debitDiff)}
      ${diffRow("\u{1F4B3} Cr\xE9dito", data.countedCredit, data.expectedCredit, data.creditDiff)}
      ${data.expectedQr || data.countedQr ? diffRow("\u{1F4F2} QR / Transferencia", data.countedQr ?? 0, data.expectedQr ?? 0, data.qrDiff ?? 0) : ""}
    `, { bg: "#F9FAFB", borderColor: REPORT_BORDER })}

    ${card(`
      <p style="color:${REPORT_FAINT};font-size:11px;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 10px;">\u{1F3C6} Top 3 clientes (todo el evento)</p>
      ${data.topCustomers.length === 0 ? `<p style="color:${REPORT_MUTED};font-size:13px;margin:0;">Sin ventas web registradas.</p>` : data.topCustomers.map((c, i) => `
        <div style="display:flex;justify-content:space-between;padding:6px 0;">
          <span style="color:${REPORT_INK};font-size:14px;">${i + 1}. ${c.name} <span style="color:${REPORT_FAINT};font-size:12px;">(${c.email})</span></span>
          <span style="color:${REPORT_INK};font-size:14px;font-weight:600;">${money2(c.total)}</span>
        </div>
      `).join("")}
    `, { bg: "#F9FAFB", borderColor: REPORT_BORDER })}

    ${card(`
      <p style="color:${REPORT_FAINT};font-size:11px;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 10px;">\u{1F947} Top 3 productos m\xE1s vendidos</p>
      ${data.topProducts.length === 0 ? `<p style="color:${REPORT_MUTED};font-size:13px;margin:0;">Sin ventas registradas.</p>` : data.topProducts.map((p, i) => `
        <div style="display:flex;justify-content:space-between;padding:6px 0;">
          <span style="color:${REPORT_INK};font-size:14px;">${i + 1}. ${p.name}</span>
          <span style="color:${REPORT_INK};font-size:14px;font-weight:600;">${p.quantity}x \xB7 ${money2(p.revenue)}</span>
        </div>
      `).join("")}
    `, { bg: "#F9FAFB", borderColor: REPORT_BORDER })}
  </div>
    `
  });
}
function buildSimpleReportEmail(data) {
  return emailShell({
    footer: false,
    rawBody: true,
    body: `
  <div style="max-width:600px;margin:0 auto;padding:24px;background-color:#FFFFFF;">
    <h1 style="color:${REPORT_INK};font-size:20px;font-weight:800;margin:0 0 4px;">${data.title}</h1>
    <p style="color:${REPORT_MUTED};font-size:13px;margin:0 0 20px;">${data.subtitle} \u2014 el detalle completo va en el PDF adjunto.</p>

    ${card(data.lines.map((l) => `
      <div style="display:flex;justify-content:space-between;padding:6px 0;">
        <span style="color:${REPORT_MUTED};font-size:13px;">${l.label}</span>
        <span style="color:${REPORT_INK};font-size:13px;font-weight:600;">${l.value}</span>
      </div>
    `).join(""), { bg: "#F9FAFB", borderColor: REPORT_BORDER })}
  </div>
    `
  });
}
function buildKitchenVendorEmail(data) {
  const money2 = (n) => `$${Math.round(n).toLocaleString("es-CL")}`;
  return emailShell({
    footer: false,
    rawBody: true,
    body: `
  <div style="max-width:600px;margin:0 auto;padding:24px;background-color:#FFFFFF;">
    <h1 style="color:${REPORT_INK};font-size:20px;font-weight:800;margin:0 0 4px;">\u{1F37D}\uFE0F Rendici\xF3n de cocina \u2014 ${data.eventTitle}</h1>
    <p style="color:${REPORT_MUTED};font-size:13px;margin:0 0 20px;">Para ${data.vendorName} \u2014 el detalle completo por producto va en el PDF adjunto.</p>

    ${card(`
      <p style="color:${REPORT_FAINT};font-size:11px;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 10px;">Resumen del evento</p>
      <p style="color:${REPORT_MUTED};font-size:13px;margin:0 0 6px;">Ingresos totales: <strong style="color:${REPORT_INK};">${money2(data.totalRevenue)}</strong></p>
      <p style="color:${REPORT_MUTED};font-size:13px;margin:0 0 6px;">Le corresponde a ${data.vendorName}: <strong style="color:${REPORT_INK};">${money2(data.vendorShare)}</strong></p>
      <p style="color:${REPORT_MUTED};font-size:13px;margin:0;">Le corresponde a ${BRAND_NAME}: <strong style="color:${REPORT_INK};">${money2(data.venueShare)}</strong></p>
    `, { bg: "#F9FAFB", borderColor: REPORT_BORDER })}
  </div>
    `
  });
}
function buildMailingBlastEmail(data) {
  const greeting = data.buyerName ? `\xA1Hola, ${data.buyerName}!` : "\xA1Hola!";
  const eventInfo = data.eventInfo;
  const showBanner = data.eventSections?.banner ?? true;
  const showDetails = data.eventSections?.details ?? true;
  const showMission300 = data.eventSections?.mission300 ?? true;
  const showVenueGrid = data.eventSections?.venueGrid ?? true;
  return emailShell({
    preheader: data.preheader,
    beforeContainer: eventInfo?.imageUrl && showBanner ? `<img src="${eventInfo.imageUrl}" alt="${eventInfo.title}" style="display:block;width:100%;height:auto;" />` : void 0,
    // Hero a medida (saludo chico arriba del titular, sin subtítulo ni CTA
    // en el encabezado -- el CTA de la campaña va más abajo, después de los
    // párrafos) -- no usa `emailHero`, que asume ese otro orden.
    hero: `
      ${anniversaryBand()}
      <div style="background-color:${ACCENT.pink.bg};padding:40px 24px;text-align:center;border-radius:0 0 32px 32px;">
        <img src="${LOGO_URL}" alt="${BRAND.nombre}" style="height:64px;width:auto;margin-bottom:24px;" />
        <p style="font-size:52px;margin:0 0 12px;">\u{1F36C}</p>
        <p style="color:${MUTED2};font-size:14px;margin:0 0 4px;">${greeting}</p>
        <h1 style="color:${INK3};font-size:26px;font-weight:800;margin:0 0 16px;">${data.headline}</h1>
        ${costumeBadge()}
      </div>
    `,
    body: `
      ${data.paragraphs.map((p) => `
        <p style="color:${MUTED2};font-size:15px;line-height:1.6;margin:0 0 20px;">${p}</p>
      `).join("")}

      ${eventInfo && showDetails ? `
      ${sectionTitle("\u{1F4C5}", eventInfo.title)}
      ${card(`
        <p style="color:${INK3};font-size:15px;margin:6px 0;">\u{1F4C5} ${eventInfo.dateText}</p>
        <p style="color:${INK3};font-size:15px;margin:6px 0;">\u{1F4CD} ${eventInfo.venue}${eventInfo.address ? ` \u2014 ${eventInfo.address}` : ""}</p>
        ${eventInfo.mapsUrl ? `<a href="${eventInfo.mapsUrl}" style="display:inline-block;color:${ACCENT.pink.text};font-size:13px;font-weight:700;text-decoration:none;margin:4px 0 0;">\u{1F4CD} Ver en Google Maps \u2192</a>` : ""}
      `)}
      ` : ""}

      ${eventInfo?.mission300 && showMission300 ? card(`
        <div style="text-align:center;">
          <p style="color:${FAINT};font-size:11px;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 6px;">Misi\xF3n 300</p>
          <p style="color:${ACCENT.pink.text};font-size:28px;font-weight:800;margin:0 0 10px;">${eventInfo.mission300.confirmed}/${eventInfo.mission300.goal} ya confirmados</p>
          <p style="color:${INK3};font-size:15px;font-weight:700;margin:0;">\u{1F36C} Tu entrada sigue a $${eventInfo.mission300.depositPrice.toLocaleString("es-CL")} por persona mientras dure la Misi\xF3n 300</p>
        </div>
      `, { bg: ACCENT.pink.bg, border: false }) : ""}

      ${eventInfo && showVenueGrid ? `
      ${sectionTitle("\u{1F6DD}", "\xBFQu\xE9 encontrar\xE1s?")}
      ${grid(CONTENT.encontraras.map((x) => `
        <div style="background:${ACCENT.lilac.bg};border-radius:16px;padding:14px;">
          <p style="font-size:22px;margin:0 0 4px;">${x.emoji}</p>
          <p style="color:${INK3};font-size:12px;font-weight:700;margin:0;">${x.label}</p>
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
    `
  });
}
function buildGiftEmail(data) {
  return emailShell({
    preheader: `${data.fromAlias} te invit\xF3 un ${data.drinkName}.`,
    footer: false,
    pageBg: DISCO_BG,
    hero: emailHero({
      accent: "pink",
      heroBg: DISCO_HERO_BG,
      emoji: "\u{1F379}\u{1FAA9}",
      title: `${data.fromAlias} te invit\xF3 un trago`,
      subtitle: data.drinkName
    }),
    body: `
      ${data.message ? card(
      `<p style="color:${INK3};font-size:15px;font-style:italic;margin:0;text-align:center;">"${data.message}"</p>`,
      { glow: "yellow" }
    ) : ""}

      ${card(`
        <p style="color:${FAINT};font-size:12px;text-transform:uppercase;letter-spacing:1px;margin:0 0 12px;text-align:center;">Muestra este c\xF3digo en la barra</p>
        <p style="color:${ACCENT.pink.text};font-size:32px;font-weight:800;letter-spacing:3px;margin:0;text-align:center;font-family:monospace;text-shadow:0 0 24px rgba(${ACCENT.pink.glowRgb},0.5);">${data.displayCode}</p>
      `, { glow: "pink" })}

      ${card(`
        <p style="color:${MUTED2};font-size:14px;line-height:1.6;margin:0;">
          Es para <strong style="color:${INK3};">${data.toAlias}</strong>, en ${data.eventTitle}.
          Si no alcanzas a cobrarlo esta noche, no se pierde: <strong style="color:${INK3};">queda v\xE1lido para la pr\xF3xima fiesta</strong>.
        </p>
      `, { glow: "lilac" })}

      <p style="color:${FAINT};font-size:12px;text-align:center;margin:24px 0 0;line-height:1.6;">
        Recibiste este correo porque alguien te invit\xF3 un trago en la fiesta.<br>
        ${BRAND.nombre}
      </p>
    `
  });
}
function buildPendingReminderEmail(data) {
  const primerNombre = data.buyerName.split(" ")[0];
  const fechaTexto = data.eventDate ? formatChileDate(data.eventDate) : null;
  const parrafosPorDefecto = [
    `Vimos que empezaste a sacar tu acceso para ${data.eventTitle} y qued\xF3 a medio camino. Puede pasar \u{1F36C}`,
    "Tu lugar todav\xEDa no est\xE1 confirmado, pero retomar toma menos de un minuto: el formulario te espera con todo lo que ya hab\xEDas llenado."
  ];
  const cuerpo = data.customBody ? data.customBody.split("\n").filter((p) => p.trim()) : parrafosPorDefecto;
  return emailShell({
    preheader: `${data.eventTitle} te est\xE1 esperando.`,
    footer: false,
    pageBg: DISCO_BG,
    hero: emailHero({
      accent: "pink",
      heroBg: DISCO_HERO_BG,
      emoji: "\u{1F39F}\uFE0F\u{1FAA9}",
      title: `${primerNombre}, qued\xF3 pendiente tu acceso`,
      subtitle: fechaTexto ? `${data.eventTitle} \xB7 ${fechaTexto}` : void 0,
      anniversary: true,
      costume: true
    }),
    body: `
      ${cuerpo.map((p) => `<p style="color:${INK3};font-size:15px;line-height:1.6;margin:0 0 16px;">${p}</p>`).join("")}

      <div style="text-align:center;margin:28px 0 8px;">
        ${pastelButton(data.checkoutUrl, "Completar mi compra", "pink")}
      </div>

      <p style="color:${FAINT};font-size:12px;text-align:center;margin:16px 0 0;line-height:1.5;">
        Si ya compraste o cambiaste de idea, puedes ignorar este correo.
      </p>
    `
  });
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

// server/push.ts
import webpush from "web-push";
init_schema();
import { eq as eq5 } from "drizzle-orm";

// shared/adminAlertsConfig.ts
var DEFAULT_ADMIN_ALERTS_CONFIG = {
  pushNewOrder: false,
  pushAmbassadorApplication: false,
  pushPartyReport: false,
  dailyDigestEmail: false
};
function normalizeAdminAlertsConfig(raw) {
  const partial = raw && typeof raw === "object" ? raw : {};
  return {
    pushNewOrder: partial.pushNewOrder ?? DEFAULT_ADMIN_ALERTS_CONFIG.pushNewOrder,
    pushAmbassadorApplication: partial.pushAmbassadorApplication ?? DEFAULT_ADMIN_ALERTS_CONFIG.pushAmbassadorApplication,
    pushPartyReport: partial.pushPartyReport ?? DEFAULT_ADMIN_ALERTS_CONFIG.pushPartyReport,
    dailyDigestEmail: partial.dailyDigestEmail ?? DEFAULT_ADMIN_ALERTS_CONFIG.dailyDigestEmail
  };
}

// server/push.ts
var configured = false;
function ensureConfigured() {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  if (!publicKey || !privateKey || !subject) return false;
  if (!configured) {
    webpush.setVapidDetails(subject, publicKey, privateKey);
    configured = true;
  }
  return true;
}
async function deliverTo(subs, payload, onStale) {
  if (subs.length === 0) return;
  const body = JSON.stringify(payload);
  await Promise.all(subs.map(async (sub) => {
    try {
      await webpush.sendNotification({
        endpoint: sub.endpoint,
        keys: { p256dh: sub.p256dh, auth: sub.auth }
      }, body);
    } catch (err) {
      if (err?.statusCode === 404 || err?.statusCode === 410) {
        await onStale(sub.id);
      } else {
        console.error("[Push] Error mandando a una suscripci\xF3n:", err?.statusCode, err?.body || err);
      }
    }
  }));
}
async function deliverToAllSubscriptions(payload) {
  const db = await getDb();
  if (!db) return;
  const subs = await db.select().from(pushSubscriptions);
  await deliverTo(subs, payload, (id) => db.delete(pushSubscriptions).where(eq5(pushSubscriptions.id, id)));
}
async function sendPushToProfile(profileId, payload) {
  try {
    if (!ensureConfigured()) return;
    const db = await getDb();
    if (!db) return;
    const subs = await db.select().from(partyPushSubscriptions).where(eq5(partyPushSubscriptions.profileId, profileId));
    await deliverTo(subs, payload, (id) => db.delete(partyPushSubscriptions).where(eq5(partyPushSubscriptions.id, id)));
  } catch (err) {
    console.error("[Push] Error mandando a un invitado:", err);
  }
}
async function sendPushToEventGuests(eventId, payload) {
  try {
    if (!ensureConfigured()) return { sent: 0 };
    const db = await getDb();
    if (!db) return { sent: 0 };
    const subs = await db.select().from(partyPushSubscriptions).where(eq5(partyPushSubscriptions.eventId, eventId));
    await deliverTo(subs, payload, (id) => db.delete(partyPushSubscriptions).where(eq5(partyPushSubscriptions.id, id)));
    return { sent: subs.length };
  } catch (err) {
    console.error("[Push] Error mandando la promo rel\xE1mpago:", err);
    return { sent: 0 };
  }
}
async function sendPushToAdmins(alertKey, payload) {
  try {
    if (!ensureConfigured()) return;
    const settings = await getSiteSettings();
    const config = normalizeAdminAlertsConfig(settings.adminAlertsConfig);
    if (!config[alertKey]) return;
    await deliverToAllSubscriptions(payload);
  } catch (err) {
    console.error("[Push] Error general:", err);
  }
}
async function sendTestPushToAllAdmins() {
  try {
    if (!ensureConfigured()) throw new Error("Faltan las variables VAPID en el servidor (VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY/VAPID_SUBJECT).");
    await deliverToAllSubscriptions({
      title: "\u{1F36D} Notificaciones activadas",
      body: "As\xED se va a ver una alerta real. Todo listo.",
      url: "/admin"
    });
  } catch (err) {
    console.error("[Push] Error en push de prueba:", err);
    throw err;
  }
}

// server/ambassadorProgram.ts
import { and as and4, eq as eq6, inArray as inArray3, sql as sql3, desc as desc2 } from "drizzle-orm";
init_schema();

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

// server/ambassadorProgram.ts
import { z } from "zod";
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
    await db.update(ambassadorProgramConfig).set(patch).where(eq6(ambassadorProgramConfig.id, row.id));
  }
  return { success: true };
}
async function countExclusiveSalesInMonth(db, ambassadorId, monthKey) {
  const [row] = await db.select({ count: sql3`COUNT(*)` }).from(ambassadorCommissions).where(and4(
    eq6(ambassadorCommissions.ambassadorId, ambassadorId),
    eq6(ambassadorCommissions.monthKey, monthKey),
    eq6(ambassadorCommissions.clientType, "exclusivo")
  ));
  return Number(row?.count ?? 0);
}
async function attributeAmbassadorSale(params) {
  const db = await getDb();
  if (!db) return { attributed: false, reason: "sin_base" };
  const { order } = params;
  const email = (order.buyerEmail ?? "").trim().toLowerCase();
  const [already] = await db.select({ id: ambassadorCommissions.id }).from(ambassadorCommissions).where(eq6(ambassadorCommissions.orderId, order.id)).limit(1);
  if (already) return { attributed: false, reason: "ya_registrada" };
  const code = (order.referredByCode || order.ambassadorCode || "").trim().toUpperCase();
  const fromCode = code ? await getActiveExclusiveAmbassadorByCode(code) : null;
  const [owner] = email ? await db.select().from(ambassadorClients).where(eq6(ambassadorClients.customerEmail, email)).limit(1) : [];
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
    }).where(eq6(ambassadorClients.id, owner.id));
  }
  console.log(
    `[Embajadores] Orden ${order.orderNumber}: ${earner.name} (${earner.code}) cobra $${commissionAmount.toLocaleString("es-CL")} = ${percent}% de $${baseAmount.toLocaleString("es-CL")} \xB7 cliente ${attribution.clientType}${attribution.countsForTier ? ` \xB7 venta #${salesRank} del mes ${monthKey}` : ""}${code && fromCode && owner && owner.ambassadorId !== earner.id ? " \xB7 c\xF3digo cruzado" : ""}`
  );
  return { attributed: true, ambassadorId: earner.id, clientType: attribution.clientType, percent, amount: commissionAmount };
}
async function getAmbassadorById(db, id) {
  const [row] = await db.select().from(exclusiveAmbassadors).where(eq6(exclusiveAmbassadors.id, id)).limit(1);
  return row ?? null;
}
async function getAmbassadorStats(ambassadorId, monthKey) {
  const db = await getDb();
  if (!db) return null;
  const all = await db.select().from(ambassadorCommissions).where(eq6(ambassadorCommissions.ambassadorId, ambassadorId));
  const delMes = all.filter((c) => c.monthKey === monthKey);
  const exclusivasDelMes = delMes.filter((c) => c.clientType === "exclusivo");
  const config = await getProgramConfig();
  const monthlySales = exclusivasDelMes.length;
  const clientes = await db.select({ count: sql3`COUNT(*)` }).from(ambassadorClients).where(eq6(ambassadorClients.ambassadorId, ambassadorId));
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
  const rows = await db.select().from(ambassadorCommissions).where(eq6(ambassadorCommissions.ambassadorId, ambassadorId)).orderBy(sql3`${ambassadorCommissions.createdAt} DESC`).limit(limit);
  if (rows.length === 0) return [];
  const eventIds = Array.from(new Set(rows.map((r) => r.eventId).filter(Boolean)));
  const eventRows = eventIds.length ? await db.select({ id: events.id, title: events.title }).from(events).where(inArray3(events.id, eventIds)) : [];
  const titleById = new Map(eventRows.map((e) => [e.id, e.title]));
  const orderIds = Array.from(new Set(rows.map((r) => r.orderId).filter(Boolean)));
  const orderRows = orderIds.length ? await db.select({ id: orders.id, orderNumber: orders.orderNumber, buyerName: orders.buyerName }).from(orders).where(inArray3(orders.id, orderIds)) : [];
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
var AVG_SALE_PRICE_FALLBACK_CLP = 3e4;
async function getAmbassadorAvgSalePrice(ambassadorId) {
  const db = await getDb();
  if (!db) return { amount: AVG_SALE_PRICE_FALLBACK_CLP, source: "referencia" };
  const [propio] = await db.select({ avg: sql3`AVG(${ambassadorCommissions.baseAmount})`, n: sql3`COUNT(*)` }).from(ambassadorCommissions).where(eq6(ambassadorCommissions.ambassadorId, ambassadorId));
  if (Number(propio?.n ?? 0) > 0) return { amount: Math.round(Number(propio.avg)), source: "propio" };
  const [programa] = await db.select({ avg: sql3`AVG(${ambassadorCommissions.baseAmount})`, n: sql3`COUNT(*)` }).from(ambassadorCommissions);
  if (Number(programa?.n ?? 0) > 0) return { amount: Math.round(Number(programa.avg)), source: "programa" };
  return { amount: AVG_SALE_PRICE_FALLBACK_CLP, source: "referencia" };
}
async function getAmbassadorEventStats(ambassadorId, eventId) {
  const db = await getDb();
  if (!db) return null;
  const [event] = await db.select({ id: events.id, title: events.title }).from(events).where(eq6(events.id, eventId)).limit(1);
  if (!event) return null;
  const rows = await db.select().from(ambassadorCommissions).where(and4(eq6(ambassadorCommissions.ambassadorId, ambassadorId), eq6(ambassadorCommissions.eventId, eventId)));
  return {
    eventId: event.id,
    eventTitle: event.title,
    sales: rows.length,
    commission: rows.reduce((s, c) => s + Number(c.commissionAmount), 0)
  };
}
async function getAmbassadorPanel(code, now = /* @__PURE__ */ new Date()) {
  const db = await getDb();
  if (!db) return null;
  const clean = (code ?? "").trim().toUpperCase();
  if (!clean) return null;
  const [ambassador] = await db.select().from(exclusiveAmbassadors).where(eq6(exclusiveAmbassadors.code, clean)).limit(1);
  if (!ambassador) return null;
  const monthKey = monthKeyFor(now);
  const stats = await getAmbassadorStats(ambassador.id, monthKey);
  const sales = await getAmbassadorSales(ambassador.id, 50);
  const config = await getProgramConfig();
  const overridePercent = ambassador.commissionPercent === null || ambassador.commissionPercent === void 0 ? null : Number(ambassador.commissionPercent);
  if (stats && overridePercent !== null) stats.currentPercent = overridePercent;
  const avgSalePrice = await getAmbassadorAvgSalePrice(ambassador.id);
  const featuredEvent = await getFeaturedEvent();
  const eventStats = featuredEvent ? await getAmbassadorEventStats(ambassador.id, featuredEvent.id) : null;
  return {
    name: ambassador.name,
    code: ambassador.code,
    active: ambassador.active === 1,
    instagram: ambassador.instagram,
    stats,
    sales: sales.map((s) => ({ ...s, customerEmail: maskEmail(s.customerEmail), customerName: s.customerName })),
    commissionScale: config.commissionScale,
    existingClientPercent: config.existingClientPercent,
    overridePercent,
    avgSalePrice,
    eventStats
  };
}
async function getAmbassadorRanking(monthKey) {
  const db = await getDb();
  if (!db) return [];
  const ambassadors = await db.select().from(exclusiveAmbassadors).orderBy(exclusiveAmbassadors.name);
  const rows = await db.select().from(ambassadorCommissions).where(eq6(ambassadorCommissions.monthKey, monthKey));
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
  const rows = await db.select().from(ambassadorCommissions).where(eq6(ambassadorCommissions.monthKey, monthKey));
  const exclusivas = rows.filter((r) => r.clientType === "exclusivo");
  const top = ranking.find((r) => r.exclusiveSales > 0) ?? null;
  const deliveries = await db.select({ count: sql3`COUNT(*)` }).from(ambassadorBenefitDeliveries).where(eq6(ambassadorBenefitDeliveries.monthKey, monthKey));
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
  return db.select().from(ambassadorBenefitDeliveries).where(eq6(ambassadorBenefitDeliveries.monthKey, monthKey));
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
  await db.delete(ambassadorBenefitDeliveries).where(and4(
    eq6(ambassadorBenefitDeliveries.ambassadorId, params.ambassadorId),
    eq6(ambassadorBenefitDeliveries.monthKey, params.monthKey),
    eq6(ambassadorBenefitDeliveries.benefitKey, params.benefitKey)
  ));
  return { success: true };
}
async function getWeeklyMaterial() {
  const db = await getDb();
  if (!db) return null;
  const [row] = await db.select().from(ambassadorWeeklyMaterial).where(eq6(ambassadorWeeklyMaterial.active, 1)).orderBy(desc2(ambassadorWeeklyMaterial.createdAt)).limit(1);
  return row ?? null;
}
async function saveWeeklyMaterial(data) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(ambassadorWeeklyMaterial).set({ active: 0 }).where(eq6(ambassadorWeeklyMaterial.active, 1));
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
  const ambassadors = await db.select().from(exclusiveAmbassadors).where(eq6(exclusiveAmbassadors.active, 1));
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
var WeeklyMaterialContentSchema = z.object({
  title: z.string().min(4).max(80),
  storiesText: z.string().min(20).max(600),
  reelText: z.string().min(20).max(600),
  postText: z.string().min(20).max(800),
  countdownText: z.string().min(4).max(200)
});
var WEEKLY_MATERIAL_JSON_SCHEMA = {
  name: "weekly_material",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["title", "storiesText", "reelText", "postText", "countdownText"],
    properties: {
      title: { type: "string", description: 'C\xF3mo se llama la semana. Corto y con energ\xEDa, ej: "Semana 2 \u2014 cuenta regresiva".' },
      storiesText: { type: "string", description: "Qu\xE9 subir en historias esta semana. Accionable y concreto: qu\xE9 mostrar, qu\xE9 decir, qu\xE9 stickers usar." },
      reelText: { type: "string", description: "La idea del reel: el gancho de los primeros 3 segundos, qu\xE9 se ve y c\xF3mo cierra." },
      postText: { type: "string", description: "Texto sugerido para la publicaci\xF3n del feed, listo para copiar y pegar. Incluye hashtags si aportan." },
      countdownText: { type: "string", description: "Frase de cuenta regresiva al evento, corta y con urgencia genuina." }
    }
  }
};
var WEEKLY_MATERIAL_SYSTEM_PROMPT = `Preparas el material semanal que Mansion Playroom (productora de fiestas en Vi\xF1a del Mar y Valpara\xEDso, Chile) le env\xEDa a sus embajadores.

QUI\xC9N LO LEE: no es el p\xFAblico. Lo lee un embajador o embajadora que tiene que crear contenido esta semana para promocionar el evento con su c\xF3digo personal. Tu trabajo es que abra el correo y sepa exactamente qu\xE9 hacer, sin tener que pensarlo.

Por eso el material es una INSTRUCCI\xD3N CLARA, no un texto bonito. Nada de "comparte con entusiasmo": di qu\xE9 grabar, qu\xE9 mostrar y qu\xE9 decir.

Cada campo cumple una funci\xF3n distinta y NO se repiten entre s\xED:
- "title": c\xF3mo se llama la semana. Corto, da el tema.
- "storiesText": qu\xE9 subir en historias. Concreto y accionable \u2014 qu\xE9 mostrar, qu\xE9 texto poner, qu\xE9 sticker usar. Es lo que m\xE1s se usa, hazlo f\xE1cil.
- "reelText": la idea del reel. Parte por el gancho de los primeros 3 segundos, despu\xE9s qu\xE9 se ve, y c\xF3mo cierra con llamado a la acci\xF3n.
- "postText": el texto de la publicaci\xF3n del feed, LISTO PARA COPIAR Y PEGAR. Escr\xEDbelo en primera persona como si lo publicara el embajador, no en tercera. Puedes cerrar con hashtags si aportan.
- "countdownText": una frase de cuenta regresiva, corta.

Tono: chileno neutro, tuteo, cercano y con energ\xEDa de fiesta. Emojis con moderaci\xF3n (\u{1F36C}\u2728\u{1F525}), nunca m\xE1s de dos por campo.

REGLAS DURAS:
- El evento es estrictamente +18, pero el contenido que se publica en redes debe ser apto para las normas de Instagram y TikTok: sugerente est\xE1 bien, expl\xEDcito NO. Si el material hace que le bajen el post al embajador, no sirve.
- No inventes datos que no te dieron: nada de precios, direcciones, artistas ni horarios que no aparezcan en el contexto.
- Recu\xE9rdale usar su c\xF3digo personal, pero sin repetirlo en los cinco campos.

Responde \xDANICAMENTE con el JSON pedido, sin explicaciones.`;
function extractWeeklyContent(message) {
  if (typeof message.content === "string") return message.content;
  return message.content.map((p) => p.type === "text" ? p.text ?? "" : "").join("");
}
async function generateWeeklyMaterial(idea) {
  const evento = await getFeaturedEvent();
  const partesContexto = [];
  if (evento) {
    partesContexto.push(`Evento: ${evento.title}`);
    if (evento.eventDate) {
      const fecha = new Date(evento.eventDate);
      partesContexto.push(`Fecha: ${formatChileDate(fecha)}`);
      const dias = Math.ceil((fecha.getTime() - Date.now()) / 864e5);
      if (dias > 0) partesContexto.push(`Faltan ${dias} d\xEDas`);
    }
    if (evento.shortDescription) partesContexto.push(`Sobre el evento: ${evento.shortDescription}`);
  }
  partesContexto.push(`Tareas a las que se comprometieron los embajadores: ${AMBASSADOR_TASKS.join("; ")}`);
  const result = await invokeLLM({
    messages: [
      { role: "system", content: WEEKLY_MATERIAL_SYSTEM_PROMPT },
      { role: "user", content: `Idea para el material de esta semana: ${idea}

Contexto:
${partesContexto.join("\n")}` }
    ],
    responseFormat: { type: "json_schema", json_schema: WEEKLY_MATERIAL_JSON_SCHEMA }
  });
  const raw = extractWeeklyContent(result.choices[0]?.message ?? { content: "" });
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("La IA no devolvi\xF3 un JSON v\xE1lido. Intenta de nuevo con una idea m\xE1s clara.");
  }
  const validated = WeeklyMaterialContentSchema.safeParse(parsed);
  if (!validated.success) {
    throw new Error(`El material generado no tiene el formato esperado: ${validated.error.issues[0]?.message ?? "error desconocido"}.`);
  }
  return validated.data;
}

// server/webhooks.ts
init_schema();
import { eq as eq7, and as and5, sql as sql4, isNotNull, ne as ne2, inArray as inArray4 } from "drizzle-orm";
import { nanoid as nanoid2 } from "nanoid";
var webhooksRouter = Router();
function formatEventDate(date) {
  return formatChileDate(date, { withYear: true });
}
var formatEventTime = formatChileTime;
function mapPaymentStatus(mpStatus) {
  if (mpStatus === "approved") return "approved";
  if (mpStatus === "rejected" || mpStatus === "cancelled") return "rejected";
  return "pending";
}
async function applyPaymentResult(input) {
  const db = await getDb();
  if (!db) return { ok: false, reason: "Database not available" };
  const [order] = await db.select().from(orders).where(eq7(orders.orderNumber, input.orderNumber)).limit(1);
  if (!order) return { ok: false, reason: "Order not found" };
  if (order.paymentId === input.paymentId && order.paymentStatus !== "pending") {
    return { ok: true, alreadyProcessed: true };
  }
  await db.update(orders).set({
    paymentStatus: input.status,
    paymentId: input.paymentId,
    paymentMethod: input.paymentMethodId || void 0
  }).where(eq7(orders.id, order.id));
  if (input.status === "approved") {
    const isTopupPayment = order.missionTopupStatus === "pending";
    const isMissionDeposit = order.missionDeposit === 1 && order.missionTopupStatus === "none";
    if (!isTopupPayment) {
      const items = await db.select().from(orderItems).where(eq7(orderItems.orderId, order.id));
      for (const item of items) {
        await db.update(ticketTypes).set({ soldCount: sql4`soldCount + ${item.quantity}` }).where(eq7(ticketTypes.id, item.ticketTypeId));
      }
      if (order.eventId) await checkAndAdvanceTandaIfNeeded(order.eventId);
    }
    if (isMissionDeposit) {
      if (!order.depositEmailSent) await sendMissionDepositEmail(order);
    } else if (isTopupPayment) {
      await db.update(orders).set({ missionTopupStatus: "paid" }).where(eq7(orders.id, order.id));
      if (!order.emailSent) await processApprovedOrder(order);
    } else if (!order.emailSent) {
      await processApprovedOrder(order);
    }
  }
  return { ok: true };
}
async function approveMissionTopupWithoutPayment(orderId) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [order] = await db.select().from(orders).where(eq7(orders.id, orderId)).limit(1);
  if (!order) throw new Error("Orden no encontrada");
  if (order.missionTopupStatus !== "pending") throw new Error("Esta orden no tiene un pago de diferencia pendiente");
  await db.update(orders).set({ missionTopupStatus: "paid", missionTopupAmount: "0" }).where(eq7(orders.id, order.id));
  if (!order.emailSent) await processApprovedOrder(order);
  return { success: true };
}
async function processCardPaymentForOrder(input) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [order] = await db.select().from(orders).where(eq7(orders.orderNumber, input.orderNumber)).limit(1);
  if (!order) throw new Error("Order not found");
  if (order.paymentStatus === "approved") throw new Error("Order already paid");
  const [event] = await db.select().from(events).where(eq7(events.id, order.eventId)).limit(1);
  const result = await createCardPayment({
    orderNumber: order.orderNumber,
    amount: Number(order.total),
    description: event?.title ?? "Mansion Playroom",
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
  const [order] = await db.select().from(orders).where(eq7(orders.orderNumber, orderNumber)).limit(1);
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
  const [previousOrder] = await db.select().from(orders).where(and5(eq7(orders.buyerEmail, order.buyerEmail), eq7(orders.paymentStatus, "approved"), isNotNull(orders.ambassadorCode), ne2(orders.id, order.id))).orderBy(orders.createdAt).limit(1);
  const existingUsers = previousOrder ? null : await db.select().from(users).where(eq7(users.email, order.buyerEmail)).limit(1);
  const code = previousOrder?.ambassadorCode || existingUsers?.[0]?.ambassadorCode || nanoid2(8).toUpperCase();
  await db.update(orders).set({ ambassadorCode: code }).where(eq7(orders.id, order.id));
  return code;
}
async function sendMissionDepositEmail(order) {
  const db = await getDb();
  if (!db) return { success: false };
  const [event] = await db.select().from(events).where(eq7(events.id, order.eventId)).limit(1);
  if (!event) return { success: false };
  const items = await db.select().from(orderItems).where(eq7(orderItems.orderId, order.id));
  const emailItems = [];
  for (const item of items) {
    const [tt] = await db.select().from(ticketTypes).where(eq7(ticketTypes.id, item.ticketTypeId)).limit(1);
    emailItems.push({ name: tt?.name || "Entrada", quantity: item.quantity, price: Number(item.totalPrice) });
  }
  const ambassadorCode = await ensureOwnAmbassadorCode(db, order);
  const templateConfig = normalizeOrderEmailConfig((await getSiteSettings()).emailTemplateConfig);
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
    discount: Number(order.discount ?? 0),
    serviceFee: Number(order.serviceFee ?? 0),
    ambassadorCode,
    isMissionDeposit: true,
    ticketReady: false,
    templateConfig
  });
  const result = await sendEmail({
    to: order.buyerEmail,
    subject: `\u{1F36C} Ya est\xE1s en la Misi\xF3n 300 - ${event.title}`,
    html
  });
  if (result.success) {
    await db.update(orders).set({ depositEmailSent: 1 }).where(eq7(orders.id, order.id));
  }
  return result;
}
async function sendConfirmationEmailForOrder(order) {
  const db = await getDb();
  if (!db) return { success: false };
  const [event] = await db.select().from(events).where(eq7(events.id, order.eventId)).limit(1);
  if (!event) return { success: false };
  const items = await db.select().from(orderItems).where(eq7(orderItems.orderId, order.id));
  const emailItems = [];
  for (const item of items) {
    const [tt] = await db.select().from(ticketTypes).where(eq7(ticketTypes.id, item.ticketTypeId)).limit(1);
    emailItems.push({ name: tt?.name || "Entrada", quantity: item.quantity, price: Number(item.totalPrice) });
  }
  const orderTickets = await db.select().from(tickets).where(eq7(tickets.orderId, order.id));
  let mainTicket = null;
  for (const t2 of orderTickets) {
    const [tt] = await db.select().from(ticketTypes).where(eq7(ticketTypes.id, t2.ticketTypeId)).limit(1);
    if (tt?.category === "acceso") {
      mainTicket = t2;
      break;
    }
  }
  if (!mainTicket) mainTicket = orderTickets[0];
  const extras = await getOrderExtras(order.id);
  const templateConfig = normalizeOrderEmailConfig((await getSiteSettings()).emailTemplateConfig);
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
    discount: Number(order.discount ?? 0),
    serviceFee: Number(order.serviceFee ?? 0),
    ambassadorCode: order.ambassadorCode || "",
    isMissionDeposit: order.missionDeposit === 1,
    ticketReady: true,
    ticketCode: mainTicket?.ticketCode,
    attendeeNames: parseAttendeeNames(order.attendeeData),
    extras,
    templateConfig
  });
  const result = await sendEmail({
    to: order.buyerEmail,
    subject: `\u{1F389} Tu entrada para ${event.title} - Mansion Playroom`,
    html
  });
  return result;
}
async function resendConfirmationEmail(orderNumber) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [order] = await db.select().from(orders).where(eq7(orders.orderNumber, orderNumber)).limit(1);
  if (!order) throw new Error("Orden no encontrada");
  if (order.paymentStatus !== "approved") throw new Error("La orden todav\xEDa no est\xE1 aprobada");
  const existingTickets = await db.select().from(tickets).where(eq7(tickets.orderId, order.id)).limit(1);
  const isUnresolvedDeposit = existingTickets.length === 0 && order.missionDeposit === 1;
  const result = isUnresolvedDeposit ? await sendMissionDepositEmail(order) : await sendConfirmationEmailForOrder(order);
  if (!result.success) throw new Error("Resend rechaz\xF3 el env\xEDo -- revisa la configuraci\xF3n de RESEND_API_KEY/RESEND_FROM_EMAIL en Vercel.");
  return { success: true };
}
async function processApprovedOrder(order) {
  const db = await getDb();
  if (!db) return;
  const items = await db.select().from(orderItems).where(eq7(orderItems.orderId, order.id));
  const [event] = await db.select().from(events).where(eq7(events.id, order.eventId)).limit(1);
  if (!event) return;
  const gift = await getPartyGiftByOrderId(order.id);
  const giftRecipient = gift ? await getPartyProfileContact(gift.toProfileId) : null;
  const giftSender = gift ? await getPartyProfileContact(gift.fromProfileId) : null;
  let giftTicketId = null;
  let giftDisplayCode = null;
  const orderTicketTypeIds = Array.from(new Set(items.map((i) => i.ticketTypeId)));
  const orderTicketTypes = orderTicketTypeIds.length ? await db.select().from(ticketTypes).where(inArray4(ticketTypes.id, orderTicketTypeIds)) : [];
  const ticketTypeById = new Map(orderTicketTypes.map((tt) => [tt.id, tt]));
  for (const item of items) {
    const tt = ticketTypeById.get(item.ticketTypeId);
    if (tt && isTopupProduct(tt)) continue;
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
  await matchLeadForOrder2(order);
  const topupLines = items.map((item) => ({ item, tt: ticketTypeById.get(item.ticketTypeId) })).filter((x) => !!x.tt && isTopupProduct(x.tt)).map((x) => ({ topupAmount: x.tt.topupAmount, unitPrice: Number(x.item.unitPrice), quantity: x.item.quantity }));
  const topupCredit = topupCreditForLines(topupLines);
  if (topupCredit > 0) {
    await creditPrepaid({ email: order.buyerEmail, amountClp: topupCredit, reason: "topup_web", orderId: order.id });
  }
  const [customerRow] = await db.select({ id: customers.id }).from(customers).where(eq7(customers.email, order.buyerEmail.trim().toLowerCase())).limit(1);
  if (customerRow) await db.update(orders).set({ customerId: customerRow.id }).where(eq7(orders.id, order.id));
  const topupCharge = topupChargeForLines(topupLines);
  await awardPlaycoins({ email: order.buyerEmail, totalClp: Number(order.total) - topupCharge, reason: "earn_web", orderId: order.id });
  const referrerCode = order.referredByCode || order.ambassadorCode;
  const accesoSubtotal = items.reduce((sum, item) => {
    const tt = ticketTypeById.get(item.ticketTypeId);
    return tt?.category === "acceso" ? sum + Number(item.totalPrice) : sum;
  }, 0);
  const vipAttribution = await attributeAmbassadorSale({ order, accesoSubtotal, priorCustomer });
  if (referrerCode && !vipAttribution.attributed) {
    const [ambassadorOrder] = await db.select().from(orders).where(and5(eq7(orders.ambassadorCode, referrerCode), eq7(orders.paymentStatus, "approved"))).limit(1);
    if (ambassadorOrder && ambassadorOrder.id !== order.id) {
      const totalTickets = items.reduce((sum, item) => sum + item.quantity, 0);
      await db.insert(referrals).values({
        ambassadorCode: referrerCode,
        orderId: order.id,
        buyerEmail: order.buyerEmail,
        ticketCount: totalTickets,
        orderTotal: order.total
      });
      const [{ count: referralCount }] = await db.select({ count: sql4`COUNT(*)` }).from(referrals).where(eq7(referrals.ambassadorCode, referrerCode));
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
  const [refreshedOrder] = await db.select().from(orders).where(eq7(orders.id, order.id)).limit(1);
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
    await db.update(orders).set({ emailSent: 1 }).where(eq7(orders.id, order.id));
    return;
  }
  const result = await sendConfirmationEmailForOrder(refreshedOrder ?? order);
  if (result.success) {
    await db.update(orders).set({ emailSent: 1 }).where(eq7(orders.id, order.id));
  }
  if (order.channel === "web") {
    await sendPushToAdmins("pushNewOrder", {
      title: "\u{1F36D} Venta web nueva",
      body: `${order.buyerName} \u2014 $${Number(order.total).toLocaleString("es-CL")}`,
      url: "/admin"
    });
  }
}
async function getMission300Status(eventId) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [event] = await db.select().from(events).where(eq7(events.id, eventId)).limit(1);
  if (!event) throw new Error("Event not found");
  const eligible = await db.select().from(orders).where(and5(
    eq7(orders.eventId, eventId),
    eq7(orders.missionDeposit, 1),
    eq7(orders.paymentStatus, "approved"),
    eq7(orders.missionTopupStatus, "none")
  ));
  let totalPersonas = 0;
  for (const order of eligible) {
    const items = await db.select().from(orderItems).where(eq7(orderItems.orderId, order.id));
    for (const item of items) {
      const [tt] = await db.select().from(ticketTypes).where(eq7(ticketTypes.id, item.ticketTypeId)).limit(1);
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
  const [event] = await db.select().from(events).where(eq7(events.id, eventId)).limit(1);
  if (!event) throw new Error("Event not found");
  const eligible = await db.select().from(orders).where(and5(
    eq7(orders.eventId, eventId),
    eq7(orders.missionDeposit, 1),
    eq7(orders.paymentStatus, "approved"),
    eq7(orders.missionTopupStatus, "none")
  ));
  const orderItemsByOrder = /* @__PURE__ */ new Map();
  let totalPersonas = 0;
  for (const order of eligible) {
    const items = await db.select().from(orderItems).where(eq7(orderItems.orderId, order.id));
    const withTt = [];
    for (const item of items) {
      const [tt] = await db.select().from(ticketTypes).where(eq7(ticketTypes.id, item.ticketTypeId)).limit(1);
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
      await db.update(orders).set({ missionTopupStatus: "paid", missionTopupAmount: "0" }).where(eq7(orders.id, order.id));
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
      await db.update(orders).set({ missionTopupStatus: "paid", missionTopupAmount: "0" }).where(eq7(orders.id, order.id));
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
    }).where(eq7(orders.id, order.id));
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
function formatEventDateTime(date) {
  return `${formatChileDate(date)}, ${formatChileTime(date)} hrs`;
}
async function getMailingEventInfo() {
  const event = await getFeaturedEvent();
  if (!event) return null;
  const eventDate = new Date(event.eventDate);
  let mission300 = null;
  if (isMissionActiveForEvent(event)) {
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
var MailingContentSchema = z2.object({
  subject: z2.string().min(4).max(90),
  preheader: z2.string().max(140).optional(),
  headline: z2.string().min(4).max(80),
  paragraphs: z2.array(z2.string().min(4).max(500)).min(1).max(4),
  ctaText: z2.string().max(40).optional(),
  highlightLabel: z2.string().max(60).optional(),
  highlightValue: z2.string().max(60).optional()
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
async function sendMailingBatch(customerIds, content, ctaUrl, campaignTag, eventInfo, eventSections, source = "manual") {
  const recipients = await listCustomersByIds(customerIds);
  const results = [];
  const cleanCampaignTag = campaignTag?.trim();
  const batchId = nanoid3();
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
    try {
      await logMailingSend({
        batchId,
        source,
        label: content.subject,
        customerId: customer.id,
        email: customer.email,
        success: sent.success,
        reason: sent.reason
      });
    } catch (err) {
      console.error("[Mailing] No se pudo loguear el env\xEDo:", err);
    }
    await sleep2(THROTTLE_MS);
  }
  return { batchId, results };
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
var CRON_MAX_PER_RUN = Number(process.env.MAILING_CRON_RUN_CAP) || 25;
var AUTOMATED_EMAIL_DAILY_CAP = Number(process.env.AUTOMATED_EMAIL_DAILY_CAP) || 60;
async function processMailingCronBatch() {
  const start = Date.now();
  const sentToday = await countAutomatedEmailsSentToday();
  const dailyRemaining = AUTOMATED_EMAIL_DAILY_CAP - sentToday;
  if (dailyRemaining <= 0) {
    return { processed: 0, sent: 0, failed: 0, campaignsTouched: 0 };
  }
  const pending = await getPendingMailingRecipients(Math.min(CRON_MAX_PER_RUN, dailyRemaining));
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

// server/orderReminders.ts
import { z as z3 } from "zod";
import { eq as eq8, inArray as inArray5, and as and6, lte as lte2 } from "drizzle-orm";
init_schema();
var APP_URL = process.env.APP_URL && process.env.APP_URL !== "https://mansionplayroom.cl" ? process.env.APP_URL : "https://mansionplayroom.cl";
async function sendPendingReminders(params) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const resultado = { sent: 0, skipped: [], failed: [] };
  if (!params.orderIds.length) return resultado;
  const filas = await db.select({
    id: orders.id,
    orderNumber: orders.orderNumber,
    buyerName: orders.buyerName,
    buyerEmail: orders.buyerEmail,
    total: orders.total,
    paymentStatus: orders.paymentStatus,
    reminderCount: orders.reminderCount,
    eventTitle: events.title,
    eventSlug: events.slug,
    eventDate: events.eventDate
  }).from(orders).leftJoin(events, eq8(orders.eventId, events.id)).where(inArray5(orders.id, params.orderIds));
  for (const orden of filas) {
    if (orden.paymentStatus !== "pending") {
      resultado.skipped.push({
        orderNumber: orden.orderNumber,
        motivo: orden.paymentStatus === "approved" ? "ya pag\xF3" : `estado: ${orden.paymentStatus}`
      });
      continue;
    }
    try {
      await sendEmail({
        to: orden.buyerEmail,
        subject: `${orden.buyerName.split(" ")[0]}, tu acceso te est\xE1 esperando \u{1F36C}`,
        html: buildPendingReminderEmail({
          buyerName: orden.buyerName,
          eventTitle: orden.eventTitle ?? "nuestra pr\xF3xima fiesta",
          eventDate: orden.eventDate ? new Date(orden.eventDate) : null,
          total: Number(orden.total),
          checkoutUrl: orden.eventSlug ? `${APP_URL}/checkout/${orden.eventSlug}` : `${APP_URL}/eventos`,
          customBody: params.customBody
        })
      });
      await db.update(orders).set({ reminderSentAt: /* @__PURE__ */ new Date(), reminderCount: (orden.reminderCount ?? 0) + 1 }).where(eq8(orders.id, orden.id));
      resultado.sent++;
    } catch (err) {
      resultado.failed.push({
        orderNumber: orden.orderNumber,
        error: err.message ?? "error desconocido"
      });
    }
  }
  console.log(`[Recordatorios] Enviados: ${resultado.sent} \xB7 Omitidos: ${resultado.skipped.length} \xB7 Con error: ${resultado.failed.length}`);
  return resultado;
}
var ABANDONED_CART_MIN_AGE_MS = 3 * 60 * 60 * 1e3;
var ABANDONED_CART_REMINDER_GAP_MS = 3 * 24 * 60 * 60 * 1e3;
var ABANDONED_CART_MAX_REMINDERS = 3;
var ABANDONED_CART_CRON_CAP = Number(process.env.ABANDONED_CART_CRON_CAP) || 10;
async function getOrdersDueForAbandonedCartReminder() {
  const db = await getDb();
  if (!db) return [];
  const now = Date.now();
  const cutoffCreated = new Date(now - ABANDONED_CART_MIN_AGE_MS);
  const candidatas = await db.select({
    id: orders.id,
    createdAt: orders.createdAt,
    reminderSentAt: orders.reminderSentAt,
    reminderCount: orders.reminderCount,
    eventDate: events.eventDate
  }).from(orders).leftJoin(events, eq8(orders.eventId, events.id)).where(and6(
    eq8(orders.paymentStatus, "pending"),
    eq8(orders.channel, "web"),
    lte2(orders.createdAt, cutoffCreated)
  )).orderBy(orders.createdAt);
  return candidatas.filter((o) => {
    if (o.eventDate && new Date(o.eventDate).getTime() < now) return false;
    if ((o.reminderCount ?? 0) >= ABANDONED_CART_MAX_REMINDERS) return false;
    if (o.reminderSentAt && now - new Date(o.reminderSentAt).getTime() < ABANDONED_CART_REMINDER_GAP_MS) return false;
    return true;
  }).map((o) => o.id);
}
async function runAbandonedCartCron() {
  const eligible = await getOrdersDueForAbandonedCartReminder();
  const sentToday = await countAutomatedEmailsSentToday();
  const dailyRemaining = AUTOMATED_EMAIL_DAILY_CAP - sentToday;
  if (dailyRemaining <= 0) return { sent: 0, skipped: [], failed: [], eligible: eligible.length };
  const orderIds = eligible.slice(0, Math.min(ABANDONED_CART_CRON_CAP, dailyRemaining));
  if (orderIds.length === 0) return { sent: 0, skipped: [], failed: [], eligible: eligible.length };
  const resultado = await sendPendingReminders({ orderIds });
  return { ...resultado, eligible: eligible.length };
}
var ReminderCopySchema = z3.object({
  paragraphs: z3.array(z3.string().min(10).max(400)).min(1).max(3)
});
var REMINDER_JSON_SCHEMA = {
  name: "reminder_copy",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["paragraphs"],
    properties: {
      paragraphs: {
        type: "array",
        minItems: 1,
        maxItems: 3,
        items: { type: "string", description: "Un p\xE1rrafo del cuerpo del correo." },
        description: "Entre 1 y 3 p\xE1rrafos cortos. Sin saludo inicial ni firma: eso ya lo pone la plantilla."
      }
    }
  }
};
var REMINDER_SYSTEM_PROMPT = `Escribes el cuerpo de un correo de Mansion Playroom, una productora de fiestas en Vi\xF1a del Mar y Valpara\xEDso (Chile), dirigido a alguien que empez\xF3 a comprar su entrada y no termin\xF3 de pagar.

REGLA M\xC1S IMPORTANTE: es un recordatorio amable, NO una venta agresiva.
- Nada de "\xFAltima oportunidad", "no te quedes fuera", cuentas regresivas falsas ni presi\xF3n artificial.
- Nada de descuentos ni promesas que no puedes cumplir: no sabes si quedan cupos ni a qu\xE9 precio.
- Da por hecho que la persona simplemente se distrajo o qued\xF3 a medias, porque casi siempre es eso.

Tono: cercano, chileno neutro, tuteo. C\xE1lido y relajado, como quien avisa "oye, qued\xF3 pendiente esto". Puedes usar alg\xFAn emoji con moderaci\xF3n (\u{1F36C}\u2728), nunca m\xE1s de uno por p\xE1rrafo.

Estructura: entre 1 y 3 p\xE1rrafos cortos. El primero recuerda que la compra qued\xF3 a medio camino. El resto puede recordar por qu\xE9 vale la pena la noche o facilitar retomar. NO escribas saludo ("Hola X") ni despedida ni firma: la plantilla del correo ya los pone.

Responde \xDANICAMENTE con el JSON pedido, sin explicaciones.`;
async function generateReminderCopy(idea) {
  const result = await invokeLLM({
    messages: [
      { role: "system", content: REMINDER_SYSTEM_PROMPT },
      { role: "user", content: `\xC1ngulo que quiero para este recordatorio: ${idea}` }
    ],
    responseFormat: { type: "json_schema", json_schema: REMINDER_JSON_SCHEMA }
  });
  const raw = extractContent(result.choices[0]?.message ?? { content: "" });
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("La IA no devolvi\xF3 un JSON v\xE1lido. Intenta de nuevo con una idea m\xE1s clara.");
  }
  const validated = ReminderCopySchema.safeParse(parsed);
  if (!validated.success) {
    throw new Error(`El texto generado no tiene el formato esperado: ${validated.error.issues[0]?.message ?? "error desconocido"}.`);
  }
  return validated.data;
}

// server/foundersPromo.ts
import { eq as eq9, and as and7 } from "drizzle-orm";
init_schema();
var FOUNDERS_PROMO_TAG = "promo-primeros-cupos";
var FOUNDERS_PROMO_DAILY_TARGET = Number(process.env.FOUNDERS_PROMO_DAILY_CAP) || 50;
async function resolveSharedPoolRemaining(eventId) {
  const db = await getDb();
  if (!db) return null;
  const activos = await db.select().from(ticketTypes).where(and7(
    eq9(ticketTypes.eventId, eventId),
    eq9(ticketTypes.category, "acceso"),
    eq9(ticketTypes.status, "active")
  ));
  const poolIds = Array.from(new Set(activos.map((a) => a.stockPoolId).filter((id) => id != null)));
  if (poolIds.length !== 1) return null;
  const info = await getStockPoolRemaining(poolIds[0]);
  return info ? info.remaining : null;
}
function buildFoundersPromoContent(remaining, event) {
  return {
    subject: `Quedan ${remaining} cupos a precio especial para ${event.title}`,
    preheader: `Todav\xEDa no compraste tu entrada -- quedan ${remaining} cupos a este valor.`,
    headline: `Quedan ${remaining} cupos a precio especial \u{1F36C}`,
    paragraphs: [
      `Est\xE1s en nuestra lista para ${event.title} (${EVENT_BRAND.fechaTexto}) y vimos que todav\xEDa no compraste tu entrada.`,
      `Ahora mismo estamos en la primera etapa de venta -- el precio m\xE1s bajo de toda la campa\xF1a. Quedan pocos cupos a este valor; una vez que se agoten, la pr\xF3xima etapa sube de precio.`,
      `${EVENT_BRAND.dressCode}`
    ],
    ctaText: "Comprar mi entrada",
    highlightLabel: "Quedan",
    highlightValue: `${remaining} cupos`
  };
}
async function runFoundersPromoDaily() {
  const settings = await getSiteSettings();
  if (!settings.foundersPromoEnabled) return { ran: false, reason: "disabled" };
  const event = await getFeaturedEvent();
  if (!event) return { ran: false, reason: "no-event" };
  const remaining = await resolveSharedPoolRemaining(event.id);
  if (remaining === null) {
    await updateSiteSettings({ foundersPromoEnabled: false });
    return { ran: false, reason: "no-shared-pool" };
  }
  if (remaining <= 0) {
    await updateSiteSettings({ foundersPromoEnabled: false });
    return { ran: false, reason: "sold-out" };
  }
  const eligible = await listCustomers({ notPurchasedEventId: event.id, excludeTags: [FOUNDERS_PROMO_TAG] });
  if (eligible.length === 0) {
    await updateSiteSettings({ foundersPromoEnabled: false });
    return { ran: false, reason: "audience-exhausted" };
  }
  const batch = eligible.slice(0, FOUNDERS_PROMO_DAILY_TARGET);
  const content = buildFoundersPromoContent(remaining, event);
  const ctaUrl = `${EMAIL_BASE_URL}/checkout/${event.slug}`;
  const { results } = await sendMailingBatch(
    batch.map((c) => c.id),
    content,
    ctaUrl,
    FOUNDERS_PROMO_TAG,
    null,
    void 0,
    "founders-promo"
  );
  return {
    ran: true,
    eventTitle: event.title,
    remaining,
    audienceSize: eligible.length,
    sent: results.filter((r) => r.success).length,
    failed: results.filter((r) => !r.success).length
  };
}
async function getFoundersPromoStatus() {
  const settings = await getSiteSettings();
  const event = await getFeaturedEvent();
  if (!event) return { enabled: !!settings.foundersPromoEnabled, eventTitle: null, remaining: null, audienceSize: 0, dailyTarget: FOUNDERS_PROMO_DAILY_TARGET };
  const remaining = await resolveSharedPoolRemaining(event.id);
  const eligible = await listCustomers({ notPurchasedEventId: event.id, excludeTags: [FOUNDERS_PROMO_TAG] });
  return {
    enabled: !!settings.foundersPromoEnabled,
    eventTitle: event.title,
    remaining,
    audienceSize: eligible.length,
    dailyTarget: FOUNDERS_PROMO_DAILY_TARGET
  };
}

// server/adminDigest.ts
async function runAdminDigest() {
  const settings = await getSiteSettings();
  const config = normalizeAdminAlertsConfig(settings.adminAlertsConfig);
  if (!config.dailyDigestEmail) return { success: true, sent: false, reason: "apagado en Ajustes" };
  const since = new Date(Date.now() - 24 * 60 * 60 * 1e3);
  const [counts, newWebRevenue] = await Promise.all([
    getAdminBadgeCounts({
      "orders-web": since,
      "orders-caja": since,
      "leads": since,
      "customers": since,
      "referrals": since
    }),
    getNewWebRevenue(since)
  ]);
  const html = buildAdminDigestEmail({
    newOrdersWeb: counts["orders-web"],
    newOrdersCaja: counts["orders-caja"],
    newWebRevenue,
    newLeads: counts["leads"],
    newCustomers: counts["customers"],
    newReferrals: counts["referrals"],
    pendingApplications: counts["ambassadors"],
    openReports: counts["denuncias"],
    unclaimedGifts: counts["party-gifts"],
    openShifts: counts["caja"]
  });
  const result = await sendEmail({
    to: ADMIN_NOTIFICATION_EMAIL,
    subject: "\u{1F4CB} Resumen de novedades \u2014 Mansion Playroom",
    html
  });
  return { success: result.success, sent: result.success, reason: result.success ? void 0 : result.reason };
}

// server/cronRoutes.ts
var CHECKIN_SUMMARY_EMAIL = ADMIN_NOTIFICATION_EMAIL;
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
function registerCronRoutes(app2) {
  app2.get("/api/cron/mailing-queue", async (req, res) => {
    if (!requireCronSecret(req, res)) return;
    try {
      const result = await processMailingCronBatch();
      res.json({ success: true, ...result });
    } catch (err) {
      console.error("[Cron] Error procesando la cola de mailing:", err);
      res.status(500).json({ success: false, error: err instanceof Error ? err.message : "Error desconocido" });
    }
  });
  app2.get("/api/cron/abandoned-cart", async (req, res) => {
    if (!requireCronSecret(req, res)) return;
    try {
      const result = await runAbandonedCartCron();
      res.json({ success: true, ...result });
    } catch (err) {
      console.error("[Cron] Error mandando recordatorios de carrito abandonado:", err);
      res.status(500).json({ success: false, error: err instanceof Error ? err.message : "Error desconocido" });
    }
  });
  app2.get("/api/cron/tanda", async (req, res) => {
    if (!requireCronSecret(req, res)) return;
    try {
      let advanced = 0;
      const homeEvents = await getHomeEvents();
      for (const ev of homeEvents) {
        const result = await checkAndAdvanceTandaIfNeeded(ev.id);
        if (result.advanced) advanced++;
      }
      res.json({ success: true, eventsChecked: homeEvents.length, advanced });
    } catch (err) {
      console.error("[Cron] Error chequeando avance autom\xE1tico de tanda:", err);
      res.status(500).json({ success: false, error: err instanceof Error ? err.message : "Error desconocido" });
    }
  });
  app2.get("/api/cron/maintenance", async (req, res) => {
    if (!requireCronSecret(req, res)) return;
    let partyMessagesPurgedFor = 0;
    let partyProfilesPurged = 0;
    let giftInvitationsExpired = 0;
    try {
      partyMessagesPurgedFor = (await purgeOldPartyMessages()).deletedFor;
      partyProfilesPurged = (await purgeOldPartyProfiles()).profilesDeleted;
      giftInvitationsExpired = (await expireOldGiftInvitations()).expired;
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
    res.json({ success: true, partyMessagesPurgedFor, partyProfilesPurged, giftInvitationsExpired, ambassadorWeekly });
  });
  app2.get("/api/cron/checkin-summary", async (req, res) => {
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
  app2.get("/api/cron/founders-promo", async (req, res) => {
    if (!requireCronSecret(req, res)) return;
    try {
      const result = await runFoundersPromoDaily();
      res.json({ success: true, ...result });
    } catch (err) {
      console.error("[Cron] Error en el aviso de primeros cupos:", err);
      res.status(500).json({ success: false, error: err instanceof Error ? err.message : "Error desconocido" });
    }
  });
  app2.get("/api/cron/admin-digest", async (req, res) => {
    if (!requireCronSecret(req, res)) return;
    try {
      const result = await runAdminDigest();
      res.json(result);
    } catch (err) {
      console.error("[Cron] Error en el resumen diario del admin:", err);
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
function registerTicketAssetRoutes(app2) {
  app2.get("/api/qr/:ticketCode.png", async (req, res) => {
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
  app2.get("/api/calendar/:ticketCode.ics", async (req, res) => {
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

// server/blobUpload.ts
import { handleUpload } from "@vercel/blob/client";
var ALLOWED_CONTENT_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  // Video no tiene UI todavía (fuera de alcance este round -- ver plan),
  // pero se deja permitido para no tener que tocar esta ruta de nuevo
  // cuando se agregue subir el video del Hero.
  "video/mp4"
];
var MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
function registerBlobUploadRoutes(app2) {
  app2.post("/api/admin/blob/upload", async (req, res) => {
    if (!await requireAdmin(req, res)) return;
    try {
      const jsonResponse = await handleUpload({
        body: req.body,
        request: req,
        onBeforeGenerateToken: async () => {
          return {
            allowedContentTypes: ALLOWED_CONTENT_TYPES,
            maximumSizeInBytes: MAX_UPLOAD_BYTES,
            addRandomSuffix: true
          };
        },
        onUploadCompleted: async () => {
        }
      });
      res.json(jsonResponse);
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : "No se pudo autorizar la subida." });
    }
  });
}

// server/_core/systemRouter.ts
import { z as z4 } from "zod";

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

// server/privacy.ts
var EMAIL_KEY = /(^|[a-z])email$/i;
var PHONE_KEY = /(^|[a-z])phone$/i;
var RUT_KEY = /(^|[a-z])rut$/i;
var PERSON_NAME_KEYS = /* @__PURE__ */ new Set([
  "fullname",
  "buyername",
  "customername",
  "holdername"
]);
function maskEmail2(value) {
  const at = value.indexOf("@");
  if (at <= 0) return "***";
  return `${value[0]}***${value.slice(at)}`;
}
function maskPhone(value) {
  const digits = value.replace(/\D/g, "");
  return digits.length >= 4 ? `+56 9 ****${digits.slice(-4)}` : "****";
}
function maskName(value) {
  return value.split(/\s+/).filter(Boolean).map((word) => `${word[0].toUpperCase()}.`).join(" ") || "***";
}
function looksLikePersonRecord(obj) {
  return Object.keys(obj).some((k) => EMAIL_KEY.test(k) || PHONE_KEY.test(k));
}
function maskPii(value) {
  if (value == null) return value;
  if (Array.isArray(value)) {
    return value.map((item) => maskPii(item));
  }
  if (value instanceof Date || Buffer.isBuffer(value)) return value;
  if (typeof value === "object") {
    const obj = value;
    if (Object.getPrototypeOf(obj) !== Object.prototype && Object.getPrototypeOf(obj) !== null) {
      return value;
    }
    const isPerson = looksLikePersonRecord(obj);
    const out = {};
    for (const [key, val] of Object.entries(obj)) {
      const lower = key.toLowerCase();
      if (typeof val === "string" && val.length > 0) {
        if (EMAIL_KEY.test(key)) {
          out[key] = maskEmail2(val);
          continue;
        }
        if (PHONE_KEY.test(key)) {
          out[key] = maskPhone(val);
          continue;
        }
        if (RUT_KEY.test(key)) {
          out[key] = "**.***.***-*";
          continue;
        }
        if (lower === "instagram") {
          out[key] = "@***";
          continue;
        }
        if (PERSON_NAME_KEYS.has(lower)) {
          out[key] = maskName(val);
          continue;
        }
        if (lower === "name" && isPerson) {
          out[key] = maskName(val);
          continue;
        }
      }
      out[key] = maskPii(val);
    }
    return out;
  }
  return value;
}

// server/_core/trpc.ts
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
var adminReadProcedure = t.procedure.use(
  t.middleware(async (opts) => {
    const { ctx, next } = opts;
    if (!ctx.user || ctx.user.role !== "admin" && ctx.user.role !== "viewer") {
      throw new TRPCError2({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }
    const result = await next({ ctx: { ...ctx, user: ctx.user } });
    if (ctx.user.role === "viewer" && result.ok) {
      return { ...result, data: maskPii(result.data) };
    }
    return result;
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
var kitchenProcedure = t.procedure.use(
  t.middleware(async (opts) => {
    const { ctx, next } = opts;
    if (!ctx.operator) {
      throw new TRPCError2({ code: "UNAUTHORIZED", message: "Sesi\xF3n de cocina requerida" });
    }
    const role = ctx.operator.role;
    if (role !== "cocina" && role !== "supervisor" && role !== "admin") {
      throw new TRPCError2({ code: "FORBIDDEN", message: "Tu usuario no tiene acceso a la pantalla de cocina" });
    }
    return next({ ctx: { ...ctx, operator: ctx.operator } });
  })
);
var guardarropiaProcedure = t.procedure.use(
  t.middleware(async (opts) => {
    const { ctx, next } = opts;
    if (!ctx.operator) {
      throw new TRPCError2({ code: "UNAUTHORIZED", message: "Sesi\xF3n de guardarrop\xEDa requerida" });
    }
    const role = ctx.operator.role;
    if (role !== "guardarropia" && role !== "supervisor" && role !== "admin") {
      throw new TRPCError2({ code: "FORBIDDEN", message: "Tu usuario no tiene acceso a la pantalla de guardarrop\xEDa" });
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
    z4.object({
      timestamp: z4.number().min(0, "timestamp cannot be negative")
    })
  ).query(() => ({
    ok: true
  })),
  notifyOwner: adminProcedure.input(
    z4.object({
      title: z4.string().min(1, "title is required"),
      content: z4.string().min(1, "content is required")
    })
  ).mutation(async ({ input }) => {
    const delivered = await notifyOwner(input);
    return {
      success: delivered
    };
  })
});

// server/routers.ts
import { z as z6 } from "zod";
import { TRPCError as TRPCError3 } from "@trpc/server";
import { nanoid as nanoid4 } from "nanoid";

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
import { eq as eq10 } from "drizzle-orm";
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
      const [ticket] = await db.select().from(tickets).where(eq10(tickets.displayCode, code)).limit(1);
      if (!ticket) return { result: "rejected", conflictNote: "El c\xF3digo no existe" };
      const [gift] = await db.select().from(partyGifts).where(eq10(partyGifts.ticketId, ticket.id)).limit(1);
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
      }).where(eq10(tickets.id, ticket.id));
      if (gift) {
        await db.update(partyGifts).set({ status: "redeemed", redeemedAt: /* @__PURE__ */ new Date() }).where(eq10(partyGifts.id, gift.id));
      }
      return { result: "applied" };
    }
  );
  return { result, conflictNote };
}

// server/caja/checkin.ts
init_schema();
init_ops();
import { eq as eq11 } from "drizzle-orm";
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
      const [ticket] = await db.select().from(tickets).where(eq11(tickets.ticketCode, code)).limit(1);
      if (!ticket) return { result: "rejected", conflictNote: "El c\xF3digo no existe" };
      if (ticket.eventId !== params.eventId) return { result: "rejected", conflictNote: "El c\xF3digo no corresponde a este evento" };
      if (ticket.status === "cancelled") return { result: "rejected", conflictNote: "El acceso fue anulado" };
      if (ticket.status === "used") {
        return { result: "conflict", conflictNote: `Esta persona ya entr\xF3 el ${ticket.usedAt?.toISOString?.() ?? ticket.usedAt}` };
      }
      const [tt] = await db.select().from(ticketTypes).where(eq11(ticketTypes.id, ticket.ticketTypeId)).limit(1);
      if (tt?.category !== "acceso") {
        return { result: "rejected", conflictNote: "Ese c\xF3digo es de un extra, no de un acceso" };
      }
      await db.update(tickets).set({
        status: "used",
        usedAt: /* @__PURE__ */ new Date(),
        usedByOperatorId: params.operatorId,
        usedAtRegisterId: params.registerId ?? null
      }).where(eq11(tickets.id, ticket.id));
      return { result: "applied" };
    }
  );
  return { result, conflictNote };
}

// server/caja/parkingPaid.ts
init_schema();
init_ops();
import { eq as eq12, and as and8, inArray as inArray6, ne as ne3, sql as sql5 } from "drizzle-orm";
async function resolveParkingCharge(db, params) {
  const [scanned] = await db.select().from(tickets).where(eq12(tickets.ticketCode, params.ticketCode)).limit(1);
  if (!scanned) return { ok: false, conflictNote: "El c\xF3digo no existe" };
  if (scanned.eventId !== params.eventId) return { ok: false, conflictNote: "El c\xF3digo no corresponde a este evento" };
  if (scanned.status === "cancelled") return { ok: false, conflictNote: "El acceso fue anulado" };
  const [buyerOrder] = await db.select().from(orders).where(eq12(orders.id, scanned.orderId)).limit(1);
  if (!buyerOrder) return { ok: false, conflictNote: "No se encontr\xF3 la orden de este ticket" };
  const eventTicketTypes = await db.select().from(ticketTypes).where(eq12(ticketTypes.eventId, params.eventId));
  const parkingTypes = eventTicketTypes.filter((tt) => tt.category === "extra" && isParkingTicketType(tt.name));
  if (parkingTypes.length !== 1) {
    return {
      ok: false,
      conflictNote: parkingTypes.length === 0 ? 'Este evento no tiene un producto "Estacionamiento" configurado en Entradas' : 'Hay m\xE1s de un producto "Estacionamiento" en este evento -- deja solo uno para poder cobrar en la puerta'
    };
  }
  const parkingType = parkingTypes[0];
  const buyerEmail = (buyerOrder.buyerEmail || "").trim().toLowerCase();
  if (buyerEmail && !PLACEHOLDER_BUYER_EMAILS.has(buyerEmail)) {
    const sameBuyerOrders = await db.select({ id: orders.id }).from(orders).where(and8(
      eq12(orders.eventId, params.eventId),
      eq12(orders.buyerEmail, buyerOrder.buyerEmail),
      eq12(orders.paymentStatus, "approved")
    ));
    const orderIds = sameBuyerOrders.map((o) => o.id);
    if (orderIds.length > 0) {
      const existingParking = await db.select({ id: tickets.id }).from(tickets).where(and8(
        inArray6(tickets.orderId, orderIds),
        eq12(tickets.ticketTypeId, parkingType.id),
        ne3(tickets.status, "cancelled")
      ));
      if (existingParking.length > 0) {
        return { ok: false, conflictNote: "Este ticket ya tiene estacionamiento pagado" };
      }
    }
  }
  return { ok: true, buyerOrder, parkingType, price: Number(parkingType.price) };
}
async function createParkingOrderAndTicket(db, params) {
  const [orderResult] = await db.insert(orders).values({
    orderNumber: `PUERTA-${Date.now().toString(36).toUpperCase()}`,
    buyerName: params.buyerOrder.buyerName,
    buyerEmail: params.buyerOrder.buyerEmail,
    buyerPhone: params.buyerOrder.buyerPhone,
    eventId: params.eventId,
    subtotal: String(params.price),
    total: String(params.price),
    paymentStatus: "approved",
    paymentId: params.paymentId,
    paymentMethod: params.paymentMethod,
    channel: "caja",
    operatorId: params.operatorId,
    emailSent: 1
    // venta en la puerta, no corresponde correo
  });
  const newOrderId = orderResult.insertId;
  const [itemResult] = await db.insert(orderItems).values({
    orderId: newOrderId,
    ticketTypeId: params.parkingType.id,
    quantity: 1,
    unitPrice: String(params.price),
    totalPrice: String(params.price),
    unitCost: params.parkingType.costPrice != null ? String(params.parkingType.costPrice) : null
  });
  const orderItemId = itemResult.insertId;
  await db.insert(tickets).values({
    ticketCode: `PK-${params.opId}`,
    orderId: newOrderId,
    orderItemId,
    eventId: params.eventId,
    ticketTypeId: params.parkingType.id,
    holderName: params.buyerOrder.buyerName,
    status: "used",
    usedAt: /* @__PURE__ */ new Date(),
    usedByOperatorId: params.operatorId,
    displayCode: generateDisplayCode(params.parkingType.internalCode || fallbackInternalCode(params.parkingType.name))
  });
  await db.update(ticketTypes).set({ soldCount: sql5`soldCount + 1` }).where(eq12(ticketTypes.id, params.parkingType.id));
}
async function sellParkingAtDoor(db, params) {
  const code = params.ticketCode.trim().toUpperCase();
  const { result, conflictNote } = await applyOp(
    db,
    {
      id: params.opId,
      type: "parking_paid",
      eventId: params.eventId,
      operatorId: params.operatorId,
      targetType: "ticket",
      targetId: code,
      payload: { ticketCode: code, paymentMethod: params.paymentMethod },
      clientAt: params.clientAt
    },
    async () => {
      const charge = await resolveParkingCharge(db, { eventId: params.eventId, ticketCode: code });
      if (!charge.ok) return { result: "rejected", conflictNote: charge.conflictNote };
      await createParkingOrderAndTicket(db, {
        eventId: params.eventId,
        opId: params.opId,
        operatorId: params.operatorId,
        buyerOrder: charge.buyerOrder,
        parkingType: charge.parkingType,
        price: charge.price,
        paymentMethod: params.paymentMethod,
        paymentId: `PUERTA-PARKING-${params.opId}`
      });
      return { result: "applied" };
    }
  );
  return { result, conflictNote };
}

// server/ambassadorApplications.ts
import { and as and9, desc as desc3, eq as eq13 } from "drizzle-orm";
init_schema();
async function createApplication(data) {
  const db = await getDb();
  if (!db) return { ok: false, reason: "sin_base" };
  const email = data.email.trim().toLowerCase();
  const [pendiente] = await db.select({ id: ambassadorApplications.id }).from(ambassadorApplications).where(and9(
    eq13(ambassadorApplications.email, email),
    eq13(ambassadorApplications.status, "pendiente")
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
  return db.select().from(ambassadorApplications).where(status ? eq13(ambassadorApplications.status, status) : void 0).orderBy(desc3(ambassadorApplications.createdAt));
}
async function getApplication(id) {
  const db = await getDb();
  if (!db) return null;
  const [row] = await db.select().from(ambassadorApplications).where(eq13(ambassadorApplications.id, id)).limit(1);
  return row ?? null;
}
async function reviewApplication(params) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(ambassadorApplications).set({
    status: params.status,
    reviewNote: params.note ?? null,
    reviewedAt: /* @__PURE__ */ new Date()
  }).where(eq13(ambassadorApplications.id, params.id));
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
  const [created] = await db.select({ id: exclusiveAmbassadors.id }).from(exclusiveAmbassadors).where(eq13(exclusiveAmbassadors.code, params.code.trim().toUpperCase())).limit(1);
  await db.update(ambassadorApplications).set({
    status: "aprobada",
    reviewedAt: /* @__PURE__ */ new Date(),
    createdAmbassadorId: created?.id ?? null
  }).where(eq13(ambassadorApplications.id, params.id));
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
  const rows = await db.select({ id: ambassadorApplications.id }).from(ambassadorApplications).where(eq13(ambassadorApplications.status, "pendiente"));
  return rows.length;
}

// server/caja/sale.ts
init_schema();
init_ops();
import { eq as eq14, sql as sql6, inArray as inArray7, and as and10 } from "drizzle-orm";
async function createCajaSale(db, params) {
  if (params.items.length === 0) throw new Error("La venta necesita al menos un producto");
  const ticketTypeIds = params.items.map((i) => i.ticketTypeId);
  const tts = await db.select().from(ticketTypes).where(inArray7(ticketTypes.id, ticketTypeIds));
  const ttById = new Map(tts.map((t2) => [t2.id, t2]));
  let total = 0;
  const lineItems = [];
  const stockWarnings = [];
  for (const item of params.items) {
    const tt = ttById.get(item.ticketTypeId);
    if (!tt) throw new Error(`Producto ${item.ticketTypeId} no encontrado`);
    if (isTopupProduct(tt)) throw new Error(`"${tt.name}" es una carga de saldo -- solo se compra desde el sitio web, no en caja`);
    const available = tt.totalStock - tt.soldCount;
    if (item.quantity > available) {
      stockWarnings.push({ ticketTypeId: tt.id, name: tt.name, requested: item.quantity, available });
    }
    const unitPrice = Number(tt.price);
    total += unitPrice * item.quantity;
    lineItems.push({ ticketTypeId: tt.id, quantity: item.quantity, unitPrice, unitCost: tt.costPrice != null ? Number(tt.costPrice) : null, name: tt.name });
  }
  const kitchenItems = params.items.filter((i) => Number(ttById.get(i.ticketTypeId)?.toKitchen ?? 0) === 1).map((i) => ({ name: ttById.get(i.ticketTypeId).name, quantity: i.quantity }));
  if (kitchenItems.length > 0 && !params.kitchenTicketNumber?.trim()) {
    throw new Error("Falta el n\xFAmero de comanda para cocina");
  }
  const hasLocker = params.items.some((i) => ttById.get(i.ticketTypeId)?.category === "locker");
  if (hasLocker) {
    const lockerQty = params.items.filter((i) => ttById.get(i.ticketTypeId)?.category === "locker").reduce((sum, i) => sum + i.quantity, 0);
    if (lockerQty > 1) throw new Error("Cobra los abrigos de a uno para poder asignar un n\xFAmero a cada uno");
    if (!params.lockerTag?.trim()) throw new Error("Falta el n\xFAmero de la percha");
    if (!params.lockerCustomerName?.trim()) throw new Error("Falta el nombre del cliente para guardarrop\xEDa");
  }
  let discountAmount = 0;
  let appliedDiscountId = null;
  if (params.discountCode?.trim()) {
    const validation = await validateDiscountCode(params.discountCode.trim(), params.eventId);
    if (validation.valid && validation.discount) {
      const disc = validation.discount;
      appliedDiscountId = disc.id;
      const scopeIds = disc.applicableTicketTypeIds;
      const eligibleTotal = scopeIds && scopeIds.length > 0 ? lineItems.filter((li) => scopeIds.includes(li.ticketTypeId)).reduce((sum, li) => sum + li.unitPrice * li.quantity, 0) : total;
      discountAmount = disc.discountType === "percentage" ? Math.round(eligibleTotal * Number(disc.discountValue) / 100) : Math.min(Number(disc.discountValue), eligibleTotal);
    }
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
      payload: {
        items: lineItems,
        paymentMethod: params.paymentMethod,
        total,
        buyerEmail: params.buyerEmail ?? null,
        redeemRequested: params.redeemPlaycoins ?? 0,
        ...stockWarnings.length > 0 ? { stockWarnings } : {},
        ...appliedDiscountId ? { discountCode: params.discountCode.trim().toUpperCase(), discountAmount } : {},
        ...params.lockerTag ? { lockerTag: params.lockerTag.trim(), lockerCustomerName: params.lockerCustomerName?.trim() } : {},
        ...kitchenItems.length > 0 ? { kitchenTicketNumber: params.kitchenTicketNumber.trim(), kitchenItems } : {}
      },
      clientAt: params.clientAt
    },
    async () => {
      const totalAfterDiscount = Math.max(0, total - discountAmount);
      if (params.lockerTag?.trim()) {
        const tagNumber = params.lockerTag.trim();
        const existing = await db.select().from(lockerItems).where(and10(eq14(lockerItems.eventId, params.eventId), eq14(lockerItems.tagNumber, tagNumber))).limit(1);
        if (existing.length > 0) throw new Error(`El n\xFAmero ${tagNumber} ya est\xE1 en uso esta noche`);
      }
      if (kitchenItems.length > 0) {
        const ticketNumber = params.kitchenTicketNumber.trim();
        const existing = await db.select().from(kitchenTickets).where(and10(eq14(kitchenTickets.eventId, params.eventId), eq14(kitchenTickets.ticketNumber, ticketNumber))).limit(1);
        if (existing.length > 0) throw new Error(`La comanda ${ticketNumber} ya est\xE1 en uso esta noche`);
      }
      let redeemedAmount = 0;
      let redeemConflictNote;
      if (params.paymentMethod === "saldo") {
        if (!params.buyerEmail || !params.cardPin) {
          throw new Error("Pagar con saldo necesita el email y el PIN de la tarjeta");
        }
        const pinCheck = await verifyCardPin({ email: params.buyerEmail, pin: params.cardPin });
        if (!pinCheck.ok) throw new Error(pinCheck.reason);
        const spend = await spendPrepaidAuthoritative({
          customerId: pinCheck.customerId,
          amountClp: totalAfterDiscount,
          reason: "spend_caja",
          opId: params.opId
        });
        if (!spend.ok) throw new Error(spend.conflictNote);
      } else if (params.redeemPlaycoins && params.redeemPlaycoins > 0 && params.buyerEmail) {
        const redemption = await redeemPlaycoinsAuthoritative({
          email: params.buyerEmail,
          requestedAmount: Math.min(params.redeemPlaycoins, totalAfterDiscount),
          opId: params.opId
        });
        if (redemption.ok) redeemedAmount = redemption.redeemed;
        else redeemConflictNote = redemption.conflictNote;
      }
      if (appliedDiscountId) {
        await db.update(discountCodes).set({ usedCount: sql6`usedCount + 1` }).where(eq14(discountCodes.id, appliedDiscountId));
      }
      const finalTotal = totalAfterDiscount - redeemedAmount;
      const orderNumber = `CAJA-${Date.now().toString(36).toUpperCase()}`;
      const [orderResult] = await db.insert(orders).values({
        orderNumber,
        buyerName: "Venta en caja",
        buyerEmail: params.buyerEmail?.trim().toLowerCase() || "caja@mansionplayroom.cl",
        eventId: params.eventId,
        subtotal: String(total),
        discount: String(discountAmount + redeemedAmount),
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
      if (params.lockerTag?.trim()) {
        await db.insert(lockerItems).values({
          eventId: params.eventId,
          orderId,
          opId: params.opId,
          tagNumber: params.lockerTag.trim(),
          customerName: params.lockerCustomerName?.trim() || null
        });
      }
      if (kitchenItems.length > 0) {
        await db.insert(kitchenTickets).values({
          eventId: params.eventId,
          orderId,
          opId: params.opId,
          registerId: params.registerId ?? null,
          ticketNumber: params.kitchenTicketNumber.trim(),
          items: kitchenItems,
          customerName: params.customerName?.trim() || null
        });
      }
      for (const item of lineItems) {
        await db.insert(orderItems).values({
          orderId,
          ticketTypeId: item.ticketTypeId,
          quantity: item.quantity,
          unitPrice: String(item.unitPrice),
          totalPrice: String(item.unitPrice * item.quantity),
          unitCost: item.unitCost != null ? String(item.unitCost) : null
        });
        await db.update(ticketTypes).set({ soldCount: sql6`soldCount + ${item.quantity}` }).where(eq14(ticketTypes.id, item.ticketTypeId));
      }
      if (params.buyerEmail) {
        await awardPlaycoins({ email: params.buyerEmail, totalClp: finalTotal, reason: "earn_caja", opId: params.opId });
      }
      const stockNote = stockWarnings.length > 0 ? `Vendido sin stock: ${stockWarnings.map((w) => `${w.name} (quedaban ${w.available}, se vendieron ${w.requested})`).join("; ")}` : void 0;
      const notes = [redeemConflictNote, stockNote].filter(Boolean);
      return { result: "applied", conflictNote: notes.length > 0 ? notes.join(" \xB7 ") : void 0 };
    }
  );
  return { result, conflictNote };
}

// server/routers.ts
init_ops();

// server/kitchen.ts
import { and as and11, asc, desc as desc4, eq as eq15, gte as gte2, inArray as inArray8 } from "drizzle-orm";
init_schema();
init_ops();

// shared/kitchen.ts
function canTransitionKitchenTicket(from, to) {
  if (from === "pendiente") return to === "aprobado" || to === "entregado";
  if (from === "aprobado") return to === "entregado";
  if (from === "entregado") return to === "aprobado";
  return false;
}

// server/kitchen.ts
async function listKitchenTickets(eventId) {
  const db = await getDb();
  if (!db) return { active: [], recentlyDelivered: [] };
  const active = await db.select().from(kitchenTickets).where(and11(eq15(kitchenTickets.eventId, eventId), inArray8(kitchenTickets.status, ["pendiente", "aprobado"]))).orderBy(asc(kitchenTickets.createdAt));
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1e3);
  const recentlyDelivered = await db.select().from(kitchenTickets).where(and11(eq15(kitchenTickets.eventId, eventId), eq15(kitchenTickets.status, "entregado"), gte2(kitchenTickets.deliveredAt, oneHourAgo))).orderBy(desc4(kitchenTickets.deliveredAt));
  return { active, recentlyDelivered };
}
async function updateKitchenTicket(rawDb, params) {
  const { result, conflictNote } = await applyOp(
    rawDb,
    {
      id: params.opId,
      type: "kitchen_update",
      eventId: params.eventId,
      operatorId: params.operatorId,
      registerId: params.registerId,
      targetType: "kitchenTicket",
      targetId: params.ticketNumber,
      payload: { ticketNumber: params.ticketNumber, to: params.to },
      clientAt: params.clientAt
    },
    async () => {
      const [ticket] = await rawDb.select().from(kitchenTickets).where(and11(eq15(kitchenTickets.eventId, params.eventId), eq15(kitchenTickets.ticketNumber, params.ticketNumber))).limit(1);
      if (!ticket) return { result: "rejected", conflictNote: "No existe esa comanda" };
      if (!canTransitionKitchenTicket(ticket.status, params.to)) {
        return { result: "conflict", conflictNote: `La comanda ya est\xE1 en estado "${ticket.status}"` };
      }
      const now = /* @__PURE__ */ new Date();
      const patch = { status: params.to };
      if (params.to === "aprobado") {
        patch.approvedAt = now;
        patch.approvedByOperatorId = params.operatorId;
        if (ticket.status === "entregado") {
          patch.deliveredAt = null;
          patch.deliveredByOperatorId = null;
        }
      }
      if (params.to === "entregado") {
        patch.deliveredAt = now;
        patch.deliveredByOperatorId = params.operatorId;
      }
      await rawDb.update(kitchenTickets).set(patch).where(eq15(kitchenTickets.id, ticket.id));
      return { result: "applied" };
    }
  );
  return { result, conflictNote };
}
async function listKitchenProducts(eventId) {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.select({
    id: ticketTypes.id,
    name: ticketTypes.name,
    groupName: ticketTypes.groupName,
    emoji: ticketTypes.emoji,
    totalStock: ticketTypes.totalStock,
    soldCount: ticketTypes.soldCount,
    status: ticketTypes.status
  }).from(ticketTypes).where(and11(eq15(ticketTypes.eventId, eventId), eq15(ticketTypes.toKitchen, 1))).orderBy(asc(ticketTypes.groupName), asc(ticketTypes.sortOrder));
  return rows;
}
async function updateKitchenProductStock(productId, eventId, totalStock, operatorId) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [product] = await db.select({ id: ticketTypes.id, toKitchen: ticketTypes.toKitchen, eventId: ticketTypes.eventId }).from(ticketTypes).where(eq15(ticketTypes.id, productId)).limit(1);
  if (!product || product.eventId !== eventId || product.toKitchen !== 1) {
    throw new Error("Ese producto no pertenece a cocina en este evento");
  }
  return updateTicketType(productId, { totalStock }, void 0, operatorId);
}
async function toggleKitchenProductSoldOut(productId, eventId, soldOut) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [product] = await db.select({ id: ticketTypes.id, toKitchen: ticketTypes.toKitchen, eventId: ticketTypes.eventId, status: ticketTypes.status }).from(ticketTypes).where(eq15(ticketTypes.id, productId)).limit(1);
  if (!product || product.eventId !== eventId || product.toKitchen !== 1) {
    throw new Error("Ese producto no pertenece a cocina en este evento");
  }
  if (product.status === "hidden") throw new Error("Ese producto est\xE1 oculto por el admin");
  await db.update(ticketTypes).set({ status: soldOut ? "soldout" : "active" }).where(eq15(ticketTypes.id, productId));
  return { success: true };
}

// server/locker.ts
import { and as and12, eq as eq16 } from "drizzle-orm";
init_schema();
init_ops();

// shared/locker.ts
function canTransitionLockerItem(from, to) {
  if (from === "pendiente") return to === "guardado";
  if (from === "guardado") return to === "retirado";
  if (from === "retirado") return to === "guardado";
  return false;
}

// server/locker.ts
async function listLockerItems(eventId) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(lockerItems).where(eq16(lockerItems.eventId, eventId));
}
async function updateLockerItem(rawDb, params) {
  const { result, conflictNote } = await applyOp(
    rawDb,
    {
      id: params.opId,
      type: "locker_return",
      eventId: params.eventId,
      operatorId: params.operatorId,
      registerId: params.registerId,
      targetType: "lockerItem",
      targetId: params.tagNumber,
      payload: { tagNumber: params.tagNumber, to: params.to },
      clientAt: params.clientAt
    },
    async () => {
      const [item] = await rawDb.select().from(lockerItems).where(and12(eq16(lockerItems.eventId, params.eventId), eq16(lockerItems.tagNumber, params.tagNumber))).limit(1);
      if (!item) return { result: "rejected", conflictNote: "No existe esa percha" };
      if (!canTransitionLockerItem(item.status, params.to)) {
        return { result: "conflict", conflictNote: `Esa percha ya est\xE1 en estado "${item.status}"` };
      }
      const now = /* @__PURE__ */ new Date();
      const patch = { status: params.to };
      if (params.to === "guardado") {
        patch.receivedAt = now;
        patch.receivedByOperatorId = params.operatorId;
      }
      if (params.to === "retirado") {
        patch.retrievedAt = now;
        patch.retrievedByOperatorId = params.operatorId;
      }
      await rawDb.update(lockerItems).set(patch).where(eq16(lockerItems.id, item.id));
      return { result: "applied" };
    }
  );
  return { result, conflictNote };
}

// server/caja/void.ts
init_schema();
init_ops();
import { eq as eq17 } from "drizzle-orm";
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
      const [ticket] = await db.select().from(tickets).where(eq17(tickets.displayCode, code)).limit(1);
      if (!ticket) return { result: "rejected", conflictNote: "El c\xF3digo no existe" };
      if (ticket.eventId !== params.eventId) return { result: "rejected", conflictNote: "El c\xF3digo no corresponde a este evento" };
      if (ticket.status === "cancelled") return { result: "rejected", conflictNote: "El c\xF3digo ya estaba anulado" };
      await db.update(tickets).set({ status: "cancelled" }).where(eq17(tickets.id, ticket.id));
      return { result: "applied" };
    }
  );
  return { result, conflictNote };
}

// shared/flashPromoPresets.ts
function normalizeFlashPromoPresets(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (p) => p && typeof p === "object" && typeof p.id === "string" && typeof p.label === "string" && typeof p.message === "string" && typeof p.discountPercent === "number" && typeof p.minutes === "number" && Array.isArray(p.ticketTypeIds)
  );
}

// server/caja/shiftReportPdf.ts
import PDFDocument4 from "pdfkit";
function paymentRows(r) {
  const rows = [
    { label: "Efectivo", counted: r.countedCash, expected: r.expectedCash + r.openingCash, diff: r.cashDiff },
    { label: "D\xE9bito", counted: r.countedDebit, expected: r.expectedDebit, diff: r.debitDiff },
    { label: "Cr\xE9dito", counted: r.countedCredit, expected: r.expectedCredit, diff: r.creditDiff }
  ];
  if (r.countedQr || r.expectedQr) {
    rows.push({ label: "QR / Transferencia", counted: r.countedQr, expected: r.expectedQr, diff: r.qrDiff });
  }
  if (r.countedDebit || r.countedCredit || r.expectedDebit || r.expectedCredit) {
    const card2 = cardTotals(r);
    rows.push({ label: "Tarjetas (total)", counted: card2.counted, expected: card2.expected, diff: card2.diff });
  }
  return rows;
}
function buildShiftClosePdf(report) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument4({ size: "A4", margin: 40 });
    const chunks = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    doc.fontSize(18).fillColor(INK).text(`Cierre de turno \u2014 ${report.eventTitle}`);
    doc.fontSize(11).fillColor(MUTED).text(
      `${report.registerName} \xB7 ${report.operatorName} \xB7 ${formatChileDateTime(report.closedAt)}`
    );
    doc.moveDown(0.3);
    doc.fontSize(10).fillColor(MUTED).text(
      `Turno abierto ${formatChileDateTime(report.openedAt)} \xB7 ${report.salesCount} ventas \xB7 ${report.redeemsCount} canjes`
    );
    doc.moveDown(1.2);
    const rows = paymentRows(report);
    doc.fontSize(13).fillColor(INK).text("Cuadre de caja");
    doc.moveDown(0.5);
    const chartBottom = drawBarChart(
      doc,
      [{ name: "Contado", color: INK }, { name: "Esperado", color: "#dddddd" }],
      rows.map((r) => ({ label: r.label, values: [r.counted, r.expected] })),
      doc.x,
      doc.y + 14,
      doc.page.width - doc.page.margins.left - doc.page.margins.right,
      100
    );
    doc.y = chartBottom + 16;
    const paymentTableRows = rows.map((row) => {
      const cuadra = Math.abs(row.diff) < 1;
      const diffText = cuadra ? "\u2713 Cuadra" : row.diff > 0 ? `\u25B2 Sobran ${money(row.diff)}` : `\u25BC Faltan ${money(Math.abs(row.diff))}`;
      return [row.label, money(row.counted), money(row.expected), { text: diffText, color: cuadra ? GREEN : RED }];
    });
    const afterPaymentTableY = drawTable(
      doc,
      [{ label: "Medio de pago", width: 160 }, { label: "Contado", width: 110 }, { label: "Esperado", width: 110 }, { label: "Diferencia", width: 110 }],
      paymentTableRows,
      doc.y
    );
    doc.y = afterPaymentTableY + 8;
    if (cardSplitLooksUnreliable(report)) {
      doc.fontSize(9).fillColor(RED).text(
        'Ojo: el sistema no registr\xF3 ninguna venta de un tipo de tarjeta que s\xED aparece en el voucher. El selector de la tablet qued\xF3 fijo, as\xED que las l\xEDneas de d\xE9bito y cr\xE9dito por separado no sirven para cuadrar: mira la l\xEDnea "Tarjetas (total)".'
      );
      doc.moveDown(0.3);
    }
    const paidOut = report.cashPaidOut ?? 0;
    doc.fontSize(9).fillColor(MUTED).text(
      `Esperado en efectivo = ${money(report.openingCash)} de fondo inicial + ${money(report.expectedCash + paidOut)} de ventas en efectivo` + (paidOut > 0 ? ` \u2212 ${money(paidOut)} de gastos pagados del caj\xF3n` : "") + ` = ${money(report.expectedCash + report.openingCash)}`
    );
    doc.y = doc.y + 20;
    doc.fontSize(13).fillColor(INK).text("Ventas del turno por producto");
    doc.moveDown(0.5);
    if (report.shiftProducts.length === 0) {
      doc.fontSize(10).fillColor(MUTED).text("Sin ventas registradas en este turno.");
    } else {
      drawTable(
        doc,
        [{ label: "Producto", width: 280 }, { label: "Unidades", width: 100 }, { label: "Ingresos", width: 110 }],
        report.shiftProducts.map((p) => [p.name, String(p.quantity), money(p.revenue)]),
        doc.y
      );
    }
    doc.end();
  });
}

// server/caja/kitchenVendorPdf.ts
import PDFDocument5 from "pdfkit";
function buildKitchenVendorPdf(report) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument5({ size: "A4", margin: 40 });
    const chunks = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    doc.fontSize(18).fillColor(INK).text(`Rendici\xF3n de cocina \u2014 ${report.eventTitle}`);
    doc.fontSize(11).fillColor(MUTED).text(`Proveedor: ${report.vendorName}`);
    doc.moveDown(1.2);
    doc.fontSize(13).fillColor(INK).text("Total del evento");
    doc.moveDown(0.5);
    const chartBottom = drawBarChart(
      doc,
      [{ name: report.vendorName, color: "#6366f1" }, { name: BRAND_NAME, color: INK }],
      [{ label: "Reparto", values: [report.vendorShare, report.venueShare] }],
      doc.x,
      doc.y + 14,
      200,
      100
    );
    doc.x = doc.page.margins.left;
    doc.y = chartBottom + 16;
    doc.fontSize(11).fillColor(INK).text(`Ingresos totales: ${money(report.totalRevenue)}`);
    doc.fontSize(11).fillColor("#6366f1").text(`Le corresponde a ${report.vendorName}: ${money(report.vendorShare)}`);
    doc.fontSize(11).fillColor(INK).text(`Le corresponde a ${BRAND_NAME}: ${money(report.venueShare)}`);
    doc.moveDown(1.2);
    doc.fontSize(13).fillColor(INK).text("Detalle por producto");
    doc.moveDown(0.5);
    if (report.products.length === 0) {
      doc.fontSize(10).fillColor(MUTED).text("Sin ventas de productos de cocina en este evento.");
    } else {
      drawTable(
        doc,
        [
          { label: "Producto", width: 180 },
          { label: "Unidades", width: 80 },
          { label: "Ingresos", width: 90 },
          { label: "Proveedor", width: 90 },
          { label: "Productora", width: 90 }
        ],
        report.products.map((p) => [p.name, String(p.quantity), money(p.revenue), money(p.vendorShare), money(p.venueShare)]),
        doc.y
      );
    }
    doc.end();
  });
}

// server/eventDescriptions.ts
import { z as z5 } from "zod";
var EventDescriptionSchema = z5.object({
  shortDescription: z5.string().min(4).max(160),
  description: z5.string().min(10).max(1200)
});
var EVENT_DESCRIPTION_JSON_SCHEMA = {
  name: "event_description",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["shortDescription", "description"],
    properties: {
      shortDescription: { type: "string", description: "Una frase corta y llamativa (menos de 160 caracteres), para tarjetas/preview del evento." },
      description: { type: "string", description: "Descripci\xF3n completa para la p\xE1gina de venta: varios p\xE1rrafos, cuenta qu\xE9 se va a vivir esa noche, sin exagerar ni prometer lo que no se sabe (aforo, artistas, etc. si no se dieron como dato)." }
    }
  }
};
var SYSTEM_PROMPT2 = `Eres quien escribe las descripciones de los eventos de Mansion Playroom / Candyland, una productora de fiestas en Valpara\xEDso/Vi\xF1a del Mar, Chile.
Tono: cercano, conversacional, en espa\xF1ol chileno, sin ser vulgar ni gritar en may\xFAsculas. Nada de lenguaje corporativo gen\xE9rico ni de agencia de turismo.
Escribes DOS textos que cuentan la misma historia, no dos historias distintas: una versi\xF3n corta (una frase, para una tarjeta) y una versi\xF3n completa (varios p\xE1rrafos, para la p\xE1gina de venta del evento).
No inventes datos concretos que no te dieron (line-up, aforo exacto, sorpresas espec\xEDficas) -- si no te los dan, habla en t\xE9rminos generales de la experiencia (ambiente, pistas, luces, la gente que va).
Responde \xDANICAMENTE con el JSON pedido, sin explicaciones adicionales.`;
async function generateEventDescription(input) {
  const datos = [
    `T\xEDtulo: ${input.title}`,
    input.venue ? `Venue: ${input.venue}` : null,
    input.address ? `Direcci\xF3n: ${input.address}` : null,
    input.eventDateISO ? `Fecha: ${new Date(input.eventDateISO).toLocaleDateString("es-CL", { timeZone: "America/Santiago", weekday: "long", day: "numeric", month: "long" })}` : null,
    input.idea?.trim() ? `Idea/tema que quiero para este evento: ${input.idea.trim()}` : null
  ].filter(Boolean).join("\n");
  const result = await invokeLLM({
    messages: [
      { role: "system", content: SYSTEM_PROMPT2 },
      { role: "user", content: datos }
    ],
    responseFormat: { type: "json_schema", json_schema: EVENT_DESCRIPTION_JSON_SCHEMA }
  });
  const raw = extractContent(result.choices[0]?.message ?? { content: "" });
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("La IA no devolvi\xF3 un JSON v\xE1lido. Intenta de nuevo.");
  }
  const validated = EventDescriptionSchema.safeParse(parsed);
  if (!validated.success) {
    throw new Error(`La descripci\xF3n generada no tiene el formato esperado: ${validated.error.issues[0]?.message ?? "error desconocido"}.`);
  }
  return validated.data;
}

// server/adminQa.ts
var clp = (n) => `$${Math.round(n).toLocaleString("es-CL")}`;
function buildDataBlock(stats, utmSales, pnl) {
  const parts = [];
  parts.push([
    "Estad\xEDsticas generales de \xF3rdenes (todos los canales, web + caja):",
    `- Total de \xF3rdenes: ${Number(stats.totalOrders)}`,
    `- \xD3rdenes aprobadas (pagadas): ${Number(stats.approvedOrders)}`,
    `- Ingreso total de \xF3rdenes aprobadas: ${clp(Number(stats.totalRevenue))}`
  ].join("\n"));
  if (utmSales.length > 0) {
    const top = utmSales.slice(0, 10);
    parts.push([
      "Ventas web aprobadas por origen (UTM), de mayor a menor ingreso:",
      ...top.map((r) => `- ${r.utmSource}${r.utmMedium ? ` / ${r.utmMedium}` : ""}${r.utmCampaign ? ` / ${r.utmCampaign}` : ""}: ${r.ordersCount} \xF3rdenes, ${clp(r.revenue)}`)
    ].join("\n"));
  } else {
    parts.push("Ventas por origen (UTM): todav\xEDa no hay datos.");
  }
  if (pnl) {
    const totalExpenses = pnl.cogs + pnl.directExpensesTotal + pnl.generalExpensesAssigned + pnl.ambassadorCommissions;
    parts.push([
      `P&L del evento "${pnl.title}" (mes ${pnl.monthKey}):`,
      `- Ingreso bruto: ${clp(pnl.grossIncome)}`,
      `- Costo de mercader\xEDa vendida: ${clp(pnl.cogs)} (dato cargado para ${pnl.cogsCoverage}% de las unidades vendidas)`,
      `- Comisiones de embajadores: ${clp(pnl.ambassadorCommissions)}`,
      `- Gastos directos del evento: ${clp(pnl.directExpensesTotal)}`,
      `- Gastos generales prorrateados: ${clp(pnl.generalExpensesAssigned)}`,
      `- Gasto total: ${clp(totalExpenses)}`,
      `- Utilidad neta: ${clp(pnl.netProfit)}`
    ].join("\n"));
  } else {
    parts.push("P&L de evento: no hay ning\xFAn evento para calcularlo.");
  }
  return parts.join("\n\n");
}
var SYSTEM_PROMPT3 = `Eres un asistente interno del panel de administraci\xF3n de Mansion Playroom, una productora de fiestas en Valpara\xEDso/Vi\xF1a del Mar, Chile.
Respondes preguntas simples sobre ventas, movimientos y plata a partir de datos YA CALCULADOS que se te dan en el mensaje del usuario -- nunca inventes ni estimes un n\xFAmero que no est\xE9 ah\xED.
Si la pregunta no se puede responder con los datos entregados (pide un dato que no est\xE1, un desglose m\xE1s fino, una comparaci\xF3n con datos que no se dieron, etc.), dilo expl\xEDcitamente en vez de adivinar -- ej. "Con los datos que tengo no puedo responder eso, pero s\xED puedo decirte...".
Responde en espa\xF1ol chileno, breve (unas pocas frases, no un informe largo), directo y sin rodeos. Sin JSON, sin markdown pesado: texto plano, como si le contestaras por WhatsApp al due\xF1o.`;
async function answerSalesQuestion(question, eventId) {
  const [stats, utmSales] = await Promise.all([
    getOrderStats(),
    getSalesByUtmOrigin()
  ]);
  const resolvedEventId = eventId ?? (await getFeaturedEvent())?.id;
  const pnl = resolvedEventId ? await getEventPnl(resolvedEventId) : null;
  const datos = buildDataBlock(stats, utmSales, pnl);
  const result = await invokeLLM({
    messages: [
      { role: "system", content: SYSTEM_PROMPT3 },
      { role: "user", content: `${datos}

Pregunta: ${question}` }
    ]
  });
  const answer = extractContent(result.choices[0]?.message ?? { content: "" }).trim();
  if (!answer) throw new Error("La IA no devolvi\xF3 ninguna respuesta. Intenta de nuevo.");
  return answer;
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

// server/webauthn.ts
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse
} from "@simplewebauthn/server";
var WEBAUTHN_RP_NAME = "Mansion Playroom Admin";
function getRpIdAndOrigin(req) {
  const origin = req.headers.origin || `https://${req.headers.host}`;
  let rpID;
  try {
    rpID = new URL(origin).hostname;
  } catch {
    rpID = "mansionplayroom.cl";
  }
  return { rpID, origin };
}
async function buildRegistrationOptions(params) {
  return generateRegistrationOptions({
    rpName: WEBAUTHN_RP_NAME,
    rpID: params.rpID,
    userName: "admin",
    userDisplayName: "Admin",
    attestationType: "none",
    // Evita que el mismo dispositivo quede registrado dos veces.
    excludeCredentials: params.existingCredentialIds.map((id) => ({ id })),
    authenticatorSelection: {
      residentKey: "required",
      userVerification: "required",
      authenticatorAttachment: "platform"
    }
  });
}
async function verifyRegistration(params) {
  return verifyRegistrationResponse({
    response: params.response,
    expectedChallenge: params.expectedChallenge,
    expectedOrigin: params.expectedOrigin,
    expectedRPID: params.expectedRPID
  });
}
async function buildAuthenticationOptions(params) {
  return generateAuthenticationOptions({
    rpID: params.rpID,
    userVerification: "required"
  });
}
async function verifyAuthentication(params) {
  return verifyAuthenticationResponse({
    response: params.response,
    expectedChallenge: params.expectedChallenge,
    expectedOrigin: params.expectedOrigin,
    expectedRPID: params.expectedRPID,
    // El tipo exacto de buffer (ArrayBuffer vs ArrayBufferLike) no coincide
    // entre lib.dom y Node de punta, pero en runtime siempre es un
    // Uint8Array real -- la librería no distingue el subtipo del buffer.
    credential: params.credential
  });
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
var SHIFT_CLOSE_REPORT_EMAIL = ADMIN_NOTIFICATION_EMAIL;
var APPLICATIONS_EMAIL = ADMIN_NOTIFICATION_EMAIL;
var APPLICATION_MAX_PER_HOUR = 5;
var SAMPLE_ORDER_EMAIL_DATA = {
  buyerName: "Camila",
  eventTitle: "2\xBA Aniversario Mansion Playroom",
  eventDate: "Viernes 30 de octubre, 2026",
  doorsOpenText: "23:00",
  venue: "La Mansi\xF3n",
  address: "Valpara\xEDso",
  mapsUrl: "https://maps.google.com",
  orderNumber: "MP-TEST123",
  items: [
    { name: "Acceso D\xFAo", quantity: 1, price: 2e4 },
    { name: "Estacionamiento", quantity: 1, price: 3e3 }
  ],
  total: 15100,
  discount: 9e3,
  serviceFee: 2100,
  ambassadorCode: "CAMI2026",
  isMissionDeposit: false,
  ticketReady: true,
  ticketCode: "TICKET-ABC123",
  attendeeNames: ["Camila Fuentes", "Jorge Alarc\xF3n"],
  extras: [{ name: "Estacionamiento", quantity: 1, codes: ["PK-ABC1"] }]
};
var SAMPLE_MISSION_TOPUP_DATA = {
  buyerName: "Camila",
  eventTitle: "2\xBA Aniversario Mansion Playroom",
  eventDate: "Viernes 30 de octubre, 2026",
  orderNumber: "MP-TEST123",
  topupAmount: 8e3,
  paymentUrl: "https://mansionplayroom.cl"
};
var SAMPLE_PENDING_REMINDER_DATA = {
  buyerName: "Camila",
  eventTitle: "2\xBA Aniversario Mansion Playroom",
  eventDate: /* @__PURE__ */ new Date(),
  total: 2e4,
  checkoutUrl: "https://mansionplayroom.cl"
};
var SAMPLE_GIFT_DATA = {
  toAlias: "Duende Rosa",
  fromAlias: "Zorro Plateado",
  drinkName: "Piscola",
  displayCode: "ABCD",
  message: "\xA1Disfr\xFAtalo!",
  eventTitle: "2\xBA Aniversario Mansion Playroom"
};
async function resolveOrderPreviewEventFields() {
  const event = await getFeaturedEvent();
  if (!event) return {};
  return {
    eventTitle: event.title,
    eventDate: formatChileDate(new Date(event.eventDate)),
    doorsOpenText: formatChileTime(new Date(event.doorsOpen ?? event.eventDate)),
    venue: event.venue || SAMPLE_ORDER_EMAIL_DATA.venue,
    address: event.address || SAMPLE_ORDER_EMAIL_DATA.address,
    mapsUrl: event.mapsUrl || SAMPLE_ORDER_EMAIL_DATA.mapsUrl
  };
}
async function resolveMissionTopupPreviewEventFields() {
  const event = await getFeaturedEvent();
  if (!event) return {};
  return {
    eventTitle: event.title,
    eventDate: formatChileDate(new Date(event.eventDate))
  };
}
var adminProcedure2 = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== "admin") throw new TRPCError3({ code: "FORBIDDEN", message: "Admin access required" });
  return next({ ctx });
});
var adminPasswordInput = z6.object({
  adminPassword: z6.string().min(1, "Ingresa tu clave de admin")
});
var adminPasswordProcedure = adminProcedure2.input(adminPasswordInput).use(async (opts) => {
  const ipKey = `admin-reauth:${clientIp(opts.ctx)}`;
  if (!await checkIpRateLimit(ipKey)) {
    throw new TRPCError3({ code: "TOO_MANY_REQUESTS", message: "Demasiados intentos. Espera unos minutos." });
  }
  const parsed = adminPasswordInput.safeParse(await opts.getRawInput());
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword || !parsed.success || !safeCompare(parsed.data.adminPassword, adminPassword)) {
    await recordIpFailedAttempt(ipKey);
    throw new TRPCError3({ code: "UNAUTHORIZED", message: "Clave de admin incorrecta" });
  }
  return opts.next({ ctx: opts.ctx });
});
var mailingEventSectionsSchema = z6.object({
  banner: z6.boolean(),
  details: z6.boolean(),
  mission300: z6.boolean(),
  venueGrid: z6.boolean()
});
var expenseInputSchema = z6.object({
  scope: z6.enum(["evento", "general"]),
  eventId: z6.number().nullable().optional(),
  expenseDate: z6.string(),
  category: z6.enum([
    "decoracion",
    "barra",
    "merch",
    "staff",
    "produccion",
    "arriendo",
    "marketing",
    "transporte",
    "suscripciones",
    "comisiones",
    "otros"
  ]),
  description: z6.string().min(1).max(255),
  supplier: z6.string().max(160).optional(),
  supplierRut: z6.string().max(16).optional(),
  documentType: z6.enum(["boleta", "factura", "boleta_honorarios", "sin_documento"]),
  documentNumber: z6.string().max(32).optional(),
  ivaExempt: z6.boolean().optional(),
  amountTotal: z6.number().int().positive(),
  ivaAmountOverride: z6.number().int().nonnegative().optional(),
  paymentMethod: z6.enum(["efectivo", "tarjeta", "transferencia", "otro"]),
  paidFromShiftId: z6.number().nullable().optional(),
  recurrence: z6.enum(["none", "mensual", "por_evento"]).optional(),
  recurrenceEndsAt: z6.string().nullable().optional(),
  excludeFromPnl: z6.boolean().optional(),
  prorate: z6.boolean().optional(),
  receiptUrl: z6.string().optional(),
  notes: z6.string().max(500).optional()
  // Una plantilla 'por_evento' es el catálogo de un costo fijo de cada fiesta,
  // no un gasto de una fiesta puntual: va con scope 'evento' pero SIN eventId,
  // porque se copia a todas. Por eso queda exenta de la regla de abajo.
}).refine((v) => v.recurrence === "por_evento" || v.scope !== "evento" || !!v.eventId, {
  message: "Un gasto de evento necesita que elijas a qu\xE9 evento va",
  path: ["eventId"]
  // Una suscripción se paga todos los meses; un evento pasa una vez. Cargar
  // una suscripción a un evento hacía que `materializeRecurringExpenses` le
  // creara una copia a ESA fiesta cada mes para siempre, así que su resultado
  // seguía empeorando meses después de que terminó. Un costo que se repite
  // todos los meses es de la productora; el que se repite en cada fiesta va con
  // 'por_evento', que sí se carga completo a cada una.
}).refine((v) => v.recurrence !== "mensual" || v.scope === "general", {
  message: 'Un gasto que se repite todos los meses va a la productora. Si es un costo fijo de cada fiesta (el DJ, la seguridad), usa "se repite en cada evento".',
  path: ["recurrence"]
}).refine((v) => v.recurrence !== "por_evento" || v.scope === "evento", {
  message: "Un costo fijo de cada fiesta se imputa a los eventos, no a la productora.",
  path: ["recurrence"]
}).refine((v) => v.recurrence !== "por_evento" || !v.eventId, {
  message: "Un costo fijo de cada fiesta no se carga a una fiesta puntual: se copia a todas autom\xE1ticamente.",
  path: ["eventId"]
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
async function verifyKitchenPinOrThrow(ctx, operatorId, pin) {
  const operator = await verifyOperatorPinOrThrow(ctx, operatorId, pin);
  if (operator.role !== "cocina" && operator.role !== "supervisor" && operator.role !== "admin") {
    throw new TRPCError3({ code: "FORBIDDEN", message: "Tu usuario no trabaja en cocina" });
  }
  return operator;
}
async function verifyGuardarropiaPinOrThrow(ctx, operatorId, pin) {
  const operator = await verifyOperatorPinOrThrow(ctx, operatorId, pin);
  if (operator.role !== "guardarropia" && operator.role !== "supervisor" && operator.role !== "admin") {
    throw new TRPCError3({ code: "FORBIDDEN", message: "Tu usuario no trabaja en guardarrop\xEDa" });
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
async function signWebauthnTicket(kind, challenge) {
  return sdk.signSession({ openId: `webauthn:${kind}`, appId: "candyland-admin-webauthn", name: challenge }, { expiresInMs: 2 * 60 * 1e3 });
}
async function requireWebauthnTicket(kind, ticket) {
  const payload = await sdk.verifySession(ticket).catch(() => null);
  if (payload?.openId !== `webauthn:${kind}`) {
    throw new TRPCError3({ code: "UNAUTHORIZED", message: "El c\xF3digo expir\xF3, intenta de nuevo." });
  }
  return payload.name;
}
var ADMIN_SESSION_MS = 7 * 24 * 60 * 60 * 1e3;
var VIEWER_SESSION_MS = 8 * 60 * 60 * 1e3;
async function issueViewerSession(ctx) {
  const sessionToken = await sdk.signSession(
    { openId: VIEWER_LOCAL_OPEN_ID, appId: "candyland-admin", name: "Invitado (demo)" },
    { expiresInMs: VIEWER_SESSION_MS }
  );
  const cookieOptions = getSessionCookieOptions(ctx.req);
  ctx.res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: VIEWER_SESSION_MS });
}
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
    adminLogin: publicProcedure.input(z6.object({ password: z6.string() })).mutation(async ({ input, ctx }) => {
      const ipKey = adminIpKey(ctx);
      if (!await checkIpRateLimit(ipKey)) {
        throw new TRPCError3({ code: "TOO_MANY_REQUESTS", message: "Demasiados intentos. Espera unos minutos." });
      }
      const adminPassword = process.env.ADMIN_PASSWORD;
      if (!adminPassword || !safeCompare(input.password, adminPassword)) {
        const viewerPassword = process.env.ADMIN_VIEWER_PASSWORD;
        if (viewerPassword && safeCompare(input.password, viewerPassword)) {
          await resetIpRateLimit(ipKey);
          await issueViewerSession(ctx);
          return { ticket: "", needsSetup: false, skipped2fa: true, viewer: true };
        }
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
    adminSetupTotp: publicProcedure.input(z6.object({ ticket: z6.string() })).mutation(async ({ input }) => {
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
    adminConfirmTotp: publicProcedure.input(z6.object({ ticket: z6.string(), code: z6.string() })).mutation(async ({ input, ctx }) => {
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
    adminVerifyCode: publicProcedure.input(z6.object({ ticket: z6.string(), code: z6.string() })).mutation(async ({ input, ctx }) => {
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
    }),
    // --- Passkeys (Face ID / Touch ID / Windows Hello) ---
    // Adicionales al login de arriba, no lo reemplazan. Registro: requiere
    // estar logueado (adminProcedure) -- solo el dueño, ya autenticado con
    // contraseña+TOTP, puede sumar un dispositivo nuevo.
    webauthnRegistrationOptions: adminProcedure2.mutation(async ({ ctx }) => {
      const { rpID } = getRpIdAndOrigin(ctx.req);
      const existing = await getAdminWebauthnCredentials();
      const options = await buildRegistrationOptions({
        rpID,
        existingCredentialIds: existing.map((c) => c.credentialId)
      });
      const ticket = await signWebauthnTicket("reg", options.challenge);
      return { options, ticket };
    }),
    webauthnRegistrationVerify: adminProcedure2.input(z6.object({
      ticket: z6.string(),
      deviceLabel: z6.string().min(1).max(100),
      response: z6.any()
    })).mutation(async ({ input, ctx }) => {
      const challenge = await requireWebauthnTicket("reg", input.ticket);
      const { rpID, origin } = getRpIdAndOrigin(ctx.req);
      const verification = await verifyRegistration({
        response: input.response,
        expectedChallenge: challenge,
        expectedOrigin: origin,
        expectedRPID: rpID
      });
      if (!verification.verified || !verification.registrationInfo) {
        throw new TRPCError3({ code: "BAD_REQUEST", message: "No se pudo verificar el dispositivo." });
      }
      const { credential } = verification.registrationInfo;
      await saveAdminWebauthnCredential({
        credentialId: credential.id,
        publicKey: Buffer.from(credential.publicKey).toString("base64url"),
        counter: credential.counter,
        transports: credential.transports,
        deviceLabel: input.deviceLabel
      });
      return { success: true };
    }),
    // Login: sin sesión previa (publicProcedure) -- es justamente la forma
    // de entrar. No hace falta listar credenciales de antemano: son
    // "discoverable credentials", el propio sistema operativo le muestra al
    // dueño cuál usar.
    webauthnLoginOptions: publicProcedure.mutation(async ({ ctx }) => {
      const { rpID } = getRpIdAndOrigin(ctx.req);
      const options = await buildAuthenticationOptions({ rpID });
      const ticket = await signWebauthnTicket("auth", options.challenge);
      return { options, ticket };
    }),
    webauthnLoginVerify: publicProcedure.input(z6.object({
      ticket: z6.string(),
      response: z6.any()
    })).mutation(async ({ input, ctx }) => {
      const ipKey = adminIpKey(ctx);
      if (!await checkIpRateLimit(ipKey)) {
        throw new TRPCError3({ code: "TOO_MANY_REQUESTS", message: "Demasiados intentos. Espera unos minutos." });
      }
      const challenge = await requireWebauthnTicket("auth", input.ticket);
      const credentialRow = await getAdminWebauthnCredentialById(input.response?.id);
      if (!credentialRow) {
        await recordIpFailedAttempt(ipKey);
        throw new TRPCError3({ code: "UNAUTHORIZED", message: "Dispositivo no reconocido." });
      }
      const { rpID, origin } = getRpIdAndOrigin(ctx.req);
      const verification = await verifyAuthentication({
        response: input.response,
        expectedChallenge: challenge,
        expectedOrigin: origin,
        expectedRPID: rpID,
        credential: {
          id: credentialRow.credentialId,
          publicKey: new Uint8Array(Buffer.from(credentialRow.publicKey, "base64url")),
          counter: credentialRow.counter,
          transports: credentialRow.transports ?? void 0
        }
      });
      if (!verification.verified) {
        await recordIpFailedAttempt(ipKey);
        throw new TRPCError3({ code: "UNAUTHORIZED", message: "No se pudo verificar tu identidad." });
      }
      await touchAdminWebauthnCredential(credentialRow.id, verification.authenticationInfo.newCounter);
      await resetIpRateLimit(ipKey);
      await issueAdminSession(ctx);
      return { success: true };
    }),
    webauthnCredentialsList: adminProcedure2.query(async () => {
      const rows = await getAdminWebauthnCredentials();
      return rows.map((r) => ({ id: r.id, deviceLabel: r.deviceLabel, createdAt: r.createdAt, lastUsedAt: r.lastUsedAt }));
    }),
    webauthnCredentialDelete: adminProcedure2.input(z6.object({ id: z6.number() })).mutation(async ({ input }) => {
      await deleteAdminWebauthnCredential(input.id);
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
    getBySlug: publicProcedure.input(z6.object({ slug: z6.string() })).query(async ({ input }) => {
      return getEventBySlug(input.slug);
    }),
    getTicketTypes: publicProcedure.input(z6.object({ slug: z6.string() })).query(async ({ input }) => {
      const event = await getEventBySlug(input.slug);
      if (!event) return [];
      await checkAndAdvanceTandaIfNeeded(event.id);
      return getTicketTypesByEventId(event.id);
    }),
    // Admin
    listAll: adminReadProcedure.query(async () => {
      return getAllEvents();
    }),
    // El mismo criterio que usa /caja, /cocina y /guardarropia para elegir
    // "el evento de esta noche" (el publicado más cercano a hoy en fecha) --
    // sirve para que el admin (ej. el selector de la sección Caja) arranque
    // apuntando al evento correcto sin que el usuario tenga que elegirlo a
    // mano. `listAll` en cambio ordena por creación, así que un evento viejo
    // o de prueba creado después podía terminar como "seleccionado" por
    // defecto aunque no fuera el que /caja estaba usando de verdad.
    getActiveForCaja: adminReadProcedure.query(async () => {
      return getActiveEventForCaja() ?? null;
    }),
    create: adminProcedure2.input(z6.object({
      title: z6.string(),
      slug: z6.string(),
      description: z6.string().optional(),
      shortDescription: z6.string().optional(),
      imageUrl: z6.string().optional(),
      venue: z6.string().optional(),
      address: z6.string().optional(),
      mapsUrl: z6.string().optional(),
      eventDate: z6.string(),
      doorsOpen: z6.string().optional(),
      eventEnd: z6.string().optional(),
      status: z6.enum(["draft", "published", "soldout", "cancelled", "past"]).optional(),
      featured: z6.number().optional(),
      missionForceClosed: z6.number().optional(),
      ivaApplies: z6.number().optional()
    })).mutation(async ({ input }) => {
      const result = await createEvent(input);
      try {
        const created = await getEventBySlug(input.slug);
        const previous = (await getAllEvents()).find((e) => e.id !== created?.id && new Date(e.eventDate) < new Date(input.eventDate));
        if (created && previous) await copyCartaBetweenEvents(previous.id, created.id);
      } catch (err) {
        console.error("[events.create] No se pudo copiar la carta del evento anterior:", err);
      }
      return result;
    }),
    // Botón manual "Copiar carta del evento anterior" en Carta de la
    // Fiesta -- mismo criterio que el automático de arriba, para poder
    // repetirlo a mano (o arreglar un evento que quedó sin carta).
    copyCartaFromPrevious: adminProcedure2.input(z6.object({ eventId: z6.number() })).mutation(async ({ input }) => {
      const target = await getEventById(input.eventId);
      if (!target) throw new TRPCError3({ code: "BAD_REQUEST", message: "Evento no encontrado" });
      const previous = (await getAllEvents()).find((e) => e.id !== target.id && new Date(e.eventDate) < new Date(target.eventDate));
      if (!previous) throw new TRPCError3({ code: "BAD_REQUEST", message: "No hay un evento anterior del cual copiar" });
      const copied = await copyCartaBetweenEvents(previous.id, target.id);
      return { copied, from: previous.title };
    }),
    update: adminProcedure2.input(z6.object({
      id: z6.number(),
      title: z6.string().optional(),
      slug: z6.string().optional(),
      description: z6.string().optional(),
      shortDescription: z6.string().optional(),
      imageUrl: z6.string().optional(),
      venue: z6.string().optional(),
      address: z6.string().optional(),
      mapsUrl: z6.string().optional(),
      eventDate: z6.string().optional(),
      doorsOpen: z6.string().optional(),
      eventEnd: z6.string().optional(),
      status: z6.enum(["draft", "published", "soldout", "cancelled", "past"]).optional(),
      featured: z6.number().optional(),
      missionForceClosed: z6.number().optional(),
      ivaApplies: z6.number().optional(),
      // Escala de descuentos por fase de este evento -- ver
      // shared/tandaSchedule.ts (TandaPhase[]: % + fecha límite opcional
      // por fase, para el avance automático). Editable desde el admin, por
      // evento.
      tandaDiscountSchedule: z6.array(z6.object({
        percent: z6.number().min(0).max(100),
        untilDate: z6.string().nullable().optional()
      })).optional()
    })).mutation(async ({ input }) => {
      const { id, ...data } = input;
      return updateEvent(id, data);
    }),
    delete: adminPasswordProcedure.input(z6.object({ id: z6.number() })).mutation(async ({ input, ctx }) => {
      const before = await getEventById(input.id);
      const result = await deleteEvent(input.id);
      await recordAdminAudit({ action: "events.delete", targetType: "event", targetId: input.id, eventId: input.id, payload: before ?? null, ip: clientIp(ctx) });
      return result;
    }),
    // Ticket types management
    listTicketTypes: adminReadProcedure.input(z6.object({ eventId: z6.number() })).query(async ({ input }) => {
      return getTicketTypesByEventId(input.eventId);
    }),
    createTicketType: adminProcedure2.input(z6.object({
      eventId: z6.number(),
      name: z6.string(),
      accesoSlug: z6.enum(["duo", "duo_mujeres", "soltera", "soltero", "trio", "grupo", "cumpleaneros"]).optional(),
      category: z6.enum(["acceso", "extra", "consumo", "locker", "merch"]).optional(),
      description: z6.string().optional(),
      price: z6.number(),
      originalPrice: z6.number().optional(),
      totalStock: z6.number(),
      maxPerOrder: z6.number().optional(),
      sortOrder: z6.number().optional(),
      status: z6.enum(["active", "soldout", "hidden"]).optional(),
      costPrice: z6.number().optional(),
      color: z6.string().optional(),
      internalCode: z6.string().optional(),
      // Carta de la fiesta (tragos/comida/guardarropía): emoji en vez de foto,
      // sección para agrupar en la grilla de /caja, y si va a cocina.
      emoji: z6.string().max(8).optional(),
      groupName: z6.string().max(50).optional(),
      toKitchen: z6.number().min(0).max(1).optional(),
      // Cupo compartido (stockPools) -- null/omitido = sigue usando su propio
      // totalStock, como hoy.
      stockPoolId: z6.number().nullable().optional(),
      // Carga de saldo prepagado (pedido explícito del dueño): con valor,
      // este producto acredita saldo en vez de dar un derecho canjeable --
      // ver el comentario de la columna en drizzle/schema.ts.
      topupAmount: z6.number().int().positive().optional()
    })).mutation(async ({ input }) => {
      return createTicketType(input);
    }),
    updateTicketType: adminProcedure2.input(z6.object({
      id: z6.number(),
      name: z6.string().optional(),
      accesoSlug: z6.enum(["duo", "duo_mujeres", "soltera", "soltero", "trio", "grupo", "cumpleaneros"]).optional(),
      category: z6.enum(["acceso", "extra", "consumo", "locker", "merch"]).optional(),
      description: z6.string().optional(),
      price: z6.number().optional(),
      originalPrice: z6.number().optional(),
      totalStock: z6.number().optional(),
      maxPerOrder: z6.number().optional(),
      sortOrder: z6.number().optional(),
      status: z6.enum(["active", "soldout", "hidden"]).optional(),
      costPrice: z6.number().optional(),
      color: z6.string().optional(),
      internalCode: z6.string().optional(),
      // Carta de la fiesta (tragos/comida/guardarropía): emoji en vez de foto,
      // sección para agrupar en la grilla de /caja, y si va a cocina.
      emoji: z6.string().max(8).optional(),
      groupName: z6.string().max(50).optional(),
      toKitchen: z6.number().min(0).max(1).optional(),
      stockPoolId: z6.number().nullable().optional(),
      topupAmount: z6.number().int().positive().nullable().optional()
    })).mutation(async ({ input, ctx }) => {
      const { id, ...data } = input;
      return updateTicketType(id, data, ctx.user.id);
    }),
    deleteTicketType: adminPasswordProcedure.input(z6.object({ id: z6.number() })).mutation(async ({ input, ctx }) => {
      const result = await deleteTicketType(input.id);
      await recordAdminAudit({ action: "events.deleteTicketType", targetType: "ticketType", targetId: input.id, ip: clientIp(ctx) });
      return result;
    }),
    // "Cerrar tanda y activar la siguiente" -- cierra cada fila hoy activa
    // (queda soldout) y crea la siguiente ya activa, con precio/stock
    // nuevos. Avance de fase 100% manual, ver comentario en db.advanceTanda.
    advanceTanda: adminProcedure2.input(z6.object({
      eventId: z6.number(),
      rows: z6.array(z6.object({
        oldTicketTypeId: z6.number(),
        newPrice: z6.number(),
        newTotalStock: z6.number(),
        newStockPoolId: z6.number().nullable().optional()
      })).min(1)
    })).mutation(async ({ input }) => {
      return advanceTanda(input.eventId, input.rows);
    }),
    ticketStockHistory: adminReadProcedure.input(z6.object({ ticketTypeId: z6.number() })).query(async ({ input }) => {
      return getTicketStockHistory(input.ticketTypeId);
    }),
    // Cupos compartidos (stockPools) -- ver drizzle/schema.ts. El admin ve el
    // número real siempre; lo que se esconde es solo la vista pública.
    listStockPools: adminReadProcedure.input(z6.object({ eventId: z6.number() })).query(async ({ input }) => {
      return getStockPoolsByEventId(input.eventId);
    }),
    createStockPool: adminProcedure2.input(z6.object({
      eventId: z6.number(),
      name: z6.string().min(1),
      totalCap: z6.number().int().positive()
    })).mutation(async ({ input }) => {
      return createStockPool(input);
    }),
    updateStockPool: adminProcedure2.input(z6.object({
      id: z6.number(),
      name: z6.string().min(1).optional(),
      totalCap: z6.number().int().positive().optional()
    })).mutation(async ({ input }) => {
      const { id, ...data } = input;
      return updateStockPool(id, data);
    }),
    deleteStockPool: adminProcedure2.input(z6.object({ id: z6.number() })).mutation(async ({ input }) => {
      return deleteStockPool(input.id);
    }),
    // IA: descripción corta + completa a partir de los datos del evento y una
    // idea/tema libre y opcional (no se guarda, ver server/eventDescriptions.ts).
    generateDescription: adminProcedure2.input(z6.object({
      title: z6.string().min(1),
      venue: z6.string().optional(),
      address: z6.string().optional(),
      eventDateISO: z6.string().optional(),
      idea: z6.string().max(500).optional()
    })).mutation(async ({ input }) => {
      try {
        return await generateEventDescription(input);
      } catch (err) {
        throw new TRPCError3({ code: "INTERNAL_SERVER_ERROR", message: err instanceof Error ? err.message : "No se pudo generar la descripci\xF3n." });
      }
    })
  }),
  orders: router({
    validateDiscount: publicProcedure.input(z6.object({
      code: z6.string(),
      eventId: z6.number()
    })).mutation(async ({ input }) => {
      return validateDiscountCode(input.code, input.eventId);
    }),
    /** Un solo campo de código en el checkout: la persona no sabe (ni le
     * importa) si lo que tiene es un código de descuento o el código de quien
     * la invitó -- este endpoint decide por ella. Se prueba primero contra
     * embajadores y después contra descuentos: cuando más adelante un código
     * de embajador también traiga descuento propio, esta rama es la que va a
     * empezar a incluirlo, sin tocar la rama de descuento puro. */
    validateCode: publicProcedure.input(z6.object({
      code: z6.string(),
      eventId: z6.number()
    })).mutation(async ({ input }) => {
      const clean = input.code.trim();
      if (!clean) return { type: "none", message: "Escribe un c\xF3digo" };
      const ambassador = await getActiveExclusiveAmbassadorByCode(clean);
      if (ambassador) {
        return { type: "ambassador", name: ambassador.name, code: ambassador.code };
      }
      const discountResult = await validateDiscountCode(clean, input.eventId);
      if (discountResult.valid && discountResult.discount) {
        return { type: "discount", discount: discountResult.discount };
      }
      return { type: "none", message: "No encontramos ese c\xF3digo" };
    }),
    create: publicProcedure.input(z6.object({
      eventSlug: z6.string(),
      buyerName: z6.string(),
      buyerEmail: z6.string().email(),
      buyerPhone: z6.string().optional(),
      items: z6.array(z6.object({
        ticketTypeId: z6.number(),
        quantity: z6.number().min(1)
      })),
      discountCode: z6.string().optional(),
      ambassadorCode: z6.string().optional(),
      communityCode: z6.string().optional(),
      // Datos por asistente/tipo de acceso (JSON serializado). Se adjunta a la
      // preferencia de Mercado Pago como metadata; no requiere migración de schema.
      attendeeData: z6.string().optional(),
      // Atribución UTM (ver client/src/lib/utm.ts): de dónde vino la venta
      // cuando no es por código de embajador.
      utmSource: z6.string().max(100).optional(),
      utmMedium: z6.string().max(100).optional(),
      utmCampaign: z6.string().max(100).optional(),
      utmContent: z6.string().max(100).optional()
    })).mutation(async ({ input }) => {
      const result = await createOrder(input);
      if (result.isFree) await confirmFreeOrder(result.orderNumber);
      return result;
    }),
    // Cobra una orden ya creada con el Payment Brick (tarjeta embebida, sin
    // modal/redirect de Mercado Pago). El monto se calcula server-side a
    // partir de la orden guardada, nunca del cliente.
    processCardPayment: publicProcedure.input(z6.object({
      orderNumber: z6.string(),
      token: z6.string(),
      paymentMethodId: z6.string(),
      issuerId: z6.union([z6.string(), z6.number()]).optional(),
      installments: z6.number().optional(),
      identificationType: z6.string().optional(),
      identificationNumber: z6.string().optional()
    })).mutation(async ({ input }) => {
      return processCardPaymentForOrder(input);
    }),
    // Admin
    listAll: adminReadProcedure.input(z6.object({
      page: z6.number().optional(),
      limit: z6.number().optional(),
      status: z6.string().optional(),
      channel: z6.enum(["web", "caja"]).optional(),
      eventId: z6.number().optional()
    }).optional()).query(async ({ input }) => {
      return getAllOrders(input?.page ?? 1, input?.limit ?? 50, input?.status, input?.channel, input?.eventId);
    }),
    getStats: adminReadProcedure.input(z6.object({
      channel: z6.enum(["web", "caja"]).optional(),
      eventId: z6.number().optional()
    }).optional()).query(async ({ input }) => {
      return getOrderStats(input?.channel, input?.eventId);
    }),
    // "Ventas por origen" (atribución UTM, agujero 2 del plan de ventas).
    salesByOrigin: adminReadProcedure.input(z6.object({ eventId: z6.number().optional() }).optional()).query(async ({ input }) => {
      return getSalesByUtmOrigin(input?.eventId);
    }),
    // Mismos filtros y mismas columnas que el CSV (server/adminRoutes.ts) --
    // alimenta la vista de impresión/PDF, para que ambos formatos muestren
    // exactamente lo mismo.
    forPrint: adminReadProcedure.input(z6.object({
      eventId: z6.number().optional(),
      dateFrom: z6.string().optional(),
      dateTo: z6.string().optional(),
      status: z6.string().optional(),
      channel: z6.enum(["web", "caja"]).optional()
    }).optional()).query(async ({ input }) => {
      return getOrdersForExport(input ?? {});
    }),
    getTickets: adminReadProcedure.input(z6.object({ orderId: z6.number() })).query(async ({ input }) => {
      return getOrderTickets(input.orderId);
    }),
    resendConfirmation: adminProcedure2.input(z6.object({ orderNumber: z6.string() })).mutation(async ({ input }) => {
      return resendConfirmationEmail(input.orderNumber);
    }),
    // "Aprobar sin pagar" (Ventas Web): para compradores con un beneficio que
    // los exime de pagar la diferencia de Misión 300 -- genera el ticket con
    // QR y manda el correo final sin pago real de por medio.
    approveMissionTopup: adminProcedure2.input(z6.object({ orderId: z6.number() })).mutation(async ({ input }) => {
      return approveMissionTopupWithoutPayment(input.orderId);
    }),
    // Recordatorio a quien dejó la compra a medio camino (server/orderReminders.ts).
    // La selección es manual a propósito: nunca "mandar a todos".
    // No hace falta un `listPending`: `listAll` con status='pending' ya trae
    // todas las columnas de la orden, incluidas reminderSentAt/reminderCount.
    sendReminders: adminProcedure2.input(z6.object({
      orderIds: z6.array(z6.number()).min(1).max(200),
      customBody: z6.string().max(4e3).optional()
    })).mutation(async ({ input }) => {
      return sendPendingReminders(input);
    }),
    generateReminderCopy: adminProcedure2.input(z6.object({
      idea: z6.string().min(5).max(1e3)
    })).mutation(async ({ input }) => {
      try {
        return await generateReminderCopy(input.idea);
      } catch (err) {
        throw new TRPCError3({ code: "INTERNAL_SERVER_ERROR", message: err instanceof Error ? err.message : "No se pudo generar el texto." });
      }
    }),
    // Accesos manuales desde /admin (pedido explícito del usuario):
    // invitaciones gratis o accesos ya pagados por transferencia/efectivo
    // directo, sin pasar por Mercado Pago -- misma info del comprador que el
    // checkout público, y el mismo mail final con QR (confirmFreeOrder ya lo
    // usa el checkout público para el caso de descuento 100%).
    createManual: adminProcedure2.input(z6.object({
      eventSlug: z6.string(),
      buyerName: z6.string().min(1),
      buyerEmail: z6.string().email(),
      buyerPhone: z6.string().optional(),
      items: z6.array(z6.object({
        ticketTypeId: z6.number(),
        quantity: z6.number().min(1),
        // Monto que el admin escribió a mano para este tipo de entrada
        // (pedido explícito del usuario) -- si no viene, se usa el precio de
        // catálogo/abono Misión 300 por defecto (ver priceManualOrderItems).
        unitPrice: z6.number().min(0).optional()
      })).min(1),
      kind: z6.enum(["invitation", "paid"]),
      paymentMethod: z6.string().optional(),
      attendeeData: z6.string().optional()
    })).mutation(async ({ input }) => {
      try {
        const result = await createManualOrder(input);
        await confirmFreeOrder(result.orderNumber);
        return result;
      } catch (err) {
        throw new TRPCError3({ code: "BAD_REQUEST", message: err instanceof Error ? err.message : "No se pudo crear el acceso manual." });
      }
    }),
    listManual: adminReadProcedure.query(async () => {
      return listManualOrders();
    }),
    // "Invitación especial instantánea" de Accesos Manuales (pedido explícito
    // del usuario): sin ningún dato salvo la cantidad de personas -- para
    // cuando llega un invitado del dueño a la puerta sin QR. Un solo
    // ticket/QR representa a todas las personas (ver createInstantInvite).
    createInstantInvite: adminProcedure2.input(z6.object({
      eventSlug: z6.string(),
      personas: z6.number().int().min(1).max(20)
    })).mutation(async ({ input }) => {
      try {
        return await createInstantInvite(input);
      } catch (err) {
        throw new TRPCError3({ code: "BAD_REQUEST", message: err instanceof Error ? err.message : "No se pudo crear la invitaci\xF3n." });
      }
    }),
    // "Invitar consumo gratis a staff" de Accesos Manuales (pedido explícito
    // del usuario): el dueño elige un producto de la Carta de la Fiesta,
    // cuántas unidades y para quién es -- la cajera lo ve y lo canjea en /caja.
    createStaffComp: adminProcedure2.input(z6.object({
      eventSlug: z6.string(),
      ticketTypeId: z6.number(),
      quantity: z6.number().int().min(1).max(20),
      staffName: z6.string().min(1)
    })).mutation(async ({ input }) => {
      try {
        return await createStaffComp(input);
      } catch (err) {
        throw new TRPCError3({ code: "BAD_REQUEST", message: err instanceof Error ? err.message : "No se pudo crear la invitaci\xF3n de consumo." });
      }
    }),
    listStaffComps: adminReadProcedure.input(z6.object({ eventId: z6.number() })).query(async ({ input }) => {
      return listStaffComps(input.eventId);
    }),
    // Eliminar una compra (pedido explícito del usuario): irreversible, la
    // confirmación con ventana de diálogo vive en el admin, acá solo se
    // ejecuta el borrado en cascada.
    delete: adminPasswordProcedure.input(z6.object({ id: z6.number() })).mutation(async ({ input, ctx }) => {
      const before = await getOrderById(input.id);
      const result = await deleteOrderCascade(input.id);
      await recordAdminAudit({ action: "orders.delete", targetType: "order", targetId: input.id, eventId: before?.eventId ?? null, payload: before ?? null, ip: clientIp(ctx) });
      return result;
    })
  }),
  mission300: router({
    status: adminReadProcedure.input(z6.object({ eventId: z6.number() })).query(async ({ input }) => {
      return getMission300Status(input.eventId);
    }),
    evaluate: adminProcedure2.input(z6.object({ eventId: z6.number() })).mutation(async ({ input }) => {
      return evaluateMission300(input.eventId);
    }),
    // Contador público de Home (pedido explícito del usuario): cuántas
    // personas de abonos de Misión 300 todavía NO están resueltas (ni
    // "aprobadas del todo"), para que el contador público las reste y solo
    // muestre lo que ya está confirmado -- sin datos sensibles, solo un número.
    pendingPersonas: publicProcedure.input(z6.object({ slug: z6.string() })).query(async ({ input }) => {
      const event = await getEventBySlug(input.slug);
      if (!event) return { personas: 0 };
      return { personas: await getUnresolvedDepositPersonas(event.id) };
    })
  }),
  tickets: router({
    // Página pública "Mi entrada" (/verificar/:ticketCode) — de solo lectura,
    // el ticketCode ya funciona como token portador (viene del QR/email).
    getByCode: publicProcedure.input(z6.object({ ticketCode: z6.string() })).query(async ({ input }) => {
      return getTicketByCode(input.ticketCode);
    })
  }),
  // --- Puerta: el anfitrión en la entrada del estacionamiento ---
  // Pantalla aparte de /caja a propósito: el anfitrión no es cajero, no
  // debería ver el menú de venta, y escanea con su propio teléfono. Lo
  // único que puede hacer con esta sesión es marcar entradas.
  puerta: router({
    // Público como el de caja: solo devuelve nombres y roles, nunca PINs.
    // La puerta no exige dispositivo enrolado (doorProcedure), así que no hay
    // un eventId de contexto -- se usa la misma heurística de "evento en
    // curso" que el resto de estas pantallas sin device.
    listOperators: publicProcedure.query(async () => {
      const event = await getActiveEventForCaja();
      if (!event) return [];
      const all = await listActiveOperatorsPublic(event.id);
      return all.filter((o) => o.role === "acceso" || o.role === "supervisor" || o.role === "admin");
    }),
    login: publicProcedure.input(z6.object({ operatorId: z6.number(), pin: z6.string().min(4).max(8) })).mutation(async ({ input, ctx }) => {
      const operator = await verifyDoorPinOrThrow(ctx, input.operatorId, input.pin);
      const sessionToken = await signOperatorSession({ operatorId: operator.id, role: operator.role, name: operator.name });
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.cookie(CAJA_COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: CAJA_SESSION_MS });
      return { id: operator.id, name: operator.name, role: operator.role };
    }),
    me: publicProcedure.query(({ ctx }) => ctx.operator),
    /* El evento sale del operador que inició sesión (`operators.eventId`),
     * no de la heurística "el evento publicado con fecha más cercana a
     * ahora". Con dos eventos publicados a la vez esa heurística puede
     * apuntar al equivocado y un check-in queda cargado a la fiesta que no
     * es. /caja ya lo había resuelto usando el evento del dispositivo
     * enrolado; estas pantallas no tienen dispositivo a propósito (el
     * anfitrión usa su propio teléfono), pero el operador sí trae su evento.
     * La heurística queda solo como respaldo para un operador viejo sin
     * evento asignado. */
    activeEvent: doorProcedure.query(async ({ ctx }) => {
      if (ctx.operator?.eventId) return await getEventById(ctx.operator.eventId) ?? void 0;
      return getActiveEventForCaja();
    }),
    // Mismo snapshot que la caja: la puerta lo guarda en el mismo IndexedDB
    // y por eso funciona sin señal.
    snapshot: doorProcedure.input(z6.object({ eventId: z6.number() })).query(async ({ input }) => {
      return getCajaSnapshot(input.eventId);
    }),
    checkin: doorProcedure.input(z6.object({
      opId: z6.string(),
      eventId: z6.number(),
      ticketCode: z6.string().min(1),
      clientAt: z6.string()
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
    // Vaciado de la cola offline. Solo acepta check-in y cobro de
    // estacionamiento: la puerta no vende de la carta ni canjea otros
    // extras, aunque comparta la cola con la caja.
    sync: doorProcedure.input(z6.object({
      eventId: z6.number(),
      ops: z6.array(z6.discriminatedUnion("type", [
        z6.object({ type: z6.literal("checkin"), opId: z6.string(), ticketCode: z6.string(), clientAt: z6.string() }),
        z6.object({
          type: z6.literal("parking_paid"),
          opId: z6.string(),
          ticketCode: z6.string(),
          paymentMethod: z6.enum(["efectivo", "debito", "credito"]),
          clientAt: z6.string()
        })
      ])).max(50)
    })).mutation(async ({ input, ctx }) => {
      const rawDb = await getDb();
      if (!rawDb) throw new TRPCError3({ code: "INTERNAL_SERVER_ERROR", message: "Base de datos no disponible" });
      const results = {};
      for (const op of input.ops) {
        try {
          if (op.type === "checkin") {
            results[op.opId] = await checkInTicket(rawDb, {
              opId: op.opId,
              ticketCode: op.ticketCode,
              eventId: input.eventId,
              operatorId: ctx.operator.operatorId,
              clientAt: new Date(op.clientAt)
            });
          } else {
            results[op.opId] = await sellParkingAtDoor(rawDb, {
              opId: op.opId,
              ticketCode: op.ticketCode,
              eventId: input.eventId,
              paymentMethod: op.paymentMethod,
              operatorId: ctx.operator.operatorId,
              clientAt: new Date(op.clientAt)
            });
          }
        } catch (err) {
          results[op.opId] = { result: "rejected", conflictNote: friendlySyncErrorMessage(err, op.opId) };
        }
      }
      return results;
    })
  }),
  // --- Cocina: la pantalla que recibe los pedidos de comida de /caja ---
  // Pantalla propia, aparte de /caja y /puerta: el equipo de cocina no
  // vende ni marca entradas, solo prepara y entrega. A diferencia de esas
  // dos, esta pantalla SÍ necesita red -- el pedido nace en otra tablet
  // (la caja) y no hay forma de que cocina se entere sin consultar al
  // servidor, así que no tiene sentido una cola offline acá.
  cocina: router({
    listOperators: publicProcedure.query(async () => {
      const event = await getActiveEventForCaja();
      if (!event) return [];
      const all = await listActiveOperatorsPublic(event.id);
      return all.filter((o) => o.role === "cocina" || o.role === "supervisor" || o.role === "admin");
    }),
    login: publicProcedure.input(z6.object({ operatorId: z6.number(), pin: z6.string().min(4).max(8) })).mutation(async ({ input, ctx }) => {
      const operator = await verifyKitchenPinOrThrow(ctx, input.operatorId, input.pin);
      const sessionToken = await signOperatorSession({ operatorId: operator.id, role: operator.role, name: operator.name });
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.cookie(CAJA_COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: CAJA_SESSION_MS });
      return { id: operator.id, name: operator.name, role: operator.role };
    }),
    me: publicProcedure.query(({ ctx }) => ctx.operator),
    /* El evento sale del operador que inició sesión (`operators.eventId`),
     * no de la heurística "el evento publicado con fecha más cercana a
     * ahora". Con dos eventos publicados a la vez esa heurística puede
     * apuntar al equivocado y un check-in queda cargado a la fiesta que no
     * es. /caja ya lo había resuelto usando el evento del dispositivo
     * enrolado; estas pantallas no tienen dispositivo a propósito (el
     * anfitrión usa su propio teléfono), pero el operador sí trae su evento.
     * La heurística queda solo como respaldo para un operador viejo sin
     * evento asignado. */
    activeEvent: kitchenProcedure.query(async ({ ctx }) => {
      if (ctx.operator?.eventId) return await getEventById(ctx.operator.eventId) ?? void 0;
      return getActiveEventForCaja();
    }),
    // Polling cada 4s desde el cliente -- pendientes/aprobadas más viejas
    // primero, y las entregadas de la última hora aparte (para "deshacer").
    list: kitchenProcedure.input(z6.object({ eventId: z6.number() })).query(async ({ input }) => {
      return listKitchenTickets(input.eventId);
    }),
    update: kitchenProcedure.input(z6.object({
      opId: z6.string(),
      eventId: z6.number(),
      ticketNumber: z6.string(),
      to: z6.enum(["pendiente", "aprobado", "entregado"]),
      clientAt: z6.string()
    })).mutation(async ({ input, ctx }) => {
      const rawDb = await getDb();
      if (!rawDb) throw new TRPCError3({ code: "INTERNAL_SERVER_ERROR", message: "Base de datos no disponible" });
      return updateKitchenTicket(rawDb, {
        opId: input.opId,
        eventId: input.eventId,
        ticketNumber: input.ticketNumber,
        operatorId: ctx.operator.operatorId,
        clientAt: new Date(input.clientAt),
        to: input.to
      });
    }),
    // Porciones disponibles por producto (docs/ARQUITECTURA-CAJA.md §12):
    // cocina carga cuánto hay de cada opción y la cajera solo puede vender
    // hasta ese tope -- mismo stock/soldCount que ya usa /caja, no una
    // tabla paralela.
    products: kitchenProcedure.input(z6.object({ eventId: z6.number() })).query(async ({ input }) => {
      return listKitchenProducts(input.eventId);
    }),
    updateStock: kitchenProcedure.input(z6.object({
      productId: z6.number(),
      eventId: z6.number(),
      totalStock: z6.number().min(0)
    })).mutation(async ({ input, ctx }) => {
      return updateKitchenProductStock(input.productId, input.eventId, input.totalStock, ctx.operator.operatorId);
    }),
    // Botón de emergencia: agotar/reponer un producto sin tener que calcular
    // porciones exactas -- bloquea la venta de verdad en /caja (ver
    // getCajaSnapshot).
    toggleSoldOut: kitchenProcedure.input(z6.object({
      productId: z6.number(),
      eventId: z6.number(),
      soldOut: z6.boolean()
    })).mutation(async ({ input }) => {
      return toggleKitchenProductSoldOut(input.productId, input.eventId, input.soldOut);
    })
  }),
  // Pantalla propia de guardarropía: recibe/entrega prendas ya cobradas
  // en /caja. Mismo criterio que cocina -- sin cola offline, la prenda
  // nace en otra tablet y no hay forma de enterarse sin consultar al
  // servidor.
  guardarropia: router({
    listOperators: publicProcedure.query(async () => {
      const event = await getActiveEventForCaja();
      if (!event) return [];
      const all = await listActiveOperatorsPublic(event.id);
      return all.filter((o) => o.role === "guardarropia" || o.role === "supervisor" || o.role === "admin");
    }),
    login: publicProcedure.input(z6.object({ operatorId: z6.number(), pin: z6.string().min(4).max(8) })).mutation(async ({ input, ctx }) => {
      const operator = await verifyGuardarropiaPinOrThrow(ctx, input.operatorId, input.pin);
      const sessionToken = await signOperatorSession({ operatorId: operator.id, role: operator.role, name: operator.name });
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.cookie(CAJA_COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: CAJA_SESSION_MS });
      return { id: operator.id, name: operator.name, role: operator.role };
    }),
    me: publicProcedure.query(({ ctx }) => ctx.operator),
    /* El evento sale del operador que inició sesión (`operators.eventId`),
     * no de la heurística "el evento publicado con fecha más cercana a
     * ahora". Con dos eventos publicados a la vez esa heurística puede
     * apuntar al equivocado y un check-in queda cargado a la fiesta que no
     * es. /caja ya lo había resuelto usando el evento del dispositivo
     * enrolado; estas pantallas no tienen dispositivo a propósito (el
     * anfitrión usa su propio teléfono), pero el operador sí trae su evento.
     * La heurística queda solo como respaldo para un operador viejo sin
     * evento asignado. */
    activeEvent: guardarropiaProcedure.query(async ({ ctx }) => {
      if (ctx.operator?.eventId) return await getEventById(ctx.operator.eventId) ?? void 0;
      return getActiveEventForCaja();
    }),
    // Polling cada 4s -- trae todas las prendas del evento, el cliente
    // arma la cola de "recién llegadas" y el buscador localmente.
    list: guardarropiaProcedure.input(z6.object({ eventId: z6.number() })).query(async ({ input }) => {
      return listLockerItems(input.eventId);
    }),
    update: guardarropiaProcedure.input(z6.object({
      opId: z6.string(),
      eventId: z6.number(),
      tagNumber: z6.string(),
      to: z6.enum(["pendiente", "guardado", "retirado"]),
      clientAt: z6.string()
    })).mutation(async ({ input, ctx }) => {
      const rawDb = await getDb();
      if (!rawDb) throw new TRPCError3({ code: "INTERNAL_SERVER_ERROR", message: "Base de datos no disponible" });
      return updateLockerItem(rawDb, {
        opId: input.opId,
        eventId: input.eventId,
        tagNumber: input.tagNumber,
        operatorId: ctx.operator.operatorId,
        clientAt: new Date(input.clientAt),
        to: input.to
      });
    })
  }),
  // --- Caramelo: la fiesta dentro del celular ---
  // Todo público porque el `ticketCode` ES el token (igual que la página de
  // la entrada): no hay cuentas ni contraseñas. Cada llamada revalida las
  // tres condiciones desde cero contra la base -- esconder un botón en el
  // cliente no protege nada.
  party: router({
    resolveEntryCode: publicProcedure.input(z6.object({ code: z6.string() })).query(async ({ input }) => {
      const ticketCode = await resolvePartyEntryCode(input.code);
      return { ticketCode };
    }),
    getSession: publicProcedure.input(z6.object({ ticketCode: z6.string() })).query(async ({ input }) => {
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
    createProfile: publicProcedure.input(z6.object({
      ticketCode: z6.string(),
      alias: z6.string(),
      gender: z6.enum(PARTY_GENDERS),
      avatarId: z6.number().int().min(1).max(AVATARS_PER_GENDER),
      zone: z6.enum(PARTY_ZONES)
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
    listMansion: publicProcedure.input(z6.object({ ticketCode: z6.string() })).query(async ({ input }) => {
      const actor = await requirePartyProfile(input.ticketCode);
      return listPartyMansion(actor.profile.id, actor.event.id);
    }),
    setZone: publicProcedure.input(z6.object({ ticketCode: z6.string(), zone: z6.enum(PARTY_ZONES) })).mutation(async ({ input }) => {
      const actor = await requirePartyProfile(input.ticketCode);
      await updatePartyProfile(actor.profile.id, { zone: input.zone });
      return { ok: true };
    }),
    touch: publicProcedure.input(z6.object({ ticketCode: z6.string(), targetProfileId: z6.number() })).mutation(async ({ input }) => {
      const actor = await requirePartyProfile(input.ticketCode);
      const res = await touchPartyProfile(actor.profile.id, input.targetProfileId, actor.event.id);
      if (!res.ok) throw new TRPCError3({ code: "BAD_REQUEST", message: res.reason });
      return res;
    }),
    respondTouch: publicProcedure.input(z6.object({ ticketCode: z6.string(), connectionId: z6.number(), accept: z6.boolean() })).mutation(async ({ input }) => {
      const actor = await requirePartyProfile(input.ticketCode);
      const res = await respondToPartyTouch(actor.profile.id, input.connectionId, input.accept);
      if (!res.ok) throw new TRPCError3({ code: "BAD_REQUEST", message: res.reason });
      return res;
    }),
    getMessages: publicProcedure.input(z6.object({ ticketCode: z6.string(), connectionId: z6.number() })).query(async ({ input }) => {
      const actor = await requirePartyProfile(input.ticketCode);
      const res = await listPartyMessages(actor.profile.id, input.connectionId);
      if (!res) throw new TRPCError3({ code: "FORBIDDEN", message: "Esta conversaci\xF3n no est\xE1 abierta" });
      return res;
    }),
    sendMessage: publicProcedure.input(z6.object({ ticketCode: z6.string(), connectionId: z6.number(), body: z6.string() })).mutation(async ({ input }) => {
      const actor = await requirePartyProfile(input.ticketCode);
      const check = sanitizeMessage(input.body);
      if (!check.ok) throw new TRPCError3({ code: "BAD_REQUEST", message: check.reason });
      const res = await sendPartyMessage(actor.profile.id, input.connectionId, check.body);
      if (!res.ok) throw new TRPCError3({ code: "FORBIDDEN", message: res.reason });
      const otherTicketCode = await getPartyProfileTicketCode(res.otherId);
      if (otherTicketCode) {
        await sendPushToProfile(res.otherId, {
          title: "\u{1F48C} Nuevo mensaje",
          body: `${actor.profile.alias} te escribi\xF3 en Playmatch`,
          url: `/fiesta/${otherTicketCode}`
        });
      }
      return { ok: true };
    }),
    block: publicProcedure.input(z6.object({ ticketCode: z6.string(), targetProfileId: z6.number() })).mutation(async ({ input }) => {
      const actor = await requirePartyProfile(input.ticketCode);
      await blockPartyProfile(actor.profile.id, input.targetProfileId, actor.event.id);
      return { ok: true };
    }),
    report: publicProcedure.input(z6.object({ ticketCode: z6.string(), targetProfileId: z6.number(), reason: z6.string().min(3).max(500) })).mutation(async ({ input }) => {
      const actor = await requirePartyProfile(input.ticketCode);
      await reportPartyProfile(actor.profile.id, input.targetProfileId, actor.event.id, input.reason.trim());
      await blockPartyProfile(actor.profile.id, input.targetProfileId, actor.event.id);
      await sendPushToAdmins("pushPartyReport", {
        title: "\u26A0\uFE0F Nueva denuncia en la fiesta",
        body: input.reason.trim().slice(0, 120),
        url: "/admin"
      });
      return { ok: true };
    }),
    // --- Notificaciones push del invitado (mensaje nuevo, promos relámpago) ---
    // La clave pública VAPID acá SÍ es pública sin gate: a diferencia del
    // admin, el invitado no tiene sesión detrás de la cual esconderla.
    getVapidPublicKey: publicProcedure.query(() => {
      return { publicKey: process.env.VAPID_PUBLIC_KEY ?? null };
    }),
    pushSubscribe: publicProcedure.input(z6.object({
      ticketCode: z6.string(),
      endpoint: z6.string().url().max(512),
      p256dh: z6.string(),
      auth: z6.string()
    })).mutation(async ({ input }) => {
      const actor = await requirePartyProfile(input.ticketCode);
      return savePartyPushSubscription({
        profileId: actor.profile.id,
        eventId: actor.event.id,
        endpoint: input.endpoint,
        p256dh: input.p256dh,
        auth: input.auth
      });
    }),
    pushUnsubscribe: publicProcedure.input(z6.object({ endpoint: z6.string() })).mutation(async ({ input }) => {
      return deletePartyPushSubscription(input.endpoint);
    }),
    // --- Invitar un trago ---
    // Tres pasos porque el destinatario puede rechazar y nadie paga por un
    // trago rechazado: invitar (gratis) -> responder -> pagar.
    listDrinks: publicProcedure.input(z6.object({ ticketCode: z6.string() })).query(async ({ input }) => {
      const actor = await requirePartyProfile(input.ticketCode);
      return listPartyDrinks(actor.event.id);
    }),
    sendGift: publicProcedure.input(z6.object({
      ticketCode: z6.string(),
      targetProfileId: z6.number(),
      ticketTypeId: z6.number(),
      message: z6.string().optional()
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
    respondGift: publicProcedure.input(z6.object({ ticketCode: z6.string(), giftId: z6.number(), accept: z6.boolean() })).mutation(async ({ input }) => {
      const actor = await requirePartyProfile(input.ticketCode);
      const res = await respondToGiftInvitation(actor.profile.id, input.giftId, input.accept);
      if (!res.ok) throw new TRPCError3({ code: "BAD_REQUEST", message: res.reason });
      return res;
    }),
    // Crea la orden del regalo y devuelve su número. El cobro después va
    // por `orders.processCardPayment`, el mismo endpoint que las entradas.
    payGift: publicProcedure.input(z6.object({ ticketCode: z6.string(), giftId: z6.number() })).mutation(async ({ input }) => {
      const actor = await requirePartyProfile(input.ticketCode);
      const contact = await getPartyProfileContact(actor.profile.id);
      if (!contact?.email) throw new TRPCError3({ code: "BAD_REQUEST", message: "No pudimos identificar tu correo" });
      const res = await createGiftOrder(actor.profile.id, input.giftId, { name: contact.alias, email: contact.email });
      if (!res.ok) throw new TRPCError3({ code: "BAD_REQUEST", message: res.reason });
      return res;
    }),
    myGifts: publicProcedure.input(z6.object({ ticketCode: z6.string() })).query(async ({ input }) => {
      const actor = await requirePartyProfile(input.ticketCode);
      return listMyGifts(actor.profile.id);
    }),
    // Para el equipo del local, durante la fiesta.
    listGifts: adminReadProcedure.input(z6.object({ eventId: z6.number() })).query(async ({ input }) => {
      return listPartyGiftsForEvent(input.eventId);
    }),
    // Denuncias de todos los eventos, para la sección "Denuncias" del admin:
    // hasta ahora se guardaban en la base sin ninguna pantalla donde verlas.
    listAllReports: adminReadProcedure.query(async () => {
      return listAllPartyReports();
    }),
    setReportResolved: adminProcedure2.input(z6.object({
      id: z6.number(),
      resolved: z6.boolean()
    })).mutation(async ({ input }) => {
      return setPartyReportResolved(input.id, input.resolved);
    })
  }),
  discounts: router({
    listAll: adminReadProcedure.query(async () => {
      return getAllDiscountCodes();
    }),
    create: adminProcedure2.input(z6.object({
      code: z6.string(),
      description: z6.string().optional(),
      discountType: z6.enum(["percentage", "fixed"]),
      discountValue: z6.number(),
      minPurchase: z6.number().optional(),
      maxUses: z6.number().optional(),
      eventId: z6.number().optional(),
      validFrom: z6.string().optional(),
      validUntil: z6.string().optional()
    })).mutation(async ({ input }) => {
      return createDiscountCode(input);
    }),
    delete: adminPasswordProcedure.input(z6.object({ id: z6.number() })).mutation(async ({ input, ctx }) => {
      const result = await deleteDiscountCode(input.id);
      await recordAdminAudit({ action: "discounts.delete", targetType: "discountCode", targetId: input.id, ip: clientIp(ctx) });
      return result;
    })
  }),
  // Promo relámpago: un código con vencimiento (mismo `discountCodes` de
  // siempre -- ya lo valida el checkout web Y la venta de Caja, así que no
  // hace falta ningún flujo de compra nuevo) + un push en vivo a todos los
  // invitados suscritos de la fiesta activa.
  flashPromo: router({
    send: adminProcedure2.input(z6.object({
      message: z6.string().min(3).max(200),
      discountPercent: z6.number().int().min(1).max(100),
      minutes: z6.number().int().min(1).max(180),
      ticketTypeIds: z6.array(z6.number()).min(1)
    })).mutation(async ({ input }) => {
      const event = await getActiveEventForCaja();
      if (!event) throw new TRPCError3({ code: "BAD_REQUEST", message: "No hay una fiesta activa ahora mismo" });
      const code = `FLASH${nanoid4(4).toUpperCase()}`;
      const now = /* @__PURE__ */ new Date();
      const expiresAt = new Date(now.getTime() + input.minutes * 6e4);
      await createDiscountCode({
        code,
        description: input.message,
        discountType: "percentage",
        discountValue: input.discountPercent,
        eventId: event.id,
        validFrom: now,
        validUntil: expiresAt,
        isActive: 1,
        applicableTicketTypeIds: input.ticketTypeIds
      });
      const { sent } = await sendPushToEventGuests(event.id, {
        title: "\u{1F389} Promo rel\xE1mpago",
        body: `${input.message} -- c\xF3digo ${code}, vale por ${input.minutes} min`,
        url: `/eventos/${event.slug}`
      });
      return { code, expiresAt, sent };
    }),
    // Pública: Caja la pollea (sin login de cajero necesario para leerla)
    // para pintar la insignia "Promo Flash" y aplicar el descuento solo.
    active: publicProcedure.input(z6.object({ eventId: z6.number() })).query(async ({ input }) => {
      return getActiveFlashPromo(input.eventId);
    }),
    // Plantillas pregrabadas -- un toque en el admin solo RELLENA el
    // formulario de `send`, nunca lo manda solo.
    listPresets: adminReadProcedure.query(async () => {
      const settings = await getSiteSettings();
      return normalizeFlashPromoPresets(settings.flashPromoPresets);
    }),
    savePreset: adminProcedure2.input(z6.object({
      id: z6.string().optional(),
      label: z6.string().min(1).max(60),
      message: z6.string().min(3).max(200),
      discountPercent: z6.number().int().min(1).max(100),
      minutes: z6.number().int().min(1).max(180),
      ticketTypeIds: z6.array(z6.number()).min(1)
    })).mutation(async ({ input }) => {
      const settings = await getSiteSettings();
      const presets = normalizeFlashPromoPresets(settings.flashPromoPresets);
      const id = input.id ?? nanoid4(8);
      const preset = { ...input, id };
      const next = presets.some((p) => p.id === id) ? presets.map((p) => p.id === id ? preset : p) : [...presets, preset];
      await updateSiteSettings({ flashPromoPresets: next });
      return preset;
    }),
    deletePreset: adminProcedure2.input(z6.object({ id: z6.string() })).mutation(async ({ input }) => {
      const settings = await getSiteSettings();
      const presets = normalizeFlashPromoPresets(settings.flashPromoPresets);
      await updateSiteSettings({ flashPromoPresets: presets.filter((p) => p.id !== input.id) });
      return { success: true };
    })
  }),
  settings: router({
    get: publicProcedure.query(async () => {
      return getSiteSettings();
    }),
    update: adminProcedure2.input(z6.object({
      instagramFollowers: z6.number().optional(),
      instagramPosts: z6.number().optional(),
      serviceFeePercent: z6.number().min(0).max(100).optional(),
      cardFeePercent: z6.number().min(0).max(100).optional(),
      parkingVenueFeeClp: z6.number().min(0).optional(),
      kitchenVendorName: z6.string().nullable().optional(),
      kitchenVendorEmail: z6.string().email().nullable().optional(),
      ogImageUrl: z6.string().url().nullable().optional(),
      foundersPromoEnabled: z6.boolean().optional()
    })).mutation(async ({ input }) => {
      return updateSiteSettings(input);
    }),
    // Mismo número que llega en el correo de las 3am (server/cronRoutes.ts),
    // pero en vivo para revisarlo manual desde Ajustes.
    checkinCount: adminReadProcedure.query(async () => {
      const event = await getActiveEventForCaja();
      if (!event) return null;
      const dashboard = await getCajaDashboard(event.id);
      if (!dashboard) return null;
      return { eventTitle: event.title, insideCount: dashboard.insideCount, expectedCount: dashboard.expectedCount };
    })
  }),
  // Burbujas con números sobre cada ítem del menú del admin: el dueño tenía
  // que entrar sección por sección para descubrir si había algo nuevo. El
  // cliente manda cuándo miró cada sección por última vez (lo guarda en
  // localStorage) y acá se cuenta lo que llegó después -- salvo las secciones
  // de "pendiente de acción", que se cuentan siempre (ver getAdminBadgeCounts).
  adminBadges: router({
    counts: adminReadProcedure.input(z6.object({
      seenAt: z6.record(z6.string(), z6.string().datetime()).default({})
    })).query(async ({ input }) => {
      const parsed = {};
      for (const [section, iso] of Object.entries(input.seenAt)) {
        const date = new Date(iso);
        if (!Number.isNaN(date.getTime())) parsed[section] = date;
      }
      return getAdminBadgeCounts(parsed);
    })
  }),
  // Push al /admin instalado + correo resumen diario (server/push.ts,
  // server/adminDigest.ts) -- interruptores en shared/adminAlertsConfig.ts,
  // todos apagados por defecto.
  adminAlerts: router({
    getConfig: adminReadProcedure.query(async () => {
      const settings = await getSiteSettings();
      return normalizeAdminAlertsConfig(settings.adminAlertsConfig);
    }),
    saveConfig: adminProcedure2.input(z6.object({
      pushNewOrder: z6.boolean(),
      pushAmbassadorApplication: z6.boolean(),
      pushPartyReport: z6.boolean(),
      dailyDigestEmail: z6.boolean()
    })).mutation(async ({ input }) => {
      return updateSiteSettings({ adminAlertsConfig: input });
    }),
    // La clave pública VAPID no es secreta (viaja al navegador para armar la
    // suscripción), pero igual queda detrás de admin para no publicarla sin
    // razón -- si no está configurada, el cliente sabe que debe mostrar
    // "todavía no disponible" en vez de intentar suscribirse.
    getVapidPublicKey: adminReadProcedure.query(async () => {
      return { publicKey: process.env.VAPID_PUBLIC_KEY ?? null };
    }),
    subscribe: adminProcedure2.input(z6.object({
      endpoint: z6.string().url().max(512),
      p256dh: z6.string(),
      auth: z6.string(),
      label: z6.string().max(100).optional()
    })).mutation(async ({ input }) => {
      return savePushSubscription(input);
    }),
    unsubscribe: adminProcedure2.input(z6.object({ endpoint: z6.string() })).mutation(async ({ input }) => {
      return deletePushSubscription(input.endpoint);
    }),
    listSubscriptions: adminReadProcedure.query(async () => {
      return listPushSubscriptions();
    }),
    removeSubscription: adminProcedure2.input(z6.object({ id: z6.number() })).mutation(async ({ input }) => {
      return deletePushSubscriptionById(input.id);
    }),
    // Manda un push de prueba a TODOS los dispositivos suscritos ahora mismo,
    // sin importar los interruptores -- para confirmar que la suscripción de
    // este dispositivo realmente funciona antes de confiar en las alertas.
    sendTestPush: adminProcedure2.mutation(async () => {
      await sendTestPushToAllAdmins();
      return { success: true };
    }),
    // Manda el correo resumen ya mismo (respeta el interruptor), mismo
    // criterio que foundersPromoRunNow -- para probarlo sin esperar al cron.
    sendDigestNow: adminProcedure2.mutation(async () => {
      return runAdminDigest();
    })
  }),
  // Editor de textos + interruptores por sección del correo de compra, y
  // botón de "mandar prueba" a una casilla cualquiera con cualquiera de los
  // 4 correos de cara al cliente -- ver shared/emailTemplateConfig.ts para
  // el porqué del alcance (solo buildOrderEmail tiene secciones largas
  // desacoplables; los otros 3 son cortos y no las necesitan).
  emailTemplates: router({
    getConfig: adminReadProcedure.query(async () => {
      const settings = await getSiteSettings();
      return normalizeOrderEmailConfig(settings.emailTemplateConfig?.orderEmail);
    }),
    saveConfig: adminProcedure2.input(z6.object({
      sections: z6.object({
        quienesSomos: z6.boolean(),
        encontraras: z6.boolean(),
        antesDeVenir: z6.boolean(),
        valores: z6.boolean(),
        embajador: z6.boolean(),
        faq: z6.boolean()
      }),
      greetingText: z6.string().min(1),
      farewellText: z6.string().min(1)
    })).mutation(async ({ input }) => {
      return updateSiteSettings({ emailTemplateConfig: { orderEmail: input } });
    }),
    // Vista previa en vivo del correo de compra con la config todavía sin
    // guardar (mismo patrón que mailing.renderPreview) -- datos de muestra,
    // nunca datos reales de una orden.
    renderPreview: adminProcedure2.input(z6.object({
      sections: z6.object({
        quienesSomos: z6.boolean(),
        encontraras: z6.boolean(),
        antesDeVenir: z6.boolean(),
        valores: z6.boolean(),
        embajador: z6.boolean(),
        faq: z6.boolean()
      }),
      greetingText: z6.string(),
      farewellText: z6.string()
    })).mutation(async ({ input }) => {
      const eventFields = await resolveOrderPreviewEventFields();
      return { html: buildOrderEmail({ ...SAMPLE_ORDER_EMAIL_DATA, ...eventFields, templateConfig: input }) };
    }),
    sendTest: adminProcedure2.input(z6.object({
      toEmail: z6.string().email(),
      templateType: z6.enum(["order", "missionTopup", "pendingReminder", "gift"])
    })).mutation(async ({ input }) => {
      let html;
      let subject;
      switch (input.templateType) {
        case "order": {
          const settings = await getSiteSettings();
          const templateConfig = normalizeOrderEmailConfig(settings.emailTemplateConfig?.orderEmail);
          const eventFields = await resolveOrderPreviewEventFields();
          html = buildOrderEmail({ ...SAMPLE_ORDER_EMAIL_DATA, ...eventFields, templateConfig });
          subject = "[PRUEBA] Tu compra fue confirmada";
          break;
        }
        case "missionTopup": {
          const eventFields = await resolveMissionTopupPreviewEventFields();
          html = buildMissionTopupEmail({ ...SAMPLE_MISSION_TOPUP_DATA, ...eventFields });
          subject = "[PRUEBA] Casi -- falta completar tu diferencia";
          break;
        }
        case "pendingReminder":
          html = buildPendingReminderEmail(SAMPLE_PENDING_REMINDER_DATA);
          subject = "[PRUEBA] Qued\xF3 pendiente tu acceso";
          break;
        case "gift":
          html = buildGiftEmail(SAMPLE_GIFT_DATA);
          subject = "[PRUEBA] Te invitaron un trago";
          break;
      }
      const result = await sendEmail({ to: input.toEmail, subject, html });
      if (!result.success) throw new Error("Resend rechaz\xF3 el env\xEDo -- revisa la configuraci\xF3n de RESEND_API_KEY/RESEND_FROM_EMAIL en Vercel.");
      return { success: true };
    })
  }),
  communityCodes: router({
    validate: publicProcedure.input(z6.object({
      code: z6.string()
    })).mutation(async ({ input }) => {
      return validateCommunityCode(input.code);
    }),
    // Admin
    listAll: adminReadProcedure.query(async () => {
      return getAllCommunityCodes();
    }),
    create: adminProcedure2.input(z6.object({
      code: z6.string(),
      label: z6.string().optional(),
      maxUses: z6.number().optional()
    })).mutation(async ({ input }) => {
      return createCommunityCode(input);
    }),
    update: adminProcedure2.input(z6.object({
      id: z6.number(),
      code: z6.string().optional(),
      label: z6.string().optional(),
      maxUses: z6.number().optional(),
      isActive: z6.number().optional()
    })).mutation(async ({ input }) => {
      const { id, ...data } = input;
      return updateCommunityCode(id, data);
    }),
    delete: adminPasswordProcedure.input(z6.object({ id: z6.number() })).mutation(async ({ input, ctx }) => {
      const result = await deleteCommunityCode(input.id);
      await recordAdminAudit({ action: "communityCodes.delete", targetType: "communityCode", targetId: input.id, ip: clientIp(ctx) });
      return result;
    })
  }),
  leads: router({
    // Público: se llama desde LeadCaptureInline en Home.tsx, sin login.
    create: publicProcedure.input(z6.object({
      email: z6.string().email(),
      phone: z6.string().optional(),
      instagram: z6.string().optional(),
      eventId: z6.number().optional(),
      source: z6.string().optional(),
      utmSource: z6.string().optional(),
      utmMedium: z6.string().optional(),
      utmCampaign: z6.string().optional()
    })).mutation(async ({ input }) => {
      return createLead(input);
    }),
    // Admin
    listAll: adminReadProcedure.query(async () => {
      return getAllLeads();
    }),
    delete: adminPasswordProcedure.input(z6.object({ id: z6.number() })).mutation(async ({ input, ctx }) => {
      const result = await deleteLead(input.id);
      await recordAdminAudit({ action: "leads.delete", targetType: "lead", targetId: input.id, ip: clientIp(ctx) });
      return result;
    }),
    // Convierte los leads sin convertir en audiencia de mailing (ver
    // db.syncLeadsAsMailingAudience) -- devuelve filas de `customers` para
    // que el selector de audiencia del admin no necesite ningún cambio.
    syncAsAudience: adminProcedure2.input(z6.object({ eventId: z6.number().optional() }).optional()).mutation(async ({ input }) => {
      return syncLeadsAsMailingAudience2({ eventId: input?.eventId });
    })
  }),
  // Gastos de la productora (módulo /gastos). El neto, el IVA y el mes
  // contable NO se reciben del cliente: los calcula el servidor en
  // buildExpenseValues, para que no se pueda inventar crédito fiscal desde el
  // navegador.
  expenses: router({
    listAll: adminReadProcedure.input(z6.object({
      eventId: z6.number().optional(),
      monthKey: z6.string().optional(),
      scope: z6.enum(["evento", "general"]).optional(),
      category: z6.string().optional()
    }).optional()).query(async ({ input }) => {
      return listExpenses(input ?? {});
    }),
    create: adminProcedure2.input(expenseInputSchema).mutation(async ({ input, ctx }) => {
      return createExpense({ ...input, createdByUserId: ctx.user.id });
    }),
    update: adminPasswordProcedure.input(expenseInputSchema.partial().extend({ id: z6.number() })).mutation(async ({ input, ctx }) => {
      const { id, adminPassword: _pw, ...data } = input;
      const result = await updateExpense(id, data);
      await recordAdminAudit({ action: "expenses.update", targetType: "expense", targetId: id, eventId: data.eventId ?? null, payload: data, ip: clientIp(ctx) });
      return result;
    }),
    delete: adminPasswordProcedure.input(z6.object({ id: z6.number() })).mutation(async ({ input, ctx }) => {
      const result = await deleteExpense(input.id);
      await recordAdminAudit({ action: "expenses.delete", targetType: "expense", targetId: input.id, ip: clientIp(ctx) });
      return result;
    })
  }),
  // Lista de bloqueo de clientes (por RUT) -- solo admin, nunca expuesta al
  // checkout público (el chequeo en sí vive dentro de orders.create/createOrder).
  blockedCustomers: router({
    listAll: adminReadProcedure.query(async () => {
      return getAllBlockedCustomers();
    }),
    create: adminProcedure2.input(z6.object({
      rut: z6.string().min(1),
      fullName: z6.string().optional(),
      reason: z6.string().optional()
    })).mutation(async ({ input }) => {
      return createBlockedCustomer(input);
    }),
    update: adminProcedure2.input(z6.object({
      id: z6.number(),
      rut: z6.string().optional(),
      fullName: z6.string().optional(),
      reason: z6.string().optional(),
      isActive: z6.number().optional()
    })).mutation(async ({ input }) => {
      const { id, ...data } = input;
      return updateBlockedCustomer(id, data);
    }),
    delete: adminPasswordProcedure.input(z6.object({ id: z6.number() })).mutation(async ({ input, ctx }) => {
      const result = await deleteBlockedCustomer(input.id);
      await recordAdminAudit({ action: "blockedCustomers.delete", targetType: "blockedCustomer", targetId: input.id, ip: clientIp(ctx) });
      return result;
    })
  }),
  referrals: router({
    getStats: adminReadProcedure.query(async () => {
      return getReferralStats();
    }),
    // Público, sin login: el mismo código de embajador que llega por email
    // es lo que valida el acceso a las propias estadísticas.
    getByCode: publicProcedure.input(z6.object({ code: z6.string() })).query(async ({ input }) => {
      return getReferralsByCode(input.code);
    }),
    // Público, para el Hall de la Fama -- solo primer nombre + código +
    // cantidad de ventas, nunca montos ni apellido (ver db.getReferralLeaderboard).
    getLeaderboard: publicProcedure.input(z6.object({ eventId: z6.number() })).query(async ({ input }) => {
      return getReferralLeaderboard(input.eventId);
    })
  }),
  // Embajadores exclusivos con comisión (pedido explícito del usuario) --
  // tab aparte de "Referidos" (arriba), para embajadores dados de alta a
  // mano que cobran una comisión en plata por venta, no descuento.
  ambassadors: router({
    listAll: adminReadProcedure.input(z6.object({ eventId: z6.number().optional() }).optional()).query(async ({ input }) => {
      return listExclusiveAmbassadors(input?.eventId);
    }),
    create: adminProcedure2.input(z6.object({
      // Opcional: el código es permanente y de la persona, no del evento.
      eventId: z6.number().optional(),
      name: z6.string().min(1),
      code: z6.string().min(1),
      // `null` = usar la escala global del programa (lo normal).
      commissionPercent: z6.number().min(0).max(100).nullable().optional(),
      contact: z6.string().optional(),
      email: z6.string().email().optional(),
      instagram: z6.string().optional()
    })).mutation(async ({ input }) => {
      return createExclusiveAmbassador(input);
    }),
    update: adminProcedure2.input(z6.object({
      id: z6.number(),
      name: z6.string().optional(),
      code: z6.string().optional(),
      commissionPercent: z6.number().min(0).max(100).nullable().optional(),
      contact: z6.string().optional(),
      email: z6.string().email().optional(),
      instagram: z6.string().optional(),
      active: z6.number().optional()
    })).mutation(async ({ input }) => {
      const { id, ...data } = input;
      return updateExclusiveAmbassador(id, data);
    }),
    delete: adminPasswordProcedure.input(z6.object({ id: z6.number() })).mutation(async ({ input, ctx }) => {
      const result = await deleteExclusiveAmbassador(input.id);
      await recordAdminAudit({ action: "ambassadors.delete", targetType: "ambassador", targetId: input.id, ip: clientIp(ctx) });
      return result;
    }),
    // Reporte histórico por evento (el del PR original). Se conserva porque
    // sigue siendo la forma de saber cuánto se pagó en una fiesta puntual.
    // --- Programa VIP automatizado ---
    /** Panel público del embajador (/embajador/<CODIGO>). El código hace de
     * llave -- no hay login de embajadores, mismo criterio que /mis-referidos. */
    getPanelByCode: publicProcedure.input(z6.object({ code: z6.string() })).query(async ({ input }) => {
      return getAmbassadorPanel(input.code);
    }),
    getConfig: adminReadProcedure.query(async () => {
      return getProgramConfig();
    }),
    updateConfig: adminProcedure2.input(z6.object({
      launchDate: z6.string().optional(),
      commissionScale: z6.array(z6.object({
        minSales: z6.number().int().min(1),
        maxSales: z6.number().int().min(1).nullable(),
        percent: z6.number().min(0).max(100)
      })).optional(),
      existingClientPercent: z6.number().min(0).max(100).optional(),
      benefits: z6.array(z6.object({
        minSales: z6.number().int().min(1),
        items: z6.array(z6.string()),
        bonusClp: z6.number().min(0)
      })).optional(),
      weeklyEmailEnabled: z6.boolean().optional(),
      weeklyEmailWeekday: z6.number().int().min(0).max(6).optional(),
      weeklyEmailHourChile: z6.number().int().min(0).max(23).optional()
    })).mutation(async ({ input }) => {
      const { launchDate, ...rest } = input;
      return updateProgramConfig({
        ...rest,
        ...launchDate ? { launchDate: new Date(launchDate) } : {}
      });
    }),
    /** `monthKey` en formato "2026-08"; si no viene, el mes actual de Chile. */
    getSummary: adminReadProcedure.input(z6.object({ monthKey: z6.string().optional() }).optional()).query(async ({ input }) => {
      return getAmbassadorAdminSummary(input?.monthKey || monthKeyFor(/* @__PURE__ */ new Date()));
    }),
    getRanking: adminReadProcedure.input(z6.object({ monthKey: z6.string().optional() }).optional()).query(async ({ input }) => {
      return getAmbassadorRanking(input?.monthKey || monthKeyFor(/* @__PURE__ */ new Date()));
    }),
    getProfile: adminReadProcedure.input(z6.object({ id: z6.number(), monthKey: z6.string().optional() })).query(async ({ input }) => {
      const monthKey = input.monthKey || monthKeyFor(/* @__PURE__ */ new Date());
      return {
        stats: await getAmbassadorStats(input.id, monthKey),
        sales: await getAmbassadorSales(input.id)
      };
    }),
    listReferredClients: adminReadProcedure.query(async () => {
      return listReferredClients();
    }),
    // --- Beneficios entregados ---
    listBenefitDeliveries: adminReadProcedure.input(z6.object({ monthKey: z6.string().optional() }).optional()).query(async ({ input }) => {
      return listBenefitDeliveries(input?.monthKey || monthKeyFor(/* @__PURE__ */ new Date()));
    }),
    markBenefitDelivered: adminProcedure2.input(z6.object({
      ambassadorId: z6.number(),
      monthKey: z6.string(),
      benefitKey: z6.string(),
      note: z6.string().optional()
    })).mutation(async ({ input }) => {
      return markBenefitDelivered(input);
    }),
    unmarkBenefitDelivered: adminProcedure2.input(z6.object({
      ambassadorId: z6.number(),
      monthKey: z6.string(),
      benefitKey: z6.string()
    })).mutation(async ({ input }) => {
      return unmarkBenefitDelivered(input);
    }),
    // --- Material de la semana ---
    getWeeklyMaterial: adminReadProcedure.query(async () => {
      return getWeeklyMaterial();
    }),
    saveWeeklyMaterial: adminProcedure2.input(z6.object({
      title: z6.string().optional(),
      storiesText: z6.string().optional(),
      reelText: z6.string().optional(),
      postText: z6.string().optional(),
      countdownText: z6.string().optional(),
      linkUrl: z6.string().optional()
    })).mutation(async ({ input }) => {
      return saveWeeklyMaterial(input);
    }),
    /** Rellena los 5 campos del material a partir de una idea. NO guarda: el
     * dueño revisa y edita antes de apretar "Guardar", igual que en mailing. */
    generateWeeklyMaterial: adminProcedure2.input(z6.object({
      idea: z6.string().min(5).max(1e3)
    })).mutation(async ({ input }) => {
      try {
        return await generateWeeklyMaterial(input.idea);
      } catch (err) {
        throw new TRPCError3({ code: "INTERNAL_SERVER_ERROR", message: err instanceof Error ? err.message : "No se pudo generar el material." });
      }
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
    submit: publicProcedure.input(z6.object({
      name: z6.string(),
      email: z6.string().email("Revisa tu correo"),
      whatsapp: z6.string(),
      instagram: z6.string(),
      followers: z6.string().optional(),
      message: z6.string().optional(),
      acceptedTerms: z6.boolean()
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
      if (!input.followers?.trim()) {
        throw new TRPCError3({ code: "BAD_REQUEST", message: "Escribe tu cantidad de seguidores" });
      }
      const seguidores = sanitizeFollowers(input.followers);
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
      await sendPushToAdmins("pushAmbassadorApplication", {
        title: "\u{1F451} Nueva postulaci\xF3n a embajador",
        body: `${nombre.value} \u2014 @${ig.value}`,
        url: "/admin"
      });
      return { ok: true, alreadyPending: false };
    }),
    listAll: adminReadProcedure.input(z6.object({
      status: z6.enum(["pendiente", "aprobada", "rechazada"]).optional()
    }).optional()).query(async ({ input }) => {
      return listApplications(input?.status);
    }),
    countPending: adminReadProcedure.query(async () => {
      return countPendingApplications();
    }),
    review: adminProcedure2.input(z6.object({
      id: z6.number(),
      status: z6.enum(["pendiente", "aprobada", "rechazada"]),
      note: z6.string().optional()
    })).mutation(async ({ input }) => {
      return reviewApplication(input);
    }),
    /** Aprueba y crea al embajador en un solo paso, con el código que escribe
     * el admin, y le manda su código por correo. */
    approve: adminProcedure2.input(z6.object({
      id: z6.number(),
      code: z6.string().min(1),
      commissionPercent: z6.number().min(0).max(100).nullable().optional()
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
    enrollDevice: publicProcedure.input(z6.object({ code: z6.string().min(1) })).mutation(async ({ input, ctx }) => {
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
    // dispositivo enrolado (deviceProcedure), y solo muestra operadores del
    // mismo evento al que el dispositivo fue enrolado.
    listOperators: deviceProcedure.query(async ({ ctx }) => {
      return listActiveOperatorsPublic(ctx.device.eventId);
    }),
    login: deviceProcedure.input(z6.object({ operatorId: z6.number(), pin: z6.string().min(4).max(8) })).mutation(async ({ input, ctx }) => {
      const operator = await verifyOperatorPinOrThrow(ctx, input.operatorId, input.pin);
      if (operator.eventId !== ctx.device.eventId) {
        throw new TRPCError3({ code: "UNAUTHORIZED", message: "Este operador no pertenece al evento de este dispositivo" });
      }
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
    //
    // Antes usaba una heurística global (evento publicado con fecha más
    // cercana a hoy), lo que podía cruzar catálogos entre dos eventos
    // "published" simultáneos durante el cambio de fiesta. Ahora resuelve
    // directo desde el evento al que el dispositivo fue enrolado -- es un
    // arreglo de comportamiento, no solo plumbing.
    // Si el evento real del dispositivo está FUERA de su horario de fiesta
    // (puertas/fin de evento, `isPartyWindowOpen`), se vende contra un
    // evento de pruebas permanente en su lugar -- así ninguna venta de
    // prueba (probando días antes/después del evento real) contamina el
    // dashboard/P&L del evento real, sin tocar ninguna de esas fórmulas
    // (todas ya filtran por eventId, y acá cambia el eventId, no ellas).
    // El operador/registro siguen siendo los del dispositivo real: nada
    // los valida contra el eventId de la venta (ver server/caja/sale.ts).
    activeEvent: operatorProcedure.query(async ({ ctx }) => {
      if (!ctx.device) throw new TRPCError3({ code: "FORBIDDEN", message: "Este dispositivo no est\xE1 enrolado" });
      const real = await getEventById(ctx.device.eventId);
      if (real && isPartyWindowOpen(real)) return real;
      return getOrCreateCajaTestEvent();
    }),
    dashboard: operatorProcedure.input(z6.object({ eventId: z6.number() })).query(async ({ input }) => {
      return getCajaDashboard(input.eventId);
    }),
    // Descarga completa para el modo offline (docs/ARQUITECTURA-CAJA.md
    // §6.2) -- la tablet la guarda en IndexedDB al abrir turno y la
    // refresca cada 60s cuando hay conexión.
    snapshot: operatorProcedure.input(z6.object({ eventId: z6.number() })).query(async ({ input }) => {
      return getCajaSnapshot(input.eventId);
    }),
    // Procesa un lote de operaciones encoladas offline (§7) -- reutiliza
    // exactamente la misma lógica idempotente (applyOp) que los endpoints
    // online `redeem`/`sale`, así que reenviar el mismo opId nunca duplica nada.
    sync: operatorProcedure.input(z6.object({
      eventId: z6.number(),
      registerId: z6.number().optional(),
      ops: z6.array(z6.discriminatedUnion("type", [
        z6.object({ type: z6.literal("redeem"), opId: z6.string(), displayCode: z6.string(), clientAt: z6.string() }),
        z6.object({ type: z6.literal("checkin"), opId: z6.string(), ticketCode: z6.string(), clientAt: z6.string() }),
        z6.object({
          type: z6.literal("sale"),
          opId: z6.string(),
          items: z6.array(z6.object({ ticketTypeId: z6.number(), quantity: z6.number().min(1) })).min(1),
          paymentMethod: z6.enum(["efectivo", "debito", "credito", "qr"]),
          buyerEmail: z6.string().email().optional(),
          redeemPlaycoins: z6.number().int().min(0).optional(),
          discountCode: z6.string().optional(),
          lockerTag: z6.string().max(16).optional(),
          lockerCustomerName: z6.string().max(120).optional(),
          kitchenTicketNumber: z6.string().max(12).optional(),
          customerName: z6.string().max(60).optional(),
          clientAt: z6.string()
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
              redeemPlaycoins: op.redeemPlaycoins,
              discountCode: op.discountCode,
              lockerTag: op.lockerTag,
              lockerCustomerName: op.lockerCustomerName,
              kitchenTicketNumber: op.kitchenTicketNumber,
              customerName: op.customerName
            });
          }
        } catch (err) {
          results[op.opId] = { result: "rejected", conflictNote: friendlySyncErrorMessage(err, op.opId) };
        }
      }
      return results;
    }),
    // Selección de caja física al abrir turno (§10.2.1).
    listRegisters: operatorProcedure.query(async ({ ctx }) => {
      if (!ctx.device) throw new TRPCError3({ code: "FORBIDDEN", message: "Este dispositivo no est\xE1 enrolado" });
      return listActiveRegisters(ctx.device.eventId);
    }),
    // Turno abierto de ESTA caja, según el servidor. Es la fuente de verdad:
    // antes el cliente solo miraba `sessionStorage`, que se borra cuando la
    // tablet reinicia la PWA (pantalla bloqueada un rato largo, otra app en
    // primer plano, pestaña cerrada) -- y ahí le volvía a pedir el efectivo
    // inicial a la cajera aunque el turno siguiera abierto en la base. Ese
    // era el bug que reportó el dueño del evento pasado.
    currentShift: operatorProcedure.input(z6.object({
      registerId: z6.number().optional()
    })).query(async ({ input, ctx }) => {
      if (!ctx.device) throw new TRPCError3({ code: "FORBIDDEN", message: "Este dispositivo no est\xE1 enrolado" });
      const shift = await getOpenShift(ctx.device.eventId, input.registerId);
      if (!shift) return null;
      return {
        shiftId: shift.id,
        openingCash: Number(shift.openingCash),
        openedAt: shift.openedAt,
        openedByOperatorId: shift.operatorId
      };
    }),
    // Apertura de turno con cuadre de caja (pedido explícito del usuario):
    // pide el efectivo inicial declarado por la cajera. Idempotente por
    // evento+caja (un refresh de página no duplica el turno abierto).
    shiftOpen: operatorProcedure.input(z6.object({
      opId: z6.string(),
      eventId: z6.number(),
      registerId: z6.number().optional(),
      openingCash: z6.number().min(0),
      clientAt: z6.string()
    })).mutation(async ({ input, ctx }) => {
      const rawDb = await getDb();
      if (!rawDb) throw new TRPCError3({ code: "INTERNAL_SERVER_ERROR", message: "Base de datos no disponible" });
      if (!ctx.operator) throw new TRPCError3({ code: "UNAUTHORIZED" });
      const opened = await openShift({
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
        targetId: String(opened.shiftId),
        // `declaredCash` es lo que la cajera acaba de contar; `openingCash`
        // es el que quedó vigente. Cuando el turno ya estaba abierto los dos
        // difieren, y el ledger tiene que mostrar esa diferencia en vez de
        // registrar un fondo que nunca se aplicó.
        payload: {
          openingCash: opened.openingCash,
          declaredCash: input.openingCash,
          alreadyOpen: opened.alreadyOpen,
          shiftId: opened.shiftId
        },
        clientAt: new Date(input.clientAt)
      }, async () => ({ result: "applied" }));
      return opened;
    }),
    // Protocolo de pendientes (§13, riesgo 2): el cliente NO debe llamar esto
    // con ops sin sincronizar -- se bloquea en la UI, no acá, porque cerrar
    // el turno es una decisión operativa, no algo que el servidor pueda ver.
    // Pide efectivo TOTAL contado (no la diferencia) + totales de débito y
    // crédito de las máquinas, hace el cuadre contra las ventas registradas
    // (solo canal caja, nunca web) y manda el informe final por correo.
    shiftClose: operatorProcedure.input(z6.object({
      opId: z6.string(),
      eventId: z6.number(),
      registerId: z6.number().optional(),
      countedCash: z6.number().min(0),
      countedDebit: z6.number().min(0),
      countedCredit: z6.number().min(0),
      countedQr: z6.number().min(0).optional(),
      clientAt: z6.string()
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
        countedCredit: input.countedCredit,
        countedQr: input.countedQr
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
      let emailSent = false;
      try {
        const pdf = await buildShiftClosePdf(report);
        const attachments = [{ filename: `cierre-turno-${report.registerName}.pdf`, content: pdf }];
        const html = buildShiftCloseEmail(report);
        const subject = `[Cierre de turno] ${report.eventTitle} \u2014 ${report.registerName}`;
        const recipients = [SHIFT_CLOSE_REPORT_EMAIL, ...report.operatorEmail ? [report.operatorEmail] : []];
        const results = await Promise.all(
          recipients.map((to) => sendEmail({ to, subject, html, attachments }))
        );
        emailSent = results.every((r) => r.success);
      } catch (err) {
        console.error("[shiftClose] Error al enviar el correo de cierre:", err);
      }
      return { ...report, emailSent };
    }),
    // Anulación con motivo -- solo supervisor/admin (docs/ARQUITECTURA-CAJA.md §3.2).
    voidCode: supervisorProcedure.input(z6.object({
      opId: z6.string(),
      eventId: z6.number(),
      displayCode: z6.string().min(1),
      reason: z6.string().min(3, "El motivo es obligatorio"),
      registerId: z6.number().optional(),
      clientAt: z6.string()
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
    conflictQueue: supervisorProcedure.input(z6.object({ eventId: z6.number() })).query(async ({ input }) => {
      return getConflictQueue(input.eventId);
    }),
    resolveConflict: supervisorProcedure.input(z6.object({
      opId: z6.string(),
      eventId: z6.number(),
      conflictOpId: z6.string(),
      note: z6.string().optional(),
      clientAt: z6.string()
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
    redeem: operatorProcedure.input(z6.object({
      opId: z6.string(),
      eventId: z6.number(),
      displayCode: z6.string().min(1),
      registerId: z6.number().optional(),
      clientAt: z6.string()
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
    checkin: operatorProcedure.input(z6.object({
      opId: z6.string(),
      eventId: z6.number(),
      ticketCode: z6.string().min(1),
      registerId: z6.number().optional(),
      clientAt: z6.string()
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
    // 'saldo' (pedido explícito del dueño): cubre el 100% del total o se
    // rechaza, nunca combinado con otro medio -- y SOLO se puede pagar
    // llamando este procedure directo (nunca por caja.sync, que no lo
    // acepta en su discriminatedUnion): el saldo exige conexión siempre, a
    // diferencia de efectivo/débito/crédito/qr, que sí viajan por la cola
    // offline. `cardPin` es requerido cuando paymentMethod==='saldo'.
    sale: operatorProcedure.input(z6.object({
      opId: z6.string(),
      eventId: z6.number(),
      items: z6.array(z6.object({ ticketTypeId: z6.number(), quantity: z6.number().min(1) })).min(1),
      paymentMethod: z6.enum(["efectivo", "debito", "credito", "qr", "saldo"]),
      registerId: z6.number().optional(),
      buyerEmail: z6.string().email().optional(),
      cardPin: z6.string().regex(/^\d{4}$/).optional(),
      redeemPlaycoins: z6.number().int().min(0).optional(),
      discountCode: z6.string().optional(),
      lockerTag: z6.string().max(16).optional(),
      lockerCustomerName: z6.string().max(120).optional(),
      kitchenTicketNumber: z6.string().max(12).optional(),
      customerName: z6.string().max(60).optional(),
      clientAt: z6.string()
    })).mutation(async ({ input, ctx }) => {
      if (input.paymentMethod === "saldo" && (!input.buyerEmail || !input.cardPin)) {
        throw new TRPCError3({ code: "BAD_REQUEST", message: "Pagar con saldo necesita el email y el PIN de la tarjeta" });
      }
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
          buyerEmail: input.buyerEmail,
          cardPin: input.cardPin,
          redeemPlaycoins: input.redeemPlaycoins,
          discountCode: input.discountCode,
          lockerTag: input.lockerTag,
          lockerCustomerName: input.lockerCustomerName,
          kitchenTicketNumber: input.kitchenTicketNumber,
          customerName: input.customerName,
          clientAt: new Date(input.clientAt)
        });
      } catch (err) {
        throw new TRPCError3({ code: "BAD_REQUEST", message: err instanceof Error ? err.message : "No se pudo registrar la venta" });
      }
    }),
    // Reset de datos de prueba de caja/cocina/guardarropía antes del
    // estreno real (pedido explícito del usuario, pensado para usarse las
    // veces que haga falta mientras siga probando). Ver db.resetEventTestData
    // para el detalle exacto de qué toca y qué deja intacto (nunca compras
    // web, check-ins de puerta ni canjes de extras).
    resetTestData: adminPasswordProcedure.input(z6.object({ eventId: z6.number() })).mutation(async ({ input, ctx }) => {
      const result = await resetEventTestData(input.eventId);
      await recordAdminAudit({ action: "caja.resetTestData", targetType: "event", targetId: input.eventId, eventId: input.eventId, payload: result, ip: clientIp(ctx) });
      return result;
    })
  }),
  // Gestión de operadores desde /admin (docs/ARQUITECTURA-CAJA.md §11).
  operators: router({
    listAll: adminReadProcedure.input(z6.object({ eventId: z6.number() })).query(async ({ input }) => {
      return listAllOperators(input.eventId);
    }),
    create: adminProcedure2.input(z6.object({
      eventId: z6.number(),
      name: z6.string().min(1),
      pin: z6.string().min(4).max(8),
      role: z6.enum(["admin", "supervisor", "caja", "barra", "acceso", "cocina", "guardarropia"]),
      // Opcional (pedido explícito del usuario): si está cargado, el cierre
      // de turno le manda el PDF de cuadre por correo a esta cajera.
      email: z6.string().email().optional()
    })).mutation(async ({ input }) => {
      const id = await createOperator({ eventId: input.eventId, name: input.name, pinHash: hashPin(input.pin), role: input.role, email: input.email });
      return { id };
    }),
    // `eventId` NO es editable acá a propósito: cada operador pertenece a un
    // solo evento (pedido explícito del usuario). Si trabaja en otra fiesta
    // se crea de nuevo ahí -- moverlo reasignaría silenciosamente su
    // historial pasado a otro evento.
    update: adminProcedure2.input(z6.object({
      id: z6.number(),
      name: z6.string().min(1).optional(),
      pin: z6.string().min(4).max(8).optional(),
      role: z6.enum(["admin", "supervisor", "caja", "barra", "acceso", "cocina", "guardarropia"]).optional(),
      active: z6.number().min(0).max(1).optional(),
      email: z6.string().email().nullable().optional()
    })).mutation(async ({ input }) => {
      const { id, pin, ...rest } = input;
      await updateOperator(id, { ...rest, ...pin ? { pinHash: hashPin(pin) } : {} });
      return { success: true };
    }),
    // Borrado real (pedido explícito del usuario: que no se vayan
    // acumulando) -- bloqueado si el operador ya tiene historial, ver
    // db.operatorHasHistory.
    delete: adminPasswordProcedure.input(z6.object({ id: z6.number() })).mutation(async ({ input, ctx }) => {
      try {
        const result = await deleteOperator(input.id);
        await recordAdminAudit({ action: "operators.delete", targetType: "operator", targetId: input.id, ip: clientIp(ctx) });
        return result;
      } catch (err) {
        throw new TRPCError3({ code: "BAD_REQUEST", message: err instanceof Error ? err.message : "No se pudo eliminar el operador." });
      }
    })
  }),
  // Base de datos de clientes desde /admin (pedido explícito del usuario).
  customers: router({
    listAll: adminReadProcedure.input(z6.object({
      search: z6.string().optional(),
      accessType: z6.string().optional(),
      tag: z6.string().optional(),
      excludeTags: z6.array(z6.string()).optional(),
      eventId: z6.number().optional()
    }).optional()).query(async ({ input }) => {
      return listCustomers(input ?? {});
    }),
    // Etiquetas existentes con su conteo -- alimenta los selectores de
    // "incluir/excluir etiqueta" al armar una campaña de mailing, para no
    // tener que escribir el nombre exacto de memoria.
    listTags: adminReadProcedure.query(async () => {
      return listCustomerTags();
    }),
    addTag: adminProcedure2.input(z6.object({ customerId: z6.number(), tag: z6.string().min(1) })).mutation(async ({ input }) => {
      await addCustomerTag(input.customerId, input.tag);
      return { success: true };
    }),
    // Marcar como "ya enviado" en masa desde un CSV externo (pedido
    // explícito del usuario, ej. el reporte de entregados de Resend, que
    // trae la columna "to") -- no crea clientes nuevos, solo taguea los que
    // ya existen; los que no matchean se devuelven en notFound.
    bulkTagFromCsv: adminProcedure2.input(z6.object({
      csv: z6.string().min(1),
      tag: z6.string().min(1)
    })).mutation(async ({ input }) => {
      const rows = parseCsv(input.csv);
      const emails = extractEmailColumn(rows, ["to", "email", "correo"]);
      if (emails.length === 0) {
        throw new TRPCError3({ code: "BAD_REQUEST", message: 'No se encontr\xF3 una columna "to"/"email" en el CSV.' });
      }
      return bulkAddTagByEmails(emails, input.tag);
    }),
    removeTag: adminProcedure2.input(z6.object({ customerId: z6.number(), tag: z6.string() })).mutation(async ({ input }) => {
      await removeCustomerTag(input.customerId, input.tag);
      return { success: true };
    }),
    // Ajuste manual de Playcoins (pedido explícito del usuario) -- para
    // migrar saldos de Shopify a mano o corregir.
    adjustPlaycoins: adminProcedure2.input(z6.object({ customerId: z6.number(), delta: z6.number().int(), note: z6.string().optional() })).mutation(async ({ input }) => {
      await adjustPlaycoinsManually(input.customerId, input.delta, input.note ?? "");
      return { success: true };
    })
  }),
  // Mailing masivo desde /admin → Clientes (pedido explícito del usuario):
  // la IA solo genera texto estructurado (server/mailing.ts), el HTML de
  // marca se arma siempre acá con buildMailingBlastEmail.
  mailing: router({
    generateTemplate: adminProcedure2.input(z6.object({
      objective: z6.string().min(5).max(1e3),
      audienceDescription: z6.string()
    })).mutation(async ({ input }) => {
      try {
        return await generateMailingTemplate(input.objective, input.audienceDescription);
      } catch (err) {
        throw new TRPCError3({ code: "INTERNAL_SERVER_ERROR", message: err instanceof Error ? err.message : "No se pudo generar la plantilla." });
      }
    }),
    renderPreview: adminProcedure2.input(z6.object({
      content: MailingContentSchema,
      ctaUrl: z6.string(),
      sampleName: z6.string().optional(),
      eventSections: mailingEventSectionsSchema
    })).mutation(async ({ input }) => {
      const eventInfo = Object.values(input.eventSections).some(Boolean) ? await getMailingEventInfo() : null;
      return {
        html: buildMailingBlastEmail({ ...input.content, buyerName: input.sampleName || "Camila", ctaUrl: input.ctaUrl, eventInfo, eventSections: input.eventSections })
      };
    }),
    sendBatch: adminProcedure2.input(z6.object({
      customerIds: z6.array(z6.number()).min(1).max(MAILING_BATCH_MAX),
      content: MailingContentSchema,
      ctaUrl: z6.string(),
      campaignTag: z6.string().optional(),
      eventSections: mailingEventSectionsSchema
    })).mutation(async ({ input }) => {
      const eventInfo = Object.values(input.eventSections).some(Boolean) ? await getMailingEventInfo() : null;
      const { batchId, results } = await sendMailingBatch(input.customerIds, input.content, input.ctaUrl, input.campaignTag, eventInfo, input.eventSections, "manual");
      return { batchId, results };
    }),
    // Cola de envío automática (pedido explícito del usuario): a diferencia
    // de sendBatch (manda ya mismo desde el navegador), esto solo guarda la
    // campaña -- el cron diario (server/cronRoutes.ts) la va drenando.
    createAutoCampaign: adminProcedure2.input(z6.object({
      name: z6.string().min(1),
      audienceDescription: z6.string(),
      customerIds: z6.array(z6.number()).min(1),
      content: MailingContentSchema,
      ctaUrl: z6.string(),
      eventSections: mailingEventSectionsSchema
    })).mutation(async ({ input }) => {
      try {
        return await createAutoMailingCampaign(input);
      } catch (err) {
        throw new TRPCError3({ code: "BAD_REQUEST", message: err instanceof Error ? err.message : "No se pudo crear la campa\xF1a." });
      }
    }),
    listCampaigns: adminReadProcedure.query(async () => {
      return listMailingCampaigns();
    }),
    getCampaignRecipients: adminReadProcedure.input(z6.object({ campaignId: z6.number() })).query(async ({ input }) => {
      return getMailingCampaignRecipients(input.campaignId);
    }),
    // Envíos inmediatos (aviso automático de primeros cupos + "Enviar a N
    // clientes") -- log aparte de mailingCampaigns/mailingRecipients, ver
    // mailingSendLog en drizzle/schema.ts.
    listRecentSendBatches: adminReadProcedure.query(async () => {
      return listRecentMailingSendBatches();
    }),
    getSendBatchDetail: adminReadProcedure.input(z6.object({ batchId: z6.string() })).query(async ({ input }) => {
      return getMailingSendLogForBatch(input.batchId);
    }),
    // Frena el drenaje del cron para una campaña todavía 'sending' (pedido
    // explícito del usuario: no había forma de cancelar una programada).
    cancelCampaign: adminProcedure2.input(z6.object({ campaignId: z6.number() })).mutation(async ({ input }) => {
      try {
        return await cancelMailingCampaign(input.campaignId);
      } catch (err) {
        throw new TRPCError3({ code: "BAD_REQUEST", message: err instanceof Error ? err.message : "No se pudo cancelar la campa\xF1a." });
      }
    }),
    // Aviso automático diario de "primeros cupos" (server/foundersPromo.ts,
    // pedido explícito del dueño). El on/off vive en settings.update
    // (siteSettings.foundersPromoEnabled) -- estos 3 son solo estado en
    // vivo, preview y disparo manual para probar antes de prender el cron.
    foundersPromoStatus: adminReadProcedure.query(async () => {
      return getFoundersPromoStatus();
    }),
    foundersPromoPreview: adminReadProcedure.query(async () => {
      const status = await getFoundersPromoStatus();
      if (status.remaining === null || !status.eventTitle) return { html: null, status };
      const event = await getFeaturedEvent();
      if (!event) return { html: null, status };
      return {
        html: buildMailingBlastEmail({
          ...buildFoundersPromoContent(status.remaining, event),
          buyerName: "Camila",
          ctaUrl: `${EMAIL_BASE_URL}/checkout/${event.slug}`,
          eventInfo: null
        }),
        status
      };
    }),
    // Dispara la corrida de hoy ya mismo (para probar, o para recuperar un
    // día si el cron no llegó a correr) -- misma función que usa el cron.
    foundersPromoRunNow: adminProcedure2.mutation(async () => {
      return runFoundersPromoDaily();
    })
  }),
  // Consulta pública de saldo de Playcoins (pedido explícito del usuario) --
  // sin login, igual que referrals.getByCode: el sitio no tiene cuentas de
  // comprador, el email es lo único necesario.
  playcoins: router({
    getBalanceByEmail: publicProcedure.input(z6.object({ email: z6.string().email() })).query(async ({ input }) => {
      return getPlaycoinsBalance(input.email);
    })
  }),
  // Saldo prepagado en PLATA de la tarjeta de membresía (pedido explícito del
  // dueño) -- distinto e independiente de Playcoins. VER el saldo es público
  // (mismo criterio que playcoins.getBalanceByEmail); GASTARLO exige PIN, y
  // eso vive en caja.sale, no acá. Nunca en /puerta -- decisión explícita del
  // dueño: el estacionamiento se paga como extra online o en la puerta con
  // efectivo/tarjeta, nunca con saldo.
  prepaid: router({
    // Define o cambia el PIN de la tarjeta. Público a propósito: la prueba de
    // identidad es haber pagado de verdad una carga de saldo con Mercado
    // Pago (verificado adentro por orderNumber+paymentStatus), no una
    // sesión -- ver server/db.ts setCardPinAfterTopup.
    //
    // Límite por IP acá, ADEMÁS del límite por cliente que ya tiene
    // setCardPinAfterTopup para cuando se CAMBIA un PIN existente (clave
    // `cardpin:<customerId>`, ver server/db.ts): ese límite no protegía para
    // nada la primera vez que se define el PIN (cardPinHash todavía null),
    // que es la rama que este endpoint toma la mayoría de las veces -- ahí
    // la única prueba de identidad es acertar un orderNumber aprobado con
    // una carga de saldo, y antes se podía probar sin ningún freno. Mismo
    // mecanismo y misma clave (`checkIpRateLimit`/`recordIpFailedAttempt`,
    // 15 intentos / 15 min) que ya usa el login por PIN de operador acá
    // arriba (verifyOperatorPinOrThrow) -- nada nuevo que mantener. Un
    // comprador legítimo llama esto una sola vez, apenas se aprueba su pago
    // (ver Checkout.tsx), así que nunca lo nota.
    setCardPinAfterTopup: publicProcedure.input(z6.object({
      orderNumber: z6.string().min(1),
      pin: z6.string().regex(/^\d{4}$/, "El PIN debe tener 4 d\xEDgitos"),
      currentPin: z6.string().regex(/^\d{4}$/).optional()
    })).mutation(async ({ input, ctx }) => {
      const ipKey = `cardpin-set:${clientIp(ctx)}`;
      if (!await checkIpRateLimit(ipKey)) {
        throw new TRPCError3({ code: "TOO_MANY_REQUESTS", message: "Demasiados intentos -- espera unos minutos." });
      }
      try {
        return await setCardPinAfterTopup(input);
      } catch (err) {
        await recordIpFailedAttempt(ipKey);
        throw new TRPCError3({ code: "BAD_REQUEST", message: err instanceof Error ? err.message : "No se pudo definir el PIN." });
      }
    })
  }),
  // Resumen de la tarjeta digital para /verificar/:ticketCode (saldo +
  // Playcoins + movimientos recientes) -- público, mismo criterio que
  // tickets.getByCode: el QR/link ya es la prueba de posesión de la entrada.
  wallet: router({
    getByTicketCode: publicProcedure.input(z6.object({ ticketCode: z6.string() })).query(async ({ input }) => {
      return getWalletForTicket(input.ticketCode);
    })
  }),
  // Enrolamiento de dispositivos desde /admin (pedido explícito del usuario).
  devices: router({
    listAll: adminReadProcedure.input(z6.object({ eventId: z6.number() })).query(async ({ input }) => {
      return listAllDevices(input.eventId);
    }),
    // Genera un código de un solo uso (vence a las 24h) para enrolar una
    // tablet nueva -- se muestra una sola vez en el admin, no se puede
    // recuperar después (mismo criterio que un PIN).
    create: adminProcedure2.input(z6.object({ eventId: z6.number(), name: z6.string().min(1) })).mutation(async ({ input }) => {
      const code = generateEnrollCode();
      const id = await createDeviceEnrollment(input.eventId, input.name, code, enrollCodeExpiry());
      return { id, enrollCode: code };
    }),
    setActive: adminProcedure2.input(z6.object({ id: z6.number(), active: z6.number().min(0).max(1) })).mutation(async ({ input }) => {
      await updateDeviceActive(input.id, input.active);
      return { success: true };
    }),
    // Ningún dispositivo queda referenciado desde otra tabla (ver
    // db.deleteDevice), así que este borrado nunca se bloquea por historial.
    delete: adminPasswordProcedure.input(z6.object({ id: z6.number() })).mutation(async ({ input, ctx }) => {
      try {
        const result = await deleteDevice(input.id);
        await recordAdminAudit({ action: "devices.delete", targetType: "device", targetId: input.id, ip: clientIp(ctx) });
        return result;
      } catch (err) {
        throw new TRPCError3({ code: "BAD_REQUEST", message: err instanceof Error ? err.message : "No se pudo eliminar el dispositivo." });
      }
    })
  }),
  // Cajas físicas ("Caja 1", "Caja 2"...) desde /admin.
  registers: router({
    listAll: adminReadProcedure.input(z6.object({ eventId: z6.number() })).query(async ({ input }) => {
      return listAllRegisters(input.eventId);
    }),
    create: adminProcedure2.input(z6.object({ eventId: z6.number(), name: z6.string().min(1) })).mutation(async ({ input }) => {
      const id = await createRegister(input.eventId, input.name);
      return { id };
    }),
    delete: adminPasswordProcedure.input(z6.object({ id: z6.number() })).mutation(async ({ input, ctx }) => {
      try {
        const result = await deleteRegister(input.id);
        await recordAdminAudit({ action: "registers.delete", targetType: "register", targetId: input.id, ip: clientIp(ctx) });
        return result;
      } catch (err) {
        throw new TRPCError3({ code: "BAD_REQUEST", message: err instanceof Error ? err.message : "No se pudo eliminar la caja." });
      }
    })
  }),
  // Reportes y auditoría de /caja desde /admin (docs/ARQUITECTURA-CAJA.md §11, Fase 4).
  cajaReports: router({
    profit: adminReadProcedure.input(z6.object({ eventId: z6.number() })).query(async ({ input }) => {
      return getProfitReport(input.eventId);
    }),
    // IA: preguntas simples sobre ventas/movimientos, con los datos ya
    // agregados del sistema (ver server/adminQa.ts). adminProcedure (no
    // adminReadProcedure) porque dispara una llamada a IA con costo, mismo
    // criterio que mailing/recordatorios.
    askAi: adminProcedure2.input(z6.object({
      question: z6.string().min(3).max(500),
      eventId: z6.number().optional()
    })).mutation(async ({ input }) => {
      try {
        const answer = await answerSalesQuestion(input.question, input.eventId);
        return { answer };
      } catch (err) {
        throw new TRPCError3({ code: "INTERNAL_SERVER_ERROR", message: err instanceof Error ? err.message : "No se pudo generar la respuesta." });
      }
    }),
    kitchenVendorReport: adminReadProcedure.input(z6.object({ eventId: z6.number() })).query(async ({ input }) => {
      return getKitchenVendorReport(input.eventId);
    }),
    // Manda la rendición de cocina al proveedor cargado en Ajustes -- no
    // bloqueante si Resend falla, mismo criterio que shiftClose.
    sendKitchenVendorReport: adminProcedure2.input(z6.object({ eventId: z6.number() })).mutation(async ({ input }) => {
      const settings = await getSiteSettings();
      if (!settings.kitchenVendorEmail) {
        throw new TRPCError3({ code: "BAD_REQUEST", message: "Primero carga el email del proveedor de cocina en Ajustes." });
      }
      const event = await getEventById(input.eventId);
      const eventTitle = event?.title ?? `Evento #${input.eventId}`;
      const report = await getKitchenVendorReport(input.eventId);
      const vendorName = settings.kitchenVendorName || "Proveedor de cocina";
      const pdf = await buildKitchenVendorPdf({ eventTitle, vendorName, ...report });
      const html = buildKitchenVendorEmail({ eventTitle, vendorName, totalRevenue: report.totalRevenue, vendorShare: report.vendorShare, venueShare: report.venueShare });
      const attachments = [{ filename: `rendicion-cocina-${eventTitle}.pdf`, content: pdf }];
      const subject = `[Rendici\xF3n de cocina] ${eventTitle}`;
      const result = await sendEmail({ to: settings.kitchenVendorEmail, cc: ADMIN_NOTIFICATION_EMAIL, subject, html, attachments });
      return { success: true, emailSent: result.success };
    }),
    // Reporte consolidado de Ventas/Gastos por sub-tab (pedido explícito del
    // usuario: un solo botón que arma PDF+CSV+email en vez de uno por
    // tabla). El admin siempre recibe copia; `recipientEmails` son los
    // emails de staff elegidos a mano en el diálogo de envío.
    emailVentasReport: adminProcedure2.input(z6.object({
      eventId: z6.number(),
      recipientEmails: z6.array(z6.string().email()).default([])
    })).mutation(async ({ input }) => {
      const event = await getEventById(input.eventId);
      const eventTitle = event?.title ?? `Evento #${input.eventId}`;
      const rows = await getProfitReport(input.eventId);
      const totalRevenue = rows.reduce((s, r) => s + r.revenue, 0);
      const totalProfit = rows.reduce((s, r) => s + (r.profit ?? 0), 0);
      const pdf = await buildVentasReportPdf(eventTitle, rows);
      const html = buildSimpleReportEmail({
        title: `\u{1F4C8} Reporte de ventas \u2014 ${eventTitle}`,
        subtitle: `${rows.length} productos vendidos`,
        lines: [
          { label: "Ingresos totales", value: `$${Math.round(totalRevenue).toLocaleString("es-CL")}` },
          { label: "Utilidad total", value: `$${Math.round(totalProfit).toLocaleString("es-CL")}` }
        ]
      });
      const recipients = Array.from(/* @__PURE__ */ new Set([ADMIN_NOTIFICATION_EMAIL, ...input.recipientEmails]));
      const attachments = [{ filename: `ventas-${eventTitle}.pdf`, content: pdf }];
      const results = await Promise.all(recipients.map((to) => sendEmail({ to, subject: `[Reporte de ventas] ${eventTitle}`, html, attachments })));
      return { success: true, emailSent: results.every((r) => r.success) };
    }),
    emailGastosReport: adminProcedure2.input(z6.object({
      eventId: z6.number(),
      recipientEmails: z6.array(z6.string().email()).default([])
    })).mutation(async ({ input }) => {
      const event = await getEventById(input.eventId);
      const eventTitle = event?.title ?? `Evento #${input.eventId}`;
      const rows = await listExpenses({ eventId: input.eventId });
      const total = rows.reduce((s, r) => s + r.amountTotal, 0);
      const pdf = await buildGastosReportPdf(eventTitle, rows);
      const html = buildSimpleReportEmail({
        title: `\u{1F4B8} Reporte de gastos \u2014 ${eventTitle}`,
        subtitle: `${rows.length} gastos registrados`,
        lines: [{ label: "Total gastado", value: `$${Math.round(total).toLocaleString("es-CL")}` }]
      });
      const recipients = Array.from(/* @__PURE__ */ new Set([ADMIN_NOTIFICATION_EMAIL, ...input.recipientEmails]));
      const attachments = [{ filename: `gastos-${eventTitle}.pdf`, content: pdf }];
      const results = await Promise.all(recipients.map((to) => sendEmail({ to, subject: `[Reporte de gastos] ${eventTitle}`, html, attachments })));
      return { success: true, emailSent: results.every((r) => r.success) };
    }),
    // `eventIds` opcional: sin filtro compara todos los eventos, con filtro
    // solo los seleccionados (selector de eventos del admin).
    eventComparison: adminReadProcedure.input(z6.object({ eventIds: z6.array(z6.number()).optional() }).optional()).query(async ({ input }) => {
      return getEventComparison(input?.eventIds);
    }),
    // Resultado REAL de un evento: a diferencia de `profit` (que es margen por
    // producto, sobre precios de lista), acá el ingreso es la plata que entró
    // de verdad y se restan todos los gastos, el IVA y las comisiones.
    eventPnl: adminReadProcedure.input(z6.object({ eventId: z6.number() })).query(async ({ input }) => {
      return getEventPnl(input.eventId);
    }),
    pnlComparison: adminReadProcedure.input(z6.object({ eventIds: z6.array(z6.number()).optional() }).optional()).query(async ({ input }) => {
      return getPnlComparison(input?.eventIds);
    }),
    parkingReport: adminReadProcedure.input(z6.object({ eventId: z6.number() })).query(async ({ input }) => {
      return getParkingReport(input.eventId);
    }),
    peakHours: adminReadProcedure.input(z6.object({ eventId: z6.number() })).query(async ({ input }) => {
      return getPeakHours(input.eventId);
    }),
    ledger: adminReadProcedure.input(z6.object({
      eventId: z6.number(),
      operatorId: z6.number().optional(),
      type: z6.string().optional(),
      dateFrom: z6.string().optional(),
      dateTo: z6.string().optional()
    })).query(async ({ input }) => {
      const { eventId, ...filters } = input;
      return getLedger(eventId, filters);
    }),
    // Cuadres de caja guardados (pedido explícito del usuario) -- sin
    // eventId trae los de todos los eventos, para comparar entre fiestas.
    shiftClosings: adminReadProcedure.input(z6.object({ eventId: z6.number().optional() }).optional()).query(async ({ input }) => {
      return listShiftClosings(input?.eventId);
    }),
    // Turnos todavía abiertos: los necesita el formulario de gastos para
    // ofrecer "se pagó con plata del cajón de esta caja". Sin marcarlo, ese
    // efectivo aparece como faltante en el arqueo de esa caja.
    // Suscripciones activas (gastos que se repiten todos los meses). Hoy no
    // se ven en ningún lado del panel: se marcan al crear el gasto y después
    // generan una copia cada mes sin que nadie pueda revisarlas ni darlas de
    // baja.
    recurringExpenses: adminReadProcedure.query(async () => {
      return listRecurringExpenses();
    }),
    // Bitácora de acciones destructivas del panel. Los terminales ya tenían
    // el ledger `ops`; el lado admin no dejaba ningún rastro.
    adminAudit: adminReadProcedure.input(z6.object({ limit: z6.number().min(1).max(500).optional() }).optional()).query(async ({ input }) => {
      return listAdminAudit(input?.limit ?? 200);
    }),
    openShifts: adminReadProcedure.input(z6.object({ eventId: z6.number().optional() }).optional()).query(async ({ input }) => {
      return listOpenShifts(input?.eventId);
    }),
    // Detalle venta por venta de un turno: con una diferencia grande, los
    // totales por medio de pago no alcanzan para explicarla -- hay que poder
    // comparar contra el voucher de la máquina línea por línea.
    shiftSales: adminReadProcedure.input(z6.object({ shiftId: z6.number() })).query(async ({ input }) => {
      return getShiftSales(input.shiftId);
    }),
    // Eliminar un cierre de turno (pedido explícito del usuario, para sacar
    // pruebas/cierres de práctica de los reportes reales) -- doble
    // verificación: además del diálogo de confirmación en el admin, pide la
    // misma clave que auth.adminLogin.
    // Antes comparaba la clave con `!==` (sin tiempo constante) y sin
    // ningún límite de intentos. Ahora usa el mismo procedure que el resto
    // de las acciones destructivas, para que el arreglo valga en todas.
    deleteShiftClosing: adminPasswordProcedure.input(z6.object({
      shiftId: z6.number()
    })).mutation(async ({ input, ctx }) => {
      const before = await getShiftSales(input.shiftId);
      const result = await deleteShiftClosing(input.shiftId);
      await recordAdminAudit({ action: "cajaReports.deleteShiftClosing", targetType: "shift", targetId: input.shiftId, payload: { salesCount: before?.sales.length ?? null }, ip: clientIp(ctx) });
      return result;
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
      operator = { operatorId: dbOperator.id, role: dbOperator.role, name: dbOperator.name, eventId: dbOperator.eventId };
    }
  }
  const deviceSessionPayload = await verifyDeviceSession(cookies[CAJA_DEVICE_COOKIE_NAME]);
  let device = null;
  if (deviceSessionPayload) {
    const dbDevice = await getDeviceById(deviceSessionPayload.deviceId);
    if (dbDevice && dbDevice.enrolled && dbDevice.active) {
      device = { deviceId: dbDevice.id, name: dbDevice.name, eventId: dbDevice.eventId };
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
var DB_CONNECTION_ERROR_PATTERN = /Failed query|ECONNRESET|ETIMEDOUT|ECONNREFUSED|PROTOCOL_CONNECTION_LOST|EPIPE|Too many connections|connection is in closed state|Unknown prepared statement/i;
function looksLikeDbConnectionError(error) {
  if (!error || typeof error !== "object") return false;
  const message = String(error.message ?? "");
  const causeMessage = String(error.cause?.message ?? "");
  return DB_CONNECTION_ERROR_PATTERN.test(message) || DB_CONNECTION_ERROR_PATTERN.test(causeMessage);
}
function createApp() {
  const app2 = express();
  app2.use(express.json({ limit: "10mb" }));
  app2.use(express.urlencoded({ limit: "10mb", extended: true }));
  registerOAuthRoutes(app2);
  registerAdminRoutes(app2);
  registerCronRoutes(app2);
  registerTicketAssetRoutes(app2);
  registerBlobUploadRoutes(app2);
  app2.use(webhooksRouter);
  app2.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
      onError({ error }) {
        if (looksLikeDbConnectionError(error) || looksLikeDbConnectionError(error.cause)) {
          resetDb();
        }
      }
    })
  );
  return app2;
}

// shared/structuredData.ts
var SITE_URL = "https://mansionplayroom.cl";
function eventSchema(event) {
  const schema = {
    "@context": "https://schema.org",
    "@type": "Event",
    name: event.name,
    startDate: event.startDate,
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    eventStatus: "https://schema.org/EventScheduled",
    location: {
      "@type": "Place",
      name: event.venueName ?? "La Mansi\xF3n",
      address: {
        "@type": "PostalAddress",
        addressLocality: event.locality ?? "Valpara\xEDso",
        addressRegion: event.region ?? "Regi\xF3n de Valpara\xEDso",
        addressCountry: "CL"
      }
    },
    organizer: {
      "@type": "Organization",
      name: "Mansion Playroom",
      url: `${SITE_URL}/`
    }
  };
  if (event.description) schema.description = event.description;
  if (event.endDate) schema.endDate = event.endDate;
  if (event.imageUrl) schema.image = event.imageUrl;
  const offer = {
    "@type": "Offer",
    url: `${SITE_URL}/eventos/${event.slug}`,
    availability: "https://schema.org/InStock"
  };
  if (event.priceFrom != null) {
    offer.price = String(event.priceFrom);
    offer.priceCurrency = "CLP";
  }
  schema.offers = offer;
  return schema;
}
function breadcrumbSchema(items) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.name,
      item: `${SITE_URL}${item.path}`
    }))
  };
}

// server/_core/htmlTemplate.ts
import fs from "node:fs";
import path from "node:path";
var cached = null;
function getIndexHtmlTemplate() {
  if (cached) return cached;
  const candidates = [
    path.resolve(process.cwd(), "dist/public/index.html"),
    path.resolve(process.cwd(), "client/index.html")
  ];
  for (const candidate of candidates) {
    try {
      cached = fs.readFileSync(candidate, "utf-8");
      return cached;
    } catch {
    }
  }
  throw new Error(
    "No se encontr\xF3 index.html (ni dist/public/ ni client/) -- corr\xE9 `vite build` o revis\xE1 el deploy."
  );
}
function escapeHtml(value) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function setMetaContent(html, attr, key, content) {
  const re = new RegExp(`(<meta\\s+${attr}="${key}"\\s+content=")[^"]*(")`, "i");
  return html.replace(re, (_match, pre, post) => `${pre}${escapeHtml(content)}${post}`);
}
function setTitle(html, title) {
  return html.replace(/<title>[^<]*<\/title>/i, `<title>${escapeHtml(title)}</title>`);
}
function setLinkHref(html, rel, href) {
  const re = new RegExp(`(<link\\s+rel="${rel}"\\s+href=")[^"]*(")`, "i");
  return html.replace(re, (_match, pre, post) => `${pre}${escapeHtml(href)}${post}`);
}
function injectMeta(html, overrides) {
  let out = html;
  if (overrides.title) out = setTitle(out, overrides.title);
  if (overrides.description) out = setMetaContent(out, "name", "description", overrides.description);
  if (overrides.ogTitle) out = setMetaContent(out, "property", "og:title", overrides.ogTitle);
  if (overrides.ogDescription) out = setMetaContent(out, "property", "og:description", overrides.ogDescription);
  if (overrides.ogUrl) out = setMetaContent(out, "property", "og:url", overrides.ogUrl);
  if (overrides.ogImage) out = setMetaContent(out, "property", "og:image", overrides.ogImage);
  if (overrides.twitterTitle) out = setMetaContent(out, "name", "twitter:title", overrides.twitterTitle);
  if (overrides.twitterDescription) out = setMetaContent(out, "name", "twitter:description", overrides.twitterDescription);
  if (overrides.twitterImage) out = setMetaContent(out, "name", "twitter:image", overrides.twitterImage);
  if (overrides.canonical) out = setLinkHref(out, "canonical", overrides.canonical);
  if (overrides.jsonLd && overrides.jsonLd.length > 0) {
    const script = `<script type="application/ld+json">${JSON.stringify(overrides.jsonLd)}</script>
  </head>`;
    out = out.replace(/<\/head>/i, script);
  }
  return out;
}

// server/ssrMeta.ts
var SITE_URL2 = "https://mansionplayroom.cl";
var DEFAULT_OG_IMAGE = `${SITE_URL2}/candyland/og-candyland.jpg`;
var DEFAULT_EVENT_DESCRIPTION = "Fiesta liberal en la Regi\xF3n de Valpara\xEDso: fecha, horario, accesos y entradas para tu pr\xF3xima noche con Mansion Playroom.";
var OG_IMAGE_CACHE_TTL_MS = 5 * 60 * 1e3;
var ogImageCache = null;
async function resolveDefaultOgImage() {
  if (ogImageCache && ogImageCache.expiresAt > Date.now()) return ogImageCache.value;
  const settings = await getSiteSettings();
  const value = settings.ogImageUrl || DEFAULT_OG_IMAGE;
  ogImageCache = { value, expiresAt: Date.now() + OG_IMAGE_CACHE_TTL_MS };
  return value;
}
function sendHtml(res, html) {
  res.set("Content-Type", "text/html; charset=utf-8");
  res.set("Cache-Control", "public, s-maxage=300, stale-while-revalidate=86400");
  res.send(html);
}
function loadTemplateOrFail(res) {
  try {
    return getIndexHtmlTemplate();
  } catch (err) {
    console.error("[ssrMeta] No se pudo leer index.html:", err);
    res.status(500).type("text/plain").send("Error interno. Prob\xE1 de nuevo en un momento.");
    return null;
  }
}
function registerSsrMetaRoutes(app2) {
  app2.get("/eventos/:slug", async (req, res) => {
    const template = loadTemplateOrFail(res);
    if (!template) return;
    try {
      const slug = req.params.slug;
      const event = await getEventBySlug(slug);
      if (!event) {
        return sendHtml(res, template);
      }
      const title = `${event.title} \u2014 Fiesta Liberal en Vi\xF1a del Mar | +18`;
      const description = event.shortDescription || DEFAULT_EVENT_DESCRIPTION;
      const image = event.imageUrl || await resolveDefaultOgImage();
      const url = `${SITE_URL2}/eventos/${event.slug}`;
      let priceFrom = null;
      try {
        const ticketTypes2 = await getTicketTypesByEventId(event.id);
        const accesos = ticketTypes2.filter((t2) => t2.category === "acceso");
        if (accesos.length > 0) priceFrom = Math.min(...accesos.map((t2) => Number(t2.price)));
      } catch {
      }
      const jsonLd = [
        eventSchema({
          name: event.title,
          description: event.shortDescription,
          startDate: new Date(event.eventDate).toISOString(),
          endDate: event.eventEnd ? new Date(event.eventEnd).toISOString() : null,
          slug: event.slug,
          imageUrl: event.imageUrl,
          priceFrom,
          venueName: event.venue ?? void 0
        }),
        breadcrumbSchema([
          { name: "Inicio", path: "/" },
          { name: "Eventos", path: "/eventos" },
          { name: event.title, path: `/eventos/${event.slug}` }
        ])
      ];
      const html = injectMeta(template, {
        title,
        description,
        ogTitle: event.title,
        ogDescription: description,
        ogUrl: url,
        ogImage: image,
        twitterTitle: event.title,
        twitterDescription: description,
        twitterImage: image,
        canonical: url,
        jsonLd
      });
      sendHtml(res, html);
    } catch (err) {
      console.error("[ssrMeta] /eventos/:slug fall\xF3, sirviendo template sin inyectar:", err);
      sendHtml(res, template);
    }
  });
  app2.get("*", async (req, res, next) => {
    if (req.path.startsWith("/api/")) return next();
    const template = loadTemplateOrFail(res);
    if (!template) return;
    try {
      const image = await resolveDefaultOgImage();
      const html = injectMeta(template, { ogImage: image, twitterImage: image });
      sendHtml(res, html);
    } catch (err) {
      console.error("[ssrMeta] catch-all fall\xF3, sirviendo template sin inyectar:", err);
      sendHtml(res, template);
    }
  });
}

// server/vercel-entry.ts
var app = createApp();
registerSsrMetaRoutes(app);
var vercel_entry_default = app;
export {
  vercel_entry_default as default
};
