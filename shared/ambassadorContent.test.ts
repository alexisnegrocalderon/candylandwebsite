import { describe, expect, it } from 'vitest';
import { ambassadorDirectMessage, ambassadorFeedCaption, ambassadorPieces, type AmbassadorContentEvent } from './ambassadorContent';

const event: AmbassadorContentEvent = {
  id: 9,
  title: 'Noche Neón',
  slug: 'noche-neon',
  eventDate: '2026-08-09T01:00:00Z',
  imageUrl: 'https://x.test/neon.jpg',
  shortDescription: 'La fiesta más brillante.',
  referralUrl: 'https://mansionplayroom.cl/eventos/noche-neon?embajador=SOFIA',
};

describe('piezas del embajador', () => {
  const pieces = ambassadorPieces(event, 'sofia');

  it('las historias van primero y la principal invita al link, no al código', () => {
    expect(pieces.map((p) => p.design.format)).toEqual(['historia', 'historia', 'historia', 'post']);
    expect(pieces[0].via).toBe('link');
    expect(pieces[0].design.slides[0].cta).toBe('Entradas en el link');
    expect(JSON.stringify(pieces[0].design)).not.toContain('SOFIA');
  });

  it('la historia de respaldo y el feed llevan el código', () => {
    expect(pieces[2].design.slides[0].cta).toBe('Mi código: SOFIA');
    expect(pieces[3].design.slides[0].cta).toBe('Mi código: SOFIA');
  });

  it('usan la foto del evento y su hora de Chile, nunca la dirección', () => {
    expect(pieces.every((p) => p.design.slides[0].imageUrl === 'https://x.test/neon.jpg')).toBe(true);
    expect(pieces[0].design.slides[0].body).toContain('21:00');
    expect(JSON.stringify(pieces)).not.toMatch(/direcci/i);
  });

  it('sin código válido igual salen, con el sitio en el botón', () => {
    const plain = ambassadorPieces(event, '<x>');
    expect(plain).toHaveLength(4);
    expect(plain[3].design.slides[0].cta).toBe('Entradas en mansionplayroom.cl');
  });
});

describe('textos del embajador', () => {
  it('el texto del feed no trae el link (Instagram no lo deja tocar) y ofrece el código', () => {
    const caption = ambassadorFeedCaption(event, 'sofia');
    expect(caption).not.toContain('http');
    expect(caption).toContain('mi código SOFIA');
    expect(caption).toContain('DM');
  });

  it('el mensaje para WhatsApp lleva el link personal', () => {
    const msg = ambassadorDirectMessage(event, 'sofia');
    expect(msg).toContain(event.referralUrl);
    expect(msg).toContain('Noche Neón');
  });
});
