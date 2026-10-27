/* Compra de insumos desde la foto de una boleta/factura (docs/ARQUITECTURA-CAJA.md §17). La IA solo LEE el papel;
 * emparejar con los insumos y calcular cuánto stock se suma está en shared/compras.ts, y nada se escribe hasta que
 * el admin confirma cada fila. */
import { sql, eq } from "drizzle-orm";
import { getDb, createExpense } from "./db";
import { insumoAlias, insumoMovimientos, insumos } from "../drizzle/schema";
import { invokeLLM, extractContent } from "./_core/llm";
import { addInsumoAliases, listInsumos } from "./insumos";
import { cargaDeLinea, emparejarInsumo, packDeTexto, tamanoDeTexto, type BoletaLinea } from "../shared/compras";

export interface BoletaLeida {
  isReceipt: boolean;
  proveedor: string;
  rut: string;
  fecha: string; // YYYY-MM-DD o ''
  documentType: "boleta" | "factura" | "boleta_honorarios" | "sin_documento";
  numero: string;
  total: number;
  ivaExempt: boolean;
  confidence: "alta" | "media" | "baja";
  notas: string;
  lineas: BoletaLinea[];
}

const BOLETA_INSUMOS_SCHEMA = {
  name: "boleta_insumos",
  strict: true,
  schema: {
    type: "object",
    properties: {
      isReceipt: { type: "boolean", description: "true si la foto es una boleta/factura/guía de compra legible." },
      proveedor: { type: "string", description: "Nombre del local o proveedor. Vacío si no se ve." },
      rut: { type: "string", description: "RUT del proveedor (12.345.678-9). Vacío si no se ve." },
      fecha: { type: "string", description: "Fecha impresa, YYYY-MM-DD. Vacío si no se ve." },
      documentType: { type: "string", enum: ["boleta", "factura", "boleta_honorarios", "sin_documento"] },
      numero: { type: "string", description: "Folio. Vacío si no se ve." },
      total: { type: "number", description: "TOTAL pagado de la boleta (CLP, entero). 0 si no se lee." },
      ivaExempt: { type: "boolean" },
      confidence: { type: "string", enum: ["alta", "media", "baja"] },
      notas: { type: "string", description: "Vacío si todo se ve bien; si no, una frase corta de qué revisar." },
      lineas: {
        type: "array",
        items: {
          type: "object",
          properties: {
            descripcion: { type: "string", description: "Texto de la línea EXACTO como está impreso." },
            cantidad: { type: "number", description: "Unidades compradas de esa línea (la columna de cantidad)." },
            precioUnitario: { type: "number", description: "Precio de una unidad (CLP). 0 si no se ve." },
            totalLinea: { type: "number", description: "Total de la línea (CLP). Negativo si es un descuento." },
            tamano: { type: "number", description: "Tamaño de cada envase en ml o g según el texto (750cc→750, 1,5 L→1500). 0 si no dice." },
            packUnidades: { type: "number", description: "Envases dentro de cada unidad si es pack/caja (pack 6 → 6). 1 si no." },
          },
          required: ["descripcion", "cantidad", "precioUnitario", "totalLinea", "tamano", "packUnidades"],
          additionalProperties: false,
        },
      },
    },
    required: ["isReceipt", "proveedor", "rut", "fecha", "documentType", "numero", "total", "ivaExempt", "confidence", "notas", "lineas"],
    additionalProperties: false,
  },
} as const;

const SYSTEM = `Lees fotos de boletas y facturas chilenas de compras para un bar y extraes cada línea de producto en JSON.
Reglas estrictas:
- Copia el texto de cada línea EXACTO como está impreso; no lo corrijas ni lo traduzcas.
- Una fila por producto. NO incluyas subtotales, IVA, propina ni forma de pago como productos. Un descuento va como línea con totalLinea negativo.
- "cantidad" es la columna de cantidad (si no hay columna, 1). "totalLinea" es el total de ESA línea tal como está impreso; no lo recalcules.
- "tamano" en ml o g si el texto lo dice (750cc, 1L, 1,5 lt, 350 ml); si no, 0. "packUnidades": 6 si dice pack 6 / x6; 1 si es una unidad suelta.
- "total" es el total pagado de la boleta, entero en pesos.
- Si la foto no es una boleta legible, isReceipt=false y lineas vacías. Nunca uses null: usa "" o 0.
- Responde SOLO con el JSON.`;

const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);

