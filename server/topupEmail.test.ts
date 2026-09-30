import { describe, it, expect } from 'vitest';
import { buildTopupCodeEmail, buildTopupEmail } from './email';

describe('correos de recarga de PlayCard', () => {
  it('el correo del código muestra los 6 dígitos tal cual, seleccionables', () => {
    const html = buildTopupCodeEmail({ code: '048213' });
    expect(html).toContain('048213');
    expect(html).toContain('user-select:all');
    expect(html).toContain('Vale por 10 minutos');
  });

  it('la confirmación muestra el monto cargado y el saldo nuevo', () => {
    const html = buildTopupEmail({
      buyerName: 'Camila', orderNumber: 'MP-ABC-1', amount: 20000, newBalance: 38500, pinSet: true,
      cardUrl: 'https://example.com/verificar/MP-X',
    });
    expect(html).toContain('$38.500');
    expect(html).toContain('$20.000');
    expect(html).toContain('MP-ABC-1');
    expect(html).toContain('https://example.com/verificar/MP-X');
    expect(html).toContain('PIN de 4 dígitos al barman');
  });

  it('sin PIN invita a crearlo en la próxima recarga', () => {
    const html = buildTopupEmail({
      buyerName: 'Beto', orderNumber: 'MP-ABC-2', amount: 10000, newBalance: 10000, pinSet: false,
      cardUrl: 'https://example.com/recargar',
    });
    expect(html).toContain('Todavía no tienes PIN');
  });
});
