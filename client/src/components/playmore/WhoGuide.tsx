import { useEffect, useMemo, useState } from 'react';
import { whoAvailable, whoCounts, whoForCount, countHasCodeOption, type WhoKey, type WhoOption } from '@shared/playmoreWho';

/* «¿Con quién vienes?» en dos pasos, con la cara de PLAYMORE: primero cuántos son (1, 2, 3 o 4) y después quiénes, que decide
 * el acceso y avisa —antes de pagar— quién necesita código de comunidad. Lo usan la landing, el selector de tickets y la compra:
 * cada uno decide qué hacer con la opción elegida (`onPick`). */

const clp = (n: number) => `$${Math.round(n).toLocaleString('es-CL')}`;
const GOLD = '#d6b25e';

/** Siluetas: f = mujer, m = hombre. */
export function Figures({ s, h = 26, color = GOLD }: { s: string; h?: number; color?: string }) {
  return (
    <span className="inline-flex items-end gap-[3px]" aria-hidden="true">
      {s.split('').map((k, i) => (
        <svg key={i} width={h * 0.6} height={h} viewBox="0 0 24 40">
          <circle cx="12" cy="8" r="6" fill={color} />
          {k === 'f' ? <path d="M12 15 L3 36 H21 Z" fill={color} /> : <rect x="5" y="15" width="14" height="21" rx="4" fill={color} />}
        </svg>
      ))}
    </span>
  );
}

type GuideType = { accesoSlug?: string | null; category?: string | null; status?: string | null; hasStock?: boolean; price: number; originalPrice?: number | null; name?: string };

export function WhoGuide<T extends GuideType>({ types, value, onPick, className = '', labels = true }: {
  types: readonly T[];
  /** La opción elegida (para marcarla). */
  value: WhoKey | null;
  onPick: (o: WhoOption & { type: T }) => void;
  className?: string;
  /** Muestra los títulos «1 · ¿CUÁNTOS SON?» y «2 · ¿QUIÉNES SON?». */
  labels?: boolean;
}) {
  const avail = useMemo(() => whoAvailable(types), [types]);
  const counts = useMemo(() => whoCounts(avail), [avail]);
  const [count, setCount] = useState<number | null>(() => avail.find((o) => o.key === value)?.people ?? null);
  // Si la opción cambia desde afuera (por ejemplo el acceso destacado al abrir el selector), el paso 1 la sigue.
  useEffect(() => { const p = avail.find((o) => o.key === value)?.people; if (p) setCount(p); }, [value, avail]);
  const options = whoForCount(avail, count);
  const warn = countHasCodeOption(avail, count);
  if (avail.length === 0) return null;

  return (
    <div className={className}>
      {labels && <p className="mb-2 text-[10px] font-semibold tracking-[0.3em] text-[var(--pm-sand)]/80">1 · ¿CUÁNTOS SON?</p>}
      <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${counts.length}, minmax(0, 1fr))` }} role="radiogroup" aria-label="Cuántos son">
        {counts.map((n) => {
          const on = count === n;
          const sample = avail.find((o) => o.people === n)!;
          return (
            <button key={n} type="button" role="radio" aria-checked={on} onClick={() => setCount(n)}
              className={`flex flex-col items-center rounded-2xl border px-1 py-3 transition active:scale-[0.98] ${on ? 'border-[#d6b25e] bg-[#d6b25e]/10' : 'border-[#d6b25e]/35 bg-white/[0.03] hover:border-[#d6b25e]/70'}`}>
              <Figures s={sample.figures.length === n ? sample.figures : 'f'.repeat(n)} h={n === 4 ? 22 : 28} color={on ? '#f7e7a8' : GOLD} />
              <span className={`mt-1.5 text-lg font-extrabold leading-none ${on ? 'playmore-gold' : ''}`}>{n}</span>
              <span className="mt-0.5 text-[9px] font-semibold tracking-[0.14em] text-[var(--pm-sand)]/65">{n === 1 ? 'SOLO/A' : n === 2 ? 'DÚO' : n === 3 ? 'TRÍO' : 'GRUPO'}</span>
            </button>
          );
        })}
      </div>

      {labels && <p className="mb-2 mt-4 text-[10px] font-semibold tracking-[0.3em] text-[var(--pm-sand)]/80">2 · ¿QUIÉNES SON?</p>}
      {count == null ? (
        <p className="mt-3 rounded-2xl border border-dashed border-[#d6b25e]/30 px-4 py-5 text-center text-[11px] font-semibold tracking-[0.18em] text-[var(--pm-sand)]/55">ELIGE ARRIBA CUÁNTOS SON</p>
      ) : (
        <div className="space-y-2.5 pt-1" role="radiogroup" aria-label="Quiénes son" style={{ ['--stub' as string]: '104px' }}>
          {options.map((o) => {
            const sold = o.type.status === 'soldout' || o.type.hasStock === false;
            const on = value === o.key && !sold;
            return (
              <button key={o.key} type="button" role="radio" aria-checked={on} disabled={sold} onClick={() => onPick(o)}
                style={{ ['--stub' as string]: '104px' }}
                className={`playmore-ticket-card flex w-full items-stretch rounded-2xl text-left transition active:scale-[0.99] ${on ? 'ring-2 ring-inset ring-[#f7e7a8]' : ''} ${sold ? 'opacity-55' : ''}`}>
                <span className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3">
                  <Figures s={o.figures} h={o.people === 4 ? 20 : 26} color={on ? '#f7e7a8' : GOLD} />
                  <span className="min-w-0">
                    <span className="block text-[13px] font-extrabold tracking-[0.05em]">{o.label}</span>
                    {o.note && <span className="mt-0.5 block text-[9px] font-semibold leading-snug tracking-[0.12em] text-[#e477ea]">{o.note}</span>}
                    {o.type.originalPrice != null && o.type.originalPrice > o.type.price && !sold && <span className="text-[10px] text-white/40 line-through tabular-nums">{clp(o.type.originalPrice)}</span>}
                  </span>
                </span>
                <span className="playmore-gold flex w-[104px] shrink-0 items-center justify-center rounded-r-2xl border-l border-dashed border-[#d6b25e]/35 bg-[#d6b25e]/5 px-2 text-[17px] font-extrabold tabular-nums">
                  {sold ? <span className="text-[10px] font-bold tracking-[0.2em] text-[var(--pm-sand)]">AGOTADO</span> : o.type.price > 0 ? clp(o.type.price) : 'Gratis'}
                </span>
              </button>
            );
          })}
          {warn && (
            <p className="rounded-2xl border border-[#e477ea]/40 bg-[#e477ea]/[0.06] px-3.5 py-2.5 text-[9.5px] font-semibold leading-relaxed tracking-[0.1em] text-[#ffb3e2]">
              {count === 1 ? 'SI VIENES SOLO (HOMBRE)' : 'SI ELIGES DOS HOMBRES'}, TE PEDIMOS TU CÓDIGO DE COMUNIDAD. ¿NO LO TIENES? TE LLEVAMOS A WHATSAPP PARA VALIDARTE.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
