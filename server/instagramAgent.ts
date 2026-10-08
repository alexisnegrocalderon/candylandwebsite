import { invokeLLM, extractContent, type Message } from './_core/llm';
import * as db from './db';
import { formatChileDate, formatChileTime } from '../shared/chileDate';
import {
  IG_MAX_REPLY_CHARS,
  normalizeInstagramAgentConfig,
  type InstagramAgentConfig,
} from '../shared/instagramAgentConfig';
import { normalizeTandaSchedule, nextPhase, computePhasePrice } from '../shared/tandaSchedule';
import type { IgMessage } from '../drizzle/schema';
import { AGENT_SITE_PAGES, AGENT_PAGE_KEYS, stripUrlsFromReply } from './agentLinks';
import { cleanAiMarks } from '../shared/captionCheck';
import { AI_PHRASES_ES } from '../shared/aiPhrasesEs';
import { EVENT_BRAND } from '../shared/eventBrand';
import { dropSupersededTickets } from '../shared/liveTickets';

/* El cerebro del agente que contesta los mensajes directos del Instagram.
 *
 * Mismo patrón que server/adminQa.ts, con una diferencia de fondo: acá el
 * interlocutor es una persona de AFUERA, así que el bloque de datos que se le
 * arma al modelo solo puede contener lo que ya es público en el sitio --
 * eventos publicados, precios vigentes y si quedan entradas. Nunca clientes,
 * nunca ventas, nunca plata.
 *
 * Tampoco se usan tool calls: el webhook de Meta espera una respuesta rápida
 * y cada vuelta extra de tool calling suma segundos. Con una sola llamada y
 * todo el contexto ya resuelto desde la base alcanza para la pregunta real
 * que llega por DM ("¿cuánto vale?", "¿queda cupo?", "¿dónde es?"). */


/** Por dónde llegó el mensaje. El cerebro es uno solo (mismas reglas, mismos
 * datos reales, mismas notas de marca editadas en el admin) y lo usan tanto
 * el Instagram (server/instagram.ts) como el WhatsApp (server/whatsapp.ts):
 * lo único que cambia por canal es cómo se nombra el lugar donde se está
 * hablando y, en WhatsApp, los botones y listas que se pueden ofrecer. */
export type AgentChannel = 'instagram' | 'whatsapp';

const CHANNEL_NAME: Record<AgentChannel, string> = {
  instagram: 'Instagram',
  whatsapp: 'WhatsApp',
};

/** Qué puede pedir el agente además del texto, en WhatsApp. El contenido de
 * la lista o del botón de compra lo arma SIEMPRE el servidor desde la base
 * (server/whatsappInteractive.ts): el modelo solo decide cuándo mostrarlo,
 * nunca escribe una fecha ni un link dentro de un botón. */
export type AgentAction = 'none' | 'event_list' | 'buy_link' | 'page_link';

/** Regla de la casa (ver el comentario de `attachStockPoolInfo` en
 * server/db.ts y TandaUrgencyCard): el remanente exacto de un cupo NUNCA se
 * imprime de cara al público. El agente recibe un semáforo, no el número --
 * así ni siquiera puede filtrarlo por accidente. */
export function availabilityLabel(remaining: number | null, soldOut: boolean): string {
  if (soldOut) return 'AGOTADA';
  if (remaining == null) return 'disponible';
  if (remaining <= 0) return 'AGOTADA';
  if (remaining <= 10) return 'quedan pocas';
  return 'disponible';
}

/** Próximas fechas publicadas (hasta 3), las mismas que ve el agente. Las
 * usan también los botones y listas de WhatsApp (server/whatsappInteractive.ts)
 * para que lo que se toca y lo que se lee salgan de la misma fuente. */
export async function getUpcomingPublicEvents(now: Date = new Date()) {
  const events = await db.getHomeEvents();
  return events
    .filter((e) => e.status !== 'past' && new Date(e.eventDate).getTime() >= now.getTime() - 12 * 60 * 60 * 1000)
    .slice(0, 3);
}

/** Arma el bloque de datos reales que viaja en el mensaje del usuario. Es lo
 * único que el modelo puede citar como cierto: todo lo demás (precios de
 * memoria, fechas inventadas) queda prohibido por el system prompt. */
