import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { AnimatePresence, motion } from 'framer-motion';
import { BellRing, Compass, MoreVertical, Share, SquarePlus, Ticket, X, Zap } from 'lucide-react';
import { installHow, isInstalledApp, useInstallPrompt } from '@/lib/appInstall';
import { hasWelcomeParam } from '@shared/welcome';

/* «Instala la App de PlayRoom en tu dispositivo»: una hoja que sube desde
 * abajo en el sitio (celular o tablet), con los pasos de SU teléfono. En
 * Android con Chrome es un solo botón; en iPhone, los 3 pasos de Safari.
 * Se cierra y vuelve a los 3 días; nunca dentro de la app instalada, ni en
 * el pago o en las pantallas internas. */

const DISMISS_KEY = 'install-app.dismissed';
const DISMISS_MS = 3 * 86_400_000;
const SHOW_AFTER_MS = 4000;

/** Rutas donde la hoja estorbaría (pagando, ya en /app, pantallas internas). */
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

const BENEFITS = [
  { icon: Ticket, text: 'Tu entrada, tu PlayCard y tus Playcoins a un toque.' },
  { icon: Zap, text: 'Abre al tiro, a pantalla completa, como cualquier app.' },
  { icon: BellRing, text: 'Avisos de preventas, concursos y el día de tu evento.' },
];

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3">
      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-gradient-to-br from-pink-500 to-sky-500 text-xs font-bold text-white">{n}</span>
      <span className="pt-0.5 text-[14px] leading-snug text-white/80">{children}</span>
    </li>
  );
}

export function InstallAppPrompt() {
  const [location] = useLocation();
  const prompt = useInstallPrompt();
  const [open, setOpen] = useState(false);
  const [how] = useState(installHow);
  const quiet = QUIET.some((r) => r.test(location));

  useEffect(() => {
    // La ventana de bienvenida (al tocar la notificación) va primero.
    if (isInstalledApp() || !isTouchDevice() || dismissedRecently() || hasWelcomeParam(window.location.search)) return;
    const t = window.setTimeout(() => setOpen(true), SHOW_AFTER_MS);
    return () => window.clearTimeout(t);
  }, []);

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

  return (
    <AnimatePresence>
      {open && !quiet && (
        <>
          <motion.div className="fixed inset-0 z-[90] bg-black/50" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={close} />
          <motion.div
            role="dialog"
            aria-label="Instala la App de PlayRoom"
            className="account-font fixed inset-x-0 bottom-0 z-[91] mx-auto max-w-md rounded-t-[32px] bg-[#140a1f] px-5 pb-[calc(env(safe-area-inset-bottom)+20px)] pt-3 text-white shadow-[0_-20px_60px_rgba(0,0,0,0.6)]"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 320 }}
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.6 }}
            onDragEnd={(_, info) => { if (info.offset.y > 90) close(); }}
          >
            <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-white/25" />
            <button type="button" onClick={close} aria-label="Cerrar" className="absolute right-4 top-4 grid h-9 w-9 place-items-center rounded-full bg-white/10"><X className="h-4 w-4" /></button>

            <div className="flex items-center gap-3 pr-10">
              <img src="/candyland/favicon-192.png" alt="" className="h-14 w-14 shrink-0 rounded-[16px] shadow-lg" />
              <div className="min-w-0">
                <p className="text-[19px] font-bold leading-tight">Instala la App de PlayRoom</p>
                <p className="text-[13px] text-white/60">en tu dispositivo, gratis y sin tienda de apps</p>
              </div>
            </div>

            <ul className="mt-4 space-y-2">
              {BENEFITS.map(({ icon: Icon, text }) => (
                <li key={text} className="flex items-start gap-2.5 text-[13.5px] text-white/80"><Icon className="mt-0.5 h-4 w-4 shrink-0 text-pink-300" />{text}</li>
              ))}
            </ul>

            <div className="mt-4 rounded-[22px] bg-white/[0.06] p-4">
              {how === 'android' && prompt ? (
                <button type="button" onClick={install} className="h-12 w-full rounded-full bg-gradient-to-r from-pink-500 via-fuchsia-500 to-sky-500 text-[15px] font-bold text-white">
                  Instalar la app
                </button>
              ) : how === 'android' ? (
                <ol className="space-y-3">
                  <Step n={1}>Toca el menú <MoreVertical className="mx-0.5 inline h-4 w-4" /> de Chrome (arriba a la derecha).</Step>
                  <Step n={2}>Elige <b className="text-white">Instalar app</b> o <b className="text-white">Agregar a la pantalla de inicio</b>.</Step>
                  <Step n={3}>Abre <b className="text-white">PlayRoom</b> desde el ícono nuevo.</Step>
                </ol>
              ) : how === 'ios-safari' ? (
                <ol className="space-y-3">
                  <Step n={1}>Toca <Share className="mx-0.5 inline h-4 w-4 text-sky-400" /> <b className="text-white">Compartir</b> (abajo en Safari).</Step>
                  <Step n={2}>Baja y elige <SquarePlus className="mx-0.5 inline h-4 w-4" /> <b className="text-white">Agregar a inicio</b>, y toca <b className="text-white">Agregar</b>.</Step>
                  <Step n={3}>Abre <b className="text-white">PlayRoom</b> desde el ícono nuevo de tu inicio.</Step>
                </ol>
              ) : how === 'ios-otro' ? (
                <ol className="space-y-3">
                  <Step n={1}>Abre <b className="text-white">mansionplayroom.cl</b> en <Compass className="mx-0.5 inline h-4 w-4 text-sky-400" /> <b className="text-white">Safari</b> (en iPhone solo Safari instala apps).</Step>
                  <Step n={2}>Toca <Share className="mx-0.5 inline h-4 w-4 text-sky-400" /> <b className="text-white">Compartir</b> → <b className="text-white">Agregar a inicio</b>.</Step>
                  <Step n={3}>Abre <b className="text-white">PlayRoom</b> desde el ícono nuevo.</Step>
                </ol>
              ) : (
                <p className="text-[14px] text-white/75">Ábrela en tu celular: en Android toca «Instalar app» en el menú de Chrome; en iPhone, Compartir → Agregar a inicio en Safari.</p>
              )}
            </div>

            <button type="button" onClick={close} className="mt-3 h-11 w-full rounded-full text-[14px] font-semibold text-white/60">Ahora no</button>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
