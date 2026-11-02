import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'wouter';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowRight, Check, Minus, Plus, Ticket, X } from 'lucide-react';
import { buyHrefFor, groupOf, type PlaymoreTanda, type PlaymoreTicketView } from '@shared/playmoreTanda';
import { clp } from './sections';

/* Selector de tickets de PLAYMORE: se abre al instante al tocar "Comprar entrada"
 * (sin bajar por la página). Muestra todos los accesos como boletos con
 * perforación, deja uno ya elegido, y abajo siempre están el total y el botón de
 * pagar. Es la misma idea de la app de Playroom: todas las opciones a la vista,
 * pero con la cara de PLAYMORE. */

const NAME_KEY = 'playmore.ticket-name';
const MAX_QTY = 6;

function readName(): string {
  try { return sessionStorage.getItem(NAME_KEY) ?? ''; } catch { return ''; }
}

export function TicketPicker({ open, onClose, types, buyHref, eventName, tanda, demo, early }: {
  open: boolean;
  onClose: () => void;
  types: PlaymoreTicketView[];
  buyHref: string | null;
  eventName: string;
  tanda: PlaymoreTanda | null;
  /** Sin compra habilitada (vista previa o "mostrar tickets antes de lanzar"). */
  demo: boolean;
  early: boolean;
}) {
  const [, navigate] = useLocation();
  const accesos = useMemo(() => types.filter((t) => t.category === 'acceso'), [types]);
  const extras = useMemo(() => types.filter((t) => t.category !== 'acceso' && t.status !== 'soldout'), [types]);
  const [selId, setSelId] = useState<number | null>(null);
  const [qty, setQty] = useState(1);
  const [holder, setHolder] = useState('');
  const closeRef = useRef<HTMLButtonElement>(null);

  // Al abrir: el acceso destacado de la tanda queda elegido, para pagar en un toque.
  useEffect(() => {
    if (!open) return;
    const first = tanda?.featured && tanda.featured.status !== 'soldout' ? tanda.featured : accesos.find((t) => t.status === 'active' && t.hasStock);
    setSelId(first?.id ?? null);
    setQty(1);
    setHolder(readName());
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
    // Solo al abrir.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const sel = accesos.find((t) => t.id === selId) ?? null;
  const total = sel ? sel.price * qty : 0;
  const people = sel ? (groupOf(sel.accesoSlug)?.people ?? 1) * qty : 0;
  const pick = (t: PlaymoreTicketView) => {
    if (t.status === 'soldout' || !t.hasStock) return;
    if (t.id !== selId) { setSelId(t.id); setQty(1); try { navigator.vibrate?.(8); } catch { /* sin vibración */ } }
  };
  const setName = (v: string) => { setHolder(v); try { sessionStorage.setItem(NAME_KEY, v); } catch { /* sin almacenamiento */ } };
  const pay = () => {
    if (!sel || demo || !buyHref) return;
    onClose();
    navigate(buyHrefFor(buyHref, sel, { qty, nombre: holder.trim() }));
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
          <button type="button" aria-label="Cerrar" tabIndex={-1} onClick={onClose} className="absolute inset-0 bg-black/75 backdrop-blur-sm" />
          <motion.div role="dialog" aria-modal="true" aria-label="Elige tu ticket"
            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', damping: 30, stiffness: 340 }}
            drag="y" dragConstraints={{ top: 0, bottom: 0 }} dragElastic={{ top: 0, bottom: 0.6 }}
            onDragEnd={(_, info) => { if (info.offset.y > 110 || info.velocity.y > 600) onClose(); }}
            className="playmore relative flex max-h-[92dvh] w-full max-w-lg flex-col rounded-t-[2rem] border border-[#d6b25e]/40 bg-[radial-gradient(120%_60%_at_50%_0%,rgba(150,21,157,0.35),transparent_60%),#0c0908] text-[var(--pm-cream)] sm:max-h-[88dvh] sm:rounded-[2rem]">
            <div className="mx-auto mt-3 h-1 w-10 shrink-0 rounded-full bg-white/25" aria-hidden="true" />
            <div className="flex shrink-0 items-start justify-between gap-3 px-5 pb-3 pt-3">
              <div>
                <p className="text-[10px] font-semibold tracking-[0.4em] text-[var(--pm-orchid)]">{eventName}</p>
                <h2 className="playmore-sans mt-1 text-2xl font-extrabold tracking-[0.06em]">ELIGE TU <span className="playmore-gold">TICKET</span></h2>
              </div>
              <button ref={closeRef} type="button" onClick={onClose} aria-label="Cerrar" className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-white/15 text-white/70 hover:bg-white/5"><X className="h-4 w-4" /></button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-4" role="radiogroup" aria-label="Accesos">
              {tanda && !tanda.soldOut && (
                <p className="mb-3 flex items-center gap-2 text-[10.5px] font-semibold tracking-[0.2em] text-[var(--pm-sand)]/80">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-[var(--pm-fuchsia)]" aria-hidden="true" />
                  {tanda.soldPct != null && tanda.soldPct >= 10 ? `TANDA ACTUAL · ${tanda.soldPct}% VENDIDO` : 'PRIMERA TANDA ABIERTA'}
                </p>
              )}
              <div className="space-y-3">
                {accesos.map((t) => {
                  const soldout = t.status === 'soldout' || !t.hasStock;
                  const on = t.id === selId && !soldout;
                  const per = groupOf(t.accesoSlug)?.people ?? 1;
                  return (
                    <div key={t.id}>
                      <button type="button" role="radio" aria-checked={on} disabled={soldout} onClick={() => pick(t)}
                        className={`playmore-ticket-card relative flex w-full rounded-2xl text-left transition active:scale-[0.99] ${on ? 'ring-2 ring-[#f7e7a8] shadow-[0_0_34px_-6px_rgba(247,231,168,0.55)]' : soldout ? 'opacity-50' : 'hover:border-[#d6b25e]/70'}`}>
                        <span className="min-w-0 flex-1 p-4 pr-3">
                          <span className="block text-[10px] font-semibold tracking-[0.35em] text-[var(--pm-orchid)]">{eventName}</span>
                          <span className="mt-1 block text-base font-extrabold leading-tight tracking-[0.04em]">{t.name}</span>
                          <span className="mt-2 flex items-baseline gap-2">
                            <span className={`text-2xl font-extrabold tabular-nums ${soldout ? 'text-white/40 line-through' : 'playmore-gold'}`}>{t.price > 0 ? clp(t.price) : 'Gratis'}</span>
                            {t.originalPrice != null && t.originalPrice > t.price && !soldout && <span className="text-xs text-white/40 line-through tabular-nums">{clp(t.originalPrice)}</span>}
                          </span>
                          {per > 1 && t.price > 0 && !soldout && <span className="mt-0.5 block text-[10.5px] tabular-nums text-[var(--pm-sand)]/60">{clp(Math.round(t.price / per))} por persona · {per} personas</span>}
                        </span>
                        <span className="flex w-[74px] shrink-0 items-center justify-center rounded-r-2xl border-l border-dashed border-[#d6b25e]/35 bg-[#d6b25e]/5">
                          {soldout ? (
                            <span className="rotate-90 whitespace-nowrap text-[10px] font-bold tracking-[0.3em] text-[var(--pm-sand)]">AGOTADO</span>
                          ) : (
                            <span className={`grid h-9 w-9 place-items-center rounded-full border transition ${on ? 'border-[#f7e7a8] bg-[#d6b25e] text-[#141210]' : 'border-[#d6b25e]/50 text-[#d6b25e]'}`}>
                              {on ? <Check className="h-4 w-4" aria-hidden="true" /> : <Ticket className="h-4 w-4" aria-hidden="true" />}
                            </span>
                          )}
                        </span>
                      </button>
                      <AnimatePresence initial={false}>
                        {on && (
                          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
                            <div className="mx-3 flex items-center justify-between rounded-b-2xl border border-t-0 border-[#d6b25e]/30 bg-white/[0.03] px-4 py-3">
                              <span className="text-[11px] font-semibold tracking-[0.25em] text-[var(--pm-sand)]/80">CANTIDAD</span>
                              <div className="flex items-center gap-4">
                                <button type="button" aria-label="Menos" disabled={qty <= 1} onClick={() => setQty((q) => Math.max(1, q - 1))} className="grid h-9 w-9 place-items-center rounded-full border border-[#d6b25e]/40 disabled:opacity-30"><Minus className="h-4 w-4" /></button>
                                <span className="playmore-sans w-5 text-center text-lg font-extrabold tabular-nums" aria-live="polite">{qty}</span>
                                <button type="button" aria-label="Más" disabled={qty >= MAX_QTY} onClick={() => setQty((q) => Math.min(MAX_QTY, q + 1))} className="grid h-9 w-9 place-items-center rounded-full border border-[#d6b25e]/40 disabled:opacity-30"><Plus className="h-4 w-4" /></button>
                              </div>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  );
                })}
                {accesos.length === 0 && <p className="py-8 text-center text-sm text-[var(--pm-sand)]/70">TODAVÍA NO HAY ACCESOS DISPONIBLES.</p>}
              </div>

              {extras.length > 0 && (
                <p className="mt-4 text-center text-[11px] leading-relaxed tracking-[0.12em] text-[var(--pm-sand)]/70">
                  SE SUMAN EN EL PAGO: {extras.map((e, i) => <span key={e.id}>{i > 0 && ' · '}{e.name} <span className="playmore-gold font-bold tabular-nums">{e.price > 0 ? clp(e.price) : ''}</span></span>)}
                </p>
              )}

              <label className="mt-5 block text-center">
                <span className="text-[10px] font-semibold tracking-[0.4em] text-[var(--pm-sand)]/70">TU NOMBRE EN EL TICKET (OPCIONAL)</span>
                <input value={holder} onChange={(e) => setName(e.target.value.slice(0, 40))} placeholder="ESCRIBE TU NOMBRE" autoComplete="given-name"
                  className="playmore-sans mt-2 w-full border-b border-[#d6b25e]/40 bg-transparent pb-2 text-center text-base font-bold tracking-[0.16em] text-[var(--pm-sand)] outline-none placeholder:text-white/25 focus:border-[#f7e7a8]" />
              </label>
            </div>

            {/* Pie fijo: total y pagar, siempre a la vista. */}
            <div className="shrink-0 border-t border-[#d6b25e]/25 bg-black/60 px-5 pb-[max(env(safe-area-inset-bottom),1rem)] pt-3 backdrop-blur">
              <div className="mb-3 flex items-end justify-between">
                <span className="text-[11px] font-semibold tracking-[0.3em] text-[var(--pm-sand)]/70">
                  {sel ? `${qty} × ${sel.name}${people > 1 ? ` · ${people} PERSONAS` : ''}` : 'ELIGE UN ACCESO'}
                </span>
                <span className="playmore-sans playmore-gold text-3xl font-extrabold tabular-nums">{clp(total)}</span>
              </div>
              <button type="button" onClick={pay} disabled={!sel || demo || !buyHref}
                className="group relative flex h-14 w-full items-center justify-center gap-3 overflow-hidden rounded-full px-4 text-center text-[12px] font-bold tracking-[0.2em] text-[#141210] shadow-[0_18px_50px_-12px_rgba(247,231,168,0.55)] disabled:cursor-not-allowed disabled:opacity-70 sm:text-sm sm:tracking-[0.25em]"
                style={{ background: 'var(--pm-gold)' }}>
                {demo ? (early ? 'LA COMPRA SE ABRE MUY PRONTO' : 'VISTA PREVIA · EL PAGO SE ABRE AL ACTIVAR') : <>IR A PAGAR <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" /></>}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
