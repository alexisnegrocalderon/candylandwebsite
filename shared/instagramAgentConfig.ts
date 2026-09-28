/** Config del agente de IA que contesta los mensajes directos del Instagram
 * de la productora -- lo edita el dueño desde Ajustes, se guarda como JSON en
 * `siteSettings.instagramAgentConfig`.
 *
 * Arranca APAGADO a propósito: desplegar este código no debe empezar a
 * contestarle a la gente solo (mismo criterio que `foundersPromoEnabled` y
 * `adminAlertsConfig`). Prenderlo es una decisión explícita, tomada recién
 * cuando los datos del evento en curso están al día -- el agente contesta con
 * lo que haya en la base, así que un evento mal cargado se convierte en una
 * respuesta mal dada en el Instagram público.
 *
 * Por qué los textos viven acá y no dentro del prompt en el servidor: el tono
 * de la marca y las respuestas a las preguntas de siempre (dress code, edad,
 * cómo llegar) cambian bastante más seguido que el código, y cada cambio no
 * puede depender de un deploy. Lo que NO es editable son las reglas duras del
 * prompt (no inventar precios, no hablar de otros clientes, derivar a humano)
 * -- esas viven en server/instagramAgent.ts justamente para que no se puedan
 * apagar desde el panel. */
export interface InstagramAgentConfig {
  /** Interruptor maestro. Apagado = el webhook sigue guardando los mensajes
   * en la bandeja del admin, pero no responde nada. */
  enabled: boolean;
  /** Contexto de marca y respuestas a las preguntas frecuentes, en texto
   * libre. Se le entrega al modelo como verdad de la casa, junto con los
   * datos reales de eventos y entradas que salen de la base. */
  brandNotes: string;
  /** Lo que se manda cuando el agente decide derivar a una persona (o cuando
   * falla la IA). Tiene que ser una frase que se pueda decir SIEMPRE, sin
   * importar la pregunta. */
  handoffMessage: string;
  /** Tope de mensajes del historial que se le pasan al modelo. Más historial
   * = respuestas más coherentes pero más caras y más lentas; el webhook de
   * Meta espera una respuesta rápida. */
  historyLimit: number;
  /** Tope de respuestas automáticas por hilo por día. Es el freno de mano
   * ante un bucle o alguien jugando con el bot: pasado el tope, el hilo
   * queda para una persona. */
  dailyReplyLimitPerThread: number;
  /** Ejemplos reales de cómo escribe el dueño (texto libre, opcional), para
   * que el modelo imite ESE tono en vez de uno genérico. Vacío por defecto:
   * sin ejemplos, el agente sigue solo las reglas de "CÓMO ESCRIBIR" ya
   * hardcodeadas en server/instagramAgent.ts. */
  styleExamples: string;
  /** Interruptor del recordatorio de cierre por silencio (pedido explícito
   * del dueño, 17/09): si la persona no vuelve a escribir pasados
   * `followUpMinutes` desde la última respuesta del bot, se le manda UN
   * único mensaje de cierre con el link del sitio -- ver
   * server/instagramFollowUp.ts. Solo tiene efecto si `enabled` también
   * está prendido. */
  followUpEnabled: boolean;
  /** Minutos de silencio antes de mandar el recordatorio de cierre. */
  followUpMinutes: number;
  /** El recordatorio en sí -- fijo, no lo genera la IA (a diferencia del
   * cierre de "última respuesta del tope diario" en
   * server/instagramAgent.ts, este no depende de ninguna conversación en
   * curso: lo dispara un cron sin ningún mensaje nuevo que darle de contexto
   * al modelo). */
  followUpMessage: string;
  /** Lo que se manda cuando el mensaje que llega es SOLO un agradecimiento
   * por lo ya conversado ("muchas gracias", sin ninguna pregunta nueva) --
   * pedido explícito del dueño: eso no se deriva ni pausa el bot, se contesta
   * con este texto fijo (igual que handoffMessage, la IA solo detecta el
   * caso, nunca genera las palabras). */
  thanksMessage: string;
  /** Horas después de pausarse (o del último mensaje a mano del dueño) en
   * que un hilo vuelve solo a tener agente -- pedido del dueño, 27/09. Los
   * hilos marcados como personales NO se reactivan. 0 = apagado. */
  autoResumeHours: number;
  /** Guía de ventas del dueño (texto libre): tipos de cliente y cómo
   * abordar a cada uno, y las objeciones típicas con cómo responderlas. Se
   * le pasa al modelo junto al contexto de marca. */
  salesPlaybook: string;
  /** Coach semanal: los lunes a las 10:00 (Chile) la IA revisa las
   * conversaciones de la semana y manda un reporte por correo al dueño
   * (server/agentCoach.ts). Prendido por defecto. */
  coachWeeklyEnabled: boolean;
}

