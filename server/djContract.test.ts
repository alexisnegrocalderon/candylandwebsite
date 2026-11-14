import { beforeEach, describe, expect, it, vi } from 'vitest';

const requestCrossCheck = vi.fn();
vi.mock('./db', () => ({ getDb: vi.fn(async () => null) }));
vi.mock('./crossCheck', async () => {
  class CrossCheckRetry extends Error {}
  return { CrossCheckRetry, requestCrossCheck: (...a: unknown[]) => requestCrossCheck(...a), endOfChileDay: () => new Date('2026-12-01T02:59:59Z') };
});

import { buildDjEmail, contractIdFromToken, contractToken, contractUrl, setEndAt } from './djContract';
import { buildDjContractPdf } from './djContractPdf';
import { buildDjContract, type DjContractTerms } from '../shared/djContract';

const terms: DjContractTerms = {
  artistName: 'FaeDior', eventName: 'PLAYMORE · Playroom × Dalmore', eventDateText: 'viernes 4 de diciembre de 2026',
  setDateText: 'madrugada del sábado 5 de diciembre de 2026', setStart: '02:00', setEnd: '04:00', callTime: '00:30', soundcheckTime: '01:00',
  venueText: 'Providencia, Santiago (formato open air)', amountClp: 400_000, amountMode: 'liquido', year: 2026,
  proportionalDiscount: true, cancellation: { enabled: false, noticeDays: 15, penaltyPercent: 50 },
};
beforeEach(() => vi.clearAllMocks());

describe('link privado del contrato', () => {
  it('el token vuelve al mismo contrato', () => {
    expect(contractIdFromToken(contractToken(42))).toBe(42);
    expect(contractUrl(42)).toContain('/contrato/42.');
  });
  it('no se puede cambiar el número ni inventar la firma', () => {
    const [, sig] = contractToken(42).split('.');
    expect(contractIdFromToken(`43.${sig}`)).toBeNull();
    expect(contractIdFromToken('42.abc')).toBeNull();
    expect(contractIdFromToken('42')).toBeNull();
    expect(contractIdFromToken('')).toBeNull();
    expect(contractIdFromToken('abc.def')).toBeNull();
  });
});

describe('correos del contrato', () => {
  const row = { id: 7, artistName: 'FaeDior', legalName: null as string | null };
  it('el de envío lleva el set, el pago y el link para firmar', () => {
    const { subject, html } = buildDjEmail('send', row, terms);
    expect(subject).toContain('Tu contrato');
    expect(html).toContain('02:00 – 04:00 hrs');
    expect(html).toContain('el mismo día, al terminar el set');
    expect(html).toContain(`href="${contractUrl(7)}"`);
    expect(html).toContain('PLAYROOM × DALMORE');
  });
  it('recordatorio, confirmación y pago tienen su propio asunto', () => {
    expect(buildDjEmail('remind', row, terms).subject).toMatch(/Recordatorio/);
    expect(buildDjEmail('confirm', row, terms).html).toContain('00:30');
    expect(buildDjEmail('pay', row, terms).subject).toMatch(/Pago registrado/);
  });
  it('escapa el nombre de la artista', () => {
    expect(buildDjEmail('send', { ...row, artistName: '<b>x</b>' }, terms).html).not.toContain('<b>x</b>');
  });
});

describe('cuándo termina el set', () => {
  it('2:00–4:00 AM del día siguiente al evento (hora de Chile)', () => {
    const end = setEndAt(new Date('2026-12-05T02:00:00Z'), terms); // viernes 4 dic 23:00 Chile
    expect(end.toISOString()).toBe('2026-12-05T07:00:00.000Z'); // sábado 5 dic 04:00 Chile (UTC-3)
  });
});

describe('PDF', () => {
  it('se arma el PDF sin firmar y firmado', async () => {
    const contract = buildDjContract(terms, { legalName: 'Ana Pérez Soto', rut: '12.345.678-5' });
    const blank = await buildDjContractPdf({ contract: buildDjContract(terms) });
    expect(blank.subarray(0, 5).toString()).toBe('%PDF-');
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
    const signed = await buildDjContractPdf({ contract, signer: { legalName: 'Ana Pérez Soto', rut: '12.345.678-5', signedAtText: '14 nov 2026 17:00', ip: '1.2.3.4', hash: 'abc', signaturePng: png } });
    expect(signed.length).toBeGreaterThan(blank.length / 2);
    expect(signed.subarray(0, 5).toString()).toBe('%PDF-');
  });
  it('con las firmas de los dos productores también se arma', async () => {
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
    const pdf = await buildDjContractPdf({
      contract: buildDjContract(terms),
      producers: [
        { name: 'Alexis Calderón', role: 'Productor de Playroom', signaturePng: png, signedAtText: '14-11-2026 17:00' },
        { name: 'Gino Pérez', role: 'Productor de Dalmore', signaturePng: png, signedAtText: '14-11-2026 17:01' },
      ],
    });
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
  });
});
