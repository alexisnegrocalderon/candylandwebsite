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
