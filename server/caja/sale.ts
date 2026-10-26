import { consumePayToken, releasePayToken } from '../memberPay';
import { eq, sql, inArray, and, ne, desc } from "drizzle-orm";
import { orders, orderItems, ticketTypes, discountCodes, lockerItems, kitchenTickets, customers } from "../../drizzle/schema";
import { applyOp } from "./ops";
import { ensureCustomerIdForEmail, awardPlaycoins, redeemPlaycoinsAuthoritative, validateDiscountCode, verifyCardPin, spendPrepaidAuthoritative } from "../db";
import { isTopupProduct } from "../../shared/prepaid";
import { computeCodeDiscount } from "../../shared/discountCode";
import { descontarVenta } from "../insumos";

/** Venta presencial en caja (docs/ARQUITECTURA-CAJA.md §0.4, §3.1.5): se
 * cobra en el terminal externo (fuera del sistema) y acá solo se registra --
 * `orders` con `channel='caja'`, aprobada al instante, sin email al cliente
 * (no hay a quién mandárselo: recibe el ticket físico en el momento) ni copia
 * a contacto@ (a pedido explícito: en la noche del evento pasan muchas
 * ventas por minuto, saturaría el correo -- esa copia queda solo para las
 * ventas web, ver processApprovedOrder en webhooks.ts). Se reutiliza
 * `orders`/`orderItems` en vez de una tabla `sales` aparte para que el
 * reporting/CSV/stats del admin ya existentes la vean sola. */
/** Placeholder histórico: antes TODAS las ventas de caja se guardaban con
 * este nombre, y la lista de ventas recientes no servía para encontrar nada. */
export const CAJA_FALLBACK_BUYER_NAME = "Venta en caja";

/** Nombre a guardar en `orders.buyerName` para una venta de caja (pedido
 * explícito del dueño: poder ubicar una venta por la persona). Prioridad: el
 * nombre registrado del cliente asociado por email/Playcoins → el nombre que
 * la cajera pidió para cocina → el de guardarropía → el placeholder. */
export function resolveCajaBuyerName(names: { knownName?: string | null; customerName?: string | null; lockerCustomerName?: string | null }): string {
  for (const candidate of [names.knownName, names.customerName, names.lockerCustomerName]) {
    const trimmed = candidate?.trim();
    if (trimmed && trimmed !== CAJA_FALLBACK_BUYER_NAME) return trimmed.slice(0, 255);
  }
  return CAJA_FALLBACK_BUYER_NAME;
}

/** Nombre conocido de un comprador por su email: primero la ficha de
 * `customers`, si no la última compra aprobada con un nombre real. Nunca
 * tira -- un nombre faltante no puede frenar un cobro. */
async function lookupKnownBuyerName(db: any, email: string | undefined): Promise<string | null> {
  const normalized = email?.trim().toLowerCase();
  if (!normalized) return null;
  try {
    const [customer] = await db.select({ fullName: customers.fullName }).from(customers).where(eq(customers.email, normalized)).limit(1);
    if (customer?.fullName?.trim()) return customer.fullName.trim();
    const [order] = await db.select({ buyerName: orders.buyerName }).from(orders)
      .where(and(eq(orders.buyerEmail, normalized), eq(orders.paymentStatus, "approved"), ne(orders.buyerName, CAJA_FALLBACK_BUYER_NAME)))
      .orderBy(desc(orders.createdAt)).limit(1);
    return order?.buyerName?.trim() || null;
  } catch (err) {
    console.error("[caja.sale] No se pudo resolver el nombre del comprador:", err);
    return null;
  }
}

