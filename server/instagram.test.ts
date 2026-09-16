import crypto from 'crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { invokeLLM } from './_core/llm';
import * as db from './db';
import { verifyMetaSignature, humanReplyDelayMs } from './instagram';
import { canReplyWithinWindow } from './instagramSend';
import { buildInstagramContext, runInstagramAgent } from './instagramAgent';
import { normalizeInstagramAgentConfig, IG_MAX_REPLY_CHARS } from '../shared/instagramAgentConfig';

vi.mock('./_core/llm', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./_core/llm')>();
  return { ...actual, invokeLLM: vi.fn() };
});
const invokeLLMMock = vi.mocked(invokeLLM);

vi.mock('./db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./db')>();
  return { ...actual, getHomeEvents: vi.fn(), getTicketTypesByEventId: vi.fn() };
});
const getHomeEventsMock = vi.mocked(db.getHomeEvents);
const getTicketTypesMock = vi.mocked(db.getTicketTypesByEventId);

function mockLlmJson(payload: unknown) {
  invokeLLMMock.mockResolvedValueOnce({
    choices: [{ message: { content: JSON.stringify(payload) } }],
  } as any);
}

describe('verifyMetaSignature', () => {
  const secret = 'app-secret-de-prueba';
  const body = Buffer.from('{"object":"instagram"}');
  const valid = 'sha256=' + crypto.createHmac('sha256', secret).update(body).digest('hex');

  it('acepta la firma que calcula Meta con el mismo secreto', () => {
    expect(verifyMetaSignature(body, valid, secret)).toBe(true);
  });

  it('rechaza una firma calculada con otro secreto', () => {
    const otra = 'sha256=' + crypto.createHmac('sha256', 'otro').update(body).digest('hex');
    expect(verifyMetaSignature(body, otra, secret)).toBe(false);
  });

  it('rechaza si el cuerpo cambió aunque sea un byte', () => {
    expect(verifyMetaSignature(Buffer.from('{"object":"instagrom"}'), valid, secret)).toBe(false);
  });

  it('rechaza cuando no viene la cabecera o falta el secreto', () => {
    expect(verifyMetaSignature(body, undefined, secret)).toBe(false);
    expect(verifyMetaSignature(body, valid, '')).toBe(false);
  });

  // Una firma más corta hacía explotar `timingSafeEqual` (exige buffers del
  // mismo largo) y el throw dejaba el webhook devolviendo 500 en vez de 403.
  it('rechaza una firma de largo distinto sin lanzar', () => {
    expect(() => verifyMetaSignature(body, 'sha256=abc', secret)).not.toThrow();
    expect(verifyMetaSignature(body, 'sha256=abc', secret)).toBe(false);
  });
});

describe('canReplyWithinWindow', () => {
  const now = new Date('2026-09-13T12:00:00Z');

  it('permite responder dentro de las 24 horas', () => {
    expect(canReplyWithinWindow(new Date('2026-09-13T00:00:00Z'), now)).toBe(true);
  });

  it('no permite responder pasadas las 24 horas', () => {
    expect(canReplyWithinWindow(new Date('2026-09-12T11:00:00Z'), now)).toBe(false);
  });

  it('no permite responder a un hilo sin mensajes entrantes', () => {
    expect(canReplyWithinWindow(null, now)).toBe(false);
  });
});

describe('humanReplyDelayMs', () => {
  // Rango acotado a propósito (ver comentario en instagram.ts): unos
  // segundos, no los 20-30s que hubiera sido lo ideal, porque el webhook
  // tiene que confirmarle a Meta antes de que se arriesgue a reintentar la
  // entrega.
  it('devuelve un valor entre 3 y 8 segundos', () => {
    for (let i = 0; i < 50; i++) {
      const ms = humanReplyDelayMs();
      expect(ms).toBeGreaterThanOrEqual(3000);
      expect(ms).toBeLessThan(8000);
    }
  });
});

