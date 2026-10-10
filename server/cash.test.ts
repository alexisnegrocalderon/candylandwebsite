import { describe, expect, it } from "vitest";
import { cashPosition, parseBankStatement, parseClp, parseDateCl, parseDelimited, suggestClass } from "../shared/cash";

describe("parseClp y parseDateCl", () => {
  it("formatos chilenos", () => {
    expect(parseClp("$1.234.567")).toBe(1234567);
    expect(parseClp("-15.000")).toBe(-15000);
    expect(parseClp("(5.000)")).toBe(-5000);
    expect(parseClp("1234,50")).toBe(1235);
    expect(parseClp("")).toBeNull();
    expect(parseDateCl("05/10/2026")).toBe("2026-10-05");
    expect(parseDateCl("5-1-26")).toBe("2026-01-05");
    expect(parseDateCl("2026-10-05 12:00")).toBe("2026-10-05");
  });
  it("detecta el separador", () => {
    expect(parseDelimited("a;b;c\n1;2;3")).toEqual([["a", "b", "c"], ["1", "2", "3"]]);
    expect(parseDelimited('a,b\n"x, y",2')).toEqual([["a", "b"], ["x, y", "2"]]);
  });
});

describe("parseBankStatement", () => {
  const cartola = [
    "Banco Ejemplo;;;;",
    "Cuenta Corriente 123;;;;",
    "Fecha;Descripción;Cargos;Abonos;Saldo",
    "01/10/2026;TRANSF DE MERCADO PAGO;;500.000;1.500.000",
    "02/10/2026;GIRO CAJERO AUTOMATICO;100.000;;1.400.000",
    "03/10/2026;PAGO PROVEEDOR HIELO;35.700;;1.364.300",
    "03/10/2026;PAGO PROVEEDOR HIELO;35.700;;1.328.600",
    ";Total;;;",
  ].join("\n");
  it("encuentra el encabezado, lee montos con signo y sugiere clasificación", () => {
    const r = parseBankStatement(cartola);
    expect(r.error).toBeNull();
    expect(r.movements).toHaveLength(4);
    expect(r.movements[0]).toMatchObject({ date: "2026-10-01", amount: 500000, balance: 1500000, suggested: "traspaso" });
    expect(r.movements[1]).toMatchObject({ amount: -100000, suggested: "retiro_dueno" });
    expect(r.movements[2].suggested).toBe("por_clasificar");
    expect(r.skipped).toBe(1);
  });
  it("dos movimientos idénticos el mismo día no se pisan y reimportar da los mismos ids", () => {
    const a = parseBankStatement(cartola).movements;
    const b = parseBankStatement(cartola).movements;
    expect(a[2].externalId).not.toBe(a[3].externalId);
    expect(a.map((m) => m.externalId)).toEqual(b.map((m) => m.externalId));
  });
  it("cartola con una sola columna de monto", () => {
    const r = parseBankStatement("Fecha,Detalle,Monto,Saldo\n2026-10-01,Abono,\"10.000\",\"20.000\"\n2026-10-02,Compra,-2.000,18.000");
    expect(r.movements.map((m) => m.amount)).toEqual([10000, -2000]);
  });
  it("sin encabezados reconocibles da un error claro", () => {
    expect(parseBankStatement("a;b\n1;2").error).toMatch(/encabezados/);
  });
});

describe("suggestClass y cashPosition", () => {
  it("comisiones y retiros de Mercado Pago", () => {
    expect(suggestClass("Comisión mantención", -3000, "banco")).toBe("comision");
    expect(suggestClass("Retiro a tu cuenta bancaria", -200000, "mercadopago")).toBe("traspaso");
  });
  it("lo que queda en la empresa y aviso si retiraste más de lo ganado", () => {
    const c = cashPosition({ balances: [{ source: "mercadopago", balance: 800000 }, { source: "banco", balance: 200000 }], monthProfit: 500000, monthWithdrawals: 700000 });
    expect(c.totalBalance).toBe(1000000);
    expect(c.leftInCompany).toBe(-200000);
    expect(c.withdrawalsOverProfit).toBe(true);
  });
});

import { parseMercadoPagoStatement } from "../shared/cash";
describe("parseMercadoPagoStatement (estado de cuenta de Mercado Pago)", () => {
  const file = [
    "INITIAL_BALANCE;CREDITS;DEBITS;FEES;TAX_WITHHOLDINGS;AVERAGE_DAILY_BALANCE;FINAL_BALANCE",
    "10.000,00;31.901,00;15.000,00;1.212,00;0,00;1,00;25.689,00",
    "",
    "RELEASE_DATE;MOVEMENT_TYPE;TRANSACTION_TYPE;TRANSACTION_ID;CURRENCY_DESCRIPTION;TRANSACTION_NET_AMOUNT;MP_PROCESSING_FEE;STORE_NAME",
    "02-09-2026 00:12:19;Abono;Rentabilidad;111;CLP;1,00;0,00;",
    "07-09-2026 09:38:20;Abono;Liberación de dinero;222;CLP;31.900,00;-1.212,00;",
    "09-09-2026 15:03:38;Cargo;Retiro de dinero;333;CLP;-10.000,00;0,00;",
    "10-09-2026 17:34:53;Cargo;Pago;444;CLP;-5.000,00;0,00;",
  ].join("\n");
  const r = parseMercadoPagoStatement(file)!;
  it("lee ventas netas de comisión y el saldo final cuadra", () => {
    expect(r.finalBalance).toBe(25_689);
    const sale = r.movements.find((m) => m.externalId === "pay:222")!;
    expect(sale).toMatchObject({ amount: 30_688, gross: 31_900, fee: 1_212, classification: "venta" });
    expect(10_000 + r.movements.reduce((s, m) => s + m.amount, 0)).toBe(r.finalBalance);
    expect(r.feePercent).toBe(3.8);
  });
  it("rentabilidad se contabiliza sola; retiros y pagos quedan por clasificar (con sugerencia)", () => {
    expect(r.movements.find((m) => m.kind === "rentabilidad")?.classification).toBe("otro");
    const retiro = r.movements.find((m) => m.description === "Retiro de dinero")!;
    expect(retiro).toMatchObject({ classification: "por_clasificar", suggestion: "retiro_dueno" });
    expect(r.movements.find((m) => m.description === "Pago")?.classification).toBe("por_clasificar");
    expect(r.movements[0].occurredAt).toBe("2026-09-02T00:12:19-03:00");
  });
  it("una cartola de banco no se confunde con un estado de Mercado Pago", () => {
    expect(parseMercadoPagoStatement("Fecha;Descripción;Cargos;Abonos;Saldo\n01/10/2026;X;;1;1")).toBeNull();
  });
});
