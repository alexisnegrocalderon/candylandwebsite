/* Reel con voz: un guion en escenas, cada una con su frase hablada. El texto y
 * los movimientos caen en el ritmo de la voz (estilo Playroom, ver
 * docs/ESTILO-PLAYROOM.md). Es el formato «tipografía cinética»: una palabra
 * grande por momento, subtítulo palabra por palabra y fondos opcionales
 * (fotos o clips que se van sumando).
 *
 * Mismas reglas de HyperFrames que studioCountdownHtml.ts: una sola escena con
 * `data-start`/`data-duration`, una línea de tiempo GSAP en pausa, nada al azar. */

import { documentHtml, escapeHtml, VIDEO_SIZES, type AssetUrl } from './studioVideo';

export type VoiceBeatKind = 'phone' | 'big' | 'stamp' | 'end';

export interface VoiceBeat {
  kind: VoiceBeatKind;
  /** Lo que dice la voz en esta escena (también es el subtítulo). */
  say: string;
  /** Duración real del audio de esta frase, en segundos. */
  voiceSecs: number;
  /** Palabra grande (`big`/`stamp`). */
  big?: string;
  /** Etiqueta chica de arriba, p. ej. «1 DE 3». */
  tag?: string;
  /** Frase en cursiva bajo la palabra grande. */
  sub?: string;
  /** Píldoras que van apareciendo bajo la palabra (la última puede ir tachada con «~»). */
  chips?: string[];
  /** Foto o clip de fondo de esta escena (opcional; lleva un velo del color). */
  bg?: string;
  /** Palabra del subtítulo que se resalta. */
  key?: string;
}

export interface VoiceReel {
  title: string;
  beats: VoiceBeat[];
  /** MP3/WAV con toda la voz ya unida, con las pausas de `VOICE_GAP`. */
  voiceUrl: string;
  /** @usuario y ciudad de la tarjeta final. */
  handle: string;
  city: string;
  /** Logo blanco de la marca (tarjeta final). */
  logoUrl?: string;
}

/** Silencio antes de la primera frase y entre frases (la voz y los cortes caen aquí). */
export const VOICE_LEAD = 0.35;
export const VOICE_GAP = 0.3;
export const VOICE_TAIL = 1.1;

const COLORS = { bg: '#00A3FF', white: '#FFFFFF', magenta: '#FF008E', blue: '#0010DF', pink: '#EF8DFF' };
const round = (n: number) => Math.round(n * 100) / 100;

export interface BeatTiming { start: number; end: number; showEnd: number }

/** Cuándo empieza y termina cada escena: sigue a la voz, con un respiro entre una y otra. */
export function beatTimings(beats: VoiceBeat[]): { timings: BeatTiming[]; total: number } {
  let t = VOICE_LEAD;
  const timings = beats.map((b, i) => {
    const start = t;
    const end = start + b.voiceSecs;
    t = end + VOICE_GAP;
    return { start, end, showEnd: i === beats.length - 1 ? end + VOICE_TAIL : start + b.voiceSecs + VOICE_GAP };
  });
  return { timings, total: round(timings[timings.length - 1].showEnd) };
}

/** Cada palabra del subtítulo entra cuando la voz llega a ella (reparto por largo de la palabra). */
export function wordTimes(say: string, start: number, secs: number): { word: string; at: number }[] {
  const words = say.trim().split(/\s+/).filter(Boolean);
  const weight = words.map((w) => w.replace(/[^\p{L}\p{N}]/gu, '').length + 1.5);
  const sum = weight.reduce((a, b) => a + b, 0);
  let acc = 0;
  return words.map((word, i) => {
    const at = start + (acc / sum) * secs * 0.96;
    acc += weight[i];
    return { word, at: round(at) };
  });
}

