import { useState } from 'react';
import { motion } from 'framer-motion';
import { useRoute, useLocation, Link } from 'wouter';
import { Check, Copy, KeyRound, Crown } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { useSeo } from '@/hooks/useSeo';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

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

          {/* Números del mes */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
            <StatBox value={String(stats?.monthlySales ?? 0)} label="Ventas del mes" />
            <StatBox value={`${stats?.currentPercent ?? 0}%`} label="Tu comisión actual" highlight />
            <StatBox value={`$${(stats?.monthlyCommission ?? 0).toLocaleString('es-CL')}`} label="Comisión del mes" />
            <StatBox value={`$${(stats?.totalCommission ?? 0).toLocaleString('es-CL')}`} label="Acumulada histórica" />
          </div>

          {/* Progreso al siguiente nivel */}
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
              en la base pagan 10% y no suben el nivel.
            </p>
          </div>

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
                        <td className="py-2 pr-3">{new Date(s.createdAt).toLocaleDateString('es-CL')}</td>
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
