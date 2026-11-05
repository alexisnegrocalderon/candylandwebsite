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
    expect(html).not.toContain("flyer-playmore");
    expect(html).toContain('PLAYROOM × DALMORE');
    expect(html).toContain('https://dalmore.mansionplayroom.cl/?utm_campaign=playmore-lanzamiento');
    expect(html).toContain('Primera tanda');
    expect(html).not.toContain('años');
  });

  it('sin link de reel no hay segundo botón; con link sale «Míralo en Instagram»', () => {
    const base = { theme: 'playmore' as const, buyerName: '', headline: 'Se abrió la venta', paragraphs: ['Hola'], ctaUrl: 'https://dalmore.mansionplayroom.cl/' };
    expect(buildAnniversaryBlastEmail(base)).not.toContain('Míralo en Instagram');
    const html = buildAnniversaryBlastEmail({ ...base, secondaryCtaText: 'Míralo en Instagram', secondaryCtaUrl: 'https://www.instagram.com/reel/ABC123/' });
    expect(html).toContain('Míralo en Instagram');
    expect(html).toContain('https://www.instagram.com/reel/ABC123/');
  });

  it('la cabecera lleva los dos logos y PLAYMORE, como el hero de la landing', () => {
    const html = buildAnniversaryBlastEmail({ theme: 'playmore', buyerName: '', headline: 'x y z', paragraphs: ['Hola'], ctaUrl: 'https://dalmore.mansionplayroom.cl/' });
    expect(html).toContain('/playmore/playroom-logo.png');
    expect(html).toContain('/playmore/dalmore-logo.png');
    expect(html).toContain('>PLAYMORE</p>');
  });

  it('el link del reel solo acepta instagram.com por https', () => {
    expect(normalizeLanding({ reelUrl: 'https://www.instagram.com/reel/ABC123/' }).reelUrl).toBe('https://www.instagram.com/reel/ABC123/');
    expect(normalizeLanding({ reelUrl: 'https://instagram.com/p/XYZ/' }).reelUrl).toBe('https://instagram.com/p/XYZ/');
    expect(normalizeLanding({ reelUrl: 'http://instagram.com/reel/ABC/' }).reelUrl).toBe('');
    expect(normalizeLanding({ reelUrl: 'https://evil.com/instagram.com/reel/x' }).reelUrl).toBe('');
    expect(normalizeLanding({}).reelUrl).toBe('');
    expect(normalizeLanding({}).launchPush).toBe(true);
  });

  it('el contenido del mailing acepta el tema playmore', () => {
    expect(MailingContentSchema.safeParse({ subject: 'PLAYMORE ya', headline: 'Se abrió la venta', paragraphs: ['Texto de prueba'], theme: 'playmore' }).success).toBe(true);
    expect(MailingContentSchema.safeParse({ subject: 'PLAYMORE ya', headline: 'Se abrió la venta', paragraphs: ['Texto de prueba'], theme: 'playmore', secondaryCtaText: 'Míralo en Instagram', secondaryCtaUrl: 'https://www.instagram.com/reel/ABC/' }).success).toBe(true);
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
