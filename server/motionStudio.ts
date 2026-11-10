import { and, desc, eq, inArray } from 'drizzle-orm';
import { getDb } from './db';
import { contentDesignMessages, contentDesigns } from '../drizzle/schema';
import { normalizeMotionSpec, type MotionFormat, type MotionSpec, type MotionStyle, type MotionTemplate } from '../shared/motionSpec';
import { normalizeContentPlan, type ContentPlan } from '../shared/contentPlan';
import { normalizeRenderState, specHash, summarizeRender, type RenderState, type RenderSummary } from '../shared/studioRender';
import { publishReel } from './instagramReel';

/* Cola de la marca: los videos del Estudio que van al Instagram de
 * @mansionplayroom. No tiene nada que ver con «Contenido embajadores».
 *   por_aprobar → aprobado (el dueño lo revisó, con el MP4 ya grabado) → publicado.
 * La aprobación queda atada al contenido exacto que se revisó (hash): si el
 * guion cambia después, vuelve a «por_aprobar» y nunca sale algo no revisado. */
export type PublicacionEstado = 'por_aprobar' | 'aprobado' | 'publicado';

export interface Publicacion {
  estado: PublicacionEstado;
  /** Hash del contenido aprobado. Si el video cambió, ya no está aprobado. */
  aprobadoHash: string | null;
  aprobadoAt: number | null;
  publicadoAt: number | null;
  igMediaId: string | null;
  /** Último error al publicar (se borra al tener éxito). */
  error: string | null;
}

export function normalizePublicacion(raw: unknown): Publicacion {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<Publicacion>;
  const estado: PublicacionEstado = r.estado === 'aprobado' || r.estado === 'publicado' ? r.estado : 'por_aprobar';
  return {
    estado,
    aprobadoHash: typeof r.aprobadoHash === 'string' ? r.aprobadoHash : null,
    aprobadoAt: typeof r.aprobadoAt === 'number' ? r.aprobadoAt : null,
    publicadoAt: typeof r.publicadoAt === 'number' ? r.publicadoAt : null,
    igMediaId: typeof r.igMediaId === 'string' ? r.igMediaId : null,
    error: typeof r.error === 'string' ? r.error.slice(0, 300) : null,
  };
}

/** El estado real: un «aprobado» de una versión anterior del guion ya no cuenta. */
function effectiveEstado(p: Publicacion, hash: string): PublicacionEstado {
  if (p.estado === 'publicado') return 'publicado';
  if (p.estado === 'aprobado' && p.aprobadoHash === hash) return 'aprobado';
  return 'por_aprobar';
}

/* Estudio Motion (admin → Contenido → Estudio): guarda los videos (la receta,
 * shared/motionSpec.ts) y el plan de contenido de cada evento. Van en la
 * tabla de siempre (contentDesigns), sin tablas nuevas:
 *   - kind 'motion': un video. `data` = { spec, render }.
 *   - kind 'plan':   el último plan de contenido de un evento. `data` = el plan.
 * Todo lo que entra y sale pasa por normalizeMotionSpec / normalizeContentPlan. */

const MOTION_KIND = 'motion';
const PLAN_KIND = 'plan';
const MAX_LISTED = 120;

async function requireDb() {
  const db = await getDb();
  if (!db) throw new Error('La base de datos no está disponible.');
  return db;
}

export interface MotionListItem {
  id: number;
  title: string;
  eventId: number | null;
  template: MotionTemplate;
  style: MotionStyle;
  format: MotionFormat;
  updatedAt: Date;
  render: RenderSummary;
  /** El MP4 corresponde a la versión guardada (si no, quedó viejo). */
  renderFresh: boolean;
  /** Dónde está en la cola de la marca. */
  publicacion: PublicacionEstado;
}

export interface StoredMotion {
  id: number;
  spec: MotionSpec;
  updatedAt: Date;
  render: RenderSummary;
  renderFresh: boolean;
  publicacion: Publicacion & { estadoActual: PublicacionEstado };
}

function fromRow(row: typeof contentDesigns.$inferSelect): StoredMotion {
  const data = (row.data ?? {}) as Record<string, unknown>;
  const spec = normalizeMotionSpec({ ...(data.spec as object), title: row.title, eventId: row.eventId });
  const render = normalizeRenderState(data.render);
  const summary = summarizeRender(render, Date.now());
  const hash = specHash(spec);
  const publicacion = normalizePublicacion(data.publicacion);
  return {
    id: row.id,
    spec,
    updatedAt: row.updatedAt,
    render: summary,
    renderFresh: !!summary.contentHash && summary.contentHash === hash,
    publicacion: { ...publicacion, estadoActual: effectiveEstado(publicacion, hash) },
  };
}

