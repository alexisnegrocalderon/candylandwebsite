/* Arte del ticket PLAYMORE dibujado en canvas 2D. Se usa como textura del
 * ticket 3D (TicketIntro) y, tal cual, en la versión liviana sin WebGL.
 *
 * El ticket tiene dos piezas -- el cuerpo y el talón -- porque el talón se
 * arranca por separado. Cada una se dibuja en su propio canvas con fondo
 * transparente fuera de la silueta (bordes dentados y medias lunas de la
 * perforación), así el 3D recorta la forma con el alfa. */

export const TICKET = {
  /** Proporción del ticket completo (ancho / alto). */
  bodyW: 1500,
  stubW: 420,
  h: 640,
  /** Radio de las medias lunas de la perforación. */
  notchR: 30,
};

export const GOLD_STOPS: [number, string][] = [
  [0, '#7a5a22'],
  [0.22, '#c9a24c'],
  [0.45, '#f7e7a8'],
  [0.6, '#d6b25e'],
  [0.82, '#9c7630'],
  [1, '#e9cf85'],
];
const MAGENTA = '#96159D';
const ORCHID = '#E477EA';

export interface TicketArtData {
  eventName: string;
  partnerName: string;
  dateText: string;
  timeText: string;
  venueText: string;
  daysLeft: number | null;
}

export const FONT_SANS = '"Montserrat Variable", "Montserrat", system-ui, sans-serif';
export const FONT_SERIF = '"Cormorant Garamond Variable", "Cormorant Garamond", Georgia, serif';

/** Espera a que las fuentes del ticket estén listas: si se dibuja antes, el
 * canvas queda con la fuente de reemplazo para siempre. */
export async function loadTicketFonts(): Promise<void> {
  if (typeof document === 'undefined' || !document.fonts) return;
  await Promise.all([
    document.fonts.load(`800 120px ${FONT_SANS}`),
    document.fonts.load(`600 40px ${FONT_SANS}`),
    document.fonts.load(`italic 500 60px ${FONT_SERIF}`),
  ]).catch(() => undefined);
}

function goldGradient(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number) {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  for (const [o, c] of GOLD_STOPS) g.addColorStop(o, c);
  return g;
}

/** Textura de terciopelo/papel negro: ruido fino + viñeta magenta muy tenue. */
function paintVelvet(ctx: CanvasRenderingContext2D, w: number, h: number, glowX: number) {
  const base = ctx.createLinearGradient(0, 0, 0, h);
  base.addColorStop(0, '#16110f');
  base.addColorStop(1, '#0c0908');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, w, h);
  const glow = ctx.createRadialGradient(glowX, h * 0.45, 10, glowX, h * 0.45, w * 0.55);
  glow.addColorStop(0, 'rgba(150, 21, 157, 0.20)');
  glow.addColorStop(1, 'rgba(150, 21, 157, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, w, h);
  // Grano: puntos semitransparentes (determinista, sin Math.random para que
  // el cuerpo y el talón tengan la misma textura en cada carga).
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < (w * h) / 90; i++) {
    const v = rnd();
    ctx.fillStyle = v > 0.5 ? `rgba(255,255,255,${(v - 0.5) * 0.06})` : `rgba(0,0,0,${v * 0.25})`;
    ctx.fillRect(rnd() * w, rnd() * h, 1.6, 1.6);
  }
}

/** Silueta del cuerpo: borde izquierdo dentado y medias lunas a la derecha. */
function bodyPath(ctx: CanvasRenderingContext2D, w: number, h: number, r: number) {
  const tooth = 14;
  ctx.beginPath();
  ctx.moveTo(tooth, 0);
  ctx.lineTo(w - r, 0);
  ctx.arc(w, 0, r, Math.PI, Math.PI / 2, true);
  ctx.lineTo(w, h - r);
  ctx.arc(w, h, r, -Math.PI / 2, Math.PI, true);
  ctx.lineTo(tooth, h);
  for (let y = h; y > 0; y -= tooth * 2) {
    ctx.lineTo(0, y - tooth);
    ctx.lineTo(tooth, Math.max(0, y - tooth * 2));
  }
  ctx.closePath();
}

/** Silueta del talón: medias lunas a la izquierda y borde derecho dentado. */
function stubPath(ctx: CanvasRenderingContext2D, w: number, h: number, r: number) {
  const tooth = 14;
  ctx.beginPath();
  ctx.moveTo(r, 0);
  ctx.lineTo(w - tooth, 0);
  for (let y = 0; y < h; y += tooth * 2) {
    ctx.lineTo(w, y + tooth);
    ctx.lineTo(w - tooth, Math.min(h, y + tooth * 2));
  }
  ctx.lineTo(r, h);
  ctx.arc(0, h, r, 0, -Math.PI / 2, true);
  ctx.lineTo(0, r);
  ctx.arc(0, 0, r, Math.PI / 2, 0, true);
  ctx.closePath();
}

