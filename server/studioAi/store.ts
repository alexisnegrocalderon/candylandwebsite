import { and, asc, eq } from 'drizzle-orm';
import { getDb } from '../db';
import { contentDesignMessages, contentDesigns } from '../../drizzle/schema';
import { normalizeAiDesign, type AiDesign, type AiUsage } from '../../shared/studioAi';
import { sanitizeCss, sanitizeSlideHtml } from './sanitize';

/* Diseños del Diseñador IA en la base: la fila de contentDesigns (kind "ia")
 * y su conversación en contentDesignMessages. Todo diseño que se escribe pasa
 * por `cleanDesign`: forma (normalizeAiDesign) + HTML/CSS saneado. */

async function requireDb() {
  const db = await getDb();
  if (!db) throw new Error('La base de datos no está disponible.');
  return db;
}

export function cleanDesign(raw: unknown): AiDesign {
  const design = normalizeAiDesign(raw);
  return {
    ...design,
    css: sanitizeCss(design.css),
    slides: design.slides.map((s) => ({ html: sanitizeSlideHtml(s.html) })).filter((s) => s.html.length > 0),
  };
}

function rowValues(design: AiDesign) {
  return {
    eventId: design.eventId,
    title: design.title,
    format: design.format,
    theme: 'ia',
    kind: 'ia',
    data: { css: design.css, slides: design.slides, caption: design.caption, concept: design.concept },
  };
}

export async function createAiDesign(design: AiDesign): Promise<number> {
  const db = await requireDb();
  const [result] = await db.insert(contentDesigns).values(rowValues(cleanDesign(design)));
  return result.insertId;
}

export async function saveAiDesign(id: number, design: AiDesign): Promise<AiDesign> {
  const db = await requireDb();
  const clean = cleanDesign(design);
  await db.update(contentDesigns).set(rowValues(clean)).where(and(eq(contentDesigns.id, id), eq(contentDesigns.kind, 'ia')));
  return clean;
}

export async function loadAiDesign(id: number): Promise<AiDesign | null> {
  const db = await requireDb();
  const [row] = await db.select().from(contentDesigns).where(and(eq(contentDesigns.id, id), eq(contentDesigns.kind, 'ia'))).limit(1);
  if (!row) return null;
  return normalizeAiDesign({ ...(row.data as object), title: row.title, format: row.format, eventId: row.eventId });
}

export interface AiMessage {
  id: number;
  role: 'user' | 'assistant';
  text: string;
  images: string[];
  model: string | null;
  costUsd: number | null;
  hasSnapshot: boolean;
  createdAt: Date;
}

function toMessage(row: typeof contentDesignMessages.$inferSelect): AiMessage {
  return {
    id: row.id,
    role: row.role,
    text: row.text,
    images: Array.isArray(row.images) ? (row.images as unknown[]).filter((u): u is string => typeof u === 'string') : [],
    model: row.model,
    costUsd: row.costUsd == null ? null : Number(row.costUsd),
    hasSnapshot: row.snapshot != null,
    createdAt: row.createdAt,
  };
}

export async function listAiMessages(designId: number): Promise<AiMessage[]> {
  const db = await requireDb();
  const rows = await db.select().from(contentDesignMessages).where(eq(contentDesignMessages.designId, designId)).orderBy(asc(contentDesignMessages.id));
  return rows.map(toMessage);
}

export async function addAiMessage(input: {
  designId: number;
  role: 'user' | 'assistant';
  text: string;
  images?: string[];
  model?: string;
  usage?: AiUsage;
  costUsd?: number;
  snapshot?: AiDesign;
}): Promise<number> {
  const db = await requireDb();
  const [result] = await db.insert(contentDesignMessages).values({
    designId: input.designId,
    role: input.role,
    text: input.text.slice(0, 20_000),
    images: input.images ?? null,
    model: input.model ?? null,
    usage: input.usage ?? null,
    costUsd: input.costUsd != null ? input.costUsd.toFixed(4) : null,
    snapshot: input.snapshot ?? null,
  });
  return result.insertId;
}

/** Vuelve el diseño a como quedó después de una respuesta de la IA. La
 * conversación no se borra: la restauración queda anotada en ella. */
export async function restoreAiVersion(designId: number, messageId: number): Promise<AiDesign> {
  const db = await requireDb();
  const [row] = await db.select().from(contentDesignMessages)
    .where(and(eq(contentDesignMessages.id, messageId), eq(contentDesignMessages.designId, designId))).limit(1);
  if (!row?.snapshot) throw new Error('Esa versión no existe.');
  const restored = await saveAiDesign(designId, normalizeAiDesign(row.snapshot));
  await addAiMessage({ designId, role: 'assistant', text: 'Volví el diseño a una versión anterior.', snapshot: restored });
  return restored;
}

/** Cambios hechos a mano en el panel (por ahora: nombre y caption). */
export async function updateAiDesignMeta(designId: number, patch: { title?: string; caption?: string }): Promise<AiDesign> {
  const current = await loadAiDesign(designId);
  if (!current) throw new Error('Ese diseño ya no existe.');
  return saveAiDesign(designId, { ...current, ...patch });
}
