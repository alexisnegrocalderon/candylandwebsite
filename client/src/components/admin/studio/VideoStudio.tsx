import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import JSZip from 'jszip';
import { AlertTriangle, ArrowDown, ArrowLeft, ArrowUp, Clapperboard, CopyPlus, Copy, Download, Film, Image as ImageIcon, Loader2, Palette, Plus, Redo2, Save, Share2, Trash2, Undo2, Users } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select';
import { WriteButton } from '@/components/admin/WriteButton';
import { normalizeStudioDesign, STUDIO_THEMES, type StudioTheme } from '@shared/contentStudio';
import { VARIANT_THEME_LABEL } from '@shared/studioVariants';
import { contentHash, type RenderSummary } from '@shared/studioRender';
import { formatChileDateTime } from '@shared/chileDate';
import { uploadedItem } from '@shared/ambassadorContent';
import {
  normalizeStudioVideo,
  projectAssets,
  sceneMedia,
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
  type SavedVideoStyle,
  type VideoScene,
} from '@shared/studioVideo';
import { MotionControls, MusicControls, SceneBackgroundControls, StickerControls, TextStyleControls, WatermarkControls } from './VideoStyleControls';
import { StickerLayer } from './StickerLayer';
import { StudioSlideView } from './StudioSlideView';
import { VideoPreview } from './VideoPreview';
import { slideFileName } from './exportSlides';

/* Editor de videos del Estudio (HyperFrames): reels 9:16 y posts animados 3:4
 * con las plantillas de marca. A la izquierda la vista previa (el mismo HTML
 * que se graba), a la derecha las escenas. Sin IA: no gasta créditos.
 * «Exportar MP4» lo graba GitHub Actions (server/studioRender.ts) y queda para
 * descargar acá; «Descargar proyecto» entrega la carpeta para grabarla a mano. */

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

/** El proyecto que se graba: el HTML con rutas `assets/...` y de dónde sale cada archivo. */
function buildProject(video: StudioVideo, slidesHtml: string[]) {
  const { assetUrl, files } = projectAssets();
  const html = compose(video, slidesHtml, assetUrl);
  return { html, assets: Array.from(files) as Array<[string, string]> };
}

/** Comparte el MP4 al celular (para subirlo directo a Instagram) o lo abre. */
async function shareMp4(url: string, title: string) {
  try {
    const blob = await (await fetch(url)).blob();
    const file = new File([blob], `${slideFileName(title, 0, 1).replace(/\.png$/, '')}.mp4`, { type: 'video/mp4' });
    if (typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title });
      return;
    }
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') return;
  }
  window.open(url, '_blank', 'noopener');
}

/** Baja cada archivo que usa el video (fuentes, logo, fotos) y arma la
 * carpeta de HyperFrames en un ZIP. */
