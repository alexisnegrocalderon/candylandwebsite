import { invokeLLM, extractContent, NO_THINKING } from './_core/llm';
import { ENV } from './_core/env';
import { getEventById, getFeaturedEvent, getSiteSettings, listActiveIgKeywordAutomations } from './db';
import { buildEventFacts } from './winback';
import { ALL_ARTICLES } from '../client/src/content';
import { normalizeInstagramAgentConfig } from '../shared/instagramAgentConfig';
import { EVENT_BRAND } from '../shared/eventBrand';
import { formatChileDate } from '../shared/chileDate';
import {
  CONTENT_FORMATS,
  CONTENT_GOALS,
  CONTENT_PLAN_MAX_PER_DAY,
  CONTENT_MAX_SLIDES,
  CONTENT_MIN_SLIDES,
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
            goal: { type: 'string', enum: [...CONTENT_GOALS], description: 'awareness = que más gente conozca la fiesta; confianza = bajar nervios y explicar cómo es; interaccion = que la gente participe (comentar, etiquetar, votar, compartir) y se sienta parte de la comunidad; urgencia = hay algo real que se acaba; conversion = empujar a comprar.' },
            hook: { type: 'string', description: 'La primera línea que frena el scroll (en un reel, lo que se dice o se lee en los primeros 2 segundos).' },
            caption: { type: 'string', description: 'El texto completo listo para copiar y pegar. Sin links ni URLs. Español chileno, cercano.' },
            visual: { type: 'string', description: 'Qué grabar o fotografiar, concreto y posible de hacer con un celular.' },
            slides: { type: 'array', items: { type: 'string' }, description: 'SOLO en carruseles: el texto de cada lámina, en orden, de 3 a 10 láminas (la primera frena el scroll, la última pide la interacción). En cualquier otro formato, lista vacía.' },
            interaction: { type: 'string', description: 'Lo que le pides a la gente que haga: comentar algo concreto, etiquetar a alguien, votar en la encuesta de la historia, responder, guardar... Una frase. Vacío si la pieza no pide nada.' },
            hashtags: { type: 'array', items: { type: 'string' }, description: 'De 3 a 6 hashtags, incluido #MansionPlayroom.' },
            keyword: { type: 'string', description: 'Solo en historias: una palabra clave de la lista entregada para que respondan a la historia, o vacío.' },
          },
          required: ['date', 'time', 'format', 'goal', 'hook', 'caption', 'visual', 'slides', 'interaction', 'hashtags', 'keyword'],
          additionalProperties: false,
        },
      },
    },
    required: ['summary', 'pieces'],
    additionalProperties: false,
  },
} as const;

/** Biblioteca de formatos que generan INTERACCIÓN (comentarios, etiquetas,
 * votos, guardados). Pedido del dueño (02/10): "es importante generar
 * contenido que genere interacción y participación en Instagram". Parte de lo
 * que ya le funcionó -- el carrusel del desafío -- y suma variantes del mismo
 * mecanismo: involucrar a la persona en vez de solo contarle cosas. */
const INTERACTIVE_FORMATS = [
  'FORMATOS QUE GENERAN INTERACCIÓN (úsalos, y varía: no repitas el mismo dos veces seguidas):',
  '- Desafío tipo quiz (carrusel): un escenario por lámina con 2 opciones (a/b) y la persona elige la suya. La respuesta correcta ALTERNA entre a y b (si siempre es la misma, la gente lo nota). Las respuestas NO se revelan en el carrusel: van en una historia o en un comentario fijado al día siguiente (agenda esa pieza de seguimiento). La última lámina pide DOS cosas: comentar cuántas acertó y etiquetar a alguien que necesite ese mini manual.',
  '- Mitos vs realidades (carrusel): una creencia equivocada por lámina y la verdad al lado. Cierra preguntando "¿cuál de estos mitos creías tú?".',
  '- Verdadero o falso (historias): una afirmación con sticker de encuesta o de quiz; al día siguiente, la respuesta explicada.',
  '- Caja de preguntas (historia): "pregúntame lo que quieras sobre tu primera vez"; después, 2 o 3 respuestas en historias o en un reel. Las preguntas son anónimas: nunca se revela quién preguntó.',
  '- Esto o aquello (historias o reel): decisiones simples y entretenidas de la fiesta (disfraz o camuflaje, pista o barra), con encuesta.',
  '- Completa la frase (post): "Mi regla de oro en una fiesta es ___" -- se responde en comentarios.',
  '- Desafío de disfraz (post + historias): invita a mostrar o contar su disfraz; si se republica algo de la comunidad, SIEMPRE con permiso de quien sale. Nunca pidas fotos íntimas ni expongas a alguien.',
  '- Cuenta regresiva con participación (historias): sticker de cuenta regresiva para que activen el recordatorio, más una pregunta del día.',
  '- Detrás de escena (reel o historias): armando la fiesta, decoración, preparación; invita a adivinar o votar algo (el color, la canción).',
].join('\n');