function spaced(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, spacing: number, align: 'left' | 'right' = 'left') {
  const chars = Array.from(text);
  const total = chars.reduce((s, c) => s + ctx.measureText(c).width + spacing, -spacing);
  let cx = align === 'right' ? x - total : x;
  for (const c of chars) {
    ctx.fillText(c, cx, y);
    cx += ctx.measureText(c).width + spacing;
  }
}

/** Recuadro donde va la animación de logos (coordenadas del cuerpo). */
export const LOGO_BOX = { x: 70, y: 70, size: 500 };

export function drawTicketBody(canvas: HTMLCanvasElement, data: TicketArtData) {
  const { bodyW: w, h, notchR: r } = TICKET;
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, w, h);
  ctx.save();
  bodyPath(ctx, w, h, r);
  ctx.clip();
  paintVelvet(ctx, w, h, LOGO_BOX.x + LOGO_BOX.size / 2);

  // Marco interior dorado fino.
  ctx.strokeStyle = goldGradient(ctx, 0, 0, w, h);
  ctx.lineWidth = 2;
  ctx.strokeRect(38, 30, w - 38 - 50, h - 60);

  // Recuadro de los logos.
  const b = LOGO_BOX;
  ctx.lineWidth = 2;
  ctx.strokeRect(b.x, b.y, b.size, b.size);
  ctx.lineWidth = 1;
  ctx.strokeRect(b.x + 10, b.y + 10, b.size - 20, b.size - 20);

  const tx = b.x + b.size + 70;
  const right = w - 90;

  // Encabezado.
  ctx.fillStyle = goldGradient(ctx, tx, 0, right, 0);
  ctx.font = `600 26px ${FONT_SANS}`;
  ctx.textBaseline = 'alphabetic';
  spaced(ctx, `PLAYROOM  ×  ${data.partnerName.toUpperCase()}`, tx, 118, 7);
  ctx.font = `500 26px ${FONT_SANS}`;
  spaced(ctx, 'No 000800', right, 118, 3, 'right');

  // Título en foil dorado.
  let size = 168;
  ctx.font = `800 ${size}px ${FONT_SANS}`;
  while (ctx.measureText(data.eventName).width > right - tx && size > 60) {
    size -= 4;
    ctx.font = `800 ${size}px ${FONT_SANS}`;
  }
  ctx.fillStyle = goldGradient(ctx, tx, 150, right, 330);
  ctx.shadowColor = 'rgba(247, 231, 168, 0.25)';
  ctx.shadowBlur = 18;
  ctx.fillText(data.eventName, tx - 4, 150 + size * 0.82);
  ctx.shadowBlur = 0;

  // Bajada en serif itálica.
  ctx.font = `italic 500 44px ${FONT_SERIF}`;
  ctx.fillStyle = '#e9d9b0';
  ctx.fillText(`Una noche. Dos mundos. ${data.venueText.split(',')[0]}.`, tx, 150 + size + 34);

  // Fila inferior: fecha, hora, admit two.
  const rowY = h - 150;
  ctx.font = `600 20px ${FONT_SANS}`;
  ctx.fillStyle = 'rgba(233, 217, 176, 0.6)';
  spaced(ctx, 'FECHA', tx, rowY, 6);
  spaced(ctx, 'HORA', tx + 270, rowY, 6);
  ctx.font = `600 38px ${FONT_SANS}`;
  ctx.fillStyle = '#f4efe6';
  ctx.fillText(data.dateText, tx, rowY + 52);
  ctx.fillText(data.timeText, tx + 270, rowY + 52);

  ctx.font = `800 54px ${FONT_SANS}`;
  ctx.fillStyle = goldGradient(ctx, right - 360, 0, right, 0);
  spaced(ctx, 'ADMIT TWO', right, rowY + 52, 2, 'right');

  if (data.daysLeft != null && data.daysLeft >= 0) {
    ctx.font = `700 22px ${FONT_SANS}`;
    ctx.fillStyle = ORCHID;
    const label = data.daysLeft === 0 ? '¡ES HOY!' : `FALTAN ${data.daysLeft} DÍA${data.daysLeft === 1 ? '' : 'S'}`;
    spaced(ctx, label, right, rowY + 96, 5, 'right');
  }
  ctx.restore();
}

