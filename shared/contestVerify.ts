import { isValidRut, normalizeRut } from './rut';

/** Verificación del ganador antes de entregar el premio: pedimos RUT, fecha
 * de nacimiento y un "ACEPTO" (valores y derecho de permanencia). Este módulo
 * solo lee lo que escribió; lo que se entrega lo decide el admin. */
export interface VerifyData {
  rut: string | null;
  birthDate: string | null; // AAAA-MM-DD
  accepted: boolean;
}

/** Lee RUT, fecha (dd/mm/aaaa) y ACEPTO desde un mensaje libre. */
export function parseVerifyReply(text: string): VerifyData {
  const rutMatch = text.match(/\b(\d{1,2}\.?\d{3}\.?\d{3}\s*-\s*[\dkK])\b/);
  const rut = rutMatch && isValidRut(rutMatch[1].replace(/\s/g, '')) ? normalizeRut(rutMatch[1].replace(/\s/g, '')) : null;
  const rest = rutMatch ? text.replace(rutMatch[0], ' ') : text;
  let birthDate: string | null = null;
  const dateMatch = rest.match(/\b(\d{1,2})\s*[\/\-.]\s*(\d{1,2})\s*[\/\-.]\s*(\d{4})\b/);
  if (dateMatch) {
    const [d, m, y] = [Number(dateMatch[1]), Number(dateMatch[2]), Number(dateMatch[3])];
    const date = new Date(Date.UTC(y, m - 1, d));
    if (y >= 1900 && date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d) {
      birthDate = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
  }
  return { rut, birthDate, accepted: /\bacepto\b/i.test(text) };
}

/** Años cumplidos de `birthDate` (AAAA-MM-DD) en la fecha dada. */
export function ageOn(birthDate: string, on: Date): number {
  const [y, m, d] = birthDate.split('-').map(Number);
  let age = on.getUTCFullYear() - y;
  if (on.getUTCMonth() + 1 < m || (on.getUTCMonth() + 1 === m && on.getUTCDate() < d)) age--;
  return age;
}

/** Lo que falta por mandar, para pedírselo de vuelta. */
export function missingVerifyFields(d: VerifyData): string[] {
  const out: string[] = [];
  if (!d.rut) out.push('tu RUT (con guion, ej. 12.345.678-9)');
  if (!d.birthDate) out.push('tu fecha de nacimiento (dd/mm/aaaa)');
  if (!d.accepted) out.push('la palabra ACEPTO');
  return out;
}

export const isVerifyComplete = (d: VerifyData) => !!d.rut && !!d.birthDate && d.accepted;
