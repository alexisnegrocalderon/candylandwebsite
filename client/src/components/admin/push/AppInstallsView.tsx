import { useState } from 'react';
import { BellRing, Smartphone } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { Input } from '@/components/ui/input';
import { foldText } from '@shared/igCustomerLink';
import { CustomerDrawer } from '@/components/admin/CustomerDrawer';

const fmt = (d: string | Date) => new Date(d).toLocaleDateString('es-CL', { day: 'numeric', month: 'short' });
const PLATFORM: Record<string, string> = { ios: 'iPhone', android: 'Android', desktop: 'PC' };

function Stat({ value, label }: { value: number | string; label: string }) {
  return (
    <div className="admin-clay rounded-2xl px-4 py-3">
      <p className="text-xl font-bold tabular-nums">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

/** Quién tiene el sitio instalado como app (server/appDevices.ts): se mide por
 * aperturas desde el ícono, porque el teléfono no avisa al instalar ni al borrar. */
export function AppInstallsView() {
  const { data, refetch } = trpc.customerPush.appStats.useQuery();
  const [q, setQ] = useState('');
  const [openId, setOpenId] = useState<number | null>(null);
  const people = (data?.people ?? []).filter((p) => !q || foldText(`${p.name ?? ''} ${p.email}`).includes(foldText(q)));
  const anon = data ? data.ios + data.android + data.desktop - data.people.reduce((s, p) => s + p.devices, 0) : 0;

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Teléfonos que abrieron el sitio desde el ícono de inicio en los últimos 60 días. Si alguien borra el ícono no nos enteramos: simplemente deja de aparecer como activo. Se identifica a la persona cuando abre una entrada suya dentro de la app.
      </p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat value={data ? data.ios + data.android + data.desktop : '—'} label="con la app (60 días)" />
        <Stat value={data?.active7 ?? '—'} label="la abrieron esta semana" />
        <Stat value={data ? `${data.ios} / ${data.android} / ${data.desktop}` : '—'} label="iPhone / Android / PC" />
        <Stat value={data ? `${data.identified}` : '—'} label={`identificados${data ? ` · ${data.withPush} con avisos` : ''}`} />
      </div>

      {data && data.people.length > 0 && (
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nombre o correo…" className="max-w-xs" />
      )}
      {data && data.people.length === 0 && (
        <div className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          Todavía no hay personas identificadas con la app. Aparecen cuando alguien abre su entrada dentro de la app instalada.
        </div>
      )}
      <div className="space-y-2">
        {people.map((p) => (
          <button
            key={p.email}
            type="button"
            disabled={!p.customerId}
            onClick={() => setOpenId(p.customerId)}
            className="flex w-full items-center gap-3 rounded-2xl border border-border bg-card/60 p-3 text-left disabled:cursor-default"
          >
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary/15 text-primary"><Smartphone className="h-4 w-4" /></span>
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-2">
                <span className="truncate font-semibold">{p.name || p.email}</span>
                {p.push && <BellRing className="h-3.5 w-3.5 shrink-0 text-primary" aria-label="Con avisos activados" />}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {p.name ? `${p.email} · ` : ''}{p.platforms.map((x) => PLATFORM[x] ?? x).join(', ')}{p.devices > 1 ? ` (${p.devices})` : ''} · desde {fmt(p.firstSeenAt)}
              </p>
            </div>
            <div className="shrink-0 text-right text-xs">
              <p className="font-semibold tabular-nums">{p.opens} {p.opens === 1 ? 'vez' : 'veces'}</p>
              <p className="text-muted-foreground">última {fmt(p.lastSeenAt)}</p>
            </div>
          </button>
        ))}
      </div>
      <CustomerDrawer customerId={openId} onClose={() => setOpenId(null)} onChanged={() => refetch()} onDeleted={() => setOpenId(null)} />
      {anon > 0 && <p className="text-xs text-muted-foreground">+ {anon} {anon === 1 ? 'teléfono' : 'teléfonos'} con la app sin identificar (nunca abrieron una entrada ahí).</p>}
    </div>
  );
}
