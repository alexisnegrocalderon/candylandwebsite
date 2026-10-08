import { forwardRef, useImperativeHandle, useRef } from 'react';
import { fitWhenReady } from './fitText';
import { STUDIO_SIZES, type StudioFormat } from '@shared/contentStudio';
import { slideDocument, type AiSlide } from '@shared/studioAi';

/* Una lámina del Diseñador IA, dibujada a tamaño REAL (1080 de ancho) dentro
 * de un iframe y achicada con `transform` para la vista previa.
 *
 * El iframe va con `sandbox` SIN `allow-scripts`: el HTML lo escribió la IA y
 * aunque el servidor ya lo saneó, acá tampoco puede correr nada.
 * `allow-same-origin` hace falta para que la exportación a PNG pueda leer el
 * nodo de adentro (y las fuentes de /studio/). */

export interface SlideFrameHandle {
  /** El .board de adentro, listo para exportar (null si todavía no cargó). */
  board(): HTMLElement | null;
  /** Se cumple cuando la lámina terminó de cargar (fuentes, fotos) y de ajustar
   * el texto que se salía (fitText.ts). Esperarla antes de exportar. */
  ready(): Promise<void>;
}

function newDeferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => { resolve = r; });
  return { promise, resolve };
}

export const SlideFrame = forwardRef<SlideFrameHandle, {
  css: string;
  format: StudioFormat;
  slide: AiSlide;
  /** Ancho en pantalla (px). */
  width: number;
  className?: string;
}>(function SlideFrame({ css, format, slide, width, className }, ref) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const size = STUDIO_SIZES[format];
  const scale = width / size.width;

  const srcDoc = slideDocument({ css, format }, slide);
  // Cada vez que cambia el documento el iframe vuelve a cargar: se renueva la
  // promesa de «lista», que se cumple recién cuando se ajustó el texto.
  const lastDoc = useRef('');
  const loaded = useRef(newDeferred());
  if (lastDoc.current !== srcDoc) {
    lastDoc.current = srcDoc;
    loaded.current = newDeferred();
  }

  useImperativeHandle(ref, () => ({
    board: () => iframeRef.current?.contentDocument?.querySelector<HTMLElement>('.board') ?? null,
    ready: () => loaded.current.promise,
  }));

  const onLoad = () => {
    const doc = iframeRef.current?.contentDocument;
    const done = loaded.current.resolve;
    if (!doc) { done(); return; }
    fitWhenReady(doc).catch(() => { /* sin ajuste: se ve como la escribió la IA */ }).finally(done);
  };

  return (
    <div className={`relative overflow-hidden ${className ?? ''}`} style={{ width, height: size.height * scale }}>
      <iframe
        ref={iframeRef}
        title="Lámina"
        sandbox="allow-same-origin"
        srcDoc={srcDoc}
        onLoad={onLoad}
        style={{ width: size.width, height: size.height, border: 0, transform: `scale(${scale})`, transformOrigin: 'top left', pointerEvents: 'none' }}
        tabIndex={-1}
      />
    </div>
  );
});
