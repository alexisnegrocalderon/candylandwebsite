import { motion } from 'framer-motion';
import { Link } from 'wouter';
import { ArrowRight, Instagram, Wallet, Sparkles, ShieldCheck, ScanLine, RefreshCw } from 'lucide-react';
import { useSeo } from '@/hooks/useSeo';
import { articleSchema, breadcrumbSchema } from '@shared/structuredData';
import { CANDYLAND, EVENTO } from '@/config/candyland';
import { WalletCard } from '@/components/wallet/WalletCard';

/* Página especial standalone (no un Article más del blog), mismo criterio
 * que QueSonLasFiestasLiberales.tsx: el pipeline de contenido
 * (content/blog/*.ts + ArticleLayout) es a propósito solo datos de texto,
 * sin componentes embebidos -- meterle la tarjeta interactiva ahí hubiera
 * roto ese contrato. Vive fuera de ese sistema, con su propia ruta
 * registrada en App.tsx antes de la genérica /blog/:slug.
 *
 * Pedido explícito del dueño: una página para linkear desde un reel/story
 * de Instagram, explicando la Tarjeta PlayCard con su gráfica real. La
 * tarjeta que se muestra es la misma pieza que ya vive en
 * /verificar/:ticketCode (componente compartido WalletCard) -- acá con
 * datos de EJEMPLO, nunca los de un comprador real. */

const INSTAGRAM_HANDLE = CANDYLAND.redes.instagram.split('/').filter(Boolean).pop();

const PASOS = [
  {
    icon: Wallet,
    titulo: 'Se activa con tu entrada',
    texto: 'Cuando compras tu entrada, tu Tarjeta PlayCard queda lista. La primera vez que cargas saldo defines un PIN de 4 dígitos -- pagar de verdad es lo que confirma que eres tú.',
  },
  {
    icon: Sparkles,
    titulo: 'Guarda saldo y Playcoins',
    texto: 'Cargas saldo prepagado en plata (1 a 1, sin letra chica) cuando compras tu entrada o directamente en caja el día de la fiesta. Cada compra además te suma Playcoins, un sistema de puntos aparte que también vive en tu tarjeta.',
  },
  {
    icon: ScanLine,
    titulo: 'Pagas en caja sin billetera',
    texto: 'En cualquier caja de la fiesta: muestras tu QR, ingresas tu PIN, y listo -- se descuenta tu saldo al instante. Nada de andar cuidando efectivo ni tarjetas físicas toda la noche.',
  },
  {
    icon: RefreshCw,
    titulo: 'Te sigue de fiesta en fiesta',
    texto: 'Tu saldo y tus Playcoins quedan ligados a tu cuenta, no a una entrada puntual -- si compras otra vez con el mismo correo, todo lo que no gastaste sigue ahí, esperándote en la próxima.',
  },
];

const reveal = {
  initial: { opacity: 0, y: 24 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: '100px' },
  transition: { duration: 0.5, ease: [0.23, 1, 0.32, 1] as const },
};