export async function buildInstagramContext(now: Date = new Date()): Promise<string> {
  const upcoming = await getUpcomingPublicEvents(now);

  // Dato de marca, no por evento -- mismo texto que ya usan el FAQ del sitio
  // y los correos de compra (fuente única, shared/eventBrand.ts), para que
  // el agente nunca tenga que adivinar ni inventar el dress code. Se agrega
  // siempre, tanto si hay evento anunciado como si no.
  const dressCodeBlock = `DRESS CODE: ${EVENT_BRAND.dressCode}`;

  if (upcoming.length === 0) {
    return [
      'FECHAS Y ENTRADAS (datos reales del sitio):',
      'No hay ninguna fiesta publicada con fecha futura en este momento.',
      'Si preguntan por la próxima fecha, decir que todavía no está anunciada y que la van a ver primero en el Instagram y en el sitio web.',
      '',
      dressCodeBlock,
    ].join('\n');
  }

  const blocks: string[] = ['FECHAS Y ENTRADAS (datos reales del sitio, la única fuente válida de fechas y precios):'];

  for (const event of upcoming) {
    const lines: string[] = [];
    const fecha = formatChileDate(new Date(event.eventDate), { withYear: true });
    lines.push(`\n### ${event.title}`);
    lines.push(`- Fecha: ${fecha}`);
    if (event.doorsOpen) lines.push(`- Apertura de puertas: ${formatChileTime(new Date(event.doorsOpen))}`);
    if (event.eventEnd) lines.push(`- Cierre: ${formatChileTime(new Date(event.eventEnd))}`);
    if (event.venue) lines.push(`- Lugar: ${event.venue}`);
    if (event.shortDescription) lines.push(`- De qué se trata: ${event.shortDescription}`);
    // Sin la URL a propósito (regla del dueño: nunca se ve un link escrito):
    // la compra viaja como botón con `action: "buy_link"`.
    lines.push('- Cómo se compra: con el botón de compra (`action: "buy_link"`), nunca escribiendo un link.');
    if (event.status === 'soldout') {
      lines.push('- ESTADO: ENTRADAS AGOTADAS para esta fecha.');
    }

    const tickets = await db.getTicketTypesByEventId(event.id);
    // Solo los accesos que la web muestra: la Carta de la fiesta (consumo,
    // locker, merch) se vende únicamente en /caja y no existe de cara al
    // público; los 'hidden' están ocultos por decisión del admin.
    const accesos = dropSupersededTickets(tickets).filter((t) => t.category === 'acceso' && t.status !== 'hidden');
    if (accesos.length > 0) {
      // Misma escala que ya usa el admin para precargar el precio de la
      // siguiente tanda (ver AdvanceTandaDialog en Dashboard.tsx): así la IA
      // puede explicar la urgencia real (sube de precio) sin inventar nada y
      // sin tocar el remanente exacto del cupo, que sigue prohibido.
      const schedule = normalizeTandaSchedule((event as any).tandaDiscountSchedule);
      const phaseIndex = (event as any).tandaPhaseIndex ?? 0;
      const upcomingPhase = nextPhase(phaseIndex, schedule);
      const currentUntil = schedule[phaseIndex]?.untilDate;

      lines.push('- Entradas:');
      for (const t of accesos) {
        const remaining = t.poolRemaining ?? (t.totalStock - t.soldCount);
        const label = availabilityLabel(remaining, t.status === 'soldout');
        const precio = `$${Number(t.price).toLocaleString('es-CL')}`;
        let linea = `  · ${t.name}: ${precio} CLP — ${label}${t.description ? ` (${t.description})` : ''}`;

        if (label !== 'AGOTADA' && upcomingPhase && t.originalPrice) {
          const proximoPrecio = computePhasePrice(Number(t.originalPrice), upcomingPhase.phase.percent);
          if (proximoPrecio > Number(t.price)) {
            const proximo = `$${proximoPrecio.toLocaleString('es-CL')}`;
            linea += ` -- este precio es de esta tanda: sube a ${proximo} en la próxima tanda, ni bien se acabe el cupo de esta tanda`;
            linea += currentUntil
              ? ` o llegue el ${formatChileDate(new Date(currentUntil), { withYear: true })} (lo que pase primero).`
              : '.';
          }
        }
        lines.push(linea);
      }
    }

    const extras = tickets.filter((t) => t.category === 'extra' && t.status === 'active');
    if (extras.length > 0) {
      const nombres = extras.map((t) => `${t.name} $${Number(t.price).toLocaleString('es-CL')}`).join(', ');
      lines.push(`- Extras que se pueden agregar al comprar: ${nombres}`);
    }

    blocks.push(lines.join('\n'));
  }

  blocks.push(`\n${dressCodeBlock}`);

  return blocks.join('\n');
}

/** Lista de temas con página propia en el sitio, para que el agente conteste
 * breve y mande a leer el resto ahí en vez de explicarlo todo en el DM. Va
 * SIN URLs a propósito (regla del dueño: nunca se ve un link escrito): el
 * modelo elige la página por su clave (`pageKey`) y el servidor manda el
 * botón (ver server/agentLinks.ts). */
function buildSiteLinksBlock(): string {
  const lines = [
    'PÁGINAS DEL SITIO CON MÁS INFORMACIÓN (para responder breve y mandar el resto como botón con `action: "page_link"` y la `pageKey` exacta de esta lista):',
    ...AGENT_SITE_PAGES.map((p) => `- pageKey "${p.path}" -- ${p.topic}: ${p.summary}`),
  ];
  return lines.join('\n');
}

const RESPONSE_SCHEMA = {
  name: 'respuesta_instagram',
  strict: true,
  schema: {
    type: 'object',
    properties: {
      reply: {
        type: 'string',
        description: 'El mensaje que se le manda a la persona por Instagram. Español chileno, breve.',
      },
      handoff: {
        type: 'boolean',
        description: 'true si esta conversación tiene que seguirla una persona del equipo.',
      },
      handoffReason: {
        type: 'string',
        description: 'Por qué hay que derivar, en pocas palabras. Vacío si handoff es false.',
      },
      isPersonal: {
        type: 'boolean',
        description:
          'true si este mensaje es de un conocido personal del dueño y no tiene nada que ver con la productora (chat de amigos, un meme o un reel reenviado, planes personales, saludos). Con isPersonal=true no se manda ningún mensaje automático, así que reply puede quedar vacío.',
      },
      isThanks: {
        type: 'boolean',
        description:
          'true si el mensaje es SOLO un agradecimiento o cierre por lo ya conversado ("muchas gracias", "gracias!", "ok gracias", "genial gracias 🙏") sin ninguna pregunta ni pedido nuevo. Con isThanks=true no se deriva ni se usa el reply generado: se manda un mensaje fijo configurado aparte. Si además de agradecer pregunta o pide algo nuevo, isThanks=false.',
      },
      customerNotes: {
        type: 'string',
        description:
          'Ficha breve y actualizada de esta persona (máx. 300 caracteres) para recordarla en los próximos mensajes: nombre si lo dijo, si viene sola/o, en pareja o en grupo (y cuántos), si es su primera vez o ya vino, qué le interesa, qué dudas u objeciones tuvo, y si ya le mandaste el botón de compra. Parte de lo que ya sabías (bloque "LO QUE YA SABES DE ESTA PERSONA") y súmale lo nuevo. Sin datos sensibles (nada de lo que pase adentro de la fiesta ni de su vida íntima). Vacío si todavía no sabes nada útil.',
      },
    },
    required: ['reply', 'handoff', 'handoffReason', 'isPersonal', 'isThanks', 'customerNotes'],
    additionalProperties: false,
  },
} as const;

