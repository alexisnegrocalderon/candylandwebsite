import { describe, expect, it } from 'vitest';
import { triageComment } from './commentTriage';

describe('triageComment', () => {
  it('detecta spam', () => {
    expect(triageComment('Gana dinero rápido, escríbeme al privado').category).toBe('spam');
    expect(triageComment('compra seguidores en mipagina.com').category).toBe('spam');
  });
  it('solo emojis o menciones', () => {
    expect(triageComment('😍🔥🔥').category).toBe('emoji');
    expect(triageComment('@amiga mira esto 👀'.replace('mira esto', '')).category).toBe('emoji');
  });
  it('pregunta con intención de compra', () => {
    const r = triageComment('Hola! cuánto cuesta la entrada?');
    expect(r.category).toBe('question');
    expect(r.purchaseIntent).toBe(true);
  });
  it('pregunta sin compra', () => {
    const r = triageComment('a qué hora parte?');
    expect(r.category).toBe('question');
    expect(r.purchaseIntent).toBe(false);
  });
  it('elogio', () => {
    expect(triageComment('Qué lindo el disfraz, me encanta').category).toBe('praise');
  });
  it('delicado gana sobre pregunta', () => {
    expect(triageComment('Esto es una estafa, quiero mi reembolso?').category).toBe('sensitive');
  });
  it('otro', () => {
    expect(triageComment('nos vemos el sábado entonces').category).toBe('other');
  });
});

describe('triageComment con cuenta de confianza', () => {
  const promo = 'Este sábado también en https://otrafiesta.cl escríbeme al whatsapp +56912345678 🔥';

  it('el mismo texto es spam si la cuenta no es de confianza', () => {
    expect(triageComment(promo).category).toBe('spam');
  });

  it('nunca es spam si la cuenta es de confianza', () => {
    expect(triageComment(promo, { trusted: true }).category).not.toBe('spam');
  });

  it('lo delicado sigue siendo delicado aunque sea de confianza', () => {
    expect(triageComment('me cobraron doble, quiero reembolso', { trusted: true }).category).toBe('sensitive');
  });
});
