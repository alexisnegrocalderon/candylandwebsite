/* ¿Este evento usa el stock de Playroom? El stock de barra es UNO para toda la plataforma (no está separado por evento).
 * Un evento sin caja de la plataforma (solo entrada y estacionamiento por la web, ej. PLAYMORE, donde la barra la maneja
 * la otra productora) NO lo usa: no descuenta ventas, su conteo de barra no corrige el inventario y su lista de compras
 * parte desde cero, así el stock de Playroom queda intacto para el próximo evento. */
export function eventUsesPlatformStock(event: { presaleParkingOnly?: number | boolean | null } | null | undefined): boolean {
  return !event?.presaleParkingOnly;
}
