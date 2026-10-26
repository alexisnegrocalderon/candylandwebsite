import { describe, expect, it } from 'vitest';
import { horizontalSwipe, isAtScrollEnd, shouldChainToNextTab } from './cardSwipe';

describe('horizontalSwipe', () => {
  it('reconoce un deslizar horizontal claro', () => {
    expect(horizontalSwipe(-90, 10)).toBe('left');
    expect(horizontalSwipe(90, -10)).toBe('right');
  });
  it('ignora lo corto y lo diagonal o vertical', () => {
    expect(horizontalSwipe(-59, 0)).toBeNull();
    expect(horizontalSwipe(-100, 80)).toBeNull();
    expect(horizontalSwipe(0, -200)).toBeNull();
  });
});

describe('isAtScrollEnd', () => {
  it('detecta la última tarjeta con holgura por el redondeo', () => {
    expect(isAtScrollEnd(780, 390, 1170)).toBe(true);
    expect(isAtScrollEnd(778, 390, 1170)).toBe(true);
    expect(isAtScrollEnd(390, 390, 1170)).toBe(false);
    expect(isAtScrollEnd(0, 390, 390)).toBe(true);
  });
});

describe('shouldChainToNextTab', () => {
  it('en la última tarjeta, deslizar a la izquierda pasa a la pestaña siguiente', () => {
    expect(shouldChainToNextTab({ dx: -120, dy: 5, atEndAtStart: true })).toBe(true);
  });
  it('si el carrusel no estaba en la última tarjeta al empezar el gesto, no encadena', () => {
    expect(shouldChainToNextTab({ dx: -120, dy: 5, atEndAtStart: false })).toBe(false);
  });
  it('hacia la derecha o con un gesto dudoso, no encadena', () => {
    expect(shouldChainToNextTab({ dx: 120, dy: 5, atEndAtStart: true })).toBe(false);
    expect(shouldChainToNextTab({ dx: -70, dy: 60, atEndAtStart: true })).toBe(false);
  });
});
