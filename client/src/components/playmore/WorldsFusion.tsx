import { useEffect, useRef, useState } from 'react';
import { motion, useMotionValueEvent, useReducedMotion, useScroll } from 'framer-motion';
import type { CoproductionLanding } from '@shared/coproduction';
import { GOLD_STOPS, loadImage, loadTicketFonts } from './ticketArt';
import { DALMORE_LOGO, DALMORE_MARK, Eyebrow, PartnerMark, reveal } from './sections';

/* "Dos mundos, una noche": la fusión de Playroom y el socio, guiada por el scroll.
 *
 * La pantalla queda fija y al bajar:
 *   1. Los dos mundos, cada uno con su luz y su logo, a lados opuestos.
 *   2. Se lanzan el uno hacia el otro dejando estela, y las luces se juntan.
 *   3. Chocan: los logos se funden en un punto, destello y ondas de choque.
 *   4. De ese choque sale una nube de partículas que se reordena y forma el
 *      nombre de la noche (PLAYMORE) en foil dorado.
 * Todo en un solo canvas (más los textos encima). Sin movimiento reducido o sin
 * scroll fijo, se ve una versión estática con los dos mundos lado a lado. */

const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const smooth = (x: number) => { const t = clamp(x); return t * t * (3 - 2 * t); };
const easeOut = (x: number) => 1 - Math.pow(1 - clamp(x), 3);
const easeInOut = (x: number) => { const t = clamp(x); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };

/** Aleatorio determinista (las partículas no cambian entre cuadros). */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

interface Particle { a: number; r: number; tx: number; ty: number; size: number; hue: number; swirl: number; delay: number }

interface Scene {
  w: number; h: number; dpr: number; vertical: boolean;
  playroom: HTMLImageElement | null; partner: HTMLImageElement | null;
  particles: Particle[]; textY: number; textSize: number;
}

const TEXT_PCT = 0.46;

/** Puntos del texto (para que las partículas lo formen). */
function sampleText(text: string, w: number, h: number, size: number): { pts: [number, number][]; y: number } {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const x = c.getContext('2d', { willReadFrequently: true })!;
  x.font = `800 ${size}px "Montserrat Variable", "Montserrat", system-ui, sans-serif`;
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.fillText(text, w / 2, h * TEXT_PCT);
  const data = x.getImageData(0, 0, w, h).data;
  const step = w < 720 ? 4 : 3;
  const pts: [number, number][] = [];
  for (let py = 0; py < h; py += step) for (let px = 0; px < w; px += step) if (data[(py * w + px) * 4 + 3] > 140) pts.push([px, py]);
  return { pts, y: h * TEXT_PCT };
}

function buildScene(w: number, h: number, dpr: number, name: string, playroom: HTMLImageElement | null, partner: HTMLImageElement | null): Scene {
  const vertical = w < 720;
  // El texto más grande que entre en ancho.
  let size = Math.min(w * (vertical ? 0.2 : 0.14), 210);
  const m = document.createElement('canvas').getContext('2d')!;
  m.font = `800 ${size}px "Montserrat Variable", "Montserrat", system-ui, sans-serif`;
  while (m.measureText(name).width > w * 0.88 && size > 40) { size -= 4; m.font = `800 ${size}px "Montserrat Variable", "Montserrat", system-ui, sans-serif`; }
  const { pts, y } = sampleText(name, Math.round(w), Math.round(h), size);
  const r = rng(7);
  const cap = vertical ? 650 : 2600;
  const chosen = pts.length > cap ? pts.filter(() => r() < cap / pts.length) : pts;
  const particles: Particle[] = chosen.map(([tx, ty]) => ({
    a: r() * Math.PI * 2,
    r: (0.12 + Math.pow(r(), 0.55) * 0.95) * Math.max(w, h) * 0.5,
    tx, ty,
    size: 1.3 + r() * 2.2,
    hue: r(),
    swirl: (r() - 0.5) * 3.2,
    delay: r() * 0.25,
  }));
  return { w, h, dpr, vertical, playroom, partner, particles, textY: y, textSize: size };
}

