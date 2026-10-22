import { describe, expect, it } from 'vitest';
import { PUSH_DRAFTS_SCHEMA } from './pushAi';
import { MAILING_JSON_SCHEMA } from './mailing';
import { REMINDER_JSON_SCHEMA } from './orderReminders';

/** El proveedor de IA rechaza (400) `maxItems` y un `minItems` mayor a 1 en la salida estructurada:
 * así fallaron «Redactar con IA» (push) y, por el mismo motivo, los otros esquemas con arreglos.
 * Los topes se validan del lado del servidor (zod / recorte). */
function unsupported(node: unknown, path = ''): string[] {
  if (!node || typeof node !== 'object') return [];
  const n = node as Record<string, unknown>;
  const here = [
    ...(typeof n.minItems === 'number' && n.minItems > 1 ? [`${path}.minItems=${n.minItems}`] : []),
    ...('maxItems' in n ? [`${path}.maxItems`] : []),
  ];
  return [...here, ...Object.entries(n).flatMap(([k, v]) => unsupported(v, `${path}.${k}`))];
}

describe('esquemas de salida estructurada de la IA', () => {
  it.each([
    ['push', PUSH_DRAFTS_SCHEMA],
    ['mailing', MAILING_JSON_SCHEMA],
    ['recordatorio de carrito', REMINDER_JSON_SCHEMA],
  ])('%s no usa maxItems ni minItems > 1', (_name, schema) => {
    expect(unsupported(schema)).toEqual([]);
  });
});
