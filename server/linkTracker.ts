/* Contador de clics del embudo de Instagram: los botones que manda Instagram
 * apuntan a /api/go?o=<origen>&to=<ruta del sitio>. Se registra el clic y se
 * redirige a esa ruta del mismo sitio (nunca a otro dominio: un redirector
 * abierto serviría para phishing con nuestro nombre). */
import type { Express, Request, Response } from 'express';
import { recordIgLinkClick } from './db';

const APP_URL = (process.env.APP_URL || 'https://mansionplayroom.cl').replace(/\/+$/, '');

/** Ruta interna segura o `null`: debe empezar con "/" y no con "//" ni "/\". */
export function safeInternalPath(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  if (!raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\')) return null;
  if (/[\r\n]/.test(raw) || raw.length > 1000) return null;
  return raw;
}

export function cleanOrigin(raw: unknown): string {
  const s = typeof raw === 'string' ? raw.toLowerCase().replace(/[^a-z0-9_-]+/g, '-').slice(0, 100) : '';
  return s || 'sin-origen';
}

export function registerLinkTrackerRoute(app: Express) {
  app.get('/api/go', async (req: Request, res: Response) => {
    const path = safeInternalPath(req.query.to) ?? '/';
    // Los bots que arman la vista previa del link no cuentan como clic.
    const ua = String(req.headers['user-agent'] ?? '');
    if (!/facebookexternalhit|bot|crawler|spider|preview/i.test(ua)) {
      await recordIgLinkClick(cleanOrigin(req.query.o), path.split('?')[0]);
    }
    res.redirect(302, `${APP_URL}${path}`);
  });
}
