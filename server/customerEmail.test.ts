import { beforeEach, describe, expect, it, vi } from 'vitest';

// Una base de mentira que contesta los SELECT en orden y anota los UPDATE.
const selects: unknown[][] = [];
const updates: { set: Record<string, unknown> }[] = [];
const chain = () => {
  const c: any = {};
  c.from = () => c; c.where = () => c; c.limit = async () => selects.shift() ?? [];
  return c;
};
const fakeDb = {
  select: () => chain(),
  update: () => ({ set: (v: Record<string, unknown>) => { const rec = { set: v }; updates.push(rec); return { where: async () => [{ affectedRows: 3 }] }; } }),
};
vi.mock('./db', () => ({ getDb: vi.fn(async () => fakeDb), skipPendingMailingForCustomer: vi.fn() }));

const { changeCustomerEmail } = await import('./customerProfile');

beforeEach(() => { selects.length = 0; updates.length = 0; });

describe('cambiar el correo de un cliente', () => {
  it('limpia el correo, lo guarda y pasa sus compras al correo nuevo', async () => {
    selects.push([{ id: 5, email: 'Ana@Mal.cl' }], []); // la ficha, y nadie más con el correo nuevo
    const r = await changeCustomerEmail(5, '  ANA@Bien.cl ');
    expect(r).toMatchObject({ changed: true, email: 'ana@bien.cl', previous: 'ana@mal.cl', orders: 3 });
    expect(updates.map((u) => u.set)).toEqual([{ email: 'ana@bien.cl' }, { buyerEmail: 'ana@bien.cl' }, { customerEmail: 'ana@bien.cl' }]);
  });

  it('si es el mismo correo no toca nada', async () => {
    selects.push([{ id: 5, email: 'ana@bien.cl' }]);
    expect(await changeCustomerEmail(5, 'ANA@bien.cl')).toMatchObject({ changed: false });
    expect(updates).toHaveLength(0);
  });

  it('no deja usar el correo de otro cliente', async () => {
    selects.push([{ id: 5, email: 'ana@mal.cl' }], [{ id: 9, fullName: 'Beto Soto' }]);
    await expect(changeCustomerEmail(5, 'beto@x.cl')).rejects.toThrow(/ya es de otro cliente \(Beto Soto\)/);
    expect(updates).toHaveLength(0);
  });

  it('rechaza un correo que no es correo', async () => {
    await expect(changeCustomerEmail(5, 'sin-arroba')).rejects.toThrow(/no parece válido/);
    await expect(changeCustomerEmail(5, '   ')).rejects.toThrow(/Escribe el correo/);
    expect(updates).toHaveLength(0);
  });
});
