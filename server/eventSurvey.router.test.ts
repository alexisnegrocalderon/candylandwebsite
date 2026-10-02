import { beforeEach, describe, expect, it, vi } from 'vitest';
import { appRouter } from './routers';
import * as db from './db';
import type { TrpcContext } from './_core/context';

vi.mock('./db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./db')>();
  return {
    ...actual,
    getSurveyByToken: vi.fn(),
    saveSurveyResponse: vi.fn(),
    checkIpRateLimit: vi.fn(),
    recordIpAttempt: vi.fn(),
  };
});

// Visitante sin sesión, como quien abre el link del correo.
const publicCaller = () =>
  appRouter.createCaller({
    user: null,
    req: { protocol: 'https', headers: { 'x-forwarded-for': '1.2.3.4' }, socket: { remoteAddress: '1.2.3.4' } } as unknown as TrpcContext['req'],
    res: {} as TrpcContext['res'],
  });

const row = { id: 1, eventId: 7, buyerName: 'Camila Rojas', respondedAt: null, rating: null, eventTitle: 'Halloween', eventDate: new Date('2026-10-30T22:00:00Z') };

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(db.checkIpRateLimit).mockResolvedValue(true);
  vi.mocked(db.getSurveyByToken).mockResolvedValue(row as any);
  vi.mocked(db.saveSurveyResponse).mockResolvedValue(true);
});

describe('survey.get (público)', () => {
  it('devuelve solo lo que la página necesita: nunca el correo ni el apellido', async () => {
    const r = await publicCaller().survey.get({ token: 'abcdefgh12345678' });
    expect(r).toEqual({ eventTitle: 'Halloween', eventDate: row.eventDate, firstName: 'Camila', answered: false });
  });

  it('un token que no existe da NOT_FOUND', async () => {
    vi.mocked(db.getSurveyByToken).mockResolvedValue(undefined);
    await expect(publicCaller().survey.get({ token: 'abcdefgh12345678' })).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('avisa si ya respondió', async () => {
    vi.mocked(db.getSurveyByToken).mockResolvedValue({ ...row, respondedAt: new Date() } as any);
    expect((await publicCaller().survey.get({ token: 'abcdefgh12345678' })).answered).toBe(true);
  });
});

describe('survey.submit (público)', () => {
  const input = { token: 'abcdefgh12345678', rating: 5, liked: ' la música ', improve: '' };

  it('guarda la respuesta limpia', async () => {
    const r = await publicCaller().survey.submit(input);
    expect(r).toEqual({ saved: true, alreadyAnswered: false });
    expect(db.saveSurveyResponse).toHaveBeenCalledWith('abcdefgh12345678', { rating: 5, liked: 'la música', improve: '' });
  });

  it('no deja responder dos veces con el mismo link', async () => {
    vi.mocked(db.saveSurveyResponse).mockResolvedValue(false);
    expect(await publicCaller().survey.submit(input)).toEqual({ saved: false, alreadyAnswered: true });
  });

  it('rechaza una nota fuera de 1 a 5 sin llegar a guardar', async () => {
    await expect(publicCaller().survey.submit({ ...input, rating: 7 })).rejects.toThrow();
    await expect(publicCaller().survey.submit({ ...input, rating: 0 })).rejects.toThrow();
    expect(db.saveSurveyResponse).not.toHaveBeenCalled();
  });

  it('un token inventado da NOT_FOUND y no guarda nada', async () => {
    vi.mocked(db.getSurveyByToken).mockResolvedValue(undefined);
    await expect(publicCaller().survey.submit(input)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(db.saveSurveyResponse).not.toHaveBeenCalled();
  });

  it('frena a una IP que se pasa de intentos', async () => {
    vi.mocked(db.checkIpRateLimit).mockResolvedValue(false);
    await expect(publicCaller().survey.submit(input)).rejects.toMatchObject({ code: 'TOO_MANY_REQUESTS' });
    expect(db.saveSurveyResponse).not.toHaveBeenCalled();
  });
});

describe('eventSurvey (admin)', () => {
  it('sin sesión de admin no se ve ni se manda nada', async () => {
    const caller = publicCaller();
    await expect(caller.eventSurvey.panel({ eventId: 7 })).rejects.toThrow();
    await expect(caller.eventSurvey.sendNow({ eventId: 7 })).rejects.toThrow();
    await expect(caller.eventSurvey.setAuto({ eventId: 7, enabled: true })).rejects.toThrow();
    await expect(caller.eventSurvey.analyze({ eventId: 7 })).rejects.toThrow();
  });
});
