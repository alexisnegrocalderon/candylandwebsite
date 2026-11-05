import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { accessKeyForSlug, AGENT_ACCESS, buildCheckoutPath, buildColabCheckoutPath, cleanQuantity, inferAccessKey } from './agentAccess';

describe('agentAccess', () => {
  it('traduce el slug de la entrada a la llave del checkout', () => {
    expect(accessKeyForSlug('duo')).toBe('pareja');
    expect(accessKeyForSlug('duo_mujeres')).toBe('dos-mujeres');
    expect(accessKeyForSlug('soltero')).toBe('soltero');
    expect(accessKeyForSlug('grupo')).toBe('');
    expect(accessKeyForSlug(null)).toBe('');
  });
  it('arma la ruta express del checkout', () => {
    expect(buildCheckoutPath('aniversario', 'pareja')).toBe('/checkout/aniversario?rapida=1&op=pareja');
    expect(buildCheckoutPath('aniversario', 'pareja', 2)).toBe('/checkout/aniversario?rapida=1&op=pareja&items=duo:2');
  });
  it('arma la ruta del checkout de la colab con items y quien', () => {
    expect(buildColabCheckoutPath('playmore', 'dos-hombres')).toBe('/checkout/playmore?items=duo:1&quien=dos-hombres');
    expect(buildColabCheckoutPath('playmore', 'trio', 2)).toBe('/checkout/playmore?items=trio:2&quien=trio');
    expect(buildColabCheckoutPath('playmore', 'soltera')).toBe('/checkout/playmore?items=soltera:1&quien=soltera');
  });
  it('limpia la cantidad', () => {
    expect(cleanQuantity(0)).toBe(1);
    expect(cleanQuantity('3')).toBe(3);
    expect(cleanQuantity(99)).toBe(6);
    expect(cleanQuantity(undefined)).toBe(1);
  });
  it('deduce el acceso del texto solo si es inequívoco', () => {
    expect(inferAccessKey('somos pareja, cuánto sale?')).toBe('pareja');
    expect(inferAccessKey('Voy sola, me da nervios')).toBe('soltera');
    expect(inferAccessKey('somos dos mujeres')).toBe('dos-mujeres');
    expect(inferAccessKey('somos dos hombres')).toBe('dos-hombres');
    expect(inferAccessKey('vamos en grupo de 4 personas')).toBe('');
    expect(inferAccessKey('hola cuánto vale?')).toBe('');
    expect(inferAccessKey('pareja o voy sola, no sé')).toBe('');
  });
});

describe('sincronía con el checkout', () => {
  // Las llaves y slugs de acá tienen que ser los de ACCESO_OPTIONS en el checkout:
  // si alguien renombra uno allá, el botón directo dejaría de elegir el acceso.
  it('cada acceso del agente existe igual en ACCESO_OPTIONS', () => {
    const checkout = readFileSync(new URL('../client/src/pages/Checkout.tsx', import.meta.url), 'utf8');
    for (const a of AGENT_ACCESS) {
      expect(checkout).toContain(`key: '${a.key}', slug: '${a.slug}'`);
    }
  });
});
