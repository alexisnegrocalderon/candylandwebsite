import { describe, expect, it } from 'vitest';
import { buildOrderEmail } from './email';

const base = {
  buyerName: 'Ana', eventTitle: 'PLAYMORE', eventDate: 'viernes 4 de diciembre', venue: 'Nuevo spot', address: 'Av. Providencia 1234, Providencia',
  orderNumber: 'A1', items: [{ name: 'Acceso Dúo', quantity: 1, price: 40000 }], total: 40000, ambassadorCode: 'ANA', ticketReady: true, ticketCode: 'TK1',
};
const colab = { partnerName: 'Dalmore', partnerLogoUrl: '', eventName: 'PLAYMORE', dressCode: 'Elegante, atrevido y a tu medida.', highlights: ['Line up de DJs especial para esta fusión', 'Nuevos playgrounds'], about: 'La fusión de dos fiestas.' };

describe('correo de compra de una colaboración', () => {
  const html = buildOrderEmail({ ...base, colab });
  it('muestra la dirección en texto y los links para abrirla en el GPS', () => {
    expect(html).toContain('Av. Providencia 1234, Providencia');
    expect(html).toContain('https://www.google.com/maps/search/?api=1&query=');
    expect(html).toContain('waze.com/ul?q=');
  });
  it('no arrastra nada de la fiesta anterior ni del recinto de siempre', () => {
    expect(html).not.toMatch(/estacionamiento/i);
    expect(html).not.toMatch(/disfraz/i);
    expect(html).not.toMatch(/aniversario/i);
    expect(html).not.toMatch(/Qué es Mansion Playroom/);
    expect(html).not.toMatch(/pistas/i);
  });
  it('usa el dress code, lo que hay y la edad de la colaboración', () => {
    expect(html).toContain('Elegante, atrevido y a tu medida.');
    expect(html).toContain('Nuevos playgrounds');
    expect(html).toContain('Bar con barra de tragos');
    expect(html).toContain('Guardarropía');
    expect(html).toContain('mayores de 21');
    expect(html).toContain('Qué es PLAYMORE');
  });
  it('un evento normal de Playroom sigue igual', () => {
    const plain = buildOrderEmail({ ...base });
    expect(plain).toMatch(/estacionamiento/i);
    expect(plain).not.toContain('waze.com');
  });
});
