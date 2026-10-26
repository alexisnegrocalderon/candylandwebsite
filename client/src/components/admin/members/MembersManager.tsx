import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Crown, Gift } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { WriteButton } from '@/components/admin/WriteButton';
import { useIsDemo } from '@/lib/demoMode';
import { GrantCouponDialog } from '@/components/admin/app/GrantCouponDialog';
import { takeGiftCouponRequest } from './requestGiftCoupon';
import { DEFAULT_MEMBER_CONFIG, type CouponRule, type MemberConfig } from '@shared/memberConfig';

type RuleKey = 'welcome' | 'birthday' | 'recurrente' | 'vip';
const RULES: { key: RuleKey; title: string; help: string }[] = [
  { key: 'welcome', title: 'Bienvenida', help: 'La primera vez que la persona entra a su cuenta.' },
  { key: 'recurrente', title: 'Cliente recurrente', help: 'Un cupón al mes mientras sea de nivel recurrente (2 o más compras).' },
  { key: 'vip', title: 'Cliente VIP', help: 'Un cupón al mes mientras sea VIP.' },
  { key: 'birthday', title: 'Cumpleaños', help: 'Desde 7 días antes de su cumpleaños (necesita su fecha en la ficha). Uno por año.' },
];
const KIND: Record<string, string> = { bienvenida: 'Bienvenida', nivel: 'Nivel', cumpleanos: 'Cumpleaños', manual: 'Regalo' };
const STATUS: Record<string, string> = { disponible: 'Disponible', usado: 'Usado', vencido: 'Vencido' };

