/* Voz en off del Estudio Motion (server/studioVoice.ts, voces chilenas de
 * Azure). Cada escena dice una frase: lo que dura esa frase manda lo que dura
 * la escena (shared/motionSpec.ts → motionTimeline), así el texto cae en el
 * ritmo de la voz. Los silencios tienen que ser los mismos que MOTION_VOICE_*. */
import { MOTION_VOICE_GAP, MOTION_VOICE_LEAD, MOTION_VOICE_TAIL } from './motionSpec';

/** Voces chilenas de Azure Speech (es-CL). */
export const TTS_VOICES = {
  catalina: { label: 'Catalina (mujer, chilena)', name: 'es-CL-CatalinaNeural' },
  lorenzo: { label: 'Lorenzo (hombre, chileno)', name: 'es-CL-LorenzoNeural' },
} as const;
export type TtsVoice = keyof typeof TTS_VOICES;
export const TTS_VOICE_KEYS = Object.keys(TTS_VOICES) as TtsVoice[];

/** Silencio antes de la primera frase, entre frases y al final. */
export const VOICE_LEAD = MOTION_VOICE_LEAD;
export const VOICE_GAP = MOTION_VOICE_GAP;
export const VOICE_TAIL = MOTION_VOICE_TAIL;

export const VOICE_MAX_BEATS = 10;
export const VOICE_MAX_SAY = 180;
/** Tope de letras por voz generada (cuida la cuota gratis de Azure: 500.000 al mes). */
export const VOICE_MAX_CHARS = 900;
export const VOICE_RATE_RANGE = { min: -25, max: 30 } as const;
export const VOICE_PITCH_RANGE = { min: -12, max: 12 } as const;

export interface VoiceScript { says: string[]; voice: TtsVoice; rate: number; pitch: number }

/** Hash corto y estable (FNV-1a) del texto que se manda a la voz. */
function fnv(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/** Huella del guion: si cambia una frase o la voz, la voz generada quedó vieja. */
export function voiceScriptHash(s: VoiceScript): string {
  return fnv(JSON.stringify([s.says.map((t) => t.trim()), s.voice, s.rate, s.pitch]));
}
