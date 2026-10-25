import { describe, expect, it } from 'vitest';
import { rowLabels } from './stackTable';

describe('rowLabels', () => {
  it('da a cada celda el nombre de su columna', () => {
    expect(rowLabels(['Nombre', ' Contacto ', 'Cumpleaños'], [1, 1, 1])).toEqual(['Nombre', 'Contacto', 'Cumpleaños']);
  });
  it('limpia saltos de línea y espacios del encabezado', () => {
    expect(rowLabels(['Última\n  actividad', 'a', 'b'], [1, 1, 1])?.[0]).toBe('Última actividad');
  });
  it('deja como están las tablas de menos de tres columnas', () => {
    expect(rowLabels(['Código', 'Usos'], [1, 1])).toBeNull();
  });
  it('deja como están las filas que no calzan (celda combinada, columnas de más o de menos)', () => {
    expect(rowLabels(['a', 'b', 'c'], [3])).toBeNull();
    expect(rowLabels(['a', 'b', 'c'], [1, 2])).toBeNull();
    expect(rowLabels(['a', 'b', 'c'], [1, 1])).toBeNull();
    expect(rowLabels(['a', 'b', 'c'], [1, 1, 1, 1])).toBeNull();
  });
});
