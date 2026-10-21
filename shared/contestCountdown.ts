import type { ContestCountdownStep } from './contest';

/* Cuenta regresiva de ventas: reglas puras. Lo que toca la base y Meta vive en
 * server/contestCountdown.ts. */

export interface CountdownState {
  /** Índice del último escalón alcanzado (-1 = ninguno). */
  reachedIndex: number;
  /** Ganadores desbloqueados (0 si no se alcanzó la primera meta). */
  winners: number;
  next: ContestCountdownStep | null;
  /** Entradas que faltan para el siguiente escalón. */
  remaining: number;
}

/** Estado según las entradas vendidas. `steps` debe venir ordenado (normalizeContestConfig lo hace). */
export function countdownState(sold: number, steps: ContestCountdownStep[]): CountdownState {
  let reachedIndex = -1;
  steps.forEach((s, i) => { if (sold >= s.tickets) reachedIndex = i; });
  const next = steps[reachedIndex + 1] ?? null;
  return {
    reachedIndex,
    winners: reachedIndex >= 0 ? steps[reachedIndex].winners : 0,
    next,
    remaining: next ? Math.max(0, next.tickets - sold) : 0,
  };
}

/** Frase de "lo que viene" para los avisos. */
export function countdownMetaText(state: CountdownState): string {
  if (!state.next) return '¡Llegamos a la meta máxima! 💥';
  const w = state.next.winners;
  return `Faltan ${state.remaining} entrada${state.remaining === 1 ? '' : 's'} para llegar a ${w} ganador${w === 1 ? '' : 'es'} 🚀`;
}

export const countdownLogKey = (index: number) => `countdown:${index}`;
