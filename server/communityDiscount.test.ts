import { beforeEach, describe, expect, it, vi } from 'vitest';

const requestCrossCheck = vi.fn();
vi.mock('./crossCheck', async () => {
  class CrossCheckRetry extends Error {}
  return { CrossCheckRetry, requestCrossCheck: (...a: unknown[]) => requestCrossCheck(...a), endOfChileDay: () => new Date('2026-11-15T02:59:59Z') };
});
vi.mock('./communityDiscountList', () => ({
  COMMUNITY_DISCOUNT_EMAILS: ['Ana@Example.com', 'ana@example.com', 'luis@example.com', 'malo'],
}));
vi.mock('./privateMembersList', () => ({ PRIVATE_MEMBERS_EMAILS: { soltera: [], pareja: [] } }));

import {
  COMMUNITY_DISCOUNT_SUBJECT, buildCommunityDiscountEmail, communityRecipients, ensureCommunityDiscountRequest,
  generateCommunityCode, getCommunityDiscountPreview,
} from './communityDiscount';

beforeEach(() => { vi.clearAllMocks(); });

describe('código del 30% Community Dalmore', () => {
  it('destinatarios: minúsculas, sin repetidos ni inválidos', () => {
    expect(communityRecipients()).toEqual(['ana@example.com', 'luis@example.com']);
  });

  it('el código es legible, único por intento y sin caracteres confusos', () => {
    const a = generateCommunityCode();
    expect(a).toMatch(/^DALMORE30-[A-HJ-NP-Z2-9]{6}$/);
    expect(new Set(Array.from({ length: 50 }, generateCommunityCode)).size).toBeGreaterThan(45);
  });

  it('el correo lleva el texto aprobado, el código, el link y el bloque de la app', () => {
    const html = buildCommunityDiscountEmail({ name: 'Camila Pérez', code: 'DALMORE30-ABC234', checkoutUrl: 'https://x.cl/checkout/ev?code=DALMORE30-ABC234' });
    expect(html).toContain('membresía <strong>Community</strong> de Dalmore');
    expect(html).toContain('DALMORE30-ABC234');
    expect(html).toContain('href="https://x.cl/checkout/ev?code=DALMORE30-ABC234"');
    expect(html).toContain('30% de descuento');
    expect(html).toContain('antes de que se agoten los cupos');
    expect(html).toContain('Neón / Fluorescente');
    expect(html).toContain('Descarga la app de Playroom');
    expect(html).toContain('/app?src=email-community-dalmore');
    expect(html).toContain('TE ESPERAMOS');
    expect(html).toContain('Hola, Camila');
    expect(COMMUNITY_DISCOUNT_SUBJECT).toBe('Tu código exclusivo para PLAYMORE | Dalmore x Mansión Playroom (4 de diciembre)');
  });

  it('deja un solo pedido que vence hoy, y pasado el día no crea nada', async () => {
    requestCrossCheck.mockResolvedValue(true);
    expect(await ensureCommunityDiscountRequest(new Date('2026-11-14T15:00:00Z'))).toBe(1);
    expect(requestCrossCheck).toHaveBeenCalledWith(expect.objectContaining({ kind: 'community-discount', dedupeKey: 'community-discount:2026-11-14' }));
    requestCrossCheck.mockClear();
    expect(await ensureCommunityDiscountRequest(new Date('2026-11-15T12:00:00Z'))).toBe(0);
    expect(requestCrossCheck).not.toHaveBeenCalled();
  });

  it('la vista previa usa un código de ejemplo y trae los destinatarios', () => {
    const p = getCommunityDiscountPreview();
    expect(p.recipients).toHaveLength(2);
    expect(p.html).toContain('DALMORE30-EJEMPLO');
  });
});
