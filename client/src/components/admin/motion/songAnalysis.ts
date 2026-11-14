import { upload } from '@vercel/blob/client';
import { analyzeSong, SONG_MAX_SECS, SONG_MIN_SECS, bestSongStart, type MotionSong } from '@shared/motionSong';

/* Subir y analizar la canción del video, todo en el navegador: el archivo va directo a Vercel Blob (igual que las
 * fotos, sin pasar por el servidor) y el análisis (tempo, pulso, golpes fuertes, energía) corre acá, sin costo. */

const SAMPLE_RATE = 22050;
export const SONG_ACCEPT = 'audio/mpeg,audio/mp4,audio/x-m4a,audio/aac,audio/wav,audio/x-wav,.mp3,.m4a,.wav,.aac';
export const SONG_MAX_BYTES = 50 * 1024 * 1024;

type OfflineCtor = new (channels: number, length: number, sampleRate: number) => OfflineAudioContext;

/** Decodifica el archivo a mono, 22 kHz (suficiente para el pulso y 6 veces más liviano que el original). */
async function decodeMono(file: File): Promise<Float32Array> {
  const Ctor: OfflineCtor | undefined = (window as unknown as { OfflineAudioContext?: OfflineCtor; webkitOfflineAudioContext?: OfflineCtor }).OfflineAudioContext
    ?? (window as unknown as { webkitOfflineAudioContext?: OfflineCtor }).webkitOfflineAudioContext;
  if (!Ctor) throw new Error('Este navegador no puede analizar audio. Prueba con Chrome o Safari actualizado.');
  const ctx = new Ctor(1, SAMPLE_RATE, SAMPLE_RATE);
  let buffer: AudioBuffer;
  try {
    buffer = await ctx.decodeAudioData(await file.arrayBuffer());
  } catch {
    throw new Error('No se pudo leer el audio. Usa un MP3, M4A o WAV sin protección.');
  }
  const frames = Math.min(buffer.length, SONG_MAX_SECS * buffer.sampleRate);
  const mono = new Float32Array(frames);
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const data = buffer.getChannelData(c);
    for (let i = 0; i < frames; i++) mono[i] += data[i] / buffer.numberOfChannels;
  }
  return mono;
}

export interface PickedSong {
  analysis: ReturnType<typeof analyzeSong>;
  sampleRate: number;
}

/** Lee el archivo y lo analiza (no lo sube). Lanza un error en español si no sirve. */
export async function analyzeSongFile(file: File): Promise<PickedSong> {
  if (file.size > SONG_MAX_BYTES) throw new Error('El archivo pesa más de 50 MB. Usa un MP3 más liviano.');
  const mono = await decodeMono(file);
  const secs = mono.length / SAMPLE_RATE;
  if (secs < SONG_MIN_SECS) throw new Error(`La canción dura ${Math.round(secs)} s: necesita al menos ${SONG_MIN_SECS} s para encontrar el ritmo.`);
  // Cede el hilo un instante para que el botón alcance a mostrar «Analizando…» antes del cálculo.
  await new Promise((r) => setTimeout(r, 30));
  return { analysis: analyzeSong(mono, SAMPLE_RATE), sampleRate: SAMPLE_RATE };
}

/** Sube el archivo a Vercel Blob y arma la canción lista para la receta, partiendo en su mejor tramo. */
export async function uploadAndBuildSong(file: File, picked: PickedSong, videoSecs: number): Promise<MotionSong> {
  const safe = file.name.replace(/[^\w.\-]+/g, '_').slice(-80);
  const blob = await upload(`studio-songs/${Date.now()}-${safe}`, file, { access: 'public', handleUploadUrl: '/api/admin/blob/upload' });
  const a = picked.analysis;
  const base: MotionSong = {
    url: blob.url,
    name: file.name.replace(/\.[a-z0-9]+$/i, '').slice(0, 80) || 'Canción',
    bpm: a.bpm,
    downbeat: a.downbeat,
    start: a.downbeat,
    duration: a.duration,
    energy: a.energy,
    hits: a.hits,
    volume: 0.9,
    muteOnExport: false,
  };
  return { ...base, start: bestSongStart(base, Math.min(videoSecs, a.duration)) };
}
