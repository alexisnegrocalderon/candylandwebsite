import { and, desc, eq, notInArray, sql } from 'drizzle-orm';
import { getDb } from './db';
import { contentDesignMessages, contentDesigns } from '../drizzle/schema';
import { normalizeStudioDesign, STUDIO_MAX_DESIGNS_LISTED, type StudioDesign } from '../shared/contentStudio';
import { normalizeAiDesign } from '../shared/studioAi';
import { normalizeSavedStyle, normalizeStudioVideo, type SavedVideoStyle, type StudioVideo, type VideoFormat } from '../shared/studioVideo';
import { normalizeRenderState, summarizeRender, type RenderState, type RenderSummary } from '../shared/studioRender';

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
  | { kind: 'ia'; id: number; title: string; format: StudioDesign['format']; eventId: number | null; updatedAt: Date; slideCount: number; aiCover: { css: string; html: string } | null }
  | { kind: 'video'; id: number; title: string; format: StudioDesign['format']; videoFormat: VideoFormat; template: StudioVideo['template']; theme: StudioVideo['theme']; eventId: number | null; updatedAt: Date; sceneCount: number };

export async function listContentDesigns(): Promise<DesignListItem[]> {
  const db = await requireDb();
  // Los estilos guardados de los videos («Mi estilo») y el contenido de los
  // embajadores (server/ambassadorContent.ts) viven en la misma tabla, pero no son diseños.
  const rows = await db.select().from(contentDesigns).where(notInArray(contentDesigns.kind, ['estilo', 'embajador', 'staff'])).orderBy(desc(contentDesigns.updatedAt)).limit(STUDIO_MAX_DESIGNS_LISTED);
  return rows.flatMap((row): DesignListItem[] => {
    if (row.kind === 'video') {
      const video = toVideo(row);
      if (!video) return [];
      return [{
        kind: 'video' as const, id: row.id, title: video.title, format: row.format, videoFormat: video.format, template: video.template, theme: video.theme,
        eventId: video.eventId, updatedAt: row.updatedAt, sceneCount: video.template === 'laminas' ? video.design?.slides.length ?? 0 : video.scenes.length,
      }];
    }
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
  // Un diseño de IA o un video no se abre en el editor de plantillas.
  return row && row.kind !== 'ia' && row.kind !== 'video' && row.kind !== 'embajador' && row.kind !== 'staff' && row.kind !== 'estilo' ? toStored(row) : null;
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
    data: { slides: design.slides, caption: design.caption, showBrand: design.showBrand },
  };
  if (id != null) {
    // Se mira antes de escribir: `affectedRows` de MySQL no distingue "no
    // existe" de "no cambió nada" (guardar dos veces lo mismo).
    const [existing] = await db.select({ id: contentDesigns.id, kind: contentDesigns.kind }).from(contentDesigns).where(eq(contentDesigns.id, id)).limit(1);
    if (!existing) throw new Error('Ese diseño ya no existe.');
    if (existing.kind === 'ia') throw new Error('Ese diseño es del Diseñador IA: se edita desde ahí.');
    if (existing.kind === 'video') throw new Error('Eso es un video: se edita desde el editor de video.');
    if (existing.kind === 'embajador') throw new Error('Eso es contenido de embajadores: se edita desde ahí.');
    if (existing.kind === 'staff' || existing.kind === 'estilo') throw new Error('Eso no es un diseño del Estudio.');
    await db.update(contentDesigns).set(values).where(eq(contentDesigns.id, id));
    return id;
  }
  const [result] = await db.insert(contentDesigns).values(values);
  return result.insertId;
}

/* --- Videos (shared/studioVideo.ts) ---------------------------------------
 * Van en la misma tabla, con `kind = 'video'`: `format` guarda historia (reel
 * 9:16) o post (feed 3:4) para que la columna siga siendo la de siempre, y el
 * video completo va en `data`. */

export interface StoredVideo extends StudioVideo {
  id: number;
  updatedAt: Date;
  /** La última grabación a MP4 (shared/studioRender.ts). */
  render: RenderSummary;
}

function toVideo(row: typeof contentDesigns.$inferSelect): StudioVideo | null {
  return normalizeStudioVideo({ ...(row.data as object), title: row.title, theme: row.theme, eventId: row.eventId }, normalizeStudioDesign);
}

export async function getContentVideo(id: number): Promise<StoredVideo | null> {
  const db = await requireDb();
  const [row] = await db.select().from(contentDesigns).where(eq(contentDesigns.id, id)).limit(1);
  if (!row || row.kind !== 'video') return null;
  const video = toVideo(row);
  const render = normalizeRenderState((row.data as Record<string, unknown> | null)?.render);
  return video ? { ...video, id: row.id, updatedAt: row.updatedAt, render: summarizeRender(render, Date.now()) } : null;
}

/** El estado de grabación guardado en el video (null si no es un video o nunca se grabó). */
export async function readVideoRender(id: number): Promise<{ exists: boolean; render: RenderState | null; title: string }> {
  const db = await requireDb();
  const [row] = await db.select().from(contentDesigns).where(eq(contentDesigns.id, id)).limit(1);
  if (!row || row.kind !== 'video') return { exists: false, render: null, title: '' };
  return { exists: true, render: normalizeRenderState((row.data as Record<string, unknown> | null)?.render), title: row.title };
}

/** Reemplaza solo el estado de grabación, sin tocar el contenido del video. */
export async function writeVideoRender(id: number, render: RenderState): Promise<void> {
  const db = await requireDb();
  const [row] = await db.select({ data: contentDesigns.data, kind: contentDesigns.kind, updatedAt: contentDesigns.updatedAt }).from(contentDesigns).where(eq(contentDesigns.id, id)).limit(1);
  if (!row || row.kind !== 'video') throw new Error('Ese video ya no existe.');
  // Se repite `updatedAt` a propósito: grabar no es editar, y la lista se ordena por la última edición.
  await db.update(contentDesigns).set({ data: { ...(row.data as object), render }, updatedAt: row.updatedAt }).where(eq(contentDesigns.id, id));
}

/** Crea (sin `id`) o reemplaza un video. Devuelve el id. */
export async function saveContentVideo(id: number | undefined, raw: unknown): Promise<number> {
  const video = normalizeStudioVideo(raw, normalizeStudioDesign);
  if (!video) throw new Error('El video no tiene ninguna escena.');
  const db = await requireDb();
  const { title, theme, eventId, ...data } = video;
  const values = { kind: 'video', eventId, title, theme, format: video.format === 'reel' ? 'historia' as const : 'post' as const, data };
  if (id != null) {
    const [existing] = await db.select({ id: contentDesigns.id, kind: contentDesigns.kind, data: contentDesigns.data }).from(contentDesigns).where(eq(contentDesigns.id, id)).limit(1);
    if (!existing) throw new Error('Ese video ya no existe.');
    if (existing.kind !== 'video') throw new Error('Eso no es un video.');
    // Guardar el contenido no borra la última grabación (el panel avisa si quedó vieja).
    const render = (existing.data as Record<string, unknown> | null)?.render;
    await db.update(contentDesigns).set({ ...values, data: render ? { ...data, render } : data }).where(eq(contentDesigns.id, id));
    return id;
  }
  const [result] = await db.insert(contentDesigns).values(values);
  return result.insertId;
}

/* «Mi estilo» de los videos: plantilla, diseño, logo y música guardados con
 * un nombre. Son filas de contentDesigns con kind 'estilo' (no hace falta
 * otra tabla); la lista de diseños las deja fuera. */
const MAX_SAVED_STYLES = 30;

export async function listVideoStyles(): Promise<Array<SavedVideoStyle & { id: number }>> {
  const db = await requireDb();
  const rows = await db.select({ id: contentDesigns.id, title: contentDesigns.title, data: contentDesigns.data }).from(contentDesigns)
    .where(eq(contentDesigns.kind, 'estilo')).orderBy(desc(contentDesigns.updatedAt)).limit(MAX_SAVED_STYLES);
  return rows.flatMap((r) => {
    const style = normalizeSavedStyle({ ...(r.data as object), name: r.title });
    return style ? [{ ...style, id: r.id }] : [];
  });
}

/** Guarda un estilo nuevo, o reemplaza el que tiene el mismo nombre. */
export async function saveVideoStyle(raw: unknown): Promise<number> {
  const style = normalizeSavedStyle(raw);
  if (!style) throw new Error('Ponle un nombre al estilo.');
  const db = await requireDb();
  const { name, theme, ...data } = style;
  const [same] = await db.select({ id: contentDesigns.id }).from(contentDesigns)
    .where(and(eq(contentDesigns.kind, 'estilo'), eq(contentDesigns.title, name))).limit(1);
  if (same) {
    await db.update(contentDesigns).set({ theme, data }).where(eq(contentDesigns.id, same.id));
    return same.id;
  }
  const [{ n }] = await db.select({ n: sql<number>`count(*)` }).from(contentDesigns).where(eq(contentDesigns.kind, 'estilo'));
  if (Number(n) >= MAX_SAVED_STYLES) throw new Error(`Ya tienes ${MAX_SAVED_STYLES} estilos guardados: borra alguno primero.`);
  const [result] = await db.insert(contentDesigns).values({ kind: 'estilo', title: name, theme, format: 'post', eventId: null, data });
  return result.insertId;
}

export async function deleteVideoStyle(id: number): Promise<void> {
  const db = await requireDb();
  await db.delete(contentDesigns).where(and(eq(contentDesigns.id, id), eq(contentDesigns.kind, 'estilo')));
}

export async function deleteContentDesign(id: number): Promise<void> {
  const db = await requireDb();
  await db.delete(contentDesignMessages).where(eq(contentDesignMessages.designId, id));
  await db.delete(contentDesigns).where(eq(contentDesigns.id, id));
}
