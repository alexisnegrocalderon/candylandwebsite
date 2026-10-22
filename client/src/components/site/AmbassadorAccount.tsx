import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowRight, Check, ChevronLeft, Copy, Crown, Link2 } from 'lucide-react';
import type { inferRouterOutputs } from '@trpc/server';
import type { AppRouter } from '../../../../server/routers';
import { trpc } from '@/lib/trpc';
import { AmbassadorContent } from './AmbassadorContent';
import { AmbassadorDetails } from './AmbassadorDetails';

/* La parte de embajador de «Mi cuenta»: si el correo con el que entró es de
 * un embajador activo, ve acá sus números del evento, su link y su código, y
 * todo el contenido aprobado para compartir -- sin tener que acordarse de
 * /embajador/<CODIGO>. Los datos son los mismos del panel por código
 * (server/ambassadorProgram.ts → getAmbassadorPanel). */

export type AmbassadorPanel = NonNullable<inferRouterOutputs<AppRouter>['member']['ambassador']>;

/** `null` mientras carga o si no es embajador: «Mi cuenta» queda igual que siempre. */
export function useAmbassadorPanel(): AmbassadorPanel | null {
  const { data } = trpc.member.ambassador.useQuery(undefined, { retry: false, staleTime: 60_000 });
  return data ?? null;
}

function CopyChip({ text, label, mono = false }: { text: string; label: string; mono?: boolean }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={() => { void navigator.clipboard.writeText(text).then(() => { setDone(true); setTimeout(() => setDone(false), 2000); }).catch(() => {}); }}
      className="flex w-full min-w-0 items-center justify-between gap-2 rounded-2xl bg-white/[0.08] px-4 py-3 text-left interactive"
    >
      <span className="min-w-0">
        <span className="block text-[11px] text-white/55">{done ? '¡Copiado!' : label}</span>
        <span className={`block truncate text-sm font-semibold ${mono ? 'font-mono' : ''}`}>{text}</span>
      </span>
      {done ? <Check className="h-4 w-4 shrink-0 text-emerald-300" /> : <Copy className="h-4 w-4 shrink-0 text-white/60" />}
    </button>
  );
}

/** Resumen corto: lo que más importa a la vista, con lo demás a un toque. */
export function AmbassadorSummary({ panel, onDetails }: { panel: AmbassadorPanel; onDetails: () => void }) {
  const stats = panel.stats;
  return (
    <div className="account-glass space-y-3 rounded-[26px] p-4">
      <div className="flex items-center gap-2">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-pink-500 to-sky-500"><Crown className="h-4 w-4 text-white" /></span>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-bold leading-tight">Eres embajador{panel.name ? `: ${panel.name}` : ''}</p>
          {stats && <p className="truncate text-xs text-white/55">{stats.eventTitle}</p>}
        </div>
      </div>
      {stats && (
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-2xl bg-white/[0.06] px-2 py-2.5"><p className="text-lg font-bold leading-none">{stats.eventSales}</p><p className="mt-1 text-[10.5px] text-white/55">ventas</p></div>
          <div className="rounded-2xl bg-white/[0.06] px-2 py-2.5"><p className="text-lg font-bold leading-none text-pink-300">{stats.currentPercent}%</p><p className="mt-1 text-[10.5px] text-white/55">comisión</p></div>
          <div className="rounded-2xl bg-white/[0.06] px-2 py-2.5"><p className="text-lg font-bold leading-none">${(panel.eventStats?.commission ?? stats.eventCommission ?? 0).toLocaleString('es-CL')}</p><p className="mt-1 text-[10.5px] text-white/55">ganado</p></div>
        </div>
      )}
      {stats?.nextTarget && (
        <p className="text-xs text-white/60">Te faltan <strong className="text-white">{stats.nextTarget.salesNeeded}</strong> venta{stats.nextTarget.salesNeeded === 1 ? '' : 's'} para subir al <strong className="text-pink-300">{stats.nextTarget.nextPercent}%</strong>.</p>
      )}
      <div className="grid gap-2">
        {panel.referralUrl && <CopyChip text={panel.referralUrl} label="Tu link (para el sticker «Enlace» o WhatsApp)" />}
        <CopyChip text={panel.code} label="Tu código" mono />
      </div>
      <button type="button" onClick={onDetails} className="flex w-full items-center justify-center gap-1.5 py-1 text-xs font-semibold text-pink-300 interactive">
        <Link2 className="h-3.5 w-3.5" /> Ver todas mis ventas y beneficios <ArrowRight className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

/** Una pantalla de la app que entra deslizándose desde la derecha, con
 * «Volver» siempre a la vista. Lo de abajo no se desmonta: al volver queda
 * exactamente donde estaba (misma pestaña, mismo scroll). El gesto o botón
 * «atrás» del teléfono también la cierra, en vez de salir de «Mi cuenta». */
function useBackClosable(open: boolean, onClose: () => void) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const pushed = useRef(false);
  useEffect(() => {
    if (!open) return;
    window.history.pushState({ ...(window.history.state ?? {}), accountScreen: true }, '');
    pushed.current = true;
    const onPop = () => { pushed.current = false; closeRef.current(); };
    window.addEventListener('popstate', onPop);
    return () => {
      window.removeEventListener('popstate', onPop);
      // Cerrada con «Volver»: se saca la entrada que se agregó, así el «atrás» del teléfono no queda doble.
      if (pushed.current) { pushed.current = false; window.history.back(); }
    };
  }, [open]);
}

export function AppScreen({ open, title, onClose, children }: { open: boolean; title: string; onClose: () => void; children: React.ReactNode }) {
  useBackClosable(open, onClose);
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          key="screen"
          className="account-font account-tokens fixed inset-0 z-[80] flex flex-col bg-[#0b0612] text-white"
          initial={{ x: '100%' }}
          animate={{ x: 0 }}
          exit={{ x: '100%' }}
          transition={{ type: 'spring', damping: 32, stiffness: 320, mass: 0.9 }}
        >
          <div className="account-backdrop" />
          <header className="relative z-10 flex shrink-0 items-center gap-2 px-3 pb-2 pt-[max(12px,env(safe-area-inset-top))]">
            <button type="button" onClick={onClose} className="inline-flex h-10 items-center gap-0.5 rounded-full pl-1 pr-3 text-[15px] font-semibold text-pink-300 interactive" aria-label="Volver">
              <ChevronLeft className="h-6 w-6" /> Volver
            </button>
            <h2 className="min-w-0 flex-1 truncate text-center text-[17px] font-bold pr-16">{title}</h2>
          </header>
          <div className="relative z-10 min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-[calc(env(safe-area-inset-bottom)+24px)]">
            <div className="mx-auto max-w-lg pt-2">{children}</div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

/** Resumen + todo el contenido para compartir; «Ver todas mis ventas» abre
 * el detalle dentro de la app, sin salir a la página del panel. */
export function AmbassadorAccount({ panel }: { panel: AmbassadorPanel }) {
  const [details, setDetails] = useState(false);
  const close = useCallback(() => setDetails(false), []);
  return (
    <div className="account-tokens space-y-4">
      <AmbassadorSummary panel={panel} onDetails={() => setDetails(true)} />
      <AmbassadorContent code={panel.code} events={panel.contentEvents ?? []} items={panel.contentItems ?? []} material={panel.weeklyMaterial ?? null} />
      <AppScreen open={details} title="Mis ventas y beneficios" onClose={close}>
        <AmbassadorDetails data={panel} />
      </AppScreen>
    </div>
  );
}
