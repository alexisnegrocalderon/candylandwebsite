import { describe, expect, it } from 'vitest';
import { buildDjContract, djContractPlainText, djPayment, validateSignature, type DjContractTerms } from './djContract';
import { isValidRut } from './rut';

const terms: DjContractTerms = {
  artistName: 'FaeDior', eventName: 'PLAYMORE · Playroom × Dalmore', eventDateText: 'viernes 4 de diciembre de 2026',
  setDateText: 'madrugada del sábado 5 de diciembre de 2026', setStart: '02:00', setEnd: '04:00', callTime: '00:30', soundcheckTime: '01:00',
  venueText: 'Providencia, Santiago (formato open air)', amountClp: 400_000, amountMode: 'liquido', year: 2026,
  proportionalDiscount: true, cancellation: { enabled: false, noticeDays: 15, penaltyPercent: 50 },
};

describe('contrato DJ', () => {
  it('lleva el set de 2 a 4 AM, el 100 % el mismo día y la boleta de honorarios', () => {
    const text = djContractPlainText(buildDjContract(terms));
    expect(text).toContain('de 02:00 a 04:00 hrs');
    expect(text).toContain('madrugada del sábado 5 de diciembre de 2026');
    expect(text).toContain('El 100 % se paga el mismo día del evento, al terminar el set');
    expect(text).toContain('No hay pago anticipado');
    expect(text).toContain('boleta de honorarios');
    expect(text).toContain('Alexis Calderón');
    expect(text).toContain('Gino Pérez');
  });

  it('calcula la boleta con la retención del año (líquido → bruto)', () => {
    const p = djPayment(terms);
    expect(p.net).toBe(400_000);
    expect(p.gross).toBe(Math.round(400_000 / (1 - 0.1525)));
    expect(buildDjContract(terms).summary.find((s) => s.label === 'Pago')!.value).toContain('líquidos');
  });

  it('modo bruto: el monto es el de la boleta', () => {
    const p = djPayment({ ...terms, amountMode: 'bruto' });
    expect(p.gross).toBe(400_000);
    expect(p.net).toBe(400_000 - Math.round(400_000 * 0.1525));
  });

  it('la cancelación solo aparece si se prende, y las secciones quedan bien numeradas', () => {
    const off = buildDjContract(terms).sections.map((s) => s.heading);
    expect(off.some((h) => h.includes('Cancelación'))).toBe(false);
    expect(off[off.length - 1]).toMatch(/^6\./);
    const on = buildDjContract({ ...terms, cancellation: { enabled: true, noticeDays: 15, penaltyPercent: 50 } }).sections.map((s) => s.heading);
    expect(on.some((h) => h.includes('Cancelación'))).toBe(true);
    expect(on[on.length - 1]).toMatch(/^7\./);
  });

  it('con los datos de quien firma, el texto los lleva; sin ellos, queda la leyenda', () => {
    expect(djContractPlainText(buildDjContract(terms, { legalName: 'Ana Pérez Soto', rut: '12.345.678-5' }))).toContain('Ana Pérez Soto, RUT 12.345.678-5');
    expect(djContractPlainText(buildDjContract(terms))).toContain('quedan registrados al firmar');
  });

  it('el mismo contrato siempre da el mismo texto (se puede hashear)', () => {
    expect(djContractPlainText(buildDjContract(terms))).toBe(djContractPlainText(buildDjContract(terms)));
  });
});

describe('validación de la firma', () => {
  const sig = `data:image/png;base64,${'A'.repeat(400)}`;
  const ok = { legalName: 'Ana Pérez', rut: '12.345.678-5', bank: 'Banco Estado, cuenta RUT 12345678', accept: true, signature: sig };
  it('acepta datos completos', () => expect(validateSignature(ok, isValidRut)).toBeNull());
  it('pide nombre y apellido', () => expect(validateSignature({ ...ok, legalName: 'Ana' }, isValidRut)).toMatch(/nombre completo/));
  it('rechaza RUT inválido', () => expect(validateSignature({ ...ok, rut: '12.345.678-9' }, isValidRut)).toMatch(/RUT/));
  it('exige datos bancarios', () => expect(validateSignature({ ...ok, bank: '' }, isValidRut)).toMatch(/bancarios/));
  it('exige aceptar', () => expect(validateSignature({ ...ok, accept: false }, isValidRut)).toMatch(/aceptas/));
  it('exige una firma dibujada', () => expect(validateSignature({ ...ok, signature: '' }, isValidRut)).toMatch(/firma/));
});
