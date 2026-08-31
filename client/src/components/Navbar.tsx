import { useState, useEffect } from 'react';
import { Link, useLocation } from 'wouter';
import { motion, AnimatePresence } from 'framer-motion';
import { Menu, X, Instagram, ChevronDown } from 'lucide-react';
import { CANDYLAND, EVENTO } from '@/config/candyland';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

const navLinks = [
  { href: '/', label: 'Inicio' },
  { href: '/eventos', label: 'Eventos' },
  { href: '/entradas', label: 'Entradas' },
  { href: '/panoramas', label: 'Panoramas' },
  { href: '/playmatch', label: 'Playmatch' },
  { href: '/embajadores', label: 'Embajadores' },
];

// `/mis-referidos` NO va acá: es `noindex` (muestra datos personales del
// embajador), así que enlazarla desde todas las páginas solo gastaba fuerza
// de enlazado interno en una página que Google no puede posicionar. Se sigue
// llegando por el link de los correos y por URL directa.
// "Nosotros" baja acá para hacerle lugar a "Panoramas" en el menú principal:
// con 7 ítems el navbar de escritorio se aprieta, y la guía de panoramas capta
// mucha más búsqueda que la página institucional.
const secondaryNavLinks = [
  { href: '/blog', label: 'Blog' },
  { href: '/nosotros', label: 'Nosotros' },
  { href: '/politica-de-reembolso', label: 'Política de reembolso' },
  { href: '/politica-de-privacidad', label: 'Política de privacidad' },
];

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [location] = useLocation();

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 50);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <>
      <motion.nav
        initial={{ y: -100 }}
        animate={{ y: 0 }}
        transition={{ duration: 0.6, ease: [0.23, 1, 0.32, 1] }}
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${
          scrolled ? 'bg-[oklch(0.995_0.006_340_/_0.55)] backdrop-blur-xl border-b border-primary/15 shadow-[0_4px_24px_oklch(0.70_0.19_340_/_0.06)]' : ''
        }`}
      >
        <div className="container flex items-center justify-between h-20">
          <Link href="/" className="group flex items-center gap-3 interactive">
            <img
              src="/candyland/logo-wordmark.webp"
              alt="Mansion Playroom"
              width={300}
              height={300}
              className="h-12 w-auto transition-all duration-300 group-hover:scale-105 group-hover:drop-shadow-[0_0_16px_oklch(0.70_0.19_340_/_0.35)]"
            />
          </Link>

          {/* Desktop nav */}
          <div className="hidden md:flex items-center gap-8">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`text-sm font-medium tracking-wide uppercase transition-colors duration-300 interactive ${
                  location === link.href ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {link.label}
              </Link>
            ))}

            <DropdownMenu>
              <DropdownMenuTrigger className="flex items-center gap-1 text-sm font-medium tracking-wide uppercase text-muted-foreground hover:text-foreground transition-colors duration-300 interactive outline-none">
                Más <ChevronDown size={14} strokeWidth={2} />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {secondaryNavLinks.map((link) => (
                  <DropdownMenuItem key={link.href} asChild>
                    <Link href={link.href} className="interactive">{link.label}</Link>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            <a
              href={CANDYLAND.redes.instagram}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Instagram de Mansion Playroom"
              className="text-muted-foreground hover:text-primary transition-colors duration-300 interactive"
            >
              <Instagram size={20} strokeWidth={1.75} />
            </a>

            {EVENTO.fechaConfirmada && (
              <Link
                href={`/checkout/${CANDYLAND.slug}`}
                className="btn-jelly px-6 py-2.5 bg-primary text-primary-foreground rounded-full text-sm font-semibold tracking-wide uppercase interactive"
              >
                Comprar Entradas
              </Link>
            )}
          </div>

          {/* Mobile: Instagram + menú */}
          <div className="flex items-center gap-3 md:hidden">
            <a
              href={CANDYLAND.redes.instagram}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Instagram de Mansion Playroom"
              className="text-muted-foreground hover:text-primary transition-colors interactive"
            >
              <Instagram size={20} strokeWidth={1.75} />
            </a>
            <button
              onClick={() => setMobileOpen(!mobileOpen)}
              className="p-2 text-foreground interactive"
              aria-label={mobileOpen ? 'Cerrar menú' : 'Abrir menú'}
              aria-expanded={mobileOpen}
            >
              {mobileOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
          </div>
        </div>
      </motion.nav>

      {/* Mobile menu */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1] }}
            className="fixed inset-0 z-40 bg-background/95 backdrop-blur-xl pt-24 px-6 md:hidden"
          >
            {/* Los links entran escalonados en vez de todos de golpe -- mismo
             * patrón de stagger que las amenities del Home (Home.tsx). */}
            <motion.div
              className="flex flex-col gap-6"
              initial="hidden"
              animate="show"
              variants={{ hidden: {}, show: { transition: { staggerChildren: 0.06 } } }}
            >
              {navLinks.map((link) => (
                <motion.div
                  key={link.href}
                  variants={{ hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.23, 1, 0.32, 1] } } }}
                >
                  <Link
                    href={link.href}
                    onClick={() => setMobileOpen(false)}
                    className="text-3xl font-heading font-bold tracking-tight interactive"
                  >
                    {link.label}
                  </Link>
                </motion.div>
              ))}

              {EVENTO.fechaConfirmada && (
                <motion.div variants={{ hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.23, 1, 0.32, 1] } } }}>
                  <Link
                    href={`/checkout/${CANDYLAND.slug}`}
                    onClick={() => setMobileOpen(false)}
                    className="btn-jelly mt-2 w-full px-8 py-4 bg-primary text-primary-foreground rounded-full text-lg font-semibold text-center inline-flex items-center justify-center interactive"
                  >
                    Comprar Entradas
                  </Link>
                </motion.div>
              )}

              <motion.div
                variants={{ hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.23, 1, 0.32, 1] } } }}
                className="mt-4 pt-4 border-t border-border/40 flex flex-col gap-3"
              >
                {secondaryNavLinks.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={() => setMobileOpen(false)}
                    className="text-sm text-muted-foreground interactive"
                  >
                    {link.label}
                  </Link>
                ))}
              </motion.div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
