import { describe, expect, it } from 'vitest';
import { MARKETING_GAP_MS, normalizeSegment, selectRecipients, type SegmentContext } from './pushSegments';
import { fillPushText, normalizeCustomerPushConfig } from './customerPushConfig';

const now = new Date('2026-10-21T20:00:00Z');
const ctx = (over: Partial<SegmentContext> = {}): SegmentContext => ({
  buyers: new Set(['ana@x.cl', 'beto@x.cl']),
  eventBuyers: new Set(['ana@x.cl']),
  recentBuyers: new Set(['beto@x.cl']),
  ambassadors: new Set(['caro@x.cl']),
  blocked: new Set(),
  ...over,
});
const sub = (id: number, emailNorm: string | null, extra: any = {}) => ({ id, emailNorm, optedOutAt: null, lastMarketingAt: null, ...extra });
const subs = [sub(1, 'ana@x.cl'), sub(2, 'beto@x.cl'), sub(3, 'caro@x.cl'), sub(4, null)];
const ids = (r: { recipients: { id: number }[] }) => r.recipients.map((s) => s.id);

describe('selectRecipients', () => {
  it('filtra por segmento', () => {
    expect(ids(selectRecipients(subs, { type: 'all' }, ctx(), { marketing: false, now }))).toEqual([1, 2, 3, 4]);
    expect(ids(selectRecipients(subs, { type: 'nextEvent' }, ctx(), { marketing: false, now }))).toEqual([1]);
    expect(ids(selectRecipients(subs, { type: 'nextEventNoTicket' }, ctx(), { marketing: false, now }))).toEqual([2, 3, 4]);
    expect(ids(selectRecipients(subs, { type: 'neverBought' }, ctx(), { marketing: false, now }))).toEqual([3, 4]);
    expect(ids(selectRecipients(subs, { type: 'recentBuyers', days: 30 }, ctx(), { marketing: false, now }))).toEqual([2]);
    expect(ids(selectRecipients(subs, { type: 'ambassadors' }, ctx(), { marketing: false, now }))).toEqual([3]);
  });

  it('saca a los dados de baja y a los bloqueados', () => {
    const list = [...subs, sub(5, 'dani@x.cl', { optedOutAt: now })];
    expect(ids(selectRecipients(list, { type: 'all' }, ctx({ blocked: new Set(['beto@x.cl']) }), { marketing: false, now }))).toEqual([1, 3, 4]);
  });

  it('tope de un aviso de marketing al día, sin tocar los transaccionales', () => {
    const recent = new Date(now.getTime() - MARKETING_GAP_MS + 60_000);
    const old = new Date(now.getTime() - MARKETING_GAP_MS - 60_000);
    const list = [sub(1, 'ana@x.cl', { lastMarketingAt: recent }), sub(2, 'beto@x.cl', { lastMarketingAt: old })];
    const r = selectRecipients(list, { type: 'all' }, ctx(), { marketing: true, now });
    expect(ids(r)).toEqual([2]);
    expect(r.cappedOut).toBe(1);
    expect(ids(selectRecipients(list, { type: 'all' }, ctx(), { marketing: false, now }))).toEqual([1, 2]);
  });
});

describe('normalizeSegment', () => {
  it('cae a "todos" con basura y acota los días', () => {
    expect(normalizeSegment(null)).toEqual({ type: 'all' });
    expect(normalizeSegment({ type: 'event' })).toEqual({ type: 'all' });
    expect(normalizeSegment({ type: 'event', eventId: 7 })).toEqual({ type: 'event', eventId: 7 });
    expect(normalizeSegment({ type: 'recentBuyers', days: 9999 })).toEqual({ type: 'recentBuyers', days: 90 });
  });
});

describe('customerPushConfig', () => {
  it('arranca todo apagado y valida la hora', () => {
    const c = normalizeCustomerPushConfig(null);
    expect([c.eventReminder.enabled, c.newEvent.enabled, c.presale.enabled, c.abandonedCart.enabled]).toEqual([false, false, false, false]);
    expect(normalizeCustomerPushConfig({ eventReminder: { hour: 3 } }).eventReminder.hour).toBe(18);
    expect(normalizeCustomerPushConfig({ newEvent: { mode: 'send', enabled: true } }).newEvent).toMatchObject({ mode: 'send', enabled: true });
  });
  it('rellena {evento}', () => {
    expect(fillPushText('Te esperamos en {evento}', { evento: 'Halloween' })).toBe('Te esperamos en Halloween');
    expect(fillPushText('Te esperamos en {evento}', {})).toBe('Te esperamos en el próximo evento');
  });
});
