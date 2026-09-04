/** Sin puntos/espacios, con guion, en mayúsculas -- para comparar dos RUT
 * escritos distinto (con o sin puntos, minúscula la "k") como el mismo. */
export function normalizeRut(rutInput: string): string {
  return rutInput.trim().replace(/[.\s]/g, '').toUpperCase();
}

/** Validación de RUT chileno (dígito verificador, algoritmo módulo 11).
 * Solo confirma que el RUT esté bien escrito -- no que exista o sea de esa
 * persona (eso requeriría un servicio externo pago, fuera de alcance). */
export function isValidRut(rutInput: string): boolean {
  const clean = normalizeRut(rutInput);
  if (!/^\d{7,8}-[0-9K]$/.test(clean)) return false;

  const [num, dv] = clean.split('-');
  let sum = 0;
  let multiplier = 2;
  for (let i = num.length - 1; i >= 0; i--) {
    sum += Number(num[i]) * multiplier;
    multiplier = multiplier === 7 ? 2 : multiplier + 1;
  }
  const expected = 11 - (sum % 11);
  const expectedDv = expected === 11 ? '0' : expected === 10 ? 'K' : String(expected);
  return dv === expectedDv;
}

/** Formato chileno de celular: +56 9 XXXXXXXX, con o sin espacios/guiones/prefijo. */
export function isValidChileanPhone(phoneInput: string): boolean {
  const clean = phoneInput.trim().replace(/[\s-]/g, '');
  return /^(\+?56)?9\d{8}$/.test(clean);
}

/** Formatea un RUT EN VIVO mientras se escribe: pone los puntos cada 3 dígitos
 * y el guion antes del dígito verificador solo -- pedido explícito del dueño
 * (antes había que escribir el guion a mano). Se recalcula ENTERO desde lo
 * que hay tipeado en cada tecla (no parchea el string formateado anterior),
 * así el backspace funciona solo: borrar cualquier carácter (dígito, punto o
 * guion) siempre achica el RUT limpio de abajo, sin lógica especial para
 * "saltarse" el guion o los puntos.
 *
 * `normalizeRut` (arriba) ya limpia puntos/espacios y no toca el guion -- como
 * acá siempre se pone como mucho UN guion, `normalizeRut(formatRutLive(x))`
 * da siempre "NNNNNNNN-D" o un prefijo de eso, nunca doble guion. No hace
 * falta tocar `normalizeRut`/`isValidRut` para que sigan validando igual. */
export function formatRutLive(raw: string): string {
  const clean = raw.replace(/[^0-9kK]/g, '').toUpperCase().slice(0, 9);
  if (clean.length <= 1) return clean;

  const dv = clean.slice(-1);
  const body = clean.slice(0, -1).replace(/\D/g, '');
  const groupedBody = body.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${groupedBody}-${dv}`;
}
