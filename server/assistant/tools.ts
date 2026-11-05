/* Herramientas del Asistente IA: SOLO LECTURA, y cada una envuelve la misma función que usa la pantalla del panel
 * (mismos cálculos, mismos números). La IA no calcula plata por su cuenta: pide estos datos y los explica.
 * Dos herramientas no consultan nada: `mostrar_grafico` (dibuja lo que ya se consultó) y `proponer_accion` (deja una
 * acción para que el dueño la confirme; nunca la ejecuta). */
import { z } from "zod";
import * as db from "../db";
import { getEventFinanceReport, getEventLive } from "../finance";
import { getCompanyYear, getPayables } from "../financeCompany";
import { getMemberHistory } from "../memberHistory";
import { consumoDelEvento, estadoBarra, personasDelEvento, proyeccion } from "../insumos";
import { appUserEmails } from "../appDevices";
import { listStaff } from "../staff";
import { getQuotas } from "../staffGiftQuota";
import { listGiftPasses } from "../accessCredit";
import { computeCustomerLevel } from "../../shared/customerInsights";
import { formatCantidad } from "../../shared/insumos";
import { valorDe } from "../../shared/inventarioReporte";
import type { AssistantChart, AssistantProposal } from "../../shared/assistant";

/** Lo que una consulta va juntando además de su respuesta: gráficos y acciones por confirmar. */
export interface ToolContext {
  now: Date;
  charts: AssistantChart[];
  proposals: AssistantProposal[];
}

export interface AssistantTool<S extends z.ZodTypeAny = z.ZodTypeAny> {
  name: string;
  description: string;
  schema: S;
  run: (input: z.infer<S>, ctx: ToolContext) => Promise<unknown>;
}

const tool = <S extends z.ZodTypeAny>(t: AssistantTool<S>): AssistantTool => t as unknown as AssistantTool;
const chileDate = (d: Date | string | null | undefined) => (d ? new Intl.DateTimeFormat("es-CL", { timeZone: "America/Santiago", dateStyle: "full", timeStyle: "short" }).format(new Date(d)) : null);
const n = (v: unknown) => (v == null || v === "" ? 0 : Number(v));
const eventoId = z.number().int().positive().describe("id del evento (sale de listar_eventos)");

async function needEvent(id: number) {
  const e = await db.getEventById(id);
  if (!e) throw new Error(`No existe el evento ${id}. Usa listar_eventos para ver los ids.`);
  return e;
}

