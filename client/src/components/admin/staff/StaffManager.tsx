import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { KeyRound, Link2, Mail, Pencil, Trash2, UserPlus, Users } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { useIsDemo, DEMO_TOOLTIP } from '@/lib/demoMode';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { EmptyState } from '@/components/admin/EmptyState';
import { useStaffSchema } from '@/components/admin/SchemaUpdateBanner';
import { TableSkeleton } from '@/components/admin/TableSkeleton';
import { STAFF_CARGOS, cargoDef, cargoTitle, type StaffCargo } from '@shared/staffCargos';
import { OPERATOR_ROLE_LABELS } from '@shared/cajaRoles';

/* La ficha única del staff (Admin → Noche → Staff): una persona, un cargo y su
 * correo. Con el correo le llega la invitación a su app, donde crea su propio
 * PIN; el cargo decide a qué pantalla entra (shared/staffCargos.ts). Los pagos
 * por noche siguen en Finanzas → Staff de la noche. */

const money = (n: number) => `$${Math.round(n).toLocaleString('es-CL')}`;
const onErr = (e: unknown) => toast.error((e as { message?: string })?.message || 'No se pudo completar la acción');
const pill = 'rounded-full px-4 py-1.5 text-sm font-semibold transition active:scale-95 disabled:opacity-60';
const pillOn = 'bg-pink-500 text-white shadow-sm';
const pillOff = 'bg-black/5 text-[var(--admin-muted)] hover:bg-black/10';

type Form = { name: string; cargo: StaffCargo | ''; role: string; email: string; phone: string; rut: string; rate: string; notes: string };
const EMPTY: Form = { name: '', cargo: '', role: '', email: '', phone: '', rut: '', rate: '', notes: '' };

function CargoPicker({ value, onChange }: { value: StaffCargo | ''; onChange: (v: StaffCargo) => void }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
      {STAFF_CARGOS.map((c) => (
        <button key={c.key} type="button" onClick={() => onChange(c.key)} aria-pressed={value === c.key}
          className={`flex flex-col items-center gap-1 rounded-2xl px-2 py-3 text-center text-xs font-semibold transition active:scale-95 ${value === c.key ? 'bg-pink-500 text-white shadow-sm' : 'bg-black/5 hover:bg-black/10'}`}>
          <span className="text-xl" aria-hidden>{c.emoji}</span>
          <span className="leading-tight">{c.label}</span>
        </button>
      ))}
    </div>
  );
}

function StaffForm({ initial, id, onDone }: { initial: Form; id?: number; onDone: () => void }) {
  const isDemo = useIsDemo();
  const utils = trpc.useUtils();
  const [f, setF] = useState<Form>(initial);
  const save = trpc.finance.staffSave.useMutation({
    onSuccess: (r) => {
      utils.finance.staffList.invalidate(); utils.finance.shiftsList.invalidate();
      toast.success(r.invited ? 'Guardado · le llegó la invitación para entrar a su app y crear su PIN' : 'Staff guardado');
      onDone();
    },
    onError: onErr,
  });
  const def = cargoDef(f.cargo);
  const submit = () => save.mutate({
    id, name: f.name.trim(), cargo: f.cargo || null,
    // Título visible: lo escrito, o nada (se muestra el nombre del cargo).
    role: f.role.trim() || null,
    email: f.email.trim() || null, phone: f.phone.trim() || null, rut: f.rut.trim() || null,
    defaultRateClp: Math.max(0, Math.round(Number(f.rate) || 0)), notes: f.notes.trim() || null,
  });
  return (
    <div className="admin-clay-sm space-y-3 p-4">
      <div className="grid gap-2 sm:grid-cols-2">
        <Input placeholder="Nombre *" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        <Input type="email" inputMode="email" autoCapitalize="none" placeholder="Correo (para su app y su PIN)" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
      </div>
      <div className="space-y-2">
        <p className="text-xs font-semibold text-[var(--admin-muted)]">Cargo</p>
        <CargoPicker value={f.cargo} onChange={(cargo) => setF({ ...f, cargo })} />
        {def && <p className="text-xs text-[var(--admin-muted)]">{def.hint}{def.operatorRole ? ' Entra con el PIN que crea en su app.' : ''}</p>}
        {(f.cargo === 'otro' || f.role) && (
          <Input placeholder={f.cargo === 'otro' ? 'Escribe el cargo (ej: Maquillaje)' : 'Título que se muestra (opcional)'} value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })} />
        )}
      </div>
      <div className="grid gap-2 sm:grid-cols-4">
        <Input type="tel" placeholder="Teléfono" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
        <Input placeholder="RUT" value={f.rut} onChange={(e) => setF({ ...f, rut: e.target.value })} />
        <Input type="number" inputMode="numeric" placeholder="Tarifa por noche $" value={f.rate} onChange={(e) => setF({ ...f, rate: e.target.value })} />
        <Input placeholder="Notas" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />
      </div>
      <div className="flex gap-2">
        <button type="button" disabled={!f.name.trim() || !f.cargo || save.isPending || isDemo} title={isDemo ? DEMO_TOOLTIP : undefined} onClick={submit} className={`${pill} bg-emerald-500 px-6 py-2 text-white`}>
          {save.isPending ? 'Guardando…' : id ? 'Guardar' : 'Agregar al staff'}
        </button>
        <button type="button" onClick={onDone} className={`${pill} ${pillOff}`}>Cancelar</button>
      </div>
    </div>
  );
}

