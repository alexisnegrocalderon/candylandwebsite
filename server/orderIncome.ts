import { and, eq, isNotNull, or } from 'drizzle-orm';
import { orders } from '../drizzle/schema';

/** Qué órdenes cuentan como ingreso: las aprobadas, y las devueltas desde
 * Ventas Web (tienen `refundAmount`), de las que el negocio se queda con
 * `total - refundAmount` (ver cashCollectedFromOrders en shared/expenses.ts).
 * Una anulación de caja también queda `refunded` pero sin `refundAmount`: esa
 * no suma nada. */
export const countsAsIncome = or(
  eq(orders.paymentStatus, 'approved'),
  and(eq(orders.paymentStatus, 'refunded'), isNotNull(orders.refundAmount)),
)!;
