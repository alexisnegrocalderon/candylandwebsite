import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch, useLocation } from "wouter";
import { motion } from "framer-motion";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import CustomCursor from "./components/CustomCursor";
import SmoothScroll from "./components/SmoothScroll";
import Navbar from "./components/Navbar";

// Lazy load pages -- Home incluida: antes se importaba eager y arrastraba
// las 7 secciones + trpc/react-query al chunk de entrada, que quedaba tan
// pesado que la página se sentía en blanco unos segundos al cargar.
import { lazy, Suspense, useEffect } from "react";
const Home = lazy(() => import("./pages/Home"));
const Events = lazy(() => import("./pages/Events"));
const EventDetail = lazy(() => import("./pages/EventDetail"));
const Checkout = lazy(() => import("./pages/Checkout"));
const PaymentSuccess = lazy(() => import("./pages/PaymentSuccess"));
const PaymentFailure = lazy(() => import("./pages/PaymentFailure"));
const About = lazy(() => import("./pages/About"));
const AdminDashboard = lazy(() => import("./pages/admin/Dashboard"));
const CajaApp = lazy(() => import("./pages/caja"));
const MyReferrals = lazy(() => import("./pages/MyReferrals"));
const MisPuntos = lazy(() => import("./pages/MisPuntos"));
const Ticket = lazy(() => import("./pages/Ticket"));
const Prices = lazy(() => import("./pages/Prices"));
const RefundPolicy = lazy(() => import("./pages/RefundPolicy"));

function PageLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

function Router() {
  const [location] = useLocation();
  return (
    <Suspense fallback={<PageLoader />}>
      {/* Transición de entrada al cambiar de ruta: fade+rise corto. Antes esto
       * usaba AnimatePresence con mode="popLayout" para animar también la
       * salida de la página anterior, pero eso probó ser un bug reproducible
       * de Framer Motion en este caso (página completa, sin `layout`, code-split
       * con lazy/Suspense): quedaban DOS instancias de la página nueva montadas
       * a la vez —una visible y otra congelada en su pose inicial (opacity:0)—
       * ocupando espacio real en el documento, lo que se veía como contenido
       * duplicado al hacer scroll. Confirmado en producción con una sola
       * navegación (un solo pushState) y reproducible también con la ruta ya
       * cacheada, así que no era una condición de carrera de Suspense.
       * Sin AnimatePresence, React desmonta la página vieja al instante
       * (sin animación de salida) y solo la nueva anima su entrada — se
       * pierde el crossfade de salida pero es imposible que queden dos
       * páginas mostrándose a la vez. */}
      <motion.div
        key={location}
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, ease: [0.23, 1, 0.32, 1] }}
      >
        <Switch>
          <Route path="/" component={Home} />
          <Route path="/eventos" component={Events} />
          <Route path="/eventos/:slug" component={EventDetail} />
          <Route path="/checkout/:eventSlug" component={Checkout} />
          <Route path="/pago/exito" component={PaymentSuccess} />
          <Route path="/pago/error" component={PaymentFailure} />
          <Route path="/nosotros" component={About} />
          <Route path="/mis-referidos" component={MyReferrals} />
          <Route path="/mis-puntos" component={MisPuntos} />
          <Route path="/verificar/:ticketCode" component={Ticket} />
          <Route path="/entradas" component={Prices} />
          <Route path="/politica-de-reembolso" component={RefundPolicy} />
          <Route path="/admin" component={AdminDashboard} />
          <Route path="/caja" component={CajaApp} />
          <Route path="/404" component={NotFound} />
          <Route component={NotFound} />
        </Switch>
      </motion.div>
    </Suspense>
  );
}

function App() {
  // /caja es una pantalla táctil de operación, no una página del sitio: sin
  // navbar público ni las animaciones decorativas del resto del sitio
  // (docs/ARQUITECTURA-CAJA.md §10.1). /admin ahora usa un sidebar propio
  // (fixed, inset-y-0) que chocaría con la navbar pública fija arriba, así
  // que tampoco la lleva -- es un panel interno, no una página del sitio.
  const [location] = useLocation();
  const isCaja = location.startsWith('/caja');
  const isAdmin = location.startsWith('/admin');
  const hideChrome = isCaja || isAdmin;

  // Saca el loader estático de client/index.html (pintado antes de que
  // React exista, para que nunca haya un instante en blanco) apenas React
  // hace su primer commit -- de ahí en más el spinner de Suspense (mismo
  // look) toma la posta mientras carga el chunk de la página.
  useEffect(() => {
    document.getElementById('initial-loader')?.remove();
  }, []);

  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark">
        <TooltipProvider>
          {!hideChrome && <SmoothScroll />}
          {!hideChrome && <CustomCursor />}
          {!hideChrome && <Navbar />}
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
