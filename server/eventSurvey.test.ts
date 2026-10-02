import { beforeEach, describe, expect, it, vi } from 'vitest';
import { invokeLLM } from './_core/llm';
import * as db from './db';
import * as email from './email';
import { analyzeEventSurvey, getEventSurveyPanel, runSurveyDispatch, sendEventSurveys, sendSurveyTestEmail, surveyUrl } from './eventSurvey';

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
    getSurveyAttendees: vi.fn(),
    createSurveyInvites: vi.fn(),
    listPendingSurveys: vi.fn(),
    markSurveySent: vi.fn(),
    recordSurveySendFailure: vi.fn(),
    getSurveyOverview: vi.fn(),
    getEventSurveySettings: vi.fn(),
    listAutoSurveyEventIds: vi.fn(),
    saveEventSurveyReport: vi.fn(),
  };
});
vi.mock('./email', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./email')>();
  return { ...actual, sendEmail: vi.fn() };
});
const sendEmailMock = vi.mocked(email.sendEmail);

const HOUR = 60 * 60 * 1000;
const EVENT_DATE = new Date('2026-10-30T22:00:00Z');
const event = { id: 7, title: 'Halloween', status: 'past', eventDate: EVENT_DATE };
// 14 h después de empezar y mediodía en Chile (UTC-3 en octubre... verano = UTC-3): 15:00Z.
const SEND_TIME = new Date('2026-10-31T15:00:00Z');

const invite = (id: number, name = 'Cami') => ({ id, token: `tok${id}`, buyerEmail: `p${id}@mail.com`, buyerName: name });

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(db.getEventById).mockResolvedValue(event as any);
  vi.mocked(db.getSurveyAttendees).mockResolvedValue([{ email: 'a@mail.com', name: 'A' }]);
  vi.mocked(db.createSurveyInvites).mockResolvedValue(1);
  vi.mocked(db.listPendingSurveys).mockResolvedValue([]);
  vi.mocked(db.getSurveyOverview).mockResolvedValue({ invited: 0, sent: 0, pending: 0, responses: [] });
  vi.mocked(db.getEventSurveySettings).mockResolvedValue({ autoSend: false, report: null });
  vi.mocked(db.listAutoSurveyEventIds).mockResolvedValue([]);
  sendEmailMock.mockResolvedValue({ success: true } as any);
});

describe('sendEventSurveys', () => {
  it('crea las invitaciones, manda cada una con su link personal y la marca como enviada', async () => {
    vi.mocked(db.listPendingSurveys).mockResolvedValue([invite(1), invite(2, 'Beto')] as any);
    vi.mocked(db.getSurveyOverview).mockResolvedValue({ invited: 2, sent: 2, pending: 0, responses: [] });
    const r = await sendEventSurveys(7);
    expect(r).toEqual({ invited: 1, sent: 2, failed: 0, pending: 0 });
    expect(db.createSurveyInvites).toHaveBeenCalledWith(7, [{ email: 'a@mail.com', name: 'A' }]);
    expect(sendEmailMock).toHaveBeenCalledTimes(2);
    const first = sendEmailMock.mock.calls[0][0];
    expect(first.to).toBe('p1@mail.com');
    expect(first.subject).toContain('Halloween');
    expect(first.html).toContain(surveyUrl('tok1'));
    expect(first.html).not.toContain(surveyUrl('tok2'));
    expect(db.markSurveySent).toHaveBeenCalledWith(1);
    expect(db.markSurveySent).toHaveBeenCalledWith(2);
  });

  it('si un envío falla, suma el intento y NO la marca como enviada; los demás siguen', async () => {
    vi.mocked(db.listPendingSurveys).mockResolvedValue([invite(1), invite(2)] as any);
    sendEmailMock.mockResolvedValueOnce({ success: false } as any).mockResolvedValueOnce({ success: true } as any);
    const r = await sendEventSurveys(7);
    expect(r.sent).toBe(1);
    expect(r.failed).toBe(1);
    expect(db.recordSurveySendFailure).toHaveBeenCalledWith(1);
    expect(db.markSurveySent).toHaveBeenCalledTimes(1);
    expect(db.markSurveySent).toHaveBeenCalledWith(2);
  });

  it('pide solo el lote y deja de reintentar a quien ya falló 3 veces', async () => {
    await sendEventSurveys(7, 25);
    expect(db.listPendingSurveys).toHaveBeenCalledWith(7, 25, 3);
  });

  it('una fiesta que no existe da un error claro', async () => {
    vi.mocked(db.getEventById).mockResolvedValue(undefined as any);
    await expect(sendEventSurveys(99)).rejects.toThrow('No encontré esa fiesta');
  });
});

