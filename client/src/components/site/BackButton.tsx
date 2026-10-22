import { ChevronLeft } from 'lucide-react';
import { useLocation } from 'wouter';

/** Botón «Volver» de vidrio para las pantallas sin menú (la entrada, la recarga): en la app instalada no hay
 * flecha del navegador y el gesto de deslizar no lo conoce todo el mundo. Vuelve a donde venías; si la
 * pantalla se abrió directo (link del correo o aviso), va a «Mi cuenta». */
export function BackButton({ fallback = '/cuenta', label = 'Volver' }: { fallback?: string; label?: string }) {
  const [, navigate] = useLocation();
  const back = () => {
    let sameOrigin = false;
    try { sameOrigin = !!document.referrer && new URL(document.referrer).origin === location.origin; } catch { /* sin referrer */ }
    if (window.history.length > 1 && (sameOrigin || (window.history.state && window.history.state.key))) window.history.back();
    else navigate(fallback);
  };
  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-40 px-3 pt-[max(10px,env(safe-area-inset-top))]">
      <button type="button" onClick={back} className="lg-pill pointer-events-auto inline-flex h-10 items-center gap-0.5 rounded-full pl-2 pr-4 text-[15px] font-semibold text-white interactive" aria-label={label}>
        <ChevronLeft className="h-5 w-5" />{label}
      </button>
    </div>
  );
}
