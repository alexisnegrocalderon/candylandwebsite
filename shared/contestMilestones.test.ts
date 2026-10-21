import { describe, expect, it } from 'vitest';
import { normalizeContestConfig } from './contest';
import { milestoneCommentText, milestoneState } from './contestMilestones';

const steps = normalizeContestConfig(null).milestones.steps;

describe('milestoneState', () => {
  it('sin escalón alcanzado muestra cuánto falta para el primero', () => {
    expect(milestoneState(40, steps)).toMatchObject({ reachedIndex: -1, percent: 0, remaining: 60, next: { comments: 100, percent: 10 } });
  });
  it('en el escalón exacto lo da por alcanzado', () => {
    expect(milestoneState(100, steps)).toMatchObject({ reachedIndex: 0, percent: 10, remaining: 150 });
  });
  it('el % más alto reemplaza al anterior', () => {
    expect(milestoneState(260, steps)).toMatchObject({ reachedIndex: 1, percent: 15, remaining: 240 });
  });
  it('en el último escalón no hay siguiente', () => {
    expect(milestoneState(900, steps)).toMatchObject({ reachedIndex: 2, percent: 20, next: null, remaining: 0 });
  });
});

describe('configuración de hitos', () => {
  it('trae 100/250/500 con 10/15/20% por defecto, 48 h', () => {
    const m = normalizeContestConfig(null).milestones;
    expect(m.steps.map((s) => [s.comments, s.percent])).toEqual([[100, 10], [250, 15], [500, 20]]);
    expect(m.hours).toBe(48);
  });
  it('ordena, descarta escalones rotos y respeta lo editado', () => {
    const m = normalizeContestConfig({ milestones: { steps: [{ comments: 300, percent: 30 }, { comments: 0, percent: 5 }, { comments: 50, percent: 'x' }, { comments: 80, percent: 12 }], hours: 5000 } }).milestones;
    expect(m.steps).toEqual([{ comments: 80, percent: 12 }, { comments: 300, percent: 30 }]);
    expect(m.hours).toBe(720);
  });
  it('si no queda ningún escalón válido vuelve a los propuestos', () => {
    expect(normalizeContestConfig({ milestones: { steps: [{ comments: 0, percent: 0 }] } }).milestones.steps).toHaveLength(3);
  });
});

describe('textos', () => {
  it('el comentario muestra lo que falta para el siguiente escalón', () => {
    const t = milestoneCommentText({ count: 100, percent: 10, code: 'HITO-AB12', until: 'vie 23 a las 20:00', next: steps[1], remaining: 150, link: 'https://x' });
    expect(t).toContain('¡100 comentarios!');
    expect(t).toContain('HITO-AB12');
    expect(t).toContain('Faltan 150 comentarios para subirlo a 15%');
  });
});
