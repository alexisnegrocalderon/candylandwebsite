import { describe, expect, it } from 'vitest';
import { MySqlDialect } from 'drizzle-orm/mysql-core';
import { lockerItems } from '../drizzle/schema';
import { cajaOpIsMine } from './memberCajaOps';

describe('cajaOpIsMine', () => {
  it('una venta de caja es de la persona si usó su saldo o sus Playcoins en ella (mismo opId)', () => {
    const q = new MySqlDialect().sqlToQuery(cajaOpIsMine(42, lockerItems.opId));
    expect(q.sql).toMatch(/EXISTS \(SELECT 1 FROM `prepaidLedger` pl WHERE pl\.customerId = \? AND pl\.opId = `lockerItems`\.`opId`\)/);
    expect(q.sql).toMatch(/EXISTS \(SELECT 1 FROM `playcoinsLedger` cl WHERE cl\.customerId = \? AND cl\.opId = `lockerItems`\.`opId`\)/);
    expect(q.params).toEqual([42, 42]);
  });
});
