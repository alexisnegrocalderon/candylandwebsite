import { describe, it, expect } from 'vitest';
import { discountOrigin, isAutomaticDiscount } from './discountOrigin';

describe('discountOrigin', () => {
  it('reconoce los que crea el sistema', () => {
    expect(discountOrigin({ code: 'PLAY-NZJFK3', description: 'Cupón de socio: Cumpleaños' })).toBe('socio');
    expect(discountOrigin({ code: 'JUANITA', description: 'Cumpleañero: Juana' })).toBe('cumpleanero');
    expect(discountOrigin({ code: 'AUTOAB12', description: 'Automatización de Instagram: "fiesta"' })).toBe('instagram');
    expect(discountOrigin({ code: 'FLASHAB12', description: '20% por 30 min' })).toBe('relampago');
    expect(discountOrigin({ code: 'DEMO-ABC123', description: 'Cuenta de prueba' })).toBe('prueba');
  });
  it('lo que escribe el dueño es manual', () => {
    expect(discountOrigin({ code: 'AMIGOS10', description: null })).toBe('manual');
    expect(discountOrigin({ code: 'FLASHSALE20', description: 'Mi promo' })).toBe('manual');
    expect(isAutomaticDiscount({ code: 'AMIGOS10' })).toBe(false);
  });
});
