import { useEffect, useRef, useState } from 'react';

/* Navegación de la App, como una app de iPhone:
 *
 * - Sentido: cada entrada del historial lleva un número (`__idx`), así se sabe si un cambio de pantalla
 *   fue «avanzar» (entra desde la derecha) o «volver» (desde la izquierda). `navDirection()`.
 * - Scroll: cada entrada recuerda dónde quedó la pantalla (`__key`). Al volver se restaura ese punto exacto,
 *   esperando a que cargue el contenido; al avanzar la pantalla nueva abre arriba. Siempre al instante: nunca
 *   se ve la página deslizarse sola (el `scroll-behavior: smooth` del sitio hacía ese «barrido»).
 * - Hojas: una hoja abierta (QR, «Más», Movimientos, la guía de Playmatch…) suma una entrada (`__layer`).
 *   El gesto de volver, el «atrás» de Android y «Volver» cierran primero la hoja de más arriba, de a una.
 * - Lugar: `useEntryState` guarda en la entrada qué hoja o sub-pantalla estaba abierta; si la persona sale
 *   a otra pantalla desde ahí y vuelve, la encuentra igual.
 *
 * `installAppNav()` se llama una vez en main.tsx, después de que wouter parcha `history`. */

export type NavDirection = 'push' | 'pop' | 'replace';

type NavState = { __idx?: number; __key?: string; __layer?: number; __s?: Record<string, unknown> } & Record<string, unknown>;

const SEQ_KEY = 'mp.nav.seq';
const FIRST_KEY = 'mp.nav.first';
const SCROLL_KEY = 'mp.nav.scroll';
const MAX_SAVED = 60;

let installed = false;
let seq = 0;
let firstIdx = 0;
let currentIdx = 0;
let currentKey = '';
let currentPath = '';
let lastDirection: NavDirection = 'replace';
let restoreScroll = false;
const scrollMem = new Map<string, number>();

const state = (): NavState => (window.history.state as NavState | null) ?? {};
const newKey = () => Math.random().toString(36).slice(2, 10);
const ss = {
  get(k: string) { try { return sessionStorage.getItem(k); } catch { return null; } },
  set(k: string, v: string) { try { sessionStorage.setItem(k, v); } catch { /* sin almacenamiento: queda en memoria */ } },
};

/** Avanzar o volver según el número de la entrada (puro, para los tests). */
export function directionBetween(fromIdx: number, toIdx: number | undefined): NavDirection {
  if (toIdx == null) return 'replace';
  return toIdx < fromIdx ? 'pop' : 'push';
}

function saveScroll() {
  if (!currentKey) return;
  scrollMem.delete(currentKey);
  scrollMem.set(currentKey, Math.round(window.scrollY));
  while (scrollMem.size > MAX_SAVED) scrollMem.delete(scrollMem.keys().next().value as string);
  ss.set(SCROLL_KEY, JSON.stringify(Array.from(scrollMem.entries())));
}

function pathOf(url: string | URL | null | undefined): string {
  if (url == null) return window.location.pathname;
  try { return new URL(String(url), window.location.href).pathname; } catch { return window.location.pathname; }
}

