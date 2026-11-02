import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as db from './db';
import * as instagramSend from './instagramSend';
import * as instagramInteractive from './instagramInteractive';
import * as instagramAgent from './instagramAgent';
import * as draftModule from './instagramFollowUpDraft';
import { runInstagramFollowUps } from './instagramFollowUp';

vi.mock('./db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./db')>();
  return {
    ...actual,
    getSiteSettings: vi.fn(),
    getIgThreadsForFollowUp: vi.fn(),
    getIgFollowUpStates: vi.fn(),
    getIgThreadLastClicks: vi.fn(),
    getEventBuyerCandidates: vi.fn(),
    getIgMessages: vi.fn(),
    markIgThreadFollowUpSent: vi.fn(),
    saveIgFollowUp: vi.fn(),
    stopIgFollowUps: vi.fn(),
    appendIgMessage: vi.fn(),
  };
});
const getSiteSettingsMock = vi.mocked(db.getSiteSettings);
const getThreadsMock = vi.mocked(db.getIgThreadsForFollowUp);
const getStatesMock = vi.mocked(db.getIgFollowUpStates);
const getClicksMock = vi.mocked(db.getIgThreadLastClicks);
const getBuyersMock = vi.mocked(db.getEventBuyerCandidates);
const getMessagesMock = vi.mocked(db.getIgMessages);
const markSentMock = vi.mocked(db.markIgThreadFollowUpSent);
const saveFollowUpMock = vi.mocked(db.saveIgFollowUp);
const stopMock = vi.mocked(db.stopIgFollowUps);
const appendIgMessageMock = vi.mocked(db.appendIgMessage);

vi.mock('./instagramSend', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./instagramSend')>();
  return { ...actual, sendInstagramMessage: vi.fn(), sendButtonMessage: vi.fn(), canReplyWithinWindow: vi.fn() };
});
const sendInstagramMessageMock = vi.mocked(instagramSend.sendInstagramMessage);
const sendButtonMessageMock = vi.mocked(instagramSend.sendButtonMessage);
const canReplyWithinWindowMock = vi.mocked(instagramSend.canReplyWithinWindow);

vi.mock('./instagramInteractive', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./instagramInteractive')>();
  return { ...actual, resolveInstagramBuyLink: vi.fn() };
});
const resolveBuyLinkMock = vi.mocked(instagramInteractive.resolveInstagramBuyLink);

vi.mock('./instagramAgent', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./instagramAgent')>();
  return { ...actual, getUpcomingPublicEvents: vi.fn() };
});
const upcomingMock = vi.mocked(instagramAgent.getUpcomingPublicEvents);

vi.mock('./instagramFollowUpDraft', () => ({ draftFollowUp: vi.fn() }));
const draftMock = vi.mocked(draftModule.draftFollowUp);

const now = new Date('2026-11-02T20:00:00Z');
const ago = (ms: number) => new Date(now.getTime() - ms);
const H = 60 * 60 * 1000;
const M = 60 * 1000;

function thread(over: Record<string, unknown> = {}) {
  return { id: 1, igUserId: 'ig-user-1', username: 'camila', customerNotes: null, closingMessageSentAt: null, lastInboundAt: ago(2 * H), lastMessageAt: ago(45 * M), ...over };
}
function row(over: Record<string, unknown> = {}, lastFromBot = true) {
  return { thread: thread(over), lastFromBot };
}
function configWith(overrides: Record<string, unknown> = {}) {
  return { instagramAgentConfig: { enabled: true, followUpEnabled: true, followUpMinutes: 30, followUp2Hours: 20, followUpPersonalized: false, followUpMessage: 'Cuando quieras retomamos 💜', ...overrides } };
}

