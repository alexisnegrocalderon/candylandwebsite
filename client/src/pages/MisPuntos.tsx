import { trpc } from '@/lib/trpc';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Mail, Wallet } from 'lucide-react';
import { useState } from 'react';
import { canRedeem, PLAYCOINS_MIN_REDEEM_BALANCE } from '@shared/playcoins';
import { useSeo } from '@/hooks/useSeo';
import { WalletCard } from '@/components/wallet/WalletCard';

/** Consulta pública de saldo prepagado + Playcoins (pedido explícito del
 * dueño) -- sin login (el sitio no tiene cuentas de comprador), mismo patrón
 * de MyReferrals.tsx: búsqueda solo al enviar el formulario, no en cada
 * tecla. La forma más completa de ver la tarjeta (con QR y movimientos) sigue
 * siendo /verificar/:ticketCode del correo de confirmación -- esta página
 * cubre el caso de alguien que perdió ese correo y solo tiene su email. */
export default function MisPuntos() {
  useSeo({
    title: 'Mi Saldo y Playcoins — Mansion Playroom',
    description: 'Consulta tu saldo prepagado y tus Playcoins en Mansion Playroom.',
    path: '/mis-puntos',
    noindex: true,
  });

  const [emailInput, setEmailInput] = useState('');
  const [submittedEmail, setSubmittedEmail] = useState('');

  const { data, isLoading, isFetched } = trpc.playcoins.getBalanceByEmail.useQuery(
    { email: submittedEmail },
    { enabled: !!submittedEmail, retry: false }
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (emailInput.trim()) setSubmittedEmail(emailInput.trim());
  };

  // Mismo cuidado que MyReferrals: chequear `data`, no isFetched, para no
  // crashear en el frame entre submit y respuesta.
  if (!submittedEmail || !data) {
    return (
      <div className="min-h-screen pt-28 pb-16">
        <div className="container max-w-lg">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }} className="text-center">
            <div className="w-16 h-16 mx-auto mb-5 border border-primary/30 rounded-2xl flex items-center justify-center bg-primary/5">
              <Wallet className="w-8 h-8 text-primary" />
            </div>
            <h1 className="font-heading text-3xl md:text-4xl mb-3">Tu <span className="text-gradient">Saldo y Playcoins</span></h1>
            <p className="text-muted-foreground mb-6">
              Ingresa el email con el que compraste para ver tu saldo prepagado y tus Playcoins. Ganas 25 Playcoins por cada $1.000 gastados, y puedes canjearlos en caja el día del evento una vez que juntes {PLAYCOINS_MIN_REDEEM_BALANCE.toLocaleString('es-CL')}.
            </p>
            <form onSubmit={handleSubmit} className="flex gap-2 max-w-sm mx-auto">
              <Input
                type="email"
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                placeholder="tu@email.cl"
                className="h-12 text-center"
              />
              <Button type="submit" size="lg" className="interactive glow-pink shrink-0" disabled={!emailInput.trim() || isLoading}>
                <Mail className="w-4 h-4" />
              </Button>
            </form>
            {submittedEmail && isLoading && (
              <div className="w-6 h-6 mx-auto mt-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            )}
            {isFetched && !data && (
              <p className="text-destructive text-sm mt-4">No encontramos saldo ni Playcoins asociados a ese email todavía.</p>
            )}
          </motion.div>
        </div>
      </div>
    );
  }

  const { playcoins, prepaidBalance, fullName, email } = data;
  const eligible = canRedeem(playcoins);
  const missing = Math.max(0, PLAYCOINS_MIN_REDEEM_BALANCE - playcoins);

  return (
    <div className="min-h-screen pt-28 pb-16">
      <div className="container max-w-lg">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }} className="text-center">
          <h1 className="font-heading text-3xl md:text-4xl mb-6">Tu <span className="text-gradient">Saldo y Playcoins</span></h1>

          {/* La tarjeta real (mismo componente que /verificar y la página de
              PlayCard), sin QR/reverso -- acá no hay una entrada puntual
              detrás, solo el email. Panel oscuro propio (mismo criterio que
              PlayCardArticle.tsx) para que el vidrio/holograma se lea igual
              de bien que en el resto del sitio, sin oscurecer toda la página. */}
          <div className="rounded-[28px] p-6 md:p-10 mb-6" style={{
            background: 'radial-gradient(120% 120% at 20% 0%, #241432, #0d0712 70%)',
          }}>
            <WalletCard
              eventTitle=""
              eventDateShort=""
              holderName={fullName || email}
              ticketCode={null}
              qrImageUrl={null}
              prepaidBalance={prepaidBalance}
              playcoins={playcoins}
              movements={[]}
            />
          </div>

          {eligible ? (
            <Card className="border-border/50">
              <CardContent className="pt-6 pb-6 text-sm text-muted-foreground">
                ✅ Ya puedes canjear tus Playcoins en caja el día del evento — dile a la cajera tu email y cuántos quieres usar.
              </CardContent>
            </Card>
          ) : (
            <Card className="border-border/50">
              <CardContent className="pt-6 pb-6 text-sm text-muted-foreground">
                Te faltan <span className="text-foreground font-semibold">{missing.toLocaleString('es-CL')}</span> Playcoins para poder canjear (mínimo {PLAYCOINS_MIN_REDEEM_BALANCE.toLocaleString('es-CL')}).
              </CardContent>
            </Card>
          )}

          <Button variant="outline" className="interactive mt-6" onClick={() => { setSubmittedEmail(''); setEmailInput(''); }}>
            Consultar otro email
          </Button>
        </motion.div>
      </div>
    </div>
  );
}
