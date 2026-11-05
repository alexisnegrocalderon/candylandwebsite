import { describe, expect, it } from 'vitest';
import { buyHrefFor, communityNote, deriveTanda, groupOf, type PlaymoreTicketView } from './playmoreTanda';

const t = (o: Partial<PlaymoreTicketView>): PlaymoreTicketView => ({
  id: 1, name: 'Dúo', price: 30000, status: 'active', accesoSlug: 'duo', category: 'acceso',
  originalPrice: null, salesEnd: null, hasStock: true, soldPct: 20, ...o,
});
const now = Date.parse('2026-11-10T12:00:00-03:00');

describe('deriveTanda', () => {
  it('destaca el Dúo y toma su cierre si es futuro', () => {
    const r = deriveTanda([t({ id: 2, name: 'Soltera', accesoSlug: 'soltera', price: 10000 }), t({ salesEnd: '2026-11-20T23:59:00-03:00' })], now)!;
    expect(r.featured.accesoSlug).toBe('duo');
    expect(r.salesEnd).toBe('2026-11-20T23:59:00-03:00');
    expect(r.soldOut).toBe(false);
  });
  it('sin Dúo usa el más barato y ignora cierres pasados', () => {
    const r = deriveTanda([t({ id: 2, accesoSlug: 'trio', price: 50000 }), t({ id: 3, accesoSlug: 'soltera', price: 12000, salesEnd: '2026-11-01T00:00:00-03:00' })], now)!;
    expect(r.featured.accesoSlug).toBe('soltera');
    expect(r.salesEnd).toBeNull();
  });
  it('todo agotado → tanda agotada; extras no cuentan', () => {
    expect(deriveTanda([t({ status: 'soldout', hasStock: false })], now)!.soldOut).toBe(true);
    expect(deriveTanda([t({ category: 'extra' })], now)).toBeNull();
  });
});

describe('buyHrefFor', () => {
  it('preselecciona el acceso en el checkout', () => {
    expect(buyHrefFor('/checkout/x', { accesoSlug: 'duo', category: 'acceso' })).toBe('/checkout/x?items=duo:1');
    expect(buyHrefFor('/checkout/x', { accesoSlug: null, category: 'acceso' })).toBe('/checkout/x');
    expect(buyHrefFor('/checkout/x', { accesoSlug: 'estac', category: 'extra' })).toBe('/checkout/x');
  });
});

describe('compra inmersiva', () => {
  it('respeta un ?preview= que ya traiga el link', () => {
    expect(buyHrefFor('/checkout/x?preview=tok', { accesoSlug: 'duo', category: 'acceso' }, { nombre: 'Ana' })).toBe('/checkout/x?preview=tok&items=duo:1&nombre=Ana');
  });
  it('agrupa los accesos por personas', () => {
    expect(groupOf('duo_mujeres')?.key).toBe('duo');
    expect(groupOf('soltero')?.people).toBe(1);
    expect(groupOf('vip')).toBeNull();
  });
  it('lleva cantidad y nombre al checkout', () => {
    expect(buyHrefFor('/checkout/x', { accesoSlug: 'trio', category: 'acceso' }, { qty: 2, nombre: ' Camila ' })).toBe('/checkout/x?items=trio:2&nombre=Camila');
  });
});

describe('communityNote', () => {
  it('avisa en los accesos que piden código de comunidad', () => {
    expect(communityNote('soltero')).toMatch(/CÓDIGO DE COMUNIDAD/);
    expect(communityNote('duo')).toMatch(/DOS HOMBRES/);
  });
  it('no avisa en los demás', () => {
    expect(communityNote('soltera')).toBeNull();
    expect(communityNote('duo_mujeres')).toBeNull();
    expect(communityNote('trio')).toBeNull();
    expect(communityNote(null)).toBeNull();
  });
});

describe('buyHrefFor con «quién»', () => {
  const duo = { accesoSlug: 'duo', category: 'acceso' };
  it('agrega la opción elegida', () => {
    expect(buyHrefFor('/checkout/pm', duo, { quien: 'dos-hombres' })).toBe('/checkout/pm?items=duo:1&quien=dos-hombres');
    expect(buyHrefFor('/checkout/pm?preview=x', duo, { quien: 'pareja', nombre: 'Ana' })).toBe('/checkout/pm?preview=x&items=duo:1&quien=pareja&nombre=Ana');
  });
  it('ignora valores raros y los extras', () => {
    expect(buyHrefFor('/c', duo, { quien: '<script>' })).toBe('/c?items=duo:1');
    expect(buyHrefFor('/c', { accesoSlug: null, category: 'extra' }, { quien: 'pareja' })).toBe('/c');
  });
});
