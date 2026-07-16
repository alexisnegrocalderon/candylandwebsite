import { useState, useEffect } from 'react';
import { Link, useLocation } from 'wouter';
import { motion, AnimatePresence } from 'framer-motion';
import { Menu, X, Instagram, ChevronDown } from 'lucide-react';
import { CANDYLAND } from '@/config/candyland';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

const navLinks = [
  { href: '/', label: 'Inicio' },
  { href: '/eventos', label: 'Eventos' },
  { href: '/entradas', label: 'Entradas' },
  { href: '/nosotros', label: 'Nosotros' },
];

const secondaryNavLinks = [
  { href: '/mis-referidos', label: 'Hall de la Fama' },
  { href: '/politica-de-reembolso', label: 'Política de reembolso' },
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
          scrolled ? 'bg-background/80 backdrop-blur-xl border-b border-border/50' : ''
        }`}
      >
        <div className="container flex items-center justify-between h-20">
          <Link href="/" className="flex items-center gap-3 interactive">
            <img
              src="/candyland/logo-wordmark.webp"
              alt="Mansion Playroom"
              className="h-12 w-auto"
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
                    <Link href={link.href}>{link.label}</Link>
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

            <Link
              href={`/checkout/${CANDYLAND.slug}`}
              className="px-6 py-2.5 bg-primary text-primary-foreground rounded-full text-sm font-semibold tracking-wide uppercase transition-transform duration-200 hover:scale-105 active:scale-95 interactive"
            >
              Comprar Entradas
            </Link>
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
            <div className="flex flex-col gap-6">
              {navLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setMobileOpen(false)}
                  className="text-3xl font-heading font-bold tracking-tight"
                >
                  {link.label}
                </Link>
              ))}

              <Link
                href={`/checkout/${CANDYLAND.slug}`}
                onClick={() => setMobileOpen(false)}
                className="mt-2 px-8 py-4 bg-primary text-primary-foreground rounded-full text-lg font-semibold text-center"
              >
                Comprar Entradas
              </Link>

              <div className="mt-4 pt-4 border-t border-border/40 flex flex-col gap-3">
                {secondaryNavLinks.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={() => setMobileOpen(false)}
                    className="text-sm text-muted-foreground"
                  >
                    {link.label}
                  </Link>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
