import { describe, expect, it } from 'vitest';
import { planExtrasRefund, type ExtraTicketRow } from './orderRefund';

const gin = (id: number, status = 'valid', unitPrice = 6000): ExtraTicketRow => ({ id, status, displayCode: `TG-${id}`, unitPrice });

describe('planExtrasRefund', () => {
  it('devuelve el valor completo de los extras elegidos por defecto', () => {
    const r = planExtrasRefund({ paid: 57000, alreadyRefunded: 0, tickets: [gin(1), gin(2)], selectedIds: [1, 2] });
    expect(r).toMatchObject({ ok: true, amount: 12000, computed: 12000, newRefundTotal: 12000, ticketIds: [1, 2] });
    if (r.ok) expect(r.percent).toBeCloseTo(21.05, 2);
  });

  it('el monto se puede corregir a mano', () => {
    const r = planExtrasRefund({ paid: 57000, alreadyRefunded: 0, tickets: [gin(1), gin(2)], selectedIds: [1, 2], amount: 10000 });
    expect(r).toMatchObject({ ok: true, amount: 10000, computed: 12000 });
  });

  it('solo los elegidos: devolver uno de dos', () => {
    const r = planExtrasRefund({ paid: 57000, alreadyRefunded: 0, tickets: [gin(1), gin(2)], selectedIds: [2] });
    expect(r).toMatchObject({ ok: true, amount: 6000, ticketIds: [2] });
  });

  it('no deja devolver un extra ya canjeado ni uno ya anulado', () => {
    expect(planExtrasRefund({ paid: 57000, alreadyRefunded: 0, tickets: [gin(1, 'used')], selectedIds: [1] })).toMatchObject({ ok: false, error: expect.stringContaining('ya se canjeó') });
    expect(planExtrasRefund({ paid: 57000, alreadyRefunded: 0, tickets: [gin(1, 'cancelled')], selectedIds: [1] })).toMatchObject({ ok: false, error: expect.stringContaining('anulado') });
  });

  it('rechaza un ticket que no es un extra de la compra (sin código legible o ajeno)', () => {
    expect(planExtrasRefund({ paid: 57000, alreadyRefunded: 0, tickets: [{ id: 1, status: 'valid', displayCode: null, unitPrice: 45000 }], selectedIds: [1] })).toMatchObject({ ok: false });
    expect(planExtrasRefund({ paid: 57000, alreadyRefunded: 0, tickets: [gin(1)], selectedIds: [99] })).toMatchObject({ ok: false });
  });

  it('exige elegir algo y un monto positivo', () => {
    expect(planExtrasRefund({ paid: 57000, alreadyRefunded: 0, tickets: [gin(1)], selectedIds: [] })).toMatchObject({ ok: false });
    expect(planExtrasRefund({ paid: 57000, alreadyRefunded: 0, tickets: [gin(1)], selectedIds: [1], amount: 0 })).toMatchObject({ ok: false });
  });

  it('no devuelve más de lo que queda por devolver (suma lo ya devuelto)', () => {
    expect(planExtrasRefund({ paid: 12000, alreadyRefunded: 8000, tickets: [gin(1), gin(2)], selectedIds: [1, 2] })).toMatchObject({ ok: false });
    const ok = planExtrasRefund({ paid: 12000, alreadyRefunded: 6000, tickets: [gin(2)], selectedIds: [2] });
    expect(ok).toMatchObject({ ok: true, newRefundTotal: 12000, percent: 100 });
  });

  it('un mismo ticket repetido cuenta una sola vez', () => {
    expect(planExtrasRefund({ paid: 57000, alreadyRefunded: 0, tickets: [gin(1)], selectedIds: [1, 1] })).toMatchObject({ ok: true, amount: 6000, ticketIds: [1] });
  });
});
