import { AlertTriangle, CheckCircle2, Info, OctagonAlert } from 'lucide-react';
import type { HomeAlert } from '@shared/homeAlerts';

const TONE = {
  danger: { cls: 'border-red-400/40 bg-red-500/15 text-red-100', icon: OctagonAlert },
  warning: { cls: 'border-amber-400/40 bg-amber-500/15 text-amber-100', icon: AlertTriangle },
  info: { cls: 'border-sky-400/30 bg-sky-500/10 text-sky-100', icon: Info },
} as const;

/** Franja de alertas: lo que necesita acción hoy, de lo más grave a lo menos. */
export function AlertsStrip({ alerts, onOpen }: { alerts: HomeAlert[]; onOpen: (section: string) => void }) {
  if (alerts.length === 0) {
    return (
      <div className="admin-clay flex items-center gap-3 px-4 py-3 text-sm text-muted-foreground">
        <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-300" /> Todo en orden: nada urgente por ahora.
      </div>
    );
  }
  return (
    <section aria-label="Alertas" className="admin-clay p-3 md:p-4">
      <div className="mb-2 flex items-baseline justify-between px-1">
        <h3 className="font-heading text-base">Requiere tu atención</h3>
        <span className="text-xs text-muted-foreground">{alerts.length}</span>
      </div>
      <ul className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] md:flex-wrap md:overflow-visible">
        {alerts.map((a) => {
          const t = TONE[a.level];
          return (
            <li key={a.id} className="shrink-0">
              <button type="button" onClick={() => onOpen(a.section)} className={`flex max-w-[20rem] items-center gap-2 rounded-full border px-3 py-1.5 text-left text-xs md:max-w-none ${t.cls}`}>
                <t.icon className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate md:whitespace-normal">{a.text}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
