import superjson from 'superjson';
import type { HeadMeta } from '../../client/src/ssr/prefetch';

export const CANONICAL_ORIGIN = process.env.CANONICAL_ORIGIN || 'https://mansionplayroom.cl';
export const SITE_NAME = process.env.SITE_NAME || 'Mansion Playroom';
const OG_LOCALE = process.env.OG_LOCALE || 'es_CL';

export function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function clampText(value: string, max: number) {
  const text = value.replace(/\s+/g, ' ').trim();
  if (text.length <= max) return text;
  const cut = text.lastIndexOf(' ', max);
  return (cut > max * 0.6 ? text.slice(0, cut) : text.slice(0, max)) + '…';
}

function metaText(value: string, max: number) {
  return clampText(value.replace(/[#*_`~]+/g, ''), max);
}

function absoluteImage(image: string | undefined) {
  if (!image) return undefined;
  if (image.startsWith('//')) return `https:${image}`;
  if (image.startsWith('/')) return `${CANONICAL_ORIGIN}${image}`;
  return image;
}

export function buildHeadTags(head: HeadMeta) {
  const title = escapeHtml(clampText(head.title || SITE_NAME, 70));
  const description = escapeHtml(metaText(head.description || '', 200));
  const image = absoluteImage(head.ogImage);
  const canonical = head.canonicalPath ? `${CANONICAL_ORIGIN}${head.canonicalPath}` : undefined;
  const noindex = Boolean(head.noindex || head.notFound);
  const tags = [
    `<title>${title}</title>`,
    `<meta name="description" content="${description}" />`,
    `<meta name="robots" content="${noindex ? 'noindex, follow' : 'index, follow'}" />`,
    `<meta property="og:type" content="${head.ogType || 'website'}" />`,
    `<meta property="og:site_name" content="${escapeHtml(SITE_NAME)}" />`,
    `<meta property="og:title" content="${title}" />`,
    `<meta property="og:description" content="${description}" />`,
    `<meta property="og:locale" content="${escapeHtml(head.locale || OG_LOCALE)}" />`,
    `<meta name="twitter:card" content="${image ? 'summary_large_image' : 'summary'}" />`,
    `<meta name="twitter:title" content="${title}" />`,
    `<meta name="twitter:description" content="${description}" />`,
  ];
  if (image) {
    tags.push(`<meta property="og:image" content="${escapeHtml(image)}" />`);
    tags.push(`<meta name="twitter:image" content="${escapeHtml(image)}" />`);
    if (head.ogImageWidth) tags.push(`<meta property="og:image:width" content="${head.ogImageWidth}" />`);
    if (head.ogImageHeight) tags.push(`<meta property="og:image:height" content="${head.ogImageHeight}" />`);
    if (head.ogImageAlt) tags.push(`<meta property="og:image:alt" content="${escapeHtml(head.ogImageAlt)}" />`);
  }
  if (head.ogType === 'article') {
    if (head.publishedTime) tags.push(`<meta property="article:published_time" content="${escapeHtml(head.publishedTime)}" />`);
    if (head.modifiedTime) tags.push(`<meta property="article:modified_time" content="${escapeHtml(head.modifiedTime)}" />`);
  }
  if (canonical && !noindex) {
    tags.push(`<meta property="og:url" content="${escapeHtml(canonical)}" />`);
    tags.push(`<link rel="canonical" href="${escapeHtml(canonical)}" />`);
  }
  for (const schema of head.jsonLd || []) {
    const serialized = JSON.stringify(schema).replace(/</g, '\\u003c');
    tags.push(`<script type="application/ld+json" data-seo-managed="true">${serialized}</script>`);
  }
  return tags.join('\n');
}

export function composeHtml(template: string, appHtml: string, head: HeadMeta, dehydratedState: unknown) {
  const serializedState = JSON.stringify(superjson.serialize(dehydratedState)).replace(/</g, '\\u003c');
  const stateScript = `<script>window.__RQ_STATE__ = ${serializedState}</script>`;
  return template
    .replace('</body>', () => `${stateScript}</body>`)
    .replace('<!--app-head-->', () => buildHeadTags(head))
    .replace('<!--app-html-->', () => appHtml);
}

export const FALLBACK_HEAD: HeadMeta = {
  title: `${SITE_NAME} — Fiesta Liberal en Viña del Mar | +18`,
  description: 'Fiestas liberales +18 en Viña del Mar y Valparaíso. Comunidad, consentimiento y libertad.',
  canonicalPath: '/',
};
