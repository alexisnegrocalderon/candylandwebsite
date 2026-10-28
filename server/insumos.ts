/* Stock de la barra por insumos (shared/insumos.ts tiene las reglas puras).
 *
 * - El stock de un insumo es la suma de `insumoMovimientos` (nunca se pisa).
 * - Cada venta de /caja descuenta según la receta del trago (`descontarVenta`,
 *   lo llama server/caja/sale.ts) y cada anulación lo devuelve.
 * - El conteo de barra (apertura / cierre de turno) deja el stock igual a lo
 *   contado con un movimiento `conteo_ajuste`, y guarda el descuadre.
 *
 * Nada de lo que llama la caja lanza: si las tablas todavía no existen
 * (migración 0132 sin aplicar) la venta sigue como siempre, sin descontar. */
import { and, desc, eq, gte, inArray, lt, ne, sql } from "drizzle-orm";
import {
  events, insumoConteoLineas, insumoConteos, insumoMovimientos, insumoRecetas, insumos, orderItems, orders, ticketTypes, tickets,
} from "../drizzle/schema";
import { getDb } from "./db";
import { insumoSchemaStatus } from "./schemaUpdates";
import { personasForTicket } from "../shared/mission300";
import { DOSIER_INSUMOS, DOSIER_SUPUESTOS, planDosier } from "../shared/dosier";
import {
  DEFAULT_GLASS, aplicarUso, conteoATotal, extrasDeMetadata, metadataConExtras, metadataConOpciones, opcionesDeMetadata, metadataConPreparacion, pasosDeMetadata, fotoDeMetadata, recetaConOpciones, type OpcionGrupo, metadataConSinInsumos, productoSinInsumos, TIPOS_PRODUCTO, type TipoProducto, consumoDeVenta, descuadre, detalleATotal, insumoSizes, recetaDe, nivelInsumo, normalizeName, proyeccionCompra, tragosDisponibles, tragosPorInsumo,
  OPEN_PORTIONS, type ConteoDetalle, type Insumo, type InsumoUnit, type MovimientoKind, type RecetaLinea,
  diagnosticoProducto, sugerirReemplazos,
} from "../shared/insumos";

/** Evento de pruebas de la caja: sus ventas no son reales y no gastan botellas. */
const TEST_EVENT_SLUG = "pruebas-caja";

const n = (v: unknown) => Number(v ?? 0);

function toInsumo(r: any): Insumo & { active: boolean; sortOrder: number } {
  return {
    id: r.id, name: r.name, unit: r.unit as InsumoUnit, containerSize: n(r.containerSize), containerLabel: r.containerLabel,
    sizes: Array.isArray(r.sizes) ? (r.sizes as unknown[]).map(Number).filter((s) => s > 0) : null,
    costPerContainer: r.costPerContainer != null ? n(r.costPerContainer) : null, alertDrinks: n(r.alertDrinks),
    active: n(r.active) === 1, sortOrder: n(r.sortOrder),
  };
}

// Mientras falte la migración, no se vuelve a preguntar a information_schema en cada venta.
let notReadyUntil = 0;
async function ready(): Promise<boolean> {
  if (Date.now() < notReadyUntil) return false;
  try {
    const ok = (await insumoSchemaStatus()).ready;
    if (!ok) notReadyUntil = Date.now() + 60_000;
    return ok;
  } catch { return false; }
}

async function dbOrThrow() {
  const db = await getDb();
  if (!db) throw new Error("Base de datos no disponible");
  return db;
}

// --- Lecturas ---

export async function listInsumos(includeInactive = false) {
  const db = await dbOrThrow();
  const rows = await db.select().from(insumos).orderBy(insumos.sortOrder, insumos.name);
  return rows.map(toInsumo).filter((i) => includeInactive || i.active);
}

export async function stockMap(db?: any): Promise<Map<number, number>> {
  const d = db ?? (await dbOrThrow());
  const rows = await d.select({ insumoId: insumoMovimientos.insumoId, total: sql<string>`SUM(${insumoMovimientos.delta})` })
    .from(insumoMovimientos).groupBy(insumoMovimientos.insumoId);
  return new Map<number, number>(rows.map((r: any) => [r.insumoId, Math.round(n(r.total) * 100) / 100]));
}

/** Recetas de los productos de un evento. */
export async function recetasDelEvento(eventId: number, db?: any): Promise<RecetaLinea[]> {
  const d = db ?? (await dbOrThrow());
  const rows = await d.select({ ticketTypeId: insumoRecetas.ticketTypeId, insumoId: insumoRecetas.insumoId, amount: insumoRecetas.amount, glass: insumoRecetas.glass })
    .from(insumoRecetas).innerJoin(ticketTypes, eq(ticketTypes.id, insumoRecetas.ticketTypeId))
    .where(eq(ticketTypes.eventId, eventId));
  return rows.map((r: any) => ({ ticketTypeId: r.ticketTypeId, insumoId: r.insumoId, amount: n(r.amount), glass: (r.glass as string) || DEFAULT_GLASS }));
}

/** Stock con que se abrió la noche: el último conteo de apertura del evento
 * (si no hubo, el stock de antes del primer movimiento del evento). */
