import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { WriteButton } from '@/components/admin/WriteButton';
import { couponGiftError, couponValueLabel, defaultCouponTitle, parseEmailList, type CouponAudience, type CouponGiftType } from '@shared/couponGift';

type Who = 'one' | 'list' | 'vip' | 'recurrente' | 'birthday' | 'app' | 'members';
const WHO: { key: Who; label: string }[] = [
  { key: 'one', label: 'Una persona' },
  { key: 'list', label: 'Lista de correos' },
  { key: 'vip', label: 'Clientes VIP' },
  { key: 'recurrente', label: 'Recurrentes' },
  { key: 'birthday', label: 'Cumpleañeros del mes' },
  { key: 'app', label: 'Con la app' },
  { key: 'members', label: 'Todos los socios' },
];
const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

const newBatchId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

/** Regalar un cupón (sección App): a una persona, a una lista pegada o a un grupo de clientes. Monto fijo
 * o %, opcionalmente solo para una fiesta, y con aviso push. Se abre desde la ficha del cliente, la lista
 * de clientes con la app, el «+» del celular y «Cupones y pagos». */
export function GrantCouponDialog({ open, onClose, email, name }: { open: boolean; onClose: () => void; email?: string | null; name?: string | null }) {
  const utils = trpc.useUtils();
  const fixedPerson = !!email;
  const [who, setWho] = useState<Who>('one');
  const [oneEmail, setOneEmail] = useState('');
  const [listText, setListText] = useState('');
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [type, setType] = useState<CouponGiftType>('percentage');
  const [value, setValue] = useState(15);
  const [days, setDays] = useState(30);
  const [eventId, setEventId] = useState<number | null>(null);
  const [title, setTitle] = useState('');
  const [notify, setNotify] = useState(true);
  const [batchId, setBatchId] = useState(newBatchId);

  useEffect(() => {
    if (!open) return;
    setWho('one'); setOneEmail(email ?? ''); setListText(''); setTitle(''); setEventId(null); setNotify(true); setBatchId(newBatchId());
  }, [open, email]);

  const { data: events } = trpc.events.listAll.useQuery(undefined, { enabled: open });
  const upcoming = useMemo(() => (events ?? [])
    .filter((e: any) => new Date(e.eventDate).getTime() > Date.now() - 86_400_000)
    .sort((a: any, b: any) => new Date(a.eventDate).getTime() - new Date(b.eventDate).getTime()), [events]);

  const parsed = useMemo(() => parseEmailList(listText), [listText]);
  const audience: CouponAudience | null =
    who === 'list' ? (parsed.emails.length ? { kind: 'emails', emails: parsed.emails } : null)
    : who === 'vip' || who === 'recurrente' ? { kind: 'level', level: who }
    : who === 'birthday' ? { kind: 'birthdayMonth', month }
    : who === 'app' ? { kind: 'app' }
    : who === 'members' ? { kind: 'members' }
    : null;
  const preview = trpc.member.previewCouponAudience.useQuery(audience!, { enabled: open && !!audience });

  const gift = { type, value, days, title: title.trim() || undefined, eventId, notify };
  const err = couponGiftError({ type, value, days });
  const done = () => { utils.member.adminStats.invalidate(); onClose(); };
  const one = trpc.member.grantCoupon.useMutation({
    onSuccess: (r) => { toast.success(`Cupón ${r.code} regalado${r.notified ? ' · aviso enviado' : notify ? ' · sin la app: no le llegó aviso' : ''}`); done(); },
    onError: (e) => toast.error(e.message),
  });
  const batch = trpc.member.grantCouponBatch.useMutation({
    onSuccess: (r) => {
      const parts = [`${r.granted} cupones regalados`];
      if (r.already) parts.push(`${r.already} ya lo tenían`);
      if (r.notCustomers.length) parts.push(`${r.notCustomers.length} correos no son clientes`);
      if (notify) parts.push(`${r.notified} avisos`);
      toast.success(parts.join(' · '));
      if (r.overLimit) toast.warning('Había más de 500 personas: se regaló a las primeras 500. Repite con otro grupo para el resto.');
      done();
    },
    onError: (e) => toast.error(e.message),
  });

  const target = fixedPerson ? email! : oneEmail.trim();
  const single = fixedPerson || who === 'one';
  const canSend = !err && (single ? target.includes('@') : !!audience && (preview.data?.count ?? 0) > 0);
  const send = () => single
    ? one.mutate({ email: target, ...gift })
    : batch.mutate({ audience: audience!, batchId, ...gift });
  const pending = one.isPending || batch.isPending;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-h-[90dvh] max-w-md overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Regalar un cupón</DialogTitle>
          <DialogDescription>
            {fixedPerson ? <>Para <b>{name || email}</b>. </> : null}
            Aparece en «Mi cuenta → Cupones», es personal y de un solo uso.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {!fixedPerson && (
            <div className="space-y-2">
              <Label className="text-xs">Para quién</Label>
              <div className="flex flex-wrap gap-1.5">
                {WHO.map((w) => (
                  <button key={w.key} type="button" onClick={() => setWho(w.key)}
                    className={`rounded-full border px-3 py-1 text-xs ${who === w.key ? 'border-primary bg-primary/15 text-primary' : 'border-border text-muted-foreground'}`}>
                    {w.label}
                  </button>
                ))}
              </div>
              {who === 'one' && <Input type="email" value={oneEmail} onChange={(e) => setOneEmail(e.target.value)} placeholder="cliente@correo.cl" />}
              {who === 'list' && (
                <>
                  <Textarea rows={4} value={listText} onChange={(e) => setListText(e.target.value)} placeholder="Pega los correos: uno por línea o separados por coma" />
                  <p className="text-xs text-muted-foreground">
                    {parsed.emails.length} correos{parsed.invalid.length ? ` · ${parsed.invalid.length} mal escritos (${parsed.invalid.slice(0, 3).join(', ')})` : ''}
                  </p>
                </>
              )}
              {who === 'birthday' && (
                <select value={month} onChange={(e) => setMonth(Number(e.target.value))} className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm">
                  {MONTHS.map((m, i) => <option key={m} value={i + 1}>Cumplen en {m}</option>)}
                </select>
              )}
              {!single && audience && (
                <p className="rounded-xl bg-muted/40 px-3 py-2 text-xs">
                  {preview.isLoading ? 'Contando…' : preview.data ? (
                    <>
                      Le llega a <b>{preview.data.count}</b> {preview.data.count === 1 ? 'cliente' : 'clientes'}
                      {preview.data.sample.length ? ` (${preview.data.sample.join(', ')}${preview.data.count > preview.data.sample.length ? '…' : ''})` : ''}
                      {preview.data.notCustomers.length ? ` · ${preview.data.notCustomers.length} correos no son clientes y se saltan` : ''}
                      {preview.data.overLimit ? ' · máximo 500 por envío' : ''}
                    </>
                  ) : null}
                </p>
              )}
            </div>
          )}

          <div className="space-y-2">
            <Label className="text-xs">Descuento</Label>
            <div className="flex gap-2">
              <div className="flex overflow-hidden rounded-md border border-border text-sm">
                {(['percentage', 'fixed'] as const).map((t) => (
                  <button key={t} type="button" onClick={() => { setType(t); setValue(t === 'fixed' ? 5000 : 15); }}
                    className={`px-3 ${type === t ? 'bg-primary/20 text-primary' : 'text-muted-foreground'}`}>{t === 'fixed' ? '$' : '%'}</button>
                ))}
              </div>
              <Input type="number" inputMode="numeric" min={1} value={value} onChange={(e) => setValue(Number(e.target.value))} className="w-32" aria-label="Valor del descuento" />
              <span className="flex items-center gap-1.5 text-sm">vale <Input type="number" min={1} max={365} value={days} onChange={(e) => setDays(Number(e.target.value))} className="w-20" aria-label="Días de validez" /> días</span>
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">¿Para qué fiesta?</Label>
            <select value={eventId ?? ''} onChange={(e) => setEventId(e.target.value ? Number(e.target.value) : null)} className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm">
              <option value="">Cualquier fiesta</option>
              {upcoming.map((e: any) => <option key={e.id} value={e.id}>{e.title} · {new Date(e.eventDate).toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })}</option>)}
            </select>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Motivo (lo ve el cliente)</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={100} placeholder={defaultCouponTitle(type, value || 0)} />
          </div>

          <label className="flex items-center justify-between gap-3 rounded-xl border border-border p-3">
            <span><span className="block text-sm font-medium">Avisarle por notificación</span><span className="text-xs text-muted-foreground">Solo le llega a quien tiene los avisos activados.</span></span>
            <Switch checked={notify} onCheckedChange={setNotify} />
          </label>
          {err && <p className="text-xs text-destructive">{err}</p>}
        </div>

        <DialogFooter>
          <WriteButton disabled={!canSend || pending} onClick={send}>
            {pending ? 'Regalando…' : `Regalar ${couponValueLabel(type, value || 0)}${!single && preview.data ? ` a ${preview.data.count}` : ''}`}
          </WriteButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
