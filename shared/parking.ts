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
