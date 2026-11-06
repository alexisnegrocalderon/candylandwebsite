import { describe, expect, it } from 'vitest';
import { CROSS_CHECK_AUTOMATIONS, CROSS_CHECK_LABELS } from './crossCheck';

describe('cross check: automatizaciones', () => {
  it('cada automatización tiene su nombre y su explicación para la pantalla', () => {
    for (const k of CROSS_CHECK_AUTOMATIONS) {
      expect(CROSS_CHECK_LABELS[k].title.length).toBeGreaterThan(3);
      expect(CROSS_CHECK_LABELS[k].detail.length).toBeGreaterThan(20);
    }
  });
  it('incluye los envíos de venta, el correo de embajadores y la encuesta', () => {
    expect([...CROSS_CHECK_AUTOMATIONS].sort()).toEqual(['abandoned-cart', 'ambassador-weekly', 'founders-promo', 'sales-drip', 'survey', 'tanda2-promo']);
  });
});
