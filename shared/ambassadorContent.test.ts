import { describe, expect, it } from 'vitest';
import {
  ambassadorDirectMessage,
  AUTO_DRAFT_KEYS,
  eventDrafts,
  fillTokens,
  itemsForPanel,
  normalizeAmbassadorItem,
  personalizeItem,
  uploadedItem,
  type AmbassadorContentEvent,
} from './ambassadorContent';

const event: AmbassadorContentEvent = {
  id: 9,
  title: 'Noche Neón',
  slug: 'noche-neon',
  eventDate: '2026-08-09T01:00:00Z',
  imageUrl: 'https://x.test/neon.jpg',
  shortDescription: 'La fiesta más brillante.',
  referralUrl: 'https://mansionplayroom.cl/eventos/noche-neon?embajador=SOFIA',
};
const sofia = { code: 'SOFIA', name: 'Sofía Pérez', link: event.referralUrl };

describe('borradores de un evento', () => {
  const drafts = eventDrafts(event);

  it('salen como borrador, historias primero, la principal invita al link', () => {
    expect(drafts.map((d) => d.autoKey)).toEqual(AUTO_DRAFT_KEYS);
    expect(drafts.every((d) => d.status === 'borrador' && d.eventId === 9)).toBe(true);
    expect(drafts.map((d) => d.design!.format)).toEqual(['historia', 'historia', 'historia', 'post']);
    expect(drafts[0].via).toBe('link');
    expect(drafts[0].design!.slides[0].cta).toBe('Entradas en el link');
  });

  it('llevan marcas, no el código de nadie, y nunca la dirección', () => {
    expect(drafts[2].design!.slides[0].cta).toBe('Mi código: {CODIGO}');
    expect(drafts[3].caption).toContain('{CODIGO}');
    expect(JSON.stringify(drafts)).not.toMatch(/direcci/i);
  });

  it('pasan la normalización tal cual (se guardan sin perder nada)', () => {
    for (const d of drafts) expect(normalizeAmbassadorItem(d)).toEqual(d);
  });
});

describe('personalizar', () => {
  it('cambia las marcas por el código, el link y el primer nombre', () => {
    expect(fillTokens('Hola soy {NOMBRE}, código {CODIGO}: {LINK}', sofia)).toBe(`Hola soy Sofía, código SOFIA: ${event.referralUrl}`);
  });

  it('cada embajador ve su código en la lámina y en el texto', () => {
    const feed = eventDrafts(event)[3];
    const mine = personalizeItem(feed, sofia);
    expect(mine.design!.slides[0].cta).toBe('Mi código: SOFIA');
    expect(mine.caption).toContain('mi código SOFIA');
    expect(personalizeItem(feed, { ...sofia, code: 'CAMI' }).design!.slides[0].cta).toBe('Mi código: CAMI');
    // El original no se toca.
    expect(feed.design!.slides[0].cta).toBe('Mi código: {CODIGO}');
  });
});

describe('fotos y videos subidos', () => {
  it('reconoce el video por la extensión, incluso MOV del iPhone', () => {
    expect(uploadedItem({ mediaUrl: 'https://abc.public.blob.vercel-storage.com/x.MOV', eventId: null })!.kind).toBe('video');
    expect(uploadedItem({ mediaUrl: 'https://abc.public.blob.vercel-storage.com/x.jpg', eventId: 9 })!.kind).toBe('foto');
  });

  it('rechaza archivos que no son https', () => {
    expect(uploadedItem({ mediaUrl: 'javascript:alert(1)', eventId: null })).toBeNull();
    expect(normalizeAmbassadorItem({ kind: 'foto', mediaUrl: 'http://x.test/a.jpg' })).toBeNull();
  });
});

describe('lo que ve el panel', () => {
  const items = [
    { ...eventDrafts(event)[0], id: 1, status: 'aprobado' as const },
    { ...eventDrafts(event)[1], id: 2 },
    { ...eventDrafts(event)[2], id: 3, status: 'descartado' as const },
    { ...eventDrafts({ ...event, id: 4 })[0], id: 4, status: 'aprobado' as const },
    { ...uploadedItem({ mediaUrl: 'https://x.test/v.mp4', eventId: null })!, id: 5, status: 'aprobado' as const },
  ];

  it('solo lo aprobado, de eventos vigentes o general', () => {
    expect(itemsForPanel(items, [9]).map((i) => i.id)).toEqual([5, 1]);
  });
});

it('el mensaje para WhatsApp lleva el link personal', () => {
  const msg = ambassadorDirectMessage(event, 'SOFIA');
  expect(msg).toContain(event.referralUrl);
  expect(msg).toContain('mi código es SOFIA');
});
