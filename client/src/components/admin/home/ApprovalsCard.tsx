import { ArrowRight, Cake, Crown, Handshake, Instagram, UserCheck, type LucideIcon } from 'lucide-react';
import { trpc } from '@/lib/trpc';

/** «Por aprobar»: todo lo que espera un sí o un no, junto en Inicio. Cada fila abre la pantalla donde se decide
 * (el botón de aprobar vive ahí; esto solo evita ir a buscarlo). Si no hay nada, no ocupa espacio. */
const ROWS: { key: 'igComments' | 'ambassadors' | 'birthdays' | 'solteros' | 'coproExpenses'; section: string; icon: LucideIcon; label: (n: number) => string }[] = [
  { key: 'igComments', section: 'instagram', icon: Instagram, label: (n) => `${n} respuesta${n === 1 ? '' : 's'} a comentarios de Instagram por aprobar` },
  { key: 'ambassadors', section: 'ambassadors', icon: Crown, label: (n) => `${n} postulación${n === 1 ? '' : 'es'} a embajador` },
  { key: 'solteros', section: 'solteros', icon: UserCheck, label: (n) => `${n} solicitud${n === 1 ? '' : 'es'} de solteros` },
  { key: 'birthdays', section: 'birthdays', icon: Cake, label: (n) => `${n} solicitud${n === 1 ? '' : 'es'} de cumpleaños` },
  { key: 'coproExpenses', section: 'copro-gastos', icon: Handshake, label: (n) => `${n} gasto${n === 1 ? '' : 's'} de Dalmore por aprobar` },
];

export function ApprovalsCard({ enabled, onOpen }: { enabled: boolean; onOpen: (section: string) => void }) {
  const { data } = trpc.adminBadges.pending.useQuery(undefined, { enabled, refetchInterval: 60_000, refetchIntervalInBackground: false });
  const rows = ROWS.filter((r) => (data?.[r.key] ?? 0) > 0);
  if (rows.length === 0) return null;
  const total = rows.reduce((sum, r) => sum + (data?.[r.key] ?? 0), 0);
  return (
    <section aria-label="Por aprobar" className="admin-clay p-3 md:p-4">
      <div className="mb-2 flex items-baseline justify-between px-1">
        <h3 className="font-heading text-base">Por aprobar</h3>
        <span className="admin-badge">{total > 99 ? '99+' : total}</span>
      </div>
      <ul className="space-y-1.5">
        {rows.map((r) => (
          <li key={r.key}>
            <button type="button" onClick={() => onOpen(r.section)} className="admin-tab flex min-h-12 w-full items-center gap-3 rounded-2xl px-3.5 py-3 text-left text-sm">
              <r.icon className="h-4 w-4 shrink-0 text-primary" />
              <span className="flex-1">{r.label(data![r.key])}</span>
              <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
