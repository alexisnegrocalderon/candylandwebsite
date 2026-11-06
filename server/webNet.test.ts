import { describe, expect, it, vi } from 'vitest';
import { accountMovements, orders } from '../drizzle/schema';

// La compra de la captura de Mercado Pago: $44.000 cobrados, $42.328 recibidos (comisión $1.672).
const rows = new Map<unknown, unknown[]>([
  [orders, [
    { total: '44000', channel: 'web', paymentMethod: 'visa', paymentId: '188046742156' },
    { total: '15000', channel: 'web', paymentMethod: 'Manual: Transferencia', paymentId: null },
  ]],
  [accountMovements, [{ externalId: 'pay:188046742156', raw: { id: 188046742156, gross: 44000, net: 42328, fee: 1672 } }]],
]);
const chain = (data: unknown[]) => {
  const c: any = { then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve(data).then(res, rej) };
  for (const m of ['where', 'orderBy', 'limit', 'groupBy', 'innerJoin', 'leftJoin']) c[m] = () => c;
  return c;
};
const fakeDb = { select: () => ({ from: (t: unknown) => chain(rows.get(t) ?? []) }) };

vi.mock('./db', () => ({ getDb: vi.fn(async () => fakeDb), getSiteSettings: vi.fn(async () => ({ cardFeePercent: '3.50' })) }));

import { getWebNet } from './webNet';

describe('Ventas Web: lo que llega a la cuenta', () => {
  it('usa la comisión REAL de Mercado Pago y no cobra comisión a lo que no pasó por ahí', async () => {
    const r = await getWebNet(12);
    expect(r.gross).toBe(59000);
    expect(r.fee).toBe(1672);
    expect(r.net).toBe(57328);
    expect(r.realCount).toBe(1);
    expect(r.estimatedCount).toBe(0);
    expect(r.notMercadoPago).toBe(15000);
    expect(r.feePercent).toBe(3.8);
    expect(r.configuredPercent).toBe(3.5);
  });
});
