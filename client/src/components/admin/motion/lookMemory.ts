/* Memoria de los últimos looks usados, guardada en el teléfono: «Sorpréndeme» la evita, así el video nuevo no
 * sale con la misma combinación que los anteriores. Nunca lanza: sin almacenamiento solo no hay memoria. */

const KEY = 'motion-studio.looks.v1';
const MAX = 12;

/** Del más nuevo al más viejo. */
export function recentLooks(): string[] {
  try {
    const list = JSON.parse(window.localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(list) ? list.filter((x): x is string => typeof x === 'string').slice(0, MAX) : [];
  } catch {
    return [];
  }
}

export function rememberLook(signature: string): void {
  try {
    const list = [signature, ...recentLooks().filter((s) => s !== signature)].slice(0, MAX);
    window.localStorage.setItem(KEY, JSON.stringify(list));
  } catch { /* sin localStorage */ }
}
