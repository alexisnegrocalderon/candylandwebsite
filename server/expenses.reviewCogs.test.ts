import { beforeEach, describe, expect, it, vi } from 'vitest';
import { appRouter } from './routers';
import * as db from './db';
import type { TrpcContext } from './_core/context';

vi.mock('./db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./db')>();
  return {
    ...actual,
    getExpenseById: vi.fn(), setExpenseCogsDecision: vi.fn(), recordAdminAudit: vi.fn(),
    checkIpRateLimit: vi.fn(), recordIpFailedAttempt: vi.fn(),
  };
});

const req = { protocol: 'https', headers: { 'x-forwarded-for': '1.2.3.4' }, socket: { remoteAddress: '1.2.3.4' } } as unknown as TrpcContext['req'];
const caller = (role = 'admin') => appRouter.createCaller({ user: { id: 5, openId: 'x', name: 'x', role } as any, req, res: {} as TrpcContext['res'] });

beforeEach(() => {
  vi.resetAllMocks();
  process.env.ADMIN_PASSWORD = 'clave-correcta';
  vi.mocked(db.checkIpRateLimit).mockResolvedValue(true as any);
  vi.mocked(db.getExpenseById).mockResolvedValue({ id: 3, eventId: 10, category: 'barra' } as any);
  vi.mocked(db.setExpenseCogsDecision).mockResolvedValue({ success: true });
});

describe('aviso de doble conteo: decidir gasto por gasto (expenses.reviewCogs)', () => {
  it.each(['same', 'different', 'reset'] as const)('guarda la decisión "%s" con la clave correcta y deja auditoría', async (decision) => {
    await expect(caller().expenses.reviewCogs({ id: 3, decision, adminPassword: 'clave-correcta' })).resolves.toEqual({ success: true });
    expect(db.setExpenseCogsDecision).toHaveBeenCalledWith(3, decision);
    expect(db.recordAdminAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'expenses.reviewCogs', targetId: 3, eventId: 10 }));
  });

  it('sin la clave correcta no cambia nada', async () => {
    await expect(caller().expenses.reviewCogs({ id: 3, decision: 'same', adminPassword: 'otra' })).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    expect(db.setExpenseCogsDecision).not.toHaveBeenCalled();
  });

  it('el invitado de demostración no puede', async () => {
    await expect(caller('viewer').expenses.reviewCogs({ id: 3, decision: 'same', adminPassword: 'clave-correcta' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(db.setExpenseCogsDecision).not.toHaveBeenCalled();
  });
});
