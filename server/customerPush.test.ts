import { describe, expect, it } from 'vitest';
import { cleanActions, KIND_RULES, safePushUrl, withUtm } from './customerPush';

describe('customerPush helpers', () => {
  it('solo rutas del propio sitio', () => {
    expect(safePushUrl('/eventos/halloween')).toBe('/eventos/halloween');
    expect(safePushUrl('https://evil.com')).toBe('/');
    expect(safePushUrl('//evil.com')).toBe('/');
    expect(safePushUrl('')).toBe('/');
  });
  it('marca el link con la campaña sin pisar utm existentes', () => {
    expect(withUtm('/eventos/x', 12)).toBe('/eventos/x?utm_source=push&utm_medium=push&utm_campaign=push-12');
    expect(withUtm('/checkout/x?ref=ANA', 3)).toBe('/checkout/x?ref=ANA&utm_source=push&utm_medium=push&utm_campaign=push-3');
    expect(withUtm('/x?utm_source=ig', 3)).toContain('utm_source=ig');
    expect(withUtm('/mi-entrada', null)).toBe('/mi-entrada');
  });
  it('limpia los botones: máx. 2, texto corto, links seguros', () => {
    expect(cleanActions([{ label: ' Comprar ', url: '/checkout/x' }, { label: '', url: '/' }, { label: 'Ver', url: 'https://evil.com' }, { label: 'Otro', url: '/z' }]))
      .toEqual([{ label: 'Comprar', url: '/checkout/x' }, { label: 'Ver', url: '/' }]);
    expect(cleanActions('x')).toEqual([]);
  });
  it('los transaccionales no cuentan para el tope diario', () => {
    expect(KIND_RULES.recordatorio).toMatchObject({ marketing: false, quiet: false });
    expect(KIND_RULES.manual).toMatchObject({ marketing: true, quiet: true });
    expect(KIND_RULES.cumpleanos.dedupeDays).toBeGreaterThan(300 - 1);
  });
});

describe('suscripción ligada a «Mi cuenta»', () => {
  // Con la base de datos simulada: lo que importa es QUÉ correo se guarda y cuándo.
  it('la compra manda; sin compra vale el correo de la sesión; sin ninguno queda anónima', async () => {
    const rows: Array<Record<string, unknown>> = [];
    const { vi } = await import('vitest');
    vi.resetModules();
    vi.doMock('./db', () => ({
      getDb: async () => ({
        select: () => ({ from: () => ({ where: () => ({ limit: async () => [] }) }) }),
        insert: () => ({ values: (v: Record<string, unknown>) => { rows.push(v); return { onDuplicateKeyUpdate: async () => undefined }; } }),
      }),
      getSiteSettings: async () => ({}), getEventById: async () => null, getFeaturedEvent: async () => null, adjustPlaycoinsManually: async () => undefined,
    }));
    vi.doMock('./push', () => ({ ensureConfigured: () => false }));
    const { subscribeCustomer } = await import('./customerPush');
    const base = { subscription: { endpoint: 'https://push.test/a', keys: { p256dh: 'p', auth: 'a' } }, source: 'app' as const, platform: 'ios' as const, standalone: true };

    await subscribeCustomer(base, 'Ana@Correo.cl');
    await subscribeCustomer(base, null);
    expect(rows[0]).toMatchObject({ email: 'Ana@Correo.cl', orderId: null });
    expect(String(rows[0].emailNorm)).toContain('ana');
    expect(rows[1]).toMatchObject({ email: null, emailNorm: null });
    vi.doUnmock('./db');
    vi.doUnmock('./push');
  });
});
