/* Playmatch en vivo (hub «App»): el conteo de todo lo que pasa, cada cobro, las personas (regalar, devolver y ajustar Super
 * Likes) y los interruptores de la fiesta, incluido el podio del mejor disfraz. Se actualiza solo cada pocos segundos. */
import { useState } from 'react';
import { toast } from 'sonner';
import { Camera, Download, Flame, Gift, Heart, MessageCircle, Search, Star, Trophy, Users, Wallet } from 'lucide-react';
import type { inferRouterOutputs } from '@trpc/server';
import type { AppRouter } from '../../../../../server/routers';
import { trpc } from '@/lib/trpc';
import { WriteButton } from '@/components/admin/WriteButton';
import { StatTile } from '@/components/admin/StatTile';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { useTonightEvent } from '@/hooks/useTonightEvent';
import { formatChileDateTime } from '@shared/chileDate';
import { onMutationError } from './shared';

const clp = (n: number) => `$${Math.round(n).toLocaleString('es-CL')}`;
const TABS = [
  { id: 'resumen', label: 'En vivo' },
  { id: 'cobros', label: 'Cobros' },
  { id: 'personas', label: 'Personas' },
  { id: 'ajustes', label: 'Ajustes' },
] as const;
type TabId = (typeof TABS)[number]['id'];

const KIND_LABEL: Record<string, string> = { superlike: 'Super Like', likes_unlock: 'Ver quién me dio ♥', gift: 'Regalo', return: 'Devuelto', cap: 'Tope' };

export function PlaymatchControlView() {
  const { events, eventId, setSelected } = useTonightEvent();
  const [tab, setTab] = useState<TabId>('resumen');

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-heading text-2xl">Playmatch en vivo</h2>
        <select value={eventId ?? ''} onChange={(e) => setSelected(Number(e.target.value))} className="h-10 rounded-lg border border-border bg-card px-3 text-sm" aria-label="Evento">
          {(events as any[] | undefined)?.map((e) => <option key={e.id} value={e.id}>{e.title}</option>)}
        </select>
      </div>
      <div className="flex flex-wrap gap-1.5" role="tablist">
        {TABS.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}
            className={`h-9 rounded-full px-4 text-sm font-semibold transition-colors ${tab === t.id ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'}`}>{t.label}</button>
        ))}
      </div>
      {eventId == null ? <p className="text-sm text-muted-foreground">No hay eventos todavía.</p> : (
        <>
          {tab === 'resumen' && <Resumen eventId={eventId} />}
          {tab === 'cobros' && <Cobros eventId={eventId} />}
          {tab === 'personas' && <Personas eventId={eventId} />}
          {tab === 'ajustes' && <Ajustes eventId={eventId} />}
        </>
      )}
    </div>
  );
}

/* --- En vivo -------------------------------------------------------------------- */