export function drawTicketStub(canvas: HTMLCanvasElement, data: TicketArtData) {
  const { stubW: w, h, notchR: r } = TICKET;
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, w, h);
  ctx.save();
  stubPath(ctx, w, h, r);
  ctx.clip();
  paintVelvet(ctx, w, h, 0);

  // Perforación magenta.
  ctx.fillStyle = MAGENTA;
  for (let y = r + 34; y < h - r - 20; y += 46) {
    ctx.beginPath();
    ctx.arc(4, y, 9, 0, Math.PI * 2);
    ctx.fill();
  }

  // Texto vertical.
  ctx.save();
  ctx.translate(120, h - 70);
  ctx.rotate(-Math.PI / 2);
  ctx.font = `800 62px ${FONT_SANS}`;
  ctx.fillStyle = goldGradient(ctx, 0, 0, h - 140, 0);
  ctx.fillText(data.eventName, 0, 0);
  ctx.font = `600 20px ${FONT_SANS}`;
  ctx.fillStyle = 'rgba(233, 217, 176, 0.7)';
  spaced(ctx, 'NO ES PARA TODOS', 0, 52, 6);
  ctx.restore();

  // Código de barras dorado.
  const bx = w - 150;
  let x = bx;
  let seed = 3;
  const rnd = () => ((seed = (seed * 48271) % 2147483647) / 2147483647);
  ctx.fillStyle = goldGradient(ctx, 0, 70, 0, h - 70);
  while (x < w - 60) {
    const bw = 2 + Math.floor(rnd() * 4);
    ctx.fillRect(x, 70, bw, h - 140);
    x += bw + 2 + Math.floor(rnd() * 4);
  }
  ctx.restore();
}

/** Dorso del ticket: monograma P×D repetido en oro tenue. */
export function drawTicketBack(canvas: HTMLCanvasElement, width: number) {
  const { h } = TICKET;
  canvas.width = width;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  paintVelvet(ctx, width, h, width / 2);
  ctx.font = `italic 600 54px ${FONT_SERIF}`;
  ctx.fillStyle = 'rgba(214, 178, 94, 0.18)';
  for (let y = 60; y < h + 60; y += 110) {
    for (let x = (y / 110) % 2 ? 0 : 90; x < width + 100; x += 180) ctx.fillText('P × D', x, y);
  }
}

/** Fusión de logos dentro del recuadro (canvas cuadrado aparte, se redibuja
 * en cada cuadro). `t` va de 0 a 1 en loop. */
export function drawLogoFusion(
  canvas: HTMLCanvasElement,
  t: number,
  playroomLogo: HTMLImageElement | null,
  partnerLogo: HTMLImageElement | null,
  partnerName: string,
) {
  const s = canvas.width;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, s, s);
  const c = s / 2;
  // 0-0.35 se acercan, 0.35-0.55 se funden con destello, 0.55-0.85 quedan
  // unidos respirando, 0.85-1 se separan.
  const ease = (x: number) => 1 - Math.pow(1 - Math.min(Math.max(x, 0), 1), 3);
  let k: number;
  if (t < 0.35) k = ease(t / 0.35);
  else if (t < 0.85) k = 1;
  else k = 1 - ease((t - 0.85) / 0.15);
  const offset = (1 - k) * s * 0.27;
  const flash = t > 0.32 && t < 0.62 ? Math.sin(((t - 0.32) / 0.3) * Math.PI) : 0;
  const size = s * 0.5;

  // Halo detrás.
  const halo = ctx.createRadialGradient(c, c, 4, c, c, s * 0.5);
  halo.addColorStop(0, `rgba(228, 119, 234, ${0.18 + flash * 0.45})`);
  halo.addColorStop(0.5, `rgba(150, 21, 157, ${0.1 + flash * 0.2})`);
  halo.addColorStop(1, 'rgba(150, 21, 157, 0)');
  ctx.fillStyle = halo;
  ctx.fillRect(0, 0, s, s);

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  if (playroomLogo) {
    ctx.globalAlpha = 0.95;
    ctx.drawImage(playroomLogo, c - size / 2 - offset, c - size / 2, size, size);
  }
  ctx.globalAlpha = 0.95;
  if (partnerLogo) {
    ctx.drawImage(partnerLogo, c - size / 2 + offset, c - size / 2, size, size);
  } else {
    // Monograma provisorio hasta tener el logo de la otra productora.
    const g = ctx.createLinearGradient(c - size / 2, 0, c + size / 2, 0);
    for (const [o, col] of GOLD_STOPS) g.addColorStop(o, col);
    ctx.fillStyle = g;
    ctx.font = `italic 600 ${Math.round(size * 1.05)}px ${FONT_SERIF}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(partnerName.trim()[0]?.toUpperCase() ?? 'D', c + offset, c + size * 0.04);
  }
  ctx.restore();

  // Nombre de la otra productora bajo los logos, espaciado como su marca.
  ctx.font = `600 ${Math.round(s * 0.05)}px ${FONT_SANS}`;
  ctx.fillStyle = `rgba(233, 217, 176, ${0.55 + flash * 0.4})`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  const label = `PLAYROOM × ${partnerName.toUpperCase()}`;
  ctx.fillText(label.split('').join(' '), c, s * 0.9);

  // Destello central.
  if (flash > 0) {
    const f = ctx.createRadialGradient(c, c, 0, c, c, s * 0.3);
    f.addColorStop(0, `rgba(255, 245, 220, ${flash * 0.9})`);
    f.addColorStop(1, 'rgba(255, 245, 220, 0)');
    ctx.fillStyle = f;
    ctx.fillRect(0, 0, s, s);
  }
}

export function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    if (!src) return resolve(null);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}
