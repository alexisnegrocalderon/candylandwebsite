import { describe, expect, it, vi } from 'vitest';

vi.mock('./db', () => ({ getTicketTypesByEventId: vi.fn() }));

import * as db from './db';
import { buildPlaymoreContext, PLAYMORE_RULES } from './playmoreAgent';
import { buildPlaymorePhases, PLAYMORE_TANDA_ROWS } from '../shared/playmoreTandas';
import { normalizeLanding } from '../shared/coproduction';

const tt = (accesoSlug: string, price: number, originalPrice: number | null, extra: Record<string, unknown> = {}) => ({
  id: Math.random(), category: 'acceso', accesoSlug, name: accesoSlug, status: 'active', price: String(price),
  originalPrice: originalPrice == null ? null : String(originalPrice), totalStock: 150, soldCount: 0, poolRemaining: null, ...extra,
});

const label = (remaining: number | null) => (remaining != null && remaining <= 10 ? 'quedan pocas' : 'disponible');

describe('contexto de PLAYMORE para el agente', () => {
  const focus = {
    event: {
      id: 1, slug: 'playmore', eventDate: new Date('2026-12-05T01:00:00Z'), eventEnd: null, venue: null, shortDescription: null,
      tandaPhaseIndex: 0, tandaDiscountSchedule: buildPlaymorePhases(PLAYMORE_TANDA_ROWS, ['2026-11-09T02:59:00Z', '2026-11-23T02:59:00Z', '2026-12-05T09:00:00Z']),
    },
    landing: normalizeLanding({}),
  } as any;

  it('lista cada acceso con su llave, precio general, % y el precio de la próxima tanda', async () => {
    vi.mocked(db.getTicketTypesByEventId).mockResolvedValue([
      tt('duo', 40000, 70000), tt('soltera', 10000, 15000), tt('duo_mujeres', 15000, 25000), tt('trio', 50000, 80000),
      tt('soltero', 50000, null, { totalStock: 5 }),
    ] as any);
    const ctx = await buildPlaymoreContext(focus, label);
    expect(ctx).toContain('Pareja [pareja]');
    expect(ctx).toContain('Dos hombres [dos-hombres]');
    expect(ctx).toContain('Voy sola [soltera] (1 persona): $10.000');
    expect(ctx).toContain('precio general $15.000: 33 % menos');
    expect(ctx).toContain('sube a $12.500');
    expect(ctx).toContain('sube a $50.000');
    expect(ctx).toContain('Voy solo [soltero] (1 persona): $50.000 CLP (precio único, sin tandas) — quedan pocas');
    expect(ctx).toContain('+21');
    expect(ctx).not.toMatch(/\[grupo\]/);
    expect(ctx).not.toMatch(/mansionplayroom\.cl/);
  });

  it('en la última tanda no promete alzas', async () => {
    vi.mocked(db.getTicketTypesByEventId).mockResolvedValue([tt('duo', 70000, 70000)] as any);
    const ctx = await buildPlaymoreContext({ ...focus, event: { ...focus.event, tandaPhaseIndex: 2 } }, label);
    expect(ctx).toContain('3ª y última');
    expect(ctx).not.toContain('sube a');
  });
});

describe('reglas de venta de PLAYMORE', () => {
  it('fija el foco exclusivo, el +21 y las reglas de los hombres solos y dos hombres', () => {
    expect(PLAYMORE_RULES).toContain('SOLO PLAYMORE');
    expect(PLAYMORE_RULES).toContain('+21');
    expect(PLAYMORE_RULES).toContain('chica acompañante');
    expect(PLAYMORE_RULES).toContain('no para amigos');
  });
});
