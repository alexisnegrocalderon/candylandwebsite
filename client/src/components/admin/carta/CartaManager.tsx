import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'sonner';
import { Ban, ChevronDown, Download, FolderInput, MoreHorizontal, Plus, Percent, RotateCcw, Search, Upload, X, CheckSquare, ChevronsDownUp, ChevronsUpDown, CopyPlus } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { useTonightEvent } from '@/hooks/useTonightEvent';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { WriteButton } from '@/components/admin/WriteButton';
import { ConfirmDeleteButton } from '@/components/admin/ConfirmDeleteButton';
import {
  cartaToCsv, filterCarta, groupBySection, moveInSection, sectionNames, sortCarta, summarizeCarta,
  type CartaFilter, type CartaImportPlan, type CartaProduct, type CartaSort,
} from '@shared/carta';
import { CARTA_CATEGORIES, emptyForm, formFromProduct, payloadFromForm, type CartaCategory, type ProductForm } from './constants';
import { CartaRow } from './CartaRow';
import { ImportDialog, MoveSectionDialog, PriceAdjustDialog } from './BulkDialogs';
import { ProductSheet } from './ProductSheet';
import { onCartaError } from './errors';

const FILTERS: { id: CartaFilter; label: string }[] = [
  { id: 'todos', label: 'Todos' },
  { id: 'agotados', label: 'Agotados' },
  { id: 'poco_stock', label: 'Poco stock' },
  { id: 'sin_costo', label: 'Sin costo' },
  { id: 'margen_bajo', label: 'Margen bajo' },
  { id: 'cocina', label: 'Cocina' },
];

const SORTS: { id: CartaSort; label: string }[] = [
  { id: 'orden', label: 'Orden' },
  { id: 'nombre', label: 'Nombre A-Z' },
  { id: 'precio_desc', label: 'Precio ↓' },
  { id: 'precio_asc', label: 'Precio ↑' },
  { id: 'stock', label: 'Poco stock 1º' },
  { id: 'margen', label: 'Margen bajo 1º' },
];

const COLLAPSED_KEY = 'carta.collapsed';
const loadCollapsed = (): Set<string> => {
  try { return new Set(JSON.parse(localStorage.getItem(COLLAPSED_KEY) ?? '[]')); } catch { return new Set(); }
};

type SheetState = { mode: 'new' | 'edit'; id?: number; initial: ProductForm } | null;

