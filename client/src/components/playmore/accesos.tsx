import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'wouter';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ArrowRight, Minus, Plus, Ticket, X } from 'lucide-react';
import {
  ACCESO_GROUPS, buyHrefFor, groupOf, type AccesoGroupKey, type PlaymoreTanda, type PlaymoreTicketView,
} from '@shared/playmoreTanda';
import { Eyebrow, clp, reveal, useCountdown } from './sections';
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
const MAX_QTY = 6;

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
          {tanda.soldPct != null && (
            <p className="playmore-sans text-2xl font-extrabold sm:text-3xl">Ya se vendió el <span className="playmore-gold tabular-nums">{tanda.soldPct}%</span> de esta tanda</p>
          )}
          {tanda.salesEnd && (
            <div className="mt-5">
              <p className="mb-3 text-[11px] font-semibold tracking-[0.35em] text-[var(--pm-sand)]/80">EL PRECIO SUBE EN</p>
              <PriceRiseCountdown iso={tanda.salesEnd} />
            </div>
          )}
          {tanda.soldPct != null && (
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

// ── ¿Con quién vienes? ──────────────────────────────────────────────────────

/** N siluetas que se superponen (cabeza + torso), en dorado si está elegido. */
function Silhouettes({ n, active }: { n: number; active: boolean }) {
  const w = 22 + (n - 1) * 14;
  return (
    <svg viewBox={`0 0 ${w} 30`} className="h-9 w-auto" aria-hidden="true">
      {Array.from({ length: n }).map((_, i) => {
        const x = 11 + i * 14;
        return (
          <g key={i} fill={active ? 'url(#pm-sil-gold)' : 'rgba(233,217,176,0.45)'} stroke="#0c0908" strokeWidth="1.2">
            <circle cx={x} cy={8} r={5.2} />
            <path d={`M${x - 9.5} 30 C${x - 9.5} 19 ${x - 6} 15 ${x} 15 C${x + 6} 15 ${x + 9.5} 19 ${x + 9.5} 30 Z`} />
          </g>
        );
      })}
      <defs>
        <linearGradient id="pm-sil-gold" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f7e7a8" /><stop offset="1" stopColor="#c99a3e" />
        </linearGradient>
      </defs>
    </svg>
  );
}

function WhoPicker({ groups, value, onChange, fromPrice }: {
  groups: (typeof ACCESO_GROUPS)[number][];
  value: AccesoGroupKey | null;
  onChange: (g: AccesoGroupKey | null) => void;
  fromPrice: (g: AccesoGroupKey) => number | null;
}) {
  return (
    <motion.div {...reveal} className="mb-10 text-center">
      <p className="mb-5 text-[11px] font-semibold tracking-[0.4em] text-[var(--pm-sand)]/80">¿CON QUIÉN VIENES?</p>
      <div className="mx-auto grid max-w-3xl grid-cols-2 gap-3 sm:grid-cols-4" role="radiogroup" aria-label="Con quién vienes">
        {groups.map((g) => {
          const on = value === g.key;
          const pp = fromPrice(g.key);
          return (
            <button key={g.key} type="button" role="radio" aria-checked={on} onClick={() => onChange(on ? null : g.key)}
              className={`group relative flex flex-col items-center gap-2 rounded-2xl border px-3 py-4 transition ${on ? 'border-[#d6b25e] bg-[#d6b25e]/10 shadow-[0_0_40px_-10px_rgba(247,231,168,0.6)]' : 'border-white/10 bg-white/[0.03] hover:border-[#d6b25e]/50'}`}>
              <motion.span animate={on ? { y: [0, -4, 0] } : { y: 0 }} transition={{ duration: 0.5 }}><Silhouettes n={g.people} active={on} /></motion.span>
              <span className={`text-sm font-bold ${on ? 'playmore-gold' : 'text-[var(--pm-cream)]'}`}>{g.label}</span>
              {pp != null && <span className="text-[11px] tabular-nums text-[var(--pm-sand)]/70">desde {clp(pp)} c/u</span>}
            </button>
          );
        })}
      </div>
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
          <p className="mt-3 flex items-baseline gap-2">
            <span className={`text-3xl font-extrabold tabular-nums ${soldout ? 'text-white/40 line-through' : 'playmore-gold'}`}>{t.price > 0 ? clp(t.price) : 'Gratis'}</span>
            {t.originalPrice != null && t.originalPrice > t.price && !soldout && <span className="text-sm text-white/40 line-through tabular-nums">{clp(t.originalPrice)}</span>}
          </p>
          {people > 1 && t.price > 0 && !soldout && <p className="mt-1 text-[11px] tabular-nums text-[var(--pm-sand)]/60">{clp(Math.round(t.price / people))} por persona</p>}
          <div className="mt-4 border-t border-dashed border-[#d6b25e]/20 pt-3">
            <p className="text-[9px] tracking-[0.35em] text-[var(--pm-sand)]/50">A NOMBRE DE</p>
            <AnimatePresence mode="wait">
              <motion.p key={holder || '-'} initial={{ opacity: 0, y: 4, filter: 'blur(4px)' }} animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }} exit={{ opacity: 0 }} transition={{ duration: 0.35 }}
                className={`playmore-serif truncate text-xl italic ${holder ? 'playmore-gold' : 'text-white/25'}`}>
                {holder || 'tu nombre'}
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

function BuySheet({ t, holder, eventName, buyHref, onClose }: {
  t: PlaymoreTicketView; holder: string; eventName: string; buyHref: string; onClose: () => void;
}) {
  const [, navigate] = useLocation();
  const [qty, setQty] = useState(1);
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [onClose]);
  const go = () => navigate(buyHrefFor(buyHref, t, { qty, nombre: holder }));
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
        {holder && <p className="playmore-serif playmore-gold mt-1 text-lg italic">a nombre de {holder}</p>}
        <div className="mt-6 flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <span className="text-sm text-[var(--pm-sand)]/80">Cantidad</span>
          <div className="flex items-center gap-4">
            <button type="button" aria-label="Menos" disabled={qty <= 1} onClick={() => setQty((q) => Math.max(1, q - 1))} className="grid h-10 w-10 place-items-center rounded-full border border-[#d6b25e]/40 disabled:opacity-30"><Minus className="h-4 w-4" /></button>
            <span className="playmore-sans w-6 text-center text-xl font-extrabold tabular-nums" aria-live="polite">{qty}</span>
            <button type="button" aria-label="Más" disabled={qty >= MAX_QTY} onClick={() => setQty((q) => Math.min(MAX_QTY, q + 1))} className="grid h-10 w-10 place-items-center rounded-full border border-[#d6b25e]/40 disabled:opacity-30"><Plus className="h-4 w-4" /></button>
          </div>
        </div>
        <div className="mt-5 flex items-end justify-between">
          <span className="text-xs tracking-[0.3em] text-[var(--pm-sand)]/70">TOTAL</span>
          <span className="playmore-sans playmore-gold text-3xl font-extrabold tabular-nums">{clp(t.price * qty)}</span>
        </div>
        <button type="button" onClick={go}
          className="group relative mt-6 flex h-14 w-full items-center justify-center gap-3 overflow-hidden rounded-full text-sm font-bold tracking-[0.25em] text-[#141210] shadow-[0_18px_50px_-12px_rgba(247,231,168,0.55)]"
          style={{ background: 'var(--pm-gold)' }}>
          IR A PAGAR <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
        </button>
        <p className="mt-3 text-center text-[11px] text-[var(--pm-sand)]/50">Pago seguro · tu entrada con QR llega al correo</p>
      </motion.div>
    </motion.div>
  );
}

