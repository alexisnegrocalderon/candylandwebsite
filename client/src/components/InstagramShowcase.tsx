import { useCallback, useEffect, useRef, useState } from 'react';
import { Instagram, Heart, MessageCircle, Clapperboard, Layers, X, Volume2, VolumeX, ExternalLink } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { CANDYLAND } from '@/config/candyland';
import { formatCount, storyNext, storyPrev, type ShowcaseMedia } from '@shared/instagramShowcase';

/* "Ventana a Instagram" (pedido del dueño, 09/10): la portada muestra el perfil
 * real de @mansionplayroom.cl y sus últimas publicaciones, y al tocar una se
 * abre como las historias de Instagram. Datos desde server/instagramFeed.ts
 * (API de Meta, gratis, caché de 1 hora). Se carga recién cuando la sección
 * se acerca a la pantalla, para no hacer más lenta la portada. */

const STORY_MS = 6000;
const REEL_MAX_MS = 30000;

function prefersReducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

/** Cuenta de 0 al número al aparecer (o directo si piden menos movimiento). */
function useCountUp(target: number, active: boolean) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (!active || target <= 0) return;
    if (prefersReducedMotion()) { setValue(target); return; }
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / 1400);
      setValue(Math.round(target * (1 - Math.pow(1 - t, 3))));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, active]);
  return value;
}

