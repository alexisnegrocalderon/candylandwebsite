import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Bell, BellRing, Share, SquarePlus, X } from 'lucide-react';
import { dismissPrompt, isStandalone, promptDismissed, useCustomerPush, type PushSource } from '@/lib/customerPush';
import { pushPromptView } from '@/lib/pushPromptView';
import { useInstallPromptVisible } from '@/lib/appInstall';

/* "Activar avisos" del sitio (promos, concursos, recordatorio del evento).
 * En iPhone sin instalar enseña a agregar el sitio a inicio, porque iOS solo
 * entrega push a la app instalada; en Android y computador activa directo.
 * `card` va dentro de una página (entrada, pago, concursos, puntos); `banner`
 * es la barra inferior de la home. */

/* El sitio es claro (tokens del tema); la página de la entrada es oscura. */
const TONES = {
  light: { muted: 'text-muted-foreground', strong: 'text-foreground', chip: 'bg-muted', faint: 'text-muted-foreground/70', box: 'border-border bg-card', card: 'border-primary/25 bg-gradient-to-br from-primary/10 via-card to-sky-400/10' },
  dark: { muted: 'text-white/60', strong: 'text-white', chip: 'bg-white/10', faint: 'text-white/45', box: 'border-white/10 bg-white/[0.04]', card: 'border-primary/25 bg-gradient-to-br from-primary/12 via-white/[0.03] to-sky-400/10' },
};
type Tone = keyof typeof TONES;

const COPY: Record<PushSource, { title: string; text: string }> = {
  ticket: { title: 'Tu entrada a un toque', text: 'Te recordamos el evento ese día y te enteras primero de preventas y concursos.' },
  pago: { title: 'Te recordamos el evento', text: 'Activa los avisos: el recordatorio del día, más preventas y concursos antes que nadie.' },
  home: { title: 'Entérate primero', text: 'Preventas, concursos y promos directo en tu teléfono.' },
  concurso: { title: 'Te avisamos si ganas', text: 'Activa los avisos y entérate al tiro de los resultados y del próximo concurso.' },
  puntos: { title: 'No te pierdas tus premios', text: 'Te avisamos de promos, concursos y cuando se acerque el próximo evento.' },
  app: { title: 'Activa los avisos', text: 'Preventas, concursos y el recordatorio del evento, directo en tu teléfono.' },
};

function IosSteps({ tone }: { tone: Tone }) {
  const t = TONES[tone];
  return (
    <ol className={`mt-3 space-y-2 text-[13px] ${t.muted}`}>
      <li className="flex items-center gap-2">
        <span className={`grid place-items-center w-6 h-6 rounded-full ${t.chip} text-[11px] font-bold shrink-0`}>1</span>
        Toca <Share className="w-4 h-4 text-sky-500 shrink-0" aria-label="Compartir" /> <b className={t.strong}>Compartir</b> en Safari
      </li>
      <li className="flex items-center gap-2">
        <span className={`grid place-items-center w-6 h-6 rounded-full ${t.chip} text-[11px] font-bold shrink-0`}>2</span>
        Elige <SquarePlus className="w-4 h-4 shrink-0" aria-hidden /> <b className={t.strong}>Agregar a inicio</b>
      </li>
      <li className="flex items-center gap-2">
        <span className={`grid place-items-center w-6 h-6 rounded-full ${t.chip} text-[11px] font-bold shrink-0`}>3</span>
        <span>Abre <b className={t.strong}>Playroom</b> desde el ícono y activa los avisos</span>
      </li>
    </ol>
  );
}

