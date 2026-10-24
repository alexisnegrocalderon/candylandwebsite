import { Link, useLocation } from "wouter";
import { Compass } from "lucide-react";
import { useSeo } from "@/hooks/useSeo";
import { useDarkChrome } from "@/lib/darkChrome";
import { useHalloweenMode } from "@/lib/halloween";

/* Página no encontrada: con la cara de la app (vidrio oscuro) y en español, igual
 * en el celular y en el computador. «Ir al inicio» lleva a la portada, que en el
 * celular es el inicio de la app. */
export default function NotFound() {
  const [location] = useLocation();
  const halloween = useHalloweenMode();
  useDarkChrome();
  useSeo({
    title: 'Página no encontrada — Mansion Playroom',
    description: 'La página que buscas no existe o fue movida.',
    path: location,
    noindex: true,
  });

  return (
    <div className={`account-font account-tokens relative flex min-h-dvh items-center justify-center bg-[#0b0612] px-5 text-white ${halloween ? 'pm-halloween' : ''}`}>
      <div className="account-backdrop" />
      <div className="account-glass relative z-10 w-full max-w-sm rounded-[28px] p-8 text-center">
        <span className="lg-pill mx-auto grid h-16 w-16 place-items-center rounded-[20px]"><Compass className="h-8 w-8 text-pink-300" /></span>
        <p className="mt-5 text-footnote font-semibold uppercase tracking-[0.2em] text-white/50">Error 404</p>
        <h1 className="mt-1 text-title1 font-bold tracking-tight">No encontramos esta página</h1>
        <p className="mt-2 text-subhead leading-relaxed text-white/65">Puede que el link haya cambiado o que ya no exista. Vuelve al inicio y sigue desde ahí.</p>
        <Link href="/" className="mt-6 flex h-14 items-center justify-center rounded-full bg-gradient-to-r from-pink-500 via-fuchsia-500 to-sky-500 text-headline font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.35)] interactive">
          Ir al inicio
        </Link>
      </div>
    </div>
  );
}
