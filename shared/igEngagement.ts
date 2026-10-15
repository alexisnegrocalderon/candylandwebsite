/* Bienvenida, enganches y fans de Instagram: lo puro. */

export const DEFAULT_HOOKS: string[] = [
  '¿Vendrías solo/a, en pareja o con amigos? 👀',
  '¿Es tu primera vez en Playroom o ya nos conoces? 😉',
  '¿Qué disfraz te tinca para la próxima? 🔥',
  '¿Qué te llamó la atención de Playroom? 💜',
  '¿Te late más bailar toda la noche o conocer gente nueva? ✨',
];

/** Elige un enganche que no aparezca en los mensajes que ya le mandamos. */
export function pickHook(hooks: string[], sentTexts: string[], random: () => number = Math.random): string | null {
  const clean = hooks.map((h) => h.trim()).filter(Boolean);
  if (clean.length === 0) return null;
  const used = sentTexts.join('\n');
  const fresh = clean.filter((h) => !used.includes(h));
  const pool = fresh.length > 0 ? fresh : clean;
  return pool[Math.floor(random() * pool.length) % pool.length];
}

/** Instrucción para el agente cuando es el primer mensaje de la persona. */
export function welcomeInstruction(isFollower: boolean | undefined, hook: string | null): string {
  const follow = isFollower === true
    ? 'Ya sigue la cuenta: agradécele con cariño por seguirnos.'
    : isFollower === false
      ? 'Todavía no sigue la cuenta: invítale de forma suave y coqueta a seguirnos para enterarse primero de las fechas (una sola vez, sin presionar).'
      : '';
  return [
    'PRIMER MENSAJE DE ESTA PERSONA: dale una bienvenida cálida y con estilo Playroom (amable, coqueta, con 1 emoji) antes de responder lo que pregunta, en la misma respuesta y sin alargarte.',
    follow,
    hook ? `Termina con esta pregunta de enganche (puedes ajustarla apenas para que calce): "${hook}"` : '',
  ].filter(Boolean).join(' ');
}

export const FAN_MIN_INTERACTIONS = 3;
export const FAN_WINDOW_DAYS = 30;

/** Suma interacciones por persona y deja solo a quienes llegan al mínimo. */
export function computeFans(
  sources: { igUserId: string; count: number }[][],
  min = FAN_MIN_INTERACTIONS,
): Map<string, number> {
  const totals = new Map<string, number>();
  for (const list of sources) for (const s of list) totals.set(s.igUserId, (totals.get(s.igUserId) ?? 0) + s.count);
  return new Map(Array.from(totals.entries()).filter(([, n]) => n >= min));
}

export const FOLLOWERS_ONLY_REPLY = 'Este regalo es solo para quienes nos siguen 💜 Síguenos y vuelve a escribir la palabra para recibirlo 🎁';
