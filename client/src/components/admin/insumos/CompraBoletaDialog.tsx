import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { AlertTriangle, Check, Minus, Plus, Sparkles } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { CameraCaptureField } from '@/components/admin/CameraCaptureField';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { WriteButton } from '@/components/admin/WriteButton';
import { cargaDeLinea, cuadreBoleta, nombreSugerido, type Confianza } from '@shared/compras';
import { formatCantidad, formatSize, insumoSizes, type InsumoUnit } from '@shared/insumos';
import { money, type BarraData } from './types';

type Propuesta = Awaited<ReturnType<ReturnType<typeof trpc.insumos.comprasLeer.useMutation>['mutateAsync']>>;
type Insumo = { id: number; name: string; unit: InsumoUnit; containerSize: number; containerLabel: string; sizes: number[] };

/** Una línea de la boleta en revisión. Todo es editable; el resultado se recalcula al instante. */
interface Fila {
  key: number;
  descripcion: string;
  cantidad: number;
  precioUnitario: number;
  totalLinea: number;
  tamano: number;
  packUnidades: number;
  insumoId: number | null;
  confianza: Confianza;
  candidatos: number[];
  /** La persona la eligió o la creó (se recuerda el nombre de la boleta para la próxima). */
  manual: boolean;
  omitida: boolean;
  cambiando: boolean;
  agregarManual: number | null;
}

