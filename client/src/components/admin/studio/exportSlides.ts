import { toBlob } from 'html-to-image';
import JSZip from 'jszip';

/* Exporta las láminas del Estudio a PNG en el navegador (sin servidor): el
 * nodo de cada lámina está dibujado a tamaño real, así que el PNG sale a
 * 1080 de ancho tal cual.
 *
 * html-to-image tiene una mañana conocida: la PRIMERA captura a veces sale
 * sin las imágenes o sin la fuente (todavía las está incrustando). Se captura
 * dos veces y se usa la segunda. */

/** Las fuentes de las láminas del Diseñador IA (/studio/fonts.css) con cada
 * archivo incrustado como data: URL. Esas láminas viven dentro de un iframe,
 * y html-to-image solo sabe leer las fuentes de la página principal: sin
 * esto, el PNG saldría con la letra de reemplazo. Se arma una sola vez. */
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
  const inFrame = node.ownerDocument !== document;
  await (inFrame ? node.ownerDocument.fonts.ready : document.fonts.ready);
  const options = {
    pixelRatio: 1,
    cacheBust: false,
    width: node.offsetWidth,
    height: node.offsetHeight,
    ...(inFrame ? { fontEmbedCSS: await loadStudioFontCss() } : {}),
  };
  await toBlob(node, options).catch(() => null);
  const blob = await toBlob(node, options);
  if (!blob) throw new Error('No se pudo generar la imagen.');
  return blob;
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

export async function downloadSlide(node: HTMLElement, name: string) {
  download(await capture(node), name);
}

/** Todas las láminas, en orden, en un ZIP. */
export async function downloadZip(nodes: HTMLElement[], title: string) {
  const zip = new JSZip();
  for (let i = 0; i < nodes.length; i++) {
    zip.file(slideFileName(title, i, nodes.length), await capture(nodes[i]));
  }
  const blob = await zip.generateAsync({ type: 'blob' });
  download(blob, `${slideFileName(title, 0, 1).replace(/\.png$/, '')}.zip`);
}

/** En el celular: abre el menú de compartir con los PNG (de ahí se guardan en
 * la galería o se mandan directo a Instagram). Devuelve `false` si el
 * navegador no sabe compartir archivos -- el panel ofrece descargar. */
export async function shareSlides(nodes: HTMLElement[], title: string): Promise<boolean> {
  if (typeof navigator.canShare !== 'function') return false;
  const files: File[] = [];
  for (let i = 0; i < nodes.length; i++) {
    files.push(new File([await capture(nodes[i])], slideFileName(title, i, nodes.length), { type: 'image/png' }));
  }
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
