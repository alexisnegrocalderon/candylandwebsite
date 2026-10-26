/* Cuenta regresiva del Estudio («Faltan sólo 8 días para…»): el reel
 * que más se repite, armado desde los datos del evento. Es el primer formato
 * del «estilo Playroom» de los reels de motion graphics (con los colores de la marca): gancho en el primer
 * segundo, una frase por momento y un cierre fijo (fecha y hora, «comenta X y
 * revisa tu DM», ciudad).
 *
 * Acá vive lo PURO: la forma de la cuenta, los colores de cada evento, los
 * días que faltan (en hora de Chile) y el video ya armado. La composición HTML
 * de HyperFrames está en studioCountdownHtml.ts. */

import { CHILE_TZ, chileDateKey, formatChileDate, formatChileTime } from './chileDate';
import type { StudioVideo, VideoEvent } from './studioVideo';

/** Colores de la marca (PlayRoom Design System: fondo liso de un solo color, sin degradados).
 * Cada «look» es un fondo de la marca con sus acentos:
 * - `bg`: el fondo, el hex exacto de la marca.
 * - `big`/`bigShadow`: el número y el nombre del evento (relleno y sombra dura).
 * - `box`/`boxText`: sello, fecha y línea «comenta…».
 * - `tag`/`tagText`: la etiqueta de arriba. `line`: barras y esquinas. `ink`: sombra del texto.
 * - `ghostA`/`ghostB`: las dos copias de color del glitch. */
export const COUNTDOWN_LOOKS = {
  celeste: {
    label: 'Celeste (fondo de la marca)',
    bg: '#00A3FF',
    big: '#FFFFFF', bigShadow: '#FF008E',
    box: '#FF008E', boxText: '#FFFFFF',
    tag: '#FFFFFF', tagText: '#FF008E',
    line: '#FFFFFF', ink: '#0010DF',
    ghostA: '#FF008E', ghostB: '#0010DF',
  },
  rosa: {
    label: 'Rosa (fondo de la marca)',
    bg: '#EF8DFF',
    big: '#FFFFFF', bigShadow: '#00A3FF',
    box: '#00A3FF', boxText: '#FFFFFF',
    tag: '#FFFFFF', tagText: '#0010DF',
    line: '#FFFFFF', ink: '#0010DF',
    ghostA: '#00A3FF', ghostB: '#0010DF',
  },
} as const;
export type CountdownLook = keyof typeof COUNTDOWN_LOOKS;
export const COUNTDOWN_LOOK_KEYS = Object.keys(COUNTDOWN_LOOKS) as CountdownLook[];

/** Lo que dura el reel: entra todo en ~4 s y el resto es para leerlo. */
export const COUNTDOWN_SECS = 6.5;
export const COUNTDOWN_MAX_DAYS = 99;

/** Todo lo que se ve en pantalla, ya en su texto final (se puede cambiar cada uno). */
export interface VideoCountdown {
  look: CountdownLook;
  /** Días que faltan: de acá salen los textos de abajo cuando se cambian. */
  days: number;
  /** «FALTAN SÓLO...» */
  lead: string;
  /** El número grande («8») o «HOY». */
  number: string;
  /** «DÍAS»; vacío = sin sello. */
  unit: string;
  /** «PARA..» */
  connector: string;
  /** «REDROOM» */
  eventName: string;
  /** «SÁB|06 21HRS» */
  dateLabel: string;
  /** «YA TIENES TU ENTRADA?» */
  question: string;
  /** La palabra que se comenta para recibir el link por DM; vacía = sin esa línea. */
  keyword: string;
  /** «VALPARAÍSO». Solo la ciudad: la dirección se entrega solo a quien compró. */
  location: string;
}

const LIMITS = { lead: 30, number: 4, unit: 10, connector: 30, eventName: 30, dateLabel: 24, question: 34, keyword: 24, location: 30 } as const;

/** Sin recortar los bordes: mientras se escribe, un espacio al final es el de la próxima palabra
 * (la composición sí los recorta). */
function text(value: unknown, max: number): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').slice(0, max).toUpperCase() : '';
}

/** Los textos que dependen de los días: «FALTAN SÓLO... 8 DÍAS», «FALTA SÓLO... 1 DÍA» o «ES... HOY». */
export function countdownTexts(days: number): Pick<VideoCountdown, 'lead' | 'number' | 'unit' | 'connector'> {
  if (days <= 0) return { lead: 'ES...', number: 'HOY', unit: '', connector: 'LA NOCHE DE..' };
  if (days === 1) return { lead: 'FALTA SÓLO...', number: '1', unit: 'DÍA', connector: 'PARA..' };
  return { lead: 'FALTAN SÓLO...', number: String(days), unit: 'DÍAS', connector: 'PARA..' };
}

