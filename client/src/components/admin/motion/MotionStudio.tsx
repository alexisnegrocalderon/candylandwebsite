import { useState } from 'react';
import { toast } from 'sonner';
import { ArrowLeft, Check, Clapperboard, Film, Loader2, Plus, Sparkles, Wand2, X } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { WriteButton } from '@/components/admin/WriteButton';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ImageUploadField } from '@/components/admin/ImageUploadField';
import { ConfirmDeleteButton } from '@/components/admin/ConfirmDeleteButton';
import { formatChileDate, formatChileDateTime } from '@shared/chileDate';
import { chileIsoDate, type ContentPiece } from '@shared/contentPlan';
import {
  MOTION_FORMAT_LABEL, MOTION_FORMATS, MOTION_STYLE_LABEL, MOTION_TEMPLATE_LABEL, MOTION_TEMPLATES, starterSpec,
  type MotionFormat, type MotionMedia, type MotionSpec, type MotionStyle, type MotionTemplate,
} from '@shared/motionSpec';
import { MotionEditor } from './MotionEditor';
import { MotionPreview } from './MotionPreview';
import { PlanPanel } from './PlanPanel';
import { randomSeed } from '@shared/motionVariety';
import { takeStudioEvent } from './handoff';

/* Estudio Motion (admin → Contenido → Estudio). Todo el contenido en un lugar:
 *  - Plan: el calendario hasta el evento; cada pieza → «Crear video».
 *  - Crear: una idea (y fotos, si hay) → la IA devuelve 3 variantes (liquid,
 *    glitch, editorial) en UNA llamada → el dueño elige y edita.
 *  - Mis videos: lo guardado, con su MP4.
 * La animación es Remotion (motion/), igual en la vista previa y en el MP4. */

type View =
  | { kind: 'home' }
  | { kind: 'variants'; variants: MotionSpec[]; costUsd: number }
  | { kind: 'edit'; id: number | null; spec: MotionSpec };

const TEMPLATE_HINT: Record<MotionTemplate, string> = {
  anuncio: 'Texto cinético para anunciar, explicar o invitar.',
  countdown: 'Número grande que frena con estallido. Para historias diarias.',
  montaje: 'Tus fotos y clips con Ken Burns, cortes a ritmo y texto.',
  sting: 'La firma animada de la marca (2-4 s) para abrir o cerrar.',
};

/** Puntos de partida sin IA: cada plantilla con el estilo que mejor la luce. */
const STARTERS: Array<{ key: string; template: MotionTemplate; style: MotionStyle; label: string; hint: string }> = [
  { key: 'playmore', template: 'anuncio', style: 'arcade', label: 'PLAYMORE · Player 1 vs Player 2', hint: 'El concepto arcade neón y el dress code por equipo: reel, carrusel, post e historia.' },
  { key: 'tema', template: 'anuncio', style: 'kinetic', label: 'Tema (kinetic)', hint: 'Frases que se arman palabra a palabra para hablar de un tema y parar el scroll.' },
  { key: 'anuncio', template: 'anuncio', style: 'editorial', label: MOTION_TEMPLATE_LABEL.anuncio, hint: TEMPLATE_HINT.anuncio },
  { key: 'countdown', template: 'countdown', style: 'glitch', label: MOTION_TEMPLATE_LABEL.countdown, hint: TEMPLATE_HINT.countdown },
  { key: 'montaje', template: 'montaje', style: 'kinetic', label: MOTION_TEMPLATE_LABEL.montaje, hint: TEMPLATE_HINT.montaje },
  { key: 'sting', template: 'sting', style: 'liquid', label: MOTION_TEMPLATE_LABEL.sting, hint: TEMPLATE_HINT.sting },
];

