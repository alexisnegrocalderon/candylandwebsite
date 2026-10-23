import { ChevronRight, Heart, MapPin, Star } from 'lucide-react';
import { isOnline, ZONE_LABELS } from '@shared/party';
import { PersonPhoto, tap } from '@/components/party/ui';
import type { MansionPerson } from '@/components/party/Mansion';

/** Matches: los Caramelos que te mandaron (piden respuesta), tus matches (abren el chat) y a
 * cuántos les mandaste uno. Sale de la misma lista de la mansión, sin otra consulta. */
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
  const caramelos = people.filter((p) => p.pendingForMe);
  const matches = people.filter((p) => p.connectionStatus === 'accepted' && p.connectionId);
  const waiting = people.filter((p) => p.connectionStatus === 'pending' && !p.pendingForMe).length;

  if (caramelos.length === 0 && matches.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-8 pb-10 text-center">
        <span className="grid h-20 w-20 place-items-center rounded-full bg-gradient-to-br from-pink-500/25 to-sky-500/25"><Heart className="h-9 w-9 text-pink-300" /></span>
        <p className="mt-4 text-title3 font-bold">Todavía no hay matches</p>
        <p className="mt-1 text-subhead text-white/65">{waiting > 0 ? `Le mandaste un Caramelo a ${waiting === 1 ? '1 persona' : `${waiting} personas`}. ` : ''}Desliza en Descubrir: cuando los dos se den ♥, aparece acá.</p>
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

      {matches.length > 0 && (
        <section>
          <h2 className="mb-3 text-headline font-bold">Tus matches <span className="font-medium text-white/60">{matches.length}</span></h2>
          <div className="account-glass divide-y divide-white/10 overflow-hidden rounded-[24px]">
            {matches.map((p) => {
              const online = isOnline(p.lastSeenAt, now);
              return (
                <button key={p.id} type="button" onClick={() => { tap(); onOpenChat(p.connectionId!, p.alias, p.id); }} className="flex w-full items-center gap-3 px-4 py-3 text-left interactive">
                  <span className="relative shrink-0">
                    <PersonPhoto ticketCode={ticketCode} viewerAlias={viewerAlias} canPhoto={canPhoto} person={p} className="h-14 w-14 rounded-full" />
                    {online && <span className="absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full border-2 border-[#1a0f18] bg-emerald-400" aria-label="Activa ahora" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-body font-semibold">{p.alias}</span>
                    <span className="flex items-center gap-1 truncate text-footnote text-white/60"><MapPin className="h-3 w-3 shrink-0" /> En {ZONE_LABELS[p.zone]} · Toca para escribirle</span>
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-white/45" />
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
