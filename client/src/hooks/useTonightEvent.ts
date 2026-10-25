import { useMemo, useState } from 'react';
import { trpc } from '@/lib/trpc';
import { EVENT_WRAPUP_HOURS, pickCurrentEvent } from '@shared/currentEvent';

/** El evento de una pantalla del panel con selector: arranca en el que está pasando, en el que acaba de pasar
 * (dos días, para revisar el cierre) o, si no hay, en el próximo; y cambia cuando el admin elige otro. Antes
 * tomaba el más cercano en el tiempo, que dejaba pantallas en una fiesta de hace semanas mientras otras
 * (Ventas) ya mostraban la próxima. No parte del primero de la lista: `listAll` ordena por creación, así que
 * un evento de prueba creado después quedaría elegido. */
export function useTonightEvent() {
  const { data: events } = trpc.events.listAll.useQuery();
  const { data: tonight } = trpc.events.getActiveForCaja.useQuery();
  const [selected, setSelected] = useState<number | null>(null);
  const current = useMemo(() => pickCurrentEvent(events as any[] | undefined, new Date(), EVENT_WRAPUP_HOURS).event, [events]);
  const eventId: number | null = selected ?? current?.id ?? tonight?.id ?? events?.[0]?.id ?? null;
  return { events, eventId, setSelected };
}
