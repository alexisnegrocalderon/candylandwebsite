import { trpc } from '@/lib/trpc';

/* En la página de su entrada: quien ya tiene entrada también participa del
 * concurso de Instagram, pero tiene que comentar el reel. Ver server/contests.ts. */
export function ContestHolderInvite({ eventTitle }: { eventTitle?: string | null }) {
  const { data } = trpc.contests.public.useQuery(undefined, { staleTime: 60_000 });
  if (!data || data.phase !== 'live' || !data.mediaPermalink || data.template !== 'ranking') return null;
  if (eventTitle && data.eventTitle !== eventTitle) return null;
  const perks = [
    data.prizes.vipWinners > 0 ? `sorteo de ${data.prizes.vipLabel}` : null,
    data.prizes.playcoins > 0 ? `${data.prizes.playcoins.toLocaleString('es-CL')} PlayCoins` : null,
    data.prizes.giftName ?? null,
    data.prizes.friendPercent > 0 ? `${data.prizes.friendPercent}% para un amigo` : null,
  ].filter(Boolean).join(' · ');
  return (
    <div className="wcard-section" style={{ margin: '16px 0', padding: 16, borderRadius: 16, background: 'rgba(255,255,255,0.06)', textAlign: 'left' }}>
      <p style={{ fontWeight: 700, fontSize: 14, margin: '0 0 6px' }}>🎁 Tu entrada también participa</p>
      <p style={{ fontSize: 12, lineHeight: 1.5, opacity: 0.8, margin: '0 0 12px' }}>
        Comenta el reel del concurso y etiqueta a tus amigos para entrar{perks ? `: ${perks}` : ''}. Sin comentario no participas.
      </p>
      <a href={data.mediaPermalink} target="_blank" rel="noopener noreferrer" className="wcard-btn wcard-btn-primary">Ir al reel del concurso</a>
    </div>
  );
}
