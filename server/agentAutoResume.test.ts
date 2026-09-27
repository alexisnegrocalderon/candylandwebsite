import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as db from './db';
import { runAgentAutoResume } from './agentAutoResume';
import { PERSONAL_HANDOFF_REASON } from '../shared/instagramAgentConfig';

vi.mock('./db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./db')>();
  return { ...actual, getSiteSettings: vi.fn(), resumeStaleIgThreads: vi.fn(), resumeStaleWaThreads: vi.fn() };
});
const getSiteSettingsMock = vi.mocked(db.getSiteSettings);
const resumeIgMock = vi.mocked(db.resumeStaleIgThreads);
const resumeWaMock = vi.mocked(db.resumeStaleWaThreads);

describe('runAgentAutoResume', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resumeIgMock.mockResolvedValue(2);
    resumeWaMock.mockResolvedValue(1);
  });

  // Pedido del dueño (27/09): un chat pausado vuelve solo a tener agente
  // 24 horas después de la pausa (o de su último mensaje a mano).
  it('reactiva los hilos pausados hace más de 24 horas por defecto, sin tocar los personales', async () => {
    getSiteSettingsMock.mockResolvedValueOnce({ instagramAgentConfig: {} } as any);
    const now = new Date('2026-09-27T12:00:00Z');

    const result = await runAgentAutoResume(now);

    expect(result).toEqual({ instagram: 2, whatsapp: 1 });
    expect(resumeIgMock).toHaveBeenCalledWith(new Date('2026-09-26T12:00:00Z'), PERSONAL_HANDOFF_REASON);
    expect(resumeWaMock).toHaveBeenCalledWith(new Date('2026-09-26T12:00:00Z'), PERSONAL_HANDOFF_REASON);
  });

  it('respeta las horas configuradas', async () => {
    getSiteSettingsMock.mockResolvedValueOnce({ instagramAgentConfig: { autoResumeHours: 6 } } as any);
    await runAgentAutoResume(new Date('2026-09-27T12:00:00Z'));
    expect(resumeIgMock).toHaveBeenCalledWith(new Date('2026-09-27T06:00:00Z'), PERSONAL_HANDOFF_REASON);
  });

  it('con 0 horas no reactiva nada', async () => {
    getSiteSettingsMock.mockResolvedValueOnce({ instagramAgentConfig: { autoResumeHours: 0 } } as any);
    const result = await runAgentAutoResume();
    expect(result).toEqual({ instagram: 0, whatsapp: 0 });
    expect(resumeIgMock).not.toHaveBeenCalled();
  });
});
