import { useContext, useState } from 'react';
import { BellRing, Gift, Smartphone, ShieldAlert, UserCheck } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { WriteButton } from '@/components/admin/WriteButton';
import { Button } from '@/components/ui/button';
import { AdminNavContext } from '@/pages/admin/sections/shared';
import { GrantCouponDialog } from './GrantCouponDialog';

const clp = (n: number) => `$${Math.round(n).toLocaleString('es-CL')}`;
const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : '—');
const fmt = (d: string | Date | null) => (d ? new Date(d).toLocaleDateString('es-CL', { day: 'numeric', month: 'short' }) : '');

function Stat({ value, label }: { value: number | string; label: string }) {
  return (
    <div className="admin-clay rounded-2xl px-4 py-3">
      <p className="text-xl font-bold tabular-nums">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

/** Portada de la sección App: cómo va la app de un vistazo y los atajos de lo que más se hace. */
export function AppOverview() {
  const { openSection, badgeCounts } = useContext(AdminNavContext);
  const [giving, setGiving] = useState(false);
  const { data: app } = trpc.customerPush.appStats.useQuery();
  const { data: ov } = trpc.member.adminOverview.useQuery();
  const { data: push } = trpc.customerPush.stats.useQuery();
  const { data: campaigns } = trpc.customerPush.campaigns.useQuery();
  const last = (campaigns ?? []).filter((c: any) => c.status === 'sent' || c.status === 'sending' || c.status === 'testing').slice(0, 5);
  const pending = [
    { id: 'solteros', label: 'solicitudes de Solteros', icon: UserCheck, n: badgeCounts.solteros ?? 0 },
    { id: 'denuncias', label: 'denuncias de Playmatch', icon: ShieldAlert, n: badgeCounts.denuncias ?? 0 },
  ].filter((p) => p.n > 0);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="flex items-center gap-2 font-heading text-2xl"><Smartphone className="h-6 w-6 text-primary" /> App Playroom</h2>
        <p className="mt-1 text-sm text-muted-foreground">Todo lo de la app en un lugar: cupones, notificaciones, quién la tiene, Playmatch y la cuenta de prueba.</p>
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        <WriteButton className="h-12 gap-2" onClick={() => setGiving(true)}><Gift className="h-4 w-4" /> Regalar cupón</WriteButton>
        <Button variant="outline" className="h-12 gap-2" onClick={() => openSection('push-clientes')}><BellRing className="h-4 w-4" /> Enviar push</Button>
        <Button variant="outline" className="h-12 gap-2" onClick={() => openSection('app-clientes')}><Smartphone className="h-4 w-4" /> Clientes con la app</Button>
      </div>
      <GrantCouponDialog open={giving} onClose={() => setGiving(false)} />

      {pending.length > 0 && (
        <div className="space-y-2">
          {pending.map((p) => (
            <button key={p.id} type="button" onClick={() => openSection(p.id)} className="flex w-full items-center gap-3 rounded-2xl border border-primary/40 bg-primary/10 px-4 py-3 text-left text-sm">
              <p.icon className="h-4 w-4 text-primary" /> <b>{p.n}</b> {p.label} por revisar
            </button>
          ))}
        </div>
      )}

      <section className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">La app</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat value={app ? app.ios + app.android + app.desktop : '—'} label="teléfonos con la app (60 días)" />
          <Stat value={app?.active7 ?? '—'} label="la abrieron esta semana" />
          <Stat value={ov?.members ?? '—'} label="socios con cuenta" />
          <Stat value={push?.active ?? '—'} label="dispositivos con avisos" />
        </div>
      </section>

      <section className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Cupones de este mes</p>
        <div className="grid grid-cols-3 gap-2">
          <Stat value={ov?.couponsMonth.granted ?? '—'} label="regalados" />
          <Stat value={ov?.couponsMonth.active ?? '—'} label="vigentes" />
          <Stat value={ov ? `${ov.couponsMonth.used} (${pct(ov.couponsMonth.used, ov.couponsMonth.granted)})` : '—'} label="usados" />
        </div>
      </section>

      <section className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">PlayCard</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <Stat value={ov ? clp(ov.prepaidTotal) : '—'} label="saldo sin gastar" />
          <Stat value={ov?.withBalance ?? '—'} label="clientes con saldo" />
          <Stat value={ov ? ov.playcoinsTotal.toLocaleString('es-CL') : '—'} label="Playcoins en circulación" />
        </div>
      </section>

      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Últimas notificaciones</p>
          <button type="button" onClick={() => openSection('push-clientes')} className="text-xs text-primary underline">Ver todas</button>
        </div>
        {last.length === 0 && <p className="rounded-2xl border border-dashed border-border p-4 text-center text-sm text-muted-foreground">Todavía no se ha enviado ninguna.</p>}
        {last.map((c: any) => (
          <div key={c.id} className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card/60 px-3 py-2 text-sm">
            <div className="min-w-0"><p className="truncate font-medium">{c.title}</p><p className="truncate text-xs text-muted-foreground">{fmt(c.sentAt ?? c.createdAt)} · {c.stats.sent} enviados</p></div>
            <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{pct(c.stats.clicks, c.stats.sent)} la abrieron</span>
          </div>
        ))}
      </section>
    </div>
  );
}
