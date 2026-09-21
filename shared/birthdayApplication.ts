/* Postulación al programa Cumpleañeros: validación, ventana de elegibilidad y
 * contenido, compartidos entre la página pública y el servidor.
 *
 * Mismo motivo que shared/ambassadorApplication.ts: los requisitos viven acá
 * y no hardcodeados en la página, para que el correo de confirmación repita
 * exactamente lo que la persona leyó antes de postular. */

export type Check<T> = { ok: true; value: T } | { ok: false; reason: string };

export const MIN_APPLICANT_NAME_LENGTH = 3;
export const MAX_APPLICANT_NAME_LENGTH = 80;
export const MAX_APPLICATION_MESSAGE_LENGTH = 500;

/** Cuántos días antes o después de la fecha del evento puede caer el
 * cumpleaños para poder postular. */
export const BIRTHDAY_WINDOW_DAYS = 5;

export const BIRTHDAY_REQUIREMENTS: string[] = [
  `Tu cumpleaños debe caer dentro de ${BIRTHDAY_WINDOW_DAYS} días antes o después de la fecha del evento`,
  'Postula por cada evento en el que quieras participar (no es automático de una fiesta a otra)',
  'Comparte tu código con tus invitados para que sus entradas cuenten para tus premios',
];

/** Reutiliza exactamente la validación de shared/ambassadorApplication.ts
 * (mismo formato de nombre chileno para un formulario público). */
export function sanitizeApplicantName(raw: string): Check<string> {
  const value = (raw ?? '').replace(/\s+/g, ' ').trim();
  if (value.length < MIN_APPLICANT_NAME_LENGTH) return { ok: false, reason: 'Escribe tu nombre completo' };
  if (value.length > MAX_APPLICANT_NAME_LENGTH) {
    return { ok: false, reason: `Máximo ${MAX_APPLICANT_NAME_LENGTH} caracteres` };
  }
  return { ok: true, value };
}

/** Móvil chileno -- misma normalización que ambassadorApplication.ts, para
 * que ambos formularios guarden el número siempre igual. */
export function sanitizeWhatsapp(raw: string): Check<string> {
  const digits = (raw ?? '').replace(/\D/g, '');
  if (!digits) return { ok: false, reason: 'Escribe tu WhatsApp' };

  let local = digits;
  if (local.startsWith('56')) local = local.slice(2);
  if (local.startsWith('0')) local = local.replace(/^0+/, '');

  if (local.length !== 9) {
    return { ok: false, reason: 'Revisa el número: un móvil chileno tiene 9 dígitos y empieza con 9' };
  }
  if (!local.startsWith('9')) {
    return { ok: false, reason: 'Tiene que ser un celular, que empieza con 9' };
  }

  return { ok: true, value: `+56${local}` };
}

/** Instagram opcional acá (a diferencia de embajadores, donde es obligatorio) */
export function sanitizeInstagram(raw: string): Check<string> {
  let value = (raw ?? '').trim();
  if (!value) return { ok: true, value: '' };

  const urlMatch = value.match(/(?:instagram\.com|instagr\.am)\/+([^/?#\s]+)/i);
  if (urlMatch) value = urlMatch[1];
  value = value.replace(/^@+/, '').replace(/\/+$/, '').trim();

  if (!value) return { ok: true, value: '' };
  if (value.length > 30) return { ok: false, reason: 'Ese usuario de Instagram es demasiado largo' };
  if (!/^[A-Za-z0-9._]+$/.test(value)) {
    return { ok: false, reason: 'El usuario de Instagram solo puede tener letras, números, puntos y guion bajo' };
  }
  return { ok: true, value };
}

export function sanitizeApplicationMessage(raw: string): Check<string> {
  const value = (raw ?? '').replace(/\s+/g, ' ').trim();
  if (value.length > MAX_APPLICATION_MESSAGE_LENGTH) {
    return { ok: false, reason: `Máximo ${MAX_APPLICATION_MESSAGE_LENGTH} caracteres` };
  }
  return { ok: true, value };
}

/** Fecha de nacimiento en formato `YYYY-MM-DD` (lo que entrega un
 * `<input type="date">`). Solo se usan día y mes para la ventana de
 * elegibilidad -- el año no importa, pero se valida que sea una fecha real
 * y no futura para evitar basura evidente en el formulario. */
export function sanitizeBirthDate(raw: string): Check<string> {
  const value = (raw ?? '').trim();
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return { ok: false, reason: 'Escribe tu fecha de nacimiento' };

  const [, y, m, d] = match;
  const year = Number(y);
  const month = Number(m);
  const day = Number(d);
  const date = new Date(Date.UTC(year, month - 1, day));
  const isRealDate = date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
  if (!isRealDate) return { ok: false, reason: 'Esa fecha no existe' };

  const currentYear = new Date().getFullYear();
  if (year < currentYear - 100 || year > currentYear) {
    return { ok: false, reason: 'Revisa el año de nacimiento' };
  }

  return { ok: true, value };
}

function toTime(value: Date | string | null | undefined): number | null {
  if (!value) return null;
  const t = new Date(value).getTime();
  return Number.isFinite(t) ? t : null;
}

/** Diferencia en días de calendario entre `eventDate` y el próximo
 * cumpleaños (día/mes de `birthMonth`/`birthDay`), probando el año del
 * evento y los años adyacentes para que un cumpleaños que cae justo al
 * cruzar de año (ej. evento 30-dic, cumpleaños 2-ene) se calcule bien. */
function daysBetweenIgnoringYear(eventDate: Date, birthMonth: number, birthDay: number): number | null {
  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  const eventYear = eventDate.getFullYear();
  let minDiff: number | null = null;

  for (const year of [eventYear - 1, eventYear, eventYear + 1]) {
    const candidate = new Date(year, birthMonth - 1, birthDay);
    if (Number.isNaN(candidate.getTime())) continue;
    const eventMidnight = new Date(eventDate.getFullYear(), eventDate.getMonth(), eventDate.getDate());
    const candidateMidnight = new Date(candidate.getFullYear(), candidate.getMonth(), candidate.getDate());
    const diffDays = Math.round(Math.abs(eventMidnight.getTime() - candidateMidnight.getTime()) / MS_PER_DAY);
    if (minDiff === null || diffDays < minDiff) minDiff = diffDays;
  }

  return minDiff;
}

/** El chequeo central del programa: ¿el cumpleaños declarado cae dentro de
 * la ventana de `windowDays` respecto a la fecha del evento? Se usa tanto en
 * el formulario público (UX, para no dejar postular fuera de ventana) como
 * en el servidor (autorización real, ver server/birthdayApplications.ts). */
export function isBirthdayEligible(
  eventDate: Date | string,
  birthDate: string,
  windowDays: number = BIRTHDAY_WINDOW_DAYS,
): boolean {
  const eventTime = toTime(eventDate);
  if (eventTime === null) return false;

  const match = birthDate.match(/^\d{4}-(\d{2})-(\d{2})$/);
  if (!match) return false;
  const [, m, d] = match;

  const diff = daysBetweenIgnoringYear(new Date(eventTime), Number(m), Number(d));
  return diff !== null && diff <= windowDays;
}
