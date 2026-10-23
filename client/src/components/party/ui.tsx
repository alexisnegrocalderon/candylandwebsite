import type { ReactNode } from 'react';
import { motion, useDragControls } from 'framer-motion';
import { X } from 'lucide-react';
import { PartyAvatar } from '@/components/party/Avatar';
import { ProtectedPhoto } from '@/components/party/ProtectedPhoto';
import type { PartyGender } from '@shared/party';

/* Piezas comunes de Playmatch con el vidrio y la letra de la App (account-glass, lg-pill, lg-sheet,
 * escala text-* de iOS): la hoja que sube, los botones redondos y la foto con el avatar de respaldo. */

/** Vibración leve al tocar (Android; Safari en iPhone no la permite a las páginas web). */
export const tap = () => { try { navigator.vibrate?.(8); } catch { /* sin vibración */ } };

/** El degradado de la marca, el mismo de la App. */
export const PM_GRADIENT = 'bg-gradient-to-r from-pink-500 via-fuchsia-500 to-sky-500';
/** Color del texto/ícono encima del degradado de la marca: blanco, y oscuro en modo Halloween (sobre lima el blanco no se lee). */
export const ON_ACCENT = 'text-[color:var(--pm-on-accent,#fff)]';
export const PM_CTA = `${PM_GRADIENT} ${ON_ACCENT} font-bold shadow-[0_10px_28px_-8px_var(--pm-glow,rgba(236,72,153,0.7)),inset_0_1px_0_rgba(255,255,255,0.4)]`;

/** Hoja que sube desde abajo; se cierra tocando afuera, con la X o arrastrando la manija. */
export function PmSheet({ title, onClose, children, tall = false }: { title?: string; onClose: () => void; children: ReactNode; tall?: boolean }) {
  const drag = useDragControls();
  return (
    <motion.div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/60" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
      <motion.div
        role="dialog" aria-label={title}
        className={`lg-sheet account-font account-tokens w-full max-w-md overflow-y-auto overscroll-contain rounded-t-[32px] px-5 pb-[max(24px,env(safe-area-inset-bottom))] pt-2 text-white ${tall ? 'h-[90dvh]' : 'max-h-[90dvh]'}`}
        initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 30, stiffness: 320 }}
        drag="y" dragControls={drag} dragListener={false} dragConstraints={{ top: 0, bottom: 0 }} dragElastic={{ top: 0, bottom: 0.6 }}
        onDragEnd={(_, info) => { if (info.offset.y > 90) onClose(); }}
        onClick={(e) => e.stopPropagation()}
      >
        <div onPointerDown={(e) => drag.start(e)} className="-mx-5 flex h-7 cursor-grab touch-none items-center justify-center"><div className="h-1.5 w-10 rounded-full bg-white/25" /></div>
        {title && (
          <div className="mb-4 flex items-center justify-between gap-3">
            <p className="text-title3 font-bold tracking-tight">{title}</p>
            <button type="button" onClick={onClose} aria-label="Cerrar" className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/10"><X className="h-4 w-4" /></button>
          </div>
        )}
        {children}
      </motion.div>
    </motion.div>
  );
}

/** Botón redondo de vidrio para la cabecera (con número encima si hay algo pendiente). */
export function GlassIconButton({ label, onClick, badge = 0, children }: { label: string; onClick: () => void; badge?: number; children: ReactNode }) {
  return (
    <button type="button" onClick={() => { tap(); onClick(); }} aria-label={label} className="lg-pill relative grid h-11 w-11 place-items-center rounded-full text-white interactive">
      {children}
      {badge > 0 && <span className={`absolute -right-0.5 -top-0.5 grid h-5 min-w-5 place-items-center rounded-full bg-pink-500 px-1 text-caption2 font-bold ${ON_ACCENT}`}>{badge}</span>}
    </button>
  );
}

/** Foto de la persona si se puede ver (los dos participan del swipe); si no, su avatar. */
export function PersonPhoto({ ticketCode, viewerAlias, canPhoto, person, className = '', quiet = true }: {
  ticketCode: string;
  viewerAlias: string;
  canPhoto: boolean;
  person: { id: number; gender: PartyGender; avatarId: number };
  className?: string;
  quiet?: boolean;
}) {
  const avatar = <PartyAvatar gender={person.gender} avatarId={person.avatarId} className="h-full w-full" />;
  if (!canPhoto) return <div className={`overflow-hidden ${className}`}>{avatar}</div>;
  return <ProtectedPhoto ticketCode={ticketCode} profileId={person.id} viewerAlias={viewerAlias} className={className} quiet={quiet} fallback={avatar} />;
}

/** Chip de vidrio para los datos de la tarjeta (género, zona, «Activa ahora»). */
export function Chip({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <span className={`inline-flex items-center gap-1 rounded-full bg-white/[0.14] px-2.5 py-1 text-caption1 font-semibold text-white backdrop-blur-md ${className}`}>{children}</span>;
}
