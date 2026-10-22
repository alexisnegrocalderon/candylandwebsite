import { useState } from 'react';
import { Loader2, Mail } from 'lucide-react';
import { trpc } from '@/lib/trpc';

const EMAIL_KEY = 'member.email';
const savedEmail = () => { try { return localStorage.getItem(EMAIL_KEY) ?? ''; } catch { return ''; } };
const saveEmail = (v: string) => { try { localStorage.setItem(EMAIL_KEY, v); } catch { /* sin storage */ } };

/* Entrar a «Mi cuenta» con un código al correo (sin contraseña). Sirve para la
 * página /cuenta, la preventa de socios y los avisos de la entrada y del pago:
 * con `purchase` el código va al correo de ESA compra (nunca a uno que
 * escriba quien pide) y no hay campo de correo. */

export interface LoginDone { isNew: boolean; granted: { title: string; percent: number; days: number }[] }

export function MemberLogin({ purchase, tone = 'light', onDone }: {
  purchase?: { ticketCode?: string; orderNumber?: string };
  tone?: 'light' | 'dark';
  onDone?: (r: LoginDone) => void;
}) {
  const utils = trpc.useUtils();
  const [email, setEmail] = useState(savedEmail);
  const [code, setCode] = useState('');
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const requestCode = trpc.member.requestCode.useMutation();
  const requestForPurchase = trpc.member.requestCodeForPurchase.useMutation();
  const verify = trpc.member.verifyCode.useMutation();
  const dark = tone === 'dark';
  const muted = dark ? 'text-white/60' : 'text-muted-foreground';
  const input = `w-full h-12 rounded-xl border px-4 text-base outline-none focus:ring-2 focus:ring-primary/40 ${dark ? 'bg-white/5 border-white/15 text-white placeholder:text-white/35' : 'bg-background border-border'}`;
  const btn = 'w-full h-12 rounded-full bg-primary text-primary-foreground font-bold text-sm inline-flex items-center justify-center gap-2 interactive disabled:opacity-60';

  const send = async () => {
    setError(null);
    try {
      if (purchase) {
        const r = await requestForPurchase.mutateAsync(purchase);
        setSentTo(r.maskedEmail);
      } else {
        await requestCode.mutateAsync({ email: email.trim() });
        setSentTo(email.trim());
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No pudimos mandar el código.');
    }
  };

  const confirm = async () => {
    setError(null);
    try {
      const r = await verify.mutateAsync({ ...(purchase ?? { email: email.trim() }), code });
      if (!purchase) saveEmail(email.trim());
      await utils.member.invalidate();
      onDone?.({ isNew: r.isNew, granted: r.granted });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Código incorrecto o vencido.');
    }
  };

  const sending = requestCode.isPending || requestForPurchase.isPending;

  if (!sentTo) {
    return (
      <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); void send(); }}>
        {!purchase && (
          <input type="email" inputMode="email" autoComplete="email" required placeholder="tu@correo.cl" value={email} onChange={(e) => setEmail(e.target.value)} className={input} aria-label="Tu correo" />
        )}
        <button type="submit" disabled={sending || (!purchase && !email.includes('@'))} className={btn}>
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
          {purchase ? 'Mandarme el código al correo de mi compra' : 'Mandarme un código'}
        </button>
        {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
      </form>
    );
  }

  return (
    <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); void confirm(); }}>
      <p className={`text-sm ${muted}`}>Te mandamos un código de 6 dígitos a <b className={dark ? 'text-white' : 'text-foreground'}>{sentTo}</b>. Vale 10 minutos.</p>
      <input
        inputMode="numeric" autoComplete="one-time-code" maxLength={7} autoFocus placeholder="000 000" value={code}
        onChange={(e) => setCode(e.target.value.replace(/[^\d ]/g, ''))}
        className={`${input} text-center text-2xl tracking-[0.4em] font-mono`} aria-label="Código de 6 dígitos"
      />
      <button type="submit" disabled={verify.isPending || code.replace(/\D/g, '').length !== 6} className={btn}>
        {verify.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Entrar
      </button>
      {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
      <button type="button" onClick={() => { setSentTo(null); setCode(''); setError(null); }} className={`block mx-auto text-xs underline ${muted}`}>Pedir otro código</button>
    </form>
  );
}
