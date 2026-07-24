import { trpc } from '@/lib/trpc';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Users, Gift, Copy, Check, Trophy, Share2, Ticket, KeyRound, Flame, Crown } from 'lucide-react';
import { useState } from 'react';
import { CANDYLAND } from '@/config/candyland';
import { AMBASSADOR_TIERS as TIERS } from '@shared/ambassadorTiers';
import { missionCutoff } from '@shared/mission300';
import { useSeo } from '@/hooks/useSeo';

const MEDALS = ['🥇', '🥈', '🥉'];

/** Ranking público del Hall de la Fama -- solo primer nombre, código y
 * cantidad de ventas (nunca montos ni apellido, ver db.getReferralLeaderboard
 * en el servidor). Visible para cualquiera, sin necesidad de código propio. */
function LeaderboardSection() {
  const { data: event } = trpc.events.getBySlug.useQuery({ slug: CANDYLAND.slug }, { retry: false });
  const { data: leaderboard } = trpc.referrals.getLeaderboard.useQuery(
    { eventId: event?.id ?? 0 },
    { enabled: !!event?.id }
  );

  const daysLeft = event?.eventDate
    ? Math.max(0, Math.ceil((missionCutoff(new Date(event.eventDate)).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : null;

  return (
    <div className="mb-10">
      <div className="text-center mb-6">
        <h1 className="font-heading text-4xl md:text-5xl mb-2">Hall de la <span className="text-gradient">Fama</span></h1>
        <p className="text-muted-foreground">Los embajadores que más entradas venden con su código</p>
        {daysLeft !== null && (
          <p className="inline-flex items-center gap-1.5 mt-3 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-bold uppercase tracking-wide">
            ⏳ Quedan {daysLeft} día{daysLeft === 1 ? '' : 's'} para cerrar el ranking
          </p>
        )}
      </div>

      <Card className="mb-4 border-primary/30 bg-gradient-to-br from-primary/10 via-card to-secondary/10">
        <CardContent className="pt-6 pb-6 text-center">
          <Crown className="w-8 h-8 text-primary mx-auto mb-2" />
          <p className="font-heading text-lg">🏆 Premio Top 3 de esta fiesta</p>
          <p className="text-sm text-muted-foreground mt-1">Además de tu nivel individual, el top 3 del ranking al cierre gana un premio extra — escríbenos por Instagram para conocer los detalles.</p>
        </CardContent>
      </Card>

      {leaderboard && leaderboard.length > 0 ? (
        <Card className="border-border/50">
          <CardContent className="pt-6">
            <div className="space-y-2">
              {leaderboard.map((row: any, i: number) => (
                <div key={row.ambassadorCode} className={`flex items-center justify-between px-4 py-3 rounded-xl ${i < 3 ? 'bg-primary/5 border border-primary/20' : 'bg-muted/30'}`}>
                  <div className="flex items-center gap-3">
                    <span className="font-heading text-lg w-8 text-center">{MEDALS[i] ?? `#${i + 1}`}</span>
                    <span className="font-semibold">{row.firstName}</span>
                    {row.recentStreak && (
                      <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-orange-500/15 text-orange-500 font-medium">
                        <Flame className="w-3 h-3" /> en racha
                      </span>
                    )}
                  </div>
                  <span className="font-heading text-xl text-primary">{row.totalReferrals}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-border/50">
          <CardContent className="pt-6 pb-6 text-center text-muted-foreground text-sm">
            Todavía nadie vendió con su código — sé el primero en aparecer acá.
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/** Antes esta página requería iniciar sesión (OAuth) — pero el sitio ya no
 * tiene ningún login de comprador visible (se sacó del Navbar en un rediseño
 * anterior), así que quedó inalcanzable. Ahora funciona con el mismo código
 * de embajador que llega por email, sin cuenta ni contraseña. */
export default function MyReferrals() {
  useSeo({
    title: 'Mis Referidos — Mansion Playroom',
    description: 'Consulta tu panel de embajador y el Hall de la Fama de Mansion Playroom.',
    path: '/mis-referidos',
    noindex: true,
  });

  const [codeInput, setCodeInput] = useState('');
  const [submittedCode, setSubmittedCode] = useState('');
  const [copied, setCopied] = useState(false);

  const { data, isLoading, isFetched } = trpc.referrals.getByCode.useQuery(
    { code: submittedCode },
    { enabled: !!submittedCode, retry: false }
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (codeInput.trim()) setSubmittedCode(codeInput.trim().toUpperCase());
  };

  // Guarda directo sobre `data` (no sobre isFetched/isLoading) -- justo
  // después de un submit, isFetched todavía es false y data es undefined,
  // así que una condición basada en isFetched dejaba pasar ese instante
  // hacia el bloque de abajo y crasheaba en `data!.ambassadorCode`.
  if (!submittedCode || !data) {
    return (
      <div className="min-h-screen pt-28 pb-16">
        <div className="container max-w-5xl">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
            <LeaderboardSection />

            <div className="max-w-lg mx-auto text-center border-t border-border/40 pt-10">
              <div className="w-16 h-16 mx-auto mb-5 border border-primary/30 rounded-2xl flex items-center justify-center bg-primary/5">
                <Users className="w-8 h-8 text-primary" />
              </div>
              <h2 className="font-heading text-2xl mb-3">¿Tienes tu código?</h2>
              <p className="text-muted-foreground mb-6">
                Ingresa tu código de embajador (el mismo que te llegó por email) para ver tus estadísticas y premios.
              </p>
              <form onSubmit={handleSubmit} className="flex gap-2 max-w-sm mx-auto">
                <Input
                  value={codeInput}
                  onChange={(e) => setCodeInput(e.target.value)}
                  placeholder="TU-CODIGO"
                  className="h-12 text-center font-mono uppercase"
                />
                <Button type="submit" size="lg" className="interactive glow-pink shrink-0" disabled={!codeInput.trim() || isLoading}>
                  <KeyRound className="w-4 h-4" />
                </Button>
              </form>
              {submittedCode && isLoading && (
                <div className="w-6 h-6 mx-auto mt-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              )}
              {isFetched && !data && (
                <p className="text-destructive text-sm mt-4">No encontramos ese código — revisa que esté bien escrito.</p>
              )}
            </div>
          </motion.div>
        </div>
      </div>
    );
  }

  const ambassadorCode = data.ambassadorCode;
  const referrals = data.referrals;
  const totalReferrals = referrals.length;
  const totalTickets = referrals.reduce((sum: number, r: any) => sum + (r.ticketCount || 0), 0);
  const totalRevenue = referrals.reduce((sum: number, r: any) => sum + Number(r.orderTotal || 0), 0);

  const currentTier = TIERS.filter(t => totalReferrals >= t.min).pop();
  const nextTier = TIERS.find(t => totalReferrals < t.min);

  const handleCopy = () => {
    navigator.clipboard.writeText(ambassadorCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleShare = () => {
    const text = `Usa mi código ${ambassadorCode} para comprar entradas en Mansion Playroom y vive la mejor experiencia nocturna de Valparaíso.`;
    if (navigator.share) {
      navigator.share({ title: 'Mansion Playroom', text });
    } else {
      navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="min-h-screen pt-28 pb-16">
      <div className="container max-w-5xl">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
          <LeaderboardSection />

          {/* Header */}
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8 border-t border-border/40 pt-10">
            <div>
              <h2 className="font-heading text-3xl md:text-4xl">Tu Panel de <span className="text-gradient">Embajador</span></h2>
              <p className="text-muted-foreground mt-2">Hola, {data.buyerName}</p>
            </div>
            <Button onClick={handleShare} variant="outline" className="interactive gap-2">
              <Share2 className="w-4 h-4" /> Compartir Código
            </Button>
          </div>

          {/* Ambassador Code Card */}
          <Card className="mb-8 border-primary/30 bg-gradient-to-br from-primary/5 via-card to-secondary/5 overflow-hidden relative">
            <div className="absolute top-0 right-0 w-40 h-40 bg-primary/5 rounded-full -translate-y-1/2 translate-x-1/2" />
            <div className="absolute bottom-0 left-0 w-24 h-24 bg-secondary/5 rounded-full translate-y-1/2 -translate-x-1/2" />
            <CardContent className="pt-8 pb-8 relative z-10">
              <div className="flex flex-col md:flex-row items-center justify-between gap-6">
                <div className="text-center md:text-left">
                  <p className="text-sm text-muted-foreground uppercase tracking-wider mb-1">Tu Código Único</p>
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-3xl md:text-4xl font-bold text-primary">{ambassadorCode}</span>
                    <Button variant="outline" size="sm" onClick={handleCopy} className="interactive">
                      {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
                    </Button>
                  </div>
                  <p className="text-muted-foreground text-sm mt-2">Cuando alguien compra con tu código, queda registrado aquí</p>
                </div>
                {currentTier && (
                  <div className="text-center px-6 py-3 border border-primary/30 rounded-xl bg-primary/5">
                    <Trophy className="w-6 h-6 text-primary mx-auto mb-1" />
                    <p className="font-heading text-lg text-primary">{currentTier.name}</p>
                    <p className="text-xs text-muted-foreground">{currentTier.reward}</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Stats Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
            <Card className="border-border/50 hover:border-primary/30 transition-colors">
              <CardContent className="pt-6 text-center">
                <Users className="w-8 h-8 text-primary mx-auto mb-3" />
                <p className="font-heading text-4xl">{totalReferrals}</p>
                <p className="text-muted-foreground text-sm mt-1">Personas Referidas</p>
              </CardContent>
            </Card>
            <Card className="border-border/50 hover:border-primary/30 transition-colors">
              <CardContent className="pt-6 text-center">
                <Ticket className="w-8 h-8 text-primary mx-auto mb-3" />
                <p className="font-heading text-4xl">{totalTickets}</p>
                <p className="text-muted-foreground text-sm mt-1">Entradas Vendidas</p>
              </CardContent>
            </Card>
            <Card className="border-border/50 hover:border-primary/30 transition-colors">
              <CardContent className="pt-6 text-center">
                <Gift className="w-8 h-8 text-primary mx-auto mb-3" />
                <p className="font-heading text-4xl">${totalRevenue.toLocaleString('es-CL')}</p>
                <p className="text-muted-foreground text-sm mt-1">Ingresos Generados</p>
              </CardContent>
            </Card>
          </div>

          {/* Progress to next tier */}
          {nextTier && (
            <Card className="mb-8 border-border/50">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold text-sm">Progreso al siguiente nivel</h3>
                  <span className="text-xs text-muted-foreground">
                    {totalReferrals}/{nextTier.min} referidos para <span className="text-primary font-medium">{nextTier.name}</span>
                  </span>
                </div>
                <div className="w-full h-3 bg-muted rounded-full overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.min(100, (totalReferrals / nextTier.min) * 100)}%` }}
                    transition={{ duration: 1, delay: 0.3, ease: [0.23, 1, 0.32, 1] }}
                    className="h-full bg-gradient-to-r from-primary to-secondary rounded-full"
                  />
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  Premio: <span className="text-foreground">{nextTier.reward}</span>
                </p>
              </CardContent>
            </Card>
          )}

          {/* Referrals History */}
          {referrals.length > 0 && (
            <Card className="border-border/50">
              <CardContent className="pt-6">
                <h3 className="font-heading text-xl mb-4">Historial de Ventas con tu Código</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border/50">
                        <th className="text-left py-3 text-muted-foreground font-medium">Comprador</th>
                        <th className="text-left py-3 text-muted-foreground font-medium">Fecha</th>
                        <th className="text-center py-3 text-muted-foreground font-medium">Tickets</th>
                        <th className="text-right py-3 text-muted-foreground font-medium">Monto</th>
                      </tr>
                    </thead>
                    <tbody>
                      {referrals.map((ref: any) => (
                        <tr key={ref.id} className="border-b border-border/30 last:border-0 hover:bg-muted/20 transition-colors">
                          <td className="py-3">
                            <span className="text-foreground">{ref.buyerEmail}</span>
                          </td>
                          <td className="py-3 text-muted-foreground">
                            {new Date(ref.createdAt).toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' })}
                          </td>
                          <td className="py-3 text-center">
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-primary/10 text-primary rounded-full text-xs font-medium">
                              {ref.ticketCount} tickets
                            </span>
                          </td>
                          <td className="py-3 text-right font-semibold text-foreground">
                            ${Number(ref.orderTotal).toLocaleString('es-CL')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          {totalReferrals === 0 && (
            <Card className="border-border/50">
              <CardContent className="pt-6 text-center py-16">
                <div className="w-20 h-20 mx-auto mb-6 border border-border/50 rounded-2xl flex items-center justify-center">
                  <Share2 className="w-10 h-10 text-muted-foreground" />
                </div>
                <h3 className="font-heading text-2xl mb-3">Empieza a referir</h3>
                <p className="text-muted-foreground max-w-md mx-auto mb-6">
                  Comparte tu código con amigos. Cada vez que alguien compre entradas usando tu código, aparecerá aquí y acumularás puntos para premios exclusivos.
                </p>
                <Button onClick={handleShare} className="interactive gap-2">
                  <Share2 className="w-4 h-4" /> Compartir mi Código
                </Button>
              </CardContent>
            </Card>
          )}

          {/* How it works */}
          <div className="mt-12">
            <h3 className="font-heading text-2xl mb-6 text-center">¿Cómo funciona?</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="text-center">
                <div className="w-12 h-12 mx-auto mb-3 bg-primary/10 rounded-full flex items-center justify-center">
                  <span className="font-heading text-xl text-primary">1</span>
                </div>
                <h4 className="font-semibold mb-1">Comparte tu código</h4>
                <p className="text-sm text-muted-foreground">Envía tu código a amigos que quieran ir a nuestras fiestas</p>
              </div>
              <div className="text-center">
                <div className="w-12 h-12 mx-auto mb-3 bg-primary/10 rounded-full flex items-center justify-center">
                  <span className="font-heading text-xl text-primary">2</span>
                </div>
                <h4 className="font-semibold mb-1">Ellos compran</h4>
                <p className="text-sm text-muted-foreground">Al ingresar tu código en el checkout, queda registrado como tu referido</p>
              </div>
              <div className="text-center">
                <div className="w-12 h-12 mx-auto mb-3 bg-primary/10 rounded-full flex items-center justify-center">
                  <span className="font-heading text-xl text-primary">3</span>
                </div>
                <h4 className="font-semibold mb-1">Ganas premios</h4>
                <p className="text-sm text-muted-foreground">Acumula referidos y desbloquea entradas gratis, VIP y más</p>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
