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
  if (row.orderPaymentMethod === 'Manual: Invitación' || row.orderPaymentMethod === 'Manual: Staff') return 'staff';
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

/** Una opción de estacionamiento que se puede cobrar en la puerta (el normal
 * y el VIP son productos distintos, con precio distinto). */
export interface DoorParkingOption {
  ticketTypeId: number;
  name: string;
  priceClp: number;
  isVip: boolean;
}

/** Los estacionamientos del evento que la puerta puede cobrar: extras cuyo
 * nombre es "Estacionamiento"/"Parking" (VIP incluido), sin los ocultos, del
 * más barato al más caro. */
export function listDoorParkingOptions(
  types: { id: number; name: string; category: string; price: number | string; status?: string | null }[],
): DoorParkingOption[] {
  return types
    .filter((t) => t.category === 'extra' && isAnyParkingTicketType(t.name) && t.status !== 'hidden')
    .map((t) => ({ ticketTypeId: t.id, name: t.name, priceClp: Number(t.price), isVip: /vip/i.test(t.name) }))
    .sort((a, b) => a.priceClp - b.priceClp || a.name.localeCompare(b.name));
}

const clp = (n: number) => `$${Math.round(n).toLocaleString('es-CL')}`;

/** La frase exacta que el anfitrión le dice al cliente antes de cobrar. Los
 * nombres y precios salen de los productos del evento, así que si cambian en
 * el admin la frase se actualiza sola. Con una sola opción no se pregunta. */
export function doorParkingScript(options: Pick<DoorParkingOption, 'name' | 'priceClp'>[]): string {
  if (options.length === 0) return '';
  if (options.length === 1) return `El ${options[0].name} cuesta ${clp(options[0].priceClp)}.`;
  const lista = options.map((o) => `${o.name} ${clp(o.priceClp)}`);
  const ultimo = lista.pop();
  const cuantos = options.length === 2 ? 'dos' : String(options.length);
  return `Tenemos ${cuantos} estacionamientos: ${lista.join(', ')} y ${ultimo}. ¿Cuál prefiere?`;
}

export type DoorParkingMethod = 'efectivo' | 'debito' | 'credito';

/** Un cobro de estacionamiento hecho en la puerta desde este celular. */
export interface DoorParkingCharge {
  method: DoorParkingMethod;
  /** Qué estacionamiento se cobró ("Estacionamiento", "Estacionamiento VIP"). */
  optionName?: string;
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
  const byOption = new Map<string, { count: number; total: number }>();
  let rejected = 0;
  for (const c of charges) {
    if (c.status === 'rechazado') { rejected++; continue; }
    byMethod[c.method].count++;
    byMethod[c.method].total += c.amount ?? 0;
    const key = c.optionName ?? 'Estacionamiento';
    const cur = byOption.get(key) ?? { count: 0, total: 0 };
    cur.count++;
    cur.total += c.amount ?? 0;
    byOption.set(key, cur);
  }
  const cars = byMethod.efectivo.count + byMethod.debito.count + byMethod.credito.count;
  const total = byMethod.efectivo.total + byMethod.debito.total + byMethod.credito.total;
  return {
    cars, total, byMethod, rejected,
    /** Autos y pesos por tipo de estacionamiento (normal / VIP), del más cobrado al menos. */
    byOption: Array.from(byOption, ([name, v]) => ({ name, ...v })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
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

/** Estacionamientos VIP reservados de antes (online o staff; los cobrados en la puerta no cuentan: no estaban
 * reservados) frente a cuántos de esos ya llegaron (el acceso de su orden ya entró) y cuántos faltan. Es lo que le
 * dice a la puerta cuántos lugares VIP seguir guardando junto a la escalera. */
export function vipParkingCounts(attendees: {
  access: { status: string }[];
  extras: { typeName: string; status: string; atDoor?: boolean }[];
}[]): { reserved: number; arrived: number; pending: number } {
  let reserved = 0, arrived = 0;
  for (const a of attendees) {
    const vip = a.extras.filter((e) => !e.atDoor && e.status !== 'cancelled' && isAnyParkingTicketType(e.typeName) && /vip/i.test(e.typeName)).length;
    if (vip === 0) continue;
    reserved += vip;
    if (a.access.some((acc) => acc.status === 'used')) arrived += vip;
  }
  return { reserved, arrived, pending: reserved - arrived };
}
