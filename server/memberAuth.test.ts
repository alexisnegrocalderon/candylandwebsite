import { beforeAll, describe, expect, it } from 'vitest';

beforeAll(() => { process.env.JWT_SECRET = 'test-secret-for-members'; });

describe('memberAuth', () => {
  it('el código de la cuenta es de 6 dígitos, estable en la ventana y no sirve para recargar', async () => {
    const m = await import('./memberAuth');
    const t = await import('./topupAccess');
    const now = Date.UTC(2026, 9, 21, 12, 3, 0);
    const code = m.currentMemberCode('Ana@x.cl', now);
    expect(code).toMatch(/^\d{6}$/);
    expect(m.currentMemberCode(' ana@x.cl ', now + 60_000)).toBe(code);
    expect(m.verifyMemberCode('ana@x.cl', `${code.slice(0, 3)} ${code.slice(3)}`, now)).toBe(true);
    expect(m.verifyMemberCode('ana@x.cl', code, now + 12 * 60_000)).toBe(true); // la ventana siguiente
    expect(m.verifyMemberCode('ana@x.cl', code, now + 25 * 60_000)).toBe(false);
    expect(m.verifyMemberCode('beto@x.cl', code, now)).toBe(false);
    expect(t.verifyLoginCode('ana@x.cl', code, now)).toBe(false); // dominios separados
    expect(m.verifyMemberCode('ana@x.cl', t.currentLoginCode('ana@x.cl', now), now)).toBe(false);
  });
  it('la sesión se firma, vence y detecta adulteración', async () => {
    const m = await import('./memberAuth');
    const now = Date.UTC(2026, 9, 21);
    const token = m.signMemberSession('Ana@X.cl', now);
    expect(m.verifyMemberSession(token, now + 1000)).toBe('ana@x.cl');
    expect(m.verifyMemberSession(token, now + m.MEMBER_SESSION_MS + 1)).toBeNull();
    const [payload, sig] = token.split('.');
    const forged = `${Buffer.from(JSON.stringify({ e: 'otro@x.cl', x: now + 1e12 })).toString('base64url')}.${sig}`;
    expect(m.verifyMemberSession(forged, now)).toBeNull();
    expect(m.verifyMemberSession(`${payload}.x`, now)).toBeNull();
    expect(m.verifyMemberSession('basura', now)).toBeNull();
  });
  it('los códigos de cupón son legibles', async () => {
    const m = await import('./memberAuth');
    for (let i = 0; i < 50; i++) expect(m.randomCouponCode()).toMatch(/^PLAY-[A-HJKMNP-Z2-9]{6}$/);
  });
});
