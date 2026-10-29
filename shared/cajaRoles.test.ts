import { describe, expect, it } from 'vitest';
import { canEnterArea, canUseCaja, ownArea, staffSystemsFor, STAFF_SYSTEMS } from './cajaRoles';

describe('cada área es de su rol', () => {
  it('solo Caja, Supervisor y Admin usan la caja: Barra no', () => {
    for (const r of ['caja', 'supervisor', 'admin']) expect(canUseCaja(r)).toBe(true);
    for (const r of ['barra', 'acceso', 'cocina', 'guardarropia', '', null, undefined]) expect(canUseCaja(r as any)).toBe(false);
  });

  it('cada pantalla acepta a su rol y a Supervisor/Admin, y a nadie más', () => {
    const only = (key: string) => STAFF_SYSTEMS.find((s) => s.key === key)!.roles;
    expect(only('caja')).toEqual(['caja', 'supervisor', 'admin']);
    expect(only('puerta')).toEqual(['acceso', 'supervisor', 'admin']);
    expect(only('cocina')).toEqual(['cocina', 'supervisor', 'admin']);
    expect(only('guardarropia')).toEqual(['guardarropia', 'supervisor', 'admin']);
    expect(only('barra')).toEqual(['barra', 'supervisor', 'admin']);
  });
});

describe('staffSystemsFor: lo que ve cada persona en la App', () => {
  const ops = [{ id: 1, role: 'barra' }, { id: 2, role: 'caja' }, { id: 3, role: 'guardarropia' }];
  it('un bartender ve solo el conteo de barra, aunque tenga operadores de otras áreas', () => {
    expect(staffSystemsFor(ops, 'barra').map((s) => s.key)).toEqual(['barra']);
  });
  it('caja ve solo la caja; guardarropía solo su pantalla', () => {
    expect(staffSystemsFor(ops, 'caja').map((s) => s.key)).toEqual(['caja']);
    expect(staffSystemsFor(ops, 'guardarropia').map((s) => s.key)).toEqual(['guardarropia']);
  });
  it('supervisor y admin ven todas las áreas', () => {
    const all = staffSystemsFor([{ id: 9, role: 'supervisor' }], 'supervisor').map((s) => s.key);
    expect(all).toEqual(['caja', 'puerta', 'cocina', 'guardarropia', 'barra']);
    expect(staffSystemsFor([{ id: 8, role: 'admin' }], 'admin')).toHaveLength(5);
  });
  it('un cargo sin pantalla no ve ninguna', () => {
    expect(staffSystemsFor(ops, 'ninguno')).toEqual([]);
  });
  it('sin cargo (uso interno) se mantiene lo de siempre', () => {
    expect(staffSystemsFor(ops).map((s) => s.key)).toEqual(['caja', 'guardarropia', 'barra']);
  });
});

describe('cada persona entra directo a su pantalla', () => {
  it('ownArea: la única pantalla de cada rol; Supervisor y Admin no tienen una sola', () => {
    expect(ownArea('barra')).toMatchObject({ key: 'barra', path: '/barra' });
    expect(ownArea('caja')).toMatchObject({ key: 'caja', path: '/caja' });
    expect(ownArea('acceso')).toMatchObject({ key: 'puerta', path: '/puerta' });
    expect(ownArea('cocina')).toMatchObject({ key: 'cocina', path: '/cocina' });
    expect(ownArea('guardarropia')).toMatchObject({ key: 'guardarropia', path: '/guardarropia' });
    expect(ownArea('supervisor')).toBeNull();
    expect(ownArea('admin')).toBeNull();
    expect(ownArea(null)).toBeNull();
  });
  it('canEnterArea: nadie entra a la pantalla de otra área, salvo Supervisor y Admin', () => {
    expect(canEnterArea('barra', 'barra')).toBe(true);
    expect(canEnterArea('barra', 'caja')).toBe(false);
    expect(canEnterArea('barra', 'guardarropia')).toBe(false);
    expect(canEnterArea('caja', 'puerta')).toBe(false);
    expect(canEnterArea('guardarropia', 'cocina')).toBe(false);
    for (const key of ['caja', 'puerta', 'cocina', 'guardarropia', 'barra'] as const) {
      expect(canEnterArea('supervisor', key)).toBe(true);
      expect(canEnterArea('admin', key)).toBe(true);
    }
    expect(canEnterArea(undefined, 'caja')).toBe(false);
  });
});
