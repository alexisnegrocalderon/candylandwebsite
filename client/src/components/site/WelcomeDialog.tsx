import { useEffect, useState } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { motion, useReducedMotion } from 'framer-motion';
import { Heart, HandHeart, Sparkles, X } from 'lucide-react';
import { useSearch } from 'wouter';
import { hasWelcomeParam, withoutWelcomeParam } from '@shared/welcome';

/* Ventana de bienvenida a la comunidad: se abre al tocar la notificación de
 * bienvenida (que lleva a `/?bienvenida=1`, ver shared/welcome.ts) desde
 * cualquier pantalla del sitio. Es el momento de decir quiénes somos:
 * respeto, consentimiento y libertad. Lo que se promete acá nunca incluye
 * regalos ni datos de la persona: el link lo puede escribir cualquiera. */

const VALUES = [
  { icon: Heart, title: 'Respeto', text: 'Cada persona importa. Tratamos a todxs como nos gustaría que nos traten.', tone: 'from-pink-500 to-fuchsia-500' },
  { icon: HandHeart, title: 'Consentimiento', text: 'Se pregunta siempre. Un no es no, y un sí se puede cambiar cuando quieras.', tone: 'from-fuchsia-500 to-violet-500' },
  { icon: Sparkles, title: 'Libertad', text: 'Tú decides hasta dónde y a qué ritmo. Sin presión y sin juicios.', tone: 'from-violet-500 to-sky-400' },
] as const;

export default function WelcomeDialog() {
  const search = useSearch();
  const [open, setOpen] = useState(false);
  const reduce = useReducedMotion();

  useEffect(() => {
    if (!hasWelcomeParam(search)) return;
    setOpen(true);
    // Se limpia el link: recargar la página no vuelve a mostrar la ventana.
    try {
      const { pathname, hash } = window.location;
      window.history.replaceState(window.history.state, '', `${pathname}${withoutWelcomeParam(window.location.search)}${hash}`);
    } catch { /* sin history: la ventana igual se muestra */ }
  }, [search]);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[100] bg-[#0b0612]/80 backdrop-blur-md data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0" />
        <DialogPrimitive.Content
          className="fixed left-1/2 top-1/2 z-[101] w-[calc(100vw-24px)] max-w-md max-h-[calc(100dvh-24px)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto overscroll-contain rounded-[2rem] border border-white/15 bg-[#140a22] text-white shadow-[0_30px_90px_-20px_rgba(236,72,153,0.55)] outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95"
          style={{ fontFamily: "Inter, system-ui, sans-serif" }}
          // Sin esto, el navegador enfoca la X al abrir y le dibuja un aro dorado.
          onOpenAutoFocus={(e) => { e.preventDefault(); (e.currentTarget as HTMLElement).focus(); }}
          tabIndex={-1}
        >
          {/* Luces de colores detrás: el vidrio necesita algo de color para lucirse. */}
          <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden rounded-[2rem]">
            <div className="absolute -left-24 -top-24 h-72 w-72 rounded-full bg-pink-500/40 blur-3xl" />
            <div className="absolute -bottom-28 -right-20 h-80 w-80 rounded-full bg-sky-500/35 blur-3xl" />
            <div className="absolute right-6 top-40 h-40 w-40 rounded-full bg-violet-500/25 blur-3xl" />
          </div>

          <DialogPrimitive.Close
            aria-label="Cerrar"
            className="absolute right-4 top-4 z-10 grid h-9 w-9 place-items-center rounded-full bg-white/10 text-white/80 transition hover:bg-white/20 hover:text-white"
          >
            <X className="h-4 w-4" />
          </DialogPrimitive.Close>

          <div className="relative px-6 pt-8 text-center sm:px-8">
            <motion.img
              src="/studio/logo-wordmark-white.png"
              alt="Mansion Playroom"
              className="mx-auto h-12 w-auto"
              initial={reduce ? false : { opacity: 0, y: -8, scale: 0.92 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.5, ease: 'easeOut' }}
            />

            <DialogPrimitive.Title className="font-heading mt-4 text-[1.65rem] font-extrabold leading-[1.12] tracking-tight">
              Bienvenidx
              <br />
              <span className="bg-gradient-to-r from-pink-400 via-fuchsia-400 to-sky-400 bg-clip-text text-transparent">a la comunidad</span>
              <br />
              Playroom
            </DialogPrimitive.Title>
            <DialogPrimitive.Description className="mx-auto mt-3 max-w-xs text-[14px] leading-relaxed text-white/75">
              Aquí nadie te apura y nadie te juzga. Esto lo hacemos entre todxs, y se sostiene en tres cosas:
            </DialogPrimitive.Description>

            <ul className="mt-5 space-y-2.5 text-left">
              {VALUES.map((v, i) => (
                <motion.li
                  key={v.title}
                  className="flex items-start gap-3.5 rounded-2xl border border-white/10 bg-white/[0.06] p-3.5 backdrop-blur-sm"
                  initial={reduce ? false : { opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.25 + i * 0.12, duration: 0.45, ease: 'easeOut' }}
                >
                  <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-gradient-to-br ${v.tone} shadow-lg shadow-pink-500/20`}>
                    <v.icon className="h-6 w-6 text-white" strokeWidth={2.2} />
                  </span>
                  <span className="min-w-0">
                    <span className="font-heading block text-lg font-bold leading-tight">{v.title}</span>
                    <span className="mt-0.5 block text-[13.5px] leading-snug text-white/70">{v.text}</span>
                  </span>
                </motion.li>
              ))}
            </ul>

            <p className="mx-auto mt-5 max-w-xs text-sm leading-relaxed text-white/65">
              Gracias por cuidar este espacio con nosotrxs. <span className="text-white/90">Aquí eres bienvenidx tal como eres.</span>
            </p>

            {/* El botón queda siempre a la vista, aunque el contenido haga scroll en un teléfono chico. */}
            <div className="sticky bottom-0 -mx-6 mt-4 bg-gradient-to-t from-[#140a22] via-[#140a22]/95 to-transparent px-6 pb-5 pt-5 sm:-mx-8 sm:px-8">
              <DialogPrimitive.Close className="inline-flex h-14 w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-pink-500 via-fuchsia-500 to-sky-500 text-base font-bold text-white shadow-lg shadow-pink-500/30 transition active:scale-[0.98]">
                Entrar a Playroom <Heart className="h-4 w-4 fill-white" />
              </DialogPrimitive.Close>
              <p className="mt-2.5 text-[11px] uppercase tracking-[0.2em] text-white/40">Evento +18 · Consentimiento siempre</p>
            </div>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
