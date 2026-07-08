import { useAuth } from '@/_core/hooks/useAuth';
import { trpc } from '@/lib/trpc';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Users, Gift, Copy, Check } from 'lucide-react';
import { startLogin } from '@/const';
import { useState } from 'react';
import Navbar from '@/components/Navbar';

export default function MyReferrals() {
  const { user, loading, isAuthenticated } = useAuth();
  const { data: referrals } = trpc.referrals.getByUser.useQuery(undefined, { enabled: isAuthenticated });
  const [copied, setCopied] = useState(false);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <>
        <Navbar />
        <div className="min-h-screen pt-24 flex items-center justify-center">
          <div className="text-center">
            <h2 className="font-heading text-3xl mb-4">Mis Referidos</h2>
            <p className="text-muted-foreground mb-6">Inicia sesión para ver tu código de embajador y estadísticas.</p>
            <Button onClick={() => startLogin()} className="interactive">Iniciar Sesión</Button>
          </div>
        </div>
      </>
    );
  }

  const ambassadorCode = (user as any)?.ambassadorCode || 'CARGANDO...';
  const totalReferrals = referrals?.length ?? 0;
  const totalTickets = referrals?.reduce((sum: number, r: any) => sum + (r.ticketCount || 0), 0) ?? 0;
  const totalRevenue = referrals?.reduce((sum: number, r: any) => sum + Number(r.orderTotal || 0), 0) ?? 0;

  const handleCopy = () => {
    navigator.clipboard.writeText(ambassadorCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <>
      <Navbar />
      <div className="min-h-screen pt-24 pb-16">
        <div className="container max-w-4xl">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
            <h1 className="font-heading text-4xl md:text-5xl mb-4">Programa de <span className="text-gradient">Embajadores</span></h1>
            <p className="text-muted-foreground text-lg mb-8">Comparte tu código y gana premios por cada persona que compre entradas con él.</p>

            {/* Ambassador Code Card */}
            <Card className="mb-8 border-primary/30 bg-gradient-to-br from-primary/10 to-accent/10">
              <CardContent className="pt-6 text-center">
                <p className="text-sm text-muted-foreground uppercase tracking-wider mb-2">Tu Código de Embajador</p>
                <div className="flex items-center justify-center gap-3">
                  <span className="font-mono text-4xl font-bold text-primary">{ambassadorCode}</span>
                  <Button variant="outline" size="sm" onClick={handleCopy} className="interactive">
                    {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
                  </Button>
                </div>
                <p className="text-muted-foreground text-sm mt-4">Comparte este código con tus amigos al comprar entradas</p>
              </CardContent>
            </Card>

            {/* Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
              <Card>
                <CardContent className="pt-6 text-center">
                  <Users className="w-8 h-8 text-primary mx-auto mb-2" />
                  <p className="font-heading text-3xl">{totalReferrals}</p>
                  <p className="text-muted-foreground text-sm">Referidos</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6 text-center">
                  <Gift className="w-8 h-8 text-primary mx-auto mb-2" />
                  <p className="font-heading text-3xl">{totalTickets}</p>
                  <p className="text-muted-foreground text-sm">Tickets Vendidos</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6 text-center">
                  <span className="text-primary text-2xl block mb-2">$</span>
                  <p className="font-heading text-3xl">${totalRevenue.toLocaleString('es-CL')}</p>
                  <p className="text-muted-foreground text-sm">Ingresos Generados</p>
                </CardContent>
              </Card>
            </div>

            {/* Referrals List */}
            {referrals && referrals.length > 0 && (
              <Card>
                <CardContent className="pt-6">
                  <h3 className="font-heading text-xl mb-4">Historial de Referidos</h3>
                  <div className="space-y-3">
                    {referrals.map((ref: any) => (
                      <div key={ref.id} className="flex justify-between items-center py-2 border-b border-border/50 last:border-0">
                        <div>
                          <p className="text-sm">{ref.buyerEmail}</p>
                          <p className="text-xs text-muted-foreground">{new Date(ref.createdAt).toLocaleDateString('es-CL')}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-semibold">{ref.ticketCount} tickets</p>
                          <p className="text-xs text-primary">${Number(ref.orderTotal).toLocaleString('es-CL')}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {totalReferrals === 0 && (
              <Card>
                <CardContent className="pt-6 text-center py-12">
                  <Users className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="font-heading text-xl mb-2">Aún no tienes referidos</h3>
                  <p className="text-muted-foreground">Comparte tu código con amigos para empezar a acumular premios.</p>
                </CardContent>
              </Card>
            )}
          </motion.div>
        </div>
      </div>
    </>
  );
}
