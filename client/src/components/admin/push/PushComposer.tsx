import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { CalendarClock, Send, Smartphone } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { WriteButton } from '@/components/admin/WriteButton';
import { ImageUploadField } from '@/components/admin/ImageUploadField';
import { PUSH_BODY_MAX, PUSH_TITLE_MAX } from '@shared/pushText';
import type { PushSegment } from '@shared/pushSegments';

const onErr = (e: unknown) => toast.error((e as { message?: string })?.message || 'No se pudo');

type SegType = PushSegment['type'];
const SEGMENTS: { id: SegType; label: string }[] = [
  { id: 'all', label: 'Todos los suscritos' },
  { id: 'nextEventNoTicket', label: 'Sin entrada para el próximo evento' },
  { id: 'nextEvent', label: 'Con entrada para el próximo evento' },
  { id: 'event', label: 'Compraron para un evento…' },
  { id: 'recentBuyers', label: 'Compraron en los últimos días…' },
  { id: 'neverBought', label: 'Nunca han comprado' },
  { id: 'ambassadors', label: 'Embajadores VIP' },
];

const LINKS = [
  { url: '/', label: 'Inicio' },
  { url: '/eventos', label: 'Eventos' },
  { url: '/concurso', label: 'Concurso' },
  { url: '/entradas', label: 'Precios' },
  { url: '/mi-entrada', label: 'Mi entrada' },
];

export interface ComposerDraft {
  id?: number;
  title: string;
  body: string;
  url: string;
  imageUrl: string;
  segment: PushSegment;
  scheduledAt: string;
}

export const emptyDraft = (): ComposerDraft => ({ title: '', body: '', url: '/', imageUrl: '', segment: { type: 'all' }, scheduledAt: '' });

/** "2026-10-21T21:30" (input local) ↔ ISO. */
const toLocalInput = (iso: string | null | undefined) => {
  if (!iso) return '';
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};
export const draftFromCampaign = (c: any): ComposerDraft => ({
  id: c.id, title: c.title, body: c.body, url: c.url, imageUrl: c.imageUrl ?? '', segment: c.segment, scheduledAt: toLocalInput(c.scheduledAt),
});

/** Vista previa: cómo se ve el aviso en la pantalla bloqueada. */
function NotificationPreview({ title, body, imageUrl }: { title: string; body: string; imageUrl: string }) {
  return (
    <div className="rounded-[22px] bg-white/10 p-3 backdrop-blur-xl">
      <div className="flex items-start gap-2.5">
        <img src="/candyland/favicon-192.png" alt="" className="h-9 w-9 shrink-0 rounded-[9px]" />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <p className="truncate text-[13px] font-semibold">{title || 'Título del aviso'}</p>
            <span className="shrink-0 text-[11px] text-white/45">ahora</span>
          </div>
          <p className="line-clamp-4 text-[13px] leading-snug text-white/80">{body || 'El texto aparece acá, hasta unas 4 líneas.'}</p>
        </div>
      </div>
      {imageUrl && <img src={imageUrl} alt="" className="mt-2.5 max-h-40 w-full rounded-xl object-cover" />}
    </div>
  );
}

