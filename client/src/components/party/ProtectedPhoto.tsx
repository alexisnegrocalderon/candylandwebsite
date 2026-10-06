import { useEffect, useRef, useState } from 'react';

/* Foto de Playmatch con disuasivos contra las capturas. En una web NO se
 * puede impedir una captura de pantalla (ni en iOS ni en Android); lo que sí
 * se puede es que no sirva de nada y que quede a quién culpar:
 *  - marca de agua con el alias de QUIEN MIRA, en diagonal sobre toda la foto:
 *    si una captura circula, se sabe de quién salió;
 *  - se difumina al perder el foco (cambiar de app, abrir el selector);
 *  - se dibuja en <canvas>, sin <img> que guardar ni arrastrar, y sin menú
 *    de "mantener presionado".
 * La imagen se pide con el ticketCode en un header, nunca en la URL. */
export function ProtectedPhoto({ ticketCode, profileId, viewerAlias, className = '' }: {
  ticketCode: string;
  profileId: number;
  viewerAlias: string;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [blurred, setBlurred] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setState('loading');
    (async () => {
      try {
        const res = await fetch(`/api/party/photo/${profileId}`, {
          headers: { 'x-ticket-code': ticketCode },
          cache: 'no-store',
        });
        if (!res.ok) throw new Error('sin foto');
        const bitmap = await createImageBitmap(await res.blob());
        if (cancelled) return;
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (!canvas || !ctx) return;
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        ctx.drawImage(bitmap, 0, 0);
        bitmap.close?.();
        drawWatermark(ctx, canvas.width, canvas.height, viewerAlias);
        setState('ready');
      } catch {
        if (!cancelled) setState('error');
      }
    })();
    return () => { cancelled = true; };
  }, [ticketCode, profileId, viewerAlias]);

  useEffect(() => {
    const hide = () => setBlurred(true);
    const onVisibility = () => { if (document.hidden) hide(); };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('blur', hide);
    window.addEventListener('pagehide', hide);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('blur', hide);
      window.removeEventListener('pagehide', hide);
    };
  }, []);

  return (
    <div
      className={`relative overflow-hidden bg-white/5 select-none ${className}`}
      onContextMenu={(e) => e.preventDefault()}
      onClick={() => setBlurred(false)}
      style={{ WebkitTouchCallout: 'none', WebkitUserSelect: 'none', userSelect: 'none', touchAction: 'pan-y' }}
    >
      <canvas
        ref={canvasRef}
        draggable={false}
        className="w-full h-full object-cover pointer-events-none transition-[filter] duration-150"
        style={{ filter: blurred ? 'blur(28px)' : 'none', visibility: state === 'ready' ? 'visible' : 'hidden' }}
      />
      {blurred && state === 'ready' && (
        <p className="absolute inset-0 grid place-items-center text-xs text-white/80 font-semibold">Toca para ver</p>
      )}
      {state === 'loading' && <div className="absolute inset-0 grid place-items-center text-white/30 text-xs">Cargando…</div>}
      {state === 'error' && <div className="absolute inset-0 grid place-items-center text-white/30 text-xs">Sin foto</div>}
    </div>
  );
}

function drawWatermark(ctx: CanvasRenderingContext2D, w: number, h: number, viewerAlias: string) {
  const label = `${viewerAlias} · Playmatch`;
  const fontPx = Math.max(14, Math.round(w / 22));
  ctx.save();
  ctx.translate(w / 2, h / 2);
  ctx.rotate(-Math.PI / 6);
  ctx.font = `700 ${fontPx}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(255,255,255,0.28)';
  ctx.strokeStyle = 'rgba(0,0,0,0.22)';
  ctx.lineWidth = Math.max(1, fontPx / 12);
  const step = fontPx * 3;
  const reach = Math.hypot(w, h);
  for (let y = -reach; y <= reach; y += step) {
    for (let x = -reach; x <= reach; x += ctx.measureText(label).width + fontPx * 2) {
      ctx.strokeText(label, x, y);
      ctx.fillText(label, x, y);
    }
  }
  ctx.restore();
}
