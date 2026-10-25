/* Link de ventas de DJ y RRPP: cada persona con cargo «dj» o «rrpp» y correo tiene un código propio, y
 * el link `/eventos/<evento>?embajador=<CODIGO>` cuenta sus ventas. Reusa el sistema de embajadores
 * (server/ambassadorProgram.ts) con comisión 0: solo atribuye y cuenta; si algún día se les paga
 * comisión, el admin la sube en Embajadores sin tocar nada más. Lo puro está acá. */

/** Los cargos que venden con link propio. */
export const SALES_CARGOS = ['dj', 'rrpp'] as const;

export function hasSalesLink(cargo: string | null | undefined): boolean {
  return (SALES_CARGOS as readonly string[]).includes(cargo ?? '');
}

const MAX_CODE = 20;

/** Código corto y fácil de dictar: el primer nombre en mayúsculas, sin tildes ni símbolos
 * («Aldo Medel» → ALDO). Si ya está tomado se le suma un número (ALDO2, ALDO3…). */
export function salesCodeFor(name: string, taken: Iterable<string>): string {
  const used = new Set(Array.from(taken, (c) => c.trim().toUpperCase()));
  const first = name.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().split(/\s+/)[0] ?? '';
  const base = first.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, MAX_CODE - 3) || 'STAFF';
  if (!used.has(base)) return base;
  for (let n = 2; n < 1000; n++) {
    const code = `${base}${n}`;
    if (!used.has(code)) return code;
  }
  return `${base}${Date.now() % 100000}`;
}
