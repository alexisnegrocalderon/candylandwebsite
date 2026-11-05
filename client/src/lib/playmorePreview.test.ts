import { describe, expect, it } from 'vitest';
import { parsePreviewToken, shouldShowPlaymore } from './playmorePreview';

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

describe('shouldShowPlaymore', () => {
  const event = { slug: 'playmore' };
  it('se muestra con la venta abierta', () => {
    expect(shouldShowPlaymore({ isLive: true, preview: false, event })).toBe(true);
  });
  it('antes de activar solo cuando el servidor lo marca como vista previa (administrador o clave)', () => {
    expect(shouldShowPlaymore({ isLive: false, preview: true, event })).toBe(true);
    expect(shouldShowPlaymore({ isLive: false, preview: false, event })).toBe(false);
  });
  it('no se muestra sin evento o sin respuesta', () => {
    expect(shouldShowPlaymore({ isLive: true, preview: true })).toBe(false);
    expect(shouldShowPlaymore(null)).toBe(false);
    expect(shouldShowPlaymore(undefined)).toBe(false);
  });
});
