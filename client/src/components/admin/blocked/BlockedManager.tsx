import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { AlertTriangle, MoreHorizontal, Plus, Search, Upload, X, ListChecks } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { WriteButton } from '@/components/admin/WriteButton';
import { ConfirmDeleteButton } from '@/components/admin/ConfirmDeleteButton';
import { foldText } from '@shared/igCustomerLink';
import { hasHardKey, type BlockedRow } from '@shared/blockedMatch';
import { BlockedSheet, emptyBlockedForm, formFromBlocked, payloadFromBlockedForm, type BlockedForm } from './BlockedSheet';
import { BlockedImportDialog } from './BlockedImportDialog';
import { VetoPanel } from './VetoPanel';

const onErr = (e: unknown) => toast.error((e as { message?: string })?.message || 'No se pudo guardar');

type Filter = 'todos' | 'duro' | 'nombre' | 'inactivos';
const FILTERS: { id: Filter; label: string }[] = [
  { id: 'todos', label: 'Todos' }, { id: 'duro', label: 'Bloquean' }, { id: 'nombre', label: 'Solo nombre' }, { id: 'inactivos', label: 'Inactivos' },
];

const chips = (b: any) => [
  b.rut && { k: 'RUT', v: b.rut }, b.phone && { k: 'Tel', v: b.phone }, b.instagram && { k: 'IG', v: b.instagram }, b.email && { k: '@', v: b.email },
].filter(Boolean) as { k: string; v: string }[];

type SheetState = { mode: 'new' | 'edit'; id?: number; initial: BlockedForm } | null;

