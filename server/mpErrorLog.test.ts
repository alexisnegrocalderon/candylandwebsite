import { describe, expect, it, vi } from 'vitest';
import { describeMpError, diagnoseTokenAccount, logCardPaymentFailure } from './mpErrorLog';

describe('describeMpError', () => {
  it('extrae estado, código y causas sin datos personales', () => {
    const out = describeMpError({
      message: 'Unauthorized use of live credentials',
      status: 401,
      error: 'unauthorized',
      cause: [{ code: 4, description: 'x'.repeat(500), secret: 'NO' }],
    });
    expect(out.status).toBe(401);
    expect(out.error).toBe('unauthorized');
    expect(out.message).toBe('Unauthorized use of live credentials');
    expect((out.causes as any[])[0].code).toBe(4);
    expect(((out.causes as any[])[0].description as string).length).toBe(200);
    expect(JSON.stringify(out)).not.toContain('NO');
  });
  it('no se cae con errores raros', () => {
    expect(() => describeMpError(null)).not.toThrow();
    expect(() => describeMpError('texto')).not.toThrow();
  });
});

describe('diagnoseTokenAccount', () => {
  it('en producción NO llama a Mercado Pago', async () => {
    const f = vi.fn();
    expect(await diagnoseTokenAccount('APP_USR-123-abc', { VERCEL_ENV: 'production' }, f as any)).toBeNull();
    expect(await diagnoseTokenAccount('APP_USR-123-abc', {}, f as any)).toBeNull();
    expect(f).not.toHaveBeenCalled();
  });
  it('en Preview devuelve solo prefijo, cuenta y país (nunca el token)', async () => {
    const f = vi.fn().mockResolvedValue({ status: 200, json: async () => ({ id: 99, site_id: 'MLC', nickname: 'TESTUSER1', email: 'a@b.cl' }) });
    const out = await diagnoseTokenAccount('APP_USR-123-secretopart', { VERCEL_ENV: 'preview' }, f as any);
    expect(out).toEqual({ httpStatus: 200, tokenPrefix: 'APP_USR', accountId: 99, siteId: 'MLC', looksLikeTestAccount: true });
    expect(JSON.stringify(out)).not.toContain('secretopart');
    expect(JSON.stringify(out)).not.toContain('a@b.cl');
  });
  it('si la consulta falla, no lanza', async () => {
    const f = vi.fn().mockRejectedValue(new Error('red caída'));
    const out = await diagnoseTokenAccount('APP_USR-1-x', { VERCEL_ENV: 'preview' }, f as any);
    expect(out).toMatchObject({ diagnoseFailed: true });
  });
});

describe('logCardPaymentFailure', () => {
  it('nunca lanza y no registra el token', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(logCardPaymentFailure({ message: 'boom', status: 500 }, { orderNumber: 'ORD-1', paymentMethodId: 'visa' }, 'APP_USR-1-secreto')).resolves.toBeUndefined();
    expect(JSON.stringify(spy.mock.calls)).not.toContain('secreto');
    spy.mockRestore();
  });
});
