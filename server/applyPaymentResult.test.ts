import { beforeEach, describe, expect, it, vi } from 'vitest';
import { orders, orderItems, ticketTypes } from '../drizzle/schema';

const st = vi.hoisted(() => ({ order: null as any, affected: 1, updates: [] as { table: unknown; values: any }[], pushes: [] as any[] }));

vi.mock('./db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./db')>();
  const fakeDb = {
    select: () => {
      let table: unknown;
      const b: any = {
        from: (t: unknown) => { table = t; return b; },
        where: () => b,
        limit: async () => (table === orders && st.order ? [st.order] : []),
        then: (res: (v: unknown) => void) => res(table === orderItems ? [] : []),
      };
      return b;
    },
    update: (table: unknown) => ({
      set: (values: any) => ({
        where: async () => { st.updates.push({ table, values }); return [{ affectedRows: table === orders ? st.affected : 1 }]; },
      }),
    }),
  };
  return { ...actual, getDb: async () => fakeDb };
});
vi.mock('./push', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./push')>();
  return { ...actual, sendPushToAdmins: async () => {}, sendPushToAdminsAlways: async (p: any) => { st.pushes.push(p); } };
});

import { applyPaymentResult } from './webhooks';

beforeEach(() => { st.order = null; st.affected = 1; st.updates = []; st.pushes = []; });

describe('applyPaymentResult', () => {
  it('una compra aprobada no vuelve a rechazada por un aviso tardío de otro pago', async () => {
    st.order = { id: 1, orderNumber: 'MP-1', paymentStatus: 'approved', paymentId: '200', missionTopupStatus: 'none', missionDeposit: 0, emailSent: 1 };
    const r = await applyPaymentResult({ orderNumber: 'MP-1', paymentId: '100', status: 'rejected' });
    expect(r.alreadyProcessed).toBe(true);
    expect(st.updates).toHaveLength(0);
  });

  it('tampoco vuelve a pendiente', async () => {
    st.order = { id: 1, orderNumber: 'MP-1', paymentStatus: 'approved', paymentId: '200', missionTopupStatus: 'none', missionDeposit: 0, emailSent: 1 };
    await applyPaymentResult({ orderNumber: 'MP-1', paymentId: '300', status: 'pending' });
    expect(st.updates).toHaveLength(0);
  });

  it('si el webhook y el pago con tarjeta llegan juntos, solo el primero suma stock y genera entradas', async () => {
    st.order = { id: 1, orderNumber: 'MP-1', paymentStatus: 'pending', paymentId: null, missionTopupStatus: 'none', missionDeposit: 0, emailSent: 0 };
    st.affected = 0; // el otro aviso ya la aprobó
    const r = await applyPaymentResult({ orderNumber: 'MP-1', paymentId: '200', status: 'approved' });
    expect(r.alreadyProcessed).toBe(true);
    expect(st.updates.filter((u) => u.table === ticketTypes)).toHaveLength(0);
  });

  it('un rechazo sobre una compra pendiente sí se guarda', async () => {
    st.order = { id: 1, orderNumber: 'MP-1', paymentStatus: 'pending', paymentId: null, missionTopupStatus: 'none', missionDeposit: 0, emailSent: 0 };
    await applyPaymentResult({ orderNumber: 'MP-1', paymentId: '100', status: 'rejected' });
    expect(st.updates[0]).toMatchObject({ table: orders, values: { paymentStatus: 'rejected' } });
  });
});
