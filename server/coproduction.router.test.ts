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
    getCoproductionMovements: vi.fn(),
    listCoproductionContacts: vi.fn(),
    isEventHiddenByCoproduction: vi.fn(),
    isEventColab: vi.fn(),
    getCoproductionByEventId: vi.fn(),
    getEventColabBrand: vi.fn(),
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

  it('los movimientos son solo los suyos, aunque pida otro slug', async () => {
    vi.mocked(coproductionSvc.getCoproductionMovements).mockResolvedValue([]);
    await caller(socio).coproduction.movements({ slug: 'otra' });
    expect(coproductionSvc.getCoproductionMovements).toHaveBeenCalledWith(dalmore);
    await expect(caller(user('viewer')).coproduction.movements()).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('los contactos son solo los suyos, aunque pida otro slug', async () => {
    vi.mocked(coproductionSvc.listCoproductionContacts).mockResolvedValue([]);
    await caller(socio).coproduction.contacts({ slug: 'otra' });
    expect(coproductionSvc.listCoproductionContacts).toHaveBeenCalledWith(dalmore);
    await expect(caller(user('viewer')).coproduction.contacts()).rejects.toMatchObject({ code: 'FORBIDDEN' });
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

describe('landing pública antes de lanzar', () => {
  const evento = { id: 42, slug: 'playmore', title: 'PLAYMORE', eventDate: new Date('2026-12-05T01:00:00Z'), imageUrl: null, presaleParkingOnly: 0 } as any;
  const tipos = [
    { id: 1, name: 'Dúo', price: '36000', status: 'active', category: 'acceso', accesoSlug: 'duo', totalStock: 100, soldCount: 10, stockPoolId: null, originalPrice: null, salesEnd: null },
    { id: 2, name: 'Oculto', price: '1000', status: 'hidden', category: 'acceso', accesoSlug: null, totalStock: 10, soldCount: 0, stockPoolId: null, originalPrice: null, salesEnd: null },
    { id: 3, name: 'Estacionamiento', price: '5000', status: 'active', category: 'extra', accesoSlug: null, totalStock: 50, soldCount: 0, stockPoolId: null, originalPrice: null, salesEnd: null },
    // La carta de la fiesta es de la caja: jamás debe salir en la web.
    { id: 4, name: 'Mojito', price: '7000', status: 'active', category: 'consumo', accesoSlug: null, totalStock: 999999, soldCount: 0, stockPoolId: null, originalPrice: null, salesEnd: null },
    { id: 5, name: 'Vaso PlayRoom', price: '1000', status: 'active', category: 'merch', accesoSlug: null, totalStock: 100, soldCount: 0, stockPoolId: null, originalPrice: null, salesEnd: null },
    { id: 6, name: 'Guardarropia', price: '2000', status: 'active', category: 'locker', accesoSlug: null, totalStock: 100, soldCount: 0, stockPoolId: null, originalPrice: null, salesEnd: null },
  ] as any;
  const conLanding = (landing: any) => ({ ...dalmore, landing, previewToken: 'tok-secreto-123' });

  beforeEach(() => {
    vi.mocked(db.getEventById).mockResolvedValue(evento);
    vi.mocked(db.getTicketTypesByEventId).mockResolvedValue(tipos);
  });

  it('con la opción apagada el público ve solo el teaser: sin evento ni accesos', async () => {
    vi.mocked(coproductionSvc.getCoproductionBySlug).mockResolvedValue(conLanding({ showTicketsEarly: false }));
    const r: any = await caller(null).coproduction.publicGet({ slug: 'dalmore' });
    expect(r.early).toBe(false);
    expect(r.event).toBeNull();
    expect(r.ticketTypes).toEqual([]);
  });

  it('por defecto (o encendida) el público ve los accesos, sin compra y sin cupos exactos', async () => {
    vi.mocked(coproductionSvc.getCoproductionBySlug).mockResolvedValue(conLanding({}));
    const r: any = await caller(null).coproduction.publicGet({ slug: 'dalmore' });
    expect(r.early).toBe(true);
    expect(r.isLive).toBe(false);
    expect(r.preview).toBe(false);
    expect(r.diag).toBeNull();
    // Solo accesos y extras de la web; nunca la carta de la caja (tragos, merch, guardarropía).
    expect(r.ticketTypes.map((t: any) => t.name)).toEqual(['Dúo', 'Estacionamiento']);
    expect(JSON.stringify(r.ticketTypes)).not.toMatch(/Mojito|Vaso|Guardarropia/);
    expect(JSON.stringify(r.ticketTypes)).not.toMatch(/totalStock|soldCount|remaining/);
  });

  it('con el link de vista previa el dueño ve los accesos y un diagnóstico', async () => {
    vi.mocked(coproductionSvc.getCoproductionBySlug).mockResolvedValue(conLanding({ showTicketsEarly: false }));
    const r: any = await caller(null).coproduction.publicGet({ slug: 'dalmore', preview: 'tok-secreto-123' });
    expect(r.preview).toBe(true);
    expect(r.early).toBe(false);
    expect(r.ticketTypes).toHaveLength(2);
    expect(r.diag).toEqual({ eventLinked: true, accesos: 2, hidden: 1, blockedByPresale: 0 });
  });

  it('un token equivocado no abre nada (con la opción apagada)', async () => {
    vi.mocked(coproductionSvc.getCoproductionBySlug).mockResolvedValue(conLanding({ showTicketsEarly: false }));
    const r: any = await caller(null).coproduction.publicGet({ slug: 'dalmore', preview: 'otro-token' });
    expect(r.preview).toBe(false);
    expect(r.ticketTypes).toEqual([]);
  });

  it('el diagnóstico avisa si no hay evento enlazado', async () => {
    vi.mocked(coproductionSvc.getCoproductionBySlug).mockResolvedValue({ ...conLanding({}), eventId: null });
    const r: any = await caller(null).coproduction.publicGet({ slug: 'dalmore', preview: 'tok-secreto-123' });
    expect(r.diag).toEqual({ eventLinked: false, accesos: 0, hidden: 0, blockedByPresale: 0 });
  });
});

describe('entradas nominativas: un solo acceso por compra', () => {
  const evento = { id: 42, slug: 'playmore', title: 'PLAYMORE', eventDate: new Date('2026-12-05T01:00:00Z'), presaleParkingOnly: 0 } as any;
  const tipos = [
    { id: 1, name: 'Acceso Soltera', category: 'acceso' },
    { id: 2, name: 'Acceso Pareja', category: 'acceso' },
    { id: 3, name: 'Estacionamiento', category: 'extra' },
  ] as any;
  const base = { eventSlug: 'playmore', buyerName: 'A', buyerEmail: 'a@b.cl' };

  beforeEach(() => {
    vi.mocked(db.getEventBySlug).mockResolvedValue(evento);
    vi.mocked(db.getTicketTypesByEventId).mockResolvedValue(tipos);
    vi.mocked(coproductionSvc.isEventHiddenByCoproduction).mockResolvedValue(false);
    vi.mocked(coproductionSvc.isEventColab).mockResolvedValue(true);
    vi.mocked(db.createOrder).mockResolvedValue({ orderNumber: 'X1', total: 10000 } as any);
  });

  it('rechaza 2 entradas del mismo acceso', async () => {
    await expect(caller(null).orders.create({ ...base, items: [{ ticketTypeId: 1, quantity: 2 }] })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    expect(db.createOrder).not.toHaveBeenCalled();
  });

  it('rechaza dos accesos distintos en la misma compra', async () => {
    await expect(caller(null).orders.create({ ...base, items: [{ ticketTypeId: 1, quantity: 1 }, { ticketTypeId: 2, quantity: 1 }] })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    expect(db.createOrder).not.toHaveBeenCalled();
  });

  it('un acceso con su estacionamiento sí pasa (el extra no cuenta)', async () => {
    await caller(null).orders.create({ ...base, items: [{ ticketTypeId: 1, quantity: 1 }, { ticketTypeId: 3, quantity: 1 }] }).catch(() => undefined);
    expect(db.createOrder).toHaveBeenCalledTimes(1);
  });

  it('un evento que no es de colab no tiene este límite', async () => {
    vi.mocked(coproductionSvc.isEventColab).mockResolvedValue(false);
    await caller(null).orders.create({ ...base, items: [{ ticketTypeId: 1, quantity: 3 }] }).catch(() => undefined);
    expect(db.createOrder).toHaveBeenCalledTimes(1);
  });
});

describe('checkout en vista previa de un evento de colab sin activar', () => {
  const evento = { id: 42, slug: 'playmore', title: 'PlayMore', eventDate: new Date('2026-12-05T01:00:00Z'), imageUrl: '', address: 'Calle Secreta 123', mapsUrl: 'https://maps/x', presaleParkingOnly: 0 } as any;
  const tipos = [
    { id: 1, name: 'Acceso Pareja', category: 'acceso', status: 'active', price: '35000' },
    { id: 2, name: 'Estacionamiento', category: 'extra', status: 'active', price: '5000' },
    { id: 3, name: 'Mojito', category: 'consumo', status: 'active', price: '7000' },
    { id: 4, name: 'Oculto', category: 'acceso', status: 'hidden', price: '1' },
  ] as any;
  const colab = (landing: any) => ({ ...dalmore, landing, previewToken: 'tok-secreto-123' });

  beforeEach(() => {
    vi.mocked(db.getEventBySlug).mockResolvedValue(evento);
    vi.mocked(db.getTicketTypesByEventId).mockResolvedValue(tipos);
    vi.mocked(coproductionSvc.isEventHiddenByCoproduction).mockResolvedValue(true);
    vi.mocked(coproductionSvc.isEventColab).mockResolvedValue(true);
  });

  it('con el link de vista previa el dueño ve una versión segura del evento (sin dirección)', async () => {
    vi.mocked(coproductionSvc.getCoproductionByEventId).mockResolvedValue(colab({ showTicketsEarly: false }));
    const e: any = await caller(null).events.getBySlug({ slug: 'playmore', preview: 'tok-secreto-123' });
    expect(e.previewOnly).toBe('owner');
    expect(e.title).toBe('PlayMore');
    expect(JSON.stringify(e)).not.toMatch(/Calle Secreta|maps/);
  });

  it('sin link y con "mostrar tickets antes de lanzar", cualquiera lo recorre pero en modo "early"', async () => {
    vi.mocked(coproductionSvc.getCoproductionByEventId).mockResolvedValue(colab({}));
    const e: any = await caller(null).events.getBySlug({ slug: 'playmore' });
    expect(e.previewOnly).toBe('early');
  });

  it('con la opción apagada y sin link no se ve nada', async () => {
    vi.mocked(coproductionSvc.getCoproductionByEventId).mockResolvedValue(colab({ showTicketsEarly: false }));
    expect(await caller(null).events.getBySlug({ slug: 'playmore' })).toBeUndefined();
    expect(await caller(null).events.getBySlug({ slug: 'playmore', preview: 'otro' })).toBeUndefined();
    expect(await caller(null).events.getTicketTypes({ slug: 'playmore' })).toEqual([]);
  });

  it('en vista previa solo salen accesos y extras de la web (nunca la carta de la caja ni los ocultos)', async () => {
    vi.mocked(coproductionSvc.getCoproductionByEventId).mockResolvedValue(colab({}));
    const t: any[] = await caller(null).events.getTicketTypes({ slug: 'playmore' });
    expect(t.map((x) => x.name)).toEqual(['Acceso Pareja', 'Estacionamiento']);
  });

  it('el administrador tampoco ve la carta de la caja en la compra (solo accesos y extras de la web)', async () => {
    const t: any[] = await caller(user('admin')).events.getTicketTypes({ slug: 'playmore' });
    expect(t.map((x) => x.name)).toEqual(['Acceso Pareja', 'Estacionamiento']);
  });

  it('con el evento ya activo, el público ve solo accesos y extras: jamás la carta de la caja', async () => {
    vi.mocked(coproductionSvc.isEventHiddenByCoproduction).mockResolvedValue(false);
    const t: any[] = await caller(null).events.getTicketTypes({ slug: 'playmore' });
    expect(t.map((x) => x.name)).toEqual(['Acceso Pareja', 'Estacionamiento']);
  });

  it('un evento que no es de colaboración conserva todo su catálogo', async () => {
    vi.mocked(coproductionSvc.isEventHiddenByCoproduction).mockResolvedValue(false);
    vi.mocked(coproductionSvc.isEventColab).mockResolvedValue(false);
    const t: any[] = await caller(null).events.getTicketTypes({ slug: 'playmore' });
    expect(t.map((x) => x.name)).toEqual(['Acceso Pareja', 'Estacionamiento', 'Mojito', 'Oculto']);
  });

  it('aun así no se puede comprar mientras no esté activo', async () => {
    vi.mocked(coproductionSvc.getCoproductionByEventId).mockResolvedValue(colab({}));
    await expect(caller(null).orders.create({ eventSlug: 'playmore', buyerName: 'A', buyerEmail: 'a@b.cl', items: [{ ticketTypeId: 1, quantity: 1 }] })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    expect(db.createOrder).not.toHaveBeenCalled();
  });

  it('la marca para el checkout sale en vista previa y no antes', async () => {
    vi.mocked(coproductionSvc.getEventColabBrand).mockResolvedValue({ slug: 'dalmore', eventName: 'PLAYMORE' } as any);
    vi.mocked(coproductionSvc.getCoproductionByEventId).mockResolvedValue(colab({ showTicketsEarly: false }));
    await caller(null).coproduction.brandForEvent({ eventSlug: 'playmore' });
    expect(coproductionSvc.getEventColabBrand).toHaveBeenLastCalledWith(42, { allowNotLive: false });
    await caller(null).coproduction.brandForEvent({ eventSlug: 'playmore', preview: 'tok-secreto-123' });
    expect(coproductionSvc.getEventColabBrand).toHaveBeenLastCalledWith(42, { allowNotLive: true });
  });
});

describe('+21 en los eventos de colab', () => {
  it('la compra pide confirmar mayoría de 21 años', async () => {
    vi.mocked(db.getEventBySlug).mockResolvedValue({ id: 42, slug: 'playmore', title: 'PlayMore' } as any);
    vi.mocked(coproductionSvc.isEventColab).mockResolvedValue(true);
    const attendeeData = JSON.stringify({ campos: { buyer__mayorEdad: false } });
    await expect(caller(null).orders.create({ eventSlug: 'playmore', buyerName: 'A', buyerEmail: 'a@b.cl', attendeeData, items: [{ ticketTypeId: 1, quantity: 1 }] }))
      .rejects.toMatchObject({ message: expect.stringContaining('21') });
  });
  it('los demás eventos siguen en 18', async () => {
    vi.mocked(db.getEventBySlug).mockResolvedValue({ id: 7, slug: 'otro', title: 'Otro' } as any);
    vi.mocked(coproductionSvc.isEventColab).mockResolvedValue(false);
    const attendeeData = JSON.stringify({ campos: { buyer__mayorEdad: false } });
    await expect(caller(null).orders.create({ eventSlug: 'otro', buyerName: 'A', buyerEmail: 'a@b.cl', attendeeData, items: [{ ticketTypeId: 1, quantity: 1 }] }))
      .rejects.toMatchObject({ message: expect.stringContaining('18') });
  });
});
