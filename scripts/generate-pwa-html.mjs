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
  { file: 'admin.html', manifest: '/admin.webmanifest', title: 'Admin' },
  { file: 'caja.html', manifest: '/caja.webmanifest', title: 'Caja' },
  { file: 'puerta.html', manifest: '/puerta.webmanifest', title: 'Puerta' },
  // Ícono propio: con las cuatro apps instaladas en la misma pantalla de
  // inicio, el isotipo genérico las hacía indistinguibles a simple vista.
  { file: 'gastos.html', manifest: '/gastos.webmanifest', title: 'Gastos', appleTouchIcon: '/gastos/icon-180.png' },
  { file: 'fiesta.html', manifest: '/fiesta.webmanifest', title: 'Playmatch' },
];

for (const screen of SCREENS) {
  const tags = [
    `<link rel="manifest" href="${screen.manifest}" />`,
    `<meta name="apple-mobile-web-app-capable" content="yes" />`,
    `<meta name="apple-mobile-web-app-title" content="${screen.title}" />`,
    ...(screen.appleTouchIcon ? [`<link rel="apple-touch-icon" sizes="180x180" href="${screen.appleTouchIcon}" />`] : []),
  ].join('\n    ');

  if (!baseHtml.includes('</head>')) {
    throw new Error(`dist/public/index.html no tiene </head> -- no se puede generar ${screen.file}`);
  }
  // Si la pantalla trae su propio apple-touch-icon, saca el genérico del
  // <head> base: dos <link rel="apple-touch-icon"> del mismo tamaño es
  // ambiguo entre navegadores, así que no alcanza con agregar el nuevo.
  const headHtml = screen.appleTouchIcon
    ? baseHtml.replace(/\s*<link rel="apple-touch-icon"[^>]*\/>/, '')
    : baseHtml;
  const html = headHtml.replace('</head>', `    ${tags}\n  </head>`);
  writeFileSync(join(outDir, screen.file), html);
  console.log(`[generate-pwa-html] ${screen.file} <- manifest=${screen.manifest}`);
}
