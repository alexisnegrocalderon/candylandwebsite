import { describe, expect, it } from 'vitest';
import { computePhasePrice } from './tandaSchedule';

// Precios generales de PLAYMORE y la escala del evento (50 → 40 → 30 → 20 → 10 %).
const GENERALES: Record<string, number> = {
  Soltera: 20000, Duo: 60000, Soltero: 50000, 'Soltera doble': 25000, Trio: 70000, 'Grupo de 4': 80000,
};
const ESCALA = [50, 40, 30, 20, 10];

const ESPERADO: Record<string, number[]> = {
  Soltera: [10000, 12000, 14000, 16000, 18000],
  Duo: [30000, 36000, 42000, 48000, 54000],
  Soltero: [25000, 30000, 35000, 40000, 45000],
  'Soltera doble': [12500, 15000, 17500, 20000, 22500],
  Trio: [35000, 42000, 49000, 56000, 63000],
  'Grupo de 4': [40000, 48000, 56000, 64000, 72000],
};

describe('computePhasePrice', () => {
  it('no redondea al millar: el % es exacto (12.500, 17.500, 22.500)', () => {
    for (const [acceso, general] of Object.entries(GENERALES)) {
      expect(ESCALA.map((p) => computePhasePrice(general, p)), acceso).toEqual(ESPERADO[acceso]);
    }
  });

  it('0 % deja el precio general y un general inválido da 0', () => {
    expect(computePhasePrice(25000, 0)).toBe(25000);
    expect(computePhasePrice(0, 50)).toBe(0);
    expect(computePhasePrice(NaN, 50)).toBe(0);
  });

  it('siempre devuelve pesos enteros', () => {
    expect(Number.isInteger(computePhasePrice(12345, 33))).toBe(true);
  });
});
