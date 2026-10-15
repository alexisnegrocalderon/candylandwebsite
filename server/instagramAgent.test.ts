import { describe, expect, it } from 'vitest';
import { isShortAffirmation } from './instagramAgent';
describe('isShortAffirmation', () => {
  it('detecta respuestas afirmativas cortas', () => {
    for (const t of ['si', 'Sí!', 'dale', 'ok', 'claro que si', 'me interesa', 'cuéntame']) expect(isShortAffirmation(t)).toBe(true);
  });
  it('no confunde con consultas reales', () => {
    for (const t of ['cuánto cuesta la entrada para dos personas', 'no', 'quiero hablar con una persona por favor ahora mismo']) expect(isShortAffirmation(t)).toBe(false);
  });
});
