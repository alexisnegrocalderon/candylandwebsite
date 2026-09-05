/** Textos editables + interruptores por sección del correo de compra
 * (server/email.ts buildOrderEmail) -- lo edita el dueño desde el admin
 * (sección "Plantillas de correo"), se guarda como JSON en
 * siteSettings.emailTemplateConfig y se lee en cada envío.
 *
 * Alcance deliberadamente acotado a buildOrderEmail: es el único correo de
 * cara al cliente con secciones informativas largas y desacoplables
 * (qué es Mansion Playroom, qué encontrarás, antes de venir, valores,
 * embajador, FAQ) -- los otros correos de cara al cliente (Misión 300,
 * recordatorio de carrito, regalo de trago) son cortos y no tienen
 * secciones equivalentes para apagar. */
export interface OrderEmailConfig {
  sections: {
    quienesSomos: boolean;
    encontraras: boolean;
    antesDeVenir: boolean;
    valores: boolean;
    embajador: boolean;
    faq: boolean;
  };
  /** Párrafo bajo "👋 Hola {nombre}". Admite el placeholder {{evento}}. */
  greetingText: string;
  /** Párrafo de despedida bajo "Nos vemos en {evento}". Admite {{evento}}. */
  farewellText: string;
}

export interface EmailTemplateConfig {
  orderEmail: OrderEmailConfig;
}

export const DEFAULT_ORDER_EMAIL_CONFIG: OrderEmailConfig = {
  sections: {
    quienesSomos: true,
    encontraras: true,
    antesDeVenir: true,
    valores: true,
    embajador: true,
    faq: true,
  },
  greetingText:
    'Tu {{items}} ya está reservado para {{evento}} en Mansion Playroom. 🎉 Prepárate para vivir una noche llena de música, conexión y una experiencia completamente distinta.',
  farewellText:
    'Ya eres parte de esta edición. Nosotros ponemos la música, el ambiente y la experiencia.<br/>Tú solo preocúpate de llegar con ganas de disfrutar.<br/><strong>Equipo Mansion Playroom</strong>',
};

export const DEFAULT_EMAIL_TEMPLATE_CONFIG: EmailTemplateConfig = {
  orderEmail: DEFAULT_ORDER_EMAIL_CONFIG,
};

/** Completa con los valores por defecto cualquier campo faltante -- así una
 * config vieja/parcial guardada antes de agregar un nuevo campo no rompe el
 * envío (nunca queda una sección o texto en `undefined`). */
export function normalizeOrderEmailConfig(partial: Partial<OrderEmailConfig> | null | undefined): OrderEmailConfig {
  return {
    sections: { ...DEFAULT_ORDER_EMAIL_CONFIG.sections, ...(partial?.sections ?? {}) },
    greetingText: partial?.greetingText || DEFAULT_ORDER_EMAIL_CONFIG.greetingText,
    farewellText: partial?.farewellText || DEFAULT_ORDER_EMAIL_CONFIG.farewellText,
  };
}

export function normalizeEmailTemplateConfig(raw: unknown): EmailTemplateConfig {
  const partial = (raw && typeof raw === 'object' ? raw : {}) as Partial<EmailTemplateConfig>;
  return {
    orderEmail: normalizeOrderEmailConfig(partial.orderEmail),
  };
}

export function fillPlaceholders(text: string, vars: Record<string, string>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (match, key) => vars[key] ?? match);
}
