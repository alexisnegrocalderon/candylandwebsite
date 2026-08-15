import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch, useLocation } from "wouter";
import { motion } from "framer-motion";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Navbar from "./components/Navbar";
import { isFinePointer } from "./lib/smoothScroll";
import { lazy, Suspense, useEffect, type ComponentProps, type ComponentType } from "react";

/**
 * Public routes stay code-split in the browser, but expose a synchronous
 * component after their module has been preloaded by the SSR/client boot.
 * Without this small adapter React.lazy would emit the Suspense spinner in
 * renderToString, so crawlers would receive no page content.
 */
function ssrAwareRoute<T extends ComponentType<any>>(loader: () => Promise<{ default: T }>) {
  let Loaded: T | undefined;
  let loading: Promise<{ default: T }> | undefined;
  const load = () => {
    if (!loading) {
      loading = loader().then((module) => {
        Loaded = module.default;
        return module;
      });
    }
    return loading;
  };
  const Lazy = lazy(load);
  const Component = (props: ComponentProps<T>) => Loaded ? <Loaded {...props} /> : <Lazy {...props} />;
  return { Component, preload: async () => { await load(); } };
}

const HomeRoute = ssrAwareRoute(() => import("./pages/Home"));
const EventsRoute = ssrAwareRoute(() => import("./pages/Events"));
const EventDetailRoute = ssrAwareRoute(() => import("./pages/EventDetail"));
const AboutRoute = ssrAwareRoute(() => import("./pages/About"));
const PanoramasRoute = ssrAwareRoute(() => import("./pages/Panoramas"));
const BlogRoute = ssrAwareRoute(() => import("./pages/Blog"));
const EmbajadoresRoute = ssrAwareRoute(() => import("./pages/Embajadores"));
const PricesRoute = ssrAwareRoute(() => import("./pages/Prices"));
const RefundPolicyRoute = ssrAwareRoute(() => import("./pages/RefundPolicy"));
const PrivacyPolicyRoute = ssrAwareRoute(() => import("./pages/PrivacyPolicy"));

// Private, transactional and operational pages remain lazy and client-only.
const Checkout = lazy(() => import("./pages/Checkout"));
const PaymentSuccess = lazy(() => import("./pages/PaymentSuccess"));
const PaymentFailure = lazy(() => import("./pages/PaymentFailure"));
const AdminDashboard = lazy(() => import("./pages/admin/Dashboard"));
const PrintOrders = lazy(() => import("./pages/admin/print/PrintOrders"));
const PrintCustomers = lazy(() => import("./pages/admin/print/PrintCustomers"));
const PrintShifts = lazy(() => import("./pages/admin/print/PrintShifts"));
const CajaApp = lazy(() => import("./pages/caja"));
const GastosApp = lazy(() => import("./pages/gastos"));
const MyReferrals = lazy(() => import("./pages/MyReferrals"));
const MisPuntos = lazy(() => import("./pages/MisPuntos"));
const Ticket = lazy(() => import("./pages/Ticket"));
const Party = lazy(() => import("./pages/Party"));
const Playmatch = lazy(() => import("./pages/Playmatch"));
const Ambassador = lazy(() => import("./pages/Ambassador"));
const Puerta = lazy(() => import("./pages/Puerta"));
const Cocina = lazy(() => import("./pages/Cocina"));
const Guardarropia = lazy(() => import("./pages/Guardarropia"));

export async function preloadPublicRouteForPath(pathname: string): Promise<void> {
  const clean = pathname.replace(/\/+$/, "") || "/";
  if (clean === "/") return HomeRoute.preload();
  if (clean === "/eventos") return EventsRoute.preload();
  if (clean.startsWith("/eventos/")) return EventDetailRoute.preload();
  if (clean === "/nosotros") return AboutRoute.preload();
  if (clean === "/panoramas" || clean.startsWith("/panoramas/")) return PanoramasRoute.preload();
  if (clean === "/blog" || clean.startsWith("/blog/")) return BlogRoute.preload();
  if (clean === "/embajadores") return EmbajadoresRoute.preload();
  if (clean === "/entradas") return PricesRoute.preload();
  if (clean === "/politica-de-reembolso") return RefundPolicyRoute.preload();
  if (clean === "/politica-de-privacidad") return PrivacyPolicyRoute.preload();
}

function PageLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" aria-hidden="true" />
      <span className="sr-only">Cargando Mansion Playroom…</span>
    </div>
  );
}

function Router() {
  const [location] = useLocation();
  return (
    <Suspense fallback={<PageLoader />}>
      <motion.div
        key={location}
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, ease: [0.23, 1, 0.32, 1] }}
      >
        <Switch>
          <Route path="/" component={HomeRoute.Component} />
          <Route path="/eventos" component={EventsRoute.Component} />
          <Route path="/eventos/:slug" component={EventDetailRoute.Component} />
          <Route path="/checkout/:eventSlug" component={Checkout} />
          <Route path="/pago/exito" component={PaymentSuccess} />
          <Route path="/pago/error" component={PaymentFailure} />
          <Route path="/nosotros" component={AboutRoute.Component} />
          <Route path="/mis-referidos" component={MyReferrals} />
          <Route path="/mis-puntos" component={MisPuntos} />
          <Route path="/verificar/:ticketCode" component={Ticket} />
          <Route path="/fiesta/:ticketCode" component={Party} />
          <Route path="/playmatch" component={Playmatch} />
          <Route path="/panoramas" component={PanoramasRoute.Component} />
          <Route path="/panoramas/:slug" component={PanoramasRoute.Component} />
          <Route path="/blog" component={BlogRoute.Component} />
          <Route path="/blog/:slug" component={BlogRoute.Component} />
          <Route path="/embajadores" component={EmbajadoresRoute.Component} />
          <Route path="/embajador" component={Ambassador} />
          <Route path="/embajador/:code" component={Ambassador} />
          <Route path="/puerta" component={Puerta} />
          <Route path="/cocina" component={Cocina} />
          <Route path="/guardarropia" component={Guardarropia} />
          <Route path="/entradas" component={PricesRoute.Component} />
          <Route path="/politica-de-reembolso" component={RefundPolicyRoute.Component} />
          <Route path="/politica-de-privacidad" component={PrivacyPolicyRoute.Component} />
          <Route path="/admin" component={AdminDashboard} />
          <Route path="/admin/print/orders" component={PrintOrders} />
          <Route path="/admin/print/customers" component={PrintCustomers} />
          <Route path="/admin/print/shifts" component={PrintShifts} />
          <Route path="/caja" component={CajaApp} />
          <Route path="/gastos" component={GastosApp} />
          <Route path="/404" component={NotFound} />
          <Route component={NotFound} />
        </Switch>
      </motion.div>
    </Suspense>
  );
}

function App() {
  const [location] = useLocation();
  const isCaja = location.startsWith('/caja');
  const isAdmin = location.startsWith('/admin');
  const isParty = location.startsWith('/fiesta');
  const isPuerta = location.startsWith('/puerta');
  const isCocina = location.startsWith('/cocina');
  const isGuardarropia = location.startsWith('/guardarropia');
  const isGastos = location.startsWith('/gastos');
  const hideChrome = isCaja || isAdmin || isParty || isPuerta || isCocina || isGuardarropia || isGastos;
  const showDesktopExtras = !hideChrome && isFinePointer();

  useEffect(() => {
    document.getElementById('initial-loader')?.remove();
  }, []);

  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark">
        <TooltipProvider>
          {showDesktopExtras && (
            <Suspense fallback={null}>
              <SmoothScroll />
              <CustomCursor />
            </Suspense>
          )}
          {!hideChrome && <Navbar />}
          <Toaster position="top-center" />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;

const SmoothScroll = lazy(() => import("./components/SmoothScroll"));
const CustomCursor = lazy(() => import("./components/CustomCursor"));