async function referenciaApertura(db: any, eventId: number, stock: Map<number, number>): Promise<Map<number, number>> {
  const [apertura] = await db.select({ id: insumoConteos.id }).from(insumoConteos)
    .where(and(eq(insumoConteos.eventId, eventId), eq(insumoConteos.kind, "apertura")))
    .orderBy(insumoConteos.createdAt).limit(1);
  if (apertura) {
    const lines = await db.select().from(insumoConteoLineas).where(eq(insumoConteoLineas.conteoId, apertura.id));
    return new Map(lines.map((l: any) => [l.insumoId, n(l.countedTotal)]));
  }
  // Sin conteo: stock actual menos todo lo que se movió en este evento.
  const moved = await db.select({ insumoId: insumoMovimientos.insumoId, total: sql<string>`SUM(${insumoMovimientos.delta})` })
    .from(insumoMovimientos).where(eq(insumoMovimientos.eventId, eventId)).groupBy(insumoMovimientos.insumoId);
  const ref = new Map(stock);
  for (const m of moved as any[]) ref.set(m.insumoId, (ref.get(m.insumoId) ?? 0) - n(m.total));
  return ref;
}

/** Foto completa de la barra para el admin y para /caja: cada insumo con su
 * stock y para cuántos tragos alcanza, y cada trago con cuántos quedan. */
export async function estadoBarra(eventId: number) {
  if (!(await ready())) return { ready: false as const, insumos: [], productos: [] };
  const db = await dbOrThrow();
  const [all, stock, recetas, products] = await Promise.all([
    listInsumos(),
    stockMap(db),
    recetasDelEvento(eventId, db),
    db.select().from(ticketTypes).where(and(eq(ticketTypes.eventId, eventId), inArray(ticketTypes.category, ["consumo", "merch"]))),
  ]);
  const reference = await referenciaApertura(db, eventId, stock);
  const activos = new Set(all.map((i) => i.id));
  const infoInsumos = all.map((i) => ({ id: i.id, name: i.name, alertDrinks: i.alertDrinks, sinComprar: !stock.has(i.id) }));
  const usedBy = new Map<number, string[]>();
  for (const r of recetas) {
    const name = (products as any[]).find((p) => p.id === r.ticketTypeId)?.name;
    const names = usedBy.get(r.insumoId) ?? [];
    if (name && !names.includes(name)) usedBy.set(r.insumoId, [...names, name]);
  }
  return {
    ready: true as const,
    insumos: all.map((i) => {
      const s = stock.get(i.id) ?? 0;
      const drinks = tragosPorInsumo(i.id, s, recetas);
      return {
        ...i, stock: s, drinks, level: nivelInsumo(drinks, i.alertDrinks),
        // Nunca tuvo stock cargado (no es lo mismo que haberse acabado).
        sinComprar: !stock.has(i.id),
        reference: reference.get(i.id) ?? null, usedBy: usedBy.get(i.id) ?? [],
      };
    }),
    productos: (products as any[]).map((p) => {
      // Cada trago viene en su vaso (vaso, copa o shot) y tiene una sola receta.
      const { glass, lines } = recetaDe(recetas, p.id);
      // Una línea cuyo insumo se archivó ya no existe para la barra: no se muestra, no cuenta para «quedan» y se borra
      // sola al guardar la receta.
      const receta = lines.filter((r) => activos.has(r.insumoId)).map((r) => ({ insumoId: r.insumoId, amount: r.amount }));
      const opciones = opcionesDeMetadata(p.metadata);
      // «Quedan ~N» no cuenta lo que las opciones reemplazan (la bebida de mezcla genérica): la bebida la elige la cajera.
      const recetaBase = receta.filter((l) => !opciones.some((g) => g.reemplaza === l.insumoId));
      const left = tragosDisponibles(recetaBase, stock);
      // Qué insumo hace que se acabe (o ya no alcance) y con qué se podría reemplazar.
      const diag = diagnosticoProducto(recetaBase, infoInsumos, stock);
      const sugerencias: Record<number, { insumoId: number; name: string; drinks: number }[]> = {};
      for (const f of diag ? (diag.faltantes.length ? diag.faltantes : [diag.limitante]) : []) sugerencias[f.insumoId] = sugerirReemplazos(f.insumoId, all, stock, recetaBase);
      return {
        id: p.id as number, name: p.name as string, groupName: (p.groupName as string | null) ?? null, emoji: (p.emoji as string | null) ?? null,
        glass, receta, drinks: left?.drinks ?? null, limitingInsumoId: left?.limitingInsumoId ?? null,
        diagnostico: diag, sugerencias,
        // Lo que lleva sin medida (borde de Tajín, hielo frappé…): solo anotado en el producto.
        extras: extrasDeMetadata(p.metadata),
        opciones,
        // Preparación para el dosier: pasos guardados (vacío = sugeridos) y foto del trago.
        pasos: pasosDeMetadata(p.metadata),
        foto: fotoDeMetadata(p.metadata),
        // Cigarros, merch, comida…: se venden solos, no piden receta. «oculto» = ya no va en la carta.
        sinInsumos: productoSinInsumos(p.category, p.groupName, p.metadata),
        oculto: p.status === 'hidden',
        category: p.category as string,
      };
    }),
  };
}

