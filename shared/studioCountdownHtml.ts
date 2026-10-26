/* La composición HyperFrames de la cuenta regresiva (shared/studioCountdown.ts).
 * Reel 9:16 a 1080×1920, con la misma disposición del reel «Faltan sólo 8 días
 * para…» hecho a mano en CapCut (colores de la marca): etiqueta arriba, número grande con su sello, nombre del
 * evento, fecha y hora con esquinas, pregunta, línea «comenta…» y ciudad.
 *
 * Reglas de HyperFrames, como en studioVideo.ts: una sola escena con
 * `data-start`/`data-duration`, una línea de tiempo GSAP en pausa registrada en
 * `window.__timelines`, nada al azar ni con reloj. Los saltos del glitch son
 * una lista fija de desplazamientos, no números al azar. */

import { COUNTDOWN_LOOKS, COUNTDOWN_SECS } from './studioCountdown';
import { documentHtml, escapeHtml, VIDEO_SIZES, type AssetUrl, type StudioVideo } from './studioVideo';

/** Letras propias de los reels de motion graphics (Anton y Barlow Condensed, licencia OFL). */
function countdownFonts(asset: AssetUrl): string {
  return [
    `@font-face { font-family: 'Anton'; src: url('${asset('/studio/fonts/Anton-Regular.ttf')}') format('truetype'); font-weight: 400; }`,
    `@font-face { font-family: 'Barlow Condensed'; src: url('${asset('/studio/fonts/BarlowCondensed-ExtraBoldItalic.ttf')}') format('truetype'); font-weight: 800; font-style: italic; }`,
  ].join('\n');
}

