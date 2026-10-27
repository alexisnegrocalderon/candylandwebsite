import { describe, expect, it } from 'vitest';
import { isChunkLoadError } from './staleChunk';

describe('isChunkLoadError', () => {
  it('reconoce los mensajes de los navegadores cuando falta un archivo de una versión anterior', () => {
    expect(isChunkLoadError(new TypeError('Importing a module script failed.'))).toBe(true); // Safari / iPhone
    expect(isChunkLoadError(new TypeError('Failed to fetch dynamically imported module: https://x.cl/assets/a-1.js'))).toBe(true); // Chrome
    expect(isChunkLoadError(new Error('error loading dynamically imported module'))).toBe(true); // Firefox
    expect(isChunkLoadError(new Error('Loading chunk 12 failed.'))).toBe(true);
  });
  it('no confunde otros errores de la pantalla', () => {
    expect(isChunkLoadError(new Error("Cannot read properties of undefined (reading 'map')"))).toBe(false);
    expect(isChunkLoadError(null)).toBe(false);
  });
});