/** Lo que viaja en el snapshot de /caja para calcular "quedan ~N" sin señal. */
export async function cajaInsumoSnapshot(eventId: number): Promise<{
  insumos: { id: number; name: string; unit: InsumoUnit; containerSize: number; containerLabel: string; stock: number; alertDrinks: number; sinComprar?: boolean }[];
  recetas: RecetaLinea[];
  opciones: Record<number, OpcionGrupo[]>;
} | null> {
  try {
    if (!(await ready())) return null;
    const db = await dbOrThrow();
    const [all, stock, todas, tipos] = await Promise.all([
      listInsumos(), stockMap(db), recetasDelEvento(eventId, db),
      db.select({ id: ticketTypes.id, metadata: ticketTypes.metadata }).from(ticketTypes).where(eq(ticketTypes.eventId, eventId)),
    ]);
    const opciones: Record<number, OpcionGrupo[]> = {};
    for (const t of tipos as any[]) { const g = opcionesDeMetadata(t.metadata); if (g.length) opciones[t.id] = g; }
    // Lo que una opción reemplaza no entra al «quedan ~N» de la caja (la bebida la elige la cajera).
    const activos = new Set(all.map((i) => i.id));
    const recetas = todas.filter((r) => activos.has(r.insumoId) && !opciones[r.ticketTypeId]?.some((g) => g.reemplaza === r.insumoId));
    return {
      insumos: all.map((i) => ({
        id: i.id, name: i.name, unit: i.unit, containerSize: i.containerSize, containerLabel: i.containerLabel, stock: stock.get(i.id) ?? 0, alertDrinks: i.alertDrinks, sinComprar: !stock.has(i.id),
      })),
      recetas,
      opciones,
    };
  } catch (err) {
    console.error("[insumos] snapshot:", err);
    return null;
  }
}

// --- Escrituras del admin ---

/** Recuerda con qué nombre aparece un insumo en las boletas (el texto se guarda normalizado y sin duplicados). */
export async function addInsumoAliases(items: { insumoId: number; alias: string }[]) {
  if (items.length === 0) return;
  const db = await dbOrThrow();
  for (const it of items) {
    const alias = normalizeName(it.alias).replace(/\s+/g, " ").trim().slice(0, 160);
    if (!alias) continue;
    try {
      await db.execute(sql`INSERT INTO \`insumoAlias\` (\`insumoId\`, \`alias\`) VALUES (${it.insumoId}, ${alias}) ON DUPLICATE KEY UPDATE \`insumoId\` = VALUES(\`insumoId\`)`);
    } catch (err) {
      console.error("[insumos] alias:", err);
    }
  }
}

export async function saveInsumo(data: {
  id?: number; name: string; unit: InsumoUnit; containerSize: number; containerLabel: string; sizes?: number[];
  costPerContainer?: number | null; alertDrinks: number; sortOrder?: number;
}) {
  const db = await dbOrThrow();
  const containerSize = Math.max(1, Math.round(data.containerSize));
  const values = {
    name: data.name.trim().slice(0, 100), unit: data.unit, containerSize,
    containerLabel: (data.containerLabel.trim() || "botella").slice(0, 30),
    // Los tamaños con que llega (750 / 1000 / 1500 ml…); el de compra siempre está.
    sizes: insumoSizes({ containerSize, sizes: data.sizes }),
    costPerContainer: data.costPerContainer != null ? String(Math.round(data.costPerContainer)) : null,
    alertDrinks: Math.max(0, Math.round(data.alertDrinks)), sortOrder: data.sortOrder ?? 0,
  };
  if (data.id) {
    await db.update(insumos).set(values).where(eq(insumos.id, data.id));
    return { id: data.id };
  }
  const [res] = await db.insert(insumos).values(values);
  return { id: (res as unknown as { insertId: number }).insertId };
}

export async function setInsumoActive(id: number, active: boolean) {
  const db = await dbOrThrow();
  await db.update(insumos).set({ active: active ? 1 : 0 }).where(eq(insumos.id, id));
  return { success: true } as const;
}

/** Qué es el producto: un trago (lleva insumos) o algo que se vende solo (comida, cigarros, merch…). Lo que se vende solo
 * queda sin receta y agrupado en su sección. */
export async function setTipoProducto(ticketTypeId: number, tipo: TipoProducto) {
  const db = await dbOrThrow();
  const [row] = await db.select().from(ticketTypes).where(eq(ticketTypes.id, ticketTypeId)).limit(1);
  if (!row) throw new Error('Producto no encontrado');
  const def = TIPOS_PRODUCTO.find((t) => t.id === tipo)!;
  const set: Record<string, unknown> = { metadata: metadataConSinInsumos(row.metadata, tipo !== 'trago') };
  if (def.seccion) set.groupName = def.seccion;
  // Merch se vende como merch; un trago que estaba como merch vuelve a «Tragos y comida».
  if (tipo === 'merch') set.category = 'merch';
  else if (row.category === 'merch') set.category = 'consumo';
  await db.update(ticketTypes).set(set).where(eq(ticketTypes.id, ticketTypeId));
  if (tipo !== 'trago') await db.delete(insumoRecetas).where(eq(insumoRecetas.ticketTypeId, ticketTypeId));
  return { success: true } as const;
}

/** Quita un producto de la carta (queda oculto, con su historial de ventas) o lo vuelve a poner. */
export async function setProductoOculto(ticketTypeId: number, oculto: boolean) {
  const db = await dbOrThrow();
  await db.update(ticketTypes).set({ status: oculto ? 'hidden' : 'active' }).where(eq(ticketTypes.id, ticketTypeId));
  return { success: true } as const;
}

/** Reemplaza la receta de un trago. El vaso es del producto (cada trago viene en el suyo):
 * se cambian todas las líneas juntas, así nunca quedan recetas de dos vasos. */
