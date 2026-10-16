/* Comentarios públicos de Instagram: la IA deja un BORRADOR de respuesta y el
 * dueño lo aprueba (o lo edita, o lo descarta) desde el panel. Nada sale
 * solo. El spam evidente se oculta. Las campañas por palabra clave siguen
 * corriendo primero (server/instagram.ts, handleCommentChange).
 *
 * Todo esto queda dormido hasta que Meta apruebe el permiso
 * `instagram_business_manage_comments` y se suscriba el webhook `comments`. */
import { ENV } from './_core/env';
import { clip, pushTitle } from '../shared/pushText';
import { invokeLLM, extractContent, NO_THINKING } from './_core/llm';
import * as db from './db';
import { buildInstagramContext } from './instagramAgent';
import { replyToComment, hideComment, sendButtonMessage, sendPrivateReply, commentOnOwnMedia, fetchOwnMedia } from './instagramSend';
import { resolveInstagramBuyLink } from './instagramInteractive';
import { stripUrlsFromReply, resolvePageLink, AGENT_PAGE_KEYS, AGENT_SITE_PAGES } from './agentLinks';
import { sendPushToAdmins } from './push';
import { normalizeInstagramAgentConfig } from '../shared/instagramAgentConfig';
import { AI_PHRASES_PROMPT_LINE } from '../shared/aiPhrasesEs';
import { cleanAiMarks } from '../shared/captionCheck';
import { triageComment, type CommentCategory } from '../shared/commentTriage';
import type { IgComment } from '../drizzle/schema';
import { postOrigin } from '../shared/igFunnel';
import { pickHook } from '../shared/igEngagement';
import { buildAdminUrl } from '../shared/adminDeepLink';

export const COMMENT_MAX_CHARS = 300;
const DM_BUTTON_TITLE = 'Comprar entrada 🔥';

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
  emoji: 'Solo dejó emojis: devuélvele algo juguetón y mínimo, con emojis (ej. "👀🔥 te esperamos").',
  praise: 'Es un elogio: agradécelo con coquetería y gracia, tomando algo concreto de lo que dijo.',
  question: 'Hace una pregunta: en público NO la respondas completa. Di algo corto y tentador que deje con ganas a quien lee (ej. "te dejé todos los detalles por interno 😉🔥") y escribe la respuesta completa en "dm".',
  sensitive: 'Es un tema delicado: NO te comprometas a nada; di solo que le escribes por interno para verlo bien.',
  other: 'Comentario general: responde corto y entretenido, o con una pregunta coqueta que invite a seguir.',
};

/** Botón del DM que puede elegir la IA: entradas, una página del sitio o nada. */
export function normalizeDmButton(raw: unknown, pageKeys: string[] = AGENT_PAGE_KEYS): string {
  if (raw === 'buy') return 'buy';
  if (typeof raw === 'string' && raw.startsWith('page:') && pageKeys.includes(raw.slice(5))) return raw;
  return 'none';
}

