/** Plantillas de Promo Flash: el dueño las prepara con anticipación (ej.
 * "Piscolas 50% / 15 min") y las activa con un toque durante la fiesta --
 * un toque solo RELLENA el formulario, nunca manda el push solo, así que
 * no hace falta ningún resguardo especial acá. Se guardan como JSON en
 * siteSettings.flashPromoPresets. */
export interface FlashPromoPreset {
  id: string;
  label: string;
  message: string;
  discountPercent: number;
  minutes: number;
  ticketTypeIds: number[];
}

/** Filtra cualquier fila mal formada (config vieja, edición manual en la
 * base, etc.) en vez de romper toda la lista por una sola plantilla mala. */
export function normalizeFlashPromoPresets(raw: unknown): FlashPromoPreset[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((p): p is FlashPromoPreset =>
    p && typeof p === 'object'
    && typeof p.id === 'string'
    && typeof p.label === 'string'
    && typeof p.message === 'string'
    && typeof p.discountPercent === 'number'
    && typeof p.minutes === 'number'
    && Array.isArray(p.ticketTypeIds),
  );
}
