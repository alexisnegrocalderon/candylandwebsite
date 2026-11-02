import { describe, expect, it } from 'vitest';
import { followUpIntent, planFollowUp, type FollowUpPlanInput } from './followUp';

const H = 60 * 60 * 1000;
const M = 60 * 1000;
const now = new Date('2026-11-02T20:00:00Z');
const ago = (ms: number) => new Date(now.getTime() - ms);

const base: FollowUpPlanInput = {
  now, lastInboundAt: ago(2 * H), lastMessageAt: ago(45 * M), lastFromBot: true, legacyClosingSentAt: null,
  state: null, clickAt: null, intent: 'ok', minutes: 30, secondHours: 20,
};

describe('followUpIntent', () => {
  it('detecta quien no quiere seguir y quien lo está pensando', () => {
    expect(followUpIntent(['no gracias, no me interesa'])).toBe('stop');
    expect(followUpIntent(['no voy a poder ir'])).toBe('stop');
    expect(followUpIntent(['lo voy a pensar y te aviso'])).toBe('soft');
    expect(followUpIntent(['hola cuánto vale?', 'somos pareja'])).toBe('ok');
  });
  it('stop gana sobre soft', () => {
    expect(followUpIntent(['lo pienso', 'mejor no gracias'])).toBe('stop');
  });
});

describe('planFollowUp', () => {
  it('seguimiento 1 por silencio pasado el tiempo configurado', () => {
    expect(planFollowUp(base)).toEqual({ stage: 1, variant: 'silence' });
    expect(planFollowUp({ ...base, lastMessageAt: ago(10 * M) })).toBeNull();
  });
  it('no escribe si el último mensaje no fue del bot (contestó la persona o el dueño)', () => {
    expect(planFollowUp({ ...base, lastFromBot: false })).toBeNull();
  });
  it('nunca fuera de la ventana de 24 h de Meta', () => {
    expect(planFollowUp({ ...base, lastInboundAt: ago(23.5 * H), lastMessageAt: ago(23 * H) })).toBeNull();
  });
  it('variante de clic: ~20 min después de tocar el botón sin comprar', () => {
    expect(planFollowUp({ ...base, lastMessageAt: ago(5 * M), clickAt: ago(25 * M) })).toEqual({ stage: 1, variant: 'click' });
    expect(planFollowUp({ ...base, lastMessageAt: ago(5 * M), clickAt: ago(5 * M) })).toBeNull();
    // Clic de hace demasiado: ya no es «¿pudiste entrar?», cae al seguimiento normal por silencio.
    expect(planFollowUp({ ...base, lastMessageAt: ago(45 * M), clickAt: ago(6 * H), lastInboundAt: ago(7 * H) })).toEqual({ stage: 1, variant: 'silence' });
  });
  it('un clic anterior al último mensaje de la persona no cuenta', () => {
    expect(planFollowUp({ ...base, lastMessageAt: ago(5 * M), clickAt: ago(3 * H) })).toBeNull();
  });
  it('seguimiento 2 solo con fila guardada, tras ~20 h y antes de cerrarse la ventana', () => {
    const state = { stage: 1, lastSentAt: ago(15 * H), stoppedAt: null };
    const t = { ...base, state, lastInboundAt: ago(21 * H), lastMessageAt: ago(15 * H) };
    expect(planFollowUp(t)).toEqual({ stage: 2, variant: 'silence' });
    // Aún faltan horas: pasaron 19 h desde el último mensaje de la persona (el segundo va a las 20).
    expect(planFollowUp({ ...t, lastInboundAt: ago(19 * H), state: { ...state, lastSentAt: ago(17 * H) } })).toBeNull();
    expect(planFollowUp({ ...t, state: { ...state, lastSentAt: ago(1 * H) } })).toBeNull();
    expect(planFollowUp({ ...t, state: { ...state, stage: 2 } })).toBeNull();
  });
  it('sin fila guardada y con el recordatorio viejo ya enviado, no hay segundo mensaje', () => {
    expect(planFollowUp({ ...base, lastInboundAt: ago(21 * H), lastMessageAt: ago(15 * H), legacyClosingSentAt: ago(15 * H) })).toBeNull();
  });
  it('si la persona escribió después del último seguimiento, se parte de cero', () => {
    const state = { stage: 2, lastSentAt: ago(5 * H), stoppedAt: null };
    expect(planFollowUp({ ...base, state })).toEqual({ stage: 1, variant: 'silence' });
  });
  it('se detiene si dijo que no o si la conversación quedó detenida', () => {
    expect(planFollowUp({ ...base, intent: 'stop' })).toBeNull();
    expect(planFollowUp({ ...base, state: { stage: 0, lastSentAt: null, stoppedAt: ago(1 * H) } })).toBeNull();
    // Si la persona volvió a escribir después de que se detuvo, se reevalúa.
    expect(planFollowUp({ ...base, state: { stage: 0, lastSentAt: null, stoppedAt: ago(5 * H) } })).toEqual({ stage: 1, variant: 'silence' });
  });
  it('con «lo pienso» manda solo un seguimiento', () => {
    const state = { stage: 1, lastSentAt: ago(15 * H), stoppedAt: null };
    const t = { ...base, state, lastInboundAt: ago(21 * H), lastMessageAt: ago(15 * H) };
    expect(planFollowUp({ ...t, intent: 'soft' })).toBeNull();
    expect(planFollowUp({ ...base, intent: 'soft' })).toEqual({ stage: 1, variant: 'silence' });
  });
  it('el segundo seguimiento se puede apagar (0 horas)', () => {
    const state = { stage: 1, lastSentAt: ago(15 * H), stoppedAt: null };
    expect(planFollowUp({ ...base, state, lastInboundAt: ago(21 * H), lastMessageAt: ago(15 * H), secondHours: 0 })).toBeNull();
  });
});
