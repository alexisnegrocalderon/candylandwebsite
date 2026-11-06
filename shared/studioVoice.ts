/* Reel con voz (plantilla «voz» del Estudio): los datos que se editan en el
 * panel y que el servidor y la composición leen igual. Sin dependencias de
 * studioVideo.ts (él importa esto, no al revés).
 *
 * La voz se genera en el servidor (server/studioVoice.ts, voces chilenas de
 * Azure). Cada escena dice una frase: cuánto dura esa frase manda cuánto dura
 * la escena, así el texto cae en el ritmo de la voz. */

export const VOICE_KINDS = ['phone', 'big', 'stamp', 'end'] as const;
export type VoiceKind = (typeof VOICE_KINDS)[number];
export const VOICE_KIND_LABEL: Record<VoiceKind, string> = {
  phone: 'Gancho de celular (mensaje)',
  big: 'Palabra grande',
  stamp: 'Sello grande (+18, cifra)',
  end: 'Tarjeta final',
};

/** Voces chilenas de Azure Speech (es-CL). */
export const TTS_VOICES = {
  catalina: { label: 'Catalina (mujer, chilena)', name: 'es-CL-CatalinaNeural' },
  lorenzo: { label: 'Lorenzo (hombre, chileno)', name: 'es-CL-LorenzoNeural' },
} as const;
export type TtsVoice = keyof typeof TTS_VOICES;
export const TTS_VOICE_KEYS = Object.keys(TTS_VOICES) as TtsVoice[];

/** Silencio antes de la primera frase, entre frases y al final. */
export const VOICE_LEAD = 0.35;
export const VOICE_GAP = 0.3;
export const VOICE_TAIL = 1.1;

export const VOICE_MAX_BEATS = 10;
export const VOICE_MAX_SAY = 180;
/** Tope de letras por voz generada (cuida la cuota gratis de Azure: 500.000 al mes). */
export const VOICE_MAX_CHARS = 900;
export const VOICE_RATE_RANGE = { min: -25, max: 30 } as const;
export const VOICE_PITCH_RANGE = { min: -12, max: 12 } as const;

export interface VoiceBeat {
  kind: VoiceKind;
  /** Lo que dice la voz (y el subtítulo de la escena). */
  say: string;
  /** Palabra grande («big»/«stamp»). */
  big?: string;
  /** Etiqueta de arriba, p. ej. «1 DE 3». */
  tag?: string;
  /** Frase en cursiva bajo la palabra grande. */
  sub?: string;
  /** Píldoras bajo la palabra; con «~» al principio va tachada. */
  chips?: string[];
  /** Palabra del subtítulo que se resalta. */
  key?: string;
  /** Foto o clip de fondo de esta escena. */
  bg?: string;
  /** Cuánto dura la frase: la real si la voz está generada, si no una estimación. */
  secs: number;
}

export interface VideoVoice {
  beats: VoiceBeat[];
  voice: TtsVoice;
  /** Velocidad y tono de la voz, en % respecto a lo normal. */
  rate: number;
  pitch: number;
  handle: string;
  city: string;
  /** La voz ya generada (WAV con pausas) y de qué guion salió. */
  voiceUrl: string;
  voiceHash: string;
}

/** Hash corto y estable (FNV-1a) del texto que se manda a la voz. */
function fnv(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

export interface VoiceScript { says: string[]; voice: TtsVoice; rate: number; pitch: number }

export function voiceScriptHash(s: VoiceScript): string {
  return fnv(JSON.stringify([s.says.map((t) => t.trim()), s.voice, s.rate, s.pitch]));
}

export function voiceScriptOf(v: Pick<VideoVoice, 'beats' | 'voice' | 'rate' | 'pitch'>): VoiceScript {
  return { says: v.beats.map((b) => b.say), voice: v.voice, rate: v.rate, pitch: v.pitch };
}

/** ¿La voz generada corresponde al guion de hoy? (si se cambió una frase, hay que regenerarla) */
export function voiceIsFresh(v: VideoVoice): boolean {
  return !!v.voiceUrl && v.voiceHash === voiceScriptHash(voiceScriptOf(v));
}

/** Segundos que toma decir una frase, mientras no hay voz generada (≈2,7 palabras por segundo). */
export function estimateSecs(say: string): number {
  const words = say.trim().split(/\s+/).filter(Boolean).length;
  return Math.round(Math.max(0.8, words / 2.7 + 0.35) * 100) / 100;
}

export function voiceCharCount(v: Pick<VideoVoice, 'beats'>): number {
  return v.beats.reduce((n, b) => n + b.say.trim().length, 0);
}

const clean = (value: unknown, max: number) => (typeof value === 'string' ? value.slice(0, max) : '');
const num = (value: unknown, min: number, max: number, fallback: number) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : fallback;
};
const cleanUrl = (value: unknown) => {
  const url = clean(value, 1000).trim();
  return /^https?:\/\//i.test(url) || /^\/(?!\/)/.test(url) ? url : '';
};

