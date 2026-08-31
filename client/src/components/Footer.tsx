import { Instagram, MessageCircle, Music2 } from 'lucide-react';
import { Link } from 'wouter';
import { trpc } from '@/lib/trpc';
import { CANDYLAND } from '@/config/candyland';

/** Bar con avatar + seguidores/publicaciones — más confianza que un ícono suelto. */
function InstagramBar() {
  const { data: settings } = trpc.settings.get.useQuery();
  const followers = settings?.instagramFollowers ?? 0;
  const posts = settings?.instagramPosts ?? 0;
  const handle = CANDYLAND.redes.instagram.split('/').filter(Boolean).pop();
  const fmt = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}K` : String(n));

  return (
    <a
      href={CANDYLAND.redes.instagram}
      target="_blank"
      rel="noopener noreferrer"
      className="glass-candy rounded-full pl-2.5 pr-5 py-2 flex items-center gap-3 hover:border-primary/50 transition-colors interactive"
    >
      <span className="w-9 h-9 rounded-full bg-gradient-to-br from-primary via-cherry to-violet-electric flex items-center justify-center shrink-0">
        <Instagram className="w-4.5 h-4.5 text-white" />
      </span>
      <span className="flex flex-col leading-tight text-left">
        <span className="text-xs font-bold text-foreground">@{handle}</span>
        {(followers > 0 || posts > 0) && (
          <span className="text-[11px] text-muted-foreground">{fmt(followers)} seguidores · {fmt(posts)} publicaciones</span>
        )}
      </span>
    </a>
  );
}

/** Footer compartido por todas las páginas públicas (montado en App.tsx,
 *  gateado por el mismo `!hideChrome` que la Navbar) -- antes vivía solo
 *  adentro de Home.tsx, así que ninguna otra página tenía footer, links de
 *  navegación ni redes. */
export default function Footer() {
  return (
    <footer className="border-t border-primary/15 py-14">
      <div className="container">
        <div className="flex flex-col md:flex-row items-center justify-between gap-8">
          <img src="/candyland/logo-wordmark.webp" alt="Mansion Playroom" width={300} height={300} loading="lazy" className="h-12 w-auto" />

          <div className="flex items-center gap-5">
            <InstagramBar />
            <a
              href={CANDYLAND.redes.tiktok}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="TikTok"
              className="w-11 h-11 rounded-full glass-candy flex items-center justify-center hover:border-primary/50 transition-colors interactive"
            >
              <Music2 className="w-5 h-5 text-primary" />
            </a>
            <a
              href={CANDYLAND.redes.whatsapp}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="WhatsApp"
              className="w-11 h-11 rounded-full glass-candy flex items-center justify-center hover:border-primary/50 transition-colors interactive"
            >
              <MessageCircle className="w-5 h-5 text-primary" />
            </a>
          </div>
        </div>

        <div className="mt-10 pt-8 border-t border-border/40 flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
          <p>© {new Date().getFullYear()} Mansion Playroom · La Evolución del Carrete</p>
          <div className="flex items-center gap-6">
            <span className="px-3 py-1 rounded-full border border-cherry/40 text-cherry font-bold text-xs">+{CANDYLAND.edadMinima}</span>
            <Link href="/politica-de-reembolso" className="hover:text-foreground transition-colors">Política de reembolso</Link>
            <Link href="/politica-de-privacidad" className="hover:text-foreground transition-colors">Política de privacidad</Link>
            <Link href="/panoramas" className="hover:text-foreground transition-colors">Panoramas</Link>
            <Link href="/blog" className="hover:text-foreground transition-colors">Blog</Link>
            <Link href="/embajadores" className="hover:text-foreground transition-colors">Embajadores</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
