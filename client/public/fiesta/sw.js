/* Service worker de Playmatch (/fiesta): recibe Web Push (mensaje nuevo,
 * promo relámpago) y permite instalarlo a la pantalla de inicio, requisito
 * de iOS para poder recibir push ahí. No cachea nada -- la fiesta siempre
 * necesita datos frescos (mansión, chat, promos en vivo). Se sirve desde
 * /fiesta/sw.js para reclamar el scope /fiesta/ sin necesitar la cabecera
 * Service-Worker-Allowed (mismo criterio que /admin/sw.js).
 */

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {});

/* El payload lo arma server/push.ts: { title, body, url }. Si no viene como
 * JSON, se muestra un texto genérico en vez de fallar en silencio. */
self.addEventListener('push', (event) => {
  let data = { title: 'Mansion Playroom', body: 'Tienes una novedad en Playmatch.', url: '/fiesta' };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch {
    // payload no era JSON -- se usa el texto genérico de arriba.
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/candyland/favicon-192.png',
      badge: '/candyland/favicon-192.png',
      data: { url: data.url || '/fiesta' },
    })
  );
});

/* Tocar la notificación enfoca una pestaña de /fiesta ya abierta si existe,
 * en vez de siempre abrir una nueva. */
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/fiesta';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (client.url.includes('/fiesta') && 'focus' in client) return client.focus();
      }
      return self.clients.openWindow(url);
    })
  );
});
