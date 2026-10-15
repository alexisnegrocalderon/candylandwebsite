import { describe, expect, it } from 'vitest';
import { buildFunnel, funnelOriginLabel, normalizeLinkCode, postOrigin } from './igFunnel';

describe('igFunnel', () => {
  it('normaliza códigos', () => {
    expect(normalizeLinkCode('  Halloween Ñoño!! ')).toBe('halloween-nono');
  });
  it('etiquetas', () => {
    expect(funnelOriginLabel('ref-bio')).toBe('Link «bio»');
    expect(funnelOriginLabel('post-123', new Map([['123', 'Fiesta de disfraces este sábado']]))).toBe('Post: «Fiesta de disfraces este sábado»');
    expect(funnelOriginLabel('agente')).toBe('Agente de DM (sin origen)');
    expect(postOrigin('99')).toBe('post-99');
  });
  it('junta chats, clics y compras por origen', () => {
    const rows = buildFunnel({
      chats: [{ origin: 'ref-bio', count: 5 }, { origin: 'post-1', count: 2 }],
      clicks: [{ origin: 'ref-bio', count: 3 }],
      orders: [{ origin: 'post-1', count: 1, revenue: 20000 }],
    });
    expect(rows[0]).toMatchObject({ origin: 'post-1', chats: 2, orders: 1, revenue: 20000 });
    expect(rows[1]).toMatchObject({ origin: 'ref-bio', chats: 5, clicks: 3, orders: 0 });
  });
});
