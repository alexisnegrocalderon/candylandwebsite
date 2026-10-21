import { normalizeContestConfig, type ContestConfig } from './contest';

/** Plantillas de concurso: cada una es una mecánica con su configuración ya
 * armada (puntos, premios, textos, avisos automáticos). Al crear un concurso
 * se elige una y todo queda editable. Los textos usan solo variables
 * (`{{evento}}`, `{{premio}}`, `{{frase}}`…), nada fijo de un evento. */
export type ContestTemplateKey = 'ranking' | 'draw';

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
