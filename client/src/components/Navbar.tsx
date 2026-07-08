import { useState, useEffect } from 'react';
import { Link, useLocation } from 'wouter';
import { motion, AnimatePresence } from 'framer-motion';
import { Menu, X, User, Shield, LogOut } from 'lucide-react';
import { useAuth } from '@/_core/hooks/useAuth';
import { startLogin } from '@/const';

const navLinks = [
  { href: '/', label: 'Inicio' },
  { href: '/eventos', label: 'Eventos' },
  { href: '/nosotros', label: 'Nosotros' },
];

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [location] = useLocation();
  const { user, isAuthenticated, logout } = useAuth();

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 50);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const isAdmin = user?.role === 'admin';

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
              src="/manus-storage/logo-playroom_2ea4ca93.png"
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

            {/* User menu */}
            {isAuthenticated ? (
              <div className="relative">
                <button
                  onClick={() => setUserMenuOpen(!userMenuOpen)}
                  className="flex items-center gap-2 px-4 py-2 border border-border/50 rounded-full text-sm font-medium text-foreground hover:border-primary/50 transition-all duration-300 interactive"
                >
                  <User className="w-4 h-4" />
                  <span className="max-w-[100px] truncate">{user?.name || 'Mi Cuenta'}</span>
                </button>

                <AnimatePresence>
                  {userMenuOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: -10, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -10, scale: 0.95 }}
                      transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
                      className="absolute right-0 top-12 w-56 bg-card border border-border/50 rounded-xl shadow-xl overflow-hidden"
                    >
                      <div className="p-3 border-b border-border/50">
                        <p className="text-sm font-medium text-foreground truncate">{user?.name}</p>
                        <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
                      </div>
                      <div className="p-2">
                        <Link
                          href="/mis-referidos"
                          onClick={() => setUserMenuOpen(false)}
                          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-foreground hover:bg-muted/50 transition-colors w-full"
                        >
                          <User className="w-4 h-4 text-primary" />
                          Mis Referidos
                        </Link>
                        {isAdmin && (
                          <Link
                            href="/admin"
                            onClick={() => setUserMenuOpen(false)}
                            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-foreground hover:bg-muted/50 transition-colors w-full"
                          >
                            <Shield className="w-4 h-4 text-primary" />
                            Panel Admin
                          </Link>
                        )}
                        <button
                          onClick={() => { logout(); setUserMenuOpen(false); }}
                          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-destructive hover:bg-destructive/10 transition-colors w-full"
                        >
                          <LogOut className="w-4 h-4" />
                          Cerrar Sesión
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ) : (
              <button
                onClick={() => startLogin()}
                className="flex items-center gap-2 px-4 py-2 border border-border/50 rounded-full text-sm font-medium text-muted-foreground hover:text-foreground hover:border-primary/50 transition-all duration-300 interactive"
              >
                <User className="w-4 h-4" />
                Ingresar
              </button>
            )}

            <Link
              href="/eventos"
              className="px-6 py-2.5 bg-primary text-primary-foreground rounded-full text-sm font-semibold tracking-wide uppercase transition-transform duration-200 hover:scale-105 active:scale-95 interactive"
            >
              Comprar Entradas
            </Link>
          </div>

          {/* Mobile menu button */}
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="md:hidden p-2 text-foreground interactive"
          >
            {mobileOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>
      </motion.nav>

      {/* Click outside to close user menu */}
      {userMenuOpen && (
        <div className="fixed inset-0 z-40" onClick={() => setUserMenuOpen(false)} />
      )}

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

              {isAuthenticated && (
                <>
                  <Link
                    href="/mis-referidos"
                    onClick={() => setMobileOpen(false)}
                    className="text-2xl font-heading tracking-tight text-primary"
                  >
                    Mis Referidos
                  </Link>
                  {isAdmin && (
                    <Link
                      href="/admin"
                      onClick={() => setMobileOpen(false)}
                      className="text-2xl font-heading tracking-tight text-primary"
                    >
                      Panel Admin
                    </Link>
                  )}
                </>
              )}

              {!isAuthenticated && (
                <button
                  onClick={() => { startLogin(); setMobileOpen(false); }}
                  className="text-2xl font-heading tracking-tight text-muted-foreground"
                >
                  Iniciar Sesión
                </button>
              )}

              <Link
                href="/eventos"
                onClick={() => setMobileOpen(false)}
                className="mt-4 px-8 py-4 bg-primary text-primary-foreground rounded-full text-lg font-semibold text-center"
              >
                Comprar Entradas
              </Link>

              {isAuthenticated && (
                <button
                  onClick={() => { logout(); setMobileOpen(false); }}
                  className="text-lg text-destructive text-left"
                >
                  Cerrar Sesión
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
