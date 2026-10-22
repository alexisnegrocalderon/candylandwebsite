import { describe, expect, it } from 'vitest';
import { packImages, packVideos, SHARE_CARD_SIZE, shareCardText } from './studioPack';

const event = { id: 5, title: 'Noche Neón', eventDate: '2026-08-09T01:00:00Z', imageUrl: 'https://x.test/f.jpg' };

describe('paquete de un evento', () => {
  it('trae 4 imágenes: feed 3:4 e historia 9:16, con la foto del evento', () => {
    const imgs = packImages(event);
    expect(imgs).toHaveLength(4);
    expect(new Set(imgs.map((i) => i.design.format))).toEqual(new Set(['post', 'historia']));
    expect(imgs.every((i) => i.design.eventId === 5 && i.design.slides[0].imageUrl === 'https://x.test/f.jpg')).toBe(true);
    expect(imgs[0].design.slides[0].body).toBe('Sábado, 8 de agosto · 21:00 hrs');
  });

  it('con código de embajador, todo sale personalizado', () => {
    expect(packImages(event, 'sofia')[0].design.slides[0].cta).toBe('Mi código: SOFIA');
    expect(packImages(event)[0].design.slides[0].cta).toBe('Entradas en mansionplayroom.cl');
    expect(packVideos(event, 'sofia')[0].video.cta).toBe('Mi código: SOFIA');
    expect(shareCardText(event, 'sofia').footer).toContain('SOFIA');
  });

  it('un código inválido se ignora en vez de colarse en la imagen', () => {
    expect(packImages(event, '<b>x</b>')[0].design.slides[0].cta).toBe('Entradas en mansionplayroom.cl');
  });

  it('los videos: anuncio en reel y en feed, y la PlayCard', () => {
    const vids = packVideos(event);
    expect(vids.map((v) => v.video.format)).toEqual(['reel', 'feed', 'reel']);
    expect(vids[0].video.eventId).toBe(5);
    expect(vids[2].video.theme).toBe('playcard');
  });

  it('la imagen para compartir mide 1200×630 y trae día y hora de Chile', () => {
    expect(SHARE_CARD_SIZE).toEqual({ width: 1200, height: 630 });
    expect(shareCardText(event).when).toBe('Sábado, 8 de agosto · 21:00 hrs');
  });
});
