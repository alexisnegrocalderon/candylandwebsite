import { getAnthropicClient } from '../_core/llm';
import { addUsage, EMPTY_USAGE, usageCostUsd, type AiModel, type AiUsage } from '../../shared/studioAi';

/* La llamada corta a Claude de los modos «Rápido» del Estudio: la IA SOLO
 * escribe (textos, escenas, qué ícono va) y las plantillas y HyperFrames
 * dibujan. Una sola llamada con salida JSON y sin streaming, con el mismo
 * conteo de gasto que el resto del panel (usa la conexión de Claude que ya
 * está configurada; no hay ningún otro servicio de imágenes). */

export interface QuickCallResult<T> {
  data: T;
  usage: AiUsage;
  costUsd: number;
  model: string;
}

export type QuickContent = string | Array<Record<string, unknown>>;

export async function quickJson<T>(opts: {
  model: AiModel;
  /** Lo fijo (se guarda en caché entre llamadas): reglas y tono. */
  system: string;
  /** Lo que cambia (datos del evento, etc.). */
  facts?: string;
  content: QuickContent;
  schema: Record<string, unknown>;
  maxTokens: number;
  /** Qué decir si la IA no quiere hacerlo y qué pedir si se queda sin espacio. */
  refusal: string;
  tooLong: string;
}): Promise<QuickCallResult<T>> {
  const message = await getAnthropicClient().messages.create({
    model: opts.model,
    max_tokens: opts.maxTokens,
    system: [
      { type: 'text', text: opts.system, cache_control: { type: 'ephemeral' } },
      ...(opts.facts ? [{ type: 'text', text: opts.facts }] : []),
    ],
    messages: [{ role: 'user', content: opts.content }],
    output_config: { format: { type: 'json_schema', schema: opts.schema } },
  } as never);
  const msg = message as unknown as {
    stop_reason: string; model: string; content: { type: string; text?: string }[];
    usage: { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number };
  };
  if (msg.stop_reason === 'refusal') throw new Error(opts.refusal);
  if (msg.stop_reason === 'max_tokens') throw new Error(opts.tooLong);
  const usage: AiUsage = addUsage(EMPTY_USAGE, {
    inputTokens: msg.usage.input_tokens ?? 0,
    outputTokens: msg.usage.output_tokens ?? 0,
    cacheReadTokens: msg.usage.cache_read_input_tokens ?? 0,
    cacheWriteTokens: msg.usage.cache_creation_input_tokens ?? 0,
  });
  let data: T;
  try {
    data = JSON.parse(msg.content.map((b) => b.text ?? '').join('')) as T;
  } catch {
    throw new Error('La IA devolvió una respuesta rota. Intenta de nuevo.');
  }
  return { data, usage, costUsd: usageCostUsd(msg.model, usage), model: msg.model };
}
