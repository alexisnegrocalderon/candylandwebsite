import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as db from './db';
import * as instagramSend from './instagramSend';
import { runInstagramFollowUps } from './instagramFollowUp';

vi.mock('./db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./db')>();
  return {
    ...actual,
    getSiteSettings: vi.fn(),
    getIgThreadsAwaitingFollowUp: vi.fn(),
    markIgThreadFollowUpSent: vi.fn(),
    appendIgMessage: vi.fn(),
  };
});
const getSiteSettingsMock = vi.mocked(db.getSiteSettings);
const getIgThreadsAwaitingFollowUpMock = vi.mocked(db.getIgThreadsAwaitingFollowUp);
const markIgThreadFollowUpSentMock = vi.mocked(db.markIgThreadFollowUpSent);
const appendIgMessageMock = vi.mocked(db.appendIgMessage);

vi.mock('./instagramSend', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./instagramSend')>();
  return { ...actual, sendInstagramMessage: vi.fn(), canReplyWithinWindow: vi.fn() };
});
const sendInstagramMessageMock = vi.mocked(instagramSend.sendInstagramMessage);
const canReplyWithinWindowMock = vi.mocked(instagramSend.canReplyWithinWindow);

const baseThread = {
  id: 1,
  igUserId: 'ig-user-1',
  username: 'camila',
  lastInboundAt: new Date('2026-09-17T10:00:00Z'),
};

function configWith(overrides: Record<string, unknown> = {}) {
  return { instagramAgentConfig: { enabled: true, followUpEnabled: true, followUpMinutes: 120, followUpMessage: 'Cuando quieras retomamos 💜', ...overrides } };
}

describe('runInstagramFollowUps', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    canReplyWithinWindowMock.mockReturnValue(true);
  });

  it('no hace nada si el agente principal está apagado', async () => {
    getSiteSettingsMock.mockResolvedValueOnce(configWith({ enabled: false }) as any);

    const result = await runInstagramFollowUps();

    expect(getIgThreadsAwaitingFollowUpMock).not.toHaveBeenCalled();
    expect(result).toEqual({ sent: 0, skipped: 0, failed: 0 });
  });

  it('no hace nada si el recordatorio está apagado aunque el agente esté prendido', async () => {
    getSiteSettingsMock.mockResolvedValueOnce(configWith({ followUpEnabled: false }) as any);

    const result = await runInstagramFollowUps();

    expect(getIgThreadsAwaitingFollowUpMock).not.toHaveBeenCalled();
    expect(result).toEqual({ sent: 0, skipped: 0, failed: 0 });
  });

  it('manda el mensaje fijo, lo guarda en el hilo y marca el hilo como atendido', async () => {
    getSiteSettingsMock.mockResolvedValueOnce(configWith() as any);
    getIgThreadsAwaitingFollowUpMock.mockResolvedValueOnce([baseThread] as any);
    sendInstagramMessageMock.mockResolvedValueOnce({ mid: 'mid-1' } as any);

    const result = await runInstagramFollowUps();

    expect(sendInstagramMessageMock).toHaveBeenCalledWith({ recipientId: 'ig-user-1', text: 'Cuando quieras retomamos 💜' });
    expect(appendIgMessageMock).toHaveBeenCalledWith({ threadId: 1, mid: 'mid-1', direction: 'out', source: 'bot', text: 'Cuando quieras retomamos 💜' });
    expect(markIgThreadFollowUpSentMock).toHaveBeenCalledWith(1);
    expect(result).toEqual({ sent: 1, skipped: 0, failed: 0 });
  });

  it('pasa la ventana de 24h configurada: cutoff = ahora - followUpMinutes', async () => {
    const now = new Date('2026-09-17T15:00:00Z');
    getSiteSettingsMock.mockResolvedValueOnce(configWith({ followUpMinutes: 90 }) as any);
    getIgThreadsAwaitingFollowUpMock.mockResolvedValueOnce([]);

    await runInstagramFollowUps(now);

    const cutoffArg = getIgThreadsAwaitingFollowUpMock.mock.calls[0][0] as Date;
    expect(cutoffArg.toISOString()).toBe('2026-09-17T13:30:00.000Z');
  });

  // Fuera de la ventana de 24h de Meta el envío se rechazaría igual -- se
  // marca como atendido para no reintentar por siempre, pero sin mandar nada.
  it('si ya se cerró la ventana de 24h de Meta, marca el hilo sin mandar nada', async () => {
    getSiteSettingsMock.mockResolvedValueOnce(configWith() as any);
    getIgThreadsAwaitingFollowUpMock.mockResolvedValueOnce([baseThread] as any);
    canReplyWithinWindowMock.mockReturnValueOnce(false);

    const result = await runInstagramFollowUps();

    expect(sendInstagramMessageMock).not.toHaveBeenCalled();
    expect(markIgThreadFollowUpSentMock).toHaveBeenCalledWith(1);
    expect(result).toEqual({ sent: 0, skipped: 1, failed: 0 });
  });

  it('un fallo en un hilo no corta el resto de la tanda', async () => {
    getSiteSettingsMock.mockResolvedValueOnce(configWith() as any);
    getIgThreadsAwaitingFollowUpMock.mockResolvedValueOnce([
      { ...baseThread, id: 1, igUserId: 'ig-user-1' },
      { ...baseThread, id: 2, igUserId: 'ig-user-2' },
    ] as any);
    sendInstagramMessageMock.mockRejectedValueOnce(new Error('token vencido')).mockResolvedValueOnce({ mid: 'mid-2' } as any);

    const result = await runInstagramFollowUps();

    expect(result).toEqual({ sent: 1, skipped: 0, failed: 1 });
    expect(markIgThreadFollowUpSentMock).toHaveBeenCalledTimes(1);
    expect(markIgThreadFollowUpSentMock).toHaveBeenCalledWith(2);
  });
});
