import { beforeEach, describe, expect, it, vi } from 'vitest';
import { invokeLLM } from './_core/llm';
import * as db from './db';
import * as whatsappSend from './whatsappSend';
import { handleInboundMessage, handleOwnerAppEcho, isSimpleGreeting, parseInbound, type WaInboundMessage } from './whatsapp';
import { buildButtonsPayload, buildListPayload, buildCtaUrlPayload } from './whatsappSend';
import { runInstagramAgent, sanitizeButtons } from './instagramAgent';

vi.mock('./_core/llm', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./_core/llm')>();
  return { ...actual, invokeLLM: vi.fn() };
});
const invokeLLMMock = vi.mocked(invokeLLM);

vi.mock('./db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./db')>();
  return {
    ...actual,
    getHomeEvents: vi.fn(),
    getTicketTypesByEventId: vi.fn(),
    getSiteSettings: vi.fn(),
    getOrCreateWaThread: vi.fn(),
    appendWaMessage: vi.fn(),
    getWaMessages: vi.fn(),
    setWaThreadBotPaused: vi.fn(),
    countWaBotRepliesSince: vi.fn(),
  };
});
const getHomeEventsMock = vi.mocked(db.getHomeEvents);
const getTicketTypesMock = vi.mocked(db.getTicketTypesByEventId);
const getSiteSettingsMock = vi.mocked(db.getSiteSettings);
const getOrCreateWaThreadMock = vi.mocked(db.getOrCreateWaThread);
const appendWaMessageMock = vi.mocked(db.appendWaMessage);
const getWaMessagesMock = vi.mocked(db.getWaMessages);
const setWaThreadBotPausedMock = vi.mocked(db.setWaThreadBotPaused);
const countWaBotRepliesSinceMock = vi.mocked(db.countWaBotRepliesSince);

vi.mock('./whatsappSend', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./whatsappSend')>();
  return { ...actual, sendWhatsAppPayload: vi.fn(), markReadWithTyping: vi.fn() };
});
const sendPayloadMock = vi.mocked(whatsappSend.sendWhatsAppPayload);

vi.mock('./push', () => ({ sendPushToAdmins: vi.fn() }));

function mockLlmJson(payload: unknown) {
  invokeLLMMock.mockResolvedValueOnce({
    choices: [{ message: { content: JSON.stringify(payload) } }],
  } as any);
}

const NOW_EVENTS = [
  { id: 1, title: 'Aniversario', slug: 'aniversario', status: 'published', eventDate: new Date('2099-10-10T23:00:00Z'), venue: 'Viña del Mar' },
  { id: 2, title: 'Halloween', slug: 'halloween', status: 'published', eventDate: new Date('2099-10-31T23:00:00Z') },
];

function thread(overrides: Record<string, unknown> = {}) {
  return { id: 7, waId: '56911111111', profileName: 'Cami', botPaused: 0, lastMessageAt: new Date(), lastInboundAt: new Date(), ...overrides } as any;
}

function textMessage(body: string, id = 'wamid.IN1'): WaInboundMessage {
  return { from: '56911111111', id, type: 'text', text: { body } };
}

function tapMessage(replyId: string, title: string): WaInboundMessage {
  return { from: '56911111111', id: 'wamid.TAP', type: 'interactive', interactive: { type: 'button_reply', button_reply: { id: replyId, title } } };
}

function lastPayload(): any {
  return sendPayloadMock.mock.calls.at(-1)?.[0];
}

beforeEach(() => {
  vi.clearAllMocks();
  getSiteSettingsMock.mockResolvedValue({ whatsappAgentConfig: { enabled: true }, instagramAgentConfig: {} } as any);
  getOrCreateWaThreadMock.mockResolvedValue(thread());
  appendWaMessageMock.mockImplementation(async (input: any) => ({ id: input.direction === 'in' ? 100 : 101, ...input }));
  getWaMessagesMock.mockResolvedValue([]);
  countWaBotRepliesSinceMock.mockResolvedValue(0);
  sendPayloadMock.mockResolvedValue({ wamid: 'wamid.OUT' });
  getHomeEventsMock.mockResolvedValue(NOW_EVENTS as any);
  getTicketTypesMock.mockResolvedValue([
    { name: 'Dúo', category: 'acceso', status: 'active', price: '45000', totalStock: 50, soldCount: 45, poolRemaining: 5 },
    { name: 'Pisco sour', category: 'consumo', status: 'active', price: '5000', totalStock: 100, soldCount: 0, poolRemaining: null },
  ] as any);
});