export function normalizeVoice(raw: unknown): VideoVoice | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  const beats = (Array.isArray(r.beats) ? r.beats : [])
    .filter((b): b is Record<string, unknown> => !!b && typeof b === 'object')
    .slice(0, VOICE_MAX_BEATS)
    .map((b): VoiceBeat => {
      const kind = (VOICE_KINDS as readonly string[]).includes(b.kind as string) ? (b.kind as VoiceKind) : 'big';
      const say = clean(b.say, VOICE_MAX_SAY);
      const chips = (Array.isArray(b.chips) ? b.chips : []).map((c) => clean(c, 30)).filter(Boolean).slice(0, 3);
      const secs = Number(b.secs);
      const beat: VoiceBeat = { kind, say, secs: Number.isFinite(secs) && secs >= 0.5 && secs <= 30 ? Math.round(secs * 100) / 100 : estimateSecs(say) };
      const big = clean(b.big, 24); if (big) beat.big = big;
      const tag = clean(b.tag, 20); if (tag) beat.tag = tag;
      const sub = clean(b.sub, 40); if (sub) beat.sub = sub;
      if (chips.length) beat.chips = chips;
      const key = clean(b.key, 30); if (key) beat.key = key;
      const bg = cleanUrl(b.bg); if (bg) beat.bg = bg;
      return beat;
    });
  if (beats.length === 0) return undefined;
  const voice = (TTS_VOICE_KEYS as string[]).includes(r.voice as string) ? (r.voice as TtsVoice) : 'catalina';
  return {
    beats,
    voice,
    rate: num(r.rate, VOICE_RATE_RANGE.min, VOICE_RATE_RANGE.max, 6),
    pitch: num(r.pitch, VOICE_PITCH_RANGE.min, VOICE_PITCH_RANGE.max, 0),
    handle: clean(r.handle, 40) || '@mansionplayroom.cl',
    city: clean(r.city, 30) || 'VALPARAÍSO',
    voiceUrl: cleanUrl(r.voiceUrl),
    voiceHash: clean(r.voiceHash, 16),
  };
}

/** Largo total del reel con estos tiempos (el último cierre incluye la cola). */
export function voiceTotalSecs(v: Pick<VideoVoice, 'beats'>): number {
  const sum = v.beats.reduce((t, b) => t + b.secs, 0);
  return Math.round((VOICE_LEAD + sum + VOICE_GAP * Math.max(0, v.beats.length - 1) + VOICE_TAIL) * 100) / 100;
}

/** Guion de partida: los valores de la marca (respeto, consentimiento, libertad). Se edita entero. */
export function starterVoice(): VideoVoice {
  const beat = (b: Omit<VoiceBeat, 'secs'>): VoiceBeat => ({ ...b, secs: estimateSecs(b.say) });
  return {
    beats: [
      beat({ kind: 'phone', say: '¿Qué hace distinta una noche en Mansion Playroom?' }),
      beat({ kind: 'big', say: 'Primero: respeto. Siempre.', tag: '1 DE 3', big: 'RESPETO', sub: 'siempre.', key: 'respeto' }),
      beat({ kind: 'big', say: 'Segundo: consentimiento. Un sí claro, o no pasa nada.', tag: '2 DE 3', big: 'CONSENTIMIENTO', chips: ['SÍ claro ✓', '~NO pasa nada'], key: 'consentimiento' }),
      beat({ kind: 'big', say: 'Tercero: libertad. Ven como quieras ser.', tag: '3 DE 3', big: 'LIBERTAD', sub: 'sé como quieras.', key: 'libertad' }),
      beat({ kind: 'stamp', say: 'Solo para mayores de dieciocho.', big: '+18', key: 'dieciocho' }),
      beat({ kind: 'end', say: 'Mansion Playroom. Valparaíso.' }),
    ],
    voice: 'catalina',
    rate: 6,
    pitch: 0,
    handle: '@mansionplayroom.cl',
    city: 'VALPARAÍSO',
    voiceUrl: '',
    voiceHash: '',
  };
}
