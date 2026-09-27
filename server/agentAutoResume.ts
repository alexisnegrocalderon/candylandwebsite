import { getSiteSettings, resumeStaleIgThreads, resumeStaleWaThreads } from './db';
import { normalizeInstagramAgentConfig, PERSONAL_HANDOFF_REASON } from '../shared/instagramAgentConfig';

/* Reactivación automática del agente (pedido del dueño, 27/09): un hilo
 * pausado -- porque la IA lo derivó o porque el dueño contestó a mano --
 * vuelve solo a tener agente pasadas `autoResumeHours` (24 por defecto)
 * desde la pausa o desde el último mensaje a mano del dueño, sin tener que
 * prenderlo desde el panel. Los chats marcados como personales (amigos del
 * dueño) NO se reactivan: el bot no le habla como empresa a un amigo.
 *
 * Corre dentro del cron `/api/cron/instagram-followup` (cada 15 min) y
 * cubre Instagram y WhatsApp a la vez: la config de "qué sabe el agente"
 * es una sola para los dos canales. */

export type AgentAutoResumeResult = { instagram: number; whatsapp: number };

export async function runAgentAutoResume(now: Date = new Date()): Promise<AgentAutoResumeResult> {
  const settings = await getSiteSettings();
  const config = normalizeInstagramAgentConfig((settings as any)?.instagramAgentConfig);
  if (config.autoResumeHours <= 0) return { instagram: 0, whatsapp: 0 };

  const cutoff = new Date(now.getTime() - config.autoResumeHours * 60 * 60 * 1000);
  const [instagram, whatsapp] = await Promise.all([
    resumeStaleIgThreads(cutoff, PERSONAL_HANDOFF_REASON),
    resumeStaleWaThreads(cutoff, PERSONAL_HANDOFF_REASON),
  ]);
  return { instagram, whatsapp };
}
