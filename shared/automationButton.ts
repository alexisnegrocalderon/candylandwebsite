/* Botón debajo del mensaje de una automatización de Instagram
 * (server/instagramAutomations.ts → resolveAutomationButton). */

export const AUTOMATION_BUTTON_KINDS = ['none', 'event', 'page', 'custom'] as const;
export type AutomationButtonKind = (typeof AUTOMATION_BUTTON_KINDS)[number];

/** Meta corta el título de un botón a 20 caracteres. */
export const AUTOMATION_BUTTON_TITLE_MAX = 20;

/** Un link propio solo vale si es https y del dominio del sitio: así un error
 * de tipeo (o un link ajeno) nunca sale en un mensaje con la marca. */
export function isAllowedCustomButtonUrl(raw: string, siteHost: string): boolean {
  try {
    const u = new URL(raw.trim());
    if (u.protocol !== 'https:') return false;
    const host = u.hostname.toLowerCase().replace(/^www\./, '');
    return host === siteHost.toLowerCase().replace(/^www\./, '');
  } catch {
    return false;
  }
}
