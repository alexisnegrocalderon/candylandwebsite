import { describe, expect, it } from 'vitest';
import { buildOrderEmail, buildPartnerReminderEmail, buildPartnerThanksEmail } from './email';

describe('correos de la campaña aliada', () => {
  it('el recordatorio trae el horario del set, el disfraz y las reglas, escapadas', () => {
    const html = buildPartnerReminderEmail({
      buyerName: 'Ana', emoji: '🎧', label: 'Comunidad Electrónica', headline: 'B2B Aldo Medel x German Courtin',
      setTimeText: 'B2B desde la 01:00', eventTitle: '2º Aniversario', eventDate: 'viernes 30 de octubre',
      dressCode: 'Disfraz obligatorio.', rules: ['Respeto <siempre>'], ticketCode: 'MP-ABC',
    });
    expect(html).toContain('B2B desde la 01:00');
    expect(html).toContain('Respeto &lt;siempre&gt;');
    expect(html).toContain('/verificar/MP-ABC');
    expect(html).not.toMatch(/kink/i);
  });

  it('el agradecimiento muestra el código del beneficio', () => {
    const html = buildPartnerThanksEmail({
      buyerName: 'Ana', emoji: '🎧', label: 'Comunidad Electrónica', eventTitle: '2º Aniversario',
      discountCode: 'VUELVE20', benefitText: '20% en tu próxima entrada',
    });
    expect(html).toContain('VUELVE20');
    expect(html).toContain('20% en tu próxima entrada');
  });

  it('el correo de compra agrega las reglas solo si la compra es de la campaña', () => {
    const base = {
      buyerName: 'Ana', eventTitle: 'Aniversario', eventDate: 'viernes', venue: 'La Mansión', orderNumber: 'MP-1',
      items: [{ name: 'Dúo', quantity: 1, price: 10000 }], total: 10500, ambassadorCode: 'X', ticketReady: true,
    };
    expect(buildOrderEmail(base)).not.toContain('Bienvenid@ a Playroom');
    const partnerHtml = buildOrderEmail({ ...base, partnerWelcome: { label: 'Comunidad Electrónica', emoji: '🎧', rules: ['Regla uno'] } });
    expect(partnerHtml).toContain('Regla uno');
    expect(partnerHtml).not.toMatch(/kink/i);
  });
});

describe('vista previa del link /electronica', () => {
  it('injectMeta puede marcar la página como noindex', async () => {
    const { injectMeta } = await import('./_core/htmlTemplate');
    const html = '<head><title>x</title><meta name="robots" content="index, follow" /></head>';
    expect(injectMeta(html, { robots: 'noindex, nofollow' })).toContain('content="noindex, nofollow"');
  });
});
