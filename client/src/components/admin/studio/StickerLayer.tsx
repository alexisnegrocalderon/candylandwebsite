import { useLayoutEffect, useRef, useState } from 'react';
import type { VideoSticker } from '@shared/studioVideo';

/* Encima de la vista previa, mientras está abierta la pestaña «Stickers» de
 * una escena: un recuadro por sticker que se arrastra con el dedo o el mouse.
 * La vista previa se rehace sola un momento después con la nueva posición. */

export function StickerLayer({ stickers, frameHeight, onMove }: { stickers: VideoSticker[]; frameHeight: number; onMove: (j: number, x: number, y: number) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const drag = useRef<number | null>(null);
  const [height, setHeight] = useState(0);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setHeight(el.getBoundingClientRect().height));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const place = (e: React.PointerEvent) => {
    const j = drag.current;
    const rect = box.current?.getBoundingClientRect();
    if (j == null || !rect) return;
    const clamp = (n: number) => Math.round(Math.min(100, Math.max(0, n)) * 2) / 2;
    onMove(j, clamp(((e.clientX - rect.left) / rect.width) * 100), clamp(((e.clientY - rect.top) / rect.height) * 100));
  };

  return (
    <div ref={box} className="pointer-events-none absolute inset-0 z-10">
      {stickers.map((k, j) => {
        // Alto del sticker en la pantalla: su alto en el video, a la escala de la vista previa.
        const px = Math.max(36, height ? (k.size / frameHeight) * height : 48);
        const image = /^(https?:|\/)/.test(k.value);
        return (
          <div
            key={j}
            role="button"
            tabIndex={0}
            aria-label={`Mover sticker ${j + 1}`}
            className="pointer-events-auto absolute flex cursor-grab touch-none select-none items-center justify-center rounded-xl border-2 border-dashed border-white/90 bg-white/10 shadow-[0_0_0_1px_rgba(0,0,0,0.4)] active:cursor-grabbing"
            style={{ left: `${k.x}%`, top: `${k.y}%`, width: px, height: px, transform: `translate(-50%, -50%) rotate(${k.rot}deg)` }}
            onPointerDown={(e) => { drag.current = j; (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); }}
            onPointerMove={(e) => { if (drag.current === j) place(e); }}
            onPointerUp={() => { drag.current = null; }}
            onPointerCancel={() => { drag.current = null; }}
          >
            {image ? <img src={k.value} alt="" className="h-full w-full object-contain opacity-60" draggable={false} /> : <span className="opacity-60" style={{ fontSize: px * 0.7, lineHeight: 1 }}>{k.value}</span>}
          </div>
        );
      })}
    </div>
  );
}