/** El post del dueño que mejor funcionó, transcrito: es la receta a imitar (la
 * mecánica, no el contenido literal). */
const WINNING_EXAMPLE = [
  'EL POST QUE MEJOR LE HA FUNCIONADO AL DUEÑO (imita la mecánica, no copies el contenido):',
  'Carrusel de 7 láminas "Desafío: ¿sabes jugar en Playroom?". Lámina 1: "Elige tu respuesta y comprueba si entiendes las reglas básicas de nuestro espacio". Láminas 2 a 6: un escenario cada una, con dos opciones a/b -- ej.: "Sientes una mano en tu cintura sin previo aviso: a) está bien, de seguro le gustó, es parte del juego / b) no está bien, el consentimiento es clave y debemos comunicarlo"; "Se acerca alguien que te incomoda: a) le digo amablemente que prefiero seguir disfrutando por mi cuenta / b) sigo interactuando para no ser maleducad@"; "Una chica se acerca y te toca sin preguntar: a) no digo nada, es distinto que ella tome la iniciativa / b) le explico que el consentimiento es igual para todos sin importar el género". Lámina 7: "¿Elegiste bien? En Playroom todo se trata de respeto, consentimiento y buena vibra. Comenta cuántas respuestas acertaste y etiqueta a alguien que necesita este mini manual".',
  'Por qué funciona: la persona participa (elige), se compara con otros, y la lámina final le da dos razones concretas para comentar y etiquetar. Además enseña las reglas del espacio sin sermonear.',
].join('\n');

/** Temas de conversación de la comunidad liberal para el contenido educativo y
 * de participación. Son TEMAS (qué tratar), no afirmaciones ni estadísticas
 * sobre nadie. */
const COMMUNITY_TOPICS = [
  'TEMAS PARA CONVERSAR CON LA COMUNIDAD (úsalos como ejes; trátalos con respeto, humor sano y sin nada explícito):',
  '- Consentimiento y comunicación: preguntar antes de tocar, un no se respeta a la primera, cómo decir que no sin culpa, qué hacer si algo te incomoda.',
  '- Primera vez: nervios, qué esperar, ir en pareja, solo/a o con amigos, "puedes pasar toda la noche solo bailando".',
  '- Etiqueta del espacio: no se fotografía ni se comenta lo que hacen los demás, discreción y privacidad, respeto a las parejas y a los límites de cada quien.',
  '- Mitos de las fiestas liberales vs cómo es en realidad.',
  '- Parejas: conversar antes qué quieren y qué no, acuerdos y reglas propias, revisarse durante la noche.',
  '- Ser aliado: cómo cuidar a otros en el espacio y avisar al equipo cuando algo no está bien.',
  '- Disfraz y dress code: ideas con lo que tienes en casa, accesorios o full producción.',
  '- Cuidarse la noche: tomar con moderación, volver seguro a casa, cómo llegar y dónde estacionar.',
].join('\n');

/** Ideas para FIDELIZAR a quien ya fue o ya compró. Solo apoyadas en programas
 * que existen en el sitio; no se inventan beneficios nuevos. */
