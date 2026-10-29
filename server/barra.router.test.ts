import { beforeEach, describe, expect, it, vi } from 'vitest';
import { appRouter } from './routers';
import * as db from './db';
import * as insumoSvc from './insumos';
import type { TrpcContext } from './_core/context';

vi.mock('./db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./db')>();
  return { ...actual, getEventById: vi.fn(), getEventBySlug: vi.fn(), listActiveOperatorsPublic: vi.fn(), getActiveEventForCaja: vi.fn() };
});
vi.mock('./insumos', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./insumos')>();
  return { ...actual, estadoBarra: vi.fn(), ultimoConteo: vi.fn(), crearConteo: vi.fn() };
});
vi.mock('./caja/alerts', async (importOriginal) => ({ ...(await importOriginal<typeof import('./caja/alerts')>()), alertConteoDescuadre: vi.fn() }));

const req = { protocol: 'https', headers: { 'x-forwarded-for': '1.2.3.4' }, socket: { remoteAddress: '1.2.3.4' } } as unknown as TrpcContext['req'];
const EVENT = 10;
const TEST_EVENT = 900;
// Sábado 8 de agosto de 2026: puertas 21:00 y fin 05:00 (Chile, UTC-4).
const event = {
  id: EVENT, title: 'Fiesta',
  eventDate: new Date('2026-08-09T01:00:00Z'), doorsOpen: new Date('2026-08-09T01:00:00Z'), eventEnd: new Date('2026-08-09T09:00:00Z'),
};
const lines = [{ insumoId: 1, closed: [{ size: 750, count: 2 }], open: [] }];
const caller = (role: string | null, eventId: number | undefined = EVENT) => appRouter.createCaller({
  user: null, req, res: {} as TrpcContext['res'], device: null,
  operator: role ? { operatorId: 7, role, name: 'Cami', eventId } : null,
} as unknown as TrpcContext);

beforeEach(() => {
  vi.resetAllMocks();
  vi.useRealTimers();
  vi.mocked(db.getEventById).mockResolvedValue(event as any);
  vi.mocked(db.getEventBySlug).mockImplementation(async (slug: string) => (slug === 'pruebas-caja' ? { id: TEST_EVENT } as any : null));
  vi.mocked(insumoSvc.ultimoConteo).mockResolvedValue(null);
  vi.mocked(insumoSvc.crearConteo).mockResolvedValue({ conteoId: 1, test: false, lines: [], forAlerts: [] } as any);
});

const at = (iso: string) => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date(iso)); };