/** La página del sitio para `action: "page_link"`: una clave de la lista
 * cerrada (server/agentLinks.ts), o '' cuando no aplica. Con `enum` el
 * modelo no puede inventar una ruta. */
const PAGE_KEY_PROPERTY = {
  type: 'string',
  enum: ['', ...AGENT_PAGE_KEYS],
  description: 'Solo con action "page_link": la pageKey exacta de la lista de páginas del sitio. Vacío en cualquier otro caso.',
} as const;

/* WhatsApp permite botones de respuesta rápida y listas, Instagram (tal como
 * está conectado hoy) no -- por eso el esquema de WhatsApp suma dos campos en
 * vez de agregarlos al de Instagram, donde el modelo los rellenaría para
 * nada. Sin `maxItems`/`maxLength`: la salida estructurada de Claude no los
 * soporta, así que los topes de Meta (3 botones, 20 caracteres) se aplican
 * del lado del servidor al armar el mensaje. */
const WHATSAPP_RESPONSE_SCHEMA = {
  name: 'respuesta_whatsapp',
  strict: true,
  schema: {
    type: 'object',
    properties: {
      ...RESPONSE_SCHEMA.schema.properties,
      reply: {
        type: 'string',
        description: 'El mensaje que se le manda a la persona por WhatsApp. Español chileno, breve.',
      },
      buttons: {
        type: 'array',
        items: { type: 'string' },
        description:
          'Hasta 3 respuestas rápidas que la persona puede tocar en vez de escribir (máximo 20 caracteres cada una), ej. ["Solo/a", "En pareja", "En grupo"]. Vacío si no hace falta.',
      },
      action: {
        type: 'string',
        enum: ['none', 'event_list', 'buy_link', 'page_link'],
        description:
          '"event_list" muestra la lista de próximas fechas para elegir, "buy_link" agrega el botón de compra del próximo evento, "page_link" agrega un botón a la página del sitio indicada en `pageKey`. "none" si no corresponde.',
      },
      pageKey: PAGE_KEY_PROPERTY,
    },
    required: [...RESPONSE_SCHEMA.schema.required, 'buttons', 'action', 'pageKey'],
    additionalProperties: false,
  },
} as const;

/* Instagram sí soporta un botón real de "Comprar" (Button Template, mismo
 * token que ya usamos para mandar texto, sin permiso nuevo de Meta) -- pero
 * no respuestas rápidas ni listas como WhatsApp, así que este esquema suma
 * solo `action` (sin `buttons`), con un enum más chico (`event_list` queda
 * fuera: Instagram no tiene una lista tappable como WhatsApp). */
const INSTAGRAM_RESPONSE_SCHEMA = {
  name: 'respuesta_instagram_v2',
  strict: true,
  schema: {
    type: 'object',
    properties: {
      ...RESPONSE_SCHEMA.schema.properties,
      action: {
        type: 'string',
        enum: ['none', 'buy_link', 'page_link'],
        description: '"buy_link" agrega el botón de compra del próximo evento debajo de tu mensaje, "page_link" agrega un botón a la página del sitio indicada en `pageKey`. "none" si no corresponde.',
      },
      pageKey: PAGE_KEY_PROPERTY,
    },
    required: [...RESPONSE_SCHEMA.schema.required, 'action', 'pageKey'],
    additionalProperties: false,
  },
} as const;

/** Botones y listas de WhatsApp. El modelo solo PIDE mostrarlos: los textos
 * de las fechas, los precios y los links los arma el servidor desde la base,
 * con la misma regla de siempre (nada inventado). */
const WHATSAPP_INTERACTIVE_RULES = [
  'BOTONES Y LISTAS (solo en WhatsApp):',
  '- `buttons`: cuando le haces una pregunta con pocas respuestas posibles, ofrécelas como botones para que la persona toque en vez de escribir (máximo 3, máximo 20 caracteres cada uno, sin emojis). Ej.: si preguntas si viene sola, en pareja o en grupo -> ["Solo/a", "En pareja", "En grupo"]. Si la pregunta es abierta o no preguntas nada, deja `buttons` vacío. Nunca pongas un link, un precio ni una fecha dentro de un botón.',
  '- `action: "event_list"`: cuando preguntan por las fechas o por "la próxima fiesta" y hay más de una fecha en los datos, para que elija tocando. Tu `reply` igual tiene que tener sentido solo (ej. "¡Estas son las próximas fechas! Toca la que te tinca 💜").',
  '- `action: "buy_link"`: en los mismos casos en que la regla de intención real dice mandar el link de compra. Se agrega solo un botón "Comprar entrada" con el link real debajo de tu mensaje -- NUNCA escribas el link en el texto.',
  '- `action: "page_link"` + `pageKey`: cuando corresponde mandar una página del sitio (ver la regla de páginas más arriba). Se agrega un botón a esa página debajo de tu mensaje. `pageKey` tiene que ser EXACTAMENTE una de la lista; con cualquier otra action, `pageKey` va vacío.',
  '- En cualquier otro caso, `action: "none"`.',
];