describe('buildInstagramContext', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('arma el bloque con fecha, precio y link de compra del próximo evento', async () => {
    getHomeEventsMock.mockResolvedValueOnce([
      { id: 1, title: 'Aniversario', slug: 'aniversario', status: 'published', eventDate: new Date('2026-10-10T23:00:00Z'), venue: 'Viña del Mar' },
    ] as any);
    getTicketTypesMock.mockResolvedValueOnce([
      { name: 'Dúo', category: 'acceso', status: 'active', price: '45000', totalStock: 50, soldCount: 5, poolRemaining: null },
    ] as any);

    const context = await buildInstagramContext(new Date('2026-09-13T12:00:00Z'));
    expect(context).toContain('Aniversario');
    expect(context).toContain('$45.000');
    expect(context).toContain('/eventos/aniversario');
  });

  // La regla del sitio (ver attachStockPoolInfo en server/db.ts) es que el
  // remanente exacto de un cupo nunca se muestra de cara al público. Si el
  // número llegara al prompt, el modelo podría repetirlo en un DM.
  it('nunca le pasa a la IA el número exacto de entradas que quedan', async () => {
    getHomeEventsMock.mockResolvedValueOnce([
      { id: 1, title: 'Aniversario', slug: 'aniversario', status: 'published', eventDate: new Date('2026-10-10T23:00:00Z') },
    ] as any);
    getTicketTypesMock.mockResolvedValueOnce([
      { name: 'Founders', category: 'acceso', status: 'active', price: '30000', totalStock: 40, soldCount: 33, poolRemaining: 7 },
    ] as any);

    const context = await buildInstagramContext(new Date('2026-09-13T12:00:00Z'));
    expect(context).toContain('quedan pocas');
    expect(context).not.toContain('7 entradas');
    expect(context).not.toMatch(/quedan\s+7/);
  });

  it('marca como agotada la entrada sin stock', async () => {
    getHomeEventsMock.mockResolvedValueOnce([
      { id: 1, title: 'Aniversario', slug: 'aniversario', status: 'published', eventDate: new Date('2026-10-10T23:00:00Z') },
    ] as any);
    getTicketTypesMock.mockResolvedValueOnce([
      { name: 'Soltera', category: 'acceso', status: 'active', price: '25000', totalStock: 10, soldCount: 10, poolRemaining: null },
    ] as any);

    const context = await buildInstagramContext(new Date('2026-09-13T12:00:00Z'));
    expect(context).toContain('AGOTADA');
  });

  // La Carta de la fiesta (tragos, guardarropía, merch) se vende solo en
  // /caja: no existe de cara al público y no debe llegar a un DM.
  it('deja fuera la carta de la fiesta y los tipos ocultos', async () => {
    getHomeEventsMock.mockResolvedValueOnce([
      { id: 1, title: 'Aniversario', slug: 'aniversario', status: 'published', eventDate: new Date('2026-10-10T23:00:00Z') },
    ] as any);
    getTicketTypesMock.mockResolvedValueOnce([
      { name: 'Pisco sour', category: 'consumo', status: 'active', price: '5000', totalStock: 100, soldCount: 0, poolRemaining: null },
      { name: 'Acceso secreto', category: 'acceso', status: 'hidden', price: '1000', totalStock: 5, soldCount: 0, poolRemaining: null },
    ] as any);

    const context = await buildInstagramContext(new Date('2026-09-13T12:00:00Z'));
    expect(context).not.toContain('Pisco sour');
    expect(context).not.toContain('Acceso secreto');
  });

  // Lo que pidió el dueño: que la IA pueda explicar que el precio sube en la
  // próxima tanda y cuándo, sin decir nunca el remanente exacto del cupo.
  it('avisa el precio de la próxima tanda y su fecha tope sin decir el remanente', async () => {
    getHomeEventsMock.mockResolvedValueOnce([
      {
        id: 1, title: 'Aniversario', slug: 'aniversario', status: 'published',
        eventDate: new Date('2026-10-10T23:00:00Z'),
        tandaDiscountSchedule: [{ percent: 60, untilDate: '2026-09-30T23:59:00Z' }, { percent: 50 }],
        tandaPhaseIndex: 0,
      },
    ] as any);
    getTicketTypesMock.mockResolvedValueOnce([
      { name: 'Soltera', category: 'acceso', status: 'active', price: '10000', originalPrice: '25000', totalStock: 50, soldCount: 5, poolRemaining: null },
    ] as any);

    const context = await buildInstagramContext(new Date('2026-09-13T12:00:00Z'));
    expect(context).toContain('sube a $13.000 en la próxima tanda');
    expect(context).toContain('30 de septiembre');
    expect(context).not.toMatch(/quedan\s+\d/);
  });

  it('no menciona la próxima tanda si ya está en la última fase de la escala', async () => {
    getHomeEventsMock.mockResolvedValueOnce([
      {
        id: 1, title: 'Aniversario', slug: 'aniversario', status: 'published',
        eventDate: new Date('2026-10-10T23:00:00Z'),
        tandaDiscountSchedule: [{ percent: 0 }],
        tandaPhaseIndex: 0,
      },
    ] as any);
    getTicketTypesMock.mockResolvedValueOnce([
      { name: 'General', category: 'acceso', status: 'active', price: '25000', originalPrice: '25000', totalStock: 50, soldCount: 5, poolRemaining: null },
    ] as any);

    const context = await buildInstagramContext(new Date('2026-09-13T12:00:00Z'));
    expect(context).not.toContain('próxima tanda');
  });

  // Bug real: el agente le dijo a alguien que el disfraz era opcional. La
  // única fuente válida de este dato es EVENT_BRAND.dressCode (shared/
  // eventBrand.ts) -- misma que ya usan el FAQ del sitio y los correos.
  it('incluye el dress code real de la marca en el bloque de datos', async () => {
    getHomeEventsMock.mockResolvedValueOnce([
      { id: 1, title: 'Aniversario', slug: 'aniversario', status: 'published', eventDate: new Date('2026-10-10T23:00:00Z') },
    ] as any);
    getTicketTypesMock.mockResolvedValueOnce([] as any);

    const context = await buildInstagramContext(new Date('2026-09-13T12:00:00Z'));
    expect(context).toContain('DRESS CODE');
    expect(context).toContain('Disfraz obligatorio');
  });

  it('avisa que no hay fecha anunciada cuando no hay eventos futuros', async () => {
    getHomeEventsMock.mockResolvedValueOnce([
      { id: 1, title: 'Vieja', slug: 'vieja', status: 'past', eventDate: new Date('2025-01-01T00:00:00Z') },
    ] as any);

    const context = await buildInstagramContext(new Date('2026-09-13T12:00:00Z'));
    expect(context).toContain('todavía no está anunciada');
    expect(getTicketTypesMock).not.toHaveBeenCalled();
  });
});

