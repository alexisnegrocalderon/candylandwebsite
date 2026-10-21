/* Service worker del sitio público (scope /): existe SOLO para que el sitio
 * se pueda instalar como app y reciba los avisos push a clientes
 * (server/customerPush.ts). No tiene handler de `fetch` a propósito: no
 * cachea nada ni se mete en el checkout o los pagos -- todo va directo a la
 * red como si no existiera. Servido con Service-Worker-Allowed: / y sin
 * caché (ver vercel.json).
 */

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

/* El payload lo arma server/customerPush.ts: { title, body, url, image?, c?, s?, actions? }
 * (`c` = campaña y `s` = suscripción, para contar el toque). */
self.addEventListener('push', (event) => {
  let data = { title: 'Mansion Playroom', body: 'Tienes una novedad.', url: '/' };
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
      image: data.image || undefined,
      // Botones (Android y computador): máx. 2; iPhone no los muestra.
      actions: Array.isArray(data.actions) ? data.actions.slice(0, 2).map((a) => ({ action: a.action, title: a.title })) : undefined,
      data: { url: data.url || '/', c: data.c || null, s: data.s || null, actions: data.actions || [] },
    })
  );
});

function trpcPost(path, json) {
  return fetch(`/api/trpc/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ json }),
    keepalive: true,
  }).catch(() => {});
}

/* Tocar el aviso abre su link: si la app (o una pestaña del sitio) ya está
 * abierta, la lleva ahí en vez de abrir otra encima. */
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const { url = '/', c = null, s = null, actions = [] } = event.notification.data || {};
  // Si tocó un botón, abre el link de ese botón; si no, el del aviso.
  const picked = event.action ? actions.find((a) => a.action === event.action) : null;
  const target = new URL((picked && picked.url) || url, self.location.origin).href;

  event.waitUntil(Promise.all([
    c ? trpcPost('customerPush.click', s ? { campaignId: c, subscriptionId: s } : { campaignId: c }) : null,
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (new URL(client.url).origin === self.location.origin && 'focus' in client) {
          return client.focus().then((c2) => (c2 && 'navigate' in c2 ? c2.navigate(target) : null)).catch(() => self.clients.openWindow(target));
        }
      }
      return self.clients.openWindow(target);
    }),
  ]));
});

/* El navegador renovó la suscripción (Chrome/Firefox; iOS no lo hace): se
 * vuelve a suscribir con la misma clave y se le avisa al servidor. */
self.addEventListener('pushsubscriptionchange', (event) => {
  const key = event.oldSubscription && event.oldSubscription.options && event.oldSubscription.options.applicationServerKey;
  if (!key) return;
  event.waitUntil(
    self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key }).then((sub) =>
      trpcPost('customerPush.resubscribe', { oldEndpoint: event.oldSubscription.endpoint, subscription: sub.toJSON() })
    ).catch(() => {})
  );
});
