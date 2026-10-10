/* Guiones de Reels (server/reelScript.ts genera el texto; esto lo revisa):
 * puntaje del gancho y tiempos de cada línea. Reglas simples en español,
 * inspiradas en hookscore.py / beats.py del paquete instagram-agent-skill (MIT).
 * Sirven para descartar ganchos flojos; NO predicen qué se va a viralizar
 * (el propio autor midió que eso no se puede leer del texto). */
import { humanizeEs } from './captionCheck';

export interface HookScore { score: number; label: 'fuerte' | 'ok' | 'débil'; notes: string[] }

const words = (s: string) => s.trim().split(/\s+/).filter(Boolean);
const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function scoreHookEs(hook: string): HookScore {
  const text = hook.trim();
  const f = fold(text);
  const notes: string[] = [];
  if (!text) return { score: 0, label: 'débil', notes: ['Vacío.'] };
  let score = 50;
  const n = words(text).length;
  if (n <= 12) score += 15;
  else if (n > 18) { score -= 20; notes.push(`Largo (${n} palabras): en 3 segundos se dicen unas 8 a 10.`); }

  const concrete = /\d/.test(text) || /\b(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre|lunes|martes|miercoles|jueves|viernes|sabado|domingo|playroom|mansion)\b/.test(f);
  if (concrete) score += 15; else notes.push('Sin nada concreto (número, día, nombre).');
  if (/\b(tu|te|ti|tus|contigo|ustedes)\b/.test(f)) score += 10;
  if (text.includes('?') || /\b(nadie|nunca|error|secreto|verdad|mito|confieso|pov)\b/.test(f)) score += 10;

  if (/^(hola|holi|buenas|hey|que tal)\b/.test(f)) { score -= 40; notes.push('Empieza saludando: nadie entró a Instagram a que lo saluden.'); }
  if (/\b(en este video|hoy (les|te) (voy|vamos) a|les quiero contar|te quiero contar|bienvenidos)\b/.test(f)) { score -= 30; notes.push('Preámbulo: anuncia en vez de decir.'); }
  if (/\b(deja de scrollear|para de scrollear|no scrollees|no pases de largo)\b/.test(f)) { score -= 25; notes.push('Pide atención en vez de ganársela.'); }
  const ai = humanizeEs(text).flags.length;
  if (ai > 0) { score -= Math.min(20, ai * 10); notes.push('Tiene muletillas que suenan a IA.'); }

  score = Math.max(0, Math.min(100, score));
  return { score, label: score >= 75 ? 'fuerte' : score >= 50 ? 'ok' : 'débil', notes };
}

export interface ReelBeatInput { say: string; screen: string }
export interface ReelBeat extends ReelBeatInput { start: number; end: number; secs: number }

export const REEL_WPM = 170;
export const REEL_MIN_SECS = 15;
export const REEL_MAX_SECS = 45;

/** "0:03.5" */
export function formatSecs(s: number): string {
  const m = Math.floor(s / 60);
  return `${m}:${(s - m * 60).toFixed(1).padStart(4, '0')}`;
}

/** Tiempos de cada línea (a `wpm` palabras por minuto, mínimo 1 s por línea) y avisos. */
export function beatSheet(lines: ReelBeatInput[], wpm = REEL_WPM): { beats: ReelBeat[]; total: number; warnings: string[] } {
  const beats: ReelBeat[] = [];
  let t = 0;
  for (const l of lines) {
    const secs = Math.max(1, Math.round((words(l.say).length / wpm) * 60 * 10) / 10);
    beats.push({ ...l, start: t, end: t + secs, secs });
    t = Math.round((t + secs) * 10) / 10;
  }
  const warnings: string[] = [];
  if (beats[0] && beats[0].secs > 3) warnings.push(`El gancho dura ${beats[0].secs}s: tiene que caber en 3 segundos.`);
  beats.slice(1).forEach((b, i) => { if (b.secs > 4) warnings.push(`La línea ${i + 2} dura ${b.secs}s: pártela o cambia la imagen a la mitad (en una imagen fija la gente se va).`); });
  if (t < REEL_MIN_SECS) warnings.push(`Dura ~${t}s: está bien corto; si se queda corto, suma una línea concreta.`);
  if (t > REEL_MAX_SECS) warnings.push(`Dura ~${t}s: pasa de ${REEL_MAX_SECS}s, recorta.`);
  if (beats.length >= 2) {
    const key = (s: string) => new Set(words(fold(s)).map((w) => w.replace(/[^a-z0-9]/g, '')).filter((w) => w.length >= 5));
    const first = key(beats[0].say);
    const last = key(beats[beats.length - 1].say);
    if (!Array.from(last).some((w) => first.has(w))) warnings.push('El final no vuelve al gancho: si la última línea repite una palabra del inicio, lo vuelven a ver (y eso suma alcance).');
  }
  return { beats, total: t, warnings };
}
