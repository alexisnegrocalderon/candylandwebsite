import { eq, sql, inArray } from "drizzle-orm";
import { orders, orderItems, ticketTypes, events } from "../../drizzle/schema";
import { applyOp } from "./ops";
import { sendEmail, buildSalesRecordEmail } from "../email";

const SALES_RECORD_EMAIL = "contacto@mansionplayroom.cl";

/** Venta presencial en caja (docs/ARQUITECTURA-CAJA.md §0.4, §3.1.5): se
 * cobra en el terminal externo (fuera del sistema) y acá solo se registra --
 * `orders` con `channel='caja'`, aprobada al instante, sin email al cliente
 * (no hay a quién mandárselo: recibe el ticket físico en el momento). Se
 * reutiliza `orders`/`orderItems` en vez de una tabla `sales` aparte para
 * que el reporting/CSV/stats del admin ya existentes la vean sola. */
export async function createCajaSale(
  db: any,
  params: {
    opId: string;
    eventId: number;
    operatorId: number;
    registerId?: number | null;
    items: { ticketTypeId: number; quantity: number }[];
    paymentMethod: "efectivo" | "debito" | "credito";
    clientAt: Date;
  }
) {
  if (params.items.length === 0) throw new Error("La venta necesita al menos un producto");

  const ticketTypeIds = params.items.map(i => i.ticketTypeId);
  const tts = await db.select().from(ticketTypes).where(inArray(ticketTypes.id, ticketTypeIds));
  const ttById = new Map<number, any>(tts.map((t: any) => [t.id, t]));

  let total = 0;
  const lineItems: { ticketTypeId: number; quantity: number; unitPrice: number; unitCost: number | null; name: string }[] = [];
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
      targetId: params.opId, // la orden todavía no existe al momento de armar el op -- se referencia por el mismo opId
      payload: { items: lineItems, paymentMethod: params.paymentMethod, total },
      clientAt: params.clientAt,
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
        emailSent: 1, // no corresponde email al cliente en una venta presencial
      });
      const orderId = (orderResult as unknown as { insertId: number }).insertId;

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

      try {
        const [event] = await db.select().from(events).where(eq(events.id, params.eventId)).limit(1);
        await sendEmail({
          to: SALES_RECORD_EMAIL,
          subject: `[Ventas Candyland] Orden ${orderNumber} — Venta en caja`,
          html: buildSalesRecordEmail({
            eventTitle: event?.title ?? "",
            orderNumber,
            buyerName: "Venta en caja",
            buyerEmail: "-",
            items: lineItems.map(i => ({ name: i.name, quantity: i.quantity, price: i.unitPrice * i.quantity })),
            total,
            isFinal: true,
          }),
        });
      } catch (err) {
        // No bloquea la venta si el correo falla -- ya quedó registrada en `orders`/`ops`.
        console.error("[Caja] Error enviando copia de venta a contacto@:", err);
      }

      return { result: "applied" as const };
    }
  );

  return { result, conflictNote };
}
