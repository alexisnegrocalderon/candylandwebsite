import { useEffect, useState, type ReactNode } from 'react';
import { useLocation } from 'wouter';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown, Compass, MoreVertical, Share, SquarePlus, X } from 'lucide-react';
import { installHow, isInstalledApp, setInstallPromptVisible, useInstallPrompt } from '@/lib/appInstall';
import { hasWelcomeParam } from '@shared/welcome';

/* «Instala la App de PlayRoom»: una tarjeta chica pegada abajo, con los
 * colores del sitio. No tapa la página (sin fondo oscuro), no se arrastra y
 * nunca se esconde sola: se queda hasta que la cierran con la X o «Ahora
 * no» (y vuelve a los 3 días) o la instalan. En Android con Chrome es un
 * botón; en iPhone y otros, «Cómo instalarla» despliega ahí mismo los pasos
 * de SU teléfono. Nunca dentro de la app instalada, ni en el pago o en las
 * pantallas internas. */

const DISMISS_KEY = 'install-app.dismissed';
const DISMISS_MS = 3 * 86_400_000;
const SHOW_AFTER_MS = 4000;

/** Rutas donde el aviso estorbaría (pagando, ya en /app, pantallas internas). */
const QUIET = [/^\/checkout/, /^\/pago/, /^\/app$/, /^\/admin/, /^\/caja/, /^\/puerta/, /^\/fiesta/, /^\/gastos/, /^\/cocina/, /^\/guardarropia/, /^\/verificar/, /^\/recargar/, /^\/playmatch\/afiche/];

function dismissedRecently(): boolean {
  try {
    const at = Number(localStorage.getItem(DISMISS_KEY) || 0);
    return Date.now() - at < DISMISS_MS;
  } catch {
    return false;
  }
}

function isTouchDevice(): boolean {
  return typeof window !== 'undefined' && (window.matchMedia?.('(pointer: coarse)').matches ?? false);
}

function Step({ n, children }: { n: number; children: ReactNode }) {
  return (
    <li className="flex items-start gap-3">
      <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-primary/25 text-[11px] font-bold text-foreground">{n}</span>
      <span className="glass-text-soft pt-0.5 text-[13.5px] leading-snug">{children}</span>
    </li>
  );
}

const strong = 'glass-text font-bold';

