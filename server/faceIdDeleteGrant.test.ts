import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  process.env.JWT_SECRET = 'test-secret-face-id-grant';
  process.env.ADMIN_PASSWORD = 'clave-real';
});

import { appRouter } from './routers';
import * as db from './db';
import { sdk } from './_core/sdk';
import type { TrpcContext } from './_core/context';

vi.mock('./db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./db')>();
  return {
    ...actual,
    checkIpRateLimit: vi.fn(),
    recordIpFailedAttempt: vi.fn(),
    deleteExpense: vi.fn(),
    recordAdminAudit: vi.fn(),
  };
});

const req = { protocol: 'https', headers: { 'x-forwarded-for': '1.2.3.4' }, socket: { remoteAddress: '1.2.3.4' } } as unknown as TrpcContext['req'];
const admin = { id: 1, openId: 'x', name: 'x', role: 'admin' } as any;
const caller = () => appRouter.createCaller({ user: admin, req, res: {} as TrpcContext['res'] });

const grant = (openId: string, expiresInMs = 60_000) =>
  sdk.signSession({ openId, appId: 'candyland-admin-webauthn', name: 'delete' }, { expiresInMs }).then((t) => `faceid:${t}`);

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(db.checkIpRateLimit).mockResolvedValue(true);
  vi.mocked(db.deleteExpense).mockResolvedValue({ success: true } as any);
});

describe('borrar con Face ID (permiso faceid: en vez de la clave de admin)', () => {
  it('acepta un permiso válido emitido tras verificar el passkey', async () => {
    await expect(caller().expenses.delete({ id: 7, adminPassword: await grant('webauthn:delete-grant') })).resolves.toBeTruthy();
    expect(db.deleteExpense).toHaveBeenCalledWith(7);
  });

  it('la clave de admin sigue funcionando igual', async () => {
    await expect(caller().expenses.delete({ id: 7, adminPassword: 'clave-real' })).resolves.toBeTruthy();
    expect(db.deleteExpense).toHaveBeenCalledWith(7);
  });

  it('rechaza otro vale firmado con el mismo secreto (ej. el ticket del login o la cookie de sesión)', async () => {
    await expect(caller().expenses.delete({ id: 7, adminPassword: await grant('webauthn:auth') })).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    await expect(caller().expenses.delete({ id: 7, adminPassword: await grant('local:admin') })).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    expect(db.deleteExpense).not.toHaveBeenCalled();
    expect(db.recordIpFailedAttempt).toHaveBeenCalledTimes(2);
  });

  it('rechaza un permiso vencido o inventado', async () => {
    await expect(caller().expenses.delete({ id: 7, adminPassword: await grant('webauthn:delete-grant', -1000) })).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    await expect(caller().expenses.delete({ id: 7, adminPassword: 'faceid:no-es-un-jwt' })).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    expect(db.deleteExpense).not.toHaveBeenCalled();
  });

  it('respeta el límite de intentos por IP', async () => {
    vi.mocked(db.checkIpRateLimit).mockResolvedValue(false);
    await expect(caller().expenses.delete({ id: 7, adminPassword: await grant('webauthn:delete-grant') })).rejects.toMatchObject({ code: 'TOO_MANY_REQUESTS' });
    expect(db.deleteExpense).not.toHaveBeenCalled();
  });
});
