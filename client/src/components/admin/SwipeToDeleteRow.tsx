import { Children, cloneElement, isValidElement, useRef, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { ConfirmDeleteButton } from './ConfirmDeleteButton';
import { useCoarsePointer } from '@/hooks/useCoarsePointer';

const REVEAL_WIDTH = 96;

/** Versión de `SwipeToDeleteCard` para una fila de tabla real (iPad, que
 * sigue mostrando la tabla en vez de tarjetas -- solo iPhone usa
 * `SwipeToDeleteCard`). Detecta táctil con `useCoarsePointer` en vez de un
 * ancho de pantalla: en mouse/escritorio real esto renderiza la fila tal
 * cual, sin ningún rastro de swipe ni de borrar (pedido explícito del
 * dueño), y en iPad (pantalla grande pero táctil) el swipe funciona igual
 * que en la tarjeta de iPhone.
 *
 * `children` deben ser los `<td>` de siempre de la fila -- se clonan para
 * inyectarles el desplazamiento, así no hace falta envolverlos en nada (un
 * `<tr>` solo puede tener `<td>`/`<th>` como hijos directos). */
export function SwipeToDeleteRow({
  children,
  className = '',
  deleteDescription,
  onDelete,
  deleteDisabled,
}: {
  children: React.ReactNode;
  className?: string;
  deleteDescription: string;
  onDelete: (adminPassword: string) => void | Promise<unknown>;
  deleteDisabled?: boolean;
}) {
  const coarse = useCoarsePointer();
  const [swipeX, setSwipeX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const startX = useRef<number | null>(null);
  const startY = useRef<number | null>(null);
  const horizontalLock = useRef<boolean | null>(null);

  if (!coarse) {
    return <tr className={className}>{children}</tr>;
  }

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
    if (!horizontalLock.current) return;
    setSwipeX(deltaX > 0 ? 0 : Math.max(deltaX, -REVEAL_WIDTH));
  };
  const onTouchEnd = () => {
    setDragging(false);
    if (horizontalLock.current) {
      setSwipeX((x) => (x < -REVEAL_WIDTH / 2 ? -REVEAL_WIDTH : 0));
    }
    horizontalLock.current = null;
  };

  const cellStyle: React.CSSProperties = {
    transform: `translateX(${swipeX}px)`,
    transition: dragging ? 'none' : 'transform 150ms ease',
    position: 'relative',
    zIndex: 1,
    background: 'white',
  };

  return (
    <tr
      className={`relative touch-pan-y ${className}`}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      {Children.map(children, (child) =>
        isValidElement(child)
          ? cloneElement(child as React.ReactElement<{ style?: React.CSSProperties }>, {
              style: { ...(child.props as any).style, ...cellStyle },
            })
          : child
      )}
      <td
        className="p-0"
        style={{ position: 'absolute', top: 0, bottom: 0, right: 0, width: REVEAL_WIDTH, zIndex: 0 }}
      >
        <ConfirmDeleteButton
          description={deleteDescription}
          onConfirm={onDelete}
          disabled={deleteDisabled}
          className="flex h-full w-full flex-col items-center justify-center gap-1 bg-[var(--admin-danger-text)] text-xs font-semibold text-white disabled:opacity-40"
        >
          <Trash2 className="w-5 h-5" />
          Eliminar
        </ConfirmDeleteButton>
      </td>
    </tr>
  );
}
