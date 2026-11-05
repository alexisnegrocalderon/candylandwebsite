import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'wouter';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ArrowRight, Ticket, X } from 'lucide-react';
import {
  ACCESO_GROUPS, buyHrefFor, communityNote, groupOf, type AccesoGroupKey, type PlaymoreTanda, type PlaymoreTicketView,
} from '@shared/playmoreTanda';
import { Eyebrow, clp, reveal, useCountdown } from './sections';
import { WhoGuide } from './WhoGuide';
import { whoByKey, type WhoKey } from '@shared/playmoreWho';
import { playRip } from './playmoreAudio';

/* Accesos de PLAYMORE: comprar como parte de la noche.
 *
 * 1. "¿Con quién vienes?": siluetas que iluminan los tickets de esa cantidad
 *    de personas (con el precio por persona).
 * 2. "Tu nombre en el ticket": lo que escribes se imprime en dorado en cada
 *    ticket, y llega ya puesto al checkout.
 * 3. Se arranca el talón y sube una hoja negra y oro con la cantidad; de ahí
 *    directo al pago con el acceso elegido.
 * La tanda (lo vendido y cuándo sube el precio) va arriba, siempre en %. */

const NAME_KEY = 'playmore.ticket-name';

function readName(): string {
  try { return sessionStorage.getItem(NAME_KEY) ?? ''; } catch { return ''; }
}

// ── Cuenta regresiva y tanda ────────────────────────────────────────────────

/** Cuenta regresiva a que suba el precio (se monta solo si hay un cierre futuro). */
export function PriceRiseCountdown({ iso, compact = false }: { iso: string; compact?: boolean }) {
  const c = useCountdown(iso);
  if (c.over) return null;
  const units: [number, string][] = [[c.days, 'DÍAS'], [c.hours, 'HRS'], [c.minutes, 'MIN'], [c.seconds, 'SEG']];
  if (compact) {
    return (
      <span className="tabular-nums" aria-label="Tiempo para que suba el precio">
        {c.days > 0 && `${c.days}d `}{String(c.hours).padStart(2, '0')}h {String(c.minutes).padStart(2, '0')}m {String(c.seconds).padStart(2, '0')}s
      </span>
    );
  }
  return (
    <div className="flex items-center justify-center gap-2 sm:gap-3" role="timer" aria-label="Tiempo para que suba el precio">
      {units.map(([v, label], i) => (
        <div key={label} className="flex items-center gap-2 sm:gap-3">
          <div className="min-w-[3.4rem] rounded-xl border border-[#d6b25e]/30 bg-black/40 px-2 py-2 text-center">
            <p className="playmore-sans playmore-gold text-2xl font-extrabold tabular-nums leading-none sm:text-3xl">{String(v).padStart(2, '0')}</p>
            <p className="mt-1 text-[9px] font-semibold tracking-[0.3em] text-[var(--pm-sand)]/70">{label}</p>
          </div>
          {i < units.length - 1 && <span className="text-[#d6b25e]/50">:</span>}
        </div>
      ))}
    </div>
  );
}

