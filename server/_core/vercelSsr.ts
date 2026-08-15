import type { Express } from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import { render } from '../../client/src/entry-server';
import { buildSsrPrefetch } from './ssrCaller';
import { composeHtml, FALLBACK_HEAD } from './ssrHtml';
import { getRobotsText, getSitemapXml } from './seoRoutes';

function routeFromRequest(req: any) {
  const raw = typeof req.query?.path === 'string'
    ? req.query.path
    : (typeof req.path === 'string' ? req.path : '/');
  let decoded = raw;
  try { decoded = decodeURIComponent(raw); } catch { /* preserve malformed path */ }
  return (decoded.startsWith('/') ? decoded : `/${decoded}`) || '/';
}

function requestUrl(req: any, routePath: string) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(req.query || {})) {
    if (key === 'path') continue;
    if (Array.isArray(value)) value.forEach((item) => params.append(key, String(item)));
    else if (value != null) params.set(key, String(value));
  }
  const query = params.toString();
  return query ? `${routePath}?${query}` : routePath;
}

function redirectCanonicalPath(routePath: string, req: any, res: any) {
  const fullRequestUrl = requestUrl(req, routePath);
  const querySuffix = fullRequestUrl.slice(routePath.length);
  if (routePath === '/index.html') {
    res.redirect(301, '/' + querySuffix);
    return true;
  }
  const legacyRoutes: Record<string, string> = {
    '/blog/primera-vez': '/blog/primera-vez-que-esperar',
  };
  if (legacyRoutes[routePath]) {
    res.redirect(301, legacyRoutes[routePath] + querySuffix);
    return true;
  }
  if (routePath !== '/' && /\/+$/ .test(routePath)) {
    const target = (routePath.replace(/\/+$/, '') || '/').replace(/^\/\/+/, '/');
    res.redirect(301, target + querySuffix);
    return true;
  }
  return false;
}

export function registerVercelSsr(app: Express) {
  const renderHandler = async (req: any, res: any) => {
    const routePath = routeFromRequest(req);
    if (redirectCanonicalPath(routePath, req, res)) return;
    if (routePath === '/robots.txt') return res.type('text/plain').send(getRobotsText());
    if (routePath === '/sitemap.xml') return res.type('application/xml').send(await getSitemapXml());
    try {
      const templatePath = path.resolve(process.cwd(), 'dist', 'public', 'index.html');
      const template = await fs.readFile(templatePath, 'utf-8');
      const prefetch = await buildSsrPrefetch(req, res);
      const { html, dehydratedState, head } = await render(requestUrl(req, routePath), prefetch);
      res
        .status(head.notFound ? 404 : 200)
        .set('Cache-Control', 'no-cache')
        .type('html')
        .end(composeHtml(template, html, head, dehydratedState));
    } catch (error) {
      console.error('[SSR] Vercel render failed, serving shell:', error);
      try {
        const templatePath = path.resolve(process.cwd(), 'dist', 'public', 'index.html');
        const template = await fs.readFile(templatePath, 'utf-8');
        res
          .status(200)
          .set('Cache-Control', 'no-cache')
          .type('html')
          .end(composeHtml(template, '', FALLBACK_HEAD, {}));
      } catch (fallbackError) {
        console.error('[SSR] Vercel fallback failed:', fallbackError);
        res.status(500).type('text/plain').send('SSR unavailable');
      }
    }
  };

  // Vercel exposes the compiled `api/index.js` function at `/api/index`.
  // Keep `/api/render` as a compatibility path for local Express and older previews.
  app.get(['/api/index', '/api/render'], renderHandler);
  // Depending on Vercel's rewrite mode, Express may receive the original
  // public pathname (`/entradas`) instead of `/api/index`. Handle that final
  // GET here while leaving API/webhook routes mounted above untouched.
  app.get('*', renderHandler);
}
