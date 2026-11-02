import { rewrite } from '@vercel/functions';
import { colabSlugForHost } from './shared/colabHosts';

/* Routing Middleware de Vercel: corre ANTES de los archivos estáticos.
 * La raíz de una colab (ej. dalmore.mansionplayroom.cl/) se sirve desde el
 * servidor para que las vistas previas al compartir (WhatsApp, Instagram)
 * lleven el título, la imagen y la dirección de la colab, y no las de la home
 * de Playroom. Sin esto, el index.html estático de "/" ganaba siempre. La URL
 * que ve la persona no cambia. */
export const config = { matcher: '/' };

export default function middleware(request: Request) {
  const url = new URL(request.url);
  if (!colabSlugForHost(url.hostname)) return;
  return rewrite(new URL('/playroomdalmore', request.url));
}
