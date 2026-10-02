/* Encuesta post-fiesta (server/eventSurvey.ts). Acá vive lo PURO: cuándo se
 * manda, cómo se valida una respuesta, las estadísticas y la forma del
 * análisis de la IA -- para que servidor y panel usen lo mismo y se pueda
 * probar sin base de datos ni IA. */

const HOUR_MS = 60 * 60 * 1000;

/** El correo sale desde el mediodía del día siguiente (hora de Chile) -- la
 * fiesta termina de madrugada y nadie contesta nada a las 5 am --, y solo
 * hasta las 20:00 para no mandarlo de noche. */
export const SURVEY_SEND_HOUR_FROM = 12;
export const SURVEY_SEND_HOUR_UNTIL = 20;

/** Un evento entra a la ronda de envío entre 12 horas y 6 días después de su
 * hora de inicio: antes, la fiesta ni terminó; después, ya es tarde para que
 * la gente se acuerde. Son 6 y no 4 porque el cupo diario de correos
 * automáticos (60 por defecto) es el que manda: una fiesta grande tarda
 * varios días en terminar de salir. */
export const SURVEY_WINDOW_MIN_HOURS = 12;
export const SURVEY_WINDOW_MAX_HOURS = 144;

/** Cuántos correos como máximo por corrida del cron. Resend responde en
 * ~100-300 ms cada uno: con 40 queda lejos de cualquier tope de tiempo, y lo
 * que no alcance sale en la corrida de la hora siguiente. */
export const SURVEY_BATCH_SIZE = 40;

/** Intentos de envío por dirección antes de dejarla. */
export const SURVEY_MAX_SEND_ATTEMPTS = 3;

/** Mínimo de respuestas para pedirle un análisis a la IA: con menos, "las
 * quejas repetidas" no significan nada. */
export const SURVEY_MIN_RESPONSES_FOR_ANALYSIS = 3;

export function isSurveySendHour(chileHour: number): boolean {
  return chileHour >= SURVEY_SEND_HOUR_FROM && chileHour <= SURVEY_SEND_HOUR_UNTIL;
}

export function isInSurveyWindow(eventDate: Date, now: Date): boolean {
  const elapsedHours = (now.getTime() - eventDate.getTime()) / HOUR_MS;
  return elapsedHours >= SURVEY_WINDOW_MIN_HOURS && elapsedHours <= SURVEY_WINDOW_MAX_HOURS;
}

const MAX_COMMENT_CHARS = 1000;

export type SurveyAnswer = { rating: number; liked: string; improve: string };

/** Valida y limpia una respuesta. `null` si la nota no es un entero de 1 a 5
 * -- lo único obligatorio; los dos comentarios son opcionales. */
export function parseSurveyAnswer(input: { rating: unknown; liked?: unknown; improve?: unknown }): SurveyAnswer | null {
  const rating = Number(input.rating);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return null;
  const clean = (v: unknown) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, MAX_COMMENT_CHARS) : '');
  return { rating, liked: clean(input.liked), improve: clean(input.improve) };
}

export interface SurveyStats {
  responses: number;
  average: number | null;
  /** Cuántas respuestas hubo con 1, 2, 3, 4 y 5 estrellas (en ese orden). */
  distribution: [number, number, number, number, number];
}

export function computeSurveyStats(ratings: number[]): SurveyStats {
  const distribution: SurveyStats['distribution'] = [0, 0, 0, 0, 0];
  let sum = 0;
  let responses = 0;
  for (const r of ratings) {
    if (!Number.isInteger(r) || r < 1 || r > 5) continue;
    distribution[r - 1] += 1;
    sum += r;
    responses += 1;
  }
  return { responses, average: responses > 0 ? Math.round((sum / responses) * 10) / 10 : null, distribution };
}

/** Análisis de la IA de las respuestas de una fiesta. */
export interface SurveyAnalysis {
  generatedAt: string;
  /** Con cuántas respuestas se hizo -- si después llegan más, el panel avisa
   * que el análisis quedó viejo. */
  basedOnResponses: number;
  summary: string;
  praised: string[];
  complaints: string[];
  improvements: string[];
}

const strings = (raw: unknown): string[] =>
  Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string' && x.trim().length > 0) : [];

/** `null` si no hay análisis guardado (o está roto). */
export function normalizeSurveyAnalysis(raw: unknown): SurveyAnalysis | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.generatedAt !== 'string' || typeof r.summary !== 'string') return null;
  const based = Number(r.basedOnResponses);
  return {
    generatedAt: r.generatedAt,
    basedOnResponses: Number.isFinite(based) ? based : 0,
    summary: r.summary,
    praised: strings(r.praised),
    complaints: strings(r.complaints),
    improvements: strings(r.improvements),
  };
}
