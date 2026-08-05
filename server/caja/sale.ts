import { eq, sql, inArray, and } from "drizzle-orm";
import { orders, orderItems, ticketTypes, discountCodes, lockerItems, kitchenTickets } from "../../drizzle/schema";
import { applyOp } from "./ops";
import { awardPlaycoins, redeemPlaycoinsAuthoritative, validateDiscountCode } from "../db";

/** Venta presencial en caja (docs/ARQUITECTURA-CAJA.md §0.4, §3.1.5): se
 * cobra en el terminal externo (fuera del sistema) y acá solo se registra --
 * `orders` con `channel='caja'`, aprobada al instante, sin email al cliente
 * (no hay a quién mandárselo: recibe el ticket físico en el momento) ni copia
 * a contacto@ (a pedido explícito: en la noche del evento pasan muchas
 * ventas por minuto, saturaría el correo -- esa copia queda solo para las
 * ventas web, ver processApprovedOrder en webhooks.ts). Se reutiliza
 * `orders`/`orderItems` en vez de una tabla `sales` aparte para que el
 * reporting/CSV/stats del admin ya existentes la vean sola. */
export async function createCajaSale(
  db: any,
  params: {
    opId: string;
    eventId: number;
    operatorId: number;
    registerId?: number | null;
    items: { ticketTypeId: number; quantity: number }[];
    paymentMethod: "efectivo" | "debito" | "credito" | "qr";
    clientAt: Date;
    // Playcoins (pedido explícito del usuario): captura opcional del email
    // del cliente para que la venta también gane puntos, y canje opcional de
    // puntos ya ganados como descuento del total.
    buyerEmail?: string;
    redeemPlaycoins?: number;
    // Código de descuento aplicado al carrito -- se revalida server-side con
    // la misma función que usa el checkout web (nunca se confía en el monto
    // que calculó la tablet).
    discountCode?: string;
    // Número de la percha física de guardarropía, tecleado por la cajera al
    // cobrar (no lo genera el sistema -- ver drizzle/schema.ts `lockerItems`
    // para el porqué). Requerido si algún ítem es category='locker'.
    lockerTag?: string;
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

  // Guardarropía: el número ya está en la ficha física, la cajera lo teclea
  // -- un correlativo generado por el servidor no puede funcionar sin señal
  // (dos tablets desconectadas asignarían las dos el mismo número). Solo se
  // admite cobrar UN abrigo por venta: con varios en el mismo carrito no
  // habría forma de saber qué número va con cuál ítem.
  const hasLocker = params.items.some((i) => ttById.get(i.ticketTypeId)?.category === 'locker');
  if (hasLocker) {
    const lockerQty = params.items
      .filter((i) => ttById.get(i.ticketTypeId)?.category === 'locker')
      .reduce((sum, i) => sum + i.quantity, 0);
    if (lockerQty > 1) throw new Error("Cobra los abrigos de a uno para poder asignar un número a cada uno");
    if (!params.lockerTag?.trim()) throw new Error("Falta el número de la percha");
  }

  // Descuento: se REVALIDA acá, nunca se confía en lo que calculó la tablet.
  // Sin señal el código no se puede validar -- la venta sigue sin descuento
  // en vez de dejar a la cajera esperando (mismo criterio que "avisar pero
  // dejar vender" del stock).
  let discountAmount = 0;
  let appliedDiscountId: number | null = null;
  if (params.discountCode?.trim()) {
    const validation = await validateDiscountCode(params.discountCode.trim(), params.eventId);
    if (validation.valid && validation.discount) {
      const disc = validation.discount;
      appliedDiscountId = disc.id;
      discountAmount = disc.discountType === 'percentage'
        ? Math.round(total * Number(disc.discountValue) / 100)
        : Math.min(Number(disc.discountValue), total);
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
        ...(params.lockerTag ? { lockerTag: params.lockerTag.trim() } : {}),
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

      // Canje de Playcoins: SERVER-AUTHORITATIVE, dentro de este mismo
      // mutate() -- se relee el saldo real en el instante en que esta
      // operación finalmente se aplica (no cuando el cajero la encoló
      // offline). Si falla (otro dispositivo canjeó primero), la venta
      // igual se aplica a precio completo -- no se bloquea la entrega de
      // productos en el evento por una carrera de saldo entre dispositivos.
      let redeemedAmount = 0;
      let redeemConflictNote: string | undefined;
      if (params.redeemPlaycoins && params.redeemPlaycoins > 0 && params.buyerEmail) {
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
        emailSent: 1, // no corresponde email al cliente en una venta presencial
      });
      const orderId = (orderResult as unknown as { insertId: number }).insertId;

      if (params.lockerTag?.trim()) {
        await db.insert(lockerItems).values({
          eventId: params.eventId,
          orderId,
          opId: params.opId,
          tagNumber: params.lockerTag.trim(),
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