const nuevoOpId = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`);

const BLANK_NUEVO = { name: '', tipo: 'botella' as 'botella' | 'lata', size: 750 };

/** Cargar una compra desde la foto de la boleta: la IA lee, el sistema empareja con tus insumos y calcula, y tú solo
 * confirmas. Lo que no existe se crea con un mini-asistente de una tarjeta por producto. */
export function CompraBoletaDialog({ eventId, data, open, onClose, onDone }: { eventId: number; data: BarraData; open: boolean; onClose: () => void; onDone: () => void }) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [prop, setProp] = useState<Propuesta | null>(null);
  const [filas, setFilas] = useState<Fila[]>([]);
  const [creados, setCreados] = useState<Insumo[]>([]);
  const [opId, setOpId] = useState(() => nuevoOpId());
  const [opts, setOpts] = useState({ costos: true, gasto: true, nombres: true });
  const [gastoTotal, setGastoTotal] = useState('');
  const [nuevo, setNuevo] = useState(BLANK_NUEVO);
  const [buscar, setBuscar] = useState('');
  const [vinculando, setVinculando] = useState(false);

  const leer = trpc.insumos.comprasLeer.useMutation({ onError: (e) => toast.error(e.message) });
  const aplicar = trpc.insumos.comprasAplicar.useMutation({ onError: (e) => toast.error(e.message) });
  const crear = trpc.insumos.save.useMutation({ onError: (e) => toast.error(e.message) });
  const aprender = trpc.insumos.comprasAprender.useMutation();
  /** Al asignar una línea a mano, se recuerda de inmediato (si el nombre se guardó, no se pierde aunque no se cargue la compra). */
  const recordar = (descripcion: string, insumoId: number) => { if (opts.nombres) aprender.mutate({ insumoId, alias: descripcion }); };

  const insumos: Insumo[] = useMemo(() => {
    const base: Insumo[] = data.insumos.map((i) => ({ id: i.id, name: i.name, unit: i.unit, containerSize: i.containerSize, containerLabel: i.containerLabel, sizes: insumoSizes(i) }));
    return [...base, ...creados.filter((c) => !base.some((b) => b.id === c.id))];
  }, [data.insumos, creados]);
  const byId = useMemo(() => new Map(insumos.map((i) => [i.id, i])), [insumos]);

  const reset = () => { setImageUrl(null); setProp(null); setFilas([]); setCreados([]); setOpId(nuevoOpId()); setOpts({ costos: true, gasto: true, nombres: true }); setNuevo(BLANK_NUEVO); setBuscar(''); setVinculando(false); };
  const close = () => { reset(); onClose(); };

  const onFoto = async (url: string) => {
    setImageUrl(url);
    let r: Propuesta;
    try { r = await leer.mutateAsync({ imageUrl: url }); } catch { return; }
    if (!r.boleta.isReceipt) { toast.error('No parece una boleta legible. Prueba con otra foto, de frente y con buena luz.'); return; }
    setProp(r);
    setGastoTotal(String(r.boleta.total || ''));
    setFilas(r.lineas.map((l, i) => ({
      key: i, descripcion: l.descripcion, cantidad: l.cantidad, precioUnitario: l.precioUnitario, totalLinea: l.totalLinea, tamano: l.tamano, packUnidades: l.packUnidades,
      insumoId: l.match.insumoId, confianza: l.match.confianza, candidatos: l.match.candidatos.map((c) => c.insumoId), manual: false,
      // Los descuentos y las líneas sin precio positivo no suman stock.
      omitida: l.totalLinea <= 0, cambiando: false, agregarManual: null,
    })));
  };

  const upd = (key: number, patch: Partial<Fila>) => setFilas((fs) => fs.map((f) => (f.key === key ? { ...f, ...patch } : f)));
  const carga = (f: Fila) => {
    const ins = f.insumoId != null ? byId.get(f.insumoId) : undefined;
    return ins ? cargaDeLinea({ cantidad: f.cantidad, precioUnitario: f.precioUnitario, totalLinea: f.totalLinea, tamano: f.tamano, packUnidades: f.packUnidades }, ins) : null;
  };

  const pendientes = filas.filter((f) => f.insumoId == null && !f.omitida);
  const activas = filas.filter((f) => f.insumoId != null && !f.omitida);
  const cuadre = prop ? cuadreBoleta(filas.map((f) => ({ totalLinea: f.totalLinea })), prop.boleta.total) : null;
  const primero = pendientes[0];

  const crearNuevo = async () => {
    if (!primero) return;
    const name = nuevo.name.trim() || nombreSugerido(primero.descripcion);
    const esLata = nuevo.tipo === 'lata';
    const size = esLata ? 1 : nuevo.size;
    const envases = primero.cantidad * primero.packUnidades;
    const costo = envases > 0 ? Math.round(primero.totalLinea / envases) : null;
    let r: { id: number };
    try { r = await crear.mutateAsync({
      name, unit: esLata ? 'un' : 'ml', containerSize: size, containerLabel: esLata ? 'lata' : 'botella', sizes: esLata ? [] : [size],
      costPerContainer: costo, alertDrinks: esLata ? 10 : 15,
    }); } catch { return; }
    setCreados((cs) => [...cs, { id: r.id, name, unit: esLata ? 'un' : 'ml', containerSize: size, containerLabel: esLata ? 'lata' : 'botella', sizes: esLata ? [] : [size] }]);
    recordar(primero.descripcion, r.id);
    upd(primero.key, { insumoId: r.id, manual: true, confianza: 'alta', tamano: esLata ? primero.tamano : size });
    setNuevo(BLANK_NUEVO); setBuscar(''); setVinculando(false);
  };

  const paso = !prop ? 'foto' : pendientes.length > 0 ? 'nuevos' : 'revisar';
  const hayAvisos = activas.some((f) => (carga(f)?.avisos.length ?? 0) > 0);

  const confirmar = async () => {
    if (!prop) return;
    const lineas = activas.map((f) => {
      const c = carga(f)!;
      const ins = byId.get(f.insumoId!)!;
      return {
        insumoId: ins.id, agregar: f.agregarManual ?? c.agregar, costoParaInsumo: c.costoParaInsumo,
        alias: f.manual ? f.descripcion : null,
        detalle: ins.unit === 'un' ? `${c.envases} un` : `${c.envases} × ${formatSize(c.tamano, ins.unit)}`,
      };
    }).filter((l) => l.agregar > 0);
    if (lineas.length === 0) { toast.error('No hay nada que cargar.'); return; }
    let r: Awaited<ReturnType<typeof aplicar.mutateAsync>>;
    try { r = await aplicar.mutateAsync({
      opId, eventId, lineas, actualizarCostos: opts.costos, recordarNombres: opts.nombres,
      gasto: {
        crear: opts.gasto && Number(gastoTotal) > 0, proveedor: prop.boleta.proveedor, rut: prop.boleta.rut, fecha: prop.boleta.fecha, documentType: prop.boleta.documentType,
        numero: prop.boleta.numero, total: Math.round(Number(gastoTotal) || 0), ivaExempt: prop.boleta.ivaExempt, receiptUrl: imageUrl,
      },
    }); } catch { return; }
    toast.success(r.yaAplicada ? 'Esta compra ya estaba cargada.' : `Compra cargada: ${r.insumos} insumos${r.gastoId ? ' y el gasto en Finanzas' : ''}`);
    reset(); onDone();
  };

  const chip = (on: boolean) => `rounded-full px-3 py-1.5 text-sm font-medium ${on ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`;
  const q = buscar.trim().toLowerCase();

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) close(); }}>
      <DialogContent className="flex max-h-[94vh] w-[96vw] max-w-[96vw] flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl">
        <DialogHeader className="border-b border-border px-5 py-4 pr-12">
          <DialogTitle className="flex items-center gap-2 text-xl"><Sparkles className="h-5 w-5 text-primary" /> Cargar compra desde la boleta</DialogTitle>
          <DialogDescription>
            {paso === 'foto' && 'Saca una foto de la boleta o factura: el sistema lee cada producto, lo busca en tus insumos y calcula cuánto sumar. Tú confirmas.'}
            {paso === 'nuevos' && `Hay ${pendientes.length} producto${pendientes.length === 1 ? '' : 's'} que no encuentro en tus insumos. Una tarjeta a la vez.`}
            {paso === 'revisar' && 'Revisa las cantidades y confirma. Nada se carga hasta que aprietes «Cargar compra».'}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 space-y-4 overflow-y-auto overscroll-contain px-5 py-4">
          {paso === 'foto' && (
            <div className="flex flex-col items-center gap-4 rounded-3xl border-2 border-dashed border-border px-4 py-10 text-center">
              <span className="text-5xl">🧾</span>
              <p className="max-w-sm text-sm text-muted-foreground">Foto de frente, con buena luz y que se vean todas las líneas. Si la boleta es larga, puedes cargarla en dos partes.</p>
              <CameraCaptureField label="Sacar o elegir foto de la boleta" pathPrefix="compras" onScanned={onFoto} analyzing={leer.isPending} buttonClassName="h-12 px-6 text-base" />
              {leer.isPending && <p className="text-sm text-muted-foreground">Leyendo la boleta con IA… puede tardar unos segundos.</p>}
            </div>
          )}

          {prop && (
            <div className="rounded-2xl bg-muted/50 p-3 text-sm">
              <p className="font-semibold">{prop.boleta.proveedor || 'Proveedor sin nombre'}{prop.boleta.numero ? ` · N° ${prop.boleta.numero}` : ''}{prop.boleta.fecha ? ` · ${prop.boleta.fecha}` : ''}</p>
              {cuadre && (
                <p className={`mt-0.5 flex items-center gap-1 ${cuadre.cuadra ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
                  {cuadre.cuadra ? <Check className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
                  {cuadre.cuadra ? `Las ${filas.length} líneas suman el total de la boleta (${money(prop.boleta.total)}).`
                    : `Las líneas suman ${money(cuadre.suma)} y la boleta dice ${money(prop.boleta.total)} (${cuadre.diferencia > 0 ? 'faltan' : 'sobran'} ${money(Math.abs(cuadre.diferencia))}). Puede faltar una línea: revisa o saca otra foto.`}
                </p>
              )}
              {prop.boleta.notas && <p className="mt-0.5 text-xs text-muted-foreground">{prop.boleta.notas}</p>}
            </div>
          )}

          {/* Wizard de productos nuevos: una tarjeta a la vez */}
          {paso === 'nuevos' && primero && (
            <div className="space-y-3 rounded-3xl border-2 border-primary/60 bg-primary/5 p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Producto nuevo {filas.filter((f) => f.insumoId == null && !f.omitida).length > 0 ? `(${pendientes.length} por resolver)` : ''}</p>
              <p className="text-lg font-bold">«{primero.descripcion}»</p>
              <p className="text-sm text-muted-foreground">Compraste {primero.cantidad}{primero.packUnidades > 1 ? ` × pack de ${primero.packUnidades}` : ''} a {money(primero.precioUnitario)} · total {money(primero.totalLinea)}</p>

              {!vinculando ? (
                <>
                  <div>
                    <label className="mb-1 block text-sm font-medium">Cómo se llamará en tu stock</label>
                    <Input value={nuevo.name || nombreSugerido(primero.descripcion)} onChange={(e) => setNuevo((n) => ({ ...n, name: e.target.value }))} />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" className={chip(nuevo.tipo === 'botella')} onClick={() => setNuevo((n) => ({ ...n, tipo: 'botella' }))}>🍾 Botella o líquido (ml)</button>
                    <button type="button" className={chip(nuevo.tipo === 'lata')} onClick={() => setNuevo((n) => ({ ...n, tipo: 'lata' }))}>🥫 Lata o unidad</button>
                  </div>
                  {nuevo.tipo === 'botella' && (
                    <div className="flex flex-wrap gap-2">
                      {Array.from(new Set([primero.tamano, 350, 500, 750, 1000, 1500, 2000].filter((s) => s > 0))).sort((a, b) => a - b).map((s) => (
                        <button key={s} type="button" className={chip(nuevo.size === s)}
                          onClick={() => setNuevo((n) => ({ ...n, size: s }))}>{formatSize(s, 'ml')}{s === primero.tamano ? ' · de la boleta' : ''}</button>
                      ))}
                    </div>
                  )}
                  <div className="flex flex-wrap gap-2 pt-1">
                    <WriteButton type="button" className="h-11" disabled={crear.isPending} onClick={crearNuevo}>{crear.isPending ? 'Creando…' : 'Crear y usar'}</WriteButton>
                    <Button type="button" variant="outline" className="h-11" onClick={() => setVinculando(true)}>Es uno que ya tengo</Button>
                    <Button type="button" variant="ghost" className="h-11" onClick={() => upd(primero.key, { omitida: true })}>Omitir esta línea</Button>
                  </div>
                </>
              ) : (
                <div className="space-y-2">
                  <Input value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="Buscar en tus insumos…" autoFocus />
                  <div className="flex max-h-48 flex-wrap gap-1.5 overflow-y-auto">
                    {insumos.filter((i) => !q || i.name.toLowerCase().includes(q)).slice(0, 40).map((i) => (
                      <button key={i.id} type="button" className="rounded-full border-2 border-border bg-card px-3 py-1.5 text-sm hover:bg-muted active:scale-95"
                        onClick={() => { recordar(primero.descripcion, i.id); upd(primero.key, { insumoId: i.id, manual: true, confianza: 'alta' }); setVinculando(false); setBuscar(''); }}>{i.name}</button>
                    ))}
                  </div>
                  <Button type="button" variant="ghost" onClick={() => setVinculando(false)}>Volver</Button>
                </div>
              )}
            </div>
          )}

          {/* Revisión: una tarjeta por línea reconocida */}
          {paso === 'revisar' && (
            <>
              <ul className="space-y-3">
                {filas.map((f) => {
                  const ins = f.insumoId != null ? byId.get(f.insumoId) : undefined;
                  const c = carga(f);
                  if (f.omitida) {
                    return (
                      <li key={f.key} className="flex items-center gap-2 rounded-2xl border border-dashed border-border px-3 py-2 text-sm text-muted-foreground">
                        <span className="min-w-0 flex-1 truncate line-through">{f.descripcion}</span>
                        <span>{money(f.totalLinea)}</span>
                        <Button type="button" variant="ghost" size="sm" onClick={() => upd(f.key, { omitida: false })}>Incluir</Button>
                      </li>
                    );
                  }
                  if (!ins || !c) return null;
                  const agregar = f.agregarManual ?? c.agregar;
                  const tamanos = Array.from(new Set([...ins.sizes, ins.containerSize, f.tamano].filter((s) => s > 0))).sort((a, b) => a - b);
                  return (
                    <li key={f.key} className="space-y-2 rounded-2xl border-2 border-border bg-card/60 p-3">
                      <div className="flex items-start gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs text-muted-foreground">Boleta: {f.descripcion}</p>
                          <p className="flex items-center gap-1.5 text-base font-semibold">
                            {f.confianza === 'alta' ? <Check className="h-4 w-4 text-emerald-500" /> : <AlertTriangle className="h-4 w-4 text-amber-500" />}
                            {ins.name}
                          </p>
                        </div>
                        <Button type="button" variant="outline" size="sm" onClick={() => upd(f.key, { cambiando: !f.cambiando })}>Cambiar</Button>
                        <Button type="button" variant="ghost" size="sm" onClick={() => upd(f.key, { omitida: true })}>Quitar</Button>
                      </div>
                      {f.confianza !== 'alta' && !f.manual && <p className="text-xs text-amber-600 dark:text-amber-400">No estoy seguro de este: confirma que es el correcto.</p>}
                      {f.cambiando && (
                        <div className="space-y-2 rounded-xl bg-muted/50 p-2">
                          <Input value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="Buscar en tus insumos…" />
                          <div className="flex max-h-36 flex-wrap gap-1.5 overflow-y-auto">
                            {[...f.candidatos.map((id) => byId.get(id)).filter((x): x is Insumo => !!x), ...insumos.filter((i) => !f.candidatos.includes(i.id))]
                              .filter((i) => !q || i.name.toLowerCase().includes(q)).slice(0, 40).map((i) => (
                                <button key={i.id} type="button" className="rounded-full border-2 border-border bg-card px-3 py-1.5 text-sm hover:bg-muted active:scale-95"
                                  onClick={() => { recordar(f.descripcion, i.id); upd(f.key, { insumoId: i.id, manual: true, confianza: 'alta', cambiando: false, agregarManual: null }); setBuscar(''); }}>{i.name}</button>
                              ))}
                          </div>
                        </div>
                      )}
                      <div className="flex flex-wrap items-center gap-3">
                        <div className="flex items-center gap-1.5">
                          <Button type="button" variant="outline" size="icon" className="h-10 w-10" aria-label="Una menos" onClick={() => upd(f.key, { cantidad: Math.max(0, f.cantidad - 1), agregarManual: null })}><Minus className="h-4 w-4" /></Button>
                          <Input type="number" inputMode="decimal" min={0} value={f.cantidad} aria-label="Cantidad comprada" className="h-10 w-16 text-center text-lg font-bold"
                            onChange={(e) => upd(f.key, { cantidad: Math.max(0, Number(e.target.value) || 0), agregarManual: null })} />
                          <Button type="button" size="icon" className="h-10 w-10" aria-label="Una más" onClick={() => upd(f.key, { cantidad: f.cantidad + 1, agregarManual: null })}><Plus className="h-4 w-4" /></Button>
                        </div>
                        {ins.unit !== 'un' && (
                          <div className="flex flex-wrap gap-1.5">
                            {tamanos.map((s) => (
                              <button key={s} type="button" aria-pressed={c.tamano === s} className={chip(c.tamano === s)} onClick={() => upd(f.key, { tamano: s, agregarManual: null })}>{formatSize(s, ins.unit)}</button>
                            ))}
                          </div>
                        )}
                        {f.packUnidades > 1 && <span className="text-xs text-muted-foreground">pack de {f.packUnidades}</span>}
                      </div>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                        <span className="font-semibold text-emerald-600 dark:text-emerald-400">+ {formatCantidad(agregar, ins as any)}</span>
                        <span className="text-muted-foreground">{c.envases} {ins.unit === 'un' ? 'un' : ins.containerLabel + (c.envases === 1 ? '' : 's')} · {money(f.totalLinea)}{c.costoEnvase > 0 ? ` (${money(c.costoEnvase)} c/u)` : ''}</span>
                      </div>
                      {c.avisos.map((a) => <p key={a} className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400"><AlertTriangle className="h-3.5 w-3.5 shrink-0" /> {a}</p>)}
                    </li>
                  );
                })}
              </ul>

              <div className="space-y-2 rounded-2xl bg-muted/40 p-3 text-sm">
                <label className="flex items-center gap-2"><input type="checkbox" checked={opts.costos} onChange={(e) => setOpts((o) => ({ ...o, costos: e.target.checked }))} /> Actualizar el costo de cada insumo con el precio de la boleta</label>
                <label className="flex items-center gap-2"><input type="checkbox" checked={opts.nombres} onChange={(e) => setOpts((o) => ({ ...o, nombres: e.target.checked }))} /> Recordar los nombres que elegí para reconocerlos solos la próxima vez</label>
                <label className="flex flex-wrap items-center gap-2">
                  <input type="checkbox" checked={opts.gasto} onChange={(e) => setOpts((o) => ({ ...o, gasto: e.target.checked }))} /> Registrar el gasto en Finanzas y guardar la foto
                  {opts.gasto && <Input type="number" inputMode="numeric" value={gastoTotal} onChange={(e) => setGastoTotal(e.target.value)} aria-label="Total del gasto" className="h-8 w-32" />}
                </label>
              </div>
            </>
          )}
        </div>

        {prop && (
          <div className="flex flex-wrap items-center gap-3 border-t border-border bg-background/95 px-5 py-3">
            <p className="min-w-0 flex-1 text-sm text-muted-foreground">
              {paso === 'revisar' ? `${activas.length} insumos se cargan${hayAvisos ? ' · hay avisos que revisar' : ''}` : 'Resuelve los productos nuevos para continuar.'}
            </p>
            <Button type="button" variant="outline" className="h-12" onClick={close}>Cancelar</Button>
            <WriteButton type="button" className="h-12 px-6 text-base" disabled={paso !== 'revisar' || aplicar.isPending || activas.length === 0} onClick={confirmar}>
              {aplicar.isPending ? 'Cargando…' : 'Cargar compra'}
            </WriteButton>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
