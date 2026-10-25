/* Link de ventas de DJ y RRPP (shared/staffSales.ts): al guardar su ficha con correo se les crea, una sola
 * vez, un embajador solo de seguimiento (comisión 0, sin descuento). Entra a «Mi cuenta» por su correo
 * como cualquier embajador y el admin lo ve en Embajadores. No se toca si ya existe. */
import { eq } from 'drizzle-orm';
import { staffMembers } from '../drizzle/schema';
import { hasSalesLink, salesCodeFor } from '../shared/staffSales';
import { createExclusiveAmbassador, getDb, listExclusiveAmbassadors } from './db';
import { findAmbassadorByEmail } from './ambassadorProgram';

/** Asegura el embajador de seguimiento de esta persona. Devuelve su código, o null si no le corresponde
 * (otro cargo, archivada o sin correo). */
export async function ensureStaffSalesLink(staffId: number): Promise<string | null> {
  const db = await getDb();
  if (!db) return null;
  const [m] = await db.select().from(staffMembers).where(eq(staffMembers.id, staffId)).limit(1);
  if (!m || !m.active || !m.email || !hasSalesLink(m.cargo)) return null;
  const existing = await findAmbassadorByEmail(m.email);
  if (existing) return existing.code;
  const all = await listExclusiveAmbassadors();
  // Un embajador archivado con este correo ya existe: no se crea otro encima.
  if (all.some((a) => (a.email ?? '').trim().toLowerCase() === m.email!.trim().toLowerCase())) return null;
  const code = salesCodeFor(m.name, all.map((a) => a.code));
  await createExclusiveAmbassador({ name: m.name, code, commissionPercent: 0, email: m.email, contact: 'Staff (link de ventas)' });
  return code;
}
