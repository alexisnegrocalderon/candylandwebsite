import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { toast } from 'sonner';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, ChevronDown, Copy, Download, Link2, Loader2, MessageCircle, Share2, Sparkles, Ticket } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatChileShortDate } from '@shared/chileDate';
import { ambassadorDirectMessage, type AmbassadorContentEvent, type AmbassadorItem } from '@shared/ambassadorContent';
import { ScaledSlide } from '@/components/admin/studio/ScaledSlide';
import { StudioSlideView } from '@/components/admin/studio/StudioSlideView';
import { captureSlide, downloadBlob, slideFileName, type ExportItem } from '@/components/admin/studio/exportSlides';
import { sleep } from '@/components/admin/studio/fitText';

/* «Tu contenido para compartir» del panel de embajador: lo que el dueño
 * aprobó, ya con el link, el código y el nombre de cada embajador (lo arma
 * el servidor, ver shared/ambassadorContent.ts). Desde acá se comparte
 * directo a Instagram (historia, feed o mensaje) o a WhatsApp con el menú de
 * compartir del celular, o se guarda. Las piezas de plantilla se generan en
 * su celular: no gastan nada. */

export interface PanelMaterial {
  title: string | null;
  storiesText: string | null;
  reelText: string | null;
  postText: string | null;
  countdownText: string | null;
  links: { label: string; url: string }[];
}

export type PanelItem = AmbassadorItem & { id: number };

type Copier = { copied: string | null; copy: (key: string, text: string, quiet?: boolean) => Promise<void> };

function useCopy(): Copier {
  const [copied, setCopied] = useState<string | null>(null);
  const copy = async (key: string, text: string, quiet = false) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied((k) => (k === key ? null : k)), 2000);
    } catch {
      if (!quiet) toast.error('No se pudo copiar. Mantén apretado el texto y cópialo a mano.');
    }
  };
  return { copied, copy };
}

export function AmbassadorContent({ code, events, items, material }: { code: string; events: AmbassadorContentEvent[]; items: PanelItem[]; material: PanelMaterial | null }) {
  const copier = useCopy();
  // El correo semanal enlaza a /embajador/CODIGO#contenido; la sección aparece
  // recién cuando cargan los datos, así que el navegador no alcanza a bajar solo.
  const hasContent = events.length > 0 || items.length > 0 || !!material;
  useEffect(() => {
    if (hasContent && window.location.hash === '#contenido') document.getElementById('contenido')?.scrollIntoView({ behavior: 'smooth' });
  }, [hasContent]);
  if (!hasContent) return null;

  const general = items.filter((i) => i.eventId === null);
  return (
    <section id="contenido" className="mb-6 scroll-mt-24">
      <div className="bg-gradient-to-br from-secondary/15 to-primary/10 border border-secondary/30 rounded-2xl p-6 mb-4">
        <div className="flex items-center gap-2 mb-1">
          <Sparkles className="w-5 h-5 text-secondary" />
          <h2 className="font-heading text-2xl">Tu contenido para compartir</h2>
        </div>
        <p className="text-muted-foreground text-sm">
          Acá aparecen tus imágenes y videos listos, con tu link y tu código. Toca <strong className="text-foreground">Compartir</strong> y elige
          Instagram (historia, feed o mensaje) o WhatsApp. El texto se copia solo: lo pegas al publicar.
        </p>
        <TwoWays />
        <LinkStickerGuide />
      </div>

      {general.length > 0 && (
        <div className="bg-card border border-border/50 rounded-2xl p-6 mb-4">
          <h3 className="font-heading text-xl mb-3">Para compartir cuando quieras</h3>
          <ItemGrid items={general} copier={copier} />
        </div>
      )}

      {events.map((event) => (
        <EventContent key={event.id} event={event} code={code} items={items.filter((i) => i.eventId === event.id)} copier={copier} />
      ))}

      {material && <WeeklyMaterial material={material} copier={copier} />}
    </section>
  );
}

