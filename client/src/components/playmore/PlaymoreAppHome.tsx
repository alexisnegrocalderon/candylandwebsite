import { Link } from 'wouter';
import { CalendarDays, CircleUser } from 'lucide-react';
import PlayroomDalmore from '@/pages/PlayroomDalmore';

/* La portada de la app mientras dura PLAYMORE: es EXACTAMENTE la misma página que la landing (hero, fusión de las dos marcas, la noche
 * minuto a minuto, accesos con «¿Con quién vienes?», selector de tickets, botón flotante, compras en vivo, código y preguntas), no una
 * copia. Lo único propio de la app: «Mi cuenta» y «Eventos» arriba y un cierre con los mismos accesos. Así la compra se ve igual en
 * la web y en la app. */

export default function PlaymoreAppHome({ previewToken, isPreview = false }: { previewToken?: string; isPreview?: boolean }) {
  return (
    <div className="relative">
      <header className={`pointer-events-none absolute inset-x-0 z-[60] flex items-center justify-between px-5 ${isPreview ? 'top-[calc(max(8px,env(safe-area-inset-top))+44px)]' : 'top-0 pt-[max(14px,env(safe-area-inset-top))]'}`}>
        <img src="/candyland/logo-isotipo-transparent.png" alt="Mansion Playroom" className="h-9 w-9" />
        <span className="pointer-events-auto flex items-center gap-2">
          <Link href="/eventos" aria-label="Eventos" className="grid h-10 w-10 place-items-center rounded-full border border-[#d6b25e]/45 bg-black/45 text-[#e9d9b0] backdrop-blur"><CalendarDays className="h-[18px] w-[18px]" /></Link>
          <Link href="/cuenta" aria-label="Mi cuenta" className="grid h-10 w-10 place-items-center rounded-full border border-[#d6b25e]/45 bg-black/45 text-[#e9d9b0] backdrop-blur"><CircleUser className="h-5 w-5" /></Link>
        </span>
      </header>
      <PlayroomDalmore inApp previewToken={previewToken} />
      <nav aria-label="Tu cuenta" className="playmore mx-auto flex max-w-xs flex-col gap-3 px-5 pb-28 pt-2">
        <Link href="/cuenta" className="inline-flex h-12 items-center justify-center gap-2 rounded-full border border-[#d6b25e]/45 text-xs font-semibold tracking-[0.2em] uppercase text-[#e9d9b0] hover:bg-white/5"><CircleUser className="h-4 w-4" /> Mi cuenta y mis entradas</Link>
        <Link href="/eventos" className="inline-flex h-12 items-center justify-center gap-2 rounded-full border border-[#d6b25e]/25 text-xs font-semibold tracking-[0.2em] uppercase text-[#e9d9b0]/80 hover:bg-white/5"><CalendarDays className="h-4 w-4" /> Otros eventos</Link>
      </nav>
    </div>
  );
}
