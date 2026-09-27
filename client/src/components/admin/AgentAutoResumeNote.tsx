import { trpc } from '@/lib/trpc';
import { formatChileDateTime } from '@shared/chileDate';
import { PERSONAL_HANDOFF_REASON } from '@shared/instagramAgentConfig';

/** "Se reactiva sola el ..." debajo de "Bot pausado", para que el dueño sepa
 * cuándo vuelve el agente a ese chat sin tener que prenderlo (ver
 * server/agentAutoResume.ts). Sirve para Instagram y WhatsApp: la config de
 * horas es una sola. */
export function AgentAutoResumeNote({ botPausedAt, handoffReason }: { botPausedAt: Date | string | null; handoffReason: string | null }) {
  const { data: config } = trpc.instagram.getConfig.useQuery();
  if (!config) return null;

  if (handoffReason === PERSONAL_HANDOFF_REASON) {
    return <p className="text-xs text-muted-foreground mt-0.5">Chat personal: no se reactiva solo.</p>;
  }
  if (config.autoResumeHours <= 0 || !botPausedAt) return null;

  const resumeAt = new Date(new Date(botPausedAt).getTime() + config.autoResumeHours * 60 * 60 * 1000);
  return <p className="text-xs text-muted-foreground mt-0.5">Se reactiva solo el {formatChileDateTime(resumeAt)} (si no le vuelves a escribir antes).</p>;
}
