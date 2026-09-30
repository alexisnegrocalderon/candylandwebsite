import { useState } from 'react';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { PaymentBrick, type PaymentOutcome } from '@/components/PaymentBrick';
import { ForgotPinPanel } from './ForgotPinPanel';

/* Recarga de saldo de la PlayCard para quien YA compró su entrada. Se usa en
 * dos lugares con el mismo flujo: el botón "Cargar saldo" de la tarjeta
 * digital (se identifica con el ticketCode del link) y /recargar (se
 * identifica con el código que llegó al correo). El cobro es el mismo
 * Payment Brick del checkout, sobre una orden de solo carga de saldo.
 * Estilos: clases `wcard-*` de Ticket.wallet.css (quien lo monta lo importa). */

export type TopupAccess = { ticketCode: string } | { sessionToken: string };

type Stage = 'choose' | 'pay' | 'done' | 'processing';

const clp = (n: number) => `$${n.toLocaleString('es-CL')}`;

export function TopupPanel({ access, onPaid }: { access: TopupAccess; onPaid?: () => void }) {
  const utils = trpc.useUtils();
  const { data: options, isLoading, error } = trpc.playcardTopup.getOptions.useQuery(access, { retry: false });
  const createTopup = trpc.playcardTopup.create.useMutation();

  const [stage, setStage] = useState<Stage>('choose');
  const [tierId, setTierId] = useState<number | null>(null);
  const [pin, setPin] = useState('');
  const [pinConfirm, setPinConfirm] = useState('');
  const [formError, setFormError] = useState('');
  const [order, setOrder] = useState<{ orderNumber: string; total: number } | null>(null);
  const [payError, setPayError] = useState('');
  const [forgotPin, setForgotPin] = useState(false);

  if (isLoading) {
    return <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin" /></div>;
  }
  if (error || !options) {
    return <p className="wcard-error">{error?.message || 'No pudimos cargar la recarga. Intenta de nuevo.'}</p>;
  }
  if (!options.event || options.tiers.length === 0) {
    return <p className="wcard-hint">Por ahora no hay montos de recarga disponibles. Vuelve a intentar más cerca de la fiesta.</p>;
  }

  if (forgotPin) return <ForgotPinPanel access={access} onBack={() => setForgotPin(false)} />;

  const needsPin = !options.cardPinSet;

  const handleContinue = () => {
    setFormError('');
    if (tierId == null) { setFormError('Elige cuánto quieres cargar.'); return; }
    if (needsPin) {
      if (!/^\d{4}$/.test(pin)) { setFormError('El PIN tiene que tener 4 dígitos.'); return; }
      if (pin !== pinConfirm) { setFormError('Los dos PIN no coinciden.'); return; }
    }
    createTopup.mutate(
      { ...access, ticketTypeId: tierId, pin: needsPin ? pin : undefined },
      {
        onSuccess: (res) => { setOrder(res); setPayError(''); setStage('pay'); },
        onError: (e) => setFormError(e.message),
      },
    );
  };

  const handleResult = (status: PaymentOutcome) => {
    if (status === 'approved') {
      setStage('done');
      utils.wallet.getByTicketCode.invalidate();
      utils.playcardTopup.getOptions.invalidate();
      onPaid?.();
    } else if (status === 'pending' || status === 'in_process') {
      setStage('processing');
    }
  };

  const reset = () => {
    setStage('choose'); setTierId(null); setPin(''); setPinConfirm(''); setOrder(null); setFormError(''); setPayError('');
  };

  if (stage === 'done') {
    return (
      <div className="text-center py-2">
        <CheckCircle2 className="w-10 h-10 mx-auto mb-3" style={{ color: 'var(--wcard-gold)' }} />
        <p className="font-bold text-lg mb-1">¡Recarga lista!</p>
        <p className="wcard-hint mb-4">Tu saldo ya está actualizado. Te enviamos un correo con el saldo nuevo{needsPin ? ' y tu PIN quedó guardado' : ''}.</p>
        <button type="button" className="wcard-btn wcard-btn-ghost wcard-btn-block" onClick={reset}>Cargar otra vez</button>
      </div>
    );
  }

  if (stage === 'processing') {
    return (
      <div className="text-center py-2">
        <Loader2 className="w-8 h-8 mx-auto mb-3 animate-spin" />
        <p className="font-bold mb-1">Tu pago está en proceso</p>
        <p className="wcard-hint">Apenas se confirme, el saldo se suma solo y te llega un correo. No necesitas hacer nada más.</p>
      </div>
    );
  }

  if (stage === 'pay' && order) {
    return (
      <div>
        <p className="font-bold mb-1">Pagar {clp(order.total)}</p>
        <p className="wcard-hint mb-4">Recarga {order.orderNumber}. Pago seguro con Mercado Pago.</p>
        <div className="rounded-2xl overflow-hidden bg-white p-2">
          <PaymentBrick
            orderNumber={order.orderNumber}
            amount={order.total}
            containerId="mp-topup-brick"
            onResult={handleResult}
            onError={setPayError}
          />
        </div>
        {payError && <p className="wcard-error">{payError}</p>}
        <button type="button" className="wcard-link mt-4" onClick={reset}>Cambiar monto</button>
      </div>
    );
  }

  return (
    <div>
      <p className="wcard-hint mb-3" style={{ marginTop: 0 }}>
        Saldo actual: <strong style={{ color: 'var(--wcard-gold)' }}>{clp(options.balance)}</strong> · {options.event.title}
      </p>

      <div className="space-y-2">
        {options.tiers.map((tier) => {
          const bonus = tier.topupAmount - tier.price;
          return (
            <button
              key={tier.id}
              type="button"
              className="wcard-amount"
              aria-pressed={tierId === tier.id}
              onClick={() => { setTierId(tier.id); setFormError(''); }}
            >
              <span>
                {clp(tier.price)}
                {bonus > 0 && <small>🎁 Recibes {clp(tier.topupAmount)} ({clp(bonus)} de regalo)</small>}
              </span>
              {tierId === tier.id && <CheckCircle2 className="w-5 h-5 shrink-0" style={{ color: 'var(--wcard-gold)' }} />}
            </button>
          );
        })}
      </div>

      {needsPin ? (
        <div className="mt-5">
          <p className="font-bold text-sm mb-1">💳 Crea el PIN de tu tarjeta</p>
          <p className="wcard-hint mb-3" style={{ marginTop: 0 }}>4 dígitos para gastar tu saldo en la barra. Acuérdate de él: lo vas a necesitar cada vez.</p>
          <div className="grid grid-cols-2 gap-3">
            <input
              className="wcard-input wcard-input-pin" type="tel" inputMode="numeric" maxLength={4} autoComplete="off"
              placeholder="PIN" aria-label="PIN de 4 dígitos" value={pin}
              onChange={(e) => { setPin(e.target.value.replace(/\D/g, '').slice(0, 4)); setFormError(''); }}
            />
            <input
              className="wcard-input wcard-input-pin" type="tel" inputMode="numeric" maxLength={4} autoComplete="off"
              placeholder="Repite" aria-label="Repite el PIN" value={pinConfirm}
              onChange={(e) => { setPinConfirm(e.target.value.replace(/\D/g, '').slice(0, 4)); setFormError(''); }}
            />
          </div>
        </div>
      ) : (
        <p className="wcard-hint mt-4">
          ✓ Tu tarjeta ya tiene PIN, sigues usando el mismo.{' '}
          <button type="button" className="wcard-link" onClick={() => setForgotPin(true)}>¿Olvidaste tu PIN?</button>
        </p>
      )}

      {formError && <p className="wcard-error">{formError}</p>}

      <button
        type="button"
        className="wcard-btn wcard-btn-primary wcard-btn-block mt-5"
        disabled={createTopup.isPending}
        onClick={handleContinue}
      >
        {createTopup.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Continuar al pago'}
      </button>
    </div>
  );
}
