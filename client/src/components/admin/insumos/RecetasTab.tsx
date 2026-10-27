import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { formatPorcion, glassInfo, mlDeReceta } from '@shared/insumos';
import { RecetaDialog } from './RecetaDialog';
import type { BarraData, BarraProducto } from './types';

type Filtro = 'todos' | 'sin' | 'con';

/** Los tragos de la carta como tarjetas: vaso, ingredientes con su porción y si ya tienen receta. Tocar uno abre
 * la ventana grande para armarla. */
export function RecetasTab({ data, onChanged }: { data: BarraData; onChanged: () => void }) {
  const [editing, setEditing] = useState<number | null>(null);
  const [filtro, setFiltro] = useState<Filtro>('todos');
  const [section, setSection] = useState<string>('todas');
  const [search, setSearch] = useState('');
  const insumoById = useMemo(() => new Map(data.insumos.map((i) => [i.id, i])), [data.insumos]);

  const sin = data.productos.filter((p) => p.receta.length === 0).length;
  const sections = useMemo(() => Array.from(new Set(data.productos.map((p) => p.groupName || 'Sin sección'))), [data.productos]);
  const q = search.trim().toLowerCase();
  const list = useMemo(() => data.productos
    .filter((p) => (filtro === 'todos' || (filtro === 'sin' ? p.receta.length === 0 : p.receta.length > 0))
      && (section === 'todas' || (p.groupName || 'Sin sección') === section)
      && (!q || p.name.toLowerCase().includes(q)))
    .sort((a, b) => Number(b.receta.length === 0) - Number(a.receta.length === 0) || a.name.localeCompare(b.name)), [data.productos, filtro, section, q]);
  const editingProducto: BarraProducto | null = data.productos.find((p) => p.id === editing) ?? null;

  if (data.productos.length === 0) {
    return <p className="text-sm text-muted-foreground">Este evento no tiene tragos en la Carta de la Fiesta todavía.</p>;
  }
  if (data.insumos.length === 0) {
    return <p className="text-sm text-muted-foreground">Primero crea los insumos (pestaña Stock → «+ Insumo» o «Cargar dosier»); después aquí armas cada trago tocando.</p>;
  }

  const chip = (on: boolean) => `shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-medium ${on ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`;

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar un trago…" className="pl-9" />
      </div>
      <div className="flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none]">
        <button type="button" onClick={() => setFiltro('todos')} className={chip(filtro === 'todos')}>Todos {data.productos.length}</button>
        <button type="button" onClick={() => setFiltro('sin')} className={chip(filtro === 'sin')}>Sin receta {sin}</button>
        <button type="button" onClick={() => setFiltro('con')} className={chip(filtro === 'con')}>Con receta {data.productos.length - sin}</button>
        {sections.length > 1 && <span className="mx-1 self-center text-muted-foreground">|</span>}
        {sections.length > 1 && ['todas', ...sections].map((s) => (
          <button key={s} type="button" onClick={() => setSection(s)} className={chip(section === s)}>{s === 'todas' ? 'Todas las secciones' : s}</button>
        ))}
      </div>

      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {list.map((p) => {
          const glass = glassInfo(p.glass);
          const ml = mlDeReceta(p.receta, (id) => insumoById.get(id)?.unit);
          const pct = glass && glass.ml > 0 && p.glass !== 'shot' ? Math.round((ml / glass.ml) * 100) : null;
          return (
            <li key={p.id}>
              <button type="button" onClick={() => setEditing(p.id)}
                className={`flex h-full w-full flex-col gap-2 rounded-2xl border-2 p-3 text-left transition active:scale-[0.98] ${p.receta.length === 0 ? 'border-dashed border-amber-500/50 bg-amber-500/5' : 'border-border bg-card/60 hover:bg-muted/60'}`}>
                <span className="flex items-center gap-2">
                  <span className="text-3xl leading-none">{p.emoji || '🍸'}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{p.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">{p.groupName ?? 'Sin sección'}{p.receta.length > 0 && glass ? ` · ${glass.label.toLowerCase()}${glass.ml > 0 ? ` ${glass.ml} ml` : ''}` : ''}</span>
                  </span>
                  {p.drinks !== null && <span className="shrink-0 text-right text-sm tabular-nums"><span className="block font-semibold">~{p.drinks}</span><span className="block text-[11px] text-muted-foreground">quedan</span></span>}
                </span>

                {p.receta.length === 0
                  ? <span className="rounded-xl bg-amber-500/15 px-3 py-2 text-sm font-medium text-amber-800 dark:text-amber-300">Sin receta · toca para armarla</span>
                  : (
                    <>
                      <span className="flex flex-wrap gap-1">
                        {p.receta.map((r) => {
                          const ins = insumoById.get(r.insumoId);
                          return <span key={r.insumoId} className="rounded-full bg-muted px-2 py-0.5 text-xs">{ins?.name ?? '¿?'} <strong>{formatPorcion(r.amount, ins?.unit ?? 'ml').replace(/ \(.*\)$/, '')}</strong></span>;
                        })}
                      </span>
                      {(p.extras ?? []).length > 0 && (
                        <span className="flex flex-wrap gap-1">
                          {(p.extras ?? []).map((e) => <span key={e} className="rounded-full border border-dashed border-border px-2 py-0.5 text-xs text-muted-foreground">+ {e}</span>)}
                        </span>
                      )}
                      {pct !== null && (
                        <span className="block h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
                          <span className={`block h-full rounded-full ${pct > 80 ? 'bg-red-500' : pct > 62 ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${Math.min(100, pct)}%` }} />
                        </span>
                      )}
                    </>
                  )}
              </button>
            </li>
          );
        })}
        {list.length === 0 && <li className="col-span-full text-sm text-muted-foreground">Ningún trago con ese filtro.</li>}
      </ul>

      <RecetaDialog producto={editingProducto} data={data} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); onChanged(); }} />
    </div>
  );
}
