import Anthropic from '@anthropic-ai/sdk';
import { getAnthropicClient } from '../_core/llm';
import { getEventById, getFeaturedEvent } from '../db';
import { buildEventFacts } from '../winback';
import { STUDIO_SIZES, type StudioFormat } from '../../shared/contentStudio';
import {
  addUsage,
  AI_MAX_SLIDES,
  AI_OPS,
  applyAiOps,
  type AiDesign,
  type AiModel,
  type AiOp,
  type AiUsage,
} from '../../shared/studioAi';
import {
  DESAFIO_CSS, DESAFIO_SLIDES, ESTILO_VISUAL, FORMATOS, MONSTRUO_CSS, MONSTRUO_SLIDES, README, TONO_DE_VOZ, TOKENS, USO_DEL_LOGO,
} from './brandPack';
import { cleanDesign } from './store';

/* El Diseñador IA del Estudio: Claude diseña láminas de Instagram en HTML+CSS
 * con el PlayRoom Design System, como en la ventana de Claude Design del
 * dueño, pero dentro del panel.
 *
 * - Crear: una llamada arma el plan (concepto, CSS compartido, qué va en cada
 *   lámina, caption) y después cada lámina se escribe EN PARALELO. Así un
 *   carrusel de 7 sale en lo que tarda una lámina, y cabe de sobra en el
 *   límite de 300 s de la función de Vercel.
 * - Ajustar: una llamada con el diseño actual y la conversación devuelve
 *   OPERACIONES (cambiar la lámina 3, el CSS, el caption...), no todo de
 *   nuevo: más barato, y no toca lo que no se pidió.
 *
 * Todo lo que escribe la IA pasa por el saneado (store.ts → sanitize.ts)
 * antes de guardarse o mostrarse. */

// Respaldo automático si un modelo rechaza un pedido (es una marca de fiestas
// para adultos: puede pasar con un brief subido de tono). La API reintenta con
// otro modelo dentro de la misma llamada.
const FALLBACK_BETA = 'server-side-fallback-2026-07-01';
const SLIDE_CONCURRENCY = 6;

/* --- Prompt de sistema (estable → se cachea) ------------------------------ */

const INSTRUCTIONS = `Eres el diseñador gráfico de Mansion Playroom. Diseñas piezas para su Instagram (carruseles, posts e historias) que se exportan a PNG desde el panel del dueño. Trabajas como en Claude Design: cada lámina es HTML + CSS, con libertad total de composición dentro de la marca.

## Cómo se arma una lámina (contrato técnico)
- Cada lámina es UN elemento raíz: <div class="board ...">...</div>. El panel le fija el ancho y alto exactos (te los doy en cada pedido); diseña en px para esa medida.
- El CSS compartido del diseño (campo "css") define las clases que se repiten entre láminas, como el shared.css de los ejemplos. Para variar una lámina usa clases extra en el .board (ej. "board lilac") o estilos en línea.
- Fuentes disponibles, y SOLO estas: 'Gliker Semi Bold Expanded' (peso 600), 'Allura', 'Josefin Sans' (100–700, también cursiva), 'Unbounded' (200–900) e 'Inter' (100–900). No escribas @font-face ni @import: las fuentes ya están cargadas.
- Imágenes: usa SOLO las URLs de la lista «Imágenes disponibles» (en <img src> o en background-image). Nunca inventes una URL. Si una lámina pide foto y no hay ninguna, resuélvelo con forma, color de marca o una ilustración simple en SVG en línea; no dejes cajas que digan «foto aquí».
- Nada de JavaScript, formularios, iframes ni recursos externos. Los íconos y flechas van en SVG en línea. Los emojis se pueden usar con moderación (se ven en el PNG).
- Todo el texto en español de Chile, con el tono de voz de la marca. Sin lorem ipsum. Los datos del evento (fecha, precio, tanda) salen SOLO de «Datos del evento»; si falta un dato, no lo inventes: omítelo.
- Respeta las zonas seguras de las historias (9:16): nada importante en los 250 px de arriba ni en los 250 px de abajo.
- Cuida que nada se corte ni se salga del .board: textos largos más chicos, o en más líneas.

## Cómo trabaja el dueño contigo
- Te escribe en un chat. Responde en "reply" en 1 a 3 frases, cercano y directo: qué hiciste o propones, y si algo no se pudo, por qué. Sin explicar código.
- Los ejemplos de abajo son carruseles reales ya publicados que le gustaron: úsalos como referencia de estructura y nivel de detalle, no como plantilla obligatoria. Están hechos a 1080×1350; adapta todo a la medida que te pida.
- Si el dueño pide un estilo de uno de los ejemplos («tipo Desafío», «como el test de monstruos»), sigue esa estructura de cerca.`;

