import crypto from 'crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { invokeLLM } from './_core/llm';
import * as db from './db';
import * as instagramSend from './instagramSend';
import { verifyMetaSignature, humanReplyDelayMs, sendManualInstagramReply, handleOwnerEcho, tryHandleKeywordTrigger, handleCommentChange } from './instagram';
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
  return {
    ...actual,
    getHomeEvents: vi.fn(),
    getTicketTypesByEventId: vi.fn(),
    appendIgMessage: vi.fn(),
    setIgThreadBotPaused: vi.fn(),
    getOrCreateIgThread: vi.fn(),
    findMatchingIgKeywordAutomation: vi.fn(),
    hasRedeemedIgKeywordAutomation: vi.fn(),
    recordIgKeywordRedemption: vi.fn(),
    getDiscountCodeByCode: vi.fn(),
    getTicketTypeById: vi.fn(),
    getFeaturedEvent: vi.fn(),
  };
});
const getHomeEventsMock = vi.mocked(db.getHomeEvents);
const getTicketTypesMock = vi.mocked(db.getTicketTypesByEventId);
const appendIgMessageMock = vi.mocked(db.appendIgMessage);
const setIgThreadBotPausedMock = vi.mocked(db.setIgThreadBotPaused);
const getOrCreateIgThreadMock = vi.mocked(db.getOrCreateIgThread);
const findMatchingIgKeywordAutomationMock = vi.mocked(db.findMatchingIgKeywordAutomation);
const hasRedeemedIgKeywordAutomationMock = vi.mocked(db.hasRedeemedIgKeywordAutomation);
const recordIgKeywordRedemptionMock = vi.mocked(db.recordIgKeywordRedemption);
const getDiscountCodeByCodeMock = vi.mocked(db.getDiscountCodeByCode);
const getTicketTypeByIdMock = vi.mocked(db.getTicketTypeById);
const getFeaturedEventMock = vi.mocked(db.getFeaturedEvent);

vi.mock('./instagramSend', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./instagramSend')>();
  return { ...actual, sendInstagramMessage: vi.fn(), sendPrivateReply: vi.fn(), sendButtonMessage: vi.fn(), sendImageMessage: vi.fn() };
});
const sendInstagramMessageMock = vi.mocked(instagramSend.sendInstagramMessage);
const sendPrivateReplyMock = vi.mocked(instagramSend.sendPrivateReply);
const sendButtonMessageMock = vi.mocked(instagramSend.sendButtonMessage);
const sendImageMessageMock = vi.mocked(instagramSend.sendImageMessage);

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

describe('sendManualInstagramReply', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  // Pedido del dueño: si él toma el control y contesta a mano desde la
  // bandeja, el bot no debe seguir contestando solo en ese hilo.
  it('pausa el bot automáticamente después de mandar una respuesta a mano', async () => {
    sendInstagramMessageMock.mockResolvedValueOnce({ mid: 'mid-123' } as any);
    appendIgMessageMock.mockResolvedValueOnce({ id: 1 } as any);

    await sendManualInstagramReply({
      threadId: 42,
      igUserId: 'ig-user-1',
      lastInboundAt: new Date(),
      text: 'lo veo yo, dame un segundo',
    });

    expect(setIgThreadBotPausedMock).toHaveBeenCalledWith(42, true, 'El dueño tomó la conversación a mano');
  });

  it('no manda ni pausa nada si ya pasaron las 24 horas de la ventana', async () => {
    await expect(sendManualInstagramReply({
      threadId: 42,
      igUserId: 'ig-user-1',
      lastInboundAt: new Date('2020-01-01T00:00:00Z'),
      text: 'hola',
    })).rejects.toThrow();

    expect(sendInstagramMessageMock).not.toHaveBeenCalled();
    expect(setIgThreadBotPausedMock).not.toHaveBeenCalled();
  });
});