describe('runInstagramAgent', () => {
  const config = { enabled: true, brandNotes: 'notas', handoffMessage: 'Lo ve el equipo', historyLimit: 10, dailyReplyLimitPerThread: 30 };

  beforeEach(() => {
    vi.clearAllMocks();
    getHomeEventsMock.mockResolvedValue([] as any);
  });

  it('devuelve la respuesta y la decisión de derivar que da la IA', async () => {
    mockLlmJson({ reply: 'La entrada vale $45.000 💜', handoff: false, handoffReason: '' });
    const result = await runInstagramAgent({ incomingText: '¿cuánto vale?', history: [], config });
    expect(result.reply).toContain('$45.000');
    expect(result.handoff).toBe(false);
  });

  it('recorta una respuesta más larga de lo que conviene mandar por DM', async () => {
    mockLlmJson({ reply: 'a'.repeat(IG_MAX_REPLY_CHARS + 200), handoff: false, handoffReason: '' });
    const result = await runInstagramAgent({ incomingText: 'hola', history: [], config });
    expect(result.reply.length).toBe(IG_MAX_REPLY_CHARS);
  });

  // Lo importante no es que falle: es que la persona reciba algo y que el
  // hilo quede marcado para una persona en vez de morir en silencio.
  it('deriva a una persona cuando la IA se cae', async () => {
    invokeLLMMock.mockRejectedValueOnce(new Error('502 del proveedor'));
    const result = await runInstagramAgent({ incomingText: 'hola', history: [], config });
    expect(result.reply).toBe('Lo ve el equipo');
    expect(result.handoff).toBe(true);
  });

  it('deriva a una persona cuando la IA devuelve algo que no es JSON', async () => {
    invokeLLMMock.mockResolvedValueOnce({ choices: [{ message: { content: 'claro que sí!' } }] } as any);
    const result = await runInstagramAgent({ incomingText: 'hola', history: [], config });
    expect(result.handoff).toBe(true);
  });

  it('deriva cuando la IA devuelve una respuesta vacía', async () => {
    mockLlmJson({ reply: '   ', handoff: false, handoffReason: '' });
    const result = await runInstagramAgent({ incomingText: 'hola', history: [], config });
    expect(result.reply).toBe('Lo ve el equipo');
    expect(result.handoff).toBe(true);
  });

  // Un amigo compartiendo un meme o hablando de algo personal no es una
  // consulta de cliente: no debe mandarse ningún mensaje automático, así que
  // una respuesta vacía con isPersonal=true no cae en el fallback de derivar
  // con el mensaje de "lo ve el equipo".
  it('marca isPersonal y no cae al fallback cuando la respuesta viene vacía a propósito', async () => {
    mockLlmJson({ reply: '', handoff: true, handoffReason: 'Es un mensaje personal', isPersonal: true });
    const result = await runInstagramAgent({ incomingText: 'jajaja mira este reel', history: [], config });
    expect(result.isPersonal).toBe(true);
    expect(result.reply).toBe('');
  });

  // Lo que pidió el dueño: para temas que ya tienen página propia en el
  // sitio, el agente debe poder linkear a la info completa en vez de
  // explicarlo todo en el DM -- el system prompt tiene que traer esos links
  // reales, no inventados.
  it('el system prompt trae los links reales de las páginas del sitio', async () => {
    mockLlmJson({ reply: 'ok', handoff: false, handoffReason: '' });
    await runInstagramAgent({ incomingText: 'qué es la tarjeta playcard?', history: [], config });
    const systemPrompt = invokeLLMMock.mock.calls[0][0].messages[0].content;
    expect(systemPrompt).toContain('https://mansionplayroom.cl/blog/tarjeta-playcard');
    expect(systemPrompt).toContain('https://mansionplayroom.cl/blog/dress-code-explicado');
  });

  // Lo que pidió el dueño: no mandar el link de contenido/blog de entrada --
  // primero dar la info real y preguntar si quiere el link, para que se
  // sienta más conversación que "aquí está, chao". El link de compra del
  // evento (otra regla, ya probada arriba) no se toca.
  it('el system prompt pide preguntar antes de mandar un link de contenido', async () => {
    mockLlmJson({ reply: 'ok', handoff: false, handoffReason: '' });
    await runInstagramAgent({ incomingText: 'qué es la tarjeta playcard?', history: [], config });
    const systemPrompt = invokeLLMMock.mock.calls[0][0].messages[0].content;
    expect(systemPrompt).toContain('¿te paso el link con todo el detalle?');
    expect(systemPrompt).toContain('NO incluyas el link en esa primera respuesta');
  });

  // Pedido del dueño: si esta va a ser la última respuesta automática del
  // día para el hilo (tope diario), el agente tiene que cerrar la
  // conversación en ese mismo mensaje -- mandando el link aunque normalmente
  // hubiera preguntado antes -- en vez de dejarla picada hasta mañana.
  it('el system prompt pide cerrar la conversación cuando es la última respuesta del día', async () => {
    mockLlmJson({ reply: 'ok', handoff: false, handoffReason: '' });
    await runInstagramAgent({ incomingText: 'cuéntame del próximo evento', history: [], config, isFinalReplyOfDay: true });
    const systemPrompt = invokeLLMMock.mock.calls[0][0].messages[0].content;
    expect(systemPrompt).toContain('ÚLTIMA RESPUESTA DEL DÍA');
    expect(systemPrompt).toContain('tope diario');
  });

  it('el system prompt NO trae la instrucción de cierre en una respuesta normal', async () => {
    mockLlmJson({ reply: 'ok', handoff: false, handoffReason: '' });
    await runInstagramAgent({ incomingText: 'hola', history: [], config });
    const systemPrompt = invokeLLMMock.mock.calls[0][0].messages[0].content;
    expect(systemPrompt).not.toContain('ÚLTIMA RESPUESTA DEL DÍA');
  });

  // Lo que reportó el dueño con una captura real: ante una pregunta de puro
  // interés/curiosidad (no una intención real de comprar), el agente no debe
  // mandar el link de compra de una -- tiene que preguntar primero, mismo
  // criterio ya usado para los links de blog. La intención real sigue
  // mandando el link altiro, sin preguntar.
  it('el system prompt distingue curiosidad general de intención real de compra', async () => {
    mockLlmJson({ reply: 'ok', handoff: false, handoffReason: '' });
    await runInstagramAgent({ incomingText: 'cuéntame del próximo evento', history: [], config });
    const systemPrompt = invokeLLMMock.mock.calls[0][0].messages[0].content;
    expect(systemPrompt).toContain('CURIOSIDAD o interés general');
    expect(systemPrompt).toContain('intención REAL de ir o comprar');
    expect(systemPrompt).toContain('¿te tinca venir?');
  });

  // Bug real reportado por el dueño: un "hola" solo no recibía respuesta,
  // porque el prompt lo trataba como personal de entrada (nada de pregunta
  // de fiesta = señal de personal). Ahora un saludo ambiguo tiene que
  // contestarse siempre con un saludo + pregunta abierta, nunca en silencio.
  it('el system prompt trae la excepción de saludo ambiguo (no marcarlo personal de entrada)', async () => {
    mockLlmJson({ reply: 'ok', handoff: false, handoffReason: '' });
    await runInstagramAgent({ incomingText: 'hola', history: [], config });
    const systemPrompt = invokeLLMMock.mock.calls[0][0].messages[0].content;
    expect(systemPrompt).toContain('EXCEPCIÓN importante');
    expect(systemPrompt).toContain('NO marques isPersonal=true de entrada');
  });

  // Bug real reportado por el dueño: el agente contestó que el disfraz era
  // opcional cuando es obligatorio -- porque el dato nunca llegaba al
  // contexto. Tiene que estar siempre disponible, haya o no evento anunciado.
  it('el bloque de datos incluye el dress code real de la marca aunque no haya evento anunciado', async () => {
    mockLlmJson({ reply: 'ok', handoff: false, handoffReason: '' });
    await runInstagramAgent({ incomingText: '¿el disfraz es obligatorio?', history: [], config });
    const userMessage = invokeLLMMock.mock.calls[0][0].messages.at(-1).content;
    expect(userMessage).toContain('DRESS CODE');
    expect(userMessage).toContain('Disfraz obligatorio');
  });

  // Campo nuevo editable desde el admin -- si el dueño no pegó ejemplos, el
  // bloque ni aparece (no hay que inventarle ejemplos de tono a nadie).
  it('agrega los ejemplos de tono del dueño al prompt solo cuando los cargó', async () => {
    mockLlmJson({ reply: 'ok', handoff: false, handoffReason: '' });
    await runInstagramAgent({
      incomingText: 'hola',
      history: [],
      config: { ...config, styleExamples: 'hola! sí, el disfraz es obligatorio pero no tiene que ser producido jaja' },
    });
    const systemPrompt = invokeLLMMock.mock.calls[0][0].messages[0].content;
    expect(systemPrompt).toContain('EJEMPLOS DE CÓMO ESCRIBE EL DUEÑO');
    expect(systemPrompt).toContain('no tiene que ser producido jaja');

    vi.clearAllMocks();
    getHomeEventsMock.mockResolvedValue([] as any);
    mockLlmJson({ reply: 'ok', handoff: false, handoffReason: '' });
    await runInstagramAgent({ incomingText: 'hola', history: [], config });
    const systemPromptSinEjemplos = invokeLLMMock.mock.calls[0][0].messages[0].content;
    expect(systemPromptSinEjemplos).not.toContain('EJEMPLOS DE CÓMO ESCRIBE EL DUEÑO');
  });

  it('respeta el tope de historial configurado y manda los mensajes como turnos', async () => {
    mockLlmJson({ reply: 'ok', handoff: false, handoffReason: '' });
    const history = Array.from({ length: 20 }, (_, i) => ({
      id: i, direction: i % 2 === 0 ? 'in' : 'out', source: i % 2 === 0 ? 'user' : 'bot', text: `mensaje ${i}`,
    })) as any;

    await runInstagramAgent({ incomingText: 'hola', history, config: { ...config, historyLimit: 4 } });

    const messages = invokeLLMMock.mock.calls[0][0].messages;
    // 1 system + 4 de historial + 1 con el mensaje que acaba de llegar.
    expect(messages).toHaveLength(6);
    expect(messages[1].role).toBe('user');
    expect(messages[2].role).toBe('assistant');
  });
});

