import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'wouter';
import { motion, useScroll, useTransform } from 'framer-motion';
import { ArrowRight, CalendarDays, ChevronDown, Instagram, MapPin, Sparkles } from 'lucide-react';
import type { CoproductionLanding } from '@shared/coproduction';
import { CANDYLAND } from '@/config/candyland';
import { ParticleTitle } from './ParticleTitle';
import { COLAB_MIN_AGE } from '@shared/coproduction';

/* Secciones de la landing PLAYMORE (Playroom × Dalmore). Paleta y fuentes en
 * ./playmore.css. Todo el contenido sale de `landing` (editable desde
 * Configuración en el panel). */

export const clp = (n: number) => `$${Math.round(n).toLocaleString('es-CL')}`;
export const DALMORE_INSTAGRAM = 'https://instagram.com/dalmore.pro';
/** Logo de Dalmore para fondo negro (cuernos oro, letras crema). Se usan
 * mientras no se suba otro logo en Configuración. */
export const DALMORE_MARK = '/playmore/dalmore-mark.png';
export const DALMORE_LOGO = '/playmore/dalmore-logo.png';

export const reveal = {
  initial: { opacity: 0, y: 28 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: '-80px' },
  transition: { duration: 0.8, ease: [0.22, 1, 0.36, 1] },
} as const;


// ── Utilidades ─────────────────────────────────────────────────────────────

export function useCountdown(iso: string) {
  const target = Date.parse(iso);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  const diff = Math.max(0, (Number.isFinite(target) ? target : now) - now);
  return {
    days: Math.floor(diff / 86_400_000),
    hours: Math.floor(diff / 3_600_000) % 24,
    minutes: Math.floor(diff / 60_000) % 60,
    seconds: Math.floor(diff / 1000) % 60,
    over: diff === 0,
  };
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return <p className="mb-4 text-[11px] font-semibold uppercase tracking-[0.45em] text-[var(--pm-orchid)]">{children}</p>;
}

/** Logo de la otra productora; sin logo, monograma dorado + nombre espaciado. */
export function PartnerMark({ logoUrl, name, className = '', imgClassName }: { logoUrl: string; name: string; className?: string; imgClassName?: string }) {
  if (logoUrl) return <img src={logoUrl} alt={name} className={`object-contain ${imgClassName ?? className}`} />;
  return (
    <span className={`flex flex-col items-center justify-center ${className}`}>
      <span className="playmore-serif playmore-gold text-[1em] italic leading-none">{name.trim()[0]?.toUpperCase() ?? 'D'}</span>
    </span>
  );
}

export function BuyButton({ href, onClick, children, className = '' }: { href?: string; onClick?: () => void; children: ReactNode; className?: string }) {
  const cls = `group relative inline-flex h-14 max-w-full items-center justify-center gap-3 overflow-hidden whitespace-nowrap rounded-full px-6 text-[12.5px] font-bold tracking-[0.16em] text-[#141210] shadow-[0_18px_50px_-12px_rgba(247,231,168,0.55)] transition active:scale-[0.98] sm:px-9 sm:text-sm sm:tracking-[0.25em] ${className}`;
  const inner = (
    <>
      <span className="relative z-10">{children}</span>
      <ArrowRight className="relative z-10 h-4 w-4 transition-transform group-hover:translate-x-1" />
      <span className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/50 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
    </>
  );
  // Con onClick abre el selector de tickets al instante; con href navega.
  if (onClick) return <button type="button" onClick={onClick} className={cls} style={{ background: 'var(--pm-gold)' }}>{inner}</button>;
  return <Link href={href ?? '#'} className={cls} style={{ background: 'var(--pm-gold)' }}>{inner}</Link>;
}

// ── Hero ───────────────────────────────────────────────────────────────────

