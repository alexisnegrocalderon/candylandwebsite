/* Destino de un aviso push dentro del panel: sección + (opcional) pestaña,
 * conversación o comentario. El servidor arma la URL del aviso con
 * `buildAdminUrl` y el panel la lee con `parseAdminDeepLink`. */

export interface AdminDeepLink {
  section: string;
  tab?: string;
  thread?: number;
  comment?: number;
}

const SAFE = /^[a-z0-9-]{1,40}$/;

export function buildAdminUrl(link: AdminDeepLink): string {
  const params = new URLSearchParams({ section: link.section });
  if (link.tab) params.set('tab', link.tab);
  if (link.thread) params.set('thread', String(link.thread));
  if (link.comment) params.set('comment', String(link.comment));
  return `/admin?${params.toString()}`;
}

function positiveInt(value: string | null): number | undefined {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : undefined;
}

/** Lee `?section=…` de una URL o de un `location.search`. `null` si no hay
 * sección válida (texto raro en la URL nunca llega a la pantalla). */
export function parseAdminDeepLink(urlOrSearch: string): AdminDeepLink | null {
  const query = urlOrSearch.includes('?') ? urlOrSearch.slice(urlOrSearch.indexOf('?')) : urlOrSearch;
  const params = new URLSearchParams(query);
  const section = params.get('section') ?? '';
  if (!SAFE.test(section)) return null;
  const tab = params.get('tab') ?? '';
  const link: AdminDeepLink = { section };
  if (SAFE.test(tab)) link.tab = tab;
  const thread = positiveInt(params.get('thread'));
  if (thread) link.thread = thread;
  const comment = positiveInt(params.get('comment'));
  if (comment) link.comment = comment;
  return link;
}
