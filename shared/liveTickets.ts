/* Al "Cerrar tanda" (manual o automático, server/tandaAutoAdvance.ts) la fila
 * vieja de cada acceso queda `soldout` y se crea una NUEVA fila `active` con
 * el mismo nombre/accesoSlug y el precio de la tanda siguiente. La consulta
 * pública `events.getTicketTypes` devuelve las dos, así que cualquier pantalla
 * que busque "la entrada Dúo" con `.find(...)` agarraba la PRIMERA -- la
 * cerrada, con el precio viejo -- y el checkout fallaba con "ya no está
 * disponible a este precio" para todos los compradores.
 *
 * Esto descarta una fila no activa cuando existe otra activa del mismo
 * acceso (misma categoría y accesoSlug, o mismo nombre si no tiene slug).
 * Una entrada realmente agotada (sin reemplazo activo) se conserva. */
type LiveTicket = { category?: string | null; accesoSlug?: string | null; name?: string | null; status?: string | null };

const keyOf = (t: LiveTicket) => `${t.category ?? ''}::${t.accesoSlug || (t.name ?? '').trim().toLowerCase()}`;

export function dropSupersededTickets<T extends LiveTicket>(tickets: T[]): T[] {
  const activeKeys = new Set(tickets.filter((t) => t.status === 'active').map(keyOf));
  return tickets.filter((t) => t.status === 'active' || !activeKeys.has(keyOf(t)));
}
