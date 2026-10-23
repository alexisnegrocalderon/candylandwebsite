import { Check, MapPin, Star } from 'lucide-react';
import { PARTY_ZONES, ZONE_LABELS, isOnline, type PartyGender, type PartyZone } from '@shared/party';
import { PersonPhoto, tap } from '@/components/party/ui';

export type MansionPerson = {
  id: number;
  alias: string;
  gender: PartyGender;
  avatarId: number;
  zone: PartyZone;
  costume?: string | null;
  lastSeenAt: string | Date;
  connectionId: number | null;
  connectionStatus: string | null;
  pendingForMe: boolean;
};

/* Color de cada zona: un acento por sala, sobre el mismo vidrio de la App. */
const ZONE_TONE: Record<PartyZone, { dot: string; glow: string }> = {
  living: { dot: 'bg-pink-400', glow: 'from-pink-500/20' },
  playground: { dot: 'bg-violet-400', glow: 'from-violet-500/20' },
  piscina: { dot: 'bg-sky-400', glow: 'from-sky-500/20' },
  barra: { dot: 'bg-amber-300', glow: 'from-amber-400/15' },
};

/** La Fiesta: quién está en cada sala de la mansión, como un radar. Las fotos se ven si los dos
 * participan del swipe; si no, el avatar. Los que están activos llevan el anillo verde. */
export function Mansion({ people, myZone, onPick, onChangeZone, ticketCode, viewerAlias, canPhoto }: {
  people: MansionPerson[];
  myZone: PartyZone;
  onPick: (person: MansionPerson) => void;
  onChangeZone: (zone: PartyZone) => void;
  ticketCode: string;
  viewerAlias: string;
  canPhoto: boolean;
}) {
  const now = new Date();
  // Mi sala primero: es donde está la gente que puedo ir a conocer ahora mismo.
  const zones = [myZone, ...PARTY_ZONES.filter((z) => z !== myZone)];

  return (
    <div className="space-y-3">
      {zones.map((zone) => {
        const here = people.filter((p) => p.zone === zone)
          .sort((a, b) => Number(isOnline(b.lastSeenAt, now)) - Number(isOnline(a.lastSeenAt, now)));
        const tone = ZONE_TONE[zone];
        const isMine = myZone === zone;
        return (
          <section key={zone} className={`account-glass overflow-hidden rounded-[26px] bg-gradient-to-b ${tone.glow} to-transparent`}>
            <header className="flex items-center justify-between gap-3 px-4 pb-2 pt-3.5">
              <h2 className="flex min-w-0 items-center gap-2 text-headline font-bold">
                <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${tone.dot}`} aria-hidden />
                {ZONE_LABELS[zone]}
                <span className="text-subhead font-medium text-white/60">{here.length}</span>
              </h2>
              {isMine ? (
                <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-400/15 px-3 py-1.5 text-caption1 font-semibold text-emerald-300"><Check className="h-3.5 w-3.5" /> Estás acá</span>
              ) : (
                <button type="button" onClick={() => { tap(); onChangeZone(zone); }} className="lg-pill inline-flex shrink-0 items-center gap-1 rounded-full px-3 py-1.5 text-caption1 font-semibold interactive">
                  <MapPin className="h-3.5 w-3.5" /> Moverme acá
                </button>
              )}
            </header>
            {here.length === 0 ? (
              <p className="px-4 pb-4 text-footnote text-white/60">No hay nadie acá todavía.</p>
            ) : (
              <div className="flex gap-3 overflow-x-auto px-4 pb-4 pt-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {here.map((p) => {
                  const online = isOnline(p.lastSeenAt, now);
                  return (
                    <button key={p.id} type="button" onClick={() => { tap(); onPick(p); }} aria-label={`Ver a ${p.alias}`} className="flex w-[68px] shrink-0 flex-col items-center gap-1.5">
                      <span className="relative block">
                        <PersonPhoto ticketCode={ticketCode} viewerAlias={viewerAlias} canPhoto={canPhoto} person={p}
                          className={`h-16 w-16 rounded-full ${online ? 'ring-[2.5px] ring-emerald-400 ring-offset-2 ring-offset-[#120a11]' : 'opacity-50 grayscale'}`} />
                        {/* Un Caramelo esperando respuesta es lo único que pide acción: se marca fuerte. */}
                        {p.pendingForMe && (
                          <span className="absolute -right-1 -top-1 grid h-6 w-6 place-items-center rounded-full bg-sky-400 shadow-[0_0_12px_rgba(56,189,248,0.9)]"><Star className="h-3.5 w-3.5 fill-[#0b0612] text-[#0b0612]" /></span>
                        )}
                        {p.connectionStatus === 'accepted' && (
                          <span className="absolute -bottom-0.5 -right-0.5 h-4 w-4 rounded-full border-2 border-[#120a11] bg-pink-500" aria-label="Match" />
                        )}
                      </span>
                      <span className="w-full truncate text-center text-caption1 font-semibold">{p.alias}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
