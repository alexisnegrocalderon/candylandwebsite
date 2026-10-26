import { useRef, useState, type ReactNode } from 'react';
import { isAtScrollEnd, shouldChainToNextTab } from '@shared/cardSwipe';

/* Las tarjetas de la PlayCard, una por página, que se deslizan de lado (scroll nativo con snap, como `Pager`).
 * Encadenado: ya en la última tarjeta, un deslizar más hacia la izquierda pasa a la pestaña siguiente
 * (`onNextTab`); en la primera, deslizar a la derecha no hace nada. Con varias tarjetas lleva `data-pager="multi"`,
 * que le dice al deslizar de pestañas de «Mi cuenta» que acá el gesto es de las tarjetas. */

const MAX_DOTS = 7;

export function CardCarousel({ cards, onNextTab, onActive }: { cards: ReactNode[]; onNextTab?: () => void; onActive?: (i: number) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const touch = useRef<{ x: number; y: number; atEnd: boolean } | null>(null);
  const [active, setActive] = useState(0);
  const many = cards.length > 1;

  const onScroll = () => {
    const el = ref.current;
    if (!el || el.clientWidth === 0) return;
    const i = Math.round(el.scrollLeft / el.clientWidth);
    if (i !== active) { setActive(i); onActive?.(i); }
  };
  const goTo = (i: number) => ref.current?.scrollTo({ left: i * (ref.current?.clientWidth ?? 0), behavior: 'smooth' });

  const onTouchStart = (e: React.TouchEvent) => {
    const el = ref.current;
    const p = e.touches[0];
    touch.current = { x: p.clientX, y: p.clientY, atEnd: !!el && isAtScrollEnd(el.scrollLeft, el.clientWidth, el.scrollWidth) };
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    const start = touch.current; touch.current = null;
    if (!start || !onNextTab) return;
    const p = e.changedTouches[0];
    if (shouldChainToNextTab({ dx: p.clientX - start.x, dy: p.clientY - start.y, atEndAtStart: start.atEnd })) onNextTab();
  };

  return (
    <div data-pager={many ? 'multi' : 'single'} className="flex min-h-0 flex-1 flex-col">
      <div
        ref={ref}
        onScroll={onScroll}
        onTouchStart={many ? onTouchStart : undefined}
        onTouchEnd={many ? onTouchEnd : undefined}
        className="-mx-4 flex min-h-0 flex-1 snap-x snap-mandatory overflow-x-auto overflow-y-hidden overscroll-x-contain [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {cards.map((card, i) => (
          <div key={i} className="flex h-full w-full shrink-0 snap-center snap-always flex-col px-4">{card}</div>
        ))}
      </div>
      {many && (
        <div className="flex shrink-0 items-center justify-center gap-1.5 pb-1 pt-2" role="tablist" aria-label={`Tarjeta ${active + 1} de ${cards.length}`}>
          {cards.length > MAX_DOTS ? (
            <span className="text-footnote font-semibold tabular-nums text-white/70">{active + 1} / {cards.length}</span>
          ) : cards.map((_, i) => (
            <button key={i} type="button" role="tab" aria-selected={i === active} aria-label={`Ir a la tarjeta ${i + 1}`} onClick={() => goTo(i)}
              className={`h-1.5 rounded-full transition-all duration-300 ${i === active ? 'w-5 bg-white' : 'w-1.5 bg-white/30'}`} />
          ))}
        </div>
      )}
    </div>
  );
}
