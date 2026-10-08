import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  ArrowDown, ArrowLeft, ArrowUp, Copy, Download, Image as ImageIcon, Loader2, Palette, Plus, Save, Share2, Sparkles, Trash2, X,
} from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { WriteButton } from '@/components/admin/WriteButton';
import { ConfirmDeleteButton } from '@/components/admin/ConfirmDeleteButton';
import { ImageUploadField } from '@/components/admin/ImageUploadField';
import { formatChileDateTime } from '@shared/chileDate';
import {
  normalizeStudioDesign,
  STUDIO_LAYOUTS,
  STUDIO_MAX_ITEMS,
  STUDIO_MAX_OPTIONS,
  STUDIO_MAX_SLIDES,
  STUDIO_SIZES,
  type StudioDesign,
  type StudioFormat,
  type StudioLayout,
  type StudioSlide,
  type StudioTheme,
} from '@shared/contentStudio';
import { PASTEL_PALETTE_LABELS, StudioSlideView } from './studio/StudioSlideView';
import { downloadSlide, downloadZip, shareSlides, slideFileName } from './studio/exportSlides';
import { newSlide, starterSlides } from './studio/starters';
import { takeQueuedDesign } from './studio/handoff';
import { AiDesigner } from './studio/AiDesigner';
import { SlideFrame } from './studio/SlideFrame';

/* Estudio de contenido: arma carruseles, posts e historias con las plantillas
 * de marca y los exporta a PNG (1080×1440 o 1080×1920) desde el navegador.
 * No publica nada: se descargan (o se comparten desde el celular) y se suben
 * a Instagram a mano. Los diseños se guardan en la base (server/contentStudio.ts). */

const FORMAT_LABEL: Record<StudioFormat, string> = { carrusel: 'Carrusel (3:4)', post: 'Post (3:4)', historia: 'Historia (9:16)' };
const THEME_LABEL: Record<StudioTheme, string> = { azul: 'Desafío azul', pastel: 'Test pastel', playcard: 'PlayCard' };
const LAYOUT_LABEL: Record<StudioLayout, string> = {
  portada: 'Portada', pregunta: 'Pregunta / texto', resultados: 'Resultados', pasos: 'Pasos', cierre: 'Cierre', imagen: 'Imagen propia',
};

type Field = 'script' | 'number' | 'title' | 'body' | 'options' | 'items' | 'cta' | 'footnote';
const FIELDS: Record<StudioLayout, Field[]> = {
  portada: ['script', 'title', 'body', 'cta', 'footnote'],
  pregunta: ['number', 'title', 'options', 'body'],
  resultados: ['title', 'body', 'items'],
  pasos: ['script', 'title', 'items'],
  cierre: ['title', 'body', 'cta', 'footnote'],
  imagen: [],
};
const FIELD_LABEL: Record<Field, string> = {
  script: 'Palabra manuscrita / antetítulo', number: 'Número', title: 'Título', body: 'Bajada (cursiva)', options: 'Opciones',
  items: 'Filas', cta: 'Botón', footnote: 'Texto chico de abajo',
};

