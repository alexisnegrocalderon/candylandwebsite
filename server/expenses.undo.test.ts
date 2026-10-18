import { beforeEach, describe, expect, it, vi } from 'vitest';
import { appRouter } from './routers';
import * as db from './db';
import type { TrpcContext } from './_core/context';

vi.mock('./db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./db')>();
  return { ...actual, getExpenseById: vi.fn(), deleteExpense: vi.fn(), recordAdminAudit: vi.fn() };
});

const req = { protocol: 'https', headers: { 'x-forwarded-for': '1.2.3.4' }, socket: { remoteAddress: '1.2.3.4' } } as unknown as TrpcContext['req'];
const admin = (id: number) => ({ id, openId: 'x', name: 'x', role: 'admin' }) as any;
const caller = (u: any) => appRouter.createCaller({ user: u, req, res: {} as TrpcContext['res'] });

const expense = (createdByUserId: number, secondsAgo: number) =>
  ({ id: 7, createdByUserId, createdAt: new Date(Date.now() - secondsAgo * 1000) }) as any;

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(db.deleteExpense).mockResolvedValue({ success: true });
});

describe('deshacer un gasto recién cargado (expenses.undoCreate)', () => {
  it('lo borra si lo creó la misma persona hace menos de 2 minutos', async () => {
    vi.mocked(db.getExpenseById).mockResolvedValue(expense(5, 30));
    await expect(caller(admin(5)).expenses.undoCreate({ id: 7 })).resolves.toEqual({ success: true });
    expect(db.deleteExpense).toHaveBeenCalledWith(7);
    expect(db.recordAdminAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'expenses.undo', targetId: 7 }));
  });

  it('pasado el plazo hay que borrarlo con clave', async () => {
    vi.mocked(db.getExpenseById).mockResolvedValue(expense(5, 180));
    await expect(caller(admin(5)).expenses.undoCreate({ id: 7 })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(db.deleteExpense).not.toHaveBeenCalled();
  });

  it('no deshace el gasto que cargó otra persona', async () => {
    vi.mocked(db.getExpenseById).mockResolvedValue(expense(9, 10));
    await expect(caller(admin(5)).expenses.undoCreate({ id: 7 })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(db.deleteExpense).not.toHaveBeenCalled();
  });

  it('el invitado de demostración no puede', async () => {
    vi.mocked(db.getExpenseById).mockResolvedValue(expense(5, 10));
    await expect(caller({ id: 5, openId: 'x', name: 'x', role: 'viewer' }).expenses.undoCreate({ id: 7 })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(db.deleteExpense).not.toHaveBeenCalled();
  });
});
