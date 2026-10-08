import { toBlob } from 'html-to-image';
import JSZip from 'jszip';
import { frameBaseCss, shadowDesignCss, slideBoardHtml, type AiSlide } from '@shared/studioAi';
import type { StudioFormat } from '@shared/contentStudio';
import { fitWhenReady, sleep, withTimeout } from './fitText';

/* Exporta las láminas del Estudio a PNG en el navegador (sin servidor): cada
 * lámina está dibujada a tamaño real, así que el PNG sale a 1080 de ancho tal
 * cual.
 *
 * html-to-image tiene una mañana conocida: la PRIMERA captura a veces sale
 * sin las imágenes o sin la fuente (todavía las está incrustando). Se captura
 * dos veces y se usa la segunda.
 *
 * Las láminas del Diseñador IA NO se capturan desde su iframe (sin scripts,
 * y Safari del iPad se atasca ahí): se vuelven a dibujar en la página
 * principal, dentro de un shadow root invisible, y se captura ese nodo.
 * Todo con tope de tiempo: una exportación nunca debe quedar girando. */

/** Tope por lámina; una de 1080×1440 tarda 1–3 s, hasta en un iPad. */
const CAPTURE_MAX_MS = 30_000;

const FONT_FACES = [
  '600 40px "Gliker Semi Bold Expanded"',
  '400 40px "Allura"',
  '400 40px "Josefin Sans"',
  'italic 300 40px "Josefin Sans"',
  '500 40px "Unbounded"',
  '400 40px "Inter"',
];

/** Las fuentes de las láminas cargadas en la PÁGINA (no solo dentro de cada
 * iframe): hacen falta para dibujar y capturar fuera del iframe. */
async function ensureStudioFonts(): Promise<void> {
  let link = document.getElementById('studio-fonts-link') as HTMLLinkElement | null;
  if (!link) {
    link = document.createElement('link');
    link.id = 'studio-fonts-link';
    link.rel = 'stylesheet';
    link.href = '/studio/fonts.css';
    document.head.appendChild(link);
  }
  // `document.fonts.load` solo conoce las fuentes de hojas YA cargadas: si se
  // pide antes, no descarga nada y la lámina se mide con la letra de reemplazo
  // (el texto se achicaba de más en la primera exportación).
  if (!link.sheet) {
    const el = link;
    await withTimeout(new Promise<void>((resolve) => {
      el.addEventListener('load', () => resolve(), { once: true });
      el.addEventListener('error', () => resolve(), { once: true });
    }), 8000);
  }
  // Las fuentes solo se descargan cuando algo las usa: se piden a propósito.
  await withTimeout(Promise.all(FONT_FACES.map((face) => document.fonts.load(face, 'AaÁáñÑ¿?0123').catch(() => []))), 8000);
}

/** Las fuentes de las láminas (/studio/fonts.css) con cada archivo incrustado
 * como data: URL, para que la captura las lleve dentro. Se arma una sola vez. */
