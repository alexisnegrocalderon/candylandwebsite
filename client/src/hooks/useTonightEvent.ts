import { useCallback, useMemo, useState } from 'react';
import { trpc } from '@/lib/trpc';
import { EVENT_WRAPUP_HOURS, pickCurrentEvent } from '@shared/currentEvent';
import { isDemoSlug } from '@shared/demoAccount';

const STORAGE_KEY = 'admin.eventId';

/** Eventos que nunca se eligen solos: la cuenta de prueba de la App y el evento de pruebas de la caja. */
export const isTestEvent = (e: { slug?: string | null }) => isDemoSlug(e.slug) || e.slug === 'pruebas-caja';

const loadSaved = (): number | null => {
  try { const n = Number(localStorage.getItem(STORAGE_KEY)); return Number.isInteger(n) && n > 0 ? n : null; } catch { return null; }
};

/** El evento de una pantalla del panel con selector: arranca en el que está pasando, en el que acaba de pasar
 * (dos días, para revisar el cierre) o, si no hay, en el próximo; y cambia cuando el admin elige otro, y esa
 * elección se recuerda en todas las pantallas. Antes tomaba el más cercano en el tiempo, que dejaba pantallas en
 * una fiesta de hace semanas mientras otras (Ventas) ya mostraban la próxima. No parte del primero de la lista:
 * `listAll` ordena por fecha descendente, así que la cuenta de prueba (que cae unos días después) quedaría
 * elegida. Los eventos de prueba nunca se eligen solos. */
export function useTonightEvent(opts: { enabled?: boolean } = {}) {
  const enabled = opts.enabled ?? true;
  const { data: events } = trpc.events.listAll.useQuery(undefined, { enabled });
  const { data: tonight } = trpc.events.getActiveForCaja.useQuery(undefined, { enabled });
  const [chosen, setChosen] = useState<number | null>(loadSaved);
  const real = useMemo(() => ((events ?? []) as any[]).filter((e) => !isTestEvent(e)), [events]);
  const current = useMemo(() => pickCurrentEvent(real, new Date(), EVENT_WRAPUP_HOURS).event, [real]);
  // Lo recordado solo vale si el evento todavía existe.
  const selected = chosen != null && ((events ?? []) as any[]).some((e) => e.id === chosen) ? chosen : null;
  const eventId: number | null = selected ?? current?.id ?? tonight?.id ?? real[0]?.id ?? null;
  const setSelected = useCallback((id: number | null) => {
    setChosen(id);
    try { if (id != null) localStorage.setItem(STORAGE_KEY, String(id)); else localStorage.removeItem(STORAGE_KEY); } catch { /* sin storage: no se recuerda */ }
  }, []);
  return { events, eventId, setSelected };
}