describe('pantalla de barra: quién entra', () => {
  it.each(['barra', 'supervisor', 'admin'])('%s entra', async (role) => {
    vi.mocked(insumoSvc.estadoBarra).mockResolvedValue({ ready: false, insumos: [], productos: [] } as any);
    await expect(caller(role).barra.estado({ eventId: EVENT })).resolves.toMatchObject({ ready: false });
  });

  it.each(['caja', 'cocina', 'acceso', 'guardarropia'])('%s no cuenta la barra', async (role) => {
    await expect(caller(role).barra.estado({ eventId: EVENT })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(caller(role).barra.conteo({ eventId: EVENT, kind: 'apertura', lines })).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('la lista de nombres solo trae barra, supervisor y admin', async () => {
    vi.mocked(db.getActiveEventForCaja).mockResolvedValue(event as any);
    vi.mocked(db.listActiveOperatorsPublic).mockResolvedValue([
      { id: 1, name: 'Ana', role: 'caja' }, { id: 2, name: 'Beto', role: 'barra' }, { id: 3, name: 'Cata', role: 'supervisor' }, { id: 4, name: 'Dani', role: 'cocina' },
    ] as any);
    expect((await caller(null).barra.listOperators()).map((o) => o.name)).toEqual(['Beto', 'Cata']);
  });
});

describe('conteo: ventana horaria y una vez por noche', () => {
  it('el inicial se guarda el día del evento antes de abrir puertas', async () => {
    at('2026-08-09T00:00:00Z'); // sábado 20:00
    await caller('barra').barra.conteo({ eventId: EVENT, kind: 'apertura', lines });
    expect(insumoSvc.crearConteo).toHaveBeenCalledWith(expect.objectContaining({ eventId: EVENT, kind: 'apertura', operatorId: 7, shiftId: null }));
  });

  it('el inicial no se acepta con la fiesta andando ni el día anterior', async () => {
    at('2026-08-09T03:00:00Z'); // sábado 23:00, con la fiesta andando
    await expect(caller('barra').barra.conteo({ eventId: EVENT, kind: 'apertura', lines })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    at('2026-08-08T03:00:00Z'); // viernes 23:00
    await expect(caller('barra').barra.conteo({ eventId: EVENT, kind: 'apertura', lines })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    expect(insumoSvc.crearConteo).not.toHaveBeenCalled();
  });

  it('el cierre se abre cuando termina la fiesta', async () => {
    at('2026-08-09T05:00:00Z');
    await expect(caller('barra').barra.conteo({ eventId: EVENT, kind: 'cierre', lines })).rejects.toThrow(/termina la fiesta/);
    at('2026-08-09T09:30:00Z');
    await caller('barra').barra.conteo({ eventId: EVENT, kind: 'cierre', lines });
    expect(insumoSvc.crearConteo).toHaveBeenCalledTimes(1);
  });

  it('si ya lo hizo alguien de la barra, no se repite (queda lista para todos)', async () => {
    at('2026-08-09T00:00:00Z');
    vi.mocked(insumoSvc.ultimoConteo).mockResolvedValue({ id: 5, operatorName: 'Beto', createdAt: new Date() } as any);
    await expect(caller('barra').barra.conteo({ eventId: EVENT, kind: 'apertura', lines })).rejects.toThrow(/Ya lo hizo Beto/);
    expect(insumoSvc.crearConteo).not.toHaveBeenCalled();
  });

  it('un supervisor puede contar fuera de ventana o corregir', async () => {
    at('2026-08-09T03:00:00Z');
    vi.mocked(insumoSvc.ultimoConteo).mockResolvedValue({ id: 5, operatorName: 'Beto', createdAt: new Date() } as any);
    await caller('supervisor').barra.conteo({ eventId: EVENT, kind: 'apertura', lines });
    expect(insumoSvc.crearConteo).toHaveBeenCalledTimes(1);
  });

  it('el evento de pruebas no tiene límites', async () => {
    at('2026-08-09T03:00:00Z');
    vi.mocked(db.getEventById).mockResolvedValue({ ...event, id: TEST_EVENT } as any);
    await caller('barra', TEST_EVENT).barra.conteo({ eventId: TEST_EVENT, kind: 'apertura', lines });
    expect(insumoSvc.crearConteo).toHaveBeenCalledTimes(1);
  });

  it('no deja contar en el evento de otro', async () => {
    at('2026-08-09T00:00:00Z');
    await expect(caller('barra', 55).barra.conteo({ eventId: EVENT, kind: 'apertura', lines })).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});

describe('tareas de la noche', () => {
  it('muestra la ventana y quién ya lo hizo', async () => {
    at('2026-08-09T00:00:00Z');
    vi.mocked(insumoSvc.ultimoConteo).mockImplementation(async (_e, kind) => (kind === 'apertura' ? { id: 1, operatorName: 'Beto', createdAt: new Date('2026-08-08T22:00:00Z') } as any : null));
    const tareas = await caller('barra').barra.tareas({ eventId: EVENT });
    expect(tareas.map((t) => [t.kind, t.ventana, t.hecho?.por ?? null])).toEqual([['apertura', 'abierta', 'Beto'], ['cierre', 'aun_no', null]]);
  });
});
