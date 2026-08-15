import { renderToString } from 'react-dom/server';
import { QueryClient, QueryClientProvider, dehydrate } from '@tanstack/react-query';
import { Router } from 'wouter';
import { httpBatchLink } from '@trpc/client';
import superjson from 'superjson';
import { trpc } from '@/lib/trpc';
import App, { preloadPublicRouteForPath } from './App';
import { prefetchForPath, type HeadMeta } from './ssr/prefetch';
import type { SsrPrefetch } from './ssr/prefetch';

export type RenderResult = {
  html: string;
  dehydratedState: unknown;
  head: HeadMeta;
};

export async function render(url: string, prefetch: SsrPrefetch): Promise<RenderResult> {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
  });
  const queryIndex = url.indexOf('?');
  const ssrPath = queryIndex === -1 ? url : url.slice(0, queryIndex);
  const ssrSearch = queryIndex === -1 ? '' : url.slice(queryIndex + 1);

  const head = await prefetchForPath(url, queryClient, prefetch);
  await preloadPublicRouteForPath(ssrPath);

  const trpcClient = trpc.createClient({
    links: [httpBatchLink({ url: '/api/trpc', transformer: superjson })],
  });

  const html = renderToString(
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <Router ssrPath={ssrPath} ssrSearch={ssrSearch}>
          <App />
        </Router>
      </QueryClientProvider>
    </trpc.Provider>,
  );

  return { html, dehydratedState: dehydrate(queryClient), head };
}
