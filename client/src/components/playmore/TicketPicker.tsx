import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'wouter';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowRight, X } from 'lucide-react';
import { buyHrefFor, communityNote, groupOf, type PlaymoreTanda, type PlaymoreTicketView } from '@shared/playmoreTanda';
import { clp } from './sections';
import { WhoGuide } from './WhoGuide';
import { whoByKey, whoKeyFor, type WhoKey } from '@shared/playmoreWho';

/* Selector de tickets de PLAYMORE: se abre al instante al tocar "Comprar entrada"
 * (sin bajar por la página). Muestra todos los accesos como boletos con
 * perforación, deja uno ya elegido, y abajo siempre están el total y el botón de
 * pagar. Es la misma idea de la app de Playroom: todas las opciones a la vista,
 * pero con la cara de PLAYMORE. */

const NAME_KEY = 'playmore.ticket-name';

function readName(): string {
  try { return sessionStorage.getItem(NAME_KEY) ?? ''; } catch { return ''; }
}

export function TicketPicker({ open, onClose, types, buyHref, flowHref = null, eventName, tanda, demo, early }: {
  open: boolean;
  onClose: () => void;
  types: PlaymoreTicketView[];
  buyHref: string | null;
  /** Evento sin activar: el checkout en vista previa (dueño con link) o con los tickets a la vista. */
  flowHref?: string | null;
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
  // La opción de «¿Con quién vienes?» (pareja, dos hombres…): el acceso solo no la distingue (el dúo sirve para las dos).
  const [whoKey, setWhoKey] = useState<WhoKey | null>(null);
  const [holder, setHolder] = useState('');
  const closeRef = useRef<HTMLButtonElement>(null);

  // Al abrir: el acceso destacado de la tanda queda elegido, para pagar en un toque.
  useEffect(() => {
    if (!open) return;
    const first = tanda?.featured && tanda.featured.status !== 'soldout' ? tanda.featured : accesos.find((t) => t.status === 'active' && t.hasStock);
    setSelId(first?.id ?? null);
    setWhoKey(whoKeyFor(first?.accesoSlug));
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
  const total = sel ? sel.price : 0;
  const people = sel ? (groupOf(sel.accesoSlug)?.people ?? 1) : 0;
  const setName = (v: string) => { setHolder(v); try { sessionStorage.setItem(NAME_KEY, v); } catch { /* sin almacenamiento */ } };
  const pay = () => {
    const target = buyHref ?? flowHref;
    if (!sel || !target) return;
    onClose();
    navigate(buyHrefFor(target, sel, { qty: 1, nombre: holder.trim(), quien: whoKey }));
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
              <p className="mb-3 text-[10.5px] font-semibold leading-relaxed tracking-[0.18em] text-[var(--pm-sand)]/70">ENTRADA NOMINATIVA: UN ACCESO POR COMPRA, CON LOS DATOS DE QUIEN ASISTE.</p>
              {accesos.length === 0
                ? <p className="py-8 text-center text-sm text-[var(--pm-sand)]/70">TODAVÍA NO HAY ACCESOS DISPONIBLES.</p>
                : <WhoGuide types={accesos} value={whoKey} onPick={(o) => { if (o.key !== whoKey) { setSelId(o.type.id); setWhoKey(o.key); try { navigator.vibrate?.(8); } catch { /* sin vibración */ } } }} />}

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
                  {sel ? `${whoByKey(whoKey)?.label ?? sel.name}${people > 1 ? ` · ${people} PERSONAS` : ''}` : 'ELIGE UN ACCESO'}
                </span>
                <span className="playmore-sans playmore-gold text-3xl font-extrabold tabular-nums">{clp(total)}</span>
              </div>
              <button type="button" onClick={pay} disabled={!sel || !(buyHref ?? flowHref)}
                className="group relative flex h-14 w-full items-center justify-center gap-3 overflow-hidden rounded-full px-4 text-center text-[12px] font-bold tracking-[0.2em] text-[#141210] shadow-[0_18px_50px_-12px_rgba(247,231,168,0.55)] disabled:cursor-not-allowed disabled:opacity-70 sm:text-sm sm:tracking-[0.25em]"
                style={{ background: 'var(--pm-gold)' }}>
                {demo ? (early ? 'VER CÓMO SE COMPRA' : 'IR AL PAGO · VISTA PREVIA') : <>IR A PAGAR <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" /></>}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
