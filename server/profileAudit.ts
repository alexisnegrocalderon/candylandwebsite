/* "Revisar mi perfil" de Instagram: la IA puntúa el perfil contra la rúbrica
 * de shared/profileRubric.ts, propone 3 bios y arreglos en orden de impacto.
 * El total lo suma el código. No cambia nada en Instagram. */
import { invokeLLM, extractContent, NO_THINKING } from './_core/llm';
import { ENV } from './_core/env';
import { getFeaturedEvent } from './db';
import { buildEventFacts } from './winback';
import { buildPlayroomKnowledge } from './contentPlanner';
import { EVENT_BRAND } from '../shared/eventBrand';
import { AI_PHRASES_PROMPT_LINE } from '../shared/aiPhrasesEs';
import { PROFILE_RUBRIC, scoreProfile, type AuditItemScore, type AuditLevel } from '../shared/profileRubric';
import { cleanAiMarks, humanizeEs } from '../shared/captionCheck';

const AUDIT_MODEL = 'claude-sonnet-5';
const BIO_MAX_CHARS = 150;

const AUDIT_SCHEMA = {
  name: 'revision_perfil_instagram',
  strict: true,
  schema: {
    type: 'object',
    properties: {
      items: {
        type: 'array',
        description: 'Un elemento por cada criterio de la rúbrica, con su puntaje.',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string', enum: PROFILE_RUBRIC.map((i) => i.id) },
            score: { type: 'integer', description: 'Puntaje de 0 al máximo del criterio.' },
            note: { type: 'string', description: 'Qué se ve bien o qué falla, en una frase concreta. Si no se pudo ver (ej. no hay captura), dilo.' },
          },
          required: ['id', 'score', 'note'],
          additionalProperties: false,
        },
      },
      summary: { type: 'string', description: 'Qué es lo más importante a mejorar, en 2-3 frases directas al dueño.' },
      bios: { type: 'array', items: { type: 'string' }, description: `Exactamente 3 bios alternativas de máximo ${BIO_MAX_CHARS} caracteres cada una, con saltos de línea y como mucho 2 emojis.` },
      fixes: { type: 'array', items: { type: 'string' }, description: 'Hasta 6 arreglos concretos, ordenados de mayor a menor impacto en el puntaje.' },
    },
    required: ['items', 'summary', 'bios', 'fixes'],
    additionalProperties: false,
  },
} as const;

const SYSTEM_PROMPT = [
  AI_PHRASES_PROMPT_LINE,
  'Eres el consultor de perfil de Instagram de Mansion Playroom, productora de fiestas liberales en Valparaíso / Viña del Mar, Chile (+18). Le hablas al dueño: directo, en español chileno.',
  'Puntúa el perfil criterio por criterio con esta rúbrica (cada puntaje entre 0 y su máximo; sé exigente y justo: el máximo solo si de verdad cumple):',
  ...PROFILE_RUBRIC.map((i) => `- ${i.id} (máx. ${i.max}): ${i.label}. ${i.look}`),
  'Si un dato no viene (bio, link, destacadas, captura), NO lo inventes: puntúa solo lo que se ve o se sabe y dilo en la nota. Sin captura no se puede ver la foto, los fijados ni la grilla: dales un puntaje prudente y dilo.',
  `Las 3 bios nuevas: máximo ${BIO_MAX_CHARS} caracteres, dicen qué es, dónde y la próxima fecha con los datos reales entregados (nunca inventes fechas, precios ni shows), con una sola invitación clara. Nada sexual explícito: la marca habla de respeto, consentimiento y libertad.`,
  'Los arreglos van en orden de impacto en el puntaje, cada uno accionable en menos de 10 minutos.',
].join('\n');

export interface ProfileInput {
  username: string;
  name: string;
  bio: string;
  link: string;
  followers?: number;
  posts?: number;
  highlights: string[];
  screenshotUrl?: string;
}

export interface ProfileAuditResult {
  generatedAt: string;
  items: AuditItemScore[];
  total: number;
  level: AuditLevel;
  summary: string;
  bios: string[];
  fixes: string[];
}

const clip = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

export async function generateProfileAudit(input: ProfileInput, now: Date = new Date()): Promise<ProfileAuditResult> {
  const event = await getFeaturedEvent();
  const facts = event ? await buildEventFacts(event) : '(no hay un evento destacado publicado)';
  const lines = [
    'PERFIL ACTUAL (lo que el dueño cargó):',
    `- Usuario: ${clip(input.username, 60) || '(no cargado)'}`,
    `- Nombre del perfil: ${clip(input.name, 100) || '(no cargado)'}`,
    `- Bio: ${clip(input.bio, 400) || '(no cargada)'}`,
    `- Link de la bio: ${clip(input.link, 300) || '(no cargado)'}`,
    ...(input.followers != null ? [`- Seguidores: ${input.followers}`] : []),
    ...(input.posts != null ? [`- Publicaciones: ${input.posts}`] : []),
    `- Historias destacadas: ${input.highlights.map((h) => clip(h, 40)).filter(Boolean).join(', ') || '(no cargadas)'}`,
    `- Captura del perfil: ${input.screenshotUrl ? 'sí, adjunta' : 'no'}`,
    '',
    'PRÓXIMO EVENTO (datos reales para las bios):',
    facts,
    `- Dress code: ${EVENT_BRAND.dressCode}`,
    '',
    'LO QUE PLAYROOM EXPLICA EN SU SITIO (el perfil debe ser coherente con esto):',
    buildPlayroomKnowledge(),
  ];
  const userContent = input.screenshotUrl
    ? [{ type: 'text' as const, text: lines.join('\n') }, { type: 'image_url' as const, image_url: { url: input.screenshotUrl } }]
    : lines.join('\n');

  const result = await invokeLLM({
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userContent },
    ],
    responseFormat: { type: 'json_schema', json_schema: AUDIT_SCHEMA as any },
    maxTokens: 4000,
    ...(ENV.anthropicApiKey ? { model: AUDIT_MODEL, thinking: NO_THINKING } : {}),
  });
  const parsed = JSON.parse(extractContent(result.choices[0]?.message ?? { content: '' })) as Record<string, unknown>;
  const { items, total, level } = scoreProfile(parsed.items);
  const bios = (Array.isArray(parsed.bios) ? parsed.bios : [])
    .filter((b): b is string => typeof b === 'string' && b.trim().length > 0)
    .map((b) => humanizeEs(b.trim()).cleaned)
    .map((b) => Array.from(b).slice(0, BIO_MAX_CHARS).join(''))
    .slice(0, 3);
  if (items.every((i) => i.score === 0) && bios.length === 0) throw new Error('La IA no devolvió una revisión válida. Intenta de nuevo.');
  return {
    generatedAt: now.toISOString(),
    items: items.map((i) => ({ ...i, note: cleanAiMarks(i.note) })),
    total,
    level,
    summary: cleanAiMarks(clip(parsed.summary, 800)),
    bios,
    fixes: (Array.isArray(parsed.fixes) ? parsed.fixes : []).filter((f): f is string => typeof f === 'string' && f.trim().length > 0).map((f) => cleanAiMarks(f.trim().slice(0, 300))).slice(0, 6),
  };
}
