import { useEffect, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { motion } from 'framer-motion';
import { Loader2, Mail } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { useSeo } from '@/hooks/useSeo';
import { MARCA } from '@/config/candyland';
import { LAST_TICKET_CODE_KEY } from '@/lib/lastTicketCode';
import { TopupPanel } from '@/components/wallet/TopupPanel';
import './Ticket.wallet.css';

/* /recargar -- cargar saldo a la PlayCard después de comprar la entrada, sin
 * buscar ningún código de reserva: se pide el correo de la compra, llega un
 * código de 6 dígitos y con eso se abre la recarga. Si este celular ya abrió
 * la tarjeta digital antes, hay un atajo directo a ella. */

const SESSION_KEY = 'mp_topup_session';
const RESEND_SECONDS = 30;

function readStored(key: string, storage: 'local' | 'session'): string {
  try {
    return (storage === 'local' ? localStorage : sessionStorage).getItem(key) ?? '';
  } catch {
    return '';
  }
}

function storeSession(token: string) {
  try {
    if (token) sessionStorage.setItem(SESSION_KEY, token);
    else sessionStorage.removeItem(SESSION_KEY);
  } catch {
    // Sin storage solo se pierde el atajo al recargar la página.
  }
}

export default function Recargar() {
  useSeo({
    title: 'Recarga tu PlayCard — Mansion Playroom',
    description: 'Carga saldo a tu Tarjeta PlayCard cuando quieras, aunque ya hayas comprado tu entrada.',
    path: '/recargar',
  });
  const [, navigate] = useLocation();

  const [sessionToken, setSessionToken] = useState(() => readStored(SESSION_KEY, 'session'));
  const [email, setEmail] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [cooldown, setCooldown] = useState(0);

  const savedTicketCode = readStored(LAST_TICKET_CODE_KEY, 'local');
  const requestCode = trpc.playcardTopup.requestCode.useMutation();
  const verifyCode = trpc.playcardTopup.verifyCode.useMutation();

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const sendCode = () => {
    setError('');
    requestCode.mutate({ email: email.trim() }, {
      onSuccess: () => { setCodeSent(true); setCode(''); setCooldown(RESEND_SECONDS); },
      onError: (e) => setError(e.message),
    });
  };

  const submitCode = (value: string) => {
    setError('');
    verifyCode.mutate({ email: email.trim(), code: value }, {
      onSuccess: ({ sessionToken: token }) => { storeSession(token); setSessionToken(token); },
      onError: (e) => { setError(e.message); setCode(''); },
    });
  };

  const onCodeChange = (raw: string) => {
    const digits = raw.replace(/\D/g, '').slice(0, 6);
    setCode(digits);
    setError('');
    if (digits.length === 6 && !verifyCode.isPending) submitCode(digits);
  };

  const leave = () => {
    storeSession('');
    setSessionToken(''); setCodeSent(false); setCode(''); setEmail(''); setError('');
  };

  return (
    <div className="wcard-page min-h-dvh">
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
        <div className="text-center mb-2">
          <div className="text-4xl mb-2" aria-hidden>💳</div>
          <h1 className="font-heading font-extrabold text-2xl tracking-tight">Recarga tu PlayCard</h1>
          <p className="text-sm opacity-70 mt-1 max-w-xs mx-auto">Carga saldo cuando quieras, aunque ya tengas tu entrada.</p>
        </div>

        <div className="wcard-section">
          {sessionToken ? (
            <>
              <TopupPanel access={{ sessionToken }} />
              <div className="text-center mt-4">
                <button type="button" className="wcard-link" onClick={leave}>Usar otro correo</button>
              </div>
            </>
          ) : !codeSent ? (
            <>
              <p className="wcard-section-label">Paso 1 · Tu correo</p>
              <p className="text-sm opacity-80 mb-3">Escribe el correo con el que compraste tu entrada y te mandamos un código de 6 dígitos.</p>
              <input
                className="wcard-input" type="email" inputMode="email" autoComplete="email"
                placeholder="tu@correo.com" aria-label="Correo de tu compra" value={email}
                onChange={(e) => { setEmail(e.target.value); setError(''); }}
                onKeyDown={(e) => { if (e.key === 'Enter' && email.includes('@')) sendCode(); }}
              />
              {error && <p className="wcard-error">{error}</p>}
              <button
                type="button"
                className="wcard-btn wcard-btn-primary wcard-btn-block mt-4"
                disabled={!email.includes('@') || requestCode.isPending}
                onClick={sendCode}
              >
                {requestCode.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Mail className="w-4 h-4" /> Enviarme el código</>}
              </button>

              {savedTicketCode && (
                <div className="text-center mt-5 pt-4" style={{ borderTop: '1px solid var(--wcard-line)' }}>
                  <p className="wcard-hint" style={{ marginTop: 0 }}>¿Ya abriste tu tarjeta en este celular?</p>
                  <button type="button" className="wcard-link mt-1" onClick={() => navigate(`/verificar/${savedTicketCode}?recargar=1`)}>
                    Ir directo a mi tarjeta
                  </button>
                </div>
              )}
            </>
          ) : (
            <>
              <p className="wcard-section-label">Paso 2 · Tu código</p>
              <p className="text-sm opacity-80 mb-3">
                Te lo mandamos a <strong>{email.trim()}</strong>. Escríbelo o pégalo acá; revisa también spam.
              </p>
              <input
                className="wcard-input wcard-input-code" type="text" inputMode="numeric" autoComplete="one-time-code"
                autoFocus maxLength={12} placeholder="••••••" aria-label="Código de 6 dígitos" value={code}
                onChange={(e) => onCodeChange(e.target.value)}
              />
              {verifyCode.isPending && <p className="wcard-hint text-center"><Loader2 className="w-3.5 h-3.5 inline animate-spin" /> Verificando…</p>}
              {error && <p className="wcard-error text-center">{error}</p>}

              <div className="flex items-center justify-between mt-5">
                <button type="button" className="wcard-link" onClick={() => { setCodeSent(false); setCode(''); setError(''); }}>Cambiar correo</button>
                <button type="button" className="wcard-link" disabled={cooldown > 0 || requestCode.isPending} onClick={sendCode}>
                  {cooldown > 0 ? `Reenviar en ${cooldown}s` : 'Reenviar código'}
                </button>
              </div>
            </>
          )}
        </div>

        <p className="text-center text-xs opacity-60 mt-5">
          ¿Quieres saber cómo funciona?{' '}
          <Link href="/blog/tarjeta-playcard" className="underline">Lee todo sobre la PlayCard</Link>
        </p>
        <p className="text-center text-xs mt-2"><Link href="/" className="underline opacity-60">Volver al inicio</Link></p>
        <p className="text-center text-[11px] opacity-40 mt-4">🍭 {MARCA.nombre}</p>
      </motion.div>
    </div>
  );
}
