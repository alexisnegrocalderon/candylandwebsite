import { PartyPopper } from 'lucide-react';
import { trpc } from '@/lib/trpc';

/* Recién compró: si hay un concurso de Instagram en vivo, se le invita a
 * comentar el post para entrar al sorteo con sus chances multiplicadas (y la
 * promesa de devolución o regalo si gana). Ver server/contests.ts. */
export function ContestBuyerInvite({ eventSlug }: { eventSlug?: string }) {
  const { data } = trpc.contests.public.useQuery(undefined, { staleTime: 60_000 });
  if (!data || data.phase !== 'live' || !data.mediaPermalink) return null;
  if (eventSlug && data.eventSlug !== eventSlug) return null;
  return (
    <div className="glass-candy rounded-2xl p-5 mb-6 text-left space-y-3">
      <p className="text-sm font-bold inline-flex items-center gap-2"><PartyPopper className="w-4 h-4 text-primary" /> Estás a un comentario de ganar</p>
      <p className="text-xs text-muted-foreground leading-relaxed">
        Comenta nuestro post del concurso y etiqueta a tus amigos: como ya compraste, participas con <b className="text-foreground">x{data.chances.buyerMultiplier} chances</b>.
        Si ganas, eliges: te devolvemos tu entrada o te llevas una entrada doble para regalar.
      </p>
      <a
        href={data.mediaPermalink}
        target="_blank"
        rel="noopener noreferrer"
        className="w-full inline-flex items-center justify-center gap-2 h-12 rounded-full bg-primary text-primary-foreground text-sm font-bold uppercase tracking-wide interactive"
      >
        Ir al post del concurso
      </a>
    </div>
  );
}
