import { useEffect, useState, useSyncExternalStore } from 'react';
import { isIos, isStandalone, pushPlatform } from './customerPush';

/* Instalar el sitio como app («App de PlayRoom»).
 *
 * Chrome/Android avisa una sola vez, temprano, que se puede instalar
 * (`beforeinstallprompt`): se guarda acá apenas carga el sitio, para que el
 * botón «Instalar» funcione aunque el aviso se muestre después. */

export type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

let deferred: InstallEvent | null = null;
const listeners = new Set<() => void>();

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as InstallEvent;
    listeners.forEach((l) => l());
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    listeners.forEach((l) => l());
  });
}

/** El aviso nativo de instalación, si el navegador lo ofreció. */
export function useInstallPrompt(): InstallEvent | null {
  const [value, setValue] = useState(deferred);
  useEffect(() => {
    const update = () => setValue(deferred);
    listeners.add(update);
    update();
    return () => { listeners.delete(update); };
  }, []);
  return value;
}

/** Cómo se instala en este dispositivo. */
export type InstallHow = 'ios-safari' | 'ios-otro' | 'android' | 'escritorio';

export function installHow(): InstallHow {
  if (typeof navigator === 'undefined') return 'escritorio';
  if (isIos()) {
    // En iPhone solo Safari agrega a inicio como app (Chrome/Instagram abren el sitio dentro de ellos).
    const ua = navigator.userAgent;
    const otherBrowser = /crios|fxios|edgios|opios|instagram|fban|fbav|line\/|gsa\//i.test(ua);
    return otherBrowser ? 'ios-otro' : 'ios-safari';
  }
  return pushPlatform() === 'android' ? 'android' : 'escritorio';
}

/** ¿Estamos dentro de la app instalada? */
export function isInstalledApp(): boolean {
  return isStandalone();
}

/* «El aviso de instalar está a la vista»: la franja de abajo es una sola, así
 * que el aviso de notificaciones y la invitación a «Mi cuenta» esperan a que
 * se cierre (ver PushBanner y MemberSheet). */
let promptVisible = false;
const visibleListeners = new Set<() => void>();

export function setInstallPromptVisible(value: boolean): void {
  if (promptVisible === value) return;
  promptVisible = value;
  visibleListeners.forEach((l) => l());
}

export function useInstallPromptVisible(): boolean {
  return useSyncExternalStore(
    (cb) => { visibleListeners.add(cb); return () => { visibleListeners.delete(cb); }; },
    () => promptVisible,
    () => false,
  );
}
