/* Guion de Reel desde una idea (o desde una pieza reel del Plan de contenido):
 * 3 ganchos con su fórmula, las líneas con lo que se dice y el texto en
 * pantalla, y el cierre. La revisión (puntaje del gancho, tiempos) la hace
 * shared/reelScript.ts en el panel. No publica nada. */
import { invokeLLM, extractContent, NO_THINKING } from './_core/llm';
import { ENV } from './_core/env';
import { getSiteSettings } from './db';
import { buildEventFacts } from './winback';
import { buildPlayroomKnowledge, resolveTargetEvent } from './contentPlanner';
import { normalizeInstagramAgentConfig } from '../shared/instagramAgentConfig';
import { AI_PHRASES_PROMPT_LINE } from '../shared/aiPhrasesEs';
import { REEL_HOOK_FORMULAS, REEL_HOOK_IDS } from '../shared/reelHooks';
import { cleanAiMarks } from '../shared/captionCheck';

const REEL_MODEL = 'claude-sonnet-5';

const REEL_SCHEMA = {
  name: 'guion_reel',
  strict: true,
  schema: {
    type: 'object',
    properties: {
      hooks: {
        type: 'array',
        description: 'Exactamente 3 ganchos distintos para los primeros 2-3 segundos, cada uno con una fórmula diferente.',
        items: {
          type: 'object',
          properties: {
            formula: { type: 'string', enum: REEL_HOOK_IDS },
            say: { type: 'string', description: 'Lo que se dice, máximo 12 palabras.' },
            screen: { type: 'string', description: 'El texto en pantalla de ese momento, máximo 7 palabras.' },
          },
          required: ['formula', 'say', 'screen'],
          additionalProperties: false,
        },
      },
      beats: {
        type: 'array',
        description: 'Las líneas del guion DESPUÉS del gancho, en orden (3 a 8). Cada una, una sola idea.',
        items: {
          type: 'object',
          properties: {
            say: { type: 'string', description: 'Lo que se dice, natural y corto (máximo ~12 palabras).' },
            screen: { type: 'string', description: 'Texto en pantalla o qué se ve (máximo 7 palabras). Puede ir vacío.' },
          },
          required: ['say', 'screen'],
          additionalProperties: false,
        },
      },
      shots: { type: 'string', description: 'Qué grabar, plano por plano, en 2-4 frases, posible con un celular y sin mostrar a personas del público.' },
      caption: { type: 'string', description: 'Texto para el post del reel, 100-300 caracteres, sin URLs (di "link en la bio").' },
    },
    required: ['hooks', 'beats', 'shots', 'caption'],
    additionalProperties: false,
  },
} as const;

const SYSTEM_PROMPT = [
  AI_PHRASES_PROMPT_LINE,
  'Eres el guionista de Reels de Mansion Playroom, productora de fiestas liberales en Valparaíso / Viña del Mar, Chile (+18). Escribes en español chileno, para decirlo en voz alta: frases cortas, naturales, como habla una persona.',
  'Un Reel se decide en los primeros 2-3 segundos. El gancho tiene que decir algo concreto (un dato, una pregunta real, una sorpresa) y NUNCA empezar saludando ("hola chicos"), anunciando ("en este video les voy a contar") ni pidiendo atención ("deja de scrollear").',
  'Fórmulas de gancho disponibles (usa una distinta en cada uno de los 3 ganchos):',
  ...REEL_HOOK_FORMULAS.map((f) => `- ${f.id} (${f.name}): ${f.template}. Ej: ${f.example}`),
  'Las líneas del guion: una idea por línea, 15 a 40 segundos en total. La última línea pide UNA sola cosa (comentar algo concreto, guardar, etiquetar) y, si puedes, repite una palabra del gancho para que lo vuelvan a ver.',
  'Reglas de contenido: nada sexual explícito ni doble sentido grueso; la marca habla de respeto, consentimiento y libertad. Nunca muestres ni insinúes a personas concretas del público. No inventes shows, invitados, premios, cifras ni precios: usa SOLO los datos entregados. Si te falta un dato, escribe {{tu dato}} para que el dueño lo complete.',
].join('\n');

export interface ReelScriptResult {
  hooks: Array<{ formula: string; say: string; screen: string }>;
  beats: Array<{ say: string; screen: string }>;
  shots: string;
  caption: string;
}

const s = (v: unknown, max: number) => cleanAiMarks(typeof v === 'string' ? v.trim().slice(0, max) : '');

export async function generateReelScript(input: { idea: string; targetEventId?: number }): Promise<ReelScriptResult> {
  const idea = input.idea.replace(/\s+/g, ' ').trim().slice(0, 1200);
  if (!idea) throw new Error('Escribe la idea del reel.');
  const event = await resolveTargetEvent(input.targetEventId).catch(() => null);
  const settings = await getSiteSettings();
  const brand = normalizeInstagramAgentConfig((settings as any)?.instagramAgentConfig);
  const userContent = [
    `IDEA DEL REEL: ${idea}`,
    '',
    ...(event ? ['DATOS REALES DEL PRÓXIMO EVENTO:', await buildEventFacts(event), ''] : []),
    'CONTEXTO DE LA MARCA (lo escribió el dueño, respétalo):',
    brand.brandNotes,
    ...(brand.styleExamples.trim() ? ['', 'CÓMO ESCRIBE EL DUEÑO (imita este tono):', brand.styleExamples] : []),
    '',
    'LO QUE PLAYROOM YA EXPLICA EN SU SITIO (no lo contradigas):',
    buildPlayroomKnowledge(),
  ].join('\n');

  const result = await invokeLLM({
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userContent },
    ],
    responseFormat: { type: 'json_schema', json_schema: REEL_SCHEMA as any },
    maxTokens: 3000,
    ...(ENV.anthropicApiKey ? { model: REEL_MODEL, thinking: NO_THINKING } : {}),
  });
  const parsed = JSON.parse(extractContent(result.choices[0]?.message ?? { content: '' })) as Record<string, any>;
  const hooks = (Array.isArray(parsed.hooks) ? parsed.hooks : [])
    .map((h: any) => ({ formula: REEL_HOOK_IDS.includes(h?.formula) ? h.formula : 'libre', say: s(h?.say, 160), screen: s(h?.screen, 80) }))
    .filter((h: { say: string }) => h.say)
    .slice(0, 3);
  const beats = (Array.isArray(parsed.beats) ? parsed.beats : [])
    .map((b: any) => ({ say: s(b?.say, 200), screen: s(b?.screen, 80) }))
    .filter((b: { say: string }) => b.say)
    .slice(0, 10);
  if (hooks.length === 0 || beats.length === 0) throw new Error('La IA no devolvió un guion válido. Intenta de nuevo.');
  return { hooks, beats, shots: s(parsed.shots, 800), caption: s(parsed.caption, 600) };
}
