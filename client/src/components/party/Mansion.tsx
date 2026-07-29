import { PARTY_ZONES, ZONE_LABELS, isOnline, placeInZone, type PartyGender, type PartyZone } from '@shared/party';
import { PartyAvatar } from './Avatar';

export type MansionPerson = {
  id: number;
  alias: string;
  gender: PartyGender;
  avatarId: number;
  zone: PartyZone;
  lastSeenAt: string | Date;
  connectionId: number | null;
  connectionStatus: string | null;
  pendingForMe: boolean;
};

const ZONE_STYLE: Record<PartyZone, { emoji: string; ring: string; glow: string }> = {
  living: { emoji: '🛋️', ring: 'border-primary/25', glow: 'from-primary/12' },
  playground: { emoji: '🎠', ring: 'border-violet-electric/25', glow: 'from-violet-electric/12' },
  piscina: { emoji: '💦', ring: 'border-candy-blue/25', glow: 'from-candy-blue/12' },
  barra: { emoji: '🍹', ring: 'border-cherry/25', glow: 'from-cherry/12' },
};

/** La mansión: cuatro zonas, y en cada una los avatares de quienes están
 * ahí. Las posiciones son determinísticas (placeInZone) para que nadie
 * salte de lugar cada vez que la vista se refresca. */
export function Mansion({ people, myZone, onPick, onChangeZone }: {
  people: MansionPerson[];
  myZone: PartyZone;
  onPick: (person: MansionPerson) => void;
  onChangeZone: (zone: PartyZone) => void;
}) {
  const now = new Date();

  return (
    <div className="space-y-4">
      {PARTY_ZONES.map((zone) => {
        const here = people.filter((p) => p.zone === zone);
        const style = ZONE_STYLE[zone];
        const isMine = myZone === zone;

        return (
          <section
            key={zone}
            className={`relative rounded-3xl border ${style.ring} bg-gradient-to-b ${style.glow} to-transparent overflow-hidden`}
          >
            <header className="flex items-center justify-between px-4 pt-3.5 pb-1">
              <h2 className="text-sm font-bold tracking-tight flex items-center gap-2">
                <span aria-hidden>{style.emoji}</span>
                {ZONE_LABELS[zone]}
                <span className="text-white/40 font-normal">{here.length}</span>
              </h2>
              {isMine ? (
                <span className="text-[11px] px-2.5 py-1 rounded-full bg-primary/20 text-primary font-semibold">Estás acá</span>
              ) : (
                <button
                  onClick={() => onChangeZone(zone)}
                  className="text-[11px] px-2.5 py-1 rounded-full border border-white/15 text-white/60 hover:text-white hover:border-white/35 transition-colors"
                >
                  Moverme
                </button>
              )}
            </header>

            {/* Alto fijo para que la zona no colapse cuando está vacía ni
                crezca sin control cuando se llena. */}
            <div className="relative h-40">
              {here.length === 0 && (
                <p className="absolute inset-0 grid place-items-center text-xs text-white/30">
                  No hay nadie acá todavía
                </p>
              )}

              {here.map((p) => {
                const { xPct, yPct } = placeInZone(p.id);
                const online = isOnline(p.lastSeenAt, now);
                return (
                  <button
                    key={p.id}
                    onClick={() => onPick(p)}
                    style={{ left: `${xPct}%`, top: `${yPct}%` }}
                    className="absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-1 group"
                    aria-label={`Ver a ${p.alias}`}
                  >
                    <span className="relative block">
                      <PartyAvatar
                        gender={p.gender}
                        avatarId={p.avatarId}
                        className={`w-13 h-13 rounded-full transition-transform group-active:scale-90 ${
                          online ? 'ring-2 ring-emerald-400/70' : 'opacity-45 grayscale'
                        }`}
                      />
                      {/* Un toque esperando respuesta es lo único que pide
                          acción: se marca fuerte y con animación. */}
                      {p.pendingForMe && (
                        <span className="absolute -top-1 -right-1 w-5 h-5 grid place-items-center rounded-full bg-primary text-[11px] animate-bounce shadow-lg">
                          👋
                        </span>
                      )}
                      {p.connectionStatus === 'accepted' && (
                        <span className="absolute -bottom-0.5 -right-0.5 w-4 h-4 grid place-items-center rounded-full bg-emerald-500 text-[9px]">
                          💬
                        </span>
                      )}
                    </span>
                    <span className="max-w-16 truncate text-[11px] font-semibold text-white/85 drop-shadow">
                      {p.alias}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
