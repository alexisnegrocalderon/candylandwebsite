/* Plan de contenido para Instagram (server/contentPlanner.ts): un calendario
 * de publicaciones hasta el próximo evento. Acá vive lo PURO -- la ventana de
 * fechas, la forma del plan y su limpieza -- para poder probarlo sin IA.
 *
 * La IA escribe los textos, pero las FECHAS las valida el código: una pieza
 * con una fecha inventada, fuera de la ventana o repetida de más se descarta
 * en vez de llegar al calendario del dueño. */

export const CONTENT_FORMATS = ['post', 'reel', 'historia'] as const;
export type ContentFormat = (typeof CONTENT_FORMATS)[number];

export const CONTENT_GOALS = ['awareness', 'confianza', 'urgencia', 'conversion'] as const;
export type ContentGoal = (typeof CONTENT_GOALS)[number];

/** Cuántos días hacia adelante se planifica como máximo: más allá de eso la
 * gente ya no se acuerda del plan, y la fecha del evento puede cambiar. */
export const CONTENT_PLAN_MAX_DAYS = 21;
/** Tope de piezas por día (la última semana puede tener dos: cuenta regresiva). */
export const CONTENT_PLAN_MAX_PER_DAY = 2;
export const CONTENT_PLAN_MAX_PIECES = 24;

export interface ContentPiece {
  /** Día (YYYY-MM-DD, hora de Chile). */
  date: string;
  /** Hora sugerida (HH:MM, hora de Chile). */
  time: string;
  format: ContentFormat;
  goal: ContentGoal;
  /** La primera línea / el gancho que frena el scroll. */
  hook: string;
  /** Texto listo para copiar y pegar (sin links). */
  caption: string;
  /** Qué grabar o fotografiar. */
  visual: string;
  hashtags: string[];
  /** Palabra clave (de una automatización real) para que respondan a la
   * historia, o vacío. */
  keyword: string;
}

export interface ContentPlan {
  generatedAt: string;
  eventId: number;
  eventTitle: string;
  eventDate: string;
  from: string;
  to: string;
  summary: string;
  pieces: ContentPiece[];
}

/** YYYY-MM-DD de un instante, en hora de Chile (respeta el horario de
 * verano): el día en que la gente de Valparaíso lo vive, no el de UTC. */
export function chileIsoDate(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Suma días a un YYYY-MM-DD (al mediodía UTC, para que ningún cambio de hora
 * lo corra de día). */
export function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  return new Date(d.getTime() + days * DAY_MS).toISOString().slice(0, 10);
}

/** La ventana a planificar: desde mañana (hoy ya pasó) hasta el día ANTERIOR
 * al evento, con un máximo de `CONTENT_PLAN_MAX_DAYS` días. La publicación
 * del mismo día del evento sí cuenta (es la de "es hoy"), así que `to` es el
 * día del evento. Devuelve `null` si el evento es hoy o ya pasó. */
export function contentPlanWindow(now: Date, eventDate: Date): { from: string; to: string; days: number } | null {
  const today = chileIsoDate(now);
  const eventDay = chileIsoDate(eventDate);
  if (eventDay <= today) return null;
  const from = addDaysIso(today, 1);
  const lastAllowed = addDaysIso(today, CONTENT_PLAN_MAX_DAYS);
  const to = eventDay < lastAllowed ? eventDay : lastAllowed;
  const days = Math.round((new Date(`${to}T12:00:00Z`).getTime() - new Date(`${from}T12:00:00Z`).getTime()) / DAY_MS) + 1;
  return { from, to, days };
}

function isRealIsoDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  return new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value;
}

function cleanTime(value: unknown): string {
  if (typeof value === 'string') {
    const m = value.trim().match(/^(\d{1,2}):(\d{2})$/);
    if (m && Number(m[1]) <= 23 && Number(m[2]) <= 59) return `${m[1].padStart(2, '0')}:${m[2]}`;
  }
  return '19:00';
}

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/** Deja pasar solo lo que sirve: fecha real DENTRO de la ventana, formato y
 * objetivo conocidos, y texto no vacío. Máximo `CONTENT_PLAN_MAX_PER_DAY` por
 * día, ordenado por fecha y hora. */
export function cleanContentPieces(raw: unknown, window: { from: string; to: string }): ContentPiece[] {
  if (!Array.isArray(raw)) return [];
  const pieces: ContentPiece[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const r = item as Record<string, unknown>;
    if (!isRealIsoDate(r.date) || r.date < window.from || r.date > window.to) continue;
    const format = CONTENT_FORMATS.find((f) => f === r.format);
    const goal = CONTENT_GOALS.find((g) => g === r.goal);
    const hook = str(r.hook, 200);
    const caption = str(r.caption, 1200);
    if (!format || !goal || !hook || !caption) continue;
    pieces.push({
      date: r.date,
      time: cleanTime(r.time),
      format,
      goal,
      hook,
      caption,
      visual: str(r.visual, 600),
      hashtags: Array.isArray(r.hashtags)
        ? r.hashtags.filter((h): h is string => typeof h === 'string' && h.trim().length > 0).map((h) => (h.trim().startsWith('#') ? h.trim() : `#${h.trim()}`)).slice(0, 8)
        : [],
      keyword: str(r.keyword, 60),
    });
  }
  pieces.sort((a, b) => (a.date === b.date ? a.time.localeCompare(b.time) : a.date.localeCompare(b.date)));

  const perDay = new Map<string, number>();
  const kept: ContentPiece[] = [];
  for (const p of pieces) {
    const n = perDay.get(p.date) ?? 0;
    if (n >= CONTENT_PLAN_MAX_PER_DAY) continue;
    perDay.set(p.date, n + 1);
    kept.push(p);
  }
  return kept.slice(0, CONTENT_PLAN_MAX_PIECES);
}

/** `null` si el plan guardado (en el navegador) está roto o es de otra forma. */
export function normalizeContentPlan(raw: unknown): ContentPlan | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.generatedAt !== 'string' || typeof r.eventTitle !== 'string' || !isRealIsoDate(r.from) || !isRealIsoDate(r.to)) return null;
  const eventId = Number(r.eventId);
  if (!Number.isFinite(eventId)) return null;
  return {
    generatedAt: r.generatedAt,
    eventId,
    eventTitle: r.eventTitle,
    eventDate: typeof r.eventDate === 'string' ? r.eventDate : r.generatedAt,
    from: r.from,
    to: r.to,
    summary: str(r.summary, 1500),
    pieces: cleanContentPieces(r.pieces, { from: r.from, to: r.to }),
  };
}
