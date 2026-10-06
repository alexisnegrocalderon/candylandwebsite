/** Datos de prueba de Playmatch (herramienta del admin, sección "Probar
 * Playmatch"). Todo cuelga de UN evento oculto con un slug fijo: así crear y
 * borrar es exacto y jamás puede tocar un evento real. */

export const PLAYMATCH_TEST_SLUG = 'playmatch-test';
export const PLAYMATCH_TEST_TITLE = 'Playmatch TEST (no es una fiesta real)';

export const MIN_TEST_GUESTS = 2;
export const MAX_TEST_GUESTS = 10;

export function clampTestGuestCount(n: number): number {
  if (!Number.isFinite(n)) return MIN_TEST_GUESTS;
  return Math.min(MAX_TEST_GUESTS, Math.max(MIN_TEST_GUESTS, Math.round(n)));
}

/** MP-TEST-0001, MP-TEST-0002, ... Cumple el formato que acepta el lector de
 * QR (`parseTicketCodeFromQr`) y es inconfundible con una entrada real. */
export function testTicketCode(n: number): string {
  return `MP-TEST-${String(n).padStart(4, '0')}`;
}

export function isTestTicketCode(code: string): boolean {
  return /^MP-TEST-\d{4}$/.test(code.trim().toUpperCase());
}

/** Ventana amplia a propósito (ayer a mañana): la zona horaria de la base de
 * datos no puede dejar la fiesta de prueba "cerrada" por unas horas. */
export function testEventWindow(now: Date = new Date()) {
  const DAY = 24 * 60 * 60 * 1000;
  return {
    eventDate: now,
    doorsOpen: new Date(now.getTime() - DAY),
    eventEnd: new Date(now.getTime() + DAY),
  };
}
