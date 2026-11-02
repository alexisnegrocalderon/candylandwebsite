import { describe, expect, it } from 'vitest';
import { biggestDrop, funnelStages, type AgentFunnelCounts } from './agentFunnel';

const base: AgentFunnelCounts = { conversations: 40, interested: 20, buttonSent: 10, clicked: 5, checkoutStarted: 4, paid: 1, paidByButton: 1, paidByHandle: 0, revenue: 30000 };

describe('funnelStages', () => {
  it('calcula el porcentaje respecto de la etapa anterior', () => {
    const s = funnelStages(base);
    expect(s.map((x) => x.ofPrevious)).toEqual([null, 50, 50, 50, 80, 25]);
  });
  it('no divide por cero', () => {
    const s = funnelStages({ ...base, interested: 0 });
    expect(s[2].ofPrevious).toBeNull();
  });
});

describe('biggestDrop', () => {
  it('encuentra la etapa con menor porcentaje', () => {
    expect(biggestDrop(funnelStages(base))?.key).toBe('paid');
  });
  it('ignora etapas con muy pocas personas antes', () => {
    expect(biggestDrop(funnelStages({ ...base, conversations: 2, interested: 0, buttonSent: 0, clicked: 0, checkoutStarted: 0, paid: 0 }))).toBeNull();
  });
});