async function downloadProject(video: StudioVideo, slidesHtml: string[]) {
  const { html, assets: files } = buildProject(video, slidesHtml);
  const zip = new JSZip();
  const name = slideFileName(video.title, 0, 1).replace(/\.png$/, '');
  const folder = zip.folder(name)!;
  folder.file('index.html', html);
  const site = siteAssets(window.location.origin);
  const missing: string[] = [];
  for (const [local, source] of files) {
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

type DesignTab = 'texto' | 'fondo' | 'movimiento' | 'stickers';
const DESIGN_TABS: { id: DesignTab; label: string }[] = [
  { id: 'texto', label: 'Texto' }, { id: 'fondo', label: 'Fondo' }, { id: 'movimiento', label: 'Movimiento' }, { id: 'stickers', label: 'Stickers' },
];

/** Deshacer / rehacer: hasta 50 pasos. Escribir en un mismo campo seguido cuenta como un solo paso. */
const HISTORY_MAX = 50;

export function VideoStudio({ editing, setEditing, onClose }: { editing: VideoEditing; setEditing: (e: VideoEditing) => void; onClose: () => void }) {
  // Un video guardado antes de que cada escena tuviera su fondo trae la foto en el video: pasa a la escena 1.
  const video = useMemo(
    () => (editing.video.mediaUrl && editing.video.template !== 'laminas' ? normalizeStudioVideo(editing.video, normalizeStudioDesign) ?? editing.video : editing.video),
    [editing.video],
  );
  const utils = trpc.useUtils();
  const [busy, setBusy] = useState(false);
  const { slidesHtml, nodes } = useSlidesHtml(video);

  const { data: renderConfig } = trpc.contentStudio.renderConfig.useQuery(undefined, { staleTime: 60_000 });
  // Mientras se graba, se pregunta cada 5 s cómo va.
  const renderQuery = trpc.contentStudio.getVideo.useQuery({ id: editing.id ?? 0 }, {
    enabled: editing.id != null,
    select: (d) => d.render,
    refetchInterval: (q) => (q.state.data?.render.status === 'grabando' ? 5000 : false),
  });
  const render: RenderSummary | undefined = renderQuery.data;
  const startRender = trpc.contentStudio.renderVideo.useMutation({
    onSuccess: () => { renderQuery.refetch(); toast.success('Grabando el video. Tarda 1 a 3 minutos; puedes seguir trabajando.'); },
    onError: (e) => toast.error(e.message),
  });

  const save = trpc.contentStudio.saveVideo.useMutation({
    onSuccess: ({ id }) => {
      setEditing({ ...editing, id, dirty: false });
      utils.contentStudio.list.invalidate();
      toast.success('Video guardado.');
    },
    onError: (e) => toast.error(e.message),
  });

  const past = useRef<StudioVideo[]>([]);
  const future = useRef<StudioVideo[]>([]);
  const lastEdit = useRef<{ key: string; at: number } | null>(null);
  const [, bump] = useState(0);
  const commit = (next: StudioVideo, key: string) => {
    const now = Date.now();
    const same = lastEdit.current && lastEdit.current.key === key && now - lastEdit.current.at < 1000;
    if (!same) {
      past.current.push(video);
      if (past.current.length > HISTORY_MAX) past.current.shift();
    }
    future.current = [];
    lastEdit.current = { key, at: now };
    setEditing({ ...editing, video: next, dirty: true });
    bump((n) => n + 1);
  };
  const update = (patch: Partial<StudioVideo>, key = Object.keys(patch).join(',')) => {
    const next = normalizeStudioVideo({ ...video, ...patch }, normalizeStudioDesign);
    if (next) commit(next, key);
  };
  const setScene = (i: number, patch: Partial<VideoScene>) => update({ scenes: video.scenes.map((s, j) => (j === i ? { ...s, ...patch } : s)) }, `s${i}:${Object.keys(patch).join(',')}`);
  const moveScene = (i: number, dir: -1 | 1) => {
    const to = i + dir;
    if (to < 0 || to >= video.scenes.length) return;
    const scenes = [...video.scenes];
    [scenes[i], scenes[to]] = [scenes[to], scenes[i]];
    update({ scenes }, `move${Date.now()}`);
    setOpenDesign((o) => (o === i ? to : o === to ? i : o));
  };
  const duplicateScene = (i: number) => {
    if (video.scenes.length >= VIDEO_MAX_SCENES) return;
    update({ scenes: [...video.scenes.slice(0, i + 1), structuredClone(video.scenes[i]), ...video.scenes.slice(i + 1)] }, `dup${Date.now()}`);
    setOpenDesign(null);
  };
  const removeScene = (i: number) => {
    update({ scenes: video.scenes.filter((_, j) => j !== i) }, `del${Date.now()}`);
    setOpenDesign(null);
  };
  const travel = useCallback((from: typeof past, to: typeof future) => {
    const prev = from.current.pop();
    if (!prev) return;
    to.current.push(video);
    lastEdit.current = null;
    setEditing({ ...editing, video: prev, dirty: true });
    bump((n) => n + 1);
  }, [video, editing, setEditing]);
  const undo = useCallback(() => travel(past, future), [travel]);
  const redo = useCallback(() => travel(future, past), [travel]);
  // Ctrl/⌘+Z y Ctrl/⌘+Shift+Z (o Ctrl+Y). Dentro de un campo de texto manda el deshacer del propio campo.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'TEXTAREA' || (t.tagName === 'INPUT' && (t as HTMLInputElement).type !== 'range' && (t as HTMLInputElement).type !== 'color') || t.isContentEditable)) return;
      const k = e.key.toLowerCase();
      if (k === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
      else if ((k === 'z' && e.shiftKey) || k === 'y') { e.preventDefault(); redo(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo]);

  // `overflow-x: hidden` en html/body (theme.css) anula el sticky de la vista previa; mientras el
  // editor está abierto va `clip`, que corta igual lo que se sale pero deja que la vista previa acompañe.
  useEffect(() => {
    const els = [document.documentElement, document.body];
    const prev = els.map((el) => el.style.overflowX);
    els.forEach((el) => { el.style.overflowX = 'clip'; });
    return () => els.forEach((el, i) => { el.style.overflowX = prev[i]; });
  }, []);

  // Qué escena tiene abierto su diseño, y a qué segundo salta la vista previa al editar una escena.
  const [openDesign, setOpenDesign] = useState<number | null>(null);
  const [videoStyleOpen, setVideoStyleOpen] = useState(false);
  const [designTab, setDesignTab] = useState<DesignTab>('texto');
  const [seekTo, setSeekTo] = useState<{ t: number; n: number } | null>(null);
  const focusedScene = useRef<number | null>(null);

  // La vista previa se arma con un pequeño respiro: no se rehace en cada letra.
  const [html, setHtml] = useState('');
  useEffect(() => {
    if (video.template === 'laminas' && slidesHtml.length === 0) return;
    const t = window.setTimeout(() => setHtml(compose(video, slidesHtml, siteAssets(window.location.origin))), 400);
    return () => window.clearTimeout(t);
  }, [video, slidesHtml]);

  const timeline = useMemo(() => videoTimeline(video), [video]);
  // Al tocar una escena, la vista previa salta a ella (ya con el texto entrado) y queda en pausa.
  const focusScene = (i: number) => {
    const sc = timeline.scenes[i];
    if (!sc || focusedScene.current === i) return;
    focusedScene.current = i;
    setSeekTo((p) => ({ t: round1(sc.start + Math.min(1, sc.secs * 0.6)), n: (p?.n ?? 0) + 1 }));
  };
  const setSceneMedia = (i: number, url: string) => update({ mediaUrl: '', scenes: video.scenes.map((sc, j) => (j === i ? { ...sc, mediaUrl: url } : sc)) }, `s${i}:media`);
  const ready = video.template !== 'laminas' || slidesHtml.length > 0;
  const currentHash = useMemo(() => (ready ? contentHash(buildProject(video, slidesHtml).html) : ''), [video, slidesHtml, ready]);
  const stale = render?.status === 'listo' && !!render.contentHash && render.contentHash !== currentHash;

  // El MP4 queda en «Contenido para embajadores», por aprobar.
  const toAmbassadors = trpc.ambassadorContent.save.useMutation({
    onSuccess: () => toast.success('Quedó en «Contenido para embajadores», listo para aprobar.'),
    onError: (e) => toast.error(e.message),
  });
  const sendToAmbassadors = (url: string) => {
    const item = uploadedItem({ mediaUrl: url, eventId: video.eventId, mediaFormat: video.format === 'reel' ? 'historia' : 'post', label: video.title, caption: video.caption });
    if (item) toAmbassadors.mutate({ item: item as unknown as Record<string, unknown> });
  };
  const missing = renderConfig?.missing ?? [];
  const exportMp4 = () => {
    if (editing.id == null || editing.dirty) { toast.info('Guarda el video antes de exportarlo.'); return; }
    startRender.mutate({ id: editing.id, project: buildProject(video, slidesHtml) });
  };
  const total = video.template === 'laminas' ? Math.round((video.design?.slides.length ?? 0) * video.secsPerSlide * 10) / 10 : timeline.total;
  const size = VIDEO_SIZES[video.format];
  const previewWidth = { reel: 360, feed: 480, square: 480, landscape: 640 }[video.format];
  const stickerScene = openDesign != null && designTab === 'stickers' ? openDesign : null;
  const isSlides = video.template === 'laminas';

  // «Mis estilos»: plantilla + diseño + logo + música guardados con un nombre.
  const { data: savedStyles } = trpc.contentStudio.videoStyles.useQuery(undefined, { staleTime: 60_000 });
  const [styleName, setStyleName] = useState('');
  const saveStyle = trpc.contentStudio.saveVideoStyle.useMutation({
    onSuccess: () => { utils.contentStudio.videoStyles.invalidate(); toast.success(`Estilo «${styleName.trim()}» guardado.`); setStyleName(''); },
    onError: (e) => toast.error(e.message),
  });
  const deleteStyle = trpc.contentStudio.deleteVideoStyle.useMutation({
    onSuccess: () => utils.contentStudio.videoStyles.invalidate(),
    onError: (e) => toast.error(e.message),
  });
  const applyStyle = (st: SavedVideoStyle) => {
    update({ theme: st.theme, style: st.style, watermark: st.watermark, music: st.music }, `estilo${Date.now()}`);
    toast.success(`Estilo «${st.name}» aplicado. Puedes deshacerlo con ↶.`);
  };

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
          <Select value={video.theme} onValueChange={(v) => {
            if (v.startsWith('estilo:')) { const st = savedStyles?.find((x) => `estilo:${x.id}` === v); if (st) applyStyle(st); return; }
            update({ theme: v as StudioTheme });
          }}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              {STUDIO_THEMES.map((t) => <SelectItem key={t} value={t}>{VARIANT_THEME_LABEL[t]}</SelectItem>)}
              {savedStyles && savedStyles.length > 0 && (
                <SelectGroup>
                  <SelectLabel>Mis estilos</SelectLabel>
                  {savedStyles.map((st) => <SelectItem key={st.id} value={`estilo:${st.id}`}>{st.name}</SelectItem>)}
                </SelectGroup>
              )}
            </SelectContent>
          </Select>
        )}
        <div className="flex gap-1">
          <Button size="icon" variant="outline" className="h-9 w-9" onClick={undo} disabled={past.current.length === 0} aria-label="Deshacer" title="Deshacer (Ctrl+Z)"><Undo2 className="w-4 h-4" /></Button>
          <Button size="icon" variant="outline" className="h-9 w-9" onClick={redo} disabled={future.current.length === 0} aria-label="Rehacer" title="Rehacer (Ctrl+Shift+Z)"><Redo2 className="w-4 h-4" /></Button>
        </div>
        {!isSlides && (
          <Button size="sm" variant={videoStyleOpen ? 'default' : 'outline'} onClick={() => setVideoStyleOpen((o) => !o)}>
            <Palette className="w-4 h-4 mr-2" /> Estilo del video
          </Button>
        )}
        <WriteButton size="sm" onClick={() => save.mutate({ id: editing.id, video })} disabled={save.isPending || !editing.dirty}>
          {save.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
          {editing.dirty ? 'Guardar' : 'Guardado'}
        </WriteButton>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,440px)]">
        {/* La vista previa queda a la vista mientras se baja por las escenas. */}
        <div className="space-y-3 min-w-0 lg:sticky lg:top-36 lg:self-start">
          <div className="relative mx-auto" style={{ maxWidth: previewWidth, aspectRatio: `${size.width} / ${size.height}` }}>
            {html
              ? <VideoPreview html={html} width={size.width} height={size.height} maxWidth={previewWidth} seekTo={seekTo} />
              : <div className="flex h-full w-full items-center justify-center rounded-lg bg-muted"><Loader2 className="w-5 h-5 animate-spin" /></div>}
            {stickerScene != null && video.scenes[stickerScene]?.stickers?.length ? (
              <StickerLayer
                stickers={video.scenes[stickerScene].stickers!}
                frameHeight={size.height}
                onMove={(j, x, y) => setScene(stickerScene, { stickers: video.scenes[stickerScene].stickers!.map((k, n) => (n === j ? { ...k, x, y } : k)) })}
              />
            ) : null}
          </div>
          <p className="text-center text-xs text-muted-foreground">
            <Clapperboard className="inline w-3 h-3 mr-1" />
            {VIDEO_TEMPLATE_LABEL[video.template]} · {VIDEO_FORMAT_LABEL[video.format]} · {total} s · sin IA
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            <WriteButton
              size="sm"
              onClick={exportMp4}
              disabled={!ready || startRender.isPending || render?.status === 'grabando' || missing.length > 0 || editing.id == null || editing.dirty}
            >
              {startRender.isPending || render?.status === 'grabando' ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Film className="w-4 h-4 mr-2" />}
              {render?.status === 'listo' ? 'Volver a exportar MP4' : 'Exportar MP4'}
            </WriteButton>
            <Button size="sm" variant="outline" onClick={exportProject} disabled={busy || !html}>
              {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />} Descargar proyecto (ZIP)
            </Button>
          </div>
          {(editing.id == null || editing.dirty) && missing.length === 0 && (
            <p className="text-center text-xs text-muted-foreground">Guarda el video para poder exportarlo a MP4.</p>
          )}
          {missing.length > 0 && (
            <div className="mx-auto max-w-md rounded-xl border border-amber-500/40 bg-amber-500/5 p-3 text-xs text-amber-800 dark:text-amber-300">
              <p className="font-medium flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" /> Falta configurar la grabación a MP4</p>
              <p className="mt-1">{missing.join(' · ')}</p>
              <p className="mt-1">Mientras, «Descargar proyecto» entrega la carpeta para grabarla con <code>npx hyperframes render</code> o con Claude Code.</p>
            </div>
          )}
          {render?.status === 'grabando' && (
            <p className="text-center text-sm text-muted-foreground flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" /> Grabando en GitHub… suele tardar 1 a 3 minutos.
            </p>
          )}
          {render?.status === 'error' && (
            <p className="mx-auto max-w-md text-center text-sm text-destructive">No se pudo grabar: {render.error}</p>
          )}
          {render?.url && render.status !== 'grabando' && (
            <Card className="mx-auto max-w-md rounded-2xl border-0 shadow-md shadow-black/5">
              <CardContent className="pt-5 space-y-3">
                <p className="text-sm font-medium flex items-center gap-2">
                  <Film className="w-4 h-4" /> MP4 listo
                  {render.finishedAt && <span className="text-xs font-normal text-muted-foreground">· {formatChileDateTime(new Date(render.finishedAt))}</span>}
                </p>
                {stale && <p className="text-xs text-amber-700 dark:text-amber-300">El video cambió desde esta exportación: vuelve a exportarlo para que el MP4 tenga los cambios.</p>}
                <video src={render.url} controls playsInline muted className="w-full rounded-lg bg-black" style={{ aspectRatio: `${size.width} / ${size.height}`, maxHeight: 420 }} />
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" asChild><a href={render.url} target="_blank" rel="noopener noreferrer" download><Download className="w-4 h-4 mr-2" /> Descargar MP4</a></Button>
                  <Button size="sm" variant="outline" onClick={() => shareMp4(render.url!, video.title)}><Share2 className="w-4 h-4 mr-2" /> Compartir al celular</Button>
                  <Button size="sm" variant="outline" disabled={toAmbassadors.isPending} onClick={() => sendToAmbassadors(render.url!)}><Users className="w-4 h-4 mr-2" /> Para embajadores</Button>
                </div>
              </CardContent>
            </Card>
          )}
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
              {videoStyleOpen && (
                <Card className="rounded-2xl border-0 shadow-md shadow-black/5">
                  <CardContent className="pt-6 space-y-3">
                    <div>
                      <p className="text-sm font-medium">Estilo de todo el video</p>
                      <p className="text-xs text-muted-foreground">Vale para todas las escenas. Cada escena puede cambiarlo en su botón «Diseño».</p>
                    </div>
                    <TextStyleControls scope="video" value={video.style} onChange={(st) => update({ style: st }, 'style')} />
                    <div className="border-t border-border/60 pt-3">
                      <MotionControls scope="video" value={video.style} onChange={(st) => update({ style: st }, 'style')} />
                    </div>
                    <div className="border-t border-border/60 pt-3">
                      <WatermarkControls value={video.watermark} onChange={(w) => update({ watermark: w }, 'watermark')} />
                    </div>
                    <div className="border-t border-border/60 pt-3">
                      <MusicControls value={video.music} onChange={(m) => update({ music: m }, 'music')} />
                    </div>
                    <div className="border-t border-border/60 pt-3 space-y-2">
                      <Label className="text-xs">Mis estilos</Label>
                      <p className="text-[11px] text-muted-foreground">Guarda la plantilla, la letra, los colores, el movimiento, el logo y la música de este video para usarlos en otros.</p>
                      {savedStyles && savedStyles.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {savedStyles.map((st) => (
                            <span key={st.id} className="inline-flex items-center rounded-full border border-border/60 pl-3 text-sm">
                              <button type="button" onClick={() => applyStyle(st)} className="py-1.5 pr-1 font-medium hover:text-primary">{st.name}</button>
                              <button type="button" onClick={() => { if (window.confirm(`¿Borrar el estilo «${st.name}»?`)) deleteStyle.mutate({ id: st.id }); }} aria-label={`Borrar estilo ${st.name}`} className="grid h-8 w-8 place-items-center rounded-full text-muted-foreground hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>
                            </span>
                          ))}
                        </div>
                      )}
                      <div className="flex gap-2">
                        <Input value={styleName} maxLength={60} placeholder="Nombre (ej. Halloween rosado)" onChange={(e) => setStyleName(e.target.value)} className="h-9" />
                        <Button type="button" size="sm" className="h-9 shrink-0" disabled={!styleName.trim() || saveStyle.isPending} onClick={() => saveStyle.mutate({ style: { name: styleName.trim(), theme: video.theme, style: video.style, watermark: video.watermark, music: video.music } })}>
                          {saveStyle.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-4 w-4" />} Guardar mi estilo
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {video.scenes.map((s, i) => {
                const media = sceneMedia(video, s, i);
                const open = openDesign === i;
                const custom = !!(s.style || s.bg || media);
                return (
                  <Card key={i} className={`rounded-2xl border-0 shadow-md shadow-black/5 ${open ? 'ring-2 ring-primary/40' : ''}`} onFocusCapture={() => focusScene(i)} onPointerDownCapture={() => focusScene(i)}>
                    <CardContent className="pt-5 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium flex items-center gap-2 min-w-0">
                          {media && (isVideo(media)
                            ? <video src={`${media}#t=0.5`} muted playsInline preload="metadata" className="h-7 w-7 shrink-0 rounded-md bg-black object-cover" />
                            : <img src={media} alt="" className="h-7 w-7 shrink-0 rounded-md object-cover" />)}
                          {!media && s.bg && <span className="h-7 w-7 shrink-0 rounded-md border border-border/50" style={{ background: s.bg.includes(',') ? `linear-gradient(160deg, ${s.bg.replace(',', ', ')})` : s.bg }} />}
                          <span className="truncate">{i === 0 ? 'Gancho (escena 1)' : `Escena ${i + 1}`}</span>
                          <span className="text-xs font-normal text-muted-foreground shrink-0">desde {timeline.scenes[i]?.start ?? '—'} s</span>
                        </p>
                        <div className="flex gap-1 shrink-0">
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => moveScene(i, -1)} disabled={i === 0} aria-label="Mover antes"><ArrowUp className="w-3.5 h-3.5" /></Button>
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => moveScene(i, 1)} disabled={i === video.scenes.length - 1} aria-label="Mover después"><ArrowDown className="w-3.5 h-3.5" /></Button>
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => duplicateScene(i)} disabled={video.scenes.length >= VIDEO_MAX_SCENES} aria-label="Duplicar escena" title="Duplicar escena"><CopyPlus className="w-3.5 h-3.5" /></Button>
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => removeScene(i)} disabled={video.scenes.length <= 1} aria-label="Quitar escena"><Trash2 className="w-3.5 h-3.5" /></Button>
                        </div>
                      </div>
                      <Textarea rows={2} maxLength={120} value={s.title} placeholder="Texto grande (Enter separa líneas)" onChange={(e) => setScene(i, { title: e.target.value })} />
                      <div className="flex gap-2">
                        <Input value={s.body} maxLength={200} placeholder="Etiqueta (opcional)" onChange={(e) => setScene(i, { body: e.target.value })} />
                        <Input type="number" className="w-24" min={VIDEO_MIN_SECS} max={VIDEO_MAX_SECS} step={0.1} value={s.secs} onChange={(e) => setScene(i, { secs: Number(e.target.value) })} aria-label="Segundos" />
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button size="sm" variant={open ? 'default' : 'outline'} onClick={() => { setOpenDesign(open ? null : i); setDesignTab('texto'); }}>
                          <Palette className="w-3.5 h-3.5 mr-1.5" /> Diseño{custom && !open ? ' ·' : ''}
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => { setOpenDesign(i); setDesignTab('fondo'); }}>
                          <ImageIcon className="w-3.5 h-3.5 mr-1.5" /> {media ? 'Cambiar fondo' : 'Foto o video de fondo'}
                        </Button>
                      </div>
                      {open && (
                        <div className="mt-2 space-y-4 rounded-xl border border-border/60 p-3">
                          <div className="grid w-full grid-cols-4 rounded-xl bg-muted p-0.5">
                            {DESIGN_TABS.map((t) => (
                              <button key={t.id} type="button" onClick={() => setDesignTab(t.id)} className={`h-8 truncate rounded-lg px-1 text-[13px] font-medium ${designTab === t.id ? 'bg-background shadow-sm' : 'text-muted-foreground'}`}>
                                {t.label}{t.id === 'stickers' && s.stickers?.length ? ` (${s.stickers.length})` : ''}
                              </button>
                            ))}
                          </div>
                          {designTab === 'texto' ? (
                            <TextStyleControls scope="scene" value={s.style} onChange={(st) => setScene(i, { style: st })} />
                          ) : designTab === 'movimiento' ? (
                            <MotionControls scope="scene" first={i === 0} value={s.style} onChange={(st) => setScene(i, { style: st })} />
                          ) : designTab === 'stickers' ? (
                            <StickerControls stickers={s.stickers} onChange={(list) => setScene(i, { stickers: list })} />
                          ) : (
                            <SceneBackgroundControls
                              scene={s}
                              media={media}
                              onMedia={(url) => setSceneMedia(i, url)}
                              onBg={(bg) => setScene(i, { bg })}
                              style={s.style}
                              onStyle={(st) => setScene(i, { style: st })}
                            />
                          )}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
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

function round1(n: number) {
  return Math.round(n * 10) / 10;
}