export function installAppNav() {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  try { window.history.scrollRestoration = 'manual'; } catch { /* nada */ }
  try { for (const [k, v] of JSON.parse(ss.get(SCROLL_KEY) ?? '[]') as [string, number][]) scrollMem.set(k, v); } catch { /* nada */ }
  seq = Number(ss.get(SEQ_KEY)) || 0;

  const origPush = window.history.pushState.bind(window.history);
  const origReplace = window.history.replaceState.bind(window.history);

  const st = state();
  if (st.__idx == null || !st.__key) origReplace({ ...st, __idx: (seq += 1), __key: newKey() }, '');
  ss.set(SEQ_KEY, String(seq));
  currentIdx = state().__idx!;
  currentKey = state().__key!;
  currentPath = window.location.pathname;
  const first = Number(ss.get(FIRST_KEY));
  firstIdx = first && first <= currentIdx ? first : currentIdx;
  ss.set(FIRST_KEY, String(firstIdx));

  window.history.pushState = function pushState(data: unknown, unused: string, url?: string | URL | null) {
    // Una navegación nueva cancela un «atrás» que iba en camino (cerrar una hoja): no se espera su aviso.
    if (ignorePops > 0) { ignorePops = 0; waiting.splice(0).forEach((fn) => fn()); }
    saveScroll();
    const next: NavState = { ...((data as NavState | null) ?? {}), __idx: (seq += 1), __key: newKey() };
    ss.set(SEQ_KEY, String(seq));
    const path = pathOf(url);
    if (path !== currentPath) { lastDirection = 'push'; restoreScroll = false; }
    currentIdx = next.__idx!;
    currentKey = next.__key!;
    currentPath = path;
    return origPush(next, unused, url);
  };

  window.history.replaceState = function replaceState(data: unknown, unused: string, url?: string | URL | null) {
    const given = (data as NavState | null) ?? {};
    const path = pathOf(url);
    const changed = path !== currentPath;
    // Reemplazar por otra pantalla es una pantalla nueva (otro scroll); la misma pantalla conserva su entrada.
    const next: NavState = changed
      ? { ...given, __idx: currentIdx, __key: newKey(), __layer: undefined }
      : { ...given, __idx: given.__idx ?? currentIdx, __key: given.__key ?? currentKey };
    if (changed) { lastDirection = 'replace'; restoreScroll = false; currentKey = next.__key!; currentPath = path; }
    return origReplace(next, unused, url);
  };

  // Antes que wouter (que escucha en burbuja): al pintar la pantalla nueva ya se sabe el sentido.
  window.addEventListener('popstate', onPopState, true);
}

function onPopState() {
  const st = state();
  const path = window.location.pathname;
  saveScroll();
  if (path !== currentPath) {
    lastDirection = directionBetween(currentIdx, st.__idx);
    restoreScroll = true;
  }
  currentIdx = st.__idx ?? currentIdx;
  currentKey = st.__key ?? newKey();
  currentPath = path;

  if (ignorePops > 0) {
    ignorePops -= 1;
    if (ignorePops === 0) {
      const run = waiting.splice(0);
      run.forEach((fn) => fn());
      selfPopListeners.forEach((fn) => fn());
    }
    return;
  }
  // Volver a una entrada con menos hojas cierra las de más arriba, de a una (la de más arriba primero).
  const depth = st.__layer ?? 0;
  while (layers.length > depth) layers.pop()!.close();
}

/** Cómo llegó la pantalla actual: avanzando, volviendo o reemplazando. */
export function navDirection(): NavDirection {
  return lastDirection;
}

/** ¿Hay una pantalla de esta App a la cual volver? (`history.length` cuenta también lo de antes de abrirla). */
export function canGoBack(): boolean {
  return installed && currentIdx > firstIdx;
}

/** «Volver»: la pantalla anterior de la App o, si se abrió desde un link, su inicio. */
export function goBack(fallback: () => void) {
  if (canGoBack()) window.history.back();
  else fallback();
}

/** Mover la página al instante (el `scroll-behavior: smooth` del sitio la haría deslizarse). */
export function scrollInstant(top: number) {
  window.scrollTo({ top, left: 0, behavior: 'instant' as ScrollBehavior });
}

/** Dónde debe quedar la pantalla recién mostrada: donde estaba si se volvió a ella, arriba si es nueva. */
export function routeScrollTarget(): number {
  return restoreScroll ? scrollMem.get(currentKey) ?? 0 : 0;
}

/** Lleva la pantalla a `top` y la sostiene ahí mientras carga el contenido (fotos, datos) hasta 2,5 s, o
 * hasta que la persona toque o deslice. Devuelve cómo cancelarlo. */
