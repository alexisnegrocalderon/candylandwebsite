import { describe, expect, it } from 'vitest';
import { emptySlide, normalizeStudioDesign } from './contentStudio';
import {
  eventVideo,
  normalizeStudioVideo,
  scriptVideo,
  slidesVideo,
  slidesVideoHtml,
  starterPointsVideo,
  VIDEO_MAX_TOTAL_SECS,
  videoCompositionHtml,
  videoTimeline,
  projectAssets,
  siteAssets,
} from './studioVideo';

const norm = (raw: unknown) => normalizeStudioVideo(raw, normalizeStudioDesign);

describe('normalizeStudioVideo', () => {
  it('limpia tiempos, plantilla y enlaces', () => {
    const v = norm({ template: 'otra', format: 'cuadrado', theme: 'x', mediaUrl: 'javascript:alert(1)', scenes: [{ title: 'Hola', secs: 99 }, { title: 'Chao', secs: -3 }] })!;
    expect(v.template).toBe('puntos');
    expect(v.format).toBe('reel');
    expect(v.theme).toBe('bubble');
    expect(v.mediaUrl).toBe('');
    expect(v.scenes.map((s) => s.secs)).toEqual([8, 1]);
  });

  it('rechaza un video sin escenas o unas láminas sin diseño', () => {
    expect(norm({ template: 'puntos', scenes: [] })).toBeNull();
    expect(norm({ template: 'laminas', scenes: [] })).toBeNull();
  });

  it('no acepta una ruta que empiece con // (otro sitio)', () => {
    expect(norm({ ...starterPointsVideo(), mediaUrl: '//malo.test/x.mp4' })!.mediaUrl).toBe('');
    expect(norm(starterPointsVideo())!.mediaUrl).toBe('/candyland/hero-video-mobile.mp4');
  });
});

describe('videoTimeline', () => {
  it('suma las escenas y agrega 3 s de cierre', () => {
    const t = videoTimeline(starterPointsVideo());
    expect(t.scenes.map((s) => s.start)).toEqual([0, 3.2, 5.4, 7.5]);
    expect(t.closing).toEqual({ start: 9.7, secs: 3 });
    expect(t.total).toBe(12.7);
  });

  it('sin botón ni frase no hay cierre', () => {
    expect(videoTimeline({ ...starterPointsVideo(), cta: '', ctaLine: '' }).closing).toBeNull();
  });

  it('nunca pasa del tope', () => {
    const scenes = Array.from({ length: 12 }, () => ({ title: 'x', body: '', secs: 8 }));
    expect(videoTimeline({ scenes, cta: 'a', ctaLine: '' }).total).toBeLessThanOrEqual(VIDEO_MAX_TOTAL_SECS);
  });
});

describe('plantillas', () => {
  it('el anuncio usa la hora de Chile y nunca la dirección', () => {
    const v = eventVideo({ id: 3, title: 'Candyland', eventDate: '2026-08-09T01:00:00Z', imageUrl: 'https://x.test/e.jpg' });
    expect(v.scenes[1]).toMatchObject({ title: 'Sábado, 8 de agosto', body: '21:00 hrs' });
    expect(v.eventId).toBe(3);
    expect(JSON.stringify(v)).not.toMatch(/direcci/i);
  });

  it('el guion usa el texto de pantalla o, si falta, lo que se dice', () => {
    const v = scriptVideo({ hook: { say: 'Nadie te cuenta esto', screen: 'NADIE TE LO DICE' }, beats: [{ say: 'Se pregunta siempre', screen: '' }] });
    expect(v.scenes.map((s) => s.title)).toEqual(['NADIE TE LO DICE', 'Se pregunta siempre']);
    expect(v.scenes[0].secs).toBeGreaterThanOrEqual(2.5);
  });

  it('las láminas animadas toman el formato del diseño', () => {
    const d = normalizeStudioDesign({ title: 'Test', format: 'historia', theme: 'bubble', slides: [emptySlide('portada')] })!;
    expect(slidesVideo(d).format).toBe('reel');
    expect(slidesVideo({ ...d, format: 'carrusel' }).format).toBe('feed');
  });
});

describe('composición HyperFrames', () => {
  const html = videoCompositionHtml(starterPointsVideo(), { asset: siteAssets('https://mansionplayroom.cl/') });

  it('cumple el contrato: raíz con duración, escenas como clips y línea de tiempo registrada', () => {
    expect(html).toContain('data-composition-id="main"');
    expect(html).toContain('data-duration="12.7"');
    expect(html.match(/class="clip scene"/g)).toHaveLength(4);
    expect(html).toContain('class="clip scene closing"');
    expect(html).toContain('window.__timelines["main"] = tl;');
    expect(html).toContain("url('https://mansionplayroom.cl/studio/fonts/fredoka.woff2')");
    expect(html).not.toMatch(/Math\.random|Date\.now|repeat: -1/);
  });

  it('el video de fondo va mudo, como clip propio en la raíz (no dentro de la escena)', () => {
    expect(html).toMatch(/<video id="s0-m" class="clip media" src="https:\/\/mansionplayroom\.cl\/candyland\/hero-video-mobile\.mp4" muted playsinline data-start="0" data-duration="3.2"/);
    expect(html).toMatch(/<\/video>\n<div id="s0" class="clip scene"/);
  });

  it('para grabar, cada archivo se copia a assets/ sin repetir nombres', () => {
    const { assetUrl, files } = projectAssets();
    const out = videoCompositionHtml(starterPointsVideo(), { asset: assetUrl });
    expect(out).toContain('src="assets/hero-video-mobile.mp4"');
    expect(out).toContain("url('assets/fredoka.woff2')");
    expect(files.get('assets/logo-wordmark-white.png')).toBe('/studio/logo-wordmark-white.png');
    expect(assetUrl('/otro/fredoka.woff2')).toBe('assets/2-fredoka.woff2');
    expect(assetUrl('/studio/fonts/fredoka.woff2')).toBe('assets/fredoka.woff2');
  });

  it('escapa el texto', () => {
    const v = { ...starterPointsVideo(), scenes: [{ title: '<script>x</script>', body: '"a" & b', secs: 2 }], theme: 'azul' as const };
    const out = videoCompositionHtml(v, { asset: siteAssets('https://x.test') });
    expect(out).not.toContain('<script>x</script>');
    expect(out).toContain('&quot;a&quot; &amp; b');
  });

  it('láminas: una escena por lámina, la primera visible desde el cuadro 0', () => {
    const out = slidesVideoHtml({ asset: siteAssets('https://x.test'), title: 'T', format: 'feed', slidesHtml: ['<div>1</div>', '<img src="/candyland/logo.png">'], secsPerSlide: 2 });
    expect(out).toContain('src="https://x.test/candyland/logo.png"');
    expect(out).toContain('data-duration="4"');
    expect(out).toContain('data-width="1080" data-height="1440"');
    expect(out).not.toContain('tl.fromTo("#l0-in"');
    expect(out).toContain('tl.fromTo("#l1-in"');
  });
});