export async function createCajaSale(
  db: any,
  params: {
    opId: string;
    eventId: number;
    operatorId: number;
    registerId?: number | null;
    items: { ticketTypeId: number; quantity: number }[];
    // 'saldo' (pedido explícito del dueño): cubre el 100% del total o
    // rechaza la venta ANTES de crearla -- nunca combinado con otro medio,
    // nunca parcial. Requiere buyerEmail+cardPin. A diferencia de los demás
    // medios, esta venta SOLO puede llegar acá por el procedure online
    // directo `caja.sale` -- nunca por `caja.sync` (ver server/routers.ts).
    paymentMethod: "efectivo" | "debito" | "credito" | "qr" | "saldo";
    clientAt: Date;
    // Playcoins (pedido explícito del usuario): captura opcional del email
    // del cliente para que la venta también gane puntos, y canje opcional de
    // puntos ya ganados como descuento del total.
    buyerEmail?: string;
    redeemPlaycoins?: number;
    // PIN de la tarjeta -- requerido solo cuando paymentMethod === 'saldo'.
    cardPin?: string;
    // QR de «Pagar en caja» de la app de socios (server/memberPay.ts): reemplaza al PIN.
    // Vence en 2 min, sirve una sola vez y va ligado al correo de buyerEmail.
    payToken?: string;
    // Código de descuento aplicado al carrito -- se revalida server-side con
    // la misma función que usa el checkout web (nunca se confía en el monto
    // que calculó la tablet).
    discountCode?: string;
    // Número de percha, generado EN LA TABLET (no acá) -- `<nº de caja>-
    // <correlativo local>`, ver client/src/pages/caja/db.ts
    // `nextLockerTagNumber`. Requerido si algún ítem es category='locker'.
    lockerTag?: string;
    // Nombre que la cajera le pide al cliente al vender guardarropía --
    // requerido junto con lockerTag, para poder ubicar la prenda por nombre.
    lockerCustomerName?: string;
    // Número de comanda para cocina, generado EN LA TABLET (no acá) --
    // `<nº de caja>-<correlativo local>`, ver client/src/pages/caja/db.ts
    // `nextKitchenTicketNumber`. Requerido si algún ítem es `toKitchen`.
    kitchenTicketNumber?: string;
    // Nombre que la cajera le pide al cliente al vender algo `toKitchen`
    // (pedido explícito del dueño) -- lo que ve cocina en pantalla en vez
    // del número, que es difícil de memorizar para ir a buscarlo.
    customerName?: string;
  }
) {
  if (params.items.length === 0) throw new Error("La venta necesita al menos un producto");

  const ticketTypeIds = params.items.map(i => i.ticketTypeId);
  const tts = await db.select().from(ticketTypes).where(inArray(ticketTypes.id, ticketTypeIds));
  const ttById = new Map<number, any>(tts.map((t: any) => [t.id, t]));

  let total = 0;
  const lineItems: { ticketTypeId: number; quantity: number; unitPrice: number; unitCost: number | null; name: string }[] = [];
  // El stock AVISA pero nunca bloquea (docs/ARQUITECTURA-CAJA.md §8 y decisión
  // explícita del dueño). Antes acá se lanzaba "Sin stock suficiente" y eso
  // era un problema real, no teórico: el inventario cargado en el admin
  // siempre termina desincronizado de lo que hay de verdad en la barra, y
  // con el throw la cajera quedaba trabada a mitad de fiesta con gente en la
  // fila. Ahora la venta se aplica igual y la discrepancia queda registrada
  // en el ledger `ops` para poder auditarla después.
  const stockWarnings: { ticketTypeId: number; name: string; requested: number; available: number }[] = [];
  for (const item of params.items) {
    const tt = ttById.get(item.ticketTypeId);
    if (!tt) throw new Error(`Producto ${item.ticketTypeId} no encontrado`);
    // Defensa en profundidad: getCajaSnapshot ya excluye las
    // cargas de saldo del catálogo que ve la cajera, pero acá se revalida
    // server-side por si el ticketTypeId llega de otra forma -- vender esto
    // en caja cobraría plata sin acreditar ningún saldo (creditPrepaid solo
    // corre en processApprovedOrder, el camino de compra web).
    if (isTopupProduct(tt)) throw new Error(`"${tt.name}" es una carga de saldo -- solo se compra desde el sitio web, no en caja`);
    const available = tt.totalStock - tt.soldCount;
    if (item.quantity > available) {
      stockWarnings.push({ ticketTypeId: tt.id, name: tt.name, requested: item.quantity, available });
    }
    const unitPrice = Number(tt.price);
    total += unitPrice * item.quantity;
    lineItems.push({ ticketTypeId: tt.id, quantity: item.quantity, unitPrice, unitCost: tt.costPrice != null ? Number(tt.costPrice) : null, name: tt.name });
  }

  // Comanda de cocina: solo los ítems marcados `toKitchen` -- los tragos de
  // la misma venta no van a la comanda, se entregan directo en la barra.
  const kitchenItems = params.items
    .filter((i) => Number(ttById.get(i.ticketTypeId)?.toKitchen ?? 0) === 1)
    .map((i) => ({ name: ttById.get(i.ticketTypeId)!.name as string, quantity: i.quantity }));
  if (kitchenItems.length > 0 && !params.kitchenTicketNumber?.trim()) {
    throw new Error("Falta el número de comanda para cocina");
  }

  // Guardarropía: el número lo genera la tablet (nextLockerTagNumber), acá
  // solo se valida que haya llegado. Solo se admite cobrar UN abrigo por
  // venta: con varios en el mismo carrito no habría forma de saber qué
  // número va con cuál ítem.
  const hasLocker = params.items.some((i) => ttById.get(i.ticketTypeId)?.category === 'locker');
  if (hasLocker) {
    const lockerQty = params.items
      .filter((i) => ttById.get(i.ticketTypeId)?.category === 'locker')
      .reduce((sum, i) => sum + i.quantity, 0);
    if (lockerQty > 1) throw new Error("Cobra los abrigos de a uno para poder asignar un número a cada uno");
    if (!params.lockerTag?.trim()) throw new Error("Falta el número de la percha");
    if (!params.lockerCustomerName?.trim()) throw new Error("Falta el nombre del cliente para guardarropía");
  }

  // Descuento: se REVALIDA acá, nunca se confía en lo que calculó la tablet.
  // Sin señal el código no se puede validar -- la venta sigue sin descuento
  // en vez de dejar a la cajera esperando (mismo criterio que "avisar pero
  // dejar vender" del stock).
  // En caja NO hay códigos de descuento: solo la promo relámpago, que trae
  // la lista de productos a los que aplica (`applicableTicketTypeIds`). Un
  // código sin esa lista no descuenta nada acá (regla en
  // shared/discountCode.ts).
  let discountAmount = 0;
  let appliedDiscountId: number | null = null;
  if (params.discountCode?.trim()) {
    const validation = await validateDiscountCode(params.discountCode.trim(), params.eventId);
    if (validation.valid && validation.discount) {
      const disc = validation.discount;
      discountAmount = computeCodeDiscount(
        {
          discountType: disc.discountType,
          discountValue: disc.discountValue,
          applicableTicketTypeIds: disc.applicableTicketTypeIds as number[] | null,
        },
        lineItems.map((li) => ({ ticketTypeId: li.ticketTypeId, unitPrice: li.unitPrice, quantity: li.quantity })),
        'caja',
      );
      if (discountAmount > 0) appliedDiscountId = disc.id;
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
      targetId: params.opId, // la orden todavía no existe al momento de armar el op -- se referencia por el mismo opId
      payload: {
        items: lineItems, paymentMethod: params.paymentMethod, total,
        buyerEmail: params.buyerEmail ?? null, redeemRequested: params.redeemPlaycoins ?? 0,
        ...(stockWarnings.length > 0 ? { stockWarnings } : {}),
        ...(appliedDiscountId ? { discountCode: params.discountCode!.trim().toUpperCase(), discountAmount } : {}),
        ...(params.lockerTag ? { lockerTag: params.lockerTag.trim(), lockerCustomerName: params.lockerCustomerName?.trim() } : {}),
        ...(kitchenItems.length > 0 ? { kitchenTicketNumber: params.kitchenTicketNumber!.trim(), kitchenItems } : {}),
      },
      clientAt: params.clientAt,
    },
    async () => {
      const totalAfterDiscount = Math.max(0, total - discountAmount);

      // Se valida el número de percha ANTES de crear la orden -- así un
      // número repetido esta noche falla rápido, sin dejar una orden
      // huérfana sin guardarropía asociada (esta función no corre dentro de
      // una transacción SQL, igual que el resto del módulo /caja).
      if (params.lockerTag?.trim()) {
        const tagNumber = params.lockerTag.trim();
        const existing = await db.select().from(lockerItems)
          .where(and(eq(lockerItems.eventId, params.eventId), eq(lockerItems.tagNumber, tagNumber))).limit(1);
        if (existing.length > 0) throw new Error(`El número ${tagNumber} ya está en uso esta noche`);
      }

      // Mismo criterio que lockerTag arriba: el número de comanda también se
      // genera en la tablet (client/src/pages/caja/db.ts nextKitchenTicketNumber)
      // y también tiene una restricción única en el servidor
      // (kitchenTickets_event_number_unique) -- sin este chequeo previo, un
      // contador local desincronizado choca contra esa restricción DESPUÉS de
      // haber creado la orden, dejándola huérfana.
      if (kitchenItems.length > 0) {
        const ticketNumber = params.kitchenTicketNumber!.trim();
        const existing = await db.select().from(kitchenTickets)
          .where(and(eq(kitchenTickets.eventId, params.eventId), eq(kitchenTickets.ticketNumber, ticketNumber))).limit(1);
        if (existing.length > 0) throw new Error(`La comanda ${ticketNumber} ya está en uso esta noche`);
      }

      // Pago con SALDO PREPAGADO (pedido explícito del dueño): a diferencia
      // de todo lo demás en este módulo (stock, Playcoins), acá SÍ se
      // rechaza -- 100% del total o nada, y la orden nunca llega a crearse
      // si falla. Corre ANTES del canje de Playcoins porque son excluyentes:
      // no se mezclan los dos saldos en una misma venta.
      let redeemedAmount = 0;
      let payCustomerId: number | null = null;
      let redeemConflictNote: string | undefined;
      if (params.paymentMethod === 'saldo') {
        if (!params.buyerEmail || (!params.cardPin && !params.payToken)) {
          throw new Error('Pagar con saldo necesita el email y el PIN de la tarjeta (o el QR de la app)');
        }
        let customerId: number;
        if (params.payToken) {
          // QR de la app: se consume ANTES de cobrar (una sola vez); si el cobro falla, se libera.
          const used = await consumePayToken(params.payToken, params.buyerEmail, params.opId);
          if (!used.ok) throw new Error(used.reason);
          const [c] = await db.select({ id: customers.id }).from(customers).where(eq(customers.email, used.email)).limit(1);
          if (!c) { await releasePayToken(params.payToken, params.opId); throw new Error('No encontramos la cuenta de ese cliente'); }
          customerId = c.id;
        } else {
          const pinCheck = await verifyCardPin({ email: params.buyerEmail, pin: params.cardPin! });
          if (!pinCheck.ok) throw new Error(pinCheck.reason);
          customerId = pinCheck.customerId;
        }
        payCustomerId = customerId;
        const spend = await spendPrepaidAuthoritative({
          customerId, amountClp: totalAfterDiscount,
          reason: 'spend_caja', opId: params.opId,
        });
        if (!spend.ok) {
          if (params.payToken) await releasePayToken(params.payToken, params.opId);
          throw new Error(spend.conflictNote);
        }
      } else if (params.redeemPlaycoins && params.redeemPlaycoins > 0 && params.buyerEmail) {
        // Canje de Playcoins: SERVER-AUTHORITATIVE, dentro de este mismo
        // mutate() -- se relee el saldo real en el instante en que esta
        // operación finalmente se aplica (no cuando el cajero la encoló
        // offline). Si falla (otro dispositivo canjeó primero), la venta
        // igual se aplica a precio completo -- no se bloquea la entrega de
        // productos en el evento por una carrera de saldo entre dispositivos.
        const redemption = await redeemPlaycoinsAuthoritative({
          email: params.buyerEmail,
          requestedAmount: Math.min(params.redeemPlaycoins, totalAfterDiscount),
          opId: params.opId,
        });
        if (redemption.ok) redeemedAmount = redemption.redeemed;
        else redeemConflictNote = redemption.conflictNote;
      }

      // El descuento ya viene incrementando `usedCount` acá (no antes, en la
      // fase de cálculo): si la op nunca llega a aplicarse (opId repetido =
      // ya se aplicó antes, ver applyOp) no hay que volver a incrementarlo.
      if (appliedDiscountId) {
        await db.update(discountCodes).set({ usedCount: sql`usedCount + 1` }).where(eq(discountCodes.id, appliedDiscountId));
      }

      const finalTotal = totalAfterDiscount - redeemedAmount;
      const buyerName = resolveCajaBuyerName({
        knownName: await lookupKnownBuyerName(db, params.buyerEmail),
        customerName: params.customerName,
        lockerCustomerName: params.lockerCustomerName,
      });
      const orderNumber = `CAJA-${Date.now().toString(36).toUpperCase()}`;
      // Todo movimiento queda ligado al cliente: con saldo ya se sabe quién es;
      // con QR/correo se resuelve (o crea) su ficha. Sin correo real, null.
      const orderCustomerId = payCustomerId ?? await ensureCustomerIdForEmail(params.buyerEmail, buyerName);
      const [orderResult] = await db.insert(orders).values({
        orderNumber,
        buyerName,
        buyerEmail: params.buyerEmail?.trim().toLowerCase() || "caja@mansionplayroom.cl",
        customerId: orderCustomerId,
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
        emailSent: 1, // no corresponde email al cliente en una venta presencial
      });
      const orderId = (orderResult as unknown as { insertId: number }).insertId;

      if (params.lockerTag?.trim()) {
        await db.insert(lockerItems).values({
          eventId: params.eventId,
          orderId,
          opId: params.opId,
          tagNumber: params.lockerTag.trim(),
          customerName: params.lockerCustomerName?.trim() || null,
        });
      }

      if (kitchenItems.length > 0) {
        await db.insert(kitchenTickets).values({
          eventId: params.eventId,
          orderId,
          opId: params.opId,
          registerId: params.registerId ?? null,
          ticketNumber: params.kitchenTicketNumber!.trim(),
          items: kitchenItems,
          customerName: params.customerName?.trim() || null,
        });
      }

      for (const item of lineItems) {
        await db.insert(orderItems).values({
          orderId,
          ticketTypeId: item.ticketTypeId,
          quantity: item.quantity,
          unitPrice: String(item.unitPrice),
          totalPrice: String(item.unitPrice * item.quantity),
          unitCost: item.unitCost != null ? String(item.unitCost) : null,
        });
        await db.update(ticketTypes).set({ soldCount: sql`soldCount + ${item.quantity}` }).where(eq(ticketTypes.id, item.ticketTypeId));
      }

      // Stock de la barra por insumos: cada trago gasta su receta (dos tragos
      // con ron gastan del mismo ron). Nunca lanza ni bloquea el cobro.
      await descontarVenta(db, { opId: params.opId, eventId: params.eventId, operatorId: params.operatorId, items: params.items });

      // Ganar Playcoins por esta venta (pedido explícito del usuario, si el
      // cajero capturó el email) -- sobre lo efectivamente pagado, no sobre
      // el precio antes del canje.
      if (params.buyerEmail) {
        await awardPlaycoins({ email: params.buyerEmail, totalClp: finalTotal, reason: 'earn_caja', opId: params.opId });
      }

      // El aviso de stock viaja junto al de Playcoins en el mismo campo: son
      // las dos cosas que la cajera tiene que ver DESPUÉS de haber cobrado,
      // sin que ninguna le haya impedido cobrar.
      const stockNote = stockWarnings.length > 0
        ? `Vendido sin stock: ${stockWarnings.map(w => `${w.name} (quedaban ${w.available}, se vendieron ${w.requested})`).join('; ')}`
        : undefined;
      const notes = [redeemConflictNote, stockNote].filter(Boolean);

      return { result: "applied" as const, conflictNote: notes.length > 0 ? notes.join(' · ') : undefined };
    }
  );

  return { result, conflictNote };
}
