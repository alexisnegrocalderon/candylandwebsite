import { useEffect, useState } from 'react';
import { CheckCircle2, Loader2, Mail } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import type { TopupAccess } from './TopupPanel';

/* "Olvidé mi PIN": el código de 6 dígitos que llega al correo de la tarjeta
 * reemplaza al PIN viejo como prueba de identidad. El correo lo decide el
 * servidor (el de la compra) -- acá nunca se escribe ni se elige. Estilos:
 * clases `wcard-*` de Ticket.wallet.css. */

const RESEND_SECONDS = 30;

export function ForgotPinPanel({ access, onBack }: { access: TopupAccess; onBack: () => void }) {
  const requestCode = trpc.playcardTopup.requestPinResetCode.useMutation();
  const resetPin = trpc.playcardTopup.resetPin.useMutation();

  const [step, setStep] = useState<'ask' | 'reset' | 'done'>('ask');
  const [maskedEmail, setMaskedEmail] = useState('');
  const [code, setCode] = useState('');
  const [pin, setPin] = useState('');
  const [pinConfirm, setPinConfirm] = useState('');
  const [error, setError] = useState('');
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const sendCode = () => {
    setError('');
    requestCode.mutate(access, {
      onSuccess: (res) => { setMaskedEmail(res.maskedEmail); setStep('reset'); setCooldown(RESEND_SECONDS); },
      onError: (e) => setError(e.message),
    });
  };

  const submit = () => {
    setError('');
    if (code.length !== 6) { setError('El código tiene 6 dígitos.'); return; }
    if (!/^\d{4}$/.test(pin)) { setError('El PIN tiene que tener 4 dígitos.'); return; }
    if (pin !== pinConfirm) { setError('Los dos PIN no coinciden.'); return; }
    resetPin.mutate({ ...access, code, pin }, {
      onSuccess: () => setStep('done'),
      onError: (e) => setError(e.message),
    });
  };

  if (step === 'done') {
    return (
      <div className="text-center py-2">
        <CheckCircle2 className="w-10 h-10 mx-auto mb-3" style={{ color: 'var(--wcard-gold)' }} />
        <p className="font-bold text-lg mb-1">¡PIN cambiado!</p>
        <p className="wcard-hint mb-4">Desde ahora usas el PIN nuevo en la barra. Te avisamos por correo del cambio.</p>
        <button type="button" className="wcard-btn wcard-btn-ghost wcard-btn-block" onClick={onBack}>Volver</button>
      </div>
    );
  }

  if (step === 'ask') {
    return (
      <div>
        <p className="font-bold mb-1">🔑 Recupera tu PIN</p>
        <p className="wcard-hint mb-4" style={{ marginTop: 0 }}>
          Te mandamos un código de 6 dígitos al correo con el que compraste, y con él creas un PIN nuevo. Tu saldo no se toca.
        </p>
        {error && <p className="wcard-error">{error}</p>}
        <button type="button" className="wcard-btn wcard-btn-primary wcard-btn-block mt-3" disabled={requestCode.isPending} onClick={sendCode}>
          {requestCode.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Mail className="w-4 h-4" /> Enviarme el código</>}
        </button>
        <div className="text-center mt-4">
          <button type="button" className="wcard-link" onClick={onBack}>Volver</button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <p className="font-bold mb-1">🔑 Crea tu PIN nuevo</p>
      <p className="wcard-hint mb-3" style={{ marginTop: 0 }}>
        Te mandamos el código a <strong>{maskedEmail}</strong>. Escríbelo o pégalo; revisa también spam.
      </p>
      <input
        className="wcard-input wcard-input-code" type="text" inputMode="numeric" autoComplete="one-time-code"
        maxLength={12} placeholder="••••••" aria-label="Código de 6 dígitos" value={code}
        onChange={(e) => { setCode(e.target.value.replace(/\D/g, '').slice(0, 6)); setError(''); }}
      />
      <div className="grid grid-cols-2 gap-3 mt-3">
        <input
          className="wcard-input wcard-input-pin" type="tel" inputMode="numeric" maxLength={4} autoComplete="off"
          placeholder="PIN nuevo" aria-label="PIN nuevo de 4 dígitos" value={pin}
          onChange={(e) => { setPin(e.target.value.replace(/\D/g, '').slice(0, 4)); setError(''); }}
        />
        <input
          className="wcard-input wcard-input-pin" type="tel" inputMode="numeric" maxLength={4} autoComplete="off"
          placeholder="Repite" aria-label="Repite el PIN nuevo" value={pinConfirm}
          onChange={(e) => { setPinConfirm(e.target.value.replace(/\D/g, '').slice(0, 4)); setError(''); }}
        />
      </div>
      {error && <p className="wcard-error">{error}</p>}
      <button type="button" className="wcard-btn wcard-btn-primary wcard-btn-block mt-4" disabled={resetPin.isPending} onClick={submit}>
        {resetPin.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Cambiar mi PIN'}
      </button>
      <div className="flex items-center justify-between mt-4">
        <button type="button" className="wcard-link" onClick={onBack}>Cancelar</button>
        <button type="button" className="wcard-link" disabled={cooldown > 0 || requestCode.isPending} onClick={sendCode}>
          {cooldown > 0 ? `Reenviar en ${cooldown}s` : 'Reenviar código'}
        </button>
      </div>
    </div>
  );
}
