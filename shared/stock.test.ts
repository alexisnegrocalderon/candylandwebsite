import { describe, it, expect } from 'vitest';
import { UNLIMITED_STOCK, isUnlimitedStock } from './stock';

describe('isUnlimitedStock', () => {
  it('reconoce el centinela 999999 como sin tope', () => {
    expect(isUnlimitedStock(UNLIMITED_STOCK)).toBe(true);
  });
  it('reconoce otros números enormes tecleados a mano', () => {
    expect(isUnlimitedStock(100000)).toBe(true);
    expect(isUnlimitedStock(1_000_000)).toBe(true);
  });
  it('no confunde un cupo real con "sin tope"', () => {
    expect(isUnlimitedStock(300)).toBe(false);
    expect(isUnlimitedStock(5000)).toBe(false);
    expect(isUnlimitedStock(0)).toBe(false);
  });
});
