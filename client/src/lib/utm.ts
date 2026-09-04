/** Atribución UTM: de dónde vino la venta cuando no hay código de embajador
 * de por medio -- con $0 de pauta, es la única forma de saber qué contenido
 * (reel, historia, bio, WhatsApp) trae compras de verdad, no solo leads.
 *
 * Se captura acá, una sola vez por carga completa de página (ver main.tsx --
 * la app es una SPA, así que esto NO corre en cada navegación interna, solo
 * quedan atrapados los `utm_*` de la URL con la que alguien realmente
 * aterrizó). Checkout.tsx la lee de vuelta al crear la orden.
 *
 * "Último toque gana": si alguien entra por un link con utm_source=instagram
 * y después por otro con utm_source=whatsapp antes de comprar, la venta se
 * atribuye a WhatsApp -- el último empujón que la hizo decidir. Si entra sin
 * ningún parámetro UTM (navegación interna, favorito guardado), se deja lo
 * que ya había guardado, sin borrarlo -- así no se pierde la atribución del
 * primer aterrizaje solo porque después navegó por el sitio. */

const STORAGE_KEY = 'mp_utm';

export type UtmParams = {
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmContent?: string;
};

/** Se llama una vez al arrancar la app (main.tsx). Si la URL actual trae
 * algún parámetro utm_*, reemplaza lo guardado; si no trae ninguno, no toca
 * lo que ya había. */
export function captureUtmParams(): void {
  try {
    const params = new URLSearchParams(window.location.search);
    const utm: UtmParams = {
      utmSource: params.get('utm_source') ?? undefined,
      utmMedium: params.get('utm_medium') ?? undefined,
      utmCampaign: params.get('utm_campaign') ?? undefined,
      utmContent: params.get('utm_content') ?? undefined,
    };
    const tieneAlguno = Object.values(utm).some((v) => v);
    if (!tieneAlguno) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(utm));
  } catch {
    // localStorage puede fallar (modo privado, storage lleno, navegador
    // raro) -- no es crítico, esa sesión simplemente queda sin atribución.
  }
}

/** Lee lo guardado (Checkout.tsx, al crear la orden). Nunca revienta si no
 * hay nada guardado o el navegador bloquea localStorage. */
export function getStoredUtmParams(): UtmParams {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw);
  } catch {
    return {};
  }
}
