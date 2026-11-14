/** Config del agente de WhatsApp (server/whatsapp.ts), guardada como JSON en
 * siteSettings.whatsappAgentConfig.
 *
 * Solo lo PROPIO del canal. Lo que el agente sabe y cómo habla (notas de
 * marca, ejemplos de tono, mensaje de derivación, mensaje de "gracias",
 * largo del historial) vive en la config de Instagram
 * (shared/instagramAgentConfig.ts) y se comparte: un solo lugar donde el
 * dueño edita el conocimiento, dos canales que contestan igual. */
export interface WhatsAppAgentConfig {
  /** Interruptor maestro, independiente del de Instagram. Apagado = los
   * mensajes igual llegan a la bandeja, nadie recibe respuesta automática. */
  enabled: boolean;
  /** Menú de bienvenida con botones ("Próximas fechas", "Precios", "Hablar
   * con alguien") en el primer mensaje de un hilo nuevo. */
  welcomeMenuEnabled: boolean;
  /** Texto que acompaña los botones del menú de bienvenida. */
  welcomeMessage: string;
  /** Tope de respuestas automáticas por hilo por día (freno ante bucles). */
  dailyReplyLimitPerThread: number;
  /** Recordatorio de cierre por silencio, mismo mecanismo que Instagram. */
  followUpEnabled: boolean;
  followUpMinutes: number;
  followUpMessage: string;
}

export const DEFAULT_WHATSAPP_AGENT_CONFIG: WhatsAppAgentConfig = {
  enabled: false,
  welcomeMenuEnabled: true,
  welcomeMessage: '¡Hola! 💜 Qué bueno tenerte en Mansion Playroom. ¿En qué te ayudo? Toca una opción o escríbeme tu pregunta.',
  dailyReplyLimitPerThread: 30,
  followUpEnabled: true,
  followUpMinutes: 120,
  // Sin URL a propósito: el recordatorio va con el botón de compra abajo.
  followUpMessage: 'Aquí sigo cuando quieras retomar ✨ Te dejo acá abajo las fechas y entradas 👇',
};

/** Los textos por defecto de antes de la Srta. Playroom: si siguen tal cual, pasan a los nuevos. */
const LEGACY: Record<'welcomeMessage' | 'followUpMessage', string> = {
  welcomeMessage: '¡Hola! 💜 Te escribe Mansion Playroom. ¿En qué te puedo ayudar? Toca una opción o escríbeme tu pregunta.',
  followUpMessage: 'Cuando quieras retomamos 💜 mientras tanto puedes ver fechas y entradas acá abajo 👇',
};
function fixedText(key: 'welcomeMessage' | 'followUpMessage', raw: unknown): string {
  return typeof raw === 'string' && raw.trim().length > 0 && raw.trim() !== LEGACY[key] ? raw : DEFAULT_WHATSAPP_AGENT_CONFIG[key];
}

/** Completa con los valores por defecto cualquier campo faltante -- mismo
 * criterio que normalizeInstagramAgentConfig. */
export function normalizeWhatsAppAgentConfig(raw: unknown): WhatsAppAgentConfig {
  const partial = (raw && typeof raw === 'object' ? raw : {}) as Partial<WhatsAppAgentConfig>;
  const dailyLimit = Number(partial.dailyReplyLimitPerThread);
  const followUpMinutes = Number(partial.followUpMinutes);
  return {
    enabled: partial.enabled === true,
    welcomeMenuEnabled: partial.welcomeMenuEnabled !== false,
    welcomeMessage: fixedText('welcomeMessage', partial.welcomeMessage),
    dailyReplyLimitPerThread: Number.isFinite(dailyLimit) && dailyLimit > 0
      ? Math.min(Math.floor(dailyLimit), 200)
      : DEFAULT_WHATSAPP_AGENT_CONFIG.dailyReplyLimitPerThread,
    followUpEnabled: partial.followUpEnabled !== false,
    followUpMinutes: Number.isFinite(followUpMinutes) && followUpMinutes > 0
      ? Math.min(Math.floor(followUpMinutes), 1440)
      : DEFAULT_WHATSAPP_AGENT_CONFIG.followUpMinutes,
    followUpMessage: fixedText('followUpMessage', partial.followUpMessage),
  };
}

/** Tope de caracteres de un mensaje de texto que escribimos nosotros. Meta
 * acepta 4096, pero un chat de venta que se lee como un informe no lo lee
 * nadie -- mismo tope que Instagram. */
export const WA_MAX_REPLY_CHARS = 600;
