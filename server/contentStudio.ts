import { desc, eq } from 'drizzle-orm';
import { getDb } from './db';
import { contentDesigns } from '../drizzle/schema';
import { normalizeStudioDesign, STUDIO_MAX_DESIGNS_LISTED, type StudioDesign } from '../shared/contentStudio';

/* Estudio de contenido (shared/contentStudio.ts): guarda los diseños para que
 * no se pierdan al cambiar de celular a computador. Todo lo que entra pasa
 * por normalizeStudioDesign, y lo que sale también -- una fila vieja o
 * editada a mano nunca llega rota al editor. */

export interface StoredDesign extends StudioDesign {
  id: number;
  updatedAt: Date;
}

async function requireDb() {
  const db = await getDb();
  if (!db) throw new Error('La base de datos no está disponible.');
  return db;
}

function toStored(row: typeof contentDesigns.$inferSelect): StoredDesign | null {
  const data = (row.data ?? {}) as Record<string, unknown>;
  const design = normalizeStudioDesign({ ...data, title: row.title, format: row.format, theme: row.theme, eventId: row.eventId });
  return design ? { ...design, id: row.id, updatedAt: row.updatedAt } : null;
}

/** Lo más reciente primero, sin las láminas: la lista solo muestra el resumen. */
export async function listContentDesigns() {
  const db = await requireDb();
  const rows = await db.select().from(contentDesigns).orderBy(desc(contentDesigns.updatedAt)).limit(STUDIO_MAX_DESIGNS_LISTED);
  return rows
    .map(toStored)
    .filter((d): d is StoredDesign => d !== null)
    .map(({ slides, caption: _caption, ...rest }) => ({ ...rest, slideCount: slides.length, cover: slides[0] }));
}

export async function getContentDesign(id: number): Promise<StoredDesign | null> {
  const db = await requireDb();
  const [row] = await db.select().from(contentDesigns).where(eq(contentDesigns.id, id)).limit(1);
  return row ? toStored(row) : null;
}

/** Crea (sin `id`) o reemplaza un diseño. Devuelve el id. */
export async function saveContentDesign(id: number | undefined, raw: unknown): Promise<number> {
  const design = normalizeStudioDesign(raw);
  if (!design) throw new Error('El diseño no tiene ninguna lámina.');
  const db = await requireDb();
  const values = {
    eventId: design.eventId,
    title: design.title,
    format: design.format,
    theme: design.theme,
    data: { slides: design.slides, caption: design.caption },
  };
  if (id != null) {
    // Se mira antes de escribir: `affectedRows` de MySQL no distingue "no
    // existe" de "no cambió nada" (guardar dos veces lo mismo).
    const [existing] = await db.select({ id: contentDesigns.id }).from(contentDesigns).where(eq(contentDesigns.id, id)).limit(1);
    if (!existing) throw new Error('Ese diseño ya no existe.');
    await db.update(contentDesigns).set(values).where(eq(contentDesigns.id, id));
    return id;
  }
  const [result] = await db.insert(contentDesigns).values(values);
  return result.insertId;
}

export async function deleteContentDesign(id: number): Promise<void> {
  const db = await requireDb();
  await db.delete(contentDesigns).where(eq(contentDesigns.id, id));
}
