import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig(() => {
  const plugins = [
    react(),
    tailwindcss(),
    // PWA solo para /caja (docs/ARQUITECTURA-CAJA.md §6.1) -- el resto del
    // sitio (checkout con Mercado Pago, admin) NO debe quedar bajo un
    // service worker. `injectRegister: null` evita que el plugin inyecte un
    // registro automático en <head> (que registraría con scope '/', o sea
    // todo el sitio); el registro real ocurre a mano, dentro de
    // client/src/pages/caja/index.tsx.
    //
    // El `scope` de nivel superior acá abajo (NO el de `manifest`, que es
    // solo metadata decorativa del ícono/nombre) es lo que de verdad limita
    // el alcance del service worker a /caja/ -- sin esto, vite-plugin-pwa
    // cae al `base` de Vite ('/') y el SW termina controlando TODO el sitio,
    // incluida cualquier otra pantalla instalable como /gastos (bug real que
    // hacía que "agregar a inicio" desde /gastos instalara /caja en su
    // lugar, porque Android asociaba el acceso directo a la app que ya tenía
    // el origen tomado). El archivo sigue sirviéndose desde la raíz
    // (dist/public/sw.js) -- un script ahí puede registrarse con un alcance
    // más angosto como /caja/ sin necesitar la cabecera
    // Service-Worker-Allowed, porque /caja/ es un subcamino de /.
    VitePWA({
      injectRegister: null,
      // "autoUpdate" (no "prompt"): con "prompt", cuando hay una versión
      // nueva del service worker, Workbox la descarga y la deja ESPERANDO --
      // nunca toma el control sola, necesita que la app llame a
      // updateServiceWorker() en respuesta a un aviso que acá nunca se
      // muestra (no hay UI para eso). Un teléfono puede quedar atascado en la
      // versión vieja indefinidamente, con cualquier bug que ya se haya
      // corregido en el código, sin ninguna forma de salir solo. "autoUpdate"
      // activa la versión nueva y recarga la página apenas está lista.
      registerType: "autoUpdate",
      scope: "/caja/",
      // `manifest: false` A PROPÓSITO -- antes este plugin generaba
      // manifest.webmanifest de Caja E INYECTABA su <link rel="manifest">
      // en el ÚNICO index.html que comparte TODA la SPA, en tiempo de
      // build. Admin/Puerta/Gastos corregían ese link a mano ya en el
      // navegador (useInstallableApp.ts), pero esa corrección corre en un
      // useEffect -- DESPUÉS del primer render -- y "Agregar a Inicio" de
      // iOS podía leer el <head> antes de esa corrección, instalando Caja
      // sin importar desde qué pantalla se compartiera (bug real). Ahora
      // Caja tiene su propio archivo estático `client/public/caja.webmanifest`
      // (mismo criterio que admin/puerta/gastos) y cada pantalla instalable
      // recibe un HTML propio ya con su manifest correcto de fábrica -- ver
      // `scripts/generate-pwa-html.mjs` y `vercel.json`. La generación del
      // service worker de acá abajo (workbox) es un mecanismo aparte, no se
      // toca.
      manifest: false,
      workbox: {
        // Solo el shell de la app (JS/CSS/HTML) -- los datos (snapshot del
        // evento) viven en IndexedDB vía Dexie, no en la cache de Workbox.
        globPatterns: ["**/*.{js,css,html}"],
        // Los service workers de las otras pantallas instalables NO se
        // precachean acá: un SW servido desde la caché de otro SW puede
        // quedar pegado en una versión vieja, y ninguna de esas pantallas
        // (gastos, puerta, admin) quiere caché de Workbox -- necesitan datos
        // siempre frescos del servidor.
        globIgnores: ["**/gastos/sw.js", "**/puerta/sw.js", "**/admin/sw.js"],
        navigateFallback: "/caja",
        navigateFallbackDenylist: [/^\/api\//, /^\/(?!caja)/],
      },
    }),
  ];

  return {
    plugins,
    resolve: {
      alias: {
        "@": path.resolve(import.meta.dirname, "client", "src"),
        "@shared": path.resolve(import.meta.dirname, "shared"),
      },
    },
    envDir: path.resolve(import.meta.dirname),
    root: path.resolve(import.meta.dirname, "client"),
    publicDir: path.resolve(import.meta.dirname, "client", "public"),
    build: {
      outDir: path.resolve(import.meta.dirname, "dist/public"),
      emptyOutDir: true,
      rollupOptions: {
        output: {
          // Separa las dependencias grandes y poco cambiantes (React,
          // Framer Motion, Radix) en su propio chunk -- el navegador las
          // cachea aparte del código propio del sitio, así que un deploy
          // nuevo no obliga a re-descargar todo de nuevo.
          //
          // ⚠️ Con la sintaxis de objeto (`{ "vendor-react": ["react", ...] }`)
          // Rollup solo agarra el paquete exacto por nombre -- pero React se
          // reparte en subpaquetes propios (`react/jsx-runtime`, `scheduler`)
          // que NO calzan con ese nombre exacto, así que quedaban afuera del
          // chunk "vendor-react" (que terminaba con 17KB, casi vacío) y el
          // peso real de React se colaba en el chunk de entrada (403KB,
          // el que carga TODA página antes de poder pintar algo). Por eso
          // acá se matchea por ruta dentro de node_modules, no por nombre de
          // paquete, para agarrar los subpaquetes también. `react-hook-form`
          // queda afuera a propósito: si entrara, inflaría este chunk con
          // código que no toda página necesita.
          manualChunks(id: string) {
            if (!id.includes('node_modules')) return undefined;
            if (/node_modules\/(react|react-dom|scheduler|wouter)\//.test(id)) return 'vendor-react';
            if (id.includes('node_modules/framer-motion')) return 'vendor-motion';
            if (id.includes('node_modules/@radix-ui')) return 'vendor-radix';
            return undefined;
          },
        },
      },
    },
    server: {
      host: true,
      allowedHosts: ["localhost", "127.0.0.1"],
      fs: {
        strict: true,
        deny: ["**/.*"],
      },
    },
  };
});
