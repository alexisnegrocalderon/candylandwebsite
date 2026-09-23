import { describe, expect, it, vi } from 'vitest';
import * as instagramAgent from './instagramAgent';
import { resolveInstagramBuyLink } from './instagramInteractive';

vi.mock('./instagramAgent', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./instagramAgent')>();
  return { ...actual, getUpcomingPublicEvents: vi.fn() };
});
const getUpcomingPublicEventsMock = vi.mocked(instagramAgent.getUpcomingPublicEvents);

describe('resolveInstagramBuyLink', () => {
  it('devuelve el link del primer evento no agotado', async () => {
    getUpcomingPublicEventsMock.mockResolvedValueOnce([
      { slug: 'agotado', title: 'Agotado', status: 'soldout' },
      { slug: 'aniversario', title: '2do Aniversario', status: 'published' },
    ] as any);

    const result = await resolveInstagramBuyLink();

    expect(result).toEqual({ url: 'https://mansionplayroom.cl/eventos/aniversario', eventTitle: '2do Aniversario' });
  });

  it('devuelve null si no hay ningún próximo evento', async () => {
    getUpcomingPublicEventsMock.mockResolvedValueOnce([]);
    expect(await resolveInstagramBuyLink()).toBeNull();
  });

  it('devuelve null si todos los próximos eventos están agotados', async () => {
    getUpcomingPublicEventsMock.mockResolvedValueOnce([
      { slug: 'agotado', title: 'Agotado', status: 'soldout' },
    ] as any);
    expect(await resolveInstagramBuyLink()).toBeNull();
  });
});
