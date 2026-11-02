import { rewrite } from '@vercel/functions';
import { COLAB_HOME_REDIRECT, colabHomeRedirectActive, colabSlugForHost } from './shared/colabHosts';

/* Routing Middleware de Vercel: corre ANTES de los archivos estáticos.
 *
 * 1. La raíz de una colab (ej. dalmore.mansionplayroom.cl/) se sirve desde el
 *    servidor para que las vistas previas al compartir (WhatsApp, Instagram)
 *    lleven el título, la imagen y la dirección de la colab, y no las de la
 *    home de Playroom. Sin esto, el index.html estático de "/" ganaba siempre.
 *    La URL que ve la persona no cambia.
 * 2. Hasta la fecha del evento, la home de Playroom (solo "/") manda a la
 *    landing de la colab (shared/colabHosts.ts COLAB_HOME_REDIRECT). */
export const config = { matcher: '/' };

export default function middleware(request: Request) {
  const url = new URL(request.url);
  if (colabSlugForHost(url.hostname)) return rewrite(new URL('/playroomdalmore', request.url));
  if (colabHomeRedirectActive(url.hostname, url.search, Date.now())) {
    // 307 y sin caché: al pasar la fecha la home vuelve sola.
    return new Response(null, {
      status: 307,
      headers: { Location: `${COLAB_HOME_REDIRECT.to}${url.search}`, 'Cache-Control': 'no-store' },
    });
  }
}
