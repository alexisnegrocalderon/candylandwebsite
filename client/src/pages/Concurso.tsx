import { motion } from 'framer-motion';
import { PartyPopper } from 'lucide-react';
import { Link } from 'wouter';
import { trpc } from '@/lib/trpc';
import { useSeo } from '@/hooks/useSeo';

/* Bases del concurso de Instagram activo (server/contests.ts →
 * getPublicContest). Se arman solas con la configuración del panel, así que
 * cualquier cambio de premios o fechas queda reflejado acá sin tocar nada. */

function fmt(iso: string | Date | null | undefined): string {
  if (!iso) return 'por confirmar';
  return new Date(iso).toLocaleString('es-CL', { timeZone: 'America/Santiago', dateStyle: 'full', timeStyle: 'short' });
}

export default function Concurso() {
  useSeo({
    title: 'Concurso — Mansion Playroom',
    description: 'Bases y condiciones del concurso de Instagram de Mansion Playroom.',
    path: '/concurso',
  });
  const { data, isLoading } = trpc.contests.public.useQuery();

  return (
    <div className="min-h-dvh pt-24 pb-16">
      <div className="container max-w-3xl">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
          <div className="flex items-center gap-3 mb-2">
            <PartyPopper className="w-6 h-6 text-primary" />
            <p className="text-sm uppercase tracking-[0.25em] text-primary">Mansion Playroom</p>
          </div>
          {isLoading ? (
            <p className="text-muted-foreground">Cargando…</p>
          ) : !data ? (
            <>
              <h1 className="font-heading font-extrabold text-3xl md:text-4xl tracking-tight mb-4">No hay concursos activos</h1>
              <p className="text-muted-foreground">Síguenos en Instagram para enterarte del próximo.</p>
            </>
          ) : (
            <>
              <h1 className="font-heading font-extrabold text-3xl md:text-4xl tracking-tight mb-3">
                Gana {data.prizes.doubleWinners === 1 ? `1 de nuestras ${data.prizes.doubleLabel}` : `1 de ${data.prizes.doubleWinners} ${data.prizes.doubleLabel}`} para {data.eventTitle}
              </h1>
              <p className="text-muted-foreground mb-8">
                {data.participants > 0 && <><b className="text-foreground">{data.participants}</b> personas ya participan. </>}
                Sorteo: {fmt(data.drawAt)}.
              </p>

              {data.winners.length > 0 && (
                <div className="glass-candy rounded-2xl p-6 mb-8">
                  <h2 className="font-heading font-bold text-xl mb-3">🎉 Ganadores</h2>
                  {data.winners.map((w, i) => (
                    <p key={i}>@{w.username} — {w.pool === 'double' ? 'entrada doble' : data.prizes.vipLabel}</p>
                  ))}
                </div>
              )}

              <div className="glass-candy rounded-2xl p-6 mb-8 space-y-3">
                <h2 className="font-heading font-bold text-xl">¿Cómo participo?</h2>
                <ol className="list-decimal pl-5 space-y-2 text-sm leading-relaxed">
                  <li>
                    Comenta en{' '}
                    {data.mediaPermalink ? <a className="underline text-primary" href={data.mediaPermalink} target="_blank" rel="noreferrer">nuestra publicación del concurso</a> : 'nuestra publicación del concurso'}
                    {data.keyword && <> o escríbenos <b>{data.keyword}</b> por mensaje directo</>}. Ya participas con {data.chances.base} chance{data.chances.base === 1 ? '' : 's'}.
                  </li>
                  {data.chances.perMention > 0 && <li>Suma +{data.chances.perMention} por cada amigo que etiquetes en los comentarios (hasta {data.chances.maxMentions}, sin repetir).</li>}
                  {data.chances.storyBonus > 0 && <li>Suma +{data.chances.storyBonus} si compartes la publicación en tu historia mencionándonos.</li>}
                  {data.chances.perInvitedPurchase > 0 && <li>Suma +{data.chances.perInvitedPurchase} por cada amigo que compre su entrada con tu link personal (te llega por DM).</li>}
                </ol>
              </div>

              <div className="glass-candy rounded-2xl p-6 mb-8 space-y-3 text-sm leading-relaxed">
                <h2 className="font-heading font-bold text-xl">Premios</h2>
                <p><b>Todos ganan algo:</b></p>
                <ul className="list-disc pl-5 space-y-1">
                  <li>Si aún no tienes entrada: {data.prizes.couponPercent}% de descuento personal en tu entrada, válido por {data.prizes.couponHours} horas desde que participas.</li>
                  <li>
                    Si ya tienes entrada: {[
                      data.prizes.giftName ? `1 ${data.prizes.giftName} gratis` : null,
                      data.prizes.playcoins > 0 ? `${data.prizes.playcoins.toLocaleString('es-CL')} PlayCoins` : null,
                      data.prizes.friendPercent > 0 ? `un código de ${data.prizes.friendPercent}% para un amigo` : null,
                    ].filter(Boolean).join(', ') || 'regalos de asistente'}.
                  </li>
                </ul>
                <p><b>Sorteos:</b></p>
                <ul className="list-disc pl-5 space-y-1">
                  <li>{data.prizes.doubleWinners} {data.prizes.doubleLabel} entre quienes participan sin entrada.</li>
                  {data.prizes.vipWinners > 0 && <li>{data.prizes.vipWinners} × {data.prizes.vipLabel} entre quienes ya tienen su entrada. Si compras durante el concurso, pasas a este sorteo con tus chances multiplicadas por {data.chances.buyerMultiplier}.</li>}
                </ul>
              </div>

              <div className="glass-candy rounded-2xl p-6 mb-8 space-y-2 text-sm text-muted-foreground leading-relaxed">
                <h2 className="font-heading font-bold text-xl text-foreground">Bases y condiciones</h2>
                <p>1. Organiza Mansion Playroom. Participan personas mayores de 18 años con una cuenta de Instagram pública y real.</p>
                <p>2. Período: {data.startsAt ? `desde ${fmt(data.startsAt)}` : 'desde su publicación'} hasta el sorteo, el {fmt(data.drawAt)}.</p>
                <p>3. El sorteo es aleatorio y ponderado: cada chance equivale a un boleto. Se eligen ganadores y suplentes.</p>
                <p>4. A los ganadores se les avisa por mensaje directo y respondiendo su comentario. Si no reclaman su premio dentro de {data.claimHours} horas, el premio pasa al siguiente suplente.</p>
                <p>5. Los premios son personales, no canjeables por dinero y válidos solo para {data.eventTitle}. Los códigos de descuento no son acumulables entre sí.</p>
                <p>6. Se descalificará a cuentas falsas, creadas para el concurso o que hagan trampa (por ejemplo, etiquetar cuentas inexistentes o repetidas).</p>
                <p>7. Esta promoción no está patrocinada, avalada, administrada ni asociada en modo alguno a Instagram ni a Meta. Al participar, liberas a Instagram de toda responsabilidad.</p>
                <p>8. Al participar aceptas estas bases y que publiquemos tu @ si resultas ganador/a.</p>
              </div>

              <Link href={`/checkout/${data.eventSlug}`} className="inline-flex rounded-full bg-primary px-6 py-3 font-semibold text-primary-foreground">
                Comprar mi entrada
              </Link>
            </>
          )}
        </motion.div>
      </div>
    </div>
  );
}