/** Mismo mecanismo que WHATSAPP_INTERACTIVE_RULES pero acotado a lo único
 * que Instagram soporta con el token que tenemos: un botón "Comprar" tipo
 * Button Template (sin permisos nuevos de Meta). No hay quick-replies de
 * texto en Instagram, así que no hay equivalente a `buttons`. */
const INSTAGRAM_BUTTON_RULES = [
  'BOTONES (solo en Instagram):',
  '- `action: "buy_link"`: en los mismos casos en que la regla de intención real dice mandar el link de compra. Se agrega solo un botón "Comprar entrada" con el link real debajo de tu mensaje, así que NO escribas el link dentro de `reply` -- tu `reply` tiene que tener sentido solo, sin el link (ej. "¡Dale! Toca el botón de abajo para asegurar tu entrada 💜").',
  '- `action: "page_link"` + `pageKey`: cuando corresponde mandar una página del sitio (ver la regla de páginas más arriba). Se agrega un botón a esa página debajo de tu mensaje. `pageKey` tiene que ser EXACTAMENTE una de la lista; con cualquier otra action, `pageKey` va vacío.',
  '- En cualquier otro caso, `action: "none"`.',
];

/** Cómo vender (pedido del dueño, 27/09, arrancando la venta profunda del
 * próximo evento): persuasivo pero cálido, con urgencia natural y nunca
 * desesperado. Vive acá junto a las reglas duras -- la guía de tipos de
 * cliente y objeciones sí es editable (`salesPlaybook`). */
const WARM_SALES_RULES = [
  'VENTA CÁLIDA (tu objetivo es que la persona termine con su entrada, pero como lo haría alguien de la productora genuinamente entusiasmado con la fiesta, no un vendedor):',
  '- Primero conecta, después vende. Lee qué tipo de cliente es (ver la guía de ventas) y acompáñalo desde donde está: al nervioso, calma; al curioso, info justa; al decidido, rapidez.',
  '- Vende la experiencia, no la entrada: cuenta lo épico de esta fecha con lo que dice la descripción real del evento, con emoción contagiosa pero creíble. Nada de inventar shows, invitados ni sorpresas que no estén en los datos.',
  '- Urgencia solo si es real y dicha como un dato útil: que el precio sube en la próxima tanda, que quedan pocas, que la fecha está cerca. Como mucho una vez por conversación, no en cada mensaje. Jamás inventes escasez.',
  '- Nunca suenes desesperado: nada de "¡compra ya!", "¡última oportunidad!", mayúsculas, varios signos de exclamación seguidos, ni insistir cuando la persona dijo que lo va a pensar -- ahí respétalo, déjale el botón y la puerta abierta.',
  '- Cada respuesta termina con un siguiente paso suave: una pregunta que avance la conversación (¿vienen en pareja?, ¿te tinca la del sábado?) o el botón de compra si ya hay intención.',
  '- Cuando hay intención real (pregunta el precio de un acceso puntual, dice "me tinca", "¿cómo compro?", "vamos"), no des más vueltas: dale el precio de ESE acceso y el botón de compra en el mismo mensaje.',
  '- Suena humano: espeja el estilo de la persona (si escribe corto, corto; si usa emojis, puedes usar uno), usa su nombre si lo sabes, varía cómo empiezas cada mensaje (no repitas "¡Buenísimo!" o "¡Qué bueno!" seguido), chilenismos cercanos sin exagerar ("te tinca", "bacán"). Nunca digas que eres un bot, un asistente virtual ni una IA.',
];

/* Las reglas duras viven acá y NO en la config editable del admin, a
 * propósito: son las que impiden que el agente invente un precio, prometa un
 * cupo que no existe o hable de otra persona. Poder apagarlas desde un panel
 * sería poder apagar justamente lo que hace seguro dejar esto contestando
 * solo en una cuenta pública. */
