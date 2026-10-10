/* Genera los iconos de la web app (favicon, apple-touch-icon, etc.) a partir
 * del logo. Se corre a mano cuando haya que rehacerlos:
 *
 *   node scripts/generate-icons.mjs            # reescribe los iconos
 *   node scripts/generate-icons.mjs --preview <carpeta>   # solo vista previa
 *
 * Usa el Chromium que ya viene instalado para pruebas (Playwright), así que no
 * suma dependencias a la web. Diseño (09/10): el logo ocupa ~80% del cuadro
 * (antes ~45%), sobre negro profundo con un resplandor rosa y azul como el
 * neón del sitio. En 16/32/48 px se agranda más y no lleva brillo, para que
 * se lea en la pestaña del navegador. */
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const publicDir = path.join(root, 'client/public');
const iconDir = path.join(publicDir, 'candyland');
const logoPath = path.join(iconDir, 'logo-isotipo-transparent.png');

const require = createRequire(import.meta.url);
function loadPlaywright() {
  try { return require('playwright'); } catch { /* sigue */ }
  const globalRoot = execSync('npm root -g').toString().trim();
  return require(path.join(globalRoot, 'playwright'));
}

const LOGO_W = 337;
const LOGO_H = 465;
const logoData = `data:image/png;base64,${fs.readFileSync(logoPath).toString('base64')}`;

/** Una sola fuente de verdad del diseño: el mismo HTML para todos los tamaños. */
function iconHtml(size) {
  const small = size <= 64;
  const heightRatio = small ? 0.92 : 0.8;
  const h = size * heightRatio;
  const w = h * (LOGO_W / LOGO_H);
  const left = (size - w) / 2;
  const top = (size - h) / 2 + size * (small ? 0 : 0.012);
  const glow = small ? '' : `
    <div class="glow pink"></div>
    <div class="glow blue"></div>`;
  const shadow = small ? '' : `filter: drop-shadow(0 0 ${size * 0.02}px rgba(255,79,195,.4)) drop-shadow(0 0 ${size * 0.05}px rgba(98,60,255,.22));`;
  return `<!doctype html><meta charset="utf-8"><style>
    html,body{margin:0;width:${size}px;height:${size}px;overflow:hidden;background:#05030a}
    .bg{position:absolute;inset:0;background:radial-gradient(circle at 50% 46%, #170a28 0%, #090512 55%, #030208 100%)}
    .glow{position:absolute;border-radius:50%;filter:blur(${size * 0.1}px);opacity:.38}
    .pink{width:${size * 0.55}px;height:${size * 0.55}px;left:${size * 0.04}px;top:${size * 0.34}px;background:#ff2fb3}
    .blue{width:${size * 0.5}px;height:${size * 0.5}px;right:${size * 0.02}px;top:${size * 0.3}px;background:#2f7bff;opacity:.32}
    img{position:absolute;left:${left}px;top:${top}px;width:${w}px;height:${h}px;${shadow}}
  </style><div class="bg"></div>${glow}<img src="${logoData}" width="${w}" height="${h}">`;
}

/** ICO con varias imágenes PNG adentro (16, 32, 48). */
function buildIco(entries) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(entries.length, 4);
  let offset = 6 + entries.length * 16;
  const dir = [];
  for (const { size, png } of entries) {
    const d = Buffer.alloc(16);
    d.writeUInt8(size >= 256 ? 0 : size, 0);
    d.writeUInt8(size >= 256 ? 0 : size, 1);
    d.writeUInt8(0, 2);
    d.writeUInt8(0, 3);
    d.writeUInt16LE(1, 4);
    d.writeUInt16LE(32, 6);
    d.writeUInt32LE(png.length, 8);
    d.writeUInt32LE(offset, 12);
    offset += png.length;
    dir.push(d);
  }
  return Buffer.concat([header, ...dir, ...entries.map((e) => e.png)]);
}

const SIZES = [16, 32, 48, 112, 180, 192, 512];
const previewIndex = process.argv.indexOf('--preview');
const previewDir = previewIndex >= 0 ? process.argv[previewIndex + 1] : null;

const { chromium } = loadPlaywright();
const browser = await chromium.launch();
try {
  const context = await browser.newContext({ deviceScaleFactor: 1 });
  const page = await context.newPage();
  const render = async (size) => {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(iconHtml(size), { waitUntil: 'load' });
    await page.evaluate(() => Promise.all(Array.from(document.images).map((i) => i.decode())));
    return page.screenshot({ type: 'png', clip: { x: 0, y: 0, width: size, height: size } });
  };

  const pngs = new Map();
  for (const size of SIZES) pngs.set(size, await render(size));

  if (previewDir) {
    fs.mkdirSync(previewDir, { recursive: true });
    for (const [size, png] of pngs) fs.writeFileSync(path.join(previewDir, `icon-${size}.png`), png);
    console.log(`Vista previa en ${previewDir}`);
  } else {
    for (const [size, png] of pngs) fs.writeFileSync(path.join(iconDir, `favicon-${size}.png`), png);
    fs.writeFileSync(path.join(publicDir, 'favicon.ico'), buildIco([16, 32, 48].map((size) => ({ size, png: pngs.get(size) }))));
    console.log('Iconos reescritos en client/public/candyland y client/public/favicon.ico');
  }
} finally {
  await browser.close();
}
