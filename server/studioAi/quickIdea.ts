import { quickJson } from './quickCall';
import { TONO_DE_VOZ } from './brandPack';
import { eventFacts } from './designer';
import type { AiModel, AiUsage } from '../../shared/studioAi';
import type { StudioVideo, VideoFormat } from '../../shared/studioVideo';
import { photoBriefFromQuickData, videoFromQuickData, type QuickPhotoData, type QuickVideoData } from '../../shared/studioAiIdea';
import { emptyPhotoBrief, type PhotoBrief } from '../../shared/studioVariants';

/* «Desde una idea» del Estudio: Claude SOLO escribe (las escenas de un video,
 * o los textos de una foto) y las plantillas y HyperFrames dibujan y graban.
 * No hay generación de imágenes: lo visual sale de la marca, de tus fotos y
 * de los videos de HyperFrames. Usa la misma conexión de Claude y el mismo
 * conteo de gasto que el modo «Rápido» (server/studioAi/quick.ts). */

const RULES = `Hablas por Mansion Playroom, productora de fiestas liberales +18 en Viña del Mar y Valparaíso. No dibujas ni generas imágenes: solo escribes, y las plantillas y el editor de video lo dibujan.

Reglas generales:
- Pocas palabras y una sola idea por pieza o escena; que se entienda en 1 segundo y SIN sonido.
- Nunca inventes fechas, horas, precios, nombres ni lugares: usa solo los datos reales del evento. La dirección exacta nunca se publica.
- Sin groserías ni sexualización explícita: la picardía es sugerida. El consentimiento y el respeto no se bromean.
- No nombres, describas ni etiquetes a las personas de una foto (ni su cuerpo, edad o aspecto): habla de la fiesta, el ambiente y la invitación.
- Máximo 1 emoji por texto, y solo si suma.

${TONO_DE_VOZ}`;

const VIDEO_SYSTEM = `${RULES}

Escribes un video corto de texto animado (sin voz) para Reels o historias:
- Escena 1 = el gancho: una pregunta o afirmación que genera curiosidad, de 2 a 6 palabras (el campo title puede partir líneas con \\n, hasta 3 líneas). Dura 3 segundos.
- Cada escena siguiente: un título corto (2 a 6 palabras) y, si ayuda, una etiqueta corta (máximo 8 palabras). Entre 2 y 3,5 segundos cada una.
- El cierre NO es una escena: va aparte en ctaLine (frase corta, ej. «¿Vienes?») y cta (botón, ej. «Entradas en mansionplayroom.cl» o «Comenta PLAYROOM»).
- numbered = true solo si las escenas son pasos o puntos de una lista (se numeran 1, 2, 3...); false si cuentan algo corrido.
- caption: texto de la publicación, 100 a 300 caracteres, con 3 a 6 hashtags al final (incluye #MansionPlayroom). Sin links: di «link en la bio».`;

const VIDEO_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string', description: 'Nombre corto del video (para la lista del Estudio).' },
    caption: { type: 'string' },
    numbered: { type: 'boolean' },
    scenes: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          body: { type: 'string', description: 'Etiqueta corta o vacío.' },
          secs: { type: 'number', description: 'Segundos en pantalla (2 a 3,5; el gancho 3).' },
        },
        required: ['title', 'body', 'secs'],
        additionalProperties: false,
      },
    },
    ctaLine: { type: 'string' },
    cta: { type: 'string' },
  },
  required: ['title', 'caption', 'numbered', 'scenes', 'ctaLine', 'cta'],
  additionalProperties: false,
} as const;

export interface QuickVideoInput {
  brief: string;
  format: VideoFormat;
  eventId: number | null;
  model: AiModel;
  sceneCount: number;
}

export interface QuickVideoResult {
  video: StudioVideo;
  usage: AiUsage;
  costUsd: number;
  model: string;
}

