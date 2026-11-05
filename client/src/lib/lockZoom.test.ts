import { describe, expect, it } from 'vitest';
import { lockedViewportContent } from './lockZoom';

describe('lockedViewportContent', () => {
  it('bloquea el zoom y conserva el ancho y la zona segura', () => {
    const c = lockedViewportContent('width=device-width, initial-scale=1.0, viewport-fit=cover');
    expect(c).toContain('width=device-width');
    expect(c).toContain('viewport-fit=cover');
    expect(c).toContain('maximum-scale=1');
    expect(c).toContain('user-scalable=no');
    expect(c.match(/initial-scale/g)).toHaveLength(1);
  });
  it('reemplaza valores anteriores y no se duplica', () => {
    const once = lockedViewportContent('width=device-width, user-scalable=yes, maximum-scale=5');
    expect(once).not.toContain('user-scalable=yes');
    expect(once).not.toContain('maximum-scale=5');
    expect(lockedViewportContent(once)).toBe(once);
  });
  it('sin viewport usa uno completo', () => {
    expect(lockedViewportContent(null)).toContain('width=device-width');
  });
});
