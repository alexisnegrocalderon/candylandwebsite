import { describe, expect, it, vi } from 'vitest';
import { MySqlDialect } from 'drizzle-orm/mysql-core';
import type { SQL } from 'drizzle-orm';

vi.mock('./db', () => ({
  getDb: vi.fn(),
  looksLikeRutSearch: (t: string) => /^[0-9kK.\-\s]+$/.test(t) && /^[0-9k]{4,}$/i.test(t.replace(/[.\-\s]/g, '')),
  rutDigits: (v: string) => v.replace(/[^0-9a-zA-Z]/g, '').toLowerCase(),
}));

import { customerWhere, levelCondition } from './customerFilters';

const dialect = new MySqlDialect();
const NOW = new Date('2026-10-25T12:00:00.000Z');
const q = (w: SQL | undefined) => (w ? dialect.sqlToQuery(w) : null);

describe('filtros de Clientes en la base', () => {
  it('sin filtros no hay WHERE', () => {
    expect(customerWhere({}, NOW)).toBeUndefined();
  });

  it('la búsqueda mira correo, nombre y teléfono sin distinguir mayúsculas, y escapa los comodines', () => {
    const r = q(customerWhere({ search: 'Ana_50%' }, NOW))!;
    expect(r.sql).toMatch(/LOWER\(`customers`\.`email`\) LIKE/);
    expect(r.sql).toMatch(/LOWER\(`customers`\.`fullName`\) LIKE/);
    expect(r.sql).toMatch(/`customers`\.`phone` LIKE/);
    expect(r.params).toContain('%ana\\_50\\%%');
  });

  it('un RUT se busca sin puntos ni guion', () => {
    const r = q(customerWhere({ search: '12.345.678-9' }, NOW))!;
    expect(r.sql).toMatch(/REPLACE\(REPLACE\(REPLACE\(LOWER\(`customers`\.`rut`\)/);
    expect(r.params).toContain('%123456789%');
  });

  it('etiquetas y tipos de acceso con JSON_CONTAINS, y excluir etiquetas con NOT', () => {
    const r = q(customerWhere({ tag: 'vip', accessType: 'duo', excludeTags: ['promo'] }, NOW))!;
    expect(r.sql).toMatch(/JSON_CONTAINS\(`customers`\.`tags`/);
    expect(r.sql).toMatch(/JSON_CONTAINS\(`customers`\.`accessTypes`/);
    expect(r.sql).toMatch(/NOT \(COALESCE\(JSON_CONTAINS\(`customers`\.`tags`/);
    expect(r.params).toEqual(expect.arrayContaining(['"vip"', '"duo"', '"promo"']));
  });

  it('cumpleaños: acepta «AAAA-MM-DD» y «MM-DD» del mes pedido', () => {
    const r = q(customerWhere({ birthdayMonth: 3 }, NOW))!;
    expect(r.sql).toMatch(/REGEXP '\^\[0-9\]\{4\}-/);
    expect(r.sql).toMatch(/REGEXP '\^\[0-9\]\{2\}-/);
    expect(r.params.filter((p) => p === '03')).toHaveLength(2);
  });

  it('bajas de contacto, ciudad, género y origen', () => {
    const r = q(customerWhere({ optedOut: 'any', city: 'Viña', gender: 'mujer', source: 'web', forMailing: true }, NOW))!;
    expect(r.sql).toMatch(/emailOptOut` <> 0 or `customers`\.`whatsappOptOut` <> 0/i);
    expect(r.sql).toMatch(/LOWER\(`customers`\.`city`\) LIKE/);
    expect(r.params).toEqual(expect.arrayContaining(['%viña%', 'mujer', 'web']));
  });

  it('evento: compró (IN) o no compró (NOT IN) con orden aprobada', () => {
    expect(q(customerWhere({ eventId: 7 }, NOW))!.sql).toMatch(/LOWER\(`customers`\.`email`\) IN \(SELECT LOWER\(`orders`\.`buyerEmail`\) FROM `orders` WHERE `orders`\.`eventId` = \? AND `orders`\.`paymentStatus` = 'approved'\)/);
    expect(q(customerWhere({ notPurchasedEventId: 7 }, NOW))!.sql).toMatch(/NOT \(LOWER\(`customers`\.`email`\) IN/);
  });

  it('«con la app»: solo esos correos; sin ninguno no devuelve a nadie', () => {
    expect(q(customerWhere({ hasApp: true }, NOW, new Set(['a@x.cl', 'b@x.cl'])))!.params).toEqual(expect.arrayContaining(['a@x.cl', 'b@x.cl']));
    expect(q(customerWhere({ hasApp: true }, NOW, new Set()))!.sql).toMatch(/1 = 0/);
  });

  it('nivel: inactivo es más de 90 días cumplidos (91 o más), igual que computeCustomerLevel', () => {
    const r = q(levelCondition('inactivo', NOW))!;
    expect(r.sql).toMatch(/lastSeenAt` <= \?/);
    const cutoff = r.params.find((p) => p instanceof Date) as Date;
    expect(cutoff.toISOString()).toBe(new Date(NOW.getTime() - 91 * 86_400_000).toISOString());
    expect(r.params).toContain(150000);
  });

  it('nivel: sin compras, nuevo y recurrente excluyen a los forzados a mano', () => {
    for (const lvl of ['sin_compras', 'nuevo', 'recurrente'] as const) {
      expect(q(levelCondition(lvl, NOW))!.sql).toMatch(/levelOverride` IN \('vip', 'inactivo'\)/);
    }
  });
});
