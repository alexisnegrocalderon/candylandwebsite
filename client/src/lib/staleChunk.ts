/* Después de cada publicación, los archivos con hash del sitio cambian de nombre y los viejos dejan de existir. Quien
 * tenía la página abierta (o guardada por el teléfono) pide un archivo que ya no está y le sale «Importing a module
 * script failed». No es un fallo de la cuenta ni de los datos: basta recargar para bajar la versión nueva. */

export function isChunkLoadError(error: unknown): boolean {
  const text = String((error as { message?: unknown } | null)?.message ?? error ?? '');
  return /Importing a module script failed|Failed to fetch dynamically imported module|error loading dynamically imported module|Loading chunk [^ ]+ failed|ChunkLoadError/i.test(text);
}

const KEY = 'mp_stale_chunk_reload';

/** Recarga una sola vez (cada 30 s como mucho, para no quedar en un ciclo si el archivo falta de verdad).
 * Devuelve true si inició la recarga. Sin sessionStorage no se recarga sola: no hay cómo evitar el ciclo. */
export function reloadForNewVersion(): boolean {
  try {
    const last = Number(window.sessionStorage.getItem(KEY) || 0);
    if (Date.now() - last < 30_000) return false;
    window.sessionStorage.setItem(KEY, String(Date.now()));
  } catch {
    return false;
  }
  window.location.reload();
  return true;
}
