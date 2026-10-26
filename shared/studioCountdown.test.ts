import { describe, expect, it } from 'vitest';
import { normalizeStudioDesign } from './contentStudio';
import {
  COUNTDOWN_SECS,
  countdownDateLabel,
  countdownDaysLeft,
  countdownTexts,
  countdownVideo,
  normalizeCountdown,
} from './studioCountdown';
import { countdownCompositionHtml } from './studioCountdownHtml';
import { normalizeStudioVideo, siteAssets, starterPointsVideo, videoCompositionHtml } from './studioVideo';

// Sábado 6 de febrero de 2027, 21:00 en Chile (verano: UTC-3).
const EVENT = { id: 7, title: 'Redroom', eventDate: '2027-02-07T00:00:00Z' };
const norm = (raw: unknown) => normalizeStudioVideo(raw, normalizeStudioDesign);
const asset = siteAssets('https://mansionplayroom.cl');

describe('días que faltan', () => {
  it('cuenta días de calendario de Chile, a cualquier hora del día', () => {
    expect(countdownDaysLeft(EVENT.eventDate, new Date('2027-01-29T03:00:00Z'))).toBe(8); // 00:00 del 29
    expect(countdownDaysLeft(EVENT.eventDate, new Date('2027-01-30T02:59:00Z'))).toBe(8); // 23:59 del 29
    expect(countdownDaysLeft(EVENT.eventDate, new Date('2027-01-30T03:00:00Z'))).toBe(7);
  });

  it('el día del evento es HOY (también de noche) y uno ya pasado no es negativo', () => {
    expect(countdownDaysLeft(EVENT.eventDate, new Date('2027-02-06T13:00:00Z'))).toBe(0);
    expect(countdownDaysLeft(EVENT.eventDate, new Date('2027-02-07T02:00:00Z'))).toBe(0);
    expect(countdownDaysLeft(EVENT.eventDate, new Date('2027-03-01T12:00:00Z'))).toBe(0);
  });

  it('los textos cambian en singular y el día del evento', () => {
    expect(countdownTexts(8)).toEqual({ lead: 'FALTAN SÓLO...', number: '8', unit: 'DÍAS', connector: 'PARA..' });
    expect(countdownTexts(1)).toMatchObject({ lead: 'FALTA SÓLO...', number: '1', unit: 'DÍA' });
    expect(countdownTexts(0)).toMatchObject({ lead: 'ES...', number: 'HOY', unit: '' });
  });
});

describe('día y hora', () => {
  it('«SÁB|06 21HRS» en hora de Chile', () => {
    expect(countdownDateLabel(EVENT.eventDate)).toBe('SÁB|06 21HRS');
  });

  it('con minutos solo si no son en punto', () => {
    expect(countdownDateLabel('2027-02-07T00:30:00Z')).toBe('SÁB|06 21:30HRS');
  });
});

describe('normalizeCountdown', () => {
  it('sin nombre de evento no hay cuenta', () => {
    expect(normalizeCountdown(null)).toBeUndefined();
    expect(normalizeCountdown({ days: 3 })).toBeUndefined();
    expect(normalizeCountdown({ eventName: '   ' })).toBeUndefined();
  });

  it('acota los días, pone en mayúsculas y completa los textos de los días', () => {
    const c = normalizeCountdown({ eventName: 'redroom', days: 500, look: 'otro', question: 'ya tienes tu entrada?' })!;
    expect(c).toMatchObject({ eventName: 'REDROOM', days: 99, look: 'celeste', lead: 'FALTAN SÓLO...', number: '99', unit: 'DÍAS', question: 'YA TIENES TU ENTRADA?' });
  });

  it('un sello vacío es una decisión: no se rellena', () => {
    expect(normalizeCountdown({ eventName: 'X', days: 0, unit: '' })!.unit).toBe('');
  });

  it('no recorta los espacios mientras se escribe (si no, no se podría escribir una frase)', () => {
    expect(normalizeCountdown({ eventName: 'DARK ', days: 2 })!.eventName).toBe('DARK ');
  });
});

