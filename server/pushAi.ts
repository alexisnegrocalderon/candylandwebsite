/** Redacta avisos push con IA (compositor de Notificaciones push → «Redactar con IA»). */
import { z } from 'zod';
import { invokeLLM, extractContent } from './_core/llm';
import { clip, PUSH_BODY_MAX, PUSH_TITLE_MAX } from '../shared/pushText';

const SYSTEM_PROMPT = `Eres quien escribe las notificaciones push de Mansion Playroom / Candyland, una productora de fiestas en Valparaíso/Viña del Mar, Chile.
Una notificación tiene un TÍTULO (máx. ${PUSH_TITLE_MAX} caracteres, una línea, lo importante primero) y un TEXTO (máx. ${PUSH_BODY_MAX} caracteres, 1-2 frases).
Tono: cercano, español chileno, sin ser vulgar, sin gritar en mayúsculas, un emoji a lo más al inicio del título. Nada de lenguaje corporativo.
Puedes usar {nombre} (el primer nombre de la persona) una vez, solo si queda natural al inicio del texto; y {evento} para el nombre del evento.
Da una acción concreta o un motivo para abrir la notificación. No inventes precios, fechas ni cantidades que no te den.
Responde ÚNICAMENTE con el JSON pedido: 3 propuestas distintas entre sí (una directa, una con urgencia suave, una más cálida).`;

export const PUSH_DRAFTS_SCHEMA = {
  name: 'push_drafts',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['drafts'],
    properties: {
      drafts: {
        type: 'array',
        // El proveedor rechaza (400) maxItems y minItems mayores a 1: las 3 propuestas se piden en el texto y se recortan abajo.
        minItems: 1,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['title', 'body'],
          properties: {
            title: { type: 'string', description: `Título, máx. ${PUSH_TITLE_MAX} caracteres.` },
            body: { type: 'string', description: `Texto, máx. ${PUSH_BODY_MAX} caracteres.` },
          },
        },
      },
    },
  },
};

const Out = z.object({ drafts: z.array(z.object({ title: z.string().min(1), body: z.string().min(1) })).min(1).max(5) });

export async function draftPushCopy(input: { idea: string; eventTitle?: string | null; audience?: string | null }): Promise<{ title: string; body: string }[]> {
  const lines = [`Idea del aviso: ${input.idea}`];
  if (input.eventTitle) lines.push(`Evento de referencia: ${input.eventTitle}`);
  if (input.audience) lines.push(`A quién le llega: ${input.audience}`);
  const result = await invokeLLM({
    feature: 'push',
    messages: [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: lines.join('\n') }],
    responseFormat: { type: 'json_schema', json_schema: PUSH_DRAFTS_SCHEMA },
  });
  const raw = extractContent(result.choices[0]?.message ?? { content: '' });
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { throw new Error('La IA no devolvió un formato válido. Intenta de nuevo con una idea más concreta.'); }
  const out = Out.safeParse(parsed);
  if (!out.success) throw new Error('La IA no devolvió propuestas válidas. Intenta de nuevo.');
  return out.data.drafts.slice(0, 3).map((d) => ({ title: clip(d.title, PUSH_TITLE_MAX), body: clip(d.body, PUSH_BODY_MAX) }));
}