/** Admin → Clientes → Bloqueo de Clientes: lista de bloqueados con ficha de contacto editable e importación de planillas. */
export function BlockedManager() {
  const { data, refetch } = trpc.blockedCustomers.listAll.useQuery();
  const [sheet, setSheet] = useState<SheetState>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [matchesOpen, setMatchesOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('todos');

  const create = trpc.blockedCustomers.create.useMutation({ onError: onErr });
  const update = trpc.blockedCustomers.update.useMutation({ onError: onErr });
  const del = trpc.blockedCustomers.delete.useMutation({ onError: onErr });

  const list = (data ?? []) as any[];
  const visible = useMemo(() => {
    const q = foldText(query);
    return list.filter((b) => {
      const hard = hasHardKey(b as BlockedRow);
      if (filter === 'duro' && !(hard && b.isActive)) return false;
      if (filter === 'nombre' && hard) return false;
      if (filter === 'inactivos' && b.isActive) return false;
      if (!q) return true;
      return foldText([b.fullName, b.rut, b.phone, b.instagram, b.email, b.sourceVenue, b.sourceProducer, b.reason, b.notes].filter(Boolean).join(' ')).includes(q);
    });
  }, [list, query, filter]);
  const onlyName = list.filter((b) => b.isActive && !hasHardKey(b as BlockedRow)).length;

  const save = async (f: BlockedForm) => {
    try {
      if (sheet?.mode === 'edit') await update.mutateAsync({ id: sheet.id!, ...payloadFromBlockedForm(f) });
      else await create.mutateAsync(payloadFromBlockedForm(f));
      toast.success(sheet?.mode === 'edit' ? 'Ficha guardada' : 'Bloqueado agregado');
      setSheet(null);
      refetch();
    } catch { /* onErr ya avisó */ }
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-heading text-2xl">Bloqueo de Clientes</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Si alguien compra o llega con el <strong>RUT, teléfono, Instagram o correo</strong> de un bloqueado, no se le permite la entrada (compra web, accesos manuales y puerta). Con solo el nombre se avisa «posible bloqueado» y decides tú. Cada ficha se va completando a medida que haya más datos.
        </p>
      </div>

      <VetoPanel onChanged={refetch} />

      <div className="flex items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar por nombre, dato, local…" className="pl-9 pr-9" />
          {query && <button type="button" onClick={() => setQuery('')} aria-label="Borrar búsqueda" className="absolute right-2 top-1/2 -translate-y-1/2 p-1"><X className="h-4 w-4" /></button>}
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild><Button variant="outline" size="icon" className="shrink-0" aria-label="Más opciones"><MoreHorizontal className="h-5 w-5" /></Button></DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            <DropdownMenuItem onSelect={() => setImportOpen(true)}><Upload className="mr-2 h-4 w-4" /> Importar planilla (CSV)</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setMatchesOpen(true)}><ListChecks className="mr-2 h-4 w-4" /> Revisar compras y clientes que coinciden</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <WriteButton className="shrink-0" onClick={() => setSheet({ mode: 'new', initial: emptyBlockedForm() })}><Plus className="mr-1 h-4 w-4" /> Bloquear</WriteButton>
      </div>

      <div className="flex gap-2 overflow-x-auto [scrollbar-width:none]">
        {FILTERS.map((f) => (
          <button key={f.id} type="button" onClick={() => setFilter(f.id)} className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium ${filter === f.id ? 'bg-primary text-white' : 'bg-muted text-muted-foreground hover:bg-muted/70'}`}>{f.label}</button>
        ))}
        <span className="ml-auto shrink-0 self-center text-xs text-muted-foreground">{visible.length} de {list.length}</span>
      </div>
      {onlyName > 0 && filter === 'todos' && (
        <p className="rounded-xl bg-amber-500/10 px-3 py-2 text-xs text-amber-300">{onlyName} {onlyName === 1 ? 'ficha tiene' : 'fichas tienen'} solo el nombre: no bloquean, solo avisan. Completa su RUT, teléfono o Instagram para que impidan la entrada.</p>
      )}

      {list.length === 0 && <div className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">Todavía no hay bloqueados. Usa «Bloquear» o importa una planilla.</div>}
      <div className="space-y-2">
        {visible.map((b) => {
          const hard = hasHardKey(b as BlockedRow);
          return (
            <div key={b.id} className={`rounded-2xl border bg-card/60 p-3 ${b.isActive ? 'border-border' : 'border-border/50 opacity-60'}`}>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:gap-3">
                <button type="button" onClick={() => setSheet({ mode: 'edit', id: b.id, initial: formFromBlocked(b) })} className="min-w-0 flex-1 text-left">
                  <p className="flex items-center gap-2">
                    <span className="truncate font-semibold">{b.fullName || 'Sin nombre'}</span>
                    {!b.isActive ? <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] font-bold uppercase text-muted-foreground">Inactivo</span>
                      : hard ? <span className="shrink-0 rounded bg-red-500/15 px-1.5 py-0.5 text-[10px] font-bold uppercase text-red-400">Bloquea</span>
                      : <span className="shrink-0 rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-bold uppercase text-amber-400">Solo avisa</span>}
                  </p>
                  <p className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                    {chips(b).length === 0 ? <span>Sin RUT, teléfono, Instagram ni correo</span> : chips(b).map((c) => <span key={c.k}><span className="opacity-70">{c.k}</span> {c.v}</span>)}
                  </p>
                  {(b.sourceVenue || b.sourceProducer || b.reason) && (
                    <p className="mt-1 truncate text-xs text-muted-foreground">{[b.sourceVenue && `📍 ${b.sourceVenue}`, b.sourceProducer, b.reason].filter(Boolean).join(' · ')}</p>
                  )}
                </button>
                <div className="flex shrink-0 justify-end gap-1.5">
                  <WriteButton variant="outline" size="sm" onClick={() => update.mutateAsync({ id: b.id, isActive: b.isActive ? 0 : 1 }).then(() => refetch())}>{b.isActive ? 'Desactivar' : 'Reactivar'}</WriteButton>
                  <ConfirmDeleteButton description={`Vas a eliminar a "${b.fullName || b.rut || 'este bloqueado'}" de la lista.`} onConfirm={(adminPassword) => del.mutateAsync({ id: b.id, adminPassword }).then(() => refetch())} />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <BlockedSheet open={!!sheet} onOpenChange={(o) => { if (!o) setSheet(null); }} mode={sheet?.mode ?? 'new'} initial={sheet?.initial ?? emptyBlockedForm()} saving={create.isPending || update.isPending} onSave={save} />
      <BlockedImportDialog open={importOpen} onOpenChange={setImportOpen} existing={list as BlockedRow[]} onDone={() => { refetch(); setMatchesOpen(true); }} />
      <MatchesDialog open={matchesOpen} onOpenChange={setMatchesOpen} />
    </div>
  );
}

/** Compras y clientes que ya existían y coinciden con la lista. Solo se muestran: no se cancela nada solo. */
function MatchesDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { data, isLoading } = trpc.blockedCustomers.existingMatches.useQuery(undefined, { enabled: open });
  const orders = data?.orders ?? [];
  const customers = data?.customers ?? [];
  const tag = (level: string) => level === 'block'
    ? <span className="shrink-0 rounded bg-red-500/15 px-1.5 py-0.5 text-[10px] font-bold uppercase text-red-400">Dato coincide</span>
    : <span className="shrink-0 rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-bold uppercase text-amber-400">Solo nombre</span>;
  const who = (m: { name: string | null; by: string; venue: string | null }[]) => m.map((x) => `${x.name || 'sin nombre'} (${x.by}${x.venue ? ` · ${x.venue}` : ''})`).join('; ');
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Compras y clientes que coinciden con la lista</DialogTitle>
          <DialogDescription>Compras aprobadas de eventos que aún no pasan y clientes de la base. Revísalas y decide: no se cancela nada solo. La puerta ya avisa de estas entradas al escanearlas.</DialogDescription>
        </DialogHeader>
        {isLoading && <p className="py-6 text-center text-sm text-muted-foreground">Buscando…</p>}
        {!isLoading && orders.length === 0 && customers.length === 0 && <p className="py-6 text-center text-sm text-emerald-400">Nadie de la lista tiene compras ni ficha de cliente ✓</p>}
        {orders.length > 0 && (
          <section className="space-y-1.5">
            <h3 className="flex items-center gap-2 text-sm font-semibold"><AlertTriangle className="h-4 w-4 text-amber-400" /> Compras ({orders.length})</h3>
            {orders.map((o) => (
              <div key={o.orderId} className="rounded-xl bg-white/5 p-2 text-sm">
                <p className="flex items-center gap-2"><span className="min-w-0 flex-1 truncate font-medium">{o.buyerName} <span className="text-xs text-muted-foreground">· {o.orderNumber} · {o.eventTitle}</span></span>{tag(o.level)}</p>
                <p className="text-xs text-muted-foreground">Coincide con {who(o.matches)}</p>
              </div>
            ))}
          </section>
        )}
        {customers.length > 0 && (
          <section className="space-y-1.5">
            <h3 className="text-sm font-semibold">Clientes en la base ({customers.length})</h3>
            {customers.map((c) => (
              <div key={c.customerId} className="rounded-xl bg-white/5 p-2 text-sm">
                <p className="flex items-center gap-2"><span className="min-w-0 flex-1 truncate font-medium">{c.fullName || c.email}</span>{tag(c.level)}</p>
                <p className="text-xs text-muted-foreground">Coincide con {who(c.matches)}</p>
              </div>
            ))}
          </section>
        )}
      </DialogContent>
    </Dialog>
  );
}