export function holdScroll(top: number): () => void {
  scrollInstant(top);
  if (top <= 0) return () => {};
  let stop = false;
  let raf = 0;
  let stable = 0;
  const t0 = performance.now();
  const cancel = () => { stop = true; cancelAnimationFrame(raf); off(); };
  const events = ['touchstart', 'wheel', 'keydown', 'mousedown'] as const;
  const off = () => events.forEach((e) => window.removeEventListener(e, cancel));
  events.forEach((e) => window.addEventListener(e, cancel, { passive: true, once: true }));
  const tick = () => {
    if (stop) return;
    if (Math.abs(window.scrollY - top) > 1) { scrollInstant(top); stable = 0; } else stable += 1;
    const reachable = document.documentElement.scrollHeight - window.innerHeight >= top - 1;
    if ((reachable && stable > 20) || performance.now() - t0 > 2500) { off(); return; }
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  return cancel;
}

/* --- Hojas ------------------------------------------------------------------ */

type Layer = { close: () => void; path: string };
const layers: Layer[] = [];
let ignorePops = 0;
const waiting: (() => void)[] = [];
const selfPopListeners = new Set<() => void>();

function openLayer(close: () => void): () => void {
  const layer: Layer = { close, path: window.location.pathname };
  const open = () => {
    const depth = layers.length + 1;
    const st = state();
    // Al volver a una pantalla que tenía esta hoja abierta, la entrada ya existe: se usa la misma.
    if (st.__layer !== depth) window.history.pushState({ ...st, __layer: depth }, '');
    layers.push(layer);
  };
  if (ignorePops > 0) waiting.push(open); else open();
  return () => {
    const w = waiting.indexOf(open);
    if (w >= 0) { waiting.splice(w, 1); return; }
    const i = layers.indexOf(layer);
    if (i < 0) return; // ya la cerró el «volver»
    layers.splice(i, 1);
    // Un instante después: si la hoja se cerró porque se tocó un link (Comprar, un evento…), la navegación ya
    // ocurrió y su entrada queda; al volver, la hoja se reabre tal cual (useEntryState).
    window.setTimeout(() => {
      if (window.location.pathname !== layer.path || ignorePops > 0) return;
      const extra = (state().__layer ?? 0) - layers.length;
      if (extra > 0) { ignorePops += 1; window.history.go(-extra); }
    }, 0);
  };
}

/** Mientras `open`, la hoja ocupa una entrada del historial: «volver» la cierra a ella primero. */
export function useBackLayer(open: boolean, onClose: () => void) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (!open || !installed) return;
    return openLayer(() => closeRef.current());
  }, [open]);
}

/** Entradas de hoja que nadie reabrió al volver (la hoja no recuerda su estado): se quitan, para que un
 * «volver» nunca quede sin efecto. */
export function dropOrphanLayers() {
  if (!installed || ignorePops > 0) return;
  const extra = (state().__layer ?? 0) - layers.length;
  if (extra > 0) { ignorePops += 1; window.history.go(-extra); }
}

/* --- Lugar dentro de la pantalla ---------------------------------------------- */

function writeEntry(key: string, value: unknown) {
  const st = state();
  window.history.replaceState({ ...st, __s: { ...(st.__s ?? {}), [key]: value } }, '');
}

/** Como useState, pero el valor queda guardado en la entrada del historial: al volver a esta pantalla
 * (después de ir a otra) se recupera tal como estaba. `key` única por pantalla. */
