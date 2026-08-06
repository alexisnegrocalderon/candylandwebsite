/** Favoritos de la cajera en "Nueva venta": acceso directo a los productos
 * que más vende, para no andar cambiando de categoría en cada venta. Se
 * guardan SOLO en esta tablet (localStorage) -- no en la base de datos, así
 * que no se comparten entre dispositivos ni cajas, y no requieren sincronizar
 * nada con el servidor (decisión explícita: más simple que agregar un campo
 * al schema de la Carta de la Fiesta). */

const STORAGE_KEY = 'caja_favoritos';

export function getFavoriteIds(): number[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((id) => typeof id === 'number') : [];
  } catch {
    return [];
  }
}

export function toggleFavorite(id: number): number[] {
  const current = getFavoriteIds();
  const next = current.includes(id) ? current.filter((f) => f !== id) : [...current, id];
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // localStorage lleno/deshabilitado -- no es crítico, la cajera puede seguir vendiendo sin favoritos.
  }
  return next;
}