export function PlaymoreHero({ landing, partnerName, buyHref, preview, early = false, minPrice, onBuy }: {
  landing: CoproductionLanding; partnerName: string; buyHref: string | null; preview: boolean; early?: boolean; minPrice: number | null; onBuy?: () => void;
}) {
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end start'] });
  // Al bajar, los dos logos se acercan hasta fundirse en el centro.
  // En celular parten más juntos para que no se salgan de la pantalla.
  const spread = typeof window !== 'undefined' && window.innerWidth < 640 ? 36 : 90;
  const leftX = useTransform(scrollYProgress, [0, 0.45], [-spread, 0]);
  const rightX = useTransform(scrollYProgress, [0, 0.45], [spread, 0]);
  const crossOpacity = useTransform(scrollYProgress, [0, 0.35], [1, 0]);
  const fuseGlow = useTransform(scrollYProgress, [0.3, 0.5], [0, 1]);
  const bgY = useTransform(scrollYProgress, [0, 1], ['0%', '25%']);
  const count = useCountdown(landing.countdownIso);

  return (
    <section ref={ref} className="relative flex min-h-[100svh] flex-col items-center justify-center overflow-hidden px-5 pb-20 pt-24 text-center">
      <motion.div className="absolute inset-0" style={{ y: bgY }} aria-hidden="true">
        {landing.heroVideoUrl ? (
          <video className="h-full w-full object-cover opacity-60" src={landing.heroVideoUrl} poster={landing.heroImageUrl || undefined}
            autoPlay muted loop playsInline preload="metadata" />
        ) : landing.heroImageUrl ? (
          <img src={landing.heroImageUrl} alt="" className="h-full w-full object-cover opacity-50" />
        ) : (
          <div className="playmore-velvet h-full w-full" />
        )}
      </motion.div>
      <div className="playmore-beams pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_30%,rgba(12,9,8,0.85)_80%)]" aria-hidden="true" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-48 bg-gradient-to-b from-transparent to-[var(--pm-ink)]" aria-hidden="true" />
      <div className="playmore-grain pointer-events-none absolute inset-0" aria-hidden="true" />

      <div className="relative z-10 flex w-full max-w-5xl flex-col items-center">
        {/* Logos que se funden */}
        <div className="relative mb-8 flex h-24 items-center justify-center sm:h-28">
          <motion.div className="absolute h-36 w-36 rounded-full bg-[radial-gradient(circle,rgba(228,119,234,0.55),transparent_65%)] blur-xl" style={{ opacity: fuseGlow }} />
          <motion.img src="/playmore/playroom-logo.png" alt="Mansion Playroom" style={{ x: leftX }}
            className="relative h-16 w-auto max-w-[9.5rem] object-contain sm:h-20 sm:max-w-[12rem]" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 1, delay: 0.2 }} />
          <motion.span style={{ opacity: crossOpacity }} className="playmore-serif relative mx-2 text-3xl italic text-[var(--pm-sand)]">×</motion.span>
          <motion.div style={{ x: rightX }} className="relative" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 1, delay: 0.35 }}>
            <PartnerMark logoUrl={landing.partnerLogoUrl === DALMORE_MARK ? DALMORE_LOGO : landing.partnerLogoUrl} name={partnerName} className="h-20 w-20 text-[5.5rem] sm:h-24 sm:w-24 sm:text-[6.5rem]" imgClassName="h-16 w-auto max-w-[9.5rem] sm:h-24 sm:max-w-[12rem]" />
          </motion.div>
        </div>

        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5, duration: 1 }}
          className="mb-5 text-[11px] font-semibold tracking-[0.5em] text-[var(--pm-sand)]/80 sm:text-xs">
          PLAYROOM <span className="text-[var(--pm-orchid)]">×</span> {partnerName.toUpperCase()} {preview && <span className="ml-2 text-amber-300">· VISTA PREVIA</span>}
        </motion.p>

        {/* El nombre hecho de partículas doradas: llegan, forman la palabra y reaccionan al cursor o al dedo. */}
        <ParticleTitle text={landing.eventName} />

        <motion.p initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.4, duration: 0.9 }}
          className="playmore-sans mt-6 max-w-2xl text-sm font-semibold tracking-[0.3em] text-[var(--pm-cream)]/90 sm:text-lg">
          Una noche. Dos mundos. Ninguna igual.
        </motion.p>

        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.6, duration: 0.9 }}
          className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs font-medium tracking-[0.2em] text-[var(--pm-sand)]/80 sm:text-sm">
          <span className="flex items-center gap-2"><CalendarDays className="h-4 w-4 text-[var(--pm-orchid)]" />{landing.dateText.toUpperCase()} · {landing.timeText}</span>
          <span className="flex items-center gap-2"><MapPin className="h-4 w-4 text-[var(--pm-orchid)]" />{landing.venueText.toUpperCase()}</span>
          <span className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-[var(--pm-orchid)]" />{landing.fusionText.toUpperCase()}</span>
        </motion.div>

        {/* Cuenta regresiva */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.8, duration: 0.9 }}
          className="mt-10 grid grid-cols-4 gap-2 sm:gap-4" role="timer" aria-label={`Faltan ${count.days} días`}>
          {([['días', count.days], ['horas', count.hours], ['min', count.minutes], ['seg', count.seconds]] as const).map(([label, v]) => (
            <div key={label} className="min-w-[68px] rounded-2xl border border-[#d6b25e]/30 bg-black/40 px-3 py-3 backdrop-blur-md sm:min-w-[96px] sm:px-5 sm:py-4">
              <div className="playmore-gold text-3xl font-bold tabular-nums sm:text-5xl">{String(v).padStart(2, '0')}</div>
              <div className="mt-1 text-[10px] tracking-[0.3em] text-[var(--pm-sand)]/70">{label.toUpperCase()}</div>
            </div>
          ))}
        </motion.div>

        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 2.1, duration: 0.9 }} className="mt-8 flex w-full max-w-[calc(100vw-2.5rem)] justify-center sm:mt-10 sm:max-w-none">
          {buyHref ? (
            <BuyButton href={buyHref} onClick={onBuy}>COMPRAR ENTRADAS</BuyButton>
          ) : preview || early ? (
            <a href="#accesos" onClick={(e) => { if (onBuy) { e.preventDefault(); onBuy(); } }}
              className="inline-flex h-14 max-w-full items-center justify-center gap-2.5 rounded-full px-6 text-center text-[11px] font-bold leading-tight tracking-[0.18em] text-[#141210] shadow-[0_18px_50px_-12px_rgba(247,231,168,0.55)] transition active:scale-[0.98] sm:gap-3 sm:px-8 sm:text-xs sm:tracking-[0.2em]" style={{ background: 'var(--pm-gold)' }}>
              <span>VER LOS TICKETS<span className="hidden sm:inline"> · {early ? 'COMPRA MUY PRONTO' : 'PAGO AL ACTIVAR'}</span></span>
              <ArrowRight className="h-4 w-4 shrink-0" />
            </a>
          ) : (
            <div className="flex w-full flex-col items-center gap-3 sm:w-auto sm:flex-row">
              <span className="text-center text-[11px] tracking-[0.22em] text-[var(--pm-sand)]/80 sm:text-xs sm:tracking-[0.3em]">ENTRADAS MUY PRONTO · ENTÉRATE PRIMERO</span>
              <div className="flex flex-wrap justify-center gap-2">
                <a href={CANDYLAND.redes.instagram} target="_blank" rel="noreferrer" className="inline-flex h-11 items-center gap-2 rounded-full border border-[#d6b25e]/40 px-4 text-[11px] font-semibold tracking-[0.12em] sm:px-5 sm:text-xs sm:tracking-[0.15em] hover:bg-white/5"><Instagram className="h-4 w-4" /> PLAYROOM</a>
                <a href={DALMORE_INSTAGRAM} target="_blank" rel="noreferrer" className="inline-flex h-11 items-center gap-2 rounded-full border border-[#d6b25e]/40 px-4 text-[11px] font-semibold tracking-[0.12em] sm:px-5 sm:text-xs sm:tracking-[0.15em] hover:bg-white/5"><Instagram className="h-4 w-4" /> {partnerName.toUpperCase()}</a>
              </div>
            </div>
          )}
        </motion.div>
      </div>
      <ChevronDown className="absolute bottom-6 h-6 w-6 animate-bounce text-[var(--pm-sand)]/50" aria-hidden="true" />
    </section>
  );
}

