import { describe, expect, it } from "vitest";
import {
  DEFAULT_BENEFITS,
  DEFAULT_COMMISSION_SCALE,
  commissionPercentForSale,
  estimateAdditionalCommission,
  isWeeklyEmailDay,
  monthKeyFor,
  nextBenefit,
  nextTierTarget,
  percentForSaleNumber,
  resolveAttribution,
  tierForSales,
  unlockedBenefits,
} from "../shared/ambassadorProgram";

const LANZAMIENTO = new Date("2026-08-01T00:00:00Z");

describe("percentForSaleNumber", () => {
  it("respeta los bordes exactos de cada tramo", () => {
    // 1-5 = 30%
    expect(percentForSaleNumber(1)).toBe(30);
    expect(percentForSaleNumber(5)).toBe(30);
    // 6-10 = 35%
    expect(percentForSaleNumber(6)).toBe(35);
    expect(percentForSaleNumber(10)).toBe(35);
    // 11-20 = 40%
    expect(percentForSaleNumber(11)).toBe(40);
    expect(percentForSaleNumber(20)).toBe(40);
    // 21-30 = 45%
    expect(percentForSaleNumber(21)).toBe(45);
    expect(percentForSaleNumber(30)).toBe(45);
    // 31+ = 50%
    expect(percentForSaleNumber(31)).toBe(50);
    expect(percentForSaleNumber(100)).toBe(50);
  });

  it("NO es retroactiva: la venta 5 sigue al 30% aunque exista la 6", () => {
    // Es la decisión del dueño y lo que evita que cambie plata ya informada.
    expect(percentForSaleNumber(5)).toBe(30);
    expect(percentForSaleNumber(6)).toBe(35);
  });

  it("no paga nada por una venta 0 o negativa", () => {
    expect(percentForSaleNumber(0)).toBe(0);
    expect(percentForSaleNumber(-3)).toBe(0);
  });

  it("acepta una escala editada desde el admin", () => {
    const escala = [
      { minSales: 1, maxSales: 2, percent: 15 },
      { minSales: 3, maxSales: null, percent: 60 },
    ];
    expect(percentForSaleNumber(2, escala)).toBe(15);
    expect(percentForSaleNumber(3, escala)).toBe(60);
    expect(percentForSaleNumber(999, escala)).toBe(60);
  });

  it("ordena la escala sola: el admin puede guardar los tramos desordenados", () => {
    const desordenada = [
      { minSales: 11, maxSales: null, percent: 40 },
      { minSales: 1, maxSales: 10, percent: 30 },
    ];
    expect(percentForSaleNumber(5, desordenada)).toBe(30);
    expect(percentForSaleNumber(50, desordenada)).toBe(40);
  });

  it("con una escala sin tramo abierto, paga el tramo más alto en vez de 0", () => {
    const truncada = [{ minSales: 1, maxSales: 5, percent: 30 }];
    expect(percentForSaleNumber(99, truncada)).toBe(30);
  });
});

describe("tierForSales y nextTierTarget", () => {
  it("sin ventas todavía no hay nivel ganado", () => {
    expect(tierForSales(0)).toBeUndefined();
  });

  it("ubica el tramo actual", () => {
    expect(tierForSales(8)?.percent).toBe(35);
    expect(tierForSales(25)?.percent).toBe(45);
  });

  it("el objetivo es la venta donde EMPIEZA el % siguiente", () => {
    // Con 8 ventas está al 35%; el 40% empieza en la 11.
    expect(nextTierTarget(8)).toEqual({ target: 11, salesNeeded: 3, nextPercent: 40 });
    expect(nextTierTarget(0)).toEqual({ target: 1, salesNeeded: 1, nextPercent: 30 });
  });

  it("en el tramo más alto ya no hay objetivo", () => {
    expect(nextTierTarget(31)).toBeNull();
    expect(nextTierTarget(500)).toBeNull();
  });
});

