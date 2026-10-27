/* Junta lo que dibuja el dosier (server/dosierPdf.ts) desde la carta y las recetas del evento. */
import { eq } from "drizzle-orm";
import { getDb } from "./db";
import { events } from "../drizzle/schema";
import { estadoBarra } from "./insumos";
import { esJiggerExacto, formatJiggers, glassInfo, mlAJiggers, pasosSugeridos } from "../shared/insumos";
import type { DosierData, DosierTrago } from "./dosierPdf";

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

const texto = (amount: number, unit: string) => {
  if (unit === "ml") return esJiggerExacto(amount) ? `${formatJiggers(mlAJiggers(amount))} · ${amount} ml` : `${amount} ml`;
  if (unit === "un") return amount === 1 ? "1 unidad" : `${amount} unidades`;
  return `${amount} ${unit}`;
};

export async function dosierData(eventId: number): Promise<DosierData | null> {
  const db = await getDb();
  if (!db) return null;
  const [ev] = await db.select({ title: events.title }).from(events).where(eq(events.id, eventId)).limit(1);
  if (!ev) return null;
  const estado = await estadoBarra(eventId);
  if (!estado.ready) return { eventTitle: ev.title, emittedAt: new Date(), tragos: [], talCual: [] };
  const insumo = new Map(estado.insumos.map((i) => [i.id, i]));
  const visibles = estado.productos.filter((p) => !p.oculto && !p.sinInsumos && p.receta.length > 0);

  const tragos: DosierTrago[] = [];
  const talCual: DosierData["talCual"] = [];
  const conFoto = await Promise.all(visibles.map(async (p) => ({ p, foto: await fotoBuffer(p.foto) })));
  // Tope total de fotos para que el PDF siga bajo el límite de respuesta de Vercel.
  let presupuesto = 3_000_000;
  for (const x of conFoto) {
    if (!x.foto) continue;
    if (x.foto.length > presupuesto) x.foto = null; else presupuesto -= x.foto.length;
  }
  for (const { p, foto } of conFoto) {
    const section = p.groupName || "Carta";
    if (p.glass === "botella") { talCual.push({ name: p.name, section }); continue; }
    const g = glassInfo(p.glass);
    const reemplazadas = new Set(p.opciones.map((o) => o.reemplaza).filter((x): x is number => x != null));
    const lineas = p.receta
      .filter((r) => !reemplazadas.has(r.insumoId))
      .map((r) => {
        const i = insumo.get(r.insumoId);
        return { name: i?.name ?? "Insumo", unit: i?.unit ?? "ml", amount: r.amount, texto: texto(r.amount, i?.unit ?? "ml"), insumoId: r.insumoId };
      });
    const pasos = p.pasos.length ? p.pasos : pasosSugeridos({ glass: p.glass, lineas: lineas.map((l) => ({ ...l, unit: l.unit as any })), extras: p.extras, opciones: p.opciones });
    tragos.push({
      name: p.name, section, glass: p.glass, glassLabel: g?.label ?? "Vaso", glassMl: g?.ml ?? 0,
      lineas: lineas.map(({ insumoId: _i, ...l }) => l),
      opciones: p.opciones.map((o) => ({ label: o.label, choices: o.choices.map((c) => c.label), ml: Math.max(0, ...o.choices.filter((c) => insumo.get(c.insumoId)?.unit === "ml").map((c) => c.amount)) })),
      extras: p.extras, pasos, foto,
    });
  }
  const orden = (a: { section: string; name: string }, b: { section: string; name: string }) => a.section.localeCompare(b.section) || a.name.localeCompare(b.name);
  tragos.sort(orden);
  talCual.sort(orden);
  return { eventTitle: ev.title, emittedAt: new Date(), tragos, talCual };
}
