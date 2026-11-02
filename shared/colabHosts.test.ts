import { describe, expect, it } from 'vitest';
import { colabHomeRedirectActive, colabSlugForHost, isColabHost } from './colabHosts';

describe('colabHosts', () => {
  it('reconoce los subdominios de la colab', () => {
    expect(colabSlugForHost('dalmore.mansionplayroom.cl')).toBe('dalmore');
    expect(colabSlugForHost('PLAYMORE.mansionplayroom.cl:443')).toBe('dalmore');
    expect(isColabHost('mansionplayroom.cl')).toBe(false);
  });
  const before = Date.parse('2026-11-10T12:00:00-03:00');
  const after = Date.parse('2026-12-05T07:00:00-03:00');
  it('desvía la home de Playroom hasta la fecha del evento', () => {
    expect(colabHomeRedirectActive('mansionplayroom.cl', '', before)).toBe(true);
    expect(colabHomeRedirectActive('www.mansionplayroom.cl', '?utm_source=ig', before)).toBe(true);
    expect(colabHomeRedirectActive('mansionplayroom.cl', '', after)).toBe(false);
  });
  it('no desvía la app instalada, la bienvenida ni otros hosts', () => {
    expect(colabHomeRedirectActive('mansionplayroom.cl', '?source=app', before)).toBe(false);
    expect(colabHomeRedirectActive('mansionplayroom.cl', '?bienvenida=1', before)).toBe(false);
    expect(colabHomeRedirectActive('dalmore.mansionplayroom.cl', '', before)).toBe(false);
    expect(colabHomeRedirectActive('candylandwebsite.vercel.app', '', before)).toBe(false);
  });
});