let studioFontCss: Promise<string> | null = null;
function loadStudioFontCss(): Promise<string> {
  studioFontCss ??= (async () => {
    const css = await (await fetch('/studio/fonts.css')).text();
    const urls = Array.from(new Set(Array.from(css.matchAll(/url\('([^']+)'\)/g), (m) => m[1])));
    const inlined = await Promise.all(urls.map(async (url) => {
      const blob = await (await fetch(url)).blob();
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
      });
      return [url, dataUrl] as const;
    }));
    return inlined.reduce((acc, [url, dataUrl]) => acc.split(`'${url}'`).join(`'${dataUrl}'`), css.replace(/\/\*[\s\S]*?\*\//g, ''));
  })().catch((err) => {
    studioFontCss = null; // que el próximo intento vuelva a probar
    throw err;
  });
  return studioFontCss;
}

async function capture(node: HTMLElement): Promise<Blob> {
  await document.fonts.ready;
  const options = {
    pixelRatio: 1,
    cacheBust: false,
    width: node.offsetWidth,
    height: node.offsetHeight,
    fontEmbedCSS: await loadStudioFontCss().catch(() => undefined),
  };
  const attempt = async () => (await withTimeout(toBlob(node, options).catch(() => null), CAPTURE_MAX_MS)) ?? null;
  await attempt(); // la primera captura a veces sale sin fuentes ni fotos
  const blob = await attempt();
  if (!blob) throw new Error('La imagen tardó demasiado o no se pudo generar en este navegador. Intenta de nuevo.');
  return blob;
}

/** Dibuja una lámina del Diseñador IA fuera de pantalla, en la página
 * principal, y la captura a PNG. El CSS queda encerrado en un shadow root, así
 * no se mezcla con el del panel. */
export async function renderAiSlide(design: { css: string; format: StudioFormat }, slide: AiSlide): Promise<Blob> {
  await ensureStudioFonts();
  const host = document.createElement('div');
  host.setAttribute('aria-hidden', 'true');
  Object.assign(host.style, { position: 'fixed', left: '-20000px', top: '0', pointerEvents: 'none' });
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = `<style>${shadowDesignCss(design.css)}</style><style>${frameBaseCss(design.format)}</style>${slideBoardHtml(slide)}`;
  document.body.appendChild(host);
  try {
    const board = root.querySelector<HTMLElement>('.board');
    if (!board) throw new Error('La lámina está vacía.');
    await fitWhenReady(board);
    return await capture(board);
  } finally {
    host.remove();
  }
}

export interface ExportItem {
  name: string;
  blob: Blob;
}

export function slideFileName(title: string, index: number, total: number): string {
  const base = title
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50) || 'diseno';
  return total > 1 ? `${base}-${String(index + 1).padStart(2, '0')}.png` : `${base}.png`;
}

/** Todas las láminas de un diseño, una tras otra (en paralelo saturaría la
 * memoria de un iPad). */
export async function renderAiDesign(design: { css: string; format: StudioFormat; title: string; slides: AiSlide[] }): Promise<ExportItem[]> {
  const items: ExportItem[] = [];
  for (let i = 0; i < design.slides.length; i++) {
    items.push({ name: slideFileName(design.title, i, design.slides.length), blob: await renderAiSlide(design, design.slides[i]) });
    await sleep(0); // respira entre láminas: la pantalla no se congela
  }
  return items;
}

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Descarga una imagen ya generada. */
export function downloadBlob(item: ExportItem) {
  download(item.blob, item.name);
}

/** Todas las imágenes, en orden, en un ZIP. */
export async function downloadZipOf(items: ExportItem[], title: string) {
  const zip = new JSZip();
  for (const item of items) zip.file(item.name, item.blob);
  const blob = await zip.generateAsync({ type: 'blob' });
  download(blob, `${slideFileName(title, 0, 1).replace(/\.png$/, '')}.zip`);
}

/** En el celular: abre el menú de compartir con los PNG (de ahí se guardan en
 * la galería o se mandan directo a Instagram). Devuelve `false` si el
 * navegador no sabe compartir archivos -- el panel ofrece descargar.
 * Lanza un error con `name === 'NotAllowedError'` si el navegador exige un
 * toque nuevo (Safari lo pide si pasó mucho tiempo desde el toque original):
 * como las imágenes ya están hechas, el panel avisa que se vuelva a tocar. */
export async function shareItems(items: ExportItem[], title: string): Promise<boolean> {
  if (typeof navigator.canShare !== 'function') return false;
  const files = items.map((i) => new File([i.blob], i.name, { type: 'image/png' }));
  if (!navigator.canShare({ files })) return false;
  try {
    await navigator.share({ files, title });
  } catch (err) {
    // Cerrar el menú de compartir no es un error.
    if (err instanceof DOMException && err.name === 'AbortError') return true;
    throw err;
  }
  return true;
}

/* --- Plantillas fijas (se dibujan en la página principal, no en un iframe) --- */

export async function downloadSlide(node: HTMLElement, name: string) {
  download(await capture(node), name);
}

export async function downloadZip(nodes: HTMLElement[], title: string) {
  const items: ExportItem[] = [];
  for (let i = 0; i < nodes.length; i++) items.push({ name: slideFileName(title, i, nodes.length), blob: await capture(nodes[i]) });
  await downloadZipOf(items, title);
}

export async function shareSlides(nodes: HTMLElement[], title: string): Promise<boolean> {
  const items: ExportItem[] = [];
  for (let i = 0; i < nodes.length; i++) items.push({ name: slideFileName(title, i, nodes.length), blob: await capture(nodes[i]) });
  return shareItems(items, title);
}