describe('handleOwnerEcho', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  // Lo importante que pidió el dueño: él habla con los clientes directo
  // desde SU app de Instagram (no desde el panel). Ese mensaje le llega al
  // webhook como "eco" -- antes se ignoraba entero; ahora tiene que
  // guardarse y pausar el bot para que no le conteste encima.
  it('guarda el mensaje y pausa el bot cuando el dueño escribe directo desde Instagram', async () => {
    getOrCreateIgThreadMock.mockResolvedValueOnce({ id: 7 } as any);
    appendIgMessageMock.mockResolvedValueOnce({ id: 99 } as any);

    await handleOwnerEcho(
      { sender: { id: 'ig-cuenta-productora' }, recipient: { id: 'ig-user-cliente' } } as any,
      { mid: 'mid-nuevo', text: 'hola! sí, disfraz es obligatorio' } as any,
    );

    expect(getOrCreateIgThreadMock).toHaveBeenCalledWith({ igUserId: 'ig-user-cliente' });
    expect(appendIgMessageMock).toHaveBeenCalledWith({
      threadId: 7,
      mid: 'mid-nuevo',
      direction: 'out',
      source: 'admin',
      text: 'hola! sí, disfraz es obligatorio',
    });
    expect(setIgThreadBotPausedMock).toHaveBeenCalledWith(7, true, 'El dueño contestó directo desde Instagram');
  });

  // El eco de un mensaje que YA mandamos nosotros (el agente, o una
  // respuesta manual del panel) también llega por acá -- appendIgMessage ya
  // lo descarta por el mid duplicado (mismo mecanismo que evita procesar dos
  // veces un reintento de Meta), así que no hay que pausar de nuevo por eso.
  it('no hace nada si el eco es de un mensaje que ya habíamos guardado nosotros', async () => {
    getOrCreateIgThreadMock.mockResolvedValueOnce({ id: 7 } as any);
    appendIgMessageMock.mockResolvedValueOnce(null); // mid duplicado

    await handleOwnerEcho(
      { sender: { id: 'ig-cuenta-productora' }, recipient: { id: 'ig-user-cliente' } } as any,
      { mid: 'mid-ya-guardado', text: 'la Soltera está en $10.000' } as any,
    );

    expect(setIgThreadBotPausedMock).not.toHaveBeenCalled();
  });

  it('no hace nada con un adjunto suelto sin texto', async () => {
    await handleOwnerEcho(
      { sender: { id: 'ig-cuenta-productora' }, recipient: { id: 'ig-user-cliente' } } as any,
      { mid: 'mid-1', text: '' } as any,
    );

    expect(getOrCreateIgThreadMock).not.toHaveBeenCalled();
    expect(setIgThreadBotPausedMock).not.toHaveBeenCalled();
  });

  it('no hace nada si no viene el recipient (dato raro de Meta)', async () => {
    await handleOwnerEcho(
      { sender: { id: 'ig-cuenta-productora' } } as any,
      { mid: 'mid-1', text: 'hola' } as any,
    );

    expect(getOrCreateIgThreadMock).not.toHaveBeenCalled();
  });
});

