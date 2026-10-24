import { useEffect, useMemo, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Check, Copy, Gift, RefreshCw, Sparkles, Ticket as TicketIcon } from 'lucide-react';
import type { inferRouterOutputs } from '@trpc/server';
import type { AppRouter } from '../../../../server/routers';
import { trpc } from '@/lib/trpc';
import { STAMPS_PER_CARD, type StampSlot } from '@shared/stampCard';

/* Pestaña «Sellos» de la app: la tarjeta tipo pasaporte (1 sello de regalo +
 * 1 por cada fiesta a la que entró; 6 = un Acceso Dúo gratis), el premio
 * ganado con su código y el historial de fiestas. Las reglas viven en
 * shared/stampCard.ts y los datos en server/stampCard.ts. */

export type StampData = NonNullable<inferRouterOutputs<AppRouter>['member']['stamps']>;

const tap = () => { try { navigator.vibrate?.(8); } catch { /* sin vibración */ } };
const SEEN_KEY = 'sellos.vistos';

const fmtShort = (d: Date | string | null) => (d ? new Date(d).toLocaleDateString('es-CL', { day: 'numeric', month: 'short' }) : '');
const fmtLong = (d: Date | string | null) => (d ? new Date(d).toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' }) : '');

/** Una inclinación fija por casilla: los sellos se ven estampados a mano, no alineados. */
const TILT = [-8, 6, -4, 9, -6, 4];

function StampMark({ slot, index, fresh }: { slot: StampSlot; index: number; fresh: boolean }) {
  const reduce = useReducedMotion();
  const last = index === STAMPS_PER_CARD - 1;
  if (slot.kind === 'vacio') {
    return (
      <div className="flex flex-col items-center gap-1.5">
        <div className={`grid h-[74px] w-[74px] place-items-center rounded-full border-2 border-dashed ${last ? 'border-amber-300/60 bg-amber-300/[0.06]' : 'border-white/20'}`}>
          {last ? <Gift className="h-6 w-6 text-amber-200/80" /> : <span className="text-title3 font-semibold text-white/40">{index + 1}</span>}
        </div>
        <span className="h-4 text-caption2 text-white/60">{last ? 'Dúo gratis' : ' '}</span>
      </div>
    );
  }
  const gift = slot.kind === 'regalo';
  return (
    <div className="flex flex-col items-center gap-1.5">
      <motion.div
        initial={fresh && !reduce ? { scale: 1.9, opacity: 0, rotate: TILT[index] - 25 } : false}
        animate={{ scale: 1, opacity: 1, rotate: TILT[index] }}
        transition={{ type: 'spring', damping: 11, stiffness: 190, delay: fresh ? 0.25 + index * 0.06 : 0 }}
        className={`relative grid h-[74px] w-[74px] place-items-center rounded-full ${gift ? 'bg-gradient-to-br from-amber-200 via-amber-300 to-orange-300' : 'bg-gradient-to-br from-pink-500 via-fuchsia-500 to-sky-500'} shadow-[inset_0_1px_0_rgba(255,255,255,0.45),0_10px_24px_-8px_rgba(236,72,153,0.55)]`}
      >
        <div className="absolute inset-[5px] rounded-full border-[1.5px] border-dashed border-white/55" />
        <img src="/candyland/logo-isotipo-transparent.png" alt="" className="h-9 w-9 drop-shadow" />
      </motion.div>
      <span className="h-4 max-w-[86px] truncate text-caption2 font-medium text-white/70">
        {gift ? 'Regalo' : fmtShort(slot.visit.date) || slot.visit.title}
      </span>
    </div>
  );
}

function RewardCard({ code, eventTitle, buySlug }: { code: string; eventTitle: string | null; buySlug: string | null }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    tap();
    void navigator.clipboard.writeText(code).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1800); }).catch(() => {});
  };
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative overflow-hidden rounded-[26px] bg-gradient-to-br from-amber-200 via-amber-300 to-orange-300 p-5 text-[#2a1606] shadow-[0_18px_40px_-16px_rgba(251,191,36,0.6)]"
    >
      <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-white/30 blur-2xl" />
      <p className="flex items-center gap-1.5 text-caption2 font-bold uppercase tracking-[0.18em] text-[#2a1606]/70"><Sparkles className="h-3.5 w-3.5" /> Premio desbloqueado</p>
      <p className="mt-1 text-title2 font-bold leading-tight">Acceso Dúo gratis</p>
      {eventTitle && <p className="mt-0.5 text-footnote text-[#2a1606]/70">Completaste tu tarjeta en {eventTitle}.</p>}
      <button type="button" onClick={copy} className="mt-4 flex w-full items-center justify-between rounded-2xl bg-white/45 px-4 py-3 text-left interactive">
        <span>
          <span className="block text-caption2 text-[#2a1606]/60">{copied ? '¡Copiado!' : 'Tu código (escríbelo al comprar)'}</span>
          <span className="block font-mono text-body font-bold tracking-wide">{code}</span>
        </span>
        {copied ? <Check className="h-5 w-5" /> : <Copy className="h-5 w-5" />}
      </button>
      {buySlug && (
        <a href={`/checkout/${buySlug}?code=${encodeURIComponent(code)}`} onClick={tap} className="mt-2.5 flex h-12 items-center justify-center gap-2 rounded-full bg-[#2a1606] text-subhead font-bold text-amber-100 interactive">
          <TicketIcon className="h-4 w-4" /> Usarlo en mi próxima fiesta
        </a>
      )}
    </motion.div>
  );
}

