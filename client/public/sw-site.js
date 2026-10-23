/* Service worker del sitio público (scope /): permite instalar el sitio como
 * app, recibe los avisos push a clientes (server/customerPush.ts) y deja que
 * la App de PlayRoom abra SIN SEÑAL (en la puerta suele no haber).
 *
 * El caché es de lista cerrada, nada más:
 *  - La pantalla de la app (`/cuenta`, `/mis-puntos`, `/?source=app`): primero
 *    la red; si no hay red (o tarda más de 4 s) se abre la última guardada.
 *  - Archivos con hash (`/assets/`) y letras (`/fonts/`): del caché si están
 *    (nunca cambian), si no de la red y se guardan.
 *  - Imágenes de marca (`/candyland/`): del caché al tiro y se refrescan atrás.
 * Todo lo demás (API, checkout, pagos, el resto del sitio) ni lo toca: va a
 * la red como si el worker no existiera. Los datos de la cuenta y el QR los
 * guarda la página (client/src/lib/offlineAccount.ts), no este worker.
 * Servido con Service-Worker-Allowed: / y sin caché (ver vercel.json).
 */

const SHELL_CACHE = 'pr-app-shell-v1';
const ASSET_CACHE = 'pr-app-assets-v1';
const SHELL_KEY = '/__app-shell';
const ASSET_LIMIT = 250;
const NETWORK_TIMEOUT_MS = 4000;

function isAppNavigation(url) {
  if (url.pathname === '/cuenta' || url.pathname.startsWith('/cuenta/') || url.pathname === '/mis-puntos') return true;
  return url.pathname === '/' && url.searchParams.get('source') === 'app';
}

function isCacheableAsset(url) {
  return url.pathname.startsWith('/assets/') || url.pathname.startsWith('/fonts/') || url.pathname.startsWith('/candyland/');
}

async function putShell(response) {
  if (!response || !response.ok || !(response.headers.get('content-type') || '').includes('text/html')) return;
  const cache = await caches.open(SHELL_CACHE);
  await cache.put(SHELL_KEY, response);
}

/* Los archivos con hash se acumulan deploy tras deploy: se borran los más viejos pasado el tope. */
async function trimAssets() {
  const cache = await caches.open(ASSET_CACHE);
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - ASSET_LIMIT; i++) await cache.delete(keys[i]);
}

async function appNavigation(event) {
  const network = fetch(event.request);
  // La copia nueva se guarda aunque ya se haya abierto la guardada (waitUntil se pide ahora, no después).
  event.waitUntil(network.then((res) => putShell(res.clone())).catch(() => {}));
  const cached = await caches.open(SHELL_CACHE).then((c) => c.match(SHELL_KEY));
  // Sin copia guardada no hay alternativa: se espera a la red, como siempre.
  if (!cached) return network;
  const timeout = new Promise((resolve) => setTimeout(() => resolve(null), NETWORK_TIMEOUT_MS));
  const res = await Promise.race([network.catch(() => null), timeout]);
  return res || cached;
}

async function cachedAsset(event, url) {
  const cache = await caches.open(ASSET_CACHE);
  const hit = await cache.match(event.request);
  // Lo de marca puede cambiar sin cambiar de nombre: se usa el guardado y se refresca atrás.
  // Lo que tiene hash nunca cambia: si está guardado, ni se pregunta a la red.
  if (hit && !url.pathname.startsWith('/candyland/')) return hit;
  const refresh = fetch(event.request);
  event.waitUntil(refresh.then((res) => (res.ok && res.type === 'basic' ? cache.put(event.request, res.clone()).then(trimAssets) : null)).catch(() => {}));
  return hit || refresh;
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (req.mode === 'navigate') {
    if (isAppNavigation(url)) event.respondWith(appNavigation(event));
    return;
  }
  if (isCacheableAsset(url)) event.respondWith(cachedAsset(event, url));
});

/* La app avisa qué archivos usó al abrir «Mi cuenta» (la primera vez el worker aún no
 * controlaba la página, así que no los vio pasar): se guardan para la próxima vez sin señal. */
self.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data.type !== 'warm' || !Array.isArray(data.urls)) return;
  event.waitUntil((async () => {
    const assets = await caches.open(ASSET_CACHE);
    for (const raw of data.urls.slice(0, 120)) {
      let url;
      try { url = new URL(raw, self.location.origin); } catch { continue; }
      if (url.origin !== self.location.origin || !isCacheableAsset(url)) continue;
      if (await assets.match(url.href)) continue;
      try {
        const res = await fetch(url.href);
        if (res.ok) await assets.put(url.href, res);
      } catch { /* sin red: se intenta la próxima vez */ }
    }
    if (data.shell && !(await caches.open(SHELL_CACHE).then((c) => c.match(SHELL_KEY)))) {
      try { await putShell(await fetch(data.shell, { credentials: 'same-origin' })); } catch { /* idem */ }
    }
    await trimAssets();
  })());
});

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil((async () => {
  // Cachés de versiones anteriores de este worker (los nombres llevan -vN).
  const keep = [SHELL_CACHE, ASSET_CACHE];
  for (const key of await caches.keys()) if (key.startsWith('pr-app-') && !keep.includes(key)) await caches.delete(key);
  await self.clients.claim();
})()));

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
