import type { MotionScene } from './motionSpec';

/* El gancho de chat (escena 1 como conversación de celular): qué mensajes hay y en qué cuadro entra cada uno. Es lo PURO, así
 * la imagen (motion/chat.tsx) y los sonidos (MotionVideo) usan exactamente los mismos cuadros. */

/** Cuadros que tarda el celular en entrar antes del primer mensaje, y que quedan al final antes del corte. */
export const CHAT_LEAD = 14;
export const CHAT_TAIL = 16;
/** Cuánto «escribe…» la otra persona antes de que llegue su mensaje. */
export const CHAT_TYPING = 12;
export const CHAT_MAX_MESSAGES = 6;

export interface ChatMsg {
  text: string;
  /** Lo manda quien ve el video (a la derecha); si no, llega de la marca (a la izquierda). */
  mine: boolean;
}

/** Primer mensaje = texto grande de la escena; los siguientes, sus líneas. Se alternan: llega, responde, llega… */
export function chatMessages(scene: Pick<MotionScene, 'text' | 'items'>): ChatMsg[] {
  return [scene.text, ...scene.items]
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, CHAT_MAX_MESSAGES)
    .map((text, i) => ({ text, mine: i % 2 === 1 }));
}

export interface ChatBeat {
  index: number;
  /** Cuadro en que empieza a «escribir…» (solo los que llegan); null si lo manda el espectador. */
  typingAt: number | null;
  /** Cuadro en que aparece el mensaje. */
  showAt: number;
}

/** Reparte los mensajes en los cuadros de la escena: cada uno cabe aunque la escena sea corta. */
export function chatSchedule(msgs: ChatMsg[], frames: number): ChatBeat[] {
  const room = Math.max(8, frames - CHAT_LEAD - CHAT_TAIL);
  const slot = Math.min(36, room / Math.max(1, msgs.length));
  return msgs.map((m, index) => {
    const start = CHAT_LEAD + index * slot;
    return m.mine
      ? { index, typingAt: null, showAt: Math.round(start + slot * 0.25) }
      : { index, typingAt: Math.round(start), showAt: Math.round(start + Math.min(CHAT_TYPING, slot * 0.5)) };
  });
}

/** Segundos mínimos que necesita la escena 1 para que se lean todos los mensajes sin apuro. */
export function chatMinSecs(msgCount: number): number {
  return Math.min(8, Math.round((0.9 + 1.0 * msgCount) * 10) / 10);
}