export async function setReceta(ticketTypeId: number, glass: string, lines: { insumoId: number; amount: number }[], extras?: string[], opciones?: OpcionGrupo[], preparacion?: { pasos?: string[]; foto?: string | null }) {
  const db = await dbOrThrow();
  // Los extras sin medida (Tajín, hielo…) van en el metadata del producto, sin tocar lo demás que tenga. Sin `extras` no se cambian.
  if (extras !== undefined) {
    const [row] = await db.select({ metadata: ticketTypes.metadata }).from(ticketTypes).where(eq(ticketTypes.id, ticketTypeId)).limit(1);
    if (row) await db.update(ticketTypes).set({ metadata: metadataConExtras(row.metadata, extras) }).where(eq(ticketTypes.id, ticketTypeId));
  }
  // Pasos de preparación y foto (para el dosier): también en el metadata. Sin `preparacion` no se cambian.
  if (preparacion && (preparacion.pasos !== undefined || preparacion.foto !== undefined)) {
    const [row] = await db.select({ metadata: ticketTypes.metadata }).from(ticketTypes).where(eq(ticketTypes.id, ticketTypeId)).limit(1);
    if (row) await db.update(ticketTypes).set({ metadata: metadataConPreparacion(row.metadata, preparacion.pasos, preparacion.foto) }).where(eq(ticketTypes.id, ticketTypeId));
  }
  // Opciones al vender (con qué bebida va…): también en el metadata del producto. Sin `opciones` no se cambian.
  if (opciones !== undefined) {
    const [row] = await db.select({ metadata: ticketTypes.metadata }).from(ticketTypes).where(eq(ticketTypes.id, ticketTypeId)).limit(1);
    if (row) await db.update(ticketTypes).set({ metadata: metadataConOpciones(row.metadata, opciones) }).where(eq(ticketTypes.id, ticketTypeId));
  }
  await db.delete(insumoRecetas).where(eq(insumoRecetas.ticketTypeId, ticketTypeId));
  const clean = new Map<number, number>();
  for (const l of lines) if (l.amount > 0) clean.set(l.insumoId, (clean.get(l.insumoId) ?? 0) + l.amount);
  if (clean.size > 0) {
    await db.insert(insumoRecetas).values(Array.from(clean, ([insumoId, amount]) => ({ ticketTypeId, insumoId, amount: String(amount), glass })));
  }
  return { success: true } as const;
}

/** Vista por botella base: fija qué tragos de la Carta usan este insumo y cuánto lleva cada uno (en la unidad del insumo).
 * Los tragos marcados lo agregan o corrigen, los que ya no aparecen lo pierden; el resto de cada receta queda igual. */
export async function setUsoInsumo(eventId: number, insumoId: number, usos: { ticketTypeId: number; amount: number }[]) {
  const db = await dbOrThrow();
  const valid = new Set<number>(((await db.select({ id: ticketTypes.id }).from(ticketTypes)
    .where(and(eq(ticketTypes.eventId, eventId), inArray(ticketTypes.category, ["consumo", "merch"])))) as { id: number }[]).map((p) => p.id));
  const recetas = await recetasDelEvento(eventId, db);
  const changes = aplicarUso(recetas, insumoId, usos.filter((u) => valid.has(u.ticketTypeId)));
  for (const c of changes) await setReceta(c.ticketTypeId, c.glass, c.lines);
  return { changed: changes.length };
}

/** Compra, carga inicial, merma o ajuste a mano. `amount` en la unidad del
 * insumo (positivo suma; la merma se guarda en negativo). */
export async function addMovimiento(params: { insumoId: number; kind: Extract<MovimientoKind, "carga" | "compra" | "merma" | "ajuste">; amount: number; eventId?: number | null; note?: string }) {
  const db = await dbOrThrow();
  const delta = params.kind === "merma" ? -Math.abs(params.amount) : params.kind === "ajuste" ? params.amount : Math.abs(params.amount);
  if (!delta) throw new Error("La cantidad no puede ser 0");
  await db.insert(insumoMovimientos).values({
    insumoId: params.insumoId, kind: params.kind, delta: String(delta), eventId: params.eventId ?? null, note: params.note?.slice(0, 255) ?? null,
  });
  return { success: true } as const;
}

/** Deja el stock de un insumo exactamente en `target` (ajuste por diferencia). */
export async function setStockTo(params: { insumoId: number; target: number; eventId?: number | null; note?: string }) {
  const db = await dbOrThrow();
  const current = (await stockMap(db)).get(params.insumoId) ?? 0;
  const delta = Math.round((params.target - current) * 100) / 100;
  if (delta === 0) return { success: true, delta } as const;
  await db.insert(insumoMovimientos).values({
    insumoId: params.insumoId, kind: "ajuste", delta: String(delta), eventId: params.eventId ?? null, note: params.note?.slice(0, 255) ?? "Stock fijado a mano",
  });
  return { success: true, delta } as const;
}

export async function listMovimientos(params: { eventId?: number; insumoId?: number; limit?: number }) {
  const db = await dbOrThrow();
  const where = [
    params.eventId ? eq(insumoMovimientos.eventId, params.eventId) : undefined,
    params.insumoId ? eq(insumoMovimientos.insumoId, params.insumoId) : undefined,
  ].filter(Boolean) as any[];
  const rows = await db.select({
    id: insumoMovimientos.id, insumoId: insumoMovimientos.insumoId, insumoName: insumos.name, kind: insumoMovimientos.kind,
    delta: insumoMovimientos.delta, note: insumoMovimientos.note, eventId: insumoMovimientos.eventId, createdAt: insumoMovimientos.createdAt,
  }).from(insumoMovimientos).leftJoin(insumos, eq(insumos.id, insumoMovimientos.insumoId))
    .where(where.length ? and(...where) : undefined)
    .orderBy(desc(insumoMovimientos.createdAt), desc(insumoMovimientos.id)).limit(Math.min(params.limit ?? 200, 1000));
  return rows.map((r: any) => ({ ...r, delta: n(r.delta) }));
}

