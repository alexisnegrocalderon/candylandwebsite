import { describe, expect, it } from 'vitest';
import { normalizeContestConfig } from './contest';
import { answerMatches, answeredFromKeys, matchQuizAnswer, quizLogKey, quizPoints, quizTotalPoints } from './contestQuiz';

const questions = normalizeContestConfig({
  quiz: { questions: [
    { text: '¿En qué año abrió Playroom?', answers: ['2024', 'dos mil veinticuatro'], points: 1 },
    { text: '¿Color del conejo?', answers: 'Rosado, rosa', points: 2 },
    { text: '', answers: [], points: 1 },
  ] },
}).quiz.questions;

describe('config del quiz', () => {
  it('limpia preguntas vacías y acepta respuestas como lista o texto', () => {
    expect(questions).toHaveLength(2);
    expect(questions[1].answers).toEqual(['Rosado', 'rosa']);
    expect(normalizeContestConfig(null).quiz.questions).toEqual([]);
    expect(normalizeContestConfig({ quiz: { questions: Array.from({ length: 9 }, () => ({ text: 'p', answers: ['a'] })) } }).quiz.questions).toHaveLength(5);
  });
});

describe('answerMatches', () => {
  it('ignora mayúsculas, tildes y signos', () => {
    expect(answerMatches('¡¡ROSADO!!', 'rosádo')).toBe(true);
    expect(answerMatches('creo que es 2024', '2024')).toBe(true);
  });
  it('exige palabras completas y poca charla', () => {
    expect(answerMatches('20245', '2024')).toBe(false);
    expect(answerMatches('hola, quería saber a qué hora abren hoy y si hay estacionamiento, además rosa', 'rosa')).toBe(false);
  });
});

describe('matchQuizAnswer', () => {
  it('acierta la pregunta que corresponde', () => {
    expect(matchQuizAnswer('rosa', questions, new Set())).toEqual({ index: 1, repeated: false });
  });
  it('si ya la tenía, lo marca como repetida y no suma', () => {
    expect(matchQuizAnswer('rosa', questions, new Set([1]))).toEqual({ index: null, repeated: true });
  });
  it('una respuesta equivocada no acierta nada', () => {
    expect(matchQuizAnswer('azul', questions, new Set())).toEqual({ index: null, repeated: false });
  });
});

describe('puntos', () => {
  it('suma los puntos de las preguntas acertadas', () => {
    const keys = [quizLogKey(7, 0), quizLogKey(7, 1), quizLogKey(8, 0)];
    const answered = answeredFromKeys(keys, 7);
    expect(Array.from(answered).sort()).toEqual([0, 1]);
    expect(quizPoints(answered, questions)).toBe(3);
    expect(quizTotalPoints(questions)).toBe(3);
  });
});
