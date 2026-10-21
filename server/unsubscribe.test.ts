import { describe, expect, it } from 'vitest';
import { decodeEmail, unsubscribeOneClickUrl, unsubscribePageUrl, unsubscribeToken, verifyUnsubscribe } from './unsubscribe';
import { injectUnsubscribeFooter } from './email';

describe('baja de correos: link firmado', () => {
  it('la firma sirve para ese correo (sin importar mayúsculas) y no para otro', () => {
    const token = unsubscribeToken('Ana@Gmail.com');
    expect(verifyUnsubscribe('ana@gmail.com', token)).toBe(true);
    expect(verifyUnsubscribe('otra@gmail.com', token)).toBe(false);
  });
  it('rechaza firmas vacías, cortas o alteradas', () => {
    const token = unsubscribeToken('ana@gmail.com');
    expect(verifyUnsubscribe('ana@gmail.com', '')).toBe(false);
    expect(verifyUnsubscribe('ana@gmail.com', token.slice(1))).toBe(false);
    expect(verifyUnsubscribe('ana@gmail.com', `${token.slice(0, -1)}${token.endsWith('0') ? '1' : '0'}`)).toBe(false);
    expect(verifyUnsubscribe('', token)).toBe(false);
  });
  it('los links llevan el correo codificado y su firma', () => {
    const page = new URL(unsubscribePageUrl('ana@gmail.com'));
    expect(page.pathname).toBe('/baja');
    expect(decodeEmail(page.searchParams.get('e')!)).toBe('ana@gmail.com');
    expect(verifyUnsubscribe('ana@gmail.com', page.searchParams.get('t')!)).toBe(true);
    expect(new URL(unsubscribeOneClickUrl('ana@gmail.com')).pathname).toBe('/api/unsubscribe');
  });
});

describe('pie de baja en el correo', () => {
  it('se agrega antes de cerrar el body y trae el link', () => {
    const out = injectUnsubscribeFooter('<html><body><p>Hola</p></body></html>', 'https://x/baja?e=1&t=2');
    expect(out).toContain('https://x/baja?e=1&t=2');
    expect(out.indexOf('puedes darte de baja')).toBeLessThan(out.indexOf('</body>'));
  });
  it('si no hay body, lo agrega al final', () => {
    expect(injectUnsubscribeFooter('<p>Hola</p>', 'https://x/baja')).toContain('https://x/baja');
  });
});