describe('countdownVideo', () => {
  const v = countdownVideo({ ...EVENT, imageUrl: ' https://blob.test/redroom.jpg ' }, { now: new Date('2027-01-29T15:00:00Z') });

  it('arma el reel del evento con sus datos reales', () => {
    expect(v).toMatchObject({ template: 'cuenta', format: 'reel', eventId: 7, mediaUrl: 'https://blob.test/redroom.jpg', scenes: [] });
    expect(v.countdown).toEqual({
      look: 'celeste', days: 8, lead: 'FALTAN SÓLO...', number: '8', unit: 'DÍAS', connector: 'PARA..',
      eventName: 'REDROOM', dateLabel: 'SÁB|06 21HRS', question: 'YA TIENES TU ENTRADA?', keyword: 'REDROOM', location: 'VALPARAÍSO',
    });
  });

  it('el texto de la publicación lleva los días, la palabra a comentar y los hashtags', () => {
    expect(v.caption).toContain('Faltan 8 días para Redroom');
    expect(v.caption).toContain('Comenta “REDROOM”');
    expect(v.caption).toContain('#MansionPlayroom');
  });

  it('la palabra a comentar es la primera del nombre, sin signos', () => {
    const dark = countdownVideo({ ...EVENT, title: 'Dark Candy!' }, { now: new Date('2027-01-29T15:00:00Z'), look: 'rosa' });
    expect(dark.countdown).toMatchObject({ look: 'rosa', keyword: 'DARK', eventName: 'DARK CANDY!' });
  });

  it('el video de una cuenta pasa por la limpieza del Estudio sin perder nada', () => {
    const back = norm(JSON.parse(JSON.stringify(v)))!;
    expect(back.template).toBe('cuenta');
    expect(back.countdown).toEqual(v.countdown);
    expect(back.mediaUrl).toBe('https://blob.test/redroom.jpg');
  });

  it('una cuenta sin datos no es un video', () => {
    expect(norm({ template: 'cuenta', scenes: [] })).toBeNull();
    expect(norm({ template: 'puntos', countdown: v.countdown, scenes: [] })).toBeNull();
  });
});