export function MotionStudio() {
  const [view, setView] = useState<View>({ kind: 'home' });
  // Una semilla por visita: cada punto de partida sale con su propia composición (y no cambian al volver a dibujar).
  const [baseSeed] = useState(randomSeed);
  const { data: eventsData } = trpc.events.listAll.useQuery();
  const upcoming = (eventsData ?? []).filter((e: any) => new Date(e.eventDate).getTime() > Date.now() && e.status === 'published');
  const [eventPick, setEventPick] = useState<number | null>(() => takeStudioEvent());
  const eventId = eventPick ?? upcoming[0]?.id ?? null;
  const pickedEvent = upcoming.find((e: any) => e.id === eventId);
  const eventDate = pickedEvent ? chileIsoDate(new Date(pickedEvent.eventDate)) : '';

  const [brief, setBrief] = useState('');
  const [template, setTemplate] = useState<MotionTemplate | 'auto'>('auto');
  const [format, setFormat] = useState<MotionFormat>('reel');
  const [media, setMedia] = useState<MotionMedia[]>([]);

  const generate = trpc.motionStudio.generate.useMutation({
    onSuccess: (r) => setView({ kind: 'variants', variants: r.variants as MotionSpec[], costUsd: r.costUsd }),
    onError: (e) => toast.error(e.message),
  });

  const create = (opts: { brief: string; template: MotionTemplate | null }) =>
    generate.mutate({ brief: opts.brief, template: opts.template, format, eventId, media });

  const fromPiece = (p: ContentPiece) => {
    const text = [`Gancho: ${p.hook}`, `Caption: ${p.caption}`, p.visual && `Qué se graba: ${p.visual}`, p.interaction && `Qué pedir: ${p.interaction}`].filter(Boolean).join('\n');
    setBrief(text);
    if (p.format === 'post') setFormat('feed');
    create({ brief: text, template: p.motion?.template ?? null });
  };

  if (view.kind === 'edit') {
    return <MotionEditor key={view.id ?? 'new'} id={view.id} initial={view.spec} onBack={() => setView({ kind: 'home' })} />;
  }

  if (view.kind === 'variants') {
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => setView({ kind: 'home' })}><ArrowLeft className="mr-1 h-4 w-4" /> Volver</Button>
          <h2 className="font-heading text-xl">Elige una dirección</h2>
          <span className="text-xs text-muted-foreground">3 variantes por US$ {view.costUsd.toFixed(3)} · después editas todo sin gastar IA</span>
        </div>
        <div className="grid gap-6 md:grid-cols-3">
          {view.variants.map((v) => (
            <div key={v.style} className="space-y-3">
              <MotionPreview spec={v} autoPlay maxHeight={560} />
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="font-medium">{MOTION_STYLE_LABEL[v.style]}</p>
                  <p className="text-xs text-muted-foreground">{v.scenes.length} escenas · {MOTION_TEMPLATE_LABEL[v.template]}</p>
                </div>
                <Button onClick={() => setView({ kind: 'edit', id: null, spec: v })}><Check className="mr-1 h-4 w-4" /> Usar esta</Button>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 font-heading text-2xl"><Clapperboard className="h-6 w-6" /> Estudio</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Videos de motion graphics con la marca: la IA escribe el guion y propone 3 direcciones de arte; tú eliges, editas en vivo y grabas el MP4.
          </p>
        </div>
        {upcoming.length > 0 && (
          <Select value={eventId != null ? String(eventId) : undefined} onValueChange={(v) => setEventPick(Number(v))}>
            <SelectTrigger className="w-72"><SelectValue placeholder="Evento" /></SelectTrigger>
            <SelectContent>{upcoming.map((e: any) => <SelectItem key={e.id} value={String(e.id)}>{e.title} · {formatChileDate(e.eventDate)}</SelectItem>)}</SelectContent>
          </Select>
        )}
      </div>

      <Tabs defaultValue="crear">
        <TabsList>
          <TabsTrigger value="crear">Crear</TabsTrigger>
          <TabsTrigger value="plan">Plan de contenido</TabsTrigger>
          <TabsTrigger value="videos">Mis videos</TabsTrigger>
        </TabsList>

        <TabsContent value="crear" className="space-y-6 pt-4">
          <Card className="rounded-2xl border-0 shadow-md shadow-black/5">
            <CardContent className="space-y-4 pt-6">
              <div className="space-y-1.5">
                <Label htmlFor="motion-brief">¿Qué quieres contar?</Label>
                <Textarea id="motion-brief" rows={3} maxLength={2000} value={brief} onChange={(e) => setBrief(e.target.value)}
                  placeholder="Ej: anunciar la fiesta del sábado con foco en que es la primera vez de mucha gente y que el consentimiento es lo primero." />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs">Plantilla</Label>
                  <Select value={template} onValueChange={(v) => setTemplate(v as MotionTemplate | 'auto')}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="auto">Que la IA elija</SelectItem>
                      {MOTION_TEMPLATES.map((t) => <SelectItem key={t} value={t}>{MOTION_TEMPLATE_LABEL[t]}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Formato</Label>
                  <Select value={format} onValueChange={(v) => setFormat(v as MotionFormat)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{MOTION_FORMATS.map((f) => <SelectItem key={f} value={f}>{MOTION_FORMAT_LABEL[f]}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Fotos o clips (opcional; para el montaje)</Label>
                {media.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {media.map((m, i) => (
                      <div key={m.url} className="relative">
                        {m.kind === 'video' ? <video src={m.url} muted className="h-20 w-14 rounded-lg object-cover" /> : <img src={m.url} alt="" className="h-20 w-14 rounded-lg object-cover" />}
                        <button type="button" className="absolute -right-1.5 -top-1.5 rounded-full bg-black/70 p-0.5 text-white" onClick={() => setMedia(media.filter((_, k) => k !== i))}><X className="h-3 w-3" /></button>
                      </div>
                    ))}
                  </div>
                )}
                {media.length < 12 && (
                  <ImageUploadField value="" pathPrefix="studio-motion" accept="image/*,video/mp4" label="Agregar foto o clip" hint="Se suben a tu almacenamiento; la IA solo sabe cuántas hay."
                    onChange={(url) => setMedia((m) => [...m, { url, kind: /\.(mp4|mov|webm)(\?|$)/i.test(url) ? 'video' : 'image' }])} />
                )}
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <WriteButton disabled={generate.isPending || brief.trim().length < 3} onClick={() => create({ brief, template: template === 'auto' ? null : template })}>
                  {generate.isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Dirigiendo 3 variantes…</> : <><Sparkles className="mr-2 h-4 w-4" /> Crear 3 variantes</>}
                </WriteButton>
                <span className="text-xs text-muted-foreground">Una sola llamada a Claude Sonnet (≈ US$ 0,01–0,02).</span>
              </div>
            </CardContent>
          </Card>

          <div>
            <h3 className="mb-3 flex items-center gap-2 font-medium"><Wand2 className="h-4 w-4" /> O parte de una plantilla, sin IA</h3>
            <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-5">
              {STARTERS.map(({ key, template, style, label, hint }, k) => {
                const spec = { ...starterSpec(template, style), format, eventId, eventDate, seed: (baseSeed + k * 7919) % 1_000_000 };
                return (
                  <button key={key} type="button" className="group space-y-2 text-left" onClick={() => setView({ kind: 'edit', id: null, spec })}>
                    <MotionPreview spec={spec} controls={false} still maxHeight={300} className="transition-transform group-hover:scale-[1.02]" />
                    <p className="text-sm font-medium">{label}</p>
                    <p className="text-xs text-muted-foreground">{hint}</p>
                  </button>
                );
              })}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="plan" className="pt-4">
          <div className="max-w-3xl">
            <PlanPanel eventId={eventId} onCreateVideo={fromPiece} busy={generate.isPending} />
          </div>
        </TabsContent>

        <TabsContent value="videos" className="pt-4">
          <VideoList onOpen={(id, spec) => setView({ kind: 'edit', id, spec })} onNew={() => setView({ kind: 'edit', id: null, spec: { ...starterSpec('anuncio'), eventId, eventDate, seed: randomSeed() } })} />
        </TabsContent>
      </Tabs>
      {generate.isPending && (
        <div className="fixed inset-x-0 bottom-6 z-50 mx-auto w-fit rounded-full bg-black/85 px-5 py-2.5 text-sm text-white shadow-xl">
          <Loader2 className="mr-2 inline h-4 w-4 animate-spin" /> Claude está dirigiendo las 3 variantes…
        </div>
      )}
    </div>
  );
}

function VideoList({ onOpen, onNew }: { onOpen: (id: number, spec: MotionSpec) => void; onNew: () => void }) {
  const utils = trpc.useUtils();
  const { data, isLoading, error, refetch } = trpc.motionStudio.list.useQuery();
  const [opening, setOpening] = useState<number | null>(null);
  const del = trpc.motionStudio.delete.useMutation({
    onSuccess: () => { utils.motionStudio.list.invalidate(); toast.success('Video borrado.'); },
    onError: (e) => toast.error(e.message),
  });
  const open = async (id: number) => {
    setOpening(id);
    try {
      const v = await utils.motionStudio.get.fetch({ id });
      onOpen(id, v.spec as MotionSpec);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo abrir.');
    } finally {
      setOpening(null);
    }
  };
  if (isLoading) return <Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" />;
  return (
    <div className="space-y-3">
      <Button variant="outline" size="sm" onClick={onNew}><Plus className="mr-1 h-4 w-4" /> Video en blanco</Button>
      {error && (
        <p className="text-sm text-red-600">
          No se pudo cargar la lista de videos: {error.message}{' '}
          <button type="button" className="underline" onClick={() => refetch()}>Reintentar</button>
        </p>
      )}
      {!error && !data?.length && <p className="text-sm text-muted-foreground">Todavía no guardas ningún video.</p>}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {data?.map((v) => (
          <Card key={v.id} className="rounded-2xl border-0 shadow-md shadow-black/5">
            <CardContent className="flex items-start gap-3 pt-5">
              <div className={`flex h-16 w-11 shrink-0 items-center justify-center rounded-lg text-white ${v.style === 'glitch' ? 'bg-[#0010DF]' : v.style === 'editorial' ? 'bg-[#EF8DFF]' : 'bg-[#00A3FF]'}`}>
                <Film className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{v.title}</p>
                <p className="text-xs text-muted-foreground">{MOTION_TEMPLATE_LABEL[v.template]} · {MOTION_STYLE_LABEL[v.style]} · {MOTION_FORMAT_LABEL[v.format]}</p>
                <p className="text-[11px] text-muted-foreground">
                  {formatChileDateTime(v.updatedAt)} · {v.render.status === 'listo' ? (v.renderFresh ? 'MP4 listo' : 'MP4 viejo') : v.render.status === 'grabando' ? 'Grabando…' : v.render.status === 'error' ? 'Error al grabar' : 'Sin MP4'}
                </p>
                <div className="mt-2 flex gap-2">
                  <Button size="sm" variant="outline" disabled={opening === v.id} onClick={() => open(v.id)}>
                    {opening === v.id ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null} Abrir
                  </Button>
                  {v.render.status === 'listo' && v.render.url && <a className="inline-flex items-center text-xs underline" href={v.render.url} target="_blank" rel="noreferrer">MP4</a>}
                  <ConfirmDeleteButton description={`el video «${v.title}»`} onConfirm={(adminPassword) => del.mutateAsync({ id: v.id, adminPassword })} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
