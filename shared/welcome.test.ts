import { describe, expect, it } from 'vitest';
import { hasWelcomeParam, WELCOME_URL, withoutWelcomeParam } from './welcome';

describe('bienvenida', () => {
  it('el link de la notificación activa la ventana', () => {
    expect(WELCOME_URL).toBe('/?bienvenida=1');
    expect(hasWelcomeParam(WELCOME_URL.slice(1))).toBe(true);
  });

  it('solo con el valor 1, con o sin el signo ?', () => {
    expect(hasWelcomeParam('?bienvenida=1')).toBe(true);
    expect(hasWelcomeParam('bienvenida=1')).toBe(true);
    expect(hasWelcomeParam('?bienvenida=0')).toBe(false);
    expect(hasWelcomeParam('?bienvenida=')).toBe(false);
    expect(hasWelcomeParam('?otra=1')).toBe(false);
    expect(hasWelcomeParam('')).toBe(false);
  });

  it('al limpiar la dirección se conservan los demás parámetros', () => {
    expect(withoutWelcomeParam('?bienvenida=1')).toBe('');
    expect(withoutWelcomeParam('?utm_source=push&bienvenida=1')).toBe('?utm_source=push');
    expect(withoutWelcomeParam('?a=1&b=2')).toBe('?a=1&b=2');
    expect(withoutWelcomeParam('')).toBe('');
  });
});