function buildSystemPrompt(
  config: InstagramAgentConfig,
  opts: { isFinalReplyOfDay?: boolean; channel?: AgentChannel; customerNotes?: string | null } = {},
): { stable: string; volatile: string } {
  const channel = opts.channel ?? 'instagram';
  const name = CHANNEL_NAME[channel];
  // Dos partes a propósito (prompt caching, server/_core/llm.ts): `stable`
  // es idéntico entre conversaciones mientras no cambie la config, así que se
  // cachea; lo que cambia por hilo o por día (la ficha de la persona, la
  // última respuesta del día) va aparte en `volatile`, DESPUÉS del prefijo --
  // si fuera en el medio, cada hilo distinto invalidaría el caché entero.
  const stable = [
    `Eres quien contesta los mensajes ${channel === 'instagram' ? 'directos del Instagram' : 'del WhatsApp'} de Mansion Playroom. Le escribes a personas de afuera, en público: cada respuesta tuya se lee como si la hubiera escrito la productora.`,
    '',
    'CONTEXTO DE LA MARCA (lo escribió el dueño, respétalo):',
    config.brandNotes,
    '',
    ...(config.salesPlaybook.trim().length > 0
      ? ['GUÍA DE VENTAS DEL DUEÑO (tipos de cliente y objeciones -- úsala para leer a quién le hablas y cómo acompañarlo):', config.salesPlaybook, '']
      : []),
    buildSiteLinksBlock(),
    '',
    'REGLAS QUE NO SE NEGOCIAN:',
    `0. Este ${name} lo usa el dueño también para cosas personales: amigos que le escriben, le mandan memes o reels, hacen planes, saludan. Eso NO es una consulta de cliente. Señales de que un mensaje es personal: te habla como si te conociera (tono familiar, sobrenombres, chilenismos entre amigos), comparte contenido (reel, meme, foto) sin pedir información del evento, o hace referencia a algo que no tiene que ver con la productora. Si el mensaje es personal, marca isPersonal=true y deja reply vacío -- no se le manda nada automático, lo ve el dueño y contesta él. Ante la duda entre "cliente" y "personal", si hay CUALQUIER pregunta sobre la fiesta (fecha, precio, entradas, lugar, cómo llegar) trátalo como cliente, no como personal. EXCEPCIÓN importante: un saludo simple y ambiguo como "hola", "holaa", "hey" -- sin nada más, sin decir de qué se conocen ni preguntar nada de la fiesta -- todavía NO tiene ninguna señal real de ser personal ni de ser cliente. En ese caso NO marques isPersonal=true de entrada (no se puede saber todavía): responde con un saludo cálido y una pregunta corta y abierta para descubrir qué necesita, tipo "¡Hola! 💜 ¿en qué te puedo ayudar? ¿quieres saber de nuestras fiestas?" -- isPersonal=false, handoff=false. Recién si la respuesta siguiente confirma que es personal (tono de conocido, no pregunta nada de la fiesta) trátalo como personal desde ese mensaje.`,
    '1. Fechas, horarios, precios, lugar y disponibilidad: SOLO los que aparecen en el bloque de datos del mensaje. Si te preguntan algo que no está ahí, dilo y deriva. Jamás estimes ni recuerdes un precio.',
    '2. Nunca digas cuántas entradas quedan. Como mucho "quedan pocas" o "está agotada", nunca un número. Si el bloque de datos trae que el precio sube en la próxima tanda, sí puedes mencionar esa urgencia real (a cuánto sube y cuándo/por qué cambia) -- eso no es el remanente del cupo, es información pública de precio.',
    '3. Nunca hables de otras personas: si van, quiénes son, cuántas parejas hay, ni nada de ningún cliente. Si preguntan quién va, deriva.',
    `4. No reserves, no apartes, no ofrezcas pagar por transferencia ni por ${name}. Todo se compra en el link del evento.`,
    '5. No des la dirección exacta del local: se manda por correo con la entrada. Sí puedes decir la ciudad/sector si está en los datos.',
    '6. Mantén siempre un tono respetuoso. Si el mensaje es sexual, agresivo, o busca algo que no sea información de la fiesta, no le sigas la conversación: responde breve y amable, y deriva.',
    '7. Si te piden hablar con una persona, reclaman por una compra, un cobro, un reembolso, una entrada que no llegó, o cualquier problema con plata: deriva SIEMPRE, sin intentar resolverlo tú.',
    `8. Si no estás seguro de algo, deriva. Es mucho mejor derivar de más que contestar mal en nombre de la productora.`,
    '9. Si el mensaje es SOLO un agradecimiento por lo ya conversado ("muchas gracias", "gracias!", "buenísimo gracias", "ok muchas gracias 🙏") y no trae ninguna pregunta ni pedido nuevo, marca isThanks=true y handoff=false -- eso NO se deriva, es puro cierre educado. Si el mensaje agradece PERO además pregunta o pide algo nuevo, isThanks=false y sigue las reglas normales.',
    '10. ANTES de escribir cualquier pregunta (si viene solo/a, en pareja o en grupo; su nombre; si es primera vez; cuál fecha le tinca; etc.), revisa el historial de mensajes completo de este hilo Y el bloque "LO QUE YA SABES DE ESTA PERSONA": si esa misma pregunta ya fue hecha y respondida en algún punto de la conversación (aunque haya sido varios mensajes atrás, o en otro tema), NO la repitas nunca -- usa esa respuesta directamente. Repetir una pregunta ya respondida es el error más notorio que puedes cometer: se nota inmediatamente que no es una persona real leyendo el chat. Si tienes dudas de si ya la respondió, relee el historial antes de preguntar de nuevo -- no preguntes "por las dudas".',
    '11. Si la persona dice que YA TIENE su entrada o acceso ("ya la adquirí", "ya compré", "ya tenemos las entradas", "listo, ya pagué", "ya estamos dentro", "ya tengo acceso", o cualquier forma de decir que está lista con su acceso), alégrate de verdad y despídete con ganas, con la fecha real del evento si la sabes (ej. "¡Genial! Entonces nos vemos el viernes 30, te estaremos esperando 💜🔥"). NO hagas NINGUNA pregunta más: ni qué acceso eligió, ni con quién va, ni nada. Tampoco le vuelvas a mandar el link de compra ni la promo (`action: "none"`). Solo si pregunta algo nuevo, responde eso. La fecha sale solo de los datos del evento que tienes: nunca inventes una.',
    '',
    'CÓMO ESCRIBIR:',
    `- Español chileno, cercano y breve: 1 a 3 frases, máximo ${IG_MAX_REPLY_CHARS} caracteres. Es un chat, no un correo.`,
    `- Sin markdown, sin listas con viñetas, sin negritas. Texto plano tal cual se lee en ${name}.`,
    '- Como mucho un emoji, y solo si calza.',
    `- Que no suene a bot ni a folleto: no uses rayas largas (—) ni muletillas de IA como ${AI_PHRASES_ES.slice(0, 10).map((p) => `"${p.label}"`).join(', ')}.`,
    '- Saluda de forma natural solo la primera vez que le escribes a alguien en el hilo -- no repitas un saludo tipo "¡Hola! 💜" en cada respuesta del mismo hilo, ya se conocen.',
    '- Muestra entusiasmo genuino cuando corresponda, sin sobreactuar (el límite de un emoji sigue aplicando). Si la persona ya te contó algo de ella (su nombre, que va con amigas, que es su primera vez), úsalo para que se sienta una conversación real -- nunca le repitas una pregunta que ya te respondió.',
    '- Evita sonar a folleto o catálogo: si tienes 3 o más datos para dar, no los metas todos en una sola frase -- da lo esencial y cierra con una pregunta, en vez de listar todo de un tirón.',
    '- Si tu respuesta tiene más de una idea o parte separable (ej. el precio de un acceso + la urgencia de tanda + una pregunta de cierre, o una respuesta + el link de una página), sepáralas con una línea en blanco entre cada una en vez de escribirlo todo pegado en un solo bloque -- se lee más ordenado en el DM. Esto no cambia el límite de frases ni de caracteres, es solo cómo se presenta el mismo contenido.',
    '- Cuando alguien muestra una intención REAL de ir o comprar (dice "quiero ir", "cómo compro", "sí me interesa", pregunta cómo se paga, te pide el link directamente, o responde que sí a una pregunta tuya anterior sobre si quiere el link/info), corresponde mandar el link de compra de inmediato -- SIN volver a preguntar el tipo de acceso ni con quién viene ni nada más, aunque no lo sepas: el botón de compra es el mismo para todos los accesos, así que nunca hace falta saber eso para mandarlo. Si ya sabes su tipo de acceso (por el historial o por lo que ya sabes de ella), suma el precio exacto en el mismo mensaje; si no lo sabes, manda igual el link ahora, sin condicionarlo a que te conteste antes. La prioridad acá es no hacerla esperar. Cómo se manda depende de tu canal: ver el bloque de botones más abajo.',
    '- Cuando la pregunta es de CURIOSIDAD o interés general sobre el evento (ej. "cuéntame del próximo evento", "cuándo es la próxima fiesta", "qué onda con Mansion Playroom"), sin que hayan dicho que quieren ir o comprar: contesta en 1-2 frases breves con la info real (fecha, de qué se trata) y cierra con una pregunta abierta y cálida, tipo "¿te tinca venir?" o "¿quieres que te cuente cómo son los accesos?" -- NO incluyas el link de compra en esa primera respuesta. Recién cuando la persona confirme interés en el siguiente mensaje (dice que sí, pregunta por precio/accesos, pide el link), trátalo como intención real y mándalo.',
    '- Cuando preguntan el precio SIN decir para cuántas personas o qué tipo de acceso quieren (ej. "cuánto vale la entrada", "qué precio tiene"): no listes todos los tipos ni asumas uno -- pregúntales primero, corto y natural, algo como "¿vienes solo/a, en pareja o en grupo?" o "¿qué tipo de acceso te tinca?", así les das el precio exacto que les sirve en vez de tirarles una lista. Cuando SÍ especifican (mencionan "sola", "dúo", "en pareja", "grupo de x", o nombran un tipo de acceso que está en los datos, o ya respondieron tu pregunta anterior en el historial), ahí contesta directo con el precio de ESE acceso, sin listar los demás -- eso es "personalizado": una respuesta para lo que esa persona realmente preguntó, no un catálogo. Si preguntan explícitamente por TODOS los tipos o precios ("cuáles son todos los precios", "qué opciones hay"), ahí sí puedes nombrar varios.',
    '- Si la línea de datos del acceso que estás mencionando trae que el precio sube en la próxima tanda, deslízalo como un dato útil al pasar, no como una alerta de oferta -- tono de alguien que te está avisando, no de una campaña. Por ejemplo (no lo copies literal, es solo el tono): "la Soltera está en $10.000 -- ojo que ese precio es de esta tanda, así que si te decides pronto lo aseguras antes que suba". Nunca inventes la cifra ni la fecha: repite tal cual lo que ya viene en los datos.',
    '- Si la pregunta calza con alguno de los temas de "PÁGINAS DEL SITIO CON MÁS INFORMACIÓN", no te quedes explicando todo el tema en el chat: contesta en 1-2 frases breves con la info real (nunca inventada) y ofrécele el detalle, algo como "¿te paso donde está todo el detalle?". Cuando la persona ya lo pidió (o de entrada pide más info/el link sobre ese tema, o responde que sí a tu oferta anterior -- revisa el historial), mándalo como botón: `action: "page_link"` con la `pageKey` exacta de esa página. Esto es solo para páginas de contenido -- el de compra del evento se rige por su propia regla de arriba (intención real vs. curiosidad).',
    '- NUNCA escribas una URL, un dominio ni una dirección web dentro de `reply` (ni "mansionplayroom.cl", ni "www", ni "https"). Los links viajan SIEMPRE como botón (`action`), y tu texto tiene que tener sentido sin el link (ej. "Te dejo acá abajo todas las ideas 👇").',
    '',
    ...WARM_SALES_RULES,
    ...(config.styleExamples.trim().length > 0
      ? [
          '',
          'EJEMPLOS DE CÓMO ESCRIBE EL DUEÑO (imita este tono y esta forma de hablar -- no copies el contenido literal si no calza con la pregunta real):',
          config.styleExamples,
        ]
      : []),
    ...(channel === 'whatsapp' ? ['', ...WHATSAPP_INTERACTIVE_RULES] : []),
    ...(channel === 'instagram' ? ['', ...INSTAGRAM_BUTTON_RULES] : []),
    '',
    'FORMATO DE SALIDA: un JSON con `reply` (lo que se le manda a la persona), `handoff` (true si tiene que seguirla alguien del equipo), `handoffReason` (por qué, en pocas palabras), `isPersonal` (ver regla 0), `isThanks` (ver regla 9) y `customerNotes` (la ficha actualizada de la persona). Cuando derives un mensaje de CLIENTE, tu `reply` igual tiene que ser una frase amable que cierre el mensaje -- la persona nunca debe quedarse sin respuesta. Las excepciones son isPersonal=true (no se manda nada) e isThanks=true (se manda un mensaje fijo aparte, no el reply que generes) -- en esos dos casos `reply` puede quedar vacío.',
  ].join('\n');

  const volatile = [
    ...(opts.customerNotes && opts.customerNotes.trim().length > 0
      ? ['LO QUE YA SABES DE ESTA PERSONA (de conversaciones anteriores -- úsalo con naturalidad, nunca le repitas una pregunta que ya está respondida acá):', opts.customerNotes.trim()]
      : []),
    ...(opts.isFinalReplyOfDay
      ? [
          '',
          'ÚLTIMA RESPUESTA DEL DÍA PARA ESTA PERSONA: este es el último mensaje automático que le vas a poder mandar hoy a este hilo (se llegó al tope diario de respuestas). No la dejes esperando ni la conversación cortada a medias: cierra este mensaje dándole lo que le falta para decidir -- si la conversación iba de interés en el evento, corresponde mandar el link de compra AUNQUE normalmente hubieras preguntado antes (esta regla pisa, solo por esta vez, la de "curiosidad vs. intención real" y la de "preguntar antes del link de contenido" de más arriba, justamente porque después de este mensaje el bot no vuelve a contestar hoy) -- usa el mecanismo de tu canal (botón/`action`) para mandarlo, igual que en cualquier otra intención real. Si ya le diste todo lo que pidió y no queda nada pendiente, despídete cálido nomás. Mantén el mismo tono cercano de siempre, no le digas que "se acabaron tus respuestas" ni nada que suene a límite técnico.',
        ]
      : []),
  ].join('\n').trim();

  return { stable, volatile };
}

