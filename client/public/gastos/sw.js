/* Service worker de /gastos: deliberadamente vacío.
 *
 * Existe por una sola razón: Chrome no ofrece "instalar app" (el evento
 * beforeinstallprompt) si el sitio no tiene un service worker con handler de
 * fetch. Se sirve desde /gastos/sw.js para poder reclamar el scope /gastos/
 * sin necesitar la cabecera Service-Worker-Allowed.
 *
 * NO cachea nada a propósito: la sesión es una cookie de admin y los montos
 * tienen que ser siempre los del servidor. La caché real (Workbox) vive solo
 * en /caja, que sí es offline-first. iOS ni siquiera necesita este archivo:
 * instala con el manifest solo.
 */

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
// Handler presente pero sin responder: deja pasar cada request a la red tal
// cual, que es justo lo que queremos.
self.addEventListener('fetch', () => {});
