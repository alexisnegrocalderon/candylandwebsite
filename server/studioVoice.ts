import { put } from '@vercel/blob';
import { ENV } from './_core/env';
import {
  TTS_VOICES, VOICE_GAP, VOICE_LEAD, VOICE_MAX_CHARS, VOICE_MAX_SAY, VOICE_PITCH_RANGE, VOICE_RATE_RANGE, VOICE_TAIL,
  voiceScriptHash, type TtsVoice,
} from '../shared/studioVoice';

/* Voz de los reels del Estudio: Azure Speech con voces chilenas (es-CL).
 *
 * Una llamada por frase (así se sabe cuánto dura cada una y el texto cae en su
 * ritmo), se unen en un solo WAV con las pausas de shared/studioVoice.ts y se
 * sube a Vercel Blob. Sin ffmpeg: Azure devuelve PCM sin comprimir y el largo
 * sale de los bytes. El plan gratis de Azure cubre 500.000 letras al mes. */

const RATE = 24000; // muestras por segundo (riff-24khz-16bit-mono-pcm)
const BYTES_PER_SEC = RATE * 2;
const blobToken = () => process.env.BLOB_READ_WRITE_TOKEN || process.env.NEW_BLOB_READ_WRITE_TOKEN;

export function voiceMissingConfig(): string[] {
  const missing: string[] = [];
  if (!ENV.azureSpeechKey) missing.push('AZURE_SPEECH_KEY');
  if (!ENV.azureSpeechRegion) missing.push('AZURE_SPEECH_REGION');
  if (!blobToken()) missing.push('BLOB_READ_WRITE_TOKEN (Vercel Blob)');
  return missing;
}

/** Cómo se dicen en chileno las marcas con nombre en inglés (el texto en pantalla no cambia). */
export function pronounce(text: string): string {
  return text
    .replace(/\bplay\s?room\b/gi, 'Pleirrum')
    .replace(/\bplaymore\b/gi, 'Pleimor')
    .replace(/\bplaymatch\b/gi, 'Pleimach')
    .replace(/\+\s?18\b/g, 'más dieciocho');
}

const xml = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const pct = (n: number) => `${n >= 0 ? '+' : ''}${n}%`;
const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, Math.round(Number.isFinite(n) ? n : 0)));

export function buildSsml(text: string, o: { voice: TtsVoice; rate: number; pitch: number }): string {
  const rate = clamp(o.rate, VOICE_RATE_RANGE.min, VOICE_RATE_RANGE.max);
  const pitch = clamp(o.pitch, VOICE_PITCH_RANGE.min, VOICE_PITCH_RANGE.max);
  return `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="es-CL"><voice name="${TTS_VOICES[o.voice].name}"><prosody rate="${pct(rate)}" pitch="${pct(pitch)}">${xml(pronounce(text.trim()))}</prosody></voice></speak>`;
}

/** El audio (PCM de 16 bits) dentro de un WAV: busca el trozo «data» en vez de suponer 44 bytes. */
export function pcmFromWav(wav: Buffer): Buffer {
  if (wav.length < 12 || wav.toString('ascii', 0, 4) !== 'RIFF') throw new Error('Azure devolvió un audio que no es WAV.');
  let pos = 12;
  while (pos + 8 <= wav.length) {
    const id = wav.toString('ascii', pos, pos + 4);
    const size = wav.readUInt32LE(pos + 4);
    if (id === 'data') {
      // Con audio en vivo el tamaño puede venir en 0 o 0xFFFFFFFF: se toma hasta el final.
      const end = size === 0 || size === 0xffffffff || pos + 8 + size > wav.length ? wav.length : pos + 8 + size;
      return wav.subarray(pos + 8, end);
    }
    pos += 8 + size + (size % 2);
  }
  throw new Error('El audio de Azure no trae datos.');
}

function wavOf(pcm: Buffer): Buffer {
  const header = Buffer.alloc(44);
  header.write('RIFF', 0); header.writeUInt32LE(36 + pcm.length, 4); header.write('WAVE', 8);
  header.write('fmt ', 12); header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22);
  header.writeUInt32LE(RATE, 24); header.writeUInt32LE(BYTES_PER_SEC, 28); header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34);
  header.write('data', 36); header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

