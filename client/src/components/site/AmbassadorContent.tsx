import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { Check, ChevronDown, Copy, Download, Link2, Loader2, MessageCircle, Share2, Sparkles, Ticket } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatChileShortDate } from '@shared/chileDate';
import {
  ambassadorDirectMessage,
  ambassadorFeedCaption,
  ambassadorPieces,
  type AmbassadorContentEvent,
  type AmbassadorPiece,
} from '@shared/ambassadorContent';
import { ScaledSlide } from '@/components/admin/studio/ScaledSlide';
import { StudioSlideView } from '@/components/admin/studio/StudioSlideView';
import { captureSlide, downloadBlob, shareItems, slideFileName, type ExportItem } from '@/components/admin/studio/exportSlides';
import { sleep } from '@/components/admin/studio/fitText';

/* «Tu contenido para compartir» del panel de embajador: las piezas de cada
 * evento próximo con su link y su código, más una guía paso a paso para poner
 * el link en una historia. Se arma sola con cada evento publicado: no hay que
 * pedir nada. Las imágenes se generan acá, en su celular (ver
 * shared/ambassadorContent.ts). */

export interface PanelMaterial {
  title: string | null;
  storiesText: string | null;
  reelText: string | null;
  postText: string | null;
  countdownText: string | null;
  links: { label: string; url: string }[];
}

function useCopy() {
  const [copied, setCopied] = useState<string | null>(null);
  const copy = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied((k) => (k === key ? null : k)), 2000);
    } catch {
      toast.error('No se pudo copiar. Mantén apretado el texto y cópialo a mano.');
    }
  };
  return { copied, copy };
}

export function AmbassadorContent({ code, events, material }: { code: string; events: AmbassadorContentEvent[]; material: PanelMaterial | null }) {
  const { copied, copy } = useCopy();
  // El correo semanal enlaza a /embajador/CODIGO#contenido; la sección aparece
  // recién cuando cargan los datos, así que el navegador no alcanza a bajar solo.
  const hasContent = events.length > 0 || !!material;
  useEffect(() => {
    if (hasContent && window.location.hash === '#contenido') document.getElementById('contenido')?.scrollIntoView({ behavior: 'smooth' });
  }, [hasContent]);
  if (!hasContent) return null;
  return (
    <section id="contenido" className="mb-6 scroll-mt-24">
      <div className="bg-gradient-to-br from-secondary/15 to-primary/10 border border-secondary/30 rounded-2xl p-6 mb-4">
        <div className="flex items-center gap-2 mb-1">
          <Sparkles className="w-5 h-5 text-secondary" />
          <h2 className="font-heading text-2xl">Tu contenido para compartir</h2>
        </div>
        <p className="text-muted-foreground text-sm">
          Cada vez que se publica un evento, acá aparecen tus imágenes listas, con tu link y tu código. Guárdalas y súbelas: no tienes que pedir nada.
        </p>
        <TwoWays />
        <LinkStickerGuide />
      </div>

      {events.map((event) => (
        <EventContent key={event.id} event={event} code={code} copied={copied} copy={copy} />
      ))}

      {material && <WeeklyMaterial material={material} copied={copied} copy={copy} />}
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
  'Toca «Guardar» en la «Historia con tu link»: queda en tus fotos.',
  'En Instagram, crea una historia y elige esa imagen.',
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
      {open && (
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
            ¿No te aparece «Enlace»? Actualiza Instagram desde la tienda de apps. Si igual no aparece, usa la «Historia con tu código»: tu código va escrito en la imagen y funciona igual.
          </p>
        </div>
      )}
    </div>
  );
}

type Copier = { copied: string | null; copy: (key: string, text: string) => void };

function CopyButton({ id, text, label, copied, copy, icon }: Copier & { id: string; text: string; label: string; icon?: ReactNode }) {
  return (
    <Button size="sm" variant="outline" onClick={() => copy(id, text)} className="rounded-full">
      {copied === id ? <Check className="w-4 h-4 mr-2" /> : (icon ?? <Copy className="w-4 h-4 mr-2" />)}
      {copied === id ? '¡Copiado!' : label}
    </Button>
  );
}

