import superjson from 'superjson';

/* Última respuesta conocida de PLAYMORE guardada en el teléfono. Sin esto, al abrir la app (o entrar al checkout) se pintaba la
 * pantalla de Playroom mientras llegaba la consulta y un instante después se cambiaba a la de PLAYMORE: un destello feo.
 * Con lo guardado la pantalla nace con la cara correcta y la consulta se renueva por detrás (si el evento terminó, se corrige
 * con la respuesta nueva). Es solo una pista visual: el servidor sigue decidiendo qué se vende y a quién. */

const PREFIX = 'mp.pm-snap:';
const MAX_AGE_MS = 3 * 24 * 60 * 60_000;

type Snap<T> = { v: T; at: number };

export function readSnapshot<T>(key: string, now = Date.now()): Snap<T> | undefined {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (!raw) return undefined;
    const snap = superjson.parse<Snap<T>>(raw);
    if (!snap || typeof snap.at !== 'number' || now - snap.at > MAX_AGE_MS) return undefined;
    return snap;
  } catch { return undefined; }
}

export function writeSnapshot<T>(key: string, v: T): void {
  try { localStorage.setItem(PREFIX + key, superjson.stringify({ v, at: Date.now() } satisfies Snap<T>)); } catch { /* sin almacenamiento */ }
}

export const playmoreGetKey = (preview: string | undefined) => `get:${preview ?? ''}`;
export const brandKey = (eventSlug: string, preview: string | undefined) => `brand:${eventSlug}:${preview ?? ''}`;

/** Opciones de react-query para nacer con lo guardado: se muestra al instante y se vuelve a pedir si ya pasó `staleTime`. */
export function snapshotQueryOptions<T>(snap: Snap<T> | undefined) {
  return snap ? { initialData: snap.v, initialDataUpdatedAt: snap.at } : {};
}
