import { describe, expect, it } from 'vitest';
import { normalizeContestConfig } from './contest';
import { extractPhotos, photosLeft, splitJuryPicks } from './contestPhoto';

describe('extractPhotos', () => {
  it('lee la mención en historia y la imagen por DM', () => {
    const out = extractPhotos([
      { type: 'story_mention', payload: { url: 'https://cdn.example/story.jpg' } },
      { type: 'image', payload: { url: 'https://cdn.example/dm.jpg' } },
      { type: 'audio', payload: { url: 'https://cdn.example/a.mp3' } },
      { type: 'image', payload: {} },
      { type: 'image', payload: { url: 'javascript:alert(1)' } },
    ]);
    expect(out).toEqual([{ kind: 'story', url: 'https://cdn.example/story.jpg' }, { kind: 'dm', url: 'https://cdn.example/dm.jpg' }]);
  });
  it('sin adjuntos no hay fotos', () => {
    expect(extractPhotos(undefined)).toEqual([]);
    expect(extractPhotos([null, 3])).toEqual([]);
  });
});

describe('cupo y jurado', () => {
  it('calcula cuántas fotos le quedan', () => {
    expect(photosLeft(2, 1)).toBe(1);
    expect(photosLeft(2, 5)).toBe(0);
  });
  it('los primeros elegidos ganan y los siguientes son suplentes', () => {
    expect(splitJuryPicks(['a', 'b', 'c', 'd', 'e'], 2, 2)).toEqual({ winners: ['a', 'b'], alternates: ['c', 'd'] });
    expect(splitJuryPicks(['a'], 2, 2)).toEqual({ winners: ['a'], alternates: [] });
  });
  it('la config trae 2 fotos por persona y la acota', () => {
    expect(normalizeContestConfig(null).photo.maxPerPerson).toBe(2);
    expect(normalizeContestConfig({ photo: { maxPerPerson: 99 } }).photo.maxPerPerson).toBe(10);
  });
});
