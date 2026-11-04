import { beforeEach, describe, expect, it, vi } from "vitest";

const events = [
  { id: 3, title: "Aniversario", slug: "aniv", eventDate: new Date("2026-10-30T23:00:00Z"), status: "past", venue: "Mansión" },
  { id: 4, title: "Navidad", slug: "nav", eventDate: new Date("2026-12-20T23:00:00Z"), status: "published", venue: null },
];
const customers = [
  { email: "a@x.cl", fullName: "Ana", totalOrders: 2, totalSpent: "50000", lastSeenAt: new Date("2026-10-30"), levelOverride: null, tags: [] },
  { email: "b@x.cl", fullName: "Beto", totalOrders: 6, totalSpent: "180000", lastSeenAt: new Date("2026-10-30"), levelOverride: "vip", tags: ["VIP"] },
  { email: "c@x.cl", fullName: "Caro", totalOrders: 1, totalSpent: "20000", lastSeenAt: new Date("2025-01-01"), levelOverride: null, tags: [] },
];
vi.mock("../db", () => ({
  getAllEvents: vi.fn(async () => events),
  getEventById: vi.fn(async (id: number) => events.find((e) => e.id === id) ?? null),
  listCustomers: vi.fn(async () => customers),
  getTicketTypesByEventId: vi.fn(async () => [{ id: 11, name: "General", category: "acceso", price: "15000", soldCount: 120, totalStock: 300, status: "active" }]),
  getEventResults: vi.fn(), getOrderStats: vi.fn(), getPnlComparison: vi.fn(), listExpenses: vi.fn(async () => []), listStaffComps: vi.fn(async () => []), getDb: vi.fn(async () => null),
}));
vi.mock("../finance", () => ({ getEventFinanceReport: vi.fn(async () => { throw new Error("sin base"); }), getEventLive: vi.fn() }));
vi.mock("../financeCompany", () => ({ getCompanyYear: vi.fn(), getPayables: vi.fn() }));
vi.mock("../memberHistory", () => ({ getMemberHistory: vi.fn(async () => ({ items: [], next: null })) }));
vi.mock("../insumos", () => ({ consumoDelEvento: vi.fn(), estadoBarra: vi.fn(), personasDelEvento: vi.fn(), proyeccion: vi.fn() }));
vi.mock("../staff", () => ({ listStaff: vi.fn(async () => []) }));
vi.mock("../staffGiftQuota", () => ({ getQuotas: vi.fn(async () => ({})) }));
vi.mock("../accessCredit", () => ({ listGiftPasses: vi.fn(async () => []) }));

const ctx = () => ({ now: new Date("2026-11-04T12:00:00Z"), charts: [] as any[], proposals: [] as any[] });

beforeEach(() => vi.clearAllMocks());

describe("herramientas del asistente", () => {
  it("cada definición es un objeto JSON Schema válido para la API, con nombre único", async () => {
    const { toolDefinitions } = await import("./tools");
    const defs = toolDefinitions();
    expect(defs.length).toBeGreaterThanOrEqual(18);
    expect(new Set(defs.map((d) => d.name)).size).toBe(defs.length);
    for (const d of defs) {
      expect(d.input_schema.type).toBe("object");
      expect(d.input_schema).not.toHaveProperty("$schema");
      expect(d.description.length).toBeGreaterThan(30);
    }
  });

  it("listar_eventos trae ids, fecha en Chile y estado, con límite", async () => {
    const { runTool } = await import("./tools");
    const r = await runTool("listar_eventos", { limite: 1 }, ctx());
    const data = JSON.parse(r.content);
    expect(r.isError).toBe(false);
    expect(data).toHaveLength(1);
    expect(data[0]).toMatchObject({ id: 3, titulo: "Aniversario", estado: "past" });
    expect(data[0].fecha).toMatch(/2026/);
  });

  it("clientes: ranking por gasto con nivel, y filtro por nivel", async () => {
    const { runTool } = await import("./tools");
    const top = JSON.parse((await runTool("clientes", { orden: "gasto", limite: 2 }, ctx())).content);
    expect(top.total_encontrados).toBe(3);
    expect(top.clientes.map((c: any) => [c.nombre, c.gasto_total, c.nivel])).toEqual([["Beto", 180000, "vip"], ["Ana", 50000, expect.any(String)]]);
    const inactivos = JSON.parse((await runTool("clientes", { nivel: "inactivo" }, ctx())).content);
    expect(inactivos.clientes.map((c: any) => c.nombre)).toEqual(["Caro"]);
  });

  it("errores vuelven como texto para que la IA los explique (nunca lanzan)", async () => {
    const { runTool } = await import("./tools");
    expect(await runTool("no_existe", {}, ctx())).toMatchObject({ isError: true });
    const bad = await runTool("listar_eventos", { limite: 999 }, ctx());
    expect(bad.isError).toBe(true);
    expect(bad.content).toMatch(/Datos inválidos/);
    const noEvent = await runTool("productos_evento", { evento_id: 99 }, ctx());
    expect(noEvent).toMatchObject({ isError: true });
    expect(noEvent.content).toMatch(/No existe el evento 99/);
    const thrown = await runTool("finanzas_evento", { evento_id: 3 }, ctx());
    expect(thrown.content).toMatch(/sin base/);
  });

  it("mostrar_grafico y proponer_accion no tocan datos: dejan el gráfico y la tarjeta", async () => {
    const { runTool } = await import("./tools");
    const c = ctx();
    await runTool("mostrar_grafico", { titulo: "Ventas", tipo: "barras", unidad: "CLP", serie: [{ etiqueta: "Aniv", valor: 100 }] }, c);
    expect(c.charts).toHaveLength(1);
    const ok = await runTool("proponer_accion", { resumen: "Regalar 2 General a Ana", accion: { tipo: "regalar", evento_id: 4, correos: ["a@x.cl"], items: [{ ticket_type_id: 11, cantidad: 2 }], modo: "directo", cualquier_evento: false, mensaje: null } }, c);
    expect(ok.isError).toBe(false);
    expect(c.proposals[0]).toMatchObject({ resumen: "Regalar 2 General a Ana", estado: "pendiente", accion: { tipo: "regalar", correos: ["a@x.cl"] } });
    const bad = await runTool("proponer_accion", { resumen: "x", accion: { tipo: "push", correo: "no-es-correo", titulo: "t", texto: "x" } }, c);
    expect(bad.isError).toBe(true);
    expect(c.proposals).toHaveLength(1);
  });

  it("un resultado enorme se recorta con aviso", async () => {
    const { serializeResult, TOOL_RESULT_MAX_CHARS } = await import("./tools");
    const s = serializeResult({ filas: Array.from({ length: 5000 }, (_, i) => ({ i, texto: "x".repeat(20) })) });
    expect(s.length).toBeLessThan(TOOL_RESULT_MAX_CHARS + 100);
    expect(s).toMatch(/recortado/);
  });
});