// ── Sección ─────────────────────────────────────────────────────────────────

export function Accesos({ types, buyHref, eventName, tanda, initialGroup }: {
  types: PlaymoreTicketView[]; buyHref: string | null; eventName: string; tanda: PlaymoreTanda | null; initialGroup?: AccesoGroupKey | null;
}) {
  const [group, setGroup] = useState<AccesoGroupKey | null>(initialGroup ?? null);
  const [holder, setHolder] = useState(readName);
  const [sheet, setSheet] = useState<PlaymoreTicketView | null>(null);
  useEffect(() => { try { sessionStorage.setItem(NAME_KEY, holder); } catch { /* sin almacenamiento */ } }, [holder]);

  const accesos = types.filter((t) => t.category === 'acceso');
  const extras = types.filter((t) => t.category !== 'acceso');
  const groups = useMemo(() => ACCESO_GROUPS.filter((g) => accesos.some((t) => groupOf(t.accesoSlug)?.key === g.key)), [accesos]);
  const fromPrice = (key: AccesoGroupKey) => {
    const ps = accesos.filter((t) => groupOf(t.accesoSlug)?.key === key && t.status === 'active' && t.price > 0)
      .map((t) => Math.round(t.price / (groupOf(t.accesoSlug)?.people ?? 1)));
    return ps.length ? Math.min(...ps) : null;
  };
  // El grupo elegido va primero; los demás quedan atenuados.
  const ordered = group ? [...accesos].sort((a, b) => Number(groupOf(b.accesoSlug)?.key === group) - Number(groupOf(a.accesoSlug)?.key === group)) : accesos;

  if (types.length === 0) return null;
  return (
    <section className="mx-auto max-w-6xl px-5 py-24 sm:py-32" id="accesos">
      <motion.div {...reveal} className="mb-12 text-center">
        <Eyebrow>Accesos</Eyebrow>
        <h2 className="playmore-sans text-4xl font-extrabold tracking-[-0.03em] sm:text-6xl">Elige tu <span className="playmore-gold">ticket</span></h2>
        <p className="playmore-serif mt-4 text-xl italic text-[var(--pm-cream)]/70">El precio sube con cada tanda.</p>
      </motion.div>
      {tanda && <TandaPanel tanda={tanda} />}
      {groups.length > 1 && <WhoPicker groups={groups} value={group} onChange={setGroup} fromPrice={fromPrice} />}

      {accesos.length > 0 && (
        <motion.div {...reveal} className="mx-auto mb-10 max-w-md text-center">
          <label htmlFor="pm-holder" className="text-[11px] font-semibold tracking-[0.4em] text-[var(--pm-sand)]/80">TU NOMBRE EN EL TICKET</label>
          <input id="pm-holder" value={holder} onChange={(e) => setHolder(e.target.value.slice(0, 40))} placeholder="Escríbelo y míralo impreso" autoComplete="given-name"
            className="playmore-serif mt-3 w-full border-b border-[#d6b25e]/40 bg-transparent pb-2 text-center text-2xl italic text-[var(--pm-sand)] outline-none transition placeholder:text-white/25 focus:border-[#f7e7a8]" />
        </motion.div>
      )}

      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {ordered.map((t, i) => (
          <TearTicket key={t.id} t={t} index={i} eventName={eventName} holder={holder.trim()} canBuy={!!buyHref}
            dimmed={!!group && groupOf(t.accesoSlug)?.key !== group} onTear={setSheet} />
        ))}
      </div>
      {accesos.length > 0 && buyHref && <p className="mt-5 text-center text-xs tracking-[0.2em] text-[var(--pm-sand)]/60">ARRASTRA O TOCA EL TALÓN PARA ENTRAR</p>}
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
        {sheet && buyHref && <BuySheet key={sheet.id} t={sheet} holder={holder.trim()} eventName={eventName} buyHref={buyHref} onClose={() => setSheet(null)} />}
      </AnimatePresence>
    </section>
  );
}

