import { beforeEach, describe, expect, it, vi } from 'vitest';
import { appRouter } from './routers';
import * as db from './db';
import type { TrpcContext } from './_core/context';

vi.mock('./db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./db')>();
  return {
    ...actual,
    getEventBySlug: vi.fn(),
    getOpenShift: vi.fn(),
    getCajaDashboard: vi.fn(),
    listActiveOperatorsPublic: vi.fn(),
  };
});

const req = { protocol: 'https', headers: { 'x-forwarded-for': '1.2.3.4' }, socket: { remoteAddress: '1.2.3.4' } } as unknown as TrpcContext['req'];
const REAL_EVENT = 10;
const TEST_EVENT = 900;
const device = { id: 1, name: 'Tablet barra', eventId: REAL_EVENT };
const operator = (role: string) => ({ operatorId: 7, role, name: 'Cami' });
const caller = (role: string | null, withDevice = true) => appRouter.createCaller({
  user: null, req, res: {} as TrpcContext['res'],
  device: withDevice ? device : null,
  operator: role ? operator(role) : null,
} as unknown as TrpcContext);

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(db.getEventBySlug).mockImplementation(async (slug: string) => (slug === 'pruebas-caja' ? { id: TEST_EVENT } as any : null));
  vi.mocked(db.getCajaDashboard).mockResolvedValue({ ok: true } as any);
  vi.mocked(db.getOpenShift).mockResolvedValue(null as any);
});

describe('solo caja, supervisor y admin usan la caja', () => {
  it.each(['caja', 'supervisor', 'admin'])('%s entra', async (role) => {
    await expect(caller(role).caja.dashboard({ eventId: REAL_EVENT })).resolves.toEqual({ ok: true });
  });

  it.each(['barra', 'acceso', 'cocina', 'guardarropia'])('%s (misma cookie, otra pantalla) no puede vender', async (role) => {
    await expect(caller(role).caja.dashboard({ eventId: REAL_EVENT })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(caller(role).caja.sale({
      opId: 'x', eventId: REAL_EVENT, items: [{ ticketTypeId: 1, quantity: 1 }], paymentMethod: 'efectivo', clientAt: new Date().toISOString(),
    } as any)).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('la pantalla de nombres solo muestra a quienes usan la caja', async () => {
    vi.mocked(db.listActiveOperatorsPublic).mockResolvedValue([
      { id: 1, name: 'Ana', role: 'caja' }, { id: 2, name: 'Beto', role: 'cocina' },
      { id: 3, name: 'Cata', role: 'barra' }, { id: 4, name: 'Dani', role: 'acceso' },
    ] as any);
    const list = await caller(null).caja.listOperators();
    expect(list.map((o) => o.name)).toEqual(['Ana']);
  });
});

describe('el evento tiene que ser el de la tablet (o el de pruebas)', () => {
  it('acepta el evento real y el de pruebas', async () => {
    await expect(caller('caja').caja.dashboard({ eventId: REAL_EVENT })).resolves.toBeTruthy();
    await expect(caller('caja').caja.dashboard({ eventId: TEST_EVENT })).resolves.toBeTruthy();
  });

  it('rechaza cualquier otro evento', async () => {
    await expect(caller('caja').caja.dashboard({ eventId: 55 })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(db.getCajaDashboard).not.toHaveBeenCalled();
  });
});

describe('turno abierto: mismo evento que apertura y cierre', () => {
  it('en modo prueba busca el turno en el evento de pruebas', async () => {
    vi.mocked(db.getOpenShift).mockResolvedValue({ id: 3, openingCash: 50000, openedAt: new Date(), operatorId: 7 } as any);
    const shift = await caller('caja').caja.currentShift({ eventId: TEST_EVENT, registerId: 2 });
    expect(db.getOpenShift).toHaveBeenCalledWith(TEST_EVENT, 2);
    expect(shift).toMatchObject({ shiftId: 3, openingCash: 50000 });
  });

  it('sin eventId sigue usando el evento real del dispositivo', async () => {
    await caller('caja').caja.currentShift({ registerId: 2 });
    expect(db.getOpenShift).toHaveBeenCalledWith(REAL_EVENT, 2);
  });
});
