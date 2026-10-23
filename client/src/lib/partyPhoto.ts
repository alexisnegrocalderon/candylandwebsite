import { PHOTO_HEIGHT_PX, PHOTO_MAX_BYTES, PHOTO_WIDTH_PX } from '@shared/party';

/** Toma la foto elegida (cámara o galería), la recorta vertical 3:4 al centro (como la tarjeta del
 * swipe) y la comprime a JPEG en el propio celular. Devuelve base64 sin el prefijo `data:`. Baja
 * la calidad hasta que entre en el tope del servidor. */
export async function compressSelfie(file: File): Promise<string> {
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
