import { describe, expect, it, vi } from 'vitest';

vi.mock('./_core/env', () => ({ ENV: { cookieSecret: 'clave-de-prueba' } }));
const colab = vi.hoisted(() => ({ isEventColab: vi.fn() }));
vi.mock('./coproduction', () => colab);

import { withPlayTeams } from './playTeamsDoor';

const snap = () => ({
  event: { id: 7 },
  attendees: [{ access: [
    { ticketCode: 'MP-SOLA1', accesoSlug: 'soltera', groupSize: null },
    { ticketCode: 'MP-DUO01', accesoSlug: 'duo', groupSize: null },
    { ticketCode: 'MP-TRIO1', accesoSlug: 'trio', groupSize: null },
  ] }],
});

describe('colores de pulsera en la lista de la puerta', () => {
  it('en un evento de colaboración cada acceso trae un color por persona (la pareja, repartida)', async () => {
    colab.isEventColab.mockResolvedValue(true);
    const out = await withPlayTeams(snap() as any);
    expect(out.playTeams).toBe(true);
    const [sola, duo, trio] = (out as any).attendees[0].access;
    expect(sola.teams).toHaveLength(1);
    expect(duo.teams).toHaveLength(2);
    expect(new Set(duo.teams).size).toBe(2);
    expect(trio.teams).toHaveLength(3);
  });

  it('en un evento normal de Playroom no agrega nada', async () => {
    colab.isEventColab.mockResolvedValue(false);
    const out = await withPlayTeams(snap() as any);
    expect((out as any).playTeams).toBeUndefined();
    expect((out as any).attendees[0].access[0].teams).toBeUndefined();
  });

  it('sin snapshot devuelve lo mismo', async () => {
    expect(await withPlayTeams(null)).toBeNull();
  });
});
