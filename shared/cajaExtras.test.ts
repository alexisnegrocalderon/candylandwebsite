import { describe, expect, it } from 'vitest';
import {
  UNDO_SERVER_GRACE_MS, UNDO_WINDOW_MS, clampQty, groupCajaExtras, groupSummary, pickCodes, redeemLabel, undoSecondsLeft, undoWithinWindow,
} from './cajaExtras';

const x = (displayCode: string | null, status: string, typeName: string) => ({ displayCode, status, typeName });

const extras = [
  x('PIS-0001', 'valid', 'Trago'), x('PIS-0002', 'valid', 'Trago'), x('PIS-0003', 'used', 'Trago'), x('PIS-0004', 'valid', 'trago '),
  x('EST-0001', 'valid', 'Estacionamiento'),
  x(null, 'used', 'Estacionamiento'),
  x('POL-0001', 'cancelled', 'Polera'),
];

describe('groupCajaExtras', () => {
  const groups = groupCajaExtras(extras);
  it('una fila por producto, aunque el nombre cambie de mayúsculas o espacios', () => {
    expect(groups.map((g) => [g.name, g.items.length])).toEqual([['Trago', 4], ['Estacionamiento', 2], ['Polera', 1]]);
  });
  it('separa lo que se puede cobrar de lo canjeado y lo anulado', () => {
    const trago = groups[0];
    expect(trago.validCodes).toEqual(['PIS-0001', 'PIS-0002', 'PIS-0004']);
    expect(trago.used).toBe(1);
    expect(groups[2]).toMatchObject({ cancelled: 1, validCodes: [] });
  });
  it('un ítem sin código (estacionamiento cobrado en la puerta) cuenta como usado y no se puede cobrar', () => {
    expect(groups[1]).toMatchObject({ validCodes: ['EST-0001'], used: 1 });
  });
});

describe('cantidad a cobrar', () => {
  const trago = groupCajaExtras(extras)[0];
  it('queda siempre entre 1 y lo que hay', () => {
    expect(clampQty(0, 3)).toBe(1);
    expect(clampQty(9, 3)).toBe(3);
    expect(clampQty(2.7, 3)).toBe(2);
    expect(clampQty(Number.NaN, 3)).toBe(1);
    expect(clampQty(1, 0)).toBe(0);
  });
  it('cobra los primeros N códigos', () => {
    expect(pickCodes(trago, 1)).toEqual(['PIS-0001']);
    expect(pickCodes(trago, 2)).toEqual(['PIS-0001', 'PIS-0002']);
    expect(pickCodes(trago, 99)).toEqual(['PIS-0001', 'PIS-0002', 'PIS-0004']);
  });
  it('sin nada por cobrar no cobra nada', () => {
    expect(pickCodes(groupCajaExtras(extras)[2], 1)).toEqual([]);
  });
});

describe('textos', () => {
  const g = groupCajaExtras(extras);
  it('cuántos quedan', () => {
    expect(groupSummary(g[0])).toBe('quedan 3 de 4');
    expect(groupSummary(g[1])).toBe('queda 1 de 2');
    expect(groupSummary(g[2])).toBe('Anulado');
    expect(groupSummary(groupCajaExtras([x('A', 'valid', 'Trago')])[0])).toBe('Pendiente');
    expect(groupSummary(groupCajaExtras([x('A', 'used', 'Trago')])[0])).toBe('Canjeado');
    expect(groupSummary(groupCajaExtras([x('A', 'used', 'Trago'), x('B', 'used', 'Trago')])[0])).toBe('Todos canjeados (2)');
  });
  it('lo que se anuncia al cobrar', () => {
    expect(redeemLabel('Trago', 1)).toBe('1 Trago');
    expect(redeemLabel('Trago', 3)).toBe('3 × Trago');
  });
});

describe('deshacer', () => {
  it('cuenta regresiva de 60 segundos', () => {
    expect(UNDO_WINDOW_MS).toBe(60_000);
    expect(undoSecondsLeft(1_000, 1_000)).toBe(60);
    expect(undoSecondsLeft(1_000, 31_000)).toBe(30);
    expect(undoSecondsLeft(1_000, 60_900)).toBe(1);
    expect(undoSecondsLeft(1_000, 61_000)).toBe(0);
    expect(undoSecondsLeft(1_000, 500_000)).toBe(0);
  });
  it('el servidor acepta hasta 60 s más la holgura, nunca menos', () => {
    const t0 = Date.parse('2026-10-30T23:00:00Z');
    expect(undoWithinWindow(t0, t0 + 59_000)).toBe(true);
    expect(undoWithinWindow(t0, t0 + UNDO_WINDOW_MS)).toBe(true);
    expect(undoWithinWindow(t0, t0 + UNDO_WINDOW_MS + UNDO_SERVER_GRACE_MS)).toBe(true);
    expect(undoWithinWindow(t0, t0 + UNDO_WINDOW_MS + UNDO_SERVER_GRACE_MS + 1)).toBe(false);
    expect(undoWithinWindow(t0, t0 + 5 * 60_000)).toBe(false);
  });
  it('un deshacer «antes» del canje (relojes desfasados) solo pasa dentro de la holgura', () => {
    const t0 = Date.parse('2026-10-30T23:00:00Z');
    expect(undoWithinWindow(t0, t0 - 3_000)).toBe(true);
    expect(undoWithinWindow(t0, t0 - UNDO_SERVER_GRACE_MS - 1)).toBe(false);
  });
});