export function buildCommentPrompt(input: {
  brandNotes: string; styleExamples: string; recentReplies: string[]; category: CommentCategory; purchaseIntent: boolean; hook?: string | null;
}): string {
  const wantsDm = input.category === 'question';
  return [
    'Eres quien maneja el Instagram de Mansion Playroom y contestas un comentario público de una publicación. Escribe en español chileno, como una persona real desde el celular.',
    'ESTILO PLAYROOM: amable, coqueto y entretenido, con picardía elegante (nunca vulgar ni sexual explícito). Usa 1 o 2 emojis que calcen (😉🔥💜👀😈✨🖤). La respuesta pública también la leen otras personas: que dé ganas de ir o de escribir.',
    'REGLAS DE LA RESPUESTA PÚBLICA ("reply"): una sola frase cortita (máximo 110 caracteres), sin precios, fechas exactas, direcciones, links ni hashtags. No digas que eres una IA ni un equipo ("estamos encantados", "gracias por tu comentario" suenan a robot). No repitas cómo empezaron tus respuestas anteriores. Usa algo concreto de lo que escribió la persona.',
    AI_PHRASES_PROMPT_LINE,
    CATEGORY_HINT[input.category],
    wantsDm
      ? [
        'MENSAJE PRIVADO ("dm"): 1 a 3 frases con la respuesta completa y concreta usando SOLO los datos del contexto (precios, fechas, accesos). Mismo tono cercano y coqueto, con 1 emoji. Cierra con una pregunta corta que invite a seguir conversando. Nunca escribas links: el botón se agrega solo.',
        input.hook ? `Cierra el DM con esta pregunta de enganche (ajústala apenas si hace falta): "${input.hook}"` : '',
        'BOTÓN ("button"): "buy" si la persona quiere comprar, precios, cupos o la próxima fecha; "page:<ruta>" con una ruta exacta de la lista PÁGINAS DEL SITIO si la duda la resuelve mejor esa página; "none" si no hace falta botón.',
        `PÁGINAS DEL SITIO (ruta: tema): ${AGENT_SITE_PAGES.map((p) => `${p.path}: ${p.topic}`).join(' | ')}`,
      ].join('\n')
      : 'Deja "dm" vacío y "button" en "none".',
    `NOTAS DE LA MARCA:\n${input.brandNotes}`,
    input.styleExamples.trim() ? `ASÍ ESCRIBE EL DUEÑO (imita el tono):\n${input.styleExamples.trim()}` : '',
    input.recentReplies.length
      ? `RESPUESTAS PÚBLICAS RECIENTES DEL DUEÑO (aprende el estilo y NO las copies ni empieces igual):\n${input.recentReplies.map((r) => `- ${r}`).join('\n')}`
      : '',
    'Responde solo JSON con las claves "reply", "dm" y "button".',
  ].filter(Boolean).join('\n\n');
}

const COMMENT_SCHEMA = {
  name: 'respuesta_comentario',
  strict: true,
  schema: {
    type: 'object',
    properties: {
      reply: { type: 'string', description: 'Respuesta pública, una frase cortita con emojis.' },
      dm: { type: 'string', description: 'Mensaje privado con la respuesta completa, o vacío.' },
      button: { type: 'string', description: '"buy", "page:<ruta>" o "none".' },
    },
    required: ['reply', 'dm', 'button'],
    additionalProperties: false,
  },
};

export async function draftCommentReply(input: {
  text: string; username?: string | null; category: CommentCategory; purchaseIntent: boolean;
}): Promise<{ reply: string; dm: string; button: string }> {
  const config = normalizeInstagramAgentConfig((await db.getSiteSettings() as any).instagramAgentConfig);
  const recentReplies = await db.recentSentIgReplies(6);
  const wantsDm = input.category === 'question';
  const context = wantsDm ? await buildInstagramContext(new Date()) : '';
  const result = await invokeLLM({ feature: "instagramComments",
    messages: [
      { role: 'system', content: buildCommentPrompt({ brandNotes: config.brandNotes, styleExamples: config.styleExamples, recentReplies, category: input.category, purchaseIntent: input.purchaseIntent, hook: wantsDm ? pickHook(config.hooks, recentReplies) : null }) },
      { role: 'user', content: `${context ? `${context}\n\n---\n` : ''}Comentario${input.username ? ` de @${input.username}` : ''}:\n"""${input.text}"""` },
    ],
    responseFormat: { type: 'json_schema', json_schema: COMMENT_SCHEMA as any },
    maxTokens: 500,
    ...(ENV.anthropicApiKey ? { thinking: NO_THINKING } : {}),
  });
  const parsed = JSON.parse(extractContent(result.choices[0]?.message ?? { content: '' })) as { reply?: string; dm?: string; button?: string };
  const dm = wantsDm ? finalizeCommentDm(parsed.dm ?? '') : '';
  return {
    reply: finalizeCommentReply(parsed.reply ?? ''),
    dm,
    // Una pregunta de compra lleva siempre el botón de entradas aunque la IA lo olvide.
    button: !dm ? 'none' : input.purchaseIntent && normalizeDmButton(parsed.button) === 'none' ? 'buy' : normalizeDmButton(parsed.button),
  };
}