export function useEntryState<T>(key: string, initial: T | (() => T)): [T, (next: T) => void] {
  const [value, setValue] = useState<T>(() => {
    const saved = installed ? state().__s?.[key] : undefined;
    if (saved !== undefined) return saved as T;
    return typeof initial === 'function' ? (initial as () => T)() : initial;
  });
  const ref = useRef(value);
  ref.current = value;
  useEffect(() => {
    if (!installed) return;
    // Cerrar una hoja con su botón saca su entrada con un «atrás»: la entrada de abajo se pone al día.
    const sync = () => writeEntry(key, ref.current);
    selfPopListeners.add(sync);
    return () => { selfPopListeners.delete(sync); };
  }, [key]);
  const set = (next: T) => {
    ref.current = next;
    setValue(next);
    if (!installed) return;
    // Un instante después y solo si sigue en la misma pantalla: cerrar algo al tocar un link que lleva a otra
    // pantalla no lo borra de esta entrada, así al volver se encuentra abierto.
    const path = window.location.pathname;
    window.setTimeout(() => { if (window.location.pathname === path) writeEntry(key, ref.current); }, 0);
  };
  return [value, set];
}

/** Pasos de un flujo (la compra): avanzar suma una entrada, y «volver», el gesto o «Editar» retroceden por el
 * historial, así todos llevan al mismo lugar. `replace` cambia de paso sin sumar entrada (la compra exprés). */
export function useHistoryStep(key: string, enabled: boolean): [number, (next: number, opts?: { replace?: boolean }) => void, (fallback: () => void) => void] {
  const on = enabled && installed;
  const [step, setStep] = useState(() => (on ? Number(state().__s?.[key] ?? 0) || 0 : 0));
  // La entrada donde empezó el flujo: de ahí se sale con «✕».
  const baseIdx = useRef(installed ? state().__idx ?? 0 : 0);
  const ref = useRef(step);
  ref.current = step;
  // Los pasos que tienen entrada propia, de abajo hacia arriba (el primero es el de la entrada de la pantalla).
  const stack = useRef<number[]>([step]);
  const target = useRef<number | null>(null);
  useEffect(() => {
    if (!on) return;
    const path = window.location.pathname;
    const onPop = () => {
      if (window.location.pathname !== path) return;
      const landed = Number(state().__s?.[key] ?? 0) || 0;
      const at = stack.current.lastIndexOf(landed);
      const top = stack.current[stack.current.length - 1];
      // Atrás: se recorta la pila hasta el paso donde cayó; adelante (el navegador): se vuelve a sumar.
      stack.current = at >= 0 ? stack.current.slice(0, at + 1) : landed > top ? [...stack.current, landed] : [landed];
      const want = target.current ?? landed;
      target.current = null;
      ref.current = want;
      setStep(want);
      if (want !== landed) writeEntry(key, want);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [on, key]);
  const go = (next: number, opts?: { replace?: boolean }) => {
    const cur = ref.current;
    if (next === cur) return;
    const local = () => { ref.current = next; setStep(next); if (on) writeEntry(key, next); };
    if (!on || opts?.replace) {
      if (on) stack.current[stack.current.length - 1] = next;
      local();
      return;
    }
    if (next > cur) {
      const st = state();
      ref.current = next;
      setStep(next);
      stack.current.push(next);
      window.history.pushState({ ...st, __layer: undefined, __s: { ...(st.__s ?? {}), [key]: next } }, '');
      return;
    }
    // Atrás: hasta la última entrada con un paso igual o anterior; si no cae justo, se corrige al llegar.
    let at = stack.current.length - 1;
    while (at > 0 && stack.current[at] > next) at -= 1;
    const hops = stack.current.length - 1 - at;
    if (hops === 0) { stack.current[at] = next; local(); return; }
    target.current = next;
    window.history.go(-hops);
  };
  /** Salir del flujo: a la pantalla de antes de entrar, saltándose sus pasos; si se entró desde un link, `fallback`. */
  const exit = (fallback: () => void) => {
    const hops = on ? stack.current.length - 1 : 0;
    if (installed && baseIdx.current > firstIdx) { window.history.go(-(hops + 1)); return; }
    if (hops === 0) { fallback(); return; }
    window.addEventListener('popstate', () => fallback(), { once: true });
    window.history.go(-hops);
  };
  return [step, go, exit];
}