function TandaPanel({ tanda }: { tanda: PlaymoreTanda }) {
  return (
    <motion.div {...reveal} className="mx-auto mb-14 max-w-3xl rounded-3xl border border-[#d6b25e]/35 bg-[radial-gradient(120%_100%_at_50%_0%,rgba(150,21,157,0.28),transparent_65%),#0c0908] p-6 text-center sm:p-8">
      <p className="mb-3 inline-flex items-center gap-2 text-[11px] font-semibold tracking-[0.4em] text-[var(--pm-fuchsia)]">
        <span className="h-2 w-2 animate-pulse rounded-full bg-[var(--pm-fuchsia)]" aria-hidden="true" /> TANDA ACTUAL
      </p>
      {tanda.soldOut ? (
        <p className="playmore-sans text-2xl font-extrabold sm:text-3xl" role="status">Se agotó esta tanda · pronto la siguiente</p>
      ) : (
        <>
          {tanda.soldPct != null && tanda.soldPct >= 10 ? (
            <p className="playmore-sans text-2xl font-extrabold sm:text-3xl">Ya se vendió el <span className="playmore-gold tabular-nums">{tanda.soldPct}%</span> de esta tanda</p>
          ) : (
            <p className="playmore-sans text-2xl font-extrabold sm:text-3xl">La primera tanda <span className="playmore-gold">está abierta</span></p>
          )}
          {tanda.salesEnd && (
            <div className="mt-5">
              <p className="mb-3 text-[11px] font-semibold tracking-[0.35em] text-[var(--pm-sand)]/80">EL PRECIO SUBE EN</p>
              <PriceRiseCountdown iso={tanda.salesEnd} />
            </div>
          )}
          {tanda.soldPct != null && tanda.soldPct >= 10 && (
            <div className="mt-6" role="progressbar" aria-valuenow={tanda.soldPct} aria-valuemin={0} aria-valuemax={100} aria-label="Cupo vendido de la tanda">
              <div className="h-3 overflow-hidden rounded-full bg-white/10">
                <motion.div initial={{ width: 0 }} whileInView={{ width: `${tanda.soldPct}%` }} viewport={{ once: true }} transition={{ duration: 1.4, ease: [0.22, 1, 0.36, 1] }}
                  className="h-full rounded-full bg-gradient-to-r from-[#7a5a22] via-[#f7e7a8] to-[#E477EA]" />
              </div>
              <p className="mt-2 text-xs tracking-[0.2em] text-[var(--pm-sand)]/70">{Math.max(0, 100 - tanda.soldPct)}% DISPONIBLE</p>
            </div>
          )}
        </>
      )}
    </motion.div>
  );
}

// ── Ticket con talón ────────────────────────────────────────────────────────

function TearTicket({ t, eventName, holder, index, dimmed, canBuy, onTear }: {
  t: PlaymoreTicketView; eventName: string; holder: string; index: number; dimmed: boolean; canBuy: boolean; onTear: (t: PlaymoreTicketView) => void;
}) {
  const reduce = useReducedMotion();
  const [torn, setTorn] = useState(false);
  const soldout = t.status === 'soldout' || !t.hasStock;
  const buyable = canBuy && !soldout;
  const tear = () => {
    if (!buyable || torn) return;
    setTorn(true);
    playRip();
    window.setTimeout(() => onTear(t), reduce ? 0 : 420);
    // El talón vuelve a su lugar detrás de la hoja (por si cierra y elige otro).
    window.setTimeout(() => setTorn(false), 1100);
  };
  const people = groupOf(t.accesoSlug)?.people ?? 1;
  return (
    <motion.div {...reveal} transition={{ ...reveal.transition, delay: index * 0.06 }}>
      <motion.div animate={{ opacity: dimmed ? 0.35 : 1, scale: dimmed ? 0.97 : 1 }} transition={{ duration: 0.35 }}
        className={`playmore-ticket-card relative flex rounded-2xl ${soldout ? 'opacity-60' : ''}`}>
        <div className="min-w-0 flex-1 p-6">
          <p className="text-[10px] font-semibold tracking-[0.4em] text-[var(--pm-orchid)]">{eventName}</p>
          <p className="mt-2 text-lg font-bold leading-tight">{t.name}</p>
          {communityNote(t.accesoSlug) && <p className="mt-0.5 text-[10px] font-semibold tracking-[0.12em] text-[var(--pm-orchid)]">{communityNote(t.accesoSlug)}</p>}
          <p className="mt-3 flex items-baseline gap-2">
            <span className={`text-3xl font-extrabold tabular-nums ${soldout ? 'text-white/40 line-through' : 'playmore-gold'}`}>{t.price > 0 ? clp(t.price) : 'Gratis'}</span>
            {t.originalPrice != null && t.originalPrice > t.price && !soldout && <span className="text-sm text-white/40 line-through tabular-nums">{clp(t.originalPrice)}</span>}
          </p>
          {people > 1 && t.price > 0 && !soldout && <p className="mt-1 text-[11px] tabular-nums text-[var(--pm-sand)]/60">{clp(Math.round(t.price / people))} por persona</p>}
          <div className="mt-4 border-t border-dashed border-[#d6b25e]/20 pt-3">
            <p className="text-[9px] tracking-[0.35em] text-[var(--pm-sand)]/50">A NOMBRE DE</p>
            <AnimatePresence mode="wait">
              <motion.p key={holder || '-'} initial={{ opacity: 0, y: 4, filter: 'blur(4px)' }} animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }} exit={{ opacity: 0 }} transition={{ duration: 0.35 }}
                className={`playmore-sans truncate text-lg font-bold tracking-[0.12em] ${holder ? 'playmore-gold' : 'text-white/25'}`}>
                {holder || 'TU NOMBRE'}
              </motion.p>
            </AnimatePresence>
          </div>
        </div>
        <motion.button
          type="button"
          disabled={!buyable}
          onClick={tear}
          aria-label={buyable ? `Comprar ${t.name}` : `${t.name} agotado`}
          drag={buyable && !reduce ? 'x' : false}
          dragConstraints={{ left: 0, right: 0 }}
          dragElastic={{ left: 0, right: 0.7 }}
          onDragEnd={(_, info) => { if (info.offset.x > 45) tear(); }}
          animate={torn ? { x: 150, rotate: 16, opacity: 0 } : { x: 0, rotate: 0, opacity: 1 }}
          transition={{ duration: 0.45, ease: [0.5, 0, 0.2, 1] }}
          className={`flex w-[92px] shrink-0 touch-pan-y items-center justify-center rounded-r-2xl border-l border-dashed border-[#d6b25e]/35 ${buyable ? 'cursor-grab bg-[#d6b25e]/5 hover:bg-[#d6b25e]/10 active:cursor-grabbing' : 'cursor-default'}`}>
          <span className="rotate-90 whitespace-nowrap text-[11px] font-bold tracking-[0.3em] text-[var(--pm-sand)]">
            {soldout ? 'AGOTADO' : <>ARRANCA <span aria-hidden="true">→</span></>}
          </span>
        </motion.button>
      </motion.div>
    </motion.div>
  );
}

