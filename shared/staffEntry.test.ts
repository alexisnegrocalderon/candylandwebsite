import { describe, expect, it } from 'vitest';
import { arrivalWindow, canUndoArrival, staffEntryPaymentId, staffParkingPaymentId } from './staffEntry';
import { classifyParkingOrigin } from './parking';

const ev = { eventDate: '2026-10-31T01:00:00Z', doorsOpen: '2026-10-31T01:00:00Z', eventEnd: '2026-10-31T08:00:00Z' };

describe('ventana de llegada del staff', () => {
  it('abre 3 horas antes de la apertura', () => {
    expect(arrivalWindow(ev, new Date('2026-10-30T21:00:00Z')).phase).toBe('antes');
    expect(arrivalWindow(ev, new Date('2026-10-30T22:00:00Z')).phase).toBe('abierto');
    expect(arrivalWindow(ev, new Date('2026-10-31T03:00:00Z')).phase).toBe('abierto');
    expect(arrivalWindow(ev, new Date('2026-10-31T08:30:00Z')).phase).toBe('cerrado');
  });
  it('sin hora de término dura 12 horas desde el inicio', () => {
    const w = arrivalWindow({ eventDate: ev.eventDate }, new Date('2026-10-31T12:00:00Z'));
    expect(w.phase).toBe('abierto');
    expect(arrivalWindow({ eventDate: ev.eventDate }, new Date('2026-10-31T14:00:00Z')).phase).toBe('cerrado');
  });
  it('se puede deshacer solo unos minutos', () => {
    const at = '2026-10-31T01:00:00Z';
    expect(canUndoArrival(at, new Date('2026-10-31T01:09:00Z'))).toBe(true);
    expect(canUndoArrival(at, new Date('2026-10-31T01:11:00Z'))).toBe(false);
    expect(canUndoArrival(null)).toBe(false);
  });
});

describe('claves idempotentes y origen del estacionamiento', () => {
  it('una clave por persona y evento', () => {
    expect(staffEntryPaymentId(7, 3)).toBe('STAFF-ENTRY-7-3');
    expect(staffParkingPaymentId(7, 3)).toBe('STAFF-PARKING-7-3');
  });
  it('el estacionamiento del staff cuenta como «staff» y no como cobrado', () => {
    expect(classifyParkingOrigin({ orderPaymentMethod: 'Manual: Staff', orderPaymentId: 'STAFF-PARKING-7-3' })).toBe('staff');
    expect(classifyParkingOrigin({ orderPaymentMethod: 'Manual: Invitación', orderPaymentId: null })).toBe('staff');
    expect(classifyParkingOrigin({ orderPaymentMethod: 'efectivo', orderPaymentId: 'PUERTA-PARKING-x' })).toBe('puerta');
  });
});
