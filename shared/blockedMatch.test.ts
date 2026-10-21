import { describe, expect, it } from 'vitest';
import { isBodyOnlyRutKey, isFullRutKey, blockedKeysFor, emailKey, hasHardKey, igKey, matchBlocked, nameKey, phoneKey, rutKey, type BlockedRow } from './blockedMatch';

const row = (id: number, f: Parameters<typeof blockedKeysFor>[0], extra: Partial<BlockedRow> = {}): BlockedRow => ({ id, fullName: f.fullName ?? null, ...blockedKeysFor(f), ...extra });

describe('normalizadores', () => {
  it('RUT: con o sin puntos y guion es el mismo', () => {
    expect(rutKey('12.345.678-k')).toBe('12345678K');
    expect(rutKey('123456789')).toBe('123456789');
    expect(rutKey('12.345.678-9')).toBe(rutKey('12345678-9'));
    expect(rutKey('123')).toBe('');
  });
  it('teléfono: +56 9, 569 y 9 dígitos son el mismo; muy corto no cuenta', () => {
    expect(phoneKey('+56 9 1234 5678')).toBe('912345678');
    expect(phoneKey('56912345678')).toBe('912345678');
    expect(phoneKey('9 1234 5678')).toBe('912345678');
    expect(phoneKey('1234')).toBe('');
  });
  it('correo e Instagram', () => {
    expect(emailKey(' Foo@Bar.COM ')).toBe('foo@bar.com');
    expect(emailKey('sinners')).toBe('');
    expect(igKey('@Foo.Bar')).toBe('foo.bar');
    expect(igKey('https://instagram.com/foo.bar/?igsh=1')).toBe('foo.bar');
  });
  it('nombre: sin tildes y exige nombre y apellido', () => {
    expect(nameKey('  José  PÉREZ ')).toBe('jose perez');
    expect(nameKey('Juan')).toBe('');
  });
});

describe('matchBlocked', () => {
  const rows = [
    row(1, { fullName: 'Juan Pérez', rut: '12.345.678-5', phone: '+56 9 1111 2222' }),
    row(2, { fullName: 'María González' }),
    row(3, { instagram: '@malo.malo' }, { isActive: 0 }),
    row(4, { instagram: '@otro.malo', email: 'x@y.cl' }),
  ];

  it('bloquea por dato duro aunque el formato sea distinto', () => {
    const r = matchBlocked([{ name: 'Otro nombre', rut: '123456785' }], rows);
    expect(r.block.map((h) => [h.row.id, h.by])).toEqual([[1, 'rut']]);
    expect(matchBlocked([{ phone: '91111 2222' }], rows).block[0].by).toBe('phone');
    expect(matchBlocked([{ instagram: 'https://instagram.com/otro.malo' }], rows).block[0].by).toBe('instagram');
    expect(matchBlocked([{ email: 'X@Y.CL' }], rows).block[0].by).toBe('email');
  });

  it('una ficha con RUT sin dígito verificador bloquea al RUT completo; una cédula extranjera, solo si es idéntica', () => {
    const list = [row(10, { rut: '5698486' }), row(11, { rut: '1096257494' })];
    expect(isBodyOnlyRutKey('5698486')).toBe(true);
    expect(isFullRutKey('56984860')).toBe(true);
    expect(matchBlocked([{ rut: '5.698.486-0' }], list).block.map((h) => h.row.id)).toEqual([10]);
    expect(matchBlocked([{ rut: '5.698.486-K' }], list).block).toEqual([]); // DV inválido: no es ese RUT
    expect(matchBlocked([{ rut: '1096257494' }], list).block.map((h) => h.row.id)).toEqual([11]);
    expect(matchBlocked([{ rut: '1096257495' }], list).block).toEqual([]);
  });

  it('el nombre solo avisa, nunca bloquea', () => {
    const r = matchBlocked([{ name: 'maria gonzalez' }], rows);
    expect(r.block).toEqual([]);
    expect(r.review.map((h) => [h.row.id, h.by])).toEqual([[2, 'name']]);
  });

  it('un bloqueado desactivado no cuenta', () => {
    expect(matchBlocked([{ instagram: '@malo.malo' }], rows).block).toEqual([]);
  });

  it('revisa a cada acompañante y dice cuál coincidió', () => {
    const r = matchBlocked([{ name: 'Persona Uno', rut: '11111111-1' }, { name: 'Persona Dos', phone: '+56911112222' }], rows);
    expect(r.block.map((h) => h.identityIndex)).toEqual([1]);
  });

  it('con solo nombre no hay dato duro', () => {
    expect(hasHardKey(blockedKeysFor({ fullName: 'María González' }))).toBe(false);
    expect(hasHardKey(blockedKeysFor({ phone: '+56 9 1111 2222' }))).toBe(true);
  });
});
