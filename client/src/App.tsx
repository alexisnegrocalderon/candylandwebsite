import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch, useLocation } from "wouter";
import { AnimatePresence, motion } from "framer-motion";
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
      {/* Transición inmersiva entre rutas: fade+rise corto, sin salto de página.
       * Sin mode="wait": con "wait" la página nueva no se monta hasta que la
       * animación de salida de la anterior termine — si el celular pierde
       * frames (pestaña en 2do plano, GPU lenta), esa animación no llega a
       * completarse y el usuario queda pegado en la página vieja sin poder
       * hacer nada, con la única salida siendo recargar. */}
      <AnimatePresence initial={false}>
        <motion.div
          key={location}
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10, position: 'absolute', top: 0, left: 0, right: 0, pointerEvents: 'none' }}
          transition={{ duration: 0.25, ease: [0.23, 1, 0.32, 1] }}
          className="relative"
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
            <Route path="/admin" component={AdminDashboard} />
            <Route path="/404" component={NotFound} />
            <Route component={NotFound} />
          </Switch>
        </motion.div>
      </AnimatePresence>
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
