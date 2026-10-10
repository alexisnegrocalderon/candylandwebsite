/**
 * Checklist de costos fijos de un evento: lo que casi toda fiesta paga. Cada
 * gasto cargado desde el checklist guarda su `slotKey`, así se sabe qué falta.
 */
import { ivaFromGross } from './expenses';

export type EventCostSlot = { key: string; label: string; category: string; hint: string };

export const EVENT_COST_SLOTS: EventCostSlot[] = [
  { key: 'arriendo', label: 'Arriendo del venue', category: 'arriendo', hint: 'Lo que pagas al local por la noche' },
  { key: 'dj', label: 'DJ / música', category: 'produccion', hint: 'DJ, artistas, shows' },
  { key: 'seguridad', label: 'Seguridad', category: 'produccion', hint: 'Guardias, control de acceso' },
  { key: 'sonido', label: 'Sonido e iluminación', category: 'produccion', hint: 'Arriendo de equipos, técnico' },
  { key: 'decoracion', label: 'Decoración', category: 'decoracion', hint: 'Ambientación, globos, flores' },
  { key: 'barra', label: 'Barra e insumos', category: 'barra', hint: 'Bebidas, hielo, vasos (si no están costeados en la carta)' },
  { key: 'publicidad', label: 'Publicidad', category: 'marketing', hint: 'Avisos pagados, diseño, impresión' },
  { key: 'transporte', label: 'Transporte', category: 'transporte', hint: 'Fletes, traslados' },
  { key: 'limpieza', label: 'Limpieza', category: 'otros', hint: 'Aseo antes/después' },
];

export type SlotExpense = { slotKey: string | null; amountTotal: number; documentType: string; ivaAmount: number; ivaExempt?: number | boolean | null };

/** Estado del checklist y resumen "con factura vs. sin factura". */
export function costChecklistSummary(expenses: SlotExpense[]) {
  const slots = EVENT_COST_SLOTS.map((s) => {
    const rows = expenses.filter((e) => e.slotKey === s.key);
    return { ...s, loaded: rows.length > 0, total: rows.reduce((t, e) => t + e.amountTotal, 0) };
  });
  const total = expenses.reduce((t, e) => t + e.amountTotal, 0);
  const conFactura = expenses.filter((e) => e.documentType === 'factura' && !e.ivaExempt);
  const sinFactura = expenses.filter((e) => e.documentType === 'boleta' || e.documentType === 'sin_documento');
  const ivaRecuperado = conFactura.reduce((t, e) => t + e.ivaAmount, 0);
  // IVA que se habría recuperado si esas compras hubieran sido con factura.
  const ivaPerdido = sinFactura.reduce((t, e) => t + ivaFromGross(e.amountTotal), 0);
  return {
    slots,
    total,
    pendingSlots: slots.filter((s) => !s.loaded).map((s) => s.key),
    hasVenueRent: slots.find((s) => s.key === 'arriendo')!.loaded,
    conFacturaTotal: conFactura.reduce((t, e) => t + e.amountTotal, 0),
    sinFacturaTotal: sinFactura.reduce((t, e) => t + e.amountTotal, 0),
    ivaRecuperado,
    ivaPerdido,
  };
}