describe('normalizeInstagramAgentConfig', () => {
  it('arranca apagado cuando no hay nada guardado', () => {
    expect(normalizeInstagramAgentConfig(null).enabled).toBe(false);
    expect(normalizeInstagramAgentConfig(undefined).enabled).toBe(false);
    expect(normalizeInstagramAgentConfig({}).enabled).toBe(false);
  });

  it('solo prende con un true real, no con cualquier valor verdadero', () => {
    expect(normalizeInstagramAgentConfig({ enabled: 'si' }).enabled).toBe(false);
    expect(normalizeInstagramAgentConfig({ enabled: true }).enabled).toBe(true);
  });

  it('completa los textos faltantes con los valores por defecto', () => {
    const config = normalizeInstagramAgentConfig({ enabled: true, brandNotes: '  ' });
    expect(config.brandNotes.length).toBeGreaterThan(0);
    expect(config.handoffMessage.length).toBeGreaterThan(0);
  });

  it('acota los límites numéricos a un rango razonable', () => {
    expect(normalizeInstagramAgentConfig({ historyLimit: 500 }).historyLimit).toBe(40);
    expect(normalizeInstagramAgentConfig({ historyLimit: 0 }).historyLimit).toBeGreaterThan(0);
    expect(normalizeInstagramAgentConfig({ dailyReplyLimitPerThread: 9999 }).dailyReplyLimitPerThread).toBe(200);
  });

  it('arranca sin ejemplos de tono, y respeta los que sí se guardaron', () => {
    expect(normalizeInstagramAgentConfig({}).styleExamples).toBe('');
    expect(normalizeInstagramAgentConfig({ styleExamples: 'hola así hablo yo' }).styleExamples).toBe('hola así hablo yo');
  });
});
