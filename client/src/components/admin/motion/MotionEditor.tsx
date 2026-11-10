import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { ArrowDown, ArrowLeft, ArrowUp, Copy, Dices, Download, Film, ImagePlus, Loader2, Mic, Plus, Save, Send, Trash2, X } from 'lucide-react';
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
  MOTION_ACCENT_LABEL, MOTION_ACCENTS, MOTION_CARD_LABEL, MOTION_CARDS, MOTION_BASE_LABEL, MOTION_BASES, MOTION_CLOSING_LABEL, MOTION_CLOSINGS, MOTION_FORMAT_LABEL, MOTION_FORMATS, MOTION_MAX_SCENES, MOTION_MUSIC, MOTION_MUSIC_LABEL,
  MOTION_STYLE_LABEL, MOTION_STYLES, MOTION_TEMPLATE_LABEL, MOTION_TEMPLATES, emptyScene, motionTimeline, normalizeMotionSpec, voiceSays,
  type MotionScene, type MotionSpec,
} from '@shared/motionSpec';
import { specHash } from '@shared/studioRender';
import { LAYOUT_AUTO, LAYOUTS, randomSeed, resolveLayouts } from '@shared/motionVariety';
import { chileIsoDate } from '@shared/contentPlan';
import { TTS_VOICE_KEYS, TTS_VOICES, voiceScriptHash, type TtsVoice } from '@shared/studioVoice';
import { MotionPreview } from './MotionPreview';
import { PackPanel } from './PackPanel';
import { PublicacionControls } from './PublicacionControls';
import { saveVideoFile } from './saveVideo';

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

function Pick<T extends string>({ value, options, labels, onChange }: { value: T; options: readonly T[]; labels: Record<T, string>; onChange: (v: T) => void }) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as T)}>
      <SelectTrigger><SelectValue /></SelectTrigger>
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

