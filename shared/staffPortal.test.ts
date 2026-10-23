import { describe, expect, it } from 'vitest';
import { dialable, isStaffCode, isValidCallTime, normalizeStaffEventInfo, noteForRole, parseStaffCode, roleKey, staffToolsForRole } from './staffPortal';
import { parseTicketCodeFromQr } from './qr';

describe('app del staff', () => {
  it('lee la credencial y no la confunde con una entrada', () => {
    expect(parseStaffCode('STAFF-12-7-AB12CD')).toEqual({ staffId: 12, eventId: 7, sig: 'AB12CD' });
    expect(parseStaffCode('staff-12-7-ab12cd')?.sig).toBe('AB12CD');
    expect(isStaffCode('MP-ABCDEF123456')).toBe(false);
    expect(isStaffCode('STAFF-12-7-AB12')).toBe(false);
    // La cámara de la puerta la deja pasar tal cual, como un código tecleado.
    expect(parseTicketCodeFromQr('STAFF-12-7-AB12CD')).toBe('STAFF-12-7-AB12CD');
  });

  it('da las herramientas según el rol, escrito como sea', () => {
    expect(staffToolsForRole('Puerta').map((t) => t.key)).toEqual(['puerta']);
    expect(staffToolsForRole('Bartender').map((t) => t.key)).toEqual(['caja']);
    expect(staffToolsForRole('Cocinera').map((t) => t.key)).toEqual(['cocina']);
    expect(staffToolsForRole('Guardarropía').map((t) => t.key)).toEqual(['guardarropia']);
    expect(staffToolsForRole('Supervisora').map((t) => t.key)).toEqual(['puerta', 'caja', 'cocina', 'guardarropia']);
    expect(staffToolsForRole('DJ')).toEqual([]);
    expect(staffToolsForRole(null)).toEqual([]);
  });

  it('la nota de cada rol se encuentra aunque el rol se escriba distinto', () => {
    const info = normalizeStaffEventInfo({ byRole: { [roleKey('Barra')]: 'Hielo a las 21:00' } });
    expect(noteForRole(info, '  BARRA ')).toBe('Hielo a las 21:00');
    expect(noteForRole(info, 'Puerta')).toBe('');
  });

  it('limpia lo que se guarda: horas válidas, llegadas con fecha y contactos con algo', () => {
    const info = normalizeStaffEventInfo({
      general: '  Llegar puntual  ',
      contacts: [{ label: 'Alexis', phone: '+56 9 1234 5678' }, { label: '', phone: '' }, 'x'],
      byRole: { barra: 'ok', 'Mal Clave': 'no' },
      callTimes: { 3: '21:30', 4: '25:00', x: '21:00' },
      arrivals: { 3: '2026-10-31T01:10:00.000Z', 4: 'ayer' },
    });
    expect(info.general).toBe('Llegar puntual');
    expect(info.contacts).toEqual([{ label: 'Alexis', phone: '+56 9 1234 5678' }]);
    expect(info.byRole).toEqual({ barra: 'ok' });
    expect(info.callTimes).toEqual({ 3: '21:30' });
    expect(Object.keys(info.arrivals)).toEqual(['3']);
    expect(normalizeStaffEventInfo(null)).toEqual({ general: '', dressCode: '', contacts: [], byRole: {}, callTimes: {}, arrivals: {} });
  });

  it('valida la hora de citación y deja el teléfono marcable', () => {
    expect(isValidCallTime('09:05')).toBe(true);
    expect(isValidCallTime('9:05')).toBe(false);
    expect(dialable('+56 9 1234-5678')).toBe('+56912345678');
  });
});
