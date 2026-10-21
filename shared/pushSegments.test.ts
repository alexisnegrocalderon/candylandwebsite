import { describe, expect, it } from 'vitest';
import { describeSegment, MARKETING_GAP_MS, normalizeSegment, ruleKey, selectRecipients, type PushRule, type SegmentContext } from './pushSegments';
import { fillPushText, normalizeCustomerPushConfig } from './customerPushConfig';
import { firstName, personalizeName } from './pushText';

const now = new Date('2026-10-21T20:00:00Z');
const R = {
  next: { type: 'nextEvent' } as PushRule,
  never: { type: 'neverBought' } as PushRule,
  recent: { type: 'recentBuyers', days: 30 } as PushRule,
  amb: { type: 'ambassadors' } as PushRule,
  vip: { type: 'level', levels: ['vip'] } as PushRule,
  notClick: { type: 'notClicked', campaignId: 5 } as PushRule,
};
const ctx = (over: Record<string, any> = {}, blocked: string[] = []): SegmentContext => ({
  rules: {
    [ruleKey(R.next)]: { emails: new Set(['ana@x.cl']) },
    [ruleKey(R.never)]: { emails: new Set(['caro@x.cl']), anon: true },
    [ruleKey(R.recent)]: { emails: new Set(['beto@x.cl']) },
    [ruleKey(R.amb)]: { emails: new Set(['caro@x.cl']) },
    [ruleKey(R.vip)]: { emails: new Set(['ana@x.cl', 'beto@x.cl']) },
    [ruleKey(R.notClick)]: { subs: new Set([2, 4]) },
    ...over,
  },
  blocked: new Set(blocked),
});
const sub = (id: number, emailNorm: string | null, extra: any = {}) => ({ id, emailNorm, optedOutAt: null, lastMarketingAt: null, ...extra });
const subs = [sub(1, 'ana@x.cl'), sub(2, 'beto@x.cl'), sub(3, 'caro@x.cl'), sub(4, null)];
const seg = (include: PushRule[], exclude: PushRule[] = []) => normalizeSegment({ type: 'combo', include, exclude });
const ids = (r: { recipients: { id: number }[] }) => r.recipients.map((s) => s.id);
const run = (s: ReturnType<typeof seg>, c = ctx(), marketing = false) => selectRecipients(subs, s, c, { marketing, now });

describe('selectRecipients', () => {
  it('sin reglas son todos; una regla filtra; los anonimos solo entran si la regla los cuenta', () => {
    expect(ids(run(seg([])))).toEqual([1, 2, 3, 4]);
    expect(ids(run(seg([R.next])))).toEqual([1]);
    expect(ids(run(seg([R.never])))).toEqual([3, 4]);
  });
  it('combina (todas) y excluye (ninguna)', () => {
    expect(ids(run(seg([R.vip, R.recent])))).toEqual([2]);
    expect(ids(run(seg([R.vip], [R.recent])))).toEqual([1]);
    expect(ids(run(seg([], [R.vip])))).toEqual([3, 4]);
  });
  it('reglas por dispositivo (tocaron / no tocaron)', () => {
    expect(ids(run(seg([R.notClick])))).toEqual([2, 4]);
    expect(ids(run(seg([R.notClick, R.vip])))).toEqual([2]);
  });
  it('una regla sin datos resueltos no deja pasar a nadie', () => {
    expect(ids(run(seg([{ type: 'hasBalance' }])))).toEqual([]);
  });
  it('saca a los dados de baja y a los bloqueados', () => {
    const list = [...subs, sub(5, 'dani@x.cl', { optedOutAt: now })];
    expect(ids(selectRecipients(list, seg([]), ctx({}, ['beto@x.cl']), { marketing: false, now }))).toEqual([1, 3, 4]);
  });
  it('tope de un aviso de marketing al dia, sin tocar los transaccionales', () => {
    const recent = new Date(now.getTime() - MARKETING_GAP_MS + 60_000);
    const old = new Date(now.getTime() - MARKETING_GAP_MS - 60_000);
    const list = [sub(1, 'ana@x.cl', { lastMarketingAt: recent }), sub(2, 'beto@x.cl', { lastMarketingAt: old })];
    const r = selectRecipients(list, seg([]), ctx(), { marketing: true, now });
    expect(ids(r)).toEqual([2]);
    expect(r.cappedOut).toBe(1);
    expect(ids(selectRecipients(list, seg([]), ctx(), { marketing: false, now }))).toEqual([1, 2]);
  });
});

describe('normalizeSegment', () => {
  it('acepta las formas antiguas y descarta basura', () => {
    expect(normalizeSegment(null)).toEqual({ type: 'combo', include: [], exclude: [] });
    expect(normalizeSegment({ type: 'all' })).toEqual({ type: 'combo', include: [], exclude: [] });
    expect(normalizeSegment({ type: 'event' }).include).toEqual([]);
    expect(normalizeSegment({ type: 'event', eventId: 7 }).include).toEqual([{ type: 'event', eventId: 7 }]);
    expect(normalizeSegment({ type: 'recentBuyers', days: 9999 }).include).toEqual([{ type: 'recentBuyers', days: 90 }]);
    expect(normalizeSegment({ type: 'combo', include: [{ type: 'level', levels: ['vip', 'xx'] }, { type: 'nope' }, { type: 'birthdayMonth', month: 13 }], exclude: [{ type: 'clicked', campaignId: 3 }] }))
      .toEqual({ type: 'combo', include: [{ type: 'level', levels: ['vip'] }], exclude: [{ type: 'clicked', campaignId: 3 }] });
  });
  it('se describe en palabras', () => {
    expect(describeSegment(seg([]))).toBe('Todos los suscritos');
    expect(describeSegment(seg([R.vip, { type: 'city', city: 'Valparaíso' }], [R.recent]))).toBe('Nivel vip + de Valparaíso, excepto compraron en los últimos 30 días');
  });
});

describe('texto', () => {
  it('arranca todo apagado y valida la hora', () => {
    const c = normalizeCustomerPushConfig(null);
    expect([c.eventReminder.enabled, c.newEvent.enabled, c.presale.enabled, c.abandonedCart.enabled, c.birthday.enabled, c.lowStock.enabled, c.thanks.enabled, c.winback.enabled, c.balance.enabled, c.welcome.enabled]).toEqual(new Array(10).fill(false));
    expect(c.incentive.playcoins).toBe(0);
    expect(normalizeCustomerPushConfig({ eventReminder: { hour: 3 } }).eventReminder.hour).toBe(18);
    expect(normalizeCustomerPushConfig({ newEvent: { mode: 'send', enabled: true } }).newEvent).toMatchObject({ mode: 'send', enabled: true });
    expect(normalizeCustomerPushConfig({ incentive: { playcoins: 99999 } }).incentive.playcoins).toBe(500);
  });
  it('rellena {evento}', () => {
    expect(fillPushText('Te esperamos en {evento}', { evento: 'Halloween' })).toBe('Te esperamos en Halloween');
    expect(fillPushText('Te esperamos en {evento}', {})).toBe('Te esperamos en el próximo evento');
  });
  it('personaliza con el nombre y se acomoda sin él', () => {
    expect(firstName('MARÍA josé pérez')).toBe('María');
    expect(firstName('  ')).toBe('');
    expect(personalizeName('Hola {nombre}, sube el precio', 'camila rojas')).toBe('Hola Camila, sube el precio');
    expect(personalizeName('Hola {nombre}, sube el precio', null)).toBe('Hola, sube el precio');
    expect(personalizeName('{nombre}, tu entrada te espera', null)).toBe('tu entrada te espera');
  });
});
