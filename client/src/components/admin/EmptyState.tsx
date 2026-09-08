import type { LucideIcon } from 'lucide-react';
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription, EmptyContent, EmptyMedia } from '@/components/ui/empty';

/** Reemplaza los "no hay nada" mudos o los "Cargando…" sueltos de cada
 * sección por un estado consistente, con ícono + explicación. */
export function EmptyState({ icon: Icon, title, description, action, className = '' }: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <Empty className={`admin-clay-sm border-0 ${className}`}>
      <EmptyHeader>
        <EmptyMedia variant="icon"><Icon className="w-5 h-5" /></EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        {description && <EmptyDescription>{description}</EmptyDescription>}
      </EmptyHeader>
      {action && <EmptyContent>{action}</EmptyContent>}
    </Empty>
  );
}
