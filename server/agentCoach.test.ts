import { beforeEach, describe, expect, it, vi } from 'vitest';
import { invokeLLM } from './_core/llm';
import * as db from './db';
import * as email from './email';
import { buildAgentCoachEmail, formatTranscript, runAgentCoach, shouldRunAgentCoachNow } from './agentCoach';

vi.mock('./_core/llm', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./_core/llm')>();
  return { ...actual, invokeLLM: vi.fn() };
});
const invokeLLMMock = vi.mocked(invokeLLM);

vi.mock('./db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./db')>();
  return {
    ...actual,
    getSiteSettings: vi.fn(),
    updateSiteSettings: vi.fn(),
    listIgThreads: vi.fn(),
    listWaThreads: vi.fn(),
    getIgMessages: vi.fn(),
    getWaMessages: vi.fn(),
    listAgentHandoffLog: vi.fn(),
    getAgentSalesSummary: vi.fn(),
    getAgentCoachReport: vi.fn(),
  };
});
const getSiteSettingsMock = vi.mocked(db.getSiteSettings);
const updateSiteSettingsMock = vi.mocked(db.updateSiteSettings);
const listIgThreadsMock = vi.mocked(db.listIgThreads);
const listWaThreadsMock = vi.mocked(db.listWaThreads);
const getIgMessagesMock = vi.mocked(db.getIgMessages);

vi.mock('./email', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./email')>();
  return { ...actual, sendEmail: vi.fn() };
});
const sendEmailMock = vi.mocked(email.sendEmail);

const NOW = new Date('2026-09-28T13:00:00Z'); // lunes 10:00 en Chile (UTC-3)

const COACH_JSON = {
  summary: 'Semana movida: mucha pregunta por precio en pareja.',
  topQuestions: ['Precio de la Dúo'],
  dropOffPoints: ['Se enfrían después de saber el precio'],
  knowledgeSuggestions: ['El estacionamiento cuesta $___'],
  playbookSuggestions: ['Objeción "está caro" en parejas: ...'],
  highlights: ['Buen uso del botón de compra'],
};

describe('shouldRunAgentCoachNow', () => {
  it('corre los lunes a las 10:00 de Chile', () => {
    expect(shouldRunAgentCoachNow(NOW)).toBe(true);
  });

  it('no corre otro día ni otra hora', () => {
    expect(shouldRunAgentCoachNow(new Date('2026-09-28T14:00:00Z'))).toBe(false); // lunes 11:00
    expect(shouldRunAgentCoachNow(new Date('2026-09-29T13:00:00Z'))).toBe(false); // martes 10:00
  });
});

describe('formatTranscript', () => {
  it('arma la conversación sin nombres, distinguiendo cliente, agente y dueño', () => {
    const text = formatTranscript('Persona 1 (Instagram)', [
      { direction: 'in', source: 'user', text: 'cuánto vale la dúo?' },
      { direction: 'out', source: 'bot', text: 'La Dúo está en $45.000' },
      { direction: 'out', source: 'bot', text: '[botón] Comprar entrada' },
      { direction: 'out', source: 'admin', text: 'te espero!' },
    ]);
    expect(text).toBe('### Persona 1 (Instagram)\nCliente: cuánto vale la dúo?\nAgente: La Dúo está en $45.000\nDueño: te espero!');
  });
});

describe('runAgentCoach', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSiteSettingsMock.mockResolvedValue({ instagramAgentConfig: {} } as any);
    listIgThreadsMock.mockResolvedValue([{ id: 1, lastMessageAt: new Date('2026-09-27T20:00:00Z') }] as any);
    listWaThreadsMock.mockResolvedValue([] as any);
    getIgMessagesMock.mockResolvedValue([
      { direction: 'in', source: 'user', text: 'cuánto vale la dúo?' },
      { direction: 'out', source: 'bot', text: 'La Dúo está en $45.000' },
    ] as any);
    vi.mocked(db.listAgentHandoffLog).mockResolvedValue([]);
    vi.mocked(db.getAgentSalesSummary).mockResolvedValue({ ordersCount: 3, revenue: 135000, bySource: [] });
    sendEmailMock.mockResolvedValue({ success: true } as any);
    invokeLLMMock.mockResolvedValue({ choices: [{ message: { content: JSON.stringify(COACH_JSON) } }] } as any);
  });

  it('genera el reporte, lo guarda y lo manda por correo', async () => {
    const result = await runAgentCoach({ now: NOW, trigger: 'cron' });

    expect(result.ran).toBe(true);
    expect(result.emailed).toBe(true);
    expect(result.report?.summary).toBe(COACH_JSON.summary);
    expect(result.report?.stats).toEqual({ conversations: 1, customerMessages: 1, handoffs: 0, agentOrders: 3, agentRevenue: 135000 });
    expect(updateSiteSettingsMock).toHaveBeenCalledWith({ agentCoachReport: expect.objectContaining({ summary: COACH_JSON.summary }) });
    const userMessage = invokeLLMMock.mock.calls[0][0].messages[1].content as string;
    expect(userMessage).toContain('Cliente: cuánto vale la dúo?');
    expect(userMessage).toContain('LO QUE EL AGENTE YA SABE HOY');
  });

  it('respeta el interruptor apagado cuando lo dispara el cron', async () => {
    getSiteSettingsMock.mockResolvedValueOnce({ instagramAgentConfig: { coachWeeklyEnabled: false } } as any);
    const result = await runAgentCoach({ now: NOW, trigger: 'cron' });
    expect(result.ran).toBe(false);
    expect(invokeLLMMock).not.toHaveBeenCalled();
  });

  it('no corre dos veces el mismo día desde el cron', async () => {
    vi.mocked(db.getAgentCoachReport).mockResolvedValueOnce({ generatedAt: new Date(NOW.getTime() - 60 * 60 * 1000).toISOString(), summary: 'ya' });
    const result = await runAgentCoach({ now: NOW, trigger: 'cron' });
    expect(result.ran).toBe(false);
  });

  it('el botón manual corre aunque esté apagado, sin mandar correo', async () => {
    getSiteSettingsMock.mockResolvedValueOnce({ instagramAgentConfig: { coachWeeklyEnabled: false } } as any);
    const result = await runAgentCoach({ now: NOW, trigger: 'manual', email: false });
    expect(result.ran).toBe(true);
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it('sin conversaciones en la semana no llama a la IA', async () => {
    listIgThreadsMock.mockResolvedValueOnce([] as any);
    const result = await runAgentCoach({ now: NOW, trigger: 'manual' });
    expect(result.ran).toBe(false);
    expect(invokeLLMMock).not.toHaveBeenCalled();
  });
});

describe('buildAgentCoachEmail', () => {
  it('escapa el texto que viene de la IA', () => {
    const html = buildAgentCoachEmail({
      generatedAt: NOW.toISOString(), periodFrom: NOW.toISOString(), periodTo: NOW.toISOString(),
      stats: { conversations: 1, customerMessages: 1, handoffs: 0, agentOrders: 0, agentRevenue: 0 },
      summary: '<script>x</script>', topQuestions: [], dropOffPoints: [], knowledgeSuggestions: [], playbookSuggestions: [], highlights: [],
    });
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });
});
