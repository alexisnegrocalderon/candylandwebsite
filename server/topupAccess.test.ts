import { describe, it, expect, vi } from 'vitest';

vi.mock('./_core/env', () => ({ ENV: { cookieSecret: 'test-secret' } }));

import {
  currentLoginCode, verifyLoginCode, cleanLoginCode, signTopupSession, verifyTopupSession,
  CODE_WINDOW_MS, SESSION_TTL_MS,
} from './topupAccess';

const T0 = 1_800_000_000_000;

describe('código de recarga por correo', () => {
  it('es de 6 dígitos y estable dentro de la misma ventana', () => {
    const a = currentLoginCode('Ana@Mail.com', T0);
    expect(a).toMatch(/^\d{6}$/);
    expect(currentLoginCode('ana@mail.com', T0 + 1000)).toBe(a);
  });

  it('cambia entre correos distintos', () => {
    expect(currentLoginCode('ana@mail.com', T0)).not.toBe(currentLoginCode('beto@mail.com', T0));
  });

  it('acepta el código pegado con espacios o guiones', () => {
    const code = currentLoginCode('ana@mail.com', T0);
    expect(verifyLoginCode('ana@mail.com', `${code.slice(0, 3)} ${code.slice(3)}`, T0)).toBe(true);
    expect(verifyLoginCode('ana@mail.com', `${code.slice(0, 3)}-${code.slice(3)}`, T0)).toBe(true);
    expect(cleanLoginCode(' 12a3-45 6 ')).toBe('123456');
  });

  it('sigue valiendo en la ventana siguiente pero no dos ventanas después', () => {
    const code = currentLoginCode('ana@mail.com', T0);
    expect(verifyLoginCode('ana@mail.com', code, T0 + CODE_WINDOW_MS)).toBe(true);
    expect(verifyLoginCode('ana@mail.com', code, T0 + CODE_WINDOW_MS * 2)).toBe(false);
  });

  it('rechaza un código ajeno o con largo incorrecto', () => {
    const code = currentLoginCode('ana@mail.com', T0);
    expect(verifyLoginCode('beto@mail.com', code, T0)).toBe(false);
    expect(verifyLoginCode('ana@mail.com', code.slice(0, 5), T0)).toBe(false);
    expect(verifyLoginCode('ana@mail.com', '', T0)).toBe(false);
  });
});

describe('sesión de recarga', () => {
  it('devuelve el email mientras no venza', () => {
    const token = signTopupSession('Ana@Mail.com', T0);
    expect(verifyTopupSession(token, T0 + 1000)).toBe('ana@mail.com');
  });

  it('expira pasado el TTL', () => {
    const token = signTopupSession('ana@mail.com', T0);
    expect(verifyTopupSession(token, T0 + SESSION_TTL_MS + 1)).toBeNull();
  });

  it('rechaza una sesión adulterada', () => {
    const token = signTopupSession('ana@mail.com', T0);
    const [payload, sig] = token.split('.');
    const forged = Buffer.from(JSON.stringify({ e: 'beto@mail.com', x: T0 + SESSION_TTL_MS })).toString('base64url');
    expect(verifyTopupSession(`${forged}.${sig}`, T0)).toBeNull();
    expect(verifyTopupSession(`${payload}.x${sig}`, T0)).toBeNull();
    expect(verifyTopupSession('basura', T0)).toBeNull();
  });
});
