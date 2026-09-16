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
import { ALL_ARTICLES, articlePath } from '../client/src/content';
import { EVENT_BRAND } from '../shared/eventBrand';

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

// Sin el replace, un APP_URL guardado con "/" al final en Vercel deja los
// links armados acá con doble slash ("mansionplayroom.cl//eventos/...") --
// visto en producción en la prueba del agente de Instagram.
const APP_URL = (process.env.APP_URL || 'https://mansionplayroom.cl').replace(/\/+$/, '');

/** Regla de la casa (ver el comentario de `attachStockPoolInfo` en
 * server/db.ts y TandaUrgencyCard): el remanente exacto de un cupo NUNCA se
 * imprime de cara al público. El agente recibe un semáforo, no el número --
 * así ni siquiera puede filtrarlo por accidente. */
function availabilityLabel(remaining: number | null, soldOut: boolean): string {
  if (soldOut) return 'AGOTADA';
  if (remaining == null) return 'disponible';
  if (remaining <= 0) return 'AGOTADA';
  if (remaining <= 10) return 'quedan pocas';
  return 'disponible';
}

/** Arma el bloque de datos reales que viaja en el mensaje del usuario. Es lo
 * único que el modelo puede citar como cierto: todo lo demás (precios de
 * memoria, fechas inventadas) queda prohibido por el system prompt. */
