import { describe, expect, it } from 'vitest';
import { findMatchedAttendee } from './db';

const data = JSON.stringify({
  campos: {
    buyer__nombre: 'Ana Pérez', buyer__rut: '11.111.111-1',
    acomp1_nombre: 'José Núñez', acomp1_rut: '12.345.678-K',
    acomp2_nombre: 'Luz Soto',
  },
});

describe('findMatchedAttendee', () => {
  it('encuentra al acompañante por nombre sin tildes ni mayúsculas', () => {
    expect(findMatchedAttendee(data, 'Ana Pérez', 'jose nunez')?.name).toBe('José Núñez');
  });
  it('encuentra por RUT con o sin puntos y guion', () => {
    for (const t of ['12.345.678-K', '12345678-k', '123456780'.slice(0, 8), '2345678k']) {
      const m = findMatchedAttendee(data, 'Ana Pérez', t);
      expect(m?.name, t).toBe('José Núñez');
    }
  });
  it('marca al titular', () => {
    expect(findMatchedAttendee(data, 'Ana Pérez', '11111111')?.isBuyer).toBe(true);
  });
  it('null si no coincide ninguna persona', () => {
    expect(findMatchedAttendee(data, 'Ana Pérez', 'zzz')).toBeNull();
  });
});

import { listAttendeeSlots } from './db';

describe('listAttendeeSlots con pasaporte', () => {
  const withPassport = JSON.stringify({
    campos: {
      buyer__nombre: 'Ana Pérez', buyer__rut: '11.111.111-1',
      acceso__acomp1_nombre: 'Joana Silva', acceso__acomp1_rut: 'FH123456', acceso__acomp1_docTipo: 'passport',
      acceso__acomp2_nombre: 'Luz Soto', acceso__acomp2_rut: '12.345.678-5',
    },
  });
  it('lee el tipo de documento de cada persona (RUT por defecto)', () => {
    const slots = listAttendeeSlots(withPassport, null);
    expect(slots.map((s) => [s.fullName, s.docType, s.rut])).toEqual([
      ['Ana Pérez', 'rut', '11.111.111-1'],
      ['Joana Silva', 'passport', 'FH123456'],
      ['Luz Soto', 'rut', '12.345.678-5'],
    ]);
  });
});

import { companionCustomerEmail, COMPANION_EMAIL_SUFFIX } from './db';

describe('correo inventado de la ficha del acompañante', () => {
  it('con RUT usa los dígitos, igual con cualquier formato', () => {
    expect(companionCustomerEmail('123456785', 'Luz Soto')).toBe(`acomp.123456785${COMPANION_EMAIL_SUFFIX}`);
  });
  it('sin RUT usa el nombre sin tildes ni símbolos', () => {
    expect(companionCustomerEmail('', 'José Núñez')).toBe(`acomp.n-jose-nunez${COMPANION_EMAIL_SUFFIX}`);
  });
  it('nunca es un correo real: el dominio no existe', () => {
    expect(COMPANION_EMAIL_SUFFIX.endsWith('.invalid')).toBe(true);
  });
});
