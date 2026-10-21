import { motion } from 'framer-motion';
import { useParams, Link } from 'wouter';
import { Loader2, CheckCircle2, Circle, MessageCircle, ExternalLink } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { useSeo } from '@/hooks/useSeo';

/* «Mi posición» en el ranking del concurso: la ve cada participante con el
 * link que le llega por DM (server/contestRanking.ts → getPersonalPosition).
 * Muestra dónde va, cuánto le falta para pasar al de arriba y qué puede hacer
 * para sumar puntos. */

function fmt(iso: string | Date | null | undefined): string {
  if (!iso) return 'por confirmar';
  return new Date(iso).toLocaleString('es-CL', { timeZone: 'America/Santiago', dateStyle: 'full', timeStyle: 'short' });
}

export default function ConcursoPosicion() {
  useSeo({ title: 'Mi posición — Mansion Playroom', description: 'Tu posición en el ranking del concurso.', path: '/concurso/mi-posicion', noindex: true });
  const { code = '' } = useParams<{ code: string }>();
  const { data, isLoading } = trpc.contests.position.useQuery({ code }, { enabled: !!code, refetchInterval: 60_000 });

  const box = (children: React.ReactNode) => (
    <div className="min-h-dvh pt-24 pb-16">
      <div className="container max-w-xl">{children}</div>
    </div>
  );

  if (isLoading) return box(<Loader2 className="w-8 h-8 animate-spin mx-auto text-muted-foreground" />);
  if (!data) return box(<p className="text-center text-muted-foreground">Este link no es válido. Comenta en nuestro post del concurso para participar.</p>);
  if (data.milestone) {
    const m = data.milestone;
    return box(
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} className="space-y-5 text-center">
        <p className="text-sm uppercase tracking-[0.25em] text-primary mb-2">Reto por hitos</p>
        <h1 className="font-heading font-extrabold text-3xl">{data.username ? `@${data.username}` : 'Tu descuento'}</h1>
        <div className="glass-candy rounded-2xl p-6 space-y-2">
          <p className="text-sm text-muted-foreground">Llevamos <b className="text-foreground">{m.count}</b> comentarios</p>
          {m.live && m.code ? (
            <>
              <p className="font-heading font-extrabold text-5xl">{m.percent}%</p>
              <p className="text-sm">Tu código: <b className="font-mono">{m.code}</b></p>
              <p className="text-xs text-muted-foreground">Válido hasta {fmt(m.validUntil)}</p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Todavía no hay un descuento vigente. Entre más comentarios, más descuento: {m.steps.map((s) => `${s.comments} → ${s.percent}%`).join(' · ')}.</p>
          )}
        </div>
        {data.links.reel && <a href={data.links.reel} target="_blank" rel="noopener noreferrer" className="w-full inline-flex items-center justify-center h-12 rounded-full bg-primary text-primary-foreground font-bold text-sm uppercase tracking-wide interactive">Ir al reel y ayudar a llegar al siguiente hito</a>}
      </motion.div>,
    );
  }
  if (data.disqualified || !data.view) {
    return box(<p className="text-center text-muted-foreground">No encontramos tu posición en el ranking. Escríbenos por Instagram si crees que es un error.</p>);
  }
  const v = data.view;
  const inviteText = `🎉 Yo ya participo por una entrada para ${data.eventTitle} en Mansion Playroom. Compra con mi link y me ayudas a subir: ${data.links.invite}`;

  return box(
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} className="space-y-5">
      <div className="text-center">
        <p className="text-sm uppercase tracking-[0.25em] text-primary mb-2">Mi posición</p>
        <h1 className="font-heading font-extrabold text-3xl">{data.username ? `@${data.username}` : 'Tu posición'}</h1>
      </div>

      <div className="glass-candy rounded-2xl p-6 text-center space-y-1">
        <p className="text-sm text-muted-foreground">En {v.poolLabel}</p>
        <p className="font-heading font-extrabold text-6xl">{['🥇', '🥈', '🥉'][v.position - 1] ?? ''} {v.position}º</p>
        <p className="text-muted-foreground text-sm">de {v.ofTotal} participantes · <b className="text-foreground">{v.points} puntos</b></p>
        {v.probability > 0 && <p className="text-xs text-muted-foreground pt-1">≈ {v.probability < 1 ? '<1' : Math.round(v.probability)}% de probabilidad de ganar (aprox.)</p>}
        {v.isLeader && <p className="text-sm pt-2 font-semibold">🏆 {v.tiedLeaders > 1 ? `Vas empatado en el 1º con ${v.tiedLeaders - 1} más: el premio seguro se sortea entre los empatados. ¡Saca ventaja!` : 'Vas 1º: si sigues así, ganas tu premio seguro.'}</p>}
        {v.gapToNext !== null && (
          <p className="text-sm pt-2">
            Te faltan <b>{v.gapToNext}</b> punto{v.gapToNext === 1 ? '' : 's'} para pasar{v.nextUsername ? <> a <b>@{v.nextUsername}</b></> : ' al de arriba'} 🚀
          </p>
        )}
        {v.gapToTop10 !== null && <p className="text-xs text-muted-foreground">{v.gapToTop10} puntos más y entras al top 10.</p>}
      </div>

      {!data.drawn && (
        <div className="glass-candy rounded-2xl p-6 space-y-3">
          <h2 className="font-heading font-bold text-lg">Cómo sumar más puntos</h2>
          <ul className="space-y-2.5 text-sm">
            {v.tips.map((t) => (
              <li key={t.key} className="flex items-start gap-2.5">
                {t.done ? <CheckCircle2 className="w-4 h-4 mt-0.5 text-primary shrink-0" /> : <Circle className="w-4 h-4 mt-0.5 text-muted-foreground shrink-0" />}
                <span className={t.done ? 'text-muted-foreground line-through' : ''}>{t.text}</span>
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground">Sorteo: {fmt(data.drawAt)}. El 1º de cada tabla gana su premio seguro; el resto se sortea (1 punto = 1 chance).</p>
        </div>
      )}

      <div className="space-y-2.5">
        {data.links.buy && !data.drawn && (
          <a href={data.links.buy} className="w-full inline-flex items-center justify-center h-12 rounded-full bg-primary text-primary-foreground font-bold text-sm uppercase tracking-wide interactive">
            Comprar mi entrada a mi precio
          </a>
        )}
        <a
          href={`https://wa.me/?text=${encodeURIComponent(inviteText)}`}
          target="_blank" rel="noopener noreferrer"
          className="w-full inline-flex items-center justify-center gap-2 h-12 rounded-full border border-primary text-primary font-bold text-sm uppercase tracking-wide interactive"
        >
          <MessageCircle className="w-4 h-4" /> Invitar amigos (+{data.pointsPerAction.perInvitedPurchase} por cada compra)
        </a>
        {data.links.reel && (
          <a href={data.links.reel} target="_blank" rel="noopener noreferrer" className="w-full inline-flex items-center justify-center gap-2 h-11 rounded-full border border-border text-sm font-semibold interactive">
            <ExternalLink className="w-4 h-4" /> Ir al reel del concurso
          </a>
        )}
        <Link href="/concurso" className="block text-center text-sm underline text-muted-foreground">Ver el ranking completo y las bases</Link>
      </div>
    </motion.div>,
  );
}
