import { Camera, Check, MapPin, Star, Users } from 'lucide-react';
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
                        {/* Un Super Like esperando respuesta es lo único que pide acción: se marca fuerte. */}
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

/** La Fiesta sin zonas: todos los que están adentro en una sola grilla, los activos primero. Arriba, lo que pide
 * respuesta (un Super Like que te mandaron). */
export function Crowd({ people, loading, onPick, ticketCode, viewerAlias, canPhoto, onOpenPhoto }: {
  people: MansionPerson[];
  loading: boolean;
  onPick: (person: MansionPerson) => void;
  ticketCode: string;
  viewerAlias: string;
  canPhoto: boolean;
  onOpenPhoto: () => void;
}) {
  const now = new Date();
  const rank = (p: MansionPerson) => (p.pendingForMe ? 0 : isOnline(p.lastSeenAt, now) ? 1 : 2);
  const sorted = [...people].sort((a, b) => rank(a) - rank(b));
  const online = people.filter((p) => isOnline(p.lastSeenAt, now)).length;

  return (
    <div className="space-y-3">
      <div className="flex items-end justify-between gap-3 px-1 pt-1">
        <div>
          <h2 className="text-title2 font-bold tracking-tight">En la fiesta</h2>
          <p className="flex items-center gap-1.5 text-footnote text-white/65">
            <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.9)]" aria-hidden />
            {online === 1 ? '1 persona activa ahora' : `${online} personas activas ahora`} · {people.length} adentro
          </p>
        </div>
      </div>
      {!canPhoto && (
        <button type="button" onClick={() => { tap(); onOpenPhoto(); }} className="account-glass flex w-full items-center gap-3 rounded-[22px] px-4 py-3 text-left interactive">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-pink-500/20"><Camera className="h-5 w-5 text-pink-300" /></span>
          <span className="min-w-0 flex-1"><span className="block text-subhead font-bold">Pon tu foto para ver las de los demás</span><span className="block text-footnote text-white/65">Mientras tanto ves sus fichas.</span></span>
        </button>
      )}
      {sorted.length === 0 ? (
        <div className="flex flex-col items-center px-6 py-16 text-center">
          <span className="grid h-20 w-20 place-items-center rounded-full bg-gradient-to-br from-pink-500/25 to-sky-500/25"><Users className="h-9 w-9 text-pink-300" /></span>
          <p className="mt-4 text-title3 font-bold">{loading ? 'Buscando gente…' : 'Eres de los primeros'}</p>
          {!loading && <p className="mt-1 text-subhead text-white/65">A medida que entren a Playmatch van a aparecer acá.</p>}
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-2.5">
          {sorted.map((p) => {
            const active = isOnline(p.lastSeenAt, now);
            return (
              <button key={p.id} type="button" onClick={() => { tap(); onPick(p); }} aria-label={`Ver a ${p.alias}`}
                className={`relative aspect-[3/4] overflow-hidden rounded-[20px] border bg-white/[0.04] ${p.pendingForMe ? 'border-2 border-sky-300 shadow-[0_0_20px_-4px_var(--pm-star-glow,rgba(56,189,248,0.7))]' : 'border-white/10'}`}>
                <PersonPhoto ticketCode={ticketCode} viewerAlias={viewerAlias} canPhoto={canPhoto} person={p} className={`absolute inset-0 h-full w-full ${active ? '' : 'opacity-55 grayscale'}`} />
                <span className="absolute inset-x-0 bottom-0 flex items-center gap-1 bg-gradient-to-t from-black/90 to-transparent px-2 pb-1.5 pt-7 text-left">
                  {active && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400" aria-label="Activa ahora" />}
                  <span className="truncate text-caption1 font-bold">{p.alias}</span>
                </span>
                {p.pendingForMe && <span className="absolute right-1.5 top-1.5 grid h-6 w-6 place-items-center rounded-full bg-sky-400"><Star className="h-3.5 w-3.5 fill-[#0b0612] text-[#0b0612]" /></span>}
                {p.connectionStatus === 'accepted' && <span className="absolute left-1.5 top-1.5 rounded-full bg-pink-500 px-1.5 py-0.5 text-[0.625rem] font-bold text-[color:var(--pm-on-accent,#fff)]">Match</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