/** Las dos formas de vender, en simple. */
function TwoWays() {
  return (
    <div className="grid sm:grid-cols-2 gap-3 mt-4">
      <div className="rounded-xl border border-secondary/40 bg-background/60 p-4">
        <p className="flex items-center gap-2 font-semibold"><Link2 className="w-4 h-4 text-secondary" /> 1. Con tu link <span className="text-xs font-normal px-2 py-0.5 rounded-full bg-secondary/20 text-secondary">recomendado</span></p>
        <p className="text-sm text-muted-foreground mt-1">
          Lo pones en el sticker «Enlace» de tu historia o lo mandas por WhatsApp. Quien lo toca y compra queda como venta tuya, <strong className="text-foreground">sin escribir nada</strong>.
        </p>
      </div>
      <div className="rounded-xl border border-border/60 bg-background/60 p-4">
        <p className="flex items-center gap-2 font-semibold"><Ticket className="w-4 h-4 text-primary" /> 2. Con tu código</p>
        <p className="text-sm text-muted-foreground mt-1">
          Para el feed (ahí Instagram no deja links) o si no te resulta el sticker. Quien compra en mansionplayroom.cl escribe tu código al pagar.
        </p>
      </div>
    </div>
  );
}

const STICKER_STEPS = [
  'Toca «Copiar mi link» en el evento que quieras compartir (más abajo).',
  'En la imagen o video que quieras subir, toca «Compartir» y elige Instagram → Historia. (O «Guardar» y la eliges desde tus fotos.)',
  'Arriba, toca el ícono de stickers (el cuadrado con una carita) y elige «Enlace».',
  'En «URL», mantén apretado y toca «Pegar». Aparece tu link.',
  'Toca «Personalizar texto del sticker» y escribe ENTRADAS.',
  'Toca «Listo» y arrastra el sticker encima del botón «Entradas en el link» de la imagen.',
  'Publica. Quien toque el sticker llega a comprar con tu link, y la venta es tuya.',
];

