import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { ArrowDown, ArrowLeft, ArrowUp, Copy, Download, Eye, EyeOff, Film, ImagePlus, Loader2, Mic, Plus, Save, Trash2, X } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { WriteButton } from '@/components/admin/WriteButton';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ImageUploadField } from '@/components/admin/ImageUploadField';
import { CaptionReviewBox } from '@/components/admin/CaptionReview';
import {
  MOTION_ACCENT_LABEL, MOTION_ACCENTS, MOTION_CARD_LABEL, MOTION_CARDS, MOTION_BASE_LABEL, MOTION_BASES, MOTION_CLOSING_LABEL, MOTION_CLOSINGS, MOTION_FORMAT_LABEL, MOTION_FORMATS, MOTION_GLOW_LABEL, MOTION_GLOWS, MOTION_MAX_SCENES, MOTION_MUSIC, MOTION_MUSIC_LABEL,
  MOTION_STYLE_LABEL, MOTION_STYLES, MOTION_TEMPLATE_LABEL, MOTION_TEMPLATES, emptyScene, motionTimeline, normalizeMotionSpec, voiceSays,
  type MotionScene, type MotionSpec,
} from '@shared/motionSpec';
import { applyKeyword } from '@shared/motionSpec';
import { AI_MODELS, AI_MODEL_LABEL, motionCallEstimateUsd, type AiModel } from '@shared/studioAi';
import { MOTION_CUSTOM_BG, MOTION_CUSTOM_BG_LABEL, MOTION_CUSTOM_ENTRY, MOTION_CUSTOM_ENTRY_LABEL, MOTION_CUSTOM_FONTS, MOTION_CUSTOM_FONT_LABEL, normalizeCustom } from '@shared/motionSpec';
import { specHash } from '@shared/studioRender';
import { LAYOUT_AUTO, LAYOUTS, lookSignature, resolveLayouts } from '@shared/motionVariety';
import { chileIsoDate } from '@shared/contentPlan';
import { TTS_VOICE_KEYS, TTS_VOICES, voiceScriptHash, type TtsVoice } from '@shared/studioVoice';
import { MotionPreview } from './MotionPreview';
import { PackPanel } from './PackPanel';
import { SongPanel } from './SongPanel';
import { LookPanel } from './LookPanel';
import { rememberLook } from './lookMemory';
import { PublicacionControls } from './PublicacionControls';
import { saveVideoFile } from './saveVideo';
import { patchDraft } from './draft';
import { setLeaveGuard } from '@/components/admin/shell/leaveGuard';
import { useIsMobile } from '@/hooks/useMobile';

/* Editor del Estudio Motion: la vista previa a la izquierda (se actualiza al
 * instante, sin IA) y la receta a la derecha. Guardar, grabar a MP4 y mandar
 * a los embajadores. */

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      {children}
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

/** Una sección del formulario: título chico arriba, línea separadora y sus campos con aire parejo. */
function Group({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3 border-t border-border/50 pt-5 first:border-t-0 first:pt-0">
      <div className="space-y-0.5">
        <h3 className="text-sm font-semibold">{title}</h3>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

/** Interruptor en una fila entera (el texto a la izquierda, el botón a la derecha): se toca en cualquier parte. */
function ToggleRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-xl border border-border/60 px-3.5 py-2 text-sm">
      <span className="min-w-0">{label}</span>
      <Switch checked={checked} onCheckedChange={onChange} />
    </label>
  );
}

function Pick<T extends string>({ value, options, labels, onChange }: { value: T; options: readonly T[]; labels: Record<T, string>; onChange: (v: T) => void }) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as T)}>
      <SelectTrigger className="h-11 w-full min-w-0 [&_[data-slot=select-value]]:truncate"><SelectValue /></SelectTrigger>
      <SelectContent>
        {options.map((o) => <SelectItem key={o} value={o}>{labels[o]}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success('Copiado.');
  } catch {
    toast.error('No se pudo copiar.');
  }
}