describe('armado de payloads (topes de Meta)', () => {
  it('deja como mucho 3 botones de hasta 20 caracteres, sin repetidos', () => {
    const payload = buildButtonsPayload('569', 'hola', [
      { id: 'a', title: 'Una opción con un título larguísimo' },
      { id: 'b', title: 'Dos' },
      { id: 'c', title: 'dos' },
      { id: 'd', title: 'Tres' },
      { id: 'e', title: 'Cuatro' },
    ]);
    const buttons = payload.interactive.action.buttons;
    expect(buttons).toHaveLength(3);
    for (const b of buttons) expect(Array.from(b.reply.title).length).toBeLessThanOrEqual(20);
    expect(buttons.map((b) => b.reply.title)).toEqual([expect.any(String), 'Dos', 'Tres']);
  });

  it('corta la lista a 10 filas con títulos de hasta 24 caracteres', () => {
    const rows = Array.from({ length: 12 }, (_, i) => ({ id: `r${i}`, title: `Fiesta número ${i} con nombre largo`, description: 'x' }));
    const payload = buildListPayload('569', 'elige', 'Ver fechas', 'Próximas fechas', rows);
    const out = payload.interactive.action.sections[0].rows;
    expect(out).toHaveLength(10);
    for (const r of out) expect(Array.from(r.title).length).toBeLessThanOrEqual(24);
  });

  it('arma el botón con link', () => {
    const payload = buildCtaUrlPayload('569', 'texto', 'Comprar entrada', 'https://x.cl/eventos/a');
    expect(payload.interactive.type).toBe('cta_url');
    expect(payload.interactive.action.parameters).toEqual({ display_text: 'Comprar entrada', url: 'https://x.cl/eventos/a' });
  });
});

describe('sanitizeButtons', () => {
  it('ignora lo que no es texto, recorta y deja máximo 3', () => {
    expect(sanitizeButtons(['Solo/a', 3, '', 'En pareja', 'En grupo', 'Otro'])).toEqual(['Solo/a', 'En pareja', 'En grupo']);
    expect(sanitizeButtons('no es array')).toEqual([]);
  });
});

describe('parseInbound / isSimpleGreeting', () => {
  it('lee el id y el título de un botón tocado', () => {
    expect(parseInbound(tapMessage('menu:fechas', 'Próximas fechas'))).toEqual({ text: 'Próximas fechas', replyId: 'menu:fechas', hasMedia: false });
  });

  it('marca un audio como adjunto sin texto', () => {
    expect(parseInbound({ type: 'audio', id: 'x', from: '1' })).toEqual({ text: '', replyId: null, hasMedia: true });
  });

  it('reconoce saludos sueltos y no preguntas reales', () => {
    for (const s of ['hola', 'Holaaa!!', 'buenas tardes', 'wena', 'Hola, qué tal']) expect(isSimpleGreeting(s)).toBe(true);
    for (const s of ['hola cuánto vale la entrada', 'cuando es la fiesta']) expect(isSimpleGreeting(s)).toBe(false);
  });
});

