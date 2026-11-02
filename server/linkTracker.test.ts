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
  it('lleva la conversación del agente para el embudo (t=)', () => {
    const wrapped = trackedUrl('https://mansionplayroom.cl/checkout/aniversario?rapida=1&op=pareja&utm_campaign=agente', 42);
    expect(wrapped).toBe('https://mansionplayroom.cl/api/go?o=agente&t=42&to=' + encodeURIComponent('/checkout/aniversario?rapida=1&op=pareja&utm_campaign=agente'));
    // El destino sigue siendo una ruta interna segura y conserva el acceso elegido.
    const to = new URL(wrapped).searchParams.get('to');
    expect(safeInternalPath(to)).toBe('/checkout/aniversario?rapida=1&op=pareja&utm_campaign=agente');
  });
});
