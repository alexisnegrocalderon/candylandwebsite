import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Minus, Plus, X } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { OPEN_FRACTIONS, OPEN_PORTIONS, formatCantidad, formatSize, insumoSizes } from '@shared/insumos';

type Kind = 'apertura' | 'cierre';
/** Lo contado de un insumo: botellas cerradas por tamaño y cada abierta con su tamaño
 * y cuántas porciones de 10 le quedan (`null` = todavía sin marcar). */
type Line = { closed: Record<number, number>; open: { size: number; portions: number | null }[] };

const emptyLine = (): Line => ({ closed: {}, open: [] });
// v2: el borrador de antes (sin tamaños de botella) no sirve.
const draftKey = (eventId: number, kind: Kind) => `caja_conteo2_${kind}_${eventId}`;

function loadDraft(eventId: number, kind: Kind): Record<number, Line> {
  try { return JSON.parse(localStorage.getItem(draftKey(eventId, kind)) ?? '{}'); } catch { return {}; }
}

/** Conteo de barra al abrir y al cerrar turno: una tarjeta por insumo con las
 * botellas cerradas de cada tamaño (750 ml, 1 L, 1,5 L…, −/+) y cada botella
 * abierta con su tamaño y porcionada en 10 (5/10 = a la mitad).
 *
 * Es un conteo "a ciegas": no muestra lo que el sistema espera hasta después
 * de guardar, para que nadie cuente "lo que debería haber". Lo que no se toca
 * no se manda (ese insumo queda como estaba). El borrador se guarda en el
 * dispositivo, así se puede contar a medias sin perderlo. */
