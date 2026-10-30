import { beforeEach, describe, expect, it, vi } from 'vitest';
import { appRouter } from './routers';
import * as db from './db';
import type { TrpcContext } from './_core/context';
import { parseSupervisorOpenId, supervisorOpenId, SUPERVISOR_SECTION_IDS } from '../shared/panelSupervisor';

vi.mock('./db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./db')>();
  return {
    ...actual,
    getAllEvents: vi.fn(), getTicketTypesByEventId: vi.fn(), recordAdminAudit: vi.fn(),
    listManualOrders: vi.fn(), createManualOrder: vi.fn(), createInstantInvite: vi.fn(),
  };
});

const req = { protocol: 'https', headers: { 'x-forwarded-for': '1.2.3.4' }, socket: { remoteAddress: '1.2.3.4' } } as unknown as TrpcContext['req'];
const user = (role: string, name = 'Belén García') => ({ id: -1, openId: 'x', name, role }) as any;
const caller = (u: any) => appRouter.createCaller({ user: u, req, res: {} as TrpcContext['res'] });

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(db.getAllEvents).mockResolvedValue([] as any);
  vi.mocked(db.getTicketTypesByEventId).mockResolvedValue([{ id: 1, name: 'General', price: '10000', costPrice: '3000' }] as any);
  vi.mocked(db.listManualOrders).mockResolvedValue([{ id: 1, total: '25000' }] as any);
});

describe('openId de la supervisora', () => {
  it('ida y vuelta, y rechaza lo que no es suyo', () => {
    expect(parseSupervisorOpenId(supervisorOpenId(7, 3))).toEqual({ id: 7, sessionVersion: 3 });
    expect(parseSupervisorOpenId('partner:dalmore:1')).toBeNull();
    expect(parseSupervisorOpenId('sup:x:1')).toBeNull();
  });
  it('su lista de secciones no incluye ventas, finanzas ni ajustes', () => {
    for (const bad of ['orders-web', 'finanzas', 'gastos', 'settings', 'customers', 'mailing', 'supervisoras', 'playmatch-test']) {
      expect(SUPERVISOR_SECTION_IDS as readonly string[]).not.toContain(bad);
    }
  });
});

describe('la supervisora ve y hace solo lo suyo', () => {
  const sup = user('supervisor');

  it('puede abrir lo que se le abrió, sin costos', async () => {
    await expect(caller(sup).events.listAll()).resolves.toEqual([]);
    const tt: any = await caller(sup).events.listTicketTypes({ eventId: 1 });
    expect(tt[0].costPrice).toBeNull();
    const manual: any = await caller(sup).orders.listManual();
    expect(manual[0].total).toBe('0');
  });

  it('el dueño sigue viendo costos y montos', async () => {
    const tt: any = await caller(user('admin', 'Admin')).events.listTicketTypes({ eventId: 1 });
    expect(tt[0].costPrice).toBe('3000');
    const manual: any = await caller(user('admin', 'Admin')).orders.listManual();
    expect(manual[0].total).toBe('25000');
  });

  it('no puede ver ventas, finanzas, clientes ni configuración', async () => {
    await expect(caller(sup).orders.getStats({} as any)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(caller(sup).customers.listAll()).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(caller(sup).party.adminCharges({ eventId: 1 })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(caller(sup).party.adminConfig({ eventId: 1 })).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('no puede borrar ni tocar recetas, costos o precios', async () => {
    await expect(caller(sup).discounts.delete({ id: 1, adminPassword: 'x' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(caller(sup).communityCodes.delete({ id: 1, adminPassword: 'x' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(caller(sup).orders.delete({ id: 1, adminPassword: 'x' } as any)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(caller(sup).party.testDelete({} as any)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(caller(sup).party.adminSetConfig({ eventId: 1 })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(caller(sup).insumos.setReceta({} as any)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(caller(sup).insumos.save({} as any)).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('no administra supervisoras ni se da acceso a sí misma', async () => {
    await expect(caller(sup).panelSupervisors.list()).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(caller(sup).panelSupervisors.create({ name: 'Otra', adminPassword: 'x' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('solo manda invitaciones gratis, nunca accesos pagados', async () => {
    const base = { eventSlug: 'e', buyerName: 'Ana', buyerEmail: 'a@t.cl', items: [{ ticketTypeId: 1, quantity: 1 }] };
    await expect(caller(sup).orders.createManual({ ...base, kind: 'paid' })).rejects.toMatchObject({ code: 'FORBIDDEN', message: expect.stringContaining('invitaciones') });
  });

  it('lo que hace queda en la bitácora con su nombre; si falla, no se anota', async () => {
    vi.mocked(db.createInstantInvite).mockResolvedValue({ orderNumber: 'MP-1' } as any);
    await caller(sup).orders.createInstantInvite({ eventSlug: 'e', personas: 2 });
    expect(db.recordAdminAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'supervisor.orders.createInstantInvite', targetId: 'Belén García' }));

    vi.mocked(db.recordAdminAudit).mockClear();
    vi.mocked(db.createInstantInvite).mockRejectedValue(new Error('falla a propósito'));
    await expect(caller(sup).orders.createInstantInvite({ eventSlug: 'e', personas: 2 })).rejects.toBeDefined();
    expect(db.recordAdminAudit).not.toHaveBeenCalled();
  });
});

describe('otros roles siguen sin entrar', () => {
  it('el usuario común, el socio y el invitado no usan las rutas de la supervisora', async () => {
    for (const role of ['user', 'partner']) {
      await expect(caller(user(role)).events.listAll()).rejects.toMatchObject({ code: 'FORBIDDEN' });
    }
    await expect(caller(user('viewer')).orders.createInstantInvite({ eventSlug: 'e', personas: 1 })).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});
