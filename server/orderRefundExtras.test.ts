import { beforeEach, describe, expect, it, vi } from 'vitest';
import { orders, tickets, ticketTypes, customers } from '../drizzle/schema';

const st = vi.hoisted(() => ({
  selects: [] as any[][],
  updates: [] as { table: unknown; values: any }[],
  ticketAffected: [] as number[],
  audits: [] as any[],
  emails: [] as any[],
  playcoins: [] as { customerId: number; delta: number }[],
}));

vi.mock('./db', () => ({
  getDb: async () => ({
    select: () => {
      const rows = () => st.selects.shift() ?? [];
      const b: any = new Proxy(() => {}, {
        get: (_t, prop) => (prop === 'then' ? (res: (v: any) => void) => res(rows()) : prop === 'limit' ? async () => rows() : () => b),
        apply: () => b,
      });
      return b;
    },
    update: (table: unknown) => ({
      set: (values: any) => ({
        where: async () => {
          st.updates.push({ table, values });
          const affected = table === tickets && values.status === 'cancelled' ? (st.ticketAffected.shift() ?? 1) : 1;
          return [{ affectedRows: affected }];
        },
      }),
    }),
  }),
  recordAdminAudit: async (a: any) => { st.audits.push(a); },
  adjustPlaycoinsManually: async (customerId: number, delta: number) => { st.playcoins.push({ customerId, delta }); },
}));
vi.mock('./email', () => ({
  buildOrderRefundEmail: () => '',
  buildExtrasRefundEmail: (d: any) => `extras:${d.extras.join(',')}:${d.refundAmount}`,
  sendEmail: async (m: any) => { st.emails.push(m); return { success: true }; },
}));

import { refundOrderExtras } from './orderRefund';

const order = { id: 7, orderNumber: 'MP-7', channel: 'web', paymentStatus: 'approved', total: '57000', missionTopupStatus: 'none', missionTopupAmount: null, refundAmount: null, refundReason: null, buyerEmail: 'a@t.cl', buyerName: 'Ana', eventId: 90001 };
const extrasRows = [
  { id: 11, displayCode: 'TG-1', status: 'valid', name: 'Tropical Gin', unitPrice: '6000' },
  { id: 12, displayCode: 'TG-2', status: 'valid', name: 'Tropical Gin', unitPrice: '6000' },
  { id: 13, displayCode: null, status: 'cancelled', name: 'Acceso Dúo', unitPrice: '45000' },
];

beforeEach(() => { st.selects = []; st.updates = []; st.ticketAffected = []; st.audits = []; st.emails = []; st.playcoins = []; });

function queueHappyPath() {
  st.selects.push(
    [order], [order], extrasRows,
    [{ id: 11, ticketTypeId: 5 }, { id: 12, ticketTypeId: 5 }],
    [{ id: 3, totalSpent: '57000' }],
    [{ customerId: 3, delta: 1425 }],
    [{ title: '2do Aniversario' }],
  );
}

describe('refundOrderExtras', () => {
  it('anula solo los extras elegidos, anota el monto en la orden y deja la compra aprobada', async () => {
    queueHappyPath();
    const r = await refundOrderExtras({ orderId: 7, ticketIds: [11, 12], reason: 'reprogramó' });
    expect(r).toMatchObject({ refundAmount: 12000, cancelled: 2, totalRefunded: 12000, emailSent: true });
    expect(st.updates.filter((u) => u.table === tickets && u.values.status === 'cancelled')).toHaveLength(2);
    const orderUpdate = st.updates.find((u) => u.table === orders)!;
    expect(orderUpdate.values).toMatchObject({ refundAmount: '12000' });
    expect(orderUpdate.values.paymentStatus).toBeUndefined();
    expect(orderUpdate.values.refundReason).toContain('Tropical Gin');
    expect(st.updates.find((u) => u.table === ticketTypes)!.values).toBeDefined();
    expect(st.updates.find((u) => u.table === customers)!.values).toMatchObject({ totalSpent: '45000' });
    expect(st.audits[0]).toMatchObject({ action: 'order.refundExtras', targetId: 7 });
    expect(st.emails[0].html).toBe('extras:Tropical Gin,Tropical Gin:12000');
  });

  it('revierte los Playcoins en proporción a lo devuelto', async () => {
    queueHappyPath();
    await refundOrderExtras({ orderId: 7, ticketIds: [11, 12] });
    // 12000 / 57000 de los 1425 ganados
    expect(st.playcoins).toEqual([{ customerId: 3, delta: -300 }]);
  });

  it('si uno se canjea justo ahora, deshace lo anulado y no devuelve nada', async () => {
    st.selects.push([order], [order], extrasRows);
    st.ticketAffected = [1, 0]; // el primero se anula, el segundo ya no estaba válido
    await expect(refundOrderExtras({ orderId: 7, ticketIds: [11, 12] })).rejects.toThrow(/se canjeó o anuló/);
    const restored = st.updates.filter((u) => u.table === tickets && u.values.status === 'valid');
    expect(restored).toHaveLength(1);
    expect(st.updates.find((u) => u.table === orders)).toBeUndefined();
    expect(st.emails).toHaveLength(0);
  });

  it('no devuelve extras de una compra que no está aprobada', async () => {
    st.selects.push([{ ...order, paymentStatus: 'refunded' }]);
    await expect(refundOrderExtras({ orderId: 7, ticketIds: [11] })).rejects.toThrow(/aprobada/);
  });

  it('no deja devolver el acceso por esta vía (ticket sin código de extra)', async () => {
    st.selects.push([order], [order], extrasRows);
    await expect(refundOrderExtras({ orderId: 7, ticketIds: [13] })).rejects.toThrow(/no es un extra/);
    expect(st.updates).toHaveLength(0);
  });
});
