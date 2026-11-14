import { beforeEach, describe, expect, it, vi } from 'vitest';
import { appRouter } from './routers';
import * as coproductionSvc from './coproduction';
import * as djSvc from './djContract';
import type { TrpcContext } from './_core/context';

vi.mock('./coproduction', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./coproduction')>();
  return { ...actual, getCoproductionById: vi.fn() };
});
vi.mock('./djContract', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./djContract')>();
  return { ...actual, listProducerSignatures: vi.fn(), saveProducerSignature: vi.fn() };
});

const req = { protocol: 'https', headers: { 'x-forwarded-for': '1.2.3.4' }, socket: { remoteAddress: '1.2.3.4' } } as unknown as TrpcContext['req'];
const user = (role: string, extra: Record<string, unknown> = {}) => ({ id: -1, openId: 'x', name: 'x', role, ...extra }) as any;
const caller = (u: any) => appRouter.createCaller({ user: u, req, res: {} as TrpcContext['res'] });
const SIG = `data:image/png;base64,${'A'.repeat(300)}`;

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(coproductionSvc.getCoproductionById).mockImplementation(async (id) => (id === 1 ? ({ id: 1, slug: 'dalmore' } as any) : id === 2 ? ({ id: 2, slug: 'otra' } as any) : null));
  vi.mocked(djSvc.listProducerSignatures).mockResolvedValue([
    { key: 'alexis', name: 'Alexis Calderón', role: 'Productor de Playroom', signed: true, signedAt: new Date(), image: 'IMG-ALEXIS' },
    { key: 'gino', name: 'Gino Pérez', role: 'Productor de Dalmore', signed: true, signedAt: new Date(), image: 'IMG-GINO' },
  ] as any);
});

describe('cada productor firma solo la suya', () => {
  it('Gino (socio de Dalmore) firma como Gino y no ve la firma de Alexis', async () => {
    const r = await caller(user('partner', { coproductionId: 1 })).djContract.mySignature();
    expect(r.who).toBe('gino');
    expect(r.signatures.find((s) => s.key === 'gino')!.image).toBe('IMG-GINO');
    expect(r.signatures.find((s) => s.key === 'alexis')!.image).toBeNull();
    await caller(user('partner', { coproductionId: 1 })).djContract.saveMySignature({ signature: SIG });
    expect(djSvc.saveProducerSignature).toHaveBeenCalledWith('gino', SIG);
  });

  it('el dueño firma como Alexis y no ve la firma de Gino', async () => {
    const r = await caller(user('admin')).djContract.mySignature();
    expect(r.who).toBe('alexis');
    expect(r.signatures.find((s) => s.key === 'alexis')!.image).toBe('IMG-ALEXIS');
    expect(r.signatures.find((s) => s.key === 'gino')!.image).toBeNull();
    await caller(user('admin')).djContract.saveMySignature({ signature: SIG });
    expect(djSvc.saveProducerSignature).toHaveBeenCalledWith('alexis', SIG);
  });

  it('un socio de otra co-producción no puede firmar', async () => {
    await expect(caller(user('partner', { coproductionId: 2 })).djContract.saveMySignature({ signature: SIG })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(djSvc.saveProducerSignature).not.toHaveBeenCalled();
  });

  it('el socio no puede ver ni tocar los contratos, solo su firma', async () => {
    const socio = caller(user('partner', { coproductionId: 1 }));
    await expect(socio.djContract.list()).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(socio.djContract.requestSend({ id: 1 })).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('sin sesión nadie firma', async () => {
    await expect(caller(null).djContract.saveMySignature({ signature: SIG })).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});
