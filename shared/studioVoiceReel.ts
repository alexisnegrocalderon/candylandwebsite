/* La composición HyperFrames del reel con voz (plantilla «voz», datos en
 * shared/studioVoice.ts). Reel 9:16 a 1080×1920: una escena por frase hablada,
 * con la palabra clave en grande, subtítulo palabra por palabra y, si se quiere,
 * una foto o un clip de fondo por escena. Estilo Playroom (docs/ESTILO-PLAYROOM.md)
 * con un acabado más de cine: cámara que empuja despacio, grano de película,
 * viñeta, desenfoque de movimiento en los cortes y separación de color en cada golpe.
 *
 * Mismas reglas de HyperFrames que studioCountdownHtml.ts: una sola escena con
 * `data-start`/`data-duration`, una línea de tiempo GSAP en pausa, nada al azar
 * ni con reloj (los saltos y el grano son listas fijas). */

import { documentHtml, escapeHtml, VIDEO_SIZES, type AssetUrl, type StudioVideo } from './studioVideo';
import { VOICE_GAP, VOICE_LEAD, VOICE_TAIL, voiceIsFresh, voiceTotalSecs, type VoiceBeat } from './studioVoice';

const COLORS = { bg: '#00A3FF', white: '#FFFFFF', magenta: '#FF008E', blue: '#0010DF', pink: '#EF8DFF' };
const round = (n: number) => Math.round(n * 100) / 100;
const isVideoUrl = (url: string) => /\.(mp4|webm|mov)(\?|#|$)/i.test(url);
const fit = (text: string, width: number, cw: number, max: number, min: number) => Math.round(Math.max(min, Math.min(max, width / (Math.max(1, text.length) * cw))));
const norm = (w: string) => w.toLowerCase().replace(/[^a-z0-9áéíóúüñ]/g, '');

export interface BeatTiming { start: number; end: number; showEnd: number }

/** Cuándo empieza y termina cada escena: sigue a la voz, con un respiro entre una y otra. */
export function beatTimings(beats: Pick<VoiceBeat, 'secs'>[]): BeatTiming[] {
  let t = VOICE_LEAD;
  return beats.map((b, i) => {
    const start = t;
    const end = start + b.secs;
    t = end + VOICE_GAP;
    return { start: round(start), end: round(end), showEnd: round(i === beats.length - 1 ? end + VOICE_TAIL : end + VOICE_GAP) };
  });
}

/** Cada palabra del subtítulo entra cuando la voz llega a ella (reparto por largo de la palabra). */
export function wordTimes(say: string, start: number, secs: number): { word: string; at: number }[] {
  const words = say.trim().split(/\s+/).filter(Boolean);
  const weight = words.map((w) => norm(w).length + 1.5);
  const sum = weight.reduce((a, b) => a + b, 0) || 1;
  let acc = 0;
  return words.map((word, i) => {
    const at = start + (acc / sum) * secs * 0.96;
    acc += weight[i];
    return { word, at: round(at) };
  });
}

/** Saltos fijos de la cámara en un golpe, y del grano de película. */
const SHAKE = [[-14, 8], [11, -9], [-7, 5], [5, -3], [0, 0]] as const;
const GRAIN = [[0, 0], [-120, 70], [90, -150], [-60, -90], [150, 40], [-30, 130], [70, 100], [-140, -40]] as const;
const GRAIN_SVG = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='300' height='300'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.55 0'/></filter><rect width='300' height='300' filter='url(%23n)'/></svg>";

export function voiceReelHtml(video: StudioVideo, opts: { asset: AssetUrl }): string {
  const voice = video.voice;
  if (!voice) throw new Error('El reel con voz no tiene datos.');
  const { width, height } = VIDEO_SIZES.reel;
  const asset = opts.asset;
  // Con la voz al día, la duración de cada frase es la real; si no, una estimación (vista previa muda).
  const fresh = voiceIsFresh(voice);
  const beats = voice.beats;
  const timings = beatTimings(beats);
  const total = voiceTotalSecs(voice);
  const parts: string[] = [];
  const js: string[] = [];
  const body: string[] = [];

  const beatHtml: string[] = [];
  beats.forEach((b, i) => {
    const { start, end, showEnd } = timings[i];
    const id = `b${i}`;
    const inner: string[] = [];
    const last = i === beats.length - 1;
    const hasBg = !!b.bg;
    // Empuje lento de cámara durante toda la escena.
    js.push(`tl.fromTo("#${id} .push", { scale: 1, rotation: ${i % 2 ? 0.6 : -0.6} }, { scale: 1.06, rotation: 0, duration: ${round(showEnd - start + VOICE_GAP / 2)}, ease: "none" }, ${round(start - (i ? VOICE_GAP / 2 : 0))});`);

    if (hasBg) {
      inner.push(isVideoUrl(b.bg!)
        ? `<video class="media" src="${escapeHtml(asset(b.bg!))}" muted playsinline></video>`
        : `<img class="media" src="${escapeHtml(asset(b.bg!))}" alt="">`);
      inner.push('<div class="tint"></div>');
    }
    if (b.tag) {
      inner.push(`<div class="tag">${escapeHtml(b.tag)}</div>`);
      js.push(`tl.fromTo("#${id} .tag", { x: -420, opacity: 0, rotation: -12 }, { x: 0, opacity: 1, rotation: -3, duration: 0.5, ease: "expo.out" }, ${round(start + 0.05)});`);
    }

    if (b.kind === 'phone') {
      const words = wordTimes(b.say, start + 0.9, Math.max(0.6, b.secs - 0.9));
      inner.push(`<div class="stage"><div class="phone"><div class="notch"></div><div class="glare"></div>
<div class="chat-head"><span class="dot"></span><b>Mansion Playroom</b><i>en línea</i></div>
<div class="chat-body"><div class="typing"><span></span><span></span><span></span></div>
<div class="bubble">${words.map((w, k) => `<span class="pw" data-k="${k}">${escapeHtml(w.word)}</span>`).join(' ')}</div></div></div></div>`);
      js.push(`tl.fromTo("#${id} .phone", { rotationY: 78, rotationZ: 14, y: 300, scale: 0.5, opacity: 0 }, { rotationY: -7, rotationZ: -5, y: 0, scale: 1, opacity: 1, duration: 0.8, ease: "expo.out" }, ${round(start + 0.02)});`);
      js.push(`tl.to("#${id} .phone", { y: -16, rotationZ: -4, duration: ${round(Math.max(0.5, b.secs - 1))}, ease: "sine.inOut", yoyo: true, repeat: 1 }, ${round(start + 0.8)});`);
      js.push(`tl.fromTo("#${id} .typing", { opacity: 0, scale: 0.6 }, { opacity: 1, scale: 1, duration: 0.2, ease: "back.out(2)" }, ${round(start + 0.55)});`);
      js.push(`tl.to("#${id} .typing span", { y: -10, duration: 0.18, ease: "sine.inOut", yoyo: true, repeat: 3, stagger: 0.08 }, ${round(start + 0.55)});`);
      js.push(`tl.set("#${id} .typing", { display: "none" }, ${round(start + 0.85)});`);
      js.push(`tl.fromTo("#${id} .bubble", { scale: 0.4, opacity: 0, transformOrigin: "0% 100%" }, { scale: 1, opacity: 1, duration: 0.3, ease: "back.out(1.8)" }, ${round(start + 0.85)});`);
      words.forEach((w, k) => js.push(`tl.fromTo("#${id} .pw[data-k='${k}']", { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 0.18, ease: "power2.out" }, ${w.at});`));
      js.push(`tl.to("#${id} .phone", { scale: 6, y: 340, duration: 0.45, ease: "power3.in" }, ${round(Math.max(start + 1, end + 0.02))});`);
    }

    if (b.kind === 'big' || b.kind === 'stamp') {
      const text = b.big ?? '';
      const size = b.kind === 'stamp' ? 560 : fit(text, 960, 0.47, 340, 120);
      const chars = Array.from(text).map((ch, k) => (ch === ' ' ? '<span class="c sp"> </span>' : `<span class="c" data-k="${k}">${escapeHtml(ch)}</span>`)).join('');
      inner.push(`<div class="disc"></div><div class="bigword" style="font-size:${size}px">${chars}</div>`);
      if (b.sub) inner.push(`<div class="subtxt">${escapeHtml(b.sub)}</div>`);
      if (b.chips?.length) inner.push(`<div class="chips">${b.chips.map((c, k) => `<span class="chip${c.startsWith('~') ? ' neg' : ''}" data-k="${k}">${escapeHtml(c.replace(/^~/, ''))}</span>`).join('')}</div>`);
      const hit = round(start + 0.1 + 0.3);
      js.push(`tl.fromTo("#${id} .disc", { scale: 0, opacity: 1 }, { scale: 1, duration: 0.6, ease: "back.out(1.2)" }, ${round(start + 0.02)});`);
      js.push(`tl.fromTo("#${id} .c", { y: -460, rotation: -18, opacity: 0, scale: 1.7, filter: "blur(14px)" }, { y: 0, rotation: 0, opacity: 1, scale: 1, filter: "blur(0px)", duration: 0.5, ease: "expo.out", stagger: 0.04 }, ${round(start + 0.1)});`);
      // Golpe: las dos copias de color se juntan y la cámara se sacude una vez.
      js.push(`tl.fromTo("#${id} .bigword", { textShadow: "-26px 0 0 ${COLORS.magenta}, 26px 0 0 ${COLORS.blue}, 0 12px 0 ${COLORS.blue}" }, { textShadow: "0px 0 0 rgba(255,0,142,0), 0px 0 0 rgba(0,16,223,0), 0 12px 0 ${COLORS.blue}", duration: 0.4, ease: "power2.out" }, ${hit});`);
      SHAKE.forEach(([x, y], k) => js.push(`tl.set("#cam", { x: ${x}, y: ${y} }, ${round(hit + k * 0.045)});`));
      if (b.sub) js.push(`tl.fromTo("#${id} .subtxt", { clipPath: "inset(0 100% 0 0)", x: -50 }, { clipPath: "inset(-20% -10% -20% -10%)", x: 0, duration: 0.55, ease: "expo.out" }, ${round(start + 0.9)});`);
      const gap = Math.max(0.5, (b.secs - 1.2) / Math.max(1, b.chips?.length ?? 1));
      b.chips?.forEach((_, k) => js.push(`tl.fromTo("#${id} .chip[data-k='${k}']", { scale: 0, rotation: -12, opacity: 0 }, { scale: 1, rotation: ${k % 2 ? 2 : -2}, opacity: 1, duration: 0.4, ease: "back.out(2)" }, ${round(start + 1.0 + k * gap)});`));
      js.push(`tl.to("#${id} .disc", { rotation: 20, duration: ${round(showEnd - start)}, ease: "none" }, ${round(start)});`);
      js.push(`tl.to("#${id} .bigword", { scale: 1.04, duration: 0.6, ease: "sine.inOut", yoyo: true, repeat: 1 }, ${round(start + 1.2)});`);

      const words = wordTimes(b.say, start, b.secs);
      const key = b.key ? norm(b.key) : '';
      inner.push(`<div class="caption">${words.map((w, k) => `<span class="cw${key && norm(w.word) === key ? ' key' : ''}" data-k="${k}">${escapeHtml(w.word)}</span>`).join(' ')}</div>`);
      words.forEach((w, k) => js.push(`tl.fromTo("#${id} .cw[data-k='${k}']", { opacity: 0, y: 34, scale: 0.8 }, { opacity: 1, y: 0, scale: 1, duration: 0.2, ease: "back.out(2)" }, ${w.at});`));
    }

    if (b.kind === 'end') {
      inner.push(`<img class="logo" src="${escapeHtml(asset('/studio/logo-wordmark-white.png'))}" alt="">`);
      inner.push(`<div class="city">» ${escapeHtml(voice.city)}</div><div class="handle">${escapeHtml(voice.handle)}</div><div class="age">+18 · RESPETO · CONSENTIMIENTO · LIBERTAD</div>`);
      js.push(`tl.fromTo("#${id} .logo", { scale: 2.2, opacity: 0, filter: "blur(24px)" }, { scale: 1, opacity: 1, filter: "blur(0px)", duration: 0.65, ease: "expo.out" }, ${round(start + 0.05)});`);
      js.push(`tl.fromTo("#${id} .city", { x: -300, opacity: 0 }, { x: 0, opacity: 1, duration: 0.5, ease: "expo.out" }, ${round(start + 0.6)});`);
      js.push(`tl.fromTo("#${id} .handle", { scale: 0, rotation: -8 }, { scale: 1, rotation: -2, duration: 0.5, ease: "back.out(2)" }, ${round(start + 0.95)});`);
      js.push(`tl.fromTo("#${id} .handle", { y: 0 }, { y: -8, duration: 0.5, ease: "sine.inOut", yoyo: true, repeat: 3 }, ${round(start + 1.5)});`);
      js.push(`tl.fromTo("#${id} .age", { y: 60, opacity: 0 }, { y: 0, opacity: 1, duration: 0.45, ease: "expo.out" }, ${round(start + 1.3)});`);
    }

    beatHtml.push(`<div id="${id}" class="beat"><div class="push">${inner.join('')}</div></div>`);
    // Entrada (sale del desenfoque) y salida (se desenfoca y se agranda justo antes del corte).
    const enter = round(start - (i === 0 ? 0 : VOICE_GAP / 2));
    js.push(`tl.fromTo("#${id}", { opacity: 0, filter: "blur(${i === 0 ? 0 : 18}px)", scale: ${i === 0 ? 1 : 0.94} }, { opacity: 1, filter: "blur(0px)", scale: 1, duration: ${i === 0 ? 0.01 : 0.3}, ease: "power3.out" }, ${enter});`);
    if (hasBg) js.push(`tl.fromTo("#${id} .media", { scale: 1.14 }, { scale: 1, duration: ${round(showEnd - start)}, ease: "none" }, ${round(start)});`);
    if (!last) {
      const out = round(showEnd - VOICE_GAP / 2);
      js.push(`tl.to("#${id}", { filter: "blur(16px)", scale: 1.1, duration: 0.14, ease: "power2.in" }, ${round(out - 0.14)});`);
      js.push(`tl.set("#${id}", { opacity: 0 }, ${out});`);
      // Destello blanco y un reflejo magenta que cruza en el corte.
      js.push(`tl.fromTo("#flash", { opacity: 0.9 }, { opacity: 0, duration: 0.25, ease: "power2.out" }, ${out});`);
      js.push(`tl.fromTo("#leak", { opacity: 0.85, x: 260 }, { opacity: 0, x: -160, duration: 0.45, ease: "power2.out" }, ${out});`);
    }
  });

  // Estrellitas que flotan a distintas profundidades (las lejanas, borrosas y lentas).
  const deco = [
    { x: 90, y: 330, s: 90, c: COLORS.white, z: 1 }, { x: 900, y: 520, s: 70, c: COLORS.magenta, z: 0 }, { x: 150, y: 1180, s: 60, c: COLORS.pink, z: 0 },
    { x: 880, y: 1330, s: 120, c: COLORS.white, z: 2 }, { x: 520, y: 150, s: 56, c: COLORS.blue, z: 0 },
  ];
  deco.forEach((d, k) => {
    parts.push(`<div class="star z${d.z}" id="st${k}" style="left:${d.x}px;top:${d.y}px;font-size:${d.s}px;color:${d.c}">✦</div>`);
    js.push(`tl.fromTo("#st${k}", { y: 0, rotation: 0 }, { y: ${(k % 2 ? -1 : 1) * (40 + d.z * 40)}, rotation: ${k % 2 ? 90 : -90}, duration: ${round(total / 3)}, ease: "sine.inOut", yoyo: true, repeat: 2 }, 0);`);
  });

  parts.push(`<div id="cam">${beatHtml.join('')}</div>`);
  parts.push('<div id="leak"></div><div id="vig"></div><div id="grain"></div><div id="flash"></div>');
  js.push('tl.set("#flash", { opacity: 0 }, 0);');
  js.push('tl.set("#leak", { opacity: 0 }, 0);');
  // Grano de película: salta a otro lugar cada 0,1 s, siempre en el mismo orden.
  for (let t = 0, k = 0; t < total; t = round(t + 0.1), k++) js.push(`tl.set("#grain", { x: ${GRAIN[k % GRAIN.length][0]}, y: ${GRAIN[k % GRAIN.length][1]} }, ${t});`);

  body.push(`<div id="scene" class="clip scene" data-start="0" data-duration="${total}" data-track-index="1">${parts.join('')}</div>`);
  if (fresh) body.push(`<audio id="voice" class="clip" src="${escapeHtml(asset(voice.voiceUrl))}" data-start="0" data-duration="${total}" data-track-index="7" data-volume="1"></audio>`);
  // Música de fondo opcional (se baja sola para que la voz mande).
  if (video.music) {
    const m = video.music;
    const fade = Math.min(m.fadeOut, total);
    body.push(`<audio id="mu" class="clip" src="${escapeHtml(asset(m.url))}" data-start="0" data-duration="${total}" data-track-index="8" data-volume="${m.volume / 100}" data-media-start="${m.start}"${fade ? ` data-fade-out="${fade}"` : ''}></audio>`);
  }

  const css = `
.scene { position: absolute; inset: 0; overflow: hidden; z-index: 1; background: ${COLORS.bg}; }
#cam { position: absolute; inset: 0; z-index: 5; }
.beat { position: absolute; inset: 0; opacity: 0; }
.push { position: absolute; inset: 0; transform-origin: 50% 55%; }
#flash { position: absolute; inset: 0; background: #fff; opacity: 0; z-index: 30; pointer-events: none; }
#leak { position: absolute; inset: -10%; background: radial-gradient(60% 45% at 85% 40%, ${COLORS.magenta}CC, transparent 70%); opacity: 0; z-index: 25; mix-blend-mode: screen; pointer-events: none; }
#vig { position: absolute; inset: 0; z-index: 20; pointer-events: none; background: radial-gradient(ellipse at 50% 50%, transparent 52%, ${COLORS.blue}59 100%); }
#grain { position: absolute; inset: -260px; z-index: 22; pointer-events: none; opacity: 0.16; mix-blend-mode: overlay; background-image: url("${GRAIN_SVG}"); background-size: 300px 300px; }
.star { position: absolute; z-index: 2; line-height: 1; opacity: 0.9; }
.star.z0 { filter: blur(3px); opacity: 0.6; }
.star.z2 { filter: blur(1px); }
.media { position: absolute; left: 0; top: 0; width: ${width}px; height: ${height}px; object-fit: cover; }
.tint { position: absolute; inset: 0; background: ${COLORS.bg}99; }
.tag { position: absolute; left: 80px; top: 130px; padding: 18px 38px; border-radius: 24px; background: #fff; color: ${COLORS.magenta}; font: 600 52px 'Gliker Semi Bold Expanded', sans-serif; box-shadow: 6px 8px 0 ${COLORS.blue}, 0 24px 40px #0010DF40; transform: rotate(-3deg); }
.disc { position: absolute; left: 90px; top: 360px; width: 900px; height: 900px; border-radius: 50%; background: ${COLORS.magenta}; opacity: 0; box-shadow: 0 40px 80px #0010DF55; }
.bigword { position: absolute; left: 0; right: 0; top: 560px; text-align: center; font-family: 'Anton', sans-serif; line-height: 1.05; color: #fff; white-space: nowrap; }
.bigword .c { display: inline-block; }
.bigword .sp { width: 0.3em; }
.subtxt { position: absolute; left: 110px; top: 1010px; font: italic 800 110px 'Barlow Condensed', sans-serif; color: #fff; text-shadow: 6px 6px 0 ${COLORS.blue}; white-space: nowrap; padding-left: 28px; border-left: 14px solid #fff; }
.chips { position: absolute; left: 0; right: 0; top: 1010px; display: flex; gap: 28px; justify-content: center; flex-wrap: wrap; padding: 0 60px; }
.chip { padding: 22px 48px; border-radius: 60px; background: #fff; color: ${COLORS.magenta}; font: 800 70px 'Inter', sans-serif; box-shadow: 6px 8px 0 ${COLORS.blue}, 0 22px 36px #0010DF40; white-space: nowrap; }
.chip.neg { background: ${COLORS.blue}; color: #fff; text-decoration: line-through; text-decoration-color: ${COLORS.magenta}; text-decoration-thickness: 8px; }
.caption { position: absolute; left: 70px; right: 70px; top: 1440px; text-align: center; font: 900 76px/1.12 'Inter', sans-serif; color: #fff; text-shadow: 5px 5px 0 ${COLORS.blue}; }
.cw { display: inline-block; opacity: 0; }
.cw.key { color: ${COLORS.magenta}; background: #fff; padding: 0 16px; border-radius: 16px; text-shadow: none; }
.stage { position: absolute; inset: 0; perspective: 1800px; display: flex; align-items: center; justify-content: center; }
.phone { width: 640px; height: 1120px; border-radius: 90px; background: #fff; border: 20px solid ${COLORS.blue}; box-shadow: 18px 24px 0 ${COLORS.magenta}, 0 60px 90px #0010DF66; position: relative; opacity: 0; overflow: hidden; }
.glare { position: absolute; inset: 0; z-index: 3; pointer-events: none; background: linear-gradient(115deg, transparent 38%, rgba(255,255,255,0.35) 46%, transparent 54%); }
.notch { position: absolute; left: 50%; top: 0; width: 220px; height: 44px; margin-left: -110px; background: ${COLORS.blue}; border-radius: 0 0 28px 28px; z-index: 2; }
.chat-head { margin-top: 44px; padding: 26px 30px; background: ${COLORS.magenta}; color: #fff; display: flex; align-items: center; gap: 16px; font: 800 38px 'Inter', sans-serif; }
.chat-head i { margin-left: auto; font-size: 26px; font-weight: 600; opacity: 0.85; }
.dot { width: 22px; height: 22px; border-radius: 50%; background: #fff; }
.chat-body { padding: 36px 30px; background: #E6F6FF; height: 100%; position: relative; }
.typing { display: inline-flex; gap: 10px; padding: 22px 28px; border-radius: 30px; background: #fff; opacity: 0; position: absolute; left: 30px; top: 40px; }
.typing span { width: 18px; height: 18px; border-radius: 50%; background: ${COLORS.blue}; }
.bubble { opacity: 0; max-width: 500px; padding: 30px 34px; border-radius: 12px 40px 40px 40px; background: #fff; color: ${COLORS.blue}; font: 800 58px/1.15 'Inter', sans-serif; box-shadow: 5px 6px 0 ${COLORS.pink}; }
.pw { display: inline-block; opacity: 0; }
.logo { position: absolute; left: 140px; top: 330px; width: 800px; filter: drop-shadow(0 10px 0 ${COLORS.blue}); }
.city { position: absolute; left: 80px; top: 820px; font: italic 800 100px 'Barlow Condensed', sans-serif; color: #fff; text-shadow: 6px 6px 0 ${COLORS.blue}; }
.handle { position: absolute; left: 120px; top: 1010px; padding: 28px 54px; border-radius: 70px; background: ${COLORS.magenta}; color: #fff; font: 800 66px 'Inter', sans-serif; box-shadow: 8px 10px 0 ${COLORS.blue}, 0 26px 40px #0010DF55; transform: rotate(-2deg); }
.age { position: absolute; left: 60px; right: 60px; top: 1330px; text-align: center; font: 800 44px 'Inter', sans-serif; color: #fff; letter-spacing: 0.06em; text-shadow: 3px 3px 0 ${COLORS.blue}; }`;

  const fonts = [
    `@font-face { font-family: 'Anton'; src: url('${asset('/studio/fonts/Anton-Regular.ttf')}') format('truetype'); font-weight: 400; }`,
    `@font-face { font-family: 'Barlow Condensed'; src: url('${asset('/studio/fonts/BarlowCondensed-ExtraBoldItalic.ttf')}') format('truetype'); font-weight: 800; font-style: italic; }`,
  ].join('\n');

  return documentHtml({ asset, width, height, total, css, body: body.join('\n'), script: js.join('\n'), title: video.title, extraFonts: fonts });
}
