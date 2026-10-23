import { describe, expect, it } from 'vitest';
import { companionsFromCampos, knownCompanions, lastPurchaseFrom } from './repurchase';

const duo = JSON.stringify({ acceso: 'Acceso Dúo', cantidad: 1, grupoTipo: 'duo', campos: { buyer__nombre: 'Alexis', acceso__acomp1_nombre: 'Camila Rojas', acceso__acomp1_rut: '12.345.678-5', acceso__acomp1_docTipo: 'rut' } });
const trio = JSON.stringify({ acceso: 'Trío', cantidad: 1, grupoTipo: 'trio', campos: { acceso__acomp1_nombre: 'Javi', acceso__acomp1_rut: '9.876.543-3', acceso__acomp2_nombre: 'Camila Rojas', acceso__acomp2_rut: '12345678-5' } });
const dosHombres = JSON.stringify({ acceso: 'Dúo', cantidad: 1, grupoTipo: 'duo', campos: { acceso__codigo_acceso: 'ABC', acceso__acomp1_nombre: 'Pedro', acceso__acomp1_rut: '1-9' } });

describe('recompra en un toque', () => {
  it('lee los acompañantes en orden y descarta los incompletos', () => {
    expect(companionsFromCampos({ acceso__acomp2_nombre: 'B', acceso__acomp2_rut: '2', acceso__acomp1_nombre: 'A', acceso__acomp1_rut: '1', acceso__acomp3_nombre: 'C' }))
      .toEqual([{ nombre: 'A', rut: '1' }, { nombre: 'B', rut: '2' }]);
  });

  it('toma la compra más nueva que se pueda repetir, con su opción de «¿Cómo vienes?»', () => {
    expect(lastPurchaseFrom([duo, trio])).toEqual({ accesoSlug: 'duo', accesoName: 'Acceso Dúo', qty: 1, option: 'pareja', companions: [{ nombre: 'Camila Rojas', rut: '12.345.678-5', docTipo: 'rut' }] });
  });

  it('salta las compras con código de comunidad y los datos rotos', () => {
    expect(lastPurchaseFrom([dosHombres, 'no-json', null, trio])?.accesoSlug).toBe('trio');
    expect(lastPurchaseFrom([dosHombres])).toBeNull();
  });

  it('junta a todos sus acompañantes sin repetir a la misma persona', () => {
    expect(knownCompanions([duo, trio]).map((c) => c.nombre)).toEqual(['Camila Rojas', 'Javi']);
  });
});
