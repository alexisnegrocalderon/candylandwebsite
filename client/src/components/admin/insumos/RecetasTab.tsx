import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Plus, Trash2 } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { WriteButton } from '@/components/admin/WriteButton';
import { GLASSES, JIGGER_ML, esJiggerExacto, formatPorcion, glassInfo, jiggersAMl, mlAJiggers, mlDeReceta, type GlassId } from '@shared/insumos';
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
                <RecetaEditor producto={p} data={data} onCancel={() => setEditing(null)} onSaved={() => { setEditing(null); onChanged(); }} />
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

/** Una línea de la receta. Los insumos en ml se miden en jiggers (30 ml) o en ml; `amount` está en la
 * medida de `jigger` (1,5 = un jigger y medio) y siempre se guarda en ml. */
type Line = { insumoId: number | null; amount: string; jigger: boolean };

function lineFromReceta(insumoId: number, ml: number, unit: string | undefined): Line {
  const jigger = unit === 'ml' && esJiggerExacto(ml);
  return { insumoId, jigger, amount: String(jigger ? mlAJiggers(ml) : ml) };
}

function RecetaEditor({ producto, data, onCancel, onSaved }: { producto: BarraProducto; data: BarraData; onCancel: () => void; onSaved: () => void }) {
  const unitOf = (id: number | null) => data.insumos.find((i) => i.id === id)?.unit;
  const [glass, setGlass] = useState<GlassId>((glassInfo(producto.glass)?.id ?? 'vaso') as GlassId);
  const [lines, setLines] = useState<Line[]>(
    producto.receta.length ? producto.receta.map((r) => lineFromReceta(r.insumoId, r.amount, unitOf(r.insumoId))) : [{ insumoId: null, amount: '', jigger: true }],
  );
  const save = trpc.insumos.setReceta.useMutation({
    onSuccess: () => { toast.success(`Receta de ${producto.name} guardada`); onSaved(); },
    onError: (e) => toast.error(e.message),
  });
  const update = (idx: number, patch: Partial<Line>) => setLines((ls) => ls.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  const used = new Set(lines.map((l) => l.insumoId));
  const toMl = (l: Line) => (l.jigger && unitOf(l.insumoId) === 'ml' ? jiggersAMl(Number(l.amount)) : Number(l.amount));
  const clean = lines.filter((l) => l.insumoId !== null && Number(l.amount) > 0).map((l) => ({ insumoId: l.insumoId!, amount: toMl(l) }));
  // Cambiar entre jiggers y ml convierte lo que ya está escrito.
  const switchMode = (idx: number, jigger: boolean) => setLines((ls) => ls.map((l, i) => {
    if (i !== idx || l.jigger === jigger) return l;
    const n = Number(l.amount);
    return { ...l, jigger, amount: l.amount === '' || !Number.isFinite(n) ? l.amount : String(jigger ? mlAJiggers(n) : jiggersAMl(n)) };
  }));

  const info = glassInfo(glass)!;
  const totalMl = mlDeReceta(clean, (id) => data.insumos.find((i) => i.id === id)?.unit);
  const overflow = totalMl > info.ml;

  return (
    <div className="space-y-3">
      <p className="font-semibold">{producto.emoji || '🍸'} {producto.name}</p>

      <div>
        <p className="mb-1 text-xs font-medium text-muted-foreground">Sale en</p>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Vaso en que sale este trago">
          {GLASSES.map((g) => (
            <button key={g.id} type="button" role="radio" aria-checked={glass === g.id} onClick={() => setGlass(g.id)}
              className={`rounded-full px-3 py-1.5 text-sm font-medium ${glass === g.id ? 'bg-primary text-white' : 'bg-muted text-muted-foreground'}`}>
              {g.emoji} {g.label} {g.ml} ml
            </button>
          ))}
        </div>
      </div>

      {lines.map((l, idx) => {
        const ins = data.insumos.find((i) => i.id === l.insumoId);
        const isMl = ins?.unit === 'ml';
        const inJigger = isMl && l.jigger;
        return (
          <div key={idx} className="space-y-1">
            <div className="flex items-center gap-2">
              <Select value={l.insumoId ? String(l.insumoId) : ''} onValueChange={(v) => update(idx, { insumoId: Number(v), jigger: unitOf(Number(v)) === 'ml' ? l.jigger : false })}>
                <SelectTrigger className="min-w-0 flex-1"><SelectValue placeholder="Insumo" /></SelectTrigger>
                <SelectContent>
                  {data.insumos.filter((i) => i.id === l.insumoId || !used.has(i.id)).map((i) => <SelectItem key={i.id} value={String(i.id)}>{i.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <div className="relative w-28 shrink-0">
                <Input type="number" inputMode="decimal" min={0} step={inJigger ? 0.25 : 1} value={l.amount} onChange={(e) => update(idx, { amount: e.target.value })} placeholder="0" className="pr-14" aria-label={inJigger ? 'Jiggers por trago' : 'Cantidad por trago'} />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">{inJigger ? 'jigger' : ins?.unit ?? ''}</span>
              </div>
              <Button variant="ghost" size="icon" aria-label="Quitar" onClick={() => setLines((ls) => ls.filter((_, i) => i !== idx))}><Trash2 className="h-4 w-4" /></Button>
            </div>
            {isMl && (
              <div className="flex items-center gap-2 pl-1 text-xs text-muted-foreground">
                <span>Medir en</span>
                {([true, false] as const).map((j) => (
                  <button key={String(j)} type="button" onClick={() => switchMode(idx, j)}
                    className={`rounded-full px-2.5 py-0.5 font-medium ${l.jigger === j ? 'bg-primary text-white' : 'bg-muted'}`}>
                    {j ? `jigger (${JIGGER_ML} ml)` : 'ml'}
                  </button>
                ))}
                {Number(l.amount) > 0 && <span className="tabular-nums">= {formatPorcion(toMl(l), 'ml')}</span>}
              </div>
            )}
          </div>
        );
      })}
      {totalMl > 0 && (
        <p className={`text-xs ${overflow ? 'text-amber-500' : 'text-muted-foreground'}`}>
          Suma {totalMl.toLocaleString('es-CL')} ml de líquido en un {info.label.toLowerCase()} de {info.ml} ml{overflow ? ' — no cabe: revisa las cantidades' : ''}.
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => setLines((ls) => [...ls, { insumoId: null, amount: '', jigger: true }])} disabled={lines.length >= data.insumos.length}>
          <Plus className="mr-1 h-4 w-4" /> Insumo
        </Button>
        <div className="flex-1" />
        <Button variant="ghost" size="sm" onClick={onCancel}>Cancelar</Button>
        <WriteButton size="sm" disabled={save.isPending} onClick={() => save.mutate({ ticketTypeId: producto.id, glass, lines: clean })}>
          {save.isPending ? 'Guardando…' : 'Guardar receta'}
        </WriteButton>
      </div>
    </div>
  );
}
