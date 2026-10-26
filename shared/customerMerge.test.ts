import { describe, expect, it } from 'vitest';
import { aliasTag, mergeCustomerFields, type MergeableCustomer } from './customerMerge';

const base = (over: Partial<MergeableCustomer> = {}): MergeableCustomer => ({
  email: 'a@x.cl', fullName: null, phone: null, rut: null, instagram: null, birthDate: null, gender: null, city: null, source: null, ambassadorCode: null, levelOverride: null,
  accessTypes: [], tags: [], totalOrders: 0, totalSpent: '0', playcoins: 0, prepaidBalance: 0, memberSince: null,
  firstSeenAt: '2026-01-10T00:00:00Z', lastSeenAt: '2026-02-10T00:00:00Z', cardPinHash: null, cardPinSetAt: null,
  emailOptOut: 0, whatsappOptOut: 0, optOutAt: null, optOutReason: null, ...over,
});

describe('mergeCustomerFields', () => {
  it('lee listas que llegan como texto JSON', () => {
    const r = mergeCustomerFields(base({ tags: '["app"]', accessTypes: '["duo"]' }), base({ email: 'b@x.cl', tags: '["vip"]', accessTypes: '["soltero"]' }));
    expect(r.tags).toEqual(['app', 'vip', aliasTag('b@x.cl')]);
    expect(r.accessTypes).toEqual(['duo', 'soltero']);
  });
  it('suma compras, gasto, Playcoins y saldo', () => {
    const r = mergeCustomerFields(base({ totalOrders: 1, totalSpent: '19000', playcoins: 100, prepaidBalance: 2000 }), base({ email: 'b@x.cl', totalOrders: 5, totalSpent: '90000', playcoins: 400, prepaidBalance: 3000 }));
    expect(r).toMatchObject({ totalOrders: 6, totalSpent: '109000', playcoins: 500, prepaidBalance: 5000 });
  });
  it('conserva lo de la ficha principal y rellena lo que le falta', () => {
    const r = mergeCustomerFields(base({ fullName: 'Pablo', phone: null }), base({ email: 'b@x.cl', fullName: 'PABLO BAHAMONDES', phone: '+56911112222', rut: '12.345.678-9' }));
    expect(r).toMatchObject({ fullName: 'Pablo', phone: '+56911112222', rut: '12.345.678-9' });
  });
  it('une etiquetas y tipos de acceso sin repetir y deja el correo viejo como alias', () => {
    const r = mergeCustomerFields(base({ tags: ['vip'], accessTypes: ['duo'] }), base({ email: 'B@X.cl', tags: ['vip', 'app', 'alias:c@x.cl'], accessTypes: ['duo', 'soltero'] }));
    expect(r.tags).toEqual(['vip', 'app', 'alias:c@x.cl', aliasTag('b@x.cl')]);
    expect(r.accessTypes).toEqual(['duo', 'soltero']);
  });
  it('socio desde la fecha más antigua y fechas de actividad extremas', () => {
    const r = mergeCustomerFields(base({ memberSince: '2026-03-01T00:00:00Z' }), base({ email: 'b@x.cl', memberSince: '2026-01-05T00:00:00Z', firstSeenAt: '2025-12-01T00:00:00Z', lastSeenAt: '2026-04-01T00:00:00Z' }));
    expect(new Date(r.memberSince!).toISOString()).toBe('2026-01-05T00:00:00.000Z');
    expect(new Date(r.firstSeenAt).toISOString()).toBe('2025-12-01T00:00:00.000Z');
    expect(new Date(r.lastSeenAt).toISOString()).toBe('2026-04-01T00:00:00.000Z');
  });
  it('el PIN de la principal manda; si no tiene, usa el de la otra', () => {
    expect(mergeCustomerFields(base({ cardPinHash: 'A' }), base({ email: 'b@x.cl', cardPinHash: 'B' })).cardPinHash).toBe('A');
    expect(mergeCustomerFields(base(), base({ email: 'b@x.cl', cardPinHash: 'B' })).cardPinHash).toBe('B');
  });
  it('una baja de contacto de cualquiera se respeta', () => {
    const r = mergeCustomerFields(base(), base({ email: 'b@x.cl', emailOptOut: 1, optOutReason: 'pidió baja' }));
    expect(r).toMatchObject({ emailOptOut: 1, whatsappOptOut: 0, optOutReason: 'pidió baja' });
  });
});