describe("beneficios", () => {
  it("con 0 ventas no hay ningún beneficio", () => {
    const r = unlockedBenefits(0);
    expect(r.items).toEqual([]);
    expect(r.bonusClp).toBe(0);
  });

  it("son acumulativos: quien llega a 10 tiene también lo de 5 y lo de 1", () => {
    const r = unlockedBenefits(10);
    expect(r.items).toContain('Entrada liberada');
    expect(r.items).toContain('1 acompañante');
    expect(r.items).toContain('1 botella de espumante');
    expect(r.items).toContain('2 accesos liberados para regalar');
    expect(r.tiers).toHaveLength(3);
  });

  it("el bono en plata recién aparece a las 20 ventas", () => {
    expect(unlockedBenefits(19).bonusClp).toBe(0);
    expect(unlockedBenefits(20).bonusClp).toBe(50000);
  });

  it("con 1 venta desbloquea entrada liberada y acompañante", () => {
    expect(unlockedBenefits(1).items).toEqual(['Entrada liberada', '1 acompañante']);
  });

  it("indica el próximo beneficio por alcanzar", () => {
    expect(nextBenefit(0)?.minSales).toBe(1);
    expect(nextBenefit(6)?.minSales).toBe(10);
    expect(nextBenefit(20)).toBeNull();
  });

  it("acepta beneficios editados desde el admin", () => {
    const propios = [{ minSales: 2, items: ['Gorro'], bonusClp: 1000 }];
    expect(unlockedBenefits(1, propios).items).toEqual([]);
    expect(unlockedBenefits(2, propios).items).toEqual(['Gorro']);
    expect(unlockedBenefits(2, propios).bonusClp).toBe(1000);
  });
});

describe("resolveAttribution", () => {
  it("cliente nuevo sin dueño: pasa a ser exclusivo de quien cobra", () => {
    expect(resolveAttribution({
      priorCustomerFirstSeenAt: null,
      launchDate: LANZAMIENTO,
      ownerAmbassadorId: null,
      earnerAmbassadorId: 7,
    })).toEqual({ clientType: 'exclusivo', assignsOwnership: true, countsForTier: true });
  });

  it("cliente que entró DESPUÉS del lanzamiento y no tiene dueño: exclusivo", () => {
    expect(resolveAttribution({
      priorCustomerFirstSeenAt: new Date("2026-09-15T12:00:00Z"),
      launchDate: LANZAMIENTO,
      ownerAmbassadorId: null,
      earnerAmbassadorId: 7,
    }).clientType).toBe('exclusivo');
  });

  it("cliente de la casa (ya estaba ANTES del lanzamiento): existente, 10% y sin nivel", () => {
    expect(resolveAttribution({
      priorCustomerFirstSeenAt: new Date("2026-05-01T12:00:00Z"),
      launchDate: LANZAMIENTO,
      ownerAmbassadorId: null,
      earnerAmbassadorId: 7,
    })).toEqual({ clientType: 'existente', assignsOwnership: false, countsForTier: false });
  });

  it("un cliente de la casa NUNCA pasa a ser propiedad de nadie", () => {
    const r = resolveAttribution({
      priorCustomerFirstSeenAt: new Date("2026-01-01T00:00:00Z"),
      launchDate: LANZAMIENTO,
      ownerAmbassadorId: null,
      earnerAmbassadorId: 7,
    });
    expect(r.assignsOwnership).toBe(false);
  });

  it("cliente propio que vuelve a comprar: exclusivo y suma a su nivel", () => {
    expect(resolveAttribution({
      priorCustomerFirstSeenAt: new Date("2026-09-01T00:00:00Z"),
      launchDate: LANZAMIENTO,
      ownerAmbassadorId: 7,
      earnerAmbassadorId: 7,
    })).toEqual({ clientType: 'exclusivo', assignsOwnership: false, countsForTier: true });
  });

  it("CÓDIGO CRUZADO: cobra quien trajo la venta, pero al 10% y sin subir su nivel", () => {
    // El cliente es de 7 y compra con el código de 9. Sin esta regla, dos
    // embajadores se pasan clientes entre ellos para inflar el nivel.
    const r = resolveAttribution({
      priorCustomerFirstSeenAt: new Date("2026-09-01T00:00:00Z"),
      launchDate: LANZAMIENTO,
      ownerAmbassadorId: 7,
      earnerAmbassadorId: 9,
    });
    expect(r).toEqual({ clientType: 'existente', assignsOwnership: false, countsForTier: false });
  });

  it("la propiedad nunca se transfiere en un código cruzado", () => {
    expect(resolveAttribution({
      priorCustomerFirstSeenAt: new Date("2026-09-01T00:00:00Z"),
      launchDate: LANZAMIENTO,
      ownerAmbassadorId: 7,
      earnerAmbassadorId: 9,
    }).assignsOwnership).toBe(false);
  });

  it("justo en el instante del lanzamiento cuenta como nuevo", () => {
    expect(resolveAttribution({
      priorCustomerFirstSeenAt: LANZAMIENTO,
      launchDate: LANZAMIENTO,
      ownerAmbassadorId: null,
      earnerAmbassadorId: 1,
    }).clientType).toBe('exclusivo');
  });

  it("un segundo antes del lanzamiento ya es cliente de la casa", () => {
    expect(resolveAttribution({
      priorCustomerFirstSeenAt: new Date(LANZAMIENTO.getTime() - 1000),
      launchDate: LANZAMIENTO,
      ownerAmbassadorId: null,
      earnerAmbassadorId: 1,
    }).clientType).toBe('existente');
  });
});

