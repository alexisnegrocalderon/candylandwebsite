import { Camera, Crown, Loader2, Sparkles, Trophy } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import type { CostumeVoting } from '@/components/party/costumeVotes';
import { PM_CTA, PersonPhoto, tap } from '@/components/party/ui';
import { MAX_COSTUME_VOTES_PER_EVENT, ZONE_LABELS, type PartyGender, type PartyZone } from '@shared/party';

/* «Disfraces»: el concurso del mejor disfraz dentro de Playmatch. Todos los disfraces de la fiesta en una galería para
 * votar con un toque (hasta 3 votos, se pueden cambiar). El ranking no lo ve nadie mientras se vota: el administrador
 * revela el podio al cierre y ahí se acaba la votación. */

type Entry = { id: number; alias: string; costume: string; zone: PartyZone; gender: PartyGender; pairType: string | null; avatarId: number; photoCount: number };

const MEDAL: Record<number, { emoji: string; ring: string; label: string }> = {
  1: { emoji: '🥇', ring: 'border-amber-300 shadow-[0_0_34px_-6px_rgba(252,211,77,0.85)]', label: 'Mejor disfraz' },
  2: { emoji: '🥈', ring: 'border-slate-200/80', label: 'Segundo lugar' },
  3: { emoji: '🥉', ring: 'border-orange-300/80', label: 'Tercer lugar' },
};

export function CostumesView({ ticketCode, viewerAlias, canPhoto, voting, onOpenPhoto }: {
  ticketCode: string;
  viewerAlias: string;
  canPhoto: boolean;
  voting: CostumeVoting;
  onOpenPhoto: () => void;
}) {
  const gallery = trpc.party.costumeGallery.useQuery({ ticketCode }, { refetchInterval: 20_000 });
  const data = gallery.data;

  if (!data) {
    return <div className="grid flex-1 place-items-center"><Loader2 className="h-7 w-7 animate-spin text-white/60" /></div>;
  }
  if (!data.enabled) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-8 text-center">
        <Trophy className="mb-4 h-12 w-12 text-amber-300/70" />
        <h2 className="text-title2 font-bold">El concurso está en pausa</h2>
        <p className="mt-1.5 max-w-xs text-subhead text-white/65">Cuando el equipo lo active, vuelves acá a votar por el mejor disfraz.</p>
      </div>
    );
  }
  const open = !data.revealed;

  return (
    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-6 pt-1">
      <div className="mb-4">
        <h2 className="flex items-center gap-2 text-title1 font-bold tracking-tight"><Trophy className="h-6 w-6 text-amber-300" /> Mejor disfraz</h2>
        <p className="mt-1 text-subhead text-white/70">
          {open
            ? `Vota por tus favoritos: hasta ${MAX_COSTUME_VOTES_PER_EVENT}, y puedes cambiarlos. El podio se revela al cierre.`
            : 'La votación cerró. Estos son los ganadores de la noche.'}
        </p>
        {open && (
          <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-amber-300/15 px-3 py-1.5 text-footnote font-semibold text-amber-200">
            <Trophy className="h-3.5 w-3.5" /> Te quedan {voting.votesLeft} {voting.votesLeft === 1 ? 'voto' : 'votos'}
          </p>
        )}
      </div>

      {data.revealed && data.podium.length > 0 && (
        <section className="mb-6 space-y-3" aria-label="Podio">
          {data.podium.map((p) => {
            const m = MEDAL[p.place] ?? MEDAL[3];
            return (
              <div key={`${p.place}-${p.entry?.id ?? 'x'}`} className={`relative flex items-center gap-3 overflow-hidden rounded-[24px] border-2 bg-white/[0.06] p-2.5 ${m.ring}`}>
                <span className="text-4xl" aria-hidden>{m.emoji}</span>
                {p.entry && <PersonPhoto ticketCode={ticketCode} viewerAlias={viewerAlias} canPhoto={canPhoto} person={p.entry} className="h-20 w-16 shrink-0 overflow-hidden rounded-2xl" quiet />}
                <div className="min-w-0 flex-1">
                  <p className="text-caption1 font-bold uppercase tracking-wider text-amber-200">{m.label}</p>
                  <p className="truncate text-headline font-bold">{p.entry?.costume || 'Disfraz'}</p>
                  <p className="truncate text-footnote text-white/65">{p.mine ? 'Eres tú 🎉' : p.entry?.alias} · {p.votes} {p.votes === 1 ? 'voto' : 'votos'}</p>
                </div>
                {p.place === 1 && <Crown className="absolute right-3 top-3 h-5 w-5 text-amber-300" />}
              </div>
            );
          })}
        </section>
      )}

      {open && !canPhoto && (
        <button type="button" onClick={() => { tap(); onOpenPhoto(); }} className={`mb-4 flex h-12 w-full items-center justify-center gap-2 rounded-full text-subhead ${PM_CTA} interactive`}>
          <Camera className="h-5 w-5" /> Pon tu foto para poder votar
        </button>
      )}

      {data.people.length === 0 ? (
        <div className="rounded-3xl bg-white/[0.06] p-6 text-center">
          <Sparkles className="mx-auto mb-2 h-8 w-8 text-amber-300" />
          <p className="text-headline font-bold">Todavía no hay disfraces</p>
          <p className="mt-1 text-subhead text-white/65">Cuenta el tuyo en «Mi perfil» y aparece acá para que lo voten.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {(data.people as Entry[]).map((p) => {
            const voted = voting.votedIds.has(p.id);
            return (
              <div key={p.id} className={`relative aspect-[4/5] overflow-hidden rounded-[22px] border bg-[#1a0f18] ${voted ? 'border-amber-300 shadow-[0_0_26px_-6px_rgba(252,211,77,0.7)]' : 'border-white/15'}`}>
                <PersonPhoto ticketCode={ticketCode} viewerAlias={viewerAlias} canPhoto={canPhoto} person={p} className="absolute inset-0 h-full w-full" quiet />
                <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent px-3 pb-3 pt-14">
                  <p className="flex items-center gap-1 truncate text-subhead font-bold text-amber-200"><Sparkles className="h-3.5 w-3.5 shrink-0" /> {p.costume}</p>
                  <p className="truncate text-caption1 text-white/70">{p.alias} · {ZONE_LABELS[p.zone]}</p>
                </div>
                {open && canPhoto && (
                  <button type="button" onClick={() => { tap(); voting.toggle(p.id, p.alias); }} aria-pressed={voted} aria-label={voted ? `Quitar mi voto a ${p.alias}` : `Votar por el disfraz de ${p.alias}`}
                    className={`absolute right-2.5 top-2.5 grid h-11 w-11 place-items-center rounded-full interactive ${voted ? 'bg-amber-300 text-[#1a1a1a]' : 'lg-pill text-amber-300'}`}>
                    <Trophy className={`h-5 w-5 ${voted ? 'fill-current' : ''}`} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