function LinkStickerGuide() {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-4 rounded-xl border border-border/60 bg-background/60">
      <button type="button" onClick={() => setOpen((o) => !o)} className="w-full flex items-center justify-between gap-2 p-4 text-left font-semibold" aria-expanded={open}>
        ¿Cómo pongo mi link en una historia? (paso a paso)
        <ChevronDown className={`w-4 h-4 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      <AnimatePresence initial={false}>
      {open && (
        <motion.div
          key="pasos"
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.28, ease: [0.32, 0.72, 0, 1] }}
          className="overflow-hidden"
        >
        <div className="px-4 pb-4">
          <ol className="space-y-2">
            {STICKER_STEPS.map((step, i) => (
              <li key={i} className="flex gap-3 text-sm">
                <span className="shrink-0 w-6 h-6 rounded-full bg-secondary/20 text-secondary grid place-items-center text-xs font-bold">{i + 1}</span>
                <span className="pt-0.5">{step}</span>
              </li>
            ))}
          </ol>
          <p className="text-xs text-muted-foreground mt-3 pt-3 border-t border-border/40">
            ¿No te aparece «Enlace»? Actualiza Instagram desde la tienda de apps. Si igual no aparece, usa una imagen «con tu código»: tu código va
            escrito en ella y funciona igual. ¿No te aparece Instagram al tocar «Compartir»? Toca «Guardar» y súbela desde tus fotos.
          </p>
        </div>
        </motion.div>
      )}
      </AnimatePresence>
    </div>
  );
}

function CopyButton({ id, text, label, copier, icon }: { id: string; text: string; label: string; copier: Copier; icon?: ReactNode }) {
  return (
    <Button size="sm" variant="outline" onClick={() => copier.copy(id, text)} className="rounded-full">
      {copier.copied === id ? <Check className="w-4 h-4 mr-2" /> : (icon ?? <Copy className="w-4 h-4 mr-2" />)}
      {copier.copied === id ? '¡Copiado!' : label}
    </Button>
  );
}

function EventContent({ event, code, items, copier }: { event: AmbassadorContentEvent; code: string; items: PanelItem[]; copier: Copier }) {
  const message = ambassadorDirectMessage(event, code);
  const shareMessage = async () => {
    if (typeof navigator.share === 'function') {
      try { await navigator.share({ text: message }); return; } catch (e) { if (e instanceof DOMException && e.name === 'AbortError') return; }
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank', 'noopener');
  };

  return (
    <div className="bg-card border border-border/50 rounded-2xl p-6 mb-4">
      <p className="text-xs uppercase tracking-[0.2em] text-primary font-semibold">{formatChileShortDate(event.eventDate)}</p>
      <h3 className="font-heading text-xl mb-3">{event.title}</h3>

      <div className="rounded-xl bg-secondary/10 border border-secondary/30 p-3 mb-4">
        <p className="text-xs text-muted-foreground mb-2">Tu link para este evento</p>
        <p className="font-mono text-xs break-all mb-3">{event.referralUrl}</p>
        <div className="flex flex-wrap gap-2">
          <CopyButton id={`link-${event.id}`} text={event.referralUrl} label="Copiar mi link" copier={copier} icon={<Link2 className="w-4 h-4 mr-2" />} />
          <Button size="sm" variant="outline" className="rounded-full" onClick={shareMessage}>
            <MessageCircle className="w-4 h-4 mr-2" /> Invitar por WhatsApp o DM
          </Button>
        </div>
      </div>

      {items.length > 0
        ? <ItemGrid items={items} copier={copier} />
        : <p className="text-sm text-muted-foreground">Las imágenes de este evento están en preparación. Mientras, ya puedes compartir tu link.</p>}
    </div>
  );
}

function ItemGrid({ items, copier }: { items: PanelItem[]; copier: Copier }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
      {items.map((item) => <ItemCard key={item.id} item={item} copier={copier} />)}
    </div>
  );
}

/** El ancho de la columna, para que la miniatura la llene sin salirse. */
function useBoxWidth(ref: RefObject<HTMLDivElement | null>): number {
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(Math.min(220, Math.floor(el.clientWidth))));
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return width;
}

function fileNameFor(item: PanelItem, blob: Blob): string {
  const ext = blob.type.includes('png') ? 'png'
    : blob.type.includes('jpeg') ? 'jpg'
      : blob.type.includes('webp') ? 'webp'
        : blob.type.includes('quicktime') ? 'mov'
          : blob.type.includes('webm') ? 'webm'
            : blob.type.startsWith('video/') ? 'mp4' : 'jpg';
  return slideFileName(item.label, 0, 1).replace(/\.png$/, `.${ext}`);
}

/** Una pieza, foto o video con sus botones. El archivo se prepara al tocar
 * (en el celular no conviene generar todo de una). Safari pide un toque
 * nuevo para abrir el menú de compartir si la preparación tardó: entonces el
 * archivo queda listo y el botón pide tocar otra vez. */
function ItemCard({ item, copier }: { item: PanelItem; copier: Copier }) {
  const [busy, setBusy] = useState<null | 'share' | 'save'>(null);
  const [ready, setReady] = useState<ExportItem | null>(null);
  const [rendering, setRendering] = useState(false);
  const node = useRef<HTMLDivElement | null>(null);
  const waiter = useRef<((el: HTMLDivElement) => void) | null>(null);
  const cache = useRef<ExportItem | null>(null);
  const box = useRef<HTMLDivElement | null>(null);

  const prepare = async (): Promise<ExportItem> => {
    if (cache.current) return cache.current;
    let blob: Blob;
    if (item.kind === 'pieza') {
      // Se dibuja a tamaño real fuera de la pantalla solo mientras se captura.
      const el = await new Promise<HTMLDivElement>((resolve) => {
        if (node.current) { resolve(node.current); return; }
        waiter.current = resolve;
        setRendering(true);
      });
      await sleep(150);
      blob = await captureSlide(el);
      setRendering(false);
    } else {
      const res = await fetch(item.mediaUrl);
      if (!res.ok) throw new Error('No se pudo bajar el archivo. Revisa tu conexión.');
      blob = await res.blob();
    }
    cache.current = { name: fileNameFor(item, blob), blob };
    return cache.current;
  };

  const shareFile = async (file: ExportItem) => {
    const files = [new File([file.blob], file.name, { type: file.blob.type || 'image/png' })];
    if (typeof navigator.canShare !== 'function' || !navigator.canShare({ files })) {
      downloadBlob(file);
      toast.info('Tu celular no deja compartir directo desde acá: quedó guardado. Súbelo desde tus fotos.');
      return;
    }
    try {
      await navigator.share({ files });
      setReady(null);
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') { setReady(null); return; }
      if (e instanceof DOMException && e.name === 'NotAllowedError') { setReady(file); return; }
      throw e;
    }
  };

  const share = async () => {
    // Instagram no recibe el texto al compartir: se deja copiado para pegarlo.
    if (item.caption) {
      await copier.copy(`caption-${item.id}`, item.caption, true);
      toast.success('Texto copiado: pégalo al publicar.');
    }
    if (ready) { await shareFile(ready); return; }
    setBusy('share');
    try {
      await shareFile(await prepare());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo preparar el archivo.');
    } finally {
      setBusy(null);
      setRendering(false);
    }
  };

  const save = async () => {
    setBusy('save');
    try {
      downloadBlob(await prepare());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo guardar.');
    } finally {
      setBusy(null);
      setRendering(false);
    }
  };

  const slide = item.design?.slides[0];
  const ratio = item.mediaFormat === 'post' ? 'aspect-[3/4]' : 'aspect-[9/16]';
  const width = useBoxWidth(box);
  return (
    <div ref={box} className="space-y-2 min-w-0">
      {item.kind === 'pieza' && item.design && slide ? (
        width > 0 && <ScaledSlide design={item.design} slide={slide} index={0} width={width} />
      ) : item.kind === 'video' ? (
        <video src={`${item.mediaUrl}#t=0.5`} controls playsInline muted preload="metadata" className={`w-full ${ratio} object-cover rounded-lg bg-black`} />
      ) : (
        <img src={item.mediaUrl} alt={item.label} loading="lazy" className={`w-full ${ratio} object-cover rounded-lg`} />
      )}
      <p className="text-sm font-semibold leading-tight flex items-center gap-1.5">
        {item.via === 'link' ? <Link2 className="w-3.5 h-3.5 text-secondary shrink-0" /> : <Ticket className="w-3.5 h-3.5 text-primary shrink-0" />}
        {item.label}
      </p>
      {item.hint && <p className="text-xs text-muted-foreground">{item.hint}</p>}
      <Button size="sm" className="w-full rounded-full" onClick={share} disabled={busy != null}>
        {busy === 'share' ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Share2 className="w-4 h-4 mr-2" />}
        {busy === 'share' ? 'Preparando…' : ready ? 'Listo: toca para compartir' : 'Compartir'}
      </Button>
      <Button size="sm" variant="outline" className="w-full rounded-full" onClick={save} disabled={busy != null}>
        {busy === 'save' ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />} Guardar
      </Button>
      {item.caption && (
        <Button size="sm" variant="outline" className="w-full rounded-full" onClick={() => copier.copy(`caption-${item.id}`, item.caption)}>
          {copier.copied === `caption-${item.id}` ? <Check className="w-4 h-4 mr-2" /> : <Copy className="w-4 h-4 mr-2" />} Copiar texto
        </Button>
      )}
      {rendering && item.design && slide && (
        <div aria-hidden style={{ position: 'fixed', left: -20000, top: 0, pointerEvents: 'none' }}>
          <StudioSlideView
            ref={(el) => {
              node.current = el;
              if (el && waiter.current) { waiter.current(el); waiter.current = null; }
            }}
            theme={item.design.theme}
            format={item.design.format}
            slide={slide}
            index={0}
            total={1}
            showBrand={item.design.showBrand}
          />
        </div>
      )}
    </div>
  );
}

