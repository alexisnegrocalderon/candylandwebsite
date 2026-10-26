import { useMemo, useState } from 'react';
import { formatPorcion, glassInfo } from '@shared/insumos';
import { RecetaForm } from './RecetaForm';
import type { BarraData, BarraProducto } from './types';

/** Receta de cada trago de la carta: el vaso en que sale y qué insumos gasta (y cuántos ml). */
export function RecetasTab({ data, onChanged }: { data: BarraData; onChanged: () => void }) {
  const [editing, setEditing] = useState<number | null>(null);
  const [onlyMissing, setOnlyMissing] = useState(false);
  const insumoById = useMemo(() => new Map(data.insumos.map((i) => [i.id, i])), [data.insumos]);

  const groups = useMemo(() => {
    const map = new Map<string, BarraProducto[]>();
    for (const p of data.productos) {
      if (onlyMissing && p.receta.length > 0) continue;
      const key = p.groupName || 'Sin sección';
      map.set(key, [...(map.get(key) ?? []), p]);
    }
    return Array.from(map, ([name, items]) => ({ name, items: items.sort((a, b) => a.name.localeCompare(b.name)) }));
  }, [data.productos, onlyMissing]);

  if (data.productos.length === 0) {
    return <p className="text-sm text-muted-foreground">Este evento no tiene tragos en la Carta de la Fiesta todavía.</p>;
  }
  if (data.insumos.length === 0) {
    return <p className="text-sm text-muted-foreground">Primero crea los insumos (pestaña Stock → «+ Insumo»); después aquí eliges cuánto gasta cada trago.</p>;
  }

  const missing = data.productos.filter((p) => p.receta.length === 0).length;
  const describe = (receta: { insumoId: number; amount: number }[]) => receta.map((r) => {
    const ins = insumoById.get(r.insumoId);
    return `${ins?.name ?? '¿?'} ${formatPorcion(r.amount, ins?.unit ?? 'ml')}`;
  }).join(' · ');

  return (
    <div className="space-y-4">
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={onlyMissing} onChange={(e) => setOnlyMissing(e.target.checked)} className="h-4 w-4" />
        Solo los que no tienen receta ({missing})
      </label>
      {groups.map((g) => (
        <section key={g.name} className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{g.name}</h3>
          {g.items.map((p) => (
            <div key={p.id} className="rounded-2xl border border-border bg-card/60 p-3">
              {editing === p.id ? (
                <RecetaForm producto={p} data={data} onCancel={() => setEditing(null)} onSaved={() => { setEditing(null); onChanged(); }} />
              ) : (
                <button type="button" onClick={() => setEditing(p.id)} className="flex w-full items-start gap-3 text-left">
                  <span className="text-2xl leading-none">{p.emoji || '🍸'}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold">{p.name}</span>
                    {p.receta.length === 0
                      ? <span className="block text-sm text-amber-500">Sin receta: no descuenta insumos</span>
                      : (
                        <span className="block text-sm text-muted-foreground">
                          <strong className="text-foreground">{glassInfo(p.glass)?.label ?? p.glass} · </strong>
                          {describe(p.receta)}
                        </span>
                      )}
                  </span>
                  {p.drinks !== null && (
                    <span className="shrink-0 text-right text-sm tabular-nums">
                      <span className="block font-semibold">~{p.drinks}</span>
                      <span className="block text-[11px] text-muted-foreground">quedan</span>
                    </span>
                  )}
                </button>
              )}
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}