describe('tryHandleKeywordTrigger', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  // Caso principal que pidió el dueño: responder a una historia con la
  // palabra clave manda el regalo configurado (acá, con código) y avisa que
  // ya se manejó, para que no corra además el agente conversacional.
  it('manda el regalo, lo guarda en el hilo y registra la redención', async () => {
    findMatchingIgKeywordAutomationMock.mockResolvedValueOnce({
      id: 5, keyword: 'disfraz', triggerSource: 'story_reply', replyMessage: 'Tu código es {{codigo}} 💜', discountCode: 'AUTOAB12', active: 1, createdAt: new Date(),
    } as any);
    hasRedeemedIgKeywordAutomationMock.mockResolvedValueOnce(false);
    sendInstagramMessageMock.mockResolvedValueOnce({ mid: 'mid-out-1' } as any);

    const handled = await tryHandleKeywordTrigger({ threadId: 7, igUserId: 'ig-user-1', text: 'vengo con disfraz!', source: 'story_reply' });

    expect(handled).toBe(true);
    expect(sendInstagramMessageMock).toHaveBeenCalledWith({ recipientId: 'ig-user-1', text: 'Tu código es AUTOAB12 💜' });
    expect(appendIgMessageMock).toHaveBeenCalledWith({ threadId: 7, mid: 'mid-out-1', direction: 'out', source: 'bot', text: 'Tu código es AUTOAB12 💜' });
    expect(recordIgKeywordRedemptionMock).toHaveBeenCalledWith({ automationId: 5, igUserId: 'ig-user-1', source: 'story_reply' });
  });

  it('no hace nada si el texto no calza con ninguna automatización activa', async () => {
    findMatchingIgKeywordAutomationMock.mockResolvedValueOnce(null);

    const handled = await tryHandleKeywordTrigger({ threadId: 7, igUserId: 'ig-user-1', text: 'hola, cuánto vale?', source: 'story_reply' });

    expect(handled).toBe(false);
    expect(sendInstagramMessageMock).not.toHaveBeenCalled();
  });

  // La misma persona no puede cobrar el regalo dos veces respondiendo la
  // palabra de nuevo -- en ese caso se deja que siga el flujo normal (el
  // agente conversacional de siempre).
  it('no reenvía el regalo si la persona ya lo recibió antes', async () => {
    findMatchingIgKeywordAutomationMock.mockResolvedValueOnce({
      id: 5, keyword: 'disfraz', triggerSource: 'story_reply', replyMessage: 'hola', discountCode: null, active: 1, createdAt: new Date(),
    } as any);
    hasRedeemedIgKeywordAutomationMock.mockResolvedValueOnce(true);

    const handled = await tryHandleKeywordTrigger({ threadId: 7, igUserId: 'ig-user-1', text: 'disfraz de nuevo', source: 'story_reply' });

    expect(handled).toBe(false);
    expect(sendInstagramMessageMock).not.toHaveBeenCalled();
  });

  // Caso "producto de regalo" (pedido del dueño: 1 piscola de regalo): el
  // mensaje reemplaza {{producto}} con el nombre real del producto y
  // {{link}} con el link de compra CON el código pegado, para que se
  // aplique solo al entrar al checkout.
  // El {{link}} ya no se pega como texto -- se saca del mensaje y se manda
  // como un botón real (Button Template de Meta), APARTE del texto -- que
  // se manda como su propia burbuja normal, no encerrado en la tarjeta del
  // botón (pedido del dueño al ver cómo se veía en una captura real).
  it('manda el texto como burbuja normal y {{link}} como botón aparte cuando la automatización regala un producto', async () => {
    findMatchingIgKeywordAutomationMock.mockResolvedValueOnce({
      id: 6, keyword: 'piscola', triggerSource: 'story_reply', replyMessage: 'Tu código {{codigo}} te regala {{producto}} 🍹 Cómpralo acá: {{link}}', discountCode: 'AUTOXY99', active: 1, createdAt: new Date(),
    } as any);
    hasRedeemedIgKeywordAutomationMock.mockResolvedValueOnce(false);
    getFeaturedEventMock.mockResolvedValueOnce({ slug: 'aniversario', imageUrl: 'https://blob.vercel-storage.com/events/flyer.jpg' } as any);
    getDiscountCodeByCodeMock.mockResolvedValueOnce({ giftTicketTypeId: 42 } as any);
    getTicketTypeByIdMock.mockResolvedValueOnce({ id: 42, name: '1 Piscola' } as any);
    sendImageMessageMock.mockResolvedValueOnce({ mid: 'mid-img-1' } as any);
    sendInstagramMessageMock.mockResolvedValueOnce({ mid: 'mid-out-2' } as any);
    sendButtonMessageMock.mockResolvedValueOnce({ mid: 'mid-btn-1' } as any);

    await tryHandleKeywordTrigger({ threadId: 7, igUserId: 'ig-user-1', text: 'quiero mi piscola', source: 'story_reply' });

    // Orden: imagen -> texto normal -> tarjeta del botón.
    expect(sendImageMessageMock).toHaveBeenCalledWith({ id: 'ig-user-1' }, 'https://blob.vercel-storage.com/events/flyer.jpg');
    expect(sendInstagramMessageMock).toHaveBeenCalledWith({ recipientId: 'ig-user-1', text: 'Tu código AUTOXY99 te regala 1 Piscola 🍹 Cómpralo acá:' });
    expect(sendButtonMessageMock).toHaveBeenCalledWith(
      { id: 'ig-user-1' },
      'Toca para continuar 👇',
      { title: 'Comprar con código', url: 'https://mansionplayroom.cl/eventos/aniversario?code=AUTOXY99' },
    );
    expect(appendIgMessageMock).toHaveBeenNthCalledWith(1, { threadId: 7, mid: 'mid-img-1', direction: 'out', source: 'bot', text: '[imagen]' });
    expect(appendIgMessageMock).toHaveBeenNthCalledWith(2, { threadId: 7, mid: 'mid-out-2', direction: 'out', source: 'bot', text: 'Tu código AUTOXY99 te regala 1 Piscola 🍹 Cómpralo acá:' });
    expect(appendIgMessageMock).toHaveBeenNthCalledWith(3, { threadId: 7, mid: 'mid-btn-1', direction: 'out', source: 'bot', text: '[botón] Comprar con código' });
  });

  // Si Meta rechaza la imagen (o cualquier otro error), el regalo real
  // (código/link) tiene que mandarse igual -- la imagen es un extra, nunca
  // debe bloquear el mensaje que la persona sí está esperando.
  it('manda el texto y el botón igual aunque falle el envío de la imagen', async () => {
    findMatchingIgKeywordAutomationMock.mockResolvedValueOnce({
      id: 6, keyword: 'piscola', triggerSource: 'story_reply', replyMessage: 'Cómpralo acá: {{link}}', discountCode: null, active: 1, createdAt: new Date(),
    } as any);
    hasRedeemedIgKeywordAutomationMock.mockResolvedValueOnce(false);
    getFeaturedEventMock.mockResolvedValueOnce({ slug: 'aniversario', imageUrl: null } as any);
    sendImageMessageMock.mockRejectedValueOnce(new Error('Meta rechazó la imagen'));
    sendInstagramMessageMock.mockResolvedValueOnce({ mid: 'mid-out-4' } as any);
    sendButtonMessageMock.mockResolvedValueOnce({ mid: 'mid-btn-2' } as any);

    await tryHandleKeywordTrigger({ threadId: 7, igUserId: 'ig-user-1', text: 'quiero mi piscola', source: 'story_reply' });

    expect(sendInstagramMessageMock).toHaveBeenCalledWith({ recipientId: 'ig-user-1', text: 'Cómpralo acá:' });
    expect(sendButtonMessageMock).toHaveBeenCalledWith(
      { id: 'ig-user-1' },
      'Toca para continuar 👇',
      { title: 'Ver más', url: 'https://mansionplayroom.cl/eventos/aniversario' },
    );
    // Solo se guardan las dos filas reales -- la imagen fallida no deja fila.
    expect(appendIgMessageMock).toHaveBeenCalledTimes(2);
    expect(appendIgMessageMock).toHaveBeenNthCalledWith(1, { threadId: 7, mid: 'mid-out-4', direction: 'out', source: 'bot', text: 'Cómpralo acá:' });
    expect(appendIgMessageMock).toHaveBeenNthCalledWith(2, { threadId: 7, mid: 'mid-btn-2', direction: 'out', source: 'bot', text: '[botón] Ver más' });
  });

  // El tope de 640 caracteres del Button Template ya no limita el texto --
  // ahora va como mensaje normal, sin ese límite (el botón, aparte, nunca
  // lleva el mensaje real).
  it('manda el texto completo como mensaje normal aunque sea largo, sin cortarlo ni pegarle el link', async () => {
    const longMessage = `${'x'.repeat(650)} {{link}}`;
    findMatchingIgKeywordAutomationMock.mockResolvedValueOnce({
      id: 7, keyword: 'largo', triggerSource: 'story_reply', replyMessage: longMessage, discountCode: null, active: 1, createdAt: new Date(),
    } as any);
    hasRedeemedIgKeywordAutomationMock.mockResolvedValueOnce(false);
    getFeaturedEventMock.mockResolvedValueOnce({ slug: 'aniversario', imageUrl: null } as any);
    sendInstagramMessageMock.mockResolvedValueOnce({ mid: 'mid-out-3' } as any);
    sendButtonMessageMock.mockResolvedValueOnce({ mid: 'mid-btn-3' } as any);

    await tryHandleKeywordTrigger({ threadId: 7, igUserId: 'ig-user-1', text: 'largo', source: 'story_reply' });

    expect(sendInstagramMessageMock).toHaveBeenCalledWith({ recipientId: 'ig-user-1', text: 'x'.repeat(650) });
    expect(sendButtonMessageMock).toHaveBeenCalledWith(
      { id: 'ig-user-1' },
      'Toca para continuar 👇',
      { title: 'Ver más', url: 'https://mansionplayroom.cl/eventos/aniversario' },
    );
  });

  it('no manda una burbuja de texto vacía si el mensaje era solo "{{link}}"', async () => {
    findMatchingIgKeywordAutomationMock.mockResolvedValueOnce({
      id: 8, keyword: 'solo-link', triggerSource: 'story_reply', replyMessage: '{{link}}', discountCode: null, active: 1, createdAt: new Date(),
    } as any);
    hasRedeemedIgKeywordAutomationMock.mockResolvedValueOnce(false);
    getFeaturedEventMock.mockResolvedValueOnce({ slug: 'aniversario', imageUrl: null } as any);
    sendButtonMessageMock.mockResolvedValueOnce({ mid: 'mid-btn-4' } as any);

    await tryHandleKeywordTrigger({ threadId: 7, igUserId: 'ig-user-1', text: 'solo-link', source: 'story_reply' });

    expect(sendInstagramMessageMock).not.toHaveBeenCalled();
    expect(sendButtonMessageMock).toHaveBeenCalledWith(
      { id: 'ig-user-1' },
      'Toca para continuar 👇',
      { title: 'Ver más', url: 'https://mansionplayroom.cl/eventos/aniversario' },
    );
    expect(appendIgMessageMock).toHaveBeenCalledTimes(1);
    expect(appendIgMessageMock).toHaveBeenCalledWith({ threadId: 7, mid: 'mid-btn-4', direction: 'out', source: 'bot', text: '[botón] Ver más' });
  });
});