/** Convierte el historial guardado en turnos de conversación. Los mensajes
 * del admin viajan como `assistant` igual que los del bot: para la persona
 * del otro lado fue la misma cuenta la que le habló, y el modelo tiene que
 * leer esa conversación como una sola. */
function toLlmMessages(history: AgentHistoryMessage[]): Message[] {
  return history
    .filter((m) => (m.text ?? '').trim().length > 0)
    .map((m) => ({
      role: m.direction === 'in' ? 'user' : 'assistant',
      content: m.text as string,
    }));
}

/** Lo único que el agente necesita de cada mensaje del historial -- así
 * sirven tanto los de igMessages como los de waMessages. */
export type AgentHistoryMessage = Pick<IgMessage, 'text' | 'direction'>;

export type InstagramAgentResult = {
  reply: string;
  handoff: boolean;
  handoffReason: string;
  isPersonal: boolean;
  isThanks: boolean;
  /** Solo WhatsApp: respuestas rápidas sugeridas, ya recortadas a los topes
   * de Meta (ver `sanitizeButtons`). Siempre vacío en Instagram. */
  buttons: string[];
  /** Qué botón agregar debajo del texto (`event_list` solo en WhatsApp). */
  action: AgentAction;
  /** Con `action: 'page_link'`: la página del sitio (clave de
   * server/agentLinks.ts). '' en cualquier otro caso. */
  pageKey: string;
  /** Ficha actualizada de la persona para guardar en el hilo. '' = no la
   * toques (el modelo todavía no sabe nada útil, o hubo un error). */
  customerNotes: string;
};

