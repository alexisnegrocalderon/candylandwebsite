/* Avisos de Resend (webhook): entregado, rebotó, lo marcaron como spam, abrió, hizo clic.
 *
 * Para qué sirve con listas grandes:
 *  - Un correo que REBOTA (no existe) o que alguien marca como SPAM deja de recibir promociones: se le marca
 *    `emailOptOut`. Seguir mandándole daña la reputación del dominio y baja la entrega de todas las campañas.
 *  - Guarda cada aviso con su campaña y variante de asunto (etiquetas del envío) para comparar el A/B por clics.
 *
 * Configuración (una sola vez): en el panel de Resend → Webhooks, URL `https://<sitio>/api/webhooks/resend`, eventos
 * email.delivered / bounced / complained / opened / clicked, y el «Signing secret» (whsec_…) en la variable
 * `RESEND_WEBHOOK_SECRET` de Vercel. La firma es la de Svix (HMAC-SHA256 sobre `id.timestamp.cuerpo`). */
import crypto from 'crypto';
import express, { Router, type Request, type Response } from 'express';
import { recordEmailEvent } from './db';
import { applyEmailOptOut } from './unsubscribe';

export const resendWebhookRouter = Router();

const TOLERANCE_S = 5 * 60;

/** Valida la firma de Svix: `svix-signature` trae una o más firmas «v1,<base64>» separadas por espacios. */
export function verifySvixSignature(secret: string, headers: { id?: string; timestamp?: string; signature?: string }, rawBody: string, nowMs: number = Date.now()): boolean {
  const { id, timestamp, signature } = headers;
  if (!secret || !id || !timestamp || !signature) return false;
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(nowMs / 1000 - ts) > TOLERANCE_S) return false;
  const key = Buffer.from(secret.startsWith('whsec_') ? secret.slice(6) : secret, 'base64');
  const expected = crypto.createHmac('sha256', key).update(`${id}.${timestamp}.${rawBody}`).digest();
  return signature.split(' ').some((part) => {
    const [version, value] = part.split(',');
    if (version !== 'v1' || !value) return false;
    const given = Buffer.from(value, 'base64');
    return given.length === expected.length && crypto.timingSafeEqual(given, expected);
  });
}

const HANDLED = new Set(['email.delivered', 'email.bounced', 'email.complained', 'email.opened', 'email.clicked']);

/** Las etiquetas llegan como objeto `{ campaign: 'x' }` (o como lista de `{name, value}`, según la versión). */
function tagOf(tags: unknown, name: string): string | null {
  if (Array.isArray(tags)) return (tags.find((t) => t?.name === name)?.value as string | undefined) ?? null;
  if (tags && typeof tags === 'object') return ((tags as Record<string, unknown>)[name] as string | undefined) ?? null;
  return null;
}

/** Un rebote «temporal» (buzón lleno, servidor caído) no es motivo de baja; uno permanente, sí. */
function isHardBounce(data: any): boolean {
  const type = String(data?.bounce?.type ?? data?.bounce_type ?? 'Permanent').toLowerCase();
  return type === 'permanent' || type === 'hard';
}

export async function handleResendEvent(svixId: string, event: any): Promise<{ recorded: boolean; optedOut: boolean }> {
  const type = String(event?.type ?? '');
  if (!HANDLED.has(type)) return { recorded: false, optedOut: false };
  const data = event.data ?? {};
  const recipients: string[] = Array.isArray(data.to) ? data.to : data.to ? [data.to] : [];
  let recorded = false;
  let optedOut = false;
  for (const [i, email] of Array.from(recipients.entries())) {
    if (typeof email !== 'string' || !email.includes('@')) continue;
    const first = await recordEmailEvent({
      svixId: recipients.length > 1 ? `${svixId}:${i}` : svixId,
      resendId: data.email_id ?? null,
      type: type.replace('email.', ''),
      email,
      campaign: tagOf(data.tags, 'campaign'),
      variant: tagOf(data.tags, 'variant'),
      url: data.click?.link ?? null,
    });
    recorded = recorded || first;
    if (first && ((type === 'email.bounced' && isHardBounce(data)) || type === 'email.complained')) {
      await applyEmailOptOut(email, type === 'email.complained' ? 'Marcó el correo como spam' : 'El correo rebotó (no existe o no recibe)');
      optedOut = true;
    }
  }
  return { recorded, optedOut };
}

resendWebhookRouter.post('/api/webhooks/resend', express.raw({ type: '*/*', limit: '1mb' }), async (req: Request, res: Response) => {
  const secret = process.env.RESEND_WEBHOOK_SECRET ?? '';
  if (!secret) { console.error('[Resend webhook] Falta RESEND_WEBHOOK_SECRET'); res.status(503).json({ ok: false }); return; }
  const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';
  const ok = verifySvixSignature(secret, {
    id: req.header('svix-id') ?? undefined, timestamp: req.header('svix-timestamp') ?? undefined, signature: req.header('svix-signature') ?? undefined,
  }, raw);
  if (!ok) { res.status(400).json({ ok: false }); return; }
  try {
    const result = await handleResendEvent(req.header('svix-id') ?? '', JSON.parse(raw));
    res.json({ ok: true, ...result });
  } catch (err) {
    // 500 para que Resend reintente (por ejemplo si la base estaba caída).
    console.error('[Resend webhook] Error procesando el aviso:', err);
    res.status(500).json({ ok: false });
  }
});
