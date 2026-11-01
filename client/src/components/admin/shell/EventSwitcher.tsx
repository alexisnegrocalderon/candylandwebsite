import { CalendarDays } from 'lucide-react';
import { useTonightEvent, isTestEvent } from '@/hooks/useTonightEvent';
import { formatChileShortDate } from '@shared/chileDate';

/** El evento de trabajo del panel, arriba de las etapas Preparar · Vender · En vivo · Cierre. Elegirlo acá lo
 * cambia en todas las pantallas que trabajan por evento (ver `useTonightEvent`). */
export function EventSwitcher() {
  const { events, eventId, setSelected } = useTonightEvent();
  const list = ((events ?? []) as { id: number; title: string; slug?: string | null; eventDate: string | Date }[])
    .filter((e) => !isTestEvent(e) || e.id === eventId)
    .sort((a, b) => new Date(b.eventDate).getTime() - new Date(a.eventDate).getTime());
  if (list.length === 0) return null;
  return (
    <label className="mt-2 flex min-w-0 items-center gap-2 px-1 text-sm">
      <CalendarDays className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
      <span className="shrink-0 text-muted-foreground">Evento</span>
      <select
        value={eventId ?? ''}
        onChange={(e) => setSelected(Number(e.target.value))}
        className="h-9 min-w-0 flex-1 truncate rounded-xl border border-white/15 bg-white/5 px-3 font-medium sm:max-w-md"
        aria-label="Evento con el que trabajas"
      >
        {list.map((e) => (
          <option key={e.id} value={e.id}>{e.title} · {formatChileShortDate(e.eventDate)}</option>
        ))}
      </select>
    </label>
  );
}
