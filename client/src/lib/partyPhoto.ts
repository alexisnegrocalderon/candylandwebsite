import { PHOTO_HEIGHT_PX, PHOTO_MAX_BYTES, PHOTO_WIDTH_PX } from '@shared/party';
import { EVENT_BRAND } from '@shared/eventBrand';

/** Toma la foto elegida (cámara o galería), la recorta vertical 3:4 al centro (como la tarjeta del
 * swipe) y la comprime a JPEG en el propio celular. Devuelve base64 sin el prefijo `data:`. Baja
 * la calidad hasta que entre en el tope del servidor. */
export async function compressSelfie(file: File, options: { frame?: boolean } = {}): Promise<string> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const ratio = PHOTO_WIDTH_PX / PHOTO_HEIGHT_PX;
  // El recorte 3:4 más grande que cabe en la foto, centrado.
  const cropW = Math.min(bitmap.width, bitmap.height * ratio);
  const cropH = cropW / ratio;
  const canvas = document.createElement('canvas');
  canvas.width = PHOTO_WIDTH_PX;
  canvas.height = PHOTO_HEIGHT_PX;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Tu navegador no puede procesar la foto');
  ctx.drawImage(
    bitmap,
    (bitmap.width - cropW) / 2, (bitmap.height - cropH) / 2, cropW, cropH,
    0, 0, PHOTO_WIDTH_PX, PHOTO_HEIGHT_PX,
  );
  bitmap.close?.();
  // El marco queda pintado en la foto misma: el servidor no necesita saber nada.
  if (options.frame) drawHalloweenFrame(ctx, PHOTO_WIDTH_PX, PHOTO_HEIGHT_PX);

  for (const quality of [0.8, 0.7, 0.6, 0.5, 0.4]) {
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
    if (blob && blob.size <= PHOTO_MAX_BYTES) return blobToBase64(blob);
  }
  throw new Error('No se pudo reducir la foto, intenta con otra');
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.readAsDataURL(blob);
  });
}

/* ── Marco de Halloween ────────────────────────────────────────────────────
 * Borde neón (lima → violeta, la paleta oficial), telarañas en las esquinas de arriba, murciélagos
 * y el nombre del evento en vertical. Todo en vectores (sin emojis ni imágenes): se ve igual en
 * cualquier teléfono. Lo importante va por los costados y arriba: abajo la tarjeta del swipe pone
 * el nombre y el disfraz encima. */

const LIME = '#c4ff4d';
const VIOLET = '#ba8cff';
const NOIR = '#141414';

/** Un murciélago (la mitad derecha, y la izquierda espejada) centrado en (0,0), de ancho ~3s. */
function bat(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, angle: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  for (const side of [1, -1]) {
    ctx.save();
    ctx.scale(side, 1);
    ctx.beginPath();
    ctx.moveTo(0, -0.3 * s);
    ctx.lineTo(0.13 * s, -0.58 * s);
    ctx.lineTo(0.26 * s, -0.28 * s);
    ctx.bezierCurveTo(0.7 * s, -0.7 * s, 1.25 * s, -0.55 * s, 1.55 * s, -0.12 * s);
    ctx.quadraticCurveTo(1.3 * s, -0.05 * s, 1.2 * s, 0.3 * s);
    ctx.quadraticCurveTo(1.0 * s, 0.1 * s, 0.82 * s, 0.42 * s);
    ctx.quadraticCurveTo(0.6 * s, 0.14 * s, 0.4 * s, 0.5 * s);
    ctx.quadraticCurveTo(0.2 * s, 0.25 * s, 0, 0.55 * s);
    ctx.closePath();
    ctx.restore();
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

/** Telaraña en una esquina de arriba: `dir` 1 = izquierda, -1 = derecha. */
function cobweb(ctx: CanvasRenderingContext2D, w: number, dir: 1 | -1, size: number) {
  const cx = dir === 1 ? 0 : w;
  ctx.beginPath();
  const rays = 5;
  for (let i = 0; i <= rays; i++) {
    const a = (i / rays) * (Math.PI / 2);
    ctx.moveTo(cx, 0);
    ctx.lineTo(cx + dir * Math.cos(a) * size, Math.sin(a) * size);
  }
  for (const f of [0.35, 0.62, 0.88]) {
    for (let i = 0; i < rays; i++) {
      const a1 = (i / rays) * (Math.PI / 2), a2 = ((i + 1) / rays) * (Math.PI / 2);
      const r = size * f;
      const x1 = cx + dir * Math.cos(a1) * r, y1 = Math.sin(a1) * r;
      const x2 = cx + dir * Math.cos(a2) * r, y2 = Math.sin(a2) * r;
      const mx = cx + dir * Math.cos((a1 + a2) / 2) * r * 0.86, my = Math.sin((a1 + a2) / 2) * r * 0.86;
      ctx.moveTo(x1, y1);
      ctx.quadraticCurveTo(mx, my, x2, y2);
    }
  }
  ctx.stroke();
}

export function drawHalloweenFrame(ctx: CanvasRenderingContext2D, w: number, h: number) {
  ctx.save();
  // Un velo oscuro en los bordes: separa el marco de cualquier fondo (también de uno claro).
  const vignette = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.42, w / 2, h / 2, Math.hypot(w, h) * 0.55);
  vignette.addColorStop(0, 'rgba(20,20,20,0)');
  vignette.addColorStop(1, 'rgba(20,20,20,0.5)');
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, w, h);

  // Telarañas.
  ctx.strokeStyle = 'rgba(255,255,255,0.7)';
  ctx.lineWidth = 1.6;
  cobweb(ctx, w, 1, 120);
  cobweb(ctx, w, -1, 120);

  // Borde neón con brillo.
  const border = ctx.createLinearGradient(0, 0, w, h);
  border.addColorStop(0, LIME);
  border.addColorStop(1, VIOLET);
  ctx.strokeStyle = border;
  ctx.lineWidth = 9;
  ctx.shadowColor = VIOLET;
  ctx.shadowBlur = 18;
  ctx.beginPath();
  ctx.roundRect(11, 11, w - 22, h - 22, 30);
  ctx.stroke();
  ctx.shadowBlur = 0;

  // Murciélagos.
  ctx.fillStyle = NOIR;
  ctx.strokeStyle = LIME;
  ctx.lineWidth = 2.2;
  bat(ctx, w * 0.8, 142, 26, -0.25);
  bat(ctx, w * 0.12, 292, 17, 0.3);
  bat(ctx, w * 0.9, 330, 20, 0.2);

  // El evento, en vertical sobre el costado izquierdo.
  const label = `${EVENT_BRAND.nombre} · PLAYROOM`;
  ctx.font = '800 21px -apple-system, "SF Pro Display", Inter, system-ui, sans-serif';
  const textW = ctx.measureText(label).width;
  ctx.translate(40, h * 0.5);
  ctx.rotate(-Math.PI / 2);
  ctx.fillStyle = 'rgba(20,20,20,0.78)';
  ctx.beginPath();
  ctx.roundRect(-textW / 2 - 14, -19, textW + 28, 38, 19);
  ctx.fill();
  ctx.fillStyle = LIME;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, 0, 1);
  ctx.restore();
}