function isVideoUrl(url: string) {
  return /\.(mp4|webm|mov)(\?|#|$)/i.test(url);
}

const round = (n: number) => Math.round(n * 100) / 100;

/** Tamaño de una sola línea para que quepa en `width` (`cw` = ancho medio de una letra en «em»). */
function oneLine(text: string, width: number, cw: number, max: number, min: number): number {
  return Math.round(Math.max(min, Math.min(max, width / (Math.max(1, text.length) * cw))));
}

/** Desplazamientos del glitch, siempre los mismos (así el video sale igual cada vez que se graba). */
const JITTER = [-16, 12, -8, 14, -4, 0];
/** Cuánto se angosta el número grande (1 = el ancho normal de Anton). */
const NUMBER_SQUEEZE = 0.72;

export function countdownCompositionHtml(video: StudioVideo, opts: { asset: AssetUrl }): string {
  const raw = video.countdown;
  if (!raw) throw new Error('La cuenta regresiva no tiene datos.');
  // Los textos se guardan sin recortar (mientras se escribe); en pantalla van sin espacios en los bordes.
  const c = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, typeof v === 'string' ? v.trim() : v])) as typeof raw;
  const look = COUNTDOWN_LOOKS[c.look];
  const { width, height } = VIDEO_SIZES.reel;
  const total = COUNTDOWN_SECS;
  const asset = opts.asset;
  const media = video.mediaUrl;
  const mediaIsVideo = !!media && isVideoUrl(media);

  const body: string[] = [];
  const js: string[] = [];
  const el = (id: string) => `#${id}`;
  /** Sacude un elemento con los saltos fijos y muestra sus dos copias de color mientras tanto. */
  const glitch = (id: string, start: number, ghosts: boolean) => {
    JITTER.forEach((x, i) => js.push(`tl.set("${el(id)} .g", { x: ${x}, skewX: ${x ? -x / 4 : 0} }, ${round(start + i * 0.045)});`));
    if (ghosts) {
      js.push(`tl.set("${el(id)} .gh", { opacity: 0.9 }, ${start});`);
      js.push(`tl.fromTo("${el(id)} .gh.a", { x: -22 }, { x: 0, duration: 0.3, ease: "power2.out" }, ${start});`);
      js.push(`tl.fromTo("${el(id)} .gh.b", { x: 22 }, { x: 0, duration: 0.3, ease: "power2.out" }, ${start});`);
      js.push(`tl.set("${el(id)} .gh", { opacity: 0 }, ${round(start + 0.32)});`);
    }
  };

  const numberDigits = c.number.length;
  // Anton es más ancho que el número de la referencia: se angosta un 28 % (alto 610 px para un dígito).
  const numberSize = numberDigits <= 1 ? 610 : numberDigits === 2 ? 540 : Math.max(220, Math.round(1500 / numberDigits));
  const numberWidth = Math.round(numberDigits * numberSize * 0.46 * NUMBER_SQUEEZE);
  const nameSize = oneLine(c.eventName, 880, 0.84, 170, 56);
  const questionSize = oneLine(c.question, 860, 0.43, 128, 56);
  const subText = c.keyword ? `COMENTA “${c.keyword}” Y REVISA TU DM` : '';
  const subSize = oneLine(subText, 700, 0.62, 38, 24);
  const dateSize = oneLine(c.dateLabel, 540, 0.95, 60, 32);

  // Fondo: la foto o el video del evento con un velo del color del evento, o el degradado con puntitos.
  const parts: string[] = [];
  if (media && !mediaIsVideo) parts.push(`<img id="cd-m" class="media" src="${escapeHtml(asset(media))}" alt="">`);
  if (media) parts.push('<div class="tint"></div>');
  if (mediaIsVideo) body.push(`<video id="cd-m" class="clip media" src="${escapeHtml(asset(media))}" muted playsinline data-start="0" data-duration="${total}" data-track-index="0"></video>`);

  if (c.lead) parts.push(`<div id="cd-tag" class="el"><div class="g tag">${escapeHtml(c.lead)}</div></div>`);
  parts.push(`<div id="cd-row" class="el"><div id="cd-num"><div class="g"><span class="gh a">${escapeHtml(c.number)}</span><span class="gh b">${escapeHtml(c.number)}</span><span class="main">${escapeHtml(c.number)}</span></div></div>${c.unit ? `<div id="cd-unit"><span>${escapeHtml(c.unit)}</span></div>` : ''}</div>`);
  if (c.connector) parts.push(`<div id="cd-conn" class="el"><div class="g">${escapeHtml(c.connector)}</div></div>`);
  parts.push(`<div id="cd-name" class="el"><div class="g"><span class="gh a">${escapeHtml(c.eventName)}</span><span class="gh b">${escapeHtml(c.eventName)}</span><span class="main">${escapeHtml(c.eventName)}</span></div></div>`);
  if (c.dateLabel) parts.push(`<div id="cd-date" class="el"><span class="cr a"></span><div class="box">${escapeHtml(c.dateLabel)}</div><span class="cr b"></span></div>`);
  if (c.question) parts.push(`<div id="cd-q" class="el"><div class="txt">${escapeHtml(c.question)}</div><span class="bar"></span></div>`);
  if (subText) parts.push(`<div id="cd-sub" class="el"><div class="txt">${escapeHtml(subText)}</div></div>`);
  if (c.location) parts.push(`<div id="cd-loc" class="el"><span class="chev">»</span><span>${escapeHtml(c.location)}</span></div>`);

  body.push(`<div id="cd" class="clip scene" data-start="0" data-duration="${total}" data-track-index="1" style="background:${mediaIsVideo ? 'transparent' : look.bg}">${parts.join('')}</div>`);

  // Música: suena todo el video y se apaga de a poco al final.
  if (video.music) {
    const m = video.music;
    const fade = Math.min(m.fadeOut, total);
    body.push(`<audio id="mu" class="clip" src="${escapeHtml(asset(m.url))}" data-start="0" data-duration="${total}" data-track-index="7" data-volume="${m.volume / 100}" data-media-start="${m.start}"${fade ? ` data-fade-out="${fade}"` : ''}></audio>`);
  }

  // --- Línea de tiempo -----------------------------------------------------
  // Fondo: un acercamiento lento de la foto o el video (el fondo liso de la marca no se mueve).
  if (media) js.push(`tl.fromTo("#cd-m", { scale: 1.12 }, { scale: 1, duration: ${total}, ease: "none" }, 0);`);
  // 1. Etiqueta de arriba: entra de la izquierda con un destello.
  if (c.lead) {
    js.push(`tl.fromTo("#cd-tag", { x: -760, opacity: 0 }, { x: 0, opacity: 1, duration: 0.45, ease: "power3.out" }, 0.2);`);
    glitch('cd-tag', 0.62, false);
  }
  // 2. Número: cae grande, con las dos copias de color separándose.
  js.push(`tl.fromTo("#cd-num", { scale: 2.4, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.42, ease: "power4.out" }, 0.55);`);
  glitch('cd-num', 0.6, true);
  // 3. Sello: se estampa.
  if (c.unit) js.push(`tl.fromTo("#cd-unit", { scale: 2.6, opacity: 0, rotate: -14 }, { scale: 1, opacity: 1, rotate: -3, duration: 0.3, ease: "back.out(1.6)" }, 1.0);`);
  // 4. «Para..» y el nombre del evento (sale del desenfoque con el glitch).
  if (c.connector) {
    js.push(`tl.fromTo("#cd-conn", { x: -120, opacity: 0 }, { x: 0, opacity: 1, duration: 0.4, ease: "power3.out" }, 1.45);`);
    glitch('cd-conn', 1.85, false);
  }
  js.push(`tl.fromTo("#cd-name", { scale: 1.5, opacity: 0, filter: "blur(26px)" }, { scale: 1, opacity: 1, filter: "blur(0px)", duration: 0.5, ease: "power3.out" }, 1.7);`);
  glitch('cd-name', 2.15, true);
  glitch('cd-name', 4.2, true);
  // 5. Fecha y hora: la caja se abre y las esquinas se dibujan.
  if (c.dateLabel) {
    js.push(`tl.fromTo("#cd-date .box", { scaleX: 0, opacity: 0 }, { scaleX: 1, opacity: 1, duration: 0.4, ease: "power3.out" }, 2.45);`);
    js.push(`tl.fromTo("#cd-date .cr", { scale: 0, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.3, ease: "back.out(2)", stagger: 0.12 }, 2.75);`);
    js.push(`tl.fromTo("#cd-date", { scale: 1 }, { scale: 1.04, duration: 0.3, ease: "sine.inOut", yoyo: true, repeat: 3 }, 4.6);`);
  }
  // 6. Pregunta: sale de a poco de la izquierda; la barra roja se estira.
  if (c.question) {
    js.push(`tl.fromTo("#cd-q .txt", { clipPath: "inset(0% 100% 0% 0%)", x: -40 }, { clipPath: "inset(-20% -10% -20% -10%)", x: 0, duration: 0.55, ease: "power3.out" }, 3.15);`);
    js.push(`tl.fromTo("#cd-q .bar", { scaleX: 0 }, { scaleX: 1, duration: 0.4, ease: "power3.out" }, 3.5);`);
  }
  // 7. «Comenta…» y la ciudad.
  if (subText) js.push(`tl.fromTo("#cd-sub", { y: 40, opacity: 0 }, { y: 0, opacity: 1, duration: 0.35, ease: "power3.out" }, 3.85);`);
  if (c.location) js.push(`tl.fromTo("#cd-loc", { x: -80, opacity: 0 }, { x: 0, opacity: 1, duration: 0.35, ease: "power3.out" }, 4.1);`);
  // El número late mientras se lee el resto.
  js.push(`tl.fromTo("#cd-num", { scale: 1 }, { scale: 1.035, duration: 0.4, ease: "sine.inOut", yoyo: true, repeat: 3 }, 4.0);`);

  const css = `
.scene { position: absolute; inset: 0; overflow: hidden; z-index: 1; }
video.media { z-index: 0; }
.media { position: absolute; left: 0; top: 0; width: ${width}px; height: ${height}px; object-fit: cover; }
/* Sobre una foto o un video: un velo liso del color de la marca para que el texto se lea. */
.tint { position: absolute; inset: 0; background: ${look.bg}8C; }
.el { position: absolute; z-index: 5; }
.g { position: relative; }
.gh { position: absolute; left: 0; top: 0; opacity: 0; white-space: nowrap; }
.gh.a { color: ${look.ghostA}; }
.gh.b { color: ${look.ghostB}; }
#cd-tag { left: 80px; top: 140px; }
.tag { padding: 22px 44px; border-radius: 26px; background: ${look.tag}; color: ${look.tagText}; font-family: 'Gliker Semi Bold Expanded', sans-serif; font-weight: 600; font-size: 56px; letter-spacing: 0.01em; white-space: nowrap; box-shadow: 6px 8px 0 ${look.ink}; }
#cd-row { left: 0; right: 0; top: 285px; display: flex; justify-content: center; align-items: flex-start; gap: 14px; }
#cd-num { width: ${numberWidth}px; font-family: 'Anton', sans-serif; font-size: ${numberSize}px; line-height: 1; color: ${look.big}; text-shadow: 0 12px 0 ${look.bigShadow}; position: relative; }
#cd-num .main { position: relative; display: block; }
#cd-num .main, #cd-num .gh { transform: scaleX(${NUMBER_SQUEEZE}); transform-origin: left top; }
#cd-unit { margin-top: ${Math.round(numberSize * 0.3)}px; transform: rotate(-3deg); padding: 6px 30px 8px; background: ${look.box}; border: 4px solid ${look.line}; box-shadow: 6px 8px 0 ${look.ink}; color: ${look.boxText}; font-family: 'Gliker Semi Bold Expanded', sans-serif; font-weight: 600; font-size: 66px; line-height: 1.15; }
#cd-conn { left: 150px; top: 860px; }
#cd-conn .g { font-family: 'Barlow Condensed', sans-serif; font-weight: 800; font-style: italic; font-size: 92px; color: #FFFFFF; text-shadow: 5px 5px 0 ${look.ink}; white-space: nowrap; line-height: 1; }
#cd-name { left: 0; right: 0; top: 985px; text-align: center; }
#cd-name .g { display: inline-block; font-family: 'Inter', sans-serif; font-weight: 900; font-size: ${nameSize}px; line-height: 1; letter-spacing: -0.02em; color: ${look.big}; text-shadow: 0 8px 0 ${look.bigShadow}; white-space: nowrap; }
#cd-name .main { position: relative; display: block; }
#cd-date { left: 240px; top: 1245px; }
#cd-date .box { background: ${look.box}; color: ${look.boxText}; box-shadow: 8px 10px 0 ${look.ink}; font-family: 'Unbounded', sans-serif; font-weight: 800; font-size: ${dateSize}px; line-height: 1; padding: 26px 52px; text-align: center; white-space: nowrap; min-width: 500px; }
#cd-date .cr { position: absolute; width: 90px; height: 90px; border: 0 solid ${look.line}; }
#cd-date .cr.a { left: -22px; top: -26px; border-top-width: 7px; border-left-width: 7px; }
#cd-date .cr.b { right: -22px; bottom: -26px; border-bottom-width: 7px; border-right-width: 7px; }
#cd-q { left: 80px; top: 1425px; width: 890px; }
#cd-q .txt { font-family: 'Barlow Condensed', sans-serif; font-weight: 800; font-style: italic; font-size: ${questionSize}px; line-height: 1; color: #FFFFFF; text-shadow: 6px 6px 0 ${look.ink}; white-space: nowrap; padding: 14px 0 22px 30px; border-left: 14px solid ${look.line}; }
#cd-q .bar { display: block; height: 14px; background: ${look.line}; transform-origin: left center; }
#cd-sub { left: 195px; top: 1568px; }
#cd-sub .txt { background: ${look.box}; color: ${look.boxText}; font-family: 'Inter', sans-serif; font-weight: 800; font-style: italic; font-size: ${subSize}px; line-height: 1; padding: 14px 22px; white-space: nowrap; border-right: 12px solid ${look.ink}; }
#cd-loc { left: 34px; top: 1735px; display: flex; align-items: center; gap: 16px; font-family: 'Inter', sans-serif; font-weight: 800; font-size: 56px; color: #FFFFFF; text-shadow: 3px 3px 0 ${look.ink}; }
#cd-loc .chev { color: #FFFFFF; opacity: 0.85; font-size: 72px; line-height: 0.8; }`;

  return documentHtml({ asset, width, height, total, css, body: body.join('\n'), script: js.join('\n'), title: video.title, extraFonts: countdownFonts(asset) });
}
