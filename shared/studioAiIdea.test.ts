import { describe, expect, it } from 'vitest';
import { emptyPhotoBrief } from './studioVariants';
import { photoBriefFromQuickData, videoFromQuickData } from './studioAiIdea';
import { videoTimeline } from './studioVideo';

const data = {
  title: 'Tu primera vez',
  caption: 'Lo que nadie te cuenta. #MansionPlayroom',
  numbered: true,
  scenes: [
    { title: '¿Tu primera\nvez?', body: '3 cosas antes de venir', secs: 1 },
    { title: 'Se pregunta siempre', body: '', secs: 2.5 },
    { title: 'Solo +18', body: 'Para adultos', secs: 99 },
  ],
  ctaLine: '¿Vienes?',
  cta: 'Entradas en mansionplayroom.cl',
};

describe('videoFromQuickData', () => {
  it('arma un video de puntos en bubble, con el gancho de al menos 3 s y tiempos acotados', () => {
    const v = videoFromQuickData(data, { format: 'reel', eventId: 4 })!;
    expect(v).toMatchObject({ template: 'puntos', theme: 'bubble', format: 'reel', eventId: 4, cta: 'Entradas en mansionplayroom.cl' });
    expect(v.scenes.map((s) => s.secs)).toEqual([3, 2.5, 8]);
    expect(videoTimeline(v).closing).not.toBeNull();
  });

  it('si no son puntos, usa la plantilla corrida (sin números)', () => {
    expect(videoFromQuickData({ ...data, numbered: false }, { format: 'feed', eventId: null })!.template).toBe('guion');
  });

  it('descarta escenas vacías y devuelve null si no queda ninguna', () => {
    expect(videoFromQuickData({ ...data, scenes: [{ title: '  ', body: 'x', secs: 2 }] }, { format: 'reel', eventId: null })).toBeNull();
    expect(videoFromQuickData({ ...data, scenes: 'roto' as never }, { format: 'reel', eventId: null })).toBeNull();
  });

  it('no deja pasar enlaces raros como fondo', () => {
    expect(videoFromQuickData(data, { format: 'reel', eventId: null, mediaUrl: 'javascript:alert(1)' })!.mediaUrl).toBe('');
  });
});

describe('photoBriefFromQuickData', () => {
  const current = { ...emptyPhotoBrief(), imageUrl: 'https://x.test/f.jpg', eventId: 9, title: 'viejo' };

  it('cambia los textos y respeta la foto y el evento', () => {
    const next = photoBriefFromQuickData({ title: 'Noche Neón', body: 'Sábado · 22:00', cta: 'Comenta PLAYROOM', footnote: 'Evento +18', caption: 'Texto #MansionPlayroom' }, current);
    expect(next).toMatchObject({ title: 'Noche Neón', body: 'Sábado · 22:00', cta: 'Comenta PLAYROOM', imageUrl: 'https://x.test/f.jpg', eventId: 9 });
  });

  it('recorta lo largo y, si la IA deja algo vacío, conserva lo que había', () => {
    const next = photoBriefFromQuickData({ title: '', body: 'x'.repeat(500), cta: '', footnote: '', caption: '' }, current);
    expect(next.title).toBe('viejo');
    expect(next.body.length).toBe(60);
  });
});