describe('handleInboundMessage', () => {
  it('con el agente apagado guarda el mensaje pero no contesta', async () => {
    getSiteSettingsMock.mockResolvedValue({ whatsappAgentConfig: { enabled: false } } as any);
    await handleInboundMessage(textMessage('hola cuánto vale'));
    expect(appendWaMessageMock).toHaveBeenCalledTimes(1);
    expect(sendPayloadMock).not.toHaveBeenCalled();
  });

  it('no contesta dos veces un reintento de Meta', async () => {
    appendWaMessageMock.mockResolvedValueOnce(null);
    await handleInboundMessage(textMessage('hola cuánto vale'));
    expect(sendPayloadMock).not.toHaveBeenCalled();
    expect(invokeLLMMock).not.toHaveBeenCalled();
  });

  it('un saludo en un hilo nuevo recibe el menú de bienvenida sin pasar por la IA', async () => {
    getOrCreateWaThreadMock.mockResolvedValue(thread({ lastMessageAt: null }));
    await handleInboundMessage(textMessage('holaa'));
    expect(invokeLLMMock).not.toHaveBeenCalled();
    const titles = lastPayload().interactive.action.buttons.map((b: any) => b.reply.title);
    expect(titles).toEqual(['Próximas fechas', 'Precios', 'Hablar con alguien']);
  });

  it('"Próximas fechas" manda la lista de eventos desde la base, sin IA', async () => {
    await handleInboundMessage(tapMessage('menu:fechas', 'Próximas fechas'));
    expect(invokeLLMMock).not.toHaveBeenCalled();
    const payload = lastPayload();
    expect(payload.interactive.type).toBe('list');
    expect(payload.interactive.action.sections[0].rows.map((r: any) => r.id)).toEqual(['event:aniversario', 'event:halloween']);
  });

  it('elegir una fecha manda precios con semáforo (nunca el remanente) y el botón de compra', async () => {
    await handleInboundMessage({
      from: '56911111111', id: 'wamid.L', type: 'interactive',
      interactive: { type: 'list_reply', list_reply: { id: 'event:aniversario', title: 'Aniversario' } },
    });
    const payload = lastPayload();
    expect(payload.interactive.type).toBe('cta_url');
    expect(payload.interactive.body.text).toContain('$45.000');
    expect(payload.interactive.body.text).toContain('quedan pocas');
    expect(payload.interactive.body.text).not.toMatch(/\b5\b/);
    expect(payload.interactive.body.text).not.toContain('Pisco');
    expect(payload.interactive.action.parameters.url).toMatch(/\/eventos\/aniversario$/);
  });

  it('"Hablar con alguien" deriva y pausa el bot', async () => {
    await handleInboundMessage(tapMessage('menu:humano', 'Hablar con alguien'));
    expect(invokeLLMMock).not.toHaveBeenCalled();
    expect(setWaThreadBotPausedMock).toHaveBeenCalledWith(7, true, expect.any(String));
    expect(lastPayload().type).toBe('text');
  });

  it('una pregunta abierta va al agente en modo WhatsApp y manda sus botones sugeridos', async () => {
    mockLlmJson({ reply: '¿Vienes solo/a, en pareja o en grupo?', handoff: false, handoffReason: '', isPersonal: false, isThanks: false, buttons: ['Solo/a', 'En pareja', 'En grupo'], action: 'none' });
    await handleInboundMessage(textMessage('cuánto vale la entrada?'));
    const call = invokeLLMMock.mock.calls[0][0] as any;
    expect(call.responseFormat.json_schema.name).toBe('respuesta_whatsapp');
    expect(call.messages.at(-1).content).toContain('llegar por WhatsApp');
    const payload = lastPayload();
    expect(payload.interactive.type).toBe('button');
    expect(payload.interactive.action.buttons.map((b: any) => b.reply.title)).toEqual(['Solo/a', 'En pareja', 'En grupo']);
  });

  it('action buy_link agrega el botón "Comprar entrada" del próximo evento', async () => {
    mockLlmJson({ reply: '¡Buenísimo! Acá la compras 💜', handoff: false, handoffReason: '', isPersonal: false, isThanks: false, buttons: [], action: 'buy_link' });
    await handleInboundMessage(textMessage('quiero ir, cómo compro?'));
    const payload = lastPayload();
    expect(payload.interactive.type).toBe('cta_url');
    expect(payload.interactive.action.parameters.url).toMatch(/\/eventos\/aniversario$/);
  });

  it('si la IA se cae, contesta el mensaje de derivación y pausa', async () => {
    invokeLLMMock.mockRejectedValueOnce(new Error('caída'));
    await handleInboundMessage(textMessage('tengo un problema con mi entrada'));
    expect(lastPayload().type).toBe('text');
    expect(setWaThreadBotPausedMock).toHaveBeenCalledWith(7, true, 'La IA no pudo responder');
  });

  it('un hilo pausado no recibe respuesta automática', async () => {
    getOrCreateWaThreadMock.mockResolvedValue(thread({ botPaused: 1 }));
    await handleInboundMessage(textMessage('hola?'));
    expect(sendPayloadMock).not.toHaveBeenCalled();
  });

  it('un audio sin texto queda para una persona sin mandar nada', async () => {
    await handleInboundMessage({ from: '56911111111', id: 'wamid.A', type: 'audio', audio: { id: 'm1' } });
    expect(sendPayloadMock).not.toHaveBeenCalled();
    expect(setWaThreadBotPausedMock).toHaveBeenCalledWith(7, true, expect.stringContaining('adjunto'));
  });

  it('si Meta rechaza el envío, no lo guarda como enviado y pausa el hilo', async () => {
    sendPayloadMock.mockRejectedValueOnce(new Error('token vencido'));
    await handleInboundMessage(tapMessage('menu:fechas', 'Próximas fechas'));
    expect(appendWaMessageMock).toHaveBeenCalledTimes(1); // solo el entrante
    expect(setWaThreadBotPausedMock).toHaveBeenCalledWith(7, true, expect.stringContaining('Falló el envío'));
  });
});

