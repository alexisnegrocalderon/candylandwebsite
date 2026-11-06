import { describe, expect, it } from 'vitest';
import { tandaLabel } from './tandaLabel';

describe('nombre de la tanda en el correo', () => {
  it('con tres tandas: primera, 2ª y final', () => {
    expect(tandaLabel(0, 3)).toBe('Primera tanda');
    expect(tandaLabel(1, 3)).toBe('2ª tanda');
    expect(tandaLabel(2, 3)).toBe('Tanda final');
  });
  it('con cuatro tandas la 3ª no se llama final', () => {
    expect(tandaLabel(2, 4)).toBe('Tanda 3');
    expect(tandaLabel(3, 4)).toBe('Tanda final');
  });
  it('con una sola tanda no dice final', () => {
    expect(tandaLabel(0, 1)).toBe('Primera tanda');
  });
});
