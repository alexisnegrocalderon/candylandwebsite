import { describe, expect, it } from 'vitest';
import { buildDoorAlertPush, cleanAlertNote, doorAlertReason, DOOR_ALERT_NOTE_MAX } from './doorAlert';

describe('aviso de la puerta', () => {
  it('arma la notificación con motivo, quién avisa y a quién se refiere', () => {
    const p = buildDoorAlertPush({ reason: 'conflictivo', operatorName: 'Eduardo', buyerName: 'Ana Pérez', note: '  no se   va ' });
    expect(p.title).toBe('⚠️ Puerta: Cliente conflictivo');
    expect(p.body).toBe('Eduardo avisa desde la puerta · Cliente: Ana Pérez — no se va');
  });
  it('sin cliente usa el código, y sin nada solo quién avisa', () => {
    expect(buildDoorAlertPush({ reason: 'entrada', operatorName: 'E', ticketCode: 'MP-1' }).body).toBe('E avisa desde la puerta · Código: MP-1');
    expect(buildDoorAlertPush({ reason: 'emergencia', operatorName: 'E' }).body).toBe('E avisa desde la puerta');
  });
  it('un motivo desconocido cae en «Otro» y la nota se recorta', () => {
    expect(doorAlertReason('xyz').key).toBe('otro');
    expect(cleanAlertNote('a'.repeat(500))).toHaveLength(DOOR_ALERT_NOTE_MAX);
    expect(cleanAlertNote(null)).toBe('');
  });
});