function exampleBlock(name: string, css: string, slides: string[]) {
  return [`### Ejemplo: ${name}`, '```css', css, '```', ...slides.map((s, i) => [`Lámina ${i + 1}:`, '```html', s, '```'].join('\n'))].join('\n');
}

const STABLE_SYSTEM = [
  INSTRUCTIONS,
  '# PlayRoom Design System',
  README,
  ESTILO_VISUAL,
  FORMATOS,
  TONO_DE_VOZ,
  USO_DEL_LOGO,
  '## Tokens',
  TOKENS,
  '# Carruseles de referencia ({{FOTO}} = una foto del dueño)',
  exampleBlock('Desafío «¿Sabes jugar en Playroom?» (azul y magenta, foto que sale del borde)', DESAFIO_CSS, DESAFIO_SLIDES),
  exampleBlock('Test «¿Qué monstruo eres en Playroom?» (fondos pastel que se turnan)', MONSTRUO_CSS, MONSTRUO_SLIDES),
].join('\n\n');

const FORMAT_LABEL: Record<StudioFormat, string> = {
  carrusel: 'carrusel de Instagram 3:4',
  post: 'post único de Instagram 3:4 (UNA sola lámina)',
  historia: 'historia de Instagram 9:16 (UNA sola lámina)',
};

async function eventFacts(eventId: number | null): Promise<string> {
  try {
    const event = eventId ? await getEventById(eventId) : await getFeaturedEvent();
    return event ? await buildEventFacts(event) : 'No hay un evento próximo cargado.';
  } catch {
    return 'No se pudieron leer los datos del evento.';
  }
}

function dynamicSystem(design: AiDesign, facts: string, images: string[]): string {
  const { width, height } = STUDIO_SIZES[design.format];
  return [
    `## Este diseño`,
    `- Formato: ${FORMAT_LABEL[design.format]}. Cada .board mide ${width}×${height} px.`,
    design.format === 'carrusel' ? `- Máximo ${AI_MAX_SLIDES} láminas.` : '- Es UNA sola lámina.',
    '',
    '## Datos del evento',
    facts,
    '',
    '## Imágenes disponibles',
    images.length ? images.map((u, i) => `- Imagen ${i + 1}: ${u}`).join('\n') : '- (ninguna: resuelve sin fotos)',
  ].join('\n');
}

/* --- Llamada con salida JSON --------------------------------------------- */

export interface CallResult<T> {
  data: T;
  usage: AiUsage;
  model: string;
}

async function callJson<T>(opts: {
  model: AiModel;
  dynamic: string;
  messages: Anthropic.Beta.BetaMessageParam[];
  schema: Record<string, unknown>;
  maxTokens: number;
  signal?: AbortSignal;
}): Promise<CallResult<T>> {
  const stream = getAnthropicClient().beta.messages.stream(
    {
      model: opts.model,
      max_tokens: opts.maxTokens,
      betas: [FALLBACK_BETA],
      fallbacks: 'default',
      system: [
        { type: 'text', text: STABLE_SYSTEM, cache_control: { type: 'ephemeral' } },
        { type: 'text', text: opts.dynamic },
      ],
      messages: opts.messages,
      output_config: { effort: 'medium', format: { type: 'json_schema', schema: opts.schema } },
    },
    { signal: opts.signal },
  );
  const message = await stream.finalMessage();
  const usage: AiUsage = {
    inputTokens: message.usage.input_tokens ?? 0,
    outputTokens: message.usage.output_tokens ?? 0,
    cacheReadTokens: message.usage.cache_read_input_tokens ?? 0,
    cacheWriteTokens: message.usage.cache_creation_input_tokens ?? 0,
  };
  if (message.stop_reason === 'refusal') {
    throw new Error('La IA no quiso hacer este diseño. Prueba describiéndolo de otra forma.');
  }
  if (message.stop_reason === 'max_tokens') {
    throw new Error('La IA se quedó sin espacio para terminar. Pide menos láminas o un cambio más acotado.');
  }
  const text = message.content.map((b) => (b.type === 'text' ? b.text : '')).join('');
  try {
    return { data: JSON.parse(text) as T, usage, model: message.model };
  } catch {
    throw new Error('La IA devolvió una respuesta rota. Intenta de nuevo.');
  }
}

/* --- Esquemas ------------------------------------------------------------- */