/** Botón flotante de compra: un ticket dorado con perforación que aparece al bajar,
 * alterna el precio y la cuenta regresiva, y según dónde estés hace lo más útil:
 * lejos de los accesos te lleva a elegir ticket; dentro de ellos, directo a pagar.
 * Sin evento activado solo se muestra en la vista previa del dueño. */
export function FloatingBuy({ href, tanda, preview }: {
  href: string | null; tanda: PlaymoreTanda | null; preview: boolean;
}) {
  const reduce = useReducedMotion();
  const [, navigate] = useLocation();
  const [scrolled, setScrolled] = useState(false);
  const [inAccesos, setInAccesos] = useState(false);
  const [showCount, setShowCount] = useState(false);
  const rise = tanda && !tanda.soldOut ? tanda.salesEnd : null;
  const soldOut = !!tanda?.soldOut;

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 160);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  useEffect(() => {
    const el = document.getElementById('accesos');
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([e]) => setInAccesos(e.isIntersecting), { threshold: 0.12 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  // Cada 3,5 s la segunda línea alterna entre la invitación y el tiempo que queda.
  useEffect(() => {
    if (!rise) return;
    const t = window.setInterval(() => setShowCount((v) => !v), 3500);
    return () => window.clearInterval(t);
  }, [rise]);

  if ((!href && !preview) || soldOut) return null;
  const goPay = inAccesos && !!href;
  const label = goPay ? 'IR A PAGAR' : 'COMPRAR ENTRADA';
  const onClick = () => {
    if (goPay && href) { navigate(href); return; }
    document.getElementById('accesos')?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
  };
  const sub = rise && showCount
    ? <>EL PRECIO SUBE EN <PriceRiseCountdown iso={rise} compact /></>
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
              <button type="button" onClick={onClick} aria-label={label}
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
