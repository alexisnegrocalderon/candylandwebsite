import { describe, expect, it } from 'vitest';
import { artistBookingSubject, buildArtistBookingEmail } from './artistBookingEmail';

const input = {
  greetingName: 'Martina y equipo de booking', artistName: 'faedi0r', eventUrl: 'https://playmore.mansionplayroom.cl',
  setText: 'de 2:00 a 4:00 AM', setHighlight: '2:00 – 4:00 AM',
  producers: [{ name: 'Alexis Calderon', role: 'Productor de PlayRoom', phone: '+56 9 3313 5140' }, { name: 'Gino Perez', role: 'Productor de Dalmore' }],
};

describe('correo de booking a un DJ', () => {
  const html = buildArtistBookingEmail(input);
  it('lleva lo que se acordó: rol, horario de cierre, fecha, lugar, link y la franqueza sobre el evento', () => {
    expect(html).toContain('plato fuerte de Playroom');
    expect(html).toContain('perreo old school');
    expect(html).toContain('de 2:00 a 4:00 AM');
    expect(html).toContain('2:00 – 4:00 AM');
    expect(html).toContain('viernes 4 de diciembre');
    expect(html).toContain('Providencia, Santiago');
    expect(html).toContain('href="https://playmore.mansionplayroom.cl"');
    expect(html).toMatch(/fiesta liberal para mayores de 21 años/);
    expect(html).toContain('disponible el viernes 4 de diciembre');
  });
  it('va firmado por los dos productores, con el teléfono de Alexis', () => {
    expect(html).toContain('Alexis Calderon');
    expect(html).toContain('Productor de PlayRoom · +56 9 3313 5140');
    expect(html).toContain('Gino Perez');
    expect(html).toContain('Productor de Dalmore');
  });
  it('primer contacto: no habla de dinero ni de tarifas', () => {
    expect(html).not.toMatch(/tarifa|cachet|honorario|\$\d|CLP|pago/i);
  });
  it('es un correo personal: sin pie de marketing ni rastro de otras fiestas', () => {
    expect(html).not.toMatch(/Valparaíso|Instagram|aniversario|2 AÑOS|🎃|Disfraz obligatorio|Oráculo/i);
    expect(html).toContain('PLAYMORE');
    expect(artistBookingSubject()).toBe('Booking · PLAYMORE (Playroom × Dalmore) · Viernes 4 de diciembre, Providencia');
  });
});
