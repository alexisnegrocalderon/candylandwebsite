import { describe, it, expect } from 'vitest';
import { normalizeAdminAlertsConfig, URGENT_CAJA_ALERT_KINDS } from './adminAlertsConfig';

describe('modo evento (solo urgentes durante la fiesta)', () => {
  it('viene activado por defecto', () => {
    expect(normalizeAdminAlertsConfig(undefined).eventModeQuiet).toBe(true);
    expect(normalizeAdminAlertsConfig({}).eventModeQuiet).toBe(true);
  });
  it('respeta cuando se apaga', () => {
    expect(normalizeAdminAlertsConfig({ eventModeQuiet: false }).eventModeQuiet).toBe(false);
  });
  it('las alertas de caja urgentes incluyen la clave de admin fallida', () => {
    expect(URGENT_CAJA_ALERT_KINDS).toContain('admin_password_failed');
  });
});
