import { describe, expect, it } from 'vitest';
import { areaLabel, buildStaffCallPush, cleanCallNote, STAFF_CALL_NOTE_MAX } from './staffCall';

describe('llamar a los organizadores', () => {
  it('dice desde qué área, quién y por qué', () => {
    const p = buildStaffCallPush({ area: 'caja', reason: 'falta', note: 'Sin cambio de $1.000', operatorName: 'Ana' });
    expect(p.title).toBe('📦 Caja: te necesitan');
    expect(p.body).toBe('Ana — Falta algo (producto, cambio, insumo) · Sin cambio de $1.000');
    expect(p.url).toBe('/admin');
  });
  it('una emergencia se nota en el título', () => {
    expect(buildStaffCallPush({ area: 'guardarropia', reason: 'emergencia', operatorName: 'Beto' }).title).toBe('🚨 Guardarropía: EMERGENCIA');
  });
  it('un motivo raro cae al primero y un área desconocida a «La fiesta»', () => {
    expect(buildStaffCallPush({ area: null, reason: 'x', operatorName: 'C' }).title).toBe('🙋 La fiesta: te necesitan');
    expect(areaLabel('barra')).toBe('Conteo de barra');
  });
  it('la nota se limpia y se corta', () => {
    expect(cleanCallNote('  hola   mundo ')).toBe('hola mundo');
    expect(cleanCallNote('x'.repeat(300))).toHaveLength(STAFF_CALL_NOTE_MAX);
    expect(cleanCallNote(null)).toBe('');
  });
});
