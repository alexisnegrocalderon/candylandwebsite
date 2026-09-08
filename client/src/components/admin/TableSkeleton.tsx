import { Skeleton } from '@/components/ui/skeleton';

/** Reemplaza los "Cargando…" de texto suelto mientras una tabla espera su
 * primera respuesta -- misma forma aproximada de la tabla real para que no
 * haya un salto brusco de layout cuando llegan los datos. */
export function TableSkeleton({ rows = 5, className = '' }: { rows?: number; className?: string }) {
  return (
    <div className={`space-y-3 ${className}`}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-4">
          <Skeleton className="h-10 w-10 rounded-xl shrink-0" />
          <Skeleton className="h-4 flex-1 max-w-[220px]" />
          <Skeleton className="h-4 w-20 hidden sm:block" />
          <Skeleton className="h-6 w-24 rounded-full hidden md:block" />
          <Skeleton className="h-4 w-16 hidden lg:block" />
        </div>
      ))}
    </div>
  );
}
