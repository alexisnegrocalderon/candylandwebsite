import { PHOTO_MAX_BYTES, PHOTO_SIZE_PX } from '@shared/party';

/** Toma la foto elegida con la cámara, la recorta cuadrada al centro y la
 * comprime a JPEG en el propio celular. Devuelve base64 sin el prefijo
 * `data:`. Baja la calidad hasta que entre en el tope del servidor. */
export async function compressSelfie(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement('canvas');
  canvas.width = PHOTO_SIZE_PX;
  canvas.height = PHOTO_SIZE_PX;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Tu navegador no puede procesar la foto');
  ctx.drawImage(
    bitmap,
    (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side,
    0, 0, PHOTO_SIZE_PX, PHOTO_SIZE_PX,
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
