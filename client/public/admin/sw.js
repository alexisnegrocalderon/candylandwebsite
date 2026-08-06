/* Service worker de /admin: deliberadamente vacío. Ver /gastos/sw.js para
 * la explicación completa (misma razón, mismo patrón: existe solo para que
 * Chrome ofrezca "instalar app", no cachea nada -- el panel siempre necesita
 * datos frescos del servidor). Se sirve desde /admin/sw.js para reclamar el
 * scope /admin/ sin necesitar la cabecera Service-Worker-Allowed.
 */

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {});