describe('runSurveyDispatch', () => {
  it('fuera de 12:00-20:00 en Chile no toca nada', async () => {
    const r = await runSurveyDispatch(new Date('2026-10-31T10:00:00Z')); // 07:00 Chile
    expect(r.ran).toBe(false);
    expect(db.listAutoSurveyEventIds).not.toHaveBeenCalled();
  });

  it('solo manda a las fiestas con el automático prendido y dentro de la ventana', async () => {
    vi.mocked(db.listAutoSurveyEventIds).mockResolvedValue([7, 8, 9]);
    vi.mocked(db.getEventById).mockImplementation(async (id: number) => {
      if (id === 7) return event as any;
      if (id === 8) return { id: 8, title: 'Muy vieja', status: 'past', eventDate: new Date(EVENT_DATE.getTime() - 30 * 24 * HOUR) } as any;
      return { id: 9, title: 'Borrador', status: 'draft', eventDate: EVENT_DATE } as any;
    });
    vi.mocked(db.listPendingSurveys).mockResolvedValue([invite(1)] as any);
    const r = await runSurveyDispatch(SEND_TIME);
    expect(r.ran).toBe(true);
    expect(r.events.map((e) => e.eventId)).toEqual([7]);
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
  });

  it('con el automático apagado en todas las fiestas no manda nada', async () => {
    const r = await runSurveyDispatch(SEND_TIME);
    expect(r).toEqual({ ran: true, events: [] });
    expect(sendEmailMock).not.toHaveBeenCalled();
  });
});

describe('sendSurveyTestEmail', () => {
  it('manda la prueba al admin con un link de muestra, no uno real', async () => {
    const r = await sendSurveyTestEmail(7);
    expect(r.success).toBe(true);
    const arg = sendEmailMock.mock.calls[0][0];
    expect(arg.subject).toContain('[PRUEBA]');
    expect(arg.html).toContain('/encuesta/prueba');
  });
});

describe('analyzeEventSurvey', () => {
  const responses = [5, 4, 5, 2].map((rating, i) => ({ rating, liked: `me gustó ${i}`, improve: i === 3 ? 'las filas' : '', respondedAt: new Date() }));

  it('no analiza con muy pocas respuestas', async () => {
    vi.mocked(db.getSurveyOverview).mockResolvedValue({ invited: 5, sent: 5, pending: 0, responses: responses.slice(0, 2) });
    await expect(analyzeEventSurvey(7)).rejects.toThrow(/menos de 3 respuestas/);
    expect(invokeLLMMock).not.toHaveBeenCalled();
  });

  it('le pasa a la IA las notas y comentarios SIN correos ni nombres, y guarda el análisis', async () => {
    vi.mocked(db.getSurveyOverview).mockResolvedValue({ invited: 8, sent: 8, pending: 0, responses });
    invokeLLMMock.mockResolvedValue({
      id: 'x', created: 0, model: 'm',
      choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content: JSON.stringify({ summary: 'Les gustó.', praised: ['música'], complaints: ['filas'], improvements: ['más cajas'] }) } }],
    } as any);
    const a = await analyzeEventSurvey(7, new Date('2026-11-02T12:00:00Z'));
    expect(a.basedOnResponses).toBe(4);
    expect(a.improvements).toEqual(['más cajas']);
    expect(db.saveEventSurveyReport).toHaveBeenCalledWith(7, a);
    const sent = JSON.stringify(invokeLLMMock.mock.calls[0][0].messages);
    expect(sent).toContain('Nota promedio: 4/5');
    expect(sent).toContain('5★ | me gustó 0');
    expect(sent).toContain('las filas');
    expect(sent).not.toContain('@');
    expect(sent).toContain('DATOS de la gente');
  });
});

describe('getEventSurveyPanel', () => {
  it('arma el panel con estadísticas y deja fuera las notas sin comentario de la lista', async () => {
    vi.mocked(db.getSurveyOverview).mockResolvedValue({
      invited: 4, sent: 3, pending: 1,
      responses: [
        { rating: 5, liked: 'todo', improve: '', respondedAt: new Date('2026-10-31T18:00:00Z') },
        { rating: 3, liked: '', improve: '', respondedAt: new Date('2026-10-31T17:00:00Z') },
      ],
    });
    vi.mocked(db.getEventSurveySettings).mockResolvedValue({ autoSend: true, report: null });
    const p = await getEventSurveyPanel(7);
    expect(p).toMatchObject({ invited: 4, sent: 3, pending: 1, autoSend: true, analysis: null });
    expect(p.stats.average).toBe(4);
    expect(p.comments).toHaveLength(1);
    expect(p.comments[0]).toMatchObject({ rating: 5, liked: 'todo' });
  });
});