/** Lee la foto y devuelve las líneas ya normalizadas (con tamaño/pack completados desde el texto si la IA no los vio). */
export async function leerBoletaInsumos(imageUrl: string, nombresInsumos: string[]): Promise<BoletaLeida> {
  const hint = nombresInsumos.length ? `\nInsumos que suele comprar (solo para entender abreviaturas; NO cambies el texto de la boleta): ${nombresInsumos.slice(0, 80).join(", ")}.` : "";
  const result = await invokeLLM({
    feature: "comprasInsumos",
    messages: [
      { role: "system", content: SYSTEM + hint },
      { role: "user", content: [{ type: "text", text: "Extrae esta boleta de compra de insumos." }, { type: "image_url", image_url: { url: imageUrl } }] },
    ],
    responseFormat: { type: "json_schema", json_schema: BOLETA_INSUMOS_SCHEMA as any },
    maxTokens: 4000,
  });
  const raw = JSON.parse(extractContent(result.choices[0]?.message ?? { content: "" }));
  const lineas: BoletaLinea[] = (Array.isArray(raw.lineas) ? raw.lineas : []).slice(0, 120).map((l: any) => {
    const descripcion = String(l.descripcion ?? "").trim().slice(0, 160);
    const cantidad = num(l.cantidad) > 0 ? num(l.cantidad) : 1;
    const totalLinea = Math.round(num(l.totalLinea));
    const precioUnitario = num(l.precioUnitario) > 0 ? Math.round(num(l.precioUnitario)) : Math.round(totalLinea / cantidad);
    return {
      descripcion, cantidad, precioUnitario, totalLinea,
      tamano: num(l.tamano) > 0 ? Math.round(num(l.tamano)) : tamanoDeTexto(descripcion),
      packUnidades: num(l.packUnidades) >= 1 ? Math.round(num(l.packUnidades)) : packDeTexto(descripcion),
    };
  }).filter((l: BoletaLinea) => l.descripcion);
  return {
    isReceipt: !!raw.isReceipt && lineas.length > 0, proveedor: String(raw.proveedor ?? ""), rut: String(raw.rut ?? ""), fecha: String(raw.fecha ?? ""),
    documentType: raw.documentType ?? "sin_documento", numero: String(raw.numero ?? ""), total: Math.round(num(raw.total)), ivaExempt: !!raw.ivaExempt,
    confidence: raw.confidence ?? "media", notas: String(raw.notas ?? ""), lineas,
  };
}

let aliasTableOk = false;
/** La tabla de nombres recordados se crea sola la primera vez (IF NOT EXISTS): no hace falta migrar a mano para usarla. */
export async function ensureAliasTable(): Promise<boolean> {
  if (aliasTableOk) return true;
  try {
    const db = await getDb();
    if (!db) return false;
    await db.execute(sql`CREATE TABLE IF NOT EXISTS \`insumoAlias\` (\`id\` int AUTO_INCREMENT NOT NULL, \`insumoId\` int NOT NULL, \`alias\` varchar(160) NOT NULL, \`createdAt\` timestamp NOT NULL DEFAULT (now()), CONSTRAINT \`insumoAlias_id\` PRIMARY KEY(\`id\`), UNIQUE KEY \`insumo_alias_alias_idx\` (\`alias\`))`);
    aliasTableOk = true;
    return true;
  } catch (err) {
    console.error("[compras] tabla de alias:", err);
    return false;
  }
}

export async function aliasesPorInsumo(): Promise<Map<number, string[]>> {
  const out = new Map<number, string[]>();
  if (!(await ensureAliasTable())) return out;
  const db = await getDb();
  const rows = await db!.select().from(insumoAlias);
  for (const r of rows as any[]) out.set(r.insumoId, [...(out.get(r.insumoId) ?? []), r.alias]);
  return out;
}

/** Lee la boleta y propone, para cada línea, el insumo (con su confianza), cuánto sumar y el costo. Solo lectura. */
export async function proponerCompra(imageUrl: string) {
  const [todos, aliases] = await Promise.all([listInsumos(), aliasesPorInsumo()]);
  const boleta = await leerBoletaInsumos(imageUrl, todos.map((i) => i.name));
  const paraEmparejar = todos.map((i) => ({ id: i.id, name: i.name, unit: i.unit, containerSize: i.containerSize, sizes: i.sizes, aliases: aliases.get(i.id) ?? [] }));
  return {
    boleta,
    lineas: boleta.lineas.map((l) => {
      const m = emparejarInsumo(l.descripcion, paraEmparejar);
      const insumo = m.insumoId != null ? paraEmparejar.find((i) => i.id === m.insumoId) : undefined;
      return { ...l, match: m, carga: insumo ? cargaDeLinea(l, insumo) : null };
    }),
  };
}

