import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { useRoute, useLocation, Link } from 'wouter';
import { Check, Copy, KeyRound, Crown, Calculator, PartyPopper } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { useSeo } from '@/hooks/useSeo';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { formatChileShortDate } from '@shared/chileDate';
import { estimateAdditionalCommission, type CommissionTier } from '@shared/ambassadorProgram';

/* Panel del embajador VIP: /embajador/<CODIGO>.
 *
 * Sin login, igual que /mis-referidos y /mis-puntos: el código hace de llave.
 * Es el mismo criterio ya usado en el sitio -- los embajadores no tienen
 * cuenta y agregarles una sería más friction que seguridad. El servidor
 * enmascara los correos de los clientes justamente porque esta vista es
 * alcanzable con solo el código.
 *
 * `noindex`: muestra plata, no puede quedar en Google. */
export default function Ambassador() {
  const [, params] = useRoute('/embajador/:code');
  const [, setLocation] = useLocation();
  const codeFromUrl = (params?.code ?? '').toUpperCase();

  useSeo({
    title: 'Panel de Embajador — Mansion Playroom',
    description: 'Tus ventas, tu comisión y tus beneficios como embajador.',
    path: codeFromUrl ? `/embajador/${codeFromUrl}` : '/embajador',
    noindex: true,
  });

  const [codeInput, setCodeInput] = useState('');
  const [copied, setCopied] = useState(false);

  const { data, isLoading, isFetched } = trpc.ambassadors.getPanelByCode.useQuery(
    { code: codeFromUrl },
    { enabled: !!codeFromUrl, retry: false },
  );

  // Sin código en la URL: formulario para entrar.
  if (!codeFromUrl) {
    return (
      <div className="min-h-screen pt-28 pb-16">
        <div className="container max-w-lg text-center">
          <div className="w-16 h-16 mx-auto mb-5 border border-primary/30 rounded-2xl flex items-center justify-center bg-primary/5">
            <Crown className="w-8 h-8 text-primary" />
          </div>
          <h1 className="font-heading text-3xl mb-3">Panel de Embajador</h1>
          <p className="text-muted-foreground mb-6">
            Escribe tu código de embajador para ver tus ventas, tu comisión y tus beneficios.
          </p>
          <form
            onSubmit={(e) => { e.preventDefault(); if (codeInput.trim()) setLocation(`/embajador/${codeInput.trim().toUpperCase()}`); }}
            className="flex gap-2 max-w-sm mx-auto"
          >
            <Input
              value={codeInput}
              onChange={(e) => setCodeInput(e.target.value)}
              placeholder="TU-CODIGO"
              className="h-12 text-center font-mono uppercase"
            />
            <Button type="submit" size="lg" className="interactive glow-pink shrink-0" disabled={!codeInput.trim()}>
              <KeyRound className="w-4 h-4" />
            </Button>
          </form>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen grid place-items-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (isFetched && !data) {
    return (
      <div className="min-h-screen pt-28 pb-16">
        <div className="container max-w-lg text-center">
          <p className="text-5xl mb-4" aria-hidden>🔍</p>
          <h1 className="font-heading text-2xl mb-3">No encontramos ese código</h1>
          <p className="text-muted-foreground mb-6">
            Revisa que esté bien escrito. Si crees que es un error, escríbenos por Instagram.
          </p>
          <Link href="/embajador" className="inline-flex h-12 items-center px-8 rounded-full border border-border text-sm font-semibold">
            Probar otro código
          </Link>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const stats = data.stats;
  const progreso = stats?.nextTarget
    ? Math.min(100, Math.round((stats.monthlySales / stats.nextTarget.target) * 100))
    : 100;

  const handleCopy = () => {
    navigator.clipboard.writeText(data.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen pt-28 pb-16">
      <div className="container max-w-3xl">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>

          {/* Identidad + código */}
          <div className="text-center mb-8">
            <p className="text-sm uppercase tracking-[0.3em] text-primary mb-2">Panel de Embajador</p>
            <h1 className="font-heading text-4xl md:text-5xl tracking-tight mb-1">{data.name}</h1>
            {!data.active && (
              <p className="text-sm text-amber-400 mt-2">Tu código está desactivado ahora mismo. Escríbenos para reactivarlo.</p>
            )}
            <button
              onClick={handleCopy}
              className="mt-5 inline-flex items-center gap-2 px-5 h-12 rounded-full bg-primary/10 border border-primary/30 font-mono font-bold text-primary text-lg interactive"
            >
              {data.code}
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            </button>
            <p className="text-xs text-muted-foreground mt-2">
              {copied ? '¡Copiado!' : 'Toca para copiar y compartir tu código'}
            </p>
          </div>

          {/* Comisión exacta de este evento -- plata ya generada, no una
              estimación. A diferencia de "comisión del mes" (mes calendario)
              o "acumulada histórica" (todos los eventos), esto responde
              justo lo que más le importa antes de una fiesta cuyas ventas se
              repartieron en varios meses: cuánto va a recibir cuando termine. */}
          {data.eventStats && (
            <div className="bg-gradient-to-br from-primary/15 to-secondary/10 border border-primary/30 rounded-2xl p-6 mb-6 text-center">
              <div className="flex items-center justify-center gap-2 mb-1">
                <PartyPopper className="w-5 h-5 text-primary" />
                <p className="text-sm uppercase tracking-[0.2em] text-primary font-semibold">{data.eventStats.eventTitle}</p>
              </div>
              {data.eventStats.sales > 0 ? (
                <>
                  <p className="font-heading text-4xl md:text-5xl mt-2">${data.eventStats.commission.toLocaleString('es-CL')}</p>
                  <p className="text-muted-foreground text-sm mt-2">
                    Es lo que vas a recibir cuando termine el evento, por {data.eventStats.sales} venta{data.eventStats.sales === 1 ? '' : 's'}. Plata real, ya generada.
                  </p>
                </>
              ) : (
                <p className="text-muted-foreground text-sm mt-2">
                  Todavía no tienes ventas para este evento. Comparte tu código y este monto se va a ir sumando solo.
                </p>
              )}
            </div>
          )}

          {/* Números del mes */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
            <StatBox value={String(stats?.monthlySales ?? 0)} label="Ventas del mes" />
            <StatBox value={`${stats?.currentPercent ?? 0}%`} label="Tu comisión actual" highlight />
            <StatBox value={`$${(stats?.monthlyCommission ?? 0).toLocaleString('es-CL')}`} label="Comisión del mes" />
            <StatBox value={`$${(stats?.totalCommission ?? 0).toLocaleString('es-CL')}`} label="Acumulada histórica" />
          </div>

          {/* Progreso al siguiente nivel -- no aplica si tiene un % fijo
              acordado: ese % no depende de la escala, así que "subir de
              nivel" no le cambiaría nada. */}
          {data.overridePercent !== null ? (
            <div className="bg-card border border-border/50 rounded-2xl p-6 mb-6">
              <h2 className="font-heading text-xl mb-1">Tu comisión es fija</h2>
              <p className="text-muted-foreground text-sm">
                Tienes un <strong className="text-primary">{data.overridePercent}%</strong> acordado en cada venta,
                sin importar cuántas hagas en el mes. No depende de ningún nivel.
              </p>
            </div>
          ) : (
            <>
              <div className="bg-card border border-border/50 rounded-2xl p-6 mb-6">
                {stats?.nextTarget ? (
                  <>
                    <div className="flex items-baseline justify-between mb-2">
                      <h2 className="font-heading text-xl">Próximo objetivo</h2>
                      <p className="font-heading text-2xl">{stats.monthlySales} / {stats.nextTarget.target}</p>
                    </div>
                    <div className="w-full h-3 bg-muted rounded-full overflow-hidden mb-3">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${progreso}%` }}
                        transition={{ duration: 0.8, ease: 'easeOut' }}
                        className="h-full bg-gradient-to-r from-primary to-secondary rounded-full"
                      />
                    </div>
                    <p className="text-muted-foreground text-sm">
                      Te faltan <strong className="text-foreground">{stats.nextTarget.salesNeeded} venta{stats.nextTarget.salesNeeded === 1 ? '' : 's'}</strong> para
                      subir al <strong className="text-primary">{stats.nextTarget.nextPercent}%</strong>.
                    </p>
                  </>
                ) : (
                  <>
                    <h2 className="font-heading text-xl mb-1">Nivel máximo 🏆</h2>
                    <p className="text-muted-foreground text-sm">Estás en el tramo más alto de la escala. No se puede subir más.</p>
                  </>
                )}
                <p className="text-xs text-muted-foreground mt-4 pt-4 border-t border-border/40">
                  El nivel se cuenta por mes y solo con ventas a tus propios clientes. Las ventas a clientes que ya estaban
                  en la base pagan {data.existingClientPercent}% y no suben el nivel.
                </p>
              </div>

              {/* Escala completa: hoy solo se veía el tramo actual y el
                  próximo -- acá está toda la tabla para que sepan qué les
                  espera más adelante. */}
              <div className="bg-card border border-border/50 rounded-2xl p-6 mb-6">
                <h2 className="font-heading text-xl mb-4">Así sube tu comisión</h2>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-muted-foreground">
                        <th className="text-left py-2 pr-3 font-medium">Ventas del mes</th>
                        <th className="text-left py-2 font-medium">Comisión</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.commissionScale.map((tier: CommissionTier) => {
                        const esTuTramo = (stats?.monthlySales ?? 0) >= tier.minSales
                          && (tier.maxSales === null || (stats?.monthlySales ?? 0) <= tier.maxSales);
                        return (
                          <tr key={tier.minSales} className={`border-b border-border/40 ${esTuTramo ? 'bg-primary/10' : ''}`}>
                            <td className="py-2 pr-3">
                              {tier.minSales}{tier.maxSales === null ? '+' : `–${tier.maxSales}`} ventas
                              {esTuTramo && <span className="ml-2 text-xs text-primary font-semibold">← estás acá</span>}
                            </td>
                            <td className="py-2 font-semibold">{tier.percent}%</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

          {/* Calculadora: cada entrada vendida cuenta como una venta, sin
              importar cuántas personas cubra -- así paga el sistema hoy. */}
          <CommissionCalculator
            monthlySales={stats?.monthlySales ?? 0}
            avgSalePrice={data.avgSalePrice}
            commissionScale={data.commissionScale}
            overridePercent={data.overridePercent}
          />

          {/* Beneficios */}
          <div className="bg-card border border-border/50 rounded-2xl p-6 mb-6">
            <h2 className="font-heading text-xl mb-3">Tus beneficios de este mes</h2>
            {stats && (stats.benefits.items.length > 0 || stats.benefits.bonusClp > 0) ? (
              <>
                <div className="flex flex-wrap gap-2">
                  {stats.benefits.items.map((b: string, i: number) => (
                    <span key={i} className="px-3 py-1.5 rounded-xl bg-primary/10 border border-primary/30 text-sm">{b}</span>
                  ))}
                  {stats.benefits.bonusClp > 0 && (
                    <span className="px-3 py-1.5 rounded-xl bg-green-500/15 border border-green-500/30 text-sm font-semibold text-green-400">
                      Bono ${stats.benefits.bonusClp.toLocaleString('es-CL')}
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-3">Escríbenos por Instagram para coordinar cómo los recibes.</p>
              </>
            ) : (
              <p className="text-muted-foreground text-sm">
                Con tu primera venta del mes se activan: entrada liberada y un acompañante.
              </p>
            )}
            {stats?.nextBenefit && (
              <p className="text-sm text-muted-foreground mt-3 pt-3 border-t border-border/40">
                A las <strong className="text-foreground">{stats.nextBenefit.minSales} ventas</strong> desbloqueas:{' '}
                {stats.nextBenefit.items.join(', ') || `bono de $${stats.nextBenefit.bonusClp.toLocaleString('es-CL')}`}.
              </p>
            )}
          </div>

          {/* Clientes */}
          <div className="grid grid-cols-2 gap-3 mb-6">
            <StatBox value={String(stats?.exclusiveClientsCount ?? 0)} label="Tus clientes exclusivos" />
            <StatBox value={String(stats?.existingClientsCount ?? 0)} label="Clientes de la casa" />
          </div>

          {/* Historial */}
          <div className="bg-card border border-border/50 rounded-2xl p-6">
            <h2 className="font-heading text-xl mb-4">Tu historial de ventas</h2>
            {data.sales.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                Todavía no tienes ventas registradas. Comparte tu código y aparecerán acá automáticamente.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-2 pr-3">Fecha</th>
                      <th className="text-left py-2 pr-3">Evento</th>
                      <th className="text-left py-2 pr-3">Cliente</th>
                      <th className="text-left py-2 pr-3">Tipo</th>
                      <th className="text-left py-2 pr-3">%</th>
                      <th className="text-left py-2">Comisión</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.sales.map((s: any) => (
                      <tr key={s.id} className="border-b border-border/40">
                        <td className="py-2 pr-3">{formatChileShortDate(s.createdAt)}</td>
                        <td className="py-2 pr-3">{s.eventTitle}</td>
                        <td className="py-2 pr-3 text-muted-foreground text-xs">{s.customerName || s.customerEmail}</td>
                        <td className="py-2 pr-3">
                          <span className={`px-2 py-0.5 rounded-full text-xs ${s.clientType === 'exclusivo' ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground'}`}>
                            {s.clientType === 'exclusivo' ? 'Tuyo' : 'De la casa'}
                          </span>
                        </td>
                        <td className="py-2 pr-3">{s.commissionPercent}%</td>
                        <td className="py-2 font-semibold text-primary">${s.commissionAmount.toLocaleString('es-CL')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <p className="text-xs text-muted-foreground text-center mt-8">
            Los números se actualizan solos cada vez que se aprueba una compra con tu código.
          </p>
        </motion.div>
      </div>
    </div>
  );
}

function StatBox({ value, label, highlight }: { value: string; label: string; highlight?: boolean }) {
  return (
    <div className={`rounded-2xl p-4 border text-center ${highlight ? 'bg-primary/10 border-primary/30' : 'bg-card border-border/50'}`}>
      <p className={`font-heading text-2xl leading-none ${highlight ? 'text-primary' : ''}`}>{value}</p>
      <p className="text-muted-foreground text-xs mt-1.5">{label}</p>
    </div>
  );
}

const AVG_SALE_PRICE_SOURCE_LABEL: Record<string, string> = {
  propio: 'tu propio promedio de venta',
  programa: 'el promedio general del programa (todavía no tienes ventas propias)',
  referencia: 'un precio de referencia (el programa recién está arrancando)',
};

/** "Si vendo N entradas más este mes, cuánto me llevo" -- corre entero en el
 * navegador con `estimateAdditionalCommission` (misma función pura que usa
 * el servidor para calcular cada comisión real), sin pegarle al backend en
 * cada tecla. Es una estimación en el sentido de que el embajador todavía no
 * hizo esas ventas, pero el cálculo en sí es exacto: suma venta por venta
 * con la escala real, no aplica el % final a todas de un tirón. */
function CommissionCalculator({ monthlySales, avgSalePrice, commissionScale, overridePercent }: {
  monthlySales: number;
  avgSalePrice: { amount: number; source: 'propio' | 'programa' | 'referencia' };
  commissionScale: CommissionTier[];
  overridePercent: number | null;
}) {
  const [cantidad, setCantidad] = useState('5');
  const additionalSales = Math.max(0, Math.min(200, Math.floor(Number(cantidad) || 0)));

  const estimate = useMemo(
    () => estimateAdditionalCommission({
      currentMonthlySales: monthlySales,
      additionalSales,
      avgSalePrice: avgSalePrice.amount,
      scale: commissionScale,
      overridePercent,
    }),
    [monthlySales, additionalSales, avgSalePrice.amount, commissionScale, overridePercent],
  );

  const primerPorcentaje = estimate.breakdown[0]?.percent;
  const ultimoPorcentaje = estimate.breakdown[estimate.breakdown.length - 1]?.percent;
  const cruzaDeTramo = primerPorcentaje !== undefined && ultimoPorcentaje !== undefined && primerPorcentaje !== ultimoPorcentaje;

  return (
    <div className="bg-card border border-border/50 rounded-2xl p-6 mb-6">
      <div className="flex items-center gap-2 mb-4">
        <Calculator className="w-5 h-5 text-primary" />
        <h2 className="font-heading text-xl">Calculadora de comisión</h2>
      </div>

      <Label htmlFor="calc-entradas" className="text-sm text-muted-foreground">
        ¿Cuántas entradas más crees que vas a vender este mes?
      </Label>
      <div className="flex gap-3 mt-2 mb-3">
        <Input
          id="calc-entradas"
          type="number"
          min={0}
          max={200}
          value={cantidad}
          onChange={(e) => setCantidad(e.target.value)}
          className="w-28 text-center font-heading text-lg"
        />
        <div className="flex-1 flex items-center">
          <input
            type="range"
            min={0}
            max={40}
            value={Math.min(additionalSales, 40)}
            onChange={(e) => setCantidad(e.target.value)}
            className="w-full accent-primary"
          />
        </div>
      </div>

      <p className="text-xs text-muted-foreground mb-4">
        Cada entrada que vendes cuenta como una venta, sin importar cuántas personas cubra. Calculado con{' '}
        {AVG_SALE_PRICE_SOURCE_LABEL[avgSalePrice.source]}: ${avgSalePrice.amount.toLocaleString('es-CL')} por venta.
      </p>

      <div className="bg-primary/10 border border-primary/30 rounded-xl p-4 text-center">
        <p className="font-heading text-3xl text-primary">${estimate.total.toLocaleString('es-CL')}</p>
        <p className="text-muted-foreground text-xs mt-1">
          {additionalSales === 0
            ? 'Comisión adicional aproximada'
            : cruzaDeTramo
              ? `Comisión adicional aproximada -- empieza al ${primerPorcentaje}% y sube al ${ultimoPorcentaje}% en el camino`
              : `Comisión adicional aproximada, al ${primerPorcentaje}%`}
        </p>
      </div>

      <p className="text-xs text-muted-foreground text-center mt-3">
        Es un aproximado con tu precio promedio de venta -- el monto exacto depende del precio real de cada entrada que vendas.
      </p>
    </div>
  );
}
