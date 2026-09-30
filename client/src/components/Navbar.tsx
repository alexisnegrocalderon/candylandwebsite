import { useState, useEffect } from 'react';
import { Link, useLocation } from 'wouter';
import { motion, AnimatePresence } from 'framer-motion';
import { Menu, X, Instagram, ChevronDown } from 'lucide-react';
import { CANDYLAND, EVENTO } from '@/config/candyland';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { getGuides, getPosts, articlePath, STANDALONE_PAGES } from '@/content';

const navLinks = [
  { href: '/', label: 'Inicio' },
  { href: '/eventos', label: 'Eventos' },
  { href: '/entradas', label: 'Entradas' },
  { href: '/blog/tarjeta-playcard', label: 'PlayCard' },
  { href: '/recargar', label: 'Recargar PlayCard' },
  { href: '/playmatch', label: 'Playmatch' },
  { href: '/embajadores', label: 'Embajadores' },
];

// Solo para el nav de ESCRITORIO (mobile sigue usando `navLinks` tal cual,
// como una lista plana -- no tenía el problema de header "lleno" que
// reportó el dueño). Agrupa por INTENCIÓN del visitante en vez de dejar 6
// links + 2 dropdowns sueltos compitiendo por espacio en una sola fila:
// "Eventos" es todo lo de "voy a ir / cuánto sale", "Comunidad" es todo lo
// de "quiero conocer más / participar" (incluye el contenido de Blog y
// Guías, que antes era su propio dropdown).
const desktopEventosLinks = [
  { href: '/eventos', label: 'Eventos' },
  { href: '/entradas', label: 'Entradas' },
  { href: '/blog/tarjeta-playcard', label: 'PlayCard' },
  { href: '/recargar', label: 'Recargar PlayCard' },
];
const desktopComunidadLinks = [
  { href: '/playmatch', label: 'Playmatch' },
  { href: '/embajadores', label: 'Embajadores' },
];

// Antes acá había un link plano a "Panoramas" -- se reemplaza por el
// dropdown "Blog y Guías" de abajo, que muestra el título real de cada
// artículo (guías + posts + las 2 páginas standalone, PlayCard incluida)
// en vez de un link genérico al índice. Así la gente ve de qué se trata
// antes de entrar, que es justo lo que pidió el dueño para que los
// artículos se encuentren más fácil. PlayCard se queda ADEMÁS como link
// propio arriba (pedido explícito del dueño, ver PlayCardBannerSection en
// Home.tsx) -- aparecer también en el dropdown no le resta nada.
const blogMenuGuias = getGuides().map((a) => ({ label: a.title, href: articlePath(a), emoji: a.emoji }));
const blogMenuPosts = [
  ...getPosts().map((a) => ({ label: a.title, href: articlePath(a), emoji: a.emoji })),
  ...STANDALONE_PAGES.map((p) => ({ label: p.title, href: p.path, emoji: p.emoji })),
];

/** Chip con emoji, mismo lenguaje visual "candy" del resto del sitio (fondo
 * pastel rosado, esquinas redondas) en vez de una fila de texto plano -- lo
 * que pidió el dueño para que el dropdown se vea "más Playroom". Las clases
 * de layout (flex-col, padding, radio, fondo) van pensadas para pasar por
 * `cn()`/`twMerge` (ver DropdownMenuItem en ui/dropdown-menu.tsx), así se
 * resuelven bien contra las clases por defecto del item en vez de competir
 * con ellas en el DOM. */
const CHIP_CLASSES = 'flex-col items-start gap-1 rounded-xl bg-primary/8 hover:bg-primary/15 border border-primary/10 px-3 py-2.5 h-full cursor-pointer';

function ChipContent({ emoji, label }: { emoji: string; label: string }) {
  return (
    <>
      <span className="text-xl leading-none" aria-hidden>{emoji}</span>
      <span className="text-xs font-semibold leading-snug line-clamp-2">{label}</span>
    </>
  );
}

// `/mis-referidos` NO va acá: es `noindex` (muestra datos personales del
// embajador), así que enlazarla desde todas las páginas solo gastaba fuerza
// de enlazado interno en una página que Google no puede posicionar. Se sigue
// llegando por el link de los correos y por URL directa.
const secondaryNavLinks = [
  { href: '/nosotros', label: 'Nosotros' },
  { href: '/politica-de-reembolso', label: 'Política de reembolso' },
  { href: '/politica-de-privacidad', label: 'Política de privacidad' },
];

