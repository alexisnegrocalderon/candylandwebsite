import { describe, expect, it } from 'vitest';
import { ADDRESS_SAFE_REPLY, PUBLIC_PLACE, VENUE_RETRY, leaksVenue, scrubVenue } from './venuePrivacy';

describe('privacidad del lugar', () => {
  it('pilla el recinto y las direcciones, y deja pasar el sector', () => {
    for (const t of ['Es en el Hipódromo de Santiago, sector Providencia', 'queda en el hipodromo', 'Av. Siempre Viva 742', 'en calle Los Olmos 1234', 'Avenida Providencia 2222']) {
      expect(leaksVenue(t), t).toBe(true);
    }
    for (const t of ['Es en Providencia, Santiago 💜', 'La ubicación exacta te llega al correo', 'Son las 22:00 hrs', 'Cuesta $12.500 la entrada', 'Un nuevo spot especial · Providencia']) {
      expect(leaksVenue(t), t).toBe(false);
    }
  });

  it('saca las frases que dicen el lugar y deja el resto', () => {
    const out = scrubVenue('¡Hola! 💜 Es en el Hipódromo de Santiago, sector Providencia. ¿Vienes en pareja, en grupo o por tu cuenta?');
    expect(out).not.toMatch(/hip[oó]dromo/i);
    expect(out).toContain('¿Vienes en pareja, en grupo o por tu cuenta?');
    expect(out).toContain('ubicación exacta');
  });

  it('si no queda nada, responde con el sector y el correo de confirmación', () => {
    expect(scrubVenue('Es en el Hipódromo de Santiago')).toBe(ADDRESS_SAFE_REPLY);
    expect(ADDRESS_SAFE_REPLY).toContain(PUBLIC_PLACE);
    expect(ADDRESS_SAFE_REPLY).toContain('correo de confirmación de tu compra');
    expect(leaksVenue(ADDRESS_SAFE_REPLY)).toBe(false);
    expect(VENUE_RETRY).toContain(PUBLIC_PLACE);
  });
});
