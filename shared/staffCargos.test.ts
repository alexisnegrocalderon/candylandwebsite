import { describe, expect, it } from 'vitest';
import { OPERATOR_ROLES, STAFF_SYSTEMS } from './cajaRoles';
import { STAFF_CARGOS, STAFF_CARGO_KEYS, cargoFromRole, cargoTitle, operatorRoleForCargo, pinProblem } from './staffCargos';
import { staffToolsForRole } from './staffPortal';

describe('cargos del staff', () => {
  it('cada cargo de la lista está en la columna y al revés', () => {
    expect(STAFF_CARGOS.map((c) => c.key)).toEqual([...STAFF_CARGO_KEYS]);
  });

  it('los cargos con pantalla entran a la pantalla que les toca', () => {
    for (const c of STAFF_CARGOS) {
      if (!c.operatorRole) continue;
      expect(OPERATOR_ROLES).toContain(c.operatorRole);
      // Hay al menos un sistema (caja, puerta…) que acepta ese rol.
      expect(STAFF_SYSTEMS.some((s) => (s.roles as readonly string[]).includes(c.operatorRole!))).toBe(true);
    }
    expect(operatorRoleForCargo('puerta')).toBe('acceso');
    expect(operatorRoleForCargo('supervisor')).toBe('supervisor');
    expect(operatorRoleForCargo('dj')).toBeNull();
    expect(operatorRoleForCargo('cualquiera')).toBeNull();
  });

  it('las herramientas por cargo calzan con las de antes', () => {
    expect(staffToolsForRole('puerta').map((t) => t.key)).toEqual(['puerta']);
    expect(staffToolsForRole('barra').map((t) => t.key)).toEqual(['caja']);
    expect(staffToolsForRole('guardarropia').map((t) => t.key)).toEqual(['guardarropia']);
    expect(staffToolsForRole('supervisor')).toHaveLength(4);
  });

  it('pasa el rol escrito a mano al cargo', () => {
    expect(cargoFromRole('Bartender')).toBe('barra');
    expect(cargoFromRole('Cajera')).toBe('caja');
    expect(cargoFromRole('Seguridad')).toBe('puerta');
    expect(cargoFromRole('Encargada')).toBe('supervisor');
    expect(cargoFromRole('DJ residente')).toBe('dj');
    expect(cargoFromRole('RRPP')).toBe('rrpp');
    expect(cargoFromRole('Fotógrafo')).toBe('produccion');
    expect(cargoFromRole('Maquillaje')).toBe('otro');
    expect(cargoFromRole('  ')).toBeNull();
  });

  it('muestra lo escrito o el nombre del cargo', () => {
    expect(cargoTitle('puerta', null)).toBe('Puerta / Seguridad');
    expect(cargoTitle('otro', 'Maquillaje')).toBe('Maquillaje');
    expect(cargoTitle(null, null)).toBe('Equipo');
  });

  it('no deja PIN obvios', () => {
    expect(pinProblem('4821')).toBeNull();
    expect(pinProblem('905173')).toBeNull();
    expect(pinProblem('123')).not.toBeNull();
    expect(pinProblem('1234567')).not.toBeNull();
    expect(pinProblem('12a4')).not.toBeNull();
    expect(pinProblem('0000')).not.toBeNull();
    expect(pinProblem('1234')).not.toBeNull();
    expect(pinProblem('9876')).not.toBeNull();
    expect(pinProblem('8901')).not.toBeNull();
  });
});