export function InstallAppPrompt() {
  const [location] = useLocation();
  const prompt = useInstallPrompt();
  const [open, setOpen] = useState(false);
  const [steps, setSteps] = useState(false);
  const [how] = useState(installHow);
  const quiet = QUIET.some((r) => r.test(location));
  const visible = open && !quiet;

  useEffect(() => {
    // La ventana de bienvenida (al tocar la notificación) va primero.
    if (isInstalledApp() || !isTouchDevice() || dismissedRecently() || hasWelcomeParam(window.location.search)) return;
    const t = window.setTimeout(() => setOpen(true), SHOW_AFTER_MS);
    return () => window.clearTimeout(t);
  }, []);

  // Avisa a los demás avisos de la franja de abajo que esta tarjeta está a la vista.
  useEffect(() => {
    setInstallPromptVisible(visible);
    return () => setInstallPromptVisible(false);
  }, [visible]);

  const close = () => {
    setOpen(false);
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch { /* sin almacenamiento: vuelve a aparecer, no pasa nada */ }
  };

  const install = async () => {
    if (!prompt) return;
    await prompt.prompt();
    const { outcome } = await prompt.userChoice.catch(() => ({ outcome: 'dismissed' }));
    if (outcome === 'accepted') close();
  };

  // Con el aviso nativo de Chrome es un toque; si no, se despliegan los pasos.
  const direct = how === 'android' && !!prompt;

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          role="region"
          aria-label="Instala la App de PlayRoom"
          className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] px-4 pb-[max(16px,env(safe-area-inset-bottom))]"
          initial={{ opacity: 0, y: 28 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 28 }}
          transition={{ type: 'spring', damping: 30, stiffness: 320 }}
        >
          <div className="pointer-events-auto relative mx-auto max-w-md glass-float rounded-[26px] p-4">
            <button type="button" onClick={close} aria-label="Cerrar" className="glass-text-soft absolute right-3 top-3 hover:opacity-80"><X className="h-4 w-4" /></button>

            <div className="flex items-center gap-3 pr-6">
              <img src="/candyland/favicon-192.png" alt="" className="h-11 w-11 shrink-0 rounded-[14px] shadow-md ring-1 ring-white/50" />
              <div className="min-w-0">
                <p className="glass-text font-heading text-[16px] font-bold leading-tight">Instala la App de PlayRoom</p>
                <p className="glass-text-soft mt-0.5 text-[13px] leading-snug">Tu entrada, tu PlayCard y avisos a un toque. Gratis y sin tienda de apps.</p>
              </div>
            </div>

            <AnimatePresence initial={false}>
              {steps && !direct && (
                <motion.div
                  key="pasos"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.28, ease: [0.32, 0.72, 0, 1] }}
                  className="overflow-hidden"
                >
                  <div className="mt-3 max-h-[38dvh] overflow-y-auto overscroll-contain glass-float-inset rounded-2xl p-3">
                    {how === 'ios-safari' ? (
                      <ol className="space-y-2.5">
                        <Step n={1}>Toca <Share className="mx-0.5 inline h-4 w-4 text-sky-500" /> <b className={strong}>Compartir</b> (abajo en Safari).</Step>
                        <Step n={2}>Baja y elige <SquarePlus className="mx-0.5 inline h-4 w-4" /> <b className={strong}>Agregar a inicio</b>, y toca <b className={strong}>Agregar</b>.</Step>
                        <Step n={3}>Abre <b className={strong}>PlayRoom</b> desde el ícono nuevo de tu inicio.</Step>
                      </ol>
                    ) : how === 'ios-otro' ? (
                      <ol className="space-y-2.5">
                        <Step n={1}>Abre <b className={strong}>mansionplayroom.cl</b> en <Compass className="mx-0.5 inline h-4 w-4 text-sky-500" /> <b className={strong}>Safari</b> (en iPhone solo Safari instala apps).</Step>
                        <Step n={2}>Toca <Share className="mx-0.5 inline h-4 w-4 text-sky-500" /> <b className={strong}>Compartir</b> → <b className={strong}>Agregar a inicio</b>.</Step>
                        <Step n={3}>Abre <b className={strong}>PlayRoom</b> desde el ícono nuevo.</Step>
                      </ol>
                    ) : how === 'android' ? (
                      <ol className="space-y-2.5">
                        <Step n={1}>Toca el menú <MoreVertical className="mx-0.5 inline h-4 w-4" /> de Chrome (arriba a la derecha).</Step>
                        <Step n={2}>Elige <b className={strong}>Instalar app</b> o <b className={strong}>Agregar a la pantalla de inicio</b>.</Step>
                        <Step n={3}>Abre <b className={strong}>PlayRoom</b> desde el ícono nuevo.</Step>
                      </ol>
                    ) : (
                      <p className="glass-text-soft text-[13.5px]">Ábrela en tu celular: en Android toca «Instalar app» en el menú de Chrome; en iPhone, Compartir → Agregar a inicio en Safari.</p>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="mt-3 flex items-center gap-2">
              {direct ? (
                <button type="button" onClick={install} className="h-11 flex-1 rounded-full bg-primary text-sm font-bold text-primary-foreground interactive glass-float-btn">Instalar</button>
              ) : (
                <button
                  type="button"
                  onClick={() => setSteps((s) => !s)}
                  aria-expanded={steps}
                  className="glass-float-btn inline-flex h-11 flex-1 items-center justify-center gap-1.5 rounded-full bg-primary text-sm font-bold text-primary-foreground interactive"
                >
                  {steps ? 'Ocultar los pasos' : 'Cómo instalarla'}
                  <ChevronDown className={`h-4 w-4 transition-transform duration-300 ${steps ? 'rotate-180' : ''}`} />
                </button>
              )}
              <button type="button" onClick={close} className="h-11 shrink-0 glass-text-soft rounded-full px-4 text-sm font-semibold">Ahora no</button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
