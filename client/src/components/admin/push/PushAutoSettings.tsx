import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { WriteButton } from '@/components/admin/WriteButton';
import { useIsDemo } from '@/lib/demoMode';
import { DEFAULT_CUSTOMER_PUSH_CONFIG, type CustomerPushConfig } from '@shared/customerPushConfig';
import { PUSH_BODY_MAX, PUSH_TITLE_MAX } from '@shared/pushText';

type Key = Exclude<keyof CustomerPushConfig, 'incentive'>;
interface Rule { key: Key; title: string; help: string; extra?: 'hour' | 'mode' | 'threshold' | 'days' }
const GROUPS: { label: string; rules: Rule[] }[] = [
  { label: 'Alrededor del evento', rules: [
    { key: 'newEvent', title: 'Nuevo evento', help: 'Cuando publicas un evento (al crearlo publicado o pasarlo de borrador a publicado). A todos los suscritos.', extra: 'mode' },
    { key: 'presale', title: 'Cambio de tanda', help: 'Cuando la tanda cambia (a mano o sola, por fecha o por cupo): avisa que subió el precio. Uno por evento al día.', extra: 'mode' },
    { key: 'lowStock', title: 'Quedan pocos cupos', help: 'Cuando una tanda del próximo evento baja de este número, a quienes aún no tienen entrada. Una vez por tanda.', extra: 'threshold' },
    { key: 'eventReminder', title: 'Recordatorio del evento', help: 'El día del evento, a quienes tienen entrada. Abre su entrada en el teléfono. No cuenta para el tope diario ni respeta horas silenciosas.', extra: 'hour' },
    { key: 'thanks', title: 'Gracias y encuesta', help: 'Al día siguiente del evento, solo a quienes fueron. Si tienen la encuesta pendiente, el aviso abre su encuesta.', extra: 'hour' },
  ] },
  { label: 'Por persona', rules: [
    { key: 'welcome', title: 'Bienvenida al activar', help: 'Un aviso al activar las notificaciones (si ya quedó ligado a un correo de compra, con su nombre).' },
    { key: 'birthday', title: 'Cumpleaños', help: 'El día del cumpleaños (desde las 10:00), a quien tiene su fecha en la ficha. Una vez al año.' },
    { key: 'winback', title: 'Reactivación', help: 'A quienes compraron alguna vez y llevan estos días sin comprar, cuando hay un evento por venir. Máximo cada 45 días.', extra: 'days' },
    { key: 'balance', title: 'Saldo PlayCard', help: 'A quienes tienen saldo sin gastar, hasta 3 días antes del evento. Una vez por evento.' },
    { key: 'abandonedCart', title: 'Carrito abandonado', help: 'A las ~3 horas de una compra que quedó a medias, si ese correo tiene avisos activos. Una vez por pedido, junto al correo.' },
  ] },
];