export function PushComposer({ initial, onDone }: { initial: ComposerDraft; onDone: () => void }) {
  const [d, setD] = useState<ComposerDraft>(initial);
  useEffect(() => setD(initial), [initial]);
  const [testEmail, setTestEmail] = useState(() => { try { return localStorage.getItem('push.testEmail') ?? ''; } catch { return ''; } });
  const set = (patch: Partial<ComposerDraft>) => setD((prev) => ({ ...prev, ...patch }));

  const { data: events } = trpc.events.listAll.useQuery();
  const segmentReady = d.segment.type !== 'event' || !!(d.segment as any).eventId;
  const { data: preview, isFetching } = trpc.customerPush.preview.useQuery({ segment: d.segment as any }, { enabled: segmentReady });
  const utils = trpc.useUtils();
  const save = trpc.customerPush.save.useMutation({ onError: onErr });
  const send = trpc.customerPush.send.useMutation({ onError: onErr });
  const sendTest = trpc.customerPush.sendTest.useMutation({ onError: onErr });

  const valid = d.title.trim() && d.body.trim() && segmentReady;
  const payload = useMemo(() => ({
    id: d.id, title: d.title.trim(), body: d.body.trim(), url: d.url.trim() || '/', imageUrl: d.imageUrl || null,
    segment: d.segment as any, scheduledAt: d.scheduledAt ? new Date(d.scheduledAt).toISOString() : null,
  }), [d]);

  const refresh = () => { utils.customerPush.campaigns.invalidate(); utils.customerPush.stats.invalidate(); };

  const onSave = async (andSend: boolean) => {
    if (andSend && !payload.scheduledAt && !window.confirm(`¿Enviar ahora a ${preview?.recipients ?? 0} dispositivos?`)) return;
    try {
      const { id } = await save.mutateAsync(andSend && !payload.scheduledAt ? { ...payload, scheduledAt: null } : payload);
      if (andSend && !payload.scheduledAt) {
        const r = await send.mutateAsync({ id });
        toast.success(`Enviado a ${r.sent} de ${r.targeted} dispositivos${r.cappedOut ? ` (${r.cappedOut} ya recibieron uno hoy)` : ''}`);
      } else toast.success(payload.scheduledAt ? 'Campaña programada' : 'Borrador guardado');
      refresh();
      onDone();
    } catch { /* onErr ya avisó */ }
  };

  const onTest = async () => {
    try { localStorage.setItem('push.testEmail', testEmail); } catch { /* no importa */ }
    try {
      const r = await sendTest.mutateAsync({ email: testEmail, title: payload.title, body: payload.body, url: payload.url, imageUrl: payload.imageUrl });
      toast[r.devices ? 'success' : 'error'](r.devices ? `Prueba enviada a ${r.sent} de ${r.devices} dispositivos` : 'Ese correo no tiene avisos activados en ningún teléfono. Actívalos desde tu entrada en mansionplayroom.cl.');
    } catch { /* onErr ya avisó */ }
  };

  const seg = d.segment;
  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
      <div className="space-y-4">
        <div className="space-y-1.5">
          <div className="flex justify-between"><Label>Título</Label><span className="text-[11px] text-muted-foreground">{d.title.length}/{PUSH_TITLE_MAX}</span></div>
          <Input value={d.title} maxLength={PUSH_TITLE_MAX} onChange={(e) => set({ title: e.target.value })} placeholder="🔥 Preventa abierta" />
        </div>
        <div className="space-y-1.5">
          <div className="flex justify-between"><Label>Texto</Label><span className="text-[11px] text-muted-foreground">{d.body.length}/{PUSH_BODY_MAX}</span></div>
          <Textarea rows={3} value={d.body} maxLength={PUSH_BODY_MAX} onChange={(e) => set({ body: e.target.value })} placeholder="Las primeras 50 entradas con 20% de descuento. Solo hasta el viernes." />
        </div>
        <div className="space-y-1.5">
          <Label>Al tocarlo abre</Label>
          <div className="flex flex-wrap gap-1.5">
            {LINKS.map((l) => (
              <button key={l.url} type="button" onClick={() => set({ url: l.url })} className={`rounded-full px-3 py-1 text-xs ${d.url === l.url ? 'bg-primary text-white' : 'bg-muted text-muted-foreground'}`}>{l.label}</button>
            ))}
          </div>
          <Input value={d.url} onChange={(e) => set({ url: e.target.value })} placeholder="/eventos/halloween" />
          <p className="text-[11px] text-muted-foreground">Una ruta del sitio (empieza con /).</p>
        </div>
        <div className="space-y-1.5">
          <Label>Imagen (opcional, se ve en Android y computador)</Label>
          <ImageUploadField value={d.imageUrl} onChange={(url) => set({ imageUrl: url })} pathPrefix="push" />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>A quién</Label>
            <Select value={seg.type} onValueChange={(v) => set({ segment: v === 'recentBuyers' ? { type: 'recentBuyers', days: 90 } : v === 'event' ? { type: 'event', eventId: 0 } : { type: v as any } })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{SEGMENTS.map((s) => <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          {seg.type === 'event' && (
            <div className="space-y-1.5">
              <Label>Evento</Label>
              <Select value={seg.eventId ? String(seg.eventId) : ''} onValueChange={(v) => set({ segment: { type: 'event', eventId: Number(v) } })}>
                <SelectTrigger><SelectValue placeholder="Elige el evento" /></SelectTrigger>
                <SelectContent>{(events ?? []).map((e: any) => <SelectItem key={e.id} value={String(e.id)}>{e.title}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          )}
          {seg.type === 'recentBuyers' && (
            <div className="space-y-1.5">
              <Label>Días</Label>
              <Input type="number" min={1} max={730} value={seg.days} onChange={(e) => set({ segment: { type: 'recentBuyers', days: Math.max(1, Number(e.target.value) || 1) } })} />
            </div>
          )}
        </div>
        <div className="space-y-1.5">
          <Label>Programar (opcional)</Label>
          <Input type="datetime-local" value={d.scheduledAt} onChange={(e) => set({ scheduledAt: e.target.value })} className="max-w-xs" />
          <p className="text-[11px] text-muted-foreground">Sale en la siguiente vuelta de 15 minutos después de esa hora.</p>
        </div>
      </div>

      <div className="space-y-4">
        <div className="rounded-3xl bg-gradient-to-b from-[#2a1a3a] to-[#120a1a] p-4">
          <p className="mb-3 flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-white/50"><Smartphone className="h-3.5 w-3.5" /> Vista previa</p>
          <NotificationPreview title={d.title} body={d.body} imageUrl={d.imageUrl} />
        </div>
        <div className="admin-clay rounded-2xl p-4 text-sm">
          <p className="text-2xl font-bold tabular-nums">{!segmentReady ? '—' : isFetching && !preview ? '…' : preview?.recipients ?? 0}</p>
          <p className="text-muted-foreground">dispositivos reciben este aviso</p>
          {!!preview?.cappedOut && <p className="mt-1 text-xs text-amber-300">{preview.cappedOut} quedan fuera porque ya recibieron un aviso en las últimas 20 horas.</p>}
          {preview && preview.recipients > 0 && (
            <p className="mt-1 text-xs text-muted-foreground">{Object.entries(preview.byPlatform).map(([k, v]) => `${v} ${k === 'ios' ? 'iPhone' : k === 'android' ? 'Android' : 'computador'}`).join(' · ')}</p>
          )}
        </div>
        <div className="space-y-2">
          <WriteButton className="w-full" disabled={!valid || save.isPending || send.isPending} onClick={() => onSave(true)}>
            {d.scheduledAt ? <><CalendarClock className="mr-1.5 h-4 w-4" /> Programar</> : <><Send className="mr-1.5 h-4 w-4" /> Enviar ahora</>}
          </WriteButton>
          <WriteButton variant="outline" className="w-full" disabled={!d.title.trim() || !d.body.trim() || save.isPending} onClick={() => onSave(false)}>Guardar borrador</WriteButton>
        </div>
        <div className="space-y-1.5 border-t border-border pt-4">
          <Label>Mandarme una prueba</Label>
          <div className="flex gap-2">
            <Input type="email" value={testEmail} onChange={(e) => setTestEmail(e.target.value)} placeholder="tu correo de compra" />
            <WriteButton variant="outline" disabled={!testEmail.includes('@') || !d.title.trim() || !d.body.trim() || sendTest.isPending} onClick={onTest}>Probar</WriteButton>
          </div>
          <p className="text-[11px] text-muted-foreground">Llega a los teléfonos donde activaste avisos desde una entrada comprada con ese correo.</p>
        </div>
      </div>
    </div>
  );
}
