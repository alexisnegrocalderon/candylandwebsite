import { describe, expect, it, vi } from 'vitest';

vi.hoisted(() => { process.env.JWT_SECRET = 'test-secret-adult'; });
import { checkoutConfirmedAdult } from './routers';

describe('checkout: confirmación +18 exigida en el servidor', () => {
  it('una orden del checkout web sin el check se rechaza', () => {
    expect(checkoutConfirmedAdult(JSON.stringify({ campos: { buyer__nombre: 'Ana' } }))).toBe(false);
    expect(checkoutConfirmedAdult(JSON.stringify({ campos: { buyer__mayorEdad: false } }))).toBe(false);
  });
  it('con el check confirmado pasa', () => {
    expect(checkoutConfirmedAdult(JSON.stringify({ campos: { buyer__mayorEdad: true }, mayorEdadEn: '2026-10-22T03:00:00.000Z' }))).toBe(true);
  });
  it('órdenes que no vienen del checkout (sin campos) no aplican', () => {
    expect(checkoutConfirmedAdult(undefined)).toBe(true);
    expect(checkoutConfirmedAdult(JSON.stringify({ acceso: 'Recarga' }))).toBe(true);
    expect(checkoutConfirmedAdult('no-json')).toBe(true);
  });
});
