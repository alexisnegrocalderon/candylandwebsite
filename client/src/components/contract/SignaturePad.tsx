import { useEffect, useRef, useState } from 'react';
import { Eraser } from 'lucide-react';

const GOLD = '#d6b25e';

/** Recuadro para firmar con el dedo (o el mouse). Entrega la firma como PNG (data URL), o '' si se borra. */
export function SignaturePad({ onChange, height = 176 }: { onChange: (png: string) => void; height?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  const [hasInk, setHasInk] = useState(false);

  useEffect(() => {
    const c = ref.current!;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const { width, height } = c.getBoundingClientRect();
    c.width = Math.round(width * dpr); c.height = Math.round(height * dpr);
    const ctx = c.getContext('2d')!;
    ctx.scale(dpr, dpr); ctx.lineWidth = 2.4; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#141210';
  }, []);

  const pos = (e: React.PointerEvent) => { const r = ref.current!.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  const down = (e: React.PointerEvent) => { e.preventDefault(); ref.current!.setPointerCapture(e.pointerId); drawing.current = true; last.current = pos(e); };
  const move = (e: React.PointerEvent) => {
    if (!drawing.current || !last.current) return;
    const p = pos(e); const ctx = ref.current!.getContext('2d')!;
    ctx.beginPath(); ctx.moveTo(last.current.x, last.current.y); ctx.lineTo(p.x, p.y); ctx.stroke();
    last.current = p;
    if (!hasInk) setHasInk(true);
  };
  const up = () => {
    if (!drawing.current) return;
    drawing.current = false; last.current = null;
    onChange(ref.current!.toDataURL('image/png'));
  };
  const clear = () => {
    const c = ref.current!; c.getContext('2d')!.clearRect(0, 0, c.width, c.height);
    setHasInk(false); onChange('');
  };

  return (
    <div>
      <div className="relative overflow-hidden rounded-2xl border-2 border-dashed" style={{ borderColor: `${GOLD}99`, background: '#f6f1e4' }}>
        <canvas ref={ref} className="block w-full touch-none" style={{ touchAction: 'none', height }}
          onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onPointerLeave={up} aria-label="Recuadro para dibujar tu firma" />
        {!hasInk && <p className="pointer-events-none absolute inset-0 grid place-items-center text-sm" style={{ color: '#8b7f63' }}>Dibuja tu firma aquí con el dedo</p>}
      </div>
      <button type="button" onClick={clear} className="mt-2 inline-flex items-center gap-1.5 text-sm" style={{ color: GOLD }}>
        <Eraser className="h-4 w-4" /> Borrar y volver a firmar
      </button>
    </div>
  );
}