/** El DM puede tener varias frases y saltos, pero nunca links. */
export function finalizeCommentDm(raw: string): string {
  return cleanAiMarks(stripUrlsFromReply(String(raw ?? '')).text).replace(/[¡!]{2,}/g, '!').trim().slice(0, 600);
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

    let draft = { reply: '', dm: '', button: 'none' };
    if (category !== 'sensitive') {
      try { draft = await draftCommentReply({ text: input.text, username: input.username, category, purchaseIntent }); } catch { /* sin borrador: el dueño lo escribe */ }
    }
    const row = await db.insertIgComment({ ...input, category, draftReply: draft.reply || null, draftDm: draft.dm || null, dmButton: draft.dm ? draft.button : null });
    if (!row) return; // Meta reintentó
    await sendPushToAdmins('pushInstagramHandoff', {
      title: pushTitle('💬', 'Comentario', input.username ? `@${input.username}` : null),
      body: `"${clip(input.text, 120)}"\nHay un borrador para aprobar`,
      url: buildAdminUrl({ section: 'instagram', tab: 'comentarios', comment: row.id }),
    });
  } catch (err) {
    console.error('[instagram-comments] no se pudo procesar el comentario', err);
  }
}

/** El dueño aprobó: publica la respuesta y, si hay, manda el DM con su botón
 * (el texto del DM también puede venir editado desde el panel). */
export async function approveComment(id: number, finalReply: string, finalDm?: string | null): Promise<{ dmSent: boolean }> {
  const row = await db.getIgComment(id);
  if (!row) throw new Error('Ese comentario ya no existe.');
  if (row.status === 'sent') throw new Error('Ese comentario ya se respondió.');
  const reply = finalizeCommentReply(finalReply);
  if (!reply) throw new Error('Escribe la respuesta antes de publicar.');

  // Comentario propio en una publicación de la cuenta: se publica y listo.
  if (row.category === 'own') {
    if (!row.mediaId) throw new Error('No se sabe en qué publicación comentar.');
    try {
      await commentOnOwnMedia(row.mediaId, reply);
    } catch (err) {
      const message = err instanceof Error ? err.message.slice(0, 300) : 'No se pudo publicar';
      await db.decideIgComment(id, { status: 'failed', finalReply: reply, error: message });
      throw new Error(`Instagram no dejó publicar: ${message}`);
    }
    await db.decideIgComment(id, { status: 'sent', finalReply: reply, error: null });
    return { dmSent: false };
  }
  const dmText = finalDm === undefined ? (row.draftDm ?? '') : finalizeCommentDm(finalDm ?? '');
  try {
    await replyToComment(row.commentId, reply);
  } catch (err) {
    const message = err instanceof Error ? err.message.slice(0, 300) : 'No se pudo publicar';
    await db.decideIgComment(id, { status: 'failed', finalReply: reply, error: message });
    throw new Error(`Instagram no dejó publicar: ${message}`);
  }
  await db.decideIgComment(id, { status: 'sent', finalReply: reply, draftDm: dmText || null, error: null });

  let dmSent = false;
  if (dmText) {
    try {
      const button = await resolveCommentButton(row.dmButton ?? (row.draftDm ? 'buy' : 'none'), row.mediaId);
      if (button) await sendButtonMessage({ comment_id: row.commentId }, dmText, button);
      else await sendPrivateReply(row.commentId, dmText);
      dmSent = true;
    } catch (err) {
      console.error('[instagram-comments] se publicó la respuesta pero falló el DM', err);
    }
  }
  return { dmSent };
}

/** Botón del DM, con el origen (la publicación) pegado para el embudo. */
async function resolveCommentButton(choice: string, mediaId: string | null): Promise<{ title: string; url: string } | null> {
  const origin = postOrigin(mediaId);
  if (choice === 'buy') {
    const buy = await resolveInstagramBuyLink(new Date(), 'agente-comentario', origin);
    return buy ? { title: DM_BUTTON_TITLE, url: buy.url } : null;
  }
  if (choice.startsWith('page:')) return resolvePageLink(choice.slice(5), 'instagram', 'agente-comentario', origin);
  return null;
}

// ---------------------------------------------------------------------------
// Comentarios propios: la cuenta comenta en sus posts y reels para abrir
// conversación (siempre con aprobación del dueño).
// ---------------------------------------------------------------------------

