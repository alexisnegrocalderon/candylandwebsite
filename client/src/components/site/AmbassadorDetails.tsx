import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Calculator, PartyPopper } from 'lucide-react';
import type { inferRouterOutputs } from '@trpc/server';
import type { AppRouter } from '../../../../server/routers';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { formatChileShortDate } from '@shared/chileDate';
import { estimateAdditionalCommission, type CommissionTier } from '@shared/ambassadorProgram';

/* Ventas, comisión, escala, calculadora, beneficios e historial de un
 * embajador. Lo usan el panel por código (/embajador/<CODIGO>) y la pestaña
 * «Embajador» de «Mi cuenta» (dentro de la app, sin salir a la página). */

export type AmbassadorPanelData = NonNullable<inferRouterOutputs<AppRouter>['ambassadors']['getPanelByCode']>;

export function AmbassadorDetails({ data }: { data: AmbassadorPanelData }) {
  const stats = data.stats;
  const progreso = stats?.nextTarget
    ? Math.min(100, Math.round((stats.eventSales / stats.nextTarget.target) * 100))
    : 100;
  return (
    <>
          {/* Comisión exacta de este evento -- plata ya generada, no una
              estimación. A diferencia de "comisión del evento"
              o "acumulada histórica" (todos los eventos), esto responde
              justo lo que más le importa antes de una fiesta cuyas ventas se
              repartieron en varios meses: cuánto va a recibir cuando termine. */}
          {data.eventStats && (
            <div className="bg-gradient-to-br from-primary/15 to-secondary/10 border border-primary/30 rounded-2xl p-6 mb-6 text-center">
              <div className="flex items-center justify-center gap-2 mb-1">
                <PartyPopper className="w-5 h-5 text-primary" />
                <p className="text-subhead uppercase tracking-[0.2em] text-primary font-semibold">{data.eventStats.eventTitle}</p>
              </div>
              {data.eventStats.sales > 0 ? (
                <>
                  <p className="font-heading text-4xl md:text-5xl mt-2">${data.eventStats.commission.toLocaleString('es-CL')}</p>
                  <p className="text-muted-foreground text-subhead mt-2">
                    Es lo que vas a recibir cuando termine el evento, por {data.eventStats.sales} venta{data.eventStats.sales === 1 ? '' : 's'}. Plata real, ya generada.
                  </p>
                </>
              ) : (
                <p className="text-muted-foreground text-subhead mt-2">
                  Todavía no tienes ventas para este evento. Comparte tu código y este monto se va a ir sumando solo.
                </p>
              )}
            </div>
          )}

          {/* Números del evento: cada evento es su propia campaña y el nivel parte de cero */}
          {stats && <p className="text-subhead text-muted-foreground mb-2">Tus números en <strong className="text-foreground">{stats.eventTitle}</strong></p>}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
            <StatBox value={String(stats?.eventSales ?? 0)} label="Ventas del evento" />
            <StatBox value={`${stats?.currentPercent ?? 0}%`} label="Tu comisión actual" highlight />
            <StatBox value={`$${(stats?.eventCommission ?? 0).toLocaleString('es-CL')}`} label="Comisión del evento" />
            <StatBox value={`$${(stats?.totalCommission ?? 0).toLocaleString('es-CL')}`} label="Acumulada histórica" />
          </div>

          {/* Progreso al siguiente nivel -- no aplica si tiene un % fijo
              acordado: ese % no depende de la escala, así que "subir de
              nivel" no le cambiaría nada. */}
          {data.overridePercent !== null ? (
            <div className="bg-card border border-border/50 rounded-2xl p-6 mb-6">
              <h2 className="font-heading text-title3 mb-1">Tu comisión es fija</h2>
              <p className="text-muted-foreground text-subhead">
                Tienes un <strong className="text-primary">{data.overridePercent}%</strong> acordado en cada venta,
                sin importar cuántas hagas en cada evento. No depende de ningún nivel.
              </p>
            </div>
          ) : (
            <>
              <div className="bg-card border border-border/50 rounded-2xl p-6 mb-6">
                {stats?.nextTarget ? (
                  <>
                    <div className="flex items-baseline justify-between mb-2">
                      <h2 className="font-heading text-title3">Próximo objetivo</h2>
                      <p className="font-heading text-title2">{stats.eventSales} / {stats.nextTarget.target}</p>
                    </div>
                    <div className="w-full h-3 bg-muted rounded-full overflow-hidden mb-3">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${progreso}%` }}
                        transition={{ duration: 0.8, ease: 'easeOut' }}
                        className="h-full bg-gradient-to-r from-primary to-secondary rounded-full"
                      />
                    </div>
                    <p className="text-muted-foreground text-subhead">
                      Te faltan <strong className="text-foreground">{stats.nextTarget.salesNeeded} venta{stats.nextTarget.salesNeeded === 1 ? '' : 's'}</strong> para
                      subir al <strong className="text-primary">{stats.nextTarget.nextPercent}%</strong>.
                    </p>
                  </>
                ) : (
                  <>
                    <h2 className="font-heading text-title3 mb-1">Nivel máximo 🏆</h2>
                    <p className="text-muted-foreground text-subhead">Estás en el tramo más alto de la escala. No se puede subir más.</p>
                  </>
                )}
                <p className="text-caption1 text-muted-foreground mt-4 pt-4 border-t border-border/40">
                  El nivel se cuenta por evento (cada evento parte de cero) y solo con ventas a tus propios clientes. Las ventas a clientes que ya estaban
                  en la base pagan {data.existingClientPercent}% y no suben el nivel.
                </p>
              </div>

              {/* Escala completa: hoy solo se veía el tramo actual y el
                  próximo -- acá está toda la tabla para que sepan qué les
                  espera más adelante. */}
              <div className="bg-card border border-border/50 rounded-2xl p-6 mb-6">
                <h2 className="font-heading text-title3 mb-4">Así sube tu comisión</h2>
                <div className="overflow-x-auto">
                  <table className="w-full text-subhead">
                    <thead>
                      <tr className="border-b border-border text-muted-foreground">
                        <th className="text-left py-2 pr-3 font-medium">Ventas del evento</th>
                        <th className="text-left py-2 font-medium">Comisión</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.commissionScale.map((tier: CommissionTier) => {
                        const esTuTramo = (stats?.eventSales ?? 0) >= tier.minSales
                          && (tier.maxSales === null || (stats?.eventSales ?? 0) <= tier.maxSales);
                        return (
                          <tr key={tier.minSales} className={`border-b border-border/40 ${esTuTramo ? 'bg-primary/10' : ''}`}>
                            <td className="py-2 pr-3">
                              {tier.minSales}{tier.maxSales === null ? '+' : `–${tier.maxSales}`} ventas
                              {esTuTramo && <span className="ml-2 text-caption1 text-primary font-semibold">← estás acá</span>}
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
            eventSales={stats?.eventSales ?? 0}
            avgSalePrice={data.avgSalePrice}
            commissionScale={data.commissionScale}
            overridePercent={data.overridePercent}
          />

          {/* Historial por evento: cada campaña por separado */}
          {data.eventsHistory && data.eventsHistory.length > 0 && (
            <div className="bg-card border border-border/50 rounded-2xl p-6 mb-6">
              <h2 className="font-heading text-title3 mb-3">Tus ventas, evento por evento</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-subhead">
                  <thead>
                    <tr className="border-b border-border text-muted-foreground">
                      <th className="text-left py-2 pr-3 font-medium">Evento</th>
                      <th className="text-left py-2 pr-3 font-medium">Ventas</th>
                      <th className="text-left py-2 font-medium">Comisión</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.eventsHistory.map((e: { eventId: number; eventTitle: string; sales: number; commission: number }) => (
                      <tr key={e.eventId} className="border-b border-border/40">
                        <td className="py-2 pr-3">{e.eventTitle}</td>
                        <td className="py-2 pr-3">{e.sales}</td>
                        <td className="py-2 font-semibold">${e.commission.toLocaleString('es-CL')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Beneficios */}
          <div className="bg-card border border-border/50 rounded-2xl p-6 mb-6">
            <h2 className="font-heading text-title3 mb-3">Tus beneficios en este evento</h2>
            {stats && (stats.benefits.items.length > 0 || stats.benefits.bonusClp > 0) ? (
              <>
                <div className="flex flex-wrap gap-2">
                  {stats.benefits.items.map((b: string, i: number) => (
                    <span key={i} className="px-3 py-1.5 rounded-xl bg-primary/10 border border-primary/30 text-subhead">{b}</span>
                  ))}
                  {stats.benefits.bonusClp > 0 && (
                    <span className="px-3 py-1.5 rounded-xl bg-green-500/15 border border-green-500/30 text-subhead font-semibold text-green-400">
                      Bono ${stats.benefits.bonusClp.toLocaleString('es-CL')}
                    </span>
                  )}
                </div>
                <p className="text-caption1 text-muted-foreground mt-3">Escríbenos por Instagram para coordinar cómo los recibes.</p>
              </>
            ) : (
              <p className="text-muted-foreground text-subhead">
                Con tu primera venta de este evento se activan: entrada liberada y un acompañante.
              </p>
            )}
            {stats?.nextBenefit && (
              <p className="text-subhead text-muted-foreground mt-3 pt-3 border-t border-border/40">
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
            <h2 className="font-heading text-title3 mb-4">Tu historial de ventas</h2>
            {data.sales.length === 0 ? (
              <p className="text-muted-foreground text-subhead">
                Todavía no tienes ventas registradas. Comparte tu código y aparecerán acá automáticamente.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-subhead">
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
                        <td className="py-2 pr-3 text-muted-foreground text-caption1">{s.customerName || s.customerEmail}</td>
                        <td className="py-2 pr-3">
                          <span className={`px-2 py-0.5 rounded-full text-caption1 ${s.clientType === 'exclusivo' ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground'}`}>
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

          <p className="text-caption1 text-muted-foreground text-center mt-8">
            Los números se actualizan solos cada vez que se aprueba una compra con tu código.
          </p>
    </>
  );
}

function StatBox({ value, label, highlight }: { value: string; label: string; highlight?: boolean }) {
  return (
    <div className={`rounded-2xl p-4 border text-center ${highlight ? 'bg-primary/10 border-primary/30' : 'bg-card border-border/50'}`}>
      <p className={`font-heading text-title2 leading-none ${highlight ? 'text-primary' : ''}`}>{value}</p>
      <p className="text-muted-foreground text-caption1 mt-1.5">{label}</p>
    </div>
  );
}

const AVG_SALE_PRICE_SOURCE_LABEL: Record<string, string> = {
  propio: 'tu propio promedio de venta',
  programa: 'el promedio general del programa (todavía no tienes ventas propias)',
  referencia: 'un precio de referencia (el programa recién está arrancando)',
};

/** "Si vendo N entradas más en este evento, cuánto me llevo" -- corre entero en el
 * navegador con `estimateAdditionalCommission` (misma función pura que usa
 * el servidor para calcular cada comisión real), sin pegarle al backend en
 * cada tecla. Es una estimación en el sentido de que el embajador todavía no
 * hizo esas ventas, pero el cálculo en sí es exacto: suma venta por venta
 * con la escala real, no aplica el % final a todas de un tirón. */
function CommissionCalculator({ eventSales, avgSalePrice, commissionScale, overridePercent }: {
  eventSales: number;
  avgSalePrice: { amount: number; source: 'propio' | 'programa' | 'referencia' };
  commissionScale: CommissionTier[];
  overridePercent: number | null;
}) {
  const [cantidad, setCantidad] = useState('5');
  const additionalSales = Math.max(0, Math.min(200, Math.floor(Number(cantidad) || 0)));

  const estimate = useMemo(
    () => estimateAdditionalCommission({
      currentEventSales: eventSales,
      additionalSales,
      avgSalePrice: avgSalePrice.amount,
      scale: commissionScale,
      overridePercent,
    }),
    [eventSales, additionalSales, avgSalePrice.amount, commissionScale, overridePercent],
  );

  const primerPorcentaje = estimate.breakdown[0]?.percent;
  const ultimoPorcentaje = estimate.breakdown[estimate.breakdown.length - 1]?.percent;
  const cruzaDeTramo = primerPorcentaje !== undefined && ultimoPorcentaje !== undefined && primerPorcentaje !== ultimoPorcentaje;

  return (
    <div className="bg-card border border-border/50 rounded-2xl p-6 mb-6">
      <div className="flex items-center gap-2 mb-4">
        <Calculator className="w-5 h-5 text-primary" />
        <h2 className="font-heading text-title3">Calculadora de comisión</h2>
      </div>

      <Label htmlFor="calc-entradas" className="text-subhead text-muted-foreground">
        ¿Cuántas entradas más crees que vas a vender en este evento?
      </Label>
      <div className="flex gap-3 mt-2 mb-3">
        <Input
          id="calc-entradas"
          type="number"
          min={0}
          max={200}
          value={cantidad}
          onChange={(e) => setCantidad(e.target.value)}
          className="w-28 text-center font-heading text-title3"
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

      <p className="text-caption1 text-muted-foreground mb-4">
        Cada entrada que vendes cuenta como una venta, sin importar cuántas personas cubra. Calculado con{' '}
        {AVG_SALE_PRICE_SOURCE_LABEL[avgSalePrice.source]}: ${avgSalePrice.amount.toLocaleString('es-CL')} por venta.
      </p>

      <div className="bg-primary/10 border border-primary/30 rounded-xl p-4 text-center">
        <p className="font-heading text-title1 text-primary">${estimate.total.toLocaleString('es-CL')}</p>
        <p className="text-muted-foreground text-caption1 mt-1">
          {additionalSales === 0
            ? 'Comisión adicional aproximada'
            : cruzaDeTramo
              ? `Comisión adicional aproximada -- empieza al ${primerPorcentaje}% y sube al ${ultimoPorcentaje}% en el camino`
              : `Comisión adicional aproximada, al ${primerPorcentaje}%`}
        </p>
      </div>

      <p className="text-caption1 text-muted-foreground text-center mt-3">
        Es un aproximado con tu precio promedio de venta -- el monto exacto depende del precio real de cada entrada que vendas.
      </p>
    </div>
  );
}
