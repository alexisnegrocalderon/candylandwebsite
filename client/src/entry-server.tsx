import ReactDOMServer from 'react-dom/server';
import { Router } from 'wouter';
import type { BaseLocationHook } from 'wouter';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ThemeProvider } from '@/contexts/ThemeContext';
import Navbar from '@/components/Navbar';
import About from '@/pages/About';
import Panoramas from '@/pages/Panoramas';
import Blog from '@/pages/Blog';
import QueSonLasFiestasLiberales from '@/pages/QueSonLasFiestasLiberales';
import RefundPolicy from '@/pages/RefundPolicy';
import PrivacyPolicy from '@/pages/PrivacyPolicy';

/* Entry de renderizado para el pre-renderizado en build (ver
 * scripts/generate-static-pages.mjs) -- hermano de main.tsx pero para
 * `renderToString` en vez de `createRoot`. A propósito NO reusa `<App>`
 * completo: ese árbol también monta Toaster/CustomCursor/SmoothScroll y la
 * lógica de `isFinePointer()`, todo irrelevante para lo que ve un crawler
 * (solo importa el contenido real, no el chrome interactivo). Acá va
 * Navbar + la página, nada más.
 *
 * Sin trpc.Provider/QueryClientProvider a propósito: ninguna de las páginas
 * de este mapa hace una sola llamada trpc (confirmado leyendo cada una) --
 * agregar esa infraestructura sin necesidad sería puro riesgo. Si el día de
 * mañana se pre-renderiza una página con datos, ahí sí hace falta pre-cargar
 * un QueryClient con `setQueryData` a partir de una llamada directa a
 * server/db (nunca un round-trip HTTP dentro del build).
 *
 * El mapa de rutas de acá abajo tiene que reflejar exactamente las que
 * arma `ROUTE_LIST` en scripts/generate-static-pages.mjs -- ese script las
 * itera todas, así que una ruta que falte acá revienta el build (mejor eso
 * que un pre-render silenciosamente vacío). */
const PAGES: Record<string, React.ComponentType> = {
  '/nosotros': About,
  '/panoramas': Panoramas,
  '/panoramas/vina-del-mar': Panoramas,
  '/panoramas/valparaiso': Panoramas,
  '/blog': Blog,
  '/blog/que-son-las-fiestas-liberales': QueSonLasFiestasLiberales,
  '/blog/primera-vez-que-esperar': Blog,
  '/blog/dress-code-explicado': Blog,
  '/blog/que-llevar': Blog,
  '/blog/como-llegar-y-estacionar': Blog,
  '/politica-de-reembolso': RefundPolicy,
  '/politica-de-privacidad': PrivacyPolicy,
};

export function renderPage(routePath: string): string {
  const Page = PAGES[routePath];
  if (!Page) {
    throw new Error(`[entry-server] Sin componente registrado para "${routePath}" -- agrégalo a PAGES.`);
  }

  // Hook de ubicación fijo y sin estado -- a propósito NO se usa
  // `wouter/memory-location` acá: su hook usa `useSyncExternalStore`, que
  // `react-dom/server`'s `renderToString` exige con un tercer argumento
  // (`getServerSnapshot`) que esa librería no provee, y revienta el render
  // ("Missing getServerSnapshot"). Como en un render de una sola pasada la
  // ruta nunca cambia, alcanza con un hook que devuelve siempre el mismo
  // path -- sin store externo, sin el problema.
  const useStaticLocation: BaseLocationHook = () => [routePath, () => {}];

  const tree = (
    <ThemeProvider defaultTheme="dark">
      <TooltipProvider>
        <Router hook={useStaticLocation}>
          <Navbar />
          <Page />
        </Router>
      </TooltipProvider>
    </ThemeProvider>
  );

  return ReactDOMServer.renderToString(tree);
}
