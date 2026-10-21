#!/usr/bin/env node
/**
 * Genera un HTML estático por cada pantalla instalable (admin/caja/puerta/
 * gastos), cada uno con SU manifest correcto ya puesto en el `<head>` desde
 * el primer byte.
 *
 * POR QUÉ EXISTE: el sitio es una SPA con un único `index.html` para todas
 * las rutas. Antes, `vite-plugin-pwa` inyectaba ahí el `<link rel="manifest">`
 * de Caja en tiempo de build, y las otras pantallas instalables lo corregían
 * a mano YA EN EL NAVEGADOR (`useInstallableApp.ts`), dentro de un
 * `useEffect` -- es decir, después del primer render. "Agregar a Inicio" de
 * iOS podía leer el `<head>` antes de esa corrección, así que sin importar
 * qué pantalla se compartiera, terminaba instalando Caja (bug real que le
 * pasó al dueño). Generando un HTML por pantalla ACÁ, en el build, no queda
 * nada que corregir en el navegador -- no hay carrera posible.
 *
 * Corre después de `vite build` (ver "build" en package.json). `vercel.json`
 * reescribe cada ruta instalable a SU archivo (`/admin` → `/admin.html`,
 * etc.) en vez de al `index.html` genérico.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { SPLASH_BG, SPLASH_GLOW, SPLASH_LOGO_CSS, splashVariants } from './splash-devices.mjs';

const outDir = join(import.meta.dirname, '..', 'dist', 'public');
const baseHtml = readFileSync(join(outDir, 'index.html'), 'utf-8');

// `splash: 'dark'`: apertura estilo app nativa (panel y terminales). El loader
// rosa claro del sitio se cambia por una pantalla oscura con el isotipo que se
// queda hasta que la pantalla está lista (client/src/lib/splash.ts), con las
// imágenes de arranque de iOS para que tampoco haya destello blanco antes.
const DARK = { themeColor: SPLASH_BG, statusBar: 'black-translucent', splash: 'dark' };

const SCREENS = [
  { file: 'admin.html', manifest: '/admin.webmanifest', title: 'Admin', appleTouchIcon: '/app-icons/admin/apple-touch-icon-v4.png', ...DARK },
  { file: 'caja.html', manifest: '/caja.webmanifest', title: 'Caja', appleTouchIcon: '/app-icons/caja/icon-180.png', ...DARK },
  { file: 'puerta.html', manifest: '/puerta.webmanifest', title: 'Puerta', appleTouchIcon: '/app-icons/puerta/icon-180.png', ...DARK },
  // Cocina y guardarropía no tienen manifest propio (se agregan a inicio igual
  // que el sitio); su HTML existe solo para abrir con el mismo arranque oscuro.
  { file: 'cocina.html', title: 'Cocina', ...DARK },
  { file: 'guardarropia.html', title: 'Guardarropía', ...DARK },
  // Ícono propio: con las cuatro apps instaladas en la misma pantalla de
  // inicio, el isotipo genérico las hacía indistinguibles a simple vista.
  // Vidrio oscuro como el panel: barra de estado oscura desde el primer
  // cuadro (antes salía rosada/clara hasta que cargaba el JS).
  { file: 'gastos.html', manifest: '/gastos.webmanifest', title: 'Gastos', appleTouchIcon: '/gastos/icon-180.png', ...DARK },
  { file: 'fiesta.html', manifest: '/fiesta.webmanifest', title: 'Playmatch', appleTouchIcon: '/app-icons/fiesta/icon-180.png' },
];

// Logo del splash embebido: pinta en el primer cuadro, sin esperar la red.
const splashLogo = `data:image/webp;base64,${readFileSync(join(import.meta.dirname, '..', 'client', 'public', 'app-icons', 'splash', 'logo-192.webp')).toString('base64')}`;

const DARK_SPLASH_STYLE = `<style>
      html, body { background: ${SPLASH_BG}; }
      #initial-loader {
        position: fixed; inset: 0; z-index: 9999;
        display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 28px;
        background: radial-gradient(ellipse 70% 50% at 50% 42%, ${SPLASH_GLOW}, ${SPLASH_BG} 70%) ${SPLASH_BG};
        transition: opacity 0.26s ease;
      }
      #initial-loader.splash-out { opacity: 0; pointer-events: none; }
      #initial-loader img { width: ${SPLASH_LOGO_CSS}px; height: auto; opacity: 0; transform: scale(0.96); animation: splash-in 0.45s ease-out 0.05s forwards; }
      #initial-loader .splash-bar { width: 112px; height: 2px; border-radius: 2px; overflow: hidden; background: rgba(255, 255, 255, 0.1); opacity: 0; animation: splash-fade 0.3s ease-out 1.5s forwards; }
      #initial-loader .splash-bar::after { content: ''; display: block; width: 40%; height: 100%; border-radius: 2px; background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.7), transparent); animation: splash-run 1.1s ease-in-out infinite; }
      @keyframes splash-in { to { opacity: 1; transform: none; } }
      @keyframes splash-fade { to { opacity: 1; } }
      @keyframes splash-run { from { transform: translateX(-100%); } to { transform: translateX(250%); } }
      @media (prefers-reduced-motion: reduce) {
        #initial-loader img { animation: none; opacity: 1; transform: none; }
        #initial-loader .splash-bar { animation: none; opacity: 0.6; }
        #initial-loader .splash-bar::after { animation: none; }
      }
    </style>`;

const DARK_SPLASH_MARKUP = `<div id="initial-loader" role="progressbar" aria-label="Cargando"><img src="${splashLogo}" alt="" width="${SPLASH_LOGO_CSS}" height="${Math.round(SPLASH_LOGO_CSS * 265 / 192)}" /><div class="splash-bar"></div></div>`;

const STARTUP_IMAGE_TAGS = splashVariants().map((v) => `<link rel="apple-touch-startup-image" media="${v.media}" href="${v.file}" />`);

/** El `<style>` y el `<div>` del loader del sitio, reemplazados por el splash oscuro. */
function applyDarkSplash(html) {
  const style = html.match(/<style>\s*#initial-loader[\s\S]*?<\/style>/);
  const markup = html.match(/<div id="initial-loader">[\s\S]*?<\/div>/);
  if (!style || !markup) throw new Error('No encontré el loader inicial en dist/public/index.html -- revisa client/index.html');
  return html
    .replace(style[0], DARK_SPLASH_STYLE)
    .replace(markup[0], DARK_SPLASH_MARKUP)
    .replace(/<html([^>]*)>/, '<html$1 data-splash="dark">');
}

for (const screen of SCREENS) {
  const tags = [
    ...(screen.manifest ? [`<link rel="manifest" href="${screen.manifest}" />`] : []),
    `<meta name="apple-mobile-web-app-capable" content="yes" />`,
    `<meta name="apple-mobile-web-app-title" content="${screen.title}" />`,
    ...(screen.statusBar ? [`<meta name="apple-mobile-web-app-status-bar-style" content="${screen.statusBar}" />`] : []),
    ...(screen.appleTouchIcon ? [`<link rel="apple-touch-icon" sizes="180x180" href="${screen.appleTouchIcon}" />`] : []),
    ...(screen.splash === 'dark' ? STARTUP_IMAGE_TAGS : []),
  ].join('\n    ');

  if (!baseHtml.includes('</head>')) {
    throw new Error(`dist/public/index.html no tiene </head> -- no se puede generar ${screen.file}`);
  }
  // Si la pantalla trae su propio apple-touch-icon, saca el genérico del
  // <head> base: dos <link rel="apple-touch-icon"> del mismo tamaño es
  // ambiguo entre navegadores, así que no alcanza con agregar el nuevo.
  let headHtml = screen.appleTouchIcon
    ? baseHtml.replace(/\s*<link rel="apple-touch-icon"[^>]*\/>/, '')
    : baseHtml;
  if (screen.themeColor) {
    headHtml = headHtml.replace(/<meta name="theme-color" content="[^"]*"\s*\/?>/, `<meta name="theme-color" content="${screen.themeColor}" />`);
  }
  // Los tags van al PRINCIPIO del <head>, justo después del viewport, no al
  // final: "Agregar a Inicio" de iOS lee el ícono mientras parsea el
  // documento, y al final quedaban detrás de los scripts y hojas de estilo
  // del bundle -- el iPhone del dueño terminaba mostrando la letra "A" del
  // título en vez del logo.
  const viewport = headHtml.match(/<meta name="viewport"[^>]*\/?>/);
  if (!viewport) {
    throw new Error(`dist/public/index.html no tiene <meta name="viewport"> -- no se puede generar ${screen.file}`);
  }
  let html = headHtml.replace(viewport[0], `${viewport[0]}\n    ${tags}`);
  if (screen.splash === 'dark') html = applyDarkSplash(html);
  writeFileSync(join(outDir, screen.file), html);
  console.log(`[generate-pwa-html] ${screen.file} <- manifest=${screen.manifest ?? '(sin manifest)'}${screen.splash ? ` · splash ${screen.splash}` : ''}`);
}