function EventContent({ event, code, copied, copy }: Copier & { event: AmbassadorContentEvent; code: string }) {
  const pieces = useMemo(() => ambassadorPieces(event, code), [event, code]);
  const caption = useMemo(() => ambassadorFeedCaption(event, code), [event, code]);
  const message = useMemo(() => ambassadorDirectMessage(event, code), [event, code]);

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
          <CopyButton id={`link-${event.id}`} text={event.referralUrl} label="Copiar mi link" copied={copied} copy={copy} icon={<Link2 className="w-4 h-4 mr-2" />} />
          <Button size="sm" variant="outline" className="rounded-full" onClick={shareMessage}>
            <MessageCircle className="w-4 h-4 mr-2" /> Mandar por WhatsApp
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {pieces.map((piece) => <PieceCard key={piece.key} piece={piece} />)}
      </div>

      <div className="mt-5 pt-4 border-t border-border/40">
        <p className="text-sm font-semibold mb-1">Texto para el post del feed</p>
        <p className="text-sm text-muted-foreground whitespace-pre-line mb-3">{caption}</p>
        <CopyButton id={`caption-${event.id}`} text={caption} label="Copiar texto" copied={copied} copy={copy} />
      </div>
    </div>
  );
}

/** Una pieza con su botón para guardarla. La imagen se genera al tocar (en
 * el celular no conviene hacerlas todas de una). Safari a veces pide un toque
 * nuevo para abrir el menú de compartir: entonces la imagen queda lista y el
 * botón pide tocar otra vez. */
function PieceCard({ piece }: { piece: AmbassadorPiece }) {
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState<ExportItem | null>(null);
  const [rendering, setRendering] = useState(false);
  const node = useRef<HTMLDivElement | null>(null);
  const waiter = useRef<((el: HTMLDivElement) => void) | null>(null);

  useEffect(() => { setReady(null); }, [piece]);

  const deliver = async (item: ExportItem) => {
    try {
      if (!(await shareItems([item], piece.label))) downloadBlob(item);
      setReady(null);
    } catch (e) {
      if (e instanceof DOMException && e.name === 'NotAllowedError') { setReady(item); return; }
      downloadBlob(item);
      setReady(null);
    }
  };

  const make = async () => {
    if (ready) { await deliver(ready); return; }
    setBusy(true);
    try {
      // Se dibuja a tamaño real fuera de la pantalla solo mientras se captura.
      const el = await new Promise<HTMLDivElement>((resolve) => {
        if (node.current) { resolve(node.current); return; }
        waiter.current = resolve;
        setRendering(true);
      });
      await sleep(150);
      const blob = await captureSlide(el);
      await deliver({ name: slideFileName(piece.design.title, 0, 1), blob });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo generar la imagen.');
    } finally {
      setBusy(false);
      setRendering(false);
    }
  };

  const slide = piece.design.slides[0];
  return (
    <div className="space-y-2">
      <ScaledSlide design={piece.design} slide={slide} index={0} width={160} />
      <p className="text-sm font-semibold leading-tight flex items-center gap-1.5">
        {piece.via === 'link' ? <Link2 className="w-3.5 h-3.5 text-secondary shrink-0" /> : <Ticket className="w-3.5 h-3.5 text-primary shrink-0" />}
        {piece.label}
      </p>
      <p className="text-xs text-muted-foreground">{piece.hint}</p>
      <Button size="sm" className="w-full rounded-full" onClick={make} disabled={busy}>
        {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : ready ? <Share2 className="w-4 h-4 mr-2" /> : <Download className="w-4 h-4 mr-2" />}
        {busy ? 'Preparando…' : ready ? 'Lista: toca para guardar' : 'Guardar'}
      </Button>
      {rendering && (
        <div aria-hidden style={{ position: 'fixed', left: -20000, top: 0, pointerEvents: 'none' }}>
          <StudioSlideView
            ref={(el) => {
              node.current = el;
              if (el && waiter.current) { waiter.current(el); waiter.current = null; }
            }}
            theme={piece.design.theme}
            format={piece.design.format}
            slide={slide}
            index={0}
            total={1}
            showBrand={piece.design.showBrand}
          />
        </div>
      )}
    </div>
  );
}

function WeeklyMaterial({ material, copied, copy }: Copier & { material: PanelMaterial }) {
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
            <CopyButton id={`material-${t.id}`} text={t.text} label="Copiar" copied={copied} copy={copy} />
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
