import { trpc } from "@/lib/trpc";
import { COOKIE_NAME, UNAUTHED_ERR_MSG } from '@shared/const';
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink, TRPCClientError } from "@trpc/client";
import { createRoot } from "react-dom/client";
import superjson from "superjson";
import App from "./App";
import { startLogin } from "./const";
import "./index.css";

// Analítica (Umami) opcional: se inyecta solo si el deploy tiene las env vars
// configuradas. Antes era un <script src="%VITE_ANALYTICS_ENDPOINT%/umami">
// literal en index.html -- si la env var no estaba seteada, Vite dejaba el
// placeholder sin reemplazar y el navegador pedía esa URL inválida en cada
// visita (400 en la consola, en todas las páginas).
const analyticsEndpoint = import.meta.env.VITE_ANALYTICS_ENDPOINT;
const analyticsWebsiteId = import.meta.env.VITE_ANALYTICS_WEBSITE_ID;
if (analyticsEndpoint && analyticsWebsiteId) {
  const script = document.createElement("script");
  script.defer = true;
  script.src = `${analyticsEndpoint}/umami`;
  script.dataset.websiteId = analyticsWebsiteId;
  document.body.appendChild(script);
}

// Adelanta la descarga del chunk de Home apenas arranca el script, en
// paralelo con el resto del entry -- si no, el navegador recién descubre que
// lo necesita DESPUÉS de parsear/ejecutar el entry y que React.lazy() lo
// pida (App.tsx), perdiendo una vuelta de red completa antes de poder
// mostrar el intro. Sigue siendo un chunk aparte -- no se vuelve a meter en
// el entry, así que no repite el problema ya resuelto de "Home eager hacía
// el bundle de entrada pesado" (ver el comentario en App.tsx). Solo se
// adelanta CUÁNDO se pide, no qué tan grande es. Acotado a "/" porque es la
// ruta a la que llega la enorme mayoría del tráfico (Instagram/WhatsApp);
// quien entra directo a otra ruta (ticket, checkout) no paga estos bytes de más.
if (window.location.pathname === '/') {
  import('./pages/Home');
}

// Autolimpieza de un bug ya corregido: el service worker de /caja se
// registraba sin un `scope` explícito y terminaba controlando TODO el sitio
// (scope '/') en vez de solo /caja/ -- ver vite.config.ts. Quien ya visitó
// /caja antes de este fix tiene ese registro viejo en el teléfono, y
// reemplazar el archivo no lo desinstala solo: sigue ahí hasta que algo lo
// saque. Cualquier registro con scope EXACTAMENTE el origen raíz es
// inequívocamente ese registro viejo (los legítimos son /caja/ o /gastos/),
// así que se desregistra apenas arranca el sitio, antes de que /caja llegue
// a registrar el suyo (bien acotado) más adelante -- sin condición de carrera.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then((registrations) => {
    for (const reg of registrations) {
      if (reg.scope === `${window.location.origin}/`) reg.unregister();
    }
  }).catch(() => {});
}

const queryClient = new QueryClient();

const redirectToLoginIfUnauthorized = (error: unknown) => {
  if (!(error instanceof TRPCClientError)) return;
  if (typeof window === "undefined") return;

  const isUnauthorized = error.message === UNAUTHED_ERR_MSG;

  if (!isUnauthorized) return;

  startLogin();
};

queryClient.getQueryCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.query.state.error;
    redirectToLoginIfUnauthorized(error);
    console.error("[API Query Error]", error);
  }
});

queryClient.getMutationCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.mutation.state.error;
    redirectToLoginIfUnauthorized(error);
    console.error("[API Mutation Error]", error);
  }
});

const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: "/api/trpc",
      transformer: superjson,
      headers() {
        // Preview auto-login fallback: when the browser blocks iframe cookies
        // (Safari ITP / private browsing / WebView), the runtime mirrors the
        // session into sessionStorage so we can forward it as a Bearer token.
        // The regular OAuth cookie flow keeps working and takes priority server-side.
        try {
          const raw = sessionStorage.getItem("manus-cookie");
          if (raw) {
            const prefix = `${COOKIE_NAME}=`;
            const pair = raw.split(";").find(s => s.trim().startsWith(prefix));
            const token = pair?.trim().slice(prefix.length);
            if (token) {
              return { Authorization: `Bearer ${token}` };
            }
          }
        } catch {
          // sessionStorage unavailable
        }
        return {};
      },
      fetch(input, init) {
        return globalThis.fetch(input, {
          ...(init ?? {}),
          credentials: "include",
        });
      },
    }),
  ],
});

createRoot(document.getElementById("root")!).render(
  <trpc.Provider client={trpcClient} queryClient={queryClient}>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </trpc.Provider>
);
