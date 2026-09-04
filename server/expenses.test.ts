import { describe, expect, it } from "vitest";
import {
  ivaFromGross,
  netFromGross,
  givesCreditoFiscal,
  deriveAmounts,
  expenseCostForPnl,
  prorationWeights,
  computePnl,
  cashCollectedFromOrders,
  type PnlExpense,
} from "../shared/expenses";

/** Gasto de prueba con valores derivados coherentes, como los guardaría el
 * servidor. */
function gasto(over: Partial<PnlExpense> & { amountTotal: number }): PnlExpense {
  const documentType = over.documentType ?? 'boleta';
  const ivaExempt = over.ivaExempt ?? 0;
  const derived = deriveAmounts({ amountTotal: over.amountTotal, documentType, ivaExempt });
  return {
    category: 'produccion',
    documentType,
    ivaExempt,
    ...derived,
    ...over,
  };
}

describe("cashCollectedFromOrders (el ingreso real, con Misión 300)", () => {
  it("una compra normal a precio general es simplemente su total", () => {
    expect(cashCollectedFromOrders([{ total: '45000' }])).toBe(45000);
  });

  it("abono sin resolver: solo entró el abono, la diferencia todavía no se cobra", () => {
    expect(cashCollectedFromOrders([
      { total: '10000', missionTopupStatus: 'none', missionTopupAmount: null },
    ])).toBe(10000);
  });

  it("copago pagado: se suma la diferencia, que webhooks.ts nunca escribe en total", () => {
    // Este es el bug que hacía que el ingreso quedara corto: la orden dice
    // $10.000 pero el cliente pagó $18.000 en dos veces.
    expect(cashCollectedFromOrders([
      { total: '10000', missionTopupStatus: 'paid', missionTopupAmount: '8000' },
    ])).toBe(18000);
  });

  it("meta cumplida: webhooks.ts deja el copago en '0', así que no se cuenta de más", () => {
    expect(cashCollectedFromOrders([
      { total: '10000', missionTopupStatus: 'paid', missionTopupAmount: '0' },
    ])).toBe(10000);
  });

  it("copago pendiente NO se cuenta: es plata que todavía no entró", () => {
    expect(cashCollectedFromOrders([
      { total: '10000', missionTopupStatus: 'pending', missionTopupAmount: '8000' },
    ])).toBe(10000);
  });

  it("suma una mezcla de órdenes de distinto tipo", () => {
    expect(cashCollectedFromOrders([
      { total: '45000' },                                                        // general
      { total: '10000', missionTopupStatus: 'paid', missionTopupAmount: '8000' }, // abono + copago
      { total: '10000', missionTopupStatus: 'pending', missionTopupAmount: '8000' }, // copago sin pagar
      { total: '20000', missionTopupStatus: 'paid', missionTopupAmount: '0' },    // meta cumplida
    ])).toBe(45000 + 18000 + 10000 + 20000);
  });
});

describe("IVA chileno", () => {
  it("extrae el IVA de un monto que ya lo incluye (19/119, no 19/100)", () => {
    // $11.900 con IVA incluido -> $1.900 de IVA, $10.000 neto.
    expect(ivaFromGross(11900)).toBe(1900);
    expect(netFromGross(11900)).toBe(10000);
  });

  it("neto + IVA siempre reconstruye el bruto exacto, sin perder un peso", () => {
    for (const bruto of [1, 7, 999, 12345, 30000, 45678, 1000001]) {
      expect(netFromGross(bruto) + ivaFromGross(bruto)).toBe(bruto);
    }
  });

  it("solo la factura no exenta da crédito fiscal", () => {
    expect(givesCreditoFiscal({ documentType: 'factura', ivaExempt: 0 })).toBe(true);
    expect(givesCreditoFiscal({ documentType: 'factura', ivaExempt: 1 })).toBe(false);
    expect(givesCreditoFiscal({ documentType: 'boleta', ivaExempt: 0 })).toBe(false);
    expect(givesCreditoFiscal({ documentType: 'boleta_honorarios', ivaExempt: 0 })).toBe(false);
    expect(givesCreditoFiscal({ documentType: 'sin_documento', ivaExempt: 0 })).toBe(false);
  });

  it("deriveAmounts deja la boleta entera y separa solo la factura", () => {
    expect(deriveAmounts({ amountTotal: 11900, documentType: 'boleta' }))
      .toEqual({ netAmount: 11900, ivaAmount: 0 });
    expect(deriveAmounts({ amountTotal: 11900, documentType: 'factura' }))
      .toEqual({ netAmount: 10000, ivaAmount: 1900 });
    // Factura exenta: es factura pero no lleva IVA recuperable.
    expect(deriveAmounts({ amountTotal: 11900, documentType: 'factura', ivaExempt: 1 }))
      .toEqual({ netAmount: 11900, ivaAmount: 0 });
  });
});

