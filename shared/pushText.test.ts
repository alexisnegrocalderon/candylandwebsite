import { describe, expect, it } from 'vitest';
import { clip, clp, pushTitle } from './pushText';

describe('pushText', () => {
  it('no corta textos cortos', () => {
    expect(clip('Hola  mundo', 20)).toBe('Hola mundo');
  });
  it('corta en palabra completa con …', () => {
    expect(clip('hola quiero saber el precio de las entradas para el sábado', 30)).toBe('hola quiero saber el precio…');
  });
  it('arma títulos de una línea', () => {
    expect(pushTitle('🍭', 'Venta web', clp(25000))).toBe('🍭 Venta web · $25.000');
    expect(pushTitle('📩', 'IG', '@usuario_con_un_nombre_larguisimo_de_verdad').length).toBeLessThanOrEqual(40);
  });
});
