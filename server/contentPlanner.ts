import { invokeLLM, extractContent } from './_core/llm';
import { ENV } from './_core/env';
import { getEventById, getFeaturedEvent, getSiteSettings, listActiveIgKeywordAutomations } from './db';
import { buildEventFacts } from './winback';
import { normalizeInstagramAgentConfig } from '../shared/instagramAgentConfig';
import { EVENT_BRAND } from '../shared/eventBrand';
import { formatChileDate } from '../shared/chileDate';
import {
  CONTENT_FORMATS,
  CONTENT_GOALS,
  CONTENT_PLAN_MAX_PER_DAY,
  chileIsoDate,
  cleanContentPieces,
  contentPlanWindow,
  type ContentPlan,
} from '../shared/contentPlan';

/* Plan de contenido para Instagram (plan del 02/10): un calendario de
 * publicaciones hasta el próximo evento, con el texto listo para copiar, qué
 * grabar y cuándo publicar, alineado con los datos REALES del evento (fecha,
 * precio, cambio de tanda) y con el tono de marca del agente de DMs.
 *
 * No publica nada ni toca Instagram: es un borrador para que el dueño lo
 * copie. Las fechas las valida el código (shared/contentPlan.ts), no la IA. */

// Mismo criterio que el coach y el Director comercial: se genera a pedido, no
// en cada mensaje, y la calidad del texto es justo lo que importa.
const PLAN_MODEL = 'claude-sonnet-5';

const PLAN_SCHEMA = {
  name: 'plan_contenido_instagram',
  strict: true,
  schema: {
    type: 'object',
    properties: {
      summary: { type: 'string', description: 'La idea del plan en 2 a 3 frases, en español chileno, directo al dueño: cómo se cuenta la historia hasta la fiesta.' },
      pieces: {
        type: 'array',
        description: 'Las publicaciones, en orden cronológico.',
        items: {
          type: 'object',
          properties: {
            date: { type: 'string', description: 'Día de publicación, formato YYYY-MM-DD, DENTRO de la ventana indicada.' },
            time: { type: 'string', description: 'Hora sugerida en formato HH:MM (24 horas, hora de Chile).' },
            format: { type: 'string', enum: [...CONTENT_FORMATS] },
            goal: { type: 'string', enum: [...CONTENT_GOALS], description: 'awareness = que más gente conozca la fiesta; confianza = bajar nervios y explicar cómo es; urgencia = hay algo real que se acaba; conversion = empujar a comprar.' },
            hook: { type: 'string', description: 'La primera línea que frena el scroll (en un reel, lo que se dice o se lee en los primeros 2 segundos).' },
            caption: { type: 'string', description: 'El texto completo listo para copiar y pegar. Sin links ni URLs. Español chileno, cercano.' },
            visual: { type: 'string', description: 'Qué grabar o fotografiar, concreto y posible de hacer con un celular.' },
            hashtags: { type: 'array', items: { type: 'string' }, description: 'De 3 a 6 hashtags, incluido #MansionPlayroom.' },
            keyword: { type: 'string', description: 'Solo en historias: una palabra clave de la lista entregada para que respondan a la historia, o vacío.' },
          },
          required: ['date', 'time', 'format', 'goal', 'hook', 'caption', 'visual', 'hashtags', 'keyword'],
          additionalProperties: false,
        },
      },
    },
    required: ['summary', 'pieces'],
    additionalProperties: false,
  },
} as const;

const SYSTEM_PROMPT = [
  'Eres el estratega de contenido de Mansion Playroom, una productora de fiestas liberales en Valparaíso / Viña del Mar, Chile. Le hablas al dueño: directo, en español chileno.',
  'Armas el calendario de publicaciones de Instagram (@mansionplayroom.cl) hasta el próximo evento. Cada pieza trae el texto listo para copiar, qué grabar y a qué hora publicar.',
  'Reglas de contenido: nada sexual explícito ni doble sentido grueso -- la marca habla de respeto, consentimiento y libertad, y es solo para mayores de 18. Nunca muestres ni insinúes a personas concretas del público. No inventes shows, invitados, premios ni precios: usa SOLO los datos reales entregados.',
  'Urgencia: solo si es real (el precio de la tanda sube en una fecha concreta, quedan cupos limitados) y dicha como un dato útil, una o dos veces en todo el plan -- nunca "última oportunidad" en cada pieza ni desesperación.',
  `Ritmo: unas 4 o 5 piezas por semana, máximo ${CONTENT_PLAN_MAX_PER_DAY} por día y solo en la última semana (cuenta regresiva). Mezcla reels (para que llegue gente nueva), historias (cercanía y urgencia) y posts.`,
  'Arco: las primeras semanas, awareness y confianza (cómo es la fiesta, consentimiento, primera vez, ideas de disfraz); la última semana, urgencia y conversión; el día del evento, la pieza de "es hoy".',
  'Captions: entre 100 y 400 caracteres, sin ninguna URL ni dirección web (si hay que mandar a comprar, di "link en la bio"). Sin markdown. Como mucho un emoji por pieza.',
  'Palabras clave: SOLO en historias, y SOLO de la lista entregada (se activan cuando la persona RESPONDE a la historia con esa palabra y le llega un DM automático). En posts y reels NO pidas "comenta X": esa vía todavía no funciona. Si la lista está vacía, deja `keyword` vacío en todas.',
  'Las fechas de cada pieza tienen que estar DENTRO de la ventana indicada y en formato YYYY-MM-DD.',
].join('\n');

