import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { DatabaseZap, Plus } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AdminPasswordDialog } from '@/components/admin/AdminPasswordDialog';
import { WriteButton } from '@/components/admin/WriteButton';
import { useIsDemo } from '@/lib/demoMode';
import { StockTab } from './StockTab';
import { RecetasTab } from './RecetasTab';
import { ComprasTab } from './ComprasTab';
import { HistorialTab } from './HistorialTab';
import { InsumoDialog, type InsumoFormValue } from './InsumoDialog';

type Tab = 'stock' | 'recetas' | 'compras' | 'historial';
const TABS: { id: Tab; label: string; help: string }[] = [
  { id: 'stock', label: 'Stock', help: 'Lo que hay de cada insumo. Baja solo con cada venta de /caja y se corrige con los conteos de la barra.' },
  { id: 'recetas', label: 'Recetas', help: 'Cuánto gasta cada trago de cada insumo. Dos tragos con la misma base gastan del mismo stock.' },
  { id: 'compras', label: 'Lista de compras', help: 'Lo que falta comprar para la cantidad de personas que esperas, con el consumo de las últimas fiestas.' },
  { id: 'historial', label: 'Historial', help: 'Conteos de la barra (con sus descuadres) y todos los movimientos de stock.' },
];

const chipBase = 'shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-medium transition-colors';

/** Admin → Eventos → Stock de barra: insumos, recetas, lista de compras y conteos. */
export function InsumosManager() {
  const isDemo = useIsDemo();
  const { data: events } = trpc.events.listAll.useQuery();
  const [eventId, setEventId] = useState<number | null>(null);
  // Por defecto, la próxima fiesta (la más cercana que no pasó); si no hay, la última.
  const defaultId = useMemo(() => {
    const list = (events ?? []) as any[];
    const upcoming = list.filter((e) => new Date(e.eventDate).getTime() > Date.now() - 12 * 3_600_000 && e.slug !== 'pruebas-caja');
    return (upcoming.length ? upcoming[upcoming.length - 1] : list[0])?.id ?? null;
  }, [events]);
  const activeId = eventId ?? defaultId;
  const [tab, setTab] = useState<Tab>('stock');
  const [dialog, setDialog] = useState<InsumoFormValue | null>(null);

  const utils = trpc.useUtils();
  const schema = trpc.insumos.schema.useQuery(undefined, { enabled: !isDemo, retry: false, staleTime: 60_000 });
  const ready = schema.data?.ready ?? true;
  const estado = trpc.insumos.estado.useQuery({ eventId: activeId! }, { enabled: !!activeId && ready, refetchInterval: 30_000 });
  const refresh = () => { utils.insumos.estado.invalidate(); utils.insumos.movimientos.invalidate(); utils.insumos.proyeccion.invalidate(); };
  useEffect(() => { if (!ready) setDialog(null); }, [ready]);

  const save = trpc.insumos.save.useMutation({
    onSuccess: () => { refresh(); setDialog(null); toast.success('Insumo guardado'); },
    onError: (e) => toast.error(e.message),
  });

  const data = estado.data?.ready ? estado.data : null;
  const meta = TABS.find((t) => t.id === tab)!;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-heading text-2xl">Stock de barra</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          El contador maestro de la barra: cada trago que se vende en /caja descuenta sus insumos, y la barra cuenta lo que hay al abrir y al cerrar su turno.
        </p>
      </div>

      {!ready && <SchemaBanner missing={schema.data?.missing.length ?? 0} />}

      <div className="flex items-center gap-2">
        <Select value={activeId ? String(activeId) : ''} onValueChange={(v) => setEventId(Number(v))}>
          <SelectTrigger className="min-w-0 flex-1 sm:max-w-xs"><SelectValue placeholder="Evento" /></SelectTrigger>
          <SelectContent>
            {(events ?? []).map((e: any) => <SelectItem key={e.id} value={String(e.id)}>{e.title}</SelectItem>)}
          </SelectContent>
        </Select>
        <WriteButton disabled={!ready} onClick={() => setDialog({ name: '', unit: 'ml', containerSize: 750, containerLabel: 'botella', costPerContainer: null, alertDrinks: 15, initialContainers: 0, initialLoose: 0 })} className="shrink-0 interactive">
          <Plus className="mr-1 h-4 w-4" /> Insumo
        </WriteButton>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} className={`${chipBase} interactive ${tab === t.id ? 'bg-primary text-white' : 'bg-muted text-muted-foreground hover:bg-muted/70'}`}>
            {t.label}
          </button>
        ))}
      </div>
      <p className="-mt-2 text-xs text-muted-foreground">{meta.help}</p>

      {ready && activeId && !data && <p className="text-sm text-muted-foreground">Cargando…</p>}
      {ready && activeId && data && (
        <>
          {tab === 'stock' && <StockTab eventId={activeId} data={data} onEdit={(i) => setDialog({ ...i, initialContainers: 0, initialLoose: 0 })} onChanged={refresh} />}
          {tab === 'recetas' && <RecetasTab data={data} onChanged={refresh} />}
          {tab === 'compras' && <ComprasTab eventId={activeId} data={data} />}
          {tab === 'historial' && <HistorialTab eventId={activeId} data={data} />}
        </>
      )}

      <InsumoDialog
        value={dialog}
        saving={save.isPending}
        onClose={() => setDialog(null)}
        onSave={(v) => save.mutate({ ...v, costPerContainer: v.costPerContainer ?? null })}
      />
    </div>
  );
}

/** Aviso con el botón que crea las tablas de insumos (migración 0132). */
function SchemaBanner({ missing }: { missing: number }) {
  const utils = trpc.useUtils();
  const [open, setOpen] = useState(false);
  const apply = trpc.insumos.schemaApply.useMutation({
    onSuccess: (r) => { utils.insumos.schema.invalidate(); toast.success(r.applied.length ? 'Base de datos actualizada' : 'La base ya estaba al día'); },
    onError: (e) => toast.error(e.message || 'No se pudo actualizar la base'),
  });
  return (
    <>
      <div role="alert" className="flex flex-wrap items-center gap-3 rounded-2xl border border-amber-400/40 bg-amber-500/10 p-4">
        <DatabaseZap className="h-6 w-6 shrink-0 text-amber-300" />
        <div className="min-w-[14rem] flex-1">
          <p className="font-semibold">Falta activar el stock de barra</p>
          <p className="text-sm text-muted-foreground">
            Faltan {missing} {missing === 1 ? 'cambio' : 'cambios'} en la base (solo agrega tablas nuevas, no toca tus datos). Mientras tanto la caja vende como siempre, sin descontar insumos.
          </p>
        </div>
        <button type="button" onClick={() => setOpen(true)} disabled={apply.isPending}
          className="rounded-full bg-amber-400 px-5 py-2 text-sm font-bold text-black transition active:scale-95 disabled:opacity-60">
          {apply.isPending ? 'Activando…' : 'Activar ahora'}
        </button>
      </div>
      <AdminPasswordDialog
        open={open} title="Activar el stock de barra" actionLabel="Activar"
        description="Crea las tablas de insumos, recetas, movimientos y conteos de la barra. No borra ni cambia nada de lo que ya hay. Confirma con tu clave de admin."
        onConfirm={(adminPassword) => apply.mutateAsync({ adminPassword })} onClose={() => setOpen(false)}
      />
    </>
  );
}
