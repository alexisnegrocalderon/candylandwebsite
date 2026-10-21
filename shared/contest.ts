/* Concursos de Instagram (admin → Comunidad → Concursos): las reglas puras,
 * sin base de datos ni red, para poder probarlas solas. Lo que toca la base
 * y Meta vive en server/contests.ts.
 *
 * Cómo funciona un concurso:
 * - Se participa comentando el post elegido (cualquier comentario cuenta) o
 *   escribiendo la palabra clave por DM / respuesta a historia.
 * - Chances: 1 base + 1 por amigo etiquetado (con tope) + bonus por compartir
 *   el post en historia mencionando la cuenta + bonus por cada amigo que
 *   compre con tu link. Comprar tu entrada durante el concurso multiplica.
 * - Dos sorteos: entradas dobles entre quienes NO tienen entrada, y el premio
 *   VIP entre quienes ya la tienen (incluye a quien compró durante el
 *   concurso, con sus chances multiplicadas).
 * - Premio de consuelo inmediato por DM: cupón personal que vence en pocas
 *   horas (sin entrada) o regalos de asistente + código para un amigo (con
 *   entrada). */

export interface ContestChances {
  base: number;
  perMention: number;
  maxMentions: number;
  storyBonus: number;
  perInvitedPurchase: number;
  buyerMultiplier: number;
}

export interface ContestPrizes {
  doubleWinners: number;
  doubleAlternates: number;
  /** Acceso que se regala (ej. Dúo). El código del premio cubre UNA unidad. */
  prizeTicketTypeId: number | null;
  vipWinners: number;
  vipAlternates: number;
  /** Producto de la Carta que se carga gratis en la entrada del ganador VIP. */
  vipPrizeTicketTypeId: number | null;
  vipPrizeLabel: string;
  /** 20% extra sobre el precio congelado, durante las primeras horas. */
  couponPercent: number;
  couponHours: number;
  /** El precio congelado del cupón dura hasta estas horas después del sorteo. */
  priceLockHoursAfterDraw: number;
  /** Ganador que ya había comprado: horas para elegir devolución o regalo. */
  choiceHours: number;
  friendPercent: number;
  /** Producto de la Carta de regalo para quien ya tiene entrada. */
  holderGiftTicketTypeId: number | null;
  holderPlaycoins: number;
  /** El 1º del ranking de cada tabla gana seguro (apagado en el sorteo simple). */
  guaranteedLeader: boolean;
}

export interface ContestMessages {
  noTicket: string;
  holderAsk: string;
  holder: string;
  extraChances: string;
  emailNotFound: string;
  boughtUpgrade: string;
  storyToReel: string;
  winnerVerify: string;
  verifyReceived: string;
  verifyMissing: string;
  verifyRejected: string;
  winnerDouble: string;
  winnerBuyer: string;
  choiceGift: string;
  refundDone: string;
  winnerVip: string;
  winnerPublic: string;
  winnerPublicNoDm: string;
  afterDraw: string;
  publicReplies: string[];
}

/** Ranking y empujes automáticos (server/contestRanking.ts). */
export interface ContestRankingConfig {
  /** Comentario diario con el top en el reel. */
  dailyComment: boolean;
  /** Hora de Chile (0-23) del comentario diario. */
  dailyHour: number;
  /** Respuestas públicas con su posición a quienes están cerca de subir. */
  publicReplies: boolean;
  maxRepliesPerDay: number;
  /** Tips por DM cuando el participante escribe (una vez al día). */
  dmTips: boolean;
  /** Correo a quienes ya compraron el día antes del sorteo. */
  emailBuyers: boolean;
}

/** Verificación del ganador antes de entregar el premio (server/contests.ts). */
export interface ContestVerifyConfig {
  enabled: boolean;
}

/** Retos por hitos: al llegar a N comentarios se desbloquea un % para todos. */
export interface ContestMilestoneStep {
  comments: number;
  percent: number;
}
export interface ContestMilestonesConfig {
  steps: ContestMilestoneStep[];
  /** El código del hito dura estas horas desde el último hito alcanzado. */
  hours: number;
}

