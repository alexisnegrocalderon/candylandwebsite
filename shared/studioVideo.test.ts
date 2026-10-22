import { describe, expect, it } from 'vitest';
import { emptySlide, normalizeStudioDesign } from './contentStudio';
import {
  cleanAmbassadorCode,
  eventVideo,
  playcardVideo,
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
    // La foto del video pasa a ser la de la escena 1.
    const v = norm(starterPointsVideo())!;
    expect(v.mediaUrl).toBe('');
    expect(v.scenes[0].mediaUrl).toBe('/candyland/hero-video-mobile.mp4');
  });

  it('limpia el diseño: fuentes, colores, tamaños y fondos válidos; lo demás se descarta', () => {
    const v = norm({
      template: 'puntos',
      style: { font: 'comic', titleColor: 'red', accentColor: '#ff00aa', textScale: 9, align: 'right', vpos: 'diagonal', overlay: 200, blur: -4 },
      scenes: [
        { title: 'A', secs: 2, bg: '#112233,#445566', mediaUrl: 'javascript:x', style: { textScale: '0.8', font: 'allura' } },
        { title: 'B', secs: 2, bg: 'url(x)', style: { nada: 1 } },
      ],
    })!;
    expect(v.style).toEqual({ accentColor: '#FF00AA', textScale: 1.6, align: 'right', overlay: 80, blur: 0 });
    expect(v.scenes[0]).toEqual({ title: 'A', body: '', secs: 2, bg: '#112233,#445566', style: { textScale: 0.8, font: 'allura' } });
    expect(v.scenes[1]).toEqual({ title: 'B', body: '', secs: 2 });
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

describe('diseño por escena', () => {
  const asset = siteAssets('https://x.cl');
  const two = (scene2: Record<string, unknown>, style?: Record<string, unknown>) =>
    videoCompositionHtml(norm({ template: 'guion', theme: 'azul', style, scenes: [{ title: 'Uno', secs: 2 }, { title: 'Dos', secs: 2, ...scene2 }] })!, { asset });

  it('cada escena puede tener su foto; las demás siguen con el fondo de la plantilla', () => {
    const html = two({ mediaUrl: 'https://a.public.blob.vercel-storage.com/f.jpg' });
    expect(html).toContain('<img id="s1-m" class="media" src="https://a.public.blob.vercel-storage.com/f.jpg"');
    expect(html).not.toContain('id="s0-m"');
  });

  it('oscurecido y desenfoque sobre la foto', () => {
    const html = two({ mediaUrl: '/f.jpg', style: { overlay: 40, blur: 8 } });
    expect(html).toContain('<div class="dim" style="background:rgba(0,0,0,0.4)"></div>');
    expect(html).toContain('filter:blur(8px)');
    expect(html).toContain('.dim { position: absolute; inset: 0; }');
  });

  it('color o degradado de fondo propio', () => {
    expect(two({ bg: '#112233' })).toContain('data-track-index="1" style="background:#112233"');
    expect(two({ bg: '#112233,#445566' })).toContain('background:linear-gradient(160deg, #112233 0%, #445566 100%)');
  });

  it('letra, color, tamaño y posición: la escena gana sobre el video', () => {
    const html = two({ style: { titleColor: '#00FF00', align: 'left', vpos: 'top' } }, { font: 'syne', titleColor: '#FF0000', textScale: 0.6 });
    expect(html).toMatch(/id="s0-t" class="ttl dt" style="font-size:\d+px;font-family:'Syne', sans-serif;font-weight:800;text-transform:none;color:#FF0000"/);
    expect(html).toMatch(/id="s1-t" class="ttl dt" style="font-size:\d+px;font-family:'Syne'[^"]*;color:#00FF00;text-align:left"/);
    expect(html).toContain('class="col center" style="justify-content:flex-start;align-items:flex-start"');
  });

  it('un texto más chico sale más chico', () => {
    const size = (html: string) => Number(/id="s1-t"[^>]*font-size:(\d+)px/.exec(html)![1]);
    expect(size(two({ style: { textScale: 0.6 } }))).toBeLessThan(size(two({})));
  });

  it('el titular globo se puede usar en cualquier plantilla y con color propio', () => {
    const html = two({ style: { font: 'globo', titleColor: '#00AAFF' } });
    expect(html).toContain('id="s1-t" class="ttl bub cc" style="--bf:#00AAFF;');
    expect(html).toContain('.cc .bl.pk .f { color: var(--bf); }');
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

describe('código de embajador y PlayCard', () => {
  it('el código se limpia: mayúsculas, sin espacios ni símbolos raros', () => {
    expect(cleanAmbassadorCode(' sofia ')).toBe('SOFIA');
    expect(cleanAmbassadorCode('camila_2')).toBe('CAMILA_2');
    expect(cleanAmbassadorCode('a')).toBe('');
    expect(cleanAmbassadorCode('sofía!')).toBe('');
    expect(cleanAmbassadorCode('<script>')).toBe('');
    expect(cleanAmbassadorCode(42)).toBe('');
  });

  it('el anuncio con código lo pone en el botón y en el texto de la publicación', () => {
    const e = { id: 1, title: 'Candyland', eventDate: '2026-08-09T01:00:00Z' };
    const v = eventVideo(e, { code: 'sofia' });
    expect(v.cta).toBe('Mi código: SOFIA');
    expect(v.caption).toContain('Usa mi código SOFIA al comprar');
    expect(eventVideo(e).cta).toBe('Entradas en mansionplayroom.cl');
    expect(eventVideo(e).caption).not.toContain('código');
    expect(eventVideo(e, { format: 'feed' }).format).toBe('feed');
  });

  it('la PlayCard es un reel en la plantilla PlayCard con cierre', () => {
    const v = playcardVideo();
    expect(v.theme).toBe('playcard');
    expect(v.format).toBe('reel');
    expect(videoTimeline(v).total).toBeGreaterThan(10);
    expect(norm(v)).not.toBeNull();
  });
});
