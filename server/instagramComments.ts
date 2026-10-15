/* Comentarios públicos de Instagram: la IA deja un BORRADOR de respuesta y el
 * dueño lo aprueba (o lo edita, o lo descarta) desde el panel. Nada sale
 * solo. El spam evidente se oculta. Las campañas por palabra clave siguen
 * corriendo primero (server/instagram.ts, handleCommentChange).
 *
 * Todo esto queda dormido hasta que Meta apruebe el permiso
 * `instagram_business_manage_comments` y se suscriba el webhook `comments`. */
import { ENV } from './_core/env';
import { invokeLLM, extractContent, NO_THINKING } from './_core/llm';
import * as db from './db';
import { buildInstagramContext } from './instagramAgent';
import { replyToComment, hideComment, sendButtonMessage, sendPrivateReply } from './instagramSend';
import { resolveInstagramBuyLink } from './instagramInteractive';
import { stripUrlsFromReply } from './agentLinks';
import { sendPushToAdmins } from './push';
import { normalizeInstagramAgentConfig } from '../shared/instagramAgentConfig';
import { AI_PHRASES_PROMPT_LINE } from '../shared/aiPhrasesEs';
import { cleanAiMarks } from '../shared/captionCheck';
import { triageComment, type CommentCategory } from '../shared/commentTriage';
import type { IgComment } from '../drizzle/schema';
import { buildAdminUrl } from '../shared/adminDeepLink';

export const COMMENT_MAX_CHARS = 300;
const DM_BUTTON_TITLE = 'Ver entradas';

/** Limpia el texto que escribió la IA: sin links (van en el DM), sin marcas
 * de IA, sin exclamaciones en cadena, y con un largo de comentario. */
