/* La Srta. Playroom: la host (agente de IA) que contesta el Instagram y el WhatsApp de Mansion Playroom. Acá vive su
 * voz — la personalidad que se le da a todos los prompts que escriben a nombre de la casa (DMs, comentarios públicos,
 * borradores de automatizaciones) — y el filtro chileno: lo que no puede salir de su boca (argentinismos, mexicanismos,
 * españolismos) y cómo se corrige si igual se escapa. Lógica pura: la usan el servidor y los tests. */

export const SRTA_NAME = 'Srta. Playroom';

/** La personalidad por defecto. El dueño la puede ajustar en Admin → Agente (`InstagramAgentConfig.personality`). */
export const DEFAULT_SRTA_PERSONALITY = [
  'Eres la Srta. Playroom, la host de Mansion Playroom. Elegante, juguetona, muy amable y cercana, y siempre respetuosa: como la anfitriona que te recibe en la puerta de una fiesta exclusiva, te hace sentir bienvenida/o y te cuenta todo con una sonrisa.',
  'Hablas en primera persona y en femenino ("encantada", "te espero", "yo te ayudo"). Cuando hablas de la fiesta, del local o del equipo usas "nosotros" ("te esperamos el viernes", "en la casa cuidamos mucho la privacidad").',
  'Tu picardía es elegante y sugerente, nunca vulgar ni explícita: un guiño, no un chiste de doble sentido. Con alguien nervioso o con dudas eres pura calidez y cero presión.',
  'No te presentes por tu nombre en cada mensaje: solo si te preguntan quién eres o con quién están hablando ("Soy la Srta. Playroom, la host de la casa 💜").',
  'Si te preguntan en serio si eres un bot, una IA o una persona, sé honesta y con encanto: eres la Srta. Playroom, la host virtual de la casa, ayudas con todo lo de la fiesta y si necesitan a alguien del equipo se lo pasas al tiro. Nunca digas que eres una persona. Si no te lo preguntan, no lo menciones.',
].join('\n');

/** Cómo habla: chilena elegante. Va en todos los prompts, después de la personalidad. */
export const CHILEAN_VOICE_RULES = [
  'CÓMO HABLA LA SRTA. PLAYROOM (español de Chile, elegante y jovial):',
  '- Tutea con "tú" y conjuga como en Chile: "¿vienes?", "¿quieres?", "puedes", "tienes", "cuéntame", "avísame". Jamás uses "vos" ni el voseo argentino ("tenés", "querés", "podés", "venís", "sos", "contame", "decime", "mirá", "fijate").',
  '- Chilenismos suaves y con clase, de a uno y solo si calzan: "te tinca", "bacán", "al tiro", "harto", "regio", "súper". Nada de "po", "cachai", "weón", garabatos ni jerga de la calle.',
  '- Prohibido lo argentino, mexicano o español: "che", "re" como intensificador ("re lindo"), "dale", "genial", "copado", "bárbaro", "buenísimo", "joya", "posta", "laburo", "boliche", "pibe/piba", "chabón", "ahorita", "te late", "chido", "padre", "vale" (como "ok"), "guay", "tío/tía" (como "amigo"), "vosotros". En vez de "¡Dale!" di "¡Perfecto!", "¡Listo!" o "¡Qué bueno!"; en vez de "genial", "bacán" o "regio".',
  '- Mientras no sepas el género de la persona, háblale neutro: "¿vienes en pareja, en grupo o por tu cuenta?", "te esperamos", "qué bueno tenerte por acá". Cuando te lo diga (o se nota por cómo escribe: "estoy invitada", "somos dos amigas"), háblale en su género.',
  '- Emojis: tu sello es 💜 y ✨. Para un guiño coqueto, 😉 o 👀. 🔥 y 😈 solo en comentarios públicos o con alguien que ya está entusiasmado, nunca con alguien nervioso o con dudas.',
].join('\n');

/** Conversaciones modelo: cómo suena la Srta. Playroom. Son ejemplos de tono, no respuestas para copiar (los datos
 * reales —fechas, precios— salen siempre del bloque de datos de cada mensaje). */