export default function PlayCardArticle() {
  const path = '/blog/tarjeta-playcard';

  useSeo({
    title: '¿Qué es la Tarjeta PlayCard? — Mansion Playroom',
    description: 'Tu QR de acceso, saldo prepagado y Playcoins en un solo lugar. Cómo funciona la Tarjeta PlayCard de Mansion Playroom, paso a paso.',
    path,
    jsonLd: [
      articleSchema({
        headline: '¿Qué es la Tarjeta PlayCard?',
        description: 'Tu QR de acceso, saldo prepagado y Playcoins en un solo lugar -- cómo funciona la Tarjeta PlayCard.',
        url: path,
        datePublished: '2026-09-09',
      }),
      breadcrumbSchema([
        { name: 'Inicio', path: '/' },
        { name: 'Blog', path: '/blog' },
        { name: '¿Qué es la Tarjeta PlayCard?', path },
      ]),
    ],
  });

  return (
    <div className="min-h-screen pt-24 pb-16">
      <article className="container max-w-3xl">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
          <nav aria-label="Migas de pan" className="flex items-center gap-2 text-xs text-muted-foreground mb-6">
            <Link href="/" className="hover:text-primary transition-colors">Inicio</Link>
            <span aria-hidden>/</span>
            <Link href="/blog" className="hover:text-primary transition-colors">Blog</Link>
          </nav>

          <div className="text-5xl mb-4" aria-hidden>💳</div>
          <h1 className="font-heading font-extrabold text-3xl md:text-5xl tracking-tight mb-4 leading-[1.1]">
            La <span className="text-gradient-candy">Tarjeta PlayCard</span>
          </h1>
          <p className="text-muted-foreground text-lg leading-relaxed mb-10">
            Un solo QR para todo: tu acceso a la fiesta, tu saldo prepagado y tus Playcoins. Nada de billetera,
            nada de tarjetas físicas -- solo tu celular.
          </p>

          {/* La tarjeta real, con datos de ejemplo -- fondo oscuro propio para
              que el vidrio/holograma se lea igual de bien que en /verificar. */}
          <div className="rounded-[28px] p-6 md:p-10 mb-3" style={{
            background: 'radial-gradient(120% 120% at 20% 0%, #241432, #0d0712 70%)',
          }}>
            <WalletCard
              eventTitle=""
              eventDateShort=""
              holderName="Camila Fuentes"
              ticketCode="MP-DEMOCARD2026"
              qrImageUrl={null}
              prepaidBalance={18500}
              playcoins={1240}
              movements={[
                { type: 'money', label: 'Piscola · Caja', delta: -4500 },
                { type: 'money', label: 'Recarga · Checkout', delta: 20000 },
                { type: 'points', label: 'Entrada Dúo', delta: 500 },
              ]}
            />
          </div>
          <p className="text-center text-xs text-muted-foreground mb-14">Ejemplo ilustrativo -- toca la tarjeta para ver el reverso.</p>

          <section {...reveal} className="mb-14">
            <p className="text-sm uppercase tracking-[0.3em] text-primary mb-3 text-center">Paso a paso</p>
            <h2 className="font-heading font-bold text-2xl md:text-3xl text-center mb-8">
              Cómo <span className="text-gradient-candy">funciona</span>
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              {PASOS.map((p, i) => (
                <div key={p.titulo} className="glass-candy rounded-2xl p-5">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center mb-3">
                    <p.icon className="w-5 h-5 text-primary" />
                  </div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Paso {i + 1}</p>
                  <p className="font-heading font-bold text-lg mb-2">{p.titulo}</p>
                  <p className="text-sm text-muted-foreground leading-relaxed">{p.texto}</p>
                </div>
              ))}
            </div>
          </section>

          <section {...reveal} className="mb-14">
            <div className="glass-candy rounded-2xl p-6 md:p-8">
              <div className="flex items-center gap-2 mb-3">
                <ShieldCheck className="w-5 h-5 text-primary shrink-0" />
                <p className="font-heading font-bold text-lg">Tu saldo, protegido con PIN</p>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Ver tu saldo es libre, pero gastarlo siempre pide tu PIN de 4 dígitos -- nadie puede vaciar tu
                tarjeta sin él, ni siquiera con tu QR a la vista. El saldo se gasta únicamente en las cajas
                dentro de la fiesta; el estacionamiento se paga aparte, como extra en tu compra o directo en la
                puerta con efectivo o tarjeta.
              </p>
            </div>
          </section>

          <div className="glass-candy rounded-2xl p-6 md:p-8 text-center">
            <p className="text-base md:text-lg mb-5">
              Tu Tarjeta PlayCard se activa sola cuando compras tu entrada -- no hay nada más que hacer.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              {EVENTO.fechaConfirmada ? (
                <Link
                  href={`/checkout/${CANDYLAND.slug}`}
                  className="btn-jelly inline-flex items-center justify-center gap-2 px-7 py-3.5 rounded-full bg-primary text-primary-foreground font-bold interactive"
                >
                  Comprar mi entrada <ArrowRight className="w-4 h-4" />
                </Link>
              ) : (
                <Link
                  href="/eventos"
                  className="btn-jelly inline-flex items-center justify-center gap-2 px-7 py-3.5 rounded-full bg-primary text-primary-foreground font-bold interactive"
                >
                  Ver próximos eventos <ArrowRight className="w-4 h-4" />
                </Link>
              )}
              <a
                href={CANDYLAND.redes.instagram}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-jelly inline-flex items-center justify-center gap-2 px-7 py-3.5 rounded-full border border-border font-semibold interactive"
              >
                <Instagram className="w-4 h-4" /> @{INSTAGRAM_HANDLE}
              </a>
            </div>
          </div>
        </motion.div>
      </article>
    </div>
  );
}
