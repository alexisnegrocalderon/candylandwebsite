/* Secciones del hub «comunidad» del panel (se cargan solas al abrirlas, ver ADMIN_SECTIONS en ../Dashboard.tsx). */
import { Fragment, lazy, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { WriteButton } from '@/components/admin/WriteButton';
import { MAX_AMBASSADOR_BUYER_DISCOUNT } from '@shared/ambassadorDiscount';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DollarSign, Ticket, Users, Plus, Percent, Contact, X, Gift, Crown, Instagram } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { formatChileShortDate } from '@shared/chileDate';
import { AmbassadorApplicationsTab, AmbassadorRow, OrdersView, ProgramConfigTab, StatCard, onMutationError } from './shared';

export function ReferralsView() {
  const { data: referralStats } = trpc.referrals.getStats.useQuery();
  const stats = referralStats ?? [];

  return (
    <div className="space-y-6">
      <h2 className="font-heading text-2xl">Embajadores y Referidos</h2>
      <Card className="rounded-2xl border-0 shadow-md shadow-black/5">
        <CardContent className="pt-6">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 px-3">Código</th>
                  <th className="text-left py-2 px-3">Referidos</th>
                  <th className="text-left py-2 px-3">Tickets Vendidos</th>
                  <th className="text-left py-2 px-3">Ingresos Generados</th>
                </tr>
              </thead>
              <tbody>
                {stats.map((stat: any) => (
                  <tr key={stat.ambassadorCode} className="border-b border-border/50">
                    <td className="py-2 px-3 font-mono font-bold text-primary">{stat.ambassadorCode}</td>
                    <td className="py-2 px-3">{stat.totalReferrals}</td>
                    <td className="py-2 px-3">{stat.totalTickets}</td>
                    <td className="py-2 px-3">${Number(stat.totalRevenue).toLocaleString('es-CL')}</td>
                  </tr>
                ))}
                {stats.length === 0 && (
                  <tr><td colSpan={4} className="py-8 text-center text-muted-foreground">No hay referidos aún</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/** Ficha completa que se abre al tocar un embajador: nivel, progreso,
 * beneficios e historial de ventas. Usa el patrón de fila expandible de
 * OrdersView, que es el que ya usa el panel. */
export function AmbassadorProfileRow({ ambassadorId, eventId, deliveredKeys, onMarkBenefit, onUnmarkBenefit, marking, unmarking }: {
  ambassadorId: number;
  eventId: number;
  deliveredKeys: Set<string>;
  onMarkBenefit: (benefitKey: string) => void;
  onUnmarkBenefit: (benefitKey: string) => void;
  marking: boolean;
  unmarking: boolean;
}) {
  const { data } = trpc.ambassadors.getProfile.useQuery({ id: ambassadorId, eventId });
  const stats = data?.stats;
  const sales = data?.sales ?? [];

  if (!data) {
    return <tr className="border-b border-border/50 bg-muted/10"><td colSpan={10} className="py-3 px-3 text-xs text-muted-foreground">Cargando ficha…</td></tr>;
  }

  const progreso = stats?.nextTarget
    ? Math.min(100, Math.round((stats.eventSales / stats.nextTarget.target) * 100))
    : 100;

  return (
    <tr className="border-b border-border/50 bg-muted/10">
      <td colSpan={10} className="py-4 px-3">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
          <div className="p-3 rounded-xl bg-background border border-border">
            <p className="text-xs text-muted-foreground">Comisión actual</p>
            <p className="font-heading text-2xl">{stats?.currentPercent ?? 0}%</p>
            <p className="text-xs text-muted-foreground mt-1">
              {stats?.eventSales ?? 0} venta{(stats?.eventSales ?? 0) === 1 ? '' : 's'} a clientes exclusivos en este evento
            </p>
          </div>
          <div className="p-3 rounded-xl bg-background border border-border">
            <p className="text-xs text-muted-foreground">Próximo objetivo</p>
            {stats?.nextTarget ? (
              <>
                <p className="font-heading text-2xl">{stats.eventSales} / {stats.nextTarget.target}</p>
                <div className="w-full h-2 bg-muted rounded-full overflow-hidden mt-2">
                  <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${progreso}%` }} />
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Faltan {stats.nextTarget.salesNeeded} para subir al {stats.nextTarget.nextPercent}%
                </p>
              </>
            ) : (
              <p className="font-heading text-2xl">Nivel máximo 🏆</p>
            )}
          </div>
          <div className="p-3 rounded-xl bg-background border border-border">
            <p className="text-xs text-muted-foreground">Comisión acumulada (histórica)</p>
            <p className="font-heading text-2xl text-primary">${(stats?.totalCommission ?? 0).toLocaleString('es-CL')}</p>
            <p className="text-xs text-muted-foreground mt-1">
              {stats?.exclusiveClientsCount ?? 0} clientes exclusivos · {stats?.existingClientsCount ?? 0} existentes
            </p>
          </div>
        </div>

        {stats && stats.benefits.tiers.length > 0 && (
          <div className="mb-4">
            <p className="text-xs text-muted-foreground mb-1.5">Beneficios desbloqueados en este evento — marca los que ya le entregaste</p>
            <div className="space-y-2">
              {stats.benefits.tiers.map((t: any) => {
                const key = `tramo-${t.minSales}`;
                const entregado = deliveredKeys.has(key);
                return (
                  <div key={key} className={`flex flex-wrap items-center gap-2 p-2 rounded-xl border ${entregado ? 'bg-green-500/10 border-green-500/30' : 'bg-background border-border'}`}>
                    <span className="text-xs text-muted-foreground w-24 shrink-0">Desde {t.minSales} venta{t.minSales === 1 ? '' : 's'}</span>
                    <div className="flex flex-wrap gap-1.5 flex-1">
                      {t.items.map((b: string, i: number) => (
                        <span key={i} className="px-2 py-1 rounded-lg bg-primary/10 border border-primary/30 text-xs">{b}</span>
                      ))}
                      {t.bonusClp > 0 && (
                        <span className="px-2 py-1 rounded-lg bg-green-500/15 border border-green-500/30 text-xs font-semibold text-green-400">
                          Bono ${t.bonusClp.toLocaleString('es-CL')}
                        </span>
                      )}
                    </div>
                    <Button
                      size="sm"
                      variant={entregado ? 'outline' : 'default'}
                      disabled={marking || unmarking}
                      onClick={() => entregado
                        ? onUnmarkBenefit(key)
                        : onMarkBenefit(key)}
                    >
                      {entregado ? '✓ Entregado' : 'Marcar entregado'}
                    </Button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <p className="text-xs text-muted-foreground mb-1.5">Historial de ventas</p>
        {sales.length === 0 ? (
          <p className="text-xs text-muted-foreground">Todavía no tiene ventas registradas.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-1.5 px-2">Fecha</th>
                  <th className="text-left py-1.5 px-2">Evento</th>
                  <th className="text-left py-1.5 px-2">Cliente</th>
                  <th className="text-left py-1.5 px-2">Tipo</th>
                  <th className="text-left py-1.5 px-2">Código</th>
                  <th className="text-left py-1.5 px-2">Monto</th>
                  <th className="text-left py-1.5 px-2">%</th>
                  <th className="text-left py-1.5 px-2">Comisión</th>
                </tr>
              </thead>
              <tbody>
                {sales.map((s: any) => (
                  <tr key={s.id} className="border-b border-border/40">
                    <td className="py-1.5 px-2">{formatChileShortDate(s.createdAt)}</td>
                    <td className="py-1.5 px-2">{s.eventTitle}</td>
                    <td className="py-1.5 px-2">{s.customerName || s.customerEmail || '—'}</td>
                    <td className="py-1.5 px-2">
                      <span className={`px-1.5 py-0.5 rounded-full ${s.clientType === 'exclusivo' ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground'}`}>
                        {s.clientType === 'exclusivo' ? 'Exclusivo' : 'Existente'}
                      </span>
                    </td>
                    <td className="py-1.5 px-2 font-mono">{s.codeUsed || '—'}</td>
                    <td className="py-1.5 px-2">${s.baseAmount.toLocaleString('es-CL')}</td>
                    <td className="py-1.5 px-2">{s.commissionPercent}%</td>
                    <td className="py-1.5 px-2 font-semibold text-primary">${s.commissionAmount.toLocaleString('es-CL')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </td>
    </tr>
  );
}

export const AMBASSADOR_TABS = [
  { id: 'resumen', label: 'Resumen' },
  { id: 'embajadores', label: 'Embajadores' },
  { id: 'postulaciones', label: 'Postulaciones' },
  { id: 'ranking', label: 'Ranking' },
  { id: 'clientes', label: 'Clientes referidos' },
  { id: 'material', label: 'Material de la semana' },
  { id: 'config', label: 'Configuración' },
] as const;

export function AmbassadorsView() {
  const [tab, setTab] = useState<typeof AMBASSADOR_TABS[number]['id']>('resumen');
  // Cada evento es su propia campaña: el nivel, los beneficios y el ranking se miden por evento.
  const { data: allEvents } = trpc.events.listAll.useQuery();
  const { data: featured } = trpc.events.getActiveForCaja.useQuery();
  const [selectedEvent, setSelectedEvent] = useState<number | null>(null);
  const eventId = selectedEvent ?? featured?.id ?? allEvents?.[0]?.id ?? null;
  const { data: pendingApplications } = trpc.ambassadorApplications.countPending.useQuery(undefined, { refetchInterval: 60_000 });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-heading text-2xl">Embajadores VIP</h2>
          <p className="text-muted-foreground text-sm mt-1 max-w-3xl">
            Cada embajador tiene un código permanente. Las ventas a clientes que él trae (exclusivos) suben su comisión
            del 30% al 50% según cuántas haga en cada evento (cada evento parte de cero); las ventas a clientes que ya estaban en la base pagan un 10%
            fijo y no suben el nivel. Todo se calcula solo al aprobarse cada compra.
          </p>
        </div>
        {tab !== 'config' && tab !== 'clientes' && tab !== 'material' && tab !== 'postulaciones' && (
          <Select value={eventId ? String(eventId) : ''} onValueChange={(v) => setSelectedEvent(Number(v))}>
            <SelectTrigger className="w-64"><SelectValue placeholder="Elige un evento" /></SelectTrigger>
            <SelectContent>
              {(allEvents ?? []).map((e: any) => <SelectItem key={e.id} value={String(e.id)}>{e.title}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
      </div>

      <div className="flex flex-wrap gap-2 border-b border-border pb-3">
        {AMBASSADOR_TABS.map((t) => (
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

      {!eventId && ['resumen', 'embajadores', 'ranking'].includes(tab) && <p className="text-sm text-muted-foreground">Todavía no hay eventos cargados.</p>}
      {eventId && tab === 'resumen' && <AmbassadorSummaryTab eventId={eventId} />}
      {eventId && tab === 'embajadores' && <AmbassadorsListTab eventId={eventId} />}
      {tab === 'postulaciones' && <AmbassadorApplicationsTab />}
      {eventId && tab === 'ranking' && <AmbassadorRankingTab eventId={eventId} />}
      {tab === 'clientes' && <ReferredClientsTab />}
      {tab === 'material' && <WeeklyMaterialTab />}
      {tab === 'config' && <ProgramConfigTab />}
    </div>
  );
}

export function AmbassadorSummaryTab({ eventId }: { eventId: number }) {
  const { data } = trpc.ambassadors.getSummary.useQuery({ eventId }, { refetchInterval: 60_000 });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={Crown} colorClass="bg-[oklch(0.70_0.19_340)]" value={data?.activeAmbassadors ?? 0} label="Embajadores activos" />
        <StatCard icon={Ticket} colorClass="bg-[oklch(0.74_0.13_220)]" value={data?.eventSales ?? 0} label="Ventas del evento" />
        <StatCard icon={DollarSign} colorClass="bg-[oklch(0.75_0.15_230)]" value={`$${(data?.eventRevenue ?? 0).toLocaleString('es-CL')}`} label="Monto vendido" />
        <StatCard icon={Percent} colorClass="bg-[oklch(0.7_0.16_20)]" value={`$${(data?.eventCommission ?? 0).toLocaleString('es-CL')}`} label="Comisiones del evento" />
        <StatCard icon={Users} colorClass="bg-[oklch(0.72_0.14_150)]" value={data?.newClients ?? 0} label="Ventas a clientes nuevos" />
        <StatCard icon={Contact} colorClass="bg-[oklch(0.7_0.08_260)]" value={data?.existingClients ?? 0} label="Ventas a clientes existentes" />
        <StatCard icon={Gift} colorClass="bg-[oklch(0.74_0.13_90)]" value={data?.benefitsDelivered ?? 0} label="Beneficios entregados" />
      </div>

      <Card className="rounded-2xl border-0 shadow-md shadow-black/5">
        <CardHeader><CardTitle>Top embajador del evento</CardTitle></CardHeader>
        <CardContent>
          {data?.topAmbassador ? (
            <div className="flex items-baseline gap-3">
              <p className="font-heading text-3xl">{data.topAmbassador.name}</p>
              <p className="font-mono text-primary font-bold">{data.topAmbassador.code}</p>
              <p className="text-muted-foreground text-sm">
                {data.topAmbassador.exclusiveSales} venta{data.topAmbassador.exclusiveSales === 1 ? '' : 's'} a clientes propios
              </p>
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">Todavía nadie hizo ventas en este evento.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export function AmbassadorsListTab({ eventId }: { eventId: number }) {
  const { data: listData, refetch, isLoading: ambassadorsLoading } = trpc.ambassadors.listAll.useQuery();
  const { data: rankingData, refetch: refetchRanking } = trpc.ambassadors.getRanking.useQuery({ eventId });
  const ambassadors = listData ?? [];
  const statsById = new Map((rankingData ?? []).map((r: any) => [r.id, r]));

  const refreshAll = () => { refetch(); refetchRanking(); };

  const createAmbassador = trpc.ambassadors.create.useMutation({
    onSuccess: () => { refreshAll(); toast.success('Embajador creado'); setShowForm(false); setNewAmbassador({ name: '', code: '', commissionPercent: '', buyerDiscountPercent: '', contact: '', email: '' }); },
    onError: onMutationError,
  });
  const updateAmbassador = trpc.ambassadors.update.useMutation({ onSuccess: refreshAll, onError: onMutationError });
  const deleteAmbassador = trpc.ambassadors.delete.useMutation({ onSuccess: () => { refreshAll(); toast.success('Embajador eliminado'); }, onError: onMutationError });

  // Beneficios entregados del evento: se consultan una vez para toda la tabla y
  // se reparten por embajador, en vez de una consulta por ficha abierta.
  const { data: deliveriesData, refetch: refetchDeliveries } = trpc.ambassadors.listBenefitDeliveries.useQuery({ eventId });
  const deliveredByAmbassador = new Map<number, Set<string>>();
  for (const d of deliveriesData ?? []) {
    const set = deliveredByAmbassador.get(d.ambassadorId) ?? new Set<string>();
    set.add(d.benefitKey);
    deliveredByAmbassador.set(d.ambassadorId, set);
  }
  const markBenefit = trpc.ambassadors.markBenefitDelivered.useMutation({
    onSuccess: () => { refetchDeliveries(); toast.success('Beneficio marcado como entregado'); },
    onError: onMutationError,
  });
  const unmarkBenefit = trpc.ambassadors.unmarkBenefitDelivered.useMutation({
    onSuccess: () => { refetchDeliveries(); toast.success('Se deshizo la entrega'); },
    onError: onMutationError,
  });

  const [showForm, setShowForm] = useState(false);
  const [newAmbassador, setNewAmbassador] = useState({ name: '', code: '', commissionPercent: '', buyerDiscountPercent: '', contact: '', email: '' });
  const [search, setSearch] = useState('');
  const [estado, setEstado] = useState<'all' | 'active' | 'inactive'>('all');
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const visibles = ambassadors.filter((a: any) => {
    if (estado === 'active' && !a.active) return false;
    if (estado === 'inactive' && a.active) return false;
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return a.name.toLowerCase().includes(q) || a.code.toLowerCase().includes(q) || (a.email ?? '').toLowerCase().includes(q);
  });

  const handleCreate = async () => {
    if (!newAmbassador.name || !newAmbassador.code) return;
    try {
      await createAmbassador.mutateAsync({
        name: newAmbassador.name,
        code: newAmbassador.code.toUpperCase(),
        commissionPercent: newAmbassador.commissionPercent.trim() === '' ? null : Number(newAmbassador.commissionPercent) || 0,
        buyerDiscountPercent: Number(newAmbassador.buyerDiscountPercent) > 0 ? Number(newAmbassador.buyerDiscountPercent) : null,
        contact: newAmbassador.contact || undefined,
        email: newAmbassador.email || undefined,
      });
    } catch {
      // onMutationError ya avisó; el formulario queda abierto para reintentar.
    }
  };

  const totalComision = visibles.reduce((sum: number, a: any) => sum + (statsById.get(a.id)?.eventCommission ?? 0), 0);
  const totalVendido = visibles.reduce((sum: number, a: any) => sum + (statsById.get(a.id)?.eventRevenue ?? 0), 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por nombre, código o correo…" className="max-w-xs" />
        <Select value={estado} onValueChange={(v) => setEstado(v as typeof estado)}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="active">Solo activos</SelectItem>
            <SelectItem value="inactive">Solo inactivos</SelectItem>
          </SelectContent>
        </Select>
        <Button onClick={() => setShowForm(!showForm)} className="interactive ml-auto"><Plus className="w-4 h-4 mr-2" /> Nuevo Embajador</Button>
      </div>

      {showForm && (
        <Card className="rounded-2xl border-0 shadow-md shadow-black/5">
          <CardContent className="pt-6 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
              <div><Label>Nombre</Label><Input value={newAmbassador.name} onChange={(e) => setNewAmbassador({ ...newAmbassador, name: e.target.value })} className="mt-1" /></div>
              <div><Label>Código</Label><Input value={newAmbassador.code} onChange={(e) => setNewAmbassador({ ...newAmbassador, code: e.target.value.toUpperCase() })} className="mt-1 font-mono" placeholder="SOFIA" /></div>
              <div>
                <Label>% fijo (opcional)</Label>
                <Input type="number" value={newAmbassador.commissionPercent} onChange={(e) => setNewAmbassador({ ...newAmbassador, commissionPercent: e.target.value })} className="mt-1" placeholder="Escala" />
              </div>
              <div>
                <Label>Descuento al comprador %</Label>
                <Input type="number" min={0} max={MAX_AMBASSADOR_BUYER_DISCOUNT} value={newAmbassador.buyerDiscountPercent} onChange={(e) => setNewAmbassador({ ...newAmbassador, buyerDiscountPercent: e.target.value })} className="mt-1" placeholder="Sin descuento" />
              </div>
              <div><Label>Correo</Label><Input value={newAmbassador.email} onChange={(e) => setNewAmbassador({ ...newAmbassador, email: e.target.value })} className="mt-1" placeholder="Para el correo semanal" /></div>
              <div><Label>Contacto (opcional)</Label><Input value={newAmbassador.contact} onChange={(e) => setNewAmbassador({ ...newAmbassador, contact: e.target.value })} className="mt-1" placeholder="Teléfono o Instagram" /></div>
            </div>
            <p className="text-xs text-muted-foreground">
              «Descuento al comprador»: % que se descuenta del acceso (nunca de los extras) a quien compra con el código o link de este embajador (máx. {MAX_AMBASSADOR_BUYER_DISCOUNT}%). Si el comprador además trae un código de descuento, se aplica el mayor, no se suman; la comisión se calcula sobre lo que pagó. Deja el "% fijo" vacío para que use la escala del programa (30% a 50% según sus ventas del evento). Solo
              ponle un número si ese embajador tiene un trato distinto al resto.
            </p>
            <div className="flex gap-2">
              <WriteButton onClick={handleCreate} disabled={!newAmbassador.name || !newAmbassador.code || createAmbassador.isPending}>Crear Embajador</WriteButton>
              <Button variant="outline" onClick={() => setShowForm(false)}>Cancelar</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="rounded-2xl border-0 shadow-md shadow-black/5">
        <CardContent className="pt-6">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 px-3">Embajador</th>
                  <th className="text-left py-2 px-3">Código</th>
                  <th className="text-left py-2 px-3">% Comisión</th>
                  <th className="text-left py-2 px-3">Desc. comprador</th>
                  <th className="text-left py-2 px-3">Ventas del evento</th>
                  <th className="text-left py-2 px-3">Monto vendido</th>
                  <th className="text-left py-2 px-3">Comisión del evento</th>
                  <th className="text-left py-2 px-3">Correo</th>
                  <th className="text-left py-2 px-3">Contacto</th>
                  <th className="text-left py-2 px-3">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {visibles.map((a: any) => (
                  <Fragment key={a.id}>
                    <AmbassadorRow
                      ambassador={a}
                      stats={statsById.get(a.id)}
                      expanded={expandedId === a.id}
                      onToggleExpand={() => setExpandedId(expandedId === a.id ? null : a.id)}
                      updating={updateAmbassador.isPending}
                      deleting={deleteAmbassador.isPending}
                      onUpdate={(data) => updateAmbassador.mutateAsync({ id: a.id, ...data })}
                      onDelete={(adminPassword) => deleteAmbassador.mutateAsync({ id: a.id, adminPassword })}
                    />
                    {expandedId === a.id && (
                      <AmbassadorProfileRow
                        ambassadorId={a.id}
                        eventId={eventId}
                        deliveredKeys={deliveredByAmbassador.get(a.id) ?? new Set()}
                        onMarkBenefit={(benefitKey) => markBenefit.mutate({ ambassadorId: a.id, eventId, benefitKey })}
                        onUnmarkBenefit={(benefitKey) => unmarkBenefit.mutate({ ambassadorId: a.id, eventId, benefitKey })}
                        marking={markBenefit.isPending}
                        unmarking={unmarkBenefit.isPending}
                      />
                    )}
                  </Fragment>
                ))}
                {visibles.length === 0 && (
                  <tr><td colSpan={10} className="py-8 text-center text-muted-foreground">
                    {ambassadorsLoading ? 'Cargando…' : ambassadors.length === 0 ? 'Sin embajadores todavía. Crea el primero con el botón de arriba.' : 'Ningún embajador coincide con el filtro.'}
                  </td></tr>
                )}
              </tbody>
              {visibles.length > 0 && (
                <tfoot>
                  <tr className="border-t border-border font-semibold">
                    <td colSpan={5} className="py-2 px-3 text-right">Total del evento</td>
                    <td className="py-2 px-3">${totalVendido.toLocaleString('es-CL')}</td>
                    <td className="py-2 px-3 text-primary">${totalComision.toLocaleString('es-CL')}</td>
                    <td colSpan={3}></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export function AmbassadorRankingTab({ eventId }: { eventId: number }) {
  const { data } = trpc.ambassadors.getRanking.useQuery({ eventId });
  const ranking = (data ?? []).filter((r: any) => r.exclusiveSales > 0 || r.existingSales > 0);
  const MEDALLAS = ['🥇', '🥈', '🥉'];

  return (
    <Card className="rounded-2xl border-0 shadow-md shadow-black/5">
      <CardContent className="pt-6">
        <p className="text-muted-foreground text-sm mb-4">
          Ordenado por cantidad de ventas a clientes exclusivos, no por dinero.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-2 px-3">#</th>
                <th className="text-left py-2 px-3">Embajador</th>
                <th className="text-left py-2 px-3">Ventas exclusivas</th>
                <th className="text-left py-2 px-3">Monto vendido</th>
                <th className="text-left py-2 px-3">Comisión del evento</th>
                <th className="text-left py-2 px-3">Comisión acumulada</th>
              </tr>
            </thead>
            <tbody>
              {ranking.map((r: any, i: number) => (
                <tr key={r.id} className={`border-b border-border/50 ${i < 3 ? 'bg-primary/5' : ''}`}>
                  <td className="py-2 px-3 font-bold">{MEDALLAS[i] ?? r.position}</td>
                  <td className="py-2 px-3">
                    {r.name} <span className="font-mono text-primary text-xs">{r.code}</span>
                  </td>
                  <td className="py-2 px-3 font-semibold">{r.exclusiveSales}</td>
                  <td className="py-2 px-3">${r.eventRevenue.toLocaleString('es-CL')}</td>
                  <td className="py-2 px-3 text-primary font-semibold">${r.eventCommission.toLocaleString('es-CL')}</td>
                  <td className="py-2 px-3 text-muted-foreground">${r.totalCommission.toLocaleString('es-CL')}</td>
                </tr>
              ))}
              {ranking.length === 0 && (
                <tr><td colSpan={6} className="py-8 text-center text-muted-foreground">Sin ventas de embajadores en este evento.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

export function ReferredClientsTab() {
  const { data } = trpc.ambassadors.listReferredClients.useQuery();
  const clientes = data ?? [];
  const [search, setSearch] = useState('');

  const visibles = clientes.filter((c: any) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return c.customerEmail.toLowerCase().includes(q) || c.ambassadorName.toLowerCase().includes(q);
  });

  return (
    <div className="space-y-4">
      <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por cliente o embajador…" className="max-w-xs" />
      <Card className="rounded-2xl border-0 shadow-md shadow-black/5">
        <CardContent className="pt-6">
          <p className="text-muted-foreground text-sm mb-4">
            Los <strong>exclusivos</strong> son propiedad permanente de su embajador: todas sus compras futuras le pagan.
            Los <strong>existentes</strong> ya estaban en la base antes del programa y nunca cambian de dueño.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 px-3">Cliente</th>
                  <th className="text-left py-2 px-3">Embajador</th>
                  <th className="text-left py-2 px-3">Primera compra</th>
                  <th className="text-left py-2 px-3">Compras</th>
                  <th className="text-left py-2 px-3">Monto total</th>
                  <th className="text-left py-2 px-3">Estado</th>
                </tr>
              </thead>
              <tbody>
                {visibles.map((c: any, i: number) => (
                  <tr key={`${c.customerEmail}-${i}`} className="border-b border-border/50">
                    <td className="py-2 px-3">{c.customerEmail}</td>
                    <td className="py-2 px-3">{c.ambassadorName}</td>
                    <td className="py-2 px-3">{formatChileShortDate(c.firstPurchaseAt)}</td>
                    <td className="py-2 px-3">{c.ordersCount}</td>
                    <td className="py-2 px-3">${c.totalSpent.toLocaleString('es-CL')}</td>
                    <td className="py-2 px-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs ${c.clientType === 'exclusivo' ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground'}`}>
                        {c.clientType === 'exclusivo' ? 'Cliente Exclusivo' : 'Cliente Existente'}
                      </span>
                    </td>
                  </tr>
                ))}
                {visibles.length === 0 && (
                  <tr><td colSpan={6} className="py-8 text-center text-muted-foreground">Sin clientes referidos todavía.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/** Material que va en el correo semanal de los embajadores. Si no hay nada
 * cargado, el correo omite esa sección en vez de mandar un bloque vacío. */
export function WeeklyMaterialTab() {
  const { data, refetch } = trpc.ambassadors.getWeeklyMaterial.useQuery();
  const save = trpc.ambassadors.saveWeeklyMaterial.useMutation({
    onSuccess: () => { refetch(); toast.success('Material de la semana guardado'); },
    onError: onMutationError,
  });
  const sendNow = trpc.ambassadors.sendWeeklyNow.useMutation({
    onSuccess: (r: any) => toast.success(`Correos enviados: ${r.sent}. Sin correo cargado: ${r.skipped}. Con error: ${r.failed}.`),
    onError: onMutationError,
  });

  const [form, setForm] = useState({ title: '', storiesText: '', reelText: '', postText: '', countdownText: '' });
  const [links, setLinks] = useState<{ label: string; url: string }[]>([]);
  // Carpeta de Drive del material y las fotos/videos elegidos para el correo.
  const [driveUrl, setDriveUrl] = useState('');
  const [images, setImages] = useState<{ id: string; name: string; mimeType: string }[]>([]);
  const [driveFiles, setDriveFiles] = useState<{ id: string; name: string; mimeType: string; thumbUrl: string }[]>([]);
  const utils = trpc.useUtils();
  const [loadingDrive, setLoadingDrive] = useState(false);
  const cargarDrive = async (): Promise<typeof driveFiles> => {
    if (!driveUrl.trim()) { toast.error('Pega primero el link de la carpeta de Drive'); return []; }
    setLoadingDrive(true);
    try {
      const files = await utils.ambassadors.listDriveMedia.fetch({ url: driveUrl.trim() });
      setDriveFiles(files);
      return files;
    } catch (err) {
      onMutationError(err as any);
      return [];
    } finally {
      setLoadingDrive(false);
    }
  };
  const toggleImage = (f: { id: string; name: string; mimeType: string }) =>
    setImages((prev) => prev.some((x) => x.id === f.id)
      ? prev.filter((x) => x.id !== f.id)
      : prev.length >= 6 ? prev : [...prev, { id: f.id, name: f.name, mimeType: f.mimeType }]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!data || loaded) return;
    setDriveUrl((data as any).driveFolderUrl ?? '');
    setImages(Array.isArray((data as any).images) ? (data as any).images : []);
    setForm({
      title: data.title ?? '',
      storiesText: data.storiesText ?? '',
      reelText: data.reelText ?? '',
      postText: data.postText ?? '',
      countdownText: data.countdownText ?? '',
    });
    // Compatibilidad con filas guardadas antes de que existiera `links`: si
    // no hay ninguno pero sí quedó el `linkUrl` de antes, arranca con ese
    // como primera fila en vez de vacío.
    const existingLinks = Array.isArray((data as any).links) ? (data as any).links : [];
    setLinks(existingLinks.length > 0
      ? existingLinks
      : (data.linkUrl ? [{ label: 'Material', url: data.linkUrl }] : []));
    setLoaded(true);
  }, [data, loaded]);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm({ ...form, [k]: e.target.value });

  const updateLink = (i: number, field: 'label' | 'url', value: string) =>
    setLinks(links.map((l, idx) => (idx === i ? { ...l, [field]: value } : l)));
  const addLink = () => setLinks([...links, { label: '', url: '' }]);
  const removeLink = (i: number) => setLinks(links.filter((_, idx) => idx !== i));

  // Generación con IA: rellena los campos pero NO guarda -- el dueño revisa y
  // edita antes de apretar "Guardar", igual que en el compositor de mailing.
  const [idea, setIdea] = useState('');
  const generar = trpc.ambassadors.generateWeeklyMaterial.useMutation({
    onSuccess: (c) => {
      setForm((prev) => ({
        ...prev,
        title: c.title,
        storiesText: c.storiesText,
        reelText: c.reelText,
        postText: c.postText,
        countdownText: c.countdownText,
      }));
      // La IA eligió fotos de la carpeta: quedan pre-marcadas (se pueden cambiar).
      if (c.imageIds?.length) {
        setImages(c.imageIds
          .map((id: string) => driveFiles.find((f) => f.id === id))
          .filter((f): f is NonNullable<typeof f> => !!f)
          .map((f) => ({ id: f.id, name: f.name, mimeType: f.mimeType })));
      }
      setLoaded(true); // que la carga del material guardado no pise lo generado
      toast.success('Material generado — revísalo y edita lo que quieras antes de guardar');
    },
    onError: onMutationError,
  });

  return (
    <div className="space-y-6">
      <Card className="rounded-2xl border-0 shadow-md shadow-black/5">
        <CardHeader><CardTitle>Material de esta semana</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground text-sm">
            Lo que escribas acá va en el correo semanal de todos los embajadores. Deja en blanco lo que no quieras
            incluir. Si dejas la cuenta regresiva vacía, el correo la arma solo con los días que faltan para el próximo
            evento destacado.
          </p>

          <div className="rounded-xl border border-border bg-muted/20 p-3 space-y-2">
            <Label>¿De qué va la semana?</Label>
            <div className="flex flex-col sm:flex-row gap-2">
              <Input
                value={idea}
                onChange={(e) => setIdea(e.target.value)}
                placeholder="Ej: se confirmó el line-up y quedan pocas entradas de preventa"
              />
              <WriteButton
                type="button"
                variant="outline"
                className="interactive shrink-0"
                disabled={idea.trim().length < 5 || generar.isPending}
                onClick={async () => {
                  // Si hay carpeta, se lee antes para que la IA elija entre sus archivos.
                  if (driveUrl.trim() && driveFiles.length === 0) await cargarDrive();
                  generar.mutate({ idea: idea.trim(), driveFolderUrl: driveUrl.trim() || undefined });
                }}
              >
                {generar.isPending ? 'Generando…' : 'Generar con IA'}
              </WriteButton>
            </div>
            <p className="text-xs text-muted-foreground">
              Genera 3 pasos cortos y simples (historia, reel o foto, publicación) y, si pegaste una carpeta de Drive,
              elige las fotos. No guarda nada: revisa el texto y aprieta "Guardar material".
            </p>
          </div>
          <div><Label>Título (opcional)</Label><Input value={form.title} onChange={set('title')} className="mt-1" placeholder="Ej: Semana 1 — lanzamiento de Candyland" /></div>
          <div><Label>Historias</Label><Textarea value={form.storiesText} onChange={set('storiesText')} className="mt-1" rows={2} placeholder="Paso 1: qué subir en historias" /></div>
          <div><Label>Reel</Label><Textarea value={form.reelText} onChange={set('reelText')} className="mt-1" rows={2} placeholder="Idea del reel" /></div>
          <div><Label>Publicación</Label><Textarea value={form.postText} onChange={set('postText')} className="mt-1" rows={2} placeholder="Texto sugerido para el post" /></div>
          <div><Label>Cuenta regresiva</Label><Input value={form.countdownText} onChange={set('countdownText')} className="mt-1" placeholder="Se arma sola si lo dejas vacío" /></div>
          <div className="space-y-2">
            <Label>📸 Fotos y videos del Drive (opcional)</Label>
            <p className="text-xs text-muted-foreground">
              Pega el link de la carpeta (compartida como "Cualquier persona con el enlace"). Elige hasta 6: el correo
              las muestra con un botón de descarga para cada embajador.
            </p>
            <div className="flex flex-col sm:flex-row gap-2">
              <Input value={driveUrl} onChange={(e) => setDriveUrl(e.target.value)} placeholder="https://drive.google.com/drive/folders/..." className="flex-1" />
              <WriteButton type="button" variant="outline" className="interactive shrink-0" onClick={cargarDrive} disabled={loadingDrive || !driveUrl.trim()}>
                {loadingDrive ? 'Cargando…' : 'Cargar imágenes'}
              </WriteButton>
            </div>
            {driveFiles.length > 0 && (
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
                {driveFiles.map((f) => {
                  const selected = images.some((x) => x.id === f.id);
                  return (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => toggleImage(f)}
                      aria-pressed={selected}
                      title={f.name}
                      className={`relative aspect-square rounded-xl overflow-hidden border-2 ${selected ? 'border-primary' : 'border-transparent opacity-70 hover:opacity-100'}`}
                    >
                      <img src={f.thumbUrl} alt={f.name} className="w-full h-full object-cover" loading="lazy" />
                      {selected && <span className="absolute top-1 right-1 bg-primary text-primary-foreground text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center">✓</span>}
                    </button>
                  );
                })}
              </div>
            )}
            {images.length > 0 && <p className="text-xs text-muted-foreground">{images.length} seleccionada{images.length === 1 ? '' : 's'} de 6.</p>}
          </div>
          <div className="space-y-2">
            <Label>Links (opcional)</Label>
            <p className="text-xs text-muted-foreground">
              Cuantos necesites -- ej. la carpeta de Drive con las fotos/videos, un doc de instrucciones, lo que sea.
            </p>
            {links.map((l, i) => (
              <div key={i} className="flex gap-2 items-start">
                <Input
                  value={l.label}
                  onChange={(e) => updateLink(i, 'label', e.target.value)}
                  placeholder="Texto (ej. 📂 Carpeta de Drive)"
                  className="w-48 shrink-0"
                />
                <Input
                  value={l.url}
                  onChange={(e) => updateLink(i, 'url', e.target.value)}
                  placeholder="https://..."
                  className="flex-1"
                />
                <Button type="button" variant="ghost" size="icon" onClick={() => removeLink(i)} className="shrink-0">
                  <X className="w-4 h-4" />
                </Button>
              </div>
            ))}
            <Button type="button" variant="outline" size="sm" onClick={addLink} className="interactive">
              <Plus className="w-3.5 h-3.5 mr-1" /> Agregar link
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            <WriteButton
              onClick={() => save.mutate({ ...form, links: links.filter((l) => l.url.trim()), driveFolderUrl: driveUrl.trim() || undefined, images })}
              disabled={save.isPending}
              className="interactive"
            >
              {save.isPending ? 'Guardando…' : 'Guardar material'}
            </WriteButton>
            <WriteButton variant="outline" onClick={() => sendNow.mutate()} disabled={sendNow.isPending}>
              {sendNow.isPending ? 'Enviando…' : 'Enviar el correo ahora'}
            </WriteButton>
          </div>
          <p className="text-xs text-muted-foreground">
            "Enviar ahora" manda el resumen a todos los embajadores activos que tengan correo cargado, sin esperar al
            día configurado. Sirve para probarlo o para reenviarlo si un envío falló.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
