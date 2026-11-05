import { describe, expect, it } from 'vitest';
import { buildAmbassadorReferralUrl } from './ambassadorProgram';

describe('link de embajador', () => {
  const colab = { slug: 'playmore-2026', host: 'dalmore.mansionplayroom.cl' };
  it('el evento de la colab va a su landing con el código', () => {
    expect(buildAmbassadorReferralUrl({ slug: 'playmore-2026' }, 'ANA', colab)).toBe('https://dalmore.mansionplayroom.cl/?embajador=ANA');
  });
  it('los demás eventos siguen yendo a su página', () => {
    expect(buildAmbassadorReferralUrl({ slug: 'aniversario' }, 'ANA', colab)).toMatch(/\/eventos\/aniversario\?embajador=ANA$/);
    expect(buildAmbassadorReferralUrl({ slug: 'aniversario' }, 'ANA')).toMatch(/\/eventos\/aniversario\?embajador=ANA$/);
    expect(buildAmbassadorReferralUrl(null, 'ANA', colab)).toBeNull();
  });
});
