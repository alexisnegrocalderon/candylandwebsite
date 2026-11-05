import { describe, expect, it } from 'vitest';
import { parsePreviewToken } from './playmorePreview';

describe('parsePreviewToken', () => {
  const token = 'a1b2c3d4e5f60718293a4b5c6d7e8f90';
  it('toma la clave de la URL', () => {
    expect(parsePreviewToken(`?app=1&playmore=${token}`, null)).toBe(token);
  });
  it('si la URL no trae clave usa la recordada', () => {
    expect(parsePreviewToken('', token)).toBe(token);
    expect(parsePreviewToken('?app=1', token)).toBe(token);
  });
  it('la de la URL manda sobre la recordada', () => {
    expect(parsePreviewToken(`?playmore=${token}`, 'otraclave12345678')).toBe(token);
  });
  it('rechaza claves con caracteres raros o demasiado cortas', () => {
    expect(parsePreviewToken('?playmore=abc', null)).toBeUndefined();
    expect(parsePreviewToken('?playmore=<script>alert(1)</script>', null)).toBeUndefined();
    expect(parsePreviewToken('', 'corta')).toBeUndefined();
    expect(parsePreviewToken('', null)).toBeUndefined();
  });
});
