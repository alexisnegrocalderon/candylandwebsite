import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useLocation } from 'wouter';
import { Gift, X } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { MemberLogin } from '@/components/site/MemberLogin';
import { useMemberSession } from '@/lib/member';
import { isStandalone, promptDismissed as pushPromptDismissed } from '@/lib/customerPush';

/* Invitaciones discretas a «Mi cuenta» (opcional): en la entrada, después de
 * pagar y al abrir la app instalada. Nunca aparecen si ya entró, y la entrada
 * y el pago mandan el código al correo de ESA compra (sin escribir nada). */

const DISMISS_KEY = 'member-prompt.dismissed';
const OPENS_KEY = 'member-prompt.opens';
const DISMISS_MS = 30 * 86_400_000;

const dismissedRecently = () => { try { return Date.now() - Number(localStorage.getItem(DISMISS_KEY) ?? 0) < DISMISS_MS; } catch { return false; } };
const dismiss = () => { try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch { /* sin storage */ } };

export function MemberPrompt({ source, ticketCode, orderNumber, tone = 'light', className = '' }: {
  source: 'ticket' | 'pago';
  ticketCode?: string;
  orderNumber?: string;
  tone?: 'light' | 'dark';
  className?: string;
}) {
  const { data: session, isLoading } = useMemberSession();
  const { data: perks } = trpc.member.perks.useQuery(undefined, { staleTime: 5 * 60_000 });
  const [, navigate] = useLocation();
  const [open, setOpen] = useState(false);
  const dark = tone === 'dark';
  if (isLoading || (session?.loggedIn && session.isMember)) return null;
  // Sin una compra identificada no hay a dónde mandar el código.
  if (!ticketCode && !orderNumber) return null;

  const box = dark ? 'border-white/10 bg-white/[0.04]' : 'border-border bg-card';
  const strong = dark ? 'text-white' : 'text-foreground';
  const muted = dark ? 'text-white/60' : 'text-muted-foreground';
  const gift = perks?.welcome ? ` Al entrar por primera vez te regalamos un cupón de ${perks.welcome}%.` : '';

  return (
    <div className={`rounded-2xl border p-4 text-left ${box} ${className}`}>
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/15 text-primary"><Gift className="h-5 w-5" /></span>
        <div className="min-w-0">
          <p className={`font-heading text-[15px] font-bold leading-tight ${strong}`}>{source === 'pago' ? 'Guarda tus beneficios' : 'Tus Playcoins y cupones'}</p>
          <p className={`mt-1 text-[13px] ${muted}`}>Entra a tu cuenta para ver tu saldo, tus entradas y tus cupones exclusivos. Es opcional y sin contraseña.{gift}</p>
        </div>
      </div>
      <div className="mt-3">
        {open ? (
          <MemberLogin tone={tone} purchase={{ ticketCode, orderNumber }} onDone={() => navigate('/cuenta')} />
        ) : (
          <button type="button" onClick={() => setOpen(true)} className="h-11 w-full rounded-full border border-primary/50 text-sm font-semibold text-primary interactive">Entrar a mi cuenta</button>
        )}
      </div>
    </div>
  );
}

/** Al abrir la app instalada (desde la 2.ª vez): una invitación para entrar y quedar conectada. */
export function MemberSheet() {
  const { data: session, isLoading } = useMemberSession();
  const [, navigate] = useLocation();
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!isStandalone() || dismissedRecently()) return;
    let opens = 1;
    try {
      if (!sessionStorage.getItem(OPENS_KEY)) {
        opens = Number(localStorage.getItem(OPENS_KEY) ?? 0) + 1;
        localStorage.setItem(OPENS_KEY, String(opens));
        sessionStorage.setItem(OPENS_KEY, '1');
      } else opens = Number(localStorage.getItem(OPENS_KEY) ?? 1);
    } catch { /* sin storage: no se muestra */ return; }
    // No pisar la invitación a activar avisos: solo cuando ya la resolvió (activó o la cerró) y desde la 2.ª apertura.
    const pushHandled = pushPromptDismissed() || (typeof Notification !== 'undefined' && Notification.permission !== 'default');
    if (opens < 2 || !pushHandled) return;
    const t = window.setTimeout(() => setShow(true), 3500);
    return () => window.clearTimeout(t);
  }, []);

  if (isLoading || session?.loggedIn) return null;
  return (
    <AnimatePresence>
      {show && (
        <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 24 }} className="fixed inset-x-0 bottom-0 z-50 px-4 pb-[max(16px,env(safe-area-inset-bottom))]">
          <div className="relative mx-auto max-w-md rounded-2xl bg-background p-4 shadow-2xl shadow-black/25">
            <button type="button" aria-label="Cerrar" onClick={() => { dismiss(); setShow(false); }} className="absolute right-3 top-3 text-muted-foreground"><X className="h-4 w-4" /></button>
            <p className="pr-6 font-heading text-[15px] font-bold">Entra a tu cuenta</p>
            <p className="mb-3 mt-1 text-[13px] text-muted-foreground">Ve tus Playcoins, tus entradas y tus cupones exclusivos. Opcional y sin contraseña: te mandamos un código al correo.</p>
            <MemberLogin onDone={() => { dismiss(); setShow(false); navigate('/cuenta'); }} />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
