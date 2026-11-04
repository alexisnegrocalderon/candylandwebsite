import { beforeEach, describe, expect, it, vi } from "vitest";

const saved: { role: string; api: any[]; ui: any }[] = [];
const cleared: number[] = [];
let history: any[] = [];
let exchanges = 0;
let budgetLevel = "ok";

vi.mock("./store", () => ({
  threadExists: async () => true,
  createThread: async () => 7,
  loadHistory: async () => ({ api: history, exchanges }),
  insertMessage: async (_t: number, role: string, api: any[], ui: any) => { saved.push({ role, api, ui }); return saved.length; },
  clearApi: async (id: number) => { cleared.push(id); },
  touchThread: async () => {},
  listThreads: async () => [], getThread: async () => null, deleteThread: async () => {}, getProposal: async () => null, setProposalState: async () => {}, claimProposal: async () => null,
}));
vi.mock("../db", () => ({ recordAiUsage: async () => {} }));
vi.mock("../aiBudget", () => ({ loadAiBudget: async () => ({ level: budgetLevel }) }));
const ran: { name: string; input: any }[] = [];
vi.mock("./tools", () => ({
  toolDefinitions: () => [{ name: "listar_eventos", description: "x", input_schema: { type: "object" } }],
  runTool: async (name: string, input: any, ctx: any) => {
    ran.push({ name, input });
    if (name === "mostrar_grafico") ctx.charts.push({ titulo: "Ventas", tipo: "barras", unidad: "CLP", serie: [{ etiqueta: "A", valor: 1 }] });
    return { content: JSON.stringify({ ok: name }), isError: false };
  },
}));

