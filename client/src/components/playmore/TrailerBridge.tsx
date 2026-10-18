import { useEffect, useRef, useState } from 'react';
import { Volume2 } from 'lucide-react';

/* Puente entre el ticket y la portada de PLAYMORE: al arrancar el talón, el
 * destello magenta se abre a este video (una sola vez) y al terminar se funde
 * en la portada. Se puede saltar con el botón o tocando la pantalla.
 *
 * Suena solo si la persona activó el sonido. Si el navegador bloquea el audio
 * (iOS cuando el talón se arranca deslizando, porque ese gesto no cuenta como
 * interacción), corre en silencio con un botón para activarlo. Si el video no
 * puede reproducirse, se pasa directo a la portada. */

export function TrailerBridge({ src, poster, soundOn, onDone }: {
  src: string;
  poster?: string;
  soundOn: boolean;
  onDone: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const doneRef = useRef(false);
  const [blocked, setBlocked] = useState(false);

  const finish = () => {
    if (doneRef.current) return;
    doneRef.current = true;
    videoRef.current?.pause();
    onDone();
  };
  const finishRef = useRef(finish);
  finishRef.current = finish;

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !soundOn;
    v.play().catch(() => {
      // Audio bloqueado: se reintenta en silencio; si tampoco, a la portada.
      v.muted = true;
      setBlocked(soundOn);
      v.play().catch(() => finishRef.current());
    });
    // Por si el video se queda pegado (red lenta): nunca más que su
    // duración + 3 s, ni más de 15 s si no llega a saber cuánto dura.
    let timer = window.setTimeout(() => finishRef.current(), 15000);
    const onMeta = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => finishRef.current(), (v.duration + 3) * 1000);
    };
    v.addEventListener('loadedmetadata', onMeta);
    if (v.readyState >= 1) onMeta();
    return () => {
      window.clearTimeout(timer);
      v.removeEventListener('loadedmetadata', onMeta);
    };
    // Se arma una vez: el sonido se ajusta en el efecto de abajo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const v = videoRef.current;
    if (v && !blocked) v.muted = !soundOn;
  }, [soundOn, blocked]);

  const unmute = (e: React.MouseEvent) => {
    e.stopPropagation();
    const v = videoRef.current;
    if (!v) return;
    v.muted = false;
    setBlocked(false);
  };

  return (
    <div className="playmore-intro fixed inset-0 z-[60] flex cursor-pointer items-center justify-center overflow-hidden bg-[#0c0908]"
      role="dialog" aria-label="Video PLAYROOM × DALMORE" onClick={() => finish()}>
      {/* Halo detrás: en vertical el video va a lo ancho y el resto respira. */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_40%_at_50%_50%,rgba(150,21,157,0.35),transparent_70%),radial-gradient(40%_30%_at_50%_55%,rgba(214,178,94,0.12),transparent_70%)]" aria-hidden="true" />
      <video
        ref={videoRef}
        src={src}
        poster={poster}
        playsInline
        preload="auto"
        className="relative max-h-full w-full object-contain shadow-[0_0_80px_rgba(150,21,157,0.35)]"
        onEnded={() => finish()}
        onError={() => finish()}
        onTimeUpdate={(e) => {
          const v = e.currentTarget;
          if (barRef.current && v.duration) barRef.current.style.transform = `scaleX(${v.currentTime / v.duration})`;
        }}
      />
      <div className="playmore-grain pointer-events-none absolute inset-0" aria-hidden="true" />
      {/* El destello magenta con que termina el ticket se abre al video. */}
      <div className="playmore-flash-out pointer-events-none absolute inset-0" aria-hidden="true"
        style={{ background: 'radial-gradient(circle at 50% 50%, #fff6e0 0%, #E477EA 30%, #96159D 60%, #0c0908 100%)' }} />

      <div className="absolute inset-x-0 top-0 flex items-center justify-end gap-2 p-4 pt-[max(env(safe-area-inset-top),1rem)] sm:p-6">
        {blocked && (
          <button type="button" onClick={unmute}
            className="flex h-10 items-center gap-2 rounded-full border border-[#d6b25e]/40 bg-black/40 px-4 text-[11px] font-semibold tracking-[0.15em] text-[#e9d9b0] backdrop-blur">
            <Volume2 className="h-4 w-4" /> ACTIVAR SONIDO
          </button>
        )}
        <button type="button" onClick={(e) => { e.stopPropagation(); finish(); }}
          className="h-10 rounded-full border border-[#d6b25e]/40 bg-black/40 px-5 text-[11px] font-semibold tracking-[0.2em] text-[#e9d9b0] backdrop-blur transition hover:bg-white/5 sm:text-xs">
          SALTAR
        </button>
      </div>

      {/* Progreso: línea dorada fina abajo. */}
      <div className="absolute inset-x-0 bottom-0 h-[2px] bg-white/10" aria-hidden="true">
        <div ref={barRef} className="h-full origin-left scale-x-0 bg-gradient-to-r from-[#7a5a22] via-[#f7e7a8] to-[#d6b25e]" />
      </div>
    </div>
  );
}

/** Si conviene mostrar el video: no con ahorro de datos ni con "reducir
 * movimiento" (esa gente ya ve la versión liviana del ticket). */
export function shouldPlayTrailer(): boolean {
  try {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
    const conn = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
    return !conn?.saveData;
  } catch {
    return true;
  }
}
