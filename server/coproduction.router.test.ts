import { beforeEach, describe, expect, it, vi } from 'vitest';
import { appRouter } from './routers';
import * as coproductionSvc from './coproduction';
import * as db from './db';
import type { TrpcContext } from './_core/context';

vi.mock('./coproduction', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./coproduction')>();
  return {
    ...actual,
    getCoproductionById: vi.fn(),
    getCoproductionBySlug: vi.fn(),
    getCoproductionOverview: vi.fn(),
    isEventHiddenByCoproduction: vi.fn(),
  };
});

vi.mock('./db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./db')>();
  return { ...actual, getEventBySlug: vi.fn(), getEventById: vi.fn(), getAllEvents: vi.fn(), getTicketTypesByEventId: vi.fn(), createOrder: vi.fn() };
});

const req = { protocol: 'https', headers: { 'x-forwarded-for': '1.2.3.4' }, socket: { remoteAddress: '1.2.3.4' } } as unknown as TrpcContext['req'];
const user = (role: string, extra: Record<string, unknown> = {}) => ({ id: -1, openId: 'x', name: 'x', role, ...extra }) as any;
const caller = (u: any) => appRouter.createCaller({ user: u, req, res: {} as TrpcContext['res'] });

const dalmore = { id: 1, slug: 'dalmore', partnerName: 'Dalmore', eventId: 42, isLive: 0, splitPercentPartner: 50, sessionVersion: 1 } as any;
const otra = { id: 2, slug: 'otra', partnerName: 'Otra', eventId: 99, isLive: 0, splitPercentPartner: 50, sessionVersion: 1 } as any;

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(coproductionSvc.getCoproductionById).mockImplementation(async (id) => (id === 1 ? dalmore : id === 2 ? otra : null));
  vi.mocked(coproductionSvc.getCoproductionBySlug).mockImplementation(async (slug) => (slug === 'dalmore' ? dalmore : slug === 'otra' ? otra : null));
  vi.mocked(coproductionSvc.getCoproductionOverview).mockResolvedValue({ event: null } as any);
});

describe('el socio solo ve su co-producción', () => {
  const socio = user('partner', { coproductionId: 1 });

  it('no puede abrir nada del panel de Playroom', async () => {
    await expect(caller(socio).events.listAll()).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(caller(socio).coproduction.list()).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(caller(socio).coproduction.setLive({ slug: 'dalmore', live: true })).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('aunque pida otro slug, recibe la suya', async () => {
    await caller(socio).coproduction.overview({ slug: 'otra' });
    expect(coproductionSvc.getCoproductionOverview).toHaveBeenCalledWith(dalmore);
  });

  it('el dueño sí elige la co-producción', async () => {
    await caller(user('admin')).coproduction.overview({ slug: 'otra' });
    expect(coproductionSvc.getCoproductionOverview).toHaveBeenCalledWith(otra);
  });

  it('el invitado de demostración no entra al panel del socio', async () => {
    await expect(caller(user('viewer')).coproduction.overview()).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('sin sesión, nada', async () => {
    await expect(caller(null).coproduction.overview()).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});

describe('evento de co-producción sin activar', () => {
  const event = { id: 42, slug: 'playmore', title: 'PlayMore' } as any;

  beforeEach(() => {
    vi.mocked(db.getEventBySlug).mockResolvedValue(event);
    vi.mocked(coproductionSvc.isEventHiddenByCoproduction).mockResolvedValue(true);
  });

  it('el público no lo ve por link directo', async () => {
    expect(await caller(null).events.getBySlug({ slug: 'playmore' })).toBeUndefined();
    expect(await caller(null).events.getTicketTypes({ slug: 'playmore' })).toEqual([]);
  });

  it('el dueño sí lo ve', async () => {
    expect(await caller(user('admin')).events.getBySlug({ slug: 'playmore' })).toEqual(event);
  });

  it('no se puede comprar', async () => {
    await expect(caller(null).orders.create({
      eventSlug: 'playmore', buyerName: 'A', buyerEmail: 'a@b.cl', items: [{ ticketTypeId: 1, quantity: 1 }],
    })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    expect(db.createOrder).not.toHaveBeenCalled();
  });
});