const LOYALTY_IDEAS = [
  'FIDELIZACIÓN (para que quien ya vino vuelva y traiga a otros):',
  '- Que se sientan parte: agradecer a "los de siempre" sin nombrar a nadie, historias de "lo que más se vivió", encuestas para que opinen de la próxima fiesta.',
  '- Programas que ya existen en el sitio, para mencionar SIN inventar sus beneficios concretos (para el detalle: "link en la bio"): PlayCard con QR, saldo y Playcoins; programa de embajadores y referidos; beneficios para cumpleañeros; el Oráculo de Disfraces y el quiz del dress code.',
  '- Participación que genera comunidad: desafíos, preguntas, votaciones sobre la temática, "etiqueta a quien debería venir contigo".',
].join('\n');

const SYSTEM_PROMPT = [
  'Eres el estratega de contenido de Mansion Playroom, una productora de fiestas liberales en Valparaíso / Viña del Mar, Chile. Le hablas al dueño: directo, en español chileno.',
  'Armas el calendario de publicaciones de Instagram (@mansionplayroom.cl) hasta el próximo evento. Cada pieza trae el texto listo para copiar, qué grabar y a qué hora publicar. El objetivo no es solo vender: es construir una comunidad que participa, comenta y vuelve.',
  'Reglas de contenido: nada sexual explícito ni doble sentido grueso -- la marca habla de respeto, consentimiento y libertad, y es solo para mayores de 18. Nunca muestres ni insinúes a personas concretas del público. No inventes shows, invitados, premios ni precios: usa SOLO los datos reales entregados. Nunca pidas fotos íntimas ni expongas a nadie; si republicas algo de la comunidad, siempre con permiso.',
  'INTERACCIÓN ES LO MÁS IMPORTANTE: Instagram premia lo que la gente comenta, guarda, comparte y a lo que etiqueta a otros. Al menos la mitad de las piezas tienen que pedir algo concreto en `interaction` (comentar algo específico, etiquetar a alguien, votar, responder la historia, guardar). Pide cosas fáciles y con una razón: "comenta cuántas acertaste" funciona; "comenta" a secas, no. Incluye al menos un carrusel de desafío tipo quiz cada 10 días.',
  INTERACTIVE_FORMATS,
  WINNING_EXAMPLE,
  'CARRUSELES (`format: "carrusel"`): pon el texto de cada lámina en `slides`, de ' + CONTENT_MIN_SLIDES + ' a ' + CONTENT_MAX_SLIDES + ' láminas. La primera frena el scroll y promete algo; cada lámina del medio tiene UNA idea en máximo 25 palabras; la última pide la interacción. `caption` es el texto del post (corto) y `visual` describe el estilo de las láminas. Fuera de los carruseles, `slides` va vacío.',
  COMMUNITY_TOPICS,
  LOYALTY_IDEAS,
  'Urgencia: solo si es real (el precio de la tanda sube en una fecha concreta, quedan cupos limitados) y dicha como un dato útil, una o dos veces en todo el plan -- nunca "última oportunidad" en cada pieza ni desesperación.',
  `Ritmo: unas 4 o 5 piezas por semana, máximo ${CONTENT_PLAN_MAX_PER_DAY} por día y solo en la última semana (cuenta regresiva). Mezcla reels (para que llegue gente nueva), carruseles (para que guarden y compartan), historias (cercanía, encuestas y urgencia) y posts.`,
  'Arco: las primeras semanas, awareness, confianza e interacción (cómo es la fiesta, consentimiento, primera vez, desafíos, ideas de disfraz); la última semana, urgencia y conversión sin dejar de interactuar; el día del evento, la pieza de "es hoy".',
  'Captions: entre 100 y 400 caracteres, sin ninguna URL ni dirección web (si hay que mandar a comprar o a leer algo, di "link en la bio"). Sin markdown. Como mucho un emoji por pieza.',
  'Palabras clave de automatización: SOLO en historias, y SOLO de la lista entregada (se activan cuando la persona RESPONDE a la historia con esa palabra y le llega un DM automático). En posts, reels y carruseles NO uses una palabra clave tipo "comenta ENTRADA y te mando el link": esa automatización por comentarios todavía no funciona. Pedir comentarios para PARTICIPAR ("comenta cuántas acertaste", "etiqueta a alguien") SÍ está bien y es lo que más interacción genera. Si la lista está vacía, deja `keyword` vacío en todas.',
  'Las fechas de cada pieza tienen que estar DENTRO de la ventana indicada y en formato YYYY-MM-DD.',
].join('\n');

