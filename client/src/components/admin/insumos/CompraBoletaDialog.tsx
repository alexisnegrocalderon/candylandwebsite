import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { AlertTriangle, Check, Minus, Plus, Sparkles, SquarePlus } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { CameraCaptureField } from '@/components/admin/CameraCaptureField';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { WriteButton } from '@/components/admin/WriteButton';
import { cargaDeLinea, cuadreBoleta, sugerirNuevoInsumo, type Confianza, type TipoNuevo } from '@shared/compras';
import { GRUPOS_INSUMO, formatCantidad, formatSize, insumoSizes, normalizeName, type GrupoInsumo, type InsumoUnit } from '@shared/insumos';
import { money, type BarraData } from './types';

type Propuesta = Awaited<ReturnType<ReturnType<typeof trpc.insumos.comprasLeer.useMutation>['mutateAsync']>>;
type Insumo = { id: number; name: string; unit: InsumoUnit; containerSize: number; containerLabel: string; sizes: number[] };

/** Cómo se creará un producto que la boleta trae y todavía no existe. */
interface NuevoDraft { name: string; tipo: TipoNuevo; size: number; grupo: GrupoInsumo; clara: boolean; motivo: string | null }

/** Una línea de la boleta en revisión. Todo es editable; el resultado se recalcula al instante. */
interface Fila {
  key: number;
  descripcion: string;
  cantidad: number;
  precioUnitario: number;
  totalLinea: number;
  tamano: number;
  packUnidades: number;
  /** El insumo que ya existe (null = producto nuevo, se crea al cargar la compra con `nuevo`). */
  insumoId: number | null;
  nuevo: NuevoDraft | null;
  confianza: Confianza;
  candidatos: number[];
  /** La persona la eligió o la confirmó (se recuerda el nombre de la boleta para la próxima). */
  manual: boolean;
  /** Reconocida con seguridad, o ya confirmada por la persona. Una dudosa no se carga hasta que se confirme. */
  confirmada: boolean;
  omitida: boolean;
  cambiando: boolean;
  agregarManual: number | null;
}