export async function listConteos(eventId: number) {
  const db = await dbOrThrow();
  const heads = await db.select().from(insumoConteos).where(eq(insumoConteos.eventId, eventId)).orderBy(desc(insumoConteos.createdAt)).limit(50);
  if (heads.length === 0) return [];
  const lines = await db.select().from(insumoConteoLineas).where(inArray(insumoConteoLineas.conteoId, heads.map((h: any) => h.id)));
  return heads.map((h: any) => ({
    id: h.id as number, kind: h.kind as "apertura" | "cierre", operatorName: (h.operatorName as string | null) ?? null, createdAt: h.createdAt as Date,
    registerId: (h.registerId as number | null) ?? null,
    lines: (lines as any[]).filter((l) => l.conteoId === h.id).map((l) => {
      const counted = n(l.countedTotal);
      const expected = n(l.expectedTotal);
      return { insumoId: l.insumoId as number, closedContainers: n(l.closedContainers), openFraction: n(l.openFraction), detail: (l.detail ?? null) as ConteoDetalle | null, counted, expected, ...descuadre(expected, counted) };
    }),
  }));
}

/** Copia las recetas de una carta a otra, emparejando los tragos por nombre
 * (lo llama copyCartaBetweenEvents). Nunca lanza: copiar la carta importa más. */
export async function copyRecetasBetweenEvents(fromEventId: number, toEventId: number): Promise<number> {
  try {
    if (!(await ready())) return 0;
    const db = await dbOrThrow();
    const recetas = await recetasDelEvento(fromEventId, db);
    if (recetas.length === 0) return 0;
    const [fromTypes, toTypes] = await Promise.all([
      db.select({ id: ticketTypes.id, name: ticketTypes.name }).from(ticketTypes).where(eq(ticketTypes.eventId, fromEventId)),
      db.select({ id: ticketTypes.id, name: ticketTypes.name }).from(ticketTypes).where(eq(ticketTypes.eventId, toEventId)),
    ]);
    const toByName = new Map((toTypes as any[]).map((t) => [normalizeName(t.name), t.id as number]));
    const targetOf = new Map((fromTypes as any[]).map((t) => [t.id as number, toByName.get(normalizeName(t.name))]));
    const toExisting = new Set((await recetasDelEvento(toEventId, db)).map((r) => r.ticketTypeId));
    const values = recetas
      .map((r) => ({ ticketTypeId: targetOf.get(r.ticketTypeId), insumoId: r.insumoId, amount: String(r.amount), glass: r.glass || DEFAULT_GLASS }))
      .filter((r): r is { ticketTypeId: number; insumoId: number; amount: string; glass: string } => r.ticketTypeId !== undefined && !toExisting.has(r.ticketTypeId));
    if (values.length) await db.insert(insumoRecetas).values(values);
    return values.length;
  } catch (err) {
    console.error("[insumos] copyRecetasBetweenEvents:", err);
    return 0;
  }
}

// --- Caja: ventas, anulaciones y conteos ---

async function isTestEvent(db: any, eventId: number): Promise<boolean> {
  const [e] = await db.select({ slug: events.slug }).from(events).where(eq(events.id, eventId)).limit(1);
  return e?.slug === TEST_EVENT_SLUG;
}

/** Descuenta los insumos de una venta. Idempotente por opId (índice único) y
 * nunca lanza: un insumo mal cargado no puede frenar un cobro. */
export async function descontarVenta(db: any, params: { opId: string; eventId: number; operatorId: number; items: { ticketTypeId: number; quantity: number; opciones?: string[] }[] }) {
  try {
    if (!(await ready()) || (await isTestEvent(db, params.eventId))) return;
    const ids = params.items.map((i) => i.ticketTypeId);
    const rows = await db.select().from(insumoRecetas).where(inArray(insumoRecetas.ticketTypeId, ids));
    // Los insumos archivados ya no se descuentan (siguen en la base, pero no cuentan para la barra).
    const lista = await listInsumos();
    const activos = new Set(lista.map((i) => i.id));
    // Un reemplazo «por hoy» solo vale si el insumo nuevo está activo y se mide en la misma unidad que el que reemplaza.
    const unidad = new Map(lista.map((i) => [i.id, i.unit]));
    const items = params.items.map((it) => ({ ...it, opciones: it.opciones?.filter((o) => {
      const m = /^sub:(\d+):(\d+)$/.exec(o);
      return !m || (unidad.has(Number(m[2])) && unidad.get(Number(m[1])) === unidad.get(Number(m[2])));
    }) }));
    const recetas: RecetaLinea[] = rows.filter((r: any) => activos.has(r.insumoId)).map((r: any) => ({ ticketTypeId: r.ticketTypeId, insumoId: r.insumoId, amount: n(r.amount), glass: (r.glass as string) || DEFAULT_GLASS }));
    const tipos = await db.select({ id: ticketTypes.id, metadata: ticketTypes.metadata }).from(ticketTypes).where(inArray(ticketTypes.id, ids));
    const opciones: Record<number, OpcionGrupo[]> = {};
    for (const t of tipos) { const g = opcionesDeMetadata(t.metadata); if (g.length) opciones[t.id] = g; }
    const consumo = consumoDeVenta(items, recetas, opciones);
    if (consumo.length === 0) return;
    await db.insert(insumoMovimientos).values(consumo.map((c) => ({
      insumoId: c.insumoId, kind: "venta" as const, delta: String(c.delta), eventId: params.eventId, opId: params.opId, operatorId: params.operatorId,
    })));
  } catch (err: any) {
    if (err?.code === "ER_DUP_ENTRY" || /duplicate entry/i.test(String(err?.message ?? ""))) return;
    console.error("[insumos] descontarVenta:", err);
  }
}

