import { getEventById, getFeaturedEvent } from './db';
import { buildEventFacts } from './winback';
import { quickJson } from './studioAi/quickCall';
import { TONO_DE_VOZ } from './studioAi/brandPack';
import { AI_PHRASES_PROMPT_LINE } from '../shared/aiPhrasesEs';
import { ALL_LAYOUT_KEYS, LAYOUT_AUTO, LAYOUTS, randomSeed } from '../shared/motionVariety';
import { chileIsoDate } from '../shared/contentPlan';
import {
  MOTION_ACCENTS, MOTION_BASES, MOTION_CARDS, MOTION_MAX_SCENES, MOTION_MUSIC, MOTION_STYLES, MOTION_TEMPLATES, normalizeKeyword, normalizeMotionSpec,
  type MotionFormat, type MotionMedia, type MotionSpec, type MotionStyle, type MotionTemplate,
} from '../shared/motionSpec';
import type { AiUsage } from '../shared/studioAi';

/* Dirección de arte con IA del Estudio Motion: UNA llamada a Sonnet devuelve
 * las 3 variantes (liquid, glitch y editorial) de un mismo video, con guion,
 * ritmo, color de fondo y música elegidos de la biblioteca. Remotion dibuja
 * todo lo demás sin gastar IA.
 *
 * Para gastar poco: las reglas y la biblioteca van en un system fijo con
 * caché (después de la primera llamada se cobran a un 10 %), los datos del
 * evento van aparte, el razonamiento va en «bajo» y la salida es JSON corto. */

export const MOTION_AI_MODEL = 'claude-sonnet-5-5' as const;

const SCENE_SCHEMA = {
  type: 'object',
  properties: {
    kicker: { type: 'string', description: 'Etiqueta corta en mayúsculas sobre el texto (≤ 3 palabras) o vacío.' },
    text: { type: 'string', description: 'El texto grande. 5 palabras o menos (máximo 7 en la última escena).' },
    highlight: { type: 'string', description: 'Una palabra (o dos seguidas) de `text` que va en el color protagonista, o vacío.' },
    sub: { type: 'string', description: 'Bajada opcional, máximo 9 palabras, o vacío.' },
    say: { type: 'string', description: 'Lo que diría una voz en off en esta escena (frase natural, ≤ 16 palabras). Vacío si no hace falta.' },
    secs: { type: 'number', description: 'Segundos en pantalla, de 1.2 a 3.5.' },
    mediaIndex: { type: 'integer', description: 'Índice de la foto/clip entregado que va de fondo en esta escena, o -1 para ninguno.' },
    layout: { type: 'string', enum: [LAYOUT_AUTO, ...ALL_LAYOUT_KEYS], description: 'Composición de la escena, SOLO una de las del estilo de esta variante (ver el catálogo). Varía de una escena a otra; "auto" si no importa.' },
    card: { type: 'string', enum: [...MOTION_CARDS], description: 'Solo en softui: tarjeta de vidrio de la escena. En los demás estilos, "ninguna".' },
    items: { type: 'array', items: { type: 'string' }, description: 'Solo para tarjetas checklist (ítems), chat (mensajes, alternando quién habla) o evento (2-3 datos cortos). Máximo 5, cortos. Si no, lista vacía.' },
  },
  required: ['kicker', 'text', 'highlight', 'sub', 'say', 'secs', 'mediaIndex', 'layout', 'card', 'items'],
  additionalProperties: false,
} as const;

const VARIANT_SCHEMA = {
  type: 'object',
  properties: {
    style: { type: 'string', enum: MOTION_STYLES.filter((st) => st !== 'custom') },
    base: { type: 'string', enum: [...MOTION_BASES], description: 'Fondo: azul (celeste), rosa o tinta (de marca); perla o niebla (neutros editoriales); noche (PLAYMORE, fiesta).' },
    accent: { type: 'string', enum: [...MOTION_ACCENTS], description: 'Color protagonista (distinto del fondo). Oro solo con noche.' },
    music: { type: 'string', enum: MOTION_MUSIC.filter((m) => m !== 'none') },
    scenes: { type: 'array', items: SCENE_SCHEMA, description: `De 2 a ${MOTION_MAX_SCENES - 4} escenas.` },
  },
  required: ['style', 'base', 'accent', 'music', 'scenes'],
  additionalProperties: false,
} as const;

const OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string', description: 'Nombre interno del video (para la lista del panel), ≤ 6 palabras.' },
    caption: { type: 'string', description: 'Caption para Instagram: 100 a 350 caracteres, sin links ni "en la bio"; para pedir algo, invita a comentar una palabra clave (ej. "comenta INFO") y se envía todo por mensaje. Máx. 1 emoji, 3 a 5 hashtags al final incluido #MansionPlayroom.' },
    template: { type: 'string', enum: [...MOTION_TEMPLATES] },
    countdownValue: { type: 'integer', description: 'Solo countdown: el número grande (días u horas que faltan). 0 en otras plantillas.' },
    countdownUnit: { type: 'string', description: 'Solo countdown: DÍAS u HORAS. Vacío en otras.' },
    outroLine: { type: 'string', description: 'Línea corta bajo el logo en la firma final (ej. "Comenta INFO", "Sábado 14 · Valparaíso"), ≤ 5 palabras. Nunca "en la bio" ni "link en la bio".' },
    variants: { type: 'array', items: VARIANT_SCHEMA, description: 'Exactamente 3, cada una con un estilo DISTINTO: los 3 que mejor calcen con el pedido. Mismo mensaje, distinto guion y ritmo según el estilo.' },
  },
  required: ['title', 'caption', 'template', 'countdownValue', 'countdownUnit', 'outroLine', 'variants'],
  additionalProperties: false,
} as const;

/** El catálogo de composiciones de cada estilo, para el system (fijo: va en caché). */
const LAYOUT_CATALOG = (Object.keys(LAYOUTS) as Array<keyof typeof LAYOUTS>)
  .map((style) => `${style}: ${LAYOUTS[style].map((l) => `${l.key} (${l.label.toLowerCase()})`).join(', ')}`)
  .join('; ');

