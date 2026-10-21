import { useState } from 'react';
import { useParams } from 'wouter';
import { toast } from 'sonner';
import { Loader2, Gift, Banknote, Copy } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { useSeo } from '@/hooks/useSeo';

/* Ganador del concurso que ya había comprado su entrada: elige devolución
 * (con tope en el valor del premio, su entrada sigue válida) o una entrada
 * doble extra para regalar. El link le llega por DM y por correo
 * (server/contests.ts → sendBuyerWinnerMessage). */

const clp = (n: number) => `$${Math.round(n).toLocaleString('es-CL')}`;

export default function ConcursoPremio() {
  useSeo({ title: 'Tu premio — Mansion Playroom', description: 'Elige tu premio del concurso.', path: '/concurso/premio', noindex: true });
  const { token = '' } = useParams<{ token: string }>();
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.contests.choice.get.useQuery({ token }, { enabled: !!token, retry: false });
  const [confirming, setConfirming] = useState<'refund' | 'gift' | null>(null);
  const submit = trpc.contests.choice.submit.useMutation({
    onSuccess: () => { utils.contests.choice.get.invalidate({ token }); setConfirming(null); },
    onError: (e) => toast.error(e.message),
  });

  const box = (children: React.ReactNode) => (
    <div className="min-h-dvh pt-24 pb-16 flex items-center justify-center">
      <div className="container max-w-md text-center">{children}</div>
    </div>
  );

  if (isLoading) return box(<Loader2 className="w-8 h-8 animate-spin mx-auto text-muted-foreground" />);
  if (!data) return box(<p className="text-muted-foreground">Este link no es válido. Escríbenos por Instagram y lo vemos.</p>);

  if (data.status === 'expired' || data.status === 'skipped') {
    return box(<p className="text-muted-foreground">Este premio ya no está disponible. Escríbenos por Instagram si crees que es un error.</p>);
  }

  if (data.choice === 'gift') {
    return box(
      <>
        <div className="text-5xl mb-4">🎁</div>
        <h1 className="font-heading font-extrabold text-2xl mb-3">¡Tu entrada para regalar!</h1>
        <p className="text-muted-foreground text-sm mb-6">Compártele este código a quien quieras: al comprar con él, {data.prizeLabel} sale gratis.</p>
        {data.prizeCode && (
          <button
            className="glass-candy rounded-2xl px-6 py-4 font-mono text-2xl font-bold tracking-widest inline-flex items-center gap-3 mb-6"
            onClick={() => navigator.clipboard?.writeText(data.prizeCode!).then(() => toast.success('Código copiado.')).catch(() => {})}
          >
            {data.prizeCode} <Copy className="w-5 h-5" />
          </button>
        )}
        {data.checkoutUrl && (
          <a
            href={`https://wa.me/?text=${encodeURIComponent(`🎁 Te regalo una entrada para ${data.eventTitle} en Mansion Playroom. Úsala aquí: ${data.checkoutUrl}`)}`}
            target="_blank" rel="noopener noreferrer"
            className="w-full inline-flex items-center justify-center h-12 rounded-full bg-primary text-primary-foreground font-bold text-sm uppercase tracking-wide interactive"
          >
            Regalar por WhatsApp
          </a>
        )}
      </>,
    );
  }

  if (data.choice === 'refund') {
    return box(
      <>
        <div className="text-5xl mb-4">💸</div>
        <h1 className="font-heading font-extrabold text-2xl mb-3">{data.refundStatus === 'done' ? '¡Devolución hecha!' : 'Devolución en camino'}</h1>
        <p className="text-muted-foreground text-sm">
          {data.refundStatus === 'done'
            ? `Te devolvimos ${clp(data.refundAmount)} al medio de pago con que compraste.`
            : `Te vamos a devolver ${clp(data.refundAmount)} al medio de pago con que compraste. Te avisamos apenas esté hecha.`}
          {' '}Tu entrada sigue igual de válida. ¡Nos vemos en {data.eventTitle}! 🥳
        </p>
      </>,
    );
  }

  return box(
    <>
      <div className="text-5xl mb-4">🎉</div>
      <h1 className="font-heading font-extrabold text-2xl md:text-3xl mb-2">¡Ganaste{data.username ? `, @${data.username}` : ''}!</h1>
      <p className="text-muted-foreground text-sm mb-8">
        Como ya tienes tu entrada para {data.eventTitle}, elige tu premio
        {data.deadline ? ` antes del ${new Date(data.deadline).toLocaleString('es-CL', { timeZone: 'America/Santiago', dateStyle: 'full', timeStyle: 'short' })}` : ''}:
      </p>
      <div className="space-y-3">
        {(['refund', 'gift'] as const).map((choice) => {
          const isRefund = choice === 'refund';
          const selected = confirming === choice;
          return (
            <button
              key={choice}
              disabled={submit.isPending}
              onClick={() => (selected ? submit.mutate({ token, choice }) : setConfirming(choice))}
              className={`w-full glass-candy rounded-2xl p-5 text-left flex items-start gap-4 border-2 transition ${selected ? 'border-primary' : 'border-transparent'}`}
            >
              {isRefund ? <Banknote className="w-7 h-7 text-primary shrink-0" /> : <Gift className="w-7 h-7 text-primary shrink-0" />}
              <span>
                <span className="block font-bold">{isRefund ? `Quiero mi devolución: ${clp(data.refundAmount)}` : `Quiero ${data.prizeLabel} para regalar`}</span>
                <span className="block text-xs text-muted-foreground mt-1">
                  {selected
                    ? (submit.isPending ? 'Guardando…' : 'Toca de nuevo para confirmar')
                    : isRefund ? 'Te devolvemos el dinero y conservas tu entrada.' : 'Conservas tu entrada y te damos un código para que venga alguien más gratis.'}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </>,
  );
}