export function buildOwnCommentPrompt(input: { brandNotes: string; caption: string; mediaType: string; recent: string[] }): string {
  return [
    'Eres quien maneja el Instagram de Mansion Playroom y vas a dejar UN comentario en una publicación propia para abrir conversación y que la gente responda.',
    'ESTILO PLAYROOM: amable, coqueto y entretenido, con picardía elegante (nunca vulgar). 1 o 2 emojis. Español chileno natural.',
    'Formato: una pregunta o invitación corta (máximo 120 caracteres) relacionada con el pie de foto, fácil de contestar (ej. elegir entre opciones, etiquetar a alguien, contar algo). Sin links, sin hashtags, sin precios. No suenes a marca ni a IA.',
    AI_PHRASES_PROMPT_LINE,
    `NOTAS DE LA MARCA:\n${input.brandNotes}`,
    input.recent.length ? `COMENTARIOS QUE YA USASTE (no los repitas ni empieces igual):\n${input.recent.map((r) => `- ${r}`).join('\n')}` : '',
    'Responde solo JSON con la clave "comment".',
  ].filter(Boolean).join('\n\n');
}

const OWN_SCHEMA = {
  name: 'comentario_propio',
  strict: true,
  schema: { type: 'object', properties: { comment: { type: 'string' } }, required: ['comment'], additionalProperties: false },
};

/** Sugiere (o vuelve a sugerir) el comentario propio de una publicación. */
export async function suggestOwnComment(mediaId: string, opts: { notify?: boolean } = {}): Promise<IgComment | null> {
  const media = (await fetchOwnMedia(25)) as { id?: string; caption?: string; media_type?: string }[];
  const post = media.find((m) => m.id === mediaId);
  if (!post) throw new Error('Esa publicación no está entre las 25 más recientes.');
  const config = normalizeInstagramAgentConfig((await db.getSiteSettings() as any).instagramAgentConfig);
  const recent = await db.recentSentIgReplies(8);
  const caption = String(post.caption ?? '');
  const result = await invokeLLM({ feature: "instagramComments",
    messages: [
      { role: 'system', content: buildOwnCommentPrompt({ brandNotes: config.brandNotes, caption, mediaType: String(post.media_type ?? ''), recent }) },
      { role: 'user', content: `Pie de foto de la publicación (${post.media_type === 'VIDEO' ? 'reel' : post.media_type === 'CAROUSEL_ALBUM' ? 'carrusel' : 'foto'}):\n"""${caption.slice(0, 1500) || '(sin pie de foto)'}"""` },
    ],
    responseFormat: { type: 'json_schema', json_schema: OWN_SCHEMA as any },
    maxTokens: 200,
    ...(ENV.anthropicApiKey ? { thinking: NO_THINKING } : {}),
  });
  const parsed = JSON.parse(extractContent(result.choices[0]?.message ?? { content: '' })) as { comment?: string };
  const draft = finalizeCommentReply(parsed.comment ?? '');
  if (!draft) throw new Error('La IA no devolvió un comentario. Intenta de nuevo.');
  const row = await db.upsertOwnCommentDraft({ mediaId, igUserId: ENV.igUserId || 'own', caption, draft });
  if (row && opts.notify) {
    await sendPushToAdmins('pushInstagramHandoff', {
      title: pushTitle('✨', 'Comentario sugerido'),
      body: `"${clip(draft, 120)}"\nApruébalo para abrir conversación`,
      url: buildAdminUrl({ section: 'instagram', tab: 'comentarios', comment: row.id }),
    });
  }
  return row;
}

/** Cron diario: sugiere un comentario propio para cada publicación de los
 * últimos 3 días que todavía no tenga uno (máximo 3 por corrida). */
export async function suggestOwnCommentsForNewPosts(now = Date.now()): Promise<number> {
  const config = normalizeInstagramAgentConfig((await db.getSiteSettings() as any).instagramAgentConfig);
  if (!config.commentsEnabled) return 0;
  const media = (await fetchOwnMedia(6)) as { id?: string; timestamp?: string }[];
  let created = 0;
  for (const m of media) {
    if (created >= 3 || !m.id || !m.timestamp) continue;
    if (now - new Date(m.timestamp).getTime() > 3 * 24 * 60 * 60 * 1000) continue;
    if (await db.hasOwnCommentDraft(m.id)) continue;
    try {
      if (await suggestOwnComment(m.id, { notify: true })) created++;
    } catch (err) {
      console.error('[instagram-comments] no se pudo sugerir el comentario propio', err);
    }
  }
  return created;
}