interface Editing {
  id?: number;
  design: StudioDesign;
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

/** La lámina achicada para que quepa en `width` px (la real mide 1080). */
function ScaledSlide({ design, slide, index, width }: { design: StudioDesign; slide: StudioSlide; index: number; width: number }) {
  const size = STUDIO_SIZES[design.format];
  const scale = width / size.width;
  return (
    <div style={{ width, height: size.height * scale, overflow: 'hidden', position: 'relative' }} className="rounded-lg shadow-sm">
      <div style={{ transform: `scale(${scale})`, transformOrigin: 'top left', position: 'absolute', top: 0, left: 0 }}>
        <StudioSlideView theme={design.theme} format={design.format} slide={slide} index={index} total={design.slides.length} />
      </div>
    </div>
  );
}

/** Ancho disponible de un contenedor (para que la vista previa llene la columna). */
function useWidth<T extends HTMLElement>(fallback: number) {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.max(200, Math.floor(entry.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

/** Diseño del Diseñador IA abierto: uno guardado (`designId`) o uno nuevo. */
interface AiOpen {
  designId?: number;
  format: StudioFormat;
}

export function ContentStudio() {
  const [editing, setEditing] = useState<Editing | null>(() => {
    const queued = takeQueuedDesign();
    return queued ? { design: queued, dirty: true } : null;
  });
  const [ai, setAi] = useState<AiOpen | null>(null);

  if (ai) {
    return <AiDesigner key={ai.designId ?? 'nuevo'} designId={ai.designId} format={ai.format} onClose={() => setAi(null)} />;
  }
  if (editing) {
    return <StudioEditor editing={editing} setEditing={setEditing} onClose={() => setEditing(null)} />;
  }
  return <StudioHome onOpen={setEditing} onOpenAi={setAi} />;
}

function StudioHome({ onOpen, onOpenAi }: { onOpen: (e: Editing) => void; onOpenAi: (a: AiOpen) => void }) {
  const utils = trpc.useUtils();
  const { data: designs, isLoading } = trpc.contentStudio.list.useQuery();
  const [format, setFormat] = useState<StudioFormat>('carrusel');
  const [theme, setTheme] = useState<StudioTheme>('azul');
  const [opening, setOpening] = useState<number | null>(null);
  const remove = trpc.contentStudio.delete.useMutation({
    onSuccess: () => { utils.contentStudio.list.invalidate(); toast.success('Diseño eliminado.'); },
    onError: (e) => toast.error(e.message),
  });

  const createNew = () => {
    const design = normalizeStudioDesign({ title: `${THEME_LABEL[theme]} nuevo`, format, theme, slides: starterSlides(theme, format) });
    if (design) onOpen({ design, dirty: true });
  };

  const open = async (id: number) => {
    setOpening(id);
    try {
      const { id: designId, updatedAt: _u, ...design } = await utils.contentStudio.get.fetch({ id });
      onOpen({ id: designId, design, dirty: false });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo abrir el diseño.');
    } finally {
      setOpening(null);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-heading text-2xl flex items-center gap-2"><Palette className="w-6 h-6" /> Estudio de contenido</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Arma carruseles, posts e historias y descárgalos listos para Instagram (3:4 y 9:16): con el Diseñador IA, que diseña
          libremente con tu Design System conversando, o con las plantillas fijas de la marca.
        </p>
      </div>

      <Card className="rounded-2xl border-0 shadow-md shadow-black/5 bg-gradient-to-br from-pink-500/5 to-sky-500/5">
        <CardContent className="pt-6 flex flex-wrap items-end gap-3">
          <div className="min-w-0 flex-1 basis-60">
            <p className="font-medium flex items-center gap-2"><Sparkles className="w-4 h-4" /> Diseñador IA</p>
            <p className="text-sm text-muted-foreground">Como Claude Design, pero acá: pides el diseño en un chat y lo ajustas conversando.</p>
          </div>
          <div className="space-y-1.5">
            <Label>Formato</Label>
            <Select value={format} onValueChange={(v) => setFormat(v as StudioFormat)}>
              <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
              <SelectContent>{Object.entries(FORMAT_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <Button onClick={() => onOpenAi({ format })}><Sparkles className="w-4 h-4 mr-2" /> Nuevo con IA</Button>
        </CardContent>
      </Card>

      <Card className="rounded-2xl border-0 shadow-md shadow-black/5">
        <CardContent className="pt-6 flex flex-wrap items-end gap-3">
          <div className="min-w-0 flex-1 basis-60">
            <p className="font-medium">Plantillas fijas</p>
            <p className="text-sm text-muted-foreground">Desafío azul, Test pastel y PlayCard: rellenas los textos y listo. Usa el formato elegido arriba.</p>
          </div>
          <div className="space-y-1.5">
            <Label>Plantilla</Label>
            <Select value={theme} onValueChange={(v) => setTheme(v as StudioTheme)}>
              <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
              <SelectContent>{Object.entries(THEME_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <Button variant="outline" onClick={createNew}><Plus className="w-4 h-4 mr-2" /> Nuevo con plantilla</Button>
        </CardContent>
      </Card>

      {isLoading ? (
        <p className="text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Cargando diseños…</p>
      ) : !designs?.length ? (
        <p className="text-sm text-muted-foreground">Todavía no hay diseños guardados.</p>
      ) : (
        <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
          {designs.map((d) => (
            <div key={d.id} className="space-y-2">
              <button
                type="button"
                className="block w-full text-left interactive"
                onClick={() => (d.kind === 'ia' ? onOpenAi({ designId: d.id, format: d.format }) : open(d.id))}
                disabled={opening != null}
              >
                {d.kind === 'ia'
                  ? d.aiCover
                    ? <SlideFrame css={d.aiCover.css} format={d.format} slide={{ html: d.aiCover.html }} width={180} className="rounded-lg shadow-sm" />
                    : <div className="flex items-center justify-center rounded-lg bg-muted text-xs text-muted-foreground" style={{ width: 180, height: (STUDIO_SIZES[d.format].height * 180) / STUDIO_SIZES[d.format].width }}>Sin láminas</div>
                  : d.cover && <ScaledSlide design={{ ...d, caption: '', slides: [d.cover] }} slide={d.cover} index={0} width={180} />}
              </button>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">
                    {opening === d.id && <Loader2 className="inline w-3 h-3 mr-1 animate-spin" />}
                    {d.kind === 'ia' && <Sparkles className="inline w-3 h-3 mr-1 text-pink-500" aria-label="Diseñador IA" />}
                    {d.title}
                  </p>
                  <p className="text-xs text-muted-foreground">{FORMAT_LABEL[d.format]} · {d.slideCount} lám. · {formatChileDateTime(d.updatedAt)}</p>
                </div>
                <ConfirmDeleteButton description={`el diseño «${d.title}»`} onConfirm={(adminPassword) => remove.mutateAsync({ id: d.id, adminPassword })} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StudioEditor({ editing, setEditing, onClose }: { editing: Editing; setEditing: (e: Editing) => void; onClose: () => void }) {
  const { design } = editing;
  const utils = trpc.useUtils();
  const [selected, setSelected] = useState(0);
  const [busy, setBusy] = useState<null | 'zip' | 'png' | 'share'>(null);
  const exportRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [previewRef, previewWidth] = useWidth<HTMLDivElement>(420);
  const index = Math.min(selected, design.slides.length - 1);
  const slide = design.slides[index];

  const save = trpc.contentStudio.save.useMutation({
    onSuccess: ({ id }) => {
      setEditing({ ...editing, id, dirty: false });
      utils.contentStudio.list.invalidate();
      toast.success('Diseño guardado.');
    },
    onError: (e) => toast.error(e.message),
  });

  const update = (patch: Partial<StudioDesign>) => {
    const next = normalizeStudioDesign({ ...design, ...patch });
    if (next) setEditing({ ...editing, design: next, dirty: true });
  };
  const updateSlide = (patch: Partial<StudioSlide>) => {
    update({ slides: design.slides.map((s, i) => (i === index ? { ...s, ...patch } : s)) });
  };
  const moveSlide = (dir: -1 | 1) => {
    const to = index + dir;
    if (to < 0 || to >= design.slides.length) return;
    const slides = [...design.slides];
    [slides[index], slides[to]] = [slides[to], slides[index]];
    update({ slides });
    setSelected(to);
  };
  const addSlide = (layout: StudioLayout) => {
    const slides = [...design.slides];
    slides.splice(index + 1, 0, newSlide(layout));
    update({ slides });
    setSelected(index + 1);
  };
  const duplicateSlide = () => {
    const slides = [...design.slides];
    slides.splice(index + 1, 0, { ...slide, options: [...slide.options], items: slide.items.map((i) => ({ ...i })) });
    update({ slides });
    setSelected(index + 1);
  };
  const removeSlide = () => {
    if (design.slides.length <= 1) return;
    update({ slides: design.slides.filter((_, i) => i !== index) });
    setSelected(Math.max(0, index - 1));
  };

  const close = () => {
    if (editing.dirty && !window.confirm('Hay cambios sin guardar. ¿Salir igual?')) return;
    onClose();
  };

  const nodes = () => exportRefs.current.slice(0, design.slides.length).filter((n): n is HTMLDivElement => n !== null);
  const run = async (kind: 'zip' | 'png' | 'share') => {
    setBusy(kind);
    try {
      if (kind === 'png') {
        const node = exportRefs.current[index];
        if (node) await downloadSlide(node, slideFileName(design.title, index, design.slides.length));
      } else if (kind === 'zip') {
        await downloadZip(nodes(), design.title);
      } else if (!(await shareSlides(nodes(), design.title))) {
        toast.info('Este navegador no permite compartir imágenes. Usa «Descargar».');
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo exportar.');
    } finally {
      setBusy(null);
    }
  };

  const fields = FIELDS[slide.layout];
  const isCarousel = design.format === 'carrusel';

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" onClick={close}><ArrowLeft className="w-4 h-4 mr-1" /> Diseños</Button>
        <Input className="max-w-sm" value={design.title} maxLength={200} onChange={(e) => update({ title: e.target.value })} aria-label="Nombre del diseño" />
        <Select
          value={design.format}
          onValueChange={(v) => {
            // Un post o una historia es UNA imagen: se quedaría solo con la primera lámina.
            if (v !== 'carrusel' && design.slides.length > 1 && !window.confirm('Un post o una historia es una sola imagen: se queda solo la primera lámina. ¿Seguir?')) return;
            update({ format: v as StudioFormat });
            setSelected(0);
          }}
        >
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>{Object.entries(FORMAT_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={design.theme} onValueChange={(v) => update({ theme: v as StudioTheme })}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>{Object.entries(THEME_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
        </Select>
        <WriteButton size="sm" onClick={() => save.mutate({ id: editing.id, design })} disabled={save.isPending || !editing.dirty}>
          {save.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
          {editing.dirty ? 'Guardar' : 'Guardado'}
        </WriteButton>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
        <div className="space-y-4 min-w-0">
          {isCarousel && (
            <div className="flex gap-3 overflow-x-auto pb-2">
              {design.slides.map((s, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setSelected(i)}
                  className={`shrink-0 rounded-lg ring-offset-2 ${i === index ? 'ring-2 ring-primary' : 'opacity-80 hover:opacity-100'}`}
                  aria-label={`Lámina ${i + 1}`}
                >
                  <ScaledSlide design={design} slide={s} index={i} width={96} />
                </button>
              ))}
            </div>
          )}
          <div ref={previewRef} className="mx-auto w-full" style={{ maxWidth: design.format === 'historia' ? 380 : 520 }}>
            <ScaledSlide design={design} slide={slide} index={index} width={previewWidth} />
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            {isCarousel && (
              <Button size="sm" onClick={() => run('zip')} disabled={busy != null}>
                {busy === 'zip' ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />} Descargar todo (ZIP)
              </Button>
            )}
            <Button size="sm" variant={isCarousel ? 'outline' : 'default'} onClick={() => run('png')} disabled={busy != null}>
              {busy === 'png' ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ImageIcon className="w-4 h-4 mr-2" />} {isCarousel ? 'Esta lámina (PNG)' : 'Descargar PNG'}
            </Button>
            <Button size="sm" variant="outline" onClick={() => run('share')} disabled={busy != null}>
              {busy === 'share' ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Share2 className="w-4 h-4 mr-2" />} Compartir / guardar en el celular
            </Button>
          </div>
        </div>

        <div className="space-y-4 min-w-0">
          <Card className="rounded-2xl border-0 shadow-md shadow-black/5">
            <CardContent className="pt-6 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-medium">{isCarousel ? `Lámina ${index + 1} de ${design.slides.length}` : 'Contenido'}</p>
                {isCarousel && (
                  <div className="flex gap-1">
                    <Button size="icon" variant="ghost" onClick={() => moveSlide(-1)} disabled={index === 0} aria-label="Mover antes"><ArrowUp className="w-4 h-4" /></Button>
                    <Button size="icon" variant="ghost" onClick={() => moveSlide(1)} disabled={index === design.slides.length - 1} aria-label="Mover después"><ArrowDown className="w-4 h-4" /></Button>
                    <Button size="icon" variant="ghost" onClick={duplicateSlide} disabled={design.slides.length >= STUDIO_MAX_SLIDES} aria-label="Duplicar"><Copy className="w-4 h-4" /></Button>
                    <Button size="icon" variant="ghost" onClick={removeSlide} disabled={design.slides.length <= 1} aria-label="Quitar lámina"><Trash2 className="w-4 h-4" /></Button>
                  </div>
                )}
              </div>

              <div className="space-y-1.5">
                <Label>Tipo de lámina</Label>
                <Select value={slide.layout} onValueChange={(v) => updateSlide({ layout: v as StudioLayout })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{STUDIO_LAYOUTS.map((l) => <SelectItem key={l} value={l}>{LAYOUT_LABEL[l]}</SelectItem>)}</SelectContent>
                </Select>
              </div>

              {fields.map((field) => (
                <SlideField key={field} field={field} slide={slide} onChange={updateSlide} />
              ))}

              <div className="space-y-1.5">
                <Label>{slide.layout === 'imagen' ? 'Imagen (de Claude Design u otra, 3:4 o 9:16)' : 'Foto'}</Label>
                <div className="flex items-center gap-2">
                  <ImageUploadField value={slide.imageUrl} onChange={(url) => updateSlide({ imageUrl: url })} pathPrefix="studio" />
                  {slide.imageUrl && <Button size="icon" variant="ghost" onClick={() => updateSlide({ imageUrl: '' })} aria-label="Quitar foto"><X className="w-4 h-4" /></Button>}
                </div>
              </div>

              {design.theme === 'azul' && slide.layout !== 'imagen' && (
                <div className="space-y-1.5">
                  <Label>Lado de la foto</Label>
                  <Select value={slide.imageSide} onValueChange={(v) => updateSlide({ imageSide: v as StudioSlide['imageSide'] })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="auto">Automático (se alterna)</SelectItem>
                      <SelectItem value="left">Izquierda</SelectItem>
                      <SelectItem value="right">Derecha</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
              {design.theme === 'pastel' && slide.layout !== 'imagen' && (
                <div className="space-y-1.5">
                  <Label>Color de fondo</Label>
                  <Select value={String(slide.palette)} onValueChange={(v) => updateSlide({ palette: Number(v) })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="-1">Automático (se turna)</SelectItem>
                      {PASTEL_PALETTE_LABELS.map((label, i) => <SelectItem key={i} value={String(i)}>{label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {isCarousel && slide.layout !== 'imagen' && (
                <div className="flex items-center gap-2">
                  <Switch id="swipe-hint" checked={slide.swipeHint} onCheckedChange={(v) => updateSlide({ swipeHint: v === true })} />
                  <Label htmlFor="swipe-hint">Mostrar «Desliza →»</Label>
                </div>
              )}
            </CardContent>
          </Card>

          {isCarousel && design.slides.length < STUDIO_MAX_SLIDES && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-muted-foreground">Agregar lámina:</span>
              {STUDIO_LAYOUTS.map((l) => (
                <Button key={l} size="sm" variant="outline" onClick={() => addSlide(l)}><Plus className="w-3 h-3 mr-1" />{LAYOUT_LABEL[l]}</Button>
              ))}
            </div>
          )}

          <Card className="rounded-2xl border-0 shadow-md shadow-black/5">
            <CardContent className="pt-6 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="studio-caption">Texto de la publicación</Label>
                {design.caption && <Button size="sm" variant="ghost" onClick={() => copyText(design.caption)}><Copy className="w-4 h-4 mr-1" /> Copiar</Button>}
              </div>
              <Textarea id="studio-caption" rows={5} maxLength={3000} value={design.caption} onChange={(e) => update({ caption: e.target.value })} placeholder="El caption para pegar en Instagram (opcional)." />
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Las láminas a tamaño real, fuera de la pantalla: de acá salen los PNG. */}
      <div aria-hidden style={{ position: 'fixed', left: -20000, top: 0, pointerEvents: 'none' }}>
        {design.slides.map((s, i) => (
          <StudioSlideView
            key={i}
            ref={(el) => { exportRefs.current[i] = el; }}
            theme={design.theme}
            format={design.format}
            slide={s}
            index={i}
            total={design.slides.length}
          />
        ))}
      </div>
    </div>
  );
}

function SlideField({ field, slide, onChange }: { field: Field; slide: StudioSlide; onChange: (patch: Partial<StudioSlide>) => void }) {
  const label = FIELD_LABEL[field];
  if (field === 'options') {
    return (
      <div className="space-y-1.5">
        <Label>{label}</Label>
        {slide.options.map((o, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="w-5 text-sm font-semibold text-muted-foreground">{String.fromCharCode(97 + i)}</span>
            <Input value={o} maxLength={160} onChange={(e) => onChange({ options: slide.options.map((x, j) => (j === i ? e.target.value : x)) })} />
            <Button size="icon" variant="ghost" onClick={() => onChange({ options: slide.options.filter((_, j) => j !== i) })} aria-label="Quitar opción"><X className="w-4 h-4" /></Button>
          </div>
        ))}
        {slide.options.length < STUDIO_MAX_OPTIONS && (
          <Button size="sm" variant="outline" onClick={() => onChange({ options: [...slide.options, ''] })}><Plus className="w-3 h-3 mr-1" /> Opción</Button>
        )}
      </div>
    );
  }
  if (field === 'items') {
    const isSteps = slide.layout === 'pasos';
    return (
      <div className="space-y-2">
        <Label>{isSteps ? 'Pasos' : 'Resultados'}</Label>
        {slide.items.map((item, i) => {
          const set = (patch: Partial<typeof item>) => onChange({ items: slide.items.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
          return (
            <div key={i} className="rounded-xl border p-2 space-y-2">
              <div className="flex items-center gap-2">
                <Input className="w-28" value={item.badge} maxLength={24} placeholder={isSteps ? `Paso ${i + 1}` : 'Emoji'} onChange={(e) => set({ badge: e.target.value })} />
                <Input value={item.title} maxLength={80} placeholder="Título" onChange={(e) => set({ title: e.target.value })} />
                <Button size="icon" variant="ghost" onClick={() => onChange({ items: slide.items.filter((_, j) => j !== i) })} aria-label="Quitar"><X className="w-4 h-4" /></Button>
              </div>
              <Textarea rows={2} value={item.body} maxLength={240} placeholder="Descripción" onChange={(e) => set({ body: e.target.value })} />
            </div>
          );
        })}
        {slide.items.length < STUDIO_MAX_ITEMS && (
          <Button size="sm" variant="outline" onClick={() => onChange({ items: [...slide.items, { badge: '', title: '', body: '' }] })}><Plus className="w-3 h-3 mr-1" /> Agregar</Button>
        )}
      </div>
    );
  }
  const long = field === 'title' || field === 'body' || field === 'footnote';
  const max = { script: 40, number: 6, title: 200, body: 400, cta: 60, footnote: 200 }[field];
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {long
        ? <Textarea rows={field === 'title' ? 2 : 3} value={slide[field]} maxLength={max} onChange={(e) => onChange({ [field]: e.target.value })} />
        : <Input value={slide[field]} maxLength={max} onChange={(e) => onChange({ [field]: e.target.value })} />}
    </div>
  );
}
