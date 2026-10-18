import { useEffect } from 'react';

/* Sin señal, react-query deja las consultas "en pausa" (fetchStatus
 * 'paused') y la caja se quedaba girando para siempre en las puertas de
 * entrada (¿tablet enrolada?, ¿quién está logueado?, ¿hay turno abierto?),
 * aunque el service worker ya hubiera servido la app. Esto recuerda la
 * última respuesta buena de cada una en localStorage y la usa mientras no
 * hay red; con red manda siempre el servidor. La sesión del operador dura
 * 12 h, así que lo vendido sin señal se sincroniza igual al volver. */

const PREFIX = 'caja_offline:';

type QueryLike = {
  data: unknown;
  isLoading: boolean;
  isError: boolean;
  fetchStatus: 'fetching' | 'paused' | 'idle';
};

function read<T>(key: string): T | undefined {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw ? (JSON.parse(raw) as T) : undefined;
  } catch {
    return undefined;
  }
}

/** Datos del servidor o, sin red, la última respuesta guardada.
 * `waiting` es true solo si de verdad no hay nada que mostrar todavía. */
export function useOfflineFallback<Q extends QueryLike>(key: string, query: Q): { data: Q['data'] | undefined; waiting: boolean; fromCache: boolean } {
  type T = NonNullable<Q['data']> | Extract<Q['data'], null>;
  useEffect(() => {
    if (query.data === undefined) return;
    try { localStorage.setItem(PREFIX + key, JSON.stringify(query.data)); } catch { /* sin storage: solo online */ }
  }, [key, query.data]);

  if (query.data !== undefined) return { data: query.data, waiting: false, fromCache: false };
  const offline = query.fetchStatus === 'paused' || query.isError || (typeof navigator !== 'undefined' && !navigator.onLine);
  if (offline) {
    const cached = read<T>(key);
    if (cached !== undefined) return { data: cached, waiting: false, fromCache: true };
    return { data: undefined, waiting: query.fetchStatus === 'paused', fromCache: false };
  }
  return { data: undefined, waiting: query.isLoading, fromCache: false };
}

/** Al cerrar sesión o turno, olvidar lo guardado para no "revivir" una
 * sesión que ya terminó. */
export function forgetOffline(...keys: string[]) {
  try { for (const k of keys) localStorage.removeItem(PREFIX + k); } catch { /* nada */ }
}