const silence = (secs: number) => Buffer.alloc(Math.round(secs * RATE) * 2);

/** Sube el volumen hasta que el pico llegue a ~-1 dB (así todas las voces suenan parejo). */
function normalizePeak(pcm: Buffer): Buffer {
  let peak = 0;
  for (let i = 0; i + 1 < pcm.length; i += 2) peak = Math.max(peak, Math.abs(pcm.readInt16LE(i)));
  if (peak < 200) return pcm;
  const gain = Math.min(4, 29000 / peak);
  if (Math.abs(gain - 1) < 0.03) return pcm;
  const out = Buffer.alloc(pcm.length);
  for (let i = 0; i + 1 < pcm.length; i += 2) out.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(pcm.readInt16LE(i) * gain))), i);
  return out;
}

/** Une las frases con el silencio del principio, entre frases y al final. Devuelve el WAV y lo que dura cada frase. */
export function joinTrack(pcms: Buffer[]): { wav: Buffer; secs: number[] } {
  const parts: Buffer[] = [silence(VOICE_LEAD)];
  pcms.forEach((p, i) => { parts.push(p); if (i < pcms.length - 1) parts.push(silence(VOICE_GAP)); });
  parts.push(silence(VOICE_TAIL));
  return { wav: wavOf(Buffer.concat(parts)), secs: pcms.map((p) => Math.round((p.length / BYTES_PER_SEC) * 100) / 100) };
}

async function synthesize(text: string, o: { voice: TtsVoice; rate: number; pitch: number }): Promise<Buffer> {
  const res = await fetch(`https://${ENV.azureSpeechRegion}.tts.speech.microsoft.com/cognitiveservices/v1`, {
    method: 'POST',
    headers: {
      'Ocp-Apim-Subscription-Key': ENV.azureSpeechKey,
      'Content-Type': 'application/ssml+xml',
      'X-Microsoft-OutputFormat': 'riff-24khz-16bit-mono-pcm',
      'User-Agent': 'mansion-playroom-studio',
    },
    body: buildSsml(text, o),
  });
  if (!res.ok) {
    const detail = (await res.text().catch(() => '')).slice(0, 160);
    console.error('[StudioVoice] Azure respondió', res.status, detail);
    throw new Error(res.status === 401 || res.status === 403
      ? 'Azure rechazó la clave de voz (AZURE_SPEECH_KEY o AZURE_SPEECH_REGION incorrectos).'
      : res.status === 429 ? 'Azure dice que se pasó de la cuota de voz. Prueba de nuevo en un minuto.'
        : `Azure no pudo generar la voz (${res.status}).`);
  }
  return pcmFromWav(Buffer.from(await res.arrayBuffer()));
}

export interface GeneratedVoice { voiceUrl: string; voiceHash: string; secs: number[] }

export async function generateVoice(input: { says: string[]; voice: TtsVoice; rate: number; pitch: number }): Promise<GeneratedVoice> {
  const missing = voiceMissingConfig();
  if (missing.length) throw new Error(`Falta configurar la voz: ${missing.join(', ')}.`);
  const says = input.says.map((s) => s.trim().slice(0, VOICE_MAX_SAY));
  if (says.length === 0 || says.some((s) => !s)) throw new Error('Todas las escenas necesitan una frase para la voz.');
  if (says.join('').length > VOICE_MAX_CHARS) throw new Error(`El guion es muy largo para una voz (máximo ${VOICE_MAX_CHARS} letras).`);
  const opts = { voice: input.voice, rate: input.rate, pitch: input.pitch };
  const pcms: Buffer[] = [];
  for (const say of says) pcms.push(normalizePeak(await synthesize(say, opts)));
  const { wav, secs } = joinTrack(pcms);
  const hash = voiceScriptHash({ says, ...opts });
  const blob = await put(`studio-voice/voz-${hash}.wav`, wav, { access: 'public', token: blobToken(), contentType: 'audio/wav', addRandomSuffix: true });
  return { voiceUrl: blob.url, voiceHash: hash, secs };
}
