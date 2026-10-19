/** Estacionamiento: clasificación de origen (online / puerta / staff) para el
 * reporte de conteo exacto de autos. Función pura, sin conexión a base de
 * datos -- mismo espíritu que shared/expenses.ts, para poder testear sin
 * levantar el servidor. */

/** Nombre de producto que cuenta como "Estacionamiento" EXCLUYENDO la
 * variante VIP -- se usa donde hace falta un único producto sin ambigüedad
 * para saber qué precio cobrar (server/caja/parkingPaid.ts, y Puerta.tsx
 * para destacar el bloque de estacionamiento). Para la CONTABILIDAD, donde
 * el VIP también cuenta como un auto, usar `isAnyParkingTicketType`. */
export function isParkingTicketType(name: string): boolean {
  return /estacionamiento|parking/i.test(name) && !/vip/i.test(name);
}

/** Como `isParkingTicketType`, pero SIN excluir la variante VIP -- pedido
 * explícito del dueño (14/09): para la CONTABILIDAD (cuántos autos entraron,
 * cuánto se le paga al establecimiento) un auto es un auto sin importar el
 * valor que pagó, así que "Estacionamiento VIP" tiene que sumar igual que
 * "Estacionamiento" en el reporte (getParkingReport).
 *
 * A propósito NO se usa acá donde `isParkingTicketType` exige que exista un
 * único producto sin ambigüedad para poder cobrar en la puerta
 * (server/caja/parkingPaid.ts resolveParkingCharge) -- ahí SÍ importa la
 * distinción, porque hay que saber CUÁL precio cobrarle a quien llega sin
 * estacionamiento pagado. Dos usos, dos preguntas distintas: "¿es un auto?"
 * (acá) vs. "¿cuál le cobro ahora?" (isParkingTicketType). */
export function isAnyParkingTicketType(name: string): boolean {
  return /estacionamiento|parking/i.test(name);
}

// Emails placeholder que usan las invitaciones/ventas anónimas
// (createInstantInvite, createCajaSale sin email) -- no sirven para agrupar
// por comprador: varias personas distintas pueden compartir el mismo. Usado
// tanto para la fusión de extras en getCajaSnapshot como para el chequeo de
// doble cobro en sellParkingAtDoor (server/caja/parkingPaid.ts).
export const PLACEHOLDER_BUYER_EMAILS = new Set(['invitacion@mansionplayroom.cl', 'caja@mansionplayroom.cl']);

export type ParkingOrigin = 'online' | 'puerta' | 'staff';

/** A qué balde va un ticket de estacionamiento ya vendido, según la orden
 * que lo pagó:
 * - 'puerta': vendido por sellParkingAtDoor (server/caja/parkingPaid.ts),
 *   identificable por el prefijo que esa función pone en `paymentId` --
 *   nunca se toca `paymentMethod` ahí, para no romper el cálculo automático
 *   de comisión de tarjeta (que sí mira `paymentMethod`).
 * - 'staff': invitación gratis emitida desde Accesos Manuales
 *   (`paymentMethod: 'Manual: Invitación'`).
 * - 'online': cualquier otro caso (compra web, o venta de mostrador en
 *   /caja -- rara, y hoy `createCajaSale` no genera ticket para extras, así
 *   que en la práctica casi siempre es compra web). */
export function classifyParkingOrigin(row: { orderPaymentMethod: string; orderPaymentId: string | null }): ParkingOrigin {
  if (row.orderPaymentId?.startsWith('PUERTA-PARKING-')) return 'puerta';
  if (row.orderPaymentMethod === 'Manual: Invitación') return 'staff';
  return 'online';
}

export function summarizeParkingCounts(origins: ParkingOrigin[]) {
  let online = 0, puerta = 0, staff = 0;
  for (const o of origins) {
    if (o === 'online') online++;
    else if (o === 'puerta') puerta++;
    else staff++;
  }
  return { online, puerta, staff, totalPaid: online + puerta, totalCars: online + puerta + staff };
}

/** El único producto "Estacionamiento" (sin VIP) del evento: el que se le
 * cobra a quien llega sin estacionamiento pagado. `null` si no hay ninguno o
 * hay más de uno (ambiguo) -- igual criterio que resolveParkingCharge en
 * server/caja/parkingPaid.ts. */
export function pickDoorParkingProduct<T extends { category: string; name: string }>(types: T[]): T | null {
  const found = types.filter((t) => t.category === 'extra' && isParkingTicketType(t.name));
  return found.length === 1 ? found[0] : null;
}

export type DoorParkingMethod = 'efectivo' | 'debito' | 'credito';

/** Un cobro de estacionamiento hecho en la puerta desde este celular. */
export interface DoorParkingCharge {
  method: DoorParkingMethod;
  /** Monto cobrado; `null` si el celular todavía no conocía el precio. */
  amount: number | null;
  /** `pendiente`: aún no llega al servidor. `ok`: registrado. `rechazado`: el
   * servidor no lo registró (ya tenía estacionamiento, producto sin
   * configurar...) y no cuenta. */
  status: 'pendiente' | 'ok' | 'rechazado';
}

/** Resumen de lo cobrado desde un celular: autos, total, desglose por medio
 * de pago, el efectivo físico a entregar y lo que le corresponde al local
 * (`venueFeePerCarClp` por auto cobrado). Los rechazados no cuentan. */
export function summarizeDoorParking(charges: DoorParkingCharge[], venueFeePerCarClp: number) {
  const byMethod: Record<DoorParkingMethod, { count: number; total: number }> = {
    efectivo: { count: 0, total: 0 }, debito: { count: 0, total: 0 }, credito: { count: 0, total: 0 },
  };
  let rejected = 0;
  for (const c of charges) {
    if (c.status === 'rechazado') { rejected++; continue; }
    byMethod[c.method].count++;
    byMethod[c.method].total += c.amount ?? 0;
  }
  const cars = byMethod.efectivo.count + byMethod.debito.count + byMethod.credito.count;
  const total = byMethod.efectivo.total + byMethod.debito.total + byMethod.credito.total;
  return {
    cars, total, byMethod, rejected,
    cashToHandOver: byMethod.efectivo.total,
    venueShare: cars * venueFeePerCarClp,
  };
}

/** Vuelto al cobrar en efectivo: `null` si lo recibido no alcanza (o no hay
 * monto conocido). */
export function cashChange(received: number, price: number | null): number | null {
  if (price == null || !Number.isFinite(received) || received < price) return null;
  return received - price;
}
