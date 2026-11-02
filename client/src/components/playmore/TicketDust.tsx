import { useEffect, useRef } from 'react';
import {
  TICKET, drawTicketBody, drawTicketStub, loadTicketFonts, type TicketArtData,
} from './ticketArt';

/* "Del polvo nace el ticket": al abrir la intro, miles de partículas doradas
 * giran desde la oscuridad y se juntan dibujando el ticket (marco, nombre,
 * logos, código de barras: con sus colores reales). Cuando el ticket queda
 * dibujado, el 3D toma el relevo y el polvo se apaga. Va encima del 3D
 * (TicketIntro) y no recibe toques. */

export const DUST_GATHER_MS = 2000;
const DUST_FADE_MS = 650;

const smooth = (x: number) => { const t = Math.min(1, Math.max(0, x)); return t * t * (3 - 2 * t); };
const easeOut = (x: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3);

function rng(seed: number) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

interface Dust { tx: number; ty: number; a: number; r: number; swirl: number; delay: number; size: number; color: string }

/** Rectángulo donde descansará el ticket 3D (misma cuenta que la cámara). */
function ticketRect(w: number, h: number) {
  const total = (TICKET.bodyW + TICKET.stubW) / TICKET.h;
  const portrait = w / h < 0.85;
  const fillW = portrait ? 0.92 : 0.8;
  const fillH = h < 520 ? 0.42 : 0.5;
  const tw = Math.min(h * fillH * total, w * fillW);
  const th = tw / total;
  return { x: (w - tw) / 2, y: (h - th) / 2, w: tw, h: th };
}

async function buildDust(art: TicketArtData, w: number, h: number): Promise<Dust[]> {
  await loadTicketFonts();
  const body = document.createElement('canvas');
  const stub = document.createElement('canvas');
  drawTicketBody(body, art);
  drawTicketStub(stub, art);
  const full = document.createElement('canvas');
  const sw = TICKET.bodyW + TICKET.stubW;
  const scale = 0.4;
  full.width = Math.round(sw * scale); full.height = Math.round(TICKET.h * scale);
  const fx = full.getContext('2d', { willReadFrequently: true })!;
  fx.drawImage(body, 0, 0, TICKET.bodyW * scale, TICKET.h * scale);
  fx.drawImage(stub, TICKET.bodyW * scale, 0, TICKET.stubW * scale, TICKET.h * scale);
  const data = fx.getImageData(0, 0, full.width, full.height).data;
  const rect = ticketRect(w, h);
  const r = rng(11);
  const bright: Dust[] = [];
  const cap = w < 520 ? 1800 : 3600;
  for (let y = 0; y < full.height; y += 1) {
    for (let x = 0; x < full.width; x += 1) {
      const i = (y * full.width + x) * 4;
      const lum = data[i] * 0.3 + data[i + 1] * 0.55 + data[i + 2] * 0.15;
      if (data[i + 3] < 120 || lum < 70) continue;
      bright.push({
        tx: rect.x + (x / full.width) * rect.w,
        ty: rect.y + (y / full.height) * rect.h,
        a: 0, r: 0, swirl: 0, delay: 0, size: 0,
        color: `rgb(${data[i]},${data[i + 1]},${data[i + 2]})`,
      });
    }
  }
  const keep = bright.length > cap ? bright.filter(() => r() < cap / bright.length) : bright;
  const far = Math.max(w, h) * 0.75;
  return keep.map((p) => ({
    ...p,
    a: r() * Math.PI * 2,
    r: (0.35 + r() * 0.65) * far,
    swirl: (r() < 0.5 ? -1 : 1) * (1.6 + r() * 2.2),
    delay: r() * 0.4,
    size: 1.1 + r() * 1.7,
  }));
}

export function TicketDust({ art }: { art: TicketArtData }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    let alive = true;
    let raf = 0;
    const w = window.innerWidth, h = window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    cv.style.width = `${w}px`; cv.style.height = `${h}px`;
    const ctx = cv.getContext('2d')!;
    (async () => {
      const dust = await buildDust(art, w, h);
      if (!alive) return;
      const t0 = performance.now();
      const cx = w / 2, cy = h / 2;
      const frame = (now: number) => {
        const ms = now - t0;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, w, h);
        const gather = Math.min(1, ms / DUST_GATHER_MS);
        const fade = 1 - smooth((ms - DUST_GATHER_MS) / DUST_FADE_MS);
        if (fade <= 0) { cv.style.display = 'none'; return; }
        // Un resplandor magenta en el centro que se enciende mientras se juntan.
        const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(w, h) * 0.45);
        glow.addColorStop(0, `rgba(150,21,157,${0.22 * smooth(gather) * fade})`);
        glow.addColorStop(1, 'rgba(150,21,157,0)');
        ctx.fillStyle = glow; ctx.fillRect(0, 0, w, h);
        ctx.globalCompositeOperation = 'lighter';
        for (const d of dust) {
          const k = easeOut((gather - d.delay) / (1 - d.delay));
          // Espiral hacia su lugar en el ticket.
          const ang = d.a + (1 - k) * d.swirl;
          const rad = (1 - k) * d.r;
          const x = d.tx + Math.cos(ang) * rad;
          const y = d.ty + Math.sin(ang) * rad;
          ctx.globalAlpha = Math.min(1, k * 1.4 + 0.08) * fade * (0.55 + 0.45 * k);
          ctx.fillStyle = d.color;
          const s = d.size * (1.4 - k * 0.5);
          ctx.fillRect(x - s / 2, y - s / 2, s, s);
        }
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1;
        raf = requestAnimationFrame(frame);
      };
      raf = requestAnimationFrame(frame);
    })();
    return () => { alive = false; cancelAnimationFrame(raf); };
    // Una sola vez: los datos del ticket no cambian mientras se ve.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return <canvas ref={ref} className="pointer-events-none absolute inset-0 z-[5]" aria-hidden="true" />;
}
