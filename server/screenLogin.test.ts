import { beforeEach, describe, expect, it, vi } from 'vitest';
import { appRouter } from './routers';
import * as db from './db';
import { hashPin } from './caja/auth';
import type { TrpcContext } from './_core/context';
import { ENV } from './_core/env';

vi.mock('./db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./db')>();
  return {
    ...actual,
    checkIpRateLimit: vi.fn(),
    getOperatorById: vi.fn(),
    recordIpFailedAttempt: vi.fn(),
    recordFailedPinAttempt: vi.fn(),
    resetPinAttempts: vi.fn(),
    getActiveEventForCaja: vi.fn(),
    getEventBySlug: vi.fn(),
  };
});

const req = { protocol: 'https', headers: { 'x-forwarded-for': '1.2.3.4' }, socket: { remoteAddress: '1.2.3.4' } } as unknown as TrpcContext['req'];
const res = { cookie: vi.fn(), clearCookie: vi.fn() } as unknown as TrpcContext['res'];
const caller = () => appRouter.createCaller({ user: null, req, res, device: null, operator: null } as unknown as TrpcContext);
const PIN = '4821';
const pinHash = hashPin(PIN);
const op = (eventId: number, role = 'acceso') => ({ id: 7, eventId, role, name: 'Ana', active: 1, pinHash, lockedUntil: null });

beforeEach(() => {
  vi.resetAllMocks();
  // Para firmar la sesión del operador.
  if (!ENV.cookieSecret) Object.assign(ENV, { cookieSecret: 'secreto-de-prueba-0123456789abcdef' });
  vi.mocked(db.checkIpRateLimit).mockResolvedValue(true as any);
  vi.mocked(db.getActiveEventForCaja).mockResolvedValue({ id: 10 } as any);
  vi.mocked(db.getEventBySlug).mockImplementation(async (slug: string) => (slug === 'pruebas-caja' ? { id: 900 } as any : null));
});

describe('puerta, cocina y guardarropía: el acceso es de esta noche', () => {
  it('entra quien es del evento de esta noche o del de pruebas', async () => {
    vi.mocked(db.getOperatorById).mockResolvedValue(op(10) as any);
    await expect(caller().puerta.login({ operatorId: 7, pin: PIN })).resolves.toMatchObject({ id: 7 });
    vi.mocked(db.getOperatorById).mockResolvedValue(op(900, 'cocina') as any);
    await expect(caller().cocina.login({ operatorId: 7, pin: PIN })).resolves.toMatchObject({ id: 7 });
  });

  it('un acceso de otro evento no entra, aunque el PIN esté bien', async () => {
    vi.mocked(db.getOperatorById).mockResolvedValue(op(3) as any);
    await expect(caller().puerta.login({ operatorId: 7, pin: PIN })).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    vi.mocked(db.getOperatorById).mockResolvedValue(op(3, 'guardarropia') as any);
    await expect(caller().guardarropia.login({ operatorId: 7, pin: PIN })).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('cada pantalla solo para su rol', async () => {
    vi.mocked(db.getOperatorById).mockResolvedValue(op(10, 'cocina') as any);
    await expect(caller().puerta.login({ operatorId: 7, pin: PIN })).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});