describe("expenseCostForPnl", () => {
  const factura = gasto({ amountTotal: 11900, documentType: 'factura' });
  const boleta = gasto({ amountTotal: 11900, documentType: 'boleta' });

  it("con IVA activo la factura entra NETA (su IVA se recupera) y la boleta entera", () => {
    expect(expenseCostForPnl(factura, true)).toBe(10000);
    expect(expenseCostForPnl(boleta, true)).toBe(11900);
  });

  it("sin declarar IVA no hay nada que recuperar: todo entra bruto", () => {
    expect(expenseCostForPnl(factura, false)).toBe(11900);
    expect(expenseCostForPnl(boleta, false)).toBe(11900);
  });
});

describe("prorationWeights", () => {
  it("reparte según la participación en los ingresos del mes", () => {
    const w = prorationWeights([
      { eventId: 1, grossIncome: 700000 },
      { eventId: 2, grossIncome: 300000 },
    ]);
    expect(w.get(1)).toBeCloseTo(0.7);
    expect(w.get(2)).toBeCloseTo(0.3);
  });

  it("mes con eventos pero sin ventas: reparto igualitario en vez de dividir por cero", () => {
    const w = prorationWeights([
      { eventId: 1, grossIncome: 0 },
      { eventId: 2, grossIncome: 0 },
      { eventId: 3, grossIncome: 0 },
    ]);
    expect(w.get(1)).toBeCloseTo(1 / 3);
    expect(w.get(2)).toBeCloseTo(1 / 3);
    expect(w.get(3)).toBeCloseTo(1 / 3);
  });

  it("mes sin eventos devuelve vacío -- esos gastos van al balde 'sin asignar'", () => {
    expect(prorationWeights([]).size).toBe(0);
  });

  it("los pesos siempre suman 1, así no se pierde ni se inventa plata", () => {
    const w = prorationWeights([
      { eventId: 1, grossIncome: 123457 },
      { eventId: 2, grossIncome: 76543 },
      { eventId: 3, grossIncome: 1 },
    ]);
    const total = Array.from(w.values()).reduce((s, v) => s + v, 0);
    expect(total).toBeCloseTo(1, 10);
  });
});

describe("computePnl sin declarar IVA (evento 'sin movimiento')", () => {
  it("todo va bruto y el IVA queda en cero", () => {
    const r = computePnl({
      ivaApplies: false,
      grossIncome: 1000000,
      cogs: 100000,
      ambassadorCommissions: 50000,
      directExpenses: [gasto({ amountTotal: 200000, documentType: 'factura' })],
      generalExpenses: [],
      prorationWeight: 1,
    });
    expect(r.iva).toEqual({ debitoFiscal: 0, creditoFiscal: 0, ivaAPagar: 0, remanenteCredito: 0 });
    expect(r.netIncome).toBe(1000000);
    // La factura entra BRUTA porque no hay crédito que recuperar.
    expect(r.directExpensesTotal).toBe(200000);
    expect(r.netProfit).toBe(1000000 - 100000 - 200000 - 50000);
    expect(r.marginPercent).toBe(65);
  });
});

describe("computePnl declarando IVA", () => {
  it("no cuenta el IVA dos veces: ivaAPagar es informativo y no se resta del resultado", () => {
    const r = computePnl({
      ivaApplies: true,
      grossIncome: 1190000,       // $1.000.000 neto + $190.000 de IVA
      cogs: 0,
      ambassadorCommissions: 0,
      directExpenses: [gasto({ amountTotal: 119000, documentType: 'factura' })], // $100.000 + $19.000
      generalExpenses: [],
      prorationWeight: 1,
    });

    expect(r.iva.debitoFiscal).toBe(190000);
    expect(r.iva.creditoFiscal).toBe(19000);
    expect(r.iva.ivaAPagar).toBe(171000);

    expect(r.netIncome).toBe(1000000);
    expect(r.directExpensesTotal).toBe(100000);
    // La utilidad es neto contra neto. Restarle además los $171.000 de IVA a
    // pagar sería contar el mismo impuesto dos veces.
    expect(r.netProfit).toBe(900000);
  });

  it("la boleta cuesta más que la factura por el mismo monto pagado", () => {
    const base = {
      ivaApplies: true, grossIncome: 1190000, cogs: 0, ambassadorCommissions: 0,
      generalExpenses: [], prorationWeight: 1,
    };
    const conFactura = computePnl({ ...base, directExpenses: [gasto({ amountTotal: 119000, documentType: 'factura' })] });
    const conBoleta = computePnl({ ...base, directExpenses: [gasto({ amountTotal: 119000, documentType: 'boleta' })] });

    expect(conFactura.netProfit - conBoleta.netProfit).toBe(19000);
  });

  it("cuando el crédito supera al débito no hay impuesto a pagar sino remanente", () => {
    const r = computePnl({
      ivaApplies: true,
      grossIncome: 119000,
      cogs: 0,
      ambassadorCommissions: 0,
      directExpenses: [gasto({ amountTotal: 595000, documentType: 'factura' })],
      generalExpenses: [],
      prorationWeight: 1,
    });
    expect(r.iva.debitoFiscal).toBe(19000);
    expect(r.iva.creditoFiscal).toBe(95000);
    expect(r.iva.ivaAPagar).toBe(0);
    expect(r.iva.remanenteCredito).toBe(76000);
  });
});

