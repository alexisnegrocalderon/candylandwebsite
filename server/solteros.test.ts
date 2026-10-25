import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./db', () => ({ getDb: vi.fn() }));
vi.mock('./email', () => ({ sendEmail: vi.fn(async () => ({ success: true })), buildSolteroApprovedEmail: vi.fn(() => '<html/>') }));
vi.mock('./customerPush', () => ({ pushToEmail: vi.fn(async () => 1) }));
vi.mock('./push', () => ({ sendPushToAdminsAlways: vi.fn(async () => undefined) }));

import * as db from './db';
import * as email from './email';
import * as push from './push';
import { approveSolteroDirect, getSolteroApproval, isSolteroApproved, requestSolteroApproval, reviewSoltero } from './solteros';

/** Base falsa de una sola tabla: `rows` es solteroApprovals. */
function fakeDb(rows: any[] = []) {
  return {
    rows,
    select: () => ({ from: () => { const p: any = Promise.resolve(rows); p.where = () => p; p.limit = () => p; p.orderBy = () => p; return p; } }),
    insert: () => ({ values: async (v: any) => { rows.push({ id: rows.length + 1, ...v }); } }),
    update: () => ({ set: (v: any) => ({ where: async () => { Object.assign(rows[0], v); } }) }),
  };
}

const request = { fullName: 'Juan Pérez', rut: '11.111.111-1', instagram: '@JuanP', phone: '+56 9 1234 5678', referredBy: 'Ana' };

beforeEach(() => { vi.clearAllMocks(); });

describe('solteros', () => {
  it('la solicitud queda en revisión, con los datos limpios, y avisa al admin', async () => {
    const fake = fakeDb();
    vi.mocked(db.getDb).mockResolvedValue(fake as any);
    expect(await requestSolteroApproval('Juan@X.cl', request)).toEqual({ status: 'pendiente' });
    expect(fake.rows[0]).toMatchObject({ email: 'juan@x.cl', status: 'pendiente', rut: '11111111-1', instagram: 'juanp' });
    expect(push.sendPushToAdminsAlways).toHaveBeenCalled();
  });

  it('una solicitud con datos malos no se guarda', async () => {
    const fake = fakeDb();
    vi.mocked(db.getDb).mockResolvedValue(fake as any);
    await expect(requestSolteroApproval('juan@x.cl', { ...request, rut: '11.111.111-2' })).rejects.toThrow(/RUT/);
    expect(fake.rows).toHaveLength(0);
  });

  it('aprobado no vuelve a revisión si pide de nuevo', async () => {
    const fake = fakeDb([{ id: 1, email: 'juan@x.cl', status: 'aprobado' }]);
    vi.mocked(db.getDb).mockResolvedValue(fake as any);
    expect(await requestSolteroApproval('juan@x.cl', request)).toEqual({ status: 'aprobado' });
    expect(fake.rows[0].status).toBe('aprobado');
  });

  it('al aprobar le llega el aviso; al rechazar o revocar no', async () => {
    const fake = fakeDb([{ id: 1, email: 'juan@x.cl', status: 'pendiente', fullName: 'Juan Pérez' }]);
    vi.mocked(db.getDb).mockResolvedValue(fake as any);
    await reviewSoltero(1, 'aprobar');
    expect(fake.rows[0].status).toBe('aprobado');
    expect(email.sendEmail).toHaveBeenCalledTimes(1);
    expect(await isSolteroApproved('JUAN@x.cl')).toBe(true);

    vi.mocked(email.sendEmail).mockClear();
    await reviewSoltero(1, 'revocar', 'Reporte en Playmatch');
    expect(fake.rows[0]).toMatchObject({ status: 'revocado', adminNote: 'Reporte en Playmatch' });
    expect(email.sendEmail).not.toHaveBeenCalled();
    expect(await isSolteroApproved('juan@x.cl')).toBe(false);
  });

  it('el admin puede aprobar directo a alguien validado por WhatsApp', async () => {
    const fake = fakeDb();
    vi.mocked(db.getDb).mockResolvedValue(fake as any);
    await approveSolteroDirect(' Pedro@X.cl ', 'Pedro Soto');
    expect(fake.rows[0]).toMatchObject({ email: 'pedro@x.cl', status: 'aprobado', fullName: 'Pedro Soto' });
    expect(email.sendEmail).toHaveBeenCalledTimes(1);
  });

  it('si la tabla todavía no existe, cuenta como «sin aprobación» (no rompe la compra)', async () => {
    vi.mocked(db.getDb).mockResolvedValue({ select: () => { throw new Error("Table 'solteroApprovals' doesn't exist"); } } as any);
    expect(await getSolteroApproval('juan@x.cl')).toBeNull();
    expect(await isSolteroApproved('juan@x.cl')).toBe(false);
  });
});