export function finalizeCommentReply(raw: string): string {
  let text = cleanAiMarks(stripUrlsFromReply(String(raw ?? '')).text)
    .replace(/^["'«“]+|["'»”]+$/g, '')
    .replace(/[¡!]{2,}/g, '!')
    .replace(/\s*\n+\s*/g, ' ')
    .trim();
  if (text.length > COMMENT_MAX_CHARS) {
    const cut = text.slice(0, COMMENT_MAX_CHARS);
    text = cut.slice(0, Math.max(cut.lastIndexOf(' '), 80)).trim();
  }
  return text;
}

const CATEGORY_HINT: Record<CommentCategory, string> = {
  spam: '',
  emoji: 'Solo dejó emojis: contesta con una reacción mínima, un emoji o dos palabras.',
  praise: 'Es un elogio: agradece de forma simple y específica a lo que dijo, sin exagerar.',
  question: 'Hace una pregunta: contéstala con datos reales del contexto, breve. Si no está en los datos, di que le escribes por mensaje.',
  sensitive: 'Es un tema delicado: NO te comprometas a nada; di solo que le escribes por mensaje para verlo bien.',
  other: 'Comentario general: responde natural y corto, o con una pregunta suave si encaja.',
};

export function buildCommentPrompt(input: {
  brandNotes: string; styleExamples: string; recentReplies: string[]; category: CommentCategory; purchaseIntent: boolean;
}): string {
  return [
    'Eres quien administra el Instagram de Mansion Playroom y contestas un comentario público de una publicación. Escribe en español chileno natural, como una persona real escribiendo desde el celular.',
    'REGLAS: una sola frase corta (máximo 120 caracteres), a lo más un emoji, sin signos de exclamación seguidos, sin links ni direcciones exactas, sin hashtags. No digas que eres una IA ni un equipo ("estamos encantados", "gracias por tu comentario" suenan a robot). No repitas la estructura de tus respuestas anteriores. Usa algún detalle concreto de lo que escribió la persona.',
    AI_PHRASES_PROMPT_LINE,
    CATEGORY_HINT[input.category],
    input.purchaseIntent
      ? 'La persona quiere comprar o saber precio: en "reply" invítala de forma natural a revisar el mensaje que le llegó (sin dar precios en público) y en "dm" escribe 1-2 frases con la respuesta concreta (los datos están en el contexto). Un botón con el link se agrega solo, no escribas links.'
      : 'Deja "dm" vacío.',
    `NOTAS DE LA MARCA:\n${input.brandNotes}`,
    input.styleExamples.trim() ? `ASÍ ESCRIBE EL DUEÑO (imita el tono):\n${input.styleExamples.trim()}` : '',
    input.recentReplies.length
      ? `RESPUESTAS PÚBLICAS RECIENTES DEL DUEÑO (aprende el estilo y NO las copies ni empieces igual):\n${input.recentReplies.map((r) => `- ${r}`).join('\n')}`
      : '',
    'Responde solo JSON con las claves "reply" y "dm".',
  ].filter(Boolean).join('\n\n');
}

const COMMENT_SCHEMA = {
  name: 'respuesta_comentario',
  strict: true,
  schema: {
    type: 'object',
    properties: {
      reply: { type: 'string', description: 'Respuesta pública, una frase corta.' },
      dm: { type: 'string', description: 'Mensaje privado de seguimiento, o vacío.' },
    },
    required: ['reply', 'dm'],
    additionalProperties: false,
  },
};

export async function draftCommentReply(input: {
  text: string; username?: string | null; category: CommentCategory; purchaseIntent: boolean;
}): Promise<{ reply: string; dm: string }> {
  const config = normalizeInstagramAgentConfig((await db.getSiteSettings() as any).instagramAgentConfig);
  const recentReplies = await db.recentSentIgReplies(6);
  const context = input.purchaseIntent ? await buildInstagramContext(new Date()) : '';
  const result = await invokeLLM({
    messages: [
      { role: 'system', content: buildCommentPrompt({ brandNotes: config.brandNotes, styleExamples: config.styleExamples, recentReplies, category: input.category, purchaseIntent: input.purchaseIntent }) },
      { role: 'user', content: `${context ? `${context}\n\n---\n` : ''}Comentario${input.username ? ` de @${input.username}` : ''}:\n"""${input.text}"""` },
    ],
    responseFormat: { type: 'json_schema', json_schema: COMMENT_SCHEMA as any },
    maxTokens: 400,
    ...(ENV.anthropicApiKey ? { thinking: NO_THINKING } : {}),
  });
  const parsed = JSON.parse(extractContent(result.choices[0]?.message ?? { content: '' })) as { reply?: string; dm?: string };
  return {
    reply: finalizeCommentReply(parsed.reply ?? ''),
    dm: input.purchaseIntent ? finalizeCommentReply(parsed.dm ?? '') : '',
  };
}

/** Entrada desde el webhook, cuando ninguna campaña por palabra clave calzó.
 * Nunca lanza: un comentario que falla no puede tumbar el webhook de Meta. */
export async function handleIncomingComment(input: {
  commentId: string; mediaId?: string | null; igUserId: string; username?: string | null; text: string;
}): Promise<void> {
  try {
    const config = normalizeInstagramAgentConfig((await db.getSiteSettings() as any).instagramAgentConfig);
    if (!config.commentsEnabled) return;
    if (ENV.igUserId && input.igUserId === ENV.igUserId) return; // comentario propio

    const { category, purchaseIntent } = triageComment(input.text);

    if (category === 'spam') {
      if (!config.hideSpam) return;
      let status: IgComment['status'] = 'hidden';
      let error: string | null = null;
      try { await hideComment(input.commentId); } catch (err) { status = 'failed'; error = err instanceof Error ? err.message.slice(0, 300) : 'No se pudo ocultar'; }
      const row = await db.insertIgComment({ ...input, category, status });
      if (row && error) await db.decideIgComment(row.id, { status, error });
      return;
    }

    let draft = { reply: '', dm: '' };
    if (category !== 'sensitive') {
      try { draft = await draftCommentReply({ text: input.text, username: input.username, category, purchaseIntent }); } catch { /* sin borrador: el dueño lo escribe */ }
    }
    const row = await db.insertIgComment({ ...input, category, draftReply: draft.reply || null, draftDm: draft.dm || null });
    if (!row) return; // Meta reintentó
    await sendPushToAdmins('pushInstagramHandoff', {
      title: `💬 Comentario de ${input.username ? `@${input.username}` : 'Instagram'}`,
      body: `"${input.text.slice(0, 80)}" — hay un borrador para aprobar`,
      url: buildAdminUrl({ section: 'instagram', tab: 'comentarios', comment: row.id }),
    });
  } catch (err) {
    console.error('[instagram-comments] no se pudo procesar el comentario', err);
  }
}

/** El dueño aprobó: publica la respuesta y, si hay, manda el DM con botón. */
export async function approveComment(id: number, finalReply: string): Promise<{ dmSent: boolean }> {
  const row = await db.getIgComment(id);
  if (!row) throw new Error('Ese comentario ya no existe.');
  if (row.status === 'sent') throw new Error('Ese comentario ya se respondió.');
  const reply = finalizeCommentReply(finalReply);
  if (!reply) throw new Error('Escribe la respuesta antes de publicar.');
  try {
    await replyToComment(row.commentId, reply);
  } catch (err) {
    const message = err instanceof Error ? err.message.slice(0, 300) : 'No se pudo publicar';
    await db.decideIgComment(id, { status: 'failed', finalReply: reply, error: message });
    throw new Error(`Instagram no dejó publicar: ${message}`);
  }
  await db.decideIgComment(id, { status: 'sent', finalReply: reply, error: null });

  let dmSent = false;
  if (row.draftDm) {
    try {
      const buy = await resolveInstagramBuyLink(new Date(), 'agente-comentario');
      if (buy) await sendButtonMessage({ comment_id: row.commentId }, row.draftDm, { title: DM_BUTTON_TITLE, url: buy.url });
      else await sendPrivateReply(row.commentId, row.draftDm);
      dmSent = true;
    } catch (err) {
      console.error('[instagram-comments] se publicó la respuesta pero falló el DM', err);
    }
  }
  return { dmSent };
}