export function StampCardView({ data, buySlug }: { data: StampData; buySlug: string | null }) {
  // Los sellos que todavía no había visto aparecen estampándose.
  const total = data.completedCards * STAMPS_PER_CARD + data.filled;
  const [seen] = useState(() => { try { return Number(localStorage.getItem(SEEN_KEY) ?? -1); } catch { return total; } });
  const freshFrom = seen < 0 ? STAMPS_PER_CARD : seen - data.completedCards * STAMPS_PER_CARD;
  useEffect(() => {
    try { localStorage.setItem(SEEN_KEY, String(total)); } catch { /* sin almacenamiento */ }
    if (seen >= 0 && total > seen) window.setTimeout(tap, 350);
  }, [seen, total]);

  const available = data.rewards.filter((r) => r.available);
  const headline = data.remaining === 0 ? '¡Tarjeta completa!' : data.remaining === 1 ? 'Te falta 1 sello' : `Te faltan ${data.remaining} sellos`;

  return (
    <div className="space-y-4">
      {available.map((r) => <RewardCard key={r.code} code={r.code} eventTitle={r.eventTitle} buySlug={buySlug} />)}

      <div className="account-glass rounded-[28px] p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-caption2 font-semibold uppercase tracking-[0.2em] text-pink-300">Tarjeta de sellos{data.completedCards > 0 ? ` · ${data.completedCards + 1}ª` : ''}</p>
            <p className="mt-1 text-title2 font-bold leading-tight">{headline}</p>
            <p className="mt-0.5 text-footnote text-white/60">
              {data.remaining === 0 ? 'Tu Acceso Dúo gratis ya está listo.' : 'para tu Acceso Dúo gratis. Cada fiesta a la que entras suma un sello.'}
            </p>
          </div>
          <span className="num-apple shrink-0 text-large-title leading-none">{data.filled}<span className="text-white/45">/{STAMPS_PER_CARD}</span></span>
        </div>
        <div className="mt-5 grid grid-cols-3 gap-x-2 gap-y-4">
          {data.slots.map((slot, i) => <StampMark key={i} slot={slot} index={i} fresh={i >= freshFrom && slot.kind !== 'vacio'} />)}
        </div>
      </div>

      <StampHistory history={data.history} />
    </div>
  );
}

function StampHistory({ history }: { history: StampData['history'] }) {
  return (
    <div className="account-glass rounded-[28px] p-5">
      <p className="text-body font-bold">Tus fiestas</p>
      {history.length === 0 ? (
        <p className="mt-1 text-footnote text-white/60">Cuando te escaneen en la puerta, tu fiesta aparece acá con su sello.</p>
      ) : (
        <ol className="mt-3">
          {history.map((h, i) => (
            <li key={h.eventId} className="relative flex gap-3 pb-4 last:pb-0">
              {i < history.length - 1 && <span className="absolute left-[11px] top-6 h-[calc(100%-12px)] w-px bg-white/15" />}
              <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-gradient-to-br from-pink-500 to-sky-500"><Check className="h-3.5 w-3.5 text-white" /></span>
              <span className="min-w-0">
                <span className="block truncate text-subhead font-semibold">{h.title}</span>
                <span className="block text-caption1 text-white/60">{fmtLong(h.date)} · sello ganado</span>
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

/** La pestaña completa: carga sus datos y muestra la tarjeta (o un esqueleto mientras carga). */
export function StampsTab({ buySlug }: { buySlug: string | null }) {
  const { data, isLoading, refetch, isFetching } = trpc.member.stamps.useQuery(undefined, { staleTime: 30_000, retry: false });
  const skeleton = useMemo(() => (
    <div className="account-glass h-[340px] animate-pulse rounded-[28px]" />
  ), []);
  if (isLoading) return skeleton;
  if (!data) {
    return (
      <div className="account-glass flex flex-col items-center gap-3 rounded-[28px] p-6 text-center">
        <p className="text-subhead text-white/70">No pudimos cargar tu tarjeta de sellos.</p>
        <button type="button" onClick={() => { void refetch(); }} disabled={isFetching} className="lg-pill inline-flex h-11 items-center gap-2 rounded-full px-5 text-subhead font-semibold disabled:opacity-60">
          <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} /> Reintentar
        </button>
      </div>
    );
  }
  return <StampCardView data={data} buySlug={buySlug} />;
}
