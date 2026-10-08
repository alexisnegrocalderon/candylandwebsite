import type { Express, Request, Response } from 'express';
import { z } from 'zod';
import { requireAdmin } from '../adminRoutes';
import { STUDIO_FORMATS } from '../../shared/contentStudio';
import { AI_MODELS, emptyAiDesign, usageCostUsd } from '../../shared/studioAi';
import { createDesignTurn, editDesignTurn, type DesignerEvent } from './designer';
import { addAiMessage, createAiDesign, listAiMessages, loadAiDesign, saveAiDesign } from './store';
import { isAllowedAssetUrl } from './sanitize';

/* Chat del Diseñador IA del Estudio, por SSE (Server-Sent Events): el panel
 * va mostrando «Pensando el concepto…» y cada lámina apenas está lista, en
 * vez de esperar un minuto en blanco. No es tRPC por eso mismo -- mismo
 * criterio que las otras rutas Express crudas del admin (requireAdmin).
 *
 * Una llamada = un turno del chat: guarda lo que pidió el dueño, diseña (o
 * ajusta), guarda el diseño y la respuesta con su costo y la versión. */

const turnInput = z.object({
  designId: z.number().int().positive().optional(),
  message: z.string().trim().min(1, 'Escribe qué quieres').max(4000),
  images: z.array(z.string().max(1000)).max(6).default([]),
  model: z.enum(AI_MODELS),
  // Solo al crear.
  format: z.enum(STUDIO_FORMATS).default('carrusel'),
  eventId: z.number().int().positive().nullable().optional(),
});

export function registerStudioAiRoutes(app: Express) {
  app.post('/api/admin/studio/ai', async (req: Request, res: Response) => {
    if (!(await requireAdmin(req, res))) return;
    const parsed = turnInput.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Pedido inválido' });
      return;
    }
    const input = parsed.data;
    const images = input.images.filter(isAllowedAssetUrl);

    let designId = input.designId;
    let design;
    let previous;
    try {
      design = designId ? await loadAiDesign(designId) : emptyAiDesign(input.format, 'Diseño nuevo', input.eventId ?? null);
      if (!design) {
        res.status(404).json({ error: 'Ese diseño ya no existe.' });
        return;
      }
      if (!designId) designId = await createAiDesign(design);
      previous = await listAiMessages(designId);
      await addAiMessage({ designId, role: 'user', text: input.message, images });
    } catch (err) {
      // Express 4 no atrapa errores de handlers async: sin esto, el pedido queda colgado.
      console.error('[studio-ai]', err);
      res.status(500).json({ error: err instanceof Error ? err.message : 'No se pudo guardar el pedido.' });
      return;
    }

    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    const send = (event: string, data: unknown) => {
      if (!res.writableEnded) res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };
    send('start', { designId });

    // Si el dueño cierra la pestaña, se corta la llamada a la IA (no se sigue pagando).
    const abort = new AbortController();
    res.on('close', () => { if (!res.writableFinished) abort.abort(); });

    const allImages = Array.from(new Set([...previous.flatMap((m) => m.images), ...images]));
    const turn = {
      design,
      message: input.message,
      images,
      allImages,
      history: previous.map((m) => ({ role: m.role, text: m.text })),
      model: input.model,
      signal: abort.signal,
      onEvent: (event: DesignerEvent) => send(event.type, event),
    };

    try {
      const result = design.slides.length === 0 ? await createDesignTurn(turn) : await editDesignTurn(turn);
      design = await saveAiDesign(designId, result.design);
      const costUsd = usageCostUsd(result.model, result.usage);
      const messageId = await addAiMessage({
        designId, role: 'assistant', text: result.reply, model: result.model, usage: result.usage, costUsd, snapshot: design,
      });
      send('done', { designId, design, reply: result.reply, costUsd, messageId, model: result.model });
    } catch (err) {
      const message = abort.signal.aborted
        ? 'Se canceló el pedido.'
        : err instanceof Error ? err.message : 'No se pudo terminar el diseño.';
      console.error('[studio-ai]', err);
      await addAiMessage({ designId, role: 'assistant', text: `No pude terminar: ${message}` }).catch(() => {});
      send('error', { designId, message });
    } finally {
      res.end();
    }
  });
}
