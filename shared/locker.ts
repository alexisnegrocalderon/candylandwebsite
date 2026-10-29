/** Número de percha de guardarropía: `<nº de caja>-<correlativo local>` (ej.
 * "1-007"). Lo genera la propia tablet al confirmar la venta (nunca el
 * servidor) -- mismo patrón y mismo motivo que el número de comanda de
 * cocina (ver shared/kitchen.ts): el correlativo lo lleva Dexie en
 * caja/db.ts y el prefijo de caja es lo que garantiza que dos tablets sin
 * señal nunca asignen el mismo número, sin coordinación entre ellas.
 * `registerId` es `null` cuando la cajera no tiene una caja física asignada
 * -- se usa "0" como prefijo. */
export function formatLockerTagNumber(registerId: number | null, counter: number): string {
  return `${registerId ?? 0}-${String(counter).padStart(3, "0")}`;
}

export type LockerItemStatus = "pendiente" | "guardado" | "parcial" | "retirado";

/** Los colores de la pantalla: rojo = todo guardado, amarillo = retiraron algo pero no todo, verde = todo retirado. */
export const LOCKER_TONE: Record<"guardado" | "parcial" | "retirado", { label: string; short: string; dot: string }> = {
  guardado: { label: "Todo guardado", short: "Guardado", dot: "bg-red-500" },
  parcial: { label: "Retiró una parte", short: "Parcial", dot: "bg-amber-400" },
  retirado: { label: "Todo retirado", short: "Retirado", dot: "bg-emerald-500" },
};

export const PARTIAL_NOTE_MAX = 255;
export const PARTIAL_ITEM_MAX = 60;

/** Suma lo que sacaron ahora a lo que ya habían sacado («chaqueta» + «bolso» → «chaqueta; bolso»), sin repetir y hasta 255. */
export function mergePartialNote(previous: string | null | undefined, added: string | null | undefined): string | null {
  const clean = (t: string | null | undefined) => (t ?? "").replace(/\s+/g, " ").trim().slice(0, PARTIAL_ITEM_MAX);
  const parts = [...(previous ?? "").split(";"), ...(added ?? "").split(";").map(clean)].map((p) => p.replace(/\s+/g, " ").trim()).filter(Boolean);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of parts) {
    const key = part.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(part);
  }
  const joined = out.join("; ").slice(0, PARTIAL_NOTE_MAX);
  return joined || null;
}

/** Transiciones válidas de una prenda: pendiente -> guardado (primera confirmación física en /guardarropia, recién
 * cobrada en caja) -> parcial (retiraron algo, no todo; se puede repetir si sacan más) -> retirado (todo) -> guardado ... -- la
 * misma persona puede entrar y sacar sus cosas las veces que quiera en la noche, siempre con el mismo `tagNumber`.
 * `retirado -> guardado` y `parcial -> guardado` sirven doble función: reingreso real, o «deshacer» un retiro apretado por
 * error. `guardado -> pendiente` es solo el «Deshacer» de un Recibido apretado por error (vuelve a la cola de por recibir).
 * Desde 'retirado' no se vuelve a 'pendiente' ni a 'parcial': esa prenda ya estuvo en el mostrador y salió entera. */
export function canTransitionLockerItem(from: LockerItemStatus, to: LockerItemStatus): boolean {
  if (from === "pendiente") return to === "guardado";
  if (from === "guardado") return to === "parcial" || to === "retirado" || to === "pendiente";
  if (from === "parcial") return to === "parcial" || to === "retirado" || to === "guardado";
  if (from === "retirado") return to === "guardado";
  return false;
}

/** `{ register, counter }` de un número de percha `<caja>-<correlativo>`
 * (ej. "1-007" -> { register: 1, counter: 7 }). Un formato raro cae a
 * `counter: NaN` para que ordene al final y no rompa nada. */
export function parseLockerTag(tag: string): { register: number; counter: number } {
  const m = /^(\d+)-(\d+)$/.exec(tag.trim());
  return m ? { register: Number(m[1]), counter: Number(m[2]) } : { register: 0, counter: NaN };
}

/** Orden por número de percha: del 1 en adelante, y a igual número por caja.
 * Lo que no calza con el formato va al final, por texto. */
export function compareLockerTags(a: string, b: string): number {
  const pa = parseLockerTag(a);
  const pb = parseLockerTag(b);
  const aOk = !Number.isNaN(pa.counter);
  const bOk = !Number.isNaN(pb.counter);
  if (aOk && bOk) return pa.counter - pb.counter || pa.register - pb.register;
  if (aOk) return -1;
  if (bOk) return 1;
  return a.localeCompare(b);
}

/** ¿El número que tecleó el staff (`digits`, solo dígitos) es esta percha?
 * Calza con el correlativo ("7" o "007" -> "1-007") o con el número completo
 * sin guion ("1007" -> "1-007"). Sin dígitos no calza nada. */
export function lockerTagMatchesDigits(tag: string, digits: string): boolean {
  const d = digits.replace(/\D/g, "");
  if (!d) return false;
  const { register, counter } = parseLockerTag(tag);
  if (Number.isNaN(counter)) return tag.replace(/\D/g, "") === d;
  return counter === Number(d) || `${register}${String(counter).padStart(3, "0")}` === d;
}

/** Texto sin tildes ni mayúsculas, para buscar por nombre sin pelear con
 * "María"/"maria". */
export function normalizeSearch(text: string): string {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

/** Búsqueda libre de la lista: por nombre (sin tildes) o por número de percha. */
export function lockerMatchesSearch(item: { tagNumber: string; customerName: string | null }, query: string): boolean {
  const q = normalizeSearch(query);
  if (!q) return true;
  if (normalizeSearch(item.customerName ?? "").includes(q)) return true;
  if (item.tagNumber.toLowerCase().includes(q)) return true;
  return /^\d+$/.test(q) && lockerTagMatchesDigits(item.tagNumber, q);
}