export interface ContestConfig {
  /** Palabras clave separadas por coma; el comentario tiene que traerlas TODAS
   * (ej. "quiero, entrada" calza con "quiero mi entrada doble"). */
  keyword: string;
  /** Frase que ve la gente en el aviso y en las bases (ej. "quiero mi entrada
   * doble"). Vacía = las palabras clave tal cual. */
  keywordPhrase: string;
  startsAt: string | null;
  drawAt: string | null;
  claimHours: number;
  publicReply: boolean;
  couponsAfterDraw: boolean;
  chances: ContestChances;
  prizes: ContestPrizes;
  messages: ContestMessages;
  ranking: ContestRankingConfig;
  verify: ContestVerifyConfig;
  milestones: ContestMilestonesConfig;
}

export const DEFAULT_CONTEST_MESSAGES: ContestMessages = {
  noTicket:
    '¡Estás dentro, {{nombre}}! 🔥 Hoy llevas {{chances}} puntos. Sorteamos {{ganadores_doble}} {{premio}} y el 1º del ranking gana una seguro… ¿te vas a quedar mirando?\n\n'
    + 'Sube más rápido:\n'
    + '👥 +{{por_etiqueta}} por amigo etiquetado\n'
    + '📲 +{{bonus_historia}} si compartes el reel en tu historia y nos mencionas\n'
    + '🛒 +{{bonus_compra_amigo}} por amigo que compre con tu link: {{link_invitar}}\n\n'
    + '🔒 Tu código {{cupon}} congela el precio de hoy hasta {{congelado_hasta}} (+{{porcentaje}}% extra si compras en {{horas}} h).\n'
    + '🛡️ Compra ahora: tus puntos pasan a x{{multiplicador}} y, si ganas, te devolvemos tu entrada o te llevas otra para regalar.\n\n'
    + 'Sorteo: {{fecha_sorteo}} · Bases: {{link_bases}}',
  holderAsk: '¿Ya tienes entrada? Respóndeme con el correo de tu compra 💌',
  holder:
    '¡Ya estás adentro, {{nombre}}! 🎉 Y compites por {{premio_vip}} y por llegar al 1º del ranking. Tus regalos:\n{{lista_regalos}}\n\n'
    + '👥 +{{por_etiqueta}} por amigo etiquetado · 📲 +{{bonus_historia}} si compartes en tu historia\n'
    + '💌 Trae a tu gente: {{porcentaje_amigo}}% con {{codigo_amigo}} (o tu link {{link_invitar}}). Cada amigo que compre = +{{bonus_compra_amigo}} puntos para ti.\n\n'
    + 'Sorteo: {{fecha_sorteo}}',
  extraChances: '🔥 ¡+{{bonus_historia}} puntos por compartir en tu historia! Ahora tienes {{chances}}. Suerte, {{nombre}} 🍀',
  emailNotFound: 'No encontré una compra con ese correo 🤔 Revisa que sea el de tu compra. Tu código {{cupon}} sigue activo.',
  boughtUpgrade:
    '¡Compra confirmada, {{nombre}}! 🔥 Tus puntos ahora van x{{multiplicador}} ({{chances}}). Si ganas, eliges: te devolvemos tu entrada o te llevas otra para regalar.\n\n'
    + 'Tus regalos:\n{{lista_regalos}}\n\n'
    + '💌 Trae a tu gente: {{porcentaje_amigo}}% con {{codigo_amigo}} o tu link {{link_invitar}} (+{{bonus_compra_amigo}} puntos por cada amigo que compre).',
  storyToReel:
    '🔥 {{nombre}}, ya estás dentro… pero con {{puntos_texto}} 😏\n'
    + 'El 1º del ranking se lleva su entrada SEGURO. ¿Vas a dejar que otro te la quite?\n\n'
    + 'Sube ahora:\n'
    + '👥 +{{por_etiqueta}} por cada amigo que etiquetes\n'
    + '🛒 +{{bonus_compra_amigo}} por cada amigo que compre con tu link\n'
    + '👉 Comenta "{{frase}}" en el reel: {{link_reel}}',
  winnerVerify:
    '🎉 ¡{{nombre}}, quedaste entre los ganadores de {{evento}}! 🍬\n\n'
    + 'Antes de entregarte el premio verificamos que cumples los requisitos para asistir a Playroom (evento +18). Respóndenos en un solo mensaje:\n'
    + '1) Tu RUT\n2) Tu fecha de nacimiento (dd/mm/aaaa)\n3) La palabra ACEPTO: aceptas nuestros valores y el derecho de permanencia\n\n'
    + 'Tienes hasta {{plazo}}. Cuando lo revisemos te llega el premio 💌',
  verifyReceived: '✅ ¡Gracias, {{nombre}}! Recibimos tus datos. Los revisamos y en cuanto estén aprobados te mandamos tu premio por aquí 🍬',
  verifyMissing: 'Casi, {{nombre}} 🙌 Nos falta: {{faltante}}. Respóndenos en un mensaje y seguimos.',
  verifyRejected: 'Hola {{nombre}} 🙏 Revisamos tus datos y no podemos entregarte el premio porque no cumples los requisitos para asistir a Playroom. Gracias por participar.',
  winnerDouble:
    '🎉 ¡{{nombre}}, GANASTE {{premio_singular}} para {{evento}}! 🍬\n\n'
    + 'Tu código (cubre la entrada completa): {{codigo_premio}}\n'
    + 'Toca el botón, completa los datos y listo. ¡Nos vemos en la fiesta! 🥳',
  winnerBuyer:
    '🎉 ¡{{nombre}}, GANASTE en el concurso de {{evento}}! 🍬\n\n'
    + 'Como ya tienes tu entrada, eliges tu premio:\n'
    + '💸 Te devolvemos {{monto_devolucion}} de tu entrada, o\n'
    + '🎁 Te llevas {{premio_singular}} EXTRA para regalar a quien quieras.\n\n'
    + 'Elige aquí antes de {{plazo}}: {{link_elegir}}',
  choiceGift: '🎁 ¡Listo, {{nombre}}! Este es el código de la entrada para regalar: {{codigo_premio}}. Quien la use la compra a $0 con ese código.',
  refundDone: '💸 {{nombre}}, ya te devolvimos {{monto_devolucion}} por tu premio del concurso. Tu entrada sigue igual de válida. ¡Nos vemos en la fiesta! 🥳',
  winnerVip: '🎉 ¡{{nombre}}, ganaste {{premio_vip}}! Ya quedó cargado en tu entrada: muéstralo en caja la noche de la fiesta 🥂',
  winnerPublic: '🎉 ¡{{nombre}} ganaste! Revisa tus mensajes directos 💌',
  winnerPublicNoDm: '🎉 ¡{{nombre}} ganaste! Escríbenos por DM antes de {{plazo}} para recibir tu premio 💌',
  afterDraw: 'El sorteo ya se hizo 🎉 pero tu código {{cupon}} congela el precio hasta {{congelado_hasta}} (+{{porcentaje}}% extra si compras en {{horas}} h). ¡Te esperamos!',
  publicReplies: [
    '¡Ya estás participando! 🍬 Revisa tus DM 💌',
    '¡Dentro! 🎉 Te dejamos un regalo por DM',
    '¡Suerte! 🍀 Mira tus mensajes, te mandamos algo 💌',
    '¡Anotad@! 🔥 Revisa tu DM',
  ],
};

