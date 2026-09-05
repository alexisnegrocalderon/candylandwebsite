import { describe, expect, it } from "vitest";
import { buildOrderEmail } from "./email";
import { row } from "./emailLayout";

const base = {
  buyerName: 'Camila',
  eventTitle: '2º Aniversario',
  eventDate: 'Viernes 30 de octubre',
  venue: 'La Mansión',
  orderNumber: 'MP-TEST-0001',
  items: [{ name: 'ACCESO SOLTERA', quantity: 1, price: 10000 }],
  total: 1100,
  serviceFee: 100,
  ambassadorCode: 'CAMI123',
  ticketReady: true,
  ticketCode: 'ABC123',
  attendeeNames: ['Camila Pérez'],
};

describe('row()', () => {
  /* La regresión concreta que motivó todo esto: el correo usaba
   * `display:flex; justify-content:space-between` para las filas de precio.
   * Gmail borra `display:flex`, así que los dos lados quedaban pegados y se
   * leía `1x ACCESO SOLTERA$10.000`. La única forma confiable en correo es
   * una tabla de dos celdas. */
  it('arma una tabla de dos celdas, nunca flex', () => {
    const html = row('<span>Izquierda</span>', '<span>Derecha</span>');
    expect(html).toContain('<table');
    expect(html).toContain('align="left"');
    expect(html).toContain('align="right"');
    expect(html).not.toContain('display:flex');
  });
});

describe('buildOrderEmail', () => {
  it('no usa display:flex en ninguna parte (Gmail lo borra)', () => {
    expect(buildOrderEmail(base)).not.toContain('display:flex');
  });

  it('muestra la fila de descuento cuando hubo descuento', () => {
    // Sin esta fila la cuenta no cierra a la vista: $10.000 de acceso más
    // $100 de servicio con un total de $1.100 parece un error de cobro.
    const html = buildOrderEmail({ ...base, discount: 9000 });
    expect(html).toContain('Descuento');
    expect(html).toContain('9.000');
  });

  it('omite la fila de descuento cuando no hubo', () => {
    expect(buildOrderEmail(base)).not.toContain('Descuento');
  });

  it('deja el QR sobre fondo blanco (un escáner no lee un QR sobre negro)', () => {
    expect(buildOrderEmail(base)).toContain('background:#FFFFFF');
  });

  it('pone la entrada antes que el resumen de compra', () => {
    const html = buildOrderEmail(base);
    expect(html.indexOf('Muestra este código')).toBeLessThan(html.indexOf('Tu compra'));
  });

  it('por defecto trae los bloques útiles y deja fuera los de marca', () => {
    const html = buildOrderEmail(base);
    expect(html).toContain('Antes de venir');
    expect(html).toContain('Tu código de embajador');
    expect(html).not.toContain('¿Qué encontrarás?');
    expect(html).not.toContain('Preguntas rápidas');
  });

  it('permite volver a prender un bloque apagado', () => {
    const html = buildOrderEmail({ ...base, sections: { faq: true, encontraras: true } });
    expect(html).toContain('Preguntas rápidas');
    expect(html).toContain('¿Qué encontrarás?');
  });

  it('sin QR todavía (abono Misión 300) explica que llega después', () => {
    const html = buildOrderEmail({ ...base, ticketReady: false, ticketCode: undefined, isMissionDeposit: true });
    expect(html).toContain('Misión 300');
    expect(html).not.toContain('Muestra este código');
  });
});
