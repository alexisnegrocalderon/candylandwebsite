import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useDragControls } from 'framer-motion';
import QRCode from 'qrcode';
import { toast } from 'sonner';
import { CreditCard, Loader2, Star, Trash2, X } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { TopupPanel } from '@/components/wallet/TopupPanel';
import { QR_PAGE_BG, QrCard } from '@/components/site/walletParts';
import '@/pages/Ticket.wallet.css';

/* Pagos desde «Mi cuenta» (Etapa A). Cada pieza se muestra solo con su
 * interruptor prendido en Admin → Clientes → Socios (memberConfig.payments):
 * recargar la PlayCard, «Pagar en caja» con QR y las tarjetas guardadas. */

export function useMemberPayConfig() {
  const { data } = trpc.member.payConfig.useQuery(undefined, { staleTime: 5 * 60_000, retry: false });
  return data ?? { savedCards: false, accountTopup: false, cajaPay: false };
}

/** Las variables de color de la billetera (Ticket.wallet.css las define en `.wcard-page`). */
const WCARD_VARS = {
  '--wcard-ink': '#0d0712', '--wcard-panel': '#1c0f26', '--wcard-magenta': '#ff3f8e', '--wcard-violet': '#8c7bff',
  '--wcard-gold': '#f0c674', '--wcard-paper': '#fbeee0', '--wcard-muted': '#b79fc0', '--wcard-muted-2': '#8a7495',
  '--wcard-line': 'rgba(251, 238, 224, 0.14)', color: '#fbeee0',
} as React.CSSProperties;

/** Hoja que sube desde abajo (mismo gesto que «Más»). */
export function BottomSheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode }) {
  const drag = useDragControls();
  if (typeof document === 'undefined') return null;
  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          <motion.div className="fixed inset-0 z-[70] bg-black/55" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.div
            role="dialog" aria-label={title}
            className="lg-sheet account-font account-tokens fixed inset-x-0 bottom-0 z-[71] mx-auto max-h-[90dvh] max-w-lg overflow-y-auto rounded-t-[32px] px-4 pb-[max(20px,env(safe-area-inset-bottom))] pt-3 text-white"
            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', damping: 30, stiffness: 320 }}
            drag="y" dragControls={drag} dragListener={false} dragConstraints={{ top: 0, bottom: 0 }} dragElastic={{ top: 0, bottom: 0.6 }} onDragEnd={(_, info) => { if (info.offset.y > 90) onClose(); }}
          >
            <div onPointerDown={(e) => drag.start(e)} className="-mx-4 mb-2 flex h-8 cursor-grab touch-none items-center justify-center"><div className="h-1.5 w-10 rounded-full bg-white/25" /></div>
            <div className="mb-4 flex items-center justify-between gap-3">
              <p className="font-heading text-title3 font-bold">{title}</p>
              <button type="button" onClick={onClose} aria-label="Cerrar" className="grid h-10 w-10 place-items-center rounded-full bg-white/10"><X className="h-4 w-4" /></button>
            </div>
            {children}
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body,
  );
}

/** Recargar la PlayCard desde la cuenta (la sesión del socio lo identifica). */
export function TopupSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <BottomSheet open={open} onClose={onClose} title="Recargar mi PlayCard">
      <div style={WCARD_VARS}>{open && <TopupPanel access={{ member: true }} />}</div>
    </BottomSheet>
  );
}

const fmtClp = (n: number) => `$${n.toLocaleString('es-CL')}`;