function goldFoil(ctx: CanvasRenderingContext2D, x0: number, x1: number) {
  const g = ctx.createLinearGradient(x0, 0, x1, 0);
  for (const [o, c] of GOLD_STOPS) g.addColorStop(o, c);
  return g;
}

/** Dibuja un cuadro de la fusión según el avance del scroll (0 a 1). */
function drawScene(ctx: CanvasRenderingContext2D, sc: Scene, p: number, name: string) {
  const { w, h, vertical } = sc;
  ctx.setTransform(sc.dpr, 0, 0, sc.dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  const cx = w / 2, cy = h * (vertical ? 0.47 : 0.44);

  // Avances de cada fase.
  const approach = easeInOut((p - 0.1) / 0.36);   // 0.10 → 0.46: se lanzan
  const implode = easeInOut((p - 0.4) / 0.14);    // 0.40 → 0.54: se funden en un punto
  const blast = clamp((p - 0.54) / 0.1);          // 0.54 → 0.64: destello y ondas
  const flash = Math.sin(clamp((p - 0.5) / 0.14) * Math.PI);
  const form = easeInOut((p - 0.6) / 0.2);        // 0.60 → 0.80: las partículas forman el nombre
  const settled = smooth((p - 0.78) / 0.1);

  // Posición de cada mundo: de su lado al centro, con un arco y velocidad.
  const reach = vertical ? h * 0.2 : w * 0.27;
  const off = (1 - approach) * reach;
  const arc = Math.sin(approach * Math.PI) * (vertical ? w * 0.08 : h * 0.07);
  const L = vertical ? { x: cx + arc, y: cy - off } : { x: cx - off, y: cy - arc };
  const R = vertical ? { x: cx - arc, y: cy + off } : { x: cx + off, y: cy + arc };

  // Luz de cada mundo: sigue a su logo y se junta en el centro.
  const glowR = Math.max(w, h) * (0.38 + approach * 0.2);
  const fade = 1 - settled * 0.85;
  const glow = (x: number, y: number, c0: string, c1: string, a: number) => {
    const g = ctx.createRadialGradient(x, y, 0, x, y, glowR);
    g.addColorStop(0, c0.replace('A', String(a * fade)));
    g.addColorStop(0.5, c1.replace('A', String(a * 0.3 * fade)));
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  };
  const base = clamp(0.22 + approach * 0.2 + flash * 0.25, 0, 0.6);
  glow(L.x, L.y, 'rgba(244,70,150,A)', 'rgba(90,40,170,A)', base);
  glow(R.x, R.y, 'rgba(150,21,157,A)', 'rgba(190,140,50,A)', base);

  // Estelas: rastro de luz detrás de cada logo mientras se lanzan.
  const speed = Math.sin(clamp((p - 0.1) / 0.36) * Math.PI);
  if (speed > 0.02 && p < 0.5) {
    const trail = (a: { x: number; y: number }, sx: number, sy: number, c: string) => {
      const len = (vertical ? h : w) * 0.28 * speed;
      const g = ctx.createLinearGradient(a.x, a.y, a.x + sx * len, a.y + sy * len);
      g.addColorStop(0, c.replace('A', String(0.55 * speed)));
      g.addColorStop(1, c.replace('A', '0'));
      ctx.strokeStyle = g; ctx.lineWidth = 3 + speed * 6; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(a.x + sx * len, a.y + sy * len); ctx.stroke();
    };
    if (vertical) { trail(L, 0, -1, 'rgba(244,114,182,A)'); trail(R, 0, 1, 'rgba(214,178,94,A)'); }
    else { trail(L, -1, 0, 'rgba(244,114,182,A)'); trail(R, 1, 0, 'rgba(214,178,94,A)'); }
  }

  // Los dos logos: se acercan, crecen un poco y se funden (implosión).
  if (implode < 1) {
    const baseW = vertical ? Math.min(w * 0.62, 300) : Math.min(w * 0.3, 380);
    const scale = (1 + approach * 0.22) * (1 - implode * 0.92);
    const alpha = 1 - Math.pow(implode, 1.6);
    // Colores originales intactos: se dibujan tal cual (sin mezcla aditiva) y solo
    // al fundirse (implode) se les suma el resplandor blanco-dorado.
    const logo = (img: HTMLImageElement | null, pos: { x: number; y: number }, tint: string) => {
      if (!img) return;
      const lw = baseW * scale, lh = (lw * img.naturalHeight) / img.naturalWidth;
      ctx.save();
      ctx.globalAlpha = alpha;
      const melt = clamp(implode * 1.4);
      ctx.shadowColor = melt > 0.02 ? `rgba(255,244,214,${melt * 0.95})` : tint;
      ctx.shadowBlur = melt > 0.02 ? 10 + melt * 90 : 10;
      // Al implosionar, cada logo se pega al centro.
      const x = pos.x + (cx - pos.x) * implode, y = pos.y + (cy - pos.y) * implode;
      ctx.drawImage(img, x - lw / 2, y - lh / 2, lw, lh);
      ctx.restore();
    };
    logo(sc.playroom, L, 'rgba(244,114,182,0.35)');
    logo(sc.partner, R, 'rgba(214,178,94,0.35)');
  }

  // Punto de fusión: crece, se vuelve blanco-dorado y estalla.
  if (p > 0.38 && p < 0.7) {
    const r0 = 10 + implode * 60 + flash * Math.max(w, h) * 0.3;
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r0);
    g.addColorStop(0, `rgba(255,248,230,${clamp(implode * 0.85 + flash * 0.5)})`);
    g.addColorStop(0.3, `rgba(247,231,168,${clamp(0.5 * (implode + flash * 0.6))})`);
    g.addColorStop(0.65, `rgba(228,119,234,${clamp(0.28 * (implode + flash * 0.6))})`);
    g.addColorStop(1, 'rgba(228,119,234,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  }

  // Ondas de choque.
  if (blast > 0 && blast < 1) {
    const maxR = Math.max(w, h) * 0.75;
    [[0, '247,231,168'], [0.12, '228,119,234'], [0.24, '125,211,252']].forEach(([lag, col]) => {
      const t = clamp((blast - (lag as number)) / (1 - (lag as number)));
      if (t <= 0) return;
      ctx.strokeStyle = `rgba(${col},${(1 - t) * 0.8})`;
      ctx.lineWidth = 1 + (1 - t) * 7;
      ctx.beginPath(); ctx.arc(cx, cy, easeOut(t) * maxR, 0, Math.PI * 2); ctx.stroke();
    });
  }

  // Partículas: estallan desde el centro y se reordenan formando el nombre.
  if (p > 0.53) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const burst = easeOut((p - 0.53) / 0.12);
    const ambient = 1 - settled * 0.8;
    for (const q of sc.particles) {
      const form_i = easeInOut(clamp((form - q.delay) / (1 - q.delay)));
      // Estallido: radial con giro; después converge al punto del texto.
      const ang = q.a + (1 - form_i) * q.swirl;
      const bx = cx + Math.cos(ang) * q.r * burst;
      const by = cy + Math.sin(ang) * q.r * burst;
      const x = bx + (q.tx - bx) * form_i;
      const y = by + (q.ty - by) * form_i;
      const a = clamp((p - 0.53) / 0.04) * (0.35 + form_i * 0.65) * ambient;
      ctx.globalAlpha = a;
      ctx.fillStyle = q.hue < 0.12 ? '#E477EA' : q.hue < 0.2 ? '#7dd3fc' : q.hue < 0.6 ? '#f7e7a8' : '#d6b25e';
      ctx.beginPath();
      ctx.arc(x, y, q.size * (1.2 - form_i * 0.35), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // El nombre, nítido en foil dorado, cuando las partículas ya lo formaron.
  if (settled > 0) {
    ctx.save();
    ctx.globalAlpha = settled;
    ctx.font = `800 ${sc.textSize}px "Montserrat Variable", "Montserrat", system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = goldFoil(ctx, cx - sc.textSize * 2.2, cx + sc.textSize * 2.2);
    ctx.shadowColor = 'rgba(247,231,168,0.35)';
    ctx.shadowBlur = 28;
    ctx.fillText(name, cx, sc.textY);
    ctx.restore();
  }
}

/** Versión sin scroll fijo / con "reducir movimiento": los dos mundos lado a lado. */
function StaticWorlds({ landing, partnerName }: { landing: CoproductionLanding; partnerName: string }) {
  return (
    <section className="relative mx-auto max-w-6xl px-5 py-24 sm:py-32">
      <motion.div {...reveal} className="mb-14 text-center">
        <Eyebrow>Dos mundos, una noche</Eyebrow>
        <h2 className="playmore-sans text-2xl font-extrabold leading-tight tracking-[0.08em] sm:text-4xl">Cuando el juego se encuentra<br className="hidden sm:block" /> con el código</h2>
      </motion.div>
      <div className="grid gap-5 md:grid-cols-2">
        <article className="rounded-[2rem] border border-white/10 bg-[radial-gradient(120%_90%_at_0%_0%,rgba(244,114,182,0.25),transparent_60%),#120d10] p-8 sm:p-10">
          <img src="/playmore/playroom-logo.png" alt="Mansion Playroom" className="mb-6 h-20 w-auto max-w-[13rem] object-contain" />
          <h3 className="playmore-sans text-3xl font-extrabold">El juego</h3>
          <p className="mt-4 leading-relaxed text-[var(--pm-cream)]/80">{landing.playroomBlurb}</p>
        </article>
        <article className="rounded-[2rem] border border-white/10 bg-[radial-gradient(120%_90%_at_100%_0%,rgba(150,21,157,0.4),transparent_60%),#120c12] p-8 text-right sm:p-10">
          <div className="mb-6 flex justify-end">
            <PartnerMark logoUrl={landing.partnerLogoUrl === DALMORE_MARK ? DALMORE_LOGO : landing.partnerLogoUrl} name={partnerName} className="h-16 w-16 text-[4.2rem]" imgClassName="h-20 w-auto max-w-[11rem]" />
          </div>
          <h3 className="playmore-sans text-3xl font-extrabold">El código</h3>
          <p className="mt-4 leading-relaxed text-[var(--pm-cream)]/80">{landing.partnerBlurb}</p>
        </article>
      </div>
    </section>
  );
}

export function TwoWorlds({ landing, partnerName }: { landing: CoproductionLanding; partnerName: string }) {
  const reduce = useReducedMotion();
  const stickyOk = typeof CSS !== 'undefined' && !!CSS.supports?.('overflow-x', 'clip');
  if (reduce || !stickyOk) return <StaticWorlds landing={landing} partnerName={partnerName} />;
  return <FusionStage landing={landing} partnerName={partnerName} />;
}

function FusionStage({ landing, partnerName }: { landing: CoproductionLanding; partnerName: string }) {
  const sectionRef = useRef<HTMLElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<Scene | null>(null);
  const progress = useRef(0);
  const raf = useRef(0);
  const [p, setP] = useState(0);
  const name = landing.eventName || 'PLAYMORE';
  const partnerLogo = landing.partnerLogoUrl === DALMORE_MARK ? DALMORE_LOGO : landing.partnerLogoUrl;

  const { scrollYProgress } = useScroll({ target: sectionRef, offset: ['start start', 'end end'] });

  const paint = () => {
    raf.current = 0;
    const cv = canvasRef.current, sc = sceneRef.current;
    if (!cv || !sc) return;
    drawScene(cv.getContext('2d')!, sc, progress.current, name);
  };
  const schedule = () => { if (!raf.current) raf.current = requestAnimationFrame(paint); };

  useMotionValueEvent(scrollYProgress, 'change', (v) => {
    progress.current = v;
    schedule();
    // Los textos de DOM solo necesitan el avance por tramos.
    setP((prev) => (Math.abs(prev - v) > 0.004 ? v : prev));
  });

  // Prepara el canvas y las partículas (y rehace todo al cambiar de tamaño).
  useEffect(() => {
    const stage = stageRef.current, cv = canvasRef.current;
    if (!stage || !cv) return;
    let alive = true;
    const imgs = Promise.all([loadImage('/playmore/playroom-logo.png'), loadImage(partnerLogo), loadTicketFonts()]);
    const build = async () => {
      const [pr, pa] = await imgs;
      if (!alive) return;
      const w = stage.clientWidth, h = stage.clientHeight;
      if (!w || !h) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
      cv.style.width = `${w}px`; cv.style.height = `${h}px`;
      sceneRef.current = buildScene(w, h, dpr, name, pr, pa);
      progress.current = scrollYProgress.get();
      schedule();
    };
    void build();
    let t = 0;
    const ro = new ResizeObserver(() => { window.clearTimeout(t); t = window.setTimeout(() => void build(), 150); });
    ro.observe(stage);
    return () => { alive = false; ro.disconnect(); window.clearTimeout(t); if (raf.current) cancelAnimationFrame(raf.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, partnerLogo]);

  // Textos: el título y las dos presentaciones al principio; la firma al final.
  const intro = 1 - smooth((p - 0.12) / 0.1);
  const outro = smooth((p - 0.86) / 0.07);
  return (
    <section ref={sectionRef} className="relative" style={{ height: '260vh' }} aria-label="Dos mundos, una noche">
      <div ref={stageRef} className="sticky top-0 h-dvh w-full overflow-hidden">
        <canvas ref={canvasRef} className="absolute inset-0" aria-hidden="true" />

        <div className="pointer-events-none absolute inset-x-0 top-[5%] px-5 text-center sm:top-[9%]" style={{ opacity: intro }}>
          <Eyebrow>Dos mundos, una noche</Eyebrow>
          <h2 className="playmore-sans text-lg font-extrabold leading-tight tracking-[0.08em] sm:text-3xl">Cuando el juego se encuentra<br className="hidden sm:block" /> con el código</h2>
        </div>

        {/* Presentación de cada mundo (se va al empezar a moverse). */}
        <div className="pointer-events-none absolute inset-x-0 bottom-[8%] grid grid-cols-2 gap-4 px-5 sm:bottom-[12%] sm:gap-16 sm:px-[8%]" style={{ opacity: intro }}>
          <div className="text-left">
            <p className="text-[11px] font-semibold tracking-[0.4em] text-[var(--pm-fuchsia)]">PLAYROOM</p>
            <p className="playmore-sans mt-1 text-xl font-extrabold sm:text-3xl">El juego</p>
            <p className="mt-2 hidden max-w-sm text-sm leading-relaxed text-[var(--pm-cream)]/75 sm:block">{landing.playroomBlurb}</p>
          </div>
          <div className="text-right">
            <p className="text-[11px] font-semibold tracking-[0.4em] text-[var(--pm-orchid)]">{partnerName.toUpperCase()}</p>
            <p className="playmore-sans mt-1 text-xl font-extrabold sm:text-3xl">El código</p>
            <p className="mt-2 ml-auto hidden max-w-sm text-sm leading-relaxed text-[var(--pm-cream)]/75 sm:block">{landing.partnerBlurb}</p>
          </div>
        </div>
        <p className="pointer-events-none absolute inset-x-0 bottom-3 text-center text-[10px] tracking-[0.4em] text-[var(--pm-sand)]/50" style={{ opacity: intro }}>BAJA PARA UNIRLOS ↓</p>

        {/* Firma final, bajo el nombre formado. */}
        <div className="absolute inset-x-0 top-[58%] px-5 text-center" style={{ opacity: outro, pointerEvents: outro > 0.5 ? 'auto' : 'none' }}>
          <p className="text-[11px] font-semibold tracking-[0.45em] text-[var(--pm-sand)]/80">PLAYROOM × {partnerName.toUpperCase()}</p>
          <p className="playmore-sans mx-auto mt-3 max-w-md text-base font-semibold tracking-[0.2em] text-[var(--pm-cream)]/90 sm:text-xl">Dos comunidades. Una sola noche.</p>
          <a href="#accesos" className="mt-7 inline-flex h-12 items-center rounded-full border border-[#d6b25e]/50 px-8 text-xs font-semibold tracking-[0.25em] text-[var(--pm-sand)] transition hover:bg-white/5">
            ELEGIR MI TICKET ↓
          </a>
        </div>
      </div>
    </section>
  );
}
