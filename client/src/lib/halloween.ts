import { trpc } from '@/lib/trpc';

/* ¿Está prendido el «Modo Halloween»? Es el mismo interruptor del admin (Ajustes) que ya re-tiñe la
 * portada (pages/HalloweenHome.tsx): una sola decisión para todo el sitio. Se recuerda el último
 * valor para no mostrar un parpadeo del tema normal antes de que llegue la configuración. Con
 * `?tema=halloween` en la dirección se ve la vista previa sin tocar el interruptor. */

const STORAGE_KEY = 'mp_halloween_mode';

function cached(): boolean {
  try { return localStorage.getItem(STORAGE_KEY) === '1'; } catch { return false; }
}

export function useHalloweenMode(): boolean {
  const { data } = trpc.settings.get.useQuery(undefined, { staleTime: 60_000 });
  const preview = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('tema') === 'halloween';
  return preview || (data ? !!data.halloweenModeEnabled : cached());
}
