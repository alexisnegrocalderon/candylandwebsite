import { describe, expect, it, vi } from 'vitest';
import * as instagramAgent from './instagramAgent';
import { resolveEventCardImage, resolveInstagramBuyLink } from './instagramInteractive';

vi.mock('./instagramAgent', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./instagramAgent')>();
  return { ...actual, getUpcomingPublicEvents: vi.fn() };
});
const getUpcomingPublicEventsMock = vi.mocked(instagramAgent.getUpcomingPublicEvents);

describe('resolveEventCardImage', () => {
  it('usa el flyer real del evento cuando lo tiene cargado', () => {
    expect(resolveEventCardImage({ imageUrl: 'https://blob.vercel-storage.com/events/flyer.jpg' }))
      .toBe('https://blob.vercel-storage.com/events/flyer.jpg');
  });

  it('cae al logo genérico cuando el evento no tiene flyer, es null, o no viene evento', () => {
    const fallback = 'https://mansionplayroom.cl/candyland/og-candyland.jpg';
    expect(resolveEventCardImage({ imageUrl: null })).toBe(fallback);
    expect(resolveEventCardImage(undefined)).toBe(fallback);
    expect(resolveEventCardImage(null)).toBe(fallback);
  });
});

describe('resolveInstagramBuyLink', () => {
  it('devuelve el link y la imagen del primer evento no agotado', async () => {
    getUpcomingPublicEventsMock.mockResolvedValueOnce([
      { slug: 'agotado', title: 'Agotado', status: 'soldout' },
      { slug: 'aniversario', title: '2do Aniversario', status: 'published', imageUrl: 'https://blob.vercel-storage.com/events/flyer.jpg' },
    ] as any);

    const result = await resolveInstagramBuyLink();

    expect(result).toEqual({
      url: 'https://mansionplayroom.cl/eventos/aniversario',
      eventTitle: '2do Aniversario',
      imageUrl: 'https://blob.vercel-storage.com/events/flyer.jpg',
    });
  });

  it('cae al logo genérico cuando el evento no tiene flyer cargado', async () => {
    getUpcomingPublicEventsMock.mockResolvedValueOnce([
      { slug: 'aniversario', title: '2do Aniversario', status: 'published', imageUrl: null },
    ] as any);

    const result = await resolveInstagramBuyLink();
    expect(result?.imageUrl).toBe('https://mansionplayroom.cl/candyland/og-candyland.jpg');
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
