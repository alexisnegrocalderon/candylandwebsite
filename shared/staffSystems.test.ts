import { describe, expect, it } from 'vitest';
import { staffSystemsFor } from './cajaRoles';

describe('sección «Staff» de la App', () => {
  it('cada rol abre solo sus sistemas', () => {
    expect(staffSystemsFor([{ id: 1, role: 'acceso' }]).map((s) => s.key)).toEqual(['puerta']);
    expect(staffSystemsFor([{ id: 2, role: 'caja' }]).map((s) => s.key)).toEqual(['caja']);
    expect(staffSystemsFor([{ id: 3, role: 'cocina' }]).map((s) => s.key)).toEqual(['cocina']);
  });
  it('supervisor y admin entran a todo', () => {
    expect(staffSystemsFor([{ id: 4, role: 'supervisor' }]).map((s) => s.key)).toEqual(['caja', 'puerta', 'cocina', 'guardarropia', 'barra']);
  });
  it('con varios operadores, cada sistema usa el que sirve', () => {
    const r = staffSystemsFor([{ id: 7, role: 'guardarropia' }, { id: 8, role: 'barra' }]);
    expect(r).toEqual([
      { key: 'caja', label: 'Caja', path: '/caja', operatorId: 8 },
      { key: 'guardarropia', label: 'Guardarropía', path: '/guardarropia', operatorId: 7 },
      { key: 'barra', label: 'Conteo de barra', path: '/barra', operatorId: 8 },
    ]);
  });
  it('sin operadores, nada', () => {
    expect(staffSystemsFor([])).toEqual([]);
  });
});
