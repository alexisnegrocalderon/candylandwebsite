import { describe, expect, it } from 'vitest';
import { initialVetoStatus, isVetoReason, parseVetoNotes, vetoNotes, vetoPeople, vetoReasonText } from './veto';

describe('motivo del veto', () => {
  it('los motivos fijos van tal cual y «Otro» exige detalle', () => {
    expect(vetoReasonText('agresion', null)).toBe('Agresión o acoso');
    expect(vetoReasonText('drogas', ' muy  mal ')).toBe('Drogas o intoxicación extrema · muy mal');
    expect(vetoReasonText('otro', '')).toBeNull();
    expect(vetoReasonText('otro', 'ab')).toBeNull();
    expect(vetoReasonText('otro', 'Tomó fotos a otros')).toBe('Otro: Tomó fotos a otros');
    expect(isVetoReason('normas')).toBe(true);
    expect(isVetoReason('x')).toBe(false);
  });
});

describe('datos del veto en la nota', () => {
  const meta = { status: 'pendiente' as const, byKind: 'puerta' as const, by: 'Guardia 1', ticketCode: 'MP-ABC', eventId: 7, at: '2026-10-30T02:00:00.000Z', reasonKey: 'agresion' as const, tickets: ['MP-ABC', 'MP-DEF'], profiles: [4] };
  it('ida y vuelta; una nota de siempre no es un veto', () => {
    expect(parseVetoNotes(vetoNotes(meta))).toEqual({ veto: 1, ...meta });
    expect(parseVetoNotes('Pasado por otra productora')).toBeNull();
    expect(parseVetoNotes(null)).toBeNull();
    expect(parseVetoNotes('{"veto":1}')).toBeNull();
  });
  it('el del guardia queda pendiente y el del dueño, confirmado', () => {
    expect(initialVetoStatus('puerta')).toBe('pendiente');
    expect(initialVetoStatus('admin')).toBe('confirmado');
  });
});

describe('vetoPeople', () => {
  it('titular y acompañantes, sin repetir ni filas vacías', () => {
    const r = vetoPeople([
      { name: 'Ana Pérez', rut: '12.345.678-5', email: 'ana@t.cl' },
      { name: 'ana perez', rut: '12345678-5' },
      { name: 'Javier Soto', rut: '16.789.012-3' },
      { name: '  ', rut: null },
      { name: 'Sin Rut' },
    ]);
    expect(r.map((p) => p.name)).toEqual(['Ana Pérez', 'Javier Soto', 'Sin Rut']);
  });
});
