import { invokeLLM, extractContent } from './_core/llm';
import { buildInstagramContext, toLlmMessages, type AgentHistoryMessage } from './instagramAgent';
import { stripUrlsFromReply } from './agentLinks';
import { cleanAiMarks } from '../shared/captionCheck';
import { AGENT_ACCESS_KEYS, cleanQuantity, inferAccessKey, type AgentAccessKey } from '../shared/agentAccess';
import type { FollowUpStage, FollowUpVariant } from '../shared/followUp';

/* Redacta el seguimiento personalizado (shared/followUp.ts): un mensaje corto
 * que retoma lo que la persona dijo (su acceso, sus dudas) en vez del texto fijo
 * igual para todos. Es el ÚNICO lugar donde la IA escribe sin que la persona
 * haya mandado un mensaje nuevo, así que es más estricta que el agente:
 * ante cualquier duda de que corresponda escribir, no escribe. */

const SCHEMA = {
  name: 'seguimiento_agente',
  strict: true,
  schema: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['send', 'skip', 'stop'],
        description: '"send" = escribir el seguimiento. "skip" = no corresponde ahora (parece una conversación personal, o no hay nada útil que decir). "stop" = la persona dijo que no le interesa, que ya compró o pidió que no le escriban: no se le vuelve a escribir.',
      },
      message: { type: 'string', description: 'El mensaje (vacío si action no es "send"). 1 o 2 frases, máximo 220 caracteres.' },
      accessOption: { type: 'string', enum: ['', ...AGENT_ACCESS_KEYS], description: 'El acceso que la persona dijo querer (llave entre corchetes de los datos), o vacío si no lo sabes.' },
      quantity: { type: 'integer', description: 'Cuántas entradas de ese acceso (1 por defecto).' },
    },
    required: ['action', 'message', 'accessOption', 'quantity'],
    additionalProperties: false,
  },
} as const;

const SYSTEM = [
  'Escribes los mensajes directos de Instagram de Mansion Playroom, una productora de fiestas en Valparaíso / Viña del Mar. Una persona dejó de contestar y vas a mandarle UN seguimiento corto, como lo haría alguien de la productora genuinamente amable, no un vendedor insistente.',
  'Reglas:',
  '- Español chileno, cercano, 1 o 2 frases (máximo 220 caracteres), como máximo un emoji, sin mayúsculas sostenidas ni varios signos de exclamación, sin rayas largas (—) ni muletillas de IA.',
  '- Retoma lo que SÍ sabes de la persona (cómo viene, qué le preocupaba) con naturalidad. Nunca repitas una pregunta que ya respondió ni la saludes de nuevo.',
  '- Nunca escribas un link ni digas "el link": el botón va solo debajo del mensaje. Nunca inventes precios, fechas ni cupos: usa solo los datos reales; si no hay un dato útil, no lo menciones.',
  '- No presiones ni hagas sentir culpa. Si la persona dijo que lo iba a pensar, respétalo.',
  '- Si parece una conversación personal (amigos, memes), si ya compró, o si dijo que no le interesa o que no le escriban: action "stop" (o "skip" si solo no corresponde ahora). Ante la duda, "skip".',
].join('\n');

function stageRules(stage: FollowUpStage, variant: FollowUpVariant): string {
  if (variant === 'click') {
    return stage === 1
      ? 'SEGUIMIENTO: la persona tocó el botón de compra hace un rato y no terminó. Pregúntale con calidez si pudo entrar o si algo no la dejó avanzar, y dile que puedes ayudarla ahí mismo. NO digas que viste que entró ni que la vigilas: pregunta sin afirmarlo. Si ya terminó su compra, que lo ignore, sin culpa.'
      : 'SEGUIMIENTO FINAL (el último que se le manda): retoma que quedó a un paso, ofrece ayuda concreta si algo no funcionó y deja la puerta abierta. Sin presión.';
  }
  return stage === 1
    ? 'SEGUIMIENTO 1: ya pasó un rato desde que la conversación quedó en silencio. Retoma lo último que hablaron con una pregunta suave o una ayuda concreta (ej. el precio de SU acceso), sin repetir lo que ya dijeron.'
    : 'SEGUIMIENTO FINAL (el último que se le manda): da un dato real y útil de los datos (por ejemplo, que el precio de esta tanda sube pronto, SOLO si está en los datos) o resuelve la duda que dejó pendiente, y despídete dejando la puerta abierta. Sin presión.';
}

export type FollowUpDraft =
  | { action: 'send'; message: string; accessOption: AgentAccessKey | ''; quantity: number }
  | { action: 'skip' | 'stop' };

/** `null` si la IA falla: el llamador cae al mensaje fijo (seguimiento 1) o no escribe (seguimiento 2). */
export async function draftFollowUp(input: {
  stage: FollowUpStage;
  variant: FollowUpVariant;
  history: AgentHistoryMessage[];
  customerNotes: string | null;
  now: Date;
}): Promise<FollowUpDraft | null> {
  try {
    const facts = await buildInstagramContext(input.now);
    const history = toLlmMessages(input.history).slice(-10);
    const notes = input.customerNotes?.trim() ? `LO QUE YA SABES DE ESTA PERSONA:\n${input.customerNotes.trim()}\n\n` : '';
    const result = await invokeLLM({ feature: 'instagramFollowUp',
      messages: [
        { role: 'system', content: SYSTEM },
        ...history,
        { role: 'user', content: `${facts}\n\n${notes}${stageRules(input.stage, input.variant)}\n\nEscribe el seguimiento ahora (o decide no escribirlo).` },
      ],
      responseFormat: { type: 'json_schema', json_schema: SCHEMA as any },
      maxTokens: 400,
    });
    const parsed = JSON.parse(extractContent(result.choices[0]?.message ?? { content: '' })) as { action?: string; message?: string; accessOption?: string; quantity?: unknown };
    if (parsed.action === 'stop') return { action: 'stop' };
    if (parsed.action !== 'send') return { action: 'skip' };
    const stripped = stripUrlsFromReply(typeof parsed.message === 'string' ? parsed.message : '');
    const message = cleanAiMarks(stripped.text).trim().slice(0, 240);
    if (!message) return { action: 'skip' };
    const asked = (AGENT_ACCESS_KEYS as string[]).includes(parsed.accessOption ?? '') ? (parsed.accessOption as AgentAccessKey) : '';
    const accessOption = asked || inferAccessKey(input.customerNotes);
    return { action: 'send', message, accessOption, quantity: accessOption ? cleanQuantity(parsed.quantity) : 1 };
  } catch (err) {
    console.error('[Instagram] No se pudo redactar el seguimiento:', err);
    return null;
  }
}
