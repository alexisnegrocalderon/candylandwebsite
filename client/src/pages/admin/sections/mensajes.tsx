/* Secciones del hub «mensajes» del panel (se cargan solas al abrirlas, ver ADMIN_SECTIONS en ../Dashboard.tsx). */
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { WriteButton } from '@/components/admin/WriteButton';
import { Switch } from '@/components/ui/switch';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { X, Upload, ChevronDown, ChevronUp, Loader2, Send } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { MailingComposer } from '@/components/admin/MailingComposer';
import { ACCESO_SLUG_OPTIONS, onMutationError } from './shared';

/** Valor centinela de los selectores de etiqueta del Mailing: Select de shadcn
 * no admite un SelectItem con value="", así que "sin filtro" necesita un valor
 * propio que se traduce a '' al leerlo. */
export const NO_TAG_FILTER = '__all__';

/** Aviso automático diario de "primeros cupos" (pedido explícito del dueño,
 * server/foundersPromo.ts) -- vive arriba de todo el resto de Mailing
 * porque, a diferencia de las campañas manuales de abajo, esto corre solo
 * todos los días una vez prendido. Arranca apagado a propósito: el toggle
 * es la única forma de que empiece a mandar correos de verdad. */
export function FoundersPromoCard() {
  const { data: settings, refetch: refetchSettings } = trpc.settings.get.useQuery();
  const { data: status, refetch: refetchStatus } = trpc.mailing.foundersPromoStatus.useQuery();
  const [showPreview, setShowPreview] = useState(false);
  const { data: preview } = trpc.mailing.foundersPromoPreview.useQuery(undefined, { enabled: showPreview });

  const toggle = trpc.settings.update.useMutation({
    onSuccess: () => { refetchSettings(); refetchStatus(); },
    onError: onMutationError,
  });
  const runNow = trpc.mailing.foundersPromoRunNow.useMutation({
    onSuccess: (result) => {
      refetchStatus();
      if (!result.ran) {
        const reasons: Record<string, string> = {
          disabled: 'Está apagado.',
          'no-event': 'No hay ningún evento destacado ahora mismo.',
          'no-shared-pool': 'El evento no tiene un cupo compartido único activo (¿ya se cerró esa tanda?) -- se apagó solo.',
          'sold-out': 'El cupo compartido ya se agotó -- se apagó solo.',
          'audience-exhausted': 'Ya no queda nadie nuevo a quién mandarle -- se apagó solo.',
        };
        toast.info(reasons[result.reason] ?? 'No se mandó nada esta vez.');
        return;
      }
      toast.success(`Mandado: ${result.sent} correo(s) (${result.failed} fallidos) -- quedan ${result.remaining} cupos.`);
    },
    onError: onMutationError,
  });

  const enabled = !!settings?.foundersPromoEnabled;

  return (
    <Card className="rounded-2xl border-0 shadow-md shadow-black/5 bg-gradient-to-br from-primary/5 to-transparent">
      <CardContent className="pt-6 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="font-heading text-lg">🍬 Aviso automático de primeros cupos</h3>
            <p className="text-sm text-muted-foreground max-w-xl">
              Todos los días le manda hasta {status?.dailyTarget ?? 50} correos a clientes/leads que todavía no compraron
              el evento destacado, con el cupo REAL de esa tanda actualizado en cada envío. Nunca le repite el correo a
              la misma persona. Presupuesto propio, no le quita cupo a las confirmaciones de compra ni a los
              recordatorios de carrito.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs text-muted-foreground">{enabled ? 'Prendido' : 'Apagado'}</span>
            <Switch checked={enabled} onCheckedChange={(v) => toggle.mutate({ foundersPromoEnabled: v })} disabled={toggle.isPending} />
          </div>
        </div>

        {status && (
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-xl bg-white/50 dark:bg-black/20 p-3 text-center">
              <p className="text-2xl font-bold">{status.remaining ?? '—'}</p>
              <p className="text-xs text-muted-foreground">cupos quedan</p>
            </div>
            <div className="rounded-xl bg-white/50 dark:bg-black/20 p-3 text-center">
              <p className="text-2xl font-bold">{status.audienceSize}</p>
              <p className="text-xs text-muted-foreground">todavía por avisar</p>
            </div>
            <div className="rounded-xl bg-white/50 dark:bg-black/20 p-3 text-center">
              <p className="text-2xl font-bold truncate">{status.eventTitle ?? '—'}</p>
              <p className="text-xs text-muted-foreground">evento</p>
            </div>
          </div>
        )}

        {status && status.remaining === null && (
          <p className="text-xs text-amber-600 bg-amber-500/10 border border-amber-500/30 rounded-xl p-3">
            ⚠️ No hay un cupo compartido único activo en el evento destacado (revisá "Cupos compartidos" en Eventos) --
            mientras no lo haya, prender esto no manda nada.
          </p>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <WriteButton onClick={() => setShowPreview((v) => !v)} className="bg-white/70 dark:bg-black/30 text-foreground border border-border/50 hover:bg-white">
            {showPreview ? 'Ocultar preview' : 'Ver preview de hoy'}
          </WriteButton>
          <WriteButton onClick={() => runNow.mutate()} disabled={runNow.isPending}>
            {runNow.isPending ? 'Mandando…' : 'Mandar la tanda de hoy ahora'}
          </WriteButton>
        </div>

        {showPreview && preview?.html && (
          <iframe title="Preview aviso primeros cupos" srcDoc={preview.html} className="w-full h-96 rounded-xl border border-border/50 bg-white" />
        )}
      </CardContent>
    </Card>
  );
}

/** Aviso continuo de venta de entradas (server/salesDrip.ts): hasta 50
 * correos/día al evento destacado hasta el día de la fiesta; al terminar una
 * vuelta espera N días y vuelve a empezar. Reemplaza a los avisos por tanda. */
export function SalesDripCard() {
  const { data: status, refetch: refetchStatus } = trpc.mailing.salesDripStatus.useQuery();
  const [showPreview, setShowPreview] = useState(false);
  const { data: preview } = trpc.mailing.salesDripPreview.useQuery(undefined, { enabled: showPreview });
  const [days, setDays] = useState<string>('');

  const toggle = trpc.settings.update.useMutation({
    onSuccess: () => { refetchStatus(); },
    onError: onMutationError,
  });
  const runNow = trpc.mailing.salesDripRunNow.useMutation({
    onSuccess: (result) => {
      refetchStatus();
      if (!result.ran) {
        const reasons: Record<string, string> = {
          disabled: 'Está apagado.',
          'no-event': 'No hay ningún evento destacado ahora mismo.',
          'event-over': 'El evento destacado ya pasó.',
          'no-price': 'No hay entradas de acceso activas con precio.',
          'daily-cap-reached': 'Ya se llegó al tope diario de avisos de venta.',
          'nobody-due': 'Hoy no le toca a nadie (todos recibieron uno hace menos de los días de espera, o ya compraron).',
        };
        toast.info(reasons[result.reason] ?? 'No se mandó nada esta vez.');
        return;
      }
      toast.success(`Mandado: ${result.sent} correo(s) (${result.failed} fallidos, ${result.skipped} ya habían comprado).`);
    },
    onError: onMutationError,
  });

  const enabled = !!status?.enabled;

  return (
    <Card className="rounded-2xl border-0 shadow-md shadow-black/5 bg-gradient-to-br from-primary/5 to-transparent">
      <CardContent className="pt-6 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="font-heading text-lg">🍬 Aviso continuo de venta de entradas</h3>
            <p className="text-sm text-muted-foreground max-w-xl">
              Todos los días le manda hasta {status?.dailyTarget ?? 50} correos a quienes todavía no compraron el evento
              destacado, con el precio vigente, los cupos y los días que faltan. Al terminar una vuelta espera{' '}
              {status?.intervalDays ?? 4} días y vuelve a escribirle a quien siga sin comprar. Funciona solo para cada
              evento nuevo y termina el día de la fiesta. Prender este apaga los avisos por tanda.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs text-muted-foreground">{enabled ? 'Prendido' : 'Apagado'}</span>
            <Switch checked={enabled} onCheckedChange={(v) => toggle.mutate({ salesDripEnabled: v })} disabled={toggle.isPending} />
          </div>
        </div>

        {status && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-xl bg-white/50 dark:bg-black/20 p-3 text-center">
              <p className="text-2xl font-bold">{status.daysLeft ?? '—'}</p>
              <p className="text-xs text-muted-foreground">días para {status.eventTitle ?? 'el evento'}</p>
            </div>
            <div className="rounded-xl bg-white/50 dark:bg-black/20 p-3 text-center">
              <p className="text-2xl font-bold">{status.priceFrom != null ? `$${status.priceFrom.toLocaleString('es-CL')}` : '—'}</p>
              <p className="text-xs text-muted-foreground">desde (precio más bajo)</p>
            </div>
            <div className="rounded-xl bg-white/50 dark:bg-black/20 p-3 text-center">
              <p className="text-2xl font-bold">{status.dueToday} <span className="text-sm font-normal text-muted-foreground">de {status.audienceSize}</span></p>
              <p className="text-xs text-muted-foreground">les toca hoy</p>
            </div>
            <div className="rounded-xl bg-white/50 dark:bg-black/20 p-3 text-center">
              <p className="text-2xl font-bold">{status.sentToday} / {status.dailyTarget}</p>
              <p className="text-xs text-muted-foreground">avisos de venta hoy</p>
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <label className="text-sm text-muted-foreground flex items-center gap-2">
            Esperar
            <input
              type="number" min={1} max={30}
              className="w-16 rounded-lg border border-border/50 bg-white/70 dark:bg-black/30 px-2 py-1 text-sm text-foreground"
              value={days !== '' ? days : String(status?.intervalDays ?? 4)}
              onChange={(e) => setDays(e.target.value)}
            />
            días entre correos a la misma persona
          </label>
          <WriteButton
            onClick={() => { toggle.mutate({ salesDripIntervalDays: Math.min(30, Math.max(1, Number(days) || 4)) }); setDays(''); }}
            disabled={toggle.isPending || days === ''}
            className="bg-white/70 dark:bg-black/30 text-foreground border border-border/50 hover:bg-white"
          >
            Guardar
          </WriteButton>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <WriteButton onClick={() => setShowPreview((v) => !v)} className="bg-white/70 dark:bg-black/30 text-foreground border border-border/50 hover:bg-white">
            {showPreview ? 'Ocultar preview' : 'Ver preview de hoy'}
          </WriteButton>
          <WriteButton onClick={() => runNow.mutate()} disabled={runNow.isPending}>
            {runNow.isPending ? 'Mandando…' : 'Mandar la tanda de hoy ahora'}
          </WriteButton>
        </div>

        {showPreview && preview?.html && (
          <iframe title="Preview aviso continuo" srcDoc={preview.html} className="w-full h-96 rounded-xl border border-border/50 bg-white" />
        )}
      </CardContent>
    </Card>
  );
}

/** Aviso automático diario de la 2ª tanda (server/tanda2Promo.ts): hasta 50
 * correos/día a quienes todavía no compraron, con el nuevo precio. Arranca
 * apagado; prender este apaga el de primeros cupos (comparten el tope de 50). */
export function Tanda2PromoCard() {
  const { data: settings, refetch: refetchSettings } = trpc.settings.get.useQuery();
  const { data: status, refetch: refetchStatus } = trpc.mailing.tanda2PromoStatus.useQuery();
  const [showPreview, setShowPreview] = useState(false);
  const { data: preview } = trpc.mailing.tanda2PromoPreview.useQuery(undefined, { enabled: showPreview });

  const toggle = trpc.settings.update.useMutation({
    onSuccess: () => { refetchSettings(); refetchStatus(); },
    onError: onMutationError,
  });
  const runNow = trpc.mailing.tanda2PromoRunNow.useMutation({
    onSuccess: (result) => {
      refetchStatus();
      if (!result.ran) {
        const reasons: Record<string, string> = {
          disabled: 'Está apagado.',
          'no-event': 'No hay ningún evento destacado ahora mismo.',
          'wrong-phase': 'El evento todavía no está en la 2ª tanda -- no se manda nada hasta que se cierre la 1ª.',
          'phase-ended': 'El evento ya pasó de la 2ª tanda -- se apagó solo.',
          'no-price': 'No hay entradas de acceso activas con precio.',
          'audience-exhausted': 'Ya no queda nadie a quién mandarle -- se apagó solo.',
          'daily-cap-reached': 'Ya se llegó al tope diario de avisos de tanda (compartido con primeros cupos).',
        };
        toast.info(reasons[result.reason] ?? 'No se mandó nada esta vez.');
        return;
      }
      toast.success(`Mandado: ${result.sent} correo(s) (${result.failed} fallidos, ${result.skipped} ya habían comprado).`);
    },
    onError: onMutationError,
  });

  const enabled = !!settings?.tanda2PromoEnabled;

  return (
    <Card className="rounded-2xl border-0 shadow-md shadow-black/5 bg-gradient-to-br from-primary/5 to-transparent">
      <CardContent className="pt-6 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="font-heading text-lg">🍬 Aviso automático de la 2ª tanda</h3>
            <p className="text-sm text-muted-foreground max-w-xl">
              Todos los días le manda hasta {status?.dailyTarget ?? 50} correos a clientes/leads que todavía no compraron
              el evento destacado, avisando del nuevo precio. Siempre deja fuera a quien ya compró y nunca le repite el
              correo a la misma persona. El tope de {status?.dailyTarget ?? 50} se comparte con el aviso de primeros
              cupos (prender este apaga aquel) para dejar cupo a las confirmaciones de compra y demás correos.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs text-muted-foreground">{enabled ? 'Prendido' : 'Apagado'}</span>
            <Switch checked={enabled} onCheckedChange={(v) => toggle.mutate({ tanda2PromoEnabled: v })} disabled={toggle.isPending} />
          </div>
        </div>

        {status && (
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-xl bg-white/50 dark:bg-black/20 p-3 text-center">
              <p className="text-2xl font-bold">{status.priceFrom != null ? `$${status.priceFrom.toLocaleString('es-CL')}` : '—'}</p>
              <p className="text-xs text-muted-foreground">desde (precio más bajo)</p>
            </div>
            <div className="rounded-xl bg-white/50 dark:bg-black/20 p-3 text-center">
              <p className="text-2xl font-bold">{status.audienceSize}</p>
              <p className="text-xs text-muted-foreground">todavía por avisar</p>
            </div>
            <div className="rounded-xl bg-white/50 dark:bg-black/20 p-3 text-center">
              <p className="text-2xl font-bold">{status.sentToday} / {status.dailyTarget}</p>
              <p className="text-xs text-muted-foreground">avisos de tanda hoy</p>
            </div>
          </div>
        )}

        {status && status.phaseIndex !== null && status.phaseIndex !== 1 && (
          <p className="text-xs text-amber-600 bg-amber-500/10 border border-amber-500/30 rounded-xl p-3">
            ⚠️ El evento destacado no está en la 2ª tanda ahora mismo
            {status.phaseIndex < 1 ? ' (todavía en la 1ª): no se manda nada hasta que se cierre.' : ': al correr se apagará solo.'}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <WriteButton onClick={() => setShowPreview((v) => !v)} className="bg-white/70 dark:bg-black/30 text-foreground border border-border/50 hover:bg-white">
            {showPreview ? 'Ocultar preview' : 'Ver preview de hoy'}
          </WriteButton>
          <WriteButton onClick={() => runNow.mutate()} disabled={runNow.isPending}>
            {runNow.isPending ? 'Mandando…' : 'Mandar la tanda de hoy ahora'}
          </WriteButton>
        </div>

        {showPreview && preview?.html && (
          <iframe title="Preview aviso 2ª tanda" srcDoc={preview.html} className="w-full h-96 rounded-xl border border-border/50 bg-white" />
        )}
      </CardContent>
    </Card>
  );
}

/** Contador diario de TODOS los correos que salen del sistema (server/db.ts
 * countEmailsSentToday) -- pedido explícito del dueño para cuidar el cupo de
 * ~100/día del plan de Resend. Cuenta confirmaciones de compra, tickets,
 * recordatorios, mailing, resumen del admin: cualquier cosa que pase por
 * `sendEmail`, no solo lo que se manda desde esta pantalla. */
export function DailyEmailUsageCard() {
  const { data } = trpc.mailing.getDailyEmailUsage.useQuery(undefined, { refetchInterval: 30_000 });
  if (!data) return null;

  const pct = Math.min(100, Math.round((data.sentToday / data.dailyCap) * 100));
  const monthPct = Math.min(100, Math.round((data.sentMonth / data.monthlyLimit) * 100));
  // Amarillo pasados los 2/3 del cupo, rojo pasado el 90% -- para que el
  // dueño vea venir el límite antes de que un correo empiece a rebotar.
  const tone = pct >= 90 ? 'bg-destructive' : pct >= 66 ? 'bg-amber-500' : 'bg-primary';

  return (
    <Card className="rounded-2xl border-0 shadow-md shadow-black/5">
      <CardContent className="pt-6 space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium">Correos enviados hoy</p>
          <p className="text-sm">
            <span className="font-semibold">{data.sentToday}</span>
            <span className="text-muted-foreground"> / {data.dailyCap}</span>
          </p>
        </div>
        <div className="w-full h-2 bg-secondary/20 rounded-full overflow-hidden">
          <div className={`h-full transition-all ${tone}`} style={{ width: `${pct}%` }} />
        </div>
        <div className="flex items-center justify-between pt-2">
          <p className="text-sm font-medium">Correos del mes (Resend Pro)</p>
          <p className="text-sm">
            <span className="font-semibold">{data.sentMonth.toLocaleString('es-CL')}</span>
            <span className="text-muted-foreground"> / {data.monthlyLimit.toLocaleString('es-CL')}</span>
          </p>
        </div>
        <div className="w-full h-2 bg-secondary/20 rounded-full overflow-hidden">
          <div className={`h-full transition-all ${monthPct >= 90 ? 'bg-destructive' : monthPct >= 80 ? 'bg-amber-500' : 'bg-primary'}`} style={{ width: `${monthPct}%` }} />
        </div>
        <p className="text-xs text-muted-foreground">
          Cuenta cualquier correo del sistema (compras, tickets, recordatorios, mailing). Resend Pro no tiene tope diario: el límite es de {data.monthlyLimit.toLocaleString('es-CL')} al mes y se renueva el 21.
          {pct >= 90 && ' Hoy vas muy por sobre lo normal: revisa que no haya un envío masivo repetido.'}
        </p>
      </CardContent>
    </Card>
  );
}

export function MailingSection() {
  const [search, setSearch] = useState('');
  const [accessType, setAccessType] = useState<string>('all');
  const [tagFilter, setTagFilter] = useState('');
  const [excludeTagFilters, setExcludeTagFilters] = useState<string[]>([]);
  const [eventFilter, setEventFilter] = useState<string>('all');
  const [excludeBuyersOfEventId, setExcludeBuyersOfEventId] = useState<string>('none');
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [campaignTag, setCampaignTag] = useState('');
  const [importingCsv, setImportingCsv] = useState(false);
  const [csvImportResult, setCsvImportResult] = useState<{ tag: string; tagged: number; alreadyTagged: number; notFound: string[] } | null>(null);
  const csvInputRef = useRef<HTMLInputElement>(null);

  const { data: eventsData } = trpc.events.listAll.useQuery();
  const events = eventsData ?? [];

  const { data: customersData, isLoading: audienceLoading } = trpc.customers.listAll.useQuery({
    forMailing: true,
    search: search || undefined,
    accessType: accessType === 'all' ? undefined : accessType,
    tag: tagFilter || undefined,
    excludeTags: excludeTagFilters.length > 0 ? excludeTagFilters : undefined,
    eventId: eventFilter === 'all' ? undefined : Number(eventFilter),
    notPurchasedEventId: excludeBuyersOfEventId === 'none' ? undefined : Number(excludeBuyersOfEventId),
  });
  const customersList = customersData ?? [];

  // Etiquetas reales de la base para los selectores de incluir/excluir --
  // se refetchea al importar un CSV porque ese import crea etiquetas nuevas.
  const { data: tagsData, refetch: refetchTags } = trpc.customers.listTags.useQuery();
  const availableTags = tagsData ?? [];

  const bulkTagFromCsv = trpc.customers.bulkTagFromCsv.useMutation();
  // "Cargar leads sin convertir como audiencia" (ver server/db.ts
  // syncLeadsAsMailingAudience): convierte cada lead en un `customers`
  // mínimo taggeado "leads", así el resto del flujo de acá abajo (filtrar
  // por etiqueta, seleccionar, enviar/programar) es EL MISMO que ya usa el
  // dueño para clientes reales -- ninguna UI nueva que aprender.
  const syncLeads = trpc.leads.syncAsAudience.useMutation({
    onSuccess: (rows) => {
      refetchTags();
      if (rows.length === 0) { toast.info('No hay leads sin convertir para este filtro.'); return; }
      setTagFilter('leads');
      toast.success(`${rows.length} lead(s) cargados. Filtrados por la etiqueta "leads" para que los veas abajo.`);
    },
    onError: onMutationError,
  });

  const toggleSelected = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const allFilteredSelected = customersList.length > 0 && customersList.every((c: any) => selectedIds.has(c.id));
  const toggleSelectAllFiltered = () => {
    setSelectedIds((prev) => {
      if (allFilteredSelected) return new Set();
      const next = new Set(prev);
      customersList.forEach((c: any) => next.add(c.id));
      return next;
    });
  };

  // Qué etiquetas hay entre los seleccionados -- para confirmar de un vistazo
  // a quiénes se les va a mandar antes de apretar enviar.
  const selectedTagSummary = (() => {
    const counts = new Map<string, number>();
    for (const c of customersList as any[]) {
      if (!selectedIds.has(c.id) || !Array.isArray(c.tags)) continue;
      for (const tag of c.tags as string[]) counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
    return Array.from(counts, ([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count);
  })();

  const audienceDescription = (() => {
    const parts: string[] = [];
    if (eventFilter !== 'all') {
      const ev = events.find((e: any) => String(e.id) === eventFilter);
      parts.push(`compraron para ${ev?.title ?? 'el evento seleccionado'}`);
    }
    if (accessType !== 'all') parts.push(`tipo de acceso "${ACCESO_SLUG_OPTIONS.find((o) => o.value === accessType)?.label ?? accessType}"`);
    if (tagFilter) parts.push(`etiqueta "${tagFilter}"`);
    if (excludeTagFilters.length > 0) parts.push(`sin las etiquetas ${excludeTagFilters.map((t) => `"${t}"`).join(', ')}`);
    if (excludeBuyersOfEventId !== 'none') {
      const ev = events.find((e: any) => String(e.id) === excludeBuyersOfEventId);
      parts.push(`que NO compraron ${ev?.title ?? 'ese evento'}`);
    }
    if (search) parts.push(`búsqueda "${search}"`);
    return parts.length > 0 ? parts.join(', ') : 'toda la base de clientes';
  })();

  // El evento de la campaña: aquel del que se EXCLUYE a los compradores (lo normal en una campaña de venta) o, si no, el filtrado.
  const effectiveEventId: number | null = excludeBuyersOfEventId !== 'none' ? Number(excludeBuyersOfEventId) : eventFilter === 'all' ? null : Number(eventFilter);

  const mailingCtaUrl = (() => {
    const origin = window.location.origin;
    if (eventFilter !== 'all') {
      const ev = events.find((e: any) => String(e.id) === eventFilter);
      if (ev?.slug) return `${origin}/eventos/${ev.slug}`;
    }
    return origin;
  })();

  const handleImportCsv = async (file: File) => {
    if (!campaignTag.trim()) {
      toast.error('Ponle un nombre a la campaña arriba antes de importar el CSV -- es la etiqueta que se les va a aplicar.');
      return;
    }
    setImportingCsv(true);
    setCsvImportResult(null);
    try {
      const csv = await file.text();
      const tag = campaignTag.trim();
      const result = await bulkTagFromCsv.mutateAsync({ csv, tag });
      setCsvImportResult({ tag, ...result });
      refetchTags();
      if (result.tagged === 0 && result.alreadyTagged === 0) {
        toast.error(`Ningún email del CSV coincidió con la base de clientes -- mira el detalle abajo.`);
      } else {
        toast.success(`${result.tagged} marcados con "${tag}"${result.alreadyTagged ? `, ${result.alreadyTagged} ya la tenían` : ''}${result.notFound.length ? `, ${result.notFound.length} no encontrados` : ''}.`);
      }
    } catch (err) {
      onMutationError(err);
    } finally {
      setImportingCsv(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-heading text-2xl">Mailing</h2>
        <p className="text-sm text-muted-foreground">Arma una audiencia, genera el mail con IA, y mándalo -- cada envío exitoso queda etiquetado con el nombre de campaña para no repetir destinatarios.</p>
      </div>

      <DailyEmailUsageCard />
      <FoundersPromoCard />
      <SalesDripCard />
      <Tanda2PromoCard />

      <Card className="rounded-2xl border-0 shadow-md shadow-black/5">
        <CardContent className="pt-6 space-y-4">
          <div className="space-y-2 max-w-md">
            <Label>Nombre de campaña (etiqueta)</Label>
            <Input value={campaignTag} onChange={(e) => setCampaignTag(e.target.value)} placeholder="ej. masivocandyland2" />
            <p className="text-xs text-muted-foreground">Se aplica automáticamente a cada cliente que reciba el mail con éxito, y es la etiqueta que se usa si importás un CSV de entregados.</p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar…" className="max-w-xs" />
            <Select value={accessType} onValueChange={setAccessType}>
              <SelectTrigger className="w-52"><SelectValue placeholder="Tipo de acceso" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los tipos de acceso</SelectItem>
                {ACCESO_SLUG_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={tagFilter || NO_TAG_FILTER} onValueChange={(v) => setTagFilter(v === NO_TAG_FILTER ? '' : v)}>
              <SelectTrigger className="w-52"><SelectValue placeholder="Incluir etiqueta" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_TAG_FILTER}>Cualquier etiqueta</SelectItem>
                {availableTags.map((t) => (
                  <SelectItem key={t.tag} value={t.tag}>Con "{t.tag}" ({t.count})</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={NO_TAG_FILTER}
              onValueChange={(v) => {
                if (v === NO_TAG_FILTER) return;
                setExcludeTagFilters((prev) => (prev.includes(v) ? prev : [...prev, v]));
              }}
            >
              <SelectTrigger className="w-52"><SelectValue placeholder="Excluir etiqueta" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_TAG_FILTER}>Agregar etiqueta a excluir…</SelectItem>
                {availableTags.filter((t) => !excludeTagFilters.includes(t.tag)).map((t) => (
                  <SelectItem key={t.tag} value={t.tag}>Sin "{t.tag}" ({t.count})</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={eventFilter} onValueChange={setEventFilter}>
              <SelectTrigger className="w-52"><SelectValue placeholder="Evento" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los eventos</SelectItem>
                {events.map((e: any) => <SelectItem key={e.id} value={String(e.id)}>{e.title}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={excludeBuyersOfEventId} onValueChange={setExcludeBuyersOfEventId}>
              <SelectTrigger className="w-56"><SelectValue placeholder="Excluir compradores de…" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No excluir compradores</SelectItem>
                {events.map((e: any) => <SelectItem key={e.id} value={String(e.id)}>Ya compraron {e.title}</SelectItem>)}
              </SelectContent>
            </Select>
            <WriteButton
              variant="outline"
              onClick={() => syncLeads.mutate({ eventId: eventFilter === 'all' ? undefined : Number(eventFilter) })}
              disabled={syncLeads.isPending}
            >
              {syncLeads.isPending ? 'Cargando…' : 'Cargar leads sin convertir como audiencia'}
            </WriteButton>

            <div className="ml-auto flex flex-col items-end gap-1">
              <input
                ref={csvInputRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleImportCsv(file);
                  e.target.value = '';
                }}
              />
              <Button variant="outline" className="interactive" disabled={importingCsv || !campaignTag.trim()} onClick={() => csvInputRef.current?.click()}>
                <Upload className="w-4 h-4 mr-2" />
                {importingCsv ? 'Marcando…' : `Marcar como enviados (CSV)`}
              </Button>
              {!campaignTag.trim() && <p className="text-xs text-destructive">Pon el nombre de campaña arriba primero</p>}
            </div>
          </div>

          {excludeTagFilters.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted-foreground">Excluyendo:</span>
              {excludeTagFilters.map((tag) => (
                <span key={tag} className="inline-flex items-center gap-1 rounded-full bg-destructive/10 text-destructive text-xs font-medium pl-3 pr-2 py-1">
                  {tag}
                  <button
                    type="button"
                    onClick={() => setExcludeTagFilters((prev) => prev.filter((t) => t !== tag))}
                    className="interactive rounded-full hover:bg-destructive/20 p-0.5"
                    aria-label={`Sacar "${tag}" de la exclusión`}
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
          )}

          {csvImportResult && (
            <div className="rounded-xl border border-border/50 px-4 py-3 text-sm space-y-2">
              <p>
                Import de CSV con etiqueta <span className="font-semibold">"{csvImportResult.tag}"</span>:{' '}
                <span className="text-primary font-medium">{csvImportResult.tagged} marcados ahora</span>
                {csvImportResult.alreadyTagged > 0 && <span className="text-muted-foreground">, {csvImportResult.alreadyTagged} ya la tenían</span>}
                {csvImportResult.notFound.length > 0 && <span className="text-destructive">, {csvImportResult.notFound.length} sin match en la base</span>}
              </p>
              {csvImportResult.notFound.length > 0 && (
                <details className="text-xs text-muted-foreground">
                  <summary className="cursor-pointer text-primary">Ver los que no matchearon</summary>
                  <div className="mt-1 max-h-32 overflow-y-auto font-mono space-y-0.5">
                    {csvImportResult.notFound.map((email) => <div key={email}>{email}</div>)}
                  </div>
                </details>
              )}
            </div>
          )}

          <div className="space-y-2 rounded-xl border border-border/50 px-4 py-2.5">
            <div className="flex items-center gap-3">
              <Checkbox checked={allFilteredSelected} onCheckedChange={toggleSelectAllFiltered} />
              <span className="text-sm text-muted-foreground">
                {selectedIds.size > 0 ? `${selectedIds.size} seleccionado${selectedIds.size !== 1 ? 's' : ''}` : `Seleccionar los ${customersList.length} filtrados`}
              </span>
            </div>
            {selectedTagSummary.length > 0 && (
              <div className="flex flex-wrap items-center gap-1">
                <span className="text-xs text-muted-foreground mr-1">Etiquetas entre los seleccionados:</span>
                {selectedTagSummary.map(({ tag, count }) => (
                  <span key={tag} className="text-xs px-2 py-0.5 rounded-full bg-secondary/20 text-secondary-foreground">
                    {tag} ({count})
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="max-h-[28rem] overflow-y-auto rounded-lg border border-border/50 divide-y">
            {customersList.map((c: any) => {
              const tags: string[] = Array.isArray(c.tags) ? c.tags : [];
              const accessTypes: string[] = Array.isArray(c.accessTypes) ? c.accessTypes : [];
              return (
                <label key={c.id} className="flex items-start gap-3 px-3 py-2.5 text-sm cursor-pointer hover:bg-muted/30">
                  <Checkbox className="mt-1 shrink-0" checked={selectedIds.has(c.id)} onCheckedChange={() => toggleSelected(c.id)} />
                  <div className="flex-1 min-w-0 space-y-1">
                    <p className="font-medium truncate">{c.fullName || '(sin nombre)'}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {c.email}
                      {c.phone ? ` · ${c.phone}` : ''}
                      {c.instagram ? ` · @${String(c.instagram).replace(/^@/, '')}` : ''}
                    </p>
                    {(accessTypes.length > 0 || tags.length > 0) && (
                      <div className="flex flex-wrap gap-1">
                        {accessTypes.map((slug) => (
                          <span key={slug} className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                            {ACCESO_SLUG_OPTIONS.find((o) => o.value === slug)?.label ?? slug}
                          </span>
                        ))}
                        {tags.map((tag) => (
                          <span key={tag} className="text-xs px-2 py-0.5 rounded-full bg-secondary/20 text-secondary-foreground">
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                    <p className="text-xs text-muted-foreground">
                      {c.totalOrders} compra{c.totalOrders !== 1 ? 's' : ''} · ${Number(c.totalSpent).toLocaleString('es-CL')} · 🪙 {c.playcoins ?? 0}
                      {c.lastSeenAt ? ` · última: ${new Date(c.lastSeenAt).toLocaleDateString('es-CL', { timeZone: 'America/Santiago' })}` : ''}
                    </p>
                  </div>
                </label>
              );
            })}
            {customersList.length === 0 && <p className="text-sm text-muted-foreground px-3 py-4">{audienceLoading ? 'Cargando la audiencia…' : 'Nadie coincide con estos filtros.'}</p>}
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-2xl border-0 shadow-md shadow-black/5">
        <CardContent className="pt-6">
          <MailingComposer
            audience={{ ids: Array.from(selectedIds), count: selectedIds.size, description: audienceDescription }}
            ctaUrl={mailingCtaUrl}
            campaignTag={campaignTag}
            eventId={effectiveEventId}
            eventSlug={events.find((e: any) => e.id === effectiveEventId)?.slug ?? null}
            onSuggestName={setCampaignTag}
            onDone={() => setSelectedIds(new Set())}
          />
        </CardContent>
      </Card>
    </div>
  );
}

/** Tandas de envío INMEDIATO (aviso automático de primeros cupos + "Enviar
 * a N clientes" desde MailingComposer) -- pedido explícito del dueño: poder
 * ver la lista de correos mientras se van mandando, no solo el resumen
 * final. Log aparte de mailingCampaigns/mailingRecipients a propósito (ver
 * mailingSendLog en drizzle/schema.ts) -- puramente informativo, no cuenta
 * para ningún presupuesto ni lo procesa ningún cron.
 *
 * Poll de 5s (no 30s como las campañas encoladas de abajo): una tanda de 50
 * a ~250ms entre envíos tarda ~12-15s en total, así que un poll más corto
 * de verdad se ve "en vivo" mientras corre. */
export function ImmediateSendBatches() {
  const { data: batchesData, refetch } = trpc.mailing.listRecentSendBatches.useQuery(undefined, {
    refetchInterval: 5_000,
  });
  const batches = batchesData ?? [];
  const [expandedBatchId, setExpandedBatchId] = useState<string | null>(null);

  const { data: detailData, isLoading: detailLoading } = trpc.mailing.getSendBatchDetail.useQuery(
    { batchId: expandedBatchId ?? '' },
    { enabled: expandedBatchId !== null, refetchInterval: 5_000 }
  );
  const detail = detailData ?? [];

  if (batches.length === 0) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-heading text-lg">Envíos inmediatos</h3>
        <Button variant="outline" size="sm" onClick={() => refetch()} className="interactive">Actualizar</Button>
      </div>
      {batches.map((b: any) => {
        const isExpanded = expandedBatchId === b.batchId;
        const total = Number(b.total);
        const sentCount = Number(b.sentCount);
        return (
          <Card key={b.batchId} className="rounded-2xl border-0 shadow-md shadow-black/5">
            <CardContent className="pt-6 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold">
                    {b.source === 'sales-drip' ? '🍬 Aviso continuo de venta' : b.source === 'founders-promo' ? '🍬 Aviso de primeros cupos' : b.source === 'tanda2-promo' ? '🍬 Aviso 2ª tanda' : '✉️ Envío manual'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {b.label} · {new Date(b.startedAt).toLocaleString('es-CL', { timeZone: 'America/Santiago' })}
                  </p>
                </div>
                <span className="text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap bg-primary/10 text-primary">
                  {sentCount}/{total}
                </span>
              </div>
              <Button
                type="button" variant="ghost" size="sm" className="text-xs h-7 px-2 -ml-2"
                onClick={() => setExpandedBatchId(isExpanded ? null : b.batchId)}
              >
                {isExpanded ? <ChevronUp className="w-3.5 h-3.5 mr-1" /> : <ChevronDown className="w-3.5 h-3.5 mr-1" />}
                {isExpanded ? 'Ocultar lista' : 'Ver lista de correos'}
              </Button>
              {isExpanded && (
                <div className="max-h-52 overflow-y-auto rounded-lg border border-border/50 divide-y">
                  {detail.map((row: any) => (
                    <div key={row.id} className="px-3 py-2 text-xs flex justify-between gap-2">
                      <span>{row.email}</span>
                      <span className={row.success ? 'text-primary' : 'text-destructive'}>
                        {row.success ? '✅ Enviado' : `❌ ${row.reason || 'Error'}`}
                      </span>
                    </div>
                  ))}
                  {detail.length === 0 && <p className="text-xs text-muted-foreground px-3 py-2">{detailLoading ? 'Cargando…' : 'Todavía no sale ningún correo de este envío.'}</p>}
                  {detail.length > 0 && detail.length < total && (
                    <p className="text-xs text-muted-foreground px-3 py-2">Mandando el resto…</p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

/** Historial de campañas de envío automático (pedido explícito del usuario):
 * las que se mandan con "Guardar para envío automático" en MailingComposer
 * quedan acá con su progreso, drenadas de a poco por el cron diario. Los
 * envíos inmediatos (aviso de primeros cupos + "Enviar a N clientes") tienen
 * su propia sección arriba (ImmediateSendBatches) -- log aparte, no se
 * mezclan con estas campañas encoladas. */
/** Aviso de Resend por variante de asunto: personas distintas que recibieron, abrieron, hicieron clic, rebotaron o marcaron spam.
 * Las aperturas no son del todo fiables (Apple las infla): el clic es la señal que importa. */
function CampaignStats({ campaignName, subjectB }: { campaignName: string; subjectB: boolean }) {
  const { data } = trpc.mailing.campaignStats.useQuery({ campaignName }, { refetchInterval: 60_000 });
  if (!data || data.length === 0) return <p className="text-xs text-muted-foreground">Sin avisos de Resend todavía (activa el webhook para ver aperturas y clics).</p>;
  const label = (v: string) => (v === 'A' ? (subjectB ? 'Asunto A' : 'Todos') : v === 'B' ? 'Asunto B' : 'Sin variante');
  return (
    <div className="rounded-lg border border-border/50 divide-y text-xs">
      {data.map((row: { variant: string; counts: Record<string, number> }) => {
        const d = row.counts.delivered ?? 0;
        const pct = (n?: number) => (d > 0 && n ? ` (${Math.round((n / d) * 100)}%)` : '');
        return (
          <div key={row.variant} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2">
            <span className="font-semibold w-20">{label(row.variant)}</span>
            <span>{d} entregados</span>
            <span>{row.counts.opened ?? 0} abrieron{pct(row.counts.opened)}</span>
            <span className="font-semibold text-primary">{row.counts.clicked ?? 0} clics{pct(row.counts.clicked)}</span>
            {(row.counts.bounced ?? 0) > 0 && <span className="text-destructive">{row.counts.bounced} rebotes</span>}
            {(row.counts.complained ?? 0) > 0 && <span className="text-destructive">{row.counts.complained} spam</span>}
          </div>
        );
      })}
    </div>
  );
}

export function MailingHistoryView() {
  const { data: campaignsData, refetch } = trpc.mailing.listCampaigns.useQuery(undefined, {
    refetchInterval: 30_000,
  });
  const campaigns = campaignsData ?? [];
  const [expandedId, setExpandedId] = useState<number | null>(null);
  // Confirmación en dos pasos antes de cancelar (mismo patrón que
  // "Evaluar Misión 300") -- frenar una campaña a mitad de envío no se
  // deshace, así que un tap solo no alcanza.
  const [confirmingCancelId, setConfirmingCancelId] = useState<number | null>(null);
  const cancelCampaign = trpc.mailing.cancelCampaign.useMutation({
    onSuccess: () => { toast.success('Campaña cancelada -- no se manda el resto.'); refetch(); },
    onError: onMutationError,
  });

  const { data: recipientsData, isLoading: recipientsLoading } = trpc.mailing.getCampaignRecipients.useQuery(
    { campaignId: expandedId ?? 0 },
    { enabled: expandedId !== null }
  );
  const failedRecipients = (recipientsData ?? []).filter((r: any) => r.status === 'failed');

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-heading text-2xl">Historial de Mailing</h2>
          <p className="text-sm text-muted-foreground">Campañas de envío automático -- el cron diario las va mandando de a poco hasta terminar.</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} className="interactive">Actualizar</Button>
      </div>

      <ImmediateSendBatches />

      {campaigns.length === 0 && (
        <p className="text-sm text-muted-foreground">Todavía no hay ninguna campaña guardada para envío automático. Se arman desde la pestaña Mailing con "Guardar para envío automático".</p>
      )}

      <div className="space-y-3">
        {campaigns.map((c: any) => {
          const progress = c.totalRecipients > 0 ? Math.round(((c.sentCount + c.failedCount + c.skippedCount) / c.totalRecipients) * 100) : 0;
          const isExpanded = expandedId === c.id;
          return (
            <Card key={c.id} className="rounded-2xl border-0 shadow-md shadow-black/5">
              <CardContent className="pt-6 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">{c.name}</p>
                    <p className="text-xs text-muted-foreground">{c.audienceDescription} · creada el {new Date(c.createdAt).toLocaleDateString('es-CL', { timeZone: 'America/Santiago' })}</p>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${
                    c.status === 'done' ? 'bg-primary/10 text-primary' : c.status === 'cancelled' ? 'bg-muted text-muted-foreground' : c.status === 'scheduled' ? 'bg-sky-500/10 text-sky-600' : 'bg-amber-500/10 text-amber-600'
                  }`}>
                    {c.status === 'done' ? 'Terminada' : c.status === 'cancelled' ? 'Cancelada'
                      : c.status === 'scheduled' ? `Programada · ${c.scheduledAt ? new Date(c.scheduledAt).toLocaleString('es-CL', { timeZone: 'America/Santiago', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false }) : ''}`
                      : 'Enviando…'}
                  </span>
                </div>

                <div className="w-full h-2 bg-secondary/20 rounded-full overflow-hidden">
                  <div className="h-full bg-primary transition-all" style={{ width: `${progress}%` }} />
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="text-primary font-medium">{c.sentCount} enviados</span>
                  {c.failedCount > 0 && <span className="text-destructive font-medium">{c.failedCount} fallidos</span>}
                  {c.skippedCount > 0 && <span className="text-muted-foreground">{c.skippedCount} ya habían comprado</span>}
                  <span>{c.totalRecipients} en total</span>
                  {c.status === 'sending' && <span>· sigue en la próxima corrida con lo que falte</span>}
                  {c.status === 'scheduled' && <span>· la lista se arma a la hora de envío</span>}
                </div>

                {(c.status === 'done' || c.status === 'sending') && c.sentCount > 0 && <CampaignStats campaignName={c.name} subjectB={!!(c.content as any)?.subjectB} />}

                {(c.status === 'sending' || c.status === 'scheduled') && (
                  confirmingCancelId === c.id ? (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">¿Cancelar? No se manda el resto de los destinatarios.</span>
                      <WriteButton
                        type="button" variant="destructive" size="sm" className="h-7 px-2 text-xs"
                        onClick={() => { cancelCampaign.mutate({ campaignId: c.id }); setConfirmingCancelId(null); }}
                        disabled={cancelCampaign.isPending}
                      >
                        Confirmar
                      </WriteButton>
                      <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setConfirmingCancelId(null)}>
                        Volver
                      </Button>
                    </div>
                  ) : (
                    <Button
                      type="button" variant="outline" size="sm" className="h-7 px-2 text-xs text-destructive"
                      onClick={() => setConfirmingCancelId(c.id)}
                    >
                      Cancelar campaña
                    </Button>
                  )
                )}

                {c.failedCount > 0 && (
                  <Button
                    type="button" variant="ghost" size="sm" className="text-xs h-7 px-2 -ml-2"
                    onClick={() => setExpandedId(isExpanded ? null : c.id)}
                  >
                    {isExpanded ? <ChevronUp className="w-3.5 h-3.5 mr-1" /> : <ChevronDown className="w-3.5 h-3.5 mr-1" />}
                    Ver fallidos
                  </Button>
                )}
                {isExpanded && (
                  <div className="max-h-40 overflow-y-auto rounded-lg border border-border/50 divide-y">
                    {failedRecipients.map((r: any) => (
                      <div key={r.id} className="px-3 py-2 text-xs flex justify-between gap-2">
                        <span>{r.email}</span>
                        <span className="text-destructive text-right">{r.reason || 'Error desconocido'}</span>
                      </div>
                    ))}
                    {failedRecipients.length === 0 && <p className="text-xs text-muted-foreground px-3 py-2">{recipientsLoading ? 'Cargando…' : 'No hay correos fallidos.'}</p>}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

/* ─── Plantillas de correo ────────────────────────────────────────────────
 * Editor de textos + interruptores por sección del correo de compra
 * (buildOrderEmail), y botón de "mandar prueba" para los 4 correos de cara
 * al cliente -- pedido pendiente de la sesión anterior que se cortó por
 * límite de uso. Alcance acotado a buildOrderEmail para los toggles: es el
 * único con secciones largas desacoplables (server/email.ts). */

export const EMAIL_TEMPLATE_SECTION_LABELS: { key: keyof typeof DEFAULT_ORDER_EMAIL_SECTIONS; label: string }[] = [
  { key: 'quienesSomos', label: '¿Qué es Mansion Playroom?' },
  { key: 'encontraras', label: '¿Qué encontrarás?' },
  { key: 'antesDeVenir', label: 'Antes de venir' },
  { key: 'valores', label: 'Nuestros valores' },
  { key: 'embajador', label: 'Tu Código de Embajador' },
  { key: 'faq', label: 'Preguntas rápidas' },
];

export const DEFAULT_ORDER_EMAIL_SECTIONS = {
  quienesSomos: true,
  encontraras: true,
  antesDeVenir: true,
  valores: true,
  embajador: true,
  faq: true,
};

export const TEST_EMAIL_TEMPLATE_OPTIONS: { value: 'order' | 'missionTopup' | 'pendingReminder' | 'gift'; label: string }[] = [
  { value: 'order', label: 'Compra confirmada / entrada' },
  { value: 'missionTopup', label: 'Misión 300 — falta completar diferencia' },
  { value: 'pendingReminder', label: 'Recordatorio de carrito abandonado' },
  { value: 'gift', label: 'Trago de regalo' },
];

export function EmailTemplatesManager() {
  const { data: config, refetch } = trpc.emailTemplates.getConfig.useQuery();
  const [sections, setSections] = useState(DEFAULT_ORDER_EMAIL_SECTIONS);
  const [greetingText, setGreetingText] = useState('');
  const [farewellText, setFarewellText] = useState('');
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [testEmail, setTestEmail] = useState('');
  const [testTemplate, setTestTemplate] = useState<'order' | 'missionTopup' | 'pendingReminder' | 'gift'>('order');

  useEffect(() => {
    if (config) {
      setSections(config.sections);
      setGreetingText(config.greetingText);
      setFarewellText(config.farewellText);
    }
  }, [config]);

  const saveConfig = trpc.emailTemplates.saveConfig.useMutation({ onSuccess: () => { refetch(); toast.success('Plantilla guardada'); }, onError: onMutationError });
  const renderPreview = trpc.emailTemplates.renderPreview.useMutation();
  const sendTest = trpc.emailTemplates.sendTest.useMutation();

  const handlePreview = async () => {
    try {
      const { html } = await renderPreview.mutateAsync({ sections, greetingText, farewellText });
      setPreviewHtml(html);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo generar la vista previa.');
    }
  };

  // Vista previa siempre al día, mismo patrón que MailingComposer.
  useEffect(() => {
    const timer = setTimeout(() => { handlePreview(); }, 600);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sections, greetingText, farewellText]);

  const handleSave = () => {
    saveConfig.mutate({ sections, greetingText, farewellText });
  };

  const handleSendTest = async () => {
    if (!testEmail.trim()) { toast.error('Escribe una casilla de correo primero.'); return; }
    try {
      await sendTest.mutateAsync({ toEmail: testEmail.trim(), templateType: testTemplate });
      toast.success(`Prueba enviada a ${testEmail.trim()}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo enviar la prueba.');
    }
  };

  return (
    <div className="space-y-6">
      <h2 className="font-heading text-2xl">Plantillas de correo</h2>

      <Card className="rounded-2xl border-0 shadow-md shadow-black/5">
        <CardHeader><CardTitle>Correo de compra confirmada</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground text-sm">
            Apaga las secciones informativas que no quieras mandar (la estructura de reserva, resumen de compra y
            entrada/QR siempre se mandan) y edita los dos párrafos de texto libre. La vista previa se actualiza sola.
          </p>
          <div className="space-y-2 rounded-xl border border-border/50 p-3">
            <Label>Secciones</Label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {EMAIL_TEMPLATE_SECTION_LABELS.map(({ key, label }) => (
                <div key={key} className="flex items-center gap-2">
                  <Checkbox
                    id={`email-section-${key}`}
                    checked={sections[key]}
                    onCheckedChange={(checked) => setSections((s) => ({ ...s, [key]: checked === true }))}
                  />
                  <Label htmlFor={`email-section-${key}`} className="font-normal cursor-pointer">{label}</Label>
                </div>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <Label>Saludo (bajo "Hola {'{nombre}'}"). Puedes usar {'{{evento}}'}.</Label>
            <Textarea value={greetingText} onChange={(e) => setGreetingText(e.target.value)} className="min-h-20" />
          </div>
          <div className="space-y-2">
            <Label>Despedida (bajo "Nos vemos en {'{evento}'}"). Puedes usar {'{{evento}}'}.</Label>
            <Textarea value={farewellText} onChange={(e) => setFarewellText(e.target.value)} className="min-h-20" />
          </div>
          <div className="flex flex-wrap gap-2">
            <WriteButton onClick={handleSave} disabled={saveConfig.isPending} className="interactive">
              {saveConfig.isPending ? 'Guardando…' : 'Guardar'}
            </WriteButton>
            <Button type="button" variant="outline" onClick={handlePreview} disabled={renderPreview.isPending}>
              {renderPreview.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null} Actualizar vista previa
            </Button>
          </div>
          {previewHtml && (
            <div className="space-y-2">
              <Label>Vista previa (datos de muestra)</Label>
              <iframe srcDoc={previewHtml} className="w-full h-96 border rounded-xl bg-white" title="Vista previa del correo de compra" />
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="rounded-2xl border-0 shadow-md shadow-black/5">
        <CardHeader><CardTitle>Mandar prueba</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground text-sm">
            Manda cualquiera de los 4 correos de cara al cliente a una casilla cualquiera, con datos de muestra --
            para revisar cómo se ve realmente en la bandeja de entrada antes de que le llegue a un cliente real.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Plantilla</Label>
              <Select value={testTemplate} onValueChange={(v) => setTestTemplate(v as typeof testTemplate)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TEST_EMAIL_TEMPLATE_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Casilla de destino</Label>
              <Input type="email" value={testEmail} onChange={(e) => setTestEmail(e.target.value)} placeholder="tu@correo.com" />
            </div>
          </div>
          <WriteButton onClick={handleSendTest} disabled={sendTest.isPending} className="interactive">
            {sendTest.isPending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Enviando…</> : <><Send className="w-4 h-4 mr-2" /> Enviar prueba</>}
          </WriteButton>
        </CardContent>
      </Card>
    </div>
  );
}