/** Deja solo lo válido; sin nombre de evento no hay cuenta. */
export function normalizeCountdown(raw: unknown): VideoCountdown | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  const eventName = text(r.eventName, LIMITS.eventName);
  if (!eventName.trim()) return undefined;
  const n = Number(r.days);
  const days = Number.isFinite(n) ? Math.min(COUNTDOWN_MAX_DAYS, Math.max(0, Math.round(n))) : 0;
  const auto = countdownTexts(days);
  const number = text(r.number, LIMITS.number).trim() ? text(r.number, LIMITS.number) : auto.number;
  return {
    look: typeof r.look === 'string' && (COUNTDOWN_LOOK_KEYS as string[]).includes(r.look) ? (r.look as CountdownLook) : 'celeste',
    days,
    lead: text(r.lead, LIMITS.lead).trim() ? text(r.lead, LIMITS.lead) : auto.lead,
    number,
    // Una cadena vacía es una decisión («HOY» no lleva sello), no un olvido.
    unit: typeof r.unit === 'string' ? text(r.unit, LIMITS.unit) : auto.unit,
    connector: typeof r.connector === 'string' ? text(r.connector, LIMITS.connector) : auto.connector,
    eventName,
    dateLabel: text(r.dateLabel, LIMITS.dateLabel),
    question: text(r.question, LIMITS.question),
    keyword: text(r.keyword, LIMITS.keyword),
    location: text(r.location, LIMITS.location),
  };
}

/** Días que faltan para el evento, contando días de calendario de Chile (no horas): el
 * sábado a las 21:00 faltan 8 días el viernes anterior, a cualquier hora del día. */
export function countdownDaysLeft(eventDate: Date | string, now: Date = new Date()): number {
  const day = (d: Date | string) => Date.parse(`${chileDateKey(d)}T00:00:00Z`);
  return Math.max(0, Math.round((day(eventDate) - day(now)) / 86_400_000));
}

/** «SÁB|06 21HRS» (con minutos solo si no son en punto: «21:30HRS»), en hora de Chile. */
export function countdownDateLabel(date: Date | string): string {
  const d = date instanceof Date ? date : new Date(date);
  const weekday = d.toLocaleDateString('es-CL', { weekday: 'short', timeZone: CHILE_TZ }).replace('.', '').slice(0, 3);
  const day = d.toLocaleDateString('es-CL', { day: '2-digit', timeZone: CHILE_TZ });
  return `${weekday}|${day} ${formatChileTime(d).replace(/:00$/, '')}HRS`.toUpperCase();
}

/** La palabra que se comenta: la primera del nombre del evento, sin signos. */
function keywordFor(eventName: string): string {
  return (eventName.split(/\s+/)[0] ?? '').replace(/[^A-Za-z0-9ÁÉÍÓÚÜÑáéíóúüñ]/g, '').toUpperCase();
}

/** La cuenta regresiva de un evento, con sus datos reales (hora de Chile). La
 * foto o el video de fondo es el del evento si lo tiene; se cambia en el editor. */
export function countdownVideo(event: VideoEvent, opts: { now?: Date; look?: CountdownLook; location?: string } = {}): StudioVideo {
  const date = event.doorsOpen ?? event.eventDate;
  const days = Math.min(COUNTDOWN_MAX_DAYS, countdownDaysLeft(event.eventDate, opts.now));
  const eventName = event.title.trim().toUpperCase().slice(0, LIMITS.eventName);
  const countdown = normalizeCountdown({
    look: opts.look ?? 'celeste',
    days,
    ...countdownTexts(days),
    eventName,
    dateLabel: countdownDateLabel(date),
    question: 'YA TIENES TU ENTRADA?',
    keyword: keywordFor(eventName),
    location: opts.location ?? 'VALPARAÍSO',
  })!;
  const when = days <= 0 ? 'Es hoy' : days === 1 ? 'Falta 1 día' : `Faltan ${days} días`;
  return {
    title: `Cuenta regresiva ${event.title}`,
    template: 'cuenta',
    format: 'reel',
    theme: 'bubble',
    eventId: event.id,
    caption: [
      `${when} para ${event.title} · ${formatChileDate(event.eventDate)}`,
      countdown.keyword ? `🎟️ Comenta “${countdown.keyword}” y revisa tu DM, o entradas en mansionplayroom.cl (link en la bio).` : '🎟️ Entradas en mansionplayroom.cl (link en la bio).',
      '#MansionPlayroom #FiestaLiberal #VinaDelMar',
    ].join('\n\n'),
    mediaUrl: event.imageUrl?.trim() ?? '',
    scenes: [],
    cta: '',
    ctaLine: '',
    design: null,
    secsPerSlide: 2.5,
    countdown,
  };
}
