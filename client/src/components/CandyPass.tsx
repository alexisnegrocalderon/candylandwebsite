import { useRef } from 'react';
import { motion, useSpring } from 'framer-motion';
import { Link } from 'wouter';
import { MessageCircle, Sparkles } from 'lucide-react';
import { CANDYLAND, formatCLP, whatsappSolteroLink, type Acceso } from '@/config/candyland';
import { prefersReducedMotion } from '@/lib/smoothScroll';

// Motivo dulce + paleta pastel candy por acceso (EDITABLE)
const MOTIVOS: Record<string, { emoji: string; from: string; to: string; glow: string }> = {
  duo: { emoji: '🍒', from: 'oklch(0.72 0.15 15 / 0.55)', to: 'oklch(0.75 0.13 340 / 0.35)', glow: 'oklch(0.7 0.2 15 / 0.5)' },
  soltera: { emoji: '🍭', from: 'oklch(0.78 0.14 340 / 0.55)', to: 'oklch(0.75 0.13 300 / 0.35)', glow: 'oklch(0.75 0.19 340 / 0.5)' },
  soltero: { emoji: '🔑', from: 'oklch(0.7 0.12 262 / 0.55)', to: 'oklch(0.72 0.14 300 / 0.35)', glow: 'oklch(0.65 0.17 262 / 0.5)' },
  trio: { emoji: '🍬', from: 'oklch(0.74 0.15 300 / 0.55)', to: 'oklch(0.75 0.13 340 / 0.35)', glow: 'oklch(0.68 0.2 300 / 0.5)' },
  grupo: { emoji: '🌈', from: 'oklch(0.76 0.14 130 / 0.55)', to: 'oklch(0.73 0.13 262 / 0.35)', glow: 'oklch(0.7 0.19 160 / 0.5)' },
  cumpleaneros: { emoji: '🎂', from: 'oklch(0.78 0.13 340 / 0.55)', to: 'oklch(0.73 0.12 262 / 0.35)', glow: 'oklch(0.72 0.18 330 / 0.5)' },
};

function EstadoBadge({ estado }: { estado: string }) {
  if (estado === 'last_tickets')
    return <span className="px-2.5 py-0.5 rounded-full bg-cherry/20 text-cherry text-[9px] font-bold uppercase tracking-wide candy-pulse">Últimos cupos</span>;
  if (estado === 'soldout')
    return <span className="px-2.5 py-0.5 rounded-full bg-muted text-muted-foreground text-[9px] font-bold uppercase tracking-wide">Agotado</span>;
  if (estado === 'coming_soon')
    return <span className="px-2.5 py-0.5 rounded-full bg-candy-blue/20 text-candy-blue text-[9px] font-bold uppercase tracking-wide">Próximo tramo</span>;
  return null;
}

