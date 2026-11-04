/* Junta lo que dibuja el inventario en PDF (server/inventarioPdf.ts): stock, uso del evento y compras pendientes. */
import { eq } from "drizzle-orm";
import { events } from "../drizzle/schema";
import { getDb } from "./db";
import { consumoDelEvento, estadoBarra, personasDelEvento, proyeccion } from "./insumos";
import { armarInventario, type Inventario } from "../shared/inventarioReporte";

const DEFAULT_PERSONAS = 300;

/** El inventario de hoy para un evento (null si el evento no existe). `personas` = 0 usa las que tienen entrada.
 * Lanza si el stock de barra todavía no está activado. */
export async function inventarioDeEvento(eventId: number, personas: number): Promise<Inventario | null> {
  const db = await getDb();
  if (!db) throw new Error("Base de datos no disponible");
  const [event] = await db.select({ title: events.title }).from(events).where(eq(events.id, eventId)).limit(1);
  if (!event) return null;
  const estado = await estadoBarra(eventId);
  if (!estado.ready) throw new Error("Falta activar el stock de barra");
  const esperadas = personas > 0 ? personas : (await personasDelEvento(db, eventId)).expected || DEFAULT_PERSONAS;
  const [consumo, proy] = await Promise.all([consumoDelEvento(eventId), proyeccion({ eventId, personas: esperadas })]);
  // Cuánto se necesita de cada insumo: por receta (lo que gastan los tragos) o por su regla (guantes, vasos…).
  const need = new Map<number, number>();
  for (const i of proy.insumos) need.set(i.insumoId, i.need);
  for (const g of proy.generales.lineas) need.set(g.insumoId, g.need);
  return armarInventario({
    eventTitle: event.title, emittedAt: new Date(), personas: esperadas,
    insumos: estado.insumos.map((i) => ({
      id: i.id, name: i.name, unit: i.unit, containerSize: i.containerSize, containerLabel: i.containerLabel, costPerContainer: i.costPerContainer ?? null,
      stock: i.stock, level: i.level, grupo: i.grupo, reference: i.reference, need: need.get(i.id) ?? null, minimo: i.minimo,
    })),
    consumo,
    compras: [
      ...proy.insumos.map((i) => ({ insumoId: i.insumoId, need: i.need, missing: i.missing, containersToBuy: i.containersToBuy, cost: i.cost })),
      ...proy.generales.lineas.map((g) => ({ insumoId: g.insumoId, need: g.need, missing: g.missing, containersToBuy: g.containersToBuy, cost: g.cost })),
    ],
  });
}
