import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Check, Minus, Plus, Search, Trash2 } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { WriteButton } from '@/components/admin/WriteButton';
import {
  CATEGORIAS_INSUMO, GLASSES, JIGGERS_RAPIDOS, JIGGER_ML, ML_RAPIDOS, categoriaInsumo, esJiggerExacto, glassInfo, insumosParecidos, jiggersAMl, mlAJiggers,
  type CategoriaInsumo, type GlassId,
} from '@shared/insumos';
import type { BarraData, BarraProducto } from './types';

/** Una línea de la receta: `value` está en jiggers (si `jigger`) o en la unidad del insumo (ml, un). Se guarda siempre en ml. */
type Line = { insumoId: number; value: number; jigger: boolean };

const FRACCION: Record<number, string> = { 0.25: '¼', 0.5: '½', 1: '1', 1.5: '1½', 2: '2', 3: '3' };
const round2 = (n: number) => Math.round(n * 100) / 100;
const fmt = (n: number) => n.toLocaleString('es-CL', { maximumFractionDigits: 2 });

/** Editor visual de la receta de UN trago: el vaso en que sale (botones grandes), sus insumos con +/− y cantidades
 * rápidas (jiggers), y una grilla de insumos para tocar y agregar. Se guarda siempre en ml. */
export function RecetaVisual({ producto, data, wide = false, onCancel, onSaved, registerSave }: {
  producto: BarraProducto;
  data: BarraData;
  /** En una ventana ancha, los insumos para agregar van al lado en vez de abajo. */
  wide?: boolean;
  onCancel?: () => void;
  onSaved: () => void;
  /** Cuando el editor va dentro de otra ventana con su propio «Guardar» (la ficha del producto), no muestra su
   * botón: entrega una función para guardar los insumos junto con lo demás (o `null` si no hay cambios). */
  registerSave?: (save: (() => Promise<unknown>) | null) => void;
}) {
  const insumoById = useMemo(() => new Map(data.insumos.map((i) => [i.id, i])), [data.insumos]);
  const [glass, setGlass] = useState<GlassId>((glassInfo(producto.glass)?.id ?? 'vaso') as GlassId);
  const [lines, setLines] = useState<Line[]>(() => producto.receta.map((r) => {
    const ins = data.insumos.find((i) => i.id === r.insumoId);
    const jigger = ins?.unit === 'ml' && esJiggerExacto(r.amount);
    return { insumoId: r.insumoId, jigger, value: jigger ? mlAJiggers(r.amount) : r.amount };
  }));
  const [cat, setCat] = useState<CategoriaInsumo | 'todos'>('todos');
  // Para lo que se vende tal cual: crear el insumo (con el nombre del producto) sin salir de aquí.
  const [creando, setCreando] = useState(false);
  const [nuevoNombre, setNuevoNombre] = useState(producto.name);
  const [nuevoStock, setNuevoStock] = useState('');
  const [search, setSearch] = useState('');

  const utils = trpc.useUtils();
  const crearInsumo = trpc.insumos.save.useMutation({
    onSuccess: (r) => {
      utils.insumos.estado.invalidate();
      setLines((ls) => (ls.some((l) => l.insumoId === r.id) ? ls : [...ls, { insumoId: r.id, jigger: false, value: 1 }]));
      setCreando(false);
      toast.success(`«${nuevoNombre.trim()}» creado: cada venta gasta 1 unidad`);
    },
    onError: (e) => toast.error(e.message),
  });

  const save = trpc.insumos.setReceta.useMutation({
    onSuccess: () => { toast.success(`Receta de ${producto.name} guardada`); onSaved(); },
    onError: (e) => toast.error(e.message),
  });

  const toMl = (l: Line) => (l.jigger ? jiggersAMl(l.value) : l.value);
  const clean = lines.filter((l) => l.value > 0).map((l) => ({ insumoId: l.insumoId, amount: toMl(l) }));
  const totalMl = round2(lines.reduce((s, l) => (insumoById.get(l.insumoId)?.unit === 'ml' ? s + toMl(l) : s), 0));

  const info = glassInfo(glass)!;
  const isShot = glass === 'shot';
  // Lo que se vende tal cual (botella o lata) no se sirve en un vaso: no hay nada que llenar.
  const isBottle = glass === 'botella';
  const parecidos = isBottle ? insumosParecidos(producto.name, data.insumos.filter((i) => !lines.some((l) => l.insumoId === i.id))) : [];
  const pct = Math.round((totalMl / info.ml) * 100);
  // Con hielo, el líquido debería ocupar cerca de la mitad del vaso.
  const meter = isShot ? 'bg-sky-500' : pct > 80 ? 'bg-red-500' : pct > 62 ? 'bg-amber-500' : 'bg-emerald-500';

  const update = (id: number, fn: (l: Line) => Line) => setLines((ls) => ls.map((l) => (l.insumoId === id ? fn(l) : l)));
  const setValue = (id: number, v: number) => update(id, (l) => ({ ...l, value: Math.max(0, round2(v)) }));
  const switchMode = (id: number) => update(id, (l) => (l.jigger
    ? { ...l, jigger: false, value: jiggersAMl(l.value) }
    : { ...l, jigger: true, value: mlAJiggers(l.value) }));

  const add = (id: number) => {
    const ins = insumoById.get(id);
    if (!ins || lines.some((l) => l.insumoId === id)) return;
    const c = categoriaInsumo(ins.name, ins.unit);
    // Punto de partida razonable; después se ajusta con los botones.
    const start: Omit<Line, 'insumoId'> = ins.unit !== 'ml' ? { jigger: false, value: 1 }
      : c === 'licores' ? { jigger: true, value: 2 }
        : c === 'jarabes' ? { jigger: true, value: 0.5 }
          : { jigger: false, value: 120 };
    setLines((ls) => [...ls, { insumoId: id, ...start }]);
  };
  const remove = (id: number) => setLines((ls) => ls.filter((l) => l.insumoId !== id));

  const q = search.trim().toLowerCase();
  const catCount = (c: CategoriaInsumo) => data.insumos.filter((i) => categoriaInsumo(i.name, i.unit) === c).length;
  const tiles = data.insumos.filter((i) =>
    (cat === 'todos' || categoriaInsumo(i.name, i.unit) === cat) && (!q || i.name.toLowerCase().includes(q)));

  const hadRecipe = producto.receta.length > 0;
  const emptyNow = clean.length === 0;

  // ¿Hay cambios sin guardar? (comparado con la receta que viene del servidor)
  const initialKey = JSON.stringify([producto.glass || 'vaso', producto.receta.map((r) => [r.insumoId, round2(r.amount)])]);
  const nowKey = JSON.stringify([glass, clean.map((l) => [l.insumoId, round2(l.amount)])]);
  const dirty = nowKey !== initialKey && !(emptyNow && !hadRecipe);
  const latest = useRef({ glass, clean });
  latest.current = { glass, clean };
  useEffect(() => {
    if (!registerSave) return;
    registerSave(dirty ? () => save.mutateAsync({ ticketTypeId: producto.id, glass: latest.current.glass, lines: latest.current.clean }) : null);
    return () => registerSave(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dirty, registerSave, producto.id]);

  return (
    <div className="space-y-5">
      <div className={wide ? 'grid gap-5 lg:grid-cols-2' : 'space-y-5'}>
        <div className="space-y-5">
          {/* 1 · vaso */}
          <section>
            <h3 className="mb-2 text-sm font-semibold">1 · ¿En qué vaso sale, o se vende tal cual?</h3>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="radiogroup" aria-label="Vaso en que sale este trago">
              {GLASSES.map((g) => (
                <button key={g.id} type="button" role="radio" aria-checked={glass === g.id} onClick={() => { setGlass(g.id); if (g.id === 'botella') setCat('unidades'); }}
                  className={`rounded-2xl border-2 px-2 py-3 text-center transition active:scale-95 ${glass === g.id ? 'border-primary bg-primary/10' : 'border-border bg-card/60 hover:bg-muted'}`}>
                  <span className="block text-3xl leading-none">{g.emoji}</span>
                  <span className="mt-1 block text-sm font-semibold">{g.label}</span>
                  <span className="block text-xs text-muted-foreground">{g.id === 'botella' ? 'se vende tal cual' : `${g.ml} ml`}</span>
                </button>
              ))}
            </div>
          </section>

          {/* 2 · ingredientes */}
          <section>
            <h3 className="mb-2 text-sm font-semibold">2 · Ingredientes {lines.length > 0 && <span className="font-normal text-muted-foreground">({lines.length})</span>}</h3>

            {isBottle && (
              <div className="mb-2 space-y-2 rounded-2xl border border-primary/40 bg-primary/5 p-3">
                <p className="text-sm font-semibold">Se vende tal cual: cada venta gasta 1 unidad.</p>
                {parecidos.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-xs text-muted-foreground">¿Es alguno de estos? Toca para usarlo:</p>
                    {parecidos.map((i) => (
                      <button key={i.id} type="button" onClick={() => add(i.id)}
                        className="flex min-h-12 w-full items-center gap-2 rounded-xl border-2 border-primary/50 bg-background px-3 text-left text-sm font-semibold active:scale-95">
                        <Plus className="h-4 w-4 text-primary" /> {i.name}
                      </button>
                    ))}
                  </div>
                )}
                {!creando ? (
                  <button type="button" onClick={() => setCreando(true)} className="text-xs underline underline-offset-2 text-muted-foreground">
                    ¿No está en la lista? Crear «{producto.name}» como insumo
                  </button>
                ) : (
                  <div className="space-y-2 rounded-xl bg-background p-2">
                    <Input value={nuevoNombre} onChange={(e) => setNuevoNombre(e.target.value)} aria-label="Nombre del insumo" placeholder="Nombre" />
                    <div className="flex items-center gap-2">
                      <Input type="number" inputMode="numeric" min={0} value={nuevoStock} onChange={(e) => setNuevoStock(e.target.value)} aria-label="Cuántas hay ahora" placeholder="Cuántas hay ahora" className="flex-1" />
                      <WriteButton type="button" disabled={crearInsumo.isPending || !nuevoNombre.trim()}
                        onClick={() => crearInsumo.mutate({ name: nuevoNombre.trim(), unit: 'un', containerSize: 1, containerLabel: 'botella', alertDrinks: 10, initialLoose: Number(nuevoStock) || 0 })}>
                        {crearInsumo.isPending ? 'Creando…' : 'Crear y usar'}
                      </WriteButton>
                    </div>
                  </div>
                )}
              </div>
            )}

            {lines.length === 0 && (
              <p className="rounded-2xl border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
                Todavía sin ingredientes. Toca un insumo de {wide ? 'la derecha' : 'abajo'} para agregarlo.
              </p>
            )}

            <ul className="space-y-2">
              {lines.map((l) => {
                const ins = insumoById.get(l.insumoId);
                if (!ins) return null;
                const isMl = ins.unit === 'ml';
                const step = l.jigger ? 0.25 : isMl ? 10 : 1;
                const c = CATEGORIAS_INSUMO.find((x) => x.id === categoriaInsumo(ins.name, ins.unit));
                return (
                  <li key={l.insumoId} className="rounded-2xl border border-border bg-card/60 p-3">
                    <div className="flex items-center gap-2">
                      <span className="text-xl leading-none" aria-hidden>{c?.emoji}</span>
                      <p className="min-w-0 flex-1 truncate font-semibold">{ins.name}</p>
                      <Button type="button" variant="ghost" size="icon" aria-label={`Quitar ${ins.name}`} onClick={() => remove(l.insumoId)}><Trash2 className="h-4 w-4" /></Button>
                    </div>

                    <div className="mt-2 flex items-center gap-3">
                      <button type="button" aria-label="Menos" onClick={() => setValue(l.insumoId, l.value - step)}
                        className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-muted active:scale-90"><Minus className="h-5 w-5" /></button>
                      <div className="min-w-0 flex-1 text-center">
                        <Input type="number" inputMode="decimal" min={0} step={step} value={l.value || ''} placeholder="0" aria-label={`Cantidad de ${ins.name}`}
                          onChange={(e) => setValue(l.insumoId, Number(e.target.value) || 0)} className="mx-auto h-11 w-28 text-center text-2xl font-bold" />
                        <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">
                          {l.jigger ? <>jigger{l.value === 1 ? '' : 's'} · <strong className="text-foreground">{fmt(jiggersAMl(l.value))} ml</strong></> : ins.unit}
                        </p>
                      </div>
                      <button type="button" aria-label="Más" onClick={() => setValue(l.insumoId, l.value + step)}
                        className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground active:scale-90"><Plus className="h-5 w-5" /></button>
                    </div>

                    {isMl && (
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        {(l.jigger ? JIGGERS_RAPIDOS : ML_RAPIDOS).map((v) => (
                          <button key={v} type="button" onClick={() => setValue(l.insumoId, v)}
                            className={`rounded-full px-3 py-1.5 text-sm font-medium active:scale-95 ${l.value === v ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
                            {l.jigger ? FRACCION[v] : v}
                          </button>
                        ))}
                        <button type="button" onClick={() => switchMode(l.insumoId)} className="ml-auto text-xs text-muted-foreground underline underline-offset-2">
                          {l.jigger ? 'medir en ml' : `medir en jiggers (${JIGGER_ML} ml)`}
                        </button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>

            {/* Cuánto llena el vaso */}
            {totalMl > 0 && !isBottle && (
              <div className="mt-3 rounded-2xl bg-muted/50 p-3">
                <div className="h-3 overflow-hidden rounded-full bg-muted" aria-hidden>
                  <div className={`h-full rounded-full transition-all ${meter}`} style={{ width: `${Math.min(100, isShot ? Math.min(100, (totalMl / (info.ml * 3)) * 100) : pct)}%` }} />
                </div>
                <p className="mt-1.5 text-sm tabular-nums">
                  {isShot
                    ? <><strong>{fmt(totalMl)} ml</strong> = {fmt(round2(totalMl / info.ml))} {round2(totalMl / info.ml) === 1 ? 'shot' : 'shots'} de {info.ml} ml</>
                    : <><strong>{fmt(totalMl)} ml</strong> de líquido en {glass === 'copa' ? 'una' : 'un'} {info.label.toLowerCase()} de {info.ml} ml ({pct} %)</>}
                </p>
                {!isShot && <p className={`text-xs ${pct > 80 ? 'text-red-500' : pct > 62 ? 'text-amber-500' : 'text-muted-foreground'}`}>
                  {pct > 80 ? 'No cabe con hielo: baja alguna cantidad.' : pct > 62 ? 'Queda justo con hielo.' : 'El resto del vaso es hielo.'}
                </p>}
              </div>
            )}
          </section>
        </div>

        {/* 3 · agregar */}
        <section>
          <h3 className="mb-2 text-sm font-semibold">3 · Toca para agregar</h3>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar insumo…" className="pl-9" />
          </div>
          <div className="mt-2 flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none]">
            {[{ id: 'todos' as const, label: 'Todos', emoji: '' }, ...CATEGORIAS_INSUMO.filter((c) => catCount(c.id) > 0)].map((c) => (
              <button key={c.id} type="button" onClick={() => setCat(c.id)}
                className={`shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-medium ${cat === c.id ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
                {c.emoji} {c.label}
              </button>
            ))}
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {tiles.map((i) => {
              const used = lines.some((l) => l.insumoId === i.id);
              return (
                <button key={i.id} type="button" onClick={() => (used ? remove(i.id) : add(i.id))} aria-pressed={used}
                  className={`relative min-h-[3.5rem] rounded-2xl border-2 px-3 py-2 text-left text-sm font-medium transition active:scale-95 ${used ? 'border-primary bg-primary/10' : 'border-border bg-card/60 hover:bg-muted'}`}>
                  <span className="line-clamp-2 pr-5">{i.name}</span>
                  {used && <Check className="absolute right-2 top-2 h-4 w-4 text-primary" />}
                </button>
              );
            })}
            {tiles.length === 0 && <p className="col-span-full px-1 py-3 text-sm text-muted-foreground">Ningún insumo con ese nombre. Créalo en Stock de Barra → «+ Insumo».</p>}
          </div>
        </section>
      </div>

      {registerSave ? (
        <p className={`text-xs ${dirty ? 'font-medium text-amber-700 dark:text-amber-300' : 'text-muted-foreground'}`}>
          {dirty ? 'Hay cambios en los insumos: se guardan con «Guardar cambios» de abajo.' : 'Los insumos se guardan junto con el producto, con «Guardar cambios».'}
        </p>
      ) : (
      <div className="sticky bottom-0 -mx-1 flex items-center gap-2 border-t border-border bg-background/95 px-1 py-3 backdrop-blur">
        {onCancel && <Button type="button" variant="outline" onClick={onCancel} className="h-12 flex-1">Cancelar</Button>}
        <WriteButton type="button" disabled={save.isPending || (emptyNow && !hadRecipe)} className="h-12 flex-[2] text-base"
          onClick={() => save.mutate({ ticketTypeId: producto.id, glass, lines: clean })}>
          {save.isPending ? 'Guardando…' : emptyNow && hadRecipe ? 'Quitar la receta' : 'Guardar receta'}
        </WriteButton>
      </div>
      )}
    </div>
  );
}
