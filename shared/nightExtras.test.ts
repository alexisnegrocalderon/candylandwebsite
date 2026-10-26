import { describe, expect, it } from 'vitest';
import {
  anyLive, extraGroups, groupDetail, groupOf, groupTickets, hasLive, kitchenStatusLabel, kitchenStep, liveItems,
  lockerStatusLabel, nextUnit, nightSummary, type NightTicket,
} from './nightExtras';

const t = (ticketCode: string, kind: NightTicket['kind'], typeName: string, extra: Partial<NightTicket> = {}): NightTicket =>
  ({ ticketCode, kind, typeName, status: 'valid', qrImageUrl: `qr-${ticketCode}`, ...extra });

const tickets: NightTicket[] = [
  t('A1', 'acceso', 'Acceso Trío'),
  t('A2', 'acceso', 'Acceso Trío'),
  t('P1', 'estacionamiento', 'Estacionamiento Premium'),
  t('D1', 'consumo', 'Pack 2 tragos'),
  t('D2', 'consumo', 'Pack 2 tragos', { status: 'used', usedAt: '2026-10-31T02:41:00Z' }),
  t('M1', 'merch', 'Polera PlayRoom', { status: 'used', usedAt: '2026-10-31T01:10:00Z' }),
];

describe('groupTickets', () => {
  const groups = groupTickets(tickets);
  it('las entradas van juntas y primero; los extras repetidos son una sola fila', () => {
    expect(groups.map((g) => [g.kind, g.name, g.units.length])).toEqual([
      ['acceso', 'Entradas', 2], ['estacionamiento', 'Estacionamiento', 1], ['consumo', 'Pack 2 tragos', 2], ['merch', 'Polera PlayRoom', 1],
    ]);
  });
  it('los extras ya canjeados quedan al final', () => {
    expect(groups[groups.length - 1].state).toBe('canjeado');
  });
  it('estado del grupo: pendiente, parcial o canjeado', () => {
    const drinks = groups.find((g) => g.name === 'Pack 2 tragos')!;
    expect(drinks).toMatchObject({ redeemed: 1, pending: 1, state: 'parcial' });
    expect(groups.find((g) => g.kind === 'estacionamiento')!.state).toBe('pendiente');
  });
  it('extraGroups deja fuera la entrada', () => {
    expect(extraGroups(tickets).every((g) => g.kind !== 'acceso')).toBe(true);
  });
});

describe('detalle de cada fila', () => {
  const g = (name: string) => groupTickets(tickets).find((x) => x.name === name)!;
  it('una unidad: por canjear o canjeado con la hora', () => {
    expect(groupDetail(g('Estacionamiento'))).toBe('Por canjear');
    expect(groupDetail(g('Polera PlayRoom'))).toMatch(/^Canjeado · \d{2}:\d{2}$/);
  });
  it('varias unidades: cuántas quedan', () => {
    expect(groupDetail(g('Pack 2 tragos'))).toBe('×2 · queda 1');
    const three = groupTickets([t('X1', 'consumo', 'Trago'), t('X2', 'consumo', 'Trago'), t('X3', 'consumo', 'Trago')]).find((x) => x.kind === 'consumo')!;
    expect(groupDetail(three)).toBe('×3 · quedan 3');
    const all = groupTickets([t('Y1', 'consumo', 'Trago', { status: 'used' }), t('Y2', 'consumo', 'Trago', { status: 'used' })]).find((x) => x.kind === 'consumo')!;
    expect(groupDetail(all)).toBe('×2 · canjeados');
  });
  it('el estacionamiento cobrado en la puerta no tiene nada que mostrar', () => {
    const door = groupTickets([t('P9', 'estacionamiento', 'Estacionamiento', { status: 'used', qrImageUrl: null })])[0];
    expect(groupDetail(door)).toBe('Ya cobrado en la puerta');
  });
});

describe('nextUnit / groupOf', () => {
  it('toca un grupo: abre la primera unidad por canjear con QR', () => {
    const drinks = groupTickets(tickets).find((x) => x.name === 'Pack 2 tragos')!;
    expect(nextUnit(drinks).ticketCode).toBe('D1');
    expect(groupOf(groupTickets(tickets), 'D2')?.name).toBe('Pack 2 tragos');
    expect(groupOf(groupTickets(tickets), 'nada')).toBeNull();
  });
});

describe('cocina y guardarropía', () => {
  it('etiquetas y pasos', () => {
    expect(kitchenStatusLabel({ ticketNumber: 'C-12', status: 'aprobado', items: [] })).toBe('Se está preparando');
    expect(kitchenStep({ ticketNumber: 'C-12', status: 'pendiente', items: [] })).toBe(0);
    expect(kitchenStep({ ticketNumber: 'C-12', status: 'aprobado', items: [] })).toBe(1);
    expect(kitchenStep({ ticketNumber: 'C-12', status: 'entregado', items: [] })).toBe(2);
    expect(lockerStatusLabel({ tagNumber: '47', status: 'pendiente' })).toBe('Entrega tu abrigo en la guardarropía');
    expect(lockerStatusLabel({ tagNumber: '47', status: 'guardado', receivedAt: '2026-10-31T02:10:00Z' })).toMatch(/^Guardado · \d{2}:\d{2}$/);
  });
  it('solo lo que está pasando ahora cuenta como «vivo»', () => {
    const ev = {
      eventId: 1, tickets: [],
      kitchen: [{ ticketNumber: 'C-1', status: 'entregado', items: [] }, { ticketNumber: 'C-2', status: 'aprobado', items: [] }],
      lockers: [{ tagNumber: '12', status: 'retirado' }, { tagNumber: '47', status: 'guardado' }],
    };
    const live = liveItems(ev);
    expect(live.kitchen.map((k) => k.ticketNumber)).toEqual(['C-2']);
    expect(live.lockers.map((l) => l.tagNumber)).toEqual(['47']);
    expect(hasLive(ev)).toBe(true);
    expect(hasLive({ eventId: 1, tickets: [], kitchen: [{ ticketNumber: 'C-1', status: 'entregado', items: [] }] })).toBe(false);
    expect(anyLive([ev])).toBe(true);
    expect(anyLive([])).toBe(false);
    expect(anyLive(null)).toBe(false);
  });
});

describe('resumen de «Mi noche»', () => {
  it('cuenta lo que queda por canjear', () => {
    const s = nightSummary({ eventId: 1, tickets });
    expect(s.pending).toBe(2);
    expect(s.label).toBe('2 por canjear');
    expect(s.empty).toBe(false);
  });
  it('sin extras, sin guardarropía ni cocina: vacío (la fila no se muestra)', () => {
    expect(nightSummary({ eventId: 1, tickets: [t('A1', 'acceso', 'Acceso Trío')] }).empty).toBe(true);
    expect(nightSummary(null).empty).toBe(true);
  });
  it('si todo está canjeado lo dice; con un pedido en cocina, también', () => {
    expect(nightSummary({ eventId: 1, tickets: [t('M1', 'merch', 'Polera', { status: 'used' })] }).label).toBe('Todo canjeado');
    expect(nightSummary({ eventId: 1, tickets: [], kitchen: [{ ticketNumber: 'C-2', status: 'aprobado', items: [] }] }).label).toBe('Tu pedido está en cocina');
  });
});
