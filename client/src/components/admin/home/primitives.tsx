import type { ReactNode } from 'react';
import { ArrowRight, type LucideIcon } from 'lucide-react';

export const clp = (n: number) => `${n < 0 ? '-' : ''}$${Math.abs(Math.round(n)).toLocaleString('es-CL')}`;

/** Panel de detalle de un resumen (Evento, Plata, Gente): lo abre su tarjeta
 * de arriba (SummaryTabs); acá solo va el contenido y un botón para cerrar. */
export function HomeBlock({ title, subtitle, icon: Icon, onClose, children }: { id?: string; title: string; subtitle?: string; icon: LucideIcon; onClose?: () => void; children: ReactNode }) {
  return (
    <section className="admin-clay p-4 md:p-5">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-[oklch(0.6_0.2_290)] text-white"><Icon className="h-5 w-5" /></span>
        <span className="min-w-0 flex-1">
          <span className="block font-heading text-lg leading-tight">{title}</span>
          {subtitle && <span className="block truncate text-xs text-muted-foreground">{subtitle}</span>}
        </span>
        {onClose && <button type="button" onClick={onClose} className="shrink-0 rounded-full px-3 py-1.5 text-xs text-muted-foreground hover:bg-white/10 hover:text-foreground">Cerrar ✕</button>}
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">{children}</div>
    </section>
  );
}

/** Tarjeta de un tema dentro de un bloque. */
export function Widget({ title, onMore, moreLabel = 'Ver', children, className = '' }: { title: string; onMore?: () => void; moreLabel?: string; children: ReactNode; className?: string }) {
  return (
    <div className={`min-w-0 rounded-2xl bg-white/5 p-4 ${className}`}>
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h4 className="text-sm font-semibold">{title}</h4>
        {onMore && <button type="button" onClick={onMore} className="shrink-0 text-xs text-muted-foreground hover:text-foreground">{moreLabel} →</button>}
      </div>
      {children}
    </div>
  );
}

/** Número grande con su etiqueta. */
export function MiniStat({ label, value, hint, tone, onClick }: { label: string; value: string | number; hint?: string; tone?: 'good' | 'warn' | 'bad'; onClick?: () => void }) {
  const color = tone === 'bad' ? 'text-red-300' : tone === 'warn' ? 'text-amber-300' : tone === 'good' ? 'text-emerald-300' : '';
  const inner = (
    <>
      <span className={`block truncate font-heading text-xl tabular-nums leading-tight ${color}`}>{value}</span>
      <span className="mt-0.5 block text-xs text-muted-foreground">{label}</span>
      {hint && <span className="block text-[11px] text-muted-foreground/80">{hint}</span>}
    </>
  );
  return onClick
    ? <button type="button" onClick={onClick} className="min-w-0 text-left hover:opacity-80">{inner}</button>
    : <div className="min-w-0">{inner}</div>;
}

/** Fila con barra de avance (vendidas / total). */
export function ProgressRow({ label, right, pct, tone, onClick }: { label: string; right: string; pct: number; tone?: 'good' | 'warn' | 'bad'; onClick?: () => void }) {
  const bar = tone === 'bad' ? 'from-red-400 to-red-300' : tone === 'warn' ? 'from-amber-400 to-amber-300' : 'from-primary to-secondary';
  const body = (
    <>
      <div className="mb-1 flex justify-between gap-2 text-sm">
        <span className="truncate">{label}</span>
        <span className="shrink-0 tabular-nums text-muted-foreground">{right}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-white/10">
        <div className={`h-full rounded-full bg-gradient-to-r ${bar}`} style={{ width: `${Math.max(2, Math.min(100, pct))}%` }} />
      </div>
    </>
  );
  return onClick ? <button type="button" onClick={onClick} className="block w-full text-left hover:opacity-90">{body}</button> : <div>{body}</div>;
}

/** Fila de lista que lleva a una sección. */
export function ListRow({ left, right, onClick }: { left: ReactNode; right?: ReactNode; onClick?: () => void }) {
  const inner = (
    <>
      <span className="min-w-0 flex-1 truncate">{left}</span>
      {right != null && <span className="shrink-0 tabular-nums text-muted-foreground">{right}</span>}
      {onClick && <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
    </>
  );
  const cls = 'flex w-full items-center gap-2 py-1 text-left text-sm';
  return onClick ? <button type="button" onClick={onClick} className={`${cls} hover:opacity-80`}>{inner}</button> : <div className={cls}>{inner}</div>;
}

export function Unavailable() {
  return <p className="text-xs text-muted-foreground">No se pudo cargar este dato.</p>;
}