function WeeklyMaterial({ material, copier }: { material: PanelMaterial; copier: Copier }) {
  const texts = [
    { id: 'stories', label: 'Para tus historias', text: material.storiesText },
    { id: 'reel', label: 'Para un reel', text: material.reelText },
    { id: 'post', label: 'Para un post', text: material.postText },
  ].filter((t): t is { id: string; label: string; text: string } => !!t.text?.trim());
  return (
    <div className="bg-card border border-border/50 rounded-2xl p-6 mb-4">
      <h3 className="font-heading text-xl mb-1">{material.title?.trim() || 'Material de la semana'}</h3>
      {material.countdownText && <p className="text-sm text-primary mb-3">{material.countdownText}</p>}
      <div className="space-y-4">
        {texts.map((t) => (
          <div key={t.id}>
            <p className="text-sm font-semibold mb-1">{t.label}</p>
            <p className="text-sm text-muted-foreground whitespace-pre-line mb-2">{t.text}</p>
            <CopyButton id={`material-${t.id}`} text={t.text} label="Copiar" copier={copier} />
          </div>
        ))}
      </div>
      {material.links.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-border/40">
          {material.links.filter((l) => /^https?:\/\//i.test(l.url)).map((l) => (
            <a key={l.url} href={l.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center h-9 px-4 rounded-full border border-border text-sm interactive">
              {l.label || 'Abrir'}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
