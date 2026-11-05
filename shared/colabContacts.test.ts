import { describe, expect, it } from 'vitest';
import { parseColabContacts } from './colabContacts';

describe('parseColabContacts', () => {
  it('lee CSV con encabezados en cualquier orden', () => {
    const r = parseColabContacts('Teléfono,Correo,Nombre\n+56911112222,ANA@Mail.com,Ana Pérez\n');
    expect(r.rows).toEqual([{ email: 'ana@mail.com', fullName: 'Ana Pérez', phone: '+56911112222' }]);
  });
  it('lee lo pegado desde una planilla (tabulaciones) sin encabezados', () => {
    const r = parseColabContacts('Luis\tluis@x.cl\t912345678\nMaría\tmaria@x.cl\t');
    expect(r.rows.map((x) => x.email)).toEqual(['luis@x.cl', 'maria@x.cl']);
    expect(r.rows[0].fullName).toBe('Luis');
  });
  it('cuenta inválidos y repetidos sin romper', () => {
    const r = parseColabContacts('nombre;correo\nA;a@x.cl\nB;no-es-correo\nC;A@x.cl\n');
    expect(r).toMatchObject({ invalid: 1, duplicates: 1 });
    expect(r.rows).toHaveLength(1);
  });
  it('vacío', () => {
    expect(parseColabContacts('  \n').rows).toEqual([]);
  });
});
