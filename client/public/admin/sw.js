/* Service worker de /admin: existe para que el navegador ofrezca "instalar
 * app" (ver /gastos/sw.js) y ahora también para recibir Web Push -- sigue
 * sin cachear nada, el panel siempre necesita datos frescos del servidor.
 * Se sirve desde /admin/sw.js para reclamar el scope /admin/ sin necesitar
 * la cabecera Service-Worker-Allowed.
 */

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {});

/* El payload lo arma server/push.ts: { title, body, url }. Si por lo que
 * sea no viene como JSON (nunca debería pasar, pero un push corrupto no
 * puede tumbar el service worker), se muestra un texto genérico en vez de
 * fallar en silencio -- así se nota si algo se rompió. */
self.addEventListener('push', (event) => {
  let data = { title: 'Mansion Playroom', body: 'Tienes una novedad en el panel.', url: '/admin' };
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
      data: { url: data.url || '/admin' },
    })
  );
});

/* Tocar la notificación enfoca una pestaña de /admin ya abierta si existe,
 * en vez de siempre abrir una nueva -- en un iPad instalado como app suele
 * haber una sola, y abrir otra encima confunde más que ayuda. */
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/admin';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (client.url.includes('/admin') && 'focus' in client) return client.focus();
      }
      return self.clients.openWindow(url);
    })
  );
});