const DARK_TOP_ROUTES = ['/', '/halloween', '/disfraces'];

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [location] = useLocation();

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 50);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // El estilo blanco (sin fondo, con sombra) solo sirve sobre un fondo
  // oscuro arriba de todo: el Hero de la Home, la portada Halloween y el
  // Oráculo. En el resto de las páginas el fondo es claro y los íconos
  // blancos quedaban casi invisibles -- ahí se usa siempre el tono normal.
  const lightChrome = scrolled || !DARK_TOP_ROUTES.includes(location);

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
              width={300}
              height={300}
              className="h-12 w-auto"
            />
          </Link>

          {/* Desktop nav -- sin scrollear, el nav flota directo sobre el video
           * del Hero (className de arriba no le pone fondo hasta `scrolled`).
           * `text-muted-foreground` ahí es un gris oscuro pensado para fondos
           * claros -- casi invisible contra el video oscuro. Mientras no hay
           * scroll, usa un tono claro con sombra propia; apenas aparece el
           * fondo (`scrolled`), vuelve al esquema normal del resto del sitio. */}
          <div className="hidden md:flex items-center gap-7">
            <Link
              href="/"
              className={`text-sm font-medium tracking-wide uppercase transition-colors duration-300 interactive ${
                location === '/'
                  ? 'text-primary'
                  : lightChrome
                    ? 'text-muted-foreground hover:text-foreground'
                    : 'text-white/90 hover:text-white drop-shadow-[0_1px_6px_rgba(0,0,0,0.6)]'
              }`}
            >
              Inicio
            </Link>

            {/* "Eventos ▾": todo lo de "voy a ir / cuánto sale" -- antes eran
             * 3 links sueltos (Eventos, Entradas, PlayCard) compitiendo por
             * espacio en la misma fila que el resto. */}
            <DropdownMenu>
              <DropdownMenuTrigger className={`flex items-center gap-1 text-sm font-medium tracking-wide uppercase transition-colors duration-300 interactive outline-none ${
                lightChrome ? 'text-muted-foreground hover:text-foreground' : 'text-white/90 hover:text-white drop-shadow-[0_1px_6px_rgba(0,0,0,0.6)]'
              }`}>
                Eventos <ChevronDown size={14} strokeWidth={2} />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                {desktopEventosLinks.map((link) => (
                  <DropdownMenuItem key={link.href} asChild>
                    <Link href={link.href}>{link.label}</Link>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* "Comunidad ▾": todo lo de "quiero conocer más / participar" --
             * Playmatch y Embajadores arriba, más abajo el mismo contenido
             * que antes vivía en su propio dropdown "Blog y Guías" (se
             * mueve acá adentro en vez de sumar un tercer dropdown suelto). */}
            <DropdownMenu>
              <DropdownMenuTrigger className={`flex items-center gap-1 text-sm font-medium tracking-wide uppercase transition-colors duration-300 interactive outline-none ${
                lightChrome ? 'text-muted-foreground hover:text-foreground' : 'text-white/90 hover:text-white drop-shadow-[0_1px_6px_rgba(0,0,0,0.6)]'
              }`}>
                Comunidad <ChevronDown size={14} strokeWidth={2} />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-[26rem] max-h-[75vh] overflow-y-auto p-3">
                {desktopComunidadLinks.map((link) => (
                  <DropdownMenuItem key={link.href} asChild>
                    <Link href={link.href}>{link.label}</Link>
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuLabel>Guías</DropdownMenuLabel>
                <div className="grid grid-cols-2 gap-2 mb-1">
                  {blogMenuGuias.map((link) => (
                    <DropdownMenuItem key={link.href} asChild className={CHIP_CLASSES}>
                      <Link href={link.href}>
                        <ChipContent emoji={link.emoji} label={link.label} />
                      </Link>
                    </DropdownMenuItem>
                  ))}
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuLabel>Blog</DropdownMenuLabel>
                <div className="grid grid-cols-2 gap-2 mb-1">
                  {blogMenuPosts.map((link) => (
                    <DropdownMenuItem key={link.href} asChild className={CHIP_CLASSES}>
                      <Link href={link.href}>
                        <ChipContent emoji={link.emoji} label={link.label} />
                      </Link>
                    </DropdownMenuItem>
                  ))}
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/blog" className="font-semibold text-primary justify-center">Ver todo →</Link>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu>
              <DropdownMenuTrigger className={`flex items-center gap-1 text-sm font-medium tracking-wide uppercase transition-colors duration-300 interactive outline-none ${
                lightChrome ? 'text-muted-foreground hover:text-foreground' : 'text-white/90 hover:text-white drop-shadow-[0_1px_6px_rgba(0,0,0,0.6)]'
              }`}>
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

            {/* Instagram en su propio botón circular + separador antes del
             * CTA (pedido explícito del dueño): antes flotaba suelto justo
             * al lado del botón "Comprar Entradas" y el ojo iba directo al
             * botón grande -- ahora se lee como un grupo aparte. */}
            <a
              href={CANDYLAND.redes.instagram}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Instagram de Mansion Playroom"
              className={`flex items-center justify-center w-9 h-9 rounded-full border transition-colors duration-300 interactive ${
                lightChrome
                  ? 'border-border/50 text-muted-foreground hover:text-primary hover:border-primary/40'
                  : 'border-white/25 bg-white/10 text-white/90 hover:text-white hover:bg-white/15'
              }`}
            >
              <Instagram size={16} strokeWidth={1.75} />
            </a>

            {EVENTO.fechaConfirmada && (
              <>
                <span aria-hidden className={`w-px h-6 ${lightChrome ? 'bg-border' : 'bg-white/25'}`} />
                <Link
                  href={`/checkout/${CANDYLAND.slug}`}
                  className="btn-jelly px-6 py-2.5 bg-primary text-primary-foreground rounded-full text-sm font-semibold tracking-wide uppercase interactive"
                >
                  Comprar Entradas
                </Link>
              </>
            )}
          </div>

          {/* Mobile: Instagram + menú -- mismo criterio de contraste que el
           * nav de escritorio (líneas de arriba): blanco con sombra mientras
           * flota sobre el Hero oscuro, tono normal del sitio una vez que
           * aparece el fondo del nav (`scrolled`) O el menú está abierto (el
           * overlay `bg-background/95` de más abajo es claro, así que ahí
           * también hace falta el tono oscuro normal, no el blanco).
           * Antes usaban `text-muted-foreground` fijo, casi invisibles sobre
           * el video del Hero -- reportado por el dueño (mucha gente ni
           * notaba que había un menú, solo veía el botón "Quiero ir").
           * El círculo de Instagram es el mismo tratamiento que en
           * escritorio (borde + fondo sutil) -- pedido explícito del dueño
           * para que se vean iguales en las dos versiones. El botón de menú
           * suma el mismo círculo, para que ambos combinen entre sí. */}
          <div className="flex items-center gap-2.5 md:hidden">
            <a
              href={CANDYLAND.redes.instagram}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Instagram de Mansion Playroom"
              className={`flex items-center justify-center w-9 h-9 rounded-full border transition-colors interactive ${
                lightChrome || mobileOpen
                  ? 'border-border/50 text-muted-foreground hover:text-primary hover:border-primary/40'
                  : 'border-white/25 bg-white/10 text-white/90 hover:text-white hover:bg-white/15'
              }`}
            >
              <Instagram size={17} strokeWidth={1.75} />
            </a>
            <button
              onClick={() => setMobileOpen(!mobileOpen)}
              className={`flex items-center justify-center w-9 h-9 rounded-full border transition-colors interactive ${
                lightChrome || mobileOpen
                  ? 'border-border/50 text-foreground hover:border-primary/40'
                  : 'border-white/25 bg-white/10 text-white/90 hover:text-white hover:bg-white/15'
              }`}
              aria-label={mobileOpen ? 'Cerrar menú' : 'Abrir menú'}
              aria-expanded={mobileOpen}
            >
              {mobileOpen ? <X size={18} /> : <Menu size={18} />}
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
            className="fixed inset-0 z-40 bg-background/95 backdrop-blur-xl pt-24 px-6 pb-8 overflow-y-auto md:hidden"
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

              {/* Mismo tamaño/peso que el resto de los títulos de arriba --
               * pedido explícito del dueño, para que no se lea como un link
               * secundario menor sino como una sección más del menú
               * principal. Se queda como acordeón (toca para desplegar los
               * chips de artículos) en vez de link directo. */}
              <Accordion type="single" collapsible>
                <AccordionItem value="blog-y-guias" className="border-b-0">
                  <AccordionTrigger className="text-3xl font-heading font-bold tracking-tight py-0 hover:no-underline">
                    Blog y Guías
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="grid grid-cols-2 gap-2 pt-4">
                      {[...blogMenuGuias, ...blogMenuPosts].map((link) => (
                        <Link
                          key={link.href}
                          href={link.href}
                          onClick={() => setMobileOpen(false)}
                          className={`flex ${CHIP_CLASSES}`}
                        >
                          <ChipContent emoji={link.emoji} label={link.label} />
                        </Link>
                      ))}
                    </div>
                    <Link
                      href="/blog"
                      onClick={() => setMobileOpen(false)}
                      className="block mt-2 text-sm font-semibold text-primary text-center"
                    >
                      Ver todo →
                    </Link>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>

              {EVENTO.fechaConfirmada && (
                <Link
                  href={`/checkout/${CANDYLAND.slug}`}
                  onClick={() => setMobileOpen(false)}
                  className="btn-jelly mt-2 px-8 py-4 bg-primary text-primary-foreground rounded-full text-lg font-semibold text-center interactive"
                >
                  Comprar Entradas
                </Link>
              )}

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
