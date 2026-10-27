import { useState } from 'react';
import { toast } from 'sonner';
import { Minus, Plus, Trash2 } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { WriteButton } from '@/components/admin/WriteButton';
import { OPEN_FRACTIONS, OPEN_PORTIONS, describirBotellas, detalleATotal, formatCantidad, formatSize, insumoSizes } from '@shared/insumos';
import type { BarraInsumo } from './types';

type Abierta = { key: number; size: number; portions: number };

/** Contar el stock real de un insumo, tocando: botellas cerradas por tamaño (− / +) y botellas abiertas, cada una con
 * su tamaño y cuántas décimas le quedan (1 a 9 de 10). Deja el stock exactamente en lo contado. */
export function ContarStock({ eventId, insumo, onClose, onDone }: { eventId: number; insumo: BarraInsumo | null; onClose: () => void; onDone: () => void }) {
  const [closed, setClosed] = useState<Record<number, number>>({});
  const [abiertas, setAbiertas] = useState<Abierta[]>([]);
  const [loose, setLoose] = useState('');
  const setStock = trpc.insumos.setStock.useMutation();
  const reset = () => { setClosed({}); setAbiertas([]); setLoose(''); };
  const close = () => { reset(); onClose(); };

  if (!insumo) return <Dialog open={false} />;
  const sizes = insumoSizes(insumo);
  const envases = insumo.containerSize > 1;
  const nombre = insumo.containerLabel || 'botella';
  const bottles = sizes.map((size) => ({ size, count: closed[size] ?? 0 }));
  const total = detalleATotal({ closed: bottles, open: abiertas.map((a) => ({ size: a.size, portions: a.portions })) }) + (Number(loose) || 0);
  const diff = Math.round((total - insumo.stock) * 100) / 100;

  const setCount = (size: number, n: number) => setClosed((c) => ({ ...c, [size]: Math.max(0, Math.floor(n || 0)) }));
  const addAbierta = (size: number) => setAbiertas((as) => [...as, { key: Date.now() + as.length, size, portions: 5 }]);
  const upd = (key: number, patch: Partial<Abierta>) => setAbiertas((as) => as.map((a) => (a.key === key ? { ...a, ...patch } : a)));

  const submit = async () => {
    const partes = [
      describirBotellas(bottles, insumo.unit) && `Cerradas: ${describirBotellas(bottles, insumo.unit)}`,
      abiertas.length > 0 && `Abiertas: ${abiertas.map((a) => `${a.portions}/${OPEN_PORTIONS} de ${formatSize(a.size, insumo.unit)}`).join(', ')}`,
      Number(loose) > 0 && `Suelto: ${loose} ${insumo.unit}`,
    ].filter(Boolean);
    try {
      await setStock.mutateAsync({ insumoId: insumo.id, target: total, eventId, note: `Conteo de stock · ${partes.join(' · ') || 'sin existencias'}` });
      toast.success(`${insumo.name}: stock en ${formatCantidad(total, insumo)}`);
      reset();
      onDone();
    } catch (e: any) {
      toast.error(e?.message ?? 'No se pudo guardar');
    }
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) close(); }}>
      <DialogContent className="flex max-h-[94vh] w-[96vw] max-w-[96vw] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="border-b border-border px-5 py-4 pr-12">
          <DialogTitle className="text-xl">Contar stock: {insumo.name}</DialogTitle>
          <DialogDescription>Cuenta lo que hay de verdad. El stock queda exactamente en lo que marques (hoy el sistema tiene {formatCantidad(insumo.stock, insumo)}).</DialogDescription>
        </DialogHeader>

        <div className="flex-1 space-y-6 overflow-y-auto overscroll-contain px-5 py-4">
          {/* Cerradas */}
          <section>
            <h3 className="mb-2 text-sm font-semibold">🍾 {envases ? `${nombre[0].toUpperCase()}${nombre.slice(1)}s cerradas` : 'Cuántas hay'}</h3>
            <div className={`grid gap-3 ${sizes.length > 1 && envases ? 'sm:grid-cols-2' : ''}`}>
              {(envases ? sizes : [1]).map((size) => (
                <div key={size} className="flex items-center gap-2 rounded-2xl border-2 border-border bg-card/60 p-2">
                  <span className="min-w-0 flex-1 pl-2 text-base font-semibold">{envases ? formatSize(size, insumo.unit) : insumo.unit === 'un' ? 'unidades' : insumo.unit}</span>
                  <Button type="button" variant="outline" size="icon" className="h-12 w-12 rounded-xl" aria-label="Una menos" onClick={() => setCount(size, (closed[size] ?? 0) - 1)}><Minus className="h-5 w-5" /></Button>
                  <Input type="number" inputMode="numeric" min={0} value={closed[size] ? closed[size] : ''} placeholder="0" aria-label={`Cantidad de ${formatSize(size, insumo.unit)}`}
                    onChange={(e) => setCount(size, Number(e.target.value))} className="h-12 w-16 px-1 text-center text-xl font-bold tabular-nums" />
                  <Button type="button" size="icon" className="h-12 w-12 rounded-xl" aria-label="Una más" onClick={() => setCount(size, (closed[size] ?? 0) + 1)}><Plus className="h-5 w-5" /></Button>
                </div>
              ))}
            </div>
          </section>

          {/* Abiertas */}
          {envases && (
            <section>
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <h3 className="flex-1 text-sm font-semibold">🥃 {nombre[0].toUpperCase()}{nombre.slice(1)}s abiertas · cuánto le queda a cada una</h3>
                {sizes.map((s) => (
                  <Button key={s} type="button" variant="outline" size="sm" onClick={() => addAbierta(s)}><Plus className="mr-1 h-4 w-4" /> Abierta de {formatSize(s, insumo.unit)}</Button>
                ))}
              </div>
              {abiertas.length === 0 ? (
                <p className="rounded-2xl border-2 border-dashed border-border px-3 py-4 text-sm text-muted-foreground">Si hay una {nombre} abierta, agrégala y marca cuántas décimas le quedan (5 = la mitad).</p>
              ) : (
                <ul className="space-y-3">
                  {abiertas.map((a, idx) => (
                    <li key={a.key} className="rounded-2xl border-2 border-border bg-card/60 p-3">
                      <div className="mb-2 flex items-center gap-2">
                        <span className="flex-1 text-sm font-semibold">Abierta {idx + 1} · {formatSize(a.size, insumo.unit)}</span>
                        <span className="text-sm tabular-nums text-muted-foreground">{a.portions}/{OPEN_PORTIONS} ≈ {formatCantidad((a.portions / OPEN_PORTIONS) * a.size, { ...insumo, containerSize: 1 })}</span>
                        <Button type="button" variant="ghost" size="icon" aria-label="Quitar esta botella" onClick={() => setAbiertas((as) => as.filter((x) => x.key !== a.key))}><Trash2 className="h-4 w-4" /></Button>
                      </div>
                      {sizes.length > 1 && (
                        <div className="mb-2 flex gap-1.5">
                          {sizes.map((s) => (
                            <button key={s} type="button" onClick={() => upd(a.key, { size: s })}
                              className={`rounded-full px-3 py-1 text-sm font-medium ${a.size === s ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>{formatSize(s, insumo.unit)}</button>
                          ))}
                        </div>
                      )}
                      <div className="grid grid-cols-9 gap-1.5" role="radiogroup" aria-label="Cuánto le queda, de 1 a 9 décimas">
                        {OPEN_FRACTIONS.map((f) => (
                          <button key={f.portions} type="button" role="radio" aria-checked={a.portions === f.portions} onClick={() => upd(a.key, { portions: f.portions })}
                            className={`flex h-14 flex-col items-center justify-center rounded-xl border-2 text-lg font-bold transition active:scale-95 ${a.portions === f.portions ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card hover:bg-muted'}`}>
                            {f.label}
                          </button>
                        ))}
                      </div>
                      <div className="mt-1.5 flex justify-between text-[11px] text-muted-foreground"><span>casi vacía</span><span>la mitad</span><span>casi llena</span></div>
                      <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted" aria-hidden>
                        <div className="h-full rounded-full bg-primary" style={{ width: `${(a.portions / OPEN_PORTIONS) * 100}%` }} />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              <div className="mt-3 flex items-center gap-2">
                <label htmlFor="contar-suelto" className="text-sm text-muted-foreground">+ suelto ({insumo.unit}), si hay un resto fuera de botella</label>
                <Input id="contar-suelto" type="number" inputMode="numeric" min={0} value={loose} onChange={(e) => setLoose(e.target.value)} placeholder="0" className="h-10 w-24" />
              </div>
            </section>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3 border-t border-border bg-background/95 px-5 py-3">
          <div className="min-w-0 flex-1">
            <p className="text-lg font-bold tabular-nums">Total: {formatCantidad(total, insumo)}</p>
            <p className={`text-xs ${diff === 0 ? 'text-muted-foreground' : diff < 0 ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
              {diff === 0 ? 'Igual a lo que tiene el sistema.' : `${diff > 0 ? '+' : '−'}${formatCantidad(Math.abs(diff), { ...insumo, containerSize: 1 })} respecto al sistema`}
            </p>
          </div>
          <Button type="button" variant="outline" className="h-12" onClick={close}>Cancelar</Button>
          <WriteButton type="button" className="h-12 px-6 text-base" disabled={setStock.isPending} onClick={submit}>{setStock.isPending ? 'Guardando…' : 'Guardar stock'}</WriteButton>
        </div>
      </DialogContent>
    </Dialog>
  );
}
