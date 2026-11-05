/* Foco de ventas del agente: mientras la colaboración PLAYMORE está activa, el agente de Instagram/WhatsApp vende SOLO
 * ese evento (pedido del dueño). Con la colab apagada o terminada todo vuelve a funcionar como siempre.
 * El evento sale de la co-producción activada (coproductions.isLive), no de una fecha ni de un nombre fijo. */
import * as db from './db';
import { getCoproductionBySlug } from './coproduction';
import { normalizeLanding, type CoproductionLanding } from '../shared/coproduction';

const COLAB_SLUG = 'dalmore';
const TTL_MS = 60_000;

export type PlaymoreFocus = { event: NonNullable<Awaited<ReturnType<typeof db.getEventById>>>; landing: CoproductionLanding };

let cache: { at: number; value: PlaymoreFocus | null } | null = null;

/** El evento de PLAYMORE si está activado y todavía no pasó (hasta 12 h después de su fecha), o `null`. */
export async function getPlaymoreFocus(now: Date = new Date()): Promise<PlaymoreFocus | null> {
  if (cache && now.getTime() - cache.at < TTL_MS && now.getTime() >= cache.at) return cache.value;
  let value: PlaymoreFocus | null = null;
  try {
    const cp = await getCoproductionBySlug(COLAB_SLUG);
    if (cp?.isLive && cp.eventId) {
      const event = await db.getEventById(cp.eventId);
      if (event && (event.status === 'published' || event.status === 'soldout') && new Date(event.eventDate).getTime() >= now.getTime() - 12 * 60 * 60 * 1000) {
        value = { event, landing: normalizeLanding(cp.landing) };
      }
    }
  } catch (err) {
    console.error('[agente] No se pudo leer el foco PLAYMORE:', err);
  }
  cache = { at: now.getTime(), value };
  return value;
}

export function resetPlaymoreFocusCache() { cache = null; }
