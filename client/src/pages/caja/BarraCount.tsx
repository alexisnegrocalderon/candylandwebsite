import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Minus, Plus } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { OPEN_FRACTIONS, formatCantidad } from '@shared/insumos';

type Kind = 'apertura' | 'cierre';
type Line = { closed: number; fraction: number };

const draftKey = (eventId: number, kind: Kind) => `caja_conteo_${kind}_${eventId}`;

function loadDraft(eventId: number, kind: Kind): Record<number, Line> {
  try { return JSON.parse(localStorage.getItem(draftKey(eventId, kind)) ?? '{}'); } catch { return {}; }
}

/** Conteo de barra al abrir y al cerrar turno: una tarjeta por insumo con
 * botellas cerradas (−/+) y la abierta en fracciones (Vacía/¼/½/¾/Llena).
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
  const set = (id: number, patch: Partial<Line>) => setLines((l) => ({ ...l, [id]: { ...(l[id] ?? { closed: 0, fraction: 0 }), ...patch } }));

  const submit = async () => {
    const toSend = insumos.filter((i) => lines[i.id] !== undefined).map((i) => ({ insumoId: i.id, closedContainers: lines[i.id].closed, openFraction: lines[i.id].fraction }));
    if (toSend.length === 0) { toast.error('Todavía no contaste nada. Toca cada insumo o usa «Saltar».'); return; }
    if (toSend.length < insumos.length && !window.confirm(`Faltan ${insumos.length - toSend.length} sin contar: esos quedan como estaban. ¿Guardar igual?`)) return;
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
        <p className="text-sm text-white/60">Cuenta lo que hay en la barra y en la bodega: botellas cerradas y cuánto le queda a la abierta.</p>
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
          return (
            <div key={i.id} className={`p-4 rounded-3xl admin-clay admin-clay-sm space-y-3 ${line ? 'ring-1 ring-emerald-400/40' : ''}`}>
              <div className="flex items-baseline justify-between gap-2">
                <p className="font-semibold text-lg">{line ? '✓ ' : ''}{i.name}</p>
                <p className="text-xs text-white/50">{onlyUnits ? i.unit : `${i.containerLabel} de ${i.containerSize.toLocaleString('es-CL')} ${i.unit}`}</p>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm text-white/60 flex-1">{onlyUnits ? 'Cantidad' : `${i.containerLabel[0].toUpperCase()}${i.containerLabel.slice(1)}s cerradas`}</span>
                <button type="button" aria-label="Una menos" onClick={() => set(i.id, { closed: Math.max(0, (line?.closed ?? 0) - 1) })}
                  className="w-12 h-12 rounded-2xl bg-white/10 grid place-items-center active:scale-95"><Minus className="w-5 h-5" /></button>
                <input
                  type="number" inputMode="numeric" min={0} aria-label={`${i.name}: cerradas`}
                  value={line ? line.closed : ''} placeholder="–"
                  onChange={(e) => set(i.id, { closed: Math.max(0, Math.floor(Number(e.target.value) || 0)) })}
                  className="w-16 h-12 text-center text-xl font-bold rounded-2xl bg-white/5 border border-white/10 focus:outline-none"
                />
                <button type="button" aria-label="Una más" onClick={() => set(i.id, { closed: (line?.closed ?? 0) + 1 })}
                  className="w-12 h-12 rounded-2xl bg-white/10 grid place-items-center active:scale-95"><Plus className="w-5 h-5" /></button>
              </div>
              {!onlyUnits && (
                <div>
                  <p className="text-sm text-white/60 mb-2">La abierta</p>
                  <div className="grid grid-cols-5 gap-2">
                    {OPEN_FRACTIONS.map((f) => {
                      const active = line?.fraction === f.value && line !== undefined;
                      return (
                        <button key={f.value} type="button" onClick={() => set(i.id, { fraction: f.value })}
                          className={`h-11 rounded-xl text-sm font-semibold active:scale-95 ${active ? 'bg-primary text-white' : 'bg-white/10 text-white/70'}`}>
                          {f.label}
                        </button>
                      );
                    })}
                  </div>
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
