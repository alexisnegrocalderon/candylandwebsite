import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { appRouter } from './routers';
import * as db from './db';
import * as email from './email';
import { ENV } from './_core/env';
import { currentMemberCode, signMemberSession, MEMBER_COOKIE } from './memberAuth';
import { adminLoginCodeKey, isAdminEmail, parseAdminEmails } from './adminEmail';
import type { TrpcContext } from './_core/context';

vi.mock('./db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./db')>();
  return { ...actual, checkIpRateLimit: vi.fn(), recordIpAttempt: vi.fn(), recordIpFailedAttempt: vi.fn(), getAdminTotp: vi.fn() };
});
vi.mock('./email', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./email')>();
  return { ...actual, sendEmail: vi.fn(async () => ({ success: true })) };
});

const OWNER = 'dueno@ejemplo.cl';
const caller = (cookie = '') => appRouter.createCaller({
  user: null,
  req: { protocol: 'https', headers: { 'x-forwarded-for': '1.2.3.4', cookie }, socket: { remoteAddress: '1.2.3.4' } },
  res: {},
} as unknown as TrpcContext);

describe('correos de admin autorizados', () => {
  afterEach(() => { delete process.env.ADMIN_EMAILS; });

  it('lee la lista de la variable, sin repetidos ni basura', () => {
    expect(parseAdminEmails(' Dueno@Ejemplo.cl, otra@x.cl ;dueno@ejemplo.cl, no-es-correo ')).toEqual(['dueno@ejemplo.cl', 'otra@x.cl']);
    expect(parseAdminEmails(undefined)).toEqual([]);
  });

  it('sin la variable el admin es el correo del negocio; con ella, los de la variable', () => {
    expect(isAdminEmail('Contacto@MansionPlayroom.cl')).toBe(true);
    expect(isAdminEmail(OWNER)).toBe(false);
    process.env.ADMIN_EMAILS = OWNER;
    expect(isAdminEmail('contacto@mansionplayroom.cl')).toBe(false);
    expect(isAdminEmail(' DUENO@ejemplo.cl ')).toBe(true);
    expect(isAdminEmail('otro@ejemplo.cl')).toBe(false);
    expect(isAdminEmail(null)).toBe(false);
  });
});

describe('entrar al panel con el correo', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    if (!ENV.cookieSecret) Object.assign(ENV, { cookieSecret: 'secreto-de-prueba-0123456789abcdef' });
    process.env.ADMIN_EMAILS = OWNER;
    vi.mocked(db.checkIpRateLimit).mockResolvedValue(true as any);
    vi.mocked(db.getAdminTotp).mockResolvedValue({ confirmedAt: new Date() } as any);
    vi.mocked(email.sendEmail).mockResolvedValue({ success: true } as any);
  });
  afterEach(() => { delete process.env.ADMIN_EMAILS; });

  it('solo manda el código al correo del dueño, pero responde igual a todos', async () => {
    await expect(caller().auth.adminEmailRequestCode({ email: 'cualquiera@x.cl' })).resolves.toEqual({ ok: true });
    expect(email.sendEmail).not.toHaveBeenCalled();
    await expect(caller().auth.adminEmailRequestCode({ email: OWNER })).resolves.toEqual({ ok: true });
    expect(email.sendEmail).toHaveBeenCalledTimes(1);
    expect(vi.mocked(email.sendEmail).mock.calls[0][0]).toMatchObject({ to: OWNER });
  });

  it('con el código correcto entrega el vale del paso 1, no la sesión', async () => {
    const r = await caller().auth.adminEmailVerify({ email: OWNER, code: currentMemberCode(adminLoginCodeKey(OWNER)) });
    expect(r.ticket.length).toBeGreaterThan(20);
    expect(r.needsSetup).toBe(false);
  });

  it('rechaza un código malo, un correo ajeno y el código de «Mi cuenta»', async () => {
    await expect(caller().auth.adminEmailVerify({ email: OWNER, code: '000000' })).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    await expect(caller().auth.adminEmailVerify({ email: 'otro@x.cl', code: currentMemberCode(adminLoginCodeKey('otro@x.cl')) })).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    // El código que le llega a un socio para «Mi cuenta» no abre el panel.
    await expect(caller().auth.adminEmailVerify({ email: OWNER, code: currentMemberCode(OWNER) })).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('sin segundo factor configurado el correo no entra (no sirve para enrolarlo)', async () => {
    vi.mocked(db.getAdminTotp).mockResolvedValue(null as any);
    await expect(caller().auth.adminEmailVerify({ email: OWNER, code: currentMemberCode(adminLoginCodeKey(OWNER)) })).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
  });

  it('el límite de intentos frena antes de revisar el código', async () => {
    vi.mocked(db.checkIpRateLimit).mockResolvedValue(false as any);
    await expect(caller().auth.adminEmailVerify({ email: OWNER, code: currentMemberCode(adminLoginCodeKey(OWNER)) })).rejects.toMatchObject({ code: 'TOO_MANY_REQUESTS' });
  });

  it('la sesión de «Mi cuenta» del dueño sigue al segundo factor; la de un cliente no', async () => {
    const ownerCookie = `${MEMBER_COOKIE}=${signMemberSession(OWNER)}`;
    expect(await caller(ownerCookie).auth.adminEmailHint()).toEqual({ email: expect.stringContaining('@ejemplo.cl') });
    expect((await caller(ownerCookie).auth.adminEmailFromMember()).ticket.length).toBeGreaterThan(20);

    const clientCookie = `${MEMBER_COOKIE}=${signMemberSession('cliente@x.cl')}`;
    expect(await caller(clientCookie).auth.adminEmailHint()).toBeNull();
    await expect(caller(clientCookie).auth.adminEmailFromMember()).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    await expect(caller().auth.adminEmailFromMember()).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });
});