describe('handleCommentChange', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  // El caso "dormido" hasta que Meta apruebe el permiso -- pero el código ya
  // tiene que funcionar de punta a punta cuando llegue un comentario real.
  it('manda una respuesta privada al comentario y registra la redención', async () => {
    findMatchingIgKeywordAutomationMock.mockResolvedValueOnce({
      id: 9, keyword: 'link', triggerSource: 'comment', replyMessage: 'Acá tienes: mansionplayroom.cl/blog', discountCode: null, active: 1, createdAt: new Date(),
    } as any);
    hasRedeemedIgKeywordAutomationMock.mockResolvedValueOnce(false);
    sendPrivateReplyMock.mockResolvedValueOnce({ mid: 'mid-priv-1' } as any);

    await handleCommentChange({ id: 'comment-123', text: 'quiero el link porfa', from: { id: 'ig-user-2', username: 'alguien' } });

    expect(sendPrivateReplyMock).toHaveBeenCalledWith('comment-123', 'Acá tienes: mansionplayroom.cl/blog');
    expect(recordIgKeywordRedemptionMock).toHaveBeenCalledWith({ automationId: 9, igUserId: 'ig-user-2', source: 'comment' });
  });

  it('no hace nada con un comentario sin texto, sin id, o sin autor', async () => {
    await handleCommentChange({ id: 'comment-1', text: '', from: { id: 'ig-user-2' } });
    await handleCommentChange({ id: undefined, text: 'hola', from: { id: 'ig-user-2' } });
    await handleCommentChange({ id: 'comment-1', text: 'hola', from: undefined });

    expect(sendPrivateReplyMock).not.toHaveBeenCalled();
  });

  it('manda la imagen, el texto normal, y el botón aparte cuando el mensaje tiene {{link}}', async () => {
    findMatchingIgKeywordAutomationMock.mockResolvedValueOnce({
      id: 10, keyword: 'promo', triggerSource: 'comment', replyMessage: 'Cómpralo acá: {{link}}', discountCode: null, active: 1, createdAt: new Date(),
    } as any);
    hasRedeemedIgKeywordAutomationMock.mockResolvedValueOnce(false);
    getFeaturedEventMock.mockResolvedValueOnce({ slug: 'aniversario', imageUrl: 'https://blob.vercel-storage.com/events/flyer.jpg' } as any);
    sendImageMessageMock.mockResolvedValueOnce({ mid: 'mid-img-2' } as any);
    sendPrivateReplyMock.mockResolvedValueOnce({ mid: 'mid-out-5' } as any);
    sendButtonMessageMock.mockResolvedValueOnce({ mid: 'mid-btn-5' } as any);

    await handleCommentChange({ id: 'comment-9', text: 'quiero la promo', from: { id: 'ig-user-3' } });

    expect(sendImageMessageMock).toHaveBeenCalledWith({ comment_id: 'comment-9' }, 'https://blob.vercel-storage.com/events/flyer.jpg');
    expect(sendPrivateReplyMock).toHaveBeenCalledWith('comment-9', 'Cómpralo acá:');
    expect(sendButtonMessageMock).toHaveBeenCalledWith(
      { comment_id: 'comment-9' },
      'Toca para continuar 👇',
      { title: 'Ver más', url: 'https://mansionplayroom.cl/eventos/aniversario' },
    );
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

  // Instagram (canal por defecto) también puede pedir el botón de compra --
  // mismo mecanismo que ya usa WhatsApp (`action`), acotado a 'buy_link'.
  it('acepta action: "buy_link" para Instagram, el canal por defecto', async () => {
    mockLlmJson({ reply: '¡Dale! Toca el botón de abajo 💜', handoff: false, handoffReason: '', action: 'buy_link' });
    const result = await runInstagramAgent({ incomingText: 'quiero comprar', history: [], config });
    expect(result.action).toBe('buy_link');
  });

  it('nunca manda action: "event_list" para Instagram, aunque la IA lo pida (no soportado en ese canal)', async () => {
    mockLlmJson({ reply: 'ok', handoff: false, handoffReason: '', action: 'event_list' });
    const result = await runInstagramAgent({ incomingText: 'hola', history: [], config });
    expect(result.action).toBe('none');
  });

  it('fuerza action a "none" en Instagram cuando el mensaje es personal', async () => {
    mockLlmJson({ reply: '', handoff: true, handoffReason: 'Es un mensaje personal', isPersonal: true, action: 'buy_link' });
    const result = await runInstagramAgent({ incomingText: 'jajaja mira esto', history: [], config });
    expect(result.action).toBe('none');
  });

  // Pedido explícito del dueño: un "muchas gracias" puro no se deriva ni se
  // le manda al equipo -- se contesta con el texto fijo configurado, no con
  // lo que haya generado la IA en `reply`.
  it('cuando es solo un agradecimiento, manda el mensaje fijo y no deriva', async () => {
    mockLlmJson({ reply: 'de nada!', handoff: true, handoffReason: '', isThanks: true });
    const result = await runInstagramAgent({
      incomingText: 'muchas gracias!',
      history: [],
      config: { ...config, thanksMessage: 'Un gusto, cualquier cosa avísanos' },
    });
    expect(result.isThanks).toBe(true);
    expect(result.handoff).toBe(false);
    expect(result.reply).toBe('Un gusto, cualquier cosa avísanos');
  });

  it('isThanks no pisa a isPersonal si la IA marca ambos', async () => {
    mockLlmJson({ reply: '', handoff: true, handoffReason: '', isPersonal: true, isThanks: true });
    const result = await runInstagramAgent({ incomingText: 'jaja gracias crack', history: [], config });
    expect(result.isPersonal).toBe(true);
    expect(result.isThanks).toBe(false);
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

  // El recordatorio de cierre arranca PRENDIDO por defecto (a diferencia de
  // `enabled`, que arranca apagado) -- solo tiene efecto cuando `enabled`
  // también está prendido, así que no hay riesgo de que se active solo.
  it('el recordatorio de cierre arranca prendido, con 120 minutos y un mensaje por defecto', () => {
    const config = normalizeInstagramAgentConfig({});
    expect(config.followUpEnabled).toBe(true);
    expect(config.followUpMinutes).toBe(120);
    expect(config.followUpMessage.length).toBeGreaterThan(0);
  });

  it('solo se apaga con un false explícito', () => {
    expect(normalizeInstagramAgentConfig({ followUpEnabled: false }).followUpEnabled).toBe(false);
    expect(normalizeInstagramAgentConfig({ followUpEnabled: 'no' }).followUpEnabled).toBe(true);
  });

  it('acota los minutos de silencio a un rango razonable', () => {
    expect(normalizeInstagramAgentConfig({ followUpMinutes: 99999 }).followUpMinutes).toBe(1440);
    expect(normalizeInstagramAgentConfig({ followUpMinutes: 0 }).followUpMinutes).toBeGreaterThan(0);
    expect(normalizeInstagramAgentConfig({ followUpMinutes: 30 }).followUpMinutes).toBe(30);
  });

  it('respeta un mensaje de cierre propio', () => {
    expect(normalizeInstagramAgentConfig({ followUpMessage: 'nos vemos!' }).followUpMessage).toBe('nos vemos!');
  });

  it('trae un mensaje de agradecimiento por defecto y respeta uno propio', () => {
    expect(normalizeInstagramAgentConfig({}).thanksMessage.length).toBeGreaterThan(0);
    expect(normalizeInstagramAgentConfig({ thanksMessage: 'gracias a ti!' }).thanksMessage).toBe('gracias a ti!');
  });
});