export const DEFAULT_CONTEST_CONFIG: ContestConfig = {
  // Palabra poco común a propósito: "fiesta" aparece en cualquier pregunta
  // por DM y le quitaría la conversación al agente de ventas.
  keyword: 'CONCURSO',
  keywordPhrase: '',
  startsAt: null,
  drawAt: null,
  claimHours: 24,
  publicReply: true,
  couponsAfterDraw: true,
  chances: { base: 1, perMention: 1, maxMentions: 10, storyBonus: 3, perInvitedPurchase: 10, buyerMultiplier: 3 },
  prizes: {
    doubleWinners: 2,
    doubleAlternates: 2,
    prizeTicketTypeId: null,
    vipWinners: 1,
    vipAlternates: 1,
    vipPrizeTicketTypeId: null,
    vipPrizeLabel: 'Mejora VIP',
    couponPercent: 20,
    couponHours: 24,
    priceLockHoursAfterDraw: 48,
    choiceHours: 48,
    friendPercent: 20,
    holderGiftTicketTypeId: null,
    holderPlaycoins: 2000,
    guaranteedLeader: true,
  },
  messages: DEFAULT_CONTEST_MESSAGES,
  ranking: { dailyComment: true, dailyHour: 20, publicReplies: true, maxRepliesPerDay: 15, dmTips: true, emailBuyers: true },
  verify: { enabled: true },
  milestones: { steps: [{ comments: 100, percent: 10 }, { comments: 250, percent: 15 }, { comments: 500, percent: 20 }], hours: 48 },
};

