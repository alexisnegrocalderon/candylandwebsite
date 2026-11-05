/* Vista previa privada de PLAYMORE dentro de la app, antes de activar el evento.
 * El dueño abre la app con `?playmore=<clave de vista previa>` (la del panel de la colaboración); la clave se recuerda
 * mientras dure la pestaña para que la tarjeta siga viéndose al moverse por la app. Sin clave, la app solo muestra
 * PLAYMORE cuando el evento está activo. */

const KEY = 'mp.playmore-preview';
const TOKEN_RE = /^[A-Za-z0-9_-]{8,64}$/;

/** La clave pedida por la URL o, si no hay, la recordada. Pura para poder probarla. */
export function parsePreviewToken(search: string, stored: string | null): string | undefined {
  const fromUrl = new URLSearchParams(search).get('playmore') ?? '';
  if (TOKEN_RE.test(fromUrl)) return fromUrl;
  return stored && TOKEN_RE.test(stored) ? stored : undefined;
}

export function readPlaymorePreviewToken(): string | undefined {
  if (typeof window === 'undefined') return undefined;
  let stored: string | null = null;
  try { stored = sessionStorage.getItem(KEY); } catch { /* sin almacenamiento */ }
  const token = parsePreviewToken(window.location.search, stored);
  if (token && token !== stored) { try { sessionStorage.setItem(KEY, token); } catch { /* sin almacenamiento */ } }
  return token;
}
