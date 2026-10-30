import { useContext } from 'react';
import { Flame, Gift, Heart, Percent, ShieldAlert, Users, Wine, type LucideIcon } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { useTonightEvent } from '@/hooks/useTonightEvent';
import { StatTile } from '@/components/admin/StatTile';
import { AdminNavContext } from '@/pages/admin/sections/shared';

/** Inicio de una supervisora (ej. Belén): cómo va Playmatch esta noche y
 * atajos a lo que le toca. Sin ventas, costos ni configuración. */
export function SupervisorHome() {
  const { events, eventId, setSelected } = useTonightEvent();
  const { openSection } = useContext(AdminNavContext);
  const { data: s } = trpc.party.adminStats.useQuery({ eventId: eventId ?? 0 }, { enabled: eventId != null, refetchInterval: 15_000 });
  const { data: reports } = trpc.party.listAllReports.useQuery(undefined, { refetchInterval: 30_000 });
  const pendingReports = ((reports ?? []) as { resolved?: boolean | number | null }[]).filter((r) => !r.resolved).length;

  const shortcuts: { id: string; label: string; hint: string; icon: LucideIcon }[] = [
    { id: 'playmatch-control', label: 'Playmatch en vivo', hint: 'Gente, matches y Super Likes de regalo', icon: Flame },
    { id: 'denuncias', label: 'Denuncias', hint: pendingReports > 0 ? `${pendingReports} sin resolver` : 'Todo al día', icon: ShieldAlert },
    { id: 'insumos', label: 'Stock de barra', hint: 'Contar, merma y compras de insumos', icon: Wine },
    { id: 'manual-access', label: 'Enviar entrada', hint: 'Invitaciones gratis con ticket y QR', icon: Gift },
    { id: 'discounts', label: 'Descuentos', hint: 'Crear y activar códigos', icon: Percent },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-heading text-2xl">Esta noche</h2>
        <select value={eventId ?? ''} onChange={(e) => setSelected(Number(e.target.value))} className="h-10 rounded-lg border border-border bg-card px-3 text-sm" aria-label="Evento">
          {(events as { id: number; title: string }[] | undefined)?.map((e) => <option key={e.id} value={e.id}>{e.title}</option>)}
        </select>
      </div>

      {s && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatTile icon={Users} value={s.profiles.withPhoto} label="Jugando Playmatch" tone="success" />
          <StatTile icon={Flame} value={s.profiles.activeNow} label="Activos ahora" tone="alert" />
          <StatTile icon={Heart} value={s.matches.total} label="Matches" tone="success" />
          <StatTile icon={ShieldAlert} value={pendingReports} label="Denuncias sin resolver" tone="danger" />
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {shortcuts.map((x) => (
          <button key={x.id} type="button" onClick={() => openSection(x.id)} className="admin-tile flex items-center gap-3 p-4 text-left">
            <x.icon className="h-6 w-6 shrink-0" />
            <span className="min-w-0">
              <span className="block font-semibold">{x.label}</span>
              <span className="block text-sm text-[var(--admin-muted)]">{x.hint}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
