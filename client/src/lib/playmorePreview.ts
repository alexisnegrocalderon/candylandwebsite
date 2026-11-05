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

/** ¿Se muestra PLAYMORE en la app? Sí con la venta abierta; antes de activar, solo cuando el servidor lo marca como vista
 * previa, que ocurre únicamente con la clave del panel o con la sesión de administrador (el servidor decide, no la app).
 * Quien entra sin ninguna de las dos recibe `preview: false` y no ve nada. */
export function shouldShowPlaymore(data: { isLive?: boolean; preview?: boolean; event?: unknown } | null | undefined): boolean {
  return !!data?.event && (data.isLive === true || data.preview === true);
}

export function readPlaymorePreviewToken(): string | undefined {
  if (typeof window === 'undefined') return undefined;
  let stored: string | null = null;
  try { stored = sessionStorage.getItem(KEY); } catch { /* sin almacenamiento */ }
  const token = parsePreviewToken(window.location.search, stored);
  if (token && token !== stored) { try { sessionStorage.setItem(KEY, token); } catch { /* sin almacenamiento */ } }
  return token;
}
