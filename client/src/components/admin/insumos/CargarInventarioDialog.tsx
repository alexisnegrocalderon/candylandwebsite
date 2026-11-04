import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { WriteButton } from '@/components/admin/WriteButton';
import { GRUPOS_INSUMO, formatCantidad, type GrupoInsumo } from '@shared/insumos';
import type { BarraInsumo } from './types';

const EJEMPLO = `47 Redbull Yellow
12 lata 350ml coca cola
0.9 Jagermeister 700ml
1.3 Bacardi Blanco 1.75lt
0.9 Guantes M Negro (caja de 100); desechable`;

type Asig = number | 'nuevo' | 'omitir';

/** Diferencia con signo y color: lo que sube (+) o baja (−) el stock respecto de lo que había. */
function Diferencia({ diff, insumo }: { diff: number; insumo: Pick<BarraInsumo, 'unit' | 'containerSize' | 'containerLabel'> }) {
  if (diff === 0) return <span className="text-muted-foreground">sin cambio</span>;
  return <span className={`font-semibold ${diff > 0 ? 'text-emerald-500' : 'text-red-500'}`}>{diff > 0 ? '+' : '−'}{formatCantidad(Math.abs(diff), insumo)}</span>;
}

/** Pega tu inventario contado (una línea por insumo). Cada línea se empareja con un insumo que ya existe (o se crea),
 * y antes de aplicar muestra el stock que había, el que quedará y la diferencia. Reemplaza el stock: nunca suma. */