async function resolveTargetEvent(targetEventId: number | undefined) {
  const event = targetEventId ? await getEventById(targetEventId) : await getFeaturedEvent();
  if (!event) throw new Error('No hay ningún evento publicado para planificar.');
  return event;
}

/** Arma el pedido para la IA: ventana de fechas, datos reales del evento,
 * tono de marca y palabras clave activas. Exportada para probarla. */
export async function buildPlanRequest(targetEventId: number | undefined, now: Date) {
  const event = await resolveTargetEvent(targetEventId);
  const window = contentPlanWindow(now, new Date(event.eventDate));
  if (!window) throw new Error(`"${event.title}" es hoy o ya pasó: no queda tiempo para planificar publicaciones.`);

  const settings = await getSiteSettings();
  const brand = normalizeInstagramAgentConfig((settings as any)?.instagramAgentConfig);
  const keywords = (await listActiveIgKeywordAutomations())
    .filter((a) => a.triggerSource !== 'comment') // "comentar" no dispara nada todavía
    .map((a) => a.keyword);

  const today = chileIsoDate(now);
  const weekday = (iso: string) => formatChileDate(new Date(`${iso}T15:00:00Z`), { withWeekday: true });
  const lines = [
    `Hoy es ${weekday(today)} (${today}).`,
    `Ventana para planificar: del ${window.from} (${weekday(window.from)}) al ${window.to} (${weekday(window.to)}), ${window.days} días. El evento es el ${chileIsoDate(new Date(event.eventDate))}.`,
    '',
    'DATOS REALES DEL EVENTO:',
    await buildEventFacts(event),
    `- Dress code: ${EVENT_BRAND.dressCode}`,
    '',
    'CONTEXTO DE LA MARCA (lo escribió el dueño, respétalo):',
    brand.brandNotes,
    ...(brand.styleExamples.trim() ? ['', 'CÓMO ESCRIBE EL DUEÑO (imita este tono):', brand.styleExamples] : []),
    '',
    `PALABRAS CLAVE ACTIVAS PARA HISTORIAS: ${keywords.length > 0 ? keywords.join(', ') : '(ninguna)'}`,
  ];
  return { event, window, keywords, userContent: lines.join('\n') };
}

/** Genera el plan. Devuelve el plan ya limpio: las piezas con fecha inventada
 * o fuera de ventana se descartan acá. No guarda nada (el panel lo recuerda en
 * el navegador). */
export async function generateContentPlan(targetEventId: number | undefined, now: Date = new Date()): Promise<ContentPlan> {
  const { event, window, keywords, userContent } = await buildPlanRequest(targetEventId, now);

  const result = await invokeLLM({
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userContent },
    ],
    responseFormat: { type: 'json_schema', json_schema: PLAN_SCHEMA as any },
    maxTokens: 8000,
    ...(ENV.anthropicApiKey ? { model: PLAN_MODEL } : {}),
  });

  const parsed = JSON.parse(extractContent(result.choices[0]?.message ?? { content: '' })) as Record<string, unknown>;
  // La palabra clave solo vale en historias y solo si es de una automatización
  // activa de verdad: si la IA se inventa una, se borra (una palabra que no
  // dispara nada deja a la persona hablándole al aire).
  const allowed = new Set(keywords.map((k) => k.trim().toLowerCase()));
  const pieces = cleanContentPieces(parsed.pieces, window).map((p) => ({
    ...p,
    keyword: p.format === 'historia' && allowed.has(p.keyword.trim().toLowerCase()) ? p.keyword.trim() : '',
  }));
  if (pieces.length === 0) throw new Error('La IA no devolvió ninguna publicación válida. Intenta de nuevo.');

  return {
    generatedAt: now.toISOString(),
    eventId: event.id,
    eventTitle: event.title,
    eventDate: new Date(event.eventDate).toISOString(),
    from: window.from,
    to: window.to,
    summary: typeof parsed.summary === 'string' ? parsed.summary.trim().slice(0, 1500) : '',
    pieces,
  };
}
