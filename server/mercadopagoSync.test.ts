import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("./db", () => ({ getDb: vi.fn() }));
import * as db from "./db";
import { syncMercadoPago } from "./mercadopagoSync";

function fakeDb() {
  const inserted: any[] = [];
  const insert = () => ({
    values: (v: any) => {
      inserted.push(v);
      const p: any = Promise.resolve();
      p.onDuplicateKeyUpdate = () => Promise.resolve();
      return p;
    },
  });
  return { inserted, conn: { insert } };
}

describe("syncMercadoPago (solo lectura, con la API simulada)", () => {
  beforeEach(() => { process.env.MERCADOPAGO_ACCESS_TOKEN = "TEST"; });

  it("guarda cobros con neto y comisión, lee el reporte (retiro al banco y saldo) y nunca escribe en Mercado Pago salvo pedir el reporte", async () => {
    const { inserted, conn } = fakeDb();
    vi.mocked(db.getDb).mockResolvedValue(conn as any);
    const calls: { url: string; method: string }[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: any) => {
      calls.push({ url, method: init?.method ?? "GET" });
      if (url.includes("/v1/payments/search")) {
        return new Response(JSON.stringify({ results: [
          { id: 1, status: "approved", transaction_amount: 10000, transaction_details: { net_received_amount: 9650 }, date_approved: "2026-10-01T22:00:00Z", description: "Entrada" },
          { id: 2, status: "rejected", transaction_amount: 5000 },
        ] }), { status: 200 });
      }
      if (url.endsWith("/v1/account/release_report/list")) {
        return new Response(JSON.stringify([{ file_name: "rr.csv", date_created: new Date().toISOString() }]), { status: 200 });
      }
      if (url.includes("/v1/account/release_report/rr.csv")) {
        return new Response("DATE;SOURCE_ID;DESCRIPTION;NET_CREDIT_AMOUNT;NET_DEBIT_AMOUNT;BALANCE_AMOUNT\n2026-10-01T22:00:00Z;1;payment;9650;0;9650\n2026-10-02T10:00:00Z;99;payout;0;5000;4650", { status: 200 });
      }
      return new Response("{}", { status: 404 });
    }));

    const r = await syncMercadoPago(30);
    expect(r.errors).toEqual([]);
    expect(r.payments).toBe(1);
    expect(r.movements).toBe(1);
    expect(r.balance).toBe(4650);
    const sale = inserted.find((v) => v.externalId === "pay:1");
    expect(sale).toMatchObject({ amountClp: 9650, classification: "venta" });
    expect(sale.raw.fee).toBe(350);
    const payout = inserted.find((v) => String(v.externalId).startsWith("rr:99"));
    expect(payout).toMatchObject({ amountClp: -5000, classification: "traspaso", description: "Retiro a tu cuenta bancaria" });
    expect(inserted.some((v) => v.source === "mercadopago" && v.balanceClp === 4650)).toBe(true);
    // Reporte reciente: no se pide otro. Ninguna llamada que mueva plata.
    expect(calls.every((c) => c.method === "GET")).toBe(true);
  });

  it("sin token da un error claro y no rompe", async () => {
    delete process.env.MERCADOPAGO_ACCESS_TOKEN;
    const { conn } = fakeDb();
    vi.mocked(db.getDb).mockResolvedValue(conn as any);
    const r = await syncMercadoPago(30);
    expect(r.errors.join(" ")).toMatch(/MERCADOPAGO_ACCESS_TOKEN/);
  });
});
