import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { ArrowDown, ArrowUp, Check, Minus, Plus, Search, Trash2, X } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { WriteButton } from '@/components/admin/WriteButton';
import {
  CATEGORIAS_INSUMO, EXTRAS_SUGERIDOS, GLASSES, HIELOS, JIGGERS_RAPIDOS, JIGGER_ML, ML_RAPIDOS, cantidadInicial, categoriaInsumo, conHielo, pasosSugeridos, esJiggerExacto, glassInfo, insumosParecidos, jiggersAMl, mlAJiggers,
  type CategoriaInsumo, type GlassId, type InsumoUnit, type OpcionGrupo,
} from '@shared/insumos';
import { NuevoInsumo } from './NuevoInsumo';
import { OpcionesEditor } from './OpcionesEditor';
import { CameraCaptureField } from '@/components/admin/CameraCaptureField';
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
  // Los insumos recién creados aquí todavía no están en la lista del servidor: se usan igual mientras se actualiza.
  const [creados, setCreados] = useState<{ id: number; name: string; unit: InsumoUnit }[]>([]);
  const [nuevo, setNuevo] = useState<{ name: string } | null>(null);
  const insumoById = useMemo(() => {
    const m = new Map<number, { id: number; name: string; unit: InsumoUnit }>(data.insumos.map((i) => [i.id, i]));
    for (const c of creados) if (!m.has(c.id)) m.set(c.id, c);
    return m;
  }, [data.insumos, creados]);
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
  // Extras sin medida (borde de Tajín, hielo frappé…): solo se anotan en el trago, no tienen stock ni descuento.
  const extrasIniciales = producto.extras ?? [];
  const [extras, setExtras] = useState<string[]>(extrasIniciales);
  const [extraNuevo, setExtraNuevo] = useState('');
  // Opciones al vender (con qué bebida va, qué variante es): la cajera elige en /caja y se descuenta el insumo elegido.
  const opcionesIniciales = producto.opciones ?? [];
  const [opciones, setOpciones] = useState<OpcionGrupo[]>(opcionesIniciales);
  // Preparación para el dosier: pasos propios (vacío = los sugeridos) y foto del trago.
  const pasosIniciales = producto.pasos ?? [];
  const fotoInicial = producto.foto ?? null;
  const [pasos, setPasos] = useState<string[]>(pasosIniciales);
  const [foto, setFoto] = useState<string | null>(fotoInicial);

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
    // Punto de partida razonable; después se ajusta con los botones.
    setLines((ls) => [...ls, { insumoId: id, ...cantidadInicial(ins.name, ins.unit) }]);
  };
  const remove = (id: number) => setLines((ls) => ls.filter((l) => l.insumoId !== id));

  const q = search.trim().toLowerCase();
  const catCount = (c: CategoriaInsumo) => data.insumos.filter((i) => categoriaInsumo(i.name, i.unit) === c).length;
  const tiles = data.insumos.filter((i) =>
    (cat === 'todos' || categoriaInsumo(i.name, i.unit) === cat) && (!q || i.name.toLowerCase().includes(q)));

  const hielo = HIELOS.find((h) => extras.includes(h)) ?? null;
  const setHielo = (h: (typeof HIELOS)[number] | null) => setExtras((es) => conHielo(es, h));
  const otrosExtras = extras.filter((e) => !(HIELOS as readonly string[]).includes(e));
  const opcionesExtras = Array.from(new Set([...EXTRAS_SUGERIDOS, ...data.productos.flatMap((p) => p.extras ?? []), ...otrosExtras]))
    .filter((e) => !(HIELOS as readonly string[]).includes(e));
  const toggleExtra = (e: string) => setExtras((es) => (es.includes(e) ? es.filter((x) => x !== e) : [...es, e]));
  const addExtra = () => {
    const t = extraNuevo.trim();
    if (t && !extras.includes(t)) setExtras((es) => [...es, t]);
    setExtraNuevo('');
  };

  const sugeridos = pasosSugeridos({
    glass, extras, opciones,
    lineas: clean.flatMap((l) => { const i = insumoById.get(l.insumoId); return i ? [{ insumoId: l.insumoId, name: i.name, unit: i.unit, amount: l.amount }] : []; }),
  });

  const hadRecipe = producto.receta.length > 0;
  const emptyNow = clean.length === 0;

  // ¿Hay cambios sin guardar? (comparado con la receta que viene del servidor)
  const initialKey = JSON.stringify([producto.glass || 'vaso', producto.receta.map((r) => [r.insumoId, round2(r.amount)]), [...extrasIniciales].sort(), opcionesIniciales, pasosIniciales, fotoInicial]);
  const nowKey = JSON.stringify([glass, clean.map((l) => [l.insumoId, round2(l.amount)]), [...extras].sort(), opciones, pasos.map((p) => p.trim()).filter(Boolean), foto]);
  const dirty = nowKey !== initialKey && !(emptyNow && !hadRecipe && extras.length === 0 && extrasIniciales.length === 0 && opciones.length === 0 && opcionesIniciales.length === 0 && pasos.length === 0 && !foto);
  const latest = useRef({ glass, clean, extras, opciones, pasos, foto });
  latest.current = { glass, clean, extras, opciones, pasos, foto };
  useEffect(() => {
    if (!registerSave) return;
    registerSave(dirty ? () => save.mutateAsync({ ticketTypeId: producto.id, glass: latest.current.glass, lines: latest.current.clean, extras: latest.current.extras, opciones: latest.current.opciones.filter((g) => g.choices.length > 0), pasos: latest.current.pasos.map((p) => p.trim()).filter(Boolean), foto: latest.current.foto }) : null);
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
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5" role="radiogroup" aria-label="Vaso en que sale este trago">
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
                    : <><strong>{fmt(totalMl)} ml</strong> de líquido en {glass.startsWith('copa') ? 'una' : 'un'} {info.label.toLowerCase()} de {info.ml} ml ({pct} %)</>}
                </p>
                {!isShot && <p className={`text-xs ${pct > 80 ? 'text-red-500' : pct > 62 ? 'text-amber-500' : 'text-muted-foreground'}`}>
                  {pct > 80 ? 'No cabe con hielo: baja alguna cantidad.' : pct > 62 ? 'Queda justo con hielo.' : 'El resto del vaso es hielo.'}
                </p>}
              </div>
            )}
          </section>

          <OpcionesEditor grupos={opciones} onChange={setOpciones} insumos={Array.from(insumoById.values())} lineas={clean} />

          {/* Extras sin medida */}
          <section>
            <h3 className="mb-1 text-sm font-semibold">Extras (sin medida)</h3>
            <p className="mb-2 text-xs text-muted-foreground">Solo se anotan en el trago: no tienen stock ni se descuentan.</p>
            <div className="mb-2 flex flex-wrap gap-2" role="radiogroup" aria-label="Hielo">
              {([['Sin hielo', null], ['🧊 Cubos', HIELOS[0]], ['❄️ Frappé', HIELOS[1]]] as const).map(([label, h]) => (
                <button key={label} type="button" role="radio" aria-checked={hielo === h} onClick={() => setHielo(h)}
                  className={`rounded-full border-2 px-4 py-2 text-sm font-medium active:scale-95 ${hielo === h ? 'border-primary bg-primary/10' : 'border-border bg-card/60 hover:bg-muted'}`}>{label}</button>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              {opcionesExtras.map((e) => {
                const on = extras.includes(e);
                return (
                  <button key={e} type="button" aria-pressed={on} onClick={() => toggleExtra(e)}
                    className={`rounded-full border-2 px-3 py-1.5 text-sm active:scale-95 ${on ? 'border-primary bg-primary/10 font-medium' : 'border-border bg-card/60 hover:bg-muted'}`}>
                    {on && <Check className="mr-1 inline h-3.5 w-3.5" />}{e}
                  </button>
                );
              })}
            </div>
            <div className="mt-2 flex gap-2">
              <Input value={extraNuevo} onChange={(e) => setExtraNuevo(e.target.value)} placeholder="Otro extra (ej. Borde de Tajín)…"
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addExtra(); } }} />
              <Button type="button" variant="outline" onClick={addExtra} disabled={!extraNuevo.trim()}><Plus className="h-4 w-4" /></Button>
            </div>
          </section>

          {/* Preparación y foto (para el dosier de barra) */}
          <section>
            <h3 className="mb-1 text-sm font-semibold">Preparación (sale en el dosier)</h3>
            {pasos.length === 0 ? (
              <>
                <p className="mb-2 text-xs text-muted-foreground">Pasos sugeridos desde la receta. Se actualizan solos si cambias algo.</p>
                <ol className="mb-2 list-decimal space-y-1 rounded-2xl bg-muted/50 py-2 pl-8 pr-3 text-sm">
                  {sugeridos.map((p, i) => <li key={i}>{p}</li>)}
                </ol>
                <Button type="button" variant="outline" size="sm" onClick={() => setPasos(sugeridos.length ? sugeridos : [''])}>Editar estos pasos</Button>
              </>
            ) : (
              <>
                <ol className="space-y-1.5">
                  {pasos.map((p, i) => (
                    <li key={i} className="flex items-center gap-1.5">
                      <span className="w-5 shrink-0 text-right text-sm font-bold text-muted-foreground">{i + 1}</span>
                      <Input value={p} onChange={(e) => setPasos((ps) => ps.map((x, j) => (j === i ? e.target.value : x)))} className="h-10" aria-label={`Paso ${i + 1}`} />
                      <Button type="button" variant="ghost" size="icon" aria-label="Subir" disabled={i === 0} onClick={() => setPasos((ps) => { const n = [...ps]; [n[i - 1], n[i]] = [n[i], n[i - 1]]; return n; })}><ArrowUp className="h-4 w-4" /></Button>
                      <Button type="button" variant="ghost" size="icon" aria-label="Bajar" disabled={i === pasos.length - 1} onClick={() => setPasos((ps) => { const n = [...ps]; [n[i + 1], n[i]] = [n[i], n[i + 1]]; return n; })}><ArrowDown className="h-4 w-4" /></Button>
                      <Button type="button" variant="ghost" size="icon" aria-label="Quitar paso" onClick={() => setPasos((ps) => ps.filter((_, j) => j !== i))}><X className="h-4 w-4" /></Button>
                    </li>
                  ))}
                </ol>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button type="button" variant="outline" size="sm" disabled={pasos.length >= 12} onClick={() => setPasos((ps) => [...ps, ''])}><Plus className="mr-1 h-4 w-4" /> Paso</Button>
                  <Button type="button" variant="ghost" size="sm" onClick={() => setPasos([])}>Volver a los sugeridos</Button>
                </div>
              </>
            )}
            <div className="mt-3 flex items-center gap-3">
              {foto && (
                <span className="relative">
                  <img src={foto} alt={`Foto de ${producto.name}`} className="h-16 w-16 rounded-xl object-cover" />
                  <button type="button" onClick={() => setFoto(null)} aria-label="Quitar la foto" className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-background shadow"><X className="h-3.5 w-3.5" /></button>
                </span>
              )}
              <CameraCaptureField label={foto ? 'Cambiar foto del trago' : 'Foto del trago'} pathPrefix="tragos" onScanned={setFoto} hidePreview maxSide={900} />
            </div>
          </section>
        </div>

        {/* 3 · agregar */}
        <section>
          <div className="mb-2 flex items-center gap-2">
            <h3 className="flex-1 text-sm font-semibold">3 · Toca para agregar</h3>
            <Button type="button" variant="outline" size="sm" onClick={() => setNuevo({ name: '' })}><Plus className="mr-1 h-4 w-4" /> Nuevo insumo</Button>
          </div>
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
            {tiles.length === 0 && (
              <div className="col-span-full space-y-2 px-1 py-3 text-sm text-muted-foreground">
                <p>{q ? `No hay ningún insumo que se llame «${search.trim()}».` : 'No hay insumos en esta categoría.'}</p>
                <Button type="button" onClick={() => setNuevo({ name: search.trim() })}><Plus className="mr-1 h-4 w-4" /> Crear {q ? `«${search.trim()}»` : 'un insumo nuevo'}</Button>
              </div>
            )}
          </div>
          <NuevoInsumo
            open={!!nuevo} defaultName={nuevo?.name ?? ''} defaultUnit={isBottle ? 'un' : 'ml'} onClose={() => setNuevo(null)}
            onCreated={({ id, form }) => {
              setCreados((cs) => [...cs, { id, name: form.name, unit: form.unit }]);
              // Entra a la receta con una cantidad de partida razonable (se ajusta con +/−).
              setLines((ls) => (ls.some((l) => l.insumoId === id) ? ls : [...ls, { insumoId: id, ...cantidadInicial(form.name, form.unit) }]));
              setNuevo(null); setSearch(''); setCat('todos');
            }}
          />
        </section>
      </div>

      {registerSave ? (
        <p className={`text-xs ${dirty ? 'font-medium text-amber-700 dark:text-amber-300' : 'text-muted-foreground'}`}>
          {dirty ? 'Hay cambios en los insumos: se guardan con «Guardar cambios» de abajo.' : 'Los insumos se guardan junto con el producto, con «Guardar cambios».'}
        </p>
      ) : (
      <div className="sticky bottom-0 -mx-1 flex items-center gap-2 border-t border-border bg-background/95 px-1 py-3 backdrop-blur">
        {onCancel && <Button type="button" variant="outline" onClick={onCancel} className="h-12 flex-1">Cancelar</Button>}
        <WriteButton type="button" disabled={save.isPending || !dirty} className="h-12 flex-[2] text-base"
          onClick={() => save.mutate({ ticketTypeId: producto.id, glass, lines: clean, extras, opciones: opciones.filter((g) => g.choices.length > 0), pasos: pasos.map((p) => p.trim()).filter(Boolean), foto })}>
          {save.isPending ? 'Guardando…' : emptyNow && hadRecipe && extras.length === 0 ? 'Quitar la receta' : 'Guardar receta'}
        </WriteButton>
      </div>
      )}
    </div>
  );
}
