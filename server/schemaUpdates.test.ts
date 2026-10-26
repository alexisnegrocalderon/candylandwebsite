import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./db", () => ({ getDb: vi.fn() }));
import * as db from "./db";

const queryText = (q: any): string => (q?.queryChunks ?? []).map((c: any) => (typeof c === "string" ? c : (c?.value ?? []).join?.("") ?? "")).join("");

/** Base falsa de información de esquema: `columns`/`indexes` son lo que ya existe; lo demás queda anotado. */
function fakeDb(columns: [string, string][], indexes: [string, string][], tables: string[] = []) {
  const ran: string[] = [];
  return {
    ran,
    execute: vi.fn(async (q: any) => {
      const text = queryText(q);
      if (text.includes("information_schema.COLUMNS")) return [columns.map(([t, c]) => ({ t, c })), []];
      if (text.includes("information_schema.STATISTICS")) return [indexes.map(([t, i]) => ({ t, i })), []];
      if (text.includes("information_schema.TABLES")) return [tables.map((t) => ({ t })), []];
      ran.push(text);
      return [{}, []];
    }),
  };
}

const ALL_COLUMNS: [string, string][] = [["staffMembers", "email"], ["staffMembers", "cargo"], ["staffMembers", "pinHash"], ["staffMembers", "pinSetAt"], ["operators", "staffId"]];
const ALL_INDEXES: [string, string][] = [
  ["staffMembers", "staff_members_email_idx"], ["operators", "operators_staff_idx"],
  ["solteroApprovals", "soltero_approvals_email_idx"], ["solteroApprovals", "soltero_approvals_status_idx"],
];
const ALL_TABLES = ["solteroApprovals"];

// Cada prueba con el módulo limpio: guarda en memoria si el esquema ya estaba completo.
const load = async () => { vi.resetModules(); return import("./schemaUpdates"); };

beforeEach(() => { vi.resetAllMocks(); });

describe("actualización de esquema del staff", () => {
  it("lista lo que falta y lo aplica una sola vez", async () => {
    const fake = fakeDb([["staffMembers", "email"]], []);
    vi.mocked(db.getDb).mockResolvedValue(fake as any);
    const { staffSchemaStatus, applyStaffSchema } = await load();

    const status = await staffSchemaStatus();
    expect(status.ready).toBe(false);
    expect(status.missing).toHaveLength(9);

    const { applied } = await applyStaffSchema();
    expect(applied).toHaveLength(9);
    expect(fake.ran.some((s) => s.includes("ADD `email`"))).toBe(false); // ya existía
    expect(fake.ran.some((s) => s.includes("ADD `cargo`"))).toBe(true);
  });

  it("con todo aplicado no hace nada y queda listo", async () => {
    const fake = fakeDb(ALL_COLUMNS, ALL_INDEXES, ALL_TABLES);
    vi.mocked(db.getDb).mockResolvedValue(fake as any);
    const { staffSchemaStatus, applyStaffSchema } = await load();
    expect(await staffSchemaStatus()).toEqual({ ready: true, missing: [] });
    expect((await applyStaffSchema()).applied).toEqual([]);
    expect(fake.ran).toEqual([]);
  });

  it("hace lo mismo que los archivos de migración 0129 y 0130", async () => {
    const fake = fakeDb([], []);
    vi.mocked(db.getDb).mockResolvedValue(fake as any);
    const { applyStaffSchema } = await load();
    await applyStaffSchema();
    const file = ["0129_staff_unificado", "0130_soltero_approvals"].flatMap((name) => readFileSync(new URL(`../drizzle/${name}.sql`, import.meta.url), "utf8")
      .split("--> statement-breakpoint").map((s) => s.trim().replace(/;$/, "").trim()).filter(Boolean));
    expect(fake.ran.map((s) => s.trim())).toEqual(file);
  });

  it("el manual del staff va aparte y hace lo mismo que la migración 0131", async () => {
    const fake = fakeDb([], []);
    vi.mocked(db.getDb).mockResolvedValue(fake as any);
    const { manualSchemaStatus, applyManualSchema } = await load();
    expect((await manualSchemaStatus()).ready).toBe(false);
    await applyManualSchema();
    const file = readFileSync(new URL("../drizzle/0131_staff_manuals.sql", import.meta.url), "utf8")
      .split("--> statement-breakpoint").map((s) => s.trim().replace(/;$/, "").trim()).filter(Boolean);
    expect(fake.ran.map((s) => s.trim())).toEqual(file);
  });
});