function int(v: unknown, fallback: number, min: number, max: number): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function idOrNull(v: unknown): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  return Number.isInteger(n) && n > 0 ? n : null;
}

function text(v: unknown, fallback: string, max = 2000): string {
  return typeof v === 'string' && v.trim() ? v.slice(0, max) : fallback;
}

function isoOrNull(v: unknown): string | null {
  if (typeof v !== 'string' || !v) return null;
  const t = new Date(v).getTime();
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

function normalizeSteps(raw: unknown, fallback: ContestMilestoneStep[]): ContestMilestoneStep[] {
  if (!Array.isArray(raw)) return fallback;
  const steps = raw
    .map((s) => (s && typeof s === 'object' ? s as Record<string, unknown> : null))
    .filter((s): s is Record<string, unknown> => !!s)
    .map((s) => ({ comments: int(s.comments, 0, 0, 100_000), percent: int(s.percent, 0, 0, 100) }))
    .filter((s) => s.comments > 0 && s.percent > 0)
    .sort((a, b) => a.comments - b.comments)
    .slice(0, 6);
  return steps.length > 0 ? steps : fallback;
}

/** Limpia la configuración guardada (o la que manda el panel): todo campo
 * que falte o venga roto vuelve al valor propuesto, así un concurso nunca
 * queda con un número imposible. */
export function normalizeContestConfig(raw: unknown): ContestConfig {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, any>;
  const c = (r.chances && typeof r.chances === 'object' ? r.chances : {}) as Record<string, unknown>;
  const p = (r.prizes && typeof r.prizes === 'object' ? r.prizes : {}) as Record<string, unknown>;
  const m = (r.messages && typeof r.messages === 'object' ? r.messages : {}) as Record<string, unknown>;
  const k = (r.ranking && typeof r.ranking === 'object' ? r.ranking : {}) as Record<string, unknown>;
  const ms = (r.milestones && typeof r.milestones === 'object' ? r.milestones : {}) as Record<string, unknown>;
  const v = (r.verify && typeof r.verify === 'object' ? r.verify : {}) as Record<string, unknown>;
  const d = DEFAULT_CONTEST_CONFIG;
  const replies = Array.isArray(m.publicReplies)
    ? m.publicReplies.filter((s): s is string => typeof s === 'string' && s.trim().length > 0).map((s) => s.slice(0, 300)).slice(0, 10)
    : [];
  return {
    keyword: typeof r.keyword === 'string' ? r.keyword.trim().slice(0, 80) : d.keyword,
    keywordPhrase: typeof r.keywordPhrase === 'string' ? r.keywordPhrase.trim().slice(0, 80) : d.keywordPhrase,
    startsAt: isoOrNull(r.startsAt),
    drawAt: isoOrNull(r.drawAt),
    claimHours: int(r.claimHours, d.claimHours, 1, 168),
    publicReply: typeof r.publicReply === 'boolean' ? r.publicReply : d.publicReply,
    couponsAfterDraw: typeof r.couponsAfterDraw === 'boolean' ? r.couponsAfterDraw : d.couponsAfterDraw,
    chances: {
      base: int(c.base, d.chances.base, 1, 100),
      perMention: int(c.perMention, d.chances.perMention, 0, 100),
      maxMentions: int(c.maxMentions, d.chances.maxMentions, 0, 100),
      storyBonus: int(c.storyBonus, d.chances.storyBonus, 0, 100),
      perInvitedPurchase: int(c.perInvitedPurchase, d.chances.perInvitedPurchase, 0, 1000),
      buyerMultiplier: int(c.buyerMultiplier, d.chances.buyerMultiplier, 1, 20),
    },
    prizes: {
      doubleWinners: int(p.doubleWinners, d.prizes.doubleWinners, 0, 20),
      doubleAlternates: int(p.doubleAlternates, d.prizes.doubleAlternates, 0, 20),
      prizeTicketTypeId: idOrNull(p.prizeTicketTypeId),
      vipWinners: int(p.vipWinners, d.prizes.vipWinners, 0, 20),
      vipAlternates: int(p.vipAlternates, d.prizes.vipAlternates, 0, 20),
      vipPrizeTicketTypeId: idOrNull(p.vipPrizeTicketTypeId),
      vipPrizeLabel: text(p.vipPrizeLabel, d.prizes.vipPrizeLabel, 80),
      couponPercent: int(p.couponPercent, d.prizes.couponPercent, 1, 100),
      couponHours: int(p.couponHours, d.prizes.couponHours, 0, 720),
      priceLockHoursAfterDraw: int(p.priceLockHoursAfterDraw, d.prizes.priceLockHoursAfterDraw, 0, 720),
      choiceHours: int(p.choiceHours, d.prizes.choiceHours, 1, 168),
      friendPercent: int(p.friendPercent, d.prizes.friendPercent, 0, 100),
      holderGiftTicketTypeId: idOrNull(p.holderGiftTicketTypeId),
      holderPlaycoins: int(p.holderPlaycoins, d.prizes.holderPlaycoins, 0, 100_000),
      guaranteedLeader: typeof p.guaranteedLeader === 'boolean' ? p.guaranteedLeader : d.prizes.guaranteedLeader,
    },
    messages: {
      noTicket: text(m.noTicket, d.messages.noTicket),
      holderAsk: text(m.holderAsk, d.messages.holderAsk),
      holder: text(m.holder, d.messages.holder),
      extraChances: text(m.extraChances, d.messages.extraChances),
      emailNotFound: text(m.emailNotFound, d.messages.emailNotFound),
      boughtUpgrade: text(m.boughtUpgrade, d.messages.boughtUpgrade),
      storyToReel: text(m.storyToReel, d.messages.storyToReel),
      winnerVerify: text(m.winnerVerify, d.messages.winnerVerify),
      verifyReceived: text(m.verifyReceived, d.messages.verifyReceived),
      verifyMissing: text(m.verifyMissing, d.messages.verifyMissing),
      verifyRejected: text(m.verifyRejected, d.messages.verifyRejected),
      winnerDouble: text(m.winnerDouble, d.messages.winnerDouble),
      winnerBuyer: text(m.winnerBuyer, d.messages.winnerBuyer),
      choiceGift: text(m.choiceGift, d.messages.choiceGift),
      refundDone: text(m.refundDone, d.messages.refundDone),
      winnerVip: text(m.winnerVip, d.messages.winnerVip),
      winnerPublic: text(m.winnerPublic, d.messages.winnerPublic, 300),
      winnerPublicNoDm: text(m.winnerPublicNoDm, d.messages.winnerPublicNoDm, 300),
      afterDraw: text(m.afterDraw, d.messages.afterDraw),
      publicReplies: replies.length > 0 ? replies : d.messages.publicReplies,
    },
    ranking: {
      dailyComment: typeof k.dailyComment === 'boolean' ? k.dailyComment : d.ranking.dailyComment,
      dailyHour: int(k.dailyHour, d.ranking.dailyHour, 0, 23),
      publicReplies: typeof k.publicReplies === 'boolean' ? k.publicReplies : d.ranking.publicReplies,
      maxRepliesPerDay: int(k.maxRepliesPerDay, d.ranking.maxRepliesPerDay, 0, 100),
      dmTips: typeof k.dmTips === 'boolean' ? k.dmTips : d.ranking.dmTips,
      emailBuyers: typeof k.emailBuyers === 'boolean' ? k.emailBuyers : d.ranking.emailBuyers,
    },
    verify: { enabled: typeof v.enabled === 'boolean' ? v.enabled : d.verify.enabled },
    milestones: { steps: normalizeSteps(ms.steps, d.milestones.steps), hours: int(ms.hours, d.milestones.hours, 1, 720) },
  };
}

export interface ChanceInput {
  mentionCount: number;
  storyMentioned: boolean;
  invitedPurchases: number;
  boughtDuringContest: boolean;
}

/** Chances de una persona en el sorteo que le toque. */
export function computeChances(input: ChanceInput, chances: ContestChances): number {
  const mentions = Math.min(Math.max(0, input.mentionCount), chances.maxMentions);
  const sum = chances.base
    + mentions * chances.perMention
    + (input.storyMentioned ? chances.storyBonus : 0)
    + Math.max(0, input.invitedPurchases) * chances.perInvitedPurchase;
  return input.boughtDuringContest ? sum * chances.buyerMultiplier : sum;
}

/** Cuentas etiquetadas en un comentario, normalizadas y sin repetir. Deja
 * fuera a la propia persona y a las cuentas de `exclude` (la cuenta oficial):
 * etiquetarse a uno mismo o a la productora no suma. */
export function parseMentions(commentText: string, exclude: string[] = []): string[] {
  const skip = new Set(exclude.map((h) => h.toLowerCase().replace(/^@+/, '')).filter(Boolean));
  const out: string[] = [];
  for (const match of Array.from(commentText.matchAll(/(^|[^a-zA-Z0-9._])@([a-zA-Z0-9._]{1,30})/g))) {
    const handle = match[2].toLowerCase().replace(/\.+$/, '');
    if (!handle || skip.has(handle) || out.includes(handle)) continue;
    out.push(handle);
  }
  return out;
}

/** Junta las etiquetas nuevas con las que ya tenía (sin repetir). */
export function mergeMentions(existing: string[], incoming: string[]): string[] {
  const out = [...existing];
  for (const h of incoming) if (!out.includes(h)) out.push(h);
  return out.slice(0, 200);
}

/** ¿El texto trae la palabra clave? Sin mayúsculas ni tildes. */
export function hasContestKeyword(textIn: string, keyword: string): boolean {
  const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const k = norm(keyword.trim());
  if (!k) return false;
  return new RegExp(`(^|[^a-z0-9])${k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^a-z0-9])`).test(norm(textIn));
}

/** ¿El mensaje es SOLO la palabra clave (con o sin signos, mayúsculas o
 * emojis alrededor)? "concurso", "CONCURSO!" y "🎉 Concurso" sí; "cómo
 * participo en el concurso" no: eso lo contesta el agente. */
const normWords = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** "quiero, entrada" → ["quiero", "entrada"] (sin tildes, sin repetir, máx. 5). */
export function parseKeywords(raw: string): string[] {
  const out: string[] = [];
  for (const part of raw.split(/[,;\n]/)) {
    const k = normWords(part);
    if (k && !out.includes(k)) out.push(k);
  }
  return out.slice(0, 5);
}

/** ¿El texto trae TODAS las palabras clave? Cada una al comienzo de una
 * palabra ("entrada" calza con "entradas"; "quiero" no calza con "no
 * quieres"). Sin palabras clave no calza nada. */
export function matchesAllKeywords(textIn: string, keywords: string[]): boolean {
  if (keywords.length === 0) return false;
  const text = ` ${normWords(textIn)}`;
  return keywords.every((k) => text.includes(` ${k}`));
}

/** Qué palabras clave faltan en el texto (vacío = las trae todas). Para el
 * probador del panel: muestra por qué una frase no inscribe. */
export function missingKeywords(textIn: string, keywords: string[]): string[] {
  const text = ` ${normWords(textIn)}`;
  return keywords.filter((k) => !text.includes(` ${k}`));
}

/** ¿Este mensaje por DM inscribe? Trae todas las palabras clave y es corto
 * (palabras clave + 2) y sin pregunta: "quiero mi entrada doble" sí; "hola,
 * quiero una entrada para el viernes, ¿cuánto vale?" no, eso lo contesta el
 * agente. */
export function dmEnrolls(textIn: string, keywordRaw: string): boolean {
  const keywords = parseKeywords(keywordRaw);
  if (!matchesAllKeywords(textIn, keywords) || textIn.includes('?') || textIn.includes('¿')) return false;
  return normWords(textIn).split(' ').length <= keywords.length + 2;
}

/** ¿Este comentario inscribe? Quien ya participa suma etiquetas con cualquier
 * comentario; quien todavía no, tiene que comentar la palabra clave (si la
 * palabra está vacía, cualquier comentario inscribe). */
export function commentEnrolls(commentText: string, keyword: string, alreadyParticipates: boolean): boolean {
  const keywords = parseKeywords(keyword);
  return alreadyParticipates || keywords.length === 0 || matchesAllKeywords(commentText, keywords);
}

/** Primer email que aparezca en el texto (la persona responde con el correo
 * de su compra). */
export function extractEmail(textIn: string): string | null {
  const m = textIn.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  return m ? m[0].toLowerCase() : null;
}

/** Reemplaza `{{clave}}` por su valor. Las claves sin valor se borran (y la
 * línea queda limpia), para que un mensaje editado a mano nunca muestre
 * llaves sueltas. */
export function renderContestTemplate(template: string, vars: Record<string, string | number | null | undefined>): string {
  return template
    .replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (_, key: string) => {
      const v = vars[key];
      return v === null || v === undefined ? '' : String(v);
    })
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export interface DrawEntry {
  id: number;
  weight: number;
}

/** Sorteo ponderado sin reposición: cada chance es un "boleto". Devuelve
 * hasta `count` ids en el orden en que salieron (los primeros son ganadores,
 * los siguientes suplentes). `random` devuelve [0, 1). */
export function weightedDraw(entries: DrawEntry[], count: number, random: () => number): number[] {
  const pool = entries.filter((e) => e.weight > 0).map((e) => ({ ...e }));
  const picked: number[] = [];
  while (picked.length < count && pool.length > 0) {
    const total = pool.reduce((s, e) => s + e.weight, 0);
    let r = random() * total;
    let idx = pool.length - 1;
    for (let i = 0; i < pool.length; i++) {
      r -= pool[i].weight;
      if (r < 0) { idx = i; break; }
    }
    picked.push(pool[idx].id);
    pool.splice(idx, 1);
  }
  return picked;
}

export type ContestPhase = 'draft' | 'scheduled' | 'live' | 'drawn' | 'paused' | 'finished';

/** En qué momento está el concurso, según su estado guardado y las fechas. */
export function contestPhase(
  contest: { status: string; drawnAt: Date | string | null },
  config: Pick<ContestConfig, 'startsAt'>,
  now: Date = new Date(),
): ContestPhase {
  if (contest.status === 'draft') return 'draft';
  if (contest.status === 'paused') return 'paused';
  if (contest.status === 'finished') return 'finished';
  if (contest.drawnAt) return 'drawn';
  if (config.startsAt && new Date(config.startsAt).getTime() > now.getTime()) return 'scheduled';
  return 'live';
}

/** Fecha propuesta del sorteo: 3 días antes de la fiesta, a las 20:00 de
 * Chile (aprox. -3 h UTC; el panel la muestra y se puede mover). */
export function defaultDrawAt(eventDate: Date | string): string {
  const d = new Date(eventDate);
  d.setUTCDate(d.getUTCDate() - 3);
  d.setUTCHours(23, 0, 0, 0);
  return d.toISOString();
}

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** Código legible sin caracteres ambiguos (sin 0/O ni 1/I). */
export function randomContestCode(prefix: string, length = 5, random: () => number = Math.random): string {
  let s = '';
  for (let i = 0; i < length; i++) s += CODE_ALPHABET[Math.floor(random() * CODE_ALPHABET.length)];
  return `${prefix}-${s}`;
}

/** Código corto del link personal para invitar amigos (/c/<código>). */
export function randomInviteCode(random: () => number = Math.random): string {
  let s = '';
  for (let i = 0; i < 6; i++) s += CODE_ALPHABET[Math.floor(random() * CODE_ALPHABET.length)].toLowerCase();
  return s;
}

/** "1 entrada doble" / "2 entradas dobles" a partir del nombre del acceso. */
export function prizeLabels(ticketName: string | null | undefined, count: number): { plural: string; singular: string } {
  const name = (ticketName ?? '').trim();
  if (!name) return { plural: count === 1 ? 'entrada doble' : 'entradas dobles', singular: 'una entrada doble' };
  return { plural: `entradas ${name}`, singular: `una entrada ${name}` };
}

/** Bytes en UTF-8 (Instagram limita el texto de un DM a 1000 bytes, y cada
 * emoji pesa 4 y cada tilde 2). */
export function utf8Bytes(text: string): number {
  return new TextEncoder().encode(text).length;
}

/** Deja un DM dentro del límite de Instagram sin cortarlo a la mitad: saca
 * párrafos completos desde el final (nunca el primero ni el último, que lleva
 * el link) hasta que cabe. */
export function fitDmText(text: string, maxBytes = 900): string {
  const parts = text.split('\n\n');
  while (utf8Bytes(parts.join('\n\n')) > maxBytes && parts.length > 2) parts.splice(parts.length - 2, 1);
  return parts.join('\n\n');
}

/** Respuesta pública a un comentario cuando no se le pudo mandar el DM: lo
 * invita a escribir la palabra clave, así abre la conversación y el sistema
 * le contesta por el chat normal. */
export function dmFallbackReply(keyword: string, phrase = ''): string {
  const label = phrase.trim() || parseKeywords(keyword).join(' ') || 'CONCURSO';
  return `¡Ya participas! 🎉 Escríbenos "${label}" por DM y te mandamos tu código 💌`;
}

/** % del cupón personal sobre el PRECIO GENERAL (`basedOnOriginalPrice`) que
 * deja el acceso al precio de la tanda en que la persona participó (`locked`,
 * % de descuento de esa tanda), aunque hoy rija otra (`current`), y con
 * `extra` % de descuento adicional mientras dure. Como todas las tandas
 * copian `originalPrice`, sirve igual para cualquier acceso y cantidad.
 * Ej.: participó con 50% (precio 0,5), hoy rige 40% (0,6), sin extra →
 * 10% del general; con 20% extra → 0,6 − 0,4 = 20%. */
export function priceLockCodePercent(lockedPct: number, currentPct: number, extraPct: number): number {
  const target = (1 - lockedPct / 100) * (1 - extraPct / 100);
  const current = 1 - currentPct / 100;
  return Math.max(0, Math.min(100, Math.round((current - target) * 100)));
}

/** Devolución de un ganador que ya había comprado: lo pagado en accesos, con
 * tope en el valor del premio. */
export function refundAmountFor(paidAccesos: number, prizeValue: number): number {
  return Math.max(0, Math.round(Math.min(paidAccesos, prizeValue)));
}

/** ¿A qué sorteo va? Entradas dobles: sin entrada o compró durante el
 * concurso (si gana elige devolución o regalo). VIP: ya tenía entrada antes. */
export function drawPoolFor(p: { hasTicket: boolean; boughtDuringContest: boolean }): 'double' | 'vip' {
  return !p.hasTicket || p.boughtDuringContest ? 'double' : 'vip';
}