/** Devuelve al stock lo que gastó una venta anulada. */
export async function devolverVenta(db: any, params: { saleOpId: string; voidOpId: string; eventId: number; operatorId: number }) {
  try {
    if (!(await ready())) return;
    const rows = await db.select().from(insumoMovimientos).where(and(eq(insumoMovimientos.opId, params.saleOpId), eq(insumoMovimientos.kind, "venta")));
    if (rows.length === 0) return;
    await db.insert(insumoMovimientos).values(rows.map((r: any) => ({
      insumoId: r.insumoId, kind: "anulacion" as const, delta: String(-n(r.delta)), eventId: params.eventId, opId: params.voidOpId, operatorId: params.operatorId,
    })));
  } catch (err: any) {
    if (err?.code === "ER_DUP_ENTRY" || /duplicate entry/i.test(String(err?.message ?? ""))) return;
    console.error("[insumos] devolverVenta:", err);
  }
}

/** Antes/después de cada insumo que tocó una venta (para las alertas). */
export async function cambiosDeVenta(opId: string, eventId: number) {
  if (!(await ready())) return null;
  const db = await dbOrThrow();
  const rows = await db.select().from(insumoMovimientos).where(and(eq(insumoMovimientos.opId, opId), eq(insumoMovimientos.kind, "venta")));
  if (rows.length === 0) return null;
  const [all, stock, recetas] = await Promise.all([listInsumos(true), stockMap(db), recetasDelEvento(eventId, db)]);
  const reference = await referenciaApertura(db, eventId, stock);
  const byId = new Map(all.map((i) => [i.id, i]));
  // Qué tragos de la carta quedan afectados por cada insumo y con qué se podrían reemplazar (para el texto de la alerta).
  const productos = await db.select({ id: ticketTypes.id, name: ticketTypes.name }).from(ticketTypes).where(eq(ticketTypes.eventId, eventId));
  const nombreProducto = new Map<number, string>((productos as any[]).map((p) => [p.id, p.name]));
  const activos = all.filter((i) => i.active);
  const afectados = new Map<number, string[]>();
  const reemplazos = new Map<number, string[]>();
  for (const r of rows as any[]) {
    const lineas = recetas.filter((x) => x.insumoId === r.insumoId);
    afectados.set(r.insumoId, Array.from(new Set(lineas.map((l) => nombreProducto.get(l.ticketTypeId)).filter((x): x is string => !!x))));
    const primera = lineas[0] ? recetas.filter((x) => x.ticketTypeId === lineas[0].ticketTypeId) : [];
    reemplazos.set(r.insumoId, sugerirReemplazos(r.insumoId, activos, stock, primera, 2).map((x) => `${x.name} (alcanza para ${x.drinks})`));
  }
  return {
    recetas,
    contexto: { afectados, reemplazos },
    changes: (rows as any[]).flatMap((r) => {
      const insumo = byId.get(r.insumoId);
      if (!insumo) return [];
      const after = stock.get(r.insumoId) ?? 0;
      return [{ insumo, after, before: after - n(r.delta), reference: reference.get(r.insumoId) ?? null }];
    }),
  };
}

/** Consumo de la última ventana por insumo (para la alerta de ritmo). */
export async function consumoReciente(eventId: number, since: Date) {
  if (!(await ready())) return null;
  const db = await dbOrThrow();
  const rows = await db.select({ insumoId: insumoMovimientos.insumoId, total: sql<string>`SUM(${insumoMovimientos.delta})` })
    .from(insumoMovimientos)
    .where(and(eq(insumoMovimientos.eventId, eventId), inArray(insumoMovimientos.kind, ["venta", "anulacion"]), gte(insumoMovimientos.createdAt, since)))
    .groupBy(insumoMovimientos.insumoId);
  if (rows.length === 0) return null;
  const [all, stock] = await Promise.all([listInsumos(), stockMap(db)]);
  const used = new Map((rows as any[]).map((r) => [r.insumoId as number, -n(r.total)]));
  return all.filter((i) => (used.get(i.id) ?? 0) > 0).map((insumo) => ({ insumo, stock: stock.get(insumo.id) ?? 0, usedLastWindow: used.get(insumo.id)! }));
}

/** Último conteo del evento (para no pedirle a la segunda caja que vuelva a contar). */
export async function ultimoConteo(eventId: number, kind: "apertura" | "cierre") {
  if (!(await ready())) return null;
  const db = await dbOrThrow();
  const [c] = await db.select().from(insumoConteos)
    .where(and(eq(insumoConteos.eventId, eventId), eq(insumoConteos.kind, kind))).orderBy(desc(insumoConteos.createdAt)).limit(1);
  return c ? { id: c.id as number, operatorName: (c.operatorName as string | null) ?? null, createdAt: c.createdAt as Date } : null;
}

/** Guarda un conteo de barra. El stock queda igual a lo contado (lo físico
 * manda) y la diferencia queda registrada como `conteo_ajuste`. */