describe("commissionPercentForSale", () => {
  it("un cliente existente siempre paga el % fijo, sin importar el número de venta", () => {
    expect(commissionPercentForSale({ clientType: 'existente', saleNumberThisMonth: 40 })).toBe(10);
  });

  it("un cliente exclusivo paga según el número de venta del mes", () => {
    expect(commissionPercentForSale({ clientType: 'exclusivo', saleNumberThisMonth: 1 })).toBe(30);
    expect(commissionPercentForSale({ clientType: 'exclusivo', saleNumberThisMonth: 12 })).toBe(40);
  });

  it("respeta el % fijo configurado para clientes existentes", () => {
    expect(commissionPercentForSale({ clientType: 'existente', saleNumberThisMonth: 1, existingClientPercent: 7.5 })).toBe(7.5);
  });

  it("el override por embajador manda sobre la escala y sobre el % de existentes", () => {
    expect(commissionPercentForSale({ clientType: 'exclusivo', saleNumberThisMonth: 1, overridePercent: 22 })).toBe(22);
    expect(commissionPercentForSale({ clientType: 'existente', saleNumberThisMonth: 1, overridePercent: 22 })).toBe(22);
  });

  it("un override de 0 se respeta (no se confunde con 'sin override')", () => {
    expect(commissionPercentForSale({ clientType: 'exclusivo', saleNumberThisMonth: 1, overridePercent: 0 })).toBe(0);
  });

  it("null en el override significa 'usar la escala'", () => {
    expect(commissionPercentForSale({ clientType: 'exclusivo', saleNumberThisMonth: 1, overridePercent: null })).toBe(30);
  });
});

describe("monthKeyFor", () => {
  it("usa el mes de Chile, no el de UTC", () => {
    // 2026-09-01T02:00:00Z es 2026-08-31 22:00 en Chile: mes que termina.
    expect(monthKeyFor(new Date("2026-09-01T02:00:00Z"))).toBe("2026-08");
  });

  it("cruza al mes siguiente cuando de verdad cambió en Chile", () => {
    // 2026-09-01T05:00:00Z es 2026-09-01 01:00 en Chile.
    expect(monthKeyFor(new Date("2026-09-01T05:00:00Z"))).toBe("2026-09");
  });

  it("un mediodía cualquiera cae en su propio mes", () => {
    expect(monthKeyFor(new Date("2026-08-15T15:00:00Z"))).toBe("2026-08");
  });

  it("acepta la fecha como texto, igual que llega de la base", () => {
    expect(monthKeyFor("2026-08-15T15:00:00Z")).toBe("2026-08");
  });

  it("devuelve vacío ante una fecha inválida en vez de reventar", () => {
    expect(monthKeyFor("no-es-fecha")).toBe("");
  });
});