describe('composición HyperFrames de la cuenta', () => {
  const v = countdownVideo(EVENT, { now: new Date('2027-01-29T15:00:00Z') });
  const html = countdownCompositionHtml(v, { asset });

  it('cumple el contrato: raíz con duración, una escena clip y línea de tiempo registrada', () => {
    expect(html).toContain('data-composition-id="main"');
    expect(html).toContain(`data-duration="${COUNTDOWN_SECS}"`);
    expect(html).toContain('data-width="1080" data-height="1920"');
    expect(html.match(/class="clip scene"/g)).toHaveLength(1);
    expect(html).toContain('window.__timelines["main"] = tl;');
    expect((html.match(/gsap\.timeline/g) ?? []).length).toBe(1);
  });

  it('nada al azar ni con reloj ni repeticiones infinitas', () => {
    expect(html).not.toMatch(/Math\.random|Date\.now|new Date|repeat: -1/);
  });

  it('trae sus letras (Anton y Barlow Condensed) desde el sitio', () => {
    expect(html).toContain("url('https://mansionplayroom.cl/studio/fonts/Anton-Regular.ttf')");
    expect(html).toContain("url('https://mansionplayroom.cl/studio/fonts/BarlowCondensed-ExtraBoldItalic.ttf')");
    // Y las plantillas de antes siguen sin ellas (su HTML no cambia).
    expect(videoCompositionHtml(starterPointsVideo(), { asset })).not.toContain('Anton');
  });

  it('cada elemento que la línea de tiempo anima existe en la escena', () => {
    const targets = new Set([...html.matchAll(/tl\.(?:set|fromTo|to)\("#([a-z-]+)/g)].map((m) => m[1]));
    expect(targets.size).toBeGreaterThan(8);
    for (const id of targets) expect(html, `#${id}`).toMatch(new RegExp(`id="${id}"`));
  });

  it('todo lo que se anima termina antes de que acabe el video', () => {
    const starts = [...html.matchAll(/, (\d+(?:\.\d+)?)\);$/gm)].map((m) => Number(m[1]));
    expect(Math.max(...starts)).toBeLessThan(COUNTDOWN_SECS - 1.5);
  });

  it('escapa el texto', () => {
    const evil = countdownCompositionHtml({ ...v, countdown: { ...v.countdown!, eventName: '<IMG SRC=X>', keyword: 'A"B' } }, { asset });
    expect(evil).not.toContain('<IMG SRC=X>');
    expect(evil).toContain('&lt;IMG SRC=X&gt;');
    expect(evil).toContain('A&quot;B');
  });

  it('recorta los espacios de los bordes en pantalla', () => {
    const spaced = countdownCompositionHtml({ ...v, countdown: { ...v.countdown!, eventName: 'DARK CANDY ' } }, { asset });
    expect(spaced).toContain('>DARK CANDY</span>');
  });

  it('el día del evento: «HOY», sin sello y con otra etiqueta', () => {
    const today = countdownVideo(EVENT, { now: new Date('2027-02-06T15:00:00Z') });
    const out = countdownCompositionHtml(today, { asset });
    expect(out).toContain('>HOY</span>');
    expect(out).toContain('ES...');
    expect(out).not.toContain('id="cd-unit"');
    expect(out).not.toContain('"#cd-unit"');
  });

  it('las líneas opcionales vacías no dejan huecos ni animaciones sueltas', () => {
    const bare = countdownCompositionHtml({ ...v, countdown: { ...v.countdown!, keyword: '', location: '', question: '', dateLabel: '' } }, { asset });
    for (const id of ['cd-sub', 'cd-loc', 'cd-q', 'cd-date']) {
      expect(bare).not.toContain(`id="${id}"`);
      expect(bare).not.toContain(`"#${id}`);
    }
    expect(bare).not.toContain('undefined');
  });

  it('con foto de fondo la usa con un velo del color; un video va mudo y como clip en la raíz', () => {
    const photo = countdownCompositionHtml({ ...v, mediaUrl: 'https://blob.test/fondo.jpg' }, { asset });
    expect(photo).toContain('<img id="cd-m" class="media" src="https://blob.test/fondo.jpg"');
    expect(photo).toContain('class="tint"');
    expect(html).not.toContain('class="tint"');
    const clip = countdownCompositionHtml({ ...v, mediaUrl: 'https://blob.test/fondo.mp4' }, { asset });
    expect(clip).toMatch(/<video id="cd-m" class="clip media"[^>]* muted /);
    expect(clip).toContain('style="background:transparent"');
  });

  it('usa los colores de la marca, en un fondo liso (sin degradados)', () => {
    expect(html).toContain('style="background:#00A3FF"');
    expect(html).toContain('#FF008E');
    expect(html).not.toMatch(/gradient/);
    const rosa = countdownCompositionHtml({ ...v, countdown: { ...v.countdown!, look: 'rosa' } }, { asset });
    expect(rosa).toContain('style="background:#EF8DFF"');
    expect(rosa).not.toContain('#FF008E');
    expect(rosa).not.toMatch(/gradient/);
  });

  it('la música suena todo el video y se apaga al final', () => {
    const withMusic = countdownCompositionHtml({ ...v, music: { url: 'https://blob.test/m.mp3', volume: 70, start: 12, fadeOut: 1.5 } }, { asset });
    expect(withMusic).toContain(`<audio id="mu" class="clip" src="https://blob.test/m.mp3" data-start="0" data-duration="${COUNTDOWN_SECS}"`);
    expect(withMusic).toContain('data-volume="0.7" data-media-start="12" data-fade-out="1.5"');
  });

  it('un número de dos cifras o «HOY» se angosta para que quepa', () => {
    const two = countdownCompositionHtml({ ...v, countdown: { ...v.countdown!, number: '14' } }, { asset });
    expect(two).toMatch(/#cd-num \{ width: \d+px; font-family: 'Anton', sans-serif; font-size: 540px/);
    expect(html).toMatch(/#cd-num \{ width: \d+px; font-family: 'Anton', sans-serif; font-size: 610px/);
  });

  it('sin datos no se puede componer', () => {
    expect(() => countdownCompositionHtml({ ...v, countdown: undefined }, { asset })).toThrow();
  });
});
