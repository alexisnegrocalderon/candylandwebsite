import { lazy, Suspense, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Check, Clock, X } from 'lucide-react';
import type { ColabBrand } from '@shared/coproduction';
import './playmore.css';

/* Resultado del pago (al volver de Mercado Pago) para un evento de colab:
 * misma cara negra y dorada de la landing, con Playroom × socio, en vez de la
 * página genérica de Playroom. */

const ColabPostPurchase = lazy(() => import('./PostPurchase').then((m) => ({ default: m.ColabPostPurchase })));
const DALMORE_LOGO = '/playmore/dalmore-logo.png';

/** La app vive en mansionplayroom.cl: desde la landing de la colab se va allá (la sesión es la misma en ambos). */
function appUrl(path: string): string {
  if (typeof window === 'undefined') return path;
  const host = window.location.hostname;
  return host.endsWith('.mansionplayroom.cl') ? `https://mansionplayroom.cl${path}` : path;
}

type Kind = 'ok' | 'pending' | 'error';

const COPY: Record<Kind, { title: string; text: string; Icon: typeof Check }> = {
  ok: { title: '¡Ya estás dentro!', text: 'Tu ticket está adquirido y confirmado. Te lo enviamos al correo con tu QR (revisa también spam).', Icon: Check },
  pending: { title: 'Pago en revisión', text: 'Cuando Mercado Pago lo confirme te llega la entrada al correo. No hace falta que pagues de nuevo.', Icon: Clock },
  error: { title: 'No se procesó el pago', text: 'No se realizó ningún cargo. Puedes intentarlo otra vez cuando quieras.', Icon: X },
};

export function ColabPaymentResult({ brand, kind, holderName = '', accesoSlug, accessLabel, simulated = false }: {
  brand: ColabBrand; kind: Kind;
  /** Si se conoce (checkout en el sitio): el ticket sale con su nombre y su acceso. */
  holderName?: string; accesoSlug?: string | null; accessLabel?: string;
  /** Vista previa del dueño: se avisa que no hubo cobro. */
  simulated?: boolean;
}) {
  const { title, text, Icon } = COPY[kind];
  // Fondo oscuro también detrás de la barra de estado y al estirar la página.
  useEffect(() => {
    const html = document.documentElement;
    const prev = [html.style.background, document.body.style.background];
    html.style.background = '#0c0908';
    document.body.style.background = '#0c0908';
    return () => { html.style.background = prev[0]; document.body.style.background = prev[1]; };
  }, []);
  const logo = brand.partnerLogoUrl || (brand.slug === 'dalmore' ? DALMORE_LOGO : '');
  return (
    <div className="playmore min-h-dvh px-4 pb-16 pt-14">
      {simulated && <p className="mx-auto mb-6 max-w-md rounded-2xl border border-amber-400/40 bg-amber-400/10 px-4 py-3 text-center text-xs font-semibold leading-relaxed tracking-[0.12em] text-amber-100">VISTA PREVIA: ASÍ SE VE LA CONFIRMACIÓN. NO HUBO NINGÚN COBRO NI SE ENVIÓ CORREO.</p>}
      <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }} className="mx-auto max-w-md text-center">
        <div className="mb-8 flex items-center justify-center gap-4">
          <img src="/playmore/playroom-logo.png" alt="Mansion Playroom" className="h-10 w-auto" />
          <span className="text-[#E477EA]" aria-hidden="true">×</span>
          {logo ? <img src={logo} alt={brand.partnerName} className="h-10 w-auto max-w-[130px] object-contain" /> : <span className="text-xs font-extrabold tracking-[0.3em] text-[var(--pm-sand)]">{brand.partnerName.toUpperCase()}</span>}
        </div>
        <motion.div initial={{ scale: 0.4, rotate: -12 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 240, damping: 16, delay: 0.15 }}
          className={`mx-auto mb-6 grid h-20 w-20 place-items-center rounded-full border ${kind === 'error' ? 'border-red-400/50 text-red-300' : 'border-[#d6b25e]/60 text-[#f7e7a8]'} bg-black/50 shadow-[0_0_60px_-10px_rgba(228,119,234,0.6)]`}>
          <Icon className="h-9 w-9" />
        </motion.div>
        <p className="text-[11px] font-semibold tracking-[0.45em] text-[var(--pm-orchid)]">{brand.eventName}</p>
        <h1 className="playmore-sans playmore-gold mt-3 text-4xl font-extrabold tracking-[-0.02em]">{title}</h1>
        <p className="mt-4 text-[var(--pm-cream)]/80">{text}</p>
      </motion.div>

      {kind === 'ok' && brand.eventSlug && (
        <div className="mx-auto mt-8 max-w-md">
          <Suspense fallback={null}><ColabPostPurchase eventSlug={brand.eventSlug} holderName={holderName} accesoSlug={accesoSlug} accessLabel={accessLabel} /></Suspense>
        </div>
      )}

      {/* Una sola experiencia: la entrada (con su QR) vive en «Mi cuenta» de la app de Playroom. */}
      {kind === 'ok' && !simulated && (
        <div className="mx-auto mt-8 max-w-md rounded-[28px] border border-[#d6b25e]/35 bg-black/40 p-6 text-center">
          <p className="text-[11px] font-semibold tracking-[0.35em] text-[var(--pm-orchid)]">TU ENTRADA EN LA APP</p>
          <p className="mt-2 text-sm leading-relaxed text-[var(--pm-cream)]/80">TU QR Y TU ENTRADA QUEDAN EN «MI CUENTA» DE LA APP DE PLAYROOM. ENTRA CON EL MISMO CORREO DE LA COMPRA.</p>
          <div className="mt-5 flex flex-col gap-3">
            <a href={appUrl('/cuenta')} className="inline-flex h-12 items-center justify-center rounded-full text-xs font-bold tracking-[0.18em] text-[#141210] shadow-[0_14px_40px_-12px_rgba(247,231,168,0.55)]" style={{ background: 'var(--pm-gold)' }}>VER MI ENTRADA EN LA APP</a>
            <a href={appUrl('/app')} className="inline-flex h-12 items-center justify-center rounded-full border border-[#d6b25e]/40 text-xs font-semibold tracking-[0.18em] text-[var(--pm-sand)] hover:bg-white/5">INSTALAR LA APP DE PLAYROOM</a>
          </div>
        </div>
      )}

      <div className="mx-auto mt-6 max-w-md text-center">
        <a href="/" className="inline-flex h-12 items-center justify-center rounded-full border border-[#d6b25e]/40 px-8 text-xs font-semibold tracking-[0.2em] text-[var(--pm-sand)] hover:bg-white/5">
          {kind === 'error' ? 'VOLVER A INTENTAR' : `VOLVER A ${brand.eventName}`}
        </a>
      </div>
    </div>
  );
}
