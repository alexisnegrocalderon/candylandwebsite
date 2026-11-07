import { toBlob } from 'html-to-image';
import { FONT_FILES } from '@motion/theme';
import { sleep, withTimeout } from '../studio/fitText';

/* PNG de las láminas del pack (carrusel, post, historia) sin servidor: la
 * misma composición del video, congelada en un cuadro y dibujada a tamaño real
 * (1080 de ancho) fuera de pantalla; esa caja se captura con html-to-image.
 *
 * Dos mañas conocidas de html-to-image que acá se atienden:
 *  - Las fuentes cargadas con la API FontFace (así las carga la composición) no
 *    están en ninguna hoja de estilos, y la captura las pierde: se incrustan a
 *    mano como data: URL (`fontEmbedCSS`).
 *  - La PRIMERA captura a veces sale sin fuentes o sin fotos: se captura dos
 *    veces y se usa la segunda.
 * Todo con tope de tiempo: una exportación nunca debe quedar girando. */

const CAPTURE_MAX_MS = 30_000;

const toDataUrl = (blob: Blob) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result));
  reader.onerror = () => reject(reader.error);
  reader.readAsDataURL(blob);
});

let fontCss: Promise<string> | null = null;

/** @font-face de las fuentes del Estudio Motion con cada archivo incrustado. Se arma una sola vez. */
export function motionFontCss(): Promise<string> {
  fontCss ??= (async () => {
    const rules = await Promise.all(FONT_FILES.map(async ({ family, file, weight }) => {
      const res = await fetch(`/${file}`);
      if (!res.ok) throw new Error(`No se pudo bajar la fuente ${family}`);
      const data = await toDataUrl(await res.blob());
      const format = file.endsWith('.woff2') ? 'woff2' : 'truetype';
      return `@font-face{font-family:'${family}';src:url('${data}') format('${format}');font-weight:${weight ?? 'normal'};font-style:normal;}`;
    }));
    return rules.join('\n');
  })().catch((err) => {
    fontCss = null; // que el próximo intento vuelva a probar
    throw err;
  });
  return fontCss;
}

/** Espera a que las fotos de la caja estén cargadas (y un respiro para que dibuje el 3D). */
async function waitForStage(node: HTMLElement, settleMs: number): Promise<void> {
  const deadline = Date.now() + 6000;
  while (Date.now() < deadline) {
    const pending = Array.from(node.querySelectorAll('img')).some((img) => !img.complete);
    if (!pending) break;
    await sleep(100);
  }
  await document.fonts.ready;
  await sleep(settleMs);
}

/** Captura una caja ya dibujada a PNG. `settleMs` da tiempo a que el 3D (póster) dibuje su cuadro. */
export async function captureStage(node: HTMLElement, settleMs = 450): Promise<Blob> {
  await waitForStage(node, settleMs);
  const options = {
    pixelRatio: 1,
    cacheBust: false,
    width: node.offsetWidth,
    height: node.offsetHeight,
    fontEmbedCSS: await motionFontCss().catch(() => undefined),
  };
  const attempt = async () => (await withTimeout(toBlob(node, options).catch(() => null), CAPTURE_MAX_MS)) ?? null;
  await attempt();
  const blob = await attempt();
  if (!blob) throw new Error('La imagen tardó demasiado o no se pudo generar en este navegador. Intenta de nuevo.');
  return blob;
}
