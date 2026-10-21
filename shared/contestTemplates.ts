import { normalizeContestConfig, type ContestConfig } from './contest';

/** Plantillas de concurso: cada una es una mecánica con su configuración ya
 * armada (puntos, premios, textos, avisos automáticos). Al crear un concurso
 * se elige una y todo queda editable. Los textos usan solo variables
 * (`{{evento}}`, `{{premio}}`, `{{frase}}`…), nada fijo de un evento. */
export type ContestTemplateKey = 'ranking' | 'draw' | 'likes' | 'referrals' | 'milestones' | 'quiz' | 'flash';

export interface ContestTemplate {
  key: ContestTemplateKey;
  name: string;
  emoji: string;
  tagline: string;
  description: string;
  /** Duración típica, en horas desde que arranca hasta el cierre. */
  typicalHours: number;
  /** Presets de duración que ofrece el asistente (horas). */
  durationPresets: number[];
  /** Lo que sobrescribe la plantilla sobre los valores propuestos. */
  overrides: Record<string, unknown>;
}

export const CONTEST_TEMPLATES: ContestTemplate[] = [
  {
    key: 'ranking',
    name: 'Ranking de puntos',
    emoji: '🏆',
    tagline: 'Los puntos se acumulan y el 1º del ranking gana seguro',
    description:
      'Comentar el reel inscribe. Cada amigo etiquetado, historia compartida y compra de un amigo suma puntos. '
      + 'Ranking en vivo con comentario diario, el 1º de cada tabla gana seguro y el resto se sortea. Dura varios días.',
    typicalHours: 24 * 7,
    durationPresets: [72, 24 * 5, 24 * 7],
    overrides: {},
  },
  {
    key: 'draw',
    name: 'Sorteo simple con cupón',
    emoji: '🎁',
    tagline: 'Comentas, entras y se sortea; todos se llevan un cupón',
    description:
      'Comentar la palabra clave inscribe, sin puntos ni ranking. Se sortea entre todos y todos reciben un cupón de consuelo '
      + 'que congela el precio. Es el más simple de explicar y de operar.',
    typicalHours: 48,
    durationPresets: [24, 48, 72],
    overrides: {
      chances: { base: 1, perMention: 0, maxMentions: 0, storyBonus: 0, perInvitedPurchase: 0, buyerMultiplier: 1 },
      prizes: { doubleWinners: 1, doubleAlternates: 2, vipWinners: 0, vipAlternates: 0, guaranteedLeader: false },
      ranking: { dailyComment: false, publicReplies: false, dmTips: false, emailBuyers: false },
      messages: {
        noTicket:
          '🍬 ¡Estás dentro, {{nombre}}! Sorteamos {{ganadores_doble}} {{premio}} el {{fecha_sorteo}}.\n\n'
          + '🔒 Tu cupón {{cupon}} congela el precio de hoy hasta el {{congelado_hasta}} (+{{porcentaje}}% extra si compras en {{horas}} h). '
          + 'Comprar ahora te conviene: si ganas, te devolvemos tu entrada.\n\n'
          + '📜 Bases: {{link_bases}}',
        boughtUpgrade:
          '¡Compra confirmada, {{nombre}}! 🔥 Sigues en el sorteo de {{premio}}. Si ganas, eliges: te devolvemos tu entrada o te llevas otra para regalar.\n\n'
          + 'Tus regalos:\n{{lista_regalos}}',
        storyToReel:
          '🍬 ¡Estás dentro, {{nombre}}! Sorteamos {{ganadores_doble}} {{premio}} el {{fecha_sorteo}}. Más info en el reel 👉 {{link_reel}}',
      },
    },
  },
  {
    key: 'likes',
    name: 'Comentario con más "me gusta"',
    emoji: '❤️',
    tagline: 'Gana el comentario más votado al cierre',
    description:
      'Comentar la palabra clave inscribe y compite: gana quien tenga el comentario con más "me gusta" al cierre (1 por persona, '
      + 'empate = el más antiguo). Al cerrar se congelan los likes y se publica el top 3 con @ en el reel.',
    typicalHours: 24,
    durationPresets: [24, 48, 72],
    overrides: {
      chances: { base: 1, perMention: 0, maxMentions: 0, storyBonus: 0, perInvitedPurchase: 0, buyerMultiplier: 1 },
      prizes: { doubleWinners: 1, doubleAlternates: 2, vipWinners: 0, vipAlternates: 0, guaranteedLeader: false },
      ranking: { dailyComment: true, publicReplies: false, dmTips: false, emailBuyers: false },
      messages: {
        noTicket:
          '❤️ ¡Estás dentro, {{nombre}}! Gana el comentario con más "me gusta" el {{fecha_sorteo}} y se lleva {{premio_singular}}.\n\n'
          + 'Pide a tus amigos que le den like a tu comentario en el reel y compártelo en tu historia 🚀\n\n'
          + '🔒 Mientras, tu cupón {{cupon}} congela el precio de hoy hasta el {{congelado_hasta}} (+{{porcentaje}}% extra si compras en {{horas}} h).\n\n'
          + '📜 Bases: {{link_bases}}',
        storyToReel:
          '❤️ {{nombre}}, el concurso es en el reel: comenta "{{frase}}" y consigue likes 👉 {{link_reel}}',
      },
    },
  },
  {
    key: 'referrals',
    name: 'Carrera de referidos',
    emoji: '🚀',
    tagline: 'Gana quien haga comprar a más amigos',
    description:
      'Cada participante recibe su link personal. Gana quien consiga más compras con su link durante el concurso (se mide con compras reales, '
      + 'empate = quien entró antes). Comentario diario con la tabla y resultado final en el reel.',
    typicalHours: 24 * 5,
    durationPresets: [72, 24 * 5, 24 * 7],
    overrides: {
      chances: { base: 1, perMention: 0, maxMentions: 0, storyBonus: 0, perInvitedPurchase: 1, buyerMultiplier: 1 },
      prizes: { doubleWinners: 2, doubleAlternates: 1, vipWinners: 0, vipAlternates: 0, guaranteedLeader: false },
      ranking: { dailyComment: true, dailyHour: 20, publicReplies: false, dmTips: false, emailBuyers: false },
      messages: {
        noTicket:
          '🚀 ¡Estás dentro, {{nombre}}! Gana quien haga comprar a más amigos antes del {{fecha_sorteo}}: {{ganadores_doble}} {{premio}} para el top.\n\n'
          + '🔗 Tu link personal: {{link_invitar}}\n'
          + '🛒 Cada amigo que compre con tu link cuenta para ti. Tu amigo también paga menos: {{porcentaje_amigo}}% con {{codigo_amigo}}.\n\n'
          + '📜 Bases: {{link_bases}}',
        storyToReel:
          '🚀 {{nombre}}, la carrera es en el reel: comenta "{{frase}}" y recibe tu link personal 👉 {{link_reel}}',
      },
    },
  },
  {
    key: 'milestones',
    name: 'Retos por hitos',
    emoji: '🎯',
    tagline: 'Entre más comentarios, más descuento para todos',
    description:
      'Cuando el reel llega a 100, 250 y 500 comentarios (editables) se desbloquea un 10 %, 15 % y 20 % de descuento para TODOS con un código que '
      + 'dura 48 h. El más alto reemplaza al anterior. Se avisa en el reel y por DM. No hay ganadores: empuja a comentar y compartir.',
    typicalHours: 24 * 5,
    durationPresets: [72, 24 * 5, 24 * 7],
    overrides: {
      chances: { base: 1, perMention: 0, maxMentions: 0, storyBonus: 0, perInvitedPurchase: 0, buyerMultiplier: 1 },
      prizes: { doubleWinners: 0, doubleAlternates: 0, vipWinners: 0, vipAlternates: 0, guaranteedLeader: false, friendPercent: 0 },
      ranking: { dailyComment: false, publicReplies: false, dmTips: false, emailBuyers: false },
      messages: {
        noTicket:
          '🎯 ¡Estás dentro, {{nombre}}! Entre todos desbloqueamos descuento para {{evento}}: a {{proximo_hito}} comentarios sube el descuento para todos.\n\n'
          + 'Llevamos {{comentarios}} comentarios. Comenta, comparte el reel y ayúdanos a llegar 🚀\n\n'
          + '🔒 Tu cupón {{cupon}} congela el precio de hoy hasta el {{congelado_hasta}}.\n\n'
          + '📜 Bases: {{link_bases}}',
        storyToReel:
          '🎯 {{nombre}}, el reto es en el reel: comenta "{{frase}}" y ayúdanos a desbloquear descuentos para todos 👉 {{link_reel}}',
      },
    },
  },
  {
    key: 'quiz',
    name: 'Quiz',
    emoji: '🧠',
    tagline: 'Responde en historias o comentarios, cada acierto suma boletos',
    description:
      'Publicas preguntas (historias o reel) y la gente responde por DM o comentando. Cada respuesta correcta suma sus puntos (se puede reintentar) '
      + 'y al cierre se sortea entre quienes acertaron, con más boletos para quien más sabe. Hasta 5 preguntas; las respuestas aceptadas las defines tú.',
    typicalHours: 72,
    durationPresets: [24, 48, 72, 24 * 5],
    overrides: {
      keyword: '',
      keywordPhrase: '',
      chances: { base: 1, perMention: 0, maxMentions: 0, storyBonus: 0, perInvitedPurchase: 0, buyerMultiplier: 1 },
      prizes: { doubleWinners: 1, doubleAlternates: 2, vipWinners: 0, vipAlternates: 0, guaranteedLeader: false },
      ranking: { dailyComment: false, publicReplies: false, dmTips: false, emailBuyers: false },
    },
  },
  {
    key: 'flash',
    name: 'Reto relámpago',
    emoji: '⚡',
    tagline: 'Los 3 primeros en acertar ganan, cada puesto con su premio',
    description:
      'Publicas un reto en una historia o reel (pregunta, encuentra algo, diferencias…) y la gente responde por DM o comentando. '
      + 'Los 3 primeros en acertar ganan, cada puesto con el premio que elijas (entrada, producto, PlayCoins, descuento o manual). '
      + 'Los intentos son limitados, hay pista automática y el reto dura pocas horas.',
    typicalHours: 2,
    durationPresets: [1, 2, 3],
    overrides: {
      keyword: '',
      keywordPhrase: '',
      publicReply: false,
      couponsAfterDraw: false,
      chances: { base: 1, perMention: 0, maxMentions: 0, storyBonus: 0, perInvitedPurchase: 0, buyerMultiplier: 1 },
      prizes: { doubleWinners: 3, doubleAlternates: 1, vipWinners: 0, vipAlternates: 0, guaranteedLeader: false },
      ranking: { dailyComment: false, publicReplies: false, dmTips: false, emailBuyers: false },
    },
  },
];