// ── Dos mundos, una noche ──────────────────────────────────────────────────

// ── Lo esencial de la noche ────────────────────────────────────────────────

/** Una franja liviana tras la portada: las ideas de la noche y el dress code en una línea. */
export function QuickFacts({ landing }: { landing: CoproductionLanding }) {
  const items = landing.highlights.slice(0, 4);
  if (items.length === 0 && !landing.dressCode) return null;
  return (
    <section className="mx-auto max-w-5xl px-5 py-14 sm:py-20">
      {items.length > 0 && (
        <motion.ul {...reveal} className="grid grid-cols-2 gap-x-6 gap-y-7 sm:grid-cols-4">
          {items.map((h, i) => (
            <li key={h} className="text-center">
              <span className="playmore-serif playmore-gold text-3xl italic">{String(i + 1).padStart(2, '0')}</span>
              <p className="mt-2 text-[13px] leading-snug text-[var(--pm-cream)]/80 sm:text-sm">{h}</p>
            </li>
          ))}
        </motion.ul>
      )}
      {landing.dressCode && (
        <motion.p {...reveal} className="mx-auto mt-10 max-w-3xl text-center text-[var(--pm-cream)]/75">
          <span className="mr-3 text-[11px] font-semibold tracking-[0.4em] text-[var(--pm-orchid)]">DRESS CODE</span>
          <span className="playmore-sans text-sm font-semibold tracking-[0.12em] sm:text-base">{landing.dressCode}</span>
        </motion.p>
      )}
    </section>
  );
}

// ── Galería ────────────────────────────────────────────────────────────────

