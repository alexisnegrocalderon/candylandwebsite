/* Subdominios de las co-producciones: cada colab vende desde su propia
 * dirección (ej. playmore.mansionplayroom.cl) y no desde la home de Playroom.
 *
 * 👉 Para una colab nueva (ej. la de febrero): agregar el subdominio acá, en
 * Vercel (Domains) y un CNAME en Cloudflare; el `slug` es el de la
 * co-producción creada en el panel. */
export const COLAB_HOSTS: Record<string, string> = {
  // El primero de cada colab es su dirección canónica (la que sale al compartir).
  'dalmore.mansionplayroom.cl': 'dalmore',
  'playmore.mansionplayroom.cl': 'dalmore',
};

/** Slug de la co-producción cuyo subdominio es este host (sin puerto), o null. */
export function colabSlugForHost(host: string | undefined | null): string | null {
  if (!host) return null;
  const h = host.toLowerCase().split(':')[0];
  return COLAB_HOSTS[h] ?? null;
}

/** ¿Este host es el de una colab (dalmore. / playmore.)? */
export const isColabHost = (host: string | undefined | null): boolean => colabSlugForHost(host) !== null;

/* Mientras se promociona la colab, la home de Playroom (mansionplayroom.cl/)
 * manda a la gente a la landing de la colab. SOLO con el evento activado (el
 * interruptor "Activar evento" del panel: coproductions.isLive); apagado, la
 * home es la de siempre. Se apaga sola pasada la fecha
 * (4 de diciembre 23:00 + la noche: hasta las 06:00 del día siguiente, hora
 * de Chile). Solo la raíz: el resto del sitio (eventos, cuenta, checkout,
 * paneles) no se toca. */
export const COLAB_HOME_REDIRECT = {
  to: 'https://dalmore.mansionplayroom.cl/',
  /** Co-producción cuyo interruptor "Activar evento" (panel) enciende la redirección. */
  slug: 'dalmore',
  untilMs: Date.parse('2026-12-05T06:00:00-03:00'),
  /** Hosts de la home de Playroom a los que aplica. */
  fromHosts: ['mansionplayroom.cl', 'www.mansionplayroom.cl'],
  /** La app instalada (?source=app) y la notificación de bienvenida (?bienvenida=1) abren la raíz con estos parámetros: no se desvían. */
  skipParams: ['source', 'bienvenida', 't', 'app', 'sitio'],
};

export function colabHomeRedirectActive(host: string | undefined | null, search: string, nowMs: number): boolean {
  if (!host || !COLAB_HOME_REDIRECT.fromHosts.includes(host.toLowerCase().split(':')[0])) return false;
  if (nowMs >= COLAB_HOME_REDIRECT.untilMs) return false;
  const params = new URLSearchParams(search);
  // `source` solo cuenta cuando es la app instalada (`?source=app`): un link con `?source=instagram` (o cualquier otro
  // rastreo) NO es la app y debe llegar a la landing como todos los que no la tienen.
  if (params.get('source') !== null && params.get('source') !== 'app') params.delete('source');
  return !COLAB_HOME_REDIRECT.skipParams.some((k) => params.has(k));
}
