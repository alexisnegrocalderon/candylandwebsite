import { getAnthropicClient } from '../_core/llm';
import { DEFAULT_STUDIO_THEME, normalizeStudioDesign, STUDIO_LAYOUTS, type StudioDesign, type StudioFormat } from '../../shared/contentStudio';
import { BUBBLE_HEROES } from '../../shared/studioBubble';
import { addUsage, EMPTY_USAGE, usageCostUsd, type AiModel, type AiUsage } from '../../shared/studioAi';
import { TONO_DE_VOZ } from './brandPack';
import { eventFacts } from './designer';

/* Modo «Rápido» del Estudio: la IA SOLO escribe los textos y elige gráficos;
 * la plantilla Bubble (client/src/components/admin/studio/BubbleSlide.tsx)
 * dibuja las láminas. Una llamada corta, sin HTML: ~90 % menos tokens que el
 * diseño libre, y el resultado se ve igual que el diseño oficial. */

const HERO_KEYS = BUBBLE_HEROES.map((h) => h.key);

const SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string', description: 'Nombre corto del diseño (para la lista).' },
    caption: { type: 'string', description: 'Texto de la publicación para pegar en Instagram, con 3 a 6 hashtags al final (incluye #MansionPlayroom). Sin links.' },
    slides: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          layout: { type: 'string', enum: [...STUDIO_LAYOUTS].filter((l) => l !== 'imagen' && l !== 'pasos') },
          title: { type: 'string', description: 'Titular MUY corto (2 a 6 palabras).' },
          body: { type: 'string', description: 'Una frase corta o vacío.' },
          hero: { type: 'string', description: `Gráfico grande: una de ${HERO_KEYS.join(', ')} o un emoji. Vacío si la lámina no lleva.` },
          heroBelow: { type: 'boolean' },
          items: {
            type: 'array',
            description: 'Solo en layout resultados: 3 entradas.',
            items: {
              type: 'object',
              properties: {
                badge: { type: 'string', description: `Ícono: una de ${HERO_KEYS.join(', ')}.` },
                title: { type: 'string', description: '1 o 2 palabras.' },
              },
              required: ['badge', 'title'],
              additionalProperties: false,
            },
          },
          cta: { type: 'string', description: 'Botón (ej. «Comenta PLAYROOM») o vacío.' },
          footnote: { type: 'string', description: 'Texto chico bajo el botón o vacío.' },
          palette: { type: 'integer', description: '0 celeste, 1 azul rey, 2 lila.' },
        },
        required: ['layout', 'title', 'body', 'hero', 'heroBelow', 'items', 'cta', 'footnote', 'palette'],
        additionalProperties: false,
      },
    },
  },
  required: ['title', 'caption', 'slides'],
  additionalProperties: false,
} as const;

const SYSTEM = `Escribes los textos de carruseles de Instagram de Mansion Playroom con la plantilla oficial «Bubble». No diseñas: la plantilla dibuja.

Reglas del estilo (el de los carruseles que mejor rindieron):
- Pocas palabras y un gráfico grande por lámina; que se entienda en 1 segundo.
- Lámina 1 = portada con gancho (pregunta que genera curiosidad); última = cierre con cta tipo «Comenta PLAYROOM».
- layout «resultados» lleva exactamente 3 items con ícono; «portada», «pregunta» y «cierre» no llevan items.
- Alterna la paleta entre láminas (0, 1, 2) sin abusar del lila.
- Sin logo ni marca en el texto. Máximo 1 emoji por lámina, y solo si suma.

${TONO_DE_VOZ}`;

export interface QuickInput {
  brief: string;
  format: StudioFormat;
  eventId: number | null;
  model: AiModel;
  slideCount: number;
}

export interface QuickResult {
  design: StudioDesign;
  usage: AiUsage;
  costUsd: number;
  model: string;
}

export async function quickBubbleDesign(input: QuickInput): Promise<QuickResult> {
  const facts = await eventFacts(input.eventId);
  const count = Math.max(1, Math.min(10, input.format === 'carrusel' ? input.slideCount : 1));
  const message = await getAnthropicClient().messages.create({
    model: input.model,
    max_tokens: 3000,
    system: [
      { type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } },
      { type: 'text', text: `Datos reales del evento (no inventes fechas ni precios):\n${facts}` },
    ],
    messages: [{ role: 'user', content: `Pedido: ${input.brief}\nLáminas: ${count}` }],
    output_config: { format: { type: 'json_schema', schema: SCHEMA as unknown as Record<string, unknown> } },
  } as never);
  const msg = message as unknown as {
    stop_reason: string; model: string; content: { type: string; text?: string }[];
    usage: { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number };
  };
  if (msg.stop_reason === 'refusal') throw new Error('La IA no quiso hacer este diseño. Prueba describiéndolo de otra forma.');
  if (msg.stop_reason === 'max_tokens') throw new Error('La IA se quedó sin espacio. Pide menos láminas.');
  const usage: AiUsage = addUsage(EMPTY_USAGE, {
    inputTokens: msg.usage.input_tokens ?? 0,
    outputTokens: msg.usage.output_tokens ?? 0,
    cacheReadTokens: msg.usage.cache_read_input_tokens ?? 0,
    cacheWriteTokens: msg.usage.cache_creation_input_tokens ?? 0,
  });
  let data: { title: string; caption: string; slides: unknown[] };
  try {
    data = JSON.parse(msg.content.map((b) => b.text ?? '').join(''));
  } catch {
    throw new Error('La IA devolvió una respuesta rota. Intenta de nuevo.');
  }
  const design = normalizeStudioDesign({
    title: data.title,
    format: input.format,
    theme: DEFAULT_STUDIO_THEME,
    eventId: input.eventId,
    caption: data.caption,
    slides: data.slides,
  });
  if (!design) throw new Error('La IA no armó ninguna lámina. Intenta de nuevo.');
  return { design, usage, costUsd: usageCostUsd(msg.model, usage), model: msg.model };
}
