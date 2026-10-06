import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { SOUND_PREF_KEY, EQ_BARS, type PistaId } from './config';
import type { SoundEngine } from './engine';

/* Estado del sonido del sitio + puente hacia el motor (engine.ts).
 *
 * Reglas:
 *  - Apagado por defecto. La preferencia ('mp_sound' = '1') solo dice que la
 *    persona QUIERE sonido: los navegadores no dejan sonar nada hasta que toca
 *    algo, así que si la preferencia está en '1' el sonido arranca con el
 *    primer toque de la visita (estado "armado").
 *  - El AudioContext se crea y se destraba SÍNCRONAMENTE dentro del gesto
 *    (Safari/iPhone no lo permite después de un `await`), y recién después se
 *    descarga el motor con import dinámico: quien nunca lo enciende no baja
 *    ni un byte del motor.
 *  - Sin proveedor (páginas prerenderizadas por el build, que renderizan el
 *    Navbar sin `window`) el contexto es un no-op seguro. */

export interface SoundApi {
  /** La persona quiere sonido (botón encendido). */
  enabled: boolean;
  /** Está sonando de verdad ahora mismo. */
  playing: boolean;
  /** Pista elegida en la sección de line-up. */
  pista: PistaId | null;
  toggle: () => void;
  /** Elegir una pista (enciende el sonido si estaba apagado: tocar la tarjeta es consentimiento). */
  selectPista: (pista: PistaId | null) => void;
  setZone: (level: number) => void;
  getBars: (n?: number) => number[] | null;
}

const NOOP: SoundApi = {
  enabled: false,
  playing: false,
  pista: null,
  toggle: () => {},
  selectPista: () => {},
  setZone: () => {},
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
  const [playing, setPlaying] = useState(false);
  const [pista, setPistaState] = useState<PistaId | null>(null);

  const engineRef = useRef<SoundEngine | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const enabledRef = useRef(enabled);
  const startedRef = useRef(false);
  const zoneRef = useRef(0.3);
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
      engine.setZone(zoneRef.current);
      engine.setPista(pistaRef.current);
      if (activeRef.current && !document.hidden) {
        await engine.start();
        setPlaying(true);
      }
    } catch (err) {
      console.error('[sound] no se pudo iniciar el sonido', err);
      startedRef.current = false;
      setPlaying(false);
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
    setPlaying(false);
    writePref(false);
    engineRef.current?.stop();
  }, []);

  const toggle = useCallback(() => {
    // "Armado" (preferencia guardada pero todavía sin sonar): tocar el botón
    // es pedir que suene, no apagarlo.
    if (enabledRef.current && startedRef.current) disable();
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

  const setZone = useCallback((level: number) => {
    zoneRef.current = level;
    engineRef.current?.setZone(level);
  }, []);

  const getBars = useCallback((n: number = EQ_BARS) => engineRef.current?.getBars(n) ?? null, []);

  // Preferencia guardada: el primer toque de la visita arranca el sonido.
  useEffect(() => {
    if (!enabled || startedRef.current || !active) return;
    const events = ['pointerdown', 'keydown', 'touchend'] as const;
    const arm = () => {
      events.forEach((e) => window.removeEventListener(e, arm, true));
      if (enabledRef.current) {
        unlock();
        void begin();
      }
    };
    events.forEach((e) => window.addEventListener(e, arm, true));
    return () => events.forEach((e) => window.removeEventListener(e, arm, true));
  }, [enabled, active, unlock, begin]);

  // Pestaña oculta o pantalla interna (caja, admin...): en silencio.
  useEffect(() => {
    const sync = () => {
      const engine = engineRef.current;
      if (!engine || !enabledRef.current || !startedRef.current) return;
      if (activeRef.current && !document.hidden) {
        engine.resume();
        setPlaying(true);
      } else {
        engine.pause();
        setPlaying(false);
      }
    };
    document.addEventListener('visibilitychange', sync);
    sync();
    return () => document.removeEventListener('visibilitychange', sync);
  }, [active]);

  const value = useMemo<SoundApi>(
    () => ({ enabled, playing, pista, toggle, selectPista, setZone, getBars }),
    [enabled, playing, pista, toggle, selectPista, setZone, getBars],
  );

  return <SoundCtx.Provider value={value}>{children}</SoundCtx.Provider>;
}

/** Mientras la página está montada, ajusta qué tan "abierta" está la puerta de
 * la Mansión según la sección que se ve (elementos con `data-sound-zone`,
 * valor de 0 a 1). Usa IntersectionObserver: saltos discretos, sin listener de
 * scroll -- el sitio evita a propósito todo lo ligado al scroll en celular. */
export function useSoundZones() {
  const { setZone } = useSound();
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;
    const ratios = new Map<Element, number>();
    const observed = new Set<Element>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) ratios.set(entry.target, entry.isIntersecting ? entry.intersectionRatio : 0);
        let best: HTMLElement | null = null;
        let bestRatio = 0;
        ratios.forEach((ratio, el) => {
          if (ratio > bestRatio) {
            bestRatio = ratio;
            best = el as HTMLElement;
          }
        });
        if (best) setZone(Number((best as HTMLElement).dataset.soundZone ?? 0));
      },
      { threshold: [0, 0.25, 0.5, 0.75, 1] },
    );

    // Algunas secciones aparecen recién cuando llegan los datos: se vuelve a
    // buscar (con pausa, para no gastar nada) cuando el DOM cambia.
    const scan = () => {
      document.querySelectorAll<HTMLElement>('[data-sound-zone]').forEach((el) => {
        if (observed.has(el)) return;
        observed.add(el);
        io.observe(el);
      });
    };
    scan();
    let pending: ReturnType<typeof setTimeout> | null = null;
    const mo = new MutationObserver(() => {
      if (pending) return;
      pending = setTimeout(() => {
        pending = null;
        scan();
      }, 400);
    });
    mo.observe(document.body, { childList: true, subtree: true });

    return () => {
      if (pending) clearTimeout(pending);
      mo.disconnect();
      io.disconnect();
      setZone(0.3);
    };
  }, [setZone]);
}
