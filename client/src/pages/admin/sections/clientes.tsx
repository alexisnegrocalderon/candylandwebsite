/* Secciones del hub «clientes» del panel (se cargan solas al abrirlas, ver ADMIN_SECTIONS en ../Dashboard.tsx). */
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { WriteButton, DownloadLink } from '@/components/admin/WriteButton';
import { useDebounced } from '@/hooks/useDebounced';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Home, X, Upload, Download, Gift, MessageCircle, Instagram, UserPlus, BellOff } from 'lucide-react';
import { whatsappLinkFor, instagramLinkFor } from '@shared/ambassadorApplication';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ConfirmDeleteButton } from '@/components/admin/ConfirmDeleteButton';
import { CustomerDrawer } from '@/components/admin/CustomerDrawer';
import { CUSTOMER_LEVEL_META, GENDER_OPTIONS, SOURCE_OPTIONS, daysBetween, recencyTone, type CustomerLevel } from '@shared/customerInsights';
import { customerFilterQuery } from '@shared/customerFilterParams';
import { TableSkeleton } from '@/components/admin/TableSkeleton';
import { formatChileShortDate } from '@shared/chileDate';
import { ACCESO_SLUG_OPTIONS, APPLICATION_STATUS_LABEL, AmbassadorApplicationsTab, onMutationError } from './shared';

export const CUSTOMERS_PAGE_SIZE = 25;

/** Acompañantes de las compras web (nombre + RUT, sin correo): se agregan
 * solos al aprobarse una orden y nunca reciben correos masivos. */
export function AttendeeContactsPanel({ search }: { search: string }) {
  const { data } = trpc.customers.attendees.useQuery({ search: search || undefined });
  const utils = trpc.useUtils();
  const backfill = trpc.customers.backfillAttendees.useMutation({
    onSuccess: (r) => { toast.success(`Listo: ${r.contacts} acompañantes en la base (${r.orders} órdenes revisadas).`); utils.customers.attendees.invalidate(); },
    onError: onMutationError,
  });
  const [open, setOpen] = useState(false);
  const rows = data ?? [];
  const shown = open ? rows : rows.slice(0, 8);
  return (
    <Card>
      <CardContent className="space-y-3 pt-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="font-heading text-lg">Acompañantes</h3>
            <p className="text-sm text-muted-foreground">{rows.length} persona{rows.length !== 1 ? 's' : ''} que vinieron en la compra de otro, con su RUT. No reciben correos.</p>
          </div>
          <Button size="sm" variant="outline" disabled={backfill.isPending} onClick={() => backfill.mutate()}>
            {backfill.isPending ? 'Revisando…' : 'Cargar compras anteriores'}
          </Button>
        </div>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">{search ? 'Ningún acompañante coincide.' : 'Aún no hay acompañantes registrados.'}</p>
        ) : (
          <div className="divide-y divide-white/10">
            {shown.map((c: any) => (
              <div key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <div className="min-w-0">
                  <p className="truncate font-medium">{c.fullName}</p>
                  <p className="truncate text-xs text-muted-foreground">{c.rut || 'Sin RUT'} · compra de {c.buyerName || c.buyerEmail || '—'}</p>
                </div>
                <span className="shrink-0 rounded-full bg-white/10 px-2 py-0.5 text-xs">{Array.isArray(c.eventIds) ? c.eventIds.length : 0} evento{Array.isArray(c.eventIds) && c.eventIds.length === 1 ? '' : 's'}</span>
              </div>
            ))}
          </div>
        )}
        {rows.length > 8 && (
          <Button size="sm" variant="ghost" onClick={() => setOpen((v) => !v)}>{open ? 'Ver menos' : `Ver los ${rows.length}`}</Button>
        )}
      </CardContent>
    </Card>
  );
}