export function MotionEditor({ id: initialId, initial, restored, onBack }: {
  id: number | null;
  initial: MotionSpec;
  /** El editor se reabrió desde el borrador del teléfono (draft.ts); `dirty` = tenía cambios sin guardar. */
  restored?: { dirty: boolean };
  onBack: () => void;
}) {
  const utils = trpc.useUtils();
  const [id, setId] = useState<number | null>(initialId);
  const [spec, setSpecRaw] = useState<MotionSpec>(initial);
  const [savedHash, setSavedHash] = useState<string | null>(initialId && !restored?.dirty ? JSON.stringify(initial) : null);
  // Celular: la vista previa es una ventanita flotante que se abre y se cierra desde la barra de abajo (así se ve el cambio
  // sin subir y bajar la pantalla). Cerrada no existe: es lo que más memoria gasta, y un iPhone sin memoria recarga la página.
  // Por eso mismo, al volver de una recarga parte cerrada.
  const isMobile = useIsMobile();
  const [previewOpen, setPreviewOpen] = useState(!restored);
  const [view, setView] = useState<'video' | 'laminas'>('video');
  // La barra de arriba del panel es fija y alta (título + pestañas): el video se pega justo debajo de ella (si no, queda tapado
  // al hacer scroll) y ocupa el alto que queda en pantalla. Se mide, porque cambia con el tamaño de letra y el ancho.
  const [dock, setDock] = useState({ top: 96, room: 640 });
  // Sin esto el sticky no funciona (ver `.motion-editing` en admin.css).
  useEffect(() => {
    document.documentElement.classList.add('motion-editing');
    return () => document.documentElement.classList.remove('motion-editing');
  }, []);
  useEffect(() => {
    const measure = () => {
      const bar = document.querySelector('.admin-topbar')?.getBoundingClientRect();
      // La barra queda pegada arriba (sticky top-0): su alto es lo que hay que dejarle libre.
      const top = Math.round((bar ? bar.height : 80) + 12);
      setDock({ top, room: Math.max(300, Math.min(900, window.innerHeight - top - 76)) });
    };
    measure();
    window.addEventListener('resize', measure);
    const bar = document.querySelector('.admin-topbar');
    const ro = typeof ResizeObserver !== 'undefined' && bar ? new ResizeObserver(measure) : null;
    if (bar) ro?.observe(bar);
    return () => { window.removeEventListener('resize', measure); ro?.disconnect(); };
  }, []);
  const [voiceKey, setVoiceKey] = useState<TtsVoice>((initial.voice?.voice as TtsVoice) || 'catalina');
  // Lo que se escribe queda tal cual (con sus espacios) mientras se edita; la
  // vista previa, la duración y lo que se guarda pasan por normalizeMotionSpec.
  const setSpec = (patch: Partial<MotionSpec>) => setSpecRaw((s) => ({ ...s, ...patch }));
  const setScene = (i: number, patch: Partial<MotionScene>) => setSpecRaw((s) => ({ ...s, scenes: s.scenes.map((sc, k) => (k === i ? { ...sc, ...patch } : sc)) }));
  const clean = useMemo(() => normalizeMotionSpec(spec), [spec]);
  const dirty = savedHash !== JSON.stringify(spec);

  // Borrador en el teléfono: cada cambio queda guardado (con una pausa corta) para reabrir acá mismo tras una recarga.
  useEffect(() => {
    const t = window.setTimeout(() => patchDraft({ edit: { id, spec, dirty } }), 400);
    return () => window.clearTimeout(t);
  }, [id, spec, dirty]);
  // Y al ir a segundo plano se guarda al tiro: iOS puede cerrar la página sin avisar mientras estás en otra app.
  useEffect(() => {
    const flush = () => { if (document.visibilityState === 'hidden') patchDraft({ edit: { id, spec, dirty } }); };
    document.addEventListener('visibilitychange', flush);
    window.addEventListener('pagehide', flush);
    return () => { document.removeEventListener('visibilitychange', flush); window.removeEventListener('pagehide', flush); };
  }, [id, spec, dirty]);
  // Con cambios sin guardar, el panel pregunta antes de abrir otra sección (barra de abajo, pestañas, buscador).
  useEffect(() => {
    if (!dirty) return;
    return setLeaveGuard(() => window.confirm('Este video tiene cambios sin guardar. Quedan como borrador en este teléfono y los recuperas al volver al Estudio.\n\n¿Salir igual?'));
  }, [dirty]);

  const { data: stored } = trpc.motionStudio.get.useQuery({ id: id ?? 0 }, {
    enabled: id != null,
    refetchInterval: (q) => (q.state.data?.render.status === 'grabando' ? 5000 : false),
  });
  const { data: renderCfg } = trpc.motionStudio.renderConfig.useQuery();
  const { data: voiceCfg } = trpc.motionStudio.voiceConfig.useQuery();
  const { data: canCustom } = trpc.motionStudio.canUseCustomStyle.useQuery();
  // Guion con IA para este video: reemplaza las escenas (sin guardar hasta pulsar Guardar).
  const [guionTema, setGuionTema] = useState('');
  const [guionDensidad, setGuionDensidad] = useState<'pocas' | 'medias' | 'muchas'>('medias');
  const [guionModelo, setGuionModelo] = useState<AiModel>('claude-sonnet-5-5');
  const [guionEscenas, setGuionEscenas] = useState<number | null>(null);
  const guion = trpc.motionStudio.generate.useMutation({
    onSuccess: (r) => {
      const v = r.variants[0] as MotionSpec | undefined;
      if (!v) return;
      setSpec({ scenes: v.scenes, caption: v.caption });
      toast.success(`Guion listo (≈ US$ ${r.costUsd.toFixed(3).replace('.', ',')}). Revísalo y guarda.`);
    },
    onError: (e) => toast.error(e.message),
  });
  const { data: eventsData } = trpc.events.listAll.useQuery();
  const events = (eventsData ?? []).filter((e: any) => new Date(e.eventDate).getTime() > Date.now() - 86_400_000);

  const save = trpc.motionStudio.save.useMutation({
    onSuccess: ({ id: newId }) => {
      setId(newId);
      setSavedHash(JSON.stringify(spec));
      // Queda en la memoria de looks: el próximo «Sorpréndeme» no repite esta combinación.
      rememberLook(lookSignature(clean));
      utils.motionStudio.list.invalidate();
      utils.motionStudio.get.invalidate({ id: newId });
      toast.success('Video guardado.');
    },
    onError: (e) => toast.error(e.message),
  });
  const render = trpc.motionStudio.render.useMutation({
    onSuccess: () => { utils.motionStudio.get.invalidate(); toast.success('Grabando en GitHub. Tarda 1 a 3 minutos.'); },
    onError: (e) => toast.error(e.message),
  });
  const voice = trpc.motionStudio.generateVoice.useMutation({
    onSuccess: (v) => {
      setSpec({ voice: { url: v.voiceUrl, hash: v.voiceHash, voice: voiceKey, rate: 0, pitch: 0, secs: v.secs }, captions: true });
      toast.success('Voz lista. Las escenas ahora duran lo que cada frase.');
    },
    onError: (e) => toast.error(e.message),
  });
  // Cola de la marca (@mansionplayroom): aprobar, quitar la aprobación y publicar como Reel.
  const approve = trpc.motionStudio.approve.useMutation({
    onSuccess: () => { utils.motionStudio.get.invalidate({ id: id ?? 0 }); utils.motionStudio.list.invalidate(); toast.success('Aprobado. Ya puedes publicarlo en Instagram.'); },
    onError: (e) => toast.error(e.message),
  });
  const unapprove = trpc.motionStudio.unapprove.useMutation({
    onSuccess: () => { utils.motionStudio.get.invalidate({ id: id ?? 0 }); utils.motionStudio.list.invalidate(); toast.success('Vuelve a «Por aprobar».'); },
    onError: (e) => toast.error(e.message),
  });
  const publish = trpc.motionStudio.publish.useMutation({
    onSuccess: () => { utils.motionStudio.get.invalidate({ id: id ?? 0 }); utils.motionStudio.list.invalidate(); toast.success('Publicado como Reel en @mansionplayroom.'); },
    onError: (e) => { utils.motionStudio.get.invalidate({ id: id ?? 0 }); toast.error(e.message); },
  });

  // Ctrl/Cmd+S guarda.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        save.mutate({ id: id ?? undefined, spec: clean as unknown as Record<string, unknown> });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [id, clean, save]);

  const secs = useMemo(() => motionTimeline(clean).total / 30, [clean]);
  const resolved = useMemo(() => resolveLayouts(clean), [clean]);
  const says = voiceSays(clean);
  const voiceFresh = !clean.voice || clean.voice.hash === voiceScriptHash({ says, voice: clean.voice.voice as TtsVoice, rate: clean.voice.rate, pitch: clean.voice.pitch });
  const renderState = stored?.render;
  const mp4Fresh = !!stored?.renderFresh && renderState?.contentHash === specHash(clean);
  const canAddScene = spec.template !== 'sting' && spec.scenes.length < MOTION_MAX_SCENES;

  const moveScene = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= spec.scenes.length) return;
    const scenes = [...spec.scenes];
    [scenes[i], scenes[j]] = [scenes[j], scenes[i]];
    setSpec({ scenes, voice: null });
  };

  const doSave = () => save.mutate({ id: id ?? undefined, spec: clean as unknown as Record<string, unknown> });
  const recording = renderState?.status === 'grabando' || render.isPending;
  const cannotRender = id == null || dirty || render.isPending || renderState?.status === 'grabando' || !!renderCfg?.missing.length;

  return (
    <div className="motion-studio space-y-4 pb-16 md:pb-0">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => { if (!dirty || confirm('Hay cambios sin guardar. Si sales, se descartan. ¿Salir igual?')) onBack(); }}>
          <ArrowLeft className="mr-1 h-4 w-4" /> Volver
        </Button>
        <Input className="h-9 min-w-0 flex-1 font-medium sm:max-w-xs" value={spec.title} maxLength={200} aria-label="Nombre del video" onChange={(e) => setSpec({ title: e.target.value })} />
        <span className="text-xs text-muted-foreground">{secs.toFixed(1)} s · {MOTION_TEMPLATE_LABEL[clean.template]} · {MOTION_STYLE_LABEL[clean.style]}</span>
        <div className="ml-auto hidden flex-wrap gap-2 md:flex">
          <WriteButton size="sm" variant={dirty ? 'default' : 'outline'} disabled={save.isPending} onClick={() => save.mutate({ id: id ?? undefined, spec: clean as unknown as Record<string, unknown> })}>
            {save.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Save className="mr-1 h-4 w-4" />} {dirty ? 'Guardar' : 'Guardado'}
          </WriteButton>
          <WriteButton
            size="sm"
            disabled={cannotRender}
            title={renderCfg?.missing.length ? `Falta configurar: ${renderCfg.missing.join(', ')}` : dirty ? 'Guarda antes de grabar' : undefined}
            onClick={() => id != null && render.mutate({ id })}
          >
            {renderState?.status === 'grabando' || render.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Film className="mr-1 h-4 w-4" />}
            {renderState?.status === 'grabando' ? 'Grabando…' : 'Grabar MP4'}
          </WriteButton>
        </div>
      </div>

      {renderState && renderState.status !== 'nunca' && (
        <div className={`flex flex-wrap items-center gap-3 rounded-xl px-4 py-2 text-sm ${renderState.status === 'error' ? 'bg-red-500/10 text-red-700' : 'bg-muted/60'}`}>
          {renderState.status === 'grabando' && <span>Grabando en GitHub Actions… se actualiza solo.</span>}
          {renderState.status === 'error' && <span>No se pudo grabar: {renderState.error}</span>}
          {renderState.status === 'listo' && renderState.url && (
            <>
              <span>{mp4Fresh ? 'MP4 listo.' : 'Hay un MP4, pero es de una versión anterior: vuelve a grabar.'}</span>
              <Button size="sm" variant="outline" onClick={() => void saveVideoFile(renderState.url!, clean.title)}><Download className="mr-1 h-4 w-4" /> Descargar / Guardar video</Button>
              {id != null && stored?.publicacion && (
                <PublicacionControls
                  estado={stored.publicacion.estadoActual}
                  igMediaId={stored.publicacion.igMediaId}
                  error={stored.publicacion.error}
                  mp4Fresh={mp4Fresh}
                  busy={approve.isPending || unapprove.isPending || publish.isPending}
                  onApprove={() => approve.mutate({ id })}
                  onUnapprove={() => unapprove.mutate({ id })}
                  onPublish={() => publish.mutate({ id })}
                />
              )}
            </>
          )}
        </div>
      )}
      {!!renderCfg?.missing.length && <p className="text-xs text-muted-foreground">Para grabar el MP4 falta configurar: {renderCfg.missing.join(', ')}. La vista previa funciona igual.</p>}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,420px)_1fr]">
        {/* Columna fija: el video queda a la vista y solo se desplaza el panel de la derecha. */}
        <div className="space-y-3 lg:sticky lg:z-20 lg:self-start lg:overflow-y-auto lg:overscroll-contain" style={isMobile ? undefined : { top: dock.top, maxHeight: `calc(100dvh - ${dock.top}px - 1rem)` }}>
          <div className="flex gap-1.5">
            {([['video', 'Video'], ['laminas', 'Carrusel · Post · Historia']] as const).map(([k, label]) => (
              <button
                key={k}
                type="button"
                onClick={() => setView(k)}
                className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${view === k ? 'border-primary bg-primary text-primary-foreground' : 'border-border hover:bg-muted'}`}
              >
                {label}
              </button>
            ))}
          </div>
          {view !== 'video' ? <PackPanel spec={clean} />
            : !isMobile ? <MotionPreview spec={clean} maxHeight={dock.room} />
              : (
                <p className="rounded-xl bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
                  La vista previa va en una ventanita flotante: ábrela o ciérrala con el ojo de la barra de abajo.
                </p>
              )}
        </div>

        <div className="space-y-4">
          <Card className="rounded-2xl border-0 shadow-md shadow-black/5">
            <CardContent className="space-y-6 pt-6">
              <Group title="Guion con IA" hint="Escribe las escenas por ti. Reemplaza las actuales (las fotos asignadas se quitan).">
                <Textarea rows={3} maxLength={2000} value={guionTema} onChange={(e) => setGuionTema(e.target.value)} placeholder="Ej: explicar cómo funciona el Playmatch y qué llevar a la fiesta." />
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Texto por escena"><Pick value={guionDensidad} options={['pocas', 'medias', 'muchas'] as const} labels={{ pocas: 'Pocas palabras', medias: 'Medias', muchas: 'Muchas palabras' }} onChange={setGuionDensidad} /></Field>
                  <Field label="Escenas"><Pick value={guionEscenas == null ? 'auto' : String(guionEscenas)} options={['auto', '3', '4', '5', '6', '7'] as const} labels={{ auto: 'Automático', '3': '3', '4': '4', '5': '5', '6': '6', '7': '7' }} onChange={(v) => setGuionEscenas(v === 'auto' ? null : Number(v))} /></Field>
                  <div className="sm:col-span-2">
                    <Field label="Modelo de IA" hint="Sonnet es el equilibrado; Opus escribe y dirige mejor, y cuesta más."><Pick value={guionModelo} options={AI_MODELS} labels={Object.fromEntries(AI_MODELS.map((m) => [m, `${AI_MODEL_LABEL[m]} · ≈ US$ ${motionCallEstimateUsd(m).toFixed(3).replace('.', ',')}`])) as Record<AiModel, string>} onChange={setGuionModelo} /></Field>
                  </div>
                </div>
                <WriteButton className="h-11 w-full sm:w-auto" disabled={guion.isPending || guionTema.trim().length < 3} onClick={() => guion.mutate({ brief: guionTema, format: spec.format, keyword: spec.keyword, model: guionModelo, density: guionDensidad, escenas: guionEscenas, style: spec.style, template: null, eventId: spec.eventId, media: [] })}>
                  {guion.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null} Escribir guion
                </WriteButton>
              </Group>

              <Group title="Formato y estilo">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Plantilla"><Pick value={spec.template} options={MOTION_TEMPLATES} labels={MOTION_TEMPLATE_LABEL} onChange={(template) => setSpec({ template })} /></Field>
                  <Field label="Formato"><Pick value={spec.format} options={MOTION_FORMATS} labels={MOTION_FORMAT_LABEL} onChange={(format) => setSpec({ format })} /></Field>
                  <Field label="Estilo"><Pick value={spec.style} options={MOTION_STYLES.filter((st) => st !== 'custom' || !!canCustom)} labels={MOTION_STYLE_LABEL} onChange={(style) => setSpec({ style })} /></Field>
                  <Field label="Evento">
                    <Select value={spec.eventId != null ? String(spec.eventId) : 'none'} onValueChange={(v) => {
                      const ev = events.find((e: any) => String(e.id) === v);
                      // La fecha va en la receta para el calendario del estilo softui.
                      setSpec({ eventId: v === 'none' ? null : Number(v), eventDate: ev ? chileIsoDate(new Date(ev.eventDate)) : '' });
                    }}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Sin evento</SelectItem>
                        {events.map((e: any) => <SelectItem key={e.id} value={String(e.id)}>{e.title}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </Field>
                </div>
                {spec.style === 'custom' && (
                  <div className="space-y-3 rounded-xl border border-border/60 p-3">
                    <p className="text-xs font-semibold text-muted-foreground">Estilo personalizado</p>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field label="Fuente"><Pick value={spec.custom.font} options={MOTION_CUSTOM_FONTS} labels={MOTION_CUSTOM_FONT_LABEL} onChange={(font) => setSpec({ custom: { ...spec.custom, font } })} /></Field>
                      <Field label="Fondo del estilo"><Pick value={spec.custom.bg} options={MOTION_CUSTOM_BG} labels={MOTION_CUSTOM_BG_LABEL} onChange={(bg) => setSpec({ custom: { ...spec.custom, bg } })} /></Field>
                      <Field label="Entrada del texto"><Pick value={spec.custom.entry} options={MOTION_CUSTOM_ENTRY} labels={MOTION_CUSTOM_ENTRY_LABEL} onChange={(entry) => setSpec({ custom: { ...spec.custom, entry } })} /></Field>
                      <Field label="Velocidad (0,6 a 1,6)"><Input className="h-11" type="number" inputMode="decimal" step={0.1} min={0.6} max={1.6} value={spec.custom.speed} onChange={(e) => setSpec({ custom: normalizeCustom({ ...spec.custom, speed: Number(e.target.value) }) })} /></Field>
                    </div>
                    <ToggleRow label="Solo mayúsculas" checked={spec.custom.uppercase} onChange={(uppercase) => setSpec({ custom: { ...spec.custom, uppercase } })} />
                  </div>
                )}
              </Group>

              <Group title="Look" hint="Lo que hace que cada video se vea distinto. Gratis, sin IA.">
                <LookPanel clean={clean} onChange={setSpec} />
              </Group>

              <Group title="Color y sonido">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Fondo"><Pick value={spec.base} options={MOTION_BASES} labels={MOTION_BASE_LABEL} onChange={(base) => setSpec({ base })} /></Field>
                  <Field label="Color de acento" hint="El protagonista: un solo elemento por cuadro."><Pick value={clean.accent} options={MOTION_ACCENTS} labels={MOTION_ACCENT_LABEL} onChange={(accent) => setSpec({ accent })} /></Field>
                  {!spec.song && <Field label="Música de la casa"><Pick value={spec.music} options={MOTION_MUSIC} labels={MOTION_MUSIC_LABEL} onChange={(music) => setSpec({ music })} /></Field>}
                </div>
                <ToggleRow label="Efectos de sonido en los cortes" checked={spec.sfx} onChange={(sfx) => setSpec({ sfx })} />
                <ToggleRow label="Micro-textos de revista (bordes)" checked={clean.hud} onChange={(hud) => setSpec({ hud })} />
              </Group>

              <Group title="Ritmo y luz" hint="Sube una canción y todo el video se mueve a su pulso. La luz respira con la música.">
                <SongPanel song={spec.song} videoSecs={secs} onChange={(song) => setSpec({ song })} />
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Luz de fondo"><Pick value={spec.glow} options={MOTION_GLOWS} labels={MOTION_GLOW_LABEL} onChange={(glow) => setSpec({ glow })} /></Field>
                </div>
                <ToggleRow label="Loop: que se repita sin corte" checked={spec.loop} onChange={(loop) => setSpec({ loop })} />
                {spec.loop && !(spec.song || spec.music !== 'none') && <p className="text-xs text-amber-700">Sin música ni canción no hay pulso: el loop no cambia la duración.</p>}
                {spec.loop && <p className="text-xs text-muted-foreground">Dura compases enteros, se funde al fondo al final y la música no se apaga, para que al repetirse el golpe caiga justo.</p>}
              </Group>

              <Group title="Cierre y comentarios">
                {spec.template !== 'sting' && (
                  <ToggleRow label="Cerrar con la firma de la marca" checked={spec.outro} onChange={(outro) => setSpec({ outro })} />
                )}
                <div className="grid gap-3 sm:grid-cols-2">
                  {spec.outro && spec.template !== 'sting' && (
                    <Field label="Cierre"><Pick value={clean.closing} options={MOTION_CLOSINGS} labels={MOTION_CLOSING_LABEL} onChange={(closing) => setSpec({ closing })} /></Field>
                  )}
                  <Field label="Palabra clave de comentarios"><Input className="h-11" value={spec.keyword} maxLength={20} onChange={(e) => setSpecRaw((s) => applyKeyword(s, e.target.value))} placeholder="INFO" /></Field>
                  {(spec.outro || spec.template === 'sting') && (
                    <div className="sm:col-span-2">
                      <Field label="Frase bajo el logo"><Input className="h-11" value={spec.outroLine} maxLength={60} onChange={(e) => setSpec({ outroLine: e.target.value })} placeholder="Comenta INFO" /></Field>
                    </div>
                  )}
                </div>
                {spec.template === 'countdown' && (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Número"><Input className="h-11" type="number" inputMode="numeric" min={0} max={999} value={spec.countdown.value} onChange={(e) => setSpec({ countdown: { ...spec.countdown, value: Number(e.target.value) } })} /></Field>
                    <Field label="Unidad"><Input className="h-11" value={spec.countdown.unit} maxLength={16} onChange={(e) => setSpec({ countdown: { ...spec.countdown, unit: e.target.value } })} /></Field>
                  </div>
                )}
              </Group>
            </CardContent>
          </Card>

          <div className="space-y-3">
            {spec.scenes.map((scene, i) => (
              <Card key={i} className="rounded-2xl border-0 shadow-md shadow-black/5">
                <CardContent className="space-y-3 pt-5">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold">
                      {spec.template === 'sting' ? 'Firma' : spec.template === 'countdown' && i === 0 ? 'Escena 1 · número grande' : `Escena ${i + 1}`}
                    </span>
                    <div className="ml-auto flex gap-1">
                      <Button size="icon" variant="ghost" className="h-7 w-7 [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11" disabled={i === 0} onClick={() => moveScene(i, -1)}><ArrowUp className="h-4 w-4" /></Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7 [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11" disabled={i === spec.scenes.length - 1} onClick={() => moveScene(i, 1)}><ArrowDown className="h-4 w-4" /></Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7 [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11" disabled={spec.scenes.length <= 1} onClick={() => setSpec({ scenes: spec.scenes.filter((_, k) => k !== i), voice: null })}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  </div>
                  {spec.template === 'sting' ? (
                    <Field label="Frase (opcional)"><Input value={scene.sub} maxLength={140} onChange={(e) => setScene(i, { sub: e.target.value })} /></Field>
                  ) : (
                    <>
                      <div className="grid gap-3 sm:grid-cols-[1fr_2fr]">
                        <Field label="Etiqueta"><Input value={scene.kicker} maxLength={40} onChange={(e) => setScene(i, { kicker: e.target.value })} placeholder="SÁBADO 14" /></Field>
                        <Field label="Texto grande" hint="5 palabras o menos se leen mejor."><Input value={scene.text} maxLength={90} onChange={(e) => setScene(i, { text: e.target.value })} /></Field>
                      </div>
                      <Field label="Composición de esta escena" hint={scene.layout === LAYOUT_AUTO ? `Automática: ${LAYOUTS[clean.style].find((l) => l.key === resolved[i])?.label ?? 'la clásica'}.` : undefined}>
                        <Select value={scene.layout && scene.layout !== LAYOUT_AUTO && LAYOUTS[clean.style].some((l) => l.key === scene.layout) ? scene.layout : LAYOUT_AUTO} onValueChange={(layout) => setScene(i, { layout })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value={LAYOUT_AUTO}>Automática (la elige la semilla)</SelectItem>
                            {LAYOUTS[clean.style].map((l) => <SelectItem key={l.key} value={l.key}>{l.label}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </Field>
                      <div className="grid grid-cols-2 gap-3 sm:grid-cols-[1fr_2fr_90px] [&>*:nth-child(2)]:col-span-2 sm:[&>*:nth-child(2)]:col-span-1 [&>*:nth-child(2)]:order-last sm:[&>*:nth-child(2)]:order-none">
                        <Field label="Palabra destacada"><Input value={scene.highlight} maxLength={40} onChange={(e) => setScene(i, { highlight: e.target.value })} /></Field>
                        <Field label="Bajada"><Input value={scene.sub} maxLength={140} onChange={(e) => setScene(i, { sub: e.target.value })} /></Field>
                        <Field label="Segundos"><Input type="number" step={0.1} min={1} max={8} value={scene.secs} disabled={!!spec.voice} onChange={(e) => setScene(i, { secs: Number(e.target.value) })} /></Field>
                      </div>
                      {clean.style === 'softui' && (
                        <div className="grid gap-3 sm:grid-cols-[200px_1fr]">
                          <Field label="Tarjeta"><Pick value={scene.card ?? 'ninguna'} options={MOTION_CARDS} labels={MOTION_CARD_LABEL} onChange={(card) => setScene(i, { card })} /></Field>
                          {(scene.card === 'checklist' || scene.card === 'chat' || scene.card === 'evento') && (
                            <Field label={scene.card === 'chat' ? 'Mensajes (uno por línea)' : 'Ítems (uno por línea)'}>
                              <Textarea rows={3} value={(scene.items ?? []).join('\n')} onChange={(e) => setScene(i, { items: e.target.value.split('\n').slice(0, 5) })} />
                            </Field>
                          )}
                          {scene.card === 'calendario' && !clean.eventDate && <p className="text-xs text-amber-700 sm:col-span-2">Elige un evento arriba para que el calendario marque su fecha.</p>}
                        </div>
                      )}
                      <Field label="Voz en off de esta escena (opcional)"><Input value={scene.say} maxLength={180} onChange={(e) => setScene(i, { say: e.target.value })} placeholder="Si queda vacío, la voz lee el texto grande" /></Field>
                      {scene.media ? (
                        <div className="flex items-center gap-3">
                          {scene.media.kind === 'video'
                            ? <video src={scene.media.url} className="h-16 w-12 rounded-lg object-cover" muted />
                            : <img src={scene.media.url} alt="" className="h-16 w-12 rounded-lg object-cover" />}
                          <Button size="sm" variant="ghost" onClick={() => setScene(i, { media: null })}><X className="mr-1 h-4 w-4" /> Quitar fondo</Button>
                        </div>
                      ) : (
                        <ImageUploadField
                          value=""
                          pathPrefix="studio-motion"
                          accept="image/*,video/mp4"
                          label="Foto o clip de fondo"
                          hint={spec.template === 'montaje' ? 'En el montaje cada escena lleva su foto o clip.' : 'Opcional.'}
                          onChange={(url) => setScene(i, { media: { url, kind: /\.(mp4|mov|webm)(\?|$)/i.test(url) ? 'video' : 'image' } })}
                        />
                      )}
                    </>
                  )}
                </CardContent>
              </Card>
            ))}
            {canAddScene && (
              <Button variant="outline" className="w-full" onClick={() => setSpec({ scenes: [...spec.scenes, emptyScene('Nueva escena')], voice: null })}>
                <Plus className="mr-1 h-4 w-4" /> Agregar escena
              </Button>
            )}
          </div>

          {spec.template !== 'sting' && (
            <Card className="rounded-2xl border-0 shadow-md shadow-black/5">
              <CardContent className="space-y-3 pt-6">
                <div className="flex items-center gap-2 font-medium"><Mic className="h-4 w-4" /> Voz en off y subtítulos</div>
                <p className="text-xs text-muted-foreground">Voz chilena de Azure. Cada escena dura lo que su frase, y los subtítulos salen palabra por palabra.</p>
                <div className="flex flex-wrap items-end gap-3">
                  <Field label="Voz">
                    <Select value={voiceKey} onValueChange={(v) => setVoiceKey(v as TtsVoice)}>
                      <SelectTrigger className="w-full sm:w-56"><SelectValue /></SelectTrigger>
                      <SelectContent>{TTS_VOICE_KEYS.map((k) => <SelectItem key={k} value={k}>{TTS_VOICES[k].label}</SelectItem>)}</SelectContent>
                    </Select>
                  </Field>
                  <WriteButton
                    variant="outline"
                    disabled={voice.isPending || !!voiceCfg?.missing.length || says.some((s) => !s)}
                    onClick={() => voice.mutate({ says, voice: voiceKey, rate: 0, pitch: 0 })}
                  >
                    {voice.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Mic className="mr-1 h-4 w-4" />} {spec.voice ? 'Volver a generar' : 'Generar voz'}
                  </WriteButton>
                  {spec.voice && (
                    <>
                      <label className="flex items-center gap-2 text-sm"><Switch checked={spec.captions} onCheckedChange={(captions) => setSpec({ captions })} /> Subtítulos</label>
                      <Button variant="ghost" size="sm" onClick={() => setSpec({ voice: null, captions: false })}><X className="mr-1 h-4 w-4" /> Quitar voz</Button>
                    </>
                  )}
                </div>
                {!!voiceCfg?.missing.length && <p className="text-xs text-muted-foreground">Falta configurar: {voiceCfg.missing.join(', ')}.</p>}
                {clean.voice && !voiceFresh && <p className="text-xs text-amber-700">Cambiaste textos o la voz después de generarla: vuelve a generarla para que calce.</p>}
              </CardContent>
            </Card>
          )}

          <Card className="rounded-2xl border-0 shadow-md shadow-black/5">
            <CardContent className="space-y-3 pt-6">
              <div className="flex items-center justify-between">
                <Label>Caption para Instagram</Label>
                <Button size="sm" variant="ghost" onClick={() => copyText(spec.caption)} disabled={!spec.caption}><Copy className="mr-1 h-4 w-4" /> Copiar</Button>
              </div>
              <Textarea rows={5} value={spec.caption} maxLength={2200} onChange={(e) => setSpec({ caption: e.target.value })} />
              {spec.caption && <CaptionReviewBox caption={spec.caption} />}
            </CardContent>
          </Card>
          <p className="flex items-center gap-1 text-xs text-muted-foreground"><ImagePlus className="h-3.5 w-3.5" /> Editar textos, fotos y estilos no gasta IA. Ctrl/⌘+S guarda.</p>
        </div>
      </div>

      {/* ── Celular: ventanita flotante con la vista previa y barra fija con las acciones ──
          Van sobre la barra inferior del panel, a la izquierda del botón del Asistente. */}
      {isMobile && view === 'video' && previewOpen && (
        <div className="fixed left-3 z-40 w-[54vw] max-w-[240px] bottom-[calc(env(safe-area-inset-bottom)+10.5rem)]">
          <MotionPreview spec={clean} maxHeight={430} className="ring-1 ring-white/20" />
          <button type="button" aria-label="Ocultar la vista previa" onClick={() => setPreviewOpen(false)}
            className="absolute -right-3 -top-3 grid h-9 w-9 place-items-center rounded-full bg-black/80 text-white ring-1 ring-white/25">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
      {isMobile && (
        <div className="motion-actionbar fixed left-3 right-[4.75rem] z-40 flex items-center gap-1.5 rounded-full p-1.5 bottom-[calc(env(safe-area-inset-bottom)+6.75rem)]">
          <button type="button" aria-pressed={previewOpen && view === 'video'} aria-label={previewOpen && view === 'video' ? 'Ocultar la vista previa' : 'Ver la vista previa'} onClick={() => { setView('video'); setPreviewOpen(view === 'video' ? !previewOpen : true); }}
            className="flex h-10 shrink-0 items-center gap-1.5 rounded-full px-3 text-sm font-medium text-white/90 active:bg-white/10">
            {previewOpen && view === 'video' ? <EyeOff className="h-4 w-4" /> : <><Eye className="h-4 w-4" /> Ver</>}
          </button>
          <WriteButton size="sm" className="h-10 min-w-0 flex-1 rounded-full" variant={dirty ? 'default' : 'outline'} disabled={save.isPending} onClick={doSave}>
            {save.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Save className="mr-1 h-4 w-4" />} {dirty ? 'Guardar' : 'Guardado'}
          </WriteButton>
          <WriteButton size="sm" className="h-10 min-w-0 flex-1 rounded-full" disabled={cannotRender}
            onClick={() => (id != null && !dirty ? render.mutate({ id }) : toast.info('Guarda antes de grabar el MP4.'))}>
            {recording ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Film className="mr-1 h-4 w-4" />} {renderState?.status === 'grabando' ? 'Grabando…' : 'MP4'}
          </WriteButton>
        </div>
      )}
    </div>
  );
}
