import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { WriteButton } from '@/components/admin/WriteButton';
import { GRUPOS_INSUMO, formatCantidad, type GrupoInsumo } from '@shared/insumos';

const EJEMPLO = `47 Redbull Yellow
12 lata 350ml coca cola
0.9 Jagermeister 700ml
1.3 Bacardi Blanco 1.75lt
0.9 Guantes M Negro (caja de 100); desechable`;

/** Pega tu inventario contado (una línea por insumo) y lo carga de una vez: los que ya existen quedan con
 * lo que contaste y los que no existen se crean. Antes de aplicar muestra exactamente qué va a pasar. */
export function CargarInventarioDialog({ eventId, open, reglasReady, onClose, onDone }: {
  eventId: number;
  open: boolean;
  /** Sin la tabla de reglas solo se pueden cargar bebidas. */
  reglasReady: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const [texto, setTexto] = useState('');
  const [grupoDefecto, setGrupoDefecto] = useState<GrupoInsumo>('bebida');
  const [query, setQuery] = useState({ texto: '', grupoDefecto });
  useEffect(() => {
    const id = window.setTimeout(() => setQuery({ texto, grupoDefecto }), 400);
    return () => window.clearTimeout(id);
  }, [texto, grupoDefecto]);
  useEffect(() => { if (!open) { setTexto(''); setGrupoDefecto('bebida'); } }, [open]);

  const plan = trpc.insumos.inventarioPlan.useQuery(query, { enabled: open && query.texto.trim().length > 0, placeholderData: (prev) => prev });
  const apply = trpc.insumos.inventarioApply.useMutation({
    onSuccess: (r) => {
      toast.success(`Inventario cargado: ${r.actualizados} actualizados, ${r.creados} nuevos`);
      onDone();
    },
    onError: (e) => toast.error(e.message),
  });
  const p = texto.trim() ? plan.data : undefined;
  const needsReglas = !!p && !p.reglasListas && p.lineas.some((l) => l.grupo !== 'bebida');
  const nuevos = p?.lineas.filter((l) => !l.match).length ?? 0;
  const pending = texto !== query.texto || grupoDefecto !== query.grupoDefecto || plan.isFetching;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-h-[92vh] w-[96vw] max-w-[96vw] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Cargar inventario contado</DialogTitle>
          <DialogDescription>
            Una línea por insumo, como lo escribes en WhatsApp: <strong>cantidad y nombre</strong> (47 Redbull Yellow). La cantidad son envases y un decimal es parte de uno (0.9 = una botella al 90 %). El tamaño sale del nombre (750ml, 1,75lt, lata, caja de 100).
            El stock queda exactamente en lo que contaste.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label htmlFor="inv-texto">Tu lista</Label>
            <textarea id="inv-texto" value={texto} onChange={(e) => setTexto(e.target.value)} rows={8} placeholder={EJEMPLO}
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
              <p className="text-sm font-semibold">{p.lineas.length} insumos · {p.lineas.length - nuevos} existentes · {nuevos} nuevos</p>
              {needsReglas && <p className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-amber-500">Hay insumos que no son bebida: activa primero los insumos generales.</p>}
              {p.errores.length > 0 && <p className="rounded-xl border border-red-500/40 bg-red-500/10 p-2 text-xs text-red-500">No entendí estas líneas (ponles una cantidad): {p.errores.join(' · ')}</p>}
              {p.sumadas.length > 0 && <p className="text-xs text-amber-500">Estaban en más de una línea y se sumaron: {p.sumadas.join(', ')}</p>}
              <ul className="max-h-72 space-y-1 overflow-y-auto text-sm">
                {p.lineas.map((l) => {
                  const g = GRUPOS_INSUMO.find((x) => x.id === l.grupo);
                  return (
                    <li key={l.name} className="flex items-center gap-2 rounded-xl border border-border bg-card/50 px-3 py-1.5">
                      <span className="min-w-0 flex-1 truncate">{g?.emoji} {l.name}</span>
                      {l.match ? (
                        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                          {formatCantidad(l.match.stock, l.match)} → <strong className="text-foreground">{formatCantidad(l.target, l.match)}</strong>
                        </span>
                      ) : (
                        <span className="shrink-0 text-xs tabular-nums"><span className="mr-1 rounded-full bg-emerald-500/15 px-1.5 py-0.5 font-semibold text-emerald-500">nuevo</span><strong>{l.nuevo ? formatCantidad(l.target, { ...l.nuevo }) : l.target}</strong></span>
                      )}
                    </li>
                  );
                })}
              </ul>
              {nuevos > 0 && <p className="text-xs text-muted-foreground">Los nuevos se crean en unidades; después puedes ajustar el envase, el costo y la regla de consumo en «Editar».</p>}
            </div>
          )}
        </div>

        <DialogFooter>
          <WriteButton disabled={!p || p.lineas.length === 0 || needsReglas || pending || apply.isPending}
            onClick={() => apply.mutate({ texto: query.texto, grupoDefecto: query.grupoDefecto, eventId })} className="h-12 w-full text-base sm:w-auto sm:px-8">
            {apply.isPending ? 'Cargando…' : p ? `Cargar ${p.lineas.length} insumos` : 'Cargar'}
          </WriteButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
