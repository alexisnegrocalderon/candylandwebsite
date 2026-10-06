import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { SOUND_PREF_KEY, EQ_BARS, type PistaId } from './config';
import type { SoundEngine } from './engine';

/* Estado del sonido del sitio + puente hacia el motor (engine.ts).
 *
 * Reglas:
 *  - El sitio está en silencio: solo suena una pista cuando alguien la toca.
 *    No hay música de fondo ni sonido atado a la sección que se ve.
 *  - Apagado por defecto. El botón del header permite o silencia las pistas;
 *    tocar una tarjeta de pista con el sonido apagado lo enciende (tocarla es
 *    pedirlo). La preferencia ('mp_sound') se recuerda entre visitas.
 *  - El AudioContext se crea y se destraba SÍNCRONAMENTE dentro del gesto
 *    (Safari/iPhone no lo permite después de un `await`), y recién después se
 *    descarga el motor con import dinámico: quien nunca lo enciende no baja
 *    ni un byte del motor.
 *  - Sin proveedor (páginas prerenderizadas por el build, que renderizan el
 *    Navbar sin `window`) el contexto es un no-op seguro. */

export interface SoundApi {
  /** Sonido permitido (botón encendido). */
  enabled: boolean;
  /** Hay una pista sonando de verdad ahora mismo. */
  playing: boolean;
  /** Pista elegida en la sección de line-up. */
  pista: PistaId | null;
  toggle: () => void;
  /** Elegir una pista (enciende el sonido si estaba apagado: tocar la tarjeta es consentimiento). */
  selectPista: (pista: PistaId | null) => void;
  getBars: (n?: number) => number[] | null;
}

const NOOP: SoundApi = {
  enabled: false,
  playing: false,
  pista: null,
  toggle: () => {},
  selectPista: () => {},
  getBars: () => null,
};

const SoundCtx = createContext<SoundApi>(NOOP);
export const useSound = () => useContext(SoundCtx);

function readPref(): boolean {
  try {
    return localStorage.getItem(SOUND_PREF_KEY) === '1';
  } catch {
    return false;
  }
}

function writePref(on: boolean) {
  try {
    localStorage.setItem(SOUND_PREF_KEY, on ? '1' : '0');
  } catch {
    // Modo privado / storage bloqueado: solo se pierde que se recuerde.
  }
}

/** Crea el AudioContext y lo destraba. Tiene que llamarse DENTRO del gesto. */
function createUnlockedContext(): AudioContext | null {
  const Ctor: typeof AudioContext | undefined =
    typeof window !== 'undefined' ? window.AudioContext ?? (window as any).webkitAudioContext : undefined;
  if (!Ctor) return null;
  try {
    const ctx = new Ctor({ latencyHint: 'playback' });
    void ctx.resume();
    // Un buffer mudo de 1 muestra termina de destrabar iOS.
    const src = ctx.createBufferSource();
    src.buffer = ctx.createBuffer(1, 1, 22050);
    src.connect(ctx.destination);
    src.start(0);
    return ctx;
  } catch {
    return null;
  }
}

export function SoundProvider({ active, children }: { active: boolean; children: ReactNode }) {
  const [enabled, setEnabled] = useState<boolean>(() => readPref());
  const [running, setRunning] = useState(false);
  const [pista, setPistaState] = useState<PistaId | null>(null);

  const engineRef = useRef<SoundEngine | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const enabledRef = useRef(enabled);
  const startedRef = useRef(false);
  const pistaRef = useRef<PistaId | null>(null);
  const activeRef = useRef(active);
  activeRef.current = active;

  const unlock = useCallback(() => {
    if (!ctxRef.current) ctxRef.current = createUnlockedContext();
    else void ctxRef.current.resume();
  }, []);

  /** Carga el motor y arranca. Idempotente mientras ya esté sonando. */
  const begin = useCallback(async () => {
    if (startedRef.current || !ctxRef.current) return;
    startedRef.current = true;
    try {
      const { SoundEngine } = await import('./engine');
      if (!startedRef.current) return; // lo apagaron mientras cargaba
      if (!engineRef.current) {
        const engine = new SoundEngine();
        engine.init(ctxRef.current);
        engineRef.current = engine;
      }
      const engine = engineRef.current;
      engine.setPista(pistaRef.current);
      if (activeRef.current && !document.hidden) {
        await engine.start();
        setRunning(true);
      }
    } catch (err) {
      console.error('[sound] no se pudo iniciar el sonido', err);
      startedRef.current = false;
      setRunning(false);
    }
  }, []);

  const enable = useCallback(() => {
    unlock();
    enabledRef.current = true;
    setEnabled(true);
    writePref(true);
    void begin();
  }, [unlock, begin]);

  const disable = useCallback(() => {
    enabledRef.current = false;
    startedRef.current = false;
    setEnabled(false);
    setRunning(false);
    writePref(false);
    engineRef.current?.stop();
  }, []);

  const toggle = useCallback(() => {
    if (enabledRef.current) disable();
    else enable();
  }, [enable, disable]);

  const selectPista = useCallback((next: PistaId | null) => {
    pistaRef.current = next;
    setPistaState(next);
    if (next && !enabledRef.current) {
      enable();
    } else if (next && !startedRef.current) {
      unlock();
      void begin();
    } else {
      engineRef.current?.setPista(next);
    }
  }, [enable, unlock, begin]);

  const getBars = useCallback((n: number = EQ_BARS) => engineRef.current?.getBars(n) ?? null, []);

  // Pestaña oculta o pantalla interna (caja, admin...): en silencio.
  useEffect(() => {
    const sync = () => {
      const engine = engineRef.current;
      if (!engine || !enabledRef.current || !startedRef.current) return;
      if (activeRef.current && !document.hidden) {
        engine.resume();
        setRunning(true);
      } else {
        engine.pause();
        setRunning(false);
      }
    };
    document.addEventListener('visibilitychange', sync);
    sync();
    return () => document.removeEventListener('visibilitychange', sync);
  }, [active]);

  const playing = running && pista !== null;
  const value = useMemo<SoundApi>(
    () => ({ enabled, playing, pista, toggle, selectPista, getBars }),
    [enabled, playing, pista, toggle, selectPista, getBars],
  );

  return <SoundCtx.Provider value={value}>{children}</SoundCtx.Provider>;
}