export function getContestTemplate(key: string | null | undefined): ContestTemplate {
  return CONTEST_TEMPLATES.find((t) => t.key === key) ?? CONTEST_TEMPLATES[0];
}

export const isContestTemplateKey = (key: string): key is ContestTemplateKey => CONTEST_TEMPLATES.some((t) => t.key === key);

function mergeDeep(base: Record<string, unknown>, extra: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(extra)) {
    const prev = out[k];
    out[k] = v && typeof v === 'object' && !Array.isArray(v) && prev && typeof prev === 'object' && !Array.isArray(prev)
      ? mergeDeep(prev as Record<string, unknown>, v as Record<string, unknown>)
      : v;
  }
  return out;
}

/** Configuración inicial de un concurso nuevo: valores propuestos + lo de la
 * plantilla + lo que eligió en el asistente. */
export function buildTemplateConfig(
  key: ContestTemplateKey,
  input: { startsAt: string; drawAt: string; prizeTicketTypeId?: number | null; keyword?: string; keywordPhrase?: string },
): ContestConfig {
  const template = getContestTemplate(key);
  const chosen: Record<string, unknown> = {
    startsAt: input.startsAt,
    drawAt: input.drawAt,
    prizes: { prizeTicketTypeId: input.prizeTicketTypeId ?? null },
    ...(input.keyword !== undefined ? { keyword: input.keyword } : {}),
    ...(input.keywordPhrase !== undefined ? { keywordPhrase: input.keywordPhrase } : {}),
  };
  return normalizeContestConfig(mergeDeep(template.overrides, chosen));
}
