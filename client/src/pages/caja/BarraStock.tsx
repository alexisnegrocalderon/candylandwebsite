import { useEffect, useMemo, useState } from 'react';
import { formatCantidad, nivelInsumo, tragosPorInsumo } from '@shared/insumos';
import { getLocalBarra, type CajaBarra } from './db';

const LEVEL = {
  agotado: { label: 'Se acabó', dot: 'bg-red-500', chip: 'bg-red-500/15 text-red-300' },
  bajo: { label: 'Queda poco', dot: 'bg-amber-400', chip: 'bg-amber-500/15 text-amber-300' },
  ok: { label: 'OK', dot: 'bg-emerald-400', chip: 'bg-emerald-500/15 text-emerald-300' },
  sin_uso: { label: 'Sin receta', dot: 'bg-white/30', chip: 'bg-white/10 text-white/50' },
} as const;

/** Stock de la barra en vivo, con semáforo: lo que queda de cada licor e insumo y para cuántos tragos alcanza.
 * Sale de lo descargado en la tablet y baja con cada venta, así que también sirve sin señal. */
export function BarraStock({ version }: { version: number }) {
  const [barra, setBarra] = useState<CajaBarra | null | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    const read = () => getLocalBarra().then((b) => { if (alive) setBarra(b); });
    read();
    const id = window.setInterval(read, 5_000); // las ventas descuentan el stock local al instante
    return () => { alive = false; window.clearInterval(id); };
  }, [version]);

  const rows = useMemo(() => {
    if (!barra) return [];
    return barra.insumos.map((i) => {
      const drinks = tragosPorInsumo(i.id, i.stock, barra.recetas);
      return { ...i, drinks, level: nivelInsumo(drinks, i.alertDrinks) };
    }).sort((a, b) => {
      const rank = { agotado: 0, bajo: 1, ok: 2, sin_uso: 3 } as const;
      return rank[a.level] - rank[b.level] || (a.drinks ?? 1e9) - (b.drinks ?? 1e9) || a.name.localeCompare(b.name);
    });
  }, [barra]);

  if (barra === undefined) return <p className="text-sm text-white/50">Cargando stock…</p>;
  if (!barra || rows.length === 0) {
    return <p className="text-sm text-white/60">Todavía no hay stock de barra cargado para este evento. El admin lo arma en Eventos → Stock de Barra.</p>;
  }
  const count = (l: keyof typeof LEVEL) => rows.filter((r) => r.level === l).length;

  return (
    <div className="space-y-3">
      <div>
        <h1 className="text-xl font-bold">Stock de barra</h1>
        <p className="text-sm text-white/60">Baja solo con cada venta. Si no cuadra con lo que ves, avisa al supervisor.</p>
      </div>
      <div className="grid grid-cols-3 gap-2 text-center">
        {(['agotado', 'bajo', 'ok'] as const).map((l) => (
          <div key={l} className="rounded-2xl admin-clay admin-clay-sm p-2">
            <p className="text-xl font-bold tabular-nums">{count(l)}</p>
            <p className="text-[11px] text-white/60"><span className={`mr-1 inline-block h-2 w-2 rounded-full ${LEVEL[l].dot}`} />{LEVEL[l].label}</p>
          </div>
        ))}
      </div>
      <ul className="space-y-2">
        {rows.map((r) => (
          <li key={r.id} className="flex items-center gap-3 rounded-2xl admin-clay admin-clay-sm p-3">
            <span className={`h-3 w-3 shrink-0 rounded-full ${LEVEL[r.level].dot}`} aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">{r.name}</p>
              <p className="text-sm text-white/60 tabular-nums">{formatCantidad(r.stock, r)}</p>
            </div>
            <div className="shrink-0 text-right">
              {r.drinks !== null && <p className="text-lg font-bold tabular-nums">~{r.drinks}</p>}
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${LEVEL[r.level].chip}`}>{r.drinks !== null ? 'tragos' : LEVEL[r.level].label}</span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