export async function listMotionVideos(): Promise<MotionListItem[]> {
  const db = await requireDb();
  const rows = await db.select().from(contentDesigns).where(eq(contentDesigns.kind, MOTION_KIND)).orderBy(desc(contentDesigns.updatedAt)).limit(MAX_LISTED);
  const items: MotionListItem[] = [];
  for (const row of rows) {
    // Un video con datos raros nunca debe esconder a los demás: si no se puede leer, aparece igual para poder abrirlo o borrarlo.
    try {
      const m = fromRow(row);
      items.push({ id: m.id, title: m.spec.title, eventId: m.spec.eventId, template: m.spec.template, style: m.spec.style, format: m.spec.format, updatedAt: m.updatedAt, render: m.render, renderFresh: m.renderFresh, publicacion: m.publicacion.estadoActual });
    } catch (err) {
      console.warn('[motionStudio] no se pudo leer el video', row.id, err);
      const fallback = normalizeMotionSpec({ title: row.title, eventId: row.eventId });
      items.push({ id: row.id, title: row.title || fallback.title, eventId: row.eventId, template: fallback.template, style: fallback.style, format: fallback.format, updatedAt: row.updatedAt, render: summarizeRender(normalizeRenderState(null), Date.now()), renderFresh: false, publicacion: 'por_aprobar' });
    }
  }
  return items;
}

export async function getMotionVideo(id: number): Promise<StoredMotion | null> {
  const db = await requireDb();
  const [row] = await db.select().from(contentDesigns).where(and(eq(contentDesigns.id, id), eq(contentDesigns.kind, MOTION_KIND))).limit(1);
  return row ? fromRow(row) : null;
}

/** Crea (sin `id`) o reemplaza un video. Guardar no borra la última grabación (el panel avisa si quedó vieja). */
export async function saveMotionVideo(id: number | undefined, raw: unknown): Promise<number> {
  const spec = normalizeMotionSpec(raw);
  const db = await requireDb();
  const values = {
    kind: MOTION_KIND,
    eventId: spec.eventId,
    title: spec.title,
    theme: spec.style,
    // La columna solo conoce historia/post/carrusel: 9:16 es historia, el resto post.
    format: spec.format === 'reel' ? ('historia' as const) : ('post' as const),
  };
  if (id != null) {
    const [existing] = await db.select({ kind: contentDesigns.kind, data: contentDesigns.data }).from(contentDesigns).where(eq(contentDesigns.id, id)).limit(1);
    if (!existing) throw new Error('Ese video ya no existe.');
    if (existing.kind !== MOTION_KIND) throw new Error('Eso no es un video del Estudio.');
    // Editar no borra la grabación ni el historial de publicación: el hash decide si la aprobación sigue valiendo.
    const old = (existing.data as Record<string, unknown> | null) ?? {};
    const keep: Record<string, unknown> = {};
    if (old.render) keep.render = old.render;
    if (old.publicacion) keep.publicacion = old.publicacion;
    await db.update(contentDesigns).set({ ...values, data: { spec, ...keep } }).where(eq(contentDesigns.id, id));
    return id;
  }
  const [result] = await db.insert(contentDesigns).values({ ...values, data: { spec } });
  return result.insertId;
}

export async function deleteMotionVideo(id: number): Promise<void> {
  const db = await requireDb();
  await db.delete(contentDesignMessages).where(eq(contentDesignMessages.designId, id));
  await db.delete(contentDesigns).where(and(eq(contentDesigns.id, id), inArray(contentDesigns.kind, [MOTION_KIND, 'video', 'ia', 'plantilla'])));
}

/* --- Cola de la marca: aprobar y publicar como Reel ---------------------- */

async function readMotionRow(id: number) {
  const db = await requireDb();
  const [row] = await db.select().from(contentDesigns).where(and(eq(contentDesigns.id, id), eq(contentDesigns.kind, MOTION_KIND))).limit(1);
  if (!row) throw new Error('Ese video ya no existe.');
  const data = (row.data ?? {}) as Record<string, unknown>;
  const spec = normalizeMotionSpec({ ...(data.spec as object), title: row.title, eventId: row.eventId });
  return { db, row, data, spec, hash: specHash(spec), publicacion: normalizePublicacion(data.publicacion), render: summarizeRender(normalizeRenderState(data.render), Date.now()) };
}

async function writePublicacion(id: number, publicacion: Publicacion): Promise<void> {
  const db = await requireDb();
  const [row] = await db.select({ data: contentDesigns.data, updatedAt: contentDesigns.updatedAt }).from(contentDesigns).where(eq(contentDesigns.id, id)).limit(1);
  if (!row) throw new Error('Ese video ya no existe.');
  // Igual que la grabación: no es editar, así que se conserva la fecha de la última edición.
  await db.update(contentDesigns).set({ data: { ...(row.data as object), publicacion }, updatedAt: row.updatedAt }).where(eq(contentDesigns.id, id));
}