function Stat({ value, label }: { value: number | string; label: string }) {
  return (
    <div className="admin-clay rounded-2xl px-4 py-3">
      <p className="text-xl font-bold tabular-nums">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

/** Admin → App → Cupones y pagos: quiénes tienen cuenta, los cupones que se regalan solos y cuántos se usan. */
export function MembersManager() {
  const utils = trpc.useUtils();
  const demo = useIsDemo();
  const { data: stats } = trpc.member.adminStats.useQuery();
  const { data: config } = trpc.member.config.useQuery();
  const [cfg, setCfg] = useState<MemberConfig>(DEFAULT_MEMBER_CONFIG);
  useEffect(() => { if (config) setCfg(config); }, [config]);
  const save = trpc.member.setConfig.useMutation({
    onSuccess: (c) => { utils.member.config.setData(undefined, c); toast.success('Beneficios guardados'); },
    onError: (e) => toast.error(e.message),
  });
  const dirty = JSON.stringify(cfg) !== JSON.stringify(config ?? DEFAULT_MEMBER_CONFIG);
  const patch = (key: RuleKey, p: Partial<CouponRule>) => setCfg((prev) => ({ ...prev, [key]: { ...prev[key], ...p } }));

  const [giving, setGiving] = useState(takeGiftCouponRequest);
  const [statusFilter, setStatusFilter] = useState<'todos' | 'disponible' | 'usado' | 'vencido'>('todos');
  const revoke = trpc.member.revokeCoupon.useMutation({
    onSuccess: () => { toast.success('Cupón anulado'); utils.member.adminStats.invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  const recent = (stats?.recent ?? []).filter((c: any) => statusFilter === 'todos' || c.status === statusFilter);

  const usedPct = stats?.granted ? Math.round((stats.used / stats.granted) * 100) : 0;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="flex items-center gap-2 font-heading text-2xl"><Crown className="h-6 w-6 text-primary" /> Cupones y pagos</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          «Mi cuenta» es opcional: el cliente entra con un código que le llega al correo y ve su saldo, Playcoins, entradas y cupones. Quien entra una vez pasa a ser socio. Solo pueden entrar correos que ya son clientes. La preventa anticipada se define en cada evento (Eventos → editar → «Preventa anticipada para socios»).
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat value={stats?.members ?? '—'} label="socios con cuenta" />
        <Stat value={stats?.granted ?? '—'} label="cupones entregados" />
        <Stat value={stats?.used ?? '—'} label={`cupones usados${stats?.granted ? ` (${usedPct}%)` : ''}`} />
        <Stat value={stats ? Object.keys(stats.byKind).length : '—'} label="tipos de cupón en uso" />
      </div>

      <section className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Cupones que se regalan solos</p>
        <p className="text-sm text-muted-foreground">Todos parten apagados. Cada cupón es personal, de un solo uso y se aplica en el campo de código al comprar. Aparecen en «Mi cuenta» y, si la persona activó las notificaciones, le llega un aviso.</p>
        {RULES.map(({ key, title, help }) => {
          const r = cfg[key];
          return (
            <div key={key} className="rounded-2xl border border-border bg-card/60 p-4">
              <div className="flex items-start justify-between gap-3">
                <div><p className="font-semibold">{title}</p><p className="mt-0.5 text-xs text-muted-foreground">{help}</p></div>
                <Switch checked={r.enabled} disabled={demo} onCheckedChange={(v) => patch(key, { enabled: v })} />
              </div>
              {r.enabled && (
                <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
                  <span className="flex items-center gap-1.5"><Input type="number" min={1} max={60} className="w-20" value={r.percent} disabled={demo} onChange={(e) => patch(key, { percent: Number(e.target.value) })} /> % de descuento</span>
                  <span className="flex items-center gap-1.5">vale <Input type="number" min={3} max={365} className="w-20" value={r.days} disabled={demo} onChange={(e) => patch(key, { days: Number(e.target.value) })} /> días</span>
                </div>
              )}
            </div>
          );
        })}
        <label className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-card/60 p-4">
          <span><span className="block font-semibold">Avisar por notificación</span><span className="text-xs text-muted-foreground">Cuando reciben un cupón de nivel o cumpleaños (solo si activaron los avisos).</span></span>
          <Switch checked={cfg.pushOnGrant} disabled={demo} onCheckedChange={(v) => setCfg((p) => ({ ...p, pushOnGrant: v }))} />
        </label>
        <div className="space-y-2 rounded-2xl border border-border p-4">
          <p className="font-semibold">Pagos desde «Mi cuenta»</p>
          <p className="text-xs text-muted-foreground">Préndelos uno por uno cuando quieras lanzarlos. Antes, pruébalos con tu propia cuenta.</p>
          {([
            ['savedCards', 'Tarjetas guardadas', 'Los socios guardan su tarjeta en Mercado Pago y al pagar solo ponen el código de seguridad.'],
            ['accountTopup', 'Recargar PlayCard desde la cuenta', 'Botón «Recargar saldo» en la PlayCard y en Puntos.'],
            ['cajaPay', 'Pagar en caja con la app', 'QR de un solo uso (2 min): la cajera cobra del saldo sin pedir el PIN.'],
          ] as const).map(([key, label, help]) => (
            <label key={key} className="flex items-center justify-between gap-3">
              <span><span className="block text-sm font-medium">{label}</span><span className="text-xs text-muted-foreground">{help}</span></span>
              <Switch checked={cfg.payments[key]} disabled={demo} onCheckedChange={(v) => setCfg((p) => ({ ...p, payments: { ...p.payments, [key]: v } }))} />
            </label>
          ))}
        </div>
        <WriteButton disabled={!dirty || save.isPending} onClick={() => save.mutate(cfg as any)}>Guardar beneficios</WriteButton>
      </section>

      <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border p-4">
        <div>
          <p className="flex items-center gap-2 font-semibold"><Gift className="h-4 w-4 text-primary" /> Regalar un cupón</p>
          <p className="text-xs text-muted-foreground">A una persona, a una lista de correos o a un grupo (VIP, cumpleañeros, con la app…). En % o en pesos, para cualquier fiesta o una en particular, con aviso push.</p>
        </div>
        <WriteButton onClick={() => setGiving(true)}>Regalar cupón</WriteButton>
      </section>
      <GrantCouponDialog open={giving} onClose={() => setGiving(false)} />

      <section className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Últimos cupones</p>
          <div className="flex gap-1.5">
            {(['todos', 'disponible', 'usado', 'vencido'] as const).map((f) => (
              <button key={f} type="button" onClick={() => setStatusFilter(f)}
                className={`rounded-full border px-2.5 py-0.5 text-[11px] ${statusFilter === f ? 'border-primary bg-primary/15 text-primary' : 'border-border text-muted-foreground'}`}>
                {f === 'todos' ? 'Todos' : STATUS[f]}
              </button>
            ))}
          </div>
        </div>
        {recent.length === 0 && <p className="rounded-2xl border border-dashed border-border p-4 text-center text-sm text-muted-foreground">{(stats?.recent ?? []).length === 0 ? 'Todavía no se ha entregado ningún cupón.' : 'No hay cupones con ese estado.'}</p>}
        {recent.map((c: any) => (
          <div key={c.id} className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card/60 px-3 py-2 text-sm">
            <div className="min-w-0"><p className="truncate font-medium">{c.title}</p><p className="truncate text-xs text-muted-foreground">{c.email} · {KIND[c.kind] ?? c.kind} · <span className="font-mono">{c.code}</span></p></div>
            <div className="flex shrink-0 items-center gap-2">
              <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ${c.status === 'disponible' ? 'bg-emerald-500/15 text-emerald-300' : 'bg-muted text-muted-foreground'}`}>{STATUS[c.status]}</span>
              {c.status === 'disponible' && (
                <WriteButton size="sm" variant="ghost" className="h-7 px-2 text-xs text-destructive" disabled={revoke.isPending}
                  onClick={() => { if (window.confirm(`¿Anular el cupón ${c.code} de ${c.email}? Ya no le va a servir.`)) revoke.mutate({ id: c.id }); }}>
                  Anular
                </WriteButton>
              )}
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
