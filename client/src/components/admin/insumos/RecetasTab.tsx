import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Copy, Plus, Trash2 } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { WriteButton } from '@/components/admin/WriteButton';
import { GLASSES, glassInfo, mlDeReceta, type GlassId } from '@shared/insumos';
import type { BarraData, BarraProducto } from './types';

/** Receta de cada trago de la carta: qué insumos gasta y cuánto, en cada vaso. */
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
    return `${ins?.name ?? '¿?'} ${r.amount.toLocaleString('es-CL')} ${ins?.unit ?? ''}`;
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
                    {p.glasses.length === 0 && <span className="block text-sm text-amber-500">Sin receta: no descuenta insumos</span>}
                    {p.glasses.map((g) => (
                      <span key={g.glass} className="block text-sm text-muted-foreground">
                        {p.glasses.length > 1 && <strong className="text-foreground">{glassInfo(g.glass)?.label ?? g.glass}: </strong>}
                        {describe(g.receta)}
                      </span>
                    ))}
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

type Line = { insumoId: number | null; amount: string };

function RecetaEditor({ producto, data, onCancel, onSaved }: { producto: BarraProducto; data: BarraData; onCancel: () => void; onSaved: () => void }) {
  // Una receta por vaso: las claves son los vasos en que este trago ya se sirve (o se está agregando).
  const original = producto.glasses.map((g) => g.glass);
  const [byGlass, setByGlass] = useState<Record<string, Line[]>>(() => Object.fromEntries(
    producto.glasses.map((g) => [g.glass, g.receta.map((r) => ({ insumoId: r.insumoId, amount: String(r.amount) }))]),
  ));
  const [active, setActive] = useState<string>(original[0] ?? 'vaso');
  const [saving, setSaving] = useState(false);
  const save = trpc.insumos.setReceta.useMutation();

  const lines = byGlass[active] ?? [];
  const setLines = (fn: (ls: Line[]) => Line[]) => setByGlass((m) => ({ ...m, [active]: fn(m[active] ?? []) }));
  const update = (idx: number, patch: Partial<Line>) => setLines((ls) => ls.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  const used = new Set(lines.map((l) => l.insumoId));
  const hasGlass = (g: string) => g in byGlass;

  const glass = glassInfo(active);
  const unitOf = (id: number) => data.insumos.find((i) => i.id === id)?.unit;
  const totalMl = mlDeReceta(lines.filter((l) => l.insumoId !== null && Number(l.amount) > 0).map((l) => ({ insumoId: l.insumoId!, amount: Number(l.amount) })), unitOf);
  const overflow = glass ? totalMl > glass.ml : false;
  const copySource = Object.keys(byGlass).find((g) => g !== active && (byGlass[g]?.length ?? 0) > 0);

  const addGlass = (g: string) => {
    if (!hasGlass(g)) setByGlass((m) => ({ ...m, [g]: [{ insumoId: null, amount: '' }] }));
    setActive(g);
  };
  const removeGlass = (g: string) => {
    setByGlass((m) => { const next = { ...m }; delete next[g]; return next; });
    setActive(Object.keys(byGlass).find((k) => k !== g) ?? 'vaso');
  };

  const submit = async () => {
    const clean = (ls: Line[]) => ls.filter((l) => l.insumoId !== null && Number(l.amount) > 0).map((l) => ({ insumoId: l.insumoId!, amount: Number(l.amount) }));
    setSaving(true);
    try {
      // Los vasos que tenían receta y se quitaron se mandan vacíos para borrarlos.
      for (const g of Array.from(new Set([...original, ...Object.keys(byGlass)]))) {
        await save.mutateAsync({ ticketTypeId: producto.id, glass: g as GlassId, lines: clean(byGlass[g] ?? []) });
      }
      toast.success(`Receta de ${producto.name} guardada`);
      onSaved();
    } catch (e: any) {
      toast.error(e?.message ?? 'No se pudo guardar la receta');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      <p className="font-semibold">{producto.emoji || '🍸'} {producto.name}</p>

      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Vaso">
        {GLASSES.map((g) => {
          const on = hasGlass(g.id);
          return (
            <button key={g.id} type="button" role="tab" aria-selected={active === g.id} onClick={() => addGlass(g.id)}
              className={`rounded-full px-3 py-1.5 text-sm font-medium ${active === g.id ? 'bg-primary text-white' : on ? 'bg-muted text-foreground' : 'border border-dashed border-border text-muted-foreground'}`}>
              {on ? '' : '+ '}{g.emoji} {g.label} {g.ml} ml
            </button>
          );
        })}
      </div>
      <p className="-mt-1 text-xs text-muted-foreground">
        Si el trago se sirve en más de un vaso, cada vaso tiene su receta y en /caja sale una tarjeta por vaso (mismo precio).
      </p>

      {!hasGlass(active) ? (
        <p className="text-sm text-muted-foreground">Este trago no se sirve en {glass?.label.toLowerCase()}. Toca la pestaña para agregarlo.</p>
      ) : (
        <>
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
          {glass && totalMl > 0 && (
            <p className={`text-xs ${overflow ? 'text-amber-500' : 'text-muted-foreground'}`}>
              Suma {totalMl.toLocaleString('es-CL')} ml de líquido en un {glass.label.toLowerCase()} de {glass.ml} ml{overflow ? ' — no cabe: revisa las cantidades' : ''}.
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setLines((ls) => [...ls, { insumoId: null, amount: '' }])} disabled={lines.length >= data.insumos.length}>
              <Plus className="mr-1 h-4 w-4" /> Insumo
            </Button>
            {copySource && lines.every((l) => l.insumoId === null) && (
              <Button variant="outline" size="sm" onClick={() => setLines(() => (byGlass[copySource] ?? []).map((l) => ({ ...l })))}>
                <Copy className="mr-1 h-4 w-4" /> Copiar del {glassInfo(copySource)?.label.toLowerCase()}
              </Button>
            )}
            {Object.keys(byGlass).length > 1 && (
              <Button variant="ghost" size="sm" onClick={() => removeGlass(active)}>Quitar este vaso</Button>
            )}
          </div>
        </>
      )}

      <div className="flex items-center gap-2">
        <div className="flex-1" />
        <Button variant="ghost" size="sm" onClick={onCancel}>Cancelar</Button>
        <WriteButton size="sm" disabled={saving} onClick={submit}>{saving ? 'Guardando…' : 'Guardar receta'}</WriteButton>
      </div>
    </div>
  );
}
