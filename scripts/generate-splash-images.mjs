#!/usr/bin/env node
/* Arma las pantallas de arranque de iOS (ver scripts/splash-devices.mjs):
 * fondo #0b0612, brillo violeta suave y el isotipo al centro, igual que el
 * primer cuadro del splash web. Se corre a mano cuando cambie el logo o haya
 * un dispositivo nuevo (requiere ImageMagick); las imágenes quedan en el repo.
 *
 *   node scripts/generate-splash-images.mjs
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { SPLASH_BG, SPLASH_GLOW, SPLASH_LOGO_CSS, splashVariants } from './splash-devices.mjs';

const root = join(import.meta.dirname, '..');
const logo = join(root, 'client/public/candyland/logo-isotipo-transparent.png');
const outDir = join(root, 'client/public/app-icons/splash');
mkdirSync(outDir, { recursive: true });

for (const v of splashVariants()) {
  const out = join(root, 'client/public', v.file);
  // Brillo: elipse de 98% x 70% de la pantalla centrada a 42% de alto (como el CSS).
  const gw = Math.round(v.pw * 0.98);
  const gh = Math.round(v.ph * 0.7);
  const gx = Math.round((v.pw - gw) / 2);
  const gy = Math.round(v.ph * 0.42 - gh / 2);
  const logoW = SPLASH_LOGO_CSS * v.dpr;
  // El logo va un poco sobre el centro: debajo está la línea de progreso (2 px + 28 px de espacio).
  const logoOffsetY = Math.round(-15 * v.dpr);
  execFileSync('convert', [
    '-size', `${v.pw}x${v.ph}`, `xc:${SPLASH_BG}`,
    '(', '-size', `${gw}x${gh}`, `radial-gradient:${SPLASH_GLOW}-${SPLASH_BG}`, ')',
    '-geometry', `+${gx}+${gy}`, '-composite',
    '(', logo, '-resize', `${logoW}x`, ')',
    '-gravity', 'center', '-geometry', `+0${logoOffsetY >= 0 ? '+' : ''}${logoOffsetY}`, '-composite',
    // Paleta de 256 colores: el degradado es oscuro y suave, así que no se nota
    // y cada imagen pesa ~140 KB en vez de ~1,4 MB.
    '-strip', '-colors', '256', '-define', 'png:compression-level=9', `PNG8:${out}`,
  ]);
  console.log(`[splash] ${v.file}`);
}
