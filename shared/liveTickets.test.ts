import { describe, expect, it } from "vitest";
import { dropSupersededTickets } from "./liveTickets";

describe("dropSupersededTickets", () => {
  it("descarta la fila cerrada de una tanda cuando hay una activa del mismo acceso", () => {
    const rows = [
      { id: 1, category: "acceso", accesoSlug: "duo", name: "Acceso Dúo", status: "soldout", price: "24000" },
      { id: 9, category: "acceso", accesoSlug: "duo", name: "Acceso Dúo", status: "active", price: "36000" },
    ];
    expect(dropSupersededTickets(rows).map((r) => r.id)).toEqual([9]);
  });

  it("sin accesoSlug compara por nombre (sin importar mayúsculas)", () => {
    const rows = [
      { id: 1, category: "acceso", accesoSlug: null, name: "Soltera", status: "soldout" },
      { id: 2, category: "acceso", accesoSlug: null, name: "soltera ", status: "active" },
    ];
    expect(dropSupersededTickets(rows).map((r) => r.id)).toEqual([2]);
  });

  it("conserva una entrada realmente agotada (sin reemplazo activo) y las de otra categoría", () => {
    const rows = [
      { id: 1, category: "acceso", accesoSlug: "grupo", name: "Grupo", status: "soldout" },
      { id: 2, category: "extra", accesoSlug: null, name: "Grupo", status: "active" },
    ];
    expect(dropSupersededTickets(rows).map((r) => r.id)).toEqual([1, 2]);
  });
});
