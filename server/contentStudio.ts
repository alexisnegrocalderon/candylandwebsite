import { eq } from 'drizzle-orm';
import { getDb } from './db';
import { contentDesigns } from '../drizzle/schema';
import { normalizeStudioDesign, type StudioDesign } from '../shared/contentStudio';

/* Diseños de plantilla del Estudio anterior (carruseles/posts guardados antes
 * del Estudio Motion). Ya no se crean, pero el contenido de embajadores
 * (server/ambassadorContent.ts) todavía los puede leer y mandar. */

export interface StoredDesign extends StudioDesign {
  id: number;
  updatedAt: Date;
}

function toStored(row: typeof contentDesigns.$inferSelect): StoredDesign | null {
  const data = (row.data ?? {}) as Record<string, unknown>;
  const design = normalizeStudioDesign({ ...data, title: row.title, format: row.format, theme: row.theme, eventId: row.eventId });
  return design ? { ...design, id: row.id, updatedAt: row.updatedAt } : null;
}

export async function getContentDesign(id: number): Promise<StoredDesign | null> {
  const db = await getDb();
  if (!db) throw new Error('La base de datos no está disponible.');
  const [row] = await db.select().from(contentDesigns).where(eq(contentDesigns.id, id)).limit(1);
  // Solo los de plantilla: los demás tipos de la tabla no se abren como diseño.
  return row && (row.kind === 'plantilla' || !row.kind) ? toStored(row) : null;
}