export interface CompraLineaAplicar {
  insumoId: number;
  /** Cuánto se suma, en la unidad del insumo (ya revisado por la persona). */
  agregar: number;
  /** Costo por envase del tamaño de compra del insumo, si se quiere actualizar. */
  costoParaInsumo: number | null;
  /** Texto de la boleta, para recordarlo como nombre del insumo. */
  alias: string | null;
  detalle: string;
}

/** Aplica una compra confirmada: un movimiento `compra` por insumo (idempotente por `opId`), costos, nombres
 * recordados y, si se pide, el gasto en Finanzas. Reintentar con el mismo `opId` no suma dos veces. */
export async function aplicarCompra(params: {
  opId: string; eventId: number; lineas: CompraLineaAplicar[]; actualizarCostos: boolean; recordarNombres: boolean;
  gasto: { crear: boolean; proveedor: string; rut: string; fecha: string; documentType: BoletaLeida["documentType"]; numero: string; total: number; ivaExempt: boolean; receiptUrl: string | null } ;
  userId: number | null;
}) {
  const db = await getDb();
  if (!db) throw new Error("Base de datos no disponible");
  // Dos líneas del mismo insumo (dos tamaños) se suman en un solo movimiento.
  const porInsumo = new Map<number, { agregar: number; detalle: string[] }>();
  for (const l of params.lineas) {
    if (!(l.agregar > 0)) continue;
    const cur = porInsumo.get(l.insumoId) ?? { agregar: 0, detalle: [] };
    porInsumo.set(l.insumoId, { agregar: Math.round((cur.agregar + l.agregar) * 100) / 100, detalle: [...cur.detalle, l.detalle] });
  }
  const nota = (d: string[]) => `Boleta${params.gasto.proveedor ? ` ${params.gasto.proveedor}` : ""}${params.gasto.numero ? ` #${params.gasto.numero}` : ""} · ${d.join(" + ")}`.slice(0, 255);
  let yaAplicada = false;
  for (const [insumoId, v] of Array.from(porInsumo)) {
    try {
      await db.insert(insumoMovimientos).values({
        insumoId, kind: "compra", delta: String(v.agregar), eventId: params.eventId, opId: `compra:${params.opId}`.slice(0, 64), note: nota(v.detalle),
      });
    } catch (err: any) {
      if (err?.code === "ER_DUP_ENTRY" || /duplicate entry/i.test(String(err?.message ?? ""))) { yaAplicada = true; continue; }
      throw err;
    }
  }
  if (yaAplicada) return { yaAplicada: true as const, insumos: porInsumo.size, gastoId: null as number | null };

  if (params.actualizarCostos) {
    for (const l of params.lineas) {
      if (l.costoParaInsumo && l.costoParaInsumo > 0) await db.update(insumos).set({ costPerContainer: String(Math.round(l.costoParaInsumo)) }).where(eq(insumos.id, l.insumoId));
    }
  }
  if (params.recordarNombres && (await ensureAliasTable())) {
    await addInsumoAliases(params.lineas.filter((l) => l.alias).map((l) => ({ insumoId: l.insumoId, alias: l.alias! })));
  }
  let gastoId: number | null = null;
  if (params.gasto.crear && params.gasto.total > 0) {
    const r = await createExpense({
      scope: "evento", eventId: params.eventId, category: "barra", description: `Compra de insumos${params.gasto.proveedor ? ` · ${params.gasto.proveedor}` : ""}`.slice(0, 255),
      supplier: params.gasto.proveedor, supplierRut: params.gasto.rut || undefined, documentType: params.gasto.documentType, documentNumber: params.gasto.numero,
      ivaExempt: params.gasto.ivaExempt, amountTotal: params.gasto.total, expenseDate: params.gasto.fecha || new Date().toISOString(),
      paymentMethod: "tarjeta", receiptUrl: params.gasto.receiptUrl ?? undefined, notes: "Cargado desde la foto de la boleta (Stock de barra).", createdByUserId: params.userId,
    });
    gastoId = r.id;
  }
  return { yaAplicada: false as const, insumos: porInsumo.size, gastoId };
}