export function CargarInventarioDialog({ eventId, open, reglasReady, insumos, onClose, onDone }: {
  eventId: number;
  open: boolean;
  /** Sin la tabla de reglas solo se pueden cargar bebidas. */
  reglasReady: boolean;
  /** Los insumos que ya existen, para elegir a cuál va cada línea. */
  insumos: BarraInsumo[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [texto, setTexto] = useState('');
  const [grupoDefecto, setGrupoDefecto] = useState<GrupoInsumo>('bebida');
  const [asignaciones, setAsignaciones] = useState<Record<string, Asig>>({});
  const [ceroSiFalta, setCeroSiFalta] = useState(false);
  const [query, setQuery] = useState({ texto: '', grupoDefecto, asignaciones, ceroSiFalta });
  useEffect(() => {
    const id = window.setTimeout(() => setQuery({ texto, grupoDefecto, asignaciones, ceroSiFalta }), 400);
    return () => window.clearTimeout(id);
  }, [texto, grupoDefecto, asignaciones, ceroSiFalta]);
  useEffect(() => { if (!open) { setTexto(''); setGrupoDefecto('bebida'); setAsignaciones({}); setCeroSiFalta(false); } }, [open]);

  const plan = trpc.insumos.inventarioPlan.useQuery(query, { enabled: open && query.texto.trim().length > 0, placeholderData: (prev) => prev });
  const apply = trpc.insumos.inventarioApply.useMutation({
    onSuccess: (r) => {
      toast.success(`Stock dejado en lo contado: ${r.actualizados} actualizados, ${r.creados} nuevos${r.enCero ? `, ${r.enCero} en 0` : ''}`);
      onDone();
    },
    onError: (e) => toast.error(e.message),
  });
  const p = texto.trim() ? plan.data : undefined;
  const lineas = p?.lineas ?? [];
  const cargables = lineas.filter((l) => l.asignado !== 'omitir');
  const needsReglas = !!p && !p.reglasListas && cargables.some((l) => l.grupo !== 'bebida');
  const nuevos = cargables.filter((l) => l.asignado === 'nuevo').length;
  const conCambio = lineas.filter((l) => l.diff !== null && l.diff !== 0).length;
  const sugeridos = lineas.filter((l) => l.sugerido && asignaciones[l.key] === undefined).length;
  const aCero = p?.ceroSiFalta ? p.sinTocar.filter((i) => i.stock !== 0) : [];
  const pending = texto !== query.texto || grupoDefecto !== query.grupoDefecto || asignaciones !== query.asignaciones || ceroSiFalta !== query.ceroSiFalta || plan.isFetching;
  const opciones = [...insumos].sort((a, b) => a.name.localeCompare(b.name));
  const valor = (a: Asig) => (typeof a === 'number' ? String(a) : a);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-h-[92vh] w-[96vw] max-w-[96vw] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Cargar inventario contado</DialogTitle>
          <DialogDescription>
            Una línea por insumo, como lo escribes en WhatsApp: <strong>cantidad y nombre</strong> (47 Redbull Yellow). Un decimal es parte de un envase (0.9 = una botella al 90 %).
            <strong> Esto reemplaza el stock actual por lo que contaste: no lo suma.</strong> Cada diferencia queda en el historial como un ajuste.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label htmlFor="inv-texto">Tu lista</Label>
            <textarea id="inv-texto" value={texto} onChange={(e) => setTexto(e.target.value)} rows={7} placeholder={EJEMPLO}
              className="mt-1 w-full rounded-xl border border-border bg-background p-3 font-mono text-sm" />
            <button type="button" className="mt-1 text-xs underline" onClick={() => setTexto(EJEMPLO)}>Usar un ejemplo</button>
          </div>
          <div>
            <Label>Grupo de los insumos nuevos (si la línea no lo dice)</Label>
            <div className="mt-1 flex flex-wrap gap-2">
              {GRUPOS_INSUMO.map((g) => (
                <button key={g.id} type="button" aria-pressed={grupoDefecto === g.id} onClick={() => setGrupoDefecto(g.id)}
                  className={`rounded-full px-3.5 py-2 text-sm font-medium active:scale-95 ${grupoDefecto === g.id ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
                  {g.emoji} {g.label}
                </button>
              ))}
            </div>
            {!reglasReady && <p className="mt-1 text-xs text-amber-500">Para cargar desechables, limpieza u otros, primero activa los insumos generales (aviso amarillo arriba).</p>}
          </div>

          {p && (
            <div className="space-y-2">
              <p className="text-sm font-semibold">
                {lineas.length} líneas · {cargables.length - nuevos} van a insumos que ya tienes · {nuevos} se crean nuevos{lineas.length - cargables.length > 0 ? ` · ${lineas.length - cargables.length} sin cargar` : ''}
              </p>
              {sugeridos > 0 && <p className="rounded-xl border border-sky-500/40 bg-sky-500/10 p-2 text-xs text-sky-400">{sugeridos} se emparejaron solas por parecido de nombre (marcadas «sugerido»). Revisa que el insumo sea el correcto: si no, elígelo en la lista de esa línea o ponlo como «Crear nuevo».</p>}
              {needsReglas && <p className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-amber-500">Hay insumos que no son bebida: activa primero los insumos generales.</p>}
              {p.errores.length > 0 && <p className="rounded-xl border border-red-500/40 bg-red-500/10 p-2 text-xs text-red-500">No entendí estas líneas (ponles una cantidad): {p.errores.join(' · ')}</p>}
              {p.sumadas.length > 0 && <p className="text-xs text-amber-500">Estaban en más de una línea y se sumaron: {p.sumadas.join(', ')}</p>}

              <ul className="max-h-[22rem] space-y-1.5 overflow-y-auto pr-1 text-sm">
                {lineas.map((l) => {
                  const g = GRUPOS_INSUMO.find((x) => x.id === l.grupo);
                  const omitida = l.asignado === 'omitir';
                  const ref = l.match ?? l.nuevo;
                  return (
                    <li key={l.key} className={`rounded-xl border border-border bg-card/50 px-3 py-2 ${omitida ? 'opacity-50' : ''}`}>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                        <div className="min-w-0 flex-1 basis-48">
                          <p className="truncate font-medium">{g?.emoji} {l.name}</p>
                          <p className="text-xs text-muted-foreground">Contaste: {l.qty}{l.suffix ? ` ${l.suffix}` : ''}</p>
                        </div>
                        <div className="w-full sm:w-64">
                          <Select value={valor(l.asignado)} onValueChange={(v) => setAsignaciones((a) => ({ ...a, [l.key]: v === 'nuevo' || v === 'omitir' ? v : Number(v) }))}>
                            <SelectTrigger className="h-9 text-xs" aria-label={`Insumo para ${l.name}`}><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="nuevo">➕ Crear insumo nuevo</SelectItem>
                              <SelectItem value="omitir">🚫 No cargar esta línea</SelectItem>
                              {l.candidatos.length > 0 && l.candidatos.map((c) => <SelectItem key={`c${c.id}`} value={String(c.id)}>≈ {c.name}</SelectItem>)}
                              {opciones.filter((i) => !l.candidatos.some((c) => c.id === i.id)).map((i) => <SelectItem key={i.id} value={String(i.id)}>{i.name}</SelectItem>)}
                            </SelectContent>
                          </Select>
                          {l.sugerido && asignaciones[l.key] === undefined && <span className="mt-0.5 inline-block rounded-full bg-sky-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-sky-400">sugerido</span>}
                        </div>
                      </div>
                      {!omitida && ref && (
                        <p className="mt-1 text-xs tabular-nums">
                          {l.sumaALaAnterior ? (
                            <span className="text-muted-foreground">+ {formatCantidad(l.target, ref)} (se suma a la línea de arriba del mismo insumo)</span>
                          ) : l.match ? (
                            <>
                              <span className="text-muted-foreground">Había {formatCantidad(l.match.stock, l.match)}</span>
                              <span className="mx-1">→</span>
                              <strong>Queda {formatCantidad(l.final, l.match)}</strong>
                              {l.diff !== null && <span className="ml-2">(<Diferencia diff={l.diff} insumo={l.match} />)</span>}
                            </>
                          ) : (
                            <>
                              <span className="mr-1 rounded-full bg-emerald-500/15 px-1.5 py-0.5 font-semibold text-emerald-500">nuevo</span>
                              <strong>{formatCantidad(l.target, ref)}</strong>
                            </>
                          )}
                        </p>
                      )}
                    </li>
                  );
                })}
              </ul>
              {conCambio > 0 && <p className="text-xs text-muted-foreground">{conCambio} insumos cambian de stock respecto de lo que había.</p>}

              {p.sinTocar.length > 0 && (
                <details className="rounded-xl border border-border px-3 py-2 text-sm [&_summary]:cursor-pointer [&_summary]:select-none [&_summary]:font-medium">
                  <summary>No aparecen en tu lista ({p.sinTocar.length})</summary>
                  <label className="mt-2 flex items-start gap-2 text-xs">
                    <input type="checkbox" checked={ceroSiFalta} onChange={(e) => setCeroSiFalta(e.target.checked)} className="mt-0.5 h-4 w-4" />
                    <span><strong>Dejar en 0 los que no están en mi lista</strong> (úsalo si tu lista tiene TODO lo que queda). Si no lo marcas, su stock no cambia.</span>
                  </label>
                  <ul className="mt-2 max-h-44 space-y-0.5 overflow-y-auto text-xs">
                    {p.sinTocar.map((i) => (
                      <li key={i.id} className="flex items-center gap-2">
                        <span className="min-w-0 flex-1 truncate">{i.name}</span>
                        <span className="shrink-0 tabular-nums text-muted-foreground">{formatCantidad(i.stock, i)}{p.ceroSiFalta && i.stock !== 0 ? ' → 0' : ''}</span>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
              {nuevos > 0 && <p className="text-xs text-muted-foreground">Los nuevos se crean con el envase que sale del nombre; después puedes ajustar el costo y la regla de consumo en «Editar».</p>}
            </div>
          )}
        </div>

        <DialogFooter>
          <WriteButton disabled={!p || cargables.length === 0 || needsReglas || pending || apply.isPending}
            onClick={() => apply.mutate({ ...query, eventId })} className="h-12 w-full text-base sm:w-auto sm:px-8">
            {apply.isPending ? 'Cargando…' : p ? `Dejar el stock en lo contado (${cargables.length}${aCero.length ? ` + ${aCero.length} en 0` : ''})` : 'Cargar'}
          </WriteButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
