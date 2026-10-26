import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Plus, Trash2 } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { WriteButton } from '@/components/admin/WriteButton';
import type { BarraData, BarraProducto } from './types';

/** Receta de cada trago de la carta: qué insumos gasta y cuánto. */
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
                    <span className="block text-sm text-muted-foreground">
                      {p.receta.length === 0
                        ? <span className="text-amber-500">Sin receta: no descuenta insumos</span>
                        : p.receta.map((r) => {
                          const ins = insumoById.get(r.insumoId);
                          return `${ins?.name ?? '¿?'} ${r.amount.toLocaleString('es-CL')} ${ins?.unit ?? ''}`;
                        }).join(' · ')}
                    </span>
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

function RecetaEditor({ producto, data, onCancel, onSaved }: { producto: BarraProducto; data: BarraData; onCancel: () => void; onSaved: () => void }) {
  const [lines, setLines] = useState<{ insumoId: number | null; amount: string }[]>(
    producto.receta.length ? producto.receta.map((r) => ({ insumoId: r.insumoId, amount: String(r.amount) })) : [{ insumoId: null, amount: '' }],
  );
  const save = trpc.insumos.setReceta.useMutation({
    onSuccess: () => { toast.success(`Receta de ${producto.name} guardada`); onSaved(); },
    onError: (e) => toast.error(e.message),
  });
  const update = (idx: number, patch: Partial<(typeof lines)[number]>) => setLines((ls) => ls.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  const used = new Set(lines.map((l) => l.insumoId));

  const submit = () => {
    const clean = lines.filter((l) => l.insumoId !== null && Number(l.amount) > 0).map((l) => ({ insumoId: l.insumoId!, amount: Number(l.amount) }));
    save.mutate({ ticketTypeId: producto.id, lines: clean });
  };

  return (
    <div className="space-y-3">
      <p className="font-semibold">{producto.emoji || '🍸'} {producto.name}</p>
      {lines.map((l, idx) => {
        const ins = data.insumos.find((i) => i.id === l.insumoId);
        return (
          <div key={idx} className="flex items-center gap-2">
            <Select value={l.insumoId ? String(l.insumoId) : ''} onValueChange={(v) => update(idx, { insumoId: Number(v) })}>
              <SelectTrigger className="min-w-0 flex-1"><SelectValue placeholder="Insumo" /></SelectTrigger>
              <SelectContent>
                {data.insumos.filter((i) => i.id === l.insumoId || !used.has(i.id)).map((i) => <SelectItem key={i.id} value={String(i.id)}>{i.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <div className="relative w-28 shrink-0">
              <Input type="number" inputMode="decimal" min={0} value={l.amount} onChange={(e) => update(idx, { amount: e.target.value })} placeholder="0" className="pr-9" aria-label="Cantidad por trago" />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">{ins?.unit ?? ''}</span>
            </div>
            <Button variant="ghost" size="icon" aria-label="Quitar" onClick={() => setLines((ls) => ls.filter((_, i) => i !== idx))}><Trash2 className="h-4 w-4" /></Button>
          </div>
        );
      })}
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => setLines((ls) => [...ls, { insumoId: null, amount: '' }])} disabled={lines.length >= data.insumos.length}>
          <Plus className="mr-1 h-4 w-4" /> Insumo
        </Button>
        <div className="flex-1" />
        <Button variant="ghost" size="sm" onClick={onCancel}>Cancelar</Button>
        <WriteButton size="sm" disabled={save.isPending} onClick={submit}>{save.isPending ? 'Guardando…' : 'Guardar receta'}</WriteButton>
      </div>
    </div>
  );
}