/** Fijo entre llamadas (va en caché): reglas de marca, biblioteca y ejemplo. */
export const MOTION_SYSTEM = [
  AI_PHRASES_PROMPT_LINE,
  'Eres el director creativo de motion graphics de Mansion Playroom (fiestas liberales +18 en Valparaíso / Viña del Mar, Chile). Escribes el GUION y eliges la DIRECCIÓN DE ARTE de videos verticales para Instagram. Un motor de plantillas (Remotion) los anima: tú no dibujas nada, solo eliges de la biblioteca y escribes los textos.',
  '',
  'TONO DE MARCA (respétalo al pie de la letra):',
  TONO_DE_VOZ,
  '',
  'REGLAS DE CONTENIDO: solo hablas de la fiesta que aparece en DATOS REALES DEL EVENTO. Nunca menciones disfraces obligatorios, aniversarios, dress codes ni fechas de fiestas anteriores: no existen para este video salvo que estén en esos datos. nada sexual explícito ni doble sentido grueso. Respeto, consentimiento y libertad. Nunca inventes shows, invitados, premios, precios ni horarios: usa SOLO los datos entregados. Nunca publiques la dirección exacta (di "Valparaíso" o "dirección al comprar").',
  '',
  'RITMO (lo que ya funciona en los reels de la marca):',
  '- Gancho en el PRIMER segundo: la escena 1 frena el scroll con una pregunta o una afirmación que rompe un prejuicio.',
  '- Una idea por escena, 5 palabras o menos en `text`. 1,2 a 2,5 s por escena (hasta 3,5 si hay bajada). Total entre 6 y 18 s.',
  '- Cierre: la última escena es la acción (invitar a comentar una palabra clave y se les envía todo, etiquetar a alguien). Después viene sola la firma animada de la marca: no la escribas como escena.',
  '- `highlight`: la palabra que carga el sentido, máximo una por escena, y no en todas.',
  '',
  'BIBLIOTECA:',
  '- Plantillas: anuncio (texto cinético sobre fondo de marca; para anunciar evento, explicar, invitar), countdown (escena 1 = número grande con su unidad, `text` de la escena 1 es la frase bajo el número, ej. "para la noche"; `kicker` = "FALTAN"; usa los días reales hasta el evento), montaje (fotos/clips reales de fondo con texto abajo; asigna cada foto entregada con `mediaIndex`, una por escena, sin repetir), sting (solo la firma de marca, 1 escena con `sub` como frase).',
  '- Estilos (eliges 3 distintos de 5; si el pedido es hablar de un tema, explicar o educar, kinetic va SIEMPRE): kinetic = tipografía cinética editorial: cada escena es una frase de 5 a 14 palabras que se arma palabra a palabra, conectores chicos y UNA palabra enorme (`highlight`); el estilo para temas, opiniones y frases que paran el scroll; 2,5 a 4 s por escena, 4 a 8 escenas. softui = tarjetas de vidrio flotando en 3D sobre fondo claro (como una app): cada escena puede llevar UNA tarjeta (`card`): evento (texto grande = nombre, `kicker` = fecha, `sub` = ciudad y hora, `items` = 2-3 datos), calendario (marca sola la fecha real del evento; úsala solo si hay evento), checklist (`items` = qué llevar, reglas, pasos), chat (`items` = mensajes cortos, como un DM), entrada (ticket: `text` = acción, `kicker` y `sub` = datos). Ideal para explicar cómo funciona, qué llevar, cómo comprar; 3 a 5 escenas de 3 a 4 s. poster = póster suizo: palabras arriba, la palabra clave GIGANTE abajo (`highlight`, 1 o 2 palabras cortas) y un cubo/corazón 3D de marca girando entre ambas; 2 a 4 escenas de 2,5 a 3,5 s; ideal para anuncios fuertes y portadas. liquid = manchas líquidas y burbujas, letras infladas que rebotan; alegre, cercano; ritmo medio. glitch = señal rota, separación de color, cortes secos; energía de fiesta, urgencia; ritmo rápido (escenas más cortas, textos en mayúsculas se ven bien). editorial = revista premium, revelado con máscara, mucho aire; elegante, confianza, explicar; ritmo más pausado (puede llevar bajadas).',
  `- Composiciones por estilo (campo \`layout\` de cada escena; usa SOLO las de su estilo, alterna entre escenas y no repitas la misma dos veces seguidas; el gancho y la acción final van mejor en las clásicas): ${LAYOUT_CATALOG}.`,
  '- arcade = SOLO para PLAYMORE (Playroom × Dalmore, concepto «Player 1 vs Player 2»): pantalla de arcade futurista, grilla neón, marcador P1 (magenta, mundo Playroom) contra P2 (celeste, mundo Dalmore), palabras que entran en saltos de 8 bits; fondo `arcade`. Úsalo cuando el pedido sea de PLAYMORE, su dress code o sus juegos (dados, ruletas, marcador).',
  '- Fondos: azul = celeste (por defecto en liquid), tinta = azul profundo (por defecto en glitch), perla = blanco roto editorial (por defecto en editorial), rosa, niebla = gris celeste editorial, noche = ciruela casi negra de PLAYMORE (solo para fiestas de noche), arcade = negro neón de PLAYMORE (con el estilo arcade). Acento: el color protagonista, distinto del fondo. Varía entre variantes.',
  '- Música: pulse (electrónica 120 BPM, versátil), drive (house 124 BPM, la más fiestera), dream (suave 96 BPM, para confianza y explicaciones).',
  '',
  'EJEMPLO (forma, no contenido): pedido "anunciar fiesta del sábado". liquid: [{kicker:"SE VIENE", text:"Una noche distinta", highlight:"distinta"}, {kicker:"SÁBADO 14", text:"Valparaíso", sub:"Dirección exacta al comprar"}, {text:"Comenta INFO", highlight:"INFO"}]. glitch: [{text:"¿TIENES PLANES?"}, {text:"SÁBADO 14", highlight:"14"}, {text:"NO TE QUEDES AFUERA", highlight:"AFUERA"}, {text:"Comenta INFO"}]. editorial: [{kicker:"MANSION PLAYROOM", text:"No es solo una fiesta", highlight:"fiesta"}, {text:"Es una experiencia", sub:"Que tú defines, con respeto y libertad"}, {kicker:"SÁBADO 14", text:"Te esperamos", highlight:"esperamos"}].',
  '',
  '`say` es la voz en off opcional de cada escena (el dueño decide si la usa): frase hablada natural en chileno, que acompañe el texto sin repetirlo palabra por palabra.',
  'Responde solo con el JSON pedido.',
].join('\n');

export interface MotionIdeaInput {
  brief: string;
  /** Palabra clave de la automatización de comentarios. Por defecto INFO. */
  keyword?: string | null;
  format: MotionFormat;
  template?: MotionTemplate | null;
  eventId?: number | null;
  media?: MotionMedia[];
}

export interface MotionIdeaResult {
  variants: MotionSpec[];
  usage: AiUsage;
  costUsd: number;
  model: string;
}

interface RawVariant {
  style?: string;
  base?: string;
  accent?: string;
  music?: string;
  scenes?: Array<Record<string, unknown>>;
}

interface RawOutput {
  title?: string;
  caption?: string;
  template?: string;
  countdownValue?: number;
  countdownUnit?: string;
  outroLine?: string;
  variants?: RawVariant[];
}

/** Estilos con que se completan las variantes si la IA manda menos de 3 (o repetidos). */
const FILL_STYLES: MotionStyle[] = ['editorial', 'kinetic', 'liquid', 'glitch'];