/** Automáticos del push a clientes: cada uno con interruptor y su texto ({evento} = nombre del evento). */
export function PushAutoSettings() {
  const { data } = trpc.customerPush.config.useQuery();
  const [cfg, setCfg] = useState<CustomerPushConfig>(DEFAULT_CUSTOMER_PUSH_CONFIG);
  useEffect(() => { if (data) setCfg(data); }, [data]);
  const utils = trpc.useUtils();
  const save = trpc.customerPush.setConfig.useMutation({
    onSuccess: (c) => { utils.customerPush.config.setData(undefined, c); toast.success('Automáticos guardados'); },
    onError: (e) => toast.error(e.message),
  });
  const demo = useIsDemo();
  const patch = (key: Key, p: Record<string, unknown>) => setCfg((prev) => ({ ...prev, [key]: { ...prev[key], ...p } }));
  const dirty = JSON.stringify(cfg) !== JSON.stringify(data ?? DEFAULT_CUSTOMER_PUSH_CONFIG);

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">Todos parten apagados. Los de marketing respetan el tope de un aviso al día y no salen entre las 23:00 y las 09:00. En los textos, <code>{'{evento}'}</code> es el nombre del evento y <code>{'{nombre}'}</code> el primer nombre de la persona.</p>
      <div className="rounded-2xl border border-border bg-card/60 p-4">
        <p className="font-semibold">🎁 Regalo por activar los avisos</p>
        <p className="mt-0.5 text-xs text-muted-foreground">Playcoins para quien activa las notificaciones, una sola vez por correo (necesita estar ligado a una compra). 0 = sin regalo.</p>
        <div className="mt-2 flex items-center gap-2 text-sm">
          <Input type="number" min={0} max={500} className="w-24" value={cfg.incentive.playcoins} disabled={demo} onChange={(e) => setCfg((p) => ({ ...p, incentive: { playcoins: Math.max(0, Math.min(500, Number(e.target.value) || 0)) } }))} />
          <span className="text-xs text-muted-foreground">Playcoins</span>
        </div>
      </div>
      {GROUPS.map((g) => (
        <div key={g.label} className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{g.label}</p>
          {g.rules.map(({ key, title, help, extra }) => {
            const r = cfg[key] as any;
            return (
              <div key={key} className="rounded-2xl border border-border bg-card/60 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">{title}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{help}</p>
                  </div>
                  <Switch checked={r.enabled} disabled={demo} onCheckedChange={(v) => patch(key, { enabled: v })} />
                </div>
                {r.enabled && (
                  <div className="mt-3 space-y-2.5">
                    <div className="space-y-1">
                      <Label className="text-xs">Título</Label>
                      <Input value={r.title} maxLength={PUSH_TITLE_MAX} disabled={demo} onChange={(e) => patch(key, { title: e.target.value })} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Texto</Label>
                      <Textarea rows={2} value={r.body} maxLength={PUSH_BODY_MAX} disabled={demo} onChange={(e) => patch(key, { body: e.target.value })} />
                    </div>
                    {extra === 'hour' && (
                      <div className="flex items-center gap-2 text-sm">
                        <Label className="text-xs">Hora de envío</Label>
                        <Input type="number" min={9} max={23} className="w-20" value={r.hour} disabled={demo} onChange={(e) => patch(key, { hour: Number(e.target.value) })} />
                        <span className="text-xs text-muted-foreground">hrs (Chile)</span>
                      </div>
                    )}
                    {extra === 'threshold' && (
                      <div className="flex items-center gap-2 text-sm">
                        <Label className="text-xs">Avisar cuando queden</Label>
                        <Input type="number" min={1} max={500} className="w-20" value={r.threshold} disabled={demo} onChange={(e) => patch(key, { threshold: Number(e.target.value) })} />
                        <span className="text-xs text-muted-foreground">cupos o menos</span>
                      </div>
                    )}
                    {extra === 'days' && (
                      <div className="flex items-center gap-2 text-sm">
                        <Label className="text-xs">Sin comprar hace</Label>
                        <Input type="number" min={14} max={730} className="w-20" value={r.days} disabled={demo} onChange={(e) => patch(key, { days: Number(e.target.value) })} />
                        <span className="text-xs text-muted-foreground">días o más</span>
                      </div>
                    )}
                    {extra === 'mode' && (
                      <div className="flex gap-1.5">
                        {(['draft', 'send'] as const).map((m) => (
                          <button key={m} type="button" disabled={demo} onClick={() => patch(key, { mode: m })} className={`rounded-full px-3 py-1 text-xs ${r.mode === m ? 'bg-primary text-white' : 'bg-muted text-muted-foreground'}`}>
                            {m === 'draft' ? 'Dejar en borrador para revisar' : 'Enviar solo'}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ))}
      <WriteButton disabled={!dirty || save.isPending} onClick={() => save.mutate(cfg as any)}>Guardar automáticos</WriteButton>
    </div>
  );
}