const PLAN_SCHEMA = {
  type: 'object',
  properties: {
    reply: { type: 'string', description: 'Mensaje corto al dueño (1 a 3 frases): la idea y qué viene en cada lámina, a grandes rasgos.' },
    title: { type: 'string', description: 'Nombre corto del diseño (para la lista del Estudio).' },
    concept: { type: 'string', description: 'La idea creativa en 1 o 2 frases.' },
    css: { type: 'string', description: 'CSS compartido por todas las láminas (clases reutilizables).' },
    caption: { type: 'string', description: 'Texto de la publicación listo para pegar en Instagram, con 3 a 6 hashtags al final (incluye #MansionPlayroom). Sin links.' },
    slides: {
      type: 'array',
      description: 'Una entrada por lámina, en orden.',
      items: {
        type: 'object',
        properties: {
          brief: { type: 'string', description: 'Qué lleva esta lámina: textos exactos, composición, colores, qué clases del CSS usa y qué imagen (por su URL) si lleva.' },
        },
        required: ['brief'],
        additionalProperties: false,
      },
    },
  },
  required: ['reply', 'title', 'concept', 'css', 'caption', 'slides'],
  additionalProperties: false,
} as const;

const SLIDE_SCHEMA = {
  type: 'object',
  properties: { html: { type: 'string', description: 'El HTML completo de la lámina: un solo <div class="board ...">.' } },
  required: ['html'],
  additionalProperties: false,
} as const;

const EDIT_SCHEMA = {
  type: 'object',
  properties: {
    reply: { type: 'string', description: 'Mensaje corto al dueño (1 a 3 frases): qué cambiaste.' },
    operations: {
      type: 'array',
      description: 'Cambios a aplicar, en orden. Vacío si solo respondes una pregunta. Índices desde 0 (la lámina 1 es el índice 0).',
      items: {
        type: 'object',
        properties: {
          op: { type: 'string', enum: [...AI_OPS], description: 'set_slide reemplaza una lámina entera; insert_slide agrega una en `index`; delete_slide la borra; move_slide la mueve de `index` a `to`; set_css reemplaza TODO el CSS compartido; set_caption reemplaza el texto de la publicación.' },
          index: { type: 'integer', description: 'Lámina afectada (desde 0). -1 si no aplica.' },
          to: { type: 'integer', description: 'Solo move_slide: posición de destino. -1 si no aplica.' },
          html: { type: 'string', description: 'set_slide / insert_slide: el HTML COMPLETO de la lámina. Vacío si no aplica.' },
          css: { type: 'string', description: 'set_css: el CSS compartido COMPLETO. Vacío si no aplica.' },
          caption: { type: 'string', description: 'set_caption: el texto completo. Vacío si no aplica.' },
        },
        required: ['op', 'index', 'to', 'html', 'css', 'caption'],
        additionalProperties: false,
      },
    },
  },
  required: ['reply', 'operations'],
  additionalProperties: false,
} as const;

/* --- Contenido de los mensajes ------------------------------------------- */

function imageBlocks(urls: string[], offset = 0): Anthropic.Beta.BetaContentBlockParam[] {
  return urls.flatMap((url, i) => [
    { type: 'text' as const, text: `Imagen ${offset + i + 1} (${url}):` },
    { type: 'image' as const, source: { type: 'url' as const, url } },
  ]);
}

function designAsText(design: AiDesign): string {
  return [
    `Concepto: ${design.concept || '(sin concepto)'}`,
    'CSS compartido:',
    '```css',
    design.css,
    '```',
    ...design.slides.map((s, i) => [`Lámina ${i + 1} (índice ${i}):`, '```html', s.html, '```'].join('\n')),
    `Texto de la publicación:\n${design.caption}`,
  ].join('\n');
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}

/* --- Flujos ---------------------------------------------------------------- */

export type DesignerEvent =
  | { type: 'status'; text: string }
  | { type: 'plan'; title: string; concept: string; css: string; caption: string; count: number }
  | { type: 'slide'; index: number; html: string };

export interface TurnInput {
  design: AiDesign;
  /** Lo que escribió el dueño ahora. */
  message: string;
  /** Fotos adjuntas en ESTE mensaje (se le muestran a la IA). */
  images: string[];
  /** Todas las fotos de la conversación (la IA puede usar sus URLs). */
  allImages: string[];
  /** Conversación previa, en orden (solo texto). */
  history: { role: 'user' | 'assistant'; text: string }[];
  model: AiModel;
  signal?: AbortSignal;
  onEvent: (event: DesignerEvent) => void;
}

export interface TurnResult {
  design: AiDesign;
  reply: string;
  usage: AiUsage;
  /** Modelo que respondió (puede ser el de respaldo). */
  model: string;
}

