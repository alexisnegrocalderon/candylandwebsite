import { useEffect } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'wouter';
import { ArrowRight, Heart, Stamp, Ticket } from 'lucide-react';
import { Confetti } from './Confetti';
import { useHalloweenMode } from '@/lib/halloween';

/* El final de la compra para quien tiene la app («Mi cuenta»): confeti,
 * vibración y la entrada que ya quedó en su app, con el paso siguiente a mano
 * (verla o inscribirse en Playmatch). */

const NEON_RING = 'bg-gradient-to-br from-pink-500/70 via-fuchsia-400/40 to-sky-400/70';

function openTab(tab: string) {
  try { sessionStorage.setItem('cuenta.tab', tab); } catch { /* sin almacenamiento */ }
}

export function PurchaseCelebration({ eventTitle, onShown, needsLogin = false }: { eventTitle: string; onShown?: () => void; needsLogin?: boolean }) {
  const halloween = useHalloweenMode();
  useEffect(() => {
    try { navigator.vibrate?.([18, 60, 18, 60, 40]); } catch { /* sin vibración */ }
    onShown?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div className={`account-font account-tokens relative min-h-dvh overflow-hidden bg-[#0b0612] px-5 pb-16 pt-[max(96px,calc(env(safe-area-inset-top)+64px))] text-white ${halloween ? 'pm-halloween' : ''}`}>
      <div className="account-backdrop" />
      <Confetti />
      <div className="relative z-10 mx-auto max-w-sm text-center">
        <motion.div
          initial={{ scale: 0.4, rotate: -12, opacity: 0 }}
          animate={{ scale: 1, rotate: 0, opacity: 1 }}
          transition={{ type: 'spring', damping: 11, stiffness: 180, delay: 0.1 }}
          className={`mx-auto grid h-28 w-28 place-items-center rounded-full p-[2px] ${NEON_RING} shadow-[0_0_60px_rgba(236,72,153,0.45)]`}
        >
          <span className="grid h-full w-full place-items-center rounded-full bg-[#0d0712] text-5xl">🎟️</span>
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}>
          <h1 className="mt-6 text-[30px] font-bold leading-tight tracking-tight">¡Tu entrada está lista! 🎉</h1>
          <p className="mx-auto mt-2 max-w-xs text-[15px] leading-snug text-white/70">
            <b className="text-white">{eventTitle}</b>. {needsLogin
              ? 'Te llegó al correo. Entra a «Mi cuenta» con ese mismo correo y la tienes acá con su QR.'
              : 'Ya está en tu app con su QR, y también te llegó al correo.'}
          </p>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.55 }} className="mt-7 space-y-2.5 text-left">
          <div className="account-glass flex items-center gap-3 rounded-[22px] px-4 py-3.5">
            <Stamp className="h-5 w-5 shrink-0 text-pink-300" />
            <p className="text-[13.5px] leading-snug text-white/75">Tu sello te espera: se marca solo cuando entres a la fiesta.</p>
          </div>
          <Link href="/cuenta" onClick={() => openTab('card')} className={`block rounded-full p-[1.5px] ${NEON_RING} interactive`}>
            <span className="flex h-14 items-center justify-center gap-2 rounded-full bg-gradient-to-r from-pink-500 via-fuchsia-500 to-sky-500 text-[16px] font-bold">
              <Ticket className="h-5 w-5" /> Ver mi entrada <ArrowRight className="h-4 w-4" />
            </span>
          </Link>
          <Link href="/cuenta?tab=playmatch" onClick={() => openTab('playmatch')} className="account-glass flex h-14 items-center justify-center gap-2 rounded-full text-[15px] font-semibold interactive">
            <Heart className="h-5 w-5 text-pink-300" /> Inscribirme en Playmatch
          </Link>
        </motion.div>
      </div>
    </div>
  );
}