export const DEFAULT_INSTAGRAM_AGENT_CONFIG: InstagramAgentConfig = {
  enabled: false,
  brandNotes: [
    'Mansion Playroom es una productora de fiestas liberales en Valparaíso / Viña del Mar, Chile.',
    'Tono: cercano, chileno, breve y respetuoso. Nada de doble sentido explícito ni lenguaje sexual en los mensajes.',
    'Entrada solo mayores de 18 años, con carnet. La lista y los datos de quienes asisten son privados.',
    'Las entradas se compran únicamente en mansionplayroom.cl -- no se reservan por Instagram ni se venden por transferencia.',
    'La dirección exacta del local se envía por correo junto con la entrada, después de comprar.',
  ].join('\n'),
  handoffMessage: 'Te respondo esto con más calma en un rato, que lo vea alguien del equipo 💜',
  historyLimit: 12,
  dailyReplyLimitPerThread: 30,
  styleExamples: '',
  followUpEnabled: true,
  followUpMinutes: 120,
  // Sin URL a propósito: el recordatorio va con el botón de compra abajo.
  followUpMessage: 'Cuando quieras retomamos 💜 mientras tanto puedes ver fechas y entradas acá abajo 👇',
  thanksMessage: 'Un gusto y cualquier otra cosa que necesites estamos aquí para poder ayudar',
  autoResumeHours: 24,
  coachWeeklyEnabled: true,
  salesPlaybook: [
    'TIPOS DE CLIENTE Y CÓMO ACOMPAÑAR A CADA UNO:',
    '- Primera vez, con nervios o dudas: mucha calidez y cero presión. Contarle que es un espacio seguro, con reglas claras de consentimiento, y que nadie hace nada que no quiera. Ofrecerle la guía de primera vez.',
    '- Pareja curiosa: hablarles en plural, que se sientan bienvenidos juntos. Destacar la experiencia compartida y el acceso Dúo si está en los datos.',
    '- Soltera o soltero: que se sienta cómoda/o yendo sola/o, que mucha gente llega así y conoce gente adentro.',
    '- Grupo de amigos: entusiasmo, que la pasen increíble juntos, preguntar cuántos son para darles el precio justo.',
    '- Cliente que ya vino: tratarlo como de la casa, "¡qué bueno tenerte de vuelta!", contarle qué trae de nuevo esta fecha.',
    '- Curioso sin apuro: dar la info justa, dejar la puerta abierta y cerrar con una pregunta suave, sin empujar.',
    '',
    'OBJECIONES TÍPICAS:',
    '- "Está caro": mostrar todo lo que incluye y que el precio de esta tanda es el más bajo que va a tener (si los datos dicen que sube).',
    '- "Me da vergüenza / no sé si es para mí": normalizarlo, contar que es súper común la primera vez y que el ambiente es respetuoso.',
    '- "No sé qué ponerme": el disfraz no tiene que ser profesional; ofrecer las ideas de disfraz.',
    '- "¿Es seguro?": reglas claras, consentimiento siempre, equipo atento durante toda la fiesta.',
    '- "Lo voy a pensar": respetarlo, recordar al pasar si el precio sube pronto, y dejarle el botón para cuando se decida.',
  ].join('\n'),
};