export function Gallery({ urls }: { urls: string[] }) {
  if (urls.length === 0) return null;
  return (
    <section className="px-5 pb-24">
      <div className="mx-auto grid max-w-6xl auto-rows-[180px] grid-cols-2 gap-3 sm:auto-rows-[260px] md:grid-cols-4">
        {urls.map((u, i) => (
          <motion.img key={u} {...reveal} src={u} alt="" loading="lazy"
            className={`h-full w-full rounded-3xl object-cover ${i % 5 === 0 ? 'col-span-2 row-span-2' : ''}`} />
        ))}
      </div>
    </section>
  );
}

// ── Accesos ────────────────────────────────────────────────────────────────

// ── Código de la noche + FAQ ───────────────────────────────────────────────

export function CodeAndFaq({ landing, eventName }: { landing: CoproductionLanding; eventName: string }) {
  return (
    <section className="relative overflow-hidden py-24 sm:py-32">
      <div className="pointer-events-none absolute -right-32 top-10 h-96 w-96 rounded-full bg-[var(--pm-orchid)]/15 blur-[120px]" aria-hidden="true" />
      <div className="mx-auto grid max-w-6xl gap-14 px-5 lg:grid-cols-2">
        {landing.rules.length > 0 && (
          <motion.div {...reveal}>
            <Eyebrow>El código {eventName}</Eyebrow>
            <h2 className="playmore-sans mb-8 text-2xl font-extrabold leading-tight tracking-[0.06em] sm:text-4xl">Lo que pasa adentro, se cuida adentro.</h2>
            <ol className="space-y-5">
              {landing.rules.map((r, i) => (
                <li key={r} className="flex gap-5 border-b border-white/10 pb-5">
                  <span className="playmore-serif playmore-gold w-10 shrink-0 text-3xl italic">{String(i + 1).padStart(2, '0')}</span>
                  <span className="pt-1.5 text-[var(--pm-cream)]/85">{r}</span>
                </li>
              ))}
            </ol>
          </motion.div>
        )}
        {landing.faq.length > 0 && (
          <motion.div {...reveal}>
            <Eyebrow>Preguntas frecuentes</Eyebrow>
            <h2 className="playmore-sans mb-8 text-4xl font-extrabold tracking-[-0.03em] sm:text-5xl">Todo claro<span className="text-[var(--pm-orchid)]">.</span></h2>
            <div className="space-y-3">
              {landing.faq.map((f) => (
                <details key={f.q} className="group rounded-2xl border border-white/10 bg-white/[0.03] p-5 open:border-[#d6b25e]/40 open:bg-white/[0.05]">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 font-semibold">
                    {f.q}<ChevronDown className="h-5 w-5 shrink-0 text-[var(--pm-sand)] transition-transform group-open:rotate-180" />
                  </summary>
                  <p className="mt-3 leading-relaxed text-[var(--pm-cream)]/75">{f.a}</p>
                </details>
              ))}
            </div>
          </motion.div>
        )}
      </div>
    </section>
  );
}

// ── Pie ────────────────────────────────────────────────────────────────────

export function PlaymoreFooter({ landing, partnerName }: { landing: CoproductionLanding; partnerName: string }) {
  return (
    <footer className="relative border-t border-[#d6b25e]/15 px-5 pb-28 pt-14 text-center sm:pb-14">
      <div className="mb-6 flex items-center justify-center gap-4">
        <img src="/candyland/logo-isotipo-transparent.png" alt="Playroom" className="h-12 w-12 object-contain" />
        <span className="playmore-serif text-2xl italic text-[var(--pm-sand)]">×</span>
        <PartnerMark logoUrl={landing.partnerLogoUrl} name={partnerName} className="h-12 w-12 text-[3rem]" imgClassName="h-12 w-20" />
      </div>
      <p className="playmore-sans playmore-gold text-3xl font-extrabold tracking-[-0.02em]">{landing.eventName}</p>
      <p className="mt-2 text-xs tracking-[0.3em] text-[var(--pm-sand)]/70">{landing.dateText.toUpperCase()} · {landing.venueText.toUpperCase()} · SOLO +{COLAB_MIN_AGE}</p>
      <div className="mt-6 flex justify-center gap-3">
        <a href={CANDYLAND.redes.instagram} target="_blank" rel="noreferrer" className="inline-flex h-10 items-center gap-2 rounded-full border border-white/15 px-4 text-xs hover:bg-white/5"><Instagram className="h-4 w-4" /> Playroom</a>
        <a href={DALMORE_INSTAGRAM} target="_blank" rel="noreferrer" className="inline-flex h-10 items-center gap-2 rounded-full border border-white/15 px-4 text-xs hover:bg-white/5"><Instagram className="h-4 w-4" /> {partnerName}</a>
      </div>
      <Link href="/" className="mt-6 inline-block text-xs text-[var(--pm-sand)]/60 underline">mansionplayroom.cl</Link>
    </footer>
  );
}