const usage = { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
const msg = (content: any[], stop_reason: string) => ({ id: "m", model: "claude-opus-5-5", role: "assistant", content, stop_reason, usage });
const toolUse = (id: string, name: string, input: any = {}) => ({ type: "tool_use", id, name, input });

function fakeClient(responses: any[]) {
  const calls: any[] = [];
  return {
    calls,
    client: { beta: { messages: { create: async (p: any) => { calls.push(JSON.parse(JSON.stringify(p))); const r = responses.shift(); if (r instanceof Error) throw r; return r ?? msg([toolUse(`t${calls.length}`, "listar_eventos")], "tool_use"); } } } },
  };
}

beforeEach(() => { saved.length = 0; cleared.length = 0; ran.length = 0; history = []; exchanges = 0; budgetLevel = "ok"; });

describe("asistente: el ciclo con herramientas", () => {
  it("consulta, responde y guarda la conversación exacta", async () => {
    const run = await import("./run");
    const { client, calls } = fakeClient([
      msg([{ type: "text", text: "Reviso." }, toolUse("t1", "listar_eventos", { limite: 5 })], "tool_use"),
      msg([{ type: "text", text: "Tienes 3 eventos." }], "end_turn"),
    ]);
    run.setAssistantClientForTests(client as any);
    const r = await run.ask({ question: "¿Cuántos eventos tengo?", context: { eventId: 4, eventTitle: "Aniversario", section: "Inicio" }, now: new Date("2026-11-04T20:00:00Z") });
    expect(r.threadId).toBe(7);
    expect(r.message.ui).toMatchObject({ text: "Tienes 3 eventos.", sources: ["listar_eventos"] });
    expect(r.message.ui.error).toBeUndefined();
    // La llamada usa el modelo, el respaldo automático y el caché del sistema.
    expect(calls[0]).toMatchObject({ model: "claude-opus-5-5", betas: ["server-side-fallback-2026-07-01"], fallbacks: "default", output_config: { effort: "medium" } });
    expect(calls[0].system[0].cache_control).toEqual({ type: "ephemeral" });
    // El contexto (fecha, evento y pantalla) va en el mensaje del usuario, no en el sistema.
    expect(calls[0].messages[0].content).toMatch(/Aniversario.*id 4/);
    expect(calls[0].system[0].text).not.toMatch(/2026/);
    // El resultado vuelve como tool_result y la segunda llamada repite todo lo anterior sin cambios.
    expect(calls[1].messages).toHaveLength(3);
    expect(calls[1].messages[1]).toEqual(calls[0].messages.length === 1 ? { role: "assistant", content: [{ type: "text", text: "Reviso." }, toolUse("t1", "listar_eventos", { limite: 5 })] } : null);
    expect(calls[1].messages[2].content[0]).toMatchObject({ type: "tool_result", tool_use_id: "t1" });
    expect(ran).toEqual([{ name: "listar_eventos", input: { limite: 5 } }]);
    // Se guarda la pregunta y el turno completo (asistente, resultados, asistente).
    expect(saved.map((s) => s.role)).toEqual(["user", "assistant"]);
    expect(saved[1].api.map((m: any) => m.role)).toEqual(["assistant", "user", "assistant"]);
    expect(cleared).toEqual([]);
  });

  it("varias consultas de una ronda vuelven juntas en UN mensaje, y el gráfico llega a la pantalla", async () => {
    const run = await import("./run");
    const { client, calls } = fakeClient([
      msg([toolUse("a", "listar_eventos"), toolUse("b", "mostrar_grafico")], "tool_use"),
      msg([{ type: "text", text: "Listo." }], "end_turn"),
    ]);
    run.setAssistantClientForTests(client as any);
    const r = await run.ask({ question: "ventas", context: {} });
    expect(calls[1].messages[2].content.map((c: any) => c.tool_use_id)).toEqual(["a", "b"]);
    expect(r.message.ui.charts).toHaveLength(1);
    expect(r.message.ui.sources).toEqual(["listar_eventos"]);
  });

  it("repite la conversación anterior tal cual", async () => {
    history = [{ role: "user", content: "hola" }, { role: "assistant", content: [{ type: "thinking", thinking: "", signature: "s" }, { type: "text", text: "hola" }] }];
    exchanges = 1;
    const run = await import("./run");
    const { client, calls } = fakeClient([msg([{ type: "text", text: "ok" }], "end_turn")]);
    run.setAssistantClientForTests(client as any);
    await run.ask({ threadId: 7, question: "¿y ahora?", context: {} });
    expect(calls[0].messages.slice(0, 2)).toEqual(history);
  });

  it("corta tras 8 rondas de consultas, no guarda un turno a medias y lo explica", async () => {
    const run = await import("./run");
    const { client, calls } = fakeClient([]); // siempre pide otra herramienta
    run.setAssistantClientForTests(client as any);
    const r = await run.ask({ question: "todo", context: {} });
    expect(calls).toHaveLength(9);
    expect(r.message.ui).toMatchObject({ error: true });
    expect(r.message.ui.text).toMatch(/demasiadas consultas/);
    expect(saved[1].api).toEqual([]);
    expect(cleared).toEqual([1]);
  });

  it("si Claude falla, avisa y no deja la conversación inválida", async () => {
    const run = await import("./run");
    const { client } = fakeClient([new Error("se cayó")]);
    run.setAssistantClientForTests(client as any);
    const r = await run.ask({ question: "x", context: {} });
    expect(r.message.ui.error).toBe(true);
    expect(r.message.ui.text).toMatch(/se cayó/);
    expect(saved[1].api).toEqual([]);
  });

  it("un rechazo de seguridad no se muestra como respuesta vacía", async () => {
    const run = await import("./run");
    const { client } = fakeClient([msg([], "refusal")]);
    run.setAssistantClientForTests(client as any);
    const r = await run.ask({ question: "x", context: {} });
    expect(r.message.ui.text).toMatch(/No puedo responder/);
  });

  it("respeta el tope de gasto de IA y el largo máximo de una conversación", async () => {
    const run = await import("./run");
    run.setAssistantClientForTests(fakeClient([]).client as any);
    budgetLevel = "blocked";
    await expect(run.ask({ question: "x", context: {} })).rejects.toThrow(/tope de gasto/);
    budgetLevel = "ok";
    exchanges = 30;
    await expect(run.ask({ threadId: 7, question: "x", context: {} })).rejects.toThrow(/muy larga/);
  });
});
