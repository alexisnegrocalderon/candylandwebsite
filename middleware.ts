import { rewrite } from '@vercel/functions';
import { COLAB_HOME_REDIRECT, colabHomeRedirectActive, colabSlugForHost } from './shared/colabHosts';

/* Routing Middleware de Vercel: corre ANTES de los archivos estáticos.
 *
 * 1. La raíz de una colab (ej. dalmore.mansionplayroom.cl/) se sirve desde el
 *    servidor para que las vistas previas al compartir (WhatsApp, Instagram)
 *    lleven el título, la imagen y la dirección de la colab, y no las de la
 *    home de Playroom. Sin esto, el index.html estático de "/" ganaba siempre.
 *    La URL que ve la persona no cambia.
 * 2. La home de Playroom (solo "/") manda a la landing de la colab, pero
 *    SOLO si el evento está activado en el panel (interruptor "Activar
 *    evento") y hasta la fecha del evento (shared/colabHosts.ts). Si no se
 *    puede consultar el estado, no se redirige: la home queda como siempre. */
export const config = { matcher: '/' };

const LIVE_TTL_MS = 30_000;
let liveCache: { live: boolean; at: number } | null = null;

/** ¿Está activado el evento de la colab? Se consulta al servidor y se recuerda 30 s. */
async function colabIsLive(origin: string): Promise<boolean> {
  const now = Date.now();
  if (liveCache && now - liveCache.at < LIVE_TTL_MS) return liveCache.live;
  let live = false;
  try {
    const res = await fetch(`${origin}/api/colab-live?slug=${encodeURIComponent(COLAB_HOME_REDIRECT.slug)}`, { signal: AbortSignal.timeout(2500) });
    if (res.ok) live = ((await res.json()) as { live?: boolean }).live === true;
  } catch {
    live = false;
  }
  liveCache = { live, at: now };
  return live;
}

export default async function middleware(request: Request) {
  const url = new URL(request.url);
  if (colabSlugForHost(url.hostname)) return rewrite(new URL('/playroomdalmore', request.url));
  if (colabHomeRedirectActive(url.hostname, url.search, Date.now()) && (await colabIsLive(url.origin))) {
    // 307 y sin caché: al desactivar el evento o pasar la fecha la home vuelve sola.
    return new Response(null, {
      status: 307,
      headers: { Location: `${COLAB_HOME_REDIRECT.to}${url.search}`, 'Cache-Control': 'no-store' },
    });
  }
}