export async function crearConteo(params: {
  eventId: number; registerId?: number | null; shiftId?: number | null; kind: "apertura" | "cierre";
  operatorId: number; operatorName: string;
  /** Cada botella con su tamaño: `closed`/`open`. `closedContainers`/`openFraction` es el formato
   * de antes (una tablet con la versión vieja abierta): se toma como botellas del tamaño de compra. */
  lines: { insumoId: number; closed?: ConteoDetalle["closed"]; open?: ConteoDetalle["open"]; closedContainers?: number; openFraction?: number }[];
}) {
  if (!(await ready())) throw new Error("El conteo de barra todavía no está activado (falta actualizar la base de datos).");
  const db = await dbOrThrow();
  const test = await isTestEvent(db, params.eventId);
  const [all, stock] = await Promise.all([listInsumos(), stockMap(db)]);
  const byId = new Map(all.map((i) => [i.id, i]));
  const lines = params.lines.filter((l) => byId.has(l.insumoId)).map((l) => {
    const insumo = byId.get(l.insumoId)!;
    const detail: ConteoDetalle = l.closed || l.open
      ? { closed: l.closed ?? [], open: l.open ?? [] }
      : {
        closed: [{ size: insumo.containerSize, count: l.closedContainers ?? 0 }],
        open: (l.openFraction ?? 0) > 0 ? [{ size: insumo.containerSize, portions: (l.openFraction ?? 0) * OPEN_PORTIONS }] : [],
      };
    const counted = l.closed || l.open ? detalleATotal(detail) : conteoATotal(l.closedContainers ?? 0, l.openFraction ?? 0, insumo.containerSize);
    const expected = stock.get(l.insumoId) ?? 0;
    return { insumoId: l.insumoId, detail, insumo, counted, expected };
  });
  if (lines.length === 0) throw new Error("El conteo no tiene insumos");

  const [res] = await db.insert(insumoConteos).values({
    eventId: params.eventId, registerId: params.registerId ?? null, shiftId: params.shiftId ?? null, kind: params.kind,
    operatorId: params.operatorId, operatorName: params.operatorName.slice(0, 100),
  });
  const conteoId = (res as unknown as { insertId: number }).insertId;
  await db.insert(insumoConteoLineas).values(lines.map((l) => ({
    conteoId, insumoId: l.insumoId, closedContainers: l.detail.closed.reduce((s, c) => s + Math.max(0, Math.floor(c.count || 0)), 0),
    openFraction: String(Math.round(l.detail.open.reduce((s, o) => s + Math.min(OPEN_PORTIONS, Math.max(0, o.portions || 0)), 0)) / OPEN_PORTIONS),
    detail: l.detail,
    countedTotal: String(l.counted), expectedTotal: String(l.expected),
  })));
  // En modo prueba se guarda el conteo (para practicar) pero no toca el stock real.
  if (!test) {
    const adjustments = lines.map((l) => ({ l, delta: Math.round((l.counted - l.expected) * 100) / 100 })).filter((a) => a.delta !== 0);
    if (adjustments.length) {
      await db.insert(insumoMovimientos).values(adjustments.map(({ l, delta }) => ({
        insumoId: l.insumoId, kind: "conteo_ajuste" as const, delta: String(delta), eventId: params.eventId, conteoId, operatorId: params.operatorId,
        note: `Conteo de ${params.kind} de ${params.operatorName}`.slice(0, 255),
      })));
    }
  }
  return {
    conteoId, test,
    lines: lines.map((l) => ({ insumoId: l.insumoId, name: l.insumo.name, counted: l.counted, expected: l.expected, ...descuadre(l.expected, l.counted) })),
    forAlerts: lines.map((l) => ({ insumo: l.insumo as Insumo, expected: l.expected, counted: l.counted })),
  };
}

// --- Proyección de compra ---

/** Personas de un evento: las que entraron (si ya pasó) o las que tienen entrada. */
async function personasDelEvento(db: any, eventId: number): Promise<{ inside: number; expected: number }> {
  const rows = await db.select({ accesoSlug: ticketTypes.accesoSlug, status: tickets.status, groupSize: tickets.groupSize })
    .from(tickets).innerJoin(ticketTypes, eq(ticketTypes.id, tickets.ticketTypeId))
    .where(and(eq(tickets.eventId, eventId), eq(ticketTypes.category, "acceso")));
  let inside = 0;
  let expected = 0;
  for (const t of rows as any[]) {
    if (t.status === "cancelled") continue;
    const p = personasForTicket(t.groupSize, t.accesoSlug);
    expected += p;
    if (t.status === "used") inside += p;
  }
  return { inside, expected };
}

