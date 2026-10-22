import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { BookmarkPlus, CalendarClock, Clock, FlaskConical, Send, Smartphone, Sparkles, X } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { WriteButton } from '@/components/admin/WriteButton';
import { ImageUploadField } from '@/components/admin/ImageUploadField';
import { AudienceBuilder } from './AudienceBuilder';
import { personalizeName, PUSH_BODY_MAX, PUSH_TITLE_MAX } from '@shared/pushText';
import { normalizeSegment, type PushSegment } from '@shared/pushSegments';

const onErr = (e: unknown) => toast.error((e as { message?: string })?.message || 'No se pudo');

const LINKS = [
  { url: '/', label: 'Inicio' },
  { url: '/eventos', label: 'Eventos' },
  { url: '/concurso', label: 'Concurso' },
  { url: '/entradas', label: 'Precios' },
  { url: '/mi-entrada', label: 'Mi entrada' },
  { url: '/app', label: 'Instalar app' },
];

interface Action { label: string; url: string }

export interface ComposerDraft {
  id?: number;
  title: string;
  body: string;
  url: string;
  imageUrl: string;
  segment: PushSegment;
  scheduledAt: string;
  smartHour: boolean;
  actions: Action[];
  ab: { on: boolean; titleB: string; bodyB: string; percent: number; waitMin: number };
}

export const emptyDraft = (): ComposerDraft => ({
  title: '', body: '', url: '/', imageUrl: '', segment: normalizeSegment(null), scheduledAt: '', smartHour: false, actions: [],
  ab: { on: false, titleB: '', bodyB: '', percent: 20, waitMin: 180 },
});

/** "2026-10-21T21:30" (input local) ↔ ISO. */
const toLocalInput = (iso: string | null | undefined) => {
  if (!iso) return '';
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};
export const draftFromCampaign = (c: any): ComposerDraft => ({
  id: c.id, title: c.title, body: c.body, url: c.url, imageUrl: c.imageUrl ?? '', segment: normalizeSegment(c.segment), scheduledAt: toLocalInput(c.scheduledAt),
  smartHour: c.smartHour === 1, actions: Array.isArray(c.actions) ? c.actions : [],
  ab: { on: c.abPercent > 0, titleB: c.titleB ?? '', bodyB: c.bodyB ?? '', percent: c.abPercent || 20, waitMin: c.abWaitMin || 180 },
});

/** Vista previa: cómo se ve el aviso en la pantalla bloqueada. */
function NotificationPreview({ title, body, imageUrl, actions }: { title: string; body: string; imageUrl: string; actions: Action[] }) {
  const sample = 'Camila';
  return (
    <div className="rounded-[22px] bg-white/10 p-3 backdrop-blur-xl">
      <div className="flex items-start gap-2.5">
        <img src="/candyland/favicon-192.png" alt="" className="h-9 w-9 shrink-0 rounded-[9px]" />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <p className="truncate text-[13px] font-semibold">{personalizeName(title, sample) || 'Título del aviso'}</p>
            <span className="shrink-0 text-[11px] text-white/45">ahora</span>
          </div>
          <p className="line-clamp-4 text-[13px] leading-snug text-white/80">{personalizeName(body, sample) || 'El texto aparece acá, hasta unas 4 líneas.'}</p>
        </div>
      </div>
      {imageUrl && <img src={imageUrl} alt="" className="mt-2.5 max-h-40 w-full rounded-xl object-cover" />}
      {actions.filter((a) => a.label).length > 0 && (
        <div className="mt-2.5 flex gap-2 border-t border-white/10 pt-2 text-center text-[12px] font-medium text-sky-300">
          {actions.filter((a) => a.label).map((a, i) => <span key={i} className="flex-1">{a.label}</span>)}
        </div>
      )}
    </div>
  );
}