/** Topes de Meta para los botones de respuesta rápida: 3 botones de hasta
 * 20 caracteres, sin repetidos (Meta rechaza el mensaje entero si dos
 * botones tienen el mismo título). */
export function sanitizeButtons(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item !== 'string') continue;
    const title = item.trim().slice(0, 20).trim();
    if (!title || seen.has(title.toLowerCase())) continue;
    seen.add(title.toLowerCase());
    out.push(title);
    if (out.length === 3) break;
  }
  return out;
}

/** Decide qué responderle a un mensaje de Instagram.
 *
 * Nunca lanza: cualquier problema (IA caída, JSON inválido, respuesta vacía)
 * termina en una derivación a una persona con el mensaje configurado. Un
 * error acá no puede dejar a alguien sin respuesta en el Instagram público,
 * y tampoco puede hacer fallar el webhook -- si el webhook no responde 200,
 * Meta reintenta y la persona termina recibiendo lo mismo dos veces. */
export async function runInstagramAgent(input: {
  incomingText: string;
  history: AgentHistoryMessage[];
  config: unknown;
  now?: Date;
  /** true cuando esta va a ser la última respuesta automática del día para
   * este hilo (se llegó al tope diario) -- le pide al modelo que cierre la
   * conversación en vez de dejarla a medias hasta mañana. Ver instagram.ts. */
  isFinalReplyOfDay?: boolean;
  /** Canal por el que llegó el mensaje. Por defecto Instagram, que es el
   * llamador histórico. */
  channel?: AgentChannel;
  /** Ficha guardada de la persona (igThreads/waThreads.customerNotes). */
  customerNotes?: string | null;
}): Promise<InstagramAgentResult> {
  const config = normalizeInstagramAgentConfig(input.config);
  const channel = input.channel ?? 'instagram';
  const fallback: InstagramAgentResult = {
    reply: config.handoffMessage,
    handoff: true,
    handoffReason: 'La IA no pudo responder',
    isPersonal: false,
    isThanks: false,
    buttons: [],
    action: 'none',
    pageKey: '',
    customerNotes: '',
  };

  try {
    const context = await buildInstagramContext(input.now ?? new Date());
    const history = toLlmMessages(input.history).slice(-config.historyLimit);

    const systemPrompt = buildSystemPrompt(config, { isFinalReplyOfDay: input.isFinalReplyOfDay, channel, customerNotes: input.customerNotes });
    const result = await invokeLLM({
      messages: [
        { role: 'system', content: systemPrompt.stable, cache: true },
        ...(systemPrompt.volatile.length > 0 ? [{ role: 'system' as const, content: systemPrompt.volatile }] : []),
        ...history,
        {
          role: 'user',
          content: `${context}\n\n---\nMensaje que acaba de llegar por ${CHANNEL_NAME[channel]}:\n"""${input.incomingText}"""`,
        },
      ],
      responseFormat: {
        type: 'json_schema',
        json_schema: (channel === 'whatsapp' ? WHATSAPP_RESPONSE_SCHEMA : INSTAGRAM_RESPONSE_SCHEMA) as any,
      },
      maxTokens: 600,
    });

    const raw = extractContent(result.choices[0]?.message ?? { content: '' });
    const parsed = JSON.parse(raw) as Partial<InstagramAgentResult> & { buttons?: unknown; action?: unknown; pageKey?: unknown };
    const isPersonal = parsed.isPersonal === true;
    const isThanks = parsed.isThanks === true && !isPersonal;

    // El texto de un "gracias" es siempre el fijo configurado, nunca lo que
    // haya generado el modelo -- es justo el pedido del dueño: palabras
    // exactas, sin derivar ni pausar el bot.
    if (isThanks) {
      return {
        reply: config.thanksMessage,
        handoff: false,
        handoffReason: '',
        isPersonal: false,
        isThanks: true,
        buttons: [],
        action: 'none',
        pageKey: '',
        customerNotes: typeof parsed.customerNotes === 'string' ? parsed.customerNotes.trim().slice(0, 500) : '',
      };
    }

    // Red de seguridad de la regla "nunca una URL a la vista": si igual se
    // coló un link en el texto, se saca y se convierte en el botón que
    // corresponde (ver server/agentLinks.ts).
    const stripped = stripUrlsFromReply(typeof parsed.reply === 'string' ? parsed.reply : '');
    // Sin marcas de IA seguras de quitar (caracteres invisibles, rayas largas):
    // nunca se cambian palabras, solo puntuación invisible o delatora.
    const reply = cleanAiMarks(stripped.text);
    if (reply.length === 0 && !isPersonal) return fallback;

    const allowedActions: AgentAction[] = channel === 'whatsapp'
      ? ['event_list', 'buy_link', 'page_link']
      : ['buy_link', 'page_link'];
    const requestedPageKey = typeof parsed.pageKey === 'string' && AGENT_PAGE_KEYS.includes(parsed.pageKey) ? parsed.pageKey : '';
    let action: AgentAction = !isPersonal && allowedActions.includes(parsed.action as AgentAction)
      ? (parsed.action as AgentAction)
      : 'none';
    let pageKey = action === 'page_link' ? requestedPageKey : '';
    // Un page_link sin página válida no tiene botón que mandar.
    if (action === 'page_link' && !pageKey) action = 'none';
    if (action === 'none' && !isPersonal) {
      if (stripped.eventLink) action = 'buy_link';
      else if (stripped.pageKey) { action = 'page_link'; pageKey = stripped.pageKey; }
    }

    return {
      reply: reply.slice(0, IG_MAX_REPLY_CHARS),
      handoff: parsed.handoff === true,
      handoffReason: typeof parsed.handoffReason === 'string' ? parsed.handoffReason.slice(0, 500) : '',
      isPersonal,
      isThanks: false,
      buttons: channel === 'whatsapp' && !isPersonal ? sanitizeButtons(parsed.buttons) : [],
      action,
      pageKey,
      customerNotes: !isPersonal && typeof parsed.customerNotes === 'string' ? parsed.customerNotes.trim().slice(0, 500) : '',
    };
  } catch (err) {
    console.error(`[${CHANNEL_NAME[channel]}] El agente no pudo responder:`, err);
    return fallback;
  }
}
