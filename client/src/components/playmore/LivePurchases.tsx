import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { trpc } from '@/lib/trpc';

/* "En vivo": un aviso chico abajo a la izquierda con las últimas compras
 * reales ("Nueva entrada · Dúo · hace 3 min"). Sin nombres, montos ni
 * cantidades: solo el acceso y cuándo. Aparece cada tanto (no tapa nada) y
 * solo con compras de las últimas 48 h. */

const FIRST_DELAY_MS = 9000;
const SHOW_MS = 5500;
const GAP_MS = 14000;

function ago(iso: string, now: number): string {
  const m = Math.max(1, Math.round((now - Date.parse(iso)) / 60_000));
  if (m < 60) return `hace ${m} min`;
  const h = Math.round(m / 60);
  return h === 1 ? 'hace 1 hora' : `hace ${h} horas`;
}

export function LivePurchases({ slug, preview }: { slug: string; preview?: string }) {
  const { data } = trpc.coproduction.recentPurchases.useQuery({ slug, preview }, { retry: false, refetchInterval: 60_000, staleTime: 30_000 });
  const [idx, setIdx] = useState(-1);
  const items = data ?? [];

  useEffect(() => {
    if (items.length === 0) return;
    let i = 0;
    let t: number;
    const show = () => {
      setIdx(i % items.length);
      t = window.setTimeout(() => { setIdx(-1); i += 1; t = window.setTimeout(show, GAP_MS); }, SHOW_MS);
    };
    t = window.setTimeout(show, FIRST_DELAY_MS);
    return () => window.clearTimeout(t);
  }, [items.length]);

  const item = idx >= 0 ? items[idx] : null;
  return (
    <div className="pointer-events-none fixed bottom-24 left-3 z-40 sm:bottom-6 sm:left-6" aria-live="polite">
      <AnimatePresence>
        {item && (
          <motion.div key={`${item.at}-${idx}`} initial={{ opacity: 0, y: 12, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 8 }} transition={{ duration: 0.4 }}
            className="flex items-center gap-3 rounded-full border border-[#d6b25e]/30 bg-black/75 py-2 pl-3 pr-4 text-[var(--pm-cream)] shadow-[0_10px_40px_-10px_rgba(150,21,157,0.6)] backdrop-blur-md">
            <span className="relative flex h-2.5 w-2.5" aria-hidden="true">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--pm-fuchsia)] opacity-60" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-[var(--pm-fuchsia)]" />
            </span>
            <span className="text-xs">
              <span className="text-[var(--pm-sand)]/70">Nueva entrada · </span>
              <span className="playmore-gold font-bold">{item.name}</span>
              <span className="text-[var(--pm-sand)]/60"> · {ago(item.at, Date.now())}</span>
            </span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