/** El dueño aprueba: solo si el MP4 ya está grabado y corresponde a esta versión del video. */
export async function approveMotionVideo(id: number): Promise<void> {
  const { publicacion, render, hash } = await readMotionRow(id);
  if (publicacion.estado === 'publicado') throw new Error('Ese video ya está publicado en Instagram.');
  if (render.status !== 'listo' || !render.url || render.contentHash !== hash) {
    throw new Error('Primero graba el MP4 de esta versión del video. Para aprobar, el archivo tiene que corresponder al guion actual.');
  }
  await writePublicacion(id, { ...publicacion, estado: 'aprobado', aprobadoHash: hash, aprobadoAt: Date.now(), error: null });
}

/** Quita la aprobación (vuelve a «por aprobar»). No aplica a lo ya publicado. */
export async function unapproveMotionVideo(id: number): Promise<void> {
  const { publicacion } = await readMotionRow(id);
  if (publicacion.estado === 'publicado') throw new Error('Lo ya publicado no se puede desaprobar.');
  await writePublicacion(id, { ...publicacion, estado: 'por_aprobar', aprobadoHash: null, aprobadoAt: null });
}

/** Publica como Reel en @mansionplayroom. Solo si está aprobado y la aprobación corresponde al contenido actual. */
export async function publishMotionVideo(id: number): Promise<{ igMediaId: string }> {
  const { publicacion, render, hash, spec } = await readMotionRow(id);
  if (publicacion.estado === 'publicado') throw new Error('Ese video ya está publicado en Instagram.');
  if (effectiveEstado(publicacion, hash) !== 'aprobado') throw new Error('Aprueba el video antes de publicarlo.');
  if (!render.url || render.status !== 'listo') throw new Error('Falta el MP4 grabado de esta versión.');
  try {
    const { mediaId } = await publishReel({ videoUrl: render.url, caption: spec.caption });
    await writePublicacion(id, { ...publicacion, estado: 'publicado', publicadoAt: Date.now(), igMediaId: mediaId, error: null });
    return { igMediaId: mediaId };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'No se pudo publicar.';
    // Se guarda el error para que el dueño lo vea; el video sigue «aprobado» para reintentar.
    await writePublicacion(id, { ...publicacion, error: message });
    throw err;
  }
}

/* --- Grabación (server/studioRender.ts) ------------------------------------
 * También lee los videos viejos (kind 'video', de HyperFrames) para que los
 * MP4 ya grabados se sigan pudiendo mandar a los embajadores. */

export async function readVideoRender(id: number): Promise<{ exists: boolean; render: RenderState | null; title: string; spec: MotionSpec | null }> {
  const db = await requireDb();
  const [row] = await db.select().from(contentDesigns).where(eq(contentDesigns.id, id)).limit(1);
  if (!row || (row.kind !== MOTION_KIND && row.kind !== 'video')) return { exists: false, render: null, title: '', spec: null };
  const data = (row.data ?? {}) as Record<string, unknown>;
  return {
    exists: true,
    render: normalizeRenderState(data.render),
    title: row.title,
    spec: row.kind === MOTION_KIND ? normalizeMotionSpec({ ...(data.spec as object), title: row.title, eventId: row.eventId }) : null,
  };
}

/** Reemplaza solo el estado de grabación, sin tocar el contenido del video. */
export async function writeVideoRender(id: number, render: RenderState): Promise<void> {
  const db = await requireDb();
  const [row] = await db.select({ data: contentDesigns.data, kind: contentDesigns.kind, updatedAt: contentDesigns.updatedAt }).from(contentDesigns).where(eq(contentDesigns.id, id)).limit(1);
  if (!row || (row.kind !== MOTION_KIND && row.kind !== 'video')) throw new Error('Ese video ya no existe.');
  // Se repite `updatedAt` a propósito: grabar no es editar, y la lista se ordena por la última edición.
  await db.update(contentDesigns).set({ data: { ...(row.data as object), render }, updatedAt: row.updatedAt }).where(eq(contentDesigns.id, id));
}

/* --- Plan de contenido -------------------------------------------------- */

export async function savePlan(plan: ContentPlan): Promise<void> {
  const db = await requireDb();
  const values = { kind: PLAN_KIND, eventId: plan.eventId, title: plan.eventTitle.slice(0, 200), theme: 'plan', format: 'post' as const, data: plan };
  const [existing] = await db.select({ id: contentDesigns.id }).from(contentDesigns)
    .where(and(eq(contentDesigns.kind, PLAN_KIND), eq(contentDesigns.eventId, plan.eventId))).limit(1);
  if (existing) await db.update(contentDesigns).set(values).where(eq(contentDesigns.id, existing.id));
  else await db.insert(contentDesigns).values(values);
}

/** El plan guardado de ese evento (o el más reciente de cualquiera). */
export async function loadPlan(eventId?: number | null): Promise<ContentPlan | null> {
  const db = await requireDb();
  const where = eventId ? and(eq(contentDesigns.kind, PLAN_KIND), eq(contentDesigns.eventId, eventId)) : eq(contentDesigns.kind, PLAN_KIND);
  const [row] = await db.select({ data: contentDesigns.data }).from(contentDesigns).where(where).orderBy(desc(contentDesigns.updatedAt)).limit(1);
  return row ? normalizeContentPlan(row.data) : null;
}
