import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as db from './db';
import * as mailing from './mailing';
import { buildEventFacts, createWinbackCampaign, draftWinbackEmail, getWinbackOverview } from './winback';

vi.mock('./db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./db')>();
  return {
    ...actual,
    getEventById: vi.fn(),
    getFeaturedEvent: vi.fn(),
    getWinbackData: vi.fn(),
    getCustomerIdsByEmails: vi.fn(),
    getAccessTicketMix: vi.fn(),
    listMailingCampaigns: vi.fn(),
  };
});
vi.mock('./mailing', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./mailing')>();
  return { ...actual, generateMailingTemplate: vi.fn(), createAutoMailingCampaign: vi.fn() };
});

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-10-05T12:00:00Z');
const target = {
  id: 100, title: 'Halloween', slug: 'halloween', venue: 'La Mansión', shortDescription: 'La noche más oscura del año.',
  eventDate: new Date(NOW.getTime() + 25 * DAY), status: 'published', tandaPhaseIndex: 0,
  tandaDiscountSchedule: [{ percent: 40, untilDate: '2026-10-12T03:00:00Z' }, { percent: 20 }],
};
const p = (...ids: number[]) => new Set(ids);

const content = { subject: 'Te echamos de menos', headline: 'Vuelve a la Mansión', paragraphs: ['Hola, te extrañamos mucho por acá.'], ctaText: 'Quiero mi entrada' };

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(db.getEventById).mockResolvedValue(target as any);
  vi.mocked(db.getFeaturedEvent).mockResolvedValue(target as any);
  vi.mocked(db.getWinbackData).mockResolvedValue({
    participation: new Map([
      ['a@x.cl', p(1, 2, 3)],
      ['b@x.cl', p(3)],
      ['c@x.cl', p(1)],
      ['d@x.cl', p(1, 2)],
      ['ya@x.cl', p(3, 100)],
    ]),
    pastEvents: [{ id: 3, title: 'Verano', eventDate: new Date(NOW.getTime() - 40 * DAY) }, { id: 2, title: 'Otoño', eventDate: new Date(NOW.getTime() - 90 * DAY) }, { id: 1, title: 'Invierno', eventDate: new Date(NOW.getTime() - 150 * DAY) }],
  });
  // un id por correo, para contar fácil
  vi.mocked(db.getCustomerIdsByEmails).mockImplementation(async (emails: string[]) => emails.map((_, i) => i + 1));
  vi.mocked(db.getAccessTicketMix).mockResolvedValue([
    { name: 'Dúo', price: '24000', originalPrice: '40000', totalStock: 999999, soldCount: 3, status: 'active' },
    { name: 'Soltera', price: '12000', originalPrice: '20000', totalStock: 50, soldCount: 3, status: 'active' },
    { name: 'Agotado', price: '5000', originalPrice: '5000', totalStock: 10, soldCount: 10, status: 'soldout' },
  ] as any);
  vi.mocked(db.listMailingCampaigns).mockResolvedValue([]);
  vi.mocked(mailing.generateMailingTemplate).mockResolvedValue(content as any);
  vi.mocked(mailing.createAutoMailingCampaign).mockResolvedValue({ campaignId: 55 });
});

describe('getWinbackOverview', () => {
  it('cuenta cada grupo y deja afuera a quien ya compró el evento', async () => {
    const o = await getWinbackOverview(undefined, NOW);
    expect(o.event).toMatchObject({ id: 100, title: 'Halloween', slug: 'halloween' });
    expect(o.latestPastEvent).toBe('Verano');
    expect(Object.fromEntries(o.segments.map((s) => [s.key, s.count]))).toEqual({ fieles: 1, ultima: 1, una_vez: 1, dormidos: 1 });
    expect(o.alreadyBought).toBe(1);
  });

  it('un evento que ya pasó no se puede usar como destino', async () => {
    vi.mocked(db.getEventById).mockResolvedValue({ ...target, eventDate: new Date(NOW.getTime() - DAY) } as any);
    await expect(getWinbackOverview(100, NOW)).rejects.toThrow(/ya pasó/);
  });

  it('sin ningún evento publicado da un error claro', async () => {
    vi.mocked(db.getFeaturedEvent).mockResolvedValue(undefined as any);
    await expect(getWinbackOverview(undefined, NOW)).rejects.toThrow(/ningún evento publicado/);
  });
});

