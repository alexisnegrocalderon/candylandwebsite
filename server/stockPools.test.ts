import { describe, expect, it } from "vitest";
import { validateStockPoolCapacity } from "./db";

// Tanda "Founders" simulada: Dúo y Soltera comparten el pool 1 (cap 40, ya
// vendieron 38 -> quedan 2). Trío no pertenece a ningún pool (sigue con su
// propio totalStock, sin tocar esta validación).
const duo = { id: 1, stockPoolId: 1 };
const soltera = { id: 2, stockPoolId: 1 };
const trio = { id: 3, stockPoolId: null };

describe("validateStockPoolCapacity", () => {
  it("no hace nada si ningún item pertenece a un pool", () => {
    expect(() => validateStockPoolCapacity(
      [{ ticketTypeId: 3, quantity: 5 }],
      [trio],
      new Map(),
    )).not.toThrow();
  });

  it("deja pasar una compra que cabe en el remanente del pool", () => {
    expect(() => validateStockPoolCapacity(
      [{ ticketTypeId: 1, quantity: 2 }],
      [duo, soltera, trio],
      new Map([[1, { remaining: 2, name: "Founders" }]]),
    )).not.toThrow();
  });

  it("rechaza una compra que por sí sola supera el remanente", () => {
    expect(() => validateStockPoolCapacity(
      [{ ticketTypeId: 1, quantity: 3 }],
      [duo, soltera, trio],
      new Map([[1, { remaining: 2, name: "Founders" }]]),
    )).toThrow(/Quedan solo 2 cupos de "Founders"/);
  });

  it("suma cantidades de DISTINTOS accesos del mismo pool dentro de una sola orden", () => {
    // 1 Dúo (2 personas) + 1 Soltera = 2 unidades pedidas del mismo pool,
    // justo el remanente -- pasa.
    expect(() => validateStockPoolCapacity(
      [{ ticketTypeId: 1, quantity: 1 }, { ticketTypeId: 2, quantity: 1 }],
      [duo, soltera, trio],
      new Map([[1, { remaining: 2, name: "Founders" }]]),
    )).not.toThrow();

    // La misma combinación pero el remanente bajó a 1 -- ahora no alcanza,
    // aunque cada item por separado (1 unidad) luciría disponible.
    expect(() => validateStockPoolCapacity(
      [{ ticketTypeId: 1, quantity: 1 }, { ticketTypeId: 2, quantity: 1 }],
      [duo, soltera, trio],
      new Map([[1, { remaining: 1, name: "Founders" }]]),
    )).toThrow(/Quedan solo 1 cupos de "Founders"/);
  });

  it("un item de un pool que no está en poolRemainingById no bloquea la compra", () => {
    // Simula un pool borrado entre que se leyó el remanente y se validó.
    expect(() => validateStockPoolCapacity(
      [{ ticketTypeId: 1, quantity: 5 }],
      [duo, soltera, trio],
      new Map(),
    )).not.toThrow();
  });

  it("una entrada sin pool nunca se ve afectada por el remanente de otro pool", () => {
    expect(() => validateStockPoolCapacity(
      [{ ticketTypeId: 3, quantity: 100 }],
      [duo, soltera, trio],
      new Map([[1, { remaining: 0, name: "Founders" }]]),
    )).not.toThrow();
  });
});
