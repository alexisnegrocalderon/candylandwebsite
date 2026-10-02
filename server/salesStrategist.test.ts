import { beforeEach, describe, expect, it, vi } from 'vitest';
import { invokeLLM } from './_core/llm';
import * as db from './db';
import * as email from './email';
import { buildSalesStrategyEmail, runSalesStrategist, shouldRunSalesStrategyNow } from './salesStrategist';

vi.mock('./_core/llm', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./_core/llm')>();
  return { ...actual, invokeLLM: vi.fn() };
});
const invokeLLMMock = vi.mocked(invokeLLM);

vi.mock('./db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./db')>();
  return {
    ...actual,
    getEventById: vi.fn(),
    getFeaturedEvent: vi.fn(),
    getEventAccessSalesRows: vi.fn(),
    getEventsBefore: vi.fn(),
    getAccessTicketMix: vi.fn(),
    getSalesByUtmOrigin: vi.fn(),
    getAgentSalesSummary: vi.fn(),
    getSalesStrategyState: vi.fn(),
    updateSiteSettings: vi.fn(),
  };
});
vi.mock('./email', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./email')>();
  return { ...actual, sendEmail: vi.fn() };
});

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-10-05T12:00:00Z'); // lunes 09:00 en Chile (UTC-3)
const EVENT_DATE = new Date(NOW.getTime() + 25 * DAY);
const PREV_DATE = new Date(NOW.getTime() - 40 * DAY);

const event = { id: 7, title: 'Halloween', eventDate: EVENT_DATE, tandaPhaseIndex: 0, tandaDiscountSchedule: [{ percent: 40, untilDate: null }, { percent: 20 }] };
const prevEvent = { id: 6, title: 'Verano', eventDate: PREV_DATE };

// Evento actual: 12 entradas, 5 en la última semana. Anterior: 40 a esta
// distancia (25 días antes) y 100 en total.
const rowsFor = (id: number) => id === 7
  ? [
      { at: new Date(NOW.getTime() - 20 * DAY), units: 7, revenue: 140000 },
      { at: new Date(NOW.getTime() - 2 * DAY), units: 5, revenue: 100000 },
    ]
  : [
      { at: new Date(PREV_DATE.getTime() - 30 * DAY), units: 40, revenue: 800000 },
      { at: new Date(PREV_DATE.getTime() - 3 * DAY), units: 60, revenue: 1200000 },
    ];

const modelReply = {
  summary: 'Vamos más lento que el evento anterior.',
  recommendations: [{ title: 'Flash promo el jueves', why: 'Llevamos 12 vs 40.', action: 'Actívala desde Descuentos.', urgency: 'alta' }],
  risks: ['El ritmo se enfría'],
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(db.getEventById).mockResolvedValue(event as any);
  vi.mocked(db.getFeaturedEvent).mockResolvedValue(event as any);
  vi.mocked(db.getEventAccessSalesRows).mockImplementation(async (id: number) => rowsFor(id));
  vi.mocked(db.getEventsBefore).mockResolvedValue([prevEvent] as any);
  vi.mocked(db.getAccessTicketMix).mockResolvedValue([
    { name: 'Dúo', price: '24000', originalPrice: '40000', totalStock: 999999, soldCount: 8, status: 'active' },
  ] as any);
  vi.mocked(db.getSalesByUtmOrigin).mockResolvedValue([{ utmSource: 'instagram', utmMedium: 'dm', utmCampaign: 'agente', ordersCount: 3, revenue: 70000 }]);
  vi.mocked(db.getAgentSalesSummary).mockResolvedValue({ ordersCount: 3, revenue: 70000, bySource: [] });
  vi.mocked(db.getSalesStrategyState).mockResolvedValue(null);
  vi.mocked(db.updateSiteSettings).mockResolvedValue({ success: true } as any);
  vi.mocked(email.sendEmail).mockResolvedValue({ success: true } as any);
  invokeLLMMock.mockResolvedValue({
    id: 'x', created: 0, model: 'm',
    choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content: JSON.stringify(modelReply) } }],
  } as any);
});

describe('shouldRunSalesStrategyNow', () => {
  it('solo lunes 09:00 en Chile', () => {
    expect(shouldRunSalesStrategyNow(NOW)).toBe(true);
    expect(shouldRunSalesStrategyNow(new Date('2026-10-05T13:00:00Z'))).toBe(false); // 10:00
    expect(shouldRunSalesStrategyNow(new Date('2026-10-06T12:00:00Z'))).toBe(false); // martes
  });
});

