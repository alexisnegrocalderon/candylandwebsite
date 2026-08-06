/* Service worker de /puerta: deliberadamente vacío. Ver /gastos/sw.js para
 * la explicación completa (misma razón, mismo patrón: existe solo para que
 * Chrome ofrezca "instalar app", no cachea nada -- el escaneo necesita el
 * estado real del servidor). Se sirve desde /puerta/sw.js para reclamar el
 * scope /puerta/ sin necesitar la cabecera Service-Worker-Allowed.
 */

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {});
