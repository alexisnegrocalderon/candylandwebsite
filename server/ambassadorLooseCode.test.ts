import { describe, expect, it } from 'vitest';
import { looseCodeKey } from './ambassadorProgram';

describe('looseCodeKey', () => {
  it('ignora mayúsculas, espacios, guiones y tildes', () => {
    expect(looseCodeKey(' ana-maría 10 ')).toBe('ANAMARIA10');
    expect(looseCodeKey('ANA_MARIA10')).toBe('ANAMARIA10');
  });
  it('vacío queda vacío', () => {
    expect(looseCodeKey('  - ')).toBe('');
  });
});
