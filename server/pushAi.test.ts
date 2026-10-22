import { describe, expect, it } from 'vitest';
import { PUSH_DRAFTS_SCHEMA } from './pushAi';

/** El proveedor de IA rechaza (400) un `minItems` distinto de 0 o 1: así falló «Redactar con IA» en producción. */
function badMinItems(node: unknown, path = ''): string[] {
  if (!node || typeof node !== 'object') return [];
  const n = node as Record<string, unknown>;
  const here = typeof n.minItems === 'number' && n.minItems > 1 ? [`${path}.minItems=${n.minItems}`] : [];
  return [...here, ...Object.entries(n).flatMap(([k, v]) => badMinItems(v, `${path}.${k}`))];
}

describe('pushAi schema', () => {
  it('no usa minItems que el proveedor no soporta', () => {
    expect(badMinItems(PUSH_DRAFTS_SCHEMA)).toEqual([]);
  });
});
