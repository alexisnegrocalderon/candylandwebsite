import { ChevronLeft, CircleUser } from 'lucide-react';
import { useLocation } from 'wouter';

/* Barra de arriba del «modo app» (la App de PlayRoom instalada, con sesión de
 * socio): reemplaza el menú del sitio en cualquier página que se abra desde
 * la app, así nunca se nota que se salió a la web. «Volver» regresa a la
 * pantalla anterior (y a la pestaña donde estaba en «Mi cuenta»); si no hay
 * a dónde volver, va a «Mi cuenta». */

export function AppTopBar() {
  const [, navigate] = useLocation();
  const back = () => {
    if (window.history.length > 1) window.history.back();
    else navigate('/cuenta', { replace: true });
  };
  return (
    <header className="account-font fixed inset-x-0 top-0 z-[70] flex items-center justify-between gap-2 border-b border-white/10 bg-[#0b0612]/80 px-3 pb-2 pt-[max(10px,env(safe-area-inset-top))] text-white backdrop-blur-xl">
      <button type="button" onClick={back} aria-label="Volver" className="inline-flex h-10 items-center gap-0.5 rounded-full pl-1 pr-3 text-subhead font-semibold text-pink-300 interactive">
        <ChevronLeft className="h-6 w-6" /> Volver
      </button>
      <img src="/candyland/logo-isotipo-transparent.png" alt="" className="h-8 w-8" />
      <button type="button" onClick={() => navigate('/cuenta')} aria-label="Mi cuenta" className="grid h-10 w-10 place-items-center rounded-full bg-white/10 interactive">
        <CircleUser className="h-5 w-5" />
      </button>
    </header>
  );
}
