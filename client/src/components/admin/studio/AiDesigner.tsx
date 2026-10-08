import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { upload } from '@vercel/blob/client';
import { ArrowLeft, Copy, Download, Image as ImageIcon, Loader2, Paperclip, Pencil, RotateCcw, Send, Share2, Sparkles, X } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useDemoProps } from '@/lib/demoMode';
import { STUDIO_SIZES, type StudioFormat } from '@shared/contentStudio';
import { AI_MODEL_LABEL, AI_MODELS, emptyAiDesign, formatUsd, type AiDesign, type AiModel } from '@shared/studioAi';
import { SlideFrame, type SlideFrameHandle } from './SlideFrame';
import { SlideEditor } from './SlideEditor';
import { downloadSlide, downloadZip, shareSlides, slideFileName } from './exportSlides';

/* Diseñador IA del Estudio: un chat con Claude que diseña láminas con el
 * PlayRoom Design System, como la ventana de Claude Design del dueño. El
 * servidor (server/studioAi/) responde por SSE: las láminas aparecen a medida
 * que se escriben. Cada respuesta deja una versión a la que se puede volver. */

const MODEL_KEY = 'admin-studio-ai-model';
const FORMAT_LABEL: Record<StudioFormat, string> = { carrusel: 'Carrusel 3:4', post: 'Post 3:4', historia: 'Historia 9:16' };
const SUGGESTIONS: Record<StudioFormat, string[]> = {
  carrusel: [
    'Carrusel tipo Desafío de 5 láminas sobre consentimiento en la pista',
    'Carrusel tipo test «¿Qué tipo de fiestero eres?» con 4 preguntas y resultados',
    'Carrusel «Tu primera vez en Playroom»: qué esperar, en 6 láminas',
  ],
  post: ['Post anunciando la próxima fiesta con fecha y precio', 'Post con una pregunta provocadora para comentar'],
  historia: ['Historia de cuenta regresiva para la fiesta', 'Historia con encuesta: ¿disfraz o camuflaje?'],
};

interface ChatMessage {
  id?: number;
  role: 'user' | 'assistant';
  text: string;
  images: string[];
  costUsd?: number | null;
  hasSnapshot?: boolean;
}

function loadModel(): AiModel {
  try {
    const saved = window.localStorage.getItem(MODEL_KEY);
    return (AI_MODELS as readonly string[]).includes(saved ?? '') ? (saved as AiModel) : 'claude-sonnet-5-5';
  } catch {
    return 'claude-sonnet-5-5';
  }
}

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

/** Lee un stream SSE (`event:` + `data:`) y llama a `onEvent` por cada evento. */
async function readSse(body: ReadableStream<Uint8Array>, onEvent: (event: string, data: any) => void) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let cut: number;
    while ((cut = buffer.indexOf('\n\n')) >= 0) {
      const chunk = buffer.slice(0, cut);
      buffer = buffer.slice(cut + 2);
      const event = /^event: (.*)$/m.exec(chunk)?.[1] ?? 'message';
      const data = /^data: (.*)$/m.exec(chunk)?.[1];
      if (data) {
        try { onEvent(event, JSON.parse(data)); } catch { /* evento roto: se ignora */ }
      }
    }
  }
}

