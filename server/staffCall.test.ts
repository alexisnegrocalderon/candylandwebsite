import { beforeEach, describe, expect, it, vi } from 'vitest';

const st = vi.hoisted(() => ({ rows: [] as any[][], adminPushes: [] as any[], emailPushes: [] as { email: string; p: any }[], ops: [] as any[] }));

vi.mock('./db', () => ({
  getDb: async () => ({
    select: () => { const c: any = new Proxy(() => {}, { get: (_t, prop) => (prop === 'then' ? (res: (v: any) => void) => res(st.rows.shift() ?? []) : () => c), apply: () => c }); return c; },
  }),
}));
vi.mock('./push', () => ({ sendPushToAdminsAlways: async (p: any) => { st.adminPushes.push(p); } }));
vi.mock('./customerPush', () => ({ pushToEmail: async (email: string, p: any) => { st.emailPushes.push({ email, p }); return 1; } }));
vi.mock('./caja/ops', () => ({ applyOp: async (_db: any, op: any) => { st.ops.push(op); return { result: 'applied' }; } }));

import { callOrganizers, notifyOrganizers, supervisorEmails } from './staffCall';

beforeEach(() => { st.rows = []; st.adminPushes = []; st.emailPushes = []; st.ops = []; });

describe('supervisorEmails', () => {
  it('junta operadores y staff supervisores, sin repetir ni mayúsculas', async () => {
    st.rows.push([{ email: 'Belen@mansionplayroom.cl' }, { email: null }], [{ email: 'belen@mansionplayroom.cl' }, { email: 'otra@t.cl' }]);
    expect(await supervisorEmails(7)).toEqual(['belen@mansionplayroom.cl', 'otra@t.cl']);
  });
});

describe('notifyOrganizers', () => {
  it('avisa al administrador y a cada supervisor', async () => {
    st.rows.push([{ email: 'belen@t.cl' }], []);
    const r = await notifyOrganizers(7, { title: 'T', body: 'B', url: '/admin' });
    expect(st.adminPushes).toHaveLength(1);
    expect(st.emailPushes.map((e) => e.email)).toEqual(['belen@t.cl']);
    expect(r.supervisors).toBe(1);
  });
});

describe('callOrganizers', () => {
  it('queda anotado en la noche y llega a los dos', async () => {
    st.rows.push([{ email: 'belen@t.cl' }], []);
    await callOrganizers({}, { eventId: 7, area: 'guardarropia', reason: 'ayuda', note: 'fila larga', operatorId: 3, operatorName: 'Cata' });
    expect(st.ops[0]).toMatchObject({ type: 'note', eventId: 7, targetId: 'guardarropia', payload: { kind: 'staff_call', reason: 'ayuda', note: 'fila larga' } });
    expect(st.adminPushes[0].title).toContain('Guardarropía');
    expect(st.emailPushes[0].p.body).toContain('Cata');
  });
  it('sin evento igual avisa (sin anotar)', async () => {
    st.rows.push([]);
    await callOrganizers({}, { eventId: null, area: 'caja', reason: 'emergencia', operatorId: 1, operatorName: 'Ana' });
    expect(st.ops).toHaveLength(0);
    expect(st.adminPushes).toHaveLength(1);
  });
});