export const ASSISTANT_TOOLS: AssistantTool[] = [
  tool({
    name: "listar_eventos",
    description: "Los eventos (fiestas) de la productora con id, título, fecha y hora en Chile, estado (draft, published, soldout, cancelled, past) y lugar. Úsala primero para encontrar el id de un evento por su nombre o fecha.",
    schema: z.object({
      limite: z.number().int().min(1).max(60).optional().describe("cuántos, de los más nuevos a los más viejos (por defecto 30)"),
    }),
    run: async ({ limite }) => {
      const rows = await db.getAllEvents();
      return (rows as any[]).slice(0, limite ?? 30).map((e) => ({ id: e.id, titulo: e.title, slug: e.slug, fecha: chileDate(e.eventDate), fechaIso: e.eventDate, estado: e.status, lugar: e.venue ?? null }));
    },
  }),
  tool({
    name: "productos_evento",
    description: "Las entradas (accesos), extras y la carta (tragos, comida, merch) de un evento: id, nombre, categoría, precio, vendidos y cupo. Necesaria antes de proponer regalar algo (da los ticket_type_id).",
    schema: z.object({ evento_id: eventoId }),
    run: async ({ evento_id }) => {
      await needEvent(evento_id);
      const rows = await db.getTicketTypesByEventId(evento_id);
      return (rows as any[]).map((t) => ({ ticket_type_id: t.id, nombre: t.name, categoria: t.category, precio: n(t.price), vendidos: n(t.soldCount), cupo: t.totalStock == null ? null : n(t.totalStock), estado: t.status }));
    },
  }),
  tool({
    name: "resultados_evento",
    description: "Ventas de un evento: entradas vendidas por tipo, ingresos y órdenes de la web y de la caja (barra). Los mismos números de Ventas Web, Ventas Caja y Resultados.",
    schema: z.object({ evento_id: eventoId }),
    run: async ({ evento_id }) => {
      const e = await needEvent(evento_id);
      const [resultados, web, caja] = await Promise.all([db.getEventResults(evento_id), db.getOrderStats("web", evento_id), db.getOrderStats("caja", evento_id)]);
      return { evento: e.title, fecha: chileDate(e.eventDate), web, caja, resultados };
    },
  }),
  tool({
    name: "finanzas_evento",
    description: "El estado de resultados de un evento: ingreso real, IVA, costo de productos, gastos, staff, comisiones, tarjeta, ganancia o pérdida, margen, entradas para no perder y consejos. Lo mismo que Finanzas del evento.",
    schema: z.object({ evento_id: eventoId }),
    run: async ({ evento_id }) => {
      await needEvent(evento_id);
      return (await getEventFinanceReport(evento_id)) ?? { aviso: "Este evento todavía no tiene datos de finanzas." };
    },
  }),
  tool({
    name: "en_vivo",
    description: "Cómo va un evento ahora mismo: ventas y ritmo de la última ventana de minutos, para preguntas de «esta noche» o «cómo va la venta de hoy».",
    schema: z.object({ evento_id: eventoId, minutos: z.number().int().min(10).max(600).optional().describe("ventana para el ritmo (por defecto 60)") }),
    run: async ({ evento_id, minutos }, ctx) => (await getEventLive(evento_id, minutos ?? 60, ctx.now)) ?? { aviso: "Sin datos en vivo para este evento." },
  }),
  tool({
    name: "finanzas_empresa",
    description: "Resultado de la empresa en un año, mes a mes: eventos de cada mes, ingreso, ganancia de los eventos, gastos fijos sin evento y resultado. Para preguntas del año, de un mes o de la productora en general.",
    schema: z.object({ anio: z.number().int().min(2020).max(2100).describe("año, ej. 2026") }),
    run: async ({ anio }) => (await getCompanyYear(anio)) ?? { aviso: `Sin datos para ${anio}.` },
  }),
  tool({
    name: "por_pagar",
    description: "Lo que la productora debe hoy: comisiones de embajadores (ya debidas y futuras), staff sin pagar, estacionamiento al local y saldo PlayCard de clientes.",
    schema: z.object({}),
    run: async () => (await getPayables()) ?? { aviso: "Sin datos de cuentas por pagar." },
  }),
  tool({
    name: "comparar_eventos",
    description: "Compara la ganancia, ingresos, costos y margen de varias fiestas (las indicadas o todas si no se indican). Para «cuál fue la más rentable», rankings y tendencias.",
    schema: z.object({ evento_ids: z.array(z.number().int().positive()).max(15).optional() }),
    run: async ({ evento_ids }) => db.getPnlComparison(evento_ids && evento_ids.length ? evento_ids : undefined),
  }),
  tool({
    name: "gastos",
    description: "Gastos registrados (Finanzas) de un evento o de un mes, con su total. Filtra por ámbito (evento o general) y categoría.",
    schema: z.object({
      evento_id: eventoId.optional(),
      mes: z.string().regex(/^\d{4}-\d{2}$/).optional().describe("mes en formato AAAA-MM"),
      ambito: z.enum(["evento", "general"]).optional(),
      categoria: z.string().max(60).optional(),
    }),
    run: async ({ evento_id, mes, ambito, categoria }) => {
      const rows = (await db.listExpenses({ eventId: evento_id, monthKey: mes, scope: ambito, category: categoria })) as any[];
      const total = rows.reduce((s, r) => s + n(r.amountTotal), 0);
      return { cantidad: rows.length, total, gastos: rows.slice(0, 60).map((r) => ({ fecha: r.expenseDate, descripcion: r.description, categoria: r.category, proveedor: r.supplier ?? null, monto: n(r.amountTotal), ambito: r.scope })), recortado: rows.length > 60 };
    },
  }),
  tool({
    name: "clientes",
    description: "Clientes de la productora: buscar por nombre, correo, teléfono o RUT, o ver un ranking (los que más gastan, los que más compran, los más recientes). Trae compras, gasto total, última visita, nivel (vip, recurrente, nuevo, inactivo, sin_compras) y si esa cuenta ya abrió la app (tiene_la_app).",
    schema: z.object({
      buscar: z.string().max(100).optional(),
      orden: z.enum(["gasto", "compras", "reciente"]).optional().describe("por defecto gasto"),
      nivel: z.enum(["vip", "recurrente", "nuevo", "inactivo", "sin_compras"]).optional(),
      limite: z.number().int().min(1).max(25).optional(),
    }),
    run: async ({ buscar, orden, nivel, limite }, ctx) => {
      const [rows, conApp] = await Promise.all([db.listCustomers(buscar ? { search: buscar } : {}) as Promise<any[]>, appUserEmails().catch(() => new Set<string>())]);
      const withLevel = rows.map((c) => ({ c, nivel: computeCustomerLevel({ totalOrders: n(c.totalOrders), totalSpent: n(c.totalSpent), lastActivityAt: c.lastSeenAt, levelOverride: c.levelOverride, now: ctx.now } as any) }));
      const filtered = nivel ? withLevel.filter((x) => x.nivel === nivel) : withLevel;
      const sorted = [...filtered].sort((a, b) => orden === "compras" ? n(b.c.totalOrders) - n(a.c.totalOrders) : orden === "reciente" ? new Date(b.c.lastSeenAt ?? 0).getTime() - new Date(a.c.lastSeenAt ?? 0).getTime() : n(b.c.totalSpent) - n(a.c.totalSpent));
      return {
        total_encontrados: filtered.length,
        clientes: sorted.slice(0, limite ?? 10).map(({ c, nivel: lv }) => ({ nombre: c.fullName ?? null, correo: c.email, telefono: c.phone ?? null, compras: n(c.totalOrders), gasto_total: n(c.totalSpent), ultima_visita: chileDate(c.lastSeenAt), nivel: lv, tiene_la_app: conApp.has(String(c.email).toLowerCase()), etiquetas: c.tags ?? [], ciudad: c.city ?? null })),
      };
    },
  }),
  tool({
    name: "cliente",
    description: "La ficha de UN cliente por su correo: datos, compras, gasto, nivel y su historial (entradas, consumos, cupones, regalos).",
    schema: z.object({ correo: z.string().email() }),
    run: async ({ correo }, ctx) => {
      const [rows, conApp] = await Promise.all([db.listCustomers({ search: correo }) as Promise<any[]>, appUserEmails().catch(() => new Set<string>())]);
      const c = rows.find((r) => String(r.email).toLowerCase() === correo.toLowerCase());
      if (!c) return { aviso: `No hay un cliente con el correo ${correo}.` };
      const historial = await getMemberHistory(c.email, { limit: 25 }).catch(() => ({ items: [], next: null }));
      return {
        nombre: c.fullName ?? null, correo: c.email, tiene_la_app: conApp.has(String(c.email).toLowerCase()), telefono: c.phone ?? null, instagram: c.instagram ?? null, compras: n(c.totalOrders), gasto_total: n(c.totalSpent),
        nivel: computeCustomerLevel({ totalOrders: n(c.totalOrders), totalSpent: n(c.totalSpent), lastActivityAt: c.lastSeenAt, levelOverride: c.levelOverride, now: ctx.now } as any),
        cliente_desde: chileDate(c.firstSeenAt), ultima_visita: chileDate(c.lastSeenAt), cumpleanos: c.birthDate ?? null, etiquetas: c.tags ?? [], notas: c.notes ?? null,
        historial: historial.items,
      };
    },
  }),
  tool({
    name: "stock_barra",
    description: "El stock actual de cada insumo (bebidas, desechables como guantes y vasos, limpieza): cantidad, nivel (agotado, bajo, ok), para cuántos tragos alcanza y cuánto vale en plata.",
    schema: z.object({ evento_id: eventoId.describe("evento de referencia para las recetas (el stock es global)") }),
    run: async ({ evento_id }) => {
      const e = await estadoBarra(evento_id);
      if (!e.ready) return { aviso: "El stock de barra no está activado." };
      return e.insumos.map((i) => ({
        insumo: i.name, grupo: i.grupo, hay: formatCantidad(i.stock, i), cantidad: i.stock, unidad: i.unit, nivel: i.level, alcanza_para_tragos: i.drinks,
        costo_envase: i.costPerContainer ?? null, valor_en_stock: i.stock > 0 ? valorDe(i.stock, { containerSize: i.containerSize, costPerContainer: i.costPerContainer ?? null }) : 0, lo_usan: i.usedBy,
      }));
    },
  }),
  tool({
    name: "compras_necesarias",
    description: "La lista de compras para un evento: cuánto se necesita de cada insumo para N personas (según las ventas de fiestas anteriores, las recetas y las reglas de guantes, vasos, etc.), cuánto hay, cuánto falta y cuánto cuesta.",
    schema: z.object({ evento_id: eventoId, personas: z.number().int().min(1).max(100_000).optional().describe("si no se indica, las que tienen entrada (o 300)") }),
    run: async ({ evento_id, personas }) => {
      const raw = await db.getDb();
      const esperadas = personas ?? ((raw ? (await personasDelEvento(raw, evento_id)).expected : 0) || 300);
      const p = await proyeccion({ eventId: evento_id, personas: esperadas });
      return {
        personas: esperadas, tragos_por_persona: p.tragosPorPersona, tragos_esperados: p.totalTragos, basado_en: p.fuentes,
        bebidas: p.insumos.map((i) => ({ insumo: i.name, necesita: i.need, hay: i.stock, falta: i.missing, envases_a_comprar: i.containersToBuy, costo: i.cost })),
        otros: p.generales.lineas.map((g) => ({ insumo: g.name, grupo: g.grupo, necesita: g.need, hay: g.stock, falta: g.missing, envases_a_comprar: g.containersToBuy, costo: g.cost })),
        costo_total: p.costoTotal + p.generales.costoTotal, tragos_sin_receta: p.sinReceta,
      };
    },
  }),
  tool({
    name: "consumo_evento",
    description: "Lo que se gastó de cada insumo en un evento: lo vendido en la barra (con anulaciones restadas) y la merma, con su valor en plata.",
    schema: z.object({ evento_id: eventoId }),
    run: async ({ evento_id }) => {
      const [consumo, e] = await Promise.all([consumoDelEvento(evento_id), estadoBarra(evento_id)]);
      const byId = new Map(e.ready ? e.insumos.map((i) => [i.id, i]) : []);
      return consumo.map((c) => {
        const i = byId.get(c.insumoId);
        return { insumo: i?.name ?? `insumo ${c.insumoId}`, usado: i ? formatCantidad(c.usado, i) : c.usado, merma: i && c.merma ? formatCantidad(c.merma, i) : c.merma, valor_usado: i ? valorDe(c.usado, { containerSize: i.containerSize, costPerContainer: i.costPerContainer ?? null }) : null };
      });
    },
  }),
  tool({
    name: "staff",
    description: "El equipo: nombre, cargo, correo, si está activo, tarifa por noche y cuántas entradas puede regalar desde su app (cupo).",
    schema: z.object({ incluir_archivados: z.boolean().optional() }),
    run: async ({ incluir_archivados }) => {
      const [rows, cupos] = await Promise.all([listStaff(), getQuotas().catch(() => ({} as Record<number, number>))]);
      return (rows as any[]).filter((m) => incluir_archivados || m.active).map((m) => ({ nombre: m.name, cargo: m.cargo ?? m.role ?? null, correo: m.email ?? null, activo: !!m.active, tarifa_noche: n(m.defaultRateClp), entradas_para_regalar: cupos[m.id] ?? 0 }));
    },
  }),
  tool({
    name: "regalos",
    description: "Lo regalado en un evento: pases de entrada (con su estado disponible, canjeado, vencido o anulado, incluidos los que valen para cualquier evento) y tragos de cortesía.",
    schema: z.object({ evento_id: eventoId }),
    run: async ({ evento_id }) => {
      const [pases, tragos] = await Promise.all([listGiftPasses(evento_id), db.listStaffComps(evento_id).catch(() => [])]);
      return {
        pases: pases.map((p) => ({ para: p.buyerName ?? p.buyerEmail, correo: p.buyerEmail, acceso: p.accesoName, estado: p.availability, cualquier_evento: p.eventId === null, vence: p.validUntil, motivo: p.reason })),
        tragos_cortesia: (tragos as any[]).slice(0, 80),
      };
    },
  }),
  tool({
    name: "mostrar_grafico",
    description: "Dibuja un gráfico en la respuesta con datos que YA consultaste con otra herramienta (nunca inventes valores). Úsalo cuando una comparación o evolución se entiende mejor viéndola: ventas por fiesta, ranking de tragos, mes a mes.",
    schema: z.object({
      titulo: z.string().max(80),
      tipo: z.enum(["barras", "lineas"]),
      unidad: z.enum(["CLP", "unidades", "%"]).nullable(),
      serie: z.array(z.object({ etiqueta: z.string().max(40), valor: z.number() })).min(1).max(40),
    }),
    run: async (input, ctx) => {
      ctx.charts.push(input as AssistantChart);
      return { ok: true, nota: "El gráfico se mostrará debajo de tu respuesta." };
    },
  }),
  tool({
    name: "proponer_accion",
    description: "Propone UNA acción para que el dueño la confirme con un botón: regalar entradas, extras o tragos (o un pase para cualquier evento), regalar un cupón de descuento o mandar una notificación push a una persona. NO la ejecuta: solo deja la tarjeta para confirmar. Antes de regalar, consulta productos_evento para los ticket_type_id.",
    schema: z.object({
      resumen: z.string().max(200).describe("qué se va a hacer, en una frase clara"),
      accion: z.discriminatedUnion("tipo", [
        z.object({
          tipo: z.literal("regalar"), evento_id: eventoId, correos: z.array(z.string().email()).min(1).max(20),
          items: z.array(z.object({ ticket_type_id: z.number().int().positive(), cantidad: z.number().int().min(1).max(20) })).min(1).max(10),
          modo: z.enum(["directo", "pase"]).describe("directo: le llega con QR; pase: queda en Cupones para canjear"),
          cualquier_evento: z.boolean().describe("solo con modo pase: el pase vale para cualquier evento"),
          mensaje: z.string().max(200).nullable(),
        }),
        z.object({
          tipo: z.literal("cupon"), correo: z.string().email(), descuento: z.enum(["percentage", "fixed"]), valor: z.number().int().min(1).max(1_000_000),
          dias: z.number().int().min(1).max(365), titulo: z.string().max(100).nullable(), evento_id: eventoId.nullable(),
        }),
        z.object({ tipo: z.literal("push"), correo: z.string().email(), titulo: z.string().max(60), texto: z.string().max(180) }),
      ]),
    }),
    run: async ({ resumen, accion }, ctx) => {
      const id = `a${ctx.proposals.length + 1}-${Math.random().toString(36).slice(2, 8)}`;
      ctx.proposals.push({ id, resumen, accion: accion as any, estado: "pendiente" });
      return { ok: true, nota: "Quedó una tarjeta para que el dueño confirme. Dile qué va a pasar si confirma; no digas que ya se hizo." };
    },
  }),
];

