import { describe, expect, it } from 'vitest';
import { buildGiftDrinkEmail, buildGiftPassEmail, buildOrderEmail, giftMessageBlock } from './email';

describe('mensaje personalizado en los correos de regalo', () => {
  it('se escapa y respeta los saltos de línea', () => {
    const html = giftMessageBlock('<b>hola</b>\nte quiero');
    expect(html).toContain('&lt;b&gt;hola&lt;/b&gt;<br>te quiero');
    expect(giftMessageBlock('   ')).toBe('');
    expect(giftMessageBlock(null)).toBe('');
  });
  it('va en el correo del trago, del pase y de la entrada directa', () => {
    expect(buildGiftDrinkEmail({ buyerName: 'Ana', eventTitle: 'Aniversario', items: [{ name: 'Piscola', quantity: 2 }], url: 'https://x/cuenta', message: 'Salud 🥂' })).toContain('Salud 🥂');
    const pass = buildGiftPassEmail({ buyerName: 'Ana', eventTitle: 'Aniversario', accesoName: 'Acceso Dúo', code: 'CREDITO-AAAAAA', url: 'https://x', message: 'Te esperamos' });
    expect(pass).toContain('Te esperamos');
    const order = buildOrderEmail({ buyerName: 'Ana', eventTitle: 'Aniversario', eventDate: 'viernes', venue: 'La Mansión', orderNumber: 'MP-1', items: [{ name: 'Acceso Dúo', quantity: 1, price: 0 }], total: 0, ambassadorCode: '', ticketReady: true, giftMessage: 'Para ti' });
    expect(order).toContain('Para ti');
    expect(buildOrderEmail({ buyerName: 'Ana', eventTitle: 'Aniversario', eventDate: 'viernes', venue: 'La Mansión', orderNumber: 'MP-1', items: [], total: 0, ambassadorCode: '', ticketReady: true })).not.toContain('Un mensaje para ti');
  });
});
