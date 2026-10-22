import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import JSZip from 'jszip';
import { ArrowDown, ArrowLeft, ArrowUp, Clapperboard, Copy, Download, Loader2, Plus, Save, Trash2, X } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { WriteButton } from '@/components/admin/WriteButton';
import { ImageUploadField } from '@/components/admin/ImageUploadField';
import { normalizeStudioDesign, STUDIO_THEMES, type StudioTheme } from '@shared/contentStudio';
import { VARIANT_THEME_LABEL } from '@shared/studioVariants';
import {
  normalizeStudioVideo,
  projectAssets,
  siteAssets,
  slidesVideoHtml,
  videoCompositionHtml,
  videoTimeline,
  VIDEO_FORMAT_LABEL,
  VIDEO_FORMATS,
  VIDEO_MAX_SCENES,
  VIDEO_MAX_SECS,
  VIDEO_MIN_SECS,
  VIDEO_SIZES,
  VIDEO_TEMPLATE_LABEL,
  type AssetUrl,
  type StudioVideo,
  type VideoFormat,
} from '@shared/studioVideo';
import { StudioSlideView } from './StudioSlideView';
import { VideoPreview } from './VideoPreview';
import { slideFileName } from './exportSlides';

/* Editor de videos del Estudio (HyperFrames): reels 9:16 y posts animados 3:4
 * con las plantillas de marca. A la izquierda la vista previa (el mismo HTML
 * que se graba), a la derecha las escenas. Sin IA: no gasta créditos.
 * Grabar el MP4 desde el panel llega con la exportación en la nube; mientras,
 * «Descargar proyecto» entrega la carpeta lista para `npx hyperframes render`. */

export interface VideoEditing {
  id?: number;
  video: StudioVideo;
  dirty: boolean;
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success('Texto copiado.');
  } catch {
    toast.error('No se pudo copiar. Mantén apretado el texto para copiarlo a mano.');
  }
}

/** Las láminas de «laminas» dibujadas a tamaño real, fuera de pantalla, para
 * pasar su HTML a la composición. */
