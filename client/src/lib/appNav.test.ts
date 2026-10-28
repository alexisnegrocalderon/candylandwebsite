import { describe, expect, it } from 'vitest';
import { directionBetween } from './appNav';

describe('directionBetween', () => {
  it('a una entrada anterior es volver', () => {
    expect(directionBetween(7, 5)).toBe('pop');
  });
  it('a una entrada posterior (adelante) es avanzar', () => {
    expect(directionBetween(5, 7)).toBe('push');
  });
  it('una entrada sin número (de antes de abrir la app) solo aparece', () => {
    expect(directionBetween(5, undefined)).toBe('replace');
  });
});
