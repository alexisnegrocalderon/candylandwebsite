/* «El siguiente evento» para todo lo que habla con la IA o redacta por el dueño (plan de contenido, guiones de Reels, correos de
 * reconquista, estratega comercial, auditoría del perfil, preguntas del panel).
 *
 * Antes cada uno tomaba el evento «destacado» de Playroom y lo describía con el contexto de Playroom (Viña, +18, disfraces,
 * aniversario). Con PLAYMORE (Santiago, +21, junto a Dalmore) activa eso daba textos con datos de la fiesta equivocada.
 * Acá se decide UNA vez cuál es el siguiente evento y, si es PLAYMORE, se entregan sus datos reales y sus reglas. */
import * as db from './db';
import { getCoproductionByEventId } from './coproduction';
import { getPlaymoreFocus, type PlaymoreFocus } from './playmoreFocus';
import { applyEventToLanding, normalizeLanding } from '../shared/coproduction';
import { COLAB_HOME_REDIRECT } from '../shared/colabHosts';
import { availabilityLabel, buildPlaymoreContext, PLAYMORE_BRAND_NOTES } from './playmoreAgent';

type EventRow = NonNullable<Awaited<ReturnType<typeof db.getEventById>>>;

/** El siguiente evento a tratar: PLAYMORE mientras está activa (el foco del dueño); si no, el destacado de siempre. */
export async function getNextEvent(now: Date = new Date()): Promise<EventRow | undefined> {
  const focus = await getPlaymoreFocus(now);
  return focus?.event ?? (await db.getFeaturedEvent());
}

/** El evento pedido, o el siguiente si no se pidió ninguno. */
export async function resolveEvent(targetEventId: number | undefined, now: Date = new Date()): Promise<EventRow | undefined> {
  return targetEventId ? ((await db.getEventById(targetEventId)) ?? undefined) : getNextEvent(now);
}

/** PLAYMORE si ese evento es el de la colaboración (esté activada o en vista previa); `null` si es una fiesta de Playroom. */
export async function getPlaymoreFor(event: { id: number }): Promise<PlaymoreFocus | null> {
  try {
    const cp = await getCoproductionByEventId(event.id);
    if (!cp || cp.slug !== COLAB_HOME_REDIRECT.slug) return null;
    const full = await db.getEventById(event.id);
    if (!full) return null;
    return { event: full, landing: applyEventToLanding(normalizeLanding(cp.landing), full) };
  } catch {
    return null;
  }
}

/** Datos reales de PLAYMORE (fecha, lugar, +21, accesos con precio y tanda) para pegar en el pedido a la IA. */
export function playmoreFacts(focus: PlaymoreFocus): Promise<string> {
  return buildPlaymoreContext(focus, availabilityLabel);
}

/** Contexto de marca de PLAYMORE: reemplaza al de Playroom (que habla de Valparaíso, +18 y disfraces) sin tocar lo guardado. */
export const PLAYMORE_CONTENT_BRAND = PLAYMORE_BRAND_NOTES;

/** Reglas para cualquier texto de contenido sobre PLAYMORE. Pisan lo que diga el resto del pedido (que está pensado para Playroom). */
export const PLAYMORE_CONTENT_RULES = [
  'FOCO EXCLUSIVO: PLAYMORE (esto pisa cualquier otra cosa del contexto, de los formatos, del ejemplo y de las guías de arriba):',
  '- El evento es PLAYMORE, la noche de Mansion Playroom × Dalmore: dos fiestas liberales que se fusionan en un nuevo spot especial de Santiago, sector Providencia. Nunca digas que es en Valparaíso ni en Viña del Mar, y nunca uses hashtags de esas ciudades.',
  '- Es solo para mayores de 21 años (nunca +18). La entrada es nominativa: se compra con el nombre y el documento (RUT o pasaporte) de quien asiste y se valida en la puerta.',
  '- NO es un aniversario ni una fiesta de disfraces: no hables de «aniversario», de disfraz ni de temática. El dress code es el que traen los datos del evento (elegante y atrevido), no el de Playroom.',
  '- Hay UN solo ambiente, con un line up de DJs pensado para esta fusión: no hables de pistas ni inventes nombres de DJs, shows ni estilos. No hay estacionamiento: para llegar, Uber, Didi o taxi.',
  '- La dirección exacta llega por correo junto con la entrada, después de comprar; «Providencia, Santiago» sí se puede decir. Las entradas se compran solo por el botón de compra («link en la bio»), no por transferencia ni reservando por mensaje.',
  '- En PLAYMORE no se usa el sistema de pago de Playroom: la PlayCard solo sirve como QR de ingreso, y el saldo y los Playcoins no se pueden usar esa noche. No promociones PlayCard, Playcoins, recargas ni cumpleañeros.',
  '- Hashtags: #PlayMore y #MansionPlayroom, más #Dalmore y los de comunidad (#FiestaLiberal, #Santiago); nunca #Valparaiso ni #Vina.',
  '- El precio y el cambio de tanda son los de los datos del evento: no inventes cifras ni fechas de cierre.',
].join('\n');