export function CustomersView() {
  const [search, setSearch] = useState('');
  const [accessType, setAccessType] = useState<string>('all');
  const [tagFilter, setTagFilter] = useState('');
  const [eventFilter, setEventFilter] = useState<string>('all');
  // Filtros de la ficha de cliente ('all' = sin filtro).
  const [levelFilter, setLevelFilter] = useState<string>('all');
  const [genderFilter, setGenderFilter] = useState<string>('all');
  const [sourceFilter, setSourceFilter] = useState<string>('all');
  const [birthdayFilter, setBirthdayFilter] = useState<string>('all');
  const [contactFilter, setContactFilter] = useState<string>('all');
  const [appFilter, setAppFilter] = useState<string>('all');
  const [cityFilter, setCityFilter] = useState('');
  const [openCustomerId, setOpenCustomerId] = useState<number | null>(null);
  const [importing, setImporting] = useState(false);
  const [page, setPage] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: eventsData } = trpc.events.listAll.useQuery();
  const events = eventsData ?? [];

  // Buscar mientras se escribe, pero sin pedirle al servidor una vez por tecla.
  const debouncedSearch = useDebounced(search.trim());
  const debouncedCity = useDebounced(cityFilter.trim());
  const { data: customersData, refetch, isLoading: customersLoading, isFetching: customersFetching } = trpc.customers.page.useQuery({
    page,
    pageSize: CUSTOMERS_PAGE_SIZE,
    search: debouncedSearch || undefined,
    accessType: accessType === 'all' ? undefined : accessType,
    tag: tagFilter || undefined,
    eventId: eventFilter === 'all' ? undefined : Number(eventFilter),
    level: levelFilter === 'all' ? undefined : (levelFilter as 'nuevo' | 'recurrente' | 'vip' | 'inactivo' | 'sin_compras'),
    gender: genderFilter === 'all' ? undefined : genderFilter,
    source: sourceFilter === 'all' ? undefined : sourceFilter,
    city: debouncedCity || undefined,
    birthdayMonth: birthdayFilter === 'all' ? undefined : Number(birthdayFilter),
    optedOut: contactFilter === 'all' ? undefined : (contactFilter as 'email' | 'any'),
    hasApp: appFilter === 'app' ? true : undefined,
  }, { placeholderData: (prev) => prev });

  // El servidor manda solo la página que se ve (la lista entera sigue en `listAll` para las audiencias de mailing).
  const pageItems: any[] = customersData?.rows ?? [];
  const totalCustomers = customersData?.total ?? 0;
  const totalPages = customersData?.pages ?? 1;
  const currentPage = customersData?.page ?? 0;
  const openIdx = openCustomerId != null ? pageItems.findIndex((c: any) => c.id === openCustomerId) : -1;

  useEffect(() => { setPage(0); }, [debouncedSearch, accessType, tagFilter, eventFilter, levelFilter, genderFilter, sourceFilter, birthdayFilter, contactFilter, appFilter, debouncedCity]);

  // El CSV y la impresión llevan los mismos filtros que la tabla: se exporta lo que se está viendo.
  const filterParams = () => customerFilterQuery({
    search: search.trim() || undefined,
    accessType: accessType === 'all' ? undefined : accessType,
    tag: tagFilter || undefined,
    eventId: eventFilter === 'all' ? undefined : Number(eventFilter),
    level: levelFilter === 'all' ? undefined : (levelFilter as CustomerLevel),
    gender: genderFilter === 'all' ? undefined : genderFilter,
    source: sourceFilter === 'all' ? undefined : sourceFilter,
    city: cityFilter.trim() || undefined,
    birthdayMonth: birthdayFilter === 'all' ? undefined : Number(birthdayFilter),
    optedOut: contactFilter === 'all' ? undefined : (contactFilter as 'email' | 'any'),
    hasApp: appFilter === 'app' ? true : undefined,
  });
  const exportUrl = () => `/api/admin/customers/export.csv?${filterParams().toString()}`;
  const printUrl = () => `/admin/print/customers?${filterParams().toString()}`;

  const handleImportFile = async (file: File) => {
    setImporting(true);
    try {
      const csv = await file.text();
      const res = await fetch('/api/admin/customers/import.csv', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ csv }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Error al importar el CSV');
      toast.success(`Importación lista: ${data.imported} cliente${data.imported !== 1 ? 's' : ''} nuevo${data.imported !== 1 ? 's' : ''}, ${data.updated} actualizado${data.updated !== 1 ? 's' : ''}`);
      refetch();
    } catch (err) {
      onMutationError(err);
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="font-heading text-2xl">Clientes</h2>
        <p className="text-sm text-muted-foreground">{customersLoading ? 'Cargando…' : `${totalCustomers.toLocaleString('es-CL')} cliente${totalCustomers !== 1 ? 's' : ''}`}{customersFetching && !customersLoading ? ' · actualizando…' : ''}</p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por nombre, RUT, email o teléfono…" className="max-w-xs" />
        <Select value={accessType} onValueChange={setAccessType}>
          <SelectTrigger className="w-56"><SelectValue placeholder="Tipo de acceso" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los tipos de acceso</SelectItem>
            {ACCESO_SLUG_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input value={tagFilter} onChange={(e) => setTagFilter(e.target.value)} placeholder="Filtrar por etiqueta…" className="max-w-xs" />
        <Select value={eventFilter} onValueChange={setEventFilter}>
          <SelectTrigger className="w-56"><SelectValue placeholder="Evento" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los eventos</SelectItem>
            {events.map((e: any) => <SelectItem key={e.id} value={String(e.id)}>{e.title}</SelectItem>)}
          </SelectContent>
        </Select>

        <div className="basis-full flex flex-wrap items-center gap-3">
          <Select value={levelFilter} onValueChange={setLevelFilter}>
            <SelectTrigger className="w-44"><SelectValue placeholder="Nivel" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los niveles</SelectItem>
              {(['vip', 'recurrente', 'nuevo', 'inactivo', 'sin_compras'] as const).map((l) => (
                <SelectItem key={l} value={l}>{CUSTOMER_LEVEL_META[l].label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={genderFilter} onValueChange={setGenderFilter}>
            <SelectTrigger className="w-40"><SelectValue placeholder="Género" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los géneros</SelectItem>
              {GENDER_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={sourceFilter} onValueChange={setSourceFilter}>
            <SelectTrigger className="w-48"><SelectValue placeholder="Origen" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los orígenes</SelectItem>
              {SOURCE_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={birthdayFilter} onValueChange={setBirthdayFilter}>
            <SelectTrigger className="w-48"><SelectValue placeholder="Cumpleaños" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Cumpleaños: todos</SelectItem>
              {['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'].map((m, i) => (
                <SelectItem key={m} value={String(i + 1)}>Cumplen en {m}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={appFilter} onValueChange={setAppFilter}>
            <SelectTrigger className="w-44"><SelectValue placeholder="App" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Con y sin app</SelectItem>
              <SelectItem value="app">📱 Tienen la app</SelectItem>
            </SelectContent>
          </Select>
          <Select value={contactFilter} onValueChange={setContactFilter}>
            <SelectTrigger className="w-52"><SelectValue placeholder="Contacto" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los permisos</SelectItem>
              <SelectItem value="email">Sin permiso de correo</SelectItem>
              <SelectItem value="any">Con alguna baja</SelectItem>
            </SelectContent>
          </Select>
          <Input value={cityFilter} onChange={(e) => setCityFilter(e.target.value)} placeholder="Ciudad / comuna…" className="max-w-[11rem]" />
        </div>

        <div className="ml-auto flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleImportFile(file);
              e.target.value = '';
            }}
          />
          <Button variant="outline" className="interactive" disabled={importing} onClick={() => fileInputRef.current?.click()}>
            <Upload className="w-4 h-4 mr-2" />
            {importing ? 'Importando…' : 'Importar CSV'}
          </Button>
          <DownloadLink href={exportUrl()}>
            <Button variant="outline" className="interactive">
              <Download className="w-4 h-4 mr-2" />
              Exportar CSV
            </Button>
          </DownloadLink>
          <a href={printUrl()} target="_blank" rel="noopener noreferrer">
            <Button variant="outline" className="interactive">
              <Download className="w-4 h-4 mr-2" />
              Ver para imprimir
            </Button>
          </a>
        </div>
      </div>

      <Card className="rounded-2xl border-0 shadow-md shadow-black/5">
        <CardContent className="pt-6">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 px-3">Cliente</th>
                  <th className="text-left py-2 px-3">Última actividad</th>
                  <th className="text-left py-2 px-3">Compras</th>
                  <th className="text-left py-2 px-3">Playcoins</th>
                  <th className="text-left py-2 px-3">Etiquetas</th>
                </tr>
              </thead>
              <tbody>
                {pageItems.map((c: any) => {
                  const tags: string[] = Array.isArray(c.tags) ? c.tags : [];
                  const accessTypes: string[] = Array.isArray(c.accessTypes) ? c.accessTypes : [];
                  const level = CUSTOMER_LEVEL_META[c.level as keyof typeof CUSTOMER_LEVEL_META];
                  const days = c.lastSeenAt ? Math.max(0, daysBetween(c.lastSeenAt, new Date())) : null;
                  const tone = recencyTone(days);
                  return (
                    <tr
                      key={c.id}
                      onClick={() => setOpenCustomerId(c.id)}
                      className="border-b border-border/50 align-top cursor-pointer hover:bg-muted/40 active:bg-muted/60 transition-colors"
                    >
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-semibold">{c.fullName || '(sin nombre)'}</p>
                          {level && <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${level.chip}`}>{level.label}</span>}
                          {(c.emailOptOut || c.whatsappOptOut) && <BellOff className="w-3.5 h-3.5 text-destructive" aria-label="No contactar" />}
                          {c.hasApp && <span className="text-[11px] px-2 py-0.5 rounded-full font-medium bg-primary/15 text-primary" title="Abrió la app instalada en los últimos 60 días">📱 Tiene la app</span>}
                        </div>
                        <p className="text-muted-foreground text-xs">{c.email}{c.phone ? ` · ${c.phone}` : ''}{c.city ? ` · ${c.city}` : ''}</p>
                        {accessTypes.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {accessTypes.map((slug) => (
                              <span key={slug} className="text-[11px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary">
                                {ACCESO_SLUG_OPTIONS.find((o) => o.value === slug)?.label ?? slug}
                              </span>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-3 whitespace-nowrap">
                        <span className={`text-xs font-medium ${tone === 'frio' ? 'text-destructive' : tone === 'tibio' ? 'text-amber-600' : 'text-emerald-600'}`}>
                          {days != null ? (days === 0 ? 'hoy' : `hace ${days} d`) : '—'}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-muted-foreground text-xs whitespace-nowrap">
                        {c.totalOrders} compra{c.totalOrders !== 1 ? 's' : ''}
                        <br />${Number(c.totalSpent).toLocaleString('es-CL')}
                      </td>
                      <td className="py-3 px-3">
                        <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 font-medium whitespace-nowrap">🪙 {c.playcoins ?? 0}</span>
                      </td>
                      <td className="py-3 px-3 min-w-40">
                        <div className="flex flex-wrap gap-1">
                          {tags.slice(0, 3).map((tag) => (
                            <span key={tag} className="text-xs px-2 py-0.5 rounded-full bg-secondary/20 text-secondary-foreground">{tag}</span>
                          ))}
                          {tags.length > 3 && <span className="text-xs text-muted-foreground">+{tags.length - 3}</span>}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {customersLoading && <TableSkeleton rows={6} />}
            {!customersLoading && totalCustomers === 0 && <p className="text-sm text-muted-foreground py-4">{debouncedSearch || debouncedCity ? 'Nadie coincide con esa búsqueda.' : 'Sin clientes todavía -- se registran solos con cada compra web aprobada.'}</p>}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-4">
              <p className="text-xs text-muted-foreground">Página {currentPage + 1} de {totalPages}</p>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" disabled={currentPage === 0} onClick={() => setPage((p) => p - 1)}>Anterior</Button>
                <Button size="sm" variant="outline" disabled={currentPage >= totalPages - 1} onClick={() => setPage((p) => p + 1)}>Siguiente</Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <AttendeeContactsPanel search={search} />

      <CustomerDrawer
        customerId={openCustomerId}
        onClose={() => setOpenCustomerId(null)}
        onChanged={() => refetch()}
        onDeleted={() => setOpenCustomerId(null)}
        onPrev={openIdx > 0 ? () => setOpenCustomerId(pageItems[openIdx - 1].id) : undefined}
        onNext={openIdx >= 0 && openIdx < pageItems.length - 1 ? () => setOpenCustomerId(pageItems[openIdx + 1].id) : undefined}
      />
    </div>
  );
}

/** Contactos que dejaron su correo sin comprar todavía (hoy el único gancho
 * es "avísame antes de que suba el precio", ver LeadCaptureInline en
 * Home.tsx) -- con $0 de pauta y 8 semanas de campaña, esta lista es la
 * principal defensa contra la gente que visita el sitio y se pierde para
 * siempre por no comprar en el momento. */
export const LEADS_STEP = 100;

export function LeadsView() {
  const { data, refetch, isLoading } = trpc.leads.listAll.useQuery();
  const deleteLead = trpc.leads.delete.useMutation({ onSuccess: () => refetch(), onError: onMutationError });
  const allLeads = data ?? [];

  // Filtro en memoria: son cientos de filas, no miles, y ya se traen todas
  // de una consulta -- buscar no le pide nada al servidor.
  const [search, setSearch] = useState('');
  const [sourceFilter, setSourceFilter] = useState<string>('all');
  const [convertedFilter, setConvertedFilter] = useState<'all' | 'yes' | 'no'>('all');
  // Se dibujan de a 100: con miles de filas la pantalla se pegaba (el CSV igual lleva todas las filtradas).
  const [leadsShown, setLeadsShown] = useState(LEADS_STEP);
  useEffect(() => { setLeadsShown(LEADS_STEP); }, [search, sourceFilter, convertedFilter]);

  const availableSources = Array.from(new Set(allLeads.map((l: any) => l.utmSource).filter(Boolean))) as string[];

  const leads = allLeads.filter((l: any) => {
    if (convertedFilter === 'yes' && !l.convertedOrderId) return false;
    if (convertedFilter === 'no' && l.convertedOrderId) return false;
    if (sourceFilter !== 'all' && l.utmSource !== sourceFilter) return false;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      const haystack = `${l.email} ${l.phone ?? ''} ${l.instagram ?? ''}`.toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });

  const exportCsv = () => {
    const header = ['Fecha', 'Email', 'Teléfono', 'Instagram', 'Origen', 'UTM Source', 'UTM Medium', 'UTM Campaign', 'Convertido'];
    const lines = leads.map((l: any) => [
      formatChileShortDate(new Date(l.createdAt)), l.email, l.phone ?? '', l.instagram ?? '',
      l.source, l.utmSource ?? '', l.utmMedium ?? '', l.utmCampaign ?? '', l.convertedOrderId ? 'Sí' : 'No',
    ].map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','));
    const blob = new Blob([[header.join(','), ...lines].join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `leads-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center flex-wrap gap-3">
        <div>
          <h2 className="font-heading text-2xl">Leads</h2>
          <p className="text-muted-foreground text-sm mt-1">Contactos que dejaron su correo sin comprar todavía -- desde el gancho "avísame antes de que suba el precio" en la home.</p>
        </div>
        <Button variant="outline" onClick={exportCsv} disabled={leads.length === 0}><Download className="w-4 h-4 mr-2" /> Exportar CSV ({leads.length})</Button>
      </div>

      {allLeads.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por email, teléfono o Instagram…" className="max-w-xs" />
          <Select value={sourceFilter} onValueChange={setSourceFilter}>
            <SelectTrigger className="w-44"><SelectValue placeholder="Origen (UTM)" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Cualquier origen</SelectItem>
              {availableSources.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={convertedFilter} onValueChange={(v) => setConvertedFilter(v as 'all' | 'yes' | 'no')}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="no">Sin convertir</SelectItem>
              <SelectItem value="yes">Convertidos</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      {isLoading ? (
        <p className="text-muted-foreground text-sm">Cargando…</p>
      ) : allLeads.length === 0 ? (
        <p className="text-muted-foreground text-sm">Todavía no hay leads.</p>
      ) : leads.length === 0 ? (
        <p className="text-muted-foreground text-sm">Ningún lead coincide con el filtro.</p>
      ) : (
        <div className="space-y-2">
          {leads.slice(0, leadsShown).map((l: any) => (
            <Card key={l.id}>
              <CardContent className="pt-4 flex justify-between items-center flex-wrap gap-2">
                <div>
                  <span className="font-semibold">{l.email}</span>
                  {l.phone && <span className="text-muted-foreground text-sm ml-3">{l.phone}</span>}
                  {l.instagram && <span className="text-muted-foreground text-sm ml-3">@{l.instagram.replace(/^@/, '')}</span>}
                  <span className="text-xs ml-3 px-2 py-0.5 rounded-full bg-primary/15 text-primary">{l.source}</span>
                  {l.utmSource && (
                    <span className="text-xs ml-2 px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                      {l.utmSource}{l.utmMedium ? ` · ${l.utmMedium}` : ''}
                    </span>
                  )}
                  {l.convertedOrderId ? (
                    <span className="text-xs ml-2 px-2 py-0.5 rounded-full bg-green-500/15 text-green-600">✅ Convertido</span>
                  ) : null}
                  <span className="text-muted-foreground text-xs ml-3">{formatChileShortDate(new Date(l.createdAt))}</span>
                </div>
                <ConfirmDeleteButton description={`Vas a eliminar el lead "${l.email}".`} onConfirm={(adminPassword) => deleteLead.mutateAsync({ id: l.id, adminPassword })} />
              </CardContent>
            </Card>
          ))}
          {leads.length > leadsShown && (
            <Button variant="outline" className="w-full" onClick={() => setLeadsShown((n) => n + LEADS_STEP)}>
              Mostrar {Math.min(LEADS_STEP, leads.length - leadsShown)} más ({leads.length - leadsShown} sin mostrar)
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

/* ─── Programa Cumpleañeros ─────────────────────────────────── */

export const BIRTHDAY_TABS = [
  { id: 'postulaciones', label: 'Postulaciones' },
  { id: 'activos', label: 'Activos' },
] as const;

export function BirthdaysView() {
  const [tab, setTab] = useState<typeof BIRTHDAY_TABS[number]['id']>('postulaciones');
  const { data: eventsData } = trpc.events.listAll.useQuery();
  const events = eventsData ?? [];
  const { data: activeCajaEvent } = trpc.events.getActiveForCaja.useQuery();
  const [eventId, setEventId] = useState<number | null>(null);
  const activeEventId = eventId ?? activeCajaEvent?.id ?? events[0]?.id ?? null;
  const { data: pendingApplications } = trpc.birthdayApplications.countPending.useQuery(undefined, { refetchInterval: 60_000 });

  const createRewardProducts = trpc.birthdayProgram.createRewardProducts.useMutation({
    onSuccess: (r) => {
      if (r.created.length === 0) toast.success('Ya estaban creados los 4 productos de premio para este evento');
      else toast.success(`Creados: ${r.created.join(', ')}${r.skipped.length ? ` -- ya existían: ${r.skipped.join(', ')}` : ''}`);
    },
    onError: onMutationError,
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-heading text-2xl">Cumpleañeros</h2>
          <p className="text-muted-foreground text-sm mt-1 max-w-3xl">
            Postulan si su cumpleaños cae dentro de ±5 días del evento. Al aprobarlos se les genera un código de
            descuento propio -- según cuántas entradas se vendan con ese código para su evento, se les desbloquea (y
            reemplaza) el premio del tramo alcanzado, automáticamente, canjeable en caja.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {events.length > 0 && (
            <Select value={String(activeEventId)} onValueChange={(v) => setEventId(Number(v))}>
              <SelectTrigger className="w-64"><SelectValue /></SelectTrigger>
              <SelectContent>
                {events.map((e: any) => <SelectItem key={e.id} value={String(e.id)}>{e.title}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          <WriteButton
            variant="outline"
            disabled={!activeEventId || createRewardProducts.isPending}
            onClick={() => activeEventId && createRewardProducts.mutate({ eventId: activeEventId })}
          >
            <Gift className="w-4 h-4 mr-2" />
            {createRewardProducts.isPending ? 'Creando…' : 'Crear productos de premio'}
          </WriteButton>
        </div>
      </div>
      <p className="text-muted-foreground text-xs -mt-3">
        Crea los 4 productos de regalo (espumante, botella, cover, bebidas) para el evento elegido arriba -- internos,
        no aparecen en el checkout web ni en la grilla de venta de caja, solo se usan para materializar los premios.
        Si ya existen, no los duplica.
      </p>

      <div className="flex flex-wrap gap-2 border-b border-border pb-3">
        {BIRTHDAY_TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-colors interactive flex items-center gap-2 ${
              tab === t.id ? 'bg-primary text-primary-foreground' : 'bg-muted/40 text-muted-foreground hover:text-foreground'
            }`}
          >
            {t.label}
            {t.id === 'postulaciones' && !!pendingApplications && (
              <span className={`px-1.5 py-0.5 rounded-full text-xs font-bold ${tab === t.id ? 'bg-primary-foreground/20' : 'bg-primary/15 text-primary'}`}>
                {pendingApplications}
              </span>
            )}
          </button>
        ))}
      </div>

      {tab === 'postulaciones' && <BirthdayApplicationsTab eventId={activeEventId} />}
      {tab === 'activos' && activeEventId && <BirthdayActiveTab eventId={activeEventId} events={events} />}
    </div>
  );
}

/** Postulaciones públicas de /beneficios-cumpleaneros -- mismo esqueleto que
 * AmbassadorApplicationsTab arriba. Aprobar pide el código Y el % de
 * descuento para los invitados (a diferencia de embajadores, acá el código
 * SÍ es un discountCodes normal -- ver server/birthdayApplications.ts). */
export function BirthdayApplicationsTab({ eventId }: { eventId: number | null }) {
  const { data, refetch } = trpc.birthdayApplications.listAll.useQuery(eventId ? { eventId } : undefined);
  const applications = data ?? [];
  const [estado, setEstado] = useState<'pendiente' | 'aprobada' | 'rechazada' | 'all'>('pendiente');
  const [approvingId, setApprovingId] = useState<number | null>(null);
  const [code, setCode] = useState('');
  const [discountPercent, setDiscountPercent] = useState('10');
  const [rejectingId, setRejectingId] = useState<number | null>(null);
  const [rejectNote, setRejectNote] = useState('');

  const review = trpc.birthdayApplications.review.useMutation({
    onSuccess: () => { refetch(); toast.success('Postulación rechazada'); setRejectingId(null); setRejectNote(''); },
    onError: onMutationError,
  });
  const approve = trpc.birthdayApplications.approve.useMutation({
    onSuccess: () => { refetch(); toast.success('Cumpleañero aprobado y correo enviado'); setApprovingId(null); setCode(''); setDiscountPercent('10'); },
    onError: onMutationError,
  });

  const visibles = applications.filter((a: any) => estado === 'all' || a.status === estado);

  return (
    <div className="space-y-4">
      <Select value={estado} onValueChange={(v) => setEstado(v as typeof estado)}>
        <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="pendiente">Pendientes</SelectItem>
          <SelectItem value="aprobada">Aprobadas</SelectItem>
          <SelectItem value="rechazada">Rechazadas</SelectItem>
          <SelectItem value="all">Todas</SelectItem>
        </SelectContent>
      </Select>

      <Card className="rounded-2xl border-0 shadow-md shadow-black/5">
        <CardContent className="pt-6">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 px-3">Nombre</th>
                  <th className="text-left py-2 px-3">Contacto</th>
                  <th className="text-left py-2 px-3">Cumpleaños</th>
                  <th className="text-left py-2 px-3">Mensaje</th>
                  <th className="text-left py-2 px-3">Postulada</th>
                  <th className="text-left py-2 px-3">Estado</th>
                  <th className="text-left py-2 px-3">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {visibles.map((a: any) => (
                  <tr key={a.id} className="border-b border-border/50 align-top">
                    <td className="py-2 px-3">
                      <p className="font-medium">{a.name}</p>
                      <p className="text-xs text-muted-foreground">{a.email}</p>
                    </td>
                    <td className="py-2 px-3">
                      <a href={whatsappLinkFor(a.whatsapp)} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-primary hover:underline">
                        <MessageCircle className="w-3.5 h-3.5" /> {a.whatsapp}
                      </a>
                      {a.instagram && (
                        <a href={instagramLinkFor(a.instagram)} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-primary hover:underline mt-1">
                          <Instagram className="w-3.5 h-3.5" /> @{a.instagram}
                        </a>
                      )}
                    </td>
                    <td className="py-2 px-3 whitespace-nowrap">{a.birthDate}</td>
                    <td className="py-2 px-3 max-w-xs text-muted-foreground">{a.message || '—'}</td>
                    <td className="py-2 px-3 text-muted-foreground whitespace-nowrap">{formatChileShortDate(a.createdAt)}</td>
                    <td className="py-2 px-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs whitespace-nowrap ${
                        a.status === 'pendiente' ? 'bg-amber-500/15 text-amber-600' :
                        a.status === 'aprobada' ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground'
                      }`}>
                        {APPLICATION_STATUS_LABEL[a.status]}
                      </span>
                      {a.reviewNote && <p className="text-xs text-muted-foreground mt-1 max-w-[10rem]">{a.reviewNote}</p>}
                    </td>
                    <td className="py-2 px-3">
                      {a.status === 'pendiente' && (
                        approvingId === a.id ? (
                          <div className="flex items-center gap-1">
                            <Input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="CODIGO" className="h-8 w-28 font-mono" />
                            <Input type="number" value={discountPercent} onChange={(e) => setDiscountPercent(e.target.value)} placeholder="%" className="h-8 w-16" />
                            <WriteButton
                              size="sm" className="h-8"
                              disabled={!code.trim() || !discountPercent.trim() || approve.isPending}
                              onClick={() => approve.mutate({ id: a.id, code: code.trim(), discountPercent: Number(discountPercent) })}
                            >
                              {approve.isPending ? '...' : 'OK'}
                            </WriteButton>
                            <Button size="sm" variant="outline" className="h-8" onClick={() => { setApprovingId(null); setCode(''); }}><X className="w-3 h-3" /></Button>
                          </div>
                        ) : rejectingId === a.id ? (
                          <div className="flex items-center gap-1">
                            <Input value={rejectNote} onChange={(e) => setRejectNote(e.target.value)} placeholder="Nota (opcional)" className="h-8 w-36" />
                            <WriteButton size="sm" variant="destructive" className="h-8" disabled={review.isPending} onClick={() => review.mutate({ id: a.id, status: 'rechazada', note: rejectNote.trim() || undefined })}>
                              {review.isPending ? '...' : 'OK'}
                            </WriteButton>
                            <Button size="sm" variant="outline" className="h-8" onClick={() => { setRejectingId(null); setRejectNote(''); }}><X className="w-3 h-3" /></Button>
                          </div>
                        ) : (
                          <div className="flex gap-2">
                            <Button size="sm" className="h-8" onClick={() => setApprovingId(a.id)}><UserPlus className="w-3.5 h-3.5 mr-1" /> Aprobar</Button>
                            <Button size="sm" variant="outline" className="h-8 text-destructive" onClick={() => setRejectingId(a.id)}>Rechazar</Button>
                          </div>
                        )
                      )}
                      {a.status === 'aprobada' && a.createdBirthdayPersonId && (
                        <span className="text-xs text-muted-foreground font-mono">Ya es cumpleañero</span>
                      )}
                    </td>
                  </tr>
                ))}
                {visibles.length === 0 && (
                  <tr><td colSpan={7} className="py-8 text-center text-muted-foreground">
                    {estado === 'all' ? 'Sin postulaciones todavía.' : `Sin postulaciones en estado "${APPLICATION_STATUS_LABEL[estado] ?? estado}".`}
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/** Cumpleañeros ya aprobados del evento elegido: código, % de descuento,
 * entradas vendidas con su código y el tramo vigente -- más la asignación
 * manual del crédito de "próxima entrada" cuando ya se publicó el siguiente
 * evento (ver server/birthdayProgram.ts assignNextEventCredit). */
export function BirthdayActiveTab({ eventId, events }: { eventId: number; events: any[] }) {
  const { data, refetch } = trpc.birthdayProgram.listActiveForEvent.useQuery({ eventId });
  const people = data ?? [];
  const [assigningId, setAssigningId] = useState<number | null>(null);
  const [targetEventId, setTargetEventId] = useState<string>('');
  const [ticketTypeId, setTicketTypeId] = useState<string>('');
  const { data: targetTicketTypes } = trpc.events.listTicketTypes.useQuery(
    { eventId: Number(targetEventId) },
    { enabled: !!targetEventId },
  );

  const assign = trpc.birthdayProgram.assignNextEventCredit.useMutation({
    onSuccess: () => { refetch(); toast.success('Entrada asignada'); setAssigningId(null); setTargetEventId(''); setTicketTypeId(''); },
    onError: onMutationError,
  });

  const otherEvents = events.filter((e: any) => e.id !== eventId);

  return (
    <Card className="rounded-2xl border-0 shadow-md shadow-black/5">
      <CardContent className="pt-6">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-2 px-3">Cumpleañero</th>
                <th className="text-left py-2 px-3">Código</th>
                <th className="text-left py-2 px-3">% Descuento</th>
                <th className="text-left py-2 px-3">Entradas vendidas</th>
                <th className="text-left py-2 px-3">Tramo vigente</th>
                <th className="text-left py-2 px-3">Crédito próximo evento</th>
              </tr>
            </thead>
            <tbody>
              {people.map((p: any) => (
                <tr key={p.id} className="border-b border-border/50 align-top">
                  <td className="py-2 px-3">
                    <p className="font-medium">{p.name}</p>
                    <p className="text-xs text-muted-foreground">{p.email}</p>
                  </td>
                  <td className="py-2 px-3 font-mono">{p.code ?? '—'}</td>
                  <td className="py-2 px-3">{p.discountPercent ? `${p.discountPercent}%` : '—'}</td>
                  <td className="py-2 px-3">{p.ticketsSold}</td>
                  <td className="py-2 px-3">
                    {p.currentTier > 0 ? (
                      <span className="px-2 py-0.5 rounded-full text-xs bg-primary/15 text-primary whitespace-nowrap">Tramo {p.currentTier}</span>
                    ) : (
                      <span className="text-xs text-muted-foreground">Sin tramo todavía</span>
                    )}
                  </td>
                  <td className="py-2 px-3">
                    {!p.pendingNextEventCredit ? (
                      <span className="text-xs text-muted-foreground">—</span>
                    ) : assigningId === p.id ? (
                      <div className="flex flex-col gap-1.5">
                        <Select value={targetEventId} onValueChange={(v) => { setTargetEventId(v); setTicketTypeId(''); }}>
                          <SelectTrigger className="h-8 w-48"><SelectValue placeholder="Evento destino" /></SelectTrigger>
                          <SelectContent>
                            {otherEvents.map((e: any) => <SelectItem key={e.id} value={String(e.id)}>{e.title}</SelectItem>)}
                          </SelectContent>
                        </Select>
                        <Select value={ticketTypeId} onValueChange={setTicketTypeId} disabled={!targetEventId}>
                          <SelectTrigger className="h-8 w-48"><SelectValue placeholder="Producto a regalar" /></SelectTrigger>
                          <SelectContent>
                            {(targetTicketTypes ?? []).map((tt: any) => <SelectItem key={tt.id} value={String(tt.id)}>{tt.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                        <div className="flex gap-1.5">
                          <WriteButton
                            size="sm" className="h-8"
                            disabled={!targetEventId || !ticketTypeId || assign.isPending}
                            onClick={() => assign.mutate({ birthdayPersonId: p.id, targetEventId: Number(targetEventId), ticketTypeId: Number(ticketTypeId) })}
                          >
                            {assign.isPending ? '...' : 'Asignar'}
                          </WriteButton>
                          <Button size="sm" variant="outline" className="h-8" onClick={() => setAssigningId(null)}><X className="w-3 h-3" /></Button>
                        </div>
                      </div>
                    ) : (
                      <Button size="sm" variant="outline" className="h-8" onClick={() => setAssigningId(p.id)}>Asignar a evento</Button>
                    )}
                  </td>
                </tr>
              ))}
              {people.length === 0 && (
                <tr><td colSpan={6} className="py-8 text-center text-muted-foreground">Sin cumpleañeros aprobados para este evento todavía.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