export function BarraCount({ eventId, registerId, kind, onDone, onSkip }: {
  eventId: number;
  registerId: number | null;
  kind: Kind;
  onDone: () => void;
  onSkip: () => void;
}) {
  const estado = trpc.caja.barraEstado.useQuery({ eventId }, { retry: 1 });
  const save = trpc.caja.conteoBarra.useMutation();
  const [lines, setLines] = useState<Record<number, Line>>(() => loadDraft(eventId, kind));
  const [summary, setSummary] = useState<{ name: string; diff: number; pct: number; insumoId: number }[] | null>(null);

  useEffect(() => {
    try { localStorage.setItem(draftKey(eventId, kind), JSON.stringify(lines)); } catch { /* sin storage: no hay borrador */ }
  }, [eventId, kind, lines]);

  const insumos = estado.data?.ready ? estado.data.insumos : [];
  // Sin insumos cargados (o la base sin las tablas) no hay nada que contar.
  useEffect(() => {
    if (estado.data && (!estado.data.ready || estado.data.insumos.length === 0)) onDone();
  }, [estado.data, onDone]);

  const touched = useMemo(() => insumos.filter((i) => lines[i.id] !== undefined).length, [insumos, lines]);
  const update = (id: number, fn: (l: Line) => Line) => setLines((all) => ({ ...all, [id]: fn(all[id] ?? emptyLine()) }));
  const setClosed = (id: number, size: number, count: number) => update(id, (l) => ({ ...l, closed: { ...l.closed, [size]: Math.max(0, Math.floor(count || 0)) } }));

  const submit = async () => {
    const counted = insumos.filter((i) => lines[i.id] !== undefined);
    if (counted.length === 0) { toast.error('Todavía no contaste nada. Toca cada insumo o usa «Saltar».'); return; }
    const unmarked = counted.find((i) => lines[i.id].open.some((o) => o.portions === null));
    if (unmarked) { toast.error(`${unmarked.name}: marca cuánto le queda a la botella abierta (o quítala).`); return; }
    if (counted.length < insumos.length && !window.confirm(`Faltan ${insumos.length - counted.length} sin contar: esos quedan como estaban. ¿Guardar igual?`)) return;
    const toSend = counted.map((i) => ({
      insumoId: i.id,
      closed: insumoSizes(i).map((size) => ({ size, count: lines[i.id].closed[size] ?? 0 })),
      open: lines[i.id].open.map((o) => ({ size: o.size, portions: o.portions ?? 0 })),
    }));
    try {
      const res = await save.mutateAsync({ eventId, registerId: registerId ?? undefined, kind, lines: toSend });
      try { localStorage.removeItem(draftKey(eventId, kind)); } catch { /* nada */ }
      const off = res.lines.filter((l) => Math.abs(l.pct) >= 5 && l.diff !== 0);
      if (res.test) toast.info('Modo prueba: el conteo quedó guardado pero no cambia el stock real.');
      if (off.length === 0) { toast.success('✅ Conteo guardado — cuadra con el sistema'); onDone(); return; }
      setSummary(off.map((l) => ({ name: l.name, diff: l.diff, pct: l.pct, insumoId: l.insumoId })));
    } catch (err: any) {
      toast.error(err?.message ?? 'No se pudo guardar el conteo. Revisa la conexión e intenta de nuevo.', { duration: 8000 });
    }
  };

  const shell = 'fixed inset-0 z-30 overscroll-none bg-[#0b0612]/95 backdrop-blur-xl text-white flex flex-col';

  if (summary) {
    return (
      <div className={shell}>
        <div className="flex-1 overflow-y-auto overscroll-contain p-6 max-w-lg w-full mx-auto space-y-3">
          <h1 className="text-xl font-bold">Conteo guardado</h1>
          <p className="text-sm text-white/60">Estas diferencias con lo que decía el sistema quedaron registradas{kind === 'cierre' ? ' y el admin las va a ver' : ''}. El stock ahora es lo que contaste.</p>
          {summary.map((s) => {
            const ins = insumos.find((i) => i.id === s.insumoId);
            return (
              <div key={s.insumoId} className="p-4 rounded-2xl admin-clay admin-clay-sm flex items-center justify-between gap-3">
                <span className="font-semibold">{s.name}</span>
                <span className={s.diff < 0 ? 'text-red-300 font-bold' : 'text-emerald-300 font-bold'}>
                  {s.diff < 0 ? 'Faltan ' : 'Sobran '}{ins ? formatCantidad(Math.abs(s.diff), ins) : Math.abs(s.diff)}
                </span>
              </div>
            );
          })}
        </div>
        <div className="p-4 max-w-lg w-full mx-auto">
          <Button className="w-full h-14 text-base bg-primary hover:bg-primary/90" onClick={onDone}>Listo</Button>
        </div>
      </div>
    );
  }

  if (estado.isLoading || !estado.data?.ready) {
    return (
      <div className={`${shell} items-center justify-center gap-4 p-6 text-center`}>
        <p className="text-white/60 text-sm">{estado.isError ? 'Sin conexión: el conteo de barra necesita señal.' : 'Cargando insumos de la barra…'}</p>
        {estado.isError && <button onClick={onSkip} className="text-white/60 text-sm underline">Saltar por ahora</button>}
      </div>
    );
  }

  const previous = kind === 'apertura' ? estado.data.ultimaApertura : estado.data.ultimoCierre;

  return (
    <div className={shell}>
      <div className="shrink-0 p-4 pb-2 max-w-lg w-full mx-auto">
        <p className="text-white/60 text-xs uppercase tracking-wide">{kind === 'apertura' ? 'Inicio de turno' : 'Cierre de turno'}</p>
        <h1 className="text-xl font-bold">Conteo de barra</h1>
        <p className="text-sm text-white/60">Cuenta lo que hay en la barra y en la bodega: las botellas cerradas de cada tamaño y, de las abiertas, cuántas porciones de 10 quedan.</p>
        {previous && (
          <p className="mt-1 text-xs text-amber-200/80">
            Ya se contó hoy ({previous.operatorName ?? 'alguien'}, {new Date(previous.createdAt).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}). Puedes saltarlo si nada cambió.
          </p>
        )}
        <p className="mt-2 text-xs text-white/50">Contados {touched} de {insumos.length}</p>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 pb-4 max-w-lg w-full mx-auto space-y-3">
        {insumos.map((i) => {
          const line = lines[i.id];
          const onlyUnits = i.containerSize <= 1;
          const sizes = onlyUnits ? [1] : insumoSizes(i);
          const plural = `${i.containerLabel}s`;
          return (
            <div key={i.id} className={`p-4 rounded-3xl admin-clay admin-clay-sm space-y-3 ${line ? 'ring-1 ring-emerald-400/40' : ''}`}>
              <p className="font-semibold text-lg">{line ? '✓ ' : ''}{i.name}</p>

              {sizes.map((size) => (
                <div key={size} className="flex items-center gap-3">
                  <span className="text-sm text-white/60 flex-1">
                    {onlyUnits ? 'Cantidad' : <>{`${plural[0].toUpperCase()}${plural.slice(1)} cerradas`} <strong className="text-white">{formatSize(size, i.unit)}</strong></>}
                  </span>
                  <button type="button" aria-label="Una menos" onClick={() => setClosed(i.id, size, (line?.closed[size] ?? 0) - 1)}
                    className="w-12 h-12 rounded-2xl bg-white/10 grid place-items-center active:scale-95"><Minus className="w-5 h-5" /></button>
                  <input
                    type="number" inputMode="numeric" min={0} aria-label={`${i.name}: cerradas de ${formatSize(size, i.unit)}`}
                    value={line ? (line.closed[size] ?? 0) : ''} placeholder="–"
                    onChange={(e) => setClosed(i.id, size, Number(e.target.value))}
                    className="w-16 h-12 text-center text-xl font-bold rounded-2xl bg-white/5 border border-white/10 focus:outline-none"
                  />
                  <button type="button" aria-label="Una más" onClick={() => setClosed(i.id, size, (line?.closed[size] ?? 0) + 1)}
                    className="w-12 h-12 rounded-2xl bg-white/10 grid place-items-center active:scale-95"><Plus className="w-5 h-5" /></button>
                </div>
              ))}

              {!onlyUnits && (
                <div className="space-y-3">
                  {(line?.open ?? []).map((o, idx) => (
                    <div key={idx} className="rounded-2xl bg-white/5 p-3 space-y-2">
                      <div className="flex items-center gap-2">
                        <p className="flex-1 text-sm text-white/60">Abierta {idx + 1} · {o.portions === null ? 'sin marcar' : `${o.portions}/${OPEN_PORTIONS}`}</p>
                        {sizes.length > 1 && sizes.map((size) => (
                          <button key={size} type="button" onClick={() => update(i.id, (l) => ({ ...l, open: l.open.map((x, j) => (j === idx ? { ...x, size } : x)) }))}
                            className={`h-9 px-3 rounded-xl text-xs font-semibold active:scale-95 ${o.size === size ? 'bg-primary text-white' : 'bg-white/10 text-white/70'}`}>
                            {formatSize(size, i.unit)}
                          </button>
                        ))}
                        <button type="button" aria-label="Quitar esta botella" onClick={() => update(i.id, (l) => ({ ...l, open: l.open.filter((_, j) => j !== idx) }))}
                          className="w-9 h-9 rounded-xl bg-white/10 grid place-items-center active:scale-95"><X className="w-4 h-4" /></button>
                      </div>
                      <div className="grid grid-cols-6 gap-2">
                        {OPEN_FRACTIONS.map((f, k) => (
                          <button key={f.label} type="button" onClick={() => update(i.id, (l) => ({ ...l, open: l.open.map((x, j) => (j === idx ? { ...x, portions: k } : x)) }))}
                            className={`h-11 rounded-xl text-sm font-semibold active:scale-95 ${o.portions === k ? 'bg-primary text-white' : 'bg-white/10 text-white/70'}`}>
                            {f.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                  <button type="button" onClick={() => update(i.id, (l) => ({ ...l, open: [...l.open, { size: i.containerSize, portions: null }] }))}
                    className="w-full h-11 rounded-xl border border-dashed border-white/20 text-sm text-white/70 active:scale-95">
                    + {(line?.open.length ?? 0) === 0 ? 'Hay una botella abierta' : 'Otra botella abierta'} (porciones de 10)
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="shrink-0 p-4 pt-2 max-w-lg w-full mx-auto space-y-2 pb-[max(env(safe-area-inset-bottom),1rem)]">
        <Button className="w-full h-14 text-base bg-primary hover:bg-primary/90" disabled={save.isPending} onClick={submit}>
          {save.isPending ? 'Guardando…' : 'Guardar conteo'}
        </Button>
        <button type="button" onClick={onSkip} className="w-full text-center text-white/50 text-sm py-2">Saltar por ahora</button>
      </div>
    </div>
  );
}