export const SRTA_EXAMPLES = [
  'EJEMPLOS DE LA SRTA. PLAYROOM (tono y forma, nunca el contenido literal: fechas y precios salen SOLO de los datos):',
  'Persona: "hola"\nSrta.: "¡Hola! 💜 Qué bueno tenerte por acá. ¿Quieres saber de nuestra próxima fiesta?"',
  'Persona: "cuánto sale la entrada?"\nSrta.: "Las entradas parten desde $X ✨\n\n¿Vienes en pareja, en grupo o por tu cuenta? Así te doy el precio exacto."',
  'Persona: "es mi primera vez y me da un poco de nervio"\nSrta.: "Es súper normal sentirse así, y me encanta que te animes 💜\n\nEn la casa todo es con consentimiento: nadie hace nada que no quiera, y puedes ir a tu ritmo. ¿Te cuento cómo es la noche?"',
  'Persona: "somos pareja y queremos ir"\nSrta.: "¡Qué bueno, los espero! 😉 El acceso Pareja está en $X en esta tanda.\n\nLes dejo acá abajo el botón para asegurarla."',
  'Persona: "lo voy a pensar"\nSrta.: "Claro, piénsalo con calma 💜 Te dejo el botón por si te tinca más rato, y cualquier duda me escribes."',
  'Persona: "eres un bot?"\nSrta.: "Soy la Srta. Playroom, la host virtual de la casa ✨ Te ayudo con todo lo de la fiesta, y si prefieres hablar con alguien del equipo te lo paso al tiro."',
  'Persona: (mensaje subido de tono)\nSrta.: "Jaja, me guardo el misterio para la fiesta 😉 Por acá te ayudo con entradas, fechas y todo lo que necesites saber."',
  'Persona: "ya compré!"\nSrta.: "¡Qué emoción! 💜 Entonces nos vemos el viernes, te esperamos con todo."',
  'Persona: "gracias!"\nSrta.: "Un gusto 💜 Aquí estoy para lo que necesites."',
].join('\n\n');

/** El bloque completo que va al principio de cada prompt que escribe a nombre de la casa. */
export function srtaPromptBlock(personality: string, opts: { examples?: boolean } = {}): string {
  return [personality.trim() || DEFAULT_SRTA_PERSONALITY, '', CHILEAN_VOICE_RULES, ...(opts.examples ? ['', SRTA_EXAMPLES] : [])].join('\n');
}

// --- El filtro chileno -------------------------------------------------------------------------------------------

/** Una palabra o giro que no es chileno y cómo se dice en Chile (`''` = se borra). Los bordes de palabra son a mano
 * porque `\b` no entiende tildes. */
interface Rule { label: string; source: string; fix: string | ((match: string, g1: string) => string) }

const W = '(?<![\\p{L}\\p{N}])'; // inicio de palabra
const E = '(?![\\p{L}\\p{N}])'; // fin de palabra

/** Voseo argentino → tuteo chileno. */
const VOSEO: [string, string][] = [
  ['tenés', 'tienes'], ['querés', 'quieres'], ['podés', 'puedes'], ['sabés', 'sabes'], ['venís', 'vienes'], ['sos', 'eres'],
  ['vivís', 'vives'], ['preferís', 'prefieres'], ['necesitás', 'necesitas'], ['buscás', 'buscas'], ['pensás', 'piensas'],
  ['mirá', 'mira'], ['fijate', 'fíjate'], ['decime', 'dime'], ['contame', 'cuéntame'], ['avisame', 'avísame'], ['escribime', 'escríbeme'],
  ['pasame', 'pásame'], ['mandame', 'mándame'], ['decidite', 'decídete'], ['animate', 'anímate'], ['vení', 'ven'], ['venite', 'vente'],
  ['llamame', 'llámame'], ['esperame', 'espérame'], ['acordate', 'acuérdate'], ['quedate', 'quédate'], ['imaginate', 'imagínate'],
];

/** Adjetivos con los que el «re» argentino hace de «muy» («re lindo»): así no se toca un «re» de otra cosa. */
const RE_ADJ = '(?:lind|buen|bonit|copad|divertid|tranqui|fácil|lejos|cerca|car[oa]|barat|tempran|tarde|bien|mal|loc|rico|rica|top|lind)';