/** Texto con atajos para insertar {nombre} / {evento} donde está el cursor (al final). */
function TokenChips({ onInsert }: { onInsert: (t: string) => void }) {
  return (
    <span className="flex gap-1">
      {['{nombre}', '{evento}'].map((t) => <button key={t} type="button" onClick={() => onInsert(t)} className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground hover:bg-muted/70">{t}</button>)}
    </span>
  );
}

function AiDraftBox({ onPick, audience }: { onPick: (d: { title: string; body: string }, asB: boolean) => void; audience: string }) {
  const [open, setOpen] = useState(false);
  const [idea, setIdea] = useState('');
  const [eventId, setEventId] = useState('');
  const { data: events } = trpc.events.listAll.useQuery(undefined, { enabled: open });
  const ai = trpc.customerPush.aiDraft.useMutation({ onError: onErr });
  if (!open) return <button type="button" onClick={() => setOpen(true)} className="inline-flex items-center gap-1.5 rounded-full bg-primary/15 px-3 py-1.5 text-xs font-medium text-primary"><Sparkles className="h-3.5 w-3.5" /> Redactar con IA</button>;
  return (
    <div className="space-y-2 rounded-2xl border border-primary/30 bg-primary/5 p-3">
      <div className="flex items-center justify-between"><p className="text-sm font-medium">¿Qué quieres avisar?</p><button type="button" onClick={() => setOpen(false)} aria-label="Cerrar"><X className="h-4 w-4 text-muted-foreground" /></button></div>
      <Textarea rows={2} value={idea} onChange={(e) => setIdea(e.target.value)} placeholder="Ej. Última preventa con 20% hasta el viernes, tono con urgencia suave" />
      <div className="flex flex-wrap items-center gap-2">
        <Select value={eventId} onValueChange={setEventId}>
          <SelectTrigger className="h-8 w-52 text-xs"><SelectValue placeholder="Evento (opcional)" /></SelectTrigger>
          <SelectContent>{(events ?? []).map((e: any) => <SelectItem key={e.id} value={String(e.id)}>{e.title}</SelectItem>)}</SelectContent>
        </Select>
        <WriteButton type="button" size="sm" disabled={idea.trim().length < 3 || ai.isPending} onClick={() => ai.mutate({ idea, eventId: eventId ? Number(eventId) : undefined, audience })}>{ai.isPending ? 'Redactando…' : 'Proponer 3'}</WriteButton>
      </div>
      {ai.data?.drafts.map((d, i) => (
        <div key={i} className="rounded-xl border border-border bg-card p-2.5">
          <p className="text-sm font-semibold">{d.title}</p>
          <p className="text-xs text-muted-foreground">{d.body}</p>
          <div className="mt-1.5 flex gap-3 text-[11px]">
            <button type="button" className="text-primary underline" onClick={() => onPick(d, false)}>Usar como aviso</button>
            <button type="button" className="text-muted-foreground underline" onClick={() => onPick(d, true)}>Usar como versión B (prueba A/B)</button>
          </div>
        </div>
      ))}
    </div>
  );
}

export function PushComposer({ initial, onDone }: { initial: ComposerDraft; onDone: () => void }) {
  const [d, setD] = useState<ComposerDraft>(initial);
  useEffect(() => setD(initial), [initial]);
  const [testEmail, setTestEmail] = useState(() => { try { return localStorage.getItem('push.testEmail') ?? ''; } catch { return ''; } });
  const [previewB, setPreviewB] = useState(false);
  const set = (patch: Partial<ComposerDraft>) => setD((prev) => ({ ...prev, ...patch }));
  const setAb = (patch: Partial<ComposerDraft['ab']>) => setD((prev) => ({ ...prev, ab: { ...prev.ab, ...patch } }));

  const segmentReady = d.segment.include.concat(d.segment.exclude).every((r) => !('eventId' in r) || r.eventId > 0) && d.segment.include.concat(d.segment.exclude).every((r) => !('campaignId' in r) || r.campaignId > 0);
  const { data: preview, isFetching } = trpc.customerPush.preview.useQuery({ segment: d.segment as any }, { enabled: segmentReady });
  const { data: templates, refetch: refetchTemplates } = trpc.customerPush.presets.useQuery({ kind: 'template' });
  const utils = trpc.useUtils();
  const save = trpc.customerPush.save.useMutation({ onError: onErr });
  const send = trpc.customerPush.send.useMutation({ onError: onErr });
  const sendTest = trpc.customerPush.sendTest.useMutation({ onError: onErr });
  const saveTemplate = trpc.customerPush.savePreset.useMutation({ onSuccess: () => { refetchTemplates(); toast.success('Plantilla guardada'); }, onError: onErr });

  const abValid = !d.ab.on || (d.ab.titleB.trim() && d.ab.bodyB.trim());
  const valid = d.title.trim() && d.body.trim() && segmentReady && abValid;
  const payload = useMemo(() => ({
    id: d.id, title: d.title.trim(), body: d.body.trim(), url: d.url.trim() || '/', imageUrl: d.imageUrl || null,
    segment: d.segment as any, scheduledAt: d.scheduledAt ? new Date(d.scheduledAt).toISOString() : null,
    smartHour: d.smartHour, actions: d.actions.filter((a) => a.label.trim()),
    ...(d.ab.on ? { titleB: d.ab.titleB.trim(), bodyB: d.ab.bodyB.trim(), abPercent: d.ab.percent, abWaitMin: d.ab.waitMin } : { titleB: null, bodyB: null, abPercent: 0 }),
  }), [d]);

  const refresh = () => { utils.customerPush.campaigns.invalidate(); utils.customerPush.stats.invalidate(); };

  const onSave = async (andSend: boolean) => {
    const now = andSend && !payload.scheduledAt;
    if (now && !window.confirm(`¿Enviar a ${preview?.recipients ?? 0} dispositivos${d.smartHour ? ' (cada uno a su mejor hora)' : ''}?`)) return;
    try {
      const { id } = await save.mutateAsync(payload);
      if (now) {
        const r = await send.mutateAsync({ id });
        toast.success(r.testing
          ? `Prueba A/B enviada a una muestra de ${r.targeted} personas; el ganador sale al resto en ${d.ab.waitMin} min`
          : `${r.sentNow} enviados ahora${r.later ? `, ${r.later} a su hora (se reparten en el día o salen a las 09:00)` : ''}${r.cappedOut ? ` · ${r.cappedOut} ya recibieron uno hoy` : ''}`);
      } else toast.success(payload.id ? 'Cambios guardados' : payload.scheduledAt ? 'Campaña programada' : 'Borrador guardado');
      refresh();
      onDone();
    } catch { /* onErr ya avisó */ }
  };

  const onTest = async () => {
    try { localStorage.setItem('push.testEmail', testEmail); } catch { /* no importa */ }
    try {
      const b = previewB && d.ab.on;
      const r = await sendTest.mutateAsync({ email: testEmail, title: b ? d.ab.titleB : payload.title, body: b ? d.ab.bodyB : payload.body, url: payload.url, imageUrl: payload.imageUrl });
      toast[r.devices ? 'success' : 'error'](r.devices ? `Prueba enviada a ${r.sent} de ${r.devices} dispositivos` : 'Ese correo no tiene avisos activados en ningún teléfono. Actívalos desde tu entrada en mansionplayroom.cl.');
    } catch { /* onErr ya avisó */ }
  };

  const shown = previewB && d.ab.on ? { title: d.ab.titleB, body: d.ab.bodyB } : { title: d.title, body: d.body };
  const addActions = () => set({ actions: [...d.actions, { label: '', url: '/' }].slice(0, 2) });

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
      <div className="space-y-5">
        {/* Plantillas e IA */}
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            {(templates ?? []).length > 0 && (
              <Select value="" onValueChange={(v) => { const t: any = (templates ?? []).find((x: any) => String(x.id) === v); if (t) set({ title: t.data.title, body: t.data.body, url: t.data.url || '/', imageUrl: t.data.imageUrl ?? '', actions: t.data.actions ?? [] }); }}>
                <SelectTrigger className="h-8 w-52 text-xs"><SelectValue placeholder="Usar una plantilla" /></SelectTrigger>
                <SelectContent>{(templates ?? []).map((t: any) => <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>)}</SelectContent>
              </Select>
            )}
            <WriteButton type="button" variant="outline" size="sm" disabled={!d.title.trim() || !d.body.trim() || saveTemplate.isPending} onClick={() => { const name = window.prompt('Nombre de la plantilla'); if (name?.trim()) saveTemplate.mutate({ kind: 'template', name, data: { title: d.title, body: d.body, url: d.url, imageUrl: d.imageUrl, actions: d.actions } }); }}>
              <BookmarkPlus className="mr-1 h-3.5 w-3.5" /> Guardar como plantilla
            </WriteButton>
          </div>
          <AiDraftBox audience={d.segment.include.length || d.segment.exclude.length ? 'audiencia segmentada' : 'todos los suscritos'} onPick={(dr, asB) => (asB ? setD((p) => ({ ...p, ab: { ...p.ab, on: true, titleB: dr.title, bodyB: dr.body } })) : set({ title: dr.title, body: dr.body }))} />
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between"><Label>Título</Label><span className="flex items-center gap-2"><TokenChips onInsert={(t) => set({ title: `${d.title}${t}` })} /><span className="text-[11px] text-muted-foreground">{d.title.length}/{PUSH_TITLE_MAX}</span></span></div>
          <Input value={d.title} maxLength={PUSH_TITLE_MAX} onChange={(e) => set({ title: e.target.value })} placeholder="🔥 Preventa abierta" />
        </div>
        <div className="space-y-1.5">
          <div className="flex items-center justify-between"><Label>Texto</Label><span className="flex items-center gap-2"><TokenChips onInsert={(t) => set({ body: `${d.body}${t}` })} /><span className="text-[11px] text-muted-foreground">{d.body.length}/{PUSH_BODY_MAX}</span></span></div>
          <Textarea rows={3} value={d.body} maxLength={PUSH_BODY_MAX} onChange={(e) => set({ body: e.target.value })} placeholder="{nombre}, las primeras 50 entradas con 20% de descuento. Solo hasta el viernes." />
          <p className="text-[11px] text-muted-foreground"><code>{'{nombre}'}</code> se cambia por el primer nombre de la persona (si no lo tenemos, se omite sin dejar el texto roto).</p>
        </div>

        <div className="space-y-1.5">
          <Label>Al tocarlo abre</Label>
          <div className="flex flex-wrap gap-1.5">
            {LINKS.map((l) => (
              <button key={l.url} type="button" onClick={() => set({ url: l.url })} className={`rounded-full px-3 py-1 text-xs ${d.url === l.url ? 'bg-primary text-white' : 'bg-muted text-muted-foreground'}`}>{l.label}</button>
            ))}
          </div>
          <Input value={d.url} onChange={(e) => set({ url: e.target.value })} placeholder="/eventos/halloween" />
          <p className="text-[11px] text-muted-foreground">Una ruta del sitio (empieza con /). Las compras que lleguen por este aviso quedan atribuidas a la campaña.</p>
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between"><Label>Botones (opcional)</Label>{d.actions.length < 2 && <button type="button" onClick={addActions} className="text-xs text-primary underline">+ Agregar botón</button>}</div>
          {d.actions.map((a, i) => (
            <div key={i} className="flex gap-2">
              <Input className="w-40" maxLength={24} placeholder="Comprar" value={a.label} onChange={(e) => set({ actions: d.actions.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })} />
              <Input placeholder="/checkout/halloween" value={a.url} onChange={(e) => set({ actions: d.actions.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)) })} />
              <button type="button" aria-label="Quitar" onClick={() => set({ actions: d.actions.filter((_, j) => j !== i) })} className="p-2 text-muted-foreground"><X className="h-4 w-4" /></button>
            </div>
          ))}
          {d.actions.length > 0 && <p className="text-[11px] text-muted-foreground">Los botones aparecen en Android y computador; en iPhone el aviso se ve sin ellos y abre el link de arriba.</p>}
        </div>

        <div className="space-y-1.5">
          <Label>Imagen (opcional, se ve en Android y computador)</Label>
          <ImageUploadField value={d.imageUrl} onChange={(url) => set({ imageUrl: url })} pathPrefix="push" />
        </div>

        <div className="space-y-2">
          <Label>A quién</Label>
          <AudienceBuilder value={d.segment} onChange={(segment) => set({ segment })} />
        </div>

        {/* Cuándo sale */}
        <div className="space-y-3 rounded-2xl border border-border p-4">
          <p className="text-sm font-medium">Cuándo sale</p>
          <label className="flex items-start justify-between gap-3">
            <span>
              <span className="flex items-center gap-1.5 text-sm"><Clock className="h-4 w-4 text-primary" /> A la mejor hora de cada persona</span>
              <span className="block text-[11px] text-muted-foreground">Cada teléfono lo recibe a la hora en que suele abrir la app (con pocos datos, a las 19:00), dentro de las próximas 24 h.</span>
            </span>
            <Switch checked={d.smartHour} onCheckedChange={(v) => set({ smartHour: v })} />
          </label>
          <div className="space-y-1.5">
            <Label className="text-xs">O programarlo para una fecha</Label>
            <Input type="datetime-local" value={d.scheduledAt} onChange={(e) => set({ scheduledAt: e.target.value })} className="max-w-xs" />
          </div>
          <p className="text-[11px] text-muted-foreground">Los avisos de promoción nunca salen entre las 23:00 y las 09:00 (hora de Chile): si les toca de madrugada, salen a las 09:00. El cron revisa cada 15 minutos.</p>
        </div>

        {/* Prueba A/B */}
        <div className="space-y-3 rounded-2xl border border-border p-4">
          <label className="flex items-start justify-between gap-3">
            <span>
              <span className="flex items-center gap-1.5 text-sm"><FlaskConical className="h-4 w-4 text-primary" /> Prueba A/B de dos versiones</span>
              <span className="block text-[11px] text-muted-foreground">Manda A y B a una muestra; la versión que más toquen sale al resto.</span>
            </span>
            <Switch checked={d.ab.on} onCheckedChange={(v) => setAb({ on: v })} />
          </label>
          {d.ab.on && (
            <div className="space-y-2.5">
              <div className="space-y-1"><Label className="text-xs">Título B</Label><Input value={d.ab.titleB} maxLength={PUSH_TITLE_MAX} onChange={(e) => setAb({ titleB: e.target.value })} /></div>
              <div className="space-y-1"><Label className="text-xs">Texto B</Label><Textarea rows={2} value={d.ab.bodyB} maxLength={PUSH_BODY_MAX} onChange={(e) => setAb({ bodyB: e.target.value })} /></div>
              <div className="flex flex-wrap items-center gap-3 text-xs">
                <span className="flex items-center gap-1.5">Muestra <Input type="number" min={10} max={50} className="h-8 w-16" value={d.ab.percent} onChange={(e) => setAb({ percent: Math.min(50, Math.max(10, Number(e.target.value) || 20)) })} /> %</span>
                <span className="flex items-center gap-1.5">Esperar <Input type="number" min={30} max={1440} step={30} className="h-8 w-20" value={d.ab.waitMin} onChange={(e) => setAb({ waitMin: Math.min(1440, Math.max(30, Number(e.target.value) || 180)) })} /> min</span>
              </div>
              <p className="text-[11px] text-muted-foreground">Con audiencias chicas (menos de ~40 personas) la diferencia entre A y B no es confiable.</p>
            </div>
          )}
        </div>
      </div>

      <div className="space-y-4">
        <div className="rounded-3xl bg-gradient-to-b from-[#2a1a3a] to-[#120a1a] p-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-white/50"><Smartphone className="h-3.5 w-3.5" /> Vista previa</p>
            {d.ab.on && (
              <span className="flex gap-1 text-[11px]">
                {[false, true].map((b) => <button key={String(b)} type="button" onClick={() => setPreviewB(b)} className={`rounded px-2 py-0.5 ${previewB === b ? 'bg-white/20 text-white' : 'text-white/50'}`}>{b ? 'B' : 'A'}</button>)}
              </span>
            )}
          </div>
          <NotificationPreview title={shown.title} body={shown.body} imageUrl={d.imageUrl} actions={d.actions} />
        </div>
        <div className="admin-clay rounded-2xl p-4 text-sm">
          <p className="text-2xl font-bold tabular-nums">{!segmentReady ? '—' : isFetching && !preview ? '…' : preview?.recipients ?? 0}</p>
          <p className="text-muted-foreground">dispositivos reciben este aviso</p>
          {!!preview?.cappedOut && <p className="mt-1 text-xs text-amber-300">{preview.cappedOut} quedan fuera porque ya recibieron un aviso en las últimas 20 horas.</p>}
          {preview && preview.recipients > 0 && (
            <>
              <p className="mt-1 text-xs text-muted-foreground">{Object.entries(preview.byPlatform).map(([k, v]) => `${v} ${k === 'ios' ? 'iPhone' : k === 'android' ? 'Android' : 'computador'}`).join(' · ')}</p>
              {/\{nombre\}/i.test(`${d.title} ${d.body}`) && <p className="mt-1 text-xs text-muted-foreground">{preview.named} de {preview.recipients} tienen nombre para el saludo.</p>}
            </>
          )}
        </div>
        <div className="space-y-2">
          <WriteButton className="w-full" disabled={!valid || save.isPending || send.isPending} onClick={() => onSave(true)}>
            {d.scheduledAt ? <><CalendarClock className="mr-1.5 h-4 w-4" /> {d.id ? 'Guardar cambios' : 'Programar'}</> : <><Send className="mr-1.5 h-4 w-4" /> {d.ab.on ? 'Enviar prueba A/B' : d.smartHour ? 'Enviar a su mejor hora' : 'Enviar ahora'}</>}
          </WriteButton>
          <WriteButton variant="outline" className="w-full" disabled={!d.title.trim() || !d.body.trim() || save.isPending} onClick={() => onSave(false)}>Guardar borrador</WriteButton>
        </div>
        <div className="space-y-1.5 border-t border-border pt-4">
          <Label>Mandarme una prueba</Label>
          <div className="flex gap-2">
            <Input type="email" value={testEmail} onChange={(e) => setTestEmail(e.target.value)} placeholder="tu correo de compra" />
            <WriteButton variant="outline" disabled={!testEmail.includes('@') || !shown.title.trim() || !shown.body.trim() || sendTest.isPending} onClick={onTest}>Probar</WriteButton>
          </div>
          <p className="text-[11px] text-muted-foreground">Llega a los teléfonos donde activaste avisos desde una entrada comprada con ese correo.</p>
        </div>
      </div>
    </div>
  );
}
