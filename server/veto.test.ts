import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ queue: [] as any[], updates: [] as any[], blocked: [] as any[], banned: [] as number[], pushes: [] as any[], audits: [] as any[], alreadyBlocked: false }));

vi.mock('./db', () => {
  const chain = (): any => {
    const c: any = new Proxy(() => {}, {
      get: (_t, prop) => (prop === 'then' ? (res: (v: any) => void) => res(state.queue.shift() ?? []) : () => c),
      apply: () => c,
    });
    return c;
  };
  return {
    getDb: async () => ({ select: () => chain(), update: () => ({ set: (v: any) => ({ where: async () => { state.updates.push(v); return [{ affectedRows: 1 }]; } }) }) }),
    orderIdentities: (_data: any, buyer: any) => [{ name: buyer.name, email: buyer.email, phone: buyer.phone, rut: '12.345.678-5' }, { name: 'Javier Soto', rut: '16.789.012-3' }],
    findBlockedMatch: async () => ({ block: state.alreadyBlocked ? [{}] : [], review: [] }),
    createBlockedCustomer: async (d: any) => { state.blocked.push(d); },
    recordAdminAudit: async (e: any) => { state.audits.push(e); },
    setPartyProfileBanned: async (id: number) => { state.banned.push(id); },
    invalidateBlockedCache: () => {},
  };
});
vi.mock('./push', () => ({ sendPushToAdminsAlways: async (p: any) => { state.pushes.push(p); } }));

import { vetoTicket } from './veto';
import { parseVetoNotes } from '../shared/veto';

beforeEach(() => { state.queue = []; state.updates = []; state.blocked = []; state.banned = []; state.pushes = []; state.audits = []; state.alreadyBlocked = false; });

function seed() {
  state.queue.push(
    [{ id: 10, ticketCode: 'MP-ABC', orderId: 5, eventId: 7, status: 'used' }], // ticket
    [{ id: 5, buyerName: 'Ana Pérez', buyerEmail: 'ana@t.cl', buyerPhone: '+56911111111', attendeeData: '{}' }], // order
    [{ id: 6 }], // próximas compras del mismo correo
    [{ id: 10, ticketCode: 'MP-ABC', status: 'used' }, { id: 11, ticketCode: 'MP-DEF', status: 'valid' }, { id: 12, ticketCode: 'MP-GHI', status: 'valid' }], // sus entradas
    [{ id: 90 }], // su perfil de Playmatch
  );
}

describe('vetoTicket', () => {
  it('veta al titular y a los acompañantes, anula las entradas válidas y saca de Playmatch', async () => {
    seed();
    const r = await vetoTicket({ ticketCode: 'MP-ABC', reasonKey: 'agresion', by: { kind: 'puerta', name: 'Guardia 1' } });
    expect(r).toMatchObject({ people: ['Ana Pérez', 'Javier Soto'], ticketsCancelled: 2, profilesBanned: 1, status: 'pendiente' });
    expect(state.blocked).toHaveLength(2);
    expect(state.blocked[0]).toMatchObject({ fullName: 'Ana Pérez', email: 'ana@t.cl', phone: '+56911111111', reason: 'Agresión o acoso', sourceBy: 'Puerta: Guardia 1' });
    expect(parseVetoNotes(state.blocked[0].notes)).toMatchObject({ status: 'pendiente', ticketCode: 'MP-ABC', tickets: ['MP-DEF', 'MP-GHI'], profiles: [90] });
    expect(state.updates[0]).toEqual({ status: 'cancelled' });
    expect(state.banned).toEqual([90]);
    expect(state.pushes[0].title).toContain('Vetado en la puerta: Ana Pérez +1');
    expect(state.pushes[0].body).toContain('Confírmalo');
    expect(state.audits[0]).toMatchObject({ action: 'veto.create' });
  });

  it('el veto del dueño queda confirmado y sin pedir confirmación', async () => {
    seed();
    const r = await vetoTicket({ ticketCode: 'MP-ABC', reasonKey: 'drogas', note: 'muy mal', by: { kind: 'admin', name: 'Dueño' } });
    expect(r.status).toBe('confirmado');
    expect(state.blocked[0].reason).toBe('Drogas o intoxicación extrema · muy mal');
    expect(state.pushes[0].body).not.toContain('Confírmalo');
  });

  it('no duplica a quien ya estaba bloqueado', async () => {
    seed();
    state.alreadyBlocked = true;
    const r = await vetoTicket({ ticketCode: 'MP-ABC', reasonKey: 'normas', by: { kind: 'puerta', name: 'Guardia 1' } });
    expect(r.alreadyBlocked).toBe(2);
    expect(state.blocked).toHaveLength(0);
    expect(r.ticketsCancelled).toBe(2);
  });

  it('«Otro» sin detalle no veta a nadie', async () => {
    seed();
    await expect(vetoTicket({ ticketCode: 'MP-ABC', reasonKey: 'otro', note: ' ', by: { kind: 'puerta', name: 'G' } })).rejects.toThrow(/motivo/);
    expect(state.blocked).toHaveLength(0);
    expect(state.updates).toHaveLength(0);
  });

  it('una entrada que no existe no hace nada', async () => {
    state.queue.push([]);
    await expect(vetoTicket({ ticketCode: 'MP-NO', reasonKey: 'agresion', by: { kind: 'puerta', name: 'G' } })).rejects.toThrow(/No encontré/);
    expect(state.blocked).toHaveLength(0);
  });
});