async function resolveTargetEvent(targetEventId: number | undefined) {
  const event = targetEventId ? await getEventById(targetEventId) : await getFeaturedEvent();
  if (!event) throw new Error('No hay ningún evento publicado para planificar.');
  return event;
}

const KNOWLEDGE_SECTION_CHARS = 260;
const KNOWLEDGE_ARTICLE_CHARS = 1500;
const KNOWLEDGE_TOTAL_CHARS = 5000;

/** Lo que Playroom ya explica en su propio sitio (los artículos del blog y las
 * guías), condensado para la IA: reglas, cómo es la fiesta, qué llevar, cómo
 * llegar. Sale de `ALL_ARTICLES`, la misma fuente del sitio, así que un
 * artículo nuevo entra solo y el contenido nunca contradice lo que dice la
 * web. Exportada para probarla. */
export function buildPlayroomKnowledge(): string {
  const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text);
  const blocks: string[] = [];
  for (const article of ALL_ARTICLES) {
    const lines = [`• ${article.title}: ${article.description}`];
    if (article.category === 'blog') {
      let used = lines[0].length;
      for (const section of article.sections) {
        const detail = [...(section.body ?? []).slice(0, 1), ...(section.list ?? [])].join(' ');
        if (!detail) continue;
        const line = `  - ${section.heading}: ${clip(detail, KNOWLEDGE_SECTION_CHARS)}`;
        if (used + line.length > KNOWLEDGE_ARTICLE_CHARS) break;
        lines.push(line);
        used += line.length;
      }
    }
    blocks.push(lines.join('\n'));
  }
  return clip(blocks.join('\n'), KNOWLEDGE_TOTAL_CHARS);
}

/** Arma el pedido para la IA: ventana de fechas, datos reales del evento,
 * tono de marca y palabras clave activas. Exportada para probarla. */
export async function buildPlanRequest(targetEventId: number | undefined, now: Date, focus?: string) {
  const event = await resolveTargetEvent(targetEventId);
  const window = contentPlanWindow(now, new Date(event.eventDate));
  if (!window) throw new Error(`"${event.title}" es hoy o ya pasó: no queda tiempo para planificar publicaciones.`);

  const settings = await getSiteSettings();
  const brand = normalizeInstagramAgentConfig((settings as any)?.instagramAgentConfig);
  const keywords = (await listActiveIgKeywordAutomations())
    .filter((a) => a.triggerSource !== 'comment') // "comentar" no dispara nada todavía
    .map((a) => a.keyword);

  const cleanFocus = (focus ?? '').replace(/\s+/g, ' ').trim().slice(0, 500);
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
    'LO QUE PLAYROOM YA EXPLICA EN SU SITIO (alinea el contenido con esto; no lo contradigas):',
    buildPlayroomKnowledge(),
    '',
    `PALABRAS CLAVE ACTIVAS PARA HISTORIAS: ${keywords.length > 0 ? keywords.join(', ') : '(ninguna)'}`,
    // Lo que el dueño pide en ESTA ocasión. Va al final y marcado: tiene
    // prioridad sobre el reparto habitual, pero no sobre las reglas del sistema.
    ...(cleanFocus ? ['', `PEDIDO ESPECIAL DEL DUEÑO PARA ESTE PLAN (tiene prioridad sobre el reparto habitual, pero no sobre las reglas de contenido): ${cleanFocus}`] : []),
  ];
  return { event, window, keywords, userContent: lines.join('\n') };
}

/** Genera el plan. Devuelve el plan ya limpio: las piezas con fecha inventada
 * o fuera de ventana se descartan acá. No guarda nada (el panel lo recuerda en
 * el navegador). */
export async function generateContentPlan(targetEventId: number | undefined, now: Date = new Date(), focus?: string): Promise<ContentPlan> {
  const { event, window, keywords, userContent } = await buildPlanRequest(targetEventId, now, focus);

  const result = await invokeLLM({
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userContent },
    ],
    responseFormat: { type: 'json_schema', json_schema: PLAN_SCHEMA as any },
    maxTokens: 12000,
    ...(ENV.anthropicApiKey ? { model: PLAN_MODEL, thinking: NO_THINKING } : {}),
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