export default function CandyPass({ acceso }: { acceso: Acceso }) {
  const ref = useRef<HTMLDivElement>(null);
  const rm = prefersReducedMotion();
  const rotateX = useSpring(0, { stiffness: 150, damping: 16 });
  const rotateY = useSpring(0, { stiffness: 150, damping: 16 });

  const motivo = MOTIVOS[acceso.id] ?? MOTIVOS.duo;
  const agotado = acceso.estado === 'soldout';

  const handleMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (rm || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width;
    const py = (e.clientY - r.top) / r.height;
    rotateY.set((px - 0.5) * 12);
    rotateX.set(-(py - 0.5) * 12);
    ref.current.style.setProperty('--mx', `${px * 100}%`);
    ref.current.style.setProperty('--my', `${py * 100}%`);
  };
  const handleLeave = () => {
    rotateX.set(0);
    rotateY.set(0);
  };

  return (
    <div className="candy-perspective shrink-0 w-[230px] sm:w-[250px] snap-center self-stretch">
      {/* Glow ambiental detrás de la tarjeta, con el color del motivo */}
      <div
        aria-hidden
        className="absolute -inset-4 rounded-[2rem] blur-2xl opacity-70 -z-10"
        style={{ background: `radial-gradient(circle, ${motivo.glow}, transparent 70%)` }}
      />

      <motion.div
        ref={ref}
        onPointerMove={handleMove}
        onPointerLeave={handleLeave}
        style={{ rotateX, rotateY }}
        className={`candy-pass relative h-full glass-candy-pastel rounded-3xl p-4 flex flex-col overflow-hidden ${
          agotado ? 'opacity-60' : ''
        } ${acceso.exclusivoComunidad ? 'border-violet-electric/40' : ''}`}
      >
        {/* Capas holográficas */}
        <div
          className="absolute inset-0 rounded-3xl pointer-events-none"
          style={{ background: `linear-gradient(155deg, ${motivo.from}, ${motivo.to} 55%, transparent 100%)` }}
        />
        <div className="candy-holo" />
        <div className="candy-sheen" />

        {/* Contenido */}
        <div className="relative" style={{ transform: 'translateZ(20px)' }}>
          {/* Emoji al lado del nombre (compacto) */}
          <div className="flex items-center gap-2 mb-1">
            <span className="text-2xl md:text-3xl drop-shadow-[0_3px_12px_oklch(0.68_0.16_340_/_0.3)]">{motivo.emoji}</span>
            <h3 className="font-heading font-extrabold text-xl md:text-2xl tracking-tight text-foreground">{acceso.nombre}</h3>
          </div>

          {(acceso.estado !== 'available' || acceso.exclusivoComunidad) && (
            <div className="flex flex-wrap gap-1.5 mb-2">
              <EstadoBadge estado={acceso.estado} />
              {acceso.exclusivoComunidad && (
                <span className="px-2.5 py-0.5 rounded-full bg-violet-electric/20 text-violet-electric text-[9px] font-bold uppercase tracking-wide">
                  Exclusivo comunidad
                </span>
              )}
            </div>
          )}

          <p className="text-foreground/70 text-xs mb-2 leading-snug">{acceso.descripcion}</p>

          <ul className="space-y-1 mb-2">
            {acceso.beneficios.map((b) => (
              <li key={b} className="flex items-center gap-1.5 text-xs text-foreground/90">
                <Sparkles className="w-3 h-3 text-primary shrink-0" /> {b}
              </li>
            ))}
          </ul>

          {acceso.nota && (
            <p className="text-[10px] leading-snug text-foreground/80 bg-background/30 border border-white/10 rounded-lg p-2">
              {acceso.nota}
            </p>
          )}
        </div>

        {/* Precio + CTA */}
        <div className="relative mt-auto pt-2.5" style={{ transform: 'translateZ(30px)' }}>
          <span className="font-heading font-extrabold text-xl md:text-2xl text-gradient-candy block mb-2">
            {formatCLP(acceso.precio)}
          </span>

          {agotado ? (
            <span className="w-full py-2.5 rounded-full font-bold uppercase tracking-wide text-xs bg-muted text-muted-foreground cursor-not-allowed flex items-center justify-center">
              Agotado
            </span>
          ) : acceso.exclusivoComunidad ? (
            <div className="space-y-1.5">
              <a
                href={whatsappSolteroLink()}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-jelly w-full py-2.5 rounded-full font-bold uppercase tracking-wide text-[11px] bg-primary text-primary-foreground interactive flex items-center justify-center gap-1.5"
              >
                <MessageCircle className="w-3.5 h-3.5" /> Validarme por WhatsApp
              </a>
              <Link
                href={`/checkout/${CANDYLAND.slug}?items=${acceso.id}:1`}
                className="w-full py-2 rounded-full font-semibold text-[10px] uppercase tracking-wide border border-primary/40 text-foreground hover:border-primary interactive flex items-center justify-center"
              >
                Ya tengo mi código
              </Link>
            </div>
          ) : (
            <Link
              href={`/checkout/${CANDYLAND.slug}?items=${acceso.id}:1`}
              className="btn-jelly w-full py-2.5 rounded-full font-bold uppercase tracking-wide text-xs bg-primary text-primary-foreground interactive flex items-center justify-center"
            >
              Quiero este
            </Link>
          )}
        </div>
      </motion.div>
    </div>
  );
}
