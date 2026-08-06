/** Categorías usadas recientemente, para que las tres o cuatro de siempre
 * queden arriba en la grilla y no haya que buscarlas. Se guardan SOLO en este
 * teléfono (localStorage), mismo criterio que los favoritos de /caja: no vale
 * la pena sincronizarlas con el servidor. */

const STORAGE_KEY = 'gastos_categorias_recientes';
const MAX_RECENT = 6;

export function getRecentCategories(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((c) => typeof c === 'string') : [];
  } catch {
    return [];
  }
}

/** Deja la categoría al frente de la lista, sin duplicarla. */
export function pushRecentCategory(category: string): string[] {
  const next = [category, ...getRecentCategories().filter((c) => c !== category)].slice(0, MAX_RECENT);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // localStorage lleno o deshabilitado -- se pierde solo el orden sugerido.
  }
  return next;
}