export function MotionEditor({ id: initialId, initial, onBack }: { id: number | null; initial: MotionSpec; onBack: () => void }) {
  const utils = trpc.useUtils();
  const [id, setId] = useState<number | null>(initialId);
  const [spec, setSpecRaw] = useState<MotionSpec>(initial);
  const [savedHash, setSavedHash] = useState<string | null>(initialId ? JSON.stringify(initial) : null);
  const [view, setView] = useState<'video' | 'laminas'>('video');
  const [voiceKey, setVoiceKey] = useState<TtsVoice>((initial.voice?.voice as TtsVoice) || 'catalina');
  // Lo que se escribe queda tal cual (con sus espacios) mientras se edita; la
  // vista previa, la duración y lo que se guarda pasan por normalizeMotionSpec.
  const setSpec = (patch: Partial<MotionSpec>) => setSpecRaw((s) => ({ ...s, ...patch }));
  const setScene = (i: number, patch: Partial<MotionScene>) => setSpecRaw((s) => ({ ...s, scenes: s.scenes.map((sc, k) => (k === i ? { ...sc, ...patch } : sc)) }));
  const clean = useMemo(() => normalizeMotionSpec(spec), [spec]);
  const dirty = savedHash !== JSON.stringify(spec);

  const { data: stored } = trpc.motionStudio.get.useQuery({ id: id ?? 0 }, {
    enabled: id != null,
    refetchInterval: (q) => (q.state.data?.render.status === 'grabando' ? 5000 : false),
  });
  const { data: renderCfg } = trpc.motionStudio.renderConfig.useQuery();
  const { data: voiceCfg } = trpc.motionStudio.voiceConfig.useQuery();
  const { data: eventsData } = trpc.events.listAll.useQuery();
  const events = (eventsData ?? []).filter((e: any) => new Date(e.eventDate).getTime() > Date.now() - 86_400_000);

  const save = trpc.motionStudio.save.useMutation({
    onSuccess: ({ id: newId }) => {
      setId(newId);
      setSavedHash(JSON.stringify(spec));
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

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => { if (!dirty || confirm('Hay cambios sin guardar. ¿Salir igual?')) onBack(); }}>
          <ArrowLeft className="mr-1 h-4 w-4" /> Volver
        </Button>
        <Input className="h-9 max-w-xs font-medium" value={spec.title} maxLength={200} onChange={(e) => setSpec({ title: e.target.value })} />
        <span className="text-xs text-muted-foreground">{secs.toFixed(1)} s · {MOTION_TEMPLATE_LABEL[clean.template]} · {MOTION_STYLE_LABEL[clean.style]}</span>
        <div className="ml-auto flex flex-wrap gap-2">
          <WriteButton size="sm" variant={dirty ? 'default' : 'outline'} disabled={save.isPending} onClick={() => save.mutate({ id: id ?? undefined, spec: clean as unknown as Record<string, unknown> })}>
            {save.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Save className="mr-1 h-4 w-4" />} {dirty ? 'Guardar' : 'Guardado'}
          </WriteButton>
          <WriteButton
            size="sm"
            disabled={id == null || dirty || render.isPending || renderState?.status === 'grabando' || !!renderCfg?.missing.length}
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
        <div className="space-y-3 lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:self-start lg:overflow-y-auto">
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
          {view === 'video' ? <MotionPreview spec={clean} maxHeight={720} /> : <PackPanel spec={clean} />}
        </div>

        <div className="space-y-4">
          <Card className="rounded-2xl border-0 shadow-md shadow-black/5">
            <CardContent className="grid gap-3 pt-6 sm:grid-cols-2">
              <Field label="Plantilla"><Pick value={spec.template} options={MOTION_TEMPLATES} labels={MOTION_TEMPLATE_LABEL} onChange={(template) => setSpec({ template })} /></Field>
              <Field label="Estilo"><Pick value={spec.style} options={MOTION_STYLES} labels={MOTION_STYLE_LABEL} onChange={(style) => setSpec({ style })} /></Field>
              <Field label="Composición" hint="Cada escena usa una composición distinta del estilo; «Variar» prueba otras (gratis, sin IA).">
                <Button type="button" variant="outline" className="w-full justify-start" onClick={() => setSpec({ seed: randomSeed() })}>
                  <Dices className="mr-2 h-4 w-4" /> Variar composiciones
                </Button>
              </Field>
              <Field label="Fondo"><Pick value={spec.base} options={MOTION_BASES} labels={MOTION_BASE_LABEL} onChange={(base) => setSpec({ base })} /></Field>
              <Field label="Color de acento" hint="El protagonista: un solo elemento por cuadro."><Pick value={clean.accent} options={MOTION_ACCENTS} labels={MOTION_ACCENT_LABEL} onChange={(accent) => setSpec({ accent })} /></Field>
              <Field label="Formato"><Pick value={spec.format} options={MOTION_FORMATS} labels={MOTION_FORMAT_LABEL} onChange={(format) => setSpec({ format })} /></Field>
              <Field label="Música"><Pick value={spec.music} options={MOTION_MUSIC} labels={MOTION_MUSIC_LABEL} onChange={(music) => setSpec({ music })} /></Field>
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
              <label className="flex items-center gap-2 text-sm"><Switch checked={spec.sfx} onCheckedChange={(sfx) => setSpec({ sfx })} /> Efectos de sonido en los cortes</label>
              <label className="flex items-center gap-2 text-sm"><Switch checked={clean.hud} onCheckedChange={(hud) => setSpec({ hud })} /> Micro-textos de revista (bordes)</label>
              {spec.template !== 'sting' && (
                <label className="flex items-center gap-2 text-sm"><Switch checked={spec.outro} onCheckedChange={(outro) => setSpec({ outro })} /> Cerrar con la firma de la marca</label>
              )}
              {spec.outro && spec.template !== 'sting' && (
                <Field label="Cierre"><Pick value={clean.closing} options={MOTION_CLOSINGS} labels={MOTION_CLOSING_LABEL} onChange={(closing) => setSpec({ closing })} /></Field>
              )}
              {(spec.outro || spec.template === 'sting') && (
                <Field label="Frase bajo el logo"><Input value={spec.outroLine} maxLength={60} onChange={(e) => setSpec({ outroLine: e.target.value })} placeholder="Comenta INFO" /></Field>
              )}
              {spec.template === 'countdown' && (
                <div className="grid grid-cols-2 gap-3 sm:col-span-2">
                  <Field label="Número"><Input type="number" min={0} max={999} value={spec.countdown.value} onChange={(e) => setSpec({ countdown: { ...spec.countdown, value: Number(e.target.value) } })} /></Field>
                  <Field label="Unidad"><Input value={spec.countdown.unit} maxLength={16} onChange={(e) => setSpec({ countdown: { ...spec.countdown, unit: e.target.value } })} /></Field>
                </div>
              )}
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
                      <Button size="icon" variant="ghost" className="h-7 w-7" disabled={i === 0} onClick={() => moveScene(i, -1)}><ArrowUp className="h-4 w-4" /></Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7" disabled={i === spec.scenes.length - 1} onClick={() => moveScene(i, 1)}><ArrowDown className="h-4 w-4" /></Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7" disabled={spec.scenes.length <= 1} onClick={() => setSpec({ scenes: spec.scenes.filter((_, k) => k !== i), voice: null })}><Trash2 className="h-4 w-4" /></Button>
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
                      <div className="grid gap-3 sm:grid-cols-[1fr_2fr_90px]">
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
                      <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
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
    </div>
  );
}
