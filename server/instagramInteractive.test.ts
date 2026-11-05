import { describe, expect, it, vi } from 'vitest';
import * as db from './db';
import * as instagramAgent from './instagramAgent';
import { resolveEventCardImage, resolveInstagramBuyLink } from './instagramInteractive';

vi.mock('./instagramAgent', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./instagramAgent')>();
  return { ...actual, getUpcomingPublicEvents: vi.fn() };
});
const getUpcomingPublicEventsMock = vi.mocked(instagramAgent.getUpcomingPublicEvents);
vi.mock('./db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./db')>();
  return { ...actual, getTicketTypesByEventId: vi.fn() };
});
const getTicketTypesMock = vi.mocked(db.getTicketTypesByEventId);

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
      // Con UTM: la venta que entra por el botón queda atribuida al agente.
      url: 'https://mansionplayroom.cl/eventos/aniversario?utm_source=instagram&utm_medium=dm&utm_campaign=agente',
      eventTitle: '2do Aniversario',
      imageUrl: 'https://blob.vercel-storage.com/events/flyer.jpg',
      buttonTitle: 'Comprar entrada 🔥',
      accessLabel: null,
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


describe('resolveInstagramBuyLink con el acceso elegido', () => {
  const event = { id: 9, slug: 'aniversario', title: '2do Aniversario', status: 'published', imageUrl: null };
  const ticket = (over: Record<string, unknown>) => ({ id: 1, name: 'Dúo', category: 'acceso', status: 'active', accesoSlug: 'duo', totalStock: 50, soldCount: 10, poolRemaining: null, price: '30000', ...over });

  it('manda directo al checkout con el acceso y la cantidad ya elegidos', async () => {
    getUpcomingPublicEventsMock.mockResolvedValueOnce([event] as any);
    getTicketTypesMock.mockResolvedValueOnce([ticket({})] as any);
    const result = await resolveInstagramBuyLink(new Date(), 'agente', undefined, { key: 'pareja', quantity: 2 });
    expect(result?.url).toBe('https://mansionplayroom.cl/checkout/aniversario?rapida=1&op=pareja&items=duo%3A2&utm_source=instagram&utm_medium=dm&utm_campaign=agente');
    expect(result?.buttonTitle).toBe('Comprar Dúo 🔥');
    expect(result?.accessLabel).toBe('Pareja');
  });

  it('cae a la página del evento si el acceso está agotado', async () => {
    getUpcomingPublicEventsMock.mockResolvedValueOnce([event] as any);
    getTicketTypesMock.mockResolvedValueOnce([ticket({ soldCount: 50 })] as any);
    const result = await resolveInstagramBuyLink(new Date(), 'agente', undefined, { key: 'pareja' });
    expect(result?.url).toContain('/eventos/aniversario');
    expect(result?.buttonTitle).toBe('Comprar entrada 🔥');
  });

  it('cae a la página del evento si el acceso no existe o está oculto', async () => {
    getUpcomingPublicEventsMock.mockResolvedValueOnce([event] as any);
    getTicketTypesMock.mockResolvedValueOnce([ticket({ status: 'hidden' })] as any);
    const result = await resolveInstagramBuyLink(new Date(), 'agente', undefined, { key: 'pareja' });
    expect(result?.url).toContain('/eventos/aniversario');
  });

  it('sin acceso (llave vacía) sigue yendo a la página del evento', async () => {
    getUpcomingPublicEventsMock.mockResolvedValueOnce([event] as any);
    const result = await resolveInstagramBuyLink(new Date(), 'agente', undefined, { key: '' });
    expect(result?.url).toContain('/eventos/aniversario');
  });
});