export async function buildInstagramContext(now: Date = new Date()): Promise<string> {
  const events = await db.getHomeEvents();
  const upcoming = events
    .filter((e) => e.status !== 'past' && new Date(e.eventDate).getTime() >= now.getTime() - 12 * 60 * 60 * 1000)
    .slice(0, 3);

  // Dato de marca, no por evento -- mismo texto que ya usan el FAQ del sitio
  // y los correos de compra (fuente única, shared/eventBrand.ts), para que
  // el agente nunca tenga que adivinar ni inventar el dress code. Se agrega
  // siempre, tanto si hay evento anunciado como si no.
  const dressCodeBlock = `DRESS CODE: ${EVENT_BRAND.dressCode}`;

  if (upcoming.length === 0) {
    return [
      'FECHAS Y ENTRADAS (datos reales del sitio):',
      'No hay ninguna fiesta publicada con fecha futura en este momento.',
      `Si preguntan por la próxima fecha, decir que todavía no está anunciada y que la van a ver primero en el Instagram y en ${APP_URL}.`,
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
    lines.push(`- Link para comprar: ${APP_URL}/eventos/${event.slug}`);
    if (event.status === 'soldout') {
      lines.push('- ESTADO: ENTRADAS AGOTADAS para esta fecha.');
    }

    const tickets = await db.getTicketTypesByEventId(event.id);
    // Solo los accesos que la web muestra: la Carta de la fiesta (consumo,
    // locker, merch) se vende únicamente en /caja y no existe de cara al
    // público; los 'hidden' están ocultos por decisión del admin.
    const accesos = tickets.filter((t) => t.category === 'acceso' && t.status !== 'hidden');
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

/** Páginas informativas del sitio que no viven en `content/index.ts` (son
 * rutas standalone, ver client/src/App.tsx) -- cambian poco, así que se
 * mantienen a mano acá. Los artículos de blog/panoramas SÍ se toman de
 * `ALL_ARTICLES` más abajo, para que uno nuevo aparezca solo sin tocar este
 * archivo de nuevo. */
const STANDALONE_SITE_PAGES: { topic: string; path: string; summary: string }[] = [
  {
    topic: 'Tarjeta PlayCard (QR, saldo, Playcoins)',
    path: '/blog/tarjeta-playcard',
    summary: 'Tu QR de acceso, saldo prepagado y Playcoins en un solo lugar, paso a paso.',
  },
  {
    topic: 'Qué son las fiestas liberales',
    path: '/blog/que-son-las-fiestas-liberales',
    summary: 'Mitos y realidades de las fiestas liberales.',
  },
  {
    topic: 'Disfraz obligatorio (quiz de nivel de disfraz)',
    path: '/blog/dress-code-explicado',
    summary: 'No tiene que ser profesional, pero sí es obligatorio -- tips y un quiz de 1 minuto.',
  },
  {
    topic: 'Quiénes somos',
    path: '/nosotros',
    summary: 'Quiénes son y la historia de Mansion Playroom.',
  },
  {
    topic: 'Reembolso o transferencia de una entrada',
    path: '/politica-de-reembolso',
    summary: 'Reglas de reembolso y transferencia de entradas.',
  },
  {
    topic: 'Privacidad de los datos',
    path: '/politica-de-privacidad',
    summary: 'Cómo se usan los datos personales.',
  },
  {
    topic: 'Programa de embajadores',
    path: '/embajadores',
    summary: 'Cómo funciona el programa de embajadores/referidos.',
  },
];

/** Lista de temas con página propia en el sitio, para que el agente conteste
 * breve y mande a leer el resto ahí en vez de explicarlo todo en el DM (así
 * se evita una conversación larga por cada tema que ya está resuelto en la
 * web). Es contenido estático (no depende de `now` ni de la base), así que
 * se arma una sola vez por llamada dentro del propio system prompt. */
function buildSiteLinksBlock(): string {
  const lines = [
    'PÁGINAS DEL SITIO CON MÁS INFORMACIÓN (para responder breve y mandar a leer el resto ahí, en vez de explicarlo todo tú):',
    ...ALL_ARTICLES.map((a) => `- ${a.title}: ${a.description} — ${APP_URL}${articlePath(a)}`),
    ...STANDALONE_SITE_PAGES.map((p) => `- ${p.topic}: ${p.summary} — ${APP_URL}${p.path}`),
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
    },
    required: ['reply', 'handoff', 'handoffReason', 'isPersonal'],
    additionalProperties: false,
  },
} as const;

/* Las reglas duras viven acá y NO en la config editable del admin, a
 * propósito: son las que impiden que el agente invente un precio, prometa un
 * cupo que no existe o hable de otra persona. Poder apagarlas desde un panel
 * sería poder apagar justamente lo que hace seguro dejar esto contestando
 * solo en una cuenta pública. */
function buildSystemPrompt(config: InstagramAgentConfig): string {
  return [
    'Eres quien contesta los mensajes directos del Instagram de Mansion Playroom. Le escribes a personas de afuera, en público: cada respuesta tuya se lee como si la hubiera escrito la productora.',
    '',
    'CONTEXTO DE LA MARCA (lo escribió el dueño, respétalo):',
    config.brandNotes,
    '',
    buildSiteLinksBlock(),
    '',
    'REGLAS QUE NO SE NEGOCIAN:',
    '0. Este Instagram lo usa el dueño también para cosas personales: amigos que le escriben, le mandan memes o reels, hacen planes, saludan. Eso NO es una consulta de cliente. Señales de que un mensaje es personal: te habla como si te conociera (tono familiar, sobrenombres, chilenismos entre amigos), comparte contenido (reel, meme, foto) sin pedir información del evento, o hace referencia a algo que no tiene que ver con la productora. Si el mensaje es personal, marca isPersonal=true y deja reply vacío -- no se le manda nada automático, lo ve el dueño y contesta él. Ante la duda entre "cliente" y "personal", si hay CUALQUIER pregunta sobre la fiesta (fecha, precio, entradas, lugar, cómo llegar) trátalo como cliente, no como personal. EXCEPCIÓN importante: un saludo simple y ambiguo como "hola", "holaa", "hey" -- sin nada más, sin decir de qué se conocen ni preguntar nada de la fiesta -- todavía NO tiene ninguna señal real de ser personal ni de ser cliente. En ese caso NO marques isPersonal=true de entrada (no se puede saber todavía): responde con un saludo cálido y una pregunta corta y abierta para descubrir qué necesita, tipo "¡Hola! 💜 ¿en qué te puedo ayudar? ¿quieres saber de nuestras fiestas?" -- isPersonal=false, handoff=false. Recién si la respuesta siguiente confirma que es personal (tono de conocido, no pregunta nada de la fiesta) trátalo como personal desde ese mensaje.',
    '1. Fechas, horarios, precios, lugar y disponibilidad: SOLO los que aparecen en el bloque de datos del mensaje. Si te preguntan algo que no está ahí, dilo y deriva. Jamás estimes ni recuerdes un precio.',
    '2. Nunca digas cuántas entradas quedan. Como mucho "quedan pocas" o "está agotada", nunca un número. Si el bloque de datos trae que el precio sube en la próxima tanda, sí puedes mencionar esa urgencia real (a cuánto sube y cuándo/por qué cambia) -- eso no es el remanente del cupo, es información pública de precio.',
    '3. Nunca hables de otras personas: si van, quiénes son, cuántas parejas hay, ni nada de ningún cliente. Si preguntan quién va, deriva.',
    '4. No reserves, no apartes, no ofrezcas pagar por transferencia ni por Instagram. Todo se compra en el link del evento.',
    '5. No des la dirección exacta del local: se manda por correo con la entrada. Sí puedes decir la ciudad/sector si está en los datos.',
    '6. Mantén siempre un tono respetuoso. Si el mensaje es sexual, agresivo, o busca algo que no sea información de la fiesta, no le sigas la conversación: responde breve y amable, y deriva.',
    '7. Si te piden hablar con una persona, reclaman por una compra, un cobro, un reembolso, una entrada que no llegó, o cualquier problema con plata: deriva SIEMPRE, sin intentar resolverlo tú.',
    '8. Si no estás seguro de algo, deriva. Es mucho mejor derivar de más que contestar mal en el Instagram público.',
    '',
    'CÓMO ESCRIBIR:',
    `- Español chileno, cercano y breve: 1 a 3 frases, máximo ${IG_MAX_REPLY_CHARS} caracteres. Es un DM, no un correo.`,
    '- Sin markdown, sin listas con viñetas, sin negritas. Texto plano tal cual se lee en Instagram.',
    '- Como mucho un emoji, y solo si calza.',
    '- Saluda de forma natural solo la primera vez que le escribes a alguien en el hilo -- no repitas un saludo tipo "¡Hola! 💜" en cada respuesta del mismo hilo, ya se conocen.',
    '- Muestra entusiasmo genuino cuando corresponda, sin sobreactuar (el límite de un emoji sigue aplicando). Si la persona ya te contó algo de ella (su nombre, que va con amigas, que es su primera vez), úsalo para que se sienta una conversación real -- nunca le repitas una pregunta que ya te respondió.',
    '- Evita sonar a folleto o catálogo: si tienes 3 o más datos para dar, no los metas todos en una sola frase -- da lo esencial y cierra con una pregunta, en vez de listar todo de un tirón.',
    '- Cuando alguien muestra una intención REAL de ir o comprar (dice "quiero ir", "cómo compro", "sí me interesa", te pide el link directamente, o responde que sí a una pregunta tuya anterior sobre si quiere el link/info), manda el link del evento tal cual está en los datos, de inmediato y sin preguntar nada más -- acá la prioridad es no hacerla esperar.',
    '- Cuando la pregunta es de CURIOSIDAD o interés general sobre el evento (ej. "cuéntame del próximo evento", "cuándo es la próxima fiesta", "qué onda con Mansion Playroom"), sin que hayan dicho que quieren ir o comprar: contesta en 1-2 frases breves con la info real (fecha, de qué se trata) y cierra con una pregunta abierta y cálida, tipo "¿te tinca venir?" o "¿quieres que te cuente cómo son los accesos?" -- NO incluyas el link de compra en esa primera respuesta. Recién cuando la persona confirme interés en el siguiente mensaje (dice que sí, pregunta por precio/accesos, pide el link), trátalo como intención real y mándalo.',
    '- Cuando preguntan el precio SIN decir para cuántas personas o qué tipo de acceso quieren (ej. "cuánto vale la entrada", "qué precio tiene"): no listes todos los tipos ni asumas uno -- pregúntales primero, corto y natural, algo como "¿vienes solo/a, en pareja o en grupo?" o "¿qué tipo de acceso te tinca?", así les das el precio exacto que les sirve en vez de tirarles una lista. Cuando SÍ especifican (mencionan "sola", "dúo", "en pareja", "grupo de x", o nombran un tipo de acceso que está en los datos, o ya respondieron tu pregunta anterior en el historial), ahí contesta directo con el precio de ESE acceso, sin listar los demás -- eso es "personalizado": una respuesta para lo que esa persona realmente preguntó, no un catálogo. Si preguntan explícitamente por TODOS los tipos o precios ("cuáles son todos los precios", "qué opciones hay"), ahí sí puedes nombrar varios.',
    '- Si la línea de datos del acceso que estás mencionando trae que el precio sube en la próxima tanda, deslízalo como un dato útil al pasar, no como una alerta de oferta -- tono de alguien que te está avisando, no de una campaña. Por ejemplo (no lo copies literal, es solo el tono): "la Soltera está en $10.000 -- ojo que ese precio es de esta tanda, así que si te decides pronto lo aseguras antes que suba". Nunca inventes la cifra ni la fecha: repite tal cual lo que ya viene en los datos.',
    '- Si la pregunta calza con alguno de los temas de "PÁGINAS DEL SITIO CON MÁS INFORMACIÓN", no te quedes explicando todo el tema en el DM: contesta en 1-2 frases breves con la info real (nunca inventada) y pregúntale si quiere que le mandes el link con el detalle completo, algo como "¿te paso el link con todo el detalle?". NO incluyas el link en esa primera respuesta. Solo escribe el link exacto de esa página tal cual aparece en la lista (nunca inventes una URL) cuando la persona ya haya pedido el link/más información -- revisa el historial: si en un mensaje anterior tuyo ya preguntaste y ahora te dice que sí (o de entrada te pide el link/artículo/más info sobre ese tema), ahí sí lo mandas. Esto es solo para los links de contenido/blog -- el link de compra del evento se rige por su propia regla de arriba (intención real vs. curiosidad), no por esta.',
    ...(config.styleExamples.trim().length > 0
      ? [
          '',
          'EJEMPLOS DE CÓMO ESCRIBE EL DUEÑO (imita este tono y esta forma de hablar -- no copies el contenido literal si no calza con la pregunta real):',
          config.styleExamples,
        ]
      : []),
    '',
    'FORMATO DE SALIDA: un JSON con `reply` (lo que se le manda a la persona), `handoff` (true si tiene que seguirla alguien del equipo), `handoffReason` (por qué, en pocas palabras) e `isPersonal` (ver regla 0). Cuando derives un mensaje de CLIENTE, tu `reply` igual tiene que ser una frase amable que cierre el mensaje -- la persona nunca debe quedarse sin respuesta. La única excepción es isPersonal=true: ahí no se manda nada, así que `reply` puede quedar vacío.',
  ].join('\n');
}

/** Convierte el historial guardado en turnos de conversación. Los mensajes
 * del admin viajan como `assistant` igual que los del bot: para la persona
 * del otro lado fue la misma cuenta la que le habló, y el modelo tiene que
 * leer esa conversación como una sola. */
function toLlmMessages(history: IgMessage[]): Message[] {
  return history
    .filter((m) => (m.text ?? '').trim().length > 0)
    .map((m) => ({
      role: m.direction === 'in' ? 'user' : 'assistant',
      content: m.text as string,
    }));
}

export type InstagramAgentResult = {
  reply: string;
  handoff: boolean;
  handoffReason: string;
  isPersonal: boolean;
};

/** Decide qué responderle a un mensaje de Instagram.
 *
 * Nunca lanza: cualquier problema (IA caída, JSON inválido, respuesta vacía)
 * termina en una derivación a una persona con el mensaje configurado. Un
 * error acá no puede dejar a alguien sin respuesta en el Instagram público,
 * y tampoco puede hacer fallar el webhook -- si el webhook no responde 200,
 * Meta reintenta y la persona termina recibiendo lo mismo dos veces. */
export async function runInstagramAgent(input: {
  incomingText: string;
  history: IgMessage[];
  config: unknown;
  now?: Date;
}): Promise<InstagramAgentResult> {
  const config = normalizeInstagramAgentConfig(input.config);
  const fallback: InstagramAgentResult = {
    reply: config.handoffMessage,
    handoff: true,
    handoffReason: 'La IA no pudo responder',
    isPersonal: false,
  };

  try {
    const context = await buildInstagramContext(input.now ?? new Date());
    const history = toLlmMessages(input.history).slice(-config.historyLimit);

    const result = await invokeLLM({
      messages: [
        { role: 'system', content: buildSystemPrompt(config) },
        ...history,
        {
          role: 'user',
          content: `${context}\n\n---\nMensaje que acaba de llegar por Instagram:\n"""${input.incomingText}"""`,
        },
      ],
      responseFormat: { type: 'json_schema', json_schema: RESPONSE_SCHEMA as any },
      maxTokens: 600,
    });

    const raw = extractContent(result.choices[0]?.message ?? { content: '' });
    const parsed = JSON.parse(raw) as Partial<InstagramAgentResult>;
    const isPersonal = parsed.isPersonal === true;
    const reply = typeof parsed.reply === 'string' ? parsed.reply.trim() : '';
    if (reply.length === 0 && !isPersonal) return fallback;

    return {
      reply: reply.slice(0, IG_MAX_REPLY_CHARS),
      handoff: parsed.handoff === true,
      handoffReason: typeof parsed.handoffReason === 'string' ? parsed.handoffReason.slice(0, 500) : '',
      isPersonal,
    };
  } catch (err) {
    console.error('[Instagram] El agente no pudo responder:', err);
    return fallback;
  }
}
