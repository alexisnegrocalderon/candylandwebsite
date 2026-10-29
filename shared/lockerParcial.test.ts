import { describe, expect, it } from 'vitest';
import { LOCKER_TONE, canTransitionLockerItem, mergePartialNote } from './locker';
import { lockerSchemaSteps } from '../server/lockerSchema';

describe('retiro parcial de la guardarropía', () => {
  it('guardado → parcial → retirado, y vuelve a guardado; parcial se puede repetir', () => {
    expect(canTransitionLockerItem('guardado', 'parcial')).toBe(true);
    expect(canTransitionLockerItem('parcial', 'parcial')).toBe(true);
    expect(canTransitionLockerItem('parcial', 'retirado')).toBe(true);
    expect(canTransitionLockerItem('parcial', 'guardado')).toBe(true);
    expect(canTransitionLockerItem('guardado', 'retirado')).toBe(true);
  });
  it('lo que no corresponde se rechaza', () => {
    expect(canTransitionLockerItem('pendiente', 'parcial')).toBe(false);
    expect(canTransitionLockerItem('retirado', 'parcial')).toBe(false);
    expect(canTransitionLockerItem('parcial', 'pendiente')).toBe(false);
    expect(canTransitionLockerItem('retirado', 'guardado')).toBe(true);
  });
  it('los colores: rojo guardado, amarillo parcial, verde retirado', () => {
    expect(LOCKER_TONE.guardado.dot).toContain('red');
    expect(LOCKER_TONE.parcial.dot).toContain('amber');
    expect(LOCKER_TONE.retirado.dot).toContain('emerald');
  });
});

describe('mergePartialNote', () => {
  it('suma lo que sacan, sin repetir (sin importar mayúsculas)', () => {
    expect(mergePartialNote(null, 'Chaqueta')).toBe('Chaqueta');
    expect(mergePartialNote('Chaqueta', 'bolso')).toBe('Chaqueta; bolso');
    expect(mergePartialNote('Chaqueta; Bolso', 'chaqueta')).toBe('Chaqueta; Bolso');
    expect(mergePartialNote(null, 'Chaqueta; Mochila')).toBe('Chaqueta; Mochila');
  });
  it('sin nada anotado devuelve null y nunca pasa de 255', () => {
    expect(mergePartialNote(null, '   ')).toBeNull();
    expect(mergePartialNote(null, null)).toBeNull();
    const long = Array.from({ length: 40 }, (_, i) => `cosa número ${i}`).join('; ');
    expect(mergePartialNote(long, 'otra')!.length).toBeLessThanOrEqual(255);
  });
});

describe('lockerSchemaSteps', () => {
  it('agrega lo que falta, en orden, y nada si ya está', () => {
    const old = lockerSchemaSteps({ hasPartialNote: false, statusType: "enum('pendiente','guardado','retirado','anulado')" });
    expect(old.map((s) => s.label)).toEqual(['estado «parcial» de las prendas', 'lockerItems.partialNote']);
    expect(old[0].statement).toContain("'parcial'");
    expect(lockerSchemaSteps({ hasPartialNote: true, statusType: "enum('pendiente','guardado','parcial','retirado','anulado')" })).toEqual([]);
    expect(lockerSchemaSteps({ hasPartialNote: false, statusType: "ENUM('pendiente','guardado','parcial','retirado','anulado')" }).map((s) => s.label)).toEqual(['lockerItems.partialNote']);
  });
});
