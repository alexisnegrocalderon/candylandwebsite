import { describe, expect, it, vi } from 'vitest';

// ENV lee el secreto al importarse: tiene que estar antes del import.
vi.hoisted(() => { process.env.JWT_SECRET = 'test-secret-for-member-passkeys'; });
import { memberPasskeyUserId, passkeyDeviceLabel, readPasskeyTicket, signPasskeyTicket } from './memberPasskeys';

describe('vales de Face ID de socios', () => {
  it('el vale de entrar devuelve su challenge', () => {
    expect(readPasskeyTicket('auth', signPasskeyTicket('auth', 'abc'))).toBe('abc');
  });

  it('un vale de entrar no sirve para activar, ni al revés', () => {
    expect(readPasskeyTicket('reg', signPasskeyTicket('auth', 'abc'))).toBeNull();
    expect(readPasskeyTicket('auth', signPasskeyTicket('reg', 'abc', 'a@b.cl'))).toBeNull();
  });

  it('el de activar queda ligado al correo de la sesión', () => {
    const t = signPasskeyTicket('reg', 'abc', 'Cami@Test.cl');
    expect(readPasskeyTicket('reg', t, 'cami@test.cl')).toBe('abc');
    expect(readPasskeyTicket('reg', t, 'otra@test.cl')).toBeNull();
  });

  it('vence a los 2 minutos', () => {
    const t = signPasskeyTicket('auth', 'abc', '', 0);
    expect(readPasskeyTicket('auth', t, '', 119_000)).toBe('abc');
    expect(readPasskeyTicket('auth', t, '', 121_000)).toBeNull();
  });

  it('rechaza un vale adulterado', () => {
    const [payload, sig] = signPasskeyTicket('auth', 'abc').split('.');
    const forged = Buffer.from(JSON.stringify({ k: 'auth', c: 'otro', e: '', x: Date.now() + 60_000 })).toString('base64url');
    expect(readPasskeyTicket('auth', `${forged}.${sig}`)).toBeNull();
    expect(readPasskeyTicket('auth', `${payload}.x${sig.slice(1)}`)).toBeNull();
  });
});

describe('identidad en el llavero', () => {
  it('es la misma para el mismo correo (no suma llaves al reactivar) y no contiene el correo', () => {
    const a = memberPasskeyUserId('cami@test.cl');
    expect(Buffer.from(a).equals(Buffer.from(memberPasskeyUserId(' CAMI@test.cl ')))).toBe(true);
    expect(Buffer.from(a).equals(Buffer.from(memberPasskeyUserId('otra@test.cl')))).toBe(false);
    expect(Buffer.from(a).toString('utf8')).not.toContain('cami');
  });
});

describe('nombre del dispositivo', () => {
  it('reconoce iPhone, Android y Mac', () => {
    expect(passkeyDeviceLabel('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)')).toBe('iPhone');
    expect(passkeyDeviceLabel('Mozilla/5.0 (Linux; Android 14; Pixel 8)')).toBe('Android');
    expect(passkeyDeviceLabel('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)')).toBe('Mac');
    expect(passkeyDeviceLabel(undefined)).toBe('Otro dispositivo');
  });
});