/** Completa con los valores por defecto cualquier campo faltante -- una
 * config vieja o parcial nunca deja un interruptor en `undefined` (que en un
 * `if` se comporta distinto a `false` al volver de un JSON). */
export function normalizeInstagramAgentConfig(raw: unknown): InstagramAgentConfig {
  const partial = (raw && typeof raw === 'object' ? raw : {}) as Partial<InstagramAgentConfig>;
  const historyLimit = Number(partial.historyLimit);
  const dailyLimit = Number(partial.dailyReplyLimitPerThread);
  const followUpMinutes = Number(partial.followUpMinutes);
  return {
    enabled: partial.enabled === true,
    brandNotes: typeof partial.brandNotes === 'string' && partial.brandNotes.trim().length > 0
      ? partial.brandNotes
      : DEFAULT_INSTAGRAM_AGENT_CONFIG.brandNotes,
    handoffMessage: typeof partial.handoffMessage === 'string' && partial.handoffMessage.trim().length > 0
      ? partial.handoffMessage
      : DEFAULT_INSTAGRAM_AGENT_CONFIG.handoffMessage,
    historyLimit: Number.isFinite(historyLimit) && historyLimit > 0
      ? Math.min(Math.floor(historyLimit), 40)
      : DEFAULT_INSTAGRAM_AGENT_CONFIG.historyLimit,
    dailyReplyLimitPerThread: Number.isFinite(dailyLimit) && dailyLimit > 0
      ? Math.min(Math.floor(dailyLimit), 200)
      : DEFAULT_INSTAGRAM_AGENT_CONFIG.dailyReplyLimitPerThread,
    styleExamples: typeof partial.styleExamples === 'string' ? partial.styleExamples : DEFAULT_INSTAGRAM_AGENT_CONFIG.styleExamples,
    followUpEnabled: partial.followUpEnabled !== false,
    followUpMinutes: Number.isFinite(followUpMinutes) && followUpMinutes > 0
      ? Math.min(Math.floor(followUpMinutes), 1440)
      : DEFAULT_INSTAGRAM_AGENT_CONFIG.followUpMinutes,
    followUpMessage: typeof partial.followUpMessage === 'string' && partial.followUpMessage.trim().length > 0
      ? partial.followUpMessage
      : DEFAULT_INSTAGRAM_AGENT_CONFIG.followUpMessage,
    thanksMessage: typeof partial.thanksMessage === 'string' && partial.thanksMessage.trim().length > 0
      ? partial.thanksMessage
      : DEFAULT_INSTAGRAM_AGENT_CONFIG.thanksMessage,
    salesPlaybook: typeof partial.salesPlaybook === 'string' ? partial.salesPlaybook : DEFAULT_INSTAGRAM_AGENT_CONFIG.salesPlaybook,
    coachWeeklyEnabled: partial.coachWeeklyEnabled !== false,
    autoResumeHours: Number.isFinite(Number(partial.autoResumeHours)) && Number(partial.autoResumeHours) >= 0
      ? Math.min(Math.floor(Number(partial.autoResumeHours)), 720)
      : DEFAULT_INSTAGRAM_AGENT_CONFIG.autoResumeHours,
  };
}

/** Tope duro de caracteres de una respuesta. Instagram corta los mensajes
 * largos y, sobre todo, una respuesta de DM que se lee como un informe no la
 * lee nadie -- el modelo recibe esta misma cifra en el prompt y acá se
 * recorta por si igual se pasa. */
export const IG_MAX_REPLY_CHARS = 600;

/** Motivo de pausa cuando la IA marca un mensaje como personal (chat de un
 * amigo del dueño). Compartido entre Instagram, WhatsApp y la reactivación
 * automática, que justamente NO reactiva estos hilos. */
export const PERSONAL_HANDOFF_REASON = 'La IA lo marcó como mensaje personal, no de cliente';

/** Ventana de mensajería estándar de Meta: fuera de estas 24 horas contadas
 * desde el último mensaje de la persona, la API rechaza el envío salvo con
 * etiquetas especiales que no aplican a este caso. */
export const IG_MESSAGING_WINDOW_MS = 24 * 60 * 60 * 1000;