export default function InstagramShowcase() {
  const sectionRef = useRef<HTMLElement>(null);
  const [near, setNear] = useState(false);
  const [visible, setVisible] = useState(false);
  const [open, setOpen] = useState<number | null>(null);

  useEffect(() => {
    const el = sectionRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') { setNear(true); setVisible(true); return; }
    const nearObs = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setNear(true); nearObs.disconnect(); } }, { rootMargin: '600px 0px' });
    const visObs = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setVisible(true); visObs.disconnect(); } }, { threshold: 0.3 });
    nearObs.observe(el);
    visObs.observe(el);
    return () => { nearObs.disconnect(); visObs.disconnect(); };
  }, []);

  const { data } = trpc.instagramShowcase.get.useQuery(undefined, { enabled: near, staleTime: 30 * 60 * 1000, retry: false });
  const { data: settings } = trpc.settings.get.useQuery(undefined, { enabled: near && !data });
  const profile = data?.profile;
  const media = data?.media ?? [];
  const followers = useCountUp(profile?.followers ?? settings?.instagramFollowers ?? 0, visible);
  const posts = useCountUp(profile?.posts ?? settings?.instagramPosts ?? 0, visible);
  const handle = profile?.username ?? CANDYLAND.redes.instagram.split('/').filter(Boolean).pop();
  const profileUrl = CANDYLAND.redes.instagram;

  return (
    <section ref={sectionRef} aria-labelledby="ig-showcase-title" className="relative py-20 md:py-28 overflow-hidden">
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-gradient-to-b from-transparent via-violet-electric/5 to-transparent" />
      <div className="container relative">
        <div className="mx-auto max-w-3xl">
          {/* Cabecera tipo perfil */}
          <div className="glass-candy rounded-3xl p-5 md:p-8">
            <div className="flex flex-col sm:flex-row items-center sm:items-start gap-5 sm:gap-7">
              <a href={profileUrl} target="_blank" rel="noopener noreferrer" className="shrink-0 rounded-full p-[3px] bg-gradient-to-tr from-amber-400 via-cherry to-violet-electric" aria-label={`Abrir @${handle} en Instagram`}>
                <span className="block rounded-full bg-background p-[3px]">
                  {profile?.picture
                    ? <img src={profile.picture} alt="" width={112} height={112} loading="lazy" className="h-24 w-24 md:h-28 md:w-28 rounded-full object-cover" />
                    : <span className="flex h-24 w-24 md:h-28 md:w-28 items-center justify-center rounded-full bg-gradient-to-br from-primary via-cherry to-violet-electric"><Instagram className="h-10 w-10 text-white" /></span>}
                </span>
              </a>
              <div className="min-w-0 flex-1 text-center sm:text-left">
                <h2 id="ig-showcase-title" className="font-heading text-2xl md:text-3xl">@{handle}</h2>
                {profile?.name && <p className="text-sm text-muted-foreground mt-0.5">{profile.name}</p>}
                <div className="mt-3 flex justify-center sm:justify-start gap-6">
                  <p><span className="block text-xl md:text-2xl font-bold tabular-nums">{formatCount(followers)}</span><span className="text-xs text-muted-foreground">seguidores</span></p>
                  <p><span className="block text-xl md:text-2xl font-bold tabular-nums">{formatCount(posts)}</span><span className="text-xs text-muted-foreground">publicaciones</span></p>
                </div>
                {profile?.bio && <p className="mt-3 whitespace-pre-line text-sm leading-relaxed">{profile.bio}</p>}
                <a
                  href={profileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="interactive mt-4 inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-primary via-cherry to-violet-electric px-6 py-2.5 text-sm font-bold text-white shadow-lg hover:opacity-90 transition-opacity"
                >
                  <Instagram className="h-4 w-4" /> Seguir en Instagram
                </a>
              </div>
            </div>
          </div>

          {/* Grilla de publicaciones */}
          {media.length > 0 && (
            <ul className="mt-4 grid grid-cols-3 gap-1.5 md:gap-2">
              {media.map((m, i) => (
                <li key={m.id}>
                  <button
                    type="button"
                    onClick={() => setOpen(i)}
                    className="group relative block aspect-square w-full overflow-hidden rounded-lg md:rounded-xl bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    aria-label={`Ver publicación ${i + 1} de ${media.length}${m.type === 'reel' ? ' (reel)' : ''}`}
                  >
                    <img src={m.image} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
                    {m.type !== 'image' && (
                      <span className="absolute right-1.5 top-1.5 text-white drop-shadow">{m.type === 'reel' ? <Clapperboard className="h-4 w-4" /> : <Layers className="h-4 w-4" />}</span>
                    )}
                    {(m.likes != null || m.comments != null) && (
                      <span className="absolute inset-0 flex items-center justify-center gap-4 bg-black/45 text-sm font-semibold text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                        {m.likes != null && <span className="flex items-center gap-1"><Heart className="h-4 w-4 fill-white" /> {formatCount(m.likes)}</span>}
                        {m.comments != null && <span className="flex items-center gap-1"><MessageCircle className="h-4 w-4 fill-white" /> {formatCount(m.comments)}</span>}
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      {open !== null && media.length > 0 && (
        <StoryViewer media={media} start={open} handle={handle ?? ''} picture={profile?.picture ?? null} onClose={() => setOpen(null)} />
      )}
    </section>
  );
}

function StoryViewer({ media, start, handle, picture, onClose }: { media: ShowcaseMedia[]; start: number; handle: string; picture: string | null; onClose: () => void }) {
  const [index, setIndex] = useState(start);
  const [progress, setProgress] = useState(0);
  const [paused, setPaused] = useState(false);
  const [muted, setMuted] = useState(true);
  const [dragY, setDragY] = useState(0);
  const item = media[index];
  const videoRef = useRef<HTMLVideoElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const touchStart = useRef<{ x: number; y: number; t: number } | null>(null);

  const next = useCallback(() => {
    const n = storyNext(index, media.length);
    if (n === null) onClose(); else { setIndex(n); setProgress(0); }
  }, [index, media.length, onClose]);
  const prev = useCallback(() => { setIndex((i) => storyPrev(i)); setProgress(0); }, []);

  // Bloquea el scroll de la página y devuelve el foco al cerrar.
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    return () => { document.body.style.overflow = overflow; previous?.focus?.(); };
  }, []);

  // Teclado: flechas, Esc y foco atrapado dentro del visor.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight') next();
      else if (e.key === 'ArrowLeft') prev();
      else if (e.key === ' ') { e.preventDefault(); setPaused((p) => !p); }
      else if (e.key === 'Tab' && dialogRef.current) {
        const focusables = Array.from(dialogRef.current.querySelectorAll<HTMLElement>('button, a[href]'));
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [next, prev, onClose]);

  // Avance automático (imágenes). Los reels avanzan con su propio progreso.
  useEffect(() => {
    if (item.type === 'reel' || paused) return;
    const reduced = prefersReducedMotion();
    let frame = 0;
    const startAt = performance.now() - progress * STORY_MS;
    const tick = (now: number) => {
      const p = Math.min(1, (now - startAt) / STORY_MS);
      setProgress(p);
      if (p >= 1) { if (!reduced) next(); return; }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, paused, item.type]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (paused) v.pause(); else v.play().catch(() => {});
  }, [paused, index]);

  const onVideoTime = () => {
    const v = videoRef.current;
    if (!v) return;
    const total = Math.min(v.duration || REEL_MAX_MS / 1000, REEL_MAX_MS / 1000);
    const p = Math.min(1, v.currentTime / total);
    setProgress(p);
    if (p >= 1) next();
  };

  const onTouchStart = (e: React.TouchEvent) => {
    // Los botones (cerrar, sonido, "Ver en Instagram") funcionan solos: no son zona de avance.
    if ((e.target as HTMLElement).closest('[data-story-control]')) { touchStart.current = null; return; }
    const t = e.touches[0];
    touchStart.current = { x: t.clientX, y: t.clientY, t: Date.now() };
    setPaused(true);
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (!touchStart.current) return;
    const dy = e.touches[0].clientY - touchStart.current.y;
    setDragY(Math.max(0, dy));
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    const s = touchStart.current;
    touchStart.current = null;
    setPaused(false);
    if (!s) return;
    const t = e.changedTouches[0];
    const dy = t.clientY - s.y;
    const held = Date.now() - s.t > 350;
    setDragY(0);
    // Se maneja acá y se evita el "click" sintético que el navegador manda después del toque.
    e.preventDefault();
    if (dy > 110) { onClose(); return; }
    if (held || Math.abs(dy) > 20) return; // mantener presionado = pausa, no navega
    const w = window.innerWidth;
    if (t.clientX < w * 0.33) prev(); else next();
  };

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label={`Publicaciones de @${handle}`}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/95"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="relative h-full w-full max-w-[min(100vw,56vh)] select-none sm:h-[92vh] sm:rounded-2xl overflow-hidden bg-black transition-transform"
        style={{ transform: dragY ? `translateY(${dragY}px) scale(${1 - Math.min(dragY, 300) / 1500})` : undefined }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onMouseDown={() => setPaused(true)}
        onMouseUp={() => setPaused(false)}
        onMouseLeave={() => setPaused(false)}
      >
        {/* Barras de progreso */}
        <div className="absolute inset-x-2 top-2 z-10 flex gap-1">
          {media.map((m, i) => (
            <span key={m.id} className="h-0.5 flex-1 overflow-hidden rounded-full bg-white/30">
              <span className="block h-full bg-white" style={{ width: `${i < index ? 100 : i === index ? progress * 100 : 0}%` }} />
            </span>
          ))}
        </div>
        {/* Cabecera */}
        <div className="absolute inset-x-3 top-5 z-10 flex items-center justify-between text-white">
          <span className="flex items-center gap-2 text-sm font-semibold drop-shadow">
            {picture ? <img src={picture} alt="" className="h-8 w-8 rounded-full object-cover" /> : <Instagram className="h-6 w-6" />}
            @{handle}
          </span>
          <span className="flex items-center gap-1">
            {item.type === 'reel' && (
              <button type="button" data-story-control onClick={(e) => { e.stopPropagation(); setMuted((m) => !m); }} className="rounded-full p-2 hover:bg-white/10" aria-label={muted ? 'Activar sonido' : 'Silenciar'}>
                {muted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
              </button>
            )}
            <button ref={closeRef} type="button" data-story-control onClick={(e) => { e.stopPropagation(); onClose(); }} className="rounded-full p-2 hover:bg-white/10" aria-label="Cerrar">
              <X className="h-6 w-6" />
            </button>
          </span>
        </div>
        {/* Contenido */}
        {item.type === 'reel' && item.video ? (
          <video
            key={item.id}
            ref={videoRef}
            src={item.video}
            poster={item.image}
            muted={muted}
            playsInline
            autoPlay
            preload="metadata"
            onTimeUpdate={onVideoTime}
            onEnded={next}
            className="h-full w-full object-contain"
          />
        ) : (
          <img key={item.id} src={item.image} alt={item.caption ? item.caption.slice(0, 120) : 'Publicación de Instagram'} className="h-full w-full object-contain" />
        )}
        {/* Zonas para computador (en pantalla táctil se usa el toque) */}
        <button type="button" aria-label="Anterior" onClick={(e) => { e.stopPropagation(); prev(); }} className="absolute left-0 top-16 bottom-28 w-1/3 cursor-w-resize opacity-0" tabIndex={-1} />
        <button type="button" aria-label="Siguiente" onClick={(e) => { e.stopPropagation(); next(); }} className="absolute right-0 top-16 bottom-28 w-2/3 cursor-e-resize opacity-0" tabIndex={-1} />
        {/* Texto y enlace */}
        <div className="absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-black/85 via-black/50 to-transparent p-4 pt-16 text-white">
          {item.caption && <p className="line-clamp-3 whitespace-pre-line text-sm">{item.caption}</p>}
          <a
            href={item.permalink}
            target="_blank"
            rel="noopener noreferrer"
            data-story-control
            onClick={(e) => e.stopPropagation()}
            className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-white px-4 py-2 text-sm font-semibold text-black"
          >
            Ver en Instagram <ExternalLink className="h-4 w-4" />
          </a>
        </div>
      </div>
    </div>
  );
}
