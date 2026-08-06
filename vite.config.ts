import { jsxLocPlugin } from "@builder.io/vite-plugin-jsx-loc";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";
import path from "node:path";
import { defineConfig, type Plugin, type ViteDevServer } from "vite";
import { vitePluginManusRuntime } from "vite-plugin-manus-runtime";
import { VitePWA } from "vite-plugin-pwa";

// =============================================================================
// Manus Debug Collector - Vite Plugin
// Writes browser logs directly to files, trimmed when exceeding size limit
// =============================================================================

const PROJECT_ROOT = import.meta.dirname;
const LOG_DIR = path.join(PROJECT_ROOT, ".manus-logs");
const MAX_LOG_SIZE_BYTES = 1 * 1024 * 1024; // 1MB per log file
const TRIM_TARGET_BYTES = Math.floor(MAX_LOG_SIZE_BYTES * 0.6); // Trim to 60% to avoid constant re-trimming

type LogSource = "browserConsole" | "networkRequests" | "sessionReplay";

function ensureLogDir() {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
}

function trimLogFile(logPath: string, maxSize: number) {
  try {
    if (!fs.existsSync(logPath) || fs.statSync(logPath).size <= maxSize) {
      return;
    }

    const lines = fs.readFileSync(logPath, "utf-8").split("\n");
    const keptLines: string[] = [];
    let keptBytes = 0;

    // Keep newest lines (from end) that fit within 60% of maxSize
    const targetSize = TRIM_TARGET_BYTES;
    for (let i = lines.length - 1; i >= 0; i--) {
      const lineBytes = Buffer.byteLength(`${lines[i]}\n`, "utf-8");
      if (keptBytes + lineBytes > targetSize) break;
      keptLines.unshift(lines[i]);
      keptBytes += lineBytes;
    }

    fs.writeFileSync(logPath, keptLines.join("\n"), "utf-8");
  } catch {
    /* ignore trim errors */
  }
}

function writeToLogFile(source: LogSource, entries: unknown[]) {
  if (entries.length === 0) return;

  ensureLogDir();
  const logPath = path.join(LOG_DIR, `${source}.log`);

  // Format entries with timestamps
  const lines = entries.map((entry) => {
    const ts = new Date().toISOString();
    return `[${ts}] ${JSON.stringify(entry)}`;
  });

  // Append to log file
  fs.appendFileSync(logPath, `${lines.join("\n")}\n`, "utf-8");

  // Trim if exceeds max size
  trimLogFile(logPath, MAX_LOG_SIZE_BYTES);
}

/**
 * Vite plugin to collect browser debug logs
 * - POST /__manus__/logs: Browser sends logs, written directly to files
 * - Files: browserConsole.log, networkRequests.log, sessionReplay.log
 * - Auto-trimmed when exceeding 1MB (keeps newest entries)
 */
function vitePluginManusDebugCollector(): Plugin {
  return {
    name: "manus-debug-collector",

    transformIndexHtml(html) {
      if (process.env.NODE_ENV === "production") {
        return html;
      }
      return {
        html,
        tags: [
          {
            tag: "script",
            attrs: {
              src: "/__manus__/debug-collector.js",
              defer: true,
            },
            injectTo: "head",
          },
        ],
      };
    },

    configureServer(server: ViteDevServer) {
      // POST /__manus__/logs: Browser sends logs (written directly to files)
      server.middlewares.use("/__manus__/logs", (req, res, next) => {
        if (req.method !== "POST") {
          return next();
        }

        const handlePayload = (payload: any) => {
          // Write logs directly to files
          if (payload.consoleLogs?.length > 0) {
            writeToLogFile("browserConsole", payload.consoleLogs);
          }
          if (payload.networkRequests?.length > 0) {
            writeToLogFile("networkRequests", payload.networkRequests);
          }
          if (payload.sessionEvents?.length > 0) {
            writeToLogFile("sessionReplay", payload.sessionEvents);
          }

          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: true }));
        };

        const reqBody = (req as { body?: unknown }).body;
        if (reqBody && typeof reqBody === "object") {
          try {
            handlePayload(reqBody);
          } catch (e) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ success: false, error: String(e) }));
          }
          return;
        }

        let body = "";
        req.on("data", (chunk) => {
          body += chunk.toString();
        });

        req.on("end", () => {
          try {
            const payload = JSON.parse(body);
            handlePayload(payload);
          } catch (e) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ success: false, error: String(e) }));
          }
        });
      });
    },
  };
}

export default defineConfig(({ command }) => {
  // El runtime de debug de Manus (session replay, colector de logs) se
  // inyecta como un <script> inline enorme (~370KB sin comprimir) al
  // <body> de CADA página -- útil mientras se desarrolla en el sandbox de
  // Manus, pero no tiene ningún motivo para viajar a producción: es la
  // causa real de la carga lenta en móvil (bloquea el parseo del HTML
  // antes de poder pintar nada), no el video/imágenes del hero. Solo se
  // agrega en modo dev (`vite` / `vite dev`), nunca en `vite build`.
  const isDev = command === "serve";
  const plugins = [
    react(),
    tailwindcss(),
    jsxLocPlugin(),
    ...(isDev ? [vitePluginManusRuntime(), vitePluginManusDebugCollector()] : []),
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
      manifest: {
        name: "Mansion Playroom · Caja",
        short_name: "Caja",
        start_url: "/caja",
        scope: "/caja/",
        display: "standalone",
        background_color: "#0a0a0a",
        theme_color: "#0a0a0a",
        icons: [
          { src: "/candyland/logo-isotipo.webp", sizes: "512x512", type: "image/webp" },
        ],
      },
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
        "@assets": path.resolve(import.meta.dirname, "attached_assets"),
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
          // paquete, para agarrar los subpaquetes también. `react-hook-form`,
          // `react-day-picker` y `react-resizable-panels` quedan afuera a
          // propósito: si entraran, inflarían este chunk con código que no
          // toda página necesita.
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
      allowedHosts: [
        ".manuspre.computer",
        ".manus.computer",
        ".manus-asia.computer",
        ".manuscomputer.ai",
        ".manusvm.computer",
        "localhost",
        "127.0.0.1",
      ],
      fs: {
        strict: true,
        deny: ["**/.*"],
      },
    },
  };
});
