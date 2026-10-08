import { forwardRef, useImperativeHandle, useRef } from 'react';
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

  useImperativeHandle(ref, () => ({
    board: () => iframeRef.current?.contentDocument?.querySelector<HTMLElement>('.board') ?? null,
  }));

  return (
    <div className={`relative overflow-hidden ${className ?? ''}`} style={{ width, height: size.height * scale }}>
      <iframe
        ref={iframeRef}
        title="Lámina"
        sandbox="allow-same-origin"
        srcDoc={slideDocument({ css, format }, slide)}
        style={{ width: size.width, height: size.height, border: 0, transform: `scale(${scale})`, transformOrigin: 'top left', pointerEvents: 'none' }}
        tabIndex={-1}
      />
    </div>
  );
});
