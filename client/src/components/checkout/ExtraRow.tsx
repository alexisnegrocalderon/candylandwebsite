import type { ReactNode } from 'react';
import { ChevronDown, Minus, Plus } from 'lucide-react';

/* Piezas de «Revisa y paga» dentro de la app: filas estilo Ajustes de iPhone para
 * los extras (con − n + a la derecha) y la cabecera de las secciones que se abren
 * (¿Agregamos algo más?, ¿Tienes un código?). */

const clp = (n: number) => `$${Math.round(n).toLocaleString('es-CL')}`;

/** Cabecera de un `<details>`: ícono de vidrio, título, ayuda corta y flecha que gira al abrir. */
export function DisclosureSummary({ icon, title, hint, badge }: { icon: ReactNode; title: string; hint?: string; badge?: string }) {
  return (
    <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3.5 [&::-webkit-details-marker]:hidden">
      <span aria-hidden className="lg-pill grid h-10 w-10 shrink-0 place-items-center rounded-[13px] text-pink-300">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-body font-semibold leading-tight">{title}</span>
        {hint && <span className="mt-0.5 block text-footnote text-white/55">{hint}</span>}
      </span>
      {badge && <span className="shrink-0 rounded-full bg-white/10 px-2.5 py-1 text-caption1 font-semibold tabular-nums">{badge}</span>}
      <ChevronDown className="h-5 w-5 shrink-0 text-white/40 transition-transform group-open:rotate-180" />
    </summary>
  );
}

export function ExtraRow({ emoji, name, price, original, scarce, qty, max, onChange }: {
  emoji?: string | null;
  name: string;
  price: number;
  original?: number | null;
  /** Cupos que quedan, solo cuando de verdad son pocos. */
  scarce?: number | null;
  qty: number;
  max: number;
  onChange: (delta: number) => void;
}) {
  const hasDiscount = original != null && original > price;
  const savePct = hasDiscount ? Math.round((1 - price / original!) * 100) : 0;
  return (
    <div className={`flex items-center gap-3 px-4 py-3 ${qty > 0 ? 'bg-white/[0.06]' : ''}`}>
      <span aria-hidden className="lg-pill grid h-10 w-10 shrink-0 place-items-center rounded-[13px] text-xl">{emoji || '🎫'}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-body font-semibold leading-tight">{name}</span>
        <span className="mt-0.5 flex flex-wrap items-baseline gap-x-2 text-footnote">
          <span className="font-semibold tabular-nums text-white/80">{clp(price)}</span>
          {hasDiscount && <span className="tabular-nums text-white/40 line-through">{clp(original!)}</span>}
          {hasDiscount && <span className="rounded-full bg-emerald-400/15 px-1.5 py-0.5 text-caption2 font-semibold text-emerald-300">Ahorras {savePct}%</span>}
          {scarce != null && <span className="font-semibold text-amber-300">Quedan {Math.max(0, scarce)}</span>}
        </span>
      </span>
      {qty > 0 ? (
        <span className="flex shrink-0 items-center gap-1 rounded-full bg-white/10 p-1">
          <button type="button" onClick={() => onChange(-1)} aria-label={`Quitar ${name}`} className="grid h-8 w-8 place-items-center rounded-full interactive"><Minus className="h-4 w-4" /></button>
          <span className="w-5 text-center text-body font-semibold tabular-nums">{qty}</span>
          <button type="button" onClick={() => onChange(1)} disabled={qty >= max} aria-label={`Agregar ${name}`} className="grid h-8 w-8 place-items-center rounded-full bg-white text-[#0b0612] interactive disabled:opacity-35"><Plus className="h-4 w-4" /></button>
        </span>
      ) : (
        <button type="button" onClick={() => onChange(1)} disabled={max <= 0} aria-label={`Agregar ${name}`} className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white/12 text-white interactive disabled:opacity-30"><Plus className="h-5 w-5" /></button>
      )}
    </div>
  );
}
