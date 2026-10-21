/* Avisos push a clientes del sitio (server/customerPush.ts). El worker es
 * /sw-site.js con scope '/' -- sin caché ni `fetch`, solo recibe avisos.
 *
 * En iPhone/iPad Safari entrega push SOLO a una web agregada a la pantalla de
 * inicio (iOS 16.4+): ahí el aviso del sitio enseña a instalarla primero. En
 * Android y computador se puede activar desde el navegador. */

import { useCallback, useEffect, useState } from 'react';
import { trpc } from '@/lib/trpc';
import { LAST_TICKET_CODE_KEY } from '@/lib/lastTicketCode';

export type PushSource = 'ticket' | 'pago' | 'home' | 'concurso' | 'puntos' | 'app';
export type PushState = 'loading' | 'unsupported' | 'ios-install' | 'denied' | 'ask' | 'enabled';

const SW_URL = '/sw-site.js';
const DISMISS_KEY = 'push-prompt.dismissed';
const DISMISS_MS = 30 * 86_400_000;
/** En la app instalada el aviso vuelve antes: ahí es donde de verdad se pueden activar los avisos. */
const DISMISS_APP_MS = 5 * 86_400_000;

export function isIos(): boolean {
  if (typeof navigator === 'undefined') return false;
  // iPadOS se presenta como Mac: se reconoce por la pantalla táctil.
  return /iphone|ipad|ipod/i.test(navigator.userAgent) || (/macintosh/i.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
}

export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia?.('(display-mode: standalone)').matches || (window.navigator as any).standalone === true;
}

export function pushPlatform(): 'ios' | 'android' | 'desktop' {
  if (isIos()) return 'ios';
  return typeof navigator !== 'undefined' && /android/i.test(navigator.userAgent) ? 'android' : 'desktop';
}

function pushSupported(): boolean {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

function urlBase64ToUint8Array(base64String: string): BufferSource {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const array = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) array[i] = raw.charCodeAt(i);
  return array;
}

async function currentSubscription(): Promise<PushSubscription | null> {
  if (!pushSupported()) return null;
  const reg = await navigator.serviceWorker.getRegistration('/');
  if (!reg || !(reg.active ?? reg.waiting ?? reg.installing)?.scriptURL.endsWith(SW_URL)) return null;
  return reg.pushManager.getSubscription();
}

export function lastTicketCode(): string | null {
  try { return localStorage.getItem(LAST_TICKET_CODE_KEY); } catch { return null; }
}

export function promptDismissed(): boolean {
  try { return Date.now() - Number(localStorage.getItem(DISMISS_KEY) ?? 0) < (isStandalone() ? DISMISS_APP_MS : DISMISS_MS); } catch { return false; }
}

export function dismissPrompt(): void {
  try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch { /* sin storage: vuelve a aparecer, no pasa nada */ }
}

const DEVICE_KEY = 'mp_app_device';
const OPENED_KEY = 'mp_app_opened';

/** Avisa al servidor que el sitio se abrió como app instalada (una vez por
 * apertura; con `ticketCode`, aunque ya haya avisado, para ligarla a esa
 * compra). Es lo que cuenta "quién tiene la app" (server/appDevices.ts). */
export function reportAppOpen(ticketCode?: string): void {
  if (!isStandalone()) return;
  try {
    if (!ticketCode && sessionStorage.getItem(OPENED_KEY)) return;
    let deviceId = localStorage.getItem(DEVICE_KEY);
    if (!deviceId) {
      deviceId = Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('');
      localStorage.setItem(DEVICE_KEY, deviceId);
    }
    sessionStorage.setItem(OPENED_KEY, '1');
    const code = ticketCode ?? lastTicketCode() ?? undefined;
    // Con avisos activos, se manda también su suscripción: así el servidor aprende a qué hora la abre.
    currentSubscription().catch(() => null).then((sub) => {
      fetch('/api/trpc/customerPush.appOpen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ json: { deviceId, platform: pushPlatform(), ...(code ? { ticketCode: code } : {}), ...(sub ? { endpoint: sub.endpoint } : {}) } }),
        keepalive: true,
      }).catch(() => {});
    });
  } catch { /* sin storage: no se cuenta esta apertura */ }
}

/** Estado del aviso en este dispositivo + activar/desactivar. `ticketCode` u
 * `orderNumber` ligan el dispositivo al correo de esa compra. */
export function useCustomerPush(opts: { source: PushSource; ticketCode?: string; orderNumber?: string }) {
  const [state, setState] = useState<PushState>('loading');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { data: key } = trpc.customerPush.publicKey.useQuery(undefined, { staleTime: Infinity, enabled: pushSupported() });
  const subscribe = trpc.customerPush.subscribe.useMutation();
  const link = trpc.customerPush.link.useMutation();
  const unsubscribe = trpc.customerPush.unsubscribe.useMutation();
  const ticketCode = opts.ticketCode ?? lastTicketCode() ?? undefined;

  useEffect(() => {
    let alive = true;
    (async () => {
      if (isIos() && !isStandalone()) return setState('ios-install');
      if (!pushSupported()) return setState('unsupported');
      if (Notification.permission === 'denied') return setState('denied');
      const sub = await currentSubscription().catch(() => null);
      if (!alive) return;
      setState(sub && Notification.permission === 'granted' ? 'enabled' : 'ask');
      // Ya activado desde la home (anónimo) y ahora abre su entrada: se liga a su correo.
      if (sub && opts.ticketCode) link.mutate({ endpoint: sub.endpoint, ticketCode: opts.ticketCode });
      // Abrió su entrada dentro de la app: esa app queda ligada a su compra.
      if (opts.ticketCode) reportAppOpen(opts.ticketCode);
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opts.ticketCode]);

  const enable = useCallback(async (): Promise<boolean> => {
    setError(null);
    if (!key?.publicKey) { setError('Los avisos todavía no están disponibles.'); return false; }
    setBusy(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setState(permission === 'denied' ? 'denied' : 'ask');
        return false;
      }
      const reg = await navigator.serviceWorker.register(SW_URL, { scope: '/' });
      await navigator.serviceWorker.ready;
      const sub = (await reg.pushManager.getSubscription())
        ?? await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(key.publicKey) });
      const json = sub.toJSON();
      await subscribe.mutateAsync({
        subscription: { endpoint: json.endpoint!, keys: { p256dh: json.keys!.p256dh, auth: json.keys!.auth } },
        ticketCode, orderNumber: opts.orderNumber, source: opts.source, platform: pushPlatform(), standalone: isStandalone(),
      });
      setState('enabled');
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron activar los avisos.');
      return false;
    } finally {
      setBusy(false);
    }
  }, [key?.publicKey, opts.orderNumber, opts.source, ticketCode, subscribe]);

  const disable = useCallback(async () => {
    setBusy(true);
    try {
      const sub = await currentSubscription();
      if (sub) {
        await unsubscribe.mutateAsync({ endpoint: sub.endpoint });
        await sub.unsubscribe();
      }
      setState('ask');
    } finally {
      setBusy(false);
    }
  }, [unsubscribe]);

  return { state, busy, error, enable, disable };
}
