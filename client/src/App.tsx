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
import Home from "./pages/Home";

// Lazy load pages
import { lazy, Suspense } from "react";
const Events = lazy(() => import("./pages/Events"));
const EventDetail = lazy(() => import("./pages/EventDetail"));
const Checkout = lazy(() => import("./pages/Checkout"));
const PaymentSuccess = lazy(() => import("./pages/PaymentSuccess"));
const PaymentFailure = lazy(() => import("./pages/PaymentFailure"));
const About = lazy(() => import("./pages/About"));
const AdminDashboard = lazy(() => import("./pages/admin/Dashboard"));
const MyReferrals = lazy(() => import("./pages/MyReferrals"));
const Ticket = lazy(() => import("./pages/Ticket"));
const Prices = lazy(() => import("./pages/Prices"));

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
          <Route path="/verificar/:ticketCode" component={Ticket} />
          <Route path="/entradas" component={Prices} />
          <Route path="/admin" component={AdminDashboard} />
          <Route path="/404" component={NotFound} />
          <Route component={NotFound} />
        </Switch>
      </motion.div>
    </Suspense>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark">
        <TooltipProvider>
          <SmoothScroll />
          <CustomCursor />
          <Navbar />
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