describe("computePnl con gastos generales prorrateados", () => {
  it("asigna solo la parte que le toca al evento", () => {
    const generales = [
      gasto({ amountTotal: 50000, category: 'suscripciones' }),
      gasto({ amountTotal: 30000, category: 'otros' }),
    ];
    const r = computePnl({
      ivaApplies: false,
      grossIncome: 700000,
      cogs: 0,
      ambassadorCommissions: 0,
      directExpenses: [],
      generalExpenses: generales,
      prorationWeight: 0.7,
    });
    expect(r.generalExpensesMonthTotal).toBe(80000);
    expect(r.generalExpensesAssigned).toBe(56000);   // 70% de 80.000
    expect(r.netProfit).toBe(700000 - 56000);
  });

  it("lo asignado entre todos los eventos del mes suma el total, sin evaporar plata", () => {
    const generales = [gasto({ amountTotal: 100000 })];
    const pesos = prorationWeights([
      { eventId: 1, grossIncome: 600000 },
      { eventId: 2, grossIncome: 400000 },
    ]);
    const asignado = [1, 2].map((id) => computePnl({
      ivaApplies: false, grossIncome: 0, cogs: 0, ambassadorCommissions: 0,
      directExpenses: [], generalExpenses: generales, prorationWeight: pesos.get(id)!,
    }).generalExpensesAssigned);

    expect(asignado.reduce((s, v) => s + v, 0)).toBe(100000);
  });

  it("agrupa los gastos directos por categoría, de mayor a menor", () => {
    const r = computePnl({
      ivaApplies: false, grossIncome: 0, cogs: 0, ambassadorCommissions: 0,
      directExpenses: [
        gasto({ amountTotal: 10000, category: 'barra' }),
        gasto({ amountTotal: 50000, category: 'staff' }),
        gasto({ amountTotal: 5000, category: 'barra' }),
      ],
      generalExpenses: [], prorationWeight: 0,
    });
    expect(r.directByCategory).toEqual([
      { category: 'staff', amount: 50000 },
      { category: 'barra', amount: 15000 },
    ]);
  });
});

describe("computePnl en los bordes", () => {
  it("un evento sin ingresos no calcula margen (evita dividir por cero)", () => {
    const r = computePnl({
      ivaApplies: false, grossIncome: 0, cogs: 0, ambassadorCommissions: 0,
      directExpenses: [gasto({ amountTotal: 80000 })], generalExpenses: [], prorationWeight: 0,
    });
    expect(r.marginPercent).toBeNull();
    expect(r.netProfit).toBe(-80000);
  });

  it("las comisiones de embajadores restan como cualquier otro costo real", () => {
    const sinComision = computePnl({
      ivaApplies: false, grossIncome: 500000, cogs: 0, ambassadorCommissions: 0,
      directExpenses: [], generalExpenses: [], prorationWeight: 0,
    });
    const conComision = computePnl({
      ivaApplies: false, grossIncome: 500000, cogs: 0, ambassadorCommissions: 25000,
      directExpenses: [], generalExpenses: [], prorationWeight: 0,
    });
    expect(sinComision.netProfit - conComision.netProfit).toBe(25000);
  });
});

describe("computePnl con comisión de tarjeta", () => {
  it("sin cardFeeBase/cardFeePercent no resta nada (compatibilidad hacia atrás)", () => {
    const r = computePnl({
      ivaApplies: false, grossIncome: 500000, cogs: 0, ambassadorCommissions: 0,
      directExpenses: [], generalExpenses: [], prorationWeight: 0,
    });
    expect(r.cardFeeAmount).toBe(0);
    expect(r.netProfit).toBe(500000);
  });

  it("descuenta el % configurado sobre la base de ventas con tarjeta", () => {
    const r = computePnl({
      ivaApplies: false, grossIncome: 1000000, cogs: 0, ambassadorCommissions: 0,
      cardFeeBase: 700000, cardFeePercent: 3.5,
      directExpenses: [], generalExpenses: [], prorationWeight: 0,
    });
    expect(r.cardFeeAmount).toBe(24500); // 3.5% de 700.000
    expect(r.netProfit).toBe(1000000 - 24500);
  });

  it("la base de comisión es independiente del ingreso total (efectivo no paga comisión)", () => {
    // $500.000 en efectivo (sin comisión) + $200.000 con tarjeta.
    const r = computePnl({
      ivaApplies: false, grossIncome: 700000, cogs: 0, ambassadorCommissions: 0,
      cardFeeBase: 200000, cardFeePercent: 3.5,
      directExpenses: [], generalExpenses: [], prorationWeight: 0,
    });
    expect(r.cardFeeAmount).toBe(7000); // 3.5% de 200.000, no de 700.000
  });
});
