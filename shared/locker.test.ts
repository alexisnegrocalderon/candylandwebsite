import { describe, expect, it } from 'vitest';
import {
  canTransitionLockerItem, compareLockerTags, lockerMatchesSearch, lockerTagMatchesDigits, normalizeSearch, parseLockerTag,
} from './locker';

describe('canTransitionLockerItem', () => {
  it('flujo normal y reingreso', () => {
    expect(canTransitionLockerItem('pendiente', 'guardado')).toBe(true);
    expect(canTransitionLockerItem('guardado', 'retirado')).toBe(true);
    expect(canTransitionLockerItem('retirado', 'guardado')).toBe(true);
  });
  it('deshacer un Recibido: guardado vuelve a pendiente', () => {
    expect(canTransitionLockerItem('guardado', 'pendiente')).toBe(true);
  });
  it('no hay otros saltos (ni de retirado a pendiente, ni pendiente directo a retirado)', () => {
    expect(canTransitionLockerItem('retirado', 'pendiente')).toBe(false);
    expect(canTransitionLockerItem('pendiente', 'retirado')).toBe(false);
    expect(canTransitionLockerItem('pendiente', 'pendiente')).toBe(false);
  });
});

describe('número de percha', () => {
  it('parsea <caja>-<correlativo>', () => {
    expect(parseLockerTag('1-007')).toEqual({ register: 1, counter: 7 });
    expect(Number.isNaN(parseLockerTag('raro').counter)).toBe(true);
  });

  it('ordena del 1 en adelante (numérico, no por texto) y por caja a igual número', () => {
    const tags = ['1-010', '2-002', '1-002', '1-001', 'raro'];
    expect([...tags].sort(compareLockerTags)).toEqual(['1-001', '1-002', '2-002', '1-010', 'raro']);
  });

  it('la entrega rápida calza por correlativo o por número completo sin guion', () => {
    expect(lockerTagMatchesDigits('1-007', '7')).toBe(true);
    expect(lockerTagMatchesDigits('1-007', '007')).toBe(true);
    expect(lockerTagMatchesDigits('1-007', '1007')).toBe(true);
    expect(lockerTagMatchesDigits('1-007', '17')).toBe(false);
    expect(lockerTagMatchesDigits('1-007', '')).toBe(false);
    expect(lockerTagMatchesDigits('2-007', '7')).toBe(true); // dos cajas con el mismo correlativo: el staff elige
  });
});

describe('buscador', () => {
  const ana = { tagNumber: '1-007', customerName: 'María José' };
  it('por nombre sin tildes ni mayúsculas', () => {
    expect(normalizeSearch('  MARÍA ')).toBe('maria');
    expect(lockerMatchesSearch(ana, 'maria')).toBe(true);
    expect(lockerMatchesSearch(ana, 'jose')).toBe(true);
    expect(lockerMatchesSearch(ana, 'pedro')).toBe(false);
  });
  it('por número de percha', () => {
    expect(lockerMatchesSearch(ana, '7')).toBe(true);
    expect(lockerMatchesSearch(ana, '1-007')).toBe(true);
    expect(lockerMatchesSearch(ana, '8')).toBe(false);
  });
  it('sin texto muestra todo', () => {
    expect(lockerMatchesSearch(ana, '  ')).toBe(true);
    expect(lockerMatchesSearch({ tagNumber: '1-001', customerName: null }, 'x')).toBe(false);
  });
});