describe('fiestas que todavía no pasaron', () => {
  it('comprar OTRO evento futuro no cuenta como haber ido a una fiesta', async () => {
    // El evento 200 es futuro (no está en pastEvents): quien solo compró ese no
    // es "vino una vez", y quien tiene 2 pasadas + 200 sigue siendo de 2.
    vi.mocked(db.getWinbackData).mockResolvedValue({
      participation: new Map([['fut@x.cl', p(200)], ['dos@x.cl', p(1, 2, 200)]]),
      pastEvents: [{ id: 3, title: 'Verano', eventDate: new Date(NOW.getTime() - 40 * DAY) }, { id: 2, title: 'Otoño', eventDate: new Date(NOW.getTime() - 90 * DAY) }, { id: 1, title: 'Invierno', eventDate: new Date(NOW.getTime() - 150 * DAY) }],
    });
    const o = await getWinbackOverview(undefined, NOW);
    const counts = Object.fromEntries(o.segments.map((s) => [s.key, s.count]));
    expect(counts).toEqual({ fieles: 0, ultima: 0, una_vez: 0, dormidos: 1 }); // solo dos@x.cl, como "dormido"
  });
});

describe('buildEventFacts', () => {
  it('arma los datos reales: fecha, lugar, precio desde y urgencia real', async () => {
    const facts = await buildEventFacts(target as any);
    expect(facts).toContain('Evento: Halloween');
    expect(facts).toContain('Lugar: La Mansión');
    expect(facts).toContain('Entradas desde $12.000 (Soltera)');
    expect(facts).toContain('cupos limitados');
    expect(facts).toContain('rige hasta');
    expect(facts).not.toContain('$5.000'); // el acceso agotado no cuenta
  });

  it('en la última tanda no inventa urgencia', async () => {
    const facts = await buildEventFacts({ ...target, tandaPhaseIndex: 1 } as any);
    expect(facts).not.toMatch(/sube/);
  });
});

describe('draftWinbackEmail', () => {
  it('le pasa a la IA el objetivo del grupo con los datos reales y las reglas', async () => {
    const result = await draftWinbackEmail('una_vez', undefined, NOW);
    expect(result).toEqual(content);
    const [objective, audience] = vi.mocked(mailing.generateMailingTemplate).mock.calls[0];
    expect(objective).toContain('no han vuelto');
    expect(objective).toContain('Entradas desde $12.000');
    expect(objective).toContain('no inventes precios');
    expect(objective).toContain('no menciones cuántas veces compró');
    expect(audience).toContain('una sola vez');
  });
});

describe('createWinbackCampaign', () => {
  it('crea la campaña del grupo con el evento, el link con UTM y el aviso de cuántos días tarda', async () => {
    const r = await createWinbackCampaign({ segmentKey: 'fieles', content }, NOW);
    expect(r).toEqual({ campaignId: 55, recipients: 1, days: 1 });
    const arg = vi.mocked(mailing.createAutoMailingCampaign).mock.calls[0][0];
    expect(arg.name).toBe('Reactivación · Los de siempre · Halloween');
    expect(arg.eventId).toBe(100); // así el cron salta a quien compre mientras espera
    expect(arg.ctaUrl).toContain('/checkout/halloween?utm_source=email&utm_medium=mailing&utm_campaign=reactivacion-fieles');
    expect(arg.customerIds).toEqual([1]);
  });

  it('recalcula el grupo en el servidor: no usa ninguna lista del navegador', async () => {
    await createWinbackCampaign({ segmentKey: 'dormidos', content }, NOW);
    expect(db.getCustomerIdsByEmails).toHaveBeenCalledWith(['d@x.cl']);
  });

  it('no deja crear dos veces la misma campaña, salvo que la anterior esté cancelada', async () => {
    vi.mocked(db.listMailingCampaigns).mockResolvedValue([{ name: 'Reactivación · Los de siempre · Halloween', status: 'sending' }] as any);
    await expect(createWinbackCampaign({ segmentKey: 'fieles', content }, NOW)).rejects.toThrow(/Ya hay una campaña/);
    vi.mocked(db.listMailingCampaigns).mockResolvedValue([{ name: 'Reactivación · Los de siempre · Halloween', status: 'cancelled' }] as any);
    await expect(createWinbackCampaign({ segmentKey: 'fieles', content }, NOW)).resolves.toMatchObject({ campaignId: 55 });
  });

  it('un grupo vacío no crea nada', async () => {
    vi.mocked(db.getCustomerIdsByEmails).mockResolvedValue([]);
    await expect(createWinbackCampaign({ segmentKey: 'fieles', content }, NOW)).rejects.toThrow(/no tiene a nadie/);
    expect(mailing.createAutoMailingCampaign).not.toHaveBeenCalled();
  });

  it('rechaza un correo con un formato inválido sin tocar nada', async () => {
    await expect(createWinbackCampaign({ segmentKey: 'fieles', content: { subject: 'x', headline: 'y', paragraphs: [] } }, NOW)).rejects.toThrow(/formato esperado/);
    expect(mailing.createAutoMailingCampaign).not.toHaveBeenCalled();
  });
});
