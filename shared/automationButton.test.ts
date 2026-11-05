import { describe, expect, it } from 'vitest';
import { isAllowedCustomButtonUrl } from './automationButton';

describe('isAllowedCustomButtonUrl', () => {
  const site = 'mansionplayroom.cl';
  it('acepta el sitio y sus subdominios (la landing de PLAYMORE)', () => {
    expect(isAllowedCustomButtonUrl('https://mansionplayroom.cl/eventos', site)).toBe(true);
    expect(isAllowedCustomButtonUrl('https://www.mansionplayroom.cl', site)).toBe(true);
    expect(isAllowedCustomButtonUrl('https://dalmore.mansionplayroom.cl', site)).toBe(true);
    expect(isAllowedCustomButtonUrl('https://dalmore.mansionplayroom.cl/?utm=ig', site)).toBe(true);
  });
  it('rechaza http, dominios ajenos y parecidos', () => {
    expect(isAllowedCustomButtonUrl('http://dalmore.mansionplayroom.cl', site)).toBe(false);
    expect(isAllowedCustomButtonUrl('https://evilmansionplayroom.cl', site)).toBe(false);
    expect(isAllowedCustomButtonUrl('https://mansionplayroom.cl.evil.com', site)).toBe(false);
    expect(isAllowedCustomButtonUrl('no es un link', site)).toBe(false);
  });
});