export const TOOLS_BY_NAME = new Map(ASSISTANT_TOOLS.map((t) => [t.name, t]));

/** Las definiciones para la API (JSON Schema sacado de los esquemas zod), en un orden fijo para que el caché pegue. */
export function toolDefinitions() {
  return ASSISTANT_TOOLS.map((t) => {
    const { $schema: _omit, ...schema } = z.toJSONSchema(t.schema) as Record<string, unknown>;
    return { name: t.name, description: t.description, input_schema: { type: "object" as const, ...schema } };
  });
}

/** Lo que vuelve a la IA de una herramienta: JSON, recortado si es muy largo (para no llenar la conversación). */
export const TOOL_RESULT_MAX_CHARS = 14_000;
export function serializeResult(value: unknown): string {
  const text = JSON.stringify(value ?? null, (_k, v) => (typeof v === "bigint" ? Number(v) : v));
  return text.length > TOOL_RESULT_MAX_CHARS ? `${text.slice(0, TOOL_RESULT_MAX_CHARS)}…(recortado: pide menos filas o un filtro más preciso)` : text;
}

/** Corre una herramienta validando su entrada. Nunca lanza: un error vuelve como texto para que la IA lo explique. */
export async function runTool(name: string, input: unknown, ctx: ToolContext): Promise<{ content: string; isError: boolean }> {
  const t = TOOLS_BY_NAME.get(name);
  if (!t) return { content: `No existe la herramienta ${name}.`, isError: true };
  const parsed = t.schema.safeParse(input);
  if (!parsed.success) return { content: `Datos inválidos para ${name}: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`, isError: true };
  try {
    return { content: serializeResult(await t.run(parsed.data, ctx)), isError: false };
  } catch (err) {
    return { content: `No se pudo consultar ${name}: ${err instanceof Error ? err.message : "error desconocido"}`, isError: true };
  }
}
