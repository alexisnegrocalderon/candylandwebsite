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
  couponPercent: number;
  couponHours: number;
  friendPercent: number;
  /** Producto de la Carta de regalo para quien ya tiene entrada. */
  holderGiftTicketTypeId: number | null;
  holderPlaycoins: number;
}

export interface ContestMessages {
  noTicket: string;
  holderAsk: string;
  holder: string;
  extraChances: string;
  emailNotFound: string;
  boughtUpgrade: string;
  winnerDouble: string;
  winnerVip: string;
  winnerPublic: string;
  winnerPublicNoDm: string;
  afterDraw: string;
  publicReplies: string[];
}

export interface ContestConfig {
  keyword: string;
  startsAt: string | null;
  drawAt: string | null;
  claimHours: number;
  publicReply: boolean;
  couponsAfterDraw: boolean;
  chances: ContestChances;
  prizes: ContestPrizes;
  messages: ContestMessages;
}

export const DEFAULT_CONTEST_MESSAGES: ContestMessages = {
  noTicket:
    '¡Ya estás participando por 1 de las {{ganadores_doble}} {{premio}}, {{nombre}}! 🍬🎉\n\n'
    + 'Hoy tienes {{chances}} chance(s). Súmale más:\n'
    + '• +{{por_etiqueta}} por cada amigo que etiquetes en el post (hasta {{max_etiquetas}})\n'
    + '• +{{bonus_historia}} si compartes el post en tu historia mencionándonos\n'
    + '• +{{bonus_compra_amigo}} por cada amigo que compre con tu link: {{link_invitar}}\n\n'
    + '🎁 Premio por participar: {{porcentaje}}% de descuento en tu entrada con el código {{cupon}}. Vence en {{horas}} horas ⏳\n'
    + 'Si compras durante el concurso pasas al sorteo de {{premio_vip}} con x{{multiplicador}} chances 🔥\n\n'
    + 'Sorteo: {{fecha_sorteo}}. Bases: {{link_bases}}',
  holderAsk: '¿Ya tienes tu entrada? Respóndeme con el correo de tu compra y te mando tus regalos de asistente 💌',
  holder:
    '¡Qué bueno que vienes, {{nombre}}! 🎉 Como ya tienes tu entrada, participas por {{premio_vip}} con {{chances}} chance(s).\n\n'
    + 'Tus regalos de asistente:\n{{lista_regalos}}\n\n'
    + '💌 Para tu amigo/a: {{porcentaje_amigo}}% de descuento con el código {{codigo_amigo}} o con tu link {{link_invitar}}. '
    + 'Cada amigo que compre te suma +{{bonus_compra_amigo}} chances.\n\n'
    + 'Sorteo: {{fecha_sorteo}}. Bases: {{link_bases}}',
  extraChances: '🔥 ¡+{{bonus_historia}} chances por compartir en tu historia! Ahora tienes {{chances}}. Suerte, {{nombre}} 🍀',
  emailNotFound: 'No encontré una compra para esta fiesta con ese correo 🤔 Revisa que sea el mismo con que compraste. Mientras, tu cupón {{cupon}} sigue activo.',
  boughtUpgrade:
    '¡Ya tienes tu entrada, {{nombre}}! 🎉 Pasaste al sorteo de {{premio_vip}} con {{chances}} chances (x{{multiplicador}}).\n\n'
    + 'Tus regalos de asistente:\n{{lista_regalos}}\n\n'
    + '💌 Para tu amigo/a: {{porcentaje_amigo}}% con el código {{codigo_amigo}} o tu link {{link_invitar}}.',
  winnerDouble:
    '🎉 ¡{{nombre}}, GANASTE {{premio_singular}} para {{evento}}! 🍬\n\n'
    + 'Tu código (cubre la entrada completa): {{codigo_premio}}\n'
    + 'Toca el botón, completa los datos y listo. ¡Nos vemos en la fiesta! 🥳',
  winnerVip: '🎉 ¡{{nombre}}, ganaste {{premio_vip}}! Ya quedó cargado en tu entrada: muéstralo en caja la noche de la fiesta 🥂',
  winnerPublic: '🎉 ¡{{nombre}} ganaste! Revisa tus mensajes directos 💌',
  winnerPublicNoDm: '🎉 ¡{{nombre}} ganaste! Escríbenos por DM antes de {{plazo}} para recibir tu premio 💌',
  afterDraw: 'El sorteo ya se hizo 🎉 pero igual te dejo {{porcentaje}}% de descuento en tu entrada con el código {{cupon}} (vence en {{horas}} h). ¡Te esperamos!',
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
    friendPercent: 20,
    holderGiftTicketTypeId: null,
    holderPlaycoins: 2000,
  },
  messages: DEFAULT_CONTEST_MESSAGES,
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

/** Limpia la configuración guardada (o la que manda el panel): todo campo
 * que falte o venga roto vuelve al valor propuesto, así un concurso nunca
 * queda con un número imposible. */
export function normalizeContestConfig(raw: unknown): ContestConfig {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, any>;
  const c = (r.chances && typeof r.chances === 'object' ? r.chances : {}) as Record<string, unknown>;
  const p = (r.prizes && typeof r.prizes === 'object' ? r.prizes : {}) as Record<string, unknown>;
  const m = (r.messages && typeof r.messages === 'object' ? r.messages : {}) as Record<string, unknown>;
  const d = DEFAULT_CONTEST_CONFIG;
  const replies = Array.isArray(m.publicReplies)
    ? m.publicReplies.filter((s): s is string => typeof s === 'string' && s.trim().length > 0).map((s) => s.slice(0, 300)).slice(0, 10)
    : [];
  return {
    keyword: typeof r.keyword === 'string' ? r.keyword.trim().slice(0, 40) : d.keyword,
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
      couponHours: int(p.couponHours, d.prizes.couponHours, 1, 720),
      friendPercent: int(p.friendPercent, d.prizes.friendPercent, 0, 100),
      holderGiftTicketTypeId: idOrNull(p.holderGiftTicketTypeId),
      holderPlaycoins: int(p.holderPlaycoins, d.prizes.holderPlaycoins, 0, 100_000),
    },
    messages: {
      noTicket: text(m.noTicket, d.messages.noTicket),
      holderAsk: text(m.holderAsk, d.messages.holderAsk),
      holder: text(m.holder, d.messages.holder),
      extraChances: text(m.extraChances, d.messages.extraChances),
      emailNotFound: text(m.emailNotFound, d.messages.emailNotFound),
      boughtUpgrade: text(m.boughtUpgrade, d.messages.boughtUpgrade),
      winnerDouble: text(m.winnerDouble, d.messages.winnerDouble),
      winnerVip: text(m.winnerVip, d.messages.winnerVip),
      winnerPublic: text(m.winnerPublic, d.messages.winnerPublic, 300),
      winnerPublicNoDm: text(m.winnerPublicNoDm, d.messages.winnerPublicNoDm, 300),
      afterDraw: text(m.afterDraw, d.messages.afterDraw),
      publicReplies: replies.length > 0 ? replies : d.messages.publicReplies,
    },
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
