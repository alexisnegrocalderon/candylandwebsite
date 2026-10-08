import { describe, expect, it } from 'vitest';
import { BRAND_COLORS, clampFontSize, cssColorToHex, escapeHtml, normalizeHex, textToHtml } from './slideEdit';

describe('colores', () => {
  it('normalizeHex acepta #rgb y #rrggbb', () => {
    expect(normalizeHex('#F0A')).toBe('#ff00aa');
    expect(normalizeHex(' #00A3FF ')).toBe('#00a3ff');
    expect(normalizeHex('rojo')).toBeNull();
    expect(normalizeHex('#12345')).toBeNull();
  });

  it('cssColorToHex convierte lo que devuelve el navegador', () => {
    expect(cssColorToHex('rgb(255, 0, 142)')).toBe('#ff008e');
    expect(cssColorToHex('rgba(0, 163, 255, 1)')).toBe('#00a3ff');
    expect(cssColorToHex('rgb(0 163 255 / 50%)')).toBe('#00a3ff');
    expect(cssColorToHex('#fff')).toBe('#ffffff');
  });

  it('un fondo transparente no es un color', () => {
    expect(cssColorToHex('rgba(0, 0, 0, 0)')).toBeNull();
    expect(cssColorToHex('rgb(0 0 0 / 0%)')).toBeNull();
    expect(cssColorToHex('transparent')).toBeNull();
  });

  it('la paleta de marca es toda hex válido y sin repetidos', () => {
    const hexes = BRAND_COLORS.map((c) => normalizeHex(c.hex));
    expect(hexes.every(Boolean)).toBe(true);
    expect(new Set(hexes).size).toBe(BRAND_COLORS.length);
  });
});

describe('tamaño de letra', () => {
  it('se mantiene entre el mínimo y el máximo', () => {
    expect(clampFontSize(5)).toBe(12);
    expect(clampFontSize(1000)).toBe(320);
    expect(clampFontSize(87.6)).toBe(88);
    expect(clampFontSize(NaN)).toBe(12);
  });
});

describe('texto → HTML', () => {
  it('escapa y convierte saltos de línea en <br>', () => {
    expect(textToHtml('Hola <b>\nA & B')).toBe('Hola &lt;b&gt;<br>A &amp; B');
    expect(textToHtml('a\r\nb')).toBe('a<br>b');
  });
  it('escapeHtml neutraliza comillas', () => {
    expect(escapeHtml('"x"')).toBe('&quot;x&quot;');
  });
});
