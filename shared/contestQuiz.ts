import type { ContestQuizQuestion } from './contest';

/* Quiz: reglas puras. Lo que toca la base y Meta vive en server/contestQuiz.ts. */

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** ¿La respuesta aceptada aparece en el mensaje? Palabras completas y sin
 * charla alrededor (a lo más 5 palabras más que la respuesta), para que una
 * conversación normal no cuente como respuesta. */
export function answerMatches(message: string, accepted: string): boolean {
  const a = norm(accepted);
  const m = norm(message);
  if (!a || !m) return false;
  if (` ${m} `.indexOf(` ${a} `) === -1) return false;
  return m.split(' ').length <= a.split(' ').length + 5;
}

/** Pregunta (índice) que acierta el mensaje entre las que todavía no tiene
 * respondidas; `repeated` = acierta una que ya había respondido. */
export function matchQuizAnswer(
  message: string,
  questions: ContestQuizQuestion[],
  answered: Set<number>,
): { index: number | null; repeated: boolean } {
  let repeated = false;
  for (let i = 0; i < questions.length; i++) {
    if (!questions[i].answers.some((a) => answerMatches(message, a))) continue;
    if (answered.has(i)) repeated = true;
    else return { index: i, repeated: false };
  }
  return { index: null, repeated };
}

export const quizLogKey = (participantId: number, index: number) => `quiz:${participantId}:${index}`;

/** Índices de preguntas acertadas a partir de las llaves guardadas de una persona. */
export function answeredFromKeys(keys: string[], participantId: number): Set<number> {
  const out = new Set<number>();
  for (const k of keys) {
    const [kind, pid, idx] = k.split(':');
    if (kind === 'quiz' && Number(pid) === participantId && Number.isInteger(Number(idx))) out.add(Number(idx));
  }
  return out;
}

export function quizPoints(answered: Set<number>, questions: ContestQuizQuestion[]): number {
  let total = 0;
  answered.forEach((i) => { total += questions[i]?.points ?? 0; });
  return total;
}

export const quizTotalPoints = (questions: ContestQuizQuestion[]) => questions.reduce((s, q) => s + q.points, 0);
