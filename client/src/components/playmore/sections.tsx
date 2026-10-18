import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'wouter';
import { motion, useScroll, useTransform } from 'framer-motion';
import { ArrowRight, CalendarDays, ChevronDown, Instagram, MapPin, Users } from 'lucide-react';
import type { CoproductionLanding } from '@shared/coproduction';
import { CANDYLAND } from '@/config/candyland';

/* Secciones de la landing PLAYMORE (Playroom × Dalmore). Paleta y fuentes en
 * ./playmore.css. Todo el contenido sale de `landing` (editable desde
 * Configuración en el panel). */

export const clp = (n: number) => `$${Math.round(n).toLocaleString('es-CL')}`;
export const DALMORE_INSTAGRAM = 'https://instagram.com/dalmore.pro';
/** Logo de Dalmore para fondo negro (cuernos oro, letras crema). Se usan
 * mientras no se suba otro logo en Configuración. */
export const DALMORE_MARK = '/playmore/dalmore-mark.png';
export const DALMORE_LOGO = '/playmore/dalmore-logo.png';

const reveal = {
  initial: { opacity: 0, y: 28 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: '-80px' },
  transition: { duration: 0.8, ease: [0.22, 1, 0.36, 1] },
} as const;

export interface TicketTypeView { id: number; name: string; price: number; status: string }

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

function Eyebrow({ children }: { children: ReactNode }) {
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

export function BuyButton({ href, children, className = '' }: { href: string; children: ReactNode; className?: string }) {
  return (
    <Link href={href}
      className={`group relative inline-flex h-14 items-center gap-3 overflow-hidden rounded-full px-9 text-sm font-bold tracking-[0.25em] text-[#141210] shadow-[0_18px_50px_-12px_rgba(247,231,168,0.55)] transition active:scale-[0.98] ${className}`}
      style={{ background: 'var(--pm-gold)' }}>
      <span className="relative z-10">{children}</span>
      <ArrowRight className="relative z-10 h-4 w-4 transition-transform group-hover:translate-x-1" />
      <span className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/50 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
    </Link>
  );
}

// ── Hero ───────────────────────────────────────────────────────────────────

export function PlaymoreHero({ landing, partnerName, buyHref, preview, minPrice }: {
  landing: CoproductionLanding; partnerName: string; buyHref: string | null; preview: boolean; minPrice: number | null;
}) {
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end start'] });
  // Al bajar, los dos logos se acercan hasta fundirse en el centro.
  const leftX = useTransform(scrollYProgress, [0, 0.45], [-90, 0]);
  const rightX = useTransform(scrollYProgress, [0, 0.45], [90, 0]);
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
          <motion.img src="/candyland/logo-isotipo-transparent.png" alt="Playroom" style={{ x: leftX }}
            className="relative h-20 w-20 object-contain sm:h-24 sm:w-24" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 1, delay: 0.2 }} />
          <motion.span style={{ opacity: crossOpacity }} className="playmore-serif relative mx-2 text-3xl italic text-[var(--pm-sand)]">×</motion.span>
          <motion.div style={{ x: rightX }} className="relative" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 1, delay: 0.35 }}>
            <PartnerMark logoUrl={landing.partnerLogoUrl} name={partnerName} className="h-20 w-20 text-[5.5rem] sm:h-24 sm:w-24 sm:text-[6.5rem]" imgClassName="h-20 w-32 sm:h-24 sm:w-40" />
          </motion.div>
        </div>

        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5, duration: 1 }}
          className="mb-5 text-[11px] font-semibold tracking-[0.5em] text-[var(--pm-sand)]/80 sm:text-xs">
          PLAYROOM <span className="text-[var(--pm-orchid)]">×</span> {partnerName.toUpperCase()} {preview && <span className="ml-2 text-amber-300">· VISTA PREVIA</span>}
        </motion.p>

        {/* Un solo foil dorado para toda la palabra (por letra se cortaba el
            degradado): se revela abriendo el espaciado y enfocando. */}
        <motion.h1
          className="playmore-sans playmore-gold text-[15vw] font-extrabold leading-[0.85] sm:text-[12vw] lg:text-[10.5rem]"
          initial={{ opacity: 0, letterSpacing: '0.25em', filter: 'blur(14px)', scale: 1.08 }}
          animate={{ opacity: 1, letterSpacing: '-0.04em', filter: 'blur(0px)', scale: 1 }}
          transition={{ delay: 0.5, duration: 1.6, ease: [0.22, 1, 0.36, 1] }}
        >
          {landing.eventName}
        </motion.h1>

        <motion.p initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.4, duration: 0.9 }}
          className="playmore-serif mt-6 max-w-2xl text-2xl italic text-[var(--pm-cream)]/90 sm:text-3xl">
          Una noche. Dos mundos. Ninguna igual.
        </motion.p>

        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.6, duration: 0.9 }}
          className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs font-medium tracking-[0.2em] text-[var(--pm-sand)]/80 sm:text-sm">
          <span className="flex items-center gap-2"><CalendarDays className="h-4 w-4 text-[var(--pm-orchid)]" />{landing.dateText.toUpperCase()} · {landing.timeText}</span>
          <span className="flex items-center gap-2"><MapPin className="h-4 w-4 text-[var(--pm-orchid)]" />{landing.venueText.toUpperCase()}</span>
          <span className="flex items-center gap-2"><Users className="h-4 w-4 text-[var(--pm-orchid)]" />{landing.capacityText.toUpperCase()}</span>
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

        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 2.1, duration: 0.9 }} className="mt-10">
          {buyHref ? (
            <BuyButton href={buyHref}>COMPRAR ENTRADAS{minPrice != null ? ` · DESDE ${clp(minPrice)}` : ''}</BuyButton>
          ) : preview ? (
            <span className="inline-flex h-14 items-center rounded-full border border-[#d6b25e]/40 px-8 text-xs font-semibold tracking-[0.25em] text-[var(--pm-sand)]">LA COMPRA SE HABILITA AL ACTIVAR</span>
          ) : (
            <div className="flex flex-col items-center gap-3 sm:flex-row">
              <span className="text-xs tracking-[0.3em] text-[var(--pm-sand)]/80">ENTRADAS MUY PRONTO · ENTÉRATE PRIMERO</span>
              <div className="flex gap-2">
                <a href={CANDYLAND.redes.instagram} target="_blank" rel="noreferrer" className="inline-flex h-11 items-center gap-2 rounded-full border border-[#d6b25e]/40 px-5 text-xs font-semibold tracking-[0.15em] hover:bg-white/5"><Instagram className="h-4 w-4" /> PLAYROOM</a>
                <a href={DALMORE_INSTAGRAM} target="_blank" rel="noreferrer" className="inline-flex h-11 items-center gap-2 rounded-full border border-[#d6b25e]/40 px-5 text-xs font-semibold tracking-[0.15em] hover:bg-white/5"><Instagram className="h-4 w-4" /> {partnerName.toUpperCase()}</a>
              </div>
            </div>
          )}
        </motion.div>
      </div>
      <ChevronDown className="absolute bottom-6 h-6 w-6 animate-bounce text-[var(--pm-sand)]/50" aria-hidden="true" />
    </section>
  );
}

