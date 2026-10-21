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
  // El ranking se actualiza solo cada minuto.
  const { data, isLoading } = trpc.contests.public.useQuery(undefined, { refetchInterval: 60_000 });

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

              {data.template === 'ranking' && data.phase !== 'drawn' && (data.ranking.doubleCount + data.ranking.vipCount) > 0 && (
                <div className="glass-candy rounded-2xl p-6 mb-8 space-y-4">
                  <h2 className="font-heading font-bold text-xl">🏆 Ranking en vivo</h2>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    🏆 El 1º de cada tabla gana su premio seguro al cierre. El resto se sortea: 1 punto = 1 chance, más puntos = más probabilidad.
                    ¿Eres de los que participan? Tu posición exacta y cómo subir te llegan por DM.
                  </p>
                  <div className="grid gap-6 sm:grid-cols-2">
                    {([['double', '🎟️ Entrada doble', data.ranking.double, data.ranking.doubleCount], ['vip', `⭐ ${data.prizes.vipLabel}`, data.ranking.vip, data.ranking.vipCount]] as const).map(([key, title, rows, count]) => (
                      <div key={key}>
                        <p className="font-semibold mb-2">{title} <span className="text-xs text-muted-foreground font-normal">· {count} participan</span></p>
                        {rows.length === 0 ? <p className="text-sm text-muted-foreground">Todavía no hay nadie.</p> : (
                          <ol className="space-y-1.5 text-sm">
                            {rows.map((r) => (
                              <li key={`${key}-${r.position}-${r.username}`} className="flex items-center gap-3">
                                <span className="w-7 text-center">{['🥇', '🥈', '🥉'][r.position - 1] ?? `${r.position}.`}</span>
                                <span className="flex-1 truncate font-medium">@{r.username ?? '—'}</span>
                                <span className="tabular-nums text-muted-foreground">{r.points} pts</span>
                              </li>
                            ))}
                          </ol>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

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
                    Comenta {data.keyword ? <b>{data.keyword}</b> : 'cualquier cosa'} en{' '}
                    {data.mediaPermalink ? <a className="underline text-primary" href={data.mediaPermalink} target="_blank" rel="noreferrer">nuestra publicación del concurso</a> : 'nuestra publicación del concurso'}
                    {data.keyword && <> (o escríbenos solo <b>{data.keyword}</b> por mensaje directo)</>}. Ya participas con {data.chances.base} punto{data.chances.base === 1 ? '' : 's'}.
                  </li>
                  {data.chances.perMention > 0 && <li>Suma +{data.chances.perMention} por cada amigo que etiquetes en tu comentario (hasta {data.chances.maxMentions}, sin repetir).</li>}
                  {data.chances.storyBonus > 0 && <li>Suma +{data.chances.storyBonus} si compartes la publicación en tu historia mencionándonos.</li>}
                  {data.chances.perInvitedPurchase > 0 && <li>Suma +{data.chances.perInvitedPurchase} por cada amigo que compre su entrada con tu link personal (te llega por DM).</li>}
                </ol>
              </div>

              <div className="glass-candy rounded-2xl p-6 mb-8 space-y-3 text-sm leading-relaxed">
                <h2 className="font-heading font-bold text-xl">Premios</h2>
                <p><b>Todos ganan algo:</b></p>
                <ul className="list-disc pl-5 space-y-1">
                  <li>
                    Si aún no tienes entrada: un código personal que te <b>congela el precio de la tanda del día en que participas</b> hasta el {fmt(data.prizes.priceLockUntil)}
                    {data.prizes.couponHours > 0 && <>, con {data.prizes.couponPercent}% de descuento extra si compras dentro de {data.prizes.couponHours} horas</>}.
                  </li>
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
                  <li>
                    {data.prizes.doubleWinners} {data.prizes.doubleLabel} entre quienes participan sin entrada
                    {data.template === 'ranking' && data.prizes.doubleWinners > 0 && <>: <b>el 1º del ranking gana una seguro</b>{data.prizes.doubleWinners > 1 ? ` y ${data.prizes.doubleWinners - 1 === 1 ? 'la otra se sortea' : `las otras ${data.prizes.doubleWinners - 1} se sortean`}` : ''}</>}.
                  </li>
                  {data.prizes.vipWinners > 0 && (
                    <li>
                      {data.prizes.vipWinners} × {data.prizes.vipLabel} entre quienes ya tenían su entrada antes del concurso: <b>el 1º del ranking gana uno seguro</b>{data.prizes.vipWinners > 1 ? ` y el resto se sortea` : ''}.
                    </li>
                  )}
                  {data.template === 'ranking' && <li>Si hay empate en el primer lugar, el premio seguro se sortea entre los empatados.</li>}
                </ul>
              </div>

              <div className="glass-candy rounded-2xl p-6 mb-8 space-y-2 text-sm leading-relaxed border border-primary/30">
                <h2 className="font-heading font-bold text-xl">🛡️ Compra sin riesgo</h2>
                <p>No esperes el sorteo para comprar: si compras tu entrada durante el concurso <b>sigues participando por la entrada doble, con tus puntos ×{data.chances.buyerMultiplier}</b>.</p>
                <p>Y si ganas, eliges: <b>te devolvemos lo que pagaste por tu entrada</b> (hasta el valor del premio) y la conservas, <b>o te llevas una entrada doble extra para regalar</b>. Tienes {data.prizes.choiceHours} horas para elegir; si no eliges, te hacemos la devolución.</p>
              </div>

              <div className="glass-candy rounded-2xl p-6 mb-8 space-y-2 text-sm text-muted-foreground leading-relaxed">
                <h2 className="font-heading font-bold text-xl text-foreground">Bases y condiciones</h2>
                <p>1. Organiza Mansion Playroom. Participan personas mayores de 18 años con una cuenta de Instagram pública y real.</p>
                <p>2. Período: {data.startsAt ? `desde ${fmt(data.startsAt)}` : 'desde su publicación'} hasta el sorteo, el {fmt(data.drawAt)}.</p>
                <p>3. {data.template === 'countdown' ? 'Cada meta de entradas vendidas durante el concurso desbloquea más ganadores. El premio se sortea de forma aleatoria entre quienes participan (quien compra durante el concurso tiene más boletos); si no se alcanza la primera meta, no hay sorteo. Se eligen también suplentes.' : data.template === 'flash' ? 'Es un reto relámpago: los primeros en acertar la respuesta (por mensaje directo o comentando) ganan, cada puesto con su premio. Hay intentos limitados por persona. Se eligen también suplentes.' : data.template === 'quiz' ? 'Se responden preguntas en nuestras historias o en el reel; cada respuesta correcta suma boletos y al cierre se sortea el premio entre quienes acertaron (más aciertos, más boletos). Se eligen también suplentes.' : data.template === 'milestones' ? 'No hay sorteo: cuando los comentarios del reel llegan a cada hito se desbloquea un descuento para todos los participantes, con un código de vigencia limitada.' : data.template !== 'ranking' ? 'Los premios se sortean de forma aleatoria entre todas las personas que participan (un comentario válido equivale a un boleto). Se eligen también suplentes.' : 'En cada tabla, el 1º del ranking al momento del sorteo gana uno de los premios (si hay empate en el primer lugar, se sortea entre los empatados). Los demás premios se sortean de forma aleatoria y ponderada entre el resto: cada punto equivale a un boleto (1 punto = 1 chance). Se eligen también suplentes.'}</p>
                <p>4. A los ganadores se les avisa por mensaje directo y respondiendo su comentario. Si no reclaman su premio dentro de {data.claimHours} horas, el premio pasa al siguiente suplente. Antes de entregar el premio verificamos que el ganador cumple los requisitos para asistir a Playroom (ser mayor de 18 años, no tener restricción de ingreso, aceptar nuestros valores y derecho de permanencia, y ser un perfil real que sigue la cuenta); si no los cumple, el premio pasa al siguiente suplente.</p>
                <p>5. Si compraste tu entrada durante el concurso y ganas la entrada doble, eliges entre la devolución de lo pagado por tus accesos (con tope en el valor del premio, al mismo medio de pago y conservando tu entrada) o una entrada doble adicional para regalar.</p>
                <p>6. Los premios son personales, no canjeables por dinero y válidos solo para {data.eventTitle}. Los códigos de descuento no son acumulables entre sí.</p>
                <p>7. Se descalificará a cuentas falsas, creadas para el concurso o que hagan trampa (por ejemplo, etiquetar cuentas inexistentes o repetidas).</p>
                <p>8. Esta promoción no está patrocinada, avalada, administrada ni asociada en modo alguno a Instagram ni a Meta. Al participar, liberas a Instagram de toda responsabilidad.</p>
                <p>9. Al participar aceptas estas bases y que publiquemos tu @ y tus puntos en el ranking, y tu @ si resultas ganador/a.</p>
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
