import { CheckCircle2, Clock, XCircle, RotateCcw, HelpCircle } from 'lucide-react';

/** Traduce un estado crudo (hoy impreso tal cual en inglés, ej.
 * "approved"/"pending") a una pastilla en español con color + ícono —
 * el ícono importa tanto como el color para alguien con poca luz o
 * dificultad para distinguir tonos parecidos (ver plan de rediseño). */
const STATUS_MAP: Record<string, { label: string; tone: 'success' | 'warning' | 'danger'; icon: typeof CheckCircle2 }> = {
  approved: { label: 'Aprobado', tone: 'success', icon: CheckCircle2 },
  pending: { label: 'Pendiente', tone: 'warning', icon: Clock },
  rejected: { label: 'Rechazado', tone: 'danger', icon: XCircle },
  refunded: { label: 'Reembolsado', tone: 'danger', icon: RotateCcw },
  active: { label: 'Activo', tone: 'success', icon: CheckCircle2 },
  inactive: { label: 'Inactivo', tone: 'danger', icon: XCircle },
};

const TONE_CLASSES: Record<'success' | 'warning' | 'danger', string> = {
  success: 'bg-[var(--admin-success-bg)] text-[var(--admin-success-text)]',
  warning: 'bg-[var(--admin-warning-bg)] text-[var(--admin-warning-text)]',
  danger: 'bg-[var(--admin-danger-bg)] text-[var(--admin-danger-text)]',
};

export function StatusBadge({ status }: { status: string }) {
  const meta = STATUS_MAP[status] ?? { label: status, tone: 'danger' as const, icon: HelpCircle };
  const Icon = meta.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold whitespace-nowrap ${TONE_CLASSES[meta.tone]}`}>
      <Icon className="w-3.5 h-3.5 shrink-0" />
      {meta.label}
    </span>
  );
}