describe("isWeeklyEmailDay", () => {
  it("detecta el lunes en hora de Chile", () => {
    // 2026-08-03 fue lunes.
    expect(isWeeklyEmailDay(new Date("2026-08-03T15:00:00Z"))).toBe(true);
    expect(isWeeklyEmailDay(new Date("2026-08-04T15:00:00Z"))).toBe(false);
  });

  it("un domingo a las 23:00 de Chile todavía NO es lunes", () => {
    // 2026-08-03T02:00:00Z = domingo 2 a las 22:00 en Chile.
    expect(isWeeklyEmailDay(new Date("2026-08-03T02:00:00Z"))).toBe(false);
  });

  it("permite configurar otro día de la semana", () => {
    // Viernes = 5.
    expect(isWeeklyEmailDay(new Date("2026-08-07T15:00:00Z"), 5)).toBe(true);
  });
});

describe("valores por defecto", () => {
  it("la escala por defecto es la que definió el dueño", () => {
    expect(DEFAULT_COMMISSION_SCALE.map((t) => t.percent)).toEqual([30, 35, 40, 45, 50]);
    expect(DEFAULT_COMMISSION_SCALE[DEFAULT_COMMISSION_SCALE.length - 1].maxSales).toBeNull();
  });

  it("los tramos no dejan huecos ni se solapan", () => {
    for (let i = 1; i < DEFAULT_COMMISSION_SCALE.length; i++) {
      const previo = DEFAULT_COMMISSION_SCALE[i - 1];
      expect(previo.maxSales).not.toBeNull();
      expect(DEFAULT_COMMISSION_SCALE[i].minSales).toBe((previo.maxSales as number) + 1);
    }
  });

  it("los beneficios por defecto arrancan en 1 venta y el bono está en 20", () => {
    expect(DEFAULT_BENEFITS[0].minSales).toBe(1);
    expect(DEFAULT_BENEFITS.find((b) => b.bonusClp > 0)?.minSales).toBe(20);
  });
});

describe("estimateAdditionalCommission", () => {
  it("sin ventas previas, suma correctamente dentro de un mismo tramo", () => {
    // 3 ventas más, arrancando de 0 -> ventas 1,2,3, todas al 30%
    const r = estimateAdditionalCommission({ currentMonthlySales: 0, additionalSales: 3, avgSalePrice: 30_000 });
    expect(r.breakdown.map((b) => b.percent)).toEqual([30, 30, 30]);
    expect(r.total).toBe(3 * Math.round(30_000 * 0.3));
  });

  it("cruza de tramo a mitad de la simulación: no aplica el % final a todas", () => {
    // Ya lleva 4 ventas este mes, simula 3 más -> ventas 5 (30%), 6 y 7 (35%)
    const r = estimateAdditionalCommission({ currentMonthlySales: 4, additionalSales: 3, avgSalePrice: 40_000 });
    expect(r.breakdown.map((b) => ({ saleNumber: b.saleNumber, percent: b.percent }))).toEqual([
      { saleNumber: 5, percent: 30 },
      { saleNumber: 6, percent: 35 },
      { saleNumber: 7, percent: 35 },
    ]);
    const esperado = Math.round(40_000 * 0.3) + Math.round(40_000 * 0.35) * 2;
    expect(r.total).toBe(esperado);
    // La forma incorrecta (aplicar 35% a las 3) sobrestimaría el total.
    expect(r.total).toBeLessThan(Math.round(3 * 40_000 * 0.35));
  });

  it("con override, paga el % fijo en todas las ventas simuladas sin mirar la escala", () => {
    const r = estimateAdditionalCommission({
      currentMonthlySales: 0, additionalSales: 2, avgSalePrice: 50_000, overridePercent: 20,
    });
    expect(r.breakdown.every((b) => b.percent === 20)).toBe(true);
    expect(r.total).toBe(2 * Math.round(50_000 * 0.2));
  });

  it("con 0 ventas adicionales, no hay nada que estimar", () => {
    expect(estimateAdditionalCommission({ currentMonthlySales: 5, additionalSales: 0, avgSalePrice: 30_000 })).toEqual({ total: 0, breakdown: [] });
  });

  it("con precio promedio inválido, no revienta", () => {
    expect(estimateAdditionalCommission({ currentMonthlySales: 0, additionalSales: 3, avgSalePrice: 0 })).toEqual({ total: 0, breakdown: [] });
    expect(estimateAdditionalCommission({ currentMonthlySales: 0, additionalSales: -1, avgSalePrice: 30_000 })).toEqual({ total: 0, breakdown: [] });
  });
});
