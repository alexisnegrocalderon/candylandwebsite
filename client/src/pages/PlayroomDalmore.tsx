import { useMemo } from 'react';
import { Link } from 'wouter';
import { motion } from 'framer-motion';
import { ArrowRight, CalendarDays, ChevronDown, Eye, Instagram, MapPin, ShieldCheck, Sparkles, Users } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { useSeo } from '@/hooks/useSeo';
import { CANDYLAND } from '@/config/candyland';

/* Landing de la co-producción Playroom × Dalmore (/playroomdalmore).
 *
 * Mientras el dueño no la active, el servidor (coproduction.publicGet) solo
 * entrega el teaser "Próximamente": sin precios, sin galería y sin link de
 * compra, y el checkout del evento rechaza ventas. Con `?preview=<token>`
 * (Configuración → Vista previa) se ve completa para revisarla. */

const SLUG = 'dalmore';
const clp = (n: number) => `$${Math.round(n).toLocaleString('es-CL')}`;

const fadeUp = {
  initial: { opacity: 0, y: 24 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: '-60px' },
  transition: { duration: 0.6, ease: [0.23, 1, 0.32, 1] },
} as const;

export default function PlayroomDalmore() {
  const preview = useMemo(() => {
    try { return new URLSearchParams(window.location.search).get('preview') ?? undefined; } catch { return undefined; }
  }, []);
  const { data, isLoading } = trpc.coproduction.publicGet.useQuery({ slug: SLUG, preview }, { retry: false });
  const landing = data?.landing;
  const full = !!data && (data.isLive || data.preview);
  const checkoutHref = data?.event ? `/checkout/${data.event.slug}` : null;
  // En la vista previa se ve todo, pero la compra recién se abre al activar
  // (el servidor igual rechaza órdenes de un evento sin activar).
  const canBuy = !!data?.isLive && !!checkoutHref;

  useSeo({
    title: landing ? `${landing.title} · ${full ? landing.dateText : 'Próximamente'}` : 'Playroom × Dalmore',
    description: landing?.headline ?? 'Playroom × Dalmore',
    path: '/playroomdalmore',
    image: landing?.heroImageUrl || undefined,
    noindex: !data?.isLive,
  });

  if (isLoading) {
    return <div className="flex min-h-dvh items-center justify-center bg-[#07040b]"><div className="h-8 w-8 animate-spin rounded-full border-2 border-pink-400 border-t-transparent" /></div>;
  }
  if (!data || !landing) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-[#07040b] px-6 text-center text-white">
        <p className="font-heading text-3xl">Playroom × Dalmore</p>
        <p className="text-white/70">Muy pronto.</p>
        <Link href="/" className="text-sm underline">Ir a Mansion Playroom</Link>
      </div>
    );
  }

  const minPrice = data.ticketTypes.filter((t) => t.status === 'active' && t.price > 0).reduce((m, t) => Math.min(m, t.price), Infinity);

  return (
    <div className="relative min-h-dvh overflow-x-hidden bg-[#07040b] text-white">
      {data.preview && (
        <div className="sticky top-0 z-50 flex items-center justify-center gap-2 bg-amber-400 px-4 py-2 text-center text-sm font-semibold text-black">
          <Eye className="h-4 w-4" /> Vista previa privada: el público todavía ve "Próximamente".
        </div>
      )}

      {/* ── Hero ─────────────────────────────────────────────── */}
      <section className="relative flex min-h-[92dvh] flex-col items-center justify-center overflow-hidden px-5 pb-16 pt-20 text-center">
        {landing.heroImageUrl ? (
          <img src={landing.heroImageUrl} alt="" className="absolute inset-0 h-full w-full object-cover opacity-45" />
        ) : null}
        <div className="absolute inset-0" style={{
          background: 'radial-gradient(900px 600px at 80% -10%, oklch(0.55 0.25 330 / 0.55), transparent 60%), radial-gradient(800px 600px at 0% 100%, oklch(0.45 0.22 280 / 0.5), transparent 60%), linear-gradient(180deg, rgba(7,4,11,0.2), #07040b 95%)',
        }} />
        <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, ease: [0.23, 1, 0.32, 1] }} className="relative z-10 flex max-w-3xl flex-col items-center">
          <div className="mb-8 flex items-center gap-4 sm:gap-6">
            <img src="/candyland/logo-isotipo-transparent.png" alt="Playroom" className="h-14 w-14 object-contain sm:h-16 sm:w-16" />
            <span className="font-heading text-3xl text-white/60">×</span>
            {landing.partnerLogoUrl
              ? <img src={landing.partnerLogoUrl} alt={data.partnerName} className="h-14 max-w-[140px] object-contain sm:h-16" />
              : <span className="font-heading text-2xl tracking-[0.2em]">{data.partnerName.toUpperCase()}</span>}
          </div>
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.35em] text-pink-200/80">{full ? 'Una sola noche' : 'Próximamente'}</p>
          <h1 className="font-heading text-5xl leading-[1.05] sm:text-7xl">
            <span className="bg-gradient-to-r from-pink-300 via-fuchsia-300 to-sky-300 bg-clip-text text-transparent">{landing.title}</span>
          </h1>
          <p className="mt-5 max-w-xl text-lg text-white/85 sm:text-xl">{landing.headline}</p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-sm text-white/80">
            {full && landing.dateText && <span className="flex items-center gap-1.5"><CalendarDays className="h-4 w-4" />{landing.dateText}</span>}
            {landing.venueText && <span className="flex items-center gap-1.5"><MapPin className="h-4 w-4" />{landing.venueText}</span>}
            {landing.capacityText && <span className="flex items-center gap-1.5"><Users className="h-4 w-4" />{landing.capacityText}</span>}
          </div>
          <div className="mt-9 flex flex-col items-center gap-3 sm:flex-row">
            {canBuy ? (
              <Link href={checkoutHref!} className="group flex h-14 items-center gap-2 rounded-full bg-gradient-to-r from-pink-500 to-fuchsia-600 px-8 text-base font-semibold shadow-[0_10px_40px_-8px_rgba(236,72,153,0.7)] transition-transform active:scale-[0.98]">
                Comprar entradas{Number.isFinite(minPrice) ? ` · desde ${clp(minPrice)}` : ''} <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-0.5" />
              </Link>
            ) : data.preview ? (
              <span className="flex h-14 items-center gap-2 rounded-full border border-white/25 bg-white/10 px-8 text-base font-semibold text-white/80">
                Comprar entradas · se habilita al activar
              </span>
            ) : (
              <a href={CANDYLAND.redes.instagram} target="_blank" rel="noreferrer" className="flex h-14 items-center gap-2 rounded-full border border-white/25 bg-white/10 px-8 text-base font-semibold backdrop-blur">
                <Instagram className="h-5 w-5" /> Entérate primero en Instagram
              </a>
            )}
          </div>
        </motion.div>
        {full && <ChevronDown className="absolute bottom-6 h-6 w-6 animate-bounce text-white/50" aria-hidden="true" />}
      </section>

      {full && (
        <>
          {/* ── La experiencia ───────────────────────────────── */}
          <section className="mx-auto max-w-6xl px-5 py-20">
            <motion.div {...fadeUp} className="mb-10 max-w-2xl">
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.3em] text-pink-200/70">La experiencia</p>
              <h2 className="font-heading text-3xl sm:text-5xl">Lo que vas a vivir</h2>
              {landing.subheadline && <p className="mt-4 text-white/75">{landing.subheadline}</p>}
            </motion.div>
            <div className="grid gap-4 sm:grid-cols-2">
              {landing.highlights.map((h, i) => (
                <motion.div key={h} {...fadeUp} transition={{ ...fadeUp.transition, delay: i * 0.06 }}
                  className="flex items-start gap-4 rounded-3xl border border-white/10 bg-white/[0.04] p-6 backdrop-blur">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-pink-500 to-violet-600"><Sparkles className="h-5 w-5" /></span>
                  <p className="text-white/90">{h}</p>
                </motion.div>
              ))}
            </div>
          </section>

          {/* ── Galería ──────────────────────────────────────── */}
          {landing.galleryUrls.length > 0 && (
            <section className="px-5 pb-20">
              <div className="mx-auto grid max-w-6xl auto-rows-[180px] grid-cols-2 gap-3 sm:auto-rows-[240px] md:grid-cols-4">
                {landing.galleryUrls.map((u, i) => (
                  <motion.img key={u} {...fadeUp} src={u} alt="" loading="lazy"
                    className={`h-full w-full rounded-3xl object-cover ${i % 5 === 0 ? 'col-span-2 row-span-2' : ''}`} />
                ))}
              </div>
            </section>
          )}

          {/* ── Accesos ──────────────────────────────────────── */}
          {data.ticketTypes.length > 0 && (
            <section className="mx-auto max-w-6xl px-5 pb-20">
              <motion.div {...fadeUp} className="mb-8">
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.3em] text-pink-200/70">Entradas</p>
                <h2 className="font-heading text-3xl sm:text-5xl">Accesos</h2>
              </motion.div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {data.ticketTypes.map((t) => (
                  <motion.div key={t.id} {...fadeUp} className={`flex items-center justify-between gap-4 rounded-3xl border p-5 ${t.status === 'soldout' ? 'border-white/5 bg-white/[0.02] opacity-60' : 'border-white/10 bg-white/[0.05]'}`}>
                    <span className="font-medium">{t.name}</span>
                    <span className="shrink-0 text-right">
                      <span className="block font-heading text-2xl tabular-nums">{t.price > 0 ? clp(t.price) : 'Gratis'}</span>
                      {t.status === 'soldout' && <span className="text-xs text-white/60">Agotado</span>}
                    </span>
                  </motion.div>
                ))}
              </div>
              {canBuy && (
                <div className="mt-8 flex justify-center">
                  <Link href={checkoutHref!} className="flex h-14 items-center gap-2 rounded-full bg-gradient-to-r from-pink-500 to-fuchsia-600 px-8 font-semibold">
                    Comprar entradas <ArrowRight className="h-5 w-5" />
                  </Link>
                </div>
              )}
            </section>
          )}

          {/* ── Reglas ───────────────────────────────────────── */}
          {landing.rules.length > 0 && (
            <section className="mx-auto max-w-3xl px-5 pb-20">
              <motion.div {...fadeUp} className="rounded-3xl border border-white/10 bg-gradient-to-br from-white/[0.06] to-white/[0.02] p-6 sm:p-8">
                <h2 className="mb-5 flex items-center gap-2 font-heading text-2xl sm:text-3xl"><ShieldCheck className="h-6 w-6 text-pink-300" /> Las reglas de la casa</h2>
                <ul className="space-y-3">
                  {landing.rules.map((r) => <li key={r} className="flex gap-3 text-white/85"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-pink-400" />{r}</li>)}
                </ul>
              </motion.div>
            </section>
          )}

          {/* ── Preguntas ────────────────────────────────────── */}
          {landing.faq.length > 0 && (
            <section className="mx-auto max-w-3xl px-5 pb-28">
              <h2 className="mb-6 font-heading text-3xl sm:text-4xl">Preguntas frecuentes</h2>
              <div className="space-y-2">
                {landing.faq.map((f) => (
                  <details key={f.q} className="group rounded-2xl border border-white/10 bg-white/[0.04] p-5">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-3 font-medium">
                      {f.q}<ChevronDown className="h-5 w-5 shrink-0 transition-transform group-open:rotate-180" />
                    </summary>
                    <p className="mt-3 text-white/75">{f.a}</p>
                  </details>
                ))}
              </div>
            </section>
          )}
        </>
      )}

      <footer className="border-t border-white/10 px-5 py-8 text-center text-sm text-white/60">
        <p>Playroom × {data.partnerName} · Solo mayores de 18 años</p>
        <Link href="/" className="mt-2 inline-block underline">mansionplayroom.cl</Link>
      </footer>

      {/* Botón de compra fijo en celular */}
      {canBuy && (
        <div className="fixed inset-x-0 bottom-0 z-40 p-3 pb-[max(env(safe-area-inset-bottom),0.75rem)] sm:hidden">
          <Link href={checkoutHref!} className="flex h-14 items-center justify-center gap-2 rounded-full bg-gradient-to-r from-pink-500 to-fuchsia-600 font-semibold shadow-[0_10px_40px_-8px_rgba(236,72,153,0.8)]">
            Comprar entradas{Number.isFinite(minPrice) ? ` · desde ${clp(minPrice)}` : ''}
          </Link>
        </div>
      )}
    </div>
  );
}
