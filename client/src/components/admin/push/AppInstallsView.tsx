import { useState } from 'react';
import { BellRing, Gift, Smartphone } from 'lucide-react';
import { WriteButton } from '@/components/admin/WriteButton';
import { GrantCouponDialog } from '@/components/admin/app/GrantCouponDialog';
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
  const [gift, setGift] = useState<{ email: string; name: string | null } | null>(null);
  const people = (data?.people ?? []).filter((p) => !q || foldText(`${p.name ?? ''} ${p.email}`).includes(foldText(q)));
  const anon = data ? data.ios + data.android + data.desktop - data.people.reduce((s, p) => s + p.devices, 0) : 0;

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Teléfonos que abrieron el sitio desde el ícono de inicio en los últimos 60 días. Si alguien borra el ícono no nos enteramos: simplemente deja de aparecer como activo. Se identifica a la persona cuando abre una entrada suya dentro de la app.
      </p>
      <div className="admin-clay flex flex-col gap-4 rounded-2xl p-4 sm:flex-row sm:items-center">
        <img src="/api/app-qr.png?src=puerta" alt="QR para instalar la app" className="h-32 w-32 shrink-0 rounded-xl bg-white p-1.5" />
        <div className="min-w-0 space-y-1.5">
          <p className="font-semibold">QR para instalar la app</p>
          <p className="text-xs text-muted-foreground">Imprímelo para la puerta, la caja o el flyer: lleva a una página que enseña a instalar la app paso a paso (iPhone y Android) y a activar los avisos. También va como botón «Instalar la app» en el correo de confirmación.</p>
          <div className="flex flex-wrap gap-3 text-xs">
            <a className="text-primary underline" href="/api/app-qr.png?src=puerta&download=1">Descargar PNG</a>
            <a className="text-primary underline" href="/app" target="_blank" rel="noreferrer">Ver la página</a>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat value={data ? data.ios + data.android + data.desktop : '—'} label="con la app (60 días)" />
        <Stat value={data?.active7 ?? '—'} label="la abrieron esta semana" />
        <Stat value={data ? `${data.ios} / ${data.android} / ${data.desktop}` : '—'} label="iPhone / Android / PC" />
        <Stat value={data ? `${data.identified}` : '—'} label={`identificados${data ? ` · ${data.withPush} con avisos` : ''}`} />
      </div>

      {data && data.people.length > 0 && (
        <div className="flex flex-wrap items-center gap-3">
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nombre o correo…" className="max-w-xs" />
          <a className="text-sm text-primary underline" href="/api/admin/customers/export.csv?hasApp=1">Descargar correos (CSV)</a>
        </div>
      )}
      {data && data.people.length === 0 && (
        <div className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          Todavía no hay personas identificadas con la app. Aparecen cuando alguien abre su entrada dentro de la app instalada.
        </div>
      )}
      <div className="space-y-2">
        {people.map((p) => (
          <div key={p.email} className="rounded-2xl border border-border bg-card/60">
          <button
            type="button"
            disabled={!p.customerId}
            onClick={() => setOpenId(p.customerId)}
            className="flex w-full items-center gap-3 p-3 text-left disabled:cursor-default"
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
          {p.customerId && (
            <div className="flex flex-wrap gap-2 border-t border-border px-3 py-2">
              <WriteButton size="sm" variant="ghost" className="h-7 gap-1.5 px-2 text-xs" onClick={() => setGift({ email: p.email, name: p.name })}>
                <Gift className="h-3.5 w-3.5" /> Regalar cupón
              </WriteButton>
            </div>
          )}
          </div>
        ))}
      </div>
      <GrantCouponDialog open={!!gift} onClose={() => setGift(null)} email={gift?.email} name={gift?.name} />
      <CustomerDrawer customerId={openId} onClose={() => setOpenId(null)} onChanged={() => refetch()} onDeleted={() => setOpenId(null)} />
      {anon > 0 && <p className="text-xs text-muted-foreground">+ {anon} {anon === 1 ? 'teléfono' : 'teléfonos'} con la app sin identificar (nunca abrieron una entrada ahí).</p>}
    </div>
  );
}
