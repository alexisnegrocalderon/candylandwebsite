import { beforeEach, describe, expect, it, vi } from 'vitest';

const requestCrossCheck = vi.fn();
vi.mock('./privateMembersList', () => ({
  PRIVATE_MEMBERS_EMAILS: {
    soltera: Array.from({ length: 7 }, (_, i) => `sola${i}@example.com`),
    pareja: Array.from({ length: 38 }, (_, i) => `pareja${i}@example.com`),
  },
}));
vi.mock('./crossCheck', async () => {
  class CrossCheckRetry extends Error {}
  return {
    CrossCheckRetry,
    requestCrossCheck: (...a: unknown[]) => requestCrossCheck(...a),
    endOfChileDay: () => new Date('2026-11-15T02:59:59Z'),
  };
});

import {
  PRIVATE_MEMBERS_GROUPS, PRIVATE_MEMBERS_SUBJECT, buildPrivateMembersEmail, ensurePrivateMembersRequests,
  getPrivateMembersPreview, isPrivateMembersKind, normalizeRecipients, recipientsOf,
} from './privateMembers';

const soltera = PRIVATE_MEMBERS_GROUPS.find((g) => g.key === 'soltera')!;
const pareja = PRIVATE_MEMBERS_GROUPS.find((g) => g.key === 'pareja')!;
beforeEach(() => { vi.clearAllMocks(); });

describe('lista PRIVATE MEMBERS', () => {
  it('normaliza: minúsculas, sin espacios, sin repetidos ni inválidos', () => {
    expect(normalizeRecipients([' Ana@Gmail.com ', 'ana@gmail.com', 'no-es-correo', ''])).toEqual(['ana@gmail.com']);
  });

  it('son 7 mujeres solas y 38 parejas, todas distintas entre sí', () => {
    expect(recipientsOf(soltera)).toHaveLength(7);
    expect(recipientsOf(pareja)).toHaveLength(38);
    expect(new Set([...recipientsOf(soltera), ...recipientsOf(pareja)]).size).toBe(45);
  });

  it('mujer sola = acceso Soltera; pareja = acceso Dúo', () => {
    expect(soltera.accesoSlug).toBe('soltera');
    expect(pareja.accesoSlug).toBe('duo');
  });
});

describe('correo PLAYMORE', () => {
  it('lleva el texto aprobado, el tipo de entrada y el look PLAYMORE', () => {
    const html = buildPrivateMembersEmail(pareja, { name: 'Camila Pérez' });
    expect(html).toContain('PRIVATE MEMBERS');
    expect(html).toContain('Dúo · 2 personas');
    expect(html).toContain('Entrada de cortesía');
    expect(html).toContain('Viernes 4 de diciembre de 2026');
    expect(html).toContain('Providencia, Santiago');
    expect(html).toContain('Open Air');
    expect(html).toContain('Neón / Fluorescente');
    expect(html).toContain('NOS VEMOS EL VIERNES 4 DE DICIEMBRE');
    expect(html).toContain('PLAYROOM × DALMORE');
    expect(html).toContain('Hola, Camila');
  });

  it('invita a descargar la app con Playmatch, antes del cierre', () => {
    const html = buildPrivateMembersEmail(soltera);
    expect(html).toContain('Descarga la app de Playroom');
    expect(html).toContain('Playmatch');
    expect(html).toContain('/app?src=email-private-members');
    expect(html.indexOf('Descarga la app')).toBeLessThan(html.indexOf('NOS VEMOS EL VIERNES'));
  });

  it('nunca dice el recinto ni la dirección exacta', () => {
    const html = buildPrivateMembersEmail(soltera);
    expect(html).not.toMatch(/Mansi[oó]n Playroom\s*[—-]\s*\w+ \d+/);
  });

  it('con QR reales los muestra; sin ellos va la caja de ejemplo', () => {
    expect(buildPrivateMembersEmail(soltera, { qrCodes: ['MP-ABC123'] })).toContain('/api/qr/MP-ABC123.png');
    expect(buildPrivateMembersEmail(soltera)).toContain('Aquí va tu código QR');
  });

  it('escapa el nombre', () => {
    expect(buildPrivateMembersEmail(soltera, { name: '<b>x</b>' })).not.toContain('<b>x</b>');
  });

  it('el asunto es el pedido', () => {
    expect(PRIVATE_MEMBERS_SUBJECT).toBe('Te enviamos tus entradas para PLAYMORE | Dalmore x Mansión Playroom (4 de diciembre)');
  });
});

describe('pedidos de Cross check', () => {
  it('deja dos pedidos (uno por grupo) que vencen hoy, y no se repiten', async () => {
    requestCrossCheck.mockResolvedValue(true);
    expect(await ensurePrivateMembersRequests(new Date('2026-11-14T15:00:00Z'))).toBe(2);
    const calls = requestCrossCheck.mock.calls.map((c) => c[0]);
    expect(calls.map((c) => c.kind)).toEqual(['private-members:soltera', 'private-members:pareja']);
    expect(calls[0].dedupeKey).toBe('private-members:soltera:2026-11-14');
    expect(calls[0].expiresAt.toISOString()).toBe('2026-11-15T02:59:59.000Z');
  });

  it('pasado el día pedido ya no crea nada', async () => {
    expect(await ensurePrivateMembersRequests(new Date('2026-11-15T12:00:00Z'))).toBe(0);
    expect(requestCrossCheck).not.toHaveBeenCalled();
  });

  it('la vista previa trae el correo y la lista de destinatarios', () => {
    const p = getPrivateMembersPreview('private-members:soltera')!;
    expect(p.recipients).toHaveLength(7);
    expect(p.html).toContain('Soltera · 1 persona');
    expect(getPrivateMembersPreview('outreach')).toBeNull();
    expect(isPrivateMembersKind('private-members:pareja')).toBe(true);
    expect(isPrivateMembersKind('private-members:otro')).toBe(false);
  });
});
