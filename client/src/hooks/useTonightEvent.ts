import { useState } from 'react';
import { trpc } from '@/lib/trpc';

/** El evento de una pantalla del panel con selector: arranca en el que /caja considera «el de esta
 * noche» (no en el primero de la lista: `listAll` ordena por creación, así que un evento de prueba
 * creado después quedaría elegido) y cambia cuando el admin elige otro. */
export function useTonightEvent() {
  const { data: events } = trpc.events.listAll.useQuery();
  const { data: tonight } = trpc.events.getActiveForCaja.useQuery();
  const [selected, setSelected] = useState<number | null>(null);
  const eventId: number | null = selected ?? tonight?.id ?? events?.[0]?.id ?? null;
  return { events, eventId, setSelected };
}
