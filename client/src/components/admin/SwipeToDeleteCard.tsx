import { useRef, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { ConfirmDeleteButton } from './ConfirmDeleteButton';

const REVEAL_WIDTH = 96;

/** Tarjeta con swipe-to-delete para listas en iPhone (donde una tabla no
 * cabe y una fila se vuelve tarjeta) -- deslizar hacia la izquierda revela
 * un botón rojo "Eliminar" que hay que TOCAR; el swipe solo lo destapa,
 * nunca borra solo. Dispara el mismo diálogo de confirmación con clave de
 * admin de siempre (`ConfirmDeleteButton`), no uno nuevo.
 *
 * Pedido explícito del dueño: en computador (sin touch) no hace falta
 * poder borrar desde la fila -- por eso esto solo se monta en la vista de
 * tarjetas de iPhone, nunca en la tabla de escritorio/iPad. */
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
  const startX = useRef<number | null>(null);
  const startY = useRef<number | null>(null);
  // null = todavía no se sabe si el dedo va horizontal o vertical (los
  // primeros px deciden); una vez decidido no cambia hasta soltar, para que
  // un swipe real no se corte a mitad de camino por un tembleque del dedo.
  const horizontalLock = useRef<boolean | null>(null);

  const onTouchStart = (e: React.TouchEvent) => {
    startX.current = e.touches[0].clientX;
    startY.current = e.touches[0].clientY;
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
    setSwipeX(deltaX > 0 ? 0 : Math.max(deltaX, -REVEAL_WIDTH));
  };
  const onTouchEnd = () => {
    setDragging(false);
    if (horizontalLock.current) {
      setSwipeX((x) => (x < -REVEAL_WIDTH / 2 ? -REVEAL_WIDTH : 0));
    }
    horizontalLock.current = null;
  };

  return (
    <div className={`relative overflow-hidden rounded-[var(--admin-radius-sm)] shadow-[var(--admin-shadow-clay-sm)] ${className}`}>
      <div
        className="absolute inset-y-0 right-0 flex items-center justify-center bg-[var(--admin-danger-text)]"
        style={{ width: REVEAL_WIDTH }}
      >
        <ConfirmDeleteButton
          description={deleteDescription}
          onConfirm={onDelete}
          disabled={deleteDisabled}
          className="flex h-full w-full flex-col items-center justify-center gap-1 text-xs font-semibold text-white disabled:opacity-40"
        >
          <Trash2 className="w-5 h-5" />
          Eliminar
        </ConfirmDeleteButton>
      </div>
      <div
        className="relative bg-white touch-pan-y"
        style={{ transform: `translateX(${swipeX}px)`, transition: dragging ? 'none' : 'transform 150ms ease' }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        {children}
      </div>
    </div>
  );
}
