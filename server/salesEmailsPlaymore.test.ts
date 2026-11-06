import { describe, expect, it } from 'vitest';
import { buildMailingBlastEmail } from './email';
import { buildFoundersPromoContent } from './foundersPromo';
import { buildTanda2PromoContent } from './tanda2Promo';
import { buildSalesDripContent } from './salesDrip';
import { SALES_EMAIL_SECTIONS } from './mailing';

// Lo que el correo de venta de PLAYMORE (4 de diciembre, Providencia) NO puede decir: nada de la fiesta anterior.
const OLD_PARTY = [/aniversario/i, /2 AÑOS/, /30 DE OCTUBRE/i, /30 de octubre/i, /🎃/, /Disfraz obligatorio/i, /Oráculo/i, /Valparaíso/i, /Viña/i];

const facts = { fechaTexto: 'Viernes 4 de diciembre', dressCode: 'Elegante, con brillo. Nada de tenida deportiva.', colab: true, theme: 'playmore' as const };
const event = { id: 1, title: 'PlayMore', slug: 'playmore', eventDate: new Date('2026-12-05T01:00:00Z'), venue: 'Casa Dalmore', tandaPhaseIndex: 1, tandaDiscountSchedule: null };
const info = { title: 'PlayMore', dateText: 'Viernes 4 de diciembre, 22:00 hrs', venue: 'Casa Dalmore', address: 'Providencia, Santiago', mapsUrl: 'https://maps.app.goo.gl/x', mission300: null };
const prices = [{ label: 'General', price: 12000, originalPrice: 15000 }] as any;

/** El pie de todos los correos de la empresa («© 2026 Mansion Playroom · Valparaíso, Chile») no es del evento. */
const withoutFooter = (html: string) => html.replace(/©[^<]*Valparaíso, Chile/, '');

function render(content: ReturnType<typeof buildFoundersPromoContent>, tandaLabel?: string) {
  return withoutFooter(buildMailingBlastEmail({
    buyerName: 'Ana', preheader: content.preheader, headline: content.headline, paragraphs: content.paragraphs, ctaText: content.ctaText,
    ctaUrl: 'https://mansionplayroom.cl/checkout/playmore', highlightLabel: content.highlightLabel, highlightValue: content.highlightValue,
    eventInfo: info, eventSections: SALES_EMAIL_SECTIONS, theme: content.theme, priceList: prices, remaining: 40, tandaLabel,
  }));
}

describe('correos de venta de una colaboración (PLAYMORE)', () => {
  it('primeros cupos: look PLAYMORE, con lugar y sin rastro del aniversario', () => {
    const c = buildFoundersPromoContent(40, { title: 'PlayMore', slug: 'playmore' }, facts);
    const html = render(c, 'Primera tanda');
    for (const re of OLD_PARTY) expect(html + c.subject + c.paragraphs.join(' ')).not.toMatch(re);
    expect(html).toContain('PLAYMORE');
    expect(html).toContain('Providencia, Santiago');
    expect(html).toContain('Viernes 4 de diciembre');
    expect(c.paragraphs.join(' ')).toContain('Elegante, con brillo');
  });

  it('2ª tanda: la tarjeta de precios dice «2ª tanda», no «Primera tanda»', () => {
    const c = buildTanda2PromoContent(12000, { title: 'PlayMore', slug: 'playmore' }, facts);
    const html = render(c, '2ª tanda');
    for (const re of OLD_PARTY) expect(html + c.subject + c.headline).not.toMatch(re);
    expect(html).toContain('2ª tanda');
    expect(html).not.toContain('Primera tanda');
  });

  it('tanda final: el aviso diario trae el nombre de la tanda y el lugar del evento', () => {
    const c = { ...buildSalesDripContent(event as any, { priceFrom: 12000, prices: [], remaining: 20 } as any, new Date('2026-11-20T12:00:00Z')), theme: facts.theme };
    const html = render(c, 'Tanda final');
    for (const re of OLD_PARTY) expect(html + c.subject + c.paragraphs.join(' ')).not.toMatch(re);
    expect(html).toContain('Tanda final');
    expect(c.paragraphs.join(' ')).toContain('Casa Dalmore');
  });

  it('un evento sin código de vestimenta propio no hereda el del aniversario', () => {
    const c = buildFoundersPromoContent(40, { title: 'PlayMore', slug: 'playmore' }, { fechaTexto: 'Viernes 4 de diciembre', dressCode: '', colab: true, theme: 'playmore' });
    expect(c.paragraphs).toHaveLength(2);
    expect(c.paragraphs.join(' ')).not.toMatch(/disfraz/i);
  });

  it('un evento que no es colaboración ya no lleva 🎃 en el aviso de la 2ª tanda', () => {
    const c = buildTanda2PromoContent(12000, { title: 'Otra fiesta', slug: 'otra' }, { fechaTexto: 'Sábado 10', dressCode: '', colab: false });
    expect(c.headline).not.toContain('🎃');
    expect(c.theme).toBeUndefined();
  });
});
