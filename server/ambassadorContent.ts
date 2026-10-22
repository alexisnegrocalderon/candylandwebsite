import { and, asc, eq, gte, inArray, isNull, or } from 'drizzle-orm';
import { getDb } from './db';
import { contentDesigns, events } from '../drizzle/schema';
import {
  eventDrafts,
  normalizeAmbassadorItem,
  type AmbassadorItem,
  type AmbassadorItemStatus,
  type StoredAmbassadorItem,
} from '../shared/ambassadorContent';

/* El contenido que el dueño aprueba para los embajadores
 * (shared/ambassadorContent.ts). Vive en la tabla del Estudio
 * (contentDesigns) con `kind = 'embajador'`, igual que los videos: no hace
 * falta migrar la base. `data` guarda el item completo, normalizado. */

export const AMBASSADOR_KIND = 'embajador';

/** Cuántos eventos próximos tienen contenido a la vez. */
export const CONTENT_EVENTS_MAX = 3;

async function requireDb() {
  const db = await getDb();
  if (!db) throw new Error('La base de datos no está disponible.');
  return db;
}

function toItem(row: typeof contentDesigns.$inferSelect): StoredAmbassadorItem | null {
  const item = normalizeAmbassadorItem({ ...(row.data as object), eventId: row.eventId });
  return item ? { ...item, id: row.id, updatedAt: row.updatedAt } : null;
}

function rowValues(item: AmbassadorItem) {
  return {
    kind: AMBASSADOR_KIND,
    eventId: item.eventId,
    title: item.label.slice(0, 200),
    format: item.design?.format ?? item.mediaFormat,
    theme: item.design?.theme ?? 'bubble',
    data: item,
  };
}

/** Los eventos a la venta que vienen, del más cercano al más lejano. Se
 * cuentan desde 12 h antes de ahora: la noche misma del evento todavía tiene
 * su material. Nunca la dirección: se entrega solo a quien compró. */
export async function getUpcomingContentEvents(now: Date = new Date()) {
  const db = await getDb();
  if (!db) return [];
  return db.select({
    id: events.id, title: events.title, slug: events.slug, eventDate: events.eventDate,
    doorsOpen: events.doorsOpen, imageUrl: events.imageUrl, shortDescription: events.shortDescription,
  }).from(events)
    .where(and(eq(events.status, 'published'), gte(events.eventDate, new Date(now.getTime() - 12 * 60 * 60 * 1000))))
    .orderBy(events.eventDate)
    .limit(CONTENT_EVENTS_MAX);
}

/** Todo lo que no se descartó, para revisar en el admin. */
export async function listAmbassadorItems(): Promise<StoredAmbassadorItem[]> {
  const db = await requireDb();
  const rows = await db.select().from(contentDesigns).where(eq(contentDesigns.kind, AMBASSADOR_KIND)).orderBy(asc(contentDesigns.id));
  return rows.flatMap((row) => {
    const item = toItem(row);
    return item && item.status !== 'descartado' ? [item] : [];
  });
}

/** Lo aprobado de estos eventos más lo general (sin evento), para el panel. */
export async function listApprovedAmbassadorItems(eventIds: number[]): Promise<StoredAmbassadorItem[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.select().from(contentDesigns).where(and(
    eq(contentDesigns.kind, AMBASSADOR_KIND),
    eventIds.length > 0 ? or(isNull(contentDesigns.eventId), inArray(contentDesigns.eventId, eventIds)) : isNull(contentDesigns.eventId),
  ));
  return rows.flatMap((row) => {
    const item = toItem(row);
    return item && item.status === 'aprobado' ? [item] : [];
  });
}

/** Crea (sin `id`) o reemplaza un item. Devuelve el id. */
export async function saveAmbassadorItem(id: number | undefined, raw: unknown): Promise<number> {
  const item = normalizeAmbassadorItem(raw);
  if (!item) throw new Error('Falta la imagen o el archivo.');
  const db = await requireDb();
  if (id != null) {
    const [existing] = await db.select({ kind: contentDesigns.kind, data: contentDesigns.data }).from(contentDesigns).where(eq(contentDesigns.id, id)).limit(1);
    if (!existing || existing.kind !== AMBASSADOR_KIND) throw new Error('Ese contenido ya no existe.');
    // La clave de los automáticos se conserva: si no, se volverían a crear.
    const autoKey = (existing.data as { autoKey?: unknown } | null)?.autoKey;
    await db.update(contentDesigns).set(rowValues({ ...item, autoKey: typeof autoKey === 'string' ? autoKey : item.autoKey })).where(eq(contentDesigns.id, id));
    return id;
  }
  const [result] = await db.insert(contentDesigns).values(rowValues(item));
  return result.insertId;
}

export async function setAmbassadorItemStatus(ids: number[], status: AmbassadorItemStatus): Promise<number> {
  if (ids.length === 0) return 0;
  const db = await requireDb();
  const rows = await db.select().from(contentDesigns).where(and(eq(contentDesigns.kind, AMBASSADOR_KIND), inArray(contentDesigns.id, ids)));
  let changed = 0;
  for (const row of rows) {
    const item = toItem(row);
    if (!item || item.status === status) continue;
    const { id: _id, updatedAt: _u, ...rest } = item;
    await db.update(contentDesigns).set({ data: { ...rest, status } }).where(eq(contentDesigns.id, row.id));
    changed++;
  }
  return changed;
}

/** Borra de verdad. Los automáticos no se borran (volverían a crearse): se descartan. */
export async function deleteAmbassadorItem(id: number): Promise<void> {
  const db = await requireDb();
  const [row] = await db.select().from(contentDesigns).where(and(eq(contentDesigns.id, id), eq(contentDesigns.kind, AMBASSADOR_KIND))).limit(1);
  if (!row) return;
  const item = toItem(row);
  if (item?.autoKey) { await setAmbassadorItemStatus([id], 'descartado'); return; }
  await db.delete(contentDesigns).where(eq(contentDesigns.id, id));
}

/** Crea los borradores que falten de cada evento próximo. Se puede llamar
 * siempre: lo que ya existe (aprobado, en borrador o descartado) no se toca.
 * Devuelve cuántos creó. */
export async function ensureAmbassadorDrafts(now: Date = new Date()): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const upcoming = await getUpcomingContentEvents(now);
  if (upcoming.length === 0) return 0;
  const rows = await db.select({ eventId: contentDesigns.eventId, data: contentDesigns.data }).from(contentDesigns)
    .where(and(eq(contentDesigns.kind, AMBASSADOR_KIND), inArray(contentDesigns.eventId, upcoming.map((e) => e.id))));
  const have = new Set(rows.map((r) => `${r.eventId}:${(r.data as { autoKey?: string } | null)?.autoKey ?? ''}`));
  let created = 0;
  for (const event of upcoming) {
    for (const draft of eventDrafts(event)) {
      if (have.has(`${event.id}:${draft.autoKey}`)) continue;
      await db.insert(contentDesigns).values(rowValues(draft));
      created++;
    }
  }
  return created;
}