function useSlidesHtml(video: StudioVideo) {
  const refs = useRef<(HTMLDivElement | null)[]>([]);
  const [html, setHtml] = useState<string[]>([]);
  const design = video.template === 'laminas' ? video.design : null;
  const key = design ? JSON.stringify(design) : '';
  useEffect(() => {
    if (!design) { setHtml([]); return; }
    // Un cuadro después del render: las láminas ya están en el DOM.
    const t = window.setTimeout(() => {
      setHtml(refs.current.slice(0, design.slides.length).map((n) => n?.outerHTML ?? ''));
    }, 0);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const nodes = design ? (
    <div aria-hidden style={{ position: 'fixed', left: -20000, top: 0, pointerEvents: 'none' }}>
      {design.slides.map((s, i) => (
        <StudioSlideView key={i} ref={(el) => { refs.current[i] = el; }} theme={design.theme} format={design.format} slide={s} index={i} total={design.slides.length} showBrand={design.showBrand} />
      ))}
    </div>
  ) : null;
  return { slidesHtml: html, nodes };
}

function compose(video: StudioVideo, slidesHtml: string[], asset: AssetUrl): string {
  if (video.template === 'laminas') {
    return slidesVideoHtml({ asset, title: video.title, format: video.format, slidesHtml, secsPerSlide: video.secsPerSlide });
  }
  return videoCompositionHtml(video, { asset });
}

/** Baja cada archivo que usa el video (fuentes, logo, fotos) y arma la
 * carpeta de HyperFrames en un ZIP. */
async function downloadProject(video: StudioVideo, slidesHtml: string[]) {
  const { assetUrl, files } = projectAssets();
  const html = compose(video, slidesHtml, assetUrl);
  const zip = new JSZip();
  const name = slideFileName(video.title, 0, 1).replace(/\.png$/, '');
  const folder = zip.folder(name)!;
  folder.file('index.html', html);
  const site = siteAssets(window.location.origin);
  const missing: string[] = [];
  for (const [local, source] of Array.from(files)) {
    try {
      const res = await fetch(site(source));
      if (!res.ok) throw new Error(String(res.status));
      folder.file(local, await res.blob());
    } catch {
      missing.push(source);
    }
  }
  folder.file('LEEME.txt', [
    `Video «${video.title}» del Estudio de Mansion Playroom (HyperFrames).`,
    '',
    'Para grabarlo a MP4 en un computador con Node 22 y Chrome:',
    `  cd ${name}`,
    '  npx hyperframes preview      (verlo y ajustarlo)',
    '  npx hyperframes render -o video.mp4',
    '',
    'O pídeselo a Claude Code con el plugin HyperFrames: «graba este proyecto».',
    ...(missing.length ? ['', 'No se pudieron bajar (agrégalos a assets/ a mano):', ...missing.map((m) => `  ${m}`)] : []),
  ].join('\n'));
  const blob = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${name}-hyperframes.zip`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  if (missing.length) toast.warning(`${missing.length} archivo(s) no se pudieron bajar; el LEEME dice cuáles.`);
}

export function VideoStudio({ editing, setEditing, onClose }: { editing: VideoEditing; setEditing: (e: VideoEditing) => void; onClose: () => void }) {
  const { video } = editing;
  const utils = trpc.useUtils();
  const [busy, setBusy] = useState(false);
  const { slidesHtml, nodes } = useSlidesHtml(video);

  const save = trpc.contentStudio.saveVideo.useMutation({
    onSuccess: ({ id }) => {
      setEditing({ ...editing, id, dirty: false });
      utils.contentStudio.list.invalidate();
      toast.success('Video guardado.');
    },
    onError: (e) => toast.error(e.message),
  });

  const update = (patch: Partial<StudioVideo>) => {
    const next = normalizeStudioVideo({ ...video, ...patch }, normalizeStudioDesign);
    if (next) setEditing({ ...editing, video: next, dirty: true });
  };
  const setScene = (i: number, patch: Partial<StudioVideo['scenes'][number]>) => update({ scenes: video.scenes.map((s, j) => (j === i ? { ...s, ...patch } : s)) });
  const moveScene = (i: number, dir: -1 | 1) => {
    const to = i + dir;
    if (to < 0 || to >= video.scenes.length) return;
    const scenes = [...video.scenes];
    [scenes[i], scenes[to]] = [scenes[to], scenes[i]];
    update({ scenes });
  };

  // La vista previa se arma con un pequeño respiro: no se rehace en cada letra.
  const [html, setHtml] = useState('');
  useEffect(() => {
    if (video.template === 'laminas' && slidesHtml.length === 0) return;
    const t = window.setTimeout(() => setHtml(compose(video, slidesHtml, siteAssets(window.location.origin))), 400);
    return () => window.clearTimeout(t);
  }, [video, slidesHtml]);

  const timeline = useMemo(() => videoTimeline(video), [video]);
  const total = video.template === 'laminas' ? Math.round((video.design?.slides.length ?? 0) * video.secsPerSlide * 10) / 10 : timeline.total;
  const size = VIDEO_SIZES[video.format];
  const isSlides = video.template === 'laminas';

  const close = () => {
    if (editing.dirty && !window.confirm('Hay cambios sin guardar. ¿Salir igual?')) return;
    onClose();
  };

  const exportProject = async () => {
    setBusy(true);
    try {
      await downloadProject(video, slidesHtml);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo armar el proyecto.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" onClick={close}><ArrowLeft className="w-4 h-4 mr-1" /> Diseños</Button>
        <Input className="max-w-sm" value={video.title} maxLength={200} onChange={(e) => update({ title: e.target.value })} aria-label="Nombre del video" />
        {!isSlides && (
          <Select value={video.format} onValueChange={(v) => update({ format: v as VideoFormat })}>
            <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
            <SelectContent>{VIDEO_FORMATS.map((f) => <SelectItem key={f} value={f}>{VIDEO_FORMAT_LABEL[f]}</SelectItem>)}</SelectContent>
          </Select>
        )}
        {!isSlides && (
          <Select value={video.theme} onValueChange={(v) => update({ theme: v as StudioTheme })}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>{STUDIO_THEMES.map((t) => <SelectItem key={t} value={t}>{VARIANT_THEME_LABEL[t]}</SelectItem>)}</SelectContent>
          </Select>
        )}
        <WriteButton size="sm" onClick={() => save.mutate({ id: editing.id, video })} disabled={save.isPending || !editing.dirty}>
          {save.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
          {editing.dirty ? 'Guardar' : 'Guardado'}
        </WriteButton>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,440px)]">
        <div className="space-y-3 min-w-0">
          {html
            ? <VideoPreview html={html} width={size.width} height={size.height} maxWidth={video.format === 'reel' ? 360 : 480} />
            : <div className="mx-auto flex items-center justify-center rounded-lg bg-muted" style={{ maxWidth: 360, aspectRatio: `${size.width} / ${size.height}` }}><Loader2 className="w-5 h-5 animate-spin" /></div>}
          <p className="text-center text-xs text-muted-foreground">
            <Clapperboard className="inline w-3 h-3 mr-1" />
            {VIDEO_TEMPLATE_LABEL[video.template]} · {VIDEO_FORMAT_LABEL[video.format]} · {total} s · sin IA
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            <Button size="sm" variant="outline" onClick={exportProject} disabled={busy || !html}>
              {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />} Descargar proyecto (ZIP)
            </Button>
          </div>
          <p className="text-center text-xs text-muted-foreground max-w-md mx-auto">
            El botón para grabar el MP4 desde acá llega en la próxima etapa. Por ahora el proyecto se graba con
            <code className="mx-1">npx hyperframes render</code> o pidiéndoselo a Claude Code.
          </p>
        </div>

        <div className="space-y-4 min-w-0">
          {isSlides ? (
            <Card className="rounded-2xl border-0 shadow-md shadow-black/5">
              <CardContent className="pt-6 space-y-3">
                <p className="text-sm text-muted-foreground">
                  «{video.design?.title}» animado: {video.design?.slides.length} lámina(s), cada una entra con un movimiento distinto.
                  Para cambiar los textos, edita el diseño y vuelve a animarlo.
                </p>
                <div className="space-y-1.5">
                  <Label>Segundos por lámina</Label>
                  <Input type="number" min={VIDEO_MIN_SECS} max={VIDEO_MAX_SECS} step={0.5} value={video.secsPerSlide} onChange={(e) => update({ secsPerSlide: Number(e.target.value) })} className="w-28" />
                </div>
              </CardContent>
            </Card>
          ) : (
            <>
              <Card className="rounded-2xl border-0 shadow-md shadow-black/5">
                <CardContent className="pt-6 space-y-2">
                  <Label>Fondo de la primera escena (foto, o pega el link de un video .mp4)</Label>
                  <div className="flex items-center gap-2">
                    <ImageUploadField value={isVideo(video.mediaUrl) ? '' : video.mediaUrl} onChange={(url) => update({ mediaUrl: url })} pathPrefix="studio" />
                    {video.mediaUrl && <Button size="icon" variant="ghost" onClick={() => update({ mediaUrl: '' })} aria-label="Quitar fondo"><X className="w-4 h-4" /></Button>}
                  </div>
                  <Input value={video.mediaUrl} maxLength={1000} placeholder="https://… o /candyland/hero-video-mobile.mp4" onChange={(e) => update({ mediaUrl: e.target.value })} />
                  <p className="text-xs text-muted-foreground">Sin fondo, la primera escena usa el color de la plantilla. El video de fondo va siempre mudo.</p>
                </CardContent>
              </Card>

              {video.scenes.map((s, i) => (
                <Card key={i} className="rounded-2xl border-0 shadow-md shadow-black/5">
                  <CardContent className="pt-5 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium">{i === 0 ? 'Gancho (escena 1)' : `Escena ${i + 1}`}<span className="ml-2 text-xs font-normal text-muted-foreground">desde {timeline.scenes[i]?.start ?? '—'} s</span></p>
                      <div className="flex gap-1">
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => moveScene(i, -1)} disabled={i === 0} aria-label="Mover antes"><ArrowUp className="w-3.5 h-3.5" /></Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => moveScene(i, 1)} disabled={i === video.scenes.length - 1} aria-label="Mover después"><ArrowDown className="w-3.5 h-3.5" /></Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => update({ scenes: video.scenes.filter((_, j) => j !== i) })} disabled={video.scenes.length <= 1} aria-label="Quitar escena"><Trash2 className="w-3.5 h-3.5" /></Button>
                      </div>
                    </div>
                    <Textarea rows={2} maxLength={120} value={s.title} placeholder="Texto grande (Enter separa líneas)" onChange={(e) => setScene(i, { title: e.target.value })} />
                    <div className="flex gap-2">
                      <Input value={s.body} maxLength={200} placeholder="Etiqueta (opcional)" onChange={(e) => setScene(i, { body: e.target.value })} />
                      <Input type="number" className="w-24" min={VIDEO_MIN_SECS} max={VIDEO_MAX_SECS} step={0.1} value={s.secs} onChange={(e) => setScene(i, { secs: Number(e.target.value) })} aria-label="Segundos" />
                    </div>
                  </CardContent>
                </Card>
              ))}
              {video.scenes.length < VIDEO_MAX_SCENES && (
                <Button size="sm" variant="outline" onClick={() => update({ scenes: [...video.scenes, { title: 'Nueva escena', body: '', secs: 2.2 }] })}>
                  <Plus className="w-3 h-3 mr-1" /> Agregar escena
                </Button>
              )}

              <Card className="rounded-2xl border-0 shadow-md shadow-black/5">
                <CardContent className="pt-6 space-y-2">
                  <Label>Cierre (logo + frase + botón, 3 s). Vacíos = sin cierre.</Label>
                  <Input value={video.ctaLine} maxLength={120} placeholder="Frase (ej. ¿Vienes?)" onChange={(e) => update({ ctaLine: e.target.value })} />
                  <Input value={video.cta} maxLength={60} placeholder="Botón (ej. mansionplayroom.cl)" onChange={(e) => update({ cta: e.target.value })} />
                </CardContent>
              </Card>
            </>
          )}

          <Card className="rounded-2xl border-0 shadow-md shadow-black/5">
            <CardContent className="pt-6 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="video-caption">Texto de la publicación</Label>
                {video.caption && <Button size="sm" variant="ghost" onClick={() => copyText(video.caption)}><Copy className="w-4 h-4 mr-1" /> Copiar</Button>}
              </div>
              <Textarea id="video-caption" rows={4} maxLength={3000} value={video.caption} onChange={(e) => update({ caption: e.target.value })} placeholder="El caption para pegar en Instagram (opcional)." />
            </CardContent>
          </Card>
        </div>
      </div>
      {nodes}
    </div>
  );
}

function isVideo(url: string) {
  return /\.(mp4|webm|mov)(\?|#|$)/i.test(url);
}
