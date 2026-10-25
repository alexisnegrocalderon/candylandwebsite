import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./db')>();
  return { ...actual, getDb: vi.fn(), checkIpRateLimit: vi.fn(), recordIpAttempt: vi.fn(), getSiteSettings: vi.fn(async () => ({})) };
});
vi.mock('./email', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./email')>();
  return { ...actual, sendEmail: vi.fn() };
});
vi.mock('./ambassadorProgram', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./ambassadorProgram')>();
  return { ...actual, findAmbassadorByEmail: vi.fn(async () => null) };
});
vi.mock('./staffPortal', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./staffPortal')>();
  return { ...actual, findStaffByEmail: vi.fn(async () => null) };
});

import * as db from './db';
import * as email from './email';
import * as members from './members';
import { appRouter } from './routers';
import { ENV } from './_core/env';
import { currentMemberCode } from './memberAuth';
import { customers } from '../drizzle/schema';
import type { TrpcContext } from './_core/context';

/** Base falsa con la tabla de clientes: arranca vacía y guarda lo que se inserta. */
function fakeDb() {
  const rows: any[] = [];
  return {
    rows,
    select: () => ({ from: () => { const p: any = Promise.resolve(rows); p.where = () => p; p.limit = () => p; return p; } }),
    insert: (t: unknown) => ({ values: async (v: any) => { if (t === customers) rows.push({ id: rows.length + 1, memberSince: null, fullName: null, ...v }); } }),
    update: () => ({ set: () => ({ where: async () => {} }) }),
  };
}

const res = { cookie: vi.fn(), clearCookie: vi.fn() };
const caller = () => appRouter.createCaller({
  user: null,
  req: { protocol: 'https', headers: { 'x-forwarded-for': '9.9.9.9' }, socket: { remoteAddress: '9.9.9.9' } },
  res,
} as unknown as TrpcContext);

beforeEach(() => {
  vi.mocked(db.checkIpRateLimit).mockResolvedValue(true as any);
  vi.mocked(email.sendEmail).mockReset();
  if (!ENV.cookieSecret) Object.assign(ENV, { cookieSecret: 'secreto-de-prueba-0123456789abcdef' });
});

describe('entrar a la app con un correo que nunca compró', () => {
  it('le llega el código aunque no sea cliente', async () => {
    vi.mocked(db.getDb).mockResolvedValue(fakeDb() as any);
    vi.mocked(email.sendEmail).mockResolvedValue({ success: true } as any);
    await expect(caller().member.requestCode({ email: 'Nueva@Correo.cl' })).resolves.toEqual({ ok: true });
    expect(email.sendEmail).toHaveBeenCalledTimes(1);
    expect(vi.mocked(email.sendEmail).mock.calls[0][0]).toMatchObject({ to: 'nueva@correo.cl' });
  });

  it('si el correo no sale, se lo decimos (no esperar un código que nunca llega)', async () => {
    vi.mocked(db.getDb).mockResolvedValue(fakeDb() as any);
    vi.mocked(email.sendEmail).mockResolvedValue({ success: false, reason: 'API error' } as any);
    await expect(caller().member.requestCode({ email: 'nueva@correo.cl' })).rejects.toMatchObject({ code: 'INTERNAL_SERVER_ERROR' });
  });

  it('con el código correcto se crea su cuenta y queda con sesión', async () => {
    const fake = fakeDb();
    vi.mocked(db.getDb).mockResolvedValue(fake as any);
    const r = await caller().member.verifyCode({ email: 'nueva@correo.cl', code: currentMemberCode('nueva@correo.cl') });
    expect(r.ok).toBe(true);
    expect(fake.rows).toHaveLength(1);
    expect(fake.rows[0]).toMatchObject({ email: 'nueva@correo.cl', tags: ['app'], source: 'web' });
    expect(res.cookie).toHaveBeenCalled();
  });

  it('con un código malo no se crea nada', async () => {
    const fake = fakeDb();
    vi.mocked(db.getDb).mockResolvedValue(fake as any);
    await expect(caller().member.verifyCode({ email: 'nueva@correo.cl', code: '000000' })).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    expect(fake.rows).toHaveLength(0);
  });

  it('el envío usa el mismo código que después se valida', async () => {
    vi.mocked(db.getDb).mockResolvedValue(fakeDb() as any);
    vi.mocked(email.sendEmail).mockResolvedValue({ success: true } as any);
    await members.sendMemberCode('Otra@Correo.cl');
    expect(String(vi.mocked(email.sendEmail).mock.calls[0][0].html)).toContain(currentMemberCode('otra@correo.cl'));
  });
});
