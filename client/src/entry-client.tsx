import { trpc } from "@/lib/trpc";
import { COOKIE_NAME, UNAUTHED_ERR_MSG } from '@shared/const';
import { HydrationBoundary, QueryClient, QueryClientProvider, type DehydratedState } from "@tanstack/react-query";
import { httpBatchLink, TRPCClientError } from "@trpc/client";
import { hydrateRoot } from "react-dom/client";
import superjson from "superjson";
import App, { preloadPublicRouteForPath } from "./App";
import { startLogin } from "./const";
import "./index.css";

declare global {
  interface Window {
    __RQ_STATE__?: string;
  }
}

const analyticsEndpoint = import.meta.env.VITE_ANALYTICS_ENDPOINT;
const analyticsWebsiteId = import.meta.env.VITE_ANALYTICS_WEBSITE_ID;

function loadAnalytics() {
  if (!analyticsEndpoint || !analyticsWebsiteId) return;
  const script = document.createElement("script");
  script.defer = true;
  script.src = `${analyticsEndpoint}/umami`;
  script.dataset.websiteId = analyticsWebsiteId;
  document.body.appendChild(script);
}

function removeLegacyRootServiceWorkers() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.getRegistrations().then((registrations) => {
    for (const reg of registrations) {
      if (reg.scope === `${window.location.origin}/`) reg.unregister();
    }
  }).catch(() => {});
}

async function boot() {
  const queryClient = new QueryClient({
    // Hydrated public data remains fresh briefly so the client does not refetch
    // every query immediately after SSR. Critical mutations keep their current
    // explicit loading/invalidation behavior.
    defaultOptions: { queries: { staleTime: 30_000 } },
  });

  const redirectToLoginIfUnauthorized = (error: unknown) => {
    if (!(error instanceof TRPCClientError)) return;
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
          try {
            const raw = sessionStorage.getItem("manus-cookie");
            if (raw) {
              const prefix = `${COOKIE_NAME}=`;
              const pair = raw.split(";").find(s => s.trim().startsWith(prefix));
              const token = pair?.trim().slice(prefix.length);
              if (token) return { Authorization: `Bearer ${token}` };
            }
          } catch {
            // sessionStorage unavailable; regular cookies still work.
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

  const rawState = window.__RQ_STATE__;
  const dehydratedState = (rawState ? superjson.deserialize(JSON.parse(rawState)) : undefined) as DehydratedState | undefined;
  await preloadPublicRouteForPath(window.location.pathname);
  loadAnalytics();
  removeLegacyRootServiceWorkers();

  hydrateRoot(
    document.getElementById("root")!,
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <HydrationBoundary state={dehydratedState}>
          <App />
        </HydrationBoundary>
      </QueryClientProvider>
    </trpc.Provider>,
  );
}

void boot();
