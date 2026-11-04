/* El atajo «Inventario PDF» del «+» (celular) abre «Stock de barra» con el diálogo del inventario ya abierto. Vive aparte
 * para que el panel no tenga que descargar la sección entera solo por el atajo. */
let pending = false;
export function requestInventarioPdf() { pending = true; }
/** Lo consume la sección al montarse: true una sola vez después del atajo. */
export function takeInventarioPdfRequest(): boolean {
  const was = pending;
  pending = false;
  return was;
}
