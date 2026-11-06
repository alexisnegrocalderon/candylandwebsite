/* Nota de voz del Asistente IA (como en WhatsApp): el teléfono graba, convierte a WAV 16 kHz mono (lo que acepta el
 * reconocimiento de voz de Azure en cualquier región) y el servidor lo transcribe (server/voiceNote.ts). */

/** Frecuencia del WAV que se manda a transcribir. */
export const VOICE_NOTE_RATE = 16_000;
/** Azure transcribe de una vez hasta 60 s: se corta un poco antes. */
export const VOICE_NOTE_MAX_SECS = 55;
/** Menos que esto es un toque, no una nota. */
export const VOICE_NOTE_MIN_SECS = 0.6;
/** Tope del WAV en base64 (55 s × 32 KB/s ≈ 1,8 MB → ~2,4 MB en base64, con margen). */
export const VOICE_NOTE_MAX_BASE64 = 3_000_000;

/** WAV PCM 16 bits mono a partir de muestras entre −1 y 1. */
export function encodeWavPcm16(samples: Float32Array, sampleRate: number = VOICE_NOTE_RATE): Uint8Array {
  const bytes = new Uint8Array(44 + samples.length * 2);
  const view = new DataView(bytes.buffer);
  const ascii = (offset: number, s: string) => { for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i)); };
  ascii(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  ascii(8, 'WAVE');
  ascii(12, 'fmt ');
  view.setUint32(16, 16, true); // tamaño del bloque fmt
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // bytes por segundo
  view.setUint16(32, 2, true); // bytes por muestra
  view.setUint16(34, 16, true); // bits
  ascii(36, 'data');
  view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return bytes;
}

/** ¿Es un WAV PCM 16 kHz mono de 16 bits como el que arma `encodeWavPcm16`? (el servidor no acepta otra cosa). */
export function isVoiceNoteWav(bytes: Uint8Array): boolean {
  if (bytes.length < 44) return false;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const ascii = (offset: number, n: number) => String.fromCharCode.apply(null, Array.from(bytes.subarray(offset, offset + n)));
  return ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WAVE' && view.getUint16(20, true) === 1 && view.getUint16(22, true) === 1
    && view.getUint32(24, true) === VOICE_NOTE_RATE && view.getUint16(34, true) === 16;
}

/** Duración en segundos de un WAV de nota de voz. */
export function voiceNoteSeconds(bytes: Uint8Array): number {
  return Math.max(0, bytes.length - 44) / (VOICE_NOTE_RATE * 2);
}

/** Pasa muestras de cualquier frecuencia (44,1 o 48 kHz en un teléfono) a 16 kHz, promediando las muestras que se
 * juntan para no meter ruido. Si la entrada ya es de 16 kHz o menos, la devuelve igual. */
export function downsampleTo16k(samples: Float32Array, inRate: number): Float32Array {
  if (inRate <= VOICE_NOTE_RATE) return samples;
  const ratio = inRate / VOICE_NOTE_RATE;
  const outLen = Math.floor(samples.length / ratio);
  const out = new Float32Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const from = Math.floor(i * ratio);
    const to = Math.min(samples.length, Math.max(from + 1, Math.floor((i + 1) * ratio)));
    let sum = 0;
    for (let j = from; j < to; j++) sum += samples[j];
    out[i] = sum / (to - from);
  }
  return out;
}

/** Une los trozos que fue entregando el micrófono en una sola tira. */
export function concatChunks(chunks: Float32Array[]): Float32Array {
  const out = new Float32Array(chunks.reduce((n, c) => n + c.length, 0));
  let at = 0;
  for (const c of chunks) { out.set(c, at); at += c.length; }
  return out;
}
