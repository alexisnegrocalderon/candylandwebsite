import { Bot } from 'lucide-react';
import { trpc } from '@/lib/trpc';

/** Tarjeta del agente de IA en Inicio: si contesta solo, cuántas conversaciones esperan al equipo y un toque para abrirlo. */
export function AgentCard({ waiting, onOpen }: { waiting: number; onOpen: (sectionId: string) => void }) {
  const { data: ig } = trpc.instagram.getConfig.useQuery(undefined, { retry: false, staleTime: 60_000 });
  const { data: wa } = trpc.whatsapp.getConfig.useQuery(undefined, { retry: false, staleTime: 60_000 });
  const channels = [
    { label: 'Instagram', on: !!ig?.enabled },
    { label: 'WhatsApp', on: !!wa?.enabled },
  ];
  return (
    <section className="admin-clay flex flex-wrap items-center gap-x-4 gap-y-3 p-4 md:p-5">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/15 text-primary"><Bot className="h-5 w-5" /></span>
      <div className="min-w-0 flex-1">
        <p className="font-heading text-lg leading-tight">Agente IA</p>
        <p className="flex flex-wrap gap-x-3 text-sm text-muted-foreground">
          {channels.map((c) => (
            <span key={c.label} className="inline-flex items-center gap-1.5">
              <span className={`h-2 w-2 rounded-full ${c.on ? 'bg-emerald-400' : 'bg-white/25'}`} aria-hidden />
              {c.label}: {c.on ? 'contesta solo' : c.label === 'WhatsApp' ? 'no activo' : 'apagado'}
            </span>
          ))}
        </p>
      </div>
      <button type="button" onClick={() => onOpen('instagram')}
        className={`rounded-full px-3 py-1.5 text-sm font-medium ${waiting > 0 ? 'bg-amber-500/20 text-amber-300' : 'bg-white/5 text-muted-foreground'}`}>
        {waiting > 0 ? `${waiting} ${waiting === 1 ? 'conversación espera' : 'conversaciones esperan'} al equipo` : 'Nadie esperando al equipo'}
      </button>
      <button type="button" onClick={() => onOpen('agente-conocimiento')} className="rounded-full bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground">Abrir agente</button>
    </section>
  );
}
