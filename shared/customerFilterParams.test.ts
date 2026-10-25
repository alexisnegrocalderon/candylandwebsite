import { describe, expect, it } from 'vitest';
import { customerFilterQuery, parseCustomerFilterParams } from './customerFilterParams';

const from = (q: string) => { const p = new URLSearchParams(q); return parseCustomerFilterParams((k) => p.get(k)); };

describe('filtros de Clientes en la URL', () => {
  it('lee todos los filtros', () => {
    expect(from('search=ana&level=vip&eventId=7&birthdayMonth=3&optedOut=any&hasApp=1&city=Viña&gender=mujer&tag=vip&accessType=duo&source=web'))
      .toEqual({ search: 'ana', level: 'vip', eventId: 7, birthdayMonth: 3, optedOut: 'any', hasApp: true, city: 'Viña', gender: 'mujer', tag: 'vip', accessType: 'duo', source: 'web' });
  });

  it('ignora lo que no se reconoce o viene vacío', () => {
    expect(from('level=dios&eventId=abc&birthdayMonth=13&optedOut=x&hasApp=0&search=%20%20')).toEqual({});
  });

  it('ida y vuelta: lo que arma la tabla es lo que lee el servidor', () => {
    const f = { search: 'ana', level: 'recurrente', eventId: 2, hasApp: true } as const;
    expect(from(customerFilterQuery(f).toString())).toEqual(f);
  });
});
