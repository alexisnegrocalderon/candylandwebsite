/** Subir un acceso ya comprado a otro más caro, cobrando la diferencia
 * (Ventas Web). Solo lógica pura -- lo que toca base de datos y Mercado Pago
 * vive en server/. */
import { ACCESO_PERSONAS, personasForAccesoSlug } from './mission300';
import { formatRutLive, isValidRut } from './rut';

/** Prefijo del `external_reference` del pago de un upgrade. El pago de la
 * compra original usa el número de orden; el del upgrade usa este prefijo
 * para que el webhook lo distinga y NO pase por `applyPaymentResult` (esa
 * función pisa `orders.paymentId` y suma stock). */
export const UPGRADE_REFERENCE_PREFIX = 'UPG-';

/** Monto mínimo de un link de pago de Mercado Pago (CLP). */
export const MIN_UPGRADE_PAYMENT = 1000;

export function buildUpgradeReference(upgradeId: number): string {
  return `${UPGRADE_REFERENCE_PREFIX}${upgradeId}`;
}

/** 'UPG-12' → 12. Cualquier otra cosa (un número de orden, vacío) → null. */
export function parseUpgradeReference(reference: string | null | undefined): number | null {
  if (!reference) return null;
  const m = reference.match(/^UPG-(\d+)$/);
  if (!m) return null;
  const id = Number(m[1]);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

/** Accesos a los que NO se puede subir: dependen de género o de un código de
 * comunidad que el servidor no valida (solo lo exige el checkout), así que un
 * cambio hacia ellos no se puede garantizar. */
export const UPGRADE_BLOCKED_TARGET_SLUGS: readonly string[] = ['soltera', 'soltero', 'duo_mujeres', 'cumpleaneros'];

/** Accesos desde los que NO se puede subir (el de cumpleañeros tiene su propio
 * programa). */
export const UPGRADE_BLOCKED_SOURCE_SLUGS: readonly string[] = ['cumpleaneros'];

function isKnownAcceso(slug: string | null | undefined): slug is string {
  return !!slug && Object.prototype.hasOwnProperty.call(ACCESO_PERSONAS, slug);
}

/** ¿Se puede ofrecer cambiar de `source` a `target`? Debe ser otro tipo de
 * acceso, más caro que lo que se pagó, con igual o más personas, y ninguno de
 * los dos puede ser un acceso restringido. */
export function isEligibleUpgradeTarget(
  source: { slug: string | null | undefined; paidUnitPrice: number },
  target: { slug: string | null | undefined; price: number },
): boolean {
  if (!isKnownAcceso(source.slug) || !isKnownAcceso(target.slug)) return false;
  if (UPGRADE_BLOCKED_SOURCE_SLUGS.includes(source.slug)) return false;
  if (UPGRADE_BLOCKED_TARGET_SLUGS.includes(target.slug)) return false;
  if (source.slug === target.slug) return false;
  if (personasForAccesoSlug(target.slug) < personasForAccesoSlug(source.slug)) return false;
  const paid = Number(source.paidUnitPrice);
  const price = Number(target.price);
  return Number.isFinite(paid) && Number.isFinite(price) && price > paid;
}

/** Monto sugerido: lo que cuesta hoy el acceso nuevo menos lo que esa persona
 * realmente pagó por el suyo (nunca negativo). */
export function computeUpgradeQuote(input: { paidUnitPrice: number; targetPrice: number }): number {
  const paid = Number(input.paidUnitPrice);
  const target = Number(input.targetPrice);
  if (!Number.isFinite(paid) || !Number.isFinite(target)) return 0;
  return Math.max(0, Math.round(target - paid));
}

/* ─── Datos de las personas ─────────────────────────────────────────
 * Titular + acompañantes. Los acompañantes se numeran `acomp1…N` en
 * `attendeeData.campos`. El checkout web los guarda como
 * `acceso__acompN_nombre`, pero las órdenes manuales del admin los guardan
 * sin prefijo (`acomp1_nombre`), así que SIEMPRE se busca por la forma
 * `acompN_(nombre|rut|instagram)` sin fijar el prefijo. */

const COMPANION_KEY = /^(.*)acomp(\d+)_(nombre|rut|instagram)$/i;

export type CompanionData = { name: string; rut: string; instagram: string };

/** Acompañantes que ya tiene la orden, por número, con lo que hay cargado. */
export function readCompanions(campos: Record<string, unknown> | null | undefined): Map<number, CompanionData> {
  const result = new Map<number, CompanionData>();
  for (const [key, value] of Object.entries(campos ?? {})) {
    const m = key.match(COMPANION_KEY);
    if (!m) continue;
    const n = Number(m[2]);
    if (!Number.isSafeInteger(n) || n < 1) continue;
    const entry = result.get(n) ?? { name: '', rut: '', instagram: '' };
    const text = typeof value === 'string' ? value.trim() : '';
    const field = m[3].toLowerCase();
    if (field === 'nombre') entry.name = text;
    else if (field === 'rut') entry.rut = text;
    else entry.instagram = text;
    result.set(n, entry);
  }
  return result;
}

/** Cuántos acompañantes (además del titular) tiene un acceso. */
export function companionsRequired(accesoSlug: string | null | undefined): number {
  return Math.max(0, personasForAccesoSlug(accesoSlug) - 1);
}

export type MissingSlot = { n: number; needsName: boolean; needsRut: boolean };

/** Qué datos faltan en la orden para que `targetSlug` quede completo: por cada
 * acompañante que el acceso nuevo exige, si falta su nombre y/o su RUT. */
export function missingAttendeeSlots(
  targetSlug: string | null | undefined,
  campos: Record<string, unknown> | null | undefined,
): MissingSlot[] {
  const existing = readCompanions(campos);
  const missing: MissingSlot[] = [];
  for (let n = 1; n <= companionsRequired(targetSlug); n++) {
    const entry = existing.get(n);
    const needsName = !entry?.name;
    const needsRut = !entry?.rut;
    if (needsName || needsRut) missing.push({ n, needsName, needsRut });
  }
  return missing;
}

export type NewPersonInput = { n: number; name?: string | null; rut?: string | null; instagram?: string | null };
export type NewPerson = { n: number; name?: string; rut?: string; instagram?: string };

/** Limpia lo que escribió el admin para las personas nuevas: solo se aceptan
 * los slots y campos que realmente faltan, el nombre se normaliza, el RUT se
 * valida y el Instagram se limpia. Devuelve los errores en español en vez de
 * lanzar, para que quien llama decida cómo mostrarlos. */
export function sanitizeUpgradePeople(
  input: NewPersonInput[] | null | undefined,
  missing: MissingSlot[],
): { people: NewPerson[]; errors: string[] } {
  const people: NewPerson[] = [];
  const errors: string[] = [];
  for (const raw of input ?? []) {
    const slot = missing.find((m) => m.n === raw.n);
    if (!slot) continue;
    const person: NewPerson = { n: slot.n };
    const label = `Persona ${slot.n + 1}`;

    const name = (raw.name ?? '').replace(/\s+/g, ' ').trim();
    if (slot.needsName && name) {
      if (name.length < 3 || name.length > 120) errors.push(`${label}: el nombre debe tener entre 3 y 120 caracteres.`);
      else person.name = name;
    }
    const rut = (raw.rut ?? '').trim();
    if (slot.needsRut && rut) {
      if (!isValidRut(rut)) errors.push(`${label}: el RUT "${rut}" no es válido.`);
      else person.rut = formatRutLive(rut);
    }
    const instagram = (raw.instagram ?? '').trim().replace(/^@+/, '');
    if (instagram) {
      if (!/^[A-Za-z0-9._]{1,60}$/.test(instagram)) errors.push(`${label}: el Instagram no es válido.`);
      else person.instagram = instagram;
    }
    if (person.name || person.rut || person.instagram) people.push(person);
  }
  return { people, errors };
}

/** Solicitudes viejas de Dúo→Trío guardaban solo `thirdName`/`thirdRut`: eran
 * siempre la persona 2. */
export function legacyThirdToPeople(thirdName: string | null | undefined, thirdRut: string | null | undefined): NewPerson[] {
  const name = (thirdName ?? '').trim();
  const rut = (thirdRut ?? '').trim();
  if (!name && !rut) return [];
  return [{ n: 2, ...(name ? { name } : {}), ...(rut ? { rut } : {}) }];
}

/** Escribe en el `attendeeData` de la orden las personas del acceso nuevo.
 *
 * Para cada acompañante que el destino exige escribe SIEMPRE las claves de
 * nombre y RUT, aunque queden vacías: el listado de personas editables
 * (listAttendeeSlots, ver server/db.ts) se arma con las claves que existen, así
 * la persona nueva aparece en "Editar nombres" y se completa después. Usa el
 * mismo prefijo que ya tenga esa persona (o `acceso__`), no pisa un dato
 * existente con uno vacío y deja `acceso`/`grupoTipo` con el acceso nuevo
 * (como lo escribe el checkout: nombre y slug). Idempotente. */
export function applyAttendeePatch(
  attendeeDataJson: string | null | undefined,
  people: NewPerson[],
  target: { name: string; slug: string },
): string {
  let parsed: Record<string, unknown> = {};
  try {
    const value = attendeeDataJson ? JSON.parse(attendeeDataJson) : {};
    if (value && typeof value === 'object' && !Array.isArray(value)) parsed = value as Record<string, unknown>;
  } catch {
    parsed = {};
  }
  const campos: Record<string, unknown> =
    parsed.campos && typeof parsed.campos === 'object' && !Array.isArray(parsed.campos)
      ? { ...(parsed.campos as Record<string, unknown>) }
      : {};

  const prefixFor = (n: number): string => {
    for (const key of Object.keys(campos)) {
      const m = key.match(COMPANION_KEY);
      if (m && Number(m[2]) === n) return m[1];
    }
    return 'acceso__';
  };
  const current = (key: string) => (typeof campos[key] === 'string' ? (campos[key] as string) : '');

  for (let n = 1; n <= companionsRequired(target.slug); n++) {
    const prefix = prefixFor(n);
    const given = people.find((p) => p.n === n);
    const nameKey = `${prefix}acomp${n}_nombre`;
    const rutKey = `${prefix}acomp${n}_rut`;
    const igKey = `${prefix}acomp${n}_instagram`;
    campos[nameKey] = given?.name?.trim() || current(nameKey);
    campos[rutKey] = given?.rut?.trim() || current(rutKey);
    if (given?.instagram?.trim()) campos[igKey] = given.instagram.trim();
  }

  return JSON.stringify({ ...parsed, acceso: target.name, grupoTipo: target.slug, campos });
}
