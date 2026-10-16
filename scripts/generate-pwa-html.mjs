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

const outDir = join(import.meta.dirname, '..', 'dist', 'public');
const baseHtml = readFileSync(join(outDir, 'index.html'), 'utf-8');

const SCREENS = [
  // «Playroom» y no «Admin»: es el nombre que iOS muestra bajo el ícono y
  // arriba de cada notificación. Íconos servidos por /api/app-icon (URL
  // nueva + registro de diagnóstico, ver server/appIcon.ts), uno por tamaño.
  { file: 'admin.html', manifest: '/admin.webmanifest', title: 'Playroom', appleTouchIcons: [120, 152, 167, 180].map((s) => ({ size: s, href: `/api/app-icon/admin/${s}.png` })) },
  { file: 'caja.html', manifest: '/caja.webmanifest', title: 'Caja', appleTouchIcon: '/app-icons/caja/icon-180.png' },
  { file: 'puerta.html', manifest: '/puerta.webmanifest', title: 'Puerta', appleTouchIcon: '/app-icons/puerta/icon-180.png' },
  // Ícono propio: con las cuatro apps instaladas en la misma pantalla de
  // inicio, el isotipo genérico las hacía indistinguibles a simple vista.
  { file: 'gastos.html', manifest: '/gastos.webmanifest', title: 'Gastos', appleTouchIcon: '/gastos/icon-180.png' },
  { file: 'fiesta.html', manifest: '/fiesta.webmanifest', title: 'Playmatch', appleTouchIcon: '/app-icons/fiesta/icon-180.png' },
];

for (const screen of SCREENS) {
  const tags = [
    `<link rel="manifest" href="${screen.manifest}" />`,
    `<meta name="apple-mobile-web-app-capable" content="yes" />`,
    `<meta name="apple-mobile-web-app-title" content="${screen.title}" />`,
    ...(screen.appleTouchIcon ? [`<link rel="apple-touch-icon" sizes="180x180" href="${screen.appleTouchIcon}" />`] : []),
    ...(screen.appleTouchIcons ?? []).map((i) => `<link rel="apple-touch-icon" sizes="${i.size}x${i.size}" href="${i.href}" />`),
  ].join('\n    ');

  if (!baseHtml.includes('</head>')) {
    throw new Error(`dist/public/index.html no tiene </head> -- no se puede generar ${screen.file}`);
  }
  // Si la pantalla trae su propio apple-touch-icon, saca el genérico del
  // <head> base: dos <link rel="apple-touch-icon"> del mismo tamaño es
  // ambiguo entre navegadores, así que no alcanza con agregar el nuevo.
  const headHtml = screen.appleTouchIcon || screen.appleTouchIcons
    ? baseHtml.replace(/\s*<link rel="apple-touch-icon"[^>]*\/>/, '')
    : baseHtml;
  // Los tags van al PRINCIPIO del <head>, justo después del viewport, no al
  // final: "Agregar a Inicio" de iOS lee el ícono mientras parsea el
  // documento, y al final quedaban detrás de los scripts y hojas de estilo
  // del bundle -- el iPhone del dueño terminaba mostrando la letra "A" del
  // título en vez del logo.
  const viewport = headHtml.match(/<meta name="viewport"[^>]*\/?>/);
  if (!viewport) {
    throw new Error(`dist/public/index.html no tiene <meta name="viewport"> -- no se puede generar ${screen.file}`);
  }
  const html = headHtml.replace(viewport[0], `${viewport[0]}\n    ${tags}`);
  writeFileSync(join(outDir, screen.file), html);
  console.log(`[generate-pwa-html] ${screen.file} <- manifest=${screen.manifest}`);
}
