import { useRef } from 'react';
import { fitWhenReady, withTimeout } from './fitText';
import { STUDIO_SIZES, type StudioFormat } from '@shared/contentStudio';
import { slideDocument, type AiSlide } from '@shared/studioAi';

/* Una lámina del Diseñador IA, dibujada a tamaño REAL (1080 de ancho) dentro
 * de un iframe y achicada con `transform` para la vista previa.
 *
 * El iframe va con `sandbox` SIN `allow-scripts`: el HTML lo escribió la IA y
 * aunque el servidor ya lo saneó, acá tampoco puede correr nada.
 * `allow-same-origin` deja que el panel LEA y cambie su DOM.
 *
 * ⚠️ Lo que NO se puede hacer con un iframe sin scripts (Safari del iPad lo
 * aplica estricto, Chrome no): registrar eventos dentro de él, ni usar los
 * temporizadores de su ventana. Por eso los toques del editor se capturan en
 * una capa transparente de la página principal y se traducen con
 * `elementFromPoint`, y las esperas usan los temporizadores de la página.
 * La exportación a PNG tampoco pasa por este iframe (ver exportSlides.ts). */

/** Tope para el ajuste de texto: si algo se atasca, la lámina igual queda lista. */
const READY_MAX_MS = 5000;

export function SlideFrame({ css, format, slide, width, className, onDocReady, onTap }: {
  css: string;
  format: StudioFormat;
  slide: AiSlide;
  /** Ancho en pantalla (px). */
  width: number;
  className?: string;
  /** Se llama cuando la lámina terminó de cargar y de ajustar su texto. */
  onDocReady?: (doc: Document) => void;
  /** El editor a mano: se llama con el elemento de la lámina que se tocó. */
  onTap?: (doc: Document, target: Element | null) => void;
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const size = STUDIO_SIZES[format];
  const scale = width / size.width;

  const onLoad = () => {
    const doc = iframeRef.current?.contentDocument;
    if (!doc) return;
    const board = doc.querySelector<HTMLElement>('.board');
    const fit = board ? fitWhenReady(board) : Promise.resolve();
    withTimeout(fit.catch(() => { /* sin ajuste: se ve como la escribió la IA */ }), READY_MAX_MS)
      .finally(() => onDocReady?.(doc));
  };

  const tap = (e: React.MouseEvent<HTMLDivElement>) => {
    const doc = iframeRef.current?.contentDocument;
    if (!doc || !onTap) return;
    const rect = e.currentTarget.getBoundingClientRect();
    // De píxeles de pantalla a píxeles de la lámina (que está escalada).
    onTap(doc, doc.elementFromPoint((e.clientX - rect.left) / scale, (e.clientY - rect.top) / scale));
  };

  return (
    <div className={`relative overflow-hidden ${className ?? ''}`} style={{ width, height: size.height * scale }}>
      <iframe
        ref={iframeRef}
        title="Lámina"
        sandbox="allow-same-origin"
        srcDoc={slideDocument({ css, format }, slide)}
        onLoad={onLoad}
        style={{ width: size.width, height: size.height, border: 0, transform: `scale(${scale})`, transformOrigin: 'top left', pointerEvents: 'none' }}
        tabIndex={-1}
      />
      {onTap && (
        <div
          role="presentation"
          onClick={tap}
          className="absolute inset-0 cursor-pointer"
          style={{ touchAction: 'manipulation' }}
        />
      )}
    </div>
  );
}
