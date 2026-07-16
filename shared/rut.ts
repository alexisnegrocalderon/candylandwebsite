/** Validación de RUT chileno (dígito verificador, algoritmo módulo 11).
 * Solo confirma que el RUT esté bien escrito -- no que exista o sea de esa
 * persona (eso requeriría un servicio externo pago, fuera de alcance). */
export function isValidRut(rutInput: string): boolean {
  const clean = rutInput.trim().replace(/[.\s]/g, '').toUpperCase();
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