// ── Marquesina ─────────────────────────────────────────────────────────────

export function PlaymoreMarquee({ partnerName }: { partnerName: string }) {
  const words = ['ELECTRONIC MUSIC', 'EXPERIENCES', 'PLAYROOM', partnerName.toUpperCase(), 'NO ES PARA TODOS', 'PLAYMORE'];
  const row = (outline: boolean) => (
    <div className="flex shrink-0 items-center">
      {words.map((w, i) => (
        <span key={i} className="flex items-center">
          <span className={`playmore-sans px-6 text-5xl font-extrabold tracking-[-0.02em] sm:text-7xl ${outline ? 'playmore-outline' : 'playmore-gold'}`}>{w}</span>
          <span className="playmore-serif text-4xl italic text-[var(--pm-orchid)] sm:text-6xl">×</span>
        </span>
      ))}
    </div>
  );
  return (
    <section className="relative overflow-hidden border-y border-[#d6b25e]/15 bg-[var(--pm-ink-2)] py-8 sm:py-10" aria-hidden="true">
      <div className="playmore-marquee">{row(false)}{row(false)}</div>
      <div className="playmore-marquee reverse mt-4">{row(true)}{row(true)}</div>
    </section>
  );
}

// ── Dos mundos, una noche ──────────────────────────────────────────────────