function Resumen({ eventId }: { eventId: number }) {
  const { data: s, isLoading } = trpc.party.adminStats.useQuery({ eventId }, { refetchInterval: 10_000 });
  if (isLoading || !s) return <p className="text-sm text-muted-foreground">Cargando…</p>;
  // Las horas en orden de noche (18, 19 … 23, 0, 1 … 5), no de reloj.
  const byHour = new Map<number, number>();
  for (const r of s.byHour) byHour.set(r.hour, (byHour.get(r.hour) ?? 0) + r.n);
  const hours = Array.from(byHour.entries()).sort((a, b) => ((a[0] + 6) % 24) - ((b[0] + 6) % 24));
  const peak = Math.max(1, ...hours.map(([, n]) => n));
  return (
    <div className="space-y-6">
      <section>
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Gente</h3>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatTile icon={Users} value={s.profiles.total} label="Perfiles creados" />
          <StatTile icon={Camera} value={s.profiles.withPhoto} label="Con foto (juegan)" tone="success" />
          <StatTile icon={Flame} value={s.profiles.activeNow} label="Activos ahora" tone="alert" />
          <StatTile icon={Users} value={s.profiles.banned} label="Expulsados" tone="danger" />
        </div>
      </section>
      <section>
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Conexiones</h3>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatTile icon={Heart} value={s.swipes.likes} label="♥ dados" tone="revenue" />
          <StatTile icon={Heart} value={s.swipes.nopes} label="✕ dados" />
          <StatTile icon={Star} value={s.superLikes.sent} label="Super Likes enviados" tone="revenue" />
          <StatTile icon={Heart} value={s.matches.total} label="Matches" tone="success" />
          <StatTile icon={MessageCircle} value={s.matches.chats} label="Chats con mensajes" />
          <StatTile icon={MessageCircle} value={s.matches.messages} label="Mensajes" />
          <StatTile icon={Trophy} value={s.costumeVotes} label="Votos de disfraz" tone="alert" />
        </div>
      </section>
      <section>
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Plata de Playmatch</h3>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatTile icon={Wallet} value={clp(s.revenue.totalClp)} label="Cobrado en total" tone="revenue" size="lg" />
          <StatTile icon={Star} value={clp(s.revenue.superLikes)} label={`Super Likes (${s.superLikes.sold} vendidos)`} tone="revenue" />
          <StatTile icon={Heart} value={clp(s.revenue.likesUnlock)} label={`Ver quién me dio ♥ (${s.revenue.likesUnlocks})`} tone="revenue" />
          <StatTile icon={Users} value={s.revenue.buyers} label="Personas que pagaron" />
          <StatTile icon={Wallet} value={s.revenue.coins.toLocaleString('es-CL')} label="Playcoins gastadas" />
          <StatTile icon={Wallet} value={clp(s.revenue.saldo)} label="Saldo PlayCard cobrado" />
          <StatTile icon={Gift} value={s.superLikes.gifted} label="Super Likes regalados" />
          <StatTile icon={Gift} value={s.superLikes.returned} label="Super Likes devueltos" />
        </div>
      </section>
      {hours.length > 0 && (
        <section>
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Cobros por hora (hora de Chile)</h3>
          <div className="flex h-32 items-end gap-1.5 rounded-2xl border border-border/60 bg-card/50 p-3">
            {hours.map(([h, n]) => (
              <div key={h} className="flex flex-1 flex-col items-center justify-end gap-1" title={`${String(h).padStart(2, '0')}:00 · ${n} cobros`}>
                <span className="text-[10px] tabular-nums text-muted-foreground">{n}</span>
                {/* Alto en píxeles: un porcentaje no se resuelve dentro de una columna sin alto propio. */}
                <div className="w-full rounded-t bg-primary/80" style={{ height: `${Math.max(6, Math.round((n / peak) * 64))}px` }} />
                <span className="text-[10px] text-muted-foreground">{String(h).padStart(2, '0')}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

/* --- Cobros ------------------------------------------------------------------------ */

type Charge = inferRouterOutputs<AppRouter>['party']['adminCharges'][number];

const csvCell = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;

function Cobros({ eventId }: { eventId: number }) {
  const utils = trpc.useUtils();
  const { data: rows, isLoading } = trpc.party.adminCharges.useQuery({ eventId, limit: 300 }, { refetchInterval: 15_000 });
  const [busy, setBusy] = useState(false);

  const download = async () => {
    setBusy(true);
    try {
      const all = await utils.party.adminCharges.fetch({ eventId, limit: 2000 });
      const head = ['Fecha', 'Persona', 'Nombre de la entrada', 'Tipo', 'Cantidad', 'Monto CLP', 'Playcoins', 'Saldo', 'Nota', 'Hecho por'];
      const lines = all.map((r: Charge) => [formatChileDateTime(r.createdAt), r.alias, r.holderName, KIND_LABEL[r.kind] ?? r.kind, r.quantity, r.amountClp, r.coins, r.saldo, r.note, r.actor].map(csvCell).join(','));
      const blob = new Blob([`﻿${[head.map(csvCell).join(','), ...lines].join('\n')}`], { type: 'text/csv;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `playmatch-movimientos-${eventId}.csv`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e) { onMutationError(e); } finally { setBusy(false); }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">Cada Super Like comprado, cada «Ver quién me dio ♥», y lo que regalaste, devolviste o ajustaste. Lo más nuevo arriba.</p>
        <WriteButton type="button" variant="outline" size="sm" onClick={download} disabled={busy}><Download className="mr-1.5 h-4 w-4" /> Descargar CSV</WriteButton>
      </div>
      {isLoading && <p className="text-sm text-muted-foreground">Cargando…</p>}
      {rows && rows.length === 0 && <p className="rounded-2xl border border-border/60 bg-card/50 p-6 text-center text-sm text-muted-foreground">Todavía no hay movimientos en esta fiesta.</p>}
      {rows && rows.length > 0 && (
        <div className="overflow-x-auto rounded-2xl border border-border/60">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr><th className="px-3 py-2">Hora</th><th className="px-3 py-2">Persona</th><th className="px-3 py-2">Qué</th><th className="px-3 py-2 text-right">Monto</th><th className="px-3 py-2">Con qué</th><th className="px-3 py-2">Detalle</th></tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">{formatChileDateTime(r.createdAt)}</td>
                  <td className="px-3 py-2"><span className="font-medium">{r.alias ?? 'Perfil eliminado'}</span>{r.holderName && <span className="block text-xs text-muted-foreground">{r.holderName}</span>}</td>
                  <td className="px-3 py-2">{KIND_LABEL[r.kind] ?? r.kind}{r.kind !== 'likes_unlock' && r.kind !== 'cap' ? ` ×${r.quantity}` : ''}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{r.amountClp > 0 ? clp(r.amountClp) : '—'}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{r.amountClp > 0 ? [r.coins > 0 ? `${r.coins.toLocaleString('es-CL')} Playcoins` : '', r.saldo > 0 ? `${clp(r.saldo)} saldo` : ''].filter(Boolean).join(' + ') : ''}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{r.note}{r.actor ? ` · ${r.actor}` : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* --- Personas ------------------------------------------------------------------------ */

type Person = inferRouterOutputs<AppRouter>['party']['adminPeople'][number];

function Personas({ eventId }: { eventId: number }) {
  const [q, setQ] = useState('');
  const { data: people, isLoading } = trpc.party.adminPeople.useQuery({ eventId, q }, { placeholderData: (prev) => prev });
  const [open, setOpen] = useState<number | null>(null);
  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por alias o nombre de la entrada" className="pl-9" />
      </div>
      {isLoading && <p className="text-sm text-muted-foreground">Cargando…</p>}
      {people && people.length === 0 && <p className="rounded-2xl border border-border/60 bg-card/50 p-6 text-center text-sm text-muted-foreground">{q ? 'Nadie coincide con esa búsqueda.' : 'Todavía no hay perfiles en esta fiesta.'}</p>}
      <div className="space-y-2">
        {people?.map((p) => <PersonRow key={p.id} eventId={eventId} p={p} open={open === p.id} onToggle={() => setOpen(open === p.id ? null : p.id)} />)}
      </div>
    </div>
  );
}

function PersonRow({ eventId, p, open, onToggle }: { eventId: number; p: Person; open: boolean; onToggle: () => void }) {
  const utils = trpc.useUtils();
  const [qty, setQty] = useState('1');
  const [cap, setCap] = useState(p.cap == null ? '' : String(p.cap));
  const refresh = () => { void utils.party.adminPeople.invalidate(); void utils.party.adminCharges.invalidate(); void utils.party.adminStats.invalidate(); void utils.party.adminPendingSuperLikes.invalidate(); };
  const gift = trpc.party.adminGift.useMutation({ onSuccess: () => { refresh(); toast.success('Super Likes regalados'); }, onError: onMutationError });
  const setCapM = trpc.party.adminSetCap.useMutation({ onSuccess: () => { refresh(); toast.success('Tope actualizado'); }, onError: onMutationError });
  const pending = trpc.party.adminPendingSuperLikes.useQuery({ eventId, profileId: p.id }, { enabled: open });
  const ret = trpc.party.adminReturn.useMutation({ onSuccess: () => { refresh(); toast.success('Devuelto: el Super Like volvió a su dueño'); }, onError: onMutationError });

  return (
    <div className={`rounded-2xl border border-border/60 bg-card/50 ${p.banned ? 'opacity-60' : ''}`}>
      <button type="button" onClick={onToggle} aria-expanded={open} className="flex w-full items-center gap-3 px-4 py-3 text-left">
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold">{p.alias}{p.banned ? ' · expulsado/a' : ''}</span>
          <span className="block truncate text-xs text-muted-foreground">{p.holderName ?? 'Sin nombre en la entrada'}</span>
        </span>
        <span className="shrink-0 text-right text-xs text-muted-foreground">
          <span className="block">Enviados {p.sent} · sin usar {p.credits}</span>
          <span className="block">Compró {p.bought}{p.cap != null ? ` · tope ${p.cap}` : ''}{p.likesUnlocked ? ' · vio ♥' : ''}</span>
        </span>
      </button>
      {open && (
        <div className="space-y-4 border-t border-border/50 px-4 py-4">
          <div className="flex flex-wrap items-end gap-2">
            <div><label className="mb-1 block text-xs text-muted-foreground">Regalar Super Likes</label><Input type="number" min={1} max={50} value={qty} onChange={(e) => setQty(e.target.value)} className="h-9 w-24" /></div>
            <WriteButton type="button" size="sm" disabled={gift.isPending} onClick={() => gift.mutate({ eventId, profileId: p.id, quantity: Number(qty) || 1, note: 'Regalo del equipo' })}><Gift className="mr-1.5 h-4 w-4" /> Regalar</WriteButton>
            <div className="ml-auto flex items-end gap-2">
              <div><label className="mb-1 block text-xs text-muted-foreground">Tope de compra (vacío = el de la fiesta)</label><Input type="number" min={0} max={100} value={cap} onChange={(e) => setCap(e.target.value)} className="h-9 w-28" /></div>
              <WriteButton type="button" size="sm" variant="outline" disabled={setCapM.isPending} onClick={() => setCapM.mutate({ eventId, profileId: p.id, cap: cap.trim() === '' ? null : Math.max(0, Number(cap) || 0) })}>Guardar tope</WriteButton>
            </div>
          </div>
          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Super Likes sin respuesta (se pueden devolver)</p>
            {pending.isLoading ? <p className="text-sm text-muted-foreground">Cargando…</p> : (pending.data?.length ?? 0) === 0 ? <p className="text-sm text-muted-foreground">No tiene ninguno pendiente.</p> : (
              <ul className="space-y-1.5">
                {pending.data!.map((c) => (
                  <li key={c.connectionId} className="flex items-center justify-between gap-2 rounded-xl bg-muted/50 px-3 py-2 text-sm">
                    <span className="min-w-0 truncate">A <strong>{c.toAlias}</strong> · {formatChileDateTime(c.createdAt)}</span>
                    <WriteButton type="button" size="sm" variant="outline" disabled={ret.isPending} onClick={() => { if (confirm(`¿Devolver este Super Like? ${c.toAlias} ya no lo verá y ${p.alias} lo recupera.`)) ret.mutate({ eventId, connectionId: c.connectionId, note: 'Devuelto por el equipo' }); }}>Devolver</WriteButton>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* --- Ajustes --------------------------------------------------------------------------- */

function Ajustes({ eventId }: { eventId: number }) {
  const utils = trpc.useUtils();
  const { data: cfg } = trpc.party.adminConfig.useQuery({ eventId });
  const save = trpc.party.adminSetConfig.useMutation({
    onSuccess: () => { void utils.party.adminConfig.invalidate(); toast.success('Guardado'); },
    onError: onMutationError,
  });
  const { data: ranking } = trpc.party.costumeRanking.useQuery({ eventId }, { refetchInterval: 15_000 });
  const [draft, setDraft] = useState<Record<string, string>>({});
  if (!cfg) return <p className="text-sm text-muted-foreground">Cargando…</p>;

  const toggle = (key: 'enabled' | 'superLikes' | 'likesUnlock' | 'costumes', label: string, hint: string) => (
    <div className="flex items-center justify-between gap-4 rounded-2xl border border-border/60 bg-card/50 px-4 py-3">
      <div className="min-w-0"><p className="font-semibold">{label}</p><p className="text-xs text-muted-foreground">{hint}</p></div>
      <Switch checked={cfg[key]} disabled={save.isPending} onCheckedChange={(v) => save.mutate({ eventId, [key]: v })} aria-label={label} />
    </div>
  );
  const num = (key: string, label: string, value: number, patch: (n: number) => Parameters<typeof save.mutate>[0]) => {
    const text = draft[key] ?? String(value);
    const dirty = text !== String(value);
    return (
      <div className="space-y-1">
        <label className="block text-xs text-muted-foreground">{label}</label>
        <div className="flex gap-2">
          <Input type="number" min={0} value={text} onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))} className="h-9" />
          <WriteButton type="button" size="sm" variant={dirty ? 'default' : 'outline'} disabled={!dirty || save.isPending} onClick={() => { save.mutate(patch(Math.max(0, Number(text) || 0))); setDraft((d) => { const n = { ...d }; delete n[key]; return n; }); }}>Guardar</WriteButton>
        </div>
      </div>
    );
  };
  const medal = (i: number) => (['🥇', '🥈', '🥉'][i] ?? `${i + 1}.`);

  return (
    <div className="space-y-6">
      <section className="space-y-2.5">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Interruptores (valen en segundos)</h3>
        {toggle('enabled', 'Playmatch activo', 'Apagado: nadie puede deslizar ni escribir hasta que lo vuelvas a prender.')}
        {toggle('superLikes', 'Super Likes', 'Apagado: no se pueden mandar ni comprar Super Likes.')}
        {toggle('likesUnlock', 'Ver quién me dio ♥', 'Apagado: sigue el número, pero no se puede desbloquear quién es.')}
        {toggle('costumes', 'Concurso de disfraces', 'Apagado: la pestaña Disfraces y los votos se esconden.')}
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Precios y topes</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          {num('superLikePrice', 'Precio de 1 Super Like ($)', cfg.superLikePrice, (n) => ({ eventId, superLikePrice: n }))}
          {num('superLikePackPrice', `Precio del pack ($)`, cfg.superLikePackPrice, (n) => ({ eventId, superLikePackPrice: n }))}
          {num('superLikePackSize', 'Super Likes del pack', cfg.superLikePackSize, (n) => ({ eventId, superLikePackSize: Math.max(2, n) }))}
          {num('maxPaidSuperLikes', 'Tope de comprados por persona y noche', cfg.maxPaidSuperLikes, (n) => ({ eventId, maxPaidSuperLikes: n }))}
          {num('likesUnlockPrice', 'Precio de «Ver quién me dio ♥» ($)', cfg.likesUnlockPrice, (n) => ({ eventId, likesUnlockPrice: n }))}
        </div>
        <p className="text-xs text-muted-foreground">El primer Super Like de cada persona es gratis. Los cambios de precio no afectan lo ya comprado.</p>
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Meta de la noche (la ven los anfitriones)</h3>
        <div className="grid gap-3 sm:grid-cols-3">
          {num('goalProfiles', 'Perfiles creados', cfg.hostGoal.profiles, (n) => ({ eventId, hostGoal: { profiles: Math.max(1, n) } }))}
          {num('goalPhotos', 'Con foto (juegan)', cfg.hostGoal.photos, (n) => ({ eventId, hostGoal: { photos: Math.max(1, n) } }))}
          {num('goalMatches', 'Matches', cfg.hostGoal.matches, (n) => ({ eventId, hostGoal: { matches: Math.max(1, n) } }))}
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Mejor disfraz</h3>
        <div className={`rounded-2xl border p-4 ${cfg.costumeRevealed ? 'border-amber-400/50 bg-amber-400/10' : 'border-border/60 bg-card/50'}`}>
          <p className="font-semibold">{cfg.costumeRevealed ? 'El podio ya se muestra a todos y la votación está cerrada.' : 'La votación está abierta y el ranking lo ves solo tú.'}</p>
          <p className="mt-1 text-xs text-muted-foreground">{cfg.costumeRevealed ? 'Si lo reabres, el podio se esconde y la gente puede volver a votar.' : 'Cuando revelas el podio, se cierra la votación y aparecen los 3 primeros en la pestaña Disfraces de todos.'}</p>
          <WriteButton type="button" className="mt-3" variant={cfg.costumeRevealed ? 'outline' : 'default'} disabled={save.isPending}
            onClick={() => { if (cfg.costumeRevealed || confirm('¿Revelar el podio y cerrar la votación? Los 3 primeros se verán en todos los celulares.')) save.mutate({ eventId, costumeRevealed: !cfg.costumeRevealed }); }}>
            <Trophy className="mr-1.5 h-4 w-4" /> {cfg.costumeRevealed ? 'Reabrir la votación' : 'Revelar el podio y cerrar'}
          </WriteButton>
        </div>
        {(ranking?.length ?? 0) === 0 ? <p className="text-sm text-muted-foreground">Todavía no hay votos.</p> : (
          <div className="space-y-2">
            {ranking!.map((r, i) => (
              <div key={r.profileId} className={`flex items-center gap-3 rounded-2xl border p-3 ${i === 0 ? 'border-amber-400/50 bg-amber-400/10' : 'border-border/60 bg-card/50'} ${r.banned ? 'opacity-50' : ''}`}>
                <span className="w-8 shrink-0 text-center text-xl">{medal(i)}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{r.costume ?? 'Sin disfraz escrito'}</p>
                  <p className="truncate text-xs text-muted-foreground">{r.alias}{r.zone ? ` · en ${r.zone}` : ''}{r.holderName ? ` · entrada de ${r.holderName}` : ''}{r.banned ? ' · expulsado/a' : ''}</p>
                </div>
                <p className="shrink-0 font-heading text-2xl tabular-nums">{r.votes}</p>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
