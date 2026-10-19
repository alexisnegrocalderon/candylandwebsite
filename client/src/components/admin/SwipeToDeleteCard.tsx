import { useRef, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { ConfirmDeleteButton } from './ConfirmDeleteButton';

const REVEAL_WIDTH = 96;
/** Fracción del ancho de la tarjeta a partir de la cual soltar el dedo abre
 * directo el diálogo de confirmación (swipe largo, como en Mail de iOS). */
const LONG_SWIPE_RATIO = 0.55;
const TRANSITION_MS = 180;

/** Tarjeta con swipe-to-delete para listas en iPhone/iPad (donde una tabla
 * no cabe y una fila se vuelve tarjeta) -- deslizar hacia la izquierda
 * revela un botón rojo "Eliminar" que hay que TOCAR; un swipe largo (más de
 * la mitad de la tarjeta) abre directo el diálogo. Ninguno de los dos borra
 * solo: siempre pasa por el mismo diálogo con clave de admin de siempre
 * (`ConfirmDeleteButton`), no uno nuevo.
 *
 * El panel rojo NO está escondido detrás de la tarjeta: su ancho sigue al
 * dedo y solo ocupa el hueco que la tarjeta deja al correrse. En el tema
 * "vidrio oscuro" el frente es translúcido (`.bg-white` se re-mapea en
 * admin.css), así que un rojo de ancho fijo debajo se veía a través todo el
 * tiempo, incluso en reposo.
 *
 * Pedido explícito del dueño: en computador (sin touch) no hace falta
 * poder borrar desde la fila -- por eso esto solo se monta en la vista de
 * tarjetas táctil, nunca en la tabla de escritorio. */
export function SwipeToDeleteCard({
  children,
  deleteDescription,
  onDelete,
  deleteDisabled,
  className = '',
}: {
  children: React.ReactNode;
  deleteDescription: string;
  onDelete: (adminPassword: string) => void | Promise<unknown>;
  deleteDisabled?: boolean;
  className?: string;
}) {
  const [swipeX, setSwipeX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const startX = useRef<number | null>(null);
  const startY = useRef<number | null>(null);
  // Donde estaba la tarjeta al apoyar el dedo (0 cerrada, -96 abierta), para
  // que arrastrar una ya abierta siga desde ahí en vez de saltar.
  const baseX = useRef(0);
  const cardWidth = useRef(0);
  // null = todavía no se sabe si el dedo va horizontal o vertical (los
  // primeros px deciden); una vez decidido no cambia hasta soltar, para que
  // un swipe real no se corte a mitad de camino por un tembleque del dedo.
  const horizontalLock = useRef<boolean | null>(null);

  const armed = cardWidth.current > 0 && -swipeX >= cardWidth.current * LONG_SWIPE_RATIO;

  const onTouchStart = (e: React.TouchEvent) => {
    startX.current = e.touches[0].clientX;
    startY.current = e.touches[0].clientY;
    baseX.current = swipeX;
    cardWidth.current = containerRef.current?.offsetWidth ?? 0;
    horizontalLock.current = null;
    setDragging(true);
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (startX.current === null || startY.current === null) return;
    const deltaX = e.touches[0].clientX - startX.current;
    const deltaY = e.touches[0].clientY - startY.current;
    if (horizontalLock.current === null && (Math.abs(deltaX) > 6 || Math.abs(deltaY) > 6)) {
      horizontalLock.current = Math.abs(deltaX) > Math.abs(deltaY);
    }
    if (!horizontalLock.current) return; // gesto vertical: se deja scrollear la página normal
    const x = baseX.current + deltaX;
    setSwipeX(Math.min(0, Math.max(x, -cardWidth.current)));
  };
  const onTouchEnd = () => {
    setDragging(false);
    if (horizontalLock.current) {
      if (armed && !deleteDisabled) {
        setSwipeX(-REVEAL_WIDTH);
        setDialogOpen(true);
      } else {
        setSwipeX(swipeX < -REVEAL_WIDTH / 2 ? -REVEAL_WIDTH : 0);
      }
    }
    horizontalLock.current = null;
  };

  const onDialogOpenChange = (open: boolean) => {
    setDialogOpen(open);
    if (!open) setSwipeX(0); // cancelar cierra también el swipe
  };

  const transition = dragging ? 'none' : `${TRANSITION_MS}ms cubic-bezier(0.2, 0.8, 0.2, 1)`;
  const revealed = -swipeX;

  return (
    <div
      ref={containerRef}
      className={`relative overflow-hidden rounded-[var(--admin-radius-sm)] shadow-[var(--admin-shadow-clay-sm)] ${className}`}
    >
      <div
        className="absolute inset-y-0 right-0 overflow-hidden bg-red-600"
        aria-hidden={revealed === 0}
        style={{
          width: revealed,
          transition: dragging ? 'none' : `width ${transition}, visibility 0s linear ${revealed === 0 ? TRANSITION_MS : 0}ms`,
          visibility: revealed === 0 ? 'hidden' : 'visible',
        }}
      >
        <ConfirmDeleteButton
          description={deleteDescription}
          onConfirm={onDelete}
          disabled={deleteDisabled}
          open={dialogOpen}
          onOpenChange={onDialogOpenChange}
          className="absolute inset-0 text-white disabled:opacity-40"
        >
          {/* Ícono + texto en un bloque de 96px: centrado en el hueco mientras
              se revela, y pegado al borde de la tarjeta cuando el swipe largo
              ya va a abrir el diálogo (la señal de "suelta para eliminar"). */}
          <span
            className="absolute inset-y-0 flex flex-col items-center justify-center gap-1 whitespace-nowrap text-xs font-semibold"
            style={{
              width: REVEAL_WIDTH,
              right: armed ? `calc(100% - ${REVEAL_WIDTH}px)` : `max(0px, calc(50% - ${REVEAL_WIDTH / 2}px))`,
              opacity: Math.min(1, revealed / 56),
              transition: `right ${TRANSITION_MS}ms ease`,
            }}
          >
            <Trash2 className="w-5 h-5" />
            Eliminar
          </span>
        </ConfirmDeleteButton>
      </div>
      <div
        className="relative bg-white touch-pan-y dark:bg-[var(--admin-surface-solid)]"
        style={{ transform: `translateX(${swipeX}px)`, transition: dragging ? 'none' : `transform ${transition}` }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchEnd}
      >
        {children}
      </div>
    </div>
  );
}
