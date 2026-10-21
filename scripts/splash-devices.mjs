/* Pantallas de arranque de iOS (`apple-touch-startup-image`) para las apps
 * instalables oscuras (panel y terminales). iOS no usa el `background_color`
 * del manifest: sin una imagen exacta para cada pantalla muestra blanco al
 * tocar el ícono. Lista compartida por scripts/generate-splash-images.mjs
 * (arma los PNG) y scripts/generate-pwa-html.mjs (pone los <link>). */

/** [ancho CSS, alto CSS, densidad] en vertical. */
export const IPHONES = [
  [375, 667, 2], // SE 2/3, 8
  [414, 736, 3], // 8 Plus
  [375, 812, 3], // X, XS, 11 Pro, 12/13 mini
  [414, 896, 2], // XR, 11
  [414, 896, 3], // XS Max, 11 Pro Max
  [390, 844, 3], // 12, 13, 14
  [428, 926, 3], // 12/13 Pro Max, 14 Plus
  [393, 852, 3], // 14 Pro, 15, 15 Pro, 16
  [430, 932, 3], // 14/15 Pro Max, 15 Plus, 16 Plus
  [402, 874, 3], // 16 Pro
  [440, 956, 3], // 16 Pro Max
];

/** iPad: se generan vertical y horizontal. */
export const IPADS = [
  [768, 1024, 2], // iPad 9.ª, mini 5
  [810, 1080, 2], // iPad 7.ª-9.ª 10,2"
  [820, 1180, 2], // iPad 10.ª, Air 4/5
  [834, 1112, 2], // Air 3, Pro 10,5"
  [834, 1194, 2], // Pro 11"
  [834, 1210, 2], // Pro 11" M4
  [744, 1133, 2], // mini 6
  [1024, 1366, 2], // Pro 12,9"
  [1032, 1376, 2], // Pro 13" M4
];

export const SPLASH_BG = '#0b0612';
/** Brillo violeta suave detrás del logo (mismo que el splash web). */
export const SPLASH_GLOW = '#241337';
/** Ancho del logo en px CSS. */
export const SPLASH_LOGO_CSS = 64;

/** Todas las variantes con su archivo y su media query. */
export function splashVariants() {
  const out = [];
  for (const [w, h, dpr] of IPHONES) out.push({ w, h, dpr, orientation: 'portrait' });
  for (const [w, h, dpr] of IPADS) {
    out.push({ w, h, dpr, orientation: 'portrait' });
    out.push({ w, h, dpr, orientation: 'landscape' });
  }
  return out.map((v) => {
    const pw = (v.orientation === 'portrait' ? v.w : v.h) * v.dpr;
    const ph = (v.orientation === 'portrait' ? v.h : v.w) * v.dpr;
    return {
      ...v, pw, ph,
      file: `/app-icons/splash/launch-${pw}x${ph}.png`,
      media: `(device-width: ${v.w}px) and (device-height: ${v.h}px) and (-webkit-device-pixel-ratio: ${v.dpr}) and (orientation: ${v.orientation})`,
    };
  });
}