export function AiDesigner({ designId: initialId, format: initialFormat, eventId, onClose }: {
  designId?: number;
  format: StudioFormat;
  eventId?: number | null;
  onClose: () => void;
}) {
  const utils = trpc.useUtils();
  const demoProps = useDemoProps();
  const [designId, setDesignId] = useState<number | undefined>(initialId);
  const [design, setDesign] = useState<AiDesign>(() => emptyAiDesign(initialFormat, 'Diseño nuevo', eventId ?? null));
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [model, setModel] = useState<AiModel>(loadModel);
  const [input, setInput] = useState('');
  const [attachments, setAttachments] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [selected, setSelected] = useState(0);
  const [exporting, setExporting] = useState<null | 'zip' | 'png' | 'share'>(null);
  const [editing, setEditing] = useState(false);
  const frameRefs = useRef<(SlideFrameHandle | null)[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const [previewRef, previewWidth] = useWidth<HTMLDivElement>(420);

  const loaded = trpc.studioAi.get.useQuery({ id: initialId ?? 0 }, { enabled: initialId != null, refetchOnWindowFocus: false });
  useEffect(() => {
    if (!loaded.data) return;
    setDesign(loaded.data.design);
    setMessages(loaded.data.messages.map((m) => ({ id: m.id, role: m.role, text: m.text, images: m.images, costUsd: m.costUsd, hasSnapshot: m.hasSnapshot })));
  }, [loaded.data]);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ block: 'end' }); }, [messages.length, status]);

  const updateMeta = trpc.studioAi.updateMeta.useMutation({ onError: (e) => toast.error(e.message) });
  const saveSlide = trpc.studioAi.saveSlide.useMutation({
    onSuccess: (saved, vars) => {
      setDesign(saved);
      setEditing(false);
      setMessages((m) => [...m, { role: 'assistant', text: `Editaste a mano la lámina ${vars.index + 1}.`, images: [], costUsd: 0 }]);
      utils.contentStudio.list.invalidate();
      toast.success('Cambios guardados.');
    },
    onError: (e) => toast.error(e.message),
  });
  const restore = trpc.studioAi.restore.useMutation({
    onSuccess: (restored) => {
      setDesign(restored);
      setSelected(0);
      setMessages((m) => [...m, { role: 'assistant', text: 'Volví el diseño a una versión anterior.', images: [] }]);
      utils.contentStudio.list.invalidate();
      toast.success('Listo, volviste a esa versión.');
    },
    onError: (e) => toast.error(e.message),
  });

  const pickModel = (value: AiModel) => {
    setModel(value);
    try { window.localStorage.setItem(MODEL_KEY, value); } catch { /* sin localStorage */ }
  };

  const attach = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    try {
      for (const file of Array.from(files).slice(0, 6 - attachments.length)) {
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '-');
        const blob = await upload(`studio/${Date.now()}-${safeName}`, file, { access: 'public', handleUploadUrl: '/api/admin/blob/upload' });
        setAttachments((a) => [...a, blob.url]);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo subir la imagen.');
    } finally {
      setUploading(false);
    }
  };

  const send = async (text: string) => {
    const message = text.trim();
    if (!message || busy) return;
    const images = attachments;
    setBusy(true);
    setStatus('Enviando…');
    setInput('');
    setAttachments([]);
    setMessages((m) => [...m, { role: 'user', text: message, images }]);
    try {
      const res = await fetch('/api/admin/studio/ai', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ designId, message, images, model, format: design.format, eventId: design.eventId }),
      });
      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? 'No se pudo conectar con el diseñador.');
      }
      let failed = false;
      await readSse(res.body, (event, data) => {
        if (event === 'start') setDesignId(data.designId);
        else if (event === 'status') setStatus(data.text);
        else if (event === 'plan') {
          setStatus(`Diseñando ${data.count} lámina${data.count === 1 ? '' : 's'}…`);
          setDesign((d) => ({ ...d, title: d.title === 'Diseño nuevo' ? data.title : d.title, concept: data.concept, css: data.css, caption: data.caption, slides: Array.from({ length: data.count }, () => ({ html: '' })) }));
          setSelected(0);
        } else if (event === 'slide') {
          setDesign((d) => ({ ...d, slides: d.slides.map((s, i) => (i === data.index ? { html: data.html } : s)) }));
        } else if (event === 'done') {
          setDesign(data.design);
          setSelected((i) => Math.min(i, Math.max(0, data.design.slides.length - 1)));
          setMessages((m) => [...m, { id: data.messageId, role: 'assistant', text: data.reply, images: [], costUsd: data.costUsd, hasSnapshot: true }]);
        } else if (event === 'error') {
          failed = true;
          setMessages((m) => [...m, { role: 'assistant', text: `No pude terminar: ${data.message}`, images: [] }]);
        }
      });
      if (failed) toast.error('El diseñador no pudo terminar. Mira el mensaje en el chat.');
      utils.contentStudio.list.invalidate();
    } catch (err) {
      const text = err instanceof Error ? err.message : 'Algo falló.';
      setMessages((m) => [...m, { role: 'assistant', text: `No pude terminar: ${text}`, images: [] }]);
      toast.error(text);
    } finally {
      setBusy(false);
      setStatus('');
    }
  };

  const nodes = () => design.slides.map((_, i) => frameRefs.current[i]?.board() ?? null).filter((n): n is HTMLElement => n !== null);
  const runExport = async (kind: 'zip' | 'png' | 'share') => {
    setExporting(kind);
    try {
      // Que cada lámina termine de cargar y de ajustar su texto antes de capturarla.
      await Promise.all(frameRefs.current.slice(0, design.slides.length).map((f) => f?.ready()));
      if (kind === 'png') {
        const node = frameRefs.current[selected]?.board();
        if (!node) throw new Error('La lámina todavía no carga.');
        await downloadSlide(node, slideFileName(design.title, selected, design.slides.length));
      } else if (kind === 'zip') {
        await downloadZip(nodes(), design.title);
      } else if (!(await shareSlides(nodes(), design.title))) {
        toast.info('Este navegador no permite compartir imágenes. Usa «Descargar».');
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo exportar.');
    } finally {
      setExporting(null);
    }
  };

  const copyCaption = async () => {
    try {
      await navigator.clipboard.writeText(design.caption);
      toast.success('Texto copiado.');
    } catch {
      toast.error('No se pudo copiar. Mantén apretado el texto para copiarlo a mano.');
    }
  };

  const ready = design.slides.length > 0 && design.slides.every((s) => s.html);
  const totalCost = messages.reduce((sum, m) => sum + (m.costUsd ?? 0), 0);
  const current = design.slides[Math.min(selected, design.slides.length - 1)];
  const size = STUDIO_SIZES[design.format];
  const thumbWidth = 96;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => (busy && !window.confirm('El diseñador sigue trabajando. ¿Salir igual?') ? null : onClose())}>
          <ArrowLeft className="w-4 h-4 mr-1" /> Diseños
        </Button>
        <Input
          className="max-w-sm"
          value={design.title}
          maxLength={200}
          aria-label="Nombre del diseño"
          onChange={(e) => setDesign((d) => ({ ...d, title: e.target.value }))}
          onBlur={() => designId && design.title.trim() && updateMeta.mutate({ id: designId, title: design.title.trim() })}
        />
        <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium">{FORMAT_LABEL[design.format]}</span>
        {totalCost > 0 && <span className="text-xs text-muted-foreground">Gasto de este diseño: {formatUsd(totalCost)}</span>}
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
        {/* Chat */}
        <Card className="rounded-2xl border-0 shadow-md shadow-black/5 order-2 lg:order-1">
          <CardContent className="pt-6 flex flex-col gap-3" style={{ minHeight: 420 }}>
            <div className="flex-1 space-y-3 overflow-y-auto max-h-[60vh] pr-1">
              {messages.length === 0 && !busy && (
                <div className="space-y-3 text-sm">
                  <p className="text-muted-foreground">
                    Cuéntale al diseñador qué quieres. Usa tu Design System de Playroom y los datos del próximo evento.
                    Puedes adjuntar fotos o capturas de referencia.
                  </p>
                  <div className="flex flex-col gap-2">
                    {SUGGESTIONS[design.format].map((s) => (
                      <button key={s} type="button" className="rounded-xl border px-3 py-2 text-left hover:bg-muted/50" onClick={() => setInput(s)}>{s}</button>
                    ))}
                  </div>
                </div>
              )}
              {messages.map((m, i) => (
                <div key={m.id ?? `local-${i}`} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[90%] rounded-2xl px-3 py-2 text-sm ${m.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>
                    <p className="whitespace-pre-wrap">{m.text}</p>
                    {m.images.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {m.images.map((url) => <img key={url} src={url} alt="" className="h-14 w-14 rounded-md object-cover" />)}
                      </div>
                    )}
                    {m.role === 'assistant' && (m.costUsd != null || (m.hasSnapshot && m.id)) && (
                      <div className="mt-1 flex items-center gap-2 text-[11px] opacity-70">
                        {m.costUsd != null && <span>{formatUsd(m.costUsd)}</span>}
                        {m.hasSnapshot && m.id && designId && i < messages.length - 1 && (
                          <button type="button" className="inline-flex items-center gap-1 underline" disabled={busy || restore.isPending} onClick={() => restore.mutate({ id: designId, messageId: m.id! })}>
                            <RotateCcw className="h-3 w-3" /> Volver a esta versión
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {busy && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> {status || 'Trabajando…'}</div>
              )}
              <div ref={chatEndRef} />
            </div>

            {attachments.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {attachments.map((url) => (
                  <div key={url} className="relative">
                    <img src={url} alt="" className="h-14 w-14 rounded-md object-cover" />
                    <button type="button" aria-label="Quitar imagen" className="absolute -right-1 -top-1 rounded-full bg-background p-0.5 shadow" onClick={() => setAttachments((a) => a.filter((u) => u !== url))}>
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <Textarea
              rows={3}
              value={input}
              maxLength={4000}
              placeholder={design.slides.length ? 'Pide un cambio: «el título más grande», «la lámina 3 con fondo rosado»…' : 'Describe el diseño que quieres…'}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); send(input); }
              }}
              disabled={busy || editing}
            />
            <div className="flex flex-wrap items-center gap-2">
              <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => { attach(e.target.files); e.target.value = ''; }} />
              <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={busy || uploading || attachments.length >= 6} {...demoProps}>
                {uploading ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Paperclip className="w-4 h-4 mr-1" />} Foto
              </Button>
              <Select value={model} onValueChange={(v) => pickModel(v as AiModel)}>
                <SelectTrigger className="h-9 w-[170px]"><SelectValue /></SelectTrigger>
                <SelectContent>{AI_MODELS.map((m) => <SelectItem key={m} value={m}>{AI_MODEL_LABEL[m]}</SelectItem>)}</SelectContent>
              </Select>
              <Button size="sm" className="ml-auto" onClick={() => send(input)} disabled={busy || uploading || editing || !input.trim()} {...demoProps}>
                {busy ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Send className="w-4 h-4 mr-1" />} Enviar
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Láminas */}
        <div className="space-y-4 min-w-0 order-1 lg:order-2">
          {design.slides.length === 0 ? (
            <div className="mx-auto flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed text-center text-sm text-muted-foreground p-8" style={{ maxWidth: 420, aspectRatio: `${size.width} / ${size.height}` }}>
              {busy ? <Loader2 className="w-6 h-6 animate-spin" /> : <Sparkles className="w-6 h-6" />}
              {busy ? status || 'Trabajando…' : 'Acá van a aparecer las láminas.'}
            </div>
          ) : (
            editing && current?.html && designId ? (
              <SlideEditor
                key={`${selected}-${current.html.length}`}
                css={design.css}
                format={design.format}
                html={current.html}
                width={Math.min(previewWidth, design.format === 'historia' ? 380 : 520)}
                saving={saveSlide.isPending}
                onSave={(html) => saveSlide.mutate({ id: designId, index: selected, html })}
                onCancel={() => setEditing(false)}
              />
            ) : (
            <>
              <div className="flex gap-3 overflow-x-auto pb-2">
                {design.slides.map((s, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setSelected(i)}
                    className={`shrink-0 rounded-lg ring-offset-2 ${i === selected ? 'ring-2 ring-primary' : 'opacity-80 hover:opacity-100'}`}
                    aria-label={`Lámina ${i + 1}`}
                  >
                    {s.html
                      ? <SlideFrame ref={(el) => { frameRefs.current[i] = el; }} css={design.css} format={design.format} slide={s} width={thumbWidth} className="rounded-lg" />
                      : <div className="flex items-center justify-center rounded-lg bg-muted" style={{ width: thumbWidth, height: (size.height * thumbWidth) / size.width }}><Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /></div>}
                  </button>
                ))}
              </div>
              <div ref={previewRef} className="mx-auto w-full" style={{ maxWidth: design.format === 'historia' ? 380 : 520 }}>
                {current?.html
                  ? <SlideFrame css={design.css} format={design.format} slide={current} width={previewWidth} className="rounded-xl shadow-sm" />
                  : <div className="flex items-center justify-center rounded-xl bg-muted text-sm text-muted-foreground" style={{ width: previewWidth, height: (size.height * previewWidth) / size.width }}><Loader2 className="w-5 h-5 mr-2 animate-spin" /> Diseñando…</div>}
              </div>
              <div className="flex flex-wrap justify-center gap-2">
                {design.format === 'carrusel' && (
                  <Button size="sm" onClick={() => runExport('zip')} disabled={!ready || busy || exporting != null}>
                    {exporting === 'zip' ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />} Descargar todo (ZIP)
                  </Button>
                )}
                <Button size="sm" variant={design.format === 'carrusel' ? 'outline' : 'default'} onClick={() => runExport('png')} disabled={!current?.html || busy || exporting != null}>
                  {exporting === 'png' ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ImageIcon className="w-4 h-4 mr-2" />} {design.format === 'carrusel' ? 'Esta lámina (PNG)' : 'Descargar PNG'}
                </Button>
                <Button size="sm" variant="outline" onClick={() => runExport('share')} disabled={!ready || busy || exporting != null}>
                  {exporting === 'share' ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Share2 className="w-4 h-4 mr-2" />} Compartir / guardar en el celular
                </Button>
                <Button size="sm" variant="outline" onClick={() => setEditing(true)} disabled={!current?.html || !designId || busy || exporting != null} {...demoProps}>
                  <Pencil className="w-4 h-4 mr-2" /> Editar esta lámina
                </Button>
              </div>
            </>
            )
          )}

          {(design.caption || design.slides.length > 0) && (
            <Card className="rounded-2xl border-0 shadow-md shadow-black/5">
              <CardContent className="pt-6 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor="ai-caption">Texto de la publicación</Label>
                  {design.caption && <Button size="sm" variant="ghost" onClick={copyCaption}><Copy className="w-4 h-4 mr-1" /> Copiar</Button>}
                </div>
                <Textarea
                  id="ai-caption"
                  rows={5}
                  maxLength={3000}
                  value={design.caption}
                  onChange={(e) => setDesign((d) => ({ ...d, caption: e.target.value }))}
                  onBlur={() => designId && !busy && updateMeta.mutate({ id: designId, caption: design.caption })}
                />
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
