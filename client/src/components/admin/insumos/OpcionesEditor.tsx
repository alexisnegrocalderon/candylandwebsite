import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { OpcionGrupo } from '@shared/insumos';

type InsumoLite = { id: number; name: string; unit: string };

/** Opciones que la cajera elige al vender (con qué bebida va, qué variante es). Cada opción descuenta SU insumo, y la
 * receta del trago puede dejar de gastar el insumo genérico (la «bebida de mezcla») cuando se elige una. */
export function OpcionesEditor({ grupos, onChange, insumos, lineas }: {
  grupos: OpcionGrupo[];
  onChange: (g: OpcionGrupo[]) => void;
  insumos: InsumoLite[];
  /** Los insumos que hoy lleva la receta (para elegir cuál reemplaza la opción) y cuánto. */
  lineas: { insumoId: number; amount: number }[];
}) {
  const [adding, setAdding] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const nameOf = (id: number) => insumos.find((i) => i.id === id)?.name ?? '¿?';
  const unitOf = (id: number) => insumos.find((i) => i.id === id)?.unit ?? 'ml';
  const upd = (id: string, fn: (g: OpcionGrupo) => OpcionGrupo) => onChange(grupos.map((g) => (g.id === id ? fn(g) : g)));

  const nuevo = (label: string) => {
    // «Con qué bebida va»: reemplaza la bebida de mezcla de la receta, si la tiene.
    const mezcla = lineas.find((l) => /mezcla|bebida/i.test(nameOf(l.insumoId)));
    const id = `g${Date.now().toString(36)}`;
    onChange([...grupos, { id, label, reemplaza: label === 'Acompañante' ? mezcla?.insumoId ?? null : null, choices: [] }]);
    setAdding(id);
  };
  const addChoice = (g: OpcionGrupo, insumoId: number) => {
    if (g.choices.some((c) => c.insumoId === insumoId)) return;
    const reemplazada = lineas.find((l) => l.insumoId === g.reemplaza);
    // Misma medida que la línea que reemplaza si el insumo se mide igual; si se cuenta por unidad (latas), 1.
    const amount = unitOf(insumoId) === 'ml' ? reemplazada?.amount ?? 200 : 1;
    upd(g.id, (x) => ({ ...x, choices: [...x.choices, { id: `${g.id}-${insumoId}`, label: nameOf(insumoId), insumoId, amount }] }));
    setSearch('');
  };

  const q = search.trim().toLowerCase();
  return (
    <section>
      <h3 className="mb-1 text-sm font-semibold">Opciones al vender</h3>
      <p className="mb-2 text-xs text-muted-foreground">La cajera elige al tocar el trago en /caja y se descuenta el insumo elegido. El precio es el mismo.</p>

      <div className="space-y-3">
        {grupos.map((g) => (
          <div key={g.id} className="space-y-2 rounded-2xl border-2 border-border bg-card/60 p-3">
            <div className="flex items-center gap-2">
              <Input value={g.label} onChange={(e) => upd(g.id, (x) => ({ ...x, label: e.target.value }))} aria-label="Nombre de la opción" className="h-10 font-semibold" />
              <Button type="button" variant="ghost" size="icon" aria-label="Quitar este grupo de opciones" onClick={() => onChange(grupos.filter((x) => x.id !== g.id))}><X className="h-4 w-4" /></Button>
            </div>

            <div className="space-y-1.5">
              {g.choices.map((c) => (
                <div key={c.id} className="flex items-center gap-2 rounded-xl bg-muted/50 px-3 py-1.5">
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{c.label}</span>
                  <Input type="number" inputMode="decimal" min={0} value={c.amount} aria-label={`Cuánto gasta ${c.label}`} className="h-9 w-20 text-center tabular-nums"
                    onChange={(e) => upd(g.id, (x) => ({ ...x, choices: x.choices.map((y) => (y.id === c.id ? { ...y, amount: Math.max(0, Number(e.target.value) || 0) } : y)) }))} />
                  <span className="w-6 text-xs text-muted-foreground">{unitOf(c.insumoId)}</span>
                  <Button type="button" variant="ghost" size="icon" aria-label={`Quitar ${c.label}`} onClick={() => upd(g.id, (x) => ({ ...x, choices: x.choices.filter((y) => y.id !== c.id) }))}><X className="h-4 w-4" /></Button>
                </div>
              ))}
              {g.choices.length === 0 && <p className="text-xs text-amber-600 dark:text-amber-400">Agrega al menos una opción.</p>}
            </div>

            {lineas.length > 0 && (
              <div>
                <p className="mb-1 text-xs text-muted-foreground">Al elegir una, deja de gastarse de la receta:</p>
                <div className="flex flex-wrap gap-1.5">
                  {[{ id: null as number | null, name: 'Nada (se suma)' }, ...lineas.map((l) => ({ id: l.insumoId as number | null, name: nameOf(l.insumoId) }))].map((o) => (
                    <button key={String(o.id)} type="button" aria-pressed={g.reemplaza === o.id} onClick={() => upd(g.id, (x) => ({ ...x, reemplaza: o.id }))}
                      className={`rounded-full px-3 py-1 text-xs font-medium ${g.reemplaza === o.id ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>{o.name}</button>
                  ))}
                </div>
              </div>
            )}

            {adding === g.id ? (
              <div className="space-y-2">
                <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar insumo (Coca Cola, Sprite…)" autoFocus />
                <div className="flex max-h-40 flex-wrap gap-1.5 overflow-y-auto">
                  {insumos.filter((i) => !g.choices.some((c) => c.insumoId === i.id) && (!q || i.name.toLowerCase().includes(q))).slice(0, 40).map((i) => (
                    <button key={i.id} type="button" onClick={() => addChoice(g, i.id)} className="rounded-full border-2 border-border bg-card px-3 py-1.5 text-sm hover:bg-muted active:scale-95">{i.name}</button>
                  ))}
                </div>
                <Button type="button" variant="outline" size="sm" onClick={() => { setAdding(null); setSearch(''); }}>Listo</Button>
              </div>
            ) : (
              <Button type="button" variant="outline" size="sm" onClick={() => setAdding(g.id)}><Plus className="mr-1 h-4 w-4" /> Agregar opción</Button>
            )}
          </div>
        ))}
      </div>

      <div className="mt-2 flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => nuevo('Acompañante')}><Plus className="mr-1 h-4 w-4" /> Con qué bebida va</Button>
        <Button type="button" variant="outline" size="sm" onClick={() => nuevo('Variante')}><Plus className="mr-1 h-4 w-4" /> Variante (mismo precio)</Button>
      </div>
    </section>
  );
}
