/* Piloto automático de un evento: lo prende el dueño con un botón y cada paso, a su hora, pide un cross check
 * (shared/crossCheck.ts). Nada sale sin «Reportar». Lógica pura: cuándo toca y hasta cuándo vale cada paso. */
import { startOfChileDay } from './chileDate';

export type PilotStepKey = 'anuncio' | 'aviso-diario' | 'compras-barra' | 'recordatorio-dia' | 'encuesta';

export interface PilotStepDef {
  key: PilotStepKey;
  title: string;
  /** Qué pasa al reportar, para la tarjeta del piloto. */
  detail: string;
  /** `start`: apenas se prende el piloto. Si no, `dias` respecto del día de la fiesta (−3 = tres días antes) a `hora` de Chile. */
  when: { start: true } | { dias: number; hora: number };
  /** Hasta cuándo vale, en horas desde el inicio de la fiesta (después ya no tiene sentido). */
  validUntilHours: number;
}

export const PILOT_STEPS: PilotStepDef[] = [
  { key: 'anuncio', title: 'Anunciar el evento en la app', detail: 'Push a todos los que tienen la app con el aviso de evento nuevo.', when: { start: true }, validUntilHours: 0 },
  { key: 'aviso-diario', title: 'Activar el aviso diario de venta', detail: 'Prende el correo diario a quienes no han comprado. Cada día te pedirá su propio cross check.', when: { start: true }, validUntilHours: 0 },
  { key: 'compras-barra', title: 'Lista de compras de la barra', detail: 'Cuánto falta de cada insumo para la gente esperada, según las fiestas anteriores.', when: { dias: -3, hora: 12 }, validUntilHours: 0 },
  { key: 'recordatorio-dia', title: 'Recordar la fiesta a quienes compraron', detail: 'Push el mismo día a quienes tienen entrada: «hoy es la fiesta».', when: { dias: 0, hora: 12 }, validUntilHours: 0 },
  { key: 'encuesta', title: 'Mandar la encuesta', detail: 'Correo con la encuesta a quienes fueron.', when: { dias: 1, hora: 13 }, validUntilHours: 96 },
];

export const PILOT_STEP_BY_KEY = new Map(PILOT_STEPS.map((s) => [s.key, s]));

const HOUR = 3_600_000;

/** Cuándo toca un paso. */
export function pilotStepTime(step: PilotStepDef, eventDate: Date, startedAt: Date): Date {
  if ('start' in step.when) return startedAt;
  // Mediodía del día que corresponde (así un cambio de horario no corre el día) y de ahí al inicio de ese día.
  const dayNoon = new Date(startOfChileDay(eventDate).getTime() + step.when.dias * 24 * HOUR + 12 * HOUR);
  return new Date(startOfChileDay(dayNoon).getTime() + step.when.hora * HOUR);
}

/** Hasta cuándo se puede pedir (y aprobar) un paso. */
export function pilotStepExpiry(step: PilotStepDef, eventDate: Date): Date {
  return new Date(eventDate.getTime() + step.validUntilHours * HOUR);
}

/** Los pasos que tocan ahora: ya llegó su hora y todavía valen. */
export function duePilotSteps(eventDate: Date, startedAt: Date, now: Date = new Date()): PilotStepDef[] {
  return PILOT_STEPS.filter((s) => pilotStepTime(s, eventDate, startedAt) <= now && now < pilotStepExpiry(s, eventDate));
}

export type PilotStepState = 'futuro' | 'esperando' | 'reportado' | 'descartado' | 'vencido' | 'fallo' | 'en curso';

export interface PilotStatus {
  eventId: number;
  on: boolean;
  startedAt: string | null;
  steps: { key: PilotStepKey; title: string; detail: string; at: string; state: PilotStepState; result: string | null; crossCheckId: number | null }[];
}