// ── Hoja de compra ──────────────────────────────────────────────────────────

function BuySheet({ t, holder, eventName, buyHref, demo, early, quien, onClose }: {
  t: PlaymoreTicketView; holder: string; eventName: string; buyHref: string; demo: boolean; early: boolean; quien?: string | null; onClose: () => void;
}) {
  const [, navigate] = useLocation();
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [onClose]);
  const go = () => { if (buyHref) navigate(buyHrefFor(buyHref, t, { qty: 1, nombre: holder, quien })); };
  return (
    <motion.div className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <button type="button" aria-label="Cerrar" className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} tabIndex={-1} />
      <motion.div role="dialog" aria-modal="true" aria-label={`Comprar ${t.name}`}
        initial={{ y: 60, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 60, opacity: 0 }} transition={{ type: 'spring', damping: 26, stiffness: 260 }}
        className="relative w-full max-w-md rounded-t-[2rem] border border-[#d6b25e]/40 bg-[radial-gradient(120%_70%_at_50%_0%,rgba(150,21,157,0.35),transparent_60%),#0c0908] p-6 pb-[max(env(safe-area-inset-bottom),1.5rem)] text-[var(--pm-cream)] sm:rounded-[2rem]">
        <div className="mx-auto mb-5 h-1 w-10 rounded-full bg-white/20 sm:hidden" aria-hidden="true" />
        <button ref={closeRef} type="button" onClick={onClose} aria-label="Cerrar" className="absolute right-4 top-4 grid h-9 w-9 place-items-center rounded-full border border-white/15 text-white/70 hover:bg-white/5"><X className="h-4 w-4" /></button>
        <p className="text-[10px] font-semibold tracking-[0.4em] text-[var(--pm-orchid)]">{eventName}</p>
        <p className="playmore-sans mt-2 text-2xl font-extrabold">{t.name}</p>
        {holder && <p className="playmore-sans playmore-gold mt-1 text-sm font-bold tracking-[0.18em]">A NOMBRE DE {holder}</p>}
        <p className="mt-5 rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-center text-[11px] font-semibold leading-relaxed tracking-[0.18em] text-[var(--pm-sand)]/80">ENTRADA NOMINATIVA: UN ACCESO POR COMPRA, CON LOS DATOS DE QUIEN ASISTE.</p>
        <div className="mt-5 flex items-end justify-between">
          <span className="text-xs tracking-[0.3em] text-[var(--pm-sand)]/70">TOTAL</span>
          <span className="playmore-sans playmore-gold text-3xl font-extrabold tabular-nums">{clp(t.price)}</span>
        </div>
        <button type="button" onClick={go} disabled={!buyHref}
          className="group relative mt-6 flex h-14 w-full items-center justify-center gap-3 overflow-hidden rounded-full px-4 text-center text-[12px] font-bold tracking-[0.2em] text-[#141210] shadow-[0_18px_50px_-12px_rgba(247,231,168,0.55)] disabled:cursor-not-allowed disabled:opacity-70 sm:text-sm sm:tracking-[0.25em]"
          style={{ background: 'var(--pm-gold)' }}>
          {demo ? (early ? 'VER CÓMO SE COMPRA' : 'IR AL PAGO · VISTA PREVIA') : <>IR A PAGAR <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" /></>}
        </button>
        <p className="mt-3 text-center text-[11px] text-[var(--pm-sand)]/50">Pago seguro · tu entrada con QR llega al correo</p>
      </motion.div>
    </motion.div>
  );
}