function PinBadge({ m }: { m: any }) {
  if (!cargoDef(m.cargo)?.operatorRole) return null;
  if (m.hasPin) return <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">PIN creado</span>;
  return <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-[11px] font-semibold text-amber-800">{m.email ? 'Sin PIN todavía' : 'Falta correo'}</span>;
}

/** Operadores creados a mano antes de la ficha única que no calzaron con nadie (ni por correo ni por nombre). */
function UnlinkedOperators({ team }: { team: any[] }) {
  const isDemo = useIsDemo();
  const utils = trpc.useUtils();
  const { data: events } = trpc.events.listAll.useQuery();
  const upcomingIds = useMemo(() => {
    const cutoff = Date.now() - 2 * 86_400_000;
    return (events ?? []).filter((e: any) => e.eventDate && new Date(e.eventDate).getTime() >= cutoff).map((e: any) => e.id as number).slice(0, 20);
  }, [events]);
  const { data: loose } = trpc.finance.staffUnlinkedOperators.useQuery({ eventIds: upcomingIds }, { enabled: upcomingIds.length > 0 });
  const link = trpc.finance.staffLinkOperator.useMutation({ onSuccess: () => { utils.finance.staffUnlinkedOperators.invalidate(); toast.success('Enlazado'); }, onError: onErr });
  if (!loose?.length) return null;
  const titleOf = (id: number) => (events ?? []).find((e: any) => e.id === id)?.title ?? `Evento ${id}`;
  return (
    <div className="space-y-2 rounded-2xl border border-amber-500/30 bg-amber-500/5 p-3">
      <p className="flex items-center gap-2 text-sm font-semibold"><Link2 className="h-4 w-4" /> Revisar enlaces ({loose.length})</p>
      <p className="text-xs text-[var(--admin-muted)]">Estos accesos se crearon a mano y no calzaron con nadie del staff. Elige a quién pertenecen para que usen su PIN y su app.</p>
      {loose.map((op: any) => (
        <div key={op.id} className="flex flex-wrap items-center gap-2">
          <span className="min-w-[10rem] flex-1 text-sm">{op.name} <span className="text-xs text-[var(--admin-muted)]">· {OPERATOR_ROLE_LABELS[op.role] ?? op.role} · {titleOf(op.eventId)}</span></span>
          <div className="w-56">
            <Select disabled={isDemo || link.isPending} onValueChange={(v) => link.mutate({ operatorId: op.id, staffId: Number(v) })}>
              <SelectTrigger><SelectValue placeholder="¿Quién es?" /></SelectTrigger>
              <SelectContent>
                {team.filter((m) => m.active).map((m) => <SelectItem key={m.id} value={String(m.id)}>{m.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
      ))}
    </div>
  );
}

/* El atajo «Agregar staff» del «+» (celular) abre la sección con el formulario ya abierto. */
let openNewOnMount = false;
export function requestNewStaff() { openNewOnMount = true; }

export function StaffManager() {
  const isDemo = useIsDemo();
  const utils = trpc.useUtils();
  const { ready: schemaReady } = useStaffSchema();
  const { data: team, isLoading } = trpc.finance.staffList.useQuery();
  const [editing, setEditing] = useState<number | 'new' | null>(() => {
    if (!openNewOnMount) return null;
    openNewOnMount = false;
    return 'new';
  });
  const [filter, setFilter] = useState<StaffCargo | 'todos'>('todos');
  const [showArchived, setShowArchived] = useState(false);
  const invite = trpc.finance.staffInvite.useMutation({ onSuccess: () => toast.success('Invitación enviada'), onError: onErr });
  const resetPin = trpc.finance.staffResetPin.useMutation({
    onSuccess: (r) => { utils.finance.staffList.invalidate(); toast.success(r.sent ? 'PIN borrado · le llegó el correo para crear uno nuevo' : 'PIN borrado'); },
    onError: onErr,
  });
  const save = trpc.finance.staffSave.useMutation({ onSuccess: () => utils.finance.staffList.invalidate(), onError: onErr });
  const del = trpc.finance.staffDelete.useMutation({
    onSuccess: (r) => { utils.finance.staffList.invalidate(); toast.success(r.archived ? 'Tiene historial: quedó archivado' : 'Persona eliminada'); },
    onError: onErr,
  });

  const all: any[] = team ?? [];
  const list = all.filter((m) => (showArchived || m.active) && (filter === 'todos' || m.cargo === filter));
  const counts = useMemo(() => {
    const c = new Map<string, number>();
    for (const m of all) if (m.active && m.cargo) c.set(m.cargo, (c.get(m.cargo) ?? 0) + 1);
    return c;
  }, [all]);
  const pendingPin = all.filter((m) => m.active && cargoDef(m.cargo)?.operatorRole && !m.hasPin).length;

  const toForm = (m: any): Form => ({ name: m.name, cargo: m.cargo ?? '', role: m.role ?? '', email: m.email ?? '', phone: m.phone ?? '', rut: m.rut ?? '', rate: String(m.defaultRateClp || ''), notes: m.notes ?? '' });

  return (
    <Card className="admin-clay border-0">
      <CardHeader className="space-y-1">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2"><Users className="h-5 w-5" /> Staff</CardTitle>
          {editing !== 'new' && (
            <button type="button" disabled={isDemo || !schemaReady} title={isDemo ? DEMO_TOOLTIP : !schemaReady ? 'Primero actualiza la base de datos (aviso de arriba)' : undefined} onClick={() => setEditing('new')} className={`${pill} ${pillOn} flex items-center gap-1.5 px-5 py-2`}>
              <UserPlus className="h-4 w-4" /> Agregar staff
            </button>
          )}
        </div>
        <p className="text-sm text-[var(--admin-muted)]">
          Una ficha por persona. Con su correo le llega la invitación a su app, donde crea su PIN; su cargo decide a qué pantalla entra.
          Para asignarlos a una noche y pagarles: Finanzas → Staff de la noche.
        </p>
        {pendingPin > 0 && <p className="text-xs font-semibold text-amber-700">{pendingPin} {pendingPin === 1 ? 'persona todavía no crea' : 'personas todavía no crean'} su PIN.</p>}
      </CardHeader>
      <CardContent className="space-y-4">
        {editing === 'new' && <StaffForm initial={EMPTY} onDone={() => setEditing(null)} />}

        <div className="flex flex-wrap gap-1.5">
          <button type="button" onClick={() => setFilter('todos')} className={`${pill} ${filter === 'todos' ? pillOn : pillOff}`}>Todos ({all.filter((m) => m.active).length})</button>
          {STAFF_CARGOS.filter((c) => counts.get(c.key)).map((c) => (
            <button key={c.key} type="button" onClick={() => setFilter(c.key)} className={`${pill} ${filter === c.key ? pillOn : pillOff}`}>{c.emoji} {c.label} ({counts.get(c.key)})</button>
          ))}
          <label className="ml-auto flex items-center gap-1.5 text-xs text-[var(--admin-muted)]">
            <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} /> Ver archivados
          </label>
        </div>

        {isLoading && <TableSkeleton rows={4} />}
        {!isLoading && list.length === 0 && editing !== 'new' && (
          <EmptyState icon={Users} title={all.length === 0 ? 'Todavía no hay nadie en el staff' : 'Nadie con ese cargo'} description="Agrega a cada persona una sola vez: sirve para todas las fiestas." />
        )}

        <div className="space-y-2">
          {list.map((m) => editing === m.id ? <StaffForm key={m.id} id={m.id} initial={toForm(m)} onDone={() => setEditing(null)} /> : (
            <div key={m.id} className={`admin-clay-sm flex flex-wrap items-center gap-3 p-3 ${m.active ? '' : 'opacity-60'}`}>
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-black/5 text-xl" aria-hidden>{cargoDef(m.cargo)?.emoji ?? '👤'}</span>
              <div className="min-w-[10rem] flex-1">
                <p className="flex flex-wrap items-center gap-2 font-medium">{m.name} <PinBadge m={m} /> {!m.active && <span className="text-xs text-[var(--admin-muted)]">(archivado)</span>}</p>
                <p className="text-xs text-[var(--admin-muted)]">
                  {[cargoTitle(m.cargo, m.role), m.defaultRateClp ? `tarifa ${money(m.defaultRateClp)}` : null, m.phone, m.email].filter(Boolean).join(' · ')}
                </p>
                {m.notes && <p className="text-xs text-[var(--admin-muted)]">{m.notes}</p>}
              </div>
              {m.email && m.active && (
                <button type="button" disabled={isDemo || invite.isPending} onClick={() => invite.mutate({ id: m.id })} className={`${pill} ${pillOff} flex items-center gap-1`} title={`Manda otra vez la invitación a ${m.email}`}>
                  <Mail className="h-3.5 w-3.5" /> Reenviar
                </button>
              )}
              {m.hasPin && m.active && (
                <button type="button" disabled={isDemo || resetPin.isPending} className={`${pill} ${pillOff} flex items-center gap-1`} title="Si olvidó su PIN: se borra y le llega el correo para crear uno nuevo"
                  onClick={() => { if (window.confirm(`¿Borrar el PIN de ${m.name}? No podrá entrar a su pantalla hasta que cree uno nuevo en su app.`)) resetPin.mutate({ id: m.id }); }}>
                  <KeyRound className="h-3.5 w-3.5" /> Borrar PIN
                </button>
              )}
              <button type="button" disabled={isDemo} onClick={() => setEditing(m.id)} aria-label={`Editar a ${m.name}`} className={`${pill} ${pillOff}`}><Pencil className="h-3.5 w-3.5" /></button>
              <button type="button" disabled={isDemo || save.isPending} onClick={() => save.mutate({ id: m.id, name: m.name, role: m.role, cargo: m.cargo, defaultRateClp: m.defaultRateClp, phone: m.phone, rut: m.rut, notes: m.notes, active: !m.active })} className={`${pill} ${pillOff}`}>{m.active ? 'Archivar' : 'Reactivar'}</button>
              <button type="button" disabled={isDemo || del.isPending} aria-label={`Eliminar a ${m.name}`}
                onClick={() => { if (window.confirm(`¿Eliminar a ${m.name}? Si ya tiene pagos registrados quedará archivado.`)) del.mutate({ id: m.id }); }}
                className="rounded-full p-2 hover:bg-black/5"><Trash2 className="h-4 w-4" /></button>
            </div>
          ))}
        </div>

        <UnlinkedOperators team={all} />
      </CardContent>
    </Card>
  );
}
