/* ¿Se ve el tema Halloween? Ya no hay interruptor en el panel: el tema queda guardado para el próximo
 * Halloween y hoy solo se ve en la vista previa (`/halloween` o `?tema=halloween`). */

export function useHalloweenMode(): boolean {
  return typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('tema') === 'halloween';
}
