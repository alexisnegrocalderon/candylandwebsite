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
    <div className="min-h-screen flex items-center justify-center bg-black">
      <div className="relative">
        <div className="w-12 h-12 border-2 border-pink-500 border-t-transparent rounded-full animate-spin" />
        <div className="absolute inset-0 w-12 h-12 border-2 border-cyan-400 border-b-transparent rounded-full animate-spin" style={{ animationDuration: '1.5s' }} />
      </div>
    </div>
  );
}

// Componente de transición cinematográfica tipo noth.in
function PageTransition({ children }: { children: React.ReactNode }) {
  // Cortina que cubre y descubre
  const curtainVariants = {
    initial: { 
      scaleY: 0, 
      originY: 1,
    },
    enter: { 
      scaleY: 1, 
      originY: 1,
      transition: { 
        duration: 0.5, 
        ease: [0.76, 0, 0.24, 1], // Expo out - empieza rápido, frena suave
      }
    },
    exit: { 
      scaleY: 0, 
      originY: 0, // Desaparece hacia arriba
      transition: { 
        duration: 0.6, 
        ease: [0.76, 0, 0.24, 1],
        delay: 0.15
      }
    }
  };

  // Contenido de la página
  const pageVariants = {
    initial: { 
      opacity: 0, 
      y: 40,
      filter: "blur(12px)",
      scale: 0.98
    },
    enter: { 
      opacity: 1, 
      y: 0,
      filter: "blur(0px)",
      scale: 1,
      transition: { 
        duration: 0.9, 
        ease: [0.16, 1, 0.3, 1], // Expo out para sensación de lujo
        delay: 0.3 // Espera a que la cortina empiece a retirarse
      } 
    },
    exit: { 
      opacity: 0, 
      y: -30,
      filter: "blur(8px)",
      scale: 1.02,
      transition: { 
        duration: 0.4, 
        ease: [0.4, 0, 1, 1] 
      } 
    }
  };

  return (
    <motion.div
      variants={pageVariants}
      initial="initial"
      animate="enter"
      exit="exit"
      className="relative min-h-screen w-full"
    >
      {/* --- LA CORTINA CANDYLAND --- */}
      <motion.div
        variants={curtainVariants}
        initial="initial"
        animate="enter"
        exit="exit"
        className="fixed inset-0 z-[9999] pointer-events-none"
        style={{
          background: "linear-gradient(135deg, #FF1493 0%, #FF69B4 40%, #00BFFF 100%)",
        }}
      >
        {/* Textura de ruido para efecto cinematográfico */}
        <div 
          className="absolute inset-0 opacity-[0.08]" 
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`
          }}
        />
        
        {/* Logo que aparece brevemente en la cortina */}
        <motion.div 
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 1.1, y: -20 }}
          transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
          className="absolute inset-0 flex items-center justify-center"
        >
          <div className="text-center">
            <h2 className="font-syne text-5xl md:text-7xl font-black text-white tracking-tighter drop-shadow-2xl">
              MANSION
            </h2>
            <h2 className="font-syne text-5xl md:text-7xl font-black text-black/30 tracking-tighter">
              PLAYROOM
            </h2>
          </div>
        </motion.div>
      </motion.div>

      {/* --- CONTENIDO REAL DE LA PÁGINA --- */}
      <div className="relative z-10">
        {children}
      </div>
    </motion.div>
  );
}

function Router() {
  const [location] = useLocation();
  return (
    <Suspense fallback={<PageLoader />}>
      <AnimatePresence mode="wait">
        <PageTransition key={location}>
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
        </PageTransition>
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