// ── Sección ─────────────────────────────────────────────────────────────────

export interface AccesosDiag { eventLinked: boolean; accesos: number; hidden: number; blockedByPresale: number }

export function Accesos({ types, buyHref, flowHref = null, eventName, tanda, initialGroup, preview = false, early = false, diag = null }: {
  types: PlaymoreTicketView[]; buyHref: string | null; flowHref?: string | null; eventName: string; tanda: PlaymoreTanda | null; initialGroup?: AccesoGroupKey | null; preview?: boolean; early?: boolean; diag?: AccesosDiag | null;
}) {
  const [group, setGroup] = useState<AccesoGroupKey | null>(initialGroup ?? null);
  const [who, setWho] = useState<WhoKey | null>(null);
  const [holder, setHolder] = useState(readName);
  const [sheet, setSheet] = useState<PlaymoreTicketView | null>(null);
  useEffect(() => { try { sessionStorage.setItem(NAME_KEY, holder); } catch { /* sin almacenamiento */ } }, [holder]);

  const accesos = types.filter((t) => t.category === 'acceso');
  const extras = types.filter((t) => t.category !== 'acceso');
  const groups = useMemo(() => ACCESO_GROUPS.filter((g) => accesos.some((t) => groupOf(t.accesoSlug)?.key === g.key)), [accesos]);
  // Lo que eligió en «¿Con quién vienes?» va primero; los demás quedan atenuados. Sin eso, el grupo de la invitación.
  const whoSlug = who ? whoByKey(who)?.slug ?? null : null;
  const isMine = (t: PlaymoreTicketView) => whoSlug ? t.accesoSlug === whoSlug : !!group && groupOf(t.accesoSlug)?.key === group;
  const ordered = whoSlug || group ? [...accesos].sort((a, b) => Number(isMine(b)) - Number(isMine(a))) : accesos;

  // Vista previa del dueño: los tickets se ven completos y se puede recorrer la compra, pero el pago
  // recién se abre al activar el evento (el servidor igual rechaza órdenes antes).
  const demo = !buyHref && (preview || early);
  if (types.length === 0) {
    if (!preview) return null;
    // Le decimos al dueño exactamente por qué no aparece ningún acceso.
    const why = !diag ? 'TODAVÍA NO HAY ACCESOS PARA MOSTRAR.'
      : !diag.eventLinked ? 'LA CO-PRODUCCIÓN NO TIENE UN EVENTO ENLAZADO. EN CONFIGURACIÓN → "EVENTO ENLAZADO", ELIGE EL EVENTO Y GUARDA.'
      : diag.accesos === 0 ? 'EL EVENTO ENLAZADO NO TIENE ACCESOS (TIPOS DE ENTRADA). CRÉALOS EN EL EVENTO.'
      : diag.hidden >= diag.accesos ? `EL EVENTO TIENE ${diag.accesos} ACCESO(S) PERO TODOS ESTÁN OCULTOS. CÁMBIALOS A "ACTIVO" EN EL EVENTO.`
      : diag.blockedByPresale > 0 ? 'LOS ACCESOS ESTÁN BLOQUEADOS POR LA REGLA "SOLO ENTRADA Y ESTACIONAMIENTO" DEL EVENTO.'
      : 'NO ENCONTRÉ ACCESOS VISIBLES EN EL EVENTO ENLAZADO.';
    return (
      <section className="mx-auto max-w-3xl px-5 py-24 text-center" id="accesos">
        <Eyebrow>Accesos</Eyebrow>
        <h2 className="playmore-sans text-3xl font-extrabold tracking-[0.06em] sm:text-4xl">AQUÍ APARECEN TUS <span className="playmore-gold">TICKETS</span></h2>
        <p className="mx-auto mt-5 max-w-md rounded-2xl border border-amber-400/40 bg-amber-400/10 p-5 text-sm leading-relaxed text-amber-100">
          VISTA PREVIA: {why}
        </p>
      </section>
    );
  }
  return (
    <section className="mx-auto max-w-6xl px-5 py-24 sm:py-32" id="accesos">
      <motion.div {...reveal} className="mb-12 text-center">
        <Eyebrow>Accesos</Eyebrow>
        <h2 className="playmore-sans text-4xl font-extrabold tracking-[-0.03em] sm:text-6xl">Elige tu <span className="playmore-gold">ticket</span></h2>
        <p className="playmore-sans mt-4 text-xs font-semibold tracking-[0.3em] text-[var(--pm-cream)]/70 sm:text-sm">El precio sube con cada tanda.</p>
      </motion.div>
      {demo && (
        <p className={`mx-auto mb-8 max-w-xl rounded-2xl border px-4 py-3 text-center text-xs font-semibold leading-relaxed tracking-[0.12em] ${early ? 'border-[#d6b25e]/40 bg-[#d6b25e]/10 text-[var(--pm-sand)]' : 'border-amber-400/40 bg-amber-400/10 text-amber-100'}`}>
          {early ? 'LA COMPRA SE ABRE MUY PRONTO. ARRANCA UN TALÓN Y MIRA CÓMO SE COMPRA.' : 'VISTA PREVIA: ASÍ SE COMPRA. ARRANCA UN TALÓN Y RECORRE EL PROCESO; EL PAGO SE ABRE AL ACTIVAR EL EVENTO.'}
        </p>
      )}
      {tanda && <TandaPanel tanda={tanda} />}
      {groups.length > 1 && (
        <motion.div {...reveal} className="mx-auto mb-10 max-w-md">
          <p className="mb-5 text-center text-[11px] font-semibold tracking-[0.4em] text-[var(--pm-sand)]/80">¿CON QUIÉN VIENES?</p>
          <WhoGuide types={accesos} value={who} onPick={(o) => { setWho(o.key); setGroup(groupOf(o.slug)?.key ?? null); }} />
        </motion.div>
      )}

      {accesos.length > 0 && (
        <motion.div {...reveal} className="mx-auto mb-10 max-w-md text-center">
          <label htmlFor="pm-holder" className="text-[11px] font-semibold tracking-[0.4em] text-[var(--pm-sand)]/80">TU NOMBRE EN EL TICKET</label>
          <input id="pm-holder" value={holder} onChange={(e) => setHolder(e.target.value.slice(0, 40))} placeholder="ESCRIBE TU NOMBRE" autoComplete="given-name"
            className="playmore-sans mt-3 w-full border-b border-[#d6b25e]/40 bg-transparent pb-2 text-center text-xl font-bold tracking-[0.18em] text-[var(--pm-sand)] outline-none transition placeholder:text-white/25 focus:border-[#f7e7a8]" />
        </motion.div>
      )}

      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {ordered.map((t, i) => (
          <TearTicket key={t.id} t={t} index={i} eventName={eventName} holder={holder.trim()} canBuy={!!buyHref || demo}
            dimmed={(!!whoSlug || !!group) && !isMine(t)} onTear={setSheet} />
        ))}
      </div>
      {accesos.length > 0 && (buyHref || demo) && <p className="mt-5 text-center text-xs tracking-[0.2em] text-[var(--pm-sand)]/60">ARRASTRA O TOCA EL TALÓN PARA ENTRAR</p>}
      {extras.length > 0 && (
        <motion.div {...reveal} className="mx-auto mt-10 max-w-3xl rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <p className="mb-3 text-center text-[11px] font-semibold tracking-[0.4em] text-[var(--pm-orchid)]">SUMA A TU NOCHE</p>
          <ul className="flex flex-wrap items-center justify-center gap-x-8 gap-y-2">
            {extras.map((t) => (
              <li key={t.id} className="text-sm text-[var(--pm-cream)]/85">
                {t.name} <span className="playmore-gold ml-1 font-bold tabular-nums">{t.price > 0 ? clp(t.price) : 'Gratis'}</span>
                {t.status === 'soldout' && <span className="ml-2 text-xs text-white/40">agotado</span>}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-center text-[11px] text-[var(--pm-sand)]/50">Se agregan en el pago.</p>
        </motion.div>
      )}
      <AnimatePresence>
        {sheet && (buyHref || demo) && <BuySheet key={sheet.id} t={sheet} quien={who && whoByKey(who)?.slug === sheet.accesoSlug ? who : null} holder={holder.trim()} eventName={eventName} buyHref={buyHref ?? flowHref ?? ''} demo={demo} early={early} onClose={() => setSheet(null)} />}
      </AnimatePresence>
    </section>
  );
}

/** Botón flotante de compra: un ticket dorado con perforación que aparece al bajar y
 * alterna la invitación con la cuenta regresiva. Al tocarlo abre al instante el selector
 * de tickets (TicketPicker), sin bajar por la página. Sin evento activado solo se muestra
 * en la vista previa del dueño o con los tickets a la vista. */
export function FloatingBuy({ href, tanda, preview, onOpen }: {
  href: string | null; tanda: PlaymoreTanda | null; preview: boolean; onOpen: () => void;
}) {
  const reduce = useReducedMotion();
  const [scrolled, setScrolled] = useState(false);
  const [showCount, setShowCount] = useState(false);
  const rise = tanda && !tanda.soldOut ? tanda.salesEnd : null;
  const soldOut = !!tanda?.soldOut;

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 160);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  // Cada 3,5 s la segunda línea alterna entre la invitación y el tiempo que queda.
  useEffect(() => {
    if (!rise) return;
    const t = window.setInterval(() => setShowCount((v) => !v), 3500);
    return () => window.clearInterval(t);
  }, [rise]);

  if ((!href && !preview) || soldOut) return null;
  const label = 'COMPRAR ENTRADA';
  const sub = rise && showCount
    ? <>SUBE EN <PriceRiseCountdown iso={rise} compact /></>
    : <>ELIGE TU ACCESO</>;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-3 pb-[max(env(safe-area-inset-bottom),0.9rem)] sm:justify-end sm:px-6 sm:pb-6">
      <AnimatePresence>
        {scrolled && (
          <motion.div
            initial={{ y: 90, opacity: 0, scale: 0.9 }} animate={{ y: 0, opacity: 1, scale: 1 }} exit={{ y: 90, opacity: 0 }}
            transition={{ type: 'spring', damping: 20, stiffness: 240 }}
            className="pointer-events-auto relative w-full max-w-[340px] sm:w-[330px]">
            {/* Onda que invita a tocar */}
            {!reduce && <span className="pm-fab-ring" aria-hidden="true" />}
            <div className={reduce ? '' : 'pm-fab'}>
              <button type="button" onClick={onOpen} aria-label={label}
                className="pm-fab-body group flex h-[64px] w-full items-stretch text-left text-[#141210] transition-transform active:scale-[0.97]">
                <span className="flex min-w-0 flex-1 flex-col justify-center pl-7 pr-3">
                  <span className="flex items-center gap-2 text-[13px] font-extrabold tracking-[0.22em]">
                    <Ticket className="h-4 w-4 shrink-0" aria-hidden="true" /> {label}
                  </span>
                  <AnimatePresence mode="wait" initial={false}>
                    <motion.span key={String(showCount && !!rise)} initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }} transition={{ duration: 0.25 }}
                      className="mt-0.5 block truncate text-[10.5px] font-bold tracking-[0.18em] opacity-75">{sub}</motion.span>
                  </AnimatePresence>
                </span>
                <span className="pm-fab-stub flex w-[70px] shrink-0 items-center justify-center">
                  <span className="grid h-9 w-9 place-items-center rounded-full bg-[#141210] text-[#f7e7a8] shadow-[0_0_0_3px_rgba(20,18,16,0.15)] transition-transform group-hover:translate-x-0.5">
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </span>
                </span>
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
