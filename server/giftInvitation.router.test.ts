import { beforeEach, describe, expect, it, vi } from 'vitest';
import { appRouter } from './routers';
import * as db from './db';
import * as giftPacks from './giftPacks';
import type { TrpcContext } from './_core/context';

vi.mock('./db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./db')>();
  return { ...actual, getTicketTypesByEventId: vi.fn(), getEventById: vi.fn(), recordAdminAudit: vi.fn() };
});
vi.mock('./giftPacks', () => ({ listPacks: vi.fn(async () => []), savePack: vi.fn(), deletePack: vi.fn() }));

const req = { protocol: 'https', headers: { 'x-forwarded-for': '1.2.3.4' }, socket: { remoteAddress: '1.2.3.4' } } as unknown as TrpcContext['req'];
const user = (role: string) => ({ id: -1, openId: 'x', name: 'Belén', role }) as any;
const caller = (u: any) => appRouter.createCaller({ user: u, req, res: {} as TrpcContext['res'] });
const sup = user('supervisor');

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(giftPacks.listPacks).mockResolvedValue([]);
  vi.mocked(db.getEventById).mockResolvedValue(null as any); // si pasara la validación, runGift diría «Evento no encontrado»
  vi.mocked(db.getTicketTypesByEventId).mockResolvedValue([
    { id: 1, name: 'General', category: 'acceso' }, { id: 2, name: 'Parking', category: 'extra' }, { id: 3, name: 'Tropical Gin', category: 'consumo' }, { id: 4, name: 'Polera', category: 'merch' },
  ] as any);
});

describe('la supervisora invita, pero solo lo suyo', () => {
  it('no puede invitar tragos ni merch, solo entradas y extras', async () => {
    for (const ticketTypeId of [3, 4, 999]) {
      await expect(caller(sup).orders.giftInvitation({ eventId: 1, emails: ['a@b.cl'], items: [{ ticketTypeId, quantity: 1 }] })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    }
  });

  it('con una entrada o un extra pasa la validación (sigue hasta el envío)', async () => {
    for (const ticketTypeId of [1, 2]) {
      await expect(caller(sup).orders.giftInvitation({ eventId: 1, emails: ['a@b.cl'], items: [{ ticketTypeId, quantity: 1 }] })).rejects.toMatchObject({ message: expect.stringMatching(/Evento no encontrado/) });
    }
  });

  it('máximo 10 correos y 10 por producto', async () => {
    await expect(caller(sup).orders.giftInvitation({ eventId: 1, emails: Array.from({ length: 11 }, (_, i) => `p${i}@b.cl`), items: [{ ticketTypeId: 1, quantity: 1 }] })).rejects.toBeTruthy();
    await expect(caller(sup).orders.giftInvitation({ eventId: 1, emails: ['a@b.cl'], items: [{ ticketTypeId: 1, quantity: 11 }] })).rejects.toBeTruthy();
  });

  it('lo del dueño sigue siendo del dueño: regalar, pases, paquetes y el buscador de clientes', async () => {
    await expect(caller(sup).orders.gift({ eventId: 1, emails: ['a@b.cl'], items: [{ ticketTypeId: 3, quantity: 1 }] })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(caller(sup).orders.giftPacks()).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(caller(sup).orders.saveGiftPack({ name: 'x', data: { vigencia: 'evento', mode: 'directo', anyAccess: false, validDays: null, items: [] } })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(caller(sup).orders.deleteGiftPack({ id: 1 })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(caller(sup).customers.quickSearch({ q: 'ana' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('un visitante sin sesión no puede invitar', async () => {
    await expect(caller(null).orders.giftInvitation({ eventId: 1, emails: ['a@b.cl'], items: [{ ticketTypeId: 1, quantity: 1 }] })).rejects.toBeTruthy();
  });

  it('el dueño sí ve sus paquetes guardados', async () => {
    await expect(caller(user('admin')).orders.giftPacks()).resolves.toEqual([]);
  });
});