describe('runSalesStrategist', () => {
  it('calcula los números en el servidor y se los entrega a la IA ya hechos', async () => {
    const result = await runSalesStrategist({ now: NOW, trigger: 'manual' });
    expect(result.ran).toBe(true);
    const n = result.report!.numbers;
    expect(n.unitsSold).toBe(12);
    expect(n.unitsLast7).toBe(5);
    expect(n.previousEvent).toEqual({ title: 'Verano', unitsAtSameDaysOut: 40, finalUnits: 100 });
    expect(n.projectedFinalUnits).toBe(30); // 12 * 100 / 40
    expect(n.projectionMethod).toBe('comparado');

    const userContent = (invokeLLMMock.mock.calls[0][0].messages[1] as any).content as string;
    expect(userContent).toContain('Faltan 25 días');
    expect(userContent).toContain('llevaba 40 entradas, y terminó vendiendo 100');
    expect(userContent).toContain('Proyección de entradas totales al cierre: 30');
    expect(userContent).toContain('Dúo: $24.000 (precio general $40.000)');
    expect(userContent).toContain('Tanda vigente: 40%');
    expect(userContent).toContain('Siguiente tanda: 20%');
  });

  it('guarda el reporte conservando el interruptor, y el manual no manda correo', async () => {
    vi.mocked(db.getSalesStrategyState).mockResolvedValue({ weeklyEnabled: false, report: null });
    const result = await runSalesStrategist({ now: NOW, trigger: 'manual' });
    expect(result.emailed).toBe(false);
    expect(email.sendEmail).not.toHaveBeenCalled();
    const saved = vi.mocked(db.updateSiteSettings).mock.calls[0][0].salesStrategyState!;
    expect(saved.weeklyEnabled).toBe(false);
    expect(saved.report?.recommendations[0].title).toBe('Flash promo el jueves');
  });

  it('el cron manda el correo', async () => {
    const result = await runSalesStrategist({ now: NOW, trigger: 'cron' });
    expect(result.ran).toBe(true);
    expect(result.emailed).toBe(true);
    expect(vi.mocked(email.sendEmail).mock.calls[0][0].subject).toContain('Halloween');
  });

  it('el cron respeta el interruptor apagado y no repite el mismo día', async () => {
    vi.mocked(db.getSalesStrategyState).mockResolvedValueOnce({ weeklyEnabled: false, report: null });
    expect(await runSalesStrategist({ now: NOW, trigger: 'cron' })).toMatchObject({ ran: false });
    expect(invokeLLMMock).not.toHaveBeenCalled();

    const first = await runSalesStrategist({ now: NOW, trigger: 'manual' });
    vi.mocked(db.getSalesStrategyState).mockResolvedValueOnce({ weeklyEnabled: true, report: first.report });
    const again = await runSalesStrategist({ now: new Date(NOW.getTime() + 60 * 60 * 1000), trigger: 'cron' });
    expect(again).toEqual({ ran: false, reason: 'ya se generó hoy' });
  });

  it('sin evento publicado no llama a la IA', async () => {
    vi.mocked(db.getFeaturedEvent).mockResolvedValue(undefined as any);
    const result = await runSalesStrategist({ now: NOW, trigger: 'manual' });
    expect(result.ran).toBe(false);
    expect(invokeLLMMock).not.toHaveBeenCalled();
  });

  it('si el evento anterior inmediato no vendió nada, compara con el siguiente', async () => {
    vi.mocked(db.getEventsBefore).mockResolvedValue([{ id: 5, title: 'Vacío', eventDate: new Date(PREV_DATE.getTime() - 10 * DAY) }, prevEvent] as any);
    vi.mocked(db.getEventAccessSalesRows).mockImplementation(async (id: number) => (id === 5 ? [] : rowsFor(id)));
    const result = await runSalesStrategist({ now: NOW, trigger: 'manual' });
    expect(result.report!.numbers.previousEvent?.title).toBe('Verano');
  });

  it('sin evento anterior proyecta solo por ritmo y lo dice', async () => {
    vi.mocked(db.getEventsBefore).mockResolvedValue([]);
    const result = await runSalesStrategist({ now: NOW, trigger: 'manual' });
    expect(result.report!.numbers.projectionMethod).toBe('ritmo');
    const userContent = (invokeLLMMock.mock.calls[0][0].messages[1] as any).content as string;
    expect(userContent).toContain('No hay un evento anterior con ventas para comparar');
    expect(userContent).toContain('sin comparar');
  });
});

describe('buildSalesStrategyEmail', () => {
  it('escapa el HTML de lo que escribe la IA', async () => {
    invokeLLMMock.mockResolvedValue({
      id: 'x', created: 0, model: 'm',
      choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content: JSON.stringify({ ...modelReply, summary: '<script>alert(1)</script>' }) } }],
    } as any);
    const { report } = await runSalesStrategist({ now: NOW, trigger: 'manual' });
    const html = buildSalesStrategyEmail(report!);
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('Flash promo el jueves');
  });
});

describe('columna sin crear', () => {
  it('traduce el error de SQL a un mensaje que el dueño entiende', async () => {
    vi.mocked(db.updateSiteSettings).mockRejectedValue(Object.assign(new Error('Failed query'), { cause: new Error("Unknown column 'salesstrategystate' in 'field list'") }));
    await expect(runSalesStrategist({ now: NOW, trigger: 'manual' })).rejects.toThrow(/Falta crear la columna salesStrategyState/);
  });

  it('un error distinto se deja pasar tal cual', async () => {
    vi.mocked(db.updateSiteSettings).mockRejectedValue(new Error('conexión caída'));
    await expect(runSalesStrategist({ now: NOW, trigger: 'manual' })).rejects.toThrow('conexión caída');
  });
});
