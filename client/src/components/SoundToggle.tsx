import { Volume2, VolumeX } from 'lucide-react';
import { useSound } from '@/lib/sound/SoundContext';

/* Botón de sonido del header: círculo igual al de Instagram (mismas clases de
 * contraste claro/oscuro que Navbar.tsx), con un mini-ecualizador cuando hay
 * una pista sonando. Silencia o permite el sonido de Pista Tech / Perreo. */

export default function SoundToggle({ light, size = 16 }: { light: boolean; size?: number }) {
  const { enabled, playing, toggle } = useSound();

  const label = enabled ? 'Silenciar el sonido del sitio' : 'Activar el sonido del sitio';

  return (
    <button
      type="button"
      data-sound-toggle
      onClick={toggle}
      aria-pressed={enabled}
      aria-label={label}
      title={label}
      className={`relative flex items-center justify-center w-9 h-9 rounded-full border transition-colors duration-300 interactive ${
        light
          ? `border-border/50 hover:border-primary/40 ${enabled ? 'text-primary' : 'text-muted-foreground hover:text-primary'}`
          : `border-white/25 bg-white/10 hover:text-white hover:bg-white/15 ${enabled ? 'text-white' : 'text-white/90'}`
      }`}
    >
      {enabled ? <Volume2 size={size} strokeWidth={1.75} /> : <VolumeX size={size} strokeWidth={1.75} />}
      {playing && (
        <span aria-hidden className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 flex items-end gap-[2px] h-2">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="eq-bar block w-[2px] h-full rounded-full bg-primary"
              style={{ animationDelay: `${i * 0.15}s` }}
            />
          ))}
        </span>
      )}
    </button>
  );
}
