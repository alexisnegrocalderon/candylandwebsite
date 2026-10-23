import { and, asc, eq, gte, inArray, isNull, or } from 'drizzle-orm';
import { getDb } from './db';
import { contentDesigns, events } from '../drizzle/schema';
import { pushToEmail } from './customerPush';
import { getContentDesign, readVideoRender } from './contentStudio';
import { exclusiveAmbassadors } from '../drizzle/schema';
import {
  designToAmbassadorItem,
  eventDrafts,
  normalizeAmbassadorItem,
  studioAutoKey,
  uploadedItem,
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


/* --- Del Estudio a los embajadores ---------------------------------------- */

export interface StudioSendResult {
  created: number;
  updated: number;
  /** Lo que no se pudo enviar, con la razón para el dueño. */
  skipped: { id: number; reason: string }[];
}

/** El id y la clave de lo que ya está en la lista de embajadores (incluido lo descartado). */
async function existingByAutoKey(db: Awaited<ReturnType<typeof requireDb>>) {
  const rows = await db.select({ id: contentDesigns.id, data: contentDesigns.data }).from(contentDesigns).where(eq(contentDesigns.kind, AMBASSADOR_KIND));
  const map = new Map<string, { id: number; status: string }>();
  for (const r of rows) {
    const d = r.data as { autoKey?: string; status?: string } | null;
    if (d?.autoKey) map.set(d.autoKey, { id: r.id, status: d.status ?? 'borrador' });
  }
  return map;
}

/** Manda diseños del Estudio (plantillas y videos ya grabados) a «Por aprobar». Si ya estaban, se
 * actualiza su contenido: lo aprobado sigue aprobado, lo descartado vuelve a «Por aprobar» porque
 * el dueño lo pidió a propósito. Los del Diseñador IA se envían desde dentro del diseño. */
export async function sendStudioToAmbassadors(ids: number[]): Promise<StudioSendResult> {
  const db = await requireDb();
  const have = await existingByAutoKey(db);
  const out: StudioSendResult = { created: 0, updated: 0, skipped: [] };
  for (const id of Array.from(new Set(ids))) {
    const [row] = await db.select({ kind: contentDesigns.kind }).from(contentDesigns).where(eq(contentDesigns.id, id)).limit(1);
    if (!row) { out.skipped.push({ id, reason: 'Ya no existe.' }); continue; }
    let item: AmbassadorItem | null = null;
    if (row.kind === 'video') {
      const { render, title } = await readVideoRender(id);
      const url = render?.status === 'listo' ? render.url : null;
      if (!url) { out.skipped.push({ id, reason: 'Falta grabar el video a MP4.' }); continue; }
      const [full] = await db.select({ eventId: contentDesigns.eventId, format: contentDesigns.format, data: contentDesigns.data }).from(contentDesigns).where(eq(contentDesigns.id, id)).limit(1);
      const caption = (full?.data as { caption?: unknown } | null)?.caption;
      item = uploadedItem({ mediaUrl: url, eventId: full?.eventId ?? null, mediaFormat: full?.format === 'post' ? 'post' : 'historia', label: title, caption: typeof caption === 'string' ? caption : '' });
      if (item) item = { ...item, autoKey: studioAutoKey(id) };
    } else if (row.kind === 'ia') {
      out.skipped.push({ id, reason: 'Es del Diseñador IA: envíalo desde dentro del diseño.' });
      continue;
    } else if (row.kind === 'embajador' || row.kind === 'estilo') {
      out.skipped.push({ id, reason: 'No es un diseño del Estudio.' });
      continue;
    } else {
      const design = await getContentDesign(id);
      item = design ? designToAmbassadorItem(design, id) : null;
    }
    if (!item) { out.skipped.push({ id, reason: 'No se pudo preparar.' }); continue; }
    const prev = have.get(item.autoKey);
    if (prev) {
      const status = prev.status === 'descartado' ? 'borrador' : prev.status;
      await db.update(contentDesigns).set(rowValues({ ...item, status: status as AmbassadorItem['status'] })).where(eq(contentDesigns.id, prev.id));
      out.updated++;
    } else {
      await db.insert(contentDesigns).values(rowValues(item));
      out.created++;
    }
  }
  return out;
}

/** El «pack del evento» automático: un diseño guardado en el Estudio con un evento queda en «Por
 * aprobar» por sí solo. Solo la primera vez: si el dueño lo descartó o lo editó, no se toca. */
export async function autoPackFromDesign(designId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  const design = await getContentDesign(designId);
  if (!design || design.eventId == null) return false;
  const have = await existingByAutoKey(db);
  if (have.has(studioAutoKey(designId))) return false;
  const item = designToAmbassadorItem(design, designId);
  if (!item) return false;
  await db.insert(contentDesigns).values(rowValues(item));
  return true;
}

/** Aviso a las embajadoras activas cuando se aprueba contenido nuevo. */
export async function notifyAmbassadorsNewContent(count: number): Promise<number> {
  if (count <= 0) return 0;
  const db = await getDb();
  if (!db) return 0;
  const rows = await db.select({ email: exclusiveAmbassadors.email }).from(exclusiveAmbassadors).where(eq(exclusiveAmbassadors.active, 1));
  let sent = 0;
  for (const { email } of rows) {
    if (!email) continue;
    sent += await pushToEmail(email, {
      title: '🎨 Tienes contenido nuevo para compartir',
      body: count === 1 ? 'Hay una pieza nueva en tu sección Embajador, con tu link y tu código.' : `Hay ${count} piezas nuevas en tu sección Embajador, con tu link y tu código.`,
      url: '/cuenta?tab=embajador',
    }).catch(() => 0);
  }
  return sent;
}
