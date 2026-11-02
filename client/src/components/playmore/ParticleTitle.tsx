import { useEffect, useRef } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { GOLD_STOPS, loadTicketFonts } from './ticketArt';

/* El título del hero hecho de partículas doradas (las mismas de la fusión).
 * Llegan desde la oscuridad y forman el nombre; al pasar el cursor o el dedo
 * se dispersan como chispas y vuelven a su lugar. En Android con giroscopio
 * una leve brisa las mueve al inclinar el teléfono. Con "reducir movimiento"
 * se ve el texto de siempre. El <h1> real queda para lectores de pantalla y
 * buscadores. */

const FONT = '"Montserrat Variable", "Montserrat", system-ui, sans-serif';
const BUCKETS = 48;
/** Margen alrededor del texto para que las chispas puedan volar fuera de él. */
const PAD = 150;

interface P { hx: number; hy: number; x: number; y: number; vx: number; vy: number; s: number; b: number; phase: number }

/** Colores del foil dorado, por tramo horizontal del texto. */
const FOIL: string[] = (() => {
  const c = document.createElement('canvas');
  c.width = BUCKETS; c.height = 1;
  const x = c.getContext('2d')!;
  const g = x.createLinearGradient(0, 0, BUCKETS, 0);
  for (const [o, col] of GOLD_STOPS) g.addColorStop(o, col);
  x.fillStyle = g; x.fillRect(0, 0, BUCKETS, 1);
  const d = x.getImageData(0, 0, BUCKETS, 1).data;
  return Array.from({ length: BUCKETS }, (_, i) => `rgb(${d[i * 4]},${d[i * 4 + 1]},${d[i * 4 + 2]})`);
})();

