import { useState } from 'react';
import { AlertTriangle, CheckCircle2, Info, OctagonAlert } from 'lucide-react';
import type { HomeAlert } from '@shared/homeAlerts';

const TONE = {
  danger: { cls: 'border-red-400/40 bg-red-500/15 text-red-100', icon: OctagonAlert },
  warning: { cls: 'border-amber-400/40 bg-amber-500/15 text-amber-100', icon: AlertTriangle },
  info: { cls: 'border-sky-400/30 bg-sky-500/10 text-sky-100', icon: Info },
} as const;

/** Franja de alertas: lo que necesita acción hoy, de lo más grave a lo menos. */
const COMPACT = 3;

export function AlertsStrip({ alerts, onOpen }: { alerts: HomeAlert[]; onOpen: (section: string) => void }) {
  const [all, setAll] = useState(false);
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
        {alerts.length > COMPACT && (
          <button type="button" onClick={() => setAll((v) => !v)} className="text-xs text-muted-foreground hover:text-foreground">{all ? 'Ver menos' : `+${alerts.length - COMPACT} más`}</button>
        )}
      </div>
      <ul className="flex flex-wrap gap-2">
        {(all ? alerts : alerts.slice(0, COMPACT)).map((a) => {
          const t = TONE[a.level];
          return (
            <li key={a.id} className="max-w-full">
              <button type="button" onClick={() => onOpen(a.section)} className={`flex max-w-full items-center gap-2 rounded-full border px-3 py-1.5 text-left text-xs ${t.cls}`}>
                <t.icon className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{a.text}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