describe('handleOwnerAppEcho (coexistencia)', () => {
  it('lo que escribe el dueño desde la app pausa el bot en ese hilo', async () => {
    await handleOwnerAppEcho({ from: '56900000000', to: '56911111111', id: 'wamid.ECHO', type: 'text', text: { body: 'hola! te respondo yo' } });
    expect(appendWaMessageMock).toHaveBeenCalledWith(expect.objectContaining({ source: 'owner_app', direction: 'out' }));
    expect(setWaThreadBotPausedMock).toHaveBeenCalledWith(7, true, expect.stringContaining('app de WhatsApp'));
  });

  it('el eco de un mensaje que mandamos nosotros por la API no pausa nada', async () => {
    appendWaMessageMock.mockResolvedValueOnce(null);
    await handleOwnerAppEcho({ to: '56911111111', id: 'wamid.OUT', type: 'text', text: { body: 'respuesta del bot' } });
    expect(setWaThreadBotPausedMock).not.toHaveBeenCalled();
  });
});

describe('runInstagramAgent por canal', () => {
  // Instagram no tiene respuestas rápidas de texto como WhatsApp (buttons
  // siempre vacío), pero sí soporta un botón real de "Comprar" -- por eso
  // `action: 'buy_link'` SÍ pasa para este canal (ver server/instagram.ts,
  // botón "Comprar entrada" vía Button Template).
  it('en Instagram nunca devuelve botones de texto, pero sí puede pedir el botón de compra', async () => {
    mockLlmJson({ reply: 'hola', handoff: false, handoffReason: '', isPersonal: false, isThanks: false, buttons: ['a'], action: 'buy_link' });
    const result = await runInstagramAgent({ incomingText: 'hola', history: [], config: {} });
    expect(result.buttons).toEqual([]);
    expect(result.action).toBe('buy_link');
    const call = invokeLLMMock.mock.calls[0][0] as any;
    expect(call.responseFormat.json_schema.name).toBe('respuesta_instagram_v2');
  });

  it('en Instagram fuerza action a "none" si el modelo pide "event_list" (no soportado en ese canal)', async () => {
    mockLlmJson({ reply: 'hola', handoff: false, handoffReason: '', isPersonal: false, isThanks: false, action: 'event_list' });
    const result = await runInstagramAgent({ incomingText: 'hola', history: [], config: {} });
    expect(result.action).toBe('none');
  });
});
