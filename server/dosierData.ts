/* Junta lo que dibuja el dosier (server/dosierPdf.ts) desde la carta y las recetas del evento. */
import { eq } from "drizzle-orm";
import { getDb } from "./db";
import { events } from "../drizzle/schema";
import { estadoBarra } from "./insumos";
import { armarFichas, type DosierFichas } from "../shared/dosierFicha";
import type { DosierData } from "./dosierPdf";

/** Descarga la foto del trago; solo JPEG o PNG (lo que pdfkit sabe dibujar). Nunca lanza. */
async function fotoBuffer(url: string | null): Promise<Buffer | null> {
  if (!url) return null;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 6000);
    const res = await fetch(url, { signal: ctrl.signal });
    clearTimeout(timer);
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    // Una foto pesada haría pasar el PDF del tope de respuesta de Vercel (~4,5 MB); el editor ya las sube achicadas.
    if (buf.length > 1_200_000) return null;
    const jpeg = buf[0] === 0xff && buf[1] === 0xd8;
    const png = buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
    return jpeg || png ? buf : null;
  } catch {
    return null;
  }
}

/** Fichas del evento (sin descargar fotos): lo que usan las pantallas de la app y, con fotos, el PDF. */
export async function dosierFichas(eventId: number): Promise<DosierFichas | null> {
  const db = await getDb();
  if (!db) return null;
  const [ev] = await db.select({ title: events.title }).from(events).where(eq(events.id, eventId)).limit(1);
  if (!ev) return null;
  const estado = await estadoBarra(eventId);
  if (!estado.ready) return { eventTitle: ev.title, fichas: [], talCual: [] };
  return armarFichas(ev.title, estado.productos, estado.insumos);
}

export async function dosierData(eventId: number): Promise<DosierData | null> {
  const d = await dosierFichas(eventId);
  if (!d) return null;
  const conFoto = await Promise.all(d.fichas.map(async (f) => ({ f, foto: await fotoBuffer(f.foto) })));
  // Tope total de fotos para que el PDF siga bajo el límite de respuesta de Vercel.
  let presupuesto = 3_000_000;
  for (const x of conFoto) {
    if (!x.foto) continue;
    if (x.foto.length > presupuesto) x.foto = null; else presupuesto -= x.foto.length;
  }
  return { eventTitle: d.eventTitle, emittedAt: new Date(), tragos: conFoto.map(({ f, foto }) => ({ ...f, foto })), talCual: d.talCual };
}
