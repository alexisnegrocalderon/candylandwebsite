import { Heart, Star } from 'lucide-react';
import { isOnline } from '@shared/party';
import { trpc } from '@/lib/trpc';
import { PersonPhoto, tap } from '@/components/party/ui';
import type { MansionPerson } from '@/components/party/Mansion';

const hhmm = (d: Date | string) => new Date(d).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', hour12: false });

/** Matches: los Caramelos que te mandaron (piden respuesta), los matches nuevos (todavía sin
 * escribirse, en fila como en las apps de citas) y los chats con su último mensaje, la hora, los no
 * leídos y el «Visto». */
export function MatchesView({ people, ticketCode, viewerAlias, canPhoto, onPick, onOpenChat, onDiscover }: {
  people: MansionPerson[];
  ticketCode: string;
  viewerAlias: string;
  canPhoto: boolean;
  onPick: (p: MansionPerson) => void;
  onOpenChat: (connectionId: number, alias: string, otherId: number) => void;
  onDiscover: () => void;
}) {
  const now = new Date();
  const matches = trpc.party.myMatches.useQuery({ ticketCode }, { refetchInterval: 8_000 });
  const caramelos = people.filter((p) => p.pendingForMe);
  const list = matches.data ?? [];
  const fresh = list.filter((m) => !m.last);
  const chats = list.filter((m) => m.last);
  const waiting = people.filter((p) => p.connectionStatus === 'pending' && !p.pendingForMe).length;

  if (caramelos.length === 0 && list.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-8 pb-10 text-center">
        <span className="grid h-20 w-20 place-items-center rounded-full bg-gradient-to-br from-pink-500/25 to-sky-500/25"><Heart className="h-9 w-9 text-pink-300" /></span>
        <p className="mt-4 text-title3 font-bold">{matches.isLoading ? 'Cargando…' : 'Todavía no hay matches'}</p>
        {!matches.isLoading && <p className="mt-1 text-subhead text-white/65">{waiting > 0 ? `Le mandaste un Caramelo a ${waiting === 1 ? '1 persona' : `${waiting} personas`}. ` : ''}Desliza en Descubrir: cuando los dos se den ♥, aparece acá.</p>}
        <button type="button" onClick={() => { tap(); onDiscover(); }} className="lg-pill mt-5 h-12 rounded-full px-6 text-subhead font-semibold interactive">Ir a Descubrir</button>
      </div>
    );
  }

  return (
    <div className="space-y-6 px-4 pb-6">
      {caramelos.length > 0 && (
        <section>
          <h2 className="mb-3 flex items-center gap-1.5 text-headline font-bold"><Star className="h-4 w-4 fill-sky-300 text-sky-300" /> Te mandaron un Caramelo</h2>
          <div className="flex gap-3 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {caramelos.map((p) => (
              <button key={p.id} type="button" onClick={() => { tap(); onPick(p); }} className="relative h-36 w-[104px] shrink-0 overflow-hidden rounded-[20px] border-2 border-sky-300/80 shadow-[0_0_20px_-4px_rgba(56,189,248,0.7)]">
                <PersonPhoto ticketCode={ticketCode} viewerAlias={viewerAlias} canPhoto={canPhoto} person={p} className="absolute inset-0 h-full w-full" />
                <span className="absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/85 to-transparent px-2 pb-2 pt-6 text-left text-footnote font-bold">{p.alias}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {fresh.length > 0 && (
        <section>
          <h2 className="mb-3 text-headline font-bold">Nuevos matches <span className="font-medium text-white/60">{fresh.length}</span></h2>
          <div className="flex gap-3 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {fresh.map((m) => (
              <button key={m.connectionId} type="button" onClick={() => { tap(); onOpenChat(m.connectionId, m.other.alias, m.other.id); }} className="flex w-[76px] shrink-0 flex-col items-center gap-1.5">
                <span className="relative block rounded-full bg-gradient-to-br from-pink-500 via-fuchsia-500 to-sky-500 p-[2.5px]">
                  <PersonPhoto ticketCode={ticketCode} viewerAlias={viewerAlias} canPhoto={canPhoto && m.other.hasPhoto} person={m.other} className="h-[68px] w-[68px] rounded-full border-2 border-[#0b0612]" />
                </span>
                <span className="w-full truncate text-center text-caption1 font-semibold">{m.other.alias}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {chats.length > 0 && (
        <section>
          <h2 className="mb-3 text-headline font-bold">Mensajes</h2>
          <div className="account-glass divide-y divide-white/10 overflow-hidden rounded-[24px]">
            {chats.map((m) => {
              const online = isOnline(m.other.lastSeenAt, now);
              return (
                <button key={m.connectionId} type="button" onClick={() => { tap(); onOpenChat(m.connectionId, m.other.alias, m.other.id); }} className="flex w-full items-center gap-3 px-4 py-3 text-left interactive">
                  <span className="relative shrink-0">
                    <PersonPhoto ticketCode={ticketCode} viewerAlias={viewerAlias} canPhoto={canPhoto && m.other.hasPhoto} person={m.other} className="h-14 w-14 rounded-full" />
                    {online && <span className="absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full border-2 border-[#1a0f18] bg-emerald-400" aria-label="Activa ahora" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className={`truncate text-body ${m.unread > 0 ? 'font-bold' : 'font-semibold'}`}>{m.other.alias}</span>
                      <span className={`shrink-0 text-caption1 ${m.unread > 0 ? 'font-semibold text-pink-300' : 'text-white/60'}`}>{m.last && hhmm(m.last.createdAt)}</span>
                    </span>
                    <span className="flex items-center justify-between gap-2">
                      <span className={`truncate text-footnote ${m.unread > 0 ? 'font-semibold text-white' : 'text-white/60'}`}>
                        {m.last?.mine ? 'Tú: ' : ''}{m.last?.body}
                      </span>
                      {m.unread > 0
                        ? <span className="grid h-5 min-w-5 shrink-0 place-items-center rounded-full bg-pink-500 px-1.5 text-caption2 font-bold">{m.unread}</span>
                        : m.seen && <span className="shrink-0 text-caption2 font-semibold text-white/60">Visto</span>}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      )}
      {waiting > 0 && <p className="text-center text-footnote text-white/60">Esperando respuesta de {waiting === 1 ? '1 Caramelo' : `${waiting} Caramelos`} que mandaste.</p>}
    </div>
  );
}
