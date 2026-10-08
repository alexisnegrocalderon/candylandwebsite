import { desc, eq } from 'drizzle-orm';
import { getDb } from './db';
import { contentDesignMessages, contentDesigns } from '../drizzle/schema';
import { normalizeStudioDesign, STUDIO_MAX_DESIGNS_LISTED, type StudioDesign } from '../shared/contentStudio';
import { normalizeAiDesign } from '../shared/studioAi';

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

/** Lo más reciente primero, sin las láminas: la lista solo muestra el
 * resumen y la portada. Mezcla los diseños de plantilla y los del Diseñador
 * IA (`kind`); de los de IA va la primera lámina en HTML para la miniatura. */
export type DesignListItem =
  | (Omit<StoredDesign, 'slides' | 'caption'> & { kind: 'plantilla'; slideCount: number; cover: StudioDesign['slides'][number] })
  | { kind: 'ia'; id: number; title: string; format: StudioDesign['format']; eventId: number | null; updatedAt: Date; slideCount: number; aiCover: { css: string; html: string } | null };

export async function listContentDesigns(): Promise<DesignListItem[]> {
  const db = await requireDb();
  const rows = await db.select().from(contentDesigns).orderBy(desc(contentDesigns.updatedAt)).limit(STUDIO_MAX_DESIGNS_LISTED);
  return rows.flatMap((row): DesignListItem[] => {
    if (row.kind === 'ia') {
      const design = normalizeAiDesign({ ...(row.data as object), title: row.title, format: row.format, eventId: row.eventId });
      return [{
        kind: 'ia' as const,
        id: row.id,
        title: design.title,
        format: design.format,
        eventId: design.eventId,
        updatedAt: row.updatedAt,
        slideCount: design.slides.length,
        aiCover: design.slides[0] ? { css: design.css, html: design.slides[0].html } : null,
      }];
    }
    const stored = toStored(row);
    if (!stored) return [];
    const { slides, caption: _caption, ...rest } = stored;
    return [{ ...rest, kind: 'plantilla' as const, slideCount: slides.length, cover: slides[0] }];
  });
}

export async function getContentDesign(id: number): Promise<StoredDesign | null> {
  const db = await requireDb();
  const [row] = await db.select().from(contentDesigns).where(eq(contentDesigns.id, id)).limit(1);
  // Un diseño de IA no se abre en el editor de plantillas.
  return row && row.kind !== 'ia' ? toStored(row) : null;
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
    const [existing] = await db.select({ id: contentDesigns.id, kind: contentDesigns.kind }).from(contentDesigns).where(eq(contentDesigns.id, id)).limit(1);
    if (!existing) throw new Error('Ese diseño ya no existe.');
    if (existing.kind === 'ia') throw new Error('Ese diseño es del Diseñador IA: se edita desde ahí.');
    await db.update(contentDesigns).set(values).where(eq(contentDesigns.id, id));
    return id;
  }
  const [result] = await db.insert(contentDesigns).values(values);
  return result.insertId;
}

export async function deleteContentDesign(id: number): Promise<void> {
  const db = await requireDb();
  await db.delete(contentDesignMessages).where(eq(contentDesignMessages.designId, id));
  await db.delete(contentDesigns).where(eq(contentDesigns.id, id));
}