describe('runInstagramFollowUps', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    canReplyWithinWindowMock.mockReturnValue(true);
    getStatesMock.mockResolvedValue(new Map());
    getClicksMock.mockResolvedValue(new Map());
    getBuyersMock.mockResolvedValue([]);
    upcomingMock.mockResolvedValue([{ id: 7, slug: 'aniversario' }] as any);
    getMessagesMock.mockResolvedValue([{ direction: 'in', text: 'hola cuánto vale?' }, { direction: 'out', text: 'Desde $10.000 💜' }] as any);
    saveFollowUpMock.mockResolvedValue(true);
    resolveBuyLinkMock.mockResolvedValue(null);
    sendInstagramMessageMock.mockResolvedValue({ mid: 'mid-1' } as any);
    sendButtonMessageMock.mockResolvedValue({ mid: 'mid-2' } as any);
  });

  it('no hace nada si el agente principal está apagado', async () => {
    getSiteSettingsMock.mockResolvedValueOnce(configWith({ enabled: false }) as any);
    expect(await runInstagramFollowUps(now)).toEqual({ sent: 0, skipped: 0, failed: 0 });
    expect(getThreadsMock).not.toHaveBeenCalled();
  });

  it('no hace nada si los seguimientos están apagados aunque el agente esté prendido', async () => {
    getSiteSettingsMock.mockResolvedValueOnce(configWith({ followUpEnabled: false }) as any);
    expect(await runInstagramFollowUps(now)).toEqual({ sent: 0, skipped: 0, failed: 0 });
    expect(getThreadsMock).not.toHaveBeenCalled();
  });

  it('sin IA manda el mensaje fijo, lo guarda y registra el seguimiento 1', async () => {
    getSiteSettingsMock.mockResolvedValueOnce(configWith() as any);
    getThreadsMock.mockResolvedValueOnce([row()] as any);
    const result = await runInstagramFollowUps(now);
    expect(sendInstagramMessageMock).toHaveBeenCalledWith({ recipientId: 'ig-user-1', text: 'Cuando quieras retomamos 💜' });
    expect(appendIgMessageMock).toHaveBeenCalledWith({ threadId: 1, mid: 'mid-1', direction: 'out', source: 'bot', text: 'Cuando quieras retomamos 💜' });
    expect(markSentMock).toHaveBeenCalledWith(1);
    expect(saveFollowUpMock).toHaveBeenCalledWith(1, 1, now);
    expect(result).toEqual({ sent: 1, skipped: 0, failed: 0 });
  });

  it('no escribe si todavía no pasó el tiempo de silencio o si el último mensaje no fue del bot', async () => {
    getSiteSettingsMock.mockResolvedValueOnce(configWith() as any);
    getThreadsMock.mockResolvedValueOnce([row({ lastMessageAt: ago(10 * M) }), row({ id: 2 }, false)] as any);
    expect(await runInstagramFollowUps(now)).toEqual({ sent: 0, skipped: 0, failed: 0 });
    expect(sendInstagramMessageMock).not.toHaveBeenCalled();
  });

  it('sin IA, el segundo seguimiento no sale (solo el primero tiene mensaje fijo)', async () => {
    getSiteSettingsMock.mockResolvedValueOnce(configWith() as any);
    getThreadsMock.mockResolvedValueOnce([row({ lastInboundAt: ago(21 * H), lastMessageAt: ago(15 * H) })] as any);
    getStatesMock.mockResolvedValueOnce(new Map([[1, { stage: 1, lastSentAt: ago(15 * H), stoppedAt: null }]]));
    const result = await runInstagramFollowUps(now);
    expect(sendInstagramMessageMock).not.toHaveBeenCalled();
    expect(result).toEqual({ sent: 0, skipped: 1, failed: 0 });
  });

  it('personalizado: la IA redacta, el botón lleva su acceso y pasa por el contador de clics', async () => {
    getSiteSettingsMock.mockResolvedValueOnce(configWith({ followUpPersonalized: true }) as any);
    getThreadsMock.mockResolvedValueOnce([row({ customerNotes: 'viene en pareja' })] as any);
    draftMock.mockResolvedValueOnce({ action: 'send', message: '¡Hola! ¿Pudiste ver lo del Dúo? 💜', accessOption: 'pareja', quantity: 1 });
    resolveBuyLinkMock.mockResolvedValueOnce({ url: 'https://mansionplayroom.cl/checkout/aniversario?rapida=1&op=pareja&utm_campaign=agente-recordatorio', eventTitle: 'X', imageUrl: '', buttonTitle: 'Comprar Dúo 🔥', accessLabel: 'Dúo' });
    await runInstagramFollowUps(now);
    expect(draftMock).toHaveBeenCalledWith(expect.objectContaining({ stage: 1, variant: 'silence', customerNotes: 'viene en pareja' }));
    expect(resolveBuyLinkMock).toHaveBeenCalledWith(now, 'agente-recordatorio', undefined, { key: 'pareja', quantity: 1 });
    expect(sendInstagramMessageMock).toHaveBeenCalledWith({ recipientId: 'ig-user-1', text: '¡Hola! ¿Pudiste ver lo del Dúo? 💜' });
    const button = sendButtonMessageMock.mock.calls[0][2] as { title: string; url: string };
    expect(button.title).toBe('Comprar Dúo 🔥');
    expect(button.url).toContain('/api/go?o=agente-recordatorio&t=1&to=');
  });

  it('tocó el botón y no compró: usa la variante «clic»', async () => {
    getSiteSettingsMock.mockResolvedValueOnce(configWith({ followUpPersonalized: true }) as any);
    getThreadsMock.mockResolvedValueOnce([row({ lastMessageAt: ago(5 * M) })] as any);
    getClicksMock.mockResolvedValueOnce(new Map([[1, ago(25 * M)]]));
    draftMock.mockResolvedValueOnce({ action: 'send', message: '¿Pudiste entrar? 💜', accessOption: '', quantity: 1 });
    await runInstagramFollowUps(now);
    expect(draftMock).toHaveBeenCalledWith(expect.objectContaining({ variant: 'click' }));
  });

  it('si la IA decide no escribir, el hilo queda detenido y no se manda nada', async () => {
    getSiteSettingsMock.mockResolvedValueOnce(configWith({ followUpPersonalized: true }) as any);
    getThreadsMock.mockResolvedValueOnce([row()] as any);
    draftMock.mockResolvedValueOnce({ action: 'stop' });
    const result = await runInstagramFollowUps(now);
    expect(sendInstagramMessageMock).not.toHaveBeenCalled();
    expect(stopMock).toHaveBeenCalledWith(1);
    expect(result).toEqual({ sent: 0, skipped: 1, failed: 0 });
  });

  it('si la IA falla, el primer seguimiento cae al mensaje fijo', async () => {
    getSiteSettingsMock.mockResolvedValueOnce(configWith({ followUpPersonalized: true }) as any);
    getThreadsMock.mockResolvedValueOnce([row()] as any);
    draftMock.mockResolvedValueOnce(null);
    await runInstagramFollowUps(now);
    expect(sendInstagramMessageMock).toHaveBeenCalledWith({ recipientId: 'ig-user-1', text: 'Cuando quieras retomamos 💜' });
  });

  it('no insiste a quien ya compró (su @ está entre los compradores)', async () => {
    getSiteSettingsMock.mockResolvedValueOnce(configWith() as any);
    getThreadsMock.mockResolvedValueOnce([row()] as any);
    getBuyersMock.mockResolvedValueOnce([{ instagram: '@Camila' }] as any);
    const result = await runInstagramFollowUps(now);
    expect(sendInstagramMessageMock).not.toHaveBeenCalled();
    expect(stopMock).toHaveBeenCalledWith(1);
    expect(result.skipped).toBe(1);
  });

  it('no insiste a quien dijo que no le interesa', async () => {
    getSiteSettingsMock.mockResolvedValueOnce(configWith() as any);
    getThreadsMock.mockResolvedValueOnce([row()] as any);
    getMessagesMock.mockResolvedValueOnce([{ direction: 'in', text: 'no gracias, no me interesa' }] as any);
    await runInstagramFollowUps(now);
    expect(sendInstagramMessageMock).not.toHaveBeenCalled();
    expect(stopMock).toHaveBeenCalledWith(1);
  });

  // Fuera de la ventana de 24h de Meta el envío se rechazaría igual -- se
  // marca como atendido para no reintentar por siempre, pero sin mandar nada.
  it('si ya se cerró la ventana de 24h de Meta, marca el hilo sin mandar nada', async () => {
    getSiteSettingsMock.mockResolvedValueOnce(configWith() as any);
    getThreadsMock.mockResolvedValueOnce([row()] as any);
    canReplyWithinWindowMock.mockReturnValueOnce(false);
    const result = await runInstagramFollowUps(now);
    expect(sendInstagramMessageMock).not.toHaveBeenCalled();
    expect(markSentMock).toHaveBeenCalledWith(1);
    expect(result).toEqual({ sent: 0, skipped: 1, failed: 0 });
  });

  // Regla del dueño (27/09): nunca una URL a la vista.
  it('el mensaje fijo sale sin URL y con el botón de compra', async () => {
    getSiteSettingsMock.mockResolvedValueOnce(configWith({ followUpMessage: 'Cuando quieras retomamos 💜 mira fechas en mansionplayroom.cl/entradas' }) as any);
    getThreadsMock.mockResolvedValueOnce([row()] as any);
    resolveBuyLinkMock.mockResolvedValueOnce({ url: 'https://mansionplayroom.cl/eventos/x?utm_campaign=agente-recordatorio', eventTitle: 'X', imageUrl: '', buttonTitle: 'Comprar entrada 🔥', accessLabel: null });
    await runInstagramFollowUps(now);
    expect(sendInstagramMessageMock.mock.calls[0][0].text).not.toContain('mansionplayroom');
    const button = sendButtonMessageMock.mock.calls[0][2] as { title: string };
    expect(button.title).toBe('Ver fechas y entradas');
  });

  it('un fallo en un hilo no corta el resto de la tanda', async () => {
    getSiteSettingsMock.mockResolvedValueOnce(configWith() as any);
    getThreadsMock.mockResolvedValueOnce([row({ id: 1 }), row({ id: 2, igUserId: 'ig-user-2' })] as any);
    sendInstagramMessageMock.mockReset();
    sendInstagramMessageMock.mockRejectedValueOnce(new Error('token vencido')).mockResolvedValueOnce({ mid: 'mid-2' } as any);
    const result = await runInstagramFollowUps(now);
    expect(result).toEqual({ sent: 1, skipped: 0, failed: 1 });
    expect(markSentMock).toHaveBeenCalledTimes(1);
    expect(markSentMock).toHaveBeenCalledWith(2);
  });
});
