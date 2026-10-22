import { describe, expect, it } from 'vitest';
import { sortByKind, ticketKind, ticketKindLabel } from './ticketKind';

describe('tipo de cada QR', () => {
  it('reconoce el estacionamiento por el nombre, aunque venga como extra o VIP', () => {
    expect(ticketKind('extra', 'Estacionamiento')).toBe('estacionamiento');
    expect(ticketKind('extra', 'Estacionamiento VIP')).toBe('estacionamiento');
    expect(ticketKind('extra', 'Parking')).toBe('estacionamiento');
  });

  it('los accesos y los demás extras', () => {
    expect(ticketKind('acceso', 'Acceso Dúo')).toBe('acceso');
    expect(ticketKind('locker', 'Locker')).toBe('guardarropia');
    expect(ticketKind('consumo', 'Piscola')).toBe('consumo');
    expect(ticketKind('extra', 'Pulsera')).toBe('extra');
  });

  it('el acceso se nombra con su tipo y el resto con el genérico', () => {
    expect(ticketKindLabel('acceso', 'Acceso Dúo')).toBe('Acceso Dúo');
    expect(ticketKindLabel('estacionamiento', 'Estacionamiento VIP')).toBe('Estacionamiento');
  });

  it('accesos primero y extras después, sin cambiar su orden interno', () => {
    const list = [{ id: 1, kind: 'estacionamiento' as const }, { id: 2, kind: 'acceso' as const }, { id: 3, kind: 'acceso' as const }];
    expect(sortByKind(list).map((x) => x.id)).toEqual([2, 3, 1]);
  });
});
