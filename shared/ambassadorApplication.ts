/* Postulación para ser embajador VIP: validación y contenido, compartidos
 * entre la página pública y el servidor.
 *
 * ⚠️ Ojo con los sanitizadores de `shared/party.ts`: ésos rechazan a propósito
 * los @handles, los links y los números de teléfono, porque en la fiesta la
 * gente se conoce adentro y no se intercambia redes. Acá el WhatsApp y el
 * Instagram son justamente lo que hay que aceptar, así que la validación es
 * propia y no se reusa ninguna de esas.
 *
 * Los requisitos y las tareas viven acá y no en la página para que el correo
 * de confirmación repita EXACTAMENTE lo mismo que la persona leyó antes de
 * postular -- si estuvieran duplicados, tarde o temprano dirían cosas
 * distintas. */

export type Check<T> = { ok: true; value: T } | { ok: false; reason: string };

export const MIN_INSTAGRAM_FOLLOWERS = 1000;

export const MIN_APPLICANT_NAME_LENGTH = 3;
export const MAX_APPLICANT_NAME_LENGTH = 80;
export const MAX_APPLICATION_MESSAGE_LENGTH = 500;

/** Lo que la persona tiene que cumplir para postular. Se muestra en la página
 * y se repite en el correo de confirmación. */
export const AMBASSADOR_REQUIREMENTS: string[] = [
  'Ser mayor de 18 años',
  `Tener al menos ${MIN_INSTAGRAM_FOLLOWERS.toLocaleString('es-CL')} seguidores en Instagram`,
  'Cuenta de Instagram pública y activa',
];

/** A qué se compromete. Asistir a la fiesta NO está acá a propósito: el dueño
 * decidió que no es obligatorio. */
export const AMBASSADOR_TASKS: string[] = [
  'Publicar historias cada semana con el material que te enviamos',
  'Una publicación en el feed por cada evento',
  'Difundir tu código personal con tu círculo',
];

/** Handle de Instagram desde cualquier forma en que la gente lo escribe:
 * `@sofia`, `sofia`, `instagram.com/sofia` o la URL completa con o sin barra
 * final. Devuelve el handle pelado, sin arroba. */
export function sanitizeInstagram(raw: string): Check<string> {
  let value = (raw ?? '').trim();
  if (!value) return { ok: false, reason: 'Escribe tu Instagram' };

  // Si pegó la URL, se saca todo lo que va antes del handle.
  const urlMatch = value.match(/(?:instagram\.com|instagr\.am)\/+([^/?#\s]+)/i);
  if (urlMatch) value = urlMatch[1];

  value = value.replace(/^@+/, '').replace(/\/+$/, '').trim();

  if (!value) return { ok: false, reason: 'Escribe tu Instagram' };
  if (value.length > 30) return { ok: false, reason: 'Ese usuario de Instagram es demasiado largo' };
  if (!/^[A-Za-z0-9._]+$/.test(value)) {
    return { ok: false, reason: 'El usuario de Instagram solo puede tener letras, números, puntos y guion bajo' };
  }

  return { ok: true, value };
}

/** Móvil chileno, tolerando cómo la gente escribe de verdad su número:
 * `+56 9 1234 5678`, `56912345678`, `912345678`, `9 1234 5678`. Devuelve
 * siempre `+569XXXXXXXX` para que todos queden guardados igual. */
export function sanitizeWhatsapp(raw: string): Check<string> {
  const digits = (raw ?? '').replace(/\D/g, '');
  if (!digits) return { ok: false, reason: 'Escribe tu WhatsApp' };

  // Se normaliza a los 9 dígitos del móvil (9 + 8 dígitos), saquen o no el
  // código de país y el 0 de larga distancia.
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

export function sanitizeApplicantName(raw: string): Check<string> {
  const value = (raw ?? '').replace(/\s+/g, ' ').trim();
  if (value.length < MIN_APPLICANT_NAME_LENGTH) return { ok: false, reason: 'Escribe tu nombre completo' };
  if (value.length > MAX_APPLICANT_NAME_LENGTH) {
    return { ok: false, reason: `Máximo ${MAX_APPLICANT_NAME_LENGTH} caracteres` };
  }
  return { ok: true, value };
}

/** El mensaje es opcional: vacío es válido y devuelve cadena vacía. */
export function sanitizeApplicationMessage(raw: string): Check<string> {
  const value = (raw ?? '').replace(/\s+/g, ' ').trim();
  if (value.length > MAX_APPLICATION_MESSAGE_LENGTH) {
    return { ok: false, reason: `Máximo ${MAX_APPLICATION_MESSAGE_LENGTH} caracteres` };
  }
  return { ok: true, value };
}

/** Cantidad de seguidores, opcional. No se rechaza a quien declare menos del
 * mínimo -- eso lo decide el dueño al revisar; acá solo se valida que sea un
 * número razonable y no texto ni algo absurdo. */
export function sanitizeFollowers(raw: string | number | null | undefined): Check<number | null> {
  if (raw === null || raw === undefined || raw === '') return { ok: true, value: null };
  const digits = String(raw).replace(/\D/g, '');
  if (!digits) return { ok: false, reason: 'Escribe solo números' };
  const n = Number(digits);
  if (!Number.isFinite(n)) return { ok: false, reason: 'Escribe solo números' };
  if (n > 100_000_000) return { ok: false, reason: 'Ese número no parece real' };
  return { ok: true, value: n };
}

/** Link para escribirle por WhatsApp desde el admin, a partir del número ya
 * normalizado. */
export function whatsappLinkFor(normalized: string): string {
  return `https://wa.me/${normalized.replace(/\D/g, '')}`;
}

export function instagramLinkFor(handle: string): string {
  return `https://instagram.com/${handle}`;
}
