import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as db from './db';
import { runAgentAutoResume } from './agentAutoResume';
import { PERSONAL_HANDOFF_REASON } from '../shared/instagramAgentConfig';

vi.mock('./db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./db')>();
  return {
    ...actual, getSiteSettings: vi.fn(), updateSiteSettings: vi.fn(), resumeStaleIgThreads: vi.fn(), resumeStaleWaThreads: vi.fn(), resumeAllIgThreads: vi.fn(),
  };
});
const getSiteSettingsMock = vi.mocked(db.getSiteSettings);
const updateSettingsMock = vi.mocked(db.updateSiteSettings);
const resumeIgMock = vi.mocked(db.resumeStaleIgThreads);
const resumeWaMock = vi.mocked(db.resumeStaleWaThreads);
const resumeAllMock = vi.mocked(db.resumeAllIgThreads);

describe('runAgentAutoResume', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resumeIgMock.mockResolvedValue(2);
    resumeWaMock.mockResolvedValue(1);
    resumeAllMock.mockResolvedValue(9);
  });

  // Pedido del dueño (21/10): 3 horas, y solo las cuentas de confianza quedan sin IA.
  it('reactiva los hilos pausados hace más de 3 horas por defecto, sin tocar las cuentas de confianza', async () => {
    getSiteSettingsMock.mockResolvedValueOnce({ instagramAgentConfig: { autoResumeMigrated: true, noAiAccounts: ['amiga.uno'] } } as any);
    const now = new Date('2026-10-21T12:00:00Z');

    const result = await runAgentAutoResume(now);

    expect(result).toEqual({ instagram: 2, whatsapp: 1 });
    expect(resumeIgMock).toHaveBeenCalledWith(new Date('2026-10-21T09:00:00Z'), null, ['amiga.uno']);
    expect(resumeWaMock).toHaveBeenCalledWith(new Date('2026-10-21T09:00:00Z'), PERSONAL_HANDOFF_REASON);
  });

  it('respeta las horas configuradas', async () => {
    getSiteSettingsMock.mockResolvedValueOnce({ instagramAgentConfig: { autoResumeMigrated: true, autoResumeHours: 6 } } as any);
    await runAgentAutoResume(new Date('2026-10-21T12:00:00Z'));
    expect(resumeIgMock).toHaveBeenCalledWith(new Date('2026-10-21T06:00:00Z'), null, []);
  });

  it('con 0 horas no reactiva nada', async () => {
    getSiteSettingsMock.mockResolvedValueOnce({ instagramAgentConfig: { autoResumeMigrated: true, autoResumeHours: 0 } } as any);
    const result = await runAgentAutoResume();
    expect(result).toEqual({ instagram: 0, whatsapp: 0 });
    expect(resumeIgMock).not.toHaveBeenCalled();
  });

  it('la primera vez deja 3 horas, reactiva todas las conversaciones (menos las de confianza) y no se repite', async () => {
    getSiteSettingsMock.mockResolvedValueOnce({ instagramAgentConfig: { autoResumeHours: 24, noAiAccounts: ['amiga.uno'] } } as any);
    const result = await runAgentAutoResume(new Date('2026-10-21T12:00:00Z'));
    expect(result.instagram).toBe(9);
    expect(resumeAllMock).toHaveBeenCalledWith(['amiga.uno']);
    expect(updateSettingsMock).toHaveBeenCalledWith({ instagramAgentConfig: expect.objectContaining({ autoResumeHours: 3, autoResumeMigrated: true, noAiAccounts: ['amiga.uno'] }) });
    expect(resumeIgMock).not.toHaveBeenCalled();
  });
});
