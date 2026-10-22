/* La entrada como imagen (1080×1920, tamaño de pantalla de teléfono) para
 * guardarla en Fotos y mostrarla en la puerta o en caja sin internet. Se
 * dibuja en un canvas en el mismo teléfono: el QR ya viene como data URL
 * (mismo origen), así que el canvas no queda "manchado" y se puede exportar. */

const W = 1080;
const H = 1920;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('No se pudo cargar una imagen'));
    img.src = src;
  });
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Corta un texto en líneas que quepan en `max` px (máximo `lines`). */
function wrap(ctx: CanvasRenderingContext2D, text: string, max: number, lines: number): string[] {
  const out: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width <= max || !line) line = next;
    else { out.push(line); line = word; }
  }
  if (line) out.push(line);
  if (out.length > lines) { out.length = lines; out[lines - 1] = `${out[lines - 1].replace(/\s+\S*$/, '')}…`; }
  return out;
}

export interface TicketImageData {
  qrImageUrl: string;
  ticketCode: string;
  holderName: string;
  eventTitle: string;
  eventDateText: string;
  venue?: string | null;
}

export async function renderTicketImage(d: TicketImageData): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Tu navegador no permite crear la imagen');
  try { await Promise.all([document.fonts.load('800 80px Syne'), document.fonts.load('600 40px Syne')]); } catch { /* sin la fuente se usa la del sistema */ }
  const heading = '"Syne", system-ui, sans-serif';
  const body = 'system-ui, -apple-system, "Segoe UI", sans-serif';

  // Fondo: el mismo negro con luces del panel y de «Mi cuenta».
  ctx.fillStyle = '#0b0612';
  ctx.fillRect(0, 0, W, H);
  const glow = (x: number, y: number, r: number, color: string) => {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, color);
    g.addColorStop(1, 'rgba(11,6,18,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  };
  glow(920, 80, 900, 'rgba(201,60,190,0.45)');
  glow(-60, 900, 700, 'rgba(120,60,200,0.32)');
  glow(640, 2000, 950, 'rgba(70,90,230,0.42)');

  // Marca arriba.
  const [logo, qr] = await Promise.all([loadImage('/candyland/logo-isotipo-transparent.png').catch(() => null), loadImage(d.qrImageUrl)]);
  if (logo) {
    const lw = 150;
    const lh = (logo.height / logo.width) * lw;
    ctx.save();
    ctx.shadowColor = 'rgba(255,79,195,0.8)';
    ctx.shadowBlur = 40;
    ctx.drawImage(logo, (W - lw) / 2, 110, lw, lh);
    ctx.restore();
  }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.font = `800 64px ${heading}`;
  const word = ctx.createLinearGradient(W / 2 - 260, 0, W / 2 + 260, 0);
  word.addColorStop(0, '#ff7ad1');
  word.addColorStop(0.5, '#b49bff');
  word.addColorStop(1, '#7cc8ff');
  ctx.fillStyle = word;
  ctx.letterSpacing = '10px';
  ctx.fillText('PLAYROOM', W / 2 + 5, 380);
  ctx.letterSpacing = '0px';

  // Tarjeta de vidrio con borde degradado; su alto se calcula según cuántas líneas ocupa el nombre del evento.
  const cx = 70, cy = 450, cw = W - 140;
  ctx.font = `800 58px ${heading}`;
  const titleLines = wrap(ctx, d.eventTitle, cw - 120, 2);
  const qs = 680;
  const qrTop = cy + 180 + (titleLines.length - 1) * 68 + 62 + 50;
  const ch = qrTop + qs + 90 + 56 + 70 - cy;
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.6)';
  ctx.shadowBlur = 60;
  ctx.shadowOffsetY = 24;
  roundRect(ctx, cx, cy, cw, ch, 56);
  ctx.fillStyle = 'rgba(28,15,40,0.92)';
  ctx.fill();
  ctx.restore();
  const border = ctx.createLinearGradient(cx, cy, cx + cw, cy + ch);
  border.addColorStop(0, 'rgba(236,72,153,0.9)');
  border.addColorStop(0.5, 'rgba(192,132,252,0.5)');
  border.addColorStop(1, 'rgba(56,189,248,0.9)');
  roundRect(ctx, cx, cy, cw, ch, 56);
  ctx.lineWidth = 4;
  ctx.strokeStyle = border;
  ctx.stroke();

  // Evento.
  ctx.fillStyle = '#f9a8d4';
  ctx.font = `600 30px ${body}`;
  ctx.letterSpacing = '6px';
  ctx.fillText('TU ENTRADA', W / 2, cy + 100);
  ctx.letterSpacing = '0px';
  ctx.fillStyle = '#ffffff';
  ctx.font = `800 58px ${heading}`;
  titleLines.forEach((l, i) => ctx.fillText(l, W / 2, cy + 180 + i * 68));
  let y = cy + 180 + (titleLines.length - 1) * 68 + 62;
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.font = `500 34px ${body}`;
  ctx.fillText([d.eventDateText, d.venue].filter(Boolean).join(' · '), W / 2, y);

  // QR grande sobre papel crema (contraste máximo para el lector de la puerta).
  const qx = (W - qs) / 2;
  const qy = qrTop;
  ctx.save();
  ctx.shadowColor = 'rgba(236,72,153,0.35)';
  ctx.shadowBlur = 50;
  roundRect(ctx, qx, qy, qs, qs, 40);
  ctx.fillStyle = '#fbeee0';
  ctx.fill();
  ctx.restore();
  roundRect(ctx, qx + 30, qy + 30, qs - 60, qs - 60, 16);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(qr, qx + 50, qy + 50, qs - 100, qs - 100);
  ctx.imageSmoothingEnabled = true;

  // Titular y código.
  y = qy + qs + 90;
  ctx.fillStyle = '#ffffff';
  ctx.font = `700 50px ${heading}`;
  ctx.fillText(wrap(ctx, d.holderName, cw - 120, 1)[0] ?? '', W / 2, y);
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.font = `500 32px ui-monospace, "SF Mono", Menlo, monospace`;
  ctx.fillText(d.ticketCode, W / 2, y + 56);

  // Pie.
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.font = `500 34px ${body}`;
  ctx.fillText('Muestra este QR y tu carnet en la entrada.', W / 2, cy + ch + 70);
  ctx.fillText('Sube el brillo de la pantalla para escanear.', W / 2, cy + ch + 116);
  ctx.fillStyle = 'rgba(255,255,255,0.4)';
  ctx.font = `500 28px ${body}`;
  ctx.fillText('mansionplayroom.cl', W / 2, H - 32);

  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('No se pudo crear la imagen'))), 'image/png'));
}

/** Abre el menú de compartir del teléfono (en iPhone: «Guardar imagen» → Fotos);
 * donde no existe, descarga el PNG. Devuelve 'shared' | 'downloaded' | 'cancelled'. */
export async function saveTicketImage(d: TicketImageData): Promise<'shared' | 'downloaded' | 'cancelled'> {
  const blob = await renderTicketImage(d);
  const name = `entrada-playroom-${d.ticketCode}.png`;
  const file = new File([blob], name, { type: 'image/png' });
  if (typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'Mi entrada Playroom' });
      return 'shared';
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return 'cancelled';
      // Si el menú de compartir falla, se descarga.
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 4000);
  return 'downloaded';
}
