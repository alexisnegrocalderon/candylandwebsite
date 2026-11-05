import { describe, expect, it } from 'vitest';
import type { Request } from 'express';
import { buildAnniversaryBlastEmail } from './emailAniversario';
import { sharedCookieDomain } from './memberAuth';
import { normalizeLanding } from '../shared/coproduction';
import { MailingContentSchema } from './mailing';

const req = (host: string) => ({ headers: { host } }) as unknown as Request;

describe('lanzamiento PLAYMORE', () => {
  it('la plantilla PLAYMORE lleva el flyer, los dos logos y el botón a la landing', () => {
    const html = buildAnniversaryBlastEmail({
      theme: 'playmore', buyerName: 'Ana', headline: 'Se abrió la venta de PLAYMORE', paragraphs: ['Hola'],
      ctaUrl: 'https://dalmore.mansionplayroom.cl/?utm_campaign=playmore-lanzamiento',
      priceList: [{ label: 'Acceso pareja', price: 35000, originalPrice: 60000 }],
    });
    expect(html).toContain('/playmore/flyer-playmore.jpg');
    expect(html).toContain('PLAYROOM × DALMORE');
    expect(html).toContain('https://dalmore.mansionplayroom.cl/?utm_campaign=playmore-lanzamiento');
    expect(html).toContain('Primera tanda');
    expect(html).not.toContain('años');
  });

  it('el contenido del mailing acepta el tema playmore', () => {
    expect(MailingContentSchema.safeParse({ subject: 'PLAYMORE ya', headline: 'Se abrió la venta', paragraphs: ['Texto de prueba'], theme: 'playmore' }).success).toBe(true);
  });

  it('el mailing de lanzamiento viene prendido y sin marca hasta la primera activación', () => {
    const l = normalizeLanding({});
    expect(l.launchMailing).toBe(true);
    expect(l.launchedAt).toBe('');
    expect(normalizeLanding({ launchedAt: 'cualquier cosa' }).launchedAt).toBe('');
    expect(normalizeLanding({ launchedAt: '2026-11-05T15:30:00.000Z', launchMailing: false })).toMatchObject({ launchedAt: '2026-11-05T15:30:00.000Z', launchMailing: false });
  });

  it('la sesión de «Mi cuenta» se comparte entre mansionplayroom.cl y sus subdominios', () => {
    expect(sharedCookieDomain(req('mansionplayroom.cl'))).toBe('.mansionplayroom.cl');
    expect(sharedCookieDomain(req('dalmore.mansionplayroom.cl'))).toBe('.mansionplayroom.cl');
    expect(sharedCookieDomain(req('DALMORE.mansionplayroom.cl:443'))).toBe('.mansionplayroom.cl');
    expect(sharedCookieDomain(req('candyland.vercel.app'))).toBeUndefined();
    expect(sharedCookieDomain(req('evilmansionplayroom.cl'))).toBeUndefined();
  });
});
