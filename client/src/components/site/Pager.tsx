import { Children, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { useEntryState } from '@/lib/appNav';

/* Páginas que se deslizan de lado (como la pantalla de inicio del iPhone) en vez de una lista larga con scroll
 * vertical. Cada hijo es una página a todo el ancho y alto. Scroll horizontal nativo con snap, sin librerías.
 * Con una sola página no se dibujan los puntitos. `onActive` avisa la página visible. `rememberAs`: la página
 * queda en la entrada del historial, y al volver a la pantalla abre en la misma. */
export function Pager({ children, className = '', onActive, rememberAs }: { children: ReactNode; className?: string; onActive?: (i: number) => void; rememberAs?: string }) {
  const pages = Children.toArray(children);
  const ref = useRef<HTMLDivElement>(null);
  const [saved, setSaved] = useEntryState(rememberAs ? `pager.${rememberAs}` : 'pager', 0);
  const [active, setActive] = useState(rememberAs ? Math.min(saved, Math.max(0, pages.length - 1)) : 0);

  // Abre en la página guardada sin que se vea pasar por las anteriores.
  useLayoutEffect(() => {
    const el = ref.current;
    if (el && active > 0) el.scrollLeft = active * el.clientWidth;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { if (rememberAs && active !== saved) setSaved(active); }, [active]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { onActive?.(active); }, [active, onActive]);

  const onScroll = () => {
    const el = ref.current;
    if (!el || el.clientWidth === 0) return;
    setActive(Math.round(el.scrollLeft / el.clientWidth));
  };

  const goTo = (i: number) => ref.current?.scrollTo({ left: i * (ref.current?.clientWidth ?? 0), behavior: 'smooth' });

  return (
    <div data-pager={pages.length > 1 ? 'multi' : 'single'} className={`flex min-h-0 flex-1 flex-col ${className}`}>
      <div
        ref={ref}
        onScroll={onScroll}
        className="flex min-h-0 flex-1 snap-x snap-mandatory overflow-x-auto overflow-y-hidden overscroll-x-contain [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {pages.map((page, i) => (
          <div key={i} className="flex h-full w-full shrink-0 snap-center flex-col">{page}</div>
        ))}
      </div>
      {pages.length > 1 && (
        <div className="flex shrink-0 items-center justify-center gap-1.5 pb-1 pt-2" role="tablist" aria-label={`Página ${active + 1} de ${pages.length}`}>
          {pages.map((_, i) => (
            <button key={i} type="button" role="tab" aria-selected={i === active} aria-label={`Ir a la página ${i + 1}`} onClick={() => goTo(i)}
              className={`h-1.5 rounded-full transition-all duration-300 ${i === active ? 'w-5 bg-white' : 'w-1.5 bg-white/30'}`} />
          ))}
        </div>
      )}
    </div>
  );
}
