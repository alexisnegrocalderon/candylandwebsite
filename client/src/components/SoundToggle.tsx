import { useEffect, useState } from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import { useSound } from '@/lib/sound/SoundContext';

/* Botón de sonido del header: círculo igual al de Instagram (mismas clases de
 * contraste claro/oscuro que Navbar.tsx), con un mini-ecualizador cuando está
 * sonando. `hint` muestra, solo en la primera visita, un globito que invita a
 * activarlo -- se oculta solo y no vuelve a salir en la misma sesión. */

const HINT_KEY = 'mp_sound_hint';

export default function SoundToggle({ light, hint = false, size = 16 }: { light: boolean; hint?: boolean; size?: number }) {
  const { enabled, playing, toggle } = useSound();
  const [showHint, setShowHint] = useState(false);

  useEffect(() => {
    if (!hint || enabled) return;
    let seen = true;
    try {
      seen = sessionStorage.getItem(HINT_KEY) === '1' || localStorage.getItem('mp_sound') !== null;
    } catch {
      seen = true;
    }
    if (seen) return;
    const show = setTimeout(() => setShowHint(true), 3200);
    const hide = setTimeout(() => {
      setShowHint(false);
      try { sessionStorage.setItem(HINT_KEY, '1'); } catch { /* no es crítico */ }
    }, 9200);
    return () => { clearTimeout(show); clearTimeout(hide); };
  }, [hint, enabled]);

  useEffect(() => {
    if (enabled) setShowHint(false);
  }, [enabled]);

  const label = enabled ? 'Silenciar el sonido del sitio' : 'Activar el sonido del sitio';

  return (
    <span className="relative inline-flex">
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
      {showHint && (
        <span
          role="status"
          className="pointer-events-none absolute right-0 top-full mt-2 whitespace-nowrap rounded-full bg-foreground text-background text-xs font-semibold px-3 py-1.5 shadow-lg animate-in fade-in slide-in-from-top-1 duration-300"
        >
          🔊 Activa el sonido
        </span>
      )}
    </span>
  );
}
