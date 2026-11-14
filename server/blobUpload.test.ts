import { describe, expect, it } from 'vitest';
import { uploadLimits } from './blobUpload';

describe('topes de subida a Vercel Blob', () => {
  it('el video de fondo del Estudio puede pesar hasta 150 MB y solo es video', () => {
    const l = uploadLimits('studio-backdrops/123-clip.mp4');
    expect(l.maximumSizeInBytes).toBe(150 * 1024 * 1024);
    expect(l.allowedContentTypes).toEqual(['video/mp4', 'video/webm', 'video/quicktime']);
    expect(l.allowedContentTypes.some((t) => t.startsWith('image/') || t.startsWith('audio/'))).toBe(false);
  });
  it('todo lo demás sigue con el tope de 50 MB y los tipos de siempre', () => {
    for (const path of ['studio-motion/1-foto.jpg', 'studio-songs/1-cancion.mp3', 'flyers/x.png', 'studio-backdrops-no/x.mp4']) {
      const l = uploadLimits(path);
      expect(l.maximumSizeInBytes).toBe(50 * 1024 * 1024);
      expect(l.allowedContentTypes).toContain('image/jpeg');
    }
  });
});