/** Pasa lo que devolvió la IA a 3 recetas limpias, cada una con un estilo distinto. */
export function variantsFromAi(raw: RawOutput, input: Pick<MotionIdeaInput, 'format' | 'template' | 'eventId' | 'media' | 'keyword'> & { eventDate?: string }): MotionSpec[] {
  const media = input.media ?? [];
  const template = input.template ?? (MOTION_TEMPLATES as readonly string[]).find((t) => t === raw.template) ?? 'anuncio';
  const list = Array.isArray(raw.variants) ? raw.variants : [];
  const styles: MotionStyle[] = [];
  for (const v of list) {
    const st = MOTION_STYLES.find((x) => x === v?.style);
    if (st && !styles.includes(st)) styles.push(st);
  }
  for (const st of FILL_STYLES) if (styles.length < 3 && !styles.includes(st)) styles.push(st);
  return styles.slice(0, 3).map((style: MotionStyle) => {
    const v = list.find((x) => x?.style === style) ?? list[0] ?? {};
    const used = new Set<number>();
    const scenes = (Array.isArray(v.scenes) ? v.scenes : []).map((s, i) => {
      let idx = Number(s.mediaIndex);
      // Montaje: si la IA no asignó foto, se reparten en orden.
      if (!(idx >= 0 && idx < media.length) && template === 'montaje' && media.length) idx = i % media.length;
      const m = idx >= 0 && idx < media.length && !(template !== 'montaje' && used.has(idx)) ? media[idx] : null;
      if (m) used.add(idx);
      return { ...s, media: m };
    });
    return normalizeMotionSpec({
      title: raw.title,
      caption: raw.caption,
      eventId: input.eventId ?? null,
      eventDate: input.eventDate ?? '',
      template,
      style,
      format: input.format,
      // Cada variante parte con su propia semilla: aunque dos tengan el mismo estilo, no se ven iguales.
      seed: randomSeed(),
      base: v.base,
      accent: v.accent,
      music: v.music,
      scenes,
      countdown: { value: raw.countdownValue, unit: raw.countdownUnit },
      outro: template !== 'sting',
      outroLine: raw.outroLine,
      keyword: input.keyword ?? undefined,
      sfx: true,
    });
  });
}

async function eventFacts(eventId: number | null | undefined): Promise<{ facts: string; eventId: number | null; eventDate: string }> {
  const event = eventId ? await getEventById(eventId) : await getFeaturedEvent();
  if (!event) return { facts: 'No hay un evento elegido: no menciones fechas ni precios, y no uses la tarjeta calendario.', eventId: null, eventDate: '' };
  const days = Math.ceil((new Date(event.eventDate).getTime() - Date.now()) / 86_400_000);
  return {
    facts: ['DATOS REALES DEL EVENTO:', await buildEventFacts(event), `- Faltan ${Math.max(0, days)} días.`].join('\n'),
    eventId: event.id,
    eventDate: chileIsoDate(new Date(event.eventDate)),
  };
}

export async function motionVariantsFromIdea(input: MotionIdeaInput): Promise<MotionIdeaResult> {
  const media = (input.media ?? []).slice(0, 12);
  const { facts, eventId, eventDate } = await eventFacts(input.eventId);
  const ask = [
    `PEDIDO DEL DUEÑO: ${input.brief.trim().slice(0, 2000)}`,
    `Formato: ${input.format === 'reel' ? 'vertical 9:16 (reel/historia)' : input.format === 'feed' ? 'feed 4:5' : 'cuadrado 1:1'}.`,
    input.template ? `Plantilla obligatoria: ${input.template}.` : 'Elige la plantilla que mejor sirva.',
    `Palabra clave de comentarios: ${normalizeKeyword(input.keyword)}. Cuando invites a comentar, usa exactamente "Comenta ${normalizeKeyword(input.keyword)}" en el texto del cierre y en el caption; nunca otra palabra.`,
    media.length ? `Fotos/clips entregados (índice: tipo): ${media.map((m, i) => `${i}: ${m.kind === 'video' ? 'clip' : 'foto'}`).join(', ')}.` : 'No hay fotos: mediaIndex = -1 en todas las escenas.',
  ].join('\n');
  const result = await quickJson<RawOutput>({
    model: MOTION_AI_MODEL,
    system: MOTION_SYSTEM,
    facts,
    content: ask,
    schema: OUTPUT_SCHEMA as unknown as Record<string, unknown>,
    maxTokens: 4000,
    effort: 'low',
    refusal: 'La IA no quiso escribir ese video. Cambia el pedido.',
    tooLong: 'La respuesta salió demasiado larga. Pide un video más corto.',
  });
  return { variants: variantsFromAi(result.data, { ...input, eventId, eventDate, media }), usage: result.usage, costUsd: result.costUsd, model: result.model };
}