const fit = (text: string, width: number, cw: number, max: number, min: number) => Math.round(Math.max(min, Math.min(max, width / (Math.max(1, text.length) * cw))));
const isVideoUrl = (url: string) => /\.(mp4|webm|mov)(\?|#|$)/i.test(url);

export function voiceReelHtml(reel: VoiceReel, opts: { asset: AssetUrl }): string {
  const { width, height } = VIDEO_SIZES.reel;
  const { timings, total } = beatTimings(reel.beats);
  const asset = opts.asset;
  const css: string[] = [];
  const body: string[] = [];
  const js: string[] = [];
  const parts: string[] = [];

  // Destello blanco entre escena y escena + adornos que flotan.
  parts.push('<div id="flash"></div>');
  js.push('tl.set("#flash", { opacity: 0 }, 0);');

  reel.beats.forEach((b, i) => {
    const { start, end, showEnd } = timings[i];
    const id = `b${i}`;
    const inner: string[] = [];
    const last = i === reel.beats.length - 1;
    const hasBg = !!b.bg;

    if (hasBg) {
      inner.push(isVideoUrl(b.bg!)
        ? `<video class="media" src="${escapeHtml(asset(b.bg!))}" muted playsinline></video>`
        : `<img class="media" src="${escapeHtml(asset(b.bg!))}" alt="">`);
      inner.push('<div class="tint"></div>');
    }

    // Etiqueta de arriba.
    if (b.tag) inner.push(`<div class="tag">${escapeHtml(b.tag)}</div>`);

    if (b.kind === 'phone') {
      const words = wordTimes(b.say, start + 0.9, b.voiceSecs - 0.9);
      inner.push(`<div class="stage"><div class="phone"><div class="notch"></div>
<div class="chat-head"><span class="dot"></span><b>Mansion Playroom</b><i>en línea</i></div>
<div class="chat-body"><div class="typing"><span></span><span></span><span></span></div>
<div class="bubble">${words.map((w, k) => `<span class="pw" data-k="${k}">${escapeHtml(w.word)}</span>`).join(' ')}</div></div></div></div>`);
      js.push(`tl.fromTo("#${id} .phone", { rotationY: 78, rotationZ: 14, y: 260, scale: 0.55, opacity: 0 }, { rotationY: -7, rotationZ: -5, y: 0, scale: 1, opacity: 1, duration: 0.7, ease: "power3.out" }, ${round(start + 0.02)});`);
      js.push(`tl.fromTo("#${id} .typing", { opacity: 0, scale: 0.6 }, { opacity: 1, scale: 1, duration: 0.2, ease: "back.out(2)" }, ${round(start + 0.55)});`);
      js.push(`tl.to("#${id} .typing span", { y: -10, duration: 0.18, ease: "sine.inOut", yoyo: true, repeat: 3, stagger: 0.08 }, ${round(start + 0.55)});`);
      js.push(`tl.set("#${id} .typing", { display: "none" }, ${round(start + 0.85)});`);
      js.push(`tl.fromTo("#${id} .bubble", { scale: 0.4, opacity: 0, transformOrigin: "0% 100%" }, { scale: 1, opacity: 1, duration: 0.3, ease: "back.out(1.8)" }, ${round(start + 0.85)});`);
      words.forEach((w, k) => js.push(`tl.fromTo("#${id} .pw[data-k='${k}']", { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 0.18, ease: "power2.out" }, ${w.at});`));
      js.push(`tl.to("#${id} .phone", { scale: 6, y: 340, duration: 0.45, ease: "power3.in" }, ${round(end + 0.05)});`);
    }

    if (b.kind === 'big' || b.kind === 'stamp') {
      const text = b.big ?? '';
      const size = b.kind === 'stamp' ? 560 : fit(text, 960, 0.47, 340, 120);
      const chars = Array.from(text).map((ch, k) => (ch === ' ' ? '<span class="c sp"> </span>' : `<span class="c" data-k="${k}">${escapeHtml(ch)}</span>`)).join('');
      inner.push(`<div class="disc"></div><div class="bigword" style="font-size:${size}px">${chars}</div>`);
      if (b.sub) inner.push(`<div class="subtxt">${escapeHtml(b.sub)}</div>`);
      if (b.chips?.length) inner.push(`<div class="chips">${b.chips.map((c, k) => `<span class="chip${c.startsWith('~') ? ' neg' : ''}" data-k="${k}">${escapeHtml(c.replace(/^~/, ''))}</span>`).join('')}</div>`);
      js.push(`tl.fromTo("#${id} .disc", { scale: 0, opacity: 1 }, { scale: 1, duration: 0.5, ease: "back.out(1.4)" }, ${round(start + 0.02)});`);
      js.push(`tl.fromTo("#${id} .c", { y: -420, rotation: -18, opacity: 0, scale: 1.6 }, { y: 0, rotation: 0, opacity: 1, scale: 1, duration: 0.42, ease: "back.out(1.7)", stagger: 0.045 }, ${round(start + 0.1)});`);
      // Sacudida corta de la palabra cuando la voz la dice.
      js.push(`tl.fromTo("#${id} .bigword", { x: 0 }, { x: 10, duration: 0.05, ease: "none", yoyo: true, repeat: 5 }, ${round(start + 0.65)});`);
      if (b.sub) js.push(`tl.fromTo("#${id} .subtxt", { clipPath: "inset(0 100% 0 0)", x: -50 }, { clipPath: "inset(-20% -10% -20% -10%)", x: 0, duration: 0.5, ease: "power3.out" }, ${round(start + 0.9)});`);
      b.chips?.forEach((_, k) => js.push(`tl.fromTo("#${id} .chip[data-k='${k}']", { scale: 0, rotation: -12, opacity: 0 }, { scale: 1, rotation: ${k % 2 ? 2 : -2}, opacity: 1, duration: 0.35, ease: "back.out(2)" }, ${round(start + 1.0 + k * Math.max(0.5, (b.voiceSecs - 1.2) / Math.max(1, b.chips!.length)))});`));
      js.push(`tl.to("#${id} .disc", { rotation: 20, duration: ${round(end - start)}, ease: "none" }, ${round(start)});`);
      js.push(`tl.to("#${id} .bigword, #${id} .subtxt, #${id} .chips", { scale: 1.06, duration: 0.5, ease: "sine.inOut", yoyo: true, repeat: 1 }, ${round(start + 1.2)});`);
    }

    if (b.kind === 'end') {
      if (reel.logoUrl) inner.push(`<img class="logo" src="${escapeHtml(asset(reel.logoUrl))}" alt="">`);
      inner.push(`<div class="city">» ${escapeHtml(reel.city)}</div><div class="handle">${escapeHtml(reel.handle)}</div><div class="age">+18 · RESPETO · CONSENTIMIENTO · LIBERTAD</div>`);
      js.push(`tl.fromTo("#${id} .logo", { scale: 2.2, opacity: 0, filter: "blur(24px)" }, { scale: 1, opacity: 1, filter: "blur(0px)", duration: 0.55, ease: "power3.out" }, ${round(start + 0.05)});`);
      js.push(`tl.fromTo("#${id} .city", { x: -300, opacity: 0 }, { x: 0, opacity: 1, duration: 0.4, ease: "power3.out" }, ${round(start + 0.6)});`);
      js.push(`tl.fromTo("#${id} .handle", { scale: 0, rotation: -8 }, { scale: 1, rotation: -2, duration: 0.45, ease: "back.out(2)" }, ${round(start + 0.95)});`);
      js.push(`tl.fromTo("#${id} .age", { y: 60, opacity: 0 }, { y: 0, opacity: 1, duration: 0.4, ease: "power3.out" }, ${round(start + 1.3)});`);
    }

    // Subtítulo palabra por palabra (no en el celular ni en la tarjeta final).
    if (b.kind === 'big' || b.kind === 'stamp') {
      const words = wordTimes(b.say, start, b.voiceSecs);
      const key = b.key?.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
      inner.push(`<div class="caption">${words.map((w, k) => `<span class="cw${key && w.word.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '') === key ? ' key' : ''}" data-k="${k}">${escapeHtml(w.word)}</span>`).join(' ')}</div>`);
      words.forEach((w, k) => js.push(`tl.fromTo("#${id} .cw[data-k='${k}']", { opacity: 0, y: 30, scale: 0.8 }, { opacity: 1, y: 0, scale: 1, duration: 0.16, ease: "back.out(2)" }, ${w.at});`));
    }

    // Entrada, salida y destello entre escenas.
    parts.push(`<div id="${id}" class="beat">${inner.join('')}</div>`);
    js.push(`tl.set("#${id}", { opacity: 1 }, ${round(start - (i === 0 ? 0 : VOICE_GAP / 2))});`);
    if (hasBg) js.push(`tl.fromTo("#${id} .media", { scale: 1.12 }, { scale: 1, duration: ${round(showEnd - start)}, ease: "none" }, ${round(start)});`);
    if (!last) {
      const out = round(showEnd - VOICE_GAP / 2);
      js.push(`tl.set("#${id}", { opacity: 0 }, ${out});`);
      js.push(`tl.fromTo("#flash", { opacity: 0.95 }, { opacity: 0, duration: 0.22, ease: "power2.out" }, ${out});`);
    }
  });

  // Estrellitas y círculos que flotan detrás de todo.
  const deco = [
    { x: 90, y: 330, s: 90, c: COLORS.white }, { x: 900, y: 520, s: 70, c: COLORS.magenta }, { x: 150, y: 1180, s: 60, c: COLORS.pink },
    { x: 880, y: 1330, s: 100, c: COLORS.white }, { x: 520, y: 150, s: 56, c: COLORS.blue },
  ];
  deco.forEach((d, k) => {
    parts.splice(1, 0, `<div class="star" id="st${k}" style="left:${d.x}px;top:${d.y}px;font-size:${d.s}px;color:${d.c}">✦</div>`);
    js.push(`tl.fromTo("#st${k}", { y: 0, rotation: 0 }, { y: ${k % 2 ? -50 : 50}, rotation: ${k % 2 ? 90 : -90}, duration: ${round(total / 3)}, ease: "sine.inOut", yoyo: true, repeat: 2 }, 0);`);
  });

  body.push(`<div id="scene" class="clip scene" data-start="0" data-duration="${total}" data-track-index="1">${parts.join('')}</div>`);
  body.push(`<audio id="voice" class="clip" src="${escapeHtml(asset(reel.voiceUrl))}" data-start="0" data-duration="${total}" data-track-index="7" data-volume="1"></audio>`);

  css.push(`
.scene { position: absolute; inset: 0; overflow: hidden; z-index: 1; background: ${COLORS.bg}; }
.beat { position: absolute; inset: 0; opacity: 0; z-index: 5; }
#flash { position: absolute; inset: 0; background: #fff; opacity: 0; z-index: 20; pointer-events: none; }
.star { position: absolute; z-index: 2; line-height: 1; opacity: 0.9; }
.media { position: absolute; left: 0; top: 0; width: ${width}px; height: ${height}px; object-fit: cover; }
.tint { position: absolute; inset: 0; background: ${COLORS.bg}99; }
.tag { position: absolute; left: 80px; top: 130px; padding: 18px 38px; border-radius: 24px; background: #fff; color: ${COLORS.magenta}; font: 600 52px 'Gliker Semi Bold Expanded', sans-serif; box-shadow: 6px 8px 0 ${COLORS.blue}; transform: rotate(-3deg); }
.disc { position: absolute; left: 90px; top: 360px; width: 900px; height: 900px; border-radius: 50%; background: ${COLORS.magenta}; opacity: 0; }
.bigword { position: absolute; left: 0; right: 0; top: 560px; text-align: center; font-family: 'Anton', sans-serif; line-height: 1.05; color: #fff; text-shadow: 0 12px 0 ${COLORS.blue}; white-space: nowrap; }
.bigword .c { display: inline-block; }
.bigword .sp { width: 0.3em; }
.subtxt { position: absolute; left: 110px; top: 1010px; font: italic 800 110px 'Barlow Condensed', sans-serif; color: #fff; text-shadow: 6px 6px 0 ${COLORS.blue}; white-space: nowrap; padding-left: 28px; border-left: 14px solid #fff; }
.chips { position: absolute; left: 0; right: 0; top: 1010px; display: flex; gap: 28px; justify-content: center; flex-wrap: wrap; padding: 0 60px; }
.chip { padding: 22px 48px; border-radius: 60px; background: #fff; color: ${COLORS.magenta}; font: 800 70px 'Inter', sans-serif; box-shadow: 6px 8px 0 ${COLORS.blue}; white-space: nowrap; }
.chip.neg { background: ${COLORS.blue}; color: #fff; text-decoration: line-through; text-decoration-color: ${COLORS.magenta}; text-decoration-thickness: 8px; }
.caption { position: absolute; left: 70px; right: 70px; top: 1440px; text-align: center; font: 900 76px/1.12 'Inter', sans-serif; color: #fff; text-shadow: 5px 5px 0 ${COLORS.blue}; }
.cw { display: inline-block; opacity: 0; }
.cw.key { color: ${COLORS.magenta}; background: #fff; padding: 0 16px; border-radius: 16px; text-shadow: none; }
.stage { position: absolute; inset: 0; perspective: 1800px; display: flex; align-items: center; justify-content: center; }
.phone { width: 640px; height: 1120px; border-radius: 90px; background: #fff; border: 20px solid ${COLORS.blue}; box-shadow: 18px 24px 0 ${COLORS.magenta}; position: relative; opacity: 0; overflow: hidden; }
.notch { position: absolute; left: 50%; top: 0; width: 220px; height: 44px; margin-left: -110px; background: ${COLORS.blue}; border-radius: 0 0 28px 28px; }
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
.handle { position: absolute; left: 120px; top: 1010px; padding: 28px 54px; border-radius: 70px; background: ${COLORS.magenta}; color: #fff; font: 800 66px 'Inter', sans-serif; box-shadow: 8px 10px 0 ${COLORS.blue}; transform: rotate(-2deg); }
.age { position: absolute; left: 60px; right: 60px; top: 1330px; text-align: center; font: 800 44px 'Inter', sans-serif; color: #fff; letter-spacing: 0.06em; text-shadow: 3px 3px 0 ${COLORS.blue}; }`);

  const fonts = [
    `@font-face { font-family: 'Anton'; src: url('${asset('/studio/fonts/Anton-Regular.ttf')}') format('truetype'); font-weight: 400; }`,
    `@font-face { font-family: 'Barlow Condensed'; src: url('${asset('/studio/fonts/BarlowCondensed-ExtraBoldItalic.ttf')}') format('truetype'); font-weight: 800; font-style: italic; }`,
  ].join('\n');

  return documentHtml({ asset, width, height, total, css: css.join('\n'), body: body.join('\n'), script: js.join('\n'), title: reel.title, extraFonts: fonts });
}
