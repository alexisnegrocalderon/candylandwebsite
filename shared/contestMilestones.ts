import type { ContestMilestoneStep } from './contest';

/* Retos por hitos: reglas puras. Lo que toca la base y Meta vive en
 * server/contestMilestones.ts. */

export interface MilestoneState {
  /** Índice del último escalón alcanzado (-1 = ninguno). */
  reachedIndex: number;
  /** % vigente (0 si no se alcanzó ninguno). */
  percent: number;
  next: ContestMilestoneStep | null;
  /** Comentarios que faltan para el siguiente escalón. */
  remaining: number;
}

/** Estado según los comentarios actuales. `steps` debe venir ordenado (normalizeContestConfig lo hace). */
export function milestoneState(count: number, steps: ContestMilestoneStep[]): MilestoneState {
  let reachedIndex = -1;
  steps.forEach((s, i) => { if (count >= s.comments) reachedIndex = i; });
  const next = steps[reachedIndex + 1] ?? null;
  return {
    reachedIndex,
    percent: reachedIndex >= 0 ? steps[reachedIndex].percent : 0,
    next,
    remaining: next ? Math.max(0, next.comments - count) : 0,
  };
}

export function milestoneCommentText(input: { count: number; percent: number; code: string; until: string; next: ContestMilestoneStep | null; remaining: number; link: string }): string {
  return [
    `🔥 ¡${input.count} comentarios! Desbloqueamos ${input.percent}% de descuento para TODOS 🎉`,
    `Código: ${input.code} (válido hasta ${input.until})`,
    input.next
      ? `Faltan ${input.remaining} comentarios para subirlo a ${input.next.percent}%. ¡Comenta y comparte para desbloquearlo! 🚀`
      : '¡Llegamos al máximo! Aprovecha antes de que venza 💥',
    input.link,
  ].join('\n').slice(0, 2200);
}

export function milestoneDmText(input: { name: string; count: number; percent: number; code: string; until: string; next: ContestMilestoneStep | null; remaining: number; link: string }): string {
  return [
    `🔥 ${input.name ? `${input.name}, ` : ''}¡llegamos a ${input.count} comentarios! Desbloqueaste ${input.percent}% de descuento con el código ${input.code} (hasta ${input.until}).`,
    input.next ? `Faltan ${input.remaining} para ${input.next.percent}%: comparte el reel y ayúdanos 🚀` : 'Es el máximo: úsalo antes de que venza.',
    input.link,
  ].join('\n\n');
}
