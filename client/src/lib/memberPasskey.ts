import { useCallback, useEffect, useRef, useState } from 'react';
import { browserSupportsWebAuthn, platformAuthenticatorIsAvailable, startAuthentication, startRegistration } from '@simplewebauthn/browser';
import { trpc } from '@/lib/trpc';
import { signalUnknownCredential } from '@/lib/passkeySignals';

/* Face ID / Touch ID / huella para «Mi cuenta» (server/memberPasskeys.ts).
 * Entrar con un toque en vez del código al correo. Se activa desde la app
 * con la sesión ya abierta; la llave queda en el llavero del teléfono
 * (iCloud / Google), así que también sirve en la app instalada. */

const ON_KEY = 'cuenta.passkey.on';
const OFFER_KEY = 'cuenta.passkey.offer';

/** Cómo se llama el desbloqueo en este teléfono, para hablarle en su idioma. */
export function biometricName(): string {
  const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent;
  if (/iPhone|iPad|iPod/i.test(ua)) return 'Face ID';
  if (/Macintosh/i.test(ua)) return navigator.maxTouchPoints > 1 ? 'Face ID' : 'Touch ID';
  if (/Android/i.test(ua)) return 'tu huella';
  return 'tu llave de acceso';
}

/** Nombre corto de este dispositivo («este iPhone»). */
export function thisDeviceName(): string {
  const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent;
  if (/iPhone/i.test(ua)) return 'este iPhone';
  if (/iPad/i.test(ua) || (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1)) return 'este iPad';
  if (/Android/i.test(ua)) return 'este teléfono';
  if (/Macintosh/i.test(ua)) return 'este Mac';
  return 'este dispositivo';
}

const read = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const write = (k: string, v: string | null) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* sin almacenamiento */ } };

/** Este teléfono ya entró o activó Face ID alguna vez: el botón sale primero en el login. */
export const passkeyUsedHere = () => read(ON_KEY) === '1';
export const markPasskeyHere = (on: boolean) => write(ON_KEY, on ? '1' : null);
/** La invitación a activarlo después de entrar con código sale una sola vez por teléfono. */
export const passkeyOfferSeen = () => read(OFFER_KEY) === '1';
export const markPasskeyOfferSeen = () => write(OFFER_KEY, '1');

/** ¿Este teléfono tiene Face ID / huella para passkeys? (asíncrono: false mientras se averigua). */
export function usePasskeyAvailable(): boolean {
  const [ok, setOk] = useState(false);
  useEffect(() => {
    let alive = true;
    if (!browserSupportsWebAuthn()) return;
    platformAuthenticatorIsAvailable().then((v) => { if (alive) setOk(v); }).catch(() => {});
    return () => { alive = false; };
  }, []);
  return ok;
}

/** Las opciones (con su vale de 2 minutos) se piden ANTES del toque: Safari quiere que Face ID salga
 * directo del toque, sin esperar a la red en medio. Si se vencieron, se piden de nuevo al tocar. */
function usePrefetched<T extends { ticket: string }>(fetcher: () => Promise<T>, enabled: boolean) {
  const cached = useRef<{ value: T; at: number } | null>(null);
  const prefetch = useCallback(() => {
    fetcher().then((value) => { cached.current = { value, at: Date.now() }; }).catch(() => { /* se pide al tocar */ });
  }, [fetcher]);
  useEffect(() => { if (enabled) prefetch(); }, [enabled, prefetch]);
  const take = useCallback(async (): Promise<T> => {
    const c = cached.current;
    cached.current = null;
    // Un vale se usa una sola vez; el próximo se pide atrás.
    if (c && Date.now() - c.at < 90_000) { if (enabled) prefetch(); return c.value; }
    return fetcher();
  }, [fetcher, enabled, prefetch]);
  return take;
}

/** Cancelar el aviso del sistema no es un error: no se muestra nada. */
const cancelled = (e: unknown) => {
  const name = (e as { name?: string })?.name;
  return name === 'NotAllowedError' || name === 'AbortError';
};

export function usePasskeyLogin(enabled: boolean) {
  const { mutateAsync: fetchOptions } = trpc.member.passkeyLoginOptions.useMutation();
  const takeOptions = usePrefetched(useCallback(() => fetchOptions(), [fetchOptions]), enabled);
  const verify = trpc.member.passkeyLoginVerify.useMutation();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const login = useCallback(async () => {
    setError(null);
    setBusy(true);
    try {
      const { options: optionsJSON, ticket } = await takeOptions();
      const response = await startAuthentication({ optionsJSON });
      const r = await verify.mutateAsync({ ticket, response });
      markPasskeyHere(true);
      return r;
    } catch (e) {
      const message = e instanceof Error ? e.message : '';
      if (message.startsWith('UNKNOWN_CREDENTIAL:')) {
        // La llave se quitó desde la app: que el llavero también la borre.
        const id = message.slice('UNKNOWN_CREDENTIAL:'.length);
        if (id) void signalUnknownCredential(id);
        markPasskeyHere(false);
        setError(`Esa llave ya no está activa. Entra con el código y vuelve a activar ${biometricName()} en Perfil.`);
      } else if (!cancelled(e)) {
        setError(message || `No pudimos entrar con ${biometricName()}. Entra con el código.`);
      }
      return null;
    } finally {
      setBusy(false);
    }
  }, [takeOptions, verify]);
  return { login, busy, error };
}

export function usePasskeyRegister(enabled: boolean) {
  const utils = trpc.useUtils();
  const { mutateAsync: fetchOptions } = trpc.member.passkeyRegisterOptions.useMutation();
  const takeOptions = usePrefetched(useCallback(() => fetchOptions(), [fetchOptions]), enabled);
  const verify = trpc.member.passkeyRegisterVerify.useMutation();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const register = useCallback(async (): Promise<boolean> => {
    setError(null);
    setBusy(true);
    try {
      const { options: optionsJSON, ticket } = await takeOptions();
      const response = await startRegistration({ optionsJSON });
      await verify.mutateAsync({ ticket, response });
      markPasskeyHere(true);
      await utils.member.passkeys.invalidate();
      return true;
    } catch (e) {
      const name = (e as { name?: string })?.name;
      // La llave de este teléfono ya estaba activa (excludeCredentials): para la persona es un éxito.
      if (name === 'InvalidStateError') { markPasskeyHere(true); await utils.member.passkeys.invalidate(); return true; }
      if (!cancelled(e)) setError(e instanceof Error && e.message ? e.message : 'No se pudo activar. Intenta de nuevo.');
      return false;
    } finally {
      setBusy(false);
    }
  }, [takeOptions, verify, utils]);
  return { register, busy, error };
}
