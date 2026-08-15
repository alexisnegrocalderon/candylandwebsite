import express, { type Express } from 'express';
import fs from 'fs';
import { type Server } from 'http';
import { nanoid } from 'nanoid';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import viteConfig from '../../vite.config';
import { buildSsrPrefetch } from './ssrCaller';
import { composeHtml, FALLBACK_HEAD } from './ssrHtml';

export async function setupVite(app: Express, server: Server) {
  const serverOptions = {
    middlewareMode: true,
    hmr: { server },
    allowedHosts: true as const,
  };
  const vite = await createViteServer({
    ...viteConfig,
    configFile: false,
    server: serverOptions,
    appType: 'custom',
  });

  app.use(vite.middlewares);
  app.use('*', async (req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    const url = req.originalUrl;
    try {
      const clientTemplate = path.resolve(import.meta.dirname, '../..', 'client', 'index.html');
      let template = await fs.promises.readFile(clientTemplate, 'utf-8');
      template = template.replace(
        'src="/src/entry-client.tsx"',
        `src="/src/entry-client.tsx?v=${nanoid()}"`,
      );
      template = await vite.transformIndexHtml(url, template);
      template = template.replace('</head>', '<link rel="stylesheet" href="/src/index.css?direct" data-ssr-dev-css></head>');
      const { render } = await vite.ssrLoadModule('/src/entry-server.tsx');
      const prefetch = await buildSsrPrefetch(req, res);
      const { html, dehydratedState, head } = await render(url, prefetch);
      res
        .status(head.notFound ? 404 : 200)
        .set('Cache-Control', 'no-cache')
        .type('html')
        .end(composeHtml(template, html, head, dehydratedState));
    } catch (error) {
      vite.ssrFixStacktrace(error as Error);
      console.error('[SSR] dev render failed:', error);
      next(error);
    }
  });
}

function redirectCanonicalPath(req: express.Request, res: express.Response, next: express.NextFunction) {
  if (req.path === '/index.html') return res.redirect(301, '/');
  const legacyRoutes: Record<string, string> = {
    '/blog/primera-vez': '/blog/primera-vez-que-esperar',
  };
  if (legacyRoutes[req.path]) {
    return res.redirect(301, legacyRoutes[req.path] + req.originalUrl.slice(req.path.length));
  }
  if (req.path !== '/' && /\/+$/ .test(req.path)) {
    const query = req.originalUrl.slice(req.path.length);
    const target = (req.path.replace(/\/+$/, '') || '/').replace(/^\/\/+/, '/');
    return res.redirect(301, target + query);
  }
  next();
}

export function serveStatic(app: Express) {
  const distPath = process.env.NODE_ENV === 'development'
    ? path.resolve(import.meta.dirname, '../..', 'dist', 'public')
    : path.resolve(import.meta.dirname, 'public');
  if (!fs.existsSync(distPath)) {
    console.error(`Could not find the build directory: ${distPath}, make sure to build the client first`);
  }

  app.use(redirectCanonicalPath);
  app.use(express.static(distPath, { index: false, redirect: false }));
  const templatePath = path.resolve(distPath, 'index.html');
  const ssrEntryPath = path.resolve(import.meta.dirname, 'server-ssr', 'entry-server.js');

  app.use('*', async (req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    try {
      const template = await fs.promises.readFile(templatePath, 'utf-8');
      const { render } = await import(ssrEntryPath);
      const prefetch = await buildSsrPrefetch(req, res);
      const { html, dehydratedState, head } = await render(req.originalUrl, prefetch);
      res
        .status(head.notFound ? 404 : 200)
        .set('Cache-Control', 'no-cache')
        .type('html')
        .end(composeHtml(template, html, head, dehydratedState));
    } catch (error) {
      console.error('[SSR] render failed, serving shell:', error);
      try {
        const template = await fs.promises.readFile(templatePath, 'utf-8');
        res
          .status(200)
          .set('Cache-Control', 'no-cache')
          .type('html')
          .end(composeHtml(template, '', FALLBACK_HEAD, {}));
      } catch (fallbackError) {
        next(fallbackError);
      }
    }
  });
}
