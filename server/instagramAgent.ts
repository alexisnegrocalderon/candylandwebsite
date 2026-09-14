import { invokeLLM, extractContent, type Message } from './_core/llm';
import * as db from './db';
import { formatChileDate, formatChileTime } from '../shared/chileDate';
import {
  IG_MAX_REPLY_CHARS,
  normalizeInstagramAgentConfig,
  type InstagramAgentConfig,
} from '../shared/instagramAgentConfig';
import type { IgMessage } from '../drizzle/schema';

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

const APP_URL = process.env.APP_URL || 'https://mansionplayroom.cl';

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

  if (upcoming.length === 0) {
    return [
      'FECHAS Y ENTRADAS (datos reales del sitio):',
      'No hay ninguna fiesta publicada con fecha futura en este momento.',
      `Si preguntan por la próxima fecha, decir que todavía no está anunciada y que la van a ver primero en el Instagram y en ${APP_URL}.`,
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
      lines.push('- Entradas:');
      for (const t of accesos) {
        const remaining = t.poolRemaining ?? (t.totalStock - t.soldCount);
        const label = availabilityLabel(remaining, t.status === 'soldout');
        const precio = `$${Number(t.price).toLocaleString('es-CL')}`;
        lines.push(`  · ${t.name}: ${precio} CLP — ${label}${t.description ? ` (${t.description})` : ''}`);
      }
    }

    const extras = tickets.filter((t) => t.category === 'extra' && t.status === 'active');
    if (extras.length > 0) {
      const nombres = extras.map((t) => `${t.name} $${Number(t.price).toLocaleString('es-CL')}`).join(', ');
      lines.push(`- Extras que se pueden agregar al comprar: ${nombres}`);
    }

    blocks.push(lines.join('\n'));
  }

  return blocks.join('\n');
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
    },
    required: ['reply', 'handoff', 'handoffReason'],
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
    'REGLAS QUE NO SE NEGOCIAN:',
    '1. Fechas, horarios, precios, lugar y disponibilidad: SOLO los que aparecen en el bloque de datos del mensaje. Si te preguntan algo que no está ahí, dilo y deriva. Jamás estimes ni recuerdes un precio.',
    '2. Nunca digas cuántas entradas quedan. Como mucho "quedan pocas" o "está agotada", nunca un número.',
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
    '- Cuando la pregunta es por comprar, manda el link del evento tal cual está en los datos.',
    '',
    'FORMATO DE SALIDA: un JSON con `reply` (lo que se le manda a la persona), `handoff` (true si tiene que seguirla alguien del equipo) y `handoffReason` (por qué, en pocas palabras). Cuando derives, tu `reply` igual tiene que ser una frase amable que cierre el mensaje -- la persona nunca debe quedarse sin respuesta.',
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
    const reply = typeof parsed.reply === 'string' ? parsed.reply.trim() : '';
    if (reply.length === 0) return fallback;

    return {
      reply: reply.slice(0, IG_MAX_REPLY_CHARS),
      handoff: parsed.handoff === true,
      handoffReason: typeof parsed.handoffReason === 'string' ? parsed.handoffReason.slice(0, 500) : '',
    };
  } catch (err) {
    console.error('[Instagram] El agente no pudo responder:', err);
    return fallback;
  }
}
