import type { Express } from 'express';
import { getPublishedEvents } from '../db';
import { ALL_ARTICLES, articlePath } from '../../client/src/content';

const ORIGIN = (process.env.CANONICAL_ORIGIN || 'https://mansionplayroom.cl').replace(/\/$/, '');

function xmlEscape(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function absolute(path: string) {
  return `${ORIGIN}${path}`;
}

export function getRobotsText() {
  return [
    'User-agent: *',
    'Allow: /',
    'Disallow: /admin',
    'Disallow: /caja',
    'Disallow: /puerta',
    'Disallow: /cocina',
    'Disallow: /guardarropia',
    'Disallow: /gastos',
    'Disallow: /fiesta',
    'Disallow: /checkout',
    'Disallow: /pago',
    'Disallow: /verificar',
    'Disallow: /api/',
    '',
    `Sitemap: ${absolute('/sitemap.xml')}`,
    '',
  ].join('\n');
}

function buildSitemap(paths: string[]) {
  const unique = Array.from(new Set(paths));
  const entries = unique.map((path) => `  <url><loc>${xmlEscape(absolute(path))}</loc></url>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries}\n</urlset>\n`;
}

export async function getSitemapXml() {
  let eventPaths: string[] = [];
  try {
    const events = await getPublishedEvents();
    eventPaths = events.map((event) => `/eventos/${event.slug}`);
  } catch (error) {
    console.error('[SEO] sitemap event lookup failed:', error);
  }
  const staticPaths = [
    '/', '/eventos', '/entradas', '/nosotros', '/embajadores',
    '/panoramas', '/blog', '/politica-de-reembolso', '/politica-de-privacidad',
    ...ALL_ARTICLES.map(articlePath),
  ];
  return buildSitemap([...staticPaths, ...eventPaths]);
}

export function registerSeoRoutes(app: Express) {
  app.get('/robots.txt', (_req, res) => {
    res.type('text/plain').send(getRobotsText());
  });

  app.get('/sitemap.xml', async (_req, res) => {
    res.type('application/xml').send(await getSitemapXml());
  });
}
