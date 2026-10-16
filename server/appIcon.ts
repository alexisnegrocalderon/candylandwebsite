/* Ícono de la app instalada del admin («Playroom»), servido por la función en
 * vez de como archivo estático por DOS razones:
 * - URL nueva que ningún iPhone guardó antes (el iPhone del dueño insistía con
 *   la «A» generada aunque el PNG estático estaba bien).
 * - Diagnóstico: cada pedido queda en los logs de Vercel con el tamaño y el
 *   navegador, así se sabe si el iPhone realmente pide el ícono al instalar. */
import type { Express, Request, Response } from 'express';
import { ADMIN_ICONS } from './appIcons.generated';

export function registerAppIconRoute(app: Express) {
  app.get('/api/app-icon/admin/:file', (req: Request, res: Response) => {
    const size = String(req.params.file).replace(/\.png$/i, '');
    const b64 = ADMIN_ICONS[size];
    console.info('[app-icon]', size, String(req.headers['user-agent'] ?? '').slice(0, 200));
    if (!b64) {
      res.status(404).end();
      return;
    }
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.send(Buffer.from(b64, 'base64'));
  });
}