const nuevoOpId = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`);

const TIPOS: { id: TipoNuevo; label: string }[] = [{ id: 'botella', label: '🍾 Botella (ml)' }, { id: 'lata', label: '🥫 Lata' }, { id: 'unidad', label: '1️⃣ Unidad' }];
/** El insumo que se crearía, con la misma forma que uno existente (para calcular cuánto suma la línea). */
const insumoDeNuevo = (f: Fila): Insumo | undefined => {
  const n = f.nuevo;
  if (!n) return undefined;
  const ml = n.tipo === 'botella';
  return { id: -(f.key + 1), name: n.name, unit: ml ? 'ml' : 'un', containerSize: ml ? n.size : 1, containerLabel: ml ? 'botella' : n.tipo === 'lata' ? 'lata' : 'unidad', sizes: ml ? [n.size] : [] };
};

/** Cargar una compra desde la foto de la boleta: la IA lee, el sistema empareja con tus insumos y calcula, y tú solo
 * confirmas. Lo que no existe se crea con un mini-asistente de una tarjeta por producto. */
export function CompraBoletaDialog({ eventId, data, open, onClose, onDone }: { eventId: number; data: BarraData; open: boolean; onClose: () => void; onDone: () => void }) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [prop, setProp] = useState<Propuesta | null>(null);
  const [filas, setFilas] = useState<Fila[]>([]);
  const [opId, setOpId] = useState(() => nuevoOpId());
  const [opts, setOpts] = useState({ costos: true, gasto: true, nombres: true });
  const [gastoTotal, setGastoTotal] = useState('');
  const [buscar, setBuscar] = useState('');

  const leer = trpc.insumos.comprasLeer.useMutation({ onError: (e) => toast.error(e.message) });
  const aplicar = trpc.insumos.comprasAplicar.useMutation({ onError: (e) => toast.error(e.message) });
  const aprender = trpc.insumos.comprasAprender.useMutation();
  /** Al asignar una línea a mano, se recuerda de inmediato (si el nombre se guardó, no se pierde aunque no se cargue la compra). */
  const recordar = (descripcion: string, insumoId: number) => { if (opts.nombres) aprender.mutate({ insumoId, alias: descripcion }); };

  const insumos: Insumo[] = useMemo(() => {
    return data.insumos.map((i) => ({ id: i.id, name: i.name, unit: i.unit, containerSize: i.containerSize, containerLabel: i.containerLabel, sizes: insumoSizes(i) }));
  }, [data.insumos]);
  const byId = useMemo(() => new Map(insumos.map((i) => [i.id, i])), [insumos]);

  const reset = () => { setImageUrl(null); setProp(null); setFilas([]); setOpId(nuevoOpId()); setOpts({ costos: true, gasto: true, nombres: true }); setBuscar(''); };
  const close = () => { reset(); onClose(); };

  const onFoto = async (url: string) => {
    setImageUrl(url);
    let r: Propuesta;
    try { r = await leer.mutateAsync({ imageUrl: url }); } catch { return; }
    if (!r.boleta.isReceipt) { toast.error('No parece una boleta legible. Prueba con otra foto, de frente y con buena luz.'); return; }
    setProp(r);
    setGastoTotal(String(r.boleta.total || ''));
    const rows: Fila[] = r.lineas.map((l, i) => {
      const nuevoSug = l.match.insumoId == null ? sugerirNuevoInsumo(l) : null;
      return {
        key: i, descripcion: l.descripcion, cantidad: l.cantidad, precioUnitario: l.precioUnitario, totalLinea: l.totalLinea, tamano: l.tamano, packUnidades: l.packUnidades,
        insumoId: l.match.insumoId, nuevo: nuevoSug, confianza: l.match.confianza, candidatos: l.match.candidatos.map((c) => c.insumoId), manual: false,
        // Reconocida con seguridad: se suma sola. Dudosa: pide confirmar. Nueva: se crea sola salvo que falte saber el tamaño.
        confirmada: l.match.insumoId != null ? l.match.confianza === 'alta' : !!nuevoSug?.clara,
        // Los descuentos y las líneas sin precio positivo no suman stock.
        omitida: l.totalLinea <= 0, cambiando: false, agregarManual: null,
      };
    });
    // Lo que pide una decisión va primero; el resto queda en el orden de la boleta.
    const rango = (f: Fila) => (f.omitida ? 3 : !f.confirmada ? 0 : f.insumoId == null ? 1 : 2);
    setFilas(rows.map((f, i) => ({ f, i })).sort((a, b) => rango(a.f) - rango(b.f) || a.i - b.i).map((x) => x.f));
  };

  const upd = (key: number, patch: Partial<Fila>) => setFilas((fs) => fs.map((f) => (f.key === key ? { ...f, ...patch } : f)));
  const insumoDe = (f: Fila): Insumo | undefined => (f.insumoId != null ? byId.get(f.insumoId) : insumoDeNuevo(f));
  const carga = (f: Fila) => {
    const ins = insumoDe(f);
    return ins ? cargaDeLinea({ cantidad: f.cantidad, precioUnitario: f.precioUnitario, totalLinea: f.totalLinea, tamano: f.tamano, packUnidades: f.packUnidades }, ins) : null;
  };

  const vivas = filas.filter((f) => !f.omitida);
  const porConfirmar = vivas.filter((f) => !f.confirmada);
  const nuevosAuto = vivas.filter((f) => f.insumoId == null && f.confirmada);
  const reconocidas = vivas.filter((f) => f.insumoId != null && f.confirmada);
  const activas = vivas.filter((f) => f.confirmada);
  const cuadre = prop ? cuadreBoleta(filas.map((f) => ({ totalLinea: f.totalLinea })), prop.boleta.total) : null;
  const existenteConNombre = (name: string) => insumos.find((i) => normalizeName(i.name) === normalizeName(name));

  const paso = !prop ? 'foto' : 'revisar';
  const hayAvisos = activas.some((f) => (carga(f)?.avisos.length ?? 0) > 0);

  const confirmar = async () => {
    if (!prop) return;
    const lineas = activas.map((f) => {
      const c = carga(f)!;
      const ins = insumoDe(f)!;
      const detalle = ins.unit === 'un' ? `${c.envases} un` : `${c.envases} × ${formatSize(c.tamano, ins.unit)}`;
      const nuevo = f.insumoId == null && f.nuevo ? {
        name: f.nuevo.name.trim(), unit: ins.unit, containerSize: ins.containerSize, containerLabel: ins.containerLabel, sizes: ins.sizes, grupo: f.nuevo.grupo,
        costo: c.costoParaInsumo,
      } : null;
      return {
        insumoId: f.insumoId, nuevo, agregar: f.agregarManual ?? c.agregar, costoParaInsumo: c.costoParaInsumo,
        // Lo que la persona eligió, confirmó o creó se recuerda para reconocerlo solo la próxima vez.
        alias: f.manual || nuevo ? f.descripcion : null, detalle,
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
    const nuevos = r.creados.length > 0 ? ` · ${r.creados.length} producto${r.creados.length === 1 ? '' : 's'} nuevo${r.creados.length === 1 ? '' : 's'} creado${r.creados.length === 1 ? '' : 's'}` : '';
    toast.success(r.yaAplicada ? 'Esta compra ya estaba cargada.' : `Compra cargada: ${r.insumos} insumos${nuevos}${r.gastoId ? ' y el gasto en Finanzas' : ''}`);
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
            {paso === 'foto' && 'Saca una foto de la boleta o factura: el sistema lee cada producto y lo busca en tus insumos. Lo que reconoce con seguridad se suma solo, lo que no está claro te lo pregunta y lo que es nuevo lo crea.'}
            {paso === 'revisar' && (porConfirmar.length > 0 ? `Faltan ${porConfirmar.length} por confirmar (arriba). Nada se carga hasta que aprietes «Cargar compra».` : 'Todo listo: revisa las cantidades y confirma. Nada se carga hasta que aprietes «Cargar compra».')}
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

          {paso === 'revisar' && (
            <>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="rounded-full bg-emerald-500/15 px-3 py-1 font-semibold text-emerald-600 dark:text-emerald-400">✓ {reconocidas.length} reconocidos</span>
                <span className="rounded-full bg-primary/15 px-3 py-1 font-semibold text-primary">＋ {nuevosAuto.length} nuevos se crean</span>
                {porConfirmar.length > 0 && <span className="rounded-full bg-amber-500/15 px-3 py-1 font-semibold text-amber-600 dark:text-amber-400">? {porConfirmar.length} por confirmar</span>}
                {porConfirmar.some((f) => f.insumoId != null) && (
                  <Button type="button" variant="outline" size="sm" className="ml-auto"
                    onClick={() => { filas.filter((f) => !f.omitida && !f.confirmada && f.insumoId != null).forEach((f) => recordar(f.descripcion, f.insumoId!)); setFilas((fs) => fs.map((f) => (!f.omitida && !f.confirmada && f.insumoId != null ? { ...f, confirmada: true, manual: true } : f))); }}>
                    Confirmar todas las sugeridas
                  </Button>
                )}
              </div>
              <ul className="space-y-3">
                {filas.map((f) => {
                  const ins = insumoDe(f);
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
                  const esNuevo = f.insumoId == null && !!f.nuevo;
                  const existente = esNuevo ? existenteConNombre(f.nuevo!.name) : undefined;
                  const borde = !f.confirmada ? 'border-amber-500/70 bg-amber-500/5' : esNuevo ? 'border-primary/50 bg-primary/5' : 'border-border bg-card/60';
                  return (
                    <li key={f.key} className={`space-y-2 rounded-2xl border-2 p-3 ${borde}`}>
                      <div className="flex items-start gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs text-muted-foreground">Boleta: {f.descripcion}</p>
                          {esNuevo ? (
                            <p className="flex items-center gap-1.5 text-base font-semibold"><SquarePlus className="h-4 w-4 text-primary" /> Producto nuevo</p>
                          ) : (
                            <p className="flex items-center gap-1.5 text-base font-semibold">
                              {f.confirmada ? <Check className="h-4 w-4 text-emerald-500" /> : <AlertTriangle className="h-4 w-4 text-amber-500" />}
                              {ins.name}
                            </p>
                          )}
                        </div>
                        {!esNuevo && <Button type="button" variant="outline" size="sm" onClick={() => upd(f.key, { cambiando: !f.cambiando })}>Cambiar</Button>}
                        <Button type="button" variant="ghost" size="sm" onClick={() => upd(f.key, { omitida: true })}>Quitar</Button>
                      </div>

                      {/* Dudosa: hay que decidir antes de cargar */}
                      {!esNuevo && !f.confirmada && (
                        <div className="space-y-2 rounded-xl bg-amber-500/10 p-2.5">
                          <p className="text-sm font-medium text-amber-700 dark:text-amber-300">No estoy seguro: ¿«{f.descripcion}» es «{ins.name}»?</p>
                          <div className="flex flex-wrap gap-2">
                            <Button type="button" size="sm" onClick={() => { recordar(f.descripcion, ins.id); upd(f.key, { confirmada: true, manual: true }); }}>Sí, es este</Button>
                            <Button type="button" variant="outline" size="sm" onClick={() => upd(f.key, { cambiando: true })}>Es otro</Button>
                            <Button type="button" variant="outline" size="sm"
                              onClick={() => { const sug = sugerirNuevoInsumo(f); upd(f.key, { insumoId: null, nuevo: sug, confirmada: sug.clara, cambiando: false, agregarManual: null }); }}>Es un producto nuevo</Button>
                          </div>
                        </div>
                      )}

                      {/* Producto nuevo: ya viene propuesto, se puede ajustar */}
                      {esNuevo && f.nuevo && (
                        <div className="space-y-2 rounded-xl bg-background/60 p-2.5">
                          <div>
                            <label className="mb-1 block text-xs font-medium text-muted-foreground">Se creará en tu stock como</label>
                            <Input value={f.nuevo.name} className="h-10" onChange={(e) => upd(f.key, { nuevo: { ...f.nuevo!, name: e.target.value } })} />
                            {existente && <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">Ya existe «{existente.name}»: esta compra se sumará a ese en vez de crear uno nuevo.</p>}
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {TIPOS.map((t) => (
                              <button key={t.id} type="button" aria-pressed={f.nuevo!.tipo === t.id} className={chip(f.nuevo!.tipo === t.id)}
                                onClick={() => upd(f.key, { nuevo: { ...f.nuevo!, tipo: t.id }, confirmada: true, agregarManual: null })}>{t.label}</button>
                            ))}
                          </div>
                          {f.nuevo.tipo === 'botella' && (
                            <div className="flex flex-wrap gap-1.5">
                              {Array.from(new Set([f.tamano, f.nuevo.size, 700, 750, 1000, 1500, 2000].filter((x) => x > 0))).sort((a, b) => a - b).map((x) => (
                                <button key={x} type="button" aria-pressed={f.nuevo!.size === x} className={chip(f.nuevo!.size === x)}
                                  onClick={() => upd(f.key, { nuevo: { ...f.nuevo!, size: x }, tamano: x, confirmada: true, agregarManual: null })}>{formatSize(x, 'ml')}{x === f.tamano ? ' · de la boleta' : ''}</button>
                              ))}
                            </div>
                          )}
                          <div className="flex flex-wrap gap-1.5">
                            {GRUPOS_INSUMO.map((g) => (
                              <button key={g.id} type="button" aria-pressed={f.nuevo!.grupo === g.id} className={chip(f.nuevo!.grupo === g.id)}
                                onClick={() => upd(f.key, { nuevo: { ...f.nuevo!, grupo: g.id } })}>{g.emoji} {g.label}</button>
                            ))}
                          </div>
                          {!f.confirmada && (
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="flex-1 text-sm font-medium text-amber-700 dark:text-amber-300">{f.nuevo.motivo ?? 'Revisa cómo se creará.'}</p>
                              <Button type="button" size="sm" onClick={() => upd(f.key, { confirmada: true })}>Está bien así</Button>
                            </div>
                          )}
                          <Button type="button" variant="ghost" size="sm" className="h-8 px-2 text-xs" onClick={() => upd(f.key, { cambiando: !f.cambiando })}>Es uno que ya tengo</Button>
                        </div>
                      )}

                      {f.cambiando && (
                        <div className="space-y-2 rounded-xl bg-muted/50 p-2">
                          <Input value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="Buscar en tus insumos…" />
                          <div className="flex max-h-36 flex-wrap gap-1.5 overflow-y-auto">
                            {[...f.candidatos.map((id) => byId.get(id)).filter((x): x is Insumo => !!x), ...insumos.filter((i) => !f.candidatos.includes(i.id))]
                              .filter((i) => !q || i.name.toLowerCase().includes(q)).slice(0, 40).map((i) => (
                                <button key={i.id} type="button" className="rounded-full border-2 border-border bg-card px-3 py-1.5 text-sm hover:bg-muted active:scale-95"
                                  onClick={() => { recordar(f.descripcion, i.id); upd(f.key, { insumoId: i.id, nuevo: null, manual: true, confirmada: true, confianza: 'alta', cambiando: false, agregarManual: null }); setBuscar(''); }}>{i.name}</button>
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
                        {ins.unit !== 'un' && !esNuevo && (
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
                      {f.confirmada && c.avisos.map((a) => <p key={a} className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400"><AlertTriangle className="h-3.5 w-3.5 shrink-0" /> {a}</p>)}
                    </li>
                  );
                })}
              </ul>

              <div className="space-y-2 rounded-2xl bg-muted/40 p-3 text-sm">
                <label className="flex items-center gap-2"><input type="checkbox" checked={opts.costos} onChange={(e) => setOpts((o) => ({ ...o, costos: e.target.checked }))} /> Actualizar el costo de cada insumo con el precio de la boleta</label>
                <label className="flex items-center gap-2"><input type="checkbox" checked={opts.nombres} onChange={(e) => setOpts((o) => ({ ...o, nombres: e.target.checked }))} /> Recordar los nombres que confirmé o creé para reconocerlos solos la próxima vez</label>
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
              {porConfirmar.length > 0 ? `Faltan ${porConfirmar.length} por confirmar para poder cargar.` : `${activas.length} líneas se cargan${nuevosAuto.length ? ` (${nuevosAuto.length} productos nuevos)` : ''}${hayAvisos ? ' · hay avisos que revisar' : ''}`}
            </p>
            <Button type="button" variant="outline" className="h-12" onClick={close}>Cancelar</Button>
            <WriteButton type="button" className="h-12 px-6 text-base" disabled={paso !== 'revisar' || aplicar.isPending || activas.length === 0 || porConfirmar.length > 0} onClick={confirmar}>
              {aplicar.isPending ? 'Cargando…' : 'Cargar compra'}
            </WriteButton>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
