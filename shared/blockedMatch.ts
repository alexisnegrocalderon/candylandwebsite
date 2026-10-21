/* Lista de bloqueados: cómo se normaliza cada dato y cuándo una persona
 * coincide con alguien bloqueado. Puro (sin base de datos), usado por la
 * compra web (createOrder), los accesos manuales, el snapshot de la puerta y
 * la importación de la planilla -- así la regla es una sola.
 *
 * Regla del dueño: cualquier dato duro que coincida (RUT, teléfono, Instagram,
 * correo) bloquea. El nombre completo NO bloquea: solo avisa ("posible
 * bloqueado"), por el riesgo de homónimos. */
import { normalizeIgHandle, foldText } from './igCustomerLink';

export type BlockMatchBy = 'rut' | 'email' | 'phone' | 'instagram' | 'name';

/** RUT sin puntos ni guion, en mayúsculas ("12.345.678-9" = "123456789"). Sirve
 * también para pasaportes (alfanuméricos); '' si es demasiado corto. */
/** ¿Es un RUT chileno completo (cuerpo + dígito verificador válido)? Recibe la clave de `rutKey`. */
export function isFullRutKey(key: string): boolean {
  if (!/^\d{7,8}[0-9K]$/.test(key)) return false;
  const body = key.slice(0, -1);
  let sum = 0; let mult = 2;
  for (let i = body.length - 1; i >= 0; i--) { sum += Number(body[i]) * mult; mult = mult === 7 ? 2 : mult + 1; }
  const e = 11 - (sum % 11);
  return key.slice(-1) === (e === 11 ? '0' : e === 10 ? 'K' : String(e));
}

/** Una ficha con solo el número base de un RUT (6-8 dígitos, sin dígito verificador, y que no calza como RUT completo). */
export function isBodyOnlyRutKey(key: string | null | undefined): boolean {
  return !!key && /^\d{6,8}$/.test(key) && !isFullRutKey(key);
}

export function rutKey(raw: string | null | undefined): string {
  const s = (raw ?? '').replace(/[^0-9a-zA-Z]/g, '').toUpperCase();
  return s.length >= 6 && s.length <= 15 ? s : '';
}

/** Celular canónico = últimos 9 dígitos ("+56 9 1234 5678" = "912345678"). Con 8 dígitos se deja tal cual. */
export function phoneKey(raw: string | null | undefined): string {
  const digits = (raw ?? '').replace(/\D/g, '');
  if (digits.length < 8) return '';
  return digits.length > 9 ? digits.slice(-9) : digits;
}

export function emailKey(raw: string | null | undefined): string {
  const s = (raw ?? '').trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) ? s : '';
}

export function igKey(raw: string | null | undefined): string {
  return normalizeIgHandle(raw);
}

/** Nombre completo sin tildes ni mayúsculas ni espacios de más. Un nombre de
 * una sola palabra no cuenta (demasiado ambiguo para avisar). */
export function nameKey(raw: string | null | undefined): string {
  const s = foldText(raw ?? '').replace(/[^a-z0-9ñ\s]/g, ' ').replace(/\s+/g, ' ').trim();
  return s.split(' ').filter(Boolean).length >= 2 && s.length >= 5 ? s : '';
}

export interface BlockedKeys {
  rutNorm: string | null;
  emailNorm: string | null;
  phoneNorm: string | null;
  igNorm: string | null;
  nameFold: string | null;
}

/** Versiones normalizadas de lo que escribió el dueño (o trajo la planilla). */
export function blockedKeysFor(f: { rut?: string | null; email?: string | null; phone?: string | null; instagram?: string | null; fullName?: string | null }): BlockedKeys {
  return {
    rutNorm: rutKey(f.rut) || null,
    emailNorm: emailKey(f.email) || null,
    phoneNorm: phoneKey(f.phone) || null,
    igNorm: igKey(f.instagram) || null,
    nameFold: nameKey(f.fullName) || null,
  };
}

/** ¿Hay al menos un dato duro? (con solo nombre se carga, pero solo avisa). */
export const hasHardKey = (k: BlockedKeys) => !!(k.rutNorm || k.emailNorm || k.phoneNorm || k.igNorm);

export interface BlockedRow extends BlockedKeys {
  id: number;
  fullName?: string | null;
  sourceVenue?: string | null;
  isActive?: number | boolean | null;
}

export interface Identity {
  name?: string | null;
  rut?: string | null;
  email?: string | null;
  phone?: string | null;
  instagram?: string | null;
}

export interface BlockHit<R extends BlockedRow = BlockedRow> {
  row: R;
  by: BlockMatchBy;
  /** Posición de la persona (titular/acompañante) dentro de `identities`. */
  identityIndex: number;
}

/** Cruza las personas de una compra/entrada con la lista. `block` = coincidió
 * un dato duro (impedir); `review` = solo coincidió el nombre (avisar). */
export function matchBlocked<R extends BlockedRow>(identities: Identity[], rows: R[]): { block: BlockHit<R>[]; review: BlockHit<R>[] } {
  const block: BlockHit<R>[] = [];
  const review: BlockHit<R>[] = [];
  const active = rows.filter((r) => r.isActive === undefined || r.isActive === null || r.isActive === 1 || r.isActive === true);
  identities.forEach((p, identityIndex) => {
    const k = { rut: rutKey(p.rut), email: emailKey(p.email), phone: phoneKey(p.phone), ig: igKey(p.instagram), name: nameKey(p.name) };
    for (const row of active) {
      let by: BlockMatchBy | null = null;
      // El RUT de quien compra también calza con una ficha que solo trae el
      // número base (sin dígito verificador): el cuerpo es único por persona.
      if (k.rut && (row.rutNorm === k.rut || (isFullRutKey(k.rut) && isBodyOnlyRutKey(row.rutNorm) && row.rutNorm === k.rut.slice(0, -1)))) by = 'rut';
      else if (k.email && row.emailNorm === k.email) by = 'email';
      else if (k.phone && row.phoneNorm === k.phone) by = 'phone';
      else if (k.ig && row.igNorm === k.ig) by = 'instagram';
      if (by) { block.push({ row, by, identityIndex }); continue; }
      if (k.name && row.nameFold === k.name) review.push({ row, by: 'name', identityIndex });
    }
  });
  return { block, review };
}

export const BLOCK_BY_LABEL: Record<BlockMatchBy, string> = { rut: 'RUT', email: 'correo', phone: 'teléfono', instagram: 'Instagram', name: 'nombre' };
