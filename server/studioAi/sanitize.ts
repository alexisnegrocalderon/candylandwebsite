import sanitizeHtml from 'sanitize-html';

/* Saneado del HTML/CSS que escribe la IA del Estudio, ANTES de guardarlo.
 *
 * La lámina se muestra en un iframe `sandbox` sin scripts, así que esto es la
 * segunda capa, no la única: deja pasar lo que un diseño necesita (layout,
 * estilos en línea, SVG para íconos y flechas) y saca lo que no tiene nada
 * que hacer en una imagen de Instagram -- scripts, manejadores `on*`,
 * iframes, formularios -- y cualquier recurso de fuera. Las imágenes solo
 * pueden venir del propio sitio o del Blob del dueño: además de no filtrar
 * nada hacia afuera, es lo único que la exportación a PNG puede leer sin
 * problemas de CORS. */

const BLOB_HOST = /^https:\/\/[a-z0-9-]+\.public\.blob\.vercel-storage\.com\//i;

/** URL que una lámina puede cargar: ruta propia ("/candyland/...") o Blob. */
export function isAllowedAssetUrl(url: string): boolean {
  const u = url.trim();
  if (u.startsWith('/') && !u.startsWith('//')) return true;
  return BLOB_HOST.test(u);
}

const SVG_TAGS = [
  'svg', 'g', 'path', 'circle', 'ellipse', 'rect', 'line', 'polyline', 'polygon', 'defs',
  'lineargradient', 'radialgradient', 'stop', 'text', 'tspan', 'clippath', 'mask', 'use', 'symbol',
  'filter', 'fegaussianblur', 'feoffset', 'femerge', 'femergenode', 'feflood', 'fecomposite', 'fedropshadow', 'feblend', 'fecolormatrix',
];

const SVG_ATTRS = [
  'viewbox', 'viewBox', 'xmlns', 'fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'stroke-dasharray', 'stroke-opacity', 'fill-opacity', 'fill-rule', 'clip-rule', 'opacity',
  'd', 'cx', 'cy', 'r', 'rx', 'ry', 'x', 'y', 'x1', 'y1', 'x2', 'y2', 'width', 'height', 'points', 'transform',
  'offset', 'stop-color', 'stop-opacity', 'gradientUnits', 'gradientTransform', 'fx', 'fy', 'id', 'clip-path', 'mask',
  'text-anchor', 'dominant-baseline', 'font-family', 'font-size', 'font-weight', 'letter-spacing',
  'stdDeviation', 'dx', 'dy', 'in', 'in2', 'result', 'flood-color', 'flood-opacity', 'operator', 'mode', 'values', 'type', 'preserveAspectRatio', 'href',
];

/** `url(...)` dentro de CSS: solo las permitidas; el resto se vacía. */
function cleanCssUrls(css: string): string {
  return css.replace(/url\(\s*(['"]?)(.*?)\1\s*\)/gi, (match, _q, url: string) => {
    // Referencias internas de SVG (url(#gradiente)) y las URLs permitidas pasan.
    if (url.startsWith('#') || isAllowedAssetUrl(url)) return match;
    return 'none';
  });
}

/** CSS compartido de un diseño. Sin @import (traería hojas de afuera), sin
 * @font-face propios (las fuentes las pone el Estudio) y sin nada que cierre
 * la etiqueta <style>. */
export function sanitizeCss(css: string): string {
  return cleanCssUrls(
    css
      .replace(/<\/?\s*style[^>]*>/gi, '')
      .replace(/@import[^;]*;?/gi, '')
      .replace(/@font-face\s*\{[^}]*\}/gi, '')
      .replace(/expression\s*\(/gi, '(')
      .replace(/javascript:/gi, ''),
  );
}

/** HTML de una lámina. */
export function sanitizeSlideHtml(html: string): string {
  const clean = sanitizeHtml(html, {
    allowedTags: [
      'div', 'span', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'b', 'strong', 'i', 'em', 'u', 's', 'small', 'sup', 'sub', 'br', 'hr',
      'ul', 'ol', 'li', 'img', 'figure', 'figcaption', 'section', 'header', 'footer', 'main', 'article', 'aside', 'mark',
      ...SVG_TAGS,
    ],
    allowedAttributes: {
      '*': ['class', 'style', 'aria-hidden', 'aria-label', 'role', 'data-*'],
      img: ['src', 'alt', 'width', 'height', 'loading'],
      ...Object.fromEntries(SVG_TAGS.map((t) => [t, SVG_ATTRS])),
    },
    allowedSchemes: ['https'],
    allowedSchemesAppliedToAttributes: ['src', 'href'],
    allowProtocolRelative: false,
    parser: { lowerCaseAttributeNames: false },
    exclusiveFilter: (frame) => frame.tag === 'img' && !isAllowedAssetUrl(frame.attribs.src ?? ''),
    transformTags: {
      // `href` en SVG solo para referencias internas (<use href="#x">).
      '*': (tagName, attribs) => {
        const next = { ...attribs };
        if (next.href && !next.href.startsWith('#')) delete next.href;
        if (next.style) next.style = cleanCssUrls(next.style.replace(/expression\s*\(/gi, '(').replace(/javascript:/gi, ''));
        return { tagName, attribs: next };
      },
    },
  });
  return clean.trim();
}