export async function quickVideoFromIdea(input: QuickVideoInput): Promise<QuickVideoResult> {
  const facts = await eventFacts(input.eventId);
  const count = Math.max(2, Math.min(8, input.sceneCount));
  const { data, usage, costUsd, model } = await quickJson<QuickVideoData>({
    model: input.model,
    system: VIDEO_SYSTEM,
    facts: `Datos reales del evento (no inventes fechas ni precios):\n${facts}`,
    content: `Idea: ${input.brief}\nEscenas (sin contar el cierre): ${count}\nFormato: ${input.format === 'reel' ? 'Reel o historia 9:16' : 'Feed 3:4'}`,
    schema: VIDEO_SCHEMA as unknown as Record<string, unknown>,
    maxTokens: 2000,
    refusal: 'La IA no quiso hacer este video. Prueba describiéndolo de otra forma.',
    tooLong: 'La IA se quedó sin espacio. Pide menos escenas.',
  });
  const video = videoFromQuickData(data, { format: input.format, eventId: input.eventId });
  if (!video) throw new Error('La IA no armó ninguna escena. Intenta de nuevo.');
  return { video, usage, costUsd, model };
}

/* --- Textos para una foto ------------------------------------------------- */

const PHOTO_SYSTEM = `${RULES}

Escribes los textos de una pieza de Instagram (feed 3:4 o historia 9:16) hecha con una foto propia de fondo:
- title: titular muy corto (2 a 6 palabras; puede partir líneas con \\n).
- body: etiqueta corta de apoyo (máximo 8 palabras), por ejemplo el día y la hora reales del evento o una frase breve.
- cta: botón (máximo 4 palabras), ej. «Comenta PLAYROOM» o «Entradas en mansionplayroom.cl».
- footnote: texto chico (máximo 6 palabras) o vacío.
- caption: texto de la publicación, 100 a 300 caracteres, con 3 a 6 hashtags al final (incluye #MansionPlayroom). Sin links: di «link en la bio».
Si recibes una foto, úsala solo para captar el ambiente, los colores y la energía; no describas a nadie.`;

const PHOTO_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    body: { type: 'string' },
    cta: { type: 'string' },
    footnote: { type: 'string' },
    caption: { type: 'string' },
  },
  required: ['title', 'body', 'cta', 'footnote', 'caption'],
  additionalProperties: false,
} as const;

export interface QuickPhotoInput {
  brief: string;
  /** Foto de fondo (https): Claude la mira para captar el ambiente. */
  imageUrl: string;
  eventId: number | null;
  model: AiModel;
}

export interface QuickPhotoResult {
  texts: Pick<PhotoBrief, 'title' | 'body' | 'cta' | 'footnote' | 'caption'>;
  usage: AiUsage;
  costUsd: number;
  model: string;
}

export async function quickPhotoTexts(input: QuickPhotoInput): Promise<QuickPhotoResult> {
  const facts = await eventFacts(input.eventId);
  const hasPhoto = /^https:\/\//i.test(input.imageUrl);
  const content = hasPhoto
    ? [
      { type: 'text', text: 'La foto de fondo:' },
      { type: 'image', source: { type: 'url', url: input.imageUrl } },
      { type: 'text', text: `Idea: ${input.brief}` },
    ]
    : `Idea: ${input.brief}\n(Todavía no hay foto.)`;
  const { data, usage, costUsd, model } = await quickJson<QuickPhotoData>({
    model: input.model,
    system: PHOTO_SYSTEM,
    facts: `Datos reales del evento (no inventes fechas ni precios):\n${facts}`,
    content,
    schema: PHOTO_SCHEMA as unknown as Record<string, unknown>,
    maxTokens: 1200,
    refusal: 'La IA no quiso escribir sobre esta foto. Prueba con otra o cambia la idea.',
    tooLong: 'La IA se quedó sin espacio. Pide algo más corto.',
  });
  const next = photoBriefFromQuickData(data, emptyPhotoBrief());
  return { texts: { title: next.title, body: next.body, cta: next.cta, footnote: next.footnote, caption: next.caption }, usage, costUsd, model };
}
