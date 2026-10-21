import { getSiteSettings, resumeAllIgThreads, resumeStaleIgThreads, resumeStaleWaThreads, updateSiteSettings } from './db';
import { normalizeInstagramAgentConfig, PERSONAL_HANDOFF_REASON } from '../shared/instagramAgentConfig';

/* Reactivación automática del agente (pedido del dueño, 27/09; 3 horas desde el
 * 21/10): un hilo pausado -- porque la IA lo derivó o porque el dueño contestó
 * a mano -- vuelve solo a tener agente pasadas `autoResumeHours` desde la pausa
 * o desde el último mensaje a mano del dueño, sin tener que prenderlo desde el
 * panel. En Instagram solo quedan sin IA las cuentas de confianza
 * (`noAiAccounts`, las agrega el dueño); en WhatsApp siguen sin reactivarse los
 * chats que la IA marcó como personales.
 *
 * Corre dentro del cron `/api/cron/instagram-followup` (cada 15 min) y
 * cubre Instagram y WhatsApp a la vez: la config de "qué sabe el agente"
 * es una sola para los dos canales. */

export type AgentAutoResumeResult = { instagram: number; whatsapp: number };

export async function runAgentAutoResume(now: Date = new Date()): Promise<AgentAutoResumeResult> {
  const settings = await getSiteSettings();
  let config = normalizeInstagramAgentConfig((settings as any)?.instagramAgentConfig);

  // Una sola vez (pedido del dueño, 21/10): 3 horas y reactivar de una todas
  // las conversaciones pausadas, salvo las cuentas de confianza.
  if (!config.autoResumeMigrated) {
    config = { ...config, autoResumeHours: 3, autoResumeMigrated: true };
    await updateSiteSettings({ instagramAgentConfig: config });
    const instagram = await resumeAllIgThreads(config.noAiAccounts);
    const whatsapp = await resumeStaleWaThreads(now, PERSONAL_HANDOFF_REASON);
    return { instagram, whatsapp };
  }

  if (config.autoResumeHours <= 0) return { instagram: 0, whatsapp: 0 };

  const cutoff = new Date(now.getTime() - config.autoResumeHours * 60 * 60 * 1000);
  const [instagram, whatsapp] = await Promise.all([
    resumeStaleIgThreads(cutoff, null, config.noAiAccounts),
    resumeStaleWaThreads(cutoff, PERSONAL_HANDOFF_REASON),
  ]);
  return { instagram, whatsapp };
}