/** Lista de compras para `personas`, con el mix de las últimas fiestas. */
export async function proyeccion(params: { eventId: number; personas: number; factor?: number; tragosPorPersona?: number | null; overrides?: Record<number, number>; historyEvents?: number }) {
  const db = await dbOrThrow();
  const [event] = await db.select().from(events).where(eq(events.id, params.eventId)).limit(1);
  if (!event) throw new Error("Evento no encontrado");
  const past = await db.select({ id: events.id, title: events.title, eventDate: events.eventDate }).from(events)
    .where(and(lt(events.eventDate, event.eventDate), ne(events.slug, TEST_EVENT_SLUG)))
    .orderBy(desc(events.eventDate)).limit(params.historyEvents ?? 5);

  const historico: { personas: number; ventas: { name: string; quantity: number }[] }[] = [];
  const fuentes: { title: string; personas: number; tragos: number }[] = [];
  for (const e of past as any[]) {
    const sales = await db.select({ name: ticketTypes.name, quantity: sql<string>`SUM(${orderItems.quantity})` })
      .from(orderItems).innerJoin(orders, eq(orders.id, orderItems.orderId)).innerJoin(ticketTypes, eq(ticketTypes.id, orderItems.ticketTypeId))
      .where(and(eq(orders.eventId, e.id), eq(orders.channel, "caja"), eq(orders.paymentStatus, "approved"), eq(ticketTypes.category, "consumo")))
      .groupBy(ticketTypes.name);
    const ventas = (sales as any[]).map((s) => ({ name: s.name as string, quantity: n(s.quantity) }));
    const tragos = ventas.reduce((s, v) => s + v.quantity, 0);
    const { inside, expected } = await personasDelEvento(db, e.id);
    const personas = inside > 0 ? inside : expected;
    // Una fiesta sin ventas de barra registradas o sin gente no dice nada del consumo.
    if (tragos === 0 || personas === 0) continue;
    historico.push({ personas, ventas });
    fuentes.push({ title: e.title, personas, tragos });
  }

  const estado = await estadoBarra(params.eventId);
  const allInsumos = estado.ready ? estado.insumos : [];
  const stock = new Map(allInsumos.map((i) => [i.id, i.stock]));
  // Todos los tragos de la carta: los que no tienen receta no gastan insumos, pero sí tienen su parte de las ventas.
  const productos = estado.ready ? estado.productos.filter((p) => !p.sinInsumos && !p.oculto) : [];
  const result = proyeccionCompra({
    historico, productos, insumos: allInsumos, stock, personasObjetivo: params.personas,
    factor: params.factor, tragosPorPersona: params.tragosPorPersona, overrides: params.overrides,
  });
  const actuales = await personasDelEvento(db, params.eventId);
  return { ...result, fuentes, personasConEntrada: actuales.expected, sinReceta: estado.ready ? estado.productos.filter((p) => p.receta.length === 0 && !p.sinInsumos && !p.oculto).map((p) => p.name) : [] };
}

// --- Carga del dosier (shared/dosier.ts) ---

/** Qué haría cargar el dosier en este evento: insumos a crear, stock de partida y, para cada
 * preparación, a qué productos de la Carta se la sugiero. */
export async function dosierPlan(eventId: number) {
  const db = await dbOrThrow();
  const [all, stock, recetas, products] = await Promise.all([
    listInsumos(true),
    stockMap(db),
    recetasDelEvento(eventId, db),
    // Solo los tragos y comidas de la carta (no guardarropía ni merch).
    db.select({ id: ticketTypes.id, name: ticketTypes.name, groupName: ticketTypes.groupName, price: ticketTypes.price, metadata: ticketTypes.metadata, status: ticketTypes.status }).from(ticketTypes)
      .where(and(eq(ticketTypes.eventId, eventId), eq(ticketTypes.category, "consumo"))),
  ]);
  const plan = planDosier({
    insumos: all, productos: (products as any[]).filter((p) => p.status !== 'hidden' && !productoSinInsumos('consumo', p.groupName, p.metadata)).map((p) => ({ id: p.id as number, name: p.name as string, groupName: (p.groupName as string | null) ?? null, price: p.price != null ? n(p.price) : null })),
    insumosConMovimientos: new Set(stock.keys()), productosConReceta: new Set(recetas.map((r) => r.ticketTypeId)),
  });
  return { ...plan, supuestos: DOSIER_SUPUESTOS };
}

/** Carga el dosier: crea los insumos que faltan, el stock de partida y copia cada preparación a los
 * productos de la Carta elegidos (cada producto queda con su propia receta, editable). Se puede repetir
 * sin duplicar nada (no recrea insumos, no pisa un stock en uso ni, salvo que se pida, una receta ya cargada). */
export async function dosierApply(params: {
  eventId: number; reemplazarRecetas: boolean; cargarStock: boolean;
  asignaciones: { receta: string; productIds: number[] }[];
}) {
  if (!(await ready())) throw new Error("Falta activar el stock de barra (actualizar la base de datos).");
  const plan = await dosierPlan(params.eventId);
  const validProducts = new Map(plan.productos.map((p) => [p.id, p]));
  const idByKey = new Map<string, number>();
  let created = 0;
  let stockLoaded = 0;
  for (const i of plan.insumos) {
    const def = DOSIER_INSUMOS.find((d) => d.key === i.key)!;
    if (i.id !== null) { idByKey.set(i.key, i.id); }
    else {
      const saved = await saveInsumo({
        name: def.name, unit: def.unit, containerSize: def.containerSize, containerLabel: def.containerLabel,
        sizes: def.sizes, alertDrinks: def.alertDrinks, costPerContainer: null,
      });
      idByKey.set(i.key, saved.id);
      created++;
    }
    if (params.cargarStock && i.loadStock && i.stock && i.stock.amount > 0) {
      await addMovimiento({ insumoId: idByKey.get(i.key)!, kind: "carga", amount: i.stock.amount, note: `Dosier: ${i.stock.from}` });
      stockLoaded++;
    }
  }
  let recetas = 0;
  let yaTenian = 0;
  const done = new Set<number>(); // un producto recibe una sola preparación
  for (const a of params.asignaciones) {
    const def = plan.recetas.find((r) => r.product === a.receta);
    if (!def) continue;
    for (const productId of a.productIds) {
      const product = validProducts.get(productId);
      if (!product || done.has(productId)) continue;
      done.add(productId);
      if (product.tieneReceta && !params.reemplazarRecetas) { yaTenian++; continue; }
      await setReceta(productId, def.glass, def.lines.map((l) => ({ insumoId: idByKey.get(l.insumo)!, amount: l.amount })), def.extras.length ? def.extras : undefined);
      recetas++;
    }
  }
  return { insumosCreados: created, stockCargado: stockLoaded, recetasCargadas: recetas, recetasYaTenian: yaTenian };
}