export function PushPrompt({ source, ticketCode, orderNumber, tone = 'light', className = '', alwaysShow = false }: {
  source: PushSource;
  ticketCode?: string;
  orderNumber?: string;
  tone?: Tone;
  className?: string;
  /** Donde la persona lo pidió a propósito (la hoja «Avisos»): no se esconde aunque lo haya cerrado antes. */
  alwaysShow?: boolean;
}) {
  const t = TONES[tone];
  const { state, busy, error, enable, disable } = useCustomerPush({ source, ticketCode, orderNumber });
  const [closed, setClosed] = useState(() => promptDismissed());
  const copy = COPY[source];

  // La página de la entrada apunta el manifest a uno con la entrada adentro:
  // quien instala desde acá abre la app ya ligada a su compra (server/siteManifest.ts).
  useEffect(() => {
    if (source !== 'ticket' || !ticketCode) return;
    const link = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
    if (!link) return;
    const prev = link.getAttribute('href');
    link.setAttribute('href', `/api/site-manifest?t=${encodeURIComponent(ticketCode)}`);
    return () => { if (prev) link.setAttribute('href', prev); };
  }, [source, ticketCode]);

  const view = pushPromptView({ state, source, dismissed: closed, alwaysShow });
  if (view === 'none') return null;
  // En la entrada se muestra el "activado" (y se puede apagar); en el resto, nada.
  if (view === 'activated') {
    return (
      <div className={`flex items-center justify-between gap-3 rounded-2xl border ${t.box} px-4 py-3 text-sm ${className}`}>
        <span className={`inline-flex items-center gap-2 ${t.strong}`}><BellRing className="w-4 h-4 text-primary" /> Avisos activados</span>
        <button type="button" onClick={disable} disabled={busy} className={`text-xs ${t.faint} underline underline-offset-2 disabled:opacity-50`}>Desactivar</button>
      </div>
    );
  }
  if (view === 'blocked') {
    return (
      <p className={`text-xs ${t.faint} text-center ${className}`}>
        Bloqueaste los avisos de este sitio. Si los quieres, actívalos en los ajustes del navegador.
      </p>
    );
  }
  // Fuera de la entrada y el pago, cerrar el aviso lo esconde por 30 días (salvo con `alwaysShow`).
  const dismissible = source !== 'ticket' && source !== 'pago' && !alwaysShow;

  return (
    <div className={`relative rounded-2xl border ${t.card} p-4 text-left ${className}`}>
      {dismissible && (
        <button type="button" aria-label="Cerrar" onClick={() => { dismissPrompt(); setClosed(true); }} className={`absolute top-3 right-3 ${t.faint} hover:opacity-80`}>
          <X className="w-4 h-4" />
        </button>
      )}
      <div className="flex items-start gap-3 pr-5">
        <span className="grid place-items-center w-10 h-10 rounded-xl bg-primary/20 text-primary shrink-0"><Bell className="w-5 h-5" /></span>
        <div className="min-w-0">
          <p className={`font-heading font-bold text-[15px] leading-tight ${t.strong}`}>{state === 'ios-install' ? 'Agrega Playroom a tu inicio' : copy.title}</p>
          <p className={`text-[13px] ${t.muted} mt-1`}>{copy.text}</p>
        </div>
      </div>
      {state === 'ios-install' ? <IosSteps tone={tone} /> : (
        <button
          type="button"
          onClick={enable}
          disabled={busy}
          className="mt-3 w-full h-11 rounded-full bg-primary text-primary-foreground font-bold text-sm inline-flex items-center justify-center gap-2 interactive disabled:opacity-60"
        >
          <Bell className="w-4 h-4" /> {busy ? 'Activando…' : 'Activar avisos'}
        </button>
      )}
      {error && <p className="text-xs text-destructive mt-2">{error}</p>}
    </div>
  );
}

const VISITS_KEY = 'push-prompt.visits';

/** Barra inferior de la home: desde la 2.ª visita o tras 20 s navegando, y en
 * la app instalada siempre (ahí recién se puede pedir el permiso en iPhone). */
export function PushBanner() {
  const [show, setShow] = useState(false);
  // La franja de abajo es una sola: mientras el aviso de instalar está a la vista, este espera.
  const installOpen = useInstallPromptVisible();
  useEffect(() => {
    if (promptDismissed()) return;
    let visits = 1;
    try {
      if (!sessionStorage.getItem(VISITS_KEY)) {
        visits = Number(localStorage.getItem(VISITS_KEY) ?? 0) + 1;
        localStorage.setItem(VISITS_KEY, String(visits));
        sessionStorage.setItem(VISITS_KEY, '1');
      } else visits = Number(localStorage.getItem(VISITS_KEY) ?? 1);
    } catch { /* sin storage: solo por tiempo */ }
    if (isStandalone()) { const t = window.setTimeout(() => setShow(true), 2500); return () => window.clearTimeout(t); }
    if (visits >= 2) { const t = window.setTimeout(() => setShow(true), 4000); return () => window.clearTimeout(t); }
    const t = window.setTimeout(() => setShow(true), 20_000);
    return () => window.clearTimeout(t);
  }, []);

  return (
    <AnimatePresence>
      {show && !installOpen && (
        <motion.div
          initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 24 }}
          className="fixed inset-x-0 bottom-0 z-50 px-4 pb-[max(16px,env(safe-area-inset-bottom))] pointer-events-none"
        >
          <div className="max-w-md mx-auto pointer-events-auto rounded-2xl bg-background shadow-2xl shadow-black/25">
            <PushPrompt source={isStandalone() ? 'app' : 'home'} />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