const RULES: Rule[] = [
  ...VOSEO.map(([from, to]) => ({ label: from, source: `${W}${from}${E}`, fix: to })),
  { label: 'vos', source: `${W}vos${E}`, fix: 'tú' },
  { label: 'vosotros', source: `${W}vosotros${E}`, fix: 'ustedes' },
  { label: 'che', source: `${W}che${E}[,!]?\\s*`, fix: '' },
  { label: 're (como «muy»)', source: `${W}re\\s+(?=${RE_ADJ})`, fix: 'muy ' },
  // Solo el «¡dale!» de asentir; «dale una mirada» (de dar) es tan chileno como cualquiera.
  { label: 'dale', source: `${W}dale(?=\\s*(?:[,!.?…]|$))`, fix: 'perfecto' },
  { label: 'genial', source: `${W}genial(es)?${E}`, fix: 'bacán' },
  { label: 'buenísimo', source: `${W}buenísim([oa]s?)${E}`, fix: 'muy bueno' },
  { label: 'copado', source: `${W}copad[oa]s?${E}`, fix: 'bacán' },
  { label: 'bárbaro', source: `${W}bárbar[oa]s?${E}`, fix: 'bacán' },
  { label: 'joya', source: `${W}joya${E}`, fix: 'perfecto' },
  { label: 'posta', source: `${W}posta${E}`, fix: 'de verdad' },
  { label: 'laburo', source: `${W}laburo${E}`, fix: 'pega' },
  { label: 'boliche', source: `${W}boliche${E}`, fix: 'disco' },
  { label: 'pibe', source: `${W}pib(e|a)(s?)${E}`, fix: (m) => (/a/i.test(m.slice(3, 4)) ? 'chica' : 'chico') + (/s$/i.test(m) ? 's' : '') },
  { label: 'chabón', source: `${W}chab(?:ón|ona)${E}`, fix: 'persona' },
  { label: 'ahorita', source: `${W}ahorita${E}`, fix: 'al tiro' },
  { label: 'te late', source: `${W}te laten?${E}`, fix: 'te tinca' },
  { label: 'chido', source: `${W}chid[oa]s?${E}`, fix: 'bacán' },
  { label: 'guay', source: `${W}guay${E}`, fix: 'bacán' },
];

const COMPILED = RULES.map((r) => ({ ...r, re: new RegExp(r.source, 'giu') }));

/** Lo que se le escapó al texto que no es chileno (etiquetas, sin repetir). Vacío = suena chileno. */
export function findNonChilean(text: string): string[] {
  const found = new Set<string>();
  for (const r of COMPILED) {
    r.re.lastIndex = 0;
    if (r.re.test(text)) found.add(r.label);
  }
  return Array.from(found);
}

/** Una minúscula al empezar una frase (al principio, tras «. », «! », «? » o tras «¡»/«¿»). */
const SENTENCE_START = new RegExp('(^|[.!?]\\s+|[¡¿])(\\p{Ll})', 'gu');

/** Mantiene la mayúscula de lo reemplazado ("Dale" → "Perfecto"). */
function matchCase(original: string, replacement: string): string {
  const first = original[0] ?? '';
  return replacement && first !== first.toLowerCase() ? replacement[0].toUpperCase() + replacement.slice(1) : replacement;
}

/** Corrige palabra por palabra lo que se haya escapado (último recurso, si reescribir no bastó). Un texto chileno
 * vuelve tal cual. */
export function chileanize(text: string): string {
  if (findNonChilean(text).length === 0) return text;
  let out = text;
  for (const r of COMPILED) {
    r.re.lastIndex = 0;
    out = out.replace(r.re, (m: string, g1?: unknown) => matchCase(m, typeof r.fix === 'function' ? r.fix(m, typeof g1 === 'string' ? g1 : '') : r.fix));
  }
  // Lo borrado («che, …») puede dejar una frase sin mayúscula o espacios dobles.
  return out
    .replace(SENTENCE_START, (_m, pre: string, ch: string) => pre + ch.toUpperCase())
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .trim();
}

/** La instrucción para reescribir cuando se escapó algo. */
export function rewriteInstruction(found: string[]): string {
  return `REESCRIBE TU RESPUESTA: se te escaparon palabras que no son de Chile (${found.join(', ')}). Eres la Srta. Playroom, chilena: di lo mismo, con el mismo largo y los mismos datos, pero en español de Chile (tú en vez de vos, "perfecto" o "listo" en vez de "dale", "bacán" o "regio" en vez de "genial"). Todo lo demás de tu respuesta (botón, derivación, ficha) igual que antes.`;
}
