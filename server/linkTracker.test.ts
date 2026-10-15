import { describe, expect, it } from 'vitest';
import { cleanOrigin, safeInternalPath } from './linkTracker';
import { trackedUrl } from './agentLinks';

describe('linkTracker', () => {
  it('solo rutas internas', () => {
    expect(safeInternalPath('/eventos/x?utm_source=instagram')).toBe('/eventos/x?utm_source=instagram');
    expect(safeInternalPath('//evil.com')).toBeNull();
    expect(safeInternalPath('https://evil.com')).toBeNull();
    expect(safeInternalPath('/\\evil.com')).toBeNull();
    expect(safeInternalPath(undefined)).toBeNull();
  });
  it('limpia el origen', () => {
    expect(cleanOrigin('ref-Bio')).toBe('ref-bio');
    expect(cleanOrigin('')).toBe('sin-origen');
  });
  it('envuelve links del sitio y deja los ajenos', () => {
    const wrapped = trackedUrl('https://mansionplayroom.cl/eventos/x?utm_campaign=agente&utm_content=ref-bio');
    expect(wrapped).toBe('https://mansionplayroom.cl/api/go?o=ref-bio&to=' + encodeURIComponent('/eventos/x?utm_campaign=agente&utm_content=ref-bio'));
    expect(trackedUrl(wrapped)).toBe(wrapped);
    expect(trackedUrl('https://instagram.com/x')).toBe('https://instagram.com/x');
  });
});