export function ParticleTitle({ text, delayMs = 500 }: { text: string; delayMs?: number }) {
  const reduce = useReducedMotion();
  const boxRef = useRef<HTMLDivElement>(null);
  const cvRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (reduce) return;
    const box = boxRef.current, cv = cvRef.current;
    if (!box || !cv) return;
    let alive = true;
    let raf = 0;
    let visible = true;
    let parts: P[] = [];
    let W = 0, H = 0, dpr = 1, started = 0;
    const ptr = { x: -9999, y: -9999, on: false };
    const wind = { x: 0, y: 0 };
    let R = 90;

    const build = async () => {
      await loadTicketFonts();
      if (!alive) return;
      W = box.clientWidth;
      if (!W) return;
      // El texto más grande que entre (tope: 10.5rem como el h1 de antes).
      const m = document.createElement('canvas').getContext('2d')!;
      let size = Math.min(W < 640 ? W * 0.2 : W * 0.17, 168);
      const fit = () => { m.font = `800 ${size}px ${FONT}`; };
      fit();
      while (m.measureText(text).width > W * 0.98 && size > 36) { size -= 3; fit(); }
      H = Math.ceil(size * 1.0);
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      const CW = W + PAD * 2, CH = H + PAD * 2;
      cv.width = Math.round(CW * dpr); cv.height = Math.round(CH * dpr);
      cv.style.width = `${CW}px`; cv.style.height = `${CH}px`;
      box.style.height = `${H}px`;
      R = Math.max(70, size * 0.75);

      const off = document.createElement('canvas');
      off.width = W; off.height = H;
      const ox = off.getContext('2d', { willReadFrequently: true })!;
      ox.font = `800 ${size}px ${FONT}`;
      ox.textAlign = 'center'; ox.textBaseline = 'alphabetic';
      const tw = ox.measureText(text);
      ox.fillText(text, W / 2, H / 2 + (tw.actualBoundingBoxAscent - tw.actualBoundingBoxDescent) / 2);
      const data = ox.getImageData(0, 0, W, H).data;
      const step = size > 120 ? 2.2 : 2;
      const dotSize = step * 1.12;
      const next: P[] = [];
      for (let y = 0; y < H; y += step) {
        for (let x = 0; x < W; x += step) {
          if (data[(Math.floor(y) * W + Math.floor(x)) * 4 + 3] < 150) continue;
          const ang = Math.random() * Math.PI * 2, d = 120 + Math.random() * 380;
          next.push({
            hx: x + PAD, hy: y + PAD,
            x: x + PAD + Math.cos(ang) * d, y: y + PAD + Math.sin(ang) * d,
            vx: 0, vy: 0, s: dotSize, b: Math.min(BUCKETS - 1, Math.floor((x / W) * BUCKETS)), phase: Math.random() * 6.28,
          });
        }
      }
      // Ordenadas por color: un solo cambio de fillStyle por tramo.
      next.sort((a, b) => a.b - b.b);
      parts = next;
      started = performance.now();
    };

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (!visible || !parts.length) return;
      const ctx = cv.getContext('2d')!;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W + PAD * 2, H + PAD * 2);
      const t = (now - started - delayMs) / 1000;
      if (t < 0) return;
      const appear = Math.min(1, t / 0.9);
      const K = t < 1.6 ? 0.05 : 0.055, D = t < 1.6 ? 0.86 : 0.88;
      // Brillo que recorre el texto cada ~5 s.
      const sweep = (((now / 1000) % 5) / 5) * (W + 240) - 120;
      let bucket = -1;
      for (const p of parts) {
        p.vx += (p.hx - p.x) * K + wind.x;
        p.vy += (p.hy - p.y) * K + wind.y;
        if (ptr.on) {
          const dx = p.x - ptr.x, dy = p.y - ptr.y, d2 = dx * dx + dy * dy;
          if (d2 < R * R) {
            const d = Math.sqrt(d2) || 1, f = Math.pow(1 - d / R, 2) * 16;
            p.vx += (dx / d) * f; p.vy += (dy / d) * f;
          }
        }
        p.vx *= D; p.vy *= D;
        p.x += p.vx; p.y += p.vy;
        if (p.b !== bucket) { bucket = p.b; ctx.fillStyle = FOIL[bucket]; }
        const lit = Math.max(0, 1 - Math.abs(p.hx - PAD - sweep) / 70);
        const disp = Math.min(1, (Math.abs(p.x - p.hx) + Math.abs(p.y - p.hy)) / 40);
        ctx.globalAlpha = appear * (0.9 + 0.1 * Math.sin(now / 600 + p.phase)) * (0.8 + disp * 0.45) + lit * 0.2;
        ctx.fillRect(p.x - p.s / 2, p.y - p.s / 2, p.s * (1 + disp * 0.3), p.s * (1 + disp * 0.3));
      }
      ctx.globalAlpha = 1;
    };

    void build().then(() => { if (alive) raf = requestAnimationFrame(frame); });

    const rect = () => cv.getBoundingClientRect();
    // Coordenadas del puntero dentro del canvas (que tiene margen PAD alrededor del texto).
    const onMove = (e: PointerEvent) => { const r = rect(); ptr.x = e.clientX - r.left; ptr.y = e.clientY - r.top; ptr.on = true; };
    const onLeave = () => { ptr.on = false; };
    // El puntero también responde un poco fuera del recuadro (el cursor "se acerca").
    const onWinMove = (e: PointerEvent) => {
      const r = rect();
      const inside = e.clientX > r.left + PAD - 70 && e.clientX < r.right - PAD + 70 && e.clientY > r.top + PAD - 70 && e.clientY < r.bottom - PAD + 70;
      if (inside) onMove(e); else ptr.on = false;
    };
    window.addEventListener('pointermove', onWinMove, { passive: true });
    window.addEventListener('pointerdown', onWinMove, { passive: true });
    window.addEventListener('pointerup', onLeave, { passive: true });
    window.addEventListener('pointercancel', onLeave, { passive: true });
    document.addEventListener('pointerleave', onLeave);
    // Brisa suave al inclinar el teléfono (donde el navegador la entrega sin permiso).
    const onTilt = (e: DeviceOrientationEvent) => {
      if (e.gamma == null || e.beta == null) return;
      wind.x = Math.max(-1, Math.min(1, e.gamma / 45)) * 0.35;
      wind.y = Math.max(-1, Math.min(1, (e.beta - 45) / 45)) * 0.2;
    };
    window.addEventListener('deviceorientation', onTilt);

    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; }, { threshold: 0 });
    io.observe(box);
    let rt = 0;
    const ro = new ResizeObserver(() => { window.clearTimeout(rt); rt = window.setTimeout(() => { void build(); }, 200); });
    ro.observe(box);

    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      window.removeEventListener('pointermove', onWinMove);
      window.removeEventListener('pointerdown', onWinMove);
      window.removeEventListener('pointerup', onLeave);
      window.removeEventListener('pointercancel', onLeave);
      document.removeEventListener('pointerleave', onLeave);
      window.removeEventListener('deviceorientation', onTilt);
      io.disconnect(); ro.disconnect(); window.clearTimeout(rt);
    };
  }, [text, reduce, delayMs]);

  if (reduce) {
    return (
      <motion.h1
        className="playmore-sans playmore-gold text-[15vw] font-extrabold leading-[0.85] sm:text-[12vw] lg:text-[10.5rem]"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3, duration: 0.8 }}
      >
        {text}
      </motion.h1>
    );
  }
  return (
    <div ref={boxRef} className="relative w-full max-w-5xl" style={{ minHeight: '5rem' }}>
      <h1 className="sr-only">{text}</h1>
      <canvas ref={cvRef} aria-hidden="true" className="pointer-events-none absolute touch-pan-y drop-shadow-[0_0_28px_rgba(247,231,168,0.28)]" style={{ left: -PAD, top: -PAD }} />
    </div>
  );
}
