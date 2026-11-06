/* Nombre de la tanda vigente para los correos de venta («Primera tanda», «2ª tanda», «Tanda final»). */
export function tandaLabel(phaseIndex: number, phaseCount: number): string {
  if (phaseCount > 1 && phaseIndex >= phaseCount - 1) return 'Tanda final';
  if (phaseIndex <= 0) return 'Primera tanda';
  if (phaseIndex === 1) return '2ª tanda';
  return `Tanda ${phaseIndex + 1}`;
}