/** Diseño desde cero: plan → láminas en paralelo. */
export async function createDesignTurn(input: TurnInput): Promise<TurnResult> {
  const facts = await eventFacts(input.design.eventId);
  const dynamic = dynamicSystem(input.design, facts, input.allImages);
  input.onEvent({ type: 'status', text: 'Pensando el concepto…' });

  const plan = await callJson<{ reply: string; title: string; concept: string; css: string; caption: string; slides: { brief: string }[] }>({
    model: input.model,
    dynamic,
    signal: input.signal,
    maxTokens: 24_000,
    schema: PLAN_SCHEMA,
    messages: [{
      role: 'user',
      content: [
        ...imageBlocks(input.images),
        { type: 'text', text: `${input.message}\n\nArma el plan del diseño: concepto, CSS compartido, qué va en cada lámina y el texto de la publicación.` },
      ],
    }],
  });

  const max = input.design.format === 'carrusel' ? AI_MAX_SLIDES : 1;
  const briefs = plan.data.slides.slice(0, max).map((s) => s.brief).filter(Boolean);
  if (briefs.length === 0) throw new Error('La IA no propuso ninguna lámina. Intenta describirlo de otra forma.');

  const css = cleanDesign({ ...input.design, css: plan.data.css, slides: [] }).css;
  input.onEvent({ type: 'plan', title: plan.data.title, concept: plan.data.concept, css, caption: plan.data.caption, count: briefs.length });

  let usage = plan.usage;
  const outline = briefs.map((b, i) => `${i + 1}. ${b}`).join('\n');
  const slides = await mapLimit(briefs, SLIDE_CONCURRENCY, async (brief, i) => {
    const res = await callJson<{ html: string }>({
      model: input.model,
      dynamic,
      signal: input.signal,
      maxTokens: 16_000,
      schema: SLIDE_SCHEMA,
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: `Pedido del dueño: ${input.message}` },
          { type: 'text', text: `Concepto: ${plan.data.concept}\n\nCSS compartido (ya definido, úsalo):\n\`\`\`css\n${css}\n\`\`\`\n\nPlan completo:\n${outline}\n\nEscribe ahora la lámina ${i + 1} de ${briefs.length}: ${brief}` },
        ],
      }],
    });
    usage = addUsage(usage, res.usage);
    const html = cleanDesign({ ...input.design, slides: [{ html: res.data.html }] }).slides[0]?.html ?? '';
    input.onEvent({ type: 'slide', index: i, html });
    return { html };
  });

  const design = cleanDesign({
    ...input.design,
    title: input.design.title === 'Diseño nuevo' && plan.data.title ? plan.data.title : input.design.title,
    concept: plan.data.concept,
    css: plan.data.css,
    caption: plan.data.caption,
    slides,
  });
  return { design, reply: plan.data.reply, usage, model: plan.model };
}

/** Ajuste de un diseño existente: devuelve operaciones y se aplican. */
export async function editDesignTurn(input: TurnInput): Promise<TurnResult> {
  const facts = await eventFacts(input.design.eventId);
  input.onEvent({ type: 'status', text: 'Haciendo los cambios…' });

  // La conversación previa como texto, y el diseño actual + las fotos nuevas
  // en el último mensaje (el diseño cambia en cada turno: va al final para no
  // romper el caché del prefijo).
  const history: Anthropic.Beta.BetaMessageParam[] = input.history.slice(-12).map((m) => ({ role: m.role, content: m.text || '(sin texto)' }));
  while (history.length && history[0].role !== 'user') history.shift();

  const res = await callJson<{ reply: string; operations: AiOp[] }>({
    model: input.model,
    dynamic: dynamicSystem(input.design, facts, input.allImages),
    signal: input.signal,
    maxTokens: 48_000,
    schema: EDIT_SCHEMA,
    messages: [
      ...history,
      {
        role: 'user',
        content: [
          { type: 'text', text: `Diseño actual:\n${designAsText(input.design)}` },
          ...imageBlocks(input.images, Math.max(0, input.allImages.length - input.images.length)),
          { type: 'text', text: `Pedido: ${input.message}` },
        ],
      },
    ],
  });

  const { design: applied, skipped } = applyAiOps(input.design, res.data.operations ?? []);
  const design = cleanDesign(applied);
  const reply = skipped > 0 ? `${res.data.reply} (${skipped} cambio${skipped === 1 ? '' : 's'} no se pudo aplicar.)` : res.data.reply;
  return { design, reply, usage: res.usage, model: res.model };
}

