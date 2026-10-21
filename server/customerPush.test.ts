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
