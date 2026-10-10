import { describe, expect, it } from 'vitest';
import { formatCount, normalizeMedia, storyNext, storyPrev } from './instagramShowcase';

const base = { permalink: 'https://www.instagram.com/p/abc/', caption: 'hola' };

describe('normalizeMedia', () => {
  it('elige la imagen correcta según el tipo', () => {
    const r = normalizeMedia([
      { ...base, id: '1', media_type: 'IMAGE', media_url: 'https://cdn/x.jpg' },
      { ...base, id: '2', media_type: 'VIDEO', media_url: 'https://cdn/v.mp4', thumbnail_url: 'https://cdn/t.jpg', like_count: 5, comments_count: 2 },
      { ...base, id: '3', media_type: 'CAROUSEL_ALBUM', media_url: 'https://cdn/c.jpg' },
    ]);
    expect(r.map((m) => m.type)).toEqual(['image', 'reel', 'carousel']);
    expect(r[1]).toMatchObject({ image: 'https://cdn/t.jpg', video: 'https://cdn/v.mp4', likes: 5, comments: 2 });
  });
  it('descarta lo que no tiene imagen, link o id, y lo que no es https', () => {
    expect(normalizeMedia([
      { ...base, id: '1', media_type: 'VIDEO', media_url: 'https://cdn/v.mp4' }, // reel sin portada
      { id: '2', media_type: 'IMAGE', media_url: 'https://cdn/x.jpg' },         // sin link
      { ...base, media_type: 'IMAGE', media_url: 'https://cdn/x.jpg' },         // sin id
      { ...base, id: '4', media_type: 'IMAGE', media_url: 'http://cdn/x.jpg' }, // no https
      null, 'basura',
    ])).toEqual([]);
    expect(normalizeMedia(undefined)).toEqual([]);
  });
  it('máximo 9 y corta el texto largo', () => {
    const many = Array.from({ length: 15 }, (_, i) => ({ ...base, id: String(i), media_type: 'IMAGE', media_url: 'https://cdn/x.jpg', caption: 'a'.repeat(500) }));
    const r = normalizeMedia(many);
    expect(r).toHaveLength(9);
    expect(Array.from(r[0].caption)).toHaveLength(300);
    expect(r[0].caption.endsWith('…')).toBe(true);
  });
});

describe('visor', () => {
  it('avanza y se termina al final; retrocede sin bajar de 0', () => {
    expect(storyNext(0, 3)).toBe(1);
    expect(storyNext(2, 3)).toBeNull();
    expect(storyPrev(0)).toBe(0);
    expect(storyPrev(2)).toBe(1);
  });
});

describe('formatCount', () => {
  it('formato chileno', () => {
    expect(formatCount(950)).toBe('950');
    expect(formatCount(9500)).toBe('9.500');
    expect(formatCount(13730)).toBe('13,7 mil');
    expect(formatCount(20000)).toBe('20 mil');
    expect(formatCount(1_250_000)).toBe('1,2 M');
    expect(formatCount(-1)).toBe('0');
  });
});
