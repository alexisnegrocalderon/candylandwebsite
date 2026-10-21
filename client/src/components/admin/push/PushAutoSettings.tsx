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

type Key = keyof CustomerPushConfig;
const RULES: { key: Key; title: string; help: string }[] = [
  { key: 'eventReminder', title: 'Recordatorio del evento', help: 'El día del evento, a quienes tienen entrada. Abre su entrada en el teléfono. No cuenta para el tope diario.' },
  { key: 'newEvent', title: 'Nuevo evento', help: 'Cuando publicas un evento (al crearlo publicado o al pasarlo de borrador a publicado). A todos los suscritos.' },
  { key: 'presale', title: 'Cambio de tanda', help: 'Cuando la tanda cambia (a mano o sola, por fecha o por cupo): avisa que subió el precio. Uno por evento al día.' },
  { key: 'abandonedCart', title: 'Carrito abandonado', help: 'A las ~3 horas de una compra que quedó a medias, si ese correo tiene avisos activos. Una vez por pedido, junto al correo.' },
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
    <div className="space-y-3">
      {RULES.map(({ key, title, help }) => {
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
                {key === 'eventReminder' && (
                  <div className="flex items-center gap-2 text-sm">
                    <Label className="text-xs">Hora de envío</Label>
                    <Input type="number" min={8} max={23} className="w-20" value={r.hour} disabled={demo} onChange={(e) => patch(key, { hour: Number(e.target.value) })} />
                    <span className="text-xs text-muted-foreground">hrs (Chile)</span>
                  </div>
                )}
                {(key === 'newEvent' || key === 'presale') && (
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
      <WriteButton disabled={!dirty || save.isPending} onClick={() => save.mutate(cfg as any)}>Guardar automáticos</WriteButton>
    </div>
  );
}
