import type { LucideIcon } from 'lucide-react';

/** Evolución de `StatCard`: paleta semántica por tipo de dato (en vez de un
 * color libre inventado por cada pantalla) + acabado clay/glass del
 * rediseño. El número queda como protagonista, el ícono como acento chico —
 * no como bloque de color grande. `size="lg"` es para la tesela "héroe" de
 * un `BentoGrid`. */
const TONE_GRADIENT: Record<string, string> = {
  revenue: 'from-[oklch(0.70_0.19_340)] to-[oklch(0.74_0.16_360)]',
  count: 'from-[oklch(0.74_0.13_220)] to-[oklch(0.70_0.14_240)]',
  success: 'from-[oklch(0.75_0.15_150)] to-[oklch(0.72_0.14_170)]',
  alert: 'from-[oklch(0.75_0.16_60)] to-[oklch(0.70_0.18_40)]',
  danger: 'from-[oklch(0.65_0.20_25)] to-[oklch(0.60_0.21_15)]',
};

export function StatTile({
  icon: Icon,
  value,
  label,
  tone = 'count',
  size = 'md',
  className = '',
}: {
  icon: LucideIcon;
  value: string | number;
  label: string;
  tone?: 'revenue' | 'count' | 'success' | 'alert' | 'danger';
  size?: 'md' | 'lg';
  className?: string;
}) {
  return (
    <div className={`admin-clay flex flex-col items-start justify-start gap-3 p-5 ${className}`}>
      <div className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${TONE_GRADIENT[tone]} flex items-center justify-center shrink-0 shadow-sm`}>
        <Icon className="w-6 h-6 text-white" />
      </div>
      <div>
        <p className={`font-heading leading-none tabular-nums ${size === 'lg' ? 'text-4xl' : 'text-3xl'}`}>{value}</p>
        <p className="text-[var(--admin-muted)] text-sm mt-1.5">{label}</p>
      </div>
    </div>
  );
}