export function TwoWorlds({ landing, partnerName }: { landing: CoproductionLanding; partnerName: string }) {
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'center center'] });
  const leftX = useTransform(scrollYProgress, [0, 1], [-60, 0]);
  const rightX = useTransform(scrollYProgress, [0, 1], [60, 0]);
  const midScale = useTransform(scrollYProgress, [0.6, 1], [0.6, 1]);
  const midOpacity = useTransform(scrollYProgress, [0.6, 1], [0, 1]);

  return (
    <section ref={ref} className="relative mx-auto max-w-6xl px-5 py-24 sm:py-32">
      <motion.div {...reveal} className="mb-14 text-center">
        <Eyebrow>Dos mundos, una noche</Eyebrow>
        <h2 className="playmore-serif text-4xl italic leading-tight sm:text-6xl">Cuando el juego se encuentra<br className="hidden sm:block" /> con el código</h2>
      </motion.div>
      <div className="relative grid gap-5 md:grid-cols-2 md:gap-0">
        <motion.article style={{ x: leftX }}
          className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-[radial-gradient(120%_90%_at_0%_0%,rgba(244,114,182,0.25),transparent_60%),radial-gradient(90%_80%_at_100%_100%,rgba(125,211,252,0.18),transparent_60%),#120d10] p-8 sm:p-10 md:mr-[-1px] md:rounded-r-none">
          <img src="/candyland/logo-isotipo-transparent.png" alt="" className="mb-6 h-16 w-16 object-contain" />
          <p className="text-[11px] font-semibold tracking-[0.4em] text-[var(--pm-fuchsia)]">PLAYROOM</p>
          <h3 className="playmore-sans mt-2 text-3xl font-extrabold">El juego</h3>
          <p className="mt-4 leading-relaxed text-[var(--pm-cream)]/80">{landing.playroomBlurb}</p>
        </motion.article>
        <motion.article style={{ x: rightX }}
          className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-[radial-gradient(120%_90%_at_100%_0%,rgba(150,21,157,0.4),transparent_60%),#120c12] p-8 text-right sm:p-10 md:rounded-l-none">
          <div className="mb-6 flex justify-end">
            {/* El logo completo (con "DALMORE") luce mejor acá que el isotipo. */}
            <PartnerMark logoUrl={landing.partnerLogoUrl === DALMORE_MARK ? DALMORE_LOGO : landing.partnerLogoUrl} name={partnerName}
              className="h-16 w-16 text-[4.2rem]" imgClassName="h-20 w-auto max-w-[11rem]" />
          </div>
          <p className="text-[11px] font-semibold tracking-[0.4em] text-[var(--pm-orchid)]">{partnerName.toUpperCase()}</p>
          <h3 className="playmore-sans mt-2 text-3xl font-extrabold">El código</h3>
          <p className="mt-4 leading-relaxed text-[var(--pm-cream)]/80">{landing.partnerBlurb}</p>
        </motion.article>
        <motion.div style={{ scale: midScale, opacity: midOpacity }}
          className="pointer-events-none absolute left-1/2 top-1/2 hidden h-24 w-24 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-[#d6b25e]/50 bg-[var(--pm-ink)] shadow-[0_0_60px_rgba(228,119,234,0.45)] md:flex">
          <span className="playmore-serif playmore-gold text-5xl italic">×</span>
        </motion.div>
      </div>
    </section>
  );
}

// ── Experiencia y zonas ────────────────────────────────────────────────────

export function Experience({ landing }: { landing: CoproductionLanding }) {
  return (
    <section className="relative overflow-hidden py-24 sm:py-32">
      <div className="pointer-events-none absolute -left-40 top-20 h-96 w-96 rounded-full bg-[var(--pm-magenta)]/25 blur-[120px]" aria-hidden="true" />
      <div className="mx-auto max-w-6xl px-5">
        <motion.div {...reveal} className="mb-12 grid gap-6 md:grid-cols-2 md:items-end">
          <div>
            <Eyebrow>La experiencia</Eyebrow>
            <h2 className="playmore-sans text-4xl font-extrabold leading-[0.95] tracking-[-0.03em] sm:text-6xl">Un salón gigante.<br /><span className="playmore-gold">{landing.capacityText}.</span></h2>
          </div>
          <p className="text-[var(--pm-cream)]/75 md:text-lg">{landing.subheadline}</p>
        </motion.div>
        <div className="grid gap-px overflow-hidden rounded-[2rem] border border-[#d6b25e]/20 bg-[#d6b25e]/20 sm:grid-cols-2">
          {landing.highlights.map((h, i) => (
            <motion.div key={h} {...reveal} transition={{ ...reveal.transition, delay: i * 0.08 }}
              className="group relative bg-[var(--pm-ink)] p-8 transition-colors hover:bg-[#140d12] sm:p-10">
              <span className="playmore-serif playmore-gold text-5xl italic">{String(i + 1).padStart(2, '0')}</span>
              <p className="mt-4 text-lg leading-snug text-[var(--pm-cream)]/90">{h}</p>
              <span className="absolute bottom-0 left-0 h-px w-0 bg-gradient-to-r from-[var(--pm-orchid)] to-[var(--pm-sky)] transition-all duration-700 group-hover:w-full" />
            </motion.div>
          ))}
        </div>
        <motion.div {...reveal} className="mt-6 flex flex-col gap-3 rounded-[2rem] border border-[#d6b25e]/20 bg-[linear-gradient(110deg,rgba(150,21,157,0.25),rgba(12,9,8,0.6)_60%)] p-8 sm:flex-row sm:items-center sm:gap-8 sm:p-10">
          <span className="text-[11px] font-semibold tracking-[0.45em] text-[var(--pm-orchid)]">DRESS CODE</span>
          <p className="playmore-serif text-2xl italic leading-snug sm:text-3xl">{landing.dressCode}</p>
        </motion.div>
      </div>
    </section>
  );
}

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

export function Accesos({ types, buyHref, eventName }: { types: TicketTypeView[]; buyHref: string | null; eventName: string }) {
  if (types.length === 0) return null;
  return (
    <section className="mx-auto max-w-6xl px-5 py-24 sm:py-32" id="accesos">
      <motion.div {...reveal} className="mb-12 text-center">
        <Eyebrow>Accesos</Eyebrow>
        <h2 className="playmore-sans text-4xl font-extrabold tracking-[-0.03em] sm:text-6xl">Elige tu <span className="playmore-gold">ticket</span></h2>
        <p className="playmore-serif mt-4 text-xl italic text-[var(--pm-cream)]/70">El precio sube con cada tanda.</p>
      </motion.div>
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {types.map((t, i) => {
          const soldout = t.status === 'soldout';
          const content = (
            <>
              <div className="min-w-0 flex-1 p-6">
                <p className="text-[10px] font-semibold tracking-[0.4em] text-[var(--pm-orchid)]">{eventName}</p>
                <p className="mt-2 text-lg font-bold leading-tight">{t.name}</p>
                <p className={`mt-4 text-3xl font-extrabold tabular-nums ${soldout ? 'text-white/40 line-through' : 'playmore-gold'}`}>{t.price > 0 ? clp(t.price) : 'Gratis'}</p>
              </div>
              <div className="flex w-[92px] shrink-0 items-center justify-center border-l border-dashed border-[#d6b25e]/35">
                <span className="rotate-90 whitespace-nowrap text-[11px] font-bold tracking-[0.35em] text-[var(--pm-sand)]">{soldout ? 'AGOTADO' : 'ADMIT'}</span>
              </div>
            </>
          );
          return (
            <motion.div key={t.id} {...reveal} transition={{ ...reveal.transition, delay: i * 0.06 }}>
              {buyHref && !soldout ? (
                <Link href={buyHref} className="playmore-ticket-card flex rounded-2xl transition hover:-translate-y-1 hover:shadow-[0_20px_50px_-20px_rgba(228,119,234,0.6)]">{content}</Link>
              ) : (
                <div className={`playmore-ticket-card flex rounded-2xl ${soldout ? 'opacity-60' : ''}`}>{content}</div>
              )}
            </motion.div>
          );
        })}
      </div>
      {buyHref && (
        <div className="mt-12 flex justify-center"><BuyButton href={buyHref}>COMPRAR ENTRADAS</BuyButton></div>
      )}
    </section>
  );
}

// ── Código de la noche + FAQ ───────────────────────────────────────────────

export function CodeAndFaq({ landing, eventName }: { landing: CoproductionLanding; eventName: string }) {
  return (
    <section className="relative overflow-hidden py-24 sm:py-32">
      <div className="pointer-events-none absolute -right-32 top-10 h-96 w-96 rounded-full bg-[var(--pm-orchid)]/15 blur-[120px]" aria-hidden="true" />
      <div className="mx-auto grid max-w-6xl gap-14 px-5 lg:grid-cols-2">
        {landing.rules.length > 0 && (
          <motion.div {...reveal}>
            <Eyebrow>El código {eventName}</Eyebrow>
            <h2 className="playmore-serif mb-8 text-4xl italic sm:text-5xl">Lo que pasa adentro, se cuida adentro.</h2>
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
      <p className="mt-2 text-xs tracking-[0.3em] text-[var(--pm-sand)]/70">{landing.dateText.toUpperCase()} · {landing.venueText.toUpperCase()} · SOLO +18</p>
      <div className="mt-6 flex justify-center gap-3">
        <a href={CANDYLAND.redes.instagram} target="_blank" rel="noreferrer" className="inline-flex h-10 items-center gap-2 rounded-full border border-white/15 px-4 text-xs hover:bg-white/5"><Instagram className="h-4 w-4" /> Playroom</a>
        <a href={DALMORE_INSTAGRAM} target="_blank" rel="noreferrer" className="inline-flex h-10 items-center gap-2 rounded-full border border-white/15 px-4 text-xs hover:bg-white/5"><Instagram className="h-4 w-4" /> {partnerName}</a>
      </div>
      <Link href="/" className="mt-6 inline-block text-xs text-[var(--pm-sand)]/60 underline">mansionplayroom.cl</Link>
    </footer>
  );
}