export function CartaManager() {
  // Arranca en el evento real de esta noche (nunca en la cuenta de prueba) y recuerda el que elijas.
  const { events, eventId: activeId, setSelected: setEventId } = useTonightEvent();

  const utils = trpc.useUtils();
  const { data: allTypes, isLoading } = trpc.events.listTicketTypes.useQuery({ eventId: activeId! }, { enabled: !!activeId });
  const refresh = () => utils.events.listTicketTypes.invalidate();

  const [tab, setTab] = useState<CartaCategory>('consumo');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<CartaFilter>('todos');
  const [sort, setSort] = useState<CartaSort>('orden');
  const [collapsed, setCollapsed] = useState<Set<string>>(loadCollapsed);
  const [sheet, setSheet] = useState<SheetState>(null);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const [priceOpen, setPriceOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [priceScope, setPriceScope] = useState<'seleccion' | 'visibles'>('visibles');

  useEffect(() => {
    try { localStorage.setItem(COLLAPSED_KEY, JSON.stringify(Array.from(collapsed))); } catch { /* sin storage: no se recuerda */ }
  }, [collapsed]);

  // Al cambiar de evento o de pestaña, la selección y los filtros no valen.
  useEffect(() => { setSelected(new Set()); setSelectionMode(false); }, [activeId, tab]);
  useEffect(() => { setQuery(''); setFilter('todos'); }, [activeId, tab]);

  const createType = trpc.events.createTicketType.useMutation({ onError: onCartaError });
  const updateType = trpc.events.updateTicketType.useMutation({ onError: onCartaError });
  const deleteType = trpc.events.deleteTicketType.useMutation({ onError: onCartaError });
  // Todo evento nuevo ya nace con la carta del anterior copiada sola -- esto
  // es para repetirlo a mano (ej. un evento que quedó sin carta).
  const copyCarta = trpc.events.copyCartaFromPrevious.useMutation({
    onSuccess: (r) => { refresh(); toast.success(`Copiados ${r.copied} productos de "${r.from}"`); },
    onError: onCartaError,
  });

  // Las porciones de un producto con receta salen del stock de insumos (las mismas que ve Stock de barra), no de
  // un número cargado a mano: así Carta y Stock siempre coinciden.
  const { data: barra } = trpc.insumos.estado.useQuery({ eventId: activeId! }, { enabled: !!activeId, retry: false, refetchInterval: 30_000 });
  const cartaProducts = useMemo(() => {
    const porId = new Map<number, any>(((barra as any)?.productos ?? []).map((b: any) => [b.id, b]));
    return ((allTypes ?? []) as CartaProduct[])
      .filter((t) => CARTA_CATEGORIES.some((c) => c.id === t.category))
      .map((t) => {
        const b = porId.get(t.id);
        if (!b) return t;
        return { ...t, portions: b.drinks ?? null, sinReceta: b.drinks == null && !b.sinInsumos && !b.oculto && t.category === 'consumo' };
      });
  }, [allTypes, barra]);
  const tabProducts = useMemo(() => cartaProducts.filter((p) => p.category === tab), [cartaProducts, tab]);
  const counts = useMemo(() => Object.fromEntries(CARTA_CATEGORIES.map((c) => [c.id, cartaProducts.filter((p) => p.category === c.id).length])), [cartaProducts]);
  const summary = useMemo(() => summarizeCarta(tabProducts), [tabProducts]);
  const sections = useMemo(() => sectionNames(tabProducts), [tabProducts]);
  const meta = CARTA_CATEGORIES.find((c) => c.id === tab)!;

  const visible = useMemo(() => sortCarta(filterCarta(tabProducts, { query, filter }), sort), [tabProducts, query, filter, sort]);
  const groups = useMemo(() => groupBySection(visible), [visible]);
  // Para subir/bajar se usa la sección completa (no solo lo que el filtro deja ver).
  const fullSections = useMemo(() => new Map(groupBySection(tabProducts).map((g) => [g.name, sortCarta(g.items, 'orden')])), [tabProducts]);
  const searching = query.trim() !== '' || filter !== 'todos';
  const canReorder = sort === 'orden';

  const byId = useMemo(() => new Map(cartaProducts.map((p) => [p.id, p])), [cartaProducts]);
  const selectedProducts = useMemo(() => Array.from(selected).map((id) => byId.get(id)).filter((p): p is CartaProduct => !!p), [selected, byId]);

  /** Corre varias escrituras juntas y refresca una sola vez. */
  const runBulk = async (jobs: (() => Promise<unknown>)[], okMessage: string) => {
    setBusy(true);
    try {
      await Promise.all(jobs.map((j) => j()));
      toast.success(okMessage);
      return true;
    } catch {
      return false; // onCartaError ya avisó
    } finally {
      await refresh();
      setBusy(false);
    }
  };

  const toggleSection = (key: string) => setCollapsed((prev) => { const next = new Set(prev); next.has(key) ? next.delete(key) : next.add(key); return next; });
  const sectionKey = (name: string) => `${tab}:${name}`;
  const isCollapsed = (name: string) => !searching && collapsed.has(sectionKey(name));

  const openNew = () => setSheet({ mode: 'new', initial: emptyForm(tab) });
  const openEdit = (p: CartaProduct) => setSheet({ mode: 'edit', id: p.id, initial: formFromProduct(p) });
  const openDuplicate = (p: CartaProduct) => {
    const f = formFromProduct(p);
    setSheet({ mode: 'new', initial: { ...f, name: `${f.name} (copia)`, sortOrder: f.sortOrder + 1, internalCode: '' } });
  };

  const saveSheet = async (form: ProductForm) => {
    if (!sheet || !activeId) return;
    try {
      if (sheet.mode === 'new') {
        await createType.mutateAsync({ eventId: activeId, ...payloadFromForm(form, true) });
        toast.success('Producto creado');
        if (form.category !== tab) setTab(form.category);
      } else {
        await updateType.mutateAsync({ id: sheet.id!, ...payloadFromForm(form, false) });
        toast.success('Producto actualizado');
      }
      setSheet(null);
      refresh();
    } catch { /* onCartaError ya avisó; el panel queda abierto para reintentar */ }
  };

  const patch = (id: number, data: { price?: number; totalStock?: number }) => {
    updateType.mutate({ id, ...data }, { onSuccess: () => { refresh(); if (data.price != null) toast.success('Precio actualizado'); } });
  };
  const toggleSoldOut = (p: CartaProduct) => {
    updateType.mutate({ id: p.id, status: p.status === 'soldout' ? 'active' : 'soldout' }, { onSuccess: refresh });
  };
  const move = (name: string, id: number, dir: 'up' | 'down') => {
    const changes = moveInSection(fullSections.get(name) ?? [], id, dir);
    if (changes.length) runBulk(changes.map((c) => () => updateType.mutateAsync({ id: c.id, sortOrder: c.sortOrder })), 'Orden actualizado');
  };
  const deleteOne = async (id: number, adminPassword: string) => { await deleteType.mutateAsync({ id, adminPassword }); refresh(); };

  const bulkStatus = (status: 'active' | 'soldout') =>
    runBulk(selectedProducts.map((p) => () => updateType.mutateAsync({ id: p.id, status })), status === 'soldout' ? 'Marcados como agotados' : 'Productos repuestos');
  const bulkDelete = async (adminPassword: string) => {
    setBusy(true);
    try {
      for (const p of selectedProducts) await deleteType.mutateAsync({ id: p.id, adminPassword });
      toast.success(`${selectedProducts.length} productos eliminados`);
      setSelected(new Set()); setSelectionMode(false);
    } finally { await refresh(); setBusy(false); }
  };

  const priceTargets = priceScope === 'seleccion' ? selectedProducts : visible;

  const exportCsv = () => {
    const blob = new Blob(['﻿' + cartaToCsv(cartaProducts)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const title = (events?.find((e: any) => e.id === activeId) as any)?.title ?? 'carta';
    a.href = url; a.download = `carta-${String(title).toLowerCase().replace(/[^a-z0-9]+/g, '-')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const applyImport = async (plan: CartaImportPlan) => {
    if (!activeId) return;
    const ok = await runBulk([
      ...plan.updates.map((u) => () => updateType.mutateAsync({ id: u.id, ...(u.data as any) })),
      ...plan.creates.map((c) => () => createType.mutateAsync({ eventId: activeId, ...(c as any) })),
    ], `Importado: ${plan.updates.length} actualizados, ${plan.creates.length} nuevos`);
    if (ok) setImportOpen(false);
  };

  const selectAllVisible = (checked: boolean, ids: number[]) =>
    setSelected((prev) => { const next = new Set(prev); ids.forEach((id) => (checked ? next.add(id) : next.delete(id))); return next; });

  const allCollapsed = groups.length > 0 && groups.every((g) => collapsed.has(sectionKey(g.name)));
  const setAllCollapsed = (value: boolean) => setCollapsed((prev) => {
    const next = new Set(prev);
    groups.forEach((g) => (value ? next.add(sectionKey(g.name)) : next.delete(sectionKey(g.name))));
    return next;
  });

  const chipBase = 'shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-medium transition-colors';

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-heading text-2xl">Carta de la fiesta</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Lo que se vende en la barra. Aparece como botón en /caja y <strong>no</strong> se muestra en el sitio web.
        </p>
      </div>

      <div className="flex items-center gap-2">
        <Select value={activeId ? String(activeId) : ''} onValueChange={(v) => setEventId(Number(v))}>
          <SelectTrigger className="min-w-0 flex-1 sm:max-w-xs"><SelectValue placeholder="Evento" /></SelectTrigger>
          <SelectContent>
            {(events ?? []).map((e: any) => <SelectItem key={e.id} value={String(e.id)}>{e.title}</SelectItem>)}
          </SelectContent>
        </Select>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="icon" className="shrink-0" aria-label="Más opciones de la carta"><MoreHorizontal className="h-5 w-5" /></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            <DropdownMenuItem onSelect={() => { setSelectionMode(true); }}><CheckSquare className="mr-2 h-4 w-4" /> Seleccionar varios</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => { setPriceScope('visibles'); setPriceOpen(true); }} disabled={visible.length === 0}><Percent className="mr-2 h-4 w-4" /> Ajustar precios de lo que se ve</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setAllCollapsed(!allCollapsed)} disabled={groups.length === 0}>
              {allCollapsed ? <><ChevronsUpDown className="mr-2 h-4 w-4" /> Desplegar todas las secciones</> : <><ChevronsDownUp className="mr-2 h-4 w-4" /> Plegar todas las secciones</>}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={exportCsv} disabled={cartaProducts.length === 0}><Download className="mr-2 h-4 w-4" /> Exportar carta (CSV)</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setImportOpen(true)} disabled={!activeId}><Upload className="mr-2 h-4 w-4" /> Importar desde CSV</DropdownMenuItem>
            <DropdownMenuItem
              disabled={!activeId || copyCarta.isPending}
              onSelect={() => {
                if (activeId && window.confirm('¿Copiar la carta del evento anterior acá? Si ya hay productos cargados, se suman (no se reemplazan).')) copyCarta.mutate({ eventId: activeId });
              }}
            ><CopyPlus className="mr-2 h-4 w-4" /> Copiar carta del evento anterior</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <WriteButton onClick={openNew} className="shrink-0 interactive"><Plus className="mr-1 h-4 w-4" /> Nuevo</WriteButton>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
        {CARTA_CATEGORIES.map((c) => (
          <button key={c.id} onClick={() => setTab(c.id)} className={`${chipBase} interactive ${tab === c.id ? 'bg-primary text-white' : 'bg-muted text-muted-foreground hover:bg-muted/70'}`}>
            {c.emoji} {c.label} <span className="ml-1 opacity-70">{counts[c.id] ?? 0}</span>
          </button>
        ))}
      </div>
      <p className="-mt-2 text-xs text-muted-foreground">{meta.help}</p>

      {tabProducts.length > 0 && (
        <div className="grid grid-cols-5 gap-1.5 sm:gap-2">
          {([
            { label: 'Total', value: summary.total, filter: 'todos' as CartaFilter, warn: false },
            { label: 'Agotados', value: summary.agotados, filter: 'agotados' as CartaFilter, warn: summary.agotados > 0 },
            { label: 'Poco', value: summary.pocoStock, filter: 'poco_stock' as CartaFilter, warn: summary.pocoStock > 0 },
            { label: 'Sin costo', value: summary.sinCosto, filter: 'sin_costo' as CartaFilter, warn: summary.sinCosto > 0 },
          ]).map((s) => (
            <button key={s.label} onClick={() => setFilter(s.filter)} className={`rounded-xl border px-2 py-1.5 text-left sm:px-3 sm:py-2 ${filter === s.filter && s.filter !== 'todos' ? 'border-primary' : 'border-border'} bg-card/60`}>
              <span className={`block text-base font-semibold tabular-nums sm:text-lg ${s.warn ? 'text-amber-500' : ''}`}>{s.value}</span>
              <span className="block truncate text-[11px] text-muted-foreground sm:text-xs">{s.label}</span>
            </button>
          ))}
          <button onClick={() => setFilter('margen_bajo')} className="rounded-xl border border-border bg-card/60 px-2 py-1.5 text-left sm:px-3 sm:py-2">
            <span className="block text-base font-semibold tabular-nums sm:text-lg">{summary.margenPromedioPct != null ? `${summary.margenPromedioPct}%` : '—'}</span>
            <span className="block text-xs text-muted-foreground">Margen</span>
          </button>
        </div>
      )}

      <div className="sticky top-20 z-20 -mx-1 space-y-2 bg-background/90 px-1 py-2 backdrop-blur">
        <div className="flex items-center gap-2">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar…" className="pl-9 pr-9" />
            {query && <button type="button" onClick={() => setQuery('')} aria-label="Borrar búsqueda" className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground"><X className="h-4 w-4" /></button>}
          </div>
          <Select value={sort} onValueChange={(v) => setSort(v as CartaSort)}>
            <SelectTrigger className="w-[7.5rem] shrink-0 sm:w-48" aria-label="Ordenar"><SelectValue /></SelectTrigger>
            <SelectContent>{SORTS.map((s) => <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="flex gap-2 overflow-x-auto [scrollbar-width:none]">
          {FILTERS.map((f) => (
            <button key={f.id} onClick={() => setFilter(f.id)} className={`${chipBase} text-xs ${filter === f.id ? 'bg-primary text-white' : 'bg-muted text-muted-foreground hover:bg-muted/70'}`}>{f.label}</button>
          ))}
        </div>
        {selectionMode && (
          <div className="flex items-center justify-between rounded-xl bg-primary/10 px-3 py-2 text-sm">
            <label className="flex items-center gap-2">
              <Checkbox checked={visible.length > 0 && visible.every((p) => selected.has(p.id))} onCheckedChange={(v) => selectAllVisible(!!v, visible.map((p) => p.id))} />
              Seleccionar los {visible.length} que se ven
            </label>
            <button className="text-xs underline" onClick={() => { setSelectionMode(false); setSelected(new Set()); }}>Salir</button>
          </div>
        )}
      </div>

      {isLoading && <p className="py-8 text-center text-sm text-muted-foreground">Cargando la carta…</p>}

      {!isLoading && tabProducts.length === 0 && (
        <div className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          Todavía no hay nada cargado en «{meta.label}». Toca «Nuevo» para empezar la carta.
        </div>
      )}
      {!isLoading && tabProducts.length > 0 && visible.length === 0 && (
        <div className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          Ningún producto coincide.{' '}
          <button className="underline" onClick={() => { setQuery(''); setFilter('todos'); }}>Quitar filtros</button>
        </div>
      )}

      <div className={`space-y-5 ${selectionMode && selected.size > 0 ? 'pb-28' : ''}`}>
        {groups.map((g) => {
          const open = !isCollapsed(g.name);
          const full = fullSections.get(g.name) ?? [];
          const ids = g.items.map((p) => p.id);
          return (
            <section key={g.name} className="space-y-2">
              <div className="flex items-center gap-2">
                {selectionMode && <Checkbox checked={ids.every((id) => selected.has(id))} onCheckedChange={(v) => selectAllVisible(!!v, ids)} aria-label={`Seleccionar la sección ${g.name}`} />}
                <button type="button" onClick={() => toggleSection(sectionKey(g.name))} aria-expanded={open} className="flex min-w-0 flex-1 items-center gap-2 text-left">
                  <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${open ? '' : '-rotate-90'}`} />
                  <h3 className="truncate font-heading text-lg">{g.name}</h3>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{g.items.length}</span>
                </button>
              </div>
              {open && (
                <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
                  {g.items.map((p) => {
                    const idx = full.findIndex((x) => x.id === p.id);
                    return (
                      <CartaRow
                        key={p.id}
                        p={p}
                        selectionMode={selectionMode}
                        selected={selected.has(p.id)}
                        onSelect={(checked) => selectAllVisible(checked, [p.id])}
                        onEdit={() => openEdit(p)}
                        onDuplicate={() => openDuplicate(p)}
                        onToggleSoldOut={() => toggleSoldOut(p)}
                        onMove={(dir) => move(g.name, p.id, dir)}
                        canUp={canReorder && idx > 0}
                        canDown={canReorder && idx >= 0 && idx < full.length - 1}
                        onPatch={(data) => patch(p.id, data)}
                        onDelete={(pw) => deleteOne(p.id, pw)}
                      />
                    );
                  })}
                </div>
              )}
            </section>
          );
        })}
      </div>

      {selectionMode && selected.size > 0 && createPortal(
        <div className="fixed inset-x-3 bottom-[5.75rem] z-40 mx-auto flex max-w-xl items-center gap-1.5 overflow-x-auto rounded-2xl border border-white/10 bg-zinc-900/95 p-2 text-white shadow-2xl backdrop-blur md:bottom-6">
          <span className="shrink-0 px-2 text-sm font-semibold">{selected.size}</span>
          <Button size="sm" variant="secondary" className="shrink-0" disabled={busy} onClick={() => bulkStatus('soldout')}><Ban className="mr-1 h-3.5 w-3.5" /> Agotar</Button>
          <Button size="sm" variant="secondary" className="shrink-0" disabled={busy} onClick={() => bulkStatus('active')}><RotateCcw className="mr-1 h-3.5 w-3.5" /> Reponer</Button>
          <Button size="sm" variant="secondary" className="shrink-0" disabled={busy} onClick={() => setMoveOpen(true)}><FolderInput className="mr-1 h-3.5 w-3.5" /> Mover</Button>
          <Button size="sm" variant="secondary" className="shrink-0" disabled={busy} onClick={() => { setPriceScope('seleccion'); setPriceOpen(true); }}><Percent className="mr-1 h-3.5 w-3.5" /> Precios</Button>
          <Button size="sm" variant="destructive" className="shrink-0" disabled={busy} onClick={() => setBulkDeleteOpen(true)}>Borrar</Button>
          <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0 text-white hover:bg-white/10" aria-label="Cancelar selección" onClick={() => { setSelected(new Set()); setSelectionMode(false); }}><X className="h-4 w-4" /></Button>
        </div>,
        document.body,
      )}

      <ConfirmDeleteButton
        open={bulkDeleteOpen}
        onOpenChange={setBulkDeleteOpen}
        description={`Vas a eliminar ${selected.size} ${selected.size === 1 ? 'producto' : 'productos'} de la carta.`}
        onConfirm={bulkDelete}
        className="hidden"
      />

      <ProductSheet
        open={!!sheet}
        onOpenChange={(v) => { if (!v) setSheet(null); }}
        mode={sheet?.mode ?? 'new'}
        initial={sheet?.initial ?? emptyForm(tab)}
        sections={sections}
        saving={createType.isPending || updateType.isPending}
        onSave={saveSheet}
        eventId={activeId}
        productId={sheet?.id}
      />

      <PriceAdjustDialog
        open={priceOpen}
        onOpenChange={setPriceOpen}
        products={priceTargets}
        applying={busy}
        onApply={async (updates) => {
          if (await runBulk(updates.map((u) => () => updateType.mutateAsync({ id: u.id, price: u.price })), `Precios actualizados (${updates.length})`)) setPriceOpen(false);
        }}
      />
      <MoveSectionDialog
        key={`${moveOpen}`}
        open={moveOpen}
        onOpenChange={setMoveOpen}
        count={selected.size}
        sections={sections}
        applying={busy}
        onApply={async (groupName) => {
          if (await runBulk(selectedProducts.map((p) => () => updateType.mutateAsync({ id: p.id, groupName: groupName ?? '' })), 'Productos movidos')) { setMoveOpen(false); setSelected(new Set()); setSelectionMode(false); }
        }}
      />
      <ImportDialog open={importOpen} onOpenChange={setImportOpen} existing={cartaProducts} defaultCategory={tab} applying={busy} onApply={applyImport} />
    </div>
  );
}