/** «Pagar en caja»: QR de un solo uso que vence en 2 minutos y se renueva solo. */
export function PayInCajaViewer({ onClose, prepaidBalance, playcoins }: { onClose: () => void; prepaidBalance: number; playcoins: number }) {
  const createToken = trpc.member.payToken.useMutation();
  const [qr, setQr] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<number>(0);
  const [now, setNow] = useState(() => Date.now());
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const t = await createToken.mutateAsync();
      setQr(await QRCode.toDataURL(t.token, { width: 640, margin: 1, errorCorrectionLevel: 'M' }));
      setExpiresAt(new Date(t.expiresAt).getTime());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No pudimos generar el QR. Revisa tu conexión.');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => { const t = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(t); }, []);
  // Se renueva solo unos segundos antes de vencer.
  useEffect(() => { if (expiresAt && expiresAt - now < 8_000 && !createToken.isPending) void refresh(); }, [now, expiresAt, refresh, createToken.isPending]);
  // Pantalla encendida mientras se muestra.
  useEffect(() => {
    let lock: { release: () => Promise<void> } | null = null;
    const nav = navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } };
    nav.wakeLock?.request('screen').then((l) => { lock = l; }).catch(() => {});
    return () => { void lock?.release().catch(() => {}); };
  }, []);

  const secs = Math.max(0, Math.ceil((expiresAt - now) / 1000));
  return createPortal(
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="account-font fixed inset-0 z-[90] flex flex-col items-center justify-center gap-5 px-6 pb-[max(24px,env(safe-area-inset-bottom))] pt-[max(24px,env(safe-area-inset-top))] text-white" style={QR_PAGE_BG} role="dialog" aria-label="QR para pagar en caja">
      <button type="button" onClick={onClose} aria-label="Cerrar" className="absolute right-4 top-[max(16px,env(safe-area-inset-top))] grid h-11 w-11 place-items-center rounded-full bg-white/10"><X className="h-5 w-5" /></button>
      <p className="text-title2 font-bold tracking-tight">Pagar en caja</p>
      <div className="flex gap-6 text-center">
        <div><p className="text-caption2 uppercase tracking-wider text-white/60">Saldo</p><p className="text-title2 font-bold tabular-nums">{fmtClp(prepaidBalance)}</p></div>
        <div><p className="text-caption2 uppercase tracking-wider text-white/60">Playcoins</p><p className="text-title2 font-bold tabular-nums text-violet-300">{playcoins.toLocaleString('es-CL')}</p></div>
      </div>
      {qr ? <QrCard src={qr} alt="QR de pago" className="w-[min(86vw,52vh)]" /> : (
        <div className="grid aspect-square w-[min(86vw,52vh)] place-items-center rounded-[28px] bg-white/[0.07]">{error ? <p className="px-6 text-center text-subhead text-rose-300">{error}</p> : <Loader2 className="h-8 w-8 animate-spin text-white/50" />}</div>
      )}
      <p className="text-center text-subhead text-white/60">Muéstralo a la cajera: cobra de tu saldo sin pedirte el PIN.<br />{qr && <span className="font-semibold text-white/80">Se renueva en {secs} s · sirve una sola vez</span>}</p>
      {error && <button type="button" onClick={() => { void refresh(); }} className="h-11 rounded-full bg-white px-6 text-subhead font-bold text-[#0b0612]">Reintentar</button>}
      <p className="text-center text-caption1 text-white/60">Necesita conexión. Si ves algo raro, cierra y vuelve a abrir.</p>
    </motion.div>,
    document.body,
  );
}

/** «Mis tarjetas»: las guardadas en Mercado Pago (nunca pasan por nuestros servidores). */
export function SavedCardsSection() {
  const utils = trpc.useUtils();
  const { data: cards, isLoading } = trpc.member.cards.list.useQuery(undefined, { retry: false });
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const refresh = () => { void utils.member.cards.list.invalidate(); void utils.member.payInit.invalidate(); };
  const remove = trpc.member.cards.remove.useMutation({ onSuccess: () => { refresh(); toast.success('Tarjeta eliminada'); setConfirmId(null); }, onError: (e) => toast.error(e.message) });
  const setDefault = trpc.member.cards.setDefault.useMutation({ onSuccess: () => { refresh(); toast.success('Tarjeta principal actualizada'); }, onError: (e) => toast.error(e.message) });

  return (
    <section className="account-glass space-y-3 rounded-2xl p-4">
      <h3 className="flex items-center gap-2 font-heading font-bold"><CreditCard className="h-4 w-4 text-pink-400" /> Mis tarjetas</h3>
      {isLoading ? <Loader2 className="h-5 w-5 animate-spin text-white/50" /> : !cards || cards.length === 0 ? (
        <p className="text-subhead text-white/60">Aún no tienes tarjetas guardadas. Al pagar una entrada o una recarga, marca «Guardar esta tarjeta» y la próxima vez solo te pedirá el código de seguridad.</p>
      ) : (
        <ul className="space-y-2">
          {cards.map((c) => (
            <li key={c.id} className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.04] p-3">
              {c.thumbnail ? <img src={c.thumbnail} alt="" className="h-6 w-9 shrink-0 rounded object-contain" /> : <CreditCard className="h-5 w-5 shrink-0 text-white/60" />}
              <div className="min-w-0 flex-1">
                <p className="truncate text-subhead font-semibold">{c.brandName} •••• {c.last4}</p>
                <p className="text-caption2 text-white/60">{c.expiry ? `Vence ${c.expiry}` : ''}{c.isDefault ? ' · Principal' : ''}</p>
              </div>
              {!c.isDefault && (
                <button type="button" onClick={() => setDefault.mutate({ cardId: c.id })} disabled={setDefault.isPending} aria-label="Usar como principal" className="grid h-9 w-9 place-items-center rounded-full bg-white/10"><Star className="h-4 w-4" /></button>
              )}
              {confirmId === c.id ? (
                <button type="button" onClick={() => remove.mutate({ cardId: c.id })} disabled={remove.isPending} className="h-9 rounded-full bg-rose-500/80 px-3 text-caption1 font-bold">Eliminar</button>
              ) : (
                <button type="button" onClick={() => setConfirmId(c.id)} aria-label="Eliminar tarjeta" className="grid h-9 w-9 place-items-center rounded-full bg-white/10 text-rose-300"><Trash2 className="h-4 w-4" /></button>
              )}
            </li>
          ))}
        </ul>
      )}
      <p className="text-caption2 text-white/60">Tus tarjetas las guarda Mercado Pago de forma segura; nosotros nunca vemos el número.</p>
    </section>
  );
}
