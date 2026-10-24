import { describe, expect, it } from 'vitest';
import { fromPrice } from './fromPrice';
// Los tipos de entrada reales del 2do Aniversario (consulta pública events.getTicketTypes, 24-oct-2026):
// accesos de 4 tandas, barra, merch (Vaso PlayRoom a $1.000), guardarropía, cargas de PlayCard y una
// invitación oculta a $0.
import aniversario from './__fixtures__/ticketTypesAniversario.json';

const event = { eventDate: '2026-10-31T01:00:00.000Z', missionForceClosed: true };
const now = new Date('2026-10-24T20:00:00.000Z');

describe('«Desde $X» del inicio', () => {
  it('es el acceso más barato a la venta, no la merch ni la barra', () => {
    // Antes salía $1.000 (el Vaso PlayRoom): solo se descartaba la categoría «extra».
    expect(fromPrice(aniversario as any[], event, now)).toBe(19000);
  });

  it('ignora lo oculto, lo agotado, lo sin cupo y lo fuera de sus fechas de venta', () => {
    const t = (over: Record<string, unknown>) => ({ category: 'acceso', accesoSlug: 'duo', status: 'active', price: '30000', totalStock: 10, soldCount: 0, ...over });
    const tickets = [
      t({ price: '0', status: 'hidden', accesoSlug: null, name: 'Invitación' }),
      t({ price: '5000', accesoSlug: 'soltera', status: 'soldout' }),
      t({ price: '6000', accesoSlug: 'trio', totalStock: 3, soldCount: 3 }),
      t({ price: '7000', accesoSlug: 'grupo', salesStart: '2026-11-01T00:00:00Z' }),
      t({ price: '8000', accesoSlug: 'soltero', salesEnd: '2026-10-01T00:00:00Z' }),
      t({ price: '1000', category: 'merch', accesoSlug: null, name: 'Vaso' }),
      t({}),
    ];
    expect(fromPrice(tickets, event, now)).toBe(30000);
  });

  it('sin nada a la venta no muestra precio', () => {
    expect(fromPrice([{ category: 'acceso', status: 'soldout', price: '10000' }], event, now)).toBeNull();
    expect(fromPrice([], event, now)).toBeNull();
  });
});
