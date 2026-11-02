/* Seguimientos del agente: cuándo, a quién y con qué variante. Lo PURO vive
 * acá para probarlo sin base ni IA; el envío está en server/instagramFollowUp.ts.
 *
 * Dos seguimientos como máximo por conversación, siempre dentro de la ventana
 * de 24 horas de Meta (fuera de ella la API rechaza el mensaje):
 *   1) tras unos minutos de silencio (o ~20 min después de tocar el botón de
 *      compra sin comprar);
 *   2) horas después, antes de que se cierre la ventana. */

export type FollowUpStage = 1 | 2;
export type FollowUpVariant = 'silence' | 'click';
export type FollowUpIntent = 'stop' | 'soft' | 'ok';

const HOUR = 60 * 60 * 1000;
const MIN = 60 * 1000;
/** Margen para no mandar sobre la hora en que Meta cierra la ventana. */
export const FOLLOWUP_WINDOW_MS = 23 * HOUR;
export const CLICK_FOLLOWUP_MINUTES = 20;
/** Después de tocar el botón, el seguimiento «¿pudiste entrar?» solo vale un rato. */
export const CLICK_FOLLOWUP_MAX_HOURS = 4;
/** Mínimo entre el seguimiento 1 y el 2. */
export const FOLLOWUP_MIN_GAP_HOURS = 3;

function norm(text: string): string {
  return text.normalize('NFD').replace(new RegExp('[\\u0300-\\u036f]', 'g'), '').toLowerCase();
}

const STOP = [
  /\bno (me )?(interesa|gracias|quiero|molesten|escriban|sigan|escribas|insistan)\b/,
  /\bno voy (a ir|a poder)\b/, /\bno puedo (ir|asistir)\b/, /\bya no (voy|quiero|me interesa)\b/,
  /\bdejen de\b/, /\bno (me )?contacten\b/, /\bbasta\b/,
];
const SOFT = [
  /\blo (voy a )?(pienso|pensar|veo)\b/, /\bdespues\b/, /\bmas adelante\b/, /\bte aviso\b/,
  /\bveo y te (digo|aviso)\b/, /\blo (converso|hablo|consulto)\b/, /\bcuando (pueda|tenga|cobre)\b/,
];

/** Qué dijo la persona sobre seguir en contacto: `stop` = no escribirle más;
 * `soft` = «lo pienso» (un solo recordatorio); `ok` = nada que lo impida. */
export function followUpIntent(texts: Array<string | null | undefined>): FollowUpIntent {
  const t = norm(texts.filter(Boolean).join(' . '));
  if (STOP.some((r) => r.test(t))) return 'stop';
  if (SOFT.some((r) => r.test(t))) return 'soft';
  return 'ok';
}

export interface FollowUpPlanInput {
  now: Date;
  lastInboundAt: Date | null;
  lastMessageAt: Date | null;
  /** El último mensaje del hilo lo mandó el bot (no la persona ni el dueño). */
  lastFromBot: boolean;
  /** Marca antigua de «ya mandé el recordatorio» (igThreads.closingMessageSentAt). */
  legacyClosingSentAt: Date | null;
  /** Estado guardado (tabla igFollowUps); null si no hay fila. */
  state: { stage: number; lastSentAt: Date | null; stoppedAt: Date | null } | null;
  /** Último clic en el botón de compra de esta conversación. */
  clickAt: Date | null;
  intent: FollowUpIntent;
  minutes: number;
  secondHours: number;
}

export function planFollowUp(i: FollowUpPlanInput): { stage: FollowUpStage; variant: FollowUpVariant } | null {
  const { now, lastInboundAt, lastMessageAt, state } = i;
  if (!lastInboundAt || !lastMessageAt || !i.lastFromBot) return null;
  if (now.getTime() - lastInboundAt.getTime() >= FOLLOWUP_WINDOW_MS) return null;
  // «Detenido» vale hasta que la persona vuelva a escribir (ahí se reevalúa).
  if (i.intent === 'stop') return null;
  if (state?.stoppedAt && state.stoppedAt.getTime() >= lastInboundAt.getTime()) return null;

  // ¿Escribió algo después del último seguimiento? Entonces se parte de cero.
  const repliedSince = !!state?.lastSentAt && lastInboundAt.getTime() > state.lastSentAt.getTime();
  // Hilos con el recordatorio viejo ya enviado y sin fila nueva: no se les manda un segundo
  // (no se puede registrar el estado), solo se rearma si la persona vuelve a escribir.
  if (!state && i.legacyClosingSentAt && lastInboundAt.getTime() <= i.legacyClosingSentAt.getTime()) return null;
  const stage = state && !repliedSince ? state.stage : 0;

  const clicked = i.clickAt && i.clickAt.getTime() > lastInboundAt.getTime() ? i.clickAt : null;

  if (stage === 0) {
    if (clicked) {
      const since = now.getTime() - clicked.getTime();
      if (since >= CLICK_FOLLOWUP_MINUTES * MIN && since <= CLICK_FOLLOWUP_MAX_HOURS * HOUR) return { stage: 1, variant: 'click' };
    }
    if (now.getTime() - lastMessageAt.getTime() >= i.minutes * MIN) return { stage: 1, variant: 'silence' };
    return null;
  }

  if (stage === 1) {
    if (i.intent === 'soft' || i.secondHours <= 0 || !state?.lastSentAt) return null;
    if (now.getTime() - lastInboundAt.getTime() < i.secondHours * HOUR) return null;
    if (now.getTime() - state.lastSentAt.getTime() < FOLLOWUP_MIN_GAP_HOURS * HOUR) return null;
    return { stage: 2, variant: clicked ? 'click' : 'silence' };
  }
  return null;
}
