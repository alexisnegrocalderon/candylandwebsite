/* Una venta de caja es de esta persona si pagó con su saldo o ganó/canjeó Playcoins en ella: esos movimientos
 * llevan el `opId` de la venta. No alcanza con el correo de la orden, porque muchas ventas quedan con el correo
 * marcador de la caja. Sirve para unir la guardarropía y la cocina de caja con su dueño. */
import { sql, type SQL } from 'drizzle-orm';
import { playcoinsLedger, prepaidLedger } from '../drizzle/schema';

/** Condición: la venta con este `opId` (columna de lockerItems/kitchenTickets) es del cliente. */
export function cajaOpIsMine(customerId: number, opIdColumn: unknown): SQL {
  return sql`(EXISTS (SELECT 1 FROM ${prepaidLedger} pl WHERE pl.customerId = ${customerId} AND pl.opId = ${opIdColumn})
    OR EXISTS (SELECT 1 FROM ${playcoinsLedger} cl WHERE cl.customerId = ${customerId} AND cl.opId = ${opIdColumn}))`;
}
