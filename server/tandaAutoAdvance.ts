import { eq, and } from 'drizzle-orm';
import { getDb, advanceTanda, getStockPoolRemaining } from './db';
import { events, ticketTypes } from '../drizzle/schema';
import { normalizeTandaSchedule, computePhasePrice, nextPhase } from '../shared/tandaSchedule';

/** Revisa si la tanda vigente de un evento debe pasar sola a la siguiente
 * fase -- por fecha (si la fase actual tiene `untilDate` y ya pasó) o por
 * cupo agotado (si los accesos activos comparten UN solo cupo y su
 * remanente llegó a 0). Lo que pase primero. Si la fase vigente no tiene
 * fecha ni cupo compartido asignado, nunca dispara -- la tanda sigue siendo
 * 100% manual para ese evento, comportamiento idéntico al de antes de esta
 * ronda. El botón "Cerrar tanda y activar la siguiente" del admin sigue
 * funcionando en cualquier momento, dispare esto o no (mismo `advanceTanda`
 * de siempre) -- es el override manual pedido explícitamente.
 *
 * Se llama SOLO desde puntos ya de por sí frecuentes (la consulta pública de
 * precios, que la home hace cada 30s, y justo después de que se suma stock
 * vendido por un pago aprobado o una orden gratis) -- no hay cron nuevo:
 * Vercel Hobby ya usa sus 2 crons diarios permitidos (ver
 * server/cronRoutes.ts), así que "automático" acá significa "se revisa solo
 * en el próximo pedido real", no "on-the-dot a la hora puesta". Para el caso
 * sin tráfico, el mismo chequeo se suma también al cron diario de
 * mailing-queue (ver server/cronRoutes.ts) como red de seguridad. */
export async function checkAndAdvanceTandaIfNeeded(eventId: number): Promise<{ advanced: boolean; reason?: 'date' | 'stock' }> {
  try {
    const db = await getDb();
    if (!db) return { advanced: false };

    const [event] = await db.select().from(events).where(eq(events.id, eventId)).limit(1);
    if (!event) return { advanced: false };

    const schedule = normalizeTandaSchedule(event.tandaDiscountSchedule);
    const currentPhase = schedule[event.tandaPhaseIndex];
    const next = nextPhase(event.tandaPhaseIndex, schedule);
    if (!currentPhase || !next) return { advanced: false };

    const activos = await db.select().from(ticketTypes).where(and(
      eq(ticketTypes.eventId, eventId),
      eq(ticketTypes.category, 'acceso'),
      eq(ticketTypes.status, 'active'),
    ));
    if (activos.length === 0) return { advanced: false };

    let reason: 'date' | 'stock' | null = null;
    if (currentPhase.untilDate && new Date(currentPhase.untilDate).getTime() <= Date.now()) {
      reason = 'date';
    }
    if (!reason) {
      // Solo dispara por cupo si TODOS los accesos activos comparten el
      // mismo pool -- si están repartidos en pools distintos o ninguno, no
      // hay una sola cifra clara de "se agotó" y no se inventa una regla
      // ambigua.
      const poolIds = Array.from(new Set(activos.map((a) => a.stockPoolId).filter((id): id is number => id != null)));
      if (poolIds.length === 1) {
        const info = await getStockPoolRemaining(poolIds[0]);
        if (info && info.remaining <= 0) reason = 'stock';
      }
    }
    if (!reason) return { advanced: false };

    // El paso automático solo toca el PRECIO -- nunca inventa un cupo nuevo
    // ni reasigna pool. Si el dueño quiere que la fase siguiente también
    // tenga su propio cupo compartido, lo arma a mano con "Cerrar tanda"
    // (ahí sigue pudiendo elegir precio/stock/pool como siempre).
    const rows = activos.map((tt) => ({
      oldTicketTypeId: tt.id,
      newPrice: tt.originalPrice ? computePhasePrice(Number(tt.originalPrice), next.phase.percent) : Number(tt.price),
      newTotalStock: 999999,
      newStockPoolId: null,
    }));
    await advanceTanda(eventId, rows);
    return { advanced: true, reason };
  } catch (err) {
    // Nunca debe romper el pedido que lo disparó (una consulta pública de
    // precios, o la confirmación de un pago) -- se loguea y se sigue.
    console.error('[tandaAutoAdvance] checkAndAdvanceTandaIfNeeded falló', err);
    return { advanced: false };
  }
}
