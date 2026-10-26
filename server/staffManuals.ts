/* El manual del staff en la base (drizzle/0131): versiones publicadas y quién aceptó cuál. Las reglas puras están en
 * shared/staffManuals.ts. Cada publicación crea una versión nueva; una versión publicada nunca se edita, así la
 * aceptación de alguien siempre apunta al texto exacto que leyó. */
import { desc, eq, inArray } from 'drizzle-orm';
import { staffManualAcceptances, staffManuals, staffMembers } from '../drizzle/schema';
import { getDb } from './db';
import {
  MANUAL_LIMITS, acceptanceStatus, manualKeysFor, normalizeSections, type AcceptStatus, type ManualKey, type ManualSection,
} from '../shared/staffManuals';

async function need() {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  return db;
}

export interface PublishedManual {
  key: string; version: number; title: string; sections: ManualSection[]; changeNote: string | null; publishedAt: Date;
}

/** La versión vigente (la más alta) de cada manual publicado. */
export async function currentManuals(keys?: string[]): Promise<PublishedManual[]> {
  const db = await need();
  const rows = await db.select().from(staffManuals)
    .where(keys && keys.length ? inArray(staffManuals.manualKey, keys) : undefined)
    .orderBy(desc(staffManuals.version));
  const seen = new Set<string>();
  const out: PublishedManual[] = [];
  for (const r of rows) {
    if (seen.has(r.manualKey)) continue;
    seen.add(r.manualKey);
    out.push({ key: r.manualKey, version: r.version, title: r.title, sections: normalizeSections(r.sections), changeNote: r.changeNote ?? null, publishedAt: r.publishedAt });
  }
  return out;
}

/** Publica una versión nueva del manual (la siguiente a la última). */
export async function publishManual(input: { key: ManualKey; title: string; sections: unknown; changeNote?: string | null }) {
  const sections = normalizeSections(input.sections);
  if (sections.length === 0) throw new Error('Agrega al menos una sección con contenido.');
  const title = input.title.trim().slice(0, MANUAL_LIMITS.docTitle);
  if (!title) throw new Error('Ponle un título al manual.');
  const db = await need();
  const [last] = await db.select({ v: staffManuals.version }).from(staffManuals).where(eq(staffManuals.manualKey, input.key)).orderBy(desc(staffManuals.version)).limit(1);
  const version = (last?.v ?? 0) + 1;
  await db.insert(staffManuals).values({ manualKey: input.key, version, title, sections, changeNote: input.changeNote?.trim().slice(0, MANUAL_LIMITS.changeNote) || null });
  return { version };
}

/** Todas las versiones de un manual, de la más nueva a la más vieja (para el historial del admin). */
export async function manualHistory(key: ManualKey) {
  const db = await need();
  const rows = await db.select().from(staffManuals).where(eq(staffManuals.manualKey, key)).orderBy(desc(staffManuals.version)).limit(30);
  return rows.map((r) => ({ version: r.version, title: r.title, changeNote: r.changeNote ?? null, publishedAt: r.publishedAt }));
}

/** La última versión que aceptó cada persona, por manual. */
async function latestAcceptances(staffIds: number[]): Promise<Map<number, Map<string, number>>> {
  const out = new Map<number, Map<string, number>>();
  if (staffIds.length === 0) return out;
  const db = await need();
  const rows = await db.select({ staffId: staffManualAcceptances.staffId, key: staffManualAcceptances.manualKey, v: staffManualAcceptances.version })
    .from(staffManualAcceptances).where(inArray(staffManualAcceptances.staffId, staffIds));
  for (const r of rows) {
    const m = out.get(r.staffId) ?? new Map<string, number>();
    m.set(r.key, Math.max(m.get(r.key) ?? 0, r.v));
    out.set(r.staffId, m);
  }
  return out;
}

/** Lo que ve una persona del staff: su reglamento general y el manual de su cargo, con lo que ya aceptó. */
export async function manualForStaff(staff: { id: number; cargo: string | null }) {
  const keys = manualKeysFor(staff.cargo);
  const docs = await currentManuals(keys);
  const accepted = (await latestAcceptances([staff.id])).get(staff.id) ?? new Map<string, number>();
  const ordered = keys.map((k) => docs.find((d) => d.key === k)).filter((d): d is PublishedManual => !!d);
  const status = acceptanceStatus(keys, new Map(docs.map((d) => [d.key, d.version])), accepted);
  return {
    status,
    documents: ordered.map((d) => ({ ...d, acceptedVersion: accepted.get(d.key) ?? null })),
  };
}

/** «Leí y acepto»: guarda la aceptación de cada manual vigente que le toca y todavía no aceptó (idempotente). */
export async function acceptManuals(staff: { id: number; cargo: string | null; name: string; rut: string | null }, meta: { userAgent?: string | null; ip?: string | null }) {
  const db = await need();
  const docs = await currentManuals(manualKeysFor(staff.cargo));
  if (docs.length === 0) throw new Error('Todavía no hay un manual publicado para tu cargo.');
  const accepted = (await latestAcceptances([staff.id])).get(staff.id) ?? new Map<string, number>();
  let added = 0;
  for (const d of docs) {
    if ((accepted.get(d.key) ?? 0) >= d.version) continue;
    await db.insert(staffManualAcceptances).values({
      staffId: staff.id, manualKey: d.key, version: d.version, fullName: staff.name.slice(0, 120), rut: staff.rut?.slice(0, 20) ?? null,
      userAgent: meta.userAgent?.slice(0, 255) ?? null, ip: meta.ip?.slice(0, 64) ?? null,
    }).onDuplicateKeyUpdate({ set: { version: d.version } });
    added++;
  }
  return { added };
}

/** Para el admin: quién aceptó lo vigente y quién no, por persona activa. */
export async function acceptanceOverview(): Promise<{ staffId: number; status: AcceptStatus; acceptedAt: Date | null }[]> {
  const db = await need();
  const people = await db.select({ id: staffMembers.id, cargo: staffMembers.cargo }).from(staffMembers).where(eq(staffMembers.active, 1));
  const docs = await currentManuals();
  const published = new Map(docs.map((d) => [d.key, d.version]));
  const accepted = await latestAcceptances(people.map((p) => p.id));
  const when = new Map<number, Date>();
  if (people.length) {
    const rows = await db.select({ staffId: staffManualAcceptances.staffId, at: staffManualAcceptances.acceptedAt }).from(staffManualAcceptances)
      .where(inArray(staffManualAcceptances.staffId, people.map((p) => p.id))).orderBy(desc(staffManualAcceptances.acceptedAt));
    for (const r of rows) if (!when.has(r.staffId)) when.set(r.staffId, r.at);
  }
  return people.map((p) => ({
    staffId: p.id,
    status: acceptanceStatus(manualKeysFor(p.cargo), published, accepted.get(p.id) ?? new Map()),
    acceptedAt: when.get(p.id) ?? null,
  }));
}

/** El historial de aceptaciones de una persona (el respaldo). */
export async function acceptanceLog(staffId: number) {
  const db = await need();
  return db.select().from(staffManualAcceptances).where(eq(staffManualAcceptances.staffId, staffId)).orderBy(desc(staffManualAcceptances.acceptedAt)).limit(50);
}

