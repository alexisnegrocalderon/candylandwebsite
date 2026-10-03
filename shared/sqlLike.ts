/** Escapa `\`, `%` y `_` para que lo que el usuario teclea en un buscador se
 * compare como texto literal dentro de un `LIKE '%...%'` (MySQL usa `\` como
 * carácter de escape por defecto). Sin esto, buscar "50%" o "juan_perez"
 * actuaría como comodín y devolvería órdenes que no tienen nada que ver. */
export function escapeLikePattern(text: string): string {
  return text.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}
